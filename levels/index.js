/**
 * 关卡运行时目录。
 *
 * 地图以 public/levels 下的静态 JSON 提供：构建工具只生成一份很小的清单，
 * 客户端按需请求对应关卡，不会让 Vite 扫描或拆分成成千上万个 JS 模块。
 */
const LEVELS_ROOT = `${import.meta.env.BASE_URL}levels/`;
let catalogPromise = null;
let catalog = null;

function levelIdFromNumber(value) {
  const number = Math.max(1, Number(value) || 1);
  return `level-${String(Math.floor(number)).padStart(4, '0')}`;
}

function numberFromId(id) {
  const match = String(id).match(/^level-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function resolveEntry(value) {
  if (!catalog) return null;
  const id = typeof value === 'string' && catalog.byId.has(value)
    ? value
    : levelIdFromNumber(value);
  return catalog.byId.get(id) || null;
}

async function loadCatalog() {
  if (catalog) return catalog;
  catalogPromise ||= fetch(`${LEVELS_ROOT}manifest.json`, { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`无法加载关卡清单：${response.status}`);
      return response.json();
    })
    .then(manifest => {
      if (!Array.isArray(manifest.levels) || !manifest.levels.length) {
        throw new Error('关卡清单为空或格式错误');
      }
      const levels = manifest.levels.slice().sort((left, right) => left.number - right.number);
      catalog = { levels, byId: new Map(levels.map(level => [level.id, level])) };
      return catalog;
    });
  return catalogPromise;
}

export function getLevelId(value) {
  const entry = resolveEntry(value);
  if (entry) return entry.id;
  if (catalog) return catalog.levels[0].id;
  if (typeof value === 'string' && /^level-\d+$/.test(value)) return value;
  return levelIdFromNumber(value);
}

export function getNextLevelId(id) {
  if (!catalog) return null;
  const index = catalog.levels.findIndex(level => level.id === id);
  return catalog.levels[index + 1]?.id || null;
}

export function getLevelNumber(id) {
  return resolveEntry(id)?.number || numberFromId(id);
}

export async function loadLevel(id) {
  await loadCatalog();
  const entry = resolveEntry(id);
  if (!entry) throw new Error(`未知关卡：${id}`);
  const response = await fetch(`${import.meta.env.BASE_URL}${entry.path}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`无法加载关卡 ${entry.id}：${response.status}`);
  const level = await response.json();
  if (!Array.isArray(level.art) || (!Array.isArray(level.queueArt) && !Array.isArray(level.queue))) {
    throw new Error(`关卡 ${entry.id} 必须包含 art，以及 queueArt 或 queue`);
  }
  return { ...level, id: entry.id };
}
