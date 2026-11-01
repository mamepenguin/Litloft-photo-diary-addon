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
