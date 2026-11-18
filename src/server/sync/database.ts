import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Socket } from "node:net";
import { Client } from "pg";
import { settingsSchema, type Settings } from "../../contracts";

export const account = "recallio_private.account_id()";

export class SyncFailure extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "unauthorized"
      | "protocol_conflict"
      | "payload_too_large"
      | "invalid_envelope"
      | "upgrade_required"
      | "rate_limited"
      | "retry_later",
    message: string,
  ) {
    super(message);
  }
}

export async function withDatabase<T>(
  run: (db: Client) => Promise<T>,
): Promise<T> {
  let connectionString = process.env.RECALLIO_DATABASE_URL;
  const workers =
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers";
  if (workers) {
    const { env } = getCloudflareContext();
    connectionString =
      (env as { RECALLIO_DB?: { connectionString: string } }).RECALLIO_DB
        ?.connectionString ?? connectionString;
  }
  if (!connectionString)
    throw new SyncFailure(
      503,
      "retry_later",
      "Synchronizacja jest niedostępna",
    );
  const db = new Client({
    connectionString,
    connectionTimeoutMillis: 4_000,
    statement_timeout: 6_000,
    // Next resolves pg's workerd-only socket package to its Node stub.
    ...(workers && { stream: () => new Socket() }),
  });
  try {
    await db.connect();
    return await run(db);
  } finally {
    await db.end();
  }
}

export async function accountTransaction<T>(
  db: Client,
  userId: string,
  run: () => Promise<T>,
  consistentRead = false,
): Promise<T> {
  await db.query(
    consistentRead ? "begin isolation level repeatable read" : "begin",
  );
  try {
    await db.query("set local role recallio_backend");
    await db.query("select set_config('recallio.user_id', $1, true)", [userId]);
    const result = await run();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export const deckFields =
  'id, name, direction_mode as "directionMode", revision::text, deleted_at as "deletedAt"';
export const cardFields = `id, deck_id as "deckId", side_a as "sideA", side_b as "sideB",
  example_a as "exampleA", example_b as "exampleB", revision::text as "contentRevision", deleted_at as "deletedAt"`;
export const progressFields = `card_id as "cardId", direction, epoch::text, due_at as "dueAt",
  last_effective_at as "lastEffectiveAt", scheduler_state as "schedulerState",
  algorithm_version as "algorithmVersion", revision::text`;
export async function getSettings(db: Client): Promise<Settings | null> {
  const { rows } = await db.query(
    `select timezone, new_limit as "newLimit", show_due as "showDue",
       show_session as "showSession", revision::text, timezone_changes as "timezoneChanges"
       from public.user_settings where user_id=${account}`,
  );
  if (!rows[0]) return null;
  const { timezoneChanges, ...settings } = rows[0];
  return settingsSchema.parse({
    ...settings,
    ...(timezoneChanges && { timezoneChanges }),
  });
}
export const introductionFields = `card_id as "cardId", first_effective_at as "firstEffectiveAt",
  study_day::text as "studyDay"`;

export function toJsonRecord<T>(row: T): T {
  return JSON.parse(JSON.stringify(row));
}
