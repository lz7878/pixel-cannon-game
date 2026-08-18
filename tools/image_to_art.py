#!/usr/bin/env python3
"""Convert a pixel-block reference image into the game's ART array."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw


PALETTE = {
    "K": [(41, 42, 49), (55, 56, 65)],
    "R": [(237, 31, 36), (215, 24, 31)],
    "W": [(246, 246, 243), (225, 225, 225)],
    "G": [(99, 215, 72), (72, 196, 55)],
    "D": [(4, 151, 18), (11, 125, 20)],
    "P": [(254, 126, 255), (254, 112, 255), (240, 112, 240)],
    "M": [(228, 66, 188), (240, 64, 176), (224, 64, 160)],
    # 两种蓝色在原图中是不同的积木填充色，不能共用一个 C 类。
    "C": [(48, 223, 252), (51, 221, 252)],
    "B": [(78, 253, 246), (77, 252, 245)],
    "Y": [(255, 227, 71), (244, 190, 33)],
    "O": [(238, 133, 37), (255, 170, 60)],
}

PREVIEW_COLORS = {
    "K": "#292a31",
    "R": "#ed2024",
    "W": "#ffffff",
    "G": "#63d84b",
    "D": "#079d18",
    "M": "#e442bc",
    "P": "#ff9cff",
    "C": "#30dffc",
    "B": "#4efdf6",
    "Y": "#ffe347",
    "O": "#ee8525",
    ".": "#9a92b8",
}


def parse_box(value: str) -> tuple[int, int, int, int]:
    try:
        box = tuple(int(part.strip()) for part in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("需要四个整数：left,top,right,bottom") from exc
    if len(box) != 4 or box[2] <= box[0] or box[3] <= box[1]:
        raise argparse.ArgumentTypeError("区域格式应为 left,top,right,bottom")
    return box


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    # 人眼对绿色更敏感；加权距离比直接 RGB 距离更稳定。
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    return (2 * dr * dr + 4 * dg * dg + 3 * db * db) ** 0.5


def foreground_pixel(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    red = r > 120 and r > g * 1.45 and r > b * 1.25
    green = g > 65 and g > r * 1.14 and g > b * 1.05
    pink = r > 150 and b > 130 and g < r * .82
    cyan = b > 150 and g > 130 and r < g * .7
    yellow_or_orange = r > 150 and g > 80 and b < g * .65
    dark = max(rgb) < 92
    return red or green or pink or cyan or yellow_or_orange or dark


def auto_bounds(image: Image.Image, cols: int, rows: int) -> tuple[float, float, float, float]:
    pixels = image.load()
    column_hits = [0] * image.width
    row_hits = [0] * image.height
    for y in range(image.height):
        for x in range(image.width):
            if foreground_pixel(pixels[x, y][:3]):
                column_hits[x] += 1
                row_hits[y] += 1

    # 背景中常有压缩噪点或星点。只有一整行/列中出现足够多的前景像素，
    # 才将它视为真正的积木边缘，避免一个噪点把整个网格拉偏。
    min_column_hits = max(6, round(image.height * 0.008))
    min_row_hits = max(6, round(image.width * 0.008))
    active_columns = [x for x, hits in enumerate(column_hits) if hits >= min_column_hits]
    active_rows = [y for y, hits in enumerate(row_hits) if hits >= min_row_hits]
    if not active_columns or not active_rows:
        raise ValueError("没有检测到积木；请使用 --bounds 手动指定网格外框")

    left, right = active_columns[0], active_columns[-1] + 1
    top, bottom = active_rows[0], active_rows[-1] + 1

    # 图片经过非等比缩放，横纵格距不能混用。横向补回积木接缝；纵向
    # 单独计算，并扣掉最底行积木自带的“脚钉”阴影。
    pitch_x = (right - left) / cols
    pad_x = max(0.5, pitch_x * 0.06)
    grid_left = max(0.0, left - pad_x)
    grid_right = min(float(image.width), right + pad_x)

    pitch_y = (bottom - top) / rows
    grid_top = max(0.0, top - pitch_y * 0.03)
    grid_bottom = min(float(image.height), bottom - pitch_y * 0.52)
    return grid_left, grid_top, grid_right, grid_bottom


def border_color(image: Image.Image) -> tuple[int, int, int]:
    band = max(2, min(image.size) // 80)
    samples: list[tuple[int, int, int]] = []
    for y in range(image.height):
        for x in range(image.width):
            if x < band or x >= image.width - band or y < band or y >= image.height - band:
                samples.append(image.getpixel((x, y))[:3])
    return tuple(int(median(channel)) for channel in zip(*samples))


def sample_cell(image: Image.Image, x: float, y: float, pitch_x: float, pitch_y: float) -> tuple[int, int, int]:
    radius_x = max(1, round(pitch_x * 0.16))
    radius_y = max(1, round(pitch_y * 0.16))
    cx, cy = round(x), round(y)
    samples = []
    for py in range(max(0, cy - radius_y), min(image.height, cy + radius_y + 1)):
        for px in range(max(0, cx - radius_x), min(image.width, cx + radius_x + 1)):
            samples.append(image.getpixel((px, py))[:3])
    return tuple(int(median(channel)) for channel in zip(*samples))


def classify(rgb: tuple[int, int, int], background: tuple[int, int, int]) -> tuple[str, float]:
    scores = {
        symbol: min(color_distance(rgb, prototype) for prototype in prototypes)
        for symbol, prototypes in PALETTE.items()
    }
    background_score = color_distance(rgb, background)
    symbol, score = min(scores.items(), key=lambda item: item[1])
    if background_score < score * 0.82 or background_score < 28:
        return ".", background_score
    return symbol, score


def recognize(
    image: Image.Image,
    bounds: tuple[float, float, float, float],
    cols: int,
    rows: int,
) -> tuple[list[str], list[tuple[int, int, float, tuple[int, int, int]]]]:
    left, top, right, bottom = bounds
    pitch_x = (right - left) / cols
    pitch_y = (bottom - top) / rows
    background = border_color(image)
    art: list[str] = []
    uncertain = []

    for row in range(rows):
        symbols = []
        for col in range(cols):
            x = left + (col + 0.5) * pitch_x
            y = top + (row + 0.5) * pitch_y
            rgb = sample_cell(image, x, y, pitch_x, pitch_y)
            symbol, distance = classify(rgb, background)
            symbols.append(symbol)
            if symbol != "." and distance > 105:
                uncertain.append((row, col, distance, rgb))
        art.append("".join(symbols))
    return art, uncertain


def blend(color: tuple[int, int, int], target: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(value * (1 - amount) + target[index] * amount) for index, value in enumerate(color))


def rgb_hex(color: tuple[int, int, int]) -> str:
    return "#" + "".join(f"{channel:02x}" for channel in color)


def derive_palette(
    image: Image.Image,
    bounds: tuple[float, float, float, float],
    art: list[str],
) -> dict[str, dict[str, str]]:
    left, top, right, bottom = bounds
    rows, cols = len(art), len(art[0])
    pitch_x = (right - left) / cols
    pitch_y = (bottom - top) / rows
    samples: dict[str, list[tuple[int, int, int]]] = {symbol: [] for symbol in PALETTE}
    for row, values in enumerate(art):
        for col, symbol in enumerate(values):
            if symbol == ".":
                continue
            x = left + (col + .5) * pitch_x
            y = top + (row + .5) * pitch_y
            samples[symbol].append(sample_cell(image, x, y, pitch_x, pitch_y))

    palette = {}
    for symbol, values in samples.items():
        if not values:
            continue
        fill = tuple(int(median(channel)) for channel in zip(*values))
        palette[symbol] = {
            "fill": rgb_hex(fill),
            "light": rgb_hex(blend(fill, (255, 255, 255), .24)),
            "dark": rgb_hex(blend(fill, (0, 0, 0), .28)),
        }
    return palette


def js_array(art: list[str], variable: str = "ART", indent: str = "  ") -> str:
    rows = ",\n".join(f"{indent}  '{row}'" for row in art)
    return f"{indent}const {variable} = [\n{rows}\n{indent}];"


def apply_to_file(path: Path, art: list[str], variable: str) -> None:
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(rf"(?m)^(?P<indent>[ \t]*)const\s+{re.escape(variable)}\s*=\s*\[[\s\S]*?^[ \t]*\];")
    match = pattern.search(source)
    if not match:
        raise ValueError(f"在 {path} 中找不到 const {variable} = [...]；")
    replacement = js_array(art, variable, match.group("indent"))
    path.write_text(source[: match.start()] + replacement + source[match.end() :], encoding="utf-8")


def save_preview(
    image: Image.Image,
    path: Path,
    bounds: tuple[float, float, float, float],
    art: list[str],
) -> None:
    preview = image.copy().convert("RGBA")
    overlay = Image.new("RGBA", preview.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    left, top, right, bottom = bounds
    rows, cols = len(art), len(art[0])
    pitch_x, pitch_y = (right - left) / cols, (bottom - top) / rows
    for row, values in enumerate(art):
        for col, symbol in enumerate(values):
            x0, y0 = left + col * pitch_x, top + row * pitch_y
            x1, y1 = x0 + pitch_x, y0 + pitch_y
            color = PREVIEW_COLORS[symbol]
            draw.rectangle((x0, y0, x1, y1), outline=color, width=max(1, round(min(pitch_x, pitch_y) * 0.08)))
            if symbol != ".":
                draw.text((x0 + 2, y0 + 1), symbol, fill=color)
    preview = Image.alpha_composite(preview, overlay)
    preview.save(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="从像素积木参考图生成 JavaScript ART 网格")
    parser.add_argument("image", type=Path, help="原始参考图路径")
    parser.add_argument("--cols", type=int, default=34, help="网格列数，默认 34")
    parser.add_argument("--rows", type=int, default=34, help="网格行数，默认 34")
    parser.add_argument("--crop", type=parse_box, help="先裁剪图片：left,top,right,bottom")
    parser.add_argument("--bounds", type=parse_box, help="网格外框：left,top,right,bottom（相对裁剪后的图片）")
    parser.add_argument("--preview", type=Path, help="输出带识别网格的检查图")
    parser.add_argument("--output", type=Path, help="将 ART 写入文本文件；默认打印到终端")
    parser.add_argument("--palette-output", type=Path, help="输出从图片采样得到的 JSON 调色板")
    parser.add_argument("--apply", type=Path, help="直接替换指定 JS 文件中的 ART")
    parser.add_argument("--variable", default="ART", help="JS 变量名，默认 ART")
    args = parser.parse_args()

    if args.cols <= 0 or args.rows <= 0:
        parser.error("--cols 和 --rows 必须大于 0")
    if not args.image.is_file():
        parser.error(f"图片不存在：{args.image}")

    image = Image.open(args.image).convert("RGB")
    if args.crop:
        image = image.crop(args.crop)
    bounds = tuple(float(value) for value in args.bounds) if args.bounds else auto_bounds(image, args.cols, args.rows)
    art, uncertain = recognize(image, bounds, args.cols, args.rows)
    output = js_array(art, args.variable) + "\n"

    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    if args.apply:
        apply_to_file(args.apply, art, args.variable)
        print(f"已更新 {args.apply}", file=sys.stderr)
    if args.preview:
        save_preview(image, args.preview, bounds, art)
        print(f"检查图：{args.preview}", file=sys.stderr)
    if args.palette_output:
        palette = derive_palette(image, bounds, art)
        args.palette_output.write_text(json.dumps(palette, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"调色板：{args.palette_output}", file=sys.stderr)

    counts = {symbol: sum(row.count(symbol) for row in art) for symbol in "." + "".join(PALETTE)}
    print(f"网格：{args.cols}x{args.rows}，点位：{counts}，外框：{tuple(round(v, 1) for v in bounds)}", file=sys.stderr)
    if uncertain:
        examples = ", ".join(f"({r},{c})={rgb}" for r, c, _, rgb in uncertain[:8])
        print(f"提示：{len(uncertain)} 个点颜色置信度较低：{examples}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
