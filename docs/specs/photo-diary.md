# Photo Diary addon: look back at photos by date and by place

SPEC-ID: SPEC-PD-001
SPEC-ID: SPEC-PD-002
SPEC-ID: SPEC-PD-003
SPEC-ID: SPEC-PD-004

Approval: sha256:7182d1cce85a5722c5e63f31c56e1661df256693f5ef5f2f7db7acb425774610 Yuichi Senga 2026-10-31

## Summary

A viewer who uploads photos from trips and daily life can only reach them through folders.
This adds a new in-process, drive-scoped addon, `photo_diary`, in its own repository at
`addons/photo_diary`. It adds one page with two views of the current drive's photos, built
only from what the core already stores in `file_exif`. The addon's own code writes nothing to
the core.

**The core repository is not changed at all.** The addon is not a submodule and is not part of
a fresh clone of Litloft. An operator who wants it clones this repository to
`addons/photo_diary` and rebuilds. This spec and its review records live in this repository.

- **SPEC-PD-001**: a month calendar that marks the days with photos and opens the photo
  list of a day, plus a list of the photos that have no capture date.
- **SPEC-PD-002**: a map that shows capture places as points. Clicking a point lists its
  photos, split into one section per capture date.
- **SPEC-PD-003**: what the addon's API exposes: only active images of one drive the
  caller may open, and only while the drive's policy allows the addon.
- **SPEC-PD-004**: where map tiles come from, what reaches that server, and when it is
  contacted.

## Definitions

- **Photo**: a `files` row with `file_type = 'image'` that passes `active_file_filter()`.
- **Capture date**: the first 10 characters of `file_exif.datetime_original`, when they are
  a real calendar date in `YYYY-MM-DD` form. No time zone conversion is applied anywhere, in
  the backend or in the browser: the date is the one the camera's clock showed.
- **Undated photo**: a photo with no `file_exif` row, a NULL `datetime_original`, or a value
  whose first 10 characters are not a real date. Rows such as `0000-00-00T00:00:00` and
  `    -  -  T  :  :  ` exist in real data (3 of 604 in the development data on 2026-10-31).
- **Capture place**: `gps_lat` and `gps_lon` when both are non-NULL, latitude is within
  -90..90, longitude is within -180..180, and they are not both exactly 0. A camera without
  a fix can write 0,0, and drawing that as a point in the Gulf of Guinea would be wrong. One
  axis at 0 is valid.
- **Point**: what the map draws at the current zoom. MapLibre's built-in clustering, with a
  nominal radius of 40 pixels, decides which located photos one point stands for, and its
  cluster-leaves answer is the only source of that membership. "The same place" is therefore
  what one point covers at the zoom the viewer is looking at; there is no stored list of places.

## Required items

### 1. Normal flow

The viewer opens the sidebar row **Photo Diary**, which goes to
`/drive/{drive}/addons/photo_diary`. The calendar view opens first.

**Calendar (SPEC-PD-001)**

1. The page fetches `GET /calendar/months` and shows the newest month that has dated photos.
2. It fetches `GET /calendar/days?month=YYYY-MM` and draws a month grid, Sunday first. A day
   with photos is a button showing its photo count. A day without photos is plain text.
3. Previous and next move to the nearest month that has dated photos, and are disabled when
   there is none in that direction. A month picker lists every such month with its count.
4. Pressing a day fetches `GET /photos?date=YYYY-MM-DD` and shows the photos in the core's
   `FileGrid`, oldest first, 40 at a time, loading more on scroll.
5. An entry showing the undated count opens the undated photos through
   `GET /photos?undated=true`, by filename, loading the same way. It is absent when the count
   is 0.

**Map (SPEC-PD-002)**

1. Switching to the map view fetches `GET /map-config` and `GET /points`. The first time a map
   is created with no saved state, it fits all points, zooming in no further than 15. The map's maximum zoom is 19, and points keep
   merging at every zoom up to it, so photos with identical coordinates are always one point.
2. Points merge and split as the viewer zooms. A point standing for more than one photo
   shows its count, drawn as an HTML marker, so the map style has no glyph server.
3. Clicking a point opens its list. It does not zoom. Clicking the map elsewhere, or the point
   whose list is already open, does nothing.
4. The list has one section per capture date, newest date first. Within a section, photos are
   in the order `/points` returned them: oldest first. Located photos with no capture date
   form a last section, by filename. Each section heading shows the date and its count.
