/**
 * Acceptance tests for the Photo Diary page, written from
 * docs/specs/photo-diary.md (SPEC-PD-001, SPEC-PD-002, SPEC-PD-003 failure
 * rows, I6, I7, I8, I9) and docs/reviews/photo-diary/frontend-interface.md.
 *
 * Mocked, as the interface names them: ./api, @/lib/api (batchGetFiles),
 * @/components/FileGrid, @/components/CurrentDriveProvider,
 * next/navigation and ./map/createPhotoMap. next/link is also replaced by a
 * plain anchor that calls the mocked router, so a heading link is observable.
 * Everything else, including ./lib/savedState and next-intl, is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import coreEn from "@/messages-core/en.json";
import ja from "./messages/ja.json";
import en from "./messages/en.json";
import Page from "./Page";
import * as api from "./api";
import * as mapModule from "./map/createPhotoMap";
import { loadState, saveState } from "./lib/savedState";

type Point = { file_id: string; lat: number; lon: number; taken_at: string | null };
type Dataset = {
  months: { month: string; count: number }[];
  undated_count: number;
  days: Record<string, { date: string; count: number }[]>;
  photos: Record<string, string[]>; // key: a date, or "undated"
  points: Point[];
};

const h = vi.hoisted(() => ({
  drive: { current: "family" as string | null },
  listeners: new Set<() => void>(),
  gridProps: [] as Record<string, unknown>[],
  observers: new Set<{ callback: IntersectionObserverCallback }>(),
  missing: new Set<string>(),
  handles: [] as { setPoints: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[],
  mapOptions: { current: null as null | Record<string, any> },
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

vi.mock("@/components/CurrentDriveProvider", () => ({
  useCurrentDrive: () => h.drive.current,
}));

vi.mock("@/components/FileGrid", async () => {
  const React = await import("react");
  return {
    FileGrid: (props: any) => {
      h.gridProps.push(props);
      return React.createElement(
        "div",
        { "data-testid": "file-grid", "data-more": String(props.moreMayFollow) },
        ...props.files.map((f: any) =>
          React.createElement("span", { key: f.id, "data-testid": "file", "data-id": f.id }, f.filename),
        ),
        React.createElement("button", { onClick: props.onRefresh }, "mock-refresh"),
      );
    },
  };
});

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getDrives: vi.fn(async () => []),
  batchGetFiles: vi.fn(),
}));

vi.mock("./api", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message = `HTTP ${status}`) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    fetchMonths: vi.fn(),
    fetchDays: vi.fn(),
    fetchPhotos: vi.fn(),
    fetchPoints: vi.fn(),
    fetchMapConfig: vi.fn(),
  };
});

vi.mock("./map/createPhotoMap", () => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, createPhotoMap: vi.fn() };
});

import * as coreApi from "@/lib/api";

// ---------------------------------------------------------------- data

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function familyData(): Dataset {
  const a = ids("a", 30);
  const b = ids("b", 15);
  const n = ids("n", 5);
  return {
    months: [
      { month: "2026-10", count: 132 },
      { month: "2026-08", count: 5 },
      { month: "2025-12", count: 2 },
    ],
    undated_count: 3,
    days: {
      "2026-10": [
        { date: "2026-10-03", count: 5 },
        { date: "2026-10-11", count: 27 },
        { date: "2026-10-20", count: 100 },
      ],
      "2026-08": [{ date: "2026-08-15", count: 5 }],
      "2025-12": [{ date: "2025-12-24", count: 2 }],
    },
    photos: {
      "2026-10-03": ids("d3-", 5),
      "2026-10-11": ids("d11-", 27),
      "2026-10-20": ids("d20-", 100),
      "2026-08-15": ids("d815-", 5),
      "2025-12-24": ids("d1224-", 2),
      undated: ids("u", 3),
    },
    // /points order: dated oldest first, then undated.
    points: [
      ...b.map((id, i) => ({ file_id: id, lat: 35, lon: 139, taken_at: `2026-08-01T09:${String(i).padStart(2, "0")}:00` })),
      ...a.map((id, i) => ({ file_id: id, lat: 35, lon: 139, taken_at: `2026-10-03T10:${String(i).padStart(2, "0")}:00` })),
      ...n.map((id) => ({ file_id: id, lat: 35, lon: 139, taken_at: null })),
    ],
  };
}

const WORK: Dataset = {
  months: [{ month: "2024-05", count: 1 }],
  undated_count: 0,
  days: { "2024-05": [{ date: "2024-05-09", count: 1 }] },
  photos: { "2024-05-09": ["w1"] },
  points: [{ file_id: "w1", lat: 1, lon: 1, taken_at: "2024-05-09T10:00:00" }],
};

let data: Record<string, Dataset>;
const MAP_CONFIG = { tile_url: "https://tiles.example.test/{z}/{x}/{y}.png", attribution: "<a href=\"https://example.test\">tiles</a>" };

function setDefaults() {
  vi.mocked(api.fetchMonths).mockImplementation(async (drive: string) => ({
    months: data[drive].months,
    undated_count: data[drive].undated_count,
  }));
  vi.mocked(api.fetchDays).mockImplementation(async (drive: string, month: string) => ({
    days: data[drive].days[month] ?? [],
  }));
  vi.mocked(api.fetchPhotos).mockImplementation(async (drive: string, q: any) => {
    const all = data[drive].photos[q.undated ? "undated" : q.date] ?? [];
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 40;
    return { file_ids: all.slice(offset, offset + limit), total: all.length };
  });
  vi.mocked(api.fetchPoints).mockImplementation(async (drive: string) => ({ points: data[drive].points }));
  vi.mocked(api.fetchMapConfig).mockImplementation(async () => MAP_CONFIG);
  vi.mocked(coreApi.batchGetFiles).mockImplementation((async (want: string[]) =>
    want.filter((id) => !h.missing.has(id)).map((id) => ({ id, filename: `${id}.jpg` }))) as any);
  vi.mocked(mapModule.createPhotoMap).mockImplementation((async (_el: HTMLElement, options: any) => {
    h.mapOptions.current = options;
    const handle = { setPoints: vi.fn(), destroy: vi.fn() };
    h.handles.push(handle);
    return handle;
  }) as any);
}

function apiError(status: number): Error {
  const Ctor = (api as any).ApiError;
  return new Ctor(status);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

beforeEach(() => {
  data = { family: familyData(), work: WORK };
  h.drive.current = "family";
  h.gridProps.length = 0;
  h.observers.clear();
  h.missing.clear();
  h.handles.length = 0;
  h.mapOptions.current = null;
  h.scroll.calls.length = 0;
  sessionStorage.clear();
  vi.mocked(api.fetchMonths).mockReset();
  vi.mocked(api.fetchDays).mockReset();
  vi.mocked(api.fetchPhotos).mockReset();
  vi.mocked(api.fetchPoints).mockReset();
  vi.mocked(api.fetchMapConfig).mockReset();
  vi.mocked(coreApi.batchGetFiles).mockReset();
  vi.mocked(mapModule.createPhotoMap).mockReset();
  setDefaults();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollTo;
  delete (Element.prototype as any).scrollTop;
});

function renderPage(search = "", locale: "ja" | "en" = "ja") {
  const base = `/drive/${h.drive.current}/addons/photo_diary`;
  window.history.replaceState(null, "", `${base}${search}`);
  const tree = () => (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ja" ? { ...coreJa, ...ja } : { ...coreEn, ...en }}
    >
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

/** Fires every live intersection observer and a scroll event: either is how a list asks for more. */
async function loadMore() {
  await act(async () => {
    for (const o of [...h.observers]) {
      o.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], o as any);
    }
    window.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function goBack() {
  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 30));
  });
}

