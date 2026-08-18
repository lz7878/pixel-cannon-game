(() => {
  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const queueEl = document.querySelector('#queue');
  const blockCountEl = document.querySelector('#blockCount');
  const progressBar = document.querySelector('#progressBar');
  const toastEl = document.querySelector('#toast');
  const resultPanel = document.querySelector('#resultPanel');
  const resultEyebrow = document.querySelector('#resultEyebrow');
  const resultTitle = document.querySelector('#resultTitle');
  const resultText = document.querySelector('#resultText');
  const resultButton = document.querySelector('#resultButton');
  const restartButton = document.querySelector('#restartButton');
  const soundButton = document.querySelector('#soundButton');
  const speedButton = document.querySelector('#speedButton');
  const slotUnlockButton = document.querySelector('#slotUnlockButton');

  const PALETTE = {
    R: { fill: '#ed2024', light: '#ff4646', dark: '#b81019' },
    G: { fill: '#63d84b', light: '#8aec68', dark: '#35ad2c' },
    D: { fill: '#079d18', light: '#24bb30', dark: '#05720f' },
    M: { fill: '#e94f76', light: '#ff7e99', dark: '#a72e59' },
    Y: { fill: '#ffb63d', light: '#ffd76b', dark: '#d47724' },
    C: { fill: '#42cbe9', light: '#7eeafa', dark: '#2386b0' },
    W: { fill: '#f8f5ff', light: '#ffffff', dark: '#c8c1e4' },
    B: { fill: '#7965e8', light: '#a795ff', dark: '#4d3da8' },
    K: { fill: '#292a31', light: '#41434d', dark: '#16171c' }
  };

  const ART = [
    '................KK................',
    '...............KRWK...............',
    '..............KRRRWK..............',
    '.............KRRRRRWK.............',
    '.............KRRKRRRK.............',
    '............KRRRKRRRWK............',
    '...........KRRRRRRRRRWK...........',
    '..........KRRRKRRRKRRRWK..........',
    '..........KRRRRRRRRRRRRK..........',
    '.KKK.....KRRKRRRRRRRKRRWK.....KKK.',
    'KRRRK....KRRKRRRKRRRKRRRK....KRRRK',
    'KRRRK...KRRRRRRRKRRRRRRRWK...KRRRK',
    'KRRRK...KRRRRRRRRRRRRRRRRK...KRRRK',
    '.KKGGK.KRRRRRRRRRRRRRRRRRWK.KGGKK.',
    '...KGGKKRRRRKRRRRRRRRKRRRRKKGGK...',
    '....KGGKRRRKWKRRRRRRKWKRRRRGGK....',
    '.....KKRRRRKKKRRRRRRKKKRRRRKK......',
    '.....KRKRRRRRRRRKKRRRRRRRRKRK.....',
    '....KRRRRRRRRRRRRRRRRRRRRRRRRK....',
    '....KRRRRRRRRRRRRRRRRRRRRRRRRK....',
    '...KGRRRRKRRRRRRRRRRRRRRKRRRRGK...',
    '..KGGGRRRKRRRRKRRRRKRRRRKRRRGGGK..',
    '..KDDGGGRRRRRRKRRRRKRRRRRRGGGDDK..',
    '...KDDGGGGRRRRRRRRRRRRRRGGGGDDK...',
    '....KDDDGGGGRRRRRRRRRRGGGGDDDK....',
    '.....KKDDDDGGGGGGGGGGGGDDDDKK.....',
    '.......KKDDDDDDDDDDDDDDDDKK.......',
    '...........KGKKKKKKKKGK...........',
    '...........KGK......KGK...........',
    '..........KKGK......KGKK..........',
    '.........KRRRRK....KRRRRK.........',
    '........KRRRRRK....KRRRRRK........',
    '........KWWWWWK....KWWWWWK........',
    '.........KKKKK......KKKKK.........'
  ];

  const QUEUE_ART = [
    'KKK',
    'RRK',
    'RRR',
    'GDR',
    'GKK',
    'KKK',
    'WGD',
    'W..'
  ];

  const state = {
    width: 0, height: 0, dpr: 1,
    blocks: [], slots: Array(6).fill(null), lanes: [[], [], []],
    projectiles: [], particles: [], shockwaves: [], stars: [],
    columnRevealAt: {},
    totalBlocks: 0, remaining: 0, running: true, win: false, finishing: false,
    deadlockNotified: false, adLoading: false, unlockedSlots: 6,
    muted: false, speedMultiplier: 1, time: 0, last: 0,
    grid: { x: 0, y: 0, cellX: 0, cellY: 0 }
  };

  let audioContext = null;
  let toastTimer = null;

  function makeBlocks() {
    const blocks = [];
    ART.forEach((row, r) => [...row].forEach((color, c) => {
      if (color !== '.') blocks.push({ id: `${r}-${c}`, row: r, col: c, color, alive: true, reserved: false, pop: 0 });
    }));
    return blocks;
  }

  const GRID_DIRECTIONS = [
    { row: -1, col: 0 }, { row: 1, col: 0 },
    { row: 0, col: -1 }, { row: 0, col: 1 }
  ];

  function cellKey(row, col) { return `${row},${col}`; }

  function findReachableTargets(blocks, startCol = Math.floor(ART[0].length / 2)) {
    const rows = ART.length;
    const cols = ART[0].length;
    const alive = blocks.filter(block => block.alive);
    const occupied = new Set(alive.map(block => cellKey(block.row, block.col)));
    const start = { row: rows, col: Math.max(-1, Math.min(cols, startCol)) };
    const startKey = cellKey(start.row, start.col);
    const queue = [start];
    const visited = new Set([startKey]);
    const parents = new Map();
    const distances = new Map([[startKey, 0]]);

    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const currentKey = cellKey(cell.row, cell.col);
      GRID_DIRECTIONS.forEach(direction => {
        const next = { row: cell.row + direction.row, col: cell.col + direction.col };
        if (next.row < -1 || next.row > rows || next.col < -1 || next.col > cols) return;
        const nextKey = cellKey(next.row, next.col);
        if (visited.has(nextKey) || occupied.has(nextKey)) return;
        visited.add(nextKey);
        parents.set(nextKey, currentKey);
        distances.set(nextKey, (distances.get(currentKey) || 0) + 1);
        queue.push(next);
      });
    }

    return alive.filter(block => !block.reserved).flatMap(block => {
      const approaches = GRID_DIRECTIONS
        .map(direction => ({ row: block.row + direction.row, col: block.col + direction.col }))
        .filter(cell => visited.has(cellKey(cell.row, cell.col)))
        .sort((a, b) => distances.get(cellKey(a.row, a.col)) - distances.get(cellKey(b.row, b.col)));
      if (!approaches.length) return [];

      const route = [];
      let routeKey = cellKey(approaches[0].row, approaches[0].col);
      while (routeKey) {
        const [row, col] = routeKey.split(',').map(Number);
        route.push({ row, col });
        if (routeKey === startKey) break;
        routeKey = parents.get(routeKey);
      }
      route.reverse();
      return [{ block, route, distance: route.length }];
    });
  }

  function makeQueue(blocks) {
    const totals = blocks.reduce((counts, block) => {
      counts[block.color] = (counts[block.color] || 0) + 1;
      return counts;
    }, {});
    const occurrences = [...QUEUE_ART.join('')].reduce((counts, color) => {
      if (color !== '.') counts[color] = (counts[color] || 0) + 1;
      return counts;
    }, {});
    const used = {};
    const lanes = Array.from({ length: 3 }, () => []);

    QUEUE_ART.forEach((row, rowIndex) => [...row].forEach((color, laneIndex) => {
      if (color === '.') return;
      const indexForColor = used[color] || 0;
      const baseAmmo = Math.floor(totals[color] / occurrences[color]);
      const extraAmmo = totals[color] % occurrences[color];
      const ammo = baseAmmo + (indexForColor < extraAmmo ? 1 : 0);
      used[color] = indexForColor + 1;
      lanes[laneIndex].push({ color, ammo, id: `cannon-${rowIndex}-${laneIndex}` });
    }));
    return lanes;
  }

  function init() {
    state.blocks = makeBlocks();
    state.lanes = makeQueue(state.blocks);
    state.slots = Array(6).fill(null);
    state.projectiles = [];
    state.particles = [];
    state.shockwaves = [];
    state.columnRevealAt = {};
    state.totalBlocks = state.blocks.length;
    state.remaining = state.totalBlocks;
    state.running = true;
    state.win = false;
    state.finishing = false;
    state.deadlockNotified = false;
    state.adLoading = false;
    state.unlockedSlots = 6;
    resultPanel.hidden = true;
    slotUnlockButton.hidden = true;
    slotUnlockButton.classList.remove('loading');
    slotUnlockButton.querySelector('b').textContent = '解锁';
    slotUnlockButton.querySelector('small').textContent = '视频';
    renderQueue();
    updateProgress();
    resize();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const artHeightRatio = state.height < 500 ? .48 : .53;
    const cell = Math.min(
      (state.width - 18) / ART[0].length,
      (state.height * artHeightRatio) / ART.length
    );
    state.grid = {
      cellX: cell,
      cellY: cell,
      x: (state.width - ART[0].length * cell) / 2,
      y: Math.max(64, state.height * .13)
    };
    // 保留旧版激励视频入口的定位能力，当前关卡默认开放全部阵地。
    slotUnlockButton.style.left = `${slotX(5) - 29}px`;
    slotUnlockButton.style.top = `${slotY() - 31}px`;
    speedButton.style.left = `${Math.max(0, slotX(0) - 29)}px`;
    makeStars();
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
    queueEl.innerHTML = '';
    queueEl.style.setProperty('--lane-count', state.lanes.length);
    state.lanes.forEach((lane, laneIndex) => {
      const laneEl = document.createElement('div');
      laneEl.className = 'queue-lane';
      if (!lane.length) {
        laneEl.innerHTML = '<span class="lane-empty">已出发完毕</span>';
      } else {
        lane.slice(0, 2).forEach((cannon, actualIndex) => {
          const button = document.createElement('button');
          button.className = `cannon-card ${actualIndex === 1 ? 'next' : ''}`;
          button.style.setProperty('--cannon', PALETTE[cannon.color].fill);
          button.setAttribute('aria-label', `${cannon.ammo} 点${cannon.color}色共振能量`);
          button.innerHTML = '<span class="core-orb"><i></i></span>' + `<b>${cannon.ammo}</b>`;
          if (actualIndex === 0) button.addEventListener('click', () => deploy(laneIndex));
          laneEl.appendChild(button);
        });
      }
      queueEl.appendChild(laneEl);
    });
  }

  function deploy(laneIndex) {
    if (!state.running || !state.lanes[laneIndex].length) return;
    const slotIndex = nearestEmptySlot(laneIndex);
    if (slotIndex < 0) {
      toast('共振阵地已满！等待当前核心完成');
      tone(130, .08, 'square', .045);
      return;
    }
    const cannon = state.lanes[laneIndex].shift();
    state.slots[slotIndex] = { ...cannon, initialAmmo: cannon.ammo, cooldown: .14, flash: 0, recoil: 0, retiring: false };
    state.deadlockNotified = false;
    renderQueue();
    tone(240, .06, 'triangle', .04);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function nearestEmptySlot(laneIndex) {
    // 使用队列列在页面上的真实中心点；队列整体居中或列数变化时仍能
    // 严格按照实际距离选择阵地，最近的被占用后再选择下一近的位置。
    const laneEl = queueEl.children[laneIndex];
    const laneRect = laneEl?.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const laneX = laneRect
      ? laneRect.left + laneRect.width / 2 - canvasRect.left
      : state.width * ((laneIndex + .5) / state.lanes.length);
    return state.slots
      .slice(0, state.unlockedSlots)
      .map((cannon, index) => ({ cannon, index, distance: Math.abs(slotX(index) - laneX) }))
      .filter(item => !item.cannon)
      .sort((a, b) => a.distance - b.distance || a.index - b.index)[0]?.index ?? -1;
  }

  function getTargets(color, slotIndex, limit = 1) {
    const startCol = Math.max(0, Math.min(ART[0].length - 1,
      Math.floor((slotX(slotIndex) - state.grid.x) / state.grid.cellX)
    ));
    const targets = findReachableTargets(state.blocks, startCol).filter(item =>
      item.block.color === color && (state.columnRevealAt[item.block.col] || 0) <= state.time
    );
    const cannonX = slotX(slotIndex);
    return targets.sort((a, b) => {
      const ax = blockCenter(a.block).x;
      const bx = blockCenter(b.block).x;
      return a.distance - b.distance || Math.abs(ax - cannonX) - Math.abs(bx - cannonX);
    }).slice(0, limit);
  }

  function getTarget(color, slotIndex) { return getTargets(color, slotIndex, 1)[0] || null; }

  function resonanceLevel(index, color) {
    let level = 1;
    if (state.slots[index - 1]?.color === color) level++;
    if (state.slots[index + 1]?.color === color) level++;
    return level;
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
        cannon.pulse = Math.max(0, (cannon.pulse || 0) - dt * 2.8);

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

        const availableAmmo = cannon.ammo - ownedShotCount;
        if (cannon.cooldown <= 0 && availableAmmo > 0) {
          const level = resonanceLevel(index, cannon.color);
          const targets = getTargets(cannon.color, index, availableAmmo);
          if (targets.length) resonate(cannon, index, targets, level);
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
    state.shockwaves.forEach(s => { s.life -= dt; s.radius += dt * 95; });
    state.shockwaves = state.shockwaves.filter(s => s.life > 0);

    if (state.running && state.remaining > 0 && !state.projectiles.length) checkDeadlock();
  }

  function resonate(cannon, index, selections, level) {
    const end = { x: slotX(index), y: slotY() - 6 };
    cannon.cooldown = level > 1 ? .045 : .07;
    cannon.flash = 1;
    cannon.recoil = 1;
    cannon.pulse = 1;
    selections.forEach((selection, order) => {
      const target = selection.block;
      const start = blockCenter(target);
      const side = Math.sign(end.x - start.x) || (order % 2 ? 1 : -1);
      const control = {
        x: (start.x + end.x) / 2 + side * 18 + ((order % 5) - 2) * 5,
        y: Math.min(start.y, end.y) - 24 - (order % 4) * 5
      };
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const duration = Math.max(.2, Math.min(.58, distance / 820));
      // 像素一旦起飞就立即离开图案；到达核心时只结算核心数值。
      target.alive = false;
      target.reserved = false;
      target.pop = 1;
      state.remaining--;
      state.columnRevealAt[target.col] = state.time + .035;
      state.projectiles.push({
        owner: cannon.id, color: cannon.color, start, end, control,
        x: start.x, y: start.y, t: 0,
        duration,
        done: false, target
      });
    });
    updateProgress();
    state.shockwaves.push({ x: end.x, y: end.y, radius: 9, life: .48, color: cannon.color });
    tone(360 + level * 95 + index * 12, .11, 'sine', .035);
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
      owner.pulse = 1;
    }
    state.deadlockNotified = false;
    burst(projectile.end.x, projectile.end.y, projectile.color, 3);
    state.shockwaves.push({ x: projectile.end.x, y: projectile.end.y, radius: 3, life: .24, color: projectile.color });
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
    if (Object.values(state.columnRevealAt).some(readyAt => readyAt > state.time)) return;
    const occupied = state.slots.slice(0, state.unlockedSlots).filter(Boolean);
    if (occupied.length < state.unlockedSlots) return;
    const canShoot = occupied.some((cannon, i) => getTarget(cannon.color, state.slots.indexOf(cannon)));
    if (!canShoot && state.unlockedSlots < 5) {
      if (!state.deadlockNotified) {
        state.deadlockNotified = true;
        toast('机器人阵地堵住了，可以看视频解锁第 5 个阵地');
        tone(105, .14, 'sawtooth', .035);
      }
      return;
    }
    if (!canShoot) finish(false);
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
    setTimeout(() => {
      resultEyebrow.textContent = win ? '任务完成' : '阵地堵塞';
      resultTitle.textContent = win ? '共振完成！' : '换个顺序试试';
      resultText.textContent = win ? '能量核心已经吸收了所有像素' : '所有能量核心都找不到同色目标，调整进入阵地的顺序再试一次';
      resultButton.textContent = win ? '再来一局' : '重新挑战';
      resultPanel.hidden = false;
      tone(win ? 660 : 110, .25, win ? 'sine' : 'sawtooth', .055);
    }, 220);
  }

  function updateProgress() {
    blockCountEl.textContent = state.remaining;
    progressBar.style.width = `${(1 - state.remaining / state.totalBlocks) * 100}%`;
  }

  function draw() {
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.save();
    drawBackdrop();
    drawBlocks();
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

  function drawBlocks() {
    const { x, y, cellX, cellY } = state.grid;
    const cell = Math.min(cellX, cellY);
    state.blocks.filter(b => b.alive).forEach(block => {
      const px = x + block.col * cellX;
      const py = y + block.row * cellY;
      // 参考图中的积木几乎紧贴，只留一条很细的接缝。
      const gapX = Math.max(.3, cellX * .022);
      const gapY = Math.max(.3, cellY * .022);
      const palette = PALETTE[block.color];
      const reservedPulse = block.reserved ? Math.sin(state.time * 18) * 1.2 : 0;
      ctx.save();
      ctx.translate(px + cellX / 2, py + cellY / 2);
      ctx.scale(1 + reservedPulse / cell, 1 + reservedPulse / cell);
      ctx.translate(-cellX / 2, -cellY / 2);

      ctx.shadowColor = 'rgba(40,27,82,.2)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 1.5;
      ctx.fillStyle = palette.dark;
      roundRect(gapX, gapY + 1, cellX - gapX * 2, cellY - gapY * 2, cell * .2);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      const grad = ctx.createLinearGradient(0, 0, cellX, cellY);
      grad.addColorStop(0, palette.light);
      grad.addColorStop(.35, palette.fill);
      grad.addColorStop(1, palette.dark);
      ctx.fillStyle = grad;
      roundRect(gapX, gapY, cellX - gapX * 2, cellY - gapY * 2 - 1, cell * .2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.35)';
      roundRect(gapX + cellX * .13, gapY + cellY * .1, cellX * .42, cellY * .12, 4);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawSlots() {
    const y = slotY();
    ctx.textAlign = 'center';
    for (let i = 0; i < state.slots.length - 1; i++) {
      const left = state.slots[i];
      const right = state.slots[i + 1];
      if (!left || !right || left.color !== right.color) continue;
      const palette = PALETTE[left.color];
      const pulse = .55 + Math.sin(state.time * 10 + i) * .22;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 3;
      ctx.shadowColor = palette.fill;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(slotX(i) + 20, y - 6);
      ctx.bezierCurveTo(slotX(i) + 35, y - 19, slotX(i + 1) - 35, y + 7, slotX(i + 1) - 20, y - 6);
      ctx.stroke();
      ctx.restore();
    }
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
      } else {
        drawCannon(cannon, i);
      }
      ctx.restore();
    }
  }

  function drawCannon(cannon, index) {
    const palette = PALETTE[cannon.color];
    const level = resonanceLevel(index, cannon.color);
    const bob = Math.sin(state.time * 3.5 + cannon.ammo) * 1.1;
    const pulse = cannon.pulse || 0;
    ctx.fillStyle = 'rgba(39,28,75,.16)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(0, bob);
    ctx.globalAlpha = .35 + pulse * .45;
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 2 + pulse * 3;
    ctx.shadowColor = palette.fill;
    ctx.shadowBlur = 12 + pulse * 15;
    ctx.beginPath();
    ctx.arc(0, -5, 23 + pulse * 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.rotate(state.time * (.7 + level * .12));
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -5, 21, -.2, 1.25);
    ctx.arc(0, -5, 21, Math.PI - .2, Math.PI + 1.05);
    ctx.stroke();
    ctx.restore();

    const grad = ctx.createRadialGradient(-6, -12, 2, 0, -5, 19);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(.16, palette.light);
    grad.addColorStop(.56, palette.fill);
    grad.addColorStop(1, palette.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, -5, 18 + pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = '1000 14px ui-rounded, sans-serif';
    ctx.shadowColor = 'rgba(20,18,35,.75)';
    ctx.shadowBlur = 3;
    ctx.fillText(cannon.ammo, 0, 0);
    ctx.shadowBlur = 0;
    if (level > 1) {
      ctx.fillStyle = '#fff6a9';
      ctx.font = '1000 9px ui-rounded, sans-serif';
      ctx.fillText(`共振×${level}`, 0, 25);
    }
    ctx.restore();
  }

  function drawProjectiles() {
    state.projectiles.forEach(drawEnergyStream);
  }

  function drawEnergyStream(energy) {
    if (energy.t < 0) return;
    const palette = PALETTE[energy.color];
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
    state.shockwaves.forEach(s => {
      ctx.globalAlpha = s.life / .42;
      ctx.strokeStyle = PALETTE[s.color].light;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    state.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2.3);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = PALETTE[p.color].fill;
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
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  restartButton.addEventListener('click', init);
  resultButton.addEventListener('click', init);
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

  init();
  requestAnimationFrame(loop);
})();
