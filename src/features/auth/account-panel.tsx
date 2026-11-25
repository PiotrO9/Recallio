"use client";

import { useEffect, useRef, useState } from "react";
import { createLocalRepository } from "@/storage/local-repository";
import { createSyncController } from "@/sync/controller";

function accountRepository(accountId: string) {
  return createLocalRepository({
    userId: accountId,
    now: () => new Date(),
    introduction: () => {
      throw new Error("Wylogowanie nie wprowadza fiszek");
    },
  });
}
export function AccountPanel({ accountId }: { accountId: string }) {
  const [pending, setPending] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const signingOut = useRef(false);

  const [unsent, setUnsent] = useState<number>();
  useEffect(() => {
    let active = true;
    const repo = accountRepository(accountId);
    const refresh = () =>
      void repo
        .countUnsent()
        .then((n) => {
          if (active) setUnsent(n);
        })
        .catch(() => {
          if (active) setUnsent(undefined);
        });
    setReady(true);
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      repo.close();
    };
  }, [accountId]);

  async function logout(mode: "check" | "discard" | "sync" = "check") {
    if (signingOut.current) return;
    signingOut.current = true;
    setBusy(true);
    setError(false);
    const repository = accountRepository(accountId);
    try {
      if (mode === "sync") {
        const sync = createSyncController({
          userId: accountId,
          repository,
          fetch: (input, init) => globalThis.fetch(input, init),
          now: Date.now,
          random: Math.random,
          id: () => crypto.randomUUID(),
          online: () => navigator.onLine,
        });
        if ((await sync.run()) !== "idle")
          throw new Error("Synchronizacja nie została zakończona");
      }
      const count = await repository.clearForLogout(mode === "discard");
      if (count) {
        setPending(count);
        return;
      }
      const body = new URLSearchParams({ intent: "logout", accountId });
      const response = await fetch("/auth/actions", { method: "POST", body });
      if (!response.ok) throw new Error("Wylogowanie nie powiodło się");
      window.location.assign(response.url);
    } catch {
      setError(true);
    } finally {
      repository.close();
      signingOut.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="auth-form">
      {pending === null && unsent !== undefined && (
        <p>
          <strong>Synchronizacja</strong>
          <br />
          {unsent
            ? `Niewysłane zmiany na urządzeniu: ${unsent}`
            : "Wszystkie lokalne zmiany wysłane"}
        </p>
      )}
      {error && (
        <p role="alert">
          Nie udało się zakończyć wylogowania. Sprawdź połączenie i spróbuj
          ponownie.
        </p>
      )}
      {pending === null ? (
        <button
          className="primary"
          disabled={!ready || busy}
          onClick={() => void logout()}
        >
          Wyloguj się
        </button>
      ) : confirmDiscard ? (
        <section
          className="confirm-discard"
          aria-label="Potwierdź odrzucenie zmian"
        >
          <h2>Odrzucić niewysłane zmiany?</h2>
          <p>Zmiany zapisane tylko na tym urządzeniu zostaną utracone.</p>
          <div className="action-row">
            <button
              className="auth-secondary"
              autoFocus
              disabled={busy}
              onClick={() => setConfirmDiscard(false)}
            >
              Anuluj
            </button>
            <button
              className="danger-action"
              disabled={busy}
              onClick={() => void logout("discard")}
            >
              Odrzuć zmiany i wyloguj się
            </button>
          </div>
        </section>
      ) : (
        <>
          <p role="status">
            Niewysłane zmiany: {pending}. Odrzucenie usunie je z tego
            urządzenia.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void logout("sync")}
          >
            {error
              ? "Ponów synchronizację i wyloguj się"
              : "Synchronizuj i wyloguj się"}
          </button>
          <button
            className="auth-secondary"
            disabled={busy}
            onClick={() => setConfirmDiscard(true)}
          >
            Odrzuć zmiany i wyloguj się
          </button>
          <button
            className="auth-secondary"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            Anuluj
          </button>
        </>
      )}
    </div>
  );
}
