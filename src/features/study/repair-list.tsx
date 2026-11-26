import { useEffect, useMemo, useState } from "react";
import { repairResponseSchema, type RepairResponse } from "@/contracts";
import type { openLocalAccount } from "../local-account";
import type { SnapshotData } from "@/storage/local-repository";
import { deckHref } from "../decks/use-library-navigation";
import styles from "./study.module.css";

type Props = ReturnType<typeof openLocalAccount> & {
  userId: string;
  workspace: SnapshotData;
  generation: number;
  initialOpen: boolean;
  session?: string;
  offlineShell: boolean;
  offlineDecks: readonly string[];
};
type State = "loading" | "ready" | "stale" | "auth" | "unsupported";
export function RepairList({
  userId,
  repository,
  sync,
  workspace,
  generation,
  initialOpen,
  session,
  offlineShell,
  offlineDecks,
}: Props) {
  const [report, setReport] = useState<RepairResponse | null>(null);
  const [state, setState] = useState<State>("loading");
  const [open, setOpen] = useState(initialOpen);
  const [online, setOnline] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const observe = () => setOnline(navigator.onLine);
    observe();
    window.addEventListener("online", observe);
    window.addEventListener("offline", observe);
    return () => {
      window.removeEventListener("online", observe);
      window.removeEventListener("offline", observe);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    async function load() {
      const cached = await repository.readRepairCandidates();
      if (signal.aborted) return;
      setReport(cached);
      if (!navigator.onLine) {
        setState("stale");
        return;
      }
      const id = crypto.randomUUID();
      await repository.beginRepairRead(id);
      const status = await sync.flush();
      if (signal.aborted) return;
      if (status !== "idle") {
        setState(status === "requires_auth" ? "auth" : "stale");
        return;
      }
      const response = await fetch("/api/v1/study/repair-candidates", {
        signal,
        cache: "no-store",
        headers: { "X-Recallio-Account": userId },
      });
      if (signal.aborted) return;
      if (response.status === 404) {
        setState("unsupported");
        return;
      }
      if (response.status === 401) {
        setState("auth");
        return;
      }
      if (!response.ok) throw new Error("Odczyt historii");
      const next = repairResponseSchema.parse(await response.json());
      if (signal.aborted) return;
      const accepted = await repository.saveRepairCandidates(id, next);
      if (accepted && !signal.aborted) {
        setReport(next);
        setState("ready");
      }
    }
    void load().catch(() => {
      if (!signal.aborted) setState("stale");
    });
    return () => controller.abort();
  }, [repository, sync, userId, online, open, generation, retry]);
  const items = useMemo(() => {
    const decks = new Map(
      workspace.decks
        .filter(
          (d) =>
            !d.deletedAt &&
            (!(offlineShell || !online) || offlineDecks.includes(d.id)),
        )
        .map((d) => [d.id, d.name]),
    );
    const cards = new Map(
      workspace.cards.filter((c) => !c.deletedAt).map((c) => [c.id, c]),
    );
    const epochs = new Map(
      workspace.progress.map((p) => [p.cardId + ":" + p.direction, p.epoch]),
    );
    return (report?.items ?? [])
      .flatMap((item) => {
        const card = cards.get(item.cardId),
          deck = decks.get(item.deckId);
        if (!card || !deck || card.deckId !== item.deckId) return [];
        const directions = item.directions.filter(
          (d) => epochs.get(card.id + ":" + d.direction) === d.epoch,
        );
        if (!directions.length) return [];
        const latest = directions.reduce(
          (last, d) => (d.lastFailedDay > last ? d.lastFailedDay : last),
          "",
        );
        return [{ card, deck, directions, latest }];
      })
      .sort(
        (a, b) =>
          b.latest.localeCompare(a.latest) ||
          a.card.id.localeCompare(b.card.id),
      );
  }, [workspace, report, offlineDecks, offlineShell, online]);

  if (state === "unsupported") return null;
  if (state === "auth")
    return (
      <p>
        <a href="/auth/login?status=session">
          Zaloguj się ponownie, aby odświeżyć listę do poprawy.
        </a>
      </p>
    );
  if (!open && !items.length && state !== "stale") return null;
  return (
    <section className={styles.repairs} aria-label="Fiszki do poprawy">
      {items.length > 0 && !open && (
        <button
          className="text-action"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("repair", "1");
            window.history.replaceState(window.history.state, "", url);
            setOpen(true);
          }}
        >
          Do poprawy ({items.length})
        </button>
      )}
      {open && (
        <>
          <h2>Do poprawy</h2>
          {items.length > 0 && (
            <p>
              Lista wynika z wcześniejszych ocen. Możesz zmienić treść lub
              dopisać przykład do fiszki.
            </p>
          )}
          <ul>
            {items.map(({ card, deck, directions }) => (
              <li key={card.id}>
                <strong>
                  {card.sideA} · {card.sideB}
                </strong>
                <small>{deck}</small>
                {directions.map((d) => (
                  <span key={d.direction}>
                    {d.direction === "a-b" ? "A → B" : "B → A"} · Trudność w{" "}
                    {d.failedDays} różnych dniach
                  </span>
                ))}
                {online && (
                  <a
                    href={
                      deckHref(card.deckId, card.id) +
                      "&from=repair" +
                      (session ? "&session=" + encodeURIComponent(session) : "")
                    }
                  >
                    Edytuj fiszkę
                  </a>
                )}
              </li>
            ))}
          </ul>
          {!items.length && state === "ready" && <p>Brak fiszek do poprawy.</p>}
          {state === "loading" && !report && (
            <p role="status">Wczytywanie listy…</p>
          )}
        </>
      )}
      {state === "stale" && (
        <p role="status">
          {report
            ? "Ostatnia aktualizacja listy: " +
              new Date(report.asOf).toLocaleString("pl-PL", {
                timeZone: "Europe/Warsaw",
              })
            : "Lista do poprawy będzie dostępna po synchronizacji."}{" "}
          {online && (
            <button
              className="text-action"
              onClick={() => setRetry((n) => n + 1)}
            >
              Ponów odczyt listy
            </button>
          )}
        </p>
      )}
    </section>
  );
}
