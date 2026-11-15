# Photo Diary: a Library face of shelves, like the core's Video app

SPEC-ID: SPEC-PD-018
SPEC-ID: SPEC-PD-019
SPEC-ID: SPEC-PD-020

Approval: sha256:91a93dc7fa4ad1b3c1bc8d1a574ac03ebb146b658934a086e33febd9bc8bc18b Yuichi Senga 2026-11-15

## Summary

Photo Diary shows a drive's photos on a calendar and a map. To browse them as a photo
library, the viewer today goes back to the folder tree. This adds a **Library** face in the
shape of the core Video app's Library: the photos grouped into shelves by one
classification, each shelf showing its first photos and a **See all** link to a full page of
that shelf. Photo Diary becomes ライブラリ | カレンダー | 地図 and opens on the Library.

- **SPEC-PD-018**: the backend. Two read-only routes, `GET /library/shelves` and
  `GET /library/shelf`, that group the target's photos by capture month, tag, collection or
  folder and list one shelf's photos in capture order.
- **SPEC-PD-019**: the Library face: the tab, the classification and sort controls, the
  shelves, opening on the Library, and the page URL.
- **SPEC-PD-020**: the shelf page `/drive/{drive}/addons/photo_diary/shelf`: one shelf's
  photos as the core's justified image grid, paged, with the sort control and the Target.

Everything follows the Target of SPEC-PD-016. Photos only (`file_type = 'image'`); videos
on the drive stay out, as in the calendar and the map. The core repository is not changed:
the shelf page is an addon sub-page (`pages/shelf.tsx`), and the core names the frontend
uses are listed in touch points.

Design: https://claude.ai/artifact/TQFc221X4tNpvRZf7nuoD8, saved in
`docs/reviews/library/design/` (five artboards: wide Library by month, wide Library by tag
with the classification menu open, wide shelf page, 375px Library, 375px shelf page).
Section 9 lists what of it is checked.

Out of scope: a Discover face and "on this day" shelves (next spec); videos in Photo Diary;
a target for notes; changes to the calendar, the map or daily notes beyond the tabs and the
page URL; extracting shared shelf components into the core.

## Definitions

Photo, capture date, undated photo: as `photo-diary.md`. The photo set under a target: as
`app-target.md` items 6 and 7 (`filtered_drive_files` with `type=["image"]`, or nothing with
`none=true`).

- **Classification** (`by`): `month`, `tag`, `collection`, `folder`.
- **Sort** (`sort`): `newest` (default) or `oldest`.
- **Capture order** for `sort=newest`: dated photos by `datetime_original` descending, then
  `filename` descending, then `id` descending; then undated photos by `filename`, then `id`,
  ascending. For `sort=oldest`: dated photos by `datetime_original`, `filename`, `id`
  ascending; then undated photos as above. Undated photos are last in both sorts.
- **Text order** (ties and tag names): by the NFC-normalised, case-folded text, then by the
  NFC-normalised text, then by the raw text, each compared by code point.
- **Shelves** per classification:

  | `by` | Shelves | `key` | `label` from the backend | Title drawn |
  |---|---|---|---|---|
  | `month` | one per capture month that holds a photo, and one for undated photos | `YYYY-MM`; `undated` | `""` | the month in the viewer's locale (`2026年11月` / `Nov 2026`), built from the key with no time zone conversion; 撮影日なし / No capture date |
  | `tag` | one per tag of the drive that a photo carries, and one for photos with no tag of the drive | the tag's name; `no_tag` | the name; `""` | the name; タグなし / No tag |
  | `collection` | one per collection of the drive that holds a photo, and one for photos in no collection of the drive | the collection's id; `no_collection` | the name; `""` | the name; コレクションなし / No collection |
  | `folder` | the folder grouping below | below | the key with a trailing `/` removed, then its last segment (`2026/` and `2026` both give `2026`); `""` for the root key `""` | the label; the drive's name for `""` |

