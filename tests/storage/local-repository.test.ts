import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalRepository } from "../../src/storage/local-repository";
import { openDB, deleteDB } from "idb";
import type { PreparedReview, SnapshotResponse } from "../../src/contracts";
const card = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const device = "00000000-0000-4000-8000-000000000003";
const at = "2026-11-17T12:00:00.000Z";
const payload = {
  direction: "a-b",
  rating: 3,
  observedMode: "introduction",
  occurredAt: at,
  clientSeq: "1",
  observedContentRevision: "1",
  observedProgressRevision: null,
  epoch: "0",
  algorithmVersion: "test",
} as const;
const command: PreparedReview = {
  event: { id, cardId: card, deviceId: device, ...payload },
  operation: { id, type: "review.record", entityId: card, payload },
  progress: {
    cardId: card,
    direction: "a-b",
    epoch: "0",
    dueAt: at,
    lastEffectiveAt: at,
    revision: "1",
    algorithmVersion: "test",
    schedulerState: { version: "test", data: {} },
  },
};
function repo(userId: string, fail = false) {
  return createLocalRepository({
    userId,
    now: () => new Date(at),
    introduction: () => {
      if (fail) throw Error("injected");
      return { cardId: card, firstEffectiveAt: at, studyDay: "2026-11-17" };
    },
  });
}
async function stageFirst(
  local: ReturnType<typeof repo>,
  page: SnapshotResponse,
) {
  return local.stageSnapshot(null, page, await local.beginSnapshot());
}
test("failure rolls back and retry preserves ID; leases expire; account databases are separate", async () => {
  const a = "00000000-0000-4000-8000-000000000011",
    b = "00000000-0000-4000-8000-000000000012";
  const failing = repo(a, true);
  await assert.rejects(failing.commitReview(command));
  failing.close();
  const first = repo(a),
    second = repo(a),
    other = repo(b);
  const [one, two] = await Promise.all([
    first.commitReview(command),
    second.commitReview(command),
  ]);
  assert.deepEqual(one, two);
  assert.equal((await other.lease("other", 0, 100, 10)).length, 0);
  const leases = await Promise.all([
    first.lease("a", 0, 100, 10),
    second.lease("b", 0, 100, 10),
  ]);
  assert.equal(leases[0].length + leases[1].length, 1);
  assert.equal((await second.lease("b", 100, 100, 10)).length, 1);
  await assert.rejects(
    first.commitReview({ ...command, event: { ...command.event, rating: 4 } }),
  );
  first.close();
  second.close();
  other.close();
});

