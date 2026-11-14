/**
 * Acceptance tests for the Target and the app header, written from
 * docs/specs/app-target.md (SPEC-PD-016, SPEC-PD-017).
 *
 * The network is stood in for at `fetch`, so the wire contract is checked on
 * the requests the page sends whichever module sends them. The core's
 * AppHeader, TargetMenu and storage helpers are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, configure, fireEvent, getConfig, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import ja from "./messages/ja.json";
import Page from "./Page";
import * as mapModule from "./map/createPhotoMap";
import { saveState } from "./lib/savedState";
import { readAppTarget, writeAppTarget } from "@/lib/appPrefs";
import { resolveAppTarget } from "@/lib/appTarget";
import type { SmartFolder } from "@/types/smartFolder";

const h = vi.hoisted(() => ({
  drive: { current: "family" as string | null },
  listeners: new Set<() => void>(),
  observers: new Set<{ callback: IntersectionObserverCallback }>(),
  scroll: { calls: [] as number[] },
  mapOptions: { current: null as null | Record<string, any> },
  handles: [] as { setPoints: any }[],
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
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
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
      ),
  };
});

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getDrives: vi.fn(async () => []),
  batchGetFiles: vi.fn(async (want: string[]) => want.map((id) => ({ id, filename: `${id}.jpg` }))),
}));

vi.mock("./map/createPhotoMap", () => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, createPhotoMap: vi.fn() };
});

// ---------------------------------------------------------------- folders

const APP = { addon: "photo_diary" } as const;

function folder(id: string, name: string, query: string, file_type: SmartFolder["file_type"] = null): SmartFolder {
  return { id, drive: "family", name, query, file_type, sort_by: null, sort_order: null, created_at: "2026-01-01T00:00:00Z", updated_at: null };
}

const TRIP = folder("sf-trip", "Trip", "tag:trip");
const FULL = folder("sf-full", "Full", "beach tag:trip path:Photos size:>10MB is:favorite in:Album is:liked");
const VIDEOS = folder("sf-videos", "Videos", "type:video");
const NEGATED = folder("sf-neg", "No drafts", "-tag:draft");
const DURATION = folder("sf-long", "Long ones", "duration:>1m");
const BAD = folder("sf-bad", "Broken", "tag:bad");
const FOLDERS = [TRIP, FULL, VIDEOS, NEGATED, DURATION, BAD];

const fullParams = (() => {
  const t = resolveAppTarget(FULL, ["image"]);
  if (!t.usable || !("params" in t) || t.params === null) throw new Error("FULL must resolve usable");
  const { type: _type, ...rest } = t.params as Record<string, unknown>;
  return rest;
})();

// ---------------------------------------------------------------- the server

type Library = {
  photos: Record<string, string[]>;
  undated: string[];
  notes: string[];
  points: { file_id: string; lat: number; lon: number; taken_at: string | null }[];
};
type Req = { method: string; path: string; query: URLSearchParams };

const BASE = "/api/addons/photo_diary";
const PHOTO_PATHS = [`${BASE}/calendar/months`, `${BASE}/calendar/days`, `${BASE}/photos`, `${BASE}/points`];
const TARGET_KEYS = ["search", "tag", "folder", "collection", "size", "favorite", "liked", "none", "type"];
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const NOTE_DAY = "2026-08-20";

function libraries(): Record<string, Library> {
  return {
    default: {
      photos: { "2026-10-03": ids("d3-", 5), "2026-10-20": ids("d20-", 100), "2026-08-15": ids("d815-", 5) },
      undated: ids("u", 3),
      notes: [NOTE_DAY],
      points: [
        { file_id: "a0", lat: 35, lon: 139, taken_at: "2026-10-03T10:00:00" },
        { file_id: "s0", lat: 3, lon: 3, taken_at: null },
      ],
    },
    trip: {
      photos: { "2026-09-02": ["t0", "t1"] },
      undated: [],
      notes: [NOTE_DAY],
      points: [
        { file_id: "t0", lat: 1, lon: 1, taken_at: "2026-09-02T10:00:00" },
        { file_id: "s0", lat: 3, lon: 3, taken_at: null },
      ],
    },
    full: {
      photos: { "2026-10-20": ids("f20-", 100) },
      undated: ["uf0"],
      notes: [NOTE_DAY],
      points: [{ file_id: "f20-0", lat: 2, lon: 2, taken_at: "2026-10-20T10:00:00" }],
    },
    none: { photos: {}, undated: [], notes: [NOTE_DAY], points: [] },
  };
}

let libs: Record<string, Library>;
let folders: SmartFolder[];
let requests: Req[];
let unexpected: string[];
let overrides: { match: (r: Req) => boolean; respond: (r: Req) => Response | Promise<Response>; once: boolean }[];

const targetOf = (q: URLSearchParams) =>
  Object.fromEntries(TARGET_KEYS.filter((k) => q.has(k)).map((k) => [k, q.getAll(k)]));

function libraryKey(r: Req): string | null {
  const t = targetOf(r.query);
  const keys = Object.keys(t);
  if (keys.length === 0) return "default";
  if (keys.length === 1 && t.none?.[0] === "true") return "none";
  if (keys.length === 1 && t.tag?.length === 1 && t.tag[0] === "trip") return "trip";
  if (keys.length === 1 && t.tag?.[0] === "bad") return "bad";
  if (t.search?.[0] === "beach") return "full";
  return null;
}

function dayRows(lib: Library, month: string) {
  const dates = new Set([...Object.keys(lib.photos), ...lib.notes].filter((d) => d.startsWith(month)));
  return [...dates].sort().map((date) => ({ date, count: lib.photos[date]?.length ?? 0, has_note: lib.notes.includes(date) }));
}

function monthRows(lib: Library) {
  const months = new Set([...Object.keys(lib.photos), ...lib.notes].map((d) => d.slice(0, 7)));
  return [...months]
    .sort()
    .reverse()
    .map((month) => ({
      month,
      count: Object.entries(lib.photos)
        .filter(([d]) => d.startsWith(month))
        .reduce((n, [, p]) => n + p.length, 0),
    }));
}

function route(r: Req): Response {
  if (PHOTO_PATHS.includes(r.path)) {
    const key = libraryKey(r);
    if (key === null) {
      unexpected.push(`${r.path}?${r.query}`);
      return json({ detail: "unexpected target" }, 500);
    }
    if (key === "bad") return json({ detail: "Invalid" }, 400);
    const lib = libs[key];
    if (r.path === `${BASE}/calendar/months`) return json({ months: monthRows(lib), undated_count: lib.undated.length });
    if (r.path === `${BASE}/calendar/days`) return json({ days: dayRows(lib, r.query.get("month")!) });
    if (r.path === `${BASE}/points`) return json({ points: lib.points });
    const all = r.query.get("undated") ? lib.undated : (lib.photos[r.query.get("date")!] ?? []);
    const offset = Number(r.query.get("offset") ?? 0);
    const limit = Number(r.query.get("limit") ?? 40);
    return json({ file_ids: all.slice(offset, offset + limit), total: all.length });
  }
  if (r.path === `${BASE}/note`) return json({ state: "none", file_id: null });
  if (r.path === `${BASE}/map-config`) return json({ tile_url: "https://t.example.test/{z}/{x}/{y}.png", attribution: "" });
  if (r.path.startsWith(BASE)) {
    unexpected.push(r.path);
    return json({ detail: "unexpected route" }, 500);
  }
  if (r.path === "/api/drives/family/smart-folders") return json(folders);
  if (r.path === "/api/drives/family/files") return json({ data: [], meta: { total: 113, page: 1, limit: 1 } });
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

/** Holds every matching request until the returned release, then answers as the server would. */
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

