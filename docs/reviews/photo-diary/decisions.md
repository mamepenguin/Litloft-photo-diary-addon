# Decisions

decision:
ran_in_app: yes
at: a44cb4762b8c52eb06f24dfb8ac547803f4e4753
by: agent
evidence: Own stack (compose project litloft-r5, port 3177, temporary data and drives) with core 6f6c0b27f; Chromium through Playwright at 1440, 1280, 1920, 1024, 844, 768, 430, 390, 375, 360 and 320 px; Safari on an iOS 26 iPhone 17 Pro Simulator with idb touches; real OSM tiles. Worked as specified: calendar, day and undated lists with paging, history, the page URL table, map fit and limits, point lists split by date including identical coordinates at zoom 19, heading link and Back to the map, reload restore, refresh after trash and after a move to another drive, policy-off and locked drives, not-available, tile failure and recovery, no WebGL, refetch and later-page failures, tile requests only to the OSM host with an origin-only Referer, dark mode. Differences from the spec or the Design section: (1) Back from a photo restores the list depth but scrolls to 0, in day, undated and point lists, on desktop, phone and iOS Safari; session storage held scrollY 0 for a list at 7200. A reload does restore it. (2) The selected point never turns accent, for a single point or a cluster; the selection source holds the feature but no feature renders. (3) Retry after a MapLibre load failure never recovers: no asset request is made and the error stays until the page is reloaded (Chromium). (4) The month picker overflows the viewport on phones: right edge 426 px with "September 2026" in en at 320 to 390 px wide, 380 px in ja, and the page gains horizontal scroll. (5) The scope line has no photo count on the map view until the calendar has been opened: on a direct view=map, after Back from a photo, after a reload. Also observed: the Close control scrolls away with the list; on a phone the sheet covers the point just opened; the disabled next-month button is a filled circle; the count wraps in the day heading at 768 px. Failures were produced with blocked requests or a removed cookie, not a real outage. PHOTO_DIARY_TILE_URL, the 50,000-photo measurement and a pinch gesture were not run. Screenshots: /private/tmp/claude-502/-Users-libre-Sources-video-share/3cc43a00-a217-40bc-aeb6-704b58d12aea/scratchpad/r5/shots/ (d* desktop, p* phone, f* failures, g* writes, w* and n-picker-* widths, i* iOS Simulator).
pending: The iOS app's own web view and a real device. The Simulator run used Safari; the app was not built.

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
