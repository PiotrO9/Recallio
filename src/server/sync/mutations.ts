import type { Client } from "pg";
import type {
  Card,
  Deck,
  Operation,
  OperationResult,
  Progress,
  Settings,
} from "../../contracts";
import { getStudyDay } from "../../domain/learning/queue";
import {
  FSRS_VERSION,
  fsrsScheduler,
  getEffectiveReviewTime,
  resetFsrsProgress,
} from "../../domain/learning/scheduler";
import {
  account,
  cardFields,
  deckFields,
  progressFields,
  settingsFields,
  toJsonRecord,
} from "./database";

type FailureCode = NonNullable<OperationResult["error"]>;
type Change = {
  entity:
    | "deck"
    | "card"
    | "progress"
    | "review"
    | "reset"
    | "introduction"
    | "settings";
  id: string;
  revision: string;
  payload: object;
  deleted?: boolean;
};
type Mutation = Change[] | { error: FailureCode; current?: object };
type DeckOperation = Extract<Operation, { type: `deck.${string}` }>;
type CardOperation = Extract<Operation, { type: `card.${string}` }>;

async function findDeck(db: Client, id: string) {
  const { rows } = await db.query<Deck>(
    `select ${deckFields} from public.decks where user_id = ${account} and id = $1`,
    [id],
  );
  return toJsonRecord(rows[0] ?? null);
}

async function findCard(db: Client, id: string) {
  const { rows } = await db.query<Card>(
    `select ${cardFields} from public.cards where user_id = ${account} and id = $1`,
    [id],
  );
  return toJsonRecord(rows[0] ?? null);
}

async function findProgress(db: Client, id: string, direction: string) {
  const { rows } = await db.query<Progress>(
    `select ${progressFields} from public.progress
      where user_id = ${account} and card_id = $1 and direction = $2`,
    [id, direction],
  );
  return toJsonRecord(rows[0] ?? null);
}

async function deckMutation(
  db: Client,
  operation: DeckOperation,
  now: string,
): Promise<Mutation> {
  const id = operation.entityId;
  const current = await findDeck(db, id);
  if (current?.deletedAt) return { error: "entity_deleted", current };
  if (operation.type === "deck.create") {
    if (current) return { error: "revision_conflict", current };
    await db.query(
      `insert into public.decks (user_id,id,name,direction_mode,revision)
       values (${account},$1,$2,$3,0)`,
      [id, operation.payload.name, operation.payload.directionMode],
    );
  } else {
    if (!current) return { error: "dependency_pending" };
    if (current.revision !== operation.baseRevision)
      return { error: "revision_conflict", current };
    if (operation.type === "deck.delete") {
      await db.query(
        `update public.decks set deleted_at=$2,revision=revision+1 where user_id=${account} and id=$1`,
        [id, now],
      );
    } else {
      await db.query(
        `update public.decks set name=$2,direction_mode=$3,revision=revision+1 where user_id=${account} and id=$1`,
        [id, operation.payload.name, operation.payload.directionMode],
      );
    }
  }
  const deck = (await findDeck(db, id))!;
  return [
    {
      entity: "deck",
      id,
      revision: deck.revision,
      payload: deck,
      deleted: !!deck.deletedAt,
    },
  ];
}

async function cardMutation(
  db: Client,
  operation: CardOperation,
  now: string,
): Promise<Mutation> {
  const id = operation.entityId;
  const current = await findCard(db, id);
  const parentId =
    operation.type === "card.create"
      ? operation.payload.deckId
      : current?.deckId;
  const parent = parentId ? await findDeck(db, parentId) : null;
  if (current?.deletedAt || parent?.deletedAt)
    return { error: "entity_deleted", current: current ?? undefined };
  if (!parent) return { error: "dependency_pending" };
  if (operation.type === "card.create") {
    if (current) return { error: "revision_conflict", current };
    const { deckId, sideA, sideB, exampleA, exampleB } = operation.payload;
    await db.query(
      `insert into public.cards (user_id,id,deck_id,side_a,side_b,example_a,example_b,revision)
       values (${account},$1,$2,$3,$4,$5,$6,0)`,
      [id, deckId, sideA, sideB, exampleA, exampleB],
    );
  } else {
    if (!current) return { error: "dependency_pending" };
    if (current.contentRevision !== operation.baseRevision)
      return { error: "revision_conflict", current };
    if (operation.type === "card.delete") {
      await db.query(
        `update public.cards set deleted_at=$2,revision=revision+1 where user_id=${account} and id=$1`,
        [id, now],
      );
    } else {
      const { sideA, sideB, exampleA, exampleB } = operation.payload;
      await db.query(
        `update public.cards set side_a=$2,side_b=$3,example_a=$4,example_b=$5,revision=revision+1
         where user_id=${account} and id=$1`,
        [id, sideA, sideB, exampleA, exampleB],
      );
    }
  }
  const card = (await findCard(db, id))!;
  return [
    {
      entity: "card",
      id,
      revision: card.contentRevision,
      payload: card,
      deleted: !!card.deletedAt,
    },
  ];
}

