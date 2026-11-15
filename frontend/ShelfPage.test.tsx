/**
 * Acceptance tests for the shelf page, written from docs/specs/library.md
 * (SPEC-PD-020).
 *
 * The network is stood in for at `fetch`. The page module is loaded per test,
 * so each test reports on its own while the page does not exist yet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, configure, fireEvent, getConfig, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import coreEn from "@/messages-core/en.json";
import ja from "./messages/ja.json";
import en from "./messages/en.json";
import Page from "./Page";
import * as mapModule from "./map/createPhotoMap";
import { writeAppTarget } from "@/lib/appPrefs";
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

type Shelf = { label: string; ids: string[] };
type Req = { method: string; path: string; query: URLSearchParams };

const BASE = "/api/addons/photo_diary";
const PAGE = "/addons/photo_diary";
const TARGET_KEYS = ["search", "tag", "folder", "collection", "size", "favorite", "liked", "none", "type"];
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function defaultShelves(): Record<string, Shelf> {
  return {
    "month|2026-10": { label: "", ids: ids("m", 100) },
    "month|undated": { label: "", ids: ids("u", 3) },
    "tag|beach": { label: "beach", ids: ids("b", 5) },
    "tag|no_tag": { label: "", ids: ids("nt", 2) },
    "collection|c0ll3ction01": { label: "Summer album", ids: ids("c", 5) },
    "collection|nolabel00000": { label: "", ids: ids("c", 2) },
    "folder|": { label: "", ids: ids("root", 2) },
    "folder|2026/": { label: "2026", ids: ids("d26-", 2) },
    "folder|Photos/2026": { label: "2026", ids: ids("p26-", 4) },
    "folder|a&b c": { label: "a&b c", ids: ids("amp", 1) },
  };
}

const TRIP_SHELVES: Record<string, Shelf> = {
  "month|2026-10": { label: "", ids: ["t0", "t1"] },
};

let data: Record<string, Shelf>;
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

function route(r: Req): Response {
  if (r.path === `${BASE}/library/shelf`) {
    const t = targetName(r);
    if (t === null) {
      unexpected.push(`${r.path}?${r.query}`);
      return json({ detail: "unexpected" }, 500);
    }
    const set = t === "trip" ? TRIP_SHELVES : data;
    const s = set[`${r.query.get("by")}|${r.query.get("key")}`] ?? { label: "", ids: [] };
    const offset = Number(r.query.get("offset") ?? 0);
    const limit = Number(r.query.get("limit") ?? 40);
    const ordered = r.query.get("sort") === "oldest" ? [...s.ids].reverse() : s.ids;
    return json({ file_ids: ordered.slice(offset, offset + limit), total: s.ids.length, label: s.label });
  }
  if (r.path === `${BASE}/library/shelves`) {
    const offset = Number(r.query.get("offset") ?? 0);
    const shelves = offset > 0 ? [] : [{ key: "2026-10", label: "", count: 100, file_ids: ids("m", 12) }];
    return json({ shelves, total_shelves: 1 });
  }
  if (r.path === `${BASE}/calendar/months`) {
    const t = targetName(r);
    if (t === "trip") return json({ months: [{ month: "2026-10", count: 2 }], undated_count: 0 });
    return json({ months: [{ month: "2026-10", count: total - 3 }], undated_count: 3 });
  }
  if (r.path === `${BASE}/note`) return json({ state: "none", file_id: null });
  if (r.path.startsWith(BASE)) {
    unexpected.push(r.path);
    return json({ detail: "unexpected route" }, 500);
  }
  if (/^\/api\/drives\/[^/]+\/smart-folders$/.test(r.path)) return json(folders);
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
const isShelf = (r: Req) => r.path === `${BASE}/library/shelf`;
const isLibrary = (r: Req) => r.path.startsWith(`${BASE}/library/`);
const isMonths = (r: Req) => r.path === `${BASE}/calendar/months`;
const shelfReads = () => requests.filter(isShelf);
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
  expect(unexpected).toEqual([]);
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const libraryPath = () => `/drive/${h.drive.current}${PAGE}`;
const shelfPath = () => `${libraryPath()}/shelf`;

async function ShelfPage(): Promise<any> {
  const path = "./pages/shelf";
  return (await import(/* @vite-ignore */ path)).default;
}

