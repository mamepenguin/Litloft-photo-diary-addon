import { expect, type Page } from "@playwright/test";
import { TILE_URL } from "./support";

const MONTHS = ["2026-09", "2026-08", "2026-06", "2026-05", "2026-03", "2025-12", "2025-11", "2025-08"];
export const BIG_DAY = "2026-09-10";
export const BIG_DAY_COUNT = 120;
const POINT_COUNT = 100;

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/**
 * Answers what the page asks the server for: a month with one long day, and a
 * map point that stands for 100 photos. The page is the real one; only the
 * network behind it is stood in for.
 */
export async function serveApi(page: Page) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/api/addons/photo_diary/calendar/months", (route) =>
    route.fulfill(
      json({
        months: MONTHS.map((month, i) => ({ month, count: i === 0 ? BIG_DAY_COUNT : 5 })),
        undated_count: 3,
      }),
    ),
  );
  await page.route("**/api/addons/photo_diary/calendar/days*", (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    route.fulfill(json({ days: month === "2026-09" ? [{ date: BIG_DAY, count: BIG_DAY_COUNT }] : [] }));
  });
  await page.route("**/api/addons/photo_diary/photos*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const all = q.get("undated") ? ids("u", 3) : ids("d", BIG_DAY_COUNT);
    const offset = Number(q.get("offset") ?? 0);
    const limit = Number(q.get("limit") ?? 40);
    route.fulfill(json({ file_ids: all.slice(offset, offset + limit), total: all.length }));
  });
  await page.route("**/api/addons/photo_diary/points", (route) =>
    route.fulfill(
      json({
        points: ids("p", POINT_COUNT).map((file_id) => ({ file_id, lat: 35.6812, lon: 139.7671, taken_at: "2026-09-10T10:00:00" })),
      }),
    ),
  );
  await page.route("**/api/addons/photo_diary/map-config", (route) =>
    route.fulfill(json({ tile_url: TILE_URL, attribution: "" })),
  );
  await page.route("**/api/addons/photo_diary/note*", (route) => route.fulfill(json({ state: "none", file_id: null })));
  await page.route("**/api/addons/status*", (route) => route.fulfill(json({ addons: { knowledge: {} }, slots: {} })));
  await page.route("**/api/drives/*/addon-policies", (route) =>
    route.fulfill(json({ addons: { knowledge: { default: true, features: { editor: true } } } })),
  );
  await page.route("**/api/files/batch/get", (route) => {
    const { ids: want } = route.request().postDataJSON() as { ids: string[] };
    route.fulfill(json(want.map((id) => ({ id, filename: id }))));
  });
}

/** A header as tall and as sticky as the app's, so the page scrolls under something. */
export async function addAppHeader(page: Page, height = 56) {
  await page.evaluate((h) => {
    document.documentElement.style.setProperty("--app-header-h", `${h}px`);
    const bar = document.createElement("header");
    bar.style.cssText = `position:sticky;top:0;z-index:20;height:${h}px;background:#fff;border-bottom:1px solid #ccc`;
    document.body.prepend(bar);
  }, height);
}

/** Whether the element can be pressed: inside the viewport and not covered. */
export async function expectReachable(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeInViewport({ ratio: 1 });
  const covered = await button.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !(top === el || el.contains(top));
  });
  expect(covered, `${name} is covered`).toBe(false);
}

/** Presses the map's one point, again until its list opens: the map may not have clustered yet. */
export async function openPointList(page: Page) {
  const box = (await page.locator("canvas").first().boundingBox())!;
  await expect(async () => {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("tile").first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}