- **Folder grouping**, as the core's `GET /api/drives/{drive}/shelves?by=folder`. Stored
  `folder_path` values are NFC-normalised before anything is compared. The **base** starts
  at the drive's root; while no photo lies directly in the base and every photo lies under
  one single child folder of it, the base moves down into that child. The base may hold
  photos directly; folders above it hold none. There is one shelf per child folder of the
  base, keyed `<base>/<child>` (`<child>` at the root), holding every photo under it at any
  depth, and, when photos lie directly in the base, one shelf keyed `<base>/` (`""` when the
  base is the root) holding those. On the production drive (all photos in `YYYY/MM`) the
  base is the root and there is one shelf per year.
- **Key forms on `/library/shelf`**: `month`: `YYYY-MM` with a real month, or `undated`;
  `tag`: a non-empty name, or `no_tag`; `collection`: a non-empty id, or `no_collection`;
  `folder`: `""` (photos directly in the root), `x/` (photos directly in `x`), or `x`
  (every photo under `x` at any depth), compared NFC-normalised on both sides.
- A photo is in exactly one `month` shelf and exactly one `folder` shelf; it is in one `tag`
  shelf per tag of the drive it carries (or `no_tag`), and one `collection` shelf per
  collection of the drive that holds it (or `no_collection`).
- **Shelf order**:
  - `month`: months newest first for `sort=newest`, oldest first for `sort=oldest`;
    `undated` last in both.
  - `tag`: by photo count descending, then name in text order; `no_tag` last. The sort does
    not change it.
  - `collection` and `folder`: for `sort=newest`, by the newest capture date among the
    shelf's photos, descending; for `sort=oldest`, by the oldest capture date, ascending;
    ties by `label` in text order. Shelves whose photos are all undated come next, by
    `label` in text order; `no_collection` last. The root folder shelf's `label` is `""`,
    so it is first among its ties.

## Required items

### 1. Normal flow

**Page URL and opening (019)**

1. The page's faces are chosen by the URL's query:

   | Query | Face |
   |---|---|
   | none | Library, fresh start (below) |
   | `view=library` | Library |
   | `view=calendar`, with or without `month`, `date`, `undated` | Calendar |
   | no `view`, with `month`, `date` or `undated=true` | Calendar (URLs made before this change) |
   | `view=map`, with or without the calendar's parameters | Map, as today |
   | `view` of any other value, or a query with no `view` and none of a real `month`, a real `date` or `undated=true` | Library; the URL is replaced with `?view=library` (no history entry); not a fresh start |

2. The sidebar row and the Home entry go to the page with no query. A URL with no query is a
   fresh start, as today (`photo-diary.md`: the drive's saved state is cleared, at load and
   in place): it shows the Library with the saved classification and sort (item 6) from its
   first shelves, and at once replaces the URL with `?view=library`, adding no history
   entry. Every later URL of the Library is `?view=library`, so going back to the Library,
   and reloading it, restore it (section 9 item 7).
