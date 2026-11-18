import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSnapshotRebaser } from "../../src/storage/snapshot-rebase";
import { createLocalRepository } from "../../src/storage/local-repository";
import type {
  PreparedReview,
  Progress,
  Scheduler,
  SnapshotResponse,
} from "../../src/contracts";
const deckId = "00000000-0000-4000-8000-000000000101";
const cardId = "00000000-0000-4000-8000-000000000102";
const eventId = "00000000-0000-4000-8000-000000000103";
const deviceId = "00000000-0000-4000-8000-000000000104";
const userId = "00000000-0000-4000-8000-000000000105";
const time = "2026-11-17T12:00:00.000Z";
const payload = {
  direction: "a-b",
  rating: 3,
  observedMode: "introduction",
  occurredAt: time,
  clientSeq: "1",
  observedContentRevision: "1",
  observedProgressRevision: null,
  epoch: "0",
  algorithmVersion: "test",
} as const;
const progress = {
  cardId,
  direction: "a-b",
  epoch: "0",
  dueAt: time,
  lastEffectiveAt: time,
  revision: "0",
  algorithmVersion: "test",
  schedulerState: { version: "test", data: {} },
} as const;
const command: PreparedReview = {
  localVersion: "0",
  event: { id: eventId, cardId, deviceId, ...payload },
  operation: { id: eventId, type: "review.record", entityId: cardId, payload },
  progress,
};
const page: SnapshotResponse = {
  snapshotToken: "real-rebase",
  watermark: "0",
  decks: [
    {
      id: deckId,
      name: "D",
      directionMode: "a-b",
      revision: "1",
      deletedAt: null,
    },
  ],
  cards: [
    {
      id: cardId,
      deckId,
      sideA: "a",
      sideB: "b",
      exampleA: null,
      exampleB: null,
      contentRevision: "1",
      deletedAt: null,
    },
  ],
  progress: [],
  introductions: [],
  settings: null,
  nextPage: null,
};
const intro = { cardId, firstEffectiveAt: time, studyDay: "2026-11-17" };
const scheduler: Scheduler = {
  version: "test",
  review: ({ event, effectiveAt, mode }) => {
    assert.equal(event.id, eventId);
    assert.equal(mode, "introduction");
    return { ...progress, lastEffectiveAt: effectiveAt };
  },
};
test("staged snapshot replays the actual pending review and introduction", async () => {
  const local = createLocalRepository({
    userId,
    now: () => new Date(time),
    introduction: () => intro,
  });
  await local.commitReview(command);
  await local.stageSnapshot(null, page, await local.beginSnapshot());
  await local.activateSnapshot(
    page.snapshotToken,
    createSnapshotRebaser(scheduler),
  );
  assert.deepEqual((await local.snapshot(deckId)).progress, [progress]);
  assert.equal((await local.lease("sync", 0, 10, 10))[0].operation.id, eventId);
  local.close();
});
test("rebase preserves deleted material and rejects unsupported operations", () => {
  const rebase = createSnapshotRebaser(scheduler);
  const pending = [
    {
      operation: command.operation,
      sequence: 1,
      deliveryUnknown: false,
      state: "pending" as const,
    },
  ];
  const deleted = { ...page, cards: [{ ...page.cards[0], deletedAt: time }] };
  const result = rebase(deleted, pending, {
    reviews: [command.event],
    introductions: [intro],
    decks: [],
    cards: [],
    settings: null,
  });
  assert.deepEqual(result.data.progress, []);
  assert.deepEqual(result.handledOperationIds, [eventId]);
  const unsupported = [
    {
      ...pending[0],
      operation: {
        id: eventId,
        entityId: cardId,
        type: "progress.reset" as const,
        baseRevision: "0",
        payload: { direction: "a-b" as const, epoch: "1" },
      },
    },
  ];
  assert.throws(
    () =>
      rebase({ ...page, progress: [progress] }, unsupported, {
        reviews: [],
        introductions: [],
        decks: [],
        cards: [],
        settings: null,
      }),
    /nie obsługuje/,
  );
});

test("content rebase respects ordering, revisions and tombstones", () => {
  const rebase = createSnapshotRebaser(scheduler);
  const local = {
    reviews: [],
    introductions: [],
    decks: [{ ...page.decks[0], deletedAt: time }],
    cards: [],
    settings: null,
  };
  const item = (
    operation: import("../../src/contracts").Operation,
    sequence: number,
  ) => ({
    operation,
    sequence,
    deliveryUnknown: false,
    state: "pending" as const,
  });
  const update = item(
    {
      id: eventId,
      entityId: cardId,
      type: "card.update",
      baseRevision: "1",
      payload: { sideA: "changed", sideB: "b", exampleA: null, exampleB: null },
    },
    1,
  );
  const remove = item(
    {
      id: "00000000-0000-4000-8000-000000000106",
      entityId: deckId,
      type: "deck.delete",
      baseRevision: "1",
      payload: {},
    },
    2,
  );
  const result = rebase(page, [update, remove], local);
  assert.equal(result.data.cards[0].sideA, "changed");
  assert.equal(result.data.decks[0].deletedAt, time);
  assert.deepEqual(result.handledOperationIds, [eventId, remove.operation.id]);
  const conflictPage = {
    ...page,
    cards: [{ ...page.cards[0], contentRevision: "2" }],
  };
  assert.throws(
    () => rebase(conflictPage, [update], local),
    /Konflikt rewizji/,
  );
  const deletedPage = {
    ...page,
    cards: [{ ...page.cards[0], deletedAt: time }],
  };
  assert.equal(
    rebase(deletedPage, [update], local).data.cards[0].deletedAt,
    time,
  );
});

