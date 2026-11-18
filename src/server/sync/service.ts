import { createHash, randomUUID } from "node:crypto";
import type { Client } from "pg";
import {
  operationResultSchema,
  operationSchema,
  snapshotResponseSchema,
  uuidSchema,
  type Card,
  type Deck,
  type Introduction,
  type OperationResult,
  type Progress,
  type PullResponse,
  type SnapshotResponse,
} from "../../contracts";
import {
  account,
  accountTransaction,
  cardFields,
  deckFields,
  introductionFields,
  progressFields,
  getSettings,
  SyncFailure,
  toJsonRecord,
  withDatabase,
} from "./database";
import { appendChanges, mutate } from "./mutations";

export async function push(
  userId: string,
  deviceId: string,
  values: unknown[],
  now: string,
) {
  // Validate all IDs before starting any transaction for a partial batch.
  const entries = values.map((value) => {
    const id = uuidSchema.safeParse(
      value && typeof value === "object" && "id" in value
        ? value.id
        : undefined,
    );
    if (!id.success)
      throw new SyncFailure(
        422,
        "invalid_envelope",
        "Operacja wymaga prawidłowego ID",
      );
    return { id: id.data, operation: operationSchema.safeParse(value) };
  });
  return withDatabase(async (db) => {
    const results: OperationResult[] = [];
    for (const { id, operation } of entries) {
      if (!operation.success) {
        results.push({
          operationId: id,
          status: "rejected",
          error: "invalid_payload",
        });
        continue;
      }
      results.push(
        await accountTransaction(db, userId, async () => {
          await db.query("select recallio_private.lock_sync_account()");
          const hash = createHash("sha256")
            .update(
              JSON.stringify([
                operation.data,
                operation.data.type === "review.record" ? deviceId : null,
              ]),
            )
            .digest();
          const receipt = await db.query<{ result: unknown; same: boolean }>(
            `select result, payload_hash = $2 as same from recallio_private.operation_receipts
           where user_id=${account} and operation_id=$1`,
            [id, hash],
          );
          const prior = receipt.rows[0];
          if (prior) {
            if (!prior.same)
              return { operationId: id, status: "rejected", error: "id_reuse" };
            const result = operationResultSchema.parse(prior.result);
            return result.status === "applied"
              ? { ...result, status: "duplicate" }
              : result;
          }

          const mutation = await mutate(
            db,
            operation.data,
            userId,
            deviceId,
            now,
          );
          let result: OperationResult;
          if (Array.isArray(mutation)) {
            const last = mutation.at(-1)!;
            result = {
              operationId: id,
              status: "applied",
              commitCursor: await appendChanges(db, mutation),
              revision: last.revision,
            };
            if (operation.data.type === "review.record") {
              const projection = mutation.find(
                (change) => change.entity === "progress",
              );
              result.revision = projection?.revision;
            } else {
              result.entity = last.payload;
            }
          } else {
            const { error, current } = mutation;
            result = {
              operationId: id,
              status:
                error === "revision_conflict" || error === "entity_deleted"
                  ? "conflict"
                  : "rejected",
              error,
              entity: current,
            };
          }
          if (result.error !== "dependency_pending") {
            await db.query(
              `insert into recallio_private.operation_receipts (user_id,operation_id,payload_hash,result)
             values (${account},$1,$2,$3)`,
              [id, hash, JSON.stringify(result)],
            );
          }
          return result;
        }),
      );
    }
    return { results, serverTime: now };
  });
}

export async function pull(
  userId: string,
  cursor: string,
  limit: number,
  now: string,
): Promise<PullResponse> {
  return withDatabase((db) =>
    accountTransaction(
      db,
      userId,
      async () => {
        const { rows } = await db.query<PullResponse["changes"][number]>(
          `select sequence::text, entity, entity_id as "entityId", revision::text, payload, deleted
       from recallio_private.change_log where user_id=${account} and sequence > $1
       order by sequence limit $2`,
          [cursor, limit + 1],
        );
        const changes = rows.slice(0, limit);
        return {
          changes,
          nextCursor: changes.at(-1)?.sequence ?? cursor,
          hasMore: rows.length > limit,
          serverTime: now,
        };
      },
      true,
    ),
  );
}

type PageContent = Pick<
  SnapshotResponse,
  "decks" | "cards" | "progress" | "introductions" | "settings"
