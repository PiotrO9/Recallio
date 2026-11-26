import { normalizeText as normalizeCsvText } from "../normalize-text";
export { normalizeCsvText };
import {
  MAX_CARD_SIDE_LENGTH,
  MAX_CARD_EXAMPLE_LENGTH,
} from "../content-limits";
import type { Card } from "../../contracts";

export const MAX_CSV_BYTES = 1024 * 1024;
export type Content = Pick<Card, "sideA" | "sideB" | "exampleA" | "exampleB">;
export type Classification =
  | "valid"
  | "exact_duplicate"
  | "answer_variant"
  | "example_conflict"
  | "invalid";
export type Match =
  | { source: "file"; row: number }
  | { source: "deck"; id: string; revision: string };
export type ImportRow = {
  row: number;
  content: Content;
  classification: Classification;
  matches: Match[];
  matchCount: number;
  matchesTruncated: boolean;
  automaticallySkipped: boolean;
  errors: string[];
};
export type ImportAction =
  | { kind: "skip" }
  | { kind: "create"; cardId: string; operationId: string }
  | {
      kind: "update_examples" | "replace_content";
      targetId: string;
      baseRevision: string;
      operationId: string;
    };
/** Persist this plan and its IDs unchanged across retries. Reset is a separate operation. */
export interface ImportPlan {
  rows: ReadonlyArray<{ row: ImportRow; action: ImportAction }>;
}

export class CsvError extends Error {
  constructor(
    public readonly row: number,
    message: string,
  ) {
    super(message);
    this.name = "CsvError";
  }
}
type RecordRow = {
  line: number;
  fields: string[];
  quoted: boolean[];
  blank: boolean;
};

// A small strict state machine: delimiters and newlines inside quoted fields are data.
function records(text: string, delimiter: string): RecordRow[] {
  const rows: RecordRow[] = [];
  let fields: string[] = [],
    quoted: boolean[] = [],
    fieldQuoted = false,
    field = "",
    line = 1,
    start = 1,
    state: "start" | "plain" | "quoted" | "closed" = "start",
    touched = false;
  const add = () => {
    fields.push(field);
    quoted.push(fieldQuoted);
    field = "";
    fieldQuoted = false;
  };
  const end = () => {
    add();
    rows.push({
      line: start,
      fields,
      quoted,
      blank: !touched && fields.length === 1 && fields[0] === "",
    });
    fields = [];
    quoted = [];
    state = "start";
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === "quoted") {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else state = "closed";
      } else {
        field += c;
        if (c === "\n") line++;
        else if (c === "\r" && text[i + 1] !== "\n") line++;
      }
      continue;
    }
    if (c === delimiter) {
      add();
      state = "start";
      touched = true;
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      end();
      line++;
      start = line;
      continue;
    }
    if (state === "closed")
      throw new CsvError(line, "Nieoczekiwany znak po zamknięciu cudzysłowu");
    if (c === '"') {
      if (state !== "start")
        throw new CsvError(line, "Cudzysłów wewnątrz niecytowanego pola");
      state = "quoted";
      fieldQuoted = true;
      touched = true;
      continue;
    }
    state = "plain";
    field += c;
    touched = true;
  }
  if (state === "quoted")
    throw new CsvError(start, "Niezamknięte pole cytowane");
  if (touched || fields.length || field) end();
  return rows;
}

const aliases: Record<string, keyof Content> = {
  side_a: "sideA",
  side_b: "sideB",
  example_a: "exampleA",
  example_b: "exampleB",
  "strona a": "sideA",
  "strona b": "sideB",
  "przykład a": "exampleA",
  "przykład b": "exampleB",
};
function headers(row: RecordRow): (keyof Content)[] {
  const keys = row.fields.map((field) => {
    const key = field.trim().toLocaleLowerCase("pl-PL");
    if (!Object.hasOwn(aliases, key))
      throw new CsvError(row.line, "Nieznany nagłówek");
    return aliases[key];
  });
  if (
    keys.some((key) => !key) ||
    new Set(keys).size !== keys.length ||
    !keys.includes("sideA") ||
    !keys.includes("sideB")
  )
    throw new CsvError(row.line, "Nieznane, powtórzone lub brakujące nagłówki");
  return keys;
}
function firstRecord(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && (text[i] === "\r" || text[i] === "\n"))
      return text.slice(0, i);
  }
  return text;
}
function checkedText(input: string) {
  if (new TextEncoder().encode(input).length > MAX_CSV_BYTES)
    throw new CsvError(1, "Plik przekracza limit 1 MiB");
  return input.replace(/^\uFEFF/, "");
}

export function parseCsv(input: string) {
  const text = checkedText(input);
  const header = firstRecord(text);
  const candidates = ([",", ";"] as const).filter((d) => {
    try {
      const row = records(header, d)[0];
      if (!row) return false;
      headers(row);
      return true;
    } catch {
      return false;
    }
  });
  if (candidates.length !== 1)
    throw new CsvError(1, "Nie można rozpoznać separatora lub nagłówków");
  const delimiter = candidates[0];
  const parsed = records(text, delimiter);
  const keys = headers(parsed[0]);
  return {
    delimiter,
    rows: parsed
      .slice(1)
      .filter((r) => !r.blank)
      .map((row) => parseRow(row, keys)),
  };
}

