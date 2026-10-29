/**
 * 关卡运行时目录。
 *
 * 地图以 public/levels 下的静态 JSON 提供：构建工具只生成一份很小的清单，
 * 客户端按需请求对应关卡，不会让 Vite 扫描或拆分成成千上万个 JS 模块。
 */
const LEVELS_ROOT = `${import.meta.env.BASE_URL}levels/`;
const catalogs = new Map();
const catalogPromises = new Map();

function catalogFor(collection) { return catalogs.get(collection); }

function levelIdFromNumber(value) {
  const number = Math.max(1, Number(value) || 1);
  return `level-${String(Math.floor(number)).padStart(4, '0')}`;
}

function numberFromId(id) {
  const match = String(id).match(/^level-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function resolveEntry(value, collection = 'new') {
  const catalog = catalogFor(collection);
  if (!catalog) return null;
  const id = typeof value === 'string' && catalog.byId.has(value)
    ? value
    : levelIdFromNumber(value);
  return catalog.byId.get(id) || null;
}

async function loadCatalog(collection = 'new') {
  const catalog = catalogFor(collection);
  if (catalog) return catalog;
  if (catalogPromises.has(collection)) return catalogPromises.get(collection);
  const manifestPath = collection === 'original' ? 'manifest.json' : 'new/manifest.json';
  const promise = fetch(`${LEVELS_ROOT}${manifestPath}`, { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`无法加载关卡清单：${response.status}`);
      return response.json();
    })
    .then(manifest => {
      if (!Array.isArray(manifest.levels) || !manifest.levels.length) {
        throw new Error('关卡清单为空或格式错误');
      }
      const levels = manifest.levels.slice().sort((left, right) => left.number - right.number);
      const loaded = { levels, byId: new Map(levels.map(level => [level.id, level])) };
      catalogs.set(collection, loaded);
      return loaded;
    }).catch(error => {
      catalogPromises.delete(collection);
      throw error;
    });
  catalogPromises.set(collection, promise);
  return promise;
}

export function getLevelId(value, collection = 'new') {
  const catalog = catalogFor(collection);
  const entry = resolveEntry(value, collection);
  if (entry) return entry.id;
  if (catalog) return catalog.levels[0].id;
  if (typeof value === 'string' && /^level-\d+$/.test(value)) return value;
  return levelIdFromNumber(value);
}

export function getNextLevelId(id, collection = 'new') {
  const catalog = catalogFor(collection);
  if (!catalog) return null;
  const index = catalog.levels.findIndex(level => level.id === id);
  return catalog.levels[index + 1]?.id || null;
}

export function getLevelNumber(id, collection = 'new') {
  return resolveEntry(id, collection)?.number || numberFromId(id);
}

export async function getLevelCount(collection = 'new') {
  return (await loadCatalog(collection)).levels.length;
}

export async function loadLevel(id, collection = 'new') {
  await loadCatalog(collection);
  const entry = resolveEntry(id, collection);
  if (!entry) throw new Error(`未知关卡：${id}`);
  const response = await fetch(`${import.meta.env.BASE_URL}${entry.path}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`无法加载关卡 ${entry.id}：${response.status}`);
  const level = await response.json();
  return { ...normalizeLevel(level, entry), id: entry.id };
}

/**
 * 把关卡归一化成同一份运行时结构：
 *   rows / cols / cells[行][列] 色号或 null / palette[色号] / lanes[列][炮台] / board
 *
 * format 2（当前）：直接来自 taxi-pick 原包，cells 存色号数字。
 * 旧格式：art 用字符画，queue 或 queueArt 描述队列，这里补齐成同一结构。
 */
export function normalizeLevel(level, entry = {}) {
  if (Array.isArray(level.cells)) {
    const rows = level.rows ?? level.cells.length;
    const cols = level.cols ?? level.cells[0]?.length ?? 0;
    const cells = level.cells.map(row => Array.from({ length: cols }, (_, col) => row[col] || null));
    return {
      ...level,
      number: entry.number ?? level.number,
      rows,
      cols,
      cells,
      palette: level.palette || {},
      lanes: (level.cannons || []).map(lane => lane.map(cannon => ({
        color: cannon.color,
        ammo: cannon.ammo
      }))),
      board: { wall: false, minOpeningCells: 2, ...(level.board || {}) }
    };
  }

  const art = level.art;
  if (!Array.isArray(art) || !art.length) throw new Error(`关卡 ${entry.id || ''} 缺少 art 或 cells`);
  const rows = art.length;
  const cols = art[0].length;
  const cells = art.map(row => [...row].map(color => (color === '.' ? null : color)));
  const totals = countColors(cells);
  return {
    ...level,
    number: entry.number ?? level.number,
    rows,
    cols,
    cells,
    palette: level.palette || {},
    lanes: lanesFromLegacy(level, totals),
    board: { wall: false, minOpeningCells: 2, ...(level.board || {}) }
  };
}

function countColors(cells) {
  const totals = new Map();
  for (const row of cells) {
    for (const color of row) {
      if (color) totals.set(color, (totals.get(color) || 0) + 1);
    }
  }
  return totals;
}

function lanesFromLegacy(level, totals) {
  if (Array.isArray(level.queue)) {
    return level.queue.map(lane => lane.map(cannon => ({ color: cannon.color, ammo: cannon.ammo })));
  }
  if (Array.isArray(level.queueArt)) {
    // 旧格式用字符画描述队列，按该颜色出现次数把弹药均分到每一门炮。
    const occurrences = [...level.queueArt.join('')].reduce((counts, color) => {
      if (color !== '.') counts[color] = (counts[color] || 0) + 1;
      return counts;
    }, {});
    const used = {};
    const lanes = Array.from({ length: Math.max(...level.queueArt.map(row => row.length)) }, () => []);
    level.queueArt.forEach((row, rowIndex) => [...row].forEach((color, laneIndex) => {
      if (color === '.') return;
      const indexForColor = used[color] || 0;
      const total = totals.get(color) || 0;
      const ammo = Math.floor(total / occurrences[color]) + (indexForColor < total % occurrences[color] ? 1 : 0);
      used[color] = indexForColor + 1;
      lanes[laneIndex].push({ color, ammo });
    }));
    return lanes;
  }
  // 兜底：每种颜色一门炮，弹药等于色块数。
  return [...totals].map(([color, ammo]) => [{ color, ammo }]);
}
