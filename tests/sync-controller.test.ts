import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Operation, PullResponse } from "../src/contracts";
import { createLocalRepository } from "../src/storage/local-repository";
import { createSyncController } from "../src/sync/controller";

const stamp = "2026-01-01T12:00:00.000Z";

function setup() {
  const userId = randomUUID();
  const repository = createLocalRepository({
    userId,
    now: () => new Date(stamp),
    introduction: () => {
      throw new Error("Unexpected introduction");
    },
  });
  const create: Operation = {
    type: "deck.create",
    id: randomUUID(),
    entityId: randomUUID(),
    payload: { name: "Test", directionMode: "mixed" },
  };
  const deck = {
    id: create.entityId,
    ...create.payload,
    deletedAt: null,
    revision: "0",
  };
  const changed: PullResponse["changes"][number] = {
    entity: "deck",
    entityId: deck.id,
    revision: deck.revision,
    payload: deck,
    sequence: "1",
    deleted: false,
  };
  return { userId, repository, create, deck, changed };
}

test("timeout after commit retries the same operation and applies the receipt with the page", async () => {
  const { userId, repository, create, deck, changed } = setup();
  await repository.commitContent(create, null);
  let time = 0;
  let sends = 0;
  let sentBody: unknown;
  const sync = createSyncController({
    userId,
    repository,
    now: () => time,
    random: () => 0,
    id: randomUUID,
    online: () => true,
    fetch: async (url, init) => {
      assert.equal(
        new Headers(init?.headers).get("X-Recallio-Account"),
        userId,
      );
      if (String(url).endsWith("push")) {
        sends++;
        if (sends === 1) {
          sentBody = init?.body;
          throw new Error("Response lost");
        }
        assert.equal(init?.body, sentBody);
        return Response.json({
          serverTime: stamp,
          results: [
            { operationId: create.id, status: "duplicate", commitCursor: "1" },
          ],
        });
      }
      return Response.json({
        changes: [changed],
        nextCursor: "1",
        hasMore: false,
        serverTime: stamp,
      });
    },
  });
  try {
    assert.equal(await sync.run(), "retry");
    assert.equal(await sync.run(), "retry");
    assert.equal(sends, 1);
    time = sync.retryAt();
    assert.equal(await sync.run(), "idle");
    assert.equal(await repository.getCursor(), "1");
    assert.deepEqual(await repository.readContent("deck", deck.id), deck);
    assert.equal(await repository.clearForLogout(false), 0);
  } finally {
    repository.close();
  }
});

test("pull rolls back an entire page when a later entity is invalid", async () => {
  const { repository, changed, deck } = setup();
  const bad: PullResponse["changes"][number] = {
    ...changed,
    sequence: "2",
    entityId: randomUUID(),
  };
  try {
    await assert.rejects(
      repository.applyPullPage("0", {
        changes: [changed, bad],
        hasMore: false,
        nextCursor: "2",
        serverTime: stamp,
      }),
      /Niespójny zestaw/,
    );
    assert.equal(await repository.getCursor(), undefined);
    assert.equal(await repository.readContent("deck", deck.id), null);
    assert.equal(
      await repository.applyPullPage("0", {
        changes: [changed],
        hasMore: false,
        nextCursor: "1",
        serverTime: stamp,
      }),
      true,
    );
    assert.equal(
      await repository.applyPullPage("0", {
        changes: [changed],
        hasMore: false,
        nextCursor: "1",
        serverTime: stamp,
      }),
      false,
    );
  } finally {
    repository.close();
  }
});

test("authentication failure preserves the queued operation until the same account resumes", async () => {
  const { userId, repository, create, changed } = setup();
  await repository.commitContent(create, null);
  const bodies: unknown[] = [];
  const sync = createSyncController({
    userId,
    repository,
    now: () => 0,
    random: () => 0,
    id: randomUUID,
    online: () => true,
    fetch: async (url, init) => {
      if (String(url).endsWith("push")) {
        bodies.push(init?.body);
        if (bodies.length === 1) return new Response(null, { status: 401 });
        return Response.json({
          serverTime: stamp,
          results: [
            { operationId: create.id, status: "applied", commitCursor: "1" },
          ],
        });
      }
      return Response.json({
        changes: [changed],
        nextCursor: "1",
        hasMore: false,
        serverTime: stamp,
      });
    },
  });
  try {
    assert.equal(await sync.run(), "requires_auth");
    assert.equal(await repository.clearForLogout(false), 1);
    assert.equal(await sync.run(), "idle");
    assert.equal(bodies[0], bodies[1]);
    assert.equal(await repository.getCursor(), "1");
  } finally {
    repository.close();
  }
});

test("the client activates a complete paginated snapshot and can resume after interruption", async () => {
  const { userId, repository, deck } = setup();
  let time = 0;
  let interrupted = true;
  const sync = createSyncController({
    userId,
    repository,
    now: () => time,
    random: () => 0,
    id: randomUUID,
    online: () => true,
    fetch: async (url) => {
      const next = String(url).includes("pageToken=1");
      if (next && interrupted) throw new Error("Disconnected during snapshot");
      return Response.json({
        snapshotToken: "snapshot",
        watermark: "2",
        nextPage: next ? null : "1",
        decks: next ? [] : [deck],
        cards: [],
        progress: [],
        introductions: [],
        settings: null,
      });
    },
  });
  try {
    assert.equal(await sync.run(true), "retry");
    assert.equal(await repository.getCursor(), undefined);
    assert.equal(await repository.readContent("deck", deck.id), null);
    interrupted = false;
    time = sync.retryAt();
    assert.equal(await sync.run(true), "idle");
    assert.equal(await repository.getCursor(), "2");
    assert.deepEqual(await repository.readContent("deck", deck.id), deck);
  } finally {
    repository.close();
  }
});
