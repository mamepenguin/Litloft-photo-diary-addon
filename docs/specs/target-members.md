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
merges to the core's `develop` first, and this addon's pull request follows. Photo Diary
is not a core submodule, so there is no pointer bump. The Library
(SPEC-PD-018 to 020) is already merged on `main` (pull request #11), and this change builds
on it.

Out of scope: daily notes (they keep ignoring the target); video in Photo Diary; the
Library's own classification and sort.

## Agreed design

No new artboard (agreed). The Target menu and Manage… are the core's (SPEC-CORE-118, D5
icons). A failed evaluation is drawn where and as each photo surface draws the failure of
its first load today (item 1.7). A member set too large replaces each photo surface's body
with the core's `EmptyState` with the `Images` icon and the existing `targetUnavailable`
string この対象は使えません / This target cannot be used as its title, as the core's Reading
app draws its too-large target (`readingApp.targetUnusable`).

## Definitions

- **Member target.** A Smart Collection target whose saved query has free text
  (`parseSearchQuery(query).text` non-empty), decided by the core's
  `resolveMemberTarget(folder, ["image"])`. A negated token such as `-tag:draft` is free
  text to `parseSearchQuery`, so every Smart Collection with a negated operator is a member
  target, as in the core's apps. Its kinds are the folder's kinds met with `image`.
- **Members.** The result of the core's `evaluateMemberTarget(drive, folder)`: `ready` with
  the evaluated file ids (what the Smart Collection's search page lists in the Files view,
  meaning search included), `failed`, or `tooLarge` (more than 10,000 ids, counted before
  narrowing to images).
- **Collection target.** A target id `collection:<id>` (core SPEC-CORE-118), resolved with
  the core's `resolveCollectionTarget(collection, ["image"])`.
- **Listing-parameter target.** Any other Smart Collection target, resolved by
  `resolveAppTarget` exactly as today. After this change only a Smart Collection with a
  duration part and no free text is unusable.
- **Photo routes.** `GET /calendar/months`, `GET /calendar/days`, `GET /photos`,
  `GET /points`, `GET /library/shelves`, `GET /library/shelf`. `/note` and `/map-config` are
  not photo routes.
- **Target query parameters.** `search`, `tag`, `folder`, `collection`, `size`,
  `favorite`, `liked`, `none`.
- **Ready.** The look-up of `app-target.md` item 4 has ended and, under a member target
  whose kinds hold `image`, the members are `ready`.

## Required items

### 1. Normal flow

**SPEC-PD-021 (member targets).**

1. *Backend.* Each photo route also accepts `POST` at the same path. It takes the `GET`'s
   query parameters other than the target query parameters, with the same validation and
   defaults (`month`, `date`, `undated`, `by`, `key`, `sort`, `offset`, `limit`,
   `per_shelf`, `shelf_limit`, as each route has them), and a JSON body
   `{"file_ids": [string, ...]}`: required, at most 10,000 entries counting duplicates, no
   empty string; duplicates otherwise change nothing. A `POST` whose query string holds any
   target query parameter key, whatever its value (`none=false`, `favorite=false` and an
   empty `search=` included), answers 422; the route reads the query string for these keys,
   since it does not declare them. The photo set is the drive's active images whose id is listed (an
   addon-owned body model; the photo set is narrowed with `filtered_drive_files(db, drive,
   type=["image"], file_ids=<body>)` or the equivalent `File.id IN` on the existing
   `_photos` query), so `file_ids: []` selects no photo. Each answer equals what the `GET`
   answers for that photo set, counts, ordering, paging, `undated_count`, shelves and
   points included. The `GET` routes are unchanged.
2. *Menu.* Photo Diary's `isUsable` returns true for a member target, so the Target menu
   and Manage… never list it disabled. This is decided from the saved query alone.
3. *Kinds.* When the member target's kinds hold no image, the target is today's empty
   target: every photo request sends `none=true` alone, and nothing is evaluated.
4. *Evaluation.* Otherwise, once the look-up has ended with a member target in force, the
   page (`PhotoDiaryPage`) and the shelf page (`ShelfPage.tsx`) each evaluate the members
   with the core's `useMemberTarget`: when they mount, and when the target changes to a
   member target. They hold the ids for that mount. While evaluating, the page is not
   ready: no photo request goes out; each photo surface shows what it shows today while the
   look-up runs; the Target control shows the Smart Collection's name; the scope line shows
   the drive name alone.
