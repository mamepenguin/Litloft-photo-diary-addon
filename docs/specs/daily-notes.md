# Photo Diary: a short note for a day, on the calendar

SPEC-ID: SPEC-PD-005
SPEC-ID: SPEC-PD-006
SPEC-ID: SPEC-PD-007

Approval:

## Summary

A viewer who looks back at a day's photos has nowhere to keep what happened that day. Photos arrive
in folders the phone's backup app manages, so a note placed beside them has no natural home, and a
note on one photo does not describe an outing. This adds one short Markdown note per date to the
calendar view. Writing is occasional, so a day nobody wrote about shows nothing.

- **SPEC-PD-005**: what counts as a note, and what the addon's API says about notes.
- **SPEC-PD-006**: the calendar marks days with a note, every day can be pressed, and the day's panel
  shows the note above its photos.
- **SPEC-PD-007**: starting a note for the pressed date in the core's editor, and getting a trashed
  one back.

This changes behaviour promised by `docs/specs/photo-diary.md`, listed under item 7. No invariant of
that spec is broken. Automatic scanning of files written directly to the filesystem is not part of
this change.

## Definitions

- **Note folder**: the folder `Photo Diary` at the root of the drive.
- **Note path** of a date: `Photo Diary/YYYY-MM-DD.md`, for example `Photo Diary/2026-11-01.md`.
- **Note row** of a date: the `files` row of the drive whose `file_path` is exactly that date's note path,
  for a real calendar date. `file_path` is unique per drive, so a date has at most one. Nothing else is a
  note row: not the same name in another folder or in a subfolder of the note folder, not
  `2026-11-01 (1).md`, not `2026-11-01.txt`, not `2026-11-01.MD`, not `2026-02-30.md`. The date comes only
  from the name.
- **Note state** of a date:

  | State | Note row |
  |---|---|
  | `none` | No row |
  | `empty` | Passes `active_file_filter()`, `file_size` is 0. This is a started note nobody wrote in |
  | `active` | Passes `active_file_filter()`, `file_size` above 0. Only this state is called a **note** |
  | `trashed` | `deleted_at` is set |
  | `missing` | `missing_since` is set |

- **Today**: the date on the browser's local clock. Only the Today control uses it.

## Required items

### 1. Normal flow

**Reading (SPEC-PD-005, SPEC-PD-006)**

1. The calendar fetches `/calendar/months` and `/calendar/days` as today. A month with notes and no
   dated photos is in the list with `count: 0`, and previous, next and the month picker reach it. A day
   with a note is in the day list with `has_note: true`, whether or not it has photos.
2. The grid marks a day that has a note, in addition to showing its photo count.
3. Every day in the grid is a button once the month's days have loaded. Pressing one opens the day's
   panel, as `date=` in the URL, as pressing a day with photos does now.
4. The panel fetches `GET /note?date=YYYY-MM-DD`. For `active`, it fetches the text from the core's
   `GET /api/files/{id}/stream` and shows it with the core's `MarkdownPreview`, with `drive` set, `chrome={false}`
   and `showFrontmatter={false}`, between the panel's date heading and the photos. `wikiResolution` is not passed. The photo list's own
   behaviour is unchanged, including its empty message.

**Starting a note (SPEC-PD-007)**

1. In a panel whose state is `none` or `empty`, the viewer presses **Write a note**.
2. For `none`, the page calls the core's `POST /api/drives/{drive}/files` with the panel date's note path,
   `content: ""` and `conflict_mode: "error"`. The core creates the `Photo Diary` folder if it is absent
   and registers the file at once. For `empty`, there is nothing to create.
3. The page goes to the core's `/files/{id}?edit=1`, the same route the core's New File uses. The viewer
   writes there and the editor saves, which updates `file_size`. That editor is supplied by the knowledge
   addon, through the core's `file-detail-sections` slot.
