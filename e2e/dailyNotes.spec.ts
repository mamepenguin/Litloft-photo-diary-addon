/**
 * Daily notes in the real page, in Chromium, with the network stood in for:
 * what depends on layout, scrolling and history.
 */
import { expect, test, type Page } from "@playwright/test";
import { BIG_DAY, serveApi } from "./pageSupport";
import { prepare } from "./support";

const PAGE_PATH = "/page.html";
const NOTE_TEXT = "Went to the coast with everyone.";
const FILE_ID = "note1";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Answers `/note` and the stream as `state` says at the moment each is asked, after `delay` ms. */
async function serveNote(
  page: Page,
  state: { current: "none" | "empty" | "active"; delay: number },
  counts = { note: 0, stream: 0 },
) {
  await page.route("**/api/addons/photo_diary/note*", async (route) => {
    counts.note += 1;
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
    const file_id = state.current === "none" ? null : FILE_ID;
    await route.fulfill(json({ state: state.current, file_id })).catch(() => {});
  });
  await page.route(`**/api/files/${FILE_ID}/stream*`, async (route) => {
    counts.stream += 1;
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
    await route.fulfill({ status: 200, contentType: "text/markdown", body: NOTE_TEXT }).catch(() => {});
  });
  await page.route("**/api/drives/family/files", (route) =>
    route.request().method() === "POST" ? route.fulfill(json({ id: FILE_ID }, 201)) : route.fallback(),
  );
  return counts;
}

async function open(page: Page, query: string, state: { current: "none" | "empty" | "active"; delay: number }) {
  await prepare(page);
  await serveApi(page);
  const counts = await serveNote(page, state);
  await page.goto(`${PAGE_PATH}${query}`);
  return counts;
}

const DAY_QUERY = `?month=2026-09&date=${BIG_DAY}`;
const SIZES = [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 800 }],
] as const;

for (const [name, size] of SIZES) {
  test(`SPEC-PD-006: the panel reads date, note, photos from top to bottom on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, DAY_QUERY, { current: "active", delay: 0 });
    const note = page.getByText(NOTE_TEXT);
    await expect(note).toBeVisible();
    const tile = page.getByTestId("tile").first();
    await expect(tile).toBeVisible();
    const heading = (await page.getByText(/Sep 10, 2026/).first().boundingBox())!;
    const noteBox = (await note.boundingBox())!;
    const tileBox = (await tile.boundingBox())!;
    expect(noteBox.y).toBeGreaterThanOrEqual(heading.y + heading.height - 1);
    expect(tileBox.y).toBeGreaterThanOrEqual(noteBox.y + noteBox.height - 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });

  test(`I10: Back from a photo restores the scroll position though the note loads after the list, on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    const state = { current: "active" as const, delay: 0 };
    await open(page, DAY_QUERY, state);
    await expect(page.getByText(NOTE_TEXT)).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(400);
    }
    const tiles = await page.getByTestId("tile").count();
    expect(tiles).toBeGreaterThan(80);
    await page.getByTestId("tile").nth(60).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(1000);

    await page.getByTestId("tile").nth(60).click();
    await expect(page.locator("#file-page")).toBeVisible();
    state.delay = 800;
    await page.goBack();
    await expect(page.getByText(NOTE_TEXT)).toBeVisible();
    await expect(page.getByTestId("tile")).toHaveCount(tiles);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 5);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before + 5);
  });
}

test("I10: entering the calendar over a drawn note does not move the photos below it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = { current: "active" as const, delay: 0 };
  const counts = await open(page, DAY_QUERY, state);
  await expect(page.getByText(NOTE_TEXT)).toBeVisible();
  const tile = page.getByTestId("tile").first();
  await expect(tile).toBeVisible();
  const before = (await tile.boundingBox())!.y;
  const reads = counts.note;

  await page.getByRole("tab", { name: "Map" }).click();
  await expect(page.locator("canvas").first()).toBeVisible();
  // The software renderer takes a frame to draw the vector base; leaving while it
  // does delays the calendar's own layout by as long, which is not what is measured.
  await expect(page.getByRole("button", { name: "100 photos" })).toBeVisible();
  state.delay = 1500;
  await page.getByRole("tab", { name: "Calendar" }).click();
  await expect.poll(() => counts.note).toBeGreaterThan(reads);
  await expect(page.getByText(NOTE_TEXT)).toBeVisible();
  expect((await tile.boundingBox())!.y).toBe(before);
  await page.waitForTimeout(2000);
  await expect(page.getByText(NOTE_TEXT)).toBeVisible();
  expect((await tile.boundingBox())!.y).toBe(before);
});

test("I7: a note saved just as Back is pressed appears at the second read, without a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = { current: "none" as "none" | "empty" | "active", delay: 0 };
  const counts = await open(page, DAY_QUERY, state);
  const write = page.getByRole("button", { name: "Write a note" });
  await expect(write).toBeVisible();
  await write.click();
  await expect(page.locator("#editor-page")).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/files/${FILE_ID}?edit=1`);

  state.current = "empty";
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
  await page.goBack();
  await expect(page.getByRole("button", { name: "Write a note" })).toBeVisible();
  const reads = counts.note;
  state.current = "active";

  await expect(page.getByText(NOTE_TEXT)).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Write a note" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", `/files/${FILE_ID}?edit=1`);
  expect(counts.note).toBe(reads + 1);
  await page.waitForTimeout(3500);
  expect(counts.note).toBe(reads + 1);
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
});

for (const [name, size] of SIZES) {
  test(`a two-digit day's number and its pen do not overlap on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, "?month=2026-09", { current: "none", delay: 0 });
    await page.route("**/api/addons/photo_diary/calendar/days*", (route) =>
      route.fulfill(
        json({
          days: [
            { date: BIG_DAY, count: 120, has_note: true },
            { date: "2026-09-22", count: 0, has_note: true },
          ],
        }),
      ),
    );
    await page.reload();
    for (const [label, day] of [
      ["September 10", "10"],
      ["September 22", "22"],
    ]) {
      const cell = page.getByRole("button", { name: new RegExp(`${label}.*has a note`) });
      await expect(cell).toBeVisible();
      const number = (await cell.getByText(day, { exact: true }).boundingBox())!;
      const pen = (await cell.locator("svg").boundingBox())!;
      const box = (await cell.boundingBox())!;
      expect(pen.x).toBeGreaterThanOrEqual(number.x + number.width);
      expect(Math.abs(pen.y + pen.height / 2 - (number.y + number.height / 2))).toBeLessThanOrEqual(2);
      expect(pen.x + pen.width).toBeLessThanOrEqual(box.x + box.width);
      expect(box.height).toBe(name === "desktop" ? 76 : 48);
    }
  });
}

test("the month title is one line with the undated button present at 1280", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "?month=2026-09", { current: "none", delay: 0 });
  await expect(page.getByRole("button", { name: /^No capture date/ })).toBeVisible();
  const title = page.getByRole("heading", { level: 2 }).filter({ hasText: /2026/ }).first();
  await expect(title).toBeVisible();
  const { height, line } = await title.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    line: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height).toBeLessThanOrEqual(line + 1);
});