5. *Ready gates.* Everything that today waits for the end of the look-up waits for ready:
   photo requests, the page's and the shelf page's count read, the page's restore check
   (`app-target.md` item 8), the Library's restore (`library.md`), the shelf page's restore
   from `photo_diary:shelf:<drive>`, the calendar list's restore, and the start of the daily
   notes' second-read clock.
6. *Requests.* When ready, every photo request of the page and the shelf page (the
   calendar, a day's list and its preview, "No capture date", the map's points and pin
   lists, the Library's shelves and the shelf page) goes through the `POST` route with the
   members as `file_ids` and no target query parameter; the request's own parameters are
   sent as on the `GET`. An empty member list is sent as `file_ids: []`, never as an absent
   body or a `GET`.
7. *Failure.* When the evaluation is `failed`, each photo surface draws what it draws today
   when its first load fails, and its retry control evaluates again:
   - the Calendar view: `LoadError` alone, as on a failed first `/calendar/months` (no
     month bar, grid or note marks);
   - the Map view: `LoadError` as in its `failed` phase (no map stage);
   - the Library face: the `RetryButton` it shows when its first shelves load fails;
   - the shelf page: its header and sort control stay and `LoadError` shows as when its
     first page fails; a collection shelf's title shows what it shows before its first
     answer.
   When it is `tooLarge`, each surface's body (the Calendar view, the Map view, the Library
   face, the shelf page's photos) is the `EmptyState` of the agreed design, with no retry.
   In both, the scope line shows the drive name alone, the Target control shows the Smart
   Collection's name, nothing is restored, the saved states are not written (the page's
   flush on leaving keeps the values it read), and the page never falls back to the
   default target.
8. *What evaluates again.* A mount, a change of the target in force to a member target, and
   a retry after a failure. Nothing else: a write through the context menu (the Library and
   calendar re-read with the held members, so a photo whose tag was just removed stays
   until the next evaluation), the page's in-place fresh start (it keeps the target in
   force, so it keeps the members), and choosing the target in force again (which reloads
   nothing, as today; under too large the way out is another target).
9. *Target change.* Choosing a member target in the menu is a target change as today
   (`app-target.md` item 8). The members finishing, and a retry after a failure, are not
   target changes: the surfaces draw as on their first draw under the target and nothing
   saved is cleared.
10. *Going back.* The saved states' target is the target id in force. On going back, the
    restores of item 5, the map's centre, zoom and pin list included, run once ready,
    whether ready comes at once or after a retry; the members were evaluated again on that
    mount, so a photo meaning search no longer returns is gone from the restored view.

**SPEC-PD-022 (collection targets).**

1. The page and the shelf page load the drive's collections with the core's
   `getCollections` and pass them to the Target menu as `collections` (the list and its
   retry).
2. A saved `collection:<id>` is looked up in the collection list only: while it loads no
   photo request goes out and the control reads `…`; a saved Smart Collection id waits for
   the Smart Collection list only, as today; `default` waits for neither.
3. A found collection is a target: every photo request carries `collection=<its name>` as
   its only target query parameter, through the `GET` routes (the backend already takes
   `collection` and narrows to images). The Target control shows its name.
4. A collection that is not in the list, or a collection list that failed to load, gives
   the default target at once with the saved id kept; a retry that loads the list applies
   the saved collection as a target change, as a saved Smart Collection does today.
5. Choosing a collection is a target change (`app-target.md` item 8) and saves
   `collection:<id>` with `writeAppTarget`.

### 2. Failure cases

- `POST` with a missing, non-list or empty-string `file_ids`, more than 10,000 entries, or
  any target query parameter: 422. An invalid other parameter: as the `GET`. A locked drive
  or policy off: 404, "not available" as today.
- Evaluation throws, answers `complete: false` (including the addon status lookup
  failing), or more than 10,000 members: item 1.7. The intelligence addon off for the
  drive, or its search answering 404, is not a failure: the members are the listing-only
  members, as the core defines.
- A photo request under a ready member target fails: the surface's existing load error, as
  today.