4. The browser's Back returns to the same day by the existing restore rules. Counts, marks and the note state are
   fetched at once and once more 3 seconds later. The editor autosaves after 2 seconds and sends its last save on
   leaving without waiting for it, so the first read can overtake that save. The second read changes what is on
   screen only if the result differs, and it does not repeat.

**When the editor is not available (SPEC-PD-007)**

The file page draws the editor only when the knowledge addon is installed and its `editor` policy is on for the
drive (`FileDetailContainer`). When it is not, the panel offers no write control and no Edit link, creates no file,
and notes that exist are still shown.

**Editing (SPEC-PD-007)**

A panel showing a note has an **Edit** link to `/files/{id}?edit=1`, using that date's `file_id`. Emptying
the note there moves the date back to `empty`, and its mark goes.

**Today control (SPEC-PD-007)**

The calendar has a **Today** control, also when the drive has nothing dated. It goes to today's date as
`month` and `date`, adding a history entry like pressing a day. When `date` is already today it does nothing,
and when today's month is showing with no panel open it opens the panel. It makes the current month reachable
when that month has no photos and no notes, which previous, next and the month picker do not.

**Getting a trashed note back (SPEC-PD-007)**

A panel whose state is `trashed` says so and has **Restore**, which calls the core's
`POST /api/files/{id}/restore` with that date's `file_id`, then does the same refresh as `onRefresh`. A new note
cannot be started for that date while its row is in the trash, because the path is taken.

### API

Under `/api/addons/photo_diary`, with the existing drive scope.

| Route | Response |
|---|---|
| `/calendar/months` (changed) | Adds months that have notes and no dated photos, with `count: 0`. Otherwise as before |
| `/calendar/days?month=YYYY-MM` (changed) | `{days: [{date, count, has_note}]}`, oldest first, only days with photos or a note. `count` is 0 on a day with only a note. `has_note` is true only for state `active` |
| `/note?date=YYYY-MM-DD` (new) | `{state: "none" \| "empty" \| "active" \| "trashed" \| "missing", file_id: string \| null}`. `file_id` is null only for `none`. A malformed or non-real date is 422 |

`/photos`, `/points`, `/map-config` and `/assets` are unchanged.

### Page URL

The table in `docs/specs/photo-diary.md` holds except these rows:

| In the URL | What the page does |
|---|---|
| No `month` and no `date` | Newest month with dated photos or notes; a list opens only if `undated` is set |
| A real month with no photos and no notes | The grid, with every day a button; previous and next go to the nearest months with photos or notes |
| A real date with no photos | Its month, with the panel: the note area, and the list showing the empty message |
| Any `month` or `date` on a drive with no dated photos and no notes | Its month, as an ordinary grid, with previous and next disabled and no month picker. With `date`, that day's panel opens |
| No `month` and no `date` on a drive with no dated photos and no notes | The no-dated-photos message replaces the grid, with the Today control. `undated` still opens its list |

### 2. Failure cases

| Where | What happens |
|---|---|
| `/note` answers 404 while the page is open | The not-available message replaces the whole page, as for every data route |
| `/note` fails on a first read of the day | The panel's note area shows the load error. Retry reads `/note` again. The photo list is unaffected. No write control or Edit link is offered until the state is known |
| `/note` or the stream fails on a re-read with a state already known (`onRefresh`, entering the calendar, coming back) | What is drawn stays, with its controls, and the load error with a retry appears above it, as the earlier spec does elsewhere. A re-read never collapses the note area, so the photos below do not move |
| The stream answers 404 or 410 | `/note` is read once more and the panel follows a changed state. If it is still `active` (the row is active and the file has left the disk, until the next scan), the note area shows the load error and no Edit link. Retry reads `/note` and the stream once each. Nothing repeats by itself |
| The stream fails any other way | The note area shows the load error. Retry reads the stream again |
| A note is trashed in another tab while its text is on screen | The core's stream still answers 200 for a trashed file, so the text stays until the next read: entering the calendar, going back to it, or `onRefresh` |
| Write answers 409 | `/note` is read again and the panel follows it. If it is still `none` (a file is at that path on disk and not yet scanned), the panel shows the rescan message. Nothing is overwritten and the page stays. If that read fails, the rule for `/note` applies |
| Write answers 404 | The not-available message |
| Write fails any other way | The panel stays, with the could-not-start message. The control can be pressed again |
| Restore answers anything but success | `/note` is read again. If it is still `trashed`, the panel shows the could-not-restore message and keeps **Restore**. Any other state is followed. If that read answers 404, not-available; if it fails, the rule for `/note` applies. The 404 from `/restore` itself never means not-available, since it also means "already restored" and "the file left the disk" |
| State `missing` | The panel says the note's file cannot be found, and offers no write. The core's own missing-file handling applies |
| The core's editor fails to save | The core's own behaviour. The state is whatever is on disk when the viewer comes back |

