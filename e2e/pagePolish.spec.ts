/**
 * SPEC-PD-012, and the page-level promises of SPEC-PD-010 and SPEC-PD-011:
 * where the view switch sits, how tall the map is and what it touches, the
 * close control, and what the page asks the network for.
 */
import { expect, test, type Page } from "@playwright/test";
import { addAppHeader, expectReachable, openPointList, serveApi } from "./pageSupport";
import { accentBorders, prepare, resolveColour, settle, TILE_URL } from "./support";

const PAGE_PATH = "/page.html";
const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function open(page: Page, query: string, hash = "") {
  const h = await prepare(page);
  await serveApi(page);
  await page.goto(`${PAGE_PATH}${query}${hash}`);
  return h;
}

const stage = (page: Page) => page.locator("div[style*='100dvh']").first();
const frame = (page: Page) => page.locator("[data-page-frame]");

test.describe("SPEC-PD-012: the view switch", () => {
  test("is at the right end of the title row on a wide layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "?month=2026-09");
    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible();
    const tabBox = (await tabs.boundingBox())!;
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const pageFrame = (await frame(page).boundingBox())!;
    // The same row as the title, at the right end of the frame, inside its padding.
    expect(tabBox.y).toBeLessThan(title.y + title.height);
    expect(tabBox.y + tabBox.height).toBeGreaterThan(title.y);
    expect(Math.abs(tabBox.x + tabBox.width - (pageFrame.x + pageFrame.width - 16))).toBeLessThan(2);
  });

  test("stays in its own row on a narrow layout, and the Japanese title is whole", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, "?month=2026-09", "#ja");
    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible();
    const title = page.getByRole("heading", { level: 1 });
    const tabBox = (await tabs.boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    expect(tabBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test("changes place when the layout crosses 48 rem, with the view kept", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "?month=2026-09");
    await expect(page.getByRole("tablist")).toBeVisible();
    await page.setViewportSize({ width: 600, height: 800 });
    await expect.poll(async () => {
      // The tab list is made again in its new place, so it is absent for a moment.
      const t = await page.getByRole("tablist").boundingBox();
      const title = await page.getByRole("heading", { level: 1 }).boundingBox();
      return t !== null && title !== null && t.y >= title.y + title.height - 1;
    }).toBe(true);
    await expect(page.getByRole("tab", { name: "Calendar" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("SPEC-PD-012: the map's stage", () => {
  test("fills the column down to the bottom of the viewport, with no border, radius or side padding, and the document does not scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await addAppHeader(page);
    await settle(page, h);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    const box = (await stage(page).boundingBox())!;
    const pageFrame = (await frame(page).boundingBox())!;
    await expect.poll(async () => Math.round((await stage(page).boundingBox())!.y + (await stage(page).boundingBox())!.height)).toBe(800);
    expect(Math.abs(box.x - pageFrame.x)).toBeLessThan(1);
    expect(Math.abs(box.width - pageFrame.width)).toBeLessThan(1);
    const style = await stage(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, radius: s.borderTopLeftRadius };
    });
    expect(style).toEqual({ border: "0px", radius: "0px" });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
  });

  test("keeps its 24 rem floor on a short viewport, where the document scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    await expect.poll(async () => Math.round((await stage(page).boundingBox())!.height)).toBe(384);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(420);
  });

  test("follows a resize, and a resize made while the map was hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    const bottom = async () => Math.round((await stage(page).boundingBox())!.y + (await stage(page).boundingBox())!.height);
    await expect.poll(bottom).toBe(800);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await expect.poll(bottom).toBe(1000);

    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.getByRole("tab", { name: "Map" }).click();
    await expect.poll(bottom).toBe(700);
  });

  test("a banner above it shortens it, and it grows back when the banner goes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    const measure = async () => {
      const b = (await stage(page).boundingBox())!;
      return { top: Math.round(b.y), bottom: Math.round(b.y + b.height) };
    };
    const normal = await measure();
    expect(normal.bottom).toBe(800);

    let failing = true;
    await page.route("**/api/addons/photo_diary/points", (route) => (failing ? route.fulfill({ status: 500 }) : route.fallback()));
    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.getByRole("tab", { name: "Map" }).click();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect.poll(async () => (await measure()).top).toBeGreaterThan(normal.top);
    expect((await measure()).bottom).toBe(800);

    failing = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect.poll(async () => await measure()).toEqual(normal);
  });

  test("the phases that are not the map keep their padding", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepare(page);
    await serveApi(page);
    await page.route("**/api/addons/photo_diary/points", (route) => route.fulfill(json({ points: [] })));
    await page.goto(`${PAGE_PATH}?view=map`);
    await expect(page.getByText("No photos with a location")).toBeVisible();
    const root = page.getByText("No photos with a location").locator("xpath=ancestor::div[contains(@class,'group/diary')][1]");
    expect(await root.evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingBottom])).toEqual(["16px", "24px"]);
  });

  test("a narrow layout draws the map to the bottom as well, with the list sheet over it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    await expect.poll(async () => Math.round((await stage(page).boundingBox())!.y + (await stage(page).boundingBox())!.height)).toBe(800);
    await openPointList(page);
    const panel = page.locator("div.overflow-y-auto", { has: page.getByRole("button", { name: "Close", exact: true }) });
    await expect(panel).toBeVisible();
    // The sheet is above the pins: the point where the pin was is the sheet's.
    const pinBox = (await page.getByRole("button", { name: "100 photos" }).boundingBox())!;
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("div.overflow-y-auto") !== null, {
      x: pinBox.x + pinBox.width / 2,
      y: pinBox.y + pinBox.height / 2,
    });
    expect(hit).toBe(true);
  });
});

