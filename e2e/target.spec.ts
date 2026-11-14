/**
 * SPEC-PD-017 I10 and I12, measured in a real browser: where the header puts
 * the Target and the tabs, and the map's stage under the taller header.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { addAppHeader, SCOPE_COUNT, serveApi } from "./pageSupport";
import { prepare, settle } from "./support";

const PAGE_PATH = "/page.html";
const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const LONG_NAME = "Summer trip to the northern islands with the whole family and friends";

const folder = (id: string, name: string, query: string) => ({
  id,
  drive: "family",
  name,
  query,
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
});

async function open(page: Page, query: string, opts: { hash?: string; savedFolder?: { id: string; name: string } } = {}) {
  const h = await prepare(page);
  await serveApi(page);
  if (opts.savedFolder) {
    const f = folder(opts.savedFolder.id, opts.savedFolder.name, "tag:trip");
    await page.route("**/api/drives/*/smart-folders", (route) => route.fulfill(json([f])));
    await page.addInitScript((id) => localStorage.setItem("litloft.addon.photo_diary.target.family", id), f.id);
  }
  await page.goto(`${PAGE_PATH}${query}${opts.hash ?? ""}`);
  return h;
}

const box = async (l: Locator) => (await l.boundingBox())!;
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const target = (page: Page, label = "Target") => page.getByRole("button", { name: new RegExp(`^${label}: `) });
const stage = (page: Page) => page.locator("div[style*='100dvh']").first();
const whole = (l: Locator) => l.evaluate((el) => el.scrollWidth <= el.clientWidth);

test.describe("SPEC-PD-017 I10: the header at 640px and wider", () => {
  for (const width of [640, 1280]) {
    test(`at ${width}px the Target is at the title row's right end and the tabs are under it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "?month=2026-09");
      const t = target(page);
      await expect(t).toHaveAccessibleName("Target: All photos");
      await expect(page.locator("header")).toContainText(`family · ${SCOPE_COUNT} photos`);
      const titleBox = await box(title(page));
      const targetBox = await box(t);
      const headerBox = await box(page.locator("header"));
      const tabs = await box(page.getByRole("tablist"));
      expect(targetBox.y).toBeLessThan(titleBox.y + titleBox.height);
      expect(targetBox.y + targetBox.height).toBeGreaterThan(titleBox.y);
      expect(targetBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
      expect(headerBox.x + headerBox.width - (targetBox.x + targetBox.width)).toBeLessThan(33);
      expect(tabs.y).toBeGreaterThanOrEqual(Math.max(titleBox.y + titleBox.height, targetBox.y + targetBox.height) - 1);
    });
  }
});

test.describe("SPEC-PD-017 I10: the header below 640px", () => {
  for (const width of [375, 639]) {
    test(`at ${width}px the Japanese title is whole and alone, and the Target ends the scope line`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "?month=2026-09", { hash: "#ja" });
      const t = target(page, "対象");
      await expect(t).toHaveAccessibleName("対象: すべての写真");
      expect(await whole(title(page))).toBe(true);
      const titleBox = await box(title(page));
      const targetBox = await box(t);
      const scope = await box(page.locator("header").getByText("family", { exact: true }));
      const headerBox = await box(page.locator("header"));
      const tabs = await box(page.getByRole("tablist"));
      expect(targetBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
      expect(targetBox.y).toBeLessThan(scope.y + scope.height);
      expect(targetBox.y + targetBox.height).toBeGreaterThan(scope.y);
      expect(targetBox.x).toBeGreaterThan(scope.x + scope.width);
      expect(headerBox.x + headerBox.width - (targetBox.x + targetBox.width)).toBeLessThan(33);
      expect(tabs.y).toBeGreaterThanOrEqual(targetBox.y + targetBox.height - 1);
    });
  }

  test("at 375px a long folder name ends in an ellipsis inside the Target, and nothing overflows", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, "?month=2026-09", { hash: "#ja", savedFolder: { id: "sf-long", name: LONG_NAME } });
    const t = target(page, "対象");
    await expect(t).toHaveAccessibleName(`対象: ${LONG_NAME}`);
    expect(await whole(title(page))).toBe(true);
    const cut = await t.evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll("*"))].some(
        (node) => node.scrollWidth > node.clientWidth && getComputedStyle(node).textOverflow === "ellipsis",
      ),
    );
    expect(cut).toBe(true);
    const targetBox = await box(t);
    expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const count = page.locator("header").getByText(/^· \d+枚$/);
    await expect(count).toBeVisible();
    expect(await whole(count)).toBe(true);
    const titleBox = await box(title(page));
    expect(targetBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
  });
});

test.describe("SPEC-PD-017: the quiet Target", () => {
  for (const [width, hash, label] of [
    [1280, "", "Target"],
    [375, "#ja", "対象"],
  ] as const) {
    test(`at ${width}px it draws no ${label} label and no fill`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "?month=2026-09", { hash });
      const t = target(page, label);
      await expect(t).toBeVisible();
      expect(await t.textContent()).not.toContain(label);
      const fill = await t.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(fill);
    });
  }
});

async function addSidebar(page: Page, width = 256) {
  await page.evaluate((w) => {
    const root = document.getElementById("root")!;
    const shell = document.createElement("div");
    shell.style.cssText = "display:flex;align-items:flex-start";
    const aside = document.createElement("aside");
    aside.style.cssText = `flex:0 0 ${w}px;height:100dvh;position:sticky;top:0;background:#eee`;
    root.parentElement!.insertBefore(shell, root);
    shell.append(aside, root);
    root.style.cssText = "flex:1 1 0%;min-width:0";
    window.dispatchEvent(new Event("resize"));
  }, width);
}

test.describe("SPEC-PD-017 I12: the map's stage under the header", () => {
  const cases = [
    { width: 375, sidebar: false },
    { width: 768, sidebar: false },
    { width: 768, sidebar: true },
    { width: 1280, sidebar: false },
    { width: 1280, sidebar: true },
  ];
  for (const { width, sidebar } of cases) {
    test(`at ${width}px${sidebar ? " with the sidebar shown" : ""} it reaches the viewport's bottom, at least 24rem tall, under the tabs row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const h = await open(page, "?view=map");
      await addAppHeader(page);
      if (sidebar) await addSidebar(page);
      await settle(page, h);
      await expect.poll(async () => {
        const b = await stage(page).boundingBox();
        return b === null ? -1 : Math.round(b.y + b.height);
      }).toBe(800);
      const stageBox = await box(stage(page));
      expect(stageBox.height).toBeGreaterThanOrEqual(384);
      await expect(target(page)).toBeVisible();
      const tabs = await box(page.getByRole("tablist"));
      const titleBox = await box(title(page));
      const targetBox = await box(target(page));
      expect(tabs.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
      expect(tabs.y).toBeGreaterThanOrEqual(targetBox.y + targetBox.height - 1);
      expect(stageBox.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
    });
  }
});
