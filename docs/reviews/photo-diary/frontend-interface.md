# Frontend interface

The module names and signatures the frontend tests and the implementation share. It says nothing
about how they work; `docs/specs/photo-diary.md` is the standard for behaviour. All paths are under
`frontend/`, reached in core's vitest as `src/addons/photo_diary/` and importing core modules as `@/`.

## `api.ts`

    fetchMonths(drive): Promise<{months: {month: string, count: number}[], undated_count: number}>
    fetchDays(drive, month): Promise<{days: {date: string, count: number}[]}>
    fetchPhotos(drive, {date?: string, undated?: boolean, limit?: number, offset?: number}):
      Promise<{file_ids: string[], total: number}>
    fetchPoints(drive): Promise<{points: Point[]}>
    fetchMapConfig(drive): Promise<{tile_url: string, attribution: string}>
    class ApiError extends Error { status: number }

`Point` is `{file_id: string, lat: number, lon: number, taken_at: string | null}`.
Every call sends `X-Lit-Drive: encodeURIComponent(drive)` and rejects with `ApiError` on a non-2xx.

## `lib/dates.ts`

    monthGrid(month: "YYYY-MM"): (number | null)[]   // Sunday first; null pads before day 1
    formatListDate(date: "YYYY-MM-DD", locale: string): string
    formatMonth(month: "YYYY-MM", locale: string): string

## `lib/sections.ts`

    groupSections(points: Point[], onlyIds?: string[]):
      {date: string | null, count: number, fileIds: string[]}[]

`date` is null for the undated section. `onlyIds` restricts the result to those ids.

## `lib/pageUrl.ts`

    parsePageUrl(search: string): {view: "calendar" | "map", month: string | null,
      date: string | null, undated: boolean}

The rows of the spec's Page URL table that need no server data. `date` wins over `month` and
`undated`; `month` is then the month of `date`. Which month to show when both are null needs
`/calendar/months` and is the page's job.

## `lib/savedState.ts`

    saveState(drive: string, state: SavedState): void   // never throws
    loadState(drive: string): SavedState | null
    clearState(drive: string): void

`SavedState` is `{center?: [number, number], zoom?: number, pointIds?: string[],
list?: {loaded: number, scrollY: number}}`.

## `PhotoDiaryPage.tsx`

The default export of `Page.tsx`. Tests render it with `./api`, `@/lib/api` (`batchGetFiles`),
`@/components/FileGrid`, `@/components/CurrentDriveProvider`, `next/navigation` and `./map/createPhotoMap`
mocked. Accessible names are the spec's strings: tabs カレンダー / 地図 (Calendar / Map), buttons
前の月 / 次の月 / 月を選ぶ / 閉じる, and each day button is named `10月11日 27枚` in `ja`.

## `map/createPhotoMap.ts`

    createPhotoMap(container: HTMLElement, options: {
      points: Point[], tileUrl: string, attribution: string,
      center?: [number, number], zoom?: number,
      selected?: string[],
      onPointClick: (fileIds: string[]) => void,
      onPointError: (error: Error) => void,
      onTileFailureChange: (failing: boolean) => void,
      onViewChange: (center: [number, number], zoom: number) => void,
    }): Promise<{
      setPoints(points: Point[]): void,
      setSelected(ids: string[] | null): void,
      destroy(): void,
    }>

`selected` and `setSelected` are the photo ids of the open list. The map draws in `--accent` each
point that stands only for photos among them, at whatever zoom it is drawn, and no other.

Rejects with `WebGLUnavailableError` when WebGL is unavailable, and with another error when the
library fails to load. It loads MapLibre from `/api/addons/photo_diary/assets/` at call time.

## `e2e/`

`e2e/playwright.config.ts` runs Chromium against a static server rooted at `e2e/fixture/`.
`e2e/fixture/entry.ts` imports `createPhotoMap` and exposes it as `window.createPhotoMap`; it is
bundled by `e2e/build-fixture.mjs`. Tests answer `/api/addons/photo_diary/assets/*` from
`backend/assets/` and tile requests with `page.route`.

- `createPhotoMap`'s `onPointError` is called as `(error, retry)`, where `retry` reads the same point's
  members again; without it the page's "list opens with the load error and a retry" has nothing to retry.
