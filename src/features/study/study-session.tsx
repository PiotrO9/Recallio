"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  uuidSchema,
  type Candidate,
  type PreparedReview,
  type Rating,
  type SessionReturn,
} from "@/contracts";
import {
  getStudyDay,
  recordSessionAnswer,
  remainingNewForDay,
  studyQueue,
} from "@/domain/learning/queue";
import {
  FSRS_VERSION,
  fsrsScheduler,
  getEffectiveReviewTime,
} from "@/domain/learning/scheduler";
import {
  createLocalRepository,
  type SnapshotData,
} from "@/storage/local-repository";
import { createSyncController, type SyncStatus } from "@/sync/controller";
import { prepareStudyShell, savedOfflineAccount } from "./offline";
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
    <StudyBoard key={`${id}:${selected ?? ""}`} userId={id} deckId={selected} />
  );
}

function StudyBoard({ userId, deckId }: { userId: string; deckId?: string }) {
  const [workspace, setWorkspace] = useState<SnapshotData>();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [syncState, setSyncState] = useState<SyncStatus>("idle");
  const [offlineReady, setOfflineReady] = useState(false);
  const active = useRef<Candidate | null>(null);
  const timezone = useRef<string | null>(null);
  const previousCard = useRef<string | null>(null);
  const returns = useRef<readonly SessionReturn[]>([]);
  const prepared = useRef<PreparedReview | null>(null);
  const selectedRating = useRef<Rating | null>(null);
  const saving = useRef(false);

  const repository = useMemo(
    () =>
      createLocalRepository({
        userId,
        now: () => new Date(),
        introduction(event) {
          if (!timezone.current) throw new Error("Brak strefy nauki");
          return {
            cardId: event.cardId,
            firstEffectiveAt: event.occurredAt,
            studyDay: getStudyDay(event.occurredAt, timezone.current),
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

  function choose(data: SnapshotData) {
    const deck = data.decks.find(
      (item) =>
        !item.deletedAt &&
        (!deckId || item.id === deckId) &&
        data.cards.some((card) => card.deckId === item.id && !card.deletedAt),
    );
    if (!deck || !data.settings) return null;
    const now = new Date().toISOString();
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
        now,
        data.settings.timezone,
        data.settings.newLimit,
      ),
      random: Math.random,
    });
  }

  async function refresh(advance: boolean) {
    const data = await repository.readWorkspace();
    setWorkspace(data);
    timezone.current = data.settings?.timezone ?? null;
    if (advance || (!active.current && !saving.current)) {
      const next = choose(data);
      active.current = next;
      setCandidate(next);
      setRevealed(false);
    }
  }

  async function synchronize() {
    try {
      setSyncState(await sync.run());
      await refresh(false);
    } catch {
      setSyncState("failed");
    }
  }

  useEffect(() => {
    void refresh(false)
      .then(() => synchronize())
      .catch(() => setSyncState("failed"));
    if (navigator.onLine) void prepareStudyShell().then(setOfflineReady);
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

  async function rate(rating: Rating) {
    const selected = active.current;
    if (!selected || saving.current) return;
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
      active.current = null;
      setCandidate(null);
      await refresh(true);
      void synchronize();
    } catch {
      if (saved) setSyncState("failed");
      else setSaveError(true);
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }

  const status = {
    idle: "",
    offline: "Offline",
    requires_auth: "Zaloguj się ponownie, aby zsynchronizować zapis.",
    retry: "Synchronizacja zaczeka na połączenie.",
    conflict: "Niektóre zmiany wymagają rozstrzygnięcia.",
    failed: "Synchronizacja jest chwilowo niedostępna.",
  }[syncState];
  return (
    <div className={styles.board}>
      <div role="status">
        {status && <p>{status}</p>}
        {offlineReady &&
          workspace?.settings &&
          workspace.cards.some((card) => !card.deletedAt) && (
            <p>Możesz odświeżyć stronę bez internetu.</p>
          )}
        {workspace?.progress.length ? (
          <p>Zapisany postęp: {workspace.progress.length}</p>
        ) : null}
      </div>
      {candidate ? (
        <div className={styles.card}>
          <h2>
            {candidate.direction === "a-b"
              ? candidate.card.sideA
              : candidate.card.sideB}
          </h2>
          {revealed ? (
            <>
              <p>
                {candidate.direction === "a-b"
                  ? candidate.card.sideB
                  : candidate.card.sideA}
              </p>
              {saveError ? (
                <>
                  <p role="alert">Nie udało się zapisać oceny.</p>
                  <button
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
                <div className={styles.grades}>
                  {grades.map(([value, label]) => (
                    <button
                      className="primary"
                      key={value}
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
            <button className="primary" onClick={() => setRevealed(true)}>
              Pokaż odpowiedź
            </button>
          )}
        </div>
      ) : (
        <p>
          {workspace
            ? "Nie ma dostępnych fiszek do nauki."
            : "Wczytywanie fiszek…"}
        </p>
      )}
    </div>
  );
}
