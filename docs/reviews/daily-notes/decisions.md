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
