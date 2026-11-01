# Decisions: daily notes

## Design Artifact

Agreed by the user on 2026-11-01: https://claude.ai/artifact/5aNt98vTRnLDEnWWQz9diM

The artifact is private to its owner. What it fixes, on top of the earlier spec's artifact:

- A day with a note shows a pen icon at the top right of its cell, in every cell kind.
- A day with photos stays a `--sand` surface. A day with only a note is a `--bg-elevated` surface with
  no count. A day with neither is plain muted text, and is a button.
- The note sits on a `--bg-elevated` surface between the date heading and the photos, with Edit at its
  lower right.
- Write a note is a secondary (`--sand`) button with a pen icon. The screen spends no accent fill.
- Today is a plain button in the month bar, right of next.
- The panel's heading shows no count when the day has no photos.
- Note-area messages are `--bg-elevated` rows with a lucide icon; failures use `--danger`.

## Spec readings decided by the user, 2026-11-01

1. A stream 404 or 410 on a re-read over text already drawn keeps the text and the Edit link, with the
   load error above them. The "no Edit link" rule of that row applies to a first read.
2. A first read of the stream failing with anything but 404 or 410 still offers the Edit link, because
   the state is known to be `active`.
3. While the editor's availability is being read, the write control and the Edit link are hidden. If
   that read fails, they are shown, which is what the core's file page does.
4. A first read of the stream failing counts as the note area having settled, so the saved scroll
   position is still applied.

Decided by the author: the second read 3 seconds later runs whenever the page is entered with a day open,
not only from the editor. The page does not know where the viewer came from.

## Size measurement, 2026-11-01

measurement:
at: 98df048
by: agent
machine: Apple M3 Max, Docker Desktop for the backend
data: 50,000 generated `files` and `file_exif` rows in a test database (1 in 50 trashed, 1 in 20 without a capture date, photos spread over 120 months of capture dates) and 5,000 further rows under `Photo Diary/` and `Other/`: 4,000 notes at distinct dates over about 11 years (1 in 10 zero bytes, 1 in 25 trashed), 1,000 same-named decoys in `Other/`. The month list has 132 months.
backend: pytest in the `Dockerfile.test` image, five requests after a warm-up, median in ms (the worst of the five was within 2 ms of it): `/calendar/months` 68, `/calendar/days?month=` 31, `/note` of a date with a row 1, `/note` of a date with no row 1. Each is inside 1 second.
not measured: a drive on a network share, a browser.

## R-5

