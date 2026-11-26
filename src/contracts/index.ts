import {
  MAX_CARD_SIDE_LENGTH,
  MAX_CARD_EXAMPLE_LENGTH,
  MAX_DECK_NAME_LENGTH,
} from "../domain/content-limits";
import { STUDY_TIMEZONE } from "../domain/learning/study-time";
import { z } from "zod";

// Decimal strings prevent loss of bigint precision during JSON transport.
export const revisionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine(
    (v) => /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n,
    "Poza zakresem bigint",
  );
export const uuidSchema = z.uuid();
export const instantSchema = z.iso.datetime({ offset: false });
export const directionSchema = z.enum(["a-b", "b-a"]);
export const repairResponseSchema = z.strictObject({
  asOf: instantSchema,
  items: z.array(
    z.strictObject({
      cardId: uuidSchema,
      deckId: uuidSchema,
      directions: z
        .array(
          z.strictObject({
            direction: directionSchema,
            epoch: revisionSchema,
            failedDays: z.int().min(3).max(30),
            lastFailedDay: z.iso.date(),
          }),
        )
        .min(1)
        .max(2),
    }),
  ),
});
export type RepairResponse = z.infer<typeof repairResponseSchema>;
export const directionModeSchema = z.enum(["a-b", "b-a", "mixed"]);
export const reviewModeSchema = z.enum(["introduction", "due", "practice"]);
export const ratingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
const content = z
  .string()
  .max(MAX_CARD_SIDE_LENGTH)
  .refine((value) => value.trim().length > 0, "Pole jest wymagane");
const example = z.string().max(MAX_CARD_EXAMPLE_LENGTH).nullable();
const name = z
  .string()
  .max(MAX_DECK_NAME_LENGTH)
  .refine((value) => value.trim().length > 0);
const cardContent = z.strictObject({
  sideA: content,
  sideB: content,
  exampleA: example,
  exampleB: example,
});
const deckContent = z.strictObject({
  name,
  directionMode: directionModeSchema,
});
const base = { id: uuidSchema, entityId: uuidSchema };
const changed = { ...base, baseRevision: revisionSchema };
export const operationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("deck.create"),
    payload: deckContent,
  }),
  z.strictObject({
    ...changed,
    type: z.literal("deck.update"),
    payload: deckContent,
  }),
  z.strictObject({
    ...changed,
    type: z.literal("deck.delete"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...base,
    type: z.literal("card.create"),
    payload: cardContent.extend({ deckId: uuidSchema }),
  }),
  z.strictObject({
    ...changed,
    type: z.literal("card.update"),
    payload: cardContent,
  }),
  z.strictObject({
    ...changed,
    type: z.literal("card.delete"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...base,
    type: z.literal("review.record"),
    payload: z.strictObject({
      direction: directionSchema,
      rating: ratingSchema,
      observedMode: reviewModeSchema,
      occurredAt: instantSchema,
      clientSeq: revisionSchema,
      observedContentRevision: revisionSchema,
      observedProgressRevision: revisionSchema.nullable(),
      epoch: revisionSchema,
      algorithmVersion: z.string().min(1).max(100),
    }),
  }),
  z.strictObject({
    ...changed,
    type: z.literal("progress.reset"),
    payload: z.strictObject({
      direction: directionSchema,
      epoch: revisionSchema,
    }),
  }),
  z.strictObject({
    ...changed,
    type: z.literal("settings.update"),
    payload: z.strictObject({
      timezone: z.string().min(1).max(100),
      newLimit: z.number().int().min(0).max(10000),
      showDue: z.boolean(),
      showSession: z.boolean(),
    }),
  }),
]);
// Envelope validation is separate from per-operation validation: one malformed
// operation must not prevent other operations in an otherwise valid batch.
export const pushEnvelopeSchema = z.strictObject({
  protocolVersion: z.literal(1),
  deviceId: uuidSchema,
  operations: z.array(z.unknown()).min(1).max(100),
});
export const pushSchema = z.strictObject({
  protocolVersion: z.literal(1),
  deviceId: uuidSchema,
  operations: z.array(operationSchema).min(1).max(100),
});
export const MAX_PUSH_BYTES = 1024 * 1024;
/** Enforce the byte limit on the unmodified HTTP body before JSON decoding. */
export function parsePushBody(body: string): PushEnvelope {
  if (new TextEncoder().encode(body).byteLength > MAX_PUSH_BYTES)
    throw new RangeError("payload_too_large");
  return pushSchema.parse(JSON.parse(body));
}
export const operationErrorSchema = z.enum([
  "revision_conflict",
  "entity_deleted",
  "invalid_payload",
  "id_reuse",
  "dependency_pending",
]);
export const operationResultSchema = z
  .strictObject({
    operationId: uuidSchema,
    status: z.enum(["applied", "duplicate", "conflict", "rejected"]),
    commitCursor: revisionSchema.optional(),
    revision: revisionSchema.optional(),
    entity: z.unknown().optional(),
    error: operationErrorSchema.optional(),
  })
  .refine(
    (value) =>
      (value.status === "applied" || value.status === "duplicate") ===
      (value.commitCursor !== undefined),
    "Kursor jest wymagany dla zapisanej operacji i niedozwolony dla niezapisanej",
  );