### 3. States

Stateless on the server. In the browser, for the open day:

| State | Moves to | On |
|---|---|---|
| Note: loading | `none`, `empty`, `active`, `trashed`, `missing`, or failed | The response |
| Note: failed | Loading | Retry |
| `none` | Creating | **Write a note** |
| Creating | The core's editor | The core answers with the new file |
| Creating | Loading | 409 |
| Creating | `none`, with a message | Any other failure |
| `empty` | The core's editor | **Write a note** |
| `active` | The core's editor | **Edit** |
| `trashed` | Restoring | **Restore** |
| Restoring | Re-reading | Any answer |
| `active` | Text loading, then rendered or failed | The state arriving, or Retry |
| Any known state | Re-reading, with what is drawn kept | Entering the calendar view, coming back to the page, or `onRefresh` |
| Re-reading | The result, if it differs | The response |
| Any | Another day's loading | Pressing another day, or moving by URL |

- While Creating or Restoring, that control is disabled, so one press sends one request, and a re-read waits until it ends.
- After a Restore succeeds, the same refresh as `onRefresh` runs, unless the viewer has left the day.
- A message (could not start, rescan, could not restore) lasts until the next press of that control, a re-read with a different result, or
  moving to another day. The write control stays beside the rescan message.
- The note area has **settled** when the text is rendered, another state is known, or the first read has failed. The undated list and the map pass no
  note area, so for them there is nothing to wait for.
- Of overlapping requests only the latest applies, keyed by drive and date. A response for a day or drive the viewer
  has left changes nothing and does not navigate. An `empty` file left that way is harmless by the definitions.
- No note request runs while the calendar view is hidden, including on a page opened as `view=map&date=...`.
- Not allowed: a write for any date other than the panel's; a write without the viewer pressing the control.

### 4. Data read and written

| Store | Access |
|---|---|
| Core `files` | Read by the addon's routes |
| Note files, through the core's public routes from the browser | Created empty by `POST /api/drives/{drive}/files`, read by `/stream`, restored by `/restore`. Edits are the core's editor |
| Tables owned by the addon | None |
| Browser session storage | Unchanged. Nothing about notes is stored |

The addon's backend still inserts, updates and deletes nothing. The writes are the viewer's, made by the page through the
core's public API.

### 5. External services

None added by the addon, and the tile rules are unchanged. The note is rendered by the core's preview as any Markdown file is, so a remote image written in a note is requested by the browser when the panel opens.

### 6. Authorization

`/note` and the changed routes run the existing `_drive_scope`: a locked drive, an unknown drive and a policy that turns the
addon off answer one identical 404. Note queries always filter on the scoped drive. The core's create, stream and restore routes
run their own drive checks. Anyone who may open the drive may start a note, which is what the core already allows for any file there.

### 7. Effect on existing features

**Changes to what `docs/specs/photo-diary.md` promises.** Tests that pin these change with them, and only these:

