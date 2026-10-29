#!/usr/bin/env python3
"""Generate the independent, high-contrast ten-level pixel-art route."""

import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "public/levels/0000-0099"
OUT = ROOT / "public/levels/new"

# Distinct hue or value for every frequently paired colour. Avoid near-neighbour
# combinations such as light pink/red and pale cyan/green in the small levels.
COLORS = {
    "R": "#ec3b32",  # red
    "Y": "#ffda27",  # yellow
    "G": "#22a84f",  # green
    "C": "#00bbce",  # cyan
    "B": "#3455d5",  # blue
    "P": "#993dbb",  # purple
    "W": "#fff9eb",  # ivory
    "K": "#26283c",  # charcoal
    "O": "#f47c24",  # orange
    "M": "#e94fa0",  # magenta
    "D": "#136d62",  # dark teal
}
COLOR_IDS = {letter: 7101 + index for index, letter in enumerate(COLORS)}

# The original first two levels retain their dimensions, colour totals, cannon
# order/ammo, speed, and board rules; only their art and palette are replaced.
FIRST_PALETTES = {
    1: {7011: "R", 7004: "K", 7027: "Y", 7014: "G", 7008: "W"},
    2: {7013: "B", 7008: "W", 7026: "C", 7039: "P", 7021: "Y",
        7028: "G", 7011: "R", 7007: "O", 7033: "K", 7030: "M", 7006: "D"},
}


def shade(color, amount):
    rgb = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    values = [round(v + (255 - v) * amount) if amount >= 0 else round(v * (1 + amount)) for v in rgb]
    return "#" + "".join(f"{v:02x}" for v in values)


def palette_for(ids):
    return {str(color_id): {"fill": COLORS[letter], "light": shade(COLORS[letter], .19),
                            "dark": shade(COLORS[letter], -.39)} for color_id, letter in ids.items()}


def new_canvas(width=32, height=32):
    image = Image.new("P", (width, height), 0)
    return image, ImageDraw.Draw(image)


def paper_plane():
    image, d = new_canvas(34, 34)
    d.ellipse((1, 1, 32, 32), fill=1)
    d.polygon([(3, 17), (30, 5), (23, 29), (17, 22), (9, 26)], fill=2)
    d.polygon([(5, 17), (27, 7), (17, 20)], fill=3)
    d.polygon([(17, 21), (27, 7), (22, 26)], fill=4)
    d.line([(6, 27), (10, 29), (14, 29)], fill=5, width=2)
    d.line([(3, 30), (6, 31)], fill=5, width=1)
    d.polygon([(8, 17), (24, 9), (17, 18)], fill=5)
    return image, "纸飞机", {1: 7011, 2: 7004, 3: 7027, 4: 7014, 5: 7008}


def kaleidoscope():
    image, d = new_canvas(38, 52)
    d.ellipse((1, 5, 36, 46), fill=1)
    center = (19, 26)
    import math
    wedges = [2, 3, 4, 5, 6, 7, 8, 2, 3, 4, 5, 6]
    for i, label in enumerate(wedges):
        a = 2 * math.pi * i / len(wedges) - math.pi / 2
        b = 2 * math.pi * (i + 1) / len(wedges) - math.pi / 2
        points = [center, (round(19 + 17 * math.cos(a)), round(26 + 19 * math.sin(a))),
                  (round(19 + 17 * math.cos(b)), round(26 + 19 * math.sin(b)))]
        d.polygon(points, fill=label)
    d.ellipse((8, 14, 29, 37), outline=9, width=2)
    d.ellipse((12, 19, 25, 32), fill=10)
    d.polygon([(19, 20), (21, 25), (26, 26), (21, 28), (19, 33),
               (17, 28), (12, 26), (17, 25)], fill=11)
    d.ellipse((17, 24, 21, 28), fill=7)
    return image, "万花筒", {1: 7013, 2: 7008, 3: 7026, 4: 7039,
                            5: 7021, 6: 7028, 7: 7011, 8: 7007,
                            9: 7033, 10: 7030, 11: 7006}


def fit_occupancy(image, total):
    """Keep the silhouette while matching the old level's exact block count."""
    width, height = image.size
    pixels = image.load()
    occupied = [(x, y) for y in range(height) for x in range(width) if pixels[x, y]]
    if len(occupied) > total:
        candidates = sorted(occupied, key=lambda p: (pixels[p] != 1,
                            -((p[0] - width / 2) ** 2 + (p[1] - height / 2) ** 2)))
        for x, y in candidates[:len(occupied) - total]:
            pixels[x, y] = 0
    elif len(occupied) < total:
        empty = [(x, y) for y in range(height) for x in range(width) if not pixels[x, y]]
        empty.sort(key=lambda p: ((p[0] - width / 2) ** 2 + (p[1] - height / 2) ** 2))
        for x, y in empty[:total - len(occupied)]:
            pixels[x, y] = 1


