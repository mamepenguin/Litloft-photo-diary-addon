/**
 * Acceptance tests for daily notes, written from docs/specs/daily-notes.md
 * (SPEC-PD-005, SPEC-PD-006, SPEC-PD-007, I3, I4, I5, I6, I7, I8, I9, I10).
 *
 * The network is stood in for at `fetch`, with the core's public routes as
 * docs/reference/api.md gives them, so these hold whichever module the page
 * calls them through. @/hooks/usePolicy stays real and reads the policy route.
 * MarkdownPreview stays real and records its props.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import coreEn from "@/messages-core/en.json";
import ja from "./messages/ja.json";
import en from "./messages/en.json";
import Page from "./Page";
import * as mapModule from "./map/createPhotoMap";
import { saveState } from "./lib/savedState";
import { _resetPolicyCache } from "@/hooks/usePolicy";

const h = vi.hoisted(() => {
  const knowledgeSlots = { "file-detail-sections": [{ addon: "knowledge", component: "Editor", priority: 10 }] };
  const stub = (addons: Record<string, unknown>, slots: Record<string, unknown[]>) => ({
    addons,
    slots,
    loading: false,
    getSlotEntries: (id: string) => slots[id] ?? [],
    hasSlot: (id: string) => id in slots,
  });
  return {
    drive: { current: "family" as string | null },
    listeners: new Set<() => void>(),
    observers: new Set<{ callback: IntersectionObserverCallback }>(),
    scroll: { calls: [] as number[] },
    navigations: [] as { mode: string; url: string; options: unknown }[],
    previewProps: [] as Record<string, any>[],
    mapOptions: { current: null as null | Record<string, any> },
    installed: { current: true },
    withKnowledge: stub({ knowledge: { label: "Knowledge" } }, knowledgeSlots),
    withoutKnowledge: stub({}, {}),
  };
});

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
    push: (url: string, options?: unknown) => {
      h.navigations.push({ mode: "push", url, options });
      window.history.pushState(null, "", url);
      notify();
    },
    replace: (url: string, options?: unknown) => {
      h.navigations.push({ mode: "replace", url, options });
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
  useAddonSlots: () => (h.installed.current ? h.withKnowledge : h.withoutKnowledge),
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

vi.mock("@/components/MarkdownPreview", async (orig) => {
  const React = await import("react");
  const actual = await orig<any>();
  return {
    ...actual,
    MarkdownPreview: (props: any) => {
      h.previewProps.push(props);
      return React.createElement(actual.MarkdownPreview, props);
    },
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

// ---------------------------------------------------------------- the server

type NoteState = "empty" | "active" | "trashed" | "missing";
type Note = { state: NoteState; file_id: string; text?: string };
type Library = { photos: Record<string, string[]>; notes: Record<string, Note>; undated: number; points: unknown[] };
type Req = { method: string; path: string; query: URLSearchParams; body: any };

const BASE = "/api/addons/photo_diary";
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let drives: Record<string, Library>;
let requests: Req[];
let overrides: { match: (r: Req) => boolean; respond: (r: Req) => Response | Promise<Response>; once: boolean }[];
let editorPolicy: boolean;

function library(): Library {
  return {
    photos: {
      "2026-10-03": ids("d3-", 5),
      "2026-10-20": ids("d20-", 100),
      "2026-08-15": ids("d815-", 5),
      "2025-12-24": ids("d1224-", 2),
    },
    notes: {},
    undated: 3,
    points: [{ file_id: "a0", lat: 35, lon: 139, taken_at: "2026-10-03T10:00:00" }],
  };
}

const NOTHING_DATED = (): Library => ({ photos: {}, notes: {}, undated: 0, points: [] });

function dayRows(lib: Library, month: string) {
  const dates = new Set([
    ...Object.keys(lib.photos),
    ...Object.entries(lib.notes)
      .filter(([, n]) => n.state === "active")
      .map(([d]) => d),
  ]);
  return [...dates]
    .filter((d) => d.startsWith(month))
    .sort()
    .map((date) => ({ date, count: lib.photos[date]?.length ?? 0, has_note: lib.notes[date]?.state === "active" }));
}

function monthRows(lib: Library) {
  const months = new Set(
    [...Object.keys(lib.photos), ...Object.keys(lib.notes).filter((d) => lib.notes[d].state === "active")].map((d) =>
      d.slice(0, 7),
    ),
  );
  return [...months]
    .sort()
    .reverse()
    .map((month) => ({
      month,
      count: Object.entries(lib.photos)
        .filter(([d]) => d.startsWith(month))
        .reduce((n, [, photos]) => n + photos.length, 0),
    }));
}

function route(r: Req, driveHeader: string | null): Response {
  const lib = drives[driveHeader ?? h.drive.current ?? ""];
  if (r.path === `${BASE}/calendar/months`) return json({ months: monthRows(lib), undated_count: lib.undated });
  if (r.path === `${BASE}/calendar/days`) return json({ days: dayRows(lib, r.query.get("month")!) });
  if (r.path === `${BASE}/photos`) {
    const all = r.query.get("undated") ? ids("u", lib.undated) : (lib.photos[r.query.get("date")!] ?? []);
    const offset = Number(r.query.get("offset") ?? 0);
    const limit = Number(r.query.get("limit") ?? 40);
    return json({ file_ids: all.slice(offset, offset + limit), total: all.length });
  }
  if (r.path === `${BASE}/note`) {
    const note = lib.notes[r.query.get("date")!];
    return json(note ? { state: note.state, file_id: note.file_id } : { state: "none", file_id: null });
  }
  if (r.path === `${BASE}/points`) return json({ points: lib.points });
  if (r.path === `${BASE}/map-config`) return json({ tile_url: "https://t.example.test/{z}/{x}/{y}.png", attribution: "" });
  if (r.path === "/api/addons/status") return json(h.installed.current ? { addons: { knowledge: {} }, slots: {} } : { addons: {}, slots: {} });

  const policy = r.path.match(/^\/api\/drives\/[^/]+\/addon-policies$/);
  if (policy) return json({ addons: { knowledge: { default: true, features: { editor: editorPolicy } } } });

  const create = r.path.match(/^\/api\/drives\/([^/]+)\/files$/);
  if (create && r.method === "POST") {
    const target = drives[decodeURIComponent(create[1])];
    const date = String(r.body.path).replace("Photo Diary/", "").replace(".md", "");
    target.notes[date] = { state: "empty", file_id: `new-${date}` };
    return json({ id: `new-${date}`, file_path: r.body.path }, 201);
  }

  const file = r.path.match(/^\/api\/files\/([^/]+)\/(stream|restore)$/);
  if (file) {
    for (const candidate of Object.values(drives)) {
      for (const note of Object.values(candidate.notes)) {
        if (note.file_id !== file[1]) continue;
        if (file[2] === "stream") return new Response(note.text ?? "", { status: 200 });
        note.state = note.text ? "active" : "empty";
        return json({ id: note.file_id });
      }
    }
  }
  return json({ detail: "Not Found" }, 404);
}

const fakeFetch = vi.fn(async (input: any, init?: any) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, "http://localhost");
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const encoded = headers.get("X-Lit-Drive");
  const req: Req = {
    method: String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
  requests.push(req);
  const hit = overrides.find((o) => o.match(req));
  if (hit) {
    if (hit.once) overrides.splice(overrides.indexOf(hit), 1);
    return hit.respond(req);
  }
  return route(req, encoded ? decodeURIComponent(encoded) : null);
});

const isNote = (date?: string) => (r: Req) => r.path === `${BASE}/note` && (!date || r.query.get("date") === date);
const isStream = (id: string) => (r: Req) => r.path === `/api/files/${id}/stream`;
const isRestore = (id: string) => (r: Req) => r.path === `/api/files/${id}/restore` && r.method === "POST";
const isCreate = (r: Req) => /^\/api\/drives\/[^/]+\/files$/.test(r.path) && r.method === "POST";

const noteReads = (date?: string) => requests.filter(isNote(date)).length;
const streamReads = (id: string) => requests.filter(isStream(id)).length;
const creates = () => requests.filter(isCreate);
const writes = () => requests.filter((r) => r.method !== "GET");

function answer(match: (r: Req) => boolean, respond: (r: Req) => Response | Promise<Response>, once = true) {
  overrides.unshift({ match, respond, once });
}
const failWith = (match: (r: Req) => boolean, status: number, once = true) =>
  answer(match, () => json({ detail: "x" }, status), once);
const failNetwork = (match: (r: Req) => boolean, once = true) =>
  answer(match, () => Promise.reject(new TypeError("Failed to fetch")), once);

/** Holds one matching request until `release`, which then answers as `after` says or as the server would. */
function hold(match: (r: Req) => boolean, after?: () => Response) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  answer(match, async (r) => {
    await gate;
    return after ? after() : route(r, h.drive.current);
  });
  return () => act(async () => void release());
}

