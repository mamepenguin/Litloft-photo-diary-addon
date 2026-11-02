import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_PATH, createMap, prepare, settle } from "./support";

const CENTER: [number, number] = [139.7671, 35.6812];

async function openMap(page: Page) {
  const harness = await prepare(page);
  // The wrapper exposes the library instance only inside this routed test asset.
  await page.route(/\/api\/addons\/photo_diary\/assets\/maplibre-gl-\d[^/]*\.js(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("original")) return route.fallback();
    url.searchParams.set("original", "1");
    await route.fulfill({ contentType: "text/javascript", body: `
      export * from ${JSON.stringify(url.href)};
      import { Map as OriginalMap } from ${JSON.stringify(url.href)};
      export class Map extends OriginalMap {
        constructor(options) { super(options); window.__testMap = this; }
      }
      export { Map as MapLibreMap };
    ` });
  });
  await page.goto(FIXTURE_PATH);
  await createMap(page, { points: [], center: CENTER, zoom: 12 });
  await settle(page, harness);
  return harness;
}

const view = (page: Page) => page.evaluate(() => {
  const map = (window as any).__testMap;
  return { bearing: map.getBearing(), zoom: map.getZoom(), center: map.getCenter().toArray(), moving: map.isMoving() };
});

async function stopped(page: Page) {
  await expect.poll(async () => (await view(page)).moving).toBe(false);
}

async function north(page: Page) {
  await stopped(page);
  expect((await view(page)).bearing).toBeCloseTo(0, 6);
}

async function drag(page: Page, button: "left" | "right" = "left", ctrl = false) {
  const box = (await page.locator("#map canvas").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (ctrl) await page.keyboard.down("Control");
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + 180, y + 60, { steps: 12 });
  await page.mouse.up({ button });
  if (ctrl) await page.keyboard.up("Control");
  await stopped(page);
}

async function twoFinger(page: Page, twist: boolean) {
  const session = await page.context().newCDPSession(page);
  const box = (await page.locator("#map canvas").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const points = (progress: number) => {
    const angle = twist ? progress * Math.PI / 3 : 0;
    const radius = twist ? 85 : 55 + progress * 90;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    return [{ x: x - dx, y: y - dy, id: 1 }, { x: x + dx, y: y + dy, id: 2 }];
  };
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
    for (let i = 1; i <= 12; i++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(i / 12) });
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await stopped(page);
  } finally {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await session.detach();
  }
}

for (const gesture of ["right drag", "Ctrl drag", "Shift arrows", "two-finger twist"]) {
  test(`SPEC-PD-014: north remains up after ${gesture}`, async ({ page }) => {
    await openMap(page);
    await north(page);
    if (gesture === "right drag") await drag(page, "right");
    if (gesture === "Ctrl drag") await drag(page, "left", true);
    if (gesture === "Shift arrows") {
      await page.locator("#map canvas").focus();
      await page.keyboard.press("Shift+ArrowLeft");
      await north(page);
      await page.keyboard.press("Shift+ArrowRight");
    }
    if (gesture === "two-finger twist") await twoFinger(page, true);
    await north(page);
  });
}

test("SPEC-PD-014: mouse and keyboard panning and zooming remain available", async ({ page }) => {
  await openMap(page);
  let before = await view(page);
  await drag(page);
  expect((await view(page)).center[0]).toBeLessThan(before.center[0]);
  await page.locator("#map canvas").focus();
  before = await view(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await view(page)).center[0]).toBeGreaterThan(before.center[0]);
  await stopped(page);
  before = await view(page);
  await page.keyboard.press("+");
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(before.zoom + 0.5);
  await stopped(page);
  before = await view(page);
  await page.mouse.wheel(0, -450);
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(before.zoom + 0.1);
  await stopped(page);
  before = await view(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(before.zoom + 0.5);
  await stopped(page);
  before = await view(page);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(async () => (await view(page)).zoom).toBeLessThan(before.zoom - 0.5);
  await north(page);
});

test("SPEC-PD-014: a two-finger pinch still zooms with north up", async ({ page }) => {
  await openMap(page);
  const before = await view(page);
  await twoFinger(page, false);
  expect((await view(page)).zoom).toBeGreaterThan(before.zoom + 0.5);
  await north(page);
});

test("SPEC-PD-014: north stays fixed through theme changes, hiding, resuming and recreation", async ({ page }) => {
  const harness = await openMap(page);
  for (const state of ["theme", "resume", "recreate"]) {
    await test.step(state, async () => {
      if (state === "theme") await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      if (state === "resume") {
        await page.evaluate(() => {
          (window as any).__handle.pause();
          document.getElementById("map")!.style.display = "none";
          document.documentElement.dataset.theme = "light";
        });
        await expect(page.locator("#map")).toBeHidden();
        await page.evaluate(() => {
          document.getElementById("map")!.style.display = "";
          (window as any).__handle.resume();
        });
      }
      if (state === "recreate") {
        await page.evaluate(() => (window as any).__handle.destroy());
        await createMap(page, { points: [], center: CENTER, zoom: 12 });
        await settle(page, harness);
      }
      await page.locator("#map canvas").focus();
      await page.keyboard.press("Shift+ArrowLeft");
      await north(page);
    });
  }
});
