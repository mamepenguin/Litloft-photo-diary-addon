# Code review r1 (frontend): Photo Diary app parity (SPEC-PD-023/024/025)

- Commit: `f573859` (addon `photo_diary`, branch feature/app-unify)
- Range: `f5aed25..f573859`, frontend and e2e only
- Core: Litloft develop `48479c94b` (`/Users/libre/Sources/video_share-pd-review`)
- Scope: `frontend/{LibraryFace,LibraryControls,PhotoDiaryPage,ShelfPage,PhotoShelf}.tsx`, `frontend/useTarget.ts`, `frontend/lib/{library,savedState,pageUrl}.ts`, `frontend/messages/`, `AppParity.test.tsx`, edited `Library.test.tsx` / `ShelfPage.test.tsx` / `TargetMembers.test.tsx`, `e2e/`
- Baseline: `NO_COLOR=1 pnpm exec vitest run src/addons/photo_diary` 18 files / 821 pass; `pnpm exec tsc --noEmit` clean
- Threat model: personal tool on a home LAN, the user is the owner, no attacker. A = silently wrong or broken in ordinary use. B = odd input, misuse, maintenance; no repro needed.

## df943f1 (three corrected acceptance cases)

Checked against the fixture (`AppParity.test.tsx:189-202`):

- `/^すべての写真/` for the default row: the core's row name carries its count; matcher only. No product effect.
- `shelvesDrawn(6)` -> 5 and (2) -> 1: photos tagged `beach` fall in 2026-10, 2026-08, 2026-07, 2026-06 and undated = 5 month shelves; `beach`+`family` is `a1` only = 1 shelf. The old numbers were wrong against the fixture; the new ones are right.
- The pending-row case: `useTarget.ts:210` still sets `selectedId = pendingId`, but the pending id's row can only be drawn from its own list, and that list's arrival resolves the id in the effect of the same commit (`useTarget.ts:118-142`). So the only state that draws a checked pending row is the single render between the list arriving and the effect running. The correction does not hide a product defect. The comment at `useTarget.ts:209` ("the menu checks its row") now disagrees with the spec; prose, noted only because it invites someone to "fix" the code toward it.

## Findings

How the observations below were made: a scratch test built from `AppParity.test.tsx`'s harness, in the gitignored copy `frontend/src/addons/photo_diary/` (deleted afterwards; the copy matches the addon tree again, and `git status` in the addon is clean). For F4, F5 and F6 the harness's synchronous `router.replace` was swapped for a queue the test drains by hand. That models Next's App Router, where a search-only `replace` refetches the page's RSC payload and so lands later. The harness and e2e fixture cannot show those cases, because both routers are synchronous. Mutations were made in the same copy, one at a time, and restored with `cmp`.

### F1. A write in the なし grid does not reach the Calendar's or the Map's open list (A)

- Claim: `LibraryFace.tsx:205` passes `onRefresh={refresh}` to `AllPhotos`, so the grid's context-menu write (`FileGrid onRefresh`, `LibraryFace.tsx:450`) re-reads only the grid and the count. It never calls `onWrite`. The shelves pass `onRefresh={wrote}` (`LibraryFace.tsx:225`), which bumps the page's write counter (`PhotoDiaryPage.tsx:186-190`). The hidden Calendar and Map re-read their open photo list only on that counter (`CalendarView.tsx:119-123`, `MapView.tsx:351-355`).
- Observed: open `?view=calendar&date=2026-07-03` (day list open), Library tab, press the grid's refresh (the write callback), Calendar tab. With 分類 撮影月 the Calendar sends `/calendar/months`, `/calendar/days`, `/photos`. With なし it sends only `/calendar/months` and `/calendar/days`, the same as with no write at all. The day list is not re-read.
- Condition in ordinary use: a day is open on the Calendar or a list is open on the Map. The viewer goes to the Library with なし, trashes a photo (or edits its tags or moves it) from the context menu, and goes back. The open list still shows the photo as it was, until a reload or another write.
- Frequency 3, impact 5 (the list is stale, for example a trashed photo is still listed; noticed when acted on). 3 x 5 = 15.
- Test: in AppParity, the `/photos` re-read after a write, for both the なし grid and a shelf (the scratch case above, as two rows).

### F2. The shelf page shows the filtered empty state under an empty Target (A)

