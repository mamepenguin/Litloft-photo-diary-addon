# Code review, round 2: Photo Diary addon fix commits

Commits: `61acfca..402f4672ddcc718a6a8ebb43f6c1c356085039a1`, read through `git archive` into scratch copies. Nothing in the addon or core repositories was edited; `git status` in the addon is clean at `402f467`.

Line numbers are at `402f467`, relative to the addon's root.

## What was run

- CI commands in the core worktree: vitest `src/addons/photo_diary` 253 passed; `tsc --noEmit` clean; eslint 0 errors, 26 warnings.
- Full Playwright suite on a scratch copy: 58 passed.
- Repro specs in Chromium through the addon's fixtures, with software GL, real MapLibre 6.16.0 and stubbed tiles.
- 25 mutations against vitest (scratch copy of the page test and `useWide` test) and 10 against the full e2e suite. All were restored, and the copy was diffed against the archive afterwards.
- Not run: pytest, a full Next.js stack, iOS, a real tile server. The fixture's router commits synchronously, so a pending navigation cannot be reproduced with it (B3).

## Bucket A: wrong in ordinary use, or breaks a stated rule

### A1. The sidebar row does not start over from a bare URL the Calendar tab reached

- **File:** `frontend/PhotoDiaryPage.tsx:179-182`
- **What happens:** the reset runs only when `search` changes. After the Calendar tab lands on the bare URL, the sidebar row navigates to that same URL, so `before === search` returns early. Session storage is not cleared and the map keeps its position and open list.
- **Condition:** on the map with a list open, press the Calendar tab, the sidebar row **Photo Diary**, then the Map tab.
- **Frequency:** 3. **Impact:** 3.
- **Rule:** spec, Both views: "A URL with no query always means a fresh start, however it was reached (the sidebar row, ...): the saved state for the drive is cleared."
- **Reproduced:** Chromium page fixture, a push to the page's own path plus a popstate, as `page.spec.ts` stands in for the row. The storage key stayed, and the Close button count on the map was 1. The real App Router may behave differently for a same-URL push, but nothing changes `search` there either.

### A2. A tile server answering 404 never shows the notice

- **File:** `frontend/map/createPhotoMap.ts:376-378`
- **What happens:** MapLibre 6.16.0 fires no `error` event for a 404 (`_loadTile`: `t.status===404 ? this.update(...) : this._source.fire(...)`), so `tileFailed` is never set. The map stays blank with no notice. This line is unchanged in the range, but the A7 rework depends on the same signal and every tile test uses 503.
- **Condition:** a replacement `PHOTO_DIARY_TILE_URL` that is wrong or stops before zoom 19. The default server rarely answers 404 in view.
- **Frequency:** 1. **Impact:** 5.
- **Rule:** spec, Failure cases: "A tile in view fails, with any status or a network error"; item 5: a server that stops earlier "shows the tile notice when the viewer zooms past its limit".
- **Reproduced:** Chromium, every tile 404, 42 requests, then 60 s: reports `[]`. The same run with 503 or an aborted request reports `[true]`.

## Bucket B: narrow timing, or no real user effect

### B1. Rapid switching during the first load strips the `maplibregl-map` class from the host

- **File:** `frontend/MapView.tsx:218-221`, with `:201-203`; `frontend/map/createPhotoMap.ts:413`
- **What happens:** B1's `[phase, active]` dependency cancels a create when the view is hidden. Returning before the library has loaded starts a second create on the same host. The cancelled map is then built and destroyed, and `map.remove()` removes the class the surviving map needs from the shared container. The surviving map's font and overflow rules from MapLibre's stylesheet no longer apply to the host. The enclosing `overflow-hidden` box still clips.
- **Condition:** Map, Calendar, Map within the first library load.
- **Frequency:** 1. **Impact:** 1.
- **Reproduced:** Chromium, library delayed 2.5 s: host class `relative h-full min-w-0 flex-1`; the normal path also has `maplibregl-map`. One canvas, one control set, labels correct, click, accent and drag all worked, and there were no console errors.

### B2. Back to a bare URL leaves the not-available page

- **File:** `frontend/PhotoDiaryPage.tsx:190`
- **What happens:** the spec's section 3 says not-available "is final for the page: no trigger leaves it", while Failure cases says it lasts "until the page is opened again". The row fits the second. Back to a bare URL is less clearly opening it, and also clears it. A drive still refused answers 404 again, so the message returns after a skeleton.
- **Condition:** a 404 while open, then Back to the bare entry.
- **Frequency:** 1. **Impact:** 1.
- **Reproduced:** mutation M4 shows the test `brings back a page that said not available` pins this as intended. The spec's two sentences need a person's reading.

