import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, TILE_URL, prepare, same, settle } from "./support";

const LIBRARY = "**/api/addons/photo_diary/assets/maplibre-gl-6.16.0.js*";

test("SPEC-PD-002: a map that failed to load the library loads it on the next try, and only once", async ({ page }) => {
  const h = await prepare(page);
  let failing = true;
  await page.route(LIBRARY, (route) => (failing ? route.abort() : route.fallback()));
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
  const libraryRequests = () => h.assetRequests().filter((url) => /maplibre-gl-[\d.]+\.js(\?|$)/.test(url));

  expect(await create()).not.toBe("created");
  expect(libraryRequests()).toHaveLength(1);

  failing = false;
  expect(await create()).toBe("created");
  expect(libraryRequests()).toHaveLength(2);
  await settle(page, h);

  // The loaded library is kept: another map asks for no file.
  expect(await create()).toBe("created");
  expect(libraryRequests()).toHaveLength(2);
});
