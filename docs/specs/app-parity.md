# Photo Diary: the Library's view per Target, a tag filter, and Home shortcuts

SPEC-ID: SPEC-PD-023
SPEC-ID: SPEC-PD-024
SPEC-ID: SPEC-PD-025

Approval:

## Summary

Between 2026-11-19 and 2026-11-20 the core's Video and Reading apps and the knowledge
addon's Notes and Clips gained three things Photo Diary lacks. The view a viewer chose is kept per Target. The
Library has a tag filter beside the view menus. A Target can be put on Home as a tile
that opens the app on it. Photo Diary still keeps one classification and one sort per drive in its
own words (並べ替え), has no filter, and passes no Home entry to the Target menu. This spec
brings the three to Photo Diary with the core parts the other apps use. The user is the one
person who runs Litloft.

- **SPEC-PD-023**: the Library's 分類 and 並び順 are the core's `GroupMenu` / `SortMenu` in
  the core's `LibraryControlRow`, kept per Target with the core's `readTargetView` /
  `writeTargetView`; 分類 gains なし (every photo of the Target in one grid).
- **SPEC-PD-024**: a tag filter (the core's `FilterMenus`, tag menu only) on the Library
  and the shelf page, carried in the URL as `tag`.
- **SPEC-PD-025**: the Target menu offers Put on Home / Remove from Home (the core's
  `homeEntry`), and the page opens on `?target=<id>`.

**Order.** No core change. Every core part used is on `develop` as of `48479c94b`
(SPEC-CORE-145 to 148, 153, 154). Photo Diary is not a core submodule, so its pull request
merges alone.

Out of scope: a state filter (photos have no progress; decided by the user); filters on the
Calendar and the Map (decided by the user: Library and shelf page only); Video and Reading
moving their filters to the URL (a separate spec, if wanted); daily notes.

## Agreed design

No new artboard (agreed). The control row, the menus, the tag menu, the Home row in the
Target menu and the Home tile are the core's parts as Video, Reading and Clips draw them.
The filtered empty state is the core's `EmptyState` with the `Search` icon and the title
条件に合う項目はありません / Nothing matches these filters, as Clips draws it, in Photo
Diary's own messages. The なし grid is the shelf page's grid (the core's justified
`FileGrid`), as Video's なし is its See all grid.

## Definitions

- **Target in force, Target choice, fallback.** As in `app-target.md` and
  `target-members.md`. A **Target choice** is choosing, in the Target menu, a row other
  than the one in force; re-choosing the Target in force, a fallback to `default`, and a
  member evaluation are not Target choices (SPEC-CORE-145).
- **View.** The pair (classification, sort) of the Library. Classifications: `month`
  撮影月 (default), `tag` タグ, `collection` コレクション, `folder` フォルダ, `all` なし.
  Sorts: `newest` 新しい順 (default), `oldest` 古い順.
- **View key.** The view is read and written with the core's `readTargetView(APP, drive,
  targetId)` / `writeTargetView(...)`, `APP = { addon: "photo_diary" }`, fields `group`
  (the classification) and `sort`. The storage key is the core's
  `litloft.addon.photo_diary.view.<drive>`.
- **Old per-drive keys.** `litloft.addon.photo_diary.classification.<drive>` and
  `litloft.addon.photo_diary.sort.<drive>`, written by Photo Diary before this change.
- **Chosen tags.** The URL's `tag` values on the main page with `view=library` and on the
  shelf page, in URL order, each once (compared with `toLowerCase`), empty values dropped.
- **Target's own tags.** The `tag` values of the Target in force's listing parameters
  (`TargetParams.tag`), empty for the default, a collection and a member target.
- **Home entry key.** `photo_diary`, the key `addonNavEntries` gives Photo Diary's manifest
  navigation entry.

## Required items

### 1. Normal flow

**SPEC-PD-023 (view per Target).**

1. *Controls.* The Library face's control row is the core's `LibraryControlRow` with the
   tag filter (SPEC-PD-024) as `filters` and, as `children`, the core's `GroupMenu`
   (label 分類 / Group By, `LayoutList` icon) then `SortMenu` (label 並び順 / Sort By,
   `ArrowDownUp` icon), with Photo Diary's option labels: 撮影月 / Month taken, タグ / Tag,
   コレクション / Collection, フォルダ / Folder, なし / None; 新しい順 / Newest first, 古い順
   / Oldest first. The shelf page's sort control is the core's `SortMenu` with the same
   options. `LibraryControls.tsx`'s own menus and the messages only they used
   (`photoDiary.classification`, `photoDiary.sort.label`) are removed.
2. *Read.* The view in force is, field by field: a Back restore's saved view
   (`library.md` item for restore, unchanged) when it applies; else the Target in force's
   stored value when it is one Photo Diary offers; else, for the `default` Target only, the
   old per-drive key's value when Photo Diary offers it; else the default. The Target whose
   view is read is the Target in force: under a fallback to `default` (gone, unusable) the
   `default` Target's; under a member Target that is `failed` or `tooLarge`, that Target's
   (it stays in force, `target-members.md` item 7).
3. *Write.* Choosing a value in the Library's 分類 or 並び順 menu writes that field for the
   Target in force and nothing else. Nothing else writes the view key: not a page load, a
   Target choice, a fallback, a restore, or a sort change on the shelf page (which replaces
   the shelf page's URL as today). Nothing writes the old per-drive keys.
4. *Target choice.* On a Target choice the Library shows the new Target's view as read in
   2, with no request sent under the previous Target's view (`library.md` I8 holds).
5. *なし.* With `all`, the Library face shows no shelves: one grid of every photo of the
   Target (under the chosen tags), from `/library/shelf?by=all&key=all` with the sort in
   force, 40 photos per page, more on scroll, as the shelf page pages today. Dated photos
   come in capture order for the sort, undated photos after every dated one in both sorts
   (`library.md` I4). Its loaded depth and scroll are restored on Back like the shelves'.
   It has no See all. The control row stays above the grid.
6. *Backend.* `/library/shelves` and `/library/shelf` (`GET` and `POST`) accept `by=all`.
   `/library/shelf?by=all` takes only `key=all` (anything else 422); its `total` is the
   number of photos of the target (under the tag filter of SPEC-PD-024), and its order is
   item 5's. `/library/shelves?by=all` answers one shelf `{key: "all", label: "", count,
   file_ids}` (no shelf when the target holds no photo), used by nothing in the page but
   kept for the route's symmetry.

**SPEC-PD-024 (tag filter).**

7. *Menu.* The control row's `filters` is the core's `FilterMenus` with `state: null`
   (no state menu), `tags` = the chosen tags, `excludeTags` = the Target's own tags, and
   `loadCandidates` = the core's tag-counts request under every condition in force: the
   Target (`getTagCounts` with `type=["image"]` and the Target's listing parameters with
   `tag` = the Target's own tags plus the chosen tags; `getTagCountsWithFileIds` with the
   members and `type=["image"]` plus the chosen tags for a ready member target; nothing
   sent before the Target is ready). Below 640px the tag menu is alone on the first row in
   the left half (SPEC-CORE-147 I8). `onViewerRejected` is unreachable (no `watch` is sent)
   and does nothing.
8. *URL.* The chosen tags live in the URL as `tag` (repeated): on the main page only with
   `view=library`, and on the shelf page. Toggling a tag or clearing replaces the URL, with
   no history entry, and keeps every other parameter. The main page's other faces carry no
   `tag`: the Calendar and Map tab links and every calendar URL drop it, and the Library
   tab link carries none (as Clips' tab links, SPEC-ADDON-151).
9. *Requests.* Every Library request (`/library/shelves` for the shelves, `/library/shelf`
   for なし) and the shelf page's `/library/shelf` carry the chosen tags: with a
   listing-parameter or default Target as `tag` = the Target's own tags then the chosen
   tags, compared folded (the core's `mergeLibraryTags`); with a collection Target as
   `tag` = the chosen tags beside `collection`; with a member Target as `tag` = the chosen
   tags on the `POST` query string. A photo matches when it carries every tag in `tag`,
   folded as the core's listing `tag` filter folds (AND, as Reading and Clips).
10. *Backend.* `POST /library/shelves` and `POST /library/shelf` accept `tag` (repeated)
    on the query string and apply it to the member set exactly as the `GET` applies its
    `tag`. Every other target query parameter on a `POST` still answers 422, and `tag` on
    any other `POST` route still answers 422.
11. *Links.* A shelf's See all link carries the chosen tags; the shelf page's back link
    is `?view=library` plus the page's chosen tags; going back by the browser restores the
    URL it had.
12. *Target choice.* A Target choice removes `tag` from the URL in the same replace the
    page already makes, or in a replace of its own when it makes none, with no history
    entry. Re-choosing the Target in force, a fallback, a member evaluation and a 分類 or
    並び順 choice keep it.
13. *Empty.* When the Library (shelves or なし) or the shelf page has no photo while a tag
    is chosen, its body is the agreed filtered empty state; with no tag chosen it is what
    it is today.
14. *Count.* The header's count stays the Target's total and ignores the filter, as in the
    core's apps (SPEC-CORE-147).
15. *Restore.* A Back restore applies only when the URL's chosen tags equal the ones
    saved with it; otherwise the Library starts at the top. The saved state records them.

**SPEC-PD-025 (Home shortcuts).**

16. *Menu row.* The main page and the shelf page pass `homeEntry: "photo_diary"` to
    `AppHeader`'s Target menu while the Target is known (not looking up, no `?target=`
    pending), as Video and Reading pass theirs. The core draws Put on Home / Remove from
    Home for a non-default Target in force and puts the tile on Home (SPEC-CORE-153/154);
    Photo Diary adds nothing else.
17. *Opening.* The main page, on any view, reads `?target=<id>`. From its first render
    until the id is applied or ignored the id is **pending**: no photo, count, shelf or
    tag-counts request goes out, the default Target's included; each face shows what it
    shows while the look-up runs; the Target control shows `…`.
18. *Resolve.* The id is applied when it names a Smart Collection in the loaded list that
    `isUsable` accepts, or `collection:<id>` of a collection in the loaded list. Applying
    is a Target choice (`choose(id)`): it writes Photo Diary's Target key for the drive and
    puts that Target's view in force. Otherwise it is ignored: `default`, an empty value,
    an id not in the list, an unusable Smart Collection, or the list failing to load; the
    saved Target stays and nothing is written. The id is never sent to a backend.
19. *URL.* When the id is applied or ignored, `target` is removed from the URL by a replace
    with no history entry, keeping every other parameter; a Target choice's `tag` removal
    (12) is part of the same replace. A URL whose only parameter is `target` is a fresh
    start (`library.md` I7): the saved state is cleared and the URL becomes `?view=library`
    in that replace.
20. *Dropped.* A pending id is dropped, unwritten, when the viewer chooses a Target in the
    menu (the choice wins) or navigates to another URL (a tab, a link, Back). It is held in
    the page's state, not read again from the URL, so the page's own replaces do not drop
    it.
21. *Shelf page.* The shelf page does not read `?target=` and leaves it in its URL.

### 2. Failure cases

- **localStorage throws or holds unparsable JSON** under the view key: the Library shows
  the defaults with no error; a menu choice made while writes fail stays shown until the
  next mount, drive change or Target change (SPEC-CORE-145 I5).
- **Tag-counts fails or is slow.** The core's menu shows its skeleton, then Try again; the
  chosen tags and the Library's results stay (SPEC-CORE-147 I9).
- **A chosen tag no photo carries** (typed in the URL, or a tag renamed): the Library is
  the filtered empty state; the tag is listed first in the menu at count 0 and can be
  removed.
- **`/library/shelf?by=all` with a key other than `all`**, or `by=all` on the shelf page's
  URL: 422 from the backend; the shelf page shows its invalid-link state, as for any
  malformed key today.
- **`?target=` while the Smart Collection or collection list fails**: ignored (18); the
  list's retry later applies the saved Target, never the ignored id.
- **A member Target applied from `?target=` that ends `failed` or `tooLarge`**: it was
  applied; the page shows what it shows today for that saved Target.
- **The Home row's `GET` or `PUT` fails**: the core's behaviour (no row for that open; the
  toast `drive.homeShortcutFailed`).

### 3. States

- View per (drive, Target): **unset** → **set** on a menu choice. Unset reads the old
  per-drive value (default Target only) or the default.
- Chosen tags: exactly the URL's; there is no other copy. A full page load keeps them
  (they are in the URL); opening another drive's page does not carry them.
- `?target=` per page load: **pending** → **applied** or **ignored**; a pending id is
  dropped by a menu choice or a navigation (20). Not allowed: an ignored id applied later;
  a pending id applied after a navigation or a menu choice.

### 4. Data read and written

- localStorage: `litloft.addon.photo_diary.view.<drive>` (core format, `{targetId: {group,
  sort}}`), written by 3 only. The old per-drive keys are read for the `default` Target
  and never written or removed. `litloft.addon.photo_diary.target.<drive>` is written by a
  Target choice, as today, and by an applied `?target=`.
- sessionStorage: the page's saved state (`photo_diary:state:<drive>`) gains the chosen
  tags in its `library` entry; the shelf page's `photo_diary:shelf:<drive>` gains them
  too. An entry saved before this change has none, which equals no tag chosen.
- Server: the core's `home_app_shortcuts` through the core's menu row; nothing in Photo
  Diary's own database.

### 5. External services

None. Tag counts are the core's `tag-counts` route.

### 6. Authorization

Unchanged. The `tag` accepted on two `POST` routes narrows the member set, which is still
narrowed to the drive's active images (`target-members.md`); a tag of another drive
matches no photo of this drive. `tag-counts` validates the drive as the core does.

### 7. Effect on existing features

- A viewer who had set a classification or sort on a drive keeps it under the `default`
  Target; under a Smart Collection or collection they see 撮影月 / 新しい順 once and choose
  again (as Video, Reading and Clips after SPEC-CORE-145).
- `library.md`'s per-drive view (I10) becomes per Target (Revises).
- A load with only `?target=` is a fresh start, like a load with no query.
- The Calendar and the Map are unchanged; their URLs never carry `tag`.

### 8. Error behavior

As in 2. No new error string: the filtered empty title is new text in Photo Diary's
messages (`photoDiary.library.filteredEmpty` / en "Nothing matches these filters").

### 9. User-visible behavior

- The Library's row reads 分類 / 並び順 like the other apps, with a タグ menu on its left.
- 分類 offers なし.
- Each Smart Collection and collection remembers its own 分類 and 並び順.
- The Target menu offers ホームに置く / ホームから外す; the Home tile reads
  `フォトダイアリー・<Target>` and opens Photo Diary on that Target.
- `README.md` (the addon's user page) gains a sentence each: the tag filter and that it is
  in the link, the view kept per Target, and Put on Home.

### 10. Non-functional

- `by=all` pages by `offset` like the other shelf pages; at 50,000 photos with 10,000
  member ids its first page answers within 1 s, measured once before merge (as
  `target-members.md` section 10).
- One tag-counts request per menu open and one per toggle while it is open.

## Touch points

- `backend/router.py` (`ShelfBy` gains `all`; `_shelf_filter` / shelves and shelf
  for `all`; `tag` on `POST /library/shelves` and `POST /library/shelf` and the
  `_no_target_parameters` check for those two), `backend/schemas.py` if a model changes,
  `tests/` (new `by=all` and `POST` `tag` cases)
- `frontend/lib/library.ts` (`CLASSIFICATIONS` gains `all`; the per-drive read/write
  replaced by the core's view store; `ShelfUrl` and `shelfPageQuery` gain `tags`),
  `frontend/lib/pageUrl.ts` (`tag` on `view=library`), `frontend/lib/savedState.ts` (the
  chosen tags), `frontend/LibraryControls.tsx` (replaced by the core's menus),
  `frontend/LibraryFace.tsx` (control row, なし grid, filtered empty), `frontend/ShelfPage.tsx`
  (`tag`, `SortMenu`, `homeEntry`, back link), `frontend/PhotoDiaryPage.tsx` (view per
  Target, `tag` removal on a Target choice, `?target=` pending/apply/ignore, `homeEntry`),
  `frontend/useTarget.ts` (applying an id, pending), `frontend/api.ts` (`tag` on the
  library requests, tag-counts), `frontend/useLibraryPages.ts`, `frontend/usePagedPhotos.ts`,
  `frontend/messages/{ja,en}.json`, and their tests
- `e2e/` (the Library control row at 390 / 1280px; the page fixture if rebuilt)
- `README.md`, `docs/specs/INDEX.md`
- Core names used: `LibraryControlRow`, `GroupMenu`, `SortMenu` (`components/appshell/ViewMenus`),
  `FilterMenus`, `mergeLibraryTags`, `readTargetView`, `writeTargetView`, `getTagCounts`,
  `getTagCountsWithFileIds`, `EmptyState`, `AppHeader` / `TargetMenu`'s `homeEntry`.
  No core file is edited.
- Rules passed through: core `.claude/rules/design-decisions.md` (drive boundary; no
  core-to-addon dependency), `frontend-conventions.md`, `backend-conventions.md`. No
  protected path is edited.

## Invariants

I1. Choosing a value in the Library's 分類 or 並び順 menu writes that field under
`litloft.addon.photo_diary.view.<drive>` for the Target in force only; every other Target's
entry, every other drive's key and the old per-drive keys are unchanged; and no page load,
Target choice, fallback, restore, `?target=` or shelf page sort change writes that key.

I2. The view shown is the Back restore's when it applies, else the Target in force's stored
value, else (the `default` Target only) the old per-drive value, else 撮影月 / 新しい順;
after choosing view A on Target X and B on Y, switching to X shows A and back to Y shows
B; and from the Target choice on no Library request goes out with another Target's view.

I3. Under any Target and tag filter, the なし grid over all its pages holds every photo the
Library's shelves hold for the same Target and tags, each once, dated photos in capture
order for the sort then undated photos; and `/library/shelf?by=all&key=all`'s `total`
equals the sum of the `month` shelves' counts for the same conditions.

I4. With tags T chosen, every Library request, every See all link, the shelf page's request
and its back link carry all of T; every photo shown carries every tag in T (folded); and no
Calendar or Map request or URL carries T.

I5. A tag toggle, a clear and a Target choice change the URL by replace with no history
entry; a Target choice leaves no `tag`; re-choosing the Target in force, a fallback, a
member evaluation and a 分類 or 並び順 choice leave `tag` as it was; a reload keeps it.

I6. `POST /library/shelves` and `POST /library/shelf` with `tag` answer what the `GET`
answers for a collection holding exactly the posted ids plus that `tag`; any other target
query parameter on any `POST`, or `tag` on any other `POST` route, answers 422; ids or tags
of another drive select nothing.

I7. Once the latest tag-counts answer has arrived, the tag menu lists the chosen tags first
then exactly the answer's other tags minus the Target's own tags; no tag-counts request
goes out before the Target is ready; and an answer for conditions no longer in force is
never drawn.

I8. The main page with `?target=<id>` sends no photo, count, shelf or tag-counts request,
the default Target's included, until the id is applied or ignored; an applied id writes
Photo Diary's Target key for that drive and nothing else; an ignored one writes nothing;
afterwards the URL has no `target`, with no history entry added, and a URL that held only
`target` is `?view=library` with the saved state cleared.

I9. A pending `?target=` is dropped unwritten by a menu choice or a navigation, and the
page's own replaces do not drop it; the shelf page leaves `target` in its URL and behaves
as without it.

I10. The main page and the shelf page pass `homeEntry: "photo_diary"` while the Target is
known, so a non-default Target in force shows Put on Home / Remove from Home in the Target
menu and a shortcut put there opens Photo Diary with that Target.

I11. In the Library at 390px the tag menu is alone on the first row in the left half and the
two view menus share the second row at equal widths (within 1px); from 640px up the filter,
a 20px gap, then the view menus; at 1440, 1280, 1024 and 390px in ja and en nothing scrolls
horizontally, measured in a real browser.

## Revises

SPEC-PD-018 I7. A load with no query, or whose only parameter is `target`, shows the Library and leaves the URL at `?view=library` with no added history entry; `?view=calendar`, and a query with `month`, `date` or `undated` and no `view`, show the calendar; every URL the calendar produces carries `view=calendar` and no `tag`; and no hidden face changes the URL.
SPEC-PD-018 I9. Going back from a photo opened in the Library or on the shelf page, reloading `?view=library`, and the shelf page's back link restore the classification, sort, loaded depth and scroll position left there once the target is ready (after a retry too; never while a member target has failed or is too large), never on another drive and never under another target, another classification or sort, or other chosen tags.
SPEC-PD-018 I10. The classification and sort chosen for a Target on a drive are in force for that Target on that drive's next load and not for another Target or drive; a sort changed on the shelf page changes neither.

## Checked, no action

- **A state filter.** Not offered (user's decision): photos have no watch or read progress,
  and Clips' trust has no photo counterpart.
- **Filters on the Calendar and the Map.** Not offered (user's decision); the Library and
  shelf page only, as in the other apps.
- **Filters in memory like Video and Reading.** Not chosen (user's decision): Photo Diary
  restores its faces from the URL and the back link already, so the URL fits it, and it
  needs no core change. The core's store is keyed by the built-in app ids only.
- **Keeping `tag` on the Library tab link.** Not done, as Clips: the faces are separate
  places and the Calendar and Map are unfiltered; a reload or Back keeps the filter.
- **A grid page size of 60 for なし, as Video.** 40, as Photo Diary's shelf page, so the
  なし grid and the shelf page page the same way.
- **Writing the old per-drive keys, or removing them.** Neither: read for the `default`
  Target only, as SPEC-CORE-145 does for the other apps; they are a few bytes.
- **Pruning view entries of deleted Targets.** Not done, as SPEC-CORE-145.
- **The header count under a filter.** Stays the Target's total, as the other apps.
- **`?target=` on the shelf page.** Not read, as Video's and Reading's See all pages; Home
  tiles open the main page.
- **Ledger rows SPEC-PD-018 to 020 still `approved`.** The Library is merged (#11); setting
  them `implemented` is a ledger fix, done in this branch's ledger commit.
- **A new design.** Agreed: the core's parts.
