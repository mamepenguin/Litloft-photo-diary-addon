# Photo Diary

An addon for [Litloft](https://github.com/mamepenguin/Litloft) that shows the photos of the current drive in two ways: on a month calendar and on a map.

- **Calendar.** Days with photos show their count. Pressing a day lists its photos. Photos without a capture date are listed under "No capture date". Every day can be pressed, and a **Today** control goes to the current date.
- **Notes.** A day can have one short Markdown note, shown above its photos in the day's panel and marked in the calendar. See [Daily notes](#daily-notes).
- **Map.** Photos with a GPS position are drawn as points that merge and split as you zoom. Clicking a point lists the photos it stands for, one section per capture date. A section heading links to that day in the calendar.

Photos are placed by the capture date and GPS position the core already stores for each image. The addon owns no table, and its backend writes nothing. Notes are created and restored by the page through the core's public API. It is drive-scoped: it reads one drive at a time, and only drives the viewer may open and whose addon policy allows it.

## Daily notes

A note is an ordinary Markdown file in the core, stored at `Photo Diary/YYYY-MM-DD.md` at the root of the drive. The date comes only from the file name, and only that exact path counts: the same name in another folder or a subfolder, `2026-11-01 (1).md`, `.txt`, `.MD`, or a date that does not exist, is not a note.

- **Writing.** In a day's panel, **Write a note** creates the empty file (and the `Photo Diary` folder, if it is absent) and opens the core's editor, which needs the knowledge addon installed with its `editor` policy on for the drive. Without it the panel offers no way to write, and existing notes are still shown. A file is created only when the button is pressed, so drives where nobody writes are not touched.
- **Marks.** A day has a mark once its note has text. A started note nobody wrote in (0 bytes) has none, and the panel offers to write in it. A note moved to the trash says so and offers **Restore**.
- **Renaming or moving a note** in the core, including through the title in the editor, makes it stop being one: the date goes back to having no note.
- **A file put at a note path outside the app** appears after the drive is scanned. If one already sits there when **Write a note** is pressed, the panel asks for a rescan and overwrites nothing.
- **Frontmatter and wiki links.** Frontmatter is not shown in the panel, and a wiki link is plain text there. Both work in the editor.
- A note is a file like any other: it shows in the folder tree, search and tags, and is handled by the intelligence addon and cloud sync under the drive's own policies.

## Install

The addon is not part of a fresh Litloft clone. Clone it into the core's `addons/` directory and rebuild:

```bash
git clone https://github.com/mamepenguin/Litloft-photo-diary-addon addons/photo_diary
docker compose up -d --build
```

A **Photo Diary** row then appears in the sidebar of drives where the addon policy allows it. The page is at `/drive/{drive}/addons/photo_diary`.

## Update

```bash
git -C addons/photo_diary pull
docker compose up -d --build
```

If the build fails, the running version is kept.

## Map tiles

The browser requests map tiles directly from a tile server while a map is on screen. By default that is the OpenStreetMap server (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) with its attribution. A tile request carries only the zoom and tile numbers, so the server learns which area is being viewed and never receives a photo's coordinates, id or name. It also sees the client's IP address and user agent, and a `Referer` of at most the page's origin. The backend never contacts the tile server.

To use another server, set these under the backend's `environment` in `docker-compose.override.yml`, then restart the backend:

```yaml
services:
  backend:
    environment:
      PHOTO_DIARY_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png"
      PHOTO_DIARY_TILE_ATTRIBUTION: '<a href="https://example.com/copyright">Example contributors</a>'
```

- An unset or empty `PHOTO_DIARY_TILE_URL` means the default URL and the default attribution.
- A set URL with no `PHOTO_DIARY_TILE_ATTRIBUTION` shows no attribution.
- The attribution is an HTML fragment, drawn the way MapLibre draws attribution.
- Tiles are expected to be raster, 256 pixels, up to zoom 19. A server that stops earlier shows a "Map tiles could not be loaded" notice when the viewer zooms past its limit.

The default server is a volunteer service with a usage policy that requires attribution and forbids heavy use.

## Limits

- HEIC photos need a core at `370bb4a` or later to have a capture date and place. Photos already in the library fill in on the next scan.
- The calendar and the map are built per request, with no cache. They are sized for up to 50,000 photos and some thousands of notes on a drive.
- The date shown is the one the camera's clock wrote, with no time zone conversion.
- A drive is a security boundary, so photos from different drives are never merged.

## If a core change breaks the addon

The addon imports the core's models and components directly, so a core refactor can break it.

- **Frontend.** `docker compose up -d --build` fails and the running version is kept.
- **Backend.** The core logs the import error and skips the addon; the rest of Litloft runs.

To recover, either move the addon away and rebuild:

```bash
mv addons/photo_diary ../photo_diary.disabled
docker compose up -d --build
```

or check out the last core commit this addon's CI passed on, and rebuild.

## Development

`Dockerfile.test` and the CI workflow expect this repository at `addons/photo_diary` inside a core checkout.

```bash
# backend tests, from the core's root
docker build -f addons/photo_diary/Dockerfile.test -t photo-diary-test .
docker run --rm photo-diary-test

# frontend tests, from the core's root and then its frontend/
./setup-addons.sh
cd frontend
pnpm exec vitest run src/addons/photo_diary
pnpm exec tsc --noEmit
pnpm exec playwright test -c ../addons/photo_diary/e2e/playwright.config.ts
```

The map library is MapLibre GL JS, committed under `backend/assets/` at a pinned version and served by the addon. It is loaded in the browser when a map is created, so the core's frontend build does not need it.
