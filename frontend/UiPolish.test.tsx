/**
 * Acceptance tests written from docs/specs/ui-polish.md: SPEC-PD-008 (steps,
 * hover preview), SPEC-PD-012 (close control). Same mocks as
 * PhotoDiaryPage.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreJa from "@/messages-core/ja.json";
import ja from "./messages/ja.json";
import Page from "./Page";
import * as api from "./api";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function renderCalendar() {
  window.history.replaceState(null, "", "/drive/family/addons/photo_diary?month=2026-10");
  render(
    <NextIntlClientProvider locale="ja" messages={{ ...coreJa, ...ja }}>
      <Page />
    </NextIntlClientProvider>,
  );
  await flush();
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

// ---------------------------------------------------------------- steps

describe("SPEC-PD-008 I1: a day's surface step is decided by its count", () => {
  const cases: [number, string, string][] = [
    [1, "bg-accent/10", "hover:bg-accent/15"],
    [2, "bg-accent/10", "hover:bg-accent/15"],
    [3, "bg-accent/20", "hover:bg-accent/30"],
    [4, "bg-accent/20", "hover:bg-accent/30"], // 9
    [5, "bg-accent/40", "hover:bg-accent/50"], // 10
    [6, "bg-accent/40", "hover:bg-accent/50"], // 29
    [7, "bg-accent/60", "hover:bg-accent/70"], // 30
    [8, "bg-accent/60", "hover:bg-accent/70"], // 31
  ];
  it.each(cases)("day %i carries %s and %s", async (d, surface, hover) => {
    await renderCalendar();
    const cls = dayButton(d).className.split(/\s+/);
    expect(cls).toContain(surface);
    expect(cls).toContain(hover);
    expect(cls.filter((c) => /^bg-accent\/\d+$/.test(c))).toEqual([surface]);
    expect(cls).not.toContain("bg-sand");
  });

  it("a day with count 0 has no accent surface", async () => {
    await renderCalendar();
    expect(dayButton(1).className.split(/\s+/)).toContain("bg-accent/10");
    const cls = dayButton(9).className.split(/\s+/);
    expect(cls.some((c) => /^(hover:)?bg-accent\//.test(c))).toBe(false);
  });

  it("the count is muted at step 1 and primary from step 2", async () => {
    await renderCalendar();
    const countOf = (d: number) => within(dayButton(d), String(COUNTS[d]));
    expect(countOf(2).className).toContain("text-text-muted");
    expect(countOf(3).className).toContain("text-text-primary");
    expect(countOf(7).className).toContain("text-text-primary");
  });
});

function within(button: HTMLElement, text: string): HTMLElement {
  // The last match: on a day whose number equals its count, the count comes second.
  const el = Array.from(button.querySelectorAll("*")).findLast((e) => e.children.length === 0 && e.textContent === text);
  if (!el) throw new Error(`no element with text ${text} in ${button.outerHTML}`);
  return el as HTMLElement;
}

// ---------------------------------------------------------------- hover preview

describe("SPEC-PD-008: hover preview", () => {
  it("reads the day photo only after resting 120 ms, once, and loads its thumbnail", async () => {
    await renderCalendar();
    vi.useFakeTimers();
    const btn = dayButton(4);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
    expect(dayPhotoReads()).toHaveLength(0);
    await act(async () => void (await vi.advanceTimersByTimeAsync(30)));
    expect(dayPhotoReads()).toHaveLength(1);
    expect(dayPhotoReads()[0][1]).toMatchObject({ date: "2026-10-04", limit: 1 });
    const img = thumbs()[0];
    expect(img.getAttribute("src")).toContain("/api/files/p04-0/thumbnail");
    await act(async () => void fireEvent.load(img));
    expect(thumbs()).toHaveLength(1);

    // Held while the answer is held: a second visit does not read again.
    await leave(btn);
    expect(thumbs()).toHaveLength(0);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(dayPhotoReads()).toHaveLength(1);
  });

  it("leaving before 120 ms reads nothing", async () => {
    await renderCalendar();
    vi.useFakeTimers();
    const btn = dayButton(4);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(60)));
    await leave(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(300)));
    expect(dayPhotoReads()).toHaveLength(0);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(130)));
    expect(dayPhotoReads()).toHaveLength(1);
  });

  it("I2: a day with count 0 reads nothing", async () => {
    await renderCalendar();
    vi.useFakeTimers();
    await enter(dayButton(9));
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(dayPhotoReads()).toHaveLength(0);
    await enter(dayButton(4));
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(dayPhotoReads()).toHaveLength(1);
  });

  it("I2: a device that cannot hover makes no preview read", async () => {
    setHover(false);
    await renderCalendar();
    vi.useFakeTimers();
    await enter(dayButton(4));
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(dayPhotoReads()).toHaveLength(0);
    expect(thumbs()).toHaveLength(0);

    cleanup();
    vi.useRealTimers();
    setHover(true);
    await renderCalendar();
    vi.useFakeTimers();
    await enter(dayButton(4));
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(dayPhotoReads()).toHaveLength(1);
  });

  it("I2: an answer for a day the pointer has left draws nothing", async () => {
    let release!: (v: any) => void;
    await renderCalendar();
    vi.mocked(api.fetchPhotos).mockImplementation(
      (() => new Promise((res) => (release = res))) as any,
    );
    vi.useFakeTimers();
    const btn = dayButton(4);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(150)));
    await leave(btn);
    await act(async () => {
      release({ file_ids: ["late"], total: 9 });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(thumbs()).toHaveLength(0);
  });

  it("failure: a failed day photo read shows no preview, and hovering later reads again", async () => {
    await renderCalendar();
    vi.mocked(api.fetchPhotos).mockRejectedValueOnce(new Error("boom"));
    vi.useFakeTimers();
    const btn = dayButton(4);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(thumbs()).toHaveLength(0);
    await leave(btn);
    vi.mocked(api.fetchPhotos).mockImplementation((async () => ({ file_ids: ["again"], total: 9 })) as any);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(thumbs()[0]?.getAttribute("src")).toContain("/api/files/again/thumbnail");
  });

  it("failure: a preview thumbnail that fails to load is dropped and the day photo is read again later", async () => {
    await renderCalendar();
    vi.useFakeTimers();
    const btn = dayButton(4);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    await act(async () => void fireEvent.error(thumbs()[0]));
    expect(thumbs()).toHaveLength(0);
    await leave(btn);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(dayPhotoReads()).toHaveLength(2);
  });

  it("the preview is decorative and lets pointer events through", async () => {
    await renderCalendar();
    vi.useFakeTimers();
    await enter(dayButton(4));
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    const img = thumbs()[0];
    await act(async () => void fireEvent.load(img));
    expect(img.getAttribute("alt") ?? "").toBe("");
    expect(img.closest("[class*='pointer-events-none']") ?? img.closest("[style*='pointer-events: none']")).not.toBeNull();
    expect(img.closest("[class*='z-30']")).not.toBeNull();
  });

  it("pressing a day ends its preview", async () => {
    await renderCalendar();
    vi.useFakeTimers();
    const btn = dayButton(4);
    await enter(btn);
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(thumbs()).toHaveLength(1);
    await act(async () => void fireEvent.click(btn));
    expect(thumbs().filter((i) => document.body.contains(i) && i.closest("[class*='z-30']"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- close control

describe("SPEC-PD-012: every close control of a list is an icon-only x in the muted colour", () => {
  it("is named 閉じる, shows no word, and is muted", async () => {
    await renderCalendar();
    await act(async () => void fireEvent.click(dayButton(4)));
    await flush();
    const close = screen.getByRole("button", { name: "閉じる" });
    expect((close.textContent ?? "").trim()).toBe("");
    expect(close.querySelector("svg")).not.toBeNull();
    expect(close.className).toContain("text-text-muted");
  });
});
