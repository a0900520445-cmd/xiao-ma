const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();

app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection",(ws)=>{

    console.log("玩家加入");

    ws.on("message",(msg)=>{

        console.log(msg.toString());

        wss.clients.forEach(client=>{

            if(client.readyState === 1){
                client.send(msg.toString());
            }

        });

    });

});

server.listen(3000,()=>{
    console.log("Server running: http://localhost:3000");
});
