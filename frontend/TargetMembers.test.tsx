/**
 * Acceptance tests for member targets and collection targets, written from
 * docs/specs/target-members.md (SPEC-PD-021, SPEC-PD-022).
 *
 * The network is stood in for at `fetch`. The core's evaluation of a Smart
 * Collection's members is replaced by a controllable promise, so its three
 * outcomes and the time it takes are under the test's control; the core's
 * AppHeader, TargetMenu, useMemberTarget and storage helpers are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, configure, fireEvent, getConfig, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import ja from "./messages/ja.json";
import Page from "./Page";
import * as mapModule from "./map/createPhotoMap";
import { loadState, saveState } from "./lib/savedState";
import { readAppTarget, writeAppTarget } from "@/lib/appPrefs";
import * as memberTarget from "@/lib/memberTarget";
import type { SmartFolder } from "@/types/smartFolder";

const h = vi.hoisted(() => ({
  drive: { current: "family" as string | null },
  listeners: new Set<() => void>(),
  observers: new Set<{ callback: IntersectionObserverCallback }>(),
  scroll: { calls: [] as number[] },
  mapOptions: { current: null as null | Record<string, any> },
  handles: [] as { setPoints: any; destroy: any }[],
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
  batchGetFiles: vi.fn(async (want: string[]) => want.map((id) => ({ id, filename: `${id}.jpg`, file_type: "image" }))),
}));

vi.mock("@/lib/memberTarget", async (orig) => ({
  ...(await orig<typeof import("@/lib/memberTarget")>()),
  evaluateMemberTarget: vi.fn(),
}));

vi.mock("./map/createPhotoMap", () => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, createPhotoMap: vi.fn() };
});

// ---------------------------------------------------------------- targets

const APP = { addon: "photo_diary" } as const;

function folder(id: string, name: string, query: string, file_type: SmartFolder["file_type"] = null): SmartFolder {
  return { id, drive: "family", name, query, file_type, sort_by: null, sort_order: null, created_at: "2026-01-01T00:00:00Z", updated_at: null };
}

const TRIP = folder("sf-trip", "Trip", "tag:trip");
const BEACH = folder("sf-beach", "Beach", "beach tag:trip");
const NEGATED = folder("sf-neg", "No drafts", "-tag:draft");
const FULL_TEXT = folder("sf-full", "Full", "beach tag:trip path:Photos size:>10MB is:favorite in:Album is:liked");
const TEXT_VIDEOS = folder("sf-text-videos", "Shore videos", "shore", "video");
const TEXT_DURATION = folder("sf-text-long", "Long beach", "beach duration:>1m");
const DURATION = folder("sf-long", "Long ones", "duration:>1m");
const FOLDERS = [TRIP, BEACH, NEGATED, FULL_TEXT, TEXT_VIDEOS, TEXT_DURATION, DURATION];

const ALBUM = {
  id: "c0ll3ction01",
  name: "Album",
  description: null,
  drive: "family",
  item_count: 1,
  first_file_id: "c0",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const ALBUM_ID = `collection:${ALBUM.id}`;

const MEMBERS = ["m0", "m1", "mu0", "v0"];

// ---------------------------------------------------------------- the server

type Library = {
  photos: Record<string, string[]>;
  undated: string[];
  notes: string[];
  points: { file_id: string; lat: number; lon: number; taken_at: string | null }[];
};
type Req = { method: string; path: string; query: URLSearchParams; body: any; contentType: string | null };

const BASE = "/api/addons/photo_diary";
const PHOTO_PATHS = [
  `${BASE}/calendar/months`,
  `${BASE}/calendar/days`,
  `${BASE}/photos`,
  `${BASE}/points`,
  `${BASE}/library/shelves`,
  `${BASE}/library/shelf`,
];
const TARGET_KEYS = ["search", "tag", "folder", "collection", "size", "favorite", "liked", "none", "type"];
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const LIBS: Record<string, Library> = {
  default: {
    photos: { "2026-10-03": ids("d3-", 5), "2026-10-20": ids("d20-", 100) },
    undated: ids("u", 3),
    notes: [],
    points: [{ file_id: "a0", lat: 35, lon: 139, taken_at: "2026-10-03T10:00:00" }],
  },
  trip: {
    photos: { "2026-09-02": ["t0", "t1"] },
    undated: [],
    notes: [],
    points: [{ file_id: "t0", lat: 1, lon: 1, taken_at: "2026-09-02T10:00:00" }],
  },
  album: {
    photos: { "2026-06-01": ["c0"] },
    undated: [],
    notes: [],
    points: [{ file_id: "c0", lat: 4, lon: 4, taken_at: "2026-06-01T10:00:00" }],
  },
  members: {
    photos: { "2026-07-04": ["m0", "m1"] },
    undated: ["mu0"],
    notes: [],
    points: [{ file_id: "m0", lat: 2, lon: 2, taken_at: "2026-07-04T10:00:00" }],
  },
  many: {
    photos: { "2026-07-04": ids("mm", 100) },
    undated: [],
    notes: [],
    points: [],
  },
  none: { photos: {}, undated: [], notes: [], points: [] },
};

let folders: SmartFolder[];
let collections: (typeof ALBUM)[];
let requests: Req[];
let unexpected: string[];
let overrides: { match: (r: Req) => boolean; respond: (r: Req) => Response | Promise<Response>; once: boolean }[];

const targetOf = (q: URLSearchParams) =>
  Object.fromEntries(TARGET_KEYS.filter((k) => q.has(k)).map((k) => [k, q.getAll(k)]));

function libraryKey(r: Req): string | null {
  const t = targetOf(r.query);
  const keys = Object.keys(t);
  if (r.method === "POST") {
    if (keys.length > 0 || !Array.isArray(r.body?.file_ids)) return null;
    if (r.body.file_ids.length === 0) return "none";
    return r.body.file_ids.length > MEMBERS.length ? "many" : "members";
  }
  if (r.method !== "GET") return null;
  if (keys.length === 0) return "default";
  if (keys.length === 1 && t.none?.length === 1 && t.none[0] === "true") return "none";
  if (keys.length === 1 && t.tag?.length === 1 && t.tag[0] === "trip") return "trip";
  if (keys.length === 1 && t.collection?.length === 1 && t.collection[0] === ALBUM.name) return "album";
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

function shelvesOf(lib: Library) {
  return Object.entries(lib.photos).map(([date, p]) => ({ key: date.slice(0, 7), label: "", count: p.length, file_ids: p }));
}

function route(r: Req): Response {
  if (PHOTO_PATHS.includes(r.path)) {
    const key = libraryKey(r);
    if (key === null) {
      unexpected.push(`${r.method} ${r.path}?${r.query}`);
      return json({ detail: "unexpected target" }, 500);
    }
    const lib = LIBS[key];
    if (r.path === `${BASE}/calendar/months`) return json({ months: monthRows(lib), undated_count: lib.undated.length });
    if (r.path === `${BASE}/calendar/days`) return json({ days: dayRows(lib, r.query.get("month")!) });
    if (r.path === `${BASE}/points`) return json({ points: lib.points });
    if (r.path === `${BASE}/library/shelves`) {
      const shelves = Number(r.query.get("offset") ?? 0) > 0 ? [] : shelvesOf(lib);
      return json({ shelves, total_shelves: shelvesOf(lib).length });
    }
    if (r.path === `${BASE}/library/shelf`) {
      const all = Object.entries(lib.photos)
        .filter(([d]) => d.startsWith(r.query.get("key") ?? ""))
        .flatMap(([, p]) => p);
      const offset = Number(r.query.get("offset") ?? 0);
      const limit = Number(r.query.get("limit") ?? 40);
      return json({ file_ids: all.slice(offset, offset + limit), total: all.length, label: "" });
    }
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
  if (r.path === "/api/drives/family/collections") return json(collections);
  if (r.path === "/api/drives/family/files") return json({ data: [], meta: { total: 108, page: 1, limit: 1 } });
  if (r.path === "/api/addons/status") return json({ addons: {}, slots: {} });
  return json({ detail: "Not Found" }, 404);
}

function contentTypeOf(input: any, init?: any): string | null {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  return headers.get("Content-Type");
}

function bodyOf(input: any, init?: any): any {
  const raw = init?.body;
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const fakeFetch = vi.fn(async (input: any, init?: any) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, "http://localhost");
  const req: Req = {
    method: String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    body: bodyOf(input, init),
    contentType: contentTypeOf(input, init),
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

const isFolders = (r: Req) => r.path === "/api/drives/family/smart-folders";
const isCollections = (r: Req) => r.path === "/api/drives/family/collections";
const isPhoto = (r: Req) => PHOTO_PATHS.includes(r.path);
const photoReads = () => requests.filter(isPhoto);
const noteReads = (date: string) =>
  requests.filter((r) => r.path === `${BASE}/note` && r.query.get("date") === date).length;

// ---------------------------------------------------------------- the evaluation

type Evaluation = memberTarget.MemberEvaluation;
const evaluate = vi.mocked(memberTarget.evaluateMemberTarget);
let pending: ((e: Evaluation) => void)[];
let auto: Evaluation | null;

/** Answers every evaluation still running. */
const finish = (e: Evaluation) =>
  act(async () => {
    const waiting = pending;
    pending = [];
    waiting.forEach((resolve) => resolve(e));
    await new Promise((r) => setTimeout(r, 0));
  });

