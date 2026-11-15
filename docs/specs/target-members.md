# Photo Diary: Smart Collections by their members, and collections as a Target

SPEC-ID: SPEC-PD-021
SPEC-ID: SPEC-PD-022

Approval:

## Summary

Photo Diary's Target turns a Smart Collection into listing parameters
(`resolveAppTarget`), so a Smart Collection with free text selects only the photos whose
name or folder path matches the words, while its search page and the core's Video and
Reading apps (SPEC-CORE-117) also take the photos meaning search finds. And the Target
menu offers no collection, so a set of photos gathered by hand cannot be the target. This
spec brings both to Photo Diary. The user is the one person who runs Litloft.

- **SPEC-PD-021**: a Smart Collection with free text is a **member target**: the page
  evaluates it as the core's apps do and every photo request carries the member ids in a
  POST body.
- **SPEC-PD-022**: the drive's collections are listed in the Target menu and Manage…, and a
  collection is a target sent as `collection=<name>`.

**Order.** It needs the core change `docs/specs/app-target-collections.md` (SPEC-CORE-118,
SPEC-CORE-119) in the core repository: `TargetMenuProps.collections`, the target-id and
collection-target helpers, the member-target helpers and `filtered_drive_files`'s
`file_ids` on the documented surface. The two specs are approved together; the core change
merges to the core's `develop` first, and this addon's pull request follows.

Out of scope: daily notes (they keep ignoring the target); video in Photo Diary; the
Library's own classification and sort.

## Agreed design

No new artboard (agreed). The Target menu and Manage… are the core's (SPEC-CORE-118, D5
icons). A failure reuses this addon's `LoadError` (読み込めませんでした and 再試行); a
member set that is too large reuses the `targetUnavailable` line この対象は使えません /
This target cannot be used.

## Definitions

- **Member target.** A Smart Collection target whose saved query has free text
  (`parseSearchQuery(query).text` non-empty; a negated token is free text), decided by the
  core's `resolveMemberTarget(folder, ["image"])`. Its kinds are the folder's kinds met with
  `image`.
- **Members.** The result of the core's `evaluateMemberTarget(drive, folder)`: `ready` with
  the evaluated file ids (what the Smart Collection's search page lists in the Files view,
  meaning search included), `failed`, or `tooLarge` (more than 10,000 ids, counted before
  narrowing to images).
- **Collection target.** A target id `collection:<id>` (core SPEC-CORE-118), resolved with
  the core's `resolveCollectionTarget(collection, ["image"])`.
- **Listing-parameter target.** Any other Smart Collection target, resolved by
  `resolveAppTarget` exactly as today.
- **Photo routes.** `GET /calendar/months`, `GET /calendar/days`, `GET /photos`,
  `GET /points`, `GET /library/shelves`, `GET /library/shelf`. `/note` and `/map-config` are
  not photo routes.

## Required items

### 1. Normal flow

**SPEC-PD-021 (member targets).**

1. *Backend.* Each photo route also accepts `POST` at the same path, with every query
   parameter its `GET` takes (with the same validation and defaults) and a JSON body
   `{"file_ids": [string, ...]}`: required, at most 10,000 entries, no empty string;
   duplicates change nothing. The photo set is narrowed with `filtered_drive_files(db,
   drive, type=["image"], <the target query parameters>, file_ids=<body>)`, so with no
   `collection` parameter a photo is in the set only when its id is listed, and
   `file_ids: []` selects no photo. Each answer equals the `GET`'s answer for the photos so
   selected, counts, ordering and paging included. `none=true` with a `POST` answers 422
   (the body counts as a target). The `GET` routes are unchanged.
2. *Menu.* A member target is usable whatever else its query holds: Photo Diary's
   `isUsable` returns true for it, so the Target menu and Manage… never list it disabled.
   This is decided from the saved query alone.
3. *Kinds.* When the member target's kinds hold no image, the target is today's empty
   target: every photo request sends `none=true` alone, and nothing is evaluated.
