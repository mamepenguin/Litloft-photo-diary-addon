# Code review: daily notes fix commits, round 2

Range: `eb47c5074378ed257ca3aeb1bf89f1b1d5a5ac38..ff810475681dfebf290dbee8ce6a60c2a2a85b71`, addon repository, read with `git diff` and `git show`. Line numbers are at `ff81047`.

Result: none of the fixes breaks anything I could show. No finding reaches the fix threshold (frequency x impact 15, or frequency at least 1 with impact at least 8). Findings 1 and 5 are behaviour; 2, 3 and 4 are test gaps.

## How it was run

`git archive ff81047` was exported to a scratch copy and placed at `src/addons/photo_diary` in a scratch copy of the core's `frontend/`, with `node_modules` symlinked and vitest's `cacheDir` moved out. Neither working tree was written to.

- The addon's frontend suite passes there: 8 files, 420 tests.
- `DailyNotes.test.tsx` was run wrapped in `<StrictMode>`, against `eb47c50`'s source, and under 21 single-line mutants.
- Reproductions P1 to P7 are extra `it` blocks on the file's own harness, then discarded.
- The harness's `next/navigation` is synchronous, `FileGrid` is mocked, and nothing here ran in a browser.

## Bucket A

### 1. A restore can be spent while the calendar is hidden

- **Where:** `frontend/PhotoList.tsx:103-114`. The layout effect checks `phase` and `noteSettled`, not `active`.
- **Invariant:** I10 third clause, and I6 of `photo-diary.md`.
- **Condition:** Back from a photo deep in a day's list, then press the Map tab while the list or the note's text is still loading. When that answer arrives, the position is applied to the window on the map view and the restore is used up. Back on the calendar, the list is at the wrong place, and more loads on scrolling.
- **Frequency:** 1. The window is the load after Back, longer on a cold disk or with several pages to hydrate.
- **Impact:** 3.
- **Shown by:** P2, reproduced. With the stream held, Map pressed and the stream released: `h.scroll.calls` is `[640]` at `?view=map&month=2026-10&date=2026-10-20`. That the restore is gone on return is from reading `pendingRestore.current = undefined`, unreproduced.
- **Origin:** not introduced by this range. The effect is unchanged by it. The range's own key survives the switch: see P1 below.

### 5. A creation answered during a navigation still pending navigates to the editor

- **Where:** `frontend/useDayNote.ts:272-273`. `live` changes at render or at unmount, and neither has happened while the App Router's transition for the viewer's press is pending.
- **Invariant:** I10 ("neither changes the panel on screen nor navigates").
- **Condition:** press Write a note in state `none`, then at once press another day or a sidebar row. If the POST answers before that navigation commits, `router.push` to the editor of the first day runs after it and wins.
- **Frequency:** 1.
- **Impact:** 3. Back recovers.
- **Shown by:** reading, **unreproduced**. The test harness's navigation is synchronous, so it cannot show this. Round 1 named it under A1 as related, unreproduced, and the unmount fix does not reach it. It needs a browser to confirm.

## Bucket B

Nothing new.

## Test gaps

Scored by the defect they would miss.

### 2. Nothing holds the restore on the undated list

- **Where:** `frontend/CalendarView.tsx:180`.
- **Condition of the missed defect:** the `undated` branch of `urlListKey` is lost or wrong. Every Back from a photo deep in the undated list then silently stops restoring, with `limit` 40 and no scroll.
- **Frequency:** 3. **Impact:** 3.
- **Shown by:** mutant `url.date ? ... : null`, dropping that branch: `DailyNotes.test.tsx` and `PhotoDiaryPage.test.tsx` pass, 300 of 300. The code itself is right: P3 with `?month=2026-10&undated=true` gives `limit` `["80"]` and scroll 640.

### 3. "a restore answered after the page was left sends nothing more" cannot fail

- **Where:** `frontend/DailyNotes.test.tsx:2102`.
- **Condition of the missed defect:** the hook's `live` guard is lost, and a Restore that fails after the page was left sends `/note` from an unmounted hook. The test uses the success path, where `refresh()` is a state update on an unmounted component and sends nothing with or without the guard.
- **Frequency:** 0. **Impact:** 1.
- **Shown by:** it passes against `eb47c50`'s source, and with the `LEFT` cleanup removed the two creation tests in its block fail and it does not. That the failure path would send `/note` is from reading, unreproduced. `docs/process/testing-and-comments.md`, RED then GREEN and After GREEN, apply.

### 4. "written behind the grid" covers only a day that has a row

