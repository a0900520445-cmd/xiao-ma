const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();

// ⭐ 重點：指向 public 資料夾
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    console.log("玩家連線");

    ws.on("message", (msg) => {
        wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(msg.toString());
            }
        });
    });
});

server.listen(3000, () => {
    console.log("http://localhost:3000");
});
