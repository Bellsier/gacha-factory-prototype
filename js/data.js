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
// Task 79: workshopOnly recipes (the timed, higher ones) can only be made in a
// workshop; the recipe cards craft the simple ones by hand. They are also never
// sold automatically, since they are materials for upgrades and orders.
const RECIPES = [
  {key:'steel', name:'강철', need:{iron:2, coal:1}, out:1, sell:5, craftTime:0},
  {key:'coalBrick', name:'석탄 벽돌', need:{coal:3}, out:1, sell:4, craftTime:0},
  {key:'alloy', name:'마법 합금', need:{steel:2, mana:1}, out:1, sell:20, craftTime:0},
  {key:'crystalAlloy', name:'결정 합금', need:{steel:2, crystal:1}, out:1, sell:22, craftTime:3},
  {key:'specialAlloy', name:'특수 합금', need:{alloy:3, coal:3}, out:1, sell:90, craftTime:4, workshopOnly:true}, // Task 78: was 45, below its own inputs (3 alloy = 60G)
  {key:'precisionPart', name:'정밀 부품', need:{alloy:2, rareMetal:1}, out:1, sell:80, craftTime:6, workshopOnly:true},
  {key:'relicPart', name:'유물 부품', need:{alloy:2, relic:1}, out:1, sell:85, craftTime:6, workshopOnly:true},
  {key:'quantumCore', name:'퀀텀 코어', need:{precisionPart:2, cosmicShard:1}, out:1, sell:400, craftTime:15, workshopOnly:true},
  {key:'plasmaCore', name:'플라즈마 코어', need:{precisionPart:2, plasma:1}, out:1, sell:420, craftTime:15, workshopOnly:true},
  // Task 78: more recipes. Rules: every raw resource feeds at least two recipes,
  // intermediates are shared (steelGear, crystalLens), and a recipe sells for
  // about 1.4-2x the value of its inputs. A recipe only needs inputs defined above it.
  {key:'ironTool', name:'철제 공구', need:{iron:4, coalBrick:1}, out:1, sell:14, craftTime:2},
  {key:'manaLamp', name:'마정 램프', need:{coalBrick:2, mana:2}, out:1, sell:30, craftTime:3},
  {key:'crystalLens', name:'결정 렌즈', need:{crystal:3, steel:1}, out:1, sell:35, craftTime:3},
  {key:'steelGear', name:'강철 기어', need:{steel:3, rareMetal:1}, out:1, sell:60, craftTime:4, workshopOnly:true},
  {key:'relicOrnament', name:'고대 장식', need:{crystalAlloy:1, relic:1}, out:1, sell:70, craftTime:5, workshopOnly:true},
  {key:'manaEngine', name:'마정 엔진', need:{steelGear:2, alloy:2}, out:1, sell:220, craftTime:8, workshopOnly:true},
  {key:'starLens', name:'별빛 렌즈', need:{crystalLens:2, cosmicShard:1}, out:1, sell:260, craftTime:10, workshopOnly:true},
  {key:'plasmaCell', name:'플라즈마 전지', need:{specialAlloy:2, plasma:1}, out:1, sell:250, craftTime:10, workshopOnly:true},
  {key:'precisionMachine', name:'정밀 기계', need:{steelGear:2, precisionPart:1}, out:1, sell:330, craftTime:12, workshopOnly:true},
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
// Task 70/71: research — "무엇을 할 수 있는가" (Blueprint 11). Content data like
// SITES: each entry unlocks a possibility once, for a one-time cost. Research
// is instant and has no random parts.
//   branch   key into RESEARCH_BRANCHES — which group of the 연구 tab it is in
//   effect   key into RESEARCH_EFFECTS (js/research.js) — what it unlocks
//   cost     { gold, products: { recipeKey: count } } — all paid at once
//   requires keys of research that must be done first
// Delivery items and partner companies (15.1) will be added when they exist.
const RESEARCH_BRANCHES = [
  {key:'craft',      name:'제작'},
  {key:'automation', name:'자동화'},
  {key:'explore',    name:'탐험'},
  {key:'delivery',   name:'납품'},
];
const RESEARCH = [
  {key:'workshopBuild', branch:'craft', name:'제작소 건설', desc:'기지 주변에 제작소를 지을 수 있게 됩니다. 제작소는 레시피를 정해 두고 따로 물건을 만들어요.',
   effect:'unlockWorkshopBuild', cost:{gold:100, products:{steel:5}}, requires:[]},
  {key:'autoCraftDevice', branch:'automation', name:'자동 제작 장치', desc:'제작을 스스로 반복하는 기계 장치입니다. 레시피 카드와 제작소에서 "자동 제작"을 켤 수 있게 돼요.',
   effect:'unlockAutoCraft', cost:{gold:150, products:{steel:10}}, requires:[]},
  {key:'deliveryContract', branch:'delivery', name:'납품 계약', desc:'회사에 제품을 보내고 수주를 받을 수 있게 됩니다. 수주를 완수하면 명성을 얻어요.',
   effect:'unlockDelivery', cost:{gold:200, products:{steel:10}}, requires:[]},
  {key:'tunnelWork', branch:'explore', name:'터널 굴착', desc:'산을 가로지르는 터널을 뚫어 산 너머로 가는 길을 엽니다. 산 너머에는 더 희귀한 광맥이 있어요.',
   effect:'unlockTunnel', cost:{gold:1500, products:{alloy:5}}, requires:[]},
  // Task 80: late research — paid with upper parts, not only gold.
  {key:'explorationGear', branch:'explore', name:'탐사 장비', desc:'숨은 광맥을 더 먼 곳에서도 알아챌 수 있게 됩니다. (발견 반경 2.5 → 4.0) 광맥이 늘어나지는 않아요.',
   effect:'widenDiscovery', cost:{gold:2500, products:{manaLamp:4, steelGear:2}}, requires:[]},
  {key:'geologicalSurvey', branch:'explore', name:'지질 조사', desc:'시작 땅의 바깥쪽에서 숨은 광맥 3곳의 단서를 찾습니다. 우주 조각이나 플라즈마 광맥이 없으면 먼저 채워 줘요.',
   effect:'surveyGeology', cost:{gold:3000, products:{crystalLens:3, steelGear:3}}, requires:['tunnelWork']},
  {key:'workshopExpansion', branch:'craft', name:'제작소 증축', desc:'제작소를 6곳에서 8곳까지 지을 수 있게 됩니다.',
   effect:'expandWorkshops', cost:{gold:4000, products:{steelGear:6, manaEngine:2}}, requires:['workshopBuild']},
  {key:'tradeExpansion', branch:'delivery', name:'정기 거래 확대', desc:'정기 거래에서 한 번에 사 가는 물량이 5개에서 10개로 늘어납니다.',
   effect:'expandTrade', cost:{gold:3000, products:{crystalLens:5, relicOrnament:2}}, requires:['deliveryContract']},
  {key:'fastTrade', branch:'delivery', name:'빠른 거래', desc:'정기 거래 간격이 60초에서 40초로 줄어듭니다.',
   effect:'fastTrade', cost:{gold:5000, products:{starLens:2, precisionMachine:1}}, requires:['tradeExpansion']},
];
// Task 72: partner companies (Blueprint 15.1). Content data like SITES.
//   distance      shipping-cost factor (farther = costlier)
//   favorites     product keys the company likes: their delivery score is multiplied
//   regularScore  score at which a regular trade begins (Task 73)
//   requires      research keys that must be done before the company can be reached
//   orders        the company's orders in sequence: { product, qty }. Completing one
//                 pays reputation (see orderReputation in delivery.js).
// The number of companies that can be reached grows with reputation
// (BALANCE.delivery.SLOT_THRESHOLDS); free deliveries to them are always possible.
const COMPANIES = [
  {key:'forge', name:'마을 대장간', desc:'가까운 마을의 대장간. 강철과 석탄 벽돌을 좋아해요.',
   distance:1, favorites:['steel','coalBrick','ironTool','steelGear'], regularScore:300, requires:[],
   orders:[{product:'steel', qty:20}, {product:'coalBrick', qty:25}, {product:'steel', qty:60}, {product:'alloy', qty:10}, {product:'alloy', qty:20}]},
  {key:'harbor', name:'항구 상회', desc:'바다 건너로 물건을 파는 상회. 합금류를 높이 쳐줘요.',
   distance:1.5, favorites:['alloy','crystalAlloy','specialAlloy','manaLamp','crystalLens'], regularScore:1200, requires:[],
   orders:[{product:'alloy', qty:30}, {product:'crystalAlloy', qty:25}, {product:'specialAlloy', qty:20}, {product:'precisionPart', qty:10}, {product:'specialAlloy', qty:35}]},
  {key:'lab', name:'산 너머 연구소', desc:'산 너머의 연구소. 정밀한 부품과 코어를 찾아요. 터널이 열려야 닿을 수 있어요.',
   distance:2.5, favorites:['precisionPart','relicPart','quantumCore','plasmaCore','relicOrnament','manaEngine','starLens','plasmaCell','precisionMachine'], regularScore:6000, requires:['tunnelWork'],
   orders:[{product:'precisionPart', qty:20}, {product:'relicPart', qty:20}, {product:'quantumCore', qty:5}, {product:'plasmaCore', qty:8}]},
];
// Task 75: reputation effects. Each opens once reputation (permanent.totalPrestige)
// reaches `unlock` and stays; its size grows with reputation (capped by
// BALANCE.reputation.MAX). The size is read through reputationEffect(key).
//   perPoint  size gained per reputation point (the multiplier is special: BALANCE.reputation)
//   max       largest size (optional)
const REPUTATION_EFFECTS = [
  {key:'multiplier',       name:'채굴·판매 배율',  unlock:0, unit:'multiplier', desc:'모든 채굴과 판매 수익이 늘어요.'},
  {key:'shippingDiscount', name:'배송비 할인',     unlock:3, perPoint:0.02, max:0.30, unit:'percent', desc:'납품 배송비가 줄어요.'},
  {key:'craftSpeed',       name:'제작 속도',       unlock:6, perPoint:0.02, unit:'percent', desc:'제작이 빨라져요. (레시피와 제작소)'},
  {key:'tradePrice',       name:'정기 거래 가격',  unlock:9, perPoint:0.02, unit:'percent', desc:'정기 거래에서 더 높은 값을 받아요.'},
];
const RARITY = [
  {key:'common', label:'일반', chance:60, mining:1, carry:2, move:1, cls:'common'},
  {key:'rare',   label:'희귀', chance:25, mining:2, carry:3, move:2, cls:'rare'},
  {key:'epic',   label:'영웅', chance:12, mining:3, carry:5, move:3, cls:'epic'},
  {key:'legend', label:'전설', chance:3,  mining:5, carry:8, move:5, cls:'legend'},
];
const STAT_LABEL = {mining:'채굴속도', carry:'물자 이동량', move:'이동속도'};

// Lookups by key. They live here (not in systems.js) because worldgen.js and state.js
// need them while the page is still loading, before systems.js has run.
function resourceByKey(key){ return RESOURCES.find(r => r.key === key) || null; }
function recipeByKey(key){ return RECIPES.find(r => r.key === key) || null; }