const READY: Evaluation = { status: "ready", fileIds: MEMBERS };

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
  folders = FOLDERS;
  collections = [ALBUM];
  requests = [];
  unexpected = [];
  overrides = [];
  pending = [];
  auto = null;
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
  evaluate.mockReset();
  evaluate.mockImplementation(
    () => (auto ? Promise.resolve(auto) : new Promise<Evaluation>((resolve) => pending.push(resolve))) as any,
  );
  vi.mocked(mapModule.createPhotoMap).mockReset();
  vi.mocked(mapModule.createPhotoMap).mockImplementation((async (_el: HTMLElement, options: any) => {
    h.mapOptions.current = options;
    const handle = {
      setPoints: vi.fn(),
      setSelected: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      getView: vi.fn(() => ({ center: [10, 20], zoom: 8 })),
      destroy: vi.fn(),
    };
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
});

afterEach(() => {
  cleanup();
  configure({ asyncUtilTimeout: ORIGINAL_WAIT });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollTo;
  delete (window as any).scrollY;
  expect(unexpected).toEqual([]);
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function messages() {
  return { ...coreJa, ...ja };
}

async function settled(search = "?view=calendar") {
  window.history.replaceState(null, "", `/drive/${h.drive.current}/addons/photo_diary${search}`);
  const view = render(
    <NextIntlClientProvider locale="ja" messages={messages()}>
      <Page />
    </NextIntlClientProvider>,
  );
  await flush();
  return view;
}

async function openShelf(search: string) {
  const path = "./pages/shelf";
  const Shelf = (await import(/* @vite-ignore */ path)).default;
  window.history.replaceState(null, "", `/drive/${h.drive.current}/addons/photo_diary/shelf${search}`);
  const view = render(
    <NextIntlClientProvider locale="ja" messages={messages()}>
      <Shelf />
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
const saved = (drive = "family") => readAppTarget(drive, APP);

async function loadMore() {
  await act(async () => {
    for (const o of [...h.observers]) {
      o.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], o as any);
    }
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 0));
  });
}
const noCount = () => expect(headerText()).not.toMatch(/family\s*·/);

async function choose(from: string, to: RegExp | string) {
  await click(await targetButton(from));
  const row = await screen.findByRole("menuitemradio", { name: to });
  await click(row);
  await flush();
}

function expectMemberWire(rs: Req[], members: string[]) {
  expect(rs.length).toBeGreaterThan(0);
  for (const r of rs) {
    expect(r.method).toBe("POST");
    expect(r.contentType).toMatch(/^application\/json/);
    expect(targetOf(r.query)).toEqual({});
    expect(r.body).toEqual({ file_ids: expect.any(Array) });
    expect([...r.body.file_ids].sort()).toEqual([...members].sort());
  }
}

// ---------------------------------------------------------------- the menu (021 item 2)

describe("SPEC-PD-021 item 2: a member target in the Target menu", () => {
  it("SPEC-PD-021 I7 a folder with free text, a negated operator, or free text with a duration is usable; a duration alone is not", async () => {
    await settled();
    await click(await targetButton("すべての写真"));
    const menu = screen.getByRole("menu");
    for (const f of [BEACH, NEGATED, FULL_TEXT, TEXT_DURATION]) {
      expect(within(menu).getByRole("menuitemradio", { name: new RegExp(f.name) })).not.toBeDisabled();
    }
    expect(within(menu).getByRole("menuitemradio", { name: new RegExp(`^${DURATION.name}`) })).toBeDisabled();
  });

  it.each([
    ["a negated operator", NEGATED],
    ["free text among every other operator", FULL_TEXT],
  ])("SPEC-PD-021 I7 a saved folder with %s is a member target in force", async (_label, f) => {
    auto = READY;
    writeAppTarget("family", APP, f.id);
    await settled();
    await targetButton(f.name);
    expect(evaluate.mock.calls[0][1]).toMatchObject({ id: f.id });
    await waitFor(() => expect(headerText()).toContain("family · 3枚"));
    expectMemberWire(photoReads(), MEMBERS);
  });
});

// ---------------------------------------------------------------- evaluation and ready (021 items 4 to 6)

describe("SPEC-PD-021 items 4 to 6: evaluating, then ready", () => {
  it.each(["?view=calendar", "?view=map", "?view=library", "?month=2026-07&date=2026-07-04"])(
    "SPEC-PD-021 I2 no photo request goes out while the members are evaluated (%s)",
    async (search) => {
      writeAppTarget("family", APP, BEACH.id);
      await settled(search);
      await targetButton("Beach");
      await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));
      expect(evaluate.mock.calls[0][0]).toBe("family");
      expect(evaluate.mock.calls[0][1]).toMatchObject({ id: BEACH.id, query: BEACH.query });
      await flush();
      expect(photoReads()).toEqual([]);
      noCount();
      await finish(READY);
      await waitFor(() => expect(photoReads().length).toBeGreaterThan(0));
      expectMemberWire(photoReads(), MEMBERS);
    },
  );

  it("SPEC-PD-021 I2 every photo request of every surface is a POST with the members and no target parameter", async () => {
    auto = READY;
    writeAppTarget("family", APP, BEACH.id);
    await settled("?month=2026-07&date=2026-07-04");
    await targetButton("Beach");
    await waitFor(() => expect(renderedIds()).toEqual(["m0", "m1"]));
    await waitFor(() => expect(headerText()).toContain("family · 3枚"));
    await click(screen.getByRole("button", { name: /撮影日なし/ }));
    await waitFor(() => expect(renderedIds()).toContain("mu0"));
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    expect(JSON.stringify(h.mapOptions.current!.points)).toContain("m0");
    await click(tab("ライブラリ"));
    await waitFor(() => expect(requests.some((r) => r.path === `${BASE}/library/shelves`)).toBe(true));
    await flush();
    const paths = new Set(photoReads().map((r) => r.path));
    for (const p of PHOTO_PATHS.filter((p) => !p.endsWith("/library/shelf"))) expect(paths).toContain(p);
    expectMemberWire(photoReads(), MEMBERS);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("SPEC-PD-021 I2 an empty member set is sent as file_ids: [] and selects no photo", async () => {
    auto = { status: "ready", fileIds: [] };
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=map");
    await targetButton("Beach");
    await screen.findByText("位置情報のある写真はありません");
    await click(tab("カレンダー"));
    await waitFor(() => expect(headerText()).toContain("family · 0枚"));
    for (const r of photoReads()) {
      expect(r.method).toBe("POST");
      expect(r.contentType).toMatch(/^application\/json/);
      expect(targetOf(r.query)).toEqual({});
      expect(r.body).toEqual({ file_ids: [] });
    }
    expect(photoReads().length).toBeGreaterThan(0);
  });

  it.each([
    ["ready", READY],
    ["failed", { status: "failed" } as Evaluation],
  ])("SPEC-PD-021 I8 choosing a member target from the menu shows nothing of the previous target while it evaluates, then when %s", async (_label, outcome) => {
    await settled("?month=2026-10");
    await day("10月3日 5枚");
    await waitFor(() => expect(headerText()).toContain("family · 108枚"));
    const before = photoReads().length;
    await choose("すべての写真", "Beach");
    expect(saved()).toBe(BEACH.id);
    await targetButton("Beach");
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
    expect(headerText()).not.toContain("108枚");
    noCount();
    expect(photoReads().length).toBe(before);
    await finish(outcome);
    if (outcome.status === "ready") {
      await day("7月4日 2枚");
      expectMemberWire(photoReads().slice(before), MEMBERS);
    } else {
      await screen.findByText("読み込めませんでした");
      expect(photoReads().length).toBe(before);
      noCount();
    }
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
    expect(headerText()).not.toContain("108枚");
    expect(saved()).toBe(BEACH.id);
  });

  it("SPEC-PD-021 I2 a member target whose kinds hold no image sends none=true alone and evaluates nothing", async () => {
    auto = READY;
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=calendar");
    await day("7月4日 2枚");
    expect(evaluate).toHaveBeenCalledTimes(1);
    const before = photoReads().length;
    await choose("Beach", "Shore videos");
    await targetButton("Shore videos");
    await waitFor(() => expect(headerText()).toContain("family · 0枚"));
    expect(evaluate).toHaveBeenCalledTimes(1);
    const after = photoReads().slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const r of after) {
      expect(r.method).toBe("GET");
      expect(targetOf(r.query)).toEqual({ none: ["true"] });
    }
  });
});