decision:
ran_in_app: yes
at: 408d1a4e53ed3e73bf7d905863a6f19c48279265
by: agent
evidence: Stack from the core worktree at 6f6c0b27f (backend, frontend, knowledge; intelligence not started). Chromium driven by Playwright against localhost:3000 at 1280, 1440 and 390 wide; Safari and the Litloft app in the iPhone 17 Pro simulator (iOS 26) with idb. Fixture: 60 dated photos on 2013-03-15, removed afterwards. Screenshots are under /private/tmp/claude-502/-Users-libre-Sources-video-share/ea9da1a7-ad58-471d-b545-cdf62e45c164/scratchpad/r5/shots/ (session scratchpad, not kept).

  As specified:
  - Write, type, Back 3 ms and 1.5 s after the last key, and 4 s after it: note and mark on screen by 300 ms, and still so after the second read (10-, 11-, 12-). With the final PUT delayed 1.5 s the first read showed Write and no mark; the second read at 3 s brought the note and the mark, once (50-).
  - Write and leave without typing: no mark, state empty; Write opens the same file with no second POST.
  - Empty a note in the editor: mark gone, state empty, Write offered.
  - Trash in a second tab: text stays until the next read; leaving and Back shows the trashed row (30-); Restore brings mark and text in 240 ms without a reload (31-).
  - Scroll restore: scrollY 900 before opening a photo and 900 after Back, also past the second read, at desktop, at phone width and with the stream delayed 1.2 s (applied after the delay).
  - Today on a month with no photos and no notes: month=2026-11&date=2026-11-01, one history entry, panel with Write (51-). Second press adds nothing. With the month open and no panel it opens the panel. Follows the browser's zone: Pago Pago gave 2026-10-31, Kiritimati 2026-11-01.
  - Drive with nothing dated: message with Today (82-); Today gives the grid with previous and next disabled and no picker (83-); a first note there is shown and the same date on the other drive is unaffected; a fresh open then lands on the note's month.
  - Knowledge editor policy off: note shown, no Edit, no Write in states active, empty and none, no POST; the core's file page draws no editor (80-, 81-). Same in Simulator Safari (140-, 141-).
  - Day with no photos, note-only month: no count, reached by next and the picker with no count (53-, 54-). Frontmatter hidden; wiki link is a plain span. Decoy paths give no mark and state none; 2014-02-30 is 422. A renamed note gives state none.
  - Failures: 409 keeps the file's bytes, shows the rescan message and Write, and a scan then shows the note (60-). Stream 404 with state active: load error, no Edit, mark stays, nothing repeats (61-). State missing: message, no write (62-). First /note read failing, stream 500, re-read failing, write 500, write 404, restore 500, each with the route answer forced in the browser: as the failure table except the differences below (63- to 68-).
  - ja labels and controls read as in item 8. No horizontal overflow in light or dark at either width.

  Where the editor's own back control goes: to the folder, /drive/<drive>/Photo Diary, at both widths. On a phone it is the "< Photo Diary" link (aria-label Back to Photo Diary); on a desktop the breadcrumb, with no other back control. From the folder, browser Back goes to the editor and Back again to the day (22-).

  Differences from the spec or the design:
  1. Re-read failure: the load error above a drawn note pushes the photos down 68 px (352 to 420), and they return on a successful Retry. The spec's failure row says the photos below do not move (64-).
  2. Retry after a stream 404 or 410 with state still active sends /note, the stream, then /note again. The spec's row says Retry reads /note and the stream once each. Nothing repeats after that.
  3. Stream 404, a scan, then Retry: the panel shows missing while the grid keeps the mark and the "has a note" label until the next read. Reload clears it. I3 says a missing row gives no mark (62-).
  4. Pen mark on a day with photos touches the date, and overlaps a two-digit date at phone width and at desktop (90-light-phone-noted, 90-light-desktop-noted, 64-). The artifact's cell is 76 px with the number at top left and the pen on the same row at right; the app's cell has the number centred and the pen positioned over it. The pen is muted where the artifact has the text colour.
  5. Month title wraps to two lines on the desktop calendar whenever the no-capture-date button is present, at every width from 1024 to 1920 (title 81 px wide). The artifact keeps it on one line and wraps the bar. One line at phone width and on a drive without that button.
  6. Edit sits below the note surface as a sand button. This file says the note surface has Edit at its lower right, and the artifact has it inside with no fill.
  7. The load error is plain text with Retry, no --bg-elevated row and no icon. This file says note-area messages are such rows, and the artifact's States board draws it as one (64-, 65-).
  8. The rescan message is in --danger and left of Write. The artifact's States board has it muted, with Write above it. Could-not-start has the same layout, also below Write in the artifact. The trashed text is the primary colour, muted in the artifact (60-, 66-, 30-).

  Not run: Back in the Litloft app. Write opened the editor in the app and the note saved there (115-, 117-), but three edge swipes from idb did not go back, and the app has no other Back. Back was run in Simulator Safari with its toolbar button instead, 0.6 s after typing: note and mark shown (133-).
  Not run: /note answering 404 while open, a locked drive, the map and undated list having no note area, a map section link to a day with a note, view=map&date with no note request, next from a month in no list, a save slower than 3 s.
pending: iOS on a real device. Back by the app's swipe gesture in the iOS app, which idb could not produce in the simulator.

## R-5, second run

