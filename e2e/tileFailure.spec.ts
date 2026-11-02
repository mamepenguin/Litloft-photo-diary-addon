import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, MVT_TYPE, TILE_HOST, VECTOR_TILE, clickCentre, createMap, prepare, same, settle, zoomInAtCentre } from "./support";

const A: [number, number] = [139.7671, 35.6812];

test("SPEC-PD-001: the notice stays while tiles keep failing, and points still answer meanwhile", async ({ page }) => {
  const h = await prepare(page);
  let failing = true;
  await page.route(`https://${TILE_HOST}/**`, (route) =>
    failing ? route.fulfill({ status: 503 }) : route.fulfill({ status: 200, contentType: MVT_TYPE, body: VECTOR_TILE }),
  );
  await page.goto(FIXTURE_PATH);
  await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
  await settle(page, h).catch(() => undefined);

  await expect.poll(() => h.tileFailures.at(-1)).toBe(true);
  await clickCentre(page);
  await expect.poll(() => h.clicks.length).toBeGreaterThan(0);

  // What the open list does to the map: an idle that no failed tile causes.
  await page.evaluate(() => (window as any).__handle.setSelected(["a-0", "a-1", "a-2"]));
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).__handle.setSelected(null));
  await page.waitForTimeout(2500);
  expect(h.tileFailures).toEqual([true]);

  failing = false;
  await zoomInAtCentre(page);
  await expect.poll(() => h.tileFailures.at(-1), { timeout: 15_000 }).toBe(false);
});

test("SPEC-PD-001: the notice goes once a tile in view loads after the others failed", async ({ page }) => {
  const h = await prepare(page);
  let failing = true;
  await page.route(`https://${TILE_HOST}/**`, (route) =>
    failing ? route.fulfill({ status: 503 }) : route.fulfill({ status: 200, contentType: MVT_TYPE, body: VECTOR_TILE }),
  );
  await page.goto(FIXTURE_PATH);
  await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
  await settle(page, h).catch(() => undefined);
  await expect.poll(() => h.tileFailures.at(-1)).toBe(true);

  failing = false;
  await page.evaluate(() => (window as any).__handle.setSelected(["a-0"]));
  await expect.poll(() => h.tileFailures.at(-1), { timeout: 15_000 }).toBe(false);
});

test("SPEC-PD-001: tiles that keep failing are not requested again without a user action", async ({ page }) => {
  const h = await prepare(page);
  await page.route(`https://${TILE_HOST}/**`, (route) => route.fulfill({ status: 503 }));
  await page.goto(FIXTURE_PATH);
  await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
  await settle(page, h).catch(() => undefined);
  await expect.poll(() => h.tileFailures.at(-1)).toBe(true);

  // The notice is up and nothing moves the map. The checking idle may ask once
  // more; a request for every idle would be thousands in this time.
  await page.waitForTimeout(1500);
  const before = h.tileRequests().length;
  await page.waitForTimeout(5000);
  expect(h.tileRequests().length - before).toBeLessThanOrEqual(30);
});
