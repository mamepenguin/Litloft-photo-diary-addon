import type { Point } from "../api";

const ASSET_BASE = "/api/addons/photo_diary/assets/";
const VERSION = "6.16.0";
const LIBRARY_URL = `${ASSET_BASE}maplibre-gl-${VERSION}.js`;
const WORKER_URL = `${ASSET_BASE}maplibre-gl-worker-${VERSION}.js`;
const STYLESHEET_URL = `${ASSET_BASE}maplibre-gl-${VERSION}.css`;
const STYLESHEET_ID = "photo-diary-maplibre-css";

const MAX_ZOOM = 19;
const FIT_MAX_ZOOM = 15;
const CLUSTER_RADIUS = 40;
// Clustering has to run at the map's top zoom, or photos with identical
// coordinates would be separate points there. The source's maxzoom sits above
// clusterMaxZoom so that the top tile level is still a clustered one.
const CLUSTER_MAX_ZOOM = MAX_ZOOM;
const SOURCE_MAX_ZOOM = MAX_ZOOM + 1;

const PLUM = "#211922";
const FALLBACK_ACCENT = "#d63031";

export class WebGLUnavailableError extends Error {
  constructor(message = "WebGL is unavailable") {
    super(message);
    this.name = "WebGLUnavailableError";
  }
}

type LngLat = [number, number];

interface Feature {
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: LngLat };
}

interface GeoJSONSourceLike {
  setData(data: unknown): void;
  getClusterLeaves(clusterId: number, limit: number, offset: number): Promise<Feature[]>;
}

interface MapLike {
  getSource(id: string): GeoJSONSourceLike | undefined;
  addControl(control: unknown, position?: string): void;
  on(type: string, listener: (event: never) => void): void;
  once(type: string, listener: () => void): void;
  off(type: string, listener: (event: never) => void): void;
  project(lngLat: LngLat): { x: number; y: number };
  queryRenderedFeatures(
    geometry: [[number, number], [number, number]] | { x: number; y: number },
    options?: { layers?: string[] },
  ): Feature[];
  querySourceFeatures(source: string, options?: { filter?: unknown[] }): Feature[];
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getCanvas(): HTMLCanvasElement;
  isStyleLoaded(): boolean;
  remove(): void;
}

interface MarkerLike {
  setLngLat(lngLat: LngLat): MarkerLike;
  addTo(map: MapLike): MarkerLike;
  remove(): void;
}

interface MapLibreModule {
  Map: new (options: Record<string, unknown>) => MapLike;
  Marker: new (options: { element: HTMLElement; anchor: string }) => MarkerLike;
  AttributionControl: new (options: { compact: boolean }) => unknown;
  NavigationControl: new (options: { showCompass: boolean }) => unknown;
  setWorkerUrl(url: string): void;
}

export interface PhotoMapOptions {
  points: Point[];
  tileUrl: string;
  attribution: string;
  center?: LngLat;
  zoom?: number;
  onPointClick: (fileIds: string[]) => void;
  /** `retry` reads the same point's members again. */
  onPointError: (error: Error, retry: () => void) => void;
  onTileFailureChange: (failing: boolean) => void;
  onViewChange: (center: LngLat, zoom: number) => void;
}

export interface PhotoMap {
  setPoints(points: Point[]): void;
  destroy(): void;
}

let library: Promise<MapLibreModule> | null = null;
let failures = 0;

// A browser remembers a failed import of a URL for the life of the page and
// answers a second import of it without asking the network. A retry therefore
// asks for another URL, which the server answers with the same file; the first
// attempt keeps the bare URL, which the browser's cache holds once it loads.
const libraryUrl = () => (failures === 0 ? LIBRARY_URL : `${LIBRARY_URL}?retry=${failures}`);

