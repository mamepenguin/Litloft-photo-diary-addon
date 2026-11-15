# Code review r3: the fix after r2 (`be68e87..1dd37db`)

Reviewed commit: `1dd37db` (range `be68e87..1dd37db`). Scope: the write counter carrying Library writes to the calendar and the map, each face re-reading its open list when shown after a write made elsewhere, and the tests added.

Baseline: `Library.test.tsx` passes at `1dd37db` (78 tests).

Mutations were run on a gitignored copy of the addon's frontend (`frontend/src/addons/pd_mut_r3/`, removed afterwards); neither repository was edited.

## Findings

### 1. The map reads its open list twice when shown after a Library write that removed one of its photos

- Claim: `frontend/MapView.tsx:317-321` bumps `listToken` as soon as the map becomes active, while the points read started by the same activation (`MapView.tsx:158-223`, `active` is in its deps) is still in flight. The list is re-read at once with the old ids. When the points arrive without the trashed or moved photo, `reduceTo` (`:188-192`) hands the list a shorter id set, `fetchIds` changes (`:300-303`), and `usePagedPhotos` (`usePagedPhotos.ts:132-147`) reads the list a second time. The map's own write avoids this by bumping `listToken` only after the points answer (`reason = "refresh"`, `:204`); the cross-face path does not.
- Reproduced on a copy of the tree, with the test harness's `/points` answer filtering `h.missing` the way the real `/points` does (`backend/router.py:192-197` applies `active_file_filter()`): open a two-photo point list, go to the Library, trash one of the two there, return to the map. `batchGetFiles` calls on return: `["m2026-10-0,m2026-10-1", "m2026-10-1"]` at `1dd37db`; `["m2026-10-1"]` with the new effect removed. So for this case the fix adds a redundant request. Before the fix, the reduction path alone already refreshed the list. When the trashed photo was the pin's only one, the list closes (`kept.length === 0`) and the first read is wasted.
- Visible effect: none found. The first read already omits the trashed photo, because the core's batch drops it, so nothing stale is drawn. This is one extra request.
- Condition: a photo in the map's open point list is trashed or moved out of the target on the Library, and then the map tab is opened.
- Frequency 1, impact 1.
- Test: in `Library.test.tsx`, have the `/points` mock drop `h.missing` ids, open a two-id list, trash one on the Library, return to the map, and assert that `batchGetFiles` is called once, with the reduced ids. The existing test `a write on the Library makes the map's point list read again once` cannot see this because its `/points` answer is static and its list holds one id.
- Possible shape for a fix: on a pending cross-face write, set the same "refresh after points" path (`reason.current = "refresh"`) before the activation's points read, rather than bumping `listToken` directly. That needs the write effect to run before the points effect, or the points effect to read a pending flag.

### 2. Test gap: nothing pins that the calendar's write effect asks only for the list

- Claim: `frontend/CalendarView.tsx:107-111` bumps only `listToken`, because months, days and notes are already re-read on activation (`:138-180`, `active` in deps). Mutation M9 makes the effect also bump `token`, so every return to the calendar after a Library write reads months, days and the day note twice. All 706 tests in the addon's frontend suite still pass.
- Condition: return to the calendar after any write on the Library.
- Frequency 3, impact 1 (duplicate requests, nothing visible). Below the bar on its own. Listed because the brief asks for double re-reads, and nothing would catch this one being introduced.
- Test: in `SPEC-PD-019 I14 a write on the Library makes the calendar's open day list read again once…`, also assert that `isMonths` reads grow by exactly one on the return to the calendar, matching an entry with nothing written.

## Checked, no defect

- Mutations M1–M8, M10 and M11 were all killed: each effect removed, each own write left unmarked (calendar, map, Library), the Library's write not reported to the page (`onRefresh={refresh}`), each effect firing while hidden, and each effect never marking the token seen. M4 is also caught by two older `PhotoDiaryPage.test.tsx` tests. The new tests do not pass without the fix: M1, M2 and M6 reproduce the pre-fix behaviour and fail.
- Own write: `noteWrite` returns the incremented count synchronously, and each face stores it before the re-render, so the writing face's effect sees `writeToken === seenWrite` and does not re-read a second time.
- Target change: the calendar is keyed on `target.changes` (`PhotoDiaryPage.tsx:468`), so it remounts with `seenWrite` set to the current count. The map closes its list on a target change (`MapView.tsx:140-156`), so a later `listToken` bump with no list open does nothing.
- Fresh start: `epoch` remounts every face, and `seen` resets the calendar and the map. Each new face starts with `seenWrite = writes`, so no stale count triggers a read. A face first mounted after writes elsewhere starts from its own first read, with no extra read.
- Restore: the restore depth is consumed only by the first load (`usePagedPhotos` `restore.current`). A later `listToken` refresh keeps the loaded depth (`Math.max(loadedRef.current, PAGE_SIZE)`), as item 5 requires.
- Only context-menu writes reach `noteWrite`: core `FileGrid` → `FileContextMenu.onUpdate`. Retries use `refresh` and `retryRefresh` and do not count as writes.

TOTAL: 2 findings
