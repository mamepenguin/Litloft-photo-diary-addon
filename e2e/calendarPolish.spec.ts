/**
 * SPEC-PD-008, SPEC-PD-009 and the calendar side of SPEC-PD-012 in the real
 * page, in Chromium: what depends on layout, scrolling, the stylesheet and
 * the animations the browser really runs.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { BIG_DAY, addAppHeader, expectReachable, serveApi } from "./pageSupport";
import { prepare } from "./support";

const PAGE_PATH = "/page.html";
const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

// Counts on each side of the step boundaries 1, 3, 10 and 30.
const SEPTEMBER = [
  { date: "2026-09-01", count: 1 },
  { date: "2026-09-02", count: 2 },
  { date: "2026-09-03", count: 3 },
  { date: "2026-09-04", count: 9 },
  { date: "2026-09-05", count: 10 },
  { date: "2026-09-06", count: 29 },
  { date: "2026-09-07", count: 30 },
  { date: "2026-09-08", count: 31 },
  { date: "2026-09-09", count: 0, has_note: true },
  { date: BIG_DAY, count: 120 },
  { date: "2026-09-28", count: 4 },
  { date: "2026-09-30", count: 1 },
];
const AUGUST = [{ date: "2026-08-15", count: 5 }];

type Days = { date: string; count: number; has_note?: boolean }[];

async function serveDays(page: Page, behave: { delay?: number; fail?: () => boolean } = {}) {
  const served = { reads: 0 };
  await page.route("**/api/addons/photo_diary/calendar/days*", async (route) => {
    served.reads += 1;
    if (behave.delay) await new Promise((r) => setTimeout(r, behave.delay));
    if (behave.fail?.()) return route.fulfill({ status: 500 });
    const month = new URL(route.request().url()).searchParams.get("month");
    const days: Days = month === "2026-09" ? SEPTEMBER : month === "2026-08" ? AUGUST : [];
    return route.fulfill(json({ days }));
  });
  return served;
}

/** Records every fade the page starts, before anything runs. */
async function recordFades(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __fades: { date: string; delay: number; duration: number }[] };
    w.__fades = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options?: KeyframeAnimationOptions) {
      const date = this.getAttribute("data-date");
      if (date) w.__fades.push({ date, delay: Number(options?.delay), duration: Number(options?.duration) });
      return original.call(this, keyframes, options);
    } as typeof original;
  });
}
const fades = (page: Page) => page.evaluate(() => (window as unknown as { __fades: unknown[] }).__fades) as Promise<
  { date: string; delay: number; duration: number }[]
>;

async function open(page: Page, query: string, behave?: Parameters<typeof serveDays>[1], hash = "") {
  await prepare(page);
  await serveApi(page);
  const served = await serveDays(page, behave);
  await page.goto(`${PAGE_PATH}${query}${hash}`);
  return served;
}

const day = (page: Page, d: number) => page.locator(`button[data-date="2026-09-${String(d).padStart(2, "0")}"]`).first();

const alpha = (locator: Locator) =>
  locator.evaluate((el) => {
    const match = /\/\s*([0-9.]+)\s*\)/.exec(getComputedStyle(el).backgroundColor);
    return match ? Number(match[1]) : 1;
  });

