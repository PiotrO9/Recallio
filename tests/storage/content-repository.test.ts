import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalRepository } from "../../src/storage/local-repository";
import { createSnapshotRebaser } from "../../src/storage/snapshot-rebase";
import type { Deck, Operation } from "../../src/contracts";
const userId = "00000000-0000-4000-8000-000000000201";
const deckId = "00000000-0000-4000-8000-000000000202";
const cardId = "00000000-0000-4000-8000-000000000203";
const opId = (n: number) =>
  `00000000-0000-4000-8000-${String(210 + n).padStart(12, "0")}`;
const now = "2026-11-17T12:00:00.000Z";
const local = (account = userId) =>
  createLocalRepository({
    userId: account,
    now: () => new Date(now),
    introduction: () => ({
      cardId,
      firstEffectiveAt: now,
      studyDay: "2026-11-17",
    }),
  });

test("CSV import stores its cursor atomically, reuses operation IDs and detects changed targets", async () => {
  const account = "00000000-0000-4000-8000-000000000296";
  const first = local(account);
  const resumed = local(account);
  const otherCard = "00000000-0000-4000-8000-000000000297";
  const createDeck = {
    type: "deck.create",
    id: opId(71),
    entityId: deckId,
    payload: { name: "CSV", directionMode: "mixed" },
  } as const;
  const createCard = {
    type: "card.create",
    id: opId(72),
    entityId: cardId,
    payload: {
      deckId,
      sideA: "kot",
      sideB: "cat",
      exampleA: null,
      exampleB: null,
    },
  } as const;
  const plan = {
    id: opId(73),
    deckId,
    steps: [
      { operation: createCard, expected: null },
      {
        operation: { ...createCard, id: opId(74), entityId: otherCard },
        expected: null,
      },
    ],
  };
  try {
    await first.commitContent(createDeck, null);
    const deck = (await first.readContent("deck", deckId)) as Deck;
    await assert.rejects(
      first.startImport(plan, { ...deck, revision: "9" }, []),
      /zmienił się/,
    );
    await first.startImport(plan, deck, []);
    await first.commitContent(createCard, null, { id: plan.id, index: 0 });
    first.close();
    assert.equal((await resumed.readImport())?.next, 1);
    await resumed.commitContent(createCard, null, { id: plan.id, index: 0 });
    const step = await resumed.readImportStep(plan.id, 1);
    await resumed.commitContent(step.operation, step.expected, {
      id: plan.id,
      index: 1,
    });
    assert.equal((await resumed.readImport())?.next, 2);
    assert.equal((await resumed.readWorkspace()).cards.length, 2);
    const receipt = await resumed.finishImport(plan.id);
    assert.deepEqual(
      [
        receipt.deckName,
        receipt.added,
        receipt.updated,
        receipt.remaining,
        receipt.skippedRows,
      ],
      ["CSV", 2, 0, 0, undefined],
    );
    assert.equal(await resumed.readImport(), null);
  } finally {
    first.close();
    resumed.close();
  }
});

