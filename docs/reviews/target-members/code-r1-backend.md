# Code review r1 — backend (target-members, SPEC-PD-021/022)

- Commit: 6f90a56687c2a18b7bb82d5792e415e89741901c (photo_diary, feature/target-members)
- Range: d95e3d3..6f90a56
- Core checkout: /Users/libre/Sources/video_share-pd-review at 48479c94b43ed45dc8354eb633c1e942f58659be (origin/develop, detached)
- Scope: addon `backend/` and `tests/` (POST member-set routes, collection targets, tests/test_target_members.py and existing tests of edited modules)
- Baseline: `docker build -f addons/photo_diary/Dockerfile.test -t pd-review-backend .` then `docker run --rm pd-review-backend pytest -q` → 869 passed, coverage 100.00% (router.py 361 stmts / 100 branches, schemas.py 44 stmts)
- Threat model: personal tool on a home LAN, user is the owner, no attacker. A = silently wrong or broken in ordinary use. B = odd input, misuse, maintenance (no repro needed). Exception: the drive boundary is a security boundary; a breach is A even with a crafted request.

## Mutation (member-set and collection paths)

Method: the addon `backend/` copied to the scratchpad, one edit per copy, mounted read-only over `/app/addons/photo_diary` in the test image (core `drives.py` mounted the same way for the core mutant). Run: `pytest -x --no-cov` over test_target_members, test_target, test_library, test_authorization, test_points, test_calendar (790 tests, all pass unmutated); the member-filter variants m18/m19 over test_target_members alone. The tracked trees were never edited.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| m01 | `_photos`: drop `File.drive == drive` | killed | test_pd021_i1_post_answers_what_get_answers_for_the_listed_active_images[months] |
| m02 | `_photos`: drop `active_file_filter()` | killed | same |
| m18 | `_photos`: `active_file_filter()` → `deleted_at IS NULL` only (missing passes) | killed | same |
| m19 | `_photos`: `active_file_filter()` → `missing_since IS NULL` only (trash passes) | killed | same |
| m03 | `_photos`: drop `file_type == "image"` | killed | same |
| m04 | `MemberFileIds` cap 10,000 → 10,001 | killed | test_pd021_i1_ten_thousand_entries_are_accepted_and_one_more_is_422[months] |
| m05 | cap 10,000 → 9,999 | killed | same |
| m06 | `if file_ids is not None` → `if file_ids` (`[]` = whole drive) | killed | test_pd021_i1_an_empty_member_list_selects_no_photo_and_keeps_note_dates[months] |
| m07 | `_no_target_parameters` never raises | killed | test_pd021_i1_a_post_with_any_target_query_parameter_is_422[search-months] |
| m15 | `_TARGET_PARAMETERS` without `none` | killed | test_pd021_i1_a_post_with_any_target_query_parameter_is_422[none-months] |
| m08 | `StringConstraints(min_length=0)` | killed | test_pd021_i1_missing_or_invalid_file_ids_is_422[empty-string-alone-months] |
| m13 | `points_post` ignores the body ids | killed | test_pd021_i1_post_answers_what_get_answers_for_the_listed_active_images[points] |
| m14 | `points_post` reads `X-Lit-Drive` raw instead of `_drive_scope` | killed | test_pd021_a_locked_drive_is_404_and_open_to_its_group[points] |
| m17 | `_photo_query`: `collection=target.collection` → `None` (collection target ignored) | killed | test_pd021_i1_post_answers_what_get_answers_for_the_listed_active_images[months] (its GET oracle) |
| m16 | core `apply_file_filters`: collection names resolved across all drives | killed | test_target.py::test_pd016_folder_and_collection_are_matched_within_the_request_drive |
| m09 | `_shelf` label lookup without `Collection.drive == drive` | killed | test_library.py::test_pd018_i6_collection_label_and_foreign_or_empty_collections |
| m10 | `_drive_collection_links` without the drive filter | killed | test_library.py::test_pd018_i5_collections_newest_by_their_newest_photo_ties_by_label |
| m11 | `_collection_names` without the drive filter | killed | same |
| m12 | `_collection_shelves` label map without the drive filter | survived, equivalent | the map is only read for keys produced by `_collection_names(drive)`, so other drives' entries are never read; no behaviour to test. Pre-existing code, not in the range. |

No surviving non-equivalent mutant.

## Other checks (no finding)

- Dependency order on the POST routes (probed with a throwaway test mounted into the image, not committed): on a locked drive, `?none=true`, `file_ids: [""]`, 10,001 ids, `month=bad` and a missing body all answer 404, so the 422 checks never reveal a locked drive. `_no_target_parameters` is declared after `drive`, and an unknown drive takes the same path, so reordering would not open a distinction either.
- `file_ids: [1, 2]` → 422 (pydantic v2 does not coerce int to str); a form-encoded body → 422; an extra body key is ignored (200). Harmless under the threat model.
- GET routes: the refactor into `_shelves` / `_shelf` / `_months` / `_days` / `_photo_page` / `_points` keeps every GET path's query identical (`_photo_query` with `file_ids=None` returns the same statement as before for `none`, no target, and a given target). Existing GET tests pass unchanged.
- Parameter count: each statement embeds the 10,000-id `IN` once (`_count` wraps the query once; shelf queries add only folder paths or a tag/collection subquery), well below SQLite's 32,766 variable limit; R-5 and the section 10 measurement exercised 10,000 ids on every route and `by`.
- Drive boundary under a collection target: `_photos` bounds `File.drive` independently of the core's name resolution, and m16 shows the resolution itself is also tested.

## Findings

None.

TOTAL: 0 findings