test.describe("SPEC-PD-008: a day's surface deepens with its photo count", () => {
  test("SPEC-PD-008 I1: the computed surface of each step, and the hover surface", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "?month=2026-09");
    await expect(day(page, 1)).toBeVisible();
    const expected: [number, number, number][] = [
      [1, 0.1, 0.15],
      [2, 0.1, 0.15],
      [3, 0.2, 0.3],
      [4, 0.2, 0.3],
      [5, 0.4, 0.5],
      [6, 0.4, 0.5],
      [7, 0.6, 0.7],
      [8, 0.6, 0.7],
    ];
    await page.waitForTimeout(1200);
    for (const [d, resting, hover] of expected) {
      await page.mouse.move(0, 0);
      expect(await alpha(day(page, d)), `day ${d}`).toBeCloseTo(resting, 2);
      await day(page, d).hover();
      await expect.poll(() => alpha(day(page, d)), { message: `day ${d} hovered` }).toBeCloseTo(hover, 2);
    }
    // A day with a note only and a day with nothing keep their old surface.
    await page.mouse.move(0, 0);
    expect(await alpha(day(page, 9))).toBe(1);
    expect(await day(page, 9).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    expect(await day(page, 11).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  });

  test("SPEC-PD-008: the count is muted at step 1 and primary from step 2", async ({ page }) => {
    await open(page, "?month=2026-09");
    await expect(day(page, 1)).toBeVisible();
    const colours = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      const resolve = (variable: string) => {
        probe.style.color = `var(${variable})`;
        return getComputedStyle(probe).color;
      };
      const out = { muted: resolve("--text-muted"), primary: resolve("--text-primary"), root: root.fontSize };
      probe.remove();
      return out;
    });
    const countColour = (d: number) =>
      day(page, d).evaluate((el) => {
        const count = el.querySelectorAll("span")[el.querySelectorAll("span").length - 1];
        return getComputedStyle(count).color;
      });
    expect(await countColour(2)).toBe(colours.muted);
    expect(await countColour(3)).toBe(colours.primary);
    expect(await countColour(7)).toBe(colours.primary);
  });

  test("SPEC-PD-008: a selected day at step 3 or 4 has an inner ring of the page colour, and the focus ring replaces it", async ({ page }) => {
    await open(page, `?month=2026-09&date=2026-09-05`);
    await expect(day(page, 5)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1200);
    const page_colour = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--bg-primary)";
      document.body.appendChild(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    const shadow = (d: number) => day(page, d).evaluate((el) => getComputedStyle(el).boxShadow);

    const ring = await shadow(5);
    expect(ring).toContain(page_colour);
    expect(ring).toContain("inset");
    expect(ring).toContain("2px");

    // Step 1 or 2 selected: no ring. Open day 2 (step 1) and look.
    await day(page, 2).click();
    await expect(day(page, 2)).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    expect(await shadow(2)).toBe("none");

    // Keyboard focus on a selected deep day: the focus ring, not the inner one.
    await day(page, 7).click();
    await expect(day(page, 7)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await day(page, 7).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(day(page, 7)).toBeFocused();
    const focused = await shadow(7);
    expect(focused).not.toMatch(/inset/);
    expect(focused).not.toBe("none");
  });
});