test("logout preserves unsent changes until explicitly discarded and isolates the other account", async () => {
  const first = local("00000000-0000-4000-8000-000000000298");
  const second = local("00000000-0000-4000-8000-000000000299");
  const create: Operation = {
    type: "deck.create",
    id: opId(78),
    entityId: deckId,
    payload: { name: "Local changes", directionMode: "mixed" },
  };
  try {
    await first.commitContent(create, null);
    await second.commitContent(create, null);
    assert.equal(await first.clearForLogout(false), 1);
    assert.ok(await first.readContent("deck", deckId));
    assert.equal(await first.clearForLogout(true), 0);
    assert.equal(await first.readContent("deck", deckId), null);
    assert.equal((await first.lease("sync", 0, 10, 10)).length, 0);
    assert.equal(await second.clearForLogout(false), 1);
    assert.ok(await second.readContent("deck", deckId));
  } finally {
    first.close();
    second.close();
  }
});
test("content writes and outbox commit together; retries and stale edits are safe", async () => {
  const a = local(),
    b = local();
  const create: Operation = {
    type: "deck.create",
    id: opId(1),
    entityId: deckId,
    payload: { name: "A", directionMode: "mixed" },
  };
  const [one, two] = await Promise.all([
    a.commitContent(create, null),
    b.commitContent(create, null),
  ]);
  assert.deepEqual(one, two);
  const deck = await a.readContent("deck", deckId);
  const card: Operation = {
    type: "card.create",
    id: opId(2),
    entityId: cardId,
    payload: { deckId, sideA: "a", sideB: "b", exampleA: null, exampleB: null },
  };
  await a.commitContent(card, null);
  const before = await a.readContent("card", cardId);
  const update: Operation = {
    type: "card.update",
    id: opId(3),
    entityId: cardId,
    baseRevision: "0",
    payload: { sideA: "new", sideB: "b", exampleA: null, exampleB: null },
  };
  await a.commitContent(update, before);
  const competing = {
    ...update,
    id: opId(4),
    payload: { ...update.payload, sideA: "other" },
  } as Operation;
  await assert.rejects(b.commitContent(competing, before), /zmieniła/);
  assert.equal((await a.lease("sync", 0, 10, 10)).length, 3);
  assert.ok(deck);
  a.close();
  b.close();
});

test("snapshot rebase retains unsubmitted deck and card operations", async () => {
  const a = local("00000000-0000-4000-8000-000000000204");
  const createDeck: Operation = {
    type: "deck.create",
    id: opId(6),
    entityId: deckId,
    payload: { name: "A", directionMode: "mixed" },
  };
  const createCard: Operation = {
    type: "card.create",
    id: opId(7),
    entityId: cardId,
    payload: { deckId, sideA: "a", sideB: "b", exampleA: null, exampleB: null },
  };
  await a.commitContent(createDeck, null);
  await a.commitContent(createCard, null);
  const page = {
    snapshotToken: "content",
    watermark: "0",
    decks: [],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: null,
  };
  await a.stageSnapshot(null, page, await a.beginSnapshot());
  await a.activateSnapshot(
    "content",
    createSnapshotRebaser({
      version: "unused",
      review() {
        throw Error("unexpected");
      },
    }),
  );
  assert.equal((await a.snapshot(deckId)).cards[0].id, cardId);
  assert.equal((await a.lease("sync", 0, 10, 10)).length, 2);
  a.close();
});
test("failure at each content write rolls back content, outbox and receipt", async () => {
  const originalAdd = IDBObjectStore.prototype.add,
    originalPut = IDBObjectStore.prototype.put;
  for (const [index, store] of [
    "decks",
    "meta",
    "outbox",
    "contentOperations",
  ].entries()) {
    const a = local(
      `00000000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`,
    );
    const create: Operation = {
      type: "deck.create",
      id: opId(5),
      entityId: "00000000-0000-4000-8000-000000000299",
      payload: { name: "B", directionMode: "a-b" },
    };
    await a.readContent("deck", create.entityId);
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === store) throw Error("injected");
      return originalAdd.apply(this, args);
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === store) throw Error("injected");
      return originalPut.apply(this, args);
    };
    try {
      await assert.rejects(a.commitContent(create, null));
    } finally {
      IDBObjectStore.prototype.add = originalAdd;
      IDBObjectStore.prototype.put = originalPut;
    }
    assert.equal(await a.readContent("deck", create.entityId), null);
    assert.equal((await a.lease("check", 0, 10, 10)).length, 0);
    await a.commitContent(create, null);
    assert.ok(await a.readContent("deck", create.entityId));
    a.close();
  }
});

