"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { FileGrid } from "@/components/FileGrid";
import { fetchDays, fetchMonths, fetchPhotos } from "./api";
import { isNotFound } from "./lib/errors";
import { LoadError } from "./LoadError";
import { MonthGrid, type DayInfo } from "./MonthGrid";
import { NoteArea } from "./NoteArea";
import { MonthPicker } from "./MonthPicker";
import { PhotoList, type ListPosition } from "./PhotoList";
import { useDayNote } from "./useDayNote";
import { useEditorAvailable } from "./useEditorAvailable";
import { useWide } from "./useWide";
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

type Props = {
  drive: string;
  active: boolean;
  url: PageUrl;
  go: (mode: "push" | "replace", next: Partial<PageUrl>) => void;
  positionRef: MutableRefObject<ListPosition | null>;
  restore: { loaded: number; scrollY: number } | null;
  onRestored: () => void;
  onNotAvailable: () => void;
  onTotal: (total: number) => void;
};

export function CalendarView({
  drive,
  active,
  url,
  go,
  positionRef,
  restore,
  onRestored,
  onNotAvailable,
  onTotal,
}: Props) {
  const t = useTranslations("photoDiary");
  const locale = useLocale();
  const { ref, wide } = useWide<HTMLDivElement>();

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
  const month = months === null ? null : (url.month ?? months.months[0]?.month ?? null);

  useEffect(() => {
    if (!active) return;
    const mine = ++monthsRequest.current;
    fetchMonths(drive).then(
      (result) => {
        if (mine !== monthsRequest.current) return;
        haveMonths.current = true;
        setMonths(result);
        setMonthsFailed(false);
        report("months", true);
        onTotal(photoTotal(result));
      },
      (error: unknown) => {
        if (mine !== monthsRequest.current) return;
        if (isNotFound(error)) onNotAvailable();
        else if (haveMonths.current) report("months", false);
        else setMonthsFailed(true);
      },
    );
  }, [drive, active, token, calendarToken, report, onNotAvailable, onTotal]);

  useEffect(() => {
    if (!active || month === null || nothingDated) return;
    const mine = ++daysRequest.current;
    fetchDays(drive, month).then(
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
  }, [drive, active, month, nothingDated, token, calendarToken, report, onNotAvailable]);

  const undatedCount = months?.undated_count ?? 0;
  const listKind: "day" | "undated" | null =
    months === null
      ? null
      : url.date
        ? "day"
        : url.undated && undatedCount > 0
          ? "undated"
          : null;

  // `go` drops the view from the URL, so only the view on screen may call it.
  useEffect(() => {
    if (active && months !== null && url.undated && undatedCount === 0) go("replace", { month: url.month });
  }, [active, months, url.undated, url.month, undatedCount, go]);

  const fetchIds = useCallback<FetchIds>(
    async (offset, limit) => {
      const result = await fetchPhotos(
        drive,
        listKind === "day" ? { date: url.date ?? undefined, limit, offset } : { undated: true, limit, offset },
      );
      return { ids: result.file_ids, total: result.total };
    },
    [drive, listKind, url.date],
  );

  const listKey = listKind === "day" ? `day:${url.date}` : "undated";
  useEffect(() => {
    if (listKind === null) report("list", true);
  }, [listKind, report]);

  const monthList = useMemo(() => months?.months ?? [], [months]);
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
  const restoreHere = restore !== null && restoreFor === urlListKey ? restore : undefined;
  useEffect(() => {
    if (restoreFor !== null && restoreFor !== urlListKey) onRestored();
  }, [restoreFor, urlListKey, onRestored]);

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
    if (!active || !secondReadDue) return;
    const timer = setTimeout(() => {
      setSecondReadDue(false);
      setToken((value) => value + 1);
    }, SECOND_READ_MS);
    return () => clearTimeout(timer);
  }, [active, secondReadDue]);

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
        <div className="grid gap-6 group-data-[wide=true]/diary:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] group-data-[wide=true]/diary:items-start">
          <div className="grid gap-3 [grid-template-areas:'bar'_'grid'_'undated'] group-data-[wide=true]/diary:grid-cols-[minmax(0,1fr)_auto] group-data-[wide=true]/diary:[grid-template-areas:'bar_undated'_'grid_grid']">
            <div className="relative flex flex-wrap items-center gap-1 [grid-area:bar]">
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

            <div className="[grid-area:grid]">
              {month ? (
                daysFailedFor === month && !daysForMonth ? (
                  <LoadError onRetry={refresh} />
                ) : (
                  <MonthGrid
                    month={month}
                    days={daysForMonth ?? new Map()}
                    openDate={openDate}
                    loading={!daysForMonth}
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
              className="min-w-0"
            >
              {({ files, moreMayFollow }) => (
                <FileGrid files={files} moreMayFollow={moreMayFollow} onRefresh={refresh} />
              )}
            </PhotoList>
          )}
        </div>
      )}
    </div>
  );
}
