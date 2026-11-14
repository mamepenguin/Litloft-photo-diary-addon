/**
 * The Library face in Chromium, with the network stood in for (SPEC-PD-019):
 * the controls row and the shelf heading row as laid out, and no map tile.
 * The fixture's FileGrid is a stand-in, so the photo line itself is not
 * measured here.
 */
import { expect, test, type Page } from "@playwright/test";
import { serveApi } from "./pageSupport";
import { prepare } from "./support";

const PAGE_PATH = "/page.html";
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

async function serveLibrary(page: Page) {
  await page.route("**/api/addons/photo_diary/library/shelves*", (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? 0);
    const shelves =
      offset > 0
        ? []
        : ["2026-09", "2026-08", "2026-06"].map((key) => ({ key, label: "", count: 5, file_ids: ids(`${key}-`, 5) }));
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shelves, total_shelves: 3 }),
    });
  });
}

async function open(page: Page, query: string, hash = "#ja") {
  const h = await prepare(page);
  await serveApi(page);
  await serveLibrary(page);
  await page.goto(`${PAGE_PATH}${query}${hash}`);
  await expect(page.getByRole("link", { name: hash === "#ja" ? "すべて見る" : "See all" })).toHaveCount(3);
  return h;
}

const box = async (page: Page, locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;

test.describe("SPEC-PD-019 9.4: the controls row", () => {
  test("SPEC-PD-019 at 375 px the classification shows its value without 分類, and both buttons are 44 px tall", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, "?view=library");
    const classification = page.getByRole("button", { name: /撮影月/ });
    const sort = page.getByRole("button", { name: "並べ替え: 新しい順" });
    await expect(classification).toBeVisible();
    await expect(sort).toBeVisible();
    expect(await classification.innerText()).not.toContain("分類");
    expect(await classification.innerText()).toContain("撮影月");
    expect((await box(page, classification)).height).toBeGreaterThanOrEqual(44);
    expect((await box(page, sort)).height).toBeGreaterThanOrEqual(44);
    const sortText = await sort.innerText();
    expect(sortText).toContain("新しい順");
    expect(sortText).not.toContain("並べ替え");
  });

  for (const width of [640, 768, 1280]) {
    test(`SPEC-PD-019 at ${width} px the classification shows 分類 and its value`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "?view=library");
      const text = await page.getByRole("button", { name: /撮影月/ }).innerText();
      expect(text).toContain("分類");
      expect(text).toContain("撮影月");
      expect(await page.getByRole("button", { name: "並べ替え: 新しい順" }).innerText()).not.toContain("並べ替え");
    });
  }

  for (const width of [375, 768, 1280]) {
    test(`SPEC-PD-019 at ${width} px: tabs row, then the controls row on one line, then the shelves`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "?view=library");
      const tabs = await box(page, page.getByRole("tablist"));
      const classification = await box(page, page.getByRole("button", { name: /撮影月/ }));
      const sort = await box(page, page.getByRole("button", { name: "並べ替え: 新しい順" }));
      const firstSeeAll = await box(page, page.getByRole("link", { name: "すべて見る" }).first());
      expect(classification.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
      expect(Math.abs(classification.y + classification.height / 2 - (sort.y + sort.height / 2))).toBeLessThanOrEqual(2);
      expect(firstSeeAll.y).toBeGreaterThanOrEqual(Math.max(classification.y + classification.height, sort.y + sort.height) - 1);
      const tabNames = await page.getByRole("tab").allInnerTexts();
      expect(tabNames).toEqual(["ライブラリ", "カレンダー", "地図"]);
    });
  }
});

test.describe("SPEC-PD-019 9.4: a shelf's heading row", () => {
  for (const width of [375, 1280]) {
    test(`SPEC-PD-019 at ${width} px the title, the count and See all share a row, See all at its right end`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "?view=library");
      const title = await box(page, page.getByText("2026年9月", { exact: true }));
      const seeAll = await box(page, page.getByRole("link", { name: "すべて見る" }).first());
      const grid = await box(page, page.getByTestId("tile").first().locator(".."));
      expect(seeAll.x).toBeGreaterThan(title.x + title.width);
      expect(seeAll.y).toBeLessThan(title.y + title.height);
      expect(seeAll.y + seeAll.height).toBeGreaterThan(title.y);
      expect(Math.abs(seeAll.x + seeAll.width - (grid.x + grid.width))).toBeLessThanOrEqual(2);
      expect(seeAll.y + seeAll.height).toBeLessThanOrEqual(grid.y + 1);
    });
  }
});

test.describe("SPEC-PD-019 I12: no map tile", () => {
  test("SPEC-PD-019 opening Photo Diary with no query lands on the Library and requests no map tile", async ({ page }) => {
    const h = await open(page, "");
    expect(new URL(page.url()).search).toBe("?view=library");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    expect(h.tileRequests()).toEqual([]);
  });
});
