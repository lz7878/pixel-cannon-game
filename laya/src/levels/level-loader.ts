/**
 * 关卡运行时目录：assets/levels 下的静态 JSON 由 IDE 构建时原样发布到 res/levels，
 * 这里只生成很小的清单缓存并按需加载对应关卡，因此关卡数量可以扩到成千上万。
 *
 * 加载走 Laya.loader（小游戏平台没有 fetch），路径以 res/ 为根。
 * 当前全部关卡都是 format 2（cells 直存色号），不再保留旧字符画格式分支。
 */
import { SessionLevel } from "../core/board-session";

const LEVELS_ROOT = "res/levels/";

export type LevelCollection = "original" | "new";

export interface LevelCatalogEntry {
  id: string;
  number: number;
  path: string;
  rows?: number;
  cols?: number;
}

export interface LevelPalette {
  fill: string;
  light?: string;
  dark?: string;
}

export interface LevelCannon {
  color: number;
  ammo: number;
}

export interface NormalizedLevel extends SessionLevel {
  id: string;
  number: number;
  palette: Record<string, LevelPalette>;
  lanes: LevelCannon[][];
  speedScale?: number;
}

interface Catalog {
  levels: LevelCatalogEntry[];
  byId: Map<string, LevelCatalogEntry>;
}

const catalogs = new Map<LevelCollection, Catalog>();
const catalogPromises = new Map<LevelCollection, Promise<Catalog>>();

function levelIdFromNumber(value: number | string) {
  const number = Math.max(1, Number(value) || 1);
  return `level-${String(Math.floor(number)).padStart(4, "0")}`;
}

function numberFromId(id: string) {
  const match = id.match(/^level-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function isCatalogEntry(value: unknown): value is LevelCatalogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.number === "number" && typeof entry.path === "string";
}

function isColorGrid(value: unknown): value is Array<Array<number | null>> {
  return Array.isArray(value)
    && value.every((row) => Array.isArray(row)
      && row.every((cell) => typeof cell === "number" || cell === null));
}

function isCannonGrid(value: unknown): value is LevelCannon[][] {
  return Array.isArray(value)
    && value.every((lane) => Array.isArray(lane)
      && lane.every((cannon) => !!cannon && typeof cannon === "object"
        && typeof (cannon as Record<string, unknown>).color === "number"
        && typeof (cannon as Record<string, unknown>).ammo === "number"));
}

async function loadJson<T>(url: string, validate: (data: unknown) => data is T): Promise<T> {
  const data: unknown = await Laya.loader.load(url, Laya.Loader.JSON);
  if (!validate(data)) throw new Error(`关卡数据格式错误：${url}`);
  return data;
}

async function loadCatalog(collection: LevelCollection): Promise<Catalog> {
  const cached = catalogs.get(collection);
  if (cached) return cached;
  const pending = catalogPromises.get(collection);
  if (pending) return pending;
  const manifestPath = collection === "original" ? "manifest.json" : "new/manifest.json";
  const promise = loadJson<{ levels: unknown[] }>(
    `${LEVELS_ROOT}${manifestPath}`,
    (data): data is { levels: unknown[] } => !!data && typeof data === "object"
      && Array.isArray((data as Record<string, unknown>).levels)
  ).then(({ levels }) => {
    if (!levels.length) throw new Error("关卡清单为空");
    const entries = levels.filter(isCatalogEntry)
      .slice()
      .sort((left, right) => left.number - right.number);
    if (!entries.length) throw new Error("关卡清单格式错误");
    const catalog = { levels: entries, byId: new Map(entries.map((entry) => [entry.id, entry])) };
    catalogs.set(collection, catalog);
    return catalog;
  }).catch((error: unknown) => {
    catalogPromises.delete(collection);
    throw error;
  });
  catalogPromises.set(collection, promise);
  return promise;
}

function resolveEntry(value: number | string, catalog: Catalog | undefined) {
  if (!catalog) return null;
  const id = typeof value === "string" && catalog.byId.has(value) ? value : levelIdFromNumber(value);
  return catalog.byId.get(id) || null;
}

export async function getLevelCount(collection: LevelCollection = "new") {
  return (await loadCatalog(collection)).levels.length;
}

export async function loadLevel(
  id: string,
  collection: LevelCollection = "new"
): Promise<NormalizedLevel> {
  const catalog = await loadCatalog(collection);
  const entry = resolveEntry(id, catalog);
  if (!entry) throw new Error(`未知关卡：${id}`);
  const level: unknown = await Laya.loader.load(`res/${entry.path}`, Laya.Loader.JSON);
  return normalizeLevel(level, entry);
}

/**
 * 把关卡归一化成同一份运行时结构：
 *   id / number / rows / cols / cells[行][列] 色号或 null / palette / lanes[列][炮台] / board
 */
export function normalizeLevel(raw: unknown, entry: Partial<LevelCatalogEntry> = {}): NormalizedLevel {
  if (!raw || typeof raw !== "object") throw new Error(`关卡 ${entry.id || ""} 不是对象`);
  const level = raw as Record<string, unknown>;
  if (!isColorGrid(level.cells)) throw new Error(`关卡 ${entry.id || level.id || ""} 缺少合法的 cells`);
  const rows: number = typeof level.rows === "number" ? level.rows : level.cells.length;
  const cols: number = typeof level.cols === "number" ? level.cols : level.cells[0]?.length ?? 0;
  const cells = level.cells.map((row) => Array.from({ length: cols }, (_, col) => row[col] || null));
  const rawBoard = (level.board ?? {}) as Record<string, unknown>;
  return {
    id: entry.id ?? (typeof level.id === "string" ? level.id : levelIdFromNumber(entry.number ?? 1)),
    number: entry.number ?? (typeof level.number === "number" ? level.number : numberFromId(String(level.id ?? ""))),
    rows,
    cols,
    cells,
    palette: (level.palette ?? {}) as Record<string, LevelPalette>,
    lanes: isCannonGrid(level.cannons)
      ? level.cannons.map((lane) => lane.map((cannon) => ({ color: cannon.color, ammo: cannon.ammo })))
      : [],
    board: {
      wall: rawBoard.wall === true,
      minOpeningCells: typeof rawBoard.minOpeningCells === "number" ? rawBoard.minOpeningCells : 2
    },
    speedScale: typeof level.speedScale === "number" ? level.speedScale : undefined
  };
}

/** 下一关 id；清单里没有下一关时返回 null。 */
export async function getNextLevelId(id: string, collection: LevelCollection = "new") {
  const catalog = await loadCatalog(collection);
  const index = catalog.levels.findIndex((level) => level.id === id);
  return catalog.levels[index + 1]?.id || null;
}
