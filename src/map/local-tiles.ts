import type * as Leaflet from "leaflet";

export interface TileManifest {
    format: "leaflet-local-tiles";
    version: 1;
    width: number;
    height: number;
    tileSize: number;
    maxLevel: number;
    tilePattern: string;
}
export interface LocalTiles {
    manifest: TileManifest;
    urlForTile: (level: number, x: number, y: number) => string;
}
export function validateTileManifest(value: unknown): TileManifest {
    const m = value as TileManifest;
    if (!m || m.format !== "leaflet-local-tiles" || m.version !== 1)
        throw new Error("Unsupported local tile manifest format.");
    for (const key of ["width", "height", "tileSize", "maxLevel"] as const) {
        if (!Number.isSafeInteger(m[key]) || m[key] < (key === "maxLevel" ? 0 : 1))
            throw new Error(`Invalid tile manifest ${key}.`);
    }
    if (m.tileSize > 4096 || m.maxLevel > 30 ||
        m.maxLevel !== Math.max(0, Math.ceil(Math.log2(Math.max(m.width, m.height) / m.tileSize))))
        throw new Error("Tile pyramid dimensions do not match its levels.");
    // Tile paths must stay inside the manifest's directory and use local files.
    if (typeof m.tilePattern !== "string" || /[\\:?\u0000]/.test(m.tilePattern) ||
        m.tilePattern.startsWith("/") || m.tilePattern.split("/").some(p => !p || p === "." || p === "..") ||
        !["{z}", "{x}", "{y}"].every(token => m.tilePattern.includes(token)))
        throw new Error("Invalid local tile path pattern.");
    return m;
}
export type BoundedTileLayer = Leaflet.TileLayer & { getBounds(): Leaflet.LatLngBounds };

/** Match ImageOverlay's CRS.Simple coordinates: full-resolution pixels occur
 * at maxZoom - 1, preserving the marker and drawing machinery. */
export function createLocalTileLayer(
    L: typeof Leaflet, tiles: LocalTiles, bounds: Leaflet.LatLngBounds,
    baseZoom: number, options: Leaflet.TileLayerOptions, onTileError: () => void
): BoundedTileLayer {
    const m = tiles.manifest;
    let reportedError = false;
    class LocalTileLayer extends L.TileLayer {
        getBounds() { return bounds; }
        getTileUrl(coords: Leaflet.Coords) {
            const level = coords.z - baseZoom + m.maxLevel;
            return tiles.urlForTile(level, coords.x, coords.y);
        }
    }
    const layer = new LocalTileLayer("", {
        ...options, tileSize: m.tileSize, bounds, noWrap: true,
        minNativeZoom: baseZoom - m.maxLevel, maxNativeZoom: baseZoom, keepBuffer: 2
    });
    layer.on("tileerror", () => {
        if (!reportedError) { reportedError = true; onTileError(); }
    });
    return layer;
}
