import { Application, Container, Sprite, Texture } from 'pixi.js';
import { START_LEVEL, START_LEVEL_SET } from './game.config.js';
import { getLevelCount, getLevelId, getLevelNumber, getNextLevelId, loadLevel } from './levels/index.js';
import { BoardSession } from './core/board-session.js';

(async () => {
  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const pixiCanvas = document.querySelector('#pixiCanvas');
  const pixiApp = new Application();
  await pixiApp.init({
    canvas: pixiCanvas,
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    roundPixels: true
  });
  const pixelLayer = pixiApp.stage.addChild(new Container());
  const pixelDisplays = new Map();
  const tileTextures = new Map();
  const queueEl = document.querySelector('#queue');
  const slotCoresEl = document.querySelector('#slotCores');
  const blockCountEl = document.querySelector('#blockCount');
  const progressBar = document.querySelector('#progressBar');
  const toastEl = document.querySelector('#toast');
  const resultPanel = document.querySelector('#resultPanel');
  const resultEyebrow = document.querySelector('#resultEyebrow');
  const resultTitle = document.querySelector('#resultTitle');
  const resultText = document.querySelector('#resultText');
  const resultButton = document.querySelector('#resultButton');
  const reviveButton = document.querySelector('#reviveButton');
  const restartButton = document.querySelector('#restartButton');
  const soundButton = document.querySelector('#soundButton');
  const speedButton = document.querySelector('#speedButton');
  const slotUnlockButton = document.querySelector('#slotUnlockButton');
  const levelSetEl = document.querySelector('#levelSet');
  const levelJumpEl = document.querySelector('#levelJump');
  const levelGoEl = document.querySelector('#levelGo');
  const savedLevelSet = localStorage.getItem('pixel-cannon-level-set');
  const initialLevelSet = savedLevelSet === 'original' ? 'original' : START_LEVEL_SET;
  levelSetEl.value = initialLevelSet;

  const PALETTE = {
    R: { fill: '#ed2024', light: '#ff4646', dark: '#b81019' },
    G: { fill: '#63d84b', light: '#8aec68', dark: '#35ad2c' },
    D: { fill: '#079d18', light: '#24bb30', dark: '#05720f' },
    M: { fill: '#ee48bc', light: '#ff94e5', dark: '#b52b88' },
    P: { fill: '#fe7eff', light: '#ffc0ff', dark: '#bd52bd' },
    Y: { fill: '#ffd83d', light: '#ffed82', dark: '#cf9d1d' },
    C: { fill: '#28dcea', light: '#76f5f1', dark: '#159ab6' },
    O: { fill: '#f18a27', light: '#ffb34b', dark: '#ad5a16' },
    W: { fill: '#f8f5ff', light: '#ffffff', dark: '#c8c1e4' },
    B: { fill: '#7965e8', light: '#a795ff', dark: '#4d3da8' },
    K: { fill: '#292a31', light: '#41434d', dark: '#16171c' }
  };
  const MAX_ACTIVE_ABSORPTIONS = 30;
  const MAX_REVIVES = 3;

  const state = {
    width: 0, height: 0, dpr: 1,
    blocks: [], blockGrid: [], boardSession: null,
    slots: Array(6).fill(null), pendingSlots: new Set(), lanes: [],
    projectiles: [], particles: [], stars: [],
    totalBlocks: 0, remaining: 0, running: true, win: false, finishing: false,
    deadlockNotified: false, stalledSince: 0, adLoading: false, unlockedSlots: 6,
    reviveCount: 0,
    muted: false, speedMultiplier: 1, time: 0, last: 0, sessionId: 0,
    levelSet: initialLevelSet, levelId: getLevelId(START_LEVEL, initialLevelSet),
    level: null, loadingLevel: false, loadRequest: 0, ready: false,
    grid: { x: 0, y: 0, cellX: 0, cellY: 0 }
  };

  let audioContext = null;
  let toastTimer = null;
  let pixelRevealFrame = 0;

  function currentLevel() { return state.level; }
  function paletteFor(color) { return currentLevel().palette?.[color] || PALETTE[color] || PALETTE.K; }

  function makeBlocks() {
    const level = currentLevel();
    const blocks = [];
    const grid = Array.from({ length: level.rows }, () => Array(level.cols).fill(null));
    level.cells.forEach((row, r) => row.forEach((color, c) => {
      if (!color) return;
      const block = { id: `${r}-${c}`, row: r, col: c, color, alive: true, pop: 0 };
      blocks.push(block);
      grid[r][c] = block;
    }));
    return { blocks, grid };
  }

  // 选点、预约、peel 全部交给原包 BoardState（core/board-session.js）；
  // 这里只负责把“阵地”换算成炮台开火所在的棋盘列。
  function slotColumn(index) {
    const level = currentLevel();
    const { x, cellX } = state.grid;
    if (!cellX) return Math.floor(level.cols / 2);
    return Math.max(0, Math.min(level.cols - 1, Math.floor((slotX(index) - x) / cellX)));
  }

  function boardCannonFor(cannon) {
    if (!cannon.board) {
      cannon.board = state.boardSession.createCannon(cannon.color, cannon.ammo);
      cannon.board.laneIndex = cannon.laneIndex;
    }
    return cannon.board;
  }

  // 一次波次最多预约几个目标：原包 BoardWalkerSystem 的默认分块大小。
  const WAVE_SIZE = 4;

  /** 向原包棋盘要一批目标；返回的格子已经在棋盘上被腾空。 */
  function reserveWave(cannon, slotIndex, count) {
    const session = state.boardSession;
    if (!session) return [];
    const handle = boardCannonFor(cannon);
    // bulletTotalNum 就是这颗核心剩余的弹药，原包在每发命中时递减。
    handle.bulletTotalNum = Math.max(0, cannon.ammo);
    return session.reserve(handle, slotColumn(slotIndex), count);
  }

  function makeQueue(blocks) {
    const totals = blocks.reduce((counts, block) => {
      counts[block.color] = (counts[block.color] || 0) + 1;
      return counts;
    }, {});
    const configured = currentLevel().lanes || [];
    const lanes = configured.length
      ? configured
      : Object.entries(totals).map(([color, ammo]) => [{ color, ammo }]);
    const provided = lanes.flat().reduce((counts, cannon) => {
      counts[cannon.color] = (counts[cannon.color] || 0) + cannon.ammo;
      return counts;
    }, {});
    const colors = new Set([...Object.keys(totals), ...Object.keys(provided)]);
    const invalid = [...colors].find(color => totals[color] !== provided[color]);
    if (invalid) {
      throw new Error(`关卡 ${state.levelId} 的 ${invalid} 色能量配置为 ${provided[invalid] || 0}，应为 ${totals[invalid] || 0}`);
    }
    return lanes.map((lane, laneIndex) => lane.map((cannon, cannonIndex) => ({
      color: cannon.color,
      ammo: cannon.ammo,
      laneIndex,
      cannonIndex,
      id: `cannon-${laneIndex}-${cannonIndex}`
    })));
  }

  async function init(levelId = state.levelId) {
    const request = ++state.loadRequest;
    const collection = state.levelSet;
    state.loadingLevel = true;
    state.running = false;
    state.ready = false;
    // Pixi 初始化和重建纹理之间会自动跑一帧；先完全隐藏该层，避免旧尺寸纹理
    // 被浏览器拉伸成左上角的白色残影。
    cancelAnimationFrame(pixelRevealFrame);
    pixelLayer.visible = false;
    pixiCanvas.style.visibility = 'hidden';
    canvas.style.visibility = 'hidden';
    resultPanel.hidden = true;
    try {
      const level = await loadLevel(levelId, collection);
      if (request !== state.loadRequest) return;
      state.levelId = level.id;
      state.level = level;
      state.loadingLevel = false;
      resetLevel();
    } catch (error) {
      if (request !== state.loadRequest) return;
      state.loadingLevel = false;
      console.error(error);
      toast('关卡加载失败，请重试');
    }
  }

  function resetLevel() {
    state.sessionId++;
    const { blocks, grid } = makeBlocks();
    state.blocks = blocks;
    state.blockGrid = grid;
    // 每个关卡一份棋盘会话：外露空气、frontier、预约表都随关卡重置。
    state.boardSession = new BoardSession(currentLevel(), grid);
    state.lanes = makeQueue(state.blocks);
    state.slots = Array(6).fill(null);
    state.pendingSlots.clear();
    state.projectiles = [];
    state.particles = [];
    state.totalBlocks = state.blocks.length;
    state.remaining = state.totalBlocks;
    state.running = true;
    state.win = false;
    state.finishing = false;
    state.deadlockNotified = false;
    state.adLoading = false;
    state.unlockedSlots = 6;
    state.reviveCount = 0;
    resultPanel.hidden = true;
    reviveButton.hidden = true;
    slotUnlockButton.hidden = true;
    slotUnlockButton.classList.remove('loading');
    slotUnlockButton.querySelector('b').textContent = '解锁';
    slotUnlockButton.querySelector('small').textContent = '视频';
    const levelNumber = getLevelNumber(state.levelId, state.levelSet);
    document.querySelector('.level-copy strong').textContent = `关卡${levelNumber}`;
    levelJumpEl.value = levelNumber;
    renderQueue();
    updateProgress();
    resize();
    state.ready = true;
    const sessionId = state.sessionId;
    pixelRevealFrame = requestAnimationFrame(() => {
      // 等一帧让 renderer 吃到新尺寸和新纹理，再显示像素层。
      pixelRevealFrame = requestAnimationFrame(() => {
        if (sessionId !== state.sessionId) return;
        pixelLayer.visible = true;
        pixiCanvas.style.visibility = 'visible';
        canvas.style.visibility = 'visible';
      });
    });
  }

  function resize() {
    if (!state.level) return;
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    pixiApp.renderer.resolution = state.dpr;
    pixiApp.renderer.resize(rect.width, rect.height);

    const artHeightRatio = state.height < 500 ? .48 : .53;
    const pixelUnit = 1 / state.dpr;
    const level = currentLevel();
    const rawCell = Math.min(
      (state.width - 18) / level.cols,
      (state.height * artHeightRatio) / level.rows
    );
    const cell = Math.floor(rawCell / pixelUnit) * pixelUnit;
    const snapToPixel = value => Math.round(value / pixelUnit) * pixelUnit;
    state.grid = {
      cellX: cell,
      cellY: cell,
      x: snapToPixel((state.width - level.cols * cell) / 2),
      y: snapToPixel(Math.max(100, state.height * .13))
    };
    // 保留旧版激励视频入口的定位能力，当前关卡默认开放全部阵地。
    slotUnlockButton.style.left = `${slotX(5) - 29}px`;
    slotUnlockButton.style.top = `${slotY() - 31}px`;
    speedButton.style.left = `${Math.max(0, slotX(0) - 29)}px`;
    makeStars();
    rebuildPixelLayer();
  }

  function rebuildPixelLayer() {
    pixelLayer.removeChildren().forEach(display => display.destroy());
    pixelDisplays.clear();
    tileTextures.forEach(texture => texture.destroy(true));
    tileTextures.clear();
    const { x, y, cellX, cellY } = state.grid;
    const colors = new Set(state.blocks.map(block => block.color));
    colors.forEach(color => {
      tileTextures.set(color, createTileTexture(paletteFor(color), cellX, cellY));
    });
    state.blocks.filter(block => block.alive || block.launchPending).forEach(block => {
      const px = x + block.col * cellX;
      const py = y + block.row * cellY;
      const display = new Sprite(tileTextures.get(block.color));
      display.position.set(px, py);
      display.width = cellX;
      display.height = cellY;
      pixelLayer.addChild(display);
      pixelDisplays.set(block.id, display);
    });
  }

  function createTileTexture(palette, cellX, cellY) {
    const resolution = state.dpr;
    const width = Math.round(cellX * resolution);
    const height = Math.round(cellY * resolution);
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = width;
    tileCanvas.height = height;
    const tileCtx = tileCanvas.getContext('2d');
    const groove = 1;
    const radius = Math.max(2, Math.round(Math.min(width, height) * .1));

    // 深色底座连续铺满，相邻纹理拼接后形成同色凹槽，不会透出背景。
    tileCtx.fillStyle = palette.dark;
    tileCtx.fillRect(0, 0, width, height);

    const faceX = groove;
    const faceY = groove;
    const faceWidth = width - groove * 2;
    const faceHeight = height - groove * 2;
    const faceGradient = tileCtx.createLinearGradient(0, faceY, 0, faceY + faceHeight);
    faceGradient.addColorStop(0, palette.light);
    faceGradient.addColorStop(.18, palette.fill);
    faceGradient.addColorStop(.72, palette.fill);
    faceGradient.addColorStop(1, palette.dark);
    tileCtx.beginPath();
    tileCtx.roundRect(faceX, faceY, faceWidth, faceHeight, radius);
    tileCtx.fillStyle = faceGradient;
    tileCtx.fill();

    // 轻微左上高光与右下内阴影，接近参考图的软质像素块面。
    tileCtx.beginPath();
    tileCtx.roundRect(faceX + .5, faceY + .5, faceWidth - 1, faceHeight - 1, radius);
    tileCtx.strokeStyle = 'rgba(255,255,255,.18)';
    tileCtx.lineWidth = 1;
    tileCtx.stroke();
    tileCtx.fillStyle = 'rgba(255,255,255,.22)';
    tileCtx.fillRect(faceX + radius, faceY + 1, Math.max(1, faceWidth * .28), 1);

    const texture = Texture.from(tileCanvas);
    texture.source.scaleMode = 'linear';
    return texture;
  }

  function makeStars() {
    state.stars = Array.from({ length: 16 }, (_, i) => ({
      x: (i * 97.3) % state.width,
      y: 120 + ((i * 43.7) % Math.max(100, state.height - 160)),
      size: 1 + (i % 3) * .5,
      phase: i * .7
    }));
  }

  function renderQueue() {
    const previousPositions = new Map(
      [...queueEl.querySelectorAll('.cannon-card[data-cannon-id]')].map(card => [
        card.dataset.cannonId,
        card.getBoundingClientRect()
      ])
    );
    queueEl.innerHTML = '';
    const activeLanes = state.lanes
      .map((lane, laneIndex) => ({ lane, laneIndex }))
      .filter(({ lane }) => lane.length);
    queueEl.style.setProperty('--lane-count', Math.max(1, activeLanes.length));
    activeLanes.forEach(({ lane, laneIndex }) => {
      const laneEl = document.createElement('div');
      laneEl.className = 'queue-lane';
      lane.slice(0, 2).forEach((cannon, actualIndex) => {
        const button = document.createElement('button');
        button.className = `cannon-card ${actualIndex === 1 ? 'next' : ''}`;
        button.dataset.cannonId = cannon.id;
        button.style.setProperty('--cannon', paletteFor(cannon.color).fill);
        button.setAttribute('aria-label', `${cannon.ammo} 点${cannon.color}色共振能量`);
        button.innerHTML = '<span class="core-orb"><i></i></span>' + `<b>${cannon.ammo}</b>`;
        if (actualIndex === 0) button.addEventListener('click', () => deploy(laneIndex, button));
        laneEl.appendChild(button);
      });
      queueEl.appendChild(laneEl);
    });

    requestAnimationFrame(() => {
      queueEl.querySelectorAll('.cannon-card[data-cannon-id]').forEach(card => {
        const previous = previousPositions.get(card.dataset.cannonId);
        if (previous) {
          const current = card.getBoundingClientRect();
          const dx = previous.left - current.left;
          const dy = previous.top - current.top;
          if (Math.abs(dx) > .5 || Math.abs(dy) > .5) {
            card.animate([
              { transform: `translate(${dx}px, ${dy}px)`, opacity: .72 },
              { transform: 'translate(0, 0)', opacity: card.classList.contains('next') ? .48 : 1 }
            ], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
          }
        } else {
          card.animate([
            { transform: 'translateY(24px) scale(.92)', opacity: 0 },
            { transform: 'translateY(0) scale(1)', opacity: card.classList.contains('next') ? .48 : 1 }
          ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      });
    });
  }

  function deploy(laneIndex, sourceButton) {
    if (!state.running || !state.lanes[laneIndex].length) return;
    const sourceRect = sourceButton.getBoundingClientRect();
    const slotIndex = nearestEmptySlot(sourceRect);
    if (slotIndex < 0) {
      toast('共振阵地已满！等待当前核心完成');
      tone(130, .08, 'square', .045);
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const targetLeft = canvasRect.left + slotX(slotIndex) - 29;
    const targetTop = canvasRect.top + slotY() - 38;
    const cannon = { ...state.lanes[laneIndex].shift(), laneIndex };
    const sessionId = state.sessionId;
    state.pendingSlots.add(slotIndex);
    state.deadlockNotified = false;
    renderQueue();
    tone(240, .06, 'triangle', .04);
    if (navigator.vibrate) navigator.vibrate(12);

    const flight = sourceButton.cloneNode(true);
    flight.classList.remove('next');
    flight.classList.add('core-flight');
    Object.assign(flight.style, {
      position: 'fixed',
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`
    });
    document.body.appendChild(flight);
    const dx = targetLeft - sourceRect.left;
    const dy = targetTop - sourceRect.top;
    const animation = flight.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * .5}px, ${dy * .42}px) scale(1.08) rotate(-4deg)`, opacity: 1, offset: .52 },
      { transform: `translate(${dx}px, ${dy}px) scale(.94) rotate(0deg)`, opacity: 1 }
    ], { duration: 320, easing: 'cubic-bezier(.2,.72,.18,1)', fill: 'forwards' });

    animation.finished.catch(() => {}).then(() => {
      flight.remove();
      if (sessionId !== state.sessionId || !state.running) return;
      state.pendingSlots.delete(slotIndex);
      state.slots[slotIndex] = {
        ...cannon, initialAmmo: cannon.ammo, cooldown: .12, flash: 1, recoil: 0, retiring: false
      };
      launchAvailableTargets(state.slots[slotIndex], slotIndex);
      tone(430, .08, 'sine', .035);
    });
  }

  function nearestEmptySlot(sourceRect) {
    // 按被点击卡片的真实位置，匹配最近的空阵地；空列移除后仍然准确。
    const canvasRect = canvas.getBoundingClientRect();
    const laneX = sourceRect.left + sourceRect.width / 2 - canvasRect.left;
    return state.slots
      .slice(0, state.unlockedSlots)
      .map((cannon, index) => ({ cannon, index, distance: Math.abs(slotX(index) - laneX) }))
      .filter(item => !item.cannon && !state.pendingSlots.has(item.index))
      .sort((a, b) => a.distance - b.distance || a.index - b.index)[0]?.index ?? -1;
  }

  /**
   * 一次波次：向原包棋盘要目标并立刻提交。
   * 返回的每一条都已经把格子从棋盘上摘掉，直接进入起飞动画即可。
   */
  function launchAvailableTargets(cannon, slotIndex) {
    if (!state.boardSession) return false;
    const ownedShots = state.projectiles.filter(projectile => projectile.owner === cannon.id).length;
    const availableAmmo = Math.max(0, Math.min(
      cannon.ammo - ownedShots,
      MAX_ACTIVE_ABSORPTIONS - state.projectiles.length
    ));
    if (!availableAmmo) return false;
    const reservations = reserveWave(cannon, slotIndex, Math.min(availableAmmo, WAVE_SIZE));
    if (!reservations.length) return false;
    resonate(cannon, slotIndex, reservations.map(reservation => ({ block: reservation.block })), .045);
    return true;
  }

  /** 这颗核心此刻还有没有可打的目标（含马上会被腾空的目标）。 */
  function cannonHasTarget(cannon, slotIndex) {
    if (!state.boardSession || cannon.ammo <= 0) return false;
    const handle = boardCannonFor(cannon);
    handle.bulletTotalNum = Math.max(0, cannon.ammo);
    return state.boardSession.hasTarget(handle, slotColumn(slotIndex));
  }


  function slotX(index) {
    const slotWidth = 58;
    const slotCount = state.slots.length;
    const desiredSideSpace = Math.max(16, state.width * .06);
    const maximumSideSpace = Math.max(0, (state.width - slotWidth * slotCount) / 2);
    const sideSpace = Math.min(desiredSideSpace, maximumSideSpace);
    const firstCenter = sideSpace + slotWidth / 2;
    if (slotCount === 1) return state.width / 2;
    const step = (state.width - sideSpace * 2 - slotWidth) / (slotCount - 1);
    return firstCenter + index * step;
  }
  function slotY() { return state.height * (state.height < 500 ? .75 : .79); }
  function blockCenter(block) {
    return {
      x: state.grid.x + (block.col + .5) * state.grid.cellX,
      y: state.grid.y + (block.row + .5) * state.grid.cellY
    };
  }

  function update(dt) {
    state.time += dt;
    state.blocks.forEach(b => { b.pop = Math.max(0, b.pop - dt * 5); });

    if (state.running) {
      state.slots.forEach((cannon, index) => {
        if (!cannon) return;
        cannon.cooldown -= dt;
        cannon.flash = Math.max(0, cannon.flash - dt * 7);
        cannon.recoil = Math.max(0, cannon.recoil - dt * 6);
        const ownedShotCount = state.projectiles.filter(p => p.owner === cannon.id).length;
        const ownedShots = ownedShotCount > 0;
        if (cannon.ammo <= 0) {
          if (!ownedShots) state.slots[index] = null;
          return;
        }

        const colorStillExists = state.blocks.some(b => b.alive && b.color === cannon.color);
        if (!colorStillExists && !ownedShots) {
          cannon.ammo = 0;
          state.slots[index] = null;
          return;
        }

        if (cannon.cooldown <= 0) {
          // 预约一次要跑 A* 与外露空气刷新；失败也占用一个节拍，避免每帧重算。
          cannon.cooldown = .1;
          launchAvailableTargets(cannon, index);
        }
      });
    }

    state.projectiles.forEach(p => advanceEnergy(p, dt));
    state.projectiles = state.projectiles.filter(p => !p.done);

    state.particles.forEach(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 250 * dt;
      p.rotation += p.spin * dt;
    });
    state.particles = state.particles.filter(p => p.life > 0);
    if (state.running && state.remaining > 0 && !state.projectiles.length) checkDeadlock();
  }

  function resonate(cannon, index, selections, launchGap = 0, direct = false) {
    const end = { x: slotX(index), y: slotY() - 6 };
    cannon.cooldown = .1;
    cannon.flash = 1;
    cannon.recoil = 1;
    selections.forEach((selection, order) => {
      const target = selection.block;
      const start = blockCenter(target);
      const side = Math.sign(end.x - start.x) || (order % 2 ? 1 : -1);
      const control = {
        x: (start.x + end.x) / 2 + side * 18 + ((order % 5) - 2) * 5,
        y: Math.min(start.y, end.y) - 24 - (order % 4) * 5
      };
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const duration = direct ? Math.max(.23, Math.min(.45, distance / 650))
        : Math.max(.8, Math.min(1.8, distance / 220));
      // 棋盘上这一格早在预约提交时就被腾空；这里只负责视觉上的起飞。
      target.alive = false;
      target.launchPending = true;
      target.pop = 1;
      state.remaining--;
      state.projectiles.push({
        owner: cannon.id, color: cannon.color, start, end, control,
        x: start.x, y: start.y, t: 0,
        delay: order * launchGap,
        started: false,
        duration,
        done: false, target
      });
    });
    updateProgress();
    tone(455 + index * 12, .11, 'sine', .035);
  }

  function curvePoint(projectile, t) {
    const progress = Math.max(0, Math.min(1, t));
    const inverse = 1 - progress;
    return {
      x: inverse * inverse * projectile.start.x + 2 * inverse * progress * projectile.control.x + progress * progress * projectile.end.x,
      y: inverse * inverse * projectile.start.y + 2 * inverse * progress * projectile.control.y + progress * progress * projectile.end.y
    };
  }

  function advanceEnergy(energy, dt) {
    if (energy.delay > 0) {
      energy.delay -= dt * state.speedMultiplier;
      if (energy.delay > 0) return;
    }
    if (!energy.started) {
      energy.started = true;
      energy.target.launchPending = false;
      const pixelDisplay = pixelDisplays.get(energy.target.id);
      if (pixelDisplay) pixelDisplay.visible = false;
    }
    energy.t += dt * state.speedMultiplier / energy.duration;
    if (energy.t < 0) return;
    const point = curvePoint(energy, energy.t);
    energy.x = point.x;
    energy.y = point.y;
    if (energy.t >= 1) absorb(energy);
  }

  function absorb(projectile) {
    projectile.done = true;
    const owner = state.slots.find(cannon => cannon?.id === projectile.owner);
    if (owner) {
      owner.ammo = Math.max(0, owner.ammo - 1);
      owner.flash = 1;
    }
    state.deadlockNotified = false;
    burst(projectile.end.x, projectile.end.y, projectile.color, 3);
    const hasFlyingPixels = state.projectiles.some(energy => energy !== projectile && !energy.done);
    if (state.remaining === 0 && !hasFlyingPixels && !state.finishing) {
      state.finishing = true;
      setTimeout(() => finish(true), 450);
    }
  }

  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 115;
      state.particles.push({
        x, y, color, life: .42 + Math.random() * .5, maxLife: .92,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30,
        size: 2.5 + Math.random() * 4.5, rotation: Math.random() * 6, spin: (Math.random() - .5) * 12
      });
    }
  }

  function checkDeadlock() {
    const occupied = state.slots.slice(0, state.unlockedSlots).filter(Boolean);
    if (occupied.length < state.unlockedSlots) {
      state.stalledSince = 0;
      return;
    }
    const canShoot = occupied.some(cannon => cannonHasTarget(cannon, state.slots.indexOf(cannon)));
    if (canShoot) {
      state.stalledSince = 0;
      return;
    }
    // 原包的失败条件：停车区满位、没有运输任务、持续 3 秒。
    if (!state.stalledSince) {
      state.stalledSince = state.time;
      toast('所有阵地都被堵住了，3 秒后挑战失败');
      tone(180, .1, 'triangle', .03);
    } else if (state.time - state.stalledSince >= 3) {
      finish(false);
    }
  }

  function requestAdUnlock() {
    if (state.unlockedSlots >= 5 || state.adLoading || !state.running) return;
    state.adLoading = true;
    slotUnlockButton.classList.add('loading');
    slotUnlockButton.querySelector('b').textContent = '播放中';
    slotUnlockButton.querySelector('small').textContent = '激励视频';
    toast('激励视频接入位 · 正在模拟完整播放');

    // 抖音小游戏接入时：在激励视频 onClose({ isEnded: true }) 回调里调用 unlockExtraSlot()。
    setTimeout(unlockExtraSlot, 1100);
  }

  function unlockExtraSlot() {
    state.adLoading = false;
    state.unlockedSlots = 5;
    state.deadlockNotified = false;
    slotUnlockButton.classList.remove('loading');
    slotUnlockButton.hidden = true;
    toast('第 5 个机器人阵地已解锁！');
    tone(720, .16, 'sine', .05);
    if (navigator.vibrate) navigator.vibrate([18, 25, 35]);
  }

  function finish(win) {
    if (!state.running) return;
    state.running = false;
    state.win = win;
    const nextLevelId = win && getNextLevelId(state.levelId, state.levelSet);
    if (nextLevelId) {
      const sessionId = state.sessionId;
      const request = state.loadRequest;
      const collection = state.levelSet;
      setTimeout(() => {
        if (sessionId !== state.sessionId || request !== state.loadRequest || state.levelSet !== collection) return;
        toast(`进入第${getLevelNumber(nextLevelId, state.levelSet)}关`);
        init(nextLevelId);
      }, 620);
      return;
    }
    const sessionId = state.sessionId;
    const request = state.loadRequest;
    setTimeout(() => {
      if (sessionId !== state.sessionId || request !== state.loadRequest) return;
      resultEyebrow.textContent = win ? '任务完成' : '阵地堵塞';
      const canRevive = !win && state.reviveCount < MAX_REVIVES;
      resultTitle.textContent = win ? '共振完成！' : canRevive ? '六个阵地一起消除' : '换个顺序试试';
      resultText.textContent = win ? '能量核心已经吸收了所有像素'
        : canRevive ? '复活后，6 个核心会直接消除各自剩余弹药对应的色块，下方队列不变'
          : '所有阵地都被堵住了，请重新挑战本关';
      reviveButton.hidden = !canRevive;
      reviveButton.textContent = `复活并消除（剩余 ${MAX_REVIVES - state.reviveCount} 次）`;
      resultButton.textContent = win ? '再来一局' : '重新挑战';
      resultPanel.hidden = false;
      tone(win ? 660 : 110, .25, win ? 'sine' : 'sawtooth', .055);
    }, 220);
  }

  function revive() {
    if (state.running || state.win || state.reviveCount >= MAX_REVIVES || !state.level) return;
    // 保留已入场的核心；各自直接吸收与剩余弹药等量的同色方块，耗尽后正常离场。
    // 下方队列既不重排，也不接收阵地中的核心。
    state.slots.forEach((cannon, slotIndex) => {
      if (!cannon || cannon.ammo <= 0) return;
      const handle = boardCannonFor(cannon);
      handle.bulletTotalNum = cannon.ammo;
      const targets = state.boardSession.reserveDirect(handle, slotColumn(slotIndex), cannon.ammo);
      if (targets.length) resonate(cannon, slotIndex, targets.map(({ block }) => ({ block })), .008, true);
    });
    state.reviveCount++;
    state.stalledSince = 0;
    state.deadlockNotified = false;
    state.running = true;
    resultPanel.hidden = true;
    reviveButton.hidden = true;
    toast('复活成功，阵地核心正在直接消除');
    tone(680, .18, 'sine', .045);
  }

  function updateProgress() {
    blockCountEl.textContent = state.remaining;
    progressBar.style.width = `${(1 - state.remaining / state.totalBlocks) * 100}%`;
  }

  function draw() {
    syncSlotCores();
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.save();
    drawBackdrop();
    drawSlots();
    drawProjectiles();
    drawEffects();
    ctx.restore();
  }

  function drawBackdrop() {
    // 参考布局使用纯灰紫背景，不绘制星点、分隔线或“目标区”文字。
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  function drawSlots() {
    const y = slotY();
    ctx.textAlign = 'center';
    for (let i = 0; i < state.slots.length; i++) {
      const x = slotX(i);
      const cannon = state.slots[i];
      ctx.save();
      ctx.translate(x, y);
      if (i >= state.unlockedSlots) {
        ctx.fillStyle = 'rgba(66,54,97,.2)';
        roundRect(-29, -39, 58, 76, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.52)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        roundRect(-29, -39, 58, 76, 14);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (!cannon) {
        ctx.strokeStyle = 'rgba(255,255,255,.48)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 7]);
        roundRect(-29, -39, 58, 76, 14);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  function syncSlotCores() {
    const activeIds = new Set();
    const canvasRect = canvas.getBoundingClientRect();
    const coreLayerRect = slotCoresEl.getBoundingClientRect();
    state.slots.forEach((cannon, index) => {
      if (!cannon) return;
      activeIds.add(cannon.id);
      let core = slotCoresEl.querySelector(`[data-cannon-id="${cannon.id}"]`);
      if (!core) {
        core = document.createElement('button');
        core.type = 'button';
        core.tabIndex = -1;
        core.className = 'cannon-card slot-cannon';
        core.dataset.cannonId = cannon.id;
        core.innerHTML = '<span class="core-orb"><i></i></span><b></b>';
        slotCoresEl.appendChild(core);
      }
      core.style.setProperty('--cannon', paletteFor(cannon.color).fill);
      // 覆盖层与 Canvas 可能因布局、缩放或安全区产生偏移，使用实际页面坐标换算。
      core.style.left = `${canvasRect.left - coreLayerRect.left + slotX(index) - 29}px`;
      core.style.top = `${canvasRect.top - coreLayerRect.top + slotY() - 39}px`;
      const ammoEl = core.querySelector('b');
      const ammo = String(cannon.ammo);
      if (ammoEl.textContent !== ammo) ammoEl.textContent = ammo;
    });
    slotCoresEl.querySelectorAll('.slot-cannon').forEach(core => {
      if (!activeIds.has(core.dataset.cannonId)) core.remove();
    });
  }

  function drawProjectiles() {
    state.projectiles.forEach(drawEnergyStream);
  }

  function drawEnergyStream(energy) {
    if (energy.delay > 0 || energy.t < 0) return;
    const palette = paletteFor(energy.color);
    const head = curvePoint(energy, energy.t);
    const tail = curvePoint(energy, energy.t - .13);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = palette.fill;
    ctx.lineWidth = 5;
    ctx.globalAlpha = .28;
    ctx.shadowColor = palette.light;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects() {
    state.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2.3);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = paletteFor(p.color).fill;
      roundRect(-p.size / 2, -p.size / 2, p.size, p.size, 1.5);
      ctx.fill();
      ctx.restore();
    });
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  function tone(frequency, duration, type = 'sine', volume = .03) {
    if (state.muted) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) { /* audio is optional */ }
  }

  function loop(now) {
    const dt = Math.min(.033, (now - (state.last || now)) / 1000);
    state.last = now;
    if (state.ready) {
      update(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  async function refreshLevelLimit() {
    const collection = state.levelSet;
    try {
      const count = await getLevelCount(collection);
      if (collection === state.levelSet) levelJumpEl.max = count;
    } catch (error) {
      console.error(error);
    }
  }

  levelSetEl.addEventListener('change', () => {
    state.levelSet = levelSetEl.value;
    localStorage.setItem('pixel-cannon-level-set', state.levelSet);
    refreshLevelLimit();
    init(getLevelId(1, state.levelSet));
  });
  function jumpToLevel() {
    const max = Number(levelJumpEl.max) || 1;
    const number = Number(levelJumpEl.value);
    if (!Number.isInteger(number) || number < 1 || number > max) {
      toast(`请输入 1–${max} 之间的关卡`);
      return;
    }
    init(getLevelId(number, state.levelSet));
  }
  levelGoEl.addEventListener('click', jumpToLevel);
  levelJumpEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') jumpToLevel();
  });
  restartButton.addEventListener('click', () => init());
  resultButton.addEventListener('click', () => init());
  reviveButton.addEventListener('click', revive);
  slotUnlockButton.addEventListener('click', requestAdUnlock);
  speedButton.addEventListener('click', () => {
    state.speedMultiplier = state.speedMultiplier === 1 ? 2 : 1;
    speedButton.classList.toggle('active', state.speedMultiplier === 2);
    speedButton.querySelector('b').textContent = state.speedMultiplier === 2 ? '速度×2' : '速度×1';
    tone(state.speedMultiplier === 2 ? 620 : 360, .08, 'triangle', .035);
  });
  soundButton.addEventListener('click', () => {
    state.muted = !state.muted;
    soundButton.textContent = state.muted ? '×' : '♪';
    toast(state.muted ? '音效已关闭' : '音效已开启');
    if (!state.muted) tone(440, .08);
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { state.last = performance.now(); });

  refreshLevelLimit();
  init();
  requestAnimationFrame(loop);
})();
