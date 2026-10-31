import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, TILE_HOST, TILE_URL, clickCentre, prepare, same, settle } from "./support";

const A: [number, number] = [139.7671, 35.6812];

test("SPEC-PD-001: a notice follows failing tiles, and points still answer meanwhile", async ({ page }) => {
  const h = await prepare(page);
  let failing = true;
  await page.route(`https://${TILE_HOST}/**`, (route) =>
    failing
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64",
          ),
        }),
  );
  const reports: boolean[] = [];
  await page.exposeFunction("__onTileFailure", (value: boolean) => void reports.push(value));
  await page.goto(FIXTURE_PATH);
  await page.evaluate(
    async (o) => {
      const w = window as any;
      await w.createPhotoMap(document.getElementById("map"), {
        points: o.points,
        tileUrl: o.tileUrl,
        attribution: "",
        center: o.center,
        zoom: 12,
        onPointClick: (ids: string[]) => w.__onPointClick(ids),
        onPointError: () => {},
        onTileFailureChange: (value: boolean) => w.__onTileFailure(value),
        onViewChange: () => {},
      });
    },
    { points: same("a", 3, 35.6812, 139.7671), tileUrl: TILE_URL, center: A },
  );
  await settle(page, h).catch(() => undefined);

  await expect.poll(() => reports.at(-1)).toBe(true);
  await clickCentre(page);
  await expect.poll(() => h.clicks.length).toBeGreaterThan(0);

  failing = false;
  const box = (await page.locator("#map").boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => reports.at(-1), { timeout: 15_000 }).toBe(false);
});
