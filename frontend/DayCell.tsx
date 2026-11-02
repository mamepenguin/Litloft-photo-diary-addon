"use client";

import { Pen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { PointerEventHandler, Ref } from "react";
import { formatDayLabel } from "./lib/dates";
import { stepOf, type Step } from "./lib/steps";

export type DayInfo = { count: number; hasNote: boolean };

const CELL =
  "flex flex-col items-stretch justify-between rounded-xl border-2 px-1.5 py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const SIZE = {
  grid: "h-12 group-data-[wide=true]/diary:h-[76px] group-data-[wide=true]/diary:py-1.5",
  strip: "h-11",
};

// Written out whole so the stylesheet generator finds each class.
const STEP_SURFACE: Record<Exclude<Step, 0>, string> = {
  1: "bg-accent/10 hover:bg-accent/15",
  2: "bg-accent/20 hover:bg-accent/30",
  3: "bg-accent/40 hover:bg-accent/50",
  4: "bg-accent/60 hover:bg-accent/70",
};
const NOTE_SURFACE = "bg-bg-elevated hover:bg-sand";
const QUIET_SURFACE = "hover:bg-bg-elevated";

// Accent on a deep tint does not separate a selected day from its neighbours,
// so the inner ring is the page colour. A keyboard focus ring replaces it.
const INNER_RING = "shadow-[inset_0_0_0_2px_var(--bg-primary)] focus-visible:shadow-none";

type Props = {
  date: string;
  day: number;
  info: DayInfo;
  open: boolean;
  variant: "grid" | "strip";
  onPick: (date: string) => void;
  onPointerEnter?: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>;
  buttonRef?: Ref<HTMLButtonElement>;
};

export function DayCell({ date, day, info, open, variant, onPick, onPointerEnter, onPointerLeave, buttonRef }: Props) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const { count, hasNote } = info;
  const step = stepOf(count);
  const text = formatDayLabel(date, locale);
  const label =
    hasNote && count > 0
      ? t("calendar.dayLabelNoted", { date: text, count })
      : hasNote
        ? t("calendar.dayLabelNote", { date: text })
        : count > 0
          ? t("calendar.dayLabel", { date: text, count })
          : text;
  const surface =
    step !== 0
      ? `${STEP_SURFACE[step]} ${step >= 3 && open ? INNER_RING : ""} text-text-primary`
      : hasNote
        ? `${NOTE_SURFACE} text-text-primary`
        : `${QUIET_SURFACE} text-text-muted`;

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-pressed={open}
      data-date={date}
      onClick={() => onPick(date)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={`${CELL} ${SIZE[variant]} ${surface} ${open ? "border-accent" : "border-transparent"}`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="text-sm font-semibold">{day}</span>
        {hasNote && variant === "grid" && (
          <Pen
            size={12}
            aria-hidden="true"
            className="shrink-0 text-text-primary group-data-[wide=true]/diary:size-3.5"
          />
        )}
      </span>
      {count > 0 && (
        <span className={`text-xs ${step === 1 ? "text-text-muted" : "text-text-primary"}`}>{count}</span>
      )}
    </button>
  );
}
