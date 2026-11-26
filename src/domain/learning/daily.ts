import type {
  Candidate,
  Card,
  Deck,
  Progress,
  SessionReturn,
} from "../../contracts";
import { fsrsScheduler } from "./scheduler";

type Material = {
  decks: readonly Deck[];
  cards: readonly Card[];
  progress: readonly Progress[];
};
export type DueEntry = SessionReturn & Pick<Progress, "dueAt" | "revision">;

function eligibleCards(data: Material, allowed?: ReadonlySet<string>) {
  const decks = new Map(
    data.decks
      .filter((d) => !d.deletedAt && (!allowed || allowed.has(d.id)))
      .map((d) => [d.id, d.directionMode]),
  );
  const cards = new Map<string, { card: Card; mode: Deck["directionMode"] }>();
  for (const card of data.cards) {
    const mode = decks.get(card.deckId);
    if (!card.deletedAt && mode) cards.set(card.id, { card, mode });
  }
  return cards;
}
export function collectDue(
  data: Material,
  at: string,
  allowed?: ReadonlySet<string>,
): DueEntry[] {
  const cards = eligibleCards(data, allowed);
  return data.progress
    .filter((p) => {
      const mode = cards.get(p.cardId)?.mode;
      return (
        (mode === "mixed" || mode === p.direction) &&
        fsrsScheduler.classify(p, at) === "due"
      );
    })
    .map(({ cardId, direction, epoch, dueAt, revision }) => ({
      cardId,
      direction,
      epoch,
      dueAt,
      revision,
    }))
    .sort(
      (a, b) =>
        Date.parse(a.dueAt) - Date.parse(b.dueAt) ||
        a.cardId.localeCompare(b.cardId) ||
        a.direction.localeCompare(b.direction),
    );
}

export function sameDirection(a: SessionReturn, b: SessionReturn) {
  return (
    a.cardId === b.cardId && a.direction === b.direction && a.epoch === b.epoch
  );
}

// Pending entries identify a specific due occurrence. Session returns can reappear before their next due date.
export function dailyChoices(
  data: Material,
  pending: readonly DueEntry[],
  returns: readonly SessionReturn[],
  now: string,
  previousCardId: string | null,
  allowed?: ReadonlySet<string>,
) {
  const cards = eligibleCards(data, allowed);
  const progress = new Map(
    data.progress.map((p) => [p.cardId + ":" + p.direction, p]),
  );
  const choices: Candidate[] = [];
  function append(entry: SessionReturn, due?: DueEntry) {
    const current = progress.get(entry.cardId + ":" + entry.direction);
    const item = cards.get(entry.cardId);
    if (
      !current ||
      current.epoch !== entry.epoch ||
      !item ||
      (item.mode !== "mixed" && item.mode !== entry.direction)
    )
      return;
    if (
      due &&
      (current.dueAt !== due.dueAt || current.revision !== due.revision)
    )
      return;
    const mode = fsrsScheduler.classify(current, now);
    if (mode === "introduction" || (due && mode !== "due")) return;
    choices.push({
      card: item.card,
      direction: entry.direction,
      epoch: entry.epoch,
      mode,
    });
  }
  for (const entry of returns) append(entry);
  for (const entry of pending) append(entry, entry);
  return {
    candidate:
      choices.find((c) => c.card.id !== previousCardId) ?? choices[0] ?? null,
    remaining: choices.length,
  };
}
