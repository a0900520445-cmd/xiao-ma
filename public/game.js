// ═══════════════════════════════════════════════════════════════
//  小麻將 · game.js  —  完整客戶端遊戲邏輯
//  含：好友桌建房/加入、完整出牌/碰/吃/胡/自摸/聽牌指示
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── State ──────────────────────────────────────────────────────
let ws           = null;
let playerId     = genId();
let playerName   = '';
let qiAmount     = 1200;
let roomCode     = null;
let isHost       = false;
let myIdx        = -1;          // my seat index
let myHand       = [];
let gameState    = null;        // latest state_update
let selectedTile = null;
let tenpaiTiles  = [];          // tiles that complete my hand
let canTsumo     = false;
let isHKMode     = false;
let reconnTimer  = null;
let actionPhase  = false;       // true when server waiting for my action response
let selectedMode = null;        // '2p' | '4p'

const quests = [
  { id:1, icon:'🀇', name:'完成3場對局',  prog:0, total:3, reward:150, claimed:false },
  { id:2, icon:'🏅', name:'贏得一場勝利', prog:0, total:1, reward:300, claimed:false },
  { id:3, icon:'📅', name:'每日登入簽到', prog:1, total:1, reward:100, claimed:false },
  { id:4, icon:'👥', name:'使用好友桌',   prog:0, total:1, reward:200, claimed:false },
];

// ── Tile display map ───────────────────────────────────────────
const TD = {
  '1m':{ch:'一',su:'萬',cl:'black'}, '2m':{ch:'二',su:'萬',cl:'black'},
  '3m':{ch:'三',su:'萬',cl:'black'}, '4m':{ch:'四',su:'萬',cl:'black'},
  '5m':{ch:'五',su:'萬',cl:'black'}, '6m':{ch:'六',su:'萬',cl:'black'},
  '7m':{ch:'七',su:'萬',cl:'black'}, '8m':{ch:'八',su:'萬',cl:'black'},
  '9m':{ch:'九',su:'萬',cl:'black'},
  '1p':{ch:'①',su:'筒',cl:'blue'}, '2p':{ch:'②',su:'筒',cl:'blue'},
  '3p':{ch:'③',su:'筒',cl:'blue'}, '4p':{ch:'④',su:'筒',cl:'blue'},
  '5p':{ch:'⑤',su:'筒',cl:'blue'}, '6p':{ch:'⑥',su:'筒',cl:'blue'},
  '7p':{ch:'⑦',su:'筒',cl:'blue'}, '8p':{ch:'⑧',su:'筒',cl:'blue'},
  '9p':{ch:'⑨',su:'筒',cl:'blue'},
  '1s':{ch:'1',su:'索',cl:'green'}, '2s':{ch:'2',su:'索',cl:'green'},
  '3s':{ch:'3',su:'索',cl:'green'}, '4s':{ch:'4',su:'索',cl:'green'},
  '5s':{ch:'5',su:'索',cl:'green'}, '6s':{ch:'6',su:'索',cl:'green'},
  '7s':{ch:'7',su:'索',cl:'green'}, '8s':{ch:'8',su:'索',cl:'green'},
  '9s':{ch:'9',su:'索',cl:'green'},
  '東':{ch:'東',su:'',cl:'red'}, '南':{ch:'南',su:'',cl:'red'},
  '西':{ch:'西',su:'',cl:'red'}, '北':{ch:'北',su:'',cl:'red'},
  '中':{ch:'中',su:'',cl:'red'}, '發':{ch:'發',su:'',cl:'green'},
  '白':{ch:'白',su:'',cl:'black'},
};
const WINDS = ['東','南','西','北'];

// ── Helpers ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)            e.className   = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function genId() { return Math.random().toString(36).substr(2,9); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.id === id);
  });
}

function toast(msg, dur=2800) {
  const wrap = $('toast-wrap');
  const t = el('div','toast', msg);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), dur + 400);
}

