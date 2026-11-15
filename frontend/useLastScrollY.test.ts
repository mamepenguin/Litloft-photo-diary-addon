import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLastScrollY } from "./useLastScrollY";

/** What the window reports from now on; a browser moves it with real scrolls. */
const windowAt = (offset: number) =>
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => offset });

const scroll = () => act(() => void window.dispatchEvent(new Event("scroll")));

afterEach(() => {
  Reflect.deleteProperty(window, "scrollY");
});

describe("useLastScrollY", () => {
  it("starts at the offset the window had when the page mounted", () => {
    windowAt(700);
    const { result } = renderHook(() => useLastScrollY());
    expect(result.current.current).toBe(700);
  });

  it("follows the window while the page is mounted", () => {
    windowAt(0);
    const { result } = renderHook(() => useLastScrollY());
    windowAt(640);
    scroll();
    expect(result.current.current).toBe(640);
    windowAt(1200);
    scroll();
    expect(result.current.current).toBe(1200);
  });

  it("keeps the offset it saw on a scroll, not the window's at teardown", () => {
    windowAt(0);
    const { result, unmount } = renderHook(() => useLastScrollY());
    windowAt(900);
    scroll();
    // The document shrinks and the window clamps before the page is removed.
    windowAt(0);
    unmount();
    expect(result.current.current).toBe(900);
  });
});
