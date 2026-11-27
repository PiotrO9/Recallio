import Link from "next/link";
import type { Ref } from "react";
import { ActionLink } from "@/components/action-link";
import { NotebookSheet, deckColor } from "@/components/notebook";
import type { DashboardPreview } from "@/features/dashboard/recommendation";
import styles from "./dashboard.module.css";
export function RecommendationCard({
  item,
  resultHeading,
}: {
  item: DashboardPreview["item"];
  resultHeading?: Ref<HTMLHeadingElement>;
}) {
  return (
    <NotebookSheet deckId={item.deckId} className={styles.page}>
      <p className={styles.caption}>{item.caption}</p>
      <h2 ref={resultHeading} tabIndex={-1}>
        {item.name}
      </h2>
      <div className="action-row">
        <ActionLink className="primary" href={item.href} prefetch={false}>
          {item.action}
        </ActionLink>
      </div>
    </NotebookSheet>
  );
}
export function DeckList({ decks }: { decks: DashboardPreview["decks"] }) {
  return (
    <section className={styles.library}>
      <div className="section-heading">
        <h2>Biblioteka</h2>
        <Link href="/decks" prefetch={false}>
          Moje zestawy
        </Link>
      </div>
      <ul>
        {decks.map((d) => (
          <li key={d.id}>
            <Link
              href={"/decks?deck=" + d.id}
              prefetch={false}
              style={deckColor(d.id)}
            >
              <strong>{d.name}</strong>
              <small>Fiszki: {d.cardCount}</small>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="text-action" href="/import" prefetch={false}>
        Importuj CSV
      </Link>
    </section>
  );
}
