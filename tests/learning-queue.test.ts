import assert from "node:assert/strict";
import test from "node:test";
import type { Card, QueuePolicy, ReviewEvent } from "../src/contracts";
import {
  recordSessionAnswer,
  remainingNewForDay,
  studyQueue,
} from "../src/domain/learning/queue";
import {
  getStudyDay,
  getStudyPeriod,
  scheduleStudyTimezone,
  studyTimezoneAt,
} from "../src/domain/learning/study-time";
import {
  FSRS_VERSION,
  fsrsScheduler,
  resetFsrsProgress,
} from "../src/domain/learning/scheduler";

const now = "2026-01-04T12:00:00.000Z";
const firstCard: Card = {
  id: "a",
  deckId: "deck",
  sideA: "A",
  sideB: "B",
  exampleA: null,
  exampleB: null,
  contentRevision: "0",
  deletedAt: null,
};
const secondCard = { ...firstCard, id: "b" };
const mostRecent = "2026-01-01T12:00:00.000Z";

function firstReview(card: Card, rating: ReviewEvent["rating"]) {
  const event: ReviewEvent = {
    id: "review",
    cardId: card.id,
    direction: "a-b",
    epoch: "0",
    observedMode: "introduction",
    rating,
    occurredAt: mostRecent,
    deviceId: "device",
    clientSeq: "1",
    observedContentRevision: card.contentRevision,
    observedProgressRevision: null,
    algorithmVersion: FSRS_VERSION,
  };
  const progress = fsrsScheduler.review({
    previous: null,
    mode: event.observedMode,
    effectiveAt: mostRecent,
    event,
  });
  return { event, progress };
}

function next(input: Partial<Parameters<QueuePolicy["next"]>[0]> = {}) {
  return studyQueue.next({
    cards: [firstCard, secondCard],
    progress: [],
    now,
    direction: "mixed",
    previousCardId: null,
    sessionReturns: [],
    introducedCardIds: new Set(),
    remainingNew: 1,
    random: () => 0,
    ...input,
  });
}

test("an untouched direction is available when the card has already used its daily slot", () => {
  const { progress } = firstReview(firstCard, 3);
  const candidate = next({
    progress: [progress],
    remainingNew: 0,
    direction: "b-a",
  });
  assert.deepEqual(candidate, {
    card: firstCard,
    direction: "b-a",
    epoch: "0",
    mode: "introduction",
  });
  assert.equal(next({ remainingNew: 0 }), null);
  assert.equal(
    next({ remainingNew: 0, introducedCardIds: new Set([secondCard.id]) })?.card
      .id,
    secondCard.id,
  );
});

test("due material precedes new cards and a choice avoids instantly reversing the previous card", () => {
  const { progress } = firstReview(firstCard, 3);
  assert.equal(next({ progress: [progress] })?.mode, "due");
  assert.equal(
    next({ progress: [progress], previousCardId: firstCard.id })?.card.id,
    secondCard.id,
  );
  assert.equal(next({ random: () => 0.99 })?.card.id, secondCard.id);
});

test("a failed review returns once after a different card when possible", () => {
  const { event, progress } = firstReview(firstCard, 1);
  const returns = recordSessionAnswer([], event);
  assert.equal(recordSessionAnswer(returns, event), returns);
  const snapshot = {
    now: "2026-01-01T12:02:00.000Z",
    progress: [progress],
    sessionReturns: returns,
  };
  assert.equal(
    next({ ...snapshot, previousCardId: firstCard.id })?.card.id,
    secondCard.id,
  );
  const returned = next({ ...snapshot, previousCardId: secondCard.id });
  assert.equal(returned?.card.id, firstCard.id);
  assert.equal(returned?.direction, "a-b");
  assert.equal(returned?.mode, "practice");
  assert.equal(
    next({ ...snapshot, previousCardId: firstCard.id, cards: [firstCard] })
      ?.card.id,
    firstCard.id,
  );
  assert.deepEqual(recordSessionAnswer(returns, { ...event, rating: 3 }), []);
});