export const pushResponseSchema = z.strictObject({
  results: z.array(operationResultSchema),
  serverTime: instantSchema,
});
export type Direction = z.infer<typeof directionSchema>;
export type DirectionMode = z.infer<typeof directionModeSchema>;
export type Rating = z.infer<typeof ratingSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type ContentOperation = Exclude<
  Operation,
  { type: "review.record" | "progress.reset" }
>;
export type ResetOperation = Extract<Operation, { type: "progress.reset" }>;
export type PushEnvelope = z.infer<typeof pushSchema>;
export type OperationResult = z.infer<typeof operationResultSchema>;
export interface Card {
  id: string;
  deckId: string;
  sideA: string;
  sideB: string;
  exampleA: string | null;
  exampleB: string | null;
  contentRevision: string;
  deletedAt: string | null;
}
export interface ReviewEvent {
  id: string;
  cardId: string;
  direction: Direction;
  rating: Rating;
  observedMode: z.infer<typeof reviewModeSchema>;
  occurredAt: string;
  deviceId: string;
  clientSeq: string;
  observedContentRevision: string;
  observedProgressRevision: string | null;
  epoch: string;
  algorithmVersion: string;
}
export interface Progress {
  cardId: string;
  direction: Direction;
  epoch: string;
  dueAt: string;
  lastEffectiveAt: string;
  schedulerState: { version: string; data: unknown };
  revision: string;
  algorithmVersion: string;
}
export interface Candidate {
  card: Card;
  direction: Direction;
  epoch: string;
  mode: z.infer<typeof reviewModeSchema>;
}
export interface Scheduler {
  readonly version: string;
  /** Classify persisted state, including a reset already present in a snapshot. */
  classify?(previous: Progress | null, effectiveAt: string): Candidate["mode"];
  review(input: {
    previous: Progress | null;
    event: ReviewEvent;
    effectiveAt: string;
    mode: Candidate["mode"];
  }): Progress;
}
export type SessionReturn = Pick<ReviewEvent, "cardId" | "direction" | "epoch">;

export interface QueuePolicy {
  next(input: {
    cards: readonly Card[];
    progress: readonly Progress[];
    now: string;
    direction: DirectionMode;
    previousCardId: string | null;
    sessionReturns: readonly SessionReturn[];
    introducedCardIds: ReadonlySet<string>;
    remainingNew: number;
    random: () => number;
  }): Candidate | null;
}
export interface PreparedReview {
  event: ReviewEvent;
  progress: Progress;
  operation: Extract<Operation, { type: "review.record" }>;
  /** Device-local compare-and-swap version; never sent to the server. */
  localVersion: string;
}
export interface CommitReceipt {
  eventId: string;
  committedAt: string;
}
export interface LearningSnapshot {
  cards: readonly Card[];
  progress: readonly Progress[];
}
export interface LearningRepository {
  readProgressVersion(
    cardId: string,
    direction: Direction,
  ): Promise<{ progress: Progress | null; localVersion: string }>;
  commitReview(command: PreparedReview): Promise<CommitReceipt>;
  snapshot(deckId: string): Promise<LearningSnapshot>;
}

