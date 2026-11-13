# Photo Diary: a Target like the core's apps, and the view tabs in the tabs row

SPEC-ID: SPEC-PD-016
SPEC-ID: SPEC-PD-017

Approval: sha256:858f86b43d74dd22d947dd21e3207661a4845d4fa12b57c3ac22f898028bbd41 Yuichi Senga 2026-11-13

## Summary

The core's Video and Reading apps let the viewer replace the app's default target with one
of the drive's smart folders. Photo Diary always shows every image of the drive, so
screenshots, saved images and scans tint the calendar and pin the map beside the camera's
photos. This change gives Photo Diary the same header and Target as the core's apps.

- **SPEC-PD-016**: the Target. The default target is every active image of the drive; a
  smart folder may replace it. The calendar's counts and tints, a day's photos and its
  preview, the "No capture date" list, the map's pins and the header's count all follow the
  target. Daily notes do not: a note belongs to its date, so its mark, its month and the
  note in a day's panel stay whatever the target. The choice is shared by Calendar and Map
  and remembered per drive.
- **SPEC-PD-017**: the header. Photo Diary draws the core's `AppHeader`, with the quiet
  Target the core's SPEC-CORE-099 introduces for every app (title row's right end on a wide
  layout, end of the scope line on a phone), and the Calendar / Map tabs move to the tabs
  row under the title at every width, where the core's apps put their tabs. This replaces the
  wide-layout placement in `ui-polish.md` (SPEC-PD-012), which put the tabs at the title
  row's right end. That placement has no invariant line in SPEC-PD-012; the new placement
  is I10 here.

**Order.** It needs the core change `docs/specs/addon-app-header.md` (SPEC-ADDON-106 and
SPEC-CORE-099) in
the core repository: the addon app key, `resolveAppTarget`, `readAppTarget` /
`writeAppTarget`, and `filtered_drive_files` on the documented import surface. The two
specs are approved together; the core change merges to the core's `develop` first,
because this addon's CI builds against it, and this addon's pull request follows. The
addon is not a core submodule, so there is no pointer bump.

Out of scope: Discover / Library faces and "on this day" shelves; a target for notes; any
change to the map's style or the calendar's layout beyond the header.

## Required items

### 1. Normal flow

**Header (017)**

1. The viewer opens `/drive/{drive}/addons/photo_diary`. The header is the core's
   `AppHeader`: the `Images` icon tile, the title フォトダイアリー / Photo Diary, the scope
   line `<drive> · N枚` / `<drive> · N photos`, and the quiet Target control, laid out as
   the core's SPEC-CORE-099 says: at 640px and wider at the right end of the title row;
   below 640px the title is alone on its row and the Target sits at the end of the scope
   line. Under the header, at every width, the tabs row holds カレンダー / Calendar and
   地図 / Map (`PageTabs`, as today).
2. N is the number of photos under the target: the sum of `/calendar/months` counts plus
   `undated_count`, as today. While it is unknown the scope line shows the drive name
   alone.
3. The "not available" frame (404) and the frame drawn before the drive is known keep
   today's `PageHeader` with no Target button and no tabs.

**Target (016)**

4. The page reads the drive's smart folders (`GET /api/drives/{drive}/smart-folders`) and
   the saved target (`readAppTarget(drive, { addon: "photo_diary" })`), and resolves the
   folder with `resolveAppTarget(folder, ["image"])`.
   - The default target, a saved id whose folder is not in the list, and a folder that
     resolves unusable all give the default target; the saved id is kept.
   - While the list loads and a non-default id is saved, no photo request goes out. The
     look-up ends when the list loads or fails; on a failure the default target is used at
     once.
