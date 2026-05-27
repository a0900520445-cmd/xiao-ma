const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const rooms = new Map();
const clients = new Map();

/* ------------------ 工具 ------------------ */
function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/* ------------------ 麻將牌 ------------------ */
const SUITS = ["m", "p", "s"];
const HONORS = ["東", "南", "西", "北", "中", "發", "白"];

function buildDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (let n = 1; n <= 9; n++) {
      for (let i = 0; i < 4; i++) deck.push(`${n}${s}`);
    }
  }
  for (const h of HONORS) {
    for (let i = 0; i < 4; i++) deck.push(h);
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ------------------ 房間 ------------------ */
class Room {
  constructor(code, hostId, hostName) {
    this.code = code;
    this.hostId = hostId;
    this.players = [{ id: hostId, name: hostName, hand: [], ws: null }];
    this.deck = [];
    this.turn = 0;
    this.started = false;
  }

  addPlayer(id, name, ws) {
    if (this.players.length >= 4) return false;
    this.players.push({ id, name, hand: [], ws });
    return true;
  }

  start() {
    this.deck = shuffle(buildDeck());

    // 發牌
    this.players.forEach(p => {
      p.hand = this.deck.splice(0, 13);
    });

    this.started = true;
    this.broadcast({
      type: "start",
      players: this.players.map(p => ({ id: p.id, name: p.name }))
    });

    this.sendTurn();
  }

  sendTurn() {
    const p = this.players[this.turn];
    const tile = this.deck.pop();
    p.hand.push(tile);

    p.ws?.send(JSON.stringify({
      type: "your_turn",
      hand: p.hand,
      drawn: tile
    }));

    this.broadcast({
      type: "state",
      turn: this.turn,
      deck: this.deck.length
    });
  }

  nextTurn() {
    this.turn = (this.turn + 1) % this.players.length;
    this.sendTurn();
  }

  discard(playerId, tile) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== this.turn) return;

    const p = this.players[idx];
    const i = p.hand.indexOf(tile);
    if (i === -1) return;

    p.hand.splice(i, 1);

    this.broadcast({
      type: "discard",
      player: idx,
      tile
    });

    this.nextTurn();
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    this.players.forEach(p => {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(data);
      }
    });
  }
}

/* ------------------ WebSocket ------------------ */
wss.on("connection", (ws) => {
  clients.set(ws, { room: null, id: null });

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    const ctx = clients.get(ws);

    /* 建房 */
    if (data.type === "create") {
      const code = genCode();
      const room = new Room(code, data.id, data.name);
      room.players[0].ws = ws;

      rooms.set(code, room);

      ctx.room = code;
      ctx.id = data.id;

      ws.send(JSON.stringify({ type: "created", code }));
    }

    /* 加房 */
    if (data.type === "join") {
      const room = rooms.get(data.code);
      if (!room) return;

      room.addPlayer(data.id, data.name, ws);

      ctx.room = data.code;
      ctx.id = data.id;

      room.broadcast({
        type: "join",
        name: data.name
      });
    }

    /* 開始 */
    if (data.type === "start") {
      const room = rooms.get(ctx.room);
      if (!room) return;

      if (room.hostId !== ctx.id) return;

      room.start();
    }

    /* 出牌 */
    if (data.type === "discard") {
      const room = rooms.get(ctx.room);
      if (!room) return;

      room.discard(ctx.id, data.tile);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

/* ------------------ 啟動 ------------------ */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on", PORT);
});