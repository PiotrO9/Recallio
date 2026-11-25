"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NotebookSheet, deckColor } from "@/components/notebook";
import {
  createLocalRepository,
  type SnapshotData,
} from "@/storage/local-repository";
import { createSyncController } from "@/sync/controller";
import { DEFAULT_NEW_LIMIT, remainingNewForDay } from "@/domain/learning/queue";
import { getStudyPeriod } from "@/domain/learning/study-time";
import { fsrsScheduler } from "@/domain/learning/scheduler";
import styles from "./dashboard.module.css";

function recommend(data: SnapshotData, now: string) {
  const decks = data.decks.filter((d) => !d.deletedAt);
  const available = new Map(decks.map((d) => [d.id, d]));
  const cards = data.cards.filter(
    (c) => !c.deletedAt && available.has(c.deckId),
  );
  const byId = new Map(cards.map((c) => [c.id, c]));
  const due = data.progress
    .filter((p) => {
      const card = byId.get(p.cardId);
      const mode = card && available.get(card.deckId)?.directionMode;
      return (
        (mode === "mixed" || mode === p.direction) &&
        fsrsScheduler.classify(p, now) === "due"
      );
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const limit = data.settings?.newLimit ?? DEFAULT_NEW_LIMIT;
  const free = remainingNewForDay(
    data.introductions,
    getStudyPeriod(now),
    limit,
  );
  const known = new Set(
    [...data.introductions, ...data.progress].map((x) => x.cardId),
  );
  const studied = new Set(
    data.progress
      .filter((p) => fsrsScheduler.classify(p, now) !== "introduction")
      .map((p) => p.cardId + ":" + p.direction),
  );
  const fresh =
    (free > 0 && cards.find((c) => !known.has(c.id))) ||
    cards.find((c) => {
      const mode = available.get(c.deckId)?.directionMode;
      return (
        known.has(c.id) &&
        (mode === "mixed" ? ["a-b", "b-a"] : [mode]).some(
          (direction) => !studied.has(c.id + ":" + direction),
        )
      );
    });
  const practice = cards.find((c) => known.has(c.id));
  const card = byId.get(due[0]?.cardId) ?? fresh ?? practice ?? cards[0];
  const deck = (card && available.get(card.deckId)) ?? decks[0];

  if (!deck) return null;
  const detail = "/decks?deck=" + deck.id;
  if (!card)
    return {
      deckId: deck.id,
      name: deck.name,
      caption: "Pusty zestaw",
      action: "Dodaj pierwszą fiszkę",
      href: detail + "&card=new",
    };
  const study = "/study?deck=" + deck.id;
  if (due.length)
    return {
      deckId: deck.id,
      name: deck.name,
      caption: data.settings?.showDue
        ? "Kierunki do powtórki w zestawie: " +
          due.filter((p) => byId.get(p.cardId)?.deckId === deck.id).length
        : "Powtórka czeka",
      action: "Powtórz teraz",
      href: study,
    };
  if (fresh)
    return {
      deckId: deck.id,
      name: deck.name,
      caption: "Nowe fiszki",
      action: "Poznaj nowe fiszki",
      href: study,
    };
  if (practice)
    return {
      deckId: deck.id,
      name: deck.name,
      caption: "Plan na dziś wykonany",
      action: "Ćwicz dalej",
      href: study,
    };
  return {
    deckId: deck.id,
    name: deck.name,
    caption: limit
      ? "Dzisiejszy limit nowych fiszek został wykorzystany."
      : "Nowe fiszki są wyłączone.",
    action: "Otwórz zestaw",
    href: detail,
  };
}
export function Dashboard({ userId }: { userId: string }) {
  const [data, setData] = useState<SnapshotData>();
  const [issue, setIssue] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef<(() => void) | null>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const focusResult = useRef(false);
  useEffect(() => {
    const repo = createLocalRepository({
      userId,
      now: () => new Date(),
      introduction() {
        throw new Error("Panel nie wprowadza fiszek");
      },
    });
    const sync = createSyncController({
      userId,
      repository: repo,
      fetch: (input, init) => fetch(input, init),
      now: Date.now,
      random: Math.random,
      id: () => crypto.randomUUID(),
      online: () => navigator.onLine,
    });
    let active = true;
    let running = false;
    let timer: number | undefined;
    async function read() {
      try {
        const cached = await repo.readWorkspace();
        if (!active) return;
        if (cached.decks.some((deck) => !deck.deletedAt)) setData(cached);
        const status = await sync.run();
        if (!active) return;
        const updated = await repo.readWorkspace();
        if (active) {
          focusResult.current =
            status === "idle" &&
            retryButton.current !== null &&
            document.activeElement === retryButton.current;
          setData(updated);
          setIssue(status !== "idle");
        }
      } catch {
        if (active) setIssue(true);
      } finally {
        running = false;
        if (active) setRefreshing(false);
      }
    }
    function refresh() {
      if (running) return;
      running = true;
      setRefreshing(true);
      const delay = sync.retryAt() - Date.now();
      if (delay > 0) timer = window.setTimeout(read, delay);
      else void read();
    }
    refreshRef.current = refresh;
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      refreshRef.current = null;
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      repo.close();
    };
  }, [userId]);
  useEffect(() => {
    if (!issue && focusResult.current) {
      resultHeading.current?.focus();
      focusResult.current = false;
    }
  }, [issue]);
  const decks = data?.decks.filter((d) => !d.deletedAt);
  const counts = new Map<string, number>();
  for (const card of data?.cards ?? [])
    if (!card.deletedAt)
      counts.set(card.deckId, (counts.get(card.deckId) ?? 0) + 1);
  const item = data && recommend(data, new Date().toISOString());
  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Panel nauki</h1>
      <div className={styles.layout}>
        {item ? (
          <section className={styles.cover}>
            <NotebookSheet deckId={item.deckId} className={styles.page}>
              <p className={styles.caption}>{item.caption}</p>
              <h2 ref={resultHeading} tabIndex={-1}>
                {item.name}
              </h2>
              <div className="action-row">
                <Link className="primary" href={item.href}>
                  {item.action}
                </Link>
              </div>
            </NotebookSheet>
            {issue && (
              <p role="status">
                Aktualizacja biblioteki jest chwilowo niedostępna.
              </p>
            )}
          </section>
        ) : issue ? (
          <section className={styles.stateCard} aria-labelledby="library-error">
            <h2 id="library-error">Nie udało się wczytać zestawów</h2>
            <div className="action-row">
              <button
                ref={retryButton}
                className="primary"
                aria-disabled={refreshing}
                onClick={() => refreshRef.current?.()}
              >
                {refreshing ? "Ponawianie…" : "Spróbuj ponownie"}
              </button>
              <Link href="/decks">Otwórz bibliotekę</Link>
            </div>
          </section>
        ) : data ? (
          <section className={styles.stateCard} aria-labelledby="first-deck">
            <div className={styles.intro}>
              <h2 id="first-deck" ref={resultHeading} tabIndex={-1}>
                Twój pierwszy zestaw
              </h2>
              <span className={styles.flashcards} aria-hidden="true" />
            </div>
            <p>Dodaj fiszki z tym, czego chcesz się nauczyć.</p>
            <div className="action-row">
              <Link className="primary" href="/decks?new=1">
                Utwórz zestaw
              </Link>
              <Link href="/import">Importuj CSV</Link>
            </div>
          </section>
        ) : (
          <p className={styles.loading} role="status">
            Wczytywanie biblioteki…
          </p>
        )}
        {!!decks?.length && (
          <section className={styles.library}>
            <div className="section-heading">
              <h2>Biblioteka</h2>
              <Link href="/decks">Moje zestawy</Link>
            </div>
            <ul>
              {decks.map((d) => (
                <li key={d.id}>
                  <Link href={"/decks?deck=" + d.id} style={deckColor(d.id)}>
                    <strong>{d.name}</strong>
                    <small>Fiszki: {counts.get(d.id) ?? 0}</small>
                  </Link>
                </li>
              ))}
            </ul>
            <Link className="text-action" href="/import">
              Importuj CSV
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
