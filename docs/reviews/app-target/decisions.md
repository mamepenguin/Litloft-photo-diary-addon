# Photo Diary Target and app header: verification record

spec: docs/specs/app-target.md

ran_in_app: yes
at: 83c70627cd9631b92239a026a70677e971bf91fb
by: agent
evidence: |
  Third R-5 run, map only, after the fixes for code-r2 (T1, N1, N2); one checker on the scratch stack (litloft-r5-apphdr, port 3994) started and stopped by the author. Every item passed: an untouched map keeps its first view across an empty target and across a failed read and retry; no tile-failure notice after a retry; the second run's map items unchanged. The fixture's targets share the same three places, so keeping the view and fitting again give the same numbers; the unit tests for N1 tell them apart. Record below; screenshots in screenshots/r3/. The layout and calendar did not change since the second run (at 0345d14), whose record follows.
pending: |
  Real phone, LAN and live tile delivery (agent_cannot_verify).

decision:

## Third run (map only)

# R-5 (third run, map2) — Photo Diary Target / header, map items

- Core checkout: `504a25892a45b42a7b1d3a29e2a77767d696beef`
- Addon `addons/photo_diary`: working tree HEAD `c00056e` = `83c7062` (the change under test) + a docs-only
  commit (`docs/reviews/app-target/{code-r3.md,decisions.md,design-check.md}`); no code differs from
  `83c7062`. Recorded against `83c7062`.
- Stack: `http://localhost:3994` (compose project `litloft-r5-apphdr`), used as prepared. Nothing was
  started, stopped, rebuilt or written. No smart folder, tag, note, rescan or policy was changed; the
  only writes were target choices in my own disposable browser contexts (`localStorage`) and the
  `page.route` 500 served inside my browser.
- Browser: Playwright 1.58.2 Chromium (`frontend/node_modules/@playwright/test`), launched with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; 1280x800, locale `ja-JP`,
  `NEXT_LOCALE=ja` cookie, a fresh context per run.
- Scripts: `.r5/pd2/map2/{lib2.cjs,item1.cjs,item2-persist.cjs,item3.cjs,item3b-state.cjs,probe-tiles.cjs}`.
  Every captured state appended one JSON line to `.r5/pd2/map2/manifest.jsonl` (20 lines, one per
  state) with state name, viewport, screenshot path and the DOM measurements. Screenshots in `.r5/pd2/map2/` with the
  `pd2-map2-` prefix.
- How centre and zoom were read (same method as the second run): `sessionStorage["photo_diary:state:main"]`
  (`center`, `zoom`, `target`), written by the page from the map's own callbacks, and each pin's
  `transform: translate(x,y)` expressed as an offset from the map rect's centre (stable when the map
  narrows for an open pin list). Plus: vector-tile responses (`vector.openstreetmap.org`, status) and
  the presence of the tile-error string 「地図を読み込めません」 anywhere in the page text.
- Drive `main` as given: 48 images, `Trips photos` 12, `Photos` 42, `Videos only` 0, 32 located photos
  in three places (Tokyo, Kyoto, Hakodate).

## 1. First fit only: `Videos only` then `Trips photos`; and a failed read then retry

States: `01-item1-first-draw-untouched`, `02-item1-videos-only`, `03-item1-trips-after-videos`,
`04-item1-points-500`, `05-item1-retry-drew`.

