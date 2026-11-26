"use client";

import {
  MAX_CARD_SIDE_LENGTH,
  MAX_CARD_EXAMPLE_LENGTH,
  MAX_DECK_NAME_LENGTH,
} from "@/domain/content-limits";
import { NotebookSheet, deckColor } from "@/components/notebook";
import { ValidatedField } from "@/components/validated-field";
import { prepareDeckOffline, offlineErrors } from "@/features/study/offline";
import { ConfirmAction } from "@/components/confirm-action";
import { LoadingButton } from "@/components/loading-button";
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
import { indexCards, searchCards } from "@/domain/card-search";
import { exportCsv } from "@/domain/import/csv";
import {
  ContentVersionConflict,
  type SnapshotData,
} from "@/storage/local-repository";
import type { SyncStatus } from "@/sync/controller";
import { openLocalAccount } from "@/features/local-account";
import styles from "./deck-manager.module.css";
import {
  useLibraryNavigation,
  deckHref,
  type LibraryEntry,
} from "./use-library-navigation";
import { discardDraft, draftKey, readDraft, rememberDraft } from "./card-draft";

type DeckAction =
  | "saveDeck"
  | "saveCard"
  | "deleteDeck"
  | "deleteCard"
  | "offline"
  | "reset-a-b"
  | "reset-b-a";

