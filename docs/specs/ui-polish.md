# Photo Diary: a calendar that shows the busy days, and a map that shows the photos

SPEC-ID: SPEC-PD-008
SPEC-ID: SPEC-PD-009
SPEC-ID: SPEC-PD-010
SPEC-ID: SPEC-PD-011
SPEC-ID: SPEC-PD-012

Approval:

## Summary

The page works but says little at a glance. Every day with photos has the same surface, so the day of an outing looks like any other. The map's detailed base competes with the points, and a number on a dark circle says how many photos a point holds but not what they show. The calendar scrolls away while its photos are read, though the map stays put. This keeps the page in the core's theme and fonts and adds a little character.

- **SPEC-PD-008**: a day's surface deepens with its photo count, a hovered day previews a photo, and the colours fade in when a month opens.
- **SPEC-PD-009**: the calendar stays in view while the photos scroll: held on a wide layout, a one-week strip on a narrow one.
- **SPEC-PD-010**: the base map is drawn from OSM vector tiles in a quiet style that follows the theme.
- **SPEC-PD-011**: a point is drawn as a photo with a count badge.
- **SPEC-PD-012**: the view switch moves to the top right on a wide layout, the map fills the remaining height, and the close control becomes a quiet icon.

This spec alone states the behaviour and values. The user approved its direction on the design artifact https://claude.ai/artifact/RG7AAU9Pm6bZyiyuDpeyw1, pattern 3, and on the production `photos` drive for the calendar; `docs/reviews/ui-polish/decisions.md` records both.

## Definitions

- **Wide** and **narrow**: `useWide`, at least 48rem on the measured element. The views measure themselves, as today. The tabs use one more `useWide` on an element wrapping the page's `PageFrame`.
- **Step** of a day with `count` above 0:

  | Step | Photos | Surface | Hover surface | Share of the 581 dated days on production, 2026-11-01 |
  |---|---|---|---|---|
  | 1 | 1 to 2 | `bg-accent/10` | `bg-accent/15` | 67% |
  | 2 | 3 to 9 | `bg-accent/20` | `bg-accent/30` | 24% |
  | 3 | 10 to 29 | `bg-accent/40` | `bg-accent/50` | 7% |
  | 4 | 30 and more | `bg-accent/60` | `bg-accent/70` | 2% |

  The steps are the same in every month and on every drive, so two months can be compared.
- **Day photo** of a date: the first id `/photos?date=<date>&limit=1` answers, which is the first photo of that day's list.
- **Pin**: what the map draws for a point, as defined in `docs/specs/photo-diary.md`. Its membership is unchanged.
- **Pin photo**: among the photos a pin stands for, the newest dated one, or the first undated one in `/points` order when none is dated. `/points` is ordered with dated photos ascending and undated ones last, so the browser ranks each point and a cluster property keeps the lowest rank. It needs no request and no new field.
- **Thumbnail**: `/api/files/{id}/thumbnail`. A file with no generated thumbnail answers 200 with the core's placeholder image, and the page does not tell it apart. So only a failed request counts as a thumbnail failure.

## Required items

### 1. Normal flow

**SPEC-PD-008.** The grid draws each day with its step's surface.

The step surfaces fade in over 450 ms, in grid order, each day starting 14 ms after the one before and counted from the moment they first exist. A note-only day does not fade, and a hover applies at once. The fade runs when the grid draws a month other than the one it last drew while on screen: previous, next, the month picker, Today, browser Back or Forward, or a section link from the map. It also runs on the first draw on screen of a page whose URL had no query when it loaded, which is the page's existing fresh start and includes the sidebar row's restart. A page loaded with a query, as a return from a photo or a reload of a day is, draws its first month at once. No fade runs on a refresh, a re-read of the same month, pressing a day, or returning to the calendar with the same month.

On a device that matches `(hover: hover)`, resting on a grid day with photos for 120 ms reads its day photo, once per date while the answer is held, and loads its thumbnail. The preview shows when the image has loaded. It is centred on the cell, 8 px above it, or 8 px below when there is no room above, and moved to stay at least 8 px inside the viewport.

