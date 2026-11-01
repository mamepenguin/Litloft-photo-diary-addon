"use client";

import { Pen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDayLabel, monthGrid, weekdayLabels } from "./lib/dates";

export type DayInfo = { count: number; hasNote: boolean };

type Props = {
  month: string;
  /** A date absent from it has neither photos nor a note. */
  days: ReadonlyMap<string, DayInfo>;
  openDate: string | null;
  loading: boolean;
  onPick: (date: string) => void;
};

const CELL =
  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const SURFACE = {
  photos: "bg-sand text-text-primary hover:bg-sand-hover",
  note: "bg-bg-elevated text-text-primary hover:bg-sand",
  quiet: "text-text-muted hover:bg-bg-elevated",
};

export function MonthGrid({ month, days, openDate, loading, onPick }: Props) {
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
        if (loading) {
          return (
            <div key={date} className="flex min-h-12 items-start justify-center pt-2 text-sm text-text-muted">
              {day}
            </div>
          );
        }
        const { count, hasNote } = days.get(date) ?? { count: 0, hasNote: false };
        const open = date === openDate;
        const text = formatDayLabel(date, locale);
        const label =
          hasNote && count > 0
            ? t("calendar.dayLabelNoted", { date: text, count })
            : hasNote
              ? t("calendar.dayLabelNote", { date: text })
              : count > 0
                ? t("calendar.dayLabel", { date: text, count })
                : text;
        return (
          <button
            key={date}
            type="button"
            aria-label={label}
            aria-pressed={open}
            onClick={() => onPick(date)}
            className={`${CELL} ${count > 0 ? SURFACE.photos : hasNote ? SURFACE.note : SURFACE.quiet} ${
              open ? "border-accent" : "border-transparent"
            }`}
          >
            {hasNote && (
              <Pen size={12} aria-hidden="true" className="absolute right-1.5 top-1.5 text-text-muted" />
            )}
            <span className="text-sm font-semibold">{day}</span>
            {count > 0 && <span className="text-xs text-text-muted">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
