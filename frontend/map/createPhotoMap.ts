import type { Point } from "../api";
import { baseLayers, glyphUrl, paintFor, TILE_MAX_ZOOM, TILE_SOURCE, type Theme } from "./mapStyle";

const ASSET_BASE = "/api/addons/photo_diary/assets/";
const VERSION = "6.16.0";
const LIBRARY_URL = `${ASSET_BASE}maplibre-gl-${VERSION}.js`;
const WORKER_URL = `${ASSET_BASE}maplibre-gl-worker-${VERSION}.js`;
const STYLESHEET_URL = `${ASSET_BASE}maplibre-gl-${VERSION}.css`;
const STYLESHEET_ID = "photo-diary-maplibre-css";

const MAX_ZOOM = 19;
const FIT_MAX_ZOOM = 15;
// Pins are 44 to 68 px wide, so a smaller radius would let one cover another
// completely.
const CLUSTER_RADIUS = 64;
// Clustering has to run at the map's top zoom, or photos with identical
// coordinates would be separate points there. MapLibre warns, on every map,
// when the source's maxzoom is not above clusterMaxZoom; the map never goes
// past MAX_ZOOM, so the level above is not requested.
const CLUSTER_MAX_ZOOM = MAX_ZOOM;
const SOURCE_MAX_ZOOM = MAX_ZOOM + 1;

/** A pin exists while its point is inside the view plus this margin, one pin's width. */
const PIN_MARGIN = 68;
const MOVE_SYNC_MS = 150;
/** A press that moved further than this was a drag, which a button does not report as one. */
const PRESS_SLOP = 6;

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
  getSource(id: "points"): GeoJSONSourceLike | undefined;
  addControl(control: unknown, position?: string): void;
  addSource(id: string, source: unknown): void;
  removeSource(id: string): void;
  addLayer(layer: unknown, before?: string): void;
  removeLayer(id: string): void;
  on(type: string, listener: (event: never) => void): void;
  once(type: string, listener: () => void): void;
  project(lngLat: LngLat): { x: number; y: number };
  querySourceFeatures(source: string, options?: { filter?: unknown[] }): Feature[];
  setPaintProperty(layer: string, property: string, value: unknown): void;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getCanvas(): HTMLCanvasElement;
  getCanvasContainer(): HTMLElement;
  isStyleLoaded(): boolean;
  resize(): void;
  remove(): void;
}

interface MapLibreModule {
  Map: new (options: Record<string, unknown>) => MapLike;
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
  /** Ids of the photos whose list is open; the pin they make up has an accent border. */
  selected?: string[];
  /** The name of a pin standing for `count` photos. */
  pinLabel: (count: number) => string;
  onPointClick: (fileIds: string[]) => void;
  /** `retry` reads the same point's members again. */
  onPointError: (error: Error, retry: () => void) => void;
  onTileFailureChange: (failing: boolean) => void;
  onViewChange: (center: LngLat, zoom: number) => void;
}

export interface PhotoMap {
  /** Refreshing the data is also what lets a pin whose thumbnail failed ask for it again. */
  setPoints(points: Point[]): void;
  /** Gives the pin that stands only for photos among `ids` its accent border. */
  setSelected(ids: string[] | null): void;
  /** The view is going off screen: no pin is removed until the map has gone idle after it returns. */
  pause(): void;
  /** The view is on screen again: applies a theme change that waited, and places the pins. */
  resume(): void;
  destroy(): void;
}

let library: Promise<MapLibreModule> | null = null;
let failures = 0;

// A browser remembers a failed import of a URL for the life of the page and
// answers a second import of it without asking the network. A retry therefore
// asks for another URL, which the server answers with the same file; the first
// attempt keeps the bare URL, which the browser's cache holds once it loads.
const withRetry = (url: string) => (failures === 0 ? url : `${url}?retry=${failures}`);

