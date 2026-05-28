// ═══════════════════════════════════════════════════════════════
//  水果大戰爭 — game.js
// ═══════════════════════════════════════════════════════════════

const socket = io();

// ─── State ────────────────────────────────────────────────────
const G = {
  playerId:    null,
  username:    '',
  coins:       0,
  dailyStreak: 1,
  lastClaimed: null,
  character:   null,
  roomId:      null,
  mode:        null,       // 'solo' | 'pvp'
  myId:        null,
  oppId:       null,
  players:     {},         // id -> {username, character, stats}
  queueTimer:  null,
  queueSecs:   0,
  pendingMode: null,       // mode waiting for char select
  myWins:      0,
  oppWins:     0,
  pendingLevelUp: false,
};

// ─── Character Data ───────────────────────────────────────────
const CHARS = {
  mango: { name:'芒妹',   emoji:'🥭', hp:100, atk:18, speed:12, color:'#FF8C00', skillName:'芒果颶風', desc:'爆發力超強的攻擊型角色' },
  peach: { name:'桃妹',   emoji:'🍑', hp:120, atk:14, speed:10, color:'#FF69B4', skillName:'桃花亂舞', desc:'高血量的持久戰型角色' },
  tea:   { name:'茶妹',   emoji:'🍵', hp:90,  atk:20, speed:15, color:'#3CB371', skillName:'抹茶爆擊', desc:'速度最快的刺客型角色' },
  mimi:  { name:'米米',   emoji:'🍚', hp:130, atk:12, speed:8,  color:'#F5DEB3', skillName:'米粒風暴', desc:'最高血量的坦克型角色' },
  lemon: { name:'檸檬酸', emoji:'🍋', hp:85,  atk:22, speed:18, color:'#FFD700', skillName:'酸液噴射', desc:'攻擊最高的爆發型角色' },
};

// ─── DOM Refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  login: $('screen-login'),
  lobby: $('screen-lobby'),
  queue: $('screen-queue'),
  game:  $('screen-game'),
};

// ═══════════════════════════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════════
function toast(msg, type = 'info', duration = 2800) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ═══════════════════════════════════════════════════════════════
//  MODAL HELPERS
// ═══════════════════════════════════════════════════════════════
function openModal(id)  { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); }

// ═══════════════════════════════════════════════════════════════
//  FLOAT DAMAGE
// ═══════════════════════════════════════════════════════════════
function floatDamage(el, dmg) {
  const rect = el.getBoundingClientRect();
  const div = document.createElement('div');
  div.className = 'float-dmg';
  div.textContent = `-${dmg}`;
  div.style.left = (rect.left + rect.width / 2 - 20) + 'px';
  div.style.top  = (rect.top + 10) + 'px';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1300);
}

