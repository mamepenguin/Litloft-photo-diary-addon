# Code review: pausing pin removal while the map is hidden, round 4

Commit: `26e5f2692c788bf084fc60309728114f99e6e969` (`feature/ui-polish`, addon repository), range `67322d1..26e5f26`, product change `bfbdef2`.

## Part 1, real Next page (local stack, core 6f6c0b27f, addon at the SHA)

Served chunk holds `pause(){y=!0,x=!1},resume(){y=!0,x=!0,r.resize(),_(),I()}`.

`r3/real.spec.ts`, unchanged, 1280 x 800, 2,400 stubbed points, one zoom-in, 78 pins, 1200 ms hidden, 8 returns per rate: rates 1, 2, 4, 6, removed 0, added 0, thumbnails 0, before and after 78, in 32 of 32 returns.

`49 pins at zoom 16` (R-5 second run's fixture, 197 JPEGs, 1280 x 900, real tiles, hidden 150, 600 or 1200 ms): 12 returns at rate 1, then 9 at rate 1 twice, 9 at rate 4, 9 at rate 6, 48 returns. Pins removed 0, pins added 0, thumbnails 0, tiles 0, one `/points` read per return, same set of 49, and in every frame after the map is shown 49 of 49 pins carry a loaded image. (The recorder's selector also matched one calendar day button, "January 31, 1 photo", on the calendar's first mount. It is not a pin.)

Refresh removing points at return (points under the centre pin dropped from `/points`; 1280 x 900; each compared with a fresh load at the same centre, zoom and points, pin by label and photo): zoom 14 answer at once 9 to 8 pins, zoom 16 answer at once 49 to 37, zoom 14 answer delayed 1 s 9 to 8, answer arriving while hidden again 9 to 8. Missing 0, extra 0 in all four, and the count holds after a further switch.

Pan right after return: drag 300 x 150 begun 0, 100 and 400 ms after pressing Map, at rate 1, at rate 6, and with tile answers delayed 1.5 s; zoom-in pressed right after return. All against a fresh load at the same place: 40 of 40 (49 of 49 for the zoom), missing 0, extra 0, none outside view plus margin.

Fresh load, tile answers delayed 8 s: first pins at 0.94 s from `?view=map`, 49 pins, 0 tiles answered; from `?view=calendar` and pressing Map at 1.5 s, first pins at 2.0 s, 49 pins, 0 tiles answered. A switch while the tiles were out kept 49, and 49 after they answered.

Flag sticking, on the real page. "Control" is a fresh load at the same centre and zoom, compared pin by label and photo after a later 300 x 150 drag (old pins that should go are gone, right ones are there):

- Hide before the map exists: page opened on Calendar, Map pressed, Calendar pressed 0, 50, 200, 500, 900 ms later, Map again. 40 of 40 in all five; missing 0, extra 0, none outside.
- Hidden again before idle: zoom-out with tile answers held, Calendar, Map, Calendar within 200 ms, tiles released while hidden, Map. 8 of 8.
- 12 fast switches with 0 to 110 ms between: 49 pins, then 40 of 40 after the drag.
- Tile failure: answers 500, and aborted, across return, zoom and a second return. Notice up, 40 of 40 after the drag while failing; notice gone after unblocking and a pan; 14 of 14.
- Destroy: `/points` empty at return removes the map; points back at the next return makes a new one, 49 pins, then 40 of 40.
- Window resized while hidden: 1280 to 1920 wide, 53 of 53; 1920 to 800 wide, 33 of 33.
- Browser Back from Calendar to the map: removed 0, added 0, thumbnails 0, the same canvas and pins kept (checked by a mark on the elements), one return at 49 pins and two at 11 pins after the restart described below.

Examined, no finding: Forward onto the bare URL followed by Back loses the map position (49 pins to 11, a new canvas). The page starts afresh on a URL with no query (`PhotoDiaryPage.tsx:103`, commit `ea13967`), so this is that rule and not this fix.

Fixture removed: files deleted, scan (197 missing), 197 rows purged, scan, drive total 1352 as before, the one earlier missing row untouched. Stack down; only the adminer container left.

## Part 2, code

Read `bfbdef2`: `pause` is called from `MapView.tsx:231` only with a handle, in the same effect that calls `resume`, and `active` flips in the commit that sets `hidden` on the wrapper (`PhotoDiaryPage.tsx:274-278`).

- Stuck flag: `resuming` is cleared only by `onIdle` with `returned` true, and `returned` is set by `resume`. `active` true always calls `resume` when a handle exists. A handle made after the hide is a new closure with the flag false; `createPhotoMap`'s result is discarded when the effect is cancelled by `active` changing (`MapView.tsx:203,221`).
- Idle while hidden no longer clears the flag, which is the fix's point, and `syncPins` returns at `onScreen()` there, so nothing stale is acted on.
- Old pins staying: only from `resume` to the next idle, the window code-r3 B1 already lists. The hold before `resume` happens while the view is hidden, so it adds no visible time. The fix does not lengthen B1.
- `resuming = true` in `resume` is redundant now, since every `resume` follows a `pause` (see P9 below). Harmless, and no behaviour hangs on it.

## Mutations of the fix

Scratch copy from `git archive 26e5f26`, at `scratchpad/r4/root`; neither working tree was written. Run against the map, page, tile failure and selection specs (100 tests, all passing unmutated). Restored and checked with `diff` against the SHA. Full addon e2e, unmutated, on that copy: 159 passed.

| Mutation | Result | Killed by |
|---|---|---|
| P1 `MapView` never calls `pause` | Killed | `pagePolish` "none is re-created" |
| P2 `pause` does not hold removals | Killed | same |
| P6 idle clears whatever the state (the code before the fix) | Killed | same |
| P11 removal loop ignores the flag | Killed | same |
| P14 `moveend` clears the flag | Killed | same |
| P7 idle never clears | Killed | `mapPolish` "a pin whose point left the data is removed" |
| P8 `resume` does not set `returned` | Killed | same |
| P12 idle syncs before clearing | Killed | same |
| P13 idle does not sync | Killed | same |
| P3 `pause` leaves `returned` as it was | Survived | None |
| P4 idle ignores `returned` | Survived | None |
| P5 idle ignores `onScreen` | Survived | None |
| P9 `resume` does not set `resuming` | Survived | None |
| P10 `resume` does not resize | Survived | None |
| P15 `sourcedata` clears the flag | Survived | None |

The fixture now catches the old code (P1, P2, P6), which closes the test gap in code-r3 A1.

Survivors, none reported as a finding because no misbehaviour in ordinary use follows. This is from reading; they were not run on the real page, since the stack was down by then:

- P3, P4: they differ only for an idle on screen before `resume` runs. That idle is at the real size, with the tiles in, and `resume` sets the flag again straight after.
- P5: `returned` is true only after `resume`, and any hide sets it false first, so hidden with `returned` true does not occur.
- P9: every `resume` follows a `pause`, so the flag is already set.
- P10: the map's own observer resizes it on return.
- P15: already listed in code-r3 as surviving, on a path the shipped code does not have.

## Findings

None.

Unchanged and already listed: code-r3 B1, and the second R-5's difference 2 (a refresh that changes the data rebuilds every pin, both sets in the document until idle: zoom 14, 18 at once as before; zoom 16, 93).

Not run: iOS, a real phone or a real GPU. Chromium with software GL only.

TOTAL: 0 findings