const fam = () => drives.family;
const active = (date: string, text = "本文メモ", file_id = `note-${date}`) => {
  fam().notes[date] = { state: "active", file_id, text };
};
const blank = (date: string, file_id = `note-${date}`) => {
  fam().notes[date] = { state: "empty", file_id };
};
const trashed = (date: string, text = "本文メモ", file_id = `note-${date}`) => {
  fam().notes[date] = { state: "trashed", file_id, text };
};
const missing = (date: string, file_id = `note-${date}`) => {
  fam().notes[date] = { state: "missing", file_id };
};

// ---------------------------------------------------------------- harness

let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;

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

const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  drives = { family: library(), "家族 写真": library(), work: NOTHING_DATED() };
  requests = [];
  overrides = [];
  editorPolicy = true;
  h.drive.current = "family";
  h.installed.current = true;
  h.observers.clear();
  h.scroll.calls.length = 0;
  h.navigations.length = 0;
  h.previewProps.length = 0;
  h.mapOptions.current = null;
  sessionStorage.clear();
  _resetPolicyCache();
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", IdleResizeObserver);
  vi.mocked(mapModule.createPhotoMap).mockReset();
  vi.mocked(mapModule.createPhotoMap).mockImplementation((async (_el: HTMLElement, options: any) => {
    h.mapOptions.current = options;
    return { setPoints: vi.fn(), setSelected: vi.fn(), destroy: vi.fn() };
  }) as any);

  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  pushSpy = vi.spyOn(window.history, "pushState").mockImplementation((...a) => {
    origPush(...a);
    h.listeners.forEach((cb) => cb());
  });
  replaceSpy = vi.spyOn(window.history, "replaceState").mockImplementation((...a) => {
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollTo;
  delete (Element.prototype as any).scrollTop;
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function mount(locale: "ja" | "en" = "ja") {
  const tree = () => (
    <NextIntlClientProvider locale={locale} messages={locale === "ja" ? { ...coreJa, ...ja } : { ...coreEn, ...en }}>
      <Page />
    </NextIntlClientProvider>
  );
  const view = render(tree());
  return { ...view, again: () => view.rerender(tree()) };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const sleep = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function open(search = "", locale: "ja" | "en" = "ja") {
  window.history.replaceState(null, "", `/drive/${h.drive.current}/addons/photo_diary${search}`);
  const view = mount(locale);
  await flush();
  return view;
}

const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const button = (name: string | RegExp) => screen.findByRole("button", { name });
const renderedIds = () =>
  Array.from(document.querySelectorAll("[data-testid=file]")).map((e) => e.getAttribute("data-id")!);
const refresh = () => click(screen.getAllByText("mock-refresh")[0]);
const tab = (name: string) => screen.getByRole("tab", { name });
const here = () => `${window.location.pathname}${window.location.search}`;
const bodyText = () => document.body.textContent ?? "";
const loadError = () => screen.queryAllByText("読み込めませんでした");

const control = (name: string) => screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name });
const writeControl = () => control("メモを書く");
const findWrite = () => waitFor(() => expect(writeControl()).not.toBeNull());
const editLink = () => screen.queryByRole("link", { name: "編集" });
const today = () => {
  const found = control("今日");
  expect(found).not.toBeNull();
  return found as HTMLElement;
};

const NOT_AVAILABLE = "このドライブでは使えません";
const COULD_NOT_START = "メモを作成できませんでした";
const RESCAN = "同じ名前のファイルがあります。ドライブを再スキャンしてください";
const TRASHED = "この日のメモはゴミ箱にあります";
const COULD_NOT_RESTORE = "元に戻せませんでした";
const MISSING = "この日のメモのファイルが見つかりません";

const OCT3 = "?month=2026-10&date=2026-10-03";
const OCT4 = "?month=2026-10&date=2026-10-04";

// ---------------------------------------------------------------- the calendar

describe("SPEC-PD-006: every day is a button", () => {
  it("a day with neither photos nor a note is named by its date, and pressing it opens its panel with a history entry", async () => {
    await open();
    const plain = await button("10月4日");
    pushSpy.mockClear();
    await click(plain);
    expect(window.location.search).toContain("date=2026-10-04");
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("この日の写真はありません")).toBeInTheDocument();
    await waitFor(() => expect(noteReads("2026-10-04")).toBe(1));
    expect(h.navigations.at(-1)?.options).toEqual({ scroll: false });
  });

  it("pressing a day with a note reads that date's note", async () => {
    active("2026-10-04", "四日のメモ");
    await open("?month=2026-10");
    await click(await button("10月4日、メモあり"));
    expect(await screen.findByText("四日のメモ")).toBeInTheDocument();
  });

  it("no day is a button while the month's days are loading, and none announces a count", async () => {
    const release = hold((r) => r.path === `${BASE}/calendar/days`);
    await open("?month=2026-10");
    expect(screen.queryAllByRole("button", { name: /^10月\d+日/ })).toEqual([]);
    await release();
    expect(await button("10月4日")).toBeEnabled();
  });
});

describe("SPEC-PD-006 I4: the mark", () => {
  it("a day with a note and no photos has a mark and shows no count, not even 0", async () => {
    active("2026-10-04");
    await open("?month=2026-10");
    const cell = await button("10月4日、メモあり");
    expect(cell.querySelector("svg")).not.toBeNull();
    expect(cell.textContent?.trim()).toBe("4");
  });

  it("a day with a note and photos has the mark as well as its count", async () => {
    active("2026-10-03");
    await open("?month=2026-10");
    const cell = await button("10月3日、5枚、メモあり");
    expect(cell.querySelector("svg")).not.toBeNull();
    expect(cell.textContent).toContain("5");
  });

  it("a day with neither is quiet, beside a day that has the mark", async () => {
    active("2026-10-04");
    await open("?month=2026-10");
    await button("10月4日、メモあり");
    expect((await button("10月5日")).querySelector("svg")).toBeNull();
    expect((await button("10月3日 5枚")).querySelector("svg")).toBeNull();
  });

  it.each([
    ["empty", () => blank("2026-10-04")],
    ["trashed", () => trashed("2026-10-04")],
    ["missing", () => missing("2026-10-04")],
  ])("I3: a day whose row is %s has no mark", async (_name, arrange) => {
    arrange();
    active("2026-10-05");
    await open("?month=2026-10");
    await button("10月5日、メモあり");
    expect(await button("10月4日")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /10月4日、メモあり/ })).toBeNull();
  });

  it("SPEC-PD-006 en: the labels are the spec's", async () => {
    active("2026-10-03");
    active("2026-10-04");
    await open("?month=2026-10", "en");
    expect(await button(/, 5 photos, has a note$/)).toBeInTheDocument();
    const noted = screen.getAllByRole("button", { name: /, has a note$/ });
    expect(noted).toHaveLength(2);
  });

  it("a mark comes and goes with the state on onRefresh: a note emptied loses it and is offered for writing again", async () => {
    active("2026-10-03");
    await open(OCT3);
    await button("10月3日、5枚、メモあり");
    await screen.findByText("本文メモ");
    blank("2026-10-03");
    await refresh();
    expect(await button("10月3日 5枚")).toBeInTheDocument();
    await findWrite();
    expect(screen.queryByText("本文メモ")).toBeNull();
    expect(editLink()).toBeNull();
  });
});

describe("SPEC-PD-006 I4: months with notes and no photos", () => {
  it("previous and next reach them", async () => {
    active("2026-09-09");
    await open("?month=2026-10");
    await button("10月3日 5枚");
    await click(await button("前の月"));
    expect(await button("9月9日、メモあり")).toBeInTheDocument();
    expect(window.location.search).toContain("month=2026-09");
    await click(await button("次の月"));
    expect(await button("10月3日 5枚")).toBeInTheDocument();
  });

  it("the month picker lists them with no count", async () => {
    active("2026-09-09");
    await open("?month=2026-10");
    await button("10月3日 5枚");
    await click(await button("月を選ぶ"));
    const row = await screen.findByRole("button", { name: /2026年9月/ });
    expect(row.textContent?.trim()).toBe("2026年9月");
    expect(screen.getByRole("button", { name: /2026年8月/ }).textContent).toMatch(/5/);
  });

  it("they add nothing to the scope line's photo count", async () => {
    active("2026-09-09");
    await open("?month=2026-09");
    await button("9月9日、メモあり");
    expect(screen.getByText(/^family/).textContent).toBe("family · 115枚");
  });

  it("a fresh start opens on the newest month, also when only a note makes it the newest", async () => {
    active("2099-01-01");
    await open();
    expect(await button("1月1日、メモあり")).toBeInTheDocument();
    expect(renderedIds()).toEqual([]);
    expect(noteReads()).toBe(0);
  });
});

