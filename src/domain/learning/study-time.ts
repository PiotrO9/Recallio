export const STUDY_TIMEZONE = "Europe/Warsaw";
const dayInMilliseconds = 86_400_000;

const formatter = new Intl.DateTimeFormat("en", {
  timeZone: STUDY_TIMEZONE,
  calendar: "iso8601",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDay(time: number): string {
  const parts = formatter.formatToParts(time);
  const part = (type: "year" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getStudyDay(now: string): string {
  return formatDay(Date.parse(now));
}

export function getStudyPeriod(now: string) {
  const time = Date.parse(now);
  const day = formatDay(time);
  function findBoundary(
    before: number,
    after: number,
    isAfter: (day: string) => boolean,
  ) {
    while (after - before > 1) {
      const middle = before + Math.floor((after - before) / 2);
      if (isAfter(formatDay(middle))) after = middle;
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
  return { start, end };
}
