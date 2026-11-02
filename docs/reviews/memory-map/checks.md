# Memory map: local checks

Implementation: `3a652d5b38661ea8c8a5a156b517fef068d688d8`.

Run from the core checkout's `frontend/` unless stated otherwise:

| Check | Result |
|---|---|
| `pnpm exec vitest run src/addons/photo_diary` | 12 files, 520 tests passed |
| `pnpm exec tsc --noEmit -p /tmp/photo-diary-map-tsconfig.json` | Passed; temporary config extends core tsconfig and includes mapStyle.ts and the two map unit-test files |
| `pnpm exec tsc --noEmit` | Blocked outside this change: sceneCandidatesFixtureParity.test.tsx imports missing Intelligence fetchSceneSegments and SceneCandidatesSection exports/module |
| `pnpm exec eslint --no-ignore src/addons/photo_diary` | No errors, 119 warnings |
| `pnpm lint` | No errors, 68 warnings |
| Core `bash scripts/process/precheck.sh --profile local` | Passed frontend and secret-scan gates; frontend gate skipped the addon-only change, so the explicit addon checks above supply frontend verification |
| `git diff --check` | Passed |
| Core `spec-hash.sh` on docs/specs/memory-map.md | Matches approved hash e06b903d879e65532928d8ace7da52a76f97ed8ffcc85a0253653f41e312874a |

The four new browser checks passed RED against the prior style and GREEN against the implementation. The independent browser record contains the 38-test regression command and real-tile screenshots: [r5.md](r5.md).

The fresh fixed-commit [code review](code-r1.md) has no findings. The independent [mutation review](mutation-r1.md) starts from 40 passing tests and kills all five declared mutations. No source fixes followed either review.

Risk classification for the spec and implementation commits: HIGH, score 7, no modifiers, no protected paths. The author used the Agent review path because unrelated addon changes are present in the shared core checkout. No merge or deployment was performed.

`jev-lint` was not run because TYPESAFE_API_KEY is absent. Real household devices and LAN performance were not tested.
