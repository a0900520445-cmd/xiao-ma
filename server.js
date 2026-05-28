// ═══════════════════════════════════════════════════════════════
//  小麻將 · server.js  ─  Node.js + WebSocket
//  Features: 好友桌, 快速配對, 排行榜, users.json, 完整麻將規則
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const http    = require('http');
const { WebSocketServer } = require('ws');
const path    = require('path');
const fs      = require('fs');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Users DB (users.json) ─────────────────────────────────────
const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveUsers(u) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2));
}

app.post('/api/login', (req, res) => {
  const { playerId, name } = req.body;
  if (!playerId || !name) return res.json({ ok: false });
  const users = loadUsers();
  if (!users[playerId]) {
    users[playerId] = { name, qi: 1200, wins: 0, losses: 0, games: 0, streak: 0, joinedAt: Date.now() };
  } else {
    users[playerId].name = name; // allow rename
  }
  saveUsers(users);
  res.json({ ok: true, data: users[playerId] });
});

app.get('/api/leaderboard', (_, res) => {
  const users = loadUsers();
  const list = Object.entries(users).map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => (b.wins - a.wins) || (b.qi - a.qi))
    .slice(0, 50);
  res.json(list);
});

app.post('/api/update', (req, res) => {
  const { playerId, delta } = req.body;
  const users = loadUsers();
  if (!users[playerId]) return res.json({ ok: false });
  Object.assign(users[playerId], delta);
  saveUsers(users);
  res.json({ ok: true, data: users[playerId] });
});

