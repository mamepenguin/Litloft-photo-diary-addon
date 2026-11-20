/**
 * Acceptance tests written from docs/specs/app-parity.md (SPEC-PD-023, SPEC-PD-024,
 * SPEC-PD-025): the Library's view per Target, its tag filter, and Home shortcuts.
 *
 * The network is stood in for at `fetch`. The stub server answers each photo route
 * from one photo table, narrowed by the target and every `tag` sent, and records as
 * unexpected any request whose conditions no Target of this file would send.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
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
import { readAppTarget, readTargetView, writeAppTarget } from "@/lib/appPrefs";
import * as memberTarget from "@/lib/memberTarget";
import type { SmartFolder } from "@/types/smartFolder";

const h = vi.hoisted(() => ({
  drive: { current: "family" as string | null },
  listeners: new Set<() => void>(),
  observers: new Set<{ callback: IntersectionObserverCallback }>(),
  scroll: { calls: [] as number[] },
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

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: any) => children,
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
const VIEW_KEY = "litloft.addon.photo_diary.view.family";
const OLD_GROUP_KEY = "litloft.addon.photo_diary.classification.family";
const OLD_SORT_KEY = "litloft.addon.photo_diary.sort.family";
const TARGET_KEY = "litloft.addon.photo_diary.target.family";

function folder(id: string, name: string, query: string, file_type: SmartFolder["file_type"] = null): SmartFolder {
  return { id, drive: "family", name, query, file_type, sort_by: null, sort_order: null, created_at: "2026-01-01T00:00:00Z", updated_at: null };
}

const TRIP = folder("sf-trip", "Trip", "tag:trip");
const BEACH = folder("sf-beach", "Beach", "beach tag:trip");
const SHORE = folder("sf-shore", "Shore videos", "shore", "video");
const DURATION = folder("sf-long", "Long ones", "duration:>1m");
const FOLDERS = [TRIP, BEACH, SHORE, DURATION];

const ALBUM = {
  id: "c0ll3ction01",
  name: "Album",
  description: null,
  drive: "family",
  item_count: 2,
  first_file_id: "c0",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const ALBUM_ID = `collection:${ALBUM.id}`;
const ALBUM_IDS = ["c0", "a2"];
const MEMBERS = ["m0", "m1", "mu0", "v0"];

// ---------------------------------------------------------------- the server

type Photo = { id: string; month: string | null; tags: string[] };
type Req = { method: string; path: string; query: URLSearchParams; body: any };

const BASE = "/api/addons/photo_diary";
const PAGE = "/addons/photo_diary";
const TARGET_KEYS = ["search", "tag", "folder", "collection", "size", "favorite", "liked", "none", "type"];
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const P = (id: string, month: string | null, tags: string[] = []): Photo => ({ id, month, tags });
const fold = (s: string) => s.toLowerCase();

function basePhotos(): Photo[] {
  return [
    P("a0", "2026-10", ["beach"]),
    P("a1", "2026-10", ["beach", "family"]),
    P("a2", "2026-09", ["family"]),
    P("a4", "2026-09"),
    P("t0", "2026-08", ["trip", "beach"]),
    P("t1", "2026-08", ["trip"]),
    P("m0", "2026-07", ["beach"]),
    P("m1", "2026-07"),
    P("c0", "2026-06", ["beach"]),
    P("a3", null, ["beach"]),
    P("mu0", null, ["beach"]),
  ];
}

let photos: Photo[];
let folders: SmartFolder[];
let collections: (typeof ALBUM)[];
let shortcuts: { kind: string; app: string | null; id: string }[];
let shortcutPuts: any[];
let requests: Req[];
let unexpected: string[];
let overrides: { match: (r: Req) => boolean; respond: (r: Req) => Response | Promise<Response>; once: boolean }[];

const targetOf = (q: URLSearchParams) =>
  Object.fromEntries(TARGET_KEYS.filter((k) => q.has(k)).map((k) => [k, q.getAll(k)]));

const isLibraryPath = (p: string) => p.startsWith(`${BASE}/library/`);
const PHOTO_PATHS = [
  `${BASE}/calendar/months`,
  `${BASE}/calendar/days`,
  `${BASE}/photos`,
  `${BASE}/points`,
  `${BASE}/library/shelves`,
  `${BASE}/library/shelf`,
];

function checkTags(r: Req, tags: string[]) {
  const folded = tags.map(fold);
  if (tags.some((t) => t === "") || new Set(folded).size !== folded.length) {
    unexpected.push(`bad tag list ${r.method} ${r.path}?${r.query}`);
  }
}

/** The photo set a request's conditions select, before its `tag` values; null when no Target sends them. */
function baseSet(r: Req, allowChosenTags: boolean): Photo[] | null {
  const q = r.query;
  const keys = TARGET_KEYS.filter((k) => q.has(k));
  const other = keys.filter((k) => k !== "tag");
  const tags = q.getAll("tag");
  if (r.method === "POST") {
    if (other.length > 0 || !Array.isArray(r.body?.file_ids)) return null;
    if (tags.length > 0 && !allowChosenTags) return null;
    return photos.filter((p) => r.body.file_ids.includes(p.id));
  }
  if (r.method !== "GET") return null;
  if (!allowChosenTags && tags.length > 0 && !(other.length === 0 && tags.length === 1 && tags[0] === "trip")) return null;
  if (other.length === 0) return photos;
  if (other.length === 1 && other[0] === "collection" && q.getAll("collection").join() === ALBUM.name) {
    return photos.filter((p) => ALBUM_IDS.includes(p.id));
  }
  if (other.length === 1 && other[0] === "none" && q.get("none") === "true" && tags.length === 0) return [];
  return null;
}

const narrowed = (set: Photo[], tags: string[]) =>
  set.filter((p) => tags.every((t) => p.tags.some((x) => fold(x) === fold(t))));

function monthsOf(set: Photo[], sort: string) {
  const months = [...new Set(set.filter((p) => p.month).map((p) => p.month!))].sort();
  if (sort !== "oldest") months.reverse();
  return months;
}

function inOrder(list: Photo[], sort: string) {
  return sort === "oldest" ? [...list].reverse() : list;
}

function shelvesOf(set: Photo[], by: string, sort: string) {
  if (by === "all") return set.length ? [{ key: "all", label: "", list: allOrder(set, sort) }] : [];
  if (by === "month") {
    const out = monthsOf(set, sort).map((m) => ({ key: m, label: "", list: inOrder(set.filter((p) => p.month === m), sort) }));
    const undated = set.filter((p) => !p.month);
    if (undated.length) out.push({ key: "undated", label: "", list: undated });
    return out;
  }
  if (by === "tag") {
    const names = [...new Set(set.flatMap((p) => p.tags))].sort();
    return names.map((n) => ({ key: n, label: n, list: set.filter((p) => p.tags.includes(n)) }));
  }
  return set.length ? [{ key: by === "folder" ? "" : "no_collection", label: "", list: set }] : [];
}

function allOrder(set: Photo[], sort: string) {
  const dated = monthsOf(set, sort).flatMap((m) => inOrder(set.filter((p) => p.month === m), sort));
  return [...dated, ...set.filter((p) => !p.month)];
}

