# Code review r2: Photo Diary Target, fix range db4d0bc..0345d14

Reviewed: addon commit `0345d14` (commits `500f615` test, `0345d14` fix), range `db4d0bc..0345d14`,
against the core checkout at `/Users/libre/Sources/video_share-app-target` (develop). Threat model:
personal tool, owner only; bucket A = silently wrong in ordinary use; bucket B = odd input / misuse.

Baseline: `pnpm exec vitest run src/addons/photo_diary` at `0345d14`: 13 files, 566 tests, all pass.
`pnpm exec tsc --noEmit -p .` is clean. Each mutation below was applied to the working tree, run, and
reverted by copying back a saved copy; the files were compared byte for byte afterwards and
`git status` shows only this report.

## First-review findings

### F1. Map blank after a failed read under a new target: fixed

- `frontend/MapView.tsx:198-204`: when a read fails while `pointsRef.current === null`, the handle is
  destroyed and cleared before `"failed"`. On Retry or another choice, `handle.current` is null, so the
  success branch goes to `"creating"` and `createPhotoMap` gets the fresh host and `viewRef` (centre and
  zoom). Double destroy is not possible: the unmount cleanup (`:265-270`) checks the cleared ref, and an
  in-flight create is cancelled by the reset (`handle.current` null → `"loading"` → the creating effect's
  cleanup destroys the late map).
- Test `item 8 a map read that fails after a change draws the map again on retry, at the same centre and
  zoom` (Target.test.tsx:702). Mutation: removed the destroy/clear in the failure branch → this test fails.
- Two side effects of the destroy are reported below as N1 (a fitted view the viewer never moved is not
  in `viewRef`) and N2 (`tileFailing` is not reset).

### F2. Change token one render behind: fixed

- `frontend/useTarget.ts:93-98` sets `drawn` during render, so React re-runs `Session` before rendering
  children, and no child render sees new `params` with the old `changes`. The calendar is remounted
  once, the page count effect (`PhotoDiaryPage.tsx:89-105`, deps `target.changes` and `target.params`)
  runs once, and the old instance never gets the new target. `reportTotal` (`PhotoDiaryPage.tsx:69-76`)
  takes the token the request was made under (`CalendarView.tsx:130`, `targetKey` fixed per keyed
  instance) and drops answers whose token is not the one in force.
- I found no new race. `changesRef` is written during render. With no transitions in this page, a render
  that sets it is committed. The calendar's months effect now lists `targetKey`, which is constant for a
  keyed instance, so it adds no reads.
- The map is not covered by the in-render token. `MapView` is keyed on `epoch` only and clears pins, points
  and the open pin list in a passive effect (`MapView.tsx:125-141`). For a menu choice (a discrete event),
  React flushes that effect before paint. When the folder list lands after a retry (async), the commit
  that shows the new name can paint one frame with the old pins and the old pin list (I14). This was the
  same before the fix and scores about frequency 0-1, impact 1. It is not counted. The `useTarget.ts`
  comment ("no render pairs new params with the old key") holds for the keyed calendar, not for the map.
- Tests: `item 8 a change sends the months once …` (:677) and `I14 a months answer for the previous
  target cannot blank the new target's N` (:692). Mutations:
  - Restoring the old passive-effect bump in `useTarget.ts` makes the months-once test fail (2 reads).
  - Removing the `changes !== changesRef.current` guard makes the cannot-blank test fail, along with
    `'months': a late answer is dropped`.

### F3. URL month replaced on screen: fixed, with option (a)

- `CalendarView.tsx:115-118`: `month = url.month ?? monthList[0]?.month ?? null`. The URL's month is
  drawn even when the new target has nothing there. Only a URL with no month takes the newest. This is
  option (a), which is item 8 and I15 as written, so no spec amendment is needed. `decisions.md` records no
  human choice on F3, but (a) is the spec's own reading.
- Tests: `a fresh start in place …` and `a change on the calendar applies to the map …` now assert that
  `2026年10月` stays and that `9月2日` is absent. `I13 saves the choice … newest month` (:623, from no
  month) covers the other side. Mutation: restoring the `keptMonth` arm makes both rewritten tests fail.

### F4. Empty target draws a world map, next target not fitted: fixed

- `MapView.tsx:179`: every empty answer, `none` included, destroys the handle and shows `"empty"`.
  The next non-empty answer creates a map from `viewRef`, which is null if the map never had a view, so
  it fits.
- Tests: the I4 wire test now asserts `位置情報のある写真はありません` and no `createPhotoMap`. The new
  `I4 an empty target shows no-located state, and the next target with pins is fitted` (:718) asserts
  creation with `center === undefined` and Trip's pins. Mutation: restoring the `none !== true` arm makes
  both fail.

### F5. Forged React element in folder names: fixed (human decision recorded)

- `withReason` and `menuFolders` are removed. `folders: target.folders` goes to the core menu unchanged,
  and the reason is the core's disabled-row `title` from `unavailableLabel`, as in the Video and Reading
  apps (`frontend/src/components/appshell/TargetMenu.tsx:93`). This matches the human decision of
  2026-11-14 in `decisions.md`. The test change to read the `title` came in `db4d0bc`, before this range.
  The unused `LoadState`, `SmartFolder` and `empty` were removed with it, and tsc is clean.