4. *Evaluation.* Otherwise, once the Smart Collection list has loaded and the target is in
   force, the page (`PhotoDiaryPage`) and the shelf page (`ShelfPage.tsx`) each evaluate
   the members when they mount and when the target changes to a member target, and hold the
   ids for that mount. While evaluating, no photo request goes out; each photo surface
   shows what it shows while a saved target is looked up today; the Target control shows
   the Smart Collection's name; the scope line shows the drive name alone.
5. *Requests.* When the members are `ready`, every photo request of the page and the shelf
   page goes through the `POST` route with the members as `file_ids` and none of the
   target's query parameters (`search`, `tag`, `folder`, `collection`, `size`, `favorite`,
   `liked`, `none`). The request's own parameters (month, date, `undated`, `by`, `key`,
   `sort`, offset and limit) are sent as on the `GET`. An empty member list is sent as
   `file_ids: []`, never as an absent body.
6. *Failure.* When the evaluation is `failed`, every photo surface's body (the Calendar
   view, the Map view, the Library face and the shelf page's photos) is replaced by one
   `LoadError` whose 再試行 evaluates again; when it is `tooLarge`, by the
   この対象は使えません line with no retry. The scope line shows the drive name alone, the
   Target control shows the Smart Collection's name, and the page never falls back to the
   default target because of either.
7. *Target change.* Choosing a member target in the menu is a target change as today
   (`app-target.md` item 8): surfaces go back to their loading state, saved list positions
   and the pin list are cleared, and a response under the previous target is discarded.
   An evaluation that finishes, and a 再試行 after a failure, are not target changes: the
   surfaces draw as on their first draw under the target, and nothing saved is cleared.
8. *Going back.* The saved state's target is the target id in force. On going back to the
   page, the restore check of `app-target.md` item 8 runs once the target is ready (look-up
   done and, for a member target, members `ready`). Members are evaluated again on that
   mount, so a photo the meaning search no longer returns is gone from the restored view.
   Under a failure or a set too large nothing is restored and the saved state is kept.

**SPEC-PD-022 (collection targets).**

1. The page and the shelf page load the drive's collections
   (`GET /api/drives/{drive}/collections`) with the Smart Collections and pass them to the
   Target menu with their retry.
2. A saved `collection:<id>` is looked up in the collection list only: while it loads no
   photo request goes out and the control reads `…`; a saved Smart Collection id waits for
   the Smart Collection list only, as today.
3. A found collection is a target: every photo request carries `collection=<its name>` and
   no other target parameter, through the `GET` routes (the backend already takes
   `collection` and narrows to images). The Target control shows its name.
4. A collection that is not in the list, or a collection list that failed to load, gives
   the default target at once with the saved id kept; a retry that loads the list applies
   the saved collection as a target change, as a saved Smart Collection does today.
5. Choosing a collection is a target change (`app-target.md` item 8) and saves
   `collection:<id>` with `writeAppTarget`.

### 2. Failure cases

- `POST` with a missing, non-list or empty-string `file_ids`, more than 10,000 entries, or
  with `none=true`: 422. An invalid query parameter: as the `GET`. A locked drive or policy
  off: 404, "not available" as today.
- Evaluation throws, answers `complete: false` (including the addon status lookup
  failing), or more than 10,000 members: 1.6. The intelligence addon off for the drive, or
  its search answering 404, is not a failure: the members are the listing-only members, as
  the core defines.
- A photo request under a ready member target fails: the surface's existing load error, as
  today.
- The collection list fails: SPEC-PD-022 item 4; Manage… shows the core's retry.
- A collection renamed while the page is open: requests keep the old name and select no
  photo until the page loads its lists again (a mount or a retry). Accepted.

### 3. States

