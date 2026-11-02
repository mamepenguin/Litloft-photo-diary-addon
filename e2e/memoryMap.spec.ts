import { expect, test } from "@playwright/test";
import {
  createMap,
  FIXTURE_PATH,
  MVT_TYPE,
  pixelsNear,
  prepare,
  settle,
  TILE_HOST,
} from "./support";

const varint = (value: number): number[] => {
  const bytes: number[] = [];
  do {
    bytes.push((value & 127) | (value > 127 ? 128 : 0));
    value = Math.floor(value / 128);
  } while (value);
  return bytes;
};
const bytes = (field: number, value: number[]) => [...varint(field * 8 + 2), ...varint(value.length), ...value];
const text = (field: number, value: string) => bytes(field, [...Buffer.from(value)]);
const zigzag = (value: number) => (value << 1) ^ (value >> 31);
const rectangle = (x: number, y: number) => [
  9, zigzag(x), zigzag(y), 26, zigzag(2048), 0, 0, zigzag(2048), zigzag(-2048), 0, 15,
];
function polygons(name: string, entries: { kind: string; x: number; y: number }[]) {
  return bytes(3, [
    ...text(1, name),
    ...entries.flatMap(({ x, y }, i) => bytes(2, [
      ...bytes(2, [0, i]), 24, 3, ...bytes(4, rectangle(x, y).flatMap(varint)),
    ])),
    ...text(3, "kind"),
    ...entries.flatMap(({ kind }) => bytes(4, text(1, kind))),
    40, ...varint(4096), 120, 2,
  ]);
}
const BUILDINGS = Buffer.from(polygons("buildings", [{ kind: "building", x: 0, y: 0 }]));
const SURFACES = Buffer.from([
  ...polygons("land", [{ kind: "forest", x: 0, y: 0 }, { kind: "park", x: 2048, y: 0 }]),
  ...polygons("water_polygons", [{ kind: "water", x: 0, y: 2048 }, { kind: "river", x: 2048, y: 2048 }]),
]);

for (const [theme, colours] of Object.entries({
  light: { building: "#EBEBE8", surfaces: ["#DCE8D8", "#E5EEDF", "#DCECF1", "#C5DFE8"] },
  dark: { building: "#32282A", surfaces: ["#243023", "#293127", "#1C2930", "#29414B"] },
})) {
  test(`SPEC-PD-013 ${theme}: forests, parks, lakes and rivers remain visibly distinct`, async ({ page }) => {
    const h = await prepare(page);
    await page.route(`https://${TILE_HOST}/**`, (route) => route.fulfill({ contentType: MVT_TYPE, body: SURFACES }));
    await page.goto(FIXTURE_PATH);
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await createMap(page, { points: [], center: [139.7671, 35.6812], zoom: 12 });
    await settle(page, h);
    for (const count of await pixelsNear(page, colours.surfaces, 0)) expect(count).toBeGreaterThan(2000);
  });

  test(`SPEC-PD-013 ${theme}: building footprints appear only from zoom fourteen`, async ({ page }) => {
    const h = await prepare(page);
    await page.route(`https://${TILE_HOST}/**`, (route) => route.fulfill({ contentType: MVT_TYPE, body: BUILDINGS }));
    for (const zoom of [13, 14]) {
      await page.goto(FIXTURE_PATH);
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await createMap(page, { points: [], center: [139.7671, 35.6812], zoom });
      await settle(page, h);
      const [count] = await pixelsNear(page, [colours.building], 0);
      if (zoom < 14) expect(count).toBe(0);
      else expect(count).toBeGreaterThan(30);
    }
  });
}
