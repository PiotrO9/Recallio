"use client";

import { useEffect, useRef, useState } from "react";
import { createLocalRepository } from "@/storage/local-repository";

export function AccountPanel({ accountId }: { accountId: string }) {
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const signingOut = useRef(false);

  useEffect(() => setReady(true), []);

  async function logout(discardPending = false) {
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
      const count = await repository.clearForLogout(discardPending);
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
      {error && <p role="alert">Nie udało się wylogować. Spróbuj ponownie.</p>}
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
            onClick={() => void logout(true)}
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