async function open(search: string, locale: "ja" | "en" = "ja") {
  const Shelf = await ShelfPage();
  window.history.replaceState(null, "", `${shelfPath()}${search}`);
  const messages = locale === "ja" ? { ...coreJa, ...ja } : { ...coreEn, ...en };
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Shelf />
    </NextIntlClientProvider>,
  );
  await flush();
  return view;
}

async function openLibrary(search: string) {
  window.history.replaceState(null, "", `${libraryPath()}${search}`);
  const view = render(
    <NextIntlClientProvider locale="ja" messages={{ ...coreJa, ...ja }}>
      <Page />
    </NextIntlClientProvider>,
  );
  await flush();
  return view;
}

const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const title = () => screen.getByRole("heading", { level: 1 }).textContent;
const headerText = () => document.querySelector("header")?.textContent ?? "";
const query = () => new URLSearchParams(window.location.search);
const renderedIds = () =>
  Array.from(document.querySelectorAll("[data-testid=file]")).map((e) => e.getAttribute("data-id")!);
const sortButton = (value: string) => screen.findByRole("button", { name: `並べ替え: ${value}` });

function option(name: string): HTMLElement {
  return (screen.queryByRole("menuitemradio", { name }) ?? screen.getByRole("radio", { name })) as HTMLElement;
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

async function loadMore() {
  await act(async () => {
    for (const o of [...h.observers]) {
      o.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], o as any);
    }
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 0));
  });
}

function backLink(): URL {
  const link = screen.getByRole("link", { name: "フォトダイアリー" });
  return new URL(link.getAttribute("href")!, `http://localhost${shelfPath()}`);
}

function expectBackToLibrary() {
  const u = backLink();
  expect(u.pathname).toBe(libraryPath());
  expect(u.search).toBe("?view=library");
}

// ---------------------------------------------------------------- invalid links (item 12)

