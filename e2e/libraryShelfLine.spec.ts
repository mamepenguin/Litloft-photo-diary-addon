/**
 * A Library shelf's photo line, over the addon's own PhotoShelf and the core's
 * FileGrid (SPEC-PD-019 I11, 9.4): one justified line at the photos' own
 * proportions that ends at the shelf's right edge, and a shelf whose photos
 * fit in one line left at the base height.
 */
import { expect, test, type Page } from "@playwright/test";
import { prepare } from "./support";

const SHELF_PATH = "/shelf.html";
const FULL_SHELVES = ["Dec 2024", "Nov 2024"];
const SHORT_SHELF = "Oct 2024";

type Measured = {
  title: string;
  drawn: number;
  rows: number;
  left: number;
  right: number;
  height: number;
  shelfLeft: number;
  shelfRight: number;
};

async function measure(page: Page): Promise<Measured[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("section")].map((section) => {
      const frame = section.getBoundingClientRect();
      const cells = [...section.querySelectorAll<HTMLElement>(".justified-grid-cell")].filter(
        (cell) => cell.getClientRects().length > 0,
      );
      const boxes = cells.map((cell) => cell.getBoundingClientRect());
      return {
        title: section.querySelector("h2")?.textContent?.trim() ?? "",
        drawn: boxes.length,
        rows: new Set(boxes.map((box) => Math.round(box.top))).size,
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
        height: Math.max(...boxes.map((box) => box.height)),
        shelfLeft: frame.left,
        shelfRight: frame.right,
      };
    }),
  );
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page);
  await page.goto(SHELF_PATH);
  await expect(page.locator(".justified-grid-cell").first()).toBeVisible();
  // The first-line pass runs in a layout effect and again from the observer.
  await expect.poll(async () => (await measure(page))[0].drawn).toBeLessThan(12);
  return measure(page);
}

test.describe("SPEC-PD-019 I11: a shelf's drawn line fills the shelf", () => {
  for (const width of [375, 768, 1280]) {
    test(`I11 at ${width}px: the line ends at the shelf's right edge, on one row, nothing cut`, async ({
      page,
    }) => {
      const shelves = await open(page, width);
      for (const title of FULL_SHELVES) {
        const shelf = shelves.find((entry) => entry.title === title)!;
        expect(shelf.drawn).toBeGreaterThanOrEqual(2);
        expect(shelf.drawn).toBeLessThan(12);
        expect(shelf.rows).toBe(1);
        expect(Math.abs(shelf.right - shelf.shelfRight)).toBeLessThanOrEqual(1);
        expect(shelf.left).toBeGreaterThanOrEqual(shelf.shelfLeft - 0.5);
        expect(shelf.right).toBeLessThanOrEqual(shelf.shelfRight + 0.5);
      }
    });

    test(`I11 at ${width}px: a shelf whose photos fit in one line keeps them at the base height`, async ({
      page,
    }) => {
      const shelves = await open(page, width);
      const shelf = shelves.find((entry) => entry.title === SHORT_SHELF)!;
      const base = width < 640 ? 120 : 200;
      expect(shelf.drawn).toBe(2);
      expect(shelf.rows).toBe(1);
      expect(Math.abs(shelf.height - base)).toBeLessThanOrEqual(1);
      expect(Math.abs(shelf.right - shelf.shelfRight)).toBeGreaterThan(1);
      expect(shelf.right).toBeLessThanOrEqual(shelf.shelfRight + 0.5);
    });
  }
});
