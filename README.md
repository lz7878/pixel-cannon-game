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

直接打开 `index.html`，或在目录中启动任意静态服务器：

```bash
python3 -m http.server 5173
```

然后访问 `http://localhost:5173`。

## 从参考图生成关卡 ART

把无 UI 的原始参考图保存到项目目录后运行：

```bash
python3 tools/image_to_art.py watermelon.png \
  --preview watermelon-grid.png \
  --output watermelon-art.txt
```

确认预览图中的 34 x 34 网格与积木中心对齐后，可以直接更新 `game.js`：

```bash
python3 tools/image_to_art.py watermelon.png \
  --preview watermelon-grid.png \
  --apply game.js
```

如果图片周围有 UI 或留白，可用 `--crop left,top,right,bottom` 裁剪；自动网格仍有偏差时，用 `--bounds left,top,right,bottom` 精确指定第一格左上角到最后一格右下角的范围。识别字符为 `K` 黑、`R` 红、`W` 白、`G` 浅绿、`D` 深绿、`.` 空白。

当前版本是用于验证核心玩法的 Web 原型。视频按钮目前用 1.1 秒延时模拟完整播放回调；接入抖音小游戏时，在激励视频 `onClose({ isEnded: true })` 回调中调用 `unlockExtraSlot()`，并继续接入生命周期、存档与分享 API。