Target in force: default; listing-parameter Smart Collection; empty; member target; a
collection. Look-up: running (no photo request, control `…`) → done, as today, per the
list the saved id needs. Member target: evaluating (no photo request) → ready (POST
requests) | failed (再試行 → evaluating) | too large. A mount or a target change to a member
target starts at evaluating. Not allowed: a photo request under a member target before it
is ready; a `GET` photo request carrying a member target's query parameters; a fall back to
the default target from failed or too large; a request body omitted for an empty member
list.

### 4. Data read and written

- Read: core `files`, `file_exif` and, through `filtered_drive_files`, the tables its
  filters read; `GET /api/drives/{drive}/collections` (new), the Smart Collection list, and
  what `evaluateMemberTarget` reads (the core listing and, when on, the intelligence
  addon's meaning search through the core's proxy).
- Written: `localStorage` target and shown-set keys (unchanged keys; values may be
  `collection:<id>`); `sessionStorage` `photo_diary:state:<drive>` as today. No table.

### 5. External services

None outside Litloft. The evaluation calls the intelligence addon's search through the core
as the core's apps do; slow means the page stays in evaluating, with no time limit.

### 6. Authorization

Unchanged: the `POST` routes run `_drive_scope` first, as the `GET` routes do, and
`filtered_drive_files` is called with that drive, so ids of another drive select nothing.

### 7. Effect on existing features

- The default target, listing-parameter targets and empty targets: unchanged requests and
  results.
- Smart Collections with free text that today resolve to `search` (name and path matches
  only) now list their members; those with a negated operator or a duration part and free
  text, unusable today, become usable.
- Daily notes: unchanged while the target is ready. Under a failed evaluation or a set too
  large the Calendar view's body is replaced, so its note marks are not drawn there (as
  under a load error today).
- The Library's classifications and shelves: computed over the target's photos, as today.
- The e2e page support stubs the collection list and the `POST` routes.

### 8. Error behavior

As in 2. Nothing new is logged; no log line contains a file id.

### 9. User-visible behavior

- A Smart Collection with free text shows in Photo Diary the photos its search page shows,
  and is never disabled in the Target menu.
- Collections are in the Target menu and Manage…, by name with Smart Collections, with the
  core's icons; choosing one shows its photos.
- No new string.
- Docs: `README.md` (the Target paragraph: collections; Smart Collections with free text).

### 10. Non-functional

- `file_ids` at most 10,000 per request; every photo request under a member target
  re-sends them (about 150 KB). The home LAN carries this.
- Each photo route answers within 1 second at 50,000 photos with 10,000 `file_ids`,
  measured once before merge (the bound `photo-diary.md` and `app-target.md` set).
- One evaluation per mount and target change, not per request.

## Touch points

- `backend/router.py` (the `POST` photo routes, the body model, `_photo_query` taking
  `file_ids`), `backend/schemas.py` if the body model lives there, `tests/`
- `frontend/useTarget.ts` (collections, target ids, member target and its evaluation),
  `frontend/api.ts` (`POST` with body when the target carries members),
  `frontend/PhotoDiaryPage.tsx`, `frontend/ShelfPage.tsx`, `frontend/LibraryFace.tsx`,
  `frontend/CalendarView.tsx`, `frontend/MapView.tsx`, `frontend/usePagedPhotos.ts`,
  `frontend/useLibraryPages.ts`, `frontend/LoadError.tsx` (reused), and their tests
- `e2e/` page support (stubs for the collection list and the `POST` routes)
- `README.md`
- Core names used (SPEC-CORE-119): `filtered_drive_files(file_ids=)`, `parseAppTargetId`,
  `resolveCollectionTarget`, `resolveMemberTarget`, `evaluateMemberTarget`,
  `useMemberTarget`, `MEMBER_ID_LIMIT`, `getCollections`, `TargetMenuProps.collections`

## Invariants

I1. Under a ready member target, a photo appears in a day's count, tint, preview and list,
in "No capture date", in a Library shelf or the shelf page, or as a map pin only if it is an
active image of the drive whose id is among the evaluated members, and every such image
appears in exactly one day list or in "No capture date" and as a pin when it has a valid
place.

