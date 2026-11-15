# Photo Diary Library: verification record

spec: docs/specs/library.md

ran_in_app: yes
at: d4aa9360237c91db7a105bf3436d5f102e3b65b5
by: agent
evidence: |
  Three checkers on a scratch stack (litloft-r5-plib, port 3993) prepared and stopped by the author: drive `main` with 116 images (2024/12 with 56 mixed portrait and landscape, 2024/11, an NFD-named top-level folder がっこう, Photos/, Screenshots/), tags trip, 家族, 旅行, sunset, collections 年末, 学校, スクリーンショット.
  First pass at 8c238c7: `behaviour` passed the URL table, I14, I12, I10 and I8, the shelf page sort and invalid links; it failed I9 (back from a photo landed at the top). `layout` passed the controls, menus, shelf page, titles and counts, the empty state and English; it failed I11 (a shelf's line ended up to 192px short of the shelf's edge) and listed seven visible differences from the design.
  I9 did not reproduce in the app: the probe clicked a photo through a locator that scrolled to it first. Clicking a photo visible at the position left restores 1200 and 1600 on 8c238c7 too. The save was still moved to the last scroll seen (1e64b5d). I11 was fixed in a029fe7 (the core grid's tail no longer absorbs the slack on the drawn line), with e2e tests that fail before the fix.
  Second pass at d4aa936 (`writes`): I9 (1200 → 1200, shelf page 1600 → 1600 with 56 loaded, reload 1200), I11 (every line ends at the shelf's edge at 375, 768 and 1280, one line, the shelf whose photos fit stays at the base height), the menu caption, and I13 (trash through the context menu from the Library by tag and by month and from the shelf page with two pages loaded: the photo leaves, counts, depth and scroll kept, header N and the Target count read again; a failed re-read keeps what is drawn with Retry above it). Every write was undone; counts were back to the start.
  Production timing on a snapshot of the production database (photos drive, 3,672 images, 78 month shelves): every `/library/shelves` and `/library/shelf` first page answered in 8–128ms; month shelves sum to 3,672 and the undated shelf equals `undated_count` 916. The snapshot was deleted afterwards. Records of each checker follow; key screenshots are in screenshots/.
pending: |
  Real phone, LAN (agent_cannot_verify). A Library with more than 12 shelves (a second shelves page) was not on the fixture; the production snapshot has 78 month shelves and was read through the API only.

decision:

## Design differences accepted by the human (2026-11-15)

The human chose to fix the classification menu's caption (d4aa936) and to keep the rest as the core draws them: the menu's 192px width and 36px items (the Video app's menus), the grid's 8px gap and 12px corners (the core FileGrid), the 40px between shelves and 24px under the tabs (the Video app's Library), the phone shelf title at text-lg, and the tabs' padding (the core PageTabs).

## Checker `behaviour` (first pass, 8c238c7)


- Role: `behaviour` (not the author).
- Commit used: addon `addons/photo_diary` 8c238c7 (branch `feature/library`), built into core checkout a405538.
- Stack: http://localhost:3993 (compose project litloft-r5-plib), unchanged by me. Drive `main`.
- Browser: Playwright Chromium (headless, `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`), 1280x900, `locale: ja-JP`, fresh browser context per scenario.
- Scripts and raw output: `.r5/pl/behaviour/` (`s1`–`s7`, `probe-*`, `out-s3.json`). Every captured state is one JSON line in `.r5/pl/behaviour/manifest.jsonl` (77 states, last run per state kept). Screenshots: `.r5/pl/behaviour/pl-behaviour-*.png`.
- I made no write on the server (no tag/collection/smart-folder/rename/move/trash/rescan/note/policy change); only target, classification and sort choices, which live in my own context's localStorage. Session storage left behind is my context's only.
- `history.length` is reported as the browser reports it (a `page.goto` in a fresh context gives 2 before any app navigation). History pushes/replaces were also instrumented by wrapping `history.pushState`/`replaceState`, so "no added entry" is checked from the calls, not only from the length.

## What the server holds (read through the page's API, `X-Lit-Drive: main`)

- `/library/shelves?by=month`: 8 shelves — 2025-09 (9), 2025-08 (10), 2025-07 (10), 2025-06 (9), 2024-12 (56), 2024-11 (9), 2024-10 (3), undated (10); `total_shelves` 8.
- `by=tag`: 5 — trip 12, 家族 10, 旅行 8, sunset 3, no_tag 86. `by=collection`: 4 — 学校 3, 年末 12, スクリーンショット 4, no_collection 97. `by=folder`: 4 — Photos 42, 2024 65, がっこう 3, Screenshots 6.
- `/calendar/months`: the 7 dated months above, `undated_count` 10. Header on the Library: “main · 116 photos”.
- Drive `family-archive-2019-2026-shared`: `/api/drives/.../files?type=image` is empty; the drive holds 13 files (9 videos, 4 PDFs). Its Library is the empty state. (The prepared environment note said 12 photos; the stack does not hold them.)

## Item 1 — URL table (section 1 item 1, I7) — PASS

Fresh context per case, 1280x900, `?` prefix as listed. Face read from what was visible (controls row vs month grid vs map canvas).

| requested | face shown | URL after load | `history.length` | history calls |
|---|---|---|---|---|
| (none) `/drive/main/addons/photo_diary` | Library, 8 shelves | `?view=library` | 2 (2 before the replace) | replace only → `?view=library`, push [] |
| `?view=library` | Library, 8 shelves | unchanged | 2 | replace only (same URL) |
| `?view=calendar` | Calendar, “September 2025” | unchanged | 2 | replace only |
| `?month=2025-07` (no view) | Calendar, “July 2025” | unchanged (no `view` added) | 2 | replace only |
| `?date=2025-07-09` | Calendar, July 2025, day list “Wed, Jul 9, 2025 · 2 photos” open | unchanged | 2 | replace only |
| `?undated=true` | Calendar, “September 2025”, “No capture date · 10 photos” open | unchanged | 2 | replace only |
| `?view=map` | Map (one canvas, tiles from vector.openstreetmap.org) | unchanged | 2 | replace only |
| `?view=bogus` | Library, 8 shelves | replaced → `?view=library` | 2 | replace → `?view=library`, push [] |
| `?foo=1` | Library, 8 shelves | replaced → `?view=library` | 2 | replace → `?view=library`, push [] |

Screenshots: `pl-behaviour-item1-*.png` (one per case above) and `pl-behaviour-item1b-*.png` for the calendar controls.

The session-scoped saved state distinguishes “fresh start” from “not a fresh start” as the spec says: after leaving the Library at scrollY 1200, a load at `?view=library` restored scroll 1200; a load at `?view=bogus` and at `?foo=1` kept `photo_diary:state:main` (not cleared) but did not apply it (scroll 0); a load at no query cleared it (`null`).

Every URL the calendar produced while used carried `view=calendar`:

| action | URL | `history.length` | push / replace |
|---|---|---|---|
| start `?view=calendar&month=2025-07` | same | 2 | replace (same URL) |
| Next month | `?view=calendar&month=2025-08` | 2 | replace |
| Previous month | `?view=calendar&month=2025-07` | 2 | replace |
| day “July 9, 2 photos” | `?view=calendar&month=2025-07&date=2025-07-09` | 3 | push |
| undated control | `?view=calendar&month=2025-07&undated=true` | 4 | push |
| list Close (X) | `?view=calendar&month=2025-07` | 3 | push |
| Today | `?view=calendar&month=2026-11&date=2026-11-15` | 5 | push |
| month picker → December 2024 | `?view=calendar&month=2024-12` | 2 | replace |

Pressing the open day again changed nothing (old spec: “Pressing the day or entry already open does nothing”). The day list's Close control is what closed it. Screenshots `pl-behaviour-item1b-*`.

## Item 2 — I14 — PASS

Fresh context. `?view=calendar&month=2025-07` (length 2) → day “July 9, 2 photos” → URL `…?view=calendar&month=2025-07&date=2025-07-09`, length 3, day cell `aria-pressed=true`, list “Wed, Jul 9, 2025 · 2 photos” (`item2-cal-day9`).
- Tabs → Library: URL `?view=library`, length 4, 8 shelves. Requests on that switch: `…/library/shelves?by=month&sort=newest&per_shelf=12&shelf_limit=12&offset=0`, `calendar/months`, `files/batch/get`, thumbnails.
- On the Library, 3 s idle: **0 requests**, URL unchanged (`item2-library-idle`). The calendar stayed mounted and hidden (its open day still `aria-pressed=true`, list still in the DOM).
- Tabs → Calendar: URL back to `?view=calendar&month=2025-07&date=2025-07-09`, length 5, heading “July 2025”, list “Wed, Jul 9, 2025 · 2 photos” open again (`item2-cal-back`).
- Library → Calendar → Library: **0** `/library/shelves` requests in that window; the 8 shelves were still drawn (`item2-library-cycle`).

## Item 3 — I12 — PASS

Fresh context, only the Library and the shelf page: opened `…/photo_diary` (→ `?view=library`), 6 wheel scrolls, See all (`/shelf?by=month&key=2025-09`), 8 wheel scrolls on the shelf page, then the shelf page's header back link (`?view=library`). 221 requests, every one to `localhost:3993`; **no tile request** (`tile|openstreetmap|mapbox|shortbread|basemap` matched nothing). Host + path prefixes seen: `/drive/main/Photos` 43, `/_next/static/chunks` 36, `/drive/main` 28, `/drive/main/addons` 25, `/drive/main/2024` 18, `/api/drives/main` 10, `/drive/main/%E3%81%8C%E3%81%A3%E3%81%93%E3%81%86` 7, `/api/addons/photo_diary` 6, `/drive/main/apps` 4, `/api/admin/config` 3, `/api/files/batch` 3, `/admin` 2, `/api/addons/intelligence` 1, `/api/addons/status` 1, `/api/drives` 1, `/api/auth/status` 1, `/api/files/<id>` 1 each (thumbnails). No host other than localhost:3993 appears at all. (`out-s3.json`)

## Item 4 — I10 and I8 — PASS

- Default: Group by “Month taken”, Sort “Newest first”, 8 month shelves.
- Group by → Tag, Sort → Oldest: 5 shelves trip 12, 家族 10, 旅行 8, sunset 3, No tag 86 (tag order unchanged by the sort, as specified); photos inside a shelf oldest first.
- Reload: “Group by: Tag”, “Sort: Oldest first”, the same 5 shelves (`item4-after-reload`). localStorage: `…classification.main=tag`, `…sort.main=oldest`.
- Second drive through the drive switcher, then `…/drive/family-archive-2019-2026-shared/addons/photo_diary?view=library`: “Group by: Month taken”, “Sort: Newest first”, empty state “No photos” (that drive has no images — see above). localStorage at that point held only the `main` keys; no key for the second drive.
- Back on `main` (`?view=library`): Tag / Oldest still in force.
- With `page.route('**/library/shelves**')` delaying 1.5 s, Group by Tag → Collection: during the load no shelf, no shelf title and no shelf count was on screen — only the two controls, the header count (target count, “116 photos”) and one untitled skeleton shelf (`item4-pending-classification.png`). URL `?view=library` and length 4 unchanged. After: 4 collection shelves.
- Same with Sort → Newest first (`item4-pending-sort.png`), URL/length unchanged, no previous shelves while loading.
- Target changed to “Trips photos” while a delayed shelves request was still in flight: header count became 12 at once, no previous shelf remained (`item4-pending-target.png`), then “No collection 12 photos” (`item4-after-target`). URL unchanged.
- Failure case: `/library/shelves` answered 500 after the same change → no previous shelf, “Retry” in place of the shelves, URL unchanged; retry (route removed) drew the 4 folder shelves.

## Item 5 — I9 and section 9 item 7 — **FAIL**

- Library by month: **8 shelves load**, and no more exist on this fixture (8 = `total_shelves`, below `shelf_limit` 12; tag 5, collection 4, folder 4). Scrolling from scrollY 0 to 1639 (docH 2539) issued **no** `/library/shelves` request at all, so a second shelf page cannot be observed here. (Reported as not checkable, not as a pass.)
- Library scrolled to **1200**, photo `2025-09-03-tokyo-25` (`-H589uDr26J6`) opened, browser Back: scrollY **0**, 8 shelves, Month taken/Newest first. `photo_diary:state:main` at the photo page was `{"library":{"loaded":1,"scrollY":0,…}}`. Repeated with wheel scrolling and with `window.scrollTo`: 1200 before, 0 after every time. At 640 the value written was 586 in one run and 0 in another, restored as written — never the position left. `item5c-library-photo-before/…-page/…-return/.png`, `probe-scroll3/4`.
- Reload `?view=library` restores the stored value when it was written correctly: after leaving at 1200 through the shelf page, a reload put the Library back at 1200. After the photo path above, the stored value is already 0, so the reload restores 0.
- Shelf page `?by=month&key=2024-12`: 40 photos, then **56** after scrolling (docH 2810 → 3990, second page `offset=40` loaded). At scrollY **1600**, a photo opened, Back: 56 photos again but scrollY **88** (the value written was 88; a second run at the same position wrote and restored 0). At 400: stored 188, restored 188. At 1000 and 2200: 0. The photos-loaded depth survives; the scroll position does not. `item5b-shelf-open/second-page/left/photo/back`, `probe-shelf-restore`.
- The shelf page's header back link (in `main`) is `/drive/main/addons/photo_diary?view=library`: from the shelf page at scrollY 0 it put the Library back at **1200**, 8 shelves, Month taken/Newest first (`item5b-library-back-link`).
- Target → “Trips photos”: scroll 0, shelves re-read from the start (Sep 2025, Aug 2025), sessionStorage cleared; nothing of the previous choice was restored (`item5b-new-target`).
- While restoring the shelf page, the app issues one `GET /library/shelf?by=month&key=2024-12&sort=newest&limit=56&offset=0` — 56 photos in one request, where item 14 says the page size is 40.

## Item 6 — shelf page sort — PASS

- `?by=month&key=2024-12`, Newest first (length 2): first photo `Lib-2024-12-56`, its file page shows DATE TAKEN 2024-12-28 10:24.
- Sort → Oldest first: URL **replaced** to `…&sort=oldest` (replace only, push [], length 2 unchanged); first photo `Lib-2024-12-01`, DATE TAKEN 2024-12-01 10:21. localStorage `{}`.
- Back to the Library: “Sort: Newest first”; reloading `?view=library` shows See all hrefs without `sort` (`item6-*`).
- With the Library's sort set to Oldest first: every See all link carries `&sort=oldest`; the shelf page opens with “Sort: Oldest first”. Changing the shelf page's sort to Newest first replaces the URL (`…?by=month&key=2024-12`, no `sort`; push [], length 3 unchanged) and reverses the order (`Lib-2024-12-56` first). Back to the Library through the header link: “Sort: Oldest first” and localStorage still `{"litloft.addon.photo_diary.sort.main":"oldest"}`. `item6b-*`.

## Item 7 — invalid shelf links — PASS

- `/shelf?by=month&key=2024-13`: title “Photo Diary”, body “This link cannot be opened”, no photos, sort menu absent, **no data request** (no `/library/*`). Header back link to `?view=library` (`item7-month-2024-13`). (The other “Photo Diary” link on the page is the sidebar row, which points at the no-query URL.)
- `/shelf?key=2024-12` (no `by`): same invalid-link state, no request (`item7-no-by`).
- `/shelf?by=tag&key=nosuchtag`: title “nosuchtag”, scope “main · 0 photos”, sort menu present, “No photos”, requests `…/library/shelf?by=tag&key=nosuchtag&sort=newest&limit=40&offset=0` and `calendar/months`; back link to `?view=library` (`item7-tag-nosuchtag`).

## Could not check

- A second page of shelves on the Library: this fixture has at most 8 shelves in any classification (month 8, tag 5, collection 4, folder 4), under `shelf_limit` 12. No request with `offset>0` on `/library/shelves` was ever needed.
- Japanese strings: the app served its UI in English (`<html lang="en">`, tabs “Library / Calendar / Map”, “Group by”, “Sort: Newest first”, “See all”, “No photos”), although the context's `navigator.language` was `ja-JP`. 分類 / 並べ替え / すべて見る / 写真はありません were therefore never on screen. The data strings (家族, 旅行, がっこう, 年末) did render.
- The second drive's own photo set: it holds no images on this stack, so only its defaults and empty state were seen.
- The context-menu write → re-read path of item 17 (would write to the server), and the map's section-heading day link.
- Layout against the design artboards: I opened `Main.dc.html`, `Tags.dc.html`, `Shelf.dc.html`, `Phone.dc.html`, `Phone-Shelf.dc.html` only to know the expected shape. The 1280px states I captured have the structure the artboards show (title row with the Target, tabs row, controls row, shelves each with title, count, See all at the right end and one photo line; shelf page with the back link above the title, title row with sort and Target). Whether the line heights and proportions match is the layout checker's item, not mine.
- I did not read the diff and did not run unit tests.

## Summary

PASS: items 1, 2, 3, 4, 6, 7.
FAIL: item 5.

- item 5 FAIL: going back from a photo opened in the Library lands at the top instead of the position left (1200 → 0; at 640 the stored value was 586 or 0, never 640). The Library writes `photo_diary:state:main` with a wrong `scrollY` when the photo page is entered.
- item 5 FAIL: going back from a photo opened on the shelf page lands near the top (1600 → 88 in one run and 0 in another; 1000 and 2200 → 0; 400 → 188), while the 56 loaded photos are restored.
- item 5 (minor, spec item 14): the restored shelf page re-reads all loaded photos in one request, `limit=56&offset=0`, not the page size 40.

## Checker `layout` (first pass, 8c238c7)


Change under test: Photo Diary Library + shelf page (SPEC-PD-018/019/020), addon
`addons/photo_diary` at branch `feature/library`, commit `8c238c7`, built into this core
checkout. Stack: `http://localhost:3993` (compose project `litloft-r5-plib`), not started,
stopped or rebuilt by me. Every capture used a fresh Playwright Chromium context of my own
(`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`); no server state was
changed. The only writes were `localStorage` classification/sort/target and choosing targets
and sorts, as the brief allows.

Scripts and screenshots are in this directory (`.r5/pl/layout/`), one JSON line per state in
`manifest.jsonl` (49 lines), layout-only states marked by `LAYOUT_DONE`. Screenshots are
prefix `pl-layout-`.

Method: every number below is read from the live DOM after the shelves/photos had drawn
(the shelves `ready`, thumbnails loaded: I walk the page so lazy images load, then measure).
For the Library, 24 states were measured: 3 viewports (375x812 phone profile, 768x900,
1280x900) × 4 classifications × 2 sorts. For each shelf I read every drawn photo's box, its
image's own `naturalWidth/naturalHeight` and the file's stored `image_width/image_height`
(`POST /api/files/batch/get`), the shelf `section` box, the heading row and the See all link.
126 shelf instances were measured in the Library states.

Three environment notes, none caused by the change:

- The design directory `docs/reviews/library/design/` has no `support.js`, which every
  `.dc.html` loads. Opened as instructed, each artboard reports `ERR_FILE_NOT_FOUND` and
  draws literal `{{s.title}}`/`{{s.count}}` with no tiles. To compare at all I expanded each
  artboard's own embedded template and `renderVals()` data (`sc-for` loops and `{{…}}`
  interpolation, inline styles untouched) in the browser, then screenshotted at the
  artboard's size. The artboard images are therefore the artboards' own markup and data, but
  not the Design Canvas renderer; treat artboard spacing/rounding as close, not exact.
- A context with no `NEXT_LOCALE` cookie renders **English** (the core's
  `frontend/src/i18n/config.ts` has `defaultLocale = 'en'`), not the Japanese the brief
  describes. I set `NEXT_LOCALE=ja` for every Japanese capture (`NEXT_LOCALE=en` for item 6).
- At 768x900 the sidebar is **not** shown (content column starts at x=16, grid width 736);
  it is shown at 1280x900 (240px rail, content x=256). The brief's "(sidebar shown)" held at
  1280 only.

## Item 1 — I11 and section 9 item 4, Library at 375x812 / 768x900 / 1280x900

Captures: `pl-layout-library-<viewport>-<by>-<sort>.png` (24 files).

- Grid widths: 343px at 375, 736px at 768, 1008px at 1280 (section width = grid width).
- **One row of photos per shelf: 126/126.** The number of distinct row tops among the drawn
  photos was 1 on every shelf in every state.
- **Photos at their own proportions, not squares: pass.** Cell `w/h` against the stored
  `image_width/image_height` differs by at most **0.003**; against the thumbnail's own
  natural ratio by **0.000** (all thumbnails loaded). Observed cell ratios include 0.75,
  1.33, 1.5 and 1.78 — portraits and landscapes.
- **No photo cut at the right edge: pass.** The largest `photo.right − shelf.right` over all
  126 shelves is **0**.
- **Line height: 120px at 375, 200px at 768 and 1280.** All 42 full lines at 375 are exactly
  120.00; full lines at 768/1280 measure 200.00–200.98, and last lines (photos all drawn) vary
  with their ratios (e.g. 201.00). This matches the base row height; see the next point for
  what the height is when the line is justified instead.
- **The line fills the shelf's width: FAIL.** Of 110 shelves whose drawn photos exceed one
  line (so the first line is a full line), **97 end short of the shelf's right edge**, by
  15px to 194.64px:
  - 375: every full line is short, 15.00–84.98px. Examples (month, newest): 2025年9月 15.00,
    2024年12月 65.12, 2024年11月 84.98, 2024年10月 84.98 (it draws 2 of its 3 photos).
  - 768: 26 of 34 short, 36.67–194.64px. Examples: 2025年9月 194.64, 2024年12月 120.20;
    2024年11月 happens to fill exactly (0.00).
  - 1280: 29 of 34 short, 117.53–191.95px. Examples: 2025年9月 191.95, 2024年12月 117.53;
    2024年11月 0.00.
  - The 13 exact fills are coincidences where the cells' basis widths happen to sum to the
    grid width (e.g. 2024年11月 at 768/1280, tag 旅行 at 768).
  - Same photos, same width, 1280: shelf `2024年12月`, ids `jQkRGoM-vHZP`, `wLHBOdwME0_G`,
    `17XH6KPWVJOH`, `n-oY-KyY3Rcg` — on the Library the line is 299.78/150.00/150.02/266.67
    wide at h=200 and its right edge is **1146.47** (117.53 short of 1264); on that shelf's
    own page (shelf page, same four ids, all lines drawn) the same four are
    340.44/170.36/170.36/302.84 at h=227.13 and reach **1264**.
  - Cause, measured and not fixed: the grid's `.justified-grid-tail` (flex-basis 0) lands on
    the drawn line once `PhotoShelf` hides the later-line cells, and it absorbs the slack.
    With the tail set `display:none` in the page, the same line grows to 3×331px at h=248
    and its right edge becomes 1264. So the drawn line is at the cells' basis width, not the
    core's justified width.
- **See all at the heading row's right end: pass, 126/126.** The link's right edge equals the
  shelf's right edge (gap 0.00) and it is on the heading row in every shelf. It is present on
  every shelf whose photos all fit too: 16 such shelves, e.g. tag `sunset` at 1280 (3 photos
  drawn, height 200.02, line 275.48 short by design) and month `2024年10月` at 1280.
- **See all href `sort=oldest` exactly when 古い順 is in force: pass, 0 mismatches.** All 12
  `古い順` states' links carry `&sort=oldest` and none of the 12 `新しい順` states' links do,
  e.g. `…/shelf?by=month&key=2024-12&sort=oldest` against
  `…/shelf?by=month&key=2024-12`. Folder keys are NFC in the URL
  (`key=%E3%81%8C%E3%81%A3%E3%81%93%E3%81%86`).
- **No horizontal page overflow: pass.** `documentElement.scrollWidth == clientWidth` in all
  24 states (also on the shelf page states and the empty state).

Verdict: **FAIL** (the line does not fill the width; I11 and 9.4's "filling the width", and
the design's rows reach the right edge).

## Item 2 — section 9 items 1 and 2: tabs, controls, menus

Captures: `pl-layout-controls-<viewport>-classification-menu.png`,
`pl-layout-controls-<viewport>-sort-menu.png`.

- **Tabs: pass at 375, 768 and 1280.** `ライブラリ | カレンダー | 地図` in that order, all
  three on one row (identical `top`). Measured left edges 16/122/225.91 at 375, 16/126/… at
  768 and 256/362/… at 1280.
- **Controls row under the tabs: pass.** At 375 the tabs row is 168.39–212.39 and the two
  controls are at 236.39–280.39; at 768/1280 the tabs row is 144.39–182.39 and the controls
  206.39–242.39. Classification and sort share a row (`top` differs by < 4px in all three).
- **375px classification button: pass.** Visible text is `撮影月` (`innerText`), no `分類`;
  both buttons are exactly **44.00px** tall (≥ 44).
- **640px and wider: pass.** `分類 撮影月` at 768 and 1280; both buttons 36px tall.
- **Sort button shows only its value: pass** at every width (`新しい順`), and after choosing
  `古い順` it shows `古い順` and the shelves redraw.
- **Sort accessible name: pass.** `並べ替え: 新しい順` / `並べ替え: 古い順`; a role lookup for
  that exact name finds exactly one button at each width. Classification is
  `分類: 撮影月`.
- **Menus: pass.** The classification menu is `role="menu" aria-label="分類"` with four
  `role="menuitemradio"` items in the order `撮影月, タグ, コレクション, フォルダ`; the value
  in force is `aria-checked="true"` (撮影月, then タグ after choosing it). The sort menu is
  `role="menu" aria-label="並べ替え"` with `新しい順, 古い順`, the value in force checked
  (新しい順, then 古い順). At 768/1280 the panel is 192×154 with 36px items, placed under the
  trigger (left-aligned for classification, right-aligned for sort); at 375 both are a
  bottom sheet 359px wide.

Verdict: **PASS**.

## Item 3 — section 9 item 4, shelf page at 375 / 768 / 1280

Capture: See all of the 2024年12月 shelf clicked at each width →
`pl-layout-shelf-<viewport>-month-2024-12-page1.png` and `…-all.png`; one shelf of each
other classification in `pl-layout-shelf-<viewport>-<by>-<key>.png`.

- URL after See all: `…/photo_diary/shelf?by=month&key=2024-12` (no `sort`, newest in force).
- **Back link above the title: pass.** Link `フォトダイアリー` at top 84, `h1` at top 108, at
  all three widths.
- **Title row, 768 and 1280: pass.** Sort and Target at top 108, i.e. on the `h1` row; right
  edges: 768 → 605.39 and 752.00 (container right 752); 1280 → 1117.39 and 1264.00
  (container right 1264). Title `2024年12月`, scope `main · 56枚`.
- **375: pass.** Target at the end of the scope line (target top 144.39, scope line top
  144.39, right 367); sort on its own row below (top 196.39, right 367, i.e. right-aligned in
  the gutter) and above the photos (first photo top 264.39).
- **Justified grid, all lines: pass.** 56 cells drawn, none hidden; 23 rows at 375, 14 at
  768, 11 at 1280. Every row but the last ends exactly at the grid's right edge (359 / 752 /
  1264); the last row ends short (274.02 / 440.72 / 1146.47) as the core's unstretched last
  line. Cell ratios equal the thumbnails' natural ratios (max delta 0.000); row-1 heights
  148.97 / 240.08 / 227.13.
- **Second page: pass.** 40 photos after load, **56 after scrolling** at 375, 768 and 1280
  (40 per page).
- **Other shelves: pass.** `家族` (tag) title 家族, total 10; `年末` (collection) 12;
  `Photos` (folder) 42; `がっこう` (folder) 3 — the shelf page's scope total equals the
  Library shelf's count in each case, at all three widths, and no horizontal overflow.
- **NFD folder `がっこう`: pass.** Library h2 `がっこう` (U+304C U+3063 U+3053 U+3046, NFC),
  count `3枚`; shelf page `h1` the same string, scope `· 3枚`, 3 photos. Link key is NFC.

Verdict: **PASS**.

## Item 4 — shelf titles and counts (Definitions)

From `pl-layout-library-1280x900-<by>-newest.png` and the API answers; counts equal the API
(`/library/shelves`) and the month counts equal `/calendar/months`.

- month (newest): 2025年9月 9枚, 2025年8月 10枚, 2025年7月 10枚, 2025年6月 9枚, 2024年12月
  56枚, 2024年11月 9枚, 2024年10月 3枚, **撮影日なし 10枚 (last)**.
- tag: trip 12枚, 家族 10枚, 旅行 8枚, sunset 3枚, **タグなし 86枚 (last)** (by count, then
  name; unchanged by the sort).
- collection: 年末 12枚, 学校 3枚, スクリーンショット 4枚, **コレクションなし 97枚 (last)**.
- folder: Photos 42枚, 2024 65枚, **がっこう 3枚**, Screenshots 6枚 — exactly one shelf per
  top-level folder that holds an image. No shelf for `Trips` (12 non-image files) and no root
  shelf (no photo directly in the root). The NFD folder is drawn composed (see item 3).
- Month titles are `YYYY年M月` with no zero padding (`2025年9月`), built from the key.

Verdict: **PASS**.

## Item 5 — empty Library (`Videos only`)

Captures `pl-layout-empty-1280x900.png`, `pl-layout-empty-375x812.png`.

Choosing the target `Videos only` (smart folder with no image) leaves the core's
`EmptyState`: box `flex flex-col items-center justify-center py-16 text-center`, a 48px
`lucide lucide-images` icon (`aria-hidden="true"`), `h2` **写真はありません**, **no `<p>`**
description, no action buttons, no shelf sections. Header count becomes `· 0枚`, target
`Videos only`. No horizontal overflow at either width.

Verdict: **PASS**.

## Item 6 — English (cookie `NEXT_LOCALE=en`, 1280)

Captures `pl-layout-english-1280-library.png`, `…-shelf.png`, `…-empty.png`, `…-folder.png`.

- Tabs: `Library | Calendar | Map`. Header `Photo Diary`, scope `main`, `· 116 photos`.
- Classification trigger `Group by Month taken` (aria `Group by: Month taken`); menu
  `Month taken, Tag, Collection, Folder`, `Month taken` checked.
- Sort trigger `Newest first` (aria `Sort: Newest first`); menu `Newest first, Oldest first`.
- `See all` on every shelf; counts `9 photos` … `56 photos`.
- Shelf titles: `Sep 2025, Aug 2025, Jul 2025, Jun 2025, Dec 2024, Nov 2024, Oct 2024,
  No capture date` (last); tag `trip, 家族, 旅行, sunset, No tag`; collection `年末, 学校,
  スクリーンショット, No collection`; folder `Photos, 2024, がっこう, Screenshots`.
- Shelf page: back `Photo Diary`, title `Dec 2024`, scope `· 56 photos`, sort `Newest first`,
  target `All photos`.
- Empty: `No photos`, no description, same Images icon, header `· 0 photos`.

Verdict: **PASS** (every string listed above is the English one; the Japanese names of
user-created tags/collections/folders and the NFD folder stay as data).

## Item 7 — design comparison

Artboard captures: `pl-layout-design-artboard-{Main,Tags,Shelf}-1280.png` and
`…-{Phone,Phone-Shelf}-375.png` (template-expanded, see the environment note at the top).
App captures at the same viewport: `pl-layout-design-app-library-month-1280.png`,
`pl-layout-design-app-library-tag-menu-1280.png`, `pl-layout-design-app-shelf-1280.png`,
`pl-layout-design-app-library-375.png`, `pl-layout-design-app-shelf-375.png`. Measurements
from both sides are in the `design-measure` manifest line.

Structure, order and control placement match: header (icon, title, scope, Target), tabs,
controls row (classification, sort), shelves (title, count, See all at the row's right end,
photo line); shelf page: back link, title row with sort and Target at its right end (wide),
Target at the end of the scope line and the sort in its own right-aligned row above the
photos (375). Visible differences, one per line (artboard vs app):

1. **Photo line stops short of the shelf's right edge** in the app and reaches it in the
   artboard: Main/1280 app `2025年9月` ends at x=1072 with 191.95px empty before 1264, the
   artboard's row ends at 1264; Phone/375 app ends at x=344 with 15px empty before 359, the
   artboard's row ends at 359. (`pl-layout-design-artboard-Main-1280.png` vs
   `pl-layout-design-app-library-month-1280.png`; `…-Phone-375.png` vs
   `…-app-library-375.png`) — the same defect as item 1.
2. **Classification menu has no caption row**: the artboard's panel opens with a muted `分類`
   caption above the four items; the app's panel starts with the first item.
   (`pl-layout-design-artboard-Tags-1280.png` vs
   `pl-layout-design-app-library-tag-menu-1280.png`)
3. **Menu size**: artboard 220px wide with 40px items; app 192px wide with 36px items. (same
   pair)
4. **Grid gap**: artboard shelf page rows use 4px, the app's justified grid 8px; on 375 the
   artboards use 3px, the app 8px. (`…-artboard-Shelf-1280.png` vs `…-app-shelf-1280.png`;
   `…-artboard-Phone-Shelf-375.png` vs `…-app-shelf-375.png`; `…-artboard-Phone-375.png` vs
   `…-app-library-375.png`)
5. **Tile corner radius**: artboard placeholder tiles 6px, the app's cells 12px (rounded-xl).
   (all five pairs)
6. **Shelf-to-shelf spacing**: app 40px at ≥640 (36px at 375); artboard 36px at 1280 and 28px
   on the phone. (`…-artboard-Main-1280.png` vs `…-app-library-month-1280.png`;
   `…-artboard-Phone-375.png` vs `…-app-library-375.png`)
7. **Phone shelf title size**: artboard 17px, app 18px (`text-lg`). (`…-artboard-Phone-375.png`
   vs `…-app-library-375.png`)
8. **Gap between the tabs row and the controls row**: artboard 16px at 1280 and 12px at 375
   (nav bottom 120 → controls top 136; 176 → 188), app 24px (nav bottom 182 → controls top
   206; 212 → 236); and the first tab's label sits at x=20 in the artboard against 32 in the
   app (the app's tab links carry 16px horizontal padding against the artboard's 4px, so the
   active underline is wider). (`pl-layout-design-artboard-Main-1280.png` vs
   `pl-layout-design-app-library-month-1280.png`; `…-artboard-Phone-375.png` vs
   `…-app-library-375.png`)
9. **Top bar and sidebar**: the app draws a 76px global top bar (menu, search, new, avatar) at
   every width and a populated 240px sidebar at 1280; Main/Tags/Shelf artboards draw no top
   bar and an empty 240px rail, and Phone/Phone-Shelf a 48px bar with the menu button only.
   (all pairs; app shell, outside this change)
10. **Count/scope text**: artboard `124` / `photos · 3,672枚`, app `9枚` / `main · 116枚`
    (the app adds the unit and shows the drive; per spec and data).
11. **Photo overlays at 375**: the app draws the file name band and the favourite circle over
    each photo (coarse pointer); the artboard placeholders have none. (content, not layout)

Row 1 is the mismatch against the spec (I11, 9.4) and the design's filled rows. Rows 2–8 are
visible differences between the app's own chrome/components and the artboard styling; rows
9–11 are app shell, data and placeholder content.

Verdict: **FAIL** (row 1 is the same visible mismatch as item 1; rows 2–8 are visible
differences from the agreed design).

## What I could not check

- The real Design Canvas render of the artboards: `support.js` is missing from
  `docs/reviews/library/design/`, so I expanded the artboards' own templates myself. Their
  absolute geometry may differ slightly from the Canvas renderer.
- The Library at 768x900 with a sidebar: the app does not show a sidebar at 768.
- A Japanese UI in a cookie-less context: the default locale is `en`, so "Japanese is the
  default" could not be confirmed; all Japanese states were captured with `NEXT_LOCALE=ja`.
- Failure states (retry, LoadError, 422 link, 404, re-read after a write) and behaviour after
  a context-menu write: not part of my items.
- One `502 (Bad Gateway)` console error appeared during the very first probe before any
  capture; no visible thumbnail failed to load in any captured state (every drawn photo had
  its natural size), so I could not attribute it and it did not affect the numbers.
- Anything a real device has to show (`PROJECT.md` `agent_cannot_verify`).

## Checker `writes` (second pass, d4aa936)


- Addon: `addons/photo_diary`, branch `feature/library`, HEAD `d4aa9360237c91db7a105bf3436d5f102e3b65b5`.
- Core checkout the stack was built from: `a405538a2de7520c9b2f185648dd6bfa7bf6232a` (clean tree).
- Ran against the prepared stack `litloft-r5-plib` at http://localhost:3993 (frontend + backend, `main` drive). I did not start, stop or rebuild anything, and touched no other container.
- Browser: Chromium from `frontend/node_modules/@playwright/test`, `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. 1280x900 for the write items; 375x812 (hasTouch, isMobile), 768x900 and 1280x900 for re-check 7; 1280x900 and 375x812 for re-check 8.
- Language: the stack answers with `NEXT_LOCALE` unset in English (`defaultLocale = 'en'`), so I set the `NEXT_LOCALE=ja` cookie in every context to read the UI in Japanese, as the task states and as the artboards are drawn. English strings were therefore not exercised.
- Scripts and screenshots: `.r5/pl/writes/` (`lib.js`, `recheck6.js`, `recheck7.js`, `recheck8.js`, `render-design.js`, `write1.js` … `write5.js`, `verify-*.js`). Every captured state is one line in `.r5/pl/writes/manifest.jsonl` (67 lines) with state name, viewport, screenshot and the DOM measurements. Raw per-item JSON: `item1.json` … `item5.json`, `out-*.txt`.
- Server state seen at the start (API, from the page): 8 month shelves `2025-09:9, 2025-08:10, 2025-07:10, 2025-06:9, 2024-12:56, 2024-11:9, 2024-10:3, undated:10` (116 photos, header `main · 116枚`); tags `trip:12, 家族:10, 旅行:8, sunset:3, no_tag:86`; collections `年末:12, 学校:3, スクリーンショット:4, no_collection:97`; folders `Photos:42, 2024:65, がっこう:3, Screenshots:6`. Trash empty.

Design artboards: I opened all five `.dc.html` files from
`addons/photo_diary/docs/reviews/library/design/` in the browser at their own sizes
(`pl-writes-design-main|tags|shelf|phone|phone-shelf.png`). `./support.js`, which the
files load, is **not present in that directory** (the request fails), so everything
inside `sc-for` (shelves, photos, the four menu items) stays as raw `{{…}}` template
text and only the static frame draws: header, tabs, controls, and on Tags the
`分類` menu caption. I compared item 8 against the artboard HTML plus that static
frame, not against a rendered menu.

## Re-checks (run first, before any write)

### 6. I9 and section 9 item 7 — back from a photo, and a reload of `?view=library`

Library by month (`?view=library`, `month`/`newest`):

- Wheel to 1200 at (700,500): `scrollY = 1200`. A photo fully inside the viewport at
  that position was clicked **by its on-screen coordinates**, (426,518) — 2024年12月
  shelf, 340x227, its top at viewport y=404 — after re-confirming `scrollY = 1200`
  right before the click. It opened `/drive/main/2024/12?file=jQkRGoM-vHZP`.
- Back: `?view=library`, `scrollY = 1200`, 8 shelves, `分類 撮影月`, `新しい順`.
  `pl-writes-recheck6-library-scroll1200.png`, `-library-photo-page.png`, `-library-back.png`.

Shelf page `shelf?by=month&key=2024-12`:

- First read 40 photos; scrolling to the end loaded the second page: 56 photos,
  `main · 56枚`, `scrollY = 1910` at that moment.
- Wheel to 1600 (`scrollY = 1600`), clicked by coordinates (360,350) a visible photo
  (`Lib-2024-12-43`) → `/drive/main/2024/12?file=v4eyNRHlpcy6`. Back: `scrollY = 1600`,
  56 photos, title 2024年12月. `pl-writes-recheck6-shelf-p1|p2|scroll|photo-page|back.png`.

Reload of `?view=library`:

- Restored `scrollY = 1200`, 8 shelves in the same order, `month`/`newest`. The saved
  state in sessionStorage read
  `{"library":{"loaded":1,"scrollY":1200,"by":"month","sort":"newest"},"target":"default"}`.
  `pl-writes-recheck6-library-reload.png`.

So: back from a photo restores depth and scroll on both faces, and a reload of
`?view=library` restores them too. Matches I9 / item 7.

### 7. I11 at 375, 768 and 1280 — each month shelf's drawn line

One row top per shelf at every width (no second line). "right" = right edge of the
last drawn photo; "shelf right" = the shelf's own right edge. All photos of a shelf are
the same height in a line (the numbers below are that height).

| shelf | 375 (shelf right 359) | 768 (shelf right 752) | 1280 (shelf right 1264) |
|---|---|---|---|
| 2025年9月 9枚 | 2 imgs 168x126, right 359 | 2 imgs 364x273, right 752 | 3 imgs 331x248, right 1264 |
| 2025年8月 10枚 | 2 imgs 168x126, right 359 | 2 imgs 364x273, right 752 | 3 imgs 331x248, right 1264 |
| 2025年7月 10枚 | 2 imgs 168x126, right 359 | 2 imgs 364x273, right 752 | 3 imgs 331x248, right 1264 |
| 2025年6月 9枚 | 2 imgs 168x126, right 359 | 2 imgs 364x273, right 752 | 3 imgs 331x248, right 1264 |
| 2024年12月 56枚 | 2 imgs 223+112 x149, right 359 | 3 imgs 360/180/180 x240, right 752 | 4 imgs 340/170/170/303 x227, right 1264 |
| 2024年11月 9枚 | 2 imgs 214+121 x161, right 359 | 3 imgs 268/301/151 x201, right 752 | 4 imgs 267/300/150/267 x200, right 1264 |
| 2024年10月 3枚 | 2 imgs 214+121 x161, right 359 | 3 imgs 268/301/151 x201, right 752 | 3 imgs 267/300/150 x200, right **989** |
| 撮影日なし 10枚 | 2 imgs 168x126, right 359 | 2 imgs 364x273, right 752 | 3 imgs 331x248, right 1264 |

- Every drawn line ends exactly at the shelf's right edge, with the 8px gap between
  photos, except 2024年10月 at 1280: its 3 photos all fit at the 200px base height
  (267+300+150 + 16 = 733 of 1008), so it stays at the base height unstretched and
  stops 275px short — the "a shelf whose photos all fit stays at the base height"
  case, not a gap inside a filled line.
- No photo crosses the shelf's right edge at any width, and no shelf draws two row
  tops. Base heights are respected: the justified lines at 768/1280 are 200–240px
  (2024年12月 stretches to 227 at 1280 and 240 at 768 to fill the line) and the
  narrower lines at 375 are 149–161px, above the 120px base because 375 is below a
  40rem grid width and the line stretches to fill 343px.
- The 2025年* and 撮影日なし shelves are drawn by the core's **card grid** (4:3 cards,
  331x248 at 1280, 364x273 at 768, 168x126 at 375), i.e. the "under 90% of them with
  stored dimensions" branch of item 7, not a justified line; their first row also fills
  the width. Screenshots `pl-writes-recheck7-375|768|1280.png`.

### 8. Classification menu caption at 1280 and 375

- 1280: button `分類: 撮影月` (visible text "分類 撮影月", 36px tall) at (256,206). Menu
  `role="menu" aria-label="分類"` opens under it, width 190px, with a caption `分類`
  (`rgb(98,98,91)` = text-muted, 12px, at y=251) above four `role="menuitemradio"`
  items of 36px: 撮影月 (checked, `aria-checked="true"`, check icon, `bg #f6f6f3`),
  タグ, コレクション, フォルダ. Matches the Tags artboard's caption-over-four-items.
  `pl-writes-recheck8-menu-1280.png`.
- 375: the classification button shows only `撮影月` (no `分類`), 108x44px. The menu
  opens as a bottom sheet (`position: fixed`, `inset-x-2 bottom-4`): caption `分類`
  (same muted 12px) above the same four radio items, 357px wide at y=647..791.
  `pl-writes-recheck8-menu-375.png`. The artboards do not draw the open menu at 375,
  so only the caption/items were compared.

## Writes (I13, section 1 item 17)

The core's file context menu offers: ダウンロード, コレクションに追加, コピー, カット,
IDをコピー, 名前を変更, 移動, ゴミ箱に移動 — **no tag editing**, so item 1 used the
trash path it allows. Every write was confirmed in the core's overlay
(「…」をゴミ箱に移動しますか？／30日後に自動的に削除されます／キャンセル／ゴミ箱に移動).

### Item 1 — Library by タグ, sunset photo to trash

- Before: classification タグ, 5 shelves (trip 12, 家族 10, 旅行 8, sunset 3, タグなし 86),
  scrolled to `scrollY = 901`, header `main · 116枚`.
- Right-click on the first sunset photo, `Lib-2024-12-52` (id `3IuA1Ribcr6M`), at
  (331,409): menu as above → ゴミ箱に移動 → confirm.
- One re-read: `GET /api/addons/photo_diary/library/shelves?by=tag&sort=newest&per_shelf=12&shelf_limit=12&offset=0` → 200.
- After: `scrollY = 901` (unchanged), **5 shelves** (unchanged), sunset `2枚` with ids
  `[doT2NEtN5MYA, k6-R3BO9rqkg]` (the trashed id gone), header `main · 115枚`.
  API: `sunset 2`, `家族 9` (the photo carried both tags), `2024-12 55`; `trip 12`,
  `旅行 8`, `no_tag 86` unchanged. The photo left the target (trash), so N dropped by
  one: 116 → 115.
  `pl-writes-item1-before.png`, `-menu.png`, `-confirm.png`, `-after.png`.

### Item 2 — Library by 撮影月, a 2025-07 photo to trash

- There are only 8 month shelves, so nothing more loads: wheel to the bottom gave
  `scrollY = 1876`, 8 shelves, header 115. Then wheel to the 2025年7月 shelf:
  `scrollY = 757`, 2025年7月 `10枚` (10 photos drawn).
- Right-click `2025-07-24-hakodate-16` (id `RoLSQ_YAxIHP`) at (421,321) → ゴミ箱に移動 →
  confirm. Re-read `…/library/shelves?by=month&…` → 200.
- After: `scrollY = 757` (unchanged), 8 shelves, 2025年7月 `9枚` (that id gone),
  header `main · 114枚`; API `2025-07: 9`, calendar `2025-07: 9`, all other months
  unchanged. `pl-writes-item2-bottom|before|after.png`.

### Item 3 — shelf page 2024-12, second page loaded, first-page photo to trash

Run 1 (`pl-writes-item3-p1|p2|before|after.png`):

- First read 40 photos (`main · 55枚` at that point, after item 1). Scrolling to the
  end loaded page 2: **55 photos** loaded (40+15), `scrollY = 1825`.
- Right-clicked `Lib-2024-12-41` (id `EITbD0waHhQ7`, index 29 of page 1) at (407,337);
  it was visible in the viewport at `scrollY = 1825`. One re-read:
  `GET /api/addons/photo_diary/library/shelf?by=month&key=2024-12&sort=newest&limit=55&offset=0` → 200.
- After: **54 photos** loaded (old minus one, not reset to 40), `scrollY = 1825`
  unchanged, scope line `main · 54枚`, API `total: 54`, the id gone.

Run 2 (`pl-writes-item3b-*.png`) measured the Target count, which run 1 could not
(the title row is not sticky, so the Target button is off-screen when scrolled):

- Second page loaded: 54 photos, `scrollY = 1852`. Target menu at the top:
  すべての写真 **113**.
- Wheel to 1700, right-clicked `Lib-2024-12-15` (id `RPlG0xWfoN0l`, index 26 of page 1)
  at (409,226) → trash. After: **53 photos**, `scrollY = 1700` unchanged, scope
  `main · 53枚`, Target menu すべての写真 **112** (read again after the write).

### Item 4 — a failed re-read keeps what is drawn and recovers on retry

Shelf page (blocked `**/api/addons/photo_diary/library/shelf**` and
`**/api/files/batch/get**` with `abort()`):

- 2024-12 with both pages loaded: 53 photos, wheel to `scrollY = 1600`; right-clicked
  `Lib-2024-12-42` (id `cB94HAmSu-8l`) at (420,321) → ゴミ箱に移動 → confirm.
- Blocked state: **53 photos still drawn**, and a `読み込めませんでした` / `再試行`
  block appears **above** them (retry button at absolute y=200, photos below). The
  aborted request was `…/library/shelf?…&limit=53&offset=0` (`net::ERR_FAILED`).
  `scrollY` read 1656 instead of 1600: the ~56px banner inserted above the photos
  moved the scroll offset by exactly its height, i.e. the browser kept the photos
  visually in place (scroll anchoring); the drawn photos did not move on screen.
  `pl-writes-item4a-blocked.png`.
- Unblocked and pressed 再試行 → one 200 on `/library/shelf`; recovered with **52
  photos** (the trashed photo gone, the rest of the loaded depth kept — not reset to
  40) and `main · 52枚`. The retry button sits above the viewport when scrolled down, so
  reaching it (Playwright and a person alike) scrolls to the top; the reading after
  recovery was `scrollY = 0` because of that, not because the page lost the position.
  `pl-writes-item4a-before|p2|recovered.png`.

Library (blocked `**/api/addons/photo_diary/library/shelves**`):

- By month, 8 shelves, wheel to `scrollY = 1200`, header 111; right-clicked
  `Lib-2024-12-56` (id `jQkRGoM-vHZP`, 2024年12月) at (426,518) → trash → confirm.
- Blocked state: the **8 shelves stay drawn** with their old counts (2024年12月 still
  `52枚`), and `読み込めませんでした` / `再試行` appears above them (retry at absolute
  y=278, first shelf at y=362). The aborted request was
  `…/library/shelves?by=month&sort=newest&per_shelf=12&shelf_limit=12&offset=0`
  (`net::ERR_FAILED`). The header already read `main · 110枚`: the count read
  (`/calendar/months`) succeeded while the shelves read failed. `scrollY` again grew
  by the banner's height (1200 → 1296) with the shelves held in place.
  `pl-writes-item4b-blocked.png`, `-blocked-top.png`.
- Unblocked and pressed 再試行 at its own coordinates → 200; the error cleared and the
  **8 shelves** came back with 2024年12月 now `51枚`, header `main · 110枚`, same
  depth (8 shelves, one page). `pl-writes-item4b-recovered.png`.

### Item 5 — restore, and the counts back to before the writes

- Trash page (`/drive/main?view=trash`, the sidebar's ゴミ箱): 6 files —
  `Lib-2024-12-56, Lib-2024-12-52, Lib-2024-12-42, Lib-2024-12-41, Lib-2024-12-15,
  2025-07-24-hakodate-16` — restored one by one with 復元 (six restores, list shrank
  each time). `pl-writes-item5-trash-before|after.png`, `-trash-empty.png`.
- Trash now reads `0件 / ゴミ箱は空です`.
- No tag was removed (the menu has no tag editing), so there was no `sunset` tag to
  re-add; `sunset` stayed at 3 throughout and is 3 now.
- API after the restores: tags `trip 12, 家族 10, 旅行 8, sunset 3, no_tag 86`; months
  `2025-09 9, 2025-08 10, 2025-07 10, 2025-06 9, 2024-12 56, 2024-11 9, 2024-10 3,
  undated 10` (sum 116); `/calendar/months` identical; collections `年末 12, 学校 3,
  スクリーンショット 4, no_collection 97`; folders `Photos 42, 2024 65, がっこう 3,
  Screenshots 6` — all as at the start. The five restored 2024-12 ids are in
  `/library/shelf?by=month&key=2024-12` (total 56) and `RoLSQ_YAxIHP` is back in
  2025-07 (total 10).
- In the UI: `?view=library` by month shows header `main · 116枚` and the 8 original
  counts; by tag shows `trip 12, 家族 10, 旅行 8, sunset 3, タグなし 86`.
  `pl-writes-item5-library-month.png`, `-library-tag.png`.

## What I could not check

- The artboards' dynamic content (see the top): `support.js` is absent from the design
  directory, so no artboard was compared as a rendered picture.
- A shelf page with more than 100 loaded photos. The re-read is a **single** request
  with `limit=<loaded>` (observed `limit=54`, `limit=53`, `limit=55`); the route caps
  `limit` at 100, so a shelf page with more than 100 loaded photos would send
  `limit>100`. The largest shelf on this drive is 56 photos, so I could not produce
  that state. Untested suspicion, not an observed failure.
- A Library with more than one page of shelves (12): this drive has 8 month shelves
  and 5 tag shelves, so the multi-page re-read and the later-page retry never happen.
- English UI strings; nothing here was exercised in English.
- The trash's 30-day expiry, permanent delete, and any other drive (`family-archive-2019-2026-shared`) were not touched.

## Observations, not failures

- The core's confirmation overlay has no `role="dialog"` / `aria-modal`; it is a
  `div.fixed.inset-0.z-50` with three buttons. It is core code, not this addon's.
- After a failed re-read the banner is inserted above the drawn content, so with the
  window scrolled down the retry button is off-screen; the drawn content stays put
  (scroll anchoring grows `scrollY` by the banner's height). This is the behaviour the
  spec asks for ("LoadError with retry appears above it, as the map does"); I record it
  because a user scrolled mid-page cannot see the error.

## Verdicts

PASS item 1
PASS item 2
PASS item 3
PASS item 4
PASS item 5
PASS re-check 6
PASS re-check 7
PASS re-check 8
