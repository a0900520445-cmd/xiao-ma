let coins = 100;
let selected = "";
let hp = 100;
let ehp = 100;
let skill = 1;

function enterLobby(){
    document.getElementById("loginPage").classList.add("hidden");
    document.getElementById("lobbyPage").classList.remove("hidden");
}

function startSingle(){
    document.getElementById("lobbyPage").classList.add("hidden");
    document.getElementById("matchPage").classList.remove("hidden");

    let t = 5;
    let i = setInterval(()=>{
        t--;
        document.getElementById("countdown").innerText = t;

        if(t<=0){
            clearInterval(i);
            document.getElementById("matchPage").classList.add("hidden");
            document.getElementById("characterPage").classList.remove("hidden");
        }
    },1000);
}

function selectCharacter(c){
    selected = c;
}

function confirmCharacter(){
    document.getElementById("characterPage").classList.add("hidden");
    document.getElementById("gamePage").classList.remove("hidden");

    document.getElementById("playerCharacter").innerText = selected;
    document.getElementById("enemyCharacter").innerText = "AI";

    hp = 100;
    ehp = 100;
    update();
}

function attack(){
    ehp -= 10 * skill;

    if(ehp <= 0){
        alert("你贏了");
        coins += 20;
        return;
    }

    hp -= 10;

    if(hp <= 0){
        alert("你輸了");
        location.reload();
    }

    update();
}

function update(){
    document.getElementById("playerHpBar").style.width = hp + "%";
    document.getElementById("enemyHpBar").style.width = ehp + "%";
}

function upgradeSkill(){
    skill++;
    ehp = 100;
    update();
    document.getElementById("upgradeArea").classList.add("hidden");
}

function openShop(){ alert("更新中"); }
function openMulti(){ alert("更新中"); }

function openDaily(){
    document.getElementById("lobbyPage").classList.add("hidden");
    document.getElementById("dailyPage").classList.remove("hidden");
}

function backLobby(){
    document.getElementById("dailyPage").classList.add("hidden");
    document.getElementById("lobbyPage").classList.remove("hidden");
}

function claimDaily(n){
    coins += n*10;
    document.getElementById("coins").innerText = coins;
}
