// ---------------------------------------------------------------------------
// Task 21: minimal Factory DATA MODEL only — no behavior, no UI, no tick.
// Nothing else in the file reads `state.factory` yet: tickLoop() does not
// call a factory tick, renderAll() does not render it, and no recipe/craft
// logic touches it. It exists purely as a data skeleton future Tasks build
// on, exactly like craftFacility existed as plain data before craftSpeed()
// used it. Declared as consts (not inside freshFactoryState()) so they're
// initialized before `let state = freshRunState()` below runs.
// ---------------------------------------------------------------------------
const FACTORY_GRID_WIDTH = 25;
const FACTORY_GRID_HEIGHT = 25;
const FACTORY_NODE_MIN_SIZE = 1;
const FACTORY_NODE_MAX_SIZE = 3; // per the design blueprint: facilities are 1x1..3x3
const FACTORY_NODE_TYPES = ['production', 'storage']; // splitter/merger are NOT nodes (they're belt-attached modules per the blueprint) — not added here

const MINE_DEVELOPMENT_STATES = ['unsecured', 'secured'];

function freshWorldState(){
  return {
    base: { x: 0, y: 0, level: 1 },
    mines: [
      { id: 'mine_start_iron', x: 2, y: 0, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' },
      { id: 'mine_start_coal', x: 0, y: 2, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    ],
    workshops: [],
  };
}

function freshFactoryState(){
  return {
    grid: { width: FACTORY_GRID_WIDTH, height: FACTORY_GRID_HEIGHT },
    nodes: [], // {id, type:'production'|'storage', x, y, width, height}
    links: [], // {id, from:nodeId, to:nodeId} — abstract connection only, no belt path/direction/throughput
  };
}

// ---------------------------------------------------------------------------
// Task 20/21: `state` vs `permanent` is the run-scoped vs cross-prestige
// boundary — everything freshRunState() returns is wiped on prestige,
// everything in `permanent` survives it. Factory data is run-scoped (resets
// with mining/crafting progress on prestige, exactly like craftFacility),
// so it lives as an ADDITIVE key (`factory`) on the object freshRunState()
// returns, using the same additive-field pattern sanitizeRunState() already
// applies to craftFacility (missing/invalid -> safe default), so old saves
// without a `factory` field keep loading normally.
// ---------------------------------------------------------------------------
let state = freshRunState();
// Permanent (cross-prestige) state — totalPrestige/runCount/tickets/
// firstGachaGranted all live here in one container instead of being split
// across module-scope lets and window.* globals. Same four values, same
// meaning, same save/load JSON shape as before (Task 1/6); sanitizePermanent()
// already returns exactly this shape, so loading a save assigns into this
// variable directly.
let permanent = { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: false };

function freshRunState(){
  const resources = {}, facility = {}, workforce = {};
  RESOURCES.forEach(r=>{ resources[r.key]=0; facility[r.key]=0; workforce[r.key]=0; });
  const unlockedSites = {};
  SITES.forEach(s=>{ unlockedSites[s.key] = s.unlockCost === 0; });
  const products = {}, autoCraft = {}, autoSell = {}, autoSellOn = {}, craftQueue = {};
  RECIPES.forEach(r=>{ products[r.key]=0; autoCraft[r.key]=false; autoSell[r.key]=false; autoSellOn[r.key]=true; craftQueue[r.key]=null; });
  return {
    resources, products, gold:0, runGold:0,
    characters:[], // {id, rarity, resource, mining, carry, move, miningLvl, carryLvl, moveLvl}
    lastPull:null,
    facility,   // resource-funded manual-yield upgrade levels (per line)
    workforce,  // resource-funded auto-rate upgrade levels (per line)
    unlockedSites, // which mining sites are unlocked
    autoCraft,
    autoSell,   // recipe key -> bool, gold-purchased
    autoSellOn, // recipe key -> bool, toggle while owned
    craftQueue, // recipe key -> seconds remaining while processing, else null
    hqLevel:0,  // gold-funded run-scoped multiplier
    craftFacility:1, // gold-funded run-scoped timed-craft speed level (1 = current craft times)
    autoLineLogged:false, // Task 6: has the one-time "both iron+coal automated" log fired this run?
    factory: freshFactoryState(), // Task 21: data-only Factory skeleton (grid/nodes/links); unused by tick/UI/logic so far
    world: freshWorldState(), // Task 27: base + world mine data skeleton; no mining behavior yet
  };
}

// ---------------------------------------------------------------------------
// Save / load (localStorage). Task 1. Single storage key, versioned payload,
// per-field defensive validation. Never touches game balance/rules — only
// persists and restores the state that already exists above.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'gachaFactorySave';
const CURRENT_SAVE_VERSION = 1;
let saveBlocked = false;    // true once a future-version save is detected, so we never overwrite it
let saveFailLogged = false; // avoid spamming the log every 10s while storage stays unavailable

function isFiniteNumber(v){ return typeof v === 'number' && Number.isFinite(v); }
function isNonNegativeFinite(v){ return isFiniteNumber(v) && v >= 0; }
function isNonNegativeInt(v){ return isNonNegativeFinite(v) && Number.isInteger(v); }
function isPlainObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }

function storageAvailable(){
  try{
    const k = '__save_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  }catch(e){ return false; }
}

function sanitizeNumberMap(raw, keys, fallback, validator){
  const check = validator || isFiniteNumber;
  const out = {};
  keys.forEach(k=>{ out[k] = check(raw && raw[k]) ? raw[k] : fallback; });
  return out;
}
function sanitizeBoolMap(raw, keys, fallback){
  const out = {};
  keys.forEach(k=>{ out[k] = typeof (raw && raw[k]) === 'boolean' ? raw[k] : fallback; });
  return out;
}
function sanitizeCraftQueueMap(raw, keys){
  const out = {};
  keys.forEach(k=>{
    const v = raw && raw[k];
    out[k] = (v === null || isNonNegativeFinite(v)) ? v : null;
  });
  return out;
}
function sanitizeUnlockedSites(raw){
  const out = {};
  SITES.forEach(s=>{
    const v = raw && raw[s.key];
    out[s.key] = typeof v === 'boolean' ? v : (s.unlockCost === 0);
  });
  return out;
}
function sanitizeCharacter(c){
  if(!isPlainObject(c)) return null;
  if(!RARITY.some(r=>r.key===c.rarity)) return null;
  if(!RESOURCES.some(r=>r.key===c.resource)) return null;
  const nums = ['mining','carry','move','miningLvl','carryLvl','moveLvl'];
  if(!nums.every(k=>isNonNegativeFinite(c[k]))) return null;
  const result = {
    rarity:c.rarity, resource:c.resource,
    mining:c.mining, carry:c.carry, move:c.move,
    miningLvl:c.miningLvl, carryLvl:c.carryLvl, moveLvl:c.moveLvl,
  };
  // Preserve an existing valid id as-is; leave it unset otherwise so
  // sanitizeCharacters (which sees the whole array at once) can backfill it.
  if(typeof c.id === 'string' && c.id.length > 0) result.id = c.id;
  return result;
}
function sanitizeCharacters(raw){
  if(!Array.isArray(raw)) return [];
  const chars = raw.map(sanitizeCharacter).filter(c=>c!==null);
  // Backfill missing ids and resolve duplicates (old saves predate ids
  // entirely, so this also covers the "no worker has an id yet" case).
  // Order and all other fields are untouched; the first occurrence of any
  // duplicate id keeps it, later duplicates get a fresh one.
  const seenIds = new Set();
  chars.forEach(c=>{
    if(typeof c.id !== 'string' || c.id.length === 0 || seenIds.has(c.id)){
      c.id = makeWorkerId(seenIds);
    }
    seenIds.add(c.id);
  });
  return chars;
}

// ---------------------------------------------------------------------------
// Task 21: Factory sanitize helpers — same defensive pattern as the rest of
// this file (single bad field -> safe default, everything else kept). None
// of this is read by gameplay yet; it only guarantees save/load never
// breaks on Factory data, present or absent.
// ---------------------------------------------------------------------------
function isValidNodeSize(v){
  return isNonNegativeInt(v) && v >= FACTORY_NODE_MIN_SIZE && v <= FACTORY_NODE_MAX_SIZE;
}
function isValidGridCoord(v){
  return Number.isInteger(v) && v >= 0;
}
function sanitizeFactoryNode(n){
  if(!isPlainObject(n)) return null;
  if(!FACTORY_NODE_TYPES.includes(n.type)) return null;
  const result = {
    type: n.type,
    x: isValidGridCoord(n.x) ? n.x : 0,
    y: isValidGridCoord(n.y) ? n.y : 0,
    width: isValidNodeSize(n.width) ? n.width : FACTORY_NODE_MIN_SIZE,
    height: isValidNodeSize(n.height) ? n.height : FACTORY_NODE_MIN_SIZE,
  };
  // Preserve an existing valid id as-is; leave it unset otherwise so
  // sanitizeFactoryNodes (which sees the whole array at once) can backfill it
  // — same approach as sanitizeCharacter()/sanitizeCharacters() above.
  if(typeof n.id === 'string' && n.id.length > 0) result.id = n.id;
  return result;
}
function sanitizeFactoryNodes(raw){
  if(!Array.isArray(raw)) return [];
  const nodes = raw.map(sanitizeFactoryNode).filter(n=>n!==null);
  const seenIds = new Set();
  nodes.forEach(n=>{
    if(typeof n.id !== 'string' || n.id.length === 0 || seenIds.has(n.id)){
      n.id = makeEntityId('node_', seenIds);
    }
    seenIds.add(n.id);
  });
  return nodes;
}
function sanitizeFactoryLink(l){
  if(!isPlainObject(l)) return null;
  if(typeof l.from !== 'string' || l.from.length === 0) return null;
  if(typeof l.to !== 'string' || l.to.length === 0) return null;
  const result = { from: l.from, to: l.to };
  if(typeof l.id === 'string' && l.id.length > 0) result.id = l.id;
  return result;
}
function sanitizeFactoryLinks(raw){
  if(!Array.isArray(raw)) return [];
  const links = raw.map(sanitizeFactoryLink).filter(l=>l!==null);
  const seenIds = new Set();
  links.forEach(l=>{
    if(typeof l.id !== 'string' || l.id.length === 0 || seenIds.has(l.id)){
      l.id = makeEntityId('link_', seenIds);
    }
    seenIds.add(l.id);
  });
  return links;
}
function sanitizeFactoryGrid(raw){
  const width = (isPlainObject(raw) && isNonNegativeInt(raw.width) && raw.width > 0) ? raw.width : FACTORY_GRID_WIDTH;
  const height = (isPlainObject(raw) && isNonNegativeInt(raw.height) && raw.height > 0) ? raw.height : FACTORY_GRID_HEIGHT;
  return { width, height };
}
// No `factory` field at all (every pre-Task-21 save) is exactly the
// legacy-save case: falls straight to freshFactoryState(), same as any other
// additive field defaulting when missing.
function sanitizeMine(m){
  if(!isPlainObject(m)) return null;
  const result = {
    x: isValidGridCoord(m.x) ? m.x : 0,
    y: isValidGridCoord(m.y) ? m.y : 0,
    resource: RESOURCES.some(r => r.key === m.resource) ? m.resource : RESOURCES[0].key,
    grade: isNonNegativeInt(m.grade) && m.grade >= 1 ? m.grade : 1,
    miningPower: isNonNegativeFinite(m.miningPower) ? m.miningPower : 1,
    developmentState: MINE_DEVELOPMENT_STATES.includes(m.developmentState) ? m.developmentState : 'unsecured',
  };
  if(typeof m.id === 'string' && m.id.length > 0) result.id = m.id;
  return result;
}
function sanitizeMines(raw){
  if(!Array.isArray(raw)) return [];
  const mines = raw.map(sanitizeMine).filter(m => m !== null);
  const seenIds = new Set();
  mines.forEach(m => {
    if(typeof m.id !== 'string' || m.id.length === 0 || seenIds.has(m.id)){
      m.id = makeEntityId('mine_', seenIds);
    }
    seenIds.add(m.id);
  });
  return mines;
}
function sanitizeWorkshop(w){
  if(!isPlainObject(w)) return null;
  const result = {
    x: isValidGridCoord(w.x) ? w.x : 0,
    y: isValidGridCoord(w.y) ? w.y : 0,
    level: isNonNegativeInt(w.level) && w.level >= 1 ? w.level : 1,
  };
  if(typeof w.id === 'string' && w.id.length > 0) result.id = w.id;
  return result;
}

function sanitizeWorkshops(raw){
  if(!Array.isArray(raw)) return [];
  const workshops = raw.map(sanitizeWorkshop).filter(w => w !== null);
  const seenIds = new Set();
  workshops.forEach(w => {
    if(typeof w.id !== 'string' || w.id.length === 0 || seenIds.has(w.id)){
      w.id = makeEntityId('workshop_', seenIds);
    }
    seenIds.add(w.id);
  });
  return workshops;
}

function sanitizeWorldState(raw){
  if(!isPlainObject(raw)) return freshWorldState();
  const baseRaw = isPlainObject(raw.base) ? raw.base : {};
  return {
    base: {
      x: isValidGridCoord(baseRaw.x) ? baseRaw.x : 0,
      y: isValidGridCoord(baseRaw.y) ? baseRaw.y : 0,
      level: isNonNegativeInt(baseRaw.level) && baseRaw.level >= 1 ? baseRaw.level : 1,
    },
    mines: sanitizeMines(raw.mines),
    workshops: sanitizeWorkshops(raw.workshops),
  };
}

function sanitizeFactoryState(raw){
  if(!isPlainObject(raw)) return freshFactoryState();
  return {
    grid: sanitizeFactoryGrid(raw.grid),
    nodes: sanitizeFactoryNodes(raw.nodes),
    links: sanitizeFactoryLinks(raw.links),
  };
}

// Rebuilds a fully-valid run state from (possibly malformed) saved data.
// Any single bad field falls back to its default; every other, valid field
// is kept — a corrupted `characters` array doesn't wipe out `resources`, etc.
function sanitizeRunState(raw){
  const fresh = freshRunState();
  if(!isPlainObject(raw)) return fresh;
  const resKeys = RESOURCES.map(r=>r.key);
  const recipeKeys = RECIPES.map(r=>r.key);
  return {
    resources: sanitizeNumberMap(raw.resources, resKeys, 0, isNonNegativeFinite),
    products: sanitizeNumberMap(raw.products, recipeKeys, 0, isNonNegativeFinite),
    gold: isNonNegativeFinite(raw.gold) ? raw.gold : 0,
    runGold: isNonNegativeFinite(raw.runGold) ? raw.runGold : 0,
    characters: sanitizeCharacters(raw.characters),
    lastPull: sanitizeCharacter(raw.lastPull), // cosmetic only; null is a safe fallback
    facility: sanitizeNumberMap(raw.facility, resKeys, 0, isNonNegativeFinite),
    workforce: sanitizeNumberMap(raw.workforce, resKeys, 0, isNonNegativeFinite),
    unlockedSites: sanitizeUnlockedSites(raw.unlockedSites),
    autoCraft: sanitizeBoolMap(raw.autoCraft, recipeKeys, false),
    autoSell: sanitizeBoolMap(raw.autoSell, recipeKeys, false),
    autoSellOn: sanitizeBoolMap(raw.autoSellOn, recipeKeys, true),
    craftQueue: sanitizeCraftQueueMap(raw.craftQueue, recipeKeys), // paused countdowns restored as-is
    hqLevel: isNonNegativeInt(raw.hqLevel) ? raw.hqLevel : 0, // hqLevel is always a whole level in normal play
    craftFacility: (isNonNegativeInt(raw.craftFacility) && raw.craftFacility >= 1) ? raw.craftFacility : 1, // Task 16: additive field, missing/invalid → default 1 (preserves current craft times)
    autoLineLogged: typeof raw.autoLineLogged === 'boolean' ? raw.autoLineLogged : false, // Task 6: additive field, no saveVersion bump needed
    factory: sanitizeFactoryState(raw.factory), // Task 21: additive field; missing (legacy save) → fresh default Factory state
    world: sanitizeWorldState(raw.world), // Task 27: additive field; missing (legacy save) -> fresh world state
  };
}
function sanitizePermanent(raw){
  const fresh = { totalPrestige:0, runCount:1, tickets:0, firstGachaGranted:false };
  if(!isPlainObject(raw)) return fresh;
  return {
    totalPrestige: isNonNegativeFinite(raw.totalPrestige) ? raw.totalPrestige : 0,
    runCount: (Number.isInteger(raw.runCount) && raw.runCount >= 1) ? raw.runCount : 1, // runCount starts at 1 and only ever increments
    tickets: isNonNegativeFinite(raw.tickets) ? raw.tickets : 0,
    firstGachaGranted: typeof raw.firstGachaGranted === 'boolean' ? raw.firstGachaGranted : false,
  };
}

// Structure for future migrations: each entry converts a payload FROM that
// saveVersion TO the next one. Empty for now since CURRENT_SAVE_VERSION is
// still 1 — add entries here (keyed by the version being upgraded FROM) when
// the save shape needs to change later.
const SAVE_MIGRATIONS = {
  // 1: function(payload){ ...convert payload.run/permanent...; payload.saveVersion = 2; return payload; }
};
function migrateSave(payload){
  let v = payload.saveVersion;
  while(v < CURRENT_SAVE_VERSION && SAVE_MIGRATIONS[v]){
    payload = SAVE_MIGRATIONS[v](payload);
    v = payload.saveVersion;
  }
  return payload;
}

function setSaveStatus(text){
  const el = document.getElementById('saveStatus');
  if(el) el.textContent = text;
}

function saveGame(){
  if(saveBlocked) return false; // a future-version save exists on disk — never overwrite it
  try{
    if(!storageAvailable()){
      if(!saveFailLogged){ log('저장할 수 없음'); saveFailLogged = true; }
      setSaveStatus('저장 안 됨');
      return false;
    }
    const payload = {
      saveVersion: CURRENT_SAVE_VERSION,
      savedAt: Date.now(),
      permanent: { totalPrestige: permanent.totalPrestige, runCount: permanent.runCount, tickets: permanent.tickets, firstGachaGranted: permanent.firstGachaGranted },
      run: state,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    saveFailLogged = false;
    setSaveStatus('저장됨');
    return true;
  }catch(e){
    if(!saveFailLogged){ log('저장할 수 없음'); saveFailLogged = true; }
    setSaveStatus('저장 안 됨');
    return false;
  }
}

// Returns one of:
//   {ok:true, permanent, run}
//   {ok:false, reason:'none'}        — nothing saved yet (not an error)
//   {ok:false, reason:'unavailable'} — localStorage can't be used here
//   {ok:false, reason:'corrupted'}   — save exists but isn't valid JSON/shape
//   {ok:false, reason:'future'}      — save is from a newer saveVersion than this build understands
function loadGame(){
  let raw;
  try{
    if(!storageAvailable()) return { ok:false, reason:'unavailable' };
    raw = localStorage.getItem(SAVE_KEY);
  }catch(e){
    return { ok:false, reason:'unavailable' };
  }
  if(!raw) return { ok:false, reason:'none' };
  let payload;
  try{
    payload = JSON.parse(raw);
  }catch(e){
    return { ok:false, reason:'corrupted' };
  }
  if(!isPlainObject(payload) || !isFiniteNumber(payload.saveVersion)){
    return { ok:false, reason:'corrupted' };
  }
  if(payload.saveVersion > CURRENT_SAVE_VERSION){
    return { ok:false, reason:'future' }; // never touch the raw storage in this case
  }
  payload = migrateSave(payload);
  return {
    ok:true,
    permanent: sanitizePermanent(payload.permanent),
    run: sanitizeRunState(payload.run),
  };
}