// ---------------------------------------------------------------- failure (021 item 7)

describe("SPEC-PD-021 item 7: a failed evaluation", () => {
  it("SPEC-PD-021 I3 the calendar draws its load failure alone, and retry evaluates again", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=calendar");
    await finish({ status: "failed" });
    await screen.findByText("読み込めませんでした");
    expect(screen.queryByRole("heading", { name: /年\d+月/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /\d+月\d+日/ })).toBeNull();
    await targetButton("Beach");
    noCount();
    expect(photoReads()).toEqual([]);
    expect(saved()).toBe(BEACH.id);
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));
    await finish(READY);
    await day("7月4日 2枚");
    await waitFor(() => expect(headerText()).toContain("family · 3枚"));
    expectMemberWire(photoReads(), MEMBERS);
  });

  it("SPEC-PD-021 I3 the map draws its failed phase with no map stage", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=map");
    await finish({ status: "failed" });
    await screen.findByText("読み込めませんでした");
    expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
    expect(photoReads()).toEqual([]);
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));
    await finish(READY);
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
  });

  it("SPEC-PD-021 I3 the Library shows its first-load retry", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=library");
    await finish({ status: "failed" });
    const retry = await screen.findByRole("button", { name: "再試行" });
    expect(photoReads()).toEqual([]);
    await click(retry);
    await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));
    await finish(READY);
    await waitFor(() =>
      expect(photoReads().filter((r) => r.path === `${BASE}/library/shelves`).length).toBeGreaterThan(0),
    );
    expectMemberWire(photoReads(), MEMBERS);
  });
});

