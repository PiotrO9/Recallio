import { State, createEmptyCard, fsrs, type Card } from "ts-fsrs";
import { z } from "zod";
import {
  instantSchema,
  revisionSchema,
  type Progress,
  type Scheduler,
} from "../../contracts";

export const FSRS_VERSION = "recallio-fsrs6-v1";

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

const cardStateSchema = z.strictObject({
  due: instantSchema,
  stability: z.number().finite().nonnegative(),
  difficulty: z.number().finite().min(0).max(10),
  elapsed_days: z.number().int().nonnegative(),
  scheduled_days: z.number().int().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.enum(State),
  last_review: instantSchema.nullable(),
});

function serialize(card: Card): Progress["schedulerState"] {
  return {
    version: FSRS_VERSION,
    data: cardStateSchema.parse({
      ...card,
      due: card.due.toISOString(),
      last_review: card.last_review?.toISOString() ?? null,
    }),
  };
}

function timestamp(instant: string): number {
  const value = Date.parse(instantSchema.parse(instant));
  if (!Number.isFinite(value)) throw new Error("Nieprawidłowy czas oceny");
  return value;
}

function restore(progress: Progress): Card {
  if (
    progress.algorithmVersion !== FSRS_VERSION ||
    progress.schedulerState.version !== FSRS_VERSION
  ) {
    throw new Error("Niezgodna wersja schedulera");
  }
  const { due, last_review, ...state } = cardStateSchema.parse(
    progress.schedulerState.data,
  );
  if (
    timestamp(due) !== timestamp(progress.dueAt) ||
    (state.state === State.New) !== (last_review === null) ||
    (last_review !== null &&
      timestamp(last_review) > timestamp(progress.lastEffectiveAt))
  ) {
    throw new Error("Niespójny stan schedulera");
  }
  return {
    ...state,
    due: new Date(due),
    last_review: last_review === null ? undefined : new Date(last_review),
  };
}

function classify(card: Card | null, effectiveAt: number) {
  if (!card || card.state === State.New) return "introduction";
  return effectiveAt >= card.due.getTime() ? "due" : "practice";
}

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
    classify(previous, effectiveAt) {
      return classify(
        previous ? restore(previous) : null,
        timestamp(effectiveAt),
      );
    },
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