function photoRoute(r: Req): Response {
  const lib = isLibraryPath(r.path);
  const set0 = baseSet(r, lib);
  if (set0 === null) {
    unexpected.push(`${r.method} ${r.path}?${r.query}`);
    return json({ detail: "unexpected target" }, 500);
  }
  const tags = r.query.getAll("tag");
  checkTags(r, tags);
  const set = narrowed(set0, tags);
  const sort = r.query.get("sort") ?? "newest";
  if (r.path === `${BASE}/library/shelves`) {
    const all = shelvesOf(set, r.query.get("by") ?? "", sort);
    const offset = Number(r.query.get("offset") ?? 0);
    const limit = Number(r.query.get("shelf_limit") ?? 12);
    const per = Number(r.query.get("per_shelf") ?? 12);
    return json({
      shelves: all.slice(offset, offset + limit).map((s) => ({
        key: s.key,
        label: s.label,
        count: s.list.length,
        file_ids: s.list.slice(0, per).map((p) => p.id),
      })),
      total_shelves: all.length,
    });
  }
  if (r.path === `${BASE}/library/shelf`) {
    const by = r.query.get("by") ?? "";
    const key = r.query.get("key") ?? "";
    const shelf = shelvesOf(set, by, sort).find((s) => s.key === key);
    const list = shelf?.list ?? [];
    const offset = Number(r.query.get("offset") ?? 0);
    const limit = Number(r.query.get("limit") ?? 40);
    return json({ file_ids: list.slice(offset, offset + limit).map((p) => p.id), total: list.length, label: shelf?.label ?? "" });
  }
  if (r.path === `${BASE}/calendar/months`) {
    const months = monthsOf(set, "newest").map((m) => ({ month: m, count: set.filter((p) => p.month === m).length }));
    return json({ months, undated_count: set.filter((p) => !p.month).length });
  }
  if (r.path === `${BASE}/calendar/days`) {
    const month = r.query.get("month")!;
    const n = set.filter((p) => p.month === month).length;
    return json({ days: n ? [{ date: `${month}-03`, count: n, has_note: false }] : [] });
  }
  if (r.path === `${BASE}/points`) return json({ points: [] });
  const list = r.query.get("undated") ? set.filter((p) => !p.month) : set.filter((p) => `${p.month}-03` === r.query.get("date"));
  return json({ file_ids: list.map((p) => p.id), total: list.length });
}

function tagCountsRoute(r: Req): Response {
  const q = r.query;
  const keys = [...new Set([...q.keys()])];
  const known = keys.every((k) => k === "type" || k === "tag" || k === "collection");
  if (!known || q.getAll("type").join() !== "image") {
    unexpected.push(`${r.method} ${r.path}?${q}`);
    return json({ detail: "unexpected" }, 500);
  }
  let set: Photo[];
  if (r.method === "POST") {
    if (q.has("collection")) {
      unexpected.push(`${r.method} ${r.path}?${q}`);
      return json({ detail: "unexpected" }, 500);
    }
    set = photos.filter((p) => r.body?.file_ids?.includes(p.id));
  } else if (q.has("collection")) {
    set = photos.filter((p) => ALBUM_IDS.includes(p.id));
  } else {
    set = photos;
  }
  const tags = q.getAll("tag");
  checkTags(r, tags);
  set = narrowed(set, tags);
  const counts = new Map<string, number>();
  for (const p of set) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return json(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count })),
  );
}

function route(r: Req): Response {
  if (PHOTO_PATHS.includes(r.path)) return photoRoute(r);
  if (r.path === `${BASE}/note`) return json({ state: "none", file_id: null });
  if (r.path === `${BASE}/map-config`) return json({ tile_url: "https://t.example.test/{z}/{x}/{y}.png", attribution: "" });
  if (r.path.startsWith(BASE)) {
    unexpected.push(r.path);
    return json({ detail: "unexpected route" }, 500);
  }
  if (r.path === "/api/drives/family/tag-counts" && r.method === "GET") return tagCountsRoute(r);
  if (r.path === "/api/drives/family/tag-counts/query" && r.method === "POST") return tagCountsRoute(r);
  if (r.path === "/api/drives/family/home-shortcuts") {
    if (r.method === "PUT") {
      shortcutPuts.push(r.body);
      const { kind, app, id, on_home } = r.body;
      shortcuts = shortcuts.filter((s) => !(s.kind === kind && s.app === app && s.id === id));
      if (on_home) shortcuts.push({ kind, app, id });
      return json({ ok: true });
    }
    return json(shortcuts);
  }
  if (r.path === "/api/drives/family/smart-folders") return json(folders);
  if (r.path === "/api/drives/family/collections") return json(collections);
  if (r.path === "/api/drives/family/files") return json({ data: [], meta: { total: 108, page: 1, limit: 1 } });
  if (r.path === "/api/addons/status") return json({ addons: {}, slots: {} });
  return json({ detail: "Not Found" }, 404);
}

function bodyOf(init?: any): any {
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
    body: bodyOf(init),
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

const isShelves = (r: Req) => r.path === `${BASE}/library/shelves`;
const isShelf = (r: Req) => r.path === `${BASE}/library/shelf`;
const isLibrary = (r: Req) => isLibraryPath(r.path);
const isPhoto = (r: Req) => PHOTO_PATHS.includes(r.path);
const isCalendarOrMap = (r: Req) => isPhoto(r) && !isLibrary(r);
const isTagCounts = (r: Req) => r.path.startsWith("/api/drives/family/tag-counts");
const isFolders = (r: Req) => r.path === "/api/drives/family/smart-folders";
const isCollections = (r: Req) => r.path === "/api/drives/family/collections";
const isMonths = (r: Req) => r.path === `${BASE}/calendar/months`;
const shelvesReads = () => requests.filter(isShelves);
const lastShelves = () => shelvesReads().at(-1)!;
const tagsOf = (r: Req) => r.query.getAll("tag");

// ---------------------------------------------------------------- the evaluation

type Evaluation = memberTarget.MemberEvaluation;
const evaluate = vi.mocked(memberTarget.evaluateMemberTarget);
let pending: ((e: Evaluation) => void)[];
let auto: Evaluation | null;
const READY: Evaluation = { status: "ready", fileIds: MEMBERS };

const finish = (e: Evaluation) =>
  act(async () => {
    const waiting = pending;
    pending = [];
    waiting.forEach((resolve) => resolve(e));
    await new Promise((r) => setTimeout(r, 0));
  });

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
  photos = basePhotos();
  folders = FOLDERS;
  collections = [ALBUM];
  shortcuts = [];
  shortcutPuts = [];
  requests = [];
  unexpected = [];
  overrides = [];
  pending = [];
  auto = READY;
  h.drive.current = "family";
  h.observers.clear();
  h.scroll.calls.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  toast.error.mockClear();
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", IdleResizeObserver);
  evaluate.mockReset();
  evaluate.mockImplementation(
    () => (auto ? Promise.resolve(auto) : new Promise<Evaluation>((resolve) => pending.push(resolve))) as any,
  );
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

const pagePath = () => `/drive/${h.drive.current}${PAGE}`;
const shelfPath = () => `${pagePath()}/shelf`;

function messages(locale: "ja" | "en") {
  return locale === "ja" ? { ...coreJa, ...ja } : { ...coreEn, ...en };
}

async function settled(search = "?view=library", locale: "ja" | "en" = "ja") {
  window.history.replaceState(null, "", `${pagePath()}${search}`);
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      <Page />
    </NextIntlClientProvider>,
  );
  await flush();
  return view;
}

