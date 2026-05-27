// ═══════════════════════════════════════════════════════════════
//  小麻將 · server.js  —  WebSocket Mahjong Server
//  普通麻將 + 香港麻將 (2人) 規則
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const http    = require('http');
const { WebSocketServer } = require('ws');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));

// ─── helpers ──────────────────────────────────────────────────
function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(players, obj) {
  const s = JSON.stringify(obj);
  players.forEach(p => { if (p.ws && p.ws.readyState === 1) p.ws.send(s); });
}

// ─── Tile Engine ──────────────────────────────────────────────
const SUITS  = ['m','p','s'];
const HONORS = ['東','南','西','北','中','發','白'];

function buildDeck() {
  const d = [];
  for (const s of SUITS)
    for (let n = 1; n <= 9; n++)
      for (let k = 0; k < 4; k++) d.push(n + s);
  for (const h of HONORS)
    for (let k = 0; k < 4; k++) d.push(h);
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sortHand(h) {
  const order = { m: 0, p: 1, s: 2 };
  return h.slice().sort((a, b) => {
    const aHonor = HONORS.indexOf(a), bHonor = HONORS.indexOf(b);
    if (aHonor !== -1 && bHonor !== -1) return aHonor - bHonor;
    if (aHonor !== -1) return 1;
    if (bHonor !== -1) return -1;
    const as = a.slice(-1), bs = b.slice(-1);
    if (as !== bs) return order[as] - order[bs];
    return parseInt(a) - parseInt(b);
  });
}

// ─── Win Detection ─────────────────────────────────────────────
// Returns true if tiles form a complete hand (4 sets + 1 pair)
function isWinningHand(tiles) {
  const sorted = sortHand(tiles);
  // Try each possible pair
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i] === sorted[i + 1]) {
      const rest = sorted.slice();
      rest.splice(i, 2);
      if (canFormSets(rest)) return true;
    }
  }
  return false;
}
function canFormSets(tiles) {
  if (tiles.length === 0) return true;
  const t = tiles[0];
  const rest = tiles.slice(1);
  // try pong
  const i2 = rest.indexOf(t);
  if (i2 !== -1) {
    const r2 = rest.slice(); r2.splice(i2, 1);
    const i3 = r2.indexOf(t);
    if (i3 !== -1) {
      const r3 = r2.slice(); r3.splice(i3, 1);
      if (canFormSets(r3)) return true;
    }
  }
  // try sequence
  const suit = t.slice(-1);
  const num  = parseInt(t);
  if (!isNaN(num) && SUITS.includes(suit) && num <= 7) {
    const t2 = (num+1)+suit, t3 = (num+2)+suit;
    const idx2 = rest.indexOf(t2);
    if (idx2 !== -1) {
      const r2 = rest.slice(); r2.splice(idx2, 1);
      const idx3 = r2.indexOf(t3);
      if (idx3 !== -1) {
        const r3 = r2.slice(); r3.splice(idx3, 1);
        if (canFormSets(r3)) return true;
      }
    }
  }
  return false;
}

// ─── Tenpai (聽牌) Detection ──────────────────────────────────
// Returns array of tiles that would complete the hand
function getTenpaiTiles(hand) {
  const allTiles = new Set([
    ...['m','p','s'].flatMap(s => Array.from({length:9},(_,i)=>(i+1)+s)),
    ...HONORS
  ]);
  const waits = [];
  for (const t of allTiles) {
    if (isWinningHand([...hand, t])) waits.push(t);
  }
  return waits;
}

// ─── Score Calculation (香港麻將) ─────────────────────────────
function calcScore(hand, melds, winTile, isTsumo, isHK) {
  // simplified fan counting
  let fan = 1;
  const allTiles = [...hand, ...melds.flat(), winTile];
  const honors   = allTiles.filter(t => HONORS.includes(t));
  if (honors.length >= 12) fan += 2;          // 字一色
  if (allTiles.every(t => !isNaN(parseInt(t)))) fan += 1; // 清一色 base
  if (isTsumo) fan += 1;                       // 自摸加番
  return isHK ? fan * 2 : fan;
}