const renderedIds = () =>
  Array.from(document.querySelectorAll("[data-testid=file]")).map((e) => e.getAttribute("data-id")!);

const bodyText = () => document.body.textContent ?? "";
const day = (label: string) => screen.findByRole("button", { name: label });
const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const tab = (name: string) => screen.getByRole("tab", { name });
const lastGrid = () => h.gridProps.at(-1)!;

const settled = async (search = "", locale: "ja" | "en" = "ja") => {
  const r = renderPage(search, locale);
  await flush();
  return r;
};

async function openMap(search = "?view=map") {
  const r = await settled(search);
  await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
  return r;
}

const point = (k: number[]) => k.map((i) => `a${i}`);
const clickPoint = (fileIds: string[]) => act(async () => void h.mapOptions.current!.onPointClick(fileIds));
const allIds = () => data.family.points.map((p) => p.file_id);

// ---------------------------------------------------------------- calendar

describe("SPEC-PD-001: calendar", () => {
  it("opens on the newest month with dated photos, and the day buttons carry their count", async () => {
    await settled();
    expect(api.fetchMonths).toHaveBeenCalledWith("family");
    expect(api.fetchDays).toHaveBeenCalledWith("family", "2026-10");
    expect(api.fetchDays).not.toHaveBeenCalledWith("family", "2026-08");
    expect(await day("10月11日 27枚")).toBeInTheDocument();
    expect(await day("10月3日 5枚")).toBeInTheDocument();
    expect(tab("カレンダー")).toHaveAttribute("aria-selected", "true");
    expect(tab("地図")).toHaveAttribute("aria-selected", "false");
  });

  it("a day without photos is plain text, not a button", async () => {
    await settled();
    await day("10月3日 5枚");
    const cell = screen.getByText("4", { exact: true });
    expect(cell.closest("button")).toBeNull();
  });

  it("previous and next skip to the nearest month with photos and are disabled at the ends", async () => {
    await settled();
    await day("10月3日 5枚");
    expect(screen.getByRole("button", { name: "次の月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "前の月" })).toBeEnabled();

    await click(screen.getByRole("button", { name: "前の月" }));
    await day("8月15日 5枚");
    expect(api.fetchDays).toHaveBeenLastCalledWith("family", "2026-08");
    expect(screen.getByRole("button", { name: "次の月" })).toBeEnabled();

    await click(screen.getByRole("button", { name: "前の月" }));
    await day("12月24日 2枚");
    expect(screen.getByRole("button", { name: "前の月" })).toBeDisabled();

    await click(screen.getByRole("button", { name: "次の月" }));
    await day("8月15日 5枚");
  });

  it("previous and next replace the history entry, and the month goes to the URL", async () => {
    await settled();
    await day("10月3日 5枚");
    pushSpy.mockClear();
    replaceSpy.mockClear();
    await click(screen.getByRole("button", { name: "前の月" }));
    await day("8月15日 5枚");
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.search).toContain("month=2026-08");
  });

  it("the month picker lists every month with its count, and choosing one replaces the entry", async () => {
    await settled();
    await day("10月3日 5枚");
    await click(screen.getByRole("button", { name: "月を選ぶ" }));
    const aug = await screen.findByText(/2026年8月/);
    const item = aug.closest("button,[role=option],[role=menuitem],li") ?? aug;
    expect(item.textContent).toMatch(/5/);
    expect(screen.getByText(/2025年12月/)).toBeInTheDocument();
    pushSpy.mockClear();
    await click(screen.getByText(/2025年12月/));
    await day("12月24日 2枚");
    expect(api.fetchDays).toHaveBeenLastCalledWith("family", "2025-12");
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toContain("month=2025-12");
  });

  it("pressing a day fetches its photos 40 at a time, shows them in FileGrid, and adds a history entry", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-10-03"]));
    expect(api.fetchPhotos).toHaveBeenCalledWith(
      "family",
      expect.objectContaining({ date: "2026-10-03", limit: 40, offset: 0 }),
    );
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain("date=2026-10-03");
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(bodyText()).toMatch(/2026年10月3日\(土\)\s*5枚/);
  });

  it("the en heading reads 'Sat, Oct 3, 2026 · 5 photos'", async () => {
    await settled("?date=2026-10-03", "en");
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    expect(bodyText()).toMatch(/Sat, Oct 3, 2026\s*·\s*5 photos/);
    expect(screen.getByRole("tab", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Map" })).toBeInTheDocument();
  });

  it("a day list loads more on scroll until the total, then stops asking", async () => {
    await settled();
    await click(await day("10月20日 100枚"));
    const all = data.family.photos["2026-10-20"];
    await waitFor(() => expect(renderedIds()).toEqual(all.slice(0, 40)));
    expect(lastGrid().moreMayFollow).toBe(true);
    expect(vi.mocked(coreApi.batchGetFiles).mock.calls[0][0]).toEqual(all.slice(0, 40));

    await loadMore();
    await waitFor(() => expect(renderedIds()).toEqual(all.slice(0, 80)));
    expect(api.fetchPhotos).toHaveBeenCalledWith(
      "family",
      expect.objectContaining({ date: "2026-10-20", limit: 40, offset: 40 }),
    );

    await loadMore();
    await waitFor(() => expect(renderedIds()).toEqual(all));
    await waitFor(() => expect(lastGrid().moreMayFollow).toBe(false));

    const calls = vi.mocked(api.fetchPhotos).mock.calls.length;
    await loadMore();
    expect(vi.mocked(api.fetchPhotos).mock.calls.length).toBe(calls);
  });

  it("pressing the day that is already open does nothing", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    pushSpy.mockClear();
    const fetches = vi.mocked(api.fetchPhotos).mock.calls.length;
    await click(screen.getByRole("button", { name: "10月3日 5枚" }));
    await flush();
    expect(vi.mocked(api.fetchPhotos).mock.calls.length).toBe(fetches);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(renderedIds()).toHaveLength(5);
  });

  it("pressing another day replaces the list and adds an entry each time", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    await click(screen.getByRole("button", { name: "10月11日 27枚" }));
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-10-11"]));
    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(window.location.search).toContain("date=2026-10-11");
  });

  it("the close control closes the list and adds an entry", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    pushSpy.mockClear();
    await click(screen.getByRole("button", { name: "閉じる" }));
    expect(renderedIds()).toEqual([]);
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain("date=");
  });

  it("moving to another month closes the day list", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    await click(screen.getByRole("button", { name: "前の月" }));
    await day("8月15日 5枚");
    expect(renderedIds()).toEqual([]);
  });

  it("a photo trashed between the id list and the file fetch is left out", async () => {
    h.missing.add("d3-1");
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toEqual(["d3-0", "d3-2", "d3-3", "d3-4"]));
  });

  it("FileGrid receives files, moreMayFollow and onRefresh and no selection, drag or sort props", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    expect(h.gridProps.length).toBeGreaterThan(0);
    for (const props of h.gridProps) {
      expect(typeof props.onRefresh).toBe("function");
      expect(Array.isArray(props.files)).toBe(true);
      for (const forbidden of [
        "selectable",
        "selectedIds",
        "onSelect",
        "onMetaSelect",
        "onShiftSelect",
        "sortQuery",
        "draggable",
        "draggedIds",
        "onDragStart",
        "onDragEnd",
      ]) {
        expect(props, forbidden).not.toHaveProperty(forbidden);
      }
    }
  });
});

