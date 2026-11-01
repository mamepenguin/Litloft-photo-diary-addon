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
