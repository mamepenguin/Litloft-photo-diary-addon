"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Images, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/EmptyState";
import { FileGrid } from "@/components/FileGrid";
import { FilterMenus } from "@/components/appshell/FilterMenus";
import { RetryButton } from "@/components/appshell/RetryButton";
import {
  GroupMenu,
  LibraryControlRow,
  SortMenu as CoreSortMenu,
} from "@/components/appshell/ViewMenus";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { getTagCounts, getTagCountsWithFileIds, type TagCountsParams } from "@/lib/api";
import type { Tag } from "@/types";
import type { MemberFileIds, TargetParams } from "./api";
import { fetchShelf, fetchShelves } from "./api";
import { LoadError } from "./LoadError";
import { PhotoShelf } from "./PhotoShelf";
import { clearShelfState, type SavedState } from "./lib/savedState";
import {
  CLASSIFICATIONS,
  SORTS,
  withChosenTags,
  type Classification,
  type ShelvesPage,
  type Sort,
} from "./lib/library";
import { useLibraryPages } from "./useLibraryPages";
import { PAGE_SIZE, usePagedPhotos } from "./usePagedPhotos";

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

const folded = (values: readonly string[]) => values.map((value) => value.toLowerCase());

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  const one = folded(a);
  const two = folded(b);
  return one.length === two.length && one.every((tag, index) => tag === two[index]);
}

/** The Photo Diary conditions as the core's tag-counts route takes them. */
function tagCountParams(target: TargetParams | null, tags: readonly string[]): TagCountsParams {
  const withTags = withChosenTags(target, tags);
  const { none: _empty, ...rest } = withTags ?? {};
  void _empty;
  return { ...rest, type: ["image"] };
}

export function LibraryFace({
  drive,
  target,
  fileIds,
  targetId,
  targetKey,
  targetKnown,
  ready,
  targetFailed,
  targetTooLarge,
  onRetryTarget,
  active,
  writeToken,
  onWrite,
  by,
  sort,
  onChangeBy,
  onChangeSort,
  tags,
  onToggleTag,
  onClearTags,
  restore,
  onRestored,
  onDepth,
  onRefreshCount,
  onNotAvailable,
}: {
  drive: string;
  target: TargetParams | null;
  fileIds: MemberFileIds | null;
  targetId: string;
  targetKey: number;
  /** The look-up has ended and no `?target=` is pending. */
  targetKnown: boolean;
  ready: boolean;
  /** The member evaluation failed; the face shows its first-load retry. */
  targetFailed: boolean;
  /** More members than one request may carry; the face's body cannot use the target. */
  targetTooLarge: boolean;
  onRetryTarget: () => void;
  active: boolean;
  /** Bumped by the page for a write made through another face's context menu. */
  writeToken: number;
  /** Reports a write on the Library's photos to the page, returning the write count after it. */
  onWrite: () => number;
  by: Classification;
  sort: Sort;
  onChangeBy: (value: Classification) => void;
  onChangeSort: (value: Sort) => void;
  /** The chosen tags, in the URL's order. */
  tags: readonly string[];
  onToggleTag: (name: string) => void;
  onClearTags: () => void;
  restore: Restore | null;
  onRestored: () => void;
  onDepth: (pages: number) => void;
  onRefreshCount: () => void;
  onNotAvailable: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("photoDiary");
  const [refreshToken, setRefreshToken] = useState(0);
  const restored = useRef(restore !== null);

  const empty = target?.none === true;
  const saved =
    restore !== null &&
    restore.by === by &&
    restore.sort === sort &&
    restore.target === targetId &&
    sameTags(restore.tags ?? [], tags)
      ? restore
      : null;

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
    onRefreshCount();
  }, [onRefreshCount]);

  const seenWrite = useRef(writeToken);
  useEffect(() => {
    if (!active || writeToken === seenWrite.current) return;
    seenWrite.current = writeToken;
    refresh();
  }, [active, writeToken, refresh]);

  const wrote = useCallback(() => {
    seenWrite.current = onWrite();
    refresh();
  }, [onWrite, refresh]);

  const onRestoredOnce = useCallback(() => {
    if (restored.current) {
      restored.current = false;
      onRestored();
    }
  }, [onRestored]);

  const conditionsKey = JSON.stringify([targetId, ready, tags]);
  const hasFilters = targetKnown && !targetFailed && !targetTooLarge;
  const loadCandidates = useCallback(
    (signal: AbortSignal): Promise<Tag[]> => {
      if (empty) return Promise.resolve([]);
      if (!ready) return new Promise<Tag[]>(() => {});
      if (fileIds !== null) {
        return getTagCountsWithFileIds(drive, tagCountParams(null, tags), fileIds, { signal });
      }
      return getTagCounts(drive, tagCountParams(target, tags), { signal });
    },
    [empty, ready, fileIds, drive, tags, target],
  );
  const excludedTags = useMemo(() => target?.tag ?? [], [target]);

  const groupOptions = CLASSIFICATIONS.map((value) => ({
    value,
    label: t(`classifications.${value}`),
  }));
  const sortOptions = SORTS.map((value) => ({
    value,
    label: t(`sort.${value}`),
  }));

  let body: React.ReactNode;
  if (targetTooLarge) {
    body = <EmptyState icon={Images} title={t("targetUnavailable")} />;
  } else if (targetFailed) {
    body = <RetryButton onRetry={onRetryTarget} />;
  } else if (!targetKnown || !ready) {
    body = <SkeletonShelf />;
  } else if (by === "all") {
    body = (
      <AllPhotos
        drive={drive}
        target={target}
        fileIds={fileIds}
        tags={tags}
        sort={sort}
        empty={empty}
        refreshToken={refreshToken}
        restore={saved}
        onRefresh={wrote}
        onDepth={onDepth}
        onRestored={onRestoredOnce}
        onNotAvailable={onNotAvailable}
      />
    );
  } else {
    body = (
      <Shelves
        drive={drive}
        target={target}
        fileIds={fileIds}
        targetKey={targetKey}
        by={by}
        sort={sort}
        tags={tags}
        empty={empty}
        refreshToken={refreshToken}
        restore={saved}
        pathname={pathname}
        onRefresh={wrote}
        onDepth={onDepth}
        onRestored={onRestoredOnce}
        onNotAvailable={onNotAvailable}
      />
    );
  }

  return (
    <div className="space-y-6 px-4 pb-6 pt-4">
      {targetKnown && (
        <LibraryControlRow
          filters={
            hasFilters ? (
              <FilterMenus
                tags={tags}
                onToggle={onToggleTag}
                onClear={onClearTags}
                loadCandidates={loadCandidates}
                conditionsKey={conditionsKey}
                excludeTags={excludedTags}
                state={null}
                onViewerRejected={() => {}}
              />
            ) : undefined
          }
        >
          <GroupMenu options={groupOptions} value={by} onChange={onChangeBy} />
          <CoreSortMenu options={sortOptions} value={sort} onChange={onChangeSort} />
        </LibraryControlRow>
      )}
      <div className="mt-6">{body}</div>
    </div>
  );
}