5. The Target control reads the target's name (the word 対象 / Target is not drawn; the
   control's accessible name is `<label>: <name>`, `対象: すべての写真` for example, and
   `対象: …` during the look-up): すべての写真 / All photos for the default
   target (including every fallback in 4), or the smart folder's name; `…` only while the
   look-up of 4 is running. Pressing it opens the core's `TargetMenu` with
   `app = { addon: "photo_diary" }`, `defaultTargetTypes = ["image"]`, `selectedId` = the
   folder in force or `"default"`, and `currentCount` = N. It lists the default row with
   the drive's active images, the folders of the viewer's shown set and **Manage…**. A
   folder whose query has a negated operator or a duration part is listed disabled with
   この対象は使えません / This target cannot be used. The viewer may choose while the list
   is loading, as in the core's apps.
6. Wire contract. Every photo request carries the target as query parameters:
   `GET /calendar/months`, `GET /calendar/days`, `GET /photos` (a day, and
   `undated=true`) and `GET /points`, including the page's own count read on the map.
   - A usable target sends `search`, `tag` (repeated), `folder` (repeated), `collection`
     (repeated), `size` (repeated), `favorite=true`, `liked=true`, each only when the
     resolved params hold it. `params.type` is not sent; the backend has no `type`
     parameter and always uses `type=["image"]`. The default target sends none of them.
   - A target that resolves to empty (its kinds hold no image) sends `none=true` alone.
   - The backend answers 422 when `none=true` arrives with any target parameter.
     `none=false` is the same as no `none`.
   - The photo routes declare exactly these target parameters: `search` (at most 200
     characters, 422 above that, shown by the page as it shows a 400), `tag`, `folder`,
     `collection`, `size` (each repeatable), `favorite` and `liked` (booleans with the
     listing's meaning; the page sends only `true`), and `none` (boolean). Any other query
     parameter is ignored, as FastAPI does. For the 422 with `none=true`, a parameter
     counts as present when it is given with any value except an empty `search`.
7. The backend narrows its photo set to the ids of `filtered_drive_files(db, drive,
   type=["image"], ...)` with those parameters, so a target gives the same images as the
   core's listing `GET /api/drives/{drive}/files?type=image&...`. With `none=true` it counts
   and lists no photo. Note dates in `/calendar/months` and `/calendar/days`, and the
   `/note` route, take no target and are computed as today.
8. A target change is any change of the target in force: the viewer choosing in the menu,
   or the saved folder taking effect when a retried list loads. On a target change the page
   saves a viewer's choice with `writeAppTarget` and redraws both views under the new
   target without a page load:
   - The URL keeps the view, the month and an open day list. An open "No capture date"
     list stays open when the new target has undated photos and closes (the URL loses
     `undated`) when it has none, as today's rule for an empty undated list. With no month
     in the URL, the calendar shows the new target's newest month, as on a fresh load.
   - Every photo surface goes back to its loading state at once and shows nothing of the
     previous target: the month grid's counts and tints, the "No capture date" control and
     its count, an open list (read again from its first page), the map's pins. If the new
     read fails, the surface shows its load error with retry and still nothing of the
     previous target. Note marks are drawn again from the new answer like the counts.
   - The map keeps its centre and zoom and closes an open pin list. It keeps them even when
     none of the new target's pins is in view (decided by the user); a map that had no
     view yet fits the new pins, as it does today on its first draw.
   - The calendar does not fade: a target change is on the "draw at once" side of
     `ui-polish.md` I3, whether the month stays or becomes the new target's newest.
   - Held previews are dropped, and the saved scroll positions and saved pin list
     (`photo_diary:state:<drive>`) are cleared.
   - The saved state records the id of the target in force when it was saved (`default`
     or a folder id; state written before this change counts as `default`). When going
     back restores it, the check runs once the look-up of 4 is done (photo requests are
     held until then anyway). On a mismatch the list position, its view and the pin list
     are dropped; the map's centre and zoom are restored either way. This also covers a
     target changed in another tab.
   - The page's in-place fresh start (a URL with no query reached while the page stays
     mounted) keeps the target in force and the loaded folder list; it is not a next load.
   - The second read that daily notes make after returning from the editor starts its
     clock when the look-up of 4 ends; `/note` is not a photo request and is never held.
   - Every choice in the menu is saved with `writeAppTarget`. A choice that leaves the
     target in force as it is (choosing it again, or choosing the default while a saved
     folder falls back to it) reloads and clears nothing.
   - The scope line drops to the drive name until the new N arrives.
   - A response to a request made under the previous target is discarded wherever it
     lands: months, days, a list page, a preview, points and the page's count read.

