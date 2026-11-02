import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, TILE_URL, prepare, same } from "./support";

test.use({ launchOptions: { args: ["--disable-gpu", "--disable-3d-apis", "--disable-webgl", "--disable-webgl2"] } });

test("SPEC-PD-001: a browser without WebGL makes the map reject with WebGLUnavailableError", async ({ page }) => {
  const h = await prepare(page);
  await page.goto(FIXTURE_PATH);
  const outcome = await page.evaluate(async (o) => {
    const w = window as any;
    try {
      await w.createPhotoMap(document.getElementById("map"), {
        points: o.points,
        tileUrl: o.tileUrl,
        attribution: "",
            pinLabel: (count: number) => `${count} photos`,
        onPointClick: () => {},
        onPointError: () => {},
        onTileFailureChange: () => {},
        onViewChange: () => {},
      });
      return "created";
    } catch (error) {
      return (error as Error).name;
    }
  }, { points: same("a", 2, 35.6812, 139.7671), tileUrl: TILE_URL });
  expect(outcome).toBe("WebGLUnavailableError");
  expect(h.tileRequests()).toEqual([]);
});
