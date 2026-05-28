cat > /home/claude/game.js << 'JSEOF'
// ═══════════════════════════════════════════════════════
//  水果大戰爭 — game.js  (Canvas 2D real-time battle)
// ═══════════════════════════════════════════════════════

const socket = io();

// ─── State ────────────────────────────────────────────
const G = {
  playerId:null, username:'', coins:0, dailyStreak:1,
  character:null, roomId:null, mode:null,
  myId:null, oppId:null, players:{},
  queueTimer:null, queueSecs:0, pendingMode:null,
  myWins:0, oppWins:0, pendingLevelUp:false,
  skillCdUntil:0, skillCdMs:1200,
  // canvas
  canvas:null, ctx:null, animId:null,
  fighters:{},   // id -> Fighter object
  particles:[],
  hitFlash:{},   // id -> frameCount
  roundEndTimer:0,
  arenaW:0, arenaH:0,
};

// ─── Character data ───────────────────────────────────
const CHARS = {
  mango:{ name:'芒妹',   emoji:'🥭', color:'#FF8C00', hp:300, atk:22, cd:1200, skillName:'芒果颶風',
          bodyColor:'#FF8C00', accentColor:'#FFD166', eye:'😠' },
  peach:{ name:'桃妹',   emoji:'🍑', color:'#FF69B4', hp:360, atk:16, cd:900,  skillName:'桃花亂舞',
          bodyColor:'#FF69B4', accentColor:'#FFB3D1', eye:'🥰' },
  tea:  { name:'茶妹',   emoji:'🍵', color:'#3CB371', hp:260, atk:26, cd:1000, skillName:'抹茶爆擊',
          bodyColor:'#3CB371', accentColor:'#90EE90', eye:'😤' },
  mimi: { name:'米米',   emoji:'🍚', color:'#D4B483', hp:420, atk:14, cd:800,  skillName:'米粒風暴',
          bodyColor:'#C8A96E', accentColor:'#F5DEB3', eye:'😊' },
  lemon:{ name:'檸檬酸', emoji:'🍋', color:'#FFD700', hp:240, atk:30, cd:1400, skillName:'酸液噴射',
          bodyColor:'#FFD700', accentColor:'#FFFACD', eye:'😈' },
};

// ─── DOM ──────────────────────────────────────────────
const $  = id => document.getElementById(id);
const SC = { login:$('screen-login'), lobby:$('screen-lobby'), queue:$('screen-queue'), game:$('screen-game') };

function showScreen(name) {
  Object.values(SC).forEach(s => s.classList.remove('active'));
  SC[name].classList.add('active');
  if (name === 'game') initCanvas();
  else stopCanvas();
}

