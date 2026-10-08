"""Create an offline lossless PNG pyramid for Leaflet Local Tiles.

Tiles live in a hidden vault directory so Obsidian doesn't index thousands of
attachments. The small visible manifest is what the map note links to.
"""
import argparse
import gc
import hashlib
import json
import math
from pathlib import Path

from PIL import Image


def create_tiles(source: Path, output: Path, tile_size: int = 512):
    if tile_size < 64 or tile_size > 4096 or tile_size & (tile_size - 1):
        raise ValueError("Tile size must be a power of two from 64 to 4096.")
    if output.exists():
        raise FileExistsError(f"Manifest already exists: {output}")
    tile_folder = output.parent / ("." + output.name.removesuffix(".leaflet.json") + "-tiles")
    if tile_folder.exists():
        raise FileExistsError(f"Tile folder already exists: {tile_folder}")
    output.parent.mkdir(parents=True, exist_ok=True)
    # The known local map is intentionally larger than Pillow's generic limit.
    Image.MAX_IMAGE_PIXELS = None
    with source.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    image = Image.open(source)
    width, height = image.size
    if image.mode not in ("RGB", "RGBA"):
        converted = image.convert("RGBA")
        image.close()
        image = converted
    image.load()
    max_level = max(0, math.ceil(math.log2(max(width, height) / tile_size)))
    total = 0
    try:
        for level in range(max_level, -1, -1):
            level_dir = tile_folder / str(level)
            level_dir.mkdir(parents=True)
            columns = math.ceil(image.width / tile_size)
            rows = math.ceil(image.height / tile_size)
            for y in range(rows):
                for x in range(columns):
                    # Fixed-size padding keeps narrow edge tiles from stretching.
                    tile = Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))
                    piece = image.crop((x * tile_size, y * tile_size,
                                        min((x + 1) * tile_size, image.width),
                                        min((y + 1) * tile_size, image.height)))
                    tile.paste(piece, (0, 0))
                    tile.save(level_dir / f"{x}_{y}.png", compress_level=6)
                    piece.close()
                    tile.close()
                    total += 1
            print(f"Level {level}: {image.width} x {image.height}; {columns * rows} tiles", flush=True)
            if level:
                smaller = image.resize((math.ceil(image.width / 2), math.ceil(image.height / 2)), Image.Resampling.LANCZOS)
                image.close()
                image = smaller
                gc.collect()
    finally:
        image.close()
    manifest = dict(format="leaflet-local-tiles", version=1, width=width, height=height,
                    tileSize=tile_size, maxLevel=max_level,
                    tilePattern=f"{tile_folder.name}/{{z}}/{{x}}_{{y}}.png",
                    sourceName=source.name, sourceSHA256=digest, tileCount=total)
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Created {total} tiles. Manifest: {output}", flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tile-size", type=int, default=512)
    args = parser.parse_args()
    create_tiles(args.source, args.output, args.tile_size)
