import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalRepository } from "../../src/storage/local-repository";
import { createSnapshotRebaser } from "../../src/storage/snapshot-rebase";
import type { Operation } from "../../src/contracts";
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
  const originalAdd = IDBObjectStore.prototype.add, originalPut = IDBObjectStore.prototype.put;
  for (const [index, store] of ["decks", "meta", "outbox", "contentOperations"].entries()) {
    const a = local(`00000000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`);
    const create: Operation = { type: "deck.create", id: opId(5), entityId: "00000000-0000-4000-8000-000000000299", payload: { name: "B", directionMode: "a-b" } };
    await a.readContent("deck", create.entityId);
    IDBObjectStore.prototype.add = function (...args) { if (this.name === store) throw Error("injected"); return originalAdd.apply(this, args); };
    IDBObjectStore.prototype.put = function (...args) { if (this.name === store) throw Error("injected"); return originalPut.apply(this, args); };
    try { await assert.rejects(a.commitContent(create, null)); }
    finally { IDBObjectStore.prototype.add = originalAdd; IDBObjectStore.prototype.put = originalPut; }
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
