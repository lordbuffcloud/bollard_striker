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
  // Laser power-up uses a simple white circle if image not available
  const whiteMonsterImg = new Image();
  whiteMonsterImg.src = 'white_monster.png'; // Optional - will fallback to drawn circle
  function canDraw(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }
  visitorImg.onerror = () => {};
  bollardImg.onerror = () => {};
  whiteMonsterImg.onerror = () => {}; // Gracefully handle missing image

  const sfx = {
    collision: new Audio('bollard_striker/sounds/collision.mp3'),
    click: new Audio('bollard_striker/sounds/click.mp3')
  };
  sfx.collision.preload = 'auto';
  sfx.click.preload = 'auto';
  const bgm = new Audio('bollard_striker/sounds/background.mp3');
  bgm.loop = true;
  bgm.preload = 'auto';

  // Game State
  const SOUND_PREF_KEY = 'bollard-striker-sound';
  const VIBRATE_PREF_KEY = 'bollard-striker-vibrate';
  const MUSIC_PREF_KEY = 'bollard-striker-music';
  const TILT_PREF_KEY = 'bollard-striker-tilt-enabled';
  const TILT_SENS_PREF_KEY = 'bollard-striker-tilt-sensitivity';
  const REDUCED_MOTION_PREF_KEY = 'bollard-striker-reduced-motion';
  const MASTER_VOLUME_KEY = 'bollard-striker-master-volume';
  const MUSIC_VOLUME_KEY = 'bollard-striker-music-volume';
  const SFX_VOLUME_KEY = 'bollard-striker-sfx-volume';
  const STATS_KEY = 'bollard-striker-stats-v1';
  const ACHIEVEMENTS_KEY = 'bollard-striker-achievements-v1';
  let soundEnabled = false;
  let vibrationEnabled = false;
  let musicEnabled = false;
  let reducedMotion = false;
  let tiltEnabled = false;
  let tiltSensitivity = 1.0;
  let tiltAxis = 0;
  let masterVolume = 100;
  let musicVolume = 60;
  let sfxVolume = 100;
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
  let lastFinalScore = 0; // Store final score for leaderboard submission
  let gameStartTime = 0; // Track game session time
  let gamePowerUps = { total: 0, shields: 0, lasers: 0, speedBoosts: 0, multipliers: 0 }; // Track power-ups this game
  let gameBollardsDodged = 0; // Track bollards dodged this game
  let perfectRun = true; // Track if player took no damage
  let maxMultiplier = 1; // Track max multiplier achieved
  let scorePopUps = []; // For visual score pop-ups

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
    statistics: document.getElementById('statistics'),
    achievements: document.getElementById('achievements'),
    lbList: document.getElementById('leaderboardList'),
    statsContent: document.getElementById('statsContent'),
    achievementsList: document.getElementById('achievementsList'),
    startBtn: document.getElementById('startBtn'),
    leaderboardBtn: document.getElementById('leaderboardBtn'),
    statsBtn: document.getElementById('statsBtn'),
    achievementsBtn: document.getElementById('achievementsBtn'),
    tutorialBtn: document.getElementById('tutorialBtn'),
    backFromLeaderboard: document.getElementById('backFromLeaderboard'),
    backFromStats: document.getElementById('backFromStats'),
    resetStatsBtn: document.getElementById('resetStatsBtn'),
    backFromAchievements: document.getElementById('backFromAchievements'),
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
    masterVolume: document.getElementById('masterVolume'),
    masterVolumeValue: document.getElementById('masterVolumeValue'),
    musicVolume: document.getElementById('musicVolume'),
    musicVolumeValue: document.getElementById('musicVolumeValue'),
    sfxVolume: document.getElementById('sfxVolume'),
    sfxVolumeValue: document.getElementById('sfxVolumeValue'),
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

  // Statistics tracking
  function getStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return {
        gamesPlayed: 0,
        totalScore: 0,
        bestScore: 0,
        bestLevel: 1,
        bestStreak: 0,
        totalBollardsDodged: 0,
        totalPlayTime: 0,
        totalPowerUps: 0,
        shieldsCollected: 0,
        lasersCollected: 0,
        speedBoostsCollected: 0,
        multipliersCollected: 0
      };
      return JSON.parse(raw);
    } catch {
      return {
        gamesPlayed: 0,
        totalScore: 0,
        bestScore: 0,
        bestLevel: 1,
        bestStreak: 0,
        totalBollardsDodged: 0,
        totalPlayTime: 0,
        totalPowerUps: 0,
        shieldsCollected: 0,
        lasersCollected: 0,
        speedBoostsCollected: 0,
        multipliersCollected: 0
      };
    }
  }
  
  function saveStats(stats) {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {}
  }
  
  function updateStats(finalScore, finalLevel, finalStreak, bollardsDodged, playTime, powerUps) {
    const stats = getStats();
    stats.gamesPlayed += 1;
    stats.totalScore += finalScore;
    stats.bestScore = Math.max(stats.bestScore, finalScore);
    stats.bestLevel = Math.max(stats.bestLevel, finalLevel);
    stats.bestStreak = Math.max(stats.bestStreak, finalStreak);
    stats.totalBollardsDodged += bollardsDodged;
    stats.totalPlayTime += playTime;
    stats.totalPowerUps += powerUps.total;
    stats.shieldsCollected += powerUps.shields;
    stats.lasersCollected += powerUps.lasers;
    stats.speedBoostsCollected += powerUps.speedBoosts;
    stats.multipliersCollected += powerUps.multipliers;
    saveStats(stats);
    return stats;
  }
  
  function renderStats() {
    if (!el.statsContent) return;
    const stats = getStats();
    const avgScore = stats.gamesPlayed > 0 ? Math.floor(stats.totalScore / stats.gamesPlayed) : 0;
    const playTimeMinutes = Math.floor(stats.totalPlayTime / 60);
    const playTimeSeconds = Math.floor(stats.totalPlayTime % 60);
    
    el.statsContent.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Games</h3>
          <p class="stat-value">${stats.gamesPlayed}</p>
        </div>
        <div class="stat-card">
          <h3>Best Score</h3>
          <p class="stat-value">${stats.bestScore}</p>
        </div>
        <div class="stat-card">
          <h3>Best Level</h3>
          <p class="stat-value">${stats.bestLevel}</p>
        </div>
        <div class="stat-card">
          <h3>Best Streak</h3>
          <p class="stat-value">${stats.bestStreak}</p>
        </div>
        <div class="stat-card">
          <h3>Total Score</h3>
          <p class="stat-value">${stats.totalScore.toLocaleString()}</p>
        </div>
        <div class="stat-card">
          <h3>Average Score</h3>
          <p class="stat-value">${avgScore}</p>
        </div>
        <div class="stat-card">
          <h3>Bollards Dodged</h3>
          <p class="stat-value">${stats.totalBollardsDodged.toLocaleString()}</p>
        </div>
        <div class="stat-card">
          <h3>Play Time</h3>
          <p class="stat-value">${playTimeMinutes}m ${playTimeSeconds}s</p>
        </div>
        <div class="stat-card">
          <h3>Power-Ups Collected</h3>
          <p class="stat-value">${stats.totalPowerUps}</p>
        </div>
        <div class="stat-card">
          <h3>Shields</h3>
          <p class="stat-value">${stats.shieldsCollected}</p>
        </div>
        <div class="stat-card">
          <h3>Lasers</h3>
          <p class="stat-value">${stats.lasersCollected}</p>
        </div>
        <div class="stat-card">
          <h3>Speed Boosts</h3>
          <p class="stat-value">${stats.speedBoostsCollected}</p>
        </div>
        <div class="stat-card">
          <h3>Multipliers</h3>
          <p class="stat-value">${stats.multipliersCollected}</p>
        </div>
      </div>
    `;
  }

  // Achievements system
  const ACHIEVEMENTS = [
    { id: 'first_strike', name: 'First Strike', desc: 'Hit your first bollard', icon: '🏆', unlocked: false },
    { id: 'on_fire', name: 'On Fire', desc: 'Reach a streak of 50', icon: '🔥', unlocked: false },
    { id: 'protected', name: 'Protected', desc: 'Collect 10 shields', icon: '🛡️', unlocked: false },
    { id: 'laser_master', name: 'Laser Master', desc: 'Collect 5 lasers', icon: '💥', unlocked: false },
    { id: 'perfect_run', name: 'Perfect Run', desc: 'Complete a game without taking damage', icon: '🎯', unlocked: false },
    { id: 'level_up', name: 'Level Up', desc: 'Reach level 10', icon: '📈', unlocked: false },
    { id: 'speed_demon', name: 'Speed Demon', desc: 'Use speed boost 5 times', icon: '⚡', unlocked: false },
    { id: 'multiplier_master', name: 'Multiplier Master', desc: 'Get 5x score multiplier', icon: '🌟', unlocked: false },
    { id: 'survivor', name: 'Survivor', desc: 'Dodge 100 bollards in one game', icon: '💪', unlocked: false },
    { id: 'veteran', name: 'Veteran', desc: 'Play 50 games', icon: '🎖️', unlocked: false },
    { id: 'centurion', name: 'Centurion', desc: 'Reach a streak of 100', icon: '👑', unlocked: false },
    { id: 'collector', name: 'Collector', desc: 'Collect 50 power-ups total', icon: '📦', unlocked: false },
    { id: 'high_score', name: 'High Score', desc: 'Score over 500 points', icon: '⭐', unlocked: false },
    { id: 'marathon', name: 'Marathon', desc: 'Play for over 5 minutes total', icon: '🏃', unlocked: false }
  ];
  
  function getAchievements() {
    try {
      const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
      if (!raw) return ACHIEVEMENTS.map(a => ({ ...a }));
      const saved = JSON.parse(raw);
      return ACHIEVEMENTS.map(ach => {
        const savedAch = saved.find(s => s.id === ach.id);
        return savedAch ? { ...ach, unlocked: savedAch.unlocked } : { ...ach };
      });
    } catch {
      return ACHIEVEMENTS.map(a => ({ ...a }));
    }
  }
  
  function saveAchievements(achievements) {
    try {
      localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achievements));
    } catch {}
  }
  
  function checkAchievements(stats, gameStats) {
    const achievements = getAchievements();
    let newUnlocks = [];
    
    achievements.forEach(ach => {
      if (ach.unlocked) return;
      
      let unlocked = false;
      switch (ach.id) {
        case 'first_strike':
          unlocked = stats.gamesPlayed > 0;
          break;
        case 'on_fire':
          unlocked = gameStats.bestStreak >= 50;
          break;
        case 'protected':
          unlocked = stats.shieldsCollected >= 10;
          break;
        case 'laser_master':
          unlocked = stats.lasersCollected >= 5; // Adjusted for balance
          break;
        case 'perfect_run':
          unlocked = gameStats.perfectRun || false;
          break;
        case 'level_up':
          unlocked = gameStats.finalLevel >= 10;
          break;
        case 'speed_demon':
          unlocked = stats.speedBoostsCollected >= 5;
          break;
        case 'multiplier_master':
          unlocked = gameStats.maxMultiplier >= 5;
          break;
        case 'survivor':
          unlocked = gameStats.bollardsDodged >= 100;
          break;
        case 'veteran':
          unlocked = stats.gamesPlayed >= 50;
          break;
        case 'centurion':
          unlocked = gameStats.bestStreak >= 100;
          break;
        case 'collector':
          unlocked = stats.totalPowerUps >= 50;
          break;
        case 'high_score':
          unlocked = gameStats.finalScore >= 500;
          break;
        case 'marathon':
          unlocked = stats.totalPlayTime >= 300; // 5 minutes
          break;
      }
      
      if (unlocked) {
        ach.unlocked = true;
        newUnlocks.push(ach);
      }
    });
    
    if (newUnlocks.length > 0) {
      saveAchievements(achievements);
      showAchievementUnlock(newUnlocks[0]);
    }
    
    return achievements;
  }
  
  function showAchievementUnlock(achievement) {
    const notification = document.createElement('div');
    notification.className = 'achievement-notification';
    notification.innerHTML = `
      <div class="achievement-notification-content">
        <span class="achievement-icon">${achievement.icon}</span>
        <div>
          <h4>Achievement Unlocked!</h4>
          <p>${achievement.name}</p>
        </div>
      </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  function renderAchievements() {
    if (!el.achievementsList) return;
    const achievements = getAchievements();
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    
    el.achievementsList.innerHTML = `
      <p style="text-align: center; margin-bottom: 16px; color: #888;">
        ${unlockedCount} / ${achievements.length} Unlocked
      </p>
      <div class="achievements-grid">
        ${achievements.map(ach => `
          <div class="achievement-card ${ach.unlocked ? 'unlocked' : 'locked'}">
            <div class="achievement-icon-large">${ach.unlocked ? ach.icon : '🔒'}</div>
            <h3>${ach.name}</h3>
            <p>${ach.desc}</p>
            ${ach.unlocked ? '<span class="achievement-badge">Unlocked</span>' : ''}
          </div>
        `).join('')}
      </div>
    `;
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
  try { const v = localStorage.getItem(MASTER_VOLUME_KEY); if (v != null) { const n = Number(v); if (Number.isFinite(n)) masterVolume = Math.max(0, Math.min(100, n)); } } catch {}
  try { const v = localStorage.getItem(MUSIC_VOLUME_KEY); if (v != null) { const n = Number(v); if (Number.isFinite(n)) musicVolume = Math.max(0, Math.min(100, n)); } } catch {}
  try { const v = localStorage.getItem(SFX_VOLUME_KEY); if (v != null) { const n = Number(v); if (Number.isFinite(n)) sfxVolume = Math.max(0, Math.min(100, n)); } } catch {}
  updateAudioVolumes();
  if (el.soundToggle) el.soundToggle.textContent = `Sound: ${soundEnabled ? 'On' : 'Off'}`;
  if (el.vibrationToggle) el.vibrationToggle.textContent = `Vibrate: ${vibrationEnabled ? 'On' : 'Off'}`;
  if (el.enableMusic) el.enableMusic.checked = musicEnabled;
  if (el.enableTilt) el.enableTilt.checked = tiltEnabled;
  if (el.tiltSensitivity) el.tiltSensitivity.value = String(tiltSensitivity);
  if (el.reducedMotion) el.reducedMotion.checked = reducedMotion;
  if (el.masterVolume) { el.masterVolume.value = String(masterVolume); el.masterVolumeValue.textContent = `${masterVolume}%`; }
  if (el.musicVolume) { el.musicVolume.value = String(musicVolume); el.musicVolumeValue.textContent = `${musicVolume}%`; }
  if (el.sfxVolume) { el.sfxVolume.value = String(sfxVolume); el.sfxVolumeValue.textContent = `${sfxVolume}%`; }

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
      
      // Reposition all bollards to ensure they're within bounds
      for (const b of bollards) {
        b.x = Math.max(0, Math.min(screen.width - bollard.width, b.x));
        // Keep bollards at their current Y or reset if way off screen
        if (b.y < -500 || b.y > screen.height + 500) {
          b.y = Math.floor(-140 - Math.random() * 220);
          b.x = pickSpawnX(b.y);
        }
      }
      
      // Reposition power-ups if visible
      if (shield.visible) {
        shield.x = Math.max(shield.size, Math.min(screen.width - shield.size, shield.x));
      }
      if (laserPU.visible) {
        laserPU.x = Math.max(laserPU.size, Math.min(screen.width - laserPU.size, laserPU.x));
      }
      if (speedBoost.visible) {
        speedBoost.x = Math.max(speedBoost.size, Math.min(screen.width - speedBoost.size, speedBoost.x));
      }
      if (scoreMultiplierPU.visible) {
        scoreMultiplierPU.x = Math.max(scoreMultiplierPU.size, Math.min(screen.width - scoreMultiplierPU.size, scoreMultiplierPU.x));
      }
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
  function updateAudioVolumes() {
    const masterVol = masterVolume / 100;
    bgm.volume = (musicVolume / 100) * masterVol;
    sfx.collision.volume = (sfxVolume / 100) * masterVol;
    sfx.click.volume = (sfxVolume / 100) * masterVol;
  }
  
  function playClick() {
    if (!soundEnabled) return;
    try { 
      sfx.click.currentTime = 0; 
      const playPromise = sfx.click.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {}); // Handle autoplay restrictions
      }
    } catch {}
  }
  function playCollision() {
    if (!soundEnabled) return;
    try { 
      sfx.collision.currentTime = 0; 
      const playPromise = sfx.collision.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {}); // Handle autoplay restrictions
      }
    } catch {}
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
    lastFinalScore = 0;
    // gameStartTime will be set when game actually starts (after countdown)
    gamePowerUps = { total: 0, shields: 0, lasers: 0, speedBoosts: 0, multipliers: 0 };
    gameBollardsDodged = 0;
    perfectRun = true;
    maxMultiplier = 1;
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
    scorePopUps.length = 0;
    screenShake.intensity = 0;
    screenShake.x = 0; // Explicitly reset screen shake position
    screenShake.y = 0;
    invulnerableFor = 0;
    tiltAxis = 0; // Reset tilt axis
    player.leftPressed = false; // Reset input states
    player.rightPressed = false;
    configureSizesForCurrentViewport();
    player.x = Math.floor((lanes.count * lanes.width) / 2 - player.width / 2);
    player.y = screen.height - Math.max(150, Math.floor(player.height * 1.5));
    initBollards();
  }

  function showOverlay(which) {
    for (const k of ['landing', 'leaderboard', 'gameOver', 'settings', 'tutorial', 'statistics', 'achievements']) {
      if (el[k]) el[k].classList.remove('visible');
    }
    if (which && el[which]) {
      el[which].classList.add('visible');
      if (which === 'statistics') renderStats();
      if (which === 'achievements') renderAchievements();
    }
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
    // Set game start time when game actually starts (after countdown)
    gameStartTime = performance.now() / 1000;
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
    
    // Show combo multiplier if active
    if (activeScoreMultiplier > 1) {
      ctx.fillStyle = COLORS.CAUTION_YELLOW;
      ctx.font = 'bold 18px Arial';
      ctx.fillText(`${activeScoreMultiplier}x`, 10, 35);
      ctx.font = 'bold 22px Arial';
    }
    
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
    if (!running) {
      // Clear visual effects when game is not running
      scorePopUps.length = 0;
      return;
    }
    if (paused) {
      // Don't update visuals when paused, but keep them for when we resume
      return;
    }

    // timers
    if (invulnerableFor > 0) invulnerableFor = Math.max(0, invulnerableFor - dt);

    // Move player (with speed boost)
    const currentSpeed = speedBoost.active ? player.speed * 1.5 : player.speed;
    if (player.leftPressed && player.x > 0) player.x -= currentSpeed * dt;
    if (player.rightPressed && player.x < screen.width - player.width) player.x += currentSpeed * dt;
    // clamp
    if (player.x < 0) player.x = 0;
    if (player.x > screen.width - player.width) player.x = screen.width - player.width;

    // Move bollards (with speed boost consideration for difficulty)
    const effectiveBollardSpeed = speedBoost.active ? bollard.speed * 0.95 : bollard.speed; // Slightly slower when speed boost active for balance
    for (const b of bollards) {
      b.y += effectiveBollardSpeed * dt;
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
        gameBollardsDodged += 1;
        const comboBonus = 1 + Math.min(12, Math.floor(streak / 5)); // Slightly gentler scaling for mobile fairness
        const baseScore = comboBonus * activeScoreMultiplier;
        score += baseScore;
        dodgeSinceLastLaser += 1;
        // Add score pop-up with combo indicator for high streaks
        const comboText = streak >= 20 ? ' 🔥' : streak >= 10 ? ' ⚡' : '';
        scorePopUps.push({
          x: b.x + bollard.width / 2,
          y: b.y + bollard.height / 2,
          value: `+${baseScore}${comboText}`,
          life: 1.2,
          vy: -60
        });
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
          perfectRun = false; // Player took damage
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

    // Power-up movement and pickup (only when game is running and not paused)
    if (shield.visible && running && !paused) {
      shield.y += (reducedMotion ? shield.vy * 0.8 : shield.vy) * dt;
      // pickup check (simple AABB with slightly reduced player box)
      const pb = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(shield.x - shield.size / 2, shield.y - shield.size / 2, shield.size, shield.size,
        pb.x, pb.y, pb.w, pb.h)) {
        shield.visible = false;
        shield.active = true;
        gamePowerUps.total++;
        gamePowerUps.shields++;
        playClick();
      }
      if (shield.y - shield.size / 2 > screen.height) {
        shield.visible = false;
      }
    }

    // Laser power-up movement and pickup
    if (laserPU.visible && running && !paused) {
      laserPU.y += laserPU.vy * dt;
      const pb2 = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(laserPU.x - laserPU.size / 2, laserPU.y - laserPU.size / 2, laserPU.size, laserPU.size,
        pb2.x, pb2.y, pb2.w, pb2.h)) {
        laserPU.visible = false;
        laserPU.active = true;
        laserPU.timeLeft = isCoarsePointer() ? 6.0 : 5.0; // Slightly longer on mobile
        gamePowerUps.total++;
        gamePowerUps.lasers++;
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
    if (speedBoost.visible && running && !paused) {
      speedBoost.y += speedBoost.vy * dt;
      const pb3 = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(speedBoost.x - speedBoost.size / 2, speedBoost.y - speedBoost.size / 2, speedBoost.size, speedBoost.size,
        pb3.x, pb3.y, pb3.w, pb3.h)) {
        speedBoost.visible = false;
        speedBoost.active = true;
        speedBoost.timeLeft = isCoarsePointer() ? 8.0 : 7.0;
        gamePowerUps.total++;
        gamePowerUps.speedBoosts++;
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
    if (scoreMultiplierPU.visible && running && !paused) {
      scoreMultiplierPU.y += scoreMultiplierPU.vy * dt;
      const pb4 = scaledRect(player.x, player.y, player.width, player.height, 0.9);
      if (rectsOverlap(scoreMultiplierPU.x - scoreMultiplierPU.size / 2, scoreMultiplierPU.y - scoreMultiplierPU.size / 2, scoreMultiplierPU.size, scoreMultiplierPU.size,
        pb4.x, pb4.y, pb4.w, pb4.h)) {
        scoreMultiplierPU.visible = false;
        scoreMultiplierPU.active = true;
        scoreMultiplierPU.timeLeft = isCoarsePointer() ? 10.0 : 8.0;
        gamePowerUps.total++;
        gamePowerUps.multipliers++;
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
        maxMultiplier = Math.max(maxMultiplier, activeScoreMultiplier);
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
    
    // Update score pop-ups
    for (let i = scorePopUps.length - 1; i >= 0; i--) {
      const pop = scorePopUps[i];
      pop.y += pop.vy * dt;
      pop.life -= dt * 0.8;
      if (pop.life <= 0) {
        scorePopUps.splice(i, 1);
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
      if (screenShake.intensity < 0.1) {
        screenShake.intensity = 0;
        screenShake.x = 0; // Explicitly reset to prevent drift
        screenShake.y = 0;
      }
    } else {
      // Ensure screen shake is always reset when intensity is 0
      screenShake.x = 0;
      screenShake.y = 0;
    }

    if (health <= 0) {
      running = false;
      const finalScore = Math.floor(score * scoreMultiplier * activeScoreMultiplier);
      lastFinalScore = finalScore; // Store for leaderboard submission
      // Calculate play time (ensure it's not negative)
      const playTime = gameStartTime > 0 ? Math.max(0, performance.now() / 1000 - gameStartTime) : 0;
      
      // Clear all visual effects when game ends
      scorePopUps.length = 0;
      shield.visible = false;
      laserPU.visible = false;
      speedBoost.visible = false;
      scoreMultiplierPU.visible = false;
      
      // Update statistics (only if game actually ran)
      if (gameStartTime > 0) {
        const stats = updateStats(finalScore, currentLevel, bestStreak, gameBollardsDodged, playTime, gamePowerUps);
        
        // Check achievements
        checkAchievements(stats, {
          finalScore,
          finalLevel: currentLevel,
          bestStreak,
          bollardsDodged: gameBollardsDodged,
          perfectRun,
          maxMultiplier
        });
      }
      
      el.finalScore.textContent = `Your Final Score: ${finalScore} (Best Streak: ${bestStreak})`;
      el.finalLevel.textContent = `You Reached Level: ${currentLevel}`;
      showOverlay('gameOver');
    }
  }

  function draw() {
    // Always clear the entire canvas first to prevent stuck visuals
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.PRIMARY_BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Only draw game elements if game is running
    if (!running) {
      drawHUD();
      return;
    }
    
    ctx.save();
    // Apply screen shake (only if intensity > 0)
    if (screenShake.intensity > 0) {
      ctx.translate(screenShake.x, screenShake.y);
    }
    
    ctx.fillStyle = COLORS.PRIMARY_BACKGROUND;
    // Fill entire screen accounting for potential screen shake offset
    const fillX = screenShake.intensity > 0 ? -screenShake.x : 0;
    const fillY = screenShake.intensity > 0 ? -screenShake.y : 0;
    const fillW = screen.width + (screenShake.intensity > 0 ? Math.abs(screenShake.x) * 2 : 0);
    const fillH = screen.height + (screenShake.intensity > 0 ? Math.abs(screenShake.y) * 2 : 0);
    ctx.fillRect(fillX, fillY, fillW, fillH);

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

    // Player (flicker when invulnerable, with trail effect for speed boost)
    const flicker = invulnerableFor > 0 && Math.floor(performance.now() / 100) % 2 === 0;
    if (!flicker) {
      // Draw trail effect when speed boost is active
      if (speedBoost.active && !reducedMotion) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = COLORS.ELECTRIC_ORANGE;
        ctx.fillRect(player.x - 5, player.y, player.width + 10, player.height);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(player.x - 3, player.y, player.width + 6, player.height);
        ctx.restore();
      }
      
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

    // Shield power-up rendering (only when game is running)
    if (running && shield.visible) {
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

    // Laser power-up rendering (pickup icon) (only when game is running)
    if (running && laserPU.visible) {
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

    // Speed boost power-up rendering (only when game is running)
    if (running && speedBoost.visible) {
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

    // Score multiplier power-up rendering (only when game is running)
    if (running && scoreMultiplierPU.visible) {
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

    // Active lasers firing effect (only when game is running)
    if (running && laserPU.active) {
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

    // Draw active lasers (optimized batch rendering) (only when game is running)
    if (running && lasers.length > 0) {
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

    // Active speed boost visual effect (only when game is running)
    if (running && speedBoost.active) {
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

    // Active score multiplier visual effect (only when game is running)
    if (running && scoreMultiplierPU.active) {
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

    // Active shield ring around player (only when game is running)
    if (running && shield.active) {
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
    
    // Draw score pop-ups (only when game is running)
    if (running && scorePopUps.length > 0) {
      ctx.save();
      for (const pop of scorePopUps) {
        const alpha = Math.max(0, pop.life);
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        const scale = 0.8 + (1 - pop.life) * 0.2;
        ctx.font = `bold ${Math.floor(20 * scale)}px Arial`;
        ctx.fillStyle = streak > 20 ? COLORS.NEON_GREEN : streak > 10 ? COLORS.CAUTION_YELLOW : COLORS.ELECTRIC_ORANGE;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(pop.value, pop.x, pop.y);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
    
    ctx.restore(); // Restore from screen shake transform
    
    // HUD (drawn without screen shake)
    drawHUD();

    // Pause banner with better visibility
    if (paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, screen.width, screen.height);
      ctx.fillStyle = COLORS.WHITE;
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pauseText = isCoarsePointer() ? 'Paused — Tap Resume' : 'Paused — Press P or tap Resume';
      ctx.fillText(pauseText, screen.width / 2, screen.height / 2);
      // Add subtle pulsing effect
      const pulse = 0.8 + 0.2 * Math.sin(performance.now() / 500);
      ctx.globalAlpha = pulse;
      ctx.font = 'bold 24px Arial';
      ctx.fillText('Game is paused', screen.width / 2, screen.height / 2 + 50);
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
    if (!tiltEnabled || !running || paused) { tiltAxis = 0; return; }
    // gamma: left-right tilt in degrees (-90 to 90). Positive tilt right on iOS.
    const gamma = (typeof e.gamma === 'number') ? e.gamma : 0;
    tiltAxis = Math.max(-1, Math.min(1, gamma / 30));
  }
  function handleDeviceMotion(e) {
    if (!tiltEnabled || !running || paused) { tiltAxis = 0; return; }
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
    if (tiltEnabled) {
      attachMotionListeners();
    } else {
      detachMotionListeners();
      tiltAxis = 0; // Explicitly reset tilt axis when disabled
    }
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
  if (el.statsBtn) {
    el.statsBtn.addEventListener('click', () => {
      playClick();
      renderStats();
      showOverlay('statistics');
    });
  }
  if (el.achievementsBtn) {
    el.achievementsBtn.addEventListener('click', () => {
      playClick();
      renderAchievements();
      showOverlay('achievements');
    });
  }
  if (el.backFromStats) {
    el.backFromStats.addEventListener('click', () => {
      playClick();
      showOverlay('landing');
    });
  }
  if (el.resetStatsBtn) {
    el.resetStatsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
        try {
          localStorage.removeItem(STATS_KEY);
          playClick();
          renderStats();
          haptic([50, 50, 50]);
        } catch {}
      }
    });
  }
  if (el.backFromAchievements) {
    el.backFromAchievements.addEventListener('click', () => {
      playClick();
      showOverlay('landing');
    });
  }
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
    // Use stored final score instead of parsing from textContent
    const finalScore = lastFinalScore || 0;
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
  if (el.masterVolume) {
    el.masterVolume.addEventListener('input', () => {
      const n = Number(el.masterVolume.value);
      if (Number.isFinite(n)) {
        masterVolume = Math.max(0, Math.min(100, n));
        if (el.masterVolumeValue) el.masterVolumeValue.textContent = `${masterVolume}%`;
        updateAudioVolumes();
        try { localStorage.setItem(MASTER_VOLUME_KEY, String(masterVolume)); } catch {}
      }
    });
  }
  if (el.musicVolume) {
    el.musicVolume.addEventListener('input', () => {
      const n = Number(el.musicVolume.value);
      if (Number.isFinite(n)) {
        musicVolume = Math.max(0, Math.min(100, n));
        if (el.musicVolumeValue) el.musicVolumeValue.textContent = `${musicVolume}%`;
        updateAudioVolumes();
        try { localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)); } catch {}
      }
    });
  }
  if (el.sfxVolume) {
    el.sfxVolume.addEventListener('input', () => {
      const n = Number(el.sfxVolume.value);
      if (Number.isFinite(n)) {
        sfxVolume = Math.max(0, Math.min(100, n));
        if (el.sfxVolumeValue) el.sfxVolumeValue.textContent = `${sfxVolume}%`;
        updateAudioVolumes();
        try { localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume)); } catch {}
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

  // Auto-pause when tab hidden (and resume music if needed)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !paused) {
      paused = true;
      if (el.pauseBtn) el.pauseBtn.textContent = 'Resume';
      // Pause background music when tab is hidden
      try { bgm.pause(); } catch {}
    } else if (!document.hidden && running && paused && musicEnabled) {
      // Optionally resume music when tab becomes visible again
      tryStartMusicFromGesture();
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
    } else if (!tiltEnabled || !running || paused) {
      // Ensure tilt axis is reset when game is not running or tilt is disabled
      tiltAxis = 0;
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


