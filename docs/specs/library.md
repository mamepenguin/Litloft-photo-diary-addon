# Photo Diary: a Library face of shelves, like the core's Video app

SPEC-ID: SPEC-PD-018
SPEC-ID: SPEC-PD-019
SPEC-ID: SPEC-PD-020

Approval:

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
  shelves, and opening on the Library.
- **SPEC-PD-020**: the shelf page `/drive/{drive}/addons/photo_diary/shelf`: one shelf's
  photos as the core's justified image grid, paged, with the sort control and the Target.

Everything follows the Target of SPEC-PD-016. Photos only (`file_type = 'image'`); videos
on the drive stay out, as in the calendar and the map. The core repository is not changed:
the shelf page is an addon sub-page (`pages/shelf.tsx`), and the core names the frontend
uses are listed in touch points.

Out of scope: a Discover face and "on this day" shelves (next spec); videos in Photo Diary;
a target for notes; changes to the calendar, the map or daily notes beyond the tabs and the
URL of the calendar view; extracting shared shelf components into the core.

## Definitions

Photo, capture date, undated photo: as `photo-diary.md`. The photo set under a target: as
`app-target.md` item 6 and 7 (`filtered_drive_files` with `type=["image"]`, or nothing with
`none=true`).

- **Classification** (`by`): `month`, `tag`, `collection`, `folder`.
- **Sort** (`sort`): `newest` (default) or `oldest`.
- **Capture order** for `sort=newest`: dated photos first by `datetime_original` descending,
  then `filename` descending, then `id` descending; then undated photos by `filename`, `id`
  ascending. For `sort=oldest`: dated photos by `datetime_original`, `filename`, `id`
  ascending; then undated photos by `filename`, `id` ascending. Undated photos are last in
  both.
- **Shelf key** and **label** per classification:

  | `by` | Shelves | `key` | Title drawn |
  |---|---|---|---|
  | `month` | one per capture month that holds a photo, plus one for undated photos | `YYYY-MM`; `undated` | the month in the viewer's locale (`2026年11月` / `Nov 2026`, no time zone conversion); 撮影日なし / No capture date |
  | `tag` | one per tag of the drive that a photo carries, plus one for photos with no tag of the drive | the tag's name; `no_tag` | the tag's name; タグなし / No tag |
  | `collection` | one per collection of the drive that holds a photo, plus one for photos in no collection of the drive | the collection's id; `no_collection` | the collection's name; コレクションなし / No collection |
  | `folder` | the core's folder grouping (below) | as the core's `GET /shelves?by=folder` | the folder's last segment; the drive's name for the root |

  The folder grouping is the core's: the base is the deepest folder that every photo lies
  under with no photo directly in it; there is one shelf per child folder of the base,
  holding everything under it, and one shelf keyed `<base>/` (the root: `""`) for the
  photos directly in the base. Paths are compared NFC-normalised, as the core does.
- A photo is in exactly one `month` shelf and in exactly one `folder` shelf; it is in one
  `tag` shelf per tag it carries (or `no_tag`), and in one `collection` shelf per collection
  that holds it (or `no_collection`).
- **Shelf order** (the order of the shelves on the face):
  - `month`: months newest first for `sort=newest`, oldest first for `sort=oldest`;
    `undated` last in both.
  - `tag`: by photo count descending, then name; `no_tag` last. The sort does not change it.
  - `collection`, `folder`: by the newest capture date among the shelf's photos, descending
    for `sort=newest` and ascending by the oldest capture date for `sort=oldest`; then by
    title; shelves whose photos are all undated next, by title; `no_collection` last.

## Required items

### 1. Normal flow

**Opening (019)**

1. The viewer opens Photo Diary from the sidebar or Home (`/drive/{drive}/addons/photo_diary`,
   no query). The header is the `AppHeader` of SPEC-PD-017 with three tabs: ライブラリ /
   Library, カレンダー / Calendar, 地図 / Map. The Library face is shown.
