# Code review: UI polish, round 1

Commit: `5655ce277c2a9bca56f1bda92af0735870361e5d` (`feature/ui-polish`, addon repository), read from `git archive` of that SHA. Compared with `main...5655ce2`.

How it was run: the SHA was exported to the scratchpad and placed at `addons/photo_diary` beside an archive of the core's `frontend/` (core `6f6c0b27f`), with `node_modules` symlinked, the addon's `frontend/` copied to `src/addons/photo_diary`, and vitest's `cacheDir` moved out. Nothing wrote to either working tree. Baseline on that copy, with no probe present: Playwright 145 passed (all addon e2e, Chromium with software GL), vitest 488 passed in 11 files, `tsc --noEmit` no errors. The reproductions are extra Playwright specs against the real page or the real `createPhotoMap` and the real MapLibre 6.16.0. They are kept out of the repositories at `/private/tmp/claude-502/-Users-libre-Sources-video-share/812503e2-427e-4330-9671-259b59381572/scratchpad/cr/probes/`. The backend was read, not run. Mutation testing was not asked for and not done. No browser other than Chromium was run.

## Bucket A

### A1. Returning to the Map tab removes and re-creates most pins

- **Where:** `frontend/map/createPhotoMap.ts:595-598` (`resume` calls `syncPins`), reading `map.getCanvas().clientWidth` at `:453-454`, called from `frontend/MapView.tsx:229-231`.
- **Invariant:** spec item 1, "A pin is kept while its members' count and pin photo are the same", and item 3, "A drawn pin stays drawn while its pin photo is the same".
- **Condition:** switch to Calendar and back to Map. While hidden, MapLibre falls back to a 400 x 300 canvas (`style.width` read `400px`). `resume` runs in the passive effect, before the ResizeObserver has given the map its size back. `syncPins` therefore tests every pin against 400 x 300 plus the margin and removes those outside. The resize that follows adds them again as new elements with new images.
- **Frequency:** 8. Every return to the map with pins away from the centre.
- **Impact:** 2. The pins come back, on `--sand` until their images are ready. Each re-made pin also costs a request, since the core's thumbnail answer is `Cache-Control: no-cache` with an ETag (`backend/app/routers/files.py:1168-1175`, read, not run).
- **Shown by:** reproduced on the real page at 1280 x 800, 25 pins. The layer recorded `removed: 16, added: 16`, and thumbnail requests went from 25 to 41. Sampling each frame after the press: 9 pins at 4 ms, 25 pins with 16 images unloaded at 21 ms, none unloaded at 83 ms. The stand-in fulfils at once, so the real sand time will be longer. Not run on a real stack.
- **Test gap:** no test holds a pin's identity or its request count across a view switch. "panning keeps a pin" (`e2e/mapPolish.spec.ts:425`) and "selecting a pin" (`:366`) stay on screen, and `:87` checks the palette only.

### A2. Pressing a day in the strip sends the page to the top, and the strip goes until the list settles

- **Where:** `frontend/CalendarView.tsx:206-217` (`stripPick`, `listSettled`), with the new `PhotoList` key at `:369` putting up the short skeleton (`frontend/PhotoList.tsx:177-181`) and `useReachedHeader` at `frontend/usePinned.ts:63-65`.
- **Invariant:** the revised I6, "so the strip stays after pressing a day in it". Spec item 1's order of events ("When the new list has settled ... the page scrolls") leaves the time before settling unstated, so the invariant's wording and the implementation can each be defended. Which one is meant is a question for the human; see the design note below.
- **Condition:** narrow layout, deep in a day's list, press another day in the strip. The old list is replaced by a skeleton, the document collapses, and the browser clamps `scrollY`. At 390 x 844 it goes to 0. The whole month grid shows with no strip under the finger until the new list and note settle. Then the page jumps to the heading and the strip comes back as a new element, so a focused day button is lost.
- **Frequency:** 5. Each strip press on a phone. The strip exists to be pressed, and the visible time is the list's load time plus the note's.
- **Impact:** 3. The final position is right, and the press looks like a page jump. Keyboard or screen-reader focus falls to `BODY` and stays there.
- **Shown by:** reproduced in Chromium, sampling each frame as `[ms, strip shown, scrollY]`.
  - List answering in 1000 ms: `[52,false,0] [1031,false,463] [1038,true,463]`.
  - In 80 ms: `[4,true,0] [14,false,0] [97,false,463] [108,true,463]`.
  - Immediately: `[6,true,0] [122,false,463] [508,true,463]`, on software GL, where frames are slow.
  - `document.activeElement` was `BODY` after settling in all of them.
  - Not run in iOS Safari.