- **Where:** `frontend/CalendarView.tsx:176`, the `?? false`, against the test at `frontend/DailyNotes.test.tsx:2233`.
- **Condition of the missed defect:** a day absent from `/calendar/days`, one with no photos and no note, is treated as "no answer". A note written elsewhere for that day then gets no mark when the day is pressed.
- **Frequency:** 1. **Impact:** 3.
- **Shown by:** mutant `?? null` passes 300 of 300. The code itself is right: P7, on 4 October with no photos, gets `10月4日、メモあり`.

## The questions asked

**`live.current = LEFT` under Strict Mode and remounts.** No path found where a live viewer's responses are ignored forever.

- Strict Mode's second effect pass, and any change of scope, runs the setup at `useDayNote.ts:94` after the cleanup. Mutant removing that line fails 137 tests, so it is held.
- Cleanups for the whole tree run before all setups in one flush. Only children's setups run between this hook's cleanup and setup, and none touches `live`.
- A remount makes new refs. Nothing else assigns `LEFT`.
- `DailyNotes.test.tsx` under `<StrictMode>`: 159 of 164 pass, including writes, restores and retries. Of the 5 failures, 4 are exact request counts doubled by the double effect (`['80','80']`). The fifth is the drive-change test: `hold` holds one request, the doubled `/calendar/months` is answered, and the new drive's grid appears. These are harness artefacts, not behaviour, with the fifth read from the harness rather than separately run.

**`listToken` split.** By request counts in P5, each step's change from the one before:

| Path | photos | months | days | note |
|---|---|---|---|---|
| `onRefresh` | +1 | +1 | +1 | +1 |
| Entering the calendar from the map | 0 | +2 (one is the page's own read on map entry) | +1 | +1 |
| Restore | +1 | +2 | +2 | +1 |

- Restore's extra months and days come from `moved`, which is earlier behaviour.
- The top-level Retry after a failed list refresh reads the list (P6, 2 to 3).
- Entering the view read no photos before this range either, since `usePagedPhotos` does not depend on `active`.
- One accepted consequence: a first load that failed is no longer repaired by the second read. It shows the load error with Retry, which is noticed.
- Mutants: `refresh` without `listToken` fails 3 tests, without `token` fails 18, and the list keyed on `token` fails the second-read test.

**A3 comparison.**

- Before the days load, `marked` is null and nothing is compared. The days then being read are fresh, and the note effect only starts once `months` is known.
- A month differing from the panel's date cannot occur: `parsePageUrl` sets `month` from `date`, and previous, next and the picker drop `date`. So `openDate.startsWith(month)` at `CalendarView.tsx:175` is always true when reached.
- During a re-fetch, `days` keeps the old value. At worst that gives one extra read of months and days.
- It cannot loop. `marked` reaches the hook through a ref and is in no dependency list, `onStateChanged` bumps only `calendarToken`, which the note effect does not read, and `before.info === null` holds once per scope. The mutant removing that guard fails "a disagreement that persists".
- On a drive with nothing dated, `NO_DAYS` gives `false`, which agrees with `none` and refreshes rightly on `active`.
- `has_note` is defined as `active` only, matching the comparison. The mutant comparing with `!== "none"` fails a test.

**A4.**

- Same day after the map and back: P1 passes, with `limit` `["80"]`, scroll 640 and 80 photos. In that form the re-read on return answers first, because `hold` holds one request.
- Undated: P3 passes. A day pressed during an undated restore: P4 passes, no 640.
- Too early: `restoreFor` is taken from the URL at mount and no effect rewrites the URL on mount, except undated with count 0, where discarding is right. A normal Back keeps its key, and the existing Back tests pass.
- `calendarRestore` is read at Session render, so the URL change that follows a consumption passes null.
- The saved state does not record its list, so a jump back across several history entries could apply it to another list. That is odd use and was so before this range.

**`settle` change.** `again === null` also covers a newer read having taken over, which marks settled early. A stream 404 is the precondition, so that newer read would find no text either. The mutant removing the commit fails its test.

**`asyncUtilTimeout` and the test edits.** Nothing is weakened.

- The diff to existing tests is the import and the two `configure` lines. Everything else is added.
- The wait falls from `setup.ts`'s 3000 ms to 1500 ms and is restored in `afterEach`, which is stricter. `92d8aa6` states why, and 9 of the new tests fail against `eb47c50`'s source.
- `setup.ts` chose 3000 ms for starved workers, so the margin is halved. Unrelated tests did not flake with 5 runs in parallel, and the unkilled mutants passed 300 of 300 under that load. One machine, not CI.
- The guards added with no bug behind them do fail when broken: out-of-order stream, the previous day's text, the heading, and hidden reads each fail one test under a mutant. The drive-change test was not mutated.

TOTAL: 5 findings
