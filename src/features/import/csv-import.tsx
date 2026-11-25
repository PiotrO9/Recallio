"use client";

import { ConfirmAction } from "@/components/confirm-action";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Card } from "@/contracts";
import {
  classifyRows,
  CsvError,
  MAX_CSV_BYTES,
  normalizeCsvText,
  parseCsv,
  type Content,
  type ImportAction,
  type ImportRow,
} from "@/domain/import/csv";
import {
  createLocalRepository,
  type ImportStep,
  type SnapshotData,
  type StoredImport,
} from "@/storage/local-repository";
import { createSyncController } from "@/sync/controller";
import styles from "./csv-import.module.css";

type Decision = { kind: ImportAction["kind"] | ""; target?: string };
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<StoredImport>();
  const [newName, setNewName] = useState("");
  const [preview, setPreview] = useState(false),
    [resuming, setResuming] = useState(false),
    [filename, setFilename] = useState("");
  const running = useRef(false),
    pauseRequested = useRef(false),
    fileVersion = useRef(0);
  const repository = useMemo(
    () =>
      createLocalRepository({
        userId,
        now: () => new Date(),
        introduction() {
          throw new Error("Import nie wprowadza fiszek do nauki");
        },
      }),
    [userId],
  );
  const sync = useMemo(
    () =>
      createSyncController({
        userId,
        repository,
        now: Date.now,
        random: Math.random,
        id: () => crypto.randomUUID(),
        fetch: (input, init) => fetch(input, init),
        online: () => navigator.onLine,
      }),
    [userId, repository],
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

  function decision(row: ImportRow): Decision {
    if (row.classification === "invalid") return { kind: "skip" };
    if (row.automaticallySkipped && decisions[row.row]?.kind !== "create")
      return { kind: "skip" };
    return (
      decisions[row.row] ?? {
        kind: row.classification === "valid" ? "create" : "",
      }
    );
  }
  const unresolved = rows.some((row) => {
    const choice = decision(row);
    return (
      !choice.kind ||
      (choice.kind !== "skip" && choice.kind !== "create" && !choice.target)
    );
  });
  const accepted = rows.filter(
    (row) => decision(row).kind && decision(row).kind !== "skip",
  ).length;

  function matching(row: ImportRow, kind: Decision["kind"]): Card[] {
    return existing.filter(
      (card) =>
        normalizeCsvText(card.sideA) === normalizeCsvText(row.content.sideA) &&
        (kind !== "update_examples" ||
          normalizeCsvText(card.sideB) === normalizeCsvText(row.content.sideB)),
    );
  }

  async function readFile(input?: File) {
    const version = ++fileVersion.current;
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
    await repository.forgetImport(plan.id);
    setDone(current);
    setActive(null);
    setFile(undefined);
    setWorkspace(await repository.readWorkspace());
    void sync.run();
  }

  async function guarded(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
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
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || unresolved || !accepted) return;
    const form = new FormData(event.currentTarget);
    void guarded(async () => {
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
      const updated = new Set<string>();
      for (const row of rows) {
        const choice = decision(row);
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
        const card = matching(row, choice.kind).find(
          (item) => item.id === choice.target,
        );
        if (!card || updated.has(card.id))
          throw new Error("Wybierz jedno uaktualnienie dla każdej fiszki");
        updated.add(card.id);
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
      const plan = { id: crypto.randomUUID(), deckId: id, steps };
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
                ? resuming
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
          <p>
            Zapisano {done.next} z {done.total} kroków.
          </p>
          <p role="status">
            {done.next === done.total
              ? "Import zapisany na tym urządzeniu."
              : "Zapisane kroki pozostają na tym urządzeniu."}
          </p>
          <div className="action-row">
            <Link
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
            </Link>
            <button
              className="text-action"
              onClick={() => {
                setDone(undefined);
                setNewName("");
                setPreview(false);
                setResuming(false);
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
          {busy ? (
            <button
              className="auth-secondary"
              onClick={() => {
                pauseRequested.current = true;
              }}
            >
              Wstrzymaj import
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                setResuming(true);
                void guarded(() => run(active));
              }}
            >
              Wznów import
            </button>
          )}
          <ConfirmAction
            label="Zakończ import"
            title="Zakończyć import?"
            description="Zapisane fiszki zostaną w zestawie. Pozostałe kroki zostaną pominięte."
            disabled={busy}
            onConfirm={() => {
              void guarded(async () => {
                await repository.forgetImport(active.id);
                setDone(active);
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
            onSubmit={submit}
          >
            <fieldset hidden={preview} className={styles.source}>
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
                    maxLength={120}
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
              <button
                className="primary"
                type="button"
                disabled={!file || !workspace}
                onClick={(event) => {
                  if (event.currentTarget.form?.reportValidity())
                    setPreview(true);
                }}
              >
                Pokaż podgląd
              </button>
            )}
            {file && preview && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
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
                  onClick={() => setPreview(false)}
                >
                  Zmień plik lub zestaw
                </button>
                <ol className={styles.rows} aria-label="Wiersze importu">
                  {rows
                    .slice(page * pageSize, (page + 1) * pageSize)
                    .map((row) => {
                      const choice = decision(row);
                      const targets = matching(row, choice.kind);
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
                            data-review={
                              !choice.kind || row.classification === "invalid"
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
                                  {matching(row, "update_examples").length >
                                    0 && (
                                    <option value="update_examples">
                                      Zmień przykłady
                                    </option>
                                  )}
                                  {matching(row, "replace_content").length >
                                    0 && (
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
                                  value={choice.target ?? ""}
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
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Poprzednia
                    </button>
                    <button
                      className="auth-secondary"
                      type="button"
                      disabled={(page + 1) * pageSize >= rows.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Następna
                    </button>
                  </div>
                )}
                <button
                  className="primary"
                  disabled={!workspace || unresolved || !accepted || busy}
                >
                  Zatwierdź import
                </button>
              </>
            )}
          </form>
        )
      )}
    </div>
  );
}