### 2. Failure cases

- The smart folder list fails to load: the menu lists the default row and Manage…, and
  Manage… offers the retry, as in the core's apps; the page uses the default target (4). A retry that loads the list applies the saved
  folder as a target change (8).
- The saved folder no longer exists or is unusable: the default target (4).
- A target parameter the core cannot normalise answers 400: each view shows its existing
  load error with retry, and the scope line shows the drive name. Choosing another target
  in the menu is the way out.
- 404 on any data route (drive locked, policy off): "not available", as today.

### 3. States

Target in force: the default target; a usable folder; a folder that resolves to empty.
Look-up: running (no photo request, the button reads `…`), done. Transitions:

- running → done when the folder list loads, when it fails (default target), or when the
  viewer chooses in the menu (the choice is the target);
- done → running never happens; a retry after a failure keeps the default target in
  force and requests going out until the list arrives;
- when the list arrives after a failure, the saved folder takes effect as a target change,
  unless the viewer chose a target since; a choice made in this page wins over the stored
  id, also when storage refused to save it;
- any target → any other target by a target change (8);
- a target saved in another tab or window does not change an open page; it applies on
  the page's next load.

### 4. Data read and written

- Core tables `files`, `file_exif`, and through `filtered_drive_files` the tables its
  filters read (tags, collections, favourites and likes), read only.
- Core endpoints `GET /api/drives/{drive}/smart-folders` (on load) and
  `GET /api/drives/{drive}/files?type=image&limit=1` (the menu's default row, by
  `TargetMenu`), read only.
- `localStorage`: `litloft.addon.photo_diary.target.<drive>` and
  `litloft.addon.photo_diary.targets.<drive>` (SPEC-ADDON-106).
- `sessionStorage` `photo_diary:state:<drive>`: cleared of list positions and pin ids on a
  target change.
- No table, no write to the core.

### 5. External services

None new. Tiles are requested as today; a target changes which pins are drawn, not how
tiles are fetched.

### 6. Authorization

Unchanged: every data route runs `_drive_scope` first (drive access and addon policy, one
404). `filtered_drive_files` is called with that drive, so a target's folders and
collections are matched within it.

### 7. Effect on existing features

- Daily notes: unchanged, including on a target with no photos (notes still show and
  can be written).
- The Home and sidebar entries: unchanged.
- Existing tests that check the tabs at the title row's right end on a wide layout
  (`UiPolish*.test.tsx`, e2e) are changed to the tabs row. The e2e page support stubs the
  two new core reads.
- On a wide layout the header is one tabs row taller. `ui-polish.md` I4 (held column and
  strip add no document height, scroll restore) and I5 (every week reachable at every
  viewport height) must still hold, measured in a real browser.

### 8. Error behavior

As in 2. Nothing new is logged.

### 9. User-visible behavior

- Header as in 1. On a wide layout the tabs are now under the title, so the map's stage
  is one tabs row shorter; it still fills to the viewport's bottom and keeps its `24rem`
  minimum.
- Strings: 対象 / Target (the menu's label and the control's accessible name, not drawn on
  the control), すべての写真 / All photos, この対象は使えません / This target
  cannot be used, and the count `N枚` / `N photo(s)` in the scope line.
