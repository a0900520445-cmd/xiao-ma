// ═══════════════════════════════════════════════════════
//  水果大戰爭 — game.js
// ═══════════════════════════════════════════════════════

// ─── Helpers (safe, no DOM access at parse time) ──────
const $ = id => document.getElementById(id);

const G = {
  playerId:null, username:'', coins:0, dailyStreak:1,
  character:null, roomId:null, mode:null,
  myId:null, oppId:null, players:{},
  queueTimer:null, queueSecs:0, pendingMode:null,
  myWins:0, oppWins:0, pendingLevelUp:false,
  skillCdUntil:0, skillCdMs:1200,
  canvas:null, ctx:null, animId:null,
  fighters:{}, particles:[], hitFlash:{},
  arenaW:0, arenaH:0,
};

const CHARS = {
  mango:{ name:'芒妹',   emoji:'🥭', hp:300, atk:22, cd:1200, skillName:'芒果颶風',  bodyColor:'#FF8C00', accentColor:'#FFD166' },
  peach:{ name:'桃妹',   emoji:'🍑', hp:360, atk:16, cd:900,  skillName:'桃花亂舞',  bodyColor:'#FF69B4', accentColor:'#FFB3D1' },
  tea:  { name:'茶妹',   emoji:'🍵', hp:260, atk:26, cd:1000, skillName:'抹茶爆擊',  bodyColor:'#3CB371', accentColor:'#90EE90' },
  mimi: { name:'米米',   emoji:'🍚', hp:420, atk:14, cd:800,  skillName:'米粒風暴',  bodyColor:'#C8A96E', accentColor:'#F5DEB3' },
  lemon:{ name:'檸檬酸', emoji:'🍋', hp:240, atk:30, cd:1400, skillName:'酸液噴射',  bodyColor:'#FFD700', accentColor:'#FFFACD' },
};

// ─── Screen management ────────────────────────────────
function showScreen(name) {
  ['login','lobby','queue','game'].forEach(n => {
    const el = $('screen-' + n);
    if (el) el.classList.remove('active');
  });
  const target = $('screen-' + name);
  if (target) target.classList.add('active');
  if (name === 'game') setTimeout(initCanvas, 60);
  else stopCanvas();
  window.scrollTo(0,0);
}

// ─── Toast ────────────────────────────────────────────
function toast(msg, type='info', ms=2600) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  const tc = $('toastContainer');
  if (tc) tc.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, ms);
}

// ─── Modal ────────────────────────────────────────────
function openModal(id)  { const el=$(id); if(el) el.classList.add('active'); }
function closeModal(id) { const el=$(id); if(el) el.classList.remove('active'); }

// ═══════════════════════════════════════════════════════
//  CANVAS ENGINE
// ═══════════════════════════════════════════════════════

class Fighter {
  constructor(id, isLeft, charId, name) {
    this.id     = id;
    this.isLeft = isLeft;
    this.charId = charId;
    this.char   = CHARS[charId] || CHARS.mango;
    this.name   = name;
    this.x = 0; this.y = 0;
    this.baseX = 0; this.baseY = 0;
    this.vx = 0; this.vy = 0;
    this.w = 72; this.h = 90;
    this.state = 'idle'; this.stateTimer = 0;
    this.hp = this.char.hp; this.maxHp = this.char.hp;
    this.level = 1;
    this.flipX  = isLeft ? 1 : -1;
    this.idleOff = 0; this.idleDir = 1;
    this.idleSpd = 0.38 + Math.random() * 0.25;
  }

  setPos(W, H) {
    this.baseX = isNaN(W) ? 160 : (this.isLeft ? W * 0.22 : W * 0.78);
    this.baseY = isNaN(H) ? 220 : H * 0.56;
    this.x = this.baseX; this.y = this.baseY;
  }

  attack() { this.state = 'attack'; this.stateTimer = 28; this.vx = this.flipX * 6; }
  hurt()   { if(this.state==='dead') return; this.state='hurt'; this.stateTimer=18; this.vx=-this.flipX*5; this.vy=-3; }
  die()    { this.state='dead'; this.vy=-5; }