// ─── Room ─────────────────────────────────────────────────────
class Room {
  constructor(code, mode, hostId, hostName) {
    this.code       = code;
    this.mode       = mode;           // '2p' | '4p'
    this.isHK       = mode === '2p';  // 香港麻將 for 2-player
    this.maxPlayers = mode === '2p' ? 2 : 4;
    this.players    = [{
      id: hostId, name: hostName, ws: null,
      hand: [], melds: [], score: 1000, tenpai: false, tenpaiTiles: []
    }];
    this.deck        = [];
    this.discard     = [];
    this.currentTurn = 0;
    this.phase       = 'waiting';     // waiting|playing|action|ended
    this.lastDiscard = null;
    this.lastDiscardFrom = -1;
    this.round       = 0;             // 0=東1, 1=東2 …
    this.actionTimer = null;
    this.pendingActions = [];         // who can respond
    this.responses   = {};            // playerIdx -> action chosen
  }

  addPlayer(id, name, ws) {
    if (this.players.length >= this.maxPlayers) return false;
    this.players.push({ id, name, ws, hand: [], melds: [], score: 1000, tenpai: false, tenpaiTiles: [] });
    return true;
  }

  // ── Start ──────────────────────────────────────────────────
  startGame() {
    this.deck    = shuffle(buildDeck());
    this.discard = [];
    this.players.forEach(p => { p.hand = []; p.melds = []; p.tenpai = false; p.tenpaiTiles = []; });

    // Deal 13 tiles each
    const count = this.players.length;
    for (let i = 0; i < 13; i++)
      for (let j = 0; j < count; j++)
        this.players[j].hand.push(this.deck.pop());

    this.players.forEach(p => { p.hand = sortHand(p.hand); });
    this.currentTurn = 0;
    this.phase = 'playing';

    this.broadcast({ type: 'game_start',
      players: this.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
      round: this.round, isHK: this.isHK });

    this.sendAllHands();
    this.broadcastState();
    this.doDrawTile(0);              // first player draws
  }

  // ── Draw tile ──────────────────────────────────────────────
  doDrawTile(idx) {
    if (this.deck.length === 0) { this.endGame('draw'); return; }
    const tile = this.deck.pop();
    const p    = this.players[idx];
    p.hand.push(tile);
    p.hand = sortHand(p.hand);
    this.currentTurn = idx;
    this.phase = 'playing';

    // Check tsumo (自摸)
    const tsumo = isWinningHand(p.hand);
    // Tenpai tiles
    p.tenpaiTiles = getTenpaiTiles(p.hand.slice(0,-1)); // before this draw
    p.tenpai = p.tenpaiTiles.length > 0;

    // Tell the player their hand + drawn tile + if tsumo available
    send(p.ws, { type: 'your_turn', hand: p.hand, drawn: tile,
      canTsumo: tsumo, tenpaiTiles: p.tenpaiTiles });

    this.broadcast({ type: 'turn_change', currentTurn: idx, deckLeft: this.deck.length });
    this.broadcastState();
  }

  // ── Discard ────────────────────────────────────────────────
  doDiscard(playerIdx, tile) {
    const p   = this.players[playerIdx];
    const idx = p.hand.indexOf(tile);
    if (idx === -1) return false;
    p.hand.splice(idx, 1);
    p.hand = sortHand(p.hand);
    this.discard.push(tile);
    this.lastDiscard     = tile;
    this.lastDiscardFrom = playerIdx;

    // Compute tenpai state after discard
    p.tenpaiTiles = getTenpaiTiles(p.hand);
    p.tenpai = p.tenpaiTiles.length > 0;

    this.broadcast({ type: 'discard_tile', playerIdx, tile,
      tenpai: p.tenpai, deckLeft: this.deck.length });

    // ── Check who can react ──────────────────────────────────
    this.pendingActions = [];
    this.responses      = {};

    this.players.forEach((q, i) => {
      if (i === playerIdx) return;
      const canWin  = isWinningHand([...q.hand, tile]);
      const canPong = q.hand.filter(t => t === tile).length >= 2;
      // Chow only for the next player (no chow in HK 2P basic mode)
      const isNext  = !this.isHK && (i === (playerIdx + 1) % this.players.length);
      const canChow = isNext && checkCanChow(q.hand, tile);
      if (canWin || canPong || (canChow && !this.isHK)) {
        this.pendingActions.push({ playerIdx: i, canWin, canPong, canChow });
        send(q.ws, { type: 'action_prompt', tile, from: playerIdx,
          canWin, canPong, canChow });
      }
    });

    if (this.pendingActions.length === 0) {
      this.nextTurn();
    } else {
      this.phase = 'action';
      // Auto-pass after 8s
      clearTimeout(this.actionTimer);
      this.actionTimer = setTimeout(() => {
        if (this.phase === 'action') this.nextTurn();
      }, 8000);
    }
    this.broadcastState();
    return true;
  }