- The collection list fails: SPEC-PD-022 item 4; Manage… shows the core's retry.
- The drive becomes locked while a member target is in force: the evaluation's requests
  fail and the failed drawing shows, with a retry that keeps failing, until a reload, which
  answers the Smart Collection list with 404 and so shows "not available" as today.
  Accepted (a lock during a visit is the only way to reach it).
- A collection renamed or deleted while the page is open: requests keep the old name and
  select no photo (or a collection created with that name meanwhile) until the page loads
  its lists again (a mount or a retry). Accepted.

### 3. States

Target in force: default; listing-parameter Smart Collection; empty; member target; a
collection. Look-up: running (no photo request, control `…`) → done, as today, per the
list the saved id needs. Member target: evaluating (not ready) → ready (`POST` requests) |
failed (retry → evaluating) | too large. A mount or a target change to a member target
starts at evaluating. Too large is left only by a target change or a new mount; ready
returns to evaluating only by a mount or a change of the target in force. A saved Smart
Collection id waits for the Smart Collection list only, a `collection:<id>` for the
collection list only, `default` for neither. Not allowed: an evaluation started by a write
through the context menu, the in-place fresh start, choosing the target in force again or
the arrival of a list; a photo request under a member target before ready; a
`GET` photo request or a target query parameter under a member target; a fall back to the
default target from failed or too large; an absent body for an empty member list; a
restore before ready; a saved state written under failed or too large.

### 4. Data read and written

- Read: core `files`, `file_exif` and, through `filtered_drive_files`, the tables its
  filters read; `GET /api/drives/{drive}/collections` (new), the Smart Collection list, and
  what `evaluateMemberTarget` reads (the core listing, `/api/addons/status` and, when on,
  the intelligence addon's meaning search through the core's proxy).
- Written: `localStorage` target and shown-set keys (unchanged keys; values may be
  `collection:<id>`); `sessionStorage` `photo_diary:state:<drive>` and
  `photo_diary:shelf:<drive>`, as today, kept untouched under failed and too large. No
  table.

### 5. External services

None outside Litloft. The evaluation calls the intelligence addon's search through the core
as the core's apps do; slow means the page stays in evaluating, with no time limit.

### 6. Authorization

Unchanged: the `POST` routes run `_drive_scope` first, as the `GET` routes do, and narrow
to `File.drive == drive`, so ids of another drive select nothing.

### 7. Effect on existing features

- The default target, listing-parameter targets and empty targets: unchanged requests and
  results.
- Smart Collections with free text that today resolve to `search` (name and path matches
  only) now list their members; every Smart Collection with a negated operator, unusable
  today, becomes a usable member target.
- Daily notes: unchanged while the target is ready. Under a failed evaluation or a set too
  large the Calendar view draws its load failure, so its note marks are not drawn and a
  day's note cannot be opened from the calendar until the target becomes ready or another
  target is chosen (a saved too-large target keeps it that way on every visit).
- The Library's classifications and shelves: computed over the target's photos, as today.
- Existing tests whose expectations change: in `frontend/Target.test.tsx`, `FULL`
  (`"beach tag:trip …"`, free text) becomes a member target, so its `FULL_WIRE` assertions
  are restated for a folder without free text (the same operators without `beach`) and a
  new case covers `FULL` as a member target; `NEGATED` (`-tag:draft`) moves from the
  disabled-row cases to the usable member-target cases. `tests/test_target.py` and
  `e2e/target.spec.ts` use `GET` routes and `tag:trip` and are unchanged. No assertion is
  otherwise loosened.

### 8. Error behavior

As in 2. Nothing new is logged; no log line contains a file id.

### 9. User-visible behavior

- A Smart Collection with free text shows in Photo Diary the photos its search page shows,
  and is never disabled in the Target menu.
- Collections are in the Target menu and Manage…, by name with Smart Collections, with the
  core's icons; choosing one shows its photos.
- No new string.
- Docs: `README.md` (the Target paragraph: collections; Smart Collections with free text;
  the note sentence gains "while the target can be shown").

### 10. Non-functional

- `file_ids` at most 10,000 per request; every photo request under a member target
  re-sends them (about 150 KB). The home LAN carries this.
- Each photo route, `/library/shelves` included, answers within 1 second at 50,000 photos
  with 10,000 `file_ids`, measured once before merge (the bound `photo-diary.md` and
  `app-target.md` set).