export function parsePastedRows(
  input: string,
  { hasHeader }: { hasHeader: boolean },
) {
  const rows = records(checkedText(input), "\t").filter((r) => !r.blank);
  return {
    delimiter: "\t" as const,
    rows: rows
      .slice(hasHeader ? 1 : 0)
      .map((row) => parseRow(row, ["sideA", "sideB", "exampleA", "exampleB"])),
  };
}

function parseRow(r: RecordRow, keys: readonly (keyof Content)[]) {
  const content: Content = {
    sideA: "",
    sideB: "",
    exampleA: null,
    exampleB: null,
  };
  keys.forEach((key, index) => {
    const value = r.fields[index] ?? "";
    if (key === "exampleA" || key === "exampleB")
      content[key] = value === "" && !r.quoted[index] ? null : value;
    else content[key] = value;
  });
  const errors: string[] = [];
  if (r.fields.length > keys.length) errors.push("Nadmiarowe kolumny");
  if (!content.sideA.trim() || !content.sideB.trim())
    errors.push("Strony A i B są wymagane");
  if (
    content.sideA.length > MAX_CARD_SIDE_LENGTH ||
    content.sideB.length > MAX_CARD_SIDE_LENGTH ||
    (content.exampleA?.length ?? 0) > MAX_CARD_EXAMPLE_LENGTH ||
    (content.exampleB?.length ?? 0) > MAX_CARD_EXAMPLE_LENGTH
  )
    errors.push("Przekroczono limit długości pola");
  return { row: r.line, content, errors };
}

/** Reclassify after changing decisions. skippedRows must include every prior row
 * that will not create the given content, including updates. For bulk skipping,
 * use automaticallySkipped from this same run; do not skip solely by classification.
 * matches contains at most 20 representatives of the highest-priority category. */
export function classifyRows(
  rows: ReturnType<typeof parseCsv>["rows"],
  cards: readonly Card[],
  options: {
    skippedRows?: ReadonlySet<number>;
    skipExactDuplicates?: boolean;
  } = {},
): ImportRow[] {
  type Bucket = { count: number; matches: Match[] };
  const byQuestion = new Map<string, Bucket>();
  const byAnswer = new Map<string, Bucket>();
  const byExact = new Map<string, Bucket>();
  const keys = (content: Content) => {
    const a = normalizeCsvText(content.sideA),
      b = normalizeCsvText(content.sideB);
    return [
      JSON.stringify([a]),
      JSON.stringify([a, b]),
      JSON.stringify([
        a,
        b,
        normalizeCsvText(content.exampleA),
        normalizeCsvText(content.exampleB),
      ]),
    ];
  };
  const insert = (content: Content, match: Match) => {
    const [a, b, exact] = keys(content);
    for (const [index, key] of [
      [byQuestion, a],
      [byAnswer, b],
      [byExact, exact],
    ] as const) {
      let bucket = index.get(key);
      if (!bucket) {
        bucket = { count: 0, matches: [] };
        index.set(key, bucket);
      }
      bucket.count++;
      if (bucket.matches.length < 20) bucket.matches.push(match);
    }
  };
  for (const card of cards)
    if (card.deletedAt === null)
      insert(card, {
        source: "deck",
        id: card.id,
        revision: card.contentRevision,
      });
  return rows.map((row) => {
    const [a, b, e] = keys(row.content);
    const candidates = byQuestion.get(a),
      examples = byAnswer.get(b),
      exact = byExact.get(e);
    const chosen = exact ?? examples ?? candidates;
    const classification: Classification = row.errors.length
      ? "invalid"
      : exact
        ? "exact_duplicate"
        : examples
          ? "example_conflict"
          : candidates
            ? "answer_variant"
            : "valid";
    const automaticallySkipped = Boolean(
      options.skipExactDuplicates &&
      classification === "exact_duplicate" &&
      !options.skippedRows?.has(row.row),
    );
    const matchCount = classification === "invalid" ? 0 : (chosen?.count ?? 0);
    const matches =
      classification === "invalid" ? [] : [...(chosen?.matches ?? [])];
    if (
      !row.errors.length &&
      !options.skippedRows?.has(row.row) &&
      !automaticallySkipped
    )
      insert(row.content, { source: "file", row: row.row });
    return {
      ...row,
      classification,
      matches,
      matchCount,
      matchesTruncated: matchCount > 20,
      automaticallySkipped,
    };
  });
}
export function exportCsv(cards: readonly Content[]): string {
  const quote = (value: string | null) => {
    if (value === null) return "";
    const s = value;
    return s === "" || /[",\r\n]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s;
  };
  return (
    [
      "side_a,side_b,example_a,example_b",
      ...cards.map((c) =>
        [c.sideA, c.sideB, c.exampleA, c.exampleB].map(quote).join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