- A day with notes and no photos under the target keeps its mark and stays pressable.
- Design: agreed with the user, https://claude.ai/artifact/3DhNVLqgN9R2mCaj2aNxii, saved
  in `docs/reviews/app-target/design/` (`Main.dc.html` wide calendar, `Map.dc.html` wide
  map, `Phone.dc.html` 375px default target, `Phone-Long.dc.html` 375px long folder name;
  `Target-Menu.dc.html` and `Target-Manage.dc.html` are the core Reading app's menu,
  unchanged). The same files are in the core's
  `docs/process/reviews/feature-addon-app-header/design/`. Checkable lines:
  - wide: title row = icon tile, title over scope line, quiet Target at the right end;
    tabs row under it with Calendar and Map;
  - 375px: title alone and whole on its row; scope text at the start and the quiet Target
    at the end of the line under it; tabs row under that;
  - 375px, long folder name: the name ends in an ellipsis inside the Target;
  - the Target draws no 対象 label and no fill;
  - the Target menu: default row with its count, the shown folders, Manage….
  Declared differences: the calendar's cells, the map and the pins are illustrative; the
  calendar and the map keep today's look. `Shelf-B.dc.html` is the core's shelf page
  (SPEC-CORE-099) and does not apply to Photo Diary.

### 10. Non-functional

Sized as today for up to 50,000 photos per drive. A target adds one subquery to each
request; no cache. `photo-diary.md`'s bound still holds under a target: `/calendar/*`,
`/photos` and `/points` each answer within 1 second at 50,000 photos with a target
carrying `search`, `tag`, `folder` and `size`, measured once before merge.

## Touch points

- `backend/router.py`: `_photos` takes the target; every photo route accepts the target
  parameters and `none`, and answers 422 for `none` with parameters; 400 from
  `filtered_drive_files` passes through; imports `filtered_drive_files` from
  `app.routers.drives`.
- `frontend/api.ts`: `fetchMonths`, `fetchDays`, `fetchPhotos`, `fetchPoints` take the
  target's parameters.
- `frontend/PhotoDiaryPage.tsx`: `AppHeader` in place of `PageHeader` on the normal page;
  tabs in the tabs row at every width; the target state; the map count read with the
  target; redraw on a change; clear saved list positions and pin ids; drop the scope count.
- A new hook for the target (smart folders, saved id, resolution, look-up, change token).
- `frontend/CalendarView.tsx`, `frontend/MapView.tsx`, `frontend/useDayPreview.ts`,
  `frontend/PhotoList.tsx`, `frontend/usePagedPhotos.ts` (the target enters the list's
  identity, so a change reloads rather than refreshes): pass the target to their requests,
  clear what the previous target drew, and drop answers for a previous target.
- `frontend/lib/savedState.ts`: the target id the state was saved under.
- `frontend/PhotoDiaryPage.tsx` `Frame`: no longer measures its width to place the tabs;
  `useWide` itself stays (the views use it).
- `frontend/messages/{ja,en}.json`: the four strings.
- Tests: backend tests for the parameters, `none` and 422; frontend tests; e2e under
  `e2e/`, including `e2e/pageSupport.ts` (stubs for the two core reads) and
  `e2e/build-fixture.mjs` and `e2e/fixture/page/` for the core modules the header pulls in
(`AppHeader`, `TargetMenu`, `ManageTargetsDialog`, `useLoad`, `getSmartFolders`,
`appPrefs`, `appTarget`); the existing tab-placement
  tests; a real-browser measurement for I12.
- `README.md`: a sentence on the Target.
- `docs/specs/INDEX.md`.
- Core rules passed through: `.claude/rules/design-decisions.md` (drive boundary, addon
  policy, no core-to-addon dependency).

## Invariants

I1. Under any target, a photo appears in a day's count, tint, preview and list, in "No
capture date", or as a map pin only if the core's file listing with the same parameters
and `type=image` returns it; this holds after a target change made while the other view
was hidden and after a restore when going back from a photo.

I2. Under any usable target, every image the core's listing returns for its parameters
with `type=image` appears in exactly one day list or in "No capture date", and as a pin
when it has a valid place.

I3. Under any target, the counts in `/calendar/months` and `/calendar/days` equal the
`total` of the matching `/photos` query with the same target, and the header's N equals
their sum plus `undated_count`.