async function openShelf(search: string, locale: "ja" | "en" = "ja") {
  const path = "./pages/shelf";
  const Shelf = (await import(/* @vite-ignore */ path)).default;
  window.history.replaceState(null, "", `${shelfPath()}${search}`);
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      <Shelf />
    </NextIntlClientProvider>,
  );
  await flush();
  return view;
}

const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const tab = (name: string) => screen.getByRole("tab", { name });
const headerText = () => document.querySelector("header")?.textContent ?? "";
const query = () => new URLSearchParams(window.location.search);
const seeAll = () => screen.queryAllByRole("link", { name: "すべて見る" });
const renderedIds = () =>
  Array.from(document.querySelectorAll("[data-testid=file]")).map((e) => e.getAttribute("data-id")!);
const targetButton = (name: string) => screen.findByRole("button", { name: `対象: ${name}` });
const groupButton = (value: string) => screen.findByRole("button", { name: `分類: ${value}` });
const sortButton = (value: string) => screen.findByRole("button", { name: `並び順: ${value}` });
const tagButton = (value = "指定なし") => screen.findByRole("button", { name: `タグ: ${value}` });
const noControlRow = () => {
  expect(screen.queryByRole("button", { name: /^分類/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^並び順/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^タグ: / })).toBeNull();
};
const filteredEmpty = () => screen.queryByText("条件に合う項目はありません");

function option(name: string): HTMLElement {
  return screen.getByRole("menuitemradio", { name }) as HTMLElement;
}
const optionNames = () => screen.getAllByRole("menuitemradio").map((e) => e.textContent!.trim());

async function pick(button: Promise<HTMLElement>, to: string) {
  await click(await button);
  await waitFor(() => option(to));
  await click(option(to));
  await flush();
}

async function chooseTarget(from: string, to: string | RegExp) {
  await click(await targetButton(from));
  await click(await screen.findByRole("menuitemradio", { name: to }));
  await flush();
}

const tagRow = (name: string) =>
  screen.findByRole("menuitemcheckbox", { name: new RegExp(`^${name}\\s*\\d+$`) });
const tagRowNames = () =>
  screen
    .getAllByRole("menuitemcheckbox")
    .map((e) => e.textContent!.replace(/\d+$/, "").trim())
    .filter((n) => n !== "指定なし");

async function toggleTag(current: string, name: string) {
  await click(await tagButton(current));
  await click(await tagRow(name));
  await flush();
  const open = screen.queryByRole("menu");
  if (open) await click(await screen.findByRole("button", { name: /^タグ: / }));
  await flush();
}

async function shelvesDrawn(n: number) {
  await waitFor(() => expect(seeAll()).toHaveLength(n));
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

function storageSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    out[k] = localStorage.getItem(k)!;
  }
  return out;
}

function searchIconNear(text: string): boolean {
  let el: HTMLElement | null = screen.getByText(text);
  for (let i = 0; i < 4 && el; i++) {
    if (el.querySelector("svg.lucide-search")) return true;
    el = el.parentElement;
  }
  return false;
}

const tagSearch = (search: string) => new URLSearchParams(search).getAll("tag");

// ================================================================ SPEC-PD-023

describe("SPEC-PD-023 item 1, I14: the control row and its wording", () => {
  it("SPEC-PD-023 I14 the Library shows 分類 and 並び順 with Photo Diary's options, なし included, and nowhere 並べ替え", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    await groupButton("撮影月");
    await sortButton("新しい順");
    await click(await groupButton("撮影月"));
    expect(optionNames()).toEqual(["撮影月", "タグ", "コレクション", "フォルダ", "なし"]);
    expect(option("撮影月")).toHaveAttribute("aria-checked", "true");
    await click(await groupButton("撮影月"));
    await click(await sortButton("新しい順"));
    expect(optionNames()).toEqual(["新しい順", "古い順"]);
    expect(document.body.textContent).not.toContain("並べ替え");
    expect(document.body.innerHTML).not.toContain("並べ替え");
  });

  it("SPEC-PD-023 I14 English: Group By and Sort By with Month taken … None and Newest first / Oldest first", async () => {
    await settled("?view=library", "en");
    await click(await screen.findByRole("button", { name: "Group By: Month taken" }));
    expect(optionNames()).toEqual(["Month taken", "Tag", "Collection", "Folder", "None"]);
    await click(screen.getByRole("button", { name: "Group By: Month taken" }));
    await click(await screen.findByRole("button", { name: "Sort By: Newest first" }));
    expect(optionNames()).toEqual(["Newest first", "Oldest first"]);
  });

  it("SPEC-PD-023 item 1 the tag menu sits before the view menus in the row", async () => {
    await settled("?view=library");
    const tag = await tagButton();
    const group = await groupButton("撮影月");
    const sort = await sortButton("新しい順");
    expect(tag.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SPEC-PD-023 I2 while the Target is looked up the Library draws no control row; it appears once known", async () => {
    writeAppTarget("family", APP, TRIP.id);
    const release = hold(isFolders);
    await settled("?view=library");
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await targetButton("…");
    noControlRow();
    await release();
    await targetButton("Trip");
    await groupButton("撮影月");
    await tagButton();
  });
});

