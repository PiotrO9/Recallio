"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  uuidSchema,
  type Candidate,
  type PreparedReview,
  type Rating,
  type SessionReturn,
  type Settings,
} from "@/contracts";
import {
  recordSessionAnswer,
  remainingNewForDay,
  DEFAULT_NEW_LIMIT,
  studyQueue,
} from "@/domain/learning/queue";
import { getStudyPeriod } from "@/domain/learning/study-time";
import { fsrsScheduler } from "@/domain/learning/scheduler";
import {
  ReviewProjectionConflict,
  type SnapshotData,
} from "@/storage/local-repository";
import type { SyncStatus } from "@/sync/controller";
import { openLocalAccount } from "@/features/local-account";
import {
  activateStudyUpdate,
  prepareDeckOffline,
  offlineErrors,
  registerStudyWorker,
  savedOfflineAccount,
} from "./offline";
import { NotebookSheet } from "@/components/notebook";
import { ConfirmAction } from "@/components/confirm-action";
import { LoadingButton } from "@/components/loading-button";
import { prepareReview, reprojectReview } from "./prepare-review";
import { StudySettings } from "./study-settings";
import styles from "./study.module.css";

import {
  collectDue,
  dailyChoices,
  sameDirection,
  type DueEntry,
} from "@/domain/learning/daily";
const grades: readonly [Rating, string][] = [
  [1, "Nie pamiętam"],
  [2, "Trudno"],
  [3, "Dobrze"],
  [4, "Łatwo"],
];

import { RepairList } from "./repair-list";

export function StudySession({
  accountId,
  deckId,
  daily = false,
  showRepair = false,
}: {
  accountId?: string;
  showRepair?: boolean;
  daily?: boolean;
  deckId?: string;
}) {
  const [offlineId, setOfflineId] = useState<string | null | undefined>(
    undefined,
  );
  const [offlineRepair, setOfflineRepair] = useState(false);
  const [offlineDaily, setOfflineDaily] = useState(false);
  const [offlineDeck, setOfflineDeck] = useState<string | undefined>();
  useEffect(() => {
    if (accountId) return;
    const stored = uuidSchema.safeParse(savedOfflineAccount());
    setOfflineId(stored.success ? stored.data : null);
    setOfflineRepair(
      new URLSearchParams(window.location.search).get("repair") === "1",
    );
    setOfflineDaily(
      new URLSearchParams(window.location.search).get("scope") === "today",
    );
    setOfflineDeck(
      new URLSearchParams(window.location.search).get("deck") ?? undefined,
    );
  }, [accountId]);
  const id = accountId ?? offlineId;
  if (!id)
    return (
      <p>
        {id === null
          ? "Połącz się z internetem i zaloguj, aby przygotować naukę offline."
          : "Wczytywanie danych…"}
      </p>
    );
  const selected = deckId ?? offlineDeck;
  const today = !selected && (accountId ? daily : offlineDaily);
  return (
    <StudyBoard
      key={`${id}:${selected ?? ""}:${today}:${showRepair || offlineRepair}`}
      showRepair={showRepair || offlineRepair}
      daily={today}
      userId={id}
      deckId={selected}
      offlineShell={!accountId}
    />
  );
}

