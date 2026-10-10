// ---------------------------------------------------------------------------
// Task 70: research (Blueprint 11). "연구 = 무엇을 할 수 있는가" — a one-time,
// instant purchase that unlocks a new possibility (RESEARCH in data.js).
//
// state.research maps research key -> true once done. Nothing resets it any
// more: the old prestige reset is gone (Task 74, Blueprint 15.1).
// A research's effect is one entry of RESEARCH_EFFECTS; the effect itself is
// the single place that changes the game (e.g. unlockTunnel in factory.js).
//
// Paying and applying happen in doResearch() only. Nothing here touches the
// DOM except log() (through doResearch), so the UI stays in ui.js.
// ---------------------------------------------------------------------------
// Task 71: unlockWorkshopBuild / unlockAutoCraft only mark the research done
// (state.research); the rest of the game asks isWorkshopBuildUnlocked() and
// isAutoCraftUnlocked().
const RESEARCH_EFFECTS = {
  unlockTunnel: () => unlockTunnel(),
  unlockWorkshopBuild: () => { log('제작소를 지을 수 있게 되었습니다.'); },
  unlockAutoCraft: () => { log('자동 제작 장치가 완성되었습니다.'); },
  unlockDelivery: () => { log('회사와 납품 계약을 맺었습니다.'); },
  // Task 80: late research. The first four only mark the research done; the
  // numbers they change are read through the helpers below.
  widenDiscovery: () => { log('탐사 장비가 완성되었습니다. 더 먼 곳의 광맥도 알아챌 수 있어요.'); },
  expandWorkshops: () => { log('제작소를 더 지을 수 있게 되었습니다.'); },
  expandTrade: () => { log('정기 거래 물량이 늘었습니다.'); },
  fastTrade: () => { log('정기 거래 간격이 짧아졌습니다.'); },
  surveyGeology: () => { surveyMines(); },
};

// Task 80: numbers that late research changes. The rest of the game asks these
// instead of reading BALANCE directly.
function discoveryRadius(){
  return isResearchDone('explorationGear') ? BALANCE.research.DISCOVERY_RADIUS : BALANCE.world.DISCOVERY_RADIUS;
}
function maxWorkshops(){
  return isResearchDone('workshopExpansion') ? BALANCE.research.MAX_WORKSHOPS : BALANCE.workshop.MAX_COUNT;
}
function tradeQty(){
  return isResearchDone('tradeExpansion') ? BALANCE.research.TRADE_QTY : BALANCE.delivery.TRADE_QTY;
}
function tradeInterval(){
  return isResearchDone('fastTrade') ? BALANCE.research.TRADE_INTERVAL_SEC : BALANCE.delivery.TRADE_INTERVAL_SEC;
}

// Task 80: 지질 조사 adds SURVEY_MINES hidden mines in the outer ring (open
// ground in the start land, never on an occupied cell). A cosmicShard / plasma
// mine the world still lacks is placed first, so the top recipes can always be
// supplied. Returns the new mines.
function surveyMines(options){
  const opts = options || {};
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const g = BALANCE.worldGen;
  const world = state.world;
  const ring = g.RINGS.find(r => r.key === 'outer');
  const base = world.base || { x: BALANCE.world.START_BASE_X, y: BALANCE.world.START_BASE_Y };
  if(!Array.isArray(world.hiddenMineIds)) world.hiddenMineIds = [];
  const used = new Set(world.mines.map(m => m.x + ',' + m.y));
  const candidates = worldGenAllCells().filter(c =>
    isCellOpenForMines(c.x, c.y) && !used.has(c.x + ',' + c.y) &&
    worldGenDistance(c.x, c.y, base.x, base.y) >= ring.minDist);
  const have = (r) => world.mines.some(m => m.resource === r);
  const wanted = ['cosmicShard', 'plasma'].filter(r => !have(r));
  const placed = [];
  const added = [];
  for(let i = 0; i < BALANCE.research.SURVEY_MINES; i++){
    const open = candidates.filter(c => !used.has(c.x + ',' + c.y));
    const spaced = open.filter(c => world.mines.concat(added).every(o => worldGenDistance(c.x, c.y, o.x, o.y) >= g.MIN_SPACING));
    const cell = worldGenPick(spaced.length ? spaced : open, random);
    if(!cell) break;
    const resource = wanted.length ? wanted.shift() : worldGenPickWeighted(worldGenRingWeights(ring, placed), random);
    if(!resource) break;
    placed.push(resource);
    used.add(cell.x + ',' + cell.y);
    const raw = makeGeneratedMine('mine_survey_' + (world.mines.length + 1), cell, resource);
    const mine = addMine(raw);
    if(!mine) continue;
    world.hiddenMineIds.push(mine.id);
    added.push(mine);
  }
  log('지질 조사: 숨은 광맥 ' + added.length + '곳의 단서를 찾았습니다. 돌아다니며 찾아보세요.');
  return added;
}