test.describe("SPEC-PD-012: the close control", () => {
  const closeOf = (page: Page) => page.getByRole("button", { name: "Close", exact: true });

  test("a day list's is an icon alone in the muted colour, at the right of the heading", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "?month=2026-09&date=2026-09-10");
    await expect(page.getByTestId("tile").first()).toBeVisible();
    const close = closeOf(page);
    expect(((await close.textContent()) ?? "").trim()).toBe("");
    await expect(close.locator("svg")).toHaveCount(1);
    expect(await close.evaluate((el) => getComputedStyle(el).color)).toBe(await resolveColour(page, "var(--text-muted)"));
    const heading = (await page.getByRole("heading", { name: /Sep 10, 2026/ }).boundingBox())!;
    const box = (await close.boundingBox())!;
    expect(box.x).toBeGreaterThan(heading.x + heading.width);
    await close.click();
    await expect(page.getByTestId("tile")).toHaveCount(0);
  });

  test("a point list's has the same shape", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    await openPointList(page);
    const close = closeOf(page);
    expect(((await close.textContent()) ?? "").trim()).toBe("");
    expect(await close.evaluate((el) => getComputedStyle(el).color)).toBe(await resolveColour(page, "var(--text-muted)"));
    await close.click();
    await expect.poll(() => accentBorders(page, "body")).toBe(0);
  });

  test.describe("on a coarse pointer", () => {
    test.use({ hasTouch: true, isMobile: true });
    test("its target is 44 px square", async ({ page }) => {
      await open(page, "?month=2026-09&date=2026-09-10");
      await expect(page.getByTestId("tile").first()).toBeVisible();
      const target = closeOf(page);
      const box = (await target.boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      for (const [dx, dy] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) {
        const hits = await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest("button")?.getAttribute("aria-label") ?? null;
          },
          { x: cx + dx, y: cy + dy },
        );
        expect(hits, `${dx},${dy}`).toBe("Close");
      }
      await expectReachable(page, "Close");
    });
  });

  test("the panel's heading row on the map does not take the strip's offset, under an app header", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const h = await open(page, "?view=map");
    await addAppHeader(page);
    await settle(page, h);
    await openPointList(page);
    const row = closeOf(page).locator("xpath=..");
    expect(await row.evaluate((el) => getComputedStyle(el).top)).toBe("0px");
    const panel = page.locator("div.overflow-y-auto", { has: closeOf(page) });
    expect(Math.round((await row.boundingBox())!.y - (await panel.boundingBox())!.y)).toBeLessThan(20);
  });

  test("the map's attribution and zoom buttons stay above the narrow sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const h = await prepare(page);
    await serveApi(page);
    await page.route("**/api/addons/photo_diary/map-config", (route) =>
      route.fulfill(json({ tile_url: TILE_URL, attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' })),
    );
    await page.goto(`${PAGE_PATH}?view=map`);
    await settle(page, h);
    await openPointList(page);
    const hits = await page.evaluate(() => {
      const hit = (el: Element | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return top === el || el.contains(top);
      };
      return {
        zoom: hit(document.querySelector(".maplibregl-ctrl-zoom-in")),
        attribution: hit(document.querySelector(".maplibregl-ctrl-attrib a")),
      };
    });
    expect(hits.zoom).toBe(true);
    expect(hits.attribution).toBe(true);
    const zoom = (await page.locator(".maplibregl-ctrl-zoom-in").boundingBox())!;
    const sheet = (await page.locator("div.overflow-y-auto", { has: closeOf(page) }).boundingBox())!;
    expect(zoom.y + zoom.height).toBeLessThan(sheet.y);
    const attribution = (await page.locator(".maplibregl-ctrl-attrib a").boundingBox())!;
    expect(attribution.y + attribution.height).toBeLessThan(sheet.y);
  });
});

