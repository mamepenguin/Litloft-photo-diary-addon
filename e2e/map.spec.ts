/**
 * What only a browser can show: I7 and I10 of docs/specs/photo-diary.md, and
 * the always-visible attribution (SPEC-PD-002 and section 9). The real MapLibre
 * files from backend/assets/ run in Chromium; tiles are answered by page.route,
 * so nothing here reaches a tile server.
 */
import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, TILE_HOST, TILE_PATTERN, TILE_URL, clickCentre, createMap, prepare, same, settle } from "./support";

const A: [number, number] = [139.7671, 35.6812]; // [lon, lat]

test.describe("I7: a point lists every photo it stands for and no other", () => {
  test("SPEC-PD-002 I7: photos with identical coordinates at zoom 19 are one point", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, {
      points: [
        ...same("a", 5, 35.6812, 139.7671),
        ...same("b", 2, 35.6822, 139.7671), // about 110 m away
        ...same("c", 1, 36.0, 140.0),
      ],
      center: A,
      zoom: 19,
    });
    await settle(page, h);
    await clickCentre(page);
    await expect.poll(() => h.clicks.length).toBeGreaterThan(0);
    expect([...h.clicks.at(-1)!].sort()).toEqual(["a-0", "a-1", "a-2", "a-3", "a-4"]);
  });

  test("SPEC-PD-002 I7: a lone photo is a point of one", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: [...same("solo", 1, 35.6812, 139.7671), ...same("far", 3, 36, 140)], center: A, zoom: 19 });
    await settle(page, h);
    await clickCentre(page);
    await expect.poll(() => h.clicks.length).toBeGreaterThan(0);
    expect(h.clicks.at(-1)).toEqual(["solo-0"]);
  });

  test("SPEC-PD-002 I7: 150 photos at identical coordinates at zoom 19 are all listed", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points = [...same("m", 150, 35.6812, 139.7671), ...same("other", 4, 35.7, 139.8)];
    await createMap(page, { points, center: A, zoom: 19 });
    await settle(page, h);
    await clickCentre(page);
    await expect.poll(() => h.clicks.length).toBeGreaterThan(0);
    const ids = h.clicks.at(-1)!;
    expect(ids).toHaveLength(150);
    expect(new Set(ids)).toEqual(new Set(points.slice(0, 150).map((p) => p.file_id)));
  });

  test("SPEC-PD-002 I7: 130 photos that merge at a wide zoom are all listed, and the click does not zoom", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const near = Array.from({ length: 130 }, (_, i) => ({
      file_id: `n-${i}`,
      lat: 35.6812 + i * 1e-6,
      lon: 139.7671,
      taken_at: "2026-10-03T10:00:00",
    }));
    await createMap(page, { points: [...near, ...same("far", 3, 36, 140)], center: A, zoom: 14 });
    await settle(page, h);
    h.views.length = 0;
    await clickCentre(page);
    await expect.poll(() => h.clicks.length).toBeGreaterThan(0);
    const ids = h.clicks.at(-1)!;
    expect(ids).toHaveLength(130);
    expect(new Set(ids)).toEqual(new Set(near.map((p) => p.file_id)));
    await page.waitForTimeout(800);
    for (const view of h.views) expect(view.zoom).toBe(14);
  });
});

test.describe("I10: tile requests", () => {
  test("SPEC-PD-004 I10: no tile request and no MapLibre file before a map is created, both after", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await page.waitForTimeout(1000);
    expect(h.tileRequests()).toEqual([]);
    expect(h.assetRequests()).toEqual([]);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    expect(h.assetRequests().length).toBeGreaterThan(0);
    expect(h.tileRequests().length).toBeGreaterThan(0);
  });

  test("SPEC-PD-004 I10: a tile URL is the configured URL with only z, x and y filled in", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, {
      points: [{ file_id: "SECRET-PHOTO-ID-123", lat: 35.6812, lon: 139.7671, taken_at: "2026-10-03T10:00:00" }],
      center: A,
      zoom: 12,
    });
    await settle(page, h);
    const tiles = h.tileRequests();
    expect(tiles.length).toBeGreaterThan(0);
    for (const { url } of tiles) {
      const m = TILE_PATTERN.exec(url);
      expect(m, url).not.toBeNull();
      const [z, x, y] = [Number(m![1]), Number(m![2]), Number(m![3])];
      expect(z).toBeLessThanOrEqual(19);
      expect(x).toBeLessThan(2 ** z);
      expect(y).toBeLessThan(2 ** z);
    }
    expect(TILE_URL).toContain("{z}/{x}/{y}");
  });

  test("SPEC-PD-004 I10: no request carries a photo's id or coordinates", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, {
      points: [{ file_id: "SECRET-PHOTO-ID-123", lat: 35.681236, lon: 139.767125, taken_at: "2026-10-03T10:00:00" }],
      center: A,
      zoom: 12,
    });
    await settle(page, h);
    for (const { url } of h.requests) {
      expect(url).not.toContain("SECRET-PHOTO-ID-123");
      expect(url).not.toContain("35.681236");
      expect(url).not.toContain("139.767125");
    }
  });

  test("SPEC-PD-004 I10: the Referer of a tile request is at most the page's origin", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    const origin = new URL(page.url()).origin;
    for (const { url, headers } of h.tileRequests()) {
      const referer = headers["referer"];
      expect([undefined, origin, `${origin}/`], url).toContain(referer);
    }
  });

  test("SPEC-PD-004 I10: the map contacts no host but the page's own and the tile server", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    const hosts = new Set(h.requests.map((r) => new URL(r.url).hostname).filter(Boolean));
    expect([...hosts].sort()).toEqual(["127.0.0.1", TILE_HOST].sort());
  });
});

test.describe("attribution", () => {
  const ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';

  for (const width of [320, 375, 768, 1280]) {
    test(`SPEC-PD-004: a configured attribution is visible without any click at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const h = await prepare(page);
      await page.goto(FIXTURE_PATH);
      await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12, attribution: ATTRIBUTION });
      await settle(page, h);
      const link = page.getByRole("link", { name: "© OpenStreetMap contributors" });
      await expect(link).toBeVisible();
      await expect(link).toBeInViewport({ ratio: 1 });
      await expect(link).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    });
  }

  test("SPEC-PD-004: an empty attribution shows none", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12, attribution: "" });
    await settle(page, h);
    await expect(page.getByText("OpenStreetMap")).toHaveCount(0);
  });
});