- "A day without photos is plain text" no longer holds: every day is a button.
- Previous, next and the month picker reach months with notes, not only months with dated photos.
- The no-dated-photos message is limited by the Page URL rows above.
- `/calendar/days` items gain `has_note`, and days and months may have `count: 0`.
- "The addon's code writes nothing to the core" now means the addon's backend. The page creates and restores notes through the
  core's public API.
- "A today marker" was out of scope and stays so. Only the Today control is added.

**Everything else.**

- `frontend/PhotoList.tsx`, shared with the map, gains an optional slot between its date heading and its photos. The map does not pass it,
  and with no slot its output is unchanged.
- A note is an ordinary file. It appears in the drive's folder tree, core search and tags. The intelligence addon indexes it under that
  drive's policy, and cloud-sync copies it when a mapping covers the drive, as for any Markdown file. An `empty` file is visible in the
  folder tree too.
- The core adds an `id` to a Markdown file's frontmatter only when the text already has frontmatter. A plain note and an empty file stay as
  written, so `file_size` 0 is a reliable sign of a started note nobody wrote in. A note that has frontmatter is above 0 by that alone.
- A note renamed or moved in the core, including through the title in the editor's header, stops being one, and that date's state becomes `none`. A
  file put at a note path outside the app, where no row exists yet, becomes one after a scan.
- A scan does not refresh `file_size` for a non-media file whose hash is known (`_refresh_file_identity`). So a note row already scanned or saved in
  the editor, and then changed directly on disk, keeps its old state: text written to an `empty` row shows **Write a note**, which opens that file with its
  text, and a row truncated on disk stays `active` with a blank panel. The state follows what the app recorded.
- The editor's own back control is the core's. Only the browser's Back is promised to return to the day. R-5 records where the editor's control goes.
- A photo's date, the map, `/photos` and `/points` do not read notes. A note is not an image, so it is in no photo count.
- The folder `Photo Diary` exists only once the control has been pressed, so drives where nobody writes are not touched.
- `photoTotal` still counts photos only: a `count: 0` month adds nothing to it.
- Going back from a photo on a day with a note must still restore the scroll position, though the note loads after the list. `PhotoList`
  applies its saved position only once the note area has settled, which means text rendered, another state known, or failed.

### 8. Error behavior

No status codes are shown. The addon adds no log lines beyond the core's request logging.

| Case | ja | en |
|---|---|---|
| Write control | メモを書く | Write a note |
| Edit link | 編集 | Edit |
| Today control | 今日 | Today |
| Could not start | メモを作成できませんでした | Could not start the note |
| Not yet scanned | 同じ名前のファイルがあります。ドライブを再スキャンしてください | A file with this name already exists. Rescan the drive |
| Trashed | この日のメモはゴミ箱にあります / 元に戻す | This day's note is in the trash / Restore |
| Could not restore | 元に戻せませんでした | Could not restore |
| Missing | この日のメモのファイルが見つかりません | The file for this day's note cannot be found |
| Day label with a note and photos | {date}、{count}枚、メモあり | {date}, {count} photos, has a note |
| Day label with a note and no photos | {date}、メモあり | {date}, has a note |
| Day label with neither | {date} | {date} |

The label for a day with photos and no note is the existing one. While a month's days are loading, the days are not yet buttons, so no count is announced.

### 9. User-visible behavior

- A day with a note shows a mark as well as any photo count. A day with a note and no photos shows no count. A day with neither stays visually
  quiet, and is still a button.
- The month picker shows a month with notes and no photos without a count.
- The panel's order is the date heading, the note area, then the photos.
- The write control appears on any date in state `none` or `empty`, including future dates and days with no photos.
- A note saved in the editor appears on coming back by the browser's Back. A file put at a note path with no row yet, outside the app, appears after a scan.
- A wiki link in a note is plain text in the panel; it works in the editor.
- The undated list has no note area. The map has no notes. A section heading link from the map goes to the day with its panel, including its note.
- Dates are the calendar's own: no time zone conversion. Writing on 3 November for the outing of 1 November creates `Photo Diary/2026-11-01.md`.
- Text is in `ja` and `en`. No emoji; icons are lucide.
- Layout, the mark and the panel's appearance follow `DESIGN.md` and are agreed in a Design Artifact after this spec's approval and before
  implementation. This spec fixes behaviour, not layout.

