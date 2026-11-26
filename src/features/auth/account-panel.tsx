"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingButton } from "@/components/loading-button";
import { clearAccountDrafts } from "@/features/decks/card-draft";
import { openLocalAccount } from "@/features/local-account";
export function AccountPanel({ accountId }: { accountId: string }) {
  const [pending, setPending] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [operation, setOperation] = useState<
    "check" | "discard" | "sync" | null
  >(null);
  const busy = operation !== null;
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const signingOut = useRef(false);

  const [unsent, setUnsent] = useState<number>();
  useEffect(() => {
    let active = true;
    const { repository: repo } = openLocalAccount(accountId);
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
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted && signingOut.current) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restore);
      repo.close();
    };
  }, [accountId]);

  async function logout(mode: "check" | "discard" | "sync" = "check") {
    if (signingOut.current) return;
    signingOut.current = true;
    setOperation(mode);
    setError(false);
    const { repository, sync } = openLocalAccount(accountId);
    let navigating = false;
    try {
      if (mode === "sync") {
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
      clearAccountDrafts(accountId);
      window.location.assign(response.url);
      navigating = true;
    } catch {
      setError(true);
    } finally {
      repository.close();
      if (!navigating) {
        signingOut.current = false;
        setOperation(null);
      }
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
        <LoadingButton
          className="primary"
          loading={operation === "check"}
          loadingLabel="Wylogowywanie…"
          disabled={!ready || busy}
          onClick={() => void logout()}
        >
          Wyloguj się
        </LoadingButton>
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
            <LoadingButton
              className="danger-action"
              loading={operation === "discard"}
              loadingLabel="Wylogowywanie…"
              disabled={busy}
              onClick={() => void logout("discard")}
            >
              Odrzuć zmiany i wyloguj się
            </LoadingButton>
          </div>
        </section>
      ) : (
        <>
          <p role="status">
            Niewysłane zmiany: {pending}. Odrzucenie usunie je z tego
            urządzenia.
          </p>
          <LoadingButton
            className="primary"
            loading={operation === "sync"}
            loadingLabel="Synchronizowanie i wylogowywanie…"
            disabled={busy}
            onClick={() => void logout("sync")}
          >
            {error
              ? "Ponów synchronizację i wyloguj się"
              : "Synchronizuj i wyloguj się"}
          </LoadingButton>
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
