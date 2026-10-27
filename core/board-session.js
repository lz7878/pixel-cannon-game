/**
 * 棋盘会话：把 pixel-cannon 的关卡数据包装成原包 BoardState 需要的世界坐标棋盘，
 * 并对外提供“炮台 → 预约 → 提交”的消除接口。
 *
 * 坐标系：原包棋盘以右下为原点、行号向下增长，炮台在第 -1 行（画面下方）。
 * 关卡 JSON 用的是“观察者视角”（第 0 行在顶部），因此这里把行列各翻转一次，
 * 与原包 createOriginalBoardState 的做法保持一致；对外返回的 row/col 已经换算回
 * 观察者视角，调用方不需要关心内部朝向。
 *
 * 世界单位：1 格 = 1 单位。原包棋盘格边长约 0.70，移动速度 14.5 单位/秒，
 * 这里按同一比例换算成“格/秒”，让 future frontier 的到达时间预测与原包同量级。
 */
import { OriginalBoardState } from './original-board-state.js';

const EMPTY_RID = 7000;
const REFERENCE_CELL_SIZE = 0.7;
const BASE_MOVE_SPEED = 14.5;
// BoardWalkerSystem.boardPathSearchMaxCandidateCount
const PEEL_SEARCH_CANDIDATES = 4;
// game-controller 在有 peel 焦点时用 4，回退到普通目标时放宽到 24。
const FALLBACK_SEARCH_CANDIDATES = 24;

export class BoardSession {
  /**
   * @param {object} level 已归一化的关卡：rows / cols / cells / board
   * @param {Array<Array<object|null>>} blocks 与之同形的方块对象表
   */
  constructor(level, blocks) {
    this.rows = level.rows;
    this.cols = level.cols;
    this.wall = !!level.board?.wall;
    this.board = new OriginalBoardState();
    this.board.setBoardWallEnabled(this.wall);
    this.board.setBoundaryExitConfig({ minOpeningCells: level.board?.minOpeningCells ?? 2 });
    this.board.setPathWorldY(0);

    const colorMap = [];
    const scripts = [];
    for (let sourceRow = 0; sourceRow < this.rows; sourceRow++) {
      colorMap[sourceRow] = [];
      scripts[sourceRow] = [];
      for (let sourceCol = 0; sourceCol < this.cols; sourceCol++) {
        const row = this.rows - 1 - sourceRow;
        const col = this.cols - 1 - sourceCol;
        const color = level.cells[row]?.[col] ?? null;
        colorMap[sourceRow][sourceCol] = color ?? EMPTY_RID;
        if (!color) {
          scripts[sourceRow][sourceCol] = null;
          continue;
        }
        scripts[sourceRow][sourceCol] = {
          color_rid: color,
          health: 1,
          block: blocks[row]?.[col] ?? null,
          sp3: { destroyed: false, transform: { position: this.cellPosition(sourceRow, sourceCol) } }
        };
      }
    }
    this.board.build(colorMap, scripts);
    this.moveSpeed = (BASE_MOVE_SPEED / REFERENCE_CELL_SIZE) * (level.speedScale || 1);
  }

  cellPosition(sourceRow, sourceCol) {
    return { x: this.xForCol(sourceCol), y: 0, z: this.zForRow(sourceRow) };
  }

  xForCol(col) { return col - (this.cols - 1) / 2; }

  zForRow(row) { return row - (this.rows - 1) / 2; }

  /** 炮台句柄：只需 color_rid / bulletTotalNum，其余字段与原包 car.cannon 对齐。 */
  createCannon(color, ammo) {
    return {
      color_rid: color,
      bulletTotalNum: ammo,
      planner: { focus: null, sideLock: null },
      sp3: { destroyed: false, transform: { position: { x: 0, y: 0, z: 0 } } },
      __boardWalkerPlanningPosition: null
    };
  }

