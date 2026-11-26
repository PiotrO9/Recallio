import type { Card } from "../../contracts";
import { normalizeCsvText, type ImportRow, type ImportAction } from "./csv";
export type Decision = { kind: ImportAction["kind"] | ""; target?: string };
export function matching(
  existing: readonly Card[],
  row: ImportRow,
  kind: Decision["kind"],
) {
  return existing.filter(
    (card) =>
      normalizeCsvText(card.sideA) === normalizeCsvText(row.content.sideA) &&
      (kind !== "update_examples" ||
        normalizeCsvText(card.sideB) === normalizeCsvText(row.content.sideB)),
  );
}
export function reviewImport(
  rows: readonly ImportRow[],
  decisions: Record<number, Decision>,
  existing: readonly Card[],
) {
  const byId = new Map(existing.map((card) => [card.id, card]));
  const claimed = new Map<string, number>();
  const reviewed = rows.map((row) => {
    const choice: Decision =
      row.classification === "invalid" ||
      (row.automaticallySkipped && decisions[row.row]?.kind !== "create")
        ? { kind: "skip" }
        : (decisions[row.row] ?? {
            kind: row.classification === "valid" ? "create" : "",
          });
    const card = choice.target ? byId.get(choice.target) : undefined;
    let issue = "";
    if (!choice.kind) issue = "Wybierz działanie dla tego wiersza.";
    else if (
      choice.kind === "update_examples" ||
      choice.kind === "replace_content"
    ) {
      if (!card || !matching([card], row, choice.kind).length)
        issue = "Wybierz fiszkę do aktualizacji.";
      else if (claimed.has(card.id))
        issue = `Tę fiszkę aktualizuje już wiersz ${claimed.get(card.id)}. Wybierz inną fiszkę lub zmień działanie.`;
      else claimed.set(card.id, row.row);
    }
    return { row, choice, card, issue };
  });
  return {
    reviewed,
    unresolved: reviewed
      .filter((entry) => entry.issue)
      .map((entry) => entry.row),
    accepted: reviewed.filter(
      (entry) => !entry.issue && entry.choice.kind !== "skip",
    ).length,
  };
}