3. Tabs push URLs: ライブラリ pushes `?view=library`; カレンダー pushes `?view=calendar`
   plus the calendar's `month`, `date` and `undated`; 地図 pushes `?view=map` plus those
   same parameters, as today. The calendar's parameters are those of the last calendar URL
   of this page visit (the current URL's when it is the calendar's or a map URL carrying
   them), so Calendar (a month and an open day) → Library → Calendar shows the same month
   and day again. The Library's URL carries none of them, and the hidden calendar keeps the
   last calendar URL it was given: it neither redraws nor requests anything while the
   Library is the face. Every URL the calendar produces (closing a list, pressing a day,
   Today, moving month, a map section heading's day link, dropping `undated`) carries
   `view=calendar`.
4. Which face opens is not remembered: a URL with no query always opens the Library.
5. Faces once shown stay mounted while hidden, as the calendar and the map do today: going
   Library → Calendar → Library keeps the Library's loaded shelves without a request when
   nothing was written in between. After a write through the context menu on another face
   (the calendar's or the map's photo lists), returning to the Library reads again every
   page of shelves it has loaded, as item 17 does, keeping their number and the scroll
   position. The other way round is the same: after a write through the context menu on
   the Library's photos, returning to the calendar or the map reads again the photo list
   open there, keeping its depth. A tab
   switch does not move the window's scroll, as switching between the calendar and the map
   does today (`scroll: false`). The in-place fresh start (a URL with no query reached
   while the page stays mounted) rebuilds every face, the Library included, from its first
   page.

**Library face (019)**

6. Under the tabs row, a controls row holds two menus, as the Video app's Library: 分類 /
   Group by, showing the classification in force (撮影月 / Month taken, タグ / Tag,
   コレクション / Collection, フォルダ / Folder), and 並べ替え / Sort (新しい順 / Newest
   first, 古い順 / Oldest first). The default is `month` and `newest`. Both are saved per
   drive in `localStorage` (`litloft.addon.photo_diary.classification.<d>` and
   `litloft.addon.photo_diary.sort.<d>`, `<d>` = `encodeURIComponent(drive)`). The saved
   value is in force on the next load; a missing, unknown or unreadable value gives the
   default; a write that storage refuses is dropped and the page keeps the choice.
7. The face requests `GET /library/shelves` with the target, `by`, `sort`, `per_shelf=12`,
   `shelf_limit=12` and `offset`, and draws the shelves in shelf order. Each shelf has its
   title, its photo count in the viewer's number format, a **すべて見る / See all** link,
   and its photos in capture order laid out by the core's justified grid (`FileGrid`, as the
   calendar's lists draw photos), showing only the grid's first line: photos that the
   layout puts on a later line are not drawn. The first line is as the core lays it out
   (base line height 120px below a 40rem grid width, 200px at 40rem and wider); a shelf with
   fewer photos than fill a line keeps them at their size, unstretched, as the core's last
   line. A photo opens the core's file page, as photos in the calendar's lists do. Where
   the core's grid does not justify (fewer than 2 photos, or under 90% of them with stored
   dimensions, `deriveListMeta`), it draws its card grid, and the shelf shows that grid's
   first row; the calendar's lists behave the same today.
8. The ids of one page of shelves are read into file items once each (an id in several
   shelves is read once), in batch reads of at most 100 ids (`batchGetFiles`, as
   `usePagedPhotos` does). A page is drawn when all its reads have answered.
9. More shelves load when the end of the drawn shelves nears, 12 at a time.
10. Changing the classification or the sort saves it (item 6), redraws the shelves from the
    first page with no page load, and does not change the URL or add a history entry.
11. The header's N is the photo count under the target, read as on the map
    (`/calendar/months`, `app-target.md` item 2), on every entry to the Library, after a
    target change and after a write of item 17.
11a. The Library's paging is the addon's own (`frontend/useLibraryPages.ts`): it can start
    at a saved depth, re-read every loaded page keeping their number, and tell a 404 from
    other failures. The core's `usePaged` is not used.

**Shelf page (020)**

12. See all goes to `/drive/{drive}/addons/photo_diary/shelf?by=<by>&key=<key>`, plus
    `&sort=oldest` when the sort in force is `oldest`. `key` is always present; it is empty
    for the root folder shelf. A `sort` in the URL other than `oldest` is read as `newest`.
    The page checks the URL before any request: a `by` other than the four, a missing `key`,
    an empty `key` with `by` other than `folder`, or a `month` key that is neither a real
    `YYYY-MM` nor `undated` shows the invalid-link state of section 2 at once, with the
    title フォトダイアリー / Photo Diary, and sends nothing.
13. The page draws the `AppHeader` with:
    - the `Images` icon, as on the Library;
    - a back link フォトダイアリー / Photo Diary to `?view=library`;
    - the title: for `month`, `tag` and `folder`, from the URL's key as in Definitions,
      drawn at once; for `collection`, the `label` of the page's first answer, `…` until it
      arrives, and コレクション / Collection when the read fails or the label is empty;
    - the scope line `<drive> · N枚` / `<drive> · N photos` with N = the shelf's `total`,
      the drive name alone until it is known;
    - the Target, whose `currentCount` is the target's photo count read as in item 11
      (`null` until known);
    - the sort menu, quiet, as the core's shelf page places it (title row on a wide layout;
      below 640px its own row above the photos, right-aligned). No tabs.
