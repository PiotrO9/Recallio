"use client";

import { useState, type FormEvent } from "react";
import { settingsSchema, type Settings } from "@/contracts";
import { DEFAULT_NEW_LIMIT } from "@/domain/learning/queue";
import { STUDY_TIMEZONE } from "@/domain/learning/study-time";

export function StudySettings({
  settings,
  save,
}: {
  settings: Settings | null;
  save: (next: Settings) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setResult(null);
    try {
      const next = settingsSchema.parse({
        timezone: STUDY_TIMEZONE,
        newLimit: Number(fields.get("newLimit")),
        showDue: fields.has("showDue"),
        showSession: fields.has("showSession"),
        revision: settings?.revision ?? "0",
      });
      await save(next);
      setResult("saved");
    } catch {
      setResult("failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details>
      <summary>Ustawienia nauki</summary>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <p>Strefa nauki: {STUDY_TIMEZONE}</p>
        <label>
          Dzienny limit nowych fiszek
          <input
            name="newLimit"
            type="number"
            min={0}
            max={10000}
            step={1}
            required
            defaultValue={settings?.newLimit ?? DEFAULT_NEW_LIMIT}
          />
        </label>
        <label>
          <input
            name="showDue"
            type="checkbox"
            defaultChecked={settings?.showDue}
          />{" "}
          Pokaż powtórki na dziś
        </label>
        <label>
          <input
            name="showSession"
            type="checkbox"
            defaultChecked={settings?.showSession}
          />{" "}
          Pokaż liczbę odpowiedzi w sesji
        </label>
        <button className="primary" disabled={saving}>
          Zapisz ustawienia
        </button>
        {result === "saved" && <p role="status">Ustawienia zapisane.</p>}
        {result === "failed" && (
          <p role="alert">Sprawdź limit, potem spróbuj zapisać ponownie.</p>
        )}
      </form>
    </details>
  );
}
