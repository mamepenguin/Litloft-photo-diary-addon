"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDayLabel, monthGrid, weekdayLabels } from "./lib/dates";

type Props = {
  month: string;
  /** Photo count by date; a date absent from it has no photos. */
  counts: ReadonlyMap<string, number>;
  openDate: string | null;
  loading: boolean;
  onPick: (date: string) => void;
};

export function MonthGrid({ month, counts, openDate, loading, onPick }: Props) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const cells = monthGrid(month);

  return (
    <div aria-busy={loading} className="grid grid-cols-7 gap-1.5">
      {weekdayLabels(locale).map((label) => (
        <div key={label} className="pb-1 text-center text-xs text-text-muted">
          {label}
        </div>
      ))}
      {cells.map((day, index) => {
        if (day === null) return <div key={`pad-${index}`} />;
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const count = counts.get(date);
        if (count === undefined) {
          return (
            <div key={date} className="flex min-h-12 items-start justify-center pt-2 text-sm text-text-muted">
              {day}
            </div>
          );
        }
        const open = date === openDate;
        return (
          <button
            key={date}
            type="button"
            aria-label={t("calendar.dayLabel", { date: formatDayLabel(date, locale), count })}
            aria-pressed={open}
            onClick={() => onPick(date)}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-sand px-1 py-1.5 text-text-primary transition-colors hover:bg-sand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
              open ? "border-accent" : "border-transparent"
            }`}
          >
            <span className="text-sm font-semibold">{day}</span>
            <span className="text-xs text-text-muted">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
