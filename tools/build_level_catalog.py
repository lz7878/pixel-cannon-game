#!/usr/bin/env python3
"""Validate static level JSON files and generate their runtime manifest."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
LEVELS_ROOT = PROJECT_ROOT / "public" / "levels"
MANIFEST_PATH = LEVELS_ROOT / "manifest.json"
NEW_MANIFEST_PATH = LEVELS_ROOT / "new" / "manifest.json"
LEVEL_FILE_PATTERN = re.compile(r"^level-(\d+)\.json$")
LEVEL_ID_PATTERN = re.compile(r"^level-(\d+)$")
VALID_CELL_PATTERN = re.compile(r"^[.A-Z]+$")


def fail(message: str) -> None:
    raise ValueError(message)


def validate_original_level(level: dict, path: Path) -> tuple[int, int]:
    """校验从 taxi-pick 导入的原包关卡（cells + cannons）。"""
    rows = level.get("rows")
    cols = level.get("cols")
    cells = level.get("cells")
    if not isinstance(rows, int) or not isinstance(cols, int) or rows <= 0 or cols <= 0:
        fail(f"{path}: rows/cols 必须是正整数")
    if not isinstance(cells, list) or len(cells) != rows:
        fail(f"{path}: cells 行数必须等于 rows")
    counts: Counter[str] = Counter()
    for index, row in enumerate(cells):
        if not isinstance(row, list) or len(row) != cols:
            fail(f"{path}: cells[{index}] 列数必须等于 cols")
        for col, value in enumerate(row):
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                fail(f"{path}: cells[{index}][{col}] 必须是非负整数色号")
            if value:
                counts[str(value)] += 1
    if not counts:
        fail(f"{path}: cells 至少需要一个色块")

    palette = level.get("palette")
    if not isinstance(palette, dict):
        fail(f"{path}: palette 必须是对象")
    missing = sorted(set(counts) - set(palette))
    if missing:
        fail(f"{path}: palette 缺少色号 {', '.join(missing)}")
    for key, shade in palette.items():
        if not isinstance(shade, dict) or not {"fill", "light", "dark"} <= set(shade):
            fail(f"{path}: palette[{key}] 必须包含 fill/light/dark")

    cannons = level.get("cannons")
    if not isinstance(cannons, list) or not cannons:
        fail(f"{path}: cannons 必须是非空二维数组")
    supplied: Counter[str] = Counter()
    for lane_index, lane in enumerate(cannons):
        if not isinstance(lane, list) or not lane:
            fail(f"{path}: cannons[{lane_index}] 必须是非空数组")
        for cannon_index, cannon in enumerate(lane):
            if not isinstance(cannon, dict):
                fail(f"{path}: cannons[{lane_index}][{cannon_index}] 必须是对象")
            color = cannon.get("color")
            ammo = cannon.get("ammo")
            if not isinstance(color, int) or isinstance(color, bool) or str(color) not in palette:
                fail(f"{path}: cannons[{lane_index}][{cannon_index}] 色号 {color!r} 不在 palette 中")
            if not isinstance(ammo, int) or isinstance(ammo, bool) or ammo <= 0:
                fail(f"{path}: cannons[{lane_index}][{cannon_index}] ammo 必须是正整数")
            supplied[str(color)] += ammo
    if supplied != counts:
        details = ", ".join(
            f"{color}: 地图 {counts[color]} / 队列 {supplied[color]}"
            for color in sorted(set(counts) | set(supplied))
            if counts[color] != supplied[color]
        )
        fail(f"{path}: 队列弹药与地图色块数不一致（{details}）")

    board = level.get("board")
    if board is not None and not isinstance(board, dict):
        fail(f"{path}: board 必须是对象")
    return rows, cols


def validate_queue(level: dict, colors: Counter[str], path: Path) -> None:
    queue = level.get("queue")
    queue_art = level.get("queueArt")
    if not isinstance(queue, list) and not isinstance(queue_art, list):
        fail(f"{path}: 必须提供 queue 或 queueArt")
    if not isinstance(queue, list):
        return

    supplied: Counter[str] = Counter()
    for lane_index, lane in enumerate(queue):
        if not isinstance(lane, list):
            fail(f"{path}: queue[{lane_index}] 必须是数组")
        for cannon_index, cannon in enumerate(lane):
            if not isinstance(cannon, dict):
                fail(f"{path}: queue[{lane_index}][{cannon_index}] 必须是对象")
            color = cannon.get("color")
            ammo = cannon.get("ammo")
            if not isinstance(color, str) or len(color) != 1 or color not in colors:
                fail(f"{path}: 非法队列颜色 {color!r}")
            if not isinstance(ammo, int) or ammo <= 0:
                fail(f"{path}: {color} 色 ammo 必须是正整数")
            supplied[color] += ammo

    if supplied != colors:
        details = ", ".join(
            f"{color}: 地图 {colors[color]} / 队列 {supplied[color]}"
            for color in sorted(set(colors) | set(supplied))
            if colors[color] != supplied[color]
        )
        fail(f"{path}: 队列弹药与地图色块数不一致（{details}）")


def validate_level(path: Path) -> dict:
    try:
        level = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{path}: JSON 格式错误：{error}")
    if not isinstance(level, dict):
        fail(f"{path}: 根节点必须是对象")

    matched = LEVEL_FILE_PATTERN.match(path.name)
    if not matched:
        fail(f"{path}: 文件名必须为 level-数字.json")
    level_id = level.get("id")
    if level_id != path.stem or not LEVEL_ID_PATTERN.match(str(level_id)):
        fail(f"{path}: id 必须与文件名一致")

    if isinstance(level.get("cells"), list):
        rows, cols = validate_original_level(level, path)
        return {
            "id": level_id,
            "number": int(matched.group(1)),
            "path": path.relative_to(PROJECT_ROOT / "public").as_posix(),
            "rows": rows,
            "cols": cols,
        }

    art = level.get("art")
    if not isinstance(art, list) or not art or not all(isinstance(row, str) for row in art):
        fail(f"{path}: art 必须是非空字符串数组")
    width = len(art[0])
    if width == 0 or any(len(row) != width for row in art):
        fail(f"{path}: art 的每一行必须等宽")
    if any(not VALID_CELL_PATTERN.fullmatch(row) for row in art):
        fail(f"{path}: art 只能使用 . 和大写颜色字符")

    colors = Counter("".join(art).replace(".", ""))
    if not colors:
        fail(f"{path}: art 至少需要一个色块")
    validate_queue(level, colors, path)

    palette = level.get("palette")
    if palette is not None and not isinstance(palette, dict):
        fail(f"{path}: palette 必须是对象")

    return {
        "id": level_id,
        "number": int(matched.group(1)),
        "path": path.relative_to(PROJECT_ROOT / "public").as_posix(),
        "rows": len(art),
        "cols": width,
    }


def main() -> int:
    paths = sorted(
        path for path in LEVELS_ROOT.rglob("level-*.json")
        if (LEVELS_ROOT / "new") not in path.parents
    )
    if not paths:
        print(f"未找到关卡：{LEVELS_ROOT}", file=sys.stderr)
        return 1

    try:
        levels = [validate_level(path) for path in paths]
    except ValueError as error:
        print(f"关卡校验失败：{error}", file=sys.stderr)
        return 1

    levels.sort(key=lambda level: level["number"])
    numbers = [level["number"] for level in levels]
    if len(numbers) != len(set(numbers)):
        print("关卡校验失败：存在重复关卡编号", file=sys.stderr)
        return 1

    manifest = {"version": 1, "levels": levels}
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    new_paths = sorted((LEVELS_ROOT / "new").glob("level-*.json"))
    if new_paths:
        try:
            new_levels = [validate_level(path) for path in new_paths]
        except ValueError as error:
            print(f"新版关卡校验失败：{error}", file=sys.stderr)
            return 1
        new_levels.sort(key=lambda level: level["number"])
        new_numbers = [level["number"] for level in new_levels]
        if new_numbers != list(range(1, len(new_numbers) + 1)):
            print("新版关卡校验失败：编号必须从 1 连续递增", file=sys.stderr)
            return 1
        NEW_MANIFEST_PATH.write_text(
            json.dumps({"version": 1, "levels": new_levels}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(f"已生成原版 {len(levels)} 关及新版 {len(new_levels) if new_paths else 0} 关的清单")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
