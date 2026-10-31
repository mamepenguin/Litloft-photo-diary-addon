function parse(value: string): number[] {
  return value.split("-").map(Number);
}

// Date.UTC maps years 0 to 99 onto 1900 to 1999, so the year is set separately.
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function format(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
}

/** Sunday first; `null` pads before day 1 and after the last day to whole weeks. */
export function monthGrid(month: string): (number | null)[] {
  const [year, m] = parse(month);
  const lead = utcDate(year, m, 1).getUTCDay();
  const days = utcDate(year, m + 1, 0).getUTCDate();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** The date only, as the camera's clock showed it; the page adds the count. */
export function formatListDate(date: string, locale: string): string {
  const [year, m, day] = parse(date);
  return format(utcDate(year, m, day), locale, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDayLabel(date: string, locale: string): string {
  const [year, m, day] = parse(date);
  return format(utcDate(year, m, day), locale, { month: "long", day: "numeric" });
}

export function formatMonth(month: string, locale: string): string {
  const [year, m] = parse(month);
  return format(utcDate(year, m, 1), locale, { year: "numeric", month: "long" });
}

/** Seven labels, Sunday first. */
export function weekdayLabels(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(utcDate(2026, 10, 4 + i), locale, { weekday: "short" }),
  );
}