describe("SPEC-PD-021 item 7: a member set too large", () => {
  it.each(["?view=calendar", "?view=map", "?view=library"])(
    "SPEC-PD-021 I3 the body is この対象は使えません with no retry, and the target stays (%s)",
    async (search) => {
      writeAppTarget("family", APP, BEACH.id);
      await settled(search);
      await finish({ status: "tooLarge" });
      await screen.findByText("この対象は使えません");
      expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
      expect(screen.queryByText("読み込めませんでした")).toBeNull();
      await targetButton("Beach");
      noCount();
      expect(photoReads()).toEqual([]);
      expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
      expect(saved()).toBe(BEACH.id);
      expect(evaluate).toHaveBeenCalledTimes(1);
    },
  );

  it("SPEC-PD-021 too large is left by another target", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=calendar");
    await finish({ status: "tooLarge" });
    await screen.findByText("この対象は使えません");
    await choose("Beach", "Trip");
    await day("9月2日 2枚");
    expect(screen.queryByText("この対象は使えません")).toBeNull();
  });
});

// ---------------------------------------------------------------- what evaluates again (021 item 8, I9)

describe("SPEC-PD-021 I9: what evaluates again", () => {
  it("SPEC-PD-021 switching views and choosing the target in force again evaluate nothing", async () => {
    auto = READY;
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=calendar");
    await day("7月4日 2枚");
    await click(tab("地図"));
    await click(tab("ライブラリ"));
    await click(tab("カレンダー"));
    await choose("Beach", "Beach");
    await flush();
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("SPEC-PD-021 the late arrival of the collection list evaluates nothing again", async () => {
    auto = READY;
    const release = hold(isCollections);
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=calendar");
    await day("7月4日 2枚");
    await release();
    await flush();
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("SPEC-PD-021 a write through the context menu reads again with the held members", async () => {
    auto = READY;
    writeAppTarget("family", APP, BEACH.id);
    await settled("?month=2026-07&date=2026-07-04");
    await waitFor(() => expect(renderedIds()).toEqual(["m0", "m1"]));
    const before = photoReads().length;
    await click(screen.getByRole("button", { name: "mock-refresh" }));
    await waitFor(() => expect(photoReads().length).toBeGreaterThan(before));
    expect(evaluate).toHaveBeenCalledTimes(1);
    expectMemberWire(photoReads().slice(before), MEMBERS);
  });

  it("SPEC-PD-021 a new mount evaluates again", async () => {
    auto = READY;
    writeAppTarget("family", APP, BEACH.id);
    const first = await settled("?view=calendar");
    await day("7月4日 2枚");
    first.unmount();
    await settled("?view=calendar");
    await day("7月4日 2枚");
    await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));
  });
});

// ---------------------------------------------------------------- saved state and restore (021 items 5, 7, 10)

describe("SPEC-PD-021 I4: restore and saved state", () => {
  it.each(["failed", "tooLarge"] as const)(
    "SPEC-PD-021 under %s nothing is restored and leaving the page leaves the saved state as it was",
    async (status) => {
      const seeded = { list: { loaded: 80, scrollY: 640 }, listView: "calendar" as const, target: BEACH.id };
      saveState("family", seeded);
      writeAppTarget("family", APP, BEACH.id);
      const page = await settled("?month=2026-07&date=2026-07-04");
      await finish({ status });
      await screen.findByText(status === "failed" ? "読み込めませんでした" : "この対象は使えません");
      expect(h.scroll.calls).not.toContain(640);
      page.unmount();
      expect(loadState("family")).toEqual(seeded);
    },
  );

  it("SPEC-PD-021 a list position saved under the member target is restored once ready, not before", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 }, listView: "calendar", target: BEACH.id });
    writeAppTarget("family", APP, BEACH.id);
    await settled("?month=2026-07&date=2026-07-04");
    await flush();
    expect(h.scroll.calls).not.toContain(640);
    await finish(READY);
    await waitFor(() => expect(renderedIds()).toEqual(["m0", "m1"]));
    await waitFor(() => expect(h.scroll.calls).toContain(640));
    const read = photoReads().find((r) => r.path === `${BASE}/photos` && r.query.get("date") === "2026-07-04");
    expect(read?.method).toBe("POST");
    expect(read?.query.get("limit")).toBe("80");
  });

  it("SPEC-PD-021 the restore runs once ready also when ready comes after a retry", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 }, listView: "calendar", target: BEACH.id });
    writeAppTarget("family", APP, BEACH.id);
    await settled("?month=2026-07&date=2026-07-04");
    await finish({ status: "failed" });
    await click(await screen.findByRole("button", { name: "再試行" }));
    await finish(READY);
    await waitFor(() => expect(renderedIds()).toEqual(["m0", "m1"]));
    await waitFor(() => expect(h.scroll.calls).toContain(640));
  });

  it("SPEC-PD-021 a pin list saved under the member target is reopened once ready, with the map's centre and zoom", async () => {
    saveState("family", {
      zoom: 7,
      center: [1, 2],
      pointIds: ["m0"],
      list: { loaded: 40, scrollY: 120 },
      listView: "map",
      target: BEACH.id,
    });
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=map");
    await flush();
    expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
    await finish(READY);
    await waitFor(() => expect(h.mapOptions.current).not.toBeNull());
    expect(h.mapOptions.current!.center).toEqual([1, 2]);
    expect(h.mapOptions.current!.zoom).toBe(7);
    await waitFor(() => expect(renderedIds()).toEqual(["m0"]));
  });
});

