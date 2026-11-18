"use client";

import { useEffect, useRef, useState } from "react";
import { createLocalRepository } from "@/storage/local-repository";
import { createSyncController } from "@/sync/controller";

export function AccountPanel({ accountId }: { accountId: string }) {
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const signingOut = useRef(false);

  useEffect(() => setReady(true), []);

  async function logout(mode: "check" | "discard" | "sync" = "check") {
    if (signingOut.current) return;
    signingOut.current = true;
    setBusy(true);
    setError(false);
    const repository = createLocalRepository({
      userId: accountId,
      now: () => new Date(),
      introduction: () => {
        throw new Error("Wylogowanie nie wprowadza fiszek");
      },
    });
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
            Synchronizuj i wyloguj się
          </button>
          <button
            className="auth-secondary"
            disabled={busy}
            onClick={() => void logout("discard")}
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
