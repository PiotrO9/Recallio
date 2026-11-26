// Comparison only; never replace the original content with these keys.
export const normalizeText = (s: string | null) =>
  (s ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pl-PL");
