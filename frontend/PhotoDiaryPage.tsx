"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Images } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCurrentDrive } from "@/components/CurrentDriveProvider";
import { AppHeader } from "@/components/appshell/AppHeader";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { CalendarView } from "./CalendarView";
import { LibraryFace } from "./LibraryFace";
import { MapView, type MapRestore } from "./MapView";
import type { ListPosition } from "./PhotoList";
import { buildPageQuery, parsePageUrl, type PageUrl } from "./lib/pageUrl";
import {
  readClassification,
  readSort,
  writeClassification,
  writeSort,
  photoCountText,
  type Classification,
  type Sort,
} from "./lib/library";
import {
  clearState,
  loadState,
  saveState,
  type SavedState,
} from "./lib/savedState";
import { fetchMonths } from "./api";
import { isNotFound } from "./lib/errors";
import { photoTotal } from "./lib/total";
import { useTarget } from "./useTarget";
import { useLastScrollY } from "./useLastScrollY";
import { PAGE_SIZE } from "./usePagedPhotos";

type View = PageUrl["view"];
type LibraryRestore = NonNullable<SavedState["library"]>;

export default function PhotoDiaryPage() {
  const drive = useCurrentDrive();
  if (drive === null) return <Frame />;
  return <Session key={drive} drive={drive} />;
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
      header={
        header ?? <PageHeader titleIcon={Images} title={t("nav.label")} scope={drive} />
      }
    >
      {children}
    </PageFrame>
  );
}

