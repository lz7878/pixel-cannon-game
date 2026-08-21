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
LEVEL_FILE_PATTERN = re.compile(r"^level-(\d+)\.json$")
LEVEL_ID_PATTERN = re.compile(r"^level-(\d+)$")
VALID_CELL_PATTERN = re.compile(r"^[.A-Z]+$")


def fail(message: str) -> None:
    raise ValueError(message)


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
    paths = sorted(path for path in LEVELS_ROOT.rglob("level-*.json") if path.name != "manifest.json")
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
    print(f"已校验 {len(levels)} 关，并生成 {MANIFEST_PATH.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