### T1. No positive restore under a folder target: partly fixed

- Added: `a list position saved under the folder in force is restored under it` (:866) and `a pin list
  and its position saved under the folder in force are restored under it` (:879). Mutation: removing
  `!ready ||` from the `onRestored` effect (`CalendarView.tsx:214`) makes the first fail. The read side is
  guarded.
- Not guarded: the write side. Both new tests seed the state with `saveState(... target: TRIP.id)`, and
  no test saves through the page's `flush` under a folder and then reads it back. Mutation: in
  `PhotoDiaryPage.tsx:139`, `saveState(drive, { ...state, target: "default" })` (every save stamped
  `default`). The full addon suite passes, 566/566. Dropping the `target` key entirely is caught, but only
  by an unrelated SPEC-PD-001 shape assertion (`PhotoDiaryPage.test.tsx:1035`, `target: "default"`).
- Defect let through: under a folder target, Back from a photo opened deep in a day list, or from the
  map's pin list, never restores the position or the pin list. This is the second break r1 named.
- Frequency 5 (going back from a photo under a folder target), impact 3. Score 15. Bucket A (test gap).
- Fix: one row that goes through the page. Under `TRIP.id`, open a day, load past `PAGE_SIZE` or
  scroll, open a photo or fire `pagehide`, then assert `loadState("family").target === TRIP.id`. Better,
  remount and assert the restored scroll, which joins this to the existing read-side rows.

### T2. Wire expectation computed by the resolver: fixed

- `FULL_WIRE` is pinned literally (Target.test.tsx:144-152), and `libraryKey` recognises `full` only by
  the whole set (`sameWire`). Mutation: removing `out.collection` from `wireParams` makes the wire-contract
  test fail, along with nine others that route `full` reads.

### F6-F8 (r1, below the threshold)

- Not addressed in this range, and not asked for. They are not counted below.

## New findings

### N1. A destroyed map is re-created without a view the viewer never moved, so it re-fits instead of keeping centre and zoom

- **Claim.** `viewRef` is filled only by `onViewChange`, which `createPhotoMap` fires on `moveend`
  (`map/createPhotoMap.ts:567-571, 583`). The initial fit is done in the `Map` constructor, before the
  listener is attached, so a map that was fitted and never moved leaves `viewRef === null`. This is
  inferred from MapLibre's constructor order and not observed in a browser. The fix now destroys the
  handle in two more paths: an empty `none` answer (`MapView.tsx:179-183`) and a failed read after a
  change (`:198-204`). The next map is created with `center: undefined` and fits the new pins. Item 8 says
  the map keeps its centre and zoom across a change, and fits only "a map that had no view yet". Before
  the fix, both paths kept the handle and its view. The F1 test calls `onViewChange` by hand, so it does
  not see this.
- **Where.** `frontend/MapView.tsx:179-183`, `:198-204`, `:214-222` (create from `viewRef`).
- **Ordinary use.** The window is narrow: you open the map, which is fitted to the default target's
  pins, and before the change you do nothing to the map at all. That means no pan, no zoom, no pin (a pin
  list narrows the container), no switch to the calendar and back (`resume()` calls `map.resize()`), and
  no window resize. MapLibre's `resize()` fires `moveend` and so fills `viewRef`; I know this from the
  library, and MapLibre is not installed under `frontend/node_modules`, so I did not check it. You then
  choose a folder with no images (or the read fails), then a photo folder. The map re-fits to the new
  folder instead of staying where it was.
- **Frequency** 1 or less. **Impact** 3 (a different view than promised; nothing is lost). **Bucket** A. Score 3,
  below the threshold.
- **Fix.** Before destroying a handle, read its view into `viewRef` (expose `getView()` on `PhotoMap`,
  or have `createPhotoMap` call `onViewChange` once after the initial fit).

### N2. The failure branch destroys the map but leaves `tileFailing` set, so a working re-created map shows the tile error

- **Claim.** The empty branch resets `setTileFailing(false)` when it destroys the handle (`:182`). The new
  failure branch (`:198-204`) does not. A new map starts with `reportedFailing = false`
  (`createPhotoMap.ts:344`) and reports only changes (`:511-515`), so it never reports `false`. After a
  successful retry, the stage mounts with the stale `tileFailing === true`, and the "tile error" notice
  sits over a map whose tiles load. It stays until the tiles fail and recover, or until a reload.
- **Ordinary use.** A network blip on the map. Tiles fail (notice shown), a target change's `/points`
  read fails in the same blip, you press Retry once the network is back.
- **Frequency** 1. **Impact** 3 (a false error notice that misleads but blocks nothing). **Bucket** A.
  Score 3, below the threshold.
- **Fix.** Add `setTileFailing(false)` next to the destroy in the failure branch, as the empty branch does.

## Not verified

- N1 depends on MapLibre firing the constructor's fit before `map.on("moveend")` is attached, and on its
  ResizeObserver skipping the first callback. I inferred both from the library's behaviour, not from a
  browser. jsdom mocks `createPhotoMap`.
- I did not run the backend pytest, the e2e, or anything in a browser, and I started no Docker stack.
- In-render `setDrawn` relies on React re-running the component before rendering its children. I checked
  that the token, months-once and late-answer tests pass with it. I did not test it under concurrent
  rendering (transitions), which this page does not use.

TOTAL: 3 findings
