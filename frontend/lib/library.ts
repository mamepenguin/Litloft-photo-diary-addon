import { mergeLibraryTags } from "@/components/appshell/libraryFilters";
import type { MemberFileIds, TargetParams } from "../api";

export const CLASSIFICATIONS = ["month", "tag", "collection", "folder", "all"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** The classifications that name a shelf, and so can open the shelf page. */
export const SHELF_CLASSIFICATIONS = ["month", "tag", "collection", "folder"] as const;
export type ShelfClassification = (typeof SHELF_CLASSIFICATIONS)[number];

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

export type ShelfUrl = { by: Classification; key: string; sort: Sort; tags: readonly string[] };

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The URL's `tag` values, in order, once each compared folded, empty values dropped. */
export function parseChosenTags(search: string): string[] {
  const chosen: string[] = [];
  for (const tag of new URLSearchParams(search).getAll("tag")) {
    if (tag === "") continue;
    if (chosen.some((held) => held.toLowerCase() === tag.toLowerCase())) continue;
    chosen.push(tag);
  }
  return chosen;
}

/** The Target's own tags then the chosen ones, for the requests that carry both. */
export function withChosenTags(
  target: TargetParams | null,
  chosen: readonly string[],
): TargetParams | null {
  // An empty Target sends none=true alone; its chosen tags stay in the URL unsent.
  if (target?.none) return target;
  const tags = mergeLibraryTags(target?.tag ?? [], chosen);
  const next: TargetParams = { ...target };
  if (tags.length > 0) next.tag = tags;
  else delete next.tag;
  return Object.keys(next).length > 0 ? next : null;
}

export function readLegacySort(drive: string): string | null {
  try {
    return localStorage.getItem(`litloft.addon.photo_diary.sort.${encodeURIComponent(drive)}`);
  } catch {
    return null;
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
  const by = SHELF_CLASSIFICATIONS.find((value) => value === params.get("by"));
  if (!by) return null;
  if (!params.has("key")) return null;
  const key = params.get("key")!;
  if (key === "" && by !== "folder") return null;
  if (by === "month" && key !== "undated" && !MONTH_KEY.test(key)) return null;
  return {
    by,
    key,
    sort: params.get("sort") === "oldest" ? "oldest" : "newest",
    tags: parseChosenTags(search),
  };
}

export function shelfPageQuery(url: ShelfUrl): string {
  const params = new URLSearchParams();
  params.set("by", url.by);
  params.set("key", url.key);
  if (url.sort === "oldest") params.set("sort", "oldest");
  for (const tag of url.tags) params.append("tag", tag);
  return `?${params.toString()}`;
}

export function shelfHref(pathname: string, url: ShelfUrl): string {
  return `${pathname}/shelf${shelfPageQuery(url)}`;
}