**SPEC-PD-009.** On a wide layout the calendar column is `position: sticky`, 16 px below the app header (`--app-header-h`), whenever the column's own height plus that offset fits the viewport. This is measured whenever the column's size or the window's size changes while the view is on screen, and when the view comes back on screen. Nothing is measured while it is hidden. When it does not fit, the column stays in the flow, so every week remains reachable at every viewport height.

On a narrow layout the month grid stays in the flow. Once a day list is open, the month's days have been read and the grid's bottom has scrolled above the app header, a strip appears directly under that header, as wide as the view's content column, overlaying the page without adding height. The list's sticky heading then sits under the strip. Pressing another day in the strip opens it as in the grid, and pressing the open day does nothing, as in the grid. When the new list has settled, ready or failed, the page scrolls instantly so that its heading sits under the strip. If the document is too short for that, the browser's clamp decides the end position and the strip follows its own rule. The back control scrolls instantly so that the month bar sits under the app header, and moves focus to the open day in the grid.

**SPEC-PD-010.** The map's base is one vector source and a style held in the addon, in two palettes. A theme change while the map exists repaints it through paint properties, without recreating or moving it. While the view is hidden the repaint waits until it is on screen.

Layers, bottom to top, with widths in px at zoom 9, 13 and 16 where they vary. Tunnels and bridges are not distinguished:

| Layer | Source layer and kinds | Palette column | Width |
|---|---|---|---|
| Background | none | Land | |
| Woods, parks | `land`: forest, wood, park, grass, meadow, village_green, golf_course, scrub, recreation_ground | Woods, parks | |
| Water | `ocean`, `water_polygons` | Water | |
| Rivers | `water_lines`: river | Water | 1.2 |
| Minor streets, from zoom 13 | `streets`: tertiary, unclassified, residential, living_street | Minor road | 0.5 at 13, 3 at 16 |
| Primary, secondary | `streets` | Major road | 0.5, 1.4, 4 |
| Motorway, trunk | `streets` | Major road | 0.8, 2.2, 6 |
| Rail | `streets`: rail, dashed 3 and 2 | Rail | 1 |
| Names | `place_labels`: capital, state_capital, city, town, village, suburb, drawn from `name` | Label, halo | Text 14 for capital, state capital and city, 13 for town, 12 otherwise. Halo 1.4 |

Nothing else is drawn: no buildings, street names, route numbers, points of interest or boundaries.

**SPEC-PD-011.** A pin is a thumbnail of its pin photo, 12 px radius, with a 2.5 px white border. Its side depends on what it stands for: 44 px below 10 photos, 50 px below 20, 58 px below 100, 68 px from 100. A pin standing for 2 or more photos carries a count badge at its top right. A pin standing for one has none. Pressing a pin opens its list as pressing a point does today. The selected pin has a 2.5 px accent border and is on top of its neighbours. Selecting a pin changes only its border and order and does not load its image again. A pin is kept while its members' count and pin photo are the same, so panning does not re-create it.

**SPEC-PD-012.** On a wide layout the Calendar and Map tabs sit at the right end of the header's title row, through the core's `PageHeader` `actions` slot. On a narrow layout they stay in their own row, because the row cannot hold both: at 375 px the Japanese title would have 113 px of the 192 px it needs. The map's stage fills the column down to the bottom of the viewport, with no card border, radius or side padding, and keeps its `24rem` minimum. Its height is the dynamic viewport height less its document offset, read again when a banner comes or goes, on resize and when the view comes on screen, so a banner shortens it. While the stage is drawn the view has no bottom padding, so the document does not scroll above the `24rem` floor. The stage's other phases (loading, empty, no WebGL, errors) keep today's padding and shapes. Every close control of a list is an icon-only × in the muted colour.

### 2. Failure cases

| Case | What happens |
|---|---|
| The day photo read fails, or the day has no photo any more | No preview. Nothing else changes, and hovering the day later reads it again |
| A preview thumbnail fails | No preview, the held id is dropped, and hovering it later reads the day photo again |
| A response or image for a day the pointer has left | Dropped |
| A pin thumbnail fails | The pin stays, on the `--sand` surface, and can be pressed, with its badge and border. Its pin photo is not requested again until the map's data refreshes |
| A vector tile fails with a status other than 404, or a network error | The existing notice, on the same rule. The land colour stays under the pins and they can still be pressed |
| A vector tile answers 404, or 200 with an empty tile | MapLibre treats both as an empty area, so no notice shows. The default server answered 200 with an empty tile for open sea on 2026-11-01 |
| A glyph file fails, or a name uses characters outside the bundled ranges and the ideographic ones | MapLibre draws those characters with the browser's font and warns in the console. No notice shows |
| `PHOTO_DIARY_TILE_URL` names a raster server, a server stopping below zoom 14 or another schema | Unsupported. The map shows land colour and pins, or the tile notice when tiles fail. This spec does not detect it, and the README says so |
| A preview read answers 404 | No preview. It does not report not-available, since the page's own reads decide that |

