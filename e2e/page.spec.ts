/**
 * The real page, in Chromium, with the network stood in for: what depends on
 * layout, scrolling and history, which a jsdom run cannot show.
 */
import { expect, test, type Page } from "@playwright/test";
import { BIG_DAY, addAppHeader, expectReachable, openPointList, serveApi } from "./pageSupport";
import { accentPixels, prepare, settle } from "./support";

const PAGE_PATH = "/page.html";

async function open(page: Page, query: string, hash = "") {
  const h = await prepare(page);
  await serveApi(page);
  await page.goto(`${PAGE_PATH}${query}${hash}`);
  return h;
}

const scrollToEnd = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

test.describe("the month picker stays inside the screen", () => {
  for (const [locale, hash, choose] of [
    ["en", "", "Choose month"],
    ["ja", "#ja", "月を選ぶ"],
  ] as const) {
    for (const width of [320, 360, 375, 390, 414, 430]) {
      test(`SPEC-PD-001: ${locale} at ${width} px wide`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await open(page, "?month=2026-09", hash);
        await page.getByRole("button", { name: choose }).click();
        const menu = page.locator("ul.absolute");
        await expect(menu).toBeVisible();

        const measured = await page.evaluate(() => {
          const list = document.querySelector("ul.absolute")!.getBoundingClientRect();
          const root = document.documentElement;
          const rows = [...document.querySelectorAll("ul.absolute button")].map((row) => {
            const box = row.getBoundingClientRect();
            return { right: box.right, clipped: row.scrollWidth > row.clientWidth };
          });
          return { left: list.left, right: list.right, width: root.clientWidth, scrollWidth: root.scrollWidth, rows };
        });
        expect(measured.left).toBeGreaterThanOrEqual(0);
        expect(measured.right).toBeLessThanOrEqual(measured.width);
        expect(measured.scrollWidth).toBe(measured.width);
        for (const row of measured.rows) {
          expect(row.clipped).toBe(false);
          expect(row.right).toBeLessThanOrEqual(measured.width);
        }
        await expect(menu.getByRole("button").first()).toBeInViewport({ ratio: 1 });
      });
    }
  }
});

test.describe("the list's close control stays reachable while the list scrolls", () => {
  for (const [name, size] of [
    ["desktop", { width: 1280, height: 800 }],
    ["phone", { width: 390, height: 800 }],
  ] as const) {
    test(`SPEC-PD-001: a day list on ${name}, under the app header`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, `?month=2026-09&date=${BIG_DAY}`);
      await expect(page.getByTestId("tile").first()).toBeVisible();
      await addAppHeader(page);
      await expectReachable(page, "Close");
      for (let i = 0; i < 3; i++) {
        await scrollToEnd(page);
        await page.waitForTimeout(400);
      }
      expect(await page.getByTestId("tile").count()).toBeGreaterThan(80);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
      await expectReachable(page, "Close");
    });

    test(`SPEC-PD-002: a point's list on ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      const h = await open(page, "?view=map");
      await settle(page, h);
      await openPointList(page);
      const panel = page.locator("div.overflow-y-auto", { has: page.getByRole("button", { name: "Close", exact: true }) });
      for (let i = 0; i < 3; i++) {
        await panel.evaluate((el) => (el.scrollTop = el.scrollHeight));
        await page.waitForTimeout(400);
      }
      expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
      await expectReachable(page, "Close");
    });
  }
});

test.describe("Back from a photo returns to where the list was scrolled", () => {
  for (const [name, size] of [
    ["desktop", { width: 1280, height: 800 }],
    ["phone", { width: 390, height: 800 }],
  ] as const) {
    test(`I6: a day list on ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, `?month=2026-09&date=${BIG_DAY}`);
      await expect(page.getByTestId("tile").first()).toBeVisible();
      for (let i = 0; i < 3; i++) {
        await scrollToEnd(page);
        await page.waitForTimeout(400);
      }
      const tiles = await page.getByTestId("tile").count();
      expect(tiles).toBeGreaterThan(80);
      await page.getByTestId("tile").nth(60).scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(1000);

      await page.getByTestId("tile").nth(60).click();
      await expect(page.locator("#file-page")).toBeVisible();
      await page.goBack();
      await expect(page.getByTestId("tile")).toHaveCount(tiles);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 5);
      expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before + 5);
    });
  }

  test("I6: a point's list on the map", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    await openPointList(page);
    const panel = page.locator("div.overflow-y-auto", { has: page.getByRole("button", { name: "Close", exact: true }) });
    for (let i = 0; i < 3; i++) {
      await panel.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await page.waitForTimeout(400);
    }
    const tiles = await page.getByTestId("tile").count();
    await page.getByTestId("tile").nth(50).scrollIntoViewIfNeeded();
    const before = await panel.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(500);

    await page.getByTestId("tile").nth(50).click();
    await expect(page.locator("#file-page")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("tile")).toHaveCount(tiles);
    await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(before - 5);
  });
});

test.describe("the month picker on a phone", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("SPEC-PD-001: every row can be pressed, and the menu is rounded-2xl", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, "?month=2026-09");
    await page.getByRole("button", { name: "Choose month" }).click();
    const rows = page.locator("ul.absolute button");
    await expect(rows.first()).toBeVisible();
    const heights = await rows.evaluateAll((all) => all.map((row) => row.getBoundingClientRect().height));
    expect(heights.length).toBe(8);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    expect(await page.locator("ul.absolute").evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("16px");
  });
});

test.describe("a URL with no query reached while the page stays mounted", () => {
  test("SPEC-PD-001: starts the page over, map and open list included", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    await openPointList(page);
    await expect(page.getByRole("button", { name: "Close", exact: true })).toBeVisible();

    // The navigation the sidebar row and Back make, to the page's own path.
    await page.evaluate(() => {
      window.history.pushState(null, "", window.location.pathname);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("tab", { name: "Calendar" })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("photo_diary:state:")))).toEqual([]);

    await page.getByRole("tab", { name: "Map" }).click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  });
});

test.describe("the selected point follows the open list", () => {
  test("SPEC-PD-002 design: accent while the list is open, after Back, and gone once it is closed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const h = await open(page, "?view=map");
    await settle(page, h);
    const canvas = page.locator("canvas").first();
    expect(await accentPixels(page, "centre", canvas)).toBe(0);

    await openPointList(page);
    await expect.poll(() => accentPixels(page, "centre", canvas), { timeout: 10_000 }).toBeGreaterThan(40);

    await page.getByTestId("tile").first().click();
    await expect(page.locator("#file-page")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await expect.poll(() => accentPixels(page, "centre", canvas), { timeout: 10_000 }).toBeGreaterThan(40);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect.poll(() => accentPixels(page, "centre", canvas), { timeout: 10_000 }).toBe(0);
  });
});
