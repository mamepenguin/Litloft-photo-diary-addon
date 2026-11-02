# Memory map mutation review — round 1

Fixed SHA: `3a652d5b38661ea8c8a5a156b517fef068d688d8` (photo_diary addon).
Risk: HIGH, score 7 (584 changed lines including specs/tests; default addon MEDIUM; no modifiers).
Threat model: personal home LAN, first-party addons, no adversary. Review targets silent failures during normal use. No private data or production access was used.

Read: approved `docs/specs/memory-map.md` (SPEC-PD-013), root `docs/process/review.md` and `docs/process/testing-and-comments.md`.

## Isolation and baseline

A detached git worktree at the fixed SHA was created at `/tmp/litloft-memory-map-mutation-3a652d5`. Its `node_modules` symlink points to the core frontend's installed dependencies. A temporary `vitest.mutation.config.mjs` selects only `frontend/map/mapStyle.test.ts` and `frontend/map/memoryMap.test.ts`, with the Node environment and no DOM setup.

Command for baseline and every mutation: `./node_modules/.bin/vitest run --config vitest.mutation.config.mjs`.
Baseline: 2 files passed, 40 tests passed, exit 0. All implementation mutations occurred only in the throwaway worktree. The original file was restored after each run; final `git diff --exit-code -- frontend/map/mapStyle.ts` exited 0, and HEAD remained the fixed SHA. No fixes were made.

## Mutation results

Each `want=kill` declaration was emitted before its corresponding edit and test run. All five mutations were killed by assertions, rather than setup or compilation failures.

| Mutation | Invariant | Declared | Observed | Reproduction and evidence |
|---|---|---|---|---|
| M1 | I2 | want=kill | kill; exit 1; 2 failed, 38 passed | At `frontend/map/mapStyle.ts:140`, change building `minzoom: 14` to `13`. Both theme cases fail at `frontend/map/memoryMap.test.ts:101`: expected 14, received 13. |
| M2 | I3 | want=kill | kill; exit 1; 3 failed, 37 passed | At `frontend/map/mapStyle.ts:177`, add rail paint `"line-dasharray": [2, 2]`. The style test at `frontend/map/mapStyle.test.ts:61` and both theme cases at `frontend/map/memoryMap.test.ts:92` reject the dash array. |
| M3 | I1, I7 | want=kill | kill; exit 1; 4 failed, 36 passed | At `frontend/map/mapStyle.ts:191`, replace allowed tourism `museum` with `restaurant`. Both theme cases reject missing museum labels at `frontend/map/memoryMap.test.ts:127` and forbidden restaurant labels at line 155. |
| M4 | I3 | want=kill | kill; exit 1; 2 failed, 38 passed | At `frontend/map/mapStyle.ts:123`, use `p.woods` for park fill instead of `p.park`. Both theme cases fail the park color assertion at `frontend/map/memoryMap.test.ts:74`. |
| M5 | I4 | want=kill | kill; exit 1; 2 failed, 38 passed | At `frontend/map/mapStyle.ts:211`, filter out the `park-names/text-color` entry from `paintFor`. Both theme cases fail at `frontend/map/memoryMap.test.ts:165`, receiving undefined instead of the specified park text color. |

## Assessment and limits

Specification compliance: the five tested violations of the approved invariants are detected. No surviving mutation or actionable coverage gap was reproduced within this bounded review.

Unspecified behavior found: no. Potential unspecified behavior: none identified in the exercised scope.

Regression risks: these tests inspect generated style/filter/paint output; they do not establish rendered MapLibre behavior or tile contents.

Test coverage: zoom gate, solid rail, facility allow/exclude filtering, park/forest color distinction, and complete color repaint output were exercised in both themes. Mutation logs remain at `/tmp/litloft-memory-map-mutation-M1.log` through `M5.log`.

Not verified: browser rendering, tile/glyph service behavior, hidden-map lifecycle, view/selection/tile retention, authorization, pin interactions, unrelated tests, build, lint, and production. Those are outside the requested focused mutation scope. Confidence: 95% for the five mutation outcomes.

TOTAL: 0 findings
