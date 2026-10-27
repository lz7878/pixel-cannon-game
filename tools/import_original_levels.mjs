#!/usr/bin/env node
/**
 * 把 taxi-pick（原包关卡迁移工程）里的“剧情关”导入成 pixel-cannon 的运行时关卡。
 *
 * 输入（默认 ../../games/taxi-pick，可用 --source 覆盖）：
 *   src/game/drama-levels.source.ts        按游玩关数索引的原始关卡 JSON
 *   src/game/drama-level-resources.source.ts  每关对应的原包资源名
 *   src/game/palette.source.ts             原包 7001–7049 的配色表
 *   assets/original/home/mat/.../Mat_Base/*.lmat  其余色号的材质底色
 *
 * 输出：public/levels/0000-0099/level-XXXX.json
 *   {
 *     id, format: 2, source, rows, cols, speedScale,
 *     board: { wall, minOpeningCells },
 *     palette: { "<色号>": { fill, light, dark } },
 *     cannons: [[{ color, ammo }, ...], ...],
 *     cells: [[色号|0, ...], ...]     // 0 = 空格，行优先、观察者视角
 *   }
 *
 * 关卡数据保持原包数值：颜色号、弹药数、格子分布都不做改写，
 * 只有配色表需要按 pixel-cannon 的“深底座 + 面色 + 高光”三色补出明暗。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = path.resolve(PROJECT, '../games/taxi-pick');
const OUTPUT_ROOT = path.join(PROJECT, 'public', 'levels');
const GRADES_PER_BUCKET = 100;
const EMPTY = 0;
const EMPTY_RID = 7000;

function parseArgs(argv) {
  const options = { source: DEFAULT_SOURCE };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source') options.source = path.resolve(argv[index + 1]);
  }
  return options;
}

/** 读取 "export const X = {...} as const;" 形式的源码数据文件。 */
function loadExportedJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('{', text.indexOf('export const'));
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error(`无法解析数据文件：${file}`);
  return JSON.parse(text.slice(start, end + 1));
}

