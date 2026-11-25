"use client";

import { prepareStudyShell } from "@/features/study/offline";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  directionModeSchema,
  operationSchema,
  type Card,
  type ContentRecord,
  type Deck,
} from "@/contracts";
import { resetFsrsProgress } from "@/domain/learning/scheduler";
import { exportCsv } from "@/domain/import/csv";
import {
  createLocalRepository,
  type SnapshotData,
} from "@/storage/local-repository";
import { createSyncController, type SyncStatus } from "@/sync/controller";
import styles from "./deck-manager.module.css";

export function DeckManager({
  userId,
  initialDeck,
  createDeck,
  createCard,
}: {
  userId: string;
  initialDeck?: string;
  createDeck?: boolean;
  createCard?: boolean;
}) {
  const [data, setData] = useState<SnapshotData>();
  const [selected, setSelected] = useState<string | undefined>(initialDeck);
  const [search, setSearch] = useState("");
  const [deckForm, setDeckForm] = useState<Deck | null | undefined>(
    createDeck ? null : undefined,
  );
  const [cardForm, setCardForm] = useState<Card | null | undefined>(
    createCard ? null : undefined,
  );
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [offlineReady, setOfflineReady] = useState<readonly string[]>([]);
  const [offlineIssue, setOfflineIssue] = useState<string>();
  const lock = useRef(false);
  const repository = useMemo(
    () =>
      createLocalRepository({
        userId,
        now: () => new Date(),
        introduction() {
          throw new Error("Edycja materiału nie wprowadza fiszek");
        },
      }),
    [userId],
  );
  const controller = useMemo(
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

  async function sync(afterWrite = false) {
    try {
      setStatus(await (afterWrite ? controller.flush() : controller.run()));
      setData(await repository.readWorkspace());
    } catch {
      setStatus("failed");
    }
  }
  useEffect(() => {
    void repository
      .readOfflineDecks()
      .then(setOfflineReady)
      .catch(() => {});
    void repository
      .readWorkspace()
      .then(setData)
      .then(() => sync())
      .catch(() => setStatus("failed"));
    const online = () => void sync();
    const offline = () => setStatus("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", online);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 20000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", online);
      repository.close();
    };
    // The repository and synchronization controller are scoped to the account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, controller]);

  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      await action();
      setData(await repository.readWorkspace());
      void sync(true);
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const decks = data?.decks.filter((deck) => !deck.deletedAt) ?? [];
  const deck = decks.find((item) => item.id === selected);
  const found = decks.filter((item) =>
    item.name
      .toLocaleLowerCase("pl")
      .includes(search.trim().toLocaleLowerCase("pl")),
  );
  const cards =
    data?.cards.filter((card) => card.deckId === deck?.id && !card.deletedAt) ??
    [];
  const message = {
    idle: "",
    offline: "Offline. Zmiany zapisują się na urządzeniu.",
    requires_auth: "Zaloguj się ponownie, aby zsynchronizować zmiany.",
    retry: "Zmiany czekają na synchronizację.",
    conflict: "Wykryto konflikt. Lokalne zmiany zostały zachowane.",
    failed: "Synchronizacja jest chwilowo niedostępna.",
  }[status];

  function commit(operation: object, expected: ContentRecord) {
    return repository.commitContent(operationSchema.parse(operation), expected);
  }

  function saveDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deckForm === undefined) return;
    const fields = new FormData(event.currentTarget);
    const expected = deckForm;
    void perform(async () => {
      const entityId = expected?.id ?? crypto.randomUUID();
      await commit(
        {
          type: expected ? "deck.update" : "deck.create",
          id: crypto.randomUUID(),
          entityId,
          ...(expected && { baseRevision: expected.revision }),
          payload: {
            name: String(fields.get("name") ?? "").trim(),
            directionMode: directionModeSchema.parse(
              fields.get("directionMode"),
            ),
          },
        },
        expected,
      );
      setSelected(entityId);
      if (!expected) setCardForm(null);
      setDeckForm(undefined);
    });
  }

  function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deck || cardForm === undefined) return;
    const fields = new FormData(event.currentTarget);
    const expected = cardForm;
    const text = (name: string) => String(fields.get(name) ?? "");
    void perform(async () => {
      await commit(
        {
          type: expected ? "card.update" : "card.create",
          id: crypto.randomUUID(),
          entityId: expected?.id ?? crypto.randomUUID(),
          ...(expected && { baseRevision: expected.contentRevision }),
          payload: {
            ...(!expected && { deckId: deck.id }),
            sideA: text("sideA"),
            sideB: text("sideB"),
            exampleA: text("exampleA") || null,
            exampleB: text("exampleB") || null,
          },
        },
        expected,
      );
      setCardForm(undefined);
    });
  }

  function remove(item: Deck | Card) {
    const isCard = "contentRevision" in item;
    if (
      !window.confirm(
        isCard ? "Usunąć fiszkę?" : "Usunąć zestaw i jego fiszki?",
      )
    )
      return;
    void perform(async () => {
      await commit(
        {
          type: isCard ? "card.delete" : "deck.delete",
          id: crypto.randomUUID(),
          entityId: item.id,
          baseRevision: isCard ? item.contentRevision : item.revision,
          payload: {},
        },
        item,
      );
      if (isCard) setCardForm(undefined);
      else {
        setDeckForm(undefined);
        setCardForm(undefined);
      }
    });
  }

  function reset(card: Card, direction: "a-b" | "b-a") {
    if (
      !window.confirm(
        "Zresetować postęp tego kierunku? Historia ocen zostanie zachowana.",
      )
    )
      return;
    void perform(async () => {
      const { progress, localVersion } = await repository.readProgressVersion(
        card.id,
        direction,
      );
      if (!progress) return;
      await repository.commitReset(
        {
          id: crypto.randomUUID(),
          type: "progress.reset",
          entityId: card.id,
          baseRevision: progress.revision,
          payload: {
            direction,
            epoch: (BigInt(progress.epoch) + 1n).toString(),
          },
        },
        progress,
        localVersion,
        resetFsrsProgress,
      );
    });
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([exportCsv(cards)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fiszki.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={styles.body}>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert">
          Nie udało się zapisać zmiany. Sprawdź dane lub odśwież listę.
        </p>
      )}
      {!deck && deckForm === undefined && (
        <div className={styles.toolbar}>
          <label>
            Wyszukaj zestaw
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() => setDeckForm(null)}
          >
            Dodaj zestaw
          </button>
          <Link className={styles.link} href="/import">
            Importuj CSV
          </Link>
        </div>
      )}
      {deckForm !== undefined && (
        <form
          className="auth-form"
          key={deckForm?.id ?? "new-deck"}
          onSubmit={saveDeck}
        >
          <h2>{deckForm ? "Edytuj zestaw" : "Nowy zestaw"}</h2>
          <label>
            Nazwa zestawu
            <input
              name="name"
              defaultValue={deckForm?.name}
              maxLength={120}
              required
            />
          </label>
          <label>
            Kierunek zestawu
            <select
              name="directionMode"
              defaultValue={deckForm?.directionMode ?? "a-b"}
            >
              <option value="a-b">A → B</option>
              <option value="b-a">B → A</option>
              <option value="mixed">Mieszany</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            Zapisz zestaw
          </button>
          <button
            className="auth-secondary"
            type="button"
            disabled={busy}
            onClick={() => setDeckForm(undefined)}
          >
            Anuluj
          </button>
        </form>
      )}
      {!deck && deckForm === undefined && (
        <ul className={styles.list} aria-label="Zestawy">
          {found.map((item) => (
            <li key={item.id}>
              <button
                className="catalog-row"
                onClick={() => {
                  setSelected(item.id);
                  setCardForm(undefined);
                  setDeckForm(undefined);
                }}
              >
                <span>{item.name}</span>
                <small>Otwórz</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!deck && decks.length > 0 && !found.length && (
        <p>Brak zestawów pasujących do wyszukiwania.</p>
      )}
      {deck && deckForm === undefined ? (
        <section className={styles.body} aria-label={deck.name}>
          <button
            className="text-action"
            onClick={() => {
              setSelected(undefined);
              setCardForm(undefined);
            }}
          >
            Wróć do zestawów
          </button>
          <h2>{deck.name}</h2>
          {cardForm === undefined && (
            <>
              <div className={styles.actions}>
                {!!cards.length && (
                  <a className="primary" href={`/study?deck=${deck.id}`}>
                    Ucz się z tego zestawu
                  </a>
                )}
                <button
                  className={cards.length ? "auth-secondary" : "primary"}
                  disabled={busy}
                  onClick={() => setCardForm(null)}
                >
                  {cards.length ? "Dodaj fiszkę" : "Dodaj pierwszą fiszkę"}
                </button>
              </div>
              <details>
                <summary>Zarządzaj zestawem</summary>
                {offlineReady.includes(deck.id) ? (
                  <p role="status">
                    Zestaw jest gotowy do nauki offline na tym urządzeniu.
                  </p>
                ) : (
                  <button
                    className="auth-secondary"
                    disabled={busy || !cards.length}
                    onClick={() =>
                      void perform(async () => {
                        setOfflineIssue(undefined);
                        try {
                          const result = await controller.run(true);
                          setStatus(result);
                          if (result !== "idle" || !(await prepareStudyShell()))
                            throw new Error();
                          await repository.markOfflineDeck(deck.id);
                          setOfflineReady(await repository.readOfflineDecks());
                        } catch {
                          setOfflineIssue(deck.id);
                        }
                      })
                    }
                  >
                    Przygotuj zestaw offline
                  </button>
                )}
                {offlineIssue === deck.id && (
                  <p role="alert">
                    Nie udało się przygotować zestawu offline. Sprawdź
                    połączenie i wolne miejsce, a następnie ponów próbę.
                  </p>
                )}
                <div className={styles.actions}>
                  <Link href={`/import?deck=${deck.id}`}>
                    Importuj CSV do zestawu
                  </Link>
                  <button
                    className="auth-secondary"
                    disabled={busy}
                    onClick={() => setDeckForm(deck)}
                  >
                    Edytuj zestaw
                  </button>
                  <button
                    className="auth-secondary"
                    disabled={busy}
                    onClick={() => remove(deck)}
                  >
                    Usuń zestaw
                  </button>

                  <button
                    className="auth-secondary"
                    disabled={!cards.length}
                    onClick={download}
                  >
                    Eksportuj CSV
                  </button>
                </div>
              </details>
            </>
          )}
          {cardForm !== undefined && (
            <form
              className="auth-form"
              key={cardForm?.id ?? "new-card"}
              onSubmit={saveCard}
            >
              <h3>
                {cardForm
                  ? "Edytuj fiszkę"
                  : cards.length
                    ? "Nowa fiszka"
                    : "Pierwsza fiszka"}
              </h3>
              <label>
                Strona A
                <textarea
                  autoFocus
                  name="sideA"
                  defaultValue={cardForm?.sideA}
                  maxLength={4000}
                  required
                />
              </label>
              <label>
                Strona B
                <textarea
                  name="sideB"
                  defaultValue={cardForm?.sideB}
                  maxLength={4000}
                  required
                />
              </label>
              <label>
                Przykład A
                <input
                  name="exampleA"
                  defaultValue={cardForm?.exampleA ?? ""}
                  maxLength={8000}
                />
              </label>
              <label>
                Przykład B
                <input
                  name="exampleB"
                  defaultValue={cardForm?.exampleB ?? ""}
                  maxLength={8000}
                />
              </label>
              <button className="primary" disabled={busy}>
                Zapisz fiszkę
              </button>
              <button
                className="auth-secondary"
                type="button"
                disabled={busy}
                onClick={() => setCardForm(undefined)}
              >
                Anuluj
              </button>
            </form>
          )}
          {cardForm === undefined && (
            <ul className={styles.list} aria-label="Fiszki">
              {cards.map((card) => (
                <li className={styles.card} key={card.id}>
                  <strong>{card.sideA}</strong>
                  <span>{card.sideB}</span>
                  <div className={styles.actions}>
                    <button
                      className="auth-secondary"
                      disabled={busy}
                      onClick={() => setCardForm(card)}
                    >
                      Edytuj fiszkę
                    </button>
                    <button
                      className="auth-secondary"
                      disabled={busy}
                      onClick={() => remove(card)}
                    >
                      Usuń fiszkę
                    </button>
                    {data?.progress
                      .filter((entry) => entry.cardId === card.id)
                      .map(({ direction }) => (
                        <button
                          className="auth-secondary"
                          key={direction}
                          disabled={busy}
                          onClick={() => reset(card, direction)}
                        >
                          Zresetuj {direction === "a-b" ? "A → B" : "B → A"}
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cardForm === undefined && !cards.length && (
            <p>W zestawie nie ma fiszek.</p>
          )}
        </section>
      ) : (
        !decks.length &&
        deckForm === undefined && (
          <p>
            {data
              ? "Utwórz pierwszy zestaw lub zaimportuj fiszki z pliku CSV."
              : "Wczytywanie zestawów…"}
          </p>
        )
      )}
    </div>
  );
}