14. The page requests `GET /library/shelf` with the target, `by`, `key`, `sort`, `limit=40`
    and `offset`, through `usePagedPhotos` as the calendar's lists do (its page size of 40
    unchanged), and draws the photos in capture order as the core's justified grid, all
    lines, loading 40 more when the end nears.
15. Changing the sort on the shelf page replaces the URL's `sort` (no history entry) and
    reloads from the first page. It does not change the saved sort of item 6.
16. The Target on the shelf page is the drive's one saved target (`app-target.md`). A target
    change there reloads the shelf's photos, total and title under the new target; the URL
    keeps `by`, `key` and `sort`.
17. The core's file context menu (from `FileGrid`) is offered on the Library's photos and on
    the shelf page's. After a write through it, the Library reads again every page of
    shelves it has loaded, keeping their number and the scroll position; the shelf page
    reads again every photo it has loaded and its total, keeping the depth and the scroll
    position. A photo that has left a shelf (moved to trash, to another drive, tag removed)
    is gone after the re-read. The header's N (Library) and the Target's `currentCount`
    (shelf page) are read again too. While a re-read runs, what is drawn stays; when it
    fails, what is drawn stays and `LoadError` with retry appears above it, as the map does.

**Backend (018)**

18. `GET /api/addons/photo_diary/library/shelves` takes the target parameters of
    `app-target.md` item 6, `by` (required, one of the four), `sort` (default `newest`),
    `per_shelf` (1–20, default 12), `shelf_limit` (1–50, default 12) and `offset` (≥ 0,
    default 0). It answers `{shelves: [{key, label, count, file_ids}], total_shelves}`: the
    shelves in shelf order from `offset`, at most `shelf_limit` of them, each with its photo
    count and the ids of its first `per_shelf` photos in capture order. A shelf with no
    photo is never returned.
19. `GET /api/addons/photo_diary/library/shelf` takes the target parameters, `by`, `key`,
    `sort` (default `newest`), `limit` (1–100, default 40) and `offset` (≥ 0, default 0).
    It answers
    `{file_ids, total, label}`: the shelf's photos in capture order from `offset`, its photo
    count, and its label as in Definitions (for a collection, the collection's name when it
    exists on the drive, else `""`). A well-formed key with no photo under the target, or a
    collection id that is not the drive's, answers `total: 0`, no ids, not an error.
20. Both routes answer 422 to a `by` or `sort` other than those listed; `/library/shelf`
    answers 422 to a missing `key`, to an empty `key` for any `by` but `folder`, and to a
    `month` key that is neither a real `YYYY-MM` nor `undated`.

### 2. Failure cases

- `/library/shelves`, or a batch read of item 8, fails for the first page: the face shows
  the core's `RetryButton` in place of the shelves, and retry repeats both. For a later page:
  a retry under the drawn shelves; the drawn shelves stay.
- `/library/shelf`, or its batch read, fails for the first page: `LoadError` with retry; for
  a later page: a retry under the drawn photos.
- A 404 from any data route (drive locked, unknown drive, policy off): "not available", as
  today, on the Library and on the shelf page.
- A target parameter the core cannot normalise answers 400: the face or page shows its load
  error with retry; choosing another target is the way out (as `app-target.md`).
- 422 on the shelf page (a typed or stale URL): the message このリンクは開けません / This
  link cannot be opened, and the back link; no retry, since the same request would fail
  again.
- A shelf with no photo under the target (a tag removed, a collection deleted, another
  target): 写真はありません / No photos, with the back link.
- An id whose file the batch read no longer returns (moved to trash between the two reads)
  is skipped, as the calendar's lists do; the shelf's count stays as the backend answered.
- An effect in a hidden face never changes the URL: the hidden calendar's `replace`
  navigations run only while the calendar is the face, as today.

### 3. States

- **Face**: Library, Calendar, Map, by the URL (item 1). Allowed: any face to any other by a
  tab, Back or Forward; the fresh start to the Library. Forbidden: a hidden face changing
  the URL or the face.
