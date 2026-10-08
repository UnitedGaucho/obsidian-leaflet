# Leaflet Local Tiles

Local source fork of javalent/obsidian-leaflet 6.0.5, retaining its MIT license.
The `local-tiles` branch adds offline image pyramids. Nothing has been published
to GitHub. The upstream remote remains available for future maintenance.

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
    powershell -NoProfile -File ./install-local.ps1

The installer backs up an existing fork's build files, preserves its settings,
copies the built plugin and enables its ID for the next vault startup. Restart
Obsidian to load rebuilt code. Original Leaflet remains installed and enabled.

To generate another map from the workspace root (Python requires Pillow):

    python tools/create_leaflet_tiles.py INPUT.png map/radiosol-map/Maps/NAME.leaflet.json

The generator refuses to overwrite an existing pyramid. Use a new NAME to replace
a map safely, then update its note's image link. Generation briefly needs memory
for the full source and a smaller overview; subsequent viewing does not decode
the full source.

## Validation

`tools/check_leaflet_tiles.py` reconstructs an uneven synthetic image and verifies
exact native pixels, alpha, all levels and transparent edge padding.
`node check-tiles.cjs` exercises the production loader and tile layer in headless
Edge against the actual full map: all native dimensions, multiple zoom levels,
both far edges, marker alignment, invalid metadata rejection, no whole-image
decode, and no HTTP requests. Output: `tools/leaflet-check/result.json` and preview.
This does not replace the final live integration check in Obsidian.
The upstream standalone TypeScript check has unresolved sibling-project imports
and existing type errors; the production webpack build and runtime checks are
the validation used here. Diagnostics are in `tools/leaflet-check/typescript.log`.

## Restore

Disable Leaflet Local Tiles in Obsidian. The original `Map.md` uses the original
Leaflet and is unchanged. Keep the tiles and test note if you may want to retry.