5. The list loads 40 files at a time on scroll through `POST /api/files/batch/get`, in that
   order. A heading appears with its first photo.
6. A dated section's heading links to that day in the calendar view.

**Both views**

- Every list has a close control. Pressing the day or entry already open does nothing.
- `FileGrid` receives `files`, `moreMayFollow` and `onRefresh`, and no selection, drag or sort
  props. Opening a photo goes to the core's file page. The core's context menu stays available,
  as on every other `FileGrid`; a rename, move or trash made there is the core's write.
- After such a write, `onRefresh` refetches the current view's counts or points and the open
  list, keeping its loaded depth and scroll position. A point's list keeps the file ids it opened
  with, reduced to those still in the new `/points`, so a photo moved to another drive leaves it;
  it does not re-cluster. Section headings and counts are recomputed. A point's list or the
  undated list that becomes empty closes. A day list that becomes empty shows its empty message.
- Going back from a photo returns to the same view with the same month, day, or map centre,
  zoom and open list, with the list loaded at least as far as before and scrolled to where it
  was. A restored list is fetched again and treated like one after `onRefresh`: a point's list is
  reduced to what is still in `/points`, and closes if nothing is left.
- The view, month and day are in the URL query (`view`, `month`, `date`, `undated`). Everything
  else is in session storage under a key that includes the drive: map centre and zoom, the open
  point's file ids, and each list's loaded count and scroll position. A reload in the same tab
  restores it. A URL with no query always means a fresh start, however it was reached (the sidebar
  row, Back to it, a reload of it): the saved state for the drive is cleared. A shared link to
  `view=map` in a new tab finds no saved state and fits all points. If saving fails, Back simply
  starts fresh.
- History: the view switch, pressing a day or the undated entry, closing a calendar list, and a
  section heading link each add an entry. Previous, next and the month picker replace the current
  one, so Back does not step through months. Opening and closing a point's list change nothing in
  the URL and add no entry. A list closed because it became empty replaces the current entry and
  drops `undated`. Navigation does not reload the page.
- Changing drive is a fresh start on the new drive. Saved state for the old drive stays under its
  own key.

### API

All routes are `GET` under `/api/addons/photo_diary`. "The data routes" below means every route
except `/assets`.

| Route | Response |
|---|---|
| `/calendar/months` | `{months: [{month: "YYYY-MM", count}], undated_count}`, newest month first |
| `/calendar/days?month=YYYY-MM` | `{days: [{date: "YYYY-MM-DD", count}]}`, oldest first, only days with photos |
| `/photos?date=YYYY-MM-DD&limit&offset` | `{file_ids: [], total}`, ordered by `datetime_original`, then filename, then id |
| `/photos?undated=true&limit&offset` | `{file_ids: [], total}`, ordered by filename, then id |
| `/points` | `{points: [{file_id, lat, lon, taken_at}]}`; dated photos first, ordered as `/photos?date`, then undated ones, ordered as `/photos?undated`. `taken_at` is `datetime_original` for a dated photo and `null` for an undated one |
| `/map-config` | `{tile_url, attribution}` |
| `/assets/{file}` | One bundled MapLibre file. `file` is a flat name from the list of files in `backend/assets/`, each carrying the MapLibre version in its name; any other name is 404. Answers `Cache-Control: public, max-age=31536000, immutable`, since a new version is a new name |

`limit` defaults to 40 and may be 1 to 100, the most `POST /api/files/batch/get` accepts.
`offset` defaults to 0. `/photos` takes exactly one of `date` and `undated=true`. A malformed
or non-real `month` or `date` (`2026-13`, `2026-02-30`), an out-of-range `limit`, and any other
combination are 422. A real month or date with no photos is a 200 with an empty list.

### Page URL

| In the URL | What the page does |
|---|---|
| Unknown `view` | Calendar |
| Malformed or non-real `month` or `date` | Treated as absent |
| No `month` and no `date` | Newest month with dated photos; a list opens only if `undated` is set |
| `date` without `month`, or in a different month | `date` wins and its month is shown |
| `date` and `undated` | `date` wins |
| `undated` while the undated count is 0 | No list opens |
| A real month with no photos | The grid with no buttons; previous and next go to the nearest months with photos |
| A real date with no photos | Its month, with the list showing the empty message |
| `view=map` with `month`, `date` or `undated` | Kept in the URL for the calendar; the map ignores them |
| Any `month` or `date` on a drive with no dated photos | The no-dated-photos message replaces the grid. `undated` still opens its list |

