"use client";

import styles from "./study.module.css";
import { ValidatedField } from "@/components/validated-field";
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
  const [limit, setLimit] = useState<string>();
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
    <form
      className={styles.preferences + " auth-form"}
      onSubmit={(event) => void submit(event)}
    >
      <ValidatedField
        label="Dzienny limit nowych fiszek"
        hint="Podaj liczbę całkowitą od 0 do 10000."
      >
        <input
          name="newLimit"
          type="number"
          min={0}
          max={10000}
          step={1}
          required
          defaultValue={settings?.newLimit ?? DEFAULT_NEW_LIMIT}
          onChange={(e) => setLimit(e.target.value)}
        />
      </ValidatedField>
      <fieldset>
        <legend>Liczniki w treningu</legend>
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
      </fieldset>
      {(limit ?? String(settings?.newLimit ?? DEFAULT_NEW_LIMIT)) === "0" && (
        <p>
          Nowe fiszki są wyłączone. Zaplanowane powtórki pozostają dostępne.
        </p>
      )}
      <div className="section-rule">
        <p>Strefa nauki: {STUDY_TIMEZONE}</p>
        <small>Nowy dzień zaczyna się o północy czasu warszawskiego.</small>
      </div>
      <button className="primary" disabled={saving}>
        Zapisz ustawienia
      </button>
      {result === "saved" && <p role="status">Ustawienia zapisane.</p>}
      {result === "failed" && (
        <p role="alert">Sprawdź limit, potem spróbuj zapisać ponownie.</p>
      )}
    </form>
  );
}