- **Library**: target look-up running (no request, as `app-target.md` item 4); first page
  loading (one untitled skeleton shelf); ready with shelves; ready with none (empty, section
  9 item 5); failed (retry; also the 400 of section 2); not available (404, the page's
  "not available"); re-reading after a write (what is drawn stays; ends in ready, or in
  ready with `LoadError` above). Further pages: idle, loading (a skeleton shelf below),
  failed (retry below; drawn shelves stay). Allowed: any state but not available to first
  page loading on a change of target, classification or sort, or a fresh start; failed to
  loading by retry; ready or empty to re-reading by a write. Forbidden: a change of
  classification or sort pushing or replacing a URL; drawing an answer to an earlier
  target, classification or sort; leaving not available except by a fresh start.
- **Classification and sort**: one of four and one of two, per drive. Forbidden: the shelf
  page's sort writing the saved sort.
- **Shelf page**: invalid link (checked from the URL, or a 422; no retry); target look-up
  running; loading; ready; empty; failed (retry, also a 400); not available (404);
  re-reading after a write (as the Library); further pages as the Library. Allowed: ready,
  empty or failed to loading on a change of target or sort; ready or empty to re-reading by
  a write. Forbidden: invalid link to loading by any control on the page; a sort change
  adding a history entry or writing the saved sort.
- A change of target, classification or sort shows nothing of the previous choice from that
  moment, also while the new answer loads and after it fails.

### 4. Data read and written

- Core tables `files`, `file_exif`, `tags`, `file_tags`, `collections`, `collection_items`,
  and through `filtered_drive_files` what its filters read: read only.
- Core endpoint `POST /api/files/batch/get` (through `batchGetFiles`): read.
- `localStorage`: the two keys of item 6 (new); the target keys of SPEC-PD-016 (unchanged).
  `localStorage` is the only store of the classification and sort.
- `sessionStorage` `photo_diary:state:<drive>` (the existing key and its encoding): the
  Library adds `library: {loaded, scrollY, by, sort}`, the number of shelf pages loaded,
  the scroll position, and the classification and sort they were recorded under, beside the
  existing `target` (`sanitize` in `lib/savedState.ts` keeps the new field). It is applied
  only when the page loads at `?view=library` (Back, a reload, the shelf page's back link),
  never when the Library is first shown by its tab, and only when `by` and `sort` equal
  those in force from `localStorage` and the target matches (`app-target.md` item 8);
  otherwise the Library starts from its first page at the top. Leaving the page from the
  Library writes it; the calendar's list position is not written from the Library.
- `sessionStorage` `photo_diary:shelf:<drive>` (same encoding), one entry per drive:
  `{by, key, sort, target, loaded, scrollY}` of the last shelf page left. Pressing See all
  removes it before navigating, so See all always opens a shelf from its first page; Back
  and a reload of the shelf page restore it when `by`, `key`, `sort` and the target in
  force all equal it. A fresh start (a URL with no query) removes it with the drive's other
  saved state.
- No table, no write to the core.

### 5. External services

None. The Library and the shelf page request no map tile.

### 6. Authorization

Both new routes run `_drive_scope` first (drive access and addon policy, one 404), like
every data route. Tags, collections and folders are read only within that drive
(`Tag.drive`, `Collection.drive`, `File.drive` equal to it).

### 7. Effect on existing features

- Calendar: reached at `?view=calendar` and at the old query form (item 1). Every URL it
  produces carries `view=calendar` (item 3). The fade of `ui-polish.md` I3 that ran on "the
  first draw of a page loaded with no query" now runs on the first draw of a page loaded
  with `?view=calendar` alone (Revises). On a fresh start the calendar is not drawn, so its
  first draw happens when the viewer opens its tab, and that draw does not fade.
- Map: unchanged; `?view=map` as today.
- Daily notes: unchanged. Going back from the editor returns to the URL it left, which
  carries `view=calendar`.
- The core's Home and sidebar entries point at the page with no query: they now open the
  Library.
- The page's count read, today run on the map, also runs on the Library (item 11).
- Tests: `lib/pageUrl.test.ts` (an unknown `view` was the calendar), the page tests that
  open with no query and expect the calendar, and the e2e case "a page opened with no query"
  in `calendarPolish.spec.ts` move to `?view=calendar`; none is deleted.

### 8. Error behavior

As section 2. Nothing new is logged; the routes raise `HTTPException`s like the existing
ones.

### 9. User-visible behavior

1. Tabs ライブラリ | カレンダー | 地図 / Library | Calendar | Map, in that order, in the tabs
   row at every width.
2. Library controls: 分類 / Group by and 並べ替え / Sort as menus with the value shown, in
   one row under the tabs row at every width. The sort button shows its value only
   (新しい順 / Newest first, 古い順 / Oldest first) at every width, on the Library and on
   the shelf page; its accessible name is `並べ替え: <value>` / `Sort: <value>`. Both menus
   are radio lists with the value in force checked.
3. Shelf titles and counts as Definitions; See all on every shelf, also on a shelf whose
   photos all fit in its line.
4. The design's checked lines:
   - Library, top to bottom: header (title row with the Target), tabs row, controls row,
     shelves; each shelf: title, count, See all at the row's right end, then its photo line.
   - A shelf's photos are one justified line at the photos' own proportions (not squares),
     filling the width, at the core's line height (120px base below a 40rem grid width,
     200px at 40rem and wider); no second line, no photo cut at the right edge.
   - At 375px the classification button shows the value without the word 分類 and both
     buttons are at least 44px tall; at 640px and wider it shows 分類 and the value.
   - Shelf page: back link above the title; title row with the sort and the Target at its
     right end at 640px and wider; below 640px the Target at the end of the scope line and
     the sort in its own right-aligned row above the photos; photos as the core's justified
     grid, all lines.
   - The classification menu: a radio list of the four, the one in force checked.