function Session({ drive }: { drive: string }) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = useMemo(() => parsePageUrl(`?${search}`), [search]);
  const target = useTarget(drive);
  const targetId = useRef(target.selectedId);
  targetId.current = target.selectedId;

  const [by, setBy] = useState<Classification>(() => readClassification(drive));
  const [sort, setSort] = useState<Sort>(() => readSort(drive));
  const byRef = useRef(by);
  byRef.current = by;
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [notAvailable, setNotAvailable] = useState(false);
  const [count, setCount] = useState<{ changes: number; value: number | null }>({
    changes: -1,
    value: null,
  });
  const total = target.ready && count.changes === target.changes ? count.value : null;
  const changesRef = useRef(target.changes);
  changesRef.current = target.changes;
  // An answer carries the token of the render that made its request; one for an
  // earlier target must not replace or blank the count of the target in force.
  const reportTotal = useCallback((value: number, changes: number) => {
    if (changes !== changesRef.current) return;
    setCount({ changes, value });
  }, []);
  const [seen, setSeen] = useState({
    library: url.view === "library",
    calendar: url.view === "calendar",
    map: url.view === "map",
  });
  useEffect(() => {
    setSeen((current) => (current[url.view] ? current : { ...current, [url.view]: true }));
  }, [url.view]);

  // The calendar reports the count while it is the view; on the map and the
  // Library nothing else would, so the page reads it itself on each entry.
  // What was last known stays on screen meanwhile and when the read fails. An
  // answer to an earlier entry is dropped, so a slow one cannot overwrite a
  // newer count.
  const countsItself = url.view === "map" || url.view === "library";
  const [countToken, setCountToken] = useState(0);
  const countChanged = useCallback(() => setCountToken((value) => value + 1), []);
  useEffect(() => {
    if (!countsItself || !target.ready) return;
    let current = true;
    const changes = target.changes;
    const params = target.params;
    (params ? fetchMonths(drive, params) : fetchMonths(drive)).then(
      (months) => {
        if (current) setCount({ changes, value: photoTotal(months) });
      },
      (error: unknown) => {
        if (current && isNotFound(error)) setNotAvailable(true);
      },
    );
    return () => {
      current = false;
    };
  }, [drive, countsItself, countToken, target.ready, target.changes, target.params]);

  // A URL with no query is a fresh start however it was reached.
  const [initial] = useState(() => {
    if (search === "") {
      clearState(drive);
      return { saved: {} as SavedState, listOpensFromUrl: false, view: url.view };
    }
    return {
      saved: loadState(drive) ?? {},
      listOpensFromUrl: url.date !== null || url.undated,
      view: url.view,
    };
  });
  const savedTarget = initial.saved.target ?? "default";

  const saved = useRef<SavedState>(initial.saved);
  const lastScrollY = useLastScrollY();
  const calendarList = useRef<ListPosition | null>(null);
  const mapList = useRef<ListPosition | null>(null);
  const libraryPages = useRef(0);
  const viewRef = useRef<View>(url.view);
  viewRef.current = url.view;
  const searchRef = useRef(search);
  searchRef.current = search;
  const ownTarget = useRef<string | null>(null);

  // The calendar's parameters are the last calendar URL's, kept while the
  // Library owns the URL. The view itself is also given that URL, so a hidden
  // calendar is not redrawn by an address it does not belong to.
  const calendarParams = useRef({
    month: url.view === "calendar" || url.view === "map" ? url.month : null,
    date: url.view === "calendar" || url.view === "map" ? url.date : null,
    undated: url.view === "calendar" || url.view === "map" ? url.undated : false,
  });
  const calendarUrl = useRef<PageUrl>(
    initial.view === "library" ? { view: "calendar", month: null, date: null, undated: false } : url,
  );
  if (url.view !== "library") {
    calendarParams.current = { month: url.month, date: url.date, undated: url.undated };
    calendarUrl.current = url;
  }

  // The fade belongs to a page loaded on `?view=calendar` alone, never to a
  // fresh start's later arrival on the calendar.
  const calendarFade = useRef(
    initial.view === "calendar" && url.month === null && url.date === null && !url.undated,
  );

  const loadedWithLibraryQuery =
    new URLSearchParams(search).get("view") === "library";
  const libraryRestore = useRef<(LibraryRestore & { target: string }) | null>(
    initial.view === "library" && loadedWithLibraryQuery && initial.saved.library
      ? { ...initial.saved.library, target: savedTarget }
      : null,
  );

  const flush = useCallback(() => {
    const state: SavedState = {};
    if (saved.current.center) state.center = saved.current.center;
    if (saved.current.zoom !== undefined) state.zoom = saved.current.zoom;
    if (saved.current.pointIds) state.pointIds = saved.current.pointIds;
    const view = viewRef.current;
    if (view === "library") {
      if (libraryPages.current > 0) {
        state.library = {
          loaded: libraryPages.current,
          scrollY: lastScrollY.current,
          by: byRef.current,
          sort: sortRef.current,
        };
      }
      // Switching between faces leaves the calendar's list where it was.
      if (saved.current.list) state.list = saved.current.list;
      if (saved.current.listView) state.listView = saved.current.listView;
    } else {
      const position = (view === "map" ? mapList : calendarList).current;
      if (position && (position.loaded() > PAGE_SIZE || position.scrollY() > 0)) {
        state.list = { loaded: position.loaded(), scrollY: position.scrollY() };
        state.listView = view;
      }
      if (saved.current.library) state.library = saved.current.library;
    }
    if (Object.keys(state).length === 0) clearState(drive);
    else saveState(drive, { ...state, target: targetId.current });
  }, [drive]);

  // A layout cleanup, because it runs before the removed tree leaves the
  // document. A passive one runs after, when the page is already shorter and
  // the scroll position has been clamped to 0.
  useLayoutEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const setView = useCallback(
    (center: [number, number], zoom: number) => {
      saved.current = { ...saved.current, center, zoom };
      flush();
    },
    [flush],
  );
  const setPointIds = useCallback(
    (ids: string[] | null) => {
      const { pointIds: _dropped, ...rest } = saved.current;
      void _dropped;
      saved.current = ids ? { ...rest, pointIds: ids } : rest;
      flush();
    },
    [flush],
  );

  const calendarRestore = useRef(
    initial.view === "calendar" && initial.listOpensFromUrl && initial.saved.list &&
      initial.saved.listView !== "map"
      ? { ...initial.saved.list, target: savedTarget }
      : null,
  );
  const mapRestore = useRef<MapRestore>({
    center: initial.saved.center,
    zoom: initial.saved.zoom,
    pointIds: initial.saved.pointIds,
    list:
      initial.view === "map" && initial.saved.listView !== "calendar" ? initial.saved.list : undefined,
    target: savedTarget,
  });
  const calendarRestored = useCallback(() => {
    calendarRestore.current = null;
  }, []);
  const mapRestored = useCallback(() => {
    mapRestore.current = { ...mapRestore.current, list: undefined };
  }, []);
  const libraryRestored = useCallback(() => {
    libraryRestore.current = null;
  }, []);

  // The views reset from their target key; the saved list positions and pin
  // ids are dropped here because the new target may not hold them.
  const drawnFor = useRef(target.changes);
  useLayoutEffect(() => {
    if (drawnFor.current === target.changes) return;
    drawnFor.current = target.changes;
    calendarList.current = null;
    mapList.current = null;
    libraryPages.current = 0;
    saved.current = { center: saved.current.center, zoom: saved.current.zoom };
    calendarRestore.current = null;
    libraryRestore.current = null;
    mapRestore.current = { center: saved.current.center, zoom: saved.current.zoom };
    flush();
  }, [target.changes, flush]);

  const go = useCallback(
    (mode: "push" | "replace", next: Partial<PageUrl>) => {
      const query = buildPageQuery(next);
      const nextSearch = new URLSearchParams(query).toString();
      ownTarget.current = nextSearch === searchRef.current ? null : nextSearch;
      const href = `${pathname}${query}`;
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, pathname],
  );

  // A URL with no query, reached while the page stays mounted (the sidebar
  // row, Back), starts over: every face is made again. The page's own
  // navigation can also end on such a URL, the calendar after the map, and
  // that one keeps what the views hold.
  const [epoch, setEpoch] = useState(0);
  const lastSearch = useRef(search);
  useLayoutEffect(() => {
    const before = lastSearch.current;
    lastSearch.current = search;
    if (before === search) return;
    const own = ownTarget.current === search;
    ownTarget.current = null;
    if (own || search !== "") return;
    clearState(drive);
    saved.current = {};
    calendarRestore.current = null;
    mapRestore.current = {};
    libraryRestore.current = null;
    libraryPages.current = 0;
    calendarParams.current = { month: null, date: null, undated: false };
    calendarUrl.current = { view: "calendar", month: null, date: null, undated: false };
    calendarFade.current = false;
    setNotAvailable(false);
    setSeen({ library: true, calendar: false, map: false });
    setEpoch((value) => value + 1);
    setCountToken((value) => value + 1);
    go("replace", { view: "library" });
  }, [search, drive, go]);

  // The page opened with no query is the Library, and the URL says so from the
  // first replace on, so a reload and Back both return to it.
  const startFresh = useRef(search === "");
  useEffect(() => {
    if (!startFresh.current) return;
    startFresh.current = false;
    go("replace", { view: "library" });
  }, [go]);

  // A query the page could not read as the calendar is the Library too, and
  // the address is replaced so a reload and Back agree with what is drawn.
  const normalizeLibrary = useRef(
    search !== "" &&
      url.view === "library" &&
      new URLSearchParams(search).get("view") !== "library",
  );
  useEffect(() => {
    if (!normalizeLibrary.current) return;
    normalizeLibrary.current = false;
    go("replace", { view: "library" });
  }, [go]);

  const selectView = (view: string) => {
    if (view === url.view) return;
    const kept = calendarParams.current;
    if (view === "map") go("push", { view: "map", ...kept });
    else if (view === "library") go("push", { view: "library" });
    else go("push", kept);
  };

  const changeBy = useCallback(
    (value: Classification) => {
      setBy(value);
      writeClassification(drive, value);
    },
    [drive],
  );
  const changeSort = useCallback(
    (value: Sort) => {
      setSort(value);
      writeSort(drive, value);
    },
    [drive],
  );
  const onLibraryDepth = useCallback((pages: number) => {
    libraryPages.current = pages;
  }, []);

  const onNotAvailable = useCallback(() => setNotAvailable(true), []);

  if (notAvailable) {
    return (
      <Frame drive={drive}>
        <p className="px-4 py-12 text-center text-sm text-text-muted">{t("notAvailable")}</p>
      </Frame>
    );
  }

  const tabs = (
    <PageTabs
      label={t("view.label")}
      current={url.view}
      onSelect={selectView}
      items={[
        { key: "library", label: t("view.library") },
        { key: "calendar", label: t("view.calendar") },
        { key: "map", label: t("view.map") },
      ]}
    />
  );

  return (
    <Frame
      drive={drive}
      header={
        <AppHeader
          drive={drive}
          icon={Images}
          title={t("nav.label")}
          countDetail={total === null ? null : photoCountText(total, locale, t)}
          tabs={tabs}
          target={{
            drive,
            app: { addon: "photo_diary" },
            name: target.lookingUp ? null : (target.folder?.name ?? t("allPhotos")),
            folders: target.folders,
            selectedId: target.selectedId,
            currentCount: total,
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
      {(url.view === "library" || seen.library) && (
        <div hidden={url.view !== "library"}>
          <LibraryFace
            key={epoch}
            drive={drive}
            target={target.params}
            targetId={target.selectedId}
            targetKey={target.changes}
            ready={target.ready}
            by={by}
            sort={sort}
            onChangeBy={changeBy}
            onChangeSort={changeSort}
            restore={libraryRestore.current}
            onRestored={libraryRestored}
            onDepth={onLibraryDepth}
            onRefreshCount={countChanged}
            onNotAvailable={onNotAvailable}
          />
        </div>
      )}
      {(url.view === "calendar" || seen.calendar) && (
        <div hidden={url.view !== "calendar"}>
          <CalendarView
            key={`${epoch}:${target.changes}`}
            drive={drive}
            active={url.view === "calendar"}
            url={url.view === "library" ? calendarUrl.current : url}
            go={go}
            target={target.params}
            targetId={target.selectedId}
            targetKey={target.changes}
            ready={target.ready}
            positionRef={calendarList}
            restore={calendarRestore.current}
            onRestored={calendarRestored}
            onNotAvailable={onNotAvailable}
            onTotal={reportTotal}
            freshStart={calendarFade.current && target.changes === 0}
          />
        </div>
      )}
      {(url.view === "map" || seen.map) && (
        <div hidden={url.view !== "map"}>
          <MapView
            key={epoch}
            drive={drive}
            active={url.view === "map"}
            target={target.params}
            targetId={target.selectedId}
            targetKey={target.changes}
            ready={target.ready}
            restore={mapRestore.current}
            positionRef={mapList}
            onView={setView}
            onPointIds={setPointIds}
            onRestored={mapRestored}
            onNotAvailable={onNotAvailable}
            onRefresh={countChanged}
          />
        </div>
      )}
    </Frame>
  );
}
