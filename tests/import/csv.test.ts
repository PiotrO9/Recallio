import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRows,
  CsvError,
  exportCsv,
  MAX_CSV_BYTES,
  parseCsv,
} from "../../src/domain/import/csv";
import { cardSchema, type Card } from "../../src/contracts";

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

test("odrzuca nazwy odziedziczone z prototypu jako nieznane nagłówki", () => {
  for (const header of ["constructor", "toString", "__proto__"])
    assert.throws(() => parseCsv(`side_a,side_b,${header}\na,b,c`), CsvError);
});

test("zbiorowe pomijanie nie zależy od wcześniej pominiętego wiersza", () => {
  const rows = parseCsv("side_a,side_b\na,b\na,b\na,b").rows;
  const result = classifyRows(rows, [], {
    skippedRows: new Set([2]),
    skipExactDuplicates: true,
  });
  assert.deepEqual(
    result.map((r) => r.classification),
    ["valid", "valid", "exact_duplicate"],
  );
  assert.deepEqual(
    result.map((r) => r.automaticallySkipped),
    [false, false, true],
  );
  assert.deepEqual(result[2].matches, [{ source: "file", row: 3 }]);
});

test("duże grupy duplikatów ograniczają liczbę zwracanych dopasowań", () => {
  const rows = parseCsv(
    "side_a,side_b\n" + Array(2000).fill("a,b").join("\n"),
  ).rows;
  const result = classifyRows(rows, []);
  assert.equal(result.at(-1)?.matchCount, 1999);
  assert.equal(result.at(-1)?.matches.length, 20);
  assert.equal(result.at(-1)?.matchesTruncated, true);
});

test("CSV and stored cards accept the same field length boundaries", () => {
  const card: Card = {
    id: "a1a1a1a1-1111-4111-8111-111111111111",
    deckId: "b2b2b2b2-2222-4222-8222-222222222222",
    sideA: "a",
    sideB: "b",
    exampleA: null,
    exampleB: null,
    deletedAt: null,
    contentRevision: "0",
  };
  for (const [field, limit] of [
    ["sideA", 4000],
    ["sideB", 4000],
    ["exampleA", 8000],
    ["exampleB", 8000],
  ] as const) {
    for (const length of [limit, limit + 1]) {
      const value = { ...card, [field]: "a".repeat(length) };
      assert.equal(cardSchema.safeParse(value).success, length === limit);
      assert.equal(
        parseCsv(exportCsv([value])).rows[0].errors.length === 0,
        length === limit,
      );
    }
  }
});