- Claim: `ShelfPage.tsx` `ShelfPhotos` empty branch: `return tags.length > 0 ? <filteredEmpty> : <noPhotos>`. It has no `!empty` check. `LibraryFace.tsx:336` and `:440` do check it. Item 16 and I9 say that under an empty Target the body is what it is today (`noPhotos`).
- Observed: with saved Target `sf-shore` (video only, so `none=true`), `openShelf("?by=month&key=2026-07&tag=beach")` sends `none=true&by=month&key=2026-07...` (tag correctly unsent) and draws 条件に合う項目はありません, not 写真はありません.
- Condition in ordinary use: Library with a tag, See all, the shelf page's back link, then a Target choice of a Smart Collection with no image kinds, then browser Back into the shelf entry that carries the tag.
- Frequency 1, impact 2 (wrong empty wording; nothing can match).
- Test: one row in the shelf-page empty-state cases: empty Target plus a URL tag gives `noPhotos`.

### F3. On the shelf page, re-choosing the row in force no longer saves it (A, low)

- Claim: `ShelfPage.tsx` `chooseTarget` returns early on `id === target.selectedId`. Before this range, `onChoose` was `target.choose` (`git show f5aed25:frontend/ShelfPage.tsx:292`), which writes the saved id. The main page still does that on purpose (`PhotoDiaryPage.tsx:534-538`: "the saved id may still name a target that fell back").
- Observed: saved `sf-gone` (not in the list, so it falls back to default). Choosing すべての写真 on the shelf page leaves `readAppTarget` = `sf-gone`. Doing the same on the main page writes `default`.
- Condition in ordinary use: the saved Smart Collection or collection falls back (deleted, unusable, or its list failed to load), and the viewer picks すべての写真 on a shelf page to settle on it. On a later load where the list answers (after a failure), or after the collection is made usable again, the old Target comes back in force although the viewer chose All photos.
- Frequency 1, impact 3.
- Test: the shelf-page row of the "re-choosing the Target in force" cases, asserting the saved id after a fallback.

### F4. A Home tile can restart the page in place: second Library request, Library remount, count re-read (A, low)

- Claim: `onTargetHandled` (`PhotoDiaryPage.tsx:103-114`) builds the replace from `window.location.search`. A Home tile opens `?target=<id>` only, so the normalising replace to `?view=library&target=<id>` (`:466-475`) is issued at mount. If the Smart Collection or collection list answers before that replace lands, the handler reads `?target=<id>`, deletes `target`, and replaces to the bare pathname. The URL then reaches `""` without being the page's own replace (`ownTarget` is not set in the handler), so the in-place start-over (`:430-453`) runs. It clears the saved state, bumps `epoch` (the Library face remounts), bumps the count token and replaces again to `?view=library`.
- Observed (queued router): queue = [`?view=library&target=sf-trip`, bare pathname]. After both land the URL is `?view=library` and `/library/shelves` was sent 2 times. With the synchronous router it is sent once.
- Condition in ordinary use: every Home tile open where the list fetch through the rewrite answers before Next commits the RSC replace. Not measured on real Next.
- Frequency 3 (model only), impact 2 (a duplicate request and a skeleton flash; the final state is right).
- Test: a `?target=` open with the normalising replace held until after the list answers, asserting one `/library/shelves` and no start-over.

### F5. A tag toggle that has not landed is resurrected by the next replace (A, low)

- Claim: the main page's override is one slot keyed on `from === search` (`PhotoDiaryPage.tsx:133-144`). `replaceTags` (`:553-562`) and `chooseTarget` (`:540-548`) build their URL from `search`, not from the replace still in flight. A Target choice made before a tag toggle has landed queues [toggle URL with the tag, choice URL without it]. When the first lands, the override no longer matches, so the chosen tags are the landed URL's.
- Observed (queued router): toggle beach, then choose Album before the toggle lands. After the first landing a `/library/shelves` request goes out with `tag=beach&collection=Album`. After the second, `collection=Album` only. This breaks I5's "no request after a Target choice carries a tag chosen before it" for one round trip. Two quick toggles in the open tag menu (it stays open) should do the same by the same path (a request for the first tag alone in between); that case is reasoned from the code, not run.
- Condition in ordinary use: a second tag click, or a Target choice, within one replace round trip. The final state is right. Clips has the same pattern (`switchedFrom === search`).
- Frequency 1, impact 2.
- Test: none in the synchronous harness can show it; a queued-router case like the scratch one would.

### F6. Shelf page: a Target choice under a tag sends the shelf request twice (A, trivial)