// ═══════════════════════════════════════════════════════════════
//  COINS DISPLAY
// ═══════════════════════════════════════════════════════════════
function updateCoinsDisplay(val) {
  G.coins = val;
  $('coinsDisplay').textContent = val;
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════
$('btnLogin').addEventListener('click', () => {
  const username = $('inputUsername').value.trim();
  const google   = $('inputGoogle').value.trim();
  if (!username) { toast('請輸入玩家名稱！', 'error'); return; }
  if (!google || !google.includes('@')) { toast('請輸入有效的 Google 帳號！', 'error'); return; }
  G.username = username;
  socket.emit('register', { username, googleAccount: google });
});

socket.on('registered', ({ playerId, coins, dailyStreak }) => {
  G.playerId    = playerId;
  G.myId        = playerId;
  G.coins       = coins;
  G.dailyStreak = dailyStreak;
  $('lobbyPlayerName').textContent = G.username;
  updateCoinsDisplay(coins);
  showScreen('lobby');
  toast(`歡迎回來，${G.username}！🎉`, 'success');
});

// ═══════════════════════════════════════════════════════════════
//  CHARACTER SELECT MODAL
// ═══════════════════════════════════════════════════════════════
function buildCharGrid() {
  const grid = $('charGrid');
  grid.innerHTML = '';
  Object.entries(CHARS).forEach(([id, c]) => {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.dataset.char = id;
    card.innerHTML = `
      <div class="char-emoji">${c.emoji}</div>
      <div class="char-name">${c.name}</div>
      <div class="char-stats">HP:${c.hp} ATK:${c.atk}</div>
      <div class="char-skill">✨ ${c.skillName}</div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.char-card').forEach(x => x.classList.remove('selected'));
      card.classList.add('selected');
      G.character = id;
    });
    grid.appendChild(card);
  });
  // default select first
  G.character = 'mango';
  grid.querySelector('.char-card').classList.add('selected');
}

function openCharSelect(mode) {
  G.pendingMode = mode;
  buildCharGrid();
  openModal('modalCharSelect');
}

$('btnCharCancel').addEventListener('click', () => closeModal('modalCharSelect'));

$('btnCharConfirm').addEventListener('click', () => {
  if (!G.character) { toast('請選擇一個角色！', 'error'); return; }
  closeModal('modalCharSelect');
  if (G.pendingMode === 'solo')  startSolo();
  if (G.pendingMode === 'multi') startMulti();
});

// ═══════════════════════════════════════════════════════════════
//  LOBBY BUTTONS
// ═══════════════════════════════════════════════════════════════
$('btnSolo').addEventListener('click',  () => openCharSelect('solo'));
$('btnMulti').addEventListener('click', () => openCharSelect('multi'));
$('btnShop').addEventListener('click',  () => openModal('modalShop'));
$('btnDaily').addEventListener('click', () => openDailyModal());
$('btnShopClose').addEventListener('click', () => closeModal('modalShop'));
$('btnDailyClose').addEventListener('click', () => closeModal('modalDaily'));

// ═══════════════════════════════════════════════════════════════
//  DAILY MODAL
// ═══════════════════════════════════════════════════════════════
const DAILY_REWARDS = [30, 40, 50, 60, 70, 80, 100];

function openDailyModal() {
  const grid = $('dailyGrid');
  grid.innerHTML = '';
  DAILY_REWARDS.forEach((reward, i) => {
    const day = i + 1;
    const div = document.createElement('div');
    div.className = 'daily-day';
    if (day === G.dailyStreak) div.classList.add('current');
    if (day < G.dailyStreak)   div.classList.add('claimed');
    div.innerHTML = `
      <div class="day-num">第${day}天</div>
      <div class="day-icon">${day < G.dailyStreak ? '✅' : '🪙'}</div>
      <div class="day-reward">${reward}</div>
    `;
    grid.appendChild(div);
  });
  $('dailyMsg').textContent = '';
  openModal('modalDaily');
}

$('btnClaimDaily').addEventListener('click', () => {
  socket.emit('claimDaily');
});

socket.on('dailyResult', ({ success, reward, coins, msg, nextStreak }) => {
  if (!success) {
    $('dailyMsg').textContent = msg || '今天已經領取過了！';
    $('dailyMsg').style.color = 'var(--red)';
    return;
  }
  updateCoinsDisplay(coins);
  G.dailyStreak = nextStreak;
  $('dailyMsg').textContent = `✅ 成功領取 ${reward} 華幣！`;
  $('dailyMsg').style.color = 'var(--green)';
  toast(`🪙 獲得 ${reward} 華幣！`, 'success');
  // Refresh grid
  openDailyModal();
});

// ═══════════════════════════════════════════════════════════════
//  QUEUE SCREEN
// ═══════════════════════════════════════════════════════════════
function startQueueScreen(title, statusText) {
  $('queueTitle').textContent   = title;
  $('queueStatus').textContent  = statusText;
  $('queueTimer').textContent   = '0';
  G.queueSecs = 0;
  clearInterval(G.queueTimer);
  G.queueTimer = setInterval(() => {
    G.queueSecs++;
    $('queueTimer').textContent = G.queueSecs;
  }, 1000);
  showScreen('queue');
}

$('btnLeaveQueue').addEventListener('click', () => {
  clearInterval(G.queueTimer);
  socket.emit('leaveQueue');
  showScreen('lobby');
  toast('已離開配對佇列', 'info');
});

// ─── Solo ─────────────────────────────────────────────────────
function startSolo() {
  G.mode = 'solo';
  startQueueScreen('單機配對大廳', '正在準備電腦對手...');
  // Wait 5s then emit
  let countdown = 5;
  $('queueStatus').textContent = `${countdown} 秒後進入遊戲...`;
  const cd = setInterval(() => {
    countdown--;
    $('queueStatus').textContent = countdown > 0
      ? `${countdown} 秒後進入遊戲...`
      : '配對成功！載入中...';
    if (countdown <= 0) {
      clearInterval(cd);
      socket.emit('joinSoloQueue', { character: G.character });
    }
  }, 1000);
}

// ─── Multi ────────────────────────────────────────────────────
function startMulti() {
  G.mode = 'multi';
  startQueueScreen('多人配對大廳', '尋找對手中...');
  socket.emit('joinMultiQueue', { character: G.character });
}

socket.on('queueJoined', ({ position }) => {
  $('queueStatus').textContent = `佇列中... 你是第 ${position} 位`;
});

// ═══════════════════════════════════════════════════════════════
//  MATCH FOUND → GAME SCREEN
// ═══════════════════════════════════════════════════════════════
socket.on('matchFound', ({ roomId, players, yourId, turn }) => {
  clearInterval(G.queueTimer);
  G.roomId = roomId;

  if (yourId) G.myId = yourId;

  players.forEach(p => { G.players[p.id] = p; });

  const me  = G.players[G.myId];
  const opp = players.find(p => p.id !== G.myId);
  if (!opp) return;
  G.oppId = opp.id;

  G.myWins  = 0;
  G.oppWins = 0;
  resetWinDots();

  // Populate fighter cards
  const meChar  = CHARS[me.character]  || CHARS.mango;
  const oppChar = CHARS[opp.character] || CHARS.mango;

  $('myAvatar').textContent    = meChar.emoji;
  $('myName').textContent      = me.username;
  $('myCharName').textContent  = meChar.skillName;
  $('myLevel').textContent     = 'Lv.1';
  $('oppAvatar').textContent   = oppChar.emoji;
  $('oppName').textContent     = opp.username;
  $('oppCharName').textContent = oppChar.skillName;
  $('oppLevel').textContent    = 'Lv.1';

  setHpBar('my',  meChar.hp,  meChar.hp);
  setHpBar('opp', oppChar.hp, oppChar.hp);

  $('gameModeLabel').textContent = G.mode === 'solo' ? '🤖 單機' : '🌐 多人';
  $('roundNum').textContent = '1';

  clearLog();
  addLog('⚔️ 戰鬥開始！', 'log-system');
  addLog(`${meChar.emoji} ${me.username} VS ${oppChar.emoji} ${opp.username}`, 'log-system');

  updateTurn(turn);
  showScreen('game');
});

socket.on('yourId', ({ yourId }) => {
  G.myId = yourId;
});

// ═══════════════════════════════════════════════════════════════
//  BATTLE UI HELPERS
// ═══════════════════════════════════════════════════════════════
function setHpBar(who, hp, maxHp) {
  const pct = Math.max(0, (hp / maxHp) * 100);
  const bar  = $(`${who}HpBar`);
  const txt  = $(`${who}HpText`);
  bar.style.width = pct + '%';
  txt.textContent = `${Math.max(0, hp)}/${maxHp}`;
  bar.classList.toggle('low', pct < 35);
}

function updateTurn(turnId) {
  const isMyTurn = turnId === G.myId;
  $('btnSkill').disabled = !isMyTurn;
  const ind = $('turnIndicator');
  ind.textContent = isMyTurn ? '⚡ 輪到你出手！' : '⏳ 等待對手...';
  ind.className   = 'turn-indicator' + (isMyTurn ? ' your-turn' : '');
  $('myCard').classList.toggle('active', isMyTurn);
  $('oppCard').classList.toggle('active', !isMyTurn);
}

function clearLog() { $('battleLog').innerHTML = ''; }
function addLog(msg, cls = '') {
  const el = document.createElement('div');
  el.className = 'log-entry ' + cls;
  el.textContent = msg;
  const log = $('battleLog');
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function resetWinDots() {
  ['myWin1','myWin2','myWin3','oppWin1','oppWin2','oppWin3'].forEach(id => {
    $(id).classList.remove('filled');
  });
}

function updateWinDots() {
  ['myWin1','myWin2','myWin3'].forEach((id, i) => {
    $(id).classList.toggle('filled', i < G.myWins);
  });
  ['oppWin1','oppWin2','oppWin3'].forEach((id, i) => {
    $(id).classList.toggle('filled', i < G.oppWins);
  });
}

// ═══════════════════════════════════════════════════════════════
//  SKILL BUTTON
// ═══════════════════════════════════════════════════════════════
$('btnSkill').addEventListener('click', () => {
  if (!G.roomId) return;
  const me = G.players[G.myId];
  const charData = CHARS[me?.character] || CHARS.mango;
  $('btnSkill').textContent = `⚡ ${charData.skillName}！`;
  $('btnSkill').disabled = true;
  socket.emit('useSkill', { roomId: G.roomId });
});

// ═══════════════════════════════════════════════════════════════
//  BATTLE UPDATE
// ═══════════════════════════════════════════════════════════════
socket.on('battleUpdate', ({ action, state, turn }) => {
  if (!state) return;

  // Update HP
  const myState  = state[G.myId];
  const oppState = state[G.oppId];
  if (!myState || !oppState) return;

  const meChar  = CHARS[G.players[G.myId]?.character]  || CHARS.mango;
  const oppChar = CHARS[G.players[G.oppId]?.character] || CHARS.mango;

  setHpBar('my',  myState.hp,  myState.maxHp);
  setHpBar('opp', oppState.hp, oppState.maxHp);

  $('myLevel').textContent  = `Lv.${myState.level}`;
  $('oppLevel').textContent = `Lv.${oppState.level}`;

  // Log
  if (action) {
    if (action.type === 'skill') {
      const attackerName = action.attackerId === G.myId
        ? G.players[G.myId]?.username
        : G.players[G.oppId]?.username;
      addLog(`💥 ${attackerName} 使用了 ${action.skillName}，造成 ${action.damage} 點傷害！`, 'log-dmg');

      // Float damage on defender
      const isMyAttack = action.attackerId === G.myId;
      floatDamage(isMyAttack ? $('oppCard') : $('myCard'), action.damage);

      // Shake
      if (isMyAttack) $('oppCard').classList.add('shake');
      else             $('myCard').classList.add('shake');
      setTimeout(() => {
        $('oppCard').classList.remove('shake');
        $('myCard').classList.remove('shake');
      }, 450);
    }
    if (action.type === 'levelUp') {
      const who = action.playerId === G.myId ? '你' : G.players[G.oppId]?.username;
      addLog(`⬆️ ${who} 技能升至 Lv.${action.level}！`, 'log-system');
    }
  }

  // Skill btn label
  const meData = G.players[G.myId];
  const charD  = CHARS[meData?.character] || CHARS.mango;
  $('btnSkill').textContent = `⚡ ${charD.skillName}`;

  updateTurn(turn);
});

// ═══════════════════════════════════════════════════════════════
//  ROUND END / NEW ROUND
// ═══════════════════════════════════════════════════════════════
socket.on('roundEnd', ({ winnerId, wins }) => {
  G.myWins  = wins[G.myId]  || 0;
  G.oppWins = wins[G.oppId] || 0;
  updateWinDots();

  const iWon = winnerId === G.myId;
  addLog(iWon ? '🏆 本回合勝利！' : '💀 本回合落敗...', iWon ? 'log-system' : 'log-dmg');
  $('btnSkill').disabled = true;
  toast(iWon ? '🎉 本回合勝利！' : '💀 本回合落敗', iWon ? 'success' : 'error');
});

socket.on('newRound', ({ round, state, turn }) => {
  $('roundNum').textContent = round;
  addLog(`─── 第 ${round} 回合開始 ───`, 'log-system');

  const myState  = state[G.myId];
  const oppState = state[G.oppId];
  if (myState && oppState) {
    setHpBar('my',  myState.hp,  myState.maxHp);
    setHpBar('opp', oppState.hp, oppState.maxHp);
  }
  updateTurn(turn);
});

// ═══════════════════════════════════════════════════════════════
//  LEVEL UP PROMPT
// ═══════════════════════════════════════════════════════════════
socket.on('levelUpPrompt', ({ level }) => {
  G.pendingLevelUp = true;
  openModal('modalLevelUp');
});

$('btnDoLevelUp').addEventListener('click', () => {
  if (!G.pendingLevelUp) return;
  G.pendingLevelUp = false;
  closeModal('modalLevelUp');
  socket.emit('levelUpSkill', { roomId: G.roomId });
  toast('🚀 技能已升級！傷害增強！', 'success');
});

socket.on('skillLeveled', ({ level, atk }) => {
  $('myLevel').textContent = `Lv.${level}`;
  addLog(`⬆️ 你的技能升至 Lv.${level}！ATK: ${atk}`, 'log-system');
});

// ═══════════════════════════════════════════════════════════════
//  MATCH END
// ═══════════════════════════════════════════════════════════════
socket.on('matchEnd', ({ winnerId, loserId }) => {
  const iWon = winnerId === G.myId;
  $('resultEmoji').textContent  = iWon ? '🏆' : '💔';
  $('resultTitle').textContent  = iWon ? '勝利！'  : '敗北...';
  $('resultTitle').className    = 'result-title ' + (iWon ? 'win' : 'lose');
  $('resultDesc').textContent   = iWon
    ? `恭喜你擊敗了 ${G.players[G.oppId]?.username}！`
    : `你被 ${G.players[G.oppId]?.username} 擊敗了，繼續加油！`;

  const coinsEl = $('resultCoins');
  if (iWon) {
    coinsEl.style.display = 'block';
    coinsEl.textContent = '🪙 獲得 50 華幣！';
  } else {
    coinsEl.style.display = 'none';
  }

  setTimeout(() => openModal('modalResult'), 800);
});

socket.on('coinsUpdate', ({ coins }) => {
  updateCoinsDisplay(coins);
});

socket.on('opponentLeft', () => {
  addLog('⚠️ 對手已離線，你自動獲勝！', 'log-system');
  toast('對手離線，你獲得勝利！🏆', 'success');
  $('resultEmoji').textContent = '🏆';
  $('resultTitle').textContent = '對手離線，獲勝！';
  $('resultTitle').className   = 'result-title win';
  $('resultDesc').textContent  = '對手斷線，你自動獲勝。';
  setTimeout(() => openModal('modalResult'), 1000);
});

socket.on('notYourTurn', () => {
  toast('還沒輪到你！', 'error', 1500);
});

// ─── Back to lobby ────────────────────────────────────────────
$('btnBackLobby').addEventListener('click', () => {
  closeModal('modalResult');
  G.roomId  = null;
  G.oppId   = null;
  G.myWins  = 0;
  G.oppWins = 0;
  G.players = {};
  showScreen('lobby');
});
