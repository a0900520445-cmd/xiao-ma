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


// ✅ ⭐ 這行是關鍵：public 靜態資料夾
app.use(express.static(path.join(__dirname, "public")));

// JSON API（可留可不留）
app.use(express.json());


// ─── In-memory stores ─────────────────────────────────────────────
const players = {};
const rooms = {};
const matchQueue = [];


// ─── 角色設定 ─────────────────────────────────────────────────────
function getCharacterStats(charId) {
  const chars = {
    mango:  { name: '芒妹', emoji: '🥭', hp: 100, atk: 18 },
    peach:  { name: '桃妹', emoji: '🍑', hp: 120, atk: 14 },
    tea:    { name: '茶妹', emoji: '🍵', hp: 90,  atk: 20 },
    mimi:   { name: '米米', emoji: '🍚', hp: 130, atk: 12 },
    lemon:  { name: '檸檬酸', emoji: '🍋', hp: 85,  atk: 22 }
  };
  return chars[charId] || chars.mango;
}


// ─── 建房間 ───────────────────────────────────────────────────────
function createRoom(p1Id, p2Id) {
  const roomId = uuidv4();

  const p1 = players[p1Id];
  const p2 = players[p2Id];

  const s1 = getCharacterStats(p1.character);
  const s2 = getCharacterStats(p2.character);

  rooms[roomId] = {
    id: roomId,
    players: [p1Id, p2Id],
    state: {
      [p1Id]: { hp: s1.hp, atk: s1.atk, level: 1 },
      [p2Id]: { hp: s2.hp, atk: s2.atk, level: 1 }
    },
    turn: p1Id,
    status: 'fighting'
  };

  p1.roomId = roomId;
  p2.roomId = roomId;

  return roomId;
}


// ─── Socket ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  console.log("玩家連線:", socket.id);

  // 登入
  socket.on('register', ({ username }) => {
    players[socket.id] = {
      id: socket.id,
      username,
      coins: 100,
      character: null,
      roomId: null
    };

    socket.emit('registered', { id: socket.id });
  });


  // 選角 + 單機/多人共用
  socket.on('joinMultiQueue', ({ character }) => {
    const p = players[socket.id];
    if (!p) return;

    p.character = character;

    matchQueue.push(socket.id);

    if (matchQueue.length >= 2) {

      const p1 = matchQueue.shift();
      const p2 = matchQueue.shift();

      const roomId = createRoom(p1, p2);

      io.to(p1).socketsJoin(roomId);
      io.to(p2).socketsJoin(roomId);

      io.to(roomId).emit('matchFound', {
        roomId,
        players: [p1, p2],
        turn: rooms[roomId].turn
      });
    }
  });


  // 攻擊
  socket.on('attack', ({ roomId }) => {

    const room = rooms[roomId];
    if (!room) return;

    if (room.turn !== socket.id) return;

    const [p1, p2] = room.players;
    const enemy = socket.id === p1 ? p2 : p1;

    room.state[enemy].hp -= room.state[socket.id].atk;

    room.turn = enemy;

    io.to(roomId).emit('update', {
      state: room.state,
      turn: room.turn
    });

    // 勝負
    if (room.state[enemy].hp <= 0) {
      io.to(roomId).emit('gameOver', { winner: socket.id });
    }
  });


  // 離線
  socket.on('disconnect', () => {
    delete players[socket.id];
  });

});


// ─── 啟動 ─────────────────────────────────────────────────────────
server.listen(3000, () => {
  console.log("🍋 Server running: http://localhost:3000");
});
