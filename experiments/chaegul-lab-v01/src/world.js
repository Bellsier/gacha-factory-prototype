(function(G){
'use strict';
G.makeWorld=function(id){
 const index=G.regions.findIndex(r=>r.id===id);if(index<0)throw Error('Unknown region');
 const region=G.regions[index],objects=[],enemies=[];
 const add=(kind,x,y,props={})=>{const o={id:`${id}-${objects.length}`,kind,x,y,w:30,h:22,solid:false,...props};objects.push(o);return o;};
 const ore=(x,y,resource)=>add('ore',x,y,{name:G.resources[resource].name+' 광맥',resource,solid:true,w:42,h:28});
 const gate=(x,y,target,label)=>add('gate',x,y,{name:label,target});const underground=index>=7;
 for(let y=92;y<850;y+=94)for(let x=70;x<1180;x+=103){
  if(Math.abs(y-520)<92||Math.abs(x-600)<75||Math.abs(y-740)<60||y>780)continue;
  if(id==='meadow'&&x>220&&y>280&&y<780)continue;
  if(id==='b1'&&x>=250&&x<=1060&&y>=575&&y<=725)continue;
  if(x>360&&x<920&&y>220&&y<440)continue;
  const n=(x*7+y*13+index*41)%11;
  if(n<6)add(underground?'pillar':(index===4?'crystal':index>=5?'rock':'tree'),x,y,{solid:true,w:28,h:22});
 }
 if(!underground){gate(70,520,G.regions[(index+6)%7].id,'← '+G.regions[(index+6)%7].name);gate(1130,520,G.regions[(index+1)%7].id,G.regions[(index+1)%7].name+' →');}
 else{gate(70,520,index===7?'meadow':G.regions[index-1].id,index===7?'地上 · 푸른 초원':'↑ '+G.regions[index-1].name);if(index<10)gate(1130,520,G.regions[index+1].id,'↓ '+G.regions[index+1].name);}
 add('teleport',1030,740,{name:'텔레포터'});add('record',880,300,{name:'지역 기록',text:region.note});
 if(id==='meadow'){
  add('house',310,360,{name:'나의 집',solid:true,w:130,h:105,ay:430});add('workshop',600,360,{name:'채굴 공방',solid:true,w:150,h:105,ay:430});add('warehouse',1000,360,{name:'공용 창고',solid:true,w:120,h:100,ay:428});
  add('npc',720,620,{name:'마을 안내인',text:'광맥 앞에서 E를 눌러 보세요. 광물은 곧바로 창고로 들어갑니다. 구리 2개로 채굴 기술을 연구하고, 구리 6개와 돌 4개로 곡괭이를 만드세요. 집에서 쉬면 체력이 회복됩니다.'});
  ore(800,430,'copper');ore(910,620,'copper');ore(800,650,'stone');ore(1070,620,'stone');
  add('tree',470,650,{solid:true,w:30,h:24});add('rock',550,650,{solid:true,w:34,h:26});add('log',350,600,{name:'쓰러진 가지',resource:'wood'});add('farm',300,740,{name:'작은 텃밭',w:112,h:64});add('repair',650,740,{name:'마을 우물',cost:{stone:4},flag:'well',w:42,h:32,solid:true});gate(850,800,'b1','↓ 고대 도시 B1');
 }else if(!underground){
  const resource=index===1?'copper':index===2||index===3||index===5?'iron':index===4?'crystal':'ember';ore(760,430,resource);ore(920,650,resource);ore(800,650,'stone');add('log',350,650,{name:'쓰러진 가지',resource:'wood'});
  if(index===1)add('landmark',600,330,{name:'장인의 작업대',flag:'artisan',cost:{wood:2},w:90,h:45,solid:true,ay:375});
  if(index===2)for(let i=0;i<3;i++)add('switch',480+i*120,330,{name:`사원 등불 ${i+1}`,puzzle:'temple',order:i,sequence:[0,1,2]});
  if(index===3){add('landmark',600,330,{name:'수로 수문',flag:'sluice',cost:{stone:2},w:90,h:45,solid:true,ay:375});add('npc',400,620,{name:'늪지의 주민',text:'안개 속에서 본 옷차림만으로는 누구인지 알 수 없어요. 숲의 기록도 함께 읽어 주세요.'});}
  if(index===4)add('landmark',600,330,{name:'연구 관측기',flag:'observatory',cost:{iron:2},w:70,h:45,solid:true,ay:375});
  if(index===5)add('landmark',600,330,{name:'무너진 광산 통로',flag:'tunnel',cost:{stone:4},w:130,h:60,solid:true,ay:378});
  if(index===6)add('landmark',600,330,{name:'지열 제련 장치',flag:'geothermal',cost:{iron:2},w:100,h:55,solid:true,ay:375});
  enemies.push({id:id+'-enemy-0',x:540,y:540,homeX:540,homeY:540,hp:48,maxHp:48,kind:index===6?'ember':'slime',cooldown:0,hit:0});enemies.push({id:id+'-enemy-1',x:960,y:240,homeX:960,homeY:240,hp:48,maxHp:48,kind:'slime',cooldown:0,hit:0});
 }else{
  add('ore',800,710,{name:'오래된 돌더미',resource:'stone',solid:true,w:42,h:28});
  if(index===7){add('repair',430,330,{name:'옛 철도 분기기',flag:'rail',cost:{stone:2},w:42,h:32});add('cart',310,650,{name:'레일 수레'});}
  else if(index<10){const puzzle=index===8?'power':'heat';for(let i=0;i<3;i++)add('switch',480+i*120,330,{name:`${index===8?'전력':'난방'} 장치 ${i+1}`,puzzle,order:i,sequence:index===8?[1,0,2]:[2,1,0]});add('sign',600,430,{name:'장치 사용 기록',text:index===8?'복구 순서: 가운데 → 왼쪽 → 오른쪽. 틀리면 처음부터 다시 시작합니다.':'난방 순서: 오른쪽 → 가운데 → 왼쪽. 틀리면 처음부터 다시 시작합니다.'});}
  else add('lab',600,330,{name:'마지막 연구실',solid:true,w:120,h:54,ay:375});
 }
 return {id,region,objects,enemies,underground,width:G.W,height:G.H};
};
G.collides=function(world,x,y,r=12){if(x<r||y<r||x>G.W-r||y>G.H-r)return true;return world.objects.some(o=>o.solid&&Math.abs(x-o.x)<o.w/2+r&&Math.abs(y-o.y)<o.h/2+r);};
})(globalThis.CG=globalThis.CG||{});
