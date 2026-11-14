"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { FileGrid } from "@/components/FileGrid";
import { fetchDays, fetchMonths, fetchPhotos, type TargetParams } from "./api";
import { isNotFound } from "./lib/errors";
import { LoadError } from "./LoadError";
import { MonthGrid, type DayInfo } from "./MonthGrid";
import { NoteArea } from "./NoteArea";
import { MonthPicker } from "./MonthPicker";
import { DayPreviewImage } from "./DayPreview";
import { PhotoList, type ListPosition } from "./PhotoList";
import { useDayNote } from "./useDayNote";
import { useDayPreview } from "./useDayPreview";
import { useEditorAvailable } from "./useEditorAvailable";
import { appHeaderHeight, useHeldColumn, useReachedHeader } from "./usePinned";
import { useWide } from "./useWide";
import { STRIP_HEIGHT, STRIP_REACH, WeekStrip } from "./WeekStrip";
import { formatListDate, formatMonth, localToday } from "./lib/dates";
import { photoTotal } from "./lib/total";
import type { PageUrl } from "./lib/pageUrl";
import type { FetchIds } from "./usePagedPhotos";

type Months = { months: { month: string; count: number }[]; undated_count: number };
type Days = { month: string; byDate: ReadonlyMap<string, DayInfo> };

// The editor autosaves after 2 s and sends its last save on leaving without
// waiting for it, so the first read after coming back can overtake that save.
const SECOND_READ_MS = 3000;
const NO_DAYS: ReadonlyMap<string, DayInfo> = new Map();
// The stylesheet generator reads class names as written, so the 16 here is HOLD_GAP spelled out.
const HELD = "group-data-[wide=true]/diary:sticky group-data-[wide=true]/diary:top-[calc(var(--app-header-h,0px)+16px)]";

type Props = {
  drive: string;
  active: boolean;
  url: PageUrl;
  go: (mode: "push" | "replace", next: Partial<PageUrl>) => void;
  /** The target the photo routes take; `null` is the default target. */
  target: TargetParams | null;
  targetId: string;
  targetKey: number;
  /** Whether the target has been resolved; no photo request goes out before it has. */
  ready: boolean;
  positionRef: MutableRefObject<ListPosition | null>;
  restore: { loaded: number; scrollY: number; target: string } | null;
  onRestored: () => void;
  onNotAvailable: () => void;
  /** The answer's total and the target token its request was made under. */
  onTotal: (total: number, changes: number) => void;
  /** The page was opened with no query, so the first month drawn fades in. */
  freshStart: boolean;
};