// ---------------------------------------------------------------- the panel

describe("SPEC-PD-006 I9: the note in the panel", () => {
  it("the order is the date heading, the note, then the photos", async () => {
    active("2026-10-03");
    await open(OCT3);
    const text = await screen.findByText("本文メモ");
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    const heading = screen.getByText(/2026年10月3日\(土\)/);
    const grid = screen.getByTestId("file-grid");
    expect(heading.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the text comes from the core's stream by that date's file id, and goes to the core's preview", async () => {
    active("2026-10-03", "# 見出し\n\n本文", "n1");
    await open(OCT3);
    expect(await screen.findByRole("heading", { name: "見出し" })).toBeInTheDocument();
    expect(streamReads("n1")).toBe(1);
    const props = h.previewProps.at(-1)!;
    expect(props.source).toBe("# 見出し\n\n本文");
    expect(props.drive).toBe("family");
    expect(props.chrome).toBe(false);
    expect(props.showFrontmatter).toBe(false);
    expect(props).not.toHaveProperty("wikiResolution");
  });

  it("I9: frontmatter is not shown", async () => {
    active("2026-10-03", "---\ntitle: 隠す値\n---\n\n見える本文");
    await open(OCT3);
    expect(await screen.findByText("見える本文")).toBeInTheDocument();
    expect(bodyText()).not.toContain("隠す値");
  });

  it("a wiki link is plain text", async () => {
    active("2026-10-03", "前 [[他のメモ]] 後");
    await open(OCT3);
    await waitFor(() => expect(bodyText()).toContain("他のメモ"));
    expect(document.querySelector("a.wiki-link")).toBeNull();
    expect(screen.queryByRole("link", { name: "他のメモ" })).toBeNull();
  });

  it("a long note is rendered whole", async () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `行${i}`);
    active("2026-10-03", lines.join("\n\n"));
    await open(OCT3);
    expect(await screen.findByText("行1999")).toBeInTheDocument();
    expect(screen.getByText("行0")).toBeInTheDocument();
  });

  it("a day with a note and no photos shows the note and the list's empty message", async () => {
    active("2026-10-04");
    await open(OCT4);
    expect(await screen.findByText("本文メモ")).toBeInTheDocument();
    expect(screen.getByText("この日の写真はありません")).toBeInTheDocument();
  });

  it("a panel showing a note has Edit, to that date's file, and no write control", async () => {
    active("2026-10-03", "本文メモ", "n1");
    await open(OCT3);
    await screen.findByText("本文メモ");
    expect(editLink()?.getAttribute("href")).toBe("/files/n1?edit=1");
    expect(writeControl()).toBeNull();
  });

  it("Edit adds a history entry and goes to the file's editor", async () => {
    active("2026-10-03", "本文メモ", "n1");
    await open(OCT3);
    await screen.findByText("本文メモ");
    pushSpy.mockClear();
    await click(editLink()!);
    expect(here()).toBe("/files/n1?edit=1");
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it("empty reads no text, and offers the write control and no Edit", async () => {
    blank("2026-10-03", "n1");
    await open(OCT3);
    await findWrite();
    expect(editLink()).toBeNull();
    expect(streamReads("n1")).toBe(0);
  });
});

describe("SPEC-PD-006: where there is no note area", () => {
  it("the undated list reads no note", async () => {
    await open(OCT3);
    await waitFor(() => expect(noteReads("2026-10-03")).toBe(1));
    await click(await button(/撮影日なし/));
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1", "u2"]));
    expect(noteReads()).toBe(1);
    expect(writeControl()).toBeNull();
  });

  it("a map's point list reads no note; its heading link goes to the day, with its note", async () => {
    active("2026-10-03");
    await open("?view=map");
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    await act(async () => void h.mapOptions.current!.onPointClick(["a0"]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0"]));
    expect(noteReads()).toBe(0);
    await click(screen.getByRole("link", { name: /2026年10月3日/ }));
    expect(await screen.findByText("本文メモ")).toBeInTheDocument();
  });

  it("view=map&date reads no note until the calendar is shown", async () => {
    active("2026-10-03");
    await open("?view=map&date=2026-10-03");
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    expect(noteReads()).toBe(0);
    await click(tab("カレンダー"));
    expect(await screen.findByText("本文メモ")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- starting a note

describe("SPEC-PD-007 I5: Write a note", () => {
  it("in state none, one press sends one POST to the panel date's note path, then goes to the new file's editor with a history entry", async () => {
    await open(OCT4);
    await findWrite();
    pushSpy.mockClear();
    await click(writeControl()!);
    await waitFor(() => expect(here()).toBe("/files/new-2026-10-04?edit=1"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(creates()).toHaveLength(1);
    expect(creates()[0].path).toBe("/api/drives/family/files");
    expect(creates()[0].body).toEqual({
      path: "Photo Diary/2026-10-04.md",
      content: "",
      conflict_mode: "error",
    });
  });

  it("the drive in the URL is percent-encoded", async () => {
    h.drive.current = "家族 写真";
    await open(OCT3);
    await findWrite();
    await click(writeControl()!);
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0].path).toBe(`/api/drives/${encodeURIComponent("家族 写真")}/files`);
  });

  it("a date other than today writes to that date, not today's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0));
    await open("?month=2026-11&date=2026-11-01");
    await findWrite();
    await click(writeControl()!);
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0].body.path).toBe("Photo Diary/2026-11-01.md");
  });

  it("a future date with no photos can be written", async () => {
    await open("?month=2099-01&date=2099-01-01");
    await findWrite();
    await click(writeControl()!);
    await waitFor(() => expect(creates()[0]?.body.path).toBe("Photo Diary/2099-01-01.md"));
  });

  it("in state empty, the press sends no write and opens that date's own file", async () => {
    blank("2026-10-03", "n1");
    await open(OCT3);
    await findWrite();
    pushSpy.mockClear();
    await click(writeControl()!);
    await waitFor(() => expect(here()).toBe("/files/n1?edit=1"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([]);
  });

  it("pressing days, opening panels and moving between them sends no write", async () => {
    await open("?month=2026-10");
    await click(await button("10月4日"));
    await findWrite();
    await click(await button("10月5日"));
    await waitFor(() => expect(noteReads("2026-10-05")).toBe(1));
    await click(await button("前の月"));
    await button("8月15日 5枚");
    await click(await button("8月15日 5枚"));
    await waitFor(() => expect(noteReads("2026-08-15")).toBe(1));
    await refresh();
    expect(writes()).toEqual([]);
  });

  it("while creating, the control is disabled, so a second press sends nothing", async () => {
    const release = hold(isCreate);
    await open(OCT4);
    await findWrite();
    const pressed = writeControl()!;
    await click(pressed);
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(writeControl()).toBeDisabled();
    await click(pressed);
    expect(creates()).toHaveLength(1);
    await release();
  });

  it("a re-read waits while creating", async () => {
    const release = hold(isCreate, () => json({ detail: "x" }, 500));
    await open(OCT3);
    await findWrite();
    await click(writeControl()!);
    await waitFor(() => expect(creates()).toHaveLength(1));
    const before = noteReads("2026-10-03");
    await refresh();
    await flush();
    expect(noteReads("2026-10-03")).toBe(before);
    await release();
    await waitFor(() => expect(noteReads("2026-10-03")).toBeGreaterThan(before));
  });
});

describe("SPEC-PD-007 I3: when the editor is not available", () => {
  const arrangements: [string, () => void][] = [
    ["the knowledge addon is not installed", () => void (h.installed.current = false)],
    ["its editor policy is off for the drive", () => void (editorPolicy = false)],
  ];

  describe.each(arrangements)("%s", (_name, arrange) => {
    it("state none offers no write and creates nothing, on a panel that has read its state", async () => {
      arrange();
      await open(OCT4);
      await waitFor(() => expect(noteReads("2026-10-04")).toBeGreaterThan(0));
      await flush();
      await sleep(20);
      expect(writeControl()).toBeNull();
      expect(writes()).toEqual([]);
    });

    it("state empty offers no write", async () => {
      arrange();
      blank("2026-10-04");
      await open(OCT4);
      await waitFor(() => expect(noteReads("2026-10-04")).toBeGreaterThan(0));
      await sleep(20);
      expect(writeControl()).toBeNull();
    });

    it("a note is still shown, with no Edit link", async () => {
      arrange();
      active("2026-10-03");
      await open(OCT3);
      expect(await screen.findByText("本文メモ")).toBeInTheDocument();
      await sleep(20);
      expect(editLink()).toBeNull();
    });
  });

  it("with the editor available the same panels offer them", async () => {
    await open(OCT4);
    await findWrite();
  });
});

// ---------------------------------------------------------------- Today

describe("SPEC-PD-007 I8: the Today control", () => {
  const setNow = (iso: string, tz: string) => {
    process.env.TZ = tz;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };

  it.each([
    ["ahead of UTC", "2026-10-31T16:00:00Z", "Asia/Tokyo", 1, "2026-11", "2026-11-01"],
    ["behind UTC", "2026-11-01T02:00:00Z", "America/Los_Angeles", 31, "2026-10", "2026-10-31"],
  ])("I8: goes to the browser's local date %s", async (_name, iso, tz, localDay, month, date) => {
    setNow(iso, tz);
    expect(new Date().getDate()).toBe(localDay);
    await open("?month=2025-12");
    await button("12月24日 2枚");
    pushSpy.mockClear();
    await click(today());
    const q = new URLSearchParams(window.location.search);
    expect(q.get("month")).toBe(month);
    expect(q.get("date")).toBe(date);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(noteReads(date)).toBe(1));
  });

  it("does nothing when the date is already today", async () => {
    setNow("2026-10-03T03:00:00Z", "Asia/Tokyo");
    await open(OCT3);
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    pushSpy.mockClear();
    replaceSpy.mockClear();
    const reads = requests.length;
    await click(today());
    await flush();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(requests.length).toBe(reads);
  });

  it("opens the panel when today's month is showing with no panel open", async () => {
    setNow("2026-10-03T03:00:00Z", "Asia/Tokyo");
    await open("?month=2026-10");
    await button("10月3日 5枚");
    pushSpy.mockClear();
    await click(today());
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    expect(window.location.search).toContain("date=2026-10-03");
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it("reaches a month with no photos and no notes", async () => {
    setNow("2026-07-07T03:00:00Z", "Asia/Tokyo");
    await open();
    await button("10月3日 5枚");
    await click(today());
    expect(await screen.findByText("この日の写真はありません")).toBeInTheDocument();
    expect(await button("7月7日")).toHaveAttribute("aria-pressed", "true");
  });

  it("is there on a drive with nothing dated, and reaches today's month from the message", async () => {
    setNow("2026-07-07T03:00:00Z", "Asia/Tokyo");
    h.drive.current = "work";
    await open();
    expect(await screen.findByText("撮影日のある写真はありません")).toBeInTheDocument();
    await click(today());
    expect(await button("7月7日")).toBeInTheDocument();
    expect(screen.queryByText("撮影日のある写真はありません")).toBeNull();
    await waitFor(() => expect(noteReads("2026-07-07")).toBe(1));
    await findWrite();
  });

  it("en: is named Today", async () => {
    await open("", "en");
    await waitFor(() => expect(control("Today")).not.toBeNull());
  });
});

// ---------------------------------------------------------------- trash and missing

describe("SPEC-PD-007 I3 I7: a trashed note", () => {
  it("says so and offers Restore, no write, no Edit and no text", async () => {
    trashed("2026-10-03", "捨てた本文", "n1");
    await open(OCT3);
    expect(await screen.findByText(TRASHED)).toBeInTheDocument();
    expect(await button("元に戻す")).toBeEnabled();
    expect(writeControl()).toBeNull();
    expect(editLink()).toBeNull();
    expect(streamReads("n1")).toBe(0);
    expect(bodyText()).not.toContain("捨てた本文");
  });

  it("Restore calls the core with that date's id, and the note, its mark and its month come back without a reload", async () => {
    trashed("2026-09-09", "戻った本文", "n1");
    await open("?month=2026-09&date=2026-09-09");
    const restore = await button("元に戻す");
    const days = requests.filter((r) => r.path === `${BASE}/calendar/days`).length;
    const months = requests.filter((r) => r.path === `${BASE}/calendar/months`).length;
    await click(restore);
    expect(await screen.findByText("戻った本文")).toBeInTheDocument();
    expect(requests.filter(isRestore("n1"))).toHaveLength(1);
    expect(await button("9月9日、メモあり")).toBeInTheDocument();
    expect(requests.filter((r) => r.path === `${BASE}/calendar/days`).length).toBeGreaterThan(days);
    expect(requests.filter((r) => r.path === `${BASE}/calendar/months`).length).toBeGreaterThan(months);
    expect(screen.queryByText(TRASHED)).toBeNull();
    expect(editLink()?.getAttribute("href")).toBe("/files/n1?edit=1");
  });

  it("while restoring the control is disabled, and a re-read waits", async () => {
    trashed("2026-10-03", "本文", "n1");
    const release = hold(isRestore("n1"));
    await open(OCT3);
    const restore = await button("元に戻す");
    await click(restore);
    await waitFor(() => expect(requests.filter(isRestore("n1"))).toHaveLength(1));
    expect(restore).toBeDisabled();
    await click(restore);
    expect(requests.filter(isRestore("n1"))).toHaveLength(1);
    const before = noteReads("2026-10-03");
    await refresh();
    await flush();
    expect(noteReads("2026-10-03")).toBe(before);
    await release();
    expect(await screen.findByText("本文")).toBeInTheDocument();
  });

  it.each([404, 500])("Restore answering %i while the row is still trashed keeps Restore, with the message; 404 is not not-available", async (status) => {
    trashed("2026-10-03", "本文", "n1");
    failWith(isRestore("n1"), status);
    await open(OCT3);
    await button("元に戻す");
    const before = noteReads("2026-10-03");
    await click(await button("元に戻す"));
    expect(await screen.findByText(COULD_NOT_RESTORE)).toBeInTheDocument();
    expect(noteReads("2026-10-03")).toBe(before + 1);
    expect(screen.getByText(TRASHED)).toBeInTheDocument();
    expect(await button("元に戻す")).toBeEnabled();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it("the message lasts until the next press, and that press can succeed", async () => {
    trashed("2026-10-03", "本文", "n1");
    failWith(isRestore("n1"), 500);
    await open(OCT3);
    await click(await button("元に戻す"));
    await screen.findByText(COULD_NOT_RESTORE);
    const release = hold(isRestore("n1"));
    await click(await button("元に戻す"));
    await waitFor(() => expect(screen.queryByText(COULD_NOT_RESTORE)).toBeNull());
    await release();
    expect(await screen.findByText("本文")).toBeInTheDocument();
  });

  it("Restore answering 404 when the note is already back follows the state", async () => {
    trashed("2026-10-03", "本文", "n1");
    answer(isRestore("n1"), () => {
      active("2026-10-03", "本文", "n1");
      return json({ detail: "x" }, 404);
    });
    await open(OCT3);
    await click(await button("元に戻す"));
    expect(await screen.findByText("本文")).toBeInTheDocument();
    expect(screen.queryByText(COULD_NOT_RESTORE)).toBeNull();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it("Restore failing, then /note answering 404, is not-available", async () => {
    trashed("2026-10-03", "本文", "n1");
    answer(isRestore("n1"), () => {
      failWith(isNote("2026-10-03"), 404);
      return json({ detail: "x" }, 500);
    });
    await open(OCT3);
    await click(await button("元に戻す"));
    expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("Restore failing, then /note failing, keeps what is drawn with the load error", async () => {
    trashed("2026-10-03", "本文", "n1");
    answer(isRestore("n1"), () => {
      failWith(isNote("2026-10-03"), 500);
      return json({ detail: "x" }, 500);
    });
    await open(OCT3);
    await click(await button("元に戻す"));
    await waitFor(() => expect(loadError().length).toBeGreaterThan(0));
    expect(screen.getByText(TRASHED)).toBeInTheDocument();
    expect(await button("元に戻す")).toBeInTheDocument();
    expect(await button("再試行")).toBeInTheDocument();
  });

  it("a note trashed elsewhere stays on screen until the next read, then follows", async () => {
    active("2026-10-03", "本文", "n1");
    await open(OCT3);
    await screen.findByText("本文");
    trashed("2026-10-03", "本文", "n1");
    await flush();
    expect(screen.getByText("本文")).toBeInTheDocument();
    await refresh();
    expect(await screen.findByText(TRASHED)).toBeInTheDocument();
    expect(screen.queryByText("本文")).toBeNull();
    expect(editLink()).toBeNull();
  });
});

describe("SPEC-PD-007 I3: a missing note", () => {
  it("says the file cannot be found and offers no write, Edit or Restore", async () => {
    missing("2026-10-03", "n1");
    await open(OCT3);
    expect(await screen.findByText(MISSING)).toBeInTheDocument();
    expect(writeControl()).toBeNull();
    expect(editLink()).toBeNull();
    expect(screen.queryByRole("button", { name: "元に戻す" })).toBeNull();
    expect(streamReads("n1")).toBe(0);
  });
});

// ---------------------------------------------------------------- failures of the note read

describe("SPEC-PD-005 failure cases: /note", () => {
  it("404 on a first read replaces the whole page", async () => {
    failWith(isNote(), 404, false);
    await open(OCT3);
    expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
  });

  it("404 on a re-read replaces the whole page", async () => {
    active("2026-10-03");
    await open(OCT3);
    await screen.findByText("本文メモ");
    failWith(isNote(), 404, false);
    await refresh();
    expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it.each([
    ["500", () => failWith(isNote("2026-10-03"), 500)],
    ["a network failure", () => failNetwork(isNote("2026-10-03"))],
  ])("%s on a first read shows the load error; photos stay; no control until Retry reads /note again", async (_n, arrange) => {
    arrange();
    await open(OCT3);
    expect(await button("再試行")).toBeInTheDocument();
    expect(loadError()).toHaveLength(1);
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    expect(writeControl()).toBeNull();
    expect(editLink()).toBeNull();
    expect(noteReads("2026-10-03")).toBe(1);

    await click(await button("再試行"));
    await findWrite();
    expect(noteReads("2026-10-03")).toBe(2);
    expect(loadError()).toHaveLength(0);
  });

  it("no control is offered while the state is loading", async () => {
    const release = hold(isNote("2026-10-03"));
    await open(OCT3);
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    expect(writeControl()).toBeNull();
    expect(editLink()).toBeNull();
    expect(noteReads("2026-10-03")).toBe(1);
    await release();
    await findWrite();
  });

  it("on a re-read, a failure keeps what is drawn with its controls, the error and a retry above it", async () => {
    active("2026-10-03", "本文メモ", "n1");
    await open(OCT3);
    const text = await screen.findByText("本文メモ");
    failWith(isNote("2026-10-03"), 500);
    await refresh();
    const retry = await button("再試行");
    expect(screen.getByText("本文メモ")).toBe(text);
    expect(editLink()).not.toBeNull();
    expect(retry.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(retry);
    await waitFor(() => expect(loadError()).toHaveLength(0));
    expect(screen.getByText("本文メモ")).toBeInTheDocument();
  });

  it("on a re-read, a failed stream keeps the text with its Edit, the error and a retry", async () => {
    active("2026-10-03", "本文メモ", "n1");
    await open(OCT3);
    await screen.findByText("本文メモ");
    failWith(isStream("n1"), 500);
    await refresh();
    expect(await button("再試行")).toBeInTheDocument();
    expect(screen.getByText("本文メモ")).toBeInTheDocument();
    expect(editLink()).not.toBeNull();
  });
});

describe("SPEC-PD-006 failure cases: the stream", () => {
  it.each([404, 410])("%i with the row still active reads /note once, then shows the load error with no Edit, and stops", async (status) => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), status);
    await open(OCT3);
    expect(await button("再試行")).toBeInTheDocument();
    expect(noteReads("2026-10-03")).toBe(2);
    expect(streamReads("n1")).toBe(1);
    expect(editLink()).toBeNull();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
    await sleep(100);
    expect(noteReads("2026-10-03")).toBe(2);
    expect(streamReads("n1")).toBe(1);
  });

  it.each([404, 410])("Retry after %i reads /note and the stream once each", async (status) => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), status);
    await open(OCT3);
    await click(await button("再試行"));
    expect(await screen.findByText("本文メモ")).toBeInTheDocument();
    expect(noteReads("2026-10-03")).toBe(3);
    expect(streamReads("n1")).toBe(2);
    expect(editLink()?.getAttribute("href")).toBe("/files/n1?edit=1");
  });

  it.each([404, 410])("Retry after %i with the stream still answering it reads /note and the stream once each", async (status) => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), status, false);
    await open(OCT3);
    await click(await button("再試行"));
    await sleep(100);
    expect(await button("再試行")).toBeInTheDocument();
    expect(noteReads("2026-10-03")).toBe(3);
    expect(streamReads("n1")).toBe(2);
    expect(editLink()).toBeNull();
  });

  it("Retry that finds the row missing shows it in the panel and drops the mark from the grid", async () => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), 404, false);
    await open(OCT3);
    await button("再試行");
    await button("10月3日、5枚、メモあり");
    missing("2026-10-03", "n1");
    await click(await button("再試行"));
    expect(await screen.findByText(MISSING)).toBeInTheDocument();
    // Inside the 3 s second read, which would hide a calendar that is not read again.
    await waitFor(() => expect(screen.getByRole("button", { name: "10月3日 5枚" })).toBeInTheDocument(), {
      timeout: 1500,
    });
    expect(screen.queryByRole("button", { name: /10月3日、5枚、メモあり/ })).toBeNull();
  });

  it("Retry that finds the same state does not read the calendar again", async () => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), 404, false);
    await open(OCT3);
    await click(await button("再試行"));
    await sleep(100);
    const calendar = () => requests.filter((r) => r.path.startsWith(`${BASE}/calendar/`)).length;
    const before = calendar();
    await click(await button("再試行"));
    await sleep(100);
    expect(calendar()).toBe(before);
  });

  it.each([
    ["trashed", () => trashed("2026-10-03", "本文メモ", "n1"), TRASHED],
    ["missing", () => missing("2026-10-03", "n1"), MISSING],
  ])("404 where the row has become %s follows the new state", async (_n, change, message) => {
    active("2026-10-03", "本文メモ", "n1");
    answer(isStream("n1"), () => {
      change();
      return json({ detail: "x" }, 404);
    });
    await open(OCT3);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(loadError()).toHaveLength(0);
  });

  it("410 where the row has gone follows it to none", async () => {
    active("2026-10-03", "本文メモ", "n1");
    answer(isStream("n1"), () => {
      delete fam().notes["2026-10-03"];
      return json({ detail: "x" }, 410);
    });
    await open(OCT3);
    await findWrite();
    expect(loadError()).toHaveLength(0);
  });

  it("another failure shows the load error, and Retry reads only the stream", async () => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), 500);
    await open(OCT3);
    const retry = await button("再試行");
    expect(noteReads("2026-10-03")).toBe(1);
    await click(retry);
    expect(await screen.findByText("本文メモ")).toBeInTheDocument();
    expect(noteReads("2026-10-03")).toBe(1);
    expect(streamReads("n1")).toBe(2);
  });
});

