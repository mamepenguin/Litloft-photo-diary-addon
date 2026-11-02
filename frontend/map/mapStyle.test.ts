import { describe, expect, it } from "vitest";
import { baseLayers, glyphUrl, paintFor, PALETTES, TILE_MAX_ZOOM } from "./mapStyle";

// SPEC-PD-010: the layer table and the palettes, as the spec states them.
const ids = (theme: "light" | "dark") => baseLayers(theme).map((l) => l.id);

describe("SPEC-PD-010: the base map's layers", () => {
  it("are these, bottom to top, and nothing else", () => {
    expect(ids("light")).toEqual([
      "background",
      "woods",
      "ocean",
      "water",
      "rivers",
      "minor-streets",
      "main-streets",
      "motorways",
      "rail",
      "names",
    ]);
    expect(ids("dark")).toEqual(ids("light"));
  });

  it("draw only the source layers the spec lists: no buildings, street names, boundaries or points of interest", () => {
    const used = new Set(baseLayers("light").map((l) => (l as { "source-layer"?: string })["source-layer"]).filter(Boolean));
    expect([...used].sort()).toEqual(["land", "ocean", "place_labels", "streets", "water_lines", "water_polygons"]);
  });

  it("take the kinds the spec lists", () => {
    const layer = (id: string) => baseLayers("light").find((l) => l.id === id) as Record<string, any>;
    const kinds = (id: string) => (layer(id).filter as any[])[2][1] as string[];
    expect(kinds("woods")).toEqual(["forest", "wood", "park", "grass", "meadow", "village_green", "golf_course", "scrub", "recreation_ground"]);
    expect(kinds("minor-streets")).toEqual(["tertiary", "unclassified", "residential", "living_street"]);
    expect(kinds("main-streets")).toEqual(["primary", "secondary"]);
    expect(kinds("motorways")).toEqual(["motorway", "trunk"]);
    expect(kinds("names")).toEqual(["capital", "state_capital", "city", "town", "village", "suburb"]);
    expect(layer("rivers").filter).toEqual(["==", ["get", "kind"], "river"]);
    expect(layer("rail").filter).toEqual(["==", ["get", "kind"], "rail"]);
  });

  it("have the widths at zoom 9, 13 and 16 that the spec gives, and minor streets from zoom 13", () => {
    const layer = (id: string) => baseLayers("light").find((l) => l.id === id) as Record<string, any>;
    expect(layer("rivers").paint["line-width"]).toBe(1.2);
    expect(layer("minor-streets").minzoom).toBe(13);
    expect(layer("minor-streets").paint["line-width"]).toEqual(["interpolate", ["linear"], ["zoom"], 13, 0.5, 16, 3]);
    expect(layer("main-streets").paint["line-width"]).toEqual(["interpolate", ["linear"], ["zoom"], 9, 0.5, 13, 1.4, 16, 4]);
    expect(layer("motorways").paint["line-width"]).toEqual(["interpolate", ["linear"], ["zoom"], 9, 0.8, 13, 2.2, 16, 6]);
    expect(layer("rail").paint["line-width"]).toBe(1);
    expect(layer("rail").paint["line-dasharray"]).toEqual([3, 2]);
  });

  it("draw names in Noto Sans at 14, 13 and 12 with a 1.4 halo", () => {
    const names = baseLayers("light").find((l) => l.id === "names") as Record<string, any>;
    expect(names.layout["text-font"]).toEqual(["NotoSansRegular"]);
    expect(names.layout["text-field"]).toEqual(["get", "name"]);
    expect(names.layout["text-size"][2]).toBe(14);
    expect(names.layout["text-size"][4]).toBe(13);
    expect(names.layout["text-size"][5]).toBe(12);
    expect(names.paint["text-halo-width"]).toBe(1.4);
  });

  it("carry the palettes' colours", () => {
    expect(PALETTES.light).toEqual({
      land: "#f6f6f3",
      woods: "#ecefe6",
      water: "#d5e2e8",
      minorRoad: "#ffffff",
      majorRoad: "#dcdbd4",
      rail: "#d8d7d0",
      label: "#62625b",
      halo: "#f6f6f3",
    });
    expect(PALETTES.dark).toEqual({
      land: "#231216",
      woods: "#261a18",
      water: "#160b0e",
      minorRoad: "#3a2226",
      majorRoad: "#5c3a3f",
      rail: "#3d2428",
      label: "#c4a0a4",
      halo: "#231216",
    });
    const paint = (theme: "light" | "dark", id: string, property: string) =>
      paintFor(theme).find(([layer, p]) => layer === id && p === property)![2];
    expect(paint("dark", "background", "background-color")).toBe("#231216");
    expect(paint("light", "main-streets", "line-color")).toBe("#dcdbd4");
    expect(paint("dark", "minor-streets", "line-color")).toBe("#3a2226");
    expect(paint("dark", "names", "text-halo-color")).toBe("#231216");
  });

  it("repaint every colour that a theme sets, and no layer is added or lost by it", () => {
    const touched = (theme: "light" | "dark") => new Set(paintFor(theme).map(([layer, property]) => `${layer}/${property}`));
    expect(touched("dark")).toEqual(touched("light"));
    expect(new Set(paintFor("light").map(([layer]) => layer))).toEqual(new Set(ids("light")));
  });

  it("use a glyph address that is absolute, holds {fontstack} and {range}, and names the bundled version", () => {
    const url = glyphUrl("http://litloft.lan:3000", "/api/addons/photo_diary/assets/");
    expect(url).toBe("http://litloft.lan:3000/api/addons/photo_diary/assets/glyphs-3.0.0-{fontstack}-{range}.pbf");
    expect(TILE_MAX_ZOOM).toBe(14);
  });
});
