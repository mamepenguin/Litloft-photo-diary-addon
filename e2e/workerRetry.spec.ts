import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, TILE_URL, prepare, same } from "./support";

const WORKER = "**/api/addons/photo_diary/assets/maplibre-gl-worker-6.16.0.js*";

test("SPEC-PD-002: a map whose worker file failed to load reports it, and loads on the next try", async ({ page }) => {
  const h = await prepare(page);
  let failing = true;
  await page.route(WORKER, (route) => (failing ? route.abort() : route.fallback()));
  await page.goto(FIXTURE_PATH);

  const create = () =>
    page.evaluate(
      async (o) => {
        const w = window as any;
        try {
          await w.createPhotoMap(document.getElementById("map"), {
            points: o.points,
            tileUrl: o.tileUrl,
            attribution: "",
            center: o.center,
            zoom: 12,
            onPointClick: () => {},
            onPointError: () => {},
            onTileFailureChange: () => {},
            onViewChange: () => {},
          });
          return "created";
        } catch (error) {
          return (error as Error).name;
        }
      },
      { points: same("a", 2, 35.6812, 139.7671), tileUrl: TILE_URL, center: [139.7671, 35.6812] as [number, number] },
    );
  const workerRequests = () => h.assetRequests().filter((url) => /maplibre-gl-worker-[\d.]+\.js(\?|$)/.test(url));

  expect(await create()).not.toBe("created");
  expect(workerRequests().some((url) => !url.includes("?"))).toBe(true);

  // A failed worker is asked for again under another URL, which the network
  // answers; the browser would answer the failed one from memory.
  const before = workerRequests().length;
  expect(await create()).not.toBe("created");
  expect(workerRequests().slice(before).some((url) => url.includes("?retry="))).toBe(true);

  failing = false;
  expect(await create()).toBe("created");
  await expect(page.locator("canvas").first()).toBeVisible();
});
