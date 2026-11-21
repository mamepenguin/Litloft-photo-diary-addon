/**
 * The Library's control row in Chromium (SPEC-PD-024 item 9, I13): the tag menu
 * and the two view menus as laid out, and no horizontal scroll, in ja and en.
 */
import { expect, test, type Page } from "@playwright/test";
import { serveApi } from "./pageSupport";
import { prepare } from "./support";

const PAGE_PATH = "/page.html";

const NAMES = {
  ja: { tag: "タグ: 指定なし", group: "分類: 撮影月", sort: "並び順: 新しい順", seeAll: "すべて見る" },
  en: { tag: "Tag: None specified", group: "Group By: Month taken", sort: "Sort By: Newest first", seeAll: "See all" },
} as const;

async function serveFilters(page: Page) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(
    (url) => /\/api\/drives\/[^/]+\/tag-counts(\/query)?$/.test(url.pathname),
    (route) => route.fulfill(json([{ name: "beach", count: 4 }])),
  );
  await page.route("**/api/drives/*/home-shortcuts", (route) => route.fulfill(json([])));
}

async function open(page: Page, width: number, locale: "ja" | "en") {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page);
  await serveApi(page);
  await serveFilters(page);
  await page.goto(`${PAGE_PATH}?view=library#${locale}`);
  const names = NAMES[locale];
  await expect(page.getByRole("link", { name: names.seeAll }).first()).toBeVisible();
  const tag = page.getByRole("button", { name: names.tag, exact: true });
  const group = page.getByRole("button", { name: names.group, exact: true });
  const sort = page.getByRole("button", { name: names.sort, exact: true });
  await expect(tag).toBeVisible();
  await expect(group).toBeVisible();
  await expect(sort).toBeVisible();
  return {
    tag: (await tag.boundingBox())!,
    group: (await group.boundingBox())!,
    sort: (await sort.boundingBox())!,
    row: await tag.evaluate((el, groupName) => {
      let node: HTMLElement | null = el as HTMLElement;
      const other = el.ownerDocument.querySelector(`[aria-label="${groupName}"]`)!;
      while (node && !node.contains(other)) node = node.parentElement;
      const r = node!.getBoundingClientRect();
      return { x: r.x, width: r.width };
    }, names.group),
  };
}

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    clientWidth: document.scrollingElement!.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

const middle = (b: { y: number; height: number }) => b.y + b.height / 2;

for (const locale of ["ja", "en"] as const) {
  test(`SPEC-PD-024 I13 at 390px (${locale}) the tag menu is alone on the first row in the left half, the view menus share the second at equal widths`, async ({
    page,
  }) => {
    const { tag, group, sort, row } = await open(page, 390, locale);
    expect(tag.x).toBeGreaterThanOrEqual(row.x - 0.5);
    expect(tag.x + tag.width).toBeLessThanOrEqual(row.x + row.width / 2 + 0.5);
    expect(group.y).toBeGreaterThanOrEqual(tag.y + tag.height - 0.5);
    expect(Math.abs(middle(group) - middle(sort))).toBeLessThanOrEqual(1);
    expect(Math.abs(group.width - sort.width)).toBeLessThanOrEqual(1);
    expect(sort.x).toBeGreaterThan(group.x);
    await noHorizontalScroll(page);
  });

  for (const width of [1024, 1280, 1440]) {
    test(`SPEC-PD-024 I13 at ${width}px (${locale}) the filter, a 20px gap, then the view menus on one line`, async ({
      page,
    }) => {
      const { tag, group, sort } = await open(page, width, locale);
      expect(Math.abs(middle(tag) - middle(group))).toBeLessThanOrEqual(1);
      expect(Math.abs(middle(group) - middle(sort))).toBeLessThanOrEqual(1);
      expect(Math.abs(group.x - (tag.x + tag.width) - 20)).toBeLessThanOrEqual(1);
      expect(sort.x).toBeGreaterThan(group.x + group.width - 0.5);
      await noHorizontalScroll(page);
    });
  }
}