// Runtime validation for records crossing API/storage boundaries.
export const cardSchema = cardContent.extend({
  id: uuidSchema,
  deckId: uuidSchema,
  contentRevision: revisionSchema,
  deletedAt: instantSchema.nullable(),
});
export const deckSchema = deckContent.extend({
  id: uuidSchema,
  revision: revisionSchema,
  deletedAt: instantSchema.nullable(),
});
export const reviewEventSchema = z.strictObject({
  id: uuidSchema,
  cardId: uuidSchema,
  direction: directionSchema,
  rating: ratingSchema,
  observedMode: reviewModeSchema,
  occurredAt: instantSchema,
  deviceId: uuidSchema,
  clientSeq: revisionSchema,
  observedContentRevision: revisionSchema,
  observedProgressRevision: revisionSchema.nullable(),
  epoch: revisionSchema,
  algorithmVersion: z.string().min(1).max(100),
});
export const syncedReviewSchema = z.strictObject({
  event: reviewEventSchema,
  receivedAt: instantSchema,
  effectiveAt: instantSchema.nullable(),
  canonicalMode: reviewModeSchema.nullable(),
  disposition: z.enum(["applied", "ignored_deleted", "ignored_old_epoch"]),
});
// Each scheduler version defines the structure of its JSON state.
export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
export const schedulerStateSchema = z.strictObject({
  version: z.string().min(1).max(100),
  data: jsonValueSchema,
});
export const progressSchema = z
  .strictObject({
    cardId: uuidSchema,
    direction: directionSchema,
    epoch: revisionSchema,
    dueAt: instantSchema,
    lastEffectiveAt: instantSchema,
    schedulerState: schedulerStateSchema,
    revision: revisionSchema,
    algorithmVersion: z.string().min(1).max(100),
  })
  .refine(
    (v) => v.schedulerState.version === v.algorithmVersion,
    "Wersje algorytmu i stanu muszą być zgodne",
  );
export const settingsSchema = z
  .strictObject({
    timezone: z.string().min(1).max(100),
    timezoneChanges: z
      .array(
        z.strictObject({
          timezone: z.string().min(1).max(100),
          effectiveAt: instantSchema,
        }),
      )
      .optional(),
    newLimit: z.number().int().min(0).max(10000),
    showDue: z.boolean(),
    showSession: z.boolean(),
    revision: revisionSchema,
  })
  .transform(({ timezoneChanges: _legacyChanges, ...settings }) => ({
    ...settings,
    timezone: STUDY_TIMEZONE,
  }));
export type Deck = z.infer<typeof deckSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type ContentRecord = Deck | Card | Settings | null;
export interface ContentRepository {
  readContent(
    type: "deck" | "card" | "settings",
    id: string,
  ): Promise<ContentRecord>;
  commitContent(
    operation: ContentOperation,
    expected: ContentRecord,
  ): Promise<{ operationId: string; committedAt: string }>;
}
export interface ResetRepository {
  commitReset(
    operation: ResetOperation,
    expected: Progress,
    localVersion: string,
    reset: (previous: Progress, epoch: string) => Progress,
  ): Promise<{ operationId: string; committedAt: string }>;
}
export const introductionSchema = z.strictObject({
  cardId: uuidSchema,
  firstEffectiveAt: instantSchema,
  studyDay: z.iso.date(),
});
export type Introduction = z.infer<typeof introductionSchema>;
export const changeSchema = z.strictObject({
  sequence: revisionSchema,
  entity: z.enum([
    "deck",
    "card",
    "progress",
    "settings",
    "review",
    "reset",
    "introduction",
  ]),
  entityId: uuidSchema,
  revision: revisionSchema,
  payload: jsonValueSchema,
  deleted: z.boolean(),
});
export const pullQuerySchema = z.strictObject({
  cursor: revisionSchema.default("0"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export const pullResponseSchema = z.strictObject({
  changes: z.array(changeSchema).max(500),
  nextCursor: revisionSchema,
  hasMore: z.boolean(),
  serverTime: instantSchema,
});
export const snapshotQuerySchema = z
  .strictObject({
    snapshotToken: z.string().min(1).max(4096).optional(),
    pageToken: z.string().min(1).max(4096).optional(),
  })
  .refine(
    (v) => !v.pageToken || !!v.snapshotToken,
    "pageToken wymaga snapshotToken",
  );
export const snapshotResponseSchema = z.strictObject({
  snapshotToken: z.string().min(1).max(4096),
  watermark: revisionSchema,
  decks: z.array(deckSchema),
  cards: z.array(cardSchema),
  progress: z.array(progressSchema),
  introductions: z.array(introductionSchema),
  settings: settingsSchema.nullable(),
  nextPage: z.string().min(1).max(4096).nullable(),
});
export const httpErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "unauthorized",
      "protocol_conflict",
      "payload_too_large",
      "invalid_envelope",
      "upgrade_required",
      "rate_limited",
      "retry_later",
    ]),
    message: z.string().min(1).max(1000),
    requestId: uuidSchema,
  }),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;
export type SnapshotResponse = z.infer<typeof snapshotResponseSchema>;
export type HttpError = z.infer<typeof httpErrorSchema>;
