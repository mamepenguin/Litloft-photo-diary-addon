"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Images } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { RetryButton } from "@/components/appshell/RetryButton";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { EmptyState } from "@/components/EmptyState";
import type { TargetParams } from "./api";
import { fetchShelves } from "./api";
import { ClassificationMenu, SortMenu } from "./LibraryControls";
import { LoadError } from "./LoadError";
import { PhotoShelf } from "./PhotoShelf";
import { clearShelfState, type SavedState } from "./lib/savedState";
import type { Classification, ShelvesPage, Sort } from "./lib/library";
import { useLibraryPages } from "./useLibraryPages";

export const SHELF_ITEMS = 12;
export const SHELVES_PER_PAGE = 12;

type Restore = NonNullable<SavedState["library"]> & { target?: string };

function SkeletonShelf() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true">
      <div className="h-5 w-40 rounded-lg bg-bg-elevated" />
      <div className="h-[120px] rounded-xl bg-bg-elevated sm:h-[200px]" />
    </div>
  );
}

export function LibraryFace({
  drive,
  target,
  targetId,
  targetKey,
  ready,
  by,
  sort,
  onChangeBy,
  onChangeSort,
  restore,
  onRestored,
  onDepth,
  onRefreshCount,
  onNotAvailable,
}: {
  drive: string;
  target: TargetParams | null;
  targetId: string;
  targetKey: number;
  ready: boolean;
  by: Classification;
  sort: Sort;
  onChangeBy: (value: Classification) => void;
  onChangeSort: (value: Sort) => void;
  restore: Restore | null;
  onRestored: () => void;
  onDepth: (pages: number) => void;
  onRefreshCount: () => void;
  onNotAvailable: () => void;
}) {
  const pathname = usePathname();
  const [refreshToken, setRefreshToken] = useState(0);
  const restored = useRef(restore !== null);

  const saved =
    restore !== null && restore.by === by && restore.sort === sort && restore.target === targetId
      ? restore
      : null;

  const refresh = () => {
    setRefreshToken((value) => value + 1);
    onRefreshCount();
  };

  return (
    <div className="space-y-6 px-4 pb-6 pt-4">
      <div className="flex items-center gap-2">
        <ClassificationMenu value={by} onChange={onChangeBy} />
        <SortMenu value={sort} onChange={onChangeSort} />
      </div>
      {ready ? (
        <Shelves
          drive={drive}
          target={target}
          targetKey={targetKey}
          by={by}
          sort={sort}
          refreshToken={refreshToken}
          restore={saved}
          pathname={pathname}
          onRefresh={refresh}
          onDepth={onDepth}
          onRestored={() => {
            if (restored.current) {
              restored.current = false;
              onRestored();
            }
          }}
          onNotAvailable={onNotAvailable}
        />
      ) : (
        <SkeletonShelf />
      )}
    </div>
  );
}

function Shelves({
  drive,
  target,
  targetKey,
  by,
  sort,
  refreshToken,
  restore,
  pathname,
  onRefresh,
  onDepth,
  onRestored,
  onNotAvailable,
}: {
  drive: string;
  target: TargetParams | null;
  targetKey: number;
  by: Classification;
  sort: Sort;
  refreshToken: number;
  restore: Restore | null;
  pathname: string;
  onRefresh: () => void;
  onDepth: (pages: number) => void;
  onRestored: () => void;
  onNotAvailable: () => void;
}) {
  const t = useTranslations("photoDiary");
  const fetchPage = useMemo(
    () =>
      (page: number): Promise<ShelvesPage> =>
        fetchShelves(drive, {
          target,
          by,
          sort,
          per_shelf: SHELF_ITEMS,
          shelf_limit: SHELVES_PER_PAGE,
          offset: (page - 1) * SHELVES_PER_PAGE,
        }).then((answer) => ({ shelves: answer.shelves, total: answer.total_shelves })),
    [drive, target, by, sort],
  );
  const library = useLibraryPages({
    fetchPage,
    restorePages: restore?.loaded,
    refreshToken,
    onNotAvailable,
  });
  const sentinel = useNearEnd(library.hasMore && library.more === "idle", library.loadMore);
  const pending = useRef(restore ? restore.scrollY : null);

  useEffect(() => {
    onDepth(library.pages);
  }, [library.pages, onDepth, targetKey, by, sort]);

  useEffect(() => {
    if (pending.current === null || library.phase !== "ready") return;
    const top = pending.current;
    pending.current = null;
    window.scrollTo({ top });
    onRestored();
  }, [library.phase, onRestored]);

  if (library.phase === "failed") return <RetryButton onRetry={library.retry} />;

  if (library.phase !== "ready") return <SkeletonShelf />;

  if (library.total === 0) {
    return <EmptyState icon={Images} title={t("noPhotos")} />;
  }

  return (
    <div className="space-y-9 sm:space-y-10">
      {library.refreshFailed && <LoadError onRetry={library.retryRefresh} />}
      {library.shelves.map((shelf) => (
        <PhotoShelf
          key={shelf.key}
          shelf={shelf}
          files={library.files}
          drive={drive}
          by={by}
          sort={sort}
          pathname={pathname}
          onRefresh={onRefresh}
          onSeeAll={() => clearShelfState(drive)}
        />
      ))}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {library.more === "loading" && <SkeletonShelf />}
      {library.more === "failed" && <RetryButton onRetry={library.loadMore} />}
    </div>
  );
}