// ---------------------------------------------------------------- failures of a write

describe("SPEC-PD-007 I6: creation answering 409", () => {
  it("still none: the rescan message, the control stays, the page stays, and no other request writes", async () => {
    failWith(isCreate, 409);
    await open(OCT4);
    await findWrite();
    const reads = noteReads("2026-10-04");
    const before = here();
    await click(writeControl()!);
    expect(await screen.findByText(RESCAN)).toBeInTheDocument();
    expect(noteReads("2026-10-04")).toBe(reads + 1);
    expect(here()).toBe(before);
    expect(writeControl()).not.toBeNull();
    expect(creates()).toHaveLength(1);
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it("the row has become active: the panel shows it, with no message and no navigation", async () => {
    answer(isCreate, () => {
      active("2026-10-04", "他で書いた", "n1");
      return json({ detail: "x" }, 409);
    });
    await open(OCT4);
    await findWrite();
    const before = here();
    await click(writeControl()!);
    expect(await screen.findByText("他で書いた")).toBeInTheDocument();
    expect(screen.queryByText(RESCAN)).toBeNull();
    expect(here()).toBe(before);
  });

  it("the row has become empty: the control is offered, with no message and no navigation", async () => {
    answer(isCreate, () => {
      blank("2026-10-04", "n1");
      return json({ detail: "x" }, 409);
    });
    await open(OCT4);
    await findWrite();
    const before = here();
    const reads = noteReads("2026-10-04");
    await click(writeControl()!);
    await waitFor(() => expect(noteReads("2026-10-04")).toBe(reads + 1));
    await findWrite();
    expect(screen.queryByText(RESCAN)).toBeNull();
    expect(here()).toBe(before);
  });

  it("/note answering 404 after it is not-available", async () => {
    answer(isCreate, () => {
      failWith(isNote("2026-10-04"), 404);
      return json({ detail: "x" }, 409);
    });
    await open(OCT4);
    await findWrite();
    await click(writeControl()!);
    expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
  });

  it("/note failing after it keeps the control with the load error, and stays on the page", async () => {
    answer(isCreate, () => {
      failWith(isNote("2026-10-04"), 500);
      return json({ detail: "x" }, 409);
    });
    await open(OCT4);
    await findWrite();
    const before = here();
    await click(writeControl()!);
    expect(await button("再試行")).toBeInTheDocument();
    expect(writeControl()).not.toBeNull();
    expect(here()).toBe(before);
  });

  it("the rescan message lasts through a re-read with the same result, and goes on the next press", async () => {
    failWith(isCreate, 409);
    await open(OCT3);
    await findWrite();
    await click(writeControl()!);
    await screen.findByText(RESCAN);
    await refresh();
    await flush();
    expect(screen.getByText(RESCAN)).toBeInTheDocument();
    const release = hold(isCreate, () => json({ detail: "x" }, 500));
    await click(writeControl()!);
    await waitFor(() => expect(screen.queryByText(RESCAN)).toBeNull());
    await release();
  });

  it("the rescan message goes on a re-read with a different result", async () => {
    failWith(isCreate, 409);
    await open(OCT3);
    await findWrite();
    await click(writeControl()!);
    await screen.findByText(RESCAN);
    active("2026-10-03", "スキャン後");
    await refresh();
    expect(await screen.findByText("スキャン後")).toBeInTheDocument();
    expect(screen.queryByText(RESCAN)).toBeNull();
  });

  it("the rescan message goes on moving to another day", async () => {
    failWith(isCreate, 409);
    await open("?month=2026-10&date=2026-10-04");
    await findWrite();
    await click(writeControl()!);
    await screen.findByText(RESCAN);
    await click(await button("10月5日"));
    await waitFor(() => expect(screen.queryByText(RESCAN)).toBeNull());
  });
});

describe("SPEC-PD-007: creation failing another way", () => {
  it("404 is not-available", async () => {
    failWith(isCreate, 404);
    await open(OCT4);
    await findWrite();
    await click(writeControl()!);
    expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it.each([
    ["500", () => failWith(isCreate, 500)],
    ["400", () => failWith(isCreate, 400)],
    ["a network failure", () => failNetwork(isCreate)],
  ])("%s: the panel stays with the message, and the control can be pressed again", async (_n, arrange) => {
    arrange();
    await open(OCT4);
    await findWrite();
    const before = here();
    await click(writeControl()!);
    expect(await screen.findByText(COULD_NOT_START)).toBeInTheDocument();
    expect(here()).toBe(before);
    expect(writeControl()).toBeEnabled();
    await click(writeControl()!);
    await waitFor(() => expect(here()).toBe("/files/new-2026-10-04?edit=1"));
    expect(creates()).toHaveLength(2);
  });

  it("the message goes on moving to another day", async () => {
    failWith(isCreate, 500);
    await open(OCT4);
    await findWrite();
    await click(writeControl()!);
    await screen.findByText(COULD_NOT_START);
    await click(await button("10月5日"));
    await waitFor(() => expect(screen.queryByText(COULD_NOT_START)).toBeNull());
  });

  it("the message goes on a re-read with a different result, and lasts through one with the same", async () => {
    failWith(isCreate, 500);
    await open(OCT3);
    await findWrite();
    await click(writeControl()!);
    await screen.findByText(COULD_NOT_START);
    await refresh();
    await flush();
    expect(screen.getByText(COULD_NOT_START)).toBeInTheDocument();
    active("2026-10-03", "別の本文");
    await refresh();
    expect(await screen.findByText("別の本文")).toBeInTheDocument();
    expect(screen.queryByText(COULD_NOT_START)).toBeNull();
  });
});

// ---------------------------------------------------------------- reading again

describe("SPEC-PD-006 I10: re-reads", () => {
  it("onRefresh reads /note and the text again, and a changed text replaces the old", async () => {
    active("2026-10-03", "古い本文", "n1");
    await open(OCT3);
    await screen.findByText("古い本文");
    active("2026-10-03", "新しい本文", "n1");
    await refresh();
    expect(await screen.findByText("新しい本文")).toBeInTheDocument();
    expect(screen.queryByText("古い本文")).toBeNull();
  });

  it("over a drawn note, a pending /note and a pending stream collapse nothing", async () => {
    active("2026-10-03", "本文メモ", "n1");
    await open(OCT3);
    const text = await screen.findByText("本文メモ");
    const releaseNote = hold(isNote("2026-10-03"));
    await refresh();
    await flush();
    expect(screen.getByText("本文メモ")).toBe(text);
    expect(editLink()).not.toBeNull();
    const releaseStream = hold(isStream("n1"));
    await releaseNote();
    await flush();
    expect(screen.getByText("本文メモ")).toBe(text);
    expect(editLink()).not.toBeNull();
    await releaseStream();
    expect(screen.getByText("本文メモ")).toBeInTheDocument();
  });

  it("a known state stays drawn during a re-read", async () => {
    blank("2026-10-03");
    await open(OCT3);
    await findWrite();
    hold(isNote("2026-10-03"));
    await refresh();
    await flush();
    expect(writeControl()).not.toBeNull();
    expect(loadError()).toHaveLength(0);
  });

  it("entering the calendar view reads again, and what is drawn stays meanwhile", async () => {
    active("2026-10-03", "古い本文", "n1");
    await open(OCT3);
    await screen.findByText("古い本文");
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    const reads = noteReads("2026-10-03");
    active("2026-10-03", "新しい本文", "n1");
    const release = hold(isNote("2026-10-03"));
    await click(tab("カレンダー"));
    await flush();
    expect(noteReads("2026-10-03")).toBe(reads + 1);
    expect(screen.getByText("古い本文")).toBeInTheDocument();
    await release();
    expect(await screen.findByText("新しい本文")).toBeInTheDocument();
  });

  it("a state that has not changed is not drawn again", async () => {
    missing("2026-10-03");
    await open(OCT3);
    const message = await screen.findByText(MISSING);
    await refresh();
    await flush();
    expect(screen.getByText(MISSING)).toBe(message);
  });
});

describe("SPEC-PD-006 I10: a day or drive the viewer has left", () => {
  it("a /note answer for the day left changes nothing", async () => {
    active("2026-10-03", "三日の本文");
    active("2026-10-05", "五日の本文");
    const release = hold(isNote("2026-10-03"));
    await open(OCT3);
    await click(await button("10月5日、メモあり"));
    expect(await screen.findByText("五日の本文")).toBeInTheDocument();
    await release();
    await flush();
    expect(screen.queryByText("三日の本文")).toBeNull();
    expect(screen.getByText("五日の本文")).toBeInTheDocument();
  });

  it("a stream answer for the day left changes nothing", async () => {
    active("2026-10-03", "三日の本文", "n3");
    blank("2026-10-05");
    const release = hold(isStream("n3"));
    await open(OCT3);
    await waitFor(() => expect(streamReads("n3")).toBe(1));
    await click(await button("10月5日"));
    await findWrite();
    await release();
    await flush();
    expect(screen.queryByText("三日の本文")).toBeNull();
    expect(writeControl()).not.toBeNull();
  });

  it("of two reads of one day, only the latest applies", async () => {
    active("2026-10-03", "古い本文", "n1");
    await open(OCT3);
    await screen.findByText("古い本文");
    const first = hold(isNote("2026-10-03"), () => json({ state: "trashed", file_id: "n1" }));
    await refresh();
    await refresh();
    await flush();
    await first();
    await flush();
    expect(screen.queryByText(TRASHED)).toBeNull();
    expect(screen.getByText("古い本文")).toBeInTheDocument();
  });

  it("a creation answered after leaving the day does not navigate", async () => {
    const release = hold(isCreate);
    await open(OCT4);
    await findWrite();
    await click(writeControl()!);
    await waitFor(() => expect(creates()).toHaveLength(1));
    await click(await button("10月5日"));
    await waitFor(() => expect(window.location.search).toContain("date=2026-10-05"));
    const before = here();
    await release();
    await flush();
    expect(here()).toBe(before);
    expect(screen.queryByText(COULD_NOT_START)).toBeNull();
  });

  it("a failed creation answered after leaving the day leaves no message on the next", async () => {
    const release = hold(isCreate, () => json({ detail: "x" }, 500));
    await open(OCT4);
    await findWrite();
    await click(writeControl()!);
    await waitFor(() => expect(creates()).toHaveLength(1));
    await click(await button("10月5日"));
    await waitFor(() => expect(noteReads("2026-10-05")).toBe(1));
    await release();
    await flush();
    expect(screen.queryByText(COULD_NOT_START)).toBeNull();
  });

  it("a restore answered after leaving the day leaves no message and no refresh of its panel", async () => {
    trashed("2026-10-03", "本文", "n1");
    const release = hold(isRestore("n1"), () => json({ detail: "x" }, 500));
    await open(OCT3);
    await click(await button("元に戻す"));
    await waitFor(() => expect(requests.filter(isRestore("n1"))).toHaveLength(1));
    await click(await button("10月5日"));
    await waitFor(() => expect(noteReads("2026-10-05")).toBe(1));
    const reads = noteReads("2026-10-03");
    await release();
    await flush();
    expect(screen.queryByText(COULD_NOT_RESTORE)).toBeNull();
    expect(noteReads("2026-10-03")).toBe(reads);
  });

  it("a /note answer for the drive left changes nothing, and the new drive has its own", async () => {
    active("2026-10-03", "家族の本文");
    const release = hold(isNote("2026-10-03"));
    const page = await open(OCT3);
    await waitFor(() => expect(noteReads("2026-10-03")).toBe(1));
    h.drive.current = "work";
    window.history.replaceState(null, "", "/drive/work/addons/photo_diary");
    page.again();
    await screen.findByText("撮影日のある写真はありません");
    await release();
    await flush();
    expect(screen.queryByText("家族の本文")).toBeNull();
    expect(screen.getByText("撮影日のある写真はありません")).toBeInTheDocument();
  });
});

describe("SPEC-PD-006 I10: the saved scroll position waits for the note area", () => {
  const RESTORE = "?month=2026-10&date=2026-10-20";

  it("with a note: applied only once the text is rendered", async () => {
    active("2026-10-20", "本文メモ", "n1");
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    const release = hold(isStream("n1"));
    await open(RESTORE);
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    await waitFor(() => expect(streamReads("n1")).toBe(1));
    await sleep(100);
    expect(h.scroll.calls).not.toContain(640);
    await release();
    await screen.findByText("本文メモ");
    await waitFor(() => expect(h.scroll.calls).toContain(640));
  });

  it("with no note: applied once the state is known", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    const release = hold(isNote("2026-10-20"));
    await open(RESTORE);
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    await sleep(100);
    expect(h.scroll.calls).not.toContain(640);
    await release();
    await waitFor(() => expect(h.scroll.calls).toContain(640));
  });

  it("with a failed first read: applied once it has failed", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    const release = hold(isNote("2026-10-20"), () => json({ detail: "x" }, 500));
    await open(RESTORE);
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    await sleep(100);
    expect(h.scroll.calls).not.toContain(640);
    await release();
    await waitFor(() => expect(h.scroll.calls).toContain(640));
  });

  it("an undated list has nothing to wait for, on a calendar whose days do have notes", async () => {
    active("2026-10-03");
    saveState("family", { list: { loaded: 3, scrollY: 640 } });
    await open("?month=2026-10&undated=true");
    await button("10月3日、5枚、メモあり");
    await waitFor(() => expect(renderedIds()).toHaveLength(3));
    await waitFor(() => expect(h.scroll.calls).toContain(640));
    expect(noteReads()).toBe(0);
  });
});

// ---------------------------------------------------------------- coming back from the editor

describe("SPEC-PD-007 I7: coming back from the editor by Back", () => {
  async function pressWriteAndComeBack(whileInTheEditor?: () => void) {
    const view = await open("?month=2026-10&date=2026-10-04");
    await findWrite();
    await click(writeControl()!);
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/files\//));
    view.unmount();
    whileInTheEditor?.();
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(window.location.search).toBe("?month=2026-10&date=2026-10-04"));
    requests = [];
    mount();
    await flush();
  }

  it("a save the first read overtook appears at the second read, 3 seconds later, without a reload", async () => {
    await pressWriteAndComeBack();
    await waitFor(() => expect(noteReads("2026-10-04")).toBe(1));
    await findWrite();
    await button("10月4日");

    active("2026-10-04", "最後の保存", "new-2026-10-04");
    await sleep(2000);
    expect(noteReads("2026-10-04")).toBe(1);
    expect(screen.queryByText("最後の保存")).toBeNull();

    await sleep(1300);
    expect(noteReads("2026-10-04")).toBe(2);
    expect(await screen.findByText("最後の保存")).toBeInTheDocument();
    expect(await button("10月4日、メモあり")).toBeInTheDocument();
    expect(writeControl()).toBeNull();
    expect(editLink()?.getAttribute("href")).toBe("/files/new-2026-10-04?edit=1");
  });

  it("does not repeat after the second read", async () => {
    await pressWriteAndComeBack();
    await waitFor(() => expect(noteReads("2026-10-04")).toBe(1));
    await sleep(3300);
    expect(noteReads("2026-10-04")).toBe(2);
    await sleep(3500);
    expect(noteReads("2026-10-04")).toBe(2);
  });

  it("the second read changes nothing on screen when its result is the same", async () => {
    await pressWriteAndComeBack(() => active("2026-10-04", "保存済み", "new-2026-10-04"));
    const text = await screen.findByText("保存済み");
    await sleep(3300);
    expect(screen.getByText("保存済み")).toBe(text);
  });

  it("a second read that fails keeps what is drawn, with the error and a retry", async () => {
    await pressWriteAndComeBack();
    await findWrite();
    failWith(isNote("2026-10-04"), 500);
    await sleep(3300);
    expect(writeControl()).not.toBeNull();
    expect(await button("再試行")).toBeInTheDocument();
  });

  it("a second read for a day the viewer has left does not change the panel", async () => {
    blank("2026-10-05");
    await pressWriteAndComeBack();
    await findWrite();
    await click(await button("10月5日"));
    await waitFor(() => expect(noteReads("2026-10-05")).toBeGreaterThan(0));
    active("2026-10-04", "四日の本文", "new-2026-10-04");
    await sleep(3300);
    expect(screen.queryByText("四日の本文")).toBeNull();
    expect(window.location.search).toContain("date=2026-10-05");
  });

  it("coming back from an edit that emptied the note loses its mark and offers writing again", async () => {
    active("2026-10-03", "本文メモ", "n1");
    const view = await open(OCT3);
    await screen.findByText("本文メモ");
    await click(editLink()!);
    view.unmount();
    blank("2026-10-03", "n1");
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    mount();
    await findWrite();
    expect(await button("10月3日 5枚")).toBeInTheDocument();
    expect(screen.queryByText("本文メモ")).toBeNull();
  });

  it("I9: the text after coming back is the file's current text", async () => {
    active("2026-10-03", "古い本文", "n1");
    const view = await open(OCT3);
    await screen.findByText("古い本文");
    await click(editLink()!);
    view.unmount();
    active("2026-10-03", "直した本文", "n1");
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    mount();
    expect(await screen.findByText("直した本文")).toBeInTheDocument();
    expect(screen.queryByText("古い本文")).toBeNull();
  });
});

// ---------------------------------------------------------------- the page URL

describe("SPEC-PD-006 SPEC-PD-007: page URL rows", () => {
  it("no month and no date: the newest month with dated photos or notes, and no panel", async () => {
    active("2026-11-02");
    await open();
    expect(await button("11月2日、メモあり")).toBeInTheDocument();
    expect(requests.filter((r) => r.path === `${BASE}/calendar/days`)[0].query.get("month")).toBe("2026-11");
    expect(noteReads()).toBe(0);
  });

  it("a real month with no photos and no notes: every day a button, previous and next to the nearest months with photos or notes", async () => {
    active("2026-09-09");
    await open("?month=2026-07");
    expect(screen.getAllByRole("button", { name: /^7月\d+日$/ })).toHaveLength(31);
    await click(await button("次の月"));
    expect(await button("8月15日 5枚")).toBeInTheDocument();
  });

  it("a real date with no photos: its month, with the note area and the empty message", async () => {
    await open("?date=2026-09-15");
    expect(await button("9月15日")).toHaveAttribute("aria-pressed", "true");
    await findWrite();
    expect(screen.getByText("この日の写真はありません")).toBeInTheDocument();
  });

  it("any date on a drive with nothing dated: an ordinary grid, previous and next disabled, no picker, the day's panel open", async () => {
    h.drive.current = "work";
    await open("?date=2026-10-03");
    expect(await button("10月3日")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("撮影日のある写真はありません")).toBeNull();
    expect(await button("前の月")).toBeDisabled();
    expect(await button("次の月")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "月を選ぶ" })).toBeNull();
    await findWrite();
    expect(screen.getByText("この日の写真はありません")).toBeInTheDocument();
  });

  it("any month on a drive with nothing dated: an ordinary grid, and no panel", async () => {
    h.drive.current = "work";
    await open("?month=2026-10");
    expect(await button("10月3日")).toBeEnabled();
    expect(await button("前の月")).toBeDisabled();
    expect(noteReads()).toBe(0);
  });

  it("no month and no date on a drive with nothing dated: the message with Today, in place of the grid", async () => {
    h.drive.current = "work";
    await open();
    expect(await screen.findByText("撮影日のある写真はありません")).toBeInTheDocument();
    expect(today()).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^\d+月\d+日/ })).toEqual([]);
  });

  it("undated still opens its list on a drive with no dated photos, under the message with Today", async () => {
    drives.work.undated = 2;
    h.drive.current = "work";
    await open("?undated=true");
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1"]));
    expect(screen.getByText("撮影日のある写真はありません")).toBeInTheDocument();
    expect(today()).toBeInTheDocument();
  });

  it("a drive with only a note is not a drive with nothing dated", async () => {
    drives.work.notes["2026-05-05"] = { state: "active", file_id: "w1", text: "五月の本文" };
    h.drive.current = "work";
    await open();
    expect(await button("5月5日、メモあり")).toBeInTheDocument();
    expect(screen.queryByText("撮影日のある写真はありません")).toBeNull();
  });
});