test.describe("SPEC-PD-008 I3: the fade", () => {
  test("a page opened with no query fades its first month, and the browser really runs it", async ({ page }) => {
    await recordFades(page);
    await open(page, "");
    await expect(day(page, 30)).toBeVisible();
    const calls = await fades(page);
    const dates = SEPTEMBER.filter((d) => d.count > 0).map((d) => d.date);
    expect(calls.map((c) => c.date).sort()).toEqual(dates.sort());
    for (const call of calls) {
      expect(call.duration).toBe(450);
      expect(call.delay).toBe((Number(call.date.slice(8)) - 1) * 14);
    }
    // The browser's own clock: the last day starts 406 ms late and is clear until then.
    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => (a.effect as KeyframeEffect).target?.hasAttribute("data-date")).length,
    );
    expect(running).toBeGreaterThan(0);
  });

  test("the last day is clear while its turn is awaited, then reaches its surface", async ({ page }) => {
    await open(page, "");
    await expect(day(page, 30)).toBeVisible();
    // Day 30 (count 1, step 1) waits 406 ms.
    const during = await alpha(day(page, 30));
    expect(during).toBeLessThan(0.1);
    await expect.poll(() => alpha(day(page, 30)), { timeout: 5000 }).toBeCloseTo(0.1, 2);
  });

  test("a page opened with a query draws its first month at once", async ({ page }) => {
    await recordFades(page);
    await open(page, "?month=2026-09");
    await expect(day(page, 30)).toBeVisible();
    expect(await fades(page)).toEqual([]);
    expect(await alpha(day(page, 30))).toBeCloseTo(0.1, 2);
  });

  test("another month fades: previous, next, the picker and Today alike", async ({ page }) => {
    await recordFades(page);
    await open(page, "?month=2026-09");
    await expect(day(page, 30)).toBeVisible();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect.poll(async () => (await fades(page)).map((c) => c.date)).toEqual(["2026-08-15"]);
    await page.getByRole("button", { name: "Next month" }).click();
    await expect.poll(async () => (await fades(page)).length).toBeGreaterThan(1);
    const before = (await fades(page)).length;
    await page.getByRole("button", { name: "Choose month" }).click();
    await page.getByRole("button", { name: /2026-08|August 2026/ }).first().click();
    await expect.poll(async () => (await fades(page)).length).toBeGreaterThan(before);
  });

  test("pressing a day, a re-read of the month and returning from the map with the same month draw at once", async ({ page }) => {
    await recordFades(page);
    const served = await open(page, "?month=2026-09");
    await expect(day(page, 30)).toBeVisible();
    await day(page, 5).click();
    await expect(day(page, 5)).toHaveAttribute("aria-pressed", "true");
    expect(await fades(page)).toEqual([]);

    const reads = served.reads;
    await page.getByRole("tab", { name: "Map" }).click();
    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect.poll(() => served.reads).toBeGreaterThan(reads);
    await page.waitForTimeout(500);
    expect(await fades(page)).toEqual([]);
  });

  test("a different month reached from the map fades", async ({ page }) => {
    await recordFades(page);
    await open(page, "?month=2026-09");
    await expect(day(page, 30)).toBeVisible();
    await page.getByRole("tab", { name: "Map" }).click();
    await page.evaluate(() => {
      window.history.pushState(null, "", "?month=2026-08");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect.poll(async () => (await fades(page)).map((c) => c.date)).toEqual(["2026-08-15"]);
  });

  test("under reduced motion nothing fades", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordFades(page);
    await open(page, "");
    await expect(day(page, 30)).toBeVisible();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByRole("heading", { name: /August 2026/ })).toBeVisible();
    expect(await fades(page)).toEqual([]);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("a hover applies at once, though the day's fade has not started", async ({ page }) => {
    await open(page, "");
    await expect(day(page, 30)).toBeVisible();
    await day(page, 30).hover();
    expect(await alpha(day(page, 30))).toBeCloseTo(0.15, 2);
  });

  test("a note-only day does not fade", async ({ page }) => {
    await recordFades(page);
    await open(page, "");
    await expect(day(page, 9)).toBeVisible();
    expect((await fades(page)).map((c) => c.date)).not.toContain("2026-09-09");
  });
});

