# Code review, round 1: Photo Diary addon

Commit: `61acfcaaebb869287e3a4e062e496922123e4f94`, read through `git archive` into a scratch copy. Nothing in the addon or core repositories was edited.

Line numbers are at that SHA, relative to the addon's root.

## What was run

- Addon vitest in the core checkout: 218 passed.
- Backend suite in `Dockerfile.test` built at this SHA: 129 passed, 100% coverage.
- Repro tests in a scratch copy of the page harness (`PhotoDiaryPage.test.tsx`'s mocks, with the real `savedState`, `usePagedPhotos`, `CalendarView` and `MapView`).
- Repro specs in Chromium through the addon's Playwright fixtures, with software GL, real MapLibre 6.16.0 and stubbed tiles.
- 27 hand-picked frontend mutations against vitest (jsdom only, not e2e), and one SQL mutation against pytest.
- Not run: a full Next.js stack, iOS, a real tile server. A3 assumes the App Router keeps the page mounted across query-only changes, which the view switch already relies on.

## Bucket A: wrong in ordinary use, or breaks a stated rule

### A1. The accent point stays after the list closes, and is absent on a restored list

- **File:** `frontend/MapView.tsx:240-243`, `frontend/map/createPhotoMap.ts:87-90`, `:297-310`
- **What happens:** `PhotoMap` exposes only `setPoints` and `destroy`, so `MapView` cannot clear or set the selection. Closing a list leaves the point accent with nothing open. Back or a reload with the list open draws no accent point at all. A list that closes because it became empty also leaves its accent point.
- **Condition:** click a point, press Close. Or open a photo from a point's list and press Back.
- **Frequency:** 8. **Impact:** 3.
- **Rule:** `docs/reviews/photo-diary/decisions.md`, Design Artifact: "Only the selected point is `--accent`."
- **Reproduced:** Chromium, real page fixture, accent pixels on the canvas: 1021 with the list open, 1021 after Close (0 tiles shown), 0 after Back with 40 tiles shown.

### A2. Zooming in leaves an accent point where no point exists

- **File:** `frontend/map/createPhotoMap.ts:369-372`, with the `selection` source at `:192` and layers at `:215-231`
- **What happens:** the selection is a separate source frozen at the clicked feature's coordinates. `onIdle` moves it only when a point lies within 4 px of those coordinates. When a selected cluster splits, nothing is there, so the accent circle stays at the old centroid. It is not in `POINT_LAYERS`, so a click on it does nothing.
- **Condition:** open a cluster's list, zoom in until it splits. The list is expected to stay open while zooming, so this is the normal way to look closer.
- **Frequency:** 5. **Impact:** 4.
- **Rule:** Design Artifact (a map point is plum; only the selected point is accent); SPEC-PD-002 definition of Point.
- **Reproduced:** Chromium, three photos clicked at zoom 11, then double-clicks to zoom 15. Screenshot shows three plum singles around a fourth accent circle at their centroid (540 accent pixels), and a click on it produced no `onPointClick`.

### A3. A URL with no query is not a fresh start while the page stays mounted

- **File:** `frontend/PhotoDiaryPage.tsx:89-99`
- **What happens:** the clear runs only in the `useState` initialiser, so only on mount. The page stays mounted across query-only changes (the view switch depends on this). On the sidebar row or on Back to the no-query URL, session storage keeps the state and `saved.current` writes it back. The map keeps its position and open list. The not-available page also survives the row, though the spec says it lasts "until the page is opened again".
- **Condition:** on `?view=map` with a list open, press the sidebar row **Photo Diary**, then the Map tab. Or press Back to the no-query entry.
- **Frequency:** 3. **Impact:** 4.
- **Rule:** spec, Both views: "A URL with no query always means a fresh start, however it was reached (the sidebar row, Back to it, a reload of it): the saved state for the drive is cleared."
- **Reproduced:** vitest with the suite's router stand-in. `loadState("family")` was `{center, zoom, pointIds}` instead of `null`, and the Map tab showed `["a0","a1"]` instead of no list. The existing test (`PhotoDiaryPage.test.tsx:939`) covers mount only.

### A4. When the state to save is empty, the old saved state is left in storage

- **File:** `frontend/PhotoDiaryPage.tsx:118`; the saved `list` is not tied to a list at `:149-154`
- **What happens:** `if (Object.keys(state).length > 0) saveState(...)` skips the write, so the previous value survives. Two visible results:
  - A closed point's list comes back. `setPointIds(null)` leaves `pointIds` in storage, so a reload or a later Back reopens it. This needs no saved centre: a phone, where the sheet does not resize the map, with no pan since the fit.
  - Another day's list takes the old position. `state.list` names no day, so a shallow list at scroll 0 leaves the previous day's `{loaded, scrollY}`. Back to the new day loads to that depth and scrolls there.
- **Condition:** day A scrolled, photo, Back, top of page, press large day B, open a photo from its first screen, Back. Or on a phone: tap a point, Close, reload.
- **Frequency:** 3. **Impact:** 3.
- **Rule:** I6; spec, Both views ("restores ... scrolled to where it was").
- **Reproduced:** vitest. After Close, `loadState` still held `pointIds: ["a0","a1"]`. On remounting day 10-03 after a saved position of day 10-20, `scrollTo(640)` was called.

### A5. A point's count label is stale when `/points` keeps the same length

- **File:** `frontend/map/createPhotoMap.ts:352`
- **What happens:** `if (labels.has(id)) continue;` trusts the cluster id. A cluster id is derived from position in the index, zoom and total point count, so with an unchanged total it can name a different cluster. The label keeps its old text and position. The list itself is correct when clicked.
- **Condition:** between two entries to the map, one located photo is removed and another added, or photos change between places, leaving the total equal.
- **Frequency:** 1. **Impact:** 5.
- **Rule:** spec SPEC-PD-002 step 2 ("A point standing for more than one photo shows its count").
- **Reproduced:** Chromium. 5+2 points, then `setPoints` with 3+4: labels `["5"]` before and `["5"]` after, on the cluster that now stands for 3.

### A6. The scope line's photo count goes stale after a write on the map view

- **File:** `frontend/PhotoDiaryPage.tsx:72-86`
- **What happens:** the effect depends on `[drive, onMap]`, so `onRefresh` from a point's list does not reread the months. After trashing a photo there, the header count stays one too high until the view is left and re-entered. The calendar view updates it on refresh.
- **Condition:** trash or move a photo from a point's list.
- **Frequency:** 3. **Impact:** 2.
- **Rule:** spec, Both views ("`onRefresh` refetches the current view's counts or points"); Design Artifact scope line.
- **Reproduced:** vitest. `fetchMonths` call count stayed 1 after the refresh.

### A7. The tile notice is cleared by any idle, while tiles are still failing

- **File:** `frontend/map/createPhotoMap.ts:373-377`, `:380-382`
- **What happens:** `tileFailed` means "an error event arrived since the last idle", not "a tile in view is failed". An errored tile is not asked for again on every redraw, so an idle with no new error turns the notice off while the map is still blank. Clicking a point causes such an idle through the selection's `setData`.
- **Condition:** tile server down, then click a point.
- **Frequency:** 1. **Impact:** 3.
- **Rule:** spec, Failure cases: "The next idle with no failed tile clears it."
- **Reproduced:** Chromium, every tile 503, one click: reports `[true,false,true]`. The notice went off and came back when two more tile requests failed. One run; the return is not guaranteed by the code.

### A8. The month picker breaks the dropdown rules on a phone

- **File:** `frontend/MonthPicker.tsx:52`, `:62`
- **What happens:**
  - Rows are `px-3 py-2 text-sm`, about 36 px tall, with no `pointer-coarse:min-h-11`.
  - The list is anchored below `sm`, under the dimming scrim `DismissScrim` applies there.
  - The menu radius is `rounded-xl`.
  - Rows have no `focus-visible` ring.
- **Condition:** opening the picker on a phone.
- **Frequency:** 5. **Impact:** 2.
- **Rule:** `DESIGN.md` line 537 (every button reaches 44 px on a coarse pointer); Context Menus / Dropdowns ("Radius `rounded-2xl`", "Below `sm`, a toolbar menu is a bottom sheet").
- **Reproduced:** reasoned from the classes; not measured. Whether this picker counts as a "toolbar menu" is a judgement for a person. If it does, this is a design question and not a class change.

## Bucket B: odd input, narrow timing or no user effect

### B1. A map created while its view is hidden fits at the wrong zoom

- **File:** `frontend/MapView.tsx:166-171`
- **What happens:** if the viewer leaves the Map tab while `/points` or the library is loading, the map is built in a `display:none` host and fits against a size of 0. All points stay in view, but the map is more zoomed out than it should be.
- **Condition:** switch tabs during the first load.
- **Frequency:** 1. **Impact:** 2.
- **Reproduced:** Chromium, Tokyo and Osaka on a 1280x600 map: zoom 5.65 after showing the host. A visible fit should be about 8.6 (computed, not measured).

### B2. A late months answer can take the viewer off the map

- **File:** `frontend/CalendarView.tsx:129-131`, `:157`
- **What happens:** both calls use `go("replace", { month })`, which drops `view=map`. The hidden calendar's effect can fire when a months answer arrives after the switch. Spec section 3 lists "a list refetch changing the view" as not allowed.
- **Condition:** `?undated=true` with 0 undated photos, and the Map tab pressed before the months answer.
- **Frequency:** 1. **Impact:** 3.
- **Reproduced:** vitest. `window.location.search` lost `view=map` when the deferred answer resolved.

### B3. Retrying a failed member read reuses the old feature

- **File:** `frontend/map/createPhotoMap.ts:331-333`
- **What happens:** the retry closes over the clicked feature. If the read failed because a `setData` replaced the clusters, its `cluster_id` is gone and every retry fails until the list is closed and the point is clicked again.
- **Frequency:** 1. **Impact:** 3.
- **Reproduced:** reasoned only.

### B4. Choosing the current month in the picker closes the open list

- **File:** `frontend/CalendarView.tsx:189`
- **What happens:** the spec closes a list on "moving to another month". Choosing the month already shown is not moving, but `go("replace", { month: chosen })` drops `date` and `undated`.
- **Frequency:** 1. **Impact:** 1.
- **Reproduced:** reasoned only.

### B5. `date` and `undated` together on a drive with no dated photos open nothing

- **File:** `frontend/lib/pageUrl.ts:36`
- **What happens:** `parsePageUrl` drops `undated` when `date` is real, before the page knows the drive has no dated photos. The Page URL table says "`undated` still opens its list" on such a drive.
- **Frequency:** 0. **Impact:** 2.
- **Reproduced:** reasoned only.

### B6. A refresh failure's banner outlives the list it belonged to

- **File:** `frontend/CalendarView.tsx:145-147`, `frontend/MapView.tsx:244`
- **What happens:** `report("list", ...)` and `setRefreshFailed` change only on a refresh result, or, on the calendar, when no list is open. After a failed refresh, opening another day loads it in `initial` mode, which reports nothing, so the banner stays above a good list until Retry.
- **Frequency:** 1. **Impact:** 2.
- **Reproduced:** reasoned only.

### B7. Retry after a failed restore loses the depth

- **File:** `frontend/usePagedPhotos.ts:181-183`
- **What happens:** `retry` asks for `max(loaded, 40)`, not `restore.current`. A restored list whose first load failed comes back at 40, and the pending scroll clamps to that shorter list.
- **Frequency:** 1. **Impact:** 2.
- **Reproduced:** reasoned only.

### B8. The accent colour is read once per map

- **File:** `frontend/map/createPhotoMap.ts:166-169`, `:172`
- **What happens:** changing light or dark mode while a map exists keeps the old accent, because `--accent` differs between the modes (`globals.css:36`, `:74`).
- **Frequency:** 1. **Impact:** 1.
- **Reproduced:** reasoned only.

### B9. The touch-point list omits what the code reaches

- **File:** spec `## Touch points`
- **What happens:** the core modules imported but not named are `PageHeader`, `PageTabs`, `Button`, `DismissScrim`, `@/types` and `app.database.get_db`. The list also omits `scripts/check-coverage-population.py`, which CI runs. A core refactor of any of these breaks the addon the same way the listed ones would; the weekly CI catches it.
- **Frequency:** 0. **Impact:** 2.
- **Reproduced:** read from the imports.

### B10. New large components are not split into Container and Presenter

- **File:** `frontend/CalendarView.tsx`, `frontend/MapView.tsx`
- **What happens:** both hold data fetching and substantial markup in one component. `.claude/rules/frontend-conventions.md` asks for the split on new components with both, and its rules index covers `addons/*/frontend/`.
- **Frequency:** 0. **Impact:** 1.
- **Reproduced:** read from the code. No user effect.

### B11. Seven `.pyc` files are tracked

- **File:** `tests/__pycache__/*.pyc`
- **What happens:** `git ls-tree` at this SHA lists them although `.gitignore` excludes `__pycache__/` and `*.pyc`. They are also copied into the test image.
- **Frequency:** 0. **Impact:** 1.
- **Reproduced:** `git ls-tree -r 61acfca`.

## Test holes

Frequency and impact are those of the defect the hole would miss. The mutations were restored after each run and applied only to the scratch copy.

### T1. Overlapping-request guards are not tested

- **File:** `frontend/usePagedPhotos.ts:109`, `:168`, `:158`; `frontend/CalendarView.tsx:83`; `frontend/MapView.tsx:116`
- **What happens:** removing any of these guards leaves vitest green. A refresh overlapping a pending `loadMore` could append a stale page or duplicate photos, and an older months or points answer could overwrite a newer one. `PhotoList` is keyed, so the existing "day the viewer has left" test passes through unmount without reaching the guard. The test at `PhotoDiaryPage.test.tsx:884` is named for months but exercises `fetchDays`.
- **Frequency:** 1. **Impact:** 5.
- **Rule:** spec section 3 ("only the latest applies"), I6.
- **Reproduced:** mutation, all five survived.

### T2. Saving on `pagehide` is not tested anywhere

- **File:** `frontend/PhotoDiaryPage.tsx:125`
- **What happens:** deleting the listener passes vitest. `pagehide` appears in no test, and `reload` only in the title of a scope-line test (`PhotoDiaryPage.test.tsx:1452`) that makes no real reload. A real reload runs no React cleanup, so that mutation would silently lose the list position on reload.
- **Frequency:** 3. **Impact:** 3.
- **Rule:** spec, Both views ("A reload in the same tab restores it").
- **Reproduced:** mutation survived in vitest; e2e checked by grep.

### T3. Destroying the map is not tested for unmount or a cancelled create

- **File:** `frontend/MapView.tsx:195-198`, `:216-222`
- **What happens:** removing either path passes vitest. Without them each drive change or return to the page leaks a map and its WebGL context, and browsers cap contexts per page. The late `setPoints` at `:200` also survives its removal.
- **Frequency:** 3. **Impact:** 5.
- **Reproduced:** mutation, all three survived. The code itself is correct today.

### T4. A restored position applied to a later list is not tested

- **File:** `frontend/MapView.tsx:292`
- **What happens:** replacing the `restoreSeq` check with `restore.list` passes. That mutation would give the next point opened after a restore the old list's depth and scroll.
- **Frequency:** 3. **Impact:** 3.
- **Reproduced:** mutation survived.

### T5. An assertion that cannot fail

- **File:** `e2e/map.spec.ts:108`
- **What happens:** `expect(TILE_URL).toContain("{z}/{x}/{y}")` checks the test's own constant. The regex check above it is the real one.
- **Frequency:** 0. **Impact:** 1.
- **Reproduced:** read from the code.

### T6. The tile test cannot see the notice clearing early

- **File:** `e2e/tileFailure.spec.ts:46-50`
- **What happens:** it makes tiles succeed before waiting for `false`, so any idle passes it, including the wrong one in A7.
- **Frequency:** 1. **Impact:** 3.
- **Reproduced:** A7's run shows `false` while every tile still fails.

### T7. Branches and paths that exist only for the test environment

- **File:** `frontend/map/createPhotoMap.ts:20`, `:168`; `e2e/selection.spec.ts:24`; `frontend/useWide.ts:29`
- **What happens:**
  - `e2e/fixture/index.html` has no core stylesheet, so `selection.spec.ts` passes only through `FALLBACK_ACCENT`. It also checks turning on, never turning off, which is why A1 and A2 got through.
  - `typeof ResizeObserver !== "undefined"` is a jsdom accommodation in product code.
  - Removing the `moreMayFollow && index === last` check in `SectionedGrids.tsx:57` also survives.
- **Frequency:** 3. **Impact:** 3.
- **Reproduced:** read from the code; the `SectionedGrids` mutation survived. With the page fixture's real stylesheet the accent did draw (A1's 1021 pixels), so the production path works in light mode.