- One evaluation per mount, member-target change and retry, not per request.

## Touch points

- `backend/router.py` (the `POST` photo routes, their body model, `_photo_query` taking
  the ids), `backend/schemas.py` (the body model), `tests/` (new `POST` cases)
- `frontend/useTarget.ts` (collections, target ids, member target and its evaluation,
  ready), `frontend/api.ts` (`POST` with body under a member target),
  `frontend/lib/library.ts` (`ShelvesQuery` / `ShelfQuery` carrying the member shape),
  `frontend/PhotoDiaryPage.tsx`, `frontend/ShelfPage.tsx`, `frontend/LibraryFace.tsx`,
  `frontend/CalendarView.tsx`, `frontend/MapView.tsx`, `frontend/useDayPreview.ts`,
  `frontend/usePagedPhotos.ts`, `frontend/useLibraryPages.ts`, `frontend/LoadError.tsx`
  (reused), `frontend/messages/` (no new key), and their tests (`Target.test.tsx` as in 7)
- `e2e/pageSupport.ts` (stubs for `/collections`, the `POST` routes, and the requests the
  evaluation makes: the core listing with the folder's query, `/api/addons/status`, and the
  intelligence search through the proxy), `e2e/build-fixture.mjs` and `e2e/fixture/page/`
  if the page fixture is rebuilt
- `README.md`, `docs/specs/INDEX.md`
- Rules passed through: `.claude/rules/design-decisions.md` in the core (drive boundary:
  ids of another drive select nothing; no core-to-addon dependency; 404 when the addon is
  off for the drive), `.claude/rules/backend-conventions.md` (`import app.config as
  config`), `.claude/rules/frontend-conventions.md`. No protected path is edited.
- Core names used (SPEC-CORE-119): `EmptyState`, `parseAppTargetId`, `resolveCollectionTarget`,
  `resolveMemberTarget`, `evaluateMemberTarget`, `useMemberTarget`, `MEMBER_ID_LIMIT`,
  `getCollections`, `CollectionSummary`, `TargetMenuProps.collections`, and on the backend
  `filtered_drive_files(file_ids=)` if the route uses it

## Invariants

I1. The `POST` photo routes answer exactly what the `GET` routes answer for the same other
parameters over the photo set of the drive's active images whose id is listed
(`file_ids: []` selects no photo, never the whole drive); they answer 422 to any target
query parameter, a missing or invalid `file_ids`, an empty string or more than 10,000
entries; and the `GET` routes answer exactly as before.

I2. Under a member target whose kinds hold `image`, every photo request after ready is a
`POST` carrying the evaluated ids, an empty list included, and no target query parameter;
a member target whose kinds hold no image sends `none=true` alone and evaluates nothing.

I3. A failed evaluation makes each photo surface draw its first-load failure with a retry
that evaluates again, and a set over 10,000 the same with the この対象は使えません line and
no retry; in both the scope line shows no count and the page never uses the default target.

I4. Nothing is restored before ready: the page's, the Library's, the calendar list's, the
map's and the shelf page's restores wait for the members under a member target and run
once ready, also when ready comes after a retry; under failed or too large nothing is
restored and `photo_diary:state:<drive>` and `photo_diary:shelf:<drive>` are left as they
were, leaving the page included.

I5. Under a collection target every photo request carries `collection` = that collection's
name as its only target query parameter, through the `GET` routes, so the page shows
exactly the collection's active images; a `collection:<id>` not in the loaded list, or a
failed collection list, gives the default target without deleting the saved id; while a
saved `collection:<id>` is looked up no photo request goes out.

I6. Photo Diary passes the collection list and its retry to the Target menu, so its menu
and Manage… list the drive's collections, and choosing one saves `collection:<id>` for
Photo Diary only.

I7. Under the default target, a listing-parameter Smart Collection and an empty target,
every photo request is exactly what it was before this change.

I8. From a target change on, including to or from a member or collection target, no count,
tint, preview, list item, shelf, pin, pin list or N of the previous target is on screen,
also while an evaluation runs and after it fails; the members finishing or a retry is not a
target change and clears no saved state; a mount evaluates once, not once per request.

