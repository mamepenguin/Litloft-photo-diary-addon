/**
 * Back from a photo into the Library and into a shelf page (SPEC-PD-019 I9,
 * 9.7): the depth left is the depth returned to, and a reload of the Library
 * returns to it as well. The photo is pressed where it sits on screen at that
 * depth, so nothing scrolls the page on the way in.
 */
import { expect, test, type Page } from "@playwright/test";
import { serveApi } from "./pageSupport";
import { prepare } from "./support";

const LIBRARY_PATH = "/page.html?view=library";
const SHELF_KEY = "2026-12";
const SHELVES = 12;
const PHOTOS = 12;

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Shelves tall enough that the page can be left at a depth. */
async function serveTallLibrary(page: Page) {
  await page.route("**/api/addons/photo_diary/library/shelves*", (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? 0);
    const keys = Array.from({ length: SHELVES }, (_, i) => `2026-${String(12 - i).padStart(2, "0")}`);
    const shelves =
      offset > 0
        ? []
        : keys.map((key) => ({ key, label: "", count: PHOTOS, file_ids: ids(`${key}-`, PHOTOS) }));
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shelves, total_shelves: keys.length }),
    });
  });
}

/** The centre of a photo that sits wholly inside the viewport right now. */
async function visiblePhoto(page: Page) {
  const point = await page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="?file="]')];
    const boxes = links
      .map((link) => link.getBoundingClientRect())
      .filter((box) => box.top > 100 && box.bottom < window.innerHeight - 20 && box.width > 0);
    if (boxes.length === 0) return null;
    const box = boxes[Math.floor(boxes.length / 2)];
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  expect(point, "a photo on screen at the depth").not.toBeNull();
  return point!;
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

const storedScrollY = (page: Page, key: string) =>
  page.evaluate((name) => {
    const raw = sessionStorage.getItem(name);
    if (raw === null) return null;
    const state = JSON.parse(raw) as { scrollY?: number; library?: { scrollY?: number } };
    return state.library?.scrollY ?? state.scrollY ?? null;
  }, key);

/** Scrolls with the wheel, as the viewer does: a browser sends each scroll to the page. */
async function scrollTo(page: Page, depth: number) {
  await page.mouse.move(10, 300);
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await scrollY(page);
    if (current === depth) return depth;
    await page.mouse.wheel(0, depth - current);
    await page.waitForTimeout(80);
  }
  expect(await scrollY(page)).toBe(depth);
  return depth;
}

async function openPhoto(page: Page) {
  const point = await visiblePhoto(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("#file-page")).toBeVisible();
}

test.describe("SPEC-PD-019 I9: Back from a photo", () => {
  test("I9: the Library comes back at the depth it was left at", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepare(page);
    await serveApi(page);
    await serveTallLibrary(page);
    await page.goto(LIBRARY_PATH);
    await expect(page.getByRole("link", { name: "See all" })).toHaveCount(SHELVES);

    const left = await scrollTo(page, 1200);

    await openPhoto(page);
    expect(await storedScrollY(page, "photo_diary:state:family")).toBe(left);

    await page.goBack();
    await expect(page.getByRole("link", { name: "See all" })).toHaveCount(SHELVES);
    await expect.poll(() => scrollY(page)).toBeGreaterThanOrEqual(left - 2);
    expect(await scrollY(page)).toBeLessThanOrEqual(left + 2);
  });

  test("I9: the shelf page comes back at the depth it was left at", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepare(page);
    await serveApi(page);
    await serveTallLibrary(page);
    await page.goto(LIBRARY_PATH);
    await page.getByRole("link", { name: "See all" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/shelf\\?by=month&key=${SHELF_KEY}`));
    await expect(page.getByTestId("tile").first()).toBeVisible();

    const left = await scrollTo(page, 1600);
    const photos = await page.getByTestId("tile").count();

    await openPhoto(page);
    expect(await storedScrollY(page, "photo_diary:shelf:family")).toBe(left);

    await page.goBack();
    await expect(page.getByTestId("tile")).toHaveCount(photos);
    await expect.poll(() => scrollY(page)).toBeGreaterThanOrEqual(left - 2);
    expect(await scrollY(page)).toBeLessThanOrEqual(left + 2);
  });

  test("I9: reloading the Library returns to the depth it was left at", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepare(page);
    await serveApi(page);
    await serveTallLibrary(page);
    await page.goto(LIBRARY_PATH);
    await expect(page.getByRole("link", { name: "See all" })).toHaveCount(SHELVES);

    const left = await scrollTo(page, 900);
    await page.reload();
    await expect(page.getByRole("link", { name: "See all" })).toHaveCount(SHELVES);
    await expect.poll(() => scrollY(page)).toBeGreaterThanOrEqual(left - 2);
    expect(await scrollY(page)).toBeLessThanOrEqual(left + 2);
  });
});
