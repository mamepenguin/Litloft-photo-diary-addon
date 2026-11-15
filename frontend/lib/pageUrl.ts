export type PageFace = "library" | "calendar" | "map";

export type PageUrl = {
  view: PageFace;
  month: string | null;
  date: string | null;
  undated: boolean;
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRealMonth(value: string | null): value is string {
  return value !== null && MONTH.test(value);
}

export function isRealDate(value: string | null): value is string {
  if (value === null) return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const probe = new Date(0);
  probe.setUTCFullYear(year, month, 0);
  return day <= probe.getUTCDate();
}

const LIBRARY: PageUrl = { view: "library", month: null, date: null, undated: false };

/** The rows of the page URL table that need no server data. */
export function parsePageUrl(search: string): PageUrl {
  const params = new URLSearchParams(search);
  const rawDate = params.get("date");
  const date = isRealDate(rawDate) ? rawDate : null;
  const rawMonth = params.get("month");
  const month = date ? date.slice(0, 7) : isRealMonth(rawMonth) ? rawMonth : null;
  const undated = date === null && params.get("undated") === "true";
  const view = params.get("view");
  // An old-form URL, made before the face lived in `view`, carried only the
  // calendar's own parameters.
  const calendarish = month !== null || date !== null || undated;
  const face: PageFace =
    view === "map" || view === "library" || view === "calendar"
      ? view
      : view === null && calendarish
        ? "calendar"
        : "library";
  // A Library URL carries none of the calendar's parameters, so a stale one
  // cannot reach the face that never shows a day.
  if (face === "library") return LIBRARY;
  return { view: face, month, date, undated };
}

/**
 * `view` names the face; an omitted one is the calendar, whose own controls
 * change only its parameters. A Library URL drops the calendar's parameters.
 */
export function buildPageQuery(url: Partial<PageUrl>): string {
  const params = new URLSearchParams();
  params.set("view", url.view ?? "calendar");
  if (url.view === "library") return `?${params.toString()}`;
  if (url.month) params.set("month", url.month);
  if (url.date) params.set("date", url.date);
  else if (url.undated) params.set("undated", "true");
  return `?${params.toString()}`;
}