const isFolders = (r: Req) => r.path === "/api/drives/family/smart-folders";
const isPhoto = (r: Req) => PHOTO_PATHS.includes(r.path);
const under = (key: string) => (r: Req) => isPhoto(r) && libraryKey(r) === key;
const photoReads = () => requests.filter(isPhoto);
const folderReads = () => requests.filter(isFolders).length;

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

const ORIGINAL_WAIT = getConfig().asyncUtilTimeout;

beforeEach(() => {
  configure({ asyncUtilTimeout: 1500 });
  libs = libraries();
  folders = FOLDERS;
  requests = [];
  unexpected = [];
  overrides = [];
  h.drive.current = "family";
  h.observers.clear();
  h.scroll.calls.length = 0;
  h.mapOptions.current = null;
  h.handles.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", IdleResizeObserver);
  vi.mocked(mapModule.createPhotoMap).mockReset();
  vi.mocked(mapModule.createPhotoMap).mockImplementation((async (_el: HTMLElement, options: any) => {
    h.mapOptions.current = options;
    const handle = { setPoints: vi.fn(), setSelected: vi.fn(), resume: vi.fn(), pause: vi.fn(), destroy: vi.fn() };
    h.handles.push(handle);
    return handle;
  }) as any);

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
  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get() {
      return 0;
    },
    set(v: number) {
      h.scroll.calls.push(v);
    },
  });
});

