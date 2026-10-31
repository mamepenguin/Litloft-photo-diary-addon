import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_PATH, accentPixels, createMap, prepare, same, settle, zoomInAtCentre, type Point } from "./support";

const A: [number, number] = [139.7671, 35.6812];

const idsOf = (points: Point[]) => points.map((p) => p.file_id);
const select = (page: Page, ids: string[] | null) =>
  page.evaluate((value) => (window as any).__handle.setSelected(value), ids);

test.describe("the selected point is drawn in the accent colour", () => {
  for (const [name, points] of [
    ["a cluster", [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)]],
    ["a single photo", [...same("solo", 1, 35.6812, 139.7671), ...same("far", 3, 36, 140)]],
  ] as const) {
    test(`SPEC-PD-002 design: ${name} is accent while its photos are selected, and plum after`, async ({ page }) => {
      const h = await prepare(page);
      await page.goto(FIXTURE_PATH);
      const selected = idsOf([...points].slice(0, name === "a cluster" ? 3 : 1));
      await createMap(page, { points: [...points], center: A, zoom: 12 });
      await settle(page, h);
      expect(await accentPixels(page)).toBe(0);

      await select(page, selected);
      await expect.poll(() => accentPixels(page, "centre"), { timeout: 10_000 }).toBeGreaterThan(40);

      await select(page, null);
      await expect.poll(() => accentPixels(page), { timeout: 10_000 }).toBe(0);
    });

    test(`SPEC-PD-002 design: ${name} is accent on a map made for an open list`, async ({ page }) => {
      const h = await prepare(page);
      await page.goto(FIXTURE_PATH);
      const selected = idsOf([...points].slice(0, name === "a cluster" ? 3 : 1));
      await createMap(page, { points: [...points], center: A, zoom: 12, selected });
      await settle(page, h);
      await expect.poll(() => accentPixels(page, "centre"), { timeout: 10_000 }).toBeGreaterThan(40);
    });
  }

  test("SPEC-PD-002 design: a point that holds more than the list is not accent", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points = same("a", 3, 35.6812, 139.7671);
    await createMap(page, { points, center: A, zoom: 12, selected: ["a-0", "a-1"] });
    await settle(page, h);
    expect(await accentPixels(page)).toBe(0);
  });

  test("SPEC-PD-002 design: the map stays idle once the selection is drawn", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points = [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)];
    await createMap(page, { points, center: A, zoom: 12 });
    await settle(page, h);
    await select(page, ["a-0", "a-1", "a-2"]);
    await expect.poll(() => accentPixels(page, "centre")).toBeGreaterThan(40);
    await page.waitForTimeout(500);
    const frames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let count = 0;
          const original = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) => {
            count++;
            return original(callback);
          };
          setTimeout(() => resolve(count), 1000);
        }),
    );
    expect(frames).toBeLessThan(5);
  });

  test("SPEC-PD-002 design: when the opened cluster splits, each photo is accent and nothing is left at the old centre", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    // About 300 m apart: one point at zoom 12, three at zoom 16. Their
    // centroid is the map's centre, where no photo is.
    const offsets = [
      [-0.002, -0.00117],
      [0.002, -0.00117],
      [0, 0.00233],
    ];
    const points: Point[] = offsets.map(([dx, dy], i) => ({
      file_id: `s-${i}`,
      lat: 35.6812 + dy,
      lon: 139.7671 + dx,
      taken_at: "2026-10-03T10:00:00",
    }));
    await createMap(page, { points, center: A, zoom: 12, selected: idsOf(points) });
    await settle(page, h);
    await expect.poll(() => accentPixels(page, "centre")).toBeGreaterThan(40);

    for (let i = 0; i < 4; i++) await zoomInAtCentre(page);
    await expect.poll(() => accentPixels(page), { timeout: 10_000 }).toBeGreaterThan(100);
    expect(await accentPixels(page, "centre")).toBe(0);

    await select(page, null);
    await expect.poll(() => accentPixels(page), { timeout: 10_000 }).toBe(0);
  });

  test("SPEC-PD-002 design: zooming away from a selected cluster leaves no accent on the empty map", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points = [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)];
    // The selection is of photos that are not on the map any more.
    await createMap(page, { points, center: A, zoom: 12, selected: ["gone-0", "gone-1", "gone-2"] });
    await settle(page, h);
    expect(await accentPixels(page)).toBe(0);
    await select(page, ["a-0", "a-1", "a-2"]);
    await expect.poll(() => accentPixels(page, "centre")).toBeGreaterThan(40);
    await (page.evaluate(() => (window as any).__handle.setPoints([])));
    await expect.poll(() => accentPixels(page), { timeout: 10_000 }).toBe(0);
  });
});
