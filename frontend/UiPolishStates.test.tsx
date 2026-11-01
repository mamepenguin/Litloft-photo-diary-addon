/**
 * What each input of a decision looks like while it loads, fails or is read
 * again, for SPEC-PD-008 to SPEC-PD-012: the month's days, the preview's
 * answer and image, the note area, and the map's points. Same mocks as
 * UiPolish.test.tsx, with a map handle that records what it is told.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import ja from "./messages/ja.json";
import Page from "./Page";
import * as api from "./api";
import * as mapModule from "./map/createPhotoMap";

const h = vi.hoisted(() => ({ listeners: new Set<() => void>() }));

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
    default: ({ href, children, ...rest }: any) =>
      React.createElement("a", { ...rest, href: typeof href === "string" ? href : "" }, children),
  };
});
vi.mock("@/components/CurrentDriveProvider", () => ({ useCurrentDrive: () => "family" }));
vi.mock("@/components/FileGrid", async () => {
  const React = await import("react");
  return {
    FileGrid: (props: any) =>
      React.createElement(
        "div",
        { "data-testid": "file-grid" },
        ...props.files.map((f: any) => React.createElement("span", { key: f.id }, f.filename)),
      ),
  };
});
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getDrives: vi.fn(async () => []),
  batchGetFiles: vi.fn(async (want: string[]) => want.map((id) => ({ id, filename: `${id}.jpg` }))),
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
    fetchNote: vi.fn(),
  };
});
vi.mock("./map/createPhotoMap", () => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, createPhotoMap: vi.fn() };
});

// ---------------------------------------------------------------- data

// Counts chosen on each side of the step boundaries 1, 3, 10 and 30 (I1).
const COUNTS: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 9, 5: 10, 6: 29, 7: 30, 8: 31, 9: 0,
};
const dateOf = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;

function mockApi() {
  vi.mocked(api.fetchMonths).mockResolvedValue({ months: [{ month: "2026-10", count: 100 }], undated_count: 0 } as any);
  vi.mocked(api.fetchDays).mockResolvedValue({
    days: Object.entries(COUNTS).map(([d, count]) => ({ date: dateOf(Number(d)), count })),
  } as any);
  vi.mocked(api.fetchPhotos).mockImplementation((async (_drive: string, q: any) => {
    const date: string = q.date;
    const n = Math.min(q.limit ?? 40, COUNTS[Number(date.slice(-2))] ?? 0);
    return { file_ids: Array.from({ length: n }, (_, i) => `p${date.slice(-2)}-${i}`), total: COUNTS[Number(date.slice(-2))] ?? 0 };
  }) as any);
  vi.mocked(api.fetchPoints).mockResolvedValue({ points: [] } as any);
  vi.mocked(api.fetchMapConfig).mockResolvedValue({ tile_url: "https://t.test/{z}/{x}/{y}.mvt", attribution: "" } as any);
  vi.mocked(api.fetchNote).mockResolvedValue({ state: "none", file_id: null } as any);
}

function setHover(canHover: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /hover:\s*hover/.test(query) ? canHover : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  sessionStorage.clear();
  for (const f of Object.values(api)) if (typeof f === "function" && "mockReset" in f) (f as any).mockReset();
  mockApi();
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(window, "scrollTo").mockImplementation((() => {}) as any);
  setHover(true);
});
afterEach(() => {
  vi.useRealTimers();
  withoutLayout();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const dayButton = (d: number) => {
  const n = COUNTS[d];
  return screen.getByRole("button", { name: n > 0 ? `10月${d}日 ${n}枚` : `10月${d}日` });
};
const enter = (el: HTMLElement) =>
  act(async () => {
    fireEvent.pointerEnter(el);
    fireEvent.pointerOver(el);
    fireEvent.mouseEnter(el);
    fireEvent.mouseOver(el);
  });
const leave = (el: HTMLElement) =>
  act(async () => {
    fireEvent.pointerLeave(el);
    fireEvent.pointerOut(el);
    fireEvent.mouseLeave(el);
    fireEvent.mouseOut(el);
  });
const dayPhotoReads = () =>
  vi.mocked(api.fetchPhotos).mock.calls.filter(([, q]: any[]) => q?.limit === 1);
const thumbs = () =>
  Array.from(document.body.querySelectorAll("img")).filter((i) => /\/api\/files\/[^/]+\/thumbnail/.test(i.getAttribute("src") ?? ""));


const mapHandles: { setPoints: any; setSelected: any; resume: any; destroy: any }[] = [];
const mapOptions: { current: any } = { current: null };

function mockMap() {
  vi.mocked(mapModule.createPhotoMap).mockImplementation((async (_el: HTMLElement, options: any) => {
    mapOptions.current = options;
    const handle = { setPoints: vi.fn(), setSelected: vi.fn(), resume: vi.fn(), destroy: vi.fn() };
    mapHandles.push(handle);
    return handle;
  }) as any);
  vi.mocked(api.fetchPoints).mockResolvedValue({
    points: [{ file_id: "pt1", lat: 35, lon: 139, taken_at: "2026-10-01T10:00:00" }],
  } as any);
}

beforeEach(() => {
  mapHandles.length = 0;
  mapOptions.current = null;
  mockMap();
});

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

async function renderAt(search: string) {
  window.history.replaceState(null, "", `/drive/family/addons/photo_diary${search}`);
  render(
    <NextIntlClientProvider locale="ja" messages={{ ...coreJa, ...ja }}>
      <Page />
    </NextIntlClientProvider>,
  );
  await flush();
}

/** Layout the way a browser has it: every element has a box, at the origin. */
const layoutSpies: { mockRestore: () => void }[] = [];
function withLayout(rect: Partial<DOMRect> = {}) {
  layoutSpies.push(vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation((() => [{}]) as any));
  const spy = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation((() => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect })) as any);
  layoutSpies.push(spy);
  return spy;
}
const withoutLayout = () => layoutSpies.splice(0).forEach((spy) => spy.mockRestore());

