const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ─── In-memory stores ───────────────────────────────────────────────────────
const players = {};      // socketId -> playerData
const rooms = {};        // roomId   -> roomData
const matchQueue = [];   // waiting players for multi-player matchmaking
const soloQueue = [];    // waiting players for solo mode

// ─── Helpers ────────────────────────────────────────────────────────────────
function getCharacterStats(charId) {
  const chars = {
    mango:  { name: '芒妹',   emoji: '🥭', hp: 100, atk: 18, speed: 12, color: '#FF8C00', skillName: '芒果颶風' },
    peach:  { name: '桃妹',   emoji: '🍑', hp: 120, atk: 14, speed: 10, color: '#FF69B4', skillName: '桃花亂舞' },
    tea:    { name: '茶妹',   emoji: '🍵', hp: 90,  atk: 20, speed: 15, color: '#3CB371', skillName: '抹茶爆擊' },
    mimi:   { name: '米米',   emoji: '🍚', hp: 130, atk: 12, speed: 8,  color: '#F5DEB3', skillName: '米粒風暴' },
    lemon:  { name: '檸檬酸', emoji: '🍋', hp: 85,  atk: 22, speed: 18, color: '#FFD700', skillName: '酸液噴射' }
  };
  return chars[charId] || chars.mango;
}

function calcDamage(attackerLevel, baseAtk) {
  const multiplier = 1 + (attackerLevel - 1) * 0.15;
  return Math.floor((baseAtk + Math.random() * 8) * multiplier);
}

function createRoom(p1Id, p2Id, mode = 'pvp') {
  const roomId = uuidv4();
  const p1 = players[p1Id];
  const p2 = players[p2Id];

  const p1Stats = getCharacterStats(p1.character);
  const p2Stats = getCharacterStats(p2.character);

  rooms[roomId] = {
    id: roomId,
    mode,
    players: [p1Id, p2Id],
    state: {
      [p1Id]: { hp: p1Stats.hp, maxHp: p1Stats.hp, level: 1, atk: p1Stats.atk, wins: 0, skillReady: true, shield: 0 },
      [p2Id]: { hp: p2Stats.hp, maxHp: p2Stats.hp, level: 1, atk: p2Stats.atk, wins: 0, skillReady: true, shield: 0 }
    },
    turn: p1Id,
    round: 1,
    lastAction: null,
    status: 'fighting'
  };

  players[p1Id].roomId = roomId;
  players[p2Id].roomId = roomId;

  return roomId;
}

function checkRoundEnd(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const [p1Id, p2Id] = room.players;
  const s1 = room.state[p1Id];
  const s2 = room.state[p2Id];

  if (s1.hp <= 0 || s2.hp <= 0) {
    const winnerId = s1.hp > 0 ? p1Id : p2Id;
    const loserId  = s1.hp > 0 ? p2Id : p1Id;

    room.state[winnerId].wins += 1;

    io.to(roomId).emit('roundEnd', {
      winnerId,
      loserId,
      wins: { [p1Id]: room.state[p1Id].wins, [p2Id]: room.state[p2Id].wins }
    });

    if (room.state[winnerId].wins >= 3) {
      // Match over
      room.status = 'finished';
      io.to(roomId).emit('matchEnd', { winnerId, loserId });

      // Award currency to winner
      if (players[winnerId]) {
        players[winnerId].coins = (players[winnerId].coins || 100) + 50;
        io.to(winnerId).emit('coinsUpdate', { coins: players[winnerId].coins });
      }
    } else {
      // Reset HP for next round, winner gets to level up skill
      setTimeout(() => {
        const wp1Stats = getCharacterStats(players[p1Id]?.character || 'mango');
        const wp2Stats = getCharacterStats(players[p2Id]?.character || 'mango');
        room.state[p1Id].hp = room.state[p1Id].maxHp;
        room.state[p2Id].hp = room.state[p2Id].maxHp;
        room.state[p1Id].shield = 0;
        room.state[p2Id].shield = 0;
        room.round += 1;
        room.turn = p1Id;
        room.status = 'fighting';

        io.to(roomId).emit('newRound', {
          round: room.round,
          state: room.state,
          turn: room.turn
        });
        io.to(winnerId).emit('levelUpPrompt', { level: room.state[winnerId].level + 1 });
      }, 2000);
    }
  }
}

