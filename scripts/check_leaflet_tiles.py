"""Verify lossless native tiles and transparent padding with an uneven fixture."""
import tempfile
from pathlib import Path
from PIL import Image
from create_leaflet_tiles import create_tiles

test_root = Path(__file__).resolve().parent.parent / "test-output/python"
test_root.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="leaflet-test-", dir=test_root) as temp:
    root = Path(temp)
    source = root / "source.png"
    original = Image.new("RGBA", (1025, 773))
    original.putdata([(x % 256, y % 256, (x + y) % 256, (x * 3 + y * 5) % 256)
                      for y in range(773) for x in range(1025)])
    original.save(source)
    manifest = create_tiles(source, root / "test.leaflet.json", 512)
    rebuilt = Image.new("RGBA", original.size)
    for level in range(manifest["maxLevel"] + 1):
        files = list((root / ".test-tiles" / str(level)).glob("*.png"))
        assert files
        for file in files:
            x, y = map(int, file.stem.split("_"))
            with Image.open(file) as tile:
                assert tile.size == (512, 512)
                if level == manifest["maxLevel"]:
                    rebuilt.paste(tile, (x * 512, y * 512))
                    if x == 2:
                        assert tile.getpixel((1, 0)) == (0, 0, 0, 0)
    assert rebuilt.tobytes() == original.tobytes(), "Native tiles changed source pixels"
    print("PASS: native pixels, alpha, uneven edges, all zoom levels")
