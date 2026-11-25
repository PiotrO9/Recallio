import {
  type Candidate,
  type Direction,
  type Introduction,
  type Progress,
  type QueuePolicy,
  type ReviewEvent,
  type SessionReturn,
} from "../../contracts";
import { fsrsScheduler } from "./scheduler";
import type { getStudyPeriod } from "./study-time";

export const DEFAULT_NEW_LIMIT = 20;

const directions = ["a-b", "b-a"] as const;

function progressKey(cardId: string, direction: Direction): string {
  return `${cardId}:${direction}`;
}

/** Call after commit. Identity includes direction and reset epoch. */
export function recordSessionAnswer(
  returns: readonly SessionReturn[],
  review: SessionReturn & Pick<ReviewEvent, "rating">,
): readonly SessionReturn[] {
  const { cardId, direction, epoch, rating } = review;
  const current = returns.find(
    (item) => item.cardId === cardId && item.direction === direction,
  );
  if (
    (current && BigInt(current.epoch) > BigInt(epoch)) ||
    (current?.epoch === epoch && rating === 1)
  ) {
    return returns;
  }
  const others = returns.filter(
    (item) => item.cardId !== cardId || item.direction !== direction,
  );
  return rating === 1 ? [...others, { cardId, direction, epoch }] : others;
}

export function remainingNewForDay(
  introductions: readonly Introduction[],
  period: ReturnType<typeof getStudyPeriod>,
  limit: number,
): number {
  const counted = new Set(
    introductions
      .filter((item) => {
        const introducedAt = Date.parse(item.firstEffectiveAt);
        return introducedAt >= period.start && introducedAt < period.end;
      })
      .map((item) => item.cardId),
  );
  return Math.max(0, limit - counted.size);
}

interface Option {
  candidate: Candidate;
  progress: Progress | undefined;
  known: boolean;
}

export const studyQueue: QueuePolicy = {
  next({
    cards,
    progress,
    now,
    direction,
    previousCardId,
    sessionReturns,
    introducedCardIds,
    remainingNew,
    random,
  }) {
    const byKey = new Map(
      progress.map((item) => [progressKey(item.cardId, item.direction), item]),
    );
    const knownCards = new Set(introducedCardIds);
    for (const item of progress) knownCards.add(item.cardId);
    const options: Option[] = [];
    for (const card of cards) {
      if (card.deletedAt) continue;
      const known = knownCards.has(card.id);
      if (!known && remainingNew <= 0) continue;
      for (const side of direction === "mixed" ? directions : [direction]) {
        const state = byKey.get(progressKey(card.id, side));
        options.push({
          candidate: {
            card,
            direction: side,
            epoch: state?.epoch ?? "0",
            mode: fsrsScheduler.classify(state ?? null, now),
          },
          progress: state,
          known,
        });
      }
    }
    if (!options.length) return null;

    // A different card takes precedence over an instant reversal in mixed mode.
    const alternatives = options.filter(
      (option) => option.candidate.card.id !== previousCardId,
    );
    const choices = alternatives.length ? alternatives : options;
    const returnByKey = new Map(
      choices
        .filter((option) => option.progress)
        .map(({ candidate }) => [
          progressKey(candidate.card.id, candidate.direction),
          candidate,
        ]),
    );
    for (const entry of sessionReturns) {
      const candidate = returnByKey.get(
        progressKey(entry.cardId, entry.direction),
      );
      if (candidate?.epoch === entry.epoch) return candidate;
    }

    const due = choices
      .filter(({ candidate }) => candidate.mode === "due")
      .sort(
        (a, b) => Date.parse(a.progress!.dueAt) - Date.parse(b.progress!.dueAt),
      );
    if (due[0]) return due[0].candidate;

    const unseen = choices.filter(({ known }) => !known);
    const unstudiedDirections = choices.filter(
      ({ candidate }) => candidate.mode === "introduction",
    );
    const pool = unseen.length
      ? unseen
      : unstudiedDirections.length
        ? unstudiedDirections
        : choices;
    const selected = pool.length === 1 ? 0 : Math.floor(random() * pool.length);
    if (!pool[selected]) throw new RangeError("Losowość poza zakresem [0, 1)");
    return pool[selected].candidate;
  },
};