async function getSettings(db: Client) {
  const { rows } = await db.query<Settings>(
    `select ${settingsFields} from public.user_settings where user_id=${account}`,
  );
  return rows[0] ?? null;
}

async function saveProgress(db: Client, next: Progress) {
  await db.query(
    `insert into public.progress (user_id,card_id,direction,epoch,due_at,last_effective_at,scheduler_state,algorithm_version,revision)
     values (${account},$1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (user_id,card_id,direction) do update set epoch=excluded.epoch,due_at=excluded.due_at,
       last_effective_at=excluded.last_effective_at,scheduler_state=excluded.scheduler_state,
       algorithm_version=excluded.algorithm_version,revision=excluded.revision`,
    [
      next.cardId,
      next.direction,
      next.epoch,
      next.dueAt,
      next.lastEffectiveAt,
      JSON.stringify(next.schedulerState),
      next.algorithmVersion,
      next.revision,
    ],
  );
}

async function reviewMutation(
  db: Client,
  operation: Extract<Operation, { type: "review.record" }>,
  deviceId: string,
  receivedAt: string,
): Promise<Mutation> {
  const { payload } = operation;
  if (payload.algorithmVersion !== FSRS_VERSION)
    return { error: "invalid_payload" };
  const card = await findCard(db, operation.entityId);
  if (!card) return { error: "dependency_pending" };
  const deck = (await findDeck(db, card.deckId))!;
  const previous = await findProgress(db, card.id, payload.direction);
  const epoch = BigInt(previous?.epoch ?? "0");
  if (BigInt(payload.epoch) > epoch && !card.deletedAt && !deck.deletedAt) {
    return { error: "dependency_pending" };
  }
  const disposition =
    card.deletedAt || deck.deletedAt
      ? "ignored_deleted"
      : BigInt(payload.epoch) < epoch
        ? "ignored_old_epoch"
        : "applied";
  const event = { ...payload, id: operation.id, cardId: card.id, deviceId };
  const effectiveAt =
    disposition === "applied"
      ? getEffectiveReviewTime(payload.occurredAt, receivedAt, previous)
      : null;
  const canonicalMode = effectiveAt
    ? fsrsScheduler.classify(previous, effectiveAt)
    : null;
  const changes: Change[] = [];
  let introduction:
    { cardId: string; firstEffectiveAt: string; studyDay: string } | undefined;
  if (canonicalMode === "introduction" && effectiveAt) {
    const found = await db.query(
      `select 1 from public.introductions where user_id=${account} and card_id=$1`,
      [card.id],
    );
    if (!found.rowCount) {
      const settings = await getSettings(db);
      if (!settings) return { error: "dependency_pending" };
      introduction = {
        cardId: card.id,
        firstEffectiveAt: effectiveAt,
        studyDay: getStudyDay(effectiveAt, settings.timezone),
      };
    }
  }
  const inserted = await db.query(
    `insert into public.review_events
     (user_id,id,card_id,direction,epoch,rating,observed_mode,canonical_mode,device_id,client_seq,
      occurred_at,received_at,effective_at,observed_content_revision,observed_progress_revision,algorithm_version,disposition)
     values (${account},$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict do nothing returning id`,
    [
      event.id,
      card.id,
      payload.direction,
      payload.epoch,
      payload.rating,
      payload.observedMode,
      canonicalMode,
      deviceId,
      payload.clientSeq,
      payload.occurredAt,
      receivedAt,
      effectiveAt,
      payload.observedContentRevision,
      payload.observedProgressRevision,
      payload.algorithmVersion,
      disposition,
    ],
  );
  if (!inserted.rowCount) return { error: "id_reuse" };
  changes.push({
    entity: "review",
    id: event.id,
    revision: "0",
    payload: { event, receivedAt, effectiveAt, canonicalMode, disposition },
  });
  if (effectiveAt && canonicalMode) {
    const progress = fsrsScheduler.review({
      previous,
      event,
      effectiveAt,
      mode: canonicalMode,
    });
    await saveProgress(db, progress);
    changes.push({
      entity: "progress",
      id: card.id,
      revision: progress.revision,
      payload: progress,
    });
  }
  if (introduction) {
    await db.query(
      `insert into public.introductions (user_id,card_id,first_effective_at,study_day)
       values (${account},$1,$2,$3)`,
      [card.id, introduction.firstEffectiveAt, introduction.studyDay],
    );
    changes.push({
      entity: "introduction",
      id: card.id,
      revision: "0",
      payload: introduction,
    });
  }
  return changes;
}

