import assert from "node:assert/strict";
import test from "node:test";
import {
  progressSchema,
  type Progress,
  type ReviewEvent,
} from "../src/contracts";
import {
  FSRS_VERSION,
  fsrsScheduler,
  getEffectiveReviewTime,
  resetFsrsProgress,
} from "../src/domain/learning/scheduler";
import fixture from "./fixtures/learning/fsrs6-v1.json";

const cardId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";

function sample(id: string) {
  const result = fixture.cases.find((item) => item.id === id);
  assert.ok(result, id);
  return result;
}

function project(
  source: (typeof fixture.cases)[number]["events"][number],
  previous: Progress | null,
) {
  const event: ReviewEvent = {
    ...source,
    id: "33333333-3333-4333-8333-333333333333",
    cardId,
    deviceId,
    direction: source.direction as ReviewEvent["direction"],
    rating: source.rating as ReviewEvent["rating"],
    observedMode: source.observedMode as ReviewEvent["observedMode"],
    algorithmVersion: FSRS_VERSION,
    clientSeq: "1",
    observedContentRevision: "1",
    observedProgressRevision: previous?.revision ?? null,
  };
  const effectiveAt = getEffectiveReviewTime(
    event.occurredAt,
    source.receivedAt,
    previous,
  );
  const mode = fsrsScheduler.classify(previous, effectiveAt);
  const progress = fsrsScheduler.review({
    event,
    previous,
    effectiveAt,
    mode: event.observedMode,
  });
  assert.deepEqual(
    progressSchema.parse(JSON.parse(JSON.stringify(progress))),
    progress,
  );
  return { progress, mode };
}

function assertProjection(progress: Progress, expected: object) {
  const state = progress.schedulerState.data as Record<string, unknown>;
  const fields: Record<string, unknown> = {
    ...progress,
    cardId: "card-1",
    lastModelReview: state.last_review,
    stability: state.stability,
    difficulty: state.difficulty,
    lapses: state.lapses,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(fields[key], value, key);
  }
}

const first = sample("introduction-good");

for (const id of [
  "introduction-good",
  "twenty-fast-successes",
  "on-time-review",
  "after-ten-days",
  "practice-forgotten",
  "late-event-after-due",
  "future-clock",
] as const) {
  test(`FSRS reference projection: ${id}`, () => {
    const entry = sample(id);
    let previous = entry.initial.progress.length
      ? project(first.events[0], null).progress
      : null;
    if (id === "late-event-after-due") {
      previous = project(sample("on-time-review").events[0], previous).progress;
    }
    for (const [index, event] of entry.events.entries()) {
      const { mode, progress } = project(event, previous);
      assert.equal(mode, entry.expected.canonicalModes?.[index]);
      previous = progress;
    }
    assert.ok(previous);
    if (entry.expected.progress?.[0]) {
      assertProjection(previous, entry.expected.progress[0]);
    } else {
      assertProjection(previous, {
        dueAt: entry.expected.dueAt,
        stability: entry.expected.stability,
        lastEffectiveAt: entry.expected.effectiveAt?.at(-1),
      });
    }
  });
}

test("opposite direction has independent state and the first failed review keeps its due date on a quick success", () => {
  const reverse = sample("two-directions");
  assert.ok(reverse.expected.progress?.[1]);
  assertProjection(
    project(reverse.events[0], null).progress,
    reverse.expected.progress[1],
  );
  const again = sample("introduction-forgotten-and-return");
  const failed = project(again.events[0], null);
  assert.equal(failed.progress.dueAt, again.expected.afterFirst?.dueAt);
  const success = project(again.events[1], failed.progress);
  assert.equal(success.mode, "practice");
  assertProjection(success.progress, {
    dueAt: again.expected.afterSecond?.dueAt,
    lastModelReview: again.expected.afterSecond?.lastModelReview,
  });
});

test("persisted reset starts the next epoch from a new card", () => {
  const previous = project(first.events[0], null).progress;
  const reset = progressSchema.parse(resetFsrsProgress(previous, "1"));
  assert.equal(reset.cardId, previous.cardId);
  assert.equal(reset.direction, previous.direction);
  assert.equal(reset.revision, "2");
  assert.equal(
    fsrsScheduler.classify(reset, previous.lastEffectiveAt),
    "introduction",
  );
  assert.throws(() => project(first.events[0], reset), /nie pasuje/);
  const { progress } = project({ ...first.events[0], epoch: "1" }, reset);
  assert.equal(progress.epoch, "1");
  assert.equal(progress.revision, "3");
  assert.deepEqual(progress.schedulerState, previous.schedulerState);
});

test("practice failure caps an otherwise later due date in both records", () => {
  const previous = project(first.events[0], null).progress;
  const dueAt = "2026-01-02T12:01:00.000Z";
  const capped = {
    ...previous,
    dueAt,
    schedulerState: {
      ...previous.schedulerState,
      data: { ...(previous.schedulerState.data as object), due: dueAt },
    },
  };
  const { progress, mode } = project(
    sample("practice-forgotten").events[0],
    capped,
  );
  assert.equal(mode, "practice");
  assert.equal(progress.dueAt, dueAt);
  assert.equal((progress.schedulerState.data as { due: string }).due, dueAt);
});
