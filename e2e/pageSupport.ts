import { expect, type Page } from "@playwright/test";
import { TILE_URL } from "./support";

const MONTHS = ["2026-09", "2026-08", "2026-06", "2026-05", "2026-03", "2025-12", "2025-11", "2025-08"];
export const BIG_DAY = "2026-09-10";
export const BIG_DAY_COUNT = 120;
const POINT_COUNT = 100;
export const SCOPE_COUNT = BIG_DAY_COUNT + (MONTHS.length - 1) * 5 + 3;

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/**
 * Answers what the page asks the server for: a month with one long day, and a
 * map point that stands for 100 photos. The page is the real one; only the
 * network behind it is stood in for.
 */
export async function serveApi(page: Page) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  const postedIds = (route: { request: () => { postDataJSON: () => unknown } }): string[] | null => {
    try {
      const body = route.request().postDataJSON() as { file_ids?: unknown } | null;
      return Array.isArray(body?.file_ids) && body.file_ids.every((id) => typeof id === "string")
        ? body.file_ids
        : null;
    } catch {
      return null;
    }
  };
  const paged = <T,>(all: T[], search: URLSearchParams) => {
    const offset = Number(search.get("offset") ?? 0);
    const limit = Number(search.get("limit") ?? 40);
    return all.slice(offset, offset + limit);
  };

  await page.route("**/api/addons/photo_diary/calendar/months*", (route) => {
    const members = route.request().method() === "POST" ? postedIds(route) : null;
    if (members !== null && members.length === 0) return route.fulfill(json({ months: [], undated_count: 0 }));
    return route.fulfill(
      json({
        months: MONTHS.map((month, i) => ({ month, count: i === 0 ? BIG_DAY_COUNT : 5 })),
        undated_count: 3,
      }),
    );
  });
  await page.route("**/api/addons/photo_diary/calendar/days*", (route) => {
    const members = route.request().method() === "POST" ? postedIds(route) : null;
    if (members !== null && members.length === 0) return route.fulfill(json({ days: [] }));
    const month = new URL(route.request().url()).searchParams.get("month");
    route.fulfill(json({ days: month === "2026-09" ? [{ date: BIG_DAY, count: BIG_DAY_COUNT }] : [] }));
  });
  await page.route("**/api/addons/photo_diary/photos*", (route) => {
    const members = route.request().method() === "POST" ? postedIds(route) : null;
    if (members !== null) {
      const page = paged(members, new URL(route.request().url()).searchParams);
      return route.fulfill(json({ file_ids: page, total: members.length }));
    }
    const q = new URL(route.request().url()).searchParams;
    const all = q.get("undated") ? ids("u", 3) : ids("d", BIG_DAY_COUNT);
    route.fulfill(json({ file_ids: paged(all, q), total: all.length }));
  });
  await page.route("**/api/addons/photo_diary/points*", (route) => {
    const members = route.request().method() === "POST" ? postedIds(route) : null;
    const all = members ?? ids("p", POINT_COUNT);
    return route.fulfill(
      json({
        points: all.map((file_id) => ({ file_id, lat: 35.6812, lon: 139.7671, taken_at: "2026-09-10T10:00:00" })),
      }),
    );
  });
  await page.route("**/api/addons/photo_diary/map-config", (route) =>
    route.fulfill(json({ tile_url: TILE_URL, attribution: "" })),
  );
  await page.route("**/api/addons/photo_diary/note*", (route) => route.fulfill(json({ state: "none", file_id: null })));
  await page.route("**/api/addons/photo_diary/library/shelves*", (route) => {
    const members = route.request().method() === "POST" ? postedIds(route) : null;
    if (members !== null) {
      const shelves = members.length === 0 ? [] : [{ key: "member", label: "", count: members.length, file_ids: members }];
      return route.fulfill(json({ shelves, total_shelves: shelves.length }));
    }
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? 0);
    const shelves =
      offset > 0
        ? []
        : MONTHS.slice(0, 4).map((key) => ({ key, label: "", count: 5, file_ids: ids(`${key}-`, 5) }));
    route.fulfill(json({ shelves, total_shelves: 4 }));
  });
  await page.route("**/api/addons/photo_diary/library/shelf*", (route) => {
    const members = route.request().method() === "POST" ? postedIds(route) : null;
    if (members !== null) {
      const page = paged(members, new URL(route.request().url()).searchParams);
      return route.fulfill(json({ file_ids: page, total: members.length, label: "" }));
    }
    const q = new URL(route.request().url()).searchParams;
    const all = ids(`${q.get("key")}-`, 45);
    route.fulfill(json({ file_ids: paged(all, q), total: all.length, label: "" }));
  });
  await page.route("**/api/drives/*/smart-folders", (route) => route.fulfill(json([])));
  await page.route("**/api/drives/*/collections", (route) => route.fulfill(json([])));
  await page.route(
    (url) => /\/api\/drives\/[^/]+\/files$/.test(url.pathname),
    (route) => {
      const q = new URL(route.request().url()).searchParams;
      if (q.get("search") !== null) {
        return route.fulfill(
          json({
            data: [{ id: "member-0", filename: "member-0.jpg", file_type: "image" }],
            meta: { total: 1, page: 1, limit: 500 },
          }),
        );
      }
      route.fulfill(json({ data: [], meta: { total: SCOPE_COUNT, page: 1, limit: 1 } }));
    },
  );
  await page.route("**/api/addons/status*", (route) =>
    route.fulfill(json({ addons: { knowledge: {}, intelligence: {} }, slots: {} })),
  );
  await page.route("**/api/addons/intelligence/search*", (route) =>
    route.fulfill(json({ available: true, results: [] })),
  );
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