function loadLibrary(): Promise<MapLibreModule> {
  if (!library) {
    // A runtime import of a served file: the frontend image installs only the
    // core's package.json, so the bundlers must leave this specifier alone.
    library = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ libraryUrl())
      .then((module: MapLibreModule) => {
        module.setWorkerUrl(new URL(WORKER_URL, document.baseURI).href);
        return module;
      })
      .catch((error: unknown) => {
        library = null;
        failures += 1;
        throw error instanceof Error ? error : new Error("MapLibre failed to load");
      });
  }
  return library;
}

function ensureStylesheet(): void {
  if (document.getElementById(STYLESHEET_ID)) return;
  const link = document.createElement("link");
  link.id = STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = STYLESHEET_URL;
  document.head.appendChild(link);
}

function toCollection(points: Point[]) {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      properties: { id: p.file_id },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  };
}

function boundsOf(points: Point[]): [LngLat, LngLat] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lon);
    east = Math.max(east, p.lon);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

function countLabel(count: number): HTMLElement {
  const element = document.createElement("div");
  element.textContent = String(count);
  element.style.cssText =
    "pointer-events:none;color:#fff;font:600 12px/1 system-ui,sans-serif;" +
    "font-variant-numeric:tabular-nums;text-shadow:none";
  return element;
}

// A GL paint cannot read a CSS variable, so the token is resolved here.
function accentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return value || FALLBACK_ACCENT;
}

function buildStyle(options: PhotoMapOptions) {
  const accent = accentColor();
  const ring = { "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 };
  return {
    version: 8,
    sources: {
      tiles: {
        type: "raster",
        tiles: [options.tileUrl],
        tileSize: 256,
        maxzoom: MAX_ZOOM,
        attribution: options.attribution,
      },
      points: {
        type: "geojson",
        data: toCollection(options.points),
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        maxzoom: SOURCE_MAX_ZOOM,
      },
      selection: { type: "geojson", data: toCollection([]) },
    },
    layers: [
      { id: "tiles", type: "raster", source: "tiles" },
      {
        id: "clusters",
        type: "circle",
        source: "points",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": PLUM,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 17, 100, 20],
          ...ring,
        },
      },
      {
        id: "singles",
        type: "circle",
        source: "points",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": PLUM, "circle-radius": 8, ...ring },
      },
      {
        id: "selected-cluster",
        type: "circle",
        source: "selection",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": accent,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 17, 100, 20],
          ...ring,
        },
      },
      {
        id: "selected-single",
        type: "circle",
        source: "selection",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": accent, "circle-radius": 8, ...ring },
      },
    ],
  };
}

// Re-selecting what is already selected would redraw the source, which ends
// in another idle and so loops.
const keyOf = (feature: Feature) =>
  JSON.stringify([feature.geometry.coordinates, feature.properties?.cluster_id, feature.properties?.point_count, feature.properties?.id]);

const POINT_LAYERS = ["clusters", "singles"];
const HIT_SLOP = 4;