describe("SPEC-PD-023 items 2, 4, 5, I1, I2: the view per Target", () => {
  it("SPEC-PD-023 I1 a 分類 or 並び順 choice writes that field for the Target in force only, and nothing else is written", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ [TRIP.id]: { group: "folder", sort: "oldest" } }));
    localStorage.setItem("litloft.addon.photo_diary.view.work", JSON.stringify({ default: { group: "tag" } }));
    localStorage.setItem(OLD_GROUP_KEY, "collection");
    localStorage.setItem(OLD_SORT_KEY, "newest");
    await settled("?view=library");
    await shelvesDrawn(1);
    const before = storageSnapshot();
    await pick(groupButton("コレクション"), "タグ");
    expect(readTargetView(APP, "family", "default")).toEqual({ group: "tag" });
    await pick(sortButton("新しい順"), "古い順");
    expect(readTargetView(APP, "family", "default")).toEqual({ group: "tag", sort: "oldest" });
    expect(readTargetView(APP, "family", TRIP.id)).toEqual({ group: "folder", sort: "oldest" });
    const after = storageSnapshot();
    const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
    expect(changed).toEqual([VIEW_KEY]);
  });

  it("SPEC-PD-023 I1 a load, a Target choice, a fallback and a reload write nothing to the view key", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "tag" } }));
    writeAppTarget("family", APP, "sf-gone");
    const first = await settled("?view=library");
    await groupButton("タグ");
    await chooseTarget("すべての写真", "Trip");
    await groupButton("撮影月");
    await chooseTarget("Trip", /^すべての写真/);
    await groupButton("タグ");
    first.unmount();
    await settled("?view=library");
    await groupButton("タグ");
    expect(JSON.parse(localStorage.getItem(VIEW_KEY)!)).toEqual({ default: { group: "tag" } });
  });

  it("SPEC-PD-023 I2 view A on Target X and view B on Y come back with their Target", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    await pick(groupButton("撮影月"), "タグ");
    await chooseTarget("すべての写真", "Trip");
    await groupButton("撮影月");
    await sortButton("新しい順");
    await pick(groupButton("撮影月"), "フォルダ");
    await pick(sortButton("新しい順"), "古い順");
    requests = [];
    await chooseTarget("Trip", /^すべての写真/);
    await groupButton("タグ");
    await sortButton("新しい順");
    await waitFor(() => expect(shelvesReads().length).toBeGreaterThan(0));
    for (const r of shelvesReads()) {
      expect(r.query.get("by")).toBe("tag");
      expect(r.query.get("sort")).toBe("newest");
    }
    requests = [];
    await chooseTarget("すべての写真", "Trip");
    await groupButton("フォルダ");
    await sortButton("古い順");
    await waitFor(() => expect(shelvesReads().length).toBeGreaterThan(0));
    for (const r of shelvesReads()) {
      expect(r.query.get("by")).toBe("folder");
      expect(r.query.get("sort")).toBe("oldest");
      expect(targetOf(r.query)).toEqual({ tag: ["trip"] });
    }
  });

  it("SPEC-PD-023 I2 the old per-drive keys are read for the default Target only", async () => {
    localStorage.setItem(OLD_GROUP_KEY, "tag");
    localStorage.setItem(OLD_SORT_KEY, "oldest");
    const first = await settled("?view=library");
    await groupButton("タグ");
    await sortButton("古い順");
    first.unmount();
    writeAppTarget("family", APP, TRIP.id);
    requests = [];
    await settled("?view=library");
    await targetButton("Trip");
    await groupButton("撮影月");
    await sortButton("新しい順");
    await waitFor(() => expect(shelvesReads().length).toBeGreaterThan(0));
    for (const r of shelvesReads()) {
      expect(r.query.get("by")).toBe("month");
      expect(r.query.get("sort")).toBe("newest");
    }
  });

  it.each([
    ["the stored value wins over the old key", { default: { group: "folder" } }, "collection", "フォルダ"],
    ["a stored value Photo Diary does not offer falls to the old key", { default: { group: "bogus" } }, "collection", "コレクション"],
    ["no stored value and an unknown old value give 撮影月", {}, "bogus", "撮影月"],
    ["なし is a stored value Photo Diary offers", { default: { group: "all" } }, "tag", "なし"],
  ])("SPEC-PD-023 item 2 %s", async (_label, stored, old, shown) => {
    localStorage.setItem(VIEW_KEY, JSON.stringify(stored));
    localStorage.setItem(OLD_GROUP_KEY, old);
    await settled("?view=library");
    await groupButton(shown);
    await sortButton("新しい順");
  });

  it("SPEC-PD-023 item 2 under a fallback to default the default Target's view is in force", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "folder" }, "sf-gone": { group: "tag" } }));
    writeAppTarget("family", APP, "sf-gone");
    await settled("?view=library");
    await targetButton("すべての写真");
    await groupButton("フォルダ");
  });

  it("SPEC-PD-023 item 2 a member Target that is evaluating or failed keeps its own view", async () => {
    auto = null;
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "folder" }, [BEACH.id]: { group: "collection" } }));
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=library");
    await targetButton("Beach");
    await groupButton("コレクション");
    await finish({ status: "failed" });
    await groupButton("コレクション");
  });

  it("SPEC-PD-023 failure: unreadable view JSON gives the defaults; a refused write keeps the choice shown", async () => {
    localStorage.setItem(VIEW_KEY, "{");
    await settled("?view=library");
    await groupButton("撮影月");
    await sortButton("新しい順");
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === VIEW_KEY) throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, key, value);
    });
    await pick(groupButton("撮影月"), "タグ");
    await groupButton("タグ");
    await waitFor(() => expect(lastShelves().query.get("by")).toBe("tag"));
  });

  it("SPEC-PD-023 failure: a view key that throws on read gives the defaults", async () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === VIEW_KEY) throw new DOMException("denied", "SecurityError");
      return original.call(this, key);
    });
    await settled("?view=library");
    await groupButton("撮影月");
    await sortButton("新しい順");
  });
});

describe("SPEC-PD-023 item 6: なし", () => {
  beforeEach(() => {
    photos = [...ids("p", 45).map((id) => P(id, "2026-05", ["beach"])), ...basePhotos()];
  });

  it("SPEC-PD-023 item 6 なし shows one grid from /library/shelf?by=all&key=all, 40 per page, more on scroll, with no See all", async () => {
    await settled("?view=library");
    await pick(groupButton("撮影月"), "なし");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    expect(seeAll()).toHaveLength(0);
    expect(document.querySelectorAll("[data-testid=file-grid]")).toHaveLength(1);
    const first = requests.filter(isShelf)[0].query;
    expect(first.get("by")).toBe("all");
    expect(first.get("key")).toBe("all");
    expect(first.get("sort")).toBe("newest");
    expect(first.get("limit")).toBe("40");
    expect(first.get("offset")).toBe("0");
    await groupButton("なし");
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(photos.length));
    const order = renderedIds();
    expect(order.slice(0, 4)).toEqual(["a0", "a1", "a2", "a4"]);
    expect(order.slice(-2)).toEqual(["a3", "mu0"]);
    expect(new Set(order).size).toBe(order.length);
  });

  it("SPEC-PD-023 item 6 なし with 古い順 asks sort=oldest and keeps the undated photos last", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "all", sort: "oldest" } }));
    await settled("?view=library");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    expect(requests.filter(isShelf)[0].query.get("sort")).toBe("oldest");
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(photos.length));
    expect(renderedIds().slice(-2)).toEqual(["a3", "mu0"]);
  });

  it("SPEC-PD-023 item 6 なし with no photo and no tag chosen shows 写真はありません", async () => {
    photos = [];
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "all" } }));
    await settled("?view=library");
    await screen.findByText("写真はありません");
    expect(filteredEmpty()).toBeNull();
    await groupButton("なし");
  });

  it("SPEC-PD-023 item 6 a failed first page of なし shows the retry under the control row; retry asks again", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "all" } }));
    answer(isShelf, () => json({ detail: "boom" }, 500));
    await settled("?view=library");
    const retry = await screen.findByRole("button", { name: "再試行" });
    const group = await groupButton("なし");
    expect(group.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(retry);
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    expect(requests.filter(isShelf)).toHaveLength(2);
  });

  it("SPEC-PD-023 item 3 a reload of ?view=library restores the なし grid's loaded depth and scroll", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "all" } }));
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => 600 });
    const first = await settled("?view=library");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(photos.length));
    first.unmount();
    h.scroll.calls.length = 0;
    await settled("?view=library");
    await waitFor(() => expect(renderedIds()).toHaveLength(photos.length));
    await waitFor(() => expect(h.scroll.calls).toContain(600));
  });
});

// ================================================================ SPEC-PD-024