test("settings and deletion remain isolated per account", async () => {
  const account = "00000000-0000-4000-8000-000000000205";
  const a = local(account),
    b = local("00000000-0000-4000-8000-000000000206");
  const settings = {
    timezone: "Europe/Warsaw",
    newLimit: 10,
    showDue: false,
    showSession: false,
    revision: "1",
  };
  const page = {
    snapshotToken: "settings",
    watermark: "0",
    decks: [],
    cards: [],
    progress: [],
    introductions: [],
    settings,
    nextPage: null,
  };
  await a.stageSnapshot(null, page, await a.beginSnapshot());
  await a.activateSnapshot(
    page.snapshotToken,
    createSnapshotRebaser({
      version: "unused",
      review() {
        throw Error("unexpected");
      },
    }),
  );
  const update: Operation = {
    id: opId(8),
    entityId: account,
    type: "settings.update",
    baseRevision: "1",
    payload: {
      timezone: "Europe/Warsaw",
      newLimit: 12,
      showDue: false,
      showSession: false,
    },
  };
  await a.commitContent(update, settings);
  assert.equal(
    ((await a.readContent("settings", account)) as typeof settings).newLimit,
    12,
  );
  await assert.rejects(b.readContent("settings", account), /konto/);
  assert.equal(
    await b.readContent("settings", "00000000-0000-4000-8000-000000000206"),
    null,
  );
  const deck: Operation = {
    type: "deck.create",
    id: opId(9),
    entityId: deckId,
    payload: { name: "A", directionMode: "mixed" },
  };
  await a.commitContent(deck, null);
  const current = await a.readContent("deck", deckId);
  await a.commitContent(
    {
      type: "deck.delete",
      id: opId(10),
      entityId: deckId,
      baseRevision: "0",
      payload: {},
    },
    current,
  );
  const deleted = (await a.readContent("deck", deckId)) as {
    deletedAt: string | null;
  };
  assert.equal(deleted.deletedAt, now);
  assert.equal(await b.readContent("deck", deckId), null);
  a.close();
  b.close();
});

test("a review of a deleted card preserves history and outbox without progress", async () => {
  const a = local("00000000-0000-4000-8000-000000000207");
  await a.commitContent(
    {
      type: "deck.create",
      id: opId(11),
      entityId: deckId,
      payload: { name: "A", directionMode: "a-b" },
    },
    null,
  );
  await a.commitContent(
    {
      type: "card.create",
      id: opId(12),
      entityId: cardId,
      payload: {
        deckId,
        sideA: "a",
        sideB: "b",
        exampleA: null,
        exampleB: null,
      },
    },
    null,
  );
  const existing = await a.readContent("card", cardId);
  await a.commitContent(
    {
      type: "card.delete",
      id: opId(13),
      entityId: cardId,
      baseRevision: "0",
      payload: {},
    },
    existing,
  );
  const payload = {
    direction: "a-b" as const,
    rating: 3 as const,
    observedMode: "introduction" as const,
    occurredAt: now,
    clientSeq: "1",
    observedContentRevision: "0",
    observedProgressRevision: null,
    epoch: "0",
    algorithmVersion: "test",
  };
  const id = opId(14);
  const review = {
    localVersion: "0",
    event: { id, cardId, deviceId: opId(15), ...payload },
    operation: {
      id,
      type: "review.record" as const,
      entityId: cardId,
      payload,
    },
    progress: {
      cardId,
      direction: "a-b" as const,
      epoch: "0",
      dueAt: now,
      lastEffectiveAt: now,
      revision: "0",
      algorithmVersion: "test",
      schedulerState: { version: "test", data: {} },
    },
  };
  await a.commitReview(review);
  await a.commitReview(review);
  assert.equal(await a.readProgress(cardId, "a-b"), null);
  assert.equal((await a.lease("sync", 0, 10, 10)).length, 4);
  a.close();
});

