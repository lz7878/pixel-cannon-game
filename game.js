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
    totalBlocks: 0, remaining: 0, running: true, win: false,
    deadlockNotified: false, adLoading: false, unlockedSlots: 6,
    muted: false, speedMultiplier: 1, time: 0, last: 0, shake: 0,
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
    state.deadlockNotified = false;
    state.adLoading = false;
    state.unlockedSlots = 6;
    state.shake = 0;
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
          button.setAttribute('aria-label', `${cannon.ammo} 个${cannon.color}色爆破机器人`);
          button.innerHTML = '<span class="robot-face"><i></i><i></i></span>' + `<b>${cannon.ammo}</b>`;
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
      toast('机器人阵地已满！等待当前任务完成');
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
    // 机器人队列均匀分布在屏幕上，用水平距离匹配最近的空阵地。
    const laneX = state.width * ((laneIndex + .5) / state.lanes.length);
    return state.slots
      .slice(0, state.unlockedSlots)
      .map((cannon, index) => ({ cannon, index, distance: Math.abs(slotX(index) - laneX) }))
      .filter(item => !item.cannon)
      .sort((a, b) => a.distance - b.distance || Math.abs(slotX(a.index) - state.width / 2) - Math.abs(slotX(b.index) - state.width / 2))[0]?.index ?? -1;
  }

  function getTarget(color, slotIndex) {
    const startCol = Math.max(0, Math.min(ART[0].length - 1,
      Math.floor((slotX(slotIndex) - state.grid.x) / state.grid.cellX)
    ));
    const targets = findReachableTargets(state.blocks, startCol).filter(item =>
      item.block.color === color && (state.columnRevealAt[item.block.col] || 0) <= state.time
    );
    if (!targets.length) return null;
    const cannonX = slotX(slotIndex);
    return targets.sort((a, b) => {
      const ax = blockCenter(a.block).x;
      const bx = blockCenter(b.block).x;
      return a.distance - b.distance || Math.abs(ax - cannonX) - Math.abs(bx - cannonX);
    })[0];
  }

  function slotX(index) { return state.width * ((index + .5) / state.slots.length); }
  function slotY() { return state.height * (state.height < 500 ? .75 : .79); }
  function blockCenter(block) {
    return {
      x: state.grid.x + (block.col + .5) * state.grid.cellX,
      y: state.grid.y + (block.row + .5) * state.grid.cellY
    };
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 12);
    state.blocks.forEach(b => { b.pop = Math.max(0, b.pop - dt * 5); });

    if (state.running) {
      state.slots.forEach((cannon, index) => {
        if (!cannon) return;
        cannon.cooldown -= dt;
        cannon.flash = Math.max(0, cannon.flash - dt * 7);
        cannon.recoil = Math.max(0, cannon.recoil - dt * 6);

        const ownedShots = state.projectiles.some(p => p.owner === cannon.id);
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

        if (cannon.cooldown <= 0 && !ownedShots) {
          const target = getTarget(cannon.color, index);
          if (target) fire(cannon, index, target);
        }
      });
    }

    state.projectiles.forEach(p => advanceRobot(p, dt));
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

  function fire(cannon, index, selection) {
    const target = selection.block;
    const start = { x: slotX(index), y: slotY() - 18 };
    const end = blockCenter(target);
    const path = compactPath([
      start,
      ...selection.route.map(gridCellCenter),
      end
    ]);
    target.reserved = true;
    cannon.ammo--;
    cannon.cooldown = .24;
    cannon.flash = 1;
    cannon.recoil = 1;
    state.projectiles.push({
      owner: cannon.id, color: cannon.color, start, end, path,
      x: start.x, y: start.y, segment: 0, speed: 360,
      walk: 0, direction: 1, done: false, target
    });
    tone(220 + index * 22, .055, 'triangle', .025);
  }

  function compactPath(points) {
    const unique = points.filter((point, index) =>
      index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1
    );
    return unique.filter((point, index) => {
      if (index === 0 || index === unique.length - 1) return true;
      const previous = unique[index - 1];
      const next = unique[index + 1];
      const sameX = Math.abs(previous.x - point.x) < 1 && Math.abs(point.x - next.x) < 1;
      const sameY = Math.abs(previous.y - point.y) < 1 && Math.abs(point.y - next.y) < 1;
      return !sameX && !sameY;
    });
  }

  function gridCellCenter(cell) {
    return {
      x: state.grid.x + (cell.col + .5) * state.grid.cellX,
      y: state.grid.y + (cell.row + .5) * state.grid.cellY
    };
  }

  function advanceRobot(robot, dt) {
    let distanceLeft = robot.speed * state.speedMultiplier * dt;
    robot.walk += dt * 12;

    while (distanceLeft > 0 && !robot.done) {
      const next = robot.path[robot.segment + 1];
      if (!next) {
        impact(robot);
        return;
      }

      const dx = next.x - robot.x;
      const dy = next.y - robot.y;
      const distance = Math.hypot(dx, dy);
      if (Math.abs(dx) > 1) robot.direction = Math.sign(dx);

      if (distance <= distanceLeft + .01) {
        robot.x = next.x;
        robot.y = next.y;
        robot.segment++;
        distanceLeft -= distance;
        if (robot.segment >= robot.path.length - 1) impact(robot);
      } else {
        robot.x += dx / distance * distanceLeft;
        robot.y += dy / distance * distanceLeft;
        distanceLeft = 0;
      }
    }
  }

  function impact(projectile) {
    projectile.done = true;
    const target = projectile.target;
    if (!target.alive) return;
    target.alive = false;
    target.reserved = false;
    target.pop = 1;
    // 命中后留出一个短暂的碎裂节拍，再开放同列后方的新目标。
    state.columnRevealAt[target.col] = state.time + .14;
    state.remaining--;
    state.deadlockNotified = false;
    state.shake = Math.min(6, state.shake + 2.5);
    burst(projectile.end.x, projectile.end.y, projectile.color, 14);
    state.shockwaves.push({ x: projectile.end.x, y: projectile.end.y, radius: 4, life: .36, color: projectile.color });
    updateProgress();
    tone(120 + Math.random() * 35, .11, 'sawtooth', .04);
    if (state.remaining === 0) setTimeout(() => finish(true), 450);
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
      resultTitle.textContent = win ? '爆破成功！' : '换个顺序试试';
      resultText.textContent = win ? '爆破机器人已经清除了所有色块' : '所有机器人队伍都找不到同色目标，调整上阵顺序再试一次';
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
    const sx = state.shake ? (Math.random() - .5) * state.shake : 0;
    const sy = state.shake ? (Math.random() - .5) * state.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
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
        drawCannon(cannon);
      }
      ctx.restore();
    }
  }

  function drawCannon(cannon) {
    const palette = PALETTE[cannon.color];
    const bob = Math.sin(state.time * 3 + cannon.ammo) * 1.2;
    ctx.fillStyle = 'rgba(39,28,75,.16)';
    ctx.beginPath();
    ctx.ellipse(0, 25, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(0, bob);
    ctx.fillStyle = palette.dark;
    roundRect(-18, -9, 36, 31, 10);
    ctx.fill();
    const grad = ctx.createLinearGradient(-17, -30, 17, 0);
    grad.addColorStop(0, palette.light);
    grad.addColorStop(.4, palette.fill);
    grad.addColorStop(1, palette.dark);
    ctx.fillStyle = grad;
    roundRect(-19, -31, 38, 25, 11);
    ctx.fill();

    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -31);
    ctx.lineTo(0, -38);
    ctx.stroke();
    ctx.fillStyle = cannon.flash > 0 ? '#ffe75b' : palette.light;
    ctx.beginPath();
    ctx.arc(0, -40, 4 + cannon.flash * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#312942';
    roundRect(-14, -25, 28, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-6, -19, 2.5, 0, Math.PI * 2);
    ctx.arc(6, -19, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.dark;
    roundRect(-19, 17, 13, 11, 4);
    ctx.fill();
    roundRect(6, 17, 13, 11, 4);
    ctx.fill();

    ctx.fillStyle = '#fff';
    roundRect(-15, -3, 30, 21, 8);
    ctx.fill();
    ctx.fillStyle = '#2b2441';
    ctx.font = '900 13px ui-rounded, sans-serif';
    ctx.fillText(cannon.ammo, 0, 12);
    ctx.restore();
  }

  function drawProjectiles() {
    state.projectiles.forEach(p => {
      drawWalkingRobot(p);
    });
  }

  function drawWalkingRobot(robot) {
    const palette = PALETTE[robot.color];
    const step = Math.sin(robot.walk) * 1.8;
    const bob = Math.abs(Math.sin(robot.walk)) * 1.5;
    ctx.save();
    ctx.translate(robot.x, robot.y - bob);
    ctx.scale(robot.direction, 1);

    ctx.fillStyle = 'rgba(38,28,69,.18)';
    ctx.beginPath();
    ctx.ellipse(0, 10 + bob, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#29233c';
    ctx.beginPath();
    ctx.arc(-7, -1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffdf52';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-9, -5);
    ctx.quadraticCurveTo(-12, -10, -8, -12);
    ctx.stroke();
    ctx.fillStyle = '#ff8652';
    ctx.beginPath();
    ctx.arc(-8, -12, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.dark;
    roundRect(-7, 2 + step, 5, 9, 2);
    ctx.fill();
    roundRect(2, 2 - step, 5, 9, 2);
    ctx.fill();

    const bodyGrad = ctx.createLinearGradient(-7, -9, 7, 7);
    bodyGrad.addColorStop(0, palette.light);
    bodyGrad.addColorStop(.45, palette.fill);
    bodyGrad.addColorStop(1, palette.dark);
    ctx.fillStyle = bodyGrad;
    roundRect(-8, -9, 16, 15, 5);
    ctx.fill();
    roundRect(-9, -16, 18, 10, 5);
    ctx.fill();

    ctx.fillStyle = '#302a46';
    roundRect(-6, -14, 12, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-2.5, -11, 1.25, 0, Math.PI * 2);
    ctx.arc(2.5, -11, 1.25, 0, Math.PI * 2);
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