### 3. States

| Thing | States | Moves between them |
|---|---|---|
| Preview | None, waiting (120 ms), reading, loading the image, shown | Entering a day starts waiting and ends any other day's preview. Then reading (skipped when the id is held), loading, shown. A failure goes to none. Leaving, pressing, scrolling, changing month, the view going hidden or the page unmounting goes to none from any state |
| Fade | Not run, running, done | Per item 1. A surface that is done never fades again until another month is drawn |
| Narrow strip | Hidden, shown | Shown only while the calendar view is on screen and narrow, a day list is open, the month's days are read and the grid is above the header. Otherwise hidden, including while the days are loading or failed |
| Wide calendar column | In the flow, held | Re-measured as in item 1. Crossing to narrow puts it in the flow |
| Pin thumbnail | Loading (`--sand`), drawn, failed (`--sand`) | Loading ends in drawn or failed. Failed goes back to loading when the map's data refreshes. A drawn pin stays drawn while its pin photo is the same |
| Pin selection | Unselected, selected | Follows the open list, with no image load |
| Palette | Light, dark | The root's `data-theme` |

Not allowed: a preview in the strip or on a device that cannot hover, a strip for the undated list or with no open day, and a step surface on a day with `count` 0.

### 4. Data read and written

| Store | Access |
|---|---|
| Core `files`, `file_exif` | Read, through existing routes. No route's answer changes except `/map-config`'s default URL |
| Core thumbnails | Read by the browser for previews and pins |
| Browser session storage | Unchanged |
| Tables owned by the addon | None |

Nothing is written. Preview answers are held in memory for the page's life, keyed by date. Every re-read of the month's days, including the one each time the view comes on screen, drops them, because the core's thumbnail route still answers for a trashed photo. A preview on screen is not closed by that.

### 5. External services

One, as before: the map tile server, now serving vector tiles.

- Default URL: `https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt`, with the default attribution unchanged. On 2026-11-01 it answered 200 with `Access-Control-Allow-Origin: *` to a request carrying a LAN referer, and its TileJSON declares `maxzoom` 14.
- `PHOTO_DIARY_TILE_URL` now names a vector tile server using the Shortbread schema, up to at least zoom 14. Raster URLs are no longer supported. Production sets neither variable. The style's `maxzoom` is 14, and the map over-zooms from there to its top zoom 19.
- OSMF's vector tile policy applies: best effort with no SLA, a valid `Referer`, a URL that can be changed, no bulk download. The browser's own cache follows the server's headers. Nothing is prefetched.
- The TileJSON is not read. The URL and `maxzoom` are in the style, so a tile request remains the only outside request.
- Glyphs are served from the addon's own `/assets`, so the map contacts no other outside host. Han, kana and Hangul are drawn with the browser's fonts by MapLibre's `localIdeographFontFamily`, given the core's font stack. The bundled ranges are U+0000 to U+2FFF of Noto Sans Regular, under its OFL licence, which ships beside them. A Latin map label is therefore in Noto Sans. The style's `glyphs` is `<origin>/api/addons/photo_diary/assets/glyphs-<version>-{fontstack}-{range}.pbf` and its `text-font` is `NotoSansRegular`.

Slow: the land colour shows first and pins are not held back. A tile of a dense area at low zoom is large: 648 KB measured for the Tokyo area at zoom 10. Down or wrong: see failure cases.

### 6. Authorization

Unchanged. Data routes run `_drive_scope`. The core's thumbnail route runs its own drive check. `/assets` stays open and serves only names from its fixed list, which gains the glyph files, as `glyphs-<version>-NotoSansRegular-<start>-<end>.pbf`, and their licence. The names carry the font's version because `/assets` answers `immutable`.

