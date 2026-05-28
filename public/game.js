// ═══════════════════════════════════════════════════════════════
//  小麻將 · game.js  —  完整客戶端
//  橫向手牌、大圓形動作按鈕、聽牌建議、users.json、排行榜、配對
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── State ──────────────────────────────────────────────────────
let ws=null, reconnTimer=null;
let playerId  = genId();
let playerName= '';
let qiAmount  = 1200;
let roomCode  = null, isHost=false;
let myIdx     = -1;
let myHand    = [];          // current hand (sorted)
let drawnTile = null;        // the tile just drawn this turn
let gameState = null;
let selTile   = null;        // selected tile id
let canTsumo  = false;
let tenpaiSug = [];          // [{discard, waits:[]}]
let isHK      = false;
let inAction  = false;       // waiting for my action response
let selMode   = null;        // '2p'|'4p'
let boardPlayers = [];
let inQueue   = false;

// ── Quests ─────────────────────────────────────────────────────
const quests = [
  {id:1,icon:'🀇',name:'完成3場對局',  prog:0,total:3,reward:150,claimed:false},
  {id:2,icon:'🏅',name:'贏得一場勝利', prog:0,total:1,reward:300,claimed:false},
  {id:3,icon:'📅',name:'每日登入簽到', prog:1,total:1,reward:100,claimed:false},
  {id:4,icon:'👥',name:'使用好友桌',   prog:0,total:1,reward:200,claimed:false},
];

// ── Tile display ───────────────────────────────────────────────
const TD = {
  '1m':{ch:'一',su:'萬',cl:'black'},'2m':{ch:'二',su:'萬',cl:'black'},'3m':{ch:'三',su:'萬',cl:'black'},
  '4m':{ch:'四',su:'萬',cl:'black'},'5m':{ch:'五',su:'萬',cl:'black'},'6m':{ch:'六',su:'萬',cl:'black'},
  '7m':{ch:'七',su:'萬',cl:'black'},'8m':{ch:'八',su:'萬',cl:'black'},'9m':{ch:'九',su:'萬',cl:'black'},
  '1p':{ch:'①',su:'筒',cl:'blue'}, '2p':{ch:'②',su:'筒',cl:'blue'}, '3p':{ch:'③',su:'筒',cl:'blue'},
  '4p':{ch:'④',su:'筒',cl:'blue'}, '5p':{ch:'⑤',su:'筒',cl:'blue'}, '6p':{ch:'⑥',su:'筒',cl:'blue'},
  '7p':{ch:'⑦',su:'筒',cl:'blue'}, '8p':{ch:'⑧',su:'筒',cl:'blue'}, '9p':{ch:'⑨',su:'筒',cl:'blue'},
  '1s':{ch:'1',su:'索',cl:'green'},'2s':{ch:'2',su:'索',cl:'green'},'3s':{ch:'3',su:'索',cl:'green'},
  '4s':{ch:'4',su:'索',cl:'green'},'5s':{ch:'5',su:'索',cl:'green'},'6s':{ch:'6',su:'索',cl:'green'},
  '7s':{ch:'7',su:'索',cl:'green'},'8s':{ch:'8',su:'索',cl:'green'},'9s':{ch:'9',su:'索',cl:'green'},
  '東':{ch:'東',su:'',cl:'red'},'南':{ch:'南',su:'',cl:'red'},'西':{ch:'西',su:'',cl:'red'},'北':{ch:'北',su:'',cl:'red'},
  '中':{ch:'中',su:'',cl:'red'},'發':{ch:'發',su:'',cl:'green'},'白':{ch:'白',su:'',cl:'black'},
};
const WINDS=['東','南','西','北'];

// ── Util ───────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
function genId(){return Math.random().toString(36).substr(2,9);}
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));}
function toast(msg,dur=2800){const w=$('toast-wrap');const t=el('div','toast',msg);w.appendChild(t);setTimeout(()=>t.remove(),dur+400);}
function particle(e='🪙'){const p=el('div','particle',e);p.style.left=(20+Math.random()*60)+'vw';p.style.bottom='180px';document.body.appendChild(p);setTimeout(()=>p.remove(),1400);}
function updateQiUI(){document.querySelectorAll('.qi-val').forEach(e=>e.textContent=qiAmount.toLocaleString());}

