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
  park: string;
  river: string;
  building: string;
  secondaryLabel: string;
  parkLabel: string;
  waterLabel: string;
  naturalLabel: string;
  poiLabel: string;
}

export const PALETTES: Record<Theme, Palette> = {
  light: {
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
  },
  dark: {
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
  },
};

export const TILE_SOURCE = "tiles";

/** The tile server's own top zoom; the map draws beyond it from these tiles. */
export const TILE_MAX_ZOOM = 14;

export const GLYPH_VERSION = "3.0.0";
export const FONT = "NotoSansRegular";

const WOODS = ["forest", "wood"];
const PARKS = ["park", "grass", "meadow", "village_green", "golf_course", "scrub", "recreation_ground"];
const MINOR = ["tertiary", "unclassified", "residential", "living_street"];
const BIG_NAMES = ["capital", "state_capital", "city"];
const NAMES = [...BIG_NAMES, "town", "village"];

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

function labelLayer(
  id: string,
  sourceLayer: string,
  filter: unknown,
  colour: keyof Palette,
  minzoom?: number,
  layout: Record<string, unknown> = {},
): BaseLayer {
  return {
    id,
    type: "symbol",
    sourceLayer,
    minzoom,
    filter: ["all", filter, ["!=", ["coalesce", ["get", "name"], ""], ""]],
    layout: {
      "text-field": ["get", "name"],
      "text-font": [FONT],
      "text-size": 12,
      ...layout,
    },
    paint: (p) => ({ "text-color": p[colour], "text-halo-color": p.halo, "text-halo-width": 1.4 }),
  };
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
  { id: "parks", type: "fill", sourceLayer: "land", filter: kindIn(PARKS), paint: (p) => ({ "fill-color": p.park }) },
  { id: "ocean", type: "fill", sourceLayer: "ocean", paint: (p) => ({ "fill-color": p.water }) },
  {
    id: "water", type: "fill", sourceLayer: "water_polygons",
    filter: ["!=", ["get", "kind"], "river"], paint: (p) => ({ "fill-color": p.water }),
  },
  {
    id: "river-areas", type: "fill", sourceLayer: "water_polygons",
    filter: kindIn(["river"]), paint: (p) => ({ "fill-color": p.river }),
  },
  {
    id: "rivers",
    type: "line",
    sourceLayer: "water_lines",
    filter: ["==", ["get", "kind"], "river"],
    paint: (p) => ({ "line-color": p.river, "line-width": 1.2 }),
  },
  { id: "buildings", type: "fill", sourceLayer: "buildings", minzoom: 14, paint: (p) => ({ "fill-color": p.building }) },
  {
    id: "small-streets", type: "line", sourceLayer: "streets", minzoom: 16,
    filter: kindIn(["service", "pedestrian", "footway", "path"]),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: (p) => ({ "line-color": p.minorRoad, "line-width": widths([16, 0.5], [19, 1]) }),
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
    paint: (p) => ({ "line-color": p.rail, "line-width": 1 }),
  },
  // Earlier symbols win collisions, so cities and stations precede supporting names.
  labelLayer("names", "place_labels", kindIn(NAMES), "label", undefined, {
    "text-size": ["case", kindIn(BIG_NAMES), 14, ["==", ["get", "kind"], "town"], 13, 12],
  }),
  labelLayer("stations", "public_transport", kindIn(["station"]), "label", 13),
  labelLayer("countries", "boundary_labels", ["==", ["get", "admin_level"], 2], "label", 2, { "text-size": 14 }),
  labelLayer("states", "boundary_labels", ["==", ["get", "admin_level"], 4], "label", 5, { "text-size": 13 }),
  labelLayer("neighbourhoods", "place_labels", kindIn(["suburb", "quarter", "neighbourhood"]), "secondaryLabel", 14),
  labelLayer("islands", "place_labels", kindIn(["island"]), "naturalLabel", 10),
  labelLayer("water-names", "water_polygons_labels", true, "waterLabel", 10),
  labelLayer("river-names", "water_lines_labels", kindIn(["river"]), "waterLabel", 12, { "symbol-placement": "line" }),
  labelLayer("park-names", "pois", ["==", ["get", "leisure"], "park"], "parkLabel", 13),
  labelLayer("places-to-remember", "pois", ["in", ["get", "tourism"], ["literal", ["attraction", "zoo", "aquarium", "museum"]]], "poiLabel", 13),
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