// ---------------------------------------------------------------- messages

describe("SPEC-PD-006 SPEC-PD-007: messages in en", () => {
  it("Write a note, Could not start, and the rescan message", async () => {
    failWith(isCreate, 500);
    await open(OCT4, "en");
    const write = await button("Write a note");
    await click(write);
    expect(await screen.findByText("Could not start the note")).toBeInTheDocument();
    failWith(isCreate, 409);
    await click(await button("Write a note"));
    expect(await screen.findByText("A file with this name already exists. Rescan the drive")).toBeInTheDocument();
  });

  it("the trash, Restore and Could not restore", async () => {
    trashed("2026-10-03", "text", "n1");
    failWith(isRestore("n1"), 500);
    await open(OCT3, "en");
    expect(await screen.findByText("This day's note is in the trash")).toBeInTheDocument();
    await click(await button("Restore"));
    expect(await screen.findByText("Could not restore")).toBeInTheDocument();
  });

  it("missing, and Edit", async () => {
    missing("2026-10-03");
    active("2026-10-04", "text");
    await open(OCT3, "en");
    expect(await screen.findByText("The file for this day's note cannot be found")).toBeInTheDocument();
    await click(await button(/, has a note$/));
    expect(await screen.findByRole("link", { name: "Edit" })).toBeInTheDocument();
    expect(within(document.body).queryByText(/\b(404|409|410|500)\b/)).toBeNull();
  });
});

