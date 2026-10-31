import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearState, loadState, saveState } from "./savedState";

const FULL = {
  center: [139.7671, 35.6812] as [number, number],
  zoom: 11.5,
  pointIds: ["a1", "b2", "c3"],
  list: { loaded: 80, scrollY: 640 },
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function keys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
}

describe("savedState", () => {
  it("SPEC-PD-001 I6: nothing saved loads as null", () => {
    expect(loadState("family")).toBeNull();
  });

  it("SPEC-PD-001 I6: a saved state loads back whole", () => {
    saveState("family", FULL);
    expect(loadState("family")).toEqual(FULL);
  });

  it("SPEC-PD-001 I6: a partial state loads back as it was saved", () => {
    saveState("family", { list: { loaded: 0, scrollY: 0 } });
    expect(loadState("family")).toEqual({ list: { loaded: 0, scrollY: 0 } });
    saveState("work", { pointIds: [] });
    expect(loadState("work")).toEqual({ pointIds: [] });
  });

  it("SPEC-PD-001: saving again replaces the earlier state", () => {
    saveState("family", FULL);
    saveState("family", { zoom: 3 });
    expect(loadState("family")).toEqual({ zoom: 3 });
  });

  it("SPEC-PD-001 I6: state saved on one drive is never loaded on another", () => {
    saveState("family", FULL);
    expect(loadState("work")).toBeNull();
    expect(loadState("fam")).toBeNull();
    expect(loadState("family2")).toBeNull();
    expect(loadState("family")).toEqual(FULL);
  });

  it("SPEC-PD-001 I6: drives with non-ASCII or slash-bearing names keep separate keys", () => {
    saveState("家族", { zoom: 1 });
    saveState("a/b", { zoom: 2 });
    saveState("a", { zoom: 3 });
    expect(loadState("家族")).toEqual({ zoom: 1 });
    expect(loadState("a/b")).toEqual({ zoom: 2 });
    expect(loadState("a")).toEqual({ zoom: 3 });
  });

  it("SPEC-PD-001: lives in session storage under a key that includes the drive", () => {
    saveState("family", FULL);
    expect(keys(localStorage)).toEqual([]);
    const stored = keys(sessionStorage);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toContain("family");
  });

  it("SPEC-PD-001: clearState removes that drive's state and no other", () => {
    saveState("family", FULL);
    saveState("work", { zoom: 4 });
    clearState("family");
    expect(loadState("family")).toBeNull();
    expect(loadState("work")).toEqual({ zoom: 4 });
  });

  it("SPEC-PD-001: clearState on a drive with nothing saved changes nothing", () => {
    saveState("work", { zoom: 4 });
    clearState("family");
    expect(loadState("work")).toEqual({ zoom: 4 });
  });

  it("SPEC-PD-001: a failing save does not throw, and Back finds nothing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => saveState("family", FULL)).not.toThrow();
    expect(loadState("family")).toBeNull();
  });

  it("SPEC-PD-001: an unreadable stored value loads as null", () => {
    saveState("family", FULL);
    const [key] = keys(sessionStorage);
    sessionStorage.setItem(key, "{not json");
    expect(loadState("family")).toBeNull();
  });
});
