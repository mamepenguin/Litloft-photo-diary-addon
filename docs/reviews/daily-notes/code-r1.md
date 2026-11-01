# Code review: daily notes, round 1

Commit: `eb47c5074378ed257ca3aeb1bf89f1b1d5a5ac38` (`feature/daily-notes`, addon repository), read from `git archive` of that SHA.

How it was run: the SHA was exported to the scratchpad, placed at `src/addons/photo_diary` in a scratch copy of the core's `frontend/` (with `node_modules` symlinked and vitest's `cacheDir` moved out), so nothing wrote to either working tree. On that copy the addon's frontend suite passes: 8 files, 404 tests. The reproductions below are extra `it` blocks using the harness of `frontend/DailyNotes.test.tsx`, its fake `fetch`, real `usePolicy` and real `MarkdownPreview`. Each failed as stated. They were then removed. The backend was read, not run. Mutation testing was not asked for and not done.

## Bucket A

### A1. A creation answered after the page or drive was left still navigates to the editor

- **Where:** `frontend/useDayNote.ts:237-239`, with `live` assigned only during render at `:74-75` and no unmount cleanup.
- **Invariant:** I10 ("A response for a day or drive the viewer has left ... nor navigates"), also item 3 of the spec.
- **Condition:** press Write a note in state `none`, then before the POST answers go to another drive or page (sidebar row, browser Back out of the page). `Session` has `key={drive}`, so the hook unmounts. `live.current` keeps the old scope forever, `live.current !== s` is false, and `router.push` runs. The viewer is taken from where they went to `/files/{id}?edit=1` of the old drive's note. The `CalendarView key={epoch}` remount behaves the same.
- **Frequency:** 1. The window is the POST latency, longer when the first note creates the folder or the drive is slow.
- **Impact:** 3. Back recovers, and the empty file is harmless by the definitions. It does break the stated invariant.
- **Shown by:** reproduced twice.
  - Drive switch with `h.drive.current = "work"` and `page.again()`, as the existing `/note` drive-left test does: `expected '/files/new-2026-10-04?edit=1' to be '/drive/work/addons/photo_diary'`.
  - `view.unmount()` with the URL moved elsewhere: same result.
- **Test gap:** "a creation answered after leaving the day does not navigate" (`DailyNotes.test.tsx:1527`) covers a day change only, where the scope changes while mounted. Nothing covers the unmount.
- **Related, unreproduced:** in production the URL changes inside a transition, and the test's `next/navigation` mock is synchronous. A day pressed whose navigation is still pending, with the create answering in that window, also pushes the editor. The tests cannot show this.

### A2. The second read can replace a first load of the saved depth with 40 photos, losing the restored position

- **Where:** `frontend/CalendarView.tsx:180-188` (timer started at mount, `refresh`) into `frontend/usePagedPhotos.ts:137` (`Math.max(loadedRef.current, PAGE_SIZE)`, where `loadedRef` is still 0) and `:100,109` (the newer generation drops the initial load).
- **Invariant:** I10 third clause and I6 of `photo-diary.md` (going back restores the position).
- **Condition:** Back from a photo deep in a day's list (`restore.loaded` above 40) when the first load of that depth is still running 3 seconds after mount. For example, cold disk or slow Wi-Fi with several pages to hydrate. The refresh wins with depth 40. `phase` becomes ready, `PhotoList`'s layout effect applies `scrollY` to a page that holds only 40 photos, the browser clamps it, and the restore is consumed.
- **Frequency:** 1.
- **Impact:** 3. The viewer sees the right day at the wrong place, and more photos load on scrolling.
- **Shown by:** reproduced at the request level. With `saveState(loaded: 80, scrollY: 640)` and the first `/photos?limit=80` held past 3.3 s, `limit` values were `['80', '40']` instead of `['80']`. That the list then holds 40 and the scroll clamps is from reading, unreproduced.
- **Also from reading, unreproduced:** if that refresh fails, `mode === "refresh"` leaves `phase` at `loading`, so the skeleton stays under the top-level load error until Retry.

### A3. A first read that finds a state the grid does not show leaves the grid wrong

- **Where:** `frontend/useDayNote.ts:124`. `before.info !== null && ...` skips `onStateChanged` on the first read of a visit.
- **Invariant:** I3 ("A note row that is ... `trashed` ... gives no mark") as seen on screen. The prop's own doc comment at `:53` states the intent: "A read found a state other than the one drawn, so what the calendar marks may be stale."
- **Condition:** the calendar is open in one tab. In another tab or the core, a note is trashed or written, or a scan brings one in. Then the viewer presses that day. The panel shows the new state, and the grid keeps the old mark and label until the next read. Pressing a day never refreshes the grid, and no second read runs because the page was entered with no day open. A second press does not help, and leaving and returning to the day starts a new visit, which is again a first read.
- **Frequency:** 1.
- **Impact:** 3. The panel beside it is right, and any later read corrects the grid.
- **Shown by:** reproduced both ways.
  - Trashed behind the grid: the panel shows the trashed message and the button named `10月4日、メモあり` is still there 200 ms later.
  - Written behind the grid: the text is shown and no such button exists.
- **Test gap:** "Retry that finds the row missing shows it in the panel and drops the mark" (`:1184`) covers the same-visit branch only.

### A4. A day pressed while the saved position waits for the note inherits that position and depth

