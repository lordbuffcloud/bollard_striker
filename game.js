(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const screen = { width: canvas.width, height: canvas.height };
  let lanes = { count: 5, width: Math.floor(canvas.width / 5) };

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
  const whiteMonsterImg = new Image();
  whiteMonsterImg.src = 'white_monster.png';

  const sfx = {
    collision: new Audio('bollard_striker/sounds/collision.mp3'),
    click: new Audio('bollard_striker/sounds/click.mp3')
  };
  sfx.collision.preload = 'auto';
  sfx.click.preload = 'auto';
  const bgm = new Audio('sounds/Krause.mp3');
  bgm.loop = true;
  bgm.preload = 'auto';

  // Game State
  const SOUND_PREF_KEY = 'bollard-striker-sound';
  const VIBRATE_PREF_KEY = 'bollard-striker-vibrate';
  const MUSIC_PREF_KEY = 'bollard-striker-music';
  const TILT_PREF_KEY = 'bollard-striker-tilt-enabled';
  const TILT_SENS_PREF_KEY = 'bollard-striker-tilt-sensitivity';
  const REDUCED_MOTION_PREF_KEY = 'bollard-striker-reduced-motion';
  let soundEnabled = false;
  let vibrationEnabled = false;
  let musicEnabled = false;
  let reducedMotion = false;
  let tiltEnabled = false;
  let tiltSensitivity = 1.0;
  let tiltAxis = 0;
  let currentLevel = 1;
  let levelThreshold = 10; // retained for display compatibility
  let scoreMultiplier = 1; // retained for display compatibility
  let score = 0;
  let health = 3;
  let running = false;
  let streak = 0;
  let bestStreak = 0;
  let particles = []; // For visual effects
  let screenShake = { x: 0, y: 0, intensity: 0 }; // Screen shake on collision
  let invulnerableFor = 0; // seconds
  let paused = false;
  let dodgeSinceLastLaser = 0;
  let bgmUnlocked = false;

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
  const bollard = { width: 50, height: 50, speed: 150 }; // pixels per second (better starting speed)
  function isCoarsePointer() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (window.innerWidth <= 820);
  }
  function pickSpawnX(newY) {
    // Lane-based spawn; guarantee at least one open lane per row band
    const coarse = isCoarsePointer();
    const laneCount = lanes.count; // 3 on mobile, 5 on desktop
    const laneIndexes = Array.from({ length: laneCount }, (_, i) => i);
    // Determine occupied lanes near this Y
    const occupied = new Set();
    for (const other of bollards) {
      if (Math.abs((other.y || 0) - newY) < 220) {
        const lane = Math.max(0, Math.min(laneCount - 1, Math.floor(other.x / lanes.width)));
        occupied.add(lane);
      }
    }
    // If all lanes are occupied, free one randomly
    if (occupied.size >= laneCount) {
      const toFree = Math.floor(Math.random() * laneCount);
      occupied.delete(toFree);
    }
    // Choose a lane not occupied if possible
    const candidates = laneIndexes.filter(l => !occupied.has(l));
    const chosenLane = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : Math.floor(Math.random() * laneCount);
    const lanePadding = Math.max(6, Math.floor((lanes.width - bollard.width) / 2));
    const x = chosenLane * lanes.width + lanePadding + Math.floor(Math.random() * Math.max(1, lanes.width - bollard.width - lanePadding * 2));
    return Math.max(0, Math.min(screen.width - bollard.width, x));
  }
  function initBollards() {
    bollards.length = 0;
    const count = isCoarsePointer() ? 1 : 5;
    for (let i = 0; i < count; i += 1) {
      const y = Math.floor(-50 - Math.random() * 150);
      const x = pickSpawnX(y);
      bollards.push({ x, y });
    }
  }

  // Shield power-up
  const shield = { active: false, visible: false, x: 0, y: 0, size: 28, vy: 160 };
  // Laser power-up (White Monster)
  const laserPU = { active: false, visible: false, x: 0, y: 0, size: 28, vy: 140, timeLeft: 0 };
  const lasers = [];
  function maybeSpawnShield() {
    if (shield.visible || shield.active) return;
    const coarse = isCoarsePointer();
    // Lower chance on mobile to increase difficulty
    const chance = coarse ? 0.18 : 0.20;
    if (Math.random() < chance) {
      shield.visible = true;
      shield.x = Math.floor(16 + Math.random() * (screen.width - 32));
      shield.y = -shield.size;
    }
  }

  function maybeSpawnLaser() {
    if (laserPU.visible || laserPU.active) return;
    // Small chance per dodge, slightly higher on desktop to raise difficulty
    const chance = isCoarsePointer() ? 0.12 : 0.15;
    const guaranteed = dodgeSinceLastLaser >= (isCoarsePointer() ? 5 : 8);
    if (guaranteed || Math.random() < chance) {
      laserPU.visible = true;
      laserPU.x = Math.floor(16 + Math.random() * (screen.width - 32));
      laserPU.y = -laserPU.size;
      dodgeSinceLastLaser = 0;
    }
  }

  // UI elements
  const el = {
    landing: document.getElementById('landing'),
    leaderboard: document.getElementById('leaderboard'),
    gameOver: document.getElementById('gameOver'),
    tutorial: document.getElementById('tutorial'),
    lbList: document.getElementById('leaderboardList'),
    startBtn: document.getElementById('startBtn'),
    leaderboardBtn: document.getElementById('leaderboardBtn'),
    tutorialBtn: document.getElementById('tutorialBtn'),
    backFromLeaderboard: document.getElementById('backFromLeaderboard'),
    nameForm: document.getElementById('nameForm'),
    playerName: document.getElementById('playerName'),
    finalScore: document.getElementById('finalScore'),
    finalLevel: document.getElementById('finalLevel'),
    moveLeft: document.getElementById('moveLeft'),
    moveRight: document.getElementById('moveRight'),
    soundToggle: document.getElementById('soundToggle'),
    vibrationToggle: document.getElementById('vibrationToggle'),
    pauseBtn: document.getElementById('pauseBtn'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    countdown: document.getElementById('countdown'),
    countdownLabel: document.getElementById('countdownLabel'),
    zoneLeft: document.getElementById('zoneLeft'),
    zoneRight: document.getElementById('zoneRight'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsFab: document.getElementById('settingsFab'),
    settings: document.getElementById('settings'),
    settingsForm: document.getElementById('settingsForm'),
    enableTilt: document.getElementById('enableTilt'),
    requestMotionPermission: document.getElementById('requestMotionPermission'),
    tiltSensitivity: document.getElementById('tiltSensitivity'),
    enableMusic: document.getElementById('enableMusic'),
    reducedMotion: document.getElementById('reducedMotion'),
    closeSettings: document.getElementById('closeSettings'),
  };

  document.getElementById('year').textContent = new Date().getFullYear().toString();

  // Leaderboard using localStorage
  const LB_KEY = 'bollard-striker-leaderboard-v1';
  // Woodpecker's eternal shame - NEVER REMOVE THIS!
  const WOODPECKER_ENTRY = { name: 'WOODPECKER', score: -3, level: 1, date: 'Eternal Lore' };
  const DEFAULT_LB = [
    WOODPECKER_ENTRY
  ];
  function getLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      if (!raw) return DEFAULT_LB;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LB;
      
      // ALWAYS ensure Woodpecker is in the leaderboard at -3
      const hasWoodpecker = parsed.some(e => e.name.toLowerCase() === 'woodpecker');
      if (!hasWoodpecker) {
        return [WOODPECKER_ENTRY, ...parsed].sort((a, b) => b.score - a.score);
      }
      return parsed;
    } catch {
      return DEFAULT_LB;
    }
  }
  function saveLeaderboard(entries) {
    // Ensure Woodpecker's eternal shame is always preserved
    const entriesWithoutWoodpecker = entries.filter(e => e.name.toLowerCase() !== 'woodpecker');
    const allEntries = [WOODPECKER_ENTRY, ...entriesWithoutWoodpecker];
    const top = allEntries.sort((a, b) => b.score - a.score).slice(0, 6); // Allow 6 to ensure Woodpecker always fits
    localStorage.setItem(LB_KEY, JSON.stringify(top));
  }
  function renderEntries(entries) {
    el.lbList.innerHTML = '';
    if (!entries || entries.length === 0) {
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

  async function fetchGlobalLeaderboard() {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (!res.ok) throw new Error('global leaderboard not available');
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function postGlobalLeaderboard(entry) {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error('failed to submit score');
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function renderLeaderboard() {
    try {
      const entries = await fetchGlobalLeaderboard();
      renderEntries(entries);
    } catch {
      // fallback to local
      const entries = getLeaderboard();
      renderEntries(entries);
    }
  }

  // Preference init
  try {
    const prefSound = localStorage.getItem(SOUND_PREF_KEY);
    if (prefSound != null) soundEnabled = prefSound === '1';
  } catch {}
  try {
    const prefVib = localStorage.getItem(VIBRATE_PREF_KEY);
    if (prefVib != null) vibrationEnabled = prefVib === '1';
  } catch {}
  try { const v = localStorage.getItem(MUSIC_PREF_KEY); if (v != null) musicEnabled = v === '1'; } catch {}
  try { const v = localStorage.getItem(REDUCED_MOTION_PREF_KEY); if (v != null) reducedMotion = v === '1'; } catch {}
  try { const v = localStorage.getItem(TILT_PREF_KEY); if (v != null) tiltEnabled = v === '1'; } catch {}
  try { const v = localStorage.getItem(TILT_SENS_PREF_KEY); if (v != null) { const n = Number(v); if (Number.isFinite(n)) tiltSensitivity = Math.max(0.2, Math.min(3, n)); } } catch {}
  if (el.soundToggle) el.soundToggle.textContent = `Sound: ${soundEnabled ? 'On' : 'Off'}`;
  if (el.vibrationToggle) el.vibrationToggle.textContent = `Vibrate: ${vibrationEnabled ? 'On' : 'Off'}`;
  if (el.enableMusic) el.enableMusic.checked = musicEnabled;
  if (el.enableTilt) el.enableTilt.checked = tiltEnabled;
  if (el.tiltSensitivity) el.tiltSensitivity.value = String(tiltSensitivity);
  if (el.reducedMotion) el.reducedMotion.checked = reducedMotion;

  // DPR-aware canvas sizing (accounts for mobile browser UI + header/footer)
  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const aspect = 4 / 3;
    const topbar = document.querySelector('.topbar');
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const headerH = isCoarse ? 0 : (topbar ? topbar.offsetHeight : 0);
    const viewportH = (window.visualViewport && window.visualViewport.height) ? Math.floor(window.visualViewport.height) : window.innerHeight;
    const horizontalMargin = isCoarse ? 8 : 16;
    const verticalMargin = isCoarse ? 8 : 16;
    const availW = Math.max(320, Math.floor(window.innerWidth - horizontalMargin * 2));
    const availH = Math.max(240, Math.floor(viewportH - headerH - verticalMargin * 2));

    let displayWidth = Math.min(960, availW);
    let displayHeight = Math.floor(displayWidth / aspect);
    if (displayHeight > availH) {
      displayHeight = Math.min(720, availH);
      displayWidth = Math.floor(displayHeight * aspect);
    }

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    canvas.width = Math.floor(displayWidth * dpr);
    canvas.height = Math.floor(displayHeight * dpr);
    screen.width = displayWidth;
    screen.height = displayHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Recalculate lane layout
    const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (window.innerWidth <= 820);
    lanes.count = coarse ? 2 : 5;
    lanes.width = Math.max(160, Math.floor(screen.width / lanes.count));

    // Adjust sizes for current viewport
    configureSizesForCurrentViewport();
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);
  window.addEventListener('pageshow', resizeCanvas);
  resizeCanvas();

  // Helpers
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ah + ay > by;
  }
  function scaledRect(x, y, w, h, scale) {
    const cw = w * scale;
    const ch = h * scale;
    const cx = x + (w - cw) / 2;
    const cy = y + (h - ch) / 2;
    return { x: cx, y: cy, w: cw, h: ch };
  }
  function recalcDifficulty() {
    // Progressive difficulty with gentler mobile curve
    const coarse = isCoarsePointer();
    const incrementSteps = Math.floor(score / (coarse ? 10 : 5));
    const base = coarse ? 80 : 150;
    const step = coarse ? 6 : 15;
    const capSteps = coarse ? 15 : 25;
    const raw = base + Math.min(capSteps, incrementSteps) * step;
    // Strong damping on mobile and cap speed low
    if (coarse) {
      const proximity = Math.max(0, Math.min(1, (screen.height - player.y) / screen.height));
      bollard.speed = Math.min(110, Math.max(50, raw * (0.75 + 0.25 * proximity)));
    } else {
      bollard.speed = raw;
    }
    // Derive a level for display (every 8 points for more frequent level-ups)
    currentLevel = Math.max(1, Math.floor(score / 8) + 1);
    scoreMultiplier = 1 + Math.min(2.0, streak * 0.03); // better bonus from streaks
  }
  function playClick() {
    if (!soundEnabled) return;
    try { sfx.click.currentTime = 0; sfx.click.play(); } catch {}
  }
  function playCollision() {
    if (!soundEnabled) return;
    try { sfx.collision.currentTime = 0; sfx.collision.play(); } catch {}
  }

  function haptic(pattern) {
    if (!vibrationEnabled) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  }

  // Game lifecycle
  function configureSizesForCurrentViewport() {
    const coarse = isCoarsePointer();
    if (coarse) {
      player.width = Math.max(48, Math.floor(screen.width * 0.10));
      player.height = player.width;
      bollard.width = Math.max(34, Math.floor(lanes.width * 0.32));
      bollard.height = bollard.width;
      player.speed = 900;
      bollard.speed = 80;
    } else {
      player.width = 100;
      player.height = 100;
      bollard.width = 50;
      bollard.height = 50;
      player.speed = 420;
      bollard.speed = 150;
    }
  }
  function resetGame() {
    score = 0;
    health = 3;
    currentLevel = 1;
    levelThreshold = 8;
    scoreMultiplier = 1;
    configureSizesForCurrentViewport();
    player.x = Math.floor((lanes.count * lanes.width) / 2 - player.width / 2);
    player.y = screen.height - Math.max(150, Math.floor(player.height * 1.5));
    initBollards();
  }

  function showOverlay(which) {
    for (const k of ['landing', 'leaderboard', 'gameOver', 'settings', 'tutorial']) {
      el[k].classList.remove('visible');
    }
    if (which) el[which].classList.add('visible');
  }

  function showCountdownOverlay(show) {
    if (!el.countdown) return;
    if (show) el.countdown.classList.add('visible');
    else el.countdown.classList.remove('visible');
  }

  async function startGameWithCountdown() {
    running = false;
    paused = false;
    resetGame();
    if (!el.countdown || !el.countdownLabel) {
      showOverlay();
      running = true;
      return;
    }
    showOverlay();
    showCountdownOverlay(true);
    const steps = ['3', '2', '1', 'Go!'];
    for (let i = 0; i < steps.length; i += 1) {
      el.countdownLabel.textContent = steps[i];
      haptic(i < 3 ? 30 : [60, 60, 60]);
      await new Promise((r) => setTimeout(r, i < 3 ? 550 : 350));
    }
    showCountdownOverlay(false);
    if (musicEnabled || isCoarsePointer()) {
      try { bgm.currentTime = 0; bgm.volume = 0.6; await bgm.play(); bgmUnlocked = true; } catch {}
    } else {
      try { bgm.pause(); } catch {}
    }
    running = true;
  }

  function drawHUD() {
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = 'bold 22px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${Math.floor(score * scoreMultiplier)}`, 10, 10);
    
    // Health with color coding and warning
    ctx.fillStyle = health <= 1 ? COLORS.DEEP_RED : (health <= 2 ? COLORS.CAUTION_YELLOW : COLORS.NEON_GREEN);
    ctx.fillText(`Health: ${health}`, 10, 40);
    if (health <= 1) {
      ctx.fillStyle = 'rgba(178, 34, 34, 0.3)';
      ctx.fillRect(0, 0, screen.width, screen.height); // Red overlay warning
    }
    
    ctx.fillStyle = COLORS.NEON_GREEN;
    ctx.fillText(`Level: ${currentLevel}`, 10, 70);
    
    // Enhanced combo display with color scaling
    const streakColor = streak > 20 ? COLORS.NEON_GREEN : streak > 10 ? COLORS.CAUTION_YELLOW : COLORS.ELECTRIC_ORANGE;
    ctx.fillStyle = streakColor;
    ctx.fillText(`Streak: ${streak}${streak > 0 ? ' 🔥' : ''}`, 10, 100);
    
    ctx.fillStyle = shield.active ? COLORS.BOLT_BLUE : '#cccccc';
    ctx.fillText(`Shield: ${shield.active ? '🛡️ Ready' : '—'}`, 10, 130);
    
    // Best streak display
    if (bestStreak > 0) {
      ctx.fillStyle = COLORS.METALLIC_SILVER;
      ctx.font = '16px Arial';
      ctx.fillText(`Best Streak: ${bestStreak}`, screen.width - 150, 10);
      ctx.font = 'bold 22px Arial';
    }
    
    // Separator with glow effect
    ctx.strokeStyle = COLORS.METALLIC_SILVER;
    ctx.shadowColor = COLORS.BOLT_BLUE;
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(10, 160);
    ctx.lineTo(screen.width - 10, 160);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function update(dt) {
    if (!running) return;
    if (paused) return;

    // timers
    if (invulnerableFor > 0) invulnerableFor = Math.max(0, invulnerableFor - dt);

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
        b.y = Math.floor(-140 - Math.random() * 220);
        let x = pickSpawnX(b.y);
        // Avoid immediate spawn in player's current lane on mobile
        const coarse = isCoarsePointer();
        if (coarse) {
          const playerLane = Math.max(0, Math.min(lanes.count - 1, Math.floor(player.x / lanes.width)));
          const spawnLane = Math.max(0, Math.min(lanes.count - 1, Math.floor(x / lanes.width)));
          if (spawnLane === playerLane) {
            const altLane = (playerLane + 1) % lanes.count;
            x = Math.floor(altLane * lanes.width + (lanes.width - bollard.width) / 2);
          }
        }
        b.x = x;
        // scoring with combo
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        const comboBonus = 1 + Math.min(12, Math.floor(streak / 5)); // Slightly gentler scaling for mobile fairness
        score += comboBonus;
        dodgeSinceLastLaser += 1;
        
        // Add particles for successful dodge
        for (let i = 0; i < (isCoarsePointer() ? 1 : 3); i++) {
          particles.push({
            x: b.x + bollard.width / 2,
            y: b.y + bollard.height / 2,
            vx: (Math.random() - 0.5) * 100,
            vy: (Math.random() - 0.5) * 100,
            life: 1.0,
            color: streak > 10 ? COLORS.NEON_GREEN : COLORS.CAUTION_YELLOW
          });
        }
        
        recalcDifficulty();
        maybeSpawnShield();
        maybeSpawnLaser();
      }
    }

    // Collisions (use reduced hitboxes for fairness; extra leniency on mobile)
    for (const b of bollards) {
      const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (window.innerWidth <= 820);
      const playerScale = coarse ? 0.40 : 0.70;
      const bollardScale = coarse ? 0.55 : 0.80;
      const pb = scaledRect(player.x, player.y, player.width, player.height, playerScale);
      const bb = scaledRect(b.x, b.y, bollard.width, bollard.height, bollardScale);
      if (rectsOverlap(bb.x, bb.y, bb.w, bb.h, pb.x, pb.y, pb.w, pb.h)) {
        if (invulnerableFor > 0) continue; // grace period
        playCollision();
        if (shield.active) {
          // Consume shield, keep playing
          shield.active = false;
          invulnerableFor = 1.0; // brief grace after shield pops
          // Clear nearby hazards to avoid instant follow-up hits
          for (const r of bollards) {
            r.y = Math.floor(-50 - Math.random() * 100);
            r.x = Math.floor(Math.random() * (screen.width - bollard.width));
          }
          // Add shield break particles
          for (let i = 0; i < 8; i++) {
            particles.push({
              x: player.x + player.width / 2,
              y: player.y + player.height / 2,
              vx: (Math.random() - 0.5) * 200,
              vy: (Math.random() - 0.5) * 200,
              life: 1.0,
              color: COLORS.BOLT_BLUE
            });
          }
        } else {
          health -= 1;
          streak = 0;
          invulnerableFor = isCoarsePointer() ? 1.2 : 1.0; // slightly shorter to restore challenge
          // Screen shake on damage
          screenShake.intensity = reducedMotion ? 4 : 10;
          // Add damage particles
          for (let i = 0; i < 12; i++) {
            particles.push({
              x: player.x + player.width / 2,
              y: player.y + player.height / 2,
              vx: (Math.random() - 0.5) * 300,
              vy: (Math.random() - 0.5) * 300,
              life: 1.5,
              color: COLORS.DEEP_RED
            });
          }
          // reset bollards with extra spacing so immediate re-hit is less likely on mobile
          for (const r of bollards) {
            r.y = Math.floor(-200 - Math.random() * 240);
            r.x = pickSpawnX(r.y);
          }
        }
        break;
      }
    }

    // Power-up movement and pickup
    if (shield.visible) {
      shield.y += (reducedMotion ? shield.vy * 0.8 : shield.vy) * dt;
      // pickup check (simple AABB with slightly reduced player box)
      const pb = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(shield.x - shield.size / 2, shield.y - shield.size / 2, shield.size, shield.size,
        pb.x, pb.y, pb.w, pb.h)) {
        shield.visible = false;
        shield.active = true;
        playClick();
      }
      if (shield.y - shield.size / 2 > screen.height) {
        shield.visible = false;
      }
    }

    // Laser power-up movement and pickup
    if (laserPU.visible) {
      laserPU.y += laserPU.vy * dt;
      const pb2 = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(laserPU.x - laserPU.size / 2, laserPU.y - laserPU.size / 2, laserPU.size, laserPU.size,
        pb2.x, pb2.y, pb2.w, pb2.h)) {
        laserPU.visible = false;
        laserPU.active = true;
        laserPU.timeLeft = isCoarsePointer() ? 6.0 : 5.0; // Slightly longer on mobile
        playClick();
      }
      if (laserPU.y - laserPU.size / 2 > screen.height) laserPU.visible = false;
    }

    // Update active laser power-up timer
    if (laserPU.active) {
      laserPU.timeLeft -= dt;
      if (laserPU.timeLeft <= 0) laserPU.active = false;
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    // Update lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.y += l.vy * dt;
      // Collision with bollards
      for (const b of bollards) {
        if (rectsOverlap(l.x - 2, l.y - 16, 4, 32, b.x, b.y, bollard.width, bollard.height)) {
          // Destroy bollard and respawn
          b.y = Math.floor(-140 - Math.random() * 220);
          b.x = pickSpawnX(b.y);
          score += 2; // small bonus
        }
      }
      if (l.y < -20) lasers.splice(i, 1);
    }
    
    // Update screen shake
    if (screenShake.intensity > 0) {
      screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
      screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
      screenShake.intensity *= 0.85; // Decay
      if (screenShake.intensity < 0.1) screenShake.intensity = 0;
    }

    if (health <= 0) {
      running = false;
      const finalScore = Math.floor(score * scoreMultiplier);
      el.finalScore.textContent = `Your Final Score: ${finalScore} (Best Streak: ${bestStreak})`;
      el.finalLevel.textContent = `You Reached Level: ${currentLevel}`;
      showOverlay('gameOver');
    }
  }

  function draw() {
    ctx.save();
    // Apply screen shake
    ctx.translate(screenShake.x, screenShake.y);
    
    ctx.fillStyle = COLORS.PRIMARY_BACKGROUND;
    ctx.fillRect(-screenShake.x, -screenShake.y, screen.width + Math.abs(screenShake.x) * 2, screen.height + Math.abs(screenShake.y) * 2);

    // Background lane lines for navigation (align to lane grid)
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = COLORS.METALLIC_SILVER;
    for (let i = 1; i < lanes.count; i += 1) {
      const x = Math.floor(i * lanes.width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, screen.height);
      ctx.stroke();
    }
    ctx.restore();

    // Player (flicker when invulnerable)
    const flicker = invulnerableFor > 0 && Math.floor(performance.now() / 100) % 2 === 0;
    if (!flicker) {
      ctx.drawImage(visitorImg, player.x, player.y, player.width, player.height);
    }

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

    // Laser power-up rendering (pickup icon)
    if (laserPU.visible) {
      ctx.save();
      ctx.translate(laserPU.x, laserPU.y);
      const gradient2 = ctx.createRadialGradient(0, 0, 2, 0, 0, laserPU.size);
      gradient2.addColorStop(0, 'rgba(255,255,255,0.95)');
      gradient2.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = gradient2;
      ctx.beginPath();
      ctx.arc(0, 0, laserPU.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(whiteMonsterImg, -laserPU.size * 0.6, -laserPU.size * 0.6, laserPU.size * 1.2, laserPU.size * 1.2);
      ctx.restore();
    }

    // Active lasers firing effect
    if (laserPU.active) {
      const fireInterval = 0.24; // slightly slower beams for balance
      laserPU._acc = (laserPU._acc || 0) + dt;
      if (laserPU._acc >= fireInterval) {
        laserPU._acc = 0;
        // Fire a straight beam upward from car center
        lasers.push({ x: player.x + player.width / 2, y: player.y, vy: -900 });
      }
      // Draw a glow on the car
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 8;
      ctx.strokeRect(player.x - 3, player.y - 3, player.width + 6, player.height + 6);
      ctx.restore();
    }

    // Active shield ring around player
    if (shield.active) {
      ctx.save();
      const pulse = 1 + 0.1 * Math.sin(performance.now() / 120);
      ctx.strokeStyle = COLORS.BOLT_BLUE;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(
        player.x + player.width / 2,
        player.y + player.height / 2,
        (player.width * 0.6) * pulse,
        (player.height * 0.6) * pulse,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    // Draw particles (skip in reduced motion)
    if (!reducedMotion) {
      for (const p of particles) {
        const alpha = Math.max(0, p.life);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;
    
    ctx.restore(); // Restore from screen shake transform
    
    // HUD (drawn without screen shake)
    drawHUD();

    // Pause banner
    if (paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, screen.width, screen.height);
      ctx.fillStyle = COLORS.WHITE;
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Paused — press P or tap Resume', screen.width / 2, screen.height / 2);
      ctx.restore();
    }
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
    if (e.key.toLowerCase() === 'p') paused = !paused;
    if (el.pauseBtn) el.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') player.leftPressed = false;
    if (e.key === 'ArrowRight') player.rightPressed = false;
  });

  function tryStartMusicFromGesture() {
    if (!musicEnabled || bgmUnlocked) return;
    try {
      bgm.currentTime = 0;
      bgm.volume = 0.6;
      const p = bgm.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { bgmUnlocked = true; detachAudioUnlockers(); }).catch(() => {});
      } else {
        bgmUnlocked = true; detachAudioUnlockers();
      }
    } catch {}
  }
  function detachAudioUnlockers() {
    document.removeEventListener('touchstart', tryStartMusicFromGesture);
    document.removeEventListener('pointerdown', tryStartMusicFromGesture);
    document.removeEventListener('mousedown', tryStartMusicFromGesture);
    document.removeEventListener('keydown', tryStartMusicFromGesture);
  }
  document.addEventListener('touchstart', tryStartMusicFromGesture, { passive: true, once: true });
  document.addEventListener('pointerdown', tryStartMusicFromGesture, { once: true });
  document.addEventListener('mousedown', tryStartMusicFromGesture, { once: true });
  document.addEventListener('keydown', tryStartMusicFromGesture, { once: true });

  // Prevent double-tap zoom and double-click zoom on mobile
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // On-screen pads
  el.moveLeft.addEventListener('touchstart', (e) => { e.preventDefault(); player.leftPressed = true; }, { passive: false });
  el.moveLeft.addEventListener('touchend', () => (player.leftPressed = false));
  el.moveLeft.addEventListener('mousedown', () => (player.leftPressed = true));
  el.moveLeft.addEventListener('mouseup', () => (player.leftPressed = false));
  el.moveRight.addEventListener('touchstart', (e) => { e.preventDefault(); player.rightPressed = true; }, { passive: false });
  el.moveRight.addEventListener('touchend', () => (player.rightPressed = false));
  el.moveRight.addEventListener('mousedown', () => (player.rightPressed = true));
  el.moveRight.addEventListener('mouseup', () => (player.rightPressed = false));

  // Full-width touch zones for left/right halves
  if (el.zoneLeft && el.zoneRight) {
    const onLeftStart = (e) => { e.preventDefault(); player.leftPressed = true; };
    const onLeftEnd = (e) => { e.preventDefault(); player.leftPressed = false; };
    const onRightStart = (e) => { e.preventDefault(); player.rightPressed = true; };
    const onRightEnd = (e) => { e.preventDefault(); player.rightPressed = false; };
    el.zoneLeft.addEventListener('touchstart', onLeftStart, { passive: false });
    el.zoneLeft.addEventListener('touchend', onLeftEnd, { passive: false });
    el.zoneLeft.addEventListener('touchcancel', onLeftEnd, { passive: false });
    el.zoneRight.addEventListener('touchstart', onRightStart, { passive: false });
    el.zoneRight.addEventListener('touchend', onRightEnd, { passive: false });
    el.zoneRight.addEventListener('touchcancel', onRightEnd, { passive: false });
  }

  // Tilt controls
  function handleDeviceOrientation(e) {
    if (!tiltEnabled) { tiltAxis = 0; return; }
    // gamma: left-right tilt in degrees (-90 to 90). Positive tilt right on iOS.
    const gamma = (typeof e.gamma === 'number') ? e.gamma : 0;
    tiltAxis = Math.max(-1, Math.min(1, gamma / 30));
  }
  function handleDeviceMotion(e) {
    if (!tiltEnabled) { tiltAxis = 0; return; }
    const acc = e.accelerationIncludingGravity;
    if (acc && typeof acc.x === 'number') {
      // Invert on some platforms; keep heuristic that right tilt => positive axis
      const x = -acc.x;
      const norm = Math.max(-1, Math.min(1, x / 9.8));
      // Prefer orientation if available; this acts as a fallback noise smoother
      if (Math.abs(norm) > Math.abs(tiltAxis)) tiltAxis = norm * 0.7;
    }
  }
  function attachMotionListeners() {
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    window.addEventListener('devicemotion', handleDeviceMotion);
  }
  function detachMotionListeners() {
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
    window.removeEventListener('devicemotion', handleDeviceMotion);
  }
  function setTiltEnabled(next) {
    tiltEnabled = next;
    if (tiltEnabled) attachMotionListeners(); else detachMotionListeners();
    try { localStorage.setItem(TILT_PREF_KEY, tiltEnabled ? '1' : '0'); } catch {}
  }
  if (tiltEnabled) attachMotionListeners();

  // Buttons
  el.startBtn.addEventListener('click', async () => {
    playClick();
    tryStartMusicFromGesture();
    await startGameWithCountdown();
  });
  el.leaderboardBtn.addEventListener('click', () => {
    playClick();
    renderLeaderboard();
    showOverlay('leaderboard');
  });
  if (el.tutorialBtn) {
    el.tutorialBtn.addEventListener('click', () => {
      playClick();
      showOverlay('tutorial');
    });
  }
  el.backFromLeaderboard.addEventListener('click', () => {
    playClick();
    showOverlay('landing');
  });
  el.nameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (el.playerName.value || 'Anonymous').trim().slice(0, 20);
    const finalScore = parseInt(el.finalScore.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    try {
      const entries = await postGlobalLeaderboard({ name, score: finalScore, level: currentLevel });
      renderEntries(entries);
    } catch {
      const entries = getLeaderboard();
      entries.push({ name, score: finalScore, level: currentLevel, date: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      saveLeaderboard(entries);
      renderEntries(entries);
    }
    el.playerName.value = '';
    showOverlay('leaderboard');
  });

  el.soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    el.soundToggle.textContent = `Sound: ${soundEnabled ? 'On' : 'Off'}`;
    try { localStorage.setItem(SOUND_PREF_KEY, soundEnabled ? '1' : '0'); } catch {}
    playClick();
  });

  if (el.vibrationToggle) {
    el.vibrationToggle.addEventListener('click', () => {
      vibrationEnabled = !vibrationEnabled;
      el.vibrationToggle.textContent = `Vibrate: ${vibrationEnabled ? 'On' : 'Off'}`;
      try { localStorage.setItem(VIBRATE_PREF_KEY, vibrationEnabled ? '1' : '0'); } catch {}
      haptic(15);
      playClick();
    });
  }

  if (el.pauseBtn) {
    el.pauseBtn.addEventListener('click', () => {
      paused = !paused;
      el.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      playClick();
    });
  }

  // Settings overlay logic
  if (el.settingsBtn && el.settings) {
    el.settingsBtn.addEventListener('click', () => { playClick(); showOverlay('settings'); });
  }
  if (el.settingsFab && el.settings) {
    el.settingsFab.addEventListener('click', () => { playClick(); showOverlay('settings'); });
  }
  if (el.closeSettings) {
    el.closeSettings.addEventListener('click', () => { playClick(); showOverlay(); });
  }
  const closeTutorialBtn = document.getElementById('closeTutorial');
  if (closeTutorialBtn) {
    closeTutorialBtn.addEventListener('click', () => {
      playClick();
      try { localStorage.setItem('bollard-striker-seen-tutorial', '1'); } catch {}
      showOverlay('landing');
    });
  }
  if (el.enableMusic) {
    el.enableMusic.addEventListener('change', () => {
      musicEnabled = !!el.enableMusic.checked;
      try { localStorage.setItem(MUSIC_PREF_KEY, musicEnabled ? '1' : '0'); } catch {}
      if (!musicEnabled) { try { bgm.pause(); } catch {} } else if (running) { tryStartMusicFromGesture(); }
    });
  }
  if (el.reducedMotion) {
    el.reducedMotion.addEventListener('change', () => {
      reducedMotion = !!el.reducedMotion.checked;
      try { localStorage.setItem(REDUCED_MOTION_PREF_KEY, reducedMotion ? '1' : '0'); } catch {}
    });
  }
  if (el.enableTilt) {
    el.enableTilt.addEventListener('change', () => {
      setTiltEnabled(!!el.enableTilt.checked);
    });
  }
  if (el.tiltSensitivity) {
    el.tiltSensitivity.addEventListener('input', () => {
      const n = Number(el.tiltSensitivity.value);
      if (Number.isFinite(n)) {
        tiltSensitivity = Math.max(0.2, Math.min(3, n));
        try { localStorage.setItem(TILT_SENS_PREF_KEY, String(tiltSensitivity)); } catch {}
      }
    });
  }
  if (el.requestMotionPermission && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    el.requestMotionPermission.addEventListener('click', async () => {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res === 'granted') {
          setTiltEnabled(true);
          if (el.enableTilt) el.enableTilt.checked = true;
        }
      } catch {}
    });
  }

  if (el.playAgainBtn) {
    el.playAgainBtn.addEventListener('click', async () => {
      playClick();
      await startGameWithCountdown();
    });
  }

  // Auto-pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) {
      paused = true;
      if (el.pauseBtn) el.pauseBtn.textContent = 'Resume';
    }
  });

  // Apply tilt movement in update loop by polling tiltAxis
  const originalUpdate = update;
  update = function(dt) {
    if (tiltEnabled && !paused && running) {
      const delta = tiltAxis * (player.speed * tiltSensitivity) * dt;
      player.x += delta;
    }
    originalUpdate(dt);
  };

  // Kick things off
  initBollards();
  // Show tutorial once for first-time users
  try {
    const seen = localStorage.getItem('bollard-striker-seen-tutorial');
    if (!seen) showOverlay('tutorial');
  } catch {}
  requestAnimationFrame(loop);
})();


