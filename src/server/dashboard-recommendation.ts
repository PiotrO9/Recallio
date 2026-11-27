import {
  recommend,
  type RecommendationData,
} from "@/features/dashboard/recommendation";
import {
  account,
  accountTransaction,
  getSettings,
  progressFields,
  toJsonRecord,
  withDatabase,
} from "./sync/database";

// Keep the optional first-paint read bounded. Larger libraries use the regular
// paginated sync if their deck list or learning history exceeds this budget.
const previewLimit = 1000;

export async function readDashboardPreview(userId: string, now: string) {
  try {
    return await withDatabase((db) =>
      accountTransaction(
        db,
        userId,
        async () => {
          const limit = [previewLimit + 1];
          const decks = await db.query<RecommendationData["decks"][number]>(
            `select id, name, direction_mode as "directionMode", deleted_at as "deletedAt"
         from public.decks where user_id=${account} and deleted_at is null order by id limit $1`,
            limit,
          );
          if (!decks.rows.length || decks.rows.length > previewLimit)
            return null;
          const progress = await db.query<
            RecommendationData["progress"][number]
          >(
            `select ${progressFields} from public.progress where user_id=${account}
         order by card_id, direction limit $1`,
            limit,
          );
          if (progress.rows.length > previewLimit) return null;
          const introductions = await db.query<
            RecommendationData["introductions"][number]
          >(
            `select card_id as "cardId", first_effective_at as "firstEffectiveAt" from public.introductions
         where user_id=${account} order by card_id limit $1`,
            limit,
          );
          if (introductions.rows.length > previewLimit) return null;
          // Every studied card can affect the recommendation. Of the unseen
          // cards only the first in ID order can win, but all count in the UI.
          const known = new Set(
            [...progress.rows, ...introductions.rows].map((row) => row.cardId),
          );
          const { rows: summaries } = await db.query<{
            deckId: string;
            count: string;
            studied: string[] | null;
            firstUnseen: string | null;
          }>(
            `select deck_id as "deckId", count(*) as count,
                     array_agg(id) filter (where studied) as studied,
                     min(id::text collate "C") filter (where not studied) as "firstUnseen"
              from (
                select id, deck_id, id = any($1::uuid[]) as studied
                from public.cards
                where user_id=${account} and deleted_at is null and deck_id = any($2::uuid[])
              ) as live_cards
              group by deck_id`,
            [[...known], decks.rows.map((deck) => deck.id)],
          );
          const counts = new Map(
            summaries.map((row) => [row.deckId, Number(row.count)]),
          );
          const cards = summaries.flatMap((row) => {
            const ids = row.studied ?? [];
            if (row.firstUnseen) ids.push(row.firstUnseen);
            return ids.map((id) => ({
              id,
              deckId: row.deckId,
              deletedAt: null,
            }));
          });
          cards.sort((a, b) => a.id.localeCompare(b.id));
          const settings = await getSettings(db);
          const data = {
            decks: decks.rows,
            cards,
            progress: toJsonRecord(progress.rows),
            introductions: toJsonRecord(introductions.rows),
            settings,
          };
          const item = recommend(data, now);
          if (!item) return null;
          return {
            item,
            decks: decks.rows.map(({ id, name }) => ({
              id,
              name,
              cardCount: counts.get(id) ?? 0,
            })),
          };
        },
        true,
      ),
    );
  } catch {
    // The device can still have an offline library if the server read fails.
    return null;
  }
}