test("old session returns cannot target a deleted card or a newer epoch", () => {
  const { event, progress } = firstReview(firstCard, 1);
  const sessionReturns = recordSessionAnswer([], event);
  assert.equal(
    next({
      sessionReturns,
      progress: [progress],
      cards: [{ ...firstCard, deletedAt: now }, secondCard],
    })?.card.id,
    secondCard.id,
  );
  const reset = resetFsrsProgress(progress, "1");
  const candidate = next({
    sessionReturns,
    progress: [reset],
    cards: [firstCard],
    direction: "a-b",
    remainingNew: 0,
  });
  assert.equal(candidate?.epoch, "1");
  assert.equal(candidate?.mode, "introduction");
  const afterReset = recordSessionAnswer(sessionReturns, {
    ...event,
    epoch: "1",
  });
  assert.equal(
    recordSessionAnswer(afterReset, { ...event, rating: 3 }),
    afterReset,
  );
});

test("daily limits use the profile's day and count unique cards through DST", () => {
  const timezone = "Europe/Warsaw";
  const beforeMidnight = "2026-03-29T21:59:00.000Z";
  const afterMidnight = "2026-03-29T22:00:00.000Z";
  assert.equal(getStudyDay(beforeMidnight, timezone), "2026-03-29");
  assert.equal(getStudyDay(afterMidnight, timezone), "2026-03-30");
  const introduction = {
    cardId: firstCard.id,
    firstEffectiveAt: beforeMidnight,
    studyDay: "2026-03-29",
  };
  assert.equal(
    remainingNewForDay(
      [introduction, introduction],
      getStudyPeriod(beforeMidnight, { timezone }),
      2,
    ),
    1,
  );
  assert.equal(
    remainingNewForDay(
      [introduction],
      getStudyPeriod(afterMidnight, { timezone }),
      2,
    ),
    2,
  );
  assert.equal(
    remainingNewForDay(
      [introduction],
      getStudyPeriod(beforeMidnight, { timezone }),
      0,
    ),
    0,
  );
});

test("a westward change preserves today's allowance until the old reset, even when the calendar date repeats", () => {
  const timezone = "Europe/Warsaw";
  const newTimezone = "Pacific/Honolulu";
  const beforeReset = "2026-03-29T21:59:00.000Z";
  const atReset = "2026-03-29T22:00:00.000Z";
  const timezoneChanges = scheduleStudyTimezone(
    { timezone },
    newTimezone,
    beforeReset,
  );
  const settings = { timezone, timezoneChanges };
  assert.deepEqual(timezoneChanges, [
    { timezone: newTimezone, effectiveAt: atReset },
  ]);
  const introductions = Array.from({ length: 7 }, (_, index) => ({
    cardId: String(index),
    firstEffectiveAt: beforeReset,
    studyDay: "2026-03-29",
  }));
  assert.equal(
    remainingNewForDay(
      introductions,
      getStudyPeriod(beforeReset, settings),
      20,
    ),
    13,
  );
  assert.equal(
    remainingNewForDay(introductions, getStudyPeriod(atReset, settings), 20),
    20,
  );
  assert.equal(studyTimezoneAt(atReset, settings).timezone, newTimezone);
  assert.equal(getStudyDay(atReset, newTimezone), introductions[0].studyDay);
  assert.deepEqual(getStudyPeriod(atReset, settings), {
    start: Date.parse(atReset),
    end: Date.parse("2026-03-30T10:00:00.000Z"),
  });
});

test("a second request before the reset can replace or cancel the pending change", () => {
  const timezone = "Europe/Warsaw";
  const now = "2026-10-25T10:00:00.000Z";
  const timezoneChanges = scheduleStudyTimezone(
    { timezone },
    "Pacific/Honolulu",
    now,
  );
  const settings = { timezone, timezoneChanges };
  assert.equal(
    getStudyPeriod(now, settings).start,
    Date.parse("2026-10-24T22:00:00.000Z"),
  );
  assert.deepEqual(scheduleStudyTimezone(settings, "Asia/Tokyo", now), [
    { timezone: "Asia/Tokyo", effectiveAt: "2026-10-25T23:00:00.000Z" },
  ]);
  assert.equal(scheduleStudyTimezone(settings, timezone, now), undefined);
  assert.equal(
    scheduleStudyTimezone(settings, "Pacific/Honolulu", now),
    timezoneChanges,
  );
  const later = scheduleStudyTimezone(
    settings,
    "Asia/Tokyo",
    "2026-10-26T03:00:00.000Z",
  );
  assert.deepEqual(later, [
    { timezone: "Pacific/Honolulu", effectiveAt: "2026-10-25T23:00:00.000Z" },
    { timezone: "Asia/Tokyo", effectiveAt: "2026-10-26T10:00:00.000Z" },
  ]);
  assert.equal(
    studyTimezoneAt(now, { timezone, timezoneChanges: later }).timezone,
    timezone,
  );
});
