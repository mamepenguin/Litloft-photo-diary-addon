# Code review r2: Photo Diary map fix (F1)

- Commit: 2c68e5a (range 55b116b..2c68e5a), addon checkout /Users/libre/Sources/video_share-pd-review/addons/photo_diary
- Baseline: core origin/develop at /Users/libre/Sources/video_share-pd-review
- Scope: frontend/MapView.tsx new effect (172-179) and its interaction with dropMap, the target-change effect, the points effect, the creating phase, the saved pin-list restore and viewRef; the two new tests in frontend/TargetMembers.test.tsx
- Runs: `NO_COLOR=1 pnpm exec vitest run src/addons/photo_diary` -> 17 files, 748 passed. `pnpm exec tsc --noEmit` -> no output, exit 0.
- Tree clean at the end (`git status --short` empty); mutations were made on the tracked file and restored from a scratch copy, no stash.

## Mutation results

| Mutation (MapView.tsx) | Result |
|---|---|
| New effect disabled (`if (true) return;` at 175) | Both new tests fail (`...drawn again on a new stage after retry`, `...drawn again on a new stage for the next target`); 41 others pass. The tests detect F1. |
| `dropMap()` replaced by `destroy(); handle = null` and `setPhase("loading")` removed (177-178) | Survives: 748 passed. See F1 below. |

The new tests go through the production path: the page (PhotoDiaryPage -> useTarget -> useMemberTarget) with only `createPhotoMap` and the HTTP layer mocked, and they assert on the host element passed to the second `createPhotoMap` call (`isConnected`) and on the new target's points.

## Findings

### F1 (test gap) The centre and zoom kept across a failed or too-large target are not asserted

- Claim: the new effect calls `dropMap()` (MapView.tsx:177), which stores `handle.getView()` in `viewRef` (MapView.tsx:144) so the recreated map opens at the same place (MapView.tsx:265-271). No test checks this: replacing `dropMap()` with a bare `destroy()` leaves all 748 tests green, although the mock's `getView` returns `{center:[10,20], zoom:8}` (TargetMembers.test.tsx:440).
- Observed: mutation above, 748 passed.
- Condition in ordinary use: the code as committed keeps the view; only a later edit that destroys the handle without `dropMap` would lose it, after which the map re-fits to the new target's points instead of staying where the owner left it.
- Frequency: 0 for the committed code (no defect shown); the gap matters only on regression.
- Impact of the missed defect: 3 (the map jumps to a fitted view; the owner pans back).
- Class: B (test gap, maintenance).
- Test that would catch it: in either new test, `expect(options.center).toEqual([10, 20]); expect(options.zoom).toBe(8);` on `mock.calls[1]`.

## Checked, no defect found

- Phase stuck in loading: retry does not move `changes` (useTarget.ts:160-167), so after the drop the target-change effect does not run; the points effect runs on `ready` false->true with `pointsRef` null (cleared when the failing target was chosen, MapView.tsx:158) and `handle` null, and the result sets `creating` (MapView.tsx:236). Measured by the first new test (second `createPhotoMap` call on a connected host). `setPhase("loading")` at 178 is redundant on every path I could reach (the points effect or the target-change effect sets it), and harmless.
- Double map creation: the effect returns when `handle.current` is null (176), so an in-flight `createPhotoMap` is not raced by it. A creation in flight when a target change arrives is cancelled because the target-change effect moves the phase to `loading`, which runs the creating effect's cleanup (309-311).
- Points request racing the drop: `ready` is false whenever the target is evaluating, failed or too large (useTarget.ts:191), so no points request is in flight across the flip unless the target is unchanged and re-evaluated; `useMemberTarget` re-evaluates only on a key change or `retry`, and a folder-list reload changes `selectedId` and so `changes`, whose effect bumps `request.current` (157) and discards the late response.
- First render: with a failed saved target on mount, `handle.current` is null and the effect returns; the initial `targetFailed=false` returns at 175.
- Saved pin-list restore after a retry: a saved member target that fails on first load never had a handle, the effect does nothing, and `restoredList` is still false when the retried points arrive, so the restore at 211-221 applies as before. A target changed in-session sets `restoredList = true` (162) independently of this fix.
- Map view hidden: MapView stays mounted under `hidden` (PhotoDiaryPage.tsx:510-511). A failure while the calendar or library is on screen destroys the paused handle and sets `loading`; on retry `active` is false so no fetch; switching to the map runs the points effect (active dep), `pointsRef` is null so `loading` -> `creating`, and the creating effect waits for `active` (262). The view saved by `getView()` at drop time is used.
- Unmount cleanup (323-329) after the drop: `handle.current` is null, no double destroy.

TOTAL: 1 findings