>;
type Collection = Exclude<keyof PageContent, "settings">;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_SNAPSHOT_BYTES = 28 * 1024 * 1024;

async function capture(db: Client): Promise<PageContent[]> {
  const rows = {
    decks: (
      await db.query<Deck>(
        `select ${deckFields} from public.decks where user_id=${account} order by id`,
      )
    ).rows,
    cards: (
      await db.query<Card>(
        `select ${cardFields} from public.cards where user_id=${account} order by id`,
      )
    ).rows,
    progress: (
      await db.query<Progress>(
        `select ${progressFields} from public.progress where user_id=${account} order by card_id,direction`,
      )
    ).rows,
    introductions: (
      await db.query<Introduction>(
        `select ${introductionFields} from public.introductions where user_id=${account} order by card_id`,
      )
    ).rows,
  };
  const settings = await getSettings(db);
  const empty = (): PageContent => ({
    decks: [],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
  });
  const pages = [empty()];
  let bytes = Buffer.byteLength(JSON.stringify(settings), "utf8");
  let total = bytes;
  pages[0].settings = settings;
  for (const collection of Object.keys(rows) as Collection[]) {
    for (const row of rows[collection]) {
      const size = Buffer.byteLength(JSON.stringify(row), "utf8") + 1;
      if (total + size > MAX_SNAPSHOT_BYTES) {
        throw new SyncFailure(
          413,
          "payload_too_large",
          "Dane konta przekraczają limit snapshotu",
        );
      }
      if (bytes + size > MAX_PAGE_BYTES) {
        pages.push(empty());
        bytes = 0;
      }
      (pages.at(-1)![collection] as unknown[]).push(row);
      total += size;
      bytes += size;
    }
  }
  return toJsonRecord(pages);
}

export async function snapshot(
  userId: string,
  token?: string,
  pageToken?: string,
): Promise<SnapshotResponse> {
  return withDatabase((db) =>
    accountTransaction(
      db,
      userId,
      async () => {
        let id: string;
        let saved: { watermark: string; page: PageContent; pageCount: number };
        let index = 0;
        if (token) {
          const parsed = uuidSchema.safeParse(token);
          if (
            !parsed.success ||
            (pageToken !== undefined && !/^(0|[1-9]\d{0,4})$/.test(pageToken))
          ) {
            throw new SyncFailure(
              422,
              "invalid_envelope",
              "Nieprawidłowy token snapshotu",
            );
          }
          id = parsed.data;
          index = Number(pageToken ?? "0");
          const { rows } = await db.query<typeof saved>(
            `select watermark::text, pages -> $2::integer as page,
              jsonb_array_length(pages) as "pageCount" from recallio_private.snapshots
         where user_id=${account} and id=$1 and expires_at > now()`,
            [id, index],
          );
          if (!rows[0]?.page) {
            throw new SyncFailure(
              409,
              "protocol_conflict",
              "Snapshot wygasł lub jest niedostępny",
            );
          }
          saved = rows[0];
        } else {
          id = randomUUID();
          const { rows } = await db.query<{ last_sequence: string }>(
            `select last_sequence::text from recallio_private.sync_heads where user_id=${account}`,
          );
          await db.query(
            `delete from recallio_private.snapshots where user_id=${account} and expires_at <= now()`,
          );
          const active = await db.query<{ count: number }>(
            `select count(*)::integer as count from recallio_private.snapshots where user_id=${account}`,
          );
          if (active.rows[0].count >= 10) {
            throw new SyncFailure(
              429,
              "rate_limited",
              "Osiągnięto limit aktywnych snapshotów",
            );
          }
          const pages = await capture(db);
          saved = {
            watermark: rows[0]?.last_sequence ?? "0",
            page: pages[0],
            pageCount: pages.length,
          };
          await db.query(
            `insert into recallio_private.snapshots (user_id,id,watermark,pages,expires_at)
             values (${account},$1,$2,$3,now() + interval '10 minutes')`,
            [id, saved.watermark, JSON.stringify(pages)],
          );
        }
        return snapshotResponseSchema.parse({
          ...saved.page,
          watermark: saved.watermark,
          snapshotToken: id,
          nextPage: index + 1 < saved.pageCount ? String(index + 1) : null,
        });
      },
      true,
    ),
  );
}