test.describe("SPEC-PD-010 I7: what the page asks the network for", () => {
  test("the calendar alone asks for no tile and no map file", async ({ page }) => {
    const h = await open(page, "?month=2026-09&date=2026-09-10");
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await page.waitForTimeout(1200);
    expect(h.tileRequests()).toEqual([]);
    expect(h.assetRequests()).toEqual([]);
  });

  test("a drive with no located photos asks for none either", async ({ page }) => {
    const h = await prepare(page);
    await serveApi(page);
    await page.route("**/api/addons/photo_diary/points", (route) => route.fulfill(json({ points: [] })));
    await page.goto(`${PAGE_PATH}?view=map`);
    await expect(page.getByText("No photos with a location")).toBeVisible();
    await page.waitForTimeout(1200);
    expect(h.tileRequests()).toEqual([]);
    expect(h.assetRequests()).toEqual([]);
  });

  test("the map page contacts its own origin and the tile server, and nothing else", async ({ page }) => {
    const h = await open(page, "?view=map");
    await settle(page, h);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await page.waitForTimeout(800);
    const hosts = new Set(h.requests.map((r) => new URL(r.url).hostname));
    expect([...hosts].sort()).toEqual(["127.0.0.1", "tiles.example.test"]);
  });
});

test.describe("SPEC-PD-010 I8: the theme with the page open", () => {
  test("a change of theme leaves the open list and the view as they were", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    await openPointList(page);
    const url = page.url();
    const requests = h.tileRequests().length;
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(url);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    expect(h.tileRequests().length).toBe(requests);
  });
});

test.describe("SPEC-PD-011: pins across a view switch", () => {
  test("a pin and its image are kept, and not asked for again, when the map comes back on screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await prepare(page);
    await serveApi(page);
    // 0.05 degrees is 70 px or so at the zoom the points are fitted to: 25 separate pins.
    const points = Array.from({ length: 25 }, (_, i) => ({
      file_id: `s${i}`,
      lat: 35.6 + Math.floor(i / 5) * 0.05,
      lon: 139.6 + (i % 5) * 0.05,
      taken_at: "2026-09-10T10:00:00",
    }));
    await page.route("**/api/addons/photo_diary/points", (route) => route.fulfill(json({ points })));
    await page.goto(`${PAGE_PATH}?view=map`);
    await settle(page, h);
    const pins = page.locator("canvas").first().locator("xpath=ancestor::div[contains(@class,'maplibregl-map')]").locator("button:has(img)");
    await expect.poll(() => pins.count()).toBeGreaterThanOrEqual(20);
    await page.waitForFunction(() => [...document.querySelectorAll("button img")].every((i) => (i as HTMLImageElement).complete));
    const count = await pins.count();
    await pins.evaluateAll((all) => all.forEach((el, i) => ((el as any).__id = i)));
    const requests = h.thumbnailRequests().length;

    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.getByRole("tab", { name: "Map" }).click();
    await page.waitForTimeout(800);
    expect(await pins.count()).toBe(count);
    expect(await pins.evaluateAll((all) => all.filter((el) => (el as any).__id !== undefined).length)).toBe(count);
    expect(h.thumbnailRequests().length).toBe(requests);
  });
});

test.describe("SPEC-PD-011: pins that are outside what a hidden map's tiles cover", () => {
  test("none is re-created when the map comes back on screen, and no thumbnail is asked for again", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await prepare(page);
    await serveApi(page);
    // A grid wider than the 400 by 300 view a hidden map keeps tiles for.
    const points = Array.from({ length: 2400 }, (_, i) => ({
      file_id: `g${i}`,
      lat: 35.5 + Math.floor(i / 60) * 0.015,
      lon: 139.3 + (i % 60) * 0.013,
      taken_at: "2026-09-10T10:00:00",
    }));
    await page.route("**/api/addons/photo_diary/points", (route) => route.fulfill(json({ points })));
    await page.goto(`${PAGE_PATH}?view=map`);
    await settle(page, h);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1500);
    const pins = page.locator(".maplibregl-map button:has(img)");
    await expect.poll(() => pins.count()).toBeGreaterThan(30);
    await page.waitForFunction(() => [...document.querySelectorAll("button img")].every((i) => (i as HTMLImageElement).complete));
    await pins.evaluateAll((all) => all.forEach((el) => ((el as any).__kept = true)));
    const before = await pins.count();
    const requests = h.thumbnailRequests().length;
    await page.evaluate(() => {
      (window as any).__removed = 0;
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.removedNodes) if ((n as Element).matches?.("button")) (window as any).__removed++;
      }).observe(document.querySelector(".maplibregl-map")!, { childList: true, subtree: true });
    });

    // A slow main thread, as a phone's: the map's own resize observer then runs
    // before the page's effects do, which a fast one hides.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    for (let round = 0; round < 3; round++) {
      await page.getByRole("tab", { name: "Calendar" }).click();
      await page.waitForTimeout(800);
      await page.getByRole("tab", { name: "Map" }).click();
      await page.waitForTimeout(2500);
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(await page.evaluate(() => (window as any).__removed)).toBe(0);
    expect(await pins.count()).toBe(before);
    expect(await pins.evaluateAll((all) => all.filter((el) => (el as any).__kept).length)).toBe(before);
    expect(h.thumbnailRequests().length).toBe(requests);
  });
});
