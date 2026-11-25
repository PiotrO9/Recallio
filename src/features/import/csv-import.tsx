"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Card } from "@/contracts";
import {
  classifyRows,
  CsvError,
  MAX_CSV_BYTES,
  normalizeCsvText,
  parseCsv,
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
  const [done, setDone] = useState<string>();
  const running = useRef(false);
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
    setDone(undefined);
    setError("");
    setFile(undefined);
    setDecisions({});
    setPage(0);
    if (!input) return;
    try {
      if (input.size > MAX_CSV_BYTES) throw new Error("Plik przekracza 1 MiB.");
      setFile(
        parseCsv(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await input.arrayBuffer(),
          ),
        ),
      );
    } catch (problem) {
      setError(
        problem instanceof CsvError
          ? `Wiersz ${problem.row}. ${problem.message}`
          : "Nie udało się odczytać CSV. Wybierz plik UTF-8 do 1 MiB.",
      );
    }
  }

  async function run(plan: StoredImport) {
    let current: StoredImport | null = plan;
    while (current && current.id === plan.id && current.next < current.total) {
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
    setDone(plan.deckId);
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
    if (unresolved || !accepted) return;
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
    <div className={styles.body}>
      <Link href="/decks">Wróć do zestawów</Link>
      <ol className={styles.steps} aria-label="Etapy importu">
        {["Wybór pliku", "Podgląd", "Wynik"].map((step, i) => (
          <li
            key={step}
            aria-current={
              i === (active || done ? 2 : file ? 1 : 0) ? "step" : undefined
            }
          >
            {step}
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
      {done && (
        <section className="section-rule">
          <h2>Import zakończony</h2>
          <p role="status">Import zapisany na tym urządzeniu.</p>
          <div className="action-row">
            <Link href={`/decks?deck=${done}`} className="primary">
              Otwórz zestaw
            </Link>
            <button className="text-action" onClick={() => setDone(undefined)}>
              Importuj kolejny plik
            </button>
          </div>
        </section>
      )}
      {active ? (
        <div className={styles.body}>
          <h2>{busy ? "Trwa import" : "Import wstrzymany"}</h2>
          <progress
            max={active.total || 1}
            value={active.next}
            aria-label="Zapisane kroki"
          />
          <p role="status">
            Zapisane kroki: {active.next} z {active.total}
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void guarded(() => run(active))}
          >
            Wznów import
          </button>
          <button
            className="auth-secondary"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  "Zakończyć import? Zapisane fiszki pozostaną w zestawie.",
                )
              )
                return;
              void guarded(async () => {
                await repository.forgetImport(active.id);
                setActive(null);
                setFile(undefined);
                setWorkspace(await repository.readWorkspace());
                void sync.run();
              });
            }}
          >
            Zakończ import
          </button>
        </div>
      ) : (
        !done && (
          <form className={`auth-form ${styles.body}`} onSubmit={submit}>
            <label>
              Zestaw docelowy
              <select
                value={target?.id ?? ""}
                onChange={({ target }) => {
                  setDeckId(target.value);
                  setDecisions({});
                  setPage(0);
                }}
              >
                <option value="">Nowy zestaw</option>
                {workspace?.decks
                  .filter((item) => !item.deletedAt)
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            {!target && (
              <label>
                Nazwa zestawu
                <input name="name" maxLength={120} required />
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
            {file && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={({ target }) => setSkipDuplicates(target.checked)}
                  />{" "}
                  Pomiń duplikaty
                </label>
                <p>
                  Separator: {file.delimiter === "," ? "przecinek" : "średnik"}.
                  Do zapisu: {accepted} z {rows.length}.
                </p>
                <h2>Podgląd importu</h2>
                <ol className={styles.rows}>
                  {rows
                    .slice(page * pageSize, (page + 1) * pageSize)
                    .map((row) => {
                      const choice = decision(row);
                      const targets = matching(row, choice.kind);
                      const needsTarget =
                        choice.kind === "update_examples" ||
                        choice.kind === "replace_content";
                      return (
                        <li key={row.row} className={styles.row}>
                          <strong>
                            Wiersz {row.row} · {labels[row.classification]}
                          </strong>
                          <div className={styles.compare}>
                            <div>
                              <b>W pliku</b>
                              <p>
                                {row.content.sideA} / {row.content.sideB}
                              </p>
                              {row.content.exampleA} {row.content.exampleB}
                            </div>
                            {targets.length > 0 && (
                              <div>
                                <b>W zestawie</b>
                                {(choice.target
                                  ? targets.filter(
                                      (c) => c.id === choice.target,
                                    )
                                  : targets.slice(0, 1)
                                ).map((c) => (
                                  <div key={c.id}>
                                    <p>
                                      {c.sideA} / {c.sideB}
                                    </p>
                                    {c.exampleA} {c.exampleB}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {row.errors.join(" ")}
                          {row.matchesTruncated && (
                            <span>Dopasowania: {row.matchCount}</span>
                          )}
                          {row.classification !== "invalid" && (
                            <label>
                              Akcja wiersza {row.row}
                              <select
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
                        </li>
                      );
                    })}
                </ol>
                {rows.length > pageSize && (
                  <div className={styles.pages}>
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
