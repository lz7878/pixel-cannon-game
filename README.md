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

每关都是一个独立目录，地图、取色结果和检查图不会再堆到项目根目录：

```text
levels/
  index.js                 # 自动发现 level-编号 目录，并按需加载
  level-001/index.js       # 地图 + 队列
  level-002/
    index.js               # 地图 + 队列
    palette.json           # 从参考图采样出的专属调色板
    art.txt                # 脚本生成的原始网格，便于审阅
    preview.png            # 识别检查图
```

`levels/index.js` 使用按需加载：进入某一关才下载该关地图。新增 `levels/level-003/index.js` 后会被自动发现，无需修改游戏主逻辑或关卡索引，适合持续扩展到大量关卡。

## 从参考图生成关卡

先新建一个关卡目录和入口文件（可复制前一关的 `index.js`，只保留 `ART`、`QUEUE_ART` 与 `export default`），再运行：

```bash
python3 tools/image_to_art.py reference.png \
  --preview levels/level-003/preview.png \
  --output levels/level-003/art.txt \
  --palette-output levels/level-003/palette.json \
  --apply levels/level-003/index.js \
  --variable ART
```

确认 `preview.png` 的网格与积木中心对齐后即可运行游戏。图片周围有 UI 或留白时，用 `--crop left,top,right,bottom` 裁剪；仍有偏差时用 `--bounds left,top,right,bottom` 指定网格外框。

当前识别字符包括：`K` 黑、`R` 红、`W` 白、`G` 绿、`D` 深绿、`P/M` 两种粉、`C/B` 两种蓝、`Y` 黄、`O` 橙、`.` 空白。脚本会同时输出关卡的专属调色板，避免不同图片的相近颜色被游戏统一替换。

当前版本是用于验证核心玩法的 Web 原型。视频按钮目前用 1.1 秒延时模拟完整播放回调；接入抖音小游戏时，在激励视频 `onClose({ isEnded: true })` 回调中调用 `unlockExtraSlot()`，并继续接入生命周期、存档与分享 API。
