"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownUp, Check, ChevronDown, LayoutList } from "lucide-react";
import { useTranslations } from "next-intl";
import { CLASSIFICATIONS, SORTS, type Classification, type Sort } from "./lib/library";

type Option<T extends string> = { value: T; label: string };

function RadioMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  align,
  caption,
}: {
  label: string;
  caption?: string;
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
      {caption && (
        <div aria-hidden="true" className="px-3 py-1.5 text-xs text-text-muted">
          {caption}
        </div>
      )}
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

function Trigger({
  label,
  open,
  onClick,
  quiet,
  children,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  quiet: boolean;
  children: ReactNode;
}) {
  const shape = quiet
    ? `flex min-w-0 items-center gap-1 rounded-xl px-2 py-1 text-sm text-text-muted hover:bg-bg-elevated max-sm:min-h-11 ${
        open ? "bg-bg-elevated" : ""
      }`
    : `flex min-w-0 items-center gap-1.5 rounded-xl bg-sand px-3 py-2 text-sm text-text-primary hover:bg-sand-hover max-sm:min-h-11 ${
        open ? "bg-sand-hover" : ""
      }`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onClick}
      className={shape}
    >
      {children}
      <ChevronDown size={14} className="flex-shrink-0" aria-hidden="true" />
    </button>
  );
}

export function ClassificationMenu({
  value,
  onChange,
}: {
  value: Classification;
  onChange: (value: Classification) => void;
}) {
  const t = useTranslations("photoDiary");
  const [open, setOpen] = useState(false);
  const current = t(`classifications.${value}`);
  return (
    <MenuShell open={open} onClose={() => setOpen(false)}>
      <Trigger
        label={`${t("classification")}: ${current}`}
        open={open}
        quiet={false}
        onClick={() => setOpen((value) => !value)}
      >
        <LayoutList size={16} className="flex-shrink-0" aria-hidden="true" />
        <span className="hidden flex-shrink-0 text-text-muted sm:inline">{t("classification")}</span>
        <span className="truncate font-semibold">{current}</span>
      </Trigger>
      {open && (
        <RadioMenu
          label={t("classification")}
          caption={t("classification")}
          value={value}
          align="start"
          options={CLASSIFICATIONS.map((classification) => ({
            value: classification,
            label: t(`classifications.${classification}`),
          }))}
          onChange={(next) => {
            setOpen(false);
            onChange(next);
          }}
        />
      )}
    </MenuShell>
  );
}

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
  const [open, setOpen] = useState(false);
  const current = t(`sort.${value}`);
  return (
    <MenuShell open={open} onClose={() => setOpen(false)}>
      <Trigger
        label={`${t("sort.label")}: ${current}`}
        open={open}
        quiet={quiet}
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowDownUp size={quiet ? 14 : 16} className="flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{current}</span>
      </Trigger>
      {open && (
        <RadioMenu
          label={t("sort.label")}
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