2. The calendar is at `?view=calendar` (with `month`, `date`, `undated` as today) and the map
   at `?view=map` (as today). A URL with no `view`, or a `view` other than `calendar` and
   `map`, is the Library. Choosing a tab pushes its URL, as choosing between the calendar and
   the map does today; going to the calendar keeps no month or day of the Library (it has
   none), and leaving the calendar for the Library drops `month`, `date` and `undated`.
3. Which face opens is not remembered: a URL with no query always opens the Library.

**Library face (019)**

4. Under the tabs row, a controls row holds two menus, as the Video app's Library: 分類 /
   Group by, showing the classification in force (撮影月 / Month taken, タグ / Tag,
   コレクション / Collection, フォルダ / Folder), and 並べ替え / Sort (新しい順 / Newest
   first, 古い順 / Oldest first). The default is `month` and `newest`.
5. The classification and the sort are saved per drive in `localStorage`
   (`litloft.addon.photo_diary.classification.<d>`, `litloft.addon.photo_diary.sort.<d>`,
   `<d>` = `encodeURIComponent(drive)`), and a saved value is used on the next load. A
   missing, unknown or unreadable value gives the default. A write that storage refuses is
   dropped and the page keeps the choice.
6. The face requests `GET /library/shelves` with the target, `by`, `sort`, `per_shelf=12`,
   `shelf_limit=12` and `offset`, and draws the shelves in shelf order. Each shelf has its
   title, its photo count in the viewer's number format, a **すべて見る / See all** link, and
   its first photos in capture order, in one row: as many as fit the width, never a second
   row (layout as the agreed design). A photo opens the core's file page, as photos in the
   calendar's lists do.
7. More shelves load when the end of the drawn shelves nears, 12 at a time, as the Video
   app's Library does.
8. Changing the classification or the sort redraws the shelves from the first page with no
   page load and keeps the URL as it is.
9. The header's N is the photo count under the target, read as on the map
   (`/calendar/months`, item 2 of `app-target.md`).

**Shelf page (020)**

10. See all goes to `/drive/{drive}/addons/photo_diary/shelf?by=<by>&key=<key>` plus
    `&sort=oldest` when the sort in force is `oldest`. The page draws the `AppHeader` with a
    back link フォトダイアリー / Photo Diary to the Library (no query), the shelf's title as
    the title, its photo count in the scope line, the Target, and the sort menu as the core's
    shelf page places it (quiet; below 640px in its own row above the photos). It has no tabs.
11. The page requests `GET /library/shelf` with the target, `by`, `key`, `sort`, `limit=60`
    and `offset`, and draws the photos in capture order as the core's justified image grid
    (`FileGrid`, as the calendar's lists draw them), loading 60 more when the end nears.
12. Changing the sort on the shelf page replaces the URL's `sort` and reloads the photos
    from the first page. It does not change the saved sort of item 5.
13. The Target on the shelf page is the same saved target as on the Library (one per drive,
    `app-target.md`). A target change there reloads the shelf's photos and count under the
    new target; the URL keeps `by` and `key`.

**Backend (018)**

14. `GET /api/addons/photo_diary/library/shelves` takes the target parameters of
    `app-target.md` item 6, `by` (required, one of the four), `sort` (default `newest`),
    `per_shelf` (1–20, default 12), `shelf_limit` (1–50, default 12) and `offset` (≥ 0,
    default 0). It answers `{shelves: [{key, label, count, file_ids}], total_shelves}`:
    the shelves in shelf order from `offset`, at most `shelf_limit` of them, each with its
    photo count and the ids of its first `per_shelf` photos in capture order. `label` is the
    tag's or collection's name, the folder's last segment, or `""` where the page supplies
    the text (`month` keys, `undated`, `no_tag`, `no_collection`, the root folder). A shelf
    with no photo is never returned.
15. `GET /api/addons/photo_diary/library/shelf` takes the target parameters, `by`, `key`,
    `sort`, `limit` (1–100, default 60) and `offset`. It answers `{file_ids, total, label}`:
    the shelf's photos in capture order from `offset`, the shelf's photo count, and its
    label as in 14. A key with no photo under the target answers `total: 0` and no ids,
    not an error.

### 2. Failure cases

- `/library/shelves` fails on the first page: the face shows the core's `RetryButton` in
  place of the shelves. A later page fails: a retry control under the drawn shelves; the
  drawn shelves stay.
- `/library/shelf` fails on the first page: the page's load error with retry
  (`LoadError`); a later page: a retry under the drawn photos.
- A 404 from any data route (drive locked, unknown drive, policy off): "not available", as
  today, on the Library and on the shelf page.
- A target parameter the core cannot normalise answers 400: the face or page shows its load
  error with retry; choosing another target is the way out (as `app-target.md`).
- An unknown `by`, a `sort` other than the two, or a missing `key` on `/library/shelf`
  answers 422. The shelf page reached with such a URL (typed or stale) shows its load
  error with a link back to the Library, not an empty grid.
- A shelf that has no photo under the target (a tag removed, a collection deleted, another
  target): the shelf page shows 写真はありません / No photos, with the back link.
- A photo found in the id list but no longer returned by the core's batch read (moved to
  trash between the two reads) is skipped, as the calendar's lists do.