describe("SPEC-PD-020: a link the page cannot open", () => {
  it.each([
    "",
    "?key=2026-10",
    "?by=year&key=2026",
    "?by=Month&key=2026-10",
    "?by=month",
    "?by=month&key=",
    "?by=tag&key=",
    "?by=collection&key=",
    "?by=tag",
    "?by=month&key=2026-13",
    "?by=month&key=2026-1",
    "?by=month&key=2026-10-03",
    "?by=month&key=Undated",
  ])("SPEC-PD-020 %s shows the invalid-link state at once and sends nothing", async (search) => {
    await open(search);
    expect(screen.getByText("このリンクは開けません")).toBeInTheDocument();
    expect(title()).toBe("フォトダイアリー");
    expectBackToLibrary();
    expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
    await flush();
    expect(requests.filter(isLibrary)).toEqual([]);
  });

  it("SPEC-PD-020 a 422 from the server is the invalid-link state, with no retry", async () => {
    answer(isShelf, () => json({ detail: "bad key" }, 422), false);
    await open("?by=tag&key=beach");
    await screen.findByText("このリンクは開けません");
    expectBackToLibrary();
    expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
    expect(shelfReads()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- header and request (items 13, 14)

describe("SPEC-PD-020: the page", () => {
  it("SPEC-PD-020 requests the shelf with by, key, sort=newest, limit=40 and offset=0 and draws its photos in order", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    expect(renderedIds()).toEqual(ids("m", 40));
    const q = shelfReads()[0].query;
    expect(q.get("by")).toBe("month");
    expect(q.get("key")).toBe("2026-10");
    expect(q.get("sort")).toBe("newest");
    expect(q.get("limit")).toBe("40");
    expect(q.get("offset")).toBe("0");
    expect(targetOf(q)).toEqual({});
    expect(shelfReads()[0].method).toBe("GET");
  });

  it("SPEC-PD-020 the header: title from the key, back link to ?view=library, scope line with the total, sort, no tabs", async () => {
    const release = hold(isShelf);
    await open("?by=month&key=2026-10");
    expect(title()).toBe("2026年10月");
    expectBackToLibrary();
    expect(headerText()).toContain("family");
    expect(headerText()).not.toContain("100枚");
    await release();
    await waitFor(() => expect(headerText()).toContain("family · 100枚"));
    await sortButton("新しい順");
    await screen.findByRole("button", { name: /^対象: / });
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("SPEC-PD-020 the Target's count is read as on the Library", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(requests.some(isMonths)).toBe(true));
    expect(targetOf(requests.find(isMonths)!.query)).toEqual({});
  });

  it.each([
    ["?by=month&key=undated", "撮影日なし"],
    ["?by=tag&key=beach", "beach"],
    ["?by=tag&key=no_tag", "タグなし"],
    ["?by=folder&key=", "family"],
    ["?by=folder&key=2026%2F", "2026"],
    ["?by=folder&key=Photos%2F2026", "2026"],
    ["?by=folder&key=a%26b%20c", "a&b c"],
  ])("SPEC-PD-020 %s is titled %s at once, before any answer", async (search, expected) => {
    hold(isShelf);
    await open(search);
    expect(title()).toBe(expected);
  });

  it("SPEC-PD-020 English: a month title and the Photo Diary back link", async () => {
    hold(isShelf);
    await open("?by=month&key=2026-11", "en");
    expect(title()).toBe("Nov 2026");
    expect(screen.getByRole("link", { name: "Photo Diary" })).toBeInTheDocument();
  });

  it("SPEC-PD-020 a collection is titled … until its label arrives, then by the label", async () => {
    const release = hold(isShelf);
    await open("?by=collection&key=c0ll3ction01");
    expect(title()).toBe("…");
    await release();
    await waitFor(() => expect(title()).toBe("Summer album"));
  });

  it("SPEC-PD-020 a collection with an empty label is titled コレクション", async () => {
    await open("?by=collection&key=nolabel00000");
    await waitFor(() => expect(title()).toBe("コレクション"));
  });

  it("SPEC-PD-020 a collection whose read fails is titled コレクション", async () => {
    answer(isShelf, () => json({ detail: "boom" }, 500), false);
    await open("?by=collection&key=c0ll3ction01");
    await screen.findByText("読み込めませんでした");
    expect(title()).toBe("コレクション");
  });

  it("SPEC-PD-020 sort=oldest in the URL is in force; any other value is newest", async () => {
    const first = await open("?by=month&key=2026-10&sort=oldest");
    await sortButton("古い順");
    await waitFor(() => expect(renderedIds()[0]).toBe("m99"));
    expect(lastShelfRead().get("sort")).toBe("oldest");
    first.unmount();
    requests = [];
    await open("?by=month&key=2026-10&sort=bogus");
    await sortButton("新しい順");
    await waitFor(() => expect(shelfReads().length).toBeGreaterThan(0));
    expect(lastShelfRead().get("sort")).toBe("newest");
  });

  it("SPEC-PD-020 40 more photos load when the end nears", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    expect(lastShelfRead().get("offset")).toBe("40");
    expect(lastShelfRead().get("limit")).toBe("40");
    expect(renderedIds()).toEqual(ids("m", 80));
  });

  it("SPEC-PD-020 an id the batch read no longer returns is skipped", async () => {
    h.missing.add("b2");
    await open("?by=tag&key=beach");
    await waitFor(() => expect(renderedIds()).toEqual(["b0", "b1", "b3", "b4"]));
  });
});

// ---------------------------------------------------------------- sort (item 15)

describe("SPEC-PD-020 I14: changing the sort", () => {
  it("SPEC-PD-020 replaces the URL's sort with no history entry, reloads from the first page, and leaves the saved sort alone", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    const before = window.history.length;
    requests = [];
    await sortBy("新しい順", "古い順");
    await waitFor(() => expect(query().get("sort")).toBe("oldest"));
    expect(query().get("by")).toBe("month");
    expect(query().get("key")).toBe("2026-10");
    expect(window.location.pathname).toBe(shelfPath());
    expect(window.history.length).toBe(before);
    await waitFor(() => expect(renderedIds()[0]).toBe("m99"));
    expect(shelfReads()[0].query.get("offset")).toBe("0");
    expect(shelfReads()[0].query.get("sort")).toBe("oldest");
    expect(renderedIds()).toHaveLength(40);
    expect(localStorage.getItem(`${PREF}sort.family`)).toBeNull();
    await sortBy("古い順", "新しい順");
    await waitFor(() => expect(query().get("sort")).not.toBe("oldest"));
    expect(window.history.length).toBe(before);
    expect(localStorage.getItem(`${PREF}sort.family`)).toBeNull();
  });

  it("SPEC-PD-020 I8 while the new sort loads, no photo of the old one is on screen", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    const release = hold((r) => isShelf(r) && r.query.get("sort") === "oldest");
    await sortBy("新しい順", "古い順");
    expect(renderedIds()).toEqual([]);
    await release();
    await waitFor(() => expect(renderedIds()[0]).toBe("m99"));
  });
});

// ---------------------------------------------------------------- target (item 16)

describe("SPEC-PD-020: the Target on the shelf page", () => {
  it("SPEC-PD-020 a target change reloads the photos and total under the new target and keeps the URL", async () => {
    await open("?by=month&key=2026-10&sort=oldest");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    const search = window.location.search;
    const release = hold((r) => isShelf(r) && targetName(r) === "trip");
    await chooseTarget("すべての写真", "Trip");
    expect(renderedIds()).toEqual([]);
    expect(headerText()).not.toContain("100枚");
    await release();
    await waitFor(() => expect(renderedIds()).toEqual(["t1", "t0"]));
    await waitFor(() => expect(headerText()).toContain("family · 2枚"));
    expect(targetOf(lastShelfRead())).toEqual({ tag: ["trip"] });
    expect(lastShelfRead().get("offset")).toBe("0");
    expect(window.location.search).toBe(search);
    const months = requests.filter(isMonths).at(-1)!;
    expect(targetOf(months.query)).toEqual({ tag: ["trip"] });
  });

  it("SPEC-PD-020 the page opens under the drive's saved target", async () => {
    writeAppTarget("family", { addon: "photo_diary" }, TRIP.id);
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toEqual(["t0", "t1"]));
    expect(shelfReads().every((r) => targetName(r) === "trip")).toBe(true);
  });
});