export function CalendarView({
  drive,
  active,
  url,
  go,
  target,
  targetId,
  targetKey,
  ready,
  positionRef,
  restore,
  onRestored,
  onNotAvailable,
  onTotal,
  freshStart,
}: Props) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const { ref, wide } = useWide<HTMLDivElement>();
  const column = useHeldColumn(active);
  const gridArea = useRef<HTMLDivElement | null>(null);
  const monthBar = useRef<HTMLDivElement | null>(null);
  const scrollOnSettle = useRef<string | null>(null);

  const [months, setMonths] = useState<Months | null>(null);
  const [monthsFailed, setMonthsFailed] = useState(false);
  const [days, setDays] = useState<Days | null>(null);
  const [daysFailedFor, setDaysFailedFor] = useState<string | null>(null);
  const [failures, setFailures] = useState<ReadonlySet<string>>(new Set());
  // `token` re-reads the notes, months and days; `listToken` also re-reads the photo list.
  const [token, setToken] = useState(0);
  const [listToken, setListToken] = useState(0);
  const refresh = useCallback(() => {
    setToken((value) => value + 1);
    setListToken((value) => value + 1);
  }, []);
  const [calendarToken, setCalendarToken] = useState(0);
  const refreshCalendar = useCallback(() => setCalendarToken((value) => value + 1), []);

  const report = useCallback((key: string, ok: boolean) => {
    setFailures((current) => {
      if (current.has(key) === !ok) return current;
      const next = new Set(current);
      if (ok) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Of overlapping requests only the latest applies.
  const monthsRequest = useRef(0);
  const daysRequest = useRef(0);
  const haveMonths = useRef(false);
  const haveDaysFor = useRef<string | null>(null);

  const nothingDated = months !== null && months.months.length === 0;
  const monthList = useMemo(() => months?.months ?? [], [months]);
  // The month in the URL is drawn even when the new target has nothing there,
  // so the screen and the address agree; only a URL with no month takes the
  // target's newest.
  const month = months === null ? null : (url.month ?? monthList[0]?.month ?? null);

  useEffect(() => {
    if (!active || !ready) return;
    const mine = ++monthsRequest.current;
    (target ? fetchMonths(drive, target) : fetchMonths(drive)).then(
      (result) => {
        if (mine !== monthsRequest.current) return;
        haveMonths.current = true;
        setMonths(result);
        setMonthsFailed(false);
        report("months", true);
        onTotal(photoTotal(result), targetKey);
      },
      (error: unknown) => {
        if (mine !== monthsRequest.current) return;
        if (isNotFound(error)) onNotAvailable();
        else if (haveMonths.current) report("months", false);
        else setMonthsFailed(true);
      },
    );
  }, [drive, active, ready, target, targetKey, token, calendarToken, report, onNotAvailable, onTotal]);

  useEffect(() => {
    if (!active || !ready || month === null || nothingDated) return;
    const mine = ++daysRequest.current;
    (target ? fetchDays(drive, month, target) : fetchDays(drive, month)).then(
      (result) => {
        if (mine !== daysRequest.current) return;
        haveDaysFor.current = month;
        setDays({
          month,
          byDate: new Map(result.days.map((d) => [d.date, { count: d.count, hasNote: d.has_note === true }])),
        });
        setDaysFailedFor(null);
        report("days", true);
      },
      (error: unknown) => {
        if (mine !== daysRequest.current) return;
        if (isNotFound(error)) onNotAvailable();
        else if (haveDaysFor.current === month) report("days", false);
        else setDaysFailedFor(month);
      },
    );
  }, [drive, active, ready, month, nothingDated, target, token, calendarToken, report, onNotAvailable]);

  const undatedCount = months?.undated_count ?? 0;
  const listKind: "day" | "undated" | null = url.date
    ? "day"
    : months !== null && url.undated && undatedCount > 0
      ? "undated"
      : null;

  // `go` drops the view from the URL, so only the view on screen may call it.
  useEffect(() => {
    if (active && months !== null && url.undated && undatedCount === 0) go("replace", { month: url.month });
  }, [active, months, url.undated, url.month, undatedCount, go]);

  const fetchIds = useCallback<FetchIds>(
    async (offset, limit) => {
      // The day's note is read while the target is looked up; its photos are not.
      if (!ready) return new Promise<{ ids: string[]; total: number }>(() => {});
      const result = await fetchPhotos(
        drive,
        listKind === "day"
          ? { ...(target ?? {}), date: url.date ?? undefined, limit, offset }
          : { ...(target ?? {}), undated: true, limit, offset },
      );
      return { ids: result.file_ids, total: result.total };
    },
    [drive, ready, listKind, url.date, target],
  );

  const listKey = listKind === "day" ? `day:${url.date}` : "undated";
  useEffect(() => {
    if (listKind === null) report("list", true);
  }, [listKind, report]);

  const previous = month ? monthList.find((m) => m.month < month) : undefined;
  const next = month ? [...monthList].reverse().find((m) => m.month > month) : undefined;

  const daysForMonth = nothingDated ? NO_DAYS : days && days.month === month ? days.byDate : null;
  const openDate = listKind === "day" ? url.date : null;

  const marked =
    openDate !== null && month !== null && daysForMonth !== null && openDate.startsWith(month)
      ? (daysForMonth.get(openDate)?.hasNote ?? false)
      : null;

  // The saved position belongs to the list the page was opened on.
  const urlListKey = url.date ? `day:${url.date}` : url.undated ? "undated" : null;
  const [restoreFor] = useState(restore === null ? null : urlListKey);
  const restoreHere =
    ready && restore !== null && restoreFor === urlListKey && restore.target === targetId
      ? restore
      : undefined;
  useEffect(() => {
    if (!ready || restore === null) return;
    if (restoreFor !== urlListKey || restore.target !== targetId) onRestored();
  }, [ready, restore, restoreFor, urlListKey, targetId, onRestored]);

  const preview = useDayPreview({ drive, active, month, version: days, target, targetKey });

  const stripEligible = active && !wide && openDate !== null && daysForMonth !== null;
  const marker = useReachedHeader(stripEligible, STRIP_REACH);
  const stripShown = stripEligible && marker.reached;

  // While a day pressed in the strip loads, the old list is gone and the new one
  // is short; the page keeps its height so the scroll position does not clamp and
  // the strip stays where it is.
  const content = useRef<HTMLDivElement | null>(null);
  const releaseHeight = () => {
    if (content.current) content.current.style.minHeight = "";
  };
  const stripPick = (date: string) => {
    if (date === openDate) return;
    scrollOnSettle.current = date;
    if (content.current) content.current.style.minHeight = `${content.current.offsetHeight}px`;
    go("push", { month, date });
  };
  useEffect(() => {
    if (scrollOnSettle.current !== null && scrollOnSettle.current !== url.date) {
      scrollOnSettle.current = null;
      releaseHeight();
    }
  }, [url.date]);
  // The list is the first thing in its element, so its top is its heading's.
  const listSettled = (list: HTMLElement) => {
    if (scrollOnSettle.current === null || scrollOnSettle.current !== url.date) return;
    scrollOnSettle.current = null;
    const top = window.scrollY + list.getBoundingClientRect().top - appHeaderHeight() - STRIP_HEIGHT;
    window.scrollTo({ top, behavior: "instant" });
    releaseHeight();
  };
  const stripBack = () => {
    const bar = monthBar.current;
    if (bar) {
      window.scrollTo({
        top: window.scrollY + bar.getBoundingClientRect().top - appHeaderHeight(),
        behavior: "instant",
      });
    }
    gridArea.current?.querySelector<HTMLElement>(`button[data-date="${openDate}"]`)?.focus({ preventScroll: true });
  };

  const editorAvailable = useEditorAvailable(drive);
  const note = useDayNote({
    drive,
    date: openDate,
    active,
    token,
    refresh,
    marked,
    onStateChanged: refreshCalendar,
    onNotAvailable,
  });

  const [secondReadDue, setSecondReadDue] = useState(url.date !== null);
  useEffect(() => {
    if (!active || !ready || !secondReadDue) return;
    const timer = setTimeout(() => {
      setSecondReadDue(false);
      setToken((value) => value + 1);
    }, SECOND_READ_MS);
    return () => clearTimeout(timer);
  }, [active, ready, secondReadDue]);

  const goToday = () => {
    const today = localToday();
    if (url.date !== today) go("push", { month: today.slice(0, 7), date: today });
  };

  const closeList = () => go("push", { month });
  const closeEmptyUndated = useCallback(() => {
    if (active) go("replace", { month: url.month });
  }, [active, go, url.month]);
  const onListResult = useCallback((ok: boolean) => report("list", ok), [report]);

  return (
    <div ref={ref} data-wide={wide} className="group/diary px-4 pb-6">
      {failures.size > 0 && <LoadError onRetry={refresh} />}

      {monthsFailed && <LoadError onRetry={refresh} />}

      {months === null && !monthsFailed && (
        <div className="h-64 animate-pulse rounded-xl bg-bg-elevated" aria-busy="true" />
      )}

      {months !== null && (
        <div ref={content} className="grid content-start group-data-[wide=true]/diary:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] group-data-[wide=true]/diary:items-start group-data-[wide=true]/diary:gap-6">
          <div
            ref={column.ref}
            className={`grid gap-3 [grid-template-areas:'bar'_'grid'_'undated'] group-data-[wide=true]/diary:grid-cols-[minmax(0,1fr)_auto] group-data-[wide=true]/diary:[grid-template-areas:'bar_undated'_'grid_grid'] ${
              column.fits ? HELD : ""
            }`}
          >
            <div ref={monthBar} className="relative flex flex-wrap items-center gap-1 [grid-area:bar]">
              {month && (
                <>
                  <Button
                    iconOnly
                    variant="ghost"
                    aria-label={t("month.previous")}
                    disabled={!previous}
                    onClick={() => previous && go("replace", { month: previous.month })}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </Button>
                  <h2 className="whitespace-nowrap text-lg font-bold text-text-primary">{formatMonth(month, locale)}</h2>
                  {monthList.length > 0 && (
                    <MonthPicker
                      months={monthList}
                      current={month}
                      onChoose={(chosen) => go("replace", { month: chosen })}
                    />
                  )}
                  <Button
                    iconOnly
                    variant="ghost"
                    aria-label={t("month.next")}
                    disabled={!next}
                    onClick={() => next && go("replace", { month: next.month })}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={goToday}>
                {t("calendar.today")}
              </Button>
            </div>

            <div ref={gridArea} className="[grid-area:grid]">
              {month ? (
                daysFailedFor === month && !daysForMonth ? (
                  <LoadError onRetry={refresh} />
                ) : (
                  <MonthGrid
                    month={month}
                    days={daysForMonth ?? new Map()}
                    openDate={openDate}
                    loading={!daysForMonth}
                    active={active}
                    freshStart={freshStart}
                    preview={preview}
                    onPick={(date) => {
                      if (date !== openDate) go("push", { month, date });
                    }}
                  />
                )
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-text-muted">
                  <CalendarOff size={24} aria-hidden="true" />
                  <p className="text-sm">{t("noDatedPhotos")}</p>
                </div>
              )}
            </div>

            {undatedCount > 0 && (
              <div className="[grid-area:undated]">
                <Button
                  className={`border-2 ${listKind === "undated" ? "border-accent" : "border-transparent"}`}
                  aria-pressed={listKind === "undated"}
                  onClick={() => {
                    if (listKind !== "undated") go("push", { month, undated: true });
                  }}
                >
                  <span>{t("undated")}</span>
                  <span className="text-text-muted">{undatedCount}</span>
                </Button>
              </div>
            )}
          </div>

          {stripEligible && !wide && (
            // 57 is STRIP_REACH, spelled out for the stylesheet generator.
            <div ref={marker.ref} className="sticky top-[calc(var(--app-header-h,0px)+57px)] z-20 h-0">
              {stripShown && daysForMonth && openDate && month && (
                <WeekStrip month={month} openDate={openDate} days={daysForMonth} onPick={stripPick} onBack={stripBack} />
              )}
            </div>
          )}

          {listKind !== null && (
            <PhotoList
              key={listKey}
              listKey={listKey}
              fetchIds={fetchIds}
              refreshToken={listToken}
              active={active}
              scroller="window"
              restore={restoreHere}
              note={
                listKind === "day" ? (
                  <NoteArea drive={drive} note={note} editorAvailable={editorAvailable} />
                ) : undefined
              }
              noteSettled={listKind === "day" ? note.settled : undefined}
              onSettled={listSettled}
              headingOffset={stripShown ? STRIP_HEIGHT : 0}
              positionRef={positionRef}
              emptyMessage={listKind === "day" ? t("noPhotosOnDay") : undefined}
              onEmpty={listKind === "undated" ? closeEmptyUndated : undefined}
              heading={(total) => (
                <h2 className="text-lg font-bold text-text-primary">
                  {listKind === "day" && url.date ? formatListDate(url.date, locale) : t("undated")}
                  {total !== null && total > 0 && (
                    <span className="ml-2 text-sm font-normal text-text-muted">
                      {t("list.headingCount", { count: total })}
                    </span>
                  )}
                </h2>
              )}
              onClose={closeList}
              onNotAvailable={onNotAvailable}
              onRefreshResult={onListResult}
              onRestored={onRestored}
              className="min-w-0 group-data-[wide=false]/diary:mt-6"
            >
              {({ files, moreMayFollow }) => (
                <FileGrid files={files} moreMayFollow={moreMayFollow} onRefresh={refresh} />
              )}
            </PhotoList>
          )}
        </div>
      )}
      {preview.view && (
        <DayPreviewImage view={preview.view} onLoad={preview.imageLoaded} onError={preview.imageFailed} />
      )}
    </div>
  );
}
