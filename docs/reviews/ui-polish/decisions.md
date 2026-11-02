# ui-polish decisions

## Direction, before the spec

- Design artifact: https://claude.ai/artifact/RG7AAU9Pm6bZyiyuDpeyw1. The user rejected patterns 1 and 2 as out of keeping with the app, and chose pattern 3 for the map, including the tabs at the top right.
- Calendar: compared on the production `photos` drive on 2026-11-01, through a temporary overlay in one browser tab that changed nothing on the server. The user chose no photo at rest with a hover preview, coral, middle strength, no legend.
- Thresholds: measured on production, 581 dated days: 388 with 1 to 2 photos, 137 with 3 to 9, 43 with 10 to 29, 13 with 30 or more.

## At approval, 2026-11-02

- Station names are left out for now. The user decides which text to add to the map after seeing the implementation at street zoom.

## Implementation, 2026-11-02

- Glyphs: Noto Sans Regular, U+0000 to U+2FFF, 48 files of 256 code points, from the versatiles-fonts release 3.0.0 (`noto_sans.tar.gz`). The files were fetched from `tiles.versatiles.org/assets/glyphs/noto_sans_regular/` and are byte-identical to those in the release archive. The version string in the file names is the release's, `3.0.0`. The OFL text is the one in `notofonts/latin-greek-cyrillic`, shipped as `noto-sans-OFL-3.0.0.txt`.
- Size added to `backend/assets`: 3,266,037 bytes (about 3.1 MiB) for the 48 glyph files and the licence together.
- `.pbf` is served as `application/x-protobuf`.
- Placement of 50,000 generated points (Chromium, software GL, zoom 12 over a 0.3 by 0.2 degree area): the first pin is in the document 1.52 to 1.56 seconds after the map is asked for, in three runs, against the 3 second limit. The map holds fewer than 400 pins in that view.
- `setTiles` on the vector source reloads the tiles that loaded and leaves the errored ones as they are, so the tile notice's retry makes the source again.
- The human revised I6 (see `invariants.md`): the narrow strip engages when the list's heading reaches the strip's position.

## R-5

