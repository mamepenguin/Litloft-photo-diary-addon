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
