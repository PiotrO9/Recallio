import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRows,
  CsvError,
  exportCsv,
  MAX_CSV_BYTES,
  parseCsv,
} from "../../src/domain/import/csv";
import type { Card } from "../../src/contracts";

test("roundtrip zachowuje surowe dane, cytaty, CRLF, null i pusty przykład", () => {
  const values = [
    {
      sideA: ' Zażółć, "kot"\r\nnowy ',
      sideB: "żółw;ą",
      exampleA: "",
      exampleB: null,
    },
  ];
  assert.deepEqual(parseCsv(exportCsv(values)).rows[0].content, values[0]);
});
test("BOM, polskie nagłówki, średnik, brak przykładów i numery linii", () => {
  const result = parseCsv(
    '\ufeffStrona A;Strona B\r\n"raz\r\ndwa";trzy\r\n\r\ncztery;pięć',
  );
  assert.equal(result.delimiter, ";");
  assert.deepEqual(
    result.rows.map((r) => r.row),
    [2, 5],
  );
  assert.equal(result.rows[0].content.sideA, "raz\r\ndwa");
  assert.equal(result.rows[0].content.exampleA, null);
});
test("błędne nagłówki i cytowanie przerywają import, błędne wiersze są wskazane", () => {
  for (const text of [
    "side_a,side_a\na,b",
    "side_a,unknown\na,b",
    'side_a,side_b\n"a,b',
    'side_a,side_b\n"a"x,b',
  ])
    assert.throws(() => parseCsv(text), CsvError);
  const rows = parseCsv('side_a,side_b\n ,b\na,b,c\n"",').rows;
  assert.deepEqual(
    rows.map((r) => r.row),
    [2, 3, 4],
  );
  assert.ok(rows.every((r) => r.errors.length));
  assert.throws(() => parseCsv("ą".repeat(MAX_CSV_BYTES)), CsvError);
});
test("klasyfikacja porównuje bazę i wcześniejsze wiersze bez mutacji", () => {
  const card: Card = {
    id: "one",
    deckId: "deck",
    sideA: "Kot",
    sideB: "cat",
    exampleA: null,
    exampleB: null,
    contentRevision: "3",
    deletedAt: null,
  };
  const rows = parseCsv(
    "side_a,side_b,example_a\n kot , CAT,\nKot,cat,przykład\nKot,kitten,\nnowy,new,\nNOWY,NEW,",
  ).rows;
  const before = JSON.stringify({ rows, card });
  const result = classifyRows(rows, [card]);
  assert.deepEqual(
    result.map((r) => r.classification),
    [
      "exact_duplicate",
      "example_conflict",
      "answer_variant",
      "valid",
      "exact_duplicate",
    ],
  );
  assert.deepEqual(result[0].matches, [
    { source: "deck", id: "one", revision: "3" },
  ]);
  assert.deepEqual(result[4].matches, [{ source: "file", row: 5 }]);
  assert.equal(JSON.stringify({ rows, card }), before);
});