def exact_colours(image, targets, labels):
    """Grow or shrink painted colour regions to the old exact ammo totals."""
    width, height = image.size
    pixels = image.load()
    positions = [(x, y) for y in range(height) for x in range(width) if pixels[x, y]]
    references = {label: [(x, y) for x, y in positions if pixels[x, y] == label]
                  for label in labels if label != 1}
    remaining = set(positions)
    assigned = {}
    for label, color_id in sorted(((label, color_id) for label, color_id in labels.items() if label != 1),
                                  key=lambda item: targets[item[1]]):
        points = references[label]
        if not points:
            continue
        cx = sum(x for x, _ in points) / len(points)
        cy = sum(y for _, y in points) / len(points)
        ordered = sorted(remaining, key=lambda p: (
            min(abs(p[0] - q[0]) + abs(p[1] - q[1]) for q in points),
            (p[0] - cx) ** 2 + (p[1] - cy) ** 2))
        for point in ordered[:targets[color_id]]:
            assigned[point] = color_id
            remaining.remove(point)
    for point in remaining:
        assigned[point] = labels[1]
    return [[assigned.get((x, y), 0) for x in range(width)] for y in range(height)]


def angular_colours(image, targets):
    """Give the eleven-colour kaleidoscope crisp, uninterrupted wedges."""
    import math
    width, height = image.size
    positions = [(x, y) for y in range(height) for x in range(width) if image.getpixel((x, y))]
    cx, cy = (width - 1) / 2, (height - 1) / 2
    center_id = 7033
    core = set(sorted(positions, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)[:targets[center_id]])
    wedges = [7008, 7011, 7026, 7039, 7021, 7013, 7028, 7007, 7030, 7006]
    around = sorted((p for p in positions if p not in core),
                    key=lambda p: (math.atan2(p[1] - cy, p[0] - cx) + math.pi / 2) % (2 * math.pi))
    assigned = {p: center_id for p in core}
    offset = 0
    for color_id in wedges:
        for point in around[offset:offset + targets[color_id]]:
            assigned[point] = color_id
        offset += targets[color_id]
    return [[assigned.get((x, y), 0) for x in range(width)] for y in range(height)]


def first_level(number, painter):
    original = json.loads((ORIGINAL / f"level-{number:04d}.json").read_text(encoding="utf-8"))
    image, name, labels = painter()
    targets = Counter(color for row in original["cells"] for color in row if color)
    fit_occupancy(image, sum(targets.values()))
    cells = exact_colours(image, targets, labels) if number == 1 else angular_colours(image, targets)
    return {"id": original["id"], "format": 2, "name": name,
            "difficulty": "original-equivalent", "rows": original["rows"], "cols": original["cols"],
            "speedScale": original["speedScale"], "board": original["board"],
            "palette": palette_for(FIRST_PALETTES[number]),
            "cannons": original["cannons"], "cells": cells}


def lighthouse():
    image, d = new_canvas()
    d.polygon([(12, 8), (20, 8), (24, 29), (8, 29)], fill=1)
    d.rectangle((10, 12, 22, 15), fill=2)
    d.rectangle((10, 20, 22, 23), fill=2)
    d.polygon([(11, 7), (16, 3), (21, 7)], fill=2)
    d.rectangle((12, 8, 20, 12), fill=3)
    d.rectangle((15, 23, 17, 29), fill=3)
    d.line((3, 10, 10, 11), fill=4, width=2)
    d.line((22, 11, 29, 10), fill=4, width=2)
    return image, "灯塔", "RKYW"


def music_note():
    image, d = new_canvas()
    d.polygon([(13, 7), (25, 3), (25, 8), (13, 12)], fill=1)
    d.rectangle((12, 10, 15, 23), fill=1)
    d.rectangle((23, 7, 26, 19), fill=1)
    d.ellipse((5, 20, 15, 27), fill=2)
    d.ellipse((16, 17, 26, 24), fill=3)
    d.line((5, 7, 9, 5), fill=4, width=2)
    d.line((7, 11, 10, 10), fill=4, width=2)
    return image, "音符", "KBYW"


def feather():
    image, d = new_canvas()
    d.ellipse((8, 2, 24, 25), fill=1)
    d.ellipse((10, 5, 22, 22), fill=2)
    d.ellipse((12, 8, 20, 19), fill=3)
    d.ellipse((14, 11, 18, 16), fill=4)
    d.line((16, 15, 16, 30), fill=5, width=2)
    d.line((16, 24, 10, 28), fill=6, width=2)
    d.line((16, 24, 22, 27), fill=6, width=2)
    return image, "羽饰", "PGBYKR"