### 10. Non-functional

- Size: up to 50,000 photos and some thousands of notes on a drive. The changed routes and `/note` answer within 1 second at that size, computed per
  request with no cache, measured once before merge as in the earlier spec.
- A note's length is limited only by the core's editor. The panel renders the whole note, with no truncation.
- Privacy: a note goes only to a browser allowed to open the drive and to what that drive's addon policy allows, as any file does.
- Concurrency: creation is guarded by the core's `conflict_mode: "error"`, so it cannot overwrite a file. Concurrent edits are the core's editor's.
- Cost: none.

## Touch points

All in this repository (`mamepenguin/Litloft-photo-diary-addon`):

- `backend/router.py`, `backend/schemas.py`: `/calendar/months`, `/calendar/days`, new `/note`.
- `frontend/api.ts`: the changed shapes, `fetchNote`, note creation with `conflict_mode`, restore.
- `frontend/MonthGrid.tsx`, `frontend/CalendarView.tsx`, `frontend/MonthPicker.tsx`, `frontend/PhotoDiaryPage.tsx`: every day a button, the mark, the Today
  control, the panel.
- `frontend/PhotoList.tsx`: the optional slot and the deferred scroll restore.
- A new `frontend/` component for the note area, with its tests.
- `frontend/messages/{ja,en}.json`.
- `tests/`, `e2e/`, and the existing tests pinning the behaviours listed in item 7.
- `README.md`: what a note is, where it is stored, and that a renamed or moved note stops being one.
- `docs/specs/daily-notes.md`, `docs/reviews/`.

Read from the core and not changed: `POST /api/drives/{drive}/files`, `GET /api/files/{id}/stream`, `POST /api/files/{id}/restore`, `/files/{id}?edit=1`,
`MarkdownPreview`, `/api/addons/status`, the knowledge addon's `editor` policy and its editor, `app.models`, `app.auth`, `app.config`.

Rules passed through: the core's `.claude/rules/design-decisions.md` (drive boundary, file state, addon discipline, tag editing), `backend-conventions.md`,
`frontend-conventions.md`, `DESIGN.md`.

Endpoints added: `GET /api/addons/photo_diary/note`. Events: none. Core tables, the core's Internal API and the core's files are not changed.

## Invariants

I1. Only a row whose `file_path` is exactly `Photo Diary/<real date>.md` on the scoped drive has a note state other than `none`: the same filename in another folder or a subfolder, `2026-11-01 (1).md`, `2026-11-01.txt`, `2026-11-01.MD` and `2026-02-30.md` produce no mark, no month and state `none`.

I2. A date's note on one drive is never reported for another drive holding the same note path or none, and `/note` gives a locked drive, an unknown drive and a policy-off drive the same 404 as every other data route.

I3. A note row that is `empty`, `trashed` or `missing` gives no mark and no month, and `/note` reports that state rather than `none` or `active`. No write control is offered for `trashed` or `missing`, while the state is not yet known, or when the editor is not available.

I4. A day with a note and no photos has `count: 0` and `has_note: true`, its month is listed with `count: 0`, no "0" is drawn for that day or month, and the photo counts of every other day and month, `/photos` and `/points` are the same as without the note.

I5. Pressing a day, opening the panel, or moving between days sends no write. One press of the control in state `none` sends one `POST`, with `content: ""` and `conflict_mode: "error"`, to the note path of the panel's date and never of today's date; in state `empty` it sends none and opens that date's own file.

I6. When creation answers 409, the file at that path keeps its bytes, the viewer stays on the page, and the viewer never reaches the editor of a file for another date.

