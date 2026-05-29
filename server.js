const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const players    = {};   // socketId  -> player
const rooms      = {};   // roomId    -> room
const matchQueue = [];   // pvp queue

// ── Character base stats ──────────────────────────────
const STATS = {
  mango:{ name:'芒妹',   hp:300, atk:22, cd:1200, skillName:'芒果颶風' },
  peach:{ name:'桃妹',   hp:360, atk:16, cd:900,  skillName:'桃花亂舞' },
  tea:  { name:'茶妹',   hp:260, atk:26, cd:1000, skillName:'抹茶爆擊' },
  mimi: { name:'米米',   hp:420, atk:14, cd:800,  skillName:'米粒風暴' },
  lemon:{ name:'檸檬酸', hp:240, atk:30, cd:1400, skillName:'酸液噴射' },
};

function statOf(charId) { return STATS[charId] || STATS.mango; }

function calcDmg(atk, level) {
  const mul = 1 + (level - 1) * 0.18;
  return Math.floor((atk + Math.random() * 10) * mul);
}

// ── Create room ───────────────────────────────────────
function createRoom(p1Id, p2Id, mode) {
  const roomId = uuidv4();
  const s1 = statOf(players[p1Id].character);
  const s2 = statOf(players[p2Id].character);
  rooms[roomId] = {
    id: roomId, mode, round: 1, status: 'fighting',
    players: [p1Id, p2Id],
    state: {
      [p1Id]: { hp:s1.hp, maxHp:s1.hp, atk:s1.atk, cd:s1.cd, level:1, wins:0, lastSkill:0 },
      [p2Id]: { hp:s2.hp, maxHp:s2.hp, atk:s2.atk, cd:s2.cd, level:1, wins:0, lastSkill:0 },
    }
  };
  players[p1Id].roomId = roomId;
  players[p2Id].roomId = roomId;
  return roomId;
}

// ── Check if round is over ────────────────────────────
function checkRoundEnd(roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'fighting') return;
  const [p1, p2] = room.players;
  const s1 = room.state[p1], s2 = room.state[p2];
  if (s1.hp > 0 && s2.hp > 0) return;

  room.status = 'roundEnd';
  const winnerId = s1.hp > 0 ? p1 : p2;
  const loserId  = s1.hp > 0 ? p2 : p1;
  room.state[winnerId].wins++;

  io.to(roomId).emit('roundEnd', {
    winnerId, loserId,
    wins: { [p1]: room.state[p1].wins, [p2]: room.state[p2].wins }
  });

  if (room.state[winnerId].wins >= 3) {
    room.status = 'finished';
    io.to(roomId).emit('matchEnd', { winnerId, loserId });
    const pw = players[winnerId];
    if (pw) {
      pw.coins = (pw.coins || 100) + 50;
      io.to(winnerId).emit('coinsUpdate', { coins: pw.coins });
    }
  } else {
    // Winner gets level-up prompt; new round starts after delay
    io.to(winnerId).emit('levelUpPrompt', {});
    setTimeout(() => {
      const r = rooms[roomId];
      if (!r) return;
      r.state[p1].hp = r.state[p1].maxHp;
      r.state[p2].hp = r.state[p2].maxHp;
      r.state[p1].lastSkill = 0;
      r.state[p2].lastSkill = 0;
      r.round++;
      r.status = 'fighting';
      io.to(roomId).emit('newRound', { round: r.round, state: r.state });
    }, 3500);
  }
}

// ── Bot auto-attack loop ──────────────────────────────
function startBotLoop(roomId, botId, humanId) {
  const iv = setInterval(() => {
    const room = rooms[roomId];
    if (!room) { clearInterval(iv); return; }
    if (room.status === 'finished') { clearInterval(iv); return; }
    if (room.status !== 'fighting') return;

    const bst = room.state[botId];
    if (!bst) { clearInterval(iv); return; }

    const now = Date.now();
    if (now - bst.lastSkill < bst.cd) return;
    bst.lastSkill = now;

    const hst = room.state[humanId];
    if (!hst) return;

    const dmg = calcDmg(bst.atk, bst.level);
    hst.hp = Math.max(0, hst.hp - dmg);

    const botChar = players[botId] && players[botId].character;
    const sk = statOf(botChar).skillName;

    io.to(roomId).emit('battleUpdate', {
      attackerId: botId, defenderId: humanId,
      damage: dmg, skillName: sk,
      state: room.state,
      cdFor: null, cdMs: bst.cd
    });
    checkRoundEnd(roomId);
  }, 1400 + Math.random() * 600);
}