- Default first draw (map not touched at all: no pan, zoom, pin click or window resize; only the
  header's Target menu was opened afterwards): N `· 48枚`, 3 pins `写真 11枚` / `写真 11枚` / `写真 10枚`,
  map 1040x609.6 at (240, 190.4), saved view center `[138.24721944444445, 38.47136064500543]`,
  zoom `5.38684785113903`. Pin offsets from the map centre: Tokyo `(+90.42, +208.39)`,
  Hakodate `(+147.54, -256.77)`, Kyoto `(-147.55, +257.17)` (`pd2-map2-01-item1-first-draw-untouched.png`).
- Chose `Videos only`: N `· 0枚`, 「位置情報のある写真はありません」, no `.maplibregl-map` and no canvas,
  0 pins; the saved state still held the first view's center/zoom (`pd2-map2-02-item1-videos-only.png`).
- Chose `Trips photos` without touching the map: N `· 12枚`, 3 pins `写真 3枚` / `写真 4枚` / `写真 3枚`
  = 10 located, saved view center `[138.24721944444445, 38.47136064500543]`, zoom `5.38684785113903`
  — **identical to the digits** to the first draw; the pins sit at the first view's offsets
  (Tokyo `+90.42 / +208.39` = 4枚, Hakodate `+147.54 / -256.77` = 3枚, Kyoto `-147.55 / +257.17` = 3枚),
  all three inside the map (`pd2-map2-03-item1-trips-after-videos.png`). The map was really re-created
  and redrawn: the vector-tile log went 6 tiles (first draw) → 12 tiles (after `Videos only` →
  `Trips photos`, i.e. 6 fetched again) → 18 tiles (after the retry), all 200.
- Failed read: `page.route("**/api/addons/photo_diary/points*")` answered **500 once**, then the target
  was changed to `Photos`. The intercepted request was
  `…/api/addons/photo_diary/points?folder=Photos` (the new target's parameters). The state:
  `対象: Photos`, N `· 42枚`, map area shows 「読み込めませんでした」 with a `再試行` button, **no map**
  (no `.maplibregl-map`/canvas), 0 pins, nothing of the previous target on screen
  (`pd2-map2-04-item1-points-500.png`). The map was still untouched up to here.
- Pressed `再試行`: the map came back with 3 pins `写真 11枚 / 写真 11枚 / 写真 10枚`, map 1040x609.6,
  canvas 1040x610, 「© OpenStreetMap contributors」 drawn, no load error
  (`pd2-map2-05-item1-retry-drew.png`). Saved view center `[138.24721944444445, 38.47136064500543]`,
  zoom `5.38684785113903`, and the pin offsets `+90.42/+208.39`, `+147.54/-256.77`, `-147.55/+257.17`
  are the first view's — identical to `01` and `03` (same centre, same zoom, same offsets).
- **Caveat on "it does not fit again".** Every target on this drive locates photos in the same three
  places, so a fresh fit of `Trips photos` (three pins) or of `Photos` gives exactly the numbers of the
  default first fit. The observation is therefore "the view after the change equals the first view",
  which is what the item asks, but equality alone cannot prove that no fit ran: a fit of the same places
  would land on the same centre and zoom. Nothing in the captured states distinguishes the two. What I
  can say is that no different view was ever drawn and no pin moved.

## 2. Tile-failure notice after the successful retry

States: `17-item2-first-draw`, `18-item2-points-500`, `19-item2-retry`, `20-item2-retry-after-12s`
(an independent repeat of the same sequence; `05` is the same state in item 1's run).

- After the retry the map drew 18 vector tiles from `vector.openstreetmap.org/shortbread_v1/…` with
  status 200 and **0 failed**, and the downloaded map is on screen (labels, coastline, attribution) in
  `pd2-map2-19-item2-retry.png` and `pd2-map2-05-item1-retry-drew.png`.
- 「地図を読み込めません」 was not in the page text in the retry state (`tileError: null`, zero matching
  DOM nodes), and not at any of 20 samples taken every 600 ms over the following 12 s
  (`anyTileErrorInPoll: false`); the canvas stayed present and the 3 pins stayed drawn. The state after
  those 12 s (N `· 42枚`, centre/zoom unchanged) is `pd2-map2-20-item2-retry-after-12s.png`.
- In the failed state (`18`) the 500 was the load error 「読み込めませんでした」 with `再試行`, not the
  tile notice; `04` shows the same.

## 3. Second run's map items, repeated

### 3a. Zoomed view + open pin list, then a target change

States: `06-item3-first-draw`, `07-item3-zoomed`, `08-item3-pin-list-open`, `09-item3-trips-after-change`.

- Default first draw: N `· 48枚`, 3 pins 11/11/10, saved view `[138.24721944444445, 38.47136064500543]`
  / `5.38684785113903`.
- Wheeled 3 notches anchored on the Tokyo pin: 1 pin `写真 11枚` at offset `(+91.36, +209.39)` on a
  1040x609.6 map; saved view `[139.2483566336723, 36.64074130701438]` / `6.951514216302286`
  (`pd2-map2-07-item3-zoomed.png`).
- Clicked that pin: pin list opened with 11 items, map narrowed to 688x609.6, the same pin at
  `(+91.36, +209.39)`; saved view unchanged (`pd2-map2-08-item3-pin-list-open.png`).
- Chose `Trips photos`: `対象: Trips photos`, N `· 12枚`, the pin list is **closed** (0 `?file=` links),
  map back to 1040x609.6, one pin `写真 4枚` at `(+91.36, +209.39)`; saved view
  `[139.2483566336723, 36.64074130701438]` / `6.951514216302286`, identical to before the change
  (`pd2-map2-09-item3-trips-after-change.png`).
- The other two clusters are outside this kept view, so they are not drawn — the kept zoom, not a
  missing pin (the same target's 3-pin fit is seen in 3b).

### 3b. A map with no view of its own fits a target chosen after `Videos only`

States: `10-item3b-videos-preset`, `11-item3b-trips-after-videos`,
`12-item3b-trips-fresh-first-draw` (reference), plus `13`-`16` below.

- Fresh context whose saved target was `Videos only` before the page loaded: `対象: Videos only`,
  N `· 0枚`, 「位置情報のある写真はありません」, no map, no canvas, **no saved view** (`savedView: null`)
  (`pd2-map2-10-item3b-videos-preset.png`).
- Chose `Trips photos`: N `· 12枚`, the map was drawn 1040x609.6 with 3 pins `写真 3枚 / 写真 4枚 /
  写真 3枚` (10 photos), **all three inside the map**, offsets `(+147.54, -256.77)`, `(+90.42, +208.39)`,
  `(-147.55, +257.17)` (`pd2-map2-11-item3b-trips-after-videos.png`).
- Reference, a fresh context whose first draw is under `Trips photos`: the same three offsets, all pins
  in view, and a stored view of centre `[138.24721944444445, 38.47136064500543]`, zoom
  `5.38684785113903` (`pd2-map2-12-item3b-trips-fresh-first-draw.png`). The two offset lists are
  identical, so the map created after the empty target fitted its pins the same way a first draw does
  (`11` stores no view of its own, so its centre/zoom are read from those offsets against the reference's
  stored numbers).
- Observed difference in the same state, not named by my items: the map created after the empty target
  never wrote its fitted view to the saved state (`11`: `savedView: null`), while the first-draw
  reference did (`12`: centre/zoom above, target `9wtPuwywyItx`). I polled `sessionStorage` 16 times
  over 12 s in a repeat of this path (`14-item3b-state-after-fit-12s`) — still `null` — and then
  wheel-zoomed; that wrote the state (`15-item3b-state-zoomed`: `[139.518724803012, 40.19325313539093]`
  / `6.4299587612478675`), and an in-page switch Calendar → Map restored the zoomed view
  (`16-item3b-state-back-to-map`, same numbers, pin offset `(+148.12, -256.41)`).
  So the fitted view of a map re-created after an empty target is not persisted until the viewer moves
  the map. I saw no user-visible consequence in this fixture, because the only view that state would
  restore is the fit itself (returning re-fits to the same place); I did not produce a case where the
  two differ (the next section).

## Could not check

- Whether item 1's kept view is "restored" rather than "re-fitted": impossible to separate on this
  drive, where every target's located photos are the three same places, so a fit equals the first view.
  The equality is reported as the item states it; a fit cannot be ruled out from the numbers.
- A user-visible consequence of `savedView: null` after a map re-created from an empty target: with this
  fixture the restored view and a re-fit coincide, so Back-from-a-photo or a tab switch looks the same
  either way. A drive where a target holds pins in other places would show it.
- Tiles, pins and thumbnails over the real home LAN, a real phone, iOS (`PROJECT.md`
  `agent_cannot_verify`).
- Other checkers' items (layout, header, calendar, target menu) — not this role's items.
- Server state was not touched: all smart folders, tags, notes and policies were left as given; the
  500s were answered by `page.route` inside my browser.

## Verdict per item

PASS 1. At 1280x800 with the default target the untouched first draw had centre
`[138.24721944444445, 38.47136064500543]` / zoom `5.38684785113903`; after `Videos only` (no map) and
then `Trips photos` the map came back at the same centre, same zoom and the same pin offsets; after a
one-shot 500 on the target change's `/points`, the retry drew the map at the same centre, same zoom and
the same pin offsets as the first view.

PASS 2. After that retry the working map shows no 「地図を読み込めません」 notice (none in 20 samples
over 12 s), the canvas and 「© OpenStreetMap contributors」 are drawn, and 18 vector tiles answered 200
with none failed.

PASS 3. Zoomed view (zoom `6.951514216302286`, centre `[139.2483566336723, 36.64074130701438]`) with an
open 11-item pin list: changing to `Trips photos` closed the list (11 → 0 items) and kept the centre,
zoom and the pin's offset `(+91.36, +209.39)`. A fresh page with `Videos only` saved (no map, no saved
view) then `Trips photos` fitted the three pins into view with pin offsets identical to a fresh first
draw under `Trips photos` (whose stored centre is `[138.24721944444445, 38.47136064500543]`, zoom
`5.38684785113903`).

Failures: none.

## Second run

### Checker: layout

# R-5 (layout) — Photo Diary Target / app header

- Core checkout: `504a25892a45b42a7b1d3a29e2a77767d696beef`
- Addon `addons/photo_diary`: `0345d1473ad0f82fb795120d83c307ec754b8b54` (0345d14)
- Stack: `http://localhost:3994` (compose project litloft-r5-apphdr), used as given. Nothing was
  started, stopped, rebuilt or written. Targets were chosen in my own browser contexts only;
  no smart folder, tag, note, rescan or policy was changed.
- Browser: Playwright 1.58.2 (Chromium from `frontend/node_modules/@playwright/test`), launched with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. Each width used a fresh
  context with the `NEXT_LOCALE=ja` cookie; 375x812 had `hasTouch`, `isMobile`, DPR 2.
- Scripts: `.r5/pd2/layout/{lib.cjs,run-item1.cjs,run-item2.cjs,run-item3.cjs,run-item4.cjs,
  measure-extra.cjs,measure-cal.cjs,artboards/}`. Measurements for every captured state are in
  `.r5/pd2/layout/manifest.jsonl` (36 lines, one per screenshot), screenshots in
  `.r5/pd2/layout/shots/` with the `pd2-layout-` prefix.
- Drive `main`: 48 active images, 12 tagged `trip`; `Trips photos` = 12, `Photos` = 42,
  `2025 summer trip, camera footage only` = 42, `Videos only` = 0 images, `Long clips only`
  unusable.

## 1. Header on Calendar and Map at 1280x800 / 768x800 / 640x800 / 375x812

I loaded `/drive/main/addons/photo_diary` in each viewport, captured Calendar, switched to Map,
chose `Trips photos`, captured both views, chose `2025 summer trip, camera footage only`, captured
both views: 24 states (screenshots `shots/pd2-layout-<state>.png`):

`1280-calendar-default`, `1280-map-default`, `1280-calendar-trips`, `1280-map-trips`,
`1280-calendar-long`, `1280-map-long`, and the same six for `768-`, `640-`, `375-`.

Header geometry (identical on Calendar and Map and under all three targets at a given width, except
the Target's width and left edge, which follow the name; the values below are the default target):

| viewport | h1 clipped | h1 shares row with Target | Target rect | Target h | button right / content edge | chevron right (gap to content edge) | tabs top vs h1 bottom | scrollWidth = innerWidth |
|---|---|---|---|---|---|---|---|---|
| 1280x800 | no (client 797 / scroll 797) | yes | 134.6x28, x 1129.4 right 1264 | 28 | 1264 / 1264 (0.0) | 1256 (8.0 inside) | 144.4 vs 116.4 (+28) | 1280 = 1280 |
| 768x800 | no | yes | 134.6x28, right 752 | 28 | 752 / 752 (0.0) | 744 (8.0 inside) | 144.4 vs 116.4 (+28) | 768 = 768 |
| 640x800 | no | yes | 134.6x28, right 624 | 28 | 624 / 624 (0.0) | 616 (8.0 inside) | 144.4 vs 116.4 (+28) | 640 = 640 |
| 375x812 | no (291 / 291) | **no**, shares the scope row instead | 134.6x44, x 232.4 right 367 | 44 | 367 / 359 (**+8**, the design's -8px margin) | 359 (0.0, flush) | 168.4 vs 116.4 (+52) | 375 = 375 |

- Title フォトダイアリー: 24px, one line, `white-space: nowrap`, not clipped at any of the 24 states.
  At 375 it is alone on its row (Target top 120.4 > h1 bottom 116.4); at 640/768/1280 the Target
  shares the title row (Target 84-112 inside h1 84-116.4).
- Scope line: `main · 48枚` (default), `main · 12枚` (`Trips photos`), `main · 42枚`
  (`2025 summer trip, camera footage only`) at every width and in both views; drive name `main`,
  count 14px `rgb(98, 98, 91)`.
- Quiet Target: computed `background-color: rgba(0, 0, 0, 0)`, `border-width: 0px`, innerText is
  the name only (no 対象), accessible name `対象: <name>` (e.g. `対象: すべての写真`,
  `対象: Trips photos`, `対象: 2025 summer trip, camera footage only`), muted text.
- Right end: from 640 the Target box's right edge equals the header's content edge
  (header right 1264/752/624 minus 16px right padding) to 0.0px. The chevron's own right edge is
  8px inside the content edge at 640/768/1280 because the control has `padding: 4px 8px`; the
  agreed artboards measure the identical 8px (see item 4: artboard chevron right 1256, content
  edge 1264). At 375 the chevron is exactly on the content edge (359 = 359) and the button box is
  8px past it, matching the artboard's `margin-right:-8px`.
- Below 640 the Target sits at the end of the scope line: y 120.4-164.4, right of the count
  (count right 224.4 default / 143.6 long, Target left 232.4 / 151.6), 8px gap.
- Tabs: `nav[role=tablist]` with カレンダー / 地図 under the title at every width; top 144.4
  (h1 bottom 116.4) at 640/768/1280 and 168.4 at 375, i.e. below both the title and the Target,
  spanning the content width (256-1264 at 1280, 16-359 at 375). カレンダー selected on Calendar,
  地図 selected on Map.
- Overflow: `document.documentElement.scrollWidth` equalled `window.innerWidth` in all 24 states
  (1280/768/640/375), and again in the menu and artboard states.
- 375 with the long folder: the name span has `text-overflow: ellipsis`, `white-space: nowrap`;
  **visible width 163px, full width 255px** (`clientWidth 163`, `scrollWidth 255`), so it is cut
  inside the 215.4px-wide Target; the screenshot reads `2025 summer trip, cam…`
  (`shots/pd2-layout-375-calendar-long.png`, `shots/pd2-layout-375-map-long.png`).
- Also observed at 768/640 the long name is cut too (768: 242/255; 640: 191/255); the title and
  the count are never cut, as the spec allows.

Screenshots: `shots/pd2-layout-{1280,768,640,375}-{calendar,map}-{default,trips,long}.png`
(24 files).

## 2. Target menu at 1280 and 375

Opened with the default target from Calendar; one state per width:
`shots/pd2-layout-1280-target-menu.png`, `shots/pd2-layout-375-target-menu.png`.

- 1280: menu 200x391 at x 1064-1264, y 116-507, below the Target, right edge on the content edge;
  inside the viewport, no scroll (client 389 = scroll 389).
- 375: bottom sheet 359x371 at x 8-367, y 425-796, inside the viewport (bottom 796 < 812), no
  scroll (client 369 = scroll 369).
- Rows, in order (both widths, same text): すべての写真 with count **48** (aria-checked true,
  highlighted), Videos only, **Long clips only**, 2025 summer trip, camera footage only, Photos,
  Trips photos, Holiday 25, Trips, then 管理… (role menuitem). Menu heading 対象 is drawn as the
  group label (`aria-hidden`), not on the control.
- `Long clips only`: `disabled` attribute present, `aria-checked=false`, computed `opacity: 0.5`,
  `cursor: not-allowed`, `title="この対象は使えません"`; its innerText is exactly
  `Long clips only` — the reason is **not drawn as text** (matched nowhere in the menu's visible
  text). This matches the human decision recorded in `decisions.md`.

## 3. Map stage at 375, 768 and 1280

Measured on the Map view under the default target (same numbers under `Trips photos` and the long
folder), and again in the dedicated states
`shots/pd2-layout-{1280,768,375}-map-stage-default.png`:

| viewport | stage rect | height | bottom vs viewport bottom | height vs 24rem (384) |
|---|---|---|---|---|
| 1280x800 | x 240, w 1040, y 190.4-800 | 609.6 | 800 = 800 (0.0) | +225.6 |
| 768x800 | x 0, w 768, y 190.4-800 | 609.6 | 800 = 800 (0.0) | +225.6 |
| 375x812 | x 0, w 375, y 220.4-812 | 591.6 | 812 = 812 (0.0) | +207.6 |

The inline height is `calc(100dvh - <stage top>px)` in each case; the stage and the MapLibre host
have the same rect; `window.scrollY` was 0 and `scrollWidth == innerWidth` in every state.
Extra, at 640x800 (same run): 640x609.6, bottom 800 = 800, +225.6 over 24rem.

Supplemental on the "target that holds no image" fix (not part of the stage geometry, recorded
because it changes the same surface): with `Videos only` (0 images) the Map view at 1280, 768 and
375 draws no stage and no map canvas, shows 「位置情報のある写真はありません」, the header reads
`main · 0枚` / `Videos only`, and there is no horizontal overflow; no pin or old map is left
behind (`shots/pd2-layout-{1280,768,375}-map-empty-videos.png`). A stage only exists when the map
is drawn, so 24rem does not apply to that state.

## 4. Artboards rendered and compared

The saved design directory has no `support.js`, so I copied the four boards plus the minimal
renderer used earlier (`.r5/pd-artboards/support.js`, unchanged) into
`.r5/pd2/layout/artboards/` and loaded them from `file://` with no app; markup and CSS were not
edited. Rendered at the canvas widths: Main 1280x860, Map 1280x860, Phone 375x812, Phone-Long
375x812:

- `shots/pd2-layout-artboard-main-1280.png`
- `shots/pd2-layout-artboard-map-1280.png`
- `shots/pd2-layout-artboard-phone-375.png`
- `shots/pd2-layout-artboard-phone-long-375.png`

Measured in the artboards: Main/Map header content edge 1264, target 136x36 with right edge 1264
and chevron right 1256 (8 inside), scope `photos · 1,284枚`, tabs at y 77.4 with links 76.6/36
wide and 24px gap; Map area 1039x739.6 at y 120.4-860, four 52px pins, attribution bottom-right;
Phone target 134.6x44 right 367 (chevron 359, content edge 359), scope top 94.9 with h1 bottom
89.4, tabs y 133.4 with links 76.6/36 and 24px gap; Phone-Long identical with a 197.2px Target
whose name is cut (name visible 145 of 318px, Map tab selected).

Visible differences from the app screenshots:

**Main.dc.html vs `pd2-layout-1280-calendar-default.png`**
1. D — The artboard has no core top app bar and an empty sidebar; the app draws the top bar
   (search / quick note / profile) and a populated sidebar. The app's header therefore starts at
   y 76 and h1 at 84; the artboard's h1 is at y 8.
2. D — Declared (calendar illustrative): the artboard lays 7 columns across the full 1007px
   content width (cells about 138.7x84, radius 12); the app keeps today's 416px calendar column
   (cells 54.3x76, radius 12) and leaves the day-panel column empty to its right.
3. D — Month bar: artboard 2026年10月 with plain enabled prev/next arrows and 今日 +
   撮影日なし 12 pushed to the right end; app 2025年9月 with a month-picker chevron, a disabled
   next-month disc, and 今日 + 撮影日なし 10 grouped on the left.
4. D — Note mark: artboard a 6x6px dark dot at the day number's right; app a 12px pen icon
   (14px at wide) — visible on 2 in the September screenshot.
5. D — Tabs: artboard 24px gaps, 4px horizontal padding, 2px underline hugging each label
   (76.6 / 36px wide, 43px tall); app 4px gaps, 16px horizontal padding, 12px top radius, underline
   100.6 / 60px wide (38px tall). The 地図 label starts at x 357.6 in the artboard and 360.6 in
   the app.
6. D — Data, not layout: artboard scope `photos · 1,284枚`, target カメラの写真, counts 18/31/etc.;
   app `main · 48枚`, target すべての写真, September 2025's counts.
7. D — Target height/casing: artboard 36px tall; app 28px (fine pointer). Text, icon, chevron,
   transparent fill and the 8px chevron inset are the same.

**Map.dc.html vs `pd2-layout-1280-map-default.png`**
1. D — Same top-bar/sidebar/header-offset difference as Main (app header at 76, artboard at 0).
2. D — Declared (map illustrative): the artboard is a flat beige/blue drawing with four 52px pins
   (48px + 2px white border, radius 10); the app is MapLibre with OSM raster tiles, three 50px
   pins (radius 12, 2px border) and real geography.
3. D — Attribution: artboard bottom-right (8px from right, 6px from bottom); app top-left at the
   map's top-left corner (240, 190.4).
4. D — Zoom controls: app draws MapLibre's +/- group at the top right (29x58 at 1241,200.4); the
   artboard has none.
5. D — Map start/height: artboard map is flush under the tabs (y 120.4) in a 1039x739.6 area to
   the board's bottom 860; the app starts 8px below the tabs (y 190.4) and fills 1040x609.6 to
   the viewport bottom 800.
6. D — Tabs spacing/underline as in Main difference 5.
7. D — Data: artboard pins 42/7/118/3, app 写真 10枚/11枚/11枚.

**Phone.dc.html vs `pd2-layout-375-calendar-default.png`**
1. D — Top bar: artboard only a hamburger in 48px; app hamburger + search + quick note + profile
   in 76px, so the whole header sits lower in the app (h1 84 vs 57).
2. D — Scope/target vertical spacing: artboard's scope text starts 5.5px below the title (89.4 ->
   94.9) and its 44px Target rises to 83.4, overlapping the title row by 6px; app's scope text
   starts 16px below the title (116.4 -> 132.4) and its 44px Target starts at 120.4, 4px below the
   title bottom, with its name at 132.4. Both put the Target at the scope line's end with the same
   134.6x44 box, right 367, chevron 359.
3. D — Tabs spacing/underline as in Main difference 5 (artboard y 133.4, h 43; app y 168.4,
   h 44).
4. D — Declared: artboard cells 52px tall, radius 10, 4px gaps, centered number/count; app cells
   43.9x48, radius 12, 6px gaps, left-aligned number/count on a 343px grid.
5. D — Note mark: artboard none; app draws the pen icon on 2.
6. D — 撮影日なし: artboard does not draw the control; app draws 撮影日なし 10 under the grid.
7. D — Month bar and 今日 placement as in Main difference 3 (2026年10月 with both arrows and 今日
   at the right vs 2025年9月 with picker, disabled next disc, 今日 left).
8. D — Data: artboard `photos · 1,513枚`, 2026年10月; app `main · 48枚`, 2025年9月.

**Phone-Long.dc.html vs `pd2-layout-375-map-long.png` (and `pd2-layout-375-calendar-long.png`)**
1. D — The artboard is the Map view (地図 selected) with four illustrative 52px pins; the app's
   long-name Map state is MapLibre with three 50px pins, attribution top-left and a +/- control
   top-right, and its stage starts at 220.4 (8px under the tabs) rather than flush at 176.4.
2. D — Long name in the Target: artboard's 197.2px button cuts
   `2026年夏 北海道旅行（カメラで撮った写真だけ）` to `2026年夏 北海道旅…` (name visible 145px of
   318px); the app's 215.4px Target cuts `2025 summer trip, camera footage only` to
   `2025 summer trip, cam…` (visible 163px of 255px). Both cut with an ellipsis inside the Target;
   the text differs (data).
3. D — Top bar, scope/target vertical spacing, tabs spacing, 撮影日なし (artboard absent, app
   撮影日なし 4), and month-bar differences as in Phone differences 1-3 and 7.

No difference contradicts the spec's checkable lines (title row / tabs row / scope line / quiet
Target / ellipsis); the calendar, map and pin differences are the declared illustrative ones, and
both keep today's look.

## What I could not check

- Real phone, real LAN, iOS (`PROJECT.md` `agent_cannot_verify`).
- The Target's hover/open fill was not exercised (my items ask only the resting layout); the open
  state was seen only as the menu scrim.
- The moment the scope line shows the drive alone while N is unknown, and the map stage while a
  pin list narrows it, were not part of these items and were not captured.
- The saved design directory has no `support.js`; the artboards were rendered with the minimal
  directive renderer already used for the first R-5 record (copied unchanged). The four HTML files
  and their CSS are unchanged, but the renderer is not the Design Canvas runtime.
- 375px was Chromium with touch/mobile emulation, DPR 2, not a real handset.

## Verdict per item

PASS 1. Header on Calendar and Map at 1280x800, 768x800, 640x800 and 375x812, with the default,
`Trips photos` and the long folder: title whole and alone below 640, scope `<drive> · N枚`, quiet
Target at the right end (chevron 8px inside at >=640, flush at 375, as in the artboards), tabs
under the title, no horizontal overflow in any of the 24 states; 375 long name 163/255px with an
ellipsis.

PASS 2. Target menu at 1280 and 375: すべての写真 48 checked, all folders, `Long clips only`
disabled with `title="この対象は使えません"` and no visible reason text, 管理…, menu inside the
viewport at both widths.

PASS 3. Map stage at 375 (591.6px, bottom 812), 768 (609.6, bottom 800) and 1280 (609.6, bottom
800): flush with the viewport bottom and at least 24rem in every state.

PASS 4. All four artboards rendered at their widths; every visible difference is listed above and
none contradicts the spec's checkable lines.

Failures: none.

### Checker: target

# R-5 record — target (calendar)

- Stack: `litloft-r5-apphdr` at http://localhost:3994 (left running; nothing started, stopped or rebuilt).
- Core checkout: `504a25892a45b42a7b1d3a29e2a77767d696beef`
- Photo Diary addon: `0345d1473ad0f82fb795120d83c307ec754b8b54` (0345d14)
- Browser: Playwright Chromium (shipped with `frontend/node_modules/@playwright/test`), fresh context per run, viewport 1280x800, launched with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Every target choice was made through the header's Target menu; a choice writes only the context's `localStorage` (`litloft.addon.photo_diary.target.main`). No smart folder, tag, note, rescan or policy was changed. Nothing was committed; the diff was not read and no unit test was run.
- The app rendered in English (the browser's `en-US` locale): `All photos`, `No capture date`, `· N photos`. The Japanese `· 0枚` case is therefore observed as `· 0 photos`; the numeric value matches.
- Measurements and screenshots: one JSON line per state in `manifest.jsonl` (24 states), screenshots in this directory. The only artificial condition: in item 1 the two calendar GETs were held 1.4–2.2 s at the browser's network layer so the in-between state could be sampled; the requests and their responses are the app's own, and the request count is unaffected.

## 1. Calendar at 1280 — default then `Trips photos`

Start: `/drive/main/addons/photo_diary?month=2025-09` (screenshot `pd2-target-item1-default-2025-09.png`).

- Scope line and N: `main · 48 photos`. Target: `Target: All photos`, text `All photos`. Grid `September 2025`.
- Tinted September days (9, each 1 photo): 09-03, 09-06, 09-09, 09-12, 09-15, 09-16, 09-18, 09-21, 09-24.
- August (after one Previous month, screenshot `pd2-target-item1-default-2025-08.png`): 10 tinted days, each 1 photo: 08-03, 08-06, 08-09, 08-12, 08-14, 08-15, 08-18, 08-21, 08-24, 08-27.
- "No capture date": `No capture date 10`.
- Note marks: 09-02 in September (the day has no photo under this target, cell has the pen mark); 08-24 in August (that day also has a photo). No other note mark.

Change to `Trips photos` while the URL is `?month=2025-09`:

- No page load: `window.__pdMarker` set before the click survived (`kept`), the document's navigation count did not change, and the URL stayed exactly `.../photo_diary?month=2025-09`.
- Scope line during the change (with the calendar reads held 1.4 s): the header read `Photo Diary | main | Trips photos | Calendar | Map` — i.e. the scope line was the drive name `main` alone, the old `48` was gone at once, and the Target already read `Trips photos`. When the new answer landed the line became `main · 12 photos`. Screenshot of the in-between state: `pd2-target-item1-scope-changing.png` (grid area empty; no month, no counts, no tints). Sequence sampled: `null count, month null, 0 day cells` → `· 12 photos, month September, 0 cells` → `· 12 photos, 30 cells, 2 tinted`.
- New N: `main · 12 photos`.
- Tinted September days: 2 — 09-03 and 09-06 (screenshot `pd2-target-item1-trips-2025-09.png`). August under the same target: the same 10 tinted days, each 1 photo (screenshot `pd2-target-item1-trips-2025-08.png`).
- Note marks: 09-02 still marked in September; 08-24 still marked in August. Unchanged.
- Requests sent by that one change (page network log): exactly **1** `/calendar/months` and **1** `/calendar/days`:
  - `GET /api/addons/photo_diary/calendar/months?tag=trip&folder=Photos`
  - `GET /api/addons/photo_diary/calendar/days?tag=trip&folder=Photos&month=2025-09`
- `No capture date` control is not drawn under this target (N = 2 + 10 + 0).

## 2. Target change on a month the target has nothing in, then a URL without a month

- Opened `?month=2025-07` with the default target (screenshot `pd2-target-item2-2025-07-default.png`): `July 2025`, N `· 48 photos`, 9 tinted days summing 10, `No capture date 10`.
- Chose `Trips photos` (screenshot `pd2-target-item2-2025-07-trips.png`): URL stayed `.../photo_diary?month=2025-07`; the grid stayed `July 2025` (it did **not** jump to September, the newest month of the target); every July cell has count 0, no tint, no note mark, no `No capture date` control; target `Trips photos`, N `· 12 photos`. The change sent 1 months and 1 days request (both for `month=2025-07`).
- Opened `.../photo_diary` with no query under that target (screenshot `pd2-target-item2-no-month-trips.png`): `September 2025` — the target's newest month (`/calendar/months?tag=trip&folder=Photos` answers only 2025-09 and 2025-08, newest 2025-09) — with 2 tinted days (09-03, 09-06) and N `· 12 photos`.

## 3. `Videos only` (a target that holds no image)

Started from `?month=2025-08` under `Trips photos` (screenshot `pd2-target-item3-2025-08-trips-before.png`: N 12, August sum 10, mark on 08-24). Chose `Videos only` (screenshot `pd2-target-item3-2025-08-videos.png`):

- Scope line and N: `main · 0 photos`; Target `Videos only`.
- Every August cell has count 0 (`nonZero: []`), no tint on any cell.
- No `No capture date` control is drawn at all, and N is 0 (so no undated photo).
- Requests sent: `GET /calendar/months?none=true` and `GET /calendar/days?none=true&month=2025-08` (1 each), which is the empty-target contract.
- Note marks stay: 08-24 in August and, after one Next month, 09-02 in September (screenshot `pd2-target-item3-2025-09-videos.png`); both months still reachable with 0 photo counts.
- Pressability: pressed 08-24 — the URL became `?month=2025-08&date=2025-08-24`, the day panel opened with the note text (「東京の朝。港の近くを歩いた。 光がきれいだった また来たい」) and `No photos on this day` (screenshot `pd2-target-item3-note-2025-08-24-videos.png`). Closed it, moved to September and pressed 09-02 — the panel opened with its note text (「写真のない日のメモ。 雨だったので家で本を読んだ。」) and `No photos on this day` (screenshot `pd2-target-item3-note-2025-09-02-videos.png`). Both marks work under the empty target.

## 4. Back from a photo under `Trips photos`; long-named folder then the default

- Fresh context; `?month=2025-09` default (screenshot `pd2-target-item4-start-default.png`): N 48, September 9 tinted days (sum 9), `No capture date 10`, note 09-02.
- Chose `Trips photos` (screenshot `pd2-target-item4-trips-2025-09.png`): N 12, tints 09-03 and 09-06, note 09-02.
- Opened the 09-03 day list (screenshot `pd2-target-item4-day-open.png`): URL `?month=2025-09&date=2025-09-03`, panel `Wed, Sep 3, 2025 · 1 photo`, one item `2025-09-03-tokyo-25` linking to `/drive/main/Photos?file=ikyFIXUM3oWI`.
- Opened the photo (screenshot `pd2-target-item4-photo-open.png`): core file view `/drive/main/Photos?file=ikyFIXUM3oWI` showing the same image and its info (Date taken 2025-09-03 10:23, GPS 35.6812° N 139.7671° E, tag `trip`).
- Browser Back (screenshot `pd2-target-item4-back-restored.png`) restored: URL `?month=2025-09&date=2025-09-03`; target `Target: Trips photos`; N `· 12 photos`; month `September 2025` with its 2 tints and the 09-02 mark; the day panel open again on `Wed, Sep 3, 2025 · 1 photo` with the same list item `2025-09-03-tokyo-25`; the 09-03 cell selected. The list had a single item, so a restored list scroll position could not be measured.
- With the day list still open, chose `2025 summer trip, camera footage only` (screenshot `pd2-target-item4-long-folder.png`): target name exactly that, N `· 42 photos`, month September, the same 9 tinted days/sum 9, `No capture date 4`, note 09-02, day list still open with the same 1 item, URL still `?month=2025-09&date=2025-09-03`.
- Then chose `All photos` (screenshot `pd2-target-item4-back-to-default.png`): N `· 48 photos`, September the same 9 tinted days with identical per-day counts (1 on each of 03,06,09,12,15,16,18,21,24), sum 9, `No capture date 10`, note 09-02, day list still open with 1 item.
- One Previous month (screenshot `pd2-target-item4-default-2025-08.png`): August 10 tinted days with per-day counts identical to the start (1 on each of 03,06,09,12,14,15,18,21,24,27), sum 10, `No capture date 10`. Per-cell counts of both months are identical to the start-of-item-1 state.

## 5. Reload remembers the target; the Video app keeps its own

- Chose `Trips photos`, screenshot `pd2-target-item5-before-reload-trips.png`: `Target: Trips photos`, N 12, September. `localStorage["litloft.addon.photo_diary.target.main"] = "9wtPuwywyItx"`.
- Reloaded the page (screenshot `pd2-target-item5-after-reload-trips.png`): the page came up with `Target: Trips photos`, N `· 12 photos`, `September 2025`, the same storage value. (The look-up moment after reload was not sampled; only the settled page.)
- Opened `/drive/main/apps/video` in the same context (screenshot `pd2-target-item5-video-app-default.png`): header `Video | main · 9 videos | All videos | Discover | Library`, target accessible name `Target: All videos` — the Video app's own default, not `Trips photos`. localStorage still held only `litloft.addon.photo_diary.target.main` (the Photo Diary key); no Video target key was present.

## Not checked

- Map behaviour (the map after a failed read, the map on a target with no image, pin lists): not this role's items; another checker covers the map. The map was not used here.
- The 375x812 phone viewport: my items specify Calendar at 1280 and no phone measurement was requested for the target/calendar path; the header's phone placement and the phone artboards belong to the header/design checker.
- A restored day-list scroll position: the 09-03 list holds one photo, so there was nothing to scroll.
- A target remembered across reloads of a *different* drive, storage refusal, a failing smart-folder list, a 400 target, and a target changed in another tab: outside my items. (The first R-5 record already listed the failure paths.)
- Real LAN latency, a real phone, iOS: listed under `agent_cannot_verify` in `PROJECT.md`.

## Verdict

- Item 1: PASS — N 48 at start; 9 tinted September days and 10 in August; `No capture date 10`; notes 09-02 and 08-24. Choosing `Trips photos` did not reload or change the URL; the scope line dropped to `main` alone, then `main · 12 photos`; September tints became 2 (09-03, 09-06); the notes stayed; the change sent 1 `/calendar/months` and 1 `/calendar/days` request carrying `tag=trip&folder=Photos`.
- Item 2: PASS — changing to `Trips photos` on `?month=2025-07` kept July 2025 with every count 0 (no jump to the newest month); a URL with no month under that target showed September 2025, the target's newest month, with its 2 tints.
- Item 3: PASS — `Videos only` gave N `· 0 photos`; every cell 0; no `No capture date` control; `none=true` on both calendar reads; the 08-24 and 09-02 note marks stayed and both opened their day panel with the note and `No photos on this day`.
- Item 4: PASS — Back restored target `Trips photos`, month September 2025, the 09-03 day panel and its 1-photo list; the long-named folder then the default gave N 48, the same 9 September tinted days/per-cell counts, `No capture date 10` and the same 10 August tinted days as the start.
- Item 5: PASS — after reload the page still used `Trips photos` (N 12, stored id `9wtPuwywyItx`); the core Video app on the same drive showed its own `All videos` (9 videos) target unchanged.

### Checker: map

# R-5, map: Photo Diary Target (SPEC-PD-016 / SPEC-PD-017)

- checker: R-5 agent (not the author), role "map"
- tree: core checkout `/Users/libre/Sources/video_share-app-target`, addon `addons/photo_diary` at `0345d14`
- stack: `http://localhost:3994`, compose project `litloft-r5-apphdr`, used as prepared (not started, stopped or rebuilt)
- drive `main`; a fresh Playwright browser context per run, locale ja, Chromium 1.58.2 with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`
- scripts: `.r5/pd2/map/lib.cjs`, `item1.cjs`, `item2.cjs`, `item2b.cjs`, `item3.cjs`, `item4.cjs`
- screenshots: `.r5/pd2/map/pd2-map-*.png`; every state also appended to `.r5/pd2/map/manifest.jsonl`
  (state, viewport, screenshot, DOM measurements)

How the map's centre and zoom were read: the MapLibre instance is not exposed to the page, so two
independent numbers were used per state.

1. `sessionStorage["photo_diary:state:main"]` (`center`, `zoom`) — the page writes it from the map's
   own `getCenter()`/`getZoom()` on every view change.
2. Each pin's `transform: translate(x, y)` inside `.maplibregl-map`, expressed as an offset from the
   map rect's centre. It is stable under a map resize (the 1280 wide map narrows to 688 when a pin
   list opens and the same pin keeps the same offset), so it compares across states.

A changed centre or zoom moves a pin's offset; an equal offset for the same set of places with an
equal `center`/`zoom` means they did not move.

## 1. 1280x800, default target: zoom, open a pin list, change to `Trips photos`

States: `01-default-first-draw`, `02-default-zoomed-no-list`, `03-default-pin-list-open`,
`04-trips-photos-after-change`.

- Default first draw: N `· 48枚`, 3 pins `写真 11枚`, `写真 11枚`, `写真 10枚` (32 located photos),
  saved view center `[138.24721944444445, 38.47136064500543]`, zoom `5.38684785113903`.
- Wheeled down 3 notches anchored on the 11-photo Tokyo pin: 1 pin left, `写真 11枚` at
  `translate(611.363, 514.194)` on a 1040x609.6 map, i.e. offset `(+91.36, +209.39)` from the map
  centre; saved view center `[139.24835663371084, 36.640741307006664]`, zoom `6.951514216302286`.
- Clicked that pin: the pin list opened with 11 items (`写真 11枚`), the map narrowed to 688x609.6
  and the same pin sat at `translate(435.363, 514.194)`, offset `(+91.36, +209.39)`; saved view
  unchanged.
- Chose `Trips photos`: the target control read `対象: Trips photos`, N `· 12枚`, the pin list is
  **closed** (0 links, the map back to 1040x609.6), the pin is now `写真 4枚` at
  `translate(611.363, 514.194)`, offset `(+91.36, +209.39)`.
- Centre and zoom are the same before and after: saved view center
  `[139.24835663371084, 36.640741307006664]` and zoom `6.951514216302286` in both
  `03-default-pin-list-open` and `04-trips-photos-after-change` (identical to the digits), and the
  surviving pin's offset is `+91.36 / +209.39` in both. The pin list's close is also visible in the
  screenshots: `pd2-map-03-default-pin-list-open.png` has the 22rem panel, `pd2-map-04-...` does not.
- Pins and the photos they hold: at this kept zoom, 1 pin holding **4** photos is in view; the whole
  `Trips photos` target has 3 pins holding **3 + 4 + 3 = 10** photos (measured in `07` below).
  `storedTarget` in `localStorage` became `9wtPuwywyItx` and stayed after the change.

## 2. `Videos only` (no image), then `Trips photos`

States: `05-item2-default-start`, `06-videos-only-no-located`, `07-trips-photos-after-empty`,
`08-trips-photos-fresh-first-draw`, plus the extra run `18-item2b-default-zoomed`, `19-item2b-videos-only`,
`20-item2b-trips-photos-fit`.

- Start (default, first draw): N `· 48枚`, 3 pins 11/11/10, saved view
  `[138.24721944444445, 38.47136064500543]` / `5.38684785113903`.
- Chose `Videos only`: target `対象: Videos only`, N `· 0枚`, the map area holds
  `位置情報のある写真はありません` with the crossed-pin icon and **no map**: `.maplibregl-map` and
  `.maplibregl-canvas` are absent, 0 pins, no empty world map, no error, no zoom controls
  (`pd2-map-06-videos-only-no-located.png`). The 24rem map stage is not drawn in this state; the
  message sits under the tabs row.
- Chose `Trips photos`: N `· 12枚`, 3 pins `写真 3枚`, `写真 4枚`, `写真 3枚` = 10 photos, all three
  inside the map rect (e.g. the Tokyo pin's rect x 828.4–872.4 / y 681.6–725.6 inside the map
  240–1280 / 190.4–800), offsets `(+147.54, -256.77)`, `(+90.42, +208.39)`, `(-147.55, +257.17)`,
  saved view `[138.24721944444445, 38.47136064500543]` / `5.38684785113903`.
- That is the same set of numbers as a first draw under the same target: a fresh context with the
  saved id pre-set (`08-trips-photos-fresh-first-draw`) gives the identical pin offsets, the identical
  center and the identical zoom, and all pins in view. So the three pins are fitted into view as on a
  first draw; **all of them are in view**.
- Extra observation, because in that scenario the previous view and the fit coincide: with the map
  zoomed to `6.9515` on Tokyo first, `Videos only`, then `Trips photos` brings the map back at the
  **same zoomed view** (center `[139.24835663369277, 36.64074130700713]`, zoom `6.951514216302286`,
  Tokyo pin offset `+91.36 / +209.39`), so only that pin (4 photos) is in view and the other two are
  outside it. The map restores the view it had rather than re-fitting. That is what SPEC-PD-016 item 8
  asks on a target change ("keeps its centre and zoom ... even when none of the new target's pins is
  in view"); the fit applies to a map with no view yet.

## 3. A failed `/points` read on a target change, retry, and leaving the error by a target change

States: `09-item3-default-zoomed`, `10-points-500-error`, `11-retry-drew-pins`,
`12-points-500-error-second`, `13-left-error-by-target`.

- Start: default target zoomed 2 notches on the Tokyo pin, saved view
  `[139.0256921129784, 37.051775369071464]` / `6.4299587612478675`; pins `写真 11枚` (in view,
  offset `+90.95 / +208.91`) and `写真 11枚` (drawn at the pin margin, rect outside the map).
- `page.route("**/api/addons/photo_diary/points*")` answered **500 once**, then chose `Trips photos`.
  The intercepted request was
  `http://localhost:3994/api/addons/photo_diary/points?tag=trip&folder=Photos`, i.e. the new target's
  parameters. Result: `対象: Trips photos`, N `· 12枚`, the map area shows
  `読み込めませんでした` with a `再試行` button and **no map** (no `.maplibregl-map`/canvas), 0 pins —
  nothing of the previous target's two pins is on screen (`pd2-map-10-points-500-error.png`).
- Pressed `再試行` (the route now lets requests through): the map came back with 2 pins,
  `写真 4枚` (`+90.95 / +208.91`) and `写真 3枚` (drawn at the margin, `-399.43 / +309.62`), 7 photos,
  a 1040x610 canvas, no error, not a blank stage
  (`pd2-map-11-retry-drew-pins.png`). The centre and zoom are kept: saved view
  `[139.0256921129784, 37.051775369071464]` / `6.4299587612478675`, identical to before the failure,
  and the pin offsets are identical.
- Repeated the failure (500 once) and this time left the error by choosing `Photos`: same error
  state, N `· 42枚`, 0 pins, no canvas (`pd2-map-12-points-500-error-second.png`). Choosing
  `Trips photos` instead of retry drew the map again: 2 pins / 7 photos at the same offsets
  (`+90.95 / +208.91` and `-399.43 / +309.62`), saved view still
  `[139.0256921129784, 37.051775369071464]` / `6.4299587612478675` — the **centre and zoom are kept**
  across both the failure and the way out
  (`pd2-map-13-left-error-by-target.png`, `pd2-map-11-retry-drew-pins.png`).
  (The third cluster, Hakodate, is outside the kept view and is not drawn; that is the kept zoom, not
  a missing pin.)

## 4. 375x812, hasTouch, isMobile, DPR 2

States: `14-375-default-first-draw`, `15-375-zoomed-no-list`, `16-375-pin-list-open`,
`17-375-trips-photos-after-change`.

- Default first draw: N `· 48枚`, 3 pins 11/11/10 (32), map rect 375x591.6 at y 220.4.
- Wheeled 3 notches on the Tokyo pin (the wheel worked in the touch context): N `· 48枚`, 1 pin
  `写真 11枚` at offset `(+86.43, +197.19)`, saved view
  `[138.94034667610208, 37.197711342142526]` / `6.199224869573516`.
- Opened the pin: bottom sheet with 11 items, map still 375x591.6, saved view unchanged.
- Chose `Trips photos`: `対象: Trips photos`, N `· 12枚`, the pin list is closed (0 items), 1 pin
  `写真 4枚` at offset `(+86.43, +197.19)`, saved view
  `[138.94034667610208, 37.197711342142526]` / `6.199224869573516` — identical to before, and the
  pin offset is unchanged (`pd2-map-17-375-trips-photos-after-change.png`).
- Stage: rect 375x591.6, top 220.4, **bottom 812 = `window.innerHeight`** (reaches the viewport's
  bottom), height **591.6px ≥ 384px (24rem)**; `document.scrollWidth` 375 (no sideways overflow).
  The same rect is reported before and after the target change.

## Could not check

- The live MapLibre `getCenter()`/`getZoom()` from the page: the instance is not reachable. The
  numbers above are the page's saved view (written from the map's own callbacks) plus pin offsets;
  the two agree in every state.
- Whether the fit in item 2 comes from a re-fit or from restoring the identical view: in that
  scenario the stored view and the fit are the same numbers because the three places are the same as
  the default target's three places. The extra run from a zoomed view shows the map restoring the
  zoomed view, i.e. keeping rather than re-fitting.
- Tiles, pins and thumbnails over the real LAN, a real phone, an iOS device: not attempted
  (`PROJECT.md` `agent_cannot_verify`).
- Server-side state was not touched; the only writes were the choice of a target in my own browser
  context (`localStorage` of a disposable context).

## First run (history)
ran_in_app: yes
at: c7da4bf17967e82c6c02c622bdb0974bba6b9b25
by: agent
evidence: |
  Stack: `LITLOFT_PORT=3994 docker compose -p litloft-r5-apphdr -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend` from this checkout, with `.r5/drives.json` copied over `drives.json` first. The images built from this tree and `addons/photo_diary` at c7da4bf (feature/app-target, clean for the changed paths). `/drive/main/addons/photo_diary` loaded; the header, both view tabs and the Target rendered. Browser: Playwright 1.58 Chromium. The map needs WebGL: headless Chromium without flags answers 「この環境では地図を表示できません」, so every run launched with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. Two environment additions for the note flow below: the knowledge addon service was started in the same compose project (without it the day panel has no メモを書く control, only read-only note text), and an admin-policy toggle was used once for the not-available frame (restored immediately; `GET /api/admin/config/addon-policy` is back to `{"main":{},"family-archive-2019-2026-shared":{}}`). The stack was stopped with `docker compose -p litloft-r5-apphdr -f docker-compose.yml -f .r5/override.yml down` (the knowledge container was removed first under the same project) and `drives.json` was restored to `{}`.

  Fixture (scripts under .r5): `.r5/make-photos.py` wrote 42 JPEGs under `.r5/drives/main/Photos/` (32 with EXIF DateTimeOriginal and GPS in three places — Tokyo 35.681236/139.767125, Kyoto 35.011636/135.768029, Hakodate 41.772726/140.726411; 6 with a capture date and no GPS; 4 with no capture date) and 6 undated PNGs under `.r5/drives/main/Screenshots/` (they are the "screenshots"; PNG, no EXIF). 12 Photos photos were tagged `trip` through the app (file inspector → タグ追加 → trip): the 10 August photos and 2025-09-03, 2025-09-06. Rescan through the app (Library → その他の操作 → 再スキャン) reported 追加 48 / 復帰 0 / 見つからない 0. Notes were written through the app: `Photo Diary/2025-08-24.md` (a day with a photo) and `Photo Diary/2025-09-02.md` (a day with no photo); `/note` answers `{"state":"active"}` for both and `/calendar/days` marks both `has_note`. Four smart folders were created through the app's search results → その他の操作 → スマートフォルダに保存: `Trips photos` = `path:Photos tag:trip` (12 results before saving), `Photos` = `path:Photos`, `2025 summer trip, camera footage only` = `path:Photos`, `Long clips only` = `duration:>60`. The Target's 管理… dialog (`表示する対象`) only toggles which folders are shown; it has no create action, so this was the app's only smart-folder creation path. An older duplicate `2025 summer trip, camera footage only` (query `path:Trips`, from an earlier run) was deleted through the app's smart-folder endpoint so the name was unambiguous.

  1. Header — measured at 1280x800 with the sidebar shown, 768x800, 640x800, and 375x812 (hasTouch, isMobile, DPR 2), on Calendar and on Map. Every state: 40x40 icon tile radius 12px; h1 フォトダイアリー 24px, whole (scrollWidth == clientWidth) and, below 640, not sharing its row with the Target; scope `<drive> · N枚` (main · 48枚 / · 12枚 / · 42枚 / · 0枚 as the target changed); Target text is the name only, computed background rgba(0,0,0,0), border 0 (no 対象 / Target word drawn); accessible name 対象: <name>. At 1280/768/640 the Target shares the title row and its right edge equals the header content edge (right edge minus padding: 0.0px); at 375 it shares the scope row, sits right of the count and its right edge is 8px past the content edge, matching the artboard's -8px margin. Tabs nav[role=tablist] labels カレンダー/地図 under the title at all four widths; tablist top below h1 bottom (1280: 144.4 vs 116.4; 375: 168.4 vs 116.4). `document.scrollWidth == innerWidth` in every state (no horizontal overflow). At 375 with `2025 summer trip, camera footage only` as the target: name span visible 163px / full 255px, `text-overflow: ellipsis`, screenshot shows "2025 summer trip, cam…"; scope main · 42枚. Screenshots: screenshots/pd-1280-calendar.png, screenshots/pd-1280-map.png, screenshots/pd-768-calendar.png, screenshots/pd-768-map.png, screenshots/pd-640-calendar.png, screenshots/pd-640-map.png, screenshots/pd-375-calendar.png, screenshots/pd-375-map.png, screenshots/pd-375-calendar-long.png, screenshots/pd-375-map-long.png.

  2. Target menu at 1280 and 375 (screenshots/pd-1280-target-menu.png, screenshots/pd-375-target-menu.png): rows すべての写真 (48), Long clips only (disabled attribute; greyed; second line この対象は使えません), 2025 summer trip, camera footage only, Photos, Trips photos, Holiday 25, Trips, and 管理…. `すべての写真` is checked and highlighted; at 375 the menu fits inside the viewport (x 8–367, y 445–796). English once: `All photos` / `48`, `This target cannot be used`, `Manage…`, `Target: All photos`, `All photos`, `· 48 photos`, `Calendar` / `Map`, `No capture date 10` (screenshots/pd-en-calendar-1280.png, screenshots/pd-en-target-menu.png, screenshots/pd-en-map-1280.png).

  3. Choosing `Trips photos` on Calendar with the URL at `?month=2025-09`: URL before and after is identical, `window.__pdMarker` survives and the page's load-event count is unchanged (no page load). N 48枚 → 12枚. September's tinted days 9 → 2 (only 09-03 and 09-06), August unchanged at 10 tinted days; the month itself stays 2025年9月; moving back one month shows August and the prev-month control is then disabled (July/June have no photos or notes under this target and are not in the month set). Note marks stay: 2025-09-02 (note, no photos) and 2025-08-24 are still marked and 09-02 is pressable, opens a day panel with the note text and 「この日の写真はありません」. The 09-03 day list holds only 2025-09-03-tokyo-25 (1 piece); hovering 09-06 shows its preview (`/api/files/eQZlvMWJdFne/thumbnail` = 2025-09-06-kyoto-26). The 撮影日なし control is not drawn at all under this target (0 undated). Under `Photos` (path:Photos) it shows 撮影日なし 4 and the undated list holds exactly the four Scan-* files, while the six Shot-* files that are in the default's 10 are absent; N 42. Choosing Trips photos on Map: 3 pins, 写真 3枚 + 写真 4枚 + 写真 3枚 = 10 located photos (the 12 tagged photos are 10 with GPS + 2 without; pin thumbnails are 2025-08-21-hakodate-23, 2025-09-03-tokyo-25, 2025-09-06-kyoto-26). N=12 equals the 12 `path:Photos tag:trip` results the app's own search shows. Also checked: an open 撮影日なし list survives a change to Photos (URL keeps undated=true, 10 → 4 items) and closes on Trips photos (URL loses undated, no control); an open day list (09-03) stays open across a change to Photos; choosing `Trips` (query path:Trips, no images) gives N · 0枚, empty lists, and the note mark on 09-02 still there. Screenshots: screenshots/pd-target-trips-2025-09.png, screenshots/pd-target-trips-day-2025-09-03.png, screenshots/pd-target-trips-preview.png, screenshots/pd-target-trips-note-only-day.png, screenshots/pd-target-trips-map.png, screenshots/pd-undated-stays-open.png, screenshots/pd-undated-closes.png, screenshots/pd-day-list-stays-open.png, screenshots/pd-empty-target.png.

  4. Map state. Default target, zoomed with the wheel anchored on the Tokyo cluster until only that cluster remained (pin list closed; pin 写真 11枚 at translate(611.363, 514.194), map 1040 wide). Clicking the pin opened its list (11 items, map narrowed to 688 wide; the same pin at translate(435.363, 514.194)). Before/after offsets from the map centre (688/2, 609.609/2) and (1040/2, 304.805): before (+91.363, +209.389), after with target Trips photos (+91.363, +209.389) — identical, so the centre and scale did not move; the pin list closed (11 items → 0) and the pin became 写真 4枚; N 48 → 12. Reload: 対象: Trips photos, N 12, the same pin/offset. The Video app on main: 対象: すべての動画 (its own default). Screenshots: screenshots/pd-map-zoomed-no-list.png, screenshots/pd-map-before-change-list-open.png, screenshots/pd-map-after-change-list-closed.png, screenshots/pd-map-after-reload.png, screenshots/pd-video-app-default-target.png.

  5. Back from a photo under Trips photos: opened `?month=2025-08&date=2025-08-24`, list 2025-08-24-tokyo-24, clicked it (URL /drive/main/Photos?file=BD1SowsFIY7x), then browser Back. Restored: `?month=2025-08&date=2025-08-24`, 対象: Trips photos, N 12枚, month 2025年8月, the same day panel 2025年8月24日(日)1枚 with the same photo. Screenshots: screenshots/pd-back-before-open.png, screenshots/pd-back-photo-open.png, screenshots/pd-back-restored.png.

  6. Long folder then default, from `?month=2025-09`: start 対象: すべての写真, N 48枚, 9 tinted days, undated 10, note 09-02. Choosing `2025 summer trip, camera footage only`: N 42枚, the same 9 tinted September days/tints, undated 4. Choosing すべての写真: N 48枚, the same 9 tinted days/tints, undated 10, note 09-02 — every field equal to the start state. Screenshots: screenshots/pd-long-default-start.png, screenshots/pd-long-selected.png, screenshots/pd-long-back-to-default.png.

  7. Not available. `/drive/no-such-drive/addons/photo_diary` and `/drive/main/addons/no_such_addon` both answer Next's own 404 body (「This page could not be found.」) with no 対象 button and no tablist (screenshots/pd-not-available-missing-drive.png, screenshots/pd-not-available-missing-addon.png); disabling photo_diary for main through the settings API while the page was open and then pressing a day reached the addon's own frame: PageHeader with フォトダイアリー title, drive `main`, 「このドライブでは使えません」, no 対象 button and no tablist (pd-not-available-pageHeader.png; policy restored afterwards).

  8. Map stage: 1280 609.6px tall, bottom 800 (viewport bottom); 768 609.6 / 800; 640 609.6 / 800; 375 591.6 / 812. All >= 24rem (384px) and flush with the viewport bottom, with and without the long folder target at 375.

  Design artboards, rendered from `addons/photo_diary/docs/reviews/app-target/design/` at their widths (the saved directory has no support.js, so a minimal renderer for the sc-for/sc-if/{{}} directives was placed next to copies under .r5/pd-artboards; the markup and CSS are unchanged). Screenshots: screenshots/pd-artboard-main-1280.png (1280x860), screenshots/pd-artboard-map-1280.png (1280x860), screenshots/pd-artboard-phone-375.png (375x812), screenshots/pd-artboard-phone-long-375.png (375x812).

  Visible differences against the artboards (spec §9 declares the calendar cells and the map illustrative and says both keep today's look, so those two are declared):
  D1 Calendar: the artboard spans the full content width with ~1000px of 7 columns; the app keeps today's 26rem calendar column with the empty day-panel column to its right. Declared (calendar illustrative/today's look).
  D2 Map: artboard is a flat illustrative map with four 48px pins and attribution bottom-right; app is MapLibre + OSM tiles, 50px pins, zoom controls top-right and attribution top-left. Declared (map illustrative/today's look).
  D3 The Target control at ≥640 is 28px tall in the app; 36px in the wide artboards (DESIGN.md's fine-pointer floor is 32px). Text, icon, chevron, transparent fill and right-edge position match.
  D4 The app has the core top app bar above the header (search / quick note / profile), which the artboards omit; on the phone the artboard bar is the hamburger only. The whole header therefore sits lower in the app.
  D5 375px header spacing: the artboard's scope line starts 5.5px below the title (title bottom 89.4, scope text top 94.9) and its 44px Target box rises to 83.4, overlapping the title row by 6px; the app's 44px Target box starts at 124.4, 8px below the title bottom (116.4), with its name text at 132.4. Both place the Target at the end of the scope line.
  D6 The artboard phone shows no 撮影日なし control; the app draws it under the grid at 375 (撮影日なし 10 / 4). Data/state, not present in the artboard.
  D7 The note mark is a 6px dot in Main.dc.html and absent in the phone artboards; the app draws a 12px pen icon in the day cell.
  D8 The app's month bar has a month-picker chevron beside the month name and a disabled next-month disc on the newest month; the artboards draw plain prev/next arrows.
  D9 The app's map stage starts 8px below the tabs row; the artboards start the map flush under the tabs.
  D10 Artboards show an empty sidebar block; the app's sidebar is populated (sidebar is not part of the artboard's subject).

pending: |
  Not observed: the moment the scope line shows the drive alone while N is unknown, and the frame drawn before the drive is known (both too brief to capture without throttling the network). The failure paths were not produced by ordinary use: a failing smart-folder list with the retry via Manage…, a saved folder that no longer exists or is unusable, a 400 from a target the core cannot normalise, a target changed in another tab, and the saved-state mismatch on Back (which needs a target change between the save and the return). The map's numeric zoom is not readable from the page (the MapLibre instance is not exposed); centre/zoom equality is inferred from the two pin offsets and the map widths quoted above. No real phone, no LAN, no iOS. Note authoring needed the knowledge addon service (started for this run); with only the two prescribed services the note area is read-only and no メモを書く control is drawn. The Target's 管理… dialog has no create action, so the four folders were created through the app's search → スマートフォルダに保存, not through Manage….


## Human decisions

- 2026-11-14, on code-r1 F5 (the fake React element that drew an unusable folder's reason): the human chose "1", draw the reason the way the core's apps do, in the disabled row's `title`, and change the acceptance assertion in `frontend/Target.test.tsx` (I7 menu test) from visible text to that attribute.

## Design differences

Accepted by the human on 2026-11-14, by id, from design-check.md (at 0345d14): D-1, D-2, D-3, D-4, D-5, D-6, D-7, D-8, D-9, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-18, D-19, D-20, D-21, D-22 ("ok" to accepting all 22). D-15 (at 375px the map's zoom group covers the northernmost pin's count badge) and D-17 (the core Target menu's 200px popover wraps a long folder name) predate this change and are left for separate work.
