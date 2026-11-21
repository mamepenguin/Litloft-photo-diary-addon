# Photo Diary: the app card menu on every photo grid

SPEC-ID: SPEC-PD-026

Approval: sha256:e0473ae926a2ccd57939d74a9c8d09ce25f20e8c685f4ce9dc0a05f18ba2cdce Yuichi Senga 2026-11-21

## Summary

Photo Diary's photos open the core file menu through the core `FileGrid`. The core's
SPEC-CORE-169 (`docs/specs/photo-diary-card-menu.md` in the core repository) adds an opt-in,
`appCardMenu`, that gives a `FileGrid` card the app card menu of the Video, Reading, Notes
and Clips apps: an **Open in new tab** row, rows that act in the click, and no text
selection on a long press. This spec turns it on for every grid Photo Diary draws, so a
photo's menu matches a video's or a book's. The user is the one person who runs Litloft.

The human decided (2026-11-21): Photo Diary keeps re-reading its lists after a trash,
rename or move (`onRefresh`), as today.

**Order.** The core PR for SPEC-CORE-169 merges first; this repository's CI runs against core
`develop`. Photo Diary is not a core submodule, so this PR merges alone, with no pointer bump.
Baseline: `main` at `f2bf304`.

## Required items

### 1. Normal flow

Every `FileGrid` Photo Diary draws passes `appCardMenu`. The menu, the press and the new row
then behave as SPEC-CORE-169 states. After a menu trash, rename or move, the view re-reads
as today.

### 2. Failure cases

As SPEC-CORE-169; Photo Diary adds no step that can fail.

### 3. States

None new: Photo Diary passes a fixed prop and keeps no menu state of its own.

### 4. Data read and written

None: Photo Diary reads and writes nothing new; the row only builds a URL in core.

### 5. External services

None: no request is added.

### 6. Authorization

None new: the file page the row opens applies the drive's access check.

### 7. Effect on existing features

The grids at baseline `f2bf304`, each of which passes the opt-in:

- `LibraryFace.tsx` (`AllPhotos`, the Library grouped by なし)
- `PhotoShelf.tsx` (the Library's shelves)
- `ShelfPage.tsx` (a shelf page)
- `CalendarView.tsx` (the day's photos)
- `SectionedGrids.tsx` (set inside, so its caller, `MapView.tsx`, gets it without passing
  anything)

Each grid keeps the `onRefresh` it passes today. The Calendar's day preview
(`DayPreview.tsx`) and the map's pins draw photos outside `FileGrid` and have no menu today;
they stay without one.

### 8. Error behavior

None new: Photo Diary shows nothing of its own; the core menu's behaviour applies.

### 9. User-visible behavior

As SPEC-CORE-169 §9, on every photo grid: the Library (shelves and なし), a shelf page, the
Calendar's day list and the Map's list.

### 10. Non-functional

None: one prop per grid, no request, no string.

## Touch points

- `frontend/LibraryFace.tsx`, `frontend/PhotoShelf.tsx`, `frontend/ShelfPage.tsx`,
  `frontend/CalendarView.tsx`, `frontend/SectionedGrids.tsx`: pass `appCardMenu`.
- A test beside them that reads the addon's frontend sources.
- No README change: it does not describe the photo menu.

## Invariants

I1. Every `<FileGrid` element in the `.tsx` files under `frontend/` (all subdirectories; `*.test.tsx` and `__tests__/` excluded) carries `appCardMenu` as a bare attribute or `appCardMenu={true}`; any other form, or none, fails the test that enumerates them, and the enumeration finds exactly the five files named in §7.
I2. Every such `<FileGrid` element passes an `onRefresh` prop. That the passed function re-reads the view is library.md I13 and the existing view tests, unchanged.

## Checked, no action

- The menu's behaviour on a photo (the row, in-click rows, the press, the re-read call) is
  stated and tested in core (SPEC-CORE-169 I1–I6). Photo Diary's view tests mock `FileGrid`,
  so a Photo Diary test of the real menu would duplicate the core tests; I1 and I2 are what
  Photo Diary itself can break.
- Taking photos out in place after a trash: decided against by the human.
- The day preview and the map pins: no menu today, not part of the card menu.
- Photo Diary has no Continue or Recommended shelves, so no history or addon rows apply.