// ---------------------------------------------------------------- readings decided by the user

const isPolicy = (r: Req) => /^\/api\/drives\/[^/]+\/addon-policies$/.test(r.path);

describe("a stream 404 or 410 on a re-read over drawn text", () => {
  it.each([404, 410])("%i keeps the text and Edit, with the load error and a retry above them", async (status) => {
    active("2026-10-03", "本文メモ", "n1");
    await open(OCT3);
    const text = await screen.findByText("本文メモ");
    failWith(isStream("n1"), status);
    await refresh();
    const retry = await button("再試行");
    expect(screen.getByText("本文メモ")).toBe(text);
    expect(editLink()?.getAttribute("href")).toBe("/files/n1?edit=1");
    expect(retry.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(noteReads("2026-10-03")).toBe(3);
    await sleep(100);
    expect(noteReads("2026-10-03")).toBe(3);
    expect(streamReads("n1")).toBe(2);
  });
});

describe("a first read of the stream failing", () => {
  it.each([500, 403])("with %i still offers Edit, because the state is known to be active", async (status) => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), status);
    await open(OCT3);
    await button("再試行");
    expect(screen.queryByText("本文メモ")).toBeNull();
    expect(editLink()?.getAttribute("href")).toBe("/files/n1?edit=1");
  });

  it("with a network failure still offers Edit", async () => {
    active("2026-10-03", "本文メモ", "n1");
    failNetwork(isStream("n1"));
    await open(OCT3);
    await button("再試行");
    expect(editLink()).not.toBeNull();
  });

  it.each([404, 410])("with %i, the row still active, offers no Edit", async (status) => {
    active("2026-10-03", "本文メモ", "n1");
    failWith(isStream("n1"), status);
    await open(OCT3);
    await button("再試行");
    await sleep(50);
    expect(editLink()).toBeNull();
  });

  it("offers no Edit while the text is still loading, and does once it has arrived", async () => {
    active("2026-10-03", "本文メモ", "n1");
    const release = hold(isStream("n1"));
    await open(OCT3);
    await waitFor(() => expect(streamReads("n1")).toBe(1));
    await sleep(50);
    expect(editLink()).toBeNull();
    expect(writeControl()).toBeNull();
    await release();
    await screen.findByText("本文メモ");
    expect(editLink()).not.toBeNull();
  });
});