### 2. Failure cases

| Where | What happens |
|---|---|
| Missing `X-Lit-Drive` on a data route | 400 |
| Unknown or locked drive on a data route | 404, the same answer for both |
| Policy has the addon off for the drive | 404 on every data route. `/assets` takes no drive and is unaffected |
| The page is opened on a locked drive or with the policy off | The core's host route draws its own 404 page, because `/api/addons/status` drops the addon; no addon code runs |
| A data route answers 404 while the page is open (locked or changed meanwhile) | The not-available message replaces the whole page, both views, with no retry. It lasts until the page is opened again |
| `maplibre-gl` fails to load | The map view shows the load error with a retry |
| A refetch fails over a loaded list, grid or map | What is drawn stays, with the load error and a retry above it |
| A refetched `/points` is empty with a map already drawn | The map is removed and the empty message shown |
| Reading a point's members from the map fails on click | The list opens with the load error and a retry |
| A core refactor breaks an import the addon uses | Frontend: `docker compose up --build` fails and the running version is kept. Backend: the core logs it and skips the addon. `README.md` gives the recovery: move `addons/photo_diary` away and rebuild, or check out the last core commit its CI passed on |
| Any other failure of an initial fetch, including `batch/get` | That view or list shows the load error with a retry; the other view still works. The map view needs both `/map-config` and `/points`, and a failure of either fails the view |
| A later page of a list fails | The loaded photos stay, with a retry at the end of the list |
| The drive has no dated photos | The calendar shows its empty message, and the undated entry when there are undated photos |
| The drive has no located photos | The map view shows its empty message and creates no map, so no tile is requested |
| A tile in view fails, with any status or a network error | When the map next goes idle, a notice appears over it; points are still drawn on the blank map and open their lists. The next idle with no failed tile clears it |
| WebGL is unavailable | The map view shows its message; the calendar is unaffected |
| A photo is trashed or locked between the list of ids and the file fetch | `batch/get` omits it and the list shows the rest |

### 3. States

The page is stateless on the server. In the browser:

| State | Moves to | On |
|---|---|---|
| View `calendar` / `map` | The other | The view switch or a section heading link. Each view keeps its month, day, map position and open list while the page is open |
| Calendar list: none, one day, undated | Another of these | Pressing a day or the undated entry. The close control, or moving to another month, goes to none |
| Map list: none, one point's | One point's | Clicking a point, replacing any open list. Zooming and panning do not change it |
| Map list: one point's | None | The close control, or becoming empty after a refresh |
| Fetch: loading | Loaded or failed | The response |
| Fetch: loaded | Loading | Entering a view, moving month, opening a list, restoring one, or `onRefresh` |
| Fetch: failed | Loading | Retry, or the same triggers as loaded |

- Entering a view refetches its counts or points, which is when new photos appear. Switching
  views does not refetch a list left open; `onRefresh` and a restore do.
- Map: loading the library, then drawn; or library load failed (retry returns to loading); or WebGL
  unavailable, which is final for the page. The tile notice is on or off, by the rule in Failure
  cases, while drawn.
- Not-available is final for the page: no trigger leaves it.
- Of overlapping requests, only the latest applies. A response for month A arriving after the
  viewer moved to month B is discarded, and so is one for a drive the viewer has left.
- Back from a calendar day reached by a section heading returns to the map with its list open.
- Not allowed: a point's list staying open across a drive change; a day list open for a month
  other than the one shown; a list refetch changing the view.

### 4. Data read and written

| Store | Access |
|---|---|
| Core `files` | Read |
| Core `file_exif` | Read |
| `drives.json` policy, through `app.config` | Read |
| Tables owned by the addon | None |
| Browser session storage | Read and written, keyed by drive, for the state above. The core's `lib/listSnapshot.ts` is not used: it holds one folder listing's items and would overwrite the folder page's snapshot |

The addon's code inserts, updates and deletes nothing in the core DB or on disk.

### 5. External services

One: the map tile server. The browser requests tiles directly while a map is on screen.

- Default URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with the attribution
  `<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>`. On
  2026-10-31 it answered 200 to a request carrying a LAN referer.
- `PHOTO_DIARY_TILE_URL` and `PHOTO_DIARY_TILE_ATTRIBUTION` replace these. The operator sets
  them under the backend's `environment` in `docker-compose.override.yml`, and a change needs a
  restart. An unset or empty `PHOTO_DIARY_TILE_URL` means the default URL and default
  attribution. A set URL with an unset attribution shows none. The attribution is an operator's
  HTML fragment, drawn as MapLibre draws attribution.
