"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Images } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCurrentDrive } from "@/components/CurrentDriveProvider";
import { AppHeader } from "@/components/appshell/AppHeader";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { EmptyState } from "@/components/EmptyState";
import { FileGrid } from "@/components/FileGrid";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { fetchMonths, fetchShelf, type TargetParams } from "./api";
import { isNotFound, isUnprocessable } from "./lib/errors";
import {
  parseShelfUrl,
  photoCountText,
  shelfKeyTitle,
  shelfPageQuery,
  type ShelfUrl,
} from "./lib/library";
import {
  loadShelfState,
  saveShelfState,
} from "./lib/savedState";
import { photoTotal } from "./lib/total";
import { LoadError } from "./LoadError";
import { SortMenu } from "./LibraryControls";
import { usePagedPhotos } from "./usePagedPhotos";
import { useTarget } from "./useTarget";
import { useLastScrollY } from "./useLastScrollY";

export default function ShelfPage() {
  const drive = useCurrentDrive();
  if (drive === null) return <Frame />;
  return <Page key={drive} drive={drive} />;
}

function Frame({
  drive,
  header,
  children,
}: {
  drive?: string;
  header?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTranslations("photoDiary");
  return (
    <PageFrame
      width="wide"
      header={header ?? <PageHeader titleIcon={Images} title={t("nav.label")} scope={drive} />}
    >
      {children}
    </PageFrame>
  );
}

function backHref(pathname: string): string {
  return `${pathname.replace(/\/[^/]+$/, "")}?view=library`;
}

function BackLink({ pathname }: { pathname: string }) {
  const t = useTranslations("photoDiary");
  return (
    <Link
      href={backHref(pathname)}
      className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-primary"
    >
      <ChevronLeft size={16} aria-hidden="true" />
      {t("nav.label")}
    </Link>
  );
}

function Invalid({ drive, pathname }: { drive: string; pathname: string }) {
  const t = useTranslations("photoDiary");
  return (
    <Frame
      drive={drive}
      header={
        <PageHeader
          titleIcon={Images}
          title={t("nav.label")}
          breadcrumb={<BackLink pathname={pathname} />}
        />
      }
    >
      <p className="px-4 py-12 text-center text-sm text-text-muted">{t("invalidLink")}</p>
    </Frame>
  );
}

function Page({ drive }: { drive: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const link = useMemo(() => parseShelfUrl(`?${search}`), [search]);

  if (!link) return <Invalid drive={drive} pathname={pathname} />;

  return (
    <Session
      key={`${link.by}:${link.key}`}
      drive={drive}
      link={link}
      pathname={pathname}
    />
  );
}

type LabelState = { key: string; status: "pending" | "ok" | "failed"; label: string };

function Session({
  drive,
  link,
  pathname,
}: {
  drive: string;
  link: ShelfUrl;
  pathname: string;
}) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const router = useRouter();
  const target = useTarget(drive);
  const targetRef = useRef(target.selectedId);
  targetRef.current = target.selectedId;

  const [notAvailable, setNotAvailable] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [label, setLabel] = useState<LabelState>({
    key: "",
    status: "pending",
    label: "",
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [count, setCount] = useState<{ changes: number; value: number | null }>({
    changes: -1,
    value: null,
  });
  const [monthsToken, setMonthsToken] = useState(0);
  const loaded = useRef(0);
  const lastScrollY = useLastScrollY();
  const listKey = `${link.by}|${link.key}|${link.sort}|${target.changes}`;
  const listKeyRef = useRef(listKey);
  listKeyRef.current = listKey;

  const targetTotal = target.ready && count.changes === target.changes ? count.value : null;
  const changesRef = useRef(target.changes);
  changesRef.current = target.changes;

  useEffect(() => {
    setTotal(null);
    setRefreshFailed(false);
    setLabel({ key: listKeyRef.current, status: "pending", label: "" });
  }, [listKey]);

  useEffect(() => {
    if (!target.ready) return;
    let current = true;
    const changes = target.changes;
    const params = target.params;
    (params ? fetchMonths(drive, params) : fetchMonths(drive)).then(
      (months) => {
        if (!current) return;
        if (changes === changesRef.current) setCount({ changes, value: photoTotal(months) });
      },
      (error: unknown) => {
        if (current && isNotFound(error)) setNotAvailable(true);
      },
    );
    return () => {
      current = false;
    };
  }, [drive, target.ready, target.changes, target.params, monthsToken]);

  const [savedPlace] = useState(() => loadShelfState(drive));
  const samePlace =
    savedPlace !== null &&
    savedPlace.by === link.by &&
    savedPlace.key === link.key &&
    savedPlace.sort === link.sort;
  const restore =
    samePlace && target.ready && savedPlace.target === target.selectedId ? savedPlace : null;

  const flush = useCallback(() => {
    if (loaded.current <= 0) return;
    saveShelfState(drive, {
      by: link.by,
      key: link.key,
      sort: link.sort,
      target: targetRef.current,
      loaded: loaded.current,
      scrollY: lastScrollY.current,
    });
  }, [drive, link.by, link.key, link.sort]);

  useLayoutEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const changeSort = (sort: ShelfUrl["sort"]) => {
    if (sort === link.sort) return;
    router.replace(`${pathname}${shelfPageQuery({ ...link, sort })}`, { scroll: false });
  };
  const refresh = () => {
    setRefreshFailed(false);
    setRefreshToken((value) => value + 1);
    setMonthsToken((value) => value + 1);
  };
  const onAnswer = useCallback(
    (key: string, answer: { status: "ok" | "failed"; label: string }) => {
      setLabel((current) => {
        if (current.key !== key) return current;
        if (answer.status === "failed" && current.status !== "pending") return current;
        return { key, status: answer.status, label: answer.label };
      });
    },
    [],
  );
  const onTotal = useCallback((key: string, value: number) => {
    if (key !== listKeyRef.current) return;
    setTotal(value);
  }, []);
  const onLoaded = useCallback((value: number) => {
    loaded.current = value;
  }, []);
  const onRefreshResult = useCallback((key: string, ok: boolean) => {
    if (key !== listKeyRef.current) return;
    setRefreshFailed(!ok);
  }, []);

  const title =
    link.by === "collection"
      ? label.key === listKey && label.status === "ok"
        ? label.label || t("collection")
        : label.key === listKey && label.status === "failed"
          ? t("collection")
          : "…"
      : shelfKeyTitle(link.by, link.key, drive, locale, t);

  if (invalid) return <Invalid drive={drive} pathname={pathname} />;

  if (notAvailable) {
    return (
      <Frame drive={drive}>
        <p className="px-4 py-12 text-center text-sm text-text-muted">{t("notAvailable")}</p>
      </Frame>
    );
  }

  return (
    <PageFrame
      width="wide"
      header={
        <AppHeader
          drive={drive}
          icon={Images}
          title={title}
          countDetail={total === null ? null : photoCountText(total, locale, t)}
          breadcrumb={<BackLink pathname={pathname} />}
          actions={<SortMenu quiet value={link.sort} onChange={changeSort} />}
          target={{
            drive,
            app: { addon: "photo_diary" },
            name: target.lookingUp ? null : (target.folder?.name ?? t("allPhotos")),
            folders: target.folders,
            selectedId: target.selectedId,
            currentCount: targetTotal,
            label: t("target"),
            defaultLabel: t("allPhotos"),
            unavailableLabel: t("targetUnavailable"),
            defaultTargetTypes: ["image"],
            isUsable: target.isUsable,
            onChoose: target.choose,
            onRetryFolders: target.retryFolders,
          }}
        />
      }
    >
      {/* The header's 8px bottom padding plus 4px under the phone's sort row is the design's gap. */}
      <div className="px-4 pb-6 pt-4 max-sm:-mt-1 max-sm:pt-0 sm:pb-8">
        {target.ready ? (
          <ShelfPhotos
            drive={drive}
            link={link}
            listKey={listKey}
            target={target.params}
            restoreDepth={restore?.loaded}
            restoreScroll={restore?.scrollY}
            refreshToken={refreshToken}
            refreshFailed={refreshFailed}
            onAnswer={onAnswer}
            onTotal={onTotal}
            onLoaded={onLoaded}
            onRefresh={refresh}
            onRefreshResult={onRefreshResult}
            onNotAvailable={() => setNotAvailable(true)}
            onInvalid={() => setInvalid(true)}
          />
        ) : (
          <Skeleton />
        )}
      </div>
    </PageFrame>
  );
}

function Skeleton() {
  return <div className="h-64 animate-pulse rounded-xl bg-bg-elevated" aria-busy="true" />;
}

function ShelfPhotos({
  drive,
  link,
  listKey,
  target,
  restoreDepth,
  restoreScroll,
  refreshToken,
  refreshFailed,
  onAnswer,
  onTotal,
  onLoaded,
  onRefresh,
  onRefreshResult,
  onNotAvailable,
  onInvalid,
}: {
  drive: string;
  link: ShelfUrl;
  listKey: string;
  target: TargetParams | null;
  restoreDepth?: number;
  restoreScroll?: number;
  refreshToken: number;
  refreshFailed: boolean;
  onAnswer: (key: string, answer: { status: "ok" | "failed"; label: string }) => void;
  onTotal: (key: string, value: number) => void;
  onLoaded: (value: number) => void;
  onRefresh: () => void;
  onRefreshResult: (key: string, ok: boolean) => void;
  onNotAvailable: () => void;
  onInvalid: () => void;
}) {
  const t = useTranslations("photoDiary");
  const handlers = useRef({ onAnswer, onTotal, onLoaded, onRefreshResult, onInvalid });
  handlers.current = { onAnswer, onTotal, onLoaded, onRefreshResult, onInvalid };

  const fetchIds = useCallback(
    async (offset: number, limit: number) => {
      try {
        const answer = await fetchShelf(drive, {
          target,
          by: link.by,
          key: link.key,
          sort: link.sort,
          limit,
          offset,
        });
        handlers.current.onAnswer(listKey, { status: "ok", label: answer.label });
        handlers.current.onTotal(listKey, answer.total);
        return { ids: answer.file_ids, total: answer.total };
      } catch (error) {
        if (isUnprocessable(error)) handlers.current.onInvalid();
        else handlers.current.onAnswer(listKey, { status: "failed", label: "" });
        throw error;
      }
    },
    [drive, target, link.by, link.key, link.sort, listKey],
  );

  const paged = usePagedPhotos({
    listKey,
    fetchIds,
    refreshToken,
    restoreDepth,
    onNotAvailable,
    onRefreshResult: (ok) => handlers.current.onRefreshResult(listKey, ok),
  });
  const sentinel = useNearEnd(paged.moreMayFollow && paged.more === "idle", paged.loadMore);

  useEffect(() => {
    handlers.current.onLoaded(paged.loaded);
  }, [paged.loaded]);

  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || restoreScroll === undefined || paged.phase !== "ready") return;
    applied.current = true;
    window.scrollTo({ top: restoreScroll });
  }, [restoreScroll, paged.phase]);

  if (paged.phase === "failed") return <LoadError onRetry={paged.retry} />;

  if (paged.phase === "loading") return <Skeleton />;

  if (paged.total === 0) {
    return <EmptyState icon={Images} title={t("noPhotos")} />;
  }

  return (
    <>
      {refreshFailed && <LoadError onRetry={onRefresh} />}
      <FileGrid files={paged.files} moreMayFollow={paged.moreMayFollow} onRefresh={onRefresh} />
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {paged.more === "loading" && (
        <div className="mt-8">
          <Skeleton />
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
