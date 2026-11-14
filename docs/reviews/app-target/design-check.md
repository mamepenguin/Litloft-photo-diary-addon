# Design check

at: 0345d1473ad0f82fb795120d83c307ec754b8b54
design: docs/reviews/app-target/design/

Paths: design files are under `docs/reviews/app-target/design/`; screenshots are under `docs/reviews/app-target/screenshots/r2/` (`pd2-layout-*`, second R-5 run, layout checker). Core ids "core D-n" refer to `/Users/libre/Sources/video_share-app-target/docs/process/reviews/feature-addon-app-header/design-check.md`, whose D-1..D-11 and D-14 the human accepted there; they are cited, and each difference is still listed here because it is visible on the Photo Diary screens. Artboards were rendered by the R-5 agent with a minimal renderer (no Design Canvas runtime), see decisions.md. Spec section 9 declares the calendar cells, the map and the pins illustrative; those are listed too and marked "declared in spec".

## Decisions read from the design
- Main 1280: sidebar 240 wide, empty (Main.dc.html:18); no core top bar drawn.
- Main 1280: header padding 8px 16px 0; icon tile 40x40 r12 #f6f6f3, row `align-items:flex-start`, gap 12 (Main.dc.html:21-23)
- Main 1280: h1 24px/1.35 700; scope 14px #62625b, 4px under the title (Main.dc.html:25-26)
- Main 1280: Target at the title row's right end, min-height 36, padding 4/8, no fill, 14px muted, icon + name + chevron (Main.dc.html:28)
- Main 1280: tabs row: gap 24, margin-top 8, label padding 10px 4px, active 600 + 2px #d63031 underline hugging the label, hairline under the row (Main.dc.html:30-33)
- Main 1280: month bar: prev arrow, h2 18px 700 "2026年10月", next arrow (36px, enabled) on the left; 今日 and 撮影日なし 12 (pills, #e5e5e0, r16) at the right end (Main.dc.html:37-46)
- Main 1280: weekday row and day grid are 7 columns across the whole content width, gap 6; cell height 84 r12, padding 8, day number 13px muted at top-left, count 16px 600 at bottom-left, note mark = 6px dark dot at top-right; tint steps #f7f0ea/#f3e7de/#eedacd/#e8c9b8, note-only cell #f6f6f3 (Main.dc.html:48-57, 66-75)
- Map 1280: same header and tabs, 地図 selected; map area starts flush under the tabs row and fills to the board bottom (Map.dc.html:30-36)
- Map 1280: four 48px pins (r10, 2px white border, flat colour fill), count badge 18px dark at the pin's top-right; attribution bottom-right 8px/6px; no zoom controls (Map.dc.html:41-45)
- Phone 375: top bar 48px with a menu button only (Phone.dc.html:18)
- Phone 375: header padding 8px 16px 0; row `align-items:center`: icon tile 40x40 r12 centred against the title+scope block (Phone.dc.html:23)
- Phone 375: h1 24px nowrap ellipsis; scope row margin -6px top and bottom, so scope text is about 32px under the title centre; scope text at the start, Target at the end (min-height 44, margin-right -8, chevron ends at x 359) (Phone.dc.html:23)
- Phone 375: tabs gap 24, margin-top 8, label padding 10px 4px, underline hugging the label (Phone.dc.html:24-26)
- Phone 375: month bar: prev arrow, h2 17px, next arrow (44px, enabled) at the left; 今日 pill at the right end; no 撮影日なし control (Phone.dc.html:31-38)
- Phone 375: grid gap 4, cell 52px tall r10, padding 4, day number 11px muted and count 13px 600 both centred, no note mark drawn on the note-only cell (Phone.dc.html:39-47)
- Phone-Long 375: Map view selected; long folder name cut with an ellipsis inside the Target, icon and chevron whole; map flush under tabs, four 48px pins, attribution bottom-right (rendered artboard `pd2-layout-artboard-phone-long-375.png`; source Phone-Long.dc.html)
- Target-Menu: popover 320 wide, padding 8, r16, shadow 0 8px 24px; heading "対象" 11px 600 muted; row: 16px radio (selected 5px #d63031 ring, others 1.5px #91918c ring) + name + count 12px muted; selected row fill #f6f6f3; divider; "管理…" row with sliders icon (Target-Menu.dc.html:5-9)
- Target-Manage: dialog 440 wide, r24; search field filled, no border; checkbox rows, one row at opacity 0.4; "完了" red pill; no close button (Target-Manage.dc.html)

## Findings
### D-1 Phone 375: the icon tile is not centred on the title + scope block
- design: `align-items:center`, tile centre level with the middle of title and scope (Phone.dc.html:23; `pd2-layout-artboard-phone-375.png`: tile centre y 89, title 72, scope 104)
- implementation: tile sits level with the title and the scope line hangs below the tile's bottom (`pd2-layout-375-calendar-default.png` at 2x: tile 168-248 so centre 104, title about 98, scope 142). Same on Map (`pd2-layout-375-map-long.png`). Accepted in core as core D-1.
- visible: at a glance

### D-2 Phone 375: the scope line and Target sit about 10px further below the title
- design: scope text about 32px under the title centre; the Target's 44px box rises into the title row (Phone.dc.html:23, margin -6px)
- implementation: scope and Target text about 44px under the title centre (`pd2-layout-375-calendar-default.png`: title 98, scope 142); the Target box starts 4px below the title bottom (decisions.md layout checker, Phone difference 2). Accepted in core as core D-2.
- visible: side by side

### D-3 All widths: tabs are wider and indented, with a longer underline
- design: gap 24, label padding 10px 4px, 2px underline as wide as the label (Main.dc.html:30-33; artboard: カレンダー underline x 257-334 at 1280)
- implementation: 16px horizontal padding, 4px gap, underline 100px wide at 1280 (x 256-357) and the label starts 12px further right (`pd2-layout-1280-calendar-default.png`: label at x 272 vs 261 in `pd2-layout-artboard-main-1280.png`); at 375 the カレンダー label starts at x 32 under an underline that starts at 16 (`pd2-layout-375-calendar-default.png`) against x 20 in the artboard. Accepted in core as core D-7.
- visible: side by side

### D-4 All widths: the core top app bar and a populated sidebar are drawn; the artboards draw an empty sidebar and no top bar (hamburger only at 375)
- design: Main/Map have an empty 240px sidebar and no top bar; Phone has a 48px bar with the menu button only (Main.dc.html:18, Phone.dc.html:18)
- implementation: top bar with search, quick note and profile (76px at 1280, 48px at 375 with the same three icons), populated sidebar; the header starts lower (h1 at y 84 vs 8 at 1280) (`pd2-layout-1280-calendar-default.png`, `pd2-layout-375-calendar-default.png`). Accepted in core as core D-9.
- visible: at a glance

### D-5 Main/Map 1280: the Target is 28px tall, the artboard's is 36px
- design: min-height 36, padding 4/8 (Main.dc.html:28)
- implementation: 28px tall (decisions.md layout checker: Target rect 134.6x28); text, icon, chevron, no fill and the 8px chevron inset match (`pd2-layout-1280-calendar-default.png`). Accepted in core as core D-10.
- visible: only by measuring

### D-6 Main 1280 and Phone 375: month bar controls and placement differ
- design: plain 36px (44px at 375) prev and next arrows around the heading; at 1280 今日 and 撮影日なし 12 are pushed to the right end of the row; at 375 今日 is at the right end (Main.dc.html:37-46, Phone.dc.html:31-38)
- implementation: a chevron-down month-picker beside the heading, a disabled next-month disc (September 2025 is the newest month), and 今日 plus 撮影日なし 10 grouped at the left, next to the heading at 1280 (`pd2-layout-1280-calendar-default.png`: 今日 at x 494, 撮影日なし at 545-672); at 375 今日 sits right after the disc at x 252, not at the right end (`pd2-layout-375-calendar-default.png`). Not in the declared differences (spec section 9 declares cells, map and pins only).
- visible: at a glance

### D-7 Phone 375: the 撮影日なし control is drawn under the grid; the artboard has none
- design: no 撮影日なし control on Phone (Phone.dc.html:31-38, 42-49)
- implementation: a 撮影日なし 10 pill below the grid (`pd2-layout-375-calendar-default.png`, y about 600). Data-dependent (it is drawn only when the target has undated photos); the artboard's data has none.
- visible: at a glance

### D-8 Main 1280: the calendar is 416px wide and the right side is empty
- design: 7 columns across the full 1008px content width, cells about 139x84 (Main.dc.html:48-52)
- implementation: 7 columns in a 416px column at the left, cells 54x76, the area to the right empty (`pd2-layout-1280-calendar-default.png`). Declared in spec section 9 (calendar keeps today's look).
- visible: at a glance

### D-9 Calendar cells: size, radius and gaps differ at both widths
- design: 1280 cells 84px tall r12 gap 6; 375 cells 52px tall r10 gap 4 (Main.dc.html:51-53, Phone.dc.html:42-44)
- implementation: 1280 cells 54x76 r12; 375 cells 44x48 r12 with gap 6 on a 343px grid (decisions.md layout checker, Phone difference 4; `pd2-layout-375-calendar-default.png`). Declared in spec section 9.
- visible: side by side

### D-10 Calendar cells: the day number and the count swap emphasis
- design: day number small and muted at top-left (13px at 1280, 11px centred at 375), count large and bold at the bottom (16px 600 at 1280, 13px at 375) (Main.dc.html:54-55, Phone.dc.html:45-46)
- implementation: the day number is the bold dark figure and the count is a small muted figure under it, left-aligned at both widths (`pd2-layout-1280-calendar-default.png`: "3" bold, "1" small grey; `pd2-layout-375-calendar-default.png`). Declared in spec section 9 only as "cells illustrative"; the hierarchy inversion is visible on every tinted cell.
- visible: at a glance

### D-11 Calendar cells: the tint colour differs
- design: warm beige steps (#f7f0ea for 1-2, up to #e8c9b8) (Main.dc.html:68)
- implementation: pale pink for the one-photo cells (`pd2-layout-1280-calendar-default.png`, `pd2-layout-375-calendar-default.png`); the note-only cell on 2 is grey in both. Declared in spec section 9 (cells illustrative).
- visible: at a glance

### D-12 Calendar cells: the note mark is a pen icon, not a 6px dot
- design: 6px dark dot at the cell's top-right at 1280; none at 375 (Main.dc.html:54, Phone.dc.html:44-46)
- implementation: a 12px pen icon beside the day number on 2, at both widths (`pd2-layout-1280-calendar-default.png`, `pd2-layout-375-calendar-default.png`). Declared in spec section 9 (cells illustrative).
- visible: side by side

### D-13 Calendar month heading is larger than the artboard's
- design: h2 18px at 1280, 17px at 375 (Main.dc.html:40, Phone.dc.html:34)
- implementation: the heading "2025年9月" spans about 100px at 1280 for 7 characters against about 102px for 8 characters in the artboard (`pd2-layout-1280-calendar-default.png` x 292-392; `pd2-layout-artboard-main-1280.png` x 301-403); at 375 about 98px for 7 against 96px for 8 characters. Measured by eye from the screenshots, not from the code; the font size itself was not read.
- visible: only by measuring

### D-14 Map 1280/375: the map starts 8px below the tabs and does not fill to the board bottom the same way
- design: map area flush under the tabs row, no gap (Map.dc.html:36; Phone-Long artboard)
- implementation: the map starts at y 190 at 1280 (tabs row ends 182) and at 220 at 375, an 8px band of page under the tabs; stage reaches the viewport bottom (decisions.md layout checker item 3; `pd2-layout-1280-map-default.png`, `pd2-layout-375-map-long.png`)
- visible: side by side

### D-15 Map: attribution is at the top-left and zoom controls are drawn at the top-right
- design: attribution bottom-right (8px/6px), no zoom controls (Map.dc.html:45)
- implementation: attribution at the map's top-left, a +/- group at the top-right (`pd2-layout-1280-map-default.png`, `pd2-layout-375-map-long.png`). At 375 the +/- group covers the count badge of the northernmost pin (`pd2-layout-375-map-long.png`, pin at the top-right). Declared in spec section 9 (map illustrative).
- visible: at a glance

### D-16 Map: pins show thumbnails and the base is a real map
- design: four 48px pins on flat colour fills over a drawn beige/blue base (Map.dc.html:36-44)
- implementation: three 50px pins showing photo thumbnails over OSM tiles (`pd2-layout-1280-map-default.png`). Declared in spec section 9 (map and pins illustrative).
- visible: at a glance

### D-17 Target menu 1280: the popover is 200px wide, the design's is 320px
- design: 320px wide, r16, shadow, padding 8 (Target-Menu.dc.html:5)
- implementation: 200px wide (x 1064-1264, `pd2-layout-1280-target-menu.png`; decisions.md layout checker item 2), so the long folder name wraps onto two lines; r16 and shadow match.
- visible: at a glance

### D-18 Target menu: no radio circles; the selected row has a check mark
- design: 16px radio on every row, selected 5px red ring, others a thin grey ring (Target-Menu.dc.html:7)
- implementation: no marker on unselected rows, a check mark at the left of the selected row only (`pd2-layout-1280-target-menu.png`, `pd2-layout-375-target-menu.png`). Accepted in core as core D-4.
- visible: at a glance

### D-19 Target menu 375: shown as a bottom sheet with a dimmed page
- design: only the 320px popover is drawn; no phone placement (Target-Menu.dc.html:5)
- implementation: a card 8-367px wide at the bottom of the screen over a dimmed page, the open Target drawn with a filled pill (`pd2-layout-375-target-menu.png`). The artboard draws no phone placement. Accepted in core as core D-5.
- visible: at a glance

### D-20 Target menu: the unusable row shows no reason text
- design: no disabled row is drawn; spec item 5 says an unusable folder is listed disabled "with この対象は使えません"
- implementation: `Long clips only` is greyed with the reason only in the row's `title`; no visible text (`pd2-layout-1280-target-menu.png`, `pd2-layout-375-target-menu.png`). decisions.md "Human decisions" records the human's choice of the `title` attribute (code-r1 F5); the spec text was not updated to say so.
- visible: side by side

### D-21 Manage dialog: not shown in R-5, cannot be checked
- design: Target-Manage.dc.html (440px, search field, checkbox rows, one row at 0.4 opacity, 完了 pill, no close button)
- implementation: the second R-5 run did not open 管理…; the first run only listed it as a menu row. `pd-probe-manage.png` exists in `screenshots/` but is a probe, not named in decisions.md `evidence:`. Related core ids: core D-6, D-11.
- visible: not shown in R-5

### D-22 Not shown in R-5, cannot be checked
- 1280 calendar under the Phone-Long state (long folder name on Calendar at 375 is shown, `pd2-layout-375-calendar-long.png`; Phone-Long itself is the Map and is shown); the Target's hover, pressed and open fill at 1280 (decisions.md layout checker "What I could not check"); the frame before the drive is known and the drive-alone scope line are covered only by the in-between shot `pd2-target-item1-scope-changing.png`, which has no artboard to compare against.
- visible: not shown in R-5

TOTAL: 22 findings
