import { State, createEmptyCard, fsrs } from "ts-fsrs";
import { revisionSchema, type Progress, type Scheduler } from "../../contracts";
import {
  classify,
  classifyProgress,
  FSRS_VERSION,
  restore,
  serialize,
  timestamp,
} from "./progress-state";
export { FSRS_VERSION } from "./progress-state";

const engine = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: false,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542,
  ],
});

function nextRevision(previous: Progress | null): string {
  return revisionSchema.parse(
    (BigInt(previous?.revision ?? "0") + 1n).toString(),
  );
}

export function getEffectiveReviewTime(
  occurredAt: string,
  receivedAt: string,
  previous?: Pick<Progress, "lastEffectiveAt"> | null,
): string {
  const received = Math.min(timestamp(occurredAt), timestamp(receivedAt));
  return new Date(
    previous
      ? Math.max(received, timestamp(previous.lastEffectiveAt))
      : received,
  ).toISOString();
}

export const fsrsScheduler: Scheduler & Required<Pick<Scheduler, "classify">> =
  {
    version: FSRS_VERSION,
    classify: classifyProgress,
    review({ previous, event, effectiveAt }) {
      if (
        event.algorithmVersion !== FSRS_VERSION ||
        (previous &&
          (event.cardId !== previous.cardId ||
            event.direction !== previous.direction ||
            event.epoch !== previous.epoch))
      ) {
        throw new Error("Ocena nie pasuje do projekcji FSRS");
      }

      const card = previous ? restore(previous) : null;
      const time = timestamp(effectiveAt);
      if (previous && time < timestamp(previous.lastEffectiveAt)) {
        throw new Error("Czas oceny cofa projekcję");
      }
      const mode = classify(card, time);
      const reviewedAt = new Date(time);
      const projection = {
        cardId: event.cardId,
        direction: event.direction,
        epoch: event.epoch,
        lastEffectiveAt: reviewedAt.toISOString(),
        revision: nextRevision(previous),
        algorithmVersion: FSRS_VERSION,
      };

      if (previous && mode === "practice" && event.rating > 1) {
        return {
          ...projection,
          dueAt: previous.dueAt,
          schedulerState: previous.schedulerState,
        };
      }

      const next = engine.next(
        card?.state === State.New || !card ? createEmptyCard(reviewedAt) : card,
        reviewedAt,
        event.rating,
      ).card;
      if (card && mode === "practice" && next.due > card.due) {
        next.due = card.due;
      }
      return {
        ...projection,
        dueAt: next.due.toISOString(),
        schedulerState: serialize(next),
      };
    },
  };

export function resetFsrsProgress(previous: Progress, epoch: string): Progress {
  restore(previous);
  if (BigInt(revisionSchema.parse(epoch)) !== BigInt(previous.epoch) + 1n) {
    throw new Error("Reset wymaga następnej epoki");
  }
  const fresh = createEmptyCard(new Date(previous.lastEffectiveAt));
  return {
    ...previous,
    epoch,
    dueAt: fresh.due.toISOString(),
    schedulerState: serialize(fresh),
    revision: nextRevision(previous),
  };
}
