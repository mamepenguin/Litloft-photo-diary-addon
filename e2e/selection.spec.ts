import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_PATH, clickCentre, createMap, prepare, same, settle } from "./support";

const A: [number, number] = [139.7671, 35.6812];

// What the canvas shows, not what the style claims: a source that was given
// data it cannot draw still reports that data.
async function accentPixels(page: Page): Promise<number> {
  const box = (await page.locator("#map").boundingBox())!;
  const clip = { x: box.x + box.width / 2 - 30, y: box.y + box.height / 2 - 30, width: 60, height: 60 };
  const png = await page.screenshot({ clip });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 0xd6) < 12 && Math.abs(data[i + 1] - 0x30) < 12 && Math.abs(data[i + 2] - 0x31) < 12) count++;
    }
    return count;
  }, png.toString("base64"));
}

test.describe("the selected point is drawn in the accent colour", () => {
  for (const [name, points] of [
    ["a cluster", [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)]],
    ["a single photo", [...same("solo", 1, 35.6812, 139.7671), ...same("far", 3, 36, 140)]],
  ] as const) {
    test(`SPEC-PD-002 design: ${name} turns accent when clicked and the map stays idle`, async ({ page }) => {
      const h = await prepare(page);
      await page.goto(FIXTURE_PATH);
      await createMap(page, { points: [...points], center: A, zoom: 12 });
      await settle(page, h);
      expect(await accentPixels(page)).toBe(0);

      await clickCentre(page);
      await expect.poll(() => h.clicks.length).toBeGreaterThan(0);
      await expect.poll(() => accentPixels(page), { timeout: 10_000 }).toBeGreaterThan(40);

      // A map that keeps redrawing after it has settled is repainting the selection.
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
  }
});