  // ── Player responds to action prompt ──────────────────────
  doAction(playerIdx, action, tiles) {
    if (this.phase !== 'action') return;
    this.responses[playerIdx] = { action, tiles };

    // Check if everyone who can act has responded
    const allResponded = this.pendingActions.every(a => this.responses[a.playerIdx]);
    if (!allResponded) return;

    clearTimeout(this.actionTimer);

    // Priority: win > pong > chow > pass
    let winner = null, pongIdx = -1, chowIdx = -1;
    for (const a of this.pendingActions) {
      const r = this.responses[a.playerIdx];
      if (!r) continue;
      if (r.action === 'win')  { winner  = a.playerIdx; break; }
      if (r.action === 'pong' && pongIdx === -1) pongIdx = a.playerIdx;
      if (r.action === 'chow' && chowIdx === -1) chowIdx = a.playerIdx;
    }

    const tile = this.lastDiscard;
    if (winner !== null) {
      const p = this.players[winner];
      p.hand.push(tile);
      this.discard.pop();
      this.endGame('win', winner, false);
      return;
    }
    if (pongIdx !== -1) {
      const p = this.players[pongIdx];
      // remove 2 from hand
      let removed = 0;
      p.hand = p.hand.filter(t => { if (t === tile && removed < 2) { removed++; return false; } return true; });
      p.melds.push([tile, tile, tile]);
      this.discard.pop();
      this.currentTurn = pongIdx;
      this.phase = 'playing';
      this.broadcast({ type: 'meld_done', playerIdx: pongIdx, meld: [tile,tile,tile], meldType: 'pong' });
      this.sendHand(pongIdx);
      send(this.players[pongIdx].ws, { type: 'your_turn', hand: p.hand, drawn: null, afterMeld: true });
      this.broadcastState();
      return;
    }
    if (chowIdx !== -1 && this.responses[chowIdx].tiles) {
      const p = this.players[chowIdx];
      const usedTiles = this.responses[chowIdx].tiles; // 2 tiles from hand
      usedTiles.forEach(t => {
        const i = p.hand.indexOf(t);
        if (i !== -1) p.hand.splice(i, 1);
      });
      const meld = [...usedTiles, tile].sort();
      p.melds.push(meld);
      this.discard.pop();
      this.currentTurn = chowIdx;
      this.phase = 'playing';
      this.broadcast({ type: 'meld_done', playerIdx: chowIdx, meld, meldType: 'chow' });
      this.sendHand(chowIdx);
      send(this.players[chowIdx].ws, { type: 'your_turn', hand: p.hand, drawn: null, afterMeld: true });
      this.broadcastState();
      return;
    }
    // All passed
    this.nextTurn();
  }

  // ── Tsumo (自摸) ───────────────────────────────────────────
  doTsumo(playerIdx) {
    if (this.phase !== 'playing') return;
    if (this.currentTurn !== playerIdx) return;
    const p = this.players[playerIdx];
    if (isWinningHand(p.hand)) {
      this.endGame('win', playerIdx, true);
    }
  }

  nextTurn() {
    this.phase = 'playing';
    const next = (this.currentTurn + 1) % this.players.length;
    this.doDrawTile(next);
  }

  // ── End Game ───────────────────────────────────────────────
  endGame(reason, winnerIdx, isTsumo = false) {
    this.phase = 'ended';
    clearTimeout(this.actionTimer);
    let scoreChange = 0;
    if (reason === 'win') {
      const p = this.players[winnerIdx];
      const fan = calcScore(p.hand, p.melds, this.lastDiscard, isTsumo, this.isHK);
      scoreChange = fan * 100;
      p.score += scoreChange;
      // deduct from others
      const losers = isTsumo ? this.players.filter((_,i) => i !== winnerIdx) : [];
      if (this.lastDiscardFrom !== -1 && !isTsumo) {
        const loser = this.players[this.lastDiscardFrom];
        if (loser) { loser.score -= scoreChange; }
      }
      losers.forEach(l => { l.score -= Math.ceil(scoreChange / (this.players.length - 1)); });
    }
    this.broadcast({
      type: 'game_end', reason,
      winnerIdx: winnerIdx !== undefined ? winnerIdx : -1,
      isTsumo,
      scoreChange,
      hands: this.players.map(p => ({ id: p.id, name: p.name, hand: p.hand, melds: p.melds, score: p.score }))
    });
  }