def compass():
    image, d = new_canvas()
    d.ellipse((4, 4, 27, 27), fill=1)
    d.ellipse((7, 7, 24, 24), fill=2)
    d.polygon([(16, 3), (20, 16), (16, 29), (12, 16)], fill=3)
    d.polygon([(3, 16), (16, 12), (29, 16), (16, 20)], fill=4)
    d.ellipse((13, 13, 19, 19), fill=5)
    return image, "指南针", "KWB RY".replace(" ", "")


def kite():
    image, d = new_canvas()
    d.polygon([(16, 2), (28, 13), (16, 23), (4, 13)], fill=1)
    d.polygon([(16, 4), (26, 13), (16, 13)], fill=2)
    d.polygon([(16, 4), (6, 13), (16, 13)], fill=3)
    d.polygon([(16, 13), (26, 13), (16, 21)], fill=4)
    d.line((16, 23, 17, 28, 13, 30), fill=5, width=2)
    d.polygon([(10, 26), (13, 27), (10, 29)], fill=5)
    return image, "风筝", "KYGBC"


def sailboat():
    image, d = new_canvas()
    d.polygon([(6, 23), (28, 23), (24, 28), (10, 28)], fill=1)
    d.line((17, 5, 17, 23), fill=2, width=2)
    d.polygon([(15, 6), (15, 21), (4, 21)], fill=3)
    d.polygon([(19, 7), (19, 21), (27, 21)], fill=4)
    d.line((2, 29, 30, 29), fill=5, width=2)
    return image, "帆船", "KWRYB"


def key():
    image, d = new_canvas()
    d.ellipse((4, 3, 21, 20), fill=1)
    d.ellipse((9, 8, 16, 15), fill=0)
    d.line((18, 17, 27, 26), fill=2, width=5)
    d.rectangle((25, 23, 29, 28), fill=3)
    d.rectangle((21, 25, 24, 29), fill=3)
    d.line((6, 6, 10, 4), fill=4, width=2)
    return image, "钥匙", "YKBW"


def ferris_wheel():
    image, d = new_canvas()
    d.ellipse((4, 3, 27, 26), outline=1, width=2)
    d.line((16, 5, 16, 24), fill=2, width=2)
    d.line((6, 15, 26, 15), fill=2, width=2)
    d.line((9, 8, 23, 22), fill=3, width=2)
    d.line((23, 8, 9, 22), fill=3, width=2)
    for x, y, label in [(16, 3, 4), (27, 15, 5), (16, 26, 4), (4, 15, 5), (8, 7, 6), (24, 7, 6)]:
        d.rectangle((x - 2, y, x + 2, y + 3), fill=label)
    d.line((16, 18, 9, 30), fill=2, width=2)
    d.line((16, 18, 23, 30), fill=2, width=2)
    d.rectangle((7, 29, 25, 30), fill=2)
    return image, "摩天轮", "KWB YGR".replace(" ", "")


SMALL_LEVELS = {3: lighthouse, 4: music_note, 5: feather, 6: compass,
                7: kite, 8: sailboat, 9: key, 10: ferris_wheel}


def small_level(number, painter):
    image, name, color_order = painter()
    art = ["".join("." if image.getpixel((x, y)) == 0 else color_order[image.getpixel((x, y)) - 1]
                   for x in range(32)) for y in range(32)]
    counts = Counter("".join(art).replace(".", ""))
    ids = {COLOR_IDS[letter]: letter for letter in counts}
    return {"id": f"level-{number:04d}", "format": 2, "name": name,
            "difficulty": "gentle-peak" if number in (5, 10) else "easy",
            "rows": 32, "cols": 32, "speedScale": 1.2,
            "board": {"wall": False, "minOpeningCells": 2},
            "palette": palette_for(ids),
            "cannons": [[{"color": COLOR_IDS[letter], "ammo": counts[letter]}]
                        for letter in color_order if letter in counts],
            "cells": [[COLOR_IDS[letter] if letter != "." else 0 for letter in row] for row in art]}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for number in range(1, 11):
        level = first_level(number, paper_plane if number == 1 else kaleidoscope) if number <= 2 \
            else small_level(number, SMALL_LEVELS[number])
        path = OUT / f"level-{number:04d}.json"
        path.write_text(json.dumps(level, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        entries.append({"id": level["id"], "number": number,
                        "path": f"levels/new/{path.name}", "rows": level["rows"], "cols": level["cols"]})
    (OUT / "manifest.json").write_text(json.dumps({"version": 1, "levels": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