### B3. A navigation still pending can pass for the page's own

- **File:** `frontend/PhotoDiaryPage.tsx:183`, `:201`
- **What happens:** `ownTarget` is set when `go` is called, and the App Router commits later. Press the Calendar tab, then press the row or Back to a bare entry before the commit, and that navigation matches `ownTarget === ""`, so it does not start over.
- **Condition:** two navigations inside one server round trip.
- **Frequency:** 1. **Impact:** 2.
- **Reproduced:** reasoned only; the fixture router is synchronous. Tab presses cannot queue, because `selectView` compares with the committed `url.view`, so tab-only rapid switching cannot reach this.

### B4. The new `clearState` loses a position when leaving before a restored list has loaded

- **File:** `frontend/PhotoDiaryPage.tsx:121`
- **What happens:** while a restored calendar list is loading, the position is absent or `loaded` is 0, so a calendar-only state is empty and the saved `{loaded, scrollY}` is now removed. Before this change it survived that case.
- **Condition:** Back from a photo, then reload or leave before the list's answer arrives.
- **Frequency:** 1. **Impact:** 2.
- **Reproduced:** reasoned only.

### B5. A tile request can follow the switch to the hidden view

- **File:** `frontend/map/createPhotoMap.ts:371`
- **What happens:** with the notice up, hiding the host resizes the map, which renders and idles, so the verification asks for a tile while no map is on screen.
- **Condition:** tiles failing, then the Calendar tab.
- **Frequency:** 1. **Impact:** 1.
- **Rule:** spec item 5, "while a map is on screen".
- **Reproduced:** Chromium fixture with `display:none` on the host: 1 request, then 0 while hidden, and 19 on showing it again.

## Test holes

Frequency and impact are those of the defect the hole would miss.

### T1. Nothing bounds tile requests while tiles fail

- **File:** `e2e/tileFailure.spec.ts`; the guarded code is `frontend/map/createPhotoMap.ts:359-374`
- **What happens:** adding `setTiles` to the failed-idle branch makes the map request tiles endlessly, and the suite stays green, because it checks only the reports and never counts requests. This is the path that would break the volunteer server's usage limit.
- **Frequency:** 1. **Impact:** 8.
- **Rule:** spec item 10, Cost ("forbids heavy use"); `## A7` below gives the correct code's rate.
- **Reproduced:** mutation E6 survived all 58 e2e tests. With it, 28,895 requests in 60 s with no user action. The real code makes 0.

### T2. Keeping `saved.current` across a reset is not caught

- **File:** `frontend/PhotoDiaryPage.tsx:187`
- **What happens:** without that line the next `flush` writes the old centre, zoom and `pointIds` back after the storage was cleared, so a later reload of `?view=map` reopens the old list. The tests check storage only immediately after the reset.
- **Frequency:** 3. **Impact:** 3.
- **Reproduced:** mutations M6 and E1 survived vitest and e2e. The resulting behaviour is reasoned from `flush`.

### T3. Clearing `ownTarget` after its navigation is not caught

- **File:** `frontend/PhotoDiaryPage.tsx:184`
- **What happens:** without it, Calendar tab, Back, Forward keeps treating the bare URL as the page's own, so it does not start over.
- **Frequency:** 1. **Impact:** 3.
- **Reproduced:** mutations M3 and E2 survived. With the real code the sequence does start over: storage empty after Forward, and no list after Back.

### T4. Overlapping-request guards still have no test (round 1's T1)

- **File:** `frontend/CalendarView.tsx:83`, `frontend/MapView.tsx:119`
- **What happens:** removing either guard passes, so an older months or points answer could overwrite a newer one.
- **Frequency:** 1. **Impact:** 5.
- **Rule:** spec section 3, "only the latest applies".
- **Reproduced:** mutations M15 and M25 survived vitest. These two were not run through e2e; a grep of `e2e/` shows no delayed answers for these routes.

### T5. The label position half of the A5 fix is not caught

- **File:** `frontend/map/createPhotoMap.ts:331`
- **What happens:** the count half is tested (E8 killed). Removing the `setLngLat` leaves a label of the same count at its old place after the points change.
- **Frequency:** 1. **Impact:** 2.
- **Reproduced:** mutation E9 survived.

### T6. The `active` guard in `closeEmptyUndated` is not caught