// ---------------------------------------------------------------- failures (section 2)

describe("SPEC-PD-020: failures", () => {
  it("SPEC-PD-020 a shelf with no photo shows 写真はありません and the back link", async () => {
    await open("?by=tag&key=gone");
    await screen.findByText("写真はありません");
    expectBackToLibrary();
    expect(renderedIds()).toEqual([]);
  });

  it("SPEC-PD-020 a 404 shows not available", async () => {
    answer(isShelf, () => json({ detail: "Not Found" }, 404), false);
    await open("?by=month&key=2026-10");
    await screen.findByText("このドライブでは使えません");
    expect(shelfReads().length).toBeGreaterThan(0);
  });

  it.each([500, 400])("SPEC-PD-020 a %i on the first page shows LoadError with retry, and retry loads it", async (status) => {
    answer(isShelf, () => json({ detail: "boom" }, status));
    await open("?by=month&key=2026-10");
    await screen.findByText("読み込めませんでした");
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
  });

  it("SPEC-PD-020 a failed batch read of the first page shows LoadError with retry", async () => {
    vi.mocked(coreApi.batchGetFiles).mockRejectedValueOnce(new Error("batch"));
    await open("?by=month&key=2026-10");
    await screen.findByText("読み込めませんでした");
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
  });

  it("SPEC-PD-020 a failed later page keeps the drawn photos and offers a retry below them", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    answer((r) => isShelf(r) && r.query.get("offset") === "40", () => json({ detail: "boom" }, 500));
    await loadMore();
    const retry = await screen.findByRole("button", { name: "再試行" });
    expect(renderedIds()).toHaveLength(40);
    const lastPhoto = document.querySelectorAll("[data-testid=file]")[39];
    expect(lastPhoto.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(retry);
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
  });
});

