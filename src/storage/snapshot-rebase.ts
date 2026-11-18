import {
  progressSchema,
  reviewEventSchema,
  type Progress,
  type ReviewEvent,
  type Scheduler,
} from "../contracts";
import type { RebaseSnapshot } from "./local-repository";

/** Replays unconfirmed operations without silently overwriting server revisions. */
export type ResetProjection = (previous: Progress, epoch: string) => Progress;
export function createSnapshotRebaser(
  scheduler: Scheduler,
  reset?: ResetProjection,
): RebaseSnapshot {
  return (snapshot, pending, local) => {
    const decks = new Map(snapshot.decks.map((item) => [item.id, item]));
    const cards = new Map(snapshot.cards.map((item) => [item.id, item]));
    let settings = snapshot.settings;
    const progress = new Map(
      snapshot.progress.map((item) => [
        `${item.cardId}:${item.direction}`,
        item,
      ]),
    );
    const introductions = new Map(
      snapshot.introductions.map((item) => [item.cardId, item]),
    );
    const events = new Map(local.reviews.map((event) => [event.id, event]));
    const resetKeys = new Set<string>();
    const localIntroductions = new Map(
      local.introductions.map((item) => [item.cardId, item]),
    );
    const handledOperationIds: string[] = [];
    for (const item of pending) {
      const operation = item.operation;
      if (item.state === "blocked")
        throw new Error("Rebase wymaga rozstrzygnięcia zablokowanej operacji");
      switch (operation.type) {
        case "deck.create": {
          if (decks.has(operation.entityId))
            throw new Error("Konflikt tworzenia zestawu");
          decks.set(operation.entityId, {
            id: operation.entityId,
            ...operation.payload,
            revision: "0",
            deletedAt: null,
          });
          break;
        }
        case "deck.update":
        case "deck.delete": {
          const deck = decks.get(operation.entityId);
          if (!deck) throw new Error("Brak zestawu dla operacji");
          if (deck.deletedAt) break;
          if (deck.revision !== operation.baseRevision)
            throw new Error("Konflikt rewizji zestawu");
          if (operation.type === "deck.update")
            decks.set(deck.id, { ...deck, ...operation.payload });
          else {
            const deletedAt = local.decks.find(
              (value) => value.id === deck.id,
            )?.deletedAt;
            if (!deletedAt) throw new Error("Brak lokalnego tombstone zestawu");
            decks.set(deck.id, { ...deck, deletedAt });
          }
          break;
        }
        case "card.create": {
          if (cards.has(operation.entityId))
            throw new Error("Konflikt tworzenia fiszki");
          const deck = decks.get(operation.payload.deckId);
          if (!deck || deck.deletedAt)
            throw new Error("Brak aktywnego zestawu dla fiszki");
          cards.set(operation.entityId, {
            id: operation.entityId,
            ...operation.payload,
            contentRevision: "0",
            deletedAt: null,
          });
          break;
        }
        case "card.update":
        case "card.delete": {
          const card = cards.get(operation.entityId);
          if (!card) throw new Error("Brak fiszki dla operacji");
          const deck = decks.get(card.deckId);
          if (!deck) throw new Error("Brak zestawu dla fiszki");
          if (card.deletedAt || deck.deletedAt) break;
          if (card.contentRevision !== operation.baseRevision)
            throw new Error("Konflikt rewizji fiszki");
          if (operation.type === "card.update")
            cards.set(card.id, { ...card, ...operation.payload });
          else {
            const deletedAt = local.cards.find(
              (value) => value.id === card.id,
            )?.deletedAt;
            if (!deletedAt) throw new Error("Brak lokalnego tombstone fiszki");
            cards.set(card.id, { ...card, deletedAt });
          }
          break;
        }
        case "settings.update": {
          if ((settings?.revision ?? "0") !== operation.baseRevision)
            throw new Error("Konflikt rewizji ustawień");
          settings = {
            ...operation.payload,
            // The server schedules timezone changes using its own clock.
            timezone: settings?.timezone ?? operation.payload.timezone,
            ...(settings?.timezoneChanges && {
              timezoneChanges: settings.timezoneChanges,
            }),
            revision: settings?.revision ?? "0",
          };
          break;
        }
        case "progress.reset": {
          const card = cards.get(operation.entityId);
          const deck = card && decks.get(card.deckId);
          if (!card || !deck) throw new Error("Brak fiszki dla resetu");
          if (card.deletedAt || deck.deletedAt) break;
          const key = `${operation.entityId}:${operation.payload.direction}`;
          const previous = progress.get(key);
          if (
            !previous ||
            previous.revision !== operation.baseRevision ||
            BigInt(operation.payload.epoch) !== BigInt(previous.epoch) + 1n
          )
            throw new Error("Konflikt resetu postępu");
          if (!reset)
            throw new Error(
              "Rebase nie obsługuje progress.reset bez polityki resetu",
            );
          const projected = progressSchema.parse(
            reset(previous, operation.payload.epoch),
          );
          if (
            projected.cardId !== previous.cardId ||
            projected.direction !== previous.direction ||
            projected.epoch !== operation.payload.epoch ||
            projected.algorithmVersion !== previous.algorithmVersion
          )
            throw new Error("Niespójny wynik resetu");
          progress.set(key, projected);
          resetKeys.add(key);
          break;
        }
        case "review.record":
          break;
      }
      if (operation.type !== "review.record") {
        handledOperationIds.push(operation.id);
        continue;
      }
      const event = events.get(operation.id);
      if (
        !event ||
        event.cardId !== operation.entityId ||
        event.direction !== operation.payload.direction ||
        event.algorithmVersion !== scheduler.version ||
        Object.entries(operation.payload).some(
          ([key, value]) => event[key as keyof ReviewEvent] !== value,
        )
      )
        throw new Error("Brak zgodnego zdarzenia lub schedulera dla rebase");
      reviewEventSchema.parse(event);
      const card = cards.get(event.cardId);
      if (!card) throw new Error("Brak fiszki dla oczekującej oceny");
      const deck = decks.get(card.deckId);
      if (!deck) throw new Error("Brak zestawu dla oczekującej oceny");
      const key = `${event.cardId}:${event.direction}`;
      const previous = progress.get(key) ?? null;
      // History and outbox remain; deleted material and older epochs do not update projection.
      if (
        !card.deletedAt &&
        !deck.deletedAt &&
        (!previous || previous.epoch === event.epoch)
      ) {
        if (!previous && event.epoch !== "0")
          throw new Error("Brak stanu bieżącej epoki dla oczekującej oceny");
        const effectiveAt =
          previous &&
          Date.parse(previous.lastEffectiveAt) > Date.parse(event.occurredAt)
            ? previous.lastEffectiveAt
            : event.occurredAt;
        const isResetIntroduction = resetKeys.has(key);
        const fallbackMode =
          !previous || isResetIntroduction
            ? "introduction"
            : Date.parse(effectiveAt) >= Date.parse(previous.dueAt)
              ? "due"
              : "practice";
        const mode =
          scheduler.classify?.(previous, effectiveAt) ?? fallbackMode;
        const projected: Progress = progressSchema.parse(
          scheduler.review({
            previous:
              isResetIntroduction && !scheduler.classify ? null : previous,
            event,
            effectiveAt,
            mode,
          }),
        );
        if (
          projected.cardId !== event.cardId ||
          projected.direction !== event.direction ||
          projected.epoch !== event.epoch ||
          projected.algorithmVersion !== event.algorithmVersion
        )
          throw new Error("Scheduler zwrócił niespójną projekcję");
        progress.set(key, projected);
        resetKeys.delete(key);
        if (mode === "introduction" && !introductions.has(event.cardId)) {
          const introduction = localIntroductions.get(event.cardId);
          if (!introduction)
            throw new Error(
              "Brak lokalnego wprowadzenia dla oczekującej oceny",
            );
          introductions.set(event.cardId, introduction);
        }
      } else if (
        !card.deletedAt &&
        !deck.deletedAt &&
        previous &&
        BigInt(event.epoch) > BigInt(previous.epoch)
      ) {
        throw new Error("Snapshot nie zawiera bieżącej epoki oceny");
      }
      handledOperationIds.push(operation.id);
    }
    return {
      data: {
        ...snapshot,
        decks: [...decks.values()],
        cards: [...cards.values()],
        settings,
        progress: [...progress.values()],
        introductions: [...introductions.values()],
      },
      handledOperationIds,
    };
  };
}
