"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FileGrid } from "@/components/FileGrid";
import type { FileItem } from "@/types";
import { shelfHref, shelfTitle, photoCountText, type Classification, type Shelf, type Sort } from "./lib/library";

/**
 * Keeps only the grid's first line. The core's grid wraps by itself, so the
 * line is whatever the layout put on the first row; a card grid, which the core
 * draws when it cannot justify, keeps its first row the same way.
 */
function useFirstLine(signature: string) {
  const host = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const apply = () => {
      const justified = element.querySelector<HTMLElement>(".justified-grid");
      const container = justified ?? (element.firstElementChild as HTMLElement | null);
      if (!container) return;
      const cells = Array.from(container.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && !child.classList.contains("justified-grid-tail"),
      );
      for (const cell of cells) cell.hidden = false;
      if (cells.length < 2) return;
      const first = cells[0].offsetTop;
      for (const cell of cells) {
        if (cell.offsetTop !== first) cell.hidden = true;
      }
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [signature]);

  return host;
}

export function PhotoShelf({
  shelf,
  files,
  drive,
  by,
  sort,
  pathname,
  onRefresh,
  onSeeAll,
}: {
  shelf: Shelf;
  files: ReadonlyMap<string, FileItem>;
  drive: string;
  by: Classification;
  sort: Sort;
  pathname: string;
  onRefresh: () => void;
  onSeeAll: () => void;
}) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const drawn = shelf.file_ids.flatMap((id) => {
    const file = files.get(id);
    return file ? [file] : [];
  });
  const host = useFirstLine(drawn.map((file) => file.id).join(","));

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="min-w-0 truncate text-lg font-bold text-text-primary">
          {shelfTitle(by, shelf, drive, locale, t)}
        </h2>
        <span className="flex-shrink-0 text-sm text-text-muted">
          {photoCountText(shelf.count, locale, t)}
        </span>
        <Link
          href={shelfHref(pathname, { by, key: shelf.key, sort })}
          onClick={onSeeAll}
          className="ml-auto flex flex-shrink-0 items-center gap-0.5 text-sm text-text-muted hover:text-text-primary"
        >
          {t("seeAll")}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div ref={host} className="overflow-hidden">
        <FileGrid files={drawn} onRefresh={onRefresh} />
      </div>
    </section>
  );
}
