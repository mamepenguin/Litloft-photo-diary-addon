"use client";

import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import type { FileItem } from "@/types";
import { LoadError } from "./LoadError";
import { usePagedPhotos, type FetchIds } from "./usePagedPhotos";

export type ListPosition = { loaded: () => number; scrollY: () => number };

type Props = {
  listKey: string;
  fetchIds: FetchIds;
  refreshToken: number;
  /** Whether the view this list belongs to is on screen. */
  active: boolean;
  /** Where the list scrolls: the page, or the panel that holds it. */
  scroller: "window" | "panel";
  restore?: { loaded: number; scrollY: number };
  positionRef: MutableRefObject<ListPosition | null>;
  heading?: (total: number | null) => ReactNode;
  emptyMessage?: string;
  onEmpty?: () => void;
  onClose: () => void;
  onNotAvailable: () => void;
  onRefreshResult: (ok: boolean) => void;
  onRestored: () => void;
  className?: string;
  children: (state: { files: FileItem[]; moreMayFollow: boolean }) => ReactNode;
};

export function PhotoList({
  listKey,
  fetchIds,
  refreshToken,
  active,
  scroller,
  restore,
  positionRef,
  heading,
  emptyMessage,
  onEmpty,
  onClose,
  onNotAvailable,
  onRefreshResult,
  onRestored,
  className,
  children,
}: Props) {
  const t = useTranslations("photoDiary");
  const paged = usePagedPhotos({
    listKey,
    fetchIds,
    refreshToken,
    restoreDepth: restore?.loaded,
    onNotAvailable,
    onRefreshResult,
  });
  const { files, total, loaded, phase, more, moreMayFollow, loadMore, retry } = paged;

  const panel = useRef<HTMLDivElement | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const pendingRestore = useRef(restore);

  const readScroll = () => (scroller === "window" ? window.scrollY : (panel.current?.scrollTop ?? 0));
  const readScrollRef = useRef(readScroll);
  readScrollRef.current = readScroll;

  useEffect(() => {
    const position: ListPosition = {
      loaded: () => loadedRef.current,
      scrollY: () => readScrollRef.current(),
    };
    positionRef.current = position;
    return () => {
      if (positionRef.current === position) positionRef.current = null;
    };
  }, [positionRef]);

  useLayoutEffect(() => {
    const target = pendingRestore.current;
    if (!target || phase !== "ready") return;
    pendingRestore.current = undefined;
    const apply = () => {
      if (scroller === "window") window.scrollTo({ top: target.scrollY });
      else if (panel.current) panel.current.scrollTop = target.scrollY;
    };
    apply();
    requestAnimationFrame(apply);
    onRestored();
  }, [phase, scroller, onRestored]);

  const empty = phase === "ready" && total === 0;
  useEffect(() => {
    if (empty) onEmpty?.();
  }, [empty, onEmpty]);

  const canObserve = active && phase === "ready" && more === "idle" && moreMayFollow;
  useEffect(() => {
    const node = sentinel.current;
    if (!canObserve || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      scroller === "panel" ? { root: panel.current, rootMargin: "400px" } : { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canObserve, loaded, loadMore, scroller]);

  return (
    <div
      ref={panel}
      className={[scroller === "panel" ? "overflow-y-auto" : "", className ?? ""].join(" ").trim()}
    >
      <div className="flex items-center gap-3 pb-3">
        <div className="min-w-0 flex-1">{heading?.(total)}</div>
        <Button size="sm" onClick={onClose}>
          <X size={14} aria-hidden="true" />
          {t("close")}
        </Button>
      </div>

      {phase === "failed" && <LoadError onRetry={retry} />}

      {phase === "loading" && (
        <div className="py-8" aria-busy="true">
          <div className="h-24 animate-pulse rounded-xl bg-bg-elevated" />
        </div>
      )}

      {empty && emptyMessage && (
        <p className="py-8 text-center text-sm text-text-muted">{emptyMessage}</p>
      )}

      {phase === "ready" && !empty && children({ files, moreMayFollow })}

      {more === "failed" && <LoadError onRetry={loadMore} />}
      {canObserve && <div ref={sentinel} className="h-px" aria-hidden="true" />}
    </div>
  );
}