// ---------------------------------------------------------------- the second read (021 item 5, I9)

describe("SPEC-PD-021 I9: the daily notes' second read", () => {
  it("starts its clock at ready, not at the end of the look-up", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await settled("?month=2026-07&date=2026-07-04");
    await targetButton("Beach");
    await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));
    await flush();
    expect(noteReads("2026-07-04")).toBe(1);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 3300));
    });
    expect(noteReads("2026-07-04")).toBe(1);

    await finish(READY);
    await waitFor(() => expect(renderedIds()).toEqual(["m0", "m1"]));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3300));
    });
    expect(noteReads("2026-07-04")).toBe(2);
  }, 15000);
});

// ---------------------------------------------------------------- collections (022)
describe("SPEC-PD-022: collection targets", () => {
  it("SPEC-PD-022 I6 the menu lists the drive's collections, and choosing one saves collection:<id> and sends collection=<name> on GET", async () => {
    await settled("?view=calendar");
    await day("10月3日 5枚");
    const before = photoReads().length;
    await choose("すべての写真", /Album/);
    expect(saved()).toBe(ALBUM_ID);
    expect(readAppTarget("family", "video")).toBe("default");
    await targetButton("Album");
    await day("6月1日 1枚");
    const after = photoReads().slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const r of after) {
      expect(r.method).toBe("GET");
      expect(targetOf(r.query)).toEqual({ collection: ["Album"] });
    }
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("SPEC-PD-022 I5 a saved collection waits for the collection list only, then every photo request carries its name", async () => {
    writeAppTarget("family", APP, ALBUM_ID);
    const release = hold(isCollections);
    await settled("?view=calendar");
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await flush();
    await targetButton("…");
    expect(photoReads()).toEqual([]);
    await release();
    await targetButton("Album");
    await day("6月1日 1枚");
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    await click(tab("ライブラリ"));
    await waitFor(() => expect(requests.some((r) => r.path === `${BASE}/library/shelves`)).toBe(true));
    for (const r of photoReads()) {
      expect(r.method).toBe("GET");
      expect(targetOf(r.query)).toEqual({ collection: ["Album"] });
    }
  });

  it("SPEC-PD-022 I5 a saved collection not in the loaded list gives the default target and keeps the saved id", async () => {
    writeAppTarget("family", APP, "collection:gone00000000");
    const release = hold(isCollections);
    await settled("?view=calendar");
    await flush();
    expect(photoReads()).toEqual([]);
    await release();
    await targetButton("すべての写真");
    await day("10月3日 5枚");
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual({});
    expect(saved()).toBe("collection:gone00000000");
  });

  it("SPEC-PD-022 item 4 a failed collection list gives the default target; a retry from Manage… applies the saved collection", async () => {
    writeAppTarget("family", APP, ALBUM_ID);
    answer(isCollections, () => json({ detail: "x" }, 500));
    await settled("?view=calendar");
    await targetButton("すべての写真");
    await day("10月3日 5枚");
    expect(saved()).toBe(ALBUM_ID);
    await click(await targetButton("すべての写真"));
    await click(screen.getByRole("menuitem", { name: /管理/ }));
    const dialog = screen.getByRole("dialog");
    await click(within(dialog).getByRole("button", { name: "再試行" }));
    await flush();
    await targetButton("Album");
    await day("6月1日 1枚");
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
  });

  it("SPEC-PD-022 I9 a saved Smart Collection does not wait for the collection list", async () => {
    writeAppTarget("family", APP, TRIP.id);
    const release = hold(isCollections);
    await settled("?view=calendar");
    await waitFor(() => expect(requests.some(isCollections)).toBe(true));
    await targetButton("Trip");
    await day("9月2日 2枚");
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual({ tag: ["trip"] });
    await release();
  });

  it("SPEC-PD-022 item 2 the default target waits for neither list", async () => {
    const releaseCollections = hold(isCollections);
    const releaseFolders = hold(isFolders);
    await settled("?view=calendar");
    await waitFor(() => expect(requests.some(isCollections)).toBe(true));
    await targetButton("すべての写真");
    await day("10月3日 5枚");
    for (const r of photoReads()) expect(targetOf(r.query)).toEqual({});
    await releaseFolders();
    await releaseCollections();
  });
});

// ---------------------------------------------------------------- the shelf page (021 items 4 to 7, 022)

describe("SPEC-PD-021: the shelf page under a member target", () => {
  it("SPEC-PD-021 I2 no shelf request goes out while evaluating; once ready the shelf is a POST with the members", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await openShelf("?by=month&key=2026-07");
    await targetButton("Beach");
    await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));
    await flush();
    expect(photoReads()).toEqual([]);
    noCount();
    await finish(READY);
    await waitFor(() => expect(renderedIds()).toEqual(["m0", "m1"]));
    const shelf = photoReads().filter((r) => r.path === `${BASE}/library/shelf`);
    expectMemberWire(shelf, MEMBERS);
    expect(shelf[0].query.get("by")).toBe("month");
    expect(shelf[0].query.get("key")).toBe("2026-07");
    expect(shelf[0].query.get("offset")).toBe("0");
    expectMemberWire(photoReads(), MEMBERS);
  });

  it("SPEC-PD-021 I3 a failed evaluation keeps the header and sort control and shows the load error; retry evaluates again", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await openShelf("?by=month&key=2026-07");
    await finish({ status: "failed" });
    await screen.findByText("読み込めませんでした");
    await screen.findByRole("button", { name: "並べ替え: 新しい順" });
    expect(screen.getByRole("link", { name: "フォトダイアリー" })).toBeInTheDocument();
    expect(photoReads()).toEqual([]);
    noCount();
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));
    await finish(READY);
    await waitFor(() => expect(renderedIds()).toEqual(["m0", "m1"]));
  });

  it("SPEC-PD-021 I3 a collection shelf under a failed evaluation is titled as before its first answer", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await openShelf("?by=collection&key=c0ll3ction01");
    await finish({ status: "failed" });
    await screen.findByText("読み込めませんでした");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("…");
    expect(photoReads()).toEqual([]);
  });

  it("SPEC-PD-021 I3 a member set too large replaces the photos with この対象は使えません and no retry", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await openShelf("?by=month&key=2026-07");
    await finish({ status: "tooLarge" });
    await screen.findByText("この対象は使えません");
    expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
    await screen.findByRole("button", { name: "並べ替え: 新しい順" });
    expect(photoReads()).toEqual([]);
    expect(saved()).toBe(BEACH.id);
  });

  it("SPEC-PD-021 I4 the shelf page's saved place is left as it was under a failed evaluation", async () => {
    auto = { status: "ready", fileIds: ids("mm", 100) };
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => 700 });
    writeAppTarget("family", APP, BEACH.id);
    const first = await openShelf("?by=month&key=2026-07");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    first.unmount();
    const kept = sessionStorage.getItem("photo_diary:shelf:family");
    expect(kept).not.toBeNull();
    auto = null;
    const second = await openShelf("?by=month&key=2026-07");
    await finish({ status: "failed" });
    await screen.findByText("読み込めませんでした");
    second.unmount();
    expect(sessionStorage.getItem("photo_diary:shelf:family")).toBe(kept);
  });

  it("SPEC-PD-022 the shelf page lists collections and a collection target sends collection=<name> on GET", async () => {
    writeAppTarget("family", APP, ALBUM_ID);
    await openShelf("?by=month&key=2026-06");
    await targetButton("Album");
    await waitFor(() => expect(renderedIds()).toEqual(["c0"]));
    for (const r of photoReads()) {
      expect(r.method).toBe("GET");
      expect(targetOf(r.query)).toEqual({ collection: ["Album"] });
    }
  });
});