### 7. Effect on existing features

**Changes to what `docs/specs/photo-diary.md` and `docs/specs/daily-notes.md` promise.** No invariant of either is broken. Tests that pin these change with them, and only these:

- A day with photos no longer has the `--sand` surface. A note-only day and a day with nothing are unchanged.
- "Tiles are raster, 256 pixels, up to zoom 19" becomes the vector rule above.
- A point is no longer a dark circle or dot.
- The close control's visible word 閉じる / Close becomes its accessible name.
- The agreed layout of the tabs and the map's stage changes as item 1 says.

**Everything else.**

- `frontend/PhotoList.tsx` is shared by both views. Its close control changes, and its page heading's sticky offset adds the strip's height while the strip shows. The panel heading does not change.
- The cluster radius rises from 40 to 64 px so that pins do not cover one another completely. Which photos make up a pin at a given zoom therefore changes, and its list stays exactly those photos.
- The strip and the held column add no document height, and the sticky implementation means the list's existing scroll restore still reads the window's scroll.
- `FileGrid`'s fixed context menu is unaffected, because neither the column nor the strip adds a transform or containment to its ancestors.
- The core is not changed. `PageHeader`, `PageTabs` and `Button` are used as they are.

### 8. Error behavior

No new message. A missing preview, a sand pin and a missing label are silent. The tile notice keeps its text. The browser logs failed requests as it does today, and the addon logs nothing.

### 9. User-visible behavior

- **Calendar cell.** The count stays at its present size and position. Its colour is `text-text-muted` at step 1 and `text-text-primary` from step 2. The date and the note mark are unchanged. There is no legend. A selected day keeps its `border-accent`. A selected day at step 3 or 4 also carries an inner 2 px ring of `--bg-primary`, since accent on a deep tint would not separate. When that day has keyboard focus, the existing focus ring replaces the inner ring.
- **Preview.** 176 × 132 px, `rounded-xl`, cover-cropped, a 3 px `--bg-card` border and `shadow-card`, on the `z-30` tier, portalled to the body. It is decorative: it has no accessible name and does not appear on keyboard focus, because the list the day opens holds the same photo. Pointer events pass through it.
- **Motion.** Under `prefers-reduced-motion: reduce` the fade does not run. No `scale()` is used.
- **Strip.** `--bg-primary` with a bottom border, on the `z-20` tier, above the list's sticky heading. A 36 px row holds the month as text and, at its right, the back control, named 月を表示 / Show month. A 44 px row holds the seven days of the open day's week, with the same step, border, label and action as in the grid, showing the date and count. Days of that week in another month are blank. The total height is 80 px plus the border. The back control scrolls instantly.
- **Pin.** Its image is cover-cropped, and while it loads the pin shows `--sand`. A pin holding more photos sits above one holding fewer, the selected pin above all, and all of them below the narrow sheet and the tile notice. The badge is white text on `#211922` in both themes, with a 1.5 px white border, 18 px tall, at least 18 px wide with 5 px side padding and tabular digits, its centre near the pin's top-right corner (offset 7 px outward). It does not change on selection. The selected border is a `border-accent`, so it spends no accent fill. The pin is a button named 写真 12枚 / 12 photos, or 写真 1枚 / 1 photo, with no alt text on the image.
- **Map.** Attribution stays at the top left, where the narrow list's sheet cannot cover it. The zoom buttons stay at the top right. The narrow sheet's content keeps clear of the device's safe-area inset.
- **Palettes.**

  | | Land | Woods, parks | Water | Minor road | Major road | Rail | Label, halo |
  |---|---|---|---|---|---|---|---|
  | Light | `#f6f6f3` | `#ecefe6` | `#d5e2e8` | `#ffffff` | `#dcdbd4` | `#d8d7d0` | `#62625b`, `#f6f6f3` |
  | Dark | `#231216` | `#261a18` | `#160b0e` | `#3a2226` | `#5c3a3f` | `#3d2428` | `#c4a0a4`, `#231216` |

- **Close control.** The core's `Button` with `iconOnly` and `variant="ghost"`, in `text-text-muted`, with its accessible name from the existing key. It gets its 44 px target on a coarse pointer from the core, and keeps its place at the right of the list's heading.
- **Text.** New keys are the pin's name and the back control's name, in `ja` and `en`.