// ---------------------------------------------------------------- after a write (item 17, I13)

describe("SPEC-PD-020 I13: after a write through the context menu", () => {
  it("SPEC-PD-020 every loaded photo and the total are read again; a photo that left is gone; depth and scroll stay", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    data["month|2026-10"] = { label: "", ids: ids("m", 100).filter((id) => id !== "m5") };
    total = 112;
    requests = [];
    h.scroll.calls.length = 0;
    await click(screen.getAllByText("mock-refresh")[0]);
    await waitFor(() => expect(renderedIds()).not.toContain("m5"));
    expect(renderedIds()).toHaveLength(80);
    await waitFor(() => expect(headerText()).toContain("family · 99枚"));
    expect(requests.filter(isMonths).length).toBeGreaterThan(0);
    expect(h.scroll.calls.filter((y) => y === 0)).toEqual([]);
  });

  it("SPEC-PD-020 a failed re-read keeps what is drawn and shows LoadError above it", async () => {
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    answer(isShelf, () => json({ detail: "boom" }, 500), false);
    await click(screen.getAllByText("mock-refresh")[0]);
    await screen.findByText("読み込めませんでした");
    expect(renderedIds()).toHaveLength(40);
    const error = screen.getByText("読み込めませんでした");
    const firstPhoto = document.querySelector("[data-testid=file]")!;
    expect(error.compareDocumentPosition(firstPhoto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------------------------------------------------------------- restore (I9)

describe("SPEC-PD-020 I9: going back to the shelf page", () => {
  async function leaveAt80(search = "?by=month&key=2026-10") {
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => 700 });
    const view = await open(search);
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    view.unmount();
    requests = [];
    h.scroll.calls.length = 0;
  }

  it("SPEC-PD-020 Back restores the loaded photos and the scroll position", async () => {
    await leaveAt80();
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds().length).toBeGreaterThanOrEqual(80));
    await waitFor(() => expect(h.scroll.calls).toContain(700));
  });

  it.each([
    ["another key", "?by=tag&key=beach"],
    ["another sort", "?by=month&key=2026-10&sort=oldest"],
  ])("SPEC-PD-020 %s is not restored", async (_name, search) => {
    await leaveAt80();
    await open(search);
    await waitFor(() => expect(renderedIds().length).toBeGreaterThan(0));
    await flush();
    expect(shelfReads().map((r) => r.query.get("offset"))).toEqual(["0"]);
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-020 another target is not restored", async () => {
    await leaveAt80();
    writeAppTarget("family", { addon: "photo_diary" }, TRIP.id);
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toEqual(["t0", "t1"]));
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-020 another drive is not restored", async () => {
    await leaveAt80();
    h.drive.current = "work";
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await flush();
    expect(shelfReads().map((r) => r.query.get("offset"))).toEqual(["0"]);
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-020 See all always opens a shelf from its first page", async () => {
    await leaveAt80();
    const library = await openLibrary("?view=library");
    const link = await screen.findByRole("link", { name: "すべて見る" });
    await click(link);
    library.unmount();
    expect(window.location.pathname).toBe(shelfPath());
    requests = [];
    const Shelf = await ShelfPage();
    render(
      <NextIntlClientProvider locale="ja" messages={{ ...coreJa, ...ja }}>
        <Shelf />
      </NextIntlClientProvider>,
    );
    await flush();
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await flush();
    expect(shelfReads().map((r) => r.query.get("offset"))).toEqual(["0"]);
    expect(h.scroll.calls).not.toContain(700);
  });

  it("SPEC-PD-020 a fresh start of Photo Diary removes the shelf page's saved place", async () => {
    await leaveAt80();
    const library = await openLibrary("");
    await screen.findByRole("link", { name: "すべて見る" });
    library.unmount();
    requests = [];
    await open("?by=month&key=2026-10");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await flush();
    expect(shelfReads().map((r) => r.query.get("offset"))).toEqual(["0"]);
    expect(h.scroll.calls).not.toContain(700);
  });
});
