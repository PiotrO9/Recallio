import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Candidate } from "../src/contracts";
import { FSRS_VERSION } from "../src/domain/learning/scheduler";
import {
  prepareReview,
  reprojectReview,
} from "../src/features/study/prepare-review";
import {
  createLocalRepository,
  ReviewProjectionConflict,
} from "../src/storage/local-repository";

const later = "2026-11-17T12:05:00.000Z";
const earlier = "2026-11-17T12:03:00.000Z";
const candidate: Candidate = {
  card: {
    id: randomUUID(),
    deckId: randomUUID(),
    sideA: "kot",
    sideB: "cat",
    exampleA: null,
    exampleB: null,
    contentRevision: "7",
    deletedAt: null,
  },
  direction: "b-a",
  epoch: "0",
  mode: "introduction",
};

function openRepository(userId: string) {
  return createLocalRepository({
    userId,
    now: () => new Date(later),
    introduction: (event) => ({
      cardId: event.cardId,
      firstEffectiveAt: event.occurredAt,
      studyDay: "2026-11-17",
    }),
  });
}

test("kolejna ocena używa aktualnego postępu dla wybranego kierunku i zachowuje treść zdarzenia w outboksie", async (t) => {
  const repository = openRepository(randomUUID());
  t.after(() => repository.close());
  const first = await prepareReview(
    repository,
    candidate,
    4,
    () => earlier,
    randomUUID,
  );
  await repository.commitReview(first);

  const nextId = randomUUID();
  const next = await prepareReview(
    repository,
    candidate,
    2,
    () => later,
    () => nextId,
  );
  const expectedPayload = {
    direction: "b-a",
    rating: 2,
    observedMode: "practice",
    occurredAt: later,
    clientSeq: "2",
    observedContentRevision: "7",
    observedProgressRevision: "1",
    epoch: candidate.epoch,
    algorithmVersion: FSRS_VERSION,
  };
  assert.deepEqual(next.event, {
    ...expectedPayload,
    id: nextId,
    cardId: candidate.card.id,
    deviceId: first.event.deviceId,
  });
  await repository.commitReview(next);
  const pending = await repository.lease("sync", 0, 100, 10);
  assert.deepEqual(
    pending.map((item) => item.operation.id),
    [first.event.id, next.event.id],
  );
  assert.deepEqual(pending[1].operation, {
    type: "review.record",
    id: next.event.id,
    entityId: candidate.card.id,
    payload: expectedPayload,
  });
  assert.equal(await repository.readProgress(candidate.card.id, "a-b"), null);
});

test("po konflikcie dwóch kart przeglądarki ponowienie zachowuje obie oceny i nie cofa zegara postępu", async (t) => {
  const userId = randomUUID();
  const firstTab = openRepository(userId);
  const secondTab = openRepository(userId);
  t.after(() => {
    firstTab.close();
    secondTab.close();
  });

  const first = await prepareReview(
    firstTab,
    candidate,
    4,
    () => later,
    randomUUID,
  );
  const stale = await prepareReview(
    secondTab,
    candidate,
    3,
    () => earlier,
    randomUUID,
  );
  const original = structuredClone(stale);
  await firstTab.commitReview(first);
  await assert.rejects(secondTab.commitReview(stale), ReviewProjectionConflict);

  const retry = await reprojectReview(secondTab, stale);
  assert.deepEqual(retry.event, original.event);
  assert.deepEqual(retry.operation, original.operation);
  assert.equal(retry.progress.lastEffectiveAt, later);
  assert.equal(retry.progress.dueAt, first.progress.dueAt);
  assert.equal(retry.progress.revision, "2");
  const receipt = await secondTab.commitReview(retry);
  assert.deepEqual(await secondTab.commitReview(retry), receipt);
  assert.deepEqual(
    await firstTab.readProgressVersion(candidate.card.id, "b-a"),
    { localVersion: "2", progress: retry.progress },
  );
  const pending = await firstTab.lease("sync", 0, 100, 10);
  assert.deepEqual(
    pending.map((item) => item.operation),
    [first.operation, original.operation],
  );
  const { introductions } = await firstTab.readWorkspace();
  assert.deepEqual(introductions, [
    {
      cardId: candidate.card.id,
      firstEffectiveAt: later,
      studyDay: "2026-11-17",
    },
  ]);
});
