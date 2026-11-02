# Memory map code review, round 1

Reviewed fixed addon commit `3a652d5b38661ea8c8a5a156b517fef068d688d8` against its verified parent `e9c9533139b9627368b8b8390ba49c646499485e`. No implementation files were edited. No actionable defect was reproduced.

Threat model: a personal home-LAN application with first-party addons and no adversary. The review considers silent failures in normal use.

Risk: HIGH, as classified by the caller for the complete spec-and-implementation change (score 7: base 3, addon default zone 4, no modifiers or protected paths).

## Specification compliance

Read SPEC-PD-013, including its approved invariants and Checked, no action section, and the applicable root project, frontend, design, process, and testing rules. The production diff implements the requested palettes, separate river/forest/park surfaces, building and small-street zoom gates, solid rail, named-feature filtering, and selected label categories. The existing road widths remain intact. The explicit deferrals for photo/label collision handling and absent tile content were respected.

Compared layer/property selection with the published [Shortbread 1.0 schema](https://shortbread-tiles.org/schema/1.0/). Administrative levels are numeric, stations use `kind`, and POIs use `tourism`/`leisure`. The schema does not promise park POIs and supplies POIs only at tile zoom 14; the spec explicitly permits missing categories and treats stated zooms as drawing minima. Those are not defects.

## Named perspectives

- Semantics and filtering: no finding. Labels use the existing `name` field, reject absent/empty names, retain default collision handling, and use the permitted categories. Cities and stations precede supporting labels.
- Theme and reload: no finding. Both initial layers and paint updates derive from the same layer definitions. Existing visible/hidden theme application and tile-source reconstruction consume those definitions, so new layers participate without changing camera or photo data.
- Photo behavior: no finding. Photo sources, clustering, DOM pins, selection, click handling, and failure recovery are unchanged. Basemap reconstruction still inserts layers before the existing photo layers.
- Tests: no finding. The added tests exercise category/unnamed exclusion, zoom gates, colors, solid rail, and paint completeness. The browser additions measure rendered surface colors and building visibility. Existing browser cases cover theme changes, hidden-map resume, tile failure, and pins. The unit filter evaluator is a limited test helper, not proof of MapLibre rendering.

## Verification and limitations

This was a read review using fixed-commit `git show`, parent verification, targeted surrounding-code reads, file history, and the published tile schema. A targeted hako search returned no additional context; no durable lesson warranted a hako save.

The author reports 520 passing addon Vitest tests, changed-map TypeScript checks passing, and map lint passing with warnings; those commands were not rerun in this read review. The reported unrelated core TypeScript failures remain outside this diff. Actual browser rendering, live tile availability, visual hierarchy, and real-device behavior were not independently verified here; a separate R-5 pass owns rendering evidence. No mutation review was performed. No unspecified behavior requiring a design decision was identified. Residual regression risks are renderer-specific label placement and differences in supplied tile content.

Confidence: 88/100 for the code review scope.

TOTAL: 0 findings
