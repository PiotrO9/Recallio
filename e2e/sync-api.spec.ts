import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
} from "@playwright/test";

test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Requires a local database",
);

test("sync receipts, pagination, projection and account isolation", async ({
  browser,
  request,
  baseURL,
}) => {
  const serviceKey = process.env.RECALLIO_TEST_SERVICE_ROLE_KEY;
  expect(serviceKey).toBeTruthy();
  const admin = {
    apikey: serviceKey!,
    authorization: `Bearer ${serviceKey}`,
  };
  const authAdmin = "http://127.0.0.1:54321/auth/v1/admin/users";
  const accounts: string[] = [];
  const contexts: BrowserContext[] = [];

  async function signIn(instance: Browser) {
    const email = `${randomUUID()}@example.test`;
    const password = randomUUID();
    const created = await request.post(authAdmin, {
      headers: admin,
      data: { email, password, email_confirm: true },
    });
    expect(created.status()).toBe(200);
    const { id } = (await created.json()) as { id: string };
    accounts.push(id);
    const context = await instance.newContext({ baseURL });
    contexts.push(context);
    const signedIn = await context.request.post("/auth/actions", {
      headers: { origin: baseURL! },
      form: { intent: "login", email, password },
      maxRedirects: 0,
    });
    expect(signedIn.headers().location).toBe("/");
    return { id, api: context.request };
  }

  try {
    const first = await signIn(browser);
    const second = await signIn(browser);
    const unauthenticated = await request.get("/api/v1/sync/snapshot");
    expect(unauthenticated.status()).toBe(401);
    expect(unauthenticated.headers()["cache-control"]).toContain("no-store");
    const switched = await second.api.get("/api/v1/sync/pull", {
      headers: { "X-Recallio-Account": first.id },
    });
    expect(switched.status()).toBe(401);

    const deviceId = randomUUID();
    async function push(operations: unknown[]) {
      const response = await first.api.post("/api/v1/sync/push", {
        headers: { origin: baseURL! },
        data: { protocolVersion: 1, deviceId, operations },
      });
      expect(response.status()).toBe(200);
      return (await response.json()).results;
    }
    const entityId = randomUUID();
    const cardId = randomUUID();
    const deck = {
      id: randomUUID(),
      entityId,
      type: "deck.create",
      payload: { name: "Własny zestaw", directionMode: "mixed" },
    };
    const settings = {
      id: randomUUID(),
      type: "settings.update",
      entityId: first.id,
      baseRevision: "0",
      payload: {
        timezone: "Pacific/Honolulu",
        newLimit: 2,
        showDue: true,
        showSession: false,
      },
    };
    const create = {
      id: randomUUID(),
      type: "card.create",
      entityId: cardId,
      payload: {
        deckId: entityId,
        sideA: "pies",
        sideB: "dog",
        exampleA: null,
        exampleB: null,
      },
    };
    const partial = await push([deck, { id: randomUUID() }, settings, create]);
    expect(partial.map(({ status }: { status: string }) => status)).toEqual([
      "applied",
      "rejected",
      "applied",
      "applied",
    ]);
    expect(partial[2].entity.timezone).toBe("Europe/Warsaw");
    expect(partial[2].entity.timezoneChanges).toBeUndefined();
    expect(await push([deck])).toMatchObject([
      { status: "duplicate", commitCursor: partial[0].commitCursor },
    ]);
    expect(
      await push([
        { ...deck, payload: { ...deck.payload, name: "Inna treść" } },
      ]),
    ).toMatchObject([{ status: "rejected", error: "id_reuse" }]);
    const edits = ["Pierwsza edycja", "Druga edycja"].map((name) => ({
      ...deck,
      type: "deck.update",
      id: randomUUID(),
      baseRevision: "0",
      payload: { ...deck.payload, name },
    }));
    const editsResults = await Promise.all(edits.map((edit) => push([edit])));
    expect(
      editsResults
        .flat()
        .map(({ status }) => status)
        .sort(),
    ).toEqual(["applied", "conflict"]);

    const review = {
      id: randomUUID(),
      type: "review.record",
      entityId: cardId,
      payload: {
        direction: "a-b",
        rating: 3,
        observedMode: "due",
        epoch: "0",
        occurredAt: "2026-01-01T12:00:00.000Z",
        clientSeq: "1",
        observedContentRevision: "0",
        observedProgressRevision: null,
        algorithmVersion: "recallio-fsrs6-v1",
      },
    };
    const [accepted] = await push([review]);
    expect(accepted.status).toBe("applied");
    expect(await push([review])).toMatchObject([
      { status: "duplicate", commitCursor: accepted.commitCursor },
    ]);
    const captured = await (
      await first.api.get("/api/v1/sync/snapshot")
    ).json();
    expect(captured.watermark).toBe(accepted.commitCursor);
    expect(captured.progress).toMatchObject([
      { dueAt: "2026-01-04T12:00:00.000Z", epoch: "0" },
    ]);
    expect(captured.introductions).toMatchObject([{ cardId }]);

    const reset = {
      id: randomUUID(),
      type: "progress.reset",
      entityId: cardId,
      baseRevision: accepted.revision,
      payload: { direction: "a-b", epoch: "1" },
    };
    expect(await push([reset])).toMatchObject([{ status: "applied" }]);
    expect(
      await push([
        {
          ...review,
          id: randomUUID(),
          payload: { ...review.payload, clientSeq: "2" },
        },
      ]),
    ).toMatchObject([{ status: "applied" }]);
    const stored = await first.api.get(
      `/api/v1/sync/snapshot?snapshotToken=${captured.snapshotToken}`,
    );
    expect(await stored.json()).toEqual(captured);
    const otherSnapshot = await second.api.get(
      `/api/v1/sync/snapshot?snapshotToken=${captured.snapshotToken}`,
    );
    expect(otherSnapshot.status()).toBe(409);
    const ownEmpty = await (
      await second.api.get("/api/v1/sync/snapshot")
    ).json();
    expect(ownEmpty).toMatchObject({ decks: [], cards: [], progress: [] });

    const changes = [];
    let cursor = "0";
    while (true) {
      const page = await (
        await first.api.get(`/api/v1/sync/pull?cursor=${cursor}&limit=2`)
      ).json();
      expect(page.changes.length).toBeGreaterThan(0);
      changes.push(...page.changes);
      cursor = page.nextCursor;
      if (!page.hasMore) break;
      expect(changes.length).toBeLessThan(20);
    }
    changes.forEach((change, index) =>
      expect(change.sequence).toBe(String(index + 1)),
    );
    const reviews = changes.filter((change) => change.entity === "review");
    expect(reviews).toHaveLength(2);
    expect(reviews[0].payload).toMatchObject({
      disposition: "applied",
      canonicalMode: "introduction",
    });
    expect(reviews[1].payload).toMatchObject({
      disposition: "ignored_old_epoch",
      canonicalMode: null,
    });

    const example = "x".repeat(7000);
    const largeBatch = Array.from({ length: 40 }, (_, index) => ({
      ...create,
      id: randomUUID(),
      entityId: randomUUID(),
      payload: {
        ...create.payload,
        sideA: String(index),
        exampleA: example,
        exampleB: example,
      },
    }));
    expect(
      (await push(largeBatch)).every(
        ({ status }: { status: string }) => status === "applied",
      ),
    ).toBe(true);
    const firstPage = await (
      await first.api.get("/api/v1/sync/snapshot")
    ).json();
    expect(firstPage.nextPage).toBe("1");
    const extra = { ...create, id: randomUUID(), entityId: randomUUID() };
    expect(await push([extra])).toMatchObject([{ status: "applied" }]);
    const nextPage = await (
      await first.api.get(
        `/api/v1/sync/snapshot?snapshotToken=${firstPage.snapshotToken}&pageToken=1`,
      )
    ).json();
    expect(nextPage.watermark).toBe(firstPage.watermark);
    expect(nextPage.nextPage).toBeNull();
    const cardIds = [...firstPage.cards, ...nextPage.cards].map(({ id }) => id);
    expect(new Set(cardIds).size).toBe(41);
    expect(cardIds).not.toContain(extra.entityId);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all(
      accounts.map((id) =>
        request.delete(`${authAdmin}/${id}`, { headers: admin }),
      ),
    );
  }
});