- **Where:** `frontend/CalendarView.tsx:297` (`restore` read from `calendarRestore.current` on every render, and the new `PhotoList` key takes it at mount) with `frontend/PhotoList.tsx:105`, where the wait now extends until the note has settled. `onRestored` has not yet nulled the ref.
- **Invariant:** none directly. This is close to I6 of `photo-diary.md`.
- **Condition:** Back from a photo on a day with a note, then press another day before the note's stream answers. The other day's list loads the old depth and scrolls to the old `scrollY`. This form exists before this change for the list's own load, by reading of `main`, not run. The change lengthens the window by the note and stream reads.
- **Frequency:** 1.
- **Impact:** 3.
- **Shown by:** reproduced. With the stream held, `10月3日` pressed after the 80 photos had rendered: `h.scroll.calls` contained 640 on 3 October.

## Bucket B

### B1. A stream failure for a state already left is still applied

- **Where:** `frontend/useDayNote.ts:152`. When a re-read moves off `active` it returns without bumping `textSeq`, so the earlier `loadText` still reaches `showText`.
- **Condition:** a stream in flight fails after a newer `/note` read has moved the day to `empty`, `none` or similar. A load error appears above Write a note. Retry recovers it. A success in the same spot only stores a text nothing draws.
- **Frequency:** 0. It needs a failure inside a read overlap.
- **Impact:** 1.
- **Shown by:** reading, unreproduced.

### B2. Ending one scope's write drops another scope's queued read

- **Where:** `frontend/useDayNote.ts:211`. `queued.current = null` runs without checking the scope. `busyScope` is one slot, so a create on day A overlapping a create on day B also stops the guard for A.
- **Condition:** Write on A, move to B, Write on B, a re-read queued on B, then A's response arrives.
- **Frequency:** 0.
- **Impact:** 1.
- **Shown by:** reading, unreproduced.

## Design points, not bugs, no score

- **Render-phase ref writes.** `visit` and `live` in `useDayNote.ts:68-75` are written during render. A render React discards would change the scope with no commit, so the effect keyed on `id` would not read again. I could not state a condition in ordinary use, but this is the same root as A1: "the viewer left" is decided in render, not by a lifecycle.
- **Shared `LoadError`.** `frontend/LoadError.tsx` was restyled in `1cb80f8` and is drawn by `PhotoList` and the top of the calendar too. So with no slot, a failed map or undated list looks different, against the letter of item 7 ("with no slot its output is unchanged"). Only appearance changes, and the design record asks for such rows inside the note area. It needs a human's nod rather than a fix.
- **Harness limits.** The test `next/navigation` is synchronous, `FileGrid` is mocked, and `useAddonSlots` is a fixed stub apart from the dedicated loading test. The second read's effect on the real grid therefore rests on R-5, and the scroll figure recorded there supports it. `FileGrid` itself holds no state keyed on `files` beyond a `useMemo`.

## Checked, no finding

- **`onStateChanged` loop:** it bumps `calendarToken`, which only the months and days effects read. The note effect depends on `token`, so it cannot loop. Each callback passed to the hook is stable, so `read` keeps its identity and the effect does not re-fire.
- **`useDayNote` overlaps:**
  - Latest-only applies through `noteSeq` and `textSeq`.
  - Leaving the day during a create or restore, while still mounted, navigates and refreshes nothing.
  - A re-read during Creating or Restoring is queued, and a successful restore's refresh runs after `end`.
  - `settled` cannot stick, since every read path reaches it unless a stream hangs forever.
  - A re-read keeps the text unless state or `file_id` changed.
- **`PhotoList` with no slot:** map and undated pass no note and `noteSettled` defaults to true, so the layout effect behaves as before, plus a cancelled animation frame on unmount. `useDayNote` with `date` null reads nothing. The existing tests at `:679-700` and `:1625` pass.
- **`useEditorAvailable` across a drive change:** `Session key={drive}` remounts it, so `decided` starts again. The core's `catalogueDrive` lag lasts until the status response, and it can matter only where the old drive lists knowledge and the new one's policy read is fresh. A drive that drops knowledge by policy also answers false from `usePolicy`, so no wrong control persists. A failed `/api/addons/status` returns an empty list, so the controls are hidden, as is the file page's editor slot.
- **SQL:**
  - `GLOB` is anchored and case-sensitive, and `.md` is literal in the pattern, so a subfolder, another folder, ` (1)`, `.txt` and `.MD` do not match.
  - `date(x) == x` with `>= 0001-01-01` agrees with `_real_date` on every real date. `/note` uses exact equality on `drive` and `file_path`.
  - All note queries filter on the scoped drive. `_drive_scope` runs before `_real_date`, so a locked drive with a bad date is still 404.
  - `file_size` is `nullable=False`, so `size > 0` is safe.
  - Month merge sorts descending and days ascending, in Python. A `count: 0` month adds nothing to `photoTotal`.
- **Core routes:** `conflict_mode` is on the core's `develop`. The stream answers 200 for a trashed file and 410 for a missing one, and its text path sends a content-hash ETag, so `no-cache` cannot show text from before the last save.
- **Second read:** `secondReadDue` runs at mount with a date, pauses while hidden, and does not repeat. It re-reads notes, months and days at the same moment.

TOTAL: 6 findings
