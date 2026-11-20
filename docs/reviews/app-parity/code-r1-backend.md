# Code review r1 — backend (app-parity, SPEC-PD-023/024)

- Commit: f573859eaeef20836bdbb12763e5fe3781fc5a9d (photo_diary, feature/app-unify)
- Range: f5aed25..f573859, backend only: `backend/router.py`, `tests/test_app_parity.py`, `tests/test_target_members.py`
- Core checkout: /Users/libre/Sources/video_share-pd-review at 48479c94b43ed45dc8354eb633c1e942f58659be (develop, detached)
- Scope: `by=all` on `/library/shelves` and `/library/shelf` (GET and POST), `tag` on `POST /library/shelves` and `POST /library/shelf` (`_library_tag_parameters`, `_tagged`), the 422 table in test_target_members
- Threat model: personal tool on a home LAN, user is the owner, no attacker. A = silently wrong or broken in ordinary use. B = odd input, misuse, maintenance. Exception: the drive boundary is a security boundary; a breach is A even with a crafted request.
- Baseline: full suite given as 1103 passed / 100% coverage (not rerun). The two files in scope, unmutated: `pytest test_app_parity.py test_target_members.py -q --no-cov -x -p no:randomly` → 489 passed.

## Mutation

Method: `backend/` copied to `scratchpad/pdp-mut/<mutant>/`, one edit per copy, mounted read-only over both addon mount points of image `pdp-review-b2`; run over test_app_parity.py + test_target_members.py with `-x`. The tracked tree was never edited. Kills of m05, m07, m08 were re-run singly to confirm the failure is the assertion, not an error.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| m01 | `_no_target_parameters` exempts `tag` too (every POST route accepts `tag`) | killed | test_target_members::test_pd021_i1_pd024_a_post_with_any_target_query_parameter_but_a_library_tag_is_422[tag-months] |
| m02 | `_library_tag_parameters` exempts `folder` as well as `tag` | killed | test_app_parity::test_pd024_i6_tag_does_not_open_the_post_library_routes_to_other_target_parameters[folder] |
| m03 | empty-`tag` 422 removed | killed | test_pd024_i6_an_empty_tag_on_the_post_library_routes_is_422[empty-alone-shelves] |
| m04 | `_tagged` never narrows (tag predicate dropped) | killed | test_pd024_i6_post_with_tag_answers_the_get_for_a_collection_of_the_ids_plus_that_tag[shelves-month-trip] |
| m05 | under `tag`, the POST base and the tag listing lose the drive restriction (ids ∩ images ∩ active ∩ tag, any drive) | killed | same test; the diff is the other drive's `trip`-tagged photo (`f00000000012`) appearing in the 2026-10 shelf |
| m06 | tag predicate uses only the first tag (any instead of all) | killed | test_pd024_i6_post_with_tag_answers_...[shelves-month-repeated-no-photo] |
| m07 | `_shelf` by=all routed through the collection filter (`no_collection`) | killed | test_pd023_i3_all_holds_the_month_shelves_photos_once_each_in_their_order[search-title-and-folder-no-tag-chosen-newest] |
| m08 | `_shelf` by=all routed through the folder filter (root key) | killed | same |
| m09 | by=all accepts any key | killed | test_pd023_i3_by_all_takes_only_key_all[empty] |
| m10 | by=all, `oldest`: undated before dated | killed | test_pd023_i3_all_holds_the_month_shelves_photos_once_each_in_their_order[tag-no-tag-chosen-oldest] |
| m11 | by=all ignores `offset` on `/library/shelf` | killed | test_pd023_item6_all_pages_by_40_with_offset |
| m12 | `/library/shelves?by=all` returns a count-0 shelf instead of none | killed | test_pd023_i3_all_shelves_is_one_shelf_with_that_count_or_none[search-title-and-folder-two-tags-chosen-newest] |
| m13 | `/library/shelves?by=all` head ordered `newest` whatever the sort | killed | test_pd023_i3_all_shelves_is_one_shelf_with_that_count_or_none[...-no-tag-chosen-oldest] |

No surviving mutant. m11 is killed only by the dedicated 45-photo paging test: every I3 fixture fits on one 40-photo page, so I3's whole-grid comparison alone would not see a paging defect. The dedicated test covers it, so no finding.

## Other checks (no finding)

- Tag predicate parity: `_tagged` calls the core `filtered_drive_files(db, drive, tag=…, type=["image"])`, the same function and predicate `_photo_query` uses for the GET target (AND over tags, case-folded, `apply_file_filters`). Core drops empty names (`[name for name in tags if name]`), so the POST's own 422 on an empty value is the only place that rule lives; tested (m03).
- Drive boundary under `tag`: the member set is still `_photos(drive)` ∩ ids, and the tag sub-query is itself drive-restricted by `filtered_drive_files`; m05 shows the existing fixture (other-drive `trip` photo in the posted ids) catches a loss of it.
- Dependency order: `tags` is declared after `drive` on both POST routes, so a locked or unknown drive answers 404 before any 422 from `_library_tag_parameters`; reordering would give 422 to locked and unknown alike, revealing nothing.
- The `_shelf` refactor keeps the old validation: `folder` still accepts an empty key (root), month/tag/collection still 422 on an empty key, month still checks the key shape.
- `ShelfBy` gains `all` only on the four library routes; `_shelf_filter` / `_shelf_label` are never reached with `all`.
- `/library/shelves?by=all` ignores `offset` and `shelf_limit` (always one shelf). Spec item 7 says the page does not use it; with `total_shelves: 1` a pager never asks for a second page. Not a defect.
- Spec section 10 asks for a timing of the `by=all` first page at 50,000 photos / 10,000 ids before merge; `docs/reviews/app-parity/decisions.md:30` records it as not exercised. A process item, not a code finding; noted for the lead.

TOTAL: 0 findings
