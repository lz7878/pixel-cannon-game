/**
 * 骨架场景：加载一关、渲染棋盘与第一排队列，点击队列卡片发射一波（最多 4 个），
 * 像素从棋盘原位飞向卡片并被吸收。完整 UI（第二排预览、阵地、复活、结算）后续替换。
 */
import { GAME_WIDTH } from "../config/game-config";
import { BoardSession, CannonHandle, SessionBlock } from "../core/board-session";
import { loadLevel, NormalizedLevel } from "../levels/level-loader";

const MARGIN = 24;
const STATUS_HEIGHT = 110;
const QUEUE_HEIGHT = 160;
const WAVE_SIZE = 4;

interface QueueCannon {
  handle: CannonHandle;
  color: number;
  ammo: number;
  visualCol: number;
  card: Laya.Sprite;
  label: Laya.Text;
}

export class GameScene extends Laya.Sprite {
  private session: BoardSession | null = null;
  private level: NormalizedLevel | null = null;
  private cellSprites: Array<Array<Laya.Sprite | null>> = [];
  private cellSize = 16;
  private boardLeft = 0;
  private boardTop = STATUS_HEIGHT;
  private queue: QueueCannon[] = [];
  private status: Laya.Text;

  constructor() {
    super();
    this.size(GAME_WIDTH, Laya.stage.height);
    this.status = new Laya.Text();
    this.status.fontSize = 30;
    this.status.color = "#efe9ff";
    this.status.pos(MARGIN, 40);
    this.addChild(this.status);
    void this.boot();
  }

  private async boot(): Promise<void> {
    const level = await loadLevel("level-0001", "new");
    this.level = level;
    const blocks: SessionBlock[][] = [];
    for (let row = 0; row < level.rows; row++) {
      blocks[row] = [];
      this.cellSprites[row] = [];
      for (let col = 0; col < level.cols; col++) {
        const color = level.cells[row][col];
        blocks[row][col] = { row, col, color: color ?? 0, alive: !!color };
        this.cellSprites[row][col] = color ? this.createCellSprite(row, col, level.palette[color]?.fill ?? "#ffffff") : null;
      }
    }
    this.session = new BoardSession(level, blocks);
    this.renderQueue(level);
    this.updateStatus();
  }

  private createCellSprite(row: number, col: number, fill: string) {
    const sprite = new Laya.Sprite();
    sprite.graphics.drawRect(0, 0, this.cellSize - 1, this.cellSize - 1, fill);
    sprite.pos(this.boardLeft + col * this.cellSize, this.boardTop + row * this.cellSize);
    this.addChild(sprite);
    return sprite;
  }

  private renderQueue(level: NormalizedLevel) {
    const lane = level.lanes[0] || [];
    const laneY = Laya.stage.height - QUEUE_HEIGHT + 30;
    const slotWidth = GAME_WIDTH / Math.max(1, lane.length);
    lane.forEach((cannon, index) => {
      const card = new Laya.Sprite();
      card.graphics.drawRect(0, 0, slotWidth - 12, QUEUE_HEIGHT - 60, level.palette[cannon.color]?.fill ?? "#888888");
      card.pos(index * slotWidth + 6, laneY);
      card.mouseEnabled = true;
      const label = new Laya.Text();
      label.fontSize = 34;
      label.color = "#ffffff";
      label.text = String(cannon.ammo);
      label.pos(10, 8);
      card.addChild(label);
      this.addChild(card);
      const entry: QueueCannon = {
        handle: this.session!.createCannon(cannon.color, cannon.ammo),
        color: cannon.color,
        ammo: cannon.ammo,
        visualCol: Math.round(index * (level.cols - 1) / Math.max(1, lane.length - 1)),
        card,
        label
      };
      card.on(Laya.Event.CLICK, () => this.fire(entry));
      this.queue.push(entry);
    });
  }

  /** 一次波次：向棋盘要目标并立刻提交，每个目标从原位飞向卡片。 */
  private fire(cannon: QueueCannon) {
    if (!this.session || cannon.ammo <= 0) return;
    const targets = this.session.reserve(cannon.handle, cannon.visualCol, Math.min(WAVE_SIZE, cannon.ammo));
    if (!targets.length) {
      this.status.text = "这门炮暂时打不到同色像素";
      return;
    }
    const cardCenter = { x: cannon.card.x + cannon.card.width / 2, y: cannon.card.y + cannon.card.height / 2 };
    targets.forEach((target, order) => {
      const sprite = this.cellSprites[target.row][target.col];
      if (!sprite) return;
      this.cellSprites[target.row][target.col] = null;
      Laya.Tween.to(
        sprite,
        { x: cardCenter.x - this.cellSize / 2, y: cardCenter.y - this.cellSize / 2, scaleX: 0.2, scaleY: 0.2 },
        240,
        Laya.Ease.quadIn,
        Laya.Handler.create(this, () => {
          sprite.removeSelf();
          cannon.ammo -= 1;
          cannon.handle.bulletTotalNum = cannon.ammo;
          cannon.label.text = String(cannon.ammo);
          this.updateStatus();
        }),
        order * 70
      );
    });
  }

  private updateStatus() {
    if (!this.session) return;
    const remaining = this.session.aliveCells();
    this.status.text = remaining === 0 ? "全部吸收完成！" : `剩余 ${remaining} 像素`;
  }
}
