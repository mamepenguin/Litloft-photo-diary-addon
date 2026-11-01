import { describe, expect, it } from "vitest";
import { parsePageUrl } from "./pageUrl";

const EMPTY = { view: "calendar", month: null, date: null, undated: false };

describe("parsePageUrl", () => {
  // SPEC-PD-001, Page URL table.
  it("SPEC-PD-001: no query is the calendar with nothing chosen", () => {
    expect(parsePageUrl("")).toEqual(EMPTY);
    expect(parsePageUrl("?")).toEqual(EMPTY);
  });

  it("SPEC-PD-002: view=map is the map", () => {
    expect(parsePageUrl("?view=map")).toEqual({ ...EMPTY, view: "map" });
  });

  it.each(["", "bogus", "MAP", "calendar2", "list"])(
    "SPEC-PD-001: unknown view %j is the calendar",
    (view) => {
      expect(parsePageUrl(`?view=${view}`).view).toBe("calendar");
    },
  );

  it("SPEC-PD-001: view=calendar is the calendar", () => {
    expect(parsePageUrl("?view=calendar")).toEqual(EMPTY);
  });

  it("SPEC-PD-001: a real month is kept", () => {
    expect(parsePageUrl("?month=2026-10")).toEqual({ ...EMPTY, month: "2026-10" });
    expect(parsePageUrl("?month=2026-01").month).toBe("2026-01");
    expect(parsePageUrl("?month=2026-12").month).toBe("2026-12");
  });

  it.each(["2026-13", "2026-00", "2026-1", "202610", "2026-10-03", "abcd-ef", "", "2026-1a", " 2026-10"])(
    "SPEC-PD-001: malformed or non-real month %j is treated as absent",
    (month) => {
      expect(parsePageUrl(`?month=${encodeURIComponent(month)}`).month).toBeNull();
    },
  );

  it("SPEC-PD-001: a real date is kept, with its month", () => {
    expect(parsePageUrl("?date=2026-10-03")).toEqual({ ...EMPTY, date: "2026-10-03", month: "2026-10" });
  });

  it.each(["2024-02-29", "2000-02-29", "2026-12-31", "2026-01-01", "2099-07-04"])(
    "SPEC-PD-001: %s is a real date",
    (date) => {
      expect(parsePageUrl(`?date=${date}`).date).toBe(date);
    },
  );

  it.each([
    "2026-02-30",
    "2026-02-29",
    "2100-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "2026-10-32",
    "2026-04-31",
    "20261003",
    "2026-10-3",
    "0000-00-00",
    "abcd-ef-gh",
    "",
  ])("SPEC-PD-001: malformed or non-real date %j is treated as absent", (date) => {
    expect(parsePageUrl(`?date=${encodeURIComponent(date)}`).date).toBeNull();
  });

  it("SPEC-PD-001: date wins when the month differs, and its month is shown", () => {
    expect(parsePageUrl("?month=2026-08&date=2026-10-03")).toEqual({
      ...EMPTY,
      month: "2026-10",
      date: "2026-10-03",
    });
  });

  it("SPEC-PD-001: a date in the same month as month changes nothing", () => {
    expect(parsePageUrl("?month=2026-10&date=2026-10-03")).toEqual({
      ...EMPTY,
      month: "2026-10",
      date: "2026-10-03",
    });
  });

  it("SPEC-PD-001: a malformed date leaves a real month in place", () => {
    expect(parsePageUrl("?month=2026-08&date=2026-02-30")).toEqual({ ...EMPTY, month: "2026-08" });
  });

  it("SPEC-PD-001: a malformed month leaves a real date and its own month", () => {
    expect(parsePageUrl("?month=2026-13&date=2026-10-03")).toEqual({
      ...EMPTY,
      month: "2026-10",
      date: "2026-10-03",
    });
  });

  it("SPEC-PD-001: undated=true opens the undated list", () => {
    expect(parsePageUrl("?undated=true")).toEqual({ ...EMPTY, undated: true });
  });

  it("SPEC-PD-001: date wins over undated", () => {
    expect(parsePageUrl("?date=2026-10-03&undated=true")).toEqual({
      ...EMPTY,
      month: "2026-10",
      date: "2026-10-03",
      undated: false,
    });
  });

  it("SPEC-PD-001: undated with a month keeps the month", () => {
    expect(parsePageUrl("?month=2026-08&undated=true")).toEqual({
      ...EMPTY,
      month: "2026-08",
      undated: true,
    });
  });

  it("SPEC-PD-002: view=map keeps month, date and undated for the calendar", () => {
    expect(parsePageUrl("?view=map&month=2026-08")).toEqual({ ...EMPTY, view: "map", month: "2026-08" });
    expect(parsePageUrl("?view=map&date=2026-10-03")).toEqual({
      ...EMPTY,
      view: "map",
      month: "2026-10",
      date: "2026-10-03",
    });
    expect(parsePageUrl("?view=map&undated=true")).toEqual({ ...EMPTY, view: "map", undated: true });
  });

  it("SPEC-PD-001: unrelated parameters are ignored", () => {
    expect(parsePageUrl("?foo=bar&month=2026-10")).toEqual({ ...EMPTY, month: "2026-10" });
  });
});
