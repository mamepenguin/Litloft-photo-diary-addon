import { describe, expect, it } from "vitest";
import { baseLayers, glyphUrl, paintFor, PALETTES, TILE_MAX_ZOOM } from "./mapStyle";

const ids = (theme: "light" | "dark") => baseLayers(theme).map((l) => l.id);

describe("SPEC-PD-013: the base map's layers", () => {
  it("are these, bottom to top, and nothing else", () => {
    expect(ids("light")).toEqual([
      "background",
      "woods",
      "parks",
      "ocean",
      "water",
      "river-areas",
      "rivers",
      "buildings",
      "small-streets",
      "minor-streets",
      "main-streets",
      "motorways",
      "rail",
      "names",
      "stations",
      "countries",
      "states",
      "neighbourhoods",
      "islands",
      "water-names",
      "river-names",
      "park-names",
      "places-to-remember",
    ]);
    expect(ids("dark")).toEqual(ids("light"));
  });

  it("draw only the approved source layers, without street names or addresses", () => {
    const used = new Set(baseLayers("light").map((l) => (l as { "source-layer"?: string })["source-layer"]).filter(Boolean));
    expect([...used].sort()).toEqual(["boundary_labels", "buildings", "land", "ocean", "place_labels", "pois", "public_transport", "streets", "water_lines", "water_lines_labels", "water_polygons", "water_polygons_labels"]);
  });

  it("take the kinds the spec lists", () => {
    const layer = (id: string) => baseLayers("light").find((l) => l.id === id) as Record<string, any>;
    const kinds = (id: string) => (id === "names" ? (layer(id).filter as any[])[1] : layer(id).filter as any[])[2][1] as string[];
    expect(kinds("woods")).toEqual(["forest", "wood"]);
    expect(kinds("minor-streets")).toEqual(["tertiary", "unclassified", "residential", "living_street"]);
    expect(kinds("main-streets")).toEqual(["primary", "secondary"]);
    expect(kinds("motorways")).toEqual(["motorway", "trunk"]);
    expect(kinds("names")).toEqual(["capital", "state_capital", "city", "town", "village"]);
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
    expect(layer("rail").paint["line-dasharray"]).toBeUndefined();
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
      land: "#f7f7f5",
      woods: "#dce8d8",
      water: "#dcecf1",
      minorRoad: "#ffffff",
      majorRoad: "#e3e3e0",
      rail: "#b6b6b2",
      label: "#676d70",
      halo: "#f7f7f5",
      park: "#e5eedf",
      river: "#c5dfe8",
      building: "#ebebe8",
      secondaryLabel: "#989e9f",
      parkLabel: "#7c9881",
      waterLabel: "#7299a7",
      naturalLabel: "#818785",
      poiLabel: "#777d80",
    });
    expect(PALETTES.dark).toEqual({
      land: "#231216",
      woods: "#243023",
      water: "#1c2930",
      minorRoad: "#3a2e31",
      majorRoad: "#514449",
      rail: "#7a7373",
      label: "#cec7c8",
      halo: "#231216",
      park: "#293127",
      river: "#29414b",
      building: "#32282a",
      secondaryLabel: "#9f999b",
      parkLabel: "#9fb39e",
      waterLabel: "#91afbb",
      naturalLabel: "#a9b0a9",
      poiLabel: "#b8b5b7",
    });
    const paint = (theme: "light" | "dark", id: string, property: string) =>
      paintFor(theme).find(([layer, p]) => layer === id && p === property)![2];
    expect(paint("dark", "background", "background-color")).toBe("#231216");
    expect(paint("light", "main-streets", "line-color")).toBe("#e3e3e0");
    expect(paint("dark", "minor-streets", "line-color")).toBe("#3a2e31");
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
