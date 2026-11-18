"use client";

import { useState, type FormEvent } from "react";
import { settingsSchema, type Settings } from "@/contracts";
import { getStudyDay, studyTimezoneAt } from "@/domain/learning/study-time";

export function StudySettings({
  settings,
  now,
  save,
}: {
  settings: Settings | null;
  now: string;
  save: (next: Omit<Settings, "timezoneChanges">) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const [requestedTimezone, setRequestedTimezone] = useState<string>();
  const current = settings && studyTimezoneAt(now, settings);
  const selectedTimezone = current?.pending?.timezone ?? current?.timezone;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setResult(null);
    try {
      const next = settingsSchema.parse({
        timezone: String(fields.get("timezone") ?? "").trim(),
        newLimit: Number(fields.get("newLimit")),
        showDue: fields.has("showDue"),
        showSession: fields.has("showSession"),
        revision: settings?.revision ?? "0",
      });
      getStudyDay(now, next.timezone);
      await save(next);
      setRequestedTimezone(next.timezone);
      setResult("saved");
    } catch {
      setResult("failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details open={!settings}>
      <summary>Ustawienia nauki</summary>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {current && <p>Obecna strefa nauki: {current.timezone}</p>}
        {current?.pending && (
          <p role="status">
            Strefa {current.pending.timezone} zacznie obowiązywać{" "}
            <time dateTime={current.pending.effectiveAt}>
              {new Intl.DateTimeFormat("pl-PL", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: current.timezone,
              }).format(Date.parse(current.pending.effectiveAt))}
            </time>{" "}
            według obecnej strefy.
          </p>
        )}
        <label>
          Strefa nauki
          <input
            key={selectedTimezone}
            name="timezone"
            defaultValue={selectedTimezone}
            placeholder="Europe/Warsaw"
            required
            maxLength={100}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label>
          Dzienny limit nowych fiszek
          <input
            name="newLimit"
            type="number"
            min={0}
            max={10000}
            step={1}
            required
            defaultValue={settings?.newLimit ?? 20}
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
        {result === "saved" && (
          <p role="status">
            {requestedTimezone === selectedTimezone
              ? "Ustawienia zapisane."
              : "Zmiana strefy oczekuje na synchronizację."}
          </p>
        )}
        {result === "failed" && (
          <p role="alert">
            Sprawdź strefę i limit, potem spróbuj zapisać ponownie.
          </p>
        )}
      </form>
    </details>
  );
}