I9. Members are evaluated only on a mount, a change of the target in force to a member
target, and a retry after a failure: never on a write through the context menu, the
in-place fresh start, choosing the target in force again, or the arrival of the collection
or Smart Collection list; a saved Smart Collection id never waits for the collection list,
and the daily notes' second-read clock starts at ready.

## Revises

SPEC-PD-016 I1. Under any target, a photo appears in a day's count, tint, preview and list, in "No capture date", or as a map pin only if the target selects it: the core's file listing with the same parameters and `type=image` for a listing-parameter or collection target, the evaluated members that are active images for a member target; this holds after a target change made while the other view was hidden and after a restore when going back from a photo.
SPEC-PD-016 I2. Under any usable target that is ready, every image the target selects (as in I1) appears in exactly one day list or in "No capture date", and as a pin when it has a valid place.
SPEC-PD-016 I5. A day's note mark, a month that holds only notes, and the note shown in a day's panel are the same under every target the backend answers and, for a member target, whose members were evaluated (under a target that answers 400, a failed evaluation or a member set too large, the calendar shows its load failure instead).
SPEC-PD-016 I7. A Smart Collection with a duration part and no free text cannot be chosen, and one with free text (every one with a negated operator included) always can; a saved target that is gone or unusable gives the default target without deleting the saved id; and until the target is ready (the look-up running, or a member target's members being evaluated) no photo request is sent.
SPEC-PD-016 I11. The backend answers 422 to `none=true` sent with any target parameter, and to a `POST` carrying any target query parameter; treats `none=false` as absent on a `GET`; and answers 400, not 500 or an empty result, to a target parameter the core cannot normalise.
SPEC-PD-016 I16. The Target control's text and the menu's checked row always name the target in force: すべての写真 for the default and for every fallback of item 4, the Smart Collection's or collection's name otherwise (a member target's name also while it evaluates, after a failure and when too large), `…` only while the look-up runs.
SPEC-PD-005 I7. A note given text in the editor has its mark, its month and its text in the panel within the second read after coming back by the browser's Back, also when Back was pressed right after typing, when the target is ready on that visit (under a failed evaluation or a member set too large the calendar shows its failure instead); a restored note has them without a reload; and a note emptied in the editor loses its mark and is offered for writing again.
SPEC-PD-005 I8. The Today control goes to the browser's local date, also when that differs from the UTC date, and reaches a month with no photos and no notes on a drive with nothing dated; it is drawn whenever the calendar is (not under a failed evaluation or a member set too large).
SPEC-PD-018 I9. Going back from a photo opened in the Library or on the shelf page, reloading `?view=library`, and the shelf page's back link restore the classification, sort, loaded depth and scroll position left there once the target is ready (after a retry too; never while a member target has failed or is too large), never on another drive and never under another target or another classification or sort.

## Checked, no action

- Evaluating on the server: the core cannot run meaning search (no core-to-addon
  dependency); the browser evaluates, as the core's apps do.
- Narrowing the members in the browser: the calendar, map and shelves are computed on the
  server, and paging would drop members.
- Combining `file_ids` with target query parameters on a `POST`: no caller needs it (a
  member target sends no condition of its own), and the core's union meaning for
  `collection` would make the answer depend on which parameters came along; refused with
  422 instead.
- Importing the core's `FileIdsQuery`: it is not on the documented surface; the addon keeps
  its own model with the same rules.
- Telling a locked drive apart inside the evaluation: `evaluateMemberTarget` does not
  expose the status, and the reload path already shows "not available" (2).
- Keeping note marks under a failed evaluation or a set too large: the Calendar view hides
  them under a load failure today; drawing notes without photos would need a second
  calendar state. The cost under a saved too-large target is in 7.
- Evaluating again after a write or on re-choosing the target in force (decided not to):
  one evaluation per mount, as the core's apps; a reload or another target evaluates again.
- A cache of members across mounts (as the core's apps, not): correctness over speed.
- A collection target by id: the backend's `collection` takes names, unique within a drive
  across both kinds; the cost is the rename and delete case in 2.
- Showing new collections in a saved shown set: the core's rule (SPEC-CORE-118 item 4).
- `/note` and `/map-config`: not photo routes, untouched.
- A new design: agreed; the core's menu, each surface's existing failure drawing and the
  existing string.