- Tiles are raster, 256 pixels, up to zoom 19, for any server. A replacement server has to match;
  one that stops earlier shows the tile notice when the viewer zooms past its limit.
- Slow: the map background fills in late; points are not held back. Down or wrong: see failure
  cases. The backend never contacts the tile server.

### 6. Authorization

Anyone who may open the drive may use the addon. An in-process router is not behind the addon
proxy, so every data route, `/map-config` included, runs the same dependency in the addon's router:
require `X-Lit-Drive`, percent-decode it (the frontend sends `encodeURIComponent(drive)`), then
`check_drive_access(drive, get_unlocked_groups(request))`, then
`config.is_addon_feature_enabled(drive, "photo_diary", "index")`. Photo bytes and thumbnails stay
behind the core's existing routes. `/assets` is open because a script element cannot send the header
and the files are a public library; it serves only names from a fixed list, never a path.

### 7. Effect on existing features

- The scanner, `extract_exif` and `GET /api/files/{id}/exif` are unchanged.
- The addon appears in the addon policy table, the sidebar, the search jump list, the setup
  wizard's addon list and `/api/addons/status` through the existing generic loaders.
- The frontend image installs only the core's `package.json`, so a bare `import "maplibre-gl"` in
  the addon could not resolve and would fail the whole frontend build. MapLibre's released browser
  files (its license included) are therefore committed under `backend/assets/` at a pinned version,
  served by `/assets`, and loaded in the browser when a map is created. Outside `frontend/` they are
  invisible to the core's bundler, `tsc` and eslint, and no other page loads them. The addon types
  the few MapLibre calls it makes. If the current major's module form cannot load this way, the
  newest release that can is pinned instead.
- The core's generic loaders find the addon by its directory: the backend's `_load_addons`, both
  Dockerfiles' copy loops, `merge-addon-messages`, and `configure.py`'s `bundled_addons`. Measured on
  2026-10-31 at core `6f6c0b27f` with a stub addon: both images built with no core change, and the
  backend logged `Addon loaded: photo_diary`.
- Core guards that declare the addons by name (`escape-listeners.test.ts`,
  `check-coverage-denominator.mjs`) fail when an undeclared addon is present, so the core's full suite
  is not run with this addon in the tree. Development happens in a dedicated worktree of the core, not
  in the main checkout, and the addon's path is listed in `.git/info/exclude` so `git add -A` in the
  core cannot pick it up.
- WebGL cannot run in jsdom, so vitest covers the list grouping as a pure function and the map with
  MapLibre mocked. What only a browser can show (I7, I10, the visible attribution) is covered by a
  Playwright suite in `e2e/` with its own config: Chromium opens a fixture page that bundles the
  addon's map module and the real MapLibre files, and `page.route` answers `/points`, `/map-config`
  and tiles from generated data, so CI never contacts a tile server. The API's own properties are
  pytest against a real database. R-5 runs the whole page once on a full stack.

### 8. Error behavior

The viewer sees these messages. No status codes are shown. The addon adds no log lines beyond
the core's request logging; a 500 is logged by the core.

| Case | ja | en |
|---|---|---|
| Load error | 読み込めませんでした / 再試行 | Could not load / Retry |
| 404 | このドライブでは使えません | Not available on this drive |
| No dated photos | 撮影日のある写真はありません | No photos with a capture date |
| No photos on a day | この日の写真はありません | No photos on this day |
| No located photos | 位置情報のある写真はありません | No photos with a location |
| Tile failure | 地図を読み込めません | Map tiles could not be loaded |
| No WebGL | この環境では地図を表示できません | The map cannot be shown on this device |
| View switch | カレンダー / 地図 | Calendar / Map |
| Previous, next month | 前の月 / 次の月 | Previous month / Next month |
| Month picker | 月を選ぶ | Choose month |
| Close a list | 閉じる | Close |

### 9. User-visible behavior

- Sidebar row **Photo Diary** (ja: フォトダイアリー, key `photoDiary.nav.label`),
  no `icon` (the sidebar then draws its default `package` icon, since a new token would be a core
  change), placement `primary`, priority 30, so it follows Ask and Notes, on drives where
  the policy allows it. `ADDON_META` has `label` "Photo Diary", `scope` "drive", `href`
  `/addons/photo_diary`, and `description` "Look back at your photos on a calendar and a map." The
  addon declares no `policy_features`: its `index` is the only switch. When the addon is not
  checked out, nothing appears.
