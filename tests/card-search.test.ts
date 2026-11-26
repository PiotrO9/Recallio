import test from "node:test";
import assert from "node:assert/strict";
import { indexCards, searchCards } from "../src/domain/card-search";
import type { Card, Deck } from "../src/contracts";
test("ranks either side once, retaining original content and active parents", () => {
  const deck = (id: string, deletedAt: string | null = null): Deck => ({
    id,
    name: id,
    directionMode: "mixed",
    revision: "1",
    deletedAt,
  });
  const card = (
    id: string,
    deckId: string,
    sideA: string,
    sideB: string,
    deletedAt: string | null = null,
  ): Card => ({
    id,
    deckId,
    sideA,
    sideB,
    deletedAt,
    exampleA: null,
    exampleB: null,
    contentRevision: "1",
  });
  const index = indexCards(
    [deck("B"), deck("A"), deck("C", "y")],
    [
      card("1", "B", "Żółć", "Żółć"),
      card("2", "A", "x", "Żółć"),
      card("3", "A", "Żółć w", "x"),
      card("4", "A", "w żółć", "x"),
      card("5", "C", "Żółć", "x"),
      card("6", "A", "Żółć", "x", "y"),
    ],
  );
  const results = searchCards(index, "  ŻÓŁĆ ".normalize("NFD"));
  assert.deepEqual(
    results.map((r) => r.card.id),
    ["2", "1", "3", "4"],
  );
  assert.equal(results[0].card.sideB, "Żółć");
  assert.deepEqual(searchCards(index, " "), []);
});
