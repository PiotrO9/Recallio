import { test } from "node:test";
import assert from "node:assert/strict";
import {
  settingsSchema,
  operationSchema,
  operationResultSchema,
  pullQuerySchema,
  pullResponseSchema,
  snapshotQuerySchema,
  snapshotResponseSchema,
  httpErrorSchema,
  progressSchema,
  revisionSchema,
} from "../src/contracts";
const id = "4bf3cb96-c339-4991-83ba-38d8c7279100";
const time = "2026-11-17T12:00:00Z";
const common = { id, entityId: id };
const change = { ...common, baseRevision: "1" };
const card = {
  sideA: "słowo",
  sideB: "word",
  exampleA: null,
  exampleB: "example",
};
const deck = { name: "Nauka", directionMode: "mixed" };
const operations = [
  { ...common, type: "deck.create", payload: deck },
  { ...change, type: "deck.update", payload: deck },
  { ...change, type: "deck.delete", payload: {} },
  { ...common, type: "card.create", payload: { ...card, deckId: id } },
  { ...change, type: "card.update", payload: card },
  { ...change, type: "card.delete", payload: {} },
  {
    ...common,
    type: "review.record",
    payload: {
      direction: "a-b",
      rating: 3,
      observedMode: "introduction",
      occurredAt: time,
      clientSeq: "1",
      observedContentRevision: "1",
      observedProgressRevision: null,
      epoch: "0",
      algorithmVersion: "scheduler-v1",
    },
  },
  {
    ...change,
    type: "progress.reset",
    payload: { direction: "a-b", epoch: "0" },
  },
  {
    ...change,
    type: "settings.update",
    payload: {
      timezone: "Europe/Warsaw",
      newLimit: 10,
      showDue: false,
      showSession: false,
    },
  },
];
const progress = {
  cardId: id,
  direction: "a-b",
  epoch: "0",
  dueAt: time,
  lastEffectiveAt: time,
  schedulerState: { version: "scheduler-v1", data: { stability: 1 } },
  revision: "1",
  algorithmVersion: "scheduler-v1",
};
test("all operation fixtures validate and reject unknown fields", () => {
  for (const op of operations) {
    assert.equal(operationSchema.safeParse(op).success, true, op.type);
    assert.equal(
      operationSchema.safeParse({ ...op, userId: id }).success,
      false,
      op.type,
    );
  }
});
test("revision malformed input is rejected without throwing", () => {
  for (const value of ["oops", "-1", "01", "1.5", "9223372036854775808"])
    assert.equal(revisionSchema.safeParse(value).success, false);
});
test("pull and snapshot schemas enforce cursor, limits and versioned state", () => {
  assert.deepEqual(pullQuerySchema.parse({}), { cursor: "0", limit: 100 });
  assert.equal(pullQuerySchema.safeParse({ limit: 501 }).success, false);
  assert.equal(
    snapshotQuerySchema.safeParse({ pageToken: "page" }).success,
    false,
  );
  assert.equal(
    pullResponseSchema.safeParse({
      changes: [],
      nextCursor: "9007199254740993",
      hasMore: false,
      serverTime: time,
    }).success,
    true,
  );
  assert.equal(
    snapshotResponseSchema.safeParse({
      snapshotToken: "token",
      watermark: "1",
      decks: [],
      cards: [],
      progress: [progress],
      introductions: [
        { cardId: id, firstEffectiveAt: time, studyDay: "2026-11-17" },
      ],
      settings: null,
      nextPage: null,
    }).success,
    true,
  );
  assert.equal(
    progressSchema.safeParse({
      ...progress,
      schedulerState: { version: "different", data: {} },
    }).success,
    false,
  );
  assert.equal(
    progressSchema.safeParse({
      ...progress,
      schedulerState: { version: "scheduler-v1", data: undefined },
    }).success,
    false,
  );
});

test("snapshot requires valid introductions and reviews preserve observed mode", () => {
  const snapshot = {
    snapshotToken: "token",
    watermark: "1",
    decks: [],
    cards: [],
    progress: [],
    introductions: [
      { cardId: id, firstEffectiveAt: time, studyDay: "2026-11-17" },
    ],
    settings: null,
    nextPage: null,
  };
  assert.deepEqual(
    snapshotResponseSchema.parse(JSON.parse(JSON.stringify(snapshot))),
    snapshot,
  );
  assert.equal(
    snapshotResponseSchema.safeParse({ ...snapshot, introductions: undefined })
      .success,
    false,
  );
  assert.equal(
    snapshotResponseSchema.safeParse({
      ...snapshot,
      introductions: [{ ...snapshot.introductions[0], studyDay: "2026-02-30" }],
    }).success,
    false,
  );
  const review = operations.find((op) => op.type === "review.record")!;
  assert.equal(
    operationSchema.safeParse({
      ...review,
      payload: { ...review.payload, observedMode: "practice" },
    }).success,
    true,
  );
  assert.equal(
    operationSchema.safeParse({
      ...review,
      payload: { ...review.payload, observedMode: "invalid" },
    }).success,
    false,
  );
  assert.equal(
    operationSchema.safeParse({
      ...review,
      payload: { ...review.payload, observedMode: undefined },
    }).success,
    false,
  );
});
test("response and error fixtures", () => {
  for (const status of ["applied", "duplicate", "conflict", "rejected"])
    assert.equal(
      operationResultSchema.safeParse({
        operationId: id,
        status,
        ...(status === "applied" || status === "duplicate"
          ? { commitCursor: "1" }
          : {}),
      }).success,
      true,
    );
  assert.equal(
    operationResultSchema.safeParse({ operationId: id, status: "applied" })
      .success,
    false,
  );
  assert.equal(
    operationResultSchema.safeParse({
      operationId: id,
      status: "duplicate",
      commitCursor: "-1",
    }).success,
    false,
  );
  assert.equal(
    operationResultSchema.safeParse({
      operationId: id,
      status: "conflict",
      commitCursor: "1",
    }).success,
    false,
  );
  assert.equal(
    httpErrorSchema.safeParse({
      error: {
        code: "invalid_envelope",
        message: "Nieprawidłowe dane",
        requestId: id,
      },
    }).success,
    true,
  );
  assert.equal(
    httpErrorSchema.safeParse({
      error: { code: "unknown", message: "error", requestId: id },
    }).success,
    false,
  );
});

test("batch envelope allows per-operation invalid payload without rejecting valid peers", async () => {
  const { pushEnvelopeSchema } = await import("../src/contracts");
  const mixed = {
    protocolVersion: 1,
    deviceId: id,
    operations: [operations[0], { ...operations[1], payload: { name: "" } }],
  };
  assert.equal(pushEnvelopeSchema.safeParse(mixed).success, true);
  assert.equal(operationSchema.safeParse(mixed.operations[0]).success, true);
  assert.equal(operationSchema.safeParse(mixed.operations[1]).success, false);
});

test("legacy profiles keep their limit and counters in the fixed Warsaw timezone", () => {
  assert.deepEqual(
    settingsSchema.parse({
      timezone: "America/New_York",
      timezoneChanges: [
        { timezone: "Asia/Tokyo", effectiveAt: "2027-01-01T00:00:00.000Z" },
      ],
      newLimit: 0,
      showDue: true,
      showSession: false,
      revision: "7",
    }),
    {
      timezone: "Europe/Warsaw",
      newLimit: 0,
      showDue: true,
      showSession: false,
      revision: "7",
    },
  );
});