### 3. States

- Face: Library, Calendar, Map, by the URL's `view` (item 2).
- Library: the target look-up running (no shelf request, as `app-target.md` item 4); first
  page loading (one untitled skeleton shelf, as the Video app); ready with shelves; ready
  with none (the core's empty state); failed. Further pages: idle, loading (a skeleton shelf
  below), failed (retry below).
- Classification and sort: one of four and one of two. A change goes from any state back to
  first page loading.
- Shelf page: target look-up running; loading; ready; empty; failed; more loading or failed,
  as the calendar's lists.
- A target change takes the Library and the shelf page back to first page loading, and
  shows nothing of the previous target meanwhile, including after a failed read.

### 4. Data read and written

- Core tables `files`, `file_exif`, `tags`, `file_tags`, `collections`, `collection_items`,
  and through `filtered_drive_files` what its filters read: read only.
- Core endpoint `POST /api/files/batch` (through `batchGetFiles`, as today): read.
- `localStorage`: the two keys of item 5 (new) and the target keys of SPEC-PD-016
  (unchanged).
- `sessionStorage` `photo_diary:state:<drive>`: the Library adds its classification, sort,
  loaded shelf depth and scroll position (item 9 of section 9). The shelf page uses
  `photo_diary:shelf:<drive>` for its loaded depth and scroll position keyed by
  `by`, `key`, `sort` and target.
- No table, no write to the core.

### 5. External services

None. The Library and the shelf page request no map tile.

### 6. Authorization

Both new routes run `_drive_scope` first (drive access and addon policy, one 404), like
every data route. Tags, collections and folders are read only within that drive
(`Tag.drive`, `Collection.drive`, `File.drive` equal to it).

### 7. Effect on existing features

- Calendar: reached at `?view=calendar`. Every behaviour of the calendar is unchanged
  except where the URL with no query was the calendar: a URL with no query is now the
  Library, so the in-place fresh start (a URL with no query reached while the page stays
  mounted) shows the Library, and the calendar's fade on "the first draw of a page loaded
  with no query" (`ui-polish.md` I3) now applies to the first draw of a page loaded with
  `?view=calendar` and no `month`, `date` or `undated`. Links that go to the calendar
  (a map section heading to its day, Today) carry `view=calendar`.
- Map: unchanged; reached at `?view=map` as today.
- Daily notes: unchanged. Going back from the editor returns to the URL it left, which
  carries `view=calendar`.
- The core's Home and sidebar entries point at the page with no query: they now open the
  Library.
- `photoTotal` and the page's count read on the map are reused for the Library.
- Tests that open the page with no query and expect the calendar are changed to open
  `?view=calendar`, or to expect the Library.

### 8. Error behavior

As section 2. Nothing new is logged; the routes raise the same `HTTPException`s as the
existing ones.

### 9. User-visible behavior

1. Tabs ライブラリ | カレンダー | 地図 / Library | Calendar | Map, in that order, in the
   tabs row at every width.