### T8. The year-zero guard in the date SQL is untested

- **File:** `backend/router.py:112`
- **What happens:** deleting `_DAY >= "0001-01-01"` leaves `test_calendar.py` and `test_points.py` green, and 100% branch coverage cannot see inside SQL. Without the guard, `0000-01-01T...` would count on a day that `/photos?date` answers with 422, breaking I3. `UNDATED_VALUES` needs one row.
- **Frequency:** 1. **Impact:** 3.
- **Reproduced:** mutation in the test image, 48 passed.

## Checked, no finding

- **Drive boundary (I4, I5):** every data route runs `_drive_scope` before query validation, so a locked drive answers 404 ahead of any 422. Every query is scoped by `File.drive`. Saved state is keyed by drive, and `Session` remounts on `key={drive}`, whose value comes from the path.
- **SQL (I1, I2, I3, I8, I9):** date validity, grouping, `/points` order against `/photos?date`, and capture-place rules agree with the spec. Paging orders on a total key.
- **`createPhotoMap` cleanup:** `map.remove()` drops the listeners, and markers are removed first. A re-create after the empty state gets a new host.
- **Mutation kills:** 12 of the 27 frontend mutations were caught, including depth on refresh, restore depth, the layout-effect flush, section sort order and the storage key. Eleven of the 15 survivors are in T1 to T4 and T7.
- **Other survivors, not counted as findings:** `active` in `PhotoList.tsx:109` looks equivalent, because a `display:none` sentinel never intersects. `phase !== "ready"` in `PhotoList.tsx:93`, `!active` in `CalendarView.tsx:79`, and push for replace in `closeEmptyUndated` (`CalendarView.tsx:157`) also survive. The last passes because the undated test at `PhotoDiaryPage.test.tsx:864` closes through the months path first.
- **Item 10 sizes, one run on this machine:** at 50,000 photos in the test image, `/calendar/months` 106 ms, `/calendar/days` 50 ms, `/photos?date` 93 ms, `/photos?undated` 83 ms, `/points` 450 ms. In Chromium with software GL, `createPhotoMap` took 106 ms and the first label appeared 1.7 s later. Both are inside the limits. `decisions.md` records no such measurement, and the spec asks for one before merge.

## Open for the author

- The R-5 record is `at: a44cb47`. Six fix commits follow it, so its five differences have been fixed since but have not been rerun on a full stack.
- Layout was measured only where a finding says so. The phone sheet, the notice overlapping the attribution, and iOS were not checked.

TOTAL: 27 findings
