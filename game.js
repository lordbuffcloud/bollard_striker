(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const screen = { width: canvas.width, height: canvas.height };
  let lanes = { count: 5, width: Math.floor(canvas.width / 5) };
  let lastSpawnLane = -1;

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
  function canDraw(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }
  visitorImg.onerror = () => {};
  bollardImg.onerror = () => {};
  whiteMonsterImg.onerror = () => {};

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
  // Object pools for performance
  const particlePool = [];
  const MAX_PARTICLES = 100;
  function getParticle() {
    if (particlePool.length > 0) return particlePool.pop();
    return { x: 0, y: 0, vx: 0, vy: 0, life: 0, color: COLORS.WHITE };
  }
  function releaseParticle(p) {
    if (particlePool.length < MAX_PARTICLES) particlePool.push(p);
  }
  let particles = []; // For visual effects
  let screenShake = { x: 0, y: 0, intensity: 0 }; // Screen shake on collision
  let invulnerableFor = 0; // seconds
  let paused = false;
  let dodgeSinceLastLaser = 0;
  let bgmUnlocked = false;
  let lastFrameTime = 0;
  let frameCount = 0;
  let fps = 60;

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
    let pool = candidates.length > 0 ? candidates : laneIndexes;
    // Avoid repeating the same lane twice if possible
    const alt = pool.filter(l => l !== lastSpawnLane);
    if (alt.length > 0) pool = alt;
    const chosenLane = pool[Math.floor(Math.random() * pool.length)];
    lastSpawnLane = chosenLane;
    const lanePadding = coarse ? 10 : 8;
    const spread = Math.max(0, lanes.width - bollard.width - lanePadding * 2);
    const x = chosenLane * lanes.width + lanePadding + Math.floor(Math.random() * (spread + 1));
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
  // Speed boost power-up
  const speedBoost = { active: false, visible: false, x: 0, y: 0, size: 28, vy: 150, timeLeft: 0 };
  // Score multiplier power-up
  const scoreMultiplierPU = { active: false, visible: false, x: 0, y: 0, size: 28, vy: 145, timeLeft: 0, multiplier: 2 };
  let activeScoreMultiplier = 1;
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

  function maybeSpawnSpeedBoost() {
    if (speedBoost.visible || speedBoost.active) return;
    if (score < 15) return; // Only spawn after some progress
    const chance = isCoarsePointer() ? 0.08 : 0.10;
    if (Math.random() < chance) {
      speedBoost.visible = true;
      speedBoost.x = Math.floor(16 + Math.random() * (screen.width - 32));
      speedBoost.y = -speedBoost.size;
    }
  }

  function maybeSpawnScoreMultiplier() {
    if (scoreMultiplierPU.visible || scoreMultiplierPU.active) return;
    if (score < 20) return; // Only spawn after more progress
    const chance = isCoarsePointer() ? 0.06 : 0.08;
    if (Math.random() < chance) {
      scoreMultiplierPU.visible = true;
      scoreMultiplierPU.x = Math.floor(16 + Math.random() * (screen.width - 32));
      scoreMultiplierPU.y = -scoreMultiplierPU.size;
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
    refreshLeaderboard: document.getElementById('refreshLeaderboard'),
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

  let globalLeaderboardAvailable = false;
  let leaderboardSource = 'local';

  async function fetchGlobalLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard', { 
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        if (res.status === 501) {
          globalLeaderboardAvailable = false;
          throw new Error('Global leaderboard not configured');
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      globalLeaderboardAvailable = true;
      leaderboardSource = data.source || 'global';
      return Array.isArray(data.entries) ? data.entries : [];
    } catch (e) {
      globalLeaderboardAvailable = false;
      leaderboardSource = 'local';
      throw e;
    }
  }

  async function postGlobalLeaderboard(entry) {
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(entry)
      });
      if (!res.ok) {
        if (res.status === 501) {
          globalLeaderboardAvailable = false;
          throw new Error('Global leaderboard not configured');
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      globalLeaderboardAvailable = true;
      leaderboardSource = data.source || 'global';
      return Array.isArray(data.entries) ? data.entries : [];
    } catch (e) {
      globalLeaderboardAvailable = false;
      leaderboardSource = 'local';
      throw e;
    }
  }

  async function renderLeaderboard() {
    // Show loading state
    el.lbList.innerHTML = '<li>Loading leaderboard...</li>';
    
    try {
      const entries = await fetchGlobalLeaderboard();
      if (entries.length === 0) {
        renderEntries([]);
        return;
      }
      renderEntries(entries);
      // Show source indicator
      const sourceIndicator = document.createElement('li');
      sourceIndicator.style.cssText = 'font-size: 12px; color: #888; font-style: italic; margin-top: 8px; list-style: none;';
      sourceIndicator.textContent = `🌐 Global Leaderboard (${leaderboardSource})`;
      el.lbList.appendChild(sourceIndicator);
    } catch (e) {
      // fallback to local
      const entries = getLeaderboard();
      renderEntries(entries);
      const sourceIndicator = document.createElement('li');
      sourceIndicator.style.cssText = 'font-size: 12px; color: #888; font-style: italic; margin-top: 8px; list-style: none;';
      sourceIndicator.textContent = '📱 Local Leaderboard (Global unavailable)';
      el.lbList.appendChild(sourceIndicator);
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
  try { const v = localStorage.getItem(TILT_PREF_KEY); if (v != null) tiltEnabled = v === '1'; else tiltEnabled = isCoarsePointer(); } catch { tiltEnabled = isCoarsePointer(); }
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
    const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (window.innerWidth <= 820);
    const aspect = 4 / 3;
    const topbar = document.querySelector('.topbar');
    const isCoarse = coarse;
    const headerH = isCoarse ? 0 : (topbar ? topbar.offsetHeight : 0);
    const footerH = isCoarse ? 0 : (document.querySelector('.footer') ? document.querySelector('.footer').offsetHeight : 0);
    const viewportH = (window.visualViewport && window.visualViewport.height) ? Math.floor(window.visualViewport.height) : window.innerHeight;
    const horizontalMargin = isCoarse ? 4 : 16;
    const verticalMargin = isCoarse ? 4 : 16;
    const availW = Math.max(320, Math.floor(window.innerWidth - horizontalMargin * 2));
    const availH = Math.max(240, Math.floor(viewportH - headerH - footerH - verticalMargin * 2));

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
    lanes.count = coarse ? 3 : 5;
    lanes.width = Math.max(160, Math.floor(screen.width / lanes.count));

    // Adjust sizes for current viewport
    configureSizesForCurrentViewport();
    
    // Reposition player if game is running
    if (running && !paused) {
      player.x = Math.max(0, Math.min(screen.width - player.width, player.x));
      player.y = screen.height - Math.max(150, Math.floor(player.height * 1.5));
    }
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
    const incrementSteps = Math.floor(score / (coarse ? 6 : 5));
    const base = coarse ? 110 : 160;
    const step = coarse ? 12 : 18;
    const capSteps = coarse ? 20 : 28;
    const raw = base + Math.min(capSteps, incrementSteps) * step;
    // Strong damping on mobile and cap speed low
    if (coarse) {
      const proximity = Math.max(0, Math.min(1, (screen.height - player.y) / screen.height));
      bollard.speed = Math.min(200, Math.max(90, raw * (0.88 + 0.12 * proximity)));
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
      player.speed = 800;
      bollard.speed = 120; // stable difficulty baseline
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
    activeScoreMultiplier = 1;
    streak = 0;
    bestStreak = 0;
    shield.active = false;
    shield.visible = false;
    laserPU.active = false;
    laserPU.visible = false;
    speedBoost.active = false;
    speedBoost.visible = false;
    scoreMultiplierPU.active = false;
    scoreMultiplierPU.visible = false;
    particles.length = 0;
    lasers.length = 0;
    screenShake.intensity = 0;
    invulnerableFor = 0;
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
    const finalScore = Math.floor(score * scoreMultiplier * activeScoreMultiplier);
    ctx.fillText(`Score: ${finalScore}`, 10, 10);
    
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
    
    // Power-up status indicators
    let statusY = 160;
    if (speedBoost.active) {
      ctx.fillStyle = COLORS.ELECTRIC_ORANGE;
      ctx.font = '16px Arial';
      ctx.fillText(`⚡ Speed Boost: ${Math.ceil(speedBoost.timeLeft)}s`, 10, statusY);
      statusY += 25;
      ctx.font = 'bold 22px Arial';
    }
    if (scoreMultiplierPU.active) {
      ctx.fillStyle = COLORS.CAUTION_YELLOW;
      ctx.font = '16px Arial';
      ctx.fillText(`⭐ ${activeScoreMultiplier}x Multiplier: ${Math.ceil(scoreMultiplierPU.timeLeft)}s`, 10, statusY);
      statusY += 25;
      ctx.font = 'bold 22px Arial';
    }
    if (laserPU.active) {
      ctx.fillStyle = COLORS.NEON_GREEN;
      ctx.font = '16px Arial';
      ctx.fillText(`💥 Laser: ${Math.ceil(laserPU.timeLeft)}s`, 10, statusY);
      statusY += 25;
      ctx.font = 'bold 22px Arial';
    }
    
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
    ctx.moveTo(10, Math.max(160, statusY));
    ctx.lineTo(screen.width - 10, Math.max(160, statusY));
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function update(dt) {
    if (!running) return;
    if (paused) return;

    // timers
    if (invulnerableFor > 0) invulnerableFor = Math.max(0, invulnerableFor - dt);

    // Move player (with speed boost)
    const currentSpeed = speedBoost.active ? player.speed * 1.5 : player.speed;
    if (player.leftPressed && player.x > 0) player.x -= currentSpeed * dt;
    if (player.rightPressed && player.x < screen.width - player.width) player.x += currentSpeed * dt;
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
        // scoring with combo and active multipliers
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        const comboBonus = 1 + Math.min(12, Math.floor(streak / 5)); // Slightly gentler scaling for mobile fairness
        const baseScore = comboBonus * activeScoreMultiplier;
        score += baseScore;
        dodgeSinceLastLaser += 1;
        // On mobile, gradually increase bollard count for more challenge
        if (isCoarsePointer()) {
          const desired = score >= 8 ? 2 : 1;
          while (bollards.length < desired) {
            const ny = Math.floor(-140 - Math.random() * 220);
            const nx = pickSpawnX(ny);
            bollards.push({ x: nx, y: ny });
          }
        }
        
        // Add particles for successful dodge (using object pool)
        const particleCount = isCoarsePointer() ? 1 : 3;
        for (let i = 0; i < particleCount && particles.length < MAX_PARTICLES; i++) {
          const p = getParticle();
          p.x = b.x + bollard.width / 2;
          p.y = b.y + bollard.height / 2;
          p.vx = (Math.random() - 0.5) * 100;
          p.vy = (Math.random() - 0.5) * 100;
          p.life = 1.0;
          p.color = streak > 10 ? COLORS.NEON_GREEN : COLORS.CAUTION_YELLOW;
          particles.push(p);
        }
        
        recalcDifficulty();
        maybeSpawnShield();
        maybeSpawnLaser();
        maybeSpawnSpeedBoost();
        maybeSpawnScoreMultiplier();
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
          // Add shield break particles (using object pool)
          for (let i = 0; i < 8 && particles.length < MAX_PARTICLES; i++) {
            const p = getParticle();
            p.x = player.x + player.width / 2;
            p.y = player.y + player.height / 2;
            p.vx = (Math.random() - 0.5) * 200;
            p.vy = (Math.random() - 0.5) * 200;
            p.life = 1.0;
            p.color = COLORS.BOLT_BLUE;
            particles.push(p);
          }
        } else {
          health -= 1;
          streak = 0;
          invulnerableFor = isCoarsePointer() ? 1.2 : 1.0; // slightly shorter to restore challenge
          // Screen shake on damage
          screenShake.intensity = reducedMotion ? 4 : 10;
          // Add damage particles (using object pool)
          for (let i = 0; i < 12 && particles.length < MAX_PARTICLES; i++) {
            const p = getParticle();
            p.x = player.x + player.width / 2;
            p.y = player.y + player.height / 2;
            p.vx = (Math.random() - 0.5) * 300;
            p.vy = (Math.random() - 0.5) * 300;
            p.life = 1.5;
            p.color = COLORS.DEEP_RED;
            particles.push(p);
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

    // Speed boost power-up movement and pickup
    if (speedBoost.visible) {
      speedBoost.y += speedBoost.vy * dt;
      const pb3 = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(speedBoost.x - speedBoost.size / 2, speedBoost.y - speedBoost.size / 2, speedBoost.size, speedBoost.size,
        pb3.x, pb3.y, pb3.w, pb3.h)) {
        speedBoost.visible = false;
        speedBoost.active = true;
        speedBoost.timeLeft = isCoarsePointer() ? 8.0 : 7.0;
        playClick();
      }
      if (speedBoost.y - speedBoost.size / 2 > screen.height) speedBoost.visible = false;
    }

    // Update active speed boost timer
    if (speedBoost.active) {
      speedBoost.timeLeft -= dt;
      if (speedBoost.timeLeft <= 0) {
        speedBoost.active = false;
      }
    }

    // Score multiplier power-up movement and pickup
    if (scoreMultiplierPU.visible) {
      scoreMultiplierPU.y += scoreMultiplierPU.vy * dt;
      const pb4 = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(scoreMultiplierPU.x - scoreMultiplierPU.size / 2, scoreMultiplierPU.y - scoreMultiplierPU.size / 2, scoreMultiplierPU.size, scoreMultiplierPU.size,
        pb4.x, pb4.y, pb4.w, pb4.h)) {
        scoreMultiplierPU.visible = false;
        scoreMultiplierPU.active = true;
        scoreMultiplierPU.timeLeft = isCoarsePointer() ? 10.0 : 8.0;
        playClick();
      }
      if (scoreMultiplierPU.y - scoreMultiplierPU.size / 2 > screen.height) scoreMultiplierPU.visible = false;
    }

    // Update active score multiplier timer
    if (scoreMultiplierPU.active) {
      scoreMultiplierPU.timeLeft -= dt;
      if (scoreMultiplierPU.timeLeft <= 0) {
        scoreMultiplierPU.active = false;
        activeScoreMultiplier = 1;
      } else {
        activeScoreMultiplier = scoreMultiplierPU.multiplier;
      }
    } else {
      activeScoreMultiplier = 1;
    }

    // Update particles (with object pooling)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        releaseParticle(particles[i]);
        particles.splice(i, 1);
      }
    }

    // Update lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.y += l.vy * dt;
      // Collision with bollards
      for (let j = 0; j < bollards.length; j++) {
        const b = bollards[j];
        if (rectsOverlap(l.x - 2, l.y - 16, 4, 32, b.x, b.y, bollard.width, bollard.height)) {
          // Destroy bollard and respawn
          b.y = Math.floor(-140 - Math.random() * 220);
          b.x = pickSpawnX(b.y);
          score += 2; // small bonus
          break;
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
      const finalScore = Math.floor(score * scoreMultiplier * activeScoreMultiplier);
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
      if (canDraw(visitorImg)) ctx.drawImage(visitorImg, player.x, player.y, player.width, player.height);
      else {
        ctx.fillStyle = COLORS.NEON_GREEN;
        ctx.fillRect(player.x, player.y, player.width, player.height);
      }
    }

    // Bollards
    for (const b of bollards) {
      if (canDraw(bollardImg)) ctx.drawImage(bollardImg, b.x, b.y, bollard.width, bollard.height);
      else {
        ctx.fillStyle = COLORS.CAUTION_YELLOW;
        ctx.fillRect(b.x, b.y, bollard.width, bollard.height);
      }
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
      const iconScale = isCoarsePointer() ? 1.6 : 1.2;
      if (canDraw(whiteMonsterImg)) ctx.drawImage(whiteMonsterImg, -laserPU.size * 0.6, -laserPU.size * 0.6, laserPU.size * iconScale, laserPU.size * iconScale);
      else {
        ctx.fillStyle = COLORS.WHITE;
        ctx.beginPath();
        ctx.arc(0, 0, laserPU.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Speed boost power-up rendering
    if (speedBoost.visible) {
      ctx.save();
      ctx.translate(speedBoost.x, speedBoost.y);
      const gradient3 = ctx.createRadialGradient(0, 0, 2, 0, 0, speedBoost.size);
      gradient3.addColorStop(0, 'rgba(255,111,0,0.95)');
      gradient3.addColorStop(1, 'rgba(255,111,0,0.05)');
      ctx.fillStyle = gradient3;
      ctx.beginPath();
      ctx.arc(0, 0, speedBoost.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ELECTRIC_ORANGE;
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', 0, 0);
      ctx.restore();
    }

    // Score multiplier power-up rendering
    if (scoreMultiplierPU.visible) {
      ctx.save();
      ctx.translate(scoreMultiplierPU.x, scoreMultiplierPU.y);
      const gradient4 = ctx.createRadialGradient(0, 0, 2, 0, 0, scoreMultiplierPU.size);
      gradient4.addColorStop(0, 'rgba(255,215,0,0.95)');
      gradient4.addColorStop(1, 'rgba(255,215,0,0.05)');
      ctx.fillStyle = gradient4;
      ctx.beginPath();
      ctx.arc(0, 0, scoreMultiplierPU.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.CAUTION_YELLOW;
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⭐', 0, 0);
      ctx.restore();
    }

    // Active lasers firing effect
    if (laserPU.active) {
      const fireInterval = 0.24; // slightly slower beams for balance
      laserPU._acc = (laserPU._acc || 0) + dt;
      if (laserPU._acc >= fireInterval) {
        laserPU._acc = 0;
        // Fire a straight beam upward from car center
        if (lasers.length < 20) { // Limit laser count for performance
          lasers.push({ x: player.x + player.width / 2, y: player.y, vy: -900 });
        }
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

    // Draw active lasers (optimized batch rendering)
    if (lasers.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 8;
      for (const l of lasers) {
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x, l.y - 32);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Active speed boost visual effect
    if (speedBoost.active) {
      ctx.save();
      const pulse = 1 + 0.15 * Math.sin(performance.now() / 100);
      ctx.strokeStyle = COLORS.ELECTRIC_ORANGE;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(
        player.x + player.width / 2,
        player.y + player.height / 2,
        (player.width * 0.7) * pulse,
        (player.height * 0.7) * pulse,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    // Active score multiplier visual effect
    if (scoreMultiplierPU.active) {
      ctx.save();
      const pulse = 1 + 0.12 * Math.sin(performance.now() / 150);
      ctx.strokeStyle = COLORS.CAUTION_YELLOW;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      ctx.shadowColor = COLORS.CAUTION_YELLOW;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(
        player.x + player.width / 2,
        player.y + player.height / 2,
        (player.width * 0.65) * pulse,
        (player.height * 0.65) * pulse,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
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

    // Draw particles (skip in reduced motion, optimized rendering)
    if (!reducedMotion && particles.length > 0) {
      ctx.save();
      for (const p of particles) {
        const alpha = Math.max(0, p.life);
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const size = Math.max(1, 3 * alpha);
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
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
    try {
      // Calculate FPS for performance monitoring
      frameCount++;
      if (now - lastFrameTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
      }
      
      const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp dt to avoid spikes
      lastTime = now;
      update(dt);
      draw();
    } catch (e) {
      // Prevent total freeze; log once
      if (!window.__BS_LAST_ERR || (now - window.__BS_LAST_ERR.time) > 1000) {
        console.error('Game loop error', e);
        window.__BS_LAST_ERR = { time: now, e };
      }
    } finally {
      requestAnimationFrame(loop);
    }
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
  // Attach persistent unlockers; we detach only on success
  document.addEventListener('touchstart', tryStartMusicFromGesture, { passive: true });
  document.addEventListener('pointerdown', tryStartMusicFromGesture);
  document.addEventListener('mousedown', tryStartMusicFromGesture);
  document.addEventListener('keydown', tryStartMusicFromGesture);

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

  // On-screen pads with better touch handling
  const handlePadStart = (direction) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (direction === 'left') player.leftPressed = true;
    else player.rightPressed = true;
    haptic(10);
  };
  const handlePadEnd = (direction) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (direction === 'left') player.leftPressed = false;
    else player.rightPressed = false;
  };
  
  el.moveLeft.addEventListener('touchstart', handlePadStart('left'), { passive: false });
  el.moveLeft.addEventListener('touchend', handlePadEnd('left'), { passive: false });
  el.moveLeft.addEventListener('touchcancel', handlePadEnd('left'), { passive: false });
  el.moveLeft.addEventListener('mousedown', handlePadStart('left'));
  el.moveLeft.addEventListener('mouseup', handlePadEnd('left'));
  el.moveLeft.addEventListener('mouseleave', handlePadEnd('left'));
  
  el.moveRight.addEventListener('touchstart', handlePadStart('right'), { passive: false });
  el.moveRight.addEventListener('touchend', handlePadEnd('right'), { passive: false });
  el.moveRight.addEventListener('touchcancel', handlePadEnd('right'), { passive: false });
  el.moveRight.addEventListener('mousedown', handlePadStart('right'));
  el.moveRight.addEventListener('mouseup', handlePadEnd('right'));
  el.moveRight.addEventListener('mouseleave', handlePadEnd('right'));

  // Full-width touch zones for left/right halves with improved handling
  if (el.zoneLeft && el.zoneRight) {
    const onLeftStart = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      player.leftPressed = true;
      player.rightPressed = false; // Ensure only one direction
    };
    const onLeftEnd = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      player.leftPressed = false;
    };
    const onRightStart = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      player.rightPressed = true;
      player.leftPressed = false; // Ensure only one direction
    };
    const onRightEnd = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      player.rightPressed = false;
    };
    el.zoneLeft.addEventListener('touchstart', onLeftStart, { passive: false });
    el.zoneLeft.addEventListener('touchend', onLeftEnd, { passive: false });
    el.zoneLeft.addEventListener('touchcancel', onLeftEnd, { passive: false });
    el.zoneLeft.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
    el.zoneRight.addEventListener('touchstart', onRightStart, { passive: false });
    el.zoneRight.addEventListener('touchend', onRightEnd, { passive: false });
    el.zoneRight.addEventListener('touchcancel', onRightEnd, { passive: false });
    el.zoneRight.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
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
  
  if (el.refreshLeaderboard) {
    el.refreshLeaderboard.addEventListener('click', () => {
      playClick();
      renderLeaderboard();
    });
  }
  el.nameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (el.playerName.value || 'Anonymous').trim().slice(0, 20);
    const finalScore = parseInt(el.finalScore.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    try {
      // Always try global first
      const entries = await postGlobalLeaderboard({ name, score: finalScore, level: currentLevel });
      renderEntries(entries);
      // Show success indicator
      const sourceIndicator = document.createElement('li');
      sourceIndicator.style.cssText = 'font-size: 12px; color: #39ff14; font-style: italic; margin-top: 8px; list-style: none;';
      sourceIndicator.textContent = `✅ Score saved to Global Leaderboard (${leaderboardSource})`;
      el.lbList.appendChild(sourceIndicator);
    } catch (err) {
      // Fallback to local storage
      console.warn('Global leaderboard unavailable, using local storage:', err);
      const entries = getLeaderboard();
      entries.push({ name, score: finalScore, level: currentLevel, date: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      saveLeaderboard(entries);
      renderEntries(entries);
      // Show local indicator
      const sourceIndicator = document.createElement('li');
      sourceIndicator.style.cssText = 'font-size: 12px; color: #ffd700; font-style: italic; margin-top: 8px; list-style: none;';
      sourceIndicator.textContent = '⚠️ Saved locally (Global leaderboard unavailable)';
      el.lbList.appendChild(sourceIndicator);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      el.playerName.value = '';
      showOverlay('leaderboard');
    }
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
    // Support pointer, touch and click on mobile
    const openSettings = (e) => { if (e) e.preventDefault(); playClick(); showOverlay('settings'); };
    el.settingsFab.addEventListener('pointerdown', openSettings, { passive: false });
    el.settingsFab.addEventListener('touchstart', openSettings, { passive: false });
    el.settingsFab.addEventListener('click', openSettings);
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
      const currentSpeed = speedBoost.active ? player.speed * 1.5 : player.speed;
      const delta = tiltAxis * (currentSpeed * tiltSensitivity) * dt;
      player.x += delta;
      // Clamp after tilt movement
      if (player.x < 0) player.x = 0;
      if (player.x > screen.width - player.width) player.x = screen.width - player.width;
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