- **Test gap:** "the strip stays after a press in it" (`e2e/calendarPolish.spec.ts:575`) begins polling after the first tile is visible, which is after the jump, and its route answers at once. No test holds a list answer back during a strip press, or checks focus after it.
- **Design note:** this is the thing most worth a human decision. The revised I6 was written so the strip stays. Keeping it through a load needs the document not to collapse, which interacts with `photo-diary.md` I6 and `daily-notes.md` I10.

### A3. The map's stage keeps the old height after a resize that crosses the 48 rem line

- **Where:** `frontend/MapView.tsx:269-279`. `measureStage` runs on window `resize`, but the tabs move later, when `useWide`'s ResizeObserver re-renders `Frame` (`frontend/PhotoDiaryPage.tsx:42,55-56`). Nothing measures after that, since `wide` from the frame is not an input.
- **Invariant:** SPEC-PD-012, "The map's stage fills the column down to the bottom of the viewport ... read again when a banner comes or goes, on resize", and "the document does not scroll above the `24rem` floor".
- **Condition:** one resize across the line while the map is on screen: rotating a tablet, or a phone whose landscape width reaches 48 rem. A slow window drag corrects itself on the next `resize` event. A sidebar toggle changing the frame's width across the line has no window `resize` at all (from reading, not run).
- **Frequency:** 3.
- **Impact:** 3. Wide to narrow, the stage runs past the viewport and the document scrolls, so the bottom of the narrow sheet is below the fold. Narrow to wide, an empty band sits under the map. Any later resize or view switch corrects it.
- **Shown by:** reproduced on the real page, 800 high, with one `setViewportSize`. Wide to narrow (1280 to 600): stage top 134, bottom 842, style `calc(-92px + 100dvh)`, document 842. Back to wide: stage top 92, bottom 758, style `calc(-134px + 100dvh)`.
- **Test gap:** "follows a resize" (`e2e/pagePolish.spec.ts:93`) changes the height only. "changes place when the layout crosses 48 rem" (`:53`) is on the calendar and does not read the stage.

### A4. A refresh that shifts the ranks re-draws pins from the old tiles with the wrong photos

- **Where:** `frontend/map/createPhotoMap.ts:539-543` (`onSourceData` clears `dataPending`) with `:584` (`ranking` replaced at once) and `:343` (rank read through the new `idAt`).
- **Invariant:** I9, "a pin's photo is one of those photos", for the time it lasts, and spec item 1, "A pin is kept while ...". The code's own contract at `:326-328` states the intent: until the tiles are back "a pin is neither added nor removed on that evidence".
- **Condition:** the map's data changes so that ranks move: a newly scanned or uploaded newest photo shifts every rank, and trashing a photo from a point's list shifts every older one. MapLibre fires a `sourcedata` with `isSourceLoaded: true` when the worker has the new data and before the tiles reload. `dataPending` clears there, and `syncPins` reads the old tiles' ranks through the new ranking. Each pin takes a neighbour's photo, and when the tiles arrive they are re-made again.
- **Frequency:** 3 for the re-creation. 0 for pressing a wrong pin: the window was 2 to 8 ms, and a one-photo pin's `membersOf` (`:374`) would trust the wrong id.
- **Impact:** 2. Pins blink through `--sand`, and thumbnails are requested for pins that do not need them. No wrong state lasts.
- **Shown by:** reproduced with the real MapLibre by removing the newest photo.
  - 8 separate points, 4 in view: two mutations 2 ms apart, one pin in and out each. Requests were for `a1` (a wrong pin) and `a5` (the right pin re-made), and neither should have been asked for, since the removed photo was out of view.
  - 20,000 points, 44 pins: 40 removed and added at 156 ms, 40 more at 164 ms, 75 extra thumbnail requests.