// ─── Toast ────────────────────────────────────────────
function toast(msg, type='info', ms=2600) {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ─── Modal ────────────────────────────────────────────
const openModal  = id => $(id).classList.add('active');
const closeModal = id => $(id).classList.remove('active');

// ═══════════════════════════════════════════════════════
//  CANVAS ENGINE
// ═══════════════════════════════════════════════════════

class Fighter {
  constructor(id, isLeft, charId, name) {
    this.id      = id;
    this.isLeft  = isLeft;
    this.charId  = charId;
    this.char    = CHARS[charId] || CHARS.mango;
    this.name    = name;
    this.x       = 0; this.y = 0;  // set in resize
    this.baseX   = 0; this.baseY = 0;
    this.vx      = 0; this.vy = 0;
    this.w       = 72; this.h = 88;
    this.frame   = 0;
    this.state   = 'idle';   // idle | attack | hurt | dead
    this.stateTimer = 0;
    this.hp      = this.char.hp;
    this.maxHp   = this.char.hp;
    this.level   = 1;
    this.flipX   = isLeft ? 1 : -1;
    this.idleOff = 0;
    this.idleDir = 1;
    this.idleSpd = 0.4 + Math.random() * 0.3;
  }

  setPos(arenaW, arenaH) {
    this.y      = arenaH * 0.55;
    this.baseY  = this.y;
    this.x      = this.isLeft ? arenaW * 0.22 : arenaW * 0.78;
    this.baseX  = this.x;
  }

  attack() {
    this.state = 'attack';
    this.stateTimer = 28;
    // lunge toward opponent
    this.vx = this.flipX * 6;
  }

  hurt() {
    if (this.state === 'dead') return;
    this.state = 'hurt';
    this.stateTimer = 18;
    this.vx = -this.flipX * 5;
    this.vy = -3;
  }

  die() {
    this.state = 'dead';
    this.vy = -5;
  }

  update() {
    this.frame++;
    if (this.stateTimer > 0) this.stateTimer--;

    // Return to idle
    if (this.stateTimer === 0 && this.state !== 'dead' && this.state !== 'idle') {
      this.state = 'idle';
    }

    // Physics
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.35; // gravity

    // Return to base
    if (this.state === 'idle' || this.state === 'dead') {
      this.vx *= 0.8;
    } else {
      this.vx *= 0.88;
    }

    // Clamp Y to ground
    if (this.y > this.baseY) { this.y = this.baseY; this.vy = 0; }

    // Idle bob
    if (this.state === 'idle') {
      this.idleOff += this.idleDir * this.idleSpd;
      if (Math.abs(this.idleOff) > 4) this.idleDir *= -1;
      // Drift back to base X
      this.x += (this.baseX - this.x) * 0.06;
    }
  }

  draw(ctx, hitFlash) {
    const flash = hitFlash > 0;
    ctx.save();
    ctx.translate(this.x, this.y + this.idleOff);
    ctx.scale(this.flipX, 1);

    const w = this.w, h = this.h;

    // Shadow
    ctx.save();
    ctx.scale(1, 0.25);
    ctx.beginPath();
    ctx.ellipse(0, h * 0.5 + 8, w * 0.42, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.restore();

    // Flash overlay
    if (flash) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6;
    }

    // Body (round cute blob)
    const c = this.char;
    const bobY = this.state === 'idle' ? 0 : 0;
    const attackLean = this.state === 'attack' ? 0.18 : 0;

    ctx.save();
    ctx.rotate(attackLean * this.flipX);

    // Body blob
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.28, w * 0.46, h * 0.52, 0, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#ffffff' : c.bodyColor;
    ctx.shadowColor = c.bodyColor;
    ctx.shadowBlur  = 18;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Belly highlight
    if (!flash) {
      ctx.beginPath();
      ctx.ellipse(-w * 0.06, -h * 0.22, w * 0.22, h * 0.28, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = c.accentColor + 'aa';
      ctx.fill();
    }

    // Eyes
    const eyeY = -h * 0.36;
    const eyeX = w * 0.14;
    if (this.state !== 'dead') {
      const squint = (this.state === 'attack') ? 3 : 0;
      // left eye
      ctx.beginPath();
      ctx.ellipse(-eyeX, eyeY - squint, 7, 7 - squint, 0, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#fff' : '#222';
      ctx.fill();
      // right eye
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY - squint, 7, 7 - squint, 0, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#fff' : '#222';
      ctx.fill();
      // eye shine
      if (!flash) {
        ctx.beginPath(); ctx.arc(-eyeX + 2, eyeY - 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(eyeX + 2, eyeY - 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
      // Mouth
      ctx.beginPath();
      if (this.state === 'attack') {
        ctx.arc(0, eyeY + 20, 10, 0, Math.PI);
        ctx.fillStyle = '#cc2244';
        ctx.fill();
      } else if (this.state === 'hurt') {
        ctx.arc(0, eyeY + 22, 8, Math.PI, Math.PI * 2);
        ctx.strokeStyle = '#553';
        ctx.lineWidth = 2.5; ctx.stroke();
      } else {
        ctx.arc(0, eyeY + 20, 7, 0, Math.PI);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2.5; ctx.stroke();
      }
    } else {
      // X eyes
      const ex = [-eyeX, eyeX];
      ex.forEach(ex => {
        ctx.save(); ctx.translate(ex, eyeY);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-5,-5); ctx.lineTo(5,5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5,-5); ctx.lineTo(-5,5); ctx.stroke();
        ctx.restore();
      });
    }

    // Fruit icon on head
    ctx.font = `${Math.round(w * 0.38)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.emoji, 0, -h * 0.62);

    ctx.restore(); // attackLean

    // Level badge
    ctx.fillStyle = '#c77dff';
    ctx.beginPath();
    ctx.roundRect(w * 0.28, -h * 0.62, 28, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Nunito,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`Lv${this.level}`, w * 0.28 + 14, -h * 0.62 + 8);

    ctx.restore(); // main transform
  }
}

// ─── Particle ─────────────────────────────────────────
class Particle {
  constructor(x, y, color, type='star') {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 9;
    this.vy = -(Math.random() * 7 + 2);
    this.life = 1; this.decay = 0.03 + Math.random() * 0.03;
    this.r = 4 + Math.random() * 7;
    this.color = color; this.type = type;
    this.rot = Math.random() * Math.PI * 2;
    this.rotV = (Math.random() - 0.5) * 0.3;
    this.text = type === 'dmg' ? '' : ['✨','⭐','💥','🌟'][Math.floor(Math.random()*4)];
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += 0.28; this.vx *= 0.95;
    this.life -= this.decay; this.rot += this.rotV;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (this.type === 'dmg') {
      // drawn separately
    } else if (this.type === 'spark') {
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color; ctx.shadowBlur = 10;
      ctx.fill();
    } else {
      ctx.font = `${this.r * 2.5}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.text, 0, 0);
    }
    ctx.restore();
  }
}

class DmgNumber {
  constructor(x, y, dmg, color) {
    this.x = x; this.y = y;
    this.vy = -3 - Math.random() * 2;
    this.life = 1; this.decay = 0.022;
    this.dmg = dmg; this.color = color;
    this.scale = 1;
  }
  update() { this.y += this.vy; this.vy += 0.12; this.life -= this.decay; this.scale = Math.min(1.4, this.scale + 0.06); }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.font = `bold 28px "Baloo 2",cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    ctx.strokeText(`-${this.dmg}`, 0, 0);
    ctx.fillStyle = this.color;
    ctx.fillText(`-${this.dmg}`, 0, 0);
    ctx.restore();
  }
}

// ─── Init Canvas ──────────────────────────────────────
function initCanvas() {
  G.canvas = $('gameCanvas');
  G.ctx    = G.canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  if (!G.animId) loop();
}
function stopCanvas() {
  if (G.animId) { cancelAnimationFrame(G.animId); G.animId = null; }
  window.removeEventListener('resize', resizeCanvas);
}
function resizeCanvas() {
  const wrap = document.querySelector('.arena-wrap');
  if (!wrap || !G.canvas) return;
  G.arenaW = wrap.clientWidth;
  G.arenaH = wrap.clientHeight;
  G.canvas.width  = G.arenaW;
  G.canvas.height = G.arenaH;
  // Reposition fighters
  Object.values(G.fighters).forEach(f => f.setPos(G.arenaW, G.arenaH));
}

// Background layers
const BG_CLOUDS = Array.from({length:6}, () => ({
  x: Math.random() * 900, y: 20 + Math.random() * 60,
  r: 30 + Math.random() * 40, spd: 0.15 + Math.random() * 0.2, alpha: 0.15 + Math.random() * 0.15
}));

function drawBackground(ctx, W, H) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a103a');
  sky.addColorStop(0.6, '#2d1b69');
  sky.addColorStop(1, '#0d0a1a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i++) {
    const sx = ((i * 137.5 + 30) % W);
    const sy = ((i * 79.3 + 10) % (H * 0.65));
    const br = Math.sin(Date.now() * 0.001 + i) * 0.5 + 0.5;
    ctx.globalAlpha = 0.3 + br * 0.5;
    ctx.beginPath(); ctx.arc(sx, sy, 1 + br, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Clouds
  BG_CLOUDS.forEach(c => {
    c.x += c.spd; if (c.x > W + 80) c.x = -80;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x + c.r * 0.5, c.y + 4, c.r * 0.65, c.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x - c.r * 0.4, c.y + 5, c.r * 0.55, c.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  // Ground
  const grd = ctx.createLinearGradient(0, H * 0.7, 0, H);
  grd.addColorStop(0, '#3a2060');
  grd.addColorStop(1, '#1e1040');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72);
  for (let x = 0; x <= W; x += 40) {
    ctx.lineTo(x, H * 0.72 + Math.sin(x * 0.04 + Date.now() * 0.0008) * 6);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

  // Ground glow
  const gg = ctx.createRadialGradient(W/2, H * 0.72, 0, W/2, H * 0.72, W * 0.6);
  gg.addColorStop(0, 'rgba(180,100,255,0.15)');
  gg.addColorStop(1, 'transparent');
  ctx.fillStyle = gg; ctx.fillRect(0, H * 0.65, W, H * 0.35);
}

// ─── Main loop ────────────────────────────────────────
function loop() {
  G.animId = requestAnimationFrame(loop);
  const ctx = G.ctx, W = G.arenaW, H = G.arenaH;
  if (!ctx || !W) return;

  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H);

  // Update & draw fighters
  Object.values(G.fighters).forEach(f => {
    f.update();
    const hf = (G.hitFlash[f.id] || 0);
    if (hf > 0) G.hitFlash[f.id] = hf - 1;
    f.draw(ctx, hf);
  });

  // Particles
  G.particles = G.particles.filter(p => p.life > 0);
  G.particles.forEach(p => { p.update(); p.draw(ctx); });

  // Cooldown ring on button (handled in CSS/JS)
  updateCdRing();
}

// ─── Spawn hit particles ──────────────────────────────
function spawnHit(fighter, dmg) {
  const x = fighter.x, y = fighter.y - fighter.h * 0.3;
  const col = fighter.char.bodyColor;
  // sparks
  for (let i = 0; i < 12; i++) G.particles.push(new Particle(x, y, col, 'spark'));
  // emoji particles
  for (let i = 0; i < 5; i++) G.particles.push(new Particle(x, y, col, 'emoji'));
  // damage number
  G.particles.push(new DmgNumber(x, y - 20, dmg, '#ff4757'));
}

function spawnSkillEffect(fighter) {
  const x = fighter.x, y = fighter.y - fighter.h * 0.3;
  for (let i = 0; i < 18; i++) {
    const p = new Particle(x, y, fighter.char.bodyColor, 'spark');
    p.vx *= 1.5; p.vy *= 1.5; p.r *= 1.4;
    G.particles.push(p);
  }
}

// ─── Arena message ────────────────────────────────────
function showArenaMsg(text, color='#FFD166', ms=1600) {
  const el = $('arenaMsg');
  el.textContent = text;
  el.style.color = color;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, ms);
}

// ─── Cooldown ring ────────────────────────────────────
let cdInterval = null;
function startCdRing(ms) {
  const btn = $('btnSkill');
  btn.disabled = true;
  G.skillCdUntil = Date.now() + ms;
  G.skillCdMs    = ms;
  $('cdText').textContent = (ms / 1000).toFixed(1) + 's';
  clearInterval(cdInterval);
  cdInterval = setInterval(() => {
    const rem = G.skillCdUntil - Date.now();
    if (rem <= 0) {
      clearInterval(cdInterval);
      btn.disabled = false;
      $('cdText').textContent = '';
      $('skillCdRing').style.background = 'none';
      return;
    }
    const pct = 1 - rem / G.skillCdMs;
    $('cdText').textContent = (rem / 1000).toFixed(1) + 's';
    const deg = Math.round(pct * 360);
    $('skillCdRing').style.background =
      `conic-gradient(rgba(255,255,255,0.35) ${deg}deg, transparent ${deg}deg)`;
  }, 50);
}
function updateCdRing() { /* handled by interval above */ }

// ─── HUD updates ──────────────────────────────────────
function updateHUD(state) {
  if (!state) return;
  const ms = state[G.myId],  os = state[G.oppId];
  if (ms) {
    const pct = ms.hp / ms.maxHp * 100;
    $('hudLeftHp').style.width = pct + '%';
    $('hudLeftHp').classList.toggle('low', pct < 35);
    $('hudLeftHpText').textContent = `${Math.max(0,ms.hp)}/${ms.maxHp}`;
    $('hudLeftLevel').textContent  = `Lv.${ms.level}`;
    if (G.fighters[G.myId]) G.fighters[G.myId].hp = ms.hp, G.fighters[G.myId].level = ms.level;
  }
  if (os) {
    const pct = os.hp / os.maxHp * 100;
    $('hudRightHp').style.width = pct + '%';
    $('hudRightHp').classList.toggle('low', pct < 35);
    $('hudRightHpText').textContent = `${Math.max(0,os.hp)}/${os.maxHp}`;
    $('hudRightLevel').textContent  = `Lv.${os.level}`;
    if (G.fighters[G.oppId]) G.fighters[G.oppId].hp = os.hp, G.fighters[G.oppId].level = os.level;
  }
}

function updateWinDots() {
  ['myW1','myW2','myW3'].forEach((id,i) => $(id).classList.toggle('filled', i < G.myWins));
  ['opW1','opW2','opW3'].forEach((id,i) => $(id).classList.toggle('filled', i < G.oppWins));
}

// ─── Battle Log ───────────────────────────────────────
function addLog(msg, cls='') {
  const el = document.createElement('div');
  el.className = 'log-entry ' + cls;
  el.textContent = msg;
  const log = $('battleLog');
  log.appendChild(el);
  while (log.children.length > 30) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

// ═══════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════
$('btnLogin').addEventListener('click', () => {
  const username = $('inputUsername').value.trim();
  const google   = $('inputGoogle').value.trim();
  if (!username)                      { toast('請輸入玩家名稱！','error'); return; }
  if (!google || !google.includes('@')){ toast('請輸入有效 Google 帳號！','error'); return; }
  G.username = username;
  socket.emit('register', { username, googleAccount: google });
});
socket.on('registered', ({ playerId, coins, dailyStreak }) => {
  G.playerId = playerId; G.myId = playerId;
  G.coins = coins; G.dailyStreak = dailyStreak;
  $('lobbyPlayerName').textContent = G.username;
  $('coinsDisplay').textContent = coins;
  showScreen('lobby');
  toast(`歡迎，${G.username}！🎉`, 'success');
});

// ═══════════════════════════════════════════════════════
//  LOBBY
// ═══════════════════════════════════════════════════════
$('btnSolo').addEventListener('click',  () => openCharSelect('solo'));
$('btnMulti').addEventListener('click', () => openCharSelect('multi'));
$('btnShop').addEventListener('click',  () => openModal('modalShop'));
$('btnDaily').addEventListener('click', () => openDailyModal());
$('btnShopClose').addEventListener('click', () => closeModal('modalShop'));
$('btnDailyClose').addEventListener('click', () => closeModal('modalDaily'));

// ─── Char Select ──────────────────────────────────────
function openCharSelect(mode) {
  G.pendingMode = mode;
  const grid = $('charGrid'); grid.innerHTML = '';
  Object.entries(CHARS).forEach(([id, c]) => {
    const card = document.createElement('div');
    card.className = 'char-card'; card.dataset.char = id;
    card.innerHTML = `<div class="char-emoji">${c.emoji}</div>
      <div class="char-name">${c.name}</div>
      <div class="char-stats">HP:${c.hp} ATK:${c.atk}</div>
      <div class="char-skill">✨ ${c.skillName}</div>`;
    card.addEventListener('click', () => {
      document.querySelectorAll('.char-card').forEach(x => x.classList.remove('selected'));
      card.classList.add('selected'); G.character = id;
    });
    grid.appendChild(card);
  });
  G.character = 'mango';
  grid.querySelector('.char-card').classList.add('selected');
  openModal('modalCharSelect');
}
$('btnCharCancel').addEventListener('click',  () => closeModal('modalCharSelect'));
$('btnCharConfirm').addEventListener('click', () => {
  if (!G.character) { toast('請選擇角色！','error'); return; }
  closeModal('modalCharSelect');
  G.pendingMode === 'solo' ? startSolo() : startMulti();
});

// ─── Daily ────────────────────────────────────────────
const DAILY_REWARDS = [30,40,50,60,70,80,100];
function openDailyModal() {
  const grid = $('dailyGrid'); grid.innerHTML = '';
  DAILY_REWARDS.forEach((r,i) => {
    const d = i + 1, div = document.createElement('div');
    div.className = 'daily-day' + (d === G.dailyStreak ? ' current' : '') + (d < G.dailyStreak ? ' claimed' : '');
    div.innerHTML = `<div class="day-num">第${d}天</div><div class="day-icon">${d < G.dailyStreak ? '✅' : '🪙'}</div><div class="day-reward">${r}</div>`;
    grid.appendChild(div);
  });
  $('dailyMsg').textContent = '';
  openModal('modalDaily');
}
$('btnClaimDaily').addEventListener('click', () => socket.emit('claimDaily'));
socket.on('dailyResult', ({ success, reward, coins, msg, nextStreak }) => {
  if (!success) { $('dailyMsg').textContent = msg; $('dailyMsg').style.color='var(--red)'; return; }
  G.coins = coins; G.dailyStreak = nextStreak;
  $('coinsDisplay').textContent = coins;
  $('dailyMsg').textContent = `✅ 成功領取 ${reward} 華幣！`;
  $('dailyMsg').style.color = 'var(--green)';
  toast(`🪙 獲得 ${reward} 華幣！`, 'success');
  openDailyModal();
});

// ═══════════════════════════════════════════════════════
//  QUEUE
// ═══════════════════════════════════════════════════════
function startQueueScreen(title, status) {
  $('queueTitle').textContent = title;
  $('queueStatus').textContent = status;
  $('queueTimer').textContent = '0';
  G.queueSecs = 0;
  clearInterval(G.queueTimer);
  G.queueTimer = setInterval(() => { G.queueSecs++; $('queueTimer').textContent = G.queueSecs; }, 1000);
  showScreen('queue');
}
$('btnLeaveQueue').addEventListener('click', () => {
  clearInterval(G.queueTimer);
  socket.emit('leaveQueue');
  showScreen('lobby');
  toast('已離開配對佇列','info');
});

function startSolo() {
  G.mode = 'solo';
  startQueueScreen('單機配對大廳', '5 秒後進入遊戲...');
  let c = 5;
  const cd = setInterval(() => {
    c--;
    $('queueStatus').textContent = c > 0 ? `${c} 秒後進入遊戲...` : '載入中...';
    if (c <= 0) { clearInterval(cd); socket.emit('joinSoloQueue', { character: G.character }); }
  }, 1000);
}
function startMulti() {
  G.mode = 'multi';
  startQueueScreen('多人配對大廳', '尋找對手中...');
  socket.emit('joinMultiQueue', { character: G.character });
}
socket.on('queueJoined', ({ position }) => { $('queueStatus').textContent = `佇列中... 第 ${position} 位`; });

// ═══════════════════════════════════════════════════════
//  MATCH FOUND → setup game
// ═══════════════════════════════════════════════════════
socket.on('matchFound', ({ roomId, players, yourId, state }) => {
  clearInterval(G.queueTimer);
  G.roomId = roomId;
  if (yourId) G.myId = yourId;
  players.forEach(p => { G.players[p.id] = p; });

  const me  = G.players[G.myId];
  const opp = players.find(p => p.id !== G.myId);
  if (!opp) return;
  G.oppId = opp.id;
  G.myWins = 0; G.oppWins = 0;
  updateWinDots();

  const meC  = CHARS[me.character]  || CHARS.mango;
  const opC  = CHARS[opp.character] || CHARS.mango;

  // HUD
  $('hudLeftAvatar').textContent  = meC.emoji;
  $('hudLeftName').textContent    = me.username;
  $('hudRightAvatar').textContent = opC.emoji;
  $('hudRightName').textContent   = opp.username;
  $('roundNum').textContent       = '1';
  $('gameModeLabel' in window ? 'gameModeLabel' : 'roundNum');
  $('skillLabel').textContent     = meC.skillName;

  updateHUD(state);
  showScreen('game');

  // Create fighters (wait one frame so canvas is sized)
  setTimeout(() => {
    G.fighters = {};
    G.particles = [];
    G.hitFlash  = {};
    const fMe  = new Fighter(G.myId,  true,  me.character,  me.username);
    const fOpp = new Fighter(G.oppId, false, opp.character, opp.username);
    fMe.setPos(G.arenaW, G.arenaH);
    fOpp.setPos(G.arenaW, G.arenaH);
    if (state?.[G.myId])  { fMe.hp = state[G.myId].hp;  fMe.maxHp = state[G.myId].maxHp; }
    if (state?.[G.oppId]) { fOpp.hp = state[G.oppId].hp; fOpp.maxHp = state[G.oppId].maxHp; }
    G.fighters[G.myId]  = fMe;
    G.fighters[G.oppId] = fOpp;

    // Reset skill button
    $('btnSkill').disabled = false;
    $('cdText').textContent = '';
    clearInterval(cdInterval);
  }, 80);

  addLog('⚔️ 戰鬥開始！', 'log-system');
  addLog(`${meC.emoji} ${me.username} vs ${opC.emoji} ${opp.username}`, 'log-system');
  showArenaMsg('FIGHT! 💥', '#FFD166', 2000);
});

socket.on('yourId', ({ yourId }) => { G.myId = yourId; });

// ═══════════════════════════════════════════════════════
//  SKILL BUTTON (real-time, cooldown only)
// ═══════════════════════════════════════════════════════
$('btnSkill').addEventListener('click', () => {
  if (!G.roomId) return;
  socket.emit('useSkill', { roomId: G.roomId });
});

socket.on('skillCooldown', ({ remaining }) => {
  // still on CD — sync client
  if (remaining > 0) startCdRing(remaining);
});

// ═══════════════════════════════════════════════════════
//  BATTLE UPDATE
// ═══════════════════════════════════════════════════════
socket.on('battleUpdate', ({ attackerId, defenderId, damage, skillName, state, cdFor, cdMs, levelUp }) => {
  if (attackerId && defenderId) {
    const af = G.fighters[attackerId], df = G.fighters[defenderId];
    if (af) { af.attack(); spawnSkillEffect(af); }
    if (df && damage > 0) { df.hurt(); spawnHit(df, damage); G.hitFlash[defenderId] = 8; }

    const aName = G.players[attackerId]?.username || 'CPU';
    addLog(`💥 ${aName} 使用 ${skillName} 造成 ${damage} 傷害！`, 'log-dmg');

    // Start cooldown for self
    if (cdFor === G.myId && cdMs) startCdRing(cdMs);
  }

  if (levelUp) {
    const who = levelUp.playerId === G.myId ? '你' : (G.players[levelUp.playerId]?.username || '對手');
    addLog(`⬆️ ${who} 技能升至 Lv.${levelUp.level}！`, 'log-system');
    showArenaMsg(`✨ Lv.${levelUp.level}！`, '#c77dff', 1500);
  }

  updateHUD(state);
});

// ═══════════════════════════════════════════════════════
//  ROUND / MATCH END
// ═══════════════════════════════════════════════════════
socket.on('roundEnd', ({ winnerId, wins }) => {
  G.myWins  = wins[G.myId]  || 0;
  G.oppWins = wins[G.oppId] || 0;
  updateWinDots();

  const iWon = winnerId === G.myId;
  const wName = G.players[winnerId]?.username || '???';

  // Kill loser fighter
  const loserId = winnerId === G.myId ? G.oppId : G.myId;
  if (G.fighters[loserId]) G.fighters[loserId].die();

  showArenaMsg(iWon ? '🏆 本回合勝利！' : '💀 本回合落敗...', iWon ? '#2ed573' : '#ff4757', 2500);
  addLog(iWon ? '🏆 本回合勝利！' : '💀 本回合落敗...', 'log-system');
  toast(iWon ? '🎉 本回合勝利！' : '💔 本回合落敗', iWon ? 'success' : 'error');
  $('btnSkill').disabled = true;
  clearInterval(cdInterval);
  $('cdText').textContent = '';
});

socket.on('newRound', ({ round, state }) => {
  $('roundNum').textContent = round;
  addLog(`─── 第 ${round} 回合 ───`, 'log-system');
  showArenaMsg(`第 ${round} 回合！`, '#74b9ff', 1800);
  updateHUD(state);

  // Revive fighters
  Object.values(G.fighters).forEach(f => {
    f.state = 'idle'; f.stateTimer = 0; f.vy = 0;
    f.x = f.baseX; f.y = f.baseY;
    const s = state[f.id];
    if (s) { f.hp = s.hp; f.maxHp = s.maxHp; f.level = s.level; }
  });

  $('btnSkill').disabled = false;
  $('cdText').textContent = '';
  clearInterval(cdInterval);
});

socket.on('levelUpPrompt', () => {
  G.pendingLevelUp = true; openModal('modalLevelUp');
});
$('btnDoLevelUp').addEventListener('click', () => {
  if (!G.pendingLevelUp) return;
  G.pendingLevelUp = false;
  closeModal('modalLevelUp');
  socket.emit('levelUpSkill', { roomId: G.roomId });
  toast('🚀 技能升級！傷害增強！', 'success');
});
socket.on('skillLeveled', ({ level, atk, cd }) => {
  G.skillCdMs = cd;
  addLog(`⬆️ 技能升至 Lv.${level}！ATK:${atk}`, 'log-system');
});

socket.on('matchEnd', ({ winnerId }) => {
  const iWon = winnerId === G.myId;
  const opp  = G.players[G.oppId];
  $('resultEmoji').textContent = iWon ? '🏆' : '💔';
  $('resultTitle').textContent = iWon ? '勝利！' : '敗北...';
  $('resultTitle').className   = 'result-title ' + (iWon ? 'win' : 'lose');
  $('resultDesc').textContent  = iWon
    ? `恭喜你擊敗了 ${opp?.username}！`
    : `被 ${opp?.username} 擊敗，再接再厲！`;
  const ce = $('resultCoins');
  if (iWon) { ce.style.display = 'block'; ce.textContent = '🪙 獲得 50 華幣！'; }
  else ce.style.display = 'none';
  setTimeout(() => openModal('modalResult'), 1200);
});

socket.on('coinsUpdate', ({ coins }) => {
  G.coins = coins; $('coinsDisplay').textContent = coins;
});

socket.on('opponentLeft', () => {
  toast('對手離線，你自動獲勝！🏆', 'success');
  $('resultEmoji').textContent = '🏆';
  $('resultTitle').textContent = '對手離線！';
  $('resultTitle').className   = 'result-title win';
  $('resultDesc').textContent  = '對手斷線，你自動獲勝。';
  $('resultCoins').style.display = 'none';
  setTimeout(() => openModal('modalResult'), 800);
});

$('btnBackLobby').addEventListener('click', () => {
  closeModal('modalResult');
  G.roomId = null; G.oppId = null; G.myWins = 0; G.oppWins = 0;
  G.fighters = {}; G.particles = {};
  $('battleLog').innerHTML = '';
  showScreen('lobby');
});
