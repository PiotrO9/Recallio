"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { LoadingButton } from "@/components/loading-button";

export function AuthActionForm({
  children,
  label,
  loadingLabel,
}: {
  children: ReactNode;
  label: string;
  loadingLabel: string;
}) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    function reset(event: PageTransitionEvent) {
      if (!event.persisted) return;
      request.current?.abort();
      request.current = null;
      setLoading(false);
    }
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      request.current?.abort();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const form = event.currentTarget;
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        signal: controller.signal,
      });
      if (!response.ok || !response.redirected) throw new Error();
      window.location.assign(response.url);
    } catch {
      if (controller.signal.aborted) return;
      request.current = null;
      setLoading(false);
      setFailed(true);
    }
  }

  return (
    <form
      className="auth-form"
      action="/auth/actions"
      method="post"
      onSubmit={submit}
    >
      {children}
      <LoadingButton
        className="primary"
        type="submit"
        loading={loading}
        loadingLabel={loadingLabel}
      >
        {label}
      </LoadingButton>
      {failed && (
        <p role="alert">Nie udało się wysłać formularza. Spróbuj ponownie.</p>
      )}
    </form>
  );
}