async function resetMutation(
  db: Client,
  operation: Extract<Operation, { type: "progress.reset" }>,
): Promise<Mutation> {
  const card = await findCard(db, operation.entityId);
  if (!card) return { error: "dependency_pending" };
  if (card.deletedAt || (await findDeck(db, card.deckId))?.deletedAt)
    return { error: "entity_deleted" };
  const previous = await findProgress(db, card.id, operation.payload.direction);
  if (!previous) return { error: "dependency_pending" };
  if (
    previous.revision !== operation.baseRevision ||
    BigInt(operation.payload.epoch) !== BigInt(previous.epoch) + 1n
  ) {
    return { error: "revision_conflict", current: previous };
  }
  const next = resetFsrsProgress(previous, operation.payload.epoch);
  await saveProgress(db, next);
  return [
    { entity: "reset", id: card.id, revision: next.revision, payload: next },
  ];
}

export async function mutate(
  db: Client,
  operation: Operation,
  userId: string,
  deviceId: string,
  now: string,
): Promise<Mutation> {
  switch (operation.type) {
    case "deck.create":
    case "deck.update":
    case "deck.delete":
      return deckMutation(db, operation, now);
    case "card.create":
    case "card.update":
    case "card.delete":
      return cardMutation(db, operation, now);
    case "review.record":
      return reviewMutation(db, operation, deviceId, now);
    case "progress.reset":
      return resetMutation(db, operation);
    case "settings.update": {
      if (operation.entityId !== userId) return { error: "invalid_payload" };
      try {
        getStudyDay(now, operation.payload.timezone);
      } catch (error) {
        if (error instanceof RangeError) return { error: "invalid_payload" };
        throw error;
      }
      const current = await getSettings(db);
      if ((current?.revision ?? "0") !== operation.baseRevision) {
        return { error: "revision_conflict", current: current ?? undefined };
      }
      const { timezone, newLimit, showDue, showSession } = operation.payload;
      const revision = (BigInt(operation.baseRevision) + 1n).toString();
      await db.query(
        `insert into public.user_settings (user_id,timezone,new_limit,show_due,show_session,revision)
         values (${account},$1,$2,$3,$4,$5) on conflict (user_id) do update set
         timezone=excluded.timezone,new_limit=excluded.new_limit,show_due=excluded.show_due,
         show_session=excluded.show_session,revision=excluded.revision`,
        [timezone, newLimit, showDue, showSession, revision],
      );
      return [
        {
          entity: "settings",
          id: userId,
          revision,
          payload: { ...operation.payload, revision },
        },
      ];
    }
  }
}

export async function appendChanges(
  db: Client,
  changes: Change[],
): Promise<string> {
  let cursor = "0";
  for (const change of changes) {
    const result = await db.query<{ cursor: string }>(
      "select recallio_private.next_sync_cursor()::text as cursor",
    );
    cursor = result.rows[0].cursor;
    await db.query(
      `insert into recallio_private.change_log (user_id,sequence,entity,entity_id,revision,payload,deleted)
       values (${account},$1,$2,$3,$4,$5,$6)`,
      [
        cursor,
        change.entity,
        change.id,
        change.revision,
        JSON.stringify(change.payload),
        change.deleted ?? false,
      ],
    );
    if (change.entity === "reset") {
      const progress = change.payload as Progress;
      await db.query(
        `insert into recallio_private.progress_resets (user_id,card_id,direction,epoch,server_order)
         values (${account},$1,$2,$3,$4)`,
        [progress.cardId, progress.direction, progress.epoch, cursor],
      );
    }
  }
  return cursor;
}
