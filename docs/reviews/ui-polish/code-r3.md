# Code review: the `resuming` flag, round 3

Commit: `b99a3e83096263a2f6306804f39d62cdd0490301` (`feature/ui-polish`, addon repository), range `06d644c..b99a3e8`, read from `git archive` of that SHA.

How it was run: the SHA at `addons/photo_diary` beside a copy of the core's `frontend/`, at `scratchpad/r3/root`, `node_modules` symlinked. Nothing wrote to either working tree. Probes are kept at `/private/tmp/claude-502/-Users-libre-Sources-video-share/812503e2-427e-4330-9671-259b59381572/scratchpad/r3/probes/` and `.../scratchpad/r3/real.spec.ts`, `real-rodelay.spec.ts`.

Also run, read-only, in a browser: the real Next page of the local stack on `localhost:3000` (container `video_share-photo-diary-frontend-1`). Its served chunk `.next/static/chunks/0txruon~224.9.js` holds `resume(){y=!0,r.resize(),I(),M()}`, so it has the fix. `/points` and the thumbnails were stubbed by `page.route` with a dense grid, because that drive's own points gave at most 11 pins. Nothing on the stack was changed.

Not run: iOS, a real phone. Chromium with software GL only.

## Bucket A

### A1. On the real Next router the fix does not take effect: pins are still removed and re-created on returning to the map

- **Where:** `frontend/MapView.tsx:229-231` (`resume` called from a passive effect), `frontend/map/createPhotoMap.ts:602` (the only place the flag is set), `:558-559` (`onMoveEnd` syncs).
- **Invariant:** spec item 1, "A pin is kept while its members' count and pin photo are the same", and item 3, "A drawn pin stays drawn while its pin photo is the same". This is the case the commit is for, and code-r2 A1 stays open on the real page. code-r2 listed the real Next router as not run.
- **Condition:** switch to Calendar and back to Map, with pins outside the tiles a 400 x 300 view covers. Next's navigation commits in a transition, so React runs passive effects after the commit, not inside it. The view is already displayed by then. A frame can fall between the two, and MapLibre's ResizeObserver callback runs in it. Its throttle fires on the leading edge, so `resize` runs at once and fires `moveend`, and `onMoveEnd` runs `syncPins` while `resuming` is still false. Pins outside the small coverage are removed. `resume` then sets the flag, too late, and the next sync adds them again as new elements.
- **Frequency:** 8. Same rating and condition as code-r2 A1: every return on a desktop-sized map whose pins span more than the central tiles. With real data of few pins, near the centre, nothing is removed (11 and 5 pins: removed 0 in 20 returns).
- **Impact:** 2. Pins come back on `--sand` until their images are ready, and each costs a thumbnail request. Frequency x impact is 16, the same as the finding the commit set out to close.
- **Shown by:**
  - Real Next page, 1280 x 800, 2,400 points, one zoom-in, 78 pins, 1200 ms hidden. Removed, added and extra thumbnail requests per return, 8 returns at each CPU rate:
    - rate 1: 24, 24, 24 in 8 of 8.
    - rate 2: 24, 24, 24 in 7 of 8.
    - rate 4: 24, 24, 24 in 8 of 8.
    - rate 6: 24, 24, 24 in 5 of 8.
    The same number as code-r2's probe without this fix.
  - Cause isolated on the same real page: an init script delays every `ResizeObserver` callback by 120 ms, so the observer cannot run ahead of `resume`. Removed 0, added 0, thumbnails 0, in 10 of 10 returns, at rates 1 and 4. So the fix is in the served bundle and works when `resume` runs first.
  - Order logged on the fixture, with its router changed in the scratch copy to `startTransition` (instrumented copy of `createPhotoMap`). At CPU rate 6, all 6 returns: `press 5427`, `removed 5489` from `onMoveEnd < fire < resize` at width 1152, `resume 5509` reading canvas width 1152, `idle 5798`. At rate 1 on this fixture: `resume` reads width 400, removed 0. A resume that reads 1152 means the observer ran first.
- **Test gap:** the new test `e2e/pagePolish.spec.ts:338` passes against this defect. The fixture's router (`e2e/fixture/page/navigation.ts`) uses `useSyncExternalStore`, which commits synchronously with effects flushed inside it, so the observer did not run first: removed 0 in 12 of 12 returns at CPU rates 4 and 6. No test in the repository sees this ordering. With the fixture changed to `startTransition` and the CPU throttled, the probe does.

## Bucket B

