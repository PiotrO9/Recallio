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
import { getStudyDay, getStudyPeriod } from "@/domain/learning/study-time";
import {
  FSRS_VERSION,
  fsrsScheduler,
  getEffectiveReviewTime,
} from "@/domain/learning/scheduler";
import {
  createLocalRepository,
  ReviewProjectionConflict,
  type SnapshotData,
} from "@/storage/local-repository";
import { createSyncController, type SyncStatus } from "@/sync/controller";
import {
  activateStudyUpdate,
  prepareStudyShell,
  registerStudyWorker,
  savedOfflineAccount,
} from "./offline";
import { StudySettings } from "./study-settings";
import styles from "./study.module.css";

const grades: readonly [Rating, string][] = [
  [1, "Nie pamiętam"],
  [2, "Trudno"],
  [3, "Dobrze"],
  [4, "Łatwo"],
];

export function StudySession({
  accountId,
  deckId,
}: {
  accountId?: string;
  deckId?: string;
}) {
  const [offlineId, setOfflineId] = useState<string | null | undefined>(
    undefined,
  );
  const [offlineDeck, setOfflineDeck] = useState<string | undefined>();
  useEffect(() => {
    if (accountId) return;
    const stored = uuidSchema.safeParse(savedOfflineAccount());
    setOfflineId(stored.success ? stored.data : null);
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
  return (
    <StudyBoard
      key={`${id}:${selected ?? ""}`}
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
}: {
  userId: string;
  deckId?: string;
  offlineShell: boolean;
}) {
  const [workspace, setWorkspace] = useState<SnapshotData>();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [syncState, setSyncState] = useState<SyncStatus>("idle");
  const [offlineDecks, setOfflineDecks] = useState<readonly string[]>([]);
  const [preparingOffline, setPreparingOffline] = useState(false);
  const [offlineError, setOfflineError] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [ended, setEnded] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const endedRef = useRef(false);
  const extra = useRef<{ dayStart: number; count: number } | null>(null);
  const revealButton = useRef<HTMLButtonElement>(null);
  const firstGrade = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const moveToCard = useRef(false);
  const active = useRef<Candidate | null>(null);
  const previousCard = useRef<string | null>(null);
  const returns = useRef<readonly SessionReturn[]>([]);
  const prepared = useRef<PreparedReview | null>(null);
  const selectedRating = useRef<Rating | null>(null);
  const saving = useRef(false);
  const offlinePending = useRef(false);
  const updatingRef = useRef(false);

  const repository = useMemo(
    () =>
      createLocalRepository({
        userId,
        now: () => new Date(),
        introduction(event) {
          return {
            cardId: event.cardId,
            firstEffectiveAt: event.occurredAt,
            studyDay: getStudyDay(event.occurredAt),
          };
        },
      }),
    [userId],
  );
  const sync = useMemo(
    () =>
      createSyncController({
        userId,
        repository,
        fetch: (input, init) => fetch(input, init),
        now: Date.now,
        random: Math.random,
        id: () => crypto.randomUUID(),
        online: () => navigator.onLine,
      }),
    [repository, userId],
  );

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

  function choose(data: SnapshotData) {
    if (endedRef.current) return null;
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

  async function refresh(advance: boolean) {
    const [data, decks] = await Promise.all([
      repository.readWorkspace(),
      repository.readOfflineDecks(),
    ]);
    availableOffline.current = decks;
    setOfflineDecks(decks);
    setWorkspace(data);
    if (advance || (!active.current && !saving.current)) {
      const next = choose(data);
      active.current = next;
      setCandidate(next);
      setRevealed(false);
    }
  }

  async function synchronize(afterWrite = false) {
    if (updatingRef.current) return;
    try {
      setSyncState(await (afterWrite ? sync.flush() : sync.run()));
      await refresh(false);
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
    setOfflineError(false);
    try {
      const status = await sync.run(true);
      setSyncState(status);
      if (status !== "idle" || !(await prepareStudyShell()))
        throw new Error("Offline preparation failed");
      await repository.markOfflineDeck(id);
      await refresh(false);
    } catch {
      setOfflineError(true);
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
    setBusy(true);
    setSaveError(false);
    let saved = false;
    try {
      if (!prepared.current) {
        const { card, direction, epoch } = selected;
        const { progress: previous, localVersion } =
          await repository.readProgressVersion(card.id, direction);
        const occurredAt = new Date().toISOString();
        const effectiveAt = getEffectiveReviewTime(
          occurredAt,
          occurredAt,
          previous,
        );
        const mode = fsrsScheduler.classify(previous, effectiveAt);
        const payload = {
          direction,
          rating: selectedRating.current,
          observedMode: mode,
          occurredAt,
          clientSeq: await repository.reserveReviewSequence(),
          observedContentRevision: card.contentRevision,
          observedProgressRevision: previous?.revision ?? null,
          epoch,
          algorithmVersion: FSRS_VERSION,
        };
        const id = crypto.randomUUID();
        const event = {
          ...payload,
          id,
          cardId: card.id,
          deviceId: await repository.getDeviceId(() => crypto.randomUUID()),
        };
        prepared.current = {
          event,
          localVersion,
          operation: { id, entityId: card.id, type: "review.record", payload },
          progress: fsrsScheduler.review({
            previous,
            event,
            effectiveAt,
            mode,
          }),
        };
      }
      const command = prepared.current;
      await repository.commitReview(command);
      saved = true;
      prepared.current = null;
      selectedRating.current = null;
      returns.current = recordSessionAnswer(returns.current, command.event);
      previousCard.current = selected.card.id;
      moveToCard.current = true;
      active.current = null;
      setCandidate(null);
      setSessionCount((value) => value + 1);
      await refresh(true);
      void synchronize(true);
    } catch (error) {
      if (saved) setSyncState("failed");
      else {
        const command = prepared.current;
        if (error instanceof ReviewProjectionConflict && command) {
          try {
            const { event } = command;
            const { progress: previous, localVersion } =
              await repository.readProgressVersion(
                event.cardId,
                event.direction,
              );
            const effectiveAt = getEffectiveReviewTime(
              event.occurredAt,
              event.occurredAt,
              previous,
            );
            const mode = fsrsScheduler.classify(previous, effectiveAt);
            prepared.current = {
              ...command,
              localVersion,
              progress: fsrsScheduler.review({
                previous,
                event,
                effectiveAt,
                mode,
              }),
            };
          } catch {
            // Keep the original command if a reset or deletion changed its target.
          }
        }
        setSaveError(true);
      }
    } finally {
      setBusy(false);
      saving.current = false;
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
    await refresh(false);
    void synchronize(true);
  }

  function addNew() {
    const dayStart = getStudyPeriod(new Date().toISOString()).start;
    extra.current = {
      dayStart,
      count:
        (extra.current?.dayStart === dayStart ? extra.current.count : 0) + 1,
    };
    void refresh(false).catch(() => setSyncState("failed"));
  }

  function endSession() {
    if (saving.current) return;
    if (
      saveError &&
      !window.confirm("Ocena nie została zapisana. Zakończyć sesję?")
    )
      return;
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

  function restart() {
    endedRef.current = false;
    moveToCard.current = true;
    setEnded(false);
    setSessionCount(0);
    void refresh(true).catch(() => setSyncState("failed"));
  }

  useEffect(() => {
    if (busy) return;
    if (ended) restartButton.current?.focus();
    else if (saveError) retryButton.current?.focus();
    else if (revealed) firstGrade.current?.focus();
    else if (candidate && moveToCard.current) {
      moveToCard.current = false;
      revealButton.current?.focus();
    }
  }, [busy, candidate, ended, revealed, saveError]);

  const status = {
    idle: "",
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
        !item.deletedAt && item.id === (candidate?.card.deckId ?? deckId),
    ) ??
    (workspace && selectDeck(workspace));
  const now = new Date().toISOString();
  const dueToday =
    workspace && (settings?.showDue || sessionCount > 0)
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
  return (
    <div className={styles.board}>
      {currentDeck && (
        <div className="section-heading">
          <a href={`/decks?deck=${currentDeck.id}`}>{currentDeck.name}</a>
          <span>
            {offlineShell || syncState === "offline" ? "Offline" : "Trening"}
          </span>
        </div>
      )}
      <div role="status">
        {status && <p>{status}</p>}
        {workspace?.progress.length ? (
          <p>Zapisany postęp: {workspace.progress.length}</p>
        ) : null}
      </div>
      {offlineShell && workspace && !selectDeck(workspace) && (
        <p>Ten zestaw wymaga przygotowania z dostępem do internetu.</p>
      )}
      {settings?.showDue && dueToday !== null && (
        <p>Powtórki na dziś: {dueToday}</p>
      )}
      {!ended &&
        sessionCount > 0 &&
        dueToday === 0 &&
        candidate?.mode === "practice" && (
          <p>Dzisiejsze powtórki zrobione. Możesz ćwiczyć dalej.</p>
        )}
      {settings?.showSession && <p>Odpowiedzi w sesji: {sessionCount}</p>}
      {ended ? (
        <div className={styles.card}>
          <h2>Sesja zakończona.</h2>
          <button ref={restartButton} className="primary" onClick={restart}>
            Rozpocznij nową sesję
          </button>
        </div>
      ) : candidate ? (
        <div className={styles.card}>
          <small>
            {candidate.direction === "a-b" ? "Strona A" : "Strona B"}
          </small>
          <h2>
            {candidate.direction === "a-b"
              ? candidate.card.sideA
              : candidate.card.sideB}
          </h2>
          <div className={styles.answer} aria-live="polite">
            {revealed && (
              <>
                <small>
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
          {revealed ? (
            <>
              {saveError ? (
                <>
                  <p role="alert">Nie udało się zapisać oceny.</p>
                  <button
                    ref={retryButton}
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      if (selectedRating.current !== null)
                        void rate(selectedRating.current);
                    }}
                  >
                    Ponów zapis
                  </button>
                </>
              ) : (
                <div
                  className={styles.grades}
                  role="group"
                  aria-label="Ocena odpowiedzi"
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
                  {grades.map(([value, label], index) => (
                    <button
                      className="primary"
                      key={value}
                      aria-keyshortcuts={String(value)}
                      ref={index === 0 ? firstGrade : undefined}
                      disabled={busy}
                      onClick={() => void rate(value)}
                    >
                      {label}
                    </button>
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
        </div>
      ) : (
        <p>
          {workspace
            ? workspace.cards.length
              ? "W tym zestawie nie ma teraz fiszek w ramach limitu."
              : "Nie ma dostępnych fiszek do nauki."
            : "Wczytywanie fiszek…"}
        </p>
      )}
      {!ended &&
        workspace?.cards.some(
          (card) => !card.deletedAt && (!deckId || card.deckId === deckId),
        ) && (
          <div className={styles.tools}>
            <button className="auth-secondary" disabled={busy} onClick={addNew}>
              Dodaj jeszcze jedną nową fiszkę
            </button>
            <button
              className="auth-secondary"
              disabled={busy}
              onClick={endSession}
            >
              Zakończ sesję
            </button>
          </div>
        )}
      {workspace && (
        <StudySettings settings={workspace.settings} save={saveSettings} />
      )}
      {currentDeck &&
        (offlineDecks.includes(currentDeck.id) ? (
          <p role="status">Zestaw jest dostępny offline.</p>
        ) : (
          !offlineShell && (
            <button
              className="auth-secondary"
              type="button"
              disabled={preparingOffline || updating || syncState === "offline"}
              onClick={() => void prepareOffline(currentDeck.id)}
            >
              {preparingOffline
                ? "Przygotowywanie zestawu…"
                : "Przygotuj zestaw offline"}
            </button>
          )
        ))}
      {offlineError && (
        <p role="alert">
          Nie udało się przygotować zestawu offline. Sprawdź połączenie i wolne
          miejsce, a następnie ponów próbę.
        </p>
      )}
      {waitingWorker && !revealed && !busy && !saveError && (
        <button
          className="auth-secondary"
          type="button"
          disabled={preparingOffline || updating}
          onClick={() => void applyUpdate()}
        >
          {updating ? "Aktualizowanie aplikacji…" : "Zaktualizuj aplikację"}
        </button>
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
