# Leaflet Local Tiles

Local source fork of javalent/obsidian-leaflet 6.0.5, retaining its MIT license.
The `local-tiles` branch adds offline image pyramids. The upstream remote remains
available for future maintenance; this branch is maintained in the GitHub fork.

Plugin ID: `leaflet-local-tiles`. Code block: `leaflet-local`.
The separate ID, code block, view type and Leaflet global let this plugin coexist
with the original Leaflet. Community updates to the original do not replace it.

## Use

Open `Tiled Map.md` in the radiosol-map vault in Reading view. Wheel to zoom,
drag to pan, and use Leaflet's normal marker controls to link a point to a note.
Screenshots and playable audio are embedded in the linked Obsidian note as usual.
The test map has its own ID and marker storage; existing map markers are not
automatically transferred.

The map note references `Maps/radiosol.leaflet.json`, containing original image
dimensions, pyramid level count, tile size, relative tile path and source hash.
PNG tiles are in `Maps/.radiosol-tiles`. The leading dot prevents Obsidian from
indexing thousands of images. Include this hidden folder when copying the vault.
No HTTP service, account, internet connection or paid hosting is required.

Tiles are generated once. Native-resolution tiles preserve the source's pixels
and alpha exactly; lower zoom levels use downscaled overviews. At default maxZoom
10, zoom 9 displays native pixels and zoom 10 enlarges them twofold. Don't change
maxZoom after adding markers: the original plugin uses it to define image
coordinates, and changing it changes their scale. Explicit `bounds` are currently
unsupported for tiled layers; automatic image bounds preserve the original
plugin's coordinate convention. Ordinary image layers still work.

## Build and install

From this directory:

    npm.cmd ci --ignore-scripts --no-audit --no-fund
    npm.cmd run build
    powershell -NoProfile -File ./install-local.ps1 -VaultPath "../map/radiosol-map"

`-VaultPath` is required and accepts any initialized Obsidian vault. The example
assumes this clone sits beside the RADIOSOL `map` directory. Paths supplied by
the user resolve relative to the calling shell; build files resolve relative to
the installer, so it also works when called from another directory.

The installer backs up an existing fork's build files, preserves its settings,
copies the built plugin and enables its ID for the next vault startup. Restart
Obsidian to load rebuilt code. Original Leaflet remains installed and enabled.

The generator and pixel check are included under `scripts`. They require Python
3.11 or newer and Pillow. From this repository directory:

    python -m pip install -r scripts/requirements-tiles.txt
    python scripts/create_leaflet_tiles.py INPUT.png "../map/radiosol-map/Maps/NAME.leaflet.json"

The generator refuses to overwrite an existing pyramid. Use a new NAME to replace
a map safely, then update its note's image link. Generation briefly needs memory
for the full source and a smaller overview; subsequent viewing does not decode
the full source.

## Validation

`python scripts/check_leaflet_tiles.py` reconstructs an uneven synthetic image and verifies
exact native pixels, alpha, all levels and transparent edge padding.
The browser test exercises the production loader and tile layer against any
generated manifest supplied with `--manifest`: all native dimensions, multiple zoom levels,
both far edges, marker alignment, invalid metadata rejection, no whole-image
decode, and no HTTP requests. Playwright is a locked development dependency.
On Windows the default browser is installed Microsoft Edge. Elsewhere, install
Playwright Chromium once with `npx playwright install chromium`.

    npm run test:tiles -- --manifest "../map/radiosol-map/Maps/radiosol.leaflet.json"

Use `--browser PATH` (or `LEAFLET_BROWSER_PATH`) for another browser executable,
or `--channel msedge` / `--channel chrome` for an installed browser channel.
Use `--output DIR` to choose output storage. The default is the ignored
`test-output/browser` directory inside this repository, containing `result.json`
and `map-preview.png`. Python test artifacts use `test-output/python`.
This does not replace the final live integration check in Obsidian.
The upstream standalone TypeScript check has unresolved sibling-project imports
and existing type errors; the production webpack build and runtime checks are
the validation used here.

## Restore

Disable Leaflet Local Tiles in Obsidian. The original `Map.md` uses the original
Leaflet and is unchanged. Keep the tiles and test note if you may want to retry.