2. Library controls: 分類 / Group by and 並べ替え / Sort, as menus with the value shown.
3. Shelf titles and counts as Definitions; See all on every shelf, also on a shelf whose
   photos all fit in the row (as the Video app).
4. A photo in a shelf is a square-cropped or justified thumbnail as the agreed design
   draws it; the agreed design is saved in `docs/reviews/library/design/` before
   implementation.
5. Empty Library (no photo under the target): the core's empty state.
6. Shelf page title: the shelf's title as in Definitions; scope line `<drive> · N枚` /
   `<drive> · N photos`.
7. Going back from a photo opened in the Library returns to the Library with the same
   classification and sort, the same shelves loaded and the same scroll position. Going
   back from a photo opened on the shelf page returns to it with the same photos loaded
   and the same scroll position. State saved on one drive is never restored on another,
   and a saved position recorded under another target is dropped (as `app-target.md`).
8. Japanese and English strings live in the addon's `frontend/messages/{ja,en}.json`.

### 10. Non-functional

- Sized like the calendar: up to 50,000 photos and a few thousand tags, collections or
  folders on a drive. `/library/shelves` answers in one grouping query plus one query per
  returned shelf (at most 50); `/library/shelf` in two queries. Measured on the production
  `photos` drive (3,672 images) as part of R-5.
- Privacy: no new outside host, nothing sent outside the LAN. R-5 screenshots of real
  photos are not put on shared pages.
- No cache: each request is computed on demand, as the calendar is.

### Project-specific questions (`docs/process/PROJECT.md`)

- Migration: none; no table or column is added.
- WebSocket events: none emitted or consumed.
- Internal API: not used or changed.
- Addon boundary: core code is not changed. Beyond what Photo Diary imports today, the
  frontend imports `RetryButton`, `usePaged` and `useNearEnd` from `components/appshell/`
  and `EmptyState`; it imports nothing from the Video app's `components/videoapp/`.
- i18n: addon messages only.

## Touch points

Addon repository (`mamepenguin/Litloft-photo-diary-addon`):

- `backend/router.py`: the routes `GET /library/shelves`, `GET /library/shelf`; capture
  order expressions; tag, collection and folder grouping.
- `backend/schemas.py`: response models for the two routes.
- `frontend/PhotoDiaryPage.tsx`: the third tab, `view` parsing with the Library as default,
  the Library face, the count on the Library.
- `frontend/lib/pageUrl.ts`: `view` of `library | calendar | map`; `buildPageQuery` writes
  `view=calendar`.
- `frontend/LibraryFace.tsx` (new), `frontend/LibraryControls.tsx` (new),
  `frontend/PhotoShelf.tsx` (new), `frontend/lib/library.ts` (new: titles, keys, storage),
  `frontend/pages/shelf.tsx` (new sub-page), `frontend/ShelfPage.tsx` (new).
- `frontend/api.ts`: `fetchShelves`, `fetchShelf`.
- `frontend/lib/savedState.ts`: Library state; shelf page state.
- `frontend/CalendarView.tsx`, `frontend/MapView.tsx`, `frontend/SectionedGrids.tsx`: links
  and navigation that produce a calendar URL carry `view=calendar`.
- `frontend/messages/ja.json`, `frontend/messages/en.json`.
- Tests: `tests/` (backend), `frontend/*.test.tsx`, `e2e/` (layout of the Library, the shelf
  page, the tabs; back-navigation restore).
- `README.md`: the Library and the shelf page.
- `docs/specs/INDEX.md`: three rows.
- `docs/reviews/library/`: design, review and R-5 records.

Core repository: no change. Core names used by the addon frontend, read only:
`@/components/appshell/{AppHeader,RetryButton,usePaged,useNearEnd}`,
`@/components/EmptyState`, `@/components/FileGrid`, `@/components/PageFrame`,
`@/components/PageTabs`, `@/lib/api` (`batchGetFiles`, `getSmartFolders`),
`@/lib/appPrefs`, `@/lib/appTarget`. Core backend names: `app.models` (`File`, `FileExif`,
`Tag`, `file_tags`, `Collection`, `CollectionItem`, `active_file_filter`),
`app.routers.drives.filtered_drive_files`, as today.

