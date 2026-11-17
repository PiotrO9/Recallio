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
  const keys = row.fields.map(
    (field) => aliases[field.trim().toLocaleLowerCase("pl-PL")],
  );
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
export function parseCsv(input: string): {
  delimiter: "," | ";";
  rows: Array<{ row: number; content: Content; errors: string[] }>;
} {
  if (new TextEncoder().encode(input).length > MAX_CSV_BYTES)
    throw new CsvError(1, "Plik przekracza limit 1 MiB");
  const text = input.replace(/^\uFEFF/, "");
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
      .map((r) => {
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
          content.sideA.length > 4000 ||
          content.sideB.length > 4000 ||
          (content.exampleA?.length ?? 0) > 8000 ||
          (content.exampleB?.length ?? 0) > 8000
        )
          errors.push("Przekroczono limit długości pola");
        return { row: r.line, content, errors };
      }),
  };
}

// Comparison only; never replace the original content with these keys.
const norm = (s: string | null) =>
  (s ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pl-PL");
export function classifyRows(
  rows: ReturnType<typeof parseCsv>["rows"],
  cards: readonly Card[],
): ImportRow[] {
  const previous: Array<{ content: Content; match: Match }> = cards
    .filter((c) => c.deletedAt === null)
    .map((c) => ({
      content: c,
      match: { source: "deck", id: c.id, revision: c.contentRevision },
    }));
  return rows.map((row) => {
    const candidates = previous.filter(
      ({ content }) => norm(content.sideA) === norm(row.content.sideA),
    );
    const exact = candidates.filter(
      ({ content }) =>
        norm(content.sideB) === norm(row.content.sideB) &&
        norm(content.exampleA) === norm(row.content.exampleA) &&
        norm(content.exampleB) === norm(row.content.exampleB),
    );
    const examples = candidates.filter(
      ({ content }) => norm(content.sideB) === norm(row.content.sideB),
    );
    const chosen = exact.length
      ? exact
      : examples.length
        ? examples
        : candidates;
    const classification: Classification = row.errors.length
      ? "invalid"
      : exact.length
        ? "exact_duplicate"
        : examples.length
          ? "example_conflict"
          : candidates.length
            ? "answer_variant"
            : "valid";
    if (!row.errors.length)
      previous.push({
        content: row.content,
        match: { source: "file", row: row.row },
      });
    return {
      ...row,
      classification,
      matches: row.errors.length ? [] : chosen.map((x) => x.match),
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
