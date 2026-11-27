"use client";

import { ActionLink } from "@/components/action-link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  DashboardLibrary,
  openDashboardAccount,
} from "@/features/dashboard/workspace";
import { accountDatabaseName } from "@/storage/account-database-name";
import styles from "./dashboard.module.css";

// On a new device the server-rendered link can be used before React starts.
// If this account already has a database, leave visibility to its local reader.
const revealOnNewDevice = `{
  const card = document.currentScript.closest("section");
  if (card && window.recallioDatabasesAtNavigation) {
    window.recallioDatabasesAtNavigation.then((databases) => {
      if (databases && card.isConnected && navigator.onLine &&
          !databases.some((db) => db.name === card.dataset.previewDatabase)) {
        card.hidden = false;
      }
    }).catch(() => {});
  }
}`;

export function Dashboard({
  userId,
  previewCard,
  previewLibrary,
}: {
  userId: string;
  previewCard: ReactNode;
  previewLibrary: ReactNode;
}) {
  const [usePreview, setUsePreview] = useState(false);
  const [data, setData] = useState<
    DashboardLibrary & { views: typeof import("./dashboard-content") }
  >();
  const [online, setOnline] = useState(true);
  const [offlineDecks, setOfflineDecks] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [issue, setIssue] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef<(() => void) | null>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const focusResult = useRef(false);
  useEffect(() => {
    const hasPreview = !!previewCard;
    let account: ReturnType<typeof openDashboardAccount> | undefined;
    let active = true;
    let running = false;
    let timer: number | undefined;
    async function read() {
      try {
        const [{ openDashboardAccount, dashboardLibrary }, views] =
          await Promise.all([
            import("@/features/dashboard/workspace"),
            import("./dashboard-content"),
          ]);
        if (!active) return;
        account ??= openDashboardAccount(userId);
        const { repository: repo, sync } = account;
        const [cached, prepared] = await Promise.all([
          repo.readWorkspace(),
          repo.readOfflineDecks(),
        ]);
        if (!active) return;
        setOfflineDecks(new Set(prepared));
        if (cached.decks.length) {
          setData({ ...dashboardLibrary(cached), views });
        } else if (
          hasPreview &&
          !cached.cards.length &&
          !cached.progress.length &&
          !cached.introductions.length &&
          !cached.settings
        ) {
          const [cursor, pending] = await Promise.all([
            repo.getCursor(),
            repo.countUnsent(),
          ]);
          if (!active) return;
          setUsePreview(cursor === undefined && pending === 0);
        }
        const status = await sync.run();
        if (!active) return;
        const updated = await repo.readWorkspace();
        if (active) {
          focusResult.current =
            status === "idle" &&
            retryButton.current !== null &&
            document.activeElement === retryButton.current;
          setData({ ...dashboardLibrary(updated), views });
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
      waitForRetry();
    }
    function waitForRetry() {
      const delay = (account?.sync.retryAt() ?? 0) - Date.now();
      if (delay > 0) timer = window.setTimeout(waitForRetry, Math.ceil(delay));
      else void read();
    }
    function connectionChanged() {
      setOnline(navigator.onLine);
      if (navigator.onLine) refresh();
      else void initialize();
    }
    setOnline(navigator.onLine);
    refreshRef.current = refresh;
    async function initialize() {
      if (hasPreview || !navigator.onLine) {
        try {
          const databases = await indexedDB.databases();
          if (!active) return;
          if (
            !databases.some((db) => db.name === accountDatabaseName(userId))
          ) {
            // A new device can show the server view online or the unprepared
            // state offline without downloading the local workspace.
            setUsePreview(true);
            return;
          }
        } catch {
          // If the browser cannot list databases, consult the repository.
        }
      }
      if (active) refresh();
    }
    void initialize();
    window.addEventListener("focus", connectionChanged);
    window.addEventListener("online", connectionChanged);
    window.addEventListener("offline", connectionChanged);
    return () => {
      active = false;
      refreshRef.current = null;
      window.clearTimeout(timer);
      window.removeEventListener("focus", connectionChanged);
      window.removeEventListener("online", connectionChanged);
      window.removeEventListener("offline", connectionChanged);
      account?.repository.close();
    };
  }, [userId, previewCard]);
  useEffect(() => {
    if (!issue && focusResult.current) {
      resultHeading.current?.focus();
      focusResult.current = false;
    }
  }, [issue]);
  const preview = !data && !issue && online && !!previewCard;

  const item = data
    ? data.recommend(
        new Date().toISOString(),
        online ? undefined : offlineDecks,
      )
    : null;
  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Panel nauki</h1>
      <div className={styles.layout}>
        {item || preview ? (
          <section
            className={styles.cover}
            hidden={!!preview && !usePreview}
            suppressHydrationWarning
            data-preview-database={
              preview ? accountDatabaseName(userId) : undefined
            }
          >
            {data && item ? (
              <data.views.RecommendationCard
                item={item}
                resultHeading={resultHeading}
              />
            ) : (
              previewCard
            )}
            {issue && (
              <p role="status">
                Aktualizacja biblioteki jest chwilowo niedostępna.
              </p>
            )}
            {preview && (
              <script dangerouslySetInnerHTML={{ __html: revealOnNewDevice }} />
            )}
          </section>
        ) : !online && (data || usePreview) ? (
          <section className={styles.stateCard}>
            <h2>Przygotuj zestaw do nauki offline</h2>
            <p>
              Gdy odzyskasz połączenie, otwórz zestaw i wybierz „Przygotuj
              zestaw offline”.
            </p>
          </section>
        ) : issue ? (
          <section className={styles.stateCard} aria-labelledby="library-error">
            <h2 id="library-error">Nie udało się wczytać zestawów</h2>
            <div className="action-row">
              <button
                ref={retryButton}
                className="primary"
                aria-disabled={refreshing}
                aria-busy={refreshing || undefined}
                onClick={() => refreshRef.current?.()}
              >
                {refreshing ? "Ponawianie…" : "Spróbuj ponownie"}
              </button>
              <ActionLink href="/decks">Otwórz bibliotekę</ActionLink>
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
              <ActionLink className="primary" href="/decks?new=1">
                Utwórz zestaw
              </ActionLink>
              <ActionLink href="/import">Importuj CSV</ActionLink>
            </div>
          </section>
        ) : (
          <p className={styles.loading} role="status">
            Wczytywanie biblioteki…
          </p>
        )}
        {preview && (
          <p className={styles.loading} role="status">
            Wczytywanie biblioteki…
          </p>
        )}
        {data
          ? !!data.decks.length && <data.views.DeckList decks={data.decks} />
          : preview && previewLibrary}
      </div>
    </div>
  );
}