// ─── Helpers ──────────────────────────────────────────────────
function genCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
function wsSend(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function bcast(players, obj) {
  const s = JSON.stringify(obj);
  players.forEach(p => { if (p.ws && p.ws.readyState === 1) p.ws.send(s); });
}

// ─── Tile Engine ──────────────────────────────────────────────
const SUITS  = ['m','p','s'];
const HONORS = ['東','南','西','北','中','發','白'];
function buildDeck() {
  const d = [];
  for (const s of SUITS) for (let n=1;n<=9;n++) for (let k=0;k<4;k++) d.push(n+s);
  for (const h of HONORS) for (let k=0;k<4;k++) d.push(h);
  return d;
}
function shuffle(a) {
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
const SUIT_ORDER = { m:0, p:1, s:2 };
function sortHand(h) {
  return h.slice().sort((a,b)=>{
    const ai=HONORS.indexOf(a), bi=HONORS.indexOf(b);
    if(ai!==-1&&bi!==-1) return ai-bi;
    if(ai!==-1) return 1; if(bi!==-1) return -1;
    const as=a.slice(-1), bs=b.slice(-1);
    if(as!==bs) return SUIT_ORDER[as]-SUIT_ORDER[bs];
    return parseInt(a)-parseInt(b);
  });
}

// ─── Win Check ────────────────────────────────────────────────
function isWinHand(tiles) {
  const s = sortHand(tiles);
  for (let i=0;i<s.length-1;i++) {
    if (s[i]===s[i+1]) {
      const r=s.slice(); r.splice(i,2);
      if (canSets(r)) return true;
    }
  }
  return false;
}
function canSets(t) {
  if (t.length===0) return true;
  const h=t[0], rest=t.slice(1);
  // triplet
  const i2=rest.indexOf(h);
  if(i2!==-1){ const r2=rest.slice(); r2.splice(i2,1); const i3=r2.indexOf(h); if(i3!==-1){ const r3=r2.slice(); r3.splice(i3,1); if(canSets(r3)) return true; } }
  // sequence
  const suit=h.slice(-1), num=parseInt(h);
  if(!isNaN(num)&&SUITS.includes(suit)&&num<=7){
    const t2=(num+1)+suit,t3=(num+2)+suit;
    const j2=rest.indexOf(t2);
    if(j2!==-1){ const r2=rest.slice(); r2.splice(j2,1); const j3=r2.indexOf(t3); if(j3!==-1){ const r3=r2.slice(); r3.splice(j3,1); if(canSets(r3)) return true; } }
  }
  return false;
}

// ─── Tenpai: what tiles complete the hand ─────────────────────
function getTenpai(hand) {
  const all=[...['m','p','s'].flatMap(s=>Array.from({length:9},(_,i)=>(i+1)+s)),...HONORS];
  return [...new Set(all)].filter(t => isWinHand([...hand, t]));
}

// ─── Which discard gives best tenpai ──────────────────────────
// Returns [{discard, waits:[]}]
function getTenpaiAfterDiscard(hand) {
  const result = [];
  const seen = new Set();
  hand.forEach(t => {
    if (seen.has(t)) return;
    seen.add(t);
    const h2 = hand.slice();
    h2.splice(h2.indexOf(t), 1);
    const waits = getTenpai(h2);
    if (waits.length > 0) result.push({ discard: t, waits });
  });
  return result;
}

// ─── Score (香港麻將 fan) ──────────────────────────────────────
function calcFan(hand, melds, isTsumo, isHK) {
  const all = [...hand, ...melds.flat()];
  let fan = 1;
  if (isTsumo) fan += 1;
  // All same suit bonus
  const suits = new Set(all.map(t=>SUITS.includes(t.slice(-1))?t.slice(-1):'h').filter(s=>s!=='h'));
  if (suits.size===1 && all.every(t=>!HONORS.includes(t))) fan += 3;
  return isHK ? fan : fan;
}

// ─── Room ─────────────────────────────────────────────────────
class Room {
  constructor(code, mode, hostId, hostName) {
    this.code       = code;
    this.mode       = mode;
    this.isHK       = mode==='2p';
    this.maxPlayers = mode==='2p'?2:4;
    this.players    = [{id:hostId,name:hostName,ws:null,hand:[],melds:[],score:1000,tenpai:[]}];
    this.deck=[]; this.discard=[]; this.currentTurn=0;
    this.phase='waiting'; this.lastDiscard=null; this.lastDiscardFrom=-1;
    this.pending=[]; this.responses={}; this.actionTimer=null;
  }
  addPlayer(id,name,ws){
    if(this.players.length>=this.maxPlayers) return false;
    this.players.push({id,name,ws,hand:[],melds:[],score:1000,tenpai:[]});
    return true;
  }
  start(){
    this.deck=shuffle(buildDeck()); this.discard=[];
    this.players.forEach(p=>{p.hand=[];p.melds=[];p.tenpai=[];});
    for(let i=0;i<13;i++) this.players.forEach(p=>p.hand.push(this.deck.pop()));
    this.players.forEach(p=>{ p.hand=sortHand(p.hand); });
    this.currentTurn=0; this.phase='playing';
    this.bcast({type:'game_start',players:this.players.map(p=>({id:p.id,name:p.name,score:p.score})),mode:this.mode,isHK:this.isHK});
    this.sendAllHands(); this.bcastState(); this.draw(0);
  }
  draw(idx){
    if(this.deck.length===0){ this.end('draw'); return; }
    const tile=this.deck.pop(), p=this.players[idx];
    p.hand.push(tile); p.hand=sortHand(p.hand);
    this.currentTurn=idx; this.phase='playing';
    const tsumo=isWinHand(p.hand);
    // tenpai suggestions: what to discard to be tenpai
    const tenpaiSug=getTenpaiAfterDiscard(p.hand);
    p.tenpai=tenpaiSug.flatMap(s=>s.waits);
    wsSend(p.ws,{type:'your_turn',hand:p.hand,drawn:tile,canTsumo:tsumo,tenpaiSug});
    this.bcast({type:'turn_change',currentTurn:idx,deckLeft:this.deck.length});
    this.bcastState();
  }
  discard(pidx,tile){
    const p=this.players[pidx];
    const i=p.hand.indexOf(tile); if(i===-1) return false;
    p.hand.splice(i,1); p.hand=sortHand(p.hand);
    this.discard.push(tile); this.lastDiscard=tile; this.lastDiscardFrom=pidx;
    const tenpaiSug=getTenpaiAfterDiscard(p.hand);
    p.tenpai=tenpaiSug.flatMap(s=>s.waits);
    this.bcast({type:'discard_tile',playerIdx:pidx,tile,deckLeft:this.deck.length,tenpai:p.tenpai.length>0});
    // check actions
    this.pending=[]; this.responses={};
    this.players.forEach((q,i)=>{
      if(i===pidx) return;
      const cW=isWinHand([...q.hand,tile]);
      const cP=q.hand.filter(t=>t===tile).length>=2;
      const isNext=!this.isHK&&(i===(pidx+1)%this.players.length);
      const cC=isNext&&canChow(q.hand,tile);
      if(cW||cP||cC){
        this.pending.push({pidx:i,cW,cP,cC});
        wsSend(q.ws,{type:'action_prompt',tile,from:pidx,canWin:cW,canPong:cP,canChow:cC});
      }
    });
    if(this.pending.length===0) this.nextTurn();
    else{
      this.phase='action';
      clearTimeout(this.actionTimer);
      this.actionTimer=setTimeout(()=>{ if(this.phase==='action') this.nextTurn(); },8000);
    }
    this.bcastState();
    return true;
  }
  action(pidx,action,tiles){
    if(this.phase!=='action') return;
    this.responses[pidx]={action,tiles};
    if(!this.pending.every(a=>this.responses[a.pidx])) return;
    clearTimeout(this.actionTimer);
    const tile=this.lastDiscard;
    // priority: win > pong > chow
    for(const a of this.pending){
      const r=this.responses[a.pidx];
      if(r.action==='win'){ const p=this.players[a.pidx]; p.hand.push(tile); this.discard.pop(); this.end('win',a.pidx,false); return; }
    }
    for(const a of this.pending){
      const r=this.responses[a.pidx];
      if(r.action==='pong'){
        const p=this.players[a.pidx]; let rm=0;
        p.hand=p.hand.filter(t=>(t===tile&&rm<2)?(rm++,false):true);
        p.melds.push([tile,tile,tile]); this.discard.pop();
        this.currentTurn=a.pidx; this.phase='playing';
        this.bcast({type:'meld_done',playerIdx:a.pidx,meld:[tile,tile,tile],meldType:'pong'});
        this.sendHand(a.pidx);
        wsSend(p.ws,{type:'your_turn',hand:p.hand,drawn:null,afterMeld:true,tenpaiSug:getTenpaiAfterDiscard(p.hand)});
        this.bcastState(); return;
      }
    }
    for(const a of this.pending){
      const r=this.responses[a.pidx];
      if(r.action==='chow'&&r.tiles&&r.tiles.length===2){
        const p=this.players[a.pidx];
        r.tiles.forEach(t=>{ const i=p.hand.indexOf(t); if(i!==-1) p.hand.splice(i,1); });
        const meld=sortHand([...r.tiles,tile]);
        p.melds.push(meld); this.discard.pop();
        this.currentTurn=a.pidx; this.phase='playing';
        this.bcast({type:'meld_done',playerIdx:a.pidx,meld,meldType:'chow'});
        this.sendHand(a.pidx);
        wsSend(p.ws,{type:'your_turn',hand:p.hand,drawn:null,afterMeld:true,tenpaiSug:getTenpaiAfterDiscard(p.hand)});
        this.bcastState(); return;
      }
    }
    this.nextTurn();
  }
  tsumo(pidx){
    if(this.phase!=='playing'||this.currentTurn!==pidx) return;
    const p=this.players[pidx];
    if(isWinHand(p.hand)) this.end('win',pidx,true);
  }
  nextTurn(){ this.phase='playing'; this.draw((this.currentTurn+1)%this.players.length); }
  end(reason,winIdx,isTsumo=false){
    this.phase='ended'; clearTimeout(this.actionTimer);
    let scoreChange=0, fan=0;
    if(reason==='win'&&winIdx!==undefined){
      const p=this.players[winIdx];
      fan=calcFan(p.hand,p.melds,isTsumo,this.isHK);
      scoreChange=fan*100;
      p.score+=scoreChange;
      if(!isTsumo&&this.lastDiscardFrom!==-1) this.players[this.lastDiscardFrom].score-=scoreChange;
      if(isTsumo) this.players.filter((_,i)=>i!==winIdx).forEach(q=>{ q.score-=Math.ceil(scoreChange/(this.players.length-1)); });
    }
    this.bcast({type:'game_end',reason,winnerIdx:winIdx!==undefined?winIdx:-1,isTsumo,fan,scoreChange,
      hands:this.players.map(p=>({id:p.id,name:p.name,hand:p.hand,melds:p.melds,score:p.score}))});
    // Persist scores
    const users=loadUsers();
    this.players.forEach((p,i)=>{
      if(users[p.id]){
        users[p.id].games=(users[p.id].games||0)+1;
        if(reason==='win'){
          if(i===winIdx){ users[p.id].wins=(users[p.id].wins||0)+1; users[p.id].streak=(users[p.id].streak||0)+1; users[p.id].qi=(users[p.id].qi||1200)+scoreChange; }
          else{ users[p.id].losses=(users[p.id].losses||0)+1; users[p.id].streak=0; users[p.id].qi=Math.max(0,(users[p.id].qi||1200)-Math.ceil(scoreChange/(this.players.length-1))); }
        }
      }
    });
    saveUsers(users);
  }
  sendAllHands(){ this.players.forEach((_,i)=>this.sendHand(i)); }
  sendHand(i){ const p=this.players[i]; wsSend(p.ws,{type:'hand_update',hand:p.hand,playerIdx:i}); }
  bcastState(){
    this.bcast({type:'state_update',phase:this.phase,currentTurn:this.currentTurn,
      deckLeft:this.deck.length,discard:this.discard,
      players:this.players.map(p=>({id:p.id,name:p.name,score:p.score,handCount:p.hand.length,melds:p.melds,tenpai:p.tenpai.length>0}))});
  }
  bcast(obj){ bcast(this.players,obj); }
}
function canChow(hand,tile){
  const suit=tile.slice(-1),num=parseInt(tile);
  if(isNaN(num)||!SUITS.includes(suit)) return false;
  const has=n=>hand.includes(n+suit);
  return (has(num-2)&&has(num-1))||(has(num-1)&&has(num+1))||(has(num+1)&&has(num+2));
}

// ─── Matchmaking ──────────────────────────────────────────────
const matchQueues = { '2p':[], '4p':[] }; // [{ws,playerId,name}]
function tryMatch(mode){
  const q=matchQueues[mode]; const need=mode==='2p'?2:4;
  if(q.length<need) return;
  const group=q.splice(0,need);
  let code=genCode(); while(rooms.has(code)) code=genCode();
  const room=new Room(code,mode,group[0].playerId,group[0].name);
  room.players[0].ws=group[0].ws;
  group.slice(1).forEach(p=>room.addPlayer(p.playerId,p.name,p.ws));
  rooms.set(code,room);
  group.forEach(p=>{ const ctx=clients.get(p.ws); if(ctx){ctx.playerId=p.playerId;ctx.roomCode=code;ctx.name=p.name;} });
  room.bcast({type:'match_found',code,mode,players:room.players.map(p=>({id:p.id,name:p.name}))});
  setTimeout(()=>room.start(),2000);
}

// ─── WebSocket ────────────────────────────────────────────────
const rooms=new Map(), clients=new Map();
wss.on('connection',ws=>{
  clients.set(ws,{playerId:null,roomCode:null,name:null});
  ws.on('message',raw=>{
    let msg; try{ msg=JSON.parse(raw); }catch{ return; }
    const ctx=clients.get(ws);
    switch(msg.type){
      case 'create_room':{
        let code=genCode(); while(rooms.has(code)) code=genCode();
        const room=new Room(code,msg.mode,msg.playerId,msg.name);
        room.players[0].ws=ws; rooms.set(code,room);
        ctx.playerId=msg.playerId; ctx.roomCode=code; ctx.name=msg.name;
        wsSend(ws,{type:'room_created',code,mode:msg.mode,players:[{id:msg.playerId,name:msg.name}]});
        break;
      }
      case 'join_room':{
        const room=rooms.get(msg.code);
        if(!room){ wsSend(ws,{type:'error',msg:'找不到此房間'}); return; }
        if(room.players.length>=room.maxPlayers){ wsSend(ws,{type:'error',msg:'房間已滿'}); return; }
        if(room.phase!=='waiting'){ wsSend(ws,{type:'error',msg:'遊戲已開始'}); return; }
        room.addPlayer(msg.playerId,msg.name,ws);
        ctx.playerId=msg.playerId; ctx.roomCode=msg.code; ctx.name=msg.name;
        room.bcast({type:'player_joined',name:msg.name,players:room.players.map(p=>({id:p.id,name:p.name})),count:room.players.length,max:room.maxPlayers});
        wsSend(ws,{type:'joined_room',code:msg.code,mode:room.mode,players:room.players.map(p=>({id:p.id,name:p.name}))});
        break;
      }
      case 'start_game':{
        const room=rooms.get(ctx.roomCode); if(!room) return;
        if(room.players[0].id!==ctx.playerId){ wsSend(ws,{type:'error',msg:'只有房主能開始'}); return; }
        if(room.players.length<2){ wsSend(ws,{type:'error',msg:'至少需要2位玩家'}); return; }
        room.start(); break;
      }
      case 'discard':{
        const room=rooms.get(ctx.roomCode); if(!room) return;
        const idx=room.players.findIndex(p=>p.id===ctx.playerId);
        if(idx!==room.currentTurn||room.phase!=='playing') return;
        room.discard(idx,msg.tile); break;
      }
      case 'tsumo':{
        const room=rooms.get(ctx.roomCode); if(!room) return;
        const idx=room.players.findIndex(p=>p.id===ctx.playerId);
        room.tsumo(idx); break;
      }
      case 'action':{
        const room=rooms.get(ctx.roomCode); if(!room||room.phase!=='action') return;
        const idx=room.players.findIndex(p=>p.id===ctx.playerId);
        room.action(idx,msg.action,msg.tiles||[]); break;
      }
      case 'quick_match':{
        const q=matchQueues[msg.mode];
        if(q.find(x=>x.playerId===msg.playerId)) return;
        q.push({ws,playerId:msg.playerId,name:msg.name});
        ctx.playerId=msg.playerId; ctx.name=msg.name;
        wsSend(ws,{type:'queue_status',mode:msg.mode,count:q.length,need:msg.mode==='2p'?2:4});
        tryMatch(msg.mode); break;
      }
      case 'cancel_match':{
        ['2p','4p'].forEach(m=>{ const i=matchQueues[m].findIndex(x=>x.playerId===ctx.playerId); if(i!==-1) matchQueues[m].splice(i,1); });
        wsSend(ws,{type:'match_cancelled'}); break;
      }
      case 'restart':{
        const room=rooms.get(ctx.roomCode); if(!room) return;
        if(room.players[0].id!==ctx.playerId) return;
        room.start(); break;
      }
    }
  });
  ws.on('close',()=>{
    const ctx=clients.get(ws);
    if(ctx?.roomCode){ const room=rooms.get(ctx.roomCode); if(room){ room.bcast({type:'player_left',name:ctx.name}); if(room.players.every(p=>!p.ws||p.ws.readyState!==1)) rooms.delete(ctx.roomCode); } }
    ['2p','4p'].forEach(m=>{ const i=matchQueues[m].findIndex(x=>x.ws===ws); if(i!==-1) matchQueues[m].splice(i,1); });
    clients.delete(ws);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🀄 小麻將 → http://localhost:${PORT}`));