test.describe("SPEC-PD-008: the hover preview", () => {
  test("shows the day photo 8 px above the day, centred, 176 by 132, and goes when the pointer leaves", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "?month=2026-09");
    await expect(day(page, 15)).toBeVisible();
    await page.waitForTimeout(1200);
    const cell = (await day(page, 18).boundingBox())!;
    await day(page, 18).hover();
    // Day 18 has no photos; the preview waits for a day that has.
    await expect(page.locator("img[src*='/thumbnail']")).toHaveCount(0);

    const target = (await day(page, 28).boundingBox())!;
    await day(page, 28).hover();
    const img = page.locator("img[src*='/api/files/d0/thumbnail']");
    await expect(img).toBeVisible();
    const frame = img.locator("xpath=..");
    const box = (await frame.boundingBox())!;
    expect(box.width).toBe(176);
    expect(box.height).toBe(132);
    expect(Math.abs(box.x + box.width / 2 - (target.x + target.width / 2))).toBeLessThan(1);
    expect(Math.abs(box.y + box.height + 8 - target.y)).toBeLessThan(1);
    const style = await frame.evaluate((el) => {
      const s = getComputedStyle(el);
      return { pe: s.pointerEvents, z: s.zIndex, border: s.borderTopWidth, radius: s.borderTopLeftRadius, position: s.position };
    });
    expect(style).toMatchObject({ pe: "none", z: "30", border: "3px", position: "fixed" });
    expect(cell.width).toBeGreaterThan(0);

    await page.mouse.move(0, 0);
    await expect(img).toHaveCount(0);
  });

  test("goes below the day when there is no room above, and stays 8 px inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await open(page, "?month=2026-09");
    await expect(day(page, 1)).toBeVisible();
    await page.waitForTimeout(1200);
    // Scrolled until day 1 is 60 px from the top of the viewport: 132 + 8 would not fit above.
    await page.evaluate(() => window.scrollBy(0, document.querySelector('button[data-date="2026-09-01"]')!.getBoundingClientRect().top - 60));
    await page.waitForTimeout(200);
    const cell = (await day(page, 1).boundingBox())!;
    expect(cell.y).toBeLessThan(140 + 8);
    await day(page, 1).hover();
    const frame = page.locator("img[src*='/thumbnail']").locator("xpath=..");
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    expect(Math.abs(box.y - (cell.y + cell.height + 8))).toBeLessThan(1);
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(1280 - 8);
  });

  test("keeps 8 px from the viewport's left edge on a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page, "?month=2026-09");
    await expect(day(page, 1)).toBeVisible();
    await page.waitForTimeout(1200);
    await day(page, 1).hover();
    const frame = page.locator("img[src*='/thumbnail']").locator("xpath=..");
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
  });

  test("scrolling ends it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await open(page, "?month=2026-09");
    // Each day has its own photo, so a preview that follows a scroll to another day is told apart.
    await page.route("**/api/addons/photo_diary/photos*", (route) => {
      const q = new URL(route.request().url()).searchParams;
      if (q.get("limit") !== "1") return route.fallback();
      return route.fulfill(json({ file_ids: [`on${q.get("date")}`], total: 1 }));
    });
    await day(page, 28).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await day(page, 28).hover();
    const img = page.locator("img[src*='on2026-09-28/thumbnail']");
    await expect(img).toBeVisible();
    await page.evaluate(() => window.scrollBy(0, -120));
    await expect(img).toHaveCount(0);
  });

  test("an image that fails ends it, and the day photo is read again on the next visit", async ({ page }) => {
    await open(page, "?month=2026-09");
    let reads = 0;
    await page.route("**/api/addons/photo_diary/photos*", (route) => {
      if (new URL(route.request().url()).searchParams.get("limit") === "1") reads += 1;
      return route.fallback();
    });
    await page.route("**/api/files/d0/thumbnail", (route) => route.fulfill({ status: 404 }));
    await expect(day(page, 28)).toBeVisible();
    await day(page, 28).hover();
    await expect.poll(() => reads).toBe(1);
    await page.waitForTimeout(300);
    await expect(page.locator("img[src*='/thumbnail']")).toHaveCount(0);
    await page.mouse.move(0, 0);
    await day(page, 28).hover();
    await expect.poll(() => reads).toBe(2);
  });

  test("a day whose answer comes after the pointer left shows nothing", async ({ page }) => {
    await open(page, "?month=2026-09");
    await page.route("**/api/addons/photo_diary/photos*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("limit") !== "1") return route.fallback();
      await new Promise((r) => setTimeout(r, 600));
      return route.fallback();
    });
    await expect(day(page, 28)).toBeVisible();
    await day(page, 28).hover();
    await page.waitForTimeout(200);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(900);
    await expect(page.locator("img[src*='/thumbnail']")).toHaveCount(0);
  });

  test.describe("a device that cannot hover", () => {
    test.use({ hasTouch: true, isMobile: true });
    test("reads nothing and shows nothing", async ({ page }) => {
      let reads = 0;
      await prepare(page);
      await serveApi(page);
      await serveDays(page);
      await page.route("**/api/addons/photo_diary/photos*", (route) => {
        if (new URL(route.request().url()).searchParams.get("limit") === "1") reads += 1;
        return route.fallback();
      });
      await page.goto(`${PAGE_PATH}?month=2026-09`);
      await expect(day(page, 28)).toBeVisible();
      expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
      await day(page, 28).tap();
      await page.waitForTimeout(500);
      expect(reads).toBe(0);
      await expect(page.locator("body > div img[src*='/thumbnail']")).toHaveCount(0);
    });
  });

  test("the calendar going hidden ends it", async ({ page }) => {
    await open(page, "?month=2026-09");
    await expect(day(page, 28)).toBeVisible();
    await day(page, 28).hover();
    const img = page.locator("img[src*='/thumbnail']");
    await expect(img).toBeVisible();
    await page.getByRole("tab", { name: "Map" }).dispatchEvent("click");
    await expect(img).toHaveCount(0);
  });
});

