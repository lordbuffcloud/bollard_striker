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
  let levelThreshold = 10;
  let scoreMultiplier = 1;
  let score = 0;
  let health = 3;
  let running = false;

  // Player
  const player = {
    width: 100,
    height: 100,
    x: Math.floor(screen.width / 2) - 50,
    y: screen.height - 150,
    speed: 7,
    leftPressed: false,
    rightPressed: false
  };

  // Bollards
  const bollards = [];
  const bollard = { width: 50, height: 50, speed: 7 };
  function initBollards() {
    bollards.length = 0;
    for (let i = 0; i < 5; i += 1) {
      const x = Math.floor(Math.random() * (screen.width - bollard.width));
      const y = Math.floor(-50 - Math.random() * 100);
      bollards.push({ x, y });
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
  function getLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
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
  function increaseDifficultyIfNeeded() {
    if (score >= levelThreshold * currentLevel) {
      bollard.speed += 1;
      currentLevel += 1;
      scoreMultiplier += 0.5;
    }
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
    // Separator
    ctx.strokeStyle = COLORS.METALLIC_SILVER;
    ctx.beginPath();
    ctx.moveTo(10, 100);
    ctx.lineTo(screen.width - 10, 100);
    ctx.stroke();
  }

  function update() {
    if (!running) return;

    // Move player
    if (player.leftPressed && player.x > 0) player.x -= player.speed;
    if (player.rightPressed && player.x < screen.width - player.width) player.x += player.speed;

    // Move bollards
    for (const b of bollards) {
      b.y += bollard.speed;
      if (b.y > screen.height) {
        b.y = Math.floor(-50 - Math.random() * 100);
        b.x = Math.floor(Math.random() * (screen.width - bollard.width));
        score += 1 * scoreMultiplier;
        increaseDifficultyIfNeeded();
      }
    }

    // Collisions
    for (const b of bollards) {
      if (rectsOverlap(b.x, b.y, bollard.width, bollard.height, player.x, player.y, player.width, player.height)) {
        playCollision();
        health -= 1;
        // reset bollards
        for (const r of bollards) {
          r.y = Math.floor(-50 - Math.random() * 100);
          r.x = Math.floor(Math.random() * (screen.width - bollard.width));
        }
        break;
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

    // HUD
    drawHUD();
  }

  function loop() {
    update();
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
  loop();
})();


