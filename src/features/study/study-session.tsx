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
import { NotebookSheet } from "@/components/notebook";
import { ConfirmAction } from "@/components/confirm-action";
import { LoadingButton } from "@/components/loading-button";
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
      if (status !== "idle" || (await prepareStudyShell()) !== "ready")
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
    setSavingRating(selectedRating.current);
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
      setSaveError(false);
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
      setSavingRating(null);
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
          <h1>Sesja zakończona.</h1>
          {settings?.showSession && <p>Odpowiedzi w sesji: {sessionCount}</p>}
          <div className="action-row">
            <a
              ref={returnLink}
              className="primary"
              href={currentDeck ? `/decks?deck=${currentDeck.id}` : "/decks"}
            >
              {currentDeck ? "Wróć do zestawu" : "Moje zestawy"}
            </a>
            <LoadingButton
              className="text-action"
              loading={cardRequest === "restart"}
              loadingLabel="Wczytywanie fiszek…"
              onClick={() => void loadNext("restart")}
            >
              Rozpocznij nową sesję
            </LoadingButton>
          </div>
          {cardReadError && (
            <p role="alert">Nie udało się wczytać fiszek. Spróbuj ponownie.</p>
          )}
        </NotebookSheet>
      </section>
    );
  return (
    <div className={styles.board}>
      {settings?.showDue && dueToday !== null && (
        <p>Powtórki na dziś: {dueToday}</p>
      )}
      {!ended &&
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
            {!workspace
              ? "Wczytywanie fiszek…"
              : offlineUnavailable
                ? "Zestaw niedostępny offline"
                : hasMaterial
                  ? "Limit nowych fiszek"
                  : "Brak fiszek"}
          </h1>
          <p>
            {workspace
              ? offlineUnavailable
                ? "Ten zestaw wymaga przygotowania z dostępem do internetu."
                : hasMaterial
                  ? "W tym zestawie nie ma teraz fiszek w ramach limitu."
                  : "Nie ma dostępnych fiszek do nauki."
              : "Odczytujemy materiał z urządzenia."}
          </p>
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
            {!candidate && (
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
          {offlineError && (
            <p role="alert">
              Nie udało się przygotować zestawu offline. Sprawdź połączenie i
              wolne miejsce, a następnie ponów próbę.
            </p>
          )}
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