5. Empty Library (no photo under the target): the core's `EmptyState` with the `Images`
   icon and the title 写真はありません / No photos, no description.
6. Shelf page header as item 13.
7. Going back from a photo opened in the Library returns to the Library with the same
   classification and sort, the same shelves loaded and the same scroll position; the same
   on reloading `?view=library`, and on the shelf page's back link. Going back from a photo
   opened on the shelf page returns to it with the same photos loaded and the same scroll
   position. Nothing is restored on another drive or under another target.
8. Japanese and English strings live in the addon's `frontend/messages/{ja,en}.json`.

### 10. Non-functional

- On a drive of 50,000 photos with 2,000 tags, 500 collections and 1,000 folders, each of
  `/library/shelves` (each `by`, first page) and `/library/shelf` (each `by`, first page)
  answers within 1 second, measured once before merge on a generated database, as
  `app-target.md` did. Also measured on the production `photos` drive (3,672 images) in R-5.
- Privacy: no new outside host, nothing sent outside the LAN. R-5 screenshots of real
  photos are not put on shared pages.
- No cache: each request is computed on demand, as the calendar is.

### Project-specific questions (`docs/process/PROJECT.md`)

- Migration: none; no table or column is added.
- WebSocket events: none emitted or consumed.
- Internal API: not used or changed.
- Addon boundary: core code is not changed. Beyond what Photo Diary imports today, the
  frontend imports `RetryButton` and `useNearEnd` from `components/appshell/` and
  `EmptyState`; it imports nothing from the Video app's `components/videoapp/`.
- i18n: addon messages only.

## Touch points

Addon repository (`mamepenguin/Litloft-photo-diary-addon`):

- `backend/router.py`: `GET /library/shelves`, `GET /library/shelf`; capture order; month,
  tag, collection and folder grouping; key parsing; `ADDON_META.description` becomes
  "Browse your photos as a library, on a calendar and on a map." (shown by the core's
  setup wizard).
- `backend/schemas.py`: response models for the two routes.
- `frontend/PhotoDiaryPage.tsx`: the third tab, the Library face, the fresh start replacing
  the URL with `?view=library`, the count on the Library.
- `frontend/lib/pageUrl.ts`: `view` of `library | calendar | map` by item 1;
  `buildPageQuery` writes `view=calendar` for calendar URLs and `view=library`.
