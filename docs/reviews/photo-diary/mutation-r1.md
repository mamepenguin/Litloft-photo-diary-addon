# Mutation review r1: Photo Diary addon

Commit `61acfcaaebb869287e3a4e062e496922123e4f94`, core `origin/develop` at `9972a3099`.

## Baseline, unmutated

| Suite | Result |
|---|---|
| Backend pytest | 129 passed |
| Frontend vitest | 218 passed, 7 files |
| Browser Playwright | 39 passed |

All green.

## Method

251 mutations, one at a time, want declared in the mutation list before any run. Backend mutations ran in parallel in the `photo-diary-mut` image with the mutated `router.py` bind-mounted over both copies, with `--no-cov`, instead of a rebuild each time; the coverage gate is therefore not what killed any of them. Frontend mutations ran vitest, then Playwright when vitest passed, so a `survived` frontend row passed both. Each run restored the file with `git checkout`.

Frequency and impact describe the defect if the code had it. They come from reading the code and the tests; apart from the survival itself and the items marked measured, the described symptoms were not separately reproduced.

## Result

| want | killed | survived |
|---|---|---|
| kill | 146 | 93 |
| live | 1 | 11 |

S04 was wanted live and was killed: a unit test pins that an empty `onlyIds` gives no sections. My want was wrong and the test is fine.

Of the 93 findings, 24 meet the fix rule (frequency x impact at least 15, or frequency at least 1 with impact at least 8): D07, X34, M09, B59, X27, X30, X32, C33, X07, M32, X21, C17, X06, B36, C10, G11, G18, M06, M13, P08, P20, X17, C05, C24.

Patterns in the survivors:

- **The real map is barely tested beyond what a click returns.** Count labels, `setPoints`, `moveend`, `destroy`, the zoom cap, tile size and the fit limit reach only a mocked map or no test: X34, X27, X32, X30, X21, X06, X07, X24.
- **The stale-response guards in `usePagedPhotos.ts` have no test that reaches them** (P01 to P04). The discard test passes through the `key` remount. Overlaps between a refresh and a refresh or a later page are never run.
- **Depth over 100 is never exercised** (P08, P20).
- **One-sided tests:** Previous but not Next (C10), the newest month only on close (C17), lists of different sizes in `sameMembers` (M09), the success side of the days guard but not the failure side (C04).
- **Pairs of guards that hide each other** survive as a pair: G22 with M26, C19 with L03 and C23.

## Mutations

