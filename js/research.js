// ---------------------------------------------------------------------------
// Task 70: research (Blueprint 11). "연구 = 무엇을 할 수 있는가" — a one-time,
// instant purchase that unlocks a new possibility (RESEARCH in data.js).
//
// state.research maps research key -> true once done (run-scoped, like the
// world: it resets with a new run until the prestige overhaul, Blueprint 15.1).
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
};

function isAutoCraftUnlocked(){ return isResearchDone('autoCraftDevice'); }
function isWorkshopBuildUnlocked(){ return isResearchDone('workshopBuild'); }

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