test("a review after parent deck deletion does not update progress", async () => {
  const a = local("00000000-0000-4000-8000-000000000220");
  await a.commitContent(
    {
      type: "deck.create",
      id: opId(20),
      entityId: deckId,
      payload: { name: "A", directionMode: "a-b" },
    },
    null,
  );
  await a.commitContent(
    {
      type: "card.create",
      id: opId(21),
      entityId: cardId,
      payload: {
        deckId,
        sideA: "a",
        sideB: "b",
        exampleA: null,
        exampleB: null,
      },
    },
    null,
  );
  await a.commitContent(
    {
      type: "deck.delete",
      id: opId(22),
      entityId: deckId,
      baseRevision: "0",
      payload: {},
    },
    await a.readContent("deck", deckId),
  );
  const payload = {
    direction: "a-b" as const,
    rating: 3 as const,
    observedMode: "introduction" as const,
    occurredAt: now,
    clientSeq: "1",
    observedContentRevision: "0",
    observedProgressRevision: null,
    epoch: "0",
    algorithmVersion: "test",
  };
  const id = opId(23);
  await a.commitReview({
    localVersion: "0",
    event: { id, cardId, deviceId: opId(24), ...payload },
    operation: { id, type: "review.record", entityId: cardId, payload },
    progress: {
      cardId,
      direction: "a-b",
      epoch: "0",
      dueAt: now,
      lastEffectiveAt: now,
      revision: "0",
      algorithmVersion: "test",
      schedulerState: { version: "test", data: {} },
    },
  });
  assert.equal(await a.readProgress(cardId, "a-b"), null);
  assert.equal((await a.lease("sync", 0, 10, 10)).length, 4);
  a.close();
});

test("own confirmed creation rebases a never-sent dependent edit", async () => {
  const a = local("00000000-0000-4000-8000-000000000208");
  const createId = opId(16),
    updateId = opId(17);
  await a.commitContent(
    {
      type: "deck.create",
      id: createId,
      entityId: deckId,
      payload: { name: "A", directionMode: "a-b" },
    },
    null,
  );
  const original = await a.readContent("deck", deckId);
  await a.commitContent(
    {
      type: "deck.update",
      id: updateId,
      entityId: deckId,
      baseRevision: "0",
      payload: { name: "B", directionMode: "a-b" },
    },
    original,
  );
  await a.lease("sync", 0, 10, 1);
  await a.acknowledge({
    operationId: createId,
    status: "applied",
    commitCursor: "1",
    revision: "1",
  });
  const page = {
    snapshotToken: "confirmed",
    watermark: "1",
    decks: [
      {
        id: deckId,
        name: "A",
        directionMode: "a-b" as const,
        revision: "1",
        deletedAt: null,
      },
    ],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: null,
  };
  await a.stageSnapshot(null, page, await a.beginSnapshot());
  await a.activateSnapshot(
    page.snapshotToken,
    createSnapshotRebaser({
      version: "unused",
      review() {
        throw Error("unexpected");
      },
    }),
  );
  const leased = await a.lease("sync", 10, 10, 10);
  assert.equal(leased[0].operation.id, updateId);
  assert.equal(
    "baseRevision" in leased[0].operation && leased[0].operation.baseRevision,
    "1",
  );
  assert.equal(
    ((await a.readContent("deck", deckId)) as { name: string }).name,
    "B",
  );
  a.close();
});