// The worker is started by the library, which reports nothing when its file
// fails to load, so the file is asked for here first and the worker then
// starts from the browser's cache.
async function fetchWorker(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The MapLibre worker failed to load (${response.status})`);
  await response.arrayBuffer();
}

function loadLibrary(): Promise<MapLibreModule> {
  if (!library) {
    // A runtime import of a served file: the frontend image installs only the
    // core's package.json, so the bundlers must leave this specifier alone.
    const workerUrl = new URL(withRetry(WORKER_URL), document.baseURI).href;
    library = Promise.all([
      import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ withRetry(LIBRARY_URL)),
      fetchWorker(workerUrl),
    ])
      .then(([module]: [MapLibreModule, void]) => {
        module.setWorkerUrl(workerUrl);
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

/**
 * Ranks the points for the pin photo: the newest dated photo comes first, then
 * the undated ones in the order given. A cluster keeps the lowest rank of its
 * members, so a pin's photo is read without a request.
 */
function rankPoints(points: Point[]): { rankOf: Map<string, number>; idAt: string[] } {
  const dated: number[] = [];
  const undated: number[] = [];
  points.forEach((p, i) => (p.taken_at === null ? undated : dated).push(i));
  dated.sort((a, b) => {
    const x = points[a].taken_at as string;
    const y = points[b].taken_at as string;
    return x === y ? b - a : x < y ? 1 : -1;
  });
  const idAt = [...dated, ...undated].map((i) => points[i].file_id);
  return { rankOf: new Map(idAt.map((id, rank) => [id, rank])), idAt };
}

// `sel` is 1 for a selected photo. A cluster sums it, so a point is selected
// exactly when the sum equals the number of photos it stands for, at whatever
// zoom the map is drawn.
function toCollection(points: Point[], selected: ReadonlySet<string>, rankOf: ReadonlyMap<string, number>) {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      properties: { id: p.file_id, sel: selected.has(p.file_id) ? 1 : 0, rank: rankOf.get(p.file_id) },
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

const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function tileSource(options: PhotoMapOptions) {
  return {
    type: "vector",
    tiles: [options.tileUrl],
    maxzoom: TILE_MAX_ZOOM,
    attribution: options.attribution,
  };
}

function buildStyle(options: PhotoMapOptions, data: unknown) {
  // The circle layers draw nothing: a source with no layer loads no tiles, so
  // they keep the points coming while the pins are drawn as elements.
  const unseen = { "circle-radius": 1, "circle-opacity": 0, "circle-stroke-opacity": 0 };
  return {
    version: 8,
    glyphs: glyphUrl(window.location.origin, ASSET_BASE),
    sources: {
      [TILE_SOURCE]: tileSource(options),
      points: {
        type: "geojson",
        data,
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: { selected: ["+", ["get", "sel"]], best: ["min", ["get", "rank"]] },
        maxzoom: SOURCE_MAX_ZOOM,
      },
    },
    layers: [
      ...baseLayers(currentTheme()),
      { id: "clusters", type: "circle", source: "points", filter: ["has", "point_count"], paint: unseen },
      { id: "singles", type: "circle", source: "points", filter: ["!", ["has", "point_count"]], paint: unseen },
    ],
  };
}

interface Pin {
  key: string;
  count: number;
  photoId: string;
  lngLat: LngLat;
  clusterId: number | null;
  selected: boolean;
  side: number;
  element: HTMLButtonElement;
  image: HTMLImageElement;
}

interface Seen {
  key: string;
  count: number;
  photoId: string;
  lngLat: LngLat;
  clusterId: number | null;
  selected: boolean;
}

const sideFor = (count: number) => (count < 10 ? 44 : count < 20 ? 50 : count < 100 ? 58 : 68);
const thumbnailUrl = (id: string) => `/api/files/${encodeURIComponent(id)}/thumbnail`;

function createBadge(count: number): HTMLElement {
  const badge = document.createElement("span");
  badge.textContent = String(count);
  badge.setAttribute("aria-hidden", "true");
  badge.style.cssText =
    "position:absolute;top:-7px;right:-7px;box-sizing:border-box;height:18px;min-width:18px;padding:0 5px;" +
    "border:1.5px solid #fff;border-radius:9px;background:#211922;color:#fff;" +
    "font:600 11px/15px system-ui,sans-serif;font-variant-numeric:tabular-nums;text-align:center;pointer-events:none";
  return badge;
}

export async function createPhotoMap(
  container: HTMLElement,
  options: PhotoMapOptions,
): Promise<PhotoMap> {
  const maplibre = await loadLibrary();
  ensureStylesheet();

  let currentPoints = options.points;
  let ranking = rankPoints(currentPoints);
  let selected = new Set(options.selected);

  const view = options.center
    ? { center: options.center, zoom: options.zoom ?? FIT_MAX_ZOOM }
    : options.points.length > 0
      ? { bounds: boundsOf(options.points), fitBoundsOptions: { padding: 48, maxZoom: FIT_MAX_ZOOM } }
      : { center: [0, 0] as LngLat, zoom: 1 };

  let map: MapLike;
  try {
    map = new maplibre.Map({
      container,
      style: buildStyle(options, toCollection(currentPoints, selected, ranking.rankOf)),
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      // Han, kana and Hangul are drawn with the page's own fonts.
      localIdeographFontFamily: getComputedStyle(document.body).fontFamily,
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

  // Its own stacking context, so the pins' order among themselves cannot
  // reach the map's controls, the notice or the sheet.
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none";
  map.getCanvasContainer().appendChild(layer);

  const pins = new Map<string, Pin>();
  const failedPhotos = new Set<string>();
  let appliedTheme = currentTheme();
  let loaded = false;
  // The data was replaced and its tiles are not back yet. Until they are, the
  // features read are the old ones or none, and a pin is neither added nor
  // removed on that evidence.
  let dataPending = true;
  // From the view going off screen until the map has gone idle at its real size again,
  // the tiles are those of the hidden map's small size, so a pin is not removed on what they hold.
  let resuming = false;
  let returned = false;
  let tileFailed = false;
  let reportedFailing = false;
  let verifyingTiles = false;
  let destroyed = false;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;

  const onScreen = () => container.getClientRects().length > 0;

  const seenFrom = (feature: Feature): Seen | null => {
    const props = feature.properties ?? {};
    const isCluster = typeof props.cluster_id === "number";
    const count = isCluster ? Number(props.point_count) : 1;
    const rank = Number(isCluster ? props.best : props.rank);
    const photoId = ranking.idAt[rank];
    if (photoId === undefined) return null;
    return {
      key: `${count}:${photoId}`,
      count,
      photoId,
      lngLat: feature.geometry.coordinates,
      clusterId: isCluster ? (props.cluster_id as number) : null,
      selected: isCluster ? Number(props.selected) === count : Number(props.sel) === 1,
    };
  };

  const stack = (pin: Pin) => {
    pin.element.style.zIndex = String(pin.selected ? 1_000_000 : pin.count);
    pin.element.style.borderColor = pin.selected ? "var(--accent)" : "#fff";
  };

  const loadImage = (pin: Pin) => {
    if (failedPhotos.has(pin.photoId)) return;
    pin.image.style.display = "";
    pin.image.src = thumbnailUrl(pin.photoId);
  };

  const place = (pin: Pin) => {
    const at = map.project(pin.lngLat);
    pin.element.style.transform = `translate(${at.x}px,${at.y}px)`;
  };

  let pressedAt: { x: number; y: number } | null = null;

  const membersOf = async (pin: Pin): Promise<string[]> => {
    if (pin.count === 1) return [pin.photoId];
    const source = map.getSource("points");
    if (!source) throw new Error("The points source is not ready");
    // Cluster ids name positions in the index and are reused when the points
    // change, so the pin is looked up again by what it stands for, and what
    // the index answers is checked against it.
    const candidates: number[] = [];
    for (const feature of map.querySourceFeatures("points", { filter: ["has", "point_count"] })) {
      const found = seenFrom(feature);
      if (found?.key === pin.key && found.clusterId !== null && !candidates.includes(found.clusterId)) {
        candidates.push(found.clusterId);
      }
    }
    if (pin.clusterId !== null && !candidates.includes(pin.clusterId)) candidates.push(pin.clusterId);
    for (const id of candidates) {
      const leaves = await source.getClusterLeaves(id, pin.count, 0);
      const ids = leaves.map((leaf) => String(leaf.properties?.id));
      if (ids.length === pin.count && ids.includes(pin.photoId)) return ids;
    }
    throw new Error("The point changed before its photos were read");
  };

  const open = async (pin: Pin) => {
    try {
      const ids = await membersOf(pin);
      if (destroyed) return;
      options.onPointClick(ids);
    } catch (error) {
      if (destroyed) return;
      options.onPointError(error instanceof Error ? error : new Error(String(error)), () => {
        void open(pin);
      });
    }
  };

  const addPin = (seen: Seen): Pin => {
    const side = sideFor(seen.count);
    const element = document.createElement("button");
    element.type = "button";
    element.setAttribute("aria-label", options.pinLabel(seen.count));
    element.style.cssText =
      `position:absolute;left:${-side / 2}px;top:${-side / 2}px;width:${side}px;height:${side}px;` +
      "box-sizing:border-box;padding:0;margin:0;border:2.5px solid #fff;border-radius:12px;" +
      "background:var(--sand);cursor:pointer;pointer-events:auto;" +
      "box-shadow:0 1px 3px rgba(33,25,34,0.25)";
    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    image.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:9.5px";
    const pin: Pin = { ...seen, side, element, image };
    image.addEventListener("error", () => {
      failedPhotos.add(pin.photoId);
      image.style.display = "none";
    });
    element.addEventListener("pointerdown", (event) => {
      pressedAt = { x: event.clientX, y: event.clientY };
    });
    element.addEventListener("click", (event) => {
      const from = pressedAt;
      pressedAt = null;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > PRESS_SLOP) return;
      void open(pin);
    });
    element.appendChild(image);
    if (seen.count > 1) element.appendChild(createBadge(seen.count));
    stack(pin);
    loadImage(pin);
    layer.appendChild(element);
    return pin;
  };

  const removePin = (pin: Pin) => {
    // An image that is still loading is abandoned by clearing its source.
    pin.image.removeAttribute("src");
    pin.element.remove();
  };

  const syncPins = () => {
    if (dataPending || !onScreen() || !map.getSource("points")) return;
    const width = map.getCanvas().clientWidth;
    const height = map.getCanvas().clientHeight;
    const wanted = new Map<string, Seen>();
    for (const feature of map.querySourceFeatures("points")) {
      const seen = seenFrom(feature);
      if (!seen || wanted.has(seen.key)) continue;
      const at = map.project(seen.lngLat);
      if (at.x < -PIN_MARGIN || at.y < -PIN_MARGIN || at.x > width + PIN_MARGIN || at.y > height + PIN_MARGIN) continue;
      wanted.set(seen.key, seen);
    }
    for (const [key, pin] of pins) {
      if (wanted.has(key) || resuming) continue;
      removePin(pin);
      pins.delete(key);
    }
    for (const [key, seen] of wanted) {
      const kept = pins.get(key);
      if (!kept) {
        const pin = addPin(seen);
        pins.set(key, pin);
        place(pin);
        continue;
      }
      kept.lngLat = seen.lngLat;
      kept.clusterId = seen.clusterId;
      if (kept.selected !== seen.selected) {
        kept.selected = seen.selected;
        stack(kept);
      }
    }
  };

  const placePins = () => {
    for (const pin of pins.values()) place(pin);
  };

  const applyTheme = () => {
    const theme = currentTheme();
    if (!loaded || theme === appliedTheme || !onScreen()) return;
    appliedTheme = theme;
    for (const [id, property, value] of paintFor(theme)) map.setPaintProperty(id, property, value);
  };
  const themeWatcher = new MutationObserver(applyTheme);
  themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const reportTiles = (failing: boolean) => {
    if (failing === reportedFailing) return;
    reportedFailing = failing;
    options.onTileFailureChange(failing);
  };

  // An errored tile is not asked for again while it stays in view, so an idle
  // that brought no new error does not show the tiles recovered. While the
  // notice is up, the first such idle asks for the tiles in view once more,
  // and the idle after that one decides. The source is made again for that:
  // `setTiles` reloads the tiles that loaded and skips the errored ones.
  const reloadTiles = () => {
    const layers = baseLayers(appliedTheme);
    for (const base of layers) map.removeLayer(base.id);
    map.removeSource(TILE_SOURCE);
    map.addSource(TILE_SOURCE, tileSource(options));
    for (const base of layers) map.addLayer(base, "clusters");
  };

  const onIdle = () => {
    dataPending = false;
    if (returned && onScreen()) resuming = returned = false;
    syncPins();
    if (tileFailed) {
      tileFailed = false;
      verifyingTiles = false;
      reportTiles(true);
    } else if (reportedFailing) {
      if (verifyingTiles) {
        verifyingTiles = false;
        reportTiles(false);
      } else {
        verifyingTiles = true;
        reloadTiles();
      }
    }
  };

  const onError = (event: { sourceId?: string }) => {
    if (event.sourceId === TILE_SOURCE) tileFailed = true;
  };

  const onSourceData = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (event.sourceId !== "points" || !event.isSourceLoaded) return;
    dataPending = false;
    syncPins();
  };

  const onMove = () => {
    if (moveTimer !== null) return;
    moveTimer = setTimeout(() => {
      moveTimer = null;
      syncPins();
    }, MOVE_SYNC_MS);
  };

  const onMoveEnd = () => {
    syncPins();
    const center = map.getCenter();
    options.onViewChange([center.lng, center.lat], map.getZoom());
  };

  map.on("load", () => {
    loaded = true;
    applyTheme();
    syncPins();
  });
  map.on("idle", onIdle);
  map.on("render", placePins);
  map.on("move", onMove);
  map.on("sourcedata", onSourceData as never);
  map.on("error", onError as never);
  map.on("moveend", onMoveEnd);

  const drawData = () => {
    const source = map.getSource("points");
    if (!source) {
      map.once("styledata", drawData);
      return;
    }
    dataPending = true;
    source.setData(toCollection(currentPoints, selected, ranking.rankOf));
  };

  return {
    setPoints(points) {
      currentPoints = points;
      ranking = rankPoints(points);
      failedPhotos.clear();
      for (const pin of pins.values()) if (pin.image.style.display === "none") loadImage(pin);
      drawData();
    },
    setSelected(ids) {
      const next = new Set(ids);
      if (next.size === selected.size && [...next].every((id) => selected.has(id))) return;
      selected = next;
      drawData();
    },
    pause() {
      resuming = true;
      returned = false;
    },
    resume() {
      // A hidden map is sized 400 by 300, and its own observer can give it the real
      // size before this runs, so `pause` has already held the removals.
      resuming = true;
      returned = true;
      map.resize();
      applyTheme();
      syncPins();
    },
    destroy() {
      destroyed = true;
      themeWatcher.disconnect();
      if (moveTimer !== null) clearTimeout(moveTimer);
      for (const pin of pins.values()) removePin(pin);
      pins.clear();
      layer.remove();
      map.remove();
    },
  };
}