  /** 阵地所在列换算成炮台开火点；列越界时夹到棋盘边缘。 */
  firePosition(visualCol) {
    const col = Math.max(0, Math.min(this.cols - 1, Math.round(visualCol) || 0));
    // 观察者列 → source 列，再取世界坐标。z 放在棋盘下方两格。
    const sourceCol = this.cols - 1 - col;
    return { x: this.xForCol(sourceCol), y: 0, z: this.zForRow(-2) };
  }

  /** 当前颜色还剩多少活着的格子。 */
  aliveCount(color) {
    return this.board.getAliveColorCount(color);
  }

  /**
   * 为一次波次预约目标：先走 peel（同组连通剥开），再回退到普通外露目标，
   * 最后在“该颜色剩余数量不超过剩余弹药”时才启用原包的残局直取。
   * 返回已提交的坐标（观察者视角）与对应方块。
   */
  reserve(handle, visualCol, count) {
    if (!handle || count <= 0 || handle.bulletTotalNum <= 0) return [];
    handle.__boardWalkerPlanningPosition = this.firePosition(visualCol);
    handle.planner ||= { focus: null, sideLock: null };
    const speed = this.moveSpeed;
    let reservations = [];
    try {
      reservations = this.board.tryReservePeelTargets(
        handle, count, speed, PEEL_SEARCH_CANDIDATES, [], handle.planner
      );
      if (reservations.length < count) {
        // MainGame.fillBoardWalkerOpenAnchorFallback：清掉 peel 焦点后放宽搜索。
        handle.planner.focus = null;
        handle.planner.sideLock = null;
        this.board.clearNoTargetCache();
        while (reservations.length < count) {
          const reservation = this.board.tryReserveTarget(handle, speed, FALLBACK_SEARCH_CANDIDATES);
          if (!reservation) break;
          reservations.push(reservation);
        }
      }
      if (reservations.length < count) {
        const alive = this.board.getAliveColorCount(handle.color_rid);
        // 原包只在“这个颜色剩下的格子能一次装进剩余弹药”时才走残局回退。
        if (alive > 0 && alive <= handle.bulletTotalNum) {
          const centerCol = Math.round(this.cols / 2);
          const radius = Math.max(6, Math.ceil(0.42 * this.cols));
          const batchCols = reservations.map((reservation) => reservation.col);
          const batchRows = reservations.map((reservation) => reservation.row);
          while (reservations.length < count) {
            const reservation = this.board.tryReserveReviveTarget(
              handle, speed, PEEL_SEARCH_CANDIDATES, batchCols, batchRows, centerCol, radius
            );
            if (!reservation) break;
            reservations.push(reservation);
            batchCols.push(reservation.col);
            batchRows.push(reservation.row);
          }
        }
      }
    } finally {
      if (!handle.planner.focus) handle.planner.sideLock = null;
    }
    const committed = this.board.commitReservations(reservations.map((reservation) => reservation.id));
    return committed.flatMap((reservation) => {
      const block = reservation.cube?.block;
      if (!block) return [];
      return [{
        id: reservation.id,
        block,
        row: this.rows - 1 - reservation.row,
        col: this.cols - 1 - reservation.col,
        color: reservation.colorRid,
        path: reservation.path
      }];
    });
  }

  /** 这颗炮台此刻是否还有可以打的目标（含即将被腾空的目标）。 */
  hasTarget(handle, visualCol) {
    if (!handle || handle.bulletTotalNum <= 0) return false;
    handle.__boardWalkerPlanningPosition = this.firePosition(visualCol);
    return this.board.hasAvailableTarget(handle, this.moveSpeed);
  }

  /** 棋盘还剩多少格。 */
  aliveCells() {
    let total = 0;
    for (const row of this.board.grid) {
      for (const cell of row || []) {
        if (cell && (cell.state === 1 || cell.state === 2)) total++;
      }
    }
    return total;
  }
}