  update() {
    if(this.stateTimer>0) this.stateTimer--;
    if(this.stateTimer===0 && this.state!=='dead' && this.state!=='idle') this.state='idle';
    this.x += this.vx; this.y += this.vy;
    this.vy += 0.35;
    if(this.state==='idle'||this.state==='dead') this.vx*=0.80; else this.vx*=0.88;
    if(this.y > this.baseY) { this.y=this.baseY; this.vy=0; }
    if(this.state==='idle') {
      this.idleOff += this.idleDir * this.idleSpd;
      if(Math.abs(this.idleOff)>4) this.idleDir*=-1;
      this.x += (this.baseX - this.x) * 0.06;
    }
  }

  draw(ctx, flashFrames) {
    const flash = flashFrames > 0;
    const W=this.w, H=this.h;
    ctx.save();
    ctx.translate(this.x, this.y + this.idleOff);
    ctx.scale(this.flipX, 1);

    // Shadow
    ctx.save(); ctx.scale(1,0.22);
    ctx.beginPath(); ctx.ellipse(0, H*0.5+10, W*0.42, 9, 0,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fill(); ctx.restore();

    const c = this.char;
    const lean = this.state==='attack' ? 0.18 : 0;
    ctx.save(); ctx.rotate(lean * this.flipX);

    if(flash) { ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.55; }

    // Body
    ctx.beginPath(); ctx.ellipse(0,-H*0.28,W*0.46,H*0.50,0,0,Math.PI*2);
    ctx.fillStyle = flash ? '#ffffff' : c.bodyColor;
    ctx.shadowColor = c.bodyColor; ctx.shadowBlur = flash?0:20;
    ctx.fill(); ctx.shadowBlur=0;

    // Belly
    if(!flash) {
      ctx.beginPath(); ctx.ellipse(-W*0.06,-H*0.22,W*0.21,H*0.27,-0.2,0,Math.PI*2);
      ctx.fillStyle = c.accentColor+'99'; ctx.fill();
    }

    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;

    const eyeY=-H*0.36, eyeX=W*0.14;
    if(this.state!=='dead') {
      const sq = this.state==='attack'?3:0;
      [[-eyeX,eyeY-sq],[eyeX,eyeY-sq]].forEach(([ex,ey]) => {
        ctx.beginPath(); ctx.ellipse(ex,ey,7,7-sq,0,0,Math.PI*2);
        ctx.fillStyle=flash?'#fff':'#222'; ctx.fill();
        if(!flash){ctx.beginPath();ctx.arc(ex+2,ey-2,2.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();}
      });
      ctx.beginPath();
      if(this.state==='attack'){ctx.arc(0,eyeY+20,10,0,Math.PI);ctx.fillStyle='#cc2244';ctx.fill();}
      else if(this.state==='hurt'){ctx.arc(0,eyeY+22,8,Math.PI,Math.PI*2);ctx.strokeStyle='#553';ctx.lineWidth=2.5;ctx.stroke();}
      else{ctx.arc(0,eyeY+20,7,0,Math.PI);ctx.strokeStyle='#333';ctx.lineWidth=2.5;ctx.stroke();}
    } else {
      [[-eyeX,eyeY],[eyeX,eyeY]].forEach(([ex,ey])=>{
        ctx.save();ctx.translate(ex,ey);ctx.strokeStyle='#333';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(-5,-5);ctx.lineTo(5,5);ctx.stroke();
        ctx.beginPath();ctx.moveTo(5,-5);ctx.lineTo(-5,5);ctx.stroke();
        ctx.restore();
      });
    }

    // Fruit emoji on head
    ctx.font = Math.round(W*0.38)+'px serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(c.emoji, 0, -H*0.63);

    ctx.restore(); // lean

    // Level badge (no roundRect — use arc path)
    const bx=W*0.28, by=-H*0.63, bw=28, bh=16, br=7;
    ctx.beginPath();
    ctx.moveTo(bx+br, by);
    ctx.lineTo(bx+bw-br, by);
    ctx.arcTo(bx+bw, by, bx+bw, by+br, br);
    ctx.lineTo(bx+bw, by+bh-br);
    ctx.arcTo(bx+bw, by+bh, bx+bw-br, by+bh, br);
    ctx.lineTo(bx+br, by+bh);
    ctx.arcTo(bx, by+bh, bx, by+bh-br, br);
    ctx.lineTo(bx, by+br);
    ctx.arcTo(bx, by, bx+br, by, br);
    ctx.closePath();
    ctx.fillStyle='#c77dff'; ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 10px Nunito,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Lv'+this.level, bx+bw/2, by+bh/2);

    ctx.restore(); // main
  }
}

// ─── Particles ────────────────────────────────────────
class Spark {
  constructor(x,y,color){ this.x=x;this.y=y;this.vx=(Math.random()-.5)*10;this.vy=-(Math.random()*7+2);this.life=1;this.decay=0.032+Math.random()*0.025;this.r=3+Math.random()*6;this.color=color; }
  update(){ this.x+=this.vx;this.y+=this.vy;this.vy+=0.3;this.vx*=0.95;this.life-=this.decay; }
  draw(ctx){ ctx.save();ctx.globalAlpha=Math.max(0,this.life);ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fillStyle=this.color;ctx.shadowColor=this.color;ctx.shadowBlur=10;ctx.fill();ctx.restore(); }
}
class DmgNum {
  constructor(x,y,dmg){ this.x=x;this.y=y;this.vy=-3.5-Math.random()*1.5;this.life=1;this.decay=0.02;this.dmg=dmg;this.sc=0.5; }
  update(){ this.y+=this.vy;this.vy+=0.12;this.life-=this.decay;this.sc=Math.min(1.4,this.sc+0.08); }
  draw(ctx){ ctx.save();ctx.globalAlpha=Math.max(0,this.life);ctx.translate(this.x,this.y);ctx.scale(this.sc,this.sc);ctx.font='bold 30px "Baloo 2",cursive';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeStyle='#000';ctx.lineWidth=5;ctx.strokeText('-'+this.dmg,0,0);ctx.fillStyle='#ff4757';ctx.fillText('-'+this.dmg,0,0);ctx.restore(); }
}
class EmojiPop {
  constructor(x,y){ this.x=x;this.y=y;this.vx=(Math.random()-.5)*8;this.vy=-(Math.random()*6+2);this.life=1;this.decay=0.025;this.em=['✨','💥','⭐','🌟'][Math.floor(Math.random()*4)];this.r=16+Math.random()*8; }
  update(){ this.x+=this.vx;this.y+=this.vy;this.vy+=0.25;this.vx*=0.96;this.life-=this.decay; }
  draw(ctx){ ctx.save();ctx.globalAlpha=Math.max(0,this.life);ctx.font=this.r+'px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(this.em,this.x,this.y);ctx.restore(); }
}

function spawnHit(f, dmg) {
  const x=f.x, y=f.y-f.h*0.28;
  for(let i=0;i<10;i++) G.particles.push(new Spark(x,y,f.char.bodyColor));
  for(let i=0;i<4;i++)  G.particles.push(new EmojiPop(x,y));
  G.particles.push(new DmgNum(x, y-20, dmg));
}
function spawnAttack(f) {
  const x=f.x+(f.flipX*40), y=f.y-f.h*0.3;
  for(let i=0;i<8;i++) G.particles.push(new Spark(x,y,f.char.bodyColor));
}

// ─── Canvas init / loop ───────────────────────────────
const BG_CLOUDS = Array.from({length:6},()=>({x:Math.random()*900,y:20+Math.random()*55,r:28+Math.random()*38,spd:0.12+Math.random()*0.18,a:0.12+Math.random()*0.14}));

function drawBG(ctx,W,H) {
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#1a103a');sky.addColorStop(0.6,'#2d1b69');sky.addColorStop(1,'#0d0a1a');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
  // stars
  for(let i=0;i<38;i++){
    const sx=((i*137.5+30)%W), sy=((i*79.3+10)%(H*0.62));
    const br=Math.sin(Date.now()*0.001+i)*0.5+0.5;
    ctx.globalAlpha=0.25+br*0.55; ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(sx,sy,0.9+br,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
  // clouds
  BG_CLOUDS.forEach(c=>{
    c.x+=c.spd; if(c.x>W+80)c.x=-80;
    ctx.save(); ctx.globalAlpha=c.a; ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.ellipse(c.x,c.y,c.r,c.r*0.52,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x+c.r*0.48,c.y+4,c.r*0.62,c.r*0.38,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
  // ground
  const grd=ctx.createLinearGradient(0,H*0.7,0,H);
  grd.addColorStop(0,'#3a2060'); grd.addColorStop(1,'#1e1040');
  ctx.fillStyle=grd; ctx.beginPath(); ctx.moveTo(0,H*0.72);
  for(let x=0;x<=W;x+=36) ctx.lineTo(x,H*0.72+Math.sin(x*0.04+Date.now()*0.0008)*5);
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
  // ground glow
  const gg=ctx.createRadialGradient(W/2,H*0.72,0,W/2,H*0.72,W*0.55);
  gg.addColorStop(0,'rgba(160,80,255,0.13)');gg.addColorStop(1,'transparent');
  ctx.fillStyle=gg; ctx.fillRect(0,H*0.6,W,H*0.4);
}

function loop() {
  G.animId = requestAnimationFrame(loop);
  const ctx=G.ctx, W=G.arenaW, H=G.arenaH;
  if(!ctx||!W||!H) return;
  ctx.clearRect(0,0,W,H);
  drawBG(ctx,W,H);
  Object.values(G.fighters).forEach(f=>{
    f.update();
    const hf=(G.hitFlash[f.id]||0);
    if(hf>0) G.hitFlash[f.id]=hf-1;
    f.draw(ctx,hf);
  });
  G.particles=G.particles.filter(p=>p.life>0);
  G.particles.forEach(p=>{p.update();p.draw(ctx);});
}

function initCanvas() {
  G.canvas=$('gameCanvas'); G.ctx=G.canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize',resizeCanvas);
  if(!G.animId) loop();
}
function stopCanvas() {
  if(G.animId){cancelAnimationFrame(G.animId);G.animId=null;}
  window.removeEventListener('resize',resizeCanvas);
}
function resizeCanvas() {
  const wrap=document.querySelector('.arena-wrap');
  if(!wrap||!G.canvas) return;
  G.arenaW=wrap.clientWidth; G.arenaH=wrap.clientHeight;
  G.canvas.width=G.arenaW; G.canvas.height=G.arenaH;
  Object.values(G.fighters).forEach(f=>f.setPos(G.arenaW,G.arenaH));
}

// ─── Arena overlay message ────────────────────────────
function showArenaMsg(text, color, ms=1800) {
  const el=$('arenaMsg'); if(!el)return;
  el.textContent=text; el.style.color=color; el.style.opacity='1';
  clearTimeout(el._t);
  el._t=setTimeout(()=>{el.style.opacity='0';},ms);
}

// ─── Cooldown ring ────────────────────────────────────
let cdInterval=null;
function startCdRing(ms) {
  const btn=$('btnSkill'); if(!btn) return;
  btn.disabled=true;
  G.skillCdUntil=Date.now()+ms; G.skillCdMs=ms;
  $('cdText').textContent=(ms/1000).toFixed(1)+'s';
  clearInterval(cdInterval);
  cdInterval=setInterval(()=>{
    const rem=G.skillCdUntil-Date.now();
    if(rem<=0){
      clearInterval(cdInterval);
      if($('btnSkill')) $('btnSkill').disabled=false;
      if($('cdText'))   $('cdText').textContent='';
      if($('skillCdRing')) $('skillCdRing').style.background='none';
      return;
    }
    if($('cdText')) $('cdText').textContent=(rem/1000).toFixed(1)+'s';
    const deg=Math.round((1-rem/G.skillCdMs)*360);
    if($('skillCdRing')) $('skillCdRing').style.background=`conic-gradient(rgba(255,255,255,.35) ${deg}deg,transparent ${deg}deg)`;
  },50);
}

// ─── HUD ──────────────────────────────────────────────
function updateHUD(state) {
  if(!state) return;
  const ms=state[G.myId], os=state[G.oppId];
  if(ms){
    const p=ms.hp/ms.maxHp*100;
    const hb=$('hudLeftHp'); if(hb){hb.style.width=p+'%';hb.classList.toggle('low',p<35);}
    const ht=$('hudLeftHpText'); if(ht)ht.textContent=Math.max(0,ms.hp)+'/'+ms.maxHp;
    const hl=$('hudLeftLevel'); if(hl)hl.textContent='Lv.'+ms.level;
    const f=G.fighters[G.myId]; if(f){f.hp=ms.hp;f.maxHp=ms.maxHp;f.level=ms.level;}
  }
  if(os){
    const p=os.hp/os.maxHp*100;
    const hb=$('hudRightHp'); if(hb){hb.style.width=p+'%';hb.classList.toggle('low',p<35);}
    const ht=$('hudRightHpText'); if(ht)ht.textContent=Math.max(0,os.hp)+'/'+os.maxHp;
    const hl=$('hudRightLevel'); if(hl)hl.textContent='Lv.'+os.level;
    const f=G.fighters[G.oppId]; if(f){f.hp=os.hp;f.maxHp=os.maxHp;f.level=os.level;}
  }
}
function updateWinDots() {
  ['myW1','myW2','myW3'].forEach((id,i)=>{const e=$(id);if(e)e.classList.toggle('filled',i<G.myWins);});
  ['opW1','opW2','opW3'].forEach((id,i)=>{const e=$(id);if(e)e.classList.toggle('filled',i<G.oppWins);});
}
function addLog(msg,cls='') {
  const log=$('battleLog'); if(!log)return;
  const el=document.createElement('div'); el.className='log-entry '+cls; el.textContent=msg;
  log.appendChild(el);
  while(log.children.length>35) log.removeChild(log.firstChild);
  log.scrollTop=log.scrollHeight;
}

// ═══════════════════════════════════════════════════════
//  SOCKET
// ═══════════════════════════════════════════════════════
const socket = io();

// ─── Login ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  $('btnLogin').addEventListener('click', () => {
    const username=$('inputUsername').value.trim();
    const google=$('inputGoogle').value.trim();
    if(!username){ toast('請輸入玩家名稱！','error'); return; }
    if(!google||!google.includes('@')){ toast('請輸入有效 Google 帳號！','error'); return; }
    G.username=username;
    socket.emit('register',{username,googleAccount:google});
  });

  // ─── Lobby buttons ──────────────────────────────────
  $('btnSolo').addEventListener('click',  ()=>openCharSelect('solo'));
  $('btnMulti').addEventListener('click', ()=>openCharSelect('multi'));
  $('btnShop').addEventListener('click',  ()=>openModal('modalShop'));
  $('btnDaily').addEventListener('click', ()=>openDailyModal());
  $('btnShopClose').addEventListener('click',  ()=>closeModal('modalShop'));
  $('btnDailyClose').addEventListener('click', ()=>closeModal('modalDaily'));
  $('btnCharCancel').addEventListener('click',  ()=>closeModal('modalCharSelect'));
  $('btnCharConfirm').addEventListener('click', ()=>{
    if(!G.character){ toast('請選擇角色！','error'); return; }
    closeModal('modalCharSelect');
    G.pendingMode==='solo' ? startSolo() : startMulti();
  });
  $('btnLeaveQueue').addEventListener('click', ()=>{
    clearInterval(G.queueTimer); socket.emit('leaveQueue'); showScreen('lobby'); toast('已離開配對佇列','info');
  });
  $('btnClaimDaily').addEventListener('click', ()=>socket.emit('claimDaily'));
  $('btnDoLevelUp').addEventListener('click', ()=>{
    if(!G.pendingLevelUp)return;
    G.pendingLevelUp=false; closeModal('modalLevelUp');
    socket.emit('levelUpSkill',{roomId:G.roomId});
    toast('🚀 技能升級！','success');
  });
  $('btnSkill').addEventListener('click', ()=>{
    if(!G.roomId)return;
    socket.emit('useSkill',{roomId:G.roomId});
  });
  $('btnBackLobby').addEventListener('click', ()=>{
    closeModal('modalResult');
    G.roomId=null;G.oppId=null;G.myWins=0;G.oppWins=0;
    G.fighters={};G.particles=[];
    const bl=$('battleLog'); if(bl) bl.innerHTML='';
    showScreen('lobby');
  });

}); // DOMContentLoaded

// ─── Socket events ────────────────────────────────────
socket.on('registered',({playerId,coins,dailyStreak})=>{
  G.playerId=playerId; G.myId=playerId; G.coins=coins; G.dailyStreak=dailyStreak;
  const pn=$('lobbyPlayerName'); if(pn)pn.textContent=G.username;
  const cd=$('coinsDisplay');    if(cd)cd.textContent=coins;
  showScreen('lobby');
  toast('歡迎，'+G.username+'！🎉','success');
});

socket.on('dailyResult',({success,reward,coins,msg,nextStreak})=>{
  if(!success){ const dm=$('dailyMsg');if(dm){dm.textContent=msg;dm.style.color='var(--red)';}return; }
  G.coins=coins; G.dailyStreak=nextStreak;
  const cd=$('coinsDisplay');if(cd)cd.textContent=coins;
  const dm=$('dailyMsg');if(dm){dm.textContent='✅ 成功領取 '+reward+' 華幣！';dm.style.color='var(--green)';}
  toast('🪙 獲得 '+reward+' 華幣！','success');
  openDailyModal();
});

socket.on('queueJoined',({position})=>{
  const qs=$('queueStatus');if(qs)qs.textContent='佇列中... 第 '+position+' 位';
});

socket.on('matchFound',({roomId,players,yourId,state})=>{
  clearInterval(G.queueTimer);
  G.roomId=roomId;
  if(yourId) G.myId=yourId;
  players.forEach(p=>{ G.players[p.id]=p; });
  const me=G.players[G.myId];
  const opp=players.find(p=>p.id!==G.myId);
  if(!opp)return;
  G.oppId=opp.id; G.myWins=0; G.oppWins=0;
  updateWinDots();
  const meC=CHARS[me.character]||CHARS.mango;
  const opC=CHARS[opp.character]||CHARS.mango;
  const la=$('hudLeftAvatar');  if(la)la.textContent=meC.emoji;
  const ln=$('hudLeftName');    if(ln)ln.textContent=me.username;
  const ra=$('hudRightAvatar'); if(ra)ra.textContent=opC.emoji;
  const rn=$('hudRightName');   if(rn)rn.textContent=opp.username;
  const rnum=$('roundNum');     if(rnum)rnum.textContent='1';
  const sl=$('skillLabel');     if(sl)sl.textContent=meC.skillName;
  updateHUD(state);
  showScreen('game');
  setTimeout(()=>{
    G.fighters={}; G.particles=[]; G.hitFlash={};
    const fMe=new Fighter(G.myId,true,me.character,me.username);
    const fOp=new Fighter(G.oppId,false,opp.character,opp.username);
    fMe.setPos(G.arenaW,G.arenaH); fOp.setPos(G.arenaW,G.arenaH);
    if(state&&state[G.myId])  { fMe.hp=state[G.myId].hp;  fMe.maxHp=state[G.myId].maxHp; }
    if(state&&state[G.oppId]) { fOp.hp=state[G.oppId].hp; fOp.maxHp=state[G.oppId].maxHp; }
    G.fighters[G.myId]=fMe; G.fighters[G.oppId]=fOp;
    const btn=$('btnSkill'); if(btn){btn.disabled=false;}
    const ct=$('cdText');    if(ct)ct.textContent='';
    clearInterval(cdInterval);
  },120);
  addLog('⚔️ 戰鬥開始！','log-system');
  addLog(meC.emoji+' '+me.username+' vs '+opC.emoji+' '+opp.username,'log-system');
  showArenaMsg('FIGHT! 💥','#FFD166',2000);
});

socket.on('yourId',({yourId})=>{ G.myId=yourId; });

socket.on('skillCooldown',({remaining})=>{ if(remaining>0) startCdRing(remaining); });

socket.on('battleUpdate',({attackerId,defenderId,damage,skillName,state,cdFor,cdMs,levelUp})=>{
  if(attackerId&&defenderId){
    const af=G.fighters[attackerId], df=G.fighters[defenderId];
    if(af){ af.attack(); spawnAttack(af); }
    if(df&&damage>0){ df.hurt(); spawnHit(df,damage); G.hitFlash[defenderId]=8; }
    const aName=(G.players[attackerId]&&G.players[attackerId].username)||'CPU';
    addLog('💥 '+aName+' 使用 '+skillName+' 造成 '+damage+' 傷害！','log-dmg');
    if(cdFor===G.myId&&cdMs) startCdRing(cdMs);
  }
  if(levelUp){
    const who=levelUp.playerId===G.myId?'你':((G.players[levelUp.playerId]&&G.players[levelUp.playerId].username)||'對手');
    addLog('⬆️ '+who+' 技能升至 Lv.'+levelUp.level+'！','log-system');
    showArenaMsg('✨ Lv.'+levelUp.level+'！','#c77dff',1500);
  }
  updateHUD(state);
});

socket.on('roundEnd',({winnerId,wins})=>{
  G.myWins=wins[G.myId]||0; G.oppWins=wins[G.oppId]||0;
  updateWinDots();
  const iWon=winnerId===G.myId;
  const loserId=iWon?G.oppId:G.myId;
  const lf=G.fighters[loserId]; if(lf)lf.die();
  showArenaMsg(iWon?'🏆 本回合勝利！':'💀 本回合落敗...',iWon?'#2ed573':'#ff4757',2500);
  addLog(iWon?'🏆 本回合勝利！':'💀 本回合落敗...','log-system');
  toast(iWon?'🎉 本回合勝利！':'💔 本回合落敗',iWon?'success':'error');
  const btn=$('btnSkill'); if(btn)btn.disabled=true;
  clearInterval(cdInterval);
  const ct=$('cdText'); if(ct)ct.textContent='';
});

socket.on('newRound',({round,state})=>{
  const rn=$('roundNum'); if(rn)rn.textContent=round;
  addLog('─── 第 '+round+' 回合 ───','log-system');
  showArenaMsg('第 '+round+' 回合！','#74b9ff',1800);
  updateHUD(state);
  Object.values(G.fighters).forEach(f=>{
    f.state='idle'; f.stateTimer=0; f.vy=0; f.vx=0;
    f.x=f.baseX; f.y=f.baseY; f.idleOff=0;
    const s=state&&state[f.id]; if(s){f.hp=s.hp;f.maxHp=s.maxHp;f.level=s.level;}
  });
  const btn=$('btnSkill'); if(btn)btn.disabled=false;
  const ct=$('cdText'); if(ct)ct.textContent='';
  clearInterval(cdInterval);
});

socket.on('levelUpPrompt',()=>{ G.pendingLevelUp=true; openModal('modalLevelUp'); });
socket.on('skillLeveled',({level,atk,cd})=>{ G.skillCdMs=cd; addLog('⬆️ 技能升至 Lv.'+level+'！ATK:'+atk,'log-system'); });

socket.on('matchEnd',({winnerId})=>{
  const iWon=winnerId===G.myId;
  const opp=G.players[G.oppId];
  const re=$('resultEmoji'); if(re)re.textContent=iWon?'🏆':'💔';
  const rt=$('resultTitle'); if(rt){rt.textContent=iWon?'勝利！':'敗北...';rt.className='result-title '+(iWon?'win':'lose');}
  const rd=$('resultDesc');  if(rd)rd.textContent=iWon?'恭喜你擊敗了 '+(opp&&opp.username)+'！':'被 '+(opp&&opp.username)+' 擊敗，再接再厲！';
  const rc=$('resultCoins'); if(rc){rc.style.display=iWon?'block':'none';rc.textContent='🪙 獲得 50 華幣！';}
  setTimeout(()=>openModal('modalResult'),1200);
});

socket.on('coinsUpdate',({coins})=>{ G.coins=coins; const cd=$('coinsDisplay');if(cd)cd.textContent=coins; });

socket.on('opponentLeft',()=>{
  toast('對手離線，你自動獲勝！🏆','success');
  const re=$('resultEmoji'); if(re)re.textContent='🏆';
  const rt=$('resultTitle'); if(rt){rt.textContent='對手離線！';rt.className='result-title win';}
  const rd=$('resultDesc');  if(rd)rd.textContent='對手斷線，你自動獲勝。';
  const rc=$('resultCoins'); if(rc)rc.style.display='none';
  setTimeout(()=>openModal('modalResult'),800);
});

// ─── Char select ──────────────────────────────────────
function openCharSelect(mode) {
  G.pendingMode=mode;
  const grid=$('charGrid'); if(!grid)return;
  grid.innerHTML='';
  Object.entries(CHARS).forEach(([id,c])=>{
    const card=document.createElement('div');
    card.className='char-card'; card.dataset.char=id;
    card.innerHTML='<div class="char-emoji">'+c.emoji+'</div>'
      +'<div class="char-name">'+c.name+'</div>'
      +'<div class="char-stats">HP:'+c.hp+' ATK:'+c.atk+'</div>'
      +'<div class="char-skill">✨ '+c.skillName+'</div>';
    card.addEventListener('click',()=>{
      document.querySelectorAll('.char-card').forEach(x=>x.classList.remove('selected'));
      card.classList.add('selected'); G.character=id;
    });
    grid.appendChild(card);
  });
  G.character='mango';
  const first=grid.querySelector('.char-card'); if(first)first.classList.add('selected');
  openModal('modalCharSelect');
}

// ─── Daily modal ──────────────────────────────────────
const DAILY_REWARDS=[30,40,50,60,70,80,100];
function openDailyModal() {
  const grid=$('dailyGrid'); if(!grid)return;
  grid.innerHTML='';
  DAILY_REWARDS.forEach((r,i)=>{
    const d=i+1, div=document.createElement('div');
    div.className='daily-day'+(d===G.dailyStreak?' current':'')+(d<G.dailyStreak?' claimed':'');
    div.innerHTML='<div class="day-num">第'+d+'天</div><div class="day-icon">'+(d<G.dailyStreak?'✅':'🪙')+'</div><div class="day-reward">'+r+'</div>';
    grid.appendChild(div);
  });
  const dm=$('dailyMsg'); if(dm)dm.textContent='';
  openModal('modalDaily');
}

// ─── Queue ────────────────────────────────────────────
function startQueueScreen(title,status) {
  const qt=$('queueTitle'),qs=$('queueStatus'),qtm=$('queueTimer');
  if(qt)qt.textContent=title; if(qs)qs.textContent=status; if(qtm)qtm.textContent='0';
  G.queueSecs=0; clearInterval(G.queueTimer);
  G.queueTimer=setInterval(()=>{ G.queueSecs++; const q=$('queueTimer');if(q)q.textContent=G.queueSecs; },1000);
  showScreen('queue');
}
function startSolo() {
  G.mode='solo'; startQueueScreen('單機配對大廳','5 秒後進入遊戲...');
  let c=5;
  const cd=setInterval(()=>{
    c--; const qs=$('queueStatus');
    if(qs)qs.textContent=c>0?c+' 秒後進入遊戲...':'載入中...';
    if(c<=0){ clearInterval(cd); socket.emit('joinSoloQueue',{character:G.character}); }
  },1000);
}
function startMulti() {
  G.mode='multi'; startQueueScreen('多人配對大廳','尋找對手中...');
  socket.emit('joinMultiQueue',{character:G.character});
}
