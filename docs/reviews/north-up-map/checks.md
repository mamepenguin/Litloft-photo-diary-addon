# North-up map checks

Implementation: `671ef22d3cc8403f12364f0243c834b7998d9934`.

- Browser RED: five rotation/lifecycle cases failed on nonzero bearing; two pan/zoom cases passed. GREEN plus existing map, theme, failure and library/worker retry cases: 44/44 passed. See [R-5](r5.md).
- `pnpm exec vitest run src/addons/photo_diary/map`: 40/40 passed.
- Targeted TypeScript checks of createPhotoMap.ts/mapStyle.ts and of northUp.spec.ts passed. Temporary configs extend the repository configs; the browser-test config supplies the installed Node type roots.
- `pnpm exec eslint --no-ignore src/addons/photo_diary/map/createPhotoMap.ts`: passed.
- Core `scripts/process/precheck.sh --profile local`: frontend and secret-scan gates passed; the frontend gate skips this addon-only source change, covered explicitly above.
- Approved spec hash verified: `6221b89ae46e15c3850ffa1e98976bd38c6b9f9657d71958911d0b00abb12c93`.
- Full existing E2E tsconfig check is not green: Node types are not resolved by its configuration and mapPolish.spec.ts has an existing touch-event string type error. No new northUp.spec.ts error was reported; its targeted check passes.
- Full core typecheck was not repeated: the prior run has unrelated missing Intelligence imports. The production frontend build will run its own typecheck before replacing the running frontend.
- `jev-lint` unavailable without TYPESAFE_API_KEY. No checks were weakened.

The independent fixed-commit [code review](code-r1.md) reports zero findings. R-5 used real public tiles and synthetic photo metadata, covering 17 interaction/lifecycle states. Risk classification is HIGH (252 changed lines including the spec and tests, default addon zone MEDIUM), without modifiers or protected paths. This is a six-line production change to standard interaction handlers; no large or load-bearing mutation review was needed.

The core keyboard-shortcut guide is updated in the shared core working tree alongside the addon's README. Core runtime code and unrelated addon changes are untouched.
