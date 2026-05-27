# game.js

```javascript
const socket = new WebSocket(`ws://${location.host}`);

let coins = Number(localStorage.getItem("coins")) || 100;
let selectedCharacter = "";
let playerName = "";
let playerHp = 100;
let enemyHp = 100;
let skillLevel = 1;
let enemyCharacter = "";
let dailyClaimed = JSON.parse(localStorage.getItem("dailyClaimed")) || {};

const characters = [
    {
        name: "芒妹",
        emoji: "🥭",
        skill: "芒果衝擊"
    },
    {
        name: "桃妹",
        emoji: "🍑",
        skill: "甜桃爆擊"
    },
    {
        name: "茶妹",
        emoji: "🧋",
        skill: "珍奶龍捲風"
    },
    {
        name: "米米",
        emoji: "🍙",
        skill: "飯糰重擊"
    },
    {
        name: "檸檬酸",
        emoji: "🍋",
        skill: "超酸光波"
    }
];

updateCoins();

socket.onopen = () => {
    console.log("已連接多人伺服器");
};

socket.onmessage = (event) => {
    console.log("收到訊息：", event.data);
};

function enterLobby(){

    const name = document.getElementById("playerName").value.trim();
    const account = document.getElementById("googleAccount").value.trim();

    if(name === ""){
        alert("請輸入名字");
        return;
    }

    if(account === ""){
        alert("請輸入Google帳號");
        return;
    }

    playerName = name;

    localStorage.setItem("playerName", name);
    localStorage.setItem("googleAccount", account);

    document.getElementById("loginPage").classList.add("hidden");
    document.getElementById("lobbyPage").classList.remove("hidden");

    playLobbyMusic();
}

function updateCoins(){

    const coinText = document.getElementById("coins");

    if(coinText){
        coinText.innerText = coins;
    }

    localStorage.setItem("coins", coins);
}

function playLobbyMusic(){

    let audio = document.getElementById("bgm");

    if(audio){
        audio.volume = 0.4;
        audio.play().catch(()=>{});
    }
}

function openShop(){
    alert("商店正在更新中...");
}

function openMulti(){
    alert("多人模式正在更新中...");
}

function openDaily(){

    document.getElementById("lobbyPage").classList.add("hidden");
    document.getElementById("dailyPage").classList.remove("hidden");
}

function backLobby(){

    document.getElementById("dailyPage").classList.add("hidden");
    document.getElementById("lobbyPage").classList.remove("hidden");
}

function startSingle(){

    document.getElementById("lobbyPage").classList.add("hidden");
    document.getElementById("matchPage").classList.remove("hidden");

    let seconds = 5;

    document.getElementById("countdown").innerText = seconds;

    const timer = setInterval(()=>{

        seconds--;

        document.getElementById("countdown").innerText = seconds;

        if(seconds <= 0){

            clearInterval(timer);

            document.getElementById("matchPage").classList.add("hidden");
            document.getElementById("characterPage").classList.remove("hidden");
        }

    },1000);
}

function selectCharacter(name){

    selectedCharacter = name;

    document.querySelectorAll(".character").forEach(card=>{
        card.style.border = "none";
    });

    event.currentTarget.style.border = "5px solid yellow";
}

function confirmCharacter(){

    if(selectedCharacter === ""){
        alert("請先選擇角色！");
        return;
    }

    const randomIndex = Math.floor(Math.random() * characters.length);

    enemyCharacter = characters[randomIndex].name;

    playerHp = 100;
    enemyHp = 100;
    skillLevel = 1;

    document.getElementById("characterPage").classList.add("hidden");
    document.getElementById("gamePage").classList.remove("hidden");

    document.getElementById("playerCharacter").innerText = selectedCharacter;
    document.getElementById("enemyCharacter").innerText = enemyCharacter;

    document.getElementById("upgradeArea").classList.add("hidden");

    updateHp();

    addBattleLog("戰鬥開始！");
}

function attack(){

    const damage = Math.floor(Math.random() * 10) + (10 * skillLevel);

    enemyHp -= damage;

    if(enemyHp < 0){
        enemyHp = 0;
    }

    updateHp();

    addBattleLog(`${selectedCharacter} 造成 ${damage} 傷害！`);

    createEffect();

    if(enemyHp <= 0){

        addBattleLog("敵人被擊敗！");

        coins += 20;
        updateCoins();

        document.getElementById("upgradeArea").classList.remove("hidden");

        return;
    }

    setTimeout(()=>{

        const enemyDamage = Math.floor(Math.random() * 15) + 5;

        playerHp -= enemyDamage;

        if(playerHp < 0){
            playerHp = 0;
        }

        updateHp();

        addBattleLog(`${enemyCharacter} 攻擊你 ${enemyDamage} 傷害！`);

        if(playerHp <= 0){

            addBattleLog("你輸了！");

            setTimeout(()=>{
                alert("戰鬥失敗！");
                location.reload();
            },1000);
        }

    },700);
}

function updateHp(){

    document.getElementById("playerHp").style.width = playerHp + "%";
    document.getElementById("enemyHp").style.width = enemyHp + "%";
}

function upgradeSkill(){

    skillLevel++;

    enemyHp = 100;

    updateHp();

    document.getElementById("upgradeArea").classList.add("hidden");

    addBattleLog(`技能升級成功！目前 Lv.${skillLevel}`);

    alert(`技能已升級到 Lv.${skillLevel}`);
}

function addBattleLog(text){

    let log = document.getElementById("battleLog");

    if(!log){
        return;
    }

    const p = document.createElement("p");
    p.innerText = text;

    log.prepend(p);
}

function createEffect(){

    const effect = document.createElement("div");

    effect.className = "skillEffect";

    document.body.appendChild(effect);

    setTimeout(()=>{
        effect.remove();
    },500);
}

function claimDaily(day){

    const today = new Date().toDateString();

    if(dailyClaimed[day] === today){
        alert("今天已經領過了！");
        return;
    }

    const rewards = {
        1:30,
        2:40,
        3:50,
        4:60,
        5:70,
        6:80,
        7:100
    };

    const reward = rewards[day];

    coins += reward;

    updateCoins();

    dailyClaimed[day] = today;

    localStorage.setItem("dailyClaimed", JSON.stringify(dailyClaimed));

    alert(`獲得 ${reward} 華幣！`);
}

window.onload = () => {

    updateCoins();

    const savedName = localStorage.getItem("playerName");
    const savedAccount = localStorage.getItem("googleAccount");

    if(savedName){
        document.getElementById("playerName").value = savedName;
    }

    if(savedAccount){
        document.getElementById("googleAccount").value = savedAccount;
    }
};

```