function isAutoCraftUnlocked(){ return isResearchDone('autoCraftDevice'); }
function isWorkshopBuildUnlocked(){ return isResearchDone('workshopBuild'); }
function isDeliveryUnlocked(){ return isResearchDone('deliveryContract'); }

function researchDef(key){
  if(typeof key !== 'string') return null;
  return RESEARCH.find(r => r.key === key) || null;
}

function isResearchDone(key){
  return !!state.research && state.research[key] === true;
}

function researchPrereqsMet(def){
  return (def.requires || []).every(isResearchDone);
}

function researchCostMet(def){
  const cost = def.cost || {};
  if((cost.gold || 0) > state.gold) return false;
  return Object.keys(cost.products || {}).every(k => (state.products[k] || 0) >= cost.products[k]);
}

// 'done' | 'locked' (a required research is missing) | 'available'
function researchStatus(key){
  const def = researchDef(key);
  if(!def) return null;
  if(isResearchDone(key)) return 'done';
  return researchPrereqsMet(def) ? 'available' : 'locked';
}

function canResearch(key){
  const def = researchDef(key);
  if(!def || researchStatus(key) !== 'available') return false;
  if(typeof RESEARCH_EFFECTS[def.effect] !== 'function') return false;
  return researchCostMet(def);
}

// Pays the cost, marks it done and applies the effect. Returns true on
// success; on any failure nothing is spent or changed.
function doResearch(key){
  if(!canResearch(key)) return false;
  const def = researchDef(key);
  const cost = def.cost || {};
  state.gold -= cost.gold || 0;
  Object.keys(cost.products || {}).forEach(k => { state.products[k] -= cost.products[k]; });
  if(!state.research) state.research = {};
  state.research[key] = true;
  log('연구 완료: ' + def.name);
  RESEARCH_EFFECTS[def.effect]();
  return true;
}

// Research whose effect is a state the game already holds is done exactly
// when that state is set: keeps `research` consistent with the world after
// loading a save and when the effect runs by itself (tunnel open). Old saves
// (before Task 71) have no research for workshops / auto-craft, so what they
// already used is grandfathered: a workshop that exists, an auto-craft that was on.
function researchSyncFromState(research, world, autoCraft){
  RESEARCH.forEach(def => {
    if(def.effect === 'unlockTunnel'){
      research[def.key] = !!world && world.tunnelUnlocked === true;
    } else if(def.effect === 'unlockWorkshopBuild'){
      if(world && Array.isArray(world.workshops) && world.workshops.length > 0) research[def.key] = true;
    } else if(def.effect === 'unlockAutoCraft'){
      const used = (autoCraft && Object.keys(autoCraft).some(k => autoCraft[k] === true)) ||
        (world && Array.isArray(world.workshops) && world.workshops.some(w => w && w.auto === true));
      if(used) research[def.key] = true;
    }
  });
  return research;
}