- **Test gap:** "pressing a pin lists exactly its photos ... after the data changed" (`e2e/mapPolish.spec.ts:239`) checks the list only. Nothing watches the layer through a refresh whose ranks shift.

### A5. Pins are not drawn on the world copy the view has crossed to

- **Where:** `frontend/map/createPhotoMap.ts:366-369` and `:459-460`. `map.project` takes the feature's unwrapped longitude. MapLibre's own `Marker` wraps to the nearest copy, and these elements do not.
- **Invariant:** none is stated. The nearest is `photo-diary.md` I9 (a photo with a capture place is on the map), and spec item 7 lists "A point is no longer a dark circle or dot" as the only change. The circle layers this replaced are drawn on every world copy (from reading, `main` not run). Neither spec's `## Checked, no action` mentions the case.
- **Condition:** at a low zoom, pan so that the centre passes 180 degrees. The centre wraps and every point on the far side leaves the view, though the base map still shows that land. With photos in Japan and Hawaii, no view of the Pacific shows both. On a screen wide enough to show two copies at zoom 1 or 2, pins appear on one.
- **Frequency:** 1.
- **Impact:** 5. The area looks as if it holds no photos, with no sign of a failure. Panning back restores them.
- **Shown by:** reproduced with a point at 139.76 E, zoom 3, 1000 px wide. Centre 179.31: the pin's left edge at x = 28. After a 30 px drag to centre -178.05: no pin in the document, where its left edge would be about x = -2, still on screen. Screenshots are beside the probes in the scratchpad.
- **Test gap:** none covers a wrapped view.

### A6. A failed pin made again by a pan is not asked for again when the data refreshes

- **Where:** `frontend/map/createPhotoMap.ts:586`. The refresh retries only pins with `display: none`. A pin re-created while its photo is in `failedPhotos` returns early at `:361`, so it has no `src` and `display` is empty.
- **Invariant:** spec item 3, "Failed goes back to loading when the map's data refreshes", and the item 2 row "not requested again until the map's data refreshes".
- **Condition:** a thumbnail fails, as when the core restarts. The viewer pans or zooms so that the pin leaves and returns. A refresh then leaves it on `--sand`, until it leaves the view and is made again.
- **Frequency:** 1.
- **Impact:** 2. A sand pin that can still be pressed.
- **Shown by:** reproduced. After the pan, away and back, with the route now healthy and `setPoints` called: thumbnail requests stayed at 1 and the image read `{src: null, display: "", natural: 0}`.
- **Test gap:** the test at `e2e/mapPolish.spec.ts:476` re-adds the pin through a data change, so `addPin` runs after `failedPhotos` is cleared. The kept, already re-created pin is not covered.

## Bucket B

### B1. A strip press whose list never settles under that date leaves its scroll armed

- **Where:** `frontend/CalendarView.tsx:208,213`. `scrollOnSettle` is cleared only when it matches a settling list.
- **Condition:** press a strip day, then Back or another day before the list settles. Pressing that day later from the grid scrolls the page to its heading.
- **Frequency:** 0. It needs a press inside the load.
- **Impact:** 2.
- **Shown by:** reproduced with the answer held 1500 ms: `scrollY` 0 before the grid press, 463 after.

### B2. A strip press settling after the view was hidden reads a hidden list

- **Where:** `frontend/CalendarView.tsx:212-217`. The list's rect is all zero while hidden, so `top` is `scrollY - 137`, the map's page scrolls, and the request is consumed.
- **Frequency:** 0.
- **Impact:** 1.
- **Shown by:** read, not run.

### B3. A drag that ends off the pin leaves `pressedAt` set, and the next keyboard press is dropped