const tab = (name: string) => screen.getByRole("tab", { name });
const strip = () => screen.queryByRole("button", { name: "月を表示" });

// ---------------------------------------------------------------- the fade

describe("SPEC-PD-008 I3: when the surfaces fade", () => {
  let animate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    animate = vi.fn(() => ({ cancel: vi.fn() }));
    (Element.prototype as any).animate = animate;
  });
  afterEach(() => {
    delete (Element.prototype as any).animate;
  });
  const calls = () => animate.mock.calls.map(([keyframes, options]: any[]) => ({ keyframes, ...options }));

  it("runs when the page opened with no query draws its first month, in grid order 14 ms apart for 450 ms", async () => {
    window.history.replaceState(null, "", "/drive/family/addons/photo_diary");
    await renderAt("");
    const run = calls();
    // Days with photos only: 1 to 8 here, 31 has none (count 0 on the 9th).
    expect(run).toHaveLength(8);
    expect(run.map((c) => c.duration)).toEqual(Array(8).fill(450));
    expect(run.map((c) => c.delay)).toEqual([0, 14, 28, 42, 56, 70, 84, 98]);
    expect(run[0].keyframes[0]).toEqual({ backgroundColor: "transparent" });
  });

  it("does not run for a first month opened with a query, such as a return from a photo", async () => {
    await renderAt("?month=2026-10");
    expect(animate).not.toHaveBeenCalled();
  });

  it("runs when another month is drawn, and not when the same month is drawn again by a re-read", async () => {
    vi.mocked(api.fetchMonths).mockResolvedValue({
      months: [{ month: "2026-10", count: 100 }, { month: "2026-09", count: 4 }],
      undated_count: 0,
    } as any);
    vi.mocked(api.fetchDays).mockImplementation((async (_d: string, month: string) => ({
      days: month === "2026-10" ? Object.entries(COUNTS).map(([d, count]) => ({ date: dateOf(Number(d)), count })) : [{ date: "2026-09-15", count: 4 }],
    })) as any);
    await renderAt("?month=2026-10");
    expect(animate).not.toHaveBeenCalled();

    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "前の月" })));
    await flush();
    expect(calls().map((c) => c.delay)).toEqual([14 * 14]);

    // The view leaves and comes back: the days are read again and the month is the same.
    animate.mockClear();
    await act(async () => void fireEvent.click(tab("地図")));
    await flush();
    await act(async () => void fireEvent.click(tab("カレンダー")));
    await flush();
    expect(vi.mocked(api.fetchDays).mock.calls.length).toBeGreaterThan(2);
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not run when a day is pressed", async () => {
    window.history.replaceState(null, "", "/drive/family/addons/photo_diary?month=2026-10");
    await renderAt("?month=2026-10");
    await act(async () => void fireEvent.click(dayButton(4)));
    await flush();
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not run under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: /reduced-motion/.test(query) || /hover:\s*hover/.test(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    await renderAt("");
    expect(animate).not.toHaveBeenCalled();
  });

  it("waits for the days: while they load nothing runs, and the surfaces fade once they are there", async () => {
    const slow = deferred<any>();
    vi.mocked(api.fetchDays).mockReturnValueOnce(slow.promise);
    await renderAt("");
    expect(animate).not.toHaveBeenCalled();
    await act(async () => {
      slow.resolve({ days: Object.entries(COUNTS).map(([d, count]) => ({ date: dateOf(Number(d)), count })) });
    });
    await flush();
    expect(animate).toHaveBeenCalledTimes(8);
  });

  it("does not run for a month whose days failed to load, and draws on the retry's grid", async () => {
    vi.mocked(api.fetchDays).mockRejectedValueOnce(new (api as any).ApiError(500));
    await renderAt("");
    expect(animate).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "再試行" })));
    await flush();
    expect(animate).toHaveBeenCalledTimes(8);
  });
});

