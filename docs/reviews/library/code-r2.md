# Code review r2: fixes after round 1 (F5, D-2)

Commit reviewed: `878740f` (range `6c203c8..878740f`: 24ad3a1, c264a20, 878740f).
Scope: the page-level write counter (`PhotoDiaryPage.tsx`), the calendar's and the map's
`onWrite`, `LibraryFace` re-reading when shown again after a write, the phone shelf-page
spacing (`ShelfPage.tsx`), and the tests added for them.

Method: read the range against spec section 1 item 5, items 11 and 17, I13 and I14;
ran `Library.test.tsx` (74 pass at `878740f`); applied mutations one at a time to a copy
of the core frontend in a scratch directory (neither repository was touched) and ran
every Photo Diary frontend test file against each.

## Findings

### 1. A write on the Library is not reported to the hidden calendar: its open day list keeps the trashed or moved photo

- Bucket: A (spec-silent; the fix is one-directional)
- Claim: `PhotoShelf`'s grid reports a write only to `LibraryFace.refresh` (`LibraryFace.tsx:78-81`, `:106`), which re-reads the Library and the count but never calls the page's `noteWrite` (`PhotoDiaryPage.tsx:92-93`). The calendar is kept mounted while hidden (`PhotoDiaryPage.tsx:458-479`) and its open day list re-reads only on its own `listToken`/`token` (`CalendarView.tsx:93-100`); `PhotoList` does not re-read when `active` turns true (`PhotoList.tsx:146` uses `active` only for the near-end observer). So the counter added for F5 carries writes from the calendar and the map to the Library but not from the Library to the calendar.
- Condition: Calendar with a day open → Library tab → trash (or move to another drive) a photo of that day from a shelf's context menu → Calendar tab. The day list still shows the photo; the month's day counts are re-read on activation (`CalendarView.tsx:128`, `:149`), so the cell's count and the list disagree. Opening the stale photo leads to the core's 404/410.
- Reproduced: a probe test in a scratch copy of `Library.test.tsx` (open the 10月3日 list, go to the Library, `refreshShownGrid()` on the shelf grid, back to カレンダー): no new `GET /photos` request is sent (1 before, 1 after). The map re-reads its points on activation (`MapView.tsx:156`) and reduces its open ids to them (`MapView.tsx:186`), so the map is not affected the same way; not measured.
- Spec: item 5 / I14 name only "a write on the calendar or the map → the Library". Whether the reverse is wanted is a design question for the author; calendar ↔ map had the same gap before this spec.
- Frequency: 2 (needs a day list left open on the calendar, then a write from the Library). Impact: 5 (a photo that is gone is drawn; the failure is visible on open).
- Test: Library.test.tsx, "a write on the Library makes the calendar's open day list read again on return" — open a day list, Library, `refreshShownGrid()`, Calendar, expect a new `/photos` read and the written photo absent.

### 2. Test gap: nothing checks that a write is consumed once; the Library re-reading on every later return passes the suite

- Bucket: A (test gap)
- Claim: `LibraryFace.tsx:83-88` records the write it has acted on in `seenWrite`. Mutation: delete `seenWrite.current = writeToken;` (line 86). Every Photo Diary frontend test still passes (702/702). With that mutation, after one write on the calendar or the map, every later Library → other face → Library switch re-reads every loaded shelf page, its batch file reads and the count, for the rest of the visit, which is what I14 forbids ("without a new request when nothing was written ... in between").
- Why the suite misses it: the I14 no-request test (`Library.test.tsx`, "Library → Calendar → Library sends no request when nothing was written") starts with `writes === 0`, so `writeToken === seenWrite.current` holds whether or not the ref is advanced. The item-5 tests return to the Library once only.
- Defect missed: frequency 5 (every tab return after any write in that visit), impact 2 (redundant requests, about 7 shelf pages plus batch reads on the production drive at full depth; nothing drawn wrong). Below the fix threshold as a defect; reported because the guard is the half of the fix that I14 states.
- Test: in the item-5 block, after the existing return-after-write assertions, go to the calendar and back with no write and expect `shelfReads()` unchanged.
- Other mutations, for the record: removing the calendar's `onWrite()` (`CalendarView.tsx:99`) fails 2 tests; the map's (`MapView.tsx:309`) fails 1; dropping `!active` (`LibraryFace.tsx:85`) or passing `active={true}` (`PhotoDiaryPage.tsx:444`) fails 1 (the failed-re-read test, because the re-read then runs before the 500 is armed). Killed, but only incidentally: no test states "no Library read while it is hidden".

### 3. A write followed by a target change on the calendar or the map makes the Library read its pages twice on return

- Bucket: B
- Claim: the hidden Library is not keyed by `target.changes` (`PhotoDiaryPage.tsx:438`), so a target change gives `Shelves` a new `fetchPage` and `useLibraryPages` reloads from page 1 while hidden (`useLibraryPages.ts:83-127`). The pending write token is still unseen, so on return `LibraryFace.tsx:84-88` also fires `refresh`, re-reading the just-loaded pages of the new target (or, if the reload is still in flight, the old target's pages through the held snapshot, whose answer `sameList` then drops, `useLibraryPages.ts:142-144`). The refresh also bumps `countToken` on the same entry that already reads the count (`PhotoDiaryPage.tsx:121-140`), so `/calendar/months` is requested twice, the first cancelled.
- Condition: trash a photo in a calendar day list, then change the Target on the calendar, then open the Library.
- Frequency: 1. Impact: 1 (redundant requests; what is drawn is right).
- A fix, if wanted: advance `seenWrite` when the Library reloads for a target (or key it), so a full reload counts as having seen the write.

## Checked, no finding

- Phone shelf spacing (`ShelfPage.tsx:290`): the header's `py-2` leaves 8px under the sort row; `max-sm:-mt-1 max-sm:pt-0` brings the photos to 4px, the design's gap (D-2). `max-sm` matches the breakpoint below which `PageHeader` puts `actions` on their own row, so the wide layout keeps `pt-4`. Matches `pl-fix2-shelf-375.png` / `-768.png`.
- Fresh start (`epoch`) and a Library first mounted after a write: `seenWrite` starts at the current counter, and the face reads from page 1 anyway.
- A write while the Library's first read failed or is in flight: `useLibraryPages` ignores a refresh with no held pages; the retry path is unchanged.
- Restore: the re-read keeps `phase` at ready, so the pending scroll restore is not re-applied.
- The item-5 tests fail without the fix (calendar and map mutations above), and `refreshShownGrid` clicks the grid of the face on screen.

TOTAL: 3 findings