// ── Tile factory ───────────────────────────────────────────────
function mkTile(id, size='md', opts={}){
  const d=TD[id];
  const div=el('div',`tile ${size}${opts.back?' back':''}${opts.sel?' selected':''}${opts.drawn?' drawn':''}${opts.hint?' tenpai-hint':''}`);
  if(!opts.back&&d){
    div.appendChild(el('span',`tile-char ${d.cl}`,d.ch));
    if(d.su) div.appendChild(el('span','tile-suit',d.su));
  }
  div.dataset.tile=id||'';
  return div;
}

// ══════════════════════════════════════════════════════════════
//  WebSocket
// ══════════════════════════════════════════════════════════════
function connect(){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{setConn(true);clearInterval(reconnTimer);};
  ws.onclose=()=>{setConn(false);ws=null;reconnTimer=setInterval(()=>{if(!ws)connect();},3000);};
  ws.onerror=()=>{ws&&ws.close();};
  ws.onmessage=({data})=>{try{handle(JSON.parse(data));}catch(e){console.error(e);}};
}
function wsSend(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));}
function setConn(ok){const e=$('conn-status');if(!e)return;e.className=`conn-status ${ok?'ok':'err'}`;e.textContent=ok?'● 已連線':'○ 重連中…';}

// ══════════════════════════════════════════════════════════════
//  Handle server messages
// ══════════════════════════════════════════════════════════════
function handle(msg){
  switch(msg.type){
    /* ── Room ── */
    case 'room_created':
      roomCode=msg.code; isHost=true;
      $('room-code-section').style.display='block';
      $('room-code-display').textContent=msg.code;
      $('host-start-btn').disabled=true;
      renderRoomPlayers(msg.players||[]);
      toast(`🀄 房間 ${msg.code} 建立！分享給好友`); break;
    case 'joined_room':
      roomCode=msg.code; isHost=false;
      $('room-code-section').style.display='block';
      $('room-code-display').textContent=msg.code;
      renderRoomPlayers(msg.players||[]);
      toast('✅ 已加入房間，等待房主開始…'); break;
    case 'player_joined':
      renderRoomPlayers(msg.players||[]);
      toast(`👤 ${msg.name} 加入 (${msg.count}/${msg.max})`);
      if(msg.count>=2&&isHost) $('host-start-btn').disabled=false; break;
    case 'player_left': toast(`${msg.name} 離開了房間`); break;
    case 'error': toast('⚠️ '+msg.msg); break;

    /* ── Matchmaking ── */
    case 'queue_status':
      updateQueueUI(msg); break;
    case 'match_found':
      inQueue=false; roomCode=msg.code; isHost=false;
      showScreen('screen-game');
      toast('🎯 配對成功！遊戲即將開始…'); break;
    case 'match_cancelled':
      inQueue=false; showScreen('screen-main'); break;

    /* ── Game Start ── */
    case 'game_start':
      isHK=msg.isHK;
      showScreen('screen-game');
      initBoard(msg.players);
      quests[3].prog=1;
      toast(isHK?'🀄 香港麻將！':'🀄 遊戲開始！'); break;

    /* ── Hands ── */
    case 'hand_update':
      if(msg.playerIdx===myIdx){myHand=msg.hand;renderMyHand(false);}
      else updateBackCount(msg.playerIdx,msg.hand?msg.hand.length:13); break;

    /* ── My turn ── */
    case 'your_turn':
      myHand=msg.hand||myHand; drawnTile=msg.drawn;
      canTsumo=msg.canTsumo||false;
      tenpaiSug=msg.tenpaiSug||[];
      inAction=false;
      renderMyHand(true); // true = show drawn tile separately
      if(msg.afterMeld) toast('請出牌');
      else{
        if(canTsumo) toast('🎉 可以自摸！');
        else if(tenpaiSug.length) toast('🔔 聽牌！');
      }
      showActionBar('discard');
      renderTenpaiPanel();
      break;

    /* ── Turn change ── */
    case 'turn_change':
      if(gameState) gameState.currentTurn=msg.currentTurn;
      updTurnUI(msg.currentTurn,msg.deckLeft);
      if(msg.currentTurn!==myIdx){hideActionBar();hideTenpaiPanel();} break;

    /* ── Discard event ── */
    case 'discard_tile':
      if(gameState) gameState.discard=(gameState.discard||[]);
      refreshDiscard();
      updateBackCount(msg.playerIdx,null,-1);
      if(msg.tenpai&&msg.playerIdx!==myIdx) showTpBadge(msg.playerIdx); break;

    /* ── Action prompt ── */
    case 'action_prompt':
      inAction=true;
      showActionBar('action',msg);
      highlightLastDiscard(); break;

    /* ── Meld done ── */
    case 'meld_done':
      appendMeld(msg.playerIdx,msg.meld,msg.meldType);
      updateBackCount(msg.playerIdx,null,-3);
      toast(msg.meldType==='pong'?'碰！':'吃！'); break;

    /* ── Full state ── */
    case 'state_update':
      gameState=msg; refreshBoard(); break;

    /* ── Game end ── */
    case 'game_end':
      quests[0].prog=Math.min(3,quests[0].prog+1);
      if(msg.winnerIdx===myIdx){
        quests[1].prog=1;
        const gain=msg.scoreChange||0;
        qiAmount+=gain; updateQiUI();
        for(let i=0;i<6;i++) setTimeout(()=>particle('🎉'),i*90);
        for(let i=0;i<5;i++) setTimeout(()=>particle('🪙'),i*130+300);
        // persist
        apiPost('/api/update',{playerId,delta:{qi:qiAmount,wins:quests[1].prog,games:quests[0].prog,streak:1}});
      } else {
        apiPost('/api/update',{playerId,delta:{games:quests[0].prog,streak:0}});
      }
      showGameOver(msg); break;
  }
}