function loadResourceNames(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function rgbToHex(rgb) {
  return '#' + rgb
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('');
}

function mix(hex, target, amount) {
  return rgbToHex(hexToRgb(hex).map((channel, index) => channel + (target[index] - channel) * amount));
}

/** pixel-cannon 的色块需要 fill/light/dark 三档，原包只有底色。 */
function buildShades(fill) {
  return { fill, light: mix(fill, [255, 255, 255], 0.36), dark: mix(fill, [0, 0, 0], 0.34) };
}

/** 材质底色：Color_Editor_7xxx 的 _BaseTint；Color_<变体>_7xxx_<HEX> 直接用文件名里的 HEX。 */
function readMaterialPalette(materialDir) {
  const palette = new Map();
  if (!fs.existsSync(materialDir)) return palette;
  for (const file of fs.readdirSync(materialDir)) {
    if (!file.endsWith('.lmat')) continue;
    const matched = /^Color_(?:.+_)?(\d{4})(?:_([0-9A-Fa-f]{6}))?\.lmat$/.exec(file);
    if (!matched) continue;
    const rid = matched[1];
    if (matched[2]) {
      palette.set(rid, `#${matched[2].toLowerCase()}`);
      continue;
    }
    let material;
    try {
      material = JSON.parse(fs.readFileSync(path.join(materialDir, file), 'utf8'));
    } catch {
      continue;
    }
    const tint = material?.props?.vectors?.find((vector) => vector.name === '_BaseTint')?.value;
    if (!tint) continue;
    const white = tint[0] > 0.99 && tint[1] > 0.99 && tint[2] > 0.99;
    if (white) continue;
    palette.set(rid, rgbToHex(tint.slice(0, 3).map((channel) => channel * 255)));
  }
  return palette;
}

/** 少数色号在原包素材里没有留下底色，用色号派生出稳定色相，避免同关撞色。 */
function fallbackColor(rid) {
  const hue = (Number(rid) * 47) % 360;
  const convert = (n) => {
    const k = (n + hue / 30) % 12;
    const a = 0.46;
    return 255 * (0.58 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return rgbToHex([convert(0), convert(8), convert(4)]);
}

function normalizeCells(cubeData) {
  const rows = cubeData.length;
  const cols = Math.max(...cubeData.map((row) => row.length));
  const cells = cubeData.map((row) => {
    const line = [];
    for (let col = 0; col < cols; col += 1) {
      const value = row[col];
      line.push(!value || value === EMPTY_RID ? EMPTY : Number(value));
    }
    return line;
  });
  return { rows, cols, cells };
}

function formatCells(cells) {
  const lines = cells.map((row) => '    [' + row.join(',') + ']');
  return '[\n' + lines.join(',\n') + '\n  ]';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const levelsFile = path.join(options.source, 'src/game/drama-levels.source.ts');
  const resourcesFile = path.join(options.source, 'src/game/drama-level-resources.source.ts');
  const paletteFile = path.join(options.source, 'src/game/palette.source.ts');
  const materialDir = path.join(
    options.source,
    'assets/original/home/mat/Assets/Game_Mat/Color_XiaoRenKuaiShangChe/Mat_Base'
  );

  const levels = loadExportedJson(levelsFile);
  const resources = loadResourceNames(resourcesFile);
  const colors = new Map(Object.entries(loadExportedJson(paletteFile)));
  for (const [rid, hex] of readMaterialPalette(materialDir)) {
    if (!colors.has(rid)) colors.set(rid, hex);
  }

  const grades = Object.keys(levels).map(Number).sort((left, right) => left - right);
  let generated = 0;
  const fallbacks = new Set();

  for (const grade of grades) {
    const level = levels[grade];
    const { rows, cols, cells } = normalizeCells(level.cubeData);
    const palette = {};
    for (const row of cells) {
      for (const rid of row) {
        if (!rid) continue;
        const key = String(rid);
        if (palette[key]) continue;
        let fill = colors.get(key);
        if (!fill) {
          fill = fallbackColor(key);
          fallbacks.add(key);
        }
        palette[key] = buildShades(fill);
      }
    }
    const cannons = level.cannon_order.map((lane, laneIndex) => lane.map((rid, index) => ({
      color: Number(rid),
      ammo: Number(level.bullet_order[laneIndex][index])
    })));

    const id = `level-${String(grade).padStart(4, '0')}`;
    const payload = [
      '{',
      `  "id": "${id}",`,
      '  "format": 2,',
      `  "source": { "game": "taxi-pick", "grade": ${grade}, `
        + `"resource": "${resources[grade - 1] ?? ''}", "packId": ${level.id} },`,
      `  "rows": ${rows},`,
      `  "cols": ${cols},`,
      // 原包 boardMoveSpeedScale：第 1 关 1.5，第 2 关 1.2，其余 1。
      `  "speedScale": ${grade === 1 ? 1.5 : grade === 2 ? 1.2 : 1},`,
      `  "board": { "wall": ${grade > 2}, "minOpeningCells": 2 },`,
      `  "palette": ${JSON.stringify(palette, null, 2).replace(/\n/g, '\n  ')},`,
      `  "cannons": ${JSON.stringify(cannons, null, 2).replace(/\n/g, '\n  ')},`,
      '  "cells": ' + formatCells(cells),
      '}',
      ''
    ].join('\n');

    const bucketStart = Math.floor(grade / GRADES_PER_BUCKET) * GRADES_PER_BUCKET;
    const bucket = `${String(bucketStart).padStart(4, '0')}-${String(bucketStart + GRADES_PER_BUCKET - 1).padStart(4, '0')}`;
    const directory = path.join(OUTPUT_ROOT, bucket);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${id}.json`), payload);
    generated += 1;
  }

  console.log(`已生成 ${generated} 关到 ${path.relative(PROJECT, OUTPUT_ROOT)}`);
  console.log(`配色来源：原包调色表 + 材质底色；派生色号：${[...fallbacks].sort().join(', ') || '无'}`);
}

main();
