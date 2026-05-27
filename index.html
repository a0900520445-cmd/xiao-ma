// ═══════════════════════════════════════════════════════════
//  小麻將 · game.js — Client Side Game Logic & WebSocket
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let ws = null;
  let playerName = '';
  let playerId = generateId();
  let qiAmount = 1200;
  let roomCode = null;
  let isHost = false;
  let myPlayerIdx = -1;
  let myHand = [];
  let gameState = null;
  let selectedTile = null;
  let reconnectTimer = null;

  // ── Quest Data ─────────────────────────────────────────────
  const quests = [
    { id: 1, icon: '🀇', name: '完成3場對局', prog: 0, total: 3, reward: 150, claimed: false },
    { id: 2, icon: '🏅', name: '贏得一場勝利', prog: 0, total: 1, reward: 300, claimed: false },
    { id: 3, icon: '📅', name: '每日登入簽到', prog: 1, total: 1, reward: 100, claimed: false },
    { id: 4, icon: '👥', name: '使用好友桌對局', prog: 0, total: 1, reward: 200, claimed: false },
  ];

  // ── Tile Definitions ───────────────────────────────────────
  const TILE_DISPLAY = {
    '1m': { char: '一', suit: '萬', cls: 'black' },
    '2m': { char: '二', suit: '萬', cls: 'black' },
    '3m': { char: '三', suit: '萬', cls: 'black' },
    '4m': { char: '四', suit: '萬', cls: 'black' },
    '5m': { char: '五', suit: '萬', cls: 'black' },
    '6m': { char: '六', suit: '萬', cls: 'black' },
    '7m': { char: '七', suit: '萬', cls: 'black' },
    '8m': { char: '八', suit: '萬', cls: 'black' },
    '9m': { char: '九', suit: '萬', cls: 'black' },
    '1p': { char: '①', suit: '筒', cls: 'blue' },
    '2p': { char: '②', suit: '筒', cls: 'blue' },
    '3p': { char: '③', suit: '筒', cls: 'blue' },
    '4p': { char: '④', suit: '筒', cls: 'blue' },
    '5p': { char: '⑤', suit: '筒', cls: 'blue' },
    '6p': { char: '⑥', suit: '筒', cls: 'blue' },
    '7p': { char: '⑦', suit: '筒', cls: 'blue' },
    '8p': { char: '⑧', suit: '筒', cls: 'blue' },
    '9p': { char: '⑨', suit: '筒', cls: 'blue' },
    '1s': { char: '1', suit: '索', cls: 'green' },
    '2s': { char: '2', suit: '索', cls: 'green' },
    '3s': { char: '3', suit: '索', cls: 'green' },
    '4s': { char: '4', suit: '索', cls: 'green' },
    '5s': { char: '5', suit: '索', cls: 'green' },
    '6s': { char: '6', suit: '索', cls: 'green' },
    '7s': { char: '7', suit: '索', cls: 'green' },
    '8s': { char: '8', suit: '索', cls: 'green' },
    '9s': { char: '9', suit: '索', cls: 'green' },
    '東': { char: '東', suit: '', cls: 'red' },
    '南': { char: '南', suit: '', cls: 'red' },
    '西': { char: '西', suit: '', cls: 'red' },
    '北': { char: '北', suit: '', cls: 'red' },
    '中': { char: '中', suit: '', cls: 'red' },
    '發': { char: '發', suit: '', cls: 'green' },
    '白': { char: '白', suit: '', cls: 'black' },
  };

  const WINDS = ['東', '南', '西', '北'];

  // ── DOM Helpers ─────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      if (s.id === id) {
        s.classList.add('active');
        s.classList.remove('slide-out');
      } else {
        s.classList.remove('active');
      }
    });
  }

  function toast(msg, duration = 2500) {
    const wrap = $('toast-wrap');
    const t = el('div', 'toast', msg);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), duration + 300);
  }

  function spawnParticle(emoji = '🪙') {
    const p = el('div', 'particle', emoji);
    p.style.left = (Math.random() * 60 + 20) + 'vw';
    p.style.bottom = '140px';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }

  function updateQi(delta) {
    qiAmount += delta;
    document.querySelectorAll('.qi-amount').forEach(e => (e.textContent = qiAmount.toLocaleString()));
  }

  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  // ── Tile Rendering ──────────────────────────────────────────
  function makeTile(tileId, size = 'md', opts = {}) {
    const { selectable = false, back = false, small = false } = opts;
    const div = el('div', `tile size-${size}${back ? ' tile-back' : ''}`);
    if (!back) {
      const d = TILE_DISPLAY[tileId];
      if (d) {
        const charEl = el('span', `tile-char ${d.cls}`, d.char);
        div.appendChild(charEl);
        if (d.suit) {
          const suitEl = el('span', 'tile-suit', d.suit);
          div.appendChild(suitEl);
        }
      }
      div.dataset.tile = tileId;
      if (selectable) {
        div.addEventListener('click', () => onTileClick(div, tileId));
      }
    }
    return div;
  }

  function onTileClick(div, tileId) {
    if (gameState && gameState.phase !== 'playing') return;
    if (gameState && gameState.currentTurn !== myPlayerIdx) {
      toast('還不是你的回合');
      return;
    }
    if (selectedTile === tileId) {
      // Deselect
      div.classList.remove('selected');
      selectedTile = null;
    } else {
      document.querySelectorAll('.tile.selected').forEach(t => t.classList.remove('selected'));
      div.classList.add('selected');
      selectedTile = tileId;
    }
    updateActionButtons();
  }

  // ── WebSocket ────────────────────────────────────────────────
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.onopen = () => {
      updateConnStatus(true);
      clearInterval(reconnectTimer);
    };

    ws.onclose = () => {
      updateConnStatus(false);
      ws = null;
      reconnectTimer = setInterval(() => {
        if (!ws) connect();
      }, 3000);
    };

    ws.onerror = () => { ws && ws.close(); };

    ws.onmessage = ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      handleServerMsg(msg);
    };
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function updateConnStatus(connected) {
    const el = $('conn-status');
    if (!el) return;
    el.className = `conn-status ${connected ? 'connected' : 'disconnected'}`;
    el.textContent = connected ? '● 已連線' : '○ 重新連線中…';
  }

  // ── Server Message Handlers ──────────────────────────────────
  function handleServerMsg(msg) {
    switch (msg.type) {
      case 'room_created':
        roomCode = msg.code;
        isHost = true;
        showRoomCode(msg.code);
        toast(`房間 ${msg.code} 建立成功！`);
        break;

      case 'joined_room':
        roomCode = msg.code;
        isHost = false;
        updateRoomPlayers(msg.players || []);
        toast('成功加入房間！等待房主開始…');
        break;

      case 'player_joined':
        updateRoomPlayers(msg.players || []);
        toast(`👤 ${msg.name} 加入了房間 (${msg.count}/${msg.max})`);
        if (isHost && msg.count >= 2) {
          $('host-start-btn') && ($('host-start-btn').disabled = false);
        }
        break;

      case 'player_left':
        toast(`${msg.name} 離開了房間`);
        break;

      case 'game_start':
        showScreen('screen-game');
        toast('遊戲開始！');
        quests[3].prog = 1;
        initGameBoard(msg.players);
        break;

      case 'hand':
        myPlayerIdx = msg.playerIdx;
        myHand = msg.hand;
        renderMyHand();
        break;

      case 'your_turn':
        myHand = msg.hand;
        renderMyHand();
        toast(`摸牌：${msg.drawn}`);
        showActionPanel('discard');
        break;

      case 'state':
        gameState = msg;
        updateGameBoard(msg);
        break;

      case 'turn_change':
        gameState = { ...gameState, ...msg };
        updateTurnIndicators(msg.currentTurn);
        if (msg.currentTurn !== myPlayerIdx) {
          hideActionPanel();
        }
        break;

      case 'action_prompt':
        const myAction = msg.actions.find(a => a.playerIdx === myPlayerIdx);
        if (myAction) {
          showActionPanel('response', myAction, msg.tile);
        }
        break;

      case 'meld':
        toast(`${msg.meldType === 'pong' ? '碰！' : '吃！'}`);
        updateMelds(msg.playerIdx, msg.meld);
        break;

      case 'game_end':
        showGameEnd(msg);
        if (msg.reason === 'win' && msg.winner && msg.winner.id === playerId) {
          quests[1].prog = 1;
          updateQi(500);
          toast('🎉 贏了！+500 琪幣');
          for (let i = 0; i < 5; i++) setTimeout(() => spawnParticle('🎉'), i * 150);
        }
        quests[0].prog = Math.min(3, quests[0].prog + 1);
        break;

      case 'error':
        toast('⚠️ ' + msg.msg);
        break;

      case 'restart_ready':
        $('overlay-gameover') && $('overlay-gameover').classList.remove('active');
        break;
    }
  }

  // ── Screen: Login ─────────────────────────────────────────────
  function initLogin() {
    const nameInput = $('login-name-input');
    const loginBtn = $('login-btn');

    loginBtn.addEventListener('click', doLogin);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    function doLogin() {
      const name = nameInput.value.trim();
      if (!name) { toast('⚠️ 請輸入名稱'); return; }
      if (name.length > 12) { toast('⚠️ 名稱最多12字'); return; }
      playerName = name;
      // Update UI
      document.querySelectorAll('.player-name-display').forEach(e => (e.textContent = playerName));
      document.querySelectorAll('.player-avatar-char').forEach(e => (e.textContent = playerName.charAt(0)));
      showScreen('screen-main');
      renderQuests();
      toast(`歡迎，${playerName}！`);
    }
  }

  // ── Screen: Main Lobby ────────────────────────────────────────
  function initMainLobby() {
    $('btn-go-friend').addEventListener('click', () => showScreen('screen-friend'));
    $('btn-go-quest').addEventListener('click', () => {
      renderQuests();
      showScreen('screen-quest');
    });
    $('btn-quick-match').addEventListener('click', () => toast('⚡ 快速對局即將上線'));
    $('btn-leaderboard').addEventListener('click', () => toast('🏆 排行榜即將上線'));
    $('btn-replay').addEventListener('click', () => toast('🎴 回放功能即將上線'));
  }

  // ── Screen: Quest ─────────────────────────────────────────────
  function renderQuests() {
    const list = $('quest-list-body');
    if (!list) return;
    list.innerHTML = '';
    quests.forEach(q => {
      const pct = Math.min(100, (q.prog / q.total) * 100);
      const done = q.prog >= q.total;
      const card = el('div', 'quest-card');
      card.innerHTML = `
        <div class="quest-icon-box">${q.icon}</div>
        <div class="quest-body">
          <div class="quest-name">${q.name}</div>
          <div class="quest-prog-text">${q.prog} / ${q.total}</div>
          <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="quest-right">
          <div class="quest-reward-label">🪙 +${q.reward}</div>
          <button class="btn-claim" data-id="${q.id}" ${(!done || q.claimed) ? 'disabled' : ''}>${q.claimed ? '已領取' : '領取'}</button>
        </div>`;
      list.appendChild(card);
    });
    list.querySelectorAll('.btn-claim:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => claimQuest(parseInt(btn.dataset.id)));
    });
  }

  function claimQuest(id) {
    const q = quests.find(x => x.id === id);
    if (!q || q.claimed || q.prog < q.total) return;
    q.claimed = true;
    updateQi(q.reward);
    toast(`🪙 領取 ${q.reward} 琪幣！`);
    spawnParticle('🪙');
    spawnParticle('✨');
    renderQuests();
  }

  // ── Screen: Friend Room ───────────────────────────────────────
  let selectedMode = null;

  function initFriendRoom() {
    // Mode checkboxes
    document.querySelectorAll('.mode-checkbox').forEach(cb => {
      cb.addEventListener('change', function () {
        document.querySelectorAll('.mode-checkbox').forEach(c => {
          if (c !== this) c.checked = false;
          c.closest('.mode-option').classList.toggle('selected', c.checked);
        });
        selectedMode = this.checked ? this.value : null;
        const btn = $('create-room-btn');
        btn.disabled = !selectedMode;
      });
    });

    $('create-room-btn').addEventListener('click', createRoom);
    $('join-btn').addEventListener('click', joinRoom);
    $('host-start-btn').addEventListener('click', startGame);
  }

  function createRoom() {
    if (!selectedMode) { toast('請先選擇遊戲模式'); return; }
    send({ type: 'create_room', mode: selectedMode, playerId, name: playerName });
  }

  function joinRoom() {
    const code = $('join-code-input').value.trim();
    if (!code || code.length !== 4) { toast('⚠️ 請輸入4位房間代碼'); return; }
    send({ type: 'join_room', code, playerId, name: playerName });
    $('join-code-input').value = '';
  }

  function startGame() {
    send({ type: 'start_game' });
  }

  function showRoomCode(code) {
    $('room-code-display').textContent = code;
    $('room-code-section').style.display = 'block';
    $('host-start-btn').disabled = true;
    updateRoomPlayers([{ name: playerName, id: playerId }]);
  }

  function updateRoomPlayers(players) {
    const slots = $('player-slots');
    if (!slots) return;
    slots.innerHTML = '';
    players.forEach((p, i) => {
      const slot = el('div', 'player-slot');
      slot.innerHTML = `
        <div class="slot-avatar ${i === 0 ? 'host-avatar' : 'guest-avatar'}">${p.name.charAt(0)}</div>
        <span class="slot-name">${p.name}</span>
        ${i === 0 ? '<span class="slot-tag">房主</span>' : ''}`;
      slots.appendChild(slot);
    });
    const maxP = selectedMode === '2p' ? 2 : 4;
    if (players.length < maxP) {
      const empty = el('div', 'player-slot');
      empty.style.cssText = 'border-style:dashed;opacity:0.4;justify-content:center;font-size:12px;color:var(--text-dim)';
      empty.textContent = `等待玩家加入 ${players.length}/${maxP}`;
      slots.appendChild(empty);
    }
  }

  // ── Game Board ────────────────────────────────────────────────
  function initGameBoard(players) {
    const board = $('game-board');
    board.innerHTML = '';

    // Felt layers
    const felt = el('div', 'game-felt');
    const feltPattern = el('div', 'game-felt-pattern');
    board.appendChild(felt);
    board.appendChild(feltPattern);

    // Center
    const center = el('div', 'table-center');
    center.id = 'table-center';
    center.innerHTML = `
      <div class="center-round-info">
        <div class="round-label" id="round-label">東 一 局</div>
        <div class="deck-count">剩餘 <span id="deck-count">136</span> 張</div>
      </div>
      <div class="discard-pile" id="discard-pile"></div>`;
    board.appendChild(center);

    // Player zones
    const positions = ['bottom', 'top', 'right', 'left'];
    players.forEach((p, i) => {
      const myOff = myPlayerIdx >= 0 ? myPlayerIdx : 0;
      const rel = (i - myOff + players.length) % players.length;
      const pos = positions[rel] || 'top';
      const zone = el('div', `player-zone ${pos}`);
      zone.id = `player-zone-${i}`;
      const wind = WINDS[i % 4];
      const isMine = i === myPlayerIdx;

      zone.innerHTML = `
        <div class="player-nameplate" id="nameplate-${i}">
          <div class="nameplate-wind">${wind}</div>
          <div class="nameplate-avatar">${p.name.charAt(0)}</div>
          <div>
            <div class="nameplate-name">${p.name}${isMine ? ' (我)' : ''}</div>
            <div class="nameplate-score" id="score-${i}">💰 ${p.score}</div>
          </div>
        </div>
        <div class="melds-area" id="melds-${i}"></div>
        <div class="hand-area" id="hand-${i}"></div>`;
      board.appendChild(zone);
    });

    // HUD
    const hud = el('div', 'game-hud');
    hud.innerHTML = `
      <button class="hud-btn" id="hud-exit">退出</button>
      <div id="hud-status" style="font-size:12px;color:var(--gold);letter-spacing:1px"></div>`;
    board.appendChild(hud);

    // Action panel
    const actions = el('div', 'game-actions');
    actions.id = 'game-actions';
    actions.style.display = 'none';
    board.appendChild(actions);

    $('hud-exit').addEventListener('click', exitGame);

    // Render other hands as backs
    players.forEach((p, i) => {
      if (i !== myPlayerIdx) renderBackHand(i, 13);
    });
  }

  function renderMyHand() {
    const container = $(`hand-${myPlayerIdx}`);
    if (!container) return;
    container.innerHTML = '';
    myHand.forEach((t, idx) => {
      const tile = makeTile(t, 'lg', { selectable: true });
      tile.style.animationDelay = `${idx * 30}ms`;
      tile.classList.add('deal-anim');
      container.appendChild(tile);
    });
  }

  function renderBackHand(playerIdx, count) {
    const container = $(`hand-${playerIdx}`);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const t = makeTile(null, 'sm', { back: true });
      container.appendChild(t);
    }
  }

  function updateGameBoard(state) {
    gameState = state;
    if (!state.players) return;

    // Update scores
    state.players.forEach((p, i) => {
      const sc = $(`score-${i}`);
      if (sc) sc.textContent = `💰 ${p.score}`;
    });

    // Deck count
    const dc = $('deck-count');
    if (dc) dc.textContent = state.deckLeft;

    // Discard pile
    const pile = $('discard-pile');
    if (pile) {
      pile.innerHTML = '';
      const recent = state.discard.slice(-18);
      recent.forEach(t => pile.appendChild(makeTile(t, 'xs')));
    }

    updateTurnIndicators(state.currentTurn);
  }

  function updateTurnIndicators(currentTurn) {
    document.querySelectorAll('.active-indicator').forEach(e => e.remove());
    const np = $(`nameplate-${currentTurn}`);
    if (np) {
      const ind = el('div', 'active-indicator');
      np.appendChild(ind);
    }
    const hud = $('hud-status');
    if (hud && gameState && gameState.players) {
      const who = gameState.players[currentTurn];
      hud.textContent = who ? (currentTurn === myPlayerIdx ? '你的回合' : `${who.name} 出牌中`) : '';
    }
  }

  function updateMelds(playerIdx, meld) {
    const melds = $(`melds-${playerIdx}`);
    if (!melds) return;
    const group = el('div', 'meld-group');
    meld.forEach(t => group.appendChild(makeTile(t, 'xs')));
    melds.appendChild(group);
  }

  // ── Action Panel ──────────────────────────────────────────────
  function showActionPanel(mode, actions, tile) {
    const panel = $('game-actions');
    if (!panel) return;
    panel.style.display = 'flex';
    panel.innerHTML = '';

    if (mode === 'discard') {
      const btn = el('button', 'action-btn discard-action', '出牌');
      btn.addEventListener('click', discardSelected);
      panel.appendChild(btn);
    }

    if (mode === 'response' && actions) {
      if (actions.canWin) {
        const btn = el('button', 'action-btn win-action', '胡牌！');
        btn.addEventListener('click', () => respondAction('win'));
        panel.appendChild(btn);
      }
      if (actions.canPong) {
        const btn = el('button', 'action-btn pong-action', '碰');
        btn.addEventListener('click', () => respondAction('pong'));
        panel.appendChild(btn);
      }
      const passBtn = el('button', 'action-btn pass-action', '過');
      passBtn.addEventListener('click', () => respondAction('pass'));
      panel.appendChild(passBtn);
    }
  }

  function hideActionPanel() {
    const panel = $('game-actions');
    if (panel) panel.style.display = 'none';
  }

  function updateActionButtons() {
    // Auto-show discard button if it's my turn
    if (gameState && gameState.currentTurn === myPlayerIdx && selectedTile) {
      showActionPanel('discard');
    }
  }

  function discardSelected() {
    if (!selectedTile) { toast('請先選擇要出的牌'); return; }
    send({ type: 'discard', tile: selectedTile });
    // Optimistic remove
    const idx = myHand.indexOf(selectedTile);
    if (idx !== -1) myHand.splice(idx, 1);
    selectedTile = null;
    renderMyHand();
    hideActionPanel();
  }

  function respondAction(action) {
    send({ type: 'action', action });
    hideActionPanel();
  }

  // ── Game End ──────────────────────────────────────────────────
  function showGameEnd(msg) {
    const ov = $('overlay-gameover');
    if (!ov) return;
    const title = ov.querySelector('#gameover-title');
    const sub = ov.querySelector('#gameover-sub');
    const hands = ov.querySelector('#gameover-hands');

    if (msg.reason === 'win' && msg.winner) {
      const isMe = msg.winner.id === playerId;
      title.textContent = isMe ? '🎉 胡牌！' : `${msg.winner.name} 胡牌！`;
      title.style.color = isMe ? 'var(--jade-light)' : 'var(--gold)';
      sub.textContent = isMe ? '恭喜獲勝！+500 琪幣' : '很遺憾，下次再來！';
    } else {
      title.textContent = '流局';
      title.style.color = 'var(--text-dim)';
      sub.textContent = '牌庫耗盡，本局流局';
    }

    // Show all hands
    if (hands && msg.hands) {
      hands.innerHTML = '';
      msg.hands.forEach(p => {
        const row = el('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px';
        const nameEl = el('span');
        nameEl.style.cssText = 'font-size:12px;color:var(--text-dim);min-width:60px';
        nameEl.textContent = p.id === playerId ? '我' : (gameState && gameState.players ? (gameState.players.find(pl => pl.id === p.id) || {}).name || '?' : '?');
        row.appendChild(nameEl);
        const tilesEl = el('div');
        tilesEl.style.cssText = 'display:flex;gap:2px;flex-wrap:wrap';
        p.hand.forEach(t => tilesEl.appendChild(makeTile(t, 'xs')));
        row.appendChild(tilesEl);
        hands.appendChild(row);
      });
    }

    ov.classList.add('active');
  }

  function exitGame() {
    if (confirm('確定退出對局？')) {
      roomCode = null; isHost = false; myPlayerIdx = -1;
      myHand = []; gameState = null; selectedTile = null;
      $('overlay-gameover').classList.remove('active');
      showScreen('screen-main');
      toast('已退出對局');
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    connect();
    initLogin();
    initMainLobby();
    initFriendRoom();

    // Back buttons
    document.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', () => showScreen(btn.dataset.back));
    });

    // Gameover overlay actions
    $('gameover-replay').addEventListener('click', () => {
      send({ type: 'restart' });
    });
    $('gameover-exit').addEventListener('click', () => {
      $('overlay-gameover').classList.remove('active');
      exitGame();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();