describe("SPEC-PD-024 items 9 to 11: the tag menu, the URL and the requests", () => {
  it("SPEC-PD-024 item 10 toggling tags replaces the URL with repeated tag, in order, and every Library request carries them", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    const before = window.history.length;
    await toggleTag("指定なし", "beach");
    await waitFor(() => expect(query().getAll("tag")).toEqual(["beach"]));
    expect(query().get("view")).toBe("library");
    expect(window.history.length).toBe(before);
    await shelvesDrawn(5);
    expect(tagsOf(lastShelves())).toEqual(["beach"]);
    await toggleTag("beach", "family");
    await waitFor(() => expect(query().getAll("tag")).toEqual(["beach", "family"]));
    expect(window.history.length).toBe(before);
    await shelvesDrawn(1);
    expect(tagsOf(lastShelves())).toEqual(["beach", "family"]);
    for (const link of seeAll()) {
      expect(new URL(link.getAttribute("href")!, "http://localhost").searchParams.getAll("tag")).toEqual(["beach", "family"]);
    }
    expect(renderedIds()).toEqual(["a1"]);
  });

  it("SPEC-PD-024 item 10 指定なし clears every tag by replace and the requests carry none", async () => {
    await settled("?view=library&tag=beach&tag=family");
    await shelvesDrawn(1);
    const before = window.history.length;
    await click(await tagButton("beach, family"));
    await click(await screen.findByRole("menuitemcheckbox", { name: "指定なし" }));
    await flush();
    await waitFor(() => expect(query().has("tag")).toBe(false));
    expect(window.location.search).toBe("?view=library");
    expect(window.history.length).toBe(before);
    await waitFor(() => expect(tagsOf(lastShelves())).toEqual([]));
  });

  it("SPEC-PD-024 chosen tags are the URL's in order, once each folded, empty values dropped", async () => {
    await settled("?view=library&tag=beach&tag=&tag=Beach&tag=family");
    await shelvesDrawn(1);
    for (const r of shelvesReads()) expect(tagsOf(r)).toEqual(["beach", "family"]);
    await tagButton("beach, family");
  });

  it("SPEC-PD-024 item 9 under the default Target the menu asks tag-counts with type=image and the chosen tags, and lists the chosen first", async () => {
    await settled("?view=library&tag=family");
    await shelvesDrawn(2);
    await click(await tagButton("family"));
    await tagRow("family");
    const r = requests.filter(isTagCounts);
    expect(r).toHaveLength(1);
    expect(r[0].method).toBe("GET");
    expect(r[0].path).toBe("/api/drives/family/tag-counts");
    expect(r[0].query.getAll("type")).toEqual(["image"]);
    expect(tagsOf(r[0])).toEqual(["family"]);
    expect(tagRowNames()).toEqual(["family", "beach"]);
  });

  it("SPEC-PD-024 items 9, 11 under a listing-parameter Target its own tags come first and are not offered", async () => {
    writeAppTarget("family", APP, TRIP.id);
    await settled("?view=library&tag=beach");
    await targetButton("Trip");
    await shelvesDrawn(1);
    for (const r of shelvesReads()) {
      expect(r.method).toBe("GET");
      expect(tagsOf(r)).toEqual(["trip", "beach"]);
    }
    expect(renderedIds()).toEqual(["t0"]);
    await click(await tagButton("beach"));
    await tagRow("beach");
    const tc = requests.filter(isTagCounts).at(-1)!;
    expect(tc.method).toBe("GET");
    expect(tagsOf(tc)).toEqual(["trip", "beach"]);
    expect(tagRowNames()).toEqual(["beach"]);
  });

  it("SPEC-PD-024 items 9, 11 under a collection Target the chosen tags go beside collection", async () => {
    writeAppTarget("family", APP, ALBUM_ID);
    await settled("?view=library&tag=beach");
    await targetButton("Album");
    await shelvesDrawn(1);
    for (const r of shelvesReads()) expect(targetOf(r.query)).toEqual({ collection: ["Album"], tag: ["beach"] });
    expect(renderedIds()).toEqual(["c0"]);
    await click(await tagButton("beach"));
    await tagRow("beach");
    const tc = requests.filter(isTagCounts).at(-1)!;
    expect(tc.method).toBe("GET");
    expect(tc.query.getAll("collection")).toEqual(["Album"]);
    expect(tagsOf(tc)).toEqual(["beach"]);
  });

  it("SPEC-PD-024 items 9, 11 under a ready member Target the chosen tags ride on the POST query string", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=library&tag=beach");
    await targetButton("Beach");
    await shelvesDrawn(2);
    for (const r of shelvesReads()) {
      expect(r.method).toBe("POST");
      expect(targetOf(r.query)).toEqual({ tag: ["beach"] });
      expect([...r.body.file_ids].sort()).toEqual([...MEMBERS].sort());
    }
    await click(await tagButton("beach"));
    await tagRow("beach");
    const tc = requests.filter(isTagCounts).at(-1)!;
    expect(tc.method).toBe("POST");
    expect(tc.path).toBe("/api/drives/family/tag-counts/query");
    expect(tagsOf(tc)).toEqual(["beach"]);
    expect(tc.query.getAll("type")).toEqual(["image"]);
    expect([...tc.body.file_ids].sort()).toEqual([...MEMBERS].sort());
  });

  it("SPEC-PD-024 I7 no tag-counts request goes out while a member Target evaluates; it goes once ready", async () => {
    auto = null;
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=library&tag=beach");
    await targetButton("Beach");
    const tag = screen.queryByRole("button", { name: "タグ: beach" });
    if (tag) {
      await click(tag);
      await flush();
    }
    expect(requests.filter(isTagCounts)).toEqual([]);
    await finish(READY);
    await waitFor(() => expect(requests.filter(isShelves).length).toBeGreaterThan(0));
    if (!screen.queryByRole("menu")) await click(await tagButton("beach"));
    await tagRow("beach");
    expect(requests.filter(isTagCounts).length).toBeGreaterThan(0);
    expect(requests.filter(isTagCounts).every((r) => r.method === "POST")).toBe(true);
  });

  it.each([
    ["failed", { status: "failed" } as Evaluation],
    ["tooLarge", { status: "tooLarge" } as Evaluation],
  ])("SPEC-PD-024 item 9 under a %s member Target the row has the view menus and no tag menu", async (_l, e) => {
    auto = null;
    writeAppTarget("family", APP, BEACH.id);
    await settled("?view=library&tag=beach");
    await finish(e);
    await groupButton("撮影月");
    await sortButton("新しい順");
    expect(screen.queryByRole("button", { name: /^タグ: / })).toBeNull();
    expect(requests.filter(isTagCounts)).toEqual([]);
    expect(query().getAll("tag")).toEqual(["beach"]);
  });

  it("SPEC-PD-024 item 11 under an empty Target the requests are none=true alone, no tag-counts goes out, and the tags stay in the URL", async () => {
    writeAppTarget("family", APP, SHORE.id);
    await settled("?view=library&tag=beach");
    await targetButton("Shore videos");
    await screen.findByText("写真はありません");
    expect(filteredEmpty()).toBeNull();
    await groupButton("撮影月");
    for (const r of requests.filter(isPhoto)) expect(targetOf(r.query)).toEqual({ none: ["true"] });
    const tag = await tagButton("beach");
    await click(tag);
    await flush();
    expect(requests.filter(isTagCounts)).toEqual([]);
    expect(query().getAll("tag")).toEqual(["beach"]);
  });

  it("SPEC-PD-024 item 9 one tag-counts request per menu open and one per toggle while it is open", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    await click(await tagButton());
    await tagRow("beach");
    expect(requests.filter(isTagCounts)).toHaveLength(1);
    await click(await tagRow("beach"));
    await flush();
    await waitFor(() => expect(requests.filter(isTagCounts)).toHaveLength(2));
    expect(tagsOf(requests.filter(isTagCounts)[1])).toEqual(["beach"]);
    await flush();
    expect(requests.filter(isTagCounts)).toHaveLength(2);
  });
});

