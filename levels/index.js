/**
 * 关卡目录。Vite 在构建时扫描每个 level-编号/index.js；地图内容不会进入首屏
 * 包，而是等进入该关后才加载对应 chunk。新增关卡无需手动改此文件。
 */
const modules = import.meta.glob('./level-*/index.js');
const ids = Object.keys(modules)
  .map(path => path.match(/\.\/([^/]+)\/index\.js$/)?.[1])
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

export function getLevelId(value) {
  if (typeof value === 'string' && ids.includes(value)) return value;
  const index = Math.max(0, Number(value) - 1 || 0);
  return ids[index] || ids[0];
}

export function getNextLevelId(id) {
  const index = ids.indexOf(id);
  return ids[index + 1] || null;
}

export function getLevelNumber(id) {
  return ids.indexOf(id) + 1;
}

export async function loadLevel(id) {
  const loader = modules[`./${id}/index.js`];
  if (!loader) throw new Error(`未知关卡：${id}`);
  const level = (await loader()).default;
  if (!Array.isArray(level.art) || !Array.isArray(level.queueArt)) {
    throw new Error(`关卡 ${id} 的 art 和 queueArt 必须是数组`);
  }
  return { ...level, id };
}
