export type PageUrl = {
  view: "calendar" | "map";
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

/** The rows of the page URL table that need no server data. */
export function parsePageUrl(search: string): PageUrl {
  const params = new URLSearchParams(search);
  const date = params.get("date");
  const month = params.get("month");
  const realDate = isRealDate(date) ? date : null;
  return {
    view: params.get("view") === "map" ? "map" : "calendar",
    month: realDate ? realDate.slice(0, 7) : isRealMonth(month) ? month : null,
    date: realDate,
    undated: realDate === null && params.get("undated") === "true",
  };
}

export function buildPageQuery(url: Partial<PageUrl>): string {
  const params = new URLSearchParams();
  if (url.view === "map") params.set("view", "map");
  if (url.month) params.set("month", url.month);
  if (url.date) params.set("date", url.date);
  else if (url.undated) params.set("undated", "true");
  const query = params.toString();
  return query ? `?${query}` : "";
}
