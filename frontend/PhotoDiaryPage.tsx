"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Images } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCurrentDrive } from "@/components/CurrentDriveProvider";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { CalendarView } from "./CalendarView";
import { MapView, type MapRestore } from "./MapView";
import type { ListPosition } from "./PhotoList";
import { buildPageQuery, parsePageUrl, type PageUrl } from "./lib/pageUrl";
import { clearState, loadState, saveState, type SavedState } from "./lib/savedState";
import { fetchMonths } from "./api";
import { isNotFound } from "./lib/errors";
import { photoTotal } from "./lib/total";
import { PAGE_SIZE } from "./usePagedPhotos";

type View = PageUrl["view"];

export default function PhotoDiaryPage() {
  const drive = useCurrentDrive();
  if (drive === null) return <Frame />;
  return <Session key={drive} drive={drive} />;
}

function Frame({
  drive,
  total,
  tabs,
  children,
}: {
  drive?: string;
  total?: number | null;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTranslations("photoDiary");
  const scope =
    drive === undefined ? undefined : total == null ? drive : t("scope", { drive, count: total });
  return (
    <PageFrame
      width="wide"
      header={<PageHeader titleIcon={Images} title={t("nav.label")} scope={scope} tabs={tabs} />}
    >
      {children}
    </PageFrame>
  );
}

function Session({ drive }: { drive: string }) {
  const t = useTranslations("photoDiary");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = useMemo(() => parsePageUrl(`?${search}`), [search]);

  const [notAvailable, setNotAvailable] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [seen, setSeen] = useState({ calendar: url.view === "calendar", map: url.view === "map" });
  useEffect(() => {
    setSeen((current) => (current[url.view] ? current : { ...current, [url.view]: true }));
  }, [url.view]);

  // The calendar reports the count while it is the view; on the map nothing
  // else would, so the page reads it itself on each entry. What was last
  // known stays on screen meanwhile and when the read fails. An answer to an
  // earlier entry is dropped, so a slow one cannot overwrite a newer count.
  const onMap = url.view === "map";
  const [countToken, setCountToken] = useState(0);
  const countChanged = useCallback(() => setCountToken((value) => value + 1), []);
  useEffect(() => {
    if (!onMap) return;
    let current = true;
    fetchMonths(drive).then(
      (months) => {
        if (current) setTotal(photoTotal(months));
      },
      (error: unknown) => {
        if (current && isNotFound(error)) setNotAvailable(true);
      },
    );
    return () => {
      current = false;
    };
  }, [drive, onMap, countToken]);

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

  const saved = useRef<SavedState>(initial.saved);
  const calendarList = useRef<ListPosition | null>(null);
  const mapList = useRef<ListPosition | null>(null);
  const viewRef = useRef<View>(url.view);
  viewRef.current = url.view;

  const flush = useCallback(() => {
    const state: SavedState = {};
    if (saved.current.center) state.center = saved.current.center;
    if (saved.current.zoom !== undefined) state.zoom = saved.current.zoom;
    if (saved.current.pointIds) state.pointIds = saved.current.pointIds;
    const view = viewRef.current;
    const position = (view === "map" ? mapList : calendarList).current;
    if (position && (position.loaded() > PAGE_SIZE || position.scrollY() > 0)) {
      state.list = { loaded: position.loaded(), scrollY: position.scrollY() };
      state.listView = view;
    }
    if (Object.keys(state).length > 0) saveState(drive, state);
    else clearState(drive);
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
      ? initial.saved.list
      : null,
  );
  const mapRestore = useRef<MapRestore>({
    center: initial.saved.center,
    zoom: initial.saved.zoom,
    pointIds: initial.saved.pointIds,
    list:
      initial.view === "map" && initial.saved.listView !== "calendar" ? initial.saved.list : undefined,
  });
  const calendarRestored = useCallback(() => {
    calendarRestore.current = null;
  }, []);
  const mapRestored = useCallback(() => {
    mapRestore.current = { ...mapRestore.current, list: undefined };
  }, []);

  // A URL with no query, reached while the page stays mounted (the sidebar
  // row, Back), starts over: both views are made again. The page's own
  // navigation can also end on such a URL, the calendar after the map, and
  // that one keeps what the views hold.
  const [epoch, setEpoch] = useState(0);
  const lastSearch = useRef(search);
  const ownTarget = useRef<string | null>(null);
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
    setNotAvailable(false);
    setSeen({ calendar: true, map: false });
    setEpoch((value) => value + 1);
  }, [search, drive]);

  const searchRef = useRef(search);
  searchRef.current = search;
  const go = useCallback(
    (mode: "push" | "replace", next: Partial<PageUrl>) => {
      const query = buildPageQuery(next);
      const target = new URLSearchParams(query).toString();
      ownTarget.current = target === searchRef.current ? null : target;
      const href = `${pathname}${query}`;
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, pathname],
  );

  const selectView = (view: string) => {
    if (view === url.view) return;
    const kept = { month: url.month, date: url.date, undated: url.undated };
    go("push", view === "map" ? { view: "map", ...kept } : kept);
  };

  const onNotAvailable = useCallback(() => setNotAvailable(true), []);

  if (notAvailable) {
    return (
      <Frame drive={drive}>
        <p className="px-4 py-12 text-center text-sm text-text-muted">{t("notAvailable")}</p>
      </Frame>
    );
  }

  return (
    <Frame
      drive={drive}
      total={total}
      tabs={
        <PageTabs
          label={t("view.label")}
          current={url.view}
          onSelect={selectView}
          items={[
            { key: "calendar", label: t("view.calendar") },
            { key: "map", label: t("view.map") },
          ]}
        />
      }
    >
      {(url.view === "calendar" || seen.calendar) && (
        <div hidden={url.view !== "calendar"}>
          <CalendarView
            key={epoch}
            drive={drive}
            active={url.view === "calendar"}
            url={url}
            go={go}
            positionRef={calendarList}
            restore={calendarRestore.current}
            onRestored={calendarRestored}
            onNotAvailable={onNotAvailable}
            onTotal={setTotal}
          />
        </div>
      )}
      {(url.view === "map" || seen.map) && (
        <div hidden={url.view !== "map"}>
          <MapView
            key={epoch}
            drive={drive}
            active={url.view === "map"}
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