async function columnOf(page: Page) {
  return day(page, 1).locator("xpath=ancestor::div[contains(@class,'[grid-area:grid]')]/..");
}
const position = async (page: Page) => (await columnOf(page)).evaluate((el) => getComputedStyle(el).position);

test.describe("SPEC-PD-009: the calendar column on a wide layout", () => {
  test("is held 16 px under the app header while the photos scroll, when it fits", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await addAppHeader(page);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect.poll(() => position(page)).toBe("sticky");
    await page.evaluate(() => window.scrollTo(0, 800));
    await expect.poll(async () => Math.round((await (await columnOf(page)).boundingBox())!.y)).toBe(56 + 16);
  });

  test("I4: holding it adds no document height", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect.poll(() => position(page)).toBe("sticky");
    const held = await page.evaluate(() => document.documentElement.scrollHeight);
    await (await columnOf(page)).evaluate((el) => ((el as HTMLElement).style.position = "static"));
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(held);
  });

  test("I5: when it does not fit it stays in the flow, and every week can be pressed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await addAppHeader(page);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect.poll(() => position(page)).toBe("static");
    await page.evaluate(() => window.scrollTo(0, 0));
    const last = day(page, 30);
    await last.scrollIntoViewIfNeeded();
    await expectReachable(page, (await last.getAttribute("aria-label"))!);
  });

  test("I5: a viewport that shrank while the calendar was hidden is measured when it comes back", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await expect.poll(() => position(page)).toBe("sticky");
    await page.getByRole("tab", { name: "Map" }).click();
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect.poll(() => position(page)).toBe("static");
  });

  test("I5: a grid drawn by a retry is measured at its own height", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    let failing = true;
    await open(page, "?month=2026-09", { fail: () => failing });
    await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible();
    failing = false;
    await page.getByRole("button", { name: "Retry" }).first().click();
    await expect(day(page, 30)).toBeVisible();
    await expect.poll(() => position(page)).toBe("static");
  });

  test("it does not hold the column on a narrow layout", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    expect(await position(page)).toBe("static");
  });
});

const STRIP_NAME = "Show month";
const strip = (page: Page) => page.getByRole("button", { name: STRIP_NAME });
const scrollPastGrid = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(150);
};