describe("while the editor's availability is being read", () => {
  it("Write a note is hidden until the policy has answered, then shown", async () => {
    const release = hold(isPolicy);
    await open(OCT4);
    await waitFor(() => expect(noteReads("2026-10-04")).toBe(1));
    await flush();
    await sleep(50);
    expect(writeControl()).toBeNull();
    await release();
    await findWrite();
  });

  it("Edit is hidden until the policy has answered, then shown", async () => {
    active("2026-10-03", "本文メモ", "n1");
    const release = hold(isPolicy);
    await open(OCT3);
    await screen.findByText("本文メモ");
    await sleep(50);
    expect(editLink()).toBeNull();
    await release();
    await waitFor(() => expect(editLink()).not.toBeNull());
  });

  it("both are hidden while the list of addons is loading", async () => {
    active("2026-10-03", "本文メモ", "n1");
    h.withKnowledge.loading = true;
    try {
      const page = await open(OCT3);
      await screen.findByText("本文メモ");
      await sleep(50);
      expect(editLink()).toBeNull();
      h.withKnowledge.loading = false;
      page.again();
      await waitFor(() => expect(editLink()).not.toBeNull());
    } finally {
      h.withKnowledge.loading = false;
    }
  });

  it.each([
    ["500", () => failWith(isPolicy, 500)],
    ["a network failure", () => failNetwork(isPolicy)],
  ])("when the read fails (%s) they are shown, as on the file page", async (_name, arrange) => {
    arrange();
    active("2026-10-03", "本文メモ", "n1");
    await open(OCT3);
    await screen.findByText("本文メモ");
    await waitFor(() => expect(editLink()).not.toBeNull());
    await click(await button("10月4日"));
    await findWrite();
  });

  it("a later refetch of the policy does not hide what is shown", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await open(OCT4);
    await findWrite();
    vi.setSystemTime(Date.now() + 60_000);
    const release = hold(isPolicy);
    await click(await button("10月3日 5枚"));
    await waitFor(() => expect(requests.filter(isPolicy).length).toBeGreaterThan(1));
    expect(writeControl()).not.toBeNull();
    await release();
    expect(writeControl()).not.toBeNull();
  });
});