- Dates are formatted for the viewer's locale without shifting the day, with year, month, day and
  weekday in list headings, followed by the count (ja: 2026年10月3日(土) 5枚, en: Sat, Oct 3, 2026 ·
  5 photos).
- The calendar week starts on Sunday in every locale.
- A photo with a capture date and a capture place appears in both views. With only a date, it
  is in the calendar only. With only a place, it is on the map and in the undated list. With
  neither, it is in the undated list only.
- A future date a camera's clock wrote (for example 2099) is shown as written.
- A configured attribution stays visible on the map at every width.
- Undated entry and section label: ja 撮影日なし, en No capture date.
- Text is in `ja` and `en`. No emoji; icons are lucide.
- Layout and the loading appearance follow `DESIGN.md` and are agreed in a Design
  Artifact after this spec's approval and before implementation. The agreed artifact is recorded in
  this repository's `docs/reviews/`. This spec fixes behaviour, not layout.

### 10. Non-functional

- Size: the personal-tool scale of up to 50,000 photos on a drive. `/calendar/*`, `/photos` and
  `/points` are computed per request without a cache, and each answers within 1 second at that size
  on the development machine. `/points` returns all located photos because the browser does the
  clustering, and the map draws 50,000 points within 3 seconds in Chromium. Both are measured once
  before merge, with generated rows in a test database.
- Privacy: coordinates go only to a browser allowed to open the drive, which the core's `/exif`
  route already permits. A tile request's URL carries only `z/x/y`, so the server learns which map
  area is being viewed and never receives a photo's coordinates, id or name. It also sees the
  client's IP and user agent, as any web request does, and a `Referer` of at most the page's origin
  (the browser's default policy, which the tile server's usage policy relies on), never its path or
  query, which hold the drive name and the date.
- Concurrency: read-only short queries; no locks, no background work.
- Cost: none. The default tile server is a volunteer service with a usage policy that requires
  attribution and forbids heavy use. One household browsing a map is within it.

## Touch points

All in this repository (`mamepenguin/Litloft-photo-diary-addon`, default branch `main`, cloned to
`addons/photo_diary`):

- `backend/`: `__init__.py`, `router.py` with `ADDON_META`, read queries, schemas, `assets/`.
- `frontend/`: `Page.tsx`, the calendar and map components, `api.ts`, `messages/{ja,en}.json`, and
  vitest tests.
- `tests/`, `e2e/`, `pytest.ini`, `.coveragerc`, `Dockerfile.test`.
- `README.md`: what the addon does, how to install and update it, and the `PHOTO_DIARY_TILE_*`
  variables. This takes the place of the core's addon, API and configuration pages, none of which
  changes.
- `docs/specs/photo-diary.md`, `docs/reviews/`.
- `.github/workflows/ci.yml`: on push, pull request and weekly, because the core's CI never sees
  this addon. It builds `Dockerfile.test` against the core's `develop`, then in a core checkout runs
  `setup-addons.sh`, `merge-addon-messages`, `vitest run src/addons/photo_diary`, `tsc`, eslint on the
  addon's files, and the e2e suite. A coverage floor is set to the measured coverage.

Read from the core and not changed: `app.models` (`File`, `FileExif`, `active_file_filter`),
`app.auth`, `app.config`, `POST /api/files/batch/get`, `/api/addons/status`, `FileGrid`,
`PageFrame`, `useCurrentDrive`.

Rules passed through: the core's `.claude/rules/design-decisions.md` (drive boundary, file state,
addon discipline), `backend-conventions.md`, `frontend-conventions.md`, `DESIGN.md`.

Endpoints added: the seven routes above, all the addon's own. Events: none. Core tables, the core's
Internal API and the core's files are not changed.

## Invariants

I1. A photo whose `datetime_original` is `2026-10-03T23:30:00` is counted, listed and displayed under 3 October 2026 whatever the browser's or server's time zone is.

I2. An undated photo, including one whose `datetime_original` is `0000-00-00T00:00:00` or starts with a non-real date such as `2026-02-30`, appears in `/photos?undated=true` and `undated_count`, and on no calendar day. It is never placed by its upload or file date.

I3. Every photo appears in exactly one day list or in the undated list, and the counts in `/calendar/months` and `/calendar/days` equal the `total` of the matching `/photos` query.

