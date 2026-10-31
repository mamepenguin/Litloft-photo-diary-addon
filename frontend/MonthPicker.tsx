"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DismissScrim } from "@/components/DismissScrim";
import { formatMonth } from "./lib/dates";

type Props = {
  months: { month: string; count: number }[];
  current: string;
  onChoose: (month: string) => void;
};

export function MonthPicker({ months, current, onChoose }: Props) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const trigger = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  // The menu is placed against the month bar that holds the picker, not
  // against the trigger: the trigger sits wherever the month's name ends,
  // which can leave a menu of this width past the edge of a phone.
  return (
    // A React handler, not a document listener: a listener cannot know what is
    // stacked above the picker.
    <div
      onKeyDown={(event) => {
        if (!open || event.key !== "Escape") return;
        event.stopPropagation();
        close();
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={t("month.choose")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <DismissScrim onDismiss={() => setOpen(false)}>
          <ul className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 max-w-full overflow-y-auto rounded-2xl border border-bg-border bg-bg-card p-1 shadow-lg">
            {months.map(({ month, count }) => (
              <li key={month}>
                <button
                  type="button"
                  aria-current={month === current ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onChoose(month);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:min-h-11 ${
                    month === current ? "font-semibold text-text-primary" : "text-text-muted"
                  }`}
                >
                  <span>{formatMonth(month, locale)}</span>
                  <span className="text-xs">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </DismissScrim>
      )}
    </div>
  );
}