I7. A note given text in the editor has its mark, its month and its text in the panel within the second read after coming back by the browser's Back, also when Back was pressed right after typing; a restored note has them without a reload; and a note emptied in the editor loses its mark and is offered for writing again.

I8. The Today control goes to the browser's local date, also when that differs from the UTC date, and reaches a month with no photos and no notes on a drive with nothing dated.

I9. Frontmatter in a note is not shown in the panel, a plain note renders as typed, and the text in the panel is the current file's after coming back from the editor.

I10. A response for a day or drive the viewer has left neither changes the panel on screen nor navigates, a re-read over a drawn note never collapses it, and going back from a photo on a day with a note restores its scroll position once the note area has settled.

## Checked, no action

- **Changing the editor so Back waits for its last save.** The core and knowledge are not changed by this spec. One bounded re-read covers it.
- **Wiki links resolved in the panel.** It would need another read per note for a short memo. The editor still resolves them.
- **Blocking remote images in the panel.** The core's preview allows them for every Markdown file, and the viewer wrote the note.
- **Making `file_size` follow changes on disk.** That is the scanner's rule for every non-media file, and belongs with the separate automatic-scan work.
- **A text area in the panel, creating the file on Save.** It avoids an `empty` file and keeps the viewer on the page. Rejected: a draft that can be lost silently needs storing per drive and date, with rules for leaving during a save, for a draft on a date that has since got a note, and for fresh starts, and a second editor still leaves editing to the core. A 0-byte file is the only cost of the chosen path, and nothing shows it on the calendar.
- **Removing an `empty` file automatically.** The core has no such path, and deleting files the viewer did not ask to delete is not worth tidying a 0-byte file.
- **A note of only whitespace.** It is above 0 bytes, so it has a mark. Reading each body to decide would make the calendar read every note in a month.
- **Writing a new note while the old one is in the trash.** The path is taken, and renaming would create a file that is not a note. Restore is offered. A viewer who wants the date free again purges it in the core.
- **The core's 30-day trash purge.** It removes a trashed note and moves the date to `none`, as for any file. The trashed message does not repeat the core's rule.
- **A write control on state `missing`.** The core's create in its default mode would reuse the row and replace the contents, and the file may come back. The viewer decides in the core.
- **A note on a future date.** It is allowed, and it makes that month the newest one, so a fresh start opens there. This is rare and follows the rule, so no separate rule is added.
- **Dates from frontmatter, or notes in any folder.** Files in folders the phone app manages stay unrelated, and a date read from content would need every text file in the drive read.
- **Year subfolders in the note folder.** Notes are occasional, so a flat folder stays small and the path needs only the date.
- **A folder name per language or per setting.** The name is part of the data on disk and must not change with the viewer's language. A setting is not requested.
- **Automatic scan of files written directly to disk.** Separate, a core feature the user is considering.
- **Notes on the map, a place on a note, a today marker in the grid, several notes per day, templates, and reminders to write.** Not requested.
- **The core's process ledger.** As in the earlier spec, this spec is not in the core's `docs/specs/INDEX.md`, and reviews are recorded in `docs/reviews/`.
- **Internal API policy.** No endpoint is added to `routers/internal.py`; the addon is in-process and the page uses public routes.
- **Promised above, checked by acceptance tests, R-5 or review, and not given an invariant line**: a 404 from `/restore` or the stream never meaning not-available, a stream 404 or 410 reading `/note` again before deciding, message lifetimes, 422 validation, the Page URL rows, Restore and Edit using the date's `file_id`, Today adding one history entry and doing nothing when already on today, the bounded stream-failure recovery, every message and label in item 8, note requests gated on the calendar being on screen, and `PhotoList` unchanged without the slot.
- **iOS.** The page runs in the app's web view. R-5 checks starting a note and Back in the iOS Simulator, on a full stack with knowledge present and with its editor policy off. A real device is not checked by an agent.
