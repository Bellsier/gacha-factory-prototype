(function(G){'use strict';
class Game{
 constructor(){
  this.state={version:1,region:'meadow',player:{x:420,y:520,hp:100,facing:{x:0,y:1},moving:false},inventory:Object.fromEntries(Object.keys(G.resources).map(k=>[k,0])),xp:{mining:0,melee:0,ranged:0},pick:1,sword:1,research:{},equipment:{},visited:['meadow'],records:[],flags:{},puzzles:{},teleports:[],ore:{},farm:{stage:0,readyAt:0},decorations:[],lanterns:0,clock:0,kills:0};
  this.world=G.makeWorld('meadow');this.effects=[];this.projectiles=[];this.panel=null;this.notice='공방에 오신 것을 환영합니다. 오른쪽 구리 광맥에서 E로 채굴하세요.';this.noticeTime=7;this.cooldown=0;this.attackTime=0;this.bike=false;this.riding=false;this.invulnerable=0;
 }
 say(text){this.notice=text;this.noticeTime=5;return false;}
 burst(x,y,color,text){this.effects.push({x,y,color,text,life:.7});}
 nearest(){const p=this.state.player;let best=null,dist=65;for(const o of this.world.objects){if(!o.name)continue;const d=Math.hypot(p.x-o.x,p.y-(o.ay??o.y));if(d<dist){best=o;dist=d;}}return best;}
 move(dx,dy,dt,speed=G.SPEED,actor=this.state.player){const len=Math.hypot(dx,dy);if(!len)return;dx/=len;dy/=len;const steps=Math.max(1,Math.ceil(speed*dt/6)),sx=dx*speed*dt/steps,sy=dy*speed*dt/steps;for(let i=0;i<steps;i++){if(!G.collides(this.world,actor.x+sx,actor.y))actor.x+=sx;if(!G.collides(this.world,actor.x,actor.y+sy))actor.y+=sy;}}
 step(dt,input={}){
  dt=G.clamp(Number(dt)||0,0,.1);if(this.panel)return;this.state.clock+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.attackTime=Math.max(0,this.attackTime-dt);this.noticeTime=Math.max(0,this.noticeTime-dt);
  const p=this.state.player,dx=(input.right?1:0)-(input.left?1:0),dy=(input.down?1:0)-(input.up?1:0),ox=p.x,oy=p.y;
  if(this.riding){p.x=G.clamp(p.x+dx*G.SPEED*2*dt,300,1000);p.y=650;}else this.move(dx,dy,dt,G.SPEED*(this.bike?1.7:1));
  p.moving=p.x!==ox||p.y!==oy;if(dx||dy){const d=Math.hypot(dx,dy);p.facing={x:dx/d,y:dy/d};}
  this.invulnerable=Math.max(0,this.invulnerable-dt);
  for(const e of this.world.enemies){if(e.hp<=0)continue;e.cooldown=Math.max(0,e.cooldown-dt);e.hit=Math.max(0,e.hit-dt);const dist=G.distance(p,e);if(dist<260&&dist>28)this.move(p.x-e.x,p.y-e.y,dt,65,e);if(dist<35&&e.cooldown===0){e.cooldown=1;if(this.damage(8))return;}}
  for(const shot of this.projectiles){shot.life-=dt;const steps=Math.ceil(shot.speed*dt/6);for(let i=0;i<steps&&shot.life>0;i++){shot.x+=shot.dx*shot.speed*dt/steps;shot.y+=shot.dy*shot.speed*dt/steps;if(G.collides(this.world,shot.x,shot.y,3)){shot.life=0;break;}const e=this.world.enemies.find(e=>e.hp>0&&G.distance(e,shot)<24);if(e){this.hitEnemy(e,16,true);shot.life=0;}}}
  this.projectiles=this.projectiles.filter(s=>s.life>0);this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);
 }
 interact(){
  if(this.panel||this.cooldown>0)return false;
  if(this.riding){const p=this.state.player,exit=[[p.x,695],[p.x,605],[p.x-45,695],[p.x+45,695]].find(([x,y])=>!G.collides(this.world,x,y));if(!exit)return this.say('내릴 공간이 없습니다. 수레를 조금 움직여 주세요.');const cart=this.world.objects.find(o=>o.kind==='cart');if(cart)cart.x=p.x;this.riding=false;[p.x,p.y]=exit;this.cooldown=.3;this.say('수레에서 내렸습니다.');return true;}
  const o=this.nearest();if(!o)return this.say('조금 더 가까이 다가가세요.');
  if(o.kind==='ore'){
   const r=G.resources[o.resource];if(this.state.pick<r.grade)return this.say(`등급 ${r.grade} 곡괭이가 필요합니다. 공방에서 강화하세요.`);const n=this.state.ore[o.id]||{hits:0,readyAt:0};if(n.readyAt>this.state.clock)return this.say(`광맥 회복 중 · ${Math.ceil(n.readyAt-this.state.clock)}초`);if(n.hits>=4)n.hits=0;n.hits++;if(n.hits>=4)n.readyAt=this.state.clock+24;this.state.ore[o.id]=n;this.state.inventory[o.resource]+=2;this.state.xp.mining++;this.cooldown=.3;this.attackTime=.2;this.burst(o.x,o.y,r.color,r.name+' +2');this.say(`${r.name} +2 → 공용 저장소`);return true;
  }
  if(o.kind==='gate'){this.enter(o.target);return true;}
  if(o.kind==='house'){this.state.player.hp=100;return this.say('집에서 잠시 쉬었습니다. 체력이 모두 회복됐습니다.');}
  if(o.kind==='warehouse'){this.panel={type:'inventory',title:'공용 저장소'};return true;}
  if(o.kind==='workshop'){this.panel={type:'workshop',title:'채굴 공방 · 제작과 연구'};return true;}
  if(o.kind==='record'){if(this.state.region==='b4'&&!this.state.flags.lab)return this.say('연구실의 전력과 난방을 복구해야 기록을 읽을 수 있습니다.');this.state.records=[...new Set([...this.state.records,this.state.region])];this.panel={type:'message',title:o.name,text:o.text};return true;}
  if(o.kind==='log'){const n=this.state.ore[o.id]||{hits:0,readyAt:0};if(n.readyAt>this.state.clock)return this.say('가지를 모았습니다. 잠시 뒤 다시 찾아보세요.');n.hits=1;n.readyAt=this.state.clock+12;this.state.ore[o.id]=n;this.state.inventory.wood+=4;this.cooldown=.3;this.burst(o.x,o.y,'#d5b276','목재 +4');return this.say('목재 +4 → 공용 저장소');}
  if(o.kind==='repair'||o.kind==='landmark'){if(this.state.flags[o.flag])return this.say(o.name+' · 복구 완료');if(!this.pay(o.cost))return false;this.state.flags[o.flag]=true;this.syncWorld();this.cooldown=.3;this.burst(o.x,o.y,'#d6db9f','복구 완료');this.say(o.name+' 복구 완료');return true;}
  if(o.kind==='switch'){const n=this.state.puzzles[o.puzzle]||0;if(n===3)return this.say('이미 장치를 모두 복구했습니다.');this.state.puzzles[o.puzzle]=o.sequence[n]===o.order?n+1:0;this.cooldown=.25;this.say(this.state.puzzles[o.puzzle]===3?'복구 완료! 오래된 장치에 다시 빛이 돌아왔습니다.':this.state.puzzles[o.puzzle]===0?'순서가 맞지 않습니다. 장치 기록을 확인하세요.':`장치 연결 ${this.state.puzzles[o.puzzle]} / 3`);return true;}
  if(o.kind==='lab'){if(this.state.puzzles.power!==3||this.state.puzzles.heat!==3)return this.say('B2 전력 장치와 B3 난방 장치를 먼저 복구하세요.');this.state.flags.lab=true;this.state.records=[...new Set([...this.state.records,'b4'])];this.panel={type:'message',title:'탐험 완료 · 마지막 연구실',text:'전력과 온기가 돌아오자 남겨진 기록이 읽히기 시작합니다. 의식 이전과 오염된 물질에 대한 단편입니다. 아직 밝혀지지 않은 이야기를 남겨 두고, 마을로 돌아갑니다. B4 탐험 목표를 완료했습니다.'};return true;}
  if(o.kind==='cart'){if(!this.state.flags.rail)return this.say('북쪽의 옛 철도 분기기를 돌 2개로 복구하세요.');this.riding=true;this.state.player.x=o.x;this.state.player.y=650;this.cooldown=.3;this.say('레일 수레 탑승 · A/D 이동 · E 내리기');return true;}
  if(o.kind==='teleport'){if(!this.state.research.ancient)return this.say('공방에서 고대 기술을 연구하면 활성화할 수 있습니다.');this.state.teleports=[...new Set([...this.state.teleports,this.state.region])];this.panel={type:'teleport',title:'활성화한 텔레포터'};return true;}
  if(o.kind==='farm'){const f=this.state.farm;this.cooldown=.3;if(f.stage===0){f.stage=1;this.say('순무 씨앗을 심었습니다. E로 물을 주세요.');}else if(f.stage===1){f.stage=2;f.readyAt=this.state.clock+30;this.say('물을 주었습니다. 플레이 시간 30초 후 자랍니다.');}else if(this.state.clock<f.readyAt)this.say(`순무가 자라는 중 · ${Math.ceil(f.readyAt-this.state.clock)}초`);else{f.stage=0;this.state.inventory.crop+=3;this.burst(o.x,o.y,'#decca4','순무 +3');this.say('순무 +3 · Q로 먹으면 체력 30 회복');}return true;}
  this.panel={type:'message',title:o.name,text:o.text||'이곳의 장치를 살펴보았습니다.'};return true;
 }
 enter(id){const previous=this.state.region,from=G.regions.findIndex(r=>r.id===previous),to=G.regions.findIndex(r=>r.id===id);if(to<0)return false;this.state.region=id;this.world=G.makeWorld(id);this.syncWorld();this.bike=false;this.riding=false;this.panel=null;this.state.player.x=(from<7&&to===(from+6)%7)||(from>=8&&to===from-1)?1030:170;this.state.player.y=520;this.state.player.moving=false;if(id==='meadow'&&previous==='b1'){this.state.player.x=850;this.state.player.y=740;}this.state.visited=[...new Set([...this.state.visited,id])];this.projectiles=[];this.effects=[];this.cooldown=.4;this.say(G.regions[to].name+'에 도착했습니다.');return true;}
 attack(ranged=false){if(this.panel||this.cooldown>0||this.riding)return false;this.cooldown=ranged?.45:.32;this.attackTime=.22;const p=this.state.player,f=p.facing;if(ranged)this.projectiles.push({x:p.x,y:p.y,dx:f.x,dy:f.y,speed:420,life:1.3});else for(const e of this.world.enemies){const d=G.distance(e,p),dot=(e.x-p.x)*f.x+(e.y-p.y)*f.y;if(e.hp>0&&d<72&&(dot>0||d<30))this.hitEnemy(e,this.state.sword===2?30:18,false);}return true;}
 hitEnemy(e,n,ranged){e.hp=Math.max(0,e.hp-n);e.hit=.2;this.burst(e.x,e.y,'#f0d7a5',String(n));if(e.hp===0){this.state.kills++;this.state.xp[ranged?'ranged':'melee']+=5;this.state.inventory.relic++;this.state.inventory.stone+=2;this.say('처치 · 유적 조각 +1 · 돌 +2');}}
 damage(n){if(this.invulnerable>0)return false;this.state.player.hp=Math.max(0,this.state.player.hp-n);this.invulnerable=.8;if(this.state.player.hp===0){this.enter('meadow');this.state.player.x=420;this.state.player.y=520;this.state.player.hp=100;this.say('기운을 잃어 집 앞으로 돌아왔습니다. 자원은 보존됩니다.');return true;}return false;}
 toggleBike(){if(this.panel||this.world.underground||!this.state.equipment.bike)return this.say('자전거는 공방에서 제작한 뒤 지상에서 사용할 수 있습니다.');this.bike=!this.bike;this.say(this.bike?'자전거 탑승 · 이동 속도 증가':'자전거에서 내렸습니다.');return true;}
 travel(id){if(this.nearest()?.kind!=='teleport'||!this.state.teleports.includes(id)||!this.state.teleports.includes(this.state.region)||id===this.state.region)return false;this.enter(id);this.state.player.x=1030;this.state.player.y=690;this.say('텔레포터로 이동했습니다.');return true;}
 eat(){if(this.state.inventory.crop<1||this.state.player.hp>=100)return this.say('순무가 없거나 체력이 이미 가득합니다.');this.state.inventory.crop--;this.state.player.hp=Math.min(100,this.state.player.hp+30);this.say('순무를 먹었습니다. 체력 +30');return true;}
 decorate(){const p=this.state.player,x=p.x+p.facing.x*42,y=p.y+p.facing.y*42;if(this.panel||this.state.lanterns<1)return this.say('공방에서 정원 등불을 먼저 만드세요.');if(this.state.decorations.length>=8||G.collides(this.world,x,y)||this.world.objects.some(o=>o.name&&Math.hypot(x-o.x,y-(o.ay??o.y))<45)||this.state.decorations.some(d=>d.region===this.state.region&&Math.hypot(d.x-x,d.y-y)<30))return this.say('이곳에는 등불을 놓을 수 없습니다. 빈 땅을 찾으세요.');this.state.decorations.push({region:this.state.region,x,y});this.state.lanterns--;this.say('정원 등불을 배치했습니다.');return true;}
 atWorkshop(){return this.nearest()?.kind==='workshop';}
 syncWorld(){for(const o of this.world.objects)if(o.flag==='tunnel')o.solid=!this.state.flags.tunnel;}
 pay(cost){if(Object.entries(cost).some(([k,n])=>this.state.inventory[k]<n))return this.say('재료가 부족합니다. 창고 재고를 확인하세요.');for(const [k,n]of Object.entries(cost))this.state.inventory[k]-=n;return true;}
 research(id){const r=G.researches[id];if(!r||!this.atWorkshop()||this.state.research[id])return false;if(!this.pay(r.cost))return false;this.state.research[id]=true;this.say(r.name+' 연구 완료');return true;}
 craft(id){const r=G.recipes[id];if(!r||!this.atWorkshop())return false;if(r.research&&!this.state.research[r.research])return this.say('먼저 해당 기술을 연구하세요.');if(id!=='lantern'&&this.state.equipment[id])return this.say('이미 제작한 장비입니다.');if(id==='pick3'&&this.state.pick<2)return this.say('구리 곡괭이를 먼저 만드세요.');if(!this.pay(r.cost))return false;if(id==='pick2')this.state.pick=2;if(id==='pick3')this.state.pick=3;if(id==='sword')this.state.sword=2;if(id==='lantern')this.state.lanterns++;else this.state.equipment[id]=true;this.say(r.name+' 제작 완료'+(id.startsWith('pick')?' · 자동 장착':''));return true;}
 serialize(){return JSON.stringify(this.state);}
 static fromSave(json){
  const raw=JSON.parse(json),g=new Game(),s=g.state;if(!raw||raw.version!==1||!G.regions.some(r=>r.id===raw.region)||!raw.player||!raw.inventory)throw Error('지원하지 않는 실험판 저장 형식입니다.');const num=(v,a,b)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('저장 데이터에 올바르지 않은 숫자가 있습니다.');return G.clamp(v,a,b);};
  s.region=raw.region;g.world=G.makeWorld(s.region);s.player.x=num(raw.player.x,12,G.W-12);s.player.y=num(raw.player.y,12,G.H-12);s.player.hp=num(raw.player.hp,1,100);
  for(const k of Object.keys(G.resources))s.inventory[k]=Math.floor(num(raw.inventory[k],0,1e6));for(const k of ['mining','melee','ranged'])s.xp[k]=Math.floor(num(raw.xp?.[k]??0,0,1e6));s.pick=Math.floor(num(raw.pick??1,1,3));s.sword=Math.floor(num(raw.sword??1,1,2));s.clock=num(raw.clock??0,0,1e10);s.kills=Math.floor(num(raw.kills??0,0,1e6));s.lanterns=Math.floor(num(raw.lanterns??0,0,100));
  for(const k of Object.keys(G.researches))if(raw.research?.[k]===true)s.research[k]=true;for(const k of Object.keys(G.recipes))if(raw.equipment?.[k]===true)s.equipment[k]=true;for(const k of ['visited','records','teleports'])s[k]=[...new Set((Array.isArray(raw[k])?raw[k]:[]).filter(x=>G.regions.some(r=>r.id===x)))];if(!s.visited.includes(s.region))s.visited.push(s.region);
  for(const k of ['well','rail','artisan','sluice','observatory','tunnel','geothermal','lab'])if(raw.flags?.[k]===true)s.flags[k]=true;for(const k of ['temple','power','heat'])s.puzzles[k]=Math.floor(num(raw.puzzles?.[k]??0,0,3));
  for(const r of G.regions)for(const o of G.makeWorld(r.id).objects){const n=raw.ore?.[o.id];if(n&&['ore','log'].includes(o.kind))s.ore[o.id]={hits:Math.floor(num(n.hits,0,4)),readyAt:num(n.readyAt,0,s.clock+60)};}s.farm={stage:Math.floor(num(raw.farm?.stage??0,0,2)),readyAt:num(raw.farm?.readyAt??0,0,s.clock+120)};
  g.syncWorld();if(G.collides(g.world,s.player.x,s.player.y)){s.player.x=170;s.player.y=520;}
  s.decorations=(Array.isArray(raw.decorations)?raw.decorations:[]).slice(0,8).filter(d=>d&&G.regions.some(r=>r.id===d.region)&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&!G.collides(G.makeWorld(d.region),d.x,d.y)).map(d=>({region:d.region,x:d.x,y:d.y}));return g;
 }
 snapshot(){return JSON.parse(JSON.stringify({state:this.state,world:this.world,panel:this.panel,bike:this.bike,riding:this.riding,notice:this.notice,camera:this.camera}));}
}
G.Game=Game;
})(globalThis.CG=globalThis.CG||{});
