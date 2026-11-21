"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownUp, Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { SORTS, type Sort } from "./lib/library";

type Option<T extends string> = { value: T; label: string };

function RadioMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  align,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  align: "start" | "end";
}) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={`absolute top-full z-40 mt-1 min-h-10 min-w-[12rem] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:bottom-4 max-sm:top-auto ${
        align === "end" ? "right-0" : "left-0"
      }`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              selected
                ? "bg-bg-elevated font-medium text-text-primary"
                : "text-text-primary hover:bg-bg-elevated"
            }`}
          >
            <span className="w-4 flex-shrink-0">{selected && <Check size={14} />}</span>
            <span className="min-w-0 flex-1">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MenuShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (!open || event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      {children}
      {open && <div className="fixed inset-0 z-30" aria-hidden="true" onClick={onClose} />}
    </div>
  );
}

/** The shelf page's quiet sort control, beside its title. */
export function SortMenu({
  value,
  onChange,
  quiet = false,
}: {
  value: Sort;
  onChange: (value: Sort) => void;
  quiet?: boolean;
}) {
  const t = useTranslations("photoDiary");
  const tView = useTranslations("appView");
  const [open, setOpen] = useState(false);
  const current = t(`sort.${value}`);
  const label = tView("sortBy");
  return (
    <MenuShell open={open} onClose={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`${label}: ${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-w-0 items-center gap-1 text-sm ${
          quiet
            ? `rounded-xl px-2 py-1 text-text-muted hover:bg-bg-elevated max-sm:min-h-11 ${open ? "bg-bg-elevated" : ""}`
            : "rounded-xl bg-sand px-3 py-2 text-text-primary hover:bg-sand-hover max-sm:min-h-11"
        }`}
      >
        <ArrowDownUp size={quiet ? 14 : 16} className="flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{current}</span>
        <ChevronDown size={14} className="flex-shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <RadioMenu
          label={label}
          value={value}
          align="end"
          options={SORTS.map((sort) => ({ value: sort, label: t(`sort.${sort}`) }))}
          onChange={(next) => {
            setOpen(false);
            onChange(next);
          }}
        />
      )}
    </MenuShell>
  );
}