export async function createPhotoMap(
  container: HTMLElement,
  options: PhotoMapOptions,
): Promise<PhotoMap> {
  const maplibre = await loadLibrary();
  ensureStylesheet();

  const view = options.center
    ? { center: options.center, zoom: options.zoom ?? FIT_MAX_ZOOM }
    : options.points.length > 0
      ? { bounds: boundsOf(options.points), fitBoundsOptions: { padding: 48, maxZoom: FIT_MAX_ZOOM } }
      : { center: [0, 0] as LngLat, zoom: 1 };

  let map: MapLike;
  try {
    map = new maplibre.Map({
      container,
      style: buildStyle(options),
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      ...view,
    });
  } catch (error) {
    // Asking for a context first, on a probe canvas, left the map's own
    // context creation failing intermittently in a software-rendered browser,
    // so the constructor's own refusal is what is read.
    if (error instanceof Error && error.name === "GPUInitializationError") {
      throw new WebGLUnavailableError(error.message);
    }
    throw error;
  }

  map.addControl(new maplibre.AttributionControl({ compact: false }), "top-left");
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

  const labels = new Map<number, MarkerLike>();
  let selectedAt: LngLat | null = null;
  let selectedKey = "";
  let tileFailed = false;
  let reportedFailing = false;
  let destroyed = false;

  const pointFeaturesAt = (position: { x: number; y: number }) =>
    map.queryRenderedFeatures(
      [
        [position.x - HIT_SLOP, position.y - HIT_SLOP],
        [position.x + HIT_SLOP, position.y + HIT_SLOP],
      ],
      { layers: POINT_LAYERS },
    );

  // A rendered feature's properties have no prototype, and a source given
  // such an object draws nothing, with no error.
  const select = (feature: Feature) => {
    selectedAt = feature.geometry.coordinates;
    selectedKey = keyOf(feature);
    map.getSource("selection")?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { ...feature.properties },
          geometry: { type: "Point", coordinates: [...feature.geometry.coordinates] },
        },
      ],
    });
  };

  const membersOf = async (feature: Feature): Promise<string[]> => {
    const props = feature.properties ?? {};
    if (typeof props.cluster_id !== "number") return [String(props.id)];
    const source = map.getSource("points");
    if (!source) throw new Error("The points source is not ready");
    const total = Number(props.point_count);
    const leaves = await source.getClusterLeaves(props.cluster_id, total, 0);
    return leaves.map((leaf) => String(leaf.properties?.id));
  };

  const open = async (feature: Feature) => {
    try {
      const ids = await membersOf(feature);
      if (destroyed) return;
      select(feature);
      options.onPointClick(ids);
    } catch (error) {
      if (destroyed) return;
      select(feature);
      options.onPointError(error instanceof Error ? error : new Error(String(error)), () => {
        void open(feature);
      });
    }
  };

  const onClick = (event: { point: { x: number; y: number } }) => {
    const features = pointFeaturesAt(event.point);
    if (features.length > 0) void open(features[0]);
  };
  const onMouseMove = (event: { point: { x: number; y: number } }) => {
    map.getCanvas().style.cursor = pointFeaturesAt(event.point).length > 0 ? "pointer" : "";
  };

  const syncLabels = () => {
    if (!map.getSource("points") || !map.isStyleLoaded()) return;
    const seen = new Set<number>();
    for (const feature of map.querySourceFeatures("points", { filter: ["has", "point_count"] })) {
      const id = feature.properties?.cluster_id;
      if (typeof id !== "number" || seen.has(id)) continue;
      seen.add(id);
      if (labels.has(id)) continue;
      labels.set(
        id,
        new maplibre.Marker({ element: countLabel(Number(feature.properties?.point_count)), anchor: "center" })
          .setLngLat(feature.geometry.coordinates)
          .addTo(map),
      );
    }
    for (const [id, marker] of labels) {
      if (seen.has(id)) continue;
      marker.remove();
      labels.delete(id);
    }
  };

  const onIdle = () => {
    syncLabels();
    if (selectedAt) {
      const [anchor] = pointFeaturesAt(map.project(selectedAt));
      if (anchor && keyOf(anchor) !== selectedKey) select(anchor);
    }
    if (tileFailed !== reportedFailing) {
      reportedFailing = tileFailed;
      options.onTileFailureChange(tileFailed);
    }
    tileFailed = false;
  };

  const onError = (event: { sourceId?: string }) => {
    if (event.sourceId === "tiles") tileFailed = true;
  };

  const onMoveEnd = () => {
    const center = map.getCenter();
    options.onViewChange([center.lng, center.lat], map.getZoom());
  };

  map.on("click", onClick as never);
  map.on("mousemove", onMouseMove as never);
  map.on("idle", onIdle);
  map.on("render", syncLabels);
  map.on("error", onError as never);
  map.on("moveend", onMoveEnd);

  const applyPoints = (points: Point[]) => {
    const source = map.getSource("points");
    if (source) source.setData(toCollection(points));
    else map.once("styledata", () => applyPoints(points));
  };

  return {
    setPoints: applyPoints,
    destroy() {
      destroyed = true;
      for (const marker of labels.values()) marker.remove();
      labels.clear();
      map.remove();
    },
  };
}
