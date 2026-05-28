const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, "public")));

const players = {};
const rooms   = {};
const matchQueue = [];

const CHAR_STATS = {
  mango: { name:'芒妹',   hp:300, atk:22, cd:1200, color:'#FF8C00', skillName:'芒果颶風' },
  peach: { name:'桃妹',   hp:360, atk:16, cd:900,  color:'#FF69B4', skillName:'桃花亂舞' },
  tea:   { name:'茶妹',   hp:260, atk:26, cd:1000, color:'#3CB371', skillName:'抹茶爆擊' },
  mimi:  { name:'米米',   hp:420, atk:14, cd:800,  color:'#D4B483', skillName:'米粒風暴' },
  lemon: { name:'檸檬酸', hp:240, atk:30, cd:1400, color:'#FFD700', skillName:'酸液噴射' },
};

function calcDmg(atk, level) {
  const mul = 1 + (level - 1) * 0.18;
  return Math.floor((atk + Math.random() * 10) * mul);
}

function createRoom(p1Id, p2Id, mode) {
  const roomId = uuidv4();
  const p1 = players[p1Id], p2 = players[p2Id];
  const s1 = CHAR_STATS[p1.character] || CHAR_STATS.mango;
  const s2 = CHAR_STATS[p2.character] || CHAR_STATS.mango;
  rooms[roomId] = {
    id: roomId, mode,
    players: [p1Id, p2Id],
    status: 'fighting',
    round: 1,
    state: {
      [p1Id]: { hp: s1.hp, maxHp: s1.hp, atk: s1.atk, level: 1, wins: 0, lastSkill: 0, cd: s1.cd },
      [p2Id]: { hp: s2.hp, maxHp: s2.hp, atk: s2.atk, level: 1, wins: 0, lastSkill: 0, cd: s2.cd },
    }
  };
  players[p1Id].roomId = roomId;
  players[p2Id].roomId = roomId;
  return roomId;
}

function checkRoundEnd(roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'fighting') return;
  const [p1Id, p2Id] = room.players;
  const s1 = room.state[p1Id], s2 = room.state[p2Id];
  if (s1.hp > 0 && s2.hp > 0) return;

  room.status = 'roundEnd';
  const winnerId = s1.hp > 0 ? p1Id : p2Id;
  const loserId  = s1.hp > 0 ? p2Id : p1Id;
  room.state[winnerId].wins++;

  io.to(roomId).emit('roundEnd', {
    winnerId, loserId,
    wins: { [p1Id]: room.state[p1Id].wins, [p2Id]: room.state[p2Id].wins }
  });

  if (room.state[winnerId].wins >= 3) {
    room.status = 'finished';
    io.to(roomId).emit('matchEnd', { winnerId, loserId });
    if (players[winnerId]) {
      players[winnerId].coins = (players[winnerId].coins || 100) + 50;
      io.to(winnerId).emit('coinsUpdate', { coins: players[winnerId].coins });
    }
  } else {
    // winner gets level-up prompt, then new round
    io.to(winnerId).emit('levelUpPrompt', {});
    setTimeout(() => {
      if (!rooms[roomId]) return;
      const c1 = CHAR_STATS[players[p1Id]?.character] || CHAR_STATS.mango;
      const c2 = CHAR_STATS[players[p2Id]?.character] || CHAR_STATS.mango;
      room.state[p1Id].hp = room.state[p1Id].maxHp;
      room.state[p2Id].hp = room.state[p2Id].maxHp;
      room.state[p1Id].lastSkill = 0;
      room.state[p2Id].lastSkill = 0;
      room.round++;
      room.status = 'fighting';
      io.to(roomId).emit('newRound', { round: room.round, state: room.state });
    }, 3500);
  }
}