test("different concurrent reviews reject a stale prepared command without altering it", async () => {
  const user = "00000000-0000-4000-8000-000000000071";
  const first = repo(user),
    second = repo(user);
  await first.commitReview(command);
  const base = await first.readProgress(card, "a-b");
  assert.ok(base);
  const make = (n: number): PreparedReview => {
    const nextId = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const nextPayload = {
      ...payload,
      clientSeq: String(n),
      observedProgressRevision: "1",
      observedMode: "due" as const,
    };
    return {
      event: { id: nextId, cardId: card, deviceId: device, ...nextPayload },
      operation: {
        id: nextId,
        type: "review.record",
        entityId: card,
        payload: nextPayload,
      },
      progress: { ...command.progress, dueAt: `2026-11-${n}T12:00:00.000Z` },
    };
  };
  const a = make(20),
    b = make(21);
  await assert.rejects(first.commitReview(a), /Lokalny postęp/);
  const results = await Promise.allSettled([
    first.commitReviewFrom(a, base),
    second.commitReviewFrom(b, base),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const losing = results[0].status === "rejected" ? a : b;
  const updated = await first.readProgress(card, "a-b");
  assert.ok(updated);
  await assert.rejects(first.commitReviewFrom(losing, base), /Lokalny postęp/);
  assert.equal((await first.lease("sync", 0, 10, 10)).length, 2);
  first.close();
  second.close();
});

test("snapshot pages switch atomically and rebase pending reviews", async () => {
  const user = "00000000-0000-4000-8000-000000000021";
  const deck = "00000000-0000-4000-8000-000000000022";
  const local = repo(user);
  const base: SnapshotResponse = {
    snapshotToken: "generation",
    watermark: "4",
    decks: [
      {
        id: deck,
        name: "Test",
        directionMode: "mixed",
        revision: "1",
        deletedAt: null,
      },
    ],
    cards: [
      {
        id: card,
        deckId: deck,
        sideA: "A",
        sideB: "B",
        exampleA: null,
        exampleB: null,
        contentRevision: "1",
        deletedAt: null,
      },
    ],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: "page2",
  };
  await stageFirst(local, base);
  await stageFirst(local, base);
  await assert.rejects(local.stageSnapshot(null, { ...base, watermark: "5" }));
  await assert.rejects(
    local.activateSnapshot("generation", () => {
      throw Error("must not run");
    }),
  );
  assert.equal(await local.getCursor(), undefined);
  await assert.rejects(
    local.stageSnapshot("wrong", { ...base, nextPage: null }),
  );
  await local.stageSnapshot("page2", {
    ...base,
    decks: [],
    cards: [],
    nextPage: null,
  });
  await local.stageSnapshot("page2", {
    ...base,
    decks: [],
    cards: [],
    nextPage: null,
  });
  await local.commitReview(command);
  await assert.rejects(
    local.activateSnapshot("generation", (data) => ({
      data,
      handledOperationIds: [],
    })),
  );
  assert.equal(await local.getCursor(), undefined);
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === "progress") throw Error("snapshot write failure");
    return originalAdd.apply(this, args);
  };
  try {
    await assert.rejects(
      local.activateSnapshot("generation", (data, pending) => ({
        data: { ...data, progress: [command.progress] },
        handledOperationIds: pending.map((x) => x.operation.id),
      })),
    );
  } finally {
    IDBObjectStore.prototype.add = originalAdd;
  }
  assert.equal(await local.getCursor(), undefined);
  await local.activateSnapshot("generation", (data, pending) => ({
    data: { ...data, progress: [command.progress] },
    handledOperationIds: pending.map((x) => x.operation.id),
  }));
  assert.equal(await local.getCursor(), "4");
  assert.deepEqual((await local.snapshot(deck)).progress, [command.progress]);
  assert.equal((await local.lease("reader", 0, 10, 10)).length, 1);
  local.close();
});

test("upgrade preserves pending operations", async () => {
  const user = "00000000-0000-4000-8000-000000000031";
  const name = `recallio-user-${user}`;
  await deleteDB(name);
  const v1 = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("cards", { keyPath: "id" });
      db.createObjectStore("progress", { keyPath: ["cardId", "direction"] });
      db.createObjectStore("reviews", { keyPath: "event.id" });
      db.createObjectStore("introductions", { keyPath: "cardId" });
      db.createObjectStore("outbox", { keyPath: "operation.id" });
      db.createObjectStore("meta");
    },
  });
  await v1.put("outbox", { operation: command.operation, state: "pending" });
  v1.close();
  const local = repo(user);
  assert.equal((await local.lease("upgrade", 0, 10, 1))[0].operation.id, id);
  local.close();
  await deleteDB(name);
});