// ---------------------------------------------------------------- the preview

describe("SPEC-PD-008: the preview's inputs while they load or are read again", () => {
  const hover = async (button: HTMLElement, ms = 200) => {
    vi.useFakeTimers();
    await enter(button);
    await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  };

  it("shows nothing until the image has loaded, then shows it", async () => {
    await renderAt("?month=2026-10");
    await hover(dayButton(4));
    const img = thumbs()[0];
    const frame = img.parentElement as HTMLElement;
    expect(frame.className).toContain("opacity-0");
    await act(async () => void fireEvent.load(img));
    expect(frame.className).not.toContain("opacity-0");
  });

  it("drops what it holds when the month's days are read again, and keeps the one on screen", async () => {
    await renderAt("?month=2026-10");
    await hover(dayButton(4));
    expect(dayPhotoReads()).toHaveLength(1);
    await act(async () => void fireEvent.load(thumbs()[0]));

    // Another read of the days, as coming back to the calendar makes: the preview on screen stays.
    vi.useRealTimers();
    vi.mocked(api.fetchDays).mockClear();
    await act(async () => void fireEvent.click(tab("地図")));
    expect(thumbs()).toHaveLength(0);
    await act(async () => void fireEvent.click(tab("カレンダー")));
    await flush();
    expect(vi.mocked(api.fetchDays)).toHaveBeenCalled();
    await hover(dayButton(4));
    expect(dayPhotoReads()).toHaveLength(2);
  });

  it("a read that is still out when the calendar is hidden shows nothing when it answers", async () => {
    const slow = deferred<any>();
    await renderAt("?month=2026-10");
    vi.mocked(api.fetchPhotos).mockImplementation((() => slow.promise) as any);
    await hover(dayButton(4), 150);
    vi.useRealTimers();
    await act(async () => void fireEvent.click(tab("地図")));
    await act(async () => {
      slow.resolve({ file_ids: ["late"], total: 9 });
    });
    expect(thumbs()).toHaveLength(0);
  });

  it("changing the month ends it", async () => {
    vi.mocked(api.fetchMonths).mockResolvedValue({
      months: [{ month: "2026-10", count: 100 }, { month: "2026-09", count: 4 }],
      undated_count: 0,
    } as any);
    await renderAt("?month=2026-10");
    await hover(dayButton(4));
    expect(thumbs()).toHaveLength(1);
    vi.useRealTimers();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "前の月" })));
    await flush();
    expect(thumbs()).toHaveLength(0);
  });

  it("is placed 8 px above the day, or below when there is no room, and kept 8 px inside the viewport", async () => {
    await renderAt("?month=2026-10");
    const at = (rect: Partial<DOMRect>) =>
      vi.spyOn(dayButton(4), "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, width: 50, height: 48, left: 0, right: 0, bottom: 0, top: 0, ...rect } as any);
    // Room above: centred, 8 px over the day.
    at({ left: 400, top: 400, width: 50, height: 48 });
    await hover(dayButton(4));
    let frame = thumbs()[0].parentElement as HTMLElement;
    expect([frame.style.left, frame.style.top, frame.style.width, frame.style.height]).toEqual(["337px", "260px", "176px", "132px"]);

    // No room above: below the day.
    vi.useRealTimers();
    await leave(dayButton(4));
    at({ left: 400, top: 60, width: 50, height: 48 });
    await hover(dayButton(4));
    frame = thumbs()[0].parentElement as HTMLElement;
    expect(frame.style.top).toBe("116px");

    // At the left edge: 8 px in.
    vi.useRealTimers();
    await leave(dayButton(4));
    at({ left: 0, top: 400, width: 50, height: 48 });
    await hover(dayButton(4));
    frame = thumbs()[0].parentElement as HTMLElement;
    expect(frame.style.left).toBe("8px");
  });
});

