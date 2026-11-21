# Photo Diary app-parity, code review round 2 (fix commits c88533a, dce39ca, fca2255)

Baseline at beca8f0: vitest src/addons/photo_diary 823 passed; tsc --noEmit clean.

## Findings

### c88533a (F1)

Checked and holding: the new test fails with `onRefresh={refresh}` restored on `<AllPhotos>` (1 failed / 152 in Library+AppParity) and passes with the fix; it goes through the production wiring (mocked `FileGrid` calls the real `onRefresh` prop, the same seam the shelf cases use). Core `FileContextMenu` calls `onUpdate` only after a successful action (`components/FileContextMenu.tsx:71,85,98`), so no write is counted for a failed or cancelled menu action. Double count: `wrote` takes the number `onWrite()` returns, so the active Library does not re-read a second time from its own `writeToken` effect; measured with temporary assertions in the new test: the `by=all` shelf read rises by exactly 1 on the write, does not rise again on Calendar → Library, and the Calendar's `/photos` read does not rise again on a second visit. Removing `seenWrite.current =` is caught by the existing shelf case. No re-read loop seen.

#### R2-1. The なし grid's retry after a failed re-read now counts as a write (B)

- Claim: `LibraryFace.tsx:451` (`AllPhotos`) wires the same `onRefresh` prop to both `FileGrid` and the re-read retry `<LoadError onRetry={onRefresh} />`. With c88533a that prop is `wrote` (`LibraryFace.tsx:205`), so pressing 再試行 after a failed re-read calls `onWrite()` and bumps the page's write counter although nothing was written. The shelf path does not have this: its retry is `library.retryRefresh` (`LibraryFace.tsx:316`), not `onRefresh`.
- Observed: temporary test in `Library.test.tsx` (removed): 分類 なし, open the Calendar day list, write there, Library tab with the `by=all` shelf answering 500 → 読み込めませんでした; Calendar tab; Library tab, 再試行 (now succeeds); Calendar tab → `/photos` count rises by 1 (expected 2, got 3). The same probe with `onRefresh={refresh}` (the pre-fix wiring) passes.
- Condition: a re-read of the なし grid fails (backend restart, Wi-Fi drop), the viewer visits the Calendar or Map with a list open, comes back and presses 再試行, then goes to the Calendar/Map again.
- Frequency 1, impact 1 (one extra `/photos` or point-list request; nothing drawn changes). B.
- Test: the probe above as a row of item 5 ("a retry after a failed re-read on the なし grid does not make the calendar read again"); fix by passing `refresh` (or a re-read-only callback) to `LoadError` and `wrote` only to `FileGrid`.

#### R2-2. No test guards the なし grid's own re-read after its write (B, test gap)

- Claim: the new case (`Library.test.tsx:1234`) asserts only the Calendar side. It does not assert that the なし grid itself reads its `by=all` shelf again on the write.
- Observed: mutation `<AllPhotos onRefresh={() => { seenWrite.current = onWrite(); onRefreshCount(); }}>` (counts the write and the count re-read, drops the grid's own re-read): full suite 823 passed. Adding `expect(allReads()).toBe(all0 + 1)` after `refreshShownGrid()` in the new case catches it (fails) and passes on the real code. This gap predates c88533a (the same mutation on `refresh` would also survive), but c88533a's case is where the assertion belongs.
- Defect it would miss: a trash on the なし grid leaves the photo in the grid until a reload. Frequency 3 (if regressed), impact 5. B.
- Test: two lines in the new case: count `by=all` shelf reads before and after `refreshShownGrid()`, expect +1, and +1 still after Calendar → Library.

### dce39ca (F7)

Checked and holding: mutation "delete `setLibraryTags([])` in `chooseTarget`" (`PhotoDiaryPage.tsx:544`) now fails the new case (`AppParity.test.tsx:1172`, `expected true to be false` on `query().has("tag")`), full suite 1 failed / 822. Restored, 823 pass. The case drives the real tab links and the harness router; the trailing request loop is not vacuous (it runs after `shelvesDrawn(1)`). The Map shares the same `chooseTarget`, so a Calendar-only case covers the code path F7 named. No finding.

### fca2255 (F11)

Checked and holding: e2e `library.spec.ts` 11/11 pass. Mutation "replace `test.use({ hasTouch: true, isMobile: true })` with `test.use({})`" makes the new case fail (`Expected >= 44, Received 38`), so the measure tells the touch height from the desktop one and runs the core's real `pointer-coarse:min-h-11` CSS from the fixture build. It measures all three buttons (tag too), more than library.md:351 names. Faithfulness: library.md:350-351 says "at 375px ... at least 44px tall" with no pointer condition, while DESIGN.md:1193 sets "44px on a coarse pointer, 32px on a fine one" and the core menus follow it; a desktop window at 375px draws 38px. The touch-emulated check is the design system's rule, not a weaker measure of it; the literal library.md wording is stale and app-parity.md's Revises does not list it (already F11's note). Not counted: a spec wording matter for the human, no behaviour defect.

## Commands

- `NO_COLOR=1 pnpm exec vitest run src/addons/photo_diary`: 823 passed (baseline and after every restore).
- `pnpm exec tsc --noEmit`: clean.
- `pnpm exec playwright test -c ../addons/photo_diary/e2e/playwright.config.ts library.spec.ts`: 11 passed.
- Addon `git status --short`: clean at the end; all mutations and probes restored with `git checkout -- <file>`.

TOTAL: 2 findings