function particle(emoji='🪙') {
  const p = el('div','particle', emoji);
  p.style.left   = (20 + Math.random()*60) + 'vw';
  p.style.bottom = '160px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1400);
}

function updateQiUI() {
  document.querySelectorAll('.qi-amount').forEach(e => e.textContent = qiAmount.toLocaleString());
}

// ── Tile factory ───────────────────────────────────────────────
function makeTile(id, size='md', opts={}) {
  const d  = TD[id];
  const div = el('div', `tile size-${size}${opts.back?' tile-back':''}${opts.selected?' selected':''}`);
  if (!opts.back && d) {
    const ch = el('span', `tile-char ${d.cl}`, d.ch);
    div.appendChild(ch);
    if (d.su) {
      const su = el('span','tile-suit', d.su);
      div.appendChild(su);
    }
  }
  div.dataset.tile = id || '';
  // Tenpai glow
  if (opts.tenpai) div.classList.add('tile-tenpai');
  return div;
}

// ══════════════════════════════════════════════════════════════
//  WebSocket
// ══════════════════════════════════════════════════════════════
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen    = () => { connStatus(true);  clearInterval(reconnTimer); };
  ws.onclose   = () => { connStatus(false); ws=null; reconnTimer=setInterval(()=>{ if(!ws) connect(); },3000); };
  ws.onerror   = () => { ws && ws.close(); };
  ws.onmessage = ({data}) => { try { handle(JSON.parse(data)); } catch{} };
}
function wsSend(obj) { if (ws && ws.readyState===1) ws.send(JSON.stringify(obj)); }
function connStatus(ok) {
  const el = $('conn-status');
  if (!el) return;
  el.className = `conn-status ${ok?'connected':'disconnected'}`;
  el.textContent = ok ? '● 已連線' : '○ 重新連線中…';
}