afterEach(() => {
  configure({ asyncUtilTimeout: ORIGINAL_WAIT });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollTo;
  delete (Element.prototype as any).scrollTop;
  expect(unexpected).toEqual([]);
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function settled(search = "") {
  window.history.replaceState(null, "", `/drive/${h.drive.current}/addons/photo_diary${search}`);
  const view = render(
    <NextIntlClientProvider locale="ja" messages={{ ...coreJa, ...ja }}>
      <Page />
    </NextIntlClientProvider>,
  );
  await flush();
  return view;
}

const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const day = (label: string) => screen.findByRole("button", { name: label });
const tab = (name: string) => screen.getByRole("tab", { name });
const headerText = () => document.querySelector("header")?.textContent ?? "";
const targetButton = (name: string) => screen.findByRole("button", { name: `対象: ${name}` });
const renderedIds = () =>
  Array.from(document.querySelectorAll("[data-testid=file]")).map((e) => e.getAttribute("data-id")!);

async function choose(from: string, to: RegExp | string) {
  await click(await targetButton(from));
  const row = await screen.findByRole("menuitemradio", { name: to });
  await click(row);
  await flush();
}

const saved = (drive = "family") => readAppTarget(drive, APP);

// ---------------------------------------------------------------- header (017)

describe("SPEC-PD-017: the app header", () => {
  it("SPEC-PD-017 draws the title, the scope line with N and the quiet Target, with the tabs in the header", async () => {
    await settled();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("フォトダイアリー");
    await waitFor(() => expect(headerText()).toContain("family · 113枚"));
    const target = await targetButton("すべての写真");
    expect(target.textContent ?? "").not.toContain("対象");
    expect(target.textContent ?? "").toContain("すべての写真");
    const header = document.querySelector("header")!;
    expect(header.contains(screen.getByRole("tablist"))).toBe(true);
    expect(tab("カレンダー")).toHaveAttribute("aria-selected", "true");
    expect(tab("地図")).toHaveAttribute("aria-selected", "false");
  });

  it("SPEC-PD-017 the not-available frame has no Target and no tabs, where the normal page has both", async () => {
    const normal = await settled();
    await targetButton("すべての写真");
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    normal.unmount();
    answer((r) => r.path.startsWith(BASE), () => json({ detail: "Not Found" }, 404), false);
    await settled();
    await screen.findByText("このドライブでは使えません");
    expect(screen.queryByRole("button", { name: /^対象/ })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

// ---------------------------------------------------------------- resolution (016 item 4)

describe("SPEC-PD-016 I6: the default target", () => {
  it("SPEC-PD-016 reads the drive's smart folders and sends no target parameter on any photo request", async () => {
    await settled("?month=2026-10&date=2026-10-03");
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    await click(await day("10月20日 100枚"));
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    await flush();
    expect(folderReads()).toBeGreaterThan(0);
    const paths = new Set(photoReads().map((r) => r.path));
    expect([...paths].sort()).toEqual([...PHOTO_PATHS].sort());
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual({});
  });
});

describe("SPEC-PD-016 I7: the look-up of a saved target", () => {
  it.each(["", "?view=map"])(
    "SPEC-PD-016 sends no photo request while a saved folder is being looked up (%s)",
    async (search) => {
      writeAppTarget("family", APP, TRIP.id);
      const release = hold(isFolders);
      await settled(search);
      await targetButton("…");
      expect(photoReads()).toEqual([]);
      await release();
      await targetButton("Trip");
      await waitFor(() => expect(photoReads().length).toBeGreaterThan(0));
      for (const r of photoReads()) expect(targetOf(r.query)).toEqual({ tag: ["trip"] });
      await waitFor(() => expect(headerText()).toContain("family · 2枚"));
    },
  );

  it.each([
    ["a folder that is gone", "sf-gone"],
    ["a folder with a negated operator", NEGATED.id],
    ["a folder with a duration part", DURATION.id],
  ])("SPEC-PD-016 %s gives the default target and keeps the saved id", async (_label, id) => {
    writeAppTarget("family", APP, id);
    await settled();
    await targetButton("すべての写真");
    await waitFor(() => expect(headerText()).toContain("family · 113枚"));
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual({});
    expect(saved()).toBe(id);
  });

  it("SPEC-PD-016 a smart folder list that fails gives the default target at once", async () => {
    writeAppTarget("family", APP, TRIP.id);
    answer(isFolders, () => json({ detail: "x" }, 500), false);
    await settled();
    await targetButton("すべての写真");
    await waitFor(() => expect(headerText()).toContain("family · 113枚"));
    expect(photoReads().length).toBeGreaterThan(0);
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual({});
    expect(saved()).toBe(TRIP.id);
  });

  it("SPEC-PD-016 I16 the menu's checked row is the default for a fallback", async () => {
    writeAppTarget("family", APP, "sf-gone");
    await settled();
    await click(await targetButton("すべての写真"));
    const checked = screen.getAllByRole("menuitemradio").filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain("すべての写真");
  });
});

// ---------------------------------------------------------------- wire contract (016 item 6)

describe("SPEC-PD-016 item 6: the wire contract", () => {
  it("SPEC-PD-016 a usable folder sends exactly its resolved parameters, and never type, on every photo request", async () => {
    writeAppTarget("family", APP, FULL.id);
    await settled("?month=2026-10&date=2026-10-20");
    await targetButton("Full");
    await waitFor(() => expect(renderedIds()[0]).toBe("f20-0"));
    await click(screen.getByRole("button", { name: /撮影日なし/ }));
    await waitFor(() => expect(renderedIds()).toContain("uf0"));
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    await flush();
    const paths = new Set(photoReads().map((r) => r.path));
    expect([...paths].sort()).toEqual([...PHOTO_PATHS].sort());
    const expected = Object.fromEntries(
      Object.entries(fullParams).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : [String(v)]]),
    );
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual(expected);
  });

  it("SPEC-PD-016 I4 a folder that holds no image sends none=true alone, and its notes still show", async () => {
    writeAppTarget("family", APP, VIDEOS.id);
    await settled("?month=2026-08");
    await targetButton("Videos");
    const noted = await day("8月20日、メモあり");
    expect(noted).not.toBeDisabled();
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    await flush();
    expect(photoReads().length).toBeGreaterThan(0);
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual({ none: ["true"] });
    expect(headerText()).toContain("family · 0枚");
  });

  it("SPEC-PD-016 a target the core cannot normalise shows each view's load error and the drive name alone", async () => {
    writeAppTarget("family", APP, BAD.id);
    await settled();
    await targetButton("Broken");
    await screen.findByText("読み込めませんでした");
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(headerText()).not.toMatch(/family\s*·/);
    await click(tab("地図"));
    await waitFor(() => expect(screen.getAllByText("読み込めませんでした").length).toBeGreaterThan(0));
    expect(headerText()).not.toMatch(/family\s*·/);
  });
});

// ---------------------------------------------------------------- the menu (016 item 5)

describe("SPEC-PD-016 item 5: the Target menu", () => {
  it("SPEC-PD-016 I7 lists the default row, the folders, unusable ones disabled, and Manage…", async () => {
    await settled();
    await click(await targetButton("すべての写真"));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitemradio", { name: /すべての写真/ })).toHaveAttribute("aria-checked", "true");
    for (const f of [TRIP, FULL, VIDEOS, BAD]) {
      expect(within(menu).getByRole("menuitemradio", { name: new RegExp(f.name) })).not.toBeDisabled();
    }
    for (const f of [NEGATED, DURATION]) {
      expect(within(menu).getByRole("menuitemradio", { name: new RegExp(f.name) })).toBeDisabled();
    }
    expect(within(menu).getAllByText("この対象は使えません").length).toBeGreaterThan(0);
    expect(within(menu).getByRole("menuitem", { name: /管理/ })).toBeInTheDocument();
  });

  it("SPEC-PD-016 the default row counts the drive's active images", async () => {
    writeAppTarget("family", APP, TRIP.id);
    await settled();
    await click(await targetButton("Trip"));
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.path === "/api/drives/family/files" && r.query.getAll("type").join() === "image",
        ),
      ).toBe(true),
    );
  });
});

// ---------------------------------------------------------------- target change (016 item 8)

describe("SPEC-PD-016 item 8: a target change", () => {
  it("SPEC-PD-016 I13 saves the choice and redraws under it, the calendar on the new target's newest month", async () => {
    await settled();
    await day("10月3日 5枚");
    await choose("すべての写真", "Trip");
    expect(saved()).toBe(TRIP.id);
    await targetButton("Trip");
    await day("9月2日 2枚");
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
    await waitFor(() => expect(headerText()).toContain("family · 2枚"));
    const after = photoReads().filter((r) => libraryKey(r) === "trip");
    expect(after.length).toBeGreaterThan(0);
  });

  it("SPEC-PD-016 I8 a choice in one drive changes neither another drive nor the core's apps", async () => {
    writeAppTarget("work", APP, FULL.id);
    await settled();
    await day("10月3日 5枚");
    await choose("すべての写真", "Trip");
    expect(saved("family")).toBe(TRIP.id);
    expect(saved("work")).toBe(FULL.id);
    expect(readAppTarget("family", "video")).toBe("default");
    expect(readAppTarget("family", "reading")).toBe("default");
  });

  it("SPEC-PD-016 I14 nothing of the previous target is on screen while the new answers load, and a late answer is dropped", async () => {
    const releaseOld = hold((r) => under("default")(r) && r.path === `${BASE}/photos`);
    await settled("?month=2026-10&date=2026-10-03");
    await day("10月3日 5枚");
    await waitFor(() => expect(headerText()).toContain("family · 113枚"));
    const releaseNew = hold(under("trip"));
    await choose("すべての写真", "Trip");
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
    expect(screen.queryByRole("button", { name: /撮影日なし/ })).toBeNull();
    expect(headerText()).not.toContain("113枚");
    expect(headerText()).not.toMatch(/family\s*·/);
    await releaseOld();
    await flush();
    expect(renderedIds().filter((id) => id.startsWith("d3-"))).toEqual([]);
    await releaseNew();
    await waitFor(() => expect(headerText()).toContain("family · 2枚"));
    expect(renderedIds().filter((id) => id.startsWith("d3-"))).toEqual([]);
  });

  it("SPEC-PD-016 I14 a new read that fails shows the load error and still nothing of the previous target", async () => {
    await settled("?month=2026-10");
    await day("10月3日 5枚");
    answer(under("trip"), () => json({ detail: "x" }, 500), false);
    await choose("すべての写真", "Trip");
    await screen.findByText("読み込めませんでした");
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
    expect(headerText()).not.toContain("113枚");
  });

  it("SPEC-PD-016 I15 an open undated list closes when the new target has no undated photo", async () => {
    await settled("?month=2026-10&undated=true");
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1", "u2"]));
    await choose("すべての写真", "Trip");
    await waitFor(() => expect(window.location.search).not.toContain("undated"));
    expect(renderedIds()).toEqual([]);
  });

  it("SPEC-PD-016 I15 an open undated list stays open and is read again from its first page", async () => {
    await settled("?month=2026-10&undated=true");
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1", "u2"]));
    await choose("すべての写真", "Full");
    await waitFor(() => expect(renderedIds()).toEqual(["uf0"]));
    expect(window.location.search).toContain("undated=true");
    const read = requests.find((r) => r.path === `${BASE}/photos` && libraryKey(r) === "full" && r.query.get("undated"));
    expect(Number(read?.query.get("offset") ?? 0)).toBe(0);
  });

  it("SPEC-PD-016 I15 an open day list stays open with the month even when the day has no photo under the new target", async () => {
    await settled("?month=2026-10&date=2026-10-03");
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    await choose("すべての写真", "Trip");
    await waitFor(() => expect(photoReads().some(under("trip"))).toBe(true));
    await flush();
    expect(window.location.search).toContain("date=2026-10-03");
    expect(window.location.search).toContain("month=2026-10");
    expect(renderedIds()).toEqual([]);
  });

  it("SPEC-PD-016 I9 on the map, the pins follow the target and an open pin list closes", async () => {
    await settled("?view=map");
    await waitFor(() => expect(h.mapOptions.current).not.toBeNull());
    await act(async () => void h.mapOptions.current!.onPointClick(["a0"]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0"]));
    await choose("すべての写真", "Trip");
    await waitFor(() => {
      const calls = h.handles.flatMap((handle) => handle.setPoints.mock.calls);
      expect(JSON.stringify(calls.at(-1))).toContain("t0");
    });
    const last = JSON.stringify(h.handles.flatMap((handle) => handle.setPoints.mock.calls).at(-1));
    expect(last).not.toContain("a0");
    expect(renderedIds()).toEqual([]);
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("SPEC-PD-016 choosing the target in force again saves it and reloads nothing", async () => {
    writeAppTarget("family", APP, "sf-gone");
    await settled();
    await day("10月3日 5枚");
    const before = photoReads().length;
    await choose("すべての写真", /すべての写真/);
    expect(saved()).toBe("default");
    expect(photoReads().length).toBe(before);
    expect(screen.getByRole("button", { name: "10月3日 5枚" })).toBeInTheDocument();
  });

  it("SPEC-PD-016 I13 a choice storage refuses to save stays in force in the page", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (this === window.localStorage) throw new Error("blocked");
      return original.call(this, key, value);
    };
    try {
      await settled();
      await day("10月3日 5枚");
      await choose("すべての写真", "Trip");
      await targetButton("Trip");
      await day("9月2日 2枚");
      expect(saved()).toBe("default");
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("SPEC-PD-016 a fresh start in place keeps the target in force and the folder list", async () => {
    await settled("?month=2026-10");
    await day("10月3日 5枚");
    await choose("すべての写真", "Trip");
    await day("9月2日 2枚");
    const reads = folderReads();
    const before = requests.length;
    await act(async () => void window.history.pushState(null, "", "/drive/family/addons/photo_diary"));
    await flush();
    await targetButton("Trip");
    await day("9月2日 2枚");
    expect(folderReads()).toBe(reads);
    for (const r of requests.slice(before).filter(isPhoto)) expect(libraryKey(r)).toBe("trip");
  });
});

// ---------------------------------------------------------------- folder list retry (016 failure cases)

describe("SPEC-PD-016: a smart folder list read again after a failure", () => {
  async function retryFromManage(from: string) {
    await click(await targetButton(from));
    await click(screen.getByRole("menuitem", { name: /管理/ }));
    const dialog = screen.getByRole("dialog");
    await click(within(dialog).getByRole("button", { name: "再試行" }));
    await flush();
  }

  it("SPEC-PD-016 a list that loads on retry applies the saved folder as a target change", async () => {
    writeAppTarget("family", APP, TRIP.id);
    answer(isFolders, () => json({ detail: "x" }, 500));
    await settled();
    await day("10月3日 5枚");
    await retryFromManage("すべての写真");
    await targetButton("Trip");
    await day("9月2日 2枚");
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
  });

  it("SPEC-PD-016 a choice made in the page wins over the saved id when the list arrives, even unsaved", async () => {
    writeAppTarget("family", APP, TRIP.id);
    answer(isFolders, () => json({ detail: "x" }, 500));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (this === window.localStorage) throw new Error("blocked");
      return original.call(this, key, value);
    };
    try {
      await settled();
      await day("10月3日 5枚");
      await choose("すべての写真", /すべての写真/);
      await retryFromManage("すべての写真");
      await targetButton("すべての写真");
      expect(screen.getByRole("button", { name: "10月3日 5枚" })).toBeInTheDocument();
      expect(photoReads().some(under("trip"))).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

// ---------------------------------------------------------------- saved state (016 item 8, I9)

describe("SPEC-PD-016 I9: state saved under another target", () => {
  it("SPEC-PD-016 a list position saved before this change is not restored under a folder target", async () => {
    writeAppTarget("family", APP, FULL.id);
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    await settled("?month=2026-10&date=2026-10-20");
    await waitFor(() => expect(renderedIds()[0]).toBe("f20-0"));
    await flush();
    expect(renderedIds()).toHaveLength(40);
    expect(h.scroll.calls).not.toContain(640);
  });

  it("SPEC-PD-016 a pin list saved under another target is not reopened, and the map keeps its centre and zoom", async () => {
    writeAppTarget("family", APP, TRIP.id);
    saveState("family", { zoom: 7, center: [1, 2], pointIds: ["s0"] });
    await settled("?view=map");
    await targetButton("Trip");
    await waitFor(() => expect(h.mapOptions.current).not.toBeNull());
    expect(h.mapOptions.current!.center).toEqual([1, 2]);
    expect(h.mapOptions.current!.zoom).toBe(7);
    await flush();
    expect(renderedIds()).toEqual([]);
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });
});