decision:
ran_in_app: yes
at: 9bef86fe0b9a924508a37267f851e483f42658bb
by: agent
evidence: Stack built from the core worktree (core 6f6c0b27f, addon at the commit above): backend, frontend, knowledge, intelligence. Default tile server (`vector.openstreetmap.org/shortbread_v1`), real tiles, no bulk fetch. Chromium (Playwright, software GL) at 1280x900, 1280x420/380 and 390x844 touch; Safari in the iPhone 17 Pro simulator (iOS 26.5) with idb and the web inspector. Fixture on drive テスト画像: 197 generated JPEGs with EXIF dates and GPS in October 2026 (days with 1, 2, 3, 5, 9, 10, 14, 18, 29, 31 and 36 photos, so all four steps and two days over 30; Tokyo, Kyoto, Osaka, Sapporo, Naha; day 24 and the Tokyo cluster tight enough to need zoom 18), 6 undated with GPS, and notes for 2026-10-12 (with photos) and 2026-10-21 (no photos). Removed afterwards: files deleted, drive scanned, the 199 missing rows purged through `/api/files/batch/purge`, scanned again (total back to 1352; one missing row, `r5-text-lines/archive.zip`, was there before and is untouched). The drive also holds about 1,000 other test photos, so the maps show them too. Screenshots are in /private/tmp/claude-502/-Users-libre-Sources-video-share/812503e2-427e-4330-9671-259b59381572/scratchpad/r5/ (session scratchpad, not kept); the requested ones are map-{light,dark}-z12.png, -z13.png, -z15.png, -z16.png (also z9, z18), calendar-{light,dark}-1280.png and narrow-strip-light-390.png.

  As specified:
  - Steps (SPEC-PD-008, I1): computed backgrounds are accent at 0.1 (1, 2 photos), 0.2 (3, 5, 9), 0.4 (10, 14, 18, 29) and 0.6 (31, 36); count colour #62625b at step 1 and #211922 above; a day with nothing is transparent; the note-only day is #f6f6f3. Pen on days 12 and 21. Selected step-4 day shows the accent border with the inner ring.
  - Fade (I3): Next/Previous and browser Back draw a staggered 0 to final alpha ramp (first cell at about 100 ms, a cell 29 places later at about 500 ms, ending near 900 ms); a page loaded with `?month=` or `?month=&date=` draws at once; no query shows the ramp (56 distinct alphas); pressing a day and Calendar/Map/Calendar on the same month draw at once; reduced motion draws at once in every case.
  - Hover preview: at 60 ms no request; after 120 ms one `/photos?date=...&limit=1` and one thumbnail; the image is 170x126 inside its 3 px border, centred on the cell and 8 px above it; leaving, pressing the day and scrolling remove it; a second hover of the same day makes no request; a day with no photos reads nothing; a response for a day the pointer left (read delayed 1.2 s) draws nothing; an aborted read draws nothing; keyboard focus draws nothing. On the iPhone, `(hover: hover)` is false and no preview appears.
  - Held column (SPEC-PD-009): at 1280x900 the column is sticky, top 72 px (header 56 + 16), through scroll to the end of a 36-photo list. At height 420 it stays in the flow and the 30th and 31st remain reachable and pressable; resizing 900 to 420 and back while on the Map tab gave in-flow, then sticky, on returning to Calendar.
  - Strip at 390 (I6 as revised): hidden with a list open until the heading reaches the strip (appears between scrollY 400 and 500); month text at left, back control (aria-label Show month) at right, seven days of the open day's week (44 px high, 46 px wide, counts shown, 18 and 23 blank-style days without surface); heading sits at 139 px under it. Pressing 20 in the strip opened it and left the heading at 139 (scrollY 485); pressing the open day did nothing; the back control scrolled so the month bar title is at 64 px (under the 56 px header) and focused the open day. Pressing 22 (2 photos) clamped at scrollY 26 on a document of 870 px and the strip was hidden, which the spec's clamp rule allows.
  - Back from a photo (I4): scrollY 900 before and 900 at 0.3 s, 1.5 s and 5 s after Back, at 1280 and at 390 (the strip is present again at 390). The map's list at 390 returned with the sheet open after Back. In Simulator Safari: scrollY 926 before and 926 after the toolbar Back.
  - Map base (SPEC-PD-010): quiet vector base in both palettes, 渋谷区 / 目黒区 labels drawn with the browser's CJK font and Latin with the bundled glyphs; every tile answered 200 with `Referer: http://localhost:3000/`; calendar-only session contacted only localhost:3000; map session only localhost:3000 and vector.openstreetmap.org (I7). Theme change with the map open and a list open (the OS colour scheme switched live in Chromium, and the simulator's appearance in Safari): data-theme and base repainted, centre and zoom unchanged, list still open, tile responses 4 before and 4 after.
  - Pins (SPEC-PD-011, I9, I10): sizes 44 (below 10), 50, 58 (29, 41), 68 (101, 132, 133); badge on 2 or more only; aria-label "N photos" / "1 photo". Press at zoom 12, 13, 15, 16, 18 and 19 for the largest, a middle and a one-photo pin: the list total equals the label every time once the list is scrolled to its end (the list pages in 40s, so 132 shows 48 first and 132 after scrolling; 41 shows 40 then 41). Selected pin has the accent border (rgb 214,48,49; computed width reads 2px) and only one pin at a time; selecting another moved it. Drag from a pin with the mouse (160 px) moved the centre and opened no list; a 2 px move opened it. Same with idb on the simulator: swipe from the 134-photo pin moved the centre from 137.93,37.39 to 139.72,36.03 and opened nothing. Thumbnails aborted: pins stay, sand (#e5e5e0), with badge, and open their list.
  - Tile notice: tiles aborted or answered 500 show "Map tiles could not be loaded" with pins on land colour and pressable; 404 shows no notice; after unblocking, a small pan cleared the notice within 1.5 s. The notice has no retry control.
  - Layout (SPEC-PD-012): at 1280 the tabs are at the right end of the title row; the map runs from 148 px to the viewport bottom (752 px at 900 high) with no card edge, document height equals the viewport; at 380 high it holds 384 px (24rem) and the document grows to 532 px. At 390 the tabs have their own row and the map starts at 196 px and fills to 844 px. Close control is an icon-only x, colour rgb(98,98,91), 32 px box (the 44 px target is a `::before` overhang on a coarse pointer, not measured as a box). Attribution at the top left, zoom buttons at the top right at both widths, with the sheet open too.
  - iOS Simulator (Safari, iPhone 17 Pro, 402x714 viewport): calendar steps, month bar, strip, strip press, back control with focus, scroll restore after Back, map with real WebGL, vector base, Japanese place names, pins with badges, pin press opening the bottom sheet with the selected border, theme repaint in dark and back, drag from a pin.

  Differences from the spec or the design:
  1. Narrow, sheet open: the selected pin is behind the sheet when the pin is in the lower part of the map (ios-map-pin-sheet.png); the map does not move to keep it visible. The spec does not say it should.
  2. English month bar on a wide layout wraps with the undated button present: Today sits on a second row under the previous button (calendar-light-1280.png). Already listed by the daily-notes second run (difference 3); not changed by this branch.
  3. The tile notice has no retry button; recovery is the first idle after the viewer pans or zooms. This matches the code comment, and the spec's text says only "the existing notice, on the same rule".

  Not run: the street-zoom base judgement (shown only: map-light-z16.png, map-dark-z16.png, map-light-z18.png, map-dark-z18.png, map-light-z15.png, map-dark-z15.png, for the human). The 50,000-point placement (measured at implementation, not repeated). A banner coming or going while the map is up. A browser run of the narrow strip in dark. Back inside the Litloft iOS app (the app was not opened; Back was run in Safari). A pinch on the simulator (idb has no two-finger gesture; zoom there used the map's buttons). `PHOTO_DIARY_TILE_URL` set to another server. Glyph failures.
pending: iOS on a real device, and the Litloft iOS app's own Back; whether the base map looks right at street zoom (human); reading the preview and pin thumbnails as pictures of real photos.

## R-5, second run

decision:
ran_in_app: yes
at: b99a3e83096263a2f6306804f39d62cdd0490301
by: agent
evidence: Narrow run over `CalendarView.tsx` and `map/createPhotoMap.ts`. Stack rebuilt from the core worktree (core 6f6c0b27f, addon at the commit above, clean tree): backend, frontend, knowledge, intelligence; default tile server, real tiles. Fixture on drive テスト画像: the same 197 generated JPEGs as the first run (EXIF dates and GPS, October 2026) in `test_images/r5b-fx/pics`, no notes. Removed afterwards: files deleted, drive scanned, the 197 rows purged through `/api/files/batch/purge`, scanned again (drive total back to 1352), stack down. Chromium (Playwright, software GL) at 390x844 touch and 1280x900; Safari in the iPhone 17 Pro simulator (iOS 26.5) with idb and the web inspector. Screenshots are in /private/tmp/claude-502/-Users-libre-Sources-video-share/812503e2-427e-4330-9671-259b59381572/scratchpad/r5b/ (session scratchpad, not kept): strip-before-/strip-after-* (390), back-before-strip-390.png, back-after-strip-390.png, ios-strip-before.png, ios-strip-after-20.png, ios-strip-long-to-short.png, ios-on-photo.png, ios-back-after-strip.png, map-first-1280.png, map-after-switches-1280.png, map-pin-removed-by-refresh.png, map-slow-tiles-8000.png, map-slow-tiles-20000.png.

  As specified:
  - Strip at 390, long to long (24 with 36 photos, then 20 with 18, then 24 again), list read delayed 2.5 s: during the wait scrollY stayed 500 and the document stayed 3237 px, the strip stayed (top 56), the pressed day was the focused element (`document.activeElement` data-date = the pressed day); when the list arrived the heading was at 139 and scrollY 485, document 1984 (then 3237 going back). Undelayed: scrollY 485 at every sample, strip present throughout. Same for 12 (31) to 11 (29) and back.
  - Back from a photo after a strip press (390): pressed 20 in the strip, scrolled to 545 (strip present, heading 139), opened a photo, Back: scrollY 545 at 0.3 s, 1.5 s and 5 s, the strip present, 20 pressed, heading 139.
  - iOS Simulator Safari: with the strip showing (scrollY 2080, heading 139) a touch on 20 gave scrollY 483, strip present, heading 139, document 2023 (0.3 s, 1.3 s and 4.3 s the same); 24 gave scrollY 483, document 3321, strip present; 20 again the same as before. Opened a photo from the list and pressed the toolbar Back: scrollY 483 at 0.5 s, 2 s and 6 s, strip present, 20 pressed, heading 139.
  - Switching Map to Calendar and back eight times at 1280 (zoom 12 over Tokyo, 2 pins; zoom 14, 9 pins): no pin element removed or added, no thumbnail request, no tile request; one `/points` read per return. A frame-by-frame read (requestAnimationFrame) of the first frames after the map is shown: all pins visible with their image loaded in the first frame it is shown, in every switch.
  - Pin removed by a refresh while switching (zoom 14, `/points` answered without the 68 points under the centre pin when returning): the pin is gone after the return (9 pins to 8), stays gone after a further quick switch.
  - Pins before tiles answer (tile responses delayed 8 s, then 20 s): the first pins were in the document at about 1.1 s (9 pins at zoom 14) and 1.4 s (49 pins at zoom 16), before any tile answered; switching Calendar and back while tiles were still outstanding kept all pins; all pins were still there after the tiles answered.

  Differences from the spec or the design:
  1. Back to the map with many pins (zoom 16 over Tokyo, 49 pins; reproduced in 5 of 5 runs, in about half of the returns): about 50 to 70 ms after the map is shown again, 12 pins (36 in a run with three such events) are removed and 12 new ones added in the same task, and 12 thumbnail requests are made. Frame by frame, 12 of the 49 pins were drawn without their image (37 of 49 with an image) for at least one frame. It did not happen at zoom 12 or 14 in 8 returns each, nor in the 11-pin world view. The pins are the ones a returning map re-reads once it has gone idle (the `resuming` path). The set of pins after the event equals the set before.
  2. When the points refresh removes one pin (zoom 14), every pin is rebuilt: the 9 new pins were added, the 10 old ones were removed about 290 ms later, so 18 pins were in the document at once for that time, and the other pins' thumbnails were requested again.
  3. 390, long list to a short one (24 with 36 photos to 22 with 2 photos), with and without a delayed read: while the read is out the page is held (scrollY 500, document 3237, strip present, the pressed day focused); when the 2-photo list arrives the document becomes 870 px and scrollY 26, the strip is gone and focus is back on the body (iOS Safari: document 868, scrollY 154, strip gone). The hold is released after the list settles. The first run recorded the clamp and the hidden strip for this case as allowed by the spec's clamp rule; the focus on the pressed day does not survive it.
  4. In Safari on the simulator a touch on a strip day leaves `document.activeElement` at the body in every case; the strip and scroll behave as in Chromium. (WebKit does not focus a button on touch; stated as seen.)

  Not run: strip in dark; Back inside the Litloft iOS app; a pinch; real GPU.
pending: iOS on a real device, and the Litloft iOS app's own Back; whether the flicker of difference 1 is visible to a person at device speed.

## R-5, third run

decision:
ran_in_app: yes
at: 26e5f2692c788bf084fc60309728114f99e6e969
by: agent
evidence: Narrow run over `map/createPhotoMap.ts` and `MapView.tsx`. Stack rebuilt from the core worktree (core 6f6c0b27f, addon at the commit above, clean tree): backend, frontend, knowledge, intelligence; default tile server, real tiles. The served chunk holds `pause(){y=!0,x=!1},resume(){y=!0,x=!0,r.resize(),_(),I()}`. Fixture on drive テスト画像: the same 197 generated JPEGs as the earlier runs in `test_images/r5c-fx/pics`. Removed afterwards: files deleted, drive scanned, the 197 rows purged through `/api/files/batch/purge`, scanned again (drive total back to 1352; the earlier missing row `r5-text-lines/archive.zip` untouched), stack down. Chromium (Playwright, software GL). Screenshots are in /private/tmp/claude-502/-Users-libre-Sources-video-share/812503e2-427e-4330-9671-259b59381572/scratchpad/r5c/ (session scratchpad, not kept).

  As specified:
  - Returning to the map, 78 pins (`/points` and thumbnails stubbed with a dense grid, 1280x800, one zoom-in, 1200 ms hidden), 8 returns at each of CPU rates 1, 2, 4 and 6: removed 0, added 0, thumbnail requests 0, 78 before and after, in 32 of 32. The same probe before this fix gave 24, 24, 24 in most returns.
  - Returning to the map, 49 pins (zoom 16 over Tokyo, the fixture, 1280x900, hidden 150, 600 or 1200 ms), 48 returns (rate 1: 30, rate 4: 9, rate 6: 9): removed 0, added 0, thumbnail requests 0, tile requests 0, one `/points` read per return, the same 49 pins; frame by frame, 49 of 49 pins have their image loaded in every frame after the map is shown. This closes difference 1 of the second run on this browser.
  - Browser Back from Calendar to the map: removed 0, added 0, thumbnail requests 0, the same elements kept.
  - Point removed by a refresh while switching (`/points` answered without the points under the centre pin): zoom 14 at once, 9 pins to 8; zoom 16 at once, 49 to 37; zoom 14 answered after 1 s, 9 to 8; answered while hidden again, 9 to 8. Each equals a fresh load at the same centre, zoom and points, by label and photo, and holds after a further switch.
  - Pan right after return: drag begun 0, 100 and 400 ms after pressing Map, at rate 1 and rate 6, and with tile answers delayed 1.5 s: 40 pins, equal to a fresh load at the same place, none outside the view plus margin. Zoom-in pressed right after return: 49, equal to a fresh load.
  - Fresh load with tile answers delayed 8 s: first pins at 0.94 s from `?view=map` and at 2.0 s from `?view=calendar` with Map pressed at 1.5 s, 49 pins, no tile answered yet; a switch while tiles were out kept 49, and 49 after they answered.
  - States that could hold removal for good, each followed by a drag and compared with a fresh load, all equal: Calendar pressed 0, 50, 200, 500 and 900 ms after the first press of Map; hidden again before idle with tile answers held and released while hidden; 12 fast switches; tiles answering 500 and aborted (notice up, then gone after unblocking and a pan); `/points` empty at return removing the map and points coming back; window grown to 1920 and shrunk to 800 while hidden.

  Differences from the spec or the design:
  1. Difference 2 of the second run is unchanged: a refresh that changes the data rebuilds every pin, both sets in the document until idle (zoom 14: 18 at once; zoom 16: 93 at once).

  Not run: iOS Safari in this run; a real GPU; a pinch.
pending: iOS on a real device, and the Litloft iOS app's own Back.
