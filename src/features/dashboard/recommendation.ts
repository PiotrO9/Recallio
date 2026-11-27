import { DEFAULT_NEW_LIMIT, remainingNewForDay } from "@/domain/learning/queue";
import { getStudyPeriod } from "@/domain/learning/study-time";
import { classifyProgress } from "@/domain/learning/progress-state";
import { collectDue } from "@/domain/learning/daily";
import type { Card, Deck, Introduction, Progress, Settings } from "@/contracts";

export type RecommendationData = {
  decks: Pick<Deck, "id" | "name" | "directionMode" | "deletedAt">[];
  cards: Pick<Card, "id" | "deckId" | "deletedAt">[];
  progress: Progress[];
  introductions: Pick<Introduction, "cardId" | "firstEffectiveAt">[];
  settings: Pick<Settings, "newLimit" | "showDue"> | null;
};

export type Recommendation = NonNullable<ReturnType<typeof recommend>>;

export function recommend(
  data: RecommendationData,
  now: string,
  offlineDecks?: ReadonlySet<string>,
) {
  const decks = data.decks.filter(
    (d) => !d.deletedAt && (!offlineDecks || offlineDecks.has(d.id)),
  );
  const available = new Map(decks.map((d) => [d.id, d]));
  const cards = data.cards.filter(
    (c) => !c.deletedAt && available.has(c.deckId),
  );
  const byId = new Map(cards.map((c) => [c.id, c]));
  const due = collectDue(data, now, offlineDecks);
  const limit = data.settings?.newLimit ?? DEFAULT_NEW_LIMIT;
  const free = remainingNewForDay(
    data.introductions,
    getStudyPeriod(now),
    limit,
  );
  const known = new Set(
    [...data.introductions, ...data.progress].map((x) => x.cardId),
  );
  const studied = new Set(
    data.progress
      .filter((p) => classifyProgress(p, now) !== "introduction")
      .map((p) => p.cardId + ":" + p.direction),
  );
  const fresh =
    (free > 0 && cards.find((c) => !known.has(c.id))) ||
    cards.find((c) => {
      const mode = available.get(c.deckId)?.directionMode;
      return (
        known.has(c.id) &&
        (mode === "mixed" ? ["a-b", "b-a"] : [mode]).some(
          (direction) => !studied.has(c.id + ":" + direction),
        )
      );
    });
  const practice = cards.find((c) => known.has(c.id));
  const card = byId.get(due[0]?.cardId) ?? fresh ?? practice ?? cards[0];
  const deck = (card && available.get(card.deckId)) ?? decks[0];

  if (!deck) return null;
  const detail = "/decks?deck=" + deck.id;
  if (!card)
    return {
      deckId: deck.id,
      name: deck.name,
      caption: "Pusty zestaw",
      action: "Dodaj pierwszą fiszkę",
      href: detail + "&card=new",
    };
  const study = "/study?deck=" + deck.id;
  if (due.length)
    return {
      deckId: deck.id,
      name: "Dzisiejsze powtórki",
      caption: data.settings?.showDue
        ? "Kierunki do powtórki: " + due.length
        : "Powtórka czeka",
      action: "Powtórz na dziś",
      href: "/study?scope=today",
    };
  if (fresh)
    return {
      deckId: deck.id,
      name: deck.name,
      caption: "Nowe fiszki",
      action: "Poznaj nowe fiszki",
      href: study,
    };
  if (practice)
    return {
      deckId: deck.id,
      name: deck.name,
      caption: "Plan na dziś wykonany",
      action: "Ćwicz dalej",
      href: study,
    };
  return {
    deckId: deck.id,
    name: deck.name,
    caption: limit
      ? "Dzisiejszy limit nowych fiszek został wykorzystany."
      : "Nowe fiszki są wyłączone.",
    action: "Otwórz zestaw",
    href: detail,
  };
}

export function listDashboardDecks(
  data: Pick<RecommendationData, "cards" | "decks">,
) {
  const counts = new Map<string, number>();
  for (const card of data.cards) {
    if (!card.deletedAt)
      counts.set(card.deckId, (counts.get(card.deckId) ?? 0) + 1);
  }
  return data.decks
    .filter((deck) => !deck.deletedAt)
    .map((deck) => ({
      id: deck.id,
      name: deck.name,
      cardCount: counts.get(deck.id) ?? 0,
    }));
}

export type DashboardPreview = {
  item: Recommendation;
  decks: ReturnType<typeof listDashboardDecks>;
};
