# Code review: UI polish fixes, round 2

Commit: `8edba9580053efc57559c076693a29bbe3b7e186` (`feature/ui-polish`, addon repository), range `5593662..8edba95`, read from `git archive` of that SHA.

How it was run: the SHA was placed at `addons/photo_diary` beside a copy of the core's `frontend/` at `scratchpad/r2/root`, with `node_modules` symlinked. Nothing wrote to either working tree. Baseline on that copy: Playwright 154 passed (all addon e2e), vitest 488 passed, `tsc --noEmit` no errors, eslint 0 errors. Probes are real-page Playwright specs with the real MapLibre 6.16.0, kept at `/private/tmp/claude-502/-Users-libre-Sources-video-share/812503e2-427e-4330-9671-259b59381572/scratchpad/r2/probes/`.

Not run: iOS, a real Next router (the fixture's router updates the URL synchronously), a real tile server. Chromium with software GL only.

## Bucket A

### A1. Returning to the map still removes and re-creates pins, because the tiles were dropped while hidden

- **Where:** `frontend/map/createPhotoMap.ts:598` (`map.resize()`), which fires `moveend` and so runs `syncPins` at once. `syncPins` reads `querySourceFeatures` at `:457`.
- **Invariant:** spec item 1, "A pin is kept while its members' count and pin photo are the same", and item 3, "A drawn pin stays drawn". This is code-r1 A1, reduced by the fix and not closed.
- **Condition:** switch to Calendar and back to Map, with pins outside the tiles a 400 x 300 view covers. The canvas size is now right, but while hidden the source's tiles shrank to the 400 x 300 coverage. The first sync on return tests pins against the full size and reads only the small coverage's features, so it removes the pins outside it. A sync a few milliseconds later adds them again as new elements.
- **Frequency:** 8. Every return on a desktop-sized map whose pins span more than the central tiles.
- **Impact:** 2. Pins come back on `--sand` until their images are ready, and each costs a thumbnail request.
- **Shown by:** reproduced on the real page with 2,400 points over a grid, 800 ms hidden.
  - 1280 x 800, one zoom-in, 78 pins: distinct feature positions read 150 before hiding, 90 while hidden, 150 after. Removed 24, added 24, 24 extra thumbnail requests.
  - Same scene with `map.resize()` removed: 58, 58, 58. So the fix helps, by about 60% here.
  - Instrumented `syncPins`: the sync inside `resize` saw width 1152, height 708 and 78 pins, and the sync in `resume` 1 ms later saw 54.
  - 1920 x 1080: removed 60 of 150, 12 of 216, 27 of 48 and 10 of 16 at successive zooms. 1280 x 800 at other zooms: 0 of 40, 0 of 72, 0 of 72, 6 of 24. 390 x 800: 0 at all five zooms.
- **Test gap:** `e2e/pagePolish.spec.ts:307` passes because its 25 pins, at the zoom they are fitted to, sit inside what the small coverage holds (removed 0 in the same probe). It would catch the case above with denser points or one zoom-in.

### A2. While a pressed day loads, the view below the strip is empty

- **Where:** `frontend/CalendarView.tsx:216`, with the short list at the top of the held area (`frontend/PhotoList.tsx:177-181`).
- **Invariant:** none is stated. The revised I6 asks for the strip to stay, and spec item 1 does not say what shows before settling. This is the other side of code-r1's A2 design question, so it may be for the human.
- **Condition:** narrow layout, deep in a day's list, press another day in the strip. The scroll position is held, so the new heading, the note and the loading placeholder are all above the viewport until the list and the note settle. The screen is the strip, its pressed day and white space, with nothing that says loading.
- **Frequency:** 5. Each strip press from a position below the new list's top. The visible time is the list's load time plus the note's.
- **Impact:** 2. The final position is right and the pressed day shows the accent border.
- **Shown by:** reproduced with the list answering in 600 ms at `scrollY` 1500: heading top -686, `aria-busy` placeholder top -804, neither in view. Screenshot at `scratchpad/r2/held.png`.

### A3. No test fails if the held height is never released (test gap)

- **Where:** `frontend/CalendarView.tsx:231`; the test is `e2e/calendarPolish.spec.ts:706`.
- **Invariant:** I4, "The strip's appearance and the held column add no document height", and spec item 1, "the browser's clamp decides the end position".
- **Missed defect:** removing `releaseHeight()` from `listSettled` leaves every strip press with the old list's height, so a short day has thousands of pixels of blank page below it, and the clamp the spec describes no longer happens.
- **Frequency:** 5, for the missed defect.
- **Impact:** 5. Plainly visible, and it stays until the page is left.
- **Shown by:** the mutation below survives all 84 polish e2e tests and 51 vitest tests. The shipped code does release: see "Examined".

## Mutations

Each one applied alone to the scratch copy, with `calendarPolish`, `pagePolish`, `mapPolish` and the `UiPolish` vitest files run, then restored. The restored files were compared with the SHA's.

| Mutation | Result |
|---|---|
| `resume` without `map.resize()` | Killed by `pagePolish.spec.ts:307` |
| `syncPins` guard back to `!loaded` | Killed by `mapPolish.spec.ts:534` |
| `syncPins` without the `getSource` guard | Survived. Equivalent as far as read: `dataPending` starts true and clears only on `idle` or a `points` `sourcedata`, so the guard is not reached with no source |
| No `minHeight` set in `stripPick` | Killed by `calendarPolish.spec.ts:706` |
| No release in `listSettled` | **Survived**, see A3 |
| No release in the `url.date` effect | **Survived**, see B3 |
| No `content-start` | Killed by `calendarPolish.spec.ts:706` |
| The `url.date` effect leaves the scroll armed (code-r1 B1 back) | **Survived**, see B3 |
| Release before reading the list's position | Survived. Equivalent: the read forces layout and the sum with `scrollY` comes out the same |

## Bucket B

### B1. A note read that never answers keeps the height and the empty view

- **Where:** `frontend/CalendarView.tsx:226-232`, through `noteSettled` in `frontend/PhotoList.tsx:134`.
- **Condition:** the note request hangs. The height stays held and nothing scrolls, so the page sits as in A2 until Back or another press.
- **Frequency:** 0.
- **Impact:** 3.
- **Shown by:** reproduced with a route that never answers: `minHeight` still `3859px` after 2.5 s. A hung list read takes the same path (read, not run).

### B2. The back control pressed during the load is overridden when the list settles

- **Where:** `frontend/CalendarView.tsx:233-241` does not clear `scrollOnSettle`.
- **Condition:** press a day in the strip, then the back control before the list settles.
- **Frequency:** 0.
- **Impact:** 2.
- **Shown by:** reproduced: `scrollY` 134 after the back control, 463 after settling.

### B3. The abandoned-press path has no test (test gap)

- **Where:** `frontend/CalendarView.tsx:219-224`.
- **Missed defect:** removing the release, or the disarm, passes everything. Without the release, the height stays until the next settled press. Without the disarm, code-r1 B1 returns.
- **Frequency:** 0. It needs a press inside the load.
- **Impact:** 3.
- **Shown by:** both mutations survive. The shipped code behaves: see "Examined".

## Examined, no finding

- **Height released in every state tried** (narrow, list held back, `minHeight` read afterwards as empty): list 500, list empty, note 500, slow note (held until the note settles, then released), Back during the load, a second strip press, the close control, Map tab during the load, crossing to wide during the load. Undated cannot be pending: `stripPick` runs only from the strip, and moving to undated leaves `url.date` null, which takes the same effect. A drive change remounts `Session` (`PhotoDiaryPage.tsx:27`).
- **`content-start`:** at 1280 x 800 the children's rectangles are identical with and without it, because the grid's parent is a block with auto height and no free space exists unless `min-height` is set.
- **A pressed short day:** a 2-photo day ends at `scrollY` 80 with the strip gone and focus on `BODY`; a failed or empty list does the same. The spec's clamp rule allows the strip's going, and the hold does not change the end state. Focus survives only when the strip does.
- **Crossing to wide during the load:** ends at `scrollY` 11, the strip's offset applied to a page with no strip. Needs a rotation inside the load. Frequency 0, and not new.
- **Pins before the style or tiles are ready:** with tile answers gated, 16 pins stayed 16 through a pan, a hide and return, and the release. Their transforms followed the drag. A pressed pin opened its list. A theme change while gated was applied at `load` (`#231216`), and `applyTheme` keeps its `loaded` guard, so `setPaintProperty` cannot run early. Hiding straight after creation gave 16 pins inside the canvas on return, no page errors. `querySourceFeatures` is not reached before `dataPending` clears. The 50,000-point test still passes.
- **`resize()` and the saved view:** MapLibre's `resize` fires `moveend` when not moving, so `onViewChange` runs on return. The value is the same: after a settled pan the saved center and a pin's transform were identical before hiding, while hidden and after returning, and also at zoom 0.95 on 1920 x 1080. With no pan, the state is first saved on hiding, with or without the new call, so writing a fitted view is not new. A restored map is made on screen, with `handle` still null, so `resume` does not touch it.
- **Scroll restore:** after a strip press and settling, Back from a photo returned to the same `scrollY` (1363 of 1363, 2832 of 2832 with a note that loads later) with the strip present and no height held. All of `page.spec` and `dailyNotes.spec` pass.
- **code-r1 A2 on a long day:** strip, scroll and focus hold per frame, as the new test checks. code-r1 B1 no longer reproduces.

TOTAL: 6 findings