test("another device revision is not silently rebased", async () => {
  const a = local("00000000-0000-4000-8000-000000000209");
  const createId = opId(18),
    updateId = opId(19);
  await a.commitContent(
    {
      type: "deck.create",
      id: createId,
      entityId: deckId,
      payload: { name: "A", directionMode: "a-b" },
    },
    null,
  );
  await a.commitContent(
    {
      type: "deck.update",
      id: updateId,
      entityId: deckId,
      baseRevision: "0",
      payload: { name: "B", directionMode: "a-b" },
    },
    await a.readContent("deck", deckId),
  );
  await a.lease("sync", 0, 10, 1);
  await a.acknowledge({
    operationId: createId,
    status: "applied",
    commitCursor: "1",
    revision: "1",
  });
  const page = {
    snapshotToken: "other-device",
    watermark: "2",
    decks: [
      {
        id: deckId,
        name: "C",
        directionMode: "a-b" as const,
        revision: "2",
        deletedAt: null,
      },
    ],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: null,
  };
  await a.stageSnapshot(null, page, await a.beginSnapshot());
  await assert.rejects(
    a.activateSnapshot(
      page.snapshotToken,
      createSnapshotRebaser({
        version: "unused",
        review() {
          throw Error("unexpected");
        },
      }),
    ),
    /Konflikt rewizji/,
  );
  assert.equal(
    ((await a.readContent("deck", deckId)) as { name: string }).name,
    "B",
  );
  a.close();
});

test("a previously sent dependent operation is never rewritten", async () => {
  const a = local("00000000-0000-4000-8000-000000000221");
  const createId = opId(25),
    updateId = opId(26);
  await a.commitContent(
    {
      type: "deck.create",
      id: createId,
      entityId: deckId,
      payload: { name: "A", directionMode: "a-b" },
    },
    null,
  );
  await a.commitContent(
    {
      type: "deck.update",
      id: updateId,
      entityId: deckId,
      baseRevision: "0",
      payload: { name: "B", directionMode: "a-b" },
    },
    await a.readContent("deck", deckId),
  );
  await a.lease("sync", 0, 10, 1);
  await a.acknowledge({
    operationId: createId,
    status: "applied",
    commitCursor: "1",
    revision: "1",
  });
  await a.lease("sync", 10, 10, 1);
  await a.acknowledge({
    operationId: updateId,
    status: "rejected",
    error: "dependency_pending",
  });
  const page = {
    snapshotToken: "already-sent",
    watermark: "1",
    decks: [
      {
        id: deckId,
        name: "A",
        directionMode: "a-b" as const,
        revision: "1",
        deletedAt: null,
      },
    ],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: null,
  };
  await a.stageSnapshot(null, page, await a.beginSnapshot());
  await assert.rejects(
    a.activateSnapshot(
      page.snapshotToken,
      createSnapshotRebaser({
        version: "unused",
        review() {
          throw Error("unexpected");
        },
      }),
    ),
    /Konflikt rewizji/,
  );
  const retry = await a.lease("retry", 20, 10, 1);
  assert.equal(
    "baseRevision" in retry[0].operation && retry[0].operation.baseRevision,
    "0",
  );
  a.close();
});

test("repair cache accepts the latest read only and a late response cannot undo logout", async () => {
  const one = local(crypto.randomUUID()),
    other = local(crypto.randomUUID());
  const empty = { asOf: now, items: [] };
  const full = {
    asOf: now,
    items: [
      {
        deckId,
        cardId,
        directions: [
          {
            direction: "a-b" as const,
            epoch: "0",
            failedDays: 3,
            lastFailedDay: "2026-11-17",
          },
        ],
      },
    ],
  };
  try {
    assert.equal(await one.readRepairCandidates(), null);
    await one.beginRepairRead("a");
    await one.beginRepairRead("b");
    assert.equal(await one.saveRepairCandidates("b", full), true);
    assert.equal(await one.saveRepairCandidates("a", empty), false);
    assert.deepEqual(await one.readRepairCandidates(), full);
    assert.equal(await other.readRepairCandidates(), null);
    await one.beginRepairRead("c");
    assert.deepEqual(await one.readRepairCandidates(), full);
    await one.saveRepairCandidates("c", empty);
    assert.deepEqual(await one.readRepairCandidates(), empty);
    await one.beginRepairRead("d");
    await one.clearForLogout(true);
    assert.equal(await one.saveRepairCandidates("d", full), false);
    assert.equal(await one.readRepairCandidates(), null);
  } finally {
    one.close();
    other.close();
  }
});