// ── API ────────────────────────────────────────────────────────
async function apiPost(url,body){try{await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{}}
async function apiGet(url){try{const r=await fetch(url);return await r.json();}catch{return [];}}

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
function initLogin(){
  const inp=$('login-name-input'), btn=$('login-btn');
  const doLogin=async()=>{
    const v=inp.value.trim();
    if(!v){toast('⚠️ 請輸入名稱');return;}
    playerName=v;
    // Save to server
    const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId,name:playerName})});
    const data=await res.json();
    if(data.ok&&data.data){
      qiAmount=data.data.qi||1200;
      updateQiUI();
    }
    document.querySelectorAll('.player-name-display').forEach(e=>e.textContent=playerName);
    document.querySelectorAll('.player-av-char').forEach(e=>e.textContent=playerName.charAt(0));
    showScreen('screen-main');
    toast(`歡迎，${playerName}！`);
  };
  btn.addEventListener('click',doLogin);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
}

// ══════════════════════════════════════════════════════════════
//  QUEST
// ══════════════════════════════════════════════════════════════
function renderQuests(){
  const list=$('quest-list-body'); if(!list) return;
  list.innerHTML='';
  quests.forEach(q=>{
    const pct=Math.min(100,(q.prog/q.total)*100), done=q.prog>=q.total;
    const c=el('div','qcard');
    c.innerHTML=`<div class="q-icon">${q.icon}</div>
      <div class="q-body">
        <div class="q-name">${q.name}</div>
        <div class="q-prog-txt">${q.prog} / ${q.total}</div>
        <div class="q-bar-wrap"><div class="q-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="q-right">
        <div class="q-reward">🪙 +${q.reward}</div>
        <button class="btn-claim" data-qid="${q.id}" ${(!done||q.claimed)?'disabled':''}>${q.claimed?'已領取':'領取'}</button>
      </div>`;
    list.appendChild(c);
  });
  list.querySelectorAll('.btn-claim:not([disabled])').forEach(b=>{
    b.addEventListener('click',()=>{
      const q=quests.find(x=>x.id===+b.dataset.qid); if(!q||q.claimed) return;
      q.claimed=true; qiAmount+=q.reward; updateQiUI();
      toast(`🪙 獲得 ${q.reward} 琪幣！`); particle('🪙'); particle('✨');
      apiPost('/api/update',{playerId,delta:{qi:qiAmount}});
      renderQuests();
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════════════════════════
async function loadLeaderboard(){
  const list=$('lb-list'); if(!list) return;
  list.innerHTML='<div style="text-align:center;color:var(--txt-d);padding:30px">載入中…</div>';
  const data=await apiGet('/api/leaderboard');
  list.innerHTML='';
  if(!data.length){list.innerHTML='<div style="text-align:center;color:var(--txt-d);padding:30px">尚無排名資料</div>';return;}
  data.forEach((u,i)=>{
    const row=el('div','lb-row');
    const rankCls=i===0?'r1':i===1?'r2':i===2?'r3':'rn';
    row.innerHTML=`
      <div class="lb-rank ${rankCls}">${i+1}</div>
      <div class="lb-av">${u.name.charAt(0)}</div>
      <div class="lb-info">
        <div class="lb-name">${u.name}</div>
        <div class="lb-stats">勝${u.wins||0} 敗${u.losses||0} · 場${u.games||0}</div>
      </div>
      <div class="lb-qi">🪙 ${(u.qi||0).toLocaleString()}</div>`;
    list.appendChild(row);
  });
}

// ══════════════════════════════════════════════════════════════
//  QUICK MATCH
// ══════════════════════════════════════════════════════════════
function initQuickMatch(){
  document.querySelectorAll('.qm-mode-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.qm-mode-btn').forEach(x=>x.classList.remove('sel'));
      b.classList.add('sel');
      selMode=b.dataset.mode;
      $('qm-start-btn').disabled=false;
    });
  });
  $('qm-start-btn')?.addEventListener('click',()=>{
    if(!selMode){toast('請選擇模式');return;}
    inQueue=true;
    wsSend({type:'quick_match',mode:selMode,playerId,name:playerName});
    $('queue-waiting').style.display='block';
    $('qm-mode-sel').style.display='none';
  });
  $('qm-cancel-btn')?.addEventListener('click',()=>{
    wsSend({type:'cancel_match'});
    $('queue-waiting').style.display='none';
    $('qm-mode-sel').style.display='block';
    inQueue=false;
  });
}
function updateQueueUI(msg){
  const cnt=$('queue-count'); if(cnt) cnt.textContent=`${msg.count} / ${msg.need} 人已就緒`;
}

// ══════════════════════════════════════════════════════════════
//  FRIEND ROOM
// ══════════════════════════════════════════════════════════════
function initFriendRoom(){
  document.querySelectorAll('.mode-checkbox').forEach(cb=>{
    cb.addEventListener('change',function(){
      document.querySelectorAll('.mode-checkbox').forEach(c=>{
        c.checked=(c===this&&this.checked);
        c.closest('.mode-opt').classList.toggle('sel',c.checked);
      });
      selMode=this.checked?this.value:null;
      $('create-room-btn').disabled=!selMode;
    });
  });
  $('create-room-btn').addEventListener('click',()=>{
    if(!selMode){toast('請先選擇遊戲模式');return;}
    if(!playerName){toast('請先登入');return;}
    wsSend({type:'create_room',mode:selMode,playerId,name:playerName});
  });
  $('host-start-btn').addEventListener('click',()=>wsSend({type:'start_game'}));
  $('join-btn').addEventListener('click',()=>{
    const code=$('join-code-input').value.trim();
    if(!code||code.length!==4){toast('⚠️ 請輸入4位代碼');return;}
    if(!playerName){toast('請先登入');return;}
    wsSend({type:'join_room',code,playerId,name:playerName});
    $('join-code-input').value='';
  });
}
function renderRoomPlayers(players){
  const slots=$('player-slots'); if(!slots) return;
  slots.innerHTML='';
  const max=selMode==='2p'?2:4;
  players.forEach((p,i)=>{
    const s=el('div','pslot');
    s.innerHTML=`<div class="slot-av ${i===0?'host':'guest'}">${p.name.charAt(0)}</div>
      <span class="slot-name">${p.name}${p.id===playerId?' (我)':''}</span>
      ${i===0?'<span class="slot-tag">房主</span>':''}`;
    slots.appendChild(s);
  });
  if(players.length<max){
    const e=el('div','pslot');
    e.style.cssText='border-style:dashed;opacity:.4;justify-content:center;font-size:12px;color:var(--txt-d)';
    e.textContent=`等待玩家加入 ${players.length}/${max}`;
    slots.appendChild(e);
  }
}

// ══════════════════════════════════════════════════════════════
//  GAME BOARD
// ══════════════════════════════════════════════════════════════
function initBoard(players){
  boardPlayers=players;
  myIdx=players.findIndex(p=>p.id===playerId);
  if(myIdx===-1) myIdx=0;

  const board=$('game-board');
  board.innerHTML=`
    <div class="felt"></div>
    <div class="felt-pat"></div>
    <div class="felt-glow"></div>
    <div class="tbl-center" id="tbl-center">
      <div class="round-info">
        <div class="round-txt" id="round-txt">東一局</div>
        <div class="deck-txt">剩 <span id="deck-left">136</span> 張</div>
      </div>
      <div class="discard-pile" id="discard-pile"></div>
    </div>
    <div class="action-bar" id="action-bar" style="display:none"></div>
    <div class="tenpai-panel" id="tenpai-panel" style="display:none"></div>
    <div class="game-hud">
      <button class="hud-btn" id="hud-exit">退出</button>
      <div class="hud-turn" id="hud-turn"></div>
    </div>`;

  const posMap4=['bottom','right','top','left'];
  const posMap2=['bottom','top'];
  const posArr=players.length===2?posMap2:posMap4;

  players.forEach((p,i)=>{
    const rel=(i-myIdx+players.length)%players.length;
    const pos=posArr[rel]||'top';
    const wind=WINDS[i%4];
    const zone=el('div',`pzone ${pos}`);
    zone.id=`pzone-${i}`;
    zone.innerHTML=`
      <div class="nplate" id="np-${i}">
        <div class="np-wind">${wind}</div>
        <div class="np-av">${p.name.charAt(0)}</div>
        <div><div class="np-name">${p.name}${i===myIdx?' (我)':''}</div>
        <div class="np-score" id="np-sc-${i}">💰 ${p.score}</div></div>
        <div class="tp-badge" id="tp-${i}">聽</div>
      </div>
      <div class="melds-row" id="melds-${i}"></div>
      <div class="hand-row" id="hand-${i}"></div>`;
    board.appendChild(zone);
  });

  $('hud-exit').addEventListener('click',()=>{ if(confirm('確定退出？')) exitGame(); });

  // Render other players' back tiles
  players.forEach((_,i)=>{ if(i!==myIdx) renderBackHand(i,13); });
}

// ── My Hand (HORIZONTAL) ────────────────────────────────────
// drawnTile is shown separately to the right with a gap
function renderMyHand(showDrawn=false){
  const row=$(`hand-${myIdx}`); if(!row) return;
  row.innerHTML='';

  // Determine which tiles are tenpai hints (what to discard)
  const hintTiles=new Set(tenpaiSug.map(s=>s.discard));

  const hand14 = myHand; // hand already includes drawn tile from server
  // If showDrawn, separate the drawn tile visually
  const handWithout = showDrawn && drawnTile
    ? hand14.filter((t,i,a)=>{ if(t===drawnTile&&i===a.lastIndexOf(drawnTile)) return false; return true; })
    : hand14;
  const toShow = showDrawn && drawnTile ? [...handWithout] : hand14;

  toShow.forEach((t,idx)=>{
    const div=mkTile(t,'lg',{sel:selTile===t,hint:hintTiles.has(t)});
    div.style.animationDelay=`${idx*18}ms`;
    div.classList.add('deal-anim');
    div.addEventListener('click',()=>onTileClick(div,t));
    row.appendChild(div);
  });

  // Drawn tile — separate slot
  if(showDrawn&&drawnTile){
    const sep=el('div');
    sep.style.cssText='width:14px;flex-shrink:0;';
    row.appendChild(sep);
    const dtile=mkTile(drawnTile,'lg',{drawn:true,sel:selTile===drawnTile,hint:hintTiles.has(drawnTile)});
    dtile.classList.add('drawn-tile','deal-anim');
    dtile.style.animationDelay='0ms';
    dtile.addEventListener('click',()=>onTileClick(dtile,drawnTile));
    row.appendChild(dtile);
  }
}

function onTileClick(div,t){
  if(inAction) return;
  if(!gameState||gameState.currentTurn!==myIdx){toast('還不是你的回合');return;}
  if(selTile===t&&div.classList.contains('selected')){
    selTile=null;
  } else {
    selTile=t;
  }
  renderMyHand(drawnTile!==null);
}

// ── Back tiles ───────────────────────────────────────────────
function renderBackHand(idx,count){
  const row=$(`hand-${idx}`); if(!row) return;
  row.innerHTML='';
  const pos=row.closest('.pzone');
  const isVertical=pos&&(pos.classList.contains('left')||pos.classList.contains('right'));
  for(let i=0;i<count;i++){
    const t=mkTile(null,isVertical?'side':'sm',{back:true});
    row.appendChild(t);
  }
}
function updateBackCount(idx,count,delta=0){
  if(idx===myIdx) return;
  const row=$(`hand-${idx}`); if(!row) return;
  let cur=count!==null?count:row.children.length+delta;
  if(cur<0) cur=0;
  const pos=row.closest('.pzone');
  const isVertical=pos&&(pos.classList.contains('left')||pos.classList.contains('right'));
  row.innerHTML='';
  for(let i=0;i<cur;i++) row.appendChild(mkTile(null,isVertical?'side':'sm',{back:true}));
}

// ── Discard pile ─────────────────────────────────────────────
function refreshDiscard(){
  const pile=$('discard-pile'); if(!pile||!gameState) return;
  pile.innerHTML='';
  (gameState.discard||[]).slice(-28).forEach((t,i,a)=>{
    const d=mkTile(t,'xs');
    if(i===a.length-1) d.classList.add('last-discard');
    pile.appendChild(d);
  });
}
function highlightLastDiscard(){
  if(!gameState||!gameState.discard) return;
  const pile=$('discard-pile'); if(!pile) return;
  const tiles=pile.querySelectorAll('.tile');
  if(tiles.length) tiles[tiles.length-1].classList.add('last-discard');
}

// ── Melds ────────────────────────────────────────────────────
function appendMeld(idx,meld,type){
  const row=$(`melds-${idx}`); if(!row) return;
  const g=el('div','meld-grp');
  meld.forEach(t=>g.appendChild(mkTile(t,'xs')));
  row.appendChild(g);
}

// ── Tenpai badge ─────────────────────────────────────────────
function showTpBadge(idx){
  const b=$(`tp-${idx}`); if(b) b.classList.add('show');
}

// ── Turn UI ──────────────────────────────────────────────────
function updTurnUI(cur,deckLeft){
  document.querySelectorAll('.nplate').forEach(n=>n.classList.remove('active'));
  const np=$(`np-${cur}`); if(np) np.classList.add('active');
  const ht=$('hud-turn');
  if(ht&&gameState){
    const p=gameState.players&&gameState.players[cur];
    ht.textContent=cur===myIdx?'🎴 你的回合':`${p?.name||'?'} 出牌中`;
    ht.style.color=cur===myIdx?'var(--jade-l)':'var(--gold)';
  }
  if(deckLeft!==undefined){const dc=$('deck-left');if(dc)dc.textContent=deckLeft;}
}

// ── Full board refresh ───────────────────────────────────────
function refreshBoard(){
  if(!gameState||!gameState.players) return;
  gameState.players.forEach((p,i)=>{
    const sc=$(`np-sc-${i}`); if(sc) sc.textContent=`💰 ${p.score}`;
    if(i!==myIdx) updateBackCount(i,p.handCount);
    // melds (initial render)
    const mr=$(`melds-${i}`);
    if(mr&&mr.children.length===0&&p.melds){
      p.melds.forEach(m=>{ const g=el('div','meld-grp'); m.forEach(t=>g.appendChild(mkTile(t,'xs'))); mr.appendChild(g); });
    }
  });
  refreshDiscard();
  updTurnUI(gameState.currentTurn,gameState.deckLeft);
}

// ══════════════════════════════════════════════════════════════
//  ACTION BAR — Big Round Buttons
// ══════════════════════════════════════════════════════════════
function showActionBar(mode,data){
  const bar=$('action-bar'); if(!bar) return;
  bar.innerHTML=''; bar.style.display='flex';

  if(mode==='discard'){
    if(canTsumo){
      bar.appendChild(roundBtn('自摸','act-tsumo','自摸',()=>{wsSend({type:'tsumo'});hideActionBar();hideTenpaiPanel();}));
    }
    bar.appendChild(roundBtn('出牌','act-discard','打牌',doDiscard));
  }

  if(mode==='action'&&data){
    if(data.canWin)  bar.appendChild(roundBtn('胡牌','act-win','胡！',()=>respond('win')));
    if(data.canPong) bar.appendChild(roundBtn('碰',  'act-pong','',  ()=>respond('pong')));
    if(data.canChow&&!isHK) bar.appendChild(roundBtn('吃','act-chow','',()=>respond('chow',getBestChow(myHand,data.tile))));
    bar.appendChild(roundBtn('過','act-pass','',()=>respond('pass')));
  }
}
function roundBtn(label,cls,sub,onClick){
  const b=el('button',`act-btn ${cls}`);
  b.innerHTML=`<span class="btn-label">${label}</span>${sub?`<span class="btn-sub">${sub}</span>`:''}`;
  b.addEventListener('click',onClick);
  return b;
}
function hideActionBar(){const b=$('action-bar');if(b)b.style.display='none';}

// ── Tenpai suggestion panel ──────────────────────────────────
function renderTenpaiPanel(){
  const panel=$('tenpai-panel'); if(!panel) return;
  if(!tenpaiSug.length){panel.style.display='none';return;}
  panel.style.display='flex';
  panel.innerHTML=`<div class="tp-title">🔔 聽牌建議</div><div class="tp-sug-row" id="tp-sug-row"></div>`;
  const row=$('tp-sug-row');
  tenpaiSug.slice(0,4).forEach(s=>{
    const sug=el('div','tp-sug');
    const lbl=el('span','tp-sug-lbl','打');
    const dTile=mkTile(s.discard,'xs');
    const arrow=el('span','tp-sug-lbl','→');
    const waitsEl=el('div','tp-waits');
    s.waits.slice(0,4).forEach(w=>waitsEl.appendChild(mkTile(w,'xs')));
    sug.append(lbl,dTile,arrow,waitsEl);
    // click to auto-select that discard
    sug.style.cursor='pointer';
    sug.addEventListener('click',()=>{
      selTile=s.discard;
      renderMyHand(drawnTile!==null);
    });
    row.appendChild(sug);
  });
}
function hideTenpaiPanel(){const p=$('tenpai-panel');if(p)p.style.display='none';}

// ── Discard action ───────────────────────────────────────────
function doDiscard(){
  if(!selTile){
    // auto: pick drawn tile or last in hand
    if(drawnTile) selTile=drawnTile;
    else if(myHand.length) selTile=myHand[myHand.length-1];
    else{toast('請選擇要打的牌');return;}
  }
  wsSend({type:'discard',tile:selTile});
  // optimistic
  const i=myHand.indexOf(selTile); if(i!==-1) myHand.splice(i,1);
  drawnTile=null; selTile=null;
  renderMyHand(false);
  hideActionBar(); hideTenpaiPanel();
}
function respond(action,tiles=[]){
  wsSend({type:'action',action,tiles}); inAction=false;
  hideActionBar();
}
function getBestChow(hand,tile){
  const suit=tile.slice(-1),num=parseInt(tile);
  if(isNaN(num)) return [];
  const has=n=>hand.includes(n+suit);
  if(has(num-2)&&has(num-1)) return [(num-2)+suit,(num-1)+suit];
  if(has(num-1)&&has(num+1)) return [(num-1)+suit,(num+1)+suit];
  if(has(num+1)&&has(num+2)) return [(num+1)+suit,(num+2)+suit];
  return [];
}

// ══════════════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════════════
function showGameOver(msg){
  const ov=$('overlay-gameover'); if(!ov) return;
  const title=$('go-title'), sub=$('go-sub'), handsDiv=$('go-hands');
  const winner=boardPlayers[msg.winnerIdx];
  const iMine=msg.winnerIdx===myIdx;
  if(msg.reason==='win'){
    title.textContent=iMine?'🎉 胡牌！你贏了！':`${winner?.name||'?'} 胡牌！`;
    title.style.color=iMine?'var(--jade-l)':'var(--gold)';
    sub.textContent=(msg.isTsumo?'自摸！':'放炮 / 點炮！')+(iMine?` +${msg.scoreChange}琪幣`:'') + (msg.fan?` ${msg.fan}番`:'');
  } else {
    title.textContent='流局'; title.style.color='var(--txt-d)';
    sub.textContent='牌庫耗盡，本局流局';
  }
  if(handsDiv&&msg.hands){
    handsDiv.innerHTML='';
    msg.hands.forEach(p=>{
      const row=el('div'); row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
      const nm=el('span'); nm.style.cssText='font-size:12px;color:var(--txt-d);min-width:52px;flex-shrink:0;';
      nm.textContent=p.id===playerId?'我':p.name;
      row.appendChild(nm);
      const ts=el('div'); ts.style.cssText='display:flex;gap:2px;flex-wrap:wrap;';
      [...(p.melds||[]).flat(),...p.hand].forEach(t=>ts.appendChild(mkTile(t,'xs')));
      row.appendChild(ts);
      handsDiv.appendChild(row);
    });
  }
  ov.classList.add('active');
}

function exitGame(){
  roomCode=null; isHost=false; myIdx=-1; myHand=[]; drawnTile=null;
  gameState=null; selTile=null; canTsumo=false; tenpaiSug=[]; inAction=false;
  $('overlay-gameover').classList.remove('active');
  document.querySelectorAll('.mode-checkbox').forEach(c=>{c.checked=false;c.closest?.('.mode-opt')?.classList.remove('sel');});
  $('room-code-section').style.display='none';
  if($('create-room-btn')) $('create-room-btn').disabled=true;
  selMode=null;
  showScreen('screen-main');
  toast('已返回大廳');
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  connect();
  initLogin();
  initFriendRoom();
  initQuickMatch();

  // Back buttons
  document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>showScreen(b.dataset.back)));

  // Lobby nav
  $('btn-go-friend')?.addEventListener('click',()=>showScreen('screen-friend'));
  $('btn-go-quest')?.addEventListener('click',()=>{ renderQuests(); showScreen('screen-quest'); });
  $('btn-go-leader')?.addEventListener('click',()=>{ showScreen('screen-leader'); loadLeaderboard(); });
  $('btn-go-quick')?.addEventListener('click',()=>{ showScreen('screen-quick'); });

  // Game over
  $('go-replay')?.addEventListener('click',()=>{ wsSend({type:'restart'}); $('overlay-gameover').classList.remove('active'); });
  $('go-exit')?.addEventListener('click',exitGame);
});
