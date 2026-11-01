"use client";

import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { DayCell, type DayInfo } from "./DayCell";
import { formatMonth, weekOf } from "./lib/dates";

/** The strip's height with its border, which the page heading's sticky offset adds. */
export const STRIP_HEIGHT = 81;

const NO_DAY: DayInfo = { count: 0, hasNote: false };

type Props = {
  month: string;
  openDate: string;
  days: ReadonlyMap<string, DayInfo>;
  onPick: (date: string) => void;
  onBack: () => void;
};

/** The open day's week, pinned under the app header while the grid is out of sight. */
export function WeekStrip({ month, openDate, days, onPick, onBack }: Props) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();

  return (
    <div className="absolute inset-x-0 top-0 border-b border-bg-border bg-bg-primary">
      <div className="flex h-9 items-center justify-between">
        <span className="text-sm font-bold text-text-primary">{formatMonth(month, locale)}</span>
        <Button iconOnly variant="ghost" aria-label={t("strip.showMonth")} onClick={onBack}>
          <CalendarDays size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="grid h-11 grid-cols-7 gap-1.5">
        {weekOf(openDate).map((date) =>
          date.startsWith(`${month}-`) ? (
            <DayCell
              key={date}
              date={date}
              day={Number(date.slice(8))}
              info={days.get(date) ?? NO_DAY}
              open={date === openDate}
              variant="strip"
              onPick={onPick}
            />
          ) : (
            <div key={date} />
          ),
        )}
      </div>
    </div>
  );
}
