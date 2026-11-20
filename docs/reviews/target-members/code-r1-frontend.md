# PD #12 code review r1 — frontend

- Commit: 6f90a56 (addon `photo_diary`, branch feature/target-members)
- Range: d95e3d3..6f90a56
- Core checkout: 48479c94b43ed45dc8354eb633c1e942f58659be (origin/develop, detached)
- Scope: addon `frontend/` (useTarget.ts, api.ts, PhotoDiaryPage.tsx, CalendarView.tsx, MapView.tsx, LibraryFace.tsx, ShelfPage.tsx, useDayPreview.ts, lib/library.ts), tests (TargetMembers.test.tsx and edited tests), `e2e/`
- Baseline: `NO_COLOR=1 pnpm exec vitest run src/addons/photo_diary` 17 files / 746 tests pass; `pnpm exec tsc --noEmit` clean
- Threat model: personal tool on a home LAN, the user is the owner, no attacker. A = silently wrong or broken in ordinary use. B = odd input, misuse, maintenance (no repro needed).

## Findings

### F1. The map stays blank after a failed evaluation is retried, or after leaving a too-large target (A)

- Claim: `MapView.tsx:374-388` replaces the whole view with `LoadError` / `EmptyState` under `targetFailed` / `targetTooLarge` by an early return, which unmounts the stage and its `host` div, but the map handle made under the previous target is kept (`handle.current` is not dropped; the target-change effect at `MapView.tsx:153-169` even keeps it on purpose and sets `phase` to `ready`). When the target becomes ready again (retry succeeds, or another target is chosen after too large), the points effect takes the `handle.current` branch (`MapView.tsx:217-219`: `handle.current.setPoints(...)`, `setPhase("ready")`), so no new map is made: the new, empty `host` div is drawn and the map lives in the detached old one. The code already knows this hazard for its own failed phase (`MapView.tsx:228-232` calls `dropMap()` before `setPhase("failed")`); the new early returns bypass it.
- Reproduction (observed, gitignored copy `frontend/src/addons/photo_diary/ZZRepro.test.tsx`, harness of `TargetMembers.test.tsx`):
  1. `?view=map` on the default target, map made (`createPhotoMap` 1 call, host connected). Choose Beach (member target), `finish({status:"failed"})`, click 再試行, `finish(READY)`. Result: `createPhotoMap calls: 1`, first host `isConnected: false`, `handle0.setPoints` calls `[1, 0, 1]` (the members' point was given to the detached map), `destroy: 0`.
  2. Same start, Beach → `finish({status:"tooLarge"})` → choose Trip. Result: `createPhotoMap calls: 1`, host `isConnected: false`, Trip's point set on the detached handle.
- Condition in ordinary use: the map has been shown under any target on this mount, then a member target is chosen whose evaluation fails (meaning search error, addon status lookup failing) and is retried, or whose set is over 10,000 (counted before narrowing to images, so a broad negated Smart Collection such as `-tag:draft` on a large drive) and the user then picks another target. The map stage is drawn empty (no tiles, no pins) until the page is reloaded; switching views does not recover it because the handle survives.
- Frequency: 3 (too-large on a large drive is a normal outcome of choosing a broad Smart Collection; the map being the last view is common). Impact: 5 (the map is unusable but visibly so; reload fixes).
- Test that would catch it: in `TargetMembers.test.tsx`, start on `?view=map` with the default target, wait for the map, choose a member target, answer `failed`, retry and answer `READY` (and a second case: `tooLarge` then choose Trip); assert the `host` element the last `setPoints` went to is connected (or that `createPhotoMap` was called again / the first handle was destroyed). The existing "map draws its failed phase" test starts with no map, so it never has a handle to lose.

### F2. Leaving while a saved member target is still evaluating overwrites the saved list position (B)

- Claim: `PhotoDiaryPage.tsx:212-238` skips the flush only under `failed || tooLarge` (`noSave`, line 83). While the members are being evaluated on a mount that came back to a saved member target, the calendar/map list has not loaded (photo requests wait for ready), so a flush on `pagehide` or unmount rebuilds the state from empty positions (`position.loaded() > PAGE_SIZE` fails) and writes it over the saved `list` / `listView`. Spec I4 asks that nothing be restored before ready; it only protects the saved state under failed / too large, so this is within the letter of the spec, but the evaluation (meaning search) can take seconds where the old look-up was near-instant, which widens a window that already existed.
- Reproduction: not run (B).
- Condition: come back to the page under a member target and reload or leave through the sidebar before the evaluation answers; the next visit opens the day list at the top.
- Frequency: 1. Impact: 3.
- Test that would catch it: save a list position under the member target, mount with the evaluation held, unmount, and assert `photo_diary:state:<drive>` still holds the list.

## Checked, no finding

- Stale answers on a target change: the Calendar view is keyed by `target.changes` (`PhotoDiaryPage.tsx:483`), the map's target-change effect bumps its request counter and drops pins/list, the Library's `Shelves` is unmounted while not ready, the count reads drop answers by `changes`, and `useMemberTarget` drops an evaluation whose key changed in the same render as the target (`selectedId`, `changes`, `fileIds` move together). No old-target answer is drawn.
- Requests before ready: every photo fetch is gated on `ready`; the day list's `fetchPage` returns a never-settling promise before ready.
- Member kinds holding no image send `none=true` on GET with `fileIds` null; an empty member list is sent as `file_ids: []` (`api.ts:59` tests `!== null`, not truthiness).
- A list (folders / collections) arriving late does not restart the evaluation: `listedFolder` is memoised on the `LoadState` object, which `useLoad` keeps stable once settled, and neither list is reloaded except by a retry after failure.
- `useWide` / `useHeldColumn` / `useReachedHeader` use callback refs, so the Calendar and Map early returns re-attach measurement on the way back.
- Edited existing tests (`Target.test.tsx`: `FULL` without free text, `NEGATED` moved to usable) match spec section 7; the others only add list stubs. No assertion loosened.
- Core comparison: `useVideoApp` resolves member / collection targets the same way (core `useMemberTarget`, `resolveCollectionTarget`); differences (per-target view, `?target=` from Home shortcuts, library filters) are features Photo Diary does not offer, not silent divergence — Photo Diary passes no `homeEntry`, so no Home shortcut can point at it.

TOTAL: 2 findings
