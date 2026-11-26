import {
  repairResponseSchema,
  type RepairResponse,
  type Direction,
} from "../../contracts";
import { withDatabase, accountTransaction } from "./database";
export const repairQuery = `WITH failures AS (
  SELECT e.card_id, c.deck_id, e.direction, e.epoch,
         (e.effective_at AT TIME ZONE 'Europe/Warsaw')::date AS failed_day
  FROM public.review_events AS e
  JOIN public.progress AS p
    ON (p.user_id, p.card_id, p.direction, p.epoch) =
       (e.user_id, e.card_id, e.direction, e.epoch)
  JOIN public.cards AS c ON (c.user_id, c.id) = (e.user_id, e.card_id)
  JOIN public.decks AS d ON (d.user_id, d.id) = (c.user_id, c.deck_id)
  WHERE e.user_id = recallio_private.account_id()
    AND c.deleted_at IS NULL AND d.deleted_at IS NULL
    AND e.disposition = 'applied' AND e.canonical_mode = 'due' AND e.rating = 1
    AND e.effective_at >= (
      ((($1::timestamptz AT TIME ZONE 'Europe/Warsaw')::date - 29)::timestamp)
      AT TIME ZONE 'Europe/Warsaw'
    )
    AND e.effective_at <= $1::timestamptz
)
SELECT card_id, deck_id, direction, epoch::text,
       count(DISTINCT failed_day)::int AS failed_days,
       max(failed_day)::text AS last_failed_day
FROM failures
GROUP BY card_id, deck_id, direction, epoch
HAVING count(DISTINCT failed_day) >= 3
ORDER BY card_id, direction;`;
type RepairRow = {
  card_id: string;
  deck_id: string;
  direction: Direction;
  epoch: string;
  failed_days: number;
  last_failed_day: string;
};
export function readRepairCandidates(userId: string, asOf: string) {
  return withDatabase((db) =>
    accountTransaction(db, userId, async () => {
      const { rows } = await db.query<RepairRow>(repairQuery, [asOf]);
      const grouped = new Map<string, RepairResponse["items"][number]>();
      for (const row of rows) {
        let item = grouped.get(row.card_id);
        if (!item) {
          item = { cardId: row.card_id, deckId: row.deck_id, directions: [] };
          grouped.set(row.card_id, item);
        }
        item.directions.push({
          direction: row.direction,
          epoch: row.epoch,
          failedDays: row.failed_days,
          lastFailedDay: row.last_failed_day,
        });
      }
      return repairResponseSchema.parse({ asOf, items: [...grouped.values()] });
    }),
  );
}