I2. The `POST` photo routes answer exactly what the `GET` routes answer for the same query
parameters with the photo set restricted by `file_ids` (without `collection`, only listed
ids; `file_ids: []` selects no photo); they answer 422 to `none=true`, a missing or invalid
`file_ids`, an empty string, or more than 10,000 ids; and the `GET` routes answer exactly as
before.

I3. Under a member target no photo request goes out before its evaluation is ready; every
photo request after it is a `POST` carrying the evaluated ids, an empty list included, and
none of the Smart Collection's query parameters.

I4. A failed evaluation replaces each photo surface's body with one `LoadError` whose
再試行 evaluates again, and a set over 10,000 with the この対象は使えません line; in both
the scope line shows no count, the Target control shows the Smart Collection's name, and
the page never uses the default target.

I5. Under a collection target every photo request carries `collection` = that collection's
name as its only target parameter, so the page shows exactly the collection's active
images; a `collection:<id>` not in the loaded list, or a failed collection list, gives the
default target without deleting the saved id.

I6. Under the default target, a listing-parameter Smart Collection and an empty target,
every photo request is exactly what it was before this change.

I7. A Smart Collection with free text is never disabled in the Target menu or Manage…,
whatever else its query holds.

I8. From a target change on, including to or from a member or collection target, no count,
tint, preview, list item, shelf, pin, pin list or N of the previous target is on screen,
also while an evaluation runs and after it fails; an evaluation finishing or a 再試行 is
not a target change and clears no saved state.

## Revises

SPEC-PD-016 I1. Under any target, a photo appears in a day's count, tint, preview and list, in "No capture date", or as a map pin only if the target selects it: the core's file listing with the same parameters and `type=image` for a listing-parameter or collection target, the evaluated members that are active images for a member target; this holds after a target change made while the other view was hidden and after a restore when going back from a photo.
SPEC-PD-016 I2. Under any usable target that is ready, every image the target selects (as in I1) appears in exactly one day list or in "No capture date", and as a pin when it has a valid place.
SPEC-PD-016 I5. A day's note mark, a month that holds only notes, and the note shown in a day's panel are the same under every target the backend answers and whose members, for a member target, were evaluated (under a target that answers 400, a failed evaluation or a member set too large, the calendar shows its load error or the この対象は使えません line instead).
SPEC-PD-016 I7. A Smart Collection with a negated operator or a duration part and no free text cannot be chosen, one with free text always can; a saved target that is gone or unusable gives the default target without deleting the saved id; and while a non-default saved target is being looked up, or a member target's members are being evaluated, no photo request is sent.
SPEC-PD-016 I11. The backend answers 422 to `none=true` sent with any target parameter or with a `file_ids` body, treats `none=false` as absent, and answers 400, not 500 or an empty result, to a target parameter the core cannot normalise.
SPEC-PD-016 I16. The Target control's text and the menu's checked row always name the target in force: すべての写真 for the default and for every fallback of item 4, the Smart Collection's or collection's name otherwise (a member target's name also while it evaluates, after a failure and when too large), `…` only while the look-up runs.

## Checked, no action

- Evaluating on the server: the core cannot run meaning search (no core-to-addon
  dependency); the browser evaluates, as the core's apps do.
- Narrowing the members in the browser: the calendar, map and shelves are computed on the
  server, and paging would drop members.
- Keeping note marks under a failed evaluation: the Calendar view already hides them under a
  load error; drawing notes without photos would need a second calendar state.
- A cache of members across mounts (agreed not to, as the core's apps): correctness over
  speed; going back from a photo evaluates again.
- A collection target by id: the backend's `collection` takes names, unique within a drive
  across both kinds; the cost is the rename case in 2.
- Showing new collections in a saved shown set: the core's rule (SPEC-CORE-118 item 4).
- `/note` and `/map-config`: not photo routes, untouched.
- A new design: agreed; the core's menu, `LoadError` and the existing string.
