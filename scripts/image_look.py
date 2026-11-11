#!/usr/bin/env python3
"""What scripts/images.mjs can't do in Node. Pillow does the work.

    python3 scripts/image_look.py scan <folder>
        One JSON line per picture: file, sha, a visual hash for spotting near-copies, size.
    python3 scripts/image_look.py sheet <out.webp> <file>...
        The pictures small and numbered on one sheet, so a look costs one small image.
"""
import hashlib
import json
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageOps
except ImportError:
    print("image_look: Pillow is not installed\n  Try: python3 -m pip install pillow", file=sys.stderr)
    sys.exit(1)

Image.MAX_IMAGE_PIXELS = None
CELL = 340
COLUMNS = 3


def visual_hash(im):
    small = ImageOps.exif_transpose(im).convert("L").resize((9, 8))
    px = list(small.getdata())
    bits = "".join("1" if px[r * 9 + c] > px[r * 9 + c + 1] else "0" for r in range(8) for c in range(8))
    return "%016x" % int(bits, 2)


def scan(folder):
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if not os.path.isfile(path) or name.lower().endswith(".svg"):
            continue
        try:
            with open(path, "rb") as f:
                sha = hashlib.sha256(f.read()).hexdigest()[:16]
            with Image.open(path) as im:
                im.load()
                print(json.dumps({"file": name, "sha": sha, "look": visual_hash(im), "width": im.width, "height": im.height}))
        except Exception as e:  # a file the crawl saved that isn't a picture costs only itself
            print("image_look: skipped %s: %s" % (name, str(e)[:80]), file=sys.stderr)


def sheet(out, files):
    rows = (len(files) + COLUMNS - 1) // COLUMNS
    page = Image.new("RGB", (COLUMNS * CELL, rows * CELL), "white")
    pen = ImageDraw.Draw(page)
    for i, path in enumerate(files):
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((CELL - 8, CELL - 8))
            x, y = (i % COLUMNS) * CELL + 4, (i // COLUMNS) * CELL + 4
            page.paste(im, (x, y))
        pen.rectangle((x, y, x + 34, y + 24), fill="black")
        pen.text((x + 8, y + 6), str(i + 1), fill="white")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    page.save(out, "WEBP", quality=72)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "scan":
        scan(sys.argv[2])
    elif len(sys.argv) >= 4 and sys.argv[1] == "sheet":
        sheet(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