  // ── Helpers ────────────────────────────────────────────────
  sendAllHands() {
    this.players.forEach((p, i) => this.sendHand(i));
  }
  sendHand(idx) {
    const p = this.players[idx];
    send(p.ws, { type: 'hand_update', hand: p.hand, playerIdx: idx });
  }
  broadcastState() {
    this.broadcast({
      type: 'state_update',
      phase: this.phase,
      currentTurn: this.currentTurn,
      deckLeft: this.deck.length,
      discard: this.discard,
      players: this.players.map(p => ({
        id: p.id, name: p.name, score: p.score,
        handCount: p.hand.length, melds: p.melds, tenpai: p.tenpai
      }))
    });
  }
  broadcast(obj) { broadcast(this.players, obj); }
}

function checkCanChow(hand, tile) {
  const suit = tile.slice(-1);
  const num  = parseInt(tile);
  if (isNaN(num) || !SUITS.includes(suit)) return false;
  const has = n => hand.includes(n + suit);
  return (has(num-2) && has(num-1)) || (has(num-1) && has(num+1)) || (has(num+1) && has(num+2));
}

// ─── WebSocket ────────────────────────────────────────────────
const rooms   = new Map();
const clients = new Map(); // ws -> { playerId, roomCode, name }

wss.on('connection', ws => {
  clients.set(ws, { playerId: null, roomCode: null, name: null });

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const ctx = clients.get(ws);

    switch (msg.type) {

      case 'create_room': {
        let code = genCode();
        while (rooms.has(code)) code = genCode();
        const room = new Room(code, msg.mode, msg.playerId, msg.name);
        room.players[0].ws = ws;
        rooms.set(code, room);
        ctx.playerId = msg.playerId;
        ctx.roomCode = code;
        ctx.name     = msg.name;
        send(ws, { type: 'room_created', code, mode: msg.mode,
          players: [{ id: msg.playerId, name: msg.name }] });
        break;
      }

      case 'join_room': {
        const room = rooms.get(msg.code);
        if (!room)                        { send(ws, { type: 'error', msg: '找不到此房間' }); return; }
        if (room.players.length >= room.maxPlayers) { send(ws, { type: 'error', msg: '房間已滿' }); return; }
        if (room.phase !== 'waiting')     { send(ws, { type: 'error', msg: '遊戲已開始' }); return; }
        room.addPlayer(msg.playerId, msg.name, ws);
        ctx.playerId = msg.playerId;
        ctx.roomCode = msg.code;
        ctx.name     = msg.name;
        room.broadcast({ type: 'player_joined', name: msg.name,
          players: room.players.map(p => ({ id: p.id, name: p.name })),
          count: room.players.length, max: room.maxPlayers });
        send(ws, { type: 'joined_room', code: msg.code, mode: room.mode,
          players: room.players.map(p => ({ id: p.id, name: p.name })) });
        break;
      }

      case 'start_game': {
        const room = rooms.get(ctx.roomCode);
        if (!room) return;
        if (room.players[0].id !== ctx.playerId) { send(ws, { type: 'error', msg: '只有房主能開始' }); return; }
        if (room.players.length < 2)             { send(ws, { type: 'error', msg: `至少需要2位玩家` }); return; }
        room.startGame();
        break;
      }

      case 'discard': {
        const room = rooms.get(ctx.roomCode);
        if (!room) return;
        const idx = room.players.findIndex(p => p.id === ctx.playerId);
        if (idx !== room.currentTurn || room.phase !== 'playing') return;
        room.doDiscard(idx, msg.tile);
        break;
      }

      case 'tsumo': {
        const room = rooms.get(ctx.roomCode);
        if (!room) return;
        const idx = room.players.findIndex(p => p.id === ctx.playerId);
        room.doTsumo(idx);
        break;
      }

      case 'action': {
        const room = rooms.get(ctx.roomCode);
        if (!room || room.phase !== 'action') return;
        const idx = room.players.findIndex(p => p.id === ctx.playerId);
        room.doAction(idx, msg.action, msg.tiles || []);
        break;
      }

      case 'restart': {
        const room = rooms.get(ctx.roomCode);
        if (!room) return;
        if (room.players[0].id !== ctx.playerId) return;
        room.phase = 'waiting';
        room.startGame();
        break;
      }
    }
  });

  ws.on('close', () => {
    const ctx = clients.get(ws);
    if (ctx?.roomCode) {
      const room = rooms.get(ctx.roomCode);
      if (room) {
        room.broadcast({ type: 'player_left', name: ctx.name });
        if (room.players.every(p => !p.ws || p.ws.readyState !== 1)) rooms.delete(ctx.roomCode);
      }
    }
    clients.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🀄 小麻將 http://localhost:${PORT}`));