- **Where:** `frontend/map/createPhotoMap.ts:371,428-436`. A keyboard click reports (0, 0), which is further than `PRESS_SLOP` from the stale press.
- **Frequency:** 0.
- **Impact:** 1. A second Enter works.
- **Shown by:** read, not run.

### B4. The tile notice's re-check re-makes the whole source, so drawn tiles leave the base too

- **Where:** `frontend/map/createPhotoMap.ts:509-515`.
- **Condition:** one tile failed and the notice is up. The next idle drops every tile, and they are requested again. If the server is down by then, a base that was drawn in part becomes land colour.
- **Frequency:** 1.
- **Impact:** 1. The spec allows land colour under the pins.
- **Shown by:** read, not run. `decisions.md` records why `setTiles` was not used.

### B5. A failed re-read of the month's days keeps the held preview ids

- **Where:** `frontend/useDayPreview.ts:96-98`, keyed on `days`, which a failed read does not replace. Spec item 4: "Every re-read of the month's days ... drops them".
- **Condition:** a photo is trashed elsewhere and the re-read fails. The preview shows it until the next good read.
- **Frequency:** 0.
- **Impact:** 1.
- **Shown by:** read, not run.

## Touch points

The diff reaches these, which `## Touch points` does not list:

| Place | What it does | New invariant needed? |
|---|---|---|
| `frontend/DayCell.tsx` (new) | The cell, step surfaces and inner ring, shared by grid and strip | No. I1 and I6 cover it, and the spec's "same step, border, label and action" is checked by acceptance tests |
| `frontend/lib/steps.ts` (new) | `stepOf` | No. I1 |
| `frontend/usePinned.ts` (new) | Held-column measure and the strip's reach | No. I5 and the revised I6 |
| `frontend/PhotoList.tsx`: `onSettled`, exported `CloseControl` (the spec lists only the close control and offset) | The settle signal that drives the strip's scroll | Only if the human decides A2. The spec lists that scroll as promised without an invariant line, and A2 and B1 are defects in that gap |
| `frontend/PhotoDiaryPage.tsx`: `freshStart`, set again on an epoch (the spec lists only the wrapper and tabs) | The fade's fresh start | No. I3 covers it, and item 1 states the restart |
| `frontend/CalendarView.tsx`: `useDayPreview`, `monthBar`, `gridArea` (the spec lists the column and strip) | Preview wiring and the back control | No. I2 |
| Tests: `frontend/UiPolish.test.tsx`, `frontend/UiPolishStates.test.tsx`, `frontend/map/mapStyle.test.ts`, `e2e/calendarPolish`, `mapPolish`, `pagePolish`, `dailyNotes`, `noWebgl`, `workerRetry` | Tests | No |

Listed but not changed: `frontend/DailyNotes.test.tsx`, `e2e/attribution.spec.ts`.

One addition is worth considering, and it is not a new surface: A1 and A4 both break "a pin is kept", which `## Checked, no action` lists as promised without an invariant line. The promise is broken across a view switch and a refresh, and neither is tested. Giving it an invariant line that names those two moments would pin the cases that failed.

## Examined, no finding

- A glyph range that fails or answers 404, such as a character at or above U+3000 that MapLibre does not treat as ideographic: the library's `_downloadAndCacheRangePromise` draws the character locally and warns, as the spec's failure table says (read in the bundled library, not run).
- Programmatic focus on a pin that overhangs the map's edge: the layer did not scroll (`scrollLeft` 0).
- The month picker's scrim inside the held column's stacking context: `elementFromPoint` finds the close control and the tiles above the scrim, but a press still only dismisses, through the scrim's document-level press handling. URL unchanged and picker closed.
- Wide layout, a day pressed in the held column at `scrollY` 1800: the collapse takes the page to 0 and the new list starts from its first tile.
- Wide layout, Map and back: the strip is never mounted (0 observed).
- Palettes, layer table, widths and pin sizes against the spec's tables: they match (read).

TOTAL: 11 findings
