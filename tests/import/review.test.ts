import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "../../src/contracts";
import { classifyRows, parseCsv } from "../../src/domain/import/csv";
import { reviewImport } from "../../src/domain/import/review";

const card: Card = {
  id: "00000000-0000-4000-8000-000000000001",
  deckId: "00000000-0000-4000-8000-000000000002",
  sideA: "Café noir",
  sideB: "Czarna kawa",
  exampleA: null,
  exampleB: null,
  contentRevision: "3",
  deletedAt: null,
};

test("aktualizacja przykładów wymaga zgodności obu stron fiszki", () => {
  const [sameAnswer, differentAnswer] = classifyRows(
    parseCsv(
      "side_a,side_b,example_b\n Cafe\u0301  NOIR ,CZARNA KAWA,Zamawiam kawę.\nCafé noir,mała czarna,",
    ).rows,
    [card],
  );
  const update = { kind: "update_examples", target: card.id } as const;
  const result = reviewImport([sameAnswer], { 2: update }, [card]);
  assert.equal(result.accepted, 1);
  assert.deepEqual(result.unresolved, []);

  const wrongAnswer = reviewImport([differentAnswer], { 3: update }, [card]);
  assert.equal(wrongAnswer.accepted, 0);
  assert.deepEqual(wrongAnswer.unresolved, [differentAnswer]);

  const variant = reviewImport(
    [differentAnswer],
    { 3: { kind: "replace_content", target: card.id } },
    [card],
  );
  assert.equal(variant.accepted, 1);
  assert.deepEqual(variant.unresolved, []);
  assert.equal(variant.reviewed[0].card?.id, card.id);
});

test("dwa wiersze nie mogą nadpisać jednej fiszki, ale można zmienić cel drugiego", () => {
  const other = {
    ...card,
    id: "00000000-0000-4000-8000-000000000003",
    sideB: "Kawa bez mleka",
  };
  const existing = [card, other];
  const rows = classifyRows(
    parseCsv(
      "side_a,side_b\nCafé noir,black coffee\nCafé noir,schwarzer Kaffee",
    ).rows,
    existing,
  );
  const replace = { kind: "replace_content", target: card.id } as const;
  const conflict = reviewImport(rows, { 2: replace, 3: replace }, existing);
  assert.equal(conflict.accepted, 1);
  assert.deepEqual(
    conflict.unresolved.map((row) => row.row),
    [3],
  );
  assert.match(conflict.reviewed[1].issue, /wiersz 2\b/);

  const corrected = reviewImport(
    rows,
    { 2: replace, 3: { ...replace, target: other.id } },
    existing,
  );
  assert.equal(corrected.accepted, 2);
  assert.deepEqual(corrected.unresolved, []);
  assert.deepEqual(
    corrected.reviewed.map((entry) => entry.card?.id),
    [card.id, other.id],
  );
});

test("konflikt bez decyzji lub z brakującą fiszką wstrzymuje tylko swój wiersz", () => {
  const rows = classifyRows(
    parseCsv("side_a,side_b\nCafé noir,kawa\nThé,herbata").rows,
    [card],
  );
  for (const decision of [
    { kind: "" },
    { kind: "replace_content" },
    { kind: "replace_content", target: "missing" },
  ] as const) {
    const result = reviewImport(rows, { 2: decision }, [card]);
    assert.equal(result.accepted, 1);
    assert.deepEqual(
      result.unresolved.map((row) => row.row),
      [2],
    );
    assert.equal(result.reviewed[1].choice.kind, "create");
  }
});

test("ręczna decyzja może przywrócić duplikat, a błędny wiersz pozostaje pominięty", () => {
  const rows = classifyRows(
    parseCsv("side_a,side_b\nCafé noir,Czarna kawa\n,brak pytania").rows,
    [card],
    { skipExactDuplicates: true },
  );
  const skipped = reviewImport(rows, {}, [card]);
  assert.equal(skipped.accepted, 0);
  assert.deepEqual(
    skipped.reviewed.map((entry) => entry.choice.kind),
    ["skip", "skip"],
  );

  const result = reviewImport(
    rows,
    { 2: { kind: "create" }, 3: { kind: "create" } },
    [card],
  );
  assert.equal(result.accepted, 1);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(
    result.reviewed.map((entry) => entry.choice.kind),
    ["create", "skip"],
  );
});