- `frontend/CalendarView.tsx`, `frontend/MapView.tsx`, `frontend/SectionedGrids.tsx`: every
  calendar URL they produce carries `view=calendar`.
- New: `frontend/useLibraryPages.ts`, `frontend/LibraryFace.tsx`,
  `frontend/LibraryControls.tsx`,
  `frontend/PhotoShelf.tsx` (one shelf: heading and first line), `frontend/lib/library.ts`
  (titles, key forms, storage), `frontend/pages/shelf.tsx` (sub-page),
  `frontend/ShelfPage.tsx`.
- Reused: `frontend/useTarget.ts`, `frontend/LoadError.tsx`, `frontend/usePagedPhotos.ts`
  (the shelf page's paging and batch reads), `frontend/lib/total.ts`.
- `frontend/api.ts`: `fetchShelves`, `fetchShelf`.
- `frontend/lib/savedState.ts`: the Library's entry; the shelf page's key.
- `frontend/messages/ja.json`, `frontend/messages/en.json`.
- Tests: `tests/` (backend), `frontend/*.test.tsx`, `frontend/lib/*.test.ts`; e2e:
  `e2e/build-fixture.mjs` and a new fixture entry that mounts `pages/shelf.tsx`,
  `e2e/fixture/page/` (bundle gains the newly imported core modules),
  `e2e/pageSupport.ts` (stubs for the two routes), new specs for the Library, the shelf page
  and back-navigation restore, and `calendarPolish.spec.ts` (item 7 of section 7).
- `README.md`: the Library and the shelf page.
- `docs/specs/INDEX.md`: three rows.
- `docs/reviews/library/`: design, review and R-5 records.

Core repository: no change. Core names the addon frontend uses, read only:
`@/components/appshell/{AppHeader,RetryButton,useNearEnd,useLoad}`,
`@/components/EmptyState`, `@/components/FileGrid`, `@/components/PageFrame`,
`@/components/PageTabs`, `@/lib/api` (`batchGetFiles`, `getSmartFolders`),
`@/lib/appPrefs`, `@/lib/appTarget`. Core backend names: `app.models` (`File`, `FileExif`,
`Tag`, `file_tags`, `Collection`, `CollectionItem`, `active_file_filter`),
`app.routers.drives.filtered_drive_files`.

Protected paths: none edited.

## Invariants

I1. Under any target, classification and sort, every photo the target selects is in at
least one shelf; across `month` shelves and across `folder` shelves each photo is in exactly
one; a shelf's `count` equals `/library/shelf`'s `total` for the same target, `by` and key,
also for a folder whose stored name is NFD and for the root folder's `key=`; and a shelf's
`file_ids` equal the first `per_shelf` ids of `/library/shelf` with the same sort.

I2. Under any target, a `month` shelf's count equals that month's count in
`/calendar/months`, and the `undated` shelf's count equals `undated_count`.

I3. A photo whose `datetime_original` is `2026-10-31T23:30:00` is in the `2026-10` shelf
whatever the browser's or server's time zone is, and an undated photo (including
`0000-00-00T00:00:00` and `2026-02-30…`) is in the `undated` shelf and never in a month
shelf.

I4. Within a shelf and on the shelf page, photos are in capture order for the sort in force
with undated photos after every dated one in both sorts, and paging either route by
`offset` neither skips nor repeats when nothing changes between requests.

I5. Shelves are in shelf order: months follow the sort with `undated` last; tags by count
then name with `no_tag` last whatever the sort; collections and folders by their newest
(`newest`) or oldest (`oldest`) capture date, all-undated shelves after, `no_collection`
last.

I6. A tag or collection of another drive, a trashed or missing file, and a non-image file
appear in no shelf, count or list; both routes answer the same 404 for a locked drive, an
unknown drive and a policy-off drive, 422 to `none=true` with a target parameter, and 422
to the malformed `by`, `sort` and keys of item 20.

I7. A load with no query shows the Library and leaves the URL at `?view=library` with no
added history entry; `?view=calendar`, and a query with `month`, `date` or `undated` and no
`view`, show the calendar; every URL the calendar produces carries `view=calendar`; and no
hidden face changes the URL.

I8. From a change of target, classification or sort on, no shelf, photo, count or title of
the previous choice is on screen, including while the new answer loads, after it fails, and
when an answer to an earlier request arrives late; and a change of classification or sort
leaves the URL and the history unchanged.

I9. Going back from a photo opened in the Library or on the shelf page, reloading
`?view=library`, and the shelf page's back link restore the classification, sort, loaded
depth and scroll position left there, never on another drive and never under another target
or another classification or sort.

I10. The classification and sort chosen on a drive are in force on that drive's next load
and not on another drive's; a sort changed on the shelf page changes neither.

I11. A shelf on the Library whose photos the core's grid justifies draws one line of photos
at their own proportions, with no second line and no photo cut at the edge, measured in a
real browser at 375px, 768px and 1280px; See all carries `sort=oldest` exactly when that
sort is in force.

I12. While only the Library or the shelf page has been opened, no map tile is requested.

I13. After a write through the context menu, a photo that has left a shelf is gone from the
Library and the shelf page, their loaded depth and scroll position are kept, and a failed
later page or re-read leaves what was drawn on screen.

I14. Calendar (a month and an open day) → Library → Calendar shows the same month and day,
and Library → Calendar → Library shows the Library's shelves without a new request when
nothing was written on the calendar or the map in between, and with the written photo's change
after a write there, and Library → Calendar shows an open day's list with the change of a
photo written on the Library; on the
shelf page a sort change replaces the URL without a history entry.

## Revises

SPEC-PD-008 I3. The fade runs when another month is drawn on screen by the viewer's navigation, or on the first draw of a page loaded with `?view=calendar` and no `month`, `date` or `undated`, and never under reduced motion; a refresh, a re-read of the same month, a target change, pressing a day, returning to the same month from the map, opening the calendar's tab from the Library, and a page loaded with any other query draw the surfaces at once.

## Checked, no action

- **Using the core's `GET /api/drives/{drive}/shelves`.** Its months and item order use
  `File.created_at` (file mtime) and it has no collection grouping; capture order needs
  `file_exif`, which only the addon's queries join. Undated photos (916 on the production
  drive) would be spread into mtime months, against `photo-diary.md` I2.
