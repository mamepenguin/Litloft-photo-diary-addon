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
import { readLegacyGroup, readTargetView, writeTargetView, type TargetView } from "@/lib/appPrefs";
import { CalendarView } from "./CalendarView";
import { LibraryFace } from "./LibraryFace";
import { MapView, type MapRestore } from "./MapView";
import type { ListPosition } from "./PhotoList";
import { buildPageQuery, parsePageUrl, type PageUrl } from "./lib/pageUrl";
import {
  CLASSIFICATIONS,
  SORTS,
  parseChosenTags,
  readLegacySort,
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
type TagOverride = { from: string; tags: string[] };

const APP = { addon: "photo_diary" } as const;

function offered<T extends string>(allowed: readonly T[], value: string | null | undefined): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  const one = a.map((tag) => tag.toLowerCase());
  const two = b.map((tag) => tag.toLowerCase());
  return one.length === two.length && one.every((tag, index) => tag === two[index]);
}

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
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const url = useMemo(() => parsePageUrl(`?${search}`), [search]);
  const [initialTarget] = useState(() => searchParams.get("target"));
  const [tagOverride, setTagOverride] = useState<TagOverride | null>(null);
  const [libraryTags, setLibraryTags] = useState<string[]>(() =>
    url.view === "library" ? parseChosenTags(search) : [],
  );
  const searchRef = useRef(search);
  searchRef.current = search;

  // A pending Home shortcut leaves the URL once applied or ignored. A Target
  // choice made by it drops the tag in the same replace, and the chosen tags
  // read as empty from then until the URL reflects it.
  const onTargetHandled = useCallback(
    (choice: boolean) => {
      const current = new URLSearchParams(window.location.search);
      current.delete("target");
      if (choice) {
        current.delete("tag");
        setTagOverride({ from: searchRef.current, tags: [] });
        setLibraryTags([]);
      }
      const next = current.toString();
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    },
    [pathname, router],
  );

  const target = useTarget(drive, initialTarget, onTargetHandled);
  const targetId = useRef(target.selectedId);
  targetId.current = target.selectedId;
  // Leaving under a failed evaluation or a too-large set writes nothing, so the
  // state the visit read is still there on the way back.
  const noSave = useRef(false);
  noSave.current = target.failed || target.tooLarge;

  // The Library keeps its tags while another face is open, so going back to
  // it asks for nothing new; the array keeps its identity while its values do.
  const urlTags = useMemo(
    () => (url.view === "library" ? parseChosenTags(`?${search}`) : null),
    [search, url.view],
  );
  const previousTags = useRef<string[]>([]);
  const tags = useMemo(() => {
    const next =
      tagOverride !== null && tagOverride.from === search
        ? tagOverride.tags
        : (urlTags ?? libraryTags);
    const previous = previousTags.current;
    return sameTags(previous, next) ? previous : next;
  }, [tagOverride, search, urlTags, libraryTags]);
  previousTags.current = tags;
  useEffect(() => {
    if (tagOverride !== null && tagOverride.from !== search) setTagOverride(null);
  }, [search, tagOverride]);
  useEffect(() => {
    if (url.view === "library" && !sameTags(libraryTags, tags)) setLibraryTags([...tags]);
  }, [url.view, tags, libraryTags]);

  const storedView = useMemo(
    () => readTargetView(APP, drive, target.selectedId),
    [drive, target.selectedId],
  );
  const legacyGroup = target.selectedId === "default" ? readLegacyGroup(drive, APP) : null;
  const legacySort = target.selectedId === "default" ? readLegacySort(drive) : null;
  const [viewChoice, setViewChoice] = useState<{
    drive: string;
    targetId: string;
    view: TargetView;
  } | null>(null);
  const view = useMemo(() => {
    const held =
      viewChoice !== null && viewChoice.drive === drive && viewChoice.targetId === target.selectedId
        ? { ...storedView, ...viewChoice.view }
        : storedView;
    const group =
      offered(CLASSIFICATIONS, held.group) ??
      offered(CLASSIFICATIONS, legacyGroup) ??
      "month";
    const sort = offered(SORTS, held.sort) ?? offered(SORTS, legacySort) ?? "newest";
    return { group, sort } as { group: Classification; sort: Sort };
  }, [viewChoice, drive, target.selectedId, storedView, legacyGroup, legacySort]);
  const byRef = useRef(view.group);
  byRef.current = view.group;
  const sortRef = useRef(view.sort);
  sortRef.current = view.sort;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;

  const [notAvailable, setNotAvailable] = useState(false);
  // A write through any face's context menu. The faces stay mounted while
  // hidden, so a counter is the only thing that tells them a write happened on
  // another face. The face that wrote takes the number it produced, so it reads
  // again once for its own write and not once more when it is shown.
  const writeCount = useRef(0);
  const [writes, setWrites] = useState(0);
  const noteWrite = useCallback(() => {
    writeCount.current += 1;
    setWrites(writeCount.current);
    return writeCount.current;
  }, []);
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
    (target.fileIds !== null
      ? fetchMonths(drive, params ?? undefined, target.fileIds)
      : params
        ? fetchMonths(drive, params)
        : fetchMonths(drive)
    ).then(
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
  }, [drive, countsItself, countToken, target.ready, target.changes, target.params, target.fileIds]);

  // A URL with no query is a fresh start however it was reached, and so is one
  // whose only parameter is a Home shortcut's `target`.
  const [initial] = useState(() => {
    const onlyTarget =
      search !== "" &&
      [...new URLSearchParams(search).keys()].every((key) => key === "target") &&
      new URLSearchParams(search).has("target");
    if (search === "" || onlyTarget) {
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
    if (noSave.current) return;
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
          tags: [...tagsRef.current],
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
      let query = buildPageQuery(next);
      // The page's own replaces keep the chosen tags and a pending id; a
      // navigation (a tab) drops both, as the URL it names has neither.
      if (mode === "replace") {
        const params = new URLSearchParams(query);
        if (next.view === "library") {
          for (const tag of tagsRef.current) params.append("tag", tag);
        }
        if (target.pendingId !== null) params.set("target", target.pendingId);
        query = `?${params.toString()}`;
      }
      const nextSearch = new URLSearchParams(query).toString();
      ownTarget.current = nextSearch === searchRef.current ? null : nextSearch;
      const href = `${pathname}${query}`;
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, pathname, target.pendingId],
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
    setTagOverride(null);
    setLibraryTags([]);
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

  // A pending id leaves unwritten on another navigation; the page's own
  // replaces carry it, so only a URL that no longer names it drops it.
  useEffect(() => {
    if (target.pendingId === null) return;
    if (new URLSearchParams(search).get("target") !== target.pendingId) target.dropPending();
  }, [search, target.pendingId, target.dropPending]);

  const selectView = (view: string) => {
    if (view === url.view) return;
    const kept = calendarParams.current;
    if (view === "map") go("push", { view: "map", ...kept });
    else if (view === "library") {
      const params = new URLSearchParams({ view: "library" });
      for (const tag of libraryTags) params.append("tag", tag);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    } else go("push", kept);
  };

  const changeBy = useCallback(
    (value: Classification) => {
      writeTargetView(APP, drive, target.selectedId, { group: value });
      setViewChoice((held) => ({
        drive,
        targetId: target.selectedId,
        view: {
          ...(held !== null && held.drive === drive && held.targetId === target.selectedId
            ? held.view
            : {}),
          group: value,
        },
      }));
    },
    [drive, target.selectedId],
  );
  const changeSort = useCallback(
    (value: Sort) => {
      writeTargetView(APP, drive, target.selectedId, { sort: value });
      setViewChoice((held) => ({
        drive,
        targetId: target.selectedId,
        view: {
          ...(held !== null && held.drive === drive && held.targetId === target.selectedId
            ? held.view
            : {}),
          sort: value,
        },
      }));
    },
    [drive, target.selectedId],
  );

  // A Target choice drops the tag in the same replace; the chosen tags read as
  // empty from it on, until the URL reflects the replace.
  const chooseTarget = useCallback(
    (id: string) => {
      if (target.pendingId !== null) {
        if (id === target.pendingId) return;
      } else if (id === target.selectedId) {
        // The row in force is not a choice: it saves the row the viewer picked
        // (the saved id may still name a target that fell back) and keeps the tag.
        target.choose(id);
        return;
      }
      const params = new URLSearchParams(search);
      params.delete("tag");
      params.delete("target");
      setTagOverride({ from: search, tags: [] });
      setLibraryTags([]);
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, {
        scroll: false,
      });
      target.choose(id);
    },
    [search, pathname, router, target],
  );

  const replaceTags = useCallback(
    (next: readonly string[]) => {
      const params = new URLSearchParams(search);
      params.delete("tag");
      for (const tag of next) params.append("tag", tag);
      setTagOverride({ from: search, tags: [...next] });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [search, pathname, router],
  );
  const toggleTag = useCallback(
    (name: string) => {
      const held = tags.some((tag) => tag.toLowerCase() === name.toLowerCase());
      replaceTags(
        held ? tags.filter((tag) => tag.toLowerCase() !== name.toLowerCase()) : [...tags, name],
      );
    },
    [tags, replaceTags],
  );
  const clearTags = useCallback(() => replaceTags([]), [replaceTags]);
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
            homeEntry: target.known ? "photo_diary" : undefined,
            name: target.lookingUp ? null : (target.name ?? t("allPhotos")),
            folders: target.folders,
            collections: { list: target.collections, retry: target.retryCollections },
            selectedId: target.selectedId,
            currentCount: total,
            label: t("target"),
            defaultLabel: t("allPhotos"),
            unavailableLabel: t("targetUnavailable"),
            defaultTargetTypes: ["image"],
            isUsable: target.isUsable,
            onChoose: chooseTarget,
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
            fileIds={target.fileIds}
            targetId={target.selectedId}
            targetKey={target.changes}
            targetKnown={target.known}
            ready={target.ready}
            targetFailed={target.failed}
            targetTooLarge={target.tooLarge}
            onRetryTarget={target.retryTarget}
            active={url.view === "library"}
            writeToken={writes}
            onWrite={noteWrite}
            by={view.group}
            sort={view.sort}
            onChangeBy={changeBy}
            onChangeSort={changeSort}
            tags={tags}
            onToggleTag={toggleTag}
            onClearTags={clearTags}
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
            writeToken={writes}
            url={url.view === "library" ? calendarUrl.current : url}
            go={go}
            target={target.params}
            fileIds={target.fileIds}
            targetId={target.selectedId}
            targetKey={target.changes}
            ready={target.ready}
            targetFailed={target.failed}
            targetTooLarge={target.tooLarge}
            onRetryTarget={target.retryTarget}
            positionRef={calendarList}
            restore={calendarRestore.current}
            onRestored={calendarRestored}
            onNotAvailable={onNotAvailable}
            onTotal={reportTotal}
            onWrite={noteWrite}
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
            writeToken={writes}
            target={target.params}
            fileIds={target.fileIds}
            targetId={target.selectedId}
            targetKey={target.changes}
            ready={target.ready}
            targetFailed={target.failed}
            targetTooLarge={target.tooLarge}
            onRetryTarget={target.retryTarget}
            restore={mapRestore.current}
            positionRef={mapList}
            onView={setView}
            onPointIds={setPointIds}
            onRestored={mapRestored}
            onNotAvailable={onNotAvailable}
            onRefresh={countChanged}
            onWrite={noteWrite}
          />
        </div>
      )}
    </Frame>
  );
}