### 10. Non-functional

- Size: up to 50,000 located photos. A pin exists in the document only for a point inside the current view plus a 68 px margin. A removed pin clears its image, which abandons a load in progress, and the browser's connection limit is the only other limit on thumbnail requests. A pin can be pressed and its list opened while thumbnails load. With a 64 px radius a 1500 × 1000 px map holds at most about 370. The map places its pins for 50,000 points within 3 seconds in Chromium, measured once before merge with generated rows, with thumbnails following as they load.
- Glyphs: the total added to `backend/assets` is measured and recorded in `docs/reviews/ui-polish/`.
- Privacy: a tile request's URL carries only `z/x/y`, so the server learns which map area is viewed. Thumbnails stay on the core's origin. The `Referer` remains at most the page's origin.
- Accessibility: every step's resting and hover surface keeps at least 4.5:1 with its text, up to `#211922` on the light 70% tint (5.5:1) and `#f5e6e8` on the dark 70% tint (4.8:1). Colour is not the only signal, because the count remains.
- Concurrency: no locks and no background work.
- Cost: none.

## Touch points

All in this repository (`mamepenguin/Litloft-photo-diary-addon`, `addons/photo_diary`):

- `frontend/MonthGrid.tsx`: steps, count colour, selected ring, fade, hover.
- `frontend/DayPreview.tsx` (new): the portalled preview. `frontend/useDayPreview.ts` (new): hover capability, delay, read and cache.
- `frontend/CalendarView.tsx`: the held column and the strip. `frontend/WeekStrip.tsx` (new).
- `frontend/lib/dates.ts`: the open day's week.
- `frontend/PhotoList.tsx`: the close control and the heading's sticky offset.
- `frontend/MapView.tsx`: the stage's height and edges, the error panel's close control.
- `frontend/map/createPhotoMap.ts`: vector source, pins replacing the visible circles and count labels, the rank property, palette repainting, tile retry on a vector source, pin press and drag handling. The circle layers stay with no visible paint, so the source keeps loading its data.
- `frontend/map/mapStyle.ts` (new): the layers and both palettes.
- `frontend/PhotoDiaryPage.tsx`: a measured wrapper that keeps `PageFrame` filling `main`, and the tabs through `actions` on a wide layout.
- `frontend/messages/ja.json`, `frontend/messages/en.json`.
- `backend/router.py`: default tile URL, `/assets` fixed list and the `.pbf` type.
- `backend/assets/`: `glyphs-*.pbf`, licence.
- `README.md`: the map tiles section and the variable's new meaning.
- Tests: `frontend/PhotoDiaryPage.test.tsx`, `frontend/DailyNotes.test.tsx`, `frontend/lib/dates.test.ts`, `tests/test_map_config_and_assets.py`, `e2e/` (support, map, mapBehaviour, tileFailure, attribution, page, selection, and vector tiles in the stand-in server).
- `docs/reviews/ui-polish/`.

## Invariants

I1. A day's surface step is decided only by its `count` with the boundaries 1, 3, 10 and 30, so 2 is step 1, 3 and 9 are step 2, 10 and 29 are step 3, and 30 is step 4; a day with `count` 0 and a note keeps `bg-bg-elevated`, and a day with nothing has no surface.

I2. A hovered day previews only its own day photo: a response or image for a day the pointer has left draws nothing, a day with `count` 0 reads nothing, a device that cannot hover makes no preview read, and a preview does not stay on screen once the calendar view is hidden.

I3. The fade runs when another month is drawn on screen, or on the first draw of a page loaded with no query, and never under reduced motion; a refresh, a re-read of the same month, pressing a day, returning to the same month from the map and a page loaded with a query draw the surfaces at once.

I4. The strip's appearance and the held column add no document height, and going back from a photo restores the list's scroll position at both widths, so `photo-diary.md` I6 and `daily-notes.md` I10 still hold.

I5. At every viewport height, including after a resize while the view was hidden and after a retry that draws the grid, every week of a six-week month can be reached and pressed.

I6. The narrow strip appears only while a day list is open and the month grid is above the app header, shows the seven days of the open day's week with the same counts as the grid, never covers the list's heading and close control, and pressing a day there opens that day's list.