function StudyBoard({
  userId,
  deckId,
  offlineShell,
  daily,
  showRepair,
}: {
  userId: string;
  deckId?: string;
  showRepair: boolean;
  offlineShell: boolean;
  daily: boolean;
}) {
  const [workspace, setWorkspace] = useState<SnapshotData>();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [savingRating, setSavingRating] = useState<Rating | null>(null);
  const busy = savingRating !== null;
  const [cardRequest, setCardRequest] = useState<"extra" | "restart" | null>(
    null,
  );
  const loadingCard = useRef(false);
  const [cardReadError, setCardReadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [syncState, setSyncState] = useState<SyncStatus>("idle");
  const [offlineDecks, setOfflineDecks] = useState<readonly string[]>([]);
  const [preparingOffline, setPreparingOffline] = useState(false);
  const [offlineError, setOfflineError] =
    useState<keyof typeof offlineErrors>();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [ended, setEnded] = useState(showRepair);
  const [syncGeneration, setSyncGeneration] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const endedRef = useRef(showRepair);
  const extra = useRef<{ dayStart: number; count: number } | null>(null);
  const revealButton = useRef<HTMLButtonElement>(null);
  const gradeGroup = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const returnLink = useRef<HTMLAnchorElement>(null);
  const moveToCard = useRef(false);
  const active = useRef<Candidate | null>(null);
  const previousCard = useRef<string | null>(null);
  const returns = useRef<readonly SessionReturn[]>([]);
  const prepared = useRef<PreparedReview | null>(null);
  const selectedRating = useRef<Rating | null>(null);
  const saving = useRef(false);
  const offlinePending = useRef(false);
  const updatingRef = useRef(false);

  const { repository, sync } = useMemo(
    () => openLocalAccount(userId),
    [userId],
  );

  const dailyPending = useRef<DueEntry[] | null>(null);
  const [dailyCount, setDailyCount] = useState<number | null>(null);
  const availableOffline = useRef<readonly string[]>([]);

  function selectDeck(data: SnapshotData) {
    return data.decks.find(
      (item) =>
        !item.deletedAt &&
        (!deckId || item.id === deckId) &&
        (!offlineShell || availableOffline.current.includes(item.id)) &&
        data.cards.some((card) => card.deckId === item.id && !card.deletedAt),
    );
  }

  function choose(data: SnapshotData, synchronized: boolean) {
    if (endedRef.current) return null;
    if (daily) {
      const offline = offlineShell || !navigator.onLine;
      const allowed = offline ? new Set(availableOffline.current) : undefined;
      if (
        !dailyPending.current &&
        !offline &&
        !synchronized &&
        !data.decks.length
      )
        return null;
      if (
        offline &&
        !data.decks.some((deck) => !deck.deletedAt && allowed?.has(deck.id))
      )
        return null;
      const now = new Date().toISOString();
      dailyPending.current ??= collectDue(data, now, allowed);
      const selection = dailyChoices(
        data,
        dailyPending.current,
        returns.current,
        now,
        previousCard.current,
        allowed,
      );
      setDailyCount(selection.remaining);
      if (!selection.candidate) {
        endedRef.current = true;
        setEnded(true);
      }
      return selection.candidate;
    }
    const deck = selectDeck(data);
    if (!deck) return null;
    const now = new Date().toISOString();
    const period = getStudyPeriod(now);
    return studyQueue.next({
      cards: data.cards.filter((card) => card.deckId === deck.id),
      progress: data.progress,
      now,
      direction: deck.directionMode,
      previousCardId: previousCard.current,
      sessionReturns: returns.current,
      introducedCardIds: new Set(data.introductions.map((item) => item.cardId)),
      remainingNew: remainingNewForDay(
        data.introductions,
        period,
        (data.settings?.newLimit ?? DEFAULT_NEW_LIMIT) +
          (extra.current?.dayStart === period.start ? extra.current.count : 0),
      ),
      random: Math.random,
    });
  }

  async function refresh(advance: boolean, synchronized = false) {
    const [data, decks] = await Promise.all([
      repository.readWorkspace(),
      repository.readOfflineDecks(),
    ]);
    availableOffline.current = decks;
    setOfflineDecks(decks);
    setWorkspace(data);
    if (advance || (!active.current && !saving.current)) {
      const next = choose(data, synchronized);
      active.current = next;
      setCandidate(next);
      setRevealed(false);
    }
  }

  async function synchronize(afterWrite = false) {
    if (updatingRef.current) return;
    try {
      const status = await (afterWrite ? sync.flush() : sync.run());
      setSyncState(status);
      await refresh(false, status === "idle");
      if (status === "idle" && endedRef.current)
        setSyncGeneration((n) => n + 1);
    } catch {
      setSyncState("failed");
    }
  }

  useEffect(() => {
    void refresh(false)
      .then(() => synchronize())
      .catch(() => setSyncState("failed"));
    const online = () => {
      void synchronize();
    };
    const offline = () => setSyncState("offline");
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void synchronize();
    }, 20000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", online);
      repository.close();
    };
    // The account scopes the repository, controller and all event callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, sync]);

  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const report = () => setWaitingWorker(registration?.waiting ?? null);
    function watchInstall() {
      installing?.removeEventListener("statechange", report);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", report);
      report();
    }
    void registerStudyWorker()
      .then((registered) => {
        if (disposed || !registered) return;
        registration = registered;
        registration.addEventListener("updatefound", watchInstall);
        navigator.serviceWorker.addEventListener("controllerchange", report);
        watchInstall();
        if (navigator.onLine) void registration.update().catch(() => {});
      })
      .catch(() => {});
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", watchInstall);
      installing?.removeEventListener("statechange", report);
      if (registration)
        navigator.serviceWorker.removeEventListener("controllerchange", report);
    };
  }, []);

  async function prepareOffline(id: string) {
    if (offlinePending.current) return;
    offlinePending.current = true;
    setPreparingOffline(true);
    setOfflineError(undefined);
    try {
      const { status, result } = await prepareDeckOffline(id, sync, repository);
      setSyncState(status);
      if (result === "ready") {
        availableOffline.current = [
          ...new Set([...availableOffline.current, id]),
        ];
        setOfflineDecks(availableOffline.current);
      } else setOfflineError(result);
    } finally {
      offlinePending.current = false;
      setPreparingOffline(false);
    }
  }

  async function applyUpdate() {
    if (
      !waitingWorker ||
      revealed ||
      saving.current ||
      offlinePending.current ||
      updatingRef.current
    )
      return;
    updatingRef.current = true;
    setUpdating(true);
    setUpdateError(false);
    try {
      await sync.whenIdle();
      if (!(await activateStudyUpdate(waitingWorker)))
        throw new Error("Update unavailable");
      window.location.reload();
    } catch {
      updatingRef.current = false;
      setUpdateError(true);
      setUpdating(false);
    }
  }

  async function rate(rating: Rating) {
    const selected = active.current;
    if (!selected || saving.current || updatingRef.current) return;
    saving.current = true;
    selectedRating.current ??= rating;
    setSavingRating(selectedRating.current);
    let saved = false;
    try {
      if (!prepared.current) {
        prepared.current = await prepareReview(
          repository,
          selected,
          selectedRating.current,
          () => new Date().toISOString(),
          () => crypto.randomUUID(),
        );
      }
      const command = prepared.current;
      await repository.commitReview(command);
      saved = true;
      setSaveError(false);
      prepared.current = null;
      selectedRating.current = null;
      returns.current = recordSessionAnswer(returns.current, command.event);
      if (dailyPending.current)
        dailyPending.current = dailyPending.current.filter(
          (entry) => !sameDirection(entry, command.event),
        );
      previousCard.current = selected.card.id;
      moveToCard.current = true;
      active.current = null;
      setCandidate(null);
      setSessionCount((value) => value + 1);
      await refresh(true);
      void synchronize(true);
    } catch (error) {
      if (saved) {
        setSyncState("failed");
        setCardReadError(true);
      } else {
        const command = prepared.current;
        if (error instanceof ReviewProjectionConflict && command) {
          try {
            prepared.current = await reprojectReview(repository, command);
          } catch {
            // Keep the original command if a reset or deletion changed its target.
          }
        }
        setSaveError(true);
      }
    } finally {
      setSavingRating(null);
      saving.current = false;
    }
  }

  const [settingsReadError, setSettingsReadError] = useState(false);
  const [readingSettings, setReadingSettings] = useState(false);
  async function readAfterSettingsSave() {
    setReadingSettings(true);
    try {
      await refresh(false);
      setSettingsReadError(false);
      return true;
    } catch {
      setSettingsReadError(true);
      return false;
    } finally {
      setReadingSettings(false);
    }
  }

  async function saveSettings(next: Settings) {
    const { revision, ...payload } = next;
    await repository.commitContent(
      {
        id: crypto.randomUUID(),
        entityId: userId,
        type: "settings.update",
        baseRevision: revision,
        payload,
      },
      workspace?.settings ?? null,
    );
    setWorkspace((current) => current && { ...current, settings: next });
    if (await readAfterSettingsSave()) void synchronize(true);
  }

  async function loadNext(mode: "extra" | "restart") {
    if (loadingCard.current || saving.current || updatingRef.current) return;
    loadingCard.current = true;
    setCardRequest(mode);
    setCardReadError(false);
    const previousExtra = extra.current;
    if (mode === "extra") {
      const dayStart = getStudyPeriod(new Date().toISOString()).start;
      extra.current = {
        dayStart,
        count:
          (previousExtra?.dayStart === dayStart ? previousExtra.count : 0) + 1,
      };
    } else {
      endedRef.current = false;
    }
    try {
      moveToCard.current = true;
      await refresh(mode === "restart");
      if (mode === "restart") {
        const url = new URL(window.location.href);
        url.searchParams.delete("repair");
        window.history.replaceState(window.history.state, "", url);
        setSessionCount(0);
        setEnded(false);
      }
    } catch {
      extra.current = previousExtra;
      if (mode === "restart") endedRef.current = true;
      setCardReadError(true);
    } finally {
      loadingCard.current = false;
      setCardRequest(null);
    }
  }

  function endSession() {
    if (saving.current) return;
    setCardReadError(false);
    endedRef.current = true;
    active.current = null;
    previousCard.current = null;
    prepared.current = null;
    selectedRating.current = null;
    returns.current = [];
    setCandidate(null);
    setRevealed(false);
    setSaveError(false);
    setEnded(true);
  }

  useEffect(() => {
    if (busy) return;
    if (ended) returnLink.current?.focus();
    else if (saveError) retryButton.current?.focus();
    else if (revealed) gradeGroup.current?.focus({ preventScroll: true });
    else if (candidate && moveToCard.current) {
      moveToCard.current = false;
      revealButton.current?.focus();
    }
  }, [busy, candidate, ended, revealed, saveError]);

  const status = {
    idle: "",
    quota: offlineErrors.quota,
    offline: "Offline",
    requires_auth: "Zaloguj się ponownie, aby zsynchronizować zapis.",
    retry: "Synchronizacja zaczeka na połączenie.",
    conflict: "Niektóre zmiany wymagają rozstrzygnięcia.",
    failed: "Synchronizacja jest chwilowo niedostępna.",
  }[syncState];
  const settings = workspace?.settings;
  const currentDeck =
    workspace?.decks.find(
      (item) =>
        !item.deletedAt &&
        item.id ===
          (candidate?.card.deckId ??
            deckId ??
            (daily &&
              workspace.cards.find((c) => c.id === previousCard.current)
                ?.deckId)),
    ) ??
    (workspace && selectDeck(workspace));
  const now = new Date().toISOString();
  const dueToday = daily
    ? dailyCount
    : workspace && (settings?.showDue || sessionCount > 0)
      ? countDueToday(getStudyPeriod(now).end)
      : null;

  function countDueToday(end: number) {
    if (!workspace) return 0;
    return workspace.progress.filter((item) => {
      if (
        currentDeck &&
        currentDeck.directionMode !== "mixed" &&
        currentDeck.directionMode !== item.direction
      )
        return false;
      if (fsrsScheduler.classify(item, now) === "introduction") return false;
      return (
        workspace.cards.some(
          (card) =>
            card.id === item.cardId &&
            !card.deletedAt &&
            (currentDeck
              ? card.deckId === currentDeck.id
              : workspace.decks.some(
                  (deck) => deck.id === card.deckId && !deck.deletedAt,
                )),
        ) && Date.parse(item.dueAt) < end
      );
    }).length;
  }
  const offlineUnavailable = !!(
    offlineShell &&
    workspace &&
    !selectDeck(workspace)
  );
  const hasMaterial = workspace?.cards.some(
    (c) => !c.deletedAt && (!deckId || c.deckId === deckId),
  );
  const deckLink = currentDeck && (
    <a href={`/decks?deck=${currentDeck.id}`}>{currentDeck.name}</a>
  );
  if (ended)
    return (
      <section className={styles.finished}>
        <NotebookSheet
          deckId={currentDeck?.id}
          tab={deckLink}
          className={styles.closed}
        >
          <h1>
            {daily && dailyCount === 0
              ? "Wszystkie dostępne powtórki zrobione."
              : "Sesja zakończona."}
          </h1>
          {settings?.showSession && <p>Odpowiedzi w sesji: {sessionCount}</p>}
          <div className="action-row">
            <a
              ref={returnLink}
              className="primary"
              href={currentDeck ? `/decks?deck=${currentDeck.id}` : "/decks"}
            >
              {currentDeck ? "Wróć do zestawu" : "Moje zestawy"}
            </a>
            {daily ? (
              currentDeck && (
                <a href={"/study?deck=" + currentDeck.id}>
                  Ćwicz dalej w zestawie
                </a>
              )
            ) : (
              <LoadingButton
                className="text-action"
                loading={cardRequest === "restart"}
                loadingLabel="Wczytywanie fiszek…"
                onClick={() => void loadNext("restart")}
              >
                Rozpocznij nową sesję
              </LoadingButton>
            )}
          </div>
          {cardReadError && (
            <p role="alert">Nie udało się wczytać fiszek. Spróbuj ponownie.</p>
          )}
        </NotebookSheet>
        {workspace && (
          <RepairList
            userId={userId}
            sync={sync}
            repository={repository}
            workspace={workspace}
            generation={syncGeneration}
            initialOpen={showRepair}
            session={daily ? "today" : currentDeck?.id}
            offlineShell={offlineShell}
            offlineDecks={offlineDecks}
          />
        )}
      </section>
    );
  return (
    <div className={styles.board}>
      {settings?.showDue && dueToday !== null && (
        <p>Powtórki na dziś: {dueToday}</p>
      )}
      {!daily &&
        !ended &&
        sessionCount > 0 &&
        dueToday === 0 &&
        candidate?.mode === "practice" && (
          <p>Powtórki w tym zestawie zrobione. Możesz ćwiczyć dalej.</p>
        )}
      {!ended && settings?.showSession && (
        <p>Odpowiedzi w sesji: {sessionCount}</p>
      )}
      {candidate ? (
        <>
          <NotebookSheet
            deckId={currentDeck?.id}
            tab={deckLink}
            className={styles.card}
          >
            <div className={styles.prompt}>
              <small>
                {candidate.mode === "practice"
                  ? "Ćwiczenie dodatkowe"
                  : "Pytanie"}{" "}
                · {candidate.direction === "a-b" ? "Strona A" : "Strona B"}
              </small>
              <h1>
                {candidate.direction === "a-b"
                  ? candidate.card.sideA
                  : candidate.card.sideB}
              </h1>
            </div>
            <div className={styles.answer} aria-live="polite">
              {revealed && (
                <>
                  <small>
                    Odpowiedź ·{" "}
                    {candidate.direction === "a-b" ? "Strona B" : "Strona A"}
                  </small>
                  <p className={styles.translation}>
                    {candidate.direction === "a-b"
                      ? candidate.card.sideB
                      : candidate.card.sideA}
                  </p>
                  {(candidate.direction === "a-b"
                    ? candidate.card.exampleB
                    : candidate.card.exampleA) && (
                    <p>
                      {candidate.direction === "a-b"
                        ? candidate.card.exampleB
                        : candidate.card.exampleA}
                    </p>
                  )}
                </>
              )}
            </div>
          </NotebookSheet>
          {revealed && !saveError && (
            <p id="grade-question">Jak dobrze pamiętasz odpowiedź?</p>
          )}
          {revealed ? (
            <>
              {saveError ? (
                <>
                  {!busy && <p role="alert">Nie udało się zapisać oceny.</p>}
                  <LoadingButton
                    ref={retryButton}
                    className="primary"
                    loading={busy}
                    loadingLabel="Zapisywanie…"
                    onClick={() => {
                      if (selectedRating.current !== null)
                        void rate(selectedRating.current);
                    }}
                  >
                    Ponów zapis
                  </LoadingButton>
                </>
              ) : (
                <div
                  className={styles.grades}
                  role="group"
                  aria-label="Ocena odpowiedzi"
                  aria-describedby="grade-question"
                  ref={gradeGroup}
                  tabIndex={-1}
                  onKeyDown={(event) => {
                    if (
                      event.repeat ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.altKey ||
                      event.shiftKey
                    )
                      return;
                    const grade = grades.find(
                      ([value]) => String(value) === event.key,
                    );
                    if (!grade) return;
                    event.preventDefault();
                    void rate(grade[0]);
                  }}
                >
                  {grades.map(([value, label]) => (
                    <LoadingButton
                      className="primary"
                      key={value}
                      aria-keyshortcuts={String(value)}
                      disabled={busy}
                      loading={savingRating === value}
                      onClick={() => void rate(value)}
                    >
                      <kbd aria-hidden="true">{value}</kbd> {label}
                    </LoadingButton>
                  ))}
                </div>
              )}
            </>
          ) : (
            <button
              ref={revealButton}
              className="primary"
              disabled={updating}
              onClick={() => setRevealed(true)}
            >
              Pokaż odpowiedź
            </button>
          )}
        </>
      ) : (
        <NotebookSheet
          deckId={currentDeck?.id}
          tab={deckLink}
          className={styles.card}
        >
          <h1>
            {daily
              ? workspace &&
                (offlineShell || syncState === "offline") &&
                !workspace.decks.some(
                  (deck) => !deck.deletedAt && offlineDecks.includes(deck.id),
                )
                ? "Przygotuj zestaw do nauki offline"
                : syncState === "failed" ||
                    syncState === "retry" ||
                    cardReadError
                  ? "Nie udało się wczytać powtórek"
                  : "Wczytywanie powtórek…"
              : !workspace
                ? "Wczytywanie fiszek…"
                : offlineUnavailable
                  ? "Zestaw niedostępny offline"
                  : hasMaterial
                    ? "Limit nowych fiszek"
                    : "Brak fiszek"}
          </h1>
          <p>
            {daily
              ? null
              : workspace
                ? offlineUnavailable
                  ? "Ten zestaw wymaga przygotowania z dostępem do internetu."
                  : hasMaterial
                    ? "W tym zestawie nie ma teraz fiszek w ramach limitu."
                    : "Nie ma dostępnych fiszek do nauki."
                : "Odczytujemy materiał z urządzenia."}
          </p>
          {daily &&
            (cardReadError ||
              syncState === "failed" ||
              syncState === "retry") && (
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  setCardReadError(false);
                  void synchronize(true);
                }}
              >
                Ponów odczyt
              </button>
            )}
          {workspace && !candidate && (
            <a href={currentDeck ? `/decks?deck=${currentDeck.id}` : "/decks"}>
              {currentDeck ? "Wróć do zestawu" : "Wróć do zestawów"}
            </a>
          )}
        </NotebookSheet>
      )}
      {!offlineUnavailable &&
        workspace?.cards.some(
          (card) => !card.deletedAt && (!deckId || card.deckId === deckId),
        ) && (
          <div className={styles.tools}>
            {!candidate && !daily && (
              <LoadingButton
                className="primary"
                disabled={busy || updating}
                loading={cardRequest === "extra"}
                loadingLabel="Wczytywanie fiszki…"
                onClick={() => void loadNext("extra")}
              >
                Dodaj jeszcze jedną nową fiszkę
              </LoadingButton>
            )}
            {cardReadError && (
              <p role="alert">
                Nie udało się wczytać fiszek. Spróbuj ponownie.
              </p>
            )}
            {saveError ? (
              <ConfirmAction
                label="Zakończ sesję"
                title="Zakończyć bez zapisu oceny?"
                description="Ta odpowiedź nie zostanie uwzględniona w postępie."
                confirm="Zakończ bez zapisu"
                disabled={busy}
                onConfirm={endSession}
              />
            ) : (
              <button
                className="auth-secondary"
                disabled={busy || cardRequest !== null || updating}
                onClick={endSession}
              >
                Zakończ sesję
              </button>
            )}
          </div>
        )}
      <div role="status">
        {status && (
          <p>
            {syncState === "offline" && sessionCount > 0
              ? "Oceny zapisane na tym urządzeniu. Synchronizacja wznowi się po połączeniu."
              : status}
          </p>
        )}
        {busy && <p>Zapisywanie oceny na urządzeniu…</p>}
      </div>
      {workspace && (
        <details className={styles.settings}>
          <summary>Ustawienia nauki</summary>
          <StudySettings settings={workspace.settings} save={saveSettings} />
          {settingsReadError && (
            <div>
              <p role="alert">
                Nie udało się odświeżyć treningu po zapisie ustawień.
              </p>
              <LoadingButton
                type="button"
                loading={readingSettings}
                loadingLabel="Wczytywanie…"
                onClick={() =>
                  void readAfterSettingsSave().then((ok) => {
                    if (ok) void synchronize(true);
                  })
                }
              >
                Ponów odczyt
              </LoadingButton>
            </div>
          )}
          {currentDeck &&
            (offlineDecks.includes(currentDeck.id) ? (
              <p role="status">Zestaw jest dostępny offline.</p>
            ) : (
              !offlineShell && (
                <LoadingButton
                  className="auth-secondary"
                  type="button"
                  loading={preparingOffline}
                  loadingLabel="Przygotowywanie zestawu…"
                  disabled={
                    preparingOffline || updating || syncState === "offline"
                  }
                  onClick={() => void prepareOffline(currentDeck.id)}
                >
                  Przygotuj zestaw offline
                </LoadingButton>
              )
            ))}
          {workspace && workspace.progress.length > 0 && (
            <details>
              <summary>Zapis na urządzeniu</summary>
              <p>Zapisany postęp: {workspace.progress.length}</p>
            </details>
          )}
          {offlineError && <p role="alert">{offlineErrors[offlineError]}</p>}
        </details>
      )}
      {waitingWorker && !revealed && !busy && !saveError && (
        <LoadingButton
          className="auth-secondary"
          type="button"
          disabled={preparingOffline || cardRequest !== null}
          loading={updating}
          loadingLabel="Aktualizowanie aplikacji…"
          onClick={() => void applyUpdate()}
        >
          Zaktualizuj aplikację
        </LoadingButton>
      )}
      {updateError && (
        <p role="alert">
          Nie udało się zaktualizować aplikacji. Spróbuj ponownie po odzyskaniu
          połączenia.
        </p>
      )}
    </div>
  );
}
