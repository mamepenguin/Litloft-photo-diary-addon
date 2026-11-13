# Code review r1: neutral dark map

Reviewed: 9f8ba75 (diff against aae9b99). Working tree untouched.

Summary of checks with no finding:

- `frontend/map/mapStyle.ts` `PALETTES.dark` matches the SPEC-PD-015 table on all nine rows (land, halo, building, minorRoad, majorRoad, rail, label, secondaryLabel, poiLabel). woods/water/park/river/parkLabel/waterLabel/naturalLabel are unchanged; `PALETTES.light`, `LAYERS` (ids, minzoom, filters, widths, text sizes) and the pin badge are untouched by the diff. Values also equal panel A of the agreed mock, and land = core `--bg-card` `#1c1c1b` (core globals.css:71).
- Tests: `mapStyle.test.ts` pins the whole dark palette with `toEqual` plus four paint lookups; `memoryMap.test.ts` pins every dark layer colour and halo = land; `e2e/support.ts` `DARK` and `e2e/memoryMap.spec.ts` dark building use the new values. Old land `#231216` differs from new `#1c1c1b` by 7/10/5, beyond the e2e tolerance of 4, and the unit tests compare exact strings, so a regression to the old palette fails unit tests and the I8 / SPEC-PD-013 e2e checks. No test anywhere still asserts an old plum value (`git grep` for all old map and core dark tokens in frontend/ and e2e/: no hits).
- Screenshots: land `#1c1c1b`, page ground `#131312`, water `#1c2930`, park `#293127`, woods `#243023`, river `#29414b`, roads `#4d4d4a`/`#363633`, buildings `#30302d`, rail `#767672` are the dominant exact pixel values. bay.png has zero pixels with R exceeding max(G,B) by 8 or more; in the other three, the only such pixels are the pins (see finding 1). Land, water, green and roads remain distinct; labels are legible on the halo.
- No other addon frontend file hard-codes a colour except createPhotoMap.ts (finding 2); the pin uses `var(--sand)`, which the core already made neutral (`#2f2f2c`).

## 1. Pins in the screenshots are solid red, not photos

- File: e2e/support.ts:157-158 (fixture), docs/reviews/neutral-dark-map/screenshots/{z12,z14,z16}.png
- Category: design-diff
- Condition: Only in the review screenshots. The e2e fixture answers every thumbnail with `PNG_1X1`, which renders as a solid `#9e1012` square. The mock draws photo-coloured pins (`#8a6f52`, `#5f7c8e`, `#7d8a5a`), and one selected pin with a coral border. The screenshots also show no selected pin and no tile-failure notice, so those two parts of panel A were not compared.
- Frequency: 0 (does not happen in the product)
- Impact: 1
- Evidence: z12.png has 3,119 pixels of `#9e1012`, the only reddish colour in the frame. These are the pins, not map tint. A reader checking "no red remains" could misread them.

## 2. Pin count badge and pin shadow keep the plum near-black

- File: frontend/map/createPhotoMap.ts:275 (`background:#211922`), frontend/map/createPhotoMap.ts:431 (`rgba(33,25,34,0.25)` shadow)
- Category: B (left in place deliberately; the spec's "Checked, no action" keeps `#211922`)
- Condition: Every dark-theme map with a cluster pin. The badge is a faintly purple near-black (R33 G25 B34) on the neutral `#1c1c1b` land. The shadow is barely visible on a dark ground.
- Frequency: 8
- Impact: 1
- Evidence: This is the only remaining non-neutral dark-mode colour in the addon frontend. Its white 1.5px border keeps it readable. Below the fix threshold; listed because the brief asked for every remaining plum tint.

## 3. At z14 in dense districts the map reads mid-grey, not near-black

- File: frontend/map/mapStyle.ts:46,52 (minorRoad `#363633`, building `#30302d`)
- Category: design-diff
- Condition: Dark theme, z14+, any built-up area. Real OSM footprints cover more of the frame than land does. The mock has a few sparse buildings, so in the mock the near-black land dominates.
- Frequency: 8
- Impact: 1
- Evidence: z14.png has 205,827 px of `#30302d` against 83,826 px of `#1c1c1b`. Minor streets differ from buildings by only 6/6/6 levels, so between blocks the streets mostly read as the dark land gaps. This is the same relationship as panel A, and as the old palette (`#3a2e31` vs `#32282a`, 8/6/7). It is not a regression. Noted only as a visible difference from the mock.

## 4. Zoom control is cut off at the right edge of every screenshot

- File: docs/reviews/neutral-dark-map/screenshots/*.png
- Category: design-diff
- Condition: Capture only. The 900 px clip ends inside the map, so the control (12 px inset in the mock) is half outside the frame. The map's right edge never appears, so this is a crop and not a layout change.
- Frequency: 0
- Impact: 1
- Evidence: The control's white buttons occupy x≈885-900 in all four images, and there is no right map border.

TOTAL: 4 findings
