const SITES = [
  {key:'abandonedMine', name:'폐광 지대', unlockCost:0},
  {key:'manaVein', name:'마정석 광맥', unlockCost:700},
  {key:'ruins', name:'고대 유적', unlockCost:2500},
  {key:'spaceStation', name:'우주 정거장', unlockCost:9000},
];
const RESOURCES = [
  {key:'iron', name:'철광석', base:1, site:'abandonedMine'},
  {key:'coal', name:'석탄', base:1, site:'abandonedMine'},
  {key:'mana', name:'마정석', base:1, site:'manaVein'},
  {key:'crystal', name:'결정', base:1, site:'manaVein'},
  {key:'rareMetal', name:'희귀 금속', base:1, site:'ruins'},
  {key:'relic', name:'고대 유물', base:1, site:'ruins'},
  {key:'cosmicShard', name:'우주 파편', base:1, site:'spaceStation'},
  {key:'plasma', name:'플라즈마', base:1, site:'spaceStation'},
];
const RECIPES = [
  {key:'steel', name:'강철', need:{iron:2, coal:1}, out:1, sell:5, craftTime:0},
  {key:'coalBrick', name:'석탄 벽돌', need:{coal:3}, out:1, sell:4, craftTime:0},
  {key:'alloy', name:'마법 합금', need:{steel:2, mana:1}, out:1, sell:20, craftTime:0},
  {key:'crystalAlloy', name:'결정 합금', need:{steel:2, crystal:1}, out:1, sell:22, craftTime:3},
  {key:'specialAlloy', name:'특수 합금', need:{alloy:3, coal:3}, out:1, sell:45, craftTime:4},
  {key:'precisionPart', name:'정밀 부품', need:{alloy:2, rareMetal:1}, out:1, sell:80, craftTime:6},
  {key:'relicPart', name:'유물 부품', need:{alloy:2, relic:1}, out:1, sell:85, craftTime:6},
  {key:'quantumCore', name:'퀀텀 코어', need:{precisionPart:2, cosmicShard:1}, out:1, sell:400, craftTime:15},
  {key:'plasmaCore', name:'플라즈마 코어', need:{precisionPart:2, plasma:1}, out:1, sell:420, craftTime:15},
];
// Task 62: x/y are offsets from state.world.base (see seedWorldMinesForSite).
const WORLD_MINE_SEEDS = {
  manaVein: [
    {x:4, y:0, resource:'mana', grade:2, miningPower:1},
    {x:0, y:4, resource:'crystal', grade:2, miningPower:1},
  ],
  ruins: [
    {x:6, y:0, resource:'rareMetal', grade:3, miningPower:1},
    {x:0, y:6, resource:'relic', grade:3, miningPower:1},
  ],
  spaceStation: [
    {x:8, y:0, resource:'cosmicShard', grade:4, miningPower:1},
    {x:0, y:8, resource:'plasma', grade:4, miningPower:1},
  ],
};
// Task 70: research — "무엇을 할 수 있는가" (Blueprint 11). Content data like
// SITES: each entry unlocks a possibility once, for a one-time cost. Research
// is instant and has no random parts.
//   effect   key into RESEARCH_EFFECTS (js/research.js) — what it unlocks
//   cost     { gold, products: { recipeKey: count } } — all paid at once
//   requires keys of research that must be done first
// For now the only item opens the tunnel (3.1); delivery items and partner
// companies (15.1) will be added here when they exist.
const RESEARCH = [
  {key:'tunnelWork', name:'터널 굴착', desc:'산을 가로지르는 터널을 뚫어 산 너머로 가는 길을 엽니다. 산 너머에는 더 희귀한 광맥이 있어요.',
   effect:'unlockTunnel', cost:{gold:1500, products:{alloy:5}}, requires:[]},
];
const RARITY = [
  {key:'common', label:'일반', chance:60, mining:1, carry:2, move:1, cls:'common'},
  {key:'rare',   label:'희귀', chance:25, mining:2, carry:3, move:2, cls:'rare'},
  {key:'epic',   label:'영웅', chance:12, mining:3, carry:5, move:3, cls:'epic'},
  {key:'legend', label:'전설', chance:3,  mining:5, carry:8, move:5, cls:'legend'},
];
const STAT_LABEL = {mining:'채굴속도', carry:'물자 이동량', move:'이동속도'};