test("reset commits atomically and replays using the injected reset policy", async () => {
  const local = createLocalRepository({
    userId: "00000000-0000-4000-8000-000000000107",
    now: () => new Date(time),
    introduction: () => intro,
  });
  const initial = {
    ...page,
    snapshotToken: "before-reset",
    progress: [progress],
  };
  await local.stageSnapshot(null, initial, await local.beginSnapshot());
  await local.activateSnapshot(
    initial.snapshotToken,
    createSnapshotRebaser(scheduler),
  );
  const before = await local.readProgressVersion(cardId, "a-b");
  assert.ok(before.progress);
  const operation = {
    id: "00000000-0000-4000-8000-000000000108",
    entityId: cardId,
    type: "progress.reset" as const,
    baseRevision: "0",
    payload: { direction: "a-b" as const, epoch: "1" },
  };
  const reset = (previous: Progress, epoch: string) => ({
    ...previous,
    epoch,
    schedulerState: { version: "test", data: { reset: true } },
  });
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === "outbox") throw Error("injected reset failure");
    return originalAdd.apply(this, args);
  };
  try {
    await assert.rejects(
      local.commitReset(operation, before.progress, before.localVersion, reset),
    );
  } finally {
    IDBObjectStore.prototype.add = originalAdd;
  }
  assert.deepEqual(await local.readProgressVersion(cardId, "a-b"), before);
  const receipt = await local.commitReset(
    operation,
    before.progress,
    before.localVersion,
    reset,
  );
  assert.deepEqual(
    await local.commitReset(
      operation,
      before.progress,
      before.localVersion,
      reset,
    ),
    receipt,
  );
  const next = await local.readProgressVersion(cardId, "a-b");
  assert.equal(next.progress?.epoch, "1");
  const server = { ...initial, snapshotToken: "rebase-reset" };
  await local.stageSnapshot(null, server, await local.beginSnapshot());
  await local.activateSnapshot(
    server.snapshotToken,
    createSnapshotRebaser(scheduler, reset),
  );
  assert.equal(
    (await local.readProgressVersion(cardId, "a-b")).progress?.epoch,
    "1",
  );
  assert.equal(
    (await local.lease("sync", 0, 10, 10))[0].operation.id,
    operation.id,
  );
  local.close();
});

test("old-epoch review remains in outbox without affecting reset progress", () => {
  const newProgress = { ...progress, epoch: "1" };
  const input = { ...page, progress: [newProgress] };
  const pending = [
    {
      operation: command.operation,
      sequence: 1,
      deliveryUnknown: false,
      state: "pending" as const,
    },
  ];
  const result = createSnapshotRebaser(scheduler)(input, pending, {
    reviews: [command.event],
    introductions: [intro],
    decks: [],
    cards: [],
    settings: null,
  });
  assert.deepEqual(result.data.progress, [newProgress]);
  assert.deepEqual(result.handledOperationIds, [eventId]);
});

test("first review after a pending reset is introduced with a fresh scheduler state", () => {
  const resetOperation = {
    id: "00000000-0000-4000-8000-000000000109",
    entityId: cardId,
    type: "progress.reset" as const,
    baseRevision: "0",
    payload: { direction: "a-b" as const, epoch: "1" },
  };
  const reviewPayload = {
    ...payload,
    epoch: "1",
    clientSeq: "2",
    observedProgressRevision: "0",
  };
  const event = { id: eventId, cardId, deviceId, ...reviewPayload };
  const review = { ...command.operation, payload: reviewPayload };
  const pending = [resetOperation, review].map((operation, i) => ({
    operation,
    sequence: i + 1,
    deliveryUnknown: false,
    state: "pending" as const,
  }));
  const freshScheduler: Scheduler = {
    version: "test",
    review: ({ previous, mode }) => {
      assert.equal(previous, null);
      assert.equal(mode, "introduction");
      return { ...progress, epoch: "1" };
    },
  };
  const reset = (previous: Progress, epoch: string) => ({ ...previous, epoch });
  const result = createSnapshotRebaser(freshScheduler, reset)(
    { ...page, progress: [progress] },
    pending,
    {
      reviews: [event],
      introductions: [intro],
      decks: [],
      cards: [],
      settings: null,
    },
  );
  assert.equal(result.data.progress[0].epoch, "1");
  assert.deepEqual(result.handledOperationIds, [resetOperation.id, review.id]);
});
