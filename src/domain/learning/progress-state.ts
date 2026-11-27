import { State, type Card } from "ts-fsrs";
import { z } from "zod";
import { instantSchema, type Progress } from "../../contracts";

export const FSRS_VERSION = "recallio-fsrs6-v1";

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

export function serialize(card: Card): Progress["schedulerState"] {
  return {
    version: FSRS_VERSION,
    data: cardStateSchema.parse({
      ...card,
      due: card.due.toISOString(),
      last_review: card.last_review?.toISOString() ?? null,
    }),
  };
}

export function timestamp(instant: string): number {
  const value = Date.parse(instantSchema.parse(instant));
  if (!Number.isFinite(value)) throw new Error("Nieprawidłowy czas oceny");
  return value;
}

export function restore(progress: Progress): Card {
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

export function classify(card: Card | null, effectiveAt: number) {
  if (!card || card.state === State.New) return "introduction";
  return effectiveAt >= card.due.getTime() ? "due" : "practice";
}

export function classifyProgress(
  previous: Progress | null,
  effectiveAt: string,
) {
  return classify(previous ? restore(previous) : null, timestamp(effectiveAt));
}