- Claim: `ShelfPage.tsx` `tags` is `tagOverride.tags` until the URL lands, then `link.tags`: a new, equal, empty array. `params` (`useMemo(() => withChosenTags(target, tags), [target, tags])`) changes identity, so `fetchIds` changes under the same `listKey`, and `usePagedPhotos` (`usePagedPhotos.ts:135-138`) treats that as a refresh and reloads. The main page avoids this by keeping the tag array's identity (`PhotoDiaryPage.tsx:132-141`).
- Observed (queued router): `?by=month&key=2026-07&tag=beach`, choose Album. Before the replace lands one `collection=Album...` request goes out. After it lands the same request goes out again.
- Frequency 3, impact 1.
- Test: count the shelf requests after a shelf-page Target choice with the replace landing later.

### F7. Test gap: the Library tab after a Target choice made on the Calendar or the Map (B)

- Mutation: delete `setLibraryTags([])` in `chooseTarget` (`PhotoDiaryPage.tsx:544`). AppParity, and the full suite (821), still pass.
- Observed with the mutation: `?view=library&tag=beach`, Calendar tab, choose Trip, Library tab, and the URL is `?view=library&tag=beach`. Without the mutation it is `?view=library`. Spec 14 and section 3 forbid the Library tab link carrying tags after a Target choice. The I5 case at `AppParity.test.tsx:1150` makes the choice on the Library only, where the sync effect at `:145-147` hides the deletion.
- Defect it would miss: the Library opens filtered by the old Target's tag. Frequency 3, impact 3.
- Test: the same case as `:1150`, with the Target choice made on the Calendar (and on the Map).

### F8. Test gap: the Target-choice override that keeps the old tags out of requests is never exercised (B)

- Mutation: delete `setTagOverride({ from: search, tags: [] })` in `PhotoDiaryPage.tsx:543` or `ShelfPage.tsx:249`. Both survive AppParity and the full suite. With a synchronous router the URL lands within the same call, so the override never decides anything.
- Defect it would miss under real Next: after every Target choice made with a tag chosen, one round of requests (shelves or なし, shelf page, tag counts) goes out under the new Target with the old tag (I5, item 14). Frequency 5 if removed, impact 2.
- Test: a Target choice with the replace held, asserting that no request before the URL lands carries the tag.

### F9. Test gaps that I checked and that matter little in ordinary use (B)

- Main-page restore ignoring tags (`LibraryFace.tsx:135` to `true`) and shelf-page restore ignoring tags (`ShelfPage.tsx:212` to `true`): both survive the full suite. Revised SPEC-PD-018 I9 says "never under ... other chosen tags". Reaching a mismatch needs a Back that remounts the page on an entry whose tags differ from the saved state's (for example a long-press history jump). Frequency 0 to 1, impact 3.
- `pendingId === null &&` on `listedFolder` (`useTarget.ts:173`) removed: the suite passes. With a saved member Target and `?target=`, the saved Target's members would be evaluated while the id is pending, then the applied one's (I9 of `target-members.md` via item 20). Frequency 1, impact 1 (extra evaluation).
- Caught: `if (target?.none) return target` (`lib/library.ts:67`), `ready` in `conditionsKey` (`LibraryFace.tsx:163`) and `params.set("target", ...)` in `go` (`PhotoDiaryPage.tsx:412`) each fail AppParity when removed.

### F10. A pending id can outlive its drop, and be saved as the Target (B)

- `go("replace")` re-adds `target=<pendingId>` (`PhotoDiaryPage.tsx:412`). The in-place start-over calls it from a layout effect (`:452`), which runs before the passive effect that drops the pending id on a navigation (`:479-482`). If the viewer reaches the bare page URL (the sidebar row) while a Home tile's id is still pending, the replaced URL is `?view=library&target=<id>` with the id already dropped. A reload then applies the dropped id, which section 3 forbids ("a pending id applied after a navigation").
- `targetId.current = target.selectedId` (`:119-120`) is the pending id while pending (`useTarget.ts:210`). So a `flush` while pending (leaving the page before the list answers) saves `target: <pendingId>`, and the next restore is matched against a Target that was never in force.
- Both need an action inside the list's load time. Read from the code, not run. Frequency 0, impact 2.

### F11. e2e: the 44px height check on the Library's controls at 375px was dropped (B)

- `e2e/library.spec.ts` (SPEC-PD-019 at 375px) no longer asserts that the classification and sort buttons are at least 44px tall (`library.md:351`). The core's `ToolbarMenu` gives `min-h-11` only under `pointer-coarse` (`ToolbarMenu.tsx:241-244`), so a desktop Chromium run cannot show it. On a phone (coarse pointer) the core's height holds. The spec does not list `library.md`'s 44px clause under Revises. Frequency 0, impact 1. Not a product defect; record it, or revise the clause to "the core's touch height".

TOTAL: 11 findings
