# Code review r1: Photo Diary Target (SPEC-PD-016 / SPEC-PD-017)

Reviewed: addon commit `c7da4bf`, range `9a61265..c7da4bf`, against the core checkout at
`/Users/libre/Sources/video_share-app-target` (develop). Threat model: personal tool, owner only;
bucket A = silently wrong in ordinary use; bucket B = odd input / misuse / maintenance.

## F1. The map stays blank after a points read fails under a new target, and then a retry or another choice

- **Claim.** After a target change, `MapView` keeps the live map handle but sets `pointsRef.current = null`
  and phase `"ready"`. If the next `/points` read fails, the error branch sees `pointsRef.current === null`
  and sets phase `"failed"`. `showMap` goes false, so the stage and the host `<div>` the map was built in
  unmount, but `handle.current` is neither destroyed nor cleared. On **Retry** (`retryLoad`), or on choosing
  another target (the reset path again sees a handle), the success branch takes `handle.current.setPoints(...)`
  and sets `"ready"`. A fresh, empty host `<div>` mounts, and the map is still drawn into the detached node.
  The stage stays blank, with no tiles and no pins, until a reload. Before this change, a failed read with a
  live handle always went to `refreshFailed`, because `pointsRef` was never null once a map existed. This path
  is new.
- **Where.** `frontend/MapView.tsx:125-141` (reset keeps the handle), `:192-198` (failure → `"failed"`
  because `pointsRef` was nulled), `:290-293` (`retryLoad` → `"loading"`, which also unmounts the host),
  `:184-186` (success reuses the handle), `:301` / `:343` (`showMap` gates the host). `createPhotoMap` binds
  the map to the `container` it was given (`map/createPhotoMap.ts:280-300`).
- **Ordinary use.** You are on the map, and either:
  - you choose a folder whose read fails: a 400 from a parameter the core cannot normalise, or a transient
    5xx. Spec §2 names "choosing another target in the menu" as the way out of this state, and that way out
    lands here.
  - or you make the change on the calendar, switch to the map, and that first read fails.
- **Frequency** 1. **Impact** 5 (the map is unusable and visibly blank; a reload fixes it). **Bucket** A.
- **Fix.** When a read fails while `pointsRef.current === null`, destroy and clear the handle as well
  (`handle.current?.destroy(); handle.current = null`). `viewRef` still holds the centre and zoom, so the
  re-created map keeps them as item 8 asks. Alternatively, keep the stage mounted and draw the load error over
  it.