describe("SPEC-PD-024 item 10, I4, I5: the tabs and the calendar", () => {
  it("SPEC-PD-024 I4 Calendar and Map neither carry nor send the tags; Library → Calendar → Library keeps them with no request", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    await toggleTag("指定なし", "beach");
    await waitFor(() => expect(query().getAll("tag")).toEqual(["beach"]));
    await shelvesDrawn(5);
    const reads = shelvesReads().length;
    await click(tab("カレンダー"));
    await waitFor(() => expect(query().get("view")).toBe("calendar"));
    expect(query().has("tag")).toBe(false);
    await flush();
    await click(tab("地図"));
    await waitFor(() => expect(query().get("view")).toBe("map"));
    expect(query().has("tag")).toBe(false);
    await flush();
    for (const r of requests.filter(isCalendarOrMap)) expect(tagsOf(r)).toEqual([]);
    await click(tab("ライブラリ"));
    await waitFor(() => expect(query().get("view")).toBe("library"));
    expect(query().getAll("tag")).toEqual(["beach"]);
    await flush();
    expect(shelvesReads()).toHaveLength(reads);
    await shelvesDrawn(5);
  });

  it("SPEC-PD-024 I5 a Target choice removes tag by replace and no later request carries it; the Library tab link carries none", async () => {
    await settled("?view=library&tag=beach");
    await shelvesDrawn(5);
    const before = window.history.length;
    const at = requests.length;
    await chooseTarget("すべての写真", "Trip");
    await waitFor(() => expect(query().has("tag")).toBe(false));
    expect(query().get("view")).toBe("library");
    expect(window.history.length).toBe(before);
    await shelvesDrawn(1);
    for (const r of requests.slice(at)) expect(tagsOf(r)).not.toContain("beach");
    await click(await tagButton());
    await tagRow("beach");
    for (const r of requests.slice(at)) expect(tagsOf(r)).not.toContain("beach");
    await click(await tagButton());
    await click(tab("カレンダー"));
    await waitFor(() => expect(query().get("view")).toBe("calendar"));
    await click(tab("ライブラリ"));
    await waitFor(() => expect(query().get("view")).toBe("library"));
    expect(query().has("tag")).toBe(false);
  });

  it("SPEC-PD-024 I5 re-choosing the Target in force and a 分類 or 並び順 choice leave tag as it was", async () => {
    await settled("?view=library&tag=beach");
    await shelvesDrawn(5);
    await chooseTarget("すべての写真", /^すべての写真/);
    expect(query().getAll("tag")).toEqual(["beach"]);
    await pick(groupButton("撮影月"), "タグ");
    expect(query().getAll("tag")).toEqual(["beach"]);
    await pick(sortButton("新しい順"), "古い順");
    expect(query().getAll("tag")).toEqual(["beach"]);
    await waitFor(() => expect(tagsOf(lastShelves())).toEqual(["beach"]));
    expect(lastShelves().query.get("by")).toBe("tag");
  });

  it("SPEC-PD-024 I5 a fallback keeps tag", async () => {
    writeAppTarget("family", APP, "sf-gone");
    await settled("?view=library&tag=beach");
    await targetButton("すべての写真");
    await shelvesDrawn(5);
    expect(query().getAll("tag")).toEqual(["beach"]);
    for (const r of shelvesReads()) expect(tagsOf(r)).toEqual(["beach"]);
  });

  it("SPEC-PD-024 I5 Back to an entry made before a Target choice applies its tag under the Target in force", async () => {
    await settled("?view=library&tag=beach");
    await shelvesDrawn(5);
    await click(tab("カレンダー"));
    await waitFor(() => expect(query().get("view")).toBe("calendar"));
    await chooseTarget("すべての写真", "Trip");
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(query().get("view")).toBe("library"));
    expect(query().getAll("tag")).toEqual(["beach"]);
    await waitFor(() => expect(tagsOf(lastShelves())).toEqual(["trip", "beach"]));
    await shelvesDrawn(1);
    expect(renderedIds()).toEqual(["t0"]);
  });

  it("SPEC-PD-024 I5 the in-place start-over empties the Library tags and writes ?view=library", async () => {
    await settled("?view=library&tag=beach");
    await shelvesDrawn(5);
    await act(async () => {
      window.history.pushState(null, "", pagePath());
    });
    await flush();
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    await shelvesDrawn(6);
    expect(tagsOf(lastShelves())).toEqual([]);
    await click(tab("カレンダー"));
    await click(tab("ライブラリ"));
    await waitFor(() => expect(query().get("view")).toBe("library"));
    expect(query().has("tag")).toBe(false);
    await tagButton();
  });

  it("SPEC-PD-024 I5 a reload keeps the chosen tags", async () => {
    const first = await settled("?view=library");
    await shelvesDrawn(6);
    await toggleTag("指定なし", "family");
    await waitFor(() => expect(query().getAll("tag")).toEqual(["family"]));
    const search = window.location.search;
    first.unmount();
    requests = [];
    await settled(search);
    await shelvesDrawn(2);
    for (const r of shelvesReads()) expect(tagsOf(r)).toEqual(["family"]);
    await tagButton("family");
  });
});

describe("SPEC-PD-024 items 15 to 17, I8, I9: changing tags, empty and counts", () => {
  it("SPEC-PD-024 I8 from a toggle on, no shelf of the previous tags is on screen while the new answer loads, and a late one is not drawn", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    await click(await tagButton());
    await click(await tagRow("family"));
    await click(await tagButton("family"));
    await shelvesDrawn(2);
    const releaseBoth = hold((r) => isShelves(r) && tagsOf(r).join() === "family,beach");
    await toggleTag("family", "beach");
    expect(seeAll()).toHaveLength(0);
    expect(screen.queryByText("2026年9月")).toBeNull();
    await releaseBoth();
    await shelvesDrawn(1);
    expect(renderedIds()).toEqual(["a1"]);
  });

  it("SPEC-PD-024 I8 after a failed answer to the new tags, nothing of the previous ones stays", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    answer((r) => isShelves(r) && tagsOf(r).length > 0, () => json({ detail: "boom" }, 500));
    await toggleTag("指定なし", "family");
    await screen.findByRole("button", { name: "再試行" });
    expect(seeAll()).toHaveLength(0);
    expect(screen.queryByText("2026年10月")).toBeNull();
    await click(screen.getByRole("button", { name: "再試行" }));
    await shelvesDrawn(2);
  });

  it("SPEC-PD-024 I9 a tag no photo carries gives the filtered empty state with the Search icon; listed first at 0", async () => {
    await settled("?view=library&tag=nothing");
    await screen.findByText("条件に合う項目はありません");
    expect(searchIconNear("条件に合う項目はありません")).toBe(true);
    expect(screen.queryByText("写真はありません")).toBeNull();
    await click(await tagButton("nothing"));
    await tagRow("nothing");
    expect(tagRowNames()[0]).toBe("nothing");
    expect(screen.getByRole("menuitemcheckbox", { name: /^nothing\s*0$/ })).toHaveAttribute("aria-checked", "true");
  });

  it("SPEC-PD-024 I9 English: Nothing matches these filters", async () => {
    await settled("?view=library&tag=nothing", "en");
    await screen.findByText("Nothing matches these filters");
  });

  it("SPEC-PD-024 I9 なし with a tag no photo carries gives the filtered empty state", async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ default: { group: "all" } }));
    await settled("?view=library&tag=nothing");
    await screen.findByText("条件に合う項目はありません");
    const r = requests.filter(isShelf);
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(tagsOf(x)).toEqual(["nothing"]);
  });

  it("SPEC-PD-024 I9 the header count is the Target's total whatever the tags", async () => {
    await settled("?view=library&tag=family");
    await shelvesDrawn(2);
    await waitFor(() => expect(headerText()).toContain(`family · ${photos.length}枚`));
    for (const r of requests.filter(isMonths)) expect(tagsOf(r)).toEqual([]);
  });
});

