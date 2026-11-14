# Design check

at: d4aa9360237c91db7a105bf3436d5f102e3b65b5
design: docs/reviews/library/design/

Screenshots used (all under docs/reviews/library/screenshots/): current code d4aa936 = `pl-writes-recheck7-{375,768,1280}.png`, `pl-writes-recheck8-menu-{1280,375}.png`; earlier 8c238c7 = `pl-layout-design-app-*.png` and `pl-layout-design-artboard-*.png` (artboards rendered by the checker from the artboards' own markup, because `support.js` is absent from the design directory). Measurements are from decisions.md (checkers `layout`, `writes`).

## Decisions read from the design
- Main (1280x900): left rail 240px; header padding 8px 16px 0; icon tile 40px radius 12 (Main.dc.html:23); h1 24px/700 (:25); scope line 14px muted (:26); Target button 36px, transparent, right end of title row (:28)
- Main: tabs gap 24px, tab padding 10px 4px, 2px red underline on the active one, 14px, active 600 (:30-33)
- Main: controls row padding 16px 16px 0, gap 8; classification chip 36px tall, bg #e5e5e0, radius 12, label "分類" muted + value 600 (:37-38); sort chip same, "新しい順" (:39)
- Main: shelves container padding-top 24px, gap 36px between shelves (:42)
- Main: shelf heading baseline row gap 8, mb 12; h2 18px/700, count 14px muted, "すべて見る" at the right end (:45-48)
- Main: shelf photo line = one row, gap 8px, height 200px, tiles flex-grow by aspect ratio (0.75 to 1.78), radius 6, 5 tiles per shelf in the data, the row fills the shelf width (:50-52, :65)
- Tags (1280): classification menu 220px wide, padding 6, radius 14, items 40px min height, caption row "分類" 12px muted above 4 items, checked item has check mark and bg #f6f6f3 (Tags.dc.html:42-45); order 撮影月, タグ, コレクション, フォルダ (:74); tag shelves show 3 shelves of the same shape as Main (:49-61)
- Shelf (1280): back link above title, min-height 32 (Shelf.dc.html:22); title row with Sort (transparent, 36px) and Target at the right end (:29-32); grid padding-top 20px, rows gap 4px, tile gap 4px, radius 6, rows justified to the full width with heights 1008/sum (:36-40, :54)
- Phone (375x812): 48px bar with menu button only (Phone.dc.html:18); Target at the end of the scope line, 44px tall (:27-29); tabs as Main (:33); controls row padding-top 12px, buttons 44px, classification button shows value only, no "分類" (:40-41); shelves padding-top 20px, gap 28px (:45); h2 17px (:49); photo line gap 3px, height 120px, radius 6, 3 tiles per shelf in the data (:53-55)
- Phone-Shelf (375): back link (:23); Target at the end of the scope line (:30); sort in its own right-aligned row, padding 12px 16px 0, 44px (:36-37); photos grid padding-top 4px, gap 3px, radius 6, row height 340/sum (:40-42, :58)

Accepted by the human on 2026-11-15 (decisions.md "Design differences accepted by the human"), listed as accepted and not as findings: classification menu 192px wide with 36px items (design 220 / 40); grid gap 8px and corner radius 12px (design 8 on the Library at 1280 / 3-4 on shelf page and phone, radius 6); 40px between shelves and 24px under the tabs (design 36 / 28 phone, 16 / 12 phone); phone shelf title text-lg (design 17px); tab padding (design 4px, app 16px, so the active underline is wider). The classification menu caption was fixed in d4aa936 and now matches (`pl-writes-recheck8-menu-1280.png`, `-375.png`). Top bar, populated sidebar, data text ("main · 116枚" vs "photos · 3,672枚") and the file-name/favourite overlays on tiles are app shell or content, not compared.

Checked and matching at d4aa936 or in the 8c238c7 shots: header (icon, title, scope, Target at right end), tab order and underline, controls row order and chips, 375 classification button showing the value only and 44px tall, See all at the right end of each shelf heading, shelf page back link above the title and Sort + Target at the right end of the title row (1280), Target at the end of the scope line at 375, one line per shelf, the line reaching the shelf's right edge (measured at 375/768/1280).

## Findings
### D-1 Main / Phone: shelves drawn by the card grid show 3 equal 4:3 cards (2 on the phone), not a 200px line of mixed-proportion tiles
- design: one row per shelf, 200px high at 1280 (120px at 375), 5 tiles (3 at 375) of mixed portrait and landscape proportion filling the width (Main.dc.html:50-52, :65; Phone.dc.html:53-55, :67)
- implementation: at 1280 the 2025年9月 / 8月 / 7月 / 6月 and 撮影日なし shelves draw 3 equal 4:3 cards of 331x248, so each shelf is 48px taller and holds 3 photos instead of 5; at 768 2 cards of 364x273; at 375 2 cards of 168x126, no mixed proportions. The measurement note in decisions.md says this is the core card grid, used when under 90% of the shelf's photos have stored dimensions (checker `writes` re-check 7). Shelves with stored dimensions (2024年12月, 2024年11月) are measured at 200-227px justified lines at 1280 and 149-161px at 375; no screenshot at d4aa936 shows one of those shelves. The first screen at 1280 shows two shelves (design: three). (`pl-writes-recheck7-1280.png`, `pl-writes-recheck7-375.png`, `pl-writes-recheck7-768.png`; measurements decisions.md "re-check 7")
- visible: at a glance (on shelves whose photos lack stored dimensions; the fixture has four such shelves of eight)

### D-2 Phone-Shelf: the gap between the sort row and the first photo is 24px, the design draws 4px
- design: sort row padding 12px 16px 0, then photo grid padding-top 4px (Phone-Shelf.dc.html:36, :40)
- implementation: sort button bottom at 240.39, first photo top at 264.39 (from decisions.md layout item 3), i.e. 24px; in the screenshot the sort row floats with an empty band above the photos (`pl-layout-design-app-shelf-375.png`, 8c238c7; not re-shot at d4aa936)
- visible: side by side

### D-3 Shelf page and Library by tag, folder or collection: not shown at the current code
- design: Shelf.dc.html and Phone-Shelf.dc.html (shelf page); Tags.dc.html (tag shelves under the open menu)
- implementation: the only shelf-page screenshots (`pl-layout-design-app-shelf-1280.png`, `-375.png`) and the only tag-classification Library screenshot (`pl-layout-design-app-library-tag-menu-1280.png`) are at 8c238c7, before a029fe7 changed how the Library's lines are drawn. No R-5 screenshot at d4aa936 shows the shelf page, the Library by tag/collection/folder, or the Library at 768 below the first two shelves. In the 8c238c7 tag shot the first shelf (trip) is three equal cards about 264px wide and the 家族 line stops at x=1145 before the 1264 edge; whether that holds after a029fe7 cannot be checked.
- visible: not shown in R-5, cannot be checked

TOTAL: 3 findings