// ---------------------------------------------------------------- the strip

describe("SPEC-PD-009: the strip, and what it waits for", () => {
  it("is shown for an open day once the grid is out of sight, with the week's counts", async () => {
    withLayout();
    await renderAt("?month=2026-10&date=2026-10-04");
    expect(strip()).not.toBeNull();
    const cells = screen.getAllByRole("button", { name: "10月4日 9枚" });
    expect(cells).toHaveLength(2);
    // The week of Sun 4 Oct: 4 to 10 Oct, all in October, so seven buttons in the strip.
    const row = strip()!.parentElement!.nextElementSibling as HTMLElement;
    expect(row.querySelectorAll("button")).toHaveLength(7);
    expect(row.querySelector('button[data-date="2026-10-05"]')!.textContent).toContain("10");
  });

  it("is not shown while the month's days are loading, and appears when they are there", async () => {
    withLayout();
    const slow = deferred<any>();
    vi.mocked(api.fetchDays).mockReturnValue(slow.promise);
    await renderAt("?month=2026-10&date=2026-10-04");
    expect(strip()).toBeNull();
    await act(async () => {
      slow.resolve({ days: Object.entries(COUNTS).map(([d, count]) => ({ date: dateOf(Number(d)), count })) });
    });
    await flush();
    expect(strip()).not.toBeNull();
  });

  it("is not shown when the month's days failed", async () => {
    withLayout();
    vi.mocked(api.fetchDays).mockRejectedValue(new (api as any).ApiError(500));
    await renderAt("?month=2026-10&date=2026-10-04");
    expect(strip()).toBeNull();
  });

  it("is not shown for the undated list, with no open day, or while the view is hidden", async () => {
    withLayout();
    vi.mocked(api.fetchMonths).mockResolvedValue({ months: [{ month: "2026-10", count: 100 }], undated_count: 3 } as any);
    await renderAt("?month=2026-10&undated=true");
    expect(strip()).toBeNull();
    cleanup();

    await renderAt("?month=2026-10");
    expect(strip()).toBeNull();
    cleanup();

    await renderAt("?month=2026-10&date=2026-10-04");
    expect(strip()).not.toBeNull();
    await act(async () => void fireEvent.click(tab("地図")));
    expect(strip()).toBeNull();
  });

  it("is not shown while its marker has not reached the app header", async () => {
    withLayout({ top: 300 });
    await renderAt("?month=2026-10&date=2026-10-04");
    expect(strip()).toBeNull();
  });

  it("gives the day list's heading the strip's height as its sticky offset, and the map's panel none", async () => {
    withLayout();
    await renderAt("?month=2026-10&date=2026-10-04");
    const headingRow = () => screen.getByRole("heading", { name: /2026年10月4日/ }).closest("div[class*='sticky']") as HTMLElement;
    expect(headingRow().style.top).toBe("calc(var(--app-header-h, 0px) + 81px)");
    cleanup();

    withoutLayout();
    await renderAt("?month=2026-10&date=2026-10-04");
    expect(headingRow().style.top).toBe("calc(var(--app-header-h, 0px) + 0px)");
  });

  it("scrolls once, instantly, when a day pressed in it has settled; a press on the open day does nothing", async () => {
    withLayout();
    const scroll = vi.mocked(window.scrollTo);
    await renderAt("?month=2026-10&date=2026-10-04");
    const pushes = window.history.length;
    const row = strip()!.parentElement!.nextElementSibling as HTMLElement;
    await act(async () => void fireEvent.click(row.querySelector('button[data-date="2026-10-04"]')!));
    expect(window.history.length).toBe(pushes);
    expect(scroll).not.toHaveBeenCalled();

    await act(async () => void fireEvent.click(row.querySelector('button[data-date="2026-10-07"]')!));
    await flush();
    expect(window.location.search).toContain("date=2026-10-07");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ top: -81, behavior: "instant" });
  });

  it("waits for the note area to settle before it scrolls", async () => {
    withLayout();
    const note = deferred<any>();
    await renderAt("?month=2026-10&date=2026-10-04");
    vi.mocked(api.fetchNote).mockReturnValue(note.promise);
    const scroll = vi.mocked(window.scrollTo);
    const row = strip()!.parentElement!.nextElementSibling as HTMLElement;
    await act(async () => void fireEvent.click(row.querySelector('button[data-date="2026-10-07"]')!));
    await flush();
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => {
      note.resolve({ state: "none", file_id: null });
    });
    await flush();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("scrolls when the new list has failed as well", async () => {
    withLayout();
    await renderAt("?month=2026-10&date=2026-10-04");
    vi.mocked(api.fetchPhotos).mockRejectedValue(new (api as any).ApiError(500));
    const scroll = vi.mocked(window.scrollTo);
    const row = strip()!.parentElement!.nextElementSibling as HTMLElement;
    await act(async () => void fireEvent.click(row.querySelector('button[data-date="2026-10-07"]')!));
    await flush();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("a day pressed in the grid, not the strip, scrolls nothing", async () => {
    withLayout();
    await renderAt("?month=2026-10&date=2026-10-04");
    const scroll = vi.mocked(window.scrollTo);
    const grid = document.querySelector("[aria-busy]") as HTMLElement;
    await act(async () => void fireEvent.click(grid.querySelector('button[data-date="2026-10-06"]')!));
    await flush();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("the back control scrolls the month bar under the header and focuses the open day in the grid", async () => {
    withLayout();
    const scroll = vi.mocked(window.scrollTo);
    await renderAt("?month=2026-10&date=2026-10-04");
    await act(async () => void fireEvent.click(strip()!));
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    const grid = document.querySelector("[aria-busy]") as HTMLElement;
    expect(document.activeElement).toBe(grid.querySelector('button[data-date="2026-10-04"]'));
  });
});

// ---------------------------------------------------------------- the map's points

describe("SPEC-PD-012: the map's stage, and its inputs while they are read again", () => {
  const stageOf = () => document.querySelector("div[style*='100dvh']") as HTMLElement;

  it("is as tall as the viewport less its own offset, read again on resize", async () => {
    const rect = withLayout({ top: 120 });
    await renderAt("?view=map");
    await waitFor(() => expect(stageOf()).not.toBeNull());
    expect(stageOf().style.height).toBe("calc(100dvh - 120px)");
    rect.mockImplementation((() => ({ top: 180, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 })) as any);
    await act(async () => void window.dispatchEvent(new Event("resize")));
    expect(stageOf().style.height).toBe("calc(100dvh - 180px)");
  });

  it("is not measured while the view is hidden, and is when it comes back", async () => {
    const rect = withLayout({ top: 120 });
    await renderAt("?view=map");
    await waitFor(() => expect(stageOf()).not.toBeNull());
    await act(async () => void fireEvent.click(tab("カレンダー")));
    rect.mockImplementation((() => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 })) as any);
    await act(async () => void window.dispatchEvent(new Event("resize")));
    expect(stageOf().style.height).toBe("calc(100dvh - 120px)");
    rect.mockImplementation((() => ({ top: 90, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 })) as any);
    await act(async () => void fireEvent.click(tab("地図")));
    await flush();
    expect(stageOf().style.height).toBe("calc(100dvh - 90px)");
  });

  it("keeps the stage, its padding and its map while /points is read again, and measures again when the read fails", async () => {
    const rect = withLayout({ top: 100 });
    await renderAt("?view=map");
    await waitFor(() => expect(mapHandles).toHaveLength(1));
    await waitFor(() => expect(stageOf()).not.toBeNull());
    const root = stageOf().closest(".group\\/diary") as HTMLElement;
    expect(root.className).not.toContain("px-4");

    const again = deferred<any>();
    vi.mocked(api.fetchPoints).mockReturnValue(again.promise);
    await act(async () => void fireEvent.click(tab("カレンダー")));
    await act(async () => void fireEvent.click(tab("地図")));
    expect(stageOf()).not.toBeNull();
    expect(root.className).not.toContain("px-4");
    expect(mapHandles).toHaveLength(1);

    // The read fails: a banner comes above the stage, which is measured again at its new place.
    rect.mockImplementation((() => ({ top: 160, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 })) as any);
    await act(async () => {
      again.reject(new (api as any).ApiError(500));
    });
    await flush();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(stageOf().style.height).toBe("calc(100dvh - 160px)");
  });

  it("tells the map it is on screen again when the view comes back", async () => {
    await renderAt("?view=map");
    await waitFor(() => expect(mapHandles).toHaveLength(1));
    const resumed = mapHandles[0].resume.mock.calls.length;
    await act(async () => void fireEvent.click(tab("カレンダー")));
    expect(mapHandles[0].resume.mock.calls.length).toBe(resumed);
    await act(async () => void fireEvent.click(tab("地図")));
    expect(mapHandles[0].resume.mock.calls.length).toBe(resumed + 1);
  });

  it("names a pin through the page's messages, by its count", async () => {
    await renderAt("?view=map");
    await waitFor(() => expect(mapOptions.current).not.toBeNull());
    expect(mapOptions.current.pinLabel(12)).toBe("写真 12枚");
    expect(mapOptions.current.pinLabel(1)).toBe("写真 1枚");
  });

  it("the other phases keep the padding, and the map phase takes it away", async () => {
    vi.mocked(api.fetchPoints).mockResolvedValue({ points: [] } as any);
    await renderAt("?view=map");
    await waitFor(() => expect(screen.getByText("位置情報のある写真はありません")).toBeInTheDocument());
    const root = screen.getByText("位置情報のある写真はありません").closest(".group\\/diary") as HTMLElement;
    expect(root.className).toContain("px-4");
    expect(root.className).toContain("pb-6");
  });

  it("a list that could not be read has the same close control, and closes", async () => {
    await renderAt("?view=map");
    await waitFor(() => expect(mapOptions.current).not.toBeNull());
    await act(async () => void mapOptions.current.onPointError(new Error("x"), () => {}));
    const close = screen.getByRole("button", { name: "閉じる" });
    expect((close.textContent ?? "").trim()).toBe("");
    expect(close.querySelector("svg")).not.toBeNull();
    expect(close.className).toContain("text-text-muted");
    await act(async () => void fireEvent.click(close));
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });
});

// ---------------------------------------------------------------- the tabs

describe("SPEC-PD-012: the view switch's place", () => {
  const widthOf = (px: number) => {
    layoutSpies.push(
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation((() => ({ top: 0, left: 0, right: px, bottom: 0, width: px, height: 0, x: 0, y: 0 })) as any),
    );
  };

  it("is in the header's title row on a wide layout, and in its own row on a narrow one", async () => {
    widthOf(1280);
    await renderAt("?month=2026-10");
    const header = document.querySelector("header") as HTMLElement;
    const titleRow = header.querySelector("h1")!.closest("div.flex.min-w-0") as HTMLElement;
    expect(titleRow.contains(screen.getByRole("tablist"))).toBe(true);
    cleanup();

    withoutLayout();
    widthOf(375);
    await renderAt("?month=2026-10");
    const narrow = document.querySelector("header") as HTMLElement;
    const row = narrow.querySelector("h1")!.closest("div.flex.min-w-0") as HTMLElement;
    expect(row.contains(screen.getByRole("tablist"))).toBe(false);
    expect(narrow.contains(screen.getByRole("tablist"))).toBe(true);
  });
});