function Shelves({
  drive,
  target,
  fileIds,
  targetKey,
  by,
  sort,
  tags,
  empty,
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
  fileIds: MemberFileIds | null;
  targetKey: number;
  by: Classification;
  sort: Sort;
  tags: readonly string[];
  empty: boolean;
  refreshToken: number;
  restore: Restore | null;
  pathname: string;
  onRefresh: () => void;
  onDepth: (pages: number) => void;
  onRestored: () => void;
  onNotAvailable: () => void;
}) {
  const t = useTranslations("photoDiary");
  const params = useMemo(() => withChosenTags(target, tags), [target, tags]);
  const fetchPage = useMemo(
    () =>
      (page: number): Promise<ShelvesPage> =>
        fetchShelves(drive, {
          target: params,
          fileIds,
          by,
          sort,
          per_shelf: SHELF_ITEMS,
          shelf_limit: SHELVES_PER_PAGE,
          offset: (page - 1) * SHELVES_PER_PAGE,
        }).then((answer) => ({ shelves: answer.shelves, total: answer.total_shelves })),
    [drive, params, fileIds, by, sort],
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
    return tags.length > 0 && !empty ? (
      <EmptyState icon={Search} title={t("library.filteredEmpty")} />
    ) : (
      <EmptyState icon={Images} title={t("noPhotos")} />
    );
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
          by={by === "all" ? "month" : by}
          sort={sort}
          tags={tags}
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

function AllPhotos({
  drive,
  target,
  fileIds,
  tags,
  sort,
  empty,
  refreshToken,
  restore,
  onRefresh,
  onDepth,
  onRestored,
  onNotAvailable,
}: {
  drive: string;
  target: TargetParams | null;
  fileIds: MemberFileIds | null;
  tags: readonly string[];
  sort: Sort;
  empty: boolean;
  refreshToken: number;
  restore: Restore | null;
  onRefresh: () => void;
  onDepth: (pages: number) => void;
  onRestored: () => void;
  onNotAvailable: () => void;
}) {
  const t = useTranslations("photoDiary");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const params = useMemo(() => withChosenTags(target, tags), [target, tags]);
  const listKey = JSON.stringify([params, fileIds, sort]);
  const fetchIds = useCallback(
    async (offset: number, limit: number) => {
      const answer = await fetchShelf(drive, {
        target: params,
        fileIds,
        by: "all",
        key: "all",
        sort,
        limit,
        offset,
      });
      return { ids: answer.file_ids, total: answer.total };
    },
    [drive, params, fileIds, sort],
  );
  const paged = usePagedPhotos({
    listKey,
    fetchIds,
    refreshToken,
    restoreDepth: restore ? restore.loaded * PAGE_SIZE : undefined,
    onNotAvailable,
    onRefreshResult: (ok) => setRefreshFailed(!ok),
  });
  const sentinel = useNearEnd(paged.moreMayFollow && paged.more === "idle", paged.loadMore);
  const applied = useRef(false);

  useEffect(() => {
    if (paged.loaded > 0) onDepth(Math.max(1, Math.ceil(paged.loaded / PAGE_SIZE)));
  }, [paged.loaded, onDepth]);

  useEffect(() => {
    if (applied.current || restore === null || paged.phase !== "ready") return;
    applied.current = true;
    window.scrollTo({ top: restore.scrollY });
    onRestored();
  }, [restore, paged.phase, onRestored]);

  if (paged.phase === "failed") return <RetryButton onRetry={paged.retry} />;

  if (paged.phase === "loading") return <SkeletonShelf />;

  if (paged.total === 0) {
    return tags.length > 0 && !empty ? (
      <EmptyState icon={Search} title={t("library.filteredEmpty")} />
    ) : (
      <EmptyState icon={Images} title={t("noPhotos")} />
    );
  }

  return (
    <>
      {refreshFailed && <LoadError onRetry={onRefresh} />}
      <FileGrid files={paged.files} moreMayFollow={paged.moreMayFollow} onRefresh={onRefresh} />
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {paged.more === "loading" && (
        <div className="mt-8">
          <SkeletonShelf />
        </div>
      )}
      {paged.more === "failed" && (
        <div className="mt-8">
          <LoadError onRetry={paged.loadMore} />
        </div>
      )}
    </>
  );
}