I7. Every tile request's URL is the configured URL with only `z`, `x` and `y` filled in; while the calendar alone has been opened or the drive has no located photos no tile is requested; and glyph and library requests go only to the page's own origin, so the map contacts no other outside host; and a tile request's `Referer` is at most the page's origin. This keeps `photo-diary.md` I10.

I8. Changing the theme while the map exists repaints the base in that theme's palette without moving the view, closing the open list or requesting a tile that was already loaded.

I9. Pressing a pin lists exactly the photos it stands for, including several with identical coordinates at zoom 19 and a pin standing for more than 100, also after the data changes, which keeps `photo-diary.md` I7; a pin's photo is one of those photos, the newest dated one when any is dated; and a drag that starts on a pin moves the map and opens no list.

I10. A pin's thumbnail failure leaves the pin pressable with its count, and only pins inside the view plus a one-pin margin exist in the document, so a drive of 50,000 located photos requests thumbnails only for those.

## Checked, no action

- **A photo on every day cell, or on busy days only.** Tried on production. All days is cluttered and hides dates. Busy days alone are clean, but at 50 px the picture is unrecognisable and collides with the count. The user chose the hover preview.
- **New colour values.** The tints the user chose equal the accent token at 10, 20, 40 and 60% within a few levels in both themes, so tokens replace hex values. They are tints, not the accent fill that DESIGN.md §2.2 limits to one per screen.
- **A sand ramp.** Tried. It fits best and says little, and the user chose coral.
- **A legend.** The user rejected it. The depth reads as a feel, and the count is in the cell.
- **Thresholds relative to the month.** They would make a quiet month look as busy as a holiday and stop months being comparable.
- **Detecting a missing thumbnail.** It would need a file read per pin for a case the placeholder image already handles.
- **Keeping raster tiles as a choice.** Two code paths for one household. `PHOTO_DIARY_TILE_URL` remains, for another Shortbread server.
- **OpenFreeMap or CARTO.** OSMF serves the same data from the operator already in use, so no new party learns the viewed area. CARTO's free use is limited to grantees.
- **PMTiles on the NAS.** It would end all outside requests, but the user chose an external server in the earlier spec. The URL leaves room for a server.
- **Attribution at the bottom right, as drawn in the artifact.** The narrow sheet would cover it, which OSM's policy forbids. It stays at the top left.
- **Tabs at the top right on narrow.** The title would be cut to about 60%. They stay in their own row there.
- **`width="full"` for the map.** The title would jump when switching views on a very wide screen. The map keeps the wide column.
- **A preview on keyboard focus.** It would add a dismissal rule for a decorative image already available by pressing the day.
- **Choosing the pin photo by a score or by the user.** Not requested, and it would need stored data.
- **An accent-filled badge on the selected pin, as drawn in the artifact.** The accent border is enough, and it spends no accent fill.
- **Fixed dark or paper themes, serif type, tilted photos.** Tried and rejected by the user. The page stays in the core's theme and fonts.
- **Street names and buildings.** They are what made the base busy.
- **Keeping keyboard focus on a pin across zoom.** Zooming replaces pins, and a re-focus rule is not worth it on a map that points were not keyboard-reachable on before.
- **The core's process ledger, Internal API policy.** As in the earlier specs, this spec is not in the core's `INDEX.md`, reviews are in `docs/reviews/`, and no Internal API endpoint is added.
- **Promised above, checked by acceptance tests, R-5 or review, and not given an invariant line**: the count colour switch, preview size and placement, the 120 ms delay, the preview cache being dropped by a refresh, the strip's layout, blank days and back control, the pin sizes, badge, loading surface and stacking, a pin kept across a pan and not reloaded on selection, a failed pin photo not being requested again before a refresh, the cluster radius, the tile notice and its retry on the vector source, the scroll after a strip press, the theme repaint waiting while hidden, the 50,000-point limit, the tabs' position, the map's height and edges, the close control's name and target, the palette and layer table including the zoom 13 rule and what is not drawn, the default URL, the glyph fixed list and `.pbf` type, and the README.
- **iOS and real photos.** R-5 runs the page on the iOS Simulator and against real photos on a stack holding them. Whether the base looks right at street zoom is for the human at R-5, because an agent cannot judge it.
