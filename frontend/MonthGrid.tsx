"use client";

import { useLayoutEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { DayCell, type DayInfo } from "./DayCell";
import { monthGrid, weekdayLabels } from "./lib/dates";
import type { DayPreview } from "./useDayPreview";

export type { DayInfo };

const FADE_MS = 450;
const FADE_STEP_MS = 14;
const NO_DAY: DayInfo = { count: 0, hasNote: false };

type Props = {
  month: string;
  /** A date absent from it has neither photos nor a note. */
  days: ReadonlyMap<string, DayInfo>;
  openDate: string | null;
  loading: boolean;
  /** Whether the calendar view is on screen. */
  active: boolean;
  /** The page was opened with no query, so its first month is drawn with the fade. */
  freshStart: boolean;
  preview: DayPreview;
  onPick: (date: string) => void;
};

export function MonthGrid({ month, days, openDate, loading, active, freshStart, preview, onPick }: Props) {
  const locale = useLocale();
  const cells = monthGrid(month);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const fades = useRef(new Map<string, Animation>());
  const lastDrawn = useRef<string | null>(null);

  // The surfaces fade when a month other than the last one drawn on screen
  // appears, and on the first draw of a page opened with no query. A refresh
  // or a re-read of the same month leaves `lastDrawn` as it is.
  useLayoutEffect(() => {
    if (loading || !active || lastDrawn.current === month) return;
    const first = lastDrawn.current === null;
    lastDrawn.current = month;
    if (first && !freshStart) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const start = [...buttons.current.entries()];
    fades.current.clear();
    for (const [date, element] of start) {
      const info = days.get(date);
      if (!info || info.count <= 0 || typeof element.animate !== "function") continue;
      const day = Number(date.slice(8));
      fades.current.set(
        date,
        element.animate([{ backgroundColor: "transparent" }, {}], {
          duration: FADE_MS,
          delay: (day - 1) * FADE_STEP_MS,
          easing: "ease-out",
          fill: "backwards",
        }),
      );
    }
  }, [month, loading, active, freshStart, days]);

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
            <div
              key={date}
              className="flex h-12 items-start justify-center pt-2 text-sm text-text-muted group-data-[wide=true]/diary:h-[76px]"
            >
              {day}
            </div>
          );
        }
        const info = days.get(date) ?? NO_DAY;
        return (
          <DayCell
            key={date}
            date={date}
            day={day}
            info={info}
            open={date === openDate}
            variant="grid"
            buttonRef={(element) => {
              if (element) buttons.current.set(date, element);
              else buttons.current.delete(date);
            }}
            onPick={(picked) => {
              preview.end();
              onPick(picked);
            }}
            onPointerEnter={(event) => {
              // A hover applies at once, and not through a fade still running.
              fades.current.get(date)?.cancel();
              preview.enter(date, info.count, event.currentTarget);
            }}
            onPointerLeave={preview.end}
          />
        );
      })}
    </div>
  );
}