// ═══════════════════════════════════════════════════════
//  Socket events
// ═══════════════════════════════════════════════════════
io.on('connection', socket => {
  console.log('[+]', socket.id);

  // ── Register ────────────────────────────────────────
  socket.on('register', ({ username, googleAccount }) => {
    players[socket.id] = {
      id: socket.id, username, googleAccount,
      coins: 100, character: null, roomId: null,
      dailyStreak: 1, lastClaimed: null
    };
    socket.emit('registered', { playerId: socket.id, coins: 100, dailyStreak: 1 });
    console.log('[REG]', username);
  });

  // ── Daily ───────────────────────────────────────────
  socket.on('claimDaily', () => {
    const p = players[socket.id];
    if (!p) return;
    const today = new Date().toDateString();
    if (p.lastClaimed === today) {
      socket.emit('dailyResult', { success: false, msg: '今天已領取過了！' });
      return;
    }
    const rewards = [30,40,50,60,70,80,100];
    const streak  = Math.min(p.dailyStreak || 1, 7);
    const reward  = rewards[streak - 1];
    p.coins       = (p.coins || 100) + reward;
    p.lastClaimed = today;
    p.dailyStreak = p.dailyStreak >= 7 ? 1 : p.dailyStreak + 1;
    socket.emit('dailyResult', { success:true, reward, coins: p.coins, nextStreak: p.dailyStreak });
  });

  // ── Solo queue ──────────────────────────────────────
  socket.on('joinSoloQueue', ({ character }) => {
    const p = players[socket.id];
    if (!p) return;
    p.character = character;

    const botId   = 'BOT_' + uuidv4();
    const botKeys = Object.keys(STATS);
    const botChar = botKeys[Math.floor(Math.random() * botKeys.length)];
    players[botId] = { id:botId, username:'CPU', isBot:true, character:botChar, coins:0, roomId:null };

    const roomId = createRoom(socket.id, botId, 'solo');
    socket.join(roomId);

    socket.emit('matchFound', {
      roomId, yourId: socket.id,
      players: [
        { id: socket.id, username: p.username,         character,  stats: statOf(character) },
        { id: botId,     username: 'CPU',               character:botChar, stats: statOf(botChar) },
      ],
      state: rooms[roomId].state
    });

    startBotLoop(roomId, botId, socket.id);
  });

  // ── Multi queue ─────────────────────────────────────
  socket.on('joinMultiQueue', ({ character }) => {
    const p = players[socket.id];
    if (!p) return;
    p.character = character;

    // Dedup
    const qi = matchQueue.indexOf(socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);
    matchQueue.push(socket.id);
    socket.emit('queueJoined', { position: matchQueue.length });

    if (matchQueue.length >= 2) {
      const p1Id = matchQueue.shift();
      const p2Id = matchQueue.shift();
      if (!players[p1Id] || !players[p2Id]) return;

      const roomId = createRoom(p1Id, p2Id, 'pvp');
      const s1 = io.sockets.sockets.get(p1Id);
      const s2 = io.sockets.sockets.get(p2Id);
      if (s1) s1.join(roomId);
      if (s2) s2.join(roomId);

      const pi1 = players[p1Id], pi2 = players[p2Id];
      const base = {
        roomId,
        players: [
          { id:p1Id, username:pi1.username, character:pi1.character, stats:statOf(pi1.character) },
          { id:p2Id, username:pi2.username, character:pi2.character, stats:statOf(pi2.character) },
        ],
        state: rooms[roomId].state
      };
      if (s1) s1.emit('matchFound', { ...base, yourId: p1Id });
      if (s2) s2.emit('matchFound', { ...base, yourId: p2Id });
    }
  });

  // ── Use skill (real-time, cooldown only) ─────────────
  socket.on('useSkill', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'fighting') return;

    const attackerId = socket.id;
    const st = room.state[attackerId];
    if (!st) return;

    const now = Date.now();
    const elapsed = now - (st.lastSkill || 0);
    if (elapsed < st.cd) {
      socket.emit('skillCooldown', { remaining: st.cd - elapsed });
      return;
    }
    st.lastSkill = now;

    const [p1, p2] = room.players;
    const defenderId = attackerId === p1 ? p2 : p1;
    const dst = room.state[defenderId];
    if (!dst) return;

    const atkChar = players[attackerId] && players[attackerId].character;
    const sk = statOf(atkChar);
    const dmg = calcDmg(st.atk, st.level);
    dst.hp = Math.max(0, dst.hp - dmg);

    io.to(roomId).emit('battleUpdate', {
      attackerId, defenderId,
      damage: dmg, skillName: sk.skillName,
      state: room.state,
      cdFor: attackerId, cdMs: st.cd
    });

    checkRoundEnd(roomId);
  });

  // ── Level up ────────────────────────────────────────
  socket.on('levelUpSkill', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const st = room.state[socket.id];
    if (!st) return;
    st.level++;
    st.atk   = Math.floor(st.atk   * 1.18);
    st.maxHp = Math.floor(st.maxHp * 1.06);
    st.hp    = st.maxHp;
    st.cd    = Math.max(500, Math.floor(st.cd * 0.92));
    socket.emit('skillLeveled', { level: st.level, atk: st.atk, cd: st.cd });
    io.to(roomId).emit('battleUpdate', {
      attackerId: null, defenderId: null, damage: 0, skillName: '',
      state: room.state, cdFor: null, cdMs: 0,
      levelUp: { playerId: socket.id, level: st.level }
    });
  });

  // ── Leave queue ─────────────────────────────────────
  socket.on('leaveQueue', () => {
    const qi = matchQueue.indexOf(socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);
  });

  // ── Disconnect ──────────────────────────────────────
  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p && p.roomId) {
      const room = rooms[p.roomId];
      if (room && (room.status === 'fighting' || room.status === 'roundEnd')) {
        const otherId = room.players.find(id => id !== socket.id);
        if (otherId && players[otherId] && !players[otherId].isBot) {
          io.to(otherId).emit('opponentLeft');
        }
        room.status = 'finished';
      }
    }
    const qi = matchQueue.indexOf(socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);
    delete players[socket.id];
    console.log('[-]', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🍋 水果大戰爭 http://localhost:' + PORT));
