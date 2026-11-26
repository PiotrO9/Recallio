"use client";

import styles from "./study.module.css";
import { ValidatedField } from "@/components/validated-field";
import { LoadingButton } from "@/components/loading-button";
import { useRef, useState, type FormEvent } from "react";
import { settingsSchema, type Settings } from "@/contracts";
import { DEFAULT_NEW_LIMIT } from "@/domain/learning/queue";
import { STUDY_TIMEZONE } from "@/domain/learning/study-time";

type Preferences = { limit: string; showDue: boolean; showSession: boolean };

export function StudySettings({
  settings,
  save,
}: {
  settings: Settings | null;
  save: (next: Settings) => Promise<void>;
}) {
  const baseline: Preferences = {
    limit: String(settings?.newLimit ?? DEFAULT_NEW_LIMIT),
    showDue: settings?.showDue ?? false,
    showSession: settings?.showSession ?? false,
  };
  const [edits, setEdits] = useState<Partial<Preferences>>({});
  const values = { ...baseline, ...edits };
  const dirty =
    values.limit !== baseline.limit ||
    values.showDue !== baseline.showDue ||
    values.showSession !== baseline.showSession;
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);

  function edit<K extends keyof Preferences>(field: K, value: Preferences[K]) {
    setEdits((previous) => {
      const next = { ...previous };
      if (value === baseline[field]) delete next[field];
      else next[field] = value;
      return next;
    });
    setResult(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const fields = new FormData(event.currentTarget);
    inFlight.current = true;
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
      setEdits({});
      setResult("saved");
    } catch {
      setResult("failed");
    } finally {
      inFlight.current = false;
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
          readOnly={saving}
          type="number"
          min={0}
          max={10000}
          step={1}
          required
          value={values.limit}
          onChange={(e) => edit("limit", e.target.value)}
        />
      </ValidatedField>
      <fieldset disabled={saving}>
        <legend>Liczniki w treningu</legend>
        <label>
          <input
            name="showDue"
            type="checkbox"
            checked={values.showDue}
            onChange={(e) => edit("showDue", e.target.checked)}
          />{" "}
          Pokaż powtórki na dziś
        </label>
        <label>
          <input
            name="showSession"
            type="checkbox"
            checked={values.showSession}
            onChange={(e) => edit("showSession", e.target.checked)}
          />{" "}
          Pokaż liczbę odpowiedzi w sesji
        </label>
      </fieldset>
      {values.limit === "0" && (
        <p>
          Nowe fiszki są wyłączone. Zaplanowane powtórki pozostają dostępne.
        </p>
      )}
      <div className="section-rule">
        <p>Strefa nauki: {STUDY_TIMEZONE}</p>
        <small>Nowy dzień zaczyna się o północy czasu warszawskiego.</small>
      </div>
      <LoadingButton
        className="primary"
        loading={saving}
        loadingLabel="Zapisywanie ustawień…"
      >
        Zapisz ustawienia
      </LoadingButton>
      <p role="status" className={styles.saveStatus}>
        {dirty
          ? "Niezapisane zmiany"
          : result === "saved"
            ? "Ustawienia zapisane."
            : ""}
      </p>
      {result === "failed" && (
        <p role="alert">Nie udało się zapisać ustawień. Spróbuj ponownie.</p>
      )}
    </form>
  );
}
