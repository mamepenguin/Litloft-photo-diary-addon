/**
 * The base map: one vector source drawn in a quiet style, in two palettes.
 * The tiles follow the Shortbread schema; nothing outside the layers below is
 * drawn, since street names and buildings are what made the base busy.
 */

export type Theme = "light" | "dark";

export interface Palette {
  land: string;
  woods: string;
  water: string;
  minorRoad: string;
  majorRoad: string;
  rail: string;
  label: string;
  halo: string;
}

export const PALETTES: Record<Theme, Palette> = {
  light: {
    land: "#f6f6f3",
    woods: "#ecefe6",
    water: "#d5e2e8",
    minorRoad: "#ffffff",
    majorRoad: "#dcdbd4",
    rail: "#d8d7d0",
    label: "#62625b",
    halo: "#f6f6f3",
  },
  dark: {
    land: "#231216",
    woods: "#261a18",
    water: "#160b0e",
    minorRoad: "#3a2226",
    majorRoad: "#5c3a3f",
    rail: "#3d2428",
    label: "#c4a0a4",
    halo: "#231216",
  },
};

export const TILE_SOURCE = "tiles";

/** The tile server's own top zoom; the map draws beyond it from these tiles. */
export const TILE_MAX_ZOOM = 14;

export const GLYPH_VERSION = "3.0.0";
export const FONT = "NotoSansRegular";

const WOODS = ["forest", "wood", "park", "grass", "meadow", "village_green", "golf_course", "scrub", "recreation_ground"];
const MINOR = ["tertiary", "unclassified", "residential", "living_street"];
const BIG_NAMES = ["capital", "state_capital", "city"];
const NAMES = [...BIG_NAMES, "town", "village", "suburb"];

const kindIn = (kinds: string[]) => ["in", ["get", "kind"], ["literal", kinds]];
const widths = (...stops: [number, number][]) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()];

type Paint = Record<string, unknown>;

interface BaseLayer {
  id: string;
  type: "background" | "fill" | "line" | "symbol";
  sourceLayer?: string;
  filter?: unknown;
  minzoom?: number;
  layout?: Record<string, unknown>;
  paint: (p: Palette) => Paint;
}

const LAYERS: BaseLayer[] = [
  { id: "background", type: "background", paint: (p) => ({ "background-color": p.land }) },
  {
    id: "woods",
    type: "fill",
    sourceLayer: "land",
    filter: kindIn(WOODS),
    paint: (p) => ({ "fill-color": p.woods }),
  },
  { id: "ocean", type: "fill", sourceLayer: "ocean", paint: (p) => ({ "fill-color": p.water }) },
  { id: "water", type: "fill", sourceLayer: "water_polygons", paint: (p) => ({ "fill-color": p.water }) },
  {
    id: "rivers",
    type: "line",
    sourceLayer: "water_lines",
    filter: ["==", ["get", "kind"], "river"],
    paint: (p) => ({ "line-color": p.water, "line-width": 1.2 }),
  },
  {
    id: "minor-streets",
    type: "line",
    sourceLayer: "streets",
    minzoom: 13,
    filter: kindIn(MINOR),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: (p) => ({ "line-color": p.minorRoad, "line-width": widths([13, 0.5], [16, 3]) }),
  },
  {
    id: "main-streets",
    type: "line",
    sourceLayer: "streets",
    filter: kindIn(["primary", "secondary"]),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: (p) => ({ "line-color": p.majorRoad, "line-width": widths([9, 0.5], [13, 1.4], [16, 4]) }),
  },
  {
    id: "motorways",
    type: "line",
    sourceLayer: "streets",
    filter: kindIn(["motorway", "trunk"]),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: (p) => ({ "line-color": p.majorRoad, "line-width": widths([9, 0.8], [13, 2.2], [16, 6]) }),
  },
  {
    id: "rail",
    type: "line",
    sourceLayer: "streets",
    filter: ["==", ["get", "kind"], "rail"],
    paint: (p) => ({ "line-color": p.rail, "line-width": 1, "line-dasharray": [3, 2] }),
  },
  {
    id: "names",
    type: "symbol",
    sourceLayer: "place_labels",
    filter: kindIn(NAMES),
    layout: {
      "text-field": ["get", "name"],
      "text-font": [FONT],
      "text-size": ["case", kindIn(BIG_NAMES), 14, ["==", ["get", "kind"], "town"], 13, 12],
    },
    paint: (p) => ({ "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.4 }),
  },
];

export function baseLayers(theme: Theme) {
  const palette = PALETTES[theme];
  return LAYERS.map((layer) => ({
    id: layer.id,
    type: layer.type,
    ...(layer.type === "background" ? {} : { source: TILE_SOURCE, "source-layer": layer.sourceLayer }),
    ...(layer.filter ? { filter: layer.filter } : {}),
    ...(layer.minzoom ? { minzoom: layer.minzoom } : {}),
    ...(layer.layout ? { layout: layer.layout } : {}),
    paint: layer.paint(palette),
  }));
}

/** Every paint property of every base layer in `theme`, to be set on a map that exists. */
export function paintFor(theme: Theme): [layerId: string, property: string, value: unknown][] {
  const palette = PALETTES[theme];
  return LAYERS.flatMap((layer) =>
    Object.entries(layer.paint(palette)).map(([property, value]): [string, string, unknown] => [
      layer.id,
      property,
      value,
    ]),
  );
}

export function glyphUrl(origin: string, assetBase: string): string {
  return `${origin}${assetBase}glyphs-${GLYPH_VERSION}-{fontstack}-{range}.pbf`;
}