// ══════════════════════════════════════════════════════════════
//  Server message handler
// ══════════════════════════════════════════════════════════════
function handle(msg) {
  switch(msg.type) {

    // ── Room ───────────────────────────────────────────────
    case 'room_created':
      roomCode = msg.code; isHost = true;
      renderRoomCode(msg.code);
      renderRoomPlayers(msg.players || []);
      $('room-code-section').style.display = 'block';
      $('host-start-btn').disabled = true;
      toast(`🀄 房間 ${msg.code} 建立成功！分享給好友`);
      break;

    case 'player_joined':
      renderRoomPlayers(msg.players || []);
      toast(`👤 ${msg.name} 加入房間 (${msg.count}/${msg.max})`);
      if (msg.count >= 2 && isHost) $('host-start-btn').disabled = false;
      break;

    case 'joined_room':
      roomCode = msg.code; isHost = false;
      renderRoomCode(msg.code);
      renderRoomPlayers(msg.players || []);
      $('room-code-section').style.display = 'block';
      toast('✅ 成功加入房間！等待房主開始…');
      break;

    case 'player_left':
      toast(`${msg.name} 離開了房間`);
      break;

    case 'error':
      toast('⚠️ ' + msg.msg);
      break;

    // ── Game Start ─────────────────────────────────────────
    case 'game_start':
      isHKMode = msg.isHK;
      showScreen('screen-game');
      initBoard(msg.players);
      toast(isHKMode ? '🀄 香港麻將開始！' : '🀄 普通麻將開始！');
      quests[3].prog = 1;
      break;

    // ── Hand Update ────────────────────────────────────────
    case 'hand_update':
      if (msg.playerIdx === myIdx) {
        myHand = msg.hand;
        renderMyHand();
      }
      break;

    // ── My turn ────────────────────────────────────────────
    case 'your_turn':
      myHand     = msg.hand;
      canTsumo   = msg.canTsumo || false;
      tenpaiTiles= msg.tenpaiTiles || [];
      actionPhase= false;
      renderMyHand();
      if (msg.afterMeld) {
        showActionBar('discard');
        toast('碰/吃成功，請出牌');
      } else {
        showActionBar('discard');
        if (canTsumo) toast('🎉 可以自摸！');
        else if (tenpaiTiles.length) toast(`🔔 聽牌！等待 ${tenpaiTiles.join(' ')}`);
      }
      break;

    // ── Turn change ────────────────────────────────────────
    case 'turn_change':
      if (gameState) gameState.currentTurn = msg.currentTurn;
      updateTurnUI(msg.currentTurn, msg.deckLeft);
      if (msg.currentTurn !== myIdx) { hideActionBar(); }
      break;

    // ── Discard event ──────────────────────────────────────
    case 'discard_tile':
      updateDiscardPile();
      updateOtherHandCount(msg.playerIdx);
      // tenpai badge
      if (msg.playerIdx !== myIdx && msg.tenpai) {
        showTenpai(msg.playerIdx);
      }
      break;

    // ── Action prompt ──────────────────────────────────────
    case 'action_prompt':
      actionPhase = true;
      showActionBar('action', msg);
      // Highlight the discarded tile
      highlightDiscard(msg.tile);
      break;

    // ── Meld done ──────────────────────────────────────────
    case 'meld_done':
      appendMeld(msg.playerIdx, msg.meld, msg.meldType);
      updateOtherHandCount(msg.playerIdx);
      toast(msg.meldType === 'pong' ? '碰！' : '吃！');
      break;

    // ── State ──────────────────────────────────────────────
    case 'state_update':
      gameState = msg;
      refreshBoard(msg);
      break;

    // ── Game End ───────────────────────────────────────────
    case 'game_end':
      showGameOver(msg);
      quests[0].prog = Math.min(3, quests[0].prog+1);
      if (msg.winnerIdx === myIdx) {
        quests[1].prog = 1;
        updateQi(msg.scoreChange || 0);
        for(let i=0;i<6;i++) setTimeout(()=>particle('🎉'),i*100);
        for(let i=0;i<4;i++) setTimeout(()=>particle('🪙'),i*150+200);
      }
      break;
  }
}

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
function initLogin() {
  const inp = $('login-name-input');
  const btn = $('login-btn');
  const doLogin = () => {
    const v = inp.value.trim();
    if (!v) { toast('⚠️ 請輸入名稱'); return; }
    playerName = v;
    document.querySelectorAll('.player-name-display').forEach(e => e.textContent = playerName);
    document.querySelectorAll('.player-avatar-char').forEach(e => e.textContent = playerName.charAt(0));
    showScreen('screen-main');
    toast(`歡迎，${playerName}！`);
  };
  btn.addEventListener('click', doLogin);
  inp.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
}