ran_in_app: yes
at: ff810475681dfebf290dbee8ce6a60c2a2a85b71
by: agent
evidence: Narrow run over frontend/MonthGrid.tsx, CalendarView.tsx, NoteArea.tsx, LoadError.tsx, useDayNote.ts. Stack rebuilt from the core worktree at 6f6c0b27f (backend, frontend, knowledge; intelligence not started). Chromium driven by Playwright against localhost:3000 at 1920, 1440, 1280, 1024 and 390 wide, light and dark, en and ja. Fixture on drive テスト画像: 120 generated photos dated 2013-03-15 (with GPS) and 2013-03-16, notes through the core's API and the editor; all purged afterwards (142 rows, file count back to 1374, 660 EXIF rows, folders gone). Design compared with the artifact's Main and States files. Screenshots are under /private/tmp/claude-502/-Users-libre-Sources-video-share/ea9da1a7-ad58-471d-b545-cdf62e45c164/scratchpad/r5b/shots/ (session scratchpad, not kept).

  As specified or as designed:
  - Pen and two-digit day: no overlap on days 2, 8, 15, 22, 23 in both themes. Gap at least 6.6 px at desktop widths (pen 14 px, cell 76 px high), 4 px at 390 (pen 12 px, cell 48 px high). Pen in the text colour, number top left, pen same row at right. Note-only day is --bg-elevated with no count (l-*).
  - Month title on one line beside the undated button at 1920, 1440, 1280 and 1024, for March and September, en and ja; no overlap with the button (l-*, f-bar-1024-sep).
  - Edit inside the note surface, lower right (16 px in from both edges), transparent background, text colour, both themes and all widths (l-*-noted).
  - Load error: --bg-elevated row, radius 12 px, alert icon and text in --danger, Retry, first read and re-read (m-*-loaderr, m-*-rereaderr).
  - Rescan, could-not-start and could-not-restore rows below the control, --bg-elevated; rescan muted, the other two --danger, icon the same colour. Light #62625b and #9e0a0a, dark #c4a0a4 and #ff8a8a (m-*).
  - Trashed row: bin icon and muted text, Restore in the row (l-*-trashed).
  - Write, type, Back 0 ms, 500 ms and 1.8 s after the last key: mark and text by 300 ms, unchanged at 4.5 s, one POST (f-writeback-*).
  - Scroll restore: scrollY 900 before a photo and 900 after Back, at +300 ms and past the second read, at 1280 and 390. Pressing the next day, also with 60 photos: scrollY stays 0 for 6 s, with its own note and heading. Same with the stream delayed 1.5 s and the day pressed before the note settled (f-scroll-*).
  - Trash in a second tab (the core's route, called from that tab), then press the day from a grid still showing the mark, with a panel open on another day and with none: by 100 ms the panel shows trashed and the mark and label are gone. One /note, one months and one days read, nothing further in 4 s. Restore in the second tab, press the day: mark and text back. Restore in the panel: mark and text back (f-trash-a).
  - Write with the POST delayed 1.5 s, then leave by the sidebar, browser Back, another day or Close: stays where the viewer went. The other day shows its own Write. With no leaving, the editor opens (f-leave-*).
  - Re-checks of differences 2 and 3 of the first run: Retry after a stream 404 sends /note and the stream once each, nothing repeats. Stream 404, scan, Retry: panel missing, and mark and label gone at once, with one calendar read (f-stream404, f-missing-after-retry).
  - view=map&date=2013-03-15: no /note and no stream request in 6 s, no note area. Calendar tab then reads /note and the stream once.
  - Undated list: no note request, no note area, Write or Edit (f-undated).
  - Map point: list with a section heading, no note area, no note request. Section link to 2013-03-15: month and date in the URL, panel with the note, Edit and the mark; Back returns to the map with no note area (f-map-list, f-map-link-day, f-map-back).
  - No horizontal overflow at any of these widths.

  Differences from the spec or the design:
  1. Press Write with the POST delayed, then the Map tab: on the response the page goes to the editor, leaving the map (/drive/テスト画像/Photo Diary?file=...&edit=1). The date stays in the URL on the map, so the panel's day is not left, and the response navigates (f-leave-map-tab).
  2. Re-read failure over a drawn note still moves the photos: first photo 499 to 567 at 1280, 1009 to 1089 at 390. The spec's failure row says the photos below do not move. Difference 1 of the first run (m-*-rereaderr).
  3. Month bar in en at every wide width: with the undated button present, Today drops to a second row under the previous button. For a long month the next button drops too: September gives previous, title, picker on the first row and next, Today on the second. The artifact has previous, title, next, Today in one row, the undated button at its right. In ja the bar is one row (f-bar-1024-sep, l-light-1280-noted).
  4. Rescan row at 390: the icon sits alone on the first line and the text wraps below it; row 92 px high. The artifact's message text is flex 1 1 180px with min-width 0, beside its icon. The load-error and trashed rows have this and keep the icon beside the text (m-*-phone-rescan).
  5. A day's count in the grid is a bare number ("60"). The artifact has the unit ("27枚"). Not listed by the first run.

  Not run: Back in the Litloft app and anything on iOS; the changed paths were run in Chromium only. /note answering 404 while open, a locked drive, next from a month in no list, a save slower than 3 s.
  The run's own: while the stack was up a sqlite3 read from the host made the backend answer "disk I/O error" on data.db until it was restarted. quick_check was ok. Not the app's behaviour; those requests are not counted above.
pending: iOS on a real device. Back by the app's swipe gesture in the iOS app, which idb could not produce in the simulator.

## Findings triage, 2026-11-01

Fixed: code-r1 A1 to A4; the surviving mutants u92, e07, u12, c28, u62, with tests; the test timeout that let the second read rescue broken paths (u09, u52, u59 now die); a stream 404 followed by a failed `/note` never settling; and from the second run, a creation answered after moving to the map navigating, and the rescan row's icon sitting alone on a phone.

Left, each scored below the threshold, or out of this change:

- code-r1 B1, B2: frequency 0, impact 1.
- mutation-r1 u03, u26, u11, u31, u17, b08, c18: frequency 1, impact 5 or less. Test gaps; the code holds. p08 became equivalent with the A4 fix.
- code-r2 1: going to the map right after Back consumes the saved position. Frequency 1, impact 3.
- code-r2 5: a creation answered while a navigation is pending can still open the editor. Frequency 1, impact 3, unreproduced; it needs a real browser.
- code-r2 2, 3, 4: test gaps with the code correct.
- The second run's differences: an error row above a drawn note moves the photos by its height, which the user is told; `en` month bar wrapping to two lines, which the agreed rule of wrapping the bar as a whole allows; the grid's count having no unit, as it was before this change.

For the human: `LoadError` is shared, so its restyle also changes how a failed map or undated list looks, against the letter of item 7 ("with no slot its output is unchanged"). Kept, because one look for one error is what the design asks for.
