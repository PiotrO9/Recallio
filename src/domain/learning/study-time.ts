import type { Settings } from "../../contracts";

type StudyTimezone = Pick<Settings, "timezone" | "timezoneChanges">;
type Change = NonNullable<Settings["timezoneChanges"]>[number];
const dayInMilliseconds = 86_400_000;

function studyDateFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDay(time: number, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(time);
  const part = (type: "year" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getStudyDay(now: string, timezone: string): string {
  return formatDay(Date.parse(now), studyDateFormatter(timezone));
}

function timezoneAt(time: number, settings: StudyTimezone) {
  let active: Change | undefined;
  for (const change of settings.timezoneChanges ?? []) {
    if (Date.parse(change.effectiveAt) > time)
      return {
        timezone: active?.timezone ?? settings.timezone,
        active,
        pending: change,
      };
    active = change;
  }
  return {
    timezone: active?.timezone ?? settings.timezone,
    active,
    pending: undefined,
  };
}

export function studyTimezoneAt(now: string, settings: StudyTimezone) {
  return timezoneAt(Date.parse(now), settings);
}

export function getStudyPeriod(now: string, settings: StudyTimezone) {
  const time = Date.parse(now);
  const { timezone, active, pending } = timezoneAt(time, settings);
  const formatter = studyDateFormatter(timezone);
  const day = formatDay(time, formatter);
  function findBoundary(
    before: number,
    after: number,
    isAfter: (day: string) => boolean,
  ) {
    while (after - before > 1) {
      const middle = before + Math.floor((after - before) / 2);
      if (isAfter(formatDay(middle, formatter))) after = middle;
      else before = middle;
    }
    return after;
  }

  // Search in UTC for the local date boundary, including short, long or skipped days.
  const start = findBoundary(
    time - 2 * dayInMilliseconds,
    time,
    (date) => date >= day,
  );
  const end = findBoundary(
    time,
    time + 2 * dayInMilliseconds,
    (date) => date > day,
  );
  return {
    start: active ? Math.max(start, Date.parse(active.effectiveAt)) : start,
    end: pending ? Math.min(end, Date.parse(pending.effectiveAt)) : end,
  };
}

export function scheduleStudyTimezone(
  current: StudyTimezone,
  requested: string,
  now: string,
): Settings["timezoneChanges"] {
  const { timezone, pending } = studyTimezoneAt(now, current);
  if ((pending?.timezone ?? timezone) === requested)
    return current.timezoneChanges;
  const history =
    current.timezoneChanges?.slice(0, pending ? -1 : undefined) ?? [];
  if (requested !== timezone) {
    history.push({
      timezone: requested,
      effectiveAt:
        pending?.effectiveAt ??
        new Date(getStudyPeriod(now, current).end).toISOString(),
    });
  }
  return history.length ? history : undefined;
}