| id | file | mutation | want | result | killed-by |
|---|---|---|---|---|---|
| B01 | router.py | _photos: drop File.drive filter | kill | killed | 4: test_i5_no_route_leaks_other_drive_ids, test_i5_other_drive_is_not_counted, test_i5_percent_encoded_non_ascii_drive_reaches_its_own_drive |
| B02 | router.py | _photos: drop file_type filter | kill | killed | 2: test_i4_points_exclude_trashed_missing_and_non_image, test_i4_trashed_missing_and_non_image_are_excluded |
| B03 | router.py | _photos: drop active_file_filter | kill | killed | 2: test_i4_points_exclude_trashed_missing_and_non_image, test_i4_trashed_missing_and_non_image_are_excluded |
| B04 | router.py | _photos: only deleted_at, missing files leak | kill | killed | 2: test_i4_points_exclude_trashed_missing_and_non_image, test_i4_trashed_missing_and_non_image_are_excluded |
| B05 | router.py | _photos: outerjoin -> inner join (no-EXIF photos vanish) | kill | killed | 2: test_i2_photo_without_exif_row_is_undated, test_i3_counts_equal_totals |
| B06 | router.py | _drive_scope: no check_drive_access | kill | killed | 12: test_i5_locked_and_unknown_drive_give_the_same_404[/calendar/days?month=2026-10], test_i5_locked_and_unknown_drive_give_the_same_404[/calendar/months], test |
| B07 | router.py | _drive_scope: no policy check | kill | killed | 12: test_i5_policy_off_is_404_on_every_data_route[bool-off-/calendar/days?month=2026-10], test_i5_policy_off_is_404_on_every_data_route[bool-off-/calendar/month |
| B08 | router.py | _drive_scope: policy feature name wrong | kill | killed | 6: test_i5_policy_off_is_404_on_every_data_route[index-off-/calendar/days?month=2026-10], test_i5_policy_off_is_404_on_every_data_route[index-off-/calendar/mont |
| B09 | router.py | _drive_scope: policy addon name wrong | kill | killed | 12: test_i5_policy_off_is_404_on_every_data_route[bool-off-/calendar/days?month=2026-10], test_i5_policy_off_is_404_on_every_data_route[bool-off-/calendar/month |
| B10 | router.py | _drive_scope: no percent decoding | kill | killed | 1: test_i5_percent_encoded_non_ascii_drive_reaches_its_own_drive |
| B11 | router.py | _drive_scope: re-raise core's own 404 (detail differs locked vs unknown) | kill | killed | 6: test_i5_locked_and_unknown_drive_give_the_same_404[/calendar/days?month=2026-10], test_i5_locked_and_unknown_drive_give_the_same_404[/calendar/months], test_ |
| B12 | router.py | _drive_scope: missing header guard removed | kill | killed | 6: test_pd003_missing_drive_header_is_400[/calendar/days?month=2026-10], test_pd003_missing_drive_header_is_400[/calendar/months], test_pd003_missing_drive_head |
| B13 | router.py | map-config: no drive dependency | kill | killed | 5: test_i5_locked_and_unknown_drive_give_the_same_404[/map-config], test_i5_policy_off_is_404_on_every_data_route[bool-off-/map-config], test_i5_policy_off_is_4 |
| B14 | router.py | /points: drive dep replaced by raw header (no access check) | kill | killed | 5: test_i5_locked_and_unknown_drive_give_the_same_404[/points], test_i5_policy_off_is_404_on_every_data_route[bool-off-/points], test_i5_policy_off_is_404_on_ev |
| B15 | router.py | /calendar/days: raw header (no access check) | kill | killed | 5: test_i5_locked_and_unknown_drive_give_the_same_404[/calendar/days?month=2026-10], test_i5_policy_off_is_404_on_every_data_route[bool-off-/calendar/days?month |
| B16 | router.py | /calendar/months: raw header (no access check) | kill | killed | 5: test_i5_locked_and_unknown_drive_give_the_same_404[/calendar/months], test_i5_policy_off_is_404_on_every_data_route[bool-off-/calendar/months], test_i5_polic |
| B17 | router.py | /photos: raw header (no access check) | kill | killed | 11: test_i5_locked_and_unknown_drive_give_the_same_404[/photos?date=2026-10-03], test_i5_locked_and_unknown_drive_give_the_same_404[/photos?undated=true], test_ |
| B18 | router.py | _IS_DATED: no real-date equality | kill | killed | 7: test_i2_undated_value_is_only_in_undated_list[feb-29-non-leap], test_i2_undated_value_is_only_in_undated_list[feb-30], test_i2_undated_value_is_only_in_undat |
| B19 | router.py | _IS_DATED: year 0000 allowed | kill | survived |  |
| B20 | router.py | _IS_DATED: is_not(None) removed (NULL falls to else) | live | survived |  |
| B21 | router.py | _DAY: 10 chars -> 7 | kill | killed | 17: test_i1_late_evening_stays_on_its_own_day, test_i3_counts_equal_totals, test_i4_trashed_missing_and_non_image_are_excluded |
| B22 | router.py | _IS_LOCATED: 0,0 rule dropped | kill | killed | 1: test_i9_capture_place_rules[null-island] |
| B23 | router.py | _IS_LOCATED: or->and, one axis 0 dropped | kill | killed | 2: test_i9_capture_place_rules[lat-zero-valid], test_i9_capture_place_rules[lon-zero-valid] |
| B24 | router.py | _IS_LOCATED: lat range dropped | kill | killed | 2: test_i9_capture_place_rules[lat-over], test_i9_capture_place_rules[lat-under] |
| B25 | router.py | _IS_LOCATED: lon range dropped | kill | killed | 2: test_i9_capture_place_rules[lon-over], test_i9_capture_place_rules[lon-under] |
| B26 | router.py | _IS_LOCATED: lat boundary 90 excluded | kill | killed | 1: test_i9_capture_place_rules[max-corner] |
| B27 | router.py | _IS_LOCATED: lon boundary -180 excluded | kill | killed | 1: test_i9_capture_place_rules[min-corner] |
| B28 | router.py | _IS_LOCATED: is_not(None) both removed (between on NULL filters) | live | survived |  |
| B29 | router.py | _IS_LOCATED: half NULL passes (lon check loosened) | kill | killed | 1: test_i9_capture_place_rules[lon-null] |
| B30 | router.py | /photos date order: drop datetime | kill | killed | 1: test_pd001_day_ordered_by_time_then_filename_then_id |
| B31 | router.py | /photos date order: drop filename | kill | killed | 1: test_pd001_day_ordered_by_time_then_filename_then_id |
| B32 | router.py | /photos date order: id desc tie-break | kill | killed | 1: test_pd001_day_ordered_by_time_then_filename_then_id |
| B33 | router.py | /photos undated order: drop filename | kill | killed | 1: test_pd001_undated_ordered_by_filename_then_id |
| B34 | router.py | /photos undated order: id desc tie-break | kill | killed | 1: test_pd001_undated_ordered_by_filename_then_id |
| B35 | router.py | /points: dated last | kill | killed | 1: test_pd002_dated_first_oldest_first_then_undated_by_filename |
| B36 | router.py | /points: datetime key dropped | kill | survived |  |
| B37 | router.py | /points: filename key dropped | kill | killed | 1: test_pd002_dated_first_oldest_first_then_undated_by_filename |
| B38 | router.py | /points: id tie-break desc | kill | survived |  |
| B39 | router.py | /points: taken_at is raw datetime_original for undated | kill | killed | 1: test_pd002_dated_first_oldest_first_then_undated_by_filename |
| B40 | router.py | /points: datetime key uses raw value, invalid date sorted among dated is kept out by _IS_DATED first (order by raw, no case) | kill | killed | 1: test_pd002_dated_first_oldest_first_then_undated_by_filename |
| B41 | router.py | /photos: both date and undated accepted | kill | killed | 1: test_pd003_bad_input_is_422[both] |
| B42 | router.py | /photos: neither accepted (falls to undated) | kill | killed | 2: test_pd003_bad_input_is_422[neither], test_pd003_bad_input_is_422[undated-false-alone] |
| B43 | router.py | limit le 100 -> 200 | kill | killed | 2: test_pd003_bad_input_is_422[limit-101], test_pd003_bad_input_is_422[undated-limit-101] |
| B44 | router.py | limit ge 1 -> 0 | kill | killed | 2: test_pd003_bad_input_is_422[limit-0], test_pd003_bad_input_is_422[undated-limit-0] |
| B45 | router.py | limit default 40 -> 50 | kill | killed | 1: test_pd001_photos_default_limit_is_40 |
| B46 | router.py | offset ge 0 removed | kill | survived |  |
| B47 | router.py | /photos: offset ignored | kill | killed | 2: test_pd001_photos_paging, test_pd001_undated_paging |
| B48 | router.py | /photos: total is page length | kill | killed | 4: test_pd001_limit_100_is_allowed, test_pd001_photos_default_limit_is_40, test_pd001_photos_paging |
| B49 | router.py | /photos date: real-date check removed | kill | killed | 6: test_pd003_bad_input_is_422[date-feb-30], test_pd003_bad_input_is_422[date-garbage], test_pd003_bad_input_is_422[date-is-a-month] |
| B50 | router.py | _real_date: regex removed (fromisoformat accepts other forms) | kill | survived |  |
| B51 | router.py | month pattern loosened | kill | killed | 2: test_pd003_bad_input_is_422[month-0], test_pd003_bad_input_is_422[month-13] |
| B52 | router.py | /calendar/months order asc | kill | killed | 1: test_pd001_months_newest_first_with_counts |
| B53 | router.py | /calendar/days order desc | kill | killed | 1: test_pd001_days_oldest_first_only_days_with_photos |
| B54 | router.py | /calendar/days: month filter removed | kill | killed | 3: test_i3_counts_equal_totals, test_pd001_days_oldest_first_only_days_with_photos, test_pd001_real_month_without_photos_is_empty_200 |
| B55 | router.py | /calendar/months: undated_count counts all | kill | killed | 4: test_i3_counts_equal_totals, test_i4_trashed_missing_and_non_image_are_excluded, test_i5_other_drive_is_not_counted |
| B56 | router.py | /calendar/months: undated rows grouped too | kill | killed | 12: test_i2_photo_without_exif_row_is_undated, test_i2_undated_photo_with_creation_time_is_on_no_day, test_i2_undated_value_is_only_in_undated_list[blank-templa |
| B57 | router.py | /assets: path built from the name, no allow-list | kill | survived |  |
| B58 | router.py | /assets: cache header shortened | kill | killed | 1: test_pd004_every_bundled_file_is_served_immutable_without_a_drive |
| B59 | router.py | /assets: js served as text/plain (module import refused) | kill | survived |  |
| B60 | router.py | /assets: requires a drive | kill | killed | 10: test_pd004_assets_unaffected_by_policy_off, test_pd004_every_bundled_file_is_served_immutable_without_a_drive, test_pd004_only_listed_names_are_served[%2e%2 |
| B61 | router.py | map-config: empty URL used as is | kill | killed | 2: test_pd004_defaults, test_pd004_empty_url_means_defaults_for_both |
| B62 | router.py | map-config: unset attribution gets the OSM default | kill | killed | 1: test_pd004_custom_url_without_attribution_shows_none |
| B63 | router.py | map-config: default URL with empty attribution | kill | killed | 2: test_pd004_defaults, test_pd004_empty_url_means_defaults_for_both |
| S01 | lib/sections.ts | sections oldest first | kill | killed | vitest: 5: ions newest date first, each heading with date and count, undated last / t loads 40 files at a time, and a heading appears with its first photo |
| S02 | lib/sections.ts | undated section first | kill | killed | vitest: 4: ions newest date first, each heading with date and count, undated last / t loads 40 files at a time, and a heading appears with its first photo |
| S03 | lib/sections.ts | onlyIds ignored | kill | killed | vitest: 20: w > clicking a point adds no history entry and does not change the URL / point whose list is open does nothing; another point replaces the list |
| S04 | lib/sections.ts | empty onlyIds means all (MapView never renders it when empty) | live | killed | vitest: 1: ons > onlyIds > SPEC-PD-002 I7: an empty list of ids gives no sections |
| S05 | lib/sections.ts | section key is the month | kill | killed | vitest: 29: aving the map page saves the scroll position of the point's list panel / ions newest date first, each heading with date and count, undated last |
| S06 | lib/sections.ts | section order reversed within date | kill | killed | vitest: 15: ions newest date first, each heading with date and count, undated last / t loads 40 files at a time, and a heading appears with its first photo |
| S07 | lib/sections.ts | undated section emitted when empty | kill | killed | vitest: 8: groupSections > SPEC-PD-002: no points, no sections / groupSections > SPEC-PD-002: one photo is one section of one |
| D01 | lib/dates.ts | utcDate built in local time | kill | killed | vitest: 68:  newest month with dated photos, and the day buttons carry their count / EC-PD-001: calendar > a day without photos is plain text, not a button |
| D02 | lib/dates.ts | format uses browser zone | kill | killed | vitest: 5: 001 I1: ja heading carries year, month, day and weekday, in every zone / 001 I1: en heading carries weekday, month, day and year, in every zone |
| D03 | lib/dates.ts | utcDate via Date.UTC (years 0-99 shift) | kill | survived |  |
| D04 | lib/dates.ts | monthGrid: lead uses local getDay | kill | killed | vitest: 8: monthGrid > SPEC-PD-001: 2026-10 has 4 leading blanks and 31 days / monthGrid > SPEC-PD-001: 2024-02 has 4 leading blanks and 29 days |
| D05 | lib/dates.ts | monthGrid: days of the previous month | kill | killed | vitest: 8: monthGrid > SPEC-PD-001: 2026-10 has 4 leading blanks and 31 days / monthGrid > SPEC-PD-001: 2026-12 has 2 leading blanks and 31 days |
| D06 | lib/dates.ts | monthGrid: no trailing pad | kill | survived |  |
| D07 | lib/dates.ts | weekday labels start Monday | kill | survived |  |
| U01 | lib/pageUrl.ts | month beats date | kill | killed | vitest: 2: SPEC-PD-001: page URL > date wins over a different month /  SPEC-PD-001: date wins when the month differs, and its month is shown |
| U02 | lib/pageUrl.ts | date no longer beats undated | kill | killed | vitest: 1: parsePageUrl > SPEC-PD-001: date wins over undated |
| U03 | lib/pageUrl.ts | unknown view -> map | kill | killed | vitest: 6: or unknown ?view=bogus is treated as absent: the newest month, no list / parsePageUrl > SPEC-PD-001: unknown view "" is the calendar |
| U04 | lib/pageUrl.ts | isRealDate accepts any day <= 31 | kill | killed | vitest: 6: known ?date=2026-02-30 is treated as absent: the newest month, no list / C-PD-001: malformed or non-real date "2026-02-30" is treated as absent |
| U05 | lib/pageUrl.ts | isRealDate ignores the year (leap) | kill | killed | vitest: 2: parsePageUrl > SPEC-PD-001: 2024-02-29 is a real date / parsePageUrl > SPEC-PD-001: 2000-02-29 is a real date |
| U06 | lib/pageUrl.ts | isRealDate accepts day 0 | kill | killed | vitest: 1: C-PD-001: malformed or non-real date "2026-10-00" is treated as absent |
| U07 | lib/pageUrl.ts | isRealMonth accepts month 13 | kill | killed | vitest: 3: unknown ?month=2026-13 is treated as absent: the newest month, no list / PEC-PD-001: malformed or non-real month "2026-13" is treated as absent |
| U08 | lib/pageUrl.ts | malformed date not treated as absent | kill | killed | vitest: 15: known ?date=2026-02-30 is treated as absent: the newest month, no list / C-PD-001: malformed or non-real date "2026-02-30" is treated as absent |
| U09 | lib/pageUrl.ts | buildPageQuery drops view=map | kill | killed | vitest: 8: not available > a 404 met in the map view also takes the calendar away / rs > the map is reachable while the calendar's months fetch has failed |
| U10 | lib/pageUrl.ts | buildPageQuery emits date and undated | kill | survived |  |
| U11 | lib/pageUrl.ts | buildPageQuery '?' for empty | kill | survived |  |
| V01 | lib/savedState.ts | key without the drive | kill | killed | vitest: 6: > a URL with no query clears the saved state of the drive and no other /  > SPEC-PD-001 I6: state saved on one drive is never loaded on another |
| V02 | lib/savedState.ts | key without encoding (still unique per drive) | live | survived |  |
| V03 | lib/savedState.ts | sanitize: center unchecked | kill | survived |  |
| V04 | lib/savedState.ts | sanitize: non-string point ids pass | kill | survived |  |
| V05 | lib/savedState.ts | clearState does nothing | kill | killed | vitest: 2: > a URL with no query clears the saved state of the drive and no other / tate > SPEC-PD-001: clearState removes that drive's state and no other |
| V06 | lib/savedState.ts | saveState throws when storage refuses | kill | killed | vitest: 1: e > SPEC-PD-001: a failing save does not throw, and Back finds nothing |
| V07 | lib/savedState.ts | listView unknown value passes | kill | survived |  |
| A01 | api.ts | drive header not percent-encoded | kill | killed | vitest: 5: header > SPEC-PD-003 I5: fetchMonths sends X-Lit-Drive percent-encoded / e header > SPEC-PD-003 I5: fetchDays sends X-Lit-Drive percent-encoded |
| P01 | usePagedPhotos.ts | loadDepth: stale success writes | kill | survived |  |
| P02 | usePagedPhotos.ts | loadDepth: stale failure writes | kill | survived |  |
| P03 | usePagedPhotos.ts | loadMore: stale success appends | kill | survived |  |
| P04 | usePagedPhotos.ts | loadMore: stale failure writes | kill | survived |  |
| P05 | usePagedPhotos.ts | loadMore: busy guard removed | kill | survived |  |
| P06 | usePagedPhotos.ts | finally: older load clears busy (loadDepth) | kill | survived |  |
| P07 | usePagedPhotos.ts | finally: older load clears busy (loadMore) | kill | survived |  |
| P08 | usePagedPhotos.ts | hydrate: batch 200 over the core's cap | kill | survived |  |
| P09 | usePagedPhotos.ts | hydrate: batch answer order kept | kill | survived |  |
| P10 | usePagedPhotos.ts | refresh: depth reset to one page | kill | killed | vitest: 1: SPEC-PD-001: onRefresh > keeps the loaded depth |
| P11 | usePagedPhotos.ts | restore depth ignored | kill | killed | vitest: 1:  list is loaded at least as far as before and scrolled to where it was |
| P12 | usePagedPhotos.ts | loadDepth: loaded counts survivors, not ids asked | kill | survived |  |
| P13 | usePagedPhotos.ts | loadMore: offset counts survivors, not ids asked | kill | survived |  |
| P14 | usePagedPhotos.ts | moreMayFollow uses files, not ids | kill | survived |  |
| P15 | usePagedPhotos.ts | refresh failure blanks the list | kill | killed | vitest: 1: ils over a loaded list and grid keeps them, with the error and a retry |
| P16 | usePagedPhotos.ts | refresh 404 not treated as unavailable | kill | killed | vitest: 1: t available > a 404 from photos replaces the whole page, with no retry |
| P17 | usePagedPhotos.ts | unmount does not invalidate in-flight loads | kill | survived |  |
| P18 | usePagedPhotos.ts | restore.current not cleared (hook is remounted by key) | live | survived |  |
| P19 | usePagedPhotos.ts | fetchDepth: extra ids>=total break removed | live | survived |  |
| P20 | usePagedPhotos.ts | fetchDepth: page size can exceed 100 | kill | survived |  |
| P21 | usePagedPhotos.ts | retry resets to a page | kill | survived |  |
| P22 | usePagedPhotos.ts | new list keeps old rows meanwhile | kill | survived |  |
| G01 | PhotoDiaryPage.tsx | map count: stale answer writes | kill | killed | vitest: 1: hat answers an earlier entry to the map does not overwrite a newer one |
| G02 | PhotoDiaryPage.tsx | map count: stale 404 writes | kill | survived |  |
| G03 | PhotoDiaryPage.tsx | fresh start does not clear | kill | killed | vitest: 1: > a URL with no query clears the saved state of the drive and no other |
| G04 | PhotoDiaryPage.tsx | fresh start reads saved | kill | survived |  |
| G05 | PhotoDiaryPage.tsx | query URL ignores saved | kill | killed | vitest: 2:  list is loaded at least as far as before and scrolled to where it was / where it was and reopens the list, reduced to what /points still holds |
| G06 | PhotoDiaryPage.tsx | calendar restore without a list in the URL | kill | survived |  |
| G07 | PhotoDiaryPage.tsx | map list restored onto calendar | kill | killed | vitest: 1: > a list position saved from the map is not applied to a calendar list |
| G08 | PhotoDiaryPage.tsx | calendar list restored onto map | kill | survived |  |
| G09 | PhotoDiaryPage.tsx | view switch drops month and date | kill | killed | vitest: 2: n the URL for the calendar, and the calendar opens it after the switch / an entry, and a day list left open is not refetched but the counts are |
| G10 | PhotoDiaryPage.tsx | view switch replaces | kill | killed | vitest: 1: an entry, and a day list left open is not refetched but the counts are |
| G11 | PhotoDiaryPage.tsx | same tab adds an entry | kill | survived |  |
| G12 | PhotoDiaryPage.tsx | Session not keyed by drive | kill | killed | vitest: 1: -PD-002 failure cases: map > I6: switching drive closes a point's list |
| G13 | PhotoDiaryPage.tsx | flush: and instead of or | kill | killed | vitest: 2: s > leaving the page leaves the list's loaded depth in session storage / aving the map page saves the scroll position of the point's list panel |
| G14 | PhotoDiaryPage.tsx | flush: wrong view's list | kill | killed | vitest: 3: s > leaving the page leaves the list's loaded depth in session storage / ge saves the scroll position the list had while it was still on screen |
| G15 | PhotoDiaryPage.tsx | flush in a passive cleanup | kill | killed | vitest: 2: ge saves the scroll position the list had while it was still on screen / aving the map page saves the scroll position of the point's list panel |
| G16 | PhotoDiaryPage.tsx | no pagehide flush (reload loses state) | kill | survived |  |
| G17 | PhotoDiaryPage.tsx | closed point list stays saved | kill | survived |  |
| G18 | PhotoDiaryPage.tsx | go: push without scroll:false | kill | survived |  |
| G19 | PhotoDiaryPage.tsx | calendar unmounted when hidden | kill | killed | vitest: 1: an entry, and a day list left open is not refetched but the counts are |
| G20 | PhotoDiaryPage.tsx | map unmounted when hidden | kill | killed | vitest: 4: at day in the calendar, and Back returns to the map with its list open / left open is not refetched when the views are switched, but /points is |
| G21 | PhotoDiaryPage.tsx | calendar restore applied again | kill | survived |  |
| G22 | PhotoDiaryPage.tsx | map list restore applied again | kill | survived |  |
| G23 | PhotoDiaryPage.tsx | empty state also written | live | survived |  |
| C01 | CalendarView.tsx | months: stale success writes | kill | survived |  |
| C02 | CalendarView.tsx | months: stale failure writes | kill | survived |  |
| C03 | CalendarView.tsx | days: stale success writes | kill | killed | vitest: 1: views > a months response for a month the viewer has left is discarded |
| C04 | CalendarView.tsx | days: stale failure writes | kill | survived |  |
| C05 | CalendarView.tsx | days of another month drawn | kill | survived |  |
| C06 | CalendarView.tsx | URL month ignored | kill | killed | vitest: 9: ext skip to the nearest month with photos and are disabled at the ends / ious and next replace the history entry, and the month goes to the URL |
| C07 | CalendarView.tsx | next jumps to the newest month | kill | killed | vitest: 1: ext skip to the nearest month with photos and are disabled at the ends |
| C08 | CalendarView.tsx | previous goes nearest-oldest wrong end | kill | killed | vitest: 4: ext skip to the nearest month with photos and are disabled at the ends / ious and next replace the history entry, and the month goes to the URL |
| C09 | CalendarView.tsx | previous pushes | kill | killed | vitest: 1: ious and next replace the history entry, and the month goes to the URL |
| C10 | CalendarView.tsx | next pushes | kill | survived |  |
| C11 | CalendarView.tsx | picker pushes | kill | killed | vitest: 1:  lists every month with its count, and choosing one replaces the entry |
| C12 | CalendarView.tsx | day replaces | kill | killed | vitest: 2:  photos 40 at a time, shows them in FileGrid, and adds a history entry / r > pressing another day replaces the list and adds an entry each time |
| C13 | CalendarView.tsx | open day pressed again | kill | killed | vitest: 1: -PD-001: calendar > pressing the day that is already open does nothing |
| C14 | CalendarView.tsx | undated entry replaces | kill | killed | vitest: 1: e undated count, opens the undated list by filename, and adds an entry |
| C15 | CalendarView.tsx | open undated pressed again | kill | survived |  |
| C16 | CalendarView.tsx | close replaces | kill | killed | vitest: 1: PD-001: calendar > the close control closes the list and adds an entry |
| C17 | CalendarView.tsx | close loses the month | kill | survived |  |
| C18 | CalendarView.tsx | emptied undated pushes | kill | survived |  |
| C19 | CalendarView.tsx | emptied undated list does not close | kill | survived |  |
| C20 | CalendarView.tsx | emptied day list closes | kill | killed | vitest: 2: URL > a real date with no photos shows its month and the empty message /  that becomes empty shows its empty message and stays open on that day |
| C21 | CalendarView.tsx | date opens on a no-dated drive | kill | survived |  |
| C22 | CalendarView.tsx | undated opens with count 0 | kill | killed | vitest: 1: 01: page URL > undated=true while the undated count is 0 opens no list |
| C23 | CalendarView.tsx | undated=true at count 0 stays in the URL | kill | killed | vitest: 1: st that becomes empty closes, replacing the entry and dropping undated |
| C24 | CalendarView.tsx | same list key for all days | kill | survived |  |
| C25 | CalendarView.tsx | hidden calendar refetches months | kill | survived |  |
| C26 | CalendarView.tsx | hidden calendar refetches days | kill | survived |  |
| C27 | CalendarView.tsx | months 404 not unavailable | kill | killed | vitest: 1: le > a 404 from calendar/months replaces the whole page, with no retry |
| C28 | CalendarView.tsx | days 404 not unavailable | kill | killed | vitest: 1: able > a 404 from calendar/days replaces the whole page, with no retry |
| C29 | CalendarView.tsx | first days failure on a new month goes only to the banner | kill | survived |  |
| C30 | CalendarView.tsx | refetch months failure blanks the grid | kill | survived |  |
| C31 | CalendarView.tsx | closed list's failure banner stays | kill | survived |  |
| C32 | CalendarView.tsx | refresh token not passed to the list | kill | killed | vitest: 3: > refetches the counts and the open list, and a moved photo disappears / SPEC-PD-001: onRefresh > keeps the loaded depth |
| C33 | CalendarView.tsx | count not reported to the page | kill | survived |  |
| M01 | MapView.tsx | points: stale success writes | kill | survived |  |
| M02 | MapView.tsx | points: stale failure writes | kill | survived |  |
| M03 | MapView.tsx | refresh does not reduce the list | kill | killed | vitest: 1: SPEC-PD-002: map onRefresh > a list that becomes empty closes |
| M04 | MapView.tsx | emptied list stays open | kill | killed | vitest: 1: SPEC-PD-002: map onRefresh > a list that becomes empty closes |
| M05 | MapView.tsx | restore: first reduce skipped (second reduce covers it) | live | survived |  |
| M06 | MapView.tsx | restore re-applied on each entry | kill | survived |  |
| M07 | MapView.tsx | restored list not opened | kill | killed | vitest: 1: where it was and reopens the list, reduced to what /points still holds |
| M08 | MapView.tsx | click on the open point reopens | kill | killed | vitest: 1: point whose list is open does nothing; another point replaces the list |
| M09 | MapView.tsx | sameMembers compares only length | kill | survived |  |
| M10 | MapView.tsx | new point keeps the list seq | kill | survived |  |
| M11 | MapView.tsx | error list stays on a good click | kill | killed | vitest: 1: ns the list with the load error and a retry that reads the point again |
| M12 | MapView.tsx | point error leaves the open list | kill | killed | vitest: 1:  the error list replaces an open list, and its close control closes it |
| M13 | MapView.tsx | refresh does not refetch the list | kill | survived |  |
| M14 | MapView.tsx | entry refetches a list left open | kill | killed | vitest: 1: left open is not refetched when the views are switched, but /points is |
| M15 | MapView.tsx | refresh reason not reset | kill | survived |  |
| M16 | MapView.tsx | emptied map not destroyed | kill | killed | vitest: 1: y /points with a map drawn removes the map and shows the empty message |
| M17 | MapView.tsx | tile notice survives an emptied map | kill | survived |  |
| M18 | MapView.tsx | refetched points not given to the map | kill | killed | vitest: 1: s them to the map, and drops a photo that left; it does not re-cluster |
| M19 | MapView.tsx | points that arrived while creating are lost | kill | survived |  |
| M20 | MapView.tsx | map created after leaving not destroyed | kill | survived |  |
| M21 | MapView.tsx | no WebGL retried on re-entry | kill | killed | vitest: 1: sage with no retry, the calendar works, and the map is not tried again |
| M22 | MapView.tsx | 404 not final for the map | kill | survived |  |
| M23 | MapView.tsx | hidden map refetches | kill | survived |  |
| M24 | MapView.tsx | re-entry blanks the map | kill | killed | vitest: 3: left open is not refetched when the views are switched, but /points is / etch that fails keeps the map and the list, with the error and a retry |
| M25 | MapView.tsx | refetch failure blanks the map | kill | killed | vitest: 1: etch that fails keeps the map and the list, with the error and a retry |
| M26 | MapView.tsx | restore depth on any later point | kill | survived |  |
| M27 | MapView.tsx | sections not filtered to the open point | kill | killed | vitest: 15: w > clicking a point adds no history entry and does not change the URL / point whose list is open does nothing; another point replaces the list |
| M28 | MapView.tsx | close keeps the error list | kill | killed | vitest: 1:  the error list replaces an open list, and its close control closes it |
| M29 | MapView.tsx | view not saved | kill | killed | vitest: 1:  point's list is saved with its ids, and the view with centre and zoom |
| M30 | MapView.tsx | map's view forgotten when recreated | kill | survived |  |
| M31 | MapView.tsx | restored map ignores saved centre | kill | killed | vitest: 1: where it was and reopens the list, reduced to what /points still holds |
| M32 | MapView.tsx | unmount leaves the map | kill | survived |  |
| M33 | MapView.tsx | map-config failure ignored | kill | killed | vitest: 2: ailable > a 404 from map-config replaces the whole page, with no retry / g fetch fails the map view, with a retry, and the calendar still works |
| M34 | MapView.tsx | map-config refetched each entry | live | survived |  |
| L01 | PhotoList.tsx | restore applied before the list is ready | kill | killed | e2e: 3:  from a photo returns to where the list was scrolled › I6: a day list on desktop / ck from a photo returns to where the list was scrolled › I6: a day li |
| L02 | PhotoList.tsx | no second scroll after layout | kill | survived |  |
| L03 | PhotoList.tsx | empty never reported | kill | survived |  |
| L04 | PhotoList.tsx | hidden list keeps loading | kill | survived |  |
| X01 | map/createPhotoMap.ts | cluster leaves limited to 100 | kill | killed | e2e: 2:  › SPEC-PD-002 I7: 150 photos at identical coordinates at zoom 19 are all listed / 130 photos that merge at a wide zoom are all listed, and the click do |
| X02 | map/createPhotoMap.ts | cluster leaves limited to the default 10 | kill | killed | e2e: 4: 130 photos that merge at a wide zoom are all listed, and the click does not zoom /  › SPEC-PD-002 I7: 150 photos at identical coordinates at zoom 19 are |
| X03 | map/createPhotoMap.ts | clustering stops at 18 | kill | killed | e2e: 2: her › SPEC-PD-002 I7: photos with identical coordinates at zoom 19 are one point /  › SPEC-PD-002 I7: 150 photos at identical coordinates at zoom 19 are |
| X04 | map/createPhotoMap.ts | source maxzoom at 19 (top level unclustered) | kill | survived |  |
| X05 | map/createPhotoMap.ts | source maxzoom option dropped | kill | survived |  |
| X06 | map/createPhotoMap.ts | map maxZoom 22 | kill | survived |  |
| X07 | map/createPhotoMap.ts | tile size 512 | kill | survived |  |
| X08 | map/createPhotoMap.ts | raster maxzoom dropped (default 22, map tops at 19) | live | survived |  |
| X09 | map/createPhotoMap.ts | tile URL gains a query | kill | killed | e2e: 1: SPEC-PD-004 I10: a tile URL is the configured URL with only z, x and y filled in |
| X10 | map/createPhotoMap.ts | glyphs key alone, no symbol layer asks for it | live | survived |  |
| X11 | map/createPhotoMap.ts | attribution compact | kill | killed | e2e: 1: PD-004: the attribution stays visible at a narrow width after the map is touched |
| X12 | map/createPhotoMap.ts | attribution not supplied | kill | killed | e2e: 5: PD-004: the attribution stays visible at a narrow width after the map is touched / PEC-PD-004: a configured attribution is visible without any click at  |
| X13 | map/createPhotoMap.ts | attributionControl default kept too | kill | killed | e2e: 4: PEC-PD-004: a configured attribution is visible without any click at 320 px wide / PEC-PD-004: a configured attribution is visible without any click at  |
| X14 | map/createPhotoMap.ts | click selects nothing | kill | killed | e2e: 2: › SPEC-PD-002 design: a cluster turns accent when clicked and the map stays idle / C-PD-002 design: a single photo turns accent when clicked and the map |
| X15 | map/createPhotoMap.ts | selection passes the prototype-less properties | kill | killed | e2e: 3: SPEC-PD-001: a notice follows failing tiles, and points still answer meanwhile / › SPEC-PD-002 design: a cluster turns accent when clicked and the map s |
| X16 | map/createPhotoMap.ts | idle reselects always (loop) | kill | killed | e2e: 2: › SPEC-PD-002 design: a cluster turns accent when clicked and the map stays idle / C-PD-002 design: a single photo turns accent when clicked and the map |
| X17 | map/createPhotoMap.ts | selection does not follow re-clustering | kill | survived |  |
| X18 | map/createPhotoMap.ts | retry keeps the same URL | kill | killed | e2e: 1: 2: a map that failed to load the library loads it on the next try, and only once |
| X19 | map/createPhotoMap.ts | failed import stays cached | kill | killed | e2e: 1: 2: a map that failed to load the library loads it on the next try, and only once |
| X20 | map/createPhotoMap.ts | worker URL not set | kill | killed | e2e: 10: 130 photos that merge at a wide zoom are all listed, and the click does not zoom / hoto it stands for and no other › SPEC-PD-002 I7: a lone photo is a  |
| X21 | map/createPhotoMap.ts | destroy keeps the map | kill | survived |  |
| X22 | map/createPhotoMap.ts | destroy keeps the labels | kill | survived |  |
| X23 | map/createPhotoMap.ts | click after destroy still reports | kill | survived |  |
| X24 | map/createPhotoMap.ts | fit max zoom 19 | kill | survived |  |
| X25 | map/createPhotoMap.ts | any source's error counts as a tile failure | kill | survived |  |
| X26 | map/createPhotoMap.ts | tile notice never clears | kill | killed | e2e: 1: SPEC-PD-001: a notice follows failing tiles, and points still answer meanwhile |
| X27 | map/createPhotoMap.ts | stale labels stay | kill | survived |  |
| X28 | map/createPhotoMap.ts | no hit slop | kill | survived |  |
| X29 | map/createPhotoMap.ts | coordinates swapped | kill | killed | e2e: 10: her › SPEC-PD-002 I7: photos with identical coordinates at zoom 19 are one point / hoto it stands for and no other › SPEC-PD-002 I7: a lone photo is a  |
| X30 | map/createPhotoMap.ts | moveend not reported | kill | survived |  |
| X31 | map/createPhotoMap.ts | WebGL refusal not recognised | kill | killed | e2e: 1: -PD-001: a browser without WebGL makes the map reject with WebGLUnavailableError |
| X32 | map/createPhotoMap.ts | setPoints does nothing | kill | survived |  |
| X33 | map/createPhotoMap.ts | cluster radius 80 | kill | survived |  |
| X34 | map/createPhotoMap.ts | count label shows the cluster id | kill | survived |  |
| X35 | map/createPhotoMap.ts | bounds mix lat into lon | kill | killed | e2e: 3:  stays reachable while the list scrolls › SPEC-PD-002: a point's list on desktop / ol stays reachable while the list scrolls › SPEC-PD-002: a point's li |
| X36 | map/createPhotoMap.ts | click zooms | kill | killed | e2e: 2: 130 photos that merge at a wide zoom are all listed, and the click does not zoom /  › SPEC-PD-002 I7: 150 photos at identical coordinates at zoom 19 are |
| X37 | map/createPhotoMap.ts | single with cluster_id 0 check (ids are never 0) | live | survived |  |
| X38 | map/createPhotoMap.ts | error path: no retry callback selection | kill | survived |  |
| X39 | map/createPhotoMap.ts | glyph server and a text layer added | kill | killed | e2e: 2: SPEC-PD-004 I10: the map contacts no host but the page's own and the tile server /  › SPEC-PD-002 I7: 150 photos at identical coordinates at zoom 19 are |

## Findings

Sorted with fix-rule items first, then by frequency x impact. `gap`: behaviour no test holds. `masked`: another line of code gives the same result. `none`: no difference in ordinary use.

- **D07** `frontend/lib/dates.ts`, weekday labels start Monday. Frequency 10, impact 8, gap. **[fix rule]** Weekday headers start Monday while the day cells start Sunday, so every date in every month sits under the wrong weekday. `weekdayLabels` has no test at all; `dates.test.ts` does not import it.
- **X34** `frontend/map/createPhotoMap.ts`, count label shows the cluster id. Frequency 10, impact 8, gap. **[fix rule]** Every cluster's marker shows the wrong number. No browser test reads a count label.
- **M09** `frontend/MapView.tsx`, sameMembers compares only length. Frequency 8, impact 8, gap. **[fix rule]** `sameMembers` compares only length. Clicking a second lone photo while a lone photo's list is open (1 id vs 1 id), or any point of the same size, does nothing: the list keeps showing the first point. The test's second click goes from 2 ids to 1. Breaks I7.
- **B59** `backend/router.py`, /assets: js served as text/plain (module import refused). Frequency 10, impact 5, gap. **[fix rule]** `.js` served as `text/plain`: the browser refuses the module import and the map never loads, showing the load error. pytest checks bytes and cache header but not the type, and the e2e suite answers assets itself with its own type.
- **X27** `frontend/map/createPhotoMap.ts`, stale labels stay. Frequency 8, impact 5, gap. **[fix rule]** On zoom or pan, count labels of clusters that no longer exist stay on the map, at positions with no point and with stale numbers. No browser test looks at labels.
- **X30** `frontend/map/createPhotoMap.ts`, moveend not reported. Frequency 8, impact 5, gap. **[fix rule]** View changes are never reported from the real map, so centre and zoom are never saved. Back from a photo after panning refits to all points instead of the place the viewer was. Breaks I6; only `MapView` with a mocked map is tested, and the one e2e use of `h.views` passes on an empty list.
- **X32** `frontend/map/createPhotoMap.ts`, setPoints does nothing. Frequency 5, impact 8, gap. **[fix rule]** `setPoints` reaches the real map only through this line, and every test of it uses a mocked map. On entering the map again or after `onRefresh`, new photos do not appear and a moved photo's point stays, until a full reload.
- **C33** `frontend/CalendarView.tsx`, count not reported to the page. Frequency 10, impact 3, gap. **[fix rule]** The header's photo count is missing on the calendar view, the view that opens first. The scope tests read the count only on the map's path.
- **X07** `frontend/map/createPhotoMap.ts`, tile size 512. Frequency 10, impact 3, gap. **[fix rule]** With tile size 512 the map asks one zoom level lower and draws 256 px tiles stretched, so the background is blurred at every zoom. The URL test checks the URL's shape only, so any z passes.
- **M32** `frontend/MapView.tsx`, unmount leaves the map. Frequency 5, impact 5, gap. **[fix rule]** Leaving the page does not remove the map. Each visit leaks a WebGL context in the SPA; after about 16 the browser drops the oldest context and the map can go blank until reload. Not observed here; 16 is the usual browser limit.
- **X21** `frontend/map/createPhotoMap.ts`, destroy keeps the map. Frequency 5, impact 5, gap. **[fix rule]** Same as M32 from the other side: `destroy()` does not call `map.remove()`, on leaving or on an emptied map. No e2e test calls `destroy`.
- **C17** `frontend/CalendarView.tsx`, close loses the month. Frequency 8, impact 3, gap. **[fix rule]** Closing a day list in a month other than the newest jumps the calendar to the newest month and leaves a query-less URL, which is the fresh-start URL on reload. The test closes in the newest month and checks only that `date=` is gone.
- **X06** `frontend/map/createPhotoMap.ts`, map maxZoom 22. Frequency 3, impact 8, gap. **[fix rule]** With the map's cap above 19, zooming to the top goes past `clusterMaxZoom`; photos with identical coordinates split and a click lists only one of them. Inferred from X03, which shows the split below the cluster limit. The e2e tests set zoom 19 and never try to zoom further. Breaks I7.
- **B36** `backend/router.py`, /points: datetime key dropped. Frequency 5, impact 3, gap. **[fix rule]** `/points` within a day sorts by filename instead of capture time when the two disagree (two cameras, a phone plus a camera, renamed files), so the section order differs from `/photos?date`. The test's dated rows on one day share a timestamp. Breaks I8.
- **C10** `frontend/CalendarView.tsx`, next pushes. Frequency 5, impact 3, gap. **[fix rule]** Next adds a history entry, so Back steps through months after using Next. The test named 'previous and next' presses only Previous.
- **G11** `frontend/PhotoDiaryPage.tsx`, same tab adds an entry. Frequency 5, impact 3, gap. **[fix rule]** `PageTabs` calls `onSelect` for the current tab, so without the guard pressing the current tab adds an entry and Back appears to do nothing.
- **G18** `frontend/PhotoDiaryPage.tsx`, go: push without scroll:false. Frequency 5, impact 3, gap. **[fix rule]** `router.push` without `scroll: false` scrolls to the top on pressing a day, the undated entry, close or a view switch. The router mock records calls and no test inspects the options.
- **M06** `frontend/MapView.tsx`, restore re-applied on each entry. Frequency 3, impact 5, gap. **[fix rule]** After Back restored a point's list, the restored ids apply again on each `/points` answer: closing it and re-entering the map reopens it, and `onRefresh` swaps another open point's list back to the restored one.
- **M13** `frontend/MapView.tsx`, refresh does not refetch the list. Frequency 3, impact 5, gap. **[fix rule]** Rename in a point's list: `/points` holds the same ids, `fetchIds` keeps its identity, and without this token the list does not refetch, so the old name stays until the list is reopened. The test passes through a removed photo, which changes `fetchIds` anyway.
- **P08** `frontend/usePagedPhotos.ts`, hydrate: batch 200 over the core's cap. Frequency 3, impact 5, gap. **[fix rule]** Batches over 100 ids are rejected by the core's `batch/get`: same condition and result as P20. The 250-photo test passes because the map's list pages 40 at a time and never hydrates more than 100 at once.
- **P20** `frontend/usePagedPhotos.ts`, fetchDepth: page size can exceed 100. Frequency 3, impact 5, gap. **[fix rule]** A depth over 100 asks `/photos` with limit over 100 and gets 422: Back or `onRefresh` on a list scrolled past 100 photos fails with the load error. The test for depth stops at 80.
- **X17** `frontend/map/createPhotoMap.ts`, selection does not follow re-clustering. Frequency 5, impact 3, gap. **[fix rule]** After zooming, the accent highlight stays at the old cluster's position and size rather than following the point that now holds the place. The selection e2e test clicks and waits at one zoom.
- **C05** `frontend/CalendarView.tsx`, days of another month drawn. Frequency 1, impact 8, gap. **[fix rule]** With a failed days fetch for a newly shown month, the previous month's days hide the error: the grid draws with no buttons and no message, which reads as a month with no photos. Also no loading state on every month move (cosmetic, frequency 8, impact 1).
- **C24** `frontend/CalendarView.tsx`, same list key for all days. Frequency 1, impact 8, gap. **[fix rule]** All days share one list key, so pressing another day is a refresh of the same list: day A's photos and count stay under day B's heading until the answer, and if that answer fails they stay there with only a banner. `PhotoList` is also keyed by the same value, so the first-load states are lost too.
- **D06** `frontend/lib/dates.ts`, monthGrid: no trailing pad. Frequency 10, impact 1, gap. The last week row has no padding cells. Empty cells draw nothing, so the grid looks the same.
- **X33** `frontend/map/createPhotoMap.ts`, cluster radius 80. Frequency 10, impact 1, gap. Radius 80 instead of the spec's nominal 40: points merge earlier, and each still lists what it stands for. No wrong list; the spec's stated value is not held.
- **G16** `frontend/PhotoDiaryPage.tsx`, no pagehide flush (reload loses state). Frequency 3, impact 3, gap. A reload in the same tab loses the list's depth and scroll position (the map's centre and point ids are saved on change, the list's only here). The spec promises it; tests cover the unmount path only.
- **G21** `frontend/PhotoDiaryPage.tsx`, calendar restore applied again. Frequency 3, impact 3, gap. After Back restored a day list, opening another day starts it at the saved depth and scroll position.
- **X24** `frontend/map/createPhotoMap.ts`, fit max zoom 19. Frequency 3, impact 3, gap. A drive whose photos are all in one place opens at zoom 19 instead of 15, with no surroundings. Every e2e map passes a centre, so the fit's limit is never drawn.
- **C25** `frontend/CalendarView.tsx`, hidden calendar refetches months. Frequency 5, impact 1, gap. Leaving the calendar fires one extra `/calendar/months`. The tests count fetches on entry only.
- **C26** `frontend/CalendarView.tsx`, hidden calendar refetches days. Frequency 5, impact 1, gap. Leaving the calendar fires one extra `/calendar/days`.
- **M23** `frontend/MapView.tsx`, hidden map refetches. Frequency 5, impact 1, gap. Leaving the map fires an extra `/points`.
- **P03** `frontend/usePagedPhotos.ts`, loadMore: stale success appends. Frequency 1, impact 5, gap. A later page answering after an `onRefresh` started is appended over the refreshed list: duplicates or skipped rows and a wrong offset until the next refresh. No test overlaps loadMore with a refresh. The 'day the viewer has left' test passes through the `key` remount, not through this guard.
- **C01** `frontend/CalendarView.tsx`, months: stale success writes. Frequency 1, impact 3, gap. An older months answer overwrites newer counts when a refresh overlaps another. The 'response for a month the viewer has left' test exercises the days and list paths only.
- **C02** `frontend/CalendarView.tsx`, months: stale failure writes. Frequency 1, impact 3, gap. An older months failure shows the error after a newer answer succeeded.
- **C04** `frontend/CalendarView.tsx`, days: stale failure writes. Frequency 1, impact 3, gap. After moving from month A to B, A's failed days fetch raises the load banner over B's good grid. The success side is tested (C03 killed), this side is not.
- **C15** `frontend/CalendarView.tsx`, open undated pressed again. Frequency 3, impact 1, gap. Pressing the open undated entry adds a history entry. The day's version is tested (C13 killed), this one is not.
- **C18** `frontend/CalendarView.tsx`, emptied undated pushes. Frequency 1, impact 3, gap. The emptied undated list closes with a push, so Back returns to the `undated=true` URL, which immediately replaces itself: Back is stuck one step.
- **C29** `frontend/CalendarView.tsx`, first days failure on a new month goes only to the banner. Frequency 1, impact 3, gap. A first failure of a new month's days raises only the banner; the grid stays in its loading state instead of showing the error in place.
- **C31** `frontend/CalendarView.tsx`, closed list's failure banner stays. Frequency 1, impact 3, gap. A failed list refresh's banner stays after the list is closed, and pressing retry does not clear it, because the list that would report success is gone.
- **G06** `frontend/PhotoDiaryPage.tsx`, calendar restore without a list in the URL. Frequency 1, impact 3, gap. A `?month=` URL reached with a saved list applies that depth and scroll to the first day opened afterwards. Needs a history jump to such a URL in the same tab.
- **G08** `frontend/PhotoDiaryPage.tsx`, calendar list restored onto map. Frequency 1, impact 3, gap. A calendar list's saved depth applied to a restored point's list. Needs a full load at a `view=map` URL while the saved list came from the calendar, which only a history jump gives. G07, the other direction, is tested.
- **G17** `frontend/PhotoDiaryPage.tsx`, closed point list stays saved. Frequency 1, impact 3, gap. A point's list closed by the close control comes back on reload, because its ids stay saved.
- **L02** `frontend/PhotoList.tsx`, no second scroll after layout. Frequency 1, impact 3, gap. If the grid's height arrives a frame after commit, the single scroll is clamped and Back lands higher than where it was. The e2e Back tests pass without the second scroll, so the case is not shown to happen on the fixture.
- **M01** `frontend/MapView.tsx`, points: stale success writes. Frequency 1, impact 3, gap. An older `/points` answer overwrites a newer one when re-entry and refresh overlap: a photo moved away keeps its point until the next entry.
- **M02** `frontend/MapView.tsx`, points: stale failure writes. Frequency 1, impact 3, gap. An older `/points` failure raises the error banner or the failed view after a newer answer succeeded.
- **M10** `frontend/MapView.tsx`, new point keeps the list seq. Frequency 3, impact 1, masked. A new point with the same list key goes through the refresh path: the right ids load, the old photos stay a moment longer and the panel keeps its scroll position.
- **M15** `frontend/MapView.tsx`, refresh reason not reset. Frequency 3, impact 1, gap. After one `onRefresh`, every later entry to the map refetches the open list, which the spec says it does not. An extra request and a brief re-render.
- **M19** `frontend/MapView.tsx`, points that arrived while creating are lost. Frequency 1, impact 3, gap. Re-entering while the library is still loading: points fetched meanwhile are not given to the new map, so they are missing until the next entry.
- **M20** `frontend/MapView.tsx`, map created after leaving not destroyed. Frequency 1, impact 3, gap. Leaving the page while the library loads leaves a created map on a detached node, with its context and possibly its tile requests. Against the spirit of I10; not measured.
- **P01** `frontend/usePagedPhotos.ts`, loadDepth: stale success writes. Frequency 1, impact 3, gap. Of two overlapping refreshes (two quick context-menu writes) the older answer can win, keeping a moved photo in the list until the next refresh. Same note as P03.
- **P02** `frontend/usePagedPhotos.ts`, loadDepth: stale failure writes. Frequency 1, impact 3, gap. An older refresh's failure shows the load error over a list a newer refresh just loaded.
- **P04** `frontend/usePagedPhotos.ts`, loadMore: stale failure writes. Frequency 1, impact 3, gap. A later page's failure, answering after a refresh started, shows a retry for a page the refreshed list does not need.
- **P12** `frontend/usePagedPhotos.ts`, loadDepth: loaded counts survivors, not ids asked. Frequency 1, impact 3, gap. Same as P13 through the first load or a refresh.
- **P13** `frontend/usePagedPhotos.ts`, loadMore: offset counts survivors, not ids asked. Frequency 1, impact 3, gap. A photo trashed between the ids and the file fetch shifts the next page's offset back by one: a duplicate row. The trash test uses a list shorter than a page.
- **X05** `frontend/map/createPhotoMap.ts`, source maxzoom option dropped. Frequency 1, impact 3, gap. Without the source's `maxzoom` (default 18), the top zoom overscales z18's clusters, so nearby but distinct photos stay merged at 19. Each point still lists its own members. The I7 test's other group is about 110 m away, too far to show it.
- **X28** `frontend/map/createPhotoMap.ts`, no hit slop. Frequency 3, impact 1, gap. Clicks at a circle's very edge miss. Every e2e click lands on a point's centre.
- **B38** `backend/router.py`, /points: id tie-break desc. Frequency 1, impact 1, gap. Two copies with the same timestamp and filename in different folders swap places on the map only. They look alike.
- **C21** `frontend/CalendarView.tsx`, date opens on a no-dated drive. Frequency 1, impact 1, gap. A `?date=` link on a drive with no dated photos also opens an empty day list beside the no-dated message.
- **P05** `frontend/usePagedPhotos.ts`, loadMore: busy guard removed. Frequency 1, impact 1, gap. Two loadMore calls overlap only through a double retry press; the generation guard drops the first, so there is one extra request and no wrong row.
- **P06** `frontend/usePagedPhotos.ts`, finally: older load clears busy (loadDepth). Frequency 1, impact 1, gap. An older load clears `busy` while a newer one runs; a loadMore can then start and is resolved by the generation guard.
- **P07** `frontend/usePagedPhotos.ts`, finally: older load clears busy (loadMore). Frequency 1, impact 1, gap. As P06, from the loadMore side.
- **P14** `frontend/usePagedPhotos.ts`, moreMayFollow uses files, not ids. Frequency 1, impact 1, gap. After a photo vanished between ids and files, `moreMayFollow` stays true at the end of the list, so `FileGrid` hides its end-of-list state while the loadMore guard stops any request.
- **P17** `frontend/usePagedPhotos.ts`, unmount does not invalidate in-flight loads. Frequency 1, impact 1, gap. A closed list's in-flight refresh failure still reports to the page, raising the banner of C31.
- **U11** `frontend/lib/pageUrl.ts`, buildPageQuery '?' for empty. Frequency 1, impact 1, gap. A URL ending in a bare `?` when the undated list closes with no month. `search` is still empty for the page.
- **X22** `frontend/map/createPhotoMap.ts`, destroy keeps the labels. Frequency 1, impact 1, masked. Markers live inside the map's container and go with `map.remove()` and with the unmounted host.
- **X25** `frontend/map/createPhotoMap.ts`, any source's error counts as a tile failure. Frequency 1, impact 1, gap. A failure of another source would raise the tile notice. No other source fetches over the network, so this needs an internal MapLibre error.
- **X38** `frontend/map/createPhotoMap.ts`, error path: no retry callback selection. Frequency 1, impact 1, gap. A failed read of a point's members does not highlight the point. The e2e harness passes no `onPointError`, so the real map's error path, including its retry, has no browser test.
- **B19** `backend/router.py`, _IS_DATED: year 0000 allowed. Frequency 0, impact 5, none. A `0000-MM-DD` with real month and day would become a month `0000-01` and `/photos?date` would answer 422, breaking I3. The observed bad rows are `0000-00-00`, which `date()` already rejects (B18 killed), so no ordinary condition is shown.
- **B46** `backend/router.py`, offset ge 0 removed. Frequency 0, impact 1, none. SQLite treats a negative offset as 0 and the frontend never sends one. The spec's 422 list names `limit` only.
- **B50** `backend/router.py`, _real_date: regex removed (fromisoformat accepts other forms). Frequency 0, impact 1, none. `20261003` gives an empty 200 rather than 422. The frontend's `isRealDate` never sends it.
- **B57** `backend/router.py`, /assets: path built from the name, no allow-list. Frequency 0, impact 1, none. Every listed traversal form is stopped by routing before the handler, and the directory holds only listed files, so the allow-list has no reachable difference from the path form. The tests do not show the guard working; the route's shape does the work.
- **C19** `frontend/CalendarView.tsx`, emptied undated list does not close. Frequency 0, impact 1, masked. C23's effect closes the list once the refreshed counts say 0; the same replace is reached.
- **C30** `frontend/CalendarView.tsx`, refetch months failure blanks the grid. Frequency 0, impact 1, none. `monthsFailed` draws the same load error and does not remove the loaded grid, so a failed refetch looks identical.
- **D03** `frontend/lib/dates.ts`, utcDate via Date.UTC (years 0-99 shift). Frequency 0, impact 1, none. Needs a capture year 0001 to 0099; a real camera value has not been shown. The comment in `dates.ts` promises it and no test holds it.
- **G02** `frontend/PhotoDiaryPage.tsx`, map count: stale 404 writes. Frequency 0, impact 1, none. A late 404 still names the same drive, since `Session` is keyed by drive and the guard only covers a re-entry, and the answer is true.
- **G04** `frontend/PhotoDiaryPage.tsx`, fresh start reads saved. Frequency 0, impact 1, none. `clearState` runs on the line before, so `loadState` returns null and gives `{}`.
- **G22** `frontend/PhotoDiaryPage.tsx`, map list restore applied again. Frequency 0, impact 1, masked. `restoreSeq` (M26) already limits the restore to the restored list. Each of the two hides the other's removal.
- **L03** `frontend/PhotoList.tsx`, empty never reported. Frequency 0, impact 1, masked. Same as C19. The map closes an emptied list on its own, and only the undated list passes `onEmpty`.
- **L04** `frontend/PhotoList.tsx`, hidden list keeps loading. Frequency 0, impact 1, none. A hidden view is `display: none`, so its sentinel never intersects.
- **M17** `frontend/MapView.tsx`, tile notice survives an emptied map. Frequency 0, impact 1, masked. The notice is drawn only inside `showMap`; on a map created later, the next idle clears it.
- **M22** `frontend/MapView.tsx`, 404 not final for the map. Frequency 0, impact 1, masked. `onNotAvailable` replaces the whole page, so `MapView` is gone and the flag is never read after a 404. The flag matters only for no-WebGL (M21 killed).
- **M26** `frontend/MapView.tsx`, restore depth on any later point. Frequency 0, impact 1, masked. G22 clears `restore.list` once restored, so the prop is already undefined for a later point.
- **M30** `frontend/MapView.tsx`, map's view forgotten when recreated. Frequency 0, impact 1, masked. `viewRef` is read only when a map is created anew, after an emptied drive or a library retry, where a saved view rarely exists.
- **P09** `frontend/usePagedPhotos.ts`, hydrate: batch answer order kept. Frequency 0, impact 1, none. The core's `batch_get` returns rows in request order (`backend/app/routers/files.py:307-313`). Would matter only if the core changed that.
- **P21** `frontend/usePagedPhotos.ts`, retry resets to a page. Frequency 0, impact 1, none. Retry appears only after a failed first load, when `loadedRef` is 0. A failed restore's retry loads one page rather than the saved depth, both with and without this mutation.
- **P22** `frontend/usePagedPhotos.ts`, new list keeps old rows meanwhile. Frequency 0, impact 1, none. `PhotoList` is keyed by `listKey`, so a new key is a new hook with empty state. Reached only together with a removed key.
- **U10** `frontend/lib/pageUrl.ts`, buildPageQuery emits date and undated. Frequency 0, impact 1, none. `parsePageUrl` never gives both, and no caller passes both, so the query cannot hold both. `date` still wins on reading.
- **V03** `frontend/lib/savedState.ts`, sanitize: center unchecked. Frequency 0, impact 1, none. Only the addon's own writes reach this storage key, so a malformed centre needs a hand edit.
- **V04** `frontend/lib/savedState.ts`, sanitize: non-string point ids pass. Frequency 0, impact 1, none. As V03.
- **V07** `frontend/lib/savedState.ts`, listView unknown value passes. Frequency 0, impact 1, none. As V03.
- **X04** `frontend/map/createPhotoMap.ts`, source maxzoom at 19 (top level unclustered). Frequency 0, impact 1, none. Measured: identical coordinates at zoom 19 still merge with source `maxzoom` 19, so the code comment's reason for +1 is not shown by any test. Worth checking whether the +1 is needed.
- **X23** `frontend/map/createPhotoMap.ts`, click after destroy still reports. Frequency 0, impact 1, none. Needs a click whose cluster read answers in the moment after leaving; the callbacks then set state on an unmounted view.

TOTAL: 93 findings