test("lost response prevents stale snapshot activation until receipt and a new snapshot", async () => {
  const user = "00000000-0000-4000-8000-000000000074";
  const local = repo(user);
  const page: SnapshotResponse = {
    snapshotToken: "before-receipt",
    watermark: "1",
    decks: [],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: null,
  };
  await local.commitReview(command);
  await stageFirst(local, page);
  const earlierRequest = await local.beginSnapshot();
  await local.lease("sending-tab", 0, 10, 10);
  await local.releaseLease("sending-tab");
  await assert.rejects(
    local.activateSnapshot(page.snapshotToken, (data) => ({
      data,
      handledOperationIds: [],
    })),
    /Nieznany wynik/,
  );
  await assert.rejects(
    local.acknowledge({
      operationId: id,
      status: "rejected",
      error: "invalid_payload",
    }),
  );
  await local.acknowledge({ operationId: id, status: "duplicate" });
  await local.acknowledge({ operationId: id, status: "duplicate" });
  await assert.rejects(
    local.stageSnapshot(
      null,
      { ...page, snapshotToken: "requested-too-early" },
      earlierRequest,
    ),
    /zamówiony po rozliczeniu/,
  );
  await assert.rejects(
    local.activateSnapshot(page.snapshotToken, (data) => ({
      data,
      handledOperationIds: [],
    })),
    /przed rozliczeniem/,
  );
  // A crash after the receipt must leave it durable until activation.
  local.close();
  const reopened = repo(user);
  const after: SnapshotResponse = {
    ...page,
    snapshotToken: "after-receipt",
    watermark: "2",
    progress: [command.progress],
  };
  await stageFirst(reopened, after);
  const originalDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function (...args) {
    if (this.name === "outbox") throw Error("ack cleanup failed");
    return originalDelete.apply(this, args);
  };
  try {
    await assert.rejects(
      reopened.activateSnapshot(after.snapshotToken, (data) => ({
        data,
        handledOperationIds: [],
      })),
    );
  } finally {
    IDBObjectStore.prototype.delete = originalDelete;
  }
  assert.equal(await reopened.getCursor(), undefined);
  await reopened.activateSnapshot(after.snapshotToken, (data) => ({
    data,
    handledOperationIds: [],
  }));
  assert.equal(await reopened.getCursor(), "2");
  assert.equal((await reopened.lease("later", 20, 10, 10)).length, 0);
  reopened.close();
});

test("receipt write failure rolls back without dropping the pending operation", async () => {
  const local = repo("00000000-0000-4000-8000-000000000075");
  await local.commitReview(command);
  await local.lease("sync", 0, 10, 1);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "outbox") throw Error("receipt storage failure");
    return original.apply(this, args);
  };
  try {
    await assert.rejects(
      local.acknowledge({ operationId: id, status: "applied" }),
    );
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  const retried = await local.lease("retry", 10, 10, 1);
  assert.equal(retried[0].operation.id, id);
  await local.acknowledge({ operationId: id, status: "duplicate" });
  local.close();
});

test("v2 outbox migration conservatively treats delivery as unknown", async () => {
  const user = "00000000-0000-4000-8000-000000000076";
  const name = `recallio-user-${user}`;
  const old = await openDB(name, 2, {
    upgrade(db) {
      db.createObjectStore("cards", { keyPath: "id" });
      db.createObjectStore("progress", { keyPath: ["cardId", "direction"] });
      db.createObjectStore("reviews", { keyPath: "event.id" }).createIndex(
        "deviceSequence",
        ["event.deviceId", "event.clientSeq"],
        { unique: true },
      );
      db.createObjectStore("introductions", { keyPath: "cardId" });
      db.createObjectStore("outbox", { keyPath: "operation.id" });
      db.createObjectStore("meta");
      db.createObjectStore("decks", { keyPath: "id" });
      db.createObjectStore("settings");
      db.createObjectStore("conflicts");
      db.createObjectStore("staging", { keyPath: "token" });
    },
  });
  await old.put("outbox", {
    operation: command.operation,
    sequence: 1,
    state: "pending",
  });
  old.close();
  const local = repo(user);
  const page: SnapshotResponse = {
    snapshotToken: "v2-migration",
    watermark: "1",
    decks: [],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: null,
  };
  await assert.rejects(local.beginSnapshot(), /Nieznany wynik/);
  assert.equal((await local.lease("retry", 0, 10, 1))[0].operation.id, id);
  local.close();
});

test("snapshot rebase cannot revive cards of a deleted deck", async () => {
  const local = repo("00000000-0000-4000-8000-000000000072");
  const deck = "00000000-0000-4000-8000-000000000073";
  const page: SnapshotResponse = {
    snapshotToken: "deleted-parent",
    watermark: "1",
    decks: [
      {
        id: deck,
        name: "Deleted",
        directionMode: "mixed",
        revision: "1",
        deletedAt: at,
      },
    ],
    cards: [],
    progress: [],
    introductions: [],
    settings: null,
    nextPage: null,
  };
  await stageFirst(local, page);
  await assert.rejects(
    local.activateSnapshot("deleted-parent", (data) => ({
      data: {
        ...data,
        cards: [
          {
            id: card,
            deckId: deck,
            sideA: "A",
            sideB: "B",
            exampleA: null,
            exampleB: null,
            contentRevision: "1",
            deletedAt: null,
          },
        ],
      },
      handledOperationIds: [],
    })),
    /usuniętego zestawu/,
  );
  assert.equal(await local.getCursor(), undefined);
  await local.activateSnapshot("deleted-parent", (data) => ({
    data,
    handledOperationIds: [],
  }));
  assert.equal(await local.getCursor(), "1");
  local.close();
});

