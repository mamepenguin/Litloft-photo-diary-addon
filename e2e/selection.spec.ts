import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_PATH, accentBorders, accentPixels, createMap, pinsOf, prepare, same, settle, zoomInAtCentre, type Point } from "./support";

const A: [number, number] = [139.7671, 35.6812];

const idsOf = (points: Point[]) => points.map((p) => p.file_id);
const select = (page: Page, ids: string[] | null) =>
  page.evaluate((value) => (window as any).__handle.setSelected(value), ids);

test.describe("the selected pin has an accent border", () => {
  for (const [name, points] of [
    ["a cluster", [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)]],
    ["a single photo", [...same("solo", 1, 35.6812, 139.7671), ...same("far", 3, 36, 140)]],
  ] as const) {
    test(`SPEC-PD-011: ${name} has the accent border while its photos are selected, and a white one after`, async ({ page }) => {
      const h = await prepare(page);
      await page.goto(FIXTURE_PATH);
      const selected = idsOf([...points].slice(0, name === "a cluster" ? 3 : 1));
      await createMap(page, { points: [...points], center: A, zoom: 12 });
      await settle(page, h);
      expect(await accentBorders(page)).toBe(0);
      expect(await accentPixels(page)).toBe(0);

      await select(page, selected);
      await expect.poll(() => accentBorders(page), { timeout: 10_000 }).toBe(1);
      await expect.poll(() => accentPixels(page), { timeout: 10_000 }).toBeGreaterThan(100);

      await select(page, null);
      await expect.poll(() => accentBorders(page), { timeout: 10_000 }).toBe(0);
      await expect.poll(() => accentPixels(page), { timeout: 10_000 }).toBe(0);
    });

    test(`SPEC-PD-011: ${name} has it on a map made for an open list`, async ({ page }) => {
      const h = await prepare(page);
      await page.goto(FIXTURE_PATH);
      const selected = idsOf([...points].slice(0, name === "a cluster" ? 3 : 1));
      await createMap(page, { points: [...points], center: A, zoom: 12, selected });
      await settle(page, h);
      await expect.poll(() => accentBorders(page), { timeout: 10_000 }).toBe(1);
    });
  }

  test("SPEC-PD-011: a pin that holds more than the list does not have it", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points = same("a", 3, 35.6812, 139.7671);
    await createMap(page, { points, center: A, zoom: 12, selected: ["a-0", "a-1"] });
    await settle(page, h);
    expect(await accentBorders(page)).toBe(0);
  });

  test("SPEC-PD-011: the map stays idle once the selection is drawn", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points = [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)];
    await createMap(page, { points, center: A, zoom: 12 });
    await settle(page, h);
    await select(page, ["a-0", "a-1", "a-2"]);
    await expect.poll(() => accentBorders(page)).toBe(1);
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

  test("SPEC-PD-011: when the opened cluster splits, each photo's pin has it and none is left at the old centre", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    // About 300 m apart: one pin at zoom 12, three at zoom 16. Their
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
    await expect.poll(() => accentBorders(page)).toBe(1);

    for (let i = 0; i < 4; i++) await zoomInAtCentre(page);
    await expect.poll(() => accentBorders(page), { timeout: 10_000 }).toBe(3);
    await expect.poll(() => pinsOf(page).count()).toBe(3);
    const box = (await page.locator("#map").boundingBox())!;
    for (const pin of await pinsOf(page).all()) {
      const at = (await pin.boundingBox())!;
      const distance = Math.hypot(at.x + at.width / 2 - (box.x + box.width / 2), at.y + at.height / 2 - (box.y + box.height / 2));
      expect(distance).toBeGreaterThan(40);
    }

    await select(page, null);
    await expect.poll(() => accentBorders(page), { timeout: 10_000 }).toBe(0);
  });

  test("SPEC-PD-011: removing the points leaves no pin with it on the empty map", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points = [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)];
    // The selection is of photos that are not on the map any more.
    await createMap(page, { points, center: A, zoom: 12, selected: ["gone-0", "gone-1", "gone-2"] });
    await settle(page, h);
    expect(await accentBorders(page)).toBe(0);
    await select(page, ["a-0", "a-1", "a-2"]);
    await expect.poll(() => accentBorders(page)).toBe(1);
    await page.evaluate(() => (window as any).__handle.setPoints([]));
    await expect.poll(() => pinsOf(page).count(), { timeout: 10_000 }).toBe(0);
    expect(await accentPixels(page)).toBe(0);
  });
});