// ══════════════════════════════════════════════════════════════
//  QUEST
// ══════════════════════════════════════════════════════════════
function renderQuests() {
  const list = $('quest-list-body');
  if (!list) return;
  list.innerHTML = '';
  quests.forEach(q => {
    const pct  = Math.min(100, (q.prog/q.total)*100);
    const done = q.prog >= q.total;
    const card = el('div','quest-card');
    card.innerHTML = `
      <div class="quest-icon-box">${q.icon}</div>
      <div class="quest-body">
        <div class="quest-name">${q.name}</div>
        <div class="quest-prog-text">${q.prog} / ${q.total}</div>
        <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="quest-right">
        <div class="quest-reward-label">🪙 +${q.reward}</div>
        <button class="btn-claim" data-qid="${q.id}" ${(!done||q.claimed)?'disabled':''}>${q.claimed?'已領取':'領取'}</button>
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll('.btn-claim:not([disabled])').forEach(b => {
    b.addEventListener('click', () => {
      const q = quests.find(x => x.id === +b.dataset.qid);
      if (!q||q.claimed) return;
      q.claimed = true;
      updateQi(q.reward);
      toast(`🪙 獲得 ${q.reward} 琪幣！`);
      particle('🪙');
      renderQuests();
    });
  });
}
function updateQi(delta) { qiAmount += delta; updateQiUI(); }

// ══════════════════════════════════════════════════════════════
//  FRIEND ROOM
// ══════════════════════════════════════════════════════════════
function initFriendRoom() {
  // Mode checkbox — single select
  document.querySelectorAll('.mode-checkbox').forEach(cb => {
    cb.addEventListener('change', function() {
      document.querySelectorAll('.mode-checkbox').forEach(c => {
        c.checked = (c === this && this.checked);
        c.closest('.mode-option').classList.toggle('selected', c.checked);
      });
      selectedMode = this.checked ? this.value : null;
      $('create-room-btn').disabled = !selectedMode;
    });
  });

  $('create-room-btn').addEventListener('click', () => {
    if (!selectedMode) { toast('請先選擇遊戲模式'); return; }
    if (!playerName)   { toast('請先登入'); return; }
    wsSend({ type:'create_room', mode:selectedMode, playerId, name:playerName });
  });

  $('host-start-btn').addEventListener('click', () => {
    wsSend({ type:'start_game' });
  });

  $('join-btn').addEventListener('click', () => {
    const code = $('join-code-input').value.trim();
    if (!code || code.length !== 4) { toast('⚠️ 請輸入4位代碼'); return; }
    if (!playerName) { toast('請先登入'); return; }
    wsSend({ type:'join_room', code, playerId, name:playerName });
    $('join-code-input').value = '';
  });
}

function renderRoomCode(code) {
  $('room-code-display').textContent = code;
}
function renderRoomPlayers(players) {
  const slots = $('player-slots');
  if (!slots) return;
  slots.innerHTML = '';
  const max = selectedMode === '2p' ? 2 : 4;
  players.forEach((p, i) => {
    const s = el('div','player-slot');
    s.innerHTML = `
      <div class="slot-avatar ${i===0?'host-avatar':'guest-avatar'}">${p.name.charAt(0)}</div>
      <span class="slot-name">${p.name}${p.id===playerId?' (我)':''}</span>
      ${i===0?'<span class="slot-tag">房主</span>':''}`;
    slots.appendChild(s);
  });
  if (players.length < max) {
    const e = el('div','player-slot');
    e.style.cssText='border-style:dashed;opacity:.4;justify-content:center;font-size:12px;color:var(--text-dim)';
    e.textContent = `等待玩家加入 ${players.length}/${max}`;
    slots.appendChild(e);
  }
}

// ══════════════════════════════════════════════════════════════
//  GAME BOARD
// ══════════════════════════════════════════════════════════════
let boardPlayers = [];

function initBoard(players) {
  boardPlayers = players;
  // find my index
  myIdx = players.findIndex(p => p.id === playerId);
  if (myIdx === -1) myIdx = 0;

  const board = $('game-board');
  board.innerHTML = `
    <div class="game-felt"></div>
    <div class="game-felt-pattern"></div>

    <!-- Center table area -->
    <div class="table-center" id="table-center">
      <div class="center-info">
        <div class="round-txt" id="round-txt">東一局</div>
        <div class="deck-txt">牌庫剩 <span id="deck-left">136</span> 張</div>
      </div>
      <div class="discard-pile" id="discard-pile"></div>
    </div>

    <!-- Player zones injected below -->
    <div id="game-actions" class="game-actions" style="display:none"></div>
    <div class="game-hud">
      <button class="hud-btn" id="hud-exit">退出</button>
      <div class="hud-turn" id="hud-turn"></div>
    </div>`;

  // Positions relative to myIdx
  const posMap = ['bottom','right','top','left'];   // for 4P
  const posMap2= ['bottom','top'];                  // for 2P
  const posArr = players.length === 2 ? posMap2 : posMap;

  players.forEach((p, i) => {
    const rel = (i - myIdx + players.length) % players.length;
    const pos = posArr[rel] || 'top';
    const wind= WINDS[i % 4];
    const zone= el('div', `player-zone ${pos}`);
    zone.id = `pzone-${i}`;
    zone.innerHTML = `
      <div class="player-nameplate" id="np-${i}">
        <div class="np-wind">${wind}</div>
        <div class="np-avatar">${p.name.charAt(0)}</div>
        <div class="np-info">
          <div class="np-name">${p.name}${i===myIdx?' (我)':''}</div>
          <div class="np-score" id="np-score-${i}">💰 ${p.score}</div>
        </div>
        <div class="tenpai-badge" id="tp-badge-${i}" style="display:none">聽</div>
      </div>
      <div class="melds-row" id="melds-${i}"></div>
      <div class="hand-row" id="hand-${i}"></div>`;
    board.appendChild(zone);
  });

  $('hud-exit').addEventListener('click', () => {
    if (confirm('確定退出對局？')) exitToLobby();
  });

  // Render other players' back tiles
  players.forEach((_, i) => {
    if (i !== myIdx) renderBackHand(i, 13);
  });
}

// ── My hand render ──────────────────────────────────────────
function renderMyHand() {
  const row = $(`hand-${myIdx}`);
  if (!row) return;
  row.innerHTML = '';
  myHand.forEach((t, idx) => {
    const isTenpai = tenpaiTiles.includes(t);
    const div = makeTile(t, 'lg', { tenpai: isTenpai });
    div.style.animationDelay = `${idx * 20}ms`;
    div.classList.add('deal-anim');
    div.addEventListener('click', () => onTileClick(div, t));
    row.appendChild(div);
  });
}

function onTileClick(div, t) {
  if (actionPhase) return;  // waiting for action response
  if (!gameState || gameState.currentTurn !== myIdx) {
    toast('還不是你的回合'); return;
  }
  if (selectedTile === t && div.classList.contains('selected')) {
    div.classList.remove('selected');
    selectedTile = null;
  } else {
    $(`hand-${myIdx}`).querySelectorAll('.tile').forEach(d => d.classList.remove('selected'));
    div.classList.add('selected');
    selectedTile = t;
  }
}

function renderBackHand(idx, count) {
  const row = $(`hand-${idx}`);
  if (!row) return;
  row.innerHTML = '';
  for (let i=0; i<count; i++) row.appendChild(makeTile(null,'sm',{back:true}));
}
function updateOtherHandCount(idx) {
  if (!gameState) return;
  const p = gameState.players[idx];
  if (p && idx !== myIdx) renderBackHand(idx, p.handCount);
}

// ── Discard pile ────────────────────────────────────────────
function updateDiscardPile() {
  if (!gameState) return;
  const pile = $('discard-pile');
  if (!pile) return;
  pile.innerHTML = '';
  const recent = gameState.discard.slice(-24);
  recent.forEach((t,i) => {
    const d = makeTile(t,'xs');
    if (i === recent.length-1) d.classList.add('last-discard');
    pile.appendChild(d);
  });
}
function highlightDiscard(tile) {
  $('discard-pile') && $('discard-pile').querySelectorAll('.tile').forEach(d => {
    d.classList.toggle('last-discard', d.dataset.tile === tile);
  });
}

// ── Melds ───────────────────────────────────────────────────
function appendMeld(idx, meld, type) {
  const row = $(`melds-${idx}`);
  if (!row) return;
  const grp = el('div','meld-group');
  meld.forEach(t => grp.appendChild(makeTile(t,'xs')));
  row.appendChild(grp);
}

// ── Tenpai badge ────────────────────────────────────────────
function showTenpai(idx) {
  const badge = $(`tp-badge-${idx}`);
  if (badge) badge.style.display = 'flex';
}

// ── Turn UI ─────────────────────────────────────────────────
function updateTurnUI(cur, deckLeft) {
  // Remove old active indicators
  document.querySelectorAll('.np-active').forEach(e => e.classList.remove('np-active'));
  const np = $(`np-${cur}`);
  if (np) np.classList.add('np-active');
  const hudTurn = $('hud-turn');
  if (hudTurn && gameState) {
    const p = gameState.players[cur];
    hudTurn.textContent = cur === myIdx ? '🎴 你的回合' : `${p?.name} 出牌中…`;
    hudTurn.style.color = cur === myIdx ? 'var(--jade-light)' : 'var(--gold)';
  }
  if (deckLeft !== undefined) {
    const dc = $('deck-left');
    if (dc) dc.textContent = deckLeft;
  }
}

// ── Full board refresh from state ───────────────────────────
function refreshBoard(state) {
  if (!state.players) return;
  state.players.forEach((p,i) => {
    const sc = $(`np-score-${i}`);
    if (sc) sc.textContent = `💰 ${p.score}`;
    if (i !== myIdx) updateOtherHandCount(i);
    // melds from state (initial or reconnect)
    const meldRow = $(`melds-${i}`);
    if (meldRow && meldRow.children.length === 0) {
      p.melds && p.melds.forEach(m => {
        const grp = el('div','meld-group');
        m.forEach(t => grp.appendChild(makeTile(t,'xs')));
        meldRow.appendChild(grp);
      });
    }
  });
  updateDiscardPile();
  updateTurnUI(state.currentTurn, state.deckLeft);
}

// ══════════════════════════════════════════════════════════════
//  ACTION BAR
// ══════════════════════════════════════════════════════════════
function showActionBar(mode, data) {
  const bar = $('game-actions');
  if (!bar) return;
  bar.innerHTML = '';
  bar.style.display = 'flex';

  if (mode === 'discard') {
    if (canTsumo) {
      const b = btn('自摸', 'action-btn win-action', () => {
        wsSend({ type:'tsumo' });
        hideActionBar();
      });
      bar.appendChild(b);
    }
    const discardBtn = btn('出牌', 'action-btn discard-action', doDiscard);
    bar.appendChild(discardBtn);
  }

  if (mode === 'action' && data) {
    const tile = data.tile;
    if (data.canWin) {
      bar.appendChild(btn('胡牌！','action-btn win-action', () => respond('win')));
    }
    if (data.canPong) {
      bar.appendChild(btn('碰','action-btn pong-action', () => respond('pong')));
    }
    if (data.canChow && !isHKMode) {
      bar.appendChild(btn('吃','action-btn chow-action', () => {
        // Simplified: auto pick first valid chow
        respond('chow', getBestChow(myHand, tile));
      }));
    }
    bar.appendChild(btn('過','action-btn pass-action', () => respond('pass')));
  }
}

function btn(text, cls, onClick) {
  const b = el('button', cls, text);
  b.addEventListener('click', onClick);
  return b;
}

function hideActionBar() {
  const bar = $('game-actions');
  if (bar) bar.style.display = 'none';
  selectedTile = null;
  document.querySelectorAll(`#hand-${myIdx} .tile`).forEach(d => d.classList.remove('selected'));
}

function doDiscard() {
  if (!selectedTile) {
    // auto-select last tile
    const row = $(`hand-${myIdx}`);
    if (row && row.lastChild) {
      selectedTile = row.lastChild.dataset.tile;
    } else { toast('請先選擇要打的牌'); return; }
  }
  wsSend({ type:'discard', tile:selectedTile });
  // Optimistic UI
  const idx = myHand.indexOf(selectedTile);
  if (idx !== -1) myHand.splice(idx, 1);
  selectedTile = null;
  renderMyHand();
  hideActionBar();
}

function respond(action, tiles=[]) {
  wsSend({ type:'action', action, tiles });
  actionPhase = false;
  hideActionBar();
}

function getBestChow(hand, tile) {
  const suit = tile.slice(-1);
  const num  = parseInt(tile);
  if (isNaN(num)) return [];
  const has = n => hand.includes(n+suit);
  if (has(num-2)&&has(num-1)) return [(num-2)+suit,(num-1)+suit];
  if (has(num-1)&&has(num+1)) return [(num-1)+suit,(num+1)+suit];
  if (has(num+1)&&has(num+2)) return [(num+1)+suit,(num+2)+suit];
  return [];
}

// ══════════════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════════════
function showGameOver(msg) {
  const ov = $('overlay-gameover');
  if (!ov) return;
  const title= $('gameover-title');
  const sub  = $('gameover-sub');
  const handsDiv = $('gameover-hands');

  const winner = boardPlayers[msg.winnerIdx];
  const iMine  = msg.winnerIdx === myIdx;

  if (msg.reason === 'win') {
    title.textContent = iMine ? '🎉 你贏了！' : `${winner?.name || '?'} 胡牌！`;
    title.style.color = iMine ? 'var(--jade-light)' : 'var(--gold)';
    sub.textContent   = msg.isTsumo ? '自摸！' + (iMine?` +${msg.scoreChange}琪幣`:'') : (iMine?`放炮勝 +${msg.scoreChange}琪幣`:'放炮負');
  } else {
    title.textContent = '流局';
    title.style.color = 'var(--text-dim)';
    sub.textContent   = '牌庫耗盡，本局流局';
  }

  // Show all hands
  if (handsDiv && msg.hands) {
    handsDiv.innerHTML = '';
    msg.hands.forEach(p => {
      const row = el('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap';
      const nm = el('span');
      nm.style.cssText = 'font-size:12px;color:var(--text-dim);min-width:56px;flex-shrink:0';
      nm.textContent = p.id===playerId?'我':p.name;
      row.appendChild(nm);
      const tiles = el('div');
      tiles.style.cssText = 'display:flex;gap:2px;flex-wrap:wrap';
      [...(p.melds||[]).flat(), ...p.hand].forEach(t => tiles.appendChild(makeTile(t,'xs')));
      row.appendChild(tiles);
      handsDiv.appendChild(row);
    });
  }

  ov.classList.add('active');
}

function exitToLobby() {
  roomCode=null; isHost=false; myIdx=-1;
  myHand=[]; gameState=null; selectedTile=null;
  canTsumo=false; tenpaiTiles=[]; actionPhase=false;
  $('overlay-gameover').classList.remove('active');
  // Reset friend room UI
  $('room-code-section').style.display='none';
  document.querySelectorAll('.mode-checkbox').forEach(c=>{ c.checked=false; c.closest('.mode-option').classList.remove('selected'); });
  selectedMode=null;
  $('create-room-btn').disabled=true;
  showScreen('screen-main');
  toast('已返回大廳');
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  connect();
  initLogin();
  initFriendRoom();

  // Back buttons
  document.querySelectorAll('[data-back]').forEach(b => {
    b.addEventListener('click', () => showScreen(b.dataset.back));
  });

  // Quest screen
  $('btn-go-quest')?.addEventListener('click', () => { renderQuests(); showScreen('screen-quest'); });

  // Lobby buttons
  $('btn-go-friend')?.addEventListener('click', () => showScreen('screen-friend'));
  $('btn-quick-match')?.addEventListener('click', () => toast('⚡ 快速對局即將上線'));
  $('btn-leaderboard')?.addEventListener('click', () => toast('🏆 排行榜即將上線'));
  $('btn-replay')?.addEventListener('click', () => toast('🎴 回放即將上線'));

  // Game over overlay
  $('gameover-replay')?.addEventListener('click', () => { wsSend({type:'restart'}); $('overlay-gameover').classList.remove('active'); });
  $('gameover-exit')?.addEventListener('click', exitToLobby);
});
