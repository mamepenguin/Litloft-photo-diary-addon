# Code review r1: Library backend (SPEC-PD-018)

- Commit: addon `bbf9562`, range `3cb4ed7..bbf9562`; core checkout `a405538`.
- Scope: `backend/router.py` (`/library/shelves`, `/library/shelf`), `backend/schemas.py`, `tests/test_library.py`, the Library rows in `tests/test_target.py` and `tests/test_authorization.py`.
- Baseline: `test_library.py`, `test_target.py`, `test_authorization.py` run in `photo-diary-test:library` with the range's `backend/` and `tests/` mounted: 485 passed.
- Threat model: personal tool, owner only. A = silently wrong or broken in ordinary use. B = odd input, misuse, maintenance.

## Findings

### 1. A tag named `no_tag` merges with the untagged photos and its photos drop out of every tag shelf (B)

- Claim: `backend/router.py:414` groups by `coalesce(names.name, 'no_tag')`, so a real tag whose name is `no_tag` lands in the same group as photos with no tag. `router.py:426-427` then emits one shelf keyed `no_tag` whose `count` covers both, while its `file_ids` (`_shelf_ids` → `_shelf_filter`, `router.py:349-350`) and `/library/shelf?by=tag&key=no_tag` hold only the untagged photos. The tagged photos are in no shelf, breaking I1 (coverage, and `count` == `total`). The frontend titles the shelf "No tag" (`frontend/lib/library.ts` `shelfTitle`, label `""`).
- Reproduced (probe in the test image): one photo tagged `no_tag`, one untagged → `shelves?by=tag` = `[{key: "no_tag", label: "", count: 2, file_ids: [<untagged>]}]`; `shelf?by=tag&key=no_tag` = `{file_ids: [<untagged>], total: 1}`.
- Condition: the owner creates a tag literally named `no_tag`. Not ordinary use. `undated` and `no_collection` cannot collide (month keys are `YYYY-MM`; collection ids are 12-character nanoids).
- Frequency 0, impact 8 (silently wrong count, photos missing from the tag view). Below the fix threshold.
- Test that would catch it: in `test_pd018_a_photo_is_on_one_tag_shelf_per_tag_it_carries`, tag one photo `no_tag` and assert it appears in some shelf and that each shelf's `count` equals `/library/shelf`'s `total`.

### 2. `/library/shelf` accepts a month key with a trailing newline (B)

- Claim: `backend/router.py:582` checks the key with `_MONTH_KEY.match`, and `_MONTH_PATTERN` (`router.py:98`) ends in `$`, which in Python matches before a final `\n`. `by=month&key=2026-10%0A` answers 200 `{file_ids: [], total: 0, label: ""}` instead of the 422 that item 20 requires for a key that is not a real `YYYY-MM`.
- Reproduced: probe returned `200 {"file_ids":[],"total":0,"label":""}`.
- Condition: a hand-edited URL only. The shelf page's own check (`frontend/lib/library.ts` `MONTH_KEY`, a JS regex without the `m` flag) rejects the key before any request, so the UI cannot send it.
- Frequency 0, impact 1 (an empty shelf instead of "This link cannot be opened" — and only via a direct API call).
- Test that would catch it: add `pytest.param({"by": "month", "key": "2026-10\n"}, id="month-trailing-newline")` to `BAD_SHELF`; fix with `re.fullmatch` or `\Z`.

## Checked, no finding

- Capture order (`_capture_order`), undated-last in both sorts, id as the final tie-break so offset paging is stable; month/tag/collection/folder shelf order against Definitions; NFC handling of folder keys on both sides; base descent copied from core `routers/shelves.py` `_folder_base` / `_folder_shelf_key`; drive scoping of tags and collections (`Tag.drive`, `Collection.drive`, `File.drive` in `_photos`); `_drive_scope` on both routes; I2 parity with `/calendar/months`. The tests in the range pin these (I1 over every target × by × sort, NFD folder keys, root key `""`, the 422 table).
- The 1-second bound (section 10). `decisions.md` records only the production timing (8–128ms); no measurement on a generated 50,000-photo database is recorded. I measured one at `bbf9562` in `photo-diary-test:library` (TestClient, in-process): 50,000 images (75% dated across 15 years), 1,000 folders `YYYY/MM/evN`, 2,000 tags with about 2 per photo, 500 collections holding half the photos. First pages under no target, `tag=tag5`, `search`, `folder=2015`, both sorts: `/library/shelves` 31–547ms (slowest: `by=tag` under a tag target), `/library/shelf` 24–239ms (slowest: `key=no_tag`). All within 1 second. The script is `/private/tmp/claude-502/-Users-libre-Sources-video-share/3846802d-d967-4732-903e-806bf2ebb073/scratchpad/perf/test_perf_review.py`; the author may want to record the measurement in `decisions.md`.
- `router.py:319` (`return base` inside the prefix check of `_folder_base`) cannot run: the base only ever descends into the single child every folder lies under. Copied from core; not reported.

TOTAL: 2 findings
