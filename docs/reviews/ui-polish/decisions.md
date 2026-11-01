# ui-polish decisions

## Direction, before the spec

- Design artifact: https://claude.ai/artifact/RG7AAU9Pm6bZyiyuDpeyw1. The user rejected patterns 1 and 2 as out of keeping with the app, and chose pattern 3 for the map, including the tabs at the top right.
- Calendar: compared on the production `photos` drive on 2026-11-01, through a temporary overlay in one browser tab that changed nothing on the server. The user chose no photo at rest with a hover preview, coral, middle strength, no legend.
- Thresholds: measured on production, 581 dated days: 388 with 1 to 2 photos, 137 with 3 to 9, 43 with 10 to 29, 13 with 30 or more.

## At approval, 2026-11-02

- Station names are left out for now. The user decides which text to add to the map after seeing the implementation at street zoom.

## Implementation, 2026-11-02

- Glyphs: Noto Sans Regular, U+0000 to U+2FFF, 48 files of 256 code points, from the versatiles-fonts release 3.0.0 (`noto_sans.tar.gz`). The files were fetched from `tiles.versatiles.org/assets/glyphs/noto_sans_regular/` and are byte-identical to those in the release archive. The version string in the file names is the release's, `3.0.0`. The OFL text is the one in `notofonts/latin-greek-cyrillic`, shipped as `noto-sans-OFL-3.0.0.txt`.
- Size added to `backend/assets`: 3,266,037 bytes (about 3.1 MiB) for the 48 glyph files and the licence together.
- `.pbf` is served as `application/x-protobuf`.
- Placement of 50,000 generated points (Chromium, software GL, zoom 12 over a 0.3 by 0.2 degree area): the first pin is in the document 1.52 to 1.56 seconds after the map is asked for, in three runs, against the 3 second limit. The map holds fewer than 400 pins in that view.
- `setTiles` on the vector source reloads the tiles that loaded and leaves the errored ones as they are, so the tile notice's retry makes the source again.
- Open point for the human: the strip appears when its marker, which sits under the calendar column, reaches the app header; the scroll after a strip press puts the list's heading at the strip's bottom edge. With the column's 24 px gap (and the undated row, when there is one) the marker is then still below the header, so the strip is not shown after that scroll. See the report of the implementation run.
