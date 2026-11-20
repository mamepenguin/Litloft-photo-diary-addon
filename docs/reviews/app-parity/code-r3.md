# Photo Diary app-parity code review r3: 36a37d7 (R2-1 fix) on its own

Range: `HEAD~1..HEAD` = e655fdc..36a37d7 in addons/photo_diary (feature/app-unify).

## What changed

`LibraryFace.tsx:205-206`: `AllPhotos` now receives `onRefresh={refresh}` and `onWrite={wrote}`. Inside `AllPhotos`, the re-read retry `<LoadError onRetry={onRefresh} />` (`:452`) gets the plain re-read and `FileGrid onRefresh={onWrite}` (`:453`) gets the write handler. The retry is back to the pre-c88533a wiring (`refresh`), the grid keeps c88533a's (`wrote`). `Shelves` is untouched (`onRefresh={wrote}`, its retry is `library.retryRefresh`). `onRefresh` has no other use in `AllPhotos`, so nothing else changes behaviour.

## Checks (all observed)

- `NO_COLOR=1 pnpm exec vitest run src/addons/photo_diary`: 18 files, 824 passed.
- `pnpm exec tsc --noEmit`: exit 0.
- M0 (revert the fix, `<LoadError onRetry={onWrite} />`): the new case fails, `expected ... to have a length of 2 but got 3` (one extra `/photos` read on the Calendar). Restored.
- M1 (grid loses the write, `FileGrid onRefresh={onRefresh}`): c88533a's case "a write on the なし grid makes the calendar's open day list read again once" fails. So the grid's context-menu write still counts a write and is guarded. Restored.
- M2 (retry does nothing, `onRetry={() => {}}`): the new case fails (the error notice stays). So the retry still re-reads the grid and the case is not vacuous on that side. Restored.
- Production path: the case drives the real Library tab, the real `LoadError` 再試行 button and the real tab switches; the 500 answer is one-shot, so the retry succeeds through the same `usePagedPhotos` refresh path. Before pressing 再試行 it visits Calendar → Library once, which consumes the earlier real write, so the measured count isolates the retry.
- `git status` clean at the end.

## Not counted

- R2-2 (no assertion that the なし grid itself reads `by=all` again after its write) is untouched by this commit and remains as reported in code-r2.md; not a defect of 36a37d7.

TOTAL: 0 findings
