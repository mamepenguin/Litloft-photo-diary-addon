import type { MemberFileIds, TargetParams } from "../api";

export const CLASSIFICATIONS = ["month", "tag", "collection", "folder"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const SORTS = ["newest", "oldest"] as const;
export type Sort = (typeof SORTS)[number];

export const DEFAULT_CLASSIFICATION: Classification = "month";
export const DEFAULT_SORT: Sort = "newest";

export type Shelf = {
  key: string;
  label: string;
  count: number;
  file_ids: string[];
};

export type ShelvesPage = { shelves: Shelf[]; total: number };

export type ShelvesQuery = {
  target: TargetParams | null;
  fileIds?: MemberFileIds | null;
  by: Classification;
  sort: Sort;
  per_shelf: number;
  shelf_limit: number;
  offset: number;
};

export type ShelfQuery = {
  target: TargetParams | null;
  fileIds?: MemberFileIds | null;
  by: Classification;
  key: string;
  sort: Sort;
  limit: number;
  offset: number;
};

export type ShelfUrl = { by: Classification; key: string; sort: Sort };

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

function classificationKey(drive: string): string {
  return `litloft.addon.photo_diary.classification.${encodeURIComponent(drive)}`;
}

function sortKey(drive: string): string {
  return `litloft.addon.photo_diary.sort.${encodeURIComponent(drive)}`;
}

export function readClassification(drive: string): Classification {
  try {
    const stored = localStorage.getItem(classificationKey(drive));
    return CLASSIFICATIONS.find((value) => value === stored) ?? DEFAULT_CLASSIFICATION;
  } catch {
    return DEFAULT_CLASSIFICATION;
  }
}

export function writeClassification(drive: string, value: Classification): void {
  try {
    localStorage.setItem(classificationKey(drive), value);
  } catch {
    // Storage full or blocked: the page keeps the choice it was given.
  }
}

export function readSort(drive: string): Sort {
  try {
    const stored = localStorage.getItem(sortKey(drive));
    return SORTS.find((value) => value === stored) ?? DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function writeSort(drive: string, value: Sort): void {
  try {
    localStorage.setItem(sortKey(drive), value);
  } catch {
    // Storage full or blocked: the page keeps the choice it was given.
  }
}

/** Built from the key in UTC, so the viewer's time zone cannot move it a month. */
export function monthTitle(month: string, locale: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

/** Grouped in the viewer's locale, then named with the viewer's plural form. */
export function photoCountText(
  count: number,
  locale: string,
  t: (key: "photoCountOne" | "photoCountMany", values: { count: string }) => string,
): string {
  const formatted = new Intl.NumberFormat(locale).format(count);
  return t(count === 1 ? "photoCountOne" : "photoCountMany", { count: formatted });
}

type TitleStrings = (key: "undated" | "noTag" | "noCollection" | "collection") => string;

/** A shelf key's own title, for every classification but a collection's later label. */
export function shelfTitle(
  by: Classification,
  shelf: { key: string; label: string },
  drive: string,
  locale: string,
  t: TitleStrings,
): string {
  if (by === "month") {
    return shelf.key === "undated" ? t("undated") : monthTitle(shelf.key, locale);
  }
  if (by === "tag") return shelf.label || t("noTag");
  if (by === "collection") return shelf.label || t("noCollection");
  return shelf.label || drive;
}

/** The shelf page's title, before a collection's label has arrived. */
export function shelfKeyTitle(
  by: Classification,
  key: string,
  drive: string,
  locale: string,
  t: TitleStrings,
): string {
  if (by === "month") {
    return key === "undated" ? t("undated") : monthTitle(key, locale);
  }
  if (by === "tag") return key === "no_tag" ? t("noTag") : key;
  if (by === "collection") return t("collection");
  const label = key.replace(/\/$/, "").split("/").filter(Boolean).at(-1) ?? "";
  return label || drive;
}

export function parseShelfUrl(search: string): ShelfUrl | null {
  const params = new URLSearchParams(search);
  const by = CLASSIFICATIONS.find((value) => value === params.get("by"));
  if (!by) return null;
  if (!params.has("key")) return null;
  const key = params.get("key")!;
  if (key === "" && by !== "folder") return null;
  if (by === "month" && key !== "undated" && !MONTH_KEY.test(key)) return null;
  return { by, key, sort: params.get("sort") === "oldest" ? "oldest" : "newest" };
}

export function shelfPageQuery(url: ShelfUrl): string {
  const params = new URLSearchParams();
  params.set("by", url.by);
  params.set("key", url.key);
  if (url.sort === "oldest") params.set("sort", "oldest");
  return `?${params.toString()}`;
}

export function shelfHref(pathname: string, url: ShelfUrl): string {
  return `${pathname}/shelf${shelfPageQuery(url)}`;
}
