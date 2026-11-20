# Photo Diary: the Library's view per Target, a tag filter, and Home shortcuts

SPEC-ID: SPEC-PD-023
SPEC-ID: SPEC-PD-024
SPEC-ID: SPEC-PD-025

Approval: sha256:c5fa24046416441bf022b1fdc95e5368f1008702211930740093ff4ba8e45eb7 Yuichi Senga 2026-11-21

## Summary

Between 2026-11-19 and 2026-11-20 the core's Video and Reading apps and the knowledge
addon's Notes and Clips gained three things Photo Diary lacks. The view a viewer chose is
kept per Target. The Library has a tag filter beside the view menus. A Target can be put on
Home as a tile that opens the app on it. Photo Diary still keeps one classification and one
sort per drive in its own words (並べ替え), has no filter, and passes no Home entry to the
Target menu. This spec brings the three to Photo Diary with the core parts the other apps
use. The user is the one person who runs Litloft.

- **SPEC-PD-023**: the Library's 分類 and 並び順 are the core's `GroupMenu` / `SortMenu` in
  the core's `LibraryControlRow`, kept per Target with the core's `readTargetView` /
  `writeTargetView`; 分類 gains なし (every photo of the Target in one grid).
- **SPEC-PD-024**: a tag filter (the core's `FilterMenus`, tag menu only) on the Library,
  carried in the URL as `tag` and applied on the shelf page it links to.
- **SPEC-PD-025**: the Target menu offers Put on Home / Remove from Home (the core's
  `homeEntry`), and the page opens on `?target=<id>`.

**Order.** No core change. Every core part used is on `develop` as of `48479c94b`
(SPEC-CORE-145 to 148, 153, 154). Photo Diary is not a core submodule, so its pull request
merges alone.

Out of scope: a state filter (photos have no progress; decided by the user); filters on the
Calendar and the Map (decided by the user: the Library and its shelf pages only); a tag
menu on the shelf page (decided by the user, as the other apps' shelf pages); Video and
Reading moving their filters to the URL (a separate spec, if wanted); daily notes.

## Agreed design

No new artboard (agreed). The control row, the menus, the tag menu, the Home row in the
Target menu and the Home tile are the core's parts as Video, Reading and Clips draw them.
The filtered empty state is the core's `EmptyState` with the `Search` icon and the title
条件に合う項目はありません / Nothing matches these filters, as Clips draws it, in Photo
Diary's own messages. The なし grid is the shelf page's grid (the core's justified
`FileGrid`). The shelf page keeps its quiet sort menu in the header's actions (decided by
the user), with the wording 並び順 / Sort By.

## Definitions

- **Target in force, Target choice, fallback.** As in `app-target.md` and
  `target-members.md`. A **Target choice** is choosing, in the Target menu, a row other
  than the one in force; re-choosing the Target in force, a fallback to `default`, and a
  member evaluation are not Target choices (SPEC-CORE-145).
- **Target known.** The look-up of `app-target.md` item 4 has ended and no `?target=` is
  pending (SPEC-PD-025). **Ready** is as `target-members.md` defines it (known, and a
  member Target's members `ready`).
- **Empty Target.** A Target whose photo requests send `none=true` (`app-target.md`, and a
  member Target whose kinds hold no image).
- **View.** The pair (classification, sort) of the Library. Classifications: `month`
  撮影月 (default), `tag` タグ, `collection` コレクション, `folder` フォルダ, `all` なし.
  Sorts: `newest` 新しい順 (default), `oldest` 古い順.
- **View key.** The view is read and written with the core's `readTargetView(APP, drive,
  targetId)` / `writeTargetView(...)`, `APP = { addon: "photo_diary" }`, fields `group`
  (the classification) and `sort`, stored under `litloft.addon.photo_diary.view.<drive>`.
- **Old per-drive keys.** `litloft.addon.photo_diary.classification.<drive>` and
  `litloft.addon.photo_diary.sort.<drive>`, written by Photo Diary before this change.
- **Chosen tags.** The URL's `tag` values on the main page with `view=library` and on the
  shelf page, in URL order, each once (compared with `toLowerCase`), empty values dropped.
- **Target's own tags.** The `tag` values of the Target in force's listing parameters
  (`TargetParams.tag`); empty for the default, a collection and a member Target.
- **Library tags.** The chosen tags the Library face last had in this mount of the page
  (empty at mount unless the URL loaded with `view=library` carries `tag`).
- **Home entry key.** `photo_diary`, the key `addonNavEntries` gives Photo Diary's manifest
  navigation entry.

## Required items

### 1. Normal flow

**SPEC-PD-023 (view per Target).**

1. *Controls.* Once the Target is known, the Library face's control row is the core's
   `LibraryControlRow` with the tag filter (SPEC-PD-024) as `filters` and, as `children`,
   the core's `GroupMenu` (label 分類 / Group By, `LayoutList` icon) then `SortMenu`
   (label 並び順 / Sort By, `ArrowDownUp` icon), with Photo Diary's option labels: 撮影月 /
   Month taken, タグ / Tag, コレクション / Collection, フォルダ / Folder, なし / None; 新しい順
   / Newest first, 古い順 / Oldest first. While the Target is not known (the look-up runs
   or a `?target=` is pending), the face draws its loading shelves and no control row; the
   row appears once the Target is known, so no choice can be written to a Target about to
   be replaced. Today the row is drawn during the look-up too (section 7). The shelf page's sort
   menu stays where and as it is, with its label 並び順 / Sort By. `LibraryControls.tsx`'s
   classification menu and the message only it used (`photoDiary.classification`) are
   removed; `photoDiary.sort.label` is replaced by the core's `appView.sortBy`.
2. *Read.* The view in force is, field by field: the Target in force's stored value when it
   is one Photo Diary offers; else, for the `default` Target only, the old per-drive key's
   value when Photo Diary offers it; else the default. The Target whose view is read is the
   Target in force: under a fallback to `default` (gone, unusable), the `default` Target's;
   under a member Target that is evaluating, `failed` or `tooLarge`, that Target's (it stays
   in force, `target-members.md` item 7).
3. *Restore.* A Back restore (`library.md`) applies its loaded depth and scroll only when
   its saved Target, classification, sort and chosen tags equal those in force; it never
   sets the view.
4. *Write.* Choosing a value in the Library's 分類 or 並び順 menu writes that field for the
   Target in force and nothing else. Nothing else writes the view key: not a page load, a
   Target choice, a fallback, a restore, `?target=`, or a sort change on the shelf page
   (which replaces the shelf page's URL as today). Nothing writes the old per-drive keys.
5. *Target choice.* On a Target choice the Library shows the new Target's view as read in
   2, with no request sent under the previous Target's view (`library.md` I8 holds).
6. *なし.* With `all`, the Library face shows no shelves: one grid of every photo of the
   Target under the chosen tags, from `/library/shelf?by=all&key=all` with the sort in
   force, 40 photos per page, more on scroll, as the shelf page pages today. Dated photos
   come in capture order for the sort, undated photos after every dated one in both sorts
   (`library.md` I4). Its loaded depth and scroll are restored on Back as the shelves' are
   (3). It has no See all. The control row stays above the grid. With no photo and no tag
   chosen, its body is the shelves' existing empty state (`noPhotos`). It draws as the
   shelf page's grid draws today: a skeleton grid while its first page loads; the
   Library's `RetryButton` under the control row when its first page fails (as the shelves'
   first load); the shelf page's later-page failure with its retry when a later page fails;
   and a failed re-read after a write keeps what is drawn with Retry above it
   (`library.md` I13).
7. *Backend.* `/library/shelves` and `/library/shelf` (`GET` and `POST`) accept `by=all`,
   each with its own branch (never the collection or folder path).
   `/library/shelf?by=all` takes only `key=all` (any other key 422); its `total` is the
   number of photos the conditions select and its order is item 6's. `/library/shelves?by=all`
   answers one shelf `{key: "all", label: "", count, file_ids}`, or none when no photo is
   selected; the page does not use it.
8. *Shelf page.* `by=all` is not a shelf page: the shelf page's URL check rejects it on the
   client and shows its invalid-link state, as for a malformed key today. Shelf titles
   never see `all`.

**SPEC-PD-024 (tag filter).**

9. *Menu.* Once the Target is known, the control row's `filters` is the core's
   `FilterMenus` with `state: null` (no state menu), `tags` = the chosen tags,
   `excludeTags` = the Target's own tags, `conditionsKey` changing with the Target in
   force, its members' readiness and the chosen tags, and `loadCandidates` = the core's
   tag-counts request under every condition in force:
   - default or listing-parameter Target: `getTagCounts` with `type=["image"]`, the
     Target's listing parameters, and `tag` = the Target's own tags then the chosen tags
     (`mergeLibraryTags`);
   - collection Target: the same with `collection` = its name;
   - ready member Target: `getTagCountsWithFileIds` with the members, `type=["image"]` and
     `tag` = the chosen tags;
   - member Target evaluating: resolves after ready (no request before);
   - empty Target: resolves to `[]` with no request.
   Under a member Target that is `failed` or `tooLarge` the control row has no `filters`
   (the view menus stay). Below 640px the tag menu is alone on the first row in the left
   half (SPEC-CORE-147 I8). `onViewerRejected` is unreachable (no `watch` is sent) and does
   nothing.
10. *URL.* The chosen tags live in the URL as `tag` (repeated): on the main page only with
    `view=library`, and on the shelf page. Toggling a tag or clearing replaces the URL, with
    no history entry, and keeps every other parameter. The Calendar and Map tab links and
    every calendar URL carry no `tag`. The Library tab link carries the Library tags, so
    Library → Calendar or Map → Library shows the Library as it was, with no new request
    when nothing was written (`library.md` I14).
11. *Requests.* While the Target is ready and not empty, every Library request
    (`/library/shelves` for the shelves, `/library/shelf` for なし) and the shelf page's
    `/library/shelf` carry the chosen tags: with a default or listing-parameter Target as
    `tag` = the Target's own tags then the chosen tags (`mergeLibraryTags`); with a
    collection Target as `tag` = the chosen tags beside `collection`; with a member Target
    as `tag` = the chosen tags on the `POST` query string. A photo matches when it carries
    every tag in `tag`, with the core listing's `tag` predicate (the same one the `GET`
    routes already use). Under an empty Target the requests are today's `none=true` alone
    and the chosen tags stay in the URL unsent.
12. *Backend.* `POST /library/shelves` and `POST /library/shelf` accept `tag` (repeated,
    each non-empty) on the query string and narrow the member set by the core listing's
    `tag` predicate, as the `GET` does. An empty `tag` value on those two routes answers
    422. Every other target query parameter on any `POST`, and `tag` on any other `POST`
    route, still answers 422.
13. *Links.* A Library shelf's See all link carries the chosen tags; the shelf page's back
    link is `?view=library` plus the page's chosen tags; going back by the browser restores
    the URL it had.
14. *Target choice.* On the main page a Target choice removes `tag` from the URL in the
    same replace the page already makes, or in a replace of its own when it makes none,
    with no history entry, and the Library tags become empty. On the shelf page a Target
    choice removes `tag` from its URL by a replace with no history entry. From the Target
    choice on, the chosen tags are taken as empty until the URL reflects the replace, so no
    request (Library, なし, shelf page, tag-counts) carries a tag chosen before it.
    Re-choosing the Target in force, a fallback, a member evaluation and a 分類 or 並び順
    choice keep it. Back to a history entry made before a Target choice shows that entry's
    URL: its `tag` values are the chosen tags under the Target in force (decided by the
    user, as Clips), and a tag no photo of that Target carries gives the filtered empty
    state.
    The in-place start-over (a URL with no query reached while the page stays mounted)
    empties the Library tags and writes `?view=library` with no `tag`.
15. *Changing tags.* A tag toggle or a clear is handled as a classification change is in
    `library.md` I8: from it on, no shelf, photo or title of the previous tags is on screen,
    also while the new answer loads, after it fails and when an earlier answer arrives
    late.
16. *Empty.* When the Library (shelves or なし) or the shelf page has no photo while the
    Target is ready, not empty, and a tag is chosen, its body is the agreed filtered empty
    state; with no tag chosen, or under an empty Target, it is what it is today.
17. *Count.* The main page's header count stays the Target's total and ignores the filter,
    as in the core's apps (SPEC-CORE-147). The shelf page's header count is the shelf
    `total` it already reads, which is under the chosen tags (decided by the user).
    A failed request under chosen tags (Library shelves, なし, shelf page) draws the same
    failed state with retry as without tags.

**SPEC-PD-025 (Home shortcuts).**

18. *Menu row.* The main page and the shelf page pass `homeEntry: "photo_diary"` to
    `AppHeader`'s Target menu while the Target is known, as Video and Reading pass theirs.
    The core draws Put on Home / Remove from Home for a non-default Target in force and puts
    the tile on Home (SPEC-CORE-153/154); Photo Diary adds nothing else.
19. *Opening.* The main page, on any view, reads `?target=<id>` once, on its first render.
    From then until the id is applied or ignored the id is **pending**: no photo, count,
    shelf or tag-counts request goes out, the default Target's included; each face shows
    what it shows while the look-up runs; the Target control shows `…` and the menu checks no row, the default's included.
    The pending id's own row is never drawn while it is pending: it comes from its list,
    and that list's arrival resolves the id (SPEC-CORE-154's checked pending row has no
    state in which it shows here).
20. *Resolve.* The id is applied when it names a Smart Collection in the loaded list that
    `isUsable` accepts, or `collection:<id>` of a collection in the loaded list. Applying an
    id other than the saved Target is a Target choice (`choose(id)`): it writes Photo
    Diary's Target key for the drive and puts that Target's view in force. Applying the
    saved Target writes nothing and is not a Target choice. Otherwise the id is ignored:
    `default`, an empty value, an id not in the list, an unusable Smart Collection, or the
    list failing to load; the saved Target stays and nothing is written. The id is never
    sent to a backend. A pending id is resolved by the list of its own kind only: a Smart
    Collection id by the Smart Collection list, a `collection:<id>` by the collection list;
    the other list neither holds nor resolves it. While an id is pending the saved Target is
    neither looked up for use nor evaluated, so a mount still evaluates one member Target
    once (`target-members.md` I9), the one in force after the id is resolved.
21. *URL.* When the id is applied or ignored, `target` is removed from the URL by a replace
    with no history entry, keeping every other parameter; a Target choice's `tag` removal
    (14) is part of the same replace. A URL whose only parameter is `target` is a fresh
    start (`library.md` I7, and the in-place start-over of the page), judged on the URL
    without `target`: the saved state is cleared and the URL becomes `?view=library` in that
    replace. No replace the page makes before then drops the pending id.
22. *Dropped.* A pending id is dropped, unwritten, when the viewer chooses another row in
    the menu (that choice is the Target choice) or navigates to another URL (a tab, a link,
    Back). It is held in the page's state, not read again from the URL.
23. *Shelf page.* The shelf page does not read `?target=` and leaves it in its URL.

### 2. Failure cases

- **localStorage throws or holds unparsable JSON** under the view key: the Library shows
  the defaults with no error; a menu choice made while writes fail stays shown until the
  next mount, drive change or Target change (SPEC-CORE-145 I5).
- **Tag-counts fails or is slow.** The core's menu shows its skeleton, then Try again; the
  chosen tags and the Library's results stay (SPEC-CORE-147 I9).
- **A chosen tag no photo carries** (typed in the URL, a tag renamed or removed): the
  Library is the filtered empty state; the tag is listed first in the menu at count 0 and
  can be removed.
- **An empty `tag` value** in a page URL is dropped before any request; sent to one of the
  two `POST` routes it answers 422.
- **`by=all` on the shelf page's URL**: its invalid-link state (8). `/library/shelf?by=all`
  with a key other than `all`: 422.
- **`?target=` while the Smart Collection or collection list fails**: ignored (20); the
  list's retry later applies the saved Target, never the ignored id.
- **A member Target applied from `?target=` that ends `failed` or `tooLarge`**: it was
  applied; the page shows what it shows today for that saved Target.
- **The Home row's `GET` or `PUT` fails**: the core's behaviour (no row for that open; the
  toast `drive.homeShortcutFailed`).

### 3. States

- View per (drive, Target): **unset** → **set** on a menu choice; **set** → **set** on
  another choice. Not allowed: set → unset (nothing removes an entry), and any write other
  than a menu choice for the Target in force.
- Chosen tags: exactly the URL's; there is no other copy except the Library tags the
  Library tab link carries in this mount. A reload keeps them; Back to an entry made before
  a Target choice brings that entry's tags under the Target in force; opening another
  drive's page does not carry them. Not allowed: a tag reaching a Calendar or Map URL or
  request; a request after a Target choice carrying a tag chosen before it; the Library
  tab link carrying tags after a Target choice or an in-place start-over.
- `?target=` per page load: **pending** → **applied** or **ignored**; a pending id is
  dropped by a menu choice or a navigation (22). Not allowed: an ignored id applied later;
  a pending id applied after a navigation or a menu choice; a request sent while pending.

### 4. Data read and written

- localStorage: `litloft.addon.photo_diary.view.<drive>` (core format, `{targetId: {group,
  sort}}`), written by item 4 only. The old per-drive keys are read for the `default`
  Target and never written or removed. `litloft.addon.photo_diary.target.<drive>` is
  written by a Target choice, as today, including one made by an applied `?target=`.
- sessionStorage: the page's saved state (`photo_diary:state:<drive>`) gains the chosen
  tags in its `library` entry; the shelf page's `photo_diary:shelf:<drive>` gains them too.
  An entry saved before this change has none, which equals no tag chosen. Both are written
  when and as they are today.
- Server: the core's `home_app_shortcuts` through the core's menu row; nothing in Photo
  Diary's own database.

### 5. External services

None. Tag counts are the core's `tag-counts` route.

### 6. Authorization

Unchanged. The `tag` accepted on two `POST` routes only narrows the member set, which is
still narrowed to the drive's active images (`target-members.md`), with the same tag
predicate the `GET` routes use. `tag-counts` validates the drive as the core does.

### 7. Effect on existing features

- A viewer who had set a classification or sort on a drive keeps it under the `default`
  Target; under a Smart Collection or collection they see 撮影月 / 新しい順 once and choose
  again (as Video, Reading and Clips after SPEC-CORE-145).
- `library.md`'s per-drive view (I10) becomes per Target (Revises).
- A load with only `?target=` is a fresh start, like a load with no query.
- The Library's control row is no longer drawn while the Target is looked up; it appears
  when the look-up ends (item 1).
- The Calendar and the Map are unchanged; their URLs never carry `tag`.
- `tests/test_target_members.py`'s table of target query parameters answered 422 on every
  `POST` route keeps every row except `tag` on `POST /library/shelves` and
  `POST /library/shelf`, where `tag=trip` now answers 200 and `tag=` (empty) still 422
  (Revises SPEC-PD-021 I1).

### 8. Error behavior

As in 2. No new log line. The filtered empty title is new text in Photo Diary's messages
(`photoDiary.library.filteredEmpty`, en "Nothing matches these filters").

### 9. User-visible behavior

- The Library's row reads 分類 / 並び順 like the other apps, with a タグ menu on its left.
- 分類 offers なし.
- Each Smart Collection and collection remembers its own 分類 and 並び順.
- The Target menu offers ホームに置く / ホームから外す; the Home tile reads
  `フォトダイアリー・<Target>` and opens Photo Diary on that Target.
- `README.md` (the addon's user page) gains a sentence each: the tag filter, kept in the
  link and across the tabs; the view kept per Target; and Put on Home.

### 10. Non-functional

- `by=all` pages by `offset` like the other shelf pages; at 50,000 photos with 10,000
  member ids its first page answers within 1 s, measured once before merge (as
  `target-members.md` section 10).
- One tag-counts request per menu open and one per toggle while it is open.

### Project-specific questions (`docs/process/PROJECT.md`)

- Migration: none; no table or column is added. The view moves to a new localStorage key;
  the old keys are only read.
- WebSocket events: none emitted or consumed.
- Internal API: not used or changed. Tag counts come from the core's public `tag-counts`
  route, as Video, Reading and Clips use it.
- Addon boundary: no core code changes. The frontend imports the core parts named under
  Touch points, all on the documented surface (SPEC-CORE-145 to 148, 154).
- i18n: addon messages, plus the core's `appView` and `appFilters` messages the core parts
  render.

## Touch points

- `backend/router.py` (`ShelfBy` gains `all` with its own branch in the shelves and shelf
  routes; `tag` on `POST /library/shelves` and `POST /library/shelf`, and
  `_no_target_parameters` exempting `tag` for those two only), `backend/schemas.py` if a
  model changes, `tests/test_library.py` (new `by=all` cases),
  `tests/test_target_members.py` (the 422 table as section 7 says, new `POST` `tag` cases)
- `frontend/lib/library.ts` (`all` in the Library's classifications but not in the shelf
  page's URL check; the per-drive read/write replaced by the core's view store; `ShelfUrl`
  and `shelfPageQuery` gain `tags`), `frontend/lib/pageUrl.ts` (`tag` on `view=library`),
  `frontend/lib/savedState.ts` (the chosen tags), `frontend/LibraryControls.tsx` (the core's
  menus; the shelf page's quiet sort menu keeps its look), `frontend/LibraryFace.tsx`
  (control row, なし grid, filtered empty), `frontend/PhotoShelf.tsx` (See all carries the
  tags), `frontend/ShelfPage.tsx` (`tag`, `homeEntry`, back link, Target choice removes
  `tag`, count), `frontend/PhotoDiaryPage.tsx` (view per Target, Library tags and the tab
  link, `tag` removal on a Target choice, `?target=` pending / apply / ignore and the
  fresh-start test, `homeEntry`), `frontend/useTarget.ts` (applying an id, pending),
  `frontend/api.ts` (`tag` on the library requests), `frontend/useLibraryPages.ts`,
  `frontend/usePagedPhotos.ts`, `frontend/messages/{ja,en}.json`, and their tests
- `e2e/pageSupport.ts` (stubs for `tag-counts`, `tag-counts/query`, `home-shortcuts` and
  `by=all`), `e2e/fixture/shelf/entry.tsx` and the page fixture (rebuilt),
  `e2e/library.spec.ts` (it drives the old 分類 / 並べ替え menus), and a layout spec for
  the Library control row at 1440, 1280, 1024 and 390px in ja and en
- `README.md`, `docs/specs/INDEX.md` (also SPEC-PD-018 to 020 set `implemented`: the
  Library merged in #11)
- Core names used: `LibraryControlRow`, `GroupMenu`, `SortMenu`
  (`components/appshell/ViewMenus`), `FilterMenus`, `mergeLibraryTags`, `readTargetView`,
  `writeTargetView`, `getTagCounts`, `getTagCountsWithFileIds`, `EmptyState`, `AppHeader` /
  `TargetMenu`'s `homeEntry`, the `appView` messages. No core file is edited.
- Rules passed through: core `.claude/rules/design-decisions.md` (drive boundary; no
  core-to-addon dependency), `frontend-conventions.md`, `backend-conventions.md`. No
  protected path is edited.

## Invariants

I1. Choosing a value in the Library's 分類 or 並び順 menu writes that field under
`litloft.addon.photo_diary.view.<drive>` for the Target in force only; every other Target's
entry, every other drive's key and the old per-drive keys are unchanged; and no page load,
Target choice, fallback, restore, `?target=` or shelf page sort change writes that key.

I2. The view shown is the Target in force's stored value, else (the `default` Target only)
the old per-drive value, else 撮影月 / 新しい順; after choosing view A on Target X and B on
Y, switching to X shows A and back to Y shows B; and from a Target choice on no Library
request goes out with another Target's view. While the Target is not known the Library
draws no control row.

I3. Under any Target and chosen tags, the なし grid over all its pages holds every photo
the Library's `month` shelves hold for the same conditions, each once, dated photos in
capture order for the sort then undated photos; `/library/shelf?by=all&key=all`'s `total`
equals the sum of those shelves' counts; any other key with `by=all` answers 422;
`/library/shelves?by=all` answers exactly one shelf `{key: "all", label: ""}` with that
count, or none when it is 0, and never runs another classification's filter; and the shelf
page treats a `by=all` URL as an invalid link.

I4. With tags T chosen and the Target ready and not empty, every Library request, every See
all link, the shelf page's request and its back link carry all of T, and every photo shown
carries every tag in T; no Calendar or Map request or URL carries T; under an empty Target
no request carries T.

I5. A tag toggle, a clear and a Target choice (on the main page and on the shelf page)
change the URL by replace with no history entry; a Target choice leaves no `tag`;
re-choosing the Target in force, a fallback, a member evaluation and a 分類 or 並び順
choice leave `tag` as it was; no request after a Target choice carries a tag chosen
before it; a reload keeps it; Back to an entry made before a Target choice applies that
entry's `tag` under the Target in force; Library → Calendar or Map → Library keeps the
Library tags and sends no request when nothing was written; after a Target choice or an
in-place start-over the Library tab link carries no `tag`.

I6. `POST /library/shelves` and `POST /library/shelf` with non-empty `tag` values answer what
the `GET` answers for a collection holding exactly the posted ids plus that `tag`; an empty
`tag` value on them, any other target query parameter on any `POST`, and `tag` on any other
`POST` route answer 422.

I7. Once the latest tag-counts answer has arrived, the tag menu lists the chosen tags first
then exactly the answer's other tags minus the Target's own tags; no tag-counts request
goes out before the Target is ready or under an empty Target; and an answer for conditions
no longer in force is never drawn.

I8. From a tag toggle or clear on, no shelf, photo or title of the previous tags is on
screen, also while the new answer loads, after it fails and when an earlier answer arrives
late.

I9. With a tag chosen, the Target ready and not empty, a Library (shelves or なし) or shelf
page with no photo shows 条件に合う項目はありません / Nothing matches these filters with
the `Search` icon; with no tag chosen it shows its existing empty state; the main page's
header count is the Target's total whatever the tags, and the shelf page's is its shelf
`total` under the tags.

I10. The main page with `?target=<id>` sends no photo, count, shelf or tag-counts request,
the default Target's included, until the id is applied or ignored; an applied id other
than the saved Target writes Photo Diary's Target key for that drive and no other
localStorage key; an ignored id or the saved Target's writes nothing, and an ignored id is
never applied later (a list retry applies the saved Target); a pending id is resolved only
by the list of its own kind; afterwards the URL
has no `target`, with no history entry added, and a URL that held only `target` is
`?view=library` with the saved state cleared.

I11. A pending `?target=` is dropped unwritten by choosing another row or a navigation, and
the page's own replaces do not drop it; while pending, the menu checks no row, the default's
included; the shelf page leaves `target` in its URL and behaves as without
it.

I12. The main page and the shelf page pass `homeEntry: "photo_diary"` while the Target is
known, so a non-default Target in force shows Put on Home / Remove from Home in the Target
menu and a shortcut put there opens Photo Diary with that Target.

I13. In the Library at 390px the tag menu is alone on the first row in the left half and the
two view menus share the second row at equal widths (within 1px); from 640px up the filter,
a 20px gap, then the view menus; at 1440, 1280, 1024 and 390px in ja and en nothing scrolls
horizontally, measured in a real browser.

I14. The Library's 分類 menu offers 撮影月, タグ, コレクション, フォルダ and なし (en Month
taken, Tag, Collection, Folder, None) under the label 分類 / Group By, its 並び順 menu
新しい順 and 古い順 under 並び順 / Sort By, and the shelf page's sort menu is labelled 並び順
/ Sort By; no Photo Diary screen shows 並べ替え.

## Revises

SPEC-PD-016 I6. The default target sends no target parameter, except the Library's chosen tags as `tag` on the Library routes, and with no tag chosen gives the same counts, lists and pins as before that change.
SPEC-PD-016 I11. The backend answers 422 to `none=true` sent with any target parameter, and to a `POST` carrying any target query parameter except non-empty `tag` values on `POST /library/shelves` and `POST /library/shelf`; treats `none=false` as absent on a `GET`; and answers 400, not 500 or an empty result, to a target parameter the core cannot normalise.
SPEC-PD-021 I7. Under the default target, a listing-parameter Smart Collection and an empty target, every photo request is exactly what it was before that change, except that the Library routes carry the Library's chosen tags as `tag` when the target is not empty.
SPEC-PD-018 I1. Under any target, classification, sort and chosen tags, every photo the target selects that carries every chosen tag is in at least one shelf; across `month` shelves and across `folder` shelves each such photo is in exactly one; a shelf's `count` equals `/library/shelf`'s `total` for the same target, chosen tags, `by` and key, also for a folder whose stored name is NFD and for the root folder's `key=`; and a shelf's `file_ids` equal the first `per_shelf` ids of `/library/shelf` with the same sort.
SPEC-PD-018 I2. Under any target with no tag chosen, a `month` shelf's count equals that month's count in `/calendar/months`, and the `undated` shelf's count equals `undated_count`.
SPEC-PD-018 I7. A load with no query, or whose only parameter is `target`, shows the Library and leaves the URL at `?view=library` with no added history entry; `?view=calendar`, and a query with `month`, `date` or `undated` and no `view`, show the calendar; every URL the calendar produces carries `view=calendar` and no `tag`; and no hidden face changes the URL.
SPEC-PD-018 I9. Going back from a photo opened in the Library or on the shelf page, reloading `?view=library`, and the shelf page's back link restore the loaded depth and scroll position left there once the target is ready (after a retry too; never while a member target has failed or is too large), never on another drive and never under another target, another classification or sort, or other chosen tags.
SPEC-PD-018 I10. The classification and sort chosen for a Target on a drive are in force for that Target on that drive's next load and not for another Target or drive; a sort changed on the shelf page changes neither.
SPEC-PD-021 I1. The `POST` photo routes answer exactly what the `GET` routes answer for the same other parameters over the photo set of the drive's active images whose id is listed (`file_ids: []` selects no photo, never the whole drive); they answer 422 to any target query parameter except non-empty `tag` values on `POST /library/shelves` and `POST /library/shelf`, a missing or invalid `file_ids`, an empty string or more than 10,000 entries; and the `GET` routes answer exactly as before, `by=all` added.
SPEC-PD-021 I2. Under a member target whose kinds hold `image`, every photo request after ready is a `POST` carrying the evaluated ids, an empty list included, and no target query parameter other than the Library's chosen tags as `tag` on the two Library routes; a member target whose kinds hold no image sends `none=true` alone and evaluates nothing.
SPEC-PD-022 I5. Under a collection target every photo request carries `collection` = that collection's name, and no other target query parameter except the Library's chosen tags as `tag` on the Library routes, through the `GET` routes, so the page shows exactly the collection's active images (under those tags on the Library); a `collection:<id>` not in the loaded list, or a failed collection list, gives the default target without deleting the saved id; while a saved `collection:<id>` is looked up no photo request goes out.
SPEC-PD-016 I16. The Target control's text and the menu's checked row always name the target in force: すべての写真 for the default and for every fallback of item 4, the Smart Collection's or collection's name otherwise (a member target's name also while it evaluates, after a failure and when too large), `…` only while the look-up runs or a `?target=` is pending, when no row is checked.

## Checked, no action

- **A state filter.** Not offered (user's decision): photos have no watch or read progress,
  and Clips' trust has no photo counterpart.
- **Filters on the Calendar and the Map.** Not offered (user's decision).
- **A tag menu on the shelf page.** Not drawn (user's decision), as the other apps' shelf
  pages; the back link returns to the Library to change it.
- **Filters in memory like Video and Reading.** Not chosen (user's decision): Photo Diary
  restores its faces from the URL and the back link already, so the URL fits it, and it
  needs no core change. The core's store is keyed by the built-in app ids only.
- **Dropping `tag` on the Library tab link, as Clips.** Not done (user's decision): the
  Library is kept mounted while hidden, and `library.md` I14 promises no new request on a
  round trip.
- **The shelf page's sort as the Library's outlined menu.** Not done (user's decision);
  its quiet look stays, as Video's See all.
- **A grid page size of 60 for なし, as Video.** 40, as Photo Diary's shelf page, so the
  なし grid and the shelf page page the same way.
- **Writing the old per-drive keys, or removing them.** Neither: read for the `default`
  Target only, as SPEC-CORE-145 does for the other apps.
- **Pruning view entries of deleted Targets.** Not done, as SPEC-CORE-145.
- **`?target=` on the shelf page.** Not read, as Video's and Reading's See all pages; Home
  tiles open the main page.
- **The tag predicate across drives.** The `POST` `tag` uses the core listing's predicate,
  the one the `GET` routes already use, so the two answer alike; Photo Diary's own `by=tag`
  shelves keep matching this drive's tag rows only, as today.
- **Logging.** No new log line; nothing here fails on the server except validation (422).
- **A new design.** Agreed: the core's parts.
