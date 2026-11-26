import type { Card, Deck } from "../contracts";
import { normalizeText } from "./normalize-text";

export function indexCards(decks: readonly Deck[], cards: readonly Card[]) {
  const names = new Map(
    decks.filter((d) => !d.deletedAt).map((d) => [d.id, d.name]),
  );
  return cards
    .flatMap((card) => {
      const deckName = names.get(card.deckId);
      return card.deletedAt || deckName === undefined
        ? []
        : [
            {
              card,
              deckName,
              a: normalizeText(card.sideA),
              b: normalizeText(card.sideB),
            },
          ];
    })
    .sort(
      (x, y) =>
        x.deckName.localeCompare(y.deckName, "pl") ||
        x.card.id.localeCompare(y.card.id),
    );
}
export function searchCards(
  index: ReturnType<typeof indexCards>,
  text: string,
) {
  const q = normalizeText(text);
  const exact: typeof index = [],
    prefix: typeof index = [],
    part: typeof index = [];
  if (!q) return [];
  for (const row of index) {
    if (row.a === q || row.b === q) exact.push(row);
    else if (row.a.startsWith(q) || row.b.startsWith(q)) prefix.push(row);
    else if (row.a.includes(q) || row.b.includes(q)) part.push(row);
  }
  return exact.concat(prefix, part);
}