export function DeckManager(entry: LibraryEntry) {
  const { userId } = entry;
  const [data, setData] = useState<SnapshotData>();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [operation, setOperation] = useState<DeckAction | null>(null);
  const busy = operation !== null;
  const {
    selected,
    target,
    scope,
    setScope,
    visible,
    setVisible,
    search,
    setSearch,
    deckForm,
    cardForm,
    returnPosition,
    focusSelection,
    openDeck,
    returnToList,
    closeCardForm,
    openCardForm,
    openDeckForm,
    finishDeckSave,
    leaveDeletedDeck,
    cancelDeckForm,
  } = useLibraryNavigation(entry, busy);
  const [error, setError] = useState(false);
  const [offlineReady, setOfflineReady] = useState<readonly string[]>([]);
  const [offlineIssue, setOfflineIssue] = useState<{
    id: string;
    reason: keyof typeof offlineErrors;
  }>();
  const [savedCards, setSavedCards] = useState(0);
  const [notice, setNotice] = useState<{ deckId: string; text: string }>();
  const lock = useRef(false);
  const { repository, sync: controller } = useMemo(
    () => openLocalAccount(userId),
    [userId],
  );

  const [confirmed, setConfirmed] = useState(false);
  const [missing, setMissing] = useState(false);
  const searchField = useRef<HTMLInputElement>(null);
  const [readError, setReadError] = useState(false);
  const [reading, setReading] = useState(false);
  async function readAfterSave() {
    setReading(true);
    try {
      setData(await repository.readWorkspace());
      setReadError(false);
      return true;
    } catch {
      setReadError(true);
      return false;
    } finally {
      setReading(false);
    }
  }
  async function sync(afterWrite = false) {
    try {
      const outcome = await (afterWrite
        ? controller.flush()
        : controller.run());
      setStatus(outcome);
      setData(await repository.readWorkspace());
      if (outcome === "idle") setConfirmed(true);
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

  async function perform(
    name: DeckAction,
    action: () => Promise<void>,
    afterRead?: () => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setOperation(name);
    setError(false);
    try {
      await action();
      const refreshed = await readAfterSave();
      afterRead?.();
      if (refreshed) void sync(true);
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setOperation(null);
    }
  }

  const decks = data?.decks.filter((deck) => !deck.deletedAt) ?? [];
  const deck = decks.find((item) => item.id === selected);
  const index = useMemo(
    () => indexCards(data?.decks ?? [], data?.cards ?? []),
    [data],
  );
  const searching = scope === "cards" && !!search.trim();
  const hits = useMemo(
    () => (searching ? searchCards(index, search) : []),
    [index, search, searching],
  );
  const linked =
    target && deck
      ? data?.cards.find(
          (c) => c.id === target && c.deckId === deck.id && !c.deletedAt,
        )
      : undefined;
  useEffect(() => {
    if (!target) return;
    if (linked) {
      if (cardForm?.id !== linked.id) openCardForm(linked);
      return;
    }
    if (confirmed) {
      setMissing(true);
      closeCardForm();
    }
  }, [target, linked, cardForm, confirmed, closeCardForm, openCardForm]);
  useEffect(() => {
    const position = returnPosition.current;
    if (
      !selected &&
      data &&
      position?.scope === "cards" &&
      !hits.some((h) => h.card.id === position.rowId)
    ) {
      searchField.current?.focus();
      returnPosition.current = undefined;
    }
  }, [selected, data, hits, returnPosition]);
  const editorKey =
    deck && cardForm !== undefined
      ? draftKey(userId, deck.id, cardForm?.id)
      : undefined;
  const restoredDraft = useMemo(
    () => (editorKey ? readDraft(editorKey) : undefined),
    [editorKey, savedCards],
  );
  const found = decks.filter((item) =>
    item.name
      .toLocaleLowerCase("pl")
      .includes(search.trim().toLocaleLowerCase("pl")),
  );
  const counts = new Map<string, number>();
  for (const c of data?.cards ?? [])
    if (!c.deletedAt) counts.set(c.deckId, (counts.get(c.deckId) ?? 0) + 1);
  const cards =
    data?.cards.filter((card) => card.deckId === deck?.id && !card.deletedAt) ??
    [];
  const message = {
    idle: "",
    quota: offlineErrors.quota,
    offline: "Offline. Zmiany zapisują się na urządzeniu.",
    requires_auth: "Zaloguj się ponownie, aby zsynchronizować zmiany.",
    retry: "Zmiany czekają na synchronizację.",
    conflict: "Wykryto konflikt. Lokalne zmiany zostały zachowane.",
    failed: "Synchronizacja jest chwilowo niedostępna.",
  }[status];

  async function commit(input: object, expected: ContentRecord) {
    const operation = operationSchema.parse(input);
    try {
      return await repository.commitContent(operation, expected);
    } catch (error) {
      if (
        !(error instanceof ContentVersionConflict) ||
        (operation.type !== "card.update" &&
          operation.type !== "card.delete") ||
        !expected ||
        !("contentRevision" in expected)
      )
        throw error;
      // A sync receipt can advance the revision while the same text is still in the editor.
      const stored = await repository.readContent("card", operation.entityId);
      if (
        !stored ||
        !("contentRevision" in stored) ||
        stored.deletedAt ||
        stored.deckId !== expected.deckId ||
        stored.sideA !== expected.sideA ||
        stored.sideB !== expected.sideB ||
        stored.exampleA !== expected.exampleA ||
        stored.exampleB !== expected.exampleB
      )
        throw error;
      return repository.commitContent(
        { ...operation, baseRevision: stored.contentRevision },
        stored,
      );
    }
  }

  function saveDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deckForm === undefined) return;
    const fields = new FormData(event.currentTarget);
    const expected = deckForm;
    void perform("saveDeck", async () => {
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
      finishDeckSave(entityId, !expected);
    });
  }

  function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deck || cardForm === undefined || !editorKey) return;
    const fields = new FormData(event.currentTarget);
    const expected = restoredDraft?.base ?? cardForm;
    const text = (name: string) => String(fields.get(name) ?? "");
    void perform(
      "saveCard",
      async () => {
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
        discardDraft(editorKey);
        setNotice({ deckId: deck.id, text: "Zapisano fiszkę." });
        setSavedCards((n) => n + 1);
      },
      () => {
        if (expected) closeCardForm();
        else openCardForm(null);
      },
    );
  }

  function remove(item: Deck | Card) {
    const isCard = "contentRevision" in item;
    void perform(isCard ? "deleteCard" : "deleteDeck", async () => {
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
      if (isCard) {
        discardDraft(draftKey(userId, item.deckId, item.id));
        closeCardForm();
      } else {
        leaveDeletedDeck();
      }
    });
  }

  function reset(card: Card, direction: "a-b" | "b-a") {
    void perform(`reset-${direction}`, async () => {
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
    if (deck)
      setNotice({ deckId: deck.id, text: "Przygotowano plik fiszki.csv." });
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const browsing = deckForm === undefined && (!deck || cardForm === undefined);
  const preview = !deck && !searching && found[0];
  const previewCard =
    preview && data?.cards.find((c) => !c.deletedAt && c.deckId === preview.id);
  return (
    <div className={styles.body}>
      {missing && <p role="status">Ta fiszka nie jest już dostępna.</p>}
      {target && !linked && !confirmed && (
        <p role="status">
          {status === "idle"
            ? "Wczytywanie fiszki…"
            : "Nie udało się pobrać fiszki."}{" "}
          {status !== "idle" && (
            <button onClick={() => void sync()}>Ponów pobieranie</button>
          )}
        </p>
      )}
      {readError && (
        <div>
          <p role="alert">Nie udało się odświeżyć biblioteki po zapisie.</p>
          <LoadingButton
            type="button"
            loading={reading}
            loadingLabel="Wczytywanie…"
            onClick={() =>
              void readAfterSave().then((ok) => {
                if (ok) void sync(true);
              })
            }
          >
            Ponów odczyt
          </LoadingButton>
        </div>
      )}
      {error && (
        <p role="alert">
          Nie udało się zapisać zmiany. Sprawdź dane lub odśwież listę.
        </p>
      )}
      <div
        className={styles.layout}
        data-split={browsing && !!(deck || preview)}
        data-selected={!!deck}
      >
        {browsing && !target && (
          <section className={styles.index} aria-label="Biblioteka">
            {deck ? <h2>Moje zestawy</h2> : <h1>Moje zestawy</h1>}
            <div className={styles.toolbar}>
              <label>
                Szukaj w
                <select
                  value={scope}
                  onChange={(event) => {
                    setScope(
                      event.target.value === "cards" ? "cards" : "decks",
                    );
                    setVisible(50);
                  }}
                >
                  <option value="decks">Zestawy</option>
                  <option value="cards">Fiszki</option>
                </select>
              </label>
              <label>
                {scope === "cards" ? "Wyszukaj fiszkę" : "Wyszukaj zestaw"}
                <input
                  ref={searchField}
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisible(50);
                    setMissing(false);
                  }}
                />
              </label>
              <button
                className="primary"
                disabled={busy}
                onClick={() => openDeckForm(null)}
              >
                Dodaj zestaw
              </button>
              <Link className={styles.link} href="/import?source=paste">
                Wklej fiszki
              </Link>
              <Link className={styles.link} href="/import">
                Importuj CSV
              </Link>
            </div>

            {searching ? (
              <>
                <ul
                  className={styles.list}
                  aria-label="Wyniki wyszukiwania fiszek"
                >
                  {hits.slice(0, visible).map(({ card, deckName }) => (
                    <li key={card.id}>
                      <a
                        className={styles.deckRow}
                        style={deckColor(card.deckId)}
                        href={deckHref(card.deckId, card.id)}
                        onClick={(event) => {
                          setMissing(false);
                          openDeck(event, card.deckId, card.id);
                        }}
                        ref={(el) => {
                          const p = returnPosition.current;
                          if (el && !selected && p?.rowId === card.id) {
                            returnPosition.current = undefined;
                            el.focus({ preventScroll: true });
                            if (p.scrollY != null)
                              window.scrollTo(0, p.scrollY);
                          }
                        }}
                      >
                        <span>
                          <strong>{card.sideA}</strong> · {card.sideB}
                          <span className={styles.count}>{deckName}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                {hits.length > visible && (
                  <button
                    className="auth-secondary"
                    onClick={() => setVisible((n) => n + 50)}
                  >
                    Pokaż więcej
                  </button>
                )}
              </>
            ) : (
              <ul className={styles.list} aria-label="Zestawy">
                {found.map((item) => (
                  <li key={item.id}>
                    <a
                      className={styles.deckRow}
                      href={deckHref(item.id)}
                      aria-disabled={busy || undefined}
                      style={deckColor(item.id)}
                      aria-current={deck?.id === item.id ? "true" : undefined}
                      ref={(el) => {
                        const position = returnPosition.current;
                        if (el && !selected && position?.rowId === item.id) {
                          returnPosition.current = undefined;
                          el.focus({ preventScroll: true });
                          if (position.scrollY === null)
                            el.scrollIntoView({ block: "nearest" });
                          else window.scrollTo(0, position.scrollY);
                        }
                      }}
                      onClick={(event) => openDeck(event, item.id)}
                    >
                      <span>
                        {item.name}
                        <span className={styles.count}>
                          Fiszki: {counts.get(item.id) ?? 0}
                        </span>
                      </span>
                      <small>Otwórz</small>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {data &&
              (searching
                ? !hits.length
                : decks.length > 0 && !found.length) && (
                <div>
                  <p>Brak wyników dla „{search}”.</p>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setSearch("")}
                  >
                    Wyczyść wyszukiwanie
                  </button>
                </div>
              )}

            {!decks.length && (
              <p>
                {data
                  ? "Utwórz pierwszy zestaw lub zaimportuj fiszki z pliku CSV."
                  : "Wczytywanie zestawów…"}
              </p>
            )}
          </section>
        )}
        {browsing && preview && (
          <aside className={styles.preview} aria-label="Podgląd zestawu">
            <NotebookSheet deckId={preview.id} className={styles.cover}>
              <p>Podgląd zestawu</p>
              <h2>{preview.name}</h2>
              <p>Fiszki: {counts.get(preview.id) ?? 0}</p>
              {previewCard && (
                <div className={styles.sample}>
                  <strong>{previewCard.sideA}</strong>
                  <span>{previewCard.sideB}</span>
                </div>
              )}
              <a
                className="primary"
                href={deckHref(preview.id)}
                onClick={(event) => openDeck(event, preview.id)}
              >
                Otwórz zestaw
              </a>
            </NotebookSheet>
          </aside>
        )}
        {deckForm !== undefined && (
          <form
            className="auth-form"
            key={deckForm?.id ?? "new-deck"}
            onSubmit={saveDeck}
          >
            <header className={styles.formIntro}>
              <h1>{deckForm ? "Edytuj zestaw" : "Nowy zestaw"}</h1>
              <p>Wybierz, którą stronę fiszki zobaczysz jako pytanie.</p>
            </header>
            <NotebookSheet deckId={deck?.id} className={styles.fields}>
              <ValidatedField label="Nazwa zestawu" hint="Wpisz nazwę zestawu.">
                <input
                  autoFocus
                  name="name"
                  defaultValue={deckForm?.name}
                  maxLength={MAX_DECK_NAME_LENGTH}
                  required
                />
              </ValidatedField>
              <fieldset className={styles.direction}>
                <legend>Kierunek zestawu</legend>
                {[
                  ["a-b", "Ze strony A na B"],
                  ["b-a", "Ze strony B na A"],
                  ["mixed", "Mieszany"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="directionMode"
                      value={value}
                      defaultChecked={
                        value === (deckForm?.directionMode ?? "a-b")
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <LoadingButton
                className="primary"
                disabled={busy}
                loading={operation === "saveDeck"}
                loadingLabel="Zapisywanie zestawu…"
              >
                Zapisz zestaw
              </LoadingButton>
              <button
                className="auth-secondary"
                type="button"
                disabled={busy}
                onClick={cancelDeckForm}
              >
                Anuluj
              </button>
            </NotebookSheet>
          </form>
        )}

        {deck &&
          deckForm === undefined &&
          (!target || (linked && cardForm)) && (
            <section className={styles.detail} aria-label={deck.name}>
              <button
                className="text-action"
                disabled={busy}
                onClick={() => {
                  if (cardForm === undefined) returnToList(deck.id);
                  else closeCardForm();
                }}
              >
                {cardForm === undefined
                  ? "Wróć do zestawów"
                  : target && scope === "cards"
                    ? "Wróć do wyników"
                    : target &&
                        typeof window !== "undefined" &&
                        new URLSearchParams(window.location.search).get(
                          "from",
                        ) === "repair"
                      ? "Wróć do listy Do poprawy"
                      : "Wróć do zestawu"}
              </button>
              {cardForm === undefined && (
                <NotebookSheet deckId={deck.id} className={styles.cover}>
                  <h1
                    tabIndex={-1}
                    ref={(el) => {
                      if (el && focusSelection.current) {
                        focusSelection.current = false;
                        el.focus();
                      }
                    }}
                  >
                    {deck.name}
                  </h1>
                  <p>
                    Fiszki: {cards.length} ·{" "}
                    {deck.directionMode === "mixed"
                      ? "Kierunek mieszany"
                      : deck.directionMode === "a-b"
                        ? "Ze strony A na B"
                        : "Ze strony B na A"}
                  </p>
                  <div className={styles.actions}>
                    {!!cards.length && (
                      <a className="primary" href={`/study?deck=${deck.id}`}>
                        Ucz się z tego zestawu
                      </a>
                    )}
                    <button
                      className={cards.length ? "auth-secondary" : "primary"}
                      disabled={busy}
                      onClick={() => openCardForm(null)}
                    >
                      {cards.length ? "Dodaj fiszkę" : "Dodaj pierwszą fiszkę"}
                    </button>
                  </div>
                </NotebookSheet>
              )}
              {notice?.deckId === deck.id && (
                <p role="status">
                  {notice.text}
                  {cardForm === null && (
                    <>
                      {" "}
                      <a href={`/study?deck=${deck.id}`}>
                        Ucz się z tego zestawu
                      </a>
                    </>
                  )}
                </p>
              )}
              {cardForm === undefined && (
                <>
                  <details>
                    <summary>Zarządzaj zestawem</summary>
                    {offlineReady.includes(deck.id) ? (
                      <p role="status">
                        Zestaw jest gotowy do nauki offline na tym urządzeniu.
                      </p>
                    ) : (
                      <LoadingButton
                        className="auth-secondary"
                        disabled={busy || !cards.length}
                        loading={operation === "offline"}
                        loadingLabel="Przygotowywanie zestawu…"
                        onClick={() =>
                          void perform("offline", async () => {
                            setOfflineIssue(undefined);
                            const { status, result } = await prepareDeckOffline(
                              deck.id,
                              controller,
                              repository,
                            );
                            setStatus(status);
                            if (result === "ready")
                              setOfflineReady((ids) => [
                                ...new Set([...ids, deck.id]),
                              ]);
                            else
                              setOfflineIssue({ id: deck.id, reason: result });
                          })
                        }
                      >
                        Przygotuj zestaw offline
                      </LoadingButton>
                    )}
                    {offlineIssue?.id === deck.id && (
                      <p role="alert">{offlineErrors[offlineIssue.reason]}</p>
                    )}
                    <div className={styles.actions}>
                      <Link href={`/import?source=paste&deck=${deck.id}`}>
                        Wklej fiszki
                      </Link>
                      <Link href={`/import?deck=${deck.id}`}>
                        Importuj CSV do zestawu
                      </Link>
                      <button
                        className="auth-secondary"
                        disabled={busy}
                        onClick={() => openDeckForm(deck)}
                      >
                        Edytuj zestaw
                      </button>
                      <ConfirmAction
                        label="Usuń zestaw"
                        loading={operation === "deleteDeck"}
                        loadingLabel="Usuwanie zestawu…"
                        title="Usunąć zestaw?"
                        description={`Usuniesz zestaw „${deck.name}” i wszystkie jego fiszki.`}
                        disabled={busy}
                        onConfirm={() => remove(deck)}
                      />

                      <button
                        className="auth-secondary"
                        disabled={busy || !cards.length}
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
                  key={cardForm?.id ?? "new-card-" + savedCards}
                  onSubmit={saveCard}
                  onChange={(event) => {
                    if (editorKey)
                      rememberDraft(
                        editorKey,
                        restoredDraft?.base ?? cardForm,
                        new FormData(event.currentTarget),
                      );
                  }}
                >
                  <header className={styles.formIntro}>
                    <h1>
                      {cardForm
                        ? "Edytuj fiszkę"
                        : cards.length
                          ? "Nowa fiszka"
                          : "Pierwsza fiszka"}
                    </h1>
                    <p>{deck.name}</p>
                  </header>
                  <NotebookSheet deckId={deck?.id} className={styles.fields}>
                    <div className={styles.pair}>
                      <ValidatedField
                        label="Strona A"
                        hint="Wpisz treść strony A."
                      >
                        <textarea
                          autoFocus
                          name="sideA"
                          readOnly={busy}
                          defaultValue={restoredDraft?.sideA ?? cardForm?.sideA}
                          maxLength={MAX_CARD_SIDE_LENGTH}
                          required
                        />
                      </ValidatedField>
                      <ValidatedField
                        label="Strona B"
                        hint="Wpisz odpowiedź ze strony B."
                      >
                        <textarea
                          name="sideB"
                          readOnly={busy}
                          defaultValue={restoredDraft?.sideB ?? cardForm?.sideB}
                          maxLength={MAX_CARD_SIDE_LENGTH}
                          required
                        />
                      </ValidatedField>
                    </div>
                    <details
                      open={
                        cardForm ||
                        restoredDraft?.exampleA ||
                        restoredDraft?.exampleB
                          ? true
                          : undefined
                      }
                    >
                      <summary>Przykłady (opcjonalne)</summary>
                      <div className={styles.pair}>
                        <label>
                          Przykład A
                          <input
                            name="exampleA"
                            readOnly={busy}
                            defaultValue={
                              restoredDraft?.exampleA ??
                              cardForm?.exampleA ??
                              ""
                            }
                            maxLength={MAX_CARD_EXAMPLE_LENGTH}
                          />
                        </label>
                        <label>
                          Przykład B
                          <input
                            name="exampleB"
                            readOnly={busy}
                            defaultValue={
                              restoredDraft?.exampleB ??
                              cardForm?.exampleB ??
                              ""
                            }
                            maxLength={MAX_CARD_EXAMPLE_LENGTH}
                          />
                        </label>
                      </div>
                    </details>
                    {cardForm && (
                      <details>
                        <summary>Postęp i usuwanie</summary>
                        <div className="action-row">
                          {data?.progress
                            .filter((p) => p.cardId === cardForm.id)
                            .map((p) => (
                              <ConfirmAction
                                key={p.direction}
                                loading={operation === `reset-${p.direction}`}
                                loadingLabel="Resetowanie…"
                                label={`Zresetuj ${p.direction === "a-b" ? "A → B" : "B → A"}`}
                                title="Zresetować postęp kierunku?"
                                description="Historia ocen pozostanie zapisana. Wybrany kierunek rozpocznie naukę od początku."
                                disabled={busy}
                                onConfirm={() => reset(cardForm, p.direction)}
                              />
                            ))}
                          <ConfirmAction
                            label="Usuń fiszkę"
                            loading={operation === "deleteCard"}
                            loadingLabel="Usuwanie fiszki…"
                            title="Usunąć fiszkę?"
                            description="Obie strony fiszki zostaną usunięte z zestawu."
                            disabled={busy}
                            onConfirm={() => remove(cardForm)}
                          />
                        </div>
                      </details>
                    )}
                    <div className={styles.actions}>
                      <LoadingButton
                        className="primary"
                        disabled={busy}
                        loading={operation === "saveCard"}
                        loadingLabel="Zapisywanie fiszki…"
                      >
                        {cardForm ? "Zapisz zmiany" : "Zapisz i dodaj następną"}
                      </LoadingButton>
                      <ConfirmAction
                        label="Anuluj"
                        title="Odrzucić szkic fiszki?"
                        description="Niezapisane zmiany w tej fiszce zostaną usunięte."
                        confirm="Odrzuć szkic"
                        cancelLabel="Wróć do edycji"
                        triggerClassName="text-action"
                        needsConfirmation={() =>
                          !!editorKey && !!readDraft(editorKey)
                        }
                        disabled={busy}
                        onConfirm={() => {
                          if (editorKey) discardDraft(editorKey);
                          closeCardForm();
                        }}
                      />
                    </div>
                  </NotebookSheet>
                </form>
              )}
              {cardForm === undefined && <h2>Fiszki</h2>}
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
                          onClick={() => openCardForm(card)}
                        >
                          Edytuj fiszkę
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {cardForm === undefined && !cards.length && (
                <p>W zestawie nie ma fiszek.</p>
              )}
            </section>
          )}
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
