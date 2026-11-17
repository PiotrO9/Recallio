import { z } from "zod";

// Decimal strings prevent loss of bigint precision during JSON transport.
export const revisionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n, "Poza zakresem bigint");
export const uuidSchema = z.uuid();
export const instantSchema = z.iso.datetime({ offset: false });
export const directionSchema = z.enum(["a-b", "b-a"]);
export const directionModeSchema = z.enum(["a-b", "b-a", "mixed"]);
export const ratingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
const content = z
  .string()
  .max(4000)
  .refine((value) => value.trim().length > 0, "Pole jest wymagane");
const example = z.string().max(8000).nullable();
const name = z
  .string()
  .max(120)
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
export const operationResultSchema = z.strictObject({
  operationId: uuidSchema,
  status: z.enum(["applied", "duplicate", "conflict", "rejected"]),
  revision: revisionSchema.optional(),
  entity: z.unknown().optional(),
  error: operationErrorSchema.optional(),
});
export const pushResponseSchema = z.strictObject({
  results: z.array(operationResultSchema),
  serverTime: instantSchema,
});
export type Direction = z.infer<typeof directionSchema>;
export type DirectionMode = z.infer<typeof directionModeSchema>;
export type Rating = z.infer<typeof ratingSchema>;
export type Operation = z.infer<typeof operationSchema>;
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
  schedulerState: unknown;
  revision: string;
  algorithmVersion: string;
}
export interface Candidate {
  card: Card;
  direction: Direction;
  mode: "introduction" | "due" | "practice";
}
export interface Scheduler {
  readonly version: string;
  review(input: {
    previous: Progress | null;
    event: ReviewEvent;
    effectiveAt: string;
    mode: Candidate["mode"];
  }): Progress;
}
export interface QueuePolicy {
  next(input: {
    cards: readonly Card[];
    progress: readonly Progress[];
    now: string;
    direction: DirectionMode;
    recentCardIds: readonly string[];
    remainingNew: number;
    random: () => number;
  }): Candidate | null;
}
export interface PreparedReview {
  event: ReviewEvent;
  progress: Progress;
  operation: Extract<Operation, { type: "review.record" }>;
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
  commitReview(command: PreparedReview): Promise<CommitReceipt>;
  snapshot(deckId: string): Promise<LearningSnapshot>;
}