### B1. A zoom or pan begun before the first idle leaves the old pins up with the new ones until the tiles answer

- **Where:** `frontend/map/createPhotoMap.ts:468`.
- **Invariant:** I10, "only pins inside the view plus a one-pin margin exist in the document", for as long as the flag holds.
- **Condition:** press Map, then zoom or drag within about 0.3 s, before the first idle (`resume` to `idle` measured about 290 to 330 ms when nothing else moves). `idle` then waits for the new view's tiles.
- **Frequency:** 1. The gesture has to start within a third of a second of the tab press.
- **Impact:** 2. The picture is wrong for the length of a tile answer, and the next idle corrects it. A pin pressed in that time still opens its right list (cluster ids read through `membersOf`, not run in this state).
- **Shown by:** real `createPhotoMap` on the page fixture, 1280 x 800, zoom-in pressed straight after the tab.
  - Tile answers delayed 300 ms: 160 pins until about 1 s, then 78.
  - Delayed 1500 ms: 160 until about 2.3 s, then 78.
  - Held: 160 for the whole 3.6 s sampled. A screenshot shows pins of 64 beside the pins of 16 they split into. In the control, with no return, the old pins were removed at once (112 removed, 78 left).
  - Two drags during held tiles: 84 pins in the document, all 84 outside the view plus margin. The control had 0. All of them went on release. Off-screen pins are clipped by the layer, so nothing shows.

## Examined, no finding

- **Flag sticking.** After each state below, a later 500 px pan left no pin outside the view plus margin (`out: 0`), so the flag had cleared:
  - a plain return at 1280, 1920 and 390 wide;
  - tiles answering 500 at return;
  - tile requests aborted at return;
  - hidden again before idle, with tile answers held and released while hidden;
  - 12 fast switches with 0 to 120 ms between them (78 pins before and after, removed 0, added 0).
- **`idle` after `resume`.** MapLibre's `resize` fires `move`, and the map's own `this.on("move", () => this._update(false))` requests a render (read in the bundled library), so a render always follows. Tiles in `errored` count as loaded, and `idle` was seen in every logged return. Only a tile request that never answers holds it, which is B1.
- **Hidden again before idle.** `onIdle` while hidden clears the flag and `syncPins` returns at `onScreen()`. If no idle comes, the next `resume` sets the flag again. No path puts the view on screen without `active` turning true, which calls `resume`.
- **Destroy.** `map.remove()` ends the events, and the flag has no timer of its own. An empty result calling `destroy` leaves `handle` null, so no `resume` reaches it.
- **Return with a data fetch.** Every return fetches `/points` (`MapView.tsx:108-119`), so a refresh during the flag is the common case.
  - Same data with the answer delayed 0, 150, 500 and 1500 ms, 3 zooms each on the fixture's router: removed 0, added 0, thumbnails 0, tiles 0.
  - Points removed at return: 40 pins, 45 at about 150 ms while the flag held, then 15 by about 460 ms, the same with tile answers delayed 0 and 800 ms. No stale pin outlasted the idle.
- **Tiles.** A return asks for no tile (0 requests in the same-data probes), so a slow tile server does not lengthen the flag on a return alone.

## Mutations of the fix

Baseline at the SHA: the full addon e2e command, unmutated, result below. Mutants were run against the map, page, tile failure and selection specs (100 tests, all passing unmutated); the killing test names come from `mapPolish` and `pagePolish`. The tree was restored and checked with `diff` against `git show b99a3e8`.

| Mutation | Result | Killed by |
|---|---|---|
| `resume` does not set the flag | Killed | `pagePolish.spec.ts:338` |
| `onIdle` does not clear the flag | Killed | `mapPolish.spec.ts:534`, and the I10 50,000-point test |
| Removal loop ignores the flag | Killed | `pagePolish.spec.ts:338` |
| `onIdle` syncs before clearing | Killed | `mapPolish.spec.ts:534` |
| `onMoveEnd` clears the flag | Killed | `pagePolish.spec.ts:338` |
| `onIdle` does not sync | Killed | `mapPolish.spec.ts:534` |
| `onSourceData` clears the flag | Survived | None. Not a finding: this path does not exist in the shipped code, and no misbehaviour was shown with it in the test's scene. A later change clearing the flag early on that path would not be caught |

The new tests bite on the fixture. They cannot catch A1, since they run on a router where `resume` comes first.

Full addon e2e, unmutated: 159 passed (44.2s)

TOTAL: 2 findings
