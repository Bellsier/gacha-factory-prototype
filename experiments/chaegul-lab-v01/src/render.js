(function(G){
'use strict';
const hash=(x,y)=>{let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
const ellipse=(c,x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
const polygon=(c,pts,color)=>{c.fillStyle=color;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();};
function label(c,text,x,y,color='#e6e5cb'){c.font='11px system-ui';c.textAlign='center';c.fillStyle='#162824c9';const w=c.measureText(text).width+12;c.fillRect(x-w/2,y-12,w,18);c.fillStyle=color;c.fillText(text,x,y);}
function building(c,o,t){
 const workshop=o.kind==='workshop',warehouse=o.kind==='warehouse',w=o.w;
 ellipse(c,o.x+8,o.y+45,w*.63,23,'#15261e55');rect(c,o.x-w/2,o.y-40,w,88,warehouse?'#737b64':'#b4a47d');rect(c,o.x-w/2,o.y+34,w,14,'#746952');
 for(let y=o.y-30;y<o.y+33;y+=16)rect(c,o.x-w/2,y,w,2,'#867d6255');
 polygon(c,[[o.x-w/2-12,o.y-30],[o.x-w/2-12,o.y-58],[o.x,o.y-105],[o.x+w/2+12,o.y-58],[o.x+w/2+12,o.y-30]],workshop?'#72534b':warehouse?'#526c64':'#826251');
 polygon(c,[[o.x-w/2-12,o.y-58],[o.x,o.y-105],[o.x,o.y-92],[o.x-w/2-12,o.y-45]],'#b6956b');
 for(let x=o.x-w/2;x<o.x+w/2;x+=18)rect(c,x,o.y-43,13,3,'#452e3133');
 rect(c,o.x-15,o.y+7,30,42,'#263e33');rect(c,o.x-11,o.y+10,22,35,'#4b5040');rect(c,o.x+5,o.y+28,3,3,'#e8c17e');
 for(const side of [-1,1]){rect(c,o.x+side*(w/2-25)-10,o.y-14,20,23,'#4b5343');rect(c,o.x+side*(w/2-25)-7,o.y-11,14,16,'#e7bb73');rect(c,o.x+side*(w/2-25)-1,o.y-11,2,16,'#99835b');}
 if(workshop){rect(c,o.x+35,o.y-111,18,45,'#7e7766');rect(c,o.x+32,o.y-111,24,6,'#afa18a');for(let i=0;i<3;i++)ellipse(c,o.x+43+Math.sin(t+i)*6,o.y-125-(t*12+i*15)%48,7+i*3,5+i*2,'#d0d1b325');}label(c,o.name,o.x,o.y+65);
}
function person(c,p,t,npc=false){
 const walk=p.moving?Math.sin(t*13)*4:0;ellipse(c,p.x,p.y+4,14,6,'#15221e66');rect(c,p.x-8,p.y-5+walk,6,11,'#323e3b');rect(c,p.x+2,p.y-5-walk,6,11,'#323e3b');
 rect(c,p.x-12,p.y-23,24,22,npc?'#b18862':'#89a4a0');rect(c,p.x-11,p.y-14,22,5,npc?'#936a50':'#536c66');rect(c,p.x-9,p.y-37,18,16,'#e1bb91');rect(c,p.x-12,p.y-39,24,8,npc?'#6b5743':'#d2b469');rect(c,p.x-8,p.y-44,16,7,npc?'#6b5743':'#d2b469');
 if(!npc){rect(c,p.x-3,p.y-40,6,5,'#fff0ba');rect(c,p.x-15,p.y-19,5,14,'#bc9a72');rect(c,p.x+10,p.y-19,5,14,'#bc9a72');}
 const facing=p.facing||{x:0,y:1};if(facing.y>=0){rect(c,p.x-5+facing.x*2,p.y-30,2,3,'#38483c');rect(c,p.x+3+facing.x*2,p.y-30,2,3,'#38483c');}
}
function object(c,o,g,t){
 const done=g.state.flags[o.flag];if(['house','workshop','warehouse'].includes(o.kind))return building(c,o,t);
 if(o.kind==='tree'){
  ellipse(c,o.x+8,o.y+8,34,12,'#17292044');rect(c,o.x-7,o.y-25,14,35,'#715b40');rect(c,o.x-2,o.y-21,4,30,'#9f8053');const sway=Math.sin(t*1.3+o.x)*1.7;
  polygon(c,[[o.x-38+sway,o.y-22],[o.x-33+sway,o.y-55],[o.x-18+sway,o.y-80],[o.x+6+sway,o.y-87],[o.x+31+sway,o.y-61],[o.x+39+sway,o.y-28]],g.world.id==='frost'?'#b6cec4':'#294d38');
  polygon(c,[[o.x-30+sway,o.y-48],[o.x-13+sway,o.y-78],[o.x+5+sway,o.y-79],[o.x+26+sway,o.y-57],[o.x+16+sway,o.y-34],[o.x-12+sway,o.y-34]],g.world.id==='frost'?'#deebe0':'#49744a');rect(c,o.x-15,o.y-64,17,4,g.world.id==='frost'?'#f2f2dd':'#74904f');return;
 }
 if(o.kind==='rock'||o.kind==='ore'){
  const n=g.state.ore[o.id],empty=n&&n.readyAt>g.state.clock;
  ellipse(c,o.x+3,o.y+8,28,9,'#182b2944');polygon(c,[[o.x-24,o.y+7],[o.x-27,o.y-10],[o.x-13,o.y-25],[o.x+8,o.y-29],[o.x+24,o.y-12],[o.x+25,o.y+6]],empty?'#586456':'#7c8a7b');polygon(c,[[o.x-27,o.y-10],[o.x-13,o.y-25],[o.x+8,o.y-29],[o.x+6,o.y-9],[o.x-11,o.y]],'#a3ad90');
  if(o.kind==='ore'&&!empty){const color=G.resources[o.resource].color;for(let i=0;i<4;i++){const x=o.x-15+(i%2)*19,y=o.y-17+Math.floor(i/2)*15;polygon(c,[[x-5,y],[x,y-7],[x+7,y-3],[x+4,y+4]],color);}ellipse(c,o.x+6,o.y-15,2+Math.sin(t*3)*.8,2,'#fff2cf');}return;
 }
 if(o.kind==='pillar'){rect(c,o.x-17,o.y-54,34,65,'#596c73');rect(c,o.x-22,o.y-58,44,10,'#8a9da0');rect(c,o.x-11,o.y-43,5,40,'#8ea5a5');rect(c,o.x-23,o.y+7,46,8,'#809397');return;}
 if(o.kind==='crystal'){for(let i=0;i<3;i++){const x=o.x+(i-1)*13;polygon(c,[[x-8,o.y],[x-8,o.y-28-i*8],[x,o.y-42-i*8],[x+8,o.y-28-i*8],[x+8,o.y]],i===1?'#bba4de':'#8578ad');}return;}
 if(o.kind==='gate'){rect(c,o.x-4,o.y-18,8,32,'#9b7d52');rect(c,o.x-29,o.y-36,58,24,'#c1ad78');rect(c,o.x-26,o.y-33,52,17,'#80704b');label(c,o.name,o.x,o.y-48,'#f2e2b1');return;}
 if(o.kind==='npc'){person(c,{...o,moving:false},t,true);label(c,o.name,o.x,o.y-52);return;}
 if(o.kind==='teleport'){ellipse(c,o.x,o.y,32,15,'#879a9855');ellipse(c,o.x,o.y,24,11,'#668781');const active=g.state.teleports.includes(g.state.region);c.strokeStyle=active?'#a7f6db':'#acb1a3';c.lineWidth=3;c.beginPath();c.ellipse(o.x,o.y-22,18,30,0,0,Math.PI*2);c.stroke();rect(c,o.x-5,o.y-18,10,8,active?'#d0ffe3':'#75847c');if(active)ellipse(c,o.x,o.y-22,12,21,'#9eebcc22');return;}
 if(o.kind==='record'||o.kind==='sign'){rect(c,o.x-16,o.y-25,32,37,'#b2b7a1');rect(c,o.x-11,o.y-20,22,25,'#677871');for(let i=0;i<3;i++)rect(c,o.x-7,o.y-16+i*7,14-i*3,2,'#ccdbbd');if(!g.state.records.includes(g.state.region)&&o.kind==='record')label(c,'✦',o.x,o.y-37,'#f6daa0');return;}
 if(o.kind==='log'){rect(c,o.x-22,o.y-4,44,13,'#99754b');ellipse(c,o.x-22,o.y+2,7,8,'#d4b47b');rect(c,o.x-15,o.y-3,30,3,'#bd975d');return;}
 if(o.kind==='farm'){
  rect(c,o.x-56,o.y-30,112,64,'#4e4833');for(let i=0;i<4;i++)rect(c,o.x-49,o.y-22+i*16,98,4,'#8f7951');const f=g.state.farm;
  if(f.stage)for(let i=0;i<8;i++){const x=o.x-40+(i%4)*27,y=o.y-17+Math.floor(i/4)*29;rect(c,x-2,y-6,4,13,'#8cba6b');polygon(c,[[x,y-3],[x-9,y-9],[x-9,y-1],[x,y+3],[x+9,y-5],[x+9,y-11]],'#91ae58');if(f.stage===2&&g.state.clock>=f.readyAt)ellipse(c,x,y+5,6,5,'#e8c7b3');}return;
 }
 if(o.kind==='switch'){const progress=g.state.puzzles[o.puzzle]||0,lit=progress>o.sequence.indexOf(o.order);rect(c,o.x-14,o.y-6,28,20,'#819595');rect(c,o.x-6,o.y-38,12,33,'#4e686d');ellipse(c,o.x,o.y-42,10,12,lit?'#f4d395':'#708d96');if(lit)ellipse(c,o.x,o.y-42,22,25,'#f3ce7522');label(c,String(o.order+1),o.x,o.y+30);return;}
 if(o.kind==='cart'){const x=g.riding?g.state.player.x:o.x;rect(c,x-23,o.y-18,46,28,'#9b7957');rect(c,x-26,o.y-22,52,7,'#cfb278');ellipse(c,x-15,o.y+11,7,7,'#29393b');ellipse(c,x+15,o.y+11,7,7,'#29393b');return;}
 if(o.kind==='repair'||o.kind==='landmark'||o.kind==='lab'){
  const w=o.w||60;ellipse(c,o.x+7,o.y+16,w*.65,18,'#192b3344');
  if(o.flag==='tunnel'&&done){rect(c,o.x-w/2,o.y-39,22,53,'#9ba68c');rect(c,o.x+w/2-22,o.y-39,22,53,'#9ba68c');rect(c,o.x-w/2-4,o.y-47,w+8,13,'#a6ad97');rect(c,o.x-w/2+22,o.y-34,w-44,48,'#253b36');label(c,'열린 광산 통로',o.x,o.y+38);return;}
  rect(c,o.x-w/2,o.y-39,w,53,done?'#9ba68c':'#747f76');rect(c,o.x-w/2-4,o.y-47,w+8,13,'#a6ad97');rect(c,o.x-15,o.y-25,30,34,done?'#a8d7bb':'#394e4c');if(o.kind==='lab'){rect(c,o.x-44,o.y-64,88,20,'#8298a4');ellipse(c,o.x,o.y-67,14,17,g.state.flags.lab?'#e7c6f5':'#8593b3');}label(c,o.name,o.x,o.y+38);return;
 }
}
G.render=function(canvas,g,t){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,zoom=Math.max(w/G.W,h/G.H,.65,Math.min(1.25,w/900,h/570)),vw=Math.min(G.W,w/zoom),vh=Math.min(G.H,h/zoom),p=g.state.player,cam={x:G.clamp(p.x-vw/2,0,G.W-vw),y:G.clamp(p.y-vh/2,0,G.H-vh),zoom};
 g.camera=cam;c.imageSmoothingEnabled=false;c.clearRect(0,0,w,h);c.save();c.scale(zoom,zoom);c.translate((w/zoom-vw)/2-cam.x,(h/zoom-vh)/2-cam.y);const r=g.world.region;rect(c,0,0,G.W,G.H,r.ground);
 for(let y=Math.floor(cam.y/32)*32;y<cam.y+vh+32;y+=32)for(let x=Math.floor(cam.x/32)*32;x<cam.x+vw+32;x+=32){const n=hash(x,y);rect(c,x,y,32,32,n>.52?r.light:r.dark);c.globalAlpha=.83;rect(c,x,y,32,32,r.ground);c.globalAlpha=1;if(n>.65){rect(c,x+8,y+14,2,5,r.light);rect(c,x+12,y+16,2,3,r.light);}}
 const road=g.world.underground?'#737b7970':'#b9a77a66';rect(c,0,492,G.W,56,road);rect(c,577,310,46,505,road);
 if(g.world.id==='meadow'){rect(c,285,428,735,30,road);rect(c,285,430,30,110,road);rect(c,784,430,30,115,road);rect(c,275,712,790,50,road);rect(c,830,740,40,75,road);}
 if(g.world.id==='marsh'){for(const y of [155,825]){rect(c,0,y,G.W,40,'#365c69');for(let x=0;x<G.W;x+=50)rect(c,x+Math.sin(t+x)*4,y+12,24,2,'#7caaa577');}rect(c,570,155,60,40,'#ac976f');}
 if(g.world.id==='volcano'){for(const y of [145,825]){rect(c,0,y,G.W,32,'#ac593f');for(let x=0;x<G.W;x+=33)rect(c,x,y+8+Math.sin(t+x)*5,19,4,'#f0b365');}}
 if(g.world.id==='b1'){for(let x=300;x<1000;x+=24)rect(c,x,633,8,34,'#967e64');rect(c,290,638,720,3,'#a7aca0');rect(c,290,662,720,3,'#a7aca0');if(!g.state.flags.rail){rect(c,650,633,35,34,r.ground);rect(c,647,644,40,4,'#7c6a59');}}
 const entities=[...g.world.objects.map(o=>({y:o.y,draw:()=>object(c,o,g,t)})),{y:p.y,draw:()=>{if(g.bike){ellipse(c,p.x-15,p.y+3,10,10,'#293d36');ellipse(c,p.x+15,p.y+3,10,10,'#293d36');rect(c,p.x-17,p.y-3,34,3,'#d4b47a');}person(c,p,t);if(g.attackTime>0){const a=Math.atan2(p.facing.y,p.facing.x);c.strokeStyle='#ffe4a3';c.lineWidth=5;c.beginPath();c.arc(p.x,p.y-13,37,a-.8,a+.8);c.stroke();}}}];
 for(const e of g.world.enemies)if(e.hp>0)entities.push({y:e.y,draw:()=>{const bob=Math.sin(t*4+e.x)*3;ellipse(c,e.x,e.y+4,20,8,'#1d302d66');ellipse(c,e.x,e.y-8+bob,21,17,e.hit>0?'#fff1b8':e.kind==='ember'?'#d58e58':'#92a77c');rect(c,e.x-8,e.y-12+bob,4,5,'#344b3a');rect(c,e.x+5,e.y-12+bob,4,5,'#344b3a');if(e.hp<e.maxHp){rect(c,e.x-20,e.y-37,40,4,'#263c2d');rect(c,e.x-20,e.y-37,40*e.hp/e.maxHp,4,'#d78f79');}}});
 entities.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
 for(const d of g.state.decorations.filter(d=>d.region===g.state.region)){rect(c,d.x-3,d.y-26,6,30,'#65583e');ellipse(c,d.x,d.y-29,7,10,'#f6d18b');ellipse(c,d.x,d.y-29,30,30,'#efc56b13');}
 for(const shot of g.projectiles)ellipse(c,shot.x,shot.y-12,5,4,'#fff0bd');
 for(const e of g.effects){c.globalAlpha=e.life/.7;for(let i=0;i<6;i++)rect(c,e.x+Math.cos(i)*((.7-e.life)*50),e.y-12+Math.sin(i)*((.7-e.life)*40),4,4,e.color);label(c,e.text,e.x,e.y-38-(.7-e.life)*30,e.color);c.globalAlpha=1;}
 const near=g.nearest();if(near){c.strokeStyle='#f8e3a4';c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();c.ellipse(near.x,near.ay??near.y,30,15,0,0,Math.PI*2);c.stroke();c.setLineDash([]);}c.restore();
 if(g.world.underground){const grad=c.createRadialGradient(w/2,h/2,100,w/2,h/2,Math.max(w,h)*.65);grad.addColorStop(0,'#18263b00');grad.addColorStop(1,'#0c152b88');c.fillStyle=grad;c.fillRect(0,0,w,h);}
 for(let i=0;i<18;i++){const x=(hash(i,2)*w+t*(g.world.id==='frost'?6:2))%w,y=(hash(i,4)*h+t*(g.world.id==='frost'?12:-2)+h)%h;ellipse(c,x,y,1.4,1.4,g.world.underground?'#a4d3f325':'#f0e9b548');}
 const mini=document.getElementById('minimap');if(mini){const m=mini.getContext('2d');m.fillStyle=r.dark;m.fillRect(0,0,168,126);m.fillStyle=r.ground;m.fillRect(3,3,162,120);rect(m,0,69,168,8,'#a9a18466');for(const o of g.world.objects){const color=o.kind==='gate'?'#edd9a6':o.kind==='ore'?'#d9b47e':o.kind==='teleport'?'#91d4cc':o.name?'#b7c4a1':'#314e3f';rect(m,o.x/G.W*168-2,o.y/G.H*126-2,4,4,color);}m.strokeStyle='#dce4c866';m.strokeRect(cam.x/G.W*168,cam.y/G.H*126,vw/G.W*168,vh/G.H*126);ellipse(m,p.x/G.W*168,p.y/G.H*126,3,3,'#fff5c7');}
};
})(globalThis.CG=globalThis.CG||{});