// ================================================================ SPEC-PD-025

describe("SPEC-PD-025 item 18, I12: Put on Home", () => {
  it("SPEC-PD-025 I12 a non-default Target in force offers ホームに置く, which PUTs app photo_diary and the Target id", async () => {
    writeAppTarget("family", APP, TRIP.id);
    await settled("?view=library");
    await shelvesDrawn(1);
    await click(await targetButton("Trip"));
    const row = await screen.findByRole("menuitem", { name: /ホームに置く/ });
    await click(row);
    await waitFor(() => expect(shortcutPuts).toHaveLength(1));
    expect(shortcutPuts[0]).toMatchObject({ kind: "app_target", app: "photo_diary", id: TRIP.id, on_home: true });
  });

  it("SPEC-PD-025 I12 a Target already on Home offers ホームから外す", async () => {
    shortcuts = [{ kind: "app_target", app: "photo_diary", id: ALBUM_ID }];
    writeAppTarget("family", APP, ALBUM_ID);
    await settled("?view=calendar");
    await click(await targetButton("Album"));
    await click(await screen.findByRole("menuitem", { name: /ホームから外す/ }));
    await waitFor(() => expect(shortcutPuts).toHaveLength(1));
    expect(shortcutPuts[0]).toMatchObject({ app: "photo_diary", id: ALBUM_ID, on_home: false });
  });

  it("SPEC-PD-025 I12 the default Target offers no Home row", async () => {
    await settled("?view=library");
    await shelvesDrawn(6);
    await chooseTarget("すべての写真", "Trip");
    await click(await targetButton("Trip"));
    await screen.findByRole("menuitem", { name: /ホームに置く/ });
    await click(await targetButton("Trip"));
    await chooseTarget("Trip", /^すべての写真/);
    await click(await targetButton("すべての写真"));
    await flush();
    expect(screen.queryByRole("menuitem", { name: /ホーム/ })).toBeNull();
  });
});

