# Decisions

## Design Artifact

Agreed by the user on 2026-10-31: https://claude.ai/artifact/6SugRqnoFULzNEbhw9EXhh

The artifact is private to its owner. What it fixes:

- Desktop: the list sits beside the calendar or the map, on the right, so neither is hidden.
- Phone: the calendar's list follows the month grid; the map's list is a sheet over the map's lower edge.
- A day with photos is a `--sand` surface with its day number and count. A day without photos is
  plain muted text. The open day has an accent border, never a fill.
- A map point is a plum circle with a white ring, showing its count when it stands for more than one
  photo. Only the selected point is `--accent`.
- The undated entry ends the month bar on desktop and follows the grid on phone.
- The page header has the icon tile, the title and the scope line (drive and photo count). Calendar
  and Map are underline tabs.

## Spec ambiguity resolved by the author

"A set URL with an unset attribution shows none": `/map-config` returns `attribution: ""`, since the
field is a string in every other case.
