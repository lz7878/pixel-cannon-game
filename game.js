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
  const slotUnlockButton = document.querySelector('#slotUnlockButton');

  const PALETTE = {
    M: { fill: '#e94f76', light: '#ff7e99', dark: '#a72e59' },
    Y: { fill: '#ffb63d', light: '#ffd76b', dark: '#d47724' },
    C: { fill: '#42cbe9', light: '#7eeafa', dark: '#2386b0' },
    W: { fill: '#f8f5ff', light: '#ffffff', dark: '#c8c1e4' },
    B: { fill: '#7965e8', light: '#a795ff', dark: '#4d3da8' },
    K: { fill: '#332c50', light: '#5e557c', dark: '#171329' }
  };

  const ART = [
    '....MMMM....',
    '...MMYYMM...',
    '..MYYYYYYM..',
    '.MYYCCCCYYM.',
    '.MYCWWWWCYM.',
    'MMYCWBBWCYMM',
    'MYCCWKKWCCYM',
    'MYYYCCCCYYYM',
    '.MMYYMMYYMM.',
    '..MM....MM..'
  ];

  const state = {
    width: 0, height: 0, dpr: 1,
    blocks: [], slots: [null, null, null, null, null], lanes: [[], [], [], []],
    projectiles: [], particles: [], shockwaves: [], stars: [],
    totalBlocks: 0, remaining: 0, running: true, win: false,
    deadlockNotified: false, adLoading: false, unlockedSlots: 4,
    muted: false, time: 0, last: 0, shake: 0,
    grid: { x: 0, y: 0, cell: 0 }
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

  function exposedFrom(blocks) {
    const alive = blocks.filter(b => b.alive && !b.reserved);
    return alive.filter(block => !alive.some(other => other.col === block.col && other.row > block.row));
  }

  function makeSolution(blocks) {
    const copy = blocks.map(b => ({ ...b }));
    const sequence = [];
    let guard = 0;
    while (copy.some(b => b.alive) && guard++ < 300) {
      const frontier = exposedFrom(copy);
      const counts = frontier.reduce((map, b) => map.set(b.color, (map.get(b.color) || 0) + 1), new Map());
      const color = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      let ammo = 0;
      while (ammo < 12) {
        const target = exposedFrom(copy).filter(b => b.color === color).sort((a, b) => b.row - a.row || a.col - b.col)[0];
        if (!target) break;
        target.alive = false;
        ammo++;
      }
      sequence.push({ color, ammo, id: `cannon-${sequence.length}` });
    }
    return sequence;
  }

  function init() {
    state.blocks = makeBlocks();
    const solution = makeSolution(state.blocks);
    state.lanes = [[], [], [], []];
    solution.forEach((cannon, i) => state.lanes[i % 4].push(cannon));
    state.slots = [null, null, null, null, null];
    state.projectiles = [];
    state.particles = [];
    state.shockwaves = [];
    state.totalBlocks = state.blocks.length;
    state.remaining = state.totalBlocks;
    state.running = true;
    state.win = false;
    state.deadlockNotified = false;
    state.adLoading = false;
    state.unlockedSlots = 4;
    state.shake = 0;
    resultPanel.hidden = true;
    slotUnlockButton.hidden = false;
    slotUnlockButton.classList.remove('loading');
    slotUnlockButton.querySelector('b').textContent = '解锁';
    slotUnlockButton.querySelector('small').textContent = '视频';
    renderQueue();
    updateProgress();
    resize();
    toast('4 个炮位已就绪，右侧可看视频解锁第 5 个');
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const cell = Math.min((state.width - 28) / ART[0].length, (state.height * .53) / ART.length);
    state.grid = {
      cell,
      x: (state.width - ART[0].length * cell) / 2,
      y: Math.max(86, state.height * .145)
    };
    // 让 DOM 视频按钮与 Canvas 中第 5 个炮位共享同一个中心点。
    slotUnlockButton.style.left = `${slotX(4) - 29}px`;
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
    state.lanes.forEach((lane, laneIndex) => {
      const laneEl = document.createElement('div');
      laneEl.className = 'queue-lane';
      if (!lane.length) {
        laneEl.innerHTML = '<span class="lane-empty">已发射完毕</span>';
      } else {
        lane.slice(0, 2).forEach((cannon, actualIndex) => {
          const button = document.createElement('button');
          button.className = `cannon-card ${actualIndex === 1 ? 'next' : ''}`;
          button.style.setProperty('--cannon', PALETTE[cannon.color].fill);
          button.setAttribute('aria-label', `${cannon.ammo} 发${cannon.color}色大炮`);
          button.innerHTML = `<b>${cannon.ammo}</b>`;
          if (actualIndex === 0) button.addEventListener('click', () => deploy(laneIndex));
          laneEl.appendChild(button);
        });
      }
      queueEl.appendChild(laneEl);
    });
  }

  function deploy(laneIndex) {
    if (!state.running || !state.lanes[laneIndex].length) return;
    const slotIndex = state.slots.slice(0, state.unlockedSlots).findIndex(slot => !slot);
    if (slotIndex < 0) {
      toast('炮位已满！等待炮弹打完');
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

  function getTarget(color, slotIndex) {
    const targets = exposedFrom(state.blocks).filter(b => b.color === color);
    if (!targets.length) return null;
    const cannonX = slotX(slotIndex);
    return targets.sort((a, b) => {
      const ax = blockCenter(a).x;
      const bx = blockCenter(b).x;
      return Math.abs(ax - cannonX) - Math.abs(bx - cannonX) || b.row - a.row;
    })[0];
  }

  function slotX(index) { return state.width * (.1 + index * .2); }
  function slotY() { return state.height * .88; }
  function blockCenter(block) {
    return {
      x: state.grid.x + (block.col + .5) * state.grid.cell,
      y: state.grid.y + (block.row + .5) * state.grid.cell
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

        if (cannon.cooldown <= 0) {
          const target = getTarget(cannon.color, index);
          if (target) fire(cannon, index, target);
        }
      });
    }

    state.projectiles.forEach(p => {
      p.t = Math.min(1, p.t + dt * 2.9);
      if (p.t >= 1 && !p.done) impact(p);
    });
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

  function fire(cannon, index, target) {
    const start = { x: slotX(index), y: slotY() - 30 };
    const end = blockCenter(target);
    target.reserved = true;
    cannon.ammo--;
    cannon.cooldown = .24;
    cannon.flash = 1;
    cannon.recoil = 1;
    state.projectiles.push({ owner: cannon.id, color: cannon.color, start, end, t: 0, done: false, target });
    tone(155 + index * 28, .045, 'square', .025);
  }

  function impact(projectile) {
    projectile.done = true;
    const target = projectile.target;
    if (!target.alive) return;
    target.alive = false;
    target.reserved = false;
    target.pop = 1;
    state.remaining--;
    state.deadlockNotified = false;
    state.shake = Math.min(6, state.shake + 2.5);
    burst(projectile.end.x, projectile.end.y, projectile.color, 9);
    state.shockwaves.push({ x: projectile.end.x, y: projectile.end.y, radius: 4, life: .28, color: projectile.color });
    updateProgress();
    tone(330 + Math.random() * 80, .04, 'sine', .02);
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
    const occupied = state.slots.slice(0, state.unlockedSlots).filter(Boolean);
    if (occupied.length < state.unlockedSlots) return;
    const canShoot = occupied.some((cannon, i) => getTarget(cannon.color, state.slots.indexOf(cannon)));
    if (!canShoot && state.unlockedSlots < 5) {
      if (!state.deadlockNotified) {
        state.deadlockNotified = true;
        toast('炮位堵住了，可以看视频解锁第 5 个炮位');
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
    toast('第 5 个炮位已解锁！');
    tone(720, .16, 'sine', .05);
    if (navigator.vibrate) navigator.vibrate([18, 25, 35]);
  }

  function finish(win) {
    if (!state.running) return;
    state.running = false;
    state.win = win;
    setTimeout(() => {
      resultEyebrow.textContent = win ? '任务完成' : '炮位堵塞';
      resultTitle.textContent = win ? '清除成功！' : '换个顺序试试';
      resultText.textContent = win ? '所有色块都被轰成了彩色碎片' : '所有炮位都找不到同色目标，调整装炮顺序再试一次';
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
    state.stars.forEach(star => {
      const alpha = .18 + (Math.sin(state.time * 1.7 + star.phase) + 1) * .12;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    const baseY = state.grid.y + ART.length * state.grid.cell + 12;
    ctx.strokeStyle = 'rgba(96,74,160,.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, baseY);
    ctx.lineTo(state.width - 30, baseY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(65,49,125,.28)';
    ctx.font = '800 10px ui-rounded, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('目标区', state.width / 2, baseY + 18);
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  function drawBlocks() {
    const { x, y, cell } = state.grid;
    state.blocks.filter(b => b.alive).forEach(block => {
      const px = x + block.col * cell;
      const py = y + block.row * cell;
      const gap = Math.max(1.5, cell * .08);
      const palette = PALETTE[block.color];
      const reservedPulse = block.reserved ? Math.sin(state.time * 18) * 1.2 : 0;
      ctx.save();
      ctx.translate(px + cell / 2, py + cell / 2);
      ctx.scale(1 + reservedPulse / cell, 1 + reservedPulse / cell);
      ctx.translate(-cell / 2, -cell / 2);

      ctx.shadowColor = 'rgba(40,27,82,.2)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = palette.dark;
      roundRect(gap, gap + 2, cell - gap * 2, cell - gap * 2, cell * .22);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      const grad = ctx.createLinearGradient(0, 0, cell, cell);
      grad.addColorStop(0, palette.light);
      grad.addColorStop(.35, palette.fill);
      grad.addColorStop(1, palette.dark);
      ctx.fillStyle = grad;
      roundRect(gap, gap, cell - gap * 2, cell - gap * 2 - 2, cell * .22);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.35)';
      roundRect(gap + cell * .13, gap + cell * .1, cell * .42, cell * .12, 4);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawSlots() {
    const y = slotY();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(65,49,125,.34)';
    ctx.font = '800 9px ui-rounded, sans-serif';
    ctx.fillText(`炮位 ${state.unlockedSlots}/5`, state.width / 2, y - 43);
    for (let i = 0; i < 5; i++) {
      const x = slotX(i);
      const cannon = state.slots[i];
      ctx.save();
      ctx.translate(x, y);
      if (i >= state.unlockedSlots) {
        ctx.fillStyle = 'rgba(66,54,97,.2)';
        roundRect(-28, -28, 56, 54, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.52)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        roundRect(-28, -28, 56, 54, 14);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (!cannon) {
        ctx.strokeStyle = 'rgba(86,65,150,.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        roundRect(-28, -28, 56, 54, 14);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(86,65,150,.45)';
        ctx.font = '900 18px sans-serif';
        ctx.fillText('+', 0, 6);
      } else {
        drawCannon(cannon);
      }
      ctx.restore();
    }
  }

  function drawCannon(cannon) {
    const palette = PALETTE[cannon.color];
    const recoil = cannon.recoil * 5;
    ctx.fillStyle = 'rgba(39,28,75,.16)';
    ctx.beginPath();
    ctx.ellipse(0, 25, 31, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#544c6e';
    roundRect(-28, 6, 56, 25, 11);
    ctx.fill();
    ctx.fillStyle = '#807795';
    roundRect(-23, 11, 46, 13, 7);
    ctx.fill();

    ctx.fillStyle = palette.dark;
    roundRect(-19, -7 + recoil, 38, 26, 10);
    ctx.fill();
    const grad = ctx.createLinearGradient(-14, 0, 15, 0);
    grad.addColorStop(0, palette.light);
    grad.addColorStop(.4, palette.fill);
    grad.addColorStop(1, palette.dark);
    ctx.fillStyle = grad;
    roundRect(-14, -35 + recoil, 28, 45, 9);
    ctx.fill();
    ctx.fillStyle = '#312942';
    ctx.beginPath();
    ctx.ellipse(0, -34 + recoil, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    roundRect(-9, -28 + recoil, 5, 24, 3);
    ctx.fill();

    if (cannon.flash > 0) {
      ctx.fillStyle = `rgba(255,228,96,${cannon.flash})`;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const radius = i % 2 ? 10 : 22;
        ctx.lineTo(Math.cos(a) * radius, -42 + Math.sin(a) * radius);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    roundRect(-15, -1, 30, 21, 8);
    ctx.fill();
    ctx.fillStyle = '#2b2441';
    ctx.font = '900 13px ui-rounded, sans-serif';
    ctx.fillText(cannon.ammo, 0, 14);
  }

  function drawProjectiles() {
    state.projectiles.forEach(p => {
      const eased = 1 - Math.pow(1 - p.t, 2);
      const x = p.start.x + (p.end.x - p.start.x) * eased;
      const linearY = p.start.y + (p.end.y - p.start.y) * eased;
      const y = linearY - Math.sin(p.t * Math.PI) * 45;
      const trailT = Math.max(0, p.t - .08);
      const tx = p.start.x + (p.end.x - p.start.x) * (1 - Math.pow(1 - trailT, 2));
      const ty = p.start.y + (p.end.y - p.start.y) * (1 - Math.pow(1 - trailT, 2)) - Math.sin(trailT * Math.PI) * 45;
      ctx.strokeStyle = `${PALETTE[p.color].fill}88`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.shadowColor = PALETTE[p.color].light;
      ctx.shadowBlur = 12;
      ctx.fillStyle = PALETTE[p.color].fill;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    });
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
