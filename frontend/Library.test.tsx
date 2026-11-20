/**
 * Acceptance tests for the Library face and the page URL, written from
 * docs/specs/library.md (SPEC-PD-019).
 *
 * The network is stood in for at `fetch`, so the wire contract is checked on
 * the requests the page sends whichever module sends them. FileGrid lays
 * nothing out here; the first-line layout is measured in the browser suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  configure,
  fireEvent,
  getConfig,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import coreEn from "@/messages-core/en.json";
import ja from "./messages/ja.json";
import en from "./messages/en.json";
import Page from "./Page";
import * as mapModule from "./map/createPhotoMap";
import { loadState, saveState } from "./lib/savedState";
import { readTargetView, writeAppTarget, writeTargetView } from "@/lib/appPrefs";
import * as coreApi from "@/lib/api";
import type { SmartFolder } from "@/types/smartFolder";

const h = vi.hoisted(() => ({
  drive: { current: "family" as string | null },
  listeners: new Set<() => void>(),
  observers: new Set<{ callback: IntersectionObserverCallback }>(),
  scroll: { calls: [] as number[] },
  missing: new Set<string>(),
}));

vi.mock("next-intl", async () => await vi.importActual("next-intl"));

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore, useMemo } = await import("react");
  const subscribe = (cb: () => void) => {
    h.listeners.add(cb);
    window.addEventListener("popstate", cb);
    return () => {
      h.listeners.delete(cb);
      window.removeEventListener("popstate", cb);
    };
  };
  const notify = () => h.listeners.forEach((cb) => cb());
  const router = {
    push: (url: string) => {
      window.history.pushState(null, "", url);
      notify();
    },
    replace: (url: string) => {
      window.history.replaceState(null, "", url);
      notify();
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => {},
    prefetch: () => {},
  };
  return {
    useRouter: () => router,
    usePathname: () => window.location.pathname,
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, onClick, ...rest }: any) =>
      React.createElement(
        "a",
        {
          ...rest,
          href: typeof href === "string" ? href : String(href?.pathname ?? ""),
          onClick: (e: any) => {
            onClick?.(e);
            if (e.defaultPrevented) return;
            e.preventDefault();
            window.history.pushState(null, "", e.currentTarget.getAttribute("href"));
            h.listeners.forEach((cb) => cb());
          },
        },
        children,
      ),
  };
});

vi.mock("@/components/CurrentDriveProvider", () => ({ useCurrentDrive: () => h.drive.current }));

vi.mock("@/components/AddonSlotsProvider", () => ({
  AddonSlotsProvider: ({ children }: any) => children,
  useAddonSlots: () => ({ addons: {}, slots: {}, loading: false, getSlotEntries: () => [], hasSlot: () => false }),
}));

vi.mock("@/components/FileGrid", async () => {
  const React = await import("react");
  return {
    FileGrid: (props: any) =>
      React.createElement(
        "div",
        { "data-testid": "file-grid" },
        ...props.files.map((f: any) =>
          React.createElement("span", { key: f.id, "data-testid": "file", "data-id": f.id }, f.filename),
        ),
        React.createElement("button", { onClick: props.onRefresh }, "mock-refresh"),
      ),
  };
});

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getDrives: vi.fn(async () => []),
  batchGetFiles: vi.fn(),
}));

vi.mock("./map/createPhotoMap", () => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, createPhotoMap: vi.fn() };
});

// ---------------------------------------------------------------- the server

type Shelf = { key: string; label: string; ids: string[] };
type Req = { method: string; path: string; query: URLSearchParams };

const BASE = "/api/addons/photo_diary";
const PAGE = "/addons/photo_diary";
const TARGET_KEYS = ["search", "tag", "folder", "collection", "size", "favorite", "liked", "none", "type"];
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const MONTH_KEYS = [
  "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04",
  "2026-03", "2026-02", "2026-01", "2025-12", "2025-11", "2025-10", "2025-09",
];

function defaultShelves(): Record<string, Shelf[]> {
  const shared = ids("s", 20);
  return {
    month: [
      ...MONTH_KEYS.map((key, i) => ({ key, label: "", ids: ids(`m${key}-`, i === 0 ? 1234 : 3 + i) })),
      { key: "undated", label: "", ids: ids("u", 4) },
    ],
    tag: [
      { key: "beach", label: "beach", ids: shared.slice(0, 15) },
      { key: "family", label: "family", ids: shared.slice(5, 20) },
      { key: "no_tag", label: "", ids: ids("nt", 2) },
    ],
    collection: [
      { key: "c0ll3ction01", label: "Summer album", ids: ids("c", 5) },
      { key: "no_collection", label: "", ids: ids("nc", 2) },
    ],
    folder: [
      { key: "2026", label: "2026", ids: ids("y26-", 6) },
      { key: "", label: "", ids: ids("root", 2) },
    ],
  };
}

const TRIP_SHELVES: Record<string, Shelf[]> = {
  month: [{ key: "2026-09", label: "", ids: ["t0", "t1"] }],
  tag: [{ key: "trip", label: "trip", ids: ["t0", "t1"] }],
  collection: [{ key: "no_collection", label: "", ids: ["t0", "t1"] }],
  folder: [{ key: "trips/", label: "trips", ids: ["t0", "t1"] }],
};

let data: Record<string, Shelf[]>;
let total: number;
let folders: SmartFolder[];
let requests: Req[];
let unexpected: string[];
let overrides: { match: (r: Req) => boolean; respond: (r: Req) => Response | Promise<Response>; once: boolean }[];

const targetOf = (q: URLSearchParams) =>
  Object.fromEntries(TARGET_KEYS.filter((k) => q.has(k)).map((k) => [k, q.getAll(k)]));

function targetName(r: Req): "default" | "trip" | null {
  const t = targetOf(r.query);
  const k = Object.keys(t);
  if (k.length === 0) return "default";
  if (k.length === 1 && t.tag?.length === 1 && t.tag[0] === "trip") return "trip";
  return null;
}

function shelvesFor(r: Req): Shelf[] | null {
  const t = targetName(r);
  if (t === null) return null;
  const set = t === "trip" ? TRIP_SHELVES : data;
  return set[r.query.get("by") ?? ""] ?? null;
}

function route(r: Req): Response {
  if (r.path === `${BASE}/library/shelves`) {
    const set = shelvesFor(r);
    if (set === null) {
      unexpected.push(`${r.path}?${r.query}`);
      return json({ detail: "unexpected" }, 500);
    }
    const offset = Number(r.query.get("offset") ?? 0);
    const limit = Number(r.query.get("shelf_limit") ?? 12);
    const per = Number(r.query.get("per_shelf") ?? 12);
    return json({
      shelves: set.slice(offset, offset + limit).map((s) => ({
        key: s.key,
        label: s.label,
        count: s.ids.length,
        file_ids: s.ids.slice(0, per),
      })),
      total_shelves: set.length,
    });
  }
  if (r.path === `${BASE}/calendar/months`) {
    const t = targetName(r);
    if (t === null) {
      unexpected.push(`${r.path}?${r.query}`);
      return json({ detail: "unexpected" }, 500);
    }
    if (t === "trip") return json({ months: [{ month: "2026-09", count: 2 }], undated_count: 0 });
    return json({ months: [{ month: "2026-10", count: total - 13 }], undated_count: 13 });
  }
  if (r.path === `${BASE}/calendar/days`) {
    const month = r.query.get("month")!;
    return json({ days: month === "2026-10" ? [{ date: "2026-10-03", count: 5, has_note: false }, { date: "2026-10-20", count: 2, has_note: false }] : [] });
  }
  if (r.path === `${BASE}/photos`) {
    const all = r.query.get("undated") ? ids("u", 4) : ids(`d${r.query.get("date")}-`, r.query.get("date") === "2026-10-03" ? 5 : 2);
    return json({ file_ids: all, total: all.length });
  }
  if (r.path === `${BASE}/points`) {
    return json({
      points: [{ file_id: "m2026-10-0", lat: 35, lon: 139, taken_at: "2026-10-01T10:00:00" }],
    });
  }
  if (r.path === `${BASE}/note`) return json({ state: "none", file_id: null });
  if (r.path === `${BASE}/map-config`) return json({ tile_url: "https://t.example.test/{z}/{x}/{y}.png", attribution: "" });
  if (r.path.startsWith(BASE)) {
    unexpected.push(r.path);
    return json({ detail: "unexpected route" }, 500);
  }
  if (/^\/api\/drives\/[^/]+\/smart-folders$/.test(r.path)) return json(folders);
  if (/^\/api\/drives\/[^/]+\/collections$/.test(r.path)) return json([]);
  if (/^\/api\/drives\/[^/]+\/files$/.test(r.path)) return json({ data: [], meta: { total: 999, page: 1, limit: 1 } });
  if (r.path === "/api/addons/status") return json({ addons: {}, slots: {} });
  return json({ detail: "Not Found" }, 404);
}

const fakeFetch = vi.fn(async (input: any, init?: any) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, "http://localhost");
  const req: Req = {
    method: String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
  };
  requests.push(req);
  const hit = overrides.find((o) => o.match(req));
  if (hit) {
    if (hit.once) overrides.splice(overrides.indexOf(hit), 1);
    return hit.respond(req);
  }
  return route(req);
});

function answer(match: (r: Req) => boolean, respond: (r: Req) => Response | Promise<Response>, once = true) {
  overrides.unshift({ match, respond, once });
}

function hold(match: (r: Req) => boolean) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  answer(
    match,
    async (r) => {
      await gate;
      return route(r);
    },
    false,
  );
  return () => act(async () => void release());
}

const PREF = "litloft.addon.photo_diary.";
const APP = { addon: "photo_diary" } as const;
const VIEW_KEY = `${PREF}view.family`;
const PREF_KEYS = [VIEW_KEY];
const isShelves = (r: Req) => r.path === `${BASE}/library/shelves`;
const isMonths = (r: Req) => r.path === `${BASE}/calendar/months`;
const isPhotos = (r: Req) => r.path === `${BASE}/photos`;
const isPoints = (r: Req) => r.path === `${BASE}/points`;
const shelfReads = () => requests.filter(isShelves);
const photoReads = () => requests.filter(isPhotos);
const lastShelfRead = () => shelfReads().at(-1)!.query;

// ---------------------------------------------------------------- harness

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    h.observers.add(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    h.observers.delete(this);
  }
  takeRecords() {
    return [];
  }
}

class IdleResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function folder(id: string, name: string, query: string): SmartFolder {
  return { id, drive: "family", name, query, file_type: null, sort_by: null, sort_order: null, created_at: "2026-01-01T00:00:00Z", updated_at: null };
}
const TRIP = folder("sf-trip", "Trip", "tag:trip");

const ORIGINAL_WAIT = getConfig().asyncUtilTimeout;
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  configure({ asyncUtilTimeout: 1500 });
  data = defaultShelves();
  total = 113;
  folders = [TRIP];
  requests = [];
  unexpected = [];
  overrides = [];
  h.drive.current = "family";
  h.observers.clear();
  h.scroll.calls.length = 0;
  h.missing.clear();
  sessionStorage.clear();
  localStorage.clear();
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", IdleResizeObserver);
  vi.mocked(coreApi.batchGetFiles).mockReset();
  vi.mocked(coreApi.batchGetFiles).mockImplementation((async (want: string[]) =>
    want.filter((id) => !h.missing.has(id)).map((id) => ({ id, filename: `${id}.jpg`, file_type: "image" }))) as any);
  vi.mocked(mapModule.createPhotoMap).mockReset();
  vi.mocked(mapModule.createPhotoMap).mockImplementation((async () => ({
    setPoints: vi.fn(),
    setSelected: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    getView: vi.fn(() => ({ center: [0, 0], zoom: 1 })),
    destroy: vi.fn(),
  })) as any);

  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...a) => {
    origPush(...a);
    h.listeners.forEach((cb) => cb());
  });
  vi.spyOn(window.history, "replaceState").mockImplementation((...a) => {
    origReplace(...a);
    h.listeners.forEach((cb) => cb());
  });
  vi.spyOn(window, "scrollTo").mockImplementation(((x: any, y?: any) => {
    h.scroll.calls.push(typeof x === "object" ? x.top : y);
  }) as any);
  (Element.prototype as any).scrollTo = function (x: any, y?: any) {
    h.scroll.calls.push(typeof x === "object" ? x.top : y);
  };
});

afterEach(() => {
  configure({ asyncUtilTimeout: ORIGINAL_WAIT });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollTo;
  delete (window as any).scrollY;
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  expect(unexpected).toEqual([]);
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const pagePath = () => `/drive/${h.drive.current}${PAGE}`;

function tree(locale: "ja" | "en") {
  const messages = locale === "ja" ? { ...coreJa, ...ja } : { ...coreEn, ...en };
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Page />
    </NextIntlClientProvider>
  );
}

async function settled(search = "", locale: "ja" | "en" = "ja") {
  window.history.replaceState(null, "", `${pagePath()}${search}`);
  const view = render(tree(locale));
  await flush();
  return view;
}

const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const tab = (name: string) => screen.getByRole("tab", { name });
const headerText = () => document.querySelector("header")?.textContent ?? "";
const query = () => new URLSearchParams(window.location.search);
const seeAll = () => screen.queryAllByRole("link", { name: "すべて見る" });
const gridIds = () =>
  Array.from(document.querySelectorAll("[data-testid=file-grid]")).map((g) =>
    Array.from(g.querySelectorAll("[data-testid=file]")).map((e) => e.getAttribute("data-id")!),
  );
const visibleGrids = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-testid=file-grid]")).filter(
    (grid) => grid.closest("[hidden]") === null,
  );
async function refreshShownGrid() {
  const grid = visibleGrids()[0];
  if (!grid) throw new Error("no grid is shown");
  await click(within(grid).getByText("mock-refresh"));
}
const day = (label: string) => screen.findByRole("button", { name: label });

async function loadMore() {
  await act(async () => {
    for (const o of [...h.observers]) {
      o.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], o as any);
    }
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function shelvesDrawn(n: number) {
  await waitFor(() => expect(seeAll()).toHaveLength(n));
}

async function openDayList() {
  await click(tab("カレンダー"));
  await click(await day("10月3日 5枚"));
  await waitFor(() => expect(visibleGrids()).toHaveLength(1));
  await waitFor(() =>
    expect(within(visibleGrids()[0]).queryAllByTestId("file")).toHaveLength(5),
  );
}

async function openMapList() {
  await click(tab("地図"));
  await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
  const options = vi.mocked(mapModule.createPhotoMap).mock.calls.at(-1)![1] as any;
  await act(async () => void options.onPointClick(["m2026-10-0"]));
  await waitFor(() => expect(visibleGrids()).toHaveLength(1));
  await waitFor(() =>
    expect(within(visibleGrids()[0]).queryAllByTestId("file")).toHaveLength(1),
  );
}

function option(name: string): HTMLElement {
  return (screen.queryByRole("menuitemradio", { name }) ?? screen.getByRole("radio", { name })) as HTMLElement;
}
const checked = (el: HTMLElement) =>
  el.getAttribute("aria-checked") === "true" || (el as HTMLInputElement).checked === true;

const classificationButton = (value: string) => screen.findByRole("button", { name: `分類: ${value}` });
const sortButton = (value: string) => screen.findByRole("button", { name: `並び順: ${value}` });

async function classify(from: string, to: string) {
  await click(await classificationButton(from));
  await waitFor(() => option(to));
  await click(option(to));
  await flush();
}

async function sortBy(from: string, to: string) {
  await click(await sortButton(from));
  await waitFor(() => option(to));
  await click(option(to));
  await flush();
}

async function chooseTarget(from: string, to: string) {
  await click(await screen.findByRole("button", { name: `対象: ${from}` }));
  await click(await screen.findByRole("menuitemradio", { name: to }));
  await flush();
}

function seeAllHref(i = 0) {
  const href = seeAll()[i].getAttribute("href")!;
  return new URL(href, "http://localhost");
}

// ---------------------------------------------------------------- page URL (item 1, I7)

describe("SPEC-PD-019 I7: which face a URL opens", () => {
  it("SPEC-PD-019 a URL with no query opens the Library and replaces the URL with ?view=library, adding no history entry", async () => {
    const before = window.history.length;
    await settled("");
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    expect(window.location.pathname).toBe(pagePath());
    expect(window.history.length).toBe(before);
    expect(tab("ライブラリ")).toHaveAttribute("aria-selected", "true");
    expect(tab("カレンダー")).toHaveAttribute("aria-selected", "false");
    await shelvesDrawn(12);
  });

  it("SPEC-PD-019 the tabs are ライブラリ | カレンダー | 地図 in that order", async () => {
    await settled("?view=library");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["ライブラリ", "カレンダー", "地図"]);
  });

  it("SPEC-PD-019 a URL with no query is a fresh start: the drive's saved state is cleared", async () => {
    saveState("family", { zoom: 7, list: { loaded: 40, scrollY: 100 } });
    saveState("work", { zoom: 3 });
    await settled("");
    await shelvesDrawn(12);
    expect(loadState("family")?.zoom).toBeUndefined();
    expect(loadState("work")).toEqual({ zoom: 3 });
  });

  it("SPEC-PD-019 ?view=library opens the Library without a fresh start", async () => {
    saveState("family", { zoom: 7 });
    const before = window.history.length;
    await settled("?view=library");
    await shelvesDrawn(12);
    expect(tab("ライブラリ")).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("?view=library");
    expect(window.history.length).toBe(before);
    expect(loadState("family")?.zoom).toBe(7);
  });

  it.each(["?view=bogus", "?view=", "?view=LIBRARY", "?foo=bar", "?month=2026-13", "?date=2026-02-30", "?undated=false"])(
    "SPEC-PD-019 %s opens the Library, replaces the URL with ?view=library and is not a fresh start",
    async (search) => {
      saveState("family", { zoom: 7 });
      const before = window.history.length;
      await settled(search);
      await waitFor(() => expect(window.location.search).toBe("?view=library"));
      expect(window.history.length).toBe(before);
      expect(tab("ライブラリ")).toHaveAttribute("aria-selected", "true");
      await shelvesDrawn(12);
      expect(loadState("family")?.zoom).toBe(7);
    },
  );

  it.each(["?view=calendar", "?view=calendar&month=2026-10", "?month=2026-10", "?date=2026-10-03", "?undated=true"])("SPEC-PD-019 %s opens the calendar and sends no Library request", async (search) => {
    await settled(search);
    expect(tab("カレンダー")).toHaveAttribute("aria-selected", "true");
    expect(tab("ライブラリ")).toHaveAttribute("aria-selected", "false");
    await flush();
    expect(shelfReads()).toHaveLength(0);
    expect(window.location.pathname).toBe(pagePath());
  });

  it("SPEC-PD-019 ?view=map with calendar parameters opens the map, beside a Library tab", async () => {
    await settled("?view=map&month=2026-10");
    expect(tab("地図")).toHaveAttribute("aria-selected", "true");
    expect(tab("ライブラリ")).toHaveAttribute("aria-selected", "false");
    expect(shelfReads()).toHaveLength(0);
  });

  it("SPEC-PD-019 I7 every URL the calendar produces carries view=calendar, also from an old-form URL", async () => {
    await settled("?month=2026-10");
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(query().get("date")).toBe("2026-10-03"));
    expect(query().get("view")).toBe("calendar");
    await click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(query().has("date")).toBe(false));
    expect(query().get("month")).toBe("2026-10");
    expect(query().get("view")).toBe("calendar");
  });
});

// ---------------------------------------------------------------- tabs (item 3, 5, I14)

describe("SPEC-PD-019 I14: tabs", () => {
  it("SPEC-PD-019 ライブラリ pushes ?view=library and カレンダー brings back the same month and day", async () => {
    await settled("?view=calendar&month=2026-10&date=2026-10-03");
    const before = window.history.length;
    await click(tab("ライブラリ"));
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    expect(window.history.length).toBe(before + 1);
    await shelvesDrawn(12);
    await click(tab("カレンダー"));
    await waitFor(() => expect(query().get("view")).toBe("calendar"));
    expect(query().get("month")).toBe("2026-10");
    expect(query().get("date")).toBe("2026-10-03");
    expect(window.history.length).toBe(before + 2);
  });

  it("SPEC-PD-019 地図 from the Library carries the last calendar URL's parameters", async () => {
    await settled("?view=calendar&month=2026-10&date=2026-10-03");
    await click(tab("ライブラリ"));
    await shelvesDrawn(12);
    await click(tab("地図"));
    await waitFor(() => expect(query().get("view")).toBe("map"));
    expect(query().get("date")).toBe("2026-10-03");
  });

  it("SPEC-PD-019 Library → Calendar → Library keeps the loaded shelves without a request", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const reads = shelfReads().length;
    await click(tab("カレンダー"));
    await flush();
    await click(tab("ライブラリ"));
    await flush();
    expect(seeAll()).toHaveLength(12);
    expect(shelfReads()).toHaveLength(reads);
  });

  it("SPEC-PD-019 I7 the hidden calendar neither changes the URL nor requests anything while the Library is the face", async () => {
    await settled("?view=calendar&month=2026-10&date=2026-10-03");
    await click(tab("ライブラリ"));
    await shelvesDrawn(12);
    const calendarReads = requests.filter((r) => r.path === `${BASE}/calendar/days` || r.path === `${BASE}/photos`).length;
    await chooseTarget("すべての写真", "Trip");
    await shelvesDrawn(1);
    await flush();
    expect(window.location.search).toBe("?view=library");
    expect(requests.filter((r) => r.path === `${BASE}/calendar/days` || r.path === `${BASE}/photos`)).toHaveLength(calendarReads);
  });

  it("SPEC-PD-019 item 5: a URL with no query reached in place rebuilds the Library from its first page", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await loadMore();
    await shelvesDrawn(15);
    requests = [];
    await act(async () => {
      window.history.pushState(null, "", pagePath());
    });
    await flush();
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    await shelvesDrawn(12);
    expect(shelfReads().map((r) => r.query.get("offset"))).toEqual(["0"]);
  });

  it("SPEC-PD-019 the Library's URL carries no calendar parameter", async () => {
    await settled("?view=calendar&month=2026-10&date=2026-10-03");
    await click(tab("ライブラリ"));
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
  });
});

// ---------------------------------------------------------------- controls (item 6, 10, I10)

describe("SPEC-PD-019 I10: classification and sort", () => {
  it("SPEC-PD-019 the first request is by=month, sort=newest, per_shelf=12, shelf_limit=12, offset=0", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const q = shelfReads()[0].query;
    expect(q.get("by")).toBe("month");
    expect(q.get("sort")).toBe("newest");
    expect(q.get("per_shelf")).toBe("12");
    expect(q.get("shelf_limit")).toBe("12");
    expect(q.get("offset")).toBe("0");
    expect(Object.keys(targetOf(q))).toEqual([]);
    expect(requests.find(isShelves)!.method).toBe("GET");
  });

  it("SPEC-PD-019 the menus show the value in force, and the sort's accessible name is 並び順: <value>", async () => {
    await settled("?view=library");
    await classificationButton("撮影月");
    await sortButton("新しい順");
    await click(await classificationButton("撮影月"));
    await waitFor(() => option("撮影月"));
    for (const name of ["撮影月", "タグ", "コレクション", "フォルダ", "なし"]) expect(checked(option(name))).toBe(name === "撮影月");
  });

  it("SPEC-PD-019 changing the classification redraws from the first page, without touching the URL or history", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const before = window.history.length;
    await classify("撮影月", "タグ");
    await shelvesDrawn(3);
    expect(lastShelfRead().get("by")).toBe("tag");
    expect(lastShelfRead().get("offset")).toBe("0");
    expect(window.location.search).toBe("?view=library");
    expect(window.history.length).toBe(before);
    expect(screen.getByText("beach")).toBeInTheDocument();
    expect(screen.queryByText("2026年10月")).toBeNull();
  });

  it("SPEC-PD-019 changing the sort sends sort=oldest, and See all carries sort=oldest exactly then", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    expect(seeAllHref().searchParams.has("sort")).toBe(false);
    const before = window.history.length;
    await sortBy("新しい順", "古い順");
    await sortButton("古い順");
    await waitFor(() => expect(lastShelfRead().get("sort")).toBe("oldest"));
    await shelvesDrawn(12);
    expect(seeAllHref().searchParams.get("sort")).toBe("oldest");
    expect(window.location.search).toBe("?view=library");
    expect(window.history.length).toBe(before);
    await sortBy("古い順", "新しい順");
    await waitFor(() => expect(lastShelfRead().get("sort")).toBe("newest"));
    await shelvesDrawn(12);
    expect(seeAllHref().searchParams.has("sort")).toBe(false);
  });

  it("SPEC-PD-019 I10 the chosen classification and sort are in force on the drive's next load, under the per-Target view key", async () => {
    const first = await settled("?view=library");
    await shelvesDrawn(12);
    await classify("撮影月", "コレクション");
    await sortBy("新しい順", "古い順");
    await shelvesDrawn(2);
    expect(readTargetView(APP, "family", "default")).toEqual({ group: "collection", sort: "oldest" });
    expect(localStorage.getItem(`${PREF}classification.family`)).toBeNull();
    expect(localStorage.getItem(`${PREF}sort.family`)).toBeNull();
    first.unmount();
    requests = [];
    await settled("");
    await shelvesDrawn(2);
    expect(shelfReads()[0].query.get("by")).toBe("collection");
    expect(shelfReads()[0].query.get("sort")).toBe("oldest");
    await classificationButton("コレクション");
    await sortButton("古い順");
  });

  it("SPEC-PD-019 I10 a choice on one drive is not in force on another", async () => {
    const first = await settled("?view=library");
    await shelvesDrawn(12);
    await classify("撮影月", "フォルダ");
    await sortBy("新しい順", "古い順");
    first.unmount();
    h.drive.current = "a/b 家族";
    requests = [];
    await settled("?view=library");
    await waitFor(() => expect(shelfReads().length).toBeGreaterThan(0));
    expect(shelfReads()[0].query.get("by")).toBe("month");
    expect(shelfReads()[0].query.get("sort")).toBe("newest");
    expect(localStorage.getItem(`litloft.addon.photo_diary.view.${encodeURIComponent("a/b 家族")}`)).toBeNull();
  });

  it.each(["bogus", "", "{", "Tag"])("SPEC-PD-019 an unknown stored value %j gives the defaults", async (value) => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: value, sort: value } }));
    await settled("?view=library");
    await shelvesDrawn(12);
    expect(shelfReads()[0].query.get("by")).toBe("month");
    expect(shelfReads()[0].query.get("sort")).toBe("newest");
  });

  it("SPEC-PD-019 unreadable storage gives the defaults", async () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (PREF_KEYS.includes(key)) throw new DOMException("denied", "SecurityError");
      return original.call(this, key);
    });
    await settled("?view=library");
    await waitFor(() => expect(shelfReads().length).toBeGreaterThan(0));
    expect(shelfReads()[0].query.get("by")).toBe("month");
  });

  it("SPEC-PD-019 a write that storage refuses is dropped and the page keeps the choice", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (PREF_KEYS.includes(key)) throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, key, value);
    });
    await classify("撮影月", "タグ");
    await shelvesDrawn(3);
    expect(lastShelfRead().get("by")).toBe("tag");
    await classificationButton("タグ");
  });
});

// ---------------------------------------------------------------- shelves (item 7, 8, 9)

describe("SPEC-PD-019: the shelves", () => {
  it("SPEC-PD-019 month shelves are titled from the key in the viewer's locale, with counts in its number format", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    expect(screen.getByText("2026年10月")).toBeInTheDocument();
    expect(screen.getByText("2025年11月")).toBeInTheDocument();
    expect(document.body.textContent).toContain("1,234");
    expect(screen.queryByText("2025年10月")).toBeNull();
  });

  it("SPEC-PD-019 I3 a month title is built from the key with no time zone conversion", async () => {
    process.env.TZ = "America/Los_Angeles";
    data.month = [{ key: "2026-01", label: "", ids: ["a"] }];
    await settled("?view=library");
    await shelvesDrawn(1);
    expect(screen.getByText("2026年1月")).toBeInTheDocument();
    expect(screen.queryByText("2025年12月")).toBeNull();
  });

  it("SPEC-PD-019 English titles: Oct 2026 and No capture date", async () => {
    data.month = [
      { key: "2026-10", label: "", ids: ["a"] },
      { key: "undated", label: "", ids: ["b"] },
    ];
    await settled("?view=library", "en");
    await waitFor(() => expect(screen.getAllByRole("link", { name: "See all" })).toHaveLength(2));
    expect(screen.getByText("Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("No capture date")).toBeInTheDocument();
  });

  it("SPEC-PD-019 the undated shelf is titled 撮影日なし", async () => {
    data.month = [{ key: "undated", label: "", ids: ["b"] }];
    await settled("?view=library");
    await shelvesDrawn(1);
    expect(screen.getByText("撮影日なし")).toBeInTheDocument();
  });

  it("SPEC-PD-019 tag, collection and folder titles", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await classify("撮影月", "タグ");
    await shelvesDrawn(3);
    expect(screen.getByText("beach")).toBeInTheDocument();
    expect(screen.getByText("タグなし")).toBeInTheDocument();
    await classify("タグ", "コレクション");
    await shelvesDrawn(2);
    expect(screen.getByText("Summer album")).toBeInTheDocument();
    expect(screen.getByText("コレクションなし")).toBeInTheDocument();
    await classify("コレクション", "フォルダ");
    await shelvesDrawn(2);
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getAllByText("family").some((el) => !el.closest("header"))).toBe(true);
  });

  it("SPEC-PD-019 each shelf hands its photos to FileGrid in the backend's order", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const grids = gridIds();
    expect(grids).toHaveLength(12);
    expect(grids[0]).toEqual(ids("m2026-10-", 12));
    expect(grids[1]).toEqual(ids("m2026-09-", 4));
  });

  it("SPEC-PD-019 See all on every shelf goes to the shelf page with by and key", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const u = seeAllHref(0);
    expect(u.pathname).toBe(`/drive/family${PAGE}/shelf`);
    expect(u.searchParams.get("by")).toBe("month");
    expect(u.searchParams.get("key")).toBe("2026-10");
    await classify("撮影月", "フォルダ");
    await shelvesDrawn(2);
    const root = seeAllHref(1);
    expect(root.searchParams.get("by")).toBe("folder");
    expect(root.searchParams.has("key")).toBe(true);
    expect(root.searchParams.get("key")).toBe("");
    await classify("フォルダ", "コレクション");
    await shelvesDrawn(2);
    expect(seeAllHref(0).searchParams.get("key")).toBe("c0ll3ction01");
  });

  it("SPEC-PD-019 See all is on a shelf whose photos all fit, and encodes a key with reserved characters", async () => {
    data.tag = [{ key: "a&b c/d", label: "a&b c/d", ids: ["x"] }];
    await settled("?view=library");
    await shelvesDrawn(12);
    await classify("撮影月", "タグ");
    await shelvesDrawn(1);
    expect(seeAllHref(0).searchParams.get("key")).toBe("a&b c/d");
  });

  it("SPEC-PD-019 item 8: the ids of a page are read once each, in batches of at most 100", async () => {
    data.tag = Array.from({ length: 12 }, (_, i) => ({ key: `t${i}`, label: `t${i}`, ids: ids(`s${i % 3}-`, 12) }))
      .concat(data.tag);
    data.month = Array.from({ length: 12 }, (_, i) => ({ key: MONTH_KEYS[i], label: "", ids: ids(`k${i}-`, 12) }));
    await settled("?view=library");
    await shelvesDrawn(12);
    const calls = vi.mocked(coreApi.batchGetFiles).mock.calls.map((c) => c[0] as string[]);
    const asked = calls.flat();
    expect(new Set(asked).size).toBe(asked.length);
    expect(new Set(asked)).toEqual(new Set(data.month.flatMap((s) => s.ids)));
    for (const c of calls) expect(c.length).toBeLessThanOrEqual(100);
    vi.mocked(coreApi.batchGetFiles).mockClear();
    await classify("撮影月", "タグ");
    await shelvesDrawn(12);
    const tagCalls = vi.mocked(coreApi.batchGetFiles).mock.calls.map((c) => c[0] as string[]);
    const tagAsked = tagCalls.flat();
    expect(new Set(tagAsked).size).toBe(tagAsked.length);
    expect(tagAsked.length).toBe(36);
    for (const c of tagCalls) expect(c.length).toBeLessThanOrEqual(100);
  });

  it("SPEC-PD-019 item 8: a page is drawn when all its reads have answered", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let n = 0;
    vi.mocked(coreApi.batchGetFiles).mockImplementation((async (want: string[]) => {
      if (n++ === 1) await gate;
      return want.map((id) => ({ id, filename: `${id}.jpg`, file_type: "image" }));
    }) as any);
    await settled("?view=library");
    await flush();
    expect(n).toBeGreaterThanOrEqual(2);
    expect(seeAll()).toHaveLength(0);
    await act(async () => void release());
    await shelvesDrawn(12);
  });

  it("SPEC-PD-019 an id the batch read no longer returns is skipped; the count stays", async () => {
    data.month = [{ key: "2026-10", label: "", ids: ["a", "b", "c"] }];
    h.missing.add("b");
    await settled("?view=library");
    await shelvesDrawn(1);
    expect(gridIds()).toEqual([["a", "c"]]);
    expect(document.body.textContent).toMatch(/3枚|3 /);
  });

  it("SPEC-PD-019 item 9: more shelves load 12 at a time when the end nears", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await loadMore();
    await shelvesDrawn(15);
    const q = lastShelfRead();
    expect(q.get("offset")).toBe("12");
    expect(q.get("shelf_limit")).toBe("12");
    expect(screen.getByText("撮影日なし")).toBeInTheDocument();
    await loadMore();
    await flush();
    expect(shelfReads()).toHaveLength(2);
  });

  it("SPEC-PD-019 9.5: no photo under the target shows the empty state", async () => {
    data.month = [];
    await settled("?view=library");
    await screen.findByText("写真はありません");
    expect(seeAll()).toHaveLength(0);
  });

  it("SPEC-PD-019 item 11: the header's N is read from /calendar/months under the target", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    expect(tab("ライブラリ")).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(headerText()).toContain("family · 113枚"));
    expect(requests.some(isMonths)).toBe(true);
    await chooseTarget("すべての写真", "Trip");
    await waitFor(() => expect(headerText()).toContain("family · 2枚"));
    const tripMonths = requests.filter(isMonths).at(-1)!;
    expect(targetOf(tripMonths.query)).toEqual({ tag: ["trip"] });
  });

  it("SPEC-PD-019 I12 opening only the Library requests no map tile and creates no map", async () => {
    await settled("");
    await shelvesDrawn(12);
    expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- failures (section 2)

describe("SPEC-PD-019: failures", () => {
  it("SPEC-PD-019 a failed first page shows the retry in place of the shelves; retry repeats it", async () => {
    answer(isShelves, () => json({ detail: "boom" }, 500));
    await settled("?view=library");
    const retry = await screen.findByRole("button", { name: "再試行" });
    expect(seeAll()).toHaveLength(0);
    await click(retry);
    await shelvesDrawn(12);
    expect(shelfReads()).toHaveLength(2);
  });

  it("SPEC-PD-019 a failed batch read of the first page shows the retry; retry repeats both reads", async () => {
    vi.mocked(coreApi.batchGetFiles).mockRejectedValueOnce(new Error("batch"));
    await settled("?view=library");
    const retry = await screen.findByRole("button", { name: "再試行" });
    expect(seeAll()).toHaveLength(0);
    await click(retry);
    await shelvesDrawn(12);
    expect(shelfReads()).toHaveLength(2);
  });

  it("SPEC-PD-019 a failed later page keeps the drawn shelves and offers a retry below them", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    answer((r) => isShelves(r) && r.query.get("offset") === "12", () => json({ detail: "boom" }, 500));
    await loadMore();
    const retry = await screen.findByRole("button", { name: "再試行" });
    expect(seeAll()).toHaveLength(12);
    const last = seeAll().at(-1)!;
    expect(last.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(retry);
    await shelvesDrawn(15);
  });

  it("SPEC-PD-019 a 404 shows not available", async () => {
    answer(isShelves, () => json({ detail: "Not Found" }, 404), false);
    await settled("?view=library");
    await screen.findByText("このドライブでは使えません");
    expect(seeAll()).toHaveLength(0);
    expect(shelfReads().length).toBeGreaterThan(0);
  });

  it("SPEC-PD-019 a 400 to the target shows the load error with retry", async () => {
    answer(isShelves, () => json({ detail: "Invalid" }, 400), false);
    await settled("?view=library");
    await screen.findByRole("button", { name: "再試行" });
    expect(screen.queryByText("このドライブでは使えません")).toBeNull();
  });
});

// ---------------------------------------------------------------- I8: stale answers

describe("SPEC-PD-019 I8: nothing of the previous choice", () => {
  it("SPEC-PD-019 while the new classification loads, the old shelves are gone, and a late old answer is not drawn", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const releaseTag = hold((r) => isShelves(r) && r.query.get("by") === "tag");
    await classify("撮影月", "タグ");
    expect(screen.queryByText("2026年10月")).toBeNull();
    expect(seeAll()).toHaveLength(0);
    await releaseTag();
    await shelvesDrawn(3);
  });

  it("SPEC-PD-019 an answer to an earlier classification arriving late is never drawn", async () => {
    const releaseMonth = hold((r) => isShelves(r) && r.query.get("by") === "month");
    await settled("?view=library");
    await classify("撮影月", "フォルダ");
    await shelvesDrawn(2);
    await releaseMonth();
    await flush();
    expect(seeAll()).toHaveLength(2);
    expect(screen.queryByText("2026年10月")).toBeNull();
  });

  it("SPEC-PD-019 after a failed answer to the new sort, nothing of the old one stays", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    answer((r) => isShelves(r) && r.query.get("sort") === "oldest", () => json({ detail: "boom" }, 500));
    await sortBy("新しい順", "古い順");
    await screen.findByRole("button", { name: "再試行" });
    expect(seeAll()).toHaveLength(0);
    expect(screen.queryByText("2026年10月")).toBeNull();
  });

  it("SPEC-PD-019 a target change redraws from the first page under the new target", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const release = hold((r) => isShelves(r) && targetName(r) === "trip");
    await chooseTarget("すべての写真", "Trip");
    expect(seeAll()).toHaveLength(0);
    await release();
    await shelvesDrawn(1);
    expect(targetOf(lastShelfRead())).toEqual({ tag: ["trip"] });
    expect(lastShelfRead().get("offset")).toBe("0");
    expect(screen.getByText("2026年9月")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- item 17, I13: after a write

describe("SPEC-PD-019 I13: after a write through the context menu", () => {
  it("SPEC-PD-019 every loaded page is read again, a photo that left is gone, and N is read again", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await loadMore();
    await shelvesDrawn(15);
    data.month[0] = { ...data.month[0], ids: data.month[0].ids.slice(1) };
    total = 112;
    const reads = shelfReads().length;
    const months = requests.filter(isMonths).length;
    await click(screen.getAllByText("mock-refresh")[0]);
    await waitFor(() => expect(gridIds()[0][0]).toBe("m2026-10-1"));
    const again = shelfReads().slice(reads).map((r) => r.query.get("offset"));
    expect(new Set(again)).toEqual(new Set(["0", "12"]));
    expect(seeAll()).toHaveLength(15);
    expect(requests.filter(isMonths).length).toBeGreaterThan(months);
    await waitFor(() => expect(headerText()).toContain("family · 112枚"));
    expect(document.body.textContent).toContain("1,233");
  });

  it("SPEC-PD-019 while the re-read runs what is drawn stays; a failed re-read keeps it and shows LoadError above", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    answer(
      isShelves,
      async () => {
        await gate;
        return json({ detail: "boom" }, 500);
      },
      false,
    );
    await click(screen.getAllByText("mock-refresh")[0]);
    await flush();
    expect(seeAll()).toHaveLength(12);
    await act(async () => void release());
    await screen.findByText("読み込めませんでした");
    expect(seeAll()).toHaveLength(12);
    const error = screen.getByText("読み込めませんでした");
    expect(error.compareDocumentPosition(seeAll()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------------------------------------------------------------- item 5: a write on another face

describe("SPEC-PD-019 item 5: a write on the calendar or the map", () => {
  async function leaveWithTwoPages() {
    await settled("?view=library");
    await shelvesDrawn(12);
    await loadMore();
    await shelvesDrawn(15);
  }

  it.each([
    ["the calendar's day list", openDayList],
    ["the map's list", openMapList],
  ])(
    "SPEC-PD-019 I13 a write on %s makes the Library read its loaded pages again on return, keeping depth and scroll",
    async (_face, openList) => {
      await leaveWithTwoPages();
      Object.defineProperty(window, "scrollY", { configurable: true, get: () => 900 });
      await openList();
      data.month[0] = { ...data.month[0], ids: data.month[0].ids.slice(1) };
      total = 112;
      h.scroll.calls.length = 0;
      const reads = shelfReads().length;
      await refreshShownGrid();
      await click(tab("ライブラリ"));
      await waitFor(() => expect(gridIds()[0][0]).toBe("m2026-10-1"));
      const again = shelfReads().slice(reads).map((r) => r.query.get("offset"));
      expect(new Set(again)).toEqual(new Set(["0", "12"]));
      expect(seeAll()).toHaveLength(15);
      await waitFor(() => expect(headerText()).toContain("family · 112枚"));
      expect(h.scroll.calls).toEqual([]);
      expect(window.scrollY).toBe(900);
    },
  );

  it("SPEC-PD-019 I14 Library → Calendar → Library sends no request when nothing was written", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    const reads = shelfReads().length;
    await openDayList();
    await click(tab("ライブラリ"));
    await flush();
    expect(seeAll()).toHaveLength(12);
    expect(shelfReads()).toHaveLength(reads);
  });

  it("SPEC-PD-019 a write on the map's point list reads it again once", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await openMapList();
    const release = hold(isPoints);
    vi.mocked(coreApi.batchGetFiles).mockClear();
    await refreshShownGrid();
    await flush();
    await release();
    await waitFor(() => expect(vi.mocked(coreApi.batchGetFiles)).toHaveBeenCalledTimes(1));
    await flush();
    expect(vi.mocked(coreApi.batchGetFiles)).toHaveBeenCalledTimes(1);
  });

  it("SPEC-PD-019 I14 a write on the calendar makes the Library read again once, and a later return with nothing written does not", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await openDayList();
    const photos = photoReads().length;
    const reads = shelfReads().length;
    await refreshShownGrid();
    await waitFor(() => expect(photoReads()).toHaveLength(photos + 1));
    expect(shelfReads()).toHaveLength(reads);
    await click(tab("ライブラリ"));
    await waitFor(() => expect(shelfReads()).toHaveLength(reads + 1));
    expect(seeAll()).toHaveLength(12);
    await click(tab("カレンダー"));
    await click(tab("ライブラリ"));
    await flush();
    expect(shelfReads()).toHaveLength(reads + 1);
  });

  it("SPEC-PD-019 a failed re-read after a write on the calendar keeps the shelves and shows the retry", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await openDayList();
    await refreshShownGrid();
    answer(isShelves, () => json({ detail: "boom" }, 500));
    await click(tab("ライブラリ"));
    await flush();
    expect(seeAll()).toHaveLength(12);
    await screen.findByText("読み込めませんでした");
    expect(seeAll()).toHaveLength(12);
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(screen.queryByText("読み込めませんでした")).toBeNull());
    expect(seeAll()).toHaveLength(12);
  });
});

// ---------------------------------------------------------------- item 5: a write on the Library

describe("SPEC-PD-019 item 5: a write on the Library", () => {
  it("SPEC-PD-019 I14 a write on the Library makes the calendar's open day list read again once, and a later return with nothing written does not", async () => {
    await settled("?view=library");
    await shelvesDrawn(12);
    await openDayList();
    await click(tab("ライブラリ"));
    await flush();
    const reads = photoReads().length;
    h.missing.add("d2026-10-03-0");
    const shelves = shelfReads().length;
    await refreshShownGrid();
    await waitFor(() => expect(shelfReads()).toHaveLength(shelves + 1));
    expect(photoReads()).toHaveLength(reads);
    await click(tab("カレンダー"));
    await waitFor(() => expect(photoReads()).toHaveLength(reads + 1));
    await waitFor(() =>
      expect(within(visibleGrids()[0]).queryAllByTestId("file")).toHaveLength(4),
    );
    await click(tab("ライブラリ"));
    await click(tab("カレンダー"));
    await flush();
    expect(photoReads()).toHaveLength(reads + 1);
  });

  it("SPEC-PD-019 I14 SPEC-PD-023 item 6 a write on the なし grid makes the calendar's open day list read again once", async () => {
    writeTargetView(APP, "family", "default", { group: "all" });
    answer(
      (r) => r.path === `${BASE}/library/shelf` && r.query.get("by") === "all",
      () => json({ file_ids: ids("all", 3), total: 3, label: "" }),
      false,
    );
    await settled("?view=library");
    await waitFor(() => expect(visibleGrids()).toHaveLength(1));
    await openDayList();
    await click(tab("ライブラリ"));
    await flush();
    const reads = photoReads().length;
    const allReads = () =>
      requests.filter((r) => r.path === `${BASE}/library/shelf` && r.query.get("by") === "all").length;
    const grid = allReads();
    h.missing.add("d2026-10-03-0");
    await refreshShownGrid();
    await waitFor(() => expect(allReads()).toBe(grid + 1));
    expect(photoReads()).toHaveLength(reads);
    await click(tab("カレンダー"));
    await waitFor(() => expect(photoReads()).toHaveLength(reads + 1));
    await waitFor(() =>
      expect(within(visibleGrids()[0]).queryAllByTestId("file")).toHaveLength(4),
    );
  });

  it("SPEC-PD-019 I14 a write on the Library makes the map's point list read again once, and a later return with nothing written does not", async () => {
    const listReads = () =>
      vi
        .mocked(coreApi.batchGetFiles)
        .mock.calls.filter(([want]) => (want as string[]).join() === "m2026-10-0").length;
    await settled("?view=library");
    await shelvesDrawn(12);
    await openMapList();
    await click(tab("ライブラリ"));
    await flush();
    const reads = listReads();
    h.missing.add("m2026-10-0");
    await refreshShownGrid();
    await waitFor(() => expect(gridIds()[0][0]).toBe("m2026-10-1"));
    expect(listReads()).toBe(reads);
    await click(tab("地図"));
    await waitFor(() => expect(listReads()).toBe(reads + 1));
    await click(tab("ライブラリ"));
    await click(tab("地図"));
    await flush();
    expect(listReads()).toBe(reads + 1);
  });
});

// ---------------------------------------------------------------- I9: restore

describe("SPEC-PD-019 I9: going back to the Library", () => {
  async function leaveWithTwoPages(scrollY = 700) {
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const view = await settled("?view=library");
    await shelvesDrawn(12);
    await loadMore();
    await shelvesDrawn(15);
    view.unmount();
    requests = [];
    h.scroll.calls.length = 0;
  }

  it("SPEC-PD-019 a reload of ?view=library restores the loaded depth and the scroll position", async () => {
    await leaveWithTwoPages();
    await settled("?view=library");
    await shelvesDrawn(15);
    await waitFor(() => expect(h.scroll.calls).toContain(700));
  });

  it("SPEC-PD-019 the restore keeps the classification and sort it was recorded under", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => 300 });
    const view = await settled("?view=library");
    await shelvesDrawn(12);
    await classify("撮影月", "タグ");
    await shelvesDrawn(3);
    view.unmount();
    requests = [];
    await settled("?view=library");
    await shelvesDrawn(3);
    expect(shelfReads()[0].query.get("by")).toBe("tag");
    await waitFor(() => expect(h.scroll.calls).toContain(300));
  });

  it("SPEC-PD-019 a different classification in force starts from the first page at the top", async () => {
    const probe = await settled("?view=library");
    await shelvesDrawn(12);
    await classify("撮影月", "フォルダ");
    const folderView = readTargetView(APP, "family", "default");
    expect(folderView.group).toBe("folder");
    await classify("フォルダ", "撮影月");
    probe.unmount();
    sessionStorage.clear();
    await leaveWithTwoPages();
    writeTargetView(APP, "family", "default", { group: folderView.group });
    await settled("?view=library");
    await flush();
    expect(new Set(shelfReads().map((r) => r.query.get("offset")))).toEqual(new Set(["0"]));
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-019 a different target starts from the first page at the top", async () => {
    await leaveWithTwoPages();
    writeAppTarget("family", { addon: "photo_diary" }, TRIP.id);
    await settled("?view=library");
    await shelvesDrawn(1);
    await flush();
    expect(shelfReads().map((r) => r.query.get("offset"))).toEqual(["0"]);
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-019 the Library opened by its tab is not restored", async () => {
    await leaveWithTwoPages();
    await settled("?view=calendar&month=2026-10");
    await click(tab("ライブラリ"));
    await shelvesDrawn(12);
    expect(new Set(shelfReads().map((r) => r.query.get("offset")))).toEqual(new Set(["0"]));
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-019 a fresh start is not restored", async () => {
    await leaveWithTwoPages();
    await settled("");
    await shelvesDrawn(12);
    expect(new Set(shelfReads().map((r) => r.query.get("offset")))).toEqual(new Set(["0"]));
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-019 a restore is never applied on another drive", async () => {
    await leaveWithTwoPages();
    h.drive.current = "work";
    await settled("?view=library");
    await shelvesDrawn(12);
    expect(new Set(shelfReads().map((r) => r.query.get("offset")))).toEqual(new Set(["0"]));
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-019 leaving from the Library does not overwrite the calendar's list position", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => 900 });
    const view = await settled("?view=library");
    await shelvesDrawn(12);
    view.unmount();
    expect(loadState("family")?.list).toEqual({ loaded: 80, scrollY: 640 });
  });
});