I4. With `none=true` every photo count is 0, every photo list is empty and there is no
pin, while note months, `has_note` days and `/note` answer as under the default target.

I5. A day's note mark, a month that holds only notes, and the note shown in a day's panel
are the same under every target the backend answers (every target except one that answers
400, under which the calendar shows its load error).

I6. The default target sends no target parameter and gives the same counts, lists and
pins as before this change.

I7. A folder with a negated operator or a duration part cannot be chosen; a saved folder
that is gone or unusable gives the default target without deleting the saved id; and
while a non-default saved target is being looked up no photo request is sent.

I8. A target change made in one drive does not change the target of another drive, and a
choice made in Photo Diary does not change the target of the core's Video or Reading app.

I9. After a target change the open pin list is closed, and no list position or pin list
saved before the change is restored.

I10. On the normal page, at every width, the Calendar and Map tabs are in the header's
tabs row; at 640px and wider the Target is at the title row's right end; below 640px the
title フォトダイアリー is whole on its own row and the Target is at the end of the scope line,
also with a long folder name as the target (measured at 375px in a real browser).

I11. The backend answers 422 to `none=true` sent with any target parameter, treats
`none=false` as absent, and answers 400, not 500 or an empty result, to a target parameter
the core cannot normalise.

I12. The map's stage reaches the viewport's bottom and is at least `24rem` tall, measured in
a real browser at 375px, at 768px and at 1280px with the sidebar shown (the header switches
at a 640px viewport; the views' own layouts switch at a 48rem element width).

I13. A target chosen in Photo Diary on a drive is the target in force on the next load of
that drive; within the page, the viewer's choice stays in force even when storage refuses
to save it.

I14. From a target change on, including when an answer to a request made under the
previous target arrives late, no count, tint, preview, list item, pin, pin list or N of the
previous target is on screen, including while the new answers load and after one of them
fails; this names the open day or "No capture date" list and the map's pins in particular.

I15. After a target change, an open "No capture date" list closes when the new target has
no undated photo, a URL with no month shows the new target's newest month, and an open day
list stays open even when that day has no photo under the new target.

I16. The Target control's text and the menu's checked row always name the target in
force: すべての写真 for the default and for every fallback of item 4, the folder's name
otherwise, `…` only while the look-up runs.

## Revises

SPEC-PD-001 I3. Every photo under the target in force appears in exactly one day list or in the undated list, and the counts in `/calendar/months` and `/calendar/days` equal the `total` of the matching `/photos` query with the same target.

SPEC-PD-001 I6. Going back from a photo restores the view, month, day, map position and open list it was opened from, except that the open list's position and the pin list are dropped when they were saved under another target than the one in force; state saved on one drive is never restored on another, and a response for a month, drive or target the viewer has left is discarded.

SPEC-PD-008 I3. The fade runs when another month is drawn on screen by the viewer's navigation, or on the first draw of a page loaded with no query, and never under reduced motion; a refresh, a re-read of the same month, a target change, pressing a day, returning to the same month from the map and a page loaded with a query draw the surfaces at once.

## Checked, no action

- **Reading's empty target sends nothing.** Doing that here would hide the notes (I5), so
  an empty target sends `none=true` and the backend still answers the note dates.
- **The target in the URL.** The core's apps keep it in storage, not the URL; Back does
  not undo a target change there either.
- **Filtering notes by the target.** Agreed with the user: notes belong to dates.
- **Keeping the open pin list across a target change.** Its ids may fall outside the new
  target; closing it is simpler than re-checking.
- **Keeping the on-screen month when the URL has none.** The calendar's rule for no month
  is "the newest", on a fresh load and here alike; the month is in the URL as soon as the
  viewer moves to another one.
- **A Target button on the "not available" screen.** Nothing there could use it.
- **Revising SPEC-PD-012.** Its tab placement is not an invariant line (`ui-polish.md`,
  "Promised above ... and not given an invariant line"); I10 states the new placement.
