# Code review r3: Photo Diary Target, fix range 04f5136..83c7062

Reviewed: addon commit `83c7062` (commits `f049189` test, `83c7062` fix), range `04f5136..83c7062`,
against the core checkout at `/Users/libre/Sources/video_share-app-target` (develop). Threat model:
personal tool, owner only; bucket A = silently wrong in ordinary use; bucket B = odd input / misuse.

Baseline: `pnpm exec vitest run src/addons/photo_diary` at `83c7062`: 13 files, 570 tests, all pass.
For each mutation below I edited the working tree, ran the tests, restored the file from a saved copy,
and confirmed with `cmp` that it matched byte for byte.

## T1. Write side of the saved state's target: fixed

- New test `I9 a list position the page saves under the folder in force names it, and Back restores it`
  (Target.test.tsx:929). It goes through the page: it opens a day under `FULL`, loads 40, and unmounts,
  so `flush` saves. It then asserts `loadState("family").target === FULL.id` and
  `list === { loaded: 40, scrollY: 640 }`, remounts, and asserts that scroll 640 and `limit=40` are
  restored. The `scrollY` getter returns 0 once the grid has left the document, which models a
  browser's clamp.
- Mutation from r2, `PhotoDiaryPage.tsx:140`
  `saveState(drive, { ...state, target: "default" })`: this test fails (1 failed / 569 passed).
  Before this range the whole suite passed with the same mutation.
- The pin list is saved through the same `saveState` call, so the one write path is covered.

## N1. A map fitted but never moved loses its view when re-created: fixed

- `PhotoMap.getView()` (`map/createPhotoMap.ts:611-614`) reads `map.getCenter()` and `map.getZoom()`.
  `dropMap` (`MapView.tsx:122-127`) copies that view into `viewRef` before it destroys the map. Both the
  empty branch (`:189`) and the failed-read branch (`:209`) now go through `dropMap`.
- Checks for defects the fix could introduce:
  - **`getView` on a map not yet loaded or already removed.** `handle.current` is set only after
    `createPhotoMap` resolves (`:256`) and is cleared in the same step as every destroy (`dropMap`, the
    unmount cleanup `:283-289`). A late map from a cancelled create is destroyed without ever being
    stored. So `getView` is never called on a removed map. `createPhotoMap` returns before `load`.
    MapLibre sets the camera in the constructor, including the `bounds` fit, so `getCenter` and
    `getZoom` before `load` already return the fitted view. I took that from the library and did not
    check it (see Not verified).
  - **Recording at the wrong moment.** The only camera moves are the constructor's view and the
    viewer's own moves. `setPoints` and `setSelected` only replace data (`:597-608`). The target-change
    effect (`:134-150`) only calls `setPoints([])`. So `dropMap` records either the viewer's view or
    the first fit, and never a fit over a view the viewer set. When the map was fitted to the previous
    target's pins and never moved, `dropMap` records that fit. Item 8 asks for exactly this: keep the
    centre and zoom even when none of the new pins is in view. A response that arrives after the viewer
    has switched to the calendar destroys a hidden map. MapLibre resizes a hidden map to 400×300 and
    keeps its centre and zoom, so the view it records is still the one the viewer saw.
  - **`dropMap` and the unmount cleanup.** Neither can destroy the same handle twice, because each
    clears the ref. The cleanup does not call `getView`, which is right because `viewRef` dies with the
    component. `dropMap` is `useCallback(..., [])`, so adding it to the deps array (`:217`) triggers no
    extra reads.
  - **Mocks.** Target.test.tsx's mock returns a constant `FITTED` view. That is faithful for a map
    that never moved, and that is the case under test. The other suites return `[0,0]/1`, which only
    has to satisfy the type. One gap remains: in the mock, `onViewChange` and `getView` are independent,
    while in a real map they come from the same camera. This hides no defect in the current code,
    because `getView` is read only at destroy time, when it matches or is newer than the last `moveend`.
- Tests: `item 8 a map fitted and never moved keeps its view when an empty target destroys it` (:728),
  and the same for a failed read (:741). Both assert `center === undefined` on the first create, so the
  first map really was a fit.
  - Mutation: delete the `viewRef.current = handle.current.getView()` line. Both tests fail, 2 failed
    / 568 passed.
  - Mutation: the empty branch only goes back to the old inline destroy. Only the empty-target test
    fails, so each branch is guarded separately.
- One effect of the fix is incomplete. It is reported as N3 below.

## N2. Tile-failure notice not cleared when a failed read destroys the map: fixed

- `MapView.tsx:210`: `setTileFailing(false)` now sits next to `dropMap()` in the failure branch, as it
  does in the empty branch.
- Test `item 8 a retry after a failed read shows no tile notice over the map it draws` (:754). It raises
  the notice through the mock's `onTileFailureChange(true)`, fails Trip's read, presses Retry, waits for
  the second create, and asserts that the notice is absent.
- Mutation: delete that `setTileFailing(false)` line. This test fails (1 failed / 49 passed in
  Target.test.tsx).

## New findings

### N3. A view kept by `dropMap` reaches `viewRef` but not the saved state, so Back re-fits instead of showing it

- **Claim.** `dropMap` writes the fitted view only into `viewRef`. It does not call `onView`, and the
  re-created map is built with `center` in its constructor, which fires no `moveend`. So the page's
  `saved.current.center` stays unset (`PhotoDiaryPage.tsx:155-157, 200`). The re-created map shows
  view V, the previous target's fit. The saved state records no centre, so going back to the page
  creates the map without a view and fits it to the current target's pins.
- **Where.** `frontend/MapView.tsx:122-127`, together with `PhotoDiaryPage.tsx:128-131, 155-157`.
- **Ordinary use.** The window is N1's: the map is fitted and never moved, and the next target is empty
  or its read fails. Then you choose a target with pins, and the map keeps view V as item 8 asks. On a
  narrow screen, where the pin panel is an overlay and does not resize the map, you open a pin and a
  photo, then press Back. The pin list is restored, but the map is now fitted to the new target's pins,
  not to V. On a wide screen the static panel resizes the map when it opens. MapLibre fires `moveend`
  on that resize, so the view is saved and the problem does not occur. That last step is inferred and
  not observed.
- **Frequency** 0-1. **Impact** 2 (a different framing after Back; nothing lost, pins and list correct).
  **Bucket** A. Score at most 2, below the threshold.
- **Fix.** In `dropMap`, also pass the view to the page with `handlers.current.onView(view.center, view.zoom)`.
  Alternatively, have `createPhotoMap` call `onViewChange` once after its initial view, which would also
  close the pre-existing "fitted and never moved is never saved" gap at its source.

## Not verified

- The MapLibre behaviour this review relies on is inferred from the library and not observed:
  `getCenter` and `getZoom` already return the fitted view before `load`, `resize()` keeps the centre
  and zoom of a hidden map and fires `moveend`, and N3's wide-screen exemption. MapLibre is loaded at
  run time from `ASSET_BASE` and is not installed under `frontend/node_modules`. jsdom mocks
  `createPhotoMap`.
- I ran no browser, e2e, backend pytest or tsc, and started no Docker stack.
- `git status` showed an untracked `docs/reviews/app-target/design-check.md` during this review. I did
  not write it and did not touch it.

TOTAL: 1 findings