- **File:** `frontend/CalendarView.tsx:158-160`
- **What happens:** the sibling guard in the months effect is tested (M13 killed), and this one is not. Without it a refresh finishing after the switch would drop `view=map`.
- **Frequency:** 1. **Impact:** 3.
- **Reproduced:** mutation M14 survived vitest. Not run through e2e.

## Checked, no finding

### A7: tile requests

- **No user action: 0 requests per minute.** Measured for 60 s after the map settled, with every tile answering 503, every request aborted, and every tile 404; and for one tile in view failing with the rest good. The verification runs only at an idle with no new error, and the measured runs show no further idle once the failed idle has passed, so it does not sustain itself.
- **With user action:** at most one verification per action that causes a render, such as opening or closing a list or panning. Measured per open or close with all tiles failing: 3, 2, 2, 2, 1, 24, 10, 2, 2, 2 at 1280x600, and 2, 2, 1, 2 at 1000x600. With one tile failing, 21 per action. The reason the all-failing count is usually so low was not found; the largest single action observed was 24, and a first load made 28 to 34.
- **No visible cost:** with one tile failing and the rest good, the good tiles stayed drawn at every sample through a verification (green share 100%, with 0 ms and 300 ms tile delays), because `setTiles` reloads in place.
- **Recovery:** when the server comes back, one action re-requests 22 tiles, the notice goes and the map is fully drawn. So the notice does not clear over a blank map. Slow failing tiles (800 ms) kept the notice on, reports `[true]`.
- **No user action after recovery:** the notice stays until the next action, because nothing renders. The spec's "next idle" allows this.

### Selection

- **Partial overlap after zooming out:** the merged point is plum, so nothing is accent while the list stays open. `frontend-interface.md` states this rule, and E7 proves the test holds it. Clicking that point replaces the list, since the members differ.
- **`setSelected` cost:** at 50,000 points, 40 labels stayed through the rebuild at every frame of 305, with no flicker. Two clicks on different clusters with a rebuild between them returned the right members, 1660 and 166, so cluster ids survive the rebuild. `decisions.md`'s 429 to 438 ms was not re-measured.
- **Accent in the fixes' other paths:** a restored list, the create race, and a list that empties all go through `selected` or the `openIds` effect.

### Bare URL and history

- **Measured sequence:** map with a list, Calendar tab, Back keeps the list. Forward clears the storage. Back again shows no list. The Forward case follows the spec's "however it was reached".
- **Rapid tab presses:** `selectView` ignores a press until the URL commits, so they cannot queue. The reset's `setEpoch` runs in a layout effect, so no stale frame is painted.
- **Not findings:** M8 and M9 each survive, apparently because either alone removes the old map; removing both together was not run. M19 is covered by M18's path. M2's case needs a `go` to the bare URL from the bare URL, which no control offers. E10 changes only the cost.

### B1 and earlier assertions

- **B1:** creating only while visible holds, and M16 and M17 are killed. A map hidden after construction is cancelled and rebuilt on return. Effect 1's refetch and the `pointsRef !== used` check cover a late answer.
- **Weakened tests:** none found.
  - The removed `TILE_URL` assertion was round 1's T5, which could not fail.
  - The old click-to-accent spec moved to `setSelected`, and `page.spec.ts` covers the real click through `openPointList`, Back and Close.
  - The old "stays idle" frame count is kept as its own test.
  - The tile test's clear step is stricter.
  - The inline accent helper was generalised and now reads the page's token.
- **`FALLBACK_ACCENT` removed:** `--accent` is set for both themes in `globals.css:36`, `:74`, and the fixture now loads the real stylesheet, so the production path is the tested one.
- **`typeof ResizeObserver` removed:** the tests stub it, and every browser the app targets has it.

### Round 1 items

Fixed and confirmed by kills or runs: A1, A2, A3, A4, A5, A6, A7, B1, B2, T2, T3, T4, T7's two product branches. T5 and T8 are confirmed by reading only: the assertion is gone, and `UNDATED_VALUES` has the year-zero row, but pytest and its mutation were not run in this round. T1 remains (T4 above).

The three backend test files changed in this range were read and not run.

## Open for the author

- `decisions.md` gains only the size measurement in this range, so the R-5 record still predates these fixes and has not been rerun on a full stack.
- Round 1's A8: the radius, focus ring and 44 px rows are fixed. The list is still anchored below `sm` under the scrim. Whether it counts as a "toolbar menu" that must be a bottom sheet remains a person's call.

TOTAL: 13 findings