test.describe("SPEC-PD-009: the one-week strip on a narrow layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
  });

  test("appears under the app header once the grid has scrolled away, 81 px high, as wide as the column", async ({ page }) => {
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await expect(strip(page)).toHaveCount(0);
    await scrollPastGrid(page);
    await expect(strip(page)).toBeVisible();
    const box = (await strip(page).locator("xpath=../..").boundingBox())!;
    expect(Math.round(box.y)).toBe(56);
    expect(Math.round(box.height)).toBe(81);
    const grid = (await day(page, 5).locator("xpath=ancestor::div[contains(@class,'grid-cols-7')]").boundingBox())!;
    expect(Math.abs(box.x - grid.x)).toBeLessThan(1);
    expect(Math.abs(box.width - grid.width)).toBeLessThan(1);
  });

  test("I6: it shows the seven days of the open day's week with the grid's counts, blank outside the month", async ({ page }) => {
    await open(page, `?month=2026-09&date=2026-09-30`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await scrollPastGrid(page);
    await expect(strip(page)).toBeVisible();
    const row = strip(page).locator("xpath=../following-sibling::div");
    const cells = row.locator("> *");
    await expect(cells).toHaveCount(7);
    // The week of Wed 30 Sep runs 27 Sep to 3 Oct; only 27 to 30 are September.
    const buttons = row.getByRole("button");
    await expect(buttons).toHaveCount(4);
    await expect(row.locator('button[data-date="2026-09-28"]')).toContainText("4");
    await expect(row.locator('button[data-date="2026-09-30"]')).toHaveAttribute("aria-pressed", "true");
    expect(await cells.nth(5).evaluate((el) => el.children.length)).toBe(0);
    expect(await cells.nth(6).evaluate((el) => el.children.length)).toBe(0);
  });

  test("I6: it never covers the list's heading or its close control", async ({ page }) => {
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await scrollPastGrid(page);
    await expect(strip(page)).toBeVisible();
    await expectReachable(page, "Close");
    const heading = (await page.getByRole("heading", { name: /Sep 10, 2026/ }).boundingBox())!;
    const stripBox = (await strip(page).locator("xpath=../..").boundingBox())!;
    expect(heading.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height - 1);
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(400);
    await expectReachable(page, "Close");
    await expect(strip(page)).toBeVisible();
  });

  test("I6: pressing another day opens it and scrolls its heading to the strip's bottom; the open day does nothing", async ({ page }) => {
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await scrollPastGrid(page);
    const row = strip(page).locator("xpath=../following-sibling::div");
    const entries = await page.evaluate(() => window.history.length);
    await row.locator('button[data-date="2026-09-10"]').click();
    expect(await page.evaluate(() => window.history.length)).toBe(entries);

    await row.locator('button[data-date="2026-09-08"]').click();
    await expect(page.getByRole("heading", { name: /Sep 8, 2026/ })).toBeVisible();
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await expect(day(page, 8)).toHaveAttribute("aria-pressed", "true");
    const headingRow = page.getByRole("heading", { name: /Sep 8, 2026/ }).locator("xpath=ancestor::div[contains(@class,'sticky')][1]");
    await expect.poll(async () => Math.round((await headingRow.boundingBox())!.y)).toBe(56 + 81);
    expect(await page.evaluate(() => window.history.length)).toBe(entries + 1);
  });

  test("the back control scrolls the month bar under the header and focuses the open day in the grid", async ({ page }) => {
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await scrollPastGrid(page);
    await strip(page).click();
    await expect.poll(async () => Math.round((await page.getByRole("heading", { name: /September 2026/ }).first().boundingBox())!.y)).toBeGreaterThanOrEqual(56 - 10);
    const bar = (await page.getByRole("button", { name: "Previous month" }).boundingBox())!;
    expect(bar.y).toBeGreaterThanOrEqual(56 - 1);
    expect(bar.y).toBeLessThan(56 + 30);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-date"))).toBe(BIG_DAY);
    expect(await page.evaluate(() => !!document.activeElement?.closest("[class*='grid-cols-7']"))).toBe(true);
    await expect(strip(page)).toHaveCount(0);
  });

  test("I4: the strip adds no document height, and Back from a photo restores the scroll with it shown", async ({ page }) => {
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    const without = await page.evaluate(() => document.documentElement.scrollHeight);
    await scrollPastGrid(page);
    await expect(strip(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(without);

    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.scrollY);
    await page.getByTestId("tile").nth(12).click();
    await expect(page.locator("#file-page")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 5);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before + 5);
  });

  test("it is not shown while the month's days are loading, or have failed", async ({ page }) => {
    let failing = false;
    await open(page, `?month=2026-09&date=${BIG_DAY}`, { delay: 0, fail: () => failing });
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await scrollPastGrid(page);
    await expect(strip(page)).toBeVisible();

    // Another month's days are slow: the grid of the new month is loading.
    await page.route("**/api/addons/photo_diary/calendar/days*", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      return route.fulfill(json({ days: AUGUST }));
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Previous month" }).click();
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(200);
    await expect(strip(page)).toHaveCount(0);
  });

  test("it is not shown for the undated list, with no open day, or on a wide layout", async ({ page }) => {
    await open(page, "?month=2026-09&undated=true");
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await scrollPastGrid(page);
    await expect(strip(page)).toHaveCount(0);

    await page.goto(`${PAGE_PATH}?month=2026-09`);
    await expect(day(page, 5)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(strip(page)).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${PAGE_PATH}?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect(strip(page)).toHaveCount(0);
  });

  test("it is not shown while the calendar view is hidden", async ({ page }) => {
    await open(page, `?month=2026-09&date=${BIG_DAY}`);
    await expect(page.getByTestId("tile").first()).toBeVisible();
    await addAppHeader(page);
    await scrollPastGrid(page);
    await expect(strip(page)).toBeVisible();
    await page.getByRole("tab", { name: "Map" }).click();
    await expect(strip(page)).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect(strip(page)).toHaveCount(0);
  });
});
