const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

const players = {};
const rooms = new Map();
const matchQueue = [];

const CHAR_STATS = {
  mango: { name:'芒妹', hp:300, atk:22, cd:1200, color:'#FF8C00', skillName:'芒果颶風' },
  peach: { name:'桃妹', hp:360, atk:16, cd:900, color:'#FF69B4', skillName:'桃花亂舞' },
  tea:   { name:'茶妹', hp:260, atk:26, cd:1000, color:'#3CB371', skillName:'抹茶爆擊' },
  mimi:  { name:'米米', hp:420, atk:14, cd:800, color:'#D4B483', skillName:'米粒風暴' },
  lemon: { name:'檸檬酸', hp:240, atk:30, cd:1400, color:'#FFD700', skillName:'酸液噴射' },
};

function calcDmg(atk, level) {
  const mul = 1 + (level - 1) * 0.18;
  return Math.floor((atk + Math.random() * 10) * mul);
}

// ✅ 修正後 createRoom（只保留一個）
function createRoom(p1Id, p2Id, mode) {
  const roomId = uuidv4();
  const p1 = players[p1Id], p2 = players[p2Id];

  const s1 = CHAR_STATS[p1.character] || CHAR_STATS.mango;
  const s2 = CHAR_STATS[p2.character] || CHAR_STATS.mango;

  const room = {
    id: roomId,
    mode,
    players: [p1Id, p2Id],
    status: 'fighting',
    round: 1,
    state: {
      [p1Id]: { hp: s1.hp, maxHp: s1.hp, atk: s1.atk, level: 1, wins: 0, lastSkill: 0, cd: s1.cd },
      [p2Id]: { hp: s2.hp, maxHp: s2.hp, atk: s2.atk, level: 1, wins: 0, lastSkill: 0, cd: s2.cd },
    }
  };

  rooms.set(roomId, room);

  players[p1Id].roomId = roomId;
  players[p2Id].roomId = roomId;

  return roomId;
}

function checkRoundEnd(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'fighting') return;

  const [p1Id, p2Id] = room.players;
  const s1 = room.state[p1Id];
  const s2 = room.state[p2Id];

  if (s1.hp > 0 && s2.hp > 0) return;

  room.status = 'roundEnd';
  const winnerId = s1.hp > 0 ? p1Id : p2Id;
  const loserId = s1.hp > 0 ? p2Id : p1Id;

  room.state[winnerId].wins++;

  io.to(roomId).emit('roundEnd', {
    winnerId,
    loserId,
    wins: {
      [p1Id]: room.state[p1Id].wins,
      [p2Id]: room.state[p2Id].wins
    }
  });

  if (room.state[winnerId].wins >= 3) {
    room.status = 'finished';
    io.to(roomId).emit('matchEnd', { winnerId, loserId });

    if (players[winnerId]) {
      players[winnerId].coins = (players[winnerId].coins || 100) + 50;
      io.to(winnerId).emit('coinsUpdate', { coins: players[winnerId].coins });
    }
  } else {
    io.to(winnerId).emit('levelUpPrompt', {});

    setTimeout(() => {
      if (!rooms.get(roomId)) return;

      room.state[p1Id].hp = room.state[p1Id].maxHp;
      room.state[p2Id].hp = room.state[p2Id].maxHp;
      room.state[p1Id].lastSkill = 0;
      room.state[p2Id].lastSkill = 0;

      room.round++;
      room.status = 'fighting';

      io.to(roomId).emit('newRound', {
        round: room.round,
        state: room.state
      });
    }, 3500);
  }
}

io.on('connection', socket => {
  console.log('[+]', socket.id);

  socket.on('register', ({ username }) => {
    players[socket.id] = {
      id: socket.id,
      username,
      coins: 100,
      character: null,
      roomId: null
    };

    socket.emit('registered', { playerId: socket.id, coins: 100 });
  });

  socket.on('joinSoloQueue', ({ character }) => {
    const p = players[socket.id];
    if (!p) return;

    p.character = character;

    const botId = 'BOT_' + uuidv4();
    const botChar = Object.keys(CHAR_STATS)[Math.floor(Math.random() * 5)];

    players[botId] = {
      id: botId,
      username: 'CPU',
      character: botChar,
      isBot: true
    };

    const roomId = createRoom(socket.id, botId, 'solo');
    socket.join(roomId);

    socket.emit('matchFound', {
      roomId,
      yourId: socket.id,
      state: rooms.get(roomId).state
    });

    startBotLoop(roomId, botId, socket.id);
  });

  socket.on('useSkill', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const st = room.state[socket.id];
    if (!st) return;

    const now = Date.now();
    if (now - st.lastSkill < st.cd) return;

    st.lastSkill = now;

    const [p1Id, p2Id] = room.players;
    const enemy = socket.id === p1Id ? p2Id : p1Id;

    const dmg = calcDmg(st.atk, st.level || 1);
    room.state[enemy].hp -= dmg;

    io.to(roomId).emit('battleUpdate', {
      attackerId: socket.id,
      defenderId: enemy,
      damage: dmg,
      state: room.state
    });

    checkRoundEnd(roomId);
  });
});

// ✅ Bot loop（補齊你原本缺的）
function startBotLoop(roomId, botId, humanId) {
  const interval = setInterval(() => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'finished') return clearInterval(interval);

    const bst = room.state[botId];
    const hst = room.state[humanId];
    if (!bst || !hst) return;

    const now = Date.now();
    if (now - bst.lastSkill < bst.cd) return;

    bst.lastSkill = now;

    const dmg = calcDmg(bst.atk, bst.level || 1);
    hst.hp -= dmg;

    io.to(roomId).emit('battleUpdate', {
      attackerId: botId,
      defenderId: humanId,
      damage: dmg,
      state: room.state
    });

    checkRoundEnd(roomId);
  }, 1500);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('server running'));