Protected paths: none edited.

## Invariants

I1. Under any target and classification, every photo the target selects is in at least one
shelf, a `month` or `folder` shelf holds each photo exactly once across shelves, and a
shelf's `count` equals the `total` of `/library/shelf` for the same target, `by` and `key`.

I2. Under any target, a `month` shelf's count equals that month's count in
`/calendar/months` for the same target, and the `undated` shelf's count equals
`undated_count`.

I3. A photo whose `datetime_original` is `2026-10-31T23:30:00` is in the `2026-10` shelf
whatever the browser's or server's time zone is, and an undated photo is in the `undated`
shelf and never in a month shelf by its upload or file date.

I4. Within a shelf and on the shelf page, photos are in capture order for the sort in force,
undated photos after every dated one in both sorts, and paging with `offset` neither skips
nor repeats a photo when nothing changes between the requests.

I5. A tag or collection of another drive, a trashed or missing file, and a non-image file
appear in no shelf, count or list; `tag` and `collection` shelves list only names and ids
of the request's drive.

I6. Both routes answer the same 404 for a locked drive, an unknown drive and a drive whose
policy has the addon off, and 422 to `none=true` sent with a target parameter, as the
existing photo routes do.

I7. A page loaded with no query shows the Library; `?view=calendar` and `?view=map` show the
calendar and the map with every behaviour they had at the URL with no query and at
`?view=map`, including the fade of `ui-polish.md` I3 at `?view=calendar` alone.

I8. From a change of target, classification or sort on, no shelf, photo, count or title of
the previous choice is on screen, including while the new answer loads, after it fails, and
when an answer to an earlier request arrives late.

I9. Going back from a photo opened in the Library or on the shelf page restores the
classification, sort, loaded depth and scroll position it was opened from, never on another
drive and never under another target.

I10. The classification and sort chosen on a drive are in force on that drive's next load
of the Library and not on another drive's; a sort changed on the shelf page changes neither.

## Revises

SPEC-PD-008 I3. The fade runs when another month is drawn on screen by the viewer's navigation, or on the first draw of a page loaded with `?view=calendar` and no `month`, `date` or `undated`, and never under reduced motion; a refresh, a re-read of the same month, a target change, pressing a day, returning to the same month from the map, coming to the calendar from the Library, and a page loaded with any other query draw the surfaces at once.

## Checked, no action

- **Using the core's `GET /api/drives/{drive}/shelves`.** Its months and item order use
  `File.created_at` (file mtime) and it has no collection grouping; capture order needs
  `file_exif`, which only the addon's queries join. On the production drive the mtime month
  differs from the capture month for 5 of 2,756 dated photos, but undated photos (916) would
  be spread into mtime months, against `photo-diary.md` I2.
- **Extracting shared shelf components into the core first.** Decided against with the
  user (2026-11-14): the data source and the card differ; the addon follows the Video app's
  shape so extraction later is mechanical.
- **Reusing `ShelfBlock`.** It draws 16:9 video cards or 2:3 book cards in a column grid;
  photos are drawn by the addon's own shelf row so the layout can follow the agreed design.
- **Remembering the last face.** The Video app remembers its face; Photo Diary's face is in
  the URL, and the entry points open the Library (decided with the user). Back and Forward
  keep the face.
- **Tags and collections are 0 on the production drive.** In scope regardless: shelves are
  what the viewer organises towards (user, 2026-11-14).
- **Shelf order for tags by count.** Tags are themes; ordering them by date would hide large
  themes. Collections and folders are albums and years, ordered by their photos' dates.
- **Folder shelves sorted by name.** Rejected: names of hand-made folders do not sort by
  time, while YYYY folders sort by date either way under the date rule.
- **Videos (134 on the production drive).** Separate spec (user, 2026-11-14).
- **Core inventory tests.** Photo Diary is not a core submodule and is in no core file
  inventory; `pages/shelf.tsx` adds nothing to a core list.
- **Per-shelf "N more" or horizontal scrolling shelves.** The Video app uses one row and See
  all; the same here.
