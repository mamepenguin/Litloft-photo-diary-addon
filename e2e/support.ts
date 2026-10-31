import { expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const TILE_HOST = "tiles.example.test";
export const TILE_URL = `https://${TILE_HOST}/v1/{z}/{x}/{y}.png`;
export const TILE_PATTERN = new RegExp(`^https://${TILE_HOST.replace(/\./g, "\\.")}/v1/(\\d+)/(\\d+)/(\\d+)\\.png$`);
export const FIXTURE_PATH = "/index.html?drive=family&date=2026-10-03&undated=true";

const ASSETS = path.join(__dirname, "../backend/assets");
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
};

export type Point = { file_id: string; lat: number; lon: number; taken_at: string | null };

export type Harness = {
  requests: { url: string; headers: Record<string, string> }[];
  tileRequests: () => { url: string; headers: Record<string, string> }[];
  assetRequests: () => string[];
  clicks: string[][];
  views: { center: [number, number]; zoom: number }[];
  tileFailures: boolean[];
};

/**
 * Routes everything the map may ask for. Anything that is neither the fixture
 * server, the bundled assets nor the configured tile host is answered with an
 * abort, so a run never reaches a real server, and is still recorded.
 */
export async function prepare(page: Page): Promise<Harness> {
  const h: Harness = {
    requests: [],
    tileRequests: () => h.requests.filter((r) => new URL(r.url).hostname === TILE_HOST),
    assetRequests: () => h.requests.map((r) => r.url).filter((u) => u.includes("/api/addons/photo_diary/assets/")),
    clicks: [],
    views: [],
    tileFailures: [],
  };

  page.on("request", (request) => {
    // A request still in flight when the test ends has no page left to read
    // headers from, and is not a request any assertion can still look at.
    void request
      .allHeaders()
      .then((headers) => h.requests.push({ url: request.url(), headers }))
      .catch((error) => {
        if (!String(error).includes("has been closed")) throw error;
      });
  });

  await page.route(
    (url) => !["127.0.0.1", TILE_HOST].includes(url.hostname),
    (route) => route.abort(),
  );
  await page.route("**/api/addons/photo_diary/assets/*", async (route) => {
    const name = path.basename(new URL(route.request().url()).pathname);
    const file = path.join(ASSETS, name);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    await route.fulfill({
      status: 200,
      contentType: TYPES[path.extname(name)] ?? "application/octet-stream",
      body: fs.readFileSync(file),
    });
  });
  await page.route(`https://${TILE_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 }),
  );

  await page.exposeFunction("__onPointClick", (ids: string[]) => void h.clicks.push(ids));
  await page.exposeFunction("__onTileFailure", (value: boolean) => void h.tileFailures.push(value));
  await page.exposeFunction("__onView", (center: [number, number], zoom: number) => void h.views.push({ center, zoom }));
  return h;
}

export async function createMap(
  page: Page,
  options: {
    points: Point[];
    center: [number, number];
    zoom: number;
    attribution?: string;
    tileUrl?: string;
    selected?: string[];
  },
) {
  await page.evaluate(async (o) => {
    const w = window as any;
    w.__handle = await w.createPhotoMap(document.getElementById("map"), {
      points: o.points,
      tileUrl: o.tileUrl,
      attribution: o.attribution,
      center: o.center,
      zoom: o.zoom,
      selected: o.selected,
      onPointClick: (ids: string[]) => w.__onPointClick(ids),
      onPointError: () => {},
      onTileFailureChange: (value: boolean) => w.__onTileFailure(value),
      onViewChange: (c: [number, number], z: number) => w.__onView(c, z),
    });
  }, { attribution: "", tileUrl: TILE_URL, ...options });
}

/** The map has a canvas, and has had time to ask for tiles and to cluster. */
export async function settle(page: Page, h: Harness) {
  await page.locator("canvas").first().waitFor();
  await expect.poll(() => h.tileRequests().length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
}

export async function clickCentre(page: Page) {
  const box = (await page.locator("#map").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export const same = (id: string, n: number, lat: number, lon: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({
    file_id: `${id}-${i}`,
    lat,
    lon,
    taken_at: "2026-10-03T10:00:00",
  }));

/** The text of each count label on the map, sorted. */
export const labelTexts = (page: Page) =>
  page.locator("#map .maplibregl-marker").allTextContents().then((texts) => texts.sort());

export const PNG = PNG_1X1;

/** Zooms in one level at the map's centre. */
export async function zoomInAtCentre(page: Page) {
  const box = (await page.locator("#map").boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
}

// What the canvas shows, not what the style claims. The colour is the page's
// own `--accent`, so a selection drawn in any other colour does not count.
export async function accentPixels(
  page: Page,
  region: "map" | "centre" = "map",
  target: Locator = page.locator("#map"),
): Promise<number> {
  const box = (await target.boundingBox())!;
  const clip =
    region === "map"
      ? box
      : { x: box.x + box.width / 2 - 12, y: box.y + box.height / 2 - 12, width: 24, height: 24 };
  const png = await page.screenshot({ clip });
  return page.evaluate(async (base64) => {
    const token = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(token.slice(i, i + 2), 16));
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - r) < 12 && Math.abs(data[i + 1] - g) < 12 && Math.abs(data[i + 2] - b) < 12) count++;
    }
    return count;
  }, png.toString("base64"));
}

