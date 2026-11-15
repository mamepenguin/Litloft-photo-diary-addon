# Code review r1: Library frontend

Reviewed commit: `bbf9562` (range `3cb4ed7..bbf9562`), scope `frontend/` and `e2e/`.
Threat model: personal tool on a home LAN, the owner is the only user, no attacker.
A = silently wrong or broken in ordinary use. B = odd input, misuse, maintenance.

Baseline: `pnpm exec vitest run src/addons/photo_diary/` at this commit: 16 files, 698 tests, all pass.

## Findings

### F1 (A). A re-read after a write is dropped without a trace when a later page lands first

- Claim: `frontend/useLibraryPages.ts:142-144` and `:148` accept a re-read only when
  `sameList(now, wanted)`, which compares `pages` (`:59-66`). `loadMore` (`:155-179`) is not held
  off while a re-read runs (it checks only `more === "loading"`; a re-read never sets it), and when it
  answers first it bumps `pages` (`:170`). The re-read's answer, success or failure, is then thrown
  away: the photo the viewer just trashed or moved stays drawn, `refreshFailed` stays false, and no
  `LoadError` appears. The shelf page does not have this hole: `usePagedPhotos` sets `busy` for a
  refresh so `loadMore` cannot start (`usePagedPhotos.ts:101,158`), and a refresh that starts during
  a `loadMore` wins by `generation`.
- Condition: a write through the context menu on the Library while the next shelf page is loading or
  is about to load (the sentinel is near: a write on a shelf near the bottom of what is loaded, or a
  scroll right after the write). Most likely on a short list (tag or collection classification with
  a few shelves loaded) where the sentinel sits close to the photos being edited.
- Reproduced with a hook-level test (scratch, not committed): load 1 page with `gone` on shelf 0,
  bump `refreshToken` with page 1 of the re-read held, call `loadMore`, let it answer (pages = 2),
  then release the re-read without `gone`. Result: `shelves[0].file_ids` is still
  `["gone","a0"]`, `refreshFailed` false.
- Frequency 1, impact 5 (I13 broken for that write: the photo that left is still on the shelf; the
  viewer finds out only by opening it or by leaving and coming back).
- Test that catches it: the scenario above in `Library.test.tsx` (I13 block): hold the re-read's
  `/library/shelves?offset=0`, let the sentinel load `offset=12`, release, expect the trashed id gone
  (or the `LoadError`). A fix is either `usePagedPhotos`'s rule (no `loadMore` while a re-read runs;
  a re-read supersedes a pending `loadMore`) or re-reading `now.pages` after the append.

### F2 (A). The header's N is not read again on Map → Library or Library → Map

- Claim: `frontend/PhotoDiaryPage.tsx:116` folds both faces into one boolean,
  `countsItself = url.view === "map" || url.view === "library"`, and the read at `:119-135` keys
  on that boolean, not on the face. Going from the map to the Library (or back) leaves it `true`,
  so no `/calendar/months` read runs on that entry. Item 11 asks for the read "on every entry to the
  Library", and the map's own rule ("on each entry", kept by the comment at `:111-115`) loses its
  Library → Map case; before this change every entry to the map flipped `onMap`.
- Condition: switching between the Library and Map tabs (or Back/Forward between them). The N
  shown is the one read on the previous entry; it differs from the truth only when photos were
  added, removed or moved by something other than this page's context menu (another tab, an upload,
  the scanner) in between.
- Reproduced with a page-level probe (a scratch copy of `Library.test.tsx`'s harness, not
  committed): opened at `?view=map`, one `/calendar/months` read; after pressing ライブラリ and the
  shelves drawn, still one. Opened at `?view=library`, then 地図: still one.
- Frequency 3 (the tab pair is used often; a change in between is uncommon), impact 2 (a stale
  count in the header, corrected on the next entry from the calendar or a reload).
- Test that catches it: in `Library.test.tsx` item 11, open `?view=map`, count `/calendar/months`
  reads, press ライブラリ, expect one more read; and the reverse. Keying the effect on `url.view`
  (read when the face is map or library) fixes both.

### F3 (B). The Library's restore depth is consumed by the first effect run, so a double-run effect restores one page

- Claim: `frontend/useLibraryPages.ts:85-86` clears `restoreDepth` before the request is made.
  React's development StrictMode runs the effect, its cleanup (`current = false`) and the effect
  again; the second run reads `undefined` and loads one page, and `Shelves` then scrolls to the saved
  Y over a page that is too short (`LibraryFace.tsx:165-171`). `usePagedPhotos` clears its depth only
  after the load succeeds (`usePagedPhotos.ts:113`), so the shelf page does not have this.
- Condition: `next dev` (the App Router enables StrictMode in development). Production builds run
  effects once, so the owner's deployment is not affected; a later R-5 run against a dev server
  would report a false I9 failure for a Library left deeper than one page.
- Reproduced with a hook-level test (scratch): `renderHook(..., { wrapper: StrictMode })` with
  `restorePages: 2` ends with `pages === 1`; the pages requested were `[1, 1, 2]`, and the run that
  wrote is the one that asked for page 1 only.
- Frequency 0 in production, impact 3.
- Test that catches it: render the Library under `<React.StrictMode>` with a saved `library.loaded`
  of 2 and expect requests for `offset=0` and `offset=12`. Clearing the ref after `setHeld` (as
  `usePagedPhotos` does) fixes it.

### F4 (A). A pending Library restore scroll is applied to the shelves of a newer choice