// ─── Socket events ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Register player ──────────────────────────────────────────────────────
  socket.on('register', ({ username, googleAccount }) => {
    players[socket.id] = {
      id: socket.id,
      username,
      googleAccount,
      coins: 100,
      character: null,
      roomId: null,
      dailyStreak: 1,
      lastClaimed: null
    };
    console.log(`[REG] ${username} (${googleAccount})`);
    socket.emit('registered', { playerId: socket.id, coins: 100, dailyStreak: 1 });
  });

  // ── Daily claim ──────────────────────────────────────────────────────────
  socket.on('claimDaily', () => {
    const p = players[socket.id];
    if (!p) return;

    const now = new Date();
    const today = now.toDateString();

    if (p.lastClaimed === today) {
      socket.emit('dailyResult', { success: false, msg: '今天已領取過了！' });
      return;
    }

    const rewards = [30, 40, 50, 60, 70, 80, 100];
    const streak = Math.min((p.dailyStreak || 1), 7);
    const reward = rewards[streak - 1];

    p.coins = (p.coins || 100) + reward;
    p.lastClaimed = today;

    // Advance streak (cycle back after day 7)
    if (p.dailyStreak >= 7) p.dailyStreak = 1;
    else p.dailyStreak += 1;

    socket.emit('dailyResult', { success: true, reward, coins: p.coins, nextStreak: p.dailyStreak });
  });

  // ── Solo matchmaking ─────────────────────────────────────────────────────
  socket.on('joinSoloQueue', ({ character }) => {
    const p = players[socket.id];
    if (!p) return;
    p.character = character;

    // Create a bot player
    const botId = 'BOT_' + uuidv4();
    const botChars = ['mango','peach','tea','mimi','lemon'];
    const botChar = botChars[Math.floor(Math.random() * botChars.length)];

    players[botId] = {
      id: botId,
      username: 'CPU-' + botChar,
      isBot: true,
      character: botChar,
      coins: 0,
      roomId: null
    };

    const roomId = createRoom(socket.id, botId, 'solo');
    socket.join(roomId);

    const p1Stats = getCharacterStats(character);
    const p2Stats = getCharacterStats(botChar);

    socket.emit('matchFound', {
      roomId,
      players: [
        { id: socket.id,  username: p.username,         character, stats: p1Stats },
        { id: botId,      username: players[botId].username, character: botChar, stats: p2Stats }
      ],
      yourId: socket.id,
      turn: rooms[roomId].turn
    });
  });

  // ── Multiplayer matchmaking ──────────────────────────────────────────────
  socket.on('joinMultiQueue', ({ character }) => {
    const p = players[socket.id];
    if (!p) return;
    p.character = character;

    // Remove if already in queue
    const idx = matchQueue.findIndex(id => id === socket.id);
    if (idx !== -1) matchQueue.splice(idx, 1);

    matchQueue.push(socket.id);
    socket.emit('queueJoined', { position: matchQueue.length });

    // Try to pair
    if (matchQueue.length >= 2) {
      const p1Id = matchQueue.shift();
      const p2Id = matchQueue.shift();

      if (!players[p1Id] || !players[p2Id]) return;

      const roomId = createRoom(p1Id, p2Id, 'pvp');

      const s1 = io.sockets.sockets.get(p1Id);
      const s2 = io.sockets.sockets.get(p2Id);
      if (s1) s1.join(roomId);
      if (s2) s2.join(roomId);

      const p1Info = players[p1Id];
      const p2Info = players[p2Id];
      const p1Stats = getCharacterStats(p1Info.character);
      const p2Stats = getCharacterStats(p2Info.character);

      io.to(roomId).emit('matchFound', {
        roomId,
        players: [
          { id: p1Id, username: p1Info.username, character: p1Info.character, stats: p1Stats },
          { id: p2Id, username: p2Info.username, character: p2Info.character, stats: p2Stats }
        ],
        turn: rooms[roomId].turn
      });

      // Tell each player their own ID
      if (s1) s1.emit('yourId', { yourId: p1Id });
      if (s2) s2.emit('yourId', { yourId: p2Id });
    }
  });

  // ── Use skill ────────────────────────────────────────────────────────────
  socket.on('useSkill', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'fighting') return;

    const attackerId = socket.id;
    if (room.turn !== attackerId) {
      socket.emit('notYourTurn'); return;
    }

    const [p1Id, p2Id] = room.players;
    const defenderId = attackerId === p1Id ? p2Id : p1Id;

    const attacker = room.state[attackerId];
    const defender = room.state[defenderId];
    const attackerChar = getCharacterStats(players[attackerId]?.character || 'mango');

    let damage = calcDamage(attacker.level, attacker.atk);

    // Shield absorbs damage
    if (defender.shield > 0) {
      const absorbed = Math.min(defender.shield, damage);
      damage -= absorbed;
      defender.shield -= absorbed;
    }

    defender.hp = Math.max(0, defender.hp - damage);

    room.lastAction = { type: 'skill', attackerId, defenderId, damage };
    room.turn = defenderId;

    io.to(roomId).emit('battleUpdate', {
      action: { type: 'skill', attackerId, damage, skillName: attackerChar.skillName },
      state: room.state,
      turn: room.turn
    });

    // Bot auto-response
    const isBot = players[defenderId]?.isBot;
    if (isBot && room.status === 'fighting' && defender.hp > 0) {
      setTimeout(() => {
        if (!rooms[roomId] || rooms[roomId].status !== 'fighting') return;
        const botChar = getCharacterStats(players[defenderId]?.character || 'mango');
        const botAtk = room.state[defenderId];
        const playerDef = room.state[attackerId];
        let botDmg = calcDamage(botAtk.level, botAtk.atk);
        if (playerDef.shield > 0) {
          const abs = Math.min(playerDef.shield, botDmg);
          botDmg -= abs;
          playerDef.shield -= abs;
        }
        playerDef.hp = Math.max(0, playerDef.hp - botDmg);
        room.lastAction = { type: 'skill', attackerId: defenderId, defenderId: attackerId, damage: botDmg };
        room.turn = attackerId;

        io.to(roomId).emit('battleUpdate', {
          action: { type: 'skill', attackerId: defenderId, damage: botDmg, skillName: botChar.skillName },
          state: room.state,
          turn: room.turn
        });
        checkRoundEnd(roomId);
      }, 1200);
    }

    checkRoundEnd(roomId);
  });

  // ── Level up skill ───────────────────────────────────────────────────────
  socket.on('levelUpSkill', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const s = room.state[socket.id];
    if (!s) return;
    s.level += 1;
    s.atk = Math.floor(s.atk * 1.15);
    s.maxHp = Math.floor(s.maxHp * 1.05);
    s.hp = s.maxHp;
    socket.emit('skillLeveled', { level: s.level, atk: s.atk });
    io.to(roomId).emit('battleUpdate', { state: room.state, turn: room.turn, action: { type: 'levelUp', playerId: socket.id, level: s.level } });
  });

  // ── Leave queue ──────────────────────────────────────────────────────────
  socket.on('leaveQueue', () => {
    const idx = matchQueue.findIndex(id => id === socket.id);
    if (idx !== -1) matchQueue.splice(idx, 1);
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p && p.roomId) {
      const room = rooms[p.roomId];
      if (room && room.status === 'fighting') {
        const otherId = room.players.find(id => id !== socket.id);
        if (otherId && players[otherId] && !players[otherId].isBot) {
          io.to(otherId).emit('opponentLeft');
        }
        room.status = 'finished';
      }
    }
    // Remove from matchQueue
    const qi = matchQueue.findIndex(id => id === socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);

    delete players[socket.id];
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🍋 水果大戰爭 server running on http://localhost:${PORT}`);
});
