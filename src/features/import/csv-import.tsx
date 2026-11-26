"use client";

import { MAX_DECK_NAME_LENGTH } from "@/domain/content-limits";
import { ConfirmAction } from "@/components/confirm-action";
import { LoadingButton } from "@/components/loading-button";
import { ActionLink } from "@/components/action-link";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { reviewImport, matching, type Decision } from "@/domain/import/review";
import {
  classifyRows,
  CsvError,
  MAX_CSV_BYTES,
  parseCsv,
  type Content,
} from "@/domain/import/csv";
import {
  type ImportReceipt,
  type ImportStep,
  type SnapshotData,
  type StoredImport,
} from "@/storage/local-repository";
import { openLocalAccount } from "@/features/local-account";
import styles from "./csv-import.module.css";

const labels = {
  valid: "Gotowy do importu",
  exact_duplicate: "Duplikat",
  answer_variant: "Inna odpowiedź",
  example_conflict: "Inny przykład",
  invalid: "Błąd wiersza",
};
const pageSize = 20;

function ContentColumn({
  title,
  content,
  compareWith,
}: {
  title: string;
  content: Content;
  compareWith?: Content;
}) {
  const fields = [
    ["sideA", "Strona A"],
    ["sideB", "Strona B"],
    ["exampleA", "Przykład A"],
    ["exampleB", "Przykład B"],
  ] as const;
  return (
    <div>
      <strong>{title}</strong>
      <dl>
        {fields.map(([key, label]) => {
          if (key.startsWith("example") && !content[key] && !compareWith?.[key])
            return null;
          return (
            <div
              key={key}
              data-different={
                !!compareWith && content[key] !== compareWith[key]
              }
            >
              <dt>{label}</dt>
              <dd>{content[key] || "Brak"}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function CsvImport({
  userId,
  initialDeck,
}: {
  userId: string;
  initialDeck?: string;
}) {
  const [workspace, setWorkspace] = useState<SnapshotData>();
  const [active, setActive] = useState<StoredImport | null>(null);
  const [deckId, setDeckId] = useState(initialDeck ?? "");
  const [file, setFile] = useState<ReturnType<typeof parseCsv>>();
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [page, setPage] = useState(0);
  const reviewForm = useRef<HTMLFormElement>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  useEffect(() => {
    if (focusRow === null) return;
    const record = reviewForm.current?.querySelector<HTMLDetailsElement>(
      `details[data-row="${focusRow}"]`,
    );
    if (record) {
      record.open = true;
      const input =
        record.querySelector<HTMLSelectElement>("select[data-target]") ??
        record.querySelector("select");
      input?.focus();
    }
    setFocusRow(null);
  }, [focusRow, page]);

  const [operation, setOperation] = useState<
    "start" | "resume" | "finish" | null
  >(null);
  const busy = operation !== null;
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<ImportReceipt>();
  const [newName, setNewName] = useState("");
  const [preview, setPreview] = useState(false),
    [pausing, setPausing] = useState(false),
    [filename, setFilename] = useState("");
  const running = useRef(false),
    pauseRequested = useRef(false),
    fileVersion = useRef(0);
  const { repository, sync } = useMemo(
    () => openLocalAccount(userId),
    [userId],
  );

  useEffect(() => {
    void Promise.all([repository.readWorkspace(), repository.readImport()])
      .then(([data, plan]) => {
        setWorkspace(data);
        setActive(plan);
        if (!plan && navigator.onLine)
          return sync
            .run()
            .then(() => repository.readWorkspace())
            .then(setWorkspace);
      })
      .catch(() => setError("Nie udało się otworzyć lokalnego importu."));
    return () => repository.close();
  }, [repository, sync]);

  function changeTarget(id: string) {
    setDeckId(id);
    setDecisions({});
    setPage(0);
  }
  const availableDecks = workspace?.decks.filter((d) => !d.deletedAt) ?? [];
  const target =
    workspace?.decks.find((deck) => deck.id === deckId && !deck.deletedAt) ??
    null;
  const existing = useMemo(
    () =>
      workspace?.cards.filter(
        (card) => card.deckId === deckId && !card.deletedAt,
      ) ?? [],
    [workspace, deckId],
  );
  const rows = useMemo(
    () =>
      file
        ? classifyRows(file.rows, existing, {
            skipExactDuplicates: skipDuplicates,
            skippedRows: new Set(
              Object.entries(decisions)
                .filter(
                  ([, action]) => !!action.kind && action.kind !== "create",
                )
                .map(([line]) => Number(line)),
            ),
          })
        : [],
    [file, existing, skipDuplicates, decisions],
  );

  const { reviewed, unresolved, accepted } = useMemo(
    () => reviewImport(rows, decisions, existing),
    [rows, decisions, existing],
  );

  async function readFile(input?: File) {
    const version = ++fileVersion.current;
    setReadingFile(!!input);
    setDone(undefined);
    setPreview(false);
    setFilename(input?.name ?? "");
    setError("");
    setFile(undefined);
    setDecisions({});
    setPage(0);
    if (!input) return;
    try {
      if (input.size > MAX_CSV_BYTES) {
        setError("Plik przekracza 1 MiB. Podziel go na mniejsze pliki.");
        return;
      }
      const bytes = await input.arrayBuffer();
      if (version !== fileVersion.current) return;
      setFile(
        parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch (problem) {
      if (version !== fileVersion.current) return;
      setError(
        problem instanceof CsvError
          ? `Wiersz ${problem.row}. ${problem.message}`
          : "Nie udało się odczytać pliku. Zapisz plik w kodowaniu UTF-8 i wybierz go ponownie.",
      );
    } finally {
      if (version === fileVersion.current) setReadingFile(false);
    }
  }

  async function run(plan: StoredImport) {
    pauseRequested.current = false;
    let current: StoredImport | null = plan;
    while (current && current.id === plan.id && current.next < current.total) {
      if (pauseRequested.current) return;
      const step = await repository.readImportStep(current.id, current.next);
      await repository.commitContent(step.operation, step.expected, {
        id: current.id,
        index: current.next,
      });
      current = await repository.readImport();
      setActive(current);
    }
    if (current?.id !== plan.id) return;
    setDone(await repository.finishImport(plan.id));
    setActive(null);
    setFile(undefined);
    setWorkspace(await repository.readWorkspace());
    void sync.run();
  }

  async function guarded(
    name: "start" | "resume" | "finish",
    action: () => Promise<void>,
  ) {
    if (running.current) return;
    running.current = true;
    setOperation(name);
    setError("");
    try {
      await action();
    } catch {
      const plan = await repository.readImport().catch(() => null);
      setActive(plan);
      setError(
        plan
          ? "Zapis przerwany. Możesz wznowić import lub zakończyć go na zapisanych wierszach."
          : "Dane zestawu się zmieniły albo plan jest nieprawidłowy. Odśwież zestaw i sprawdź podgląd.",
      );
    } finally {
      running.current = false;
      setOperation(null);
      setPausing(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || unresolved.length > 0 || !accepted) return;
    const form = new FormData(event.currentTarget);
    void guarded("start", async () => {
      const id = target?.id ?? crypto.randomUUID();
      const steps: ImportStep[] = [];
      if (!target) {
        const name = String(form.get("name") ?? "").trim();
        if (!name) throw new Error("Nazwa zestawu jest wymagana");
        steps.push({
          operation: {
            type: "deck.create",
            id: crypto.randomUUID(),
            entityId: id,
            payload: { name, directionMode: "a-b" },
          },
          expected: null,
        });
      }
      for (const { row, choice, card } of reviewed) {
        if (choice.kind === "skip") continue;
        if (choice.kind === "create") {
          steps.push({
            operation: {
              type: "card.create",
              id: crypto.randomUUID(),
              entityId: crypto.randomUUID(),
              payload: { ...row.content, deckId: id },
            },
            expected: null,
          });
          continue;
        }
        if (!card) throw new Error("Brak wskazanej fiszki");
        const { sideA, sideB, exampleA, exampleB } = row.content;
        steps.push({
          operation: {
            type: "card.update",
            id: crypto.randomUUID(),
            entityId: card.id,
            baseRevision: card.contentRevision,
            payload: {
              sideA: choice.kind === "update_examples" ? card.sideA : sideA,
              sideB: choice.kind === "update_examples" ? card.sideB : sideB,
              exampleA,
              exampleB,
            },
          },
          expected: card,
        });
      }
      const plan = {
        id: crypto.randomUUID(),
        deckId: id,
        steps,
        skippedRows: rows.length - accepted,
      };
      await repository.startImport(plan, target, target ? existing : []);
      const stored = await repository.readImport();
      if (stored) {
        setActive(stored);
        await run(stored);
      }
    });
  }

  return (
    <div
      className={styles.body}
      data-layout={preview && !active && !done ? "preview" : "split"}
    >
      <Link href="/decks">Wróć do zestawów</Link>
      <ol className={styles.steps} aria-label="Etapy importu">
        {["Wybór pliku", "Podgląd", "Wynik"].map((step, i) => (
          <li
            key={step}
            aria-current={
              i === (active || done ? 2 : preview ? 1 : 0) ? "step" : undefined
            }
          >
            {step}
          </li>
        ))}
      </ol>
      <div className={styles.intro}>
        <h1>
          {done
            ? done.next === done.total
              ? "Import zakończony"
              : "Import zakończony częściowo"
            : active
              ? busy
                ? operation === "finish"
                  ? "Kończenie importu"
                  : operation === "resume"
                    ? "Wznowiono import"
                    : "Trwa import"
                : "Import wstrzymany"
              : preview
                ? "Podgląd importu"
                : "Importuj CSV"}
        </h1>
        {!preview && !active && !done && (
          <p>
            Dodaj fiszki z pliku. Przed zapisem sprawdzisz treść i
            rozstrzygniesz różnice.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      {done && (
        <section className={styles.receipt}>
          <h2>{done.deckName ?? "Podsumowanie importu"}</h2>
          <ul className={styles.counts}>
            <li>Dodane fiszki: {done.added}</li>
            <li>Zaktualizowane fiszki: {done.updated}</li>
            {done.skippedRows !== undefined && (
              <li>Pominięte wiersze: {done.skippedRows}</li>
            )}
            {done.remaining > 0 && (
              <li>Wiersze pozostałe bez zapisu: {done.remaining}</li>
            )}
          </ul>
          <p role="status">
            {done.next === done.total
              ? "Import zapisany na tym urządzeniu."
              : "Import częściowy zapisany na tym urządzeniu."}
          </p>
          <div className="action-row">
            <ActionLink
              href={
                workspace?.decks.some(
                  (d) => d.id === done.deckId && !d.deletedAt,
                )
                  ? `/decks?deck=${done.deckId}`
                  : "/decks"
              }
              className="primary"
            >
              {workspace?.decks.some(
                (d) => d.id === done.deckId && !d.deletedAt,
              )
                ? "Otwórz zestaw"
                : "Moje zestawy"}
            </ActionLink>
            <button
              className="text-action"
              onClick={() => {
                setDone(undefined);
                setNewName("");
                setPreview(false);
              }}
            >
              Importuj kolejny plik
            </button>
          </div>
        </section>
      )}
      {active ? (
        <div className={styles.receipt}>
          <progress
            max={active.total || 1}
            value={active.next}
            aria-label="Zapisane kroki"
          />
          <p role="status">
            Zapisane kroki: {active.next} z {active.total}
          </p>
          {operation === "start" || operation === "resume" ? (
            <LoadingButton
              className="auth-secondary"
              loading={pausing}
              loadingLabel="Wstrzymywanie…"
              onClick={() => {
                pauseRequested.current = true;
                setPausing(true);
              }}
            >
              Wstrzymaj import
            </LoadingButton>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                void guarded("resume", () => run(active));
              }}
            >
              Wznów import
            </button>
          )}
          <ConfirmAction
            label="Zakończ import"
            loading={operation === "finish"}
            loadingLabel="Kończenie importu…"
            title="Zakończyć import?"
            description="Zapisane fiszki zostaną w zestawie. Pozostałe kroki zostaną pominięte."
            disabled={busy}
            onConfirm={() => {
              void guarded("finish", async () => {
                setDone(await repository.finishImport(active.id));
                setActive(null);
                setFile(undefined);
                setWorkspace(await repository.readWorkspace());
                void sync.run();
              });
            }}
          />
        </div>
      ) : (
        !done && (
          <form
            className={`auth-form ${styles.body} ${preview ? "" : styles.choose}`}
            ref={reviewForm}
            onSubmit={submit}
          >
            <fieldset
              hidden={preview}
              disabled={busy}
              className={styles.source}
            >
              <legend>Miejsce importu</legend>
              <div className={styles.targets}>
                <label>
                  <input
                    type="radio"
                    name="destination"
                    checked={!!target}
                    disabled={!availableDecks.length}
                    onChange={() => changeTarget(availableDecks[0].id)}
                  />
                  Istniejący zestaw
                </label>
                <label>
                  <input
                    type="radio"
                    name="destination"
                    checked={!target}
                    onChange={() => changeTarget("")}
                  />
                  Nowy zestaw
                </label>
              </div>
              {target && (
                <label>
                  Zestaw docelowy
                  <select
                    value={target?.id ?? ""}
                    onChange={({ target }) => changeTarget(target.value)}
                  >
                    {workspace?.decks
                      .filter((item) => !item.deletedAt)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {!target && (
                <label>
                  Nazwa zestawu
                  <input
                    name="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={MAX_DECK_NAME_LENGTH}
                    required
                  />
                </label>
              )}
              <label>
                Plik CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={({ target }) => void readFile(target.files?.[0])}
                />
              </label>
              <p>
                CSV UTF-8 do 1 MiB. Wymagane są obie strony fiszki. Przykłady są
                opcjonalne.{" "}
                <a href="/examples/fiszki.csv" download>
                  Pobierz wzór CSV
                </a>
              </p>
            </fieldset>
            {!preview && (
              <LoadingButton
                className="primary"
                type="button"
                loading={readingFile}
                loadingLabel="Odczytywanie pliku…"
                disabled={!file || !workspace}
                onClick={(event) => {
                  if (event.currentTarget.form?.reportValidity())
                    setPreview(true);
                }}
              >
                Pokaż podgląd
              </LoadingButton>
            )}
            {file && preview && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    disabled={busy}
                    onChange={({ target }) => setSkipDuplicates(target.checked)}
                  />{" "}
                  Pomiń duplikaty
                </label>
                <p className={styles.totals}>
                  Separator: {file.delimiter === "," ? "przecinek" : "średnik"}.
                  Do zapisu: {accepted} z {rows.length}.
                </p>
                <p className={styles.filename}>
                  {filename} · {target?.name ?? newName}
                </p>
                <button
                  className="text-action"
                  type="button"
                  disabled={busy}
                  onClick={() => setPreview(false)}
                >
                  Zmień plik lub zestaw
                </button>
                <ol className={styles.rows} aria-label="Wiersze importu">
                  {reviewed
                    .slice(page * pageSize, (page + 1) * pageSize)
                    .map(({ row, choice, issue }) => {
                      const targets = matching(existing, row, choice.kind);
                      const needsTarget =
                        choice.kind === "update_examples" ||
                        choice.kind === "replace_content";
                      const firstMatch = row.matches[0];
                      const fileMatch =
                        !choice.target && firstMatch?.source === "file"
                          ? firstMatch
                          : undefined;
                      const compareId =
                        choice.target ??
                        (firstMatch?.source === "deck"
                          ? firstMatch.id
                          : undefined);
                      const comparison = fileMatch
                        ? rows.find((r) => r.row === fileMatch.row)?.content
                        : compareId
                          ? existing.find((c) => c.id === compareId)
                          : undefined;
                      return (
                        <li key={row.row} className={styles.row}>
                          <details
                            className={styles.record}
                            data-row={row.row}
                            data-review={
                              !!issue || row.classification === "invalid"
                            }
                          >
                            <summary>
                              <span>
                                Wiersz {row.row} · {labels[row.classification]}
                              </span>
                              <b>
                                {row.content.sideA} / {row.content.sideB}
                              </b>
                              <small>
                                {
                                  {
                                    skip: "Pomiń",
                                    create: "Dodaj fiszkę",
                                    update_examples: "Zaktualizuj przykłady",
                                    replace_content: "Zastąp treść",
                                    "": "Wybierz działanie",
                                  }[choice.kind]
                                }
                              </small>
                            </summary>
                            <div className={styles.compare}>
                              <ContentColumn
                                title="W pliku"
                                content={row.content}
                                compareWith={comparison}
                              />
                              {comparison && (
                                <ContentColumn
                                  title={
                                    fileMatch
                                      ? `Wiersz ${fileMatch.row} w tym pliku`
                                      : "W zestawie"
                                  }
                                  content={comparison}
                                  compareWith={row.content}
                                />
                              )}
                            </div>
                            {issue && <p>{issue}</p>}
                            {row.errors.join(" ")}
                            {row.classification === "invalid" && (
                              <p>
                                Błędny wiersz zostanie pominięty podczas zapisu.
                              </p>
                            )}
                            {row.matchesTruncated && (
                              <span>Dopasowania: {row.matchCount}</span>
                            )}
                            {row.classification !== "invalid" && (
                              <label>
                                Akcja wiersza {row.row}
                                <select
                                  aria-label={`Akcja wiersza ${row.row}`}
                                  value={choice.kind}
                                  disabled={busy}
                                  onChange={({ target }) =>
                                    setDecisions((old) => ({
                                      ...old,
                                      [row.row]: {
                                        kind: target.value as Decision["kind"],
                                      },
                                    }))
                                  }
                                >
                                  <option value="" disabled>
                                    Wybierz działanie
                                  </option>
                                  <option value="skip">Pomiń</option>
                                  <option value="create">Dodaj fiszkę</option>
                                  {matching(existing, row, "update_examples")
                                    .length > 0 && (
                                    <option value="update_examples">
                                      Zmień przykłady
                                    </option>
                                  )}
                                  {matching(existing, row, "replace_content")
                                    .length > 0 && (
                                    <option value="replace_content">
                                      Zastąp treść
                                    </option>
                                  )}
                                </select>
                              </label>
                            )}
                            {needsTarget && (
                              <label>
                                Fiszka do aktualizacji
                                <select
                                  data-target
                                  value={choice.target ?? ""}
                                  disabled={busy}
                                  onChange={({ target }) =>
                                    setDecisions((old) => ({
                                      ...old,
                                      [row.row]: {
                                        ...choice,
                                        target: target.value,
                                      },
                                    }))
                                  }
                                >
                                  <option value="" disabled>
                                    Wybierz fiszkę
                                  </option>
                                  {targets.map((card) => (
                                    <option key={card.id} value={card.id}>
                                      {card.sideA} → {card.sideB} ·{" "}
                                      {card.id.slice(-6)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </details>
                        </li>
                      );
                    })}
                </ol>
                {rows.length > pageSize && (
                  <div className={styles.pages}>
                    <span>
                      Strona {page + 1} z {Math.ceil(rows.length / pageSize)}
                    </span>
                    <button
                      className="auth-secondary"
                      type="button"
                      disabled={busy || page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Poprzednia
                    </button>
                    <button
                      className="auth-secondary"
                      type="button"
                      disabled={busy || (page + 1) * pageSize >= rows.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Następna
                    </button>
                  </div>
                )}
                <div className={styles.reviewActions}>
                  <p role="status">
                    Wiersze wymagające decyzji: {unresolved.length}
                  </p>
                  {unresolved.length > 0 && (
                    <button
                      type="button"
                      className="text-action"
                      disabled={busy}
                      onClick={() => {
                        const first = unresolved[0];
                        setPage(Math.floor(rows.indexOf(first) / pageSize));
                        setFocusRow(first.row);
                      }}
                    >
                      Przejdź do wiersza {unresolved[0].row}
                    </button>
                  )}
                  <LoadingButton
                    className="primary"
                    loading={operation === "start"}
                    loadingLabel="Rozpoczynanie importu…"
                    disabled={!workspace || unresolved.length > 0 || !accepted}
                  >
                    Zatwierdź import
                  </LoadingButton>
                </div>
              </>
            )}
          </form>
        )
      )}
    </div>
  );
}