- Claim: `frontend/LibraryFace.tsx:159` captures the saved `scrollY` once, when `Shelves` mounts,
  and `:165-171` applies it at the next `phase === "ready"`, whatever was chosen in between.
  `LibraryFace.tsx:68-71` stops passing `restore` once by, sort or target differ, but `Shelves` is
  not remounted by that (no `key` on it), so `pending` survives. A change of classification, sort or
  target made while the restore is still loading ends with the new answer drawn and the window
  scrolled to the old position. The shelf page does not do this: its `restoreScroll` is recomputed
  each render and becomes `undefined` when sort or target differ (`ShelfPage.tsx:187-188,394-399`).
- Condition: Back (or a reload) into a Library left several pages deep, and a menu or Target change
  before the restored pages have arrived (they are read one after another, `useLibraryPages.ts:91-95`,
  then hydrated in batches of 100, so a deep restore on the production drive takes a few round trips).
- Reproduced with the same page-level probe: saved `library: {loaded: 2, scrollY: 900, by: "month",
  sort: "newest"}`, opened `?view=library` with the month answer held, chose タグ, released; the
  three tag shelves are drawn and `window.scrollTo` was called with 900.
- Frequency 1, impact 3 (I9 "never under another classification, sort or target": the new list
  opens at a depth the viewer did not ask for; scrolling up recovers).
- Test that catches it: in `Library.test.tsx` I9, save `library: {loaded: 2, scrollY: 900, by: "month",
  sort: "newest"}`, load `?view=library` with the month answer held, choose タグ, release both, and
  expect no `scrollTo(900)`. Clearing `pending` when `restore` turns `null` (or keying `Shelves` on
  by, sort and target) fixes it.

### F5 (A, design question for the human). A write made on the calendar or the map leaves the trashed photo on the hidden Library

- Claim: the Library re-reads only on a write made through its own grids (`LibraryFace.tsx:73-76`,
  passed to each `PhotoShelf` → `FileGrid onRefresh`). A write through the calendar's or the map's
  context menu refreshes that face only; the Library stays mounted while hidden and is shown again
  with no request (item 5, `PhotoDiaryPage.tsx:430-450`). Item 11 does re-read the header's N on that
  entry (`PhotoDiaryPage.tsx:116-135`), so after the switch the header and the shelves disagree.
  This is two approved items meeting (item 5: "Library → Calendar → Library keeps the Library's
  loaded shelves without a request"; item 17 limits the Library's re-read to writes through its own
  photos), not a slip in the code, so it needs a decision rather than a fix by the implementer.
- Condition: Library open, then カレンダー (or 地図), open a day's list, trash or move a photo from it
  through the context menu, then ライブラリ. The photo is still on its shelf, the shelf's count is
  unchanged, and the header N is one lower. Opening the photo lands on a trashed file.
- Reproduced with the page-level probe: shelves drawn at `?view=library`, カレンダー, a day opened,
  the Library's first photo of `2026-10` marked gone on the server, `onRefresh` pressed on the
  calendar's grid, ライブラリ pressed. The first shelf still holds the trashed id, no
  `/library/shelves` request was made (1 before, 1 after), and the header reads `family · 112枚`.
- Frequency 3 (sorting and trashing from a day's list is the calendar's ordinary use; the Library
  is the face the page opens on), impact 5 (a stale shelf with a count that disagrees with the
  header; nothing is lost, and a reload or a classification change corrects it).
- Options, recommended first: (1) the page keeps a write counter bumped by every face's `onRefresh`,
  and the Library re-reads its loaded pages (the item 17 re-read, keeping depth and scroll) when it is
  entered with a counter newer than the one it last read under; entries with no write between them
  still make no request, so I14's "without a new request" holds for the case it describes. (2) Leave
  it, and record in the spec that a write on another face shows on the Library only after a reload.
- Test that catches it: the probe above, as an I13 case in `Library.test.tsx`.

## Checked, not a finding

- `decisions.md` ("What I could not check", writes pass) suspects that a shelf page with more than 100
  loaded photos would re-read with `limit>100`, which the route rejects. It does not:
  `usePagedPhotos.ts:54-65` (`fetchDepth`, unchanged in this range) asks for at most `MAX_BATCH`
  (100) ids per request and loops, so a re-read or restore of 150 sends `limit=100` then `limit=50`.
  The observed `limit=54/55/56` are single requests because they are under 100.
- `ShelfPage`'s restore cannot be applied under another sort or target: `restore` is recomputed per
  render (`ShelfPage.tsx:182-188`) and the scroll effect reads it (`:394-399`). `usePagedPhotos`
  holds `loadMore` off during a re-read (`busy`), so F1 does not apply to the shelf page.
- `useFirstLine` (`PhotoShelf.tsx:19-55`): hiding the cells after the first line does not change the
  first line's members (flex lines are filled greedily from the start), and hiding the tail only when
  a second line existed keeps a short shelf unstretched. A 12-photo first line that still does not
  fill the row needs photos narrower than about 0.43:1 (the widest case, a 72rem frame at a 200px line), so it is not reachable with
  camera photos or phone screenshots.
- `parsePageUrl` / `buildPageQuery` against the item 1 table, the calendar's URL producers
  (`CalendarView.tsx`, `SectionedGrids.tsx`) all carrying `view=calendar`, and the hidden calendar
  being handed `calendarUrl` while the Library is the face: consistent with items 1-3 and I7.
- Test edits in the range (`PhotoDiaryPage.test.tsx`, `DailyNotes.test.tsx`, `Target.test.tsx`,
  `UiPolishStates.test.tsx`, `pageUrl.test.ts`, `calendarPolish.spec.ts`, `page.spec.ts`) move
  no-query cases to `?view=calendar` or to the Library as section 7 says; no assertion was weakened.
  "Back to the no-query entry starts over" was replaced, since the no-query entry is now replaced by
  `?view=library`; the in-place fresh start keeps its own case in `Library.test.tsx` (item 5).

TOTAL: 5 findings
