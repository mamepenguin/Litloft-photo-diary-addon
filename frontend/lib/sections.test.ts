import { describe, expect, it } from "vitest";
import { groupSections } from "./sections";

type Point = { file_id: string; lat: number; lon: number; taken_at: string | null };

function p(file_id: string, taken_at: string | null): Point {
  return { file_id, lat: 35, lon: 139, taken_at };
}

describe("groupSections", () => {
  it("SPEC-PD-002: no points, no sections", () => {
    expect(groupSections([])).toEqual([]);
  });

  it("SPEC-PD-002: one photo is one section of one", () => {
    expect(groupSections([p("a", "2026-10-03T10:00:00")])).toEqual([
      { date: "2026-10-03", count: 1, fileIds: ["a"] },
    ]);
  });

  it("SPEC-PD-002 I8: one section per capture date, newest date first, with its count", () => {
    // /points order: dated photos oldest first.
    const points = [
      p("a", "2026-08-01T09:00:00"),
      p("b", "2026-08-01T09:30:00"),
      p("c", "2026-10-03T08:00:00"),
      p("d", "2026-10-03T08:00:01"),
      p("e", "2026-10-03T20:00:00"),
      p("f", "2026-10-04T00:00:00"),
    ];
    expect(groupSections(points)).toEqual([
      { date: "2026-10-04", count: 1, fileIds: ["f"] },
      { date: "2026-10-03", count: 3, fileIds: ["c", "d", "e"] },
      { date: "2026-08-01", count: 2, fileIds: ["a", "b"] },
    ]);
  });

  it("SPEC-PD-002 I8: inside a section the order is the order /points returned", () => {
    // Deliberately not sorted by time: the section must not re-sort.
    const points = [p("z", "2026-10-03T12:00:00"), p("a", "2026-10-03T12:00:00"), p("m", "2026-10-03T11:00:00")];
    expect(groupSections(points)[0].fileIds).toEqual(["z", "a", "m"]);
  });

  it("SPEC-PD-001 I1: the section is the first ten characters, with no time-zone shift", () => {
    expect(groupSections([p("a", "2026-10-03T23:30:00")])[0].date).toBe("2026-10-03");
    expect(groupSections([p("a", "2026-10-03T00:00:00")])[0].date).toBe("2026-10-03");
  });

  it("SPEC-PD-002 I9: undated located photos form a last section, in the order given", () => {
    const points = [
      p("a", "2026-08-01T09:00:00"),
      p("b", "2026-10-03T09:00:00"),
      p("n1", null),
      p("n2", null),
    ];
    expect(groupSections(points)).toEqual([
      { date: "2026-10-03", count: 1, fileIds: ["b"] },
      { date: "2026-08-01", count: 1, fileIds: ["a"] },
      { date: null, count: 2, fileIds: ["n1", "n2"] },
    ]);
  });

  it("SPEC-PD-002 I9: only undated photos give a single undated section", () => {
    expect(groupSections([p("n1", null)])).toEqual([{ date: null, count: 1, fileIds: ["n1"] }]);
  });

  it("SPEC-PD-002 I7: a point of more than 100 photos keeps every id once", () => {
    const points = Array.from({ length: 250 }, (_, i) => p(`id${i}`, "2026-10-03T10:00:00"));
    const [section, ...rest] = groupSections(points);
    expect(rest).toEqual([]);
    expect(section.count).toBe(250);
    expect(section.fileIds).toEqual(points.map((x) => x.file_id));
  });

  it("SPEC-PD-002: does not modify its input", () => {
    const points = [p("a", "2026-08-01T09:00:00"), p("b", "2026-10-03T09:00:00")];
    const copy = JSON.parse(JSON.stringify(points));
    groupSections(points, ["a"]);
    expect(points).toEqual(copy);
  });

  describe("onlyIds", () => {
    const points = [
      p("a", "2026-08-01T09:00:00"),
      p("b", "2026-08-01T09:30:00"),
      p("c", "2026-10-03T08:00:00"),
      p("n1", null),
    ];

    it("SPEC-PD-002 I7: keeps only the listed ids and recomputes counts", () => {
      expect(groupSections(points, ["a", "c", "n1"])).toEqual([
        { date: "2026-10-03", count: 1, fileIds: ["c"] },
        { date: "2026-08-01", count: 1, fileIds: ["a"] },
        { date: null, count: 1, fileIds: ["n1"] },
      ]);
    });

    it("SPEC-PD-002 I7: a section left with no photo disappears", () => {
      expect(groupSections(points, ["c"])).toEqual([{ date: "2026-10-03", count: 1, fileIds: ["c"] }]);
    });

    it("SPEC-PD-002 I7: an id no longer in the points is gone, and unknown ids add nothing", () => {
      expect(groupSections(points, ["a", "moved-to-another-drive"])).toEqual([
        { date: "2026-08-01", count: 1, fileIds: ["a"] },
      ]);
    });

    it("SPEC-PD-002 I7: an empty list of ids gives no sections", () => {
      expect(groupSections(points, [])).toEqual([]);
    });

    it("SPEC-PD-002: the order follows the points, not the order of onlyIds", () => {
      expect(groupSections(points, ["b", "a"])).toEqual([
        { date: "2026-08-01", count: 2, fileIds: ["a", "b"] },
      ]);
    });

    it("SPEC-PD-002: omitted onlyIds means every point", () => {
      expect(groupSections(points)).toEqual(groupSections(points, ["a", "b", "c", "n1"]));
    });
  });
});
