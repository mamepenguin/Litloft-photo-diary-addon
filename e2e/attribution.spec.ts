import { expect, test } from "@playwright/test";
import { FIXTURE_PATH, createMap, prepare, same, settle } from "./support";

const ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';

test("SPEC-PD-004: the attribution stays visible at a narrow width after the map is touched", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const h = await prepare(page);
  await page.goto(FIXTURE_PATH);
  await createMap(page, {
    points: same("a", 2, 35.6812, 139.7671),
    center: [139.7671, 35.6812],
    zoom: 12,
    attribution: ATTRIBUTION,
  });
  await settle(page, h);

  const box = (await page.locator("#map").boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 340, { steps: 4 });
  await page.mouse.up();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(800);

  const link = page.getByRole("link", { name: "© OpenStreetMap contributors" });
  await expect(link).toBeVisible();
  await expect(link).toBeInViewport({ ratio: 1 });
});
