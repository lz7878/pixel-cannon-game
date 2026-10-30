import { GAME_HEIGHT, GAME_WIDTH } from "./config/game-config";
import { GameScene } from "./game/game-scene";

const { regClass } = Laya;

/**
 * 启动入口：注册进启动场景后由引擎回调。
 * 竖屏原型用 SCALE_FIXED_WIDTH —— 宽度锁 750，高度随设备比例伸缩。
 */
@regClass()
export class Main extends Laya.Script {
  private static started = false;

  public static start(): void {
    if (Main.started) return;
    Main.started = true;
    Laya.stage.designWidth = GAME_WIDTH;
    Laya.stage.designHeight = GAME_HEIGHT;
    Laya.stage.scaleMode = Laya.Stage.SCALE_FIXED_WIDTH;
    Laya.stage.alignH = Laya.Stage.ALIGN_CENTER;
    Laya.stage.alignV = Laya.Stage.ALIGN_TOP;
    Laya.stage.bgColor = "#141018";
    Laya.stage.updateCanvasSize();
    Laya.stage.addChild(new GameScene());
  }

  public onStart(): void {
    Main.start();
  }
}

// 打包产物在 Laya.init 完成前就已执行，等舞台就绪再启动。
Laya.addAfterInitCallback(Main.start);