describe("SPEC-PD-001: undated entry", () => {
  it("shows the undated count, opens the undated list by filename, and adds an entry", async () => {
    await settled();
    const entry = await screen.findByRole("button", { name: /撮影日なし/ });
    expect(entry.textContent).toMatch(/3/);
    pushSpy.mockClear();
    await click(entry);
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1", "u2"]));
    expect(api.fetchPhotos).toHaveBeenCalledWith(
      "family",
      expect.objectContaining({ undated: true, limit: 40, offset: 0 }),
    );
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain("undated=true");
  });

  it("is absent when the count is 0", async () => {
    data.family.undated_count = 0;
    await settled();
    await day("10月3日 5枚");
    expect(screen.queryByText(/撮影日なし/)).toBeNull();
  });

  it("opening the undated list from a day closes the day list and the reverse", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    await click(screen.getByRole("button", { name: /撮影日なし/ }));
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1", "u2"]));
    await click(screen.getByRole("button", { name: "10月3日 5枚" }));
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-10-03"]));
  });
});

describe("SPEC-PD-001: empty drive", () => {
  it("no dated photos: the empty message, and the undated entry when there are undated photos", async () => {
    data.family.months = [];
    await settled();
    expect(await screen.findByText("撮影日のある写真はありません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /撮影日なし/ })).toBeInTheDocument();
  });

  it("no dated photos and no undated photos: the empty message alone", async () => {
    data.family.months = [];
    data.family.undated_count = 0;
    await settled();
    expect(await screen.findByText("撮影日のある写真はありません")).toBeInTheDocument();
    expect(screen.queryByText(/撮影日なし/)).toBeNull();
  });
});

// ---------------------------------------------------------------- page URL

describe("SPEC-PD-001: page URL", () => {
  it("date without month shows the date's month and opens its list", async () => {
    await settled("?date=2026-08-15");
    await day("8月15日 5枚");
    expect(api.fetchDays).toHaveBeenCalledWith("family", "2026-08");
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-08-15"]));
  });

  it("date wins over a different month", async () => {
    await settled("?month=2025-12&date=2026-10-03");
    await day("10月3日 5枚");
    expect(api.fetchDays).toHaveBeenCalledWith("family", "2026-10");
    expect(api.fetchDays).not.toHaveBeenCalledWith("family", "2025-12");
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
  });

  it("date wins over undated", async () => {
    await settled("?date=2026-10-03&undated=true");
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-10-03"]));
    expect(api.fetchPhotos).not.toHaveBeenCalledWith("family", expect.objectContaining({ undated: true }));
  });

  it("a month in the URL is shown", async () => {
    await settled("?month=2026-08");
    await day("8月15日 5枚");
    expect(api.fetchDays).not.toHaveBeenCalledWith("family", "2026-10");
    expect(renderedIds()).toEqual([]);
  });

  it.each(["?month=2026-13", "?month=abc", "?date=2026-02-30", "?view=bogus"])(
    "malformed or unknown %s is treated as absent: the newest month, no list",
    async (search) => {
      await settled(search);
      await day("10月3日 5枚");
      expect(renderedIds()).toEqual([]);
      expect(tab("カレンダー")).toHaveAttribute("aria-selected", "true");
    },
  );

  it("undated=true opens the undated list", async () => {
    await settled("?undated=true");
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1", "u2"]));
  });

  it("undated=true while the undated count is 0 opens no list", async () => {
    data.family.undated_count = 0;
    await settled("?undated=true");
    await day("10月3日 5枚");
    expect(renderedIds()).toEqual([]);
    expect(api.fetchPhotos).not.toHaveBeenCalledWith("family", expect.objectContaining({ undated: true }));
  });

  it("a real month with no photos draws the grid with no buttons; previous and next find the nearest months", async () => {
    await settled("?month=2026-09");
    await flush();
    expect(screen.queryAllByRole("button", { name: /^\d+月\d+日/ })).toEqual([]);
    expect(screen.getByRole("button", { name: "前の月" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "次の月" })).toBeEnabled();
    await click(screen.getByRole("button", { name: "次の月" }));
    await day("10月3日 5枚");
    expect(api.fetchDays).toHaveBeenLastCalledWith("family", "2026-10");
  });

  it("a real date with no photos shows its month and the empty message", async () => {
    await settled("?date=2026-09-15");
    expect(await screen.findByText("この日の写真はありません")).toBeInTheDocument();
    expect(api.fetchDays).toHaveBeenCalledWith("family", "2026-09");
  });

  it("view=map keeps date in the URL for the calendar, and the calendar opens it after the switch", async () => {
    await openMap("?view=map&date=2026-10-03");
    expect(tab("地図")).toHaveAttribute("aria-selected", "true");
    expect(api.fetchPhotos).not.toHaveBeenCalled();
    await click(tab("カレンダー"));
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-10-03"]));
  });

  it("a month or date on a drive with no dated photos shows the message in place of the grid; undated still opens", async () => {
    data.family.months = [];
    await settled("?month=2026-10&undated=true");
    expect(await screen.findByText("撮影日のある写真はありません")).toBeInTheDocument();
    await waitFor(() => expect(renderedIds()).toEqual(["u0", "u1", "u2"]));
    expect(screen.queryByRole("button", { name: "前の月" })).toBeNull();
  });
});

// ---------------------------------------------------------------- failures

describe("SPEC-PD-001 failure cases: not available", () => {
  const sources: [string, () => void, string][] = [
    ["calendar/months", () => vi.mocked(api.fetchMonths).mockRejectedValue(apiError(404)), ""],
    ["calendar/days", () => vi.mocked(api.fetchDays).mockRejectedValue(apiError(404)), ""],
    ["photos", () => vi.mocked(api.fetchPhotos).mockRejectedValue(apiError(404)), "?date=2026-10-03"],
    ["points", () => vi.mocked(api.fetchPoints).mockRejectedValue(apiError(404)), "?view=map"],
    ["map-config", () => vi.mocked(api.fetchMapConfig).mockRejectedValue(apiError(404)), "?view=map"],
  ];

  it.each(sources)("a 404 from %s replaces the whole page, with no retry", async (_name, arrange, search) => {
    arrange();
    await settled(search);
    expect(await screen.findByText("このドライブでは使えません")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
    expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
  });

  it("a 404 met in the map view also takes the calendar away", async () => {
    await settled();
    await day("10月3日 5枚");
    vi.mocked(api.fetchPoints).mockRejectedValue(apiError(404));
    await click(tab("地図"));
    expect(await screen.findByText("このドライブでは使えません")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: /^\d+月\d+日/ })).toBeNull();
  });
});

describe("SPEC-PD-001 failure cases: load errors", () => {
  it("a failed months fetch shows the load error with a retry", async () => {
    vi.mocked(api.fetchMonths).mockRejectedValueOnce(apiError(500));
    await settled();
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "再試行" }));
    await day("10月3日 5枚");
    expect(api.fetchMonths).toHaveBeenCalledTimes(2);
  });

  it("the map is reachable while the calendar's months fetch has failed", async () => {
    vi.mocked(api.fetchMonths).mockRejectedValue(apiError(500));
    await settled();
    await screen.findByText("読み込めませんでした");
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
  });

  it("a failed days fetch shows the load error with a retry", async () => {
    vi.mocked(api.fetchDays).mockRejectedValueOnce(apiError(500));
    await settled();
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "再試行" }));
    await day("10月3日 5枚");
  });

  it("a failed first page of a list shows the load error with a retry", async () => {
    await settled();
    await day("10月3日 5枚");
    vi.mocked(api.fetchPhotos).mockRejectedValueOnce(apiError(500));
    await click(screen.getByRole("button", { name: "10月3日 5枚" }));
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
  });

  it("a failed batch/get shows the load error with a retry", async () => {
    vi.mocked(coreApi.batchGetFiles).mockRejectedValueOnce(new Error("500"));
    await settled();
    await click(await day("10月3日 5枚"));
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
  });

  it("a later page that fails keeps what is loaded and offers a retry for that page", async () => {
    await settled();
    await click(await day("10月20日 100枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    vi.mocked(api.fetchPhotos).mockRejectedValueOnce(apiError(500));
    await loadMore();
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    expect(renderedIds()).toHaveLength(40);
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    expect(api.fetchPhotos).toHaveBeenLastCalledWith(
      "family",
      expect.objectContaining({ date: "2026-10-20", offset: 40 }),
    );
  });

  it("a refetch that fails over a loaded list and grid keeps them, with the error and a retry", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    vi.mocked(api.fetchPhotos).mockRejectedValue(apiError(500));
    vi.mocked(api.fetchDays).mockRejectedValue(apiError(500));
    await click(screen.getAllByText("mock-refresh")[0]);
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(renderedIds()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "10月3日 5枚" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- onRefresh

describe("SPEC-PD-001: onRefresh", () => {
  it("refetches the counts and the open list, and a moved photo disappears", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    data.family.photos["2026-10-03"] = ["d3-0", "d3-2", "d3-3", "d3-4"];
    data.family.days["2026-10"][0] = { date: "2026-10-03", count: 4 };
    await click(screen.getAllByText("mock-refresh")[0]);
    await waitFor(() => expect(renderedIds()).toEqual(["d3-0", "d3-2", "d3-3", "d3-4"]));
    expect(await day("10月3日 4枚")).toBeInTheDocument();
    expect(bodyText()).toMatch(/2026年10月3日\(土\)\s*4枚/);
  });

  it("keeps the loaded depth", async () => {
    await settled();
    await click(await day("10月20日 100枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    const all = data.family.photos["2026-10-20"];
    data.family.photos["2026-10-20"] = all.slice(1);
    await click(screen.getAllByText("mock-refresh")[0]);
    await waitFor(() => expect(renderedIds()).toEqual(all.slice(1, 81)));
  });

  it("a day list that becomes empty shows its empty message and stays open on that day", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    data.family.photos["2026-10-03"] = [];
    data.family.days["2026-10"] = data.family.days["2026-10"].slice(1);
    await click(screen.getAllByText("mock-refresh")[0]);
    expect(await screen.findByText("この日の写真はありません")).toBeInTheDocument();
    expect(renderedIds()).toEqual([]);
    expect(window.location.search).toContain("date=2026-10-03");
  });

  it("the undated list that becomes empty closes, replacing the entry and dropping undated", async () => {
    await settled();
    await click(await screen.findByRole("button", { name: /撮影日なし/ }));
    await waitFor(() => expect(renderedIds()).toHaveLength(3));
    data.family.photos.undated = [];
    data.family.undated_count = 0;
    pushSpy.mockClear();
    replaceSpy.mockClear();
    await click(screen.getAllByText("mock-refresh")[0]);
    await waitFor(() => expect(renderedIds()).toEqual([]));
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.search).not.toContain("undated");
  });
});

// ---------------------------------------------------------------- states

describe("SPEC-PD-001 / I6: overlapping requests and views", () => {
  it("a months response for a month the viewer has left is discarded", async () => {
    await settled();
    await day("10月3日 5枚");
    const slow = deferred<{ days: { date: string; count: number }[] }>();
    vi.mocked(api.fetchDays).mockImplementationOnce(() => slow.promise);
    await click(screen.getByRole("button", { name: "前の月" })); // 2026-08, pending
    await click(screen.getByRole("button", { name: "前の月" })); // 2025-12
    await day("12月24日 2枚");
    await act(async () => slow.resolve({ days: data.family.days["2026-08"] }));
    expect(screen.queryByRole("button", { name: "8月15日 5枚" })).toBeNull();
    expect(screen.getByRole("button", { name: "12月24日 2枚" })).toBeInTheDocument();
  });

  it("a list response for a day the viewer has left is discarded", async () => {
    await settled();
    await day("10月3日 5枚");
    const slow = deferred<{ file_ids: string[]; total: number }>();
    vi.mocked(api.fetchPhotos).mockImplementationOnce(() => slow.promise);
    await click(screen.getByRole("button", { name: "10月3日 5枚" }));
    await click(screen.getByRole("button", { name: "10月11日 27枚" }));
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-10-11"]));
    await act(async () => slow.resolve({ file_ids: data.family.photos["2026-10-03"], total: 5 }));
    await flush();
    expect(renderedIds()).toEqual(data.family.photos["2026-10-11"]);
  });

  it("switching views adds an entry, and a day list left open is not refetched but the counts are", async () => {
    await settled();
    await click(await day("10月3日 5枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    pushSpy.mockClear();
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain("view=map");
    const photoFetches = vi.mocked(api.fetchPhotos).mock.calls.length;
    const dayFetches = vi.mocked(api.fetchDays).mock.calls.length;
    await click(tab("カレンダー"));
    await day("10月3日 5枚");
    expect(renderedIds()).toEqual(data.family.photos["2026-10-03"]);
    expect(vi.mocked(api.fetchPhotos).mock.calls.length).toBe(photoFetches);
    expect(vi.mocked(api.fetchDays).mock.calls.length).toBeGreaterThan(dayFetches);
  });

  it("going back from the map's switch returns to the calendar", async () => {
    await settled();
    await day("10月3日 5枚");
    await click(tab("地図"));
    await waitFor(() => expect(tab("地図")).toHaveAttribute("aria-selected", "true"));
    await goBack();
    await waitFor(() => expect(tab("カレンダー")).toHaveAttribute("aria-selected", "true"));
  });
});

describe("SPEC-PD-001 / I6: saved state and fresh starts", () => {
  it("a URL with no query clears the saved state of the drive and no other", async () => {
    saveState("family", { zoom: 7, center: [1, 2], pointIds: ["a0"], list: { loaded: 40, scrollY: 100 } });
    saveState("work", { zoom: 3 });
    await settled("");
    expect(loadState("family")).toBeNull();
    expect(loadState("work")).toEqual({ zoom: 3 });
  });

  it("a URL with a query keeps the saved state", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    await settled("?date=2026-10-20");
    await waitFor(() => expect(renderedIds().length).toBeGreaterThan(0));
    expect(loadState("family")).not.toBeNull();
  });

  it("a restored calendar list is loaded at least as far as before and scrolled to where it was", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 } });
    await settled("?month=2026-10&date=2026-10-20");
    await waitFor(() => expect(renderedIds().length).toBeGreaterThanOrEqual(80));
    await waitFor(() => expect(h.scroll.calls).toContain(640));
  });

  it("leaving the page leaves the list's loaded depth in session storage", async () => {
    const { unmount } = await settled();
    await click(await day("10月20日 100枚"));
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(80));
    unmount();
    expect(loadState("family")?.list?.loaded).toBeGreaterThanOrEqual(80);
  });

  it("changing drive is a fresh start on the new drive; the old drive's state stays under its own key", async () => {
    saveState("family", { zoom: 5 });
    const page = await settled("?date=2026-10-03");
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    h.drive.current = "work";
    window.history.replaceState(null, "", "/drive/work/addons/photo_diary");
    page.again();
    await flush();
    await day("5月9日 1枚");
    expect(api.fetchMonths).toHaveBeenCalledWith("work");
    expect(renderedIds()).toEqual([]);
    expect(loadState("family")).toEqual({ zoom: 5 });
  });

  it("a response for a drive the viewer has left is discarded", async () => {
    const slow = deferred<{ months: { month: string; count: number }[]; undated_count: number }>();
    vi.mocked(api.fetchMonths).mockImplementationOnce(() => slow.promise);
    const page = renderPage("");
    await flush();
    h.drive.current = "work";
    window.history.replaceState(null, "", "/drive/work/addons/photo_diary");
    page.again();
    await flush();
    await day("5月9日 1枚");
    await act(async () => slow.resolve({ months: data.family.months, undated_count: 3 }));
    await flush();
    expect(screen.queryByRole("button", { name: "10月3日 5枚" })).toBeNull();
    expect(screen.getByRole("button", { name: "5月9日 1枚" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- map

describe("SPEC-PD-002 / I10: map view", () => {
  it("I10: the calendar alone fetches no points and creates no map", async () => {
    await settled();
    await day("10月3日 5枚");
    expect(api.fetchPoints).not.toHaveBeenCalled();
    expect(api.fetchMapConfig).not.toHaveBeenCalled();
    expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
  });

  it("switching to the map fetches map-config and points and creates the map fitted to all points", async () => {
    await settled();
    await day("10月3日 5枚");
    await click(tab("地図"));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalledTimes(1));
    expect(api.fetchMapConfig).toHaveBeenCalledWith("family");
    expect(api.fetchPoints).toHaveBeenCalledWith("family");
    const [container, options] = vi.mocked(mapModule.createPhotoMap).mock.calls[0] as [HTMLElement, any];
    expect(container).toBeInstanceOf(HTMLElement);
    expect(options.points).toEqual(data.family.points);
    expect(options.tileUrl).toBe(MAP_CONFIG.tile_url);
    expect(options.attribution).toBe(MAP_CONFIG.attribution);
    expect(options.center).toBeUndefined();
    expect(options.zoom).toBeUndefined();
  });

  it("I9 / I10: no located photos shows the empty message and creates no map", async () => {
    data.family.points = [];
    await settled("?view=map");
    expect(await screen.findByText("位置情報のある写真はありません")).toBeInTheDocument();
    expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
  });

  it("a point click opens a list of the sections newest date first, each heading with date and count, undated last", async () => {
    await openMap();
    await clickPoint(allIds());
    await waitFor(() => expect(renderedIds().length).toBeGreaterThan(0));
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(50));
    expect(renderedIds()).toEqual([...ids("a", 30), ...ids("b", 15), ...ids("n", 5)]);
    const text = bodyText();
    const a = text.search(/2026年10月3日\(土\)\s*30枚/);
    const b = text.search(/2026年8月1日\(土\)\s*15枚/);
    const n = text.search(/撮影日なし\s*5枚/);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(n).toBeGreaterThan(b);
  });

  it("the list loads 40 files at a time, and a heading appears with its first photo", async () => {
    await openMap();
    await clickPoint(allIds());
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    expect(vi.mocked(coreApi.batchGetFiles).mock.calls[0][0]).toEqual([...ids("a", 30), ...ids("b", 10)]);
    expect(bodyText()).toMatch(/2026年10月3日\(土\)\s*30枚/);
    expect(bodyText()).toMatch(/2026年8月1日\(土\)\s*15枚/);
    expect(bodyText()).not.toMatch(/撮影日なし\s*5枚/);
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(50));
    expect(bodyText()).toMatch(/撮影日なし\s*5枚/);
  });

  it("I7: a point of 250 photos is listed whole, in order, each once, in batches of at most 100", async () => {
    const many = ids("m", 250);
    data.family.points = many.map((id, i) => ({
      file_id: id,
      lat: 1,
      lon: 1,
      taken_at: `2026-10-03T10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
    }));
    await openMap();
    await clickPoint([...many].reverse());
    await waitFor(() => expect(renderedIds().length).toBeGreaterThan(0));
    for (let i = 0; i < 10 && renderedIds().length < 250; i++) await loadMore();
    await waitFor(() => expect(renderedIds()).toEqual(many));
    const fetched = vi.mocked(coreApi.batchGetFiles).mock.calls.flatMap((c) => c[0]);
    expect(fetched).toEqual(many);
    for (const [batch] of vi.mocked(coreApi.batchGetFiles).mock.calls) expect(batch.length).toBeLessThanOrEqual(100);
    expect(vi.mocked(coreApi.batchGetFiles).mock.calls[0][0]).toHaveLength(40);
  });

  it("clicking a point adds no history entry and does not change the URL", async () => {
    await openMap();
    pushSpy.mockClear();
    replaceSpy.mockClear();
    const before = window.location.search;
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a1"]));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe(before);
  });

  it("clicking the point whose list is open does nothing; another point replaces the list", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a1"]));
    const calls = vi.mocked(coreApi.batchGetFiles).mock.calls.length;
    await clickPoint(point([1, 0]));
    await flush();
    expect(vi.mocked(coreApi.batchGetFiles).mock.calls.length).toBe(calls);
    await clickPoint(point([5]));
    await waitFor(() => expect(renderedIds()).toEqual(["a5"]));
  });

  it("the close control closes the point's list and adds no entry", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));
    pushSpy.mockClear();
    await click(screen.getByRole("button", { name: "閉じる" }));
    expect(renderedIds()).toEqual([]);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("a dated heading links to that day in the calendar; the undated heading is not a link", async () => {
    await openMap();
    await clickPoint(allIds());
    await loadMore();
    await waitFor(() => expect(renderedIds()).toHaveLength(50));
    const link = screen.getByRole("link", { name: /2026年10月3日/ });
    expect(link.getAttribute("href")).toContain("date=2026-10-03");
    expect(screen.queryByRole("link", { name: /撮影日なし/ })).toBeNull();
  });

  it("following a heading link adds an entry, shows that day in the calendar, and Back returns to the map with its list open", async () => {
    await openMap();
    await clickPoint(allIds());
    await waitFor(() => expect(renderedIds().length).toBeGreaterThan(0));
    const before = renderedIds();
    pushSpy.mockClear();
    await click(screen.getByRole("link", { name: /2026年10月3日/ }));
    await waitFor(() => expect(tab("カレンダー")).toHaveAttribute("aria-selected", "true"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(api.fetchPhotos).toHaveBeenCalledWith("family", expect.objectContaining({ date: "2026-10-03" })),
    );
    await goBack();
    await waitFor(() => expect(tab("地図")).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => expect(renderedIds()).toEqual(before));
  });

  it("the point's list is saved with its ids, and the view with centre and zoom", async () => {
    await openMap();
    await clickPoint(point([3, 1, 2]));
    await waitFor(() => expect(renderedIds()).toHaveLength(3));
    expect(loadState("family")?.pointIds).toEqual(["a3", "a1", "a2"]);
    await act(async () => h.mapOptions.current!.onViewChange([139.5, 35.5], 9.25));
    expect(loadState("family")?.center).toEqual([139.5, 35.5]);
    expect(loadState("family")?.zoom).toBe(9.25);
  });

  it("a restored map starts where it was and reopens the list, reduced to what /points still holds", async () => {
    saveState("family", { center: [140, 36], zoom: 12.5, pointIds: ["a0", "gone", "a2"] });
    await settled("?view=map");
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    expect(h.mapOptions.current!.center).toEqual([140, 36]);
    expect(h.mapOptions.current!.zoom).toBe(12.5);
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a2"]));
  });

  it("a restored list with nothing left in /points closes", async () => {
    saveState("family", { pointIds: ["gone1", "gone2"] });
    await settled("?view=map");
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled());
    await flush();
    expect(renderedIds()).toEqual([]);
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("a point's list left open is not refetched when the views are switched, but /points is", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));
    await click(tab("カレンダー"));
    await flush();
    const photoCalls = vi.mocked(coreApi.batchGetFiles).mock.calls.length;
    const pointFetches = vi.mocked(api.fetchPoints).mock.calls.length;
    await click(tab("地図"));
    await waitFor(() => expect(vi.mocked(api.fetchPoints).mock.calls.length).toBeGreaterThan(pointFetches));
    expect(vi.mocked(coreApi.batchGetFiles).mock.calls.length).toBe(photoCalls);
    expect(renderedIds()).toEqual(["a0", "a1"]);
  });
});

describe("SPEC-PD-002: map onRefresh", () => {
  it("refetches /points, hands them to the map, and drops a photo that left; it does not re-cluster", async () => {
    await openMap();
    await clickPoint(point([0, 1, 2]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a1", "a2"]));
    const next = [
      ...data.family.points.filter((p) => p.file_id !== "a1"),
      { file_id: "zz", lat: 35, lon: 139, taken_at: "2026-10-03T23:00:00" },
    ];
    data.family.points = next;
    const fetches = vi.mocked(api.fetchPoints).mock.calls.length;
    await click(screen.getAllByText("mock-refresh")[0]);
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a2"]));
    expect(vi.mocked(api.fetchPoints).mock.calls.length).toBeGreaterThan(fetches);
    expect(h.handles[0].setPoints).toHaveBeenCalledWith(next);
    expect(renderedIds()).not.toContain("zz");
    expect(bodyText()).toMatch(/2026年10月3日\(土\)\s*2枚/);
  });

  it("a list that becomes empty closes", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));
    data.family.points = data.family.points.filter((p) => p.file_id !== "a0" && p.file_id !== "a1");
    await click(screen.getAllByText("mock-refresh")[0]);
    await waitFor(() => expect(renderedIds()).toEqual([]));
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("an empty /points with a map drawn removes the map and shows the empty message", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));
    data.family.points = [];
    await click(screen.getAllByText("mock-refresh")[0]);
    expect(await screen.findByText("位置情報のある写真はありません")).toBeInTheDocument();
    expect(h.handles[0].destroy).toHaveBeenCalled();
  });

  it("a refetch that fails keeps the map and the list, with the error and a retry", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));
    vi.mocked(api.fetchPoints).mockRejectedValue(apiError(500));
    await click(screen.getAllByText("mock-refresh")[0]);
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(renderedIds()).toHaveLength(2);
    expect(h.handles[0].destroy).not.toHaveBeenCalled();
  });
});

describe("SPEC-PD-002 failure cases: map", () => {
  it("a library that fails to load shows the load error, and retry tries again", async () => {
    vi.mocked(mapModule.createPhotoMap).mockRejectedValueOnce(new Error("chunk"));
    await settled("?view=map");
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("読み込めませんでした")).toBeNull());
  });

  it("WebGL unavailable shows its message with no retry, the calendar works, and the map is not tried again", async () => {
    vi.mocked(mapModule.createPhotoMap).mockRejectedValue(new mapModule.WebGLUnavailableError("no webgl"));
    await settled("?view=map");
    expect(await screen.findByText("この環境では地図を表示できません")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
    await click(tab("カレンダー"));
    await day("10月3日 5枚");
    await click(tab("地図"));
    expect(await screen.findByText("この環境では地図を表示できません")).toBeInTheDocument();
    expect(mapModule.createPhotoMap).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["map-config", () => vi.mocked(api.fetchMapConfig).mockRejectedValueOnce(apiError(500))],
    ["points", () => vi.mocked(api.fetchPoints).mockRejectedValueOnce(apiError(500))],
  ])("a failed %s fetch fails the map view, with a retry, and the calendar still works", async (_n, arrange) => {
    arrange();
    await settled("?view=map");
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    expect(mapModule.createPhotoMap).not.toHaveBeenCalled();
    await click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalledTimes(1));
  });

  it("the tile notice follows the map's report of failing tiles, and points stay clickable meanwhile", async () => {
    await openMap();
    expect(screen.queryByText("地図を読み込めません")).toBeNull();
    await act(async () => h.mapOptions.current!.onTileFailureChange(true));
    expect(screen.getByText("地図を読み込めません")).toBeInTheDocument();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a1"]));
    expect(screen.getByText("地図を読み込めません")).toBeInTheDocument();
    await act(async () => h.mapOptions.current!.onTileFailureChange(false));
    expect(screen.queryByText("地図を読み込めません")).toBeNull();
  });

  it("I6: switching drive closes a point's list", async () => {
    const page = await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));
    h.drive.current = "work";
    window.history.replaceState(null, "", "/drive/work/addons/photo_diary");
    page.again();
    await flush();
    expect(renderedIds()).toEqual([]);
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });
});

// ---------------------------------------------------------------- loading and refetching

describe("SPEC-PD-002 failure cases: reading a point's members", () => {
  it("a failed read opens the list with the load error and a retry that reads the point again", async () => {
    await openMap();
    const retry = vi.fn();
    await act(async () => h.mapOptions.current!.onPointError(new Error("leaves"), retry));
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(renderedIds()).toEqual([]);
    await click(screen.getByRole("button", { name: "再試行" }));
    expect(retry).toHaveBeenCalledTimes(1);
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a1"]));
    expect(screen.queryByText("読み込めませんでした")).toBeNull();
  });

  it("the error list replaces an open list, and its close control closes it", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toHaveLength(2));
    await act(async () => h.mapOptions.current!.onPointError(new Error("leaves"), vi.fn()));
    expect(renderedIds()).toEqual([]);
    await click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("読み込めませんでした")).toBeNull();
  });
});

describe("loading and refetching states of what a decision uses", () => {
  it("with no drive yet the header draws and nothing is fetched", async () => {
    h.drive.current = null;
    const page = renderPage("");
    await flush();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(api.fetchMonths).not.toHaveBeenCalled();
    h.drive.current = "family";
    page.again();
    await flush();
    await day("10月3日 5枚");
    expect(api.fetchMonths).toHaveBeenCalledWith("family");
  });

  it("while the months are loading, a date in the URL opens no list and asks for no days", async () => {
    const slow = deferred<{ months: { month: string; count: number }[]; undated_count: number }>();
    vi.mocked(api.fetchMonths).mockImplementationOnce(() => slow.promise);
    await settled("?date=2026-10-03");
    expect(api.fetchDays).not.toHaveBeenCalled();
    expect(api.fetchPhotos).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "前の月" })).toBeNull();
    expect(renderedIds()).toEqual([]);
    await act(async () => slow.resolve({ months: data.family.months, undated_count: 3 }));
    await waitFor(() => expect(renderedIds()).toEqual(data.family.photos["2026-10-03"]));
  });

  it("while a month's days are loading the grid has no day buttons, and the open day's list still loads", async () => {
    const slow = deferred<{ days: { date: string; count: number }[] }>();
    vi.mocked(api.fetchDays).mockImplementationOnce(() => slow.promise);
    await settled("?date=2026-10-03");
    await waitFor(() => expect(renderedIds()).toHaveLength(5));
    expect(screen.queryAllByRole("button", { name: /^\d+月\d+日/ })).toEqual([]);
    await act(async () => slow.resolve({ days: data.family.days["2026-10"] }));
    expect(await day("10月3日 5枚")).toHaveAttribute("aria-pressed", "true");
  });

  it("while a list's first page is loading its heading names the date and no count", async () => {
    const slow = deferred<{ file_ids: string[]; total: number }>();
    await settled();
    await day("10月3日 5枚");
    vi.mocked(api.fetchPhotos).mockImplementationOnce(() => slow.promise);
    await click(screen.getByRole("button", { name: "10月3日 5枚" }));
    expect(screen.getByText(/2026年10月3日\(土\)/).textContent).toBe("2026年10月3日(土)");
    expect(screen.queryByText("この日の写真はありません")).toBeNull();
    await act(async () => slow.resolve({ file_ids: data.family.photos["2026-10-03"], total: 5 }));
    await waitFor(() => expect(bodyText()).toMatch(/2026年10月3日\(土\)\s*5枚/));
  });

  it("while the months are refetched, the undated entry and its open list stay", async () => {
    await settled();
    await click(await screen.findByRole("button", { name: /撮影日なし/ }));
    await waitFor(() => expect(renderedIds()).toHaveLength(3));
    const slow = deferred<{ months: { month: string; count: number }[]; undated_count: number }>();
    vi.mocked(api.fetchMonths).mockImplementationOnce(() => slow.promise);
    await click(screen.getAllByText("mock-refresh")[0]);
    await flush();
    expect(renderedIds()).toEqual(["u0", "u1", "u2"]);
    expect(screen.getByRole("button", { name: /撮影日なし/ })).toBeInTheDocument();
    await act(async () => slow.resolve({ months: data.family.months, undated_count: 3 }));
    expect(renderedIds()).toEqual(["u0", "u1", "u2"]);
  });

  it("while /points is refetched on re-entry the map and its open list stay, and the answer then reduces the list", async () => {
    await openMap();
    await clickPoint(point([0, 1]));
    await waitFor(() => expect(renderedIds()).toEqual(["a0", "a1"]));
    await click(tab("カレンダー"));
    const slow = deferred<{ points: Point[] }>();
    vi.mocked(api.fetchPoints).mockImplementationOnce(() => slow.promise);
    await click(tab("地図"));
    await flush();
    expect(renderedIds()).toEqual(["a0", "a1"]);
    expect(h.handles[0].destroy).not.toHaveBeenCalled();
    expect(mapModule.createPhotoMap).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve({ points: data.family.points.filter((p) => p.file_id !== "a1") }));
    await waitFor(() => expect(renderedIds()).toEqual(["a0"]));
  });

  it("a list position saved from the map is not applied to a calendar list", async () => {
    saveState("family", { list: { loaded: 80, scrollY: 640 }, listView: "map" });
    await settled("?month=2026-10&date=2026-10-20");
    await waitFor(() => expect(renderedIds()).toHaveLength(40));
    await flush();
    expect(renderedIds()).toHaveLength(40);
    expect(h.scroll.calls).not.toContain(640);
  });
});
