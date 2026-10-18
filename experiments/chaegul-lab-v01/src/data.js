(function(G){
'use strict';
G.SAVE_KEY='chaegulGongbang.experimental.v01';G.VERSION=1;G.W=1200;G.H=900;G.SPEED=210;
G.resources={stone:{name:'돌',color:'#c3c8be',grade:1},copper:{name:'구리',color:'#eaa275',grade:1},wood:{name:'목재',color:'#d7b57c',grade:1},iron:{name:'철',color:'#b9d1e1',grade:2},crystal:{name:'수정',color:'#bf9bfa',grade:3},ember:{name:'불씨석',color:'#ff925d',grade:3},crop:{name:'순무',color:'#d8df9c',grade:1},relic:{name:'유적 조각',color:'#8fe2d5',grade:1}};
G.regions=[
{id:'meadow',name:'푸른 초원',sub:'집으로 이어지는 길',ground:'#526c46',light:'#91a76a',dark:'#344b39',accent:'#e3c58a',note:'초원의 기록: 끊어진 길을 다시 잇는 작은 일부터 시작한다.',action:'공방에서 곡괭이 강화 · 마을 복구'},
{id:'forest',name:'이끼숲',sub:'옛 장인들이 남긴 흔적',ground:'#334f42',light:'#69876a',dark:'#21392f',accent:'#b8d18c',note:'장인의 기록: 첫 번째 봉인을 위한 특수 금속 상자가 이 숲에서 만들어졌다.',action:'장인 기록 조사 · 목재 채집'},
{id:'frost',name:'서리 고원',sub:'침묵하는 사원의 불빛',ground:'#879fa6',light:'#d2ddd5',dark:'#566b7f',accent:'#cfedf1',note:'사원 기록: 이곳은 두 번째 봉인과 관련되어 있다. 그 결과는 아직 알려져 있지 않다.',action:'사원 등불 순서 복구 · 철 채굴'},
{id:'marsh',name:'안개 늪지',sub:'물길 건너 들려오는 이야기',ground:'#506966',light:'#80988b',dark:'#304a50',accent:'#c7dcaa',note:'늪지 기록: 불완전한 목격담만으로 누군가를 범인으로 정할 수는 없다.',action:'수로 복구 · 이주민과 대화'},
{id:'crystal',name:'별빛 수정 지대',sub:'기억을 품은 결정',ground:'#565771',light:'#9290af',dark:'#353a53',accent:'#c5a7f5',note:'연구 기록: 과학자는 결정화의 확산을 막았다. 사고와 침식 유물의 인과는 확인되지 않았다.',action:'수정 채굴 · 연구 시설 조사'},
{id:'ridge',name:'붉은 바위 산맥',sub:'다시 열리는 광산길',ground:'#89634f',light:'#c18d62',dark:'#5f4640',accent:'#efb581',note:'광산 기록: 이 산맥과 화산의 광석은 인공 수정 연구에 쓰였다.',action:'광산 터널 개방 · 철 광맥'},
{id:'volcano',name:'잿불 화산 지대',sub:'대지 아래의 따뜻한 숨',ground:'#50494b',light:'#847064',dark:'#302d36',accent:'#ffae70',note:'지열 시설 기록: 오래된 제련 장치에 대지의 열기가 남아 있다.',action:'지열 시설 복구 · 불씨석 채굴'},
{id:'b1',name:'B1 · 고대 도시 입구',sub:'멈춰 선 역',ground:'#3e494f',light:'#67797a',dark:'#263238',accent:'#d4bc89',note:'역의 기록: 이곳의 철도는 이미 존재했다. 필요한 것은 새 부설이 아니라 복구다.',action:'기존 레일 복구 · 수레 탑승'},
{id:'b2',name:'B2 · 오래된 시설',sub:'잠든 도시에 전력을',ground:'#3e4b5e',light:'#6b8494',dark:'#263342',accent:'#9bd4d9',note:'시설 기록: 사람들은 극심한 추위와 질병을 피해 지하 도시로 내려왔다.',action:'전력 장치 순서 복구'},
{id:'b3',name:'B3 · 얼어붙은 구조물',sub:'얼음 아래 남은 온기',ground:'#526981',light:'#92b9cb',dark:'#33465e',accent:'#c4edfa',note:'난방 기록: 얼음 속에는 과거의 생활 공간이 그대로 남아 있다.',action:'난방 장치 순서 복구'},
{id:'b4',name:'B4 · 마지막 연구실',sub:'나선의 가장 깊은 곳',ground:'#3b4159',light:'#727992',dark:'#252b3e',accent:'#dfc5f3',note:'연구실 기록: 의식 이전과 오염된 물질에 대한 단편이다. 재앙의 상세 연표는 아직 확정할 수 없다.',action:'연구실 기록 복원 · 탐험 완료'}];
G.recipes={pick2:{name:'구리 곡괭이',desc:'채굴 등급 2 · 철 광맥 채굴',cost:{copper:6,stone:4},research:'mining'},pick3:{name:'강철 곡괭이',desc:'채굴 등급 3 · 수정과 불씨석',cost:{iron:6,copper:4},research:'craft'},sword:{name:'강화 검',desc:'근접 피해 18 → 30',cost:{copper:4,stone:2},research:'craft'},bike:{name:'자전거',desc:'지상에서 B · 이동 속도 1.7배',cost:{copper:4,wood:2},research:'transport'},lantern:{name:'정원 등불',desc:'G로 앞에 배치 · 최대 8개',cost:{copper:2,stone:2},research:null}};
G.researches={mining:{name:'채굴 기술',desc:'구리 곡괭이 제작 해금',cost:{copper:2}},craft:{name:'제작 기술',desc:'강철 곡괭이·강화 검 해금',cost:{copper:2,stone:2}},transport:{name:'운송 기술',desc:'자전거 제작 해금',cost:{wood:2}},ancient:{name:'고대 기술',desc:'방문한 텔레포터 활성화',cost:{copper:2,stone:2}}};
G.clamp=(x,a,b)=>Math.max(a,Math.min(b,x));G.distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
})(globalThis.CG=globalThis.CG||{});