- **Test gap.** The `createPhotoMap` mock ignores its container. No test fails a map read after a change and
  then retries or chooses again. A test that does, and asserts that `createPhotoMap` is called again (or that
  the old handle's `destroy` is called), would catch this.

## F2. The change token lags the target by one render: duplicate reads on every change, and a header N that can stay blank

- **Claim.** `useTarget` changes `selectedId` and `params` in the render where `chosen` is set, and in the
  render where a retried folder list lands. It bumps `changes` only afterwards, in a passive effect. In the
  render between the two, the views still carry the old key and so keep their old instances, but they
  already receive the new `target`:
  - The old `CalendarView` instance (key `${epoch}:${old changes}`) re-runs its months and days effects,
    which depend on `target`, and sends both reads under the new target. Its `fetchIds` changes too, so an
    open list refreshes under the new target.
  - The page's own count effect on the map (its deps include `target.params`) sends a months read.
  - The next render bumps `changes`, remounts the calendar and sends every one of these reads again.

  So every target change sends each calendar read twice. There is also a race. The first months read belongs
  to the unmounted instance, and its `then` still passes the `mine === monthsRequest.current` check, because
  that ref belongs to the dead instance and nothing bumps it again. So it calls `onTotal` with the
  `reportTotal` closure of the in-between render, which tags the count with the old `changes`. If that
  answer arrives after the remounted view's answer, `count.changes !== target.changes`, and the header N
  disappears. With it goes the menu's `currentCount`. Both stay blank until some later months read, such as
  a refresh, the second read or another change.

  For one painted frame there is also the new target's name over the old target's grid and old N, because
  the bump is a passive effect. This happens most visibly on the retry path, where the switch is
  asynchronous. That frame touches I14.
- **Where.** `frontend/useTarget.ts:91-103` (bump in an effect), `frontend/PhotoDiaryPage.tsx:108-112`
  (`reportTotal` tagged with the render's `changes`), `:125-141` (count effect deps), `:339` (calendar key),
  `frontend/CalendarView.tsx:126-145` (months effect depends on `target`; `onTotal` from the stale
  closure).
- **Ordinary use.** Any target change made on the calendar. The duplicate requests happen every time. N
  stays blank when the second of two simultaneous identical months reads overtakes the first.
- **Frequency** 2 for the blank N (the duplicate reads happen every time). **Impact** 3 (the header count and
  the default row's count are missing; another read restores them). **Bucket** A.
- **Fix.** Make the token move in the same render as the target. Either derive the views' key from
  `selectedId` plus an in-render counter, or hand the views a `{ params, changes }` pair that `useTarget`
  updates in a single state transition, so that no render pairs new params with an old key. Also have
  `onTotal` carry the token the request was made under, rather than the token of the callback's render.
- **Test gap.** No test counts photo reads per change, or answers the two months reads out of order. The fake
  `fetch` answers in issue order, so the race is invisible.

## F3. After a change, a month in the URL that the new target lacks is replaced on screen by the newest month (spec deviation, for the human)

- **Claim.** Item 8 says "the URL keeps the view, the month and an open day list", and only "with no month in
  the URL" does the calendar show the new target's newest month. I15 says the same. `keptMonth` goes
  further. When `targetKey > 0`, no day is open, and `url.month` is not in the new target's month list, the
  calendar draws `monthList[0]` while the URL still holds the old month. The screen and the URL then
  disagree:
  - a reload, or a share of the same URL under the same target, draws a different month (the URL's,
    because `targetKey` is 0 again);
  - the comment's "as a fresh load would" is wrong for this case, because a fresh load keeps the URL's month.
- **Where.** `frontend/CalendarView.tsx:114-124`.
- **Ordinary use.** You are on `?month=2026-10` with no day open, and you choose a folder with no photo or
  note in October. The calendar jumps to the folder's newest month, and the URL keeps `month=2026-10`.
- **Frequency** 3. **Impact** 3 (an unexpected month, and a reload that disagrees with what was on screen).
  **Bucket** A, and a design question.
- **Fix.** Ask the human which is intended:
  - (a) keep the URL's month as the spec reads, and drop the `targetKey`/`monthList.some` arm;
  - (b) keep the jump, but `go("replace", { month: newest })` so the URL follows, and amend item 8 and I15.

  Either way, the comment goes.
- **Tests.** Several Target tests encode the jump without naming it. `a fresh start in place …` and `I1 a change
  on the calendar applies to the map` start on `?month=2026-10` and then wait for `9月2日`. No test states the rule, either way.

## F4. Under a target that resolves to empty, the map draws a world view with no pins, and the next target is not fitted

- **Claim.** When the target is `none` and `/points` returns `[]`, the `none !== true` arm keeps or creates
  the map instead of showing the "no located photos" state that every other empty answer gets. On a first
  draw with no saved centre, `createPhotoMap` falls back to `[0, 0]` at zoom 1. If you then choose a folder
  with pins, the reset keeps that handle and its world view, so the new pins are drawn at zoom 1 and are
  never fitted. Item 8's "a map that had no view yet fits the new pins" is not met in substance. No spec line
  asks for a map under `none`. I4 asks only for "no pin".
- **Where.** `frontend/MapView.tsx:179`, `frontend/map/createPhotoMap.ts:291-295`.
- **Ordinary use.** The saved target is a folder that holds no images (a video folder, say). You open the
  map, then choose a photo folder.
- **Frequency** 1. **Impact** 3 (the pins are specks on a world map; zooming in by hand fixes it). **Bucket** A.
- **Fix.** Treat `none` like any other empty answer, with the `"empty"` phase and the handle destroyed. Or,
  if the map is kept on purpose, fit the next non-empty answer whenever the map has only ever shown no pins.
  The I4 test (`await waitFor(() => expect(mapModule.createPhotoMap).toHaveBeenCalled())`) pins the current
  behaviour and would need to change with it.

## F5. `withReason` forges a React element and passes it off as a string folder name (bucket B, raise to the human)

- **Claim.** To show the "cannot be used" reason, the page hand-builds an object carrying React's private
  element shape (`$$typeof: Symbol.for("react.transitional.element")`, `_owner`, `_store`). It adds a
  `toLocaleLowerCase` method and casts the object to `string` as `folder.name`. This works only while:
  - React keeps that symbol and that element layout. The symbol already changed between React 18 and 19.
  - The core's `TargetMenu` and `ManageTargetsDialog` call no other string operation on `name`. Today
    `ToolbarMenu` interpolates it into a key (`${index}:${opt.label}`, which gives `[object Object]` but
    stays unique by index), and the dialog calls `toLocaleLowerCase().includes`.

  After a React upgrade, or any core change that treats `name` as a string (`trim`, `localeCompare`, an
  `aria-label` template), the open menu throws "Objects are not valid as a React child" or mislabels the row,
  whenever the drive has an unusable folder. The addon is also reaching into the core component's internals,
  which the addon boundary is meant to prevent.
- **Where.** `frontend/PhotoDiaryPage.tsx:55-91`, used at `:322`.
- **Ordinary use.** None today. It breaks on a core or React upgrade.
- **Frequency** 0. **Impact** 5 (the menu is unusable but the failure is visible). **Bucket** B. It is a design
  question for the human.
- **Fix.** Pass the folders through unchanged. If the reason must be visible, give the core `TargetMenu` row a
  rendered reason (a core change under SPEC-CORE-099) instead of smuggling markup through a string field.

## F6. A target change with a day open re-reads the note and re-arms the 3-second second read

- **Claim.** On a change, the calendar is remounted, because its key includes `target.changes`. With a day
  open, that remount does two things:
  - It initialises `secondReadDue = url.date !== null` again. Three seconds after every change, the
    calendar re-reads the note, the months and the days, although nothing came back from the editor.
  - It remounts `useDayNote`, so the note in the day's panel goes back to its loading state and is read
    again.

  Item 8 and I5 keep notes independent of the target. The note text does not change, but it briefly
  disappears on every change.
- **Where.** `frontend/PhotoDiaryPage.tsx:339`, `frontend/CalendarView.tsx:270-289`.
- **Ordinary use.** You change the target with a day open.
- **Frequency** 3. **Impact** 1 (a flicker of the note and redundant reads). **Bucket** A.
- **Fix.** Keep `secondReadDue` and the note hook outside the target-keyed subtree, or seed `secondReadDue`
  as false when the mount comes from a change (`targetKey > 0`).

## F7. An in-place fresh start after a target change no longer fades

- **Claim.** `freshStart={freshStart.current && target.changes === 0}` suppresses the fade on the in-place
  fresh start (the sidebar row, or Back to the bare URL) once any target change has happened in this mount.
  Before this change that path faded, because `freshStart.current` is set to `true` there. The revised
  SPEC-PD-008 I3 lists only "a target change" among the draws that skip the fade. The in-place fresh start
  is a separate draw.
- **Where.** `frontend/PhotoDiaryPage.tsx:353`, together with `:260`.
- **Ordinary use.** You change the target, then press the sidebar's Photo Diary row.
- **Frequency** 1. **Impact** 1. **Bucket** A.
- **Fix.** Track "the target changed since the last fresh start" instead of `changes === 0`. For example,
  record `target.changes` at each fresh start and compare against it.

## F8. A flush during the look-up stamps the saved state with `default`

- **Claim.** `flush` writes `target: targetId.current`, and during the look-up `selectedId` is `"default"`. If
  the page is hidden while the folder list is still in flight (`pagehide`, or an unmount), the saved state
  is stamped `default` although the saved target is a folder. On the next Back, the mismatch check drops the
  saved list position and the pin list.
- **Where.** `frontend/PhotoDiaryPage.tsx:164-177`, `frontend/useTarget.ts:93`.
- **Ordinary use.** You leave the page within the moment the smart folder list takes to load.
- **Frequency** 0. **Impact** 3. **Bucket** B.
- **Fix.** Skip the `target` stamp, or the whole flush of list fields, while `lookingUp`. Alternatively, keep
  the previously saved `target` value until the look-up ends.

## T1. Test gap: no test that state saved under a folder target is restored under the same folder

- **Claim.** The I9 tests in `frontend/Target.test.tsx:802-825` cover only the mismatch cases: state written
  before the change (no `target`), and a pin list saved under `default`, both read under a folder. No test
  saves a list position or a pin list under folder X and then reopens under X. Revised SPEC-PD-001 I6 and
  item 8 ("the check runs once the look-up of 4 is done") are therefore unguarded on their positive side.
  Two plausible breaks pass the suite:
  - comparing `restore.target` against `targetId` before `ready`, when `selectedId` is still `"default"`.
    That drops every restore under a folder target. For example, remove `ready &&` from
    `CalendarView.tsx:216-223`; the `onRestored` effect then nulls the restore during the look-up.
  - a `flush` that never writes `target`, which makes every saved state count as `default`.

  Today it works partly by accident: `PhotoList` mounts only after `months`, and `months` waits for `ready`.
- **Defect let through.** Back from a photo opened deep in a day list, or from the map's pin list, does not
  restore the position whenever the target is a smart folder.
- **Frequency** 5 (going back from a photo is daily use, under a folder target). **Impact** 3 (the viewer
  scrolls back by hand). It is a test gap, scored for the defect it would let through.
- **Fix.** Add one row for each view. Save `{ list, listView, pointIds, target: TRIP.id }`, store
  `TRIP.id` as the app target, hold the folder list, release it, and assert that the scroll is restored to
  the saved `scrollY`, that the saved depth is loaded, and that the pin list reopens.

## T2. Test gap: the wire-contract expectation is computed by the code under test's own resolver

- **Claim.** `fullParams` (`frontend/Target.test.tsx:143-150`) is derived from `resolveAppTarget(FULL,
  ["image"])`, and `libraryKey` recognises the full target by `search=beach` alone. If the resolution drops
  or misnames a part (say `path:Photos` produced no `folder`, or `in:Album` no `collection`), the expected set
  shrinks with it. The test still passes, while the page sends a wider target than the folder means. The
  resolver is core code, but the addon's `wireParams` and `targetQuery` mapping is checked only against that
  echo.
- **Defect let through.** A folder target silently wider than its query, on every photo route. That breaks I1.
- **Frequency** 1. **Impact** 8. Note that the defect would have to come from a core change.
- **Fix.** Pin the expected wire for `FULL` literally, as
  `{search:["beach"], tag:["trip"], folder:["Photos"], size:[…], favorite:["true"], collection:["Album"],
  liked:["true"]}`, and have `libraryKey` require the whole set, not `search` alone.

## Tests checked and found sound

- The backend tests (`tests/test_target.py`) seed an image that each target row excludes, compare against the
  core listing with `type=image`, check that each id appears once, and cover the I3 equalities, the 422 and
  400 grids and `none=false`. An implementation that ignores any one parameter fails at least one row.
- The look-up hold (`I7 … sends no photo request while a saved folder is being looked up`) uses a real held
  folder read, and asserts that no photo read was made and that the `/note` read still goes out.
- The late-answer rows (`I14: an answer to a request made under the previous target`) hold the old-target
  request and release it after the change. One assertion is vacuous: `expect(JSON.stringify(lastPins() ??
  [])).not.toContain("a0")` in the calendar rows can never fail, because no map exists in those rows. It is
  harmless and needs no fix.
- F1, F2 and F3 each list their own test gaps.

## Not verified

- I did not run the backend pytest suite, because it needs a Docker build and I was told not to start Docker.
  I read `tests/test_target.py` but did not execute it.
- I did not run the e2e (`e2e/target.spec.ts`, `e2e/pagePolish.spec.ts`), so I did not measure I10 and I12
  in a real browser.
- I did not measure the 1-second bound at 50,000 photos (§10).
- F1 comes from reading the code: the test mock of `createPhotoMap` ignores its container, so I could not
  watch the detached map in jsdom.
- For F2, I traced the duplicate reads and the stale `onTotal` tag from the effect order. I did not reproduce
  the response reordering, which needs real network timing.
- The one-frame flashes (F2's old N under the new name, F6's note flicker) are inferred from passive-effect
  timing. I did not observe them in a browser.
- `frontend/vitest`: `pnpm exec vitest run src/addons/photo_diary` passed, 560 tests in 13 files, at
  `c7da4bf`.

TOTAL: 10 findings