describe("SPEC-PD-025 items 19 to 22, I10, I11: ?target=", () => {
  it("SPEC-PD-025 I10 a Smart Collection id is applied: written, in force, and target leaves the URL by replace", async () => {
    const release = hold(isFolders);
    const before = window.history.length;
    await settled("?view=library&target=sf-trip");
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await targetButton("…");
    expect(requests.filter(isPhoto)).toEqual([]);
    expect(requests.filter(isTagCounts)).toEqual([]);
    noControlRow();
    const snap = storageSnapshot();
    await release();
    await targetButton("Trip");
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    expect(window.history.length).toBe(before);
    await shelvesDrawn(1);
    for (const r of requests.filter(isPhoto)) expect(targetOf(r.query)).toEqual({ tag: ["trip"] });
    const after = storageSnapshot();
    const changed = Object.keys({ ...snap, ...after }).filter((k) => snap[k] !== after[k]);
    expect(changed).toEqual([TARGET_KEY]);
    expect(readAppTarget("family", APP)).toBe(TRIP.id);
  });

  it("SPEC-PD-025 I10 the default Target's requests wait for a pending id too, on every view", async () => {
    const release = hold(isCollections);
    await settled(`?view=calendar&month=2026-10&target=${ALBUM_ID}`);
    await waitFor(() => expect(requests.some(isCollections)).toBe(true));
    await flush();
    expect(requests.filter(isPhoto)).toEqual([]);
    await targetButton("…");
    await release();
    await targetButton("Album");
    await waitFor(() => expect(window.location.search).toBe("?view=calendar&month=2026-10"));
    for (const r of requests.filter(isPhoto)) expect(targetOf(r.query)).toEqual({ collection: ["Album"] });
    expect(readAppTarget("family", APP)).toBe(ALBUM_ID);
  });

  it("SPEC-PD-025 I10 a collection id is resolved by the collection list only", async () => {
    const release = hold(isCollections);
    await settled(`?view=library&target=${ALBUM_ID}`);
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await flush();
    await targetButton("…");
    expect(requests.filter(isPhoto)).toEqual([]);
    await release();
    await targetButton("Album");
  });

  it("SPEC-PD-025 I10 a URL that held only target is ?view=library with the saved state cleared", async () => {
    saveState("family", { zoom: 7 });
    await settled("?target=sf-trip");
    await targetButton("Trip");
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    expect(loadState("family")?.zoom).toBeUndefined();
  });

  it.each([
    ["default", "default"],
    ["an empty value", ""],
    ["an id not in the list", "sf-nope"],
    ["an unusable Smart Collection", DURATION.id],
    ["a collection not in the list", "collection:nope00000000"],
  ])("SPEC-PD-025 I10 %s is ignored: the saved Target stays, nothing is written, target leaves the URL", async (_l, id) => {
    writeAppTarget("family", APP, TRIP.id);
    const snap = storageSnapshot();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await settled(`?view=calendar&month=2026-10&target=${encodeURIComponent(id)}`);
    await targetButton("Trip");
    await waitFor(() => expect(window.location.search).toBe("?view=calendar&month=2026-10"));
    expect(setItem.mock.calls.filter(([k]) => k === TARGET_KEY)).toEqual([]);
    expect(storageSnapshot()[TARGET_KEY]).toBe(snap[TARGET_KEY]);
    for (const r of requests) expect(r.query.toString()).not.toContain(encodeURIComponent(id) || "target=");
  });

  it("SPEC-PD-025 I10 the saved Target's own id writes nothing and leaves the URL", async () => {
    writeAppTarget("family", APP, TRIP.id);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await settled("?view=library&target=sf-trip");
    await targetButton("Trip");
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    expect(setItem.mock.calls.filter(([k]) => k === TARGET_KEY)).toEqual([]);
  });

  it("SPEC-PD-025 I10 a failed list ignores the id, and the list's retry applies the saved Target, never the ignored id", async () => {
    writeAppTarget("family", APP, ALBUM_ID);
    answer(isFolders, () => json({ detail: "x" }, 500));
    answer(isCollections, () => json({ detail: "x" }, 500));
    await settled("?view=calendar&target=sf-trip");
    await targetButton("すべての写真");
    await waitFor(() => expect(query().has("target")).toBe(false));
    expect(readAppTarget("family", APP)).toBe(ALBUM_ID);
    await click(await targetButton("すべての写真"));
    await click(screen.getByRole("menuitem", { name: /管理/ }));
    const dialog = screen.getByRole("dialog");
    for (const b of within(dialog).getAllByRole("button", { name: "再試行" })) await click(b);
    await flush();
    await targetButton("Album");
    expect(readAppTarget("family", APP)).toBe(ALBUM_ID);
  });

  it("SPEC-PD-025 I11 while pending the menu checks no row, the default's included", async () => {
    const release = hold(isCollections);
    await settled(`?view=library&target=${ALBUM_ID}`);
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await flush();
    await click(await targetButton("…"));
    const rows = screen.getAllByRole("menuitemradio");
    expect(rows.length).toBeGreaterThan(0);
    const checked = rows.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toEqual([]);
    await release();
    await targetButton("Album");
  });

  it("SPEC-PD-025 I11 choosing another row drops the pending id unwritten", async () => {
    const release = hold(isCollections);
    await settled(`?view=library&target=${ALBUM_ID}`);
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await flush();
    await chooseTarget("…", "Trip");
    await targetButton("Trip");
    await release();
    await flush();
    await targetButton("Trip");
    expect(readAppTarget("family", APP)).toBe(TRIP.id);
    expect(query().has("target")).toBe(false);
  });

  it("SPEC-PD-025 I11 a navigation drops the pending id; the page's own replace does not", async () => {
    const release = hold(isCollections);
    await settled(`?view=bogus&target=${ALBUM_ID}`);
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await flush();
    await release();
    await targetButton("Album");
    await waitFor(() => expect(window.location.search).toBe("?view=library"));
    cleanup();
    requests = [];
    localStorage.clear();
    const releaseAgain = hold(isCollections);
    await settled(`?view=library&target=${ALBUM_ID}`);
    await waitFor(() => expect(requests.some(isFolders)).toBe(true));
    await flush();
    await click(tab("カレンダー"));
    await releaseAgain();
    await flush();
    await targetButton("すべての写真");
    expect(readAppTarget("family", APP)).not.toBe(ALBUM_ID);
  });

  it("SPEC-PD-025 item 20 while an id is pending the saved member Target is not evaluated, and an applied collection evaluates nothing", async () => {
    writeAppTarget("family", APP, BEACH.id);
    const release = hold(isFolders);
    await settled(`?view=library&target=${ALBUM_ID}`);
    await flush();
    expect(evaluate).not.toHaveBeenCalled();
    await release();
    await targetButton("Album");
    await flush();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("SPEC-PD-025 item 23, I11 the shelf page leaves target in its URL and behaves as without it", async () => {
    await openShelf("?by=month&key=2026-10&target=sf-trip");
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a1"]));
    await targetButton("すべての写真");
    expect(query().get("target")).toBe("sf-trip");
    await click(await targetButton("すべての写真"));
    await flush();
    expect(screen.queryByRole("menuitem", { name: /ホーム/ })).toBeNull();
    await click(await targetButton("すべての写真"));
    await chooseTarget("すべての写真", "Trip");
    await click(await targetButton("Trip"));
    await screen.findByRole("menuitem", { name: /ホームに置く/ });
    expect(query().get("target")).toBe("sf-trip");
  });
});

// ================================================================ the shelf page

describe("SPEC-PD-023 / SPEC-PD-024 on the shelf page", () => {
  it("SPEC-PD-023 I14 the shelf page's sort menu is labelled 並び順", async () => {
    await openShelf("?by=month&key=2026-10");
    await sortButton("新しい順");
    expect(document.body.innerHTML).not.toContain("並べ替え");
  });

  it("SPEC-PD-024 I4 the shelf page's request and back link carry the chosen tags; the count is the shelf total under them", async () => {
    await openShelf("?by=month&key=2026-10&tag=family");
    await waitFor(() => expect(renderedIds()).toEqual(["a1"]));
    for (const r of requests.filter(isShelf)) expect(tagsOf(r)).toEqual(["family"]);
    const back = new URL(screen.getByRole("link", { name: "フォトダイアリー" }).getAttribute("href")!, "http://localhost");
    expect(back.pathname).toBe(pagePath());
    expect(back.searchParams.get("view")).toBe("library");
    expect(back.searchParams.getAll("tag")).toEqual(["family"]);
    await waitFor(() => expect(headerText()).toContain("family · 1枚"));
  });

  it("SPEC-PD-024 item 11 under a listing-parameter Target the shelf page sends its own tags then the chosen ones", async () => {
    writeAppTarget("family", APP, TRIP.id);
    await openShelf("?by=month&key=2026-08&tag=beach");
    await waitFor(() => expect(renderedIds()).toEqual(["t0"]));
    for (const r of requests.filter(isShelf)) expect(tagsOf(r)).toEqual(["trip", "beach"]);
  });

  it("SPEC-PD-024 item 11 under a ready member Target the shelf page POSTs with the chosen tags on the query", async () => {
    writeAppTarget("family", APP, BEACH.id);
    await openShelf("?by=month&key=undated&tag=beach");
    await waitFor(() => expect(renderedIds()).toEqual(["mu0"]));
    for (const r of requests.filter(isShelf)) {
      expect(r.method).toBe("POST");
      expect(targetOf(r.query)).toEqual({ tag: ["beach"] });
    }
  });

  it("SPEC-PD-024 I9 a shelf page with no photo under a chosen tag shows the filtered empty state", async () => {
    await openShelf("?by=month&key=2026-10&tag=nothing");
    await screen.findByText("条件に合う項目はありません");
    expect(searchIconNear("条件に合う項目はありません")).toBe(true);
    expect(screen.queryByText("写真はありません")).toBeNull();
  });

  it("SPEC-PD-024 I5 a Target choice on the shelf page removes tag by replace, and no later request carries it", async () => {
    await openShelf("?by=month&key=2026-08&tag=beach");
    await waitFor(() => expect(renderedIds()).toEqual(["t0"]));
    const before = window.history.length;
    const at = requests.length;
    await chooseTarget("すべての写真", "Trip");
    await waitFor(() => expect(query().has("tag")).toBe(false));
    expect(query().get("by")).toBe("month");
    expect(query().get("key")).toBe("2026-08");
    expect(window.history.length).toBe(before);
    await waitFor(() => expect(renderedIds()).toEqual(["t0", "t1"]));
    for (const r of requests.slice(at)) expect(tagsOf(r)).not.toContain("beach");
  });

  it("SPEC-PD-024 item 13 See all from a tagged Library opens a shelf page that keeps the tags", async () => {
    await settled("?view=library&tag=family");
    await shelvesDrawn(2);
    const href = seeAll()[0].getAttribute("href")!;
    expect(tagSearch(new URL(href, "http://localhost").search)).toEqual(["family"]);
  });

  it("SPEC-PD-025 I12 the shelf page passes the Home entry: a non-default Target offers ホームに置く", async () => {
    writeAppTarget("family", APP, TRIP.id);
    await openShelf("?by=month&key=2026-08");
    await waitFor(() => expect(renderedIds()).toEqual(["t0", "t1"]));
    await click(await targetButton("Trip"));
    await click(await screen.findByRole("menuitem", { name: /ホームに置く/ }));
    await waitFor(() => expect(shortcutPuts).toHaveLength(1));
    expect(shortcutPuts[0]).toMatchObject({ app: "photo_diary", id: TRIP.id, on_home: true });
  });
});