io.on('connection', socket => {
  console.log('[+]', socket.id);

  socket.on('register', ({ username, googleAccount }) => {
    players[socket.id] = { id: socket.id, username, googleAccount, coins: 100, character: null, roomId: null, dailyStreak: 1, lastClaimed: null };
    socket.emit('registered', { playerId: socket.id, coins: 100, dailyStreak: 1 });
  });

  socket.on('claimDaily', () => {
    const p = players[socket.id]; if (!p) return;
    const today = new Date().toDateString();
    if (p.lastClaimed === today) { socket.emit('dailyResult', { success: false, msg: '今天已領取過了！' }); return; }
    const rewards = [30,40,50,60,70,80,100];
    const streak  = Math.min(p.dailyStreak || 1, 7);
    const reward  = rewards[streak - 1];
    p.coins = (p.coins || 100) + reward;
    p.lastClaimed = today;
    p.dailyStreak = p.dailyStreak >= 7 ? 1 : p.dailyStreak + 1;
    socket.emit('dailyResult', { success: true, reward, coins: p.coins, nextStreak: p.dailyStreak });
  });

  socket.on('joinSoloQueue', ({ character }) => {
    const p = players[socket.id]; if (!p) return;
    p.character = character;
    const botId = 'BOT_' + uuidv4();
    const botChars = ['mango','peach','tea','mimi','lemon'];
    const botChar  = botChars[Math.floor(Math.random() * botChars.length)];
    players[botId] = { id: botId, username: 'CPU', isBot: true, character: botChar, coins: 0, roomId: null };
    const roomId = createRoom(socket.id, botId, 'solo');
    socket.join(roomId);
    const s1 = CHAR_STATS[character], s2 = CHAR_STATS[botChar];
    socket.emit('matchFound', {
      roomId,
      yourId: socket.id,
      players: [
        { id: socket.id, username: p.username,         character, stats: s1 },
        { id: botId,     username: players[botId].username, character: botChar, stats: s2 },
      ],
      state: rooms[roomId].state
    });
    // Bot loop
    startBotLoop(roomId, botId, socket.id);
  });

  socket.on('joinMultiQueue', ({ character }) => {
    const p = players[socket.id]; if (!p) return;
    p.character = character;
    const qi = matchQueue.findIndex(id => id === socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);
    matchQueue.push(socket.id);
    socket.emit('queueJoined', { position: matchQueue.length });
    if (matchQueue.length >= 2) {
      const p1Id = matchQueue.shift(), p2Id = matchQueue.shift();
      if (!players[p1Id] || !players[p2Id]) return;
      const roomId = createRoom(p1Id, p2Id, 'pvp');
      const s1 = io.sockets.sockets.get(p1Id), s2 = io.sockets.sockets.get(p2Id);
      if (s1) s1.join(roomId);
      if (s2) s2.join(roomId);
      const pi1 = players[p1Id], pi2 = players[p2Id];
      const matchData = {
        roomId,
        players: [
          { id: p1Id, username: pi1.username, character: pi1.character, stats: CHAR_STATS[pi1.character] },
          { id: p2Id, username: pi2.username, character: pi2.character, stats: CHAR_STATS[pi2.character] },
        ],
        state: rooms[roomId].state
      };
      if (s1) { s1.emit('matchFound', { ...matchData, yourId: p1Id }); }
      if (s2) { s2.emit('matchFound', { ...matchData, yourId: p2Id }); }
    }
  });

  // Real-time skill: no turn system — cooldown only
  socket.on('useSkill', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'fighting') return;
    const attackerId = socket.id;
    if (!room.state[attackerId]) return;

    const now = Date.now();
    const st  = room.state[attackerId];
    if (now - st.lastSkill < st.cd) {
      // still on cooldown — tell client remaining ms
      socket.emit('skillCooldown', { remaining: st.cd - (now - st.lastSkill) });
      return;
    }
    st.lastSkill = now;

    const [p1Id, p2Id] = room.players;
    const defenderId = attackerId === p1Id ? p2Id : p1Id;
    const defState   = room.state[defenderId];
    const atkChar    = CHAR_STATS[players[attackerId]?.character] || CHAR_STATS.mango;

    const dmg = calcDmg(st.atk, st.level);
    defState.hp = Math.max(0, defState.hp - dmg);

    io.to(roomId).emit('battleUpdate', {
      attackerId, defenderId, damage: dmg,
      skillName: atkChar.skillName,
      state: room.state,
      // tell attacker when cooldown expires
      cdFor: attackerId,
      cdMs: st.cd
    });

    checkRoundEnd(roomId);
  });

  socket.on('levelUpSkill', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    const s = room.state[socket.id]; if (!s) return;
    s.level++;
    s.atk   = Math.floor(s.atk * 1.18);
    s.maxHp = Math.floor(s.maxHp * 1.06);
    s.hp    = s.maxHp;
    s.cd    = Math.max(600, Math.floor(s.cd * 0.92));
    socket.emit('skillLeveled', { level: s.level, atk: s.atk, cd: s.cd });
    io.to(roomId).emit('battleUpdate', {
      attackerId: null, defenderId: null, damage: 0, skillName: '',
      state: room.state, levelUp: { playerId: socket.id, level: s.level }
    });
  });

  socket.on('leaveQueue', () => {
    const qi = matchQueue.findIndex(id => id === socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p?.roomId) {
      const room = rooms[p.roomId];
      if (room && room.status === 'fighting') {
        const otherId = room.players.find(id => id !== socket.id);
        if (otherId && players[otherId] && !players[otherId].isBot) {
          io.to(otherId).emit('opponentLeft');
        }
        room.status = 'finished';
      }
    }
    const qi = matchQueue.findIndex(id => id === socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);
    delete players[socket.id];
  });
});

// ── Bot loop (fires every ~1.5s with slight randomness) ──────────────────────
function startBotLoop(roomId, botId, humanId) {
  const interval = setInterval(() => {
    const room = rooms[roomId];
    if (!room || room.status === 'finished') { clearInterval(interval); return; }
    if (room.status !== 'fighting') return;

    const now = Date.now();
    const bst = room.state[botId];
    if (!bst) { clearInterval(interval); return; }
    if (now - bst.lastSkill < bst.cd) return;

    bst.lastSkill = now;
    const hst    = room.state[humanId];
    if (!hst) return;
    const botChar = CHAR_STATS[players[botId]?.character] || CHAR_STATS.mango;
    const dmg = calcDmg(bst.atk, bst.level);
    hst.hp = Math.max(0, hst.hp - dmg);

    io.to(roomId).emit('battleUpdate', {
      attackerId: botId, defenderId: humanId, damage: dmg,
      skillName: botChar.skillName,
      state: room.state,
      cdFor: botId, cdMs: bst.cd
    });
    checkRoundEnd(roomId);
  }, 1500 + Math.random() * 600);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🍋 水果大戰爭 http://localhost:${PORT}`));
EOF
echo "server.js done"