I4. A trashed file, a missing file, and a non-image file with a `file_exif` row appear in no count, list or point.

I5. No route returns or counts a file from a drive other than the one named by `X-Lit-Drive`, a percent-encoded non-ASCII drive name reaches its own drive, a locked drive and an unknown drive get the same 404 on every data route, and every data route answers 404 for a drive whose policy has the addon off.

I6. Going back from a photo restores the view, month, day or map position and open list it was opened from; state saved on one drive is never restored on another, and a response for a month or drive the viewer has left is discarded.

I7. Clicking a point lists every photo that point stands for and no other, including several photos with identical coordinates at zoom 19 and a point standing for more than 100 photos; after a refresh or a restore, a photo no longer in `/points`, such as one moved to another drive, is gone from the list.

I8. Photos from one place taken on different dates are in separate sections, newest date first, and a section's photos are in the same order as `/photos?date` for that date.

I9. A photo with no capture place, with coordinates of exactly 0,0, or out of range, is not on the map. A photo with a capture place and no capture date is on the map, in the last section of its list.

I10. No tile request is made while only the calendar view has been opened or when the drive has no located photos; a tile request's URL is the configured URL with only `z`, `x` and `y` filled in, and its `Referer` is at most the page's origin; and the map contacts no other outside host.

## Checked, no action

- **HEIC photos.** `extract_exif` calls `img._getexif()`, which HEIC images do not have, so it
  returns `None` for them (measured on 2026-10-31 in the backend image with a synthetic file). That is
  an existing core bug, also visible in the core's own EXIF panel, and the addon does not depend on
  its fix: until it is fixed, HEIC photos are undated and off the map. The fix belongs to the core's
  bug-fix path. The addon needs no change for it, because the scanner re-extracts files that have no
  `file_exif` row. Tests do not pin HEIC as undated, and `README.md` states the limit until then.
- **Distribution.** How the addon reaches other installs (a submodule, a bundled default, a catalogue)
  is decided later. Nothing here forecloses it; adding it as a submodule then means adding it to the
  core's guards and docs.
- **The core's process ledger.** A ledger row at `implemented` needs a citation in a commit the core
  pins, which this addon never has, so the spec is not in `docs/specs/INDEX.md`. The IDs use their own
  `SPEC-PD-` prefix, so they cannot collide with the core's `SPEC-ADDON-` numbers. The approval line
  and hash follow the same form, computed with the core's `scripts/process/spec-hash.sh`. Reviews are
  fresh-agent reviews at a fixed commit, recorded in `docs/reviews/`.
- **In-process, not a service.** A service would need `file_exif` through the Internal API, where
  it fails R3 (no second addon), or the read-only DB mount, plus a container, for six read routes.
- **Self-hosted tiles (PMTiles).** The user chose the external server. The configurable URL leaves
  room for a self-hosted raster server; PMTiles itself is not built.
- **Merging drives.** A trip split across two drives appears separately. A drive is a security
  boundary.
- **Videos.** Their capture date and place are not in `file_exif`.
- **Place names and reverse geocoding.** Sending coordinates to a geocoder would break the privacy
  limit in item 10, and a local gazetteer is a separate project.
- **Trip grouping, "on this day", thumbnails in calendar cells, a today marker, and dates guessed
  from filenames.** Not requested for this version.
- **Registration date or file mtime as a fallback date.** Rejected: it would silently place a photo
  on the day it was uploaded, which is a wrong answer in normal use (I2).
- **A cache or addon table for dates.** Computing per request cannot go stale after a move, trash
  or rescan. There is no index on the date or GPS columns and core schemas stay unchanged, so this
  is what the size measurement in item 10 checks. Revisit only if it fails.
- **Live updates over WebSocket.** Looking back at old photos does not need them.
- **Leaflet.** Lighter, but MapLibre has clustering built in and can later read self-hosted vector
  tiles.
- **Internal API policy.** No endpoint is added to `routers/internal.py`.
- **Promised above, checked by acceptance tests, R-5 or review, and not given an invariant line**
  (`/spec` asks for five to ten): `/map-config` defaults, 422 validation, the page URL table, `/assets`
  serving only its fixed names, always-visible attribution, section counts, points staying clickable
  after a tile failure, and the addon's code holding no write to the core.
- **iOS.** The page runs in the app's web view, and the app itself is not changed. R-5 checks the
  map in the iOS Simulator. A real device is not checked by an agent.