describe("the saved scroll position when the first read of the stream fails", () => {
  it.each([500, 404])("is applied once it has failed with %i", async (status) => {
    active("2026-10-20", "本文メモ", "n1");
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    failWith(isStream("n1"), status, false);
    await open("?month=2026-10&date=2026-10-20");
    await button("再試行");
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    await waitFor(() => expect(h.scroll.calls).toContain(640), { timeout: 1500 });
  });
});

describe("the second read 3 seconds later runs on any entry to the page with a day open", () => {
  it("on a page opened straight on a day, not only from the editor", async () => {
    active("2026-10-03", "古い本文", "n1");
    await open(OCT3);
    await screen.findByText("古い本文");
    active("2026-10-03", "新しい本文", "n1");
    await sleep(2000);
    expect(noteReads("2026-10-03")).toBe(1);
    await sleep(1300);
    expect(noteReads("2026-10-03")).toBe(2);
    expect(await screen.findByText("新しい本文")).toBeInTheDocument();
    await sleep(3300);
    expect(noteReads("2026-10-03")).toBe(2);
  });

  it("changes nothing on screen when its result is the same, on a day with photos", async () => {
    active("2026-10-03", "保存済み", "n1");
    await open(OCT3);
    const text = await screen.findByText("保存済み");
    await sleep(3300);
    expect(noteReads("2026-10-03")).toBe(2);
    expect(screen.getByText("保存済み")).toBe(text);
  });

  it("not when the page was entered with no day open and a day is pressed later", async () => {
    await open("?month=2026-10");
    await click(await button("10月4日"));
    await findWrite();
    await sleep(3300);
    expect(noteReads("2026-10-04")).toBe(1);
  });

  it("on the calendar entered from the map with a day open", async () => {
    active("2026-10-03", "本文メモ", "n1");
    await open("?view=map&date=2026-10-03");
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    await click(tab("カレンダー"));
    await screen.findByText("本文メモ");
    expect(noteReads("2026-10-03")).toBe(1);
    await sleep(3300);
    expect(noteReads("2026-10-03")).toBe(2);
  });
});

describe("month and day data while loading and re-fetching", () => {
  it("a re-fetch of the days and months keeps the grid with its marks and buttons", async () => {
    active("2026-10-04", "四日のメモ");
    await open("?month=2026-10");
    await button("10月4日、メモあり");
    await click(await button("10月3日 5枚"));
    const releaseDays = hold((r) => r.path === `${BASE}/calendar/days`);
    const releaseMonths = hold((r) => r.path === `${BASE}/calendar/months`);
    await refresh();
    await flush();
    expect(await button("10月4日、メモあり")).toBeEnabled();
    expect(screen.getByRole("button", { name: "10月5日" })).toBeEnabled();
    await releaseDays();
    await releaseMonths();
    expect(await button("10月4日、メモあり")).toBeEnabled();
  });
});
