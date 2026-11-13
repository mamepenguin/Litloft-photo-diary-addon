/**
 * SPEC-PD-010 and SPEC-PD-011 in the map module alone: the base drawn from
 * vector tiles, the palette that follows the theme, and the pins. Tiles and
 * thumbnails are stood in for by page.route.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  DARK,
  FIXTURE_PATH,
  LIGHT,
  MVT_TYPE,
  PNG,
  TILE_HOST,
  TILE_PATTERN,
  VECTOR_TILE,
  accentBorders,
  createMap,
  pinsOf,
  pixelsNear,
  prepare,
  resolveColour,
  same,
  settle,
  zoomInAtCentre,
  type Harness,
  type Point,
} from "./support";

const A: [number, number] = [139.7671, 35.6812];
const OWN = "127.0.0.1";

const handle = <T>(page: Page, run: string, ...args: unknown[]) =>
  page.evaluate(([code, rest]) => new Function("h", "args", `return (${code})(h, ...args)`)((window as any).__handle, rest) as T, [run, args] as const);

test.describe("SPEC-PD-010: the base map", () => {
  test("draws land, parks, water, streets and names in the light palette, and the glyphs come from the page's own origin", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    const [land, woods, water, road] = await pixelsNear(page, [LIGHT.land, LIGHT.woods, LIGHT.water, LIGHT.road]);
    const [label] = await pixelsNear(page, [LIGHT.label], 30);
    expect(land).toBeGreaterThan(2000);
    expect(woods).toBeGreaterThan(2000);
    expect(water).toBeGreaterThan(500);
    expect(road).toBeGreaterThan(50);
    expect(label).toBeGreaterThan(20);

    const glyphs = h.assetRequests().filter((u) => u.includes("glyphs-"));
    expect(glyphs.map((u) => new URL(u).pathname.split("/").pop())).toContain("glyphs-3.0.0-NotoSansRegular-0-255.pbf");
    for (const url of glyphs) expect(new URL(url).hostname).toBe(OWN);
    // Han characters are drawn with the browser's font: no range above U+2FFF is asked for.
    for (const url of glyphs) {
      const range = /NotoSansRegular-(\d+)-(\d+)\.pbf/.exec(url)!;
      expect(Number(range[1])).toBeLessThan(0x3000);
    }
    expect(h.assetRequests().filter((u) => /\.(png|jpg)$/.test(u))).toEqual([]);
  });

  test("I8: a theme change repaints in the dark palette without moving, and asks for no tile again", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    const requests = h.tileRequests().length;
    const views = h.views.length;
    const before = await pixelsNear(page, [LIGHT.land, DARK.land, DARK.woods, DARK.water]);
    expect(before[0]).toBeGreaterThan(2000);
    expect(before[1]).toBe(0);

    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await expect.poll(async () => (await pixelsNear(page, [DARK.land]))[0], { timeout: 5000 }).toBeGreaterThan(2000);
    const after = await pixelsNear(page, [LIGHT.land, LIGHT.woods, LIGHT.water, DARK.woods, DARK.water]);
    const [darkLabel] = await pixelsNear(page, [DARK.label], 30);
    expect(after[0]).toBeLessThan(60);
    expect(after[1]).toBe(0);
    expect(after[2]).toBe(0);
    expect(after[3]).toBeGreaterThan(2000);
    expect(after[4]).toBeGreaterThan(500);
    expect(darkLabel).toBeGreaterThan(20);

    await page.waitForTimeout(500);
    expect(h.tileRequests().length).toBe(requests);
    expect(h.views.length).toBe(views);

    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    await expect.poll(async () => (await pixelsNear(page, [LIGHT.land]))[0], { timeout: 5000 }).toBeGreaterThan(2000);
    expect(h.tileRequests().length).toBe(requests);
  });

  test("I8: a change made while the map is hidden is applied when it is on screen again, not before", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    const requests = h.tileRequests().length;

    await page.evaluate(() => {
      document.getElementById("map")!.style.display = "none";
      document.documentElement.dataset.theme = "dark";
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => (document.getElementById("map")!.style.display = ""));
    await page.waitForTimeout(800);
    // On screen, but nothing has said so: still the old palette.
    expect((await pixelsNear(page, [LIGHT.land]))[0]).toBeGreaterThan(2000);
    expect((await pixelsNear(page, [DARK.land]))[0]).toBeLessThan(60);

    await page.evaluate(() => (window as any).__handle.resume());
    await expect.poll(async () => (await pixelsNear(page, [DARK.land]))[0], { timeout: 5000 }).toBeGreaterThan(2000);
    expect((await pixelsNear(page, [LIGHT.land]))[0]).toBeLessThan(60);
    expect(h.tileRequests().length).toBe(requests);
  });

  test("I8: a map made in the dark theme starts with the dark palette", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    expect((await pixelsNear(page, [DARK.land]))[0]).toBeGreaterThan(2000);
    expect((await pixelsNear(page, [LIGHT.land]))[0]).toBeLessThan(60);
  });

  test("I7: every tile request is the configured URL with only z, x and y filled in, and nothing is asked for before a map exists", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await page.waitForTimeout(500);
    expect(h.tileRequests()).toEqual([]);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await page.waitForTimeout(500);
    for (const { url, headers } of h.tileRequests()) {
      expect(TILE_PATTERN.test(url), url).toBe(true);
      expect([undefined, new URL(page.url()).origin, `${new URL(page.url()).origin}/`]).toContain(headers["referer"]);
    }
    const hosts = new Set(h.requests.map((r) => new URL(r.url).hostname));
    expect([...hosts].sort()).toEqual([OWN, "tiles.example.test"].sort());
  });

  test("a style whose glyph address is not absolute or lacks {fontstack} would not load: the map's style is accepted", async ({ page }) => {
    const h = await prepare(page);
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 2, 35.6812, 139.7671), center: A, zoom: 12 });
    await settle(page, h);
    expect(errors.filter((e) => !/WebGL|GPU stall|Failed to load resource/.test(e))).toEqual([]);
  });
});

async function dated(page: Page, h: Harness, points: Point[], zoom = 5) {
  await page.goto(FIXTURE_PATH);
  await createMap(page, { points, center: A, zoom });
  await settle(page, h);
}

const group = (id: string, n: number, lon: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ file_id: `${id}-${i}`, lat: 35.6812, lon, taken_at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00` }));

test.describe("SPEC-PD-011: a pin is a photo with a count badge", () => {
  test("side by count, badge on a pin of several photos only, named by its count", async ({ page }) => {
    const h = await prepare(page);
    const counts = [1, 9, 10, 19, 20, 99, 100];
    const sides = [44, 44, 50, 50, 58, 58, 68];
    // Three degrees is 136 px at zoom 5, beyond the cluster radius.
    const points = counts.flatMap((n, i) => group(`g${n}`, n, A[0] + (i - 3) * 3));
    await dated(page, h, points);
    await expect(pinsOf(page)).toHaveCount(7);
    for (const [i, n] of counts.entries()) {
      const pin = page.getByRole("button", { name: n === 1 ? "1 photo" : `${n} photos`, exact: true });
      const box = (await pin.boundingBox())!;
      expect(Math.round(box.width), `${n} photos`).toBe(sides[i]);
      expect(Math.round(box.height)).toBe(sides[i]);
      const info = await pin.evaluate((el) => {
        const style = getComputedStyle(el);
        const img = el.querySelector("img")!;
        const badge = [...el.querySelectorAll("span")][0] as HTMLElement | undefined;
        const b = badge?.getBoundingClientRect();
        const p = el.getBoundingClientRect();
        const bs = badge ? getComputedStyle(badge) : null;
        return {
          border: (el as HTMLElement).style.borderTopWidth,
          borderColour: style.borderTopColor,
          radius: style.borderTopLeftRadius,
          alt: img.getAttribute("alt"),
          badge: badge && {
            text: badge.textContent,
            bg: bs!.backgroundColor,
            colour: bs!.color,
            height: b!.height,
            width: b!.width,
            border: badge.style.borderTopWidth,
            digits: bs!.fontVariantNumeric,
            dx: b!.left + b!.width / 2 - p.right,
            dy: b!.top + b!.height / 2 - p.top,
          },
        };
      });
      expect(info.border).toBe("2.5px");
      expect(info.borderColour).toBe("rgb(255, 255, 255)");
      expect(info.radius).toBe("12px");
      expect(info.alt).toBe("");
      if (n === 1) expect(info.badge).toBeFalsy();
      else {
        expect(info.badge!.text).toBe(String(n));
        expect(info.badge!.bg).toBe("rgb(33, 25, 34)");
        expect(info.badge!.colour).toBe("rgb(255, 255, 255)");
        expect(info.badge!.height).toBe(18);
        expect(info.badge!.width).toBeGreaterThanOrEqual(18);
        expect(info.badge!.border).toBe("1.5px");
        expect(info.badge!.digits).toContain("tabular-nums");
        // Its centre is near the top right corner; a wider badge grows inward from the right edge.
        expect(Math.abs(info.badge!.dx)).toBeLessThan(info.badge!.width);
        expect(Math.abs(info.badge!.dy)).toBeLessThan(10);
      }
    }
  });

  test("pins follow the map when it is panned and zoomed", async ({ page }) => {
    const h = await prepare(page);
    // About 140 px either side of the centre at zoom 12.
    const points = [...same("l", 2, 35.6812, 139.7671 - 0.0343), ...same("r", 3, 35.6812, 139.7671 + 0.0343)];
    await dated(page, h, points, 12);
    const centreOf = async (name: string) => {
      const b = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const left = await centreOf("2 photos");
    const right = await centreOf("3 photos");
    const box = (await page.locator("#map").boundingBox())!;

    await page.mouse.move(box.x + 640, box.y + 480);
    await page.mouse.down();
    await page.mouse.move(box.x + 640 + 100, box.y + 480, { steps: 6 });
    // MapLibre gives a drag inertia from the moves of its last 160 ms; holding
    // still first keeps the map where the mouse left it, so the zoom below
    // keeps both pins in view.
    await page.waitForTimeout(300);
    const views = h.views.length;
    await page.mouse.up();
    await expect.poll(() => h.views.length).toBeGreaterThan(views);
    const moved = (A[0] - h.views[h.views.length - 1].center[0]) * ((512 * 2 ** 12) / 360);
    expect(Math.abs(moved - 100)).toBeLessThan(2);
    expect(Math.abs((await centreOf("3 photos")).x - right.x - moved)).toBeLessThan(2);
    expect(Math.abs((await centreOf("2 photos")).x - left.x - moved)).toBeLessThan(2);

    const gap = (await centreOf("3 photos")).x - (await centreOf("2 photos")).x;
    await zoomInAtCentre(page);
    await expect.poll(async () => Math.round((await centreOf("3 photos")).x - (await centreOf("2 photos")).x)).toBeGreaterThan(gap * 1.8);
  });

  test("I9: a pin's photo is the newest dated one, else the first undated one", async ({ page }) => {
    const h = await prepare(page);
    const shuffled = ["2026-03-01", "2026-05-09", "2026-01-02", "2026-04-04"].map((d, i) => ({
      file_id: `d-${i}`,
      lat: 35.6812,
      lon: A[0] - 6,
      taken_at: `${d}T10:00:00`,
    }));
    const mixed: Point[] = [
      { file_id: "u-0", lat: 35.6812, lon: A[0], taken_at: null },
      { file_id: "m-dated", lat: 35.6812, lon: A[0], taken_at: "2020-01-01T00:00:00" },
      { file_id: "u-1", lat: 35.6812, lon: A[0], taken_at: null },
    ];
    const undated: Point[] = ["first", "second", "third"].map((id) => ({ file_id: `n-${id}`, lat: 35.6812, lon: A[0] + 6, taken_at: null }));
    await dated(page, h, [...shuffled, ...mixed, ...undated]);
    await expect(pinsOf(page)).toHaveCount(3);
    const sources = await pinsOf(page).evaluateAll((all) => all.map((el) => el.querySelector("img")!.getAttribute("src")!.split("/")[3]));
    // The newest of the dated four, the dated one among the mixed three, the first of the undated three.
    expect(sources.sort()).toEqual(["d-1", "m-dated", "n-first"]);
  });

  test("I9: pressing a pin lists exactly its photos, also after the data changed under it", async ({ page }) => {
    const h = await prepare(page);
    const first = ["a", "b", "c", "d"].map((id, i) => ({ file_id: `old-${id}`, lat: 35.6812, lon: 139.7671, taken_at: `2026-01-0${i + 1}T10:00:00` }));
    await dated(page, h, first, 12);
    await pinsOf(page).first().click();
    await expect.poll(() => h.clicks.length).toBe(1);
    expect([...h.clicks[0]].sort()).toEqual(first.map((p) => p.file_id).sort());

    // Same size, same newest photo, other members: the pin stays and its list follows the new data.
    const second: Point[] = [
      { file_id: "new-a", lat: 35.6812, lon: 139.7671, taken_at: "2025-12-01T10:00:00" },
      { file_id: "new-b", lat: 35.6812, lon: 139.7671, taken_at: "2025-12-02T10:00:00" },
      { file_id: "new-c", lat: 35.6812, lon: 139.7671, taken_at: "2025-12-03T10:00:00" },
      first[3],
    ];
    await handle(page, "(map, points) => map.setPoints(points)", second);
    await page.waitForTimeout(1500);
    await pinsOf(page).first().click();
    await expect.poll(() => h.clicks.length).toBe(2);
    expect([...h.clicks[1]].sort()).toEqual(second.map((p) => p.file_id).sort());
  });

  test("I9: a drag that starts on a pin moves the map and opens no list, with a mouse", async ({ page }) => {
    const h = await prepare(page);
    await dated(page, h, same("a", 3, 35.6812, 139.7671), 12);
    h.views.length = 0;
    const pin = pinsOf(page).first();
    const box = (await pin.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 160, y + 30, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => h.views.length).toBeGreaterThan(0);
    expect(h.views.at(-1)!.center[0]).toBeGreaterThan(A[0]);
    await page.waitForTimeout(300);
    expect(h.clicks).toEqual([]);
    // A plain press still opens it.
    const moved = (await pinsOf(page).first().boundingBox())!;
    await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2);
    await expect.poll(() => h.clicks.length).toBe(1);
  });

  test("I9: a click that follows a press which moved is not a press on the pin", async ({ page }) => {
    const h = await prepare(page);
    await dated(page, h, same("a", 3, 35.6812, 139.7671), 12);
    const pin = pinsOf(page).first();
    const box = (await pin.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // What a browser delivers to a button after a drag that ended on it.
    await pin.dispatchEvent("pointerdown", { clientX: x, clientY: y });
    await pin.dispatchEvent("click", { clientX: x + 40, clientY: y + 10 });
    await page.waitForTimeout(300);
    expect(h.clicks).toEqual([]);
    await pin.dispatchEvent("pointerdown", { clientX: x, clientY: y });
    await pin.dispatchEvent("click", { clientX: x + 2, clientY: y });
    await expect.poll(() => h.clicks.length).toBe(1);
  });

  test("I10: only pins inside the view plus one pin's width exist, though more points are in the loaded tiles", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    // 0.0005 degrees is about 93 px at zoom 17: a grid far wider than the view.
    const points: Point[] = Array.from({ length: 1600 }, (_, i) => ({
      file_id: `g${i}`,
      lat: 35.6812 + (Math.floor(i / 40) - 20) * 0.0005,
      lon: 139.7671 + ((i % 40) - 20) * 0.0005,
      taken_at: "2026-01-01T00:00:00",
    }));
    await createMap(page, { points, center: A, zoom: 17 });
    await settle(page, h);
    await expect.poll(() => pinsOf(page).count()).toBeGreaterThan(20);
    const box = (await page.locator("#map").boundingBox())!;
    const boxes = await pinsOf(page).evaluateAll((all) => all.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }));
    expect(boxes.length).toBeLessThan(140);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThan(box.x - 70);
      expect(b.x).toBeLessThan(box.x + box.width + 70);
      expect(b.y).toBeGreaterThan(box.y - 70);
      expect(b.y).toBeLessThan(box.y + box.height + 70);
    }
    expect(h.thumbnailRequests().length).toBeLessThanOrEqual(boxes.length * 2);
  });

  test.describe("with a touch screen", () => {
    test.use({ hasTouch: true });
    test("I9: a drag that starts on a pin moves the map and opens no list, and a tap opens it", async ({ page }) => {
      const h = await prepare(page);
      await dated(page, h, same("a", 3, 35.6812, 139.7671), 12);
      h.views.length = 0;
      const box = (await pinsOf(page).first().boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: string, px: number) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: px, y }] });
      await touch("touchStart", x);
      for (let i = 1; i <= 8; i++) await touch("touchMove", x - i * 20);
      await touch("touchEnd", x - 160);
      await expect.poll(() => h.views.length).toBeGreaterThan(0);
      await page.waitForTimeout(300);
      expect(h.clicks).toEqual([]);

      const moved = (await pinsOf(page).first().boundingBox())!;
      await page.touchscreen.tap(moved.x + moved.width / 2, moved.y + moved.height / 2);
      await expect.poll(() => h.clicks.length).toBe(1);
    });
  });

  test("two photos 58 px apart are one pin at zoom 19, and 70 px apart are two", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    await createMap(page, {
      points: [...same("up", 1, 35.6812, 139.7671), ...same("down", 1, 35.6812 - 0.0000629, 139.7671)],
      center: A,
      zoom: 19,
    });
    await settle(page, h);
    await expect(pinsOf(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "2 photos", exact: true })).toBeVisible();
  });

  test("selecting a pin changes its border and order, and neither re-creates it nor loads its image again", async ({ page }) => {
    const h = await prepare(page);
    const points = [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)];
    await dated(page, h, points, 12);
    const pin = page.getByRole("button", { name: "3 photos", exact: true });
    await expect(pin).toBeVisible();
    await page.waitForFunction(() => [...document.querySelectorAll("#map button img")].every((i) => (i as HTMLImageElement).complete));
    await pin.evaluate((el) => {
      (el as any).__same = true;
      (el.querySelector("img") as any).__same = true;
      (window as any).__removed = 0;
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.removedNodes) if ((n as Element).matches?.("button")) (window as any).__removed++;
      }).observe(document.querySelector("#map")!, { childList: true, subtree: true });
    });
    const z = () => pin.evaluate((el) => Number(getComputedStyle(el).zIndex));
    const resting = await z();
    const requests = h.thumbnailRequests().length;

    for (let round = 0; round < 3; round++) {
      await handle(page, "(map, ids) => map.setSelected(ids)", ["a-0", "a-1", "a-2"]);
      await expect.poll(() => accentBorders(page)).toBe(1);
      expect(await z()).toBeGreaterThan(resting);
      await handle(page, "(map, ids) => map.setSelected(ids)", null);
      await expect.poll(() => accentBorders(page)).toBe(0);
      expect(await z()).toBe(resting);
    }
    const kept = await pin.evaluate((el) => ({
      pin: (el as any).__same === true,
      img: (el.querySelector("img") as any).__same === true,
      removed: (window as any).__removed,
    }));
    expect(kept).toEqual({ pin: true, img: true, removed: 0 });
    expect(h.thumbnailRequests().length).toBe(requests);
  });

  test("the selected pin has the accent border on a ring that does not change its size", async ({ page }) => {
    const h = await prepare(page);
    await dated(page, h, [...same("a", 3, 35.6812, 139.7671), ...same("far", 2, 36, 140)], 12);
    const pin = page.getByRole("button", { name: "3 photos", exact: true });
    const before = (await pin.boundingBox())!;
    await handle(page, "(map, ids) => map.setSelected(ids)", ["a-0", "a-1", "a-2"]);
    await expect.poll(() => accentBorders(page)).toBe(1);
    const after = (await pin.boundingBox())!;
    expect(after.width).toBe(before.width);
    expect(await pin.evaluate((el) => (el as HTMLElement).style.borderTopWidth)).toBe("2.5px");
    expect(await resolveColour(page, "var(--accent)")).toBe(await pin.evaluate((el) => getComputedStyle(el).borderTopColor));
  });

  test("a larger pin is above a smaller one, the selected one above all", async ({ page }) => {
    const h = await prepare(page);
    await dated(page, h, [...group("big", 12, A[0] - 3), ...group("small", 2, A[0] + 3)], 5);
    const z = (name: string) => page.getByRole("button", { name, exact: true }).evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(await z("12 photos")).toBeGreaterThan(await z("2 photos"));
    await handle(page, "(map, ids) => map.setSelected(ids)", ["small-0", "small-1"]);
    await expect.poll(() => accentBorders(page)).toBe(1);
    expect(await z("2 photos")).toBeGreaterThan(await z("12 photos"));
  });

  test("panning keeps a pin that stays in view, and a pin that left is removed with its image abandoned", async ({ page }) => {
    const h = await prepare(page);
    // 0.1 degrees is about 290 px at zoom 11.
    await dated(page, h, [...same("keep", 3, 35.6812, 139.7671), ...same("gone", 2, 35.6812, 139.7671 + 0.1)], 11);
    const keep = page.getByRole("button", { name: "3 photos", exact: true });
    const gone = page.getByRole("button", { name: "2 photos", exact: true });
    await expect(keep).toBeVisible();
    await expect(gone).toBeVisible();
    await keep.evaluate((el) => ((el as any).__same = true));
    await gone.evaluate((el) => ((window as any).__goneImage = el.querySelector("img")));

    const box = (await page.locator("#map").boundingBox())!;
    const drag = async (dx: number) => {
      const from = dx < 0 ? 1200 : 80;
      await page.mouse.move(box.x + from, box.y + 450);
      await page.mouse.down();
      await page.mouse.move(box.x + from + dx, box.y + 450, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(700);
    };
    await drag(60);
    expect(await keep.evaluate((el) => (el as any).__same === true)).toBe(true);
    await expect(gone).toBeVisible();

    // Far enough that both are more than a pin's width outside the view.
    await drag(-1100);
    await drag(-1100);
    await expect(pinsOf(page)).toHaveCount(0, { timeout: 5000 });
    expect(await page.evaluate(() => (window as any).__goneImage.getAttribute("src"))).toBeNull();
  });

  test("a thumbnail that is slow leaves the pin on the sand surface and pressable; it is drawn when it arrives", async ({ page }) => {
    const h = await prepare(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/files/slow-*/thumbnail", async (route) => {
      await gate;
      await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    });
    await dated(page, h, same("slow", 3, 35.6812, 139.7671), 12);
    const pin = page.getByRole("button", { name: "3 photos", exact: true });
    await expect(pin).toBeVisible();
    const sand = await resolveColour(page, "var(--sand)");
    expect(await pin.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(sand);
    expect(await pin.evaluate((el) => (el.querySelector("img") as HTMLImageElement).complete)).toBe(false);
    await pin.click();
    await expect.poll(() => h.clicks.length).toBe(1);
    release();
    await expect.poll(() => pin.evaluate((el) => (el.querySelector("img") as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });

  test("a thumbnail that fails leaves the pin with its count and border, pressable, and is not asked for again before a refresh", async ({ page }) => {
    const h = await prepare(page);
    await page.route("**/api/files/broken-*/thumbnail", (route) => route.fulfill({ status: 500 }));
    await dated(page, h, [...same("broken", 3, 35.6812, 139.7671), ...same("fine", 2, 36, 140)], 9);
    const pin = page.getByRole("button", { name: "3 photos", exact: true });
    await expect(pin).toBeVisible();
    const askedFor = () => h.thumbnailRequests().filter((u) => u.includes("broken-")).length;
    await expect.poll(askedFor).toBe(1);
    const sand = await resolveColour(page, "var(--sand)");
    const state = await pin.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      img: getComputedStyle(el.querySelector("img")!).display,
      badge: el.textContent,
      border: getComputedStyle(el).borderTopColor,
    }));
    expect(state).toEqual({ bg: sand, img: "none", badge: "3", border: "rgb(255, 255, 255)" });
    await pin.click();
    await expect.poll(() => h.clicks.length).toBe(1);

    // Leaving the view and coming back makes the pin again; its photo is not asked for.
    await handle(page, "(map, view) => { map.setPoints(view); }", same("fine", 2, 36, 140));
    await page.waitForTimeout(300);
    await handle(page, "(map, view) => { map.setPoints(view); }", [...same("broken", 3, 35.6812, 139.7671), ...same("fine", 2, 36, 140)]);
    await expect(page.getByRole("button", { name: "3 photos", exact: true })).toBeVisible();
    // The data refreshed, which is what lets it ask again.
    await expect.poll(askedFor, { timeout: 5000 }).toBeGreaterThan(1);
  });

  test("a pin whose point left the data is removed after the map comes back on screen", async ({ page }) => {
    const h = await prepare(page);
    await dated(page, h, [...same("keep", 3, 35.6812, 139.7671), ...same("gone", 2, 35.6812, 139.7671 + 0.1)], 11);
    await expect(pinsOf(page)).toHaveCount(2);
    await page.evaluate(() => (document.getElementById("map")!.style.display = "none"));
    await handle(page, "(map, points) => map.setPoints(points)", same("keep", 3, 35.6812, 139.7671));
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.getElementById("map")!.style.display = "";
      (window as any).__handle.resume();
    });
    await expect(pinsOf(page)).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByRole("button", { name: "3 photos", exact: true })).toBeVisible();
  });

  test("pins are not held back while the tiles have not answered", async ({ page }) => {
    const h = await prepare(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(`https://${TILE_HOST}/**`, async (route) => {
      await gate;
      await route.fulfill({ status: 200, contentType: MVT_TYPE, body: VECTOR_TILE });
    });
    await page.goto(FIXTURE_PATH);
    await createMap(page, { points: same("a", 3, 35.6812, 139.7671), center: A, zoom: 12 });
    await expect(pinsOf(page)).toHaveCount(1, { timeout: 4000 });
    expect(h.tileRequests().length).toBeGreaterThan(0);
    release();
  });

  test("I10: 50,000 located photos place pins for the view only, within three seconds", async ({ page }) => {
    const h = await prepare(page);
    await page.goto(FIXTURE_PATH);
    const points: Point[] = Array.from({ length: 50_000 }, (_, i) => ({
      file_id: `p${i}`,
      lat: 35.6 + (((i * 7919) % 50_000) / 50_000) * 0.2,
      lon: 139.6 + (((i * 104729) % 50_000) / 50_000) * 0.3,
      taken_at: `2026-01-01T00:${String(i % 60).padStart(2, "0")}:00`,
    }));
    const started = Date.now();
    await createMap(page, { points, center: [139.75, 35.7], zoom: 12 });
    await expect(pinsOf(page).first()).toBeVisible({ timeout: 15_000 });
    const placed = Date.now() - started;
    test.info().annotations.push({ type: "placement", description: `${placed} ms` });
    console.log(`PLACEMENT_MS ${placed}`);
    expect(placed).toBeLessThan(3000);

    await page.waitForTimeout(1500);
    const pinCount = await pinsOf(page).count();
    expect(pinCount).toBeGreaterThan(0);
    expect(pinCount).toBeLessThan(400);
    // Thumbnails were asked for the pins in the document, not for the drive.
    expect(h.thumbnailRequests().length).toBeLessThanOrEqual(pinCount * 3);
  });
});
