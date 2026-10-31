import { afterEach, describe, expect, it } from "vitest";
import { formatListDate, formatMonth, monthGrid, weekdayLabels } from "./dates";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// Zones on both sides of UTC, including the extremes. A date built through
// `new Date("2026-10-03")` shifts a day in the western ones.
const ZONES = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago"];

describe("monthGrid", () => {
  // SPEC-PD-001 item 2: Sunday first; null pads before day 1.
  const cases: [string, number, number][] = [
    ["2026-10", 4, 31], // Thu 1 Oct 2026
    ["2026-11", 0, 30], // Sun 1 Nov 2026
    ["2026-12", 2, 31], // Tue 1 Dec 2026
    ["2025-03", 6, 31], // Sat 1 Mar 2025
    ["2024-02", 4, 29], // leap February, Thu 1 Feb 2024
    ["2026-02", 0, 28], // non-leap February, Sun 1 Feb 2026
    ["2100-02", 1, 28], // century year that is not a leap year, Mon 1 Feb 2100
    ["2000-02", 2, 29], // century year that is a leap year, Tue 1 Feb 2000
  ];

  it.each(cases)("SPEC-PD-001: %s has %i leading blanks and %i days", (month, blanks, days) => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      const grid = monthGrid(month);
      const head = grid.slice(0, blanks);
      const body = grid.slice(blanks, blanks + days);
      expect(head, zone).toEqual(Array(blanks).fill(null));
      expect(body, zone).toEqual(Array.from({ length: days }, (_, i) => i + 1));
      // Nothing but padding may follow the last day.
      expect(grid.slice(blanks + days).every((cell) => cell === null), zone).toBe(true);
    }
  });
});

describe("formatListDate", () => {
  // SPEC-PD-001 / section 9: no day shift, whatever the zone (I1).
  it("SPEC-PD-001 I1: ja heading carries year, month, day and weekday, in every zone", () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(formatListDate("2026-10-03", "ja"), zone).toBe("2026年10月3日(土)");
    }
  });

  it("SPEC-PD-001 I1: en heading carries weekday, month, day and year, in every zone", () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(formatListDate("2026-10-03", "en"), zone).toBe("Sat, Oct 3, 2026");
    }
  });

  it("SPEC-PD-001 I1: the first and last day of a year do not cross the year boundary", () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(formatListDate("2026-01-01", "en"), zone).toBe("Thu, Jan 1, 2026");
      expect(formatListDate("2026-12-31", "en"), zone).toBe("Thu, Dec 31, 2026");
      expect(formatListDate("2026-01-01", "ja"), zone).toBe("2026年1月1日(木)");
    }
  });

  it("SPEC-PD-001: a leap day is shown as written", () => {
    expect(formatListDate("2024-02-29", "en")).toBe("Thu, Feb 29, 2024");
  });

  it("SPEC-PD-001: a future date a camera wrote is shown as written", () => {
    expect(formatListDate("2099-07-04", "en")).toBe("Sat, Jul 4, 2099");
  });
});

describe("formatMonth", () => {
  // The spec does not fix the exact month format, only the locale and that
  // the month is the one named.
  it("SPEC-PD-001 I1: names the month asked for, in every zone, in ja", () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      const text = formatMonth("2026-10", "ja");
      expect(text, zone).toContain("2026");
      expect(text, zone).toContain("10月");
      expect(formatMonth("2026-01", "ja"), zone).toContain("1月");
      expect(formatMonth("2026-01", "ja"), zone).toContain("2026");
    }
  });

  it("SPEC-PD-001 I1: names the month asked for, in every zone, in en", () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(formatMonth("2026-10", "en"), zone).toMatch(/Oct/);
      expect(formatMonth("2026-10", "en"), zone).not.toMatch(/Sep/);
      expect(formatMonth("2026-10", "en"), zone).toContain("2026");
      expect(formatMonth("2026-01", "en"), zone).toMatch(/Jan/);
      expect(formatMonth("2026-01", "en"), zone).toContain("2026");
    }
  });
});

describe("weekdayLabels", () => {
  // The grid's first cell is a Sunday in every locale, so the header over it is too.
  it.each([
    ["en", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]],
    ["ja", ["日", "月", "火", "水", "木", "金", "土"]],
  ])("SPEC-PD-001: %s starts on Sunday, in any zone", (locale, expected) => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(weekdayLabels(locale)).toEqual(expected);
    }
  });
});