- **Extracting shared shelf components into the core first.** Decided against with the
  user (2026-11-14): the data source and the card differ; the addon follows the Video app's
  shape so extraction later is mechanical.
- **Reusing `ShelfBlock`.** It draws 16:9 video cards or 2:3 book cards in a column grid;
  photos keep their proportions in the core's justified layout instead.
- **Remembering the last face.** The Video app remembers its face; Photo Diary's face is in
  the URL, and the entry points open the Library (decided with the user). Back and Forward
  keep the face.
- **Tags and collections are 0 on the production drive.** In scope regardless: shelves are
  what the viewer organises towards (user, 2026-11-14).
- **Tag shelves by count.** Tags are themes; ordering them by date would bury large themes.
  Collections and folders are albums and years, ordered by their photos' dates.
- **Folder shelves by name.** Rejected: names of hand-made folders do not sort by time,
  while `YYYY` folders sort by date either way under the date rule.
- **Videos (134 on the production drive).** Separate spec (user, 2026-11-14).
- **Core inventory tests.** Photo Diary is not a core submodule and is in no core file
  inventory; `pages/shelf.tsx` adds nothing to a core list.
- **Horizontal scrolling shelves, or "N more" on a shelf.** The Video app uses one line and
  See all; the same here.
- **Invariant for batch-read sizing (item 8).** Not an invariant: a breach fails loudly
  (the core answers 422 above 100 ids) and the page tests cover it.
- **A single photo or unmeasured photos in a shelf.** The core's grid draws its card grid
  there (item 7); changing that is a core change, and the calendar's lists already live
  with it.
- **A Library URL holding the classification and sort.** The Video app keeps them in
  `localStorage` only; doing the same keeps Back from adding steps for each menu choice.
