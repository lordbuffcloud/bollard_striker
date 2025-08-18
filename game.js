(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const screen = { width: canvas.width, height: canvas.height };

  // Colors
  const COLORS = {
    PRIMARY_BACKGROUND: '#2c2f33',
    SECONDARY_BACKGROUND: '#40444b',
    ELECTRIC_ORANGE: '#ff6f00',
    CAUTION_YELLOW: '#ffd700',
    DEEP_RED: '#b22222',
    BOLT_BLUE: '#4682b4',
    WHITE: '#ffffff',
    CARBON_BLACK: '#0d0d0d',
    METALLIC_SILVER: '#c0c0c0',
    NEON_GREEN: '#39ff14'
  };

  // Assets
  const visitorImg = new Image();
  visitorImg.src = 'bollard_striker/visitor.png';
  const bollardImg = new Image();
  bollardImg.src = 'bollard_striker/bollard.png';

  const sfx = {
    collision: new Audio('bollard_striker/sounds/collision.mp3'),
    click: new Audio('bollard_striker/sounds/click.mp3')
  };
  sfx.collision.preload = 'auto';
  sfx.click.preload = 'auto';

  // Game State
  let soundEnabled = false;
  let currentLevel = 1;
  let levelThreshold = 10; // retained for display compatibility
  let scoreMultiplier = 1; // retained for display compatibility
  let score = 0;
  let health = 3;
  let running = false;
  let streak = 0;
  let bestStreak = 0;

  // Player
  const player = {
    width: 100,
    height: 100,
    x: Math.floor(screen.width / 2) - 50,
    y: screen.height - 150,
    // pixels per second
    speed: 420,
    leftPressed: false,
    rightPressed: false
  };

  // Bollards
  const bollards = [];
  const bollard = { width: 50, height: 50, speed: 90 }; // pixels per second (slow start)
  function initBollards() {
    bollards.length = 0;
    for (let i = 0; i < 5; i += 1) {
      const x = Math.floor(Math.random() * (screen.width - bollard.width));
      const y = Math.floor(-50 - Math.random() * 100);
      bollards.push({ x, y });
    }
  }

  // Shield power-up
  const shield = { active: false, visible: false, x: 0, y: 0, size: 24, vy: 120 };
  function maybeSpawnShield() {
    if (shield.visible || shield.active) return;
    // ~8% chance per dodged bollard
    if (Math.random() < 0.08) {
      shield.visible = true;
      shield.x = Math.floor(16 + Math.random() * (screen.width - 32));
      shield.y = -shield.size;
    }
  }

  // UI elements
  const el = {
    landing: document.getElementById('landing'),
    leaderboard: document.getElementById('leaderboard'),
    gameOver: document.getElementById('gameOver'),
    lbList: document.getElementById('leaderboardList'),
    startBtn: document.getElementById('startBtn'),
    leaderboardBtn: document.getElementById('leaderboardBtn'),
    backFromLeaderboard: document.getElementById('backFromLeaderboard'),
    nameForm: document.getElementById('nameForm'),
    playerName: document.getElementById('playerName'),
    finalScore: document.getElementById('finalScore'),
    finalLevel: document.getElementById('finalLevel'),
    moveLeft: document.getElementById('moveLeft'),
    moveRight: document.getElementById('moveRight'),
    soundToggle: document.getElementById('soundToggle'),
  };

  document.getElementById('year').textContent = new Date().getFullYear().toString();

  // Leaderboard using localStorage
  const LB_KEY = 'bollard-striker-leaderboard-v1';
  const DEFAULT_LB = [
    { name: 'woodpecker', score: -3, level: 1, date: 'Lore' }
  ];
  function getLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      if (!raw) return DEFAULT_LB;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LB;
      return parsed;
    } catch {
      return DEFAULT_LB;
    }
  }
  function saveLeaderboard(entries) {
    const top = [...entries].sort((a, b) => b.score - a.score).slice(0, 5);
    localStorage.setItem(LB_KEY, JSON.stringify(top));
  }
  function renderLeaderboard() {
    const entries = getLeaderboard();
    el.lbList.innerHTML = '';
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No scores yet.';
      el.lbList.appendChild(li);
      return;
    }
    for (const { name, score, level, date } of entries) {
      const li = document.createElement('li');
      li.textContent = `${name} — Score: ${score} — Level: ${level} — ${date}`;
      el.lbList.appendChild(li);
    }
  }

  // Helpers
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ah + ay > by;
  }
  function recalcDifficulty() {
    // Gentle ramp: +12 px/s every 6 points, capped increment
    const incrementSteps = Math.floor(score / 6);
    const target = 90 + Math.min(20, incrementSteps) * 12; // cap +240
    bollard.speed = target;
    // Derive a level for display (every 10 points)
    currentLevel = Math.max(1, Math.floor(score / 10) + 1);
    scoreMultiplier = 1 + Math.min(1.5, streak * 0.02); // soft bonus from combo
  }
  function playClick() {
    if (!soundEnabled) return;
    try { sfx.click.currentTime = 0; sfx.click.play(); } catch {}
  }
  function playCollision() {
    if (!soundEnabled) return;
    try { sfx.collision.currentTime = 0; sfx.collision.play(); } catch {}
  }

  // Game lifecycle
  function resetGame() {
    score = 0;
    health = 3;
    currentLevel = 1;
    levelThreshold = 10;
    scoreMultiplier = 1;
    player.x = Math.floor(screen.width / 2) - 50;
    player.y = screen.height - 150;
    bollard.speed = 7;
    initBollards();
  }

  function showOverlay(which) {
    for (const k of ['landing', 'leaderboard', 'gameOver']) {
      el[k].classList.remove('visible');
    }
    if (which) el[which].classList.add('visible');
  }

  function drawHUD() {
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = '20px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${Math.floor(score * scoreMultiplier)}`, 10, 10);
    ctx.fillStyle = COLORS.CAUTION_YELLOW;
    ctx.fillText(`Health: ${health}`, 10, 40);
    ctx.fillStyle = COLORS.NEON_GREEN;
    ctx.fillText(`Level: ${currentLevel}`, 10, 70);
    // Combo and shield
    ctx.fillStyle = COLORS.ELECTRIC_ORANGE;
    ctx.fillText(`Streak: ${streak}`, 10, 100);
    ctx.fillStyle = shield.active ? COLORS.BOLT_BLUE : '#cccccc';
    ctx.fillText(`Shield: ${shield.active ? 'Ready' : '—'}`, 10, 130);
    // Separator
    ctx.strokeStyle = COLORS.METALLIC_SILVER;
    ctx.beginPath();
    ctx.moveTo(10, 160);
    ctx.lineTo(screen.width - 10, 160);
    ctx.stroke();
  }

  function update(dt) {
    if (!running) return;

    // Move player
    if (player.leftPressed && player.x > 0) player.x -= player.speed * dt;
    if (player.rightPressed && player.x < screen.width - player.width) player.x += player.speed * dt;
    // clamp
    if (player.x < 0) player.x = 0;
    if (player.x > screen.width - player.width) player.x = screen.width - player.width;

    // Move bollards
    for (const b of bollards) {
      b.y += bollard.speed * dt;
      if (b.y > screen.height) {
        b.y = Math.floor(-50 - Math.random() * 100);
        b.x = Math.floor(Math.random() * (screen.width - bollard.width));
        // scoring with combo
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        const comboBonus = 1 + Math.min(10, Math.floor(streak / 5));
        score += comboBonus;
        recalcDifficulty();
        maybeSpawnShield();
      }
    }

    // Collisions
    for (const b of bollards) {
      if (rectsOverlap(b.x, b.y, bollard.width, bollard.height, player.x, player.y, player.width, player.height)) {
        playCollision();
        if (shield.active) {
          // Consume shield, keep playing
          shield.active = false;
        } else {
          health -= 1;
          streak = 0;
          // reset bollards
          for (const r of bollards) {
            r.y = Math.floor(-50 - Math.random() * 100);
            r.x = Math.floor(Math.random() * (screen.width - bollard.width));
          }
        }
        break;
      }
    }

    // Power-up movement and pickup
    if (shield.visible) {
      shield.y += shield.vy * dt;
      // pickup check (simple AABB)
      if (rectsOverlap(shield.x - shield.size / 2, shield.y - shield.size / 2, shield.size, shield.size,
        player.x, player.y, player.width, player.height)) {
        shield.visible = false;
        shield.active = true;
        playClick();
      }
      if (shield.y - shield.size / 2 > screen.height) {
        shield.visible = false;
      }
    }

    if (health <= 0) {
      running = false;
      const finalScore = Math.floor(score * scoreMultiplier);
      el.finalScore.textContent = `Your Final Score: ${finalScore}`;
      el.finalLevel.textContent = `You Reached Level: ${currentLevel}`;
      showOverlay('gameOver');
    }
  }

  function draw() {
    ctx.fillStyle = COLORS.PRIMARY_BACKGROUND;
    ctx.fillRect(0, 0, screen.width, screen.height);

    // Player
    ctx.drawImage(visitorImg, player.x, player.y, player.width, player.height);

    // Bollards
    for (const b of bollards) {
      ctx.drawImage(bollardImg, b.x, b.y, bollard.width, bollard.height);
    }

    // Shield power-up rendering
    if (shield.visible) {
      ctx.save();
      ctx.translate(shield.x, shield.y);
      // glow
      const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, shield.size);
      gradient.addColorStop(0, 'rgba(70,130,180,0.95)');
      gradient.addColorStop(1, 'rgba(70,130,180,0.05)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, shield.size, 0, Math.PI * 2);
      ctx.fill();
      // core
      ctx.fillStyle = COLORS.BOLT_BLUE;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(8, shield.size * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // HUD
    drawHUD();
  }

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp dt to avoid spikes
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Controls
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') player.leftPressed = true;
    if (e.key === 'ArrowRight') player.rightPressed = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') player.leftPressed = false;
    if (e.key === 'ArrowRight') player.rightPressed = false;
  });

  el.moveLeft.addEventListener('touchstart', () => (player.leftPressed = true));
  el.moveLeft.addEventListener('touchend', () => (player.leftPressed = false));
  el.moveRight.addEventListener('touchstart', () => (player.rightPressed = true));
  el.moveRight.addEventListener('touchend', () => (player.rightPressed = false));

  // Buttons
  el.startBtn.addEventListener('click', () => {
    playClick();
    showOverlay();
    resetGame();
    running = true;
  });
  el.leaderboardBtn.addEventListener('click', () => {
    playClick();
    renderLeaderboard();
    showOverlay('leaderboard');
  });
  el.backFromLeaderboard.addEventListener('click', () => {
    playClick();
    showOverlay('landing');
  });
  el.nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (el.playerName.value || 'Anonymous').trim().slice(0, 20);
    const finalScore = parseInt(el.finalScore.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    const entries = getLeaderboard();
    entries.push({ name, score: finalScore, level: currentLevel, date: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    saveLeaderboard(entries);
    el.playerName.value = '';
    renderLeaderboard();
    showOverlay('leaderboard');
  });

  el.soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    el.soundToggle.textContent = `Sound: ${soundEnabled ? 'On' : 'Off'}`;
    playClick();
  });

  // Kick things off
  initBollards();
  requestAnimationFrame(loop);
})();


