import type { Card, Deck, ContentOperation, Settings } from "../contracts";
import { STUDY_TIMEZONE } from "../domain/learning/study-time";

type Records = { card?: Card; deck?: Deck; settings: Settings | null };
export function applyContent(
  operation: ContentOperation,
  { deck, card, settings }: Records,
  deletedAt: () => string | null | undefined,
): Deck | Card | Settings {
  switch (operation.type) {
    case "deck.create":
      if (deck) throw new Error("Konflikt tworzenia zestawu");
      return {
        id: operation.entityId,
        ...operation.payload,
        revision: "0",
        deletedAt: null,
      };
    case "deck.update":
    case "deck.delete": {
      if (!deck) throw new Error("Brak zestawu dla operacji");
      if (deck.deletedAt) return deck;
      if (deck.revision !== operation.baseRevision)
        throw new Error("Konflikt rewizji zestawu");
      if (operation.type === "deck.update")
        return { ...deck, ...operation.payload };
      const date = deletedAt();
      if (!date) throw new Error("Brak lokalnego tombstone zestawu");
      return { ...deck, deletedAt: date };
    }
    case "card.create":
      if (card) throw new Error("Konflikt tworzenia fiszki");
      if (!deck || deck.deletedAt)
        throw new Error("Brak aktywnego zestawu dla fiszki");
      return {
        id: operation.entityId,
        ...operation.payload,
        contentRevision: "0",
        deletedAt: null,
      };
    case "card.update":
    case "card.delete": {
      if (!card) throw new Error("Brak fiszki dla operacji");
      if (!deck) throw new Error("Brak zestawu dla fiszki");
      if (card.deletedAt || deck.deletedAt) return card;
      if (card.contentRevision !== operation.baseRevision)
        throw new Error("Konflikt rewizji fiszki");
      if (operation.type === "card.update")
        return { ...card, ...operation.payload };
      const date = deletedAt();
      if (!date) throw new Error("Brak lokalnego tombstone fiszki");
      return { ...card, deletedAt: date };
    }
    case "settings.update":
      if ((settings?.revision ?? "0") !== operation.baseRevision)
        throw new Error("Konflikt rewizji ustawień");
      return {
        ...operation.payload,
        timezone: STUDY_TIMEZONE,
        revision: settings?.revision ?? "0",
      };
  }
}
