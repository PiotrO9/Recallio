import { z } from "zod";
import { cardSchema, type Card } from "@/contracts";

const draftSchema = z.object({
  base: cardSchema.nullable(),
  sideA: z.string(),
  sideB: z.string(),
  exampleA: z.string(),
  exampleB: z.string(),
});
type Draft = z.infer<typeof draftSchema>;
const drafts = new Map<string, Draft>();
const prefix = (userId: string) => `recallio:draft:${userId}:`;

export function draftKey(userId: string, deckId: string, cardId?: string) {
  return prefix(userId) + deckId + ":" + (cardId ?? "new");
}

export function readDraft(key: string) {
  const cached = drafts.get(key);
  if (cached) return cached;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) return draftSchema.parse(JSON.parse(raw));
  } catch {
    /* Storage may be unavailable in this tab. */
  }
}

export function discardDraft(key: string) {
  drafts.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* In-memory fallback. */
  }
}

export function rememberDraft(
  key: string,
  base: Card | null,
  fields: FormData,
) {
  const value = (name: string) => String(fields.get(name) ?? "");
  const draft = {
    base,
    sideA: value("sideA"),
    sideB: value("sideB"),
    exampleA: value("exampleA"),
    exampleB: value("exampleB"),
  };
  if (
    (["sideA", "sideB", "exampleA", "exampleB"] as const).every(
      (name) => draft[name] === (base?.[name] ?? ""),
    )
  ) {
    discardDraft(key);
    return;
  }
  drafts.set(key, draft);
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* The tab still has its in-memory draft. */
  }
}

export function clearAccountDrafts(userId: string) {
  const start = prefix(userId);
  for (const key of drafts.keys())
    if (key.startsWith(start)) drafts.delete(key);
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(start)) sessionStorage.removeItem(key);
  } catch {
    /* Storage is unavailable. */
  }
}
