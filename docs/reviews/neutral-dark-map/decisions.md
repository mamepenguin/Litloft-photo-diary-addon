# Neutral dark map: verification record

spec: docs/specs/neutral-dark-map.md

ran_in_app: yes
at: 9f8ba75
by: agent

The map module was drawn in Chromium in the dark theme on the core's new page ground (`#131312`) with public Shortbread vector tiles at z12, z13, z14 and z16; the screenshots are in [screenshots/](screenshots/). Land, water, river, woods, parks, roads, rail and labels stay distinct and no plum tint remains. vitest (520), the full Playwright suite (170) and eslint passed. A fresh reviewer compared the screenshots with the agreed design ([design/agreed-palette.dc.html](design/agreed-palette.dc.html), panel A) and the spec: [code-r1.md](code-r1.md), four findings, none above the fix threshold.

pending: none.

decision:
