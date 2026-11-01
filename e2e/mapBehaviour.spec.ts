/**
 * The real map module in Chromium: what it draws and reports as the points,
 * the zoom and the viewer's hand change, which a mocked map cannot show.
 */
import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, createMap, labelTexts, prepare, same, settle, zoomInAtCentre, type Point } from "./support";

const A: [number, number] = [139.7671, 35.6812];

test.describe("count labels", () => {
  test("SPEC-PD-002: a point of several photos shows its count, a lone photo none", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, {
      points: [...same("a", 5, 35.6812, 139.7671), ...same("b", 3, 34.7025, 135.4959), ...same("c", 1, 43.06, 141.35)],
      center: A,
      zoom: 5,
    });
    await settle(page, h);
    await expect.poll(() => labelTexts(page)).toEqual(["3", "5"]);
  });

  test("SPEC-PD-002: labels of clusters that no longer exist leave the map as it zooms in", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points: Point[] = [0, 1, 2].map((i) => ({
      file_id: `s-${i}`,
      lat: 35.6812 + (i - 1) * 0.002,
      lon: 139.7671 + (i - 1) * 0.002,
      taken_at: "2026-10-03T10:00:00",
    }));
    await createMap(page, { points, center: A, zoom: 12 });
    await settle(page, h);
    await expect.poll(() => labelTexts(page)).toEqual(["3"]);
    for (let i = 0; i < 4; i++) await zoomInAtCentre(page);
    await expect.poll(() => labelTexts(page), { timeout: 10_000 }).toEqual([]);
  });

  test("SPEC-PD-002: new points reach the map, and a label shows the size of the point that now holds its place", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, {
      points: [...same("a", 5, 35.6812, 139.7671), ...same("b", 2, 34.7025, 135.4959)],
      center: A,
      zoom: 5,
    });
    await settle(page, h);
    await expect.poll(() => labelTexts(page)).toEqual(["2", "5"]);
    await page.evaluate((points) => (window as any).__handle.setPoints(points), [
      ...same("c", 3, 35.6812, 139.7671),
      ...same("d", 4, 34.7025, 135.4959),
    ]);
    await expect.poll(() => labelTexts(page), { timeout: 10_000 }).toEqual(["3", "4"]);
  });

  test("SPEC-PD-002: removing the map takes its canvas and its labels away", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    await expect.poll(() => labelTexts(page)).toEqual(["3"]);
    await page.evaluate(() => (window as any).__handle.destroy());
    await expect(page.locator("#map canvas")).toHaveCount(0);
    await expect(page.locator("#map .maplibregl-marker")).toHaveCount(0);
  });
});

test.describe("the view the map reports", () => {
  test("SPEC-PD-002: panning and zooming are reported with the centre and zoom reached", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    h.views.length = 0;

    const box = (await page.locator("#map").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2 + 100;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 200, y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => h.views.length).toBeGreaterThan(0);
    const panned = h.views.at(-1)!;
    expect(panned.zoom).toBeCloseTo(12, 5);
    expect(panned.center[0]).toBeGreaterThan(A[0]);

    await zoomInAtCentre(page);
    await expect.poll(() => h.views.at(-1)!.zoom).toBeCloseTo(13, 1);
  });

  test("SPEC-PD-002: the map does not zoom past 19", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 18.5 });
    await settle(page, h);
    h.views.length = 0;
    await zoomInAtCentre(page);
    await zoomInAtCentre(page);
    await expect.poll(() => h.views.length).toBeGreaterThan(0);
    expect(h.views.at(-1)!.zoom).toBeCloseTo(19, 5);
  });
});

test.describe("tiles", () => {
  test("SPEC-PD-004: 256 px tiles are asked for one level above the map's zoom", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    const zooms = new Set(h.tileRequests().map((r) => Number(/\/v1\/(\d+)\//.exec(r.url)![1])));
    expect(Math.max(...zooms)).toBe(13);
  });
});