test("review transaction rolls back when each store write fails", async () => {
  const originalAdd = IDBObjectStore.prototype.add;
  const originalPut = IDBObjectStore.prototype.put;
  for (const [i, failingStore] of [
    "reviews",
    "progress",
    "introductions",
    "outbox",
    "meta",
  ].entries()) {
    const user = `00000000-0000-4000-8000-${String(50 + i).padStart(12, "0")}`;
    const local = repo(user);
    // Open and migrate before injecting a write failure.
    await local.snapshot(card);
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === failingStore) throw new Error("injected write failure");
      return originalAdd.apply(this, args);
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === failingStore) throw new Error("injected write failure");
      return originalPut.apply(this, args);
    };
    try {
      await assert.rejects(local.commitReview(command));
    } finally {
      IDBObjectStore.prototype.add = originalAdd;
      IDBObjectStore.prototype.put = originalPut;
    }
    assert.equal((await local.lease("check", 0, 10, 10)).length, 0);
    await local.commitReview(command);
    assert.equal((await local.lease("check", 0, 10, 10)).length, 1);
    local.close();
  }
});

test("versionchange closes the existing connection and calls the owner", async () => {
  const user = "00000000-0000-4000-8000-000000000061";
  let called = 0;
  const local = createLocalRepository({
    userId: user,
    now: () => new Date(at),
    introduction: () => ({
      cardId: card,
      firstEffectiveAt: at,
      studyDay: "2026-11-17",
    }),
    blocking: () => called++,
  });
  await local.snapshot(card);
  const upgraded = await openDB(`recallio-user-${user}`, 4);
  assert.equal(called, 1);
  upgraded.close();
  local.close();
});

test("blocked upgrade signals another connection and resumes when it closes", async () => {
  const user = "00000000-0000-4000-8000-000000000062";
  const name = `recallio-user-${user}`;
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("cards", { keyPath: "id" });
      db.createObjectStore("progress", { keyPath: ["cardId", "direction"] });
      db.createObjectStore("reviews", { keyPath: "event.id" });
      db.createObjectStore("introductions", { keyPath: "cardId" });
      db.createObjectStore("outbox", { keyPath: "operation.id" });
      db.createObjectStore("meta");
    },
  });
  let unblock!: () => void;
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const local = createLocalRepository({
    userId: user,
    now: () => new Date(at),
    introduction: () => ({
      cardId: card,
      firstEffectiveAt: at,
      studyDay: "2026-11-17",
    }),
    blocked: unblock,
  });
  const opening = local.snapshot(card);
  await blocked;
  old.close();
  await opening;
  local.close();
});

test("aborted migration preserves old data and can be retried", async () => {
  const user = "00000000-0000-4000-8000-000000000063";
  const name = `recallio-user-${user}`;
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("cards", { keyPath: "id" });
      db.createObjectStore("progress", { keyPath: ["cardId", "direction"] });
      db.createObjectStore("reviews", { keyPath: "event.id" });
      db.createObjectStore("introductions", { keyPath: "cardId" });
      db.createObjectStore("outbox", { keyPath: "operation.id" });
      db.createObjectStore("meta");
    },
  });
  await old.put("outbox", { operation: command.operation, state: "pending" });
  old.close();
  const original = IDBObjectStore.prototype.createIndex;
  IDBObjectStore.prototype.createIndex = function (...args) {
    if (this.name === "reviews") throw Error("migration interrupted");
    return original.apply(this, args);
  };
  const local = repo(user);
  try {
    await assert.rejects(local.snapshot(card));
  } finally {
    IDBObjectStore.prototype.createIndex = original;
  }
  const unchanged = await openDB(name, 1);
  assert.equal((await unchanged.getAll("outbox")).length, 1);
  unchanged.close();
  assert.equal((await local.lease("retry", 0, 10, 10)).length, 1);
  local.close();
});
