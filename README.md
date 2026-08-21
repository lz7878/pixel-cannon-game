# 像素爆破队（Pixel Blasters）

一个参考“排队接人”消除玩法、改造成彩色爆破机器人主题的手机竖屏原型。

## 玩法

- 底部机器人队伍使用 4 列 × 2 排展示：第一排可选择，第二排半透明预览下一队。
- 点击第一排后，同列第二排会向前补位，后续机器人队伍继续补到第二排。
- 机器人会自动寻找从下方暴露出来的同色方块。
- 机器人从外围搜索所有上下左右连通的空格，可从底部、侧面或内部缝隙绕行；只要色块邻接可达空格就能爆破。
- 每次爆破产生的新空格会立即加入可行走区域，机器人不会穿过仍存在的色块。
- 每个阵地同一时间只派出 1 个机器人，完成爆破后才派下一只。
- 没有可攻击目标的队伍会等待并占住阵地，上阵顺序是解谜关键。
- 默认开放 4 个阵地，可通过激励视频占位流程解锁第 5 个阵地。
- 4 个阵地堵塞时可通过视频解锁位救场；5 个阵地全部堵塞后挑战失败。

## 运行

安装依赖并启动开发服务器：

```bash
pnpm install
pnpm dev
```

然后访问终端输出的本地地址（默认是 `http://localhost:5173`）。

生产构建：

```bash
pnpm build
pnpm preview
```

## 关卡结构

关卡是静态 JSON 数据，不参与 Vite 的模块扫描。构建前会校验全部关卡并生成运行时清单；客户端先请求清单，进入某关时才请求该关 JSON。因此可以扩展到上千或上万关，而不会生成同等数量的 JS chunk。

```text
levels/
  index.js                         # 运行时 JSON 加载器
public/levels/
  manifest.json                     # 自动生成：ID、分桶路径、地图尺寸
  0000-0099/
    level-0001.json                 # 地图、队列、可选专属调色板
    level-0002.json
  0100-0199/
    level-0100.json
tools/
  build_level_catalog.py             # 校验 JSON 并生成 manifest
```

新增关卡时按编号放进对应的 100 关分桶，例如 `level-0100.json` 放在 `public/levels/0100-0199/`。运行 `pnpm prepare-levels` 会检查地图是否矩形、颜色是否合法、队列弹药是否与地图色块数匹配，并更新 `manifest.json`。`pnpm dev` 和 `pnpm build` 都会自动执行该步骤。

关卡 JSON 的格式如下：

```json
{
  "id": "level-0100",
  "art": ["..."],
  "queue": [[{ "color": "R", "ammo": 12 }]],
  "palette": {
    "R": { "fill": "#ed2024", "light": "#ff4646", "dark": "#b81019" }
  }
}
```

## 从参考图生成关卡

先复制一个相邻关卡 JSON，修改 `id` 和队列配置；再让识别脚本写入地图与专属调色板：

```bash
python3 tools/image_to_art.py reference.png \
  --preview /tmp/level-0100-preview.png \
  --apply-json public/levels/0100-0199/level-0100.json

pnpm prepare-levels
```

确认检查图的网格与积木中心对齐后即可运行游戏。图片周围有 UI 或留白时，用 `--crop left,top,right,bottom` 裁剪；仍有偏差时用 `--bounds left,top,right,bottom` 指定网格外框。原始参考图和检查图建议放到仓库外的素材库或 Git LFS，不要随数万份运行时关卡数据一并打进 Web 构建产物。

当前识别字符包括：`K` 黑、`R` 红、`W` 白、`G` 绿、`D` 深绿、`P/M` 两种粉、`C/B` 两种蓝、`Y` 黄、`O` 橙、`.` 空白。脚本会同时输出关卡的专属调色板，避免不同图片的相近颜色被游戏统一替换。

## 机制文档

- [吸附逻辑](docs/absorption-logic.md)：固定圆心的半径搜索、同色连通扩散与可达性约束。

当前版本是用于验证核心玩法的 Web 原型。视频按钮目前用 1.1 秒延时模拟完整播放回调；接入抖音小游戏时，在激励视频 `onClose({ isEnded: true })` 回调中调用 `unlockExtraSlot()`，并继续接入生命周期、存档与分享 API。
