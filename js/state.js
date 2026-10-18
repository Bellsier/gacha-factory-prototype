const MINE_DEVELOPMENT_STATES = ['unsecured', 'secured'];

const PLAYER_FACINGS = ['up', 'down', 'left', 'right'];

// Task 62: the player starts on the base (not at world 0,0).
function freshPlayerState(base){
  const at = base || freshBasePosition();
  return { x: at.x, y: at.y, facing: 'down', pose: 'idle' };
}

// Task 62: new-game base position (base-centred world, slightly east).
function freshBasePosition(){
  return { x: BALANCE.world.START_BASE_X, y: BALANCE.world.START_BASE_Y };
}

// New-game entry point for the world. Task 63: the mine layout is generated
// randomly here, once per new run (js/worldgen.js); loading a save never comes
// through here for a save that has a world — sanitizeWorldState keeps it.
function freshWorldState(){
  const base = { ...freshBasePosition(), level: 1 };
  const mines = generateInitialWorldMines(base);
  return {
    base,
    mines,
    workshops: [],
    player: freshPlayerState(base),
    // Task 68: the tunnel through the mountain starts closed. Opening it is
    // progress (saved); the terrain itself is fixed and never saved.
    tunnelUnlocked: false,
    // Task 93: the construction job (null = none). startedAt is a Date.now() value, so
    // the work goes on while the game is closed.
    tunnelContract: null,
    // Task 65: every generated mine except the starters begins undiscovered;
    // walking near one reveals it (tickExploration in systems.js).
    hiddenMineIds: mines.filter(m => !m.id.startsWith('mine_start_')).map(m => m.id),
    // Task 112: torches the player has set down in the world ({ x, y } each)
    torches: [],
  };
}

// ---------------------------------------------------------------------------
// Task 20/21/74: `state` is the run (what a new game starts with);
// `permanent` holds what is kept across games: reputation, company progress,
// tickets. There is no prestige reset any more (Task 74): a new run state is
// built only for a new game or a save that has none. Old saves may carry a
// leftover `factory` key; sanitizeRunState() simply ignores it.
// ---------------------------------------------------------------------------
let state = freshRunState();
// Permanent state — totalPrestige (reputation)/runCount/tickets/
// firstGachaGranted all live here in one container instead of being split
// across module-scope lets and window.* globals. Same four values, same
// meaning, same save/load JSON shape as before (Task 1/6); sanitizePermanent()
// already returns exactly this shape, so loading a save assigns into this
// variable directly.
let permanent = { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: false, companies: freshCompaniesState() };

function freshRunState(){
  const resources = {}, facility = {}, workforce = {};
  RESOURCES.forEach(r=>{ resources[r.key]=0; facility[r.key]=0; workforce[r.key]=0; });
  const unlockedSites = {};
  SITES.forEach(s=>{ unlockedSites[s.key] = s.unlockCost === 0; });
  const research = {};
  RESEARCH.forEach(r=>{ research[r.key] = false; });
  const products = {}, autoCraft = {}, craftTarget = {}, autoSell = {}, autoSellOn = {}, craftQueue = {};
  RECIPES.forEach(r=>{ products[r.key]=0; autoCraft[r.key]=false; craftTarget[r.key]=0; autoSell[r.key]=false; autoSellOn[r.key]=true; craftQueue[r.key]=null; });
  return {
    resources, products, gold:0,
    characters:[], // {id, rarity, resource, mining, carry, move, miningLvl, carryLvl, moveLvl}
    lastPull:null,
    facility,   // resource-funded manual-yield upgrade levels (per line)
    workforce,  // resource-funded auto-rate upgrade levels (per line)
    unlockedSites, // which mining sites are unlocked
    research,   // Task 70: research key -> bool (run-scoped, see js/research.js)
    autoCraft,
    craftTarget, // Task 86: recipe key -> stock at which auto-craft pauses (0 = no limit)
    autoSell,   // recipe key -> bool, gold-purchased
    autoSellOn, // recipe key -> bool, toggle while owned
    craftQueue, // recipe key -> seconds remaining while processing, else null
    hqLevel:0,  // gold-funded run-scoped multiplier
    craftFacility:1, // gold-funded run-scoped timed-craft speed level (1 = current craft times)
    autoLineLogged:false, // Task 6: has the one-time "both iron+coal automated" log fired this run?
    world: freshWorldState(), // Task 27+: base, world mines, workshops
    village: freshVillageState(), // Task 113: the starting village (sites, restoration, relics)
  };
}

// ---------------------------------------------------------------------------
// Task 113: the starting village beside the workshop (blueprint 24.8). Run
// progress, saved in run.village (additive field, saveVersion 1).
//   sites        where each facility stands ({x, y} world units, its door step),
//                chosen once among free ground and then kept (null = not yet chosen)
//   stage        restoration per facility: 0 ruin, 1 cleared, 2 open
//   unidentified relics picked up while mining, waiting for the appraiser
//   digProgress  manual mining progress toward the next unidentified relic
//   appraised    how many relics have been appraised (drives which relic comes out)
//   owned        appraised relics in hand: relic key -> count
//   codex        relic keys registered in the codex (appraised at least once)
//   donated      relic keys donated to the museum (one of each, on display)
//   district     Task 118: the plaza point and the layout of the house and garden
//                lots round it ({x, y, layout}; null = not yet chosen)
//   decor        Task 120: decorations set down in the garden ([{kind, cell}], one per cell)
//   specimens    Task 121: minerals and gems donated to the museum, one of each kind, in
//                order, with when ([{key, at}], `at` a Date.now() value)
// The facility and relic lists are in js/village.js; this only checks shapes,
// so it can run before that file is loaded.
// ---------------------------------------------------------------------------
const VILLAGE_FACILITY_KEYS = ['appraiser', 'museum'];

function freshVillageState(){
  return { sites: { appraiser: null, museum: null }, stage: { appraiser: 0, museum: 0 },
    unidentified: 0, digProgress: 0, appraised: 0, owned: {}, codex: [], donated: [], district: null, decor: [], specimens: [] };
}

// Task 121: missing or invalid (any older save) -> none donated. Known raw resources (the
// museum's list when js/village.js is loaded), each once; a missing time is kept as 0.
function sanitizeVillageSpecimens(raw){
  if(!Array.isArray(raw)) return [];
  const keys = typeof VILLAGE_SPECIMEN_KEYS !== 'undefined' ? VILLAGE_SPECIMEN_KEYS : RESOURCES.map(r => r.key);
  const out = [];
  raw.forEach(d => {
    if(!isPlainObject(d) || !keys.includes(d.key) || out.some(o => o.key === d.key)) return;
    out.push({ key: d.key, at: isNonNegativeFinite(d.at) ? d.at : 0 });
  });
  return out;
}

// Task 120: missing or invalid (any older save) -> an empty garden. Known kinds (when js/village.js
// is loaded), whole cells of the garden grid, one decoration per cell.
function sanitizeVillageDecor(raw){
  if(!Array.isArray(raw)) return [];
  const V = typeof VILLAGE !== 'undefined' ? VILLAGE : null;
  const kinds = V && V.DECOR ? V.DECOR.map(d => d.key) : null, cells = V && V.GARDEN ? V.GARDEN.COLS * V.GARDEN.ROWS : 12;
  const out = [], used = new Set();
  raw.forEach(d => {
    if(!isPlainObject(d) || typeof d.kind !== 'string' || (kinds && !kinds.includes(d.kind)) || !Number.isInteger(d.cell) || d.cell < 0 || d.cell >= cells || used.has(d.cell)) return;
    used.add(d.cell); out.push({ kind: d.kind, cell: d.cell });
  });
  return out;
}

// Task 118: missing or invalid (any older save) -> null, chosen again on load.
function sanitizeVillageDistrict(raw){
  const site = sanitizeVillageSite(raw);
  if(!site || !Number.isInteger(raw.layout) || raw.layout < 0) return null;
  if(typeof VILLAGE !== 'undefined' && VILLAGE.DISTRICT && raw.layout >= VILLAGE.DISTRICT.LAYOUTS.length) return null;
  return { x: site.x, y: site.y, layout: raw.layout };
}

function sanitizeVillageSite(raw){
  if(!isPlainObject(raw) || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !terrainInBounds(raw.x, raw.y)) return null;
  return { x: raw.x, y: raw.y };
}

// Missing or invalid (any older save) -> a ruined village with no relics.
// Relic keys must be on the relic list (VILLAGE_RELIC_KEYS, js/village.js) when it is loaded.
function sanitizeVillageState(raw){
  const fresh = freshVillageState();
  if(!isPlainObject(raw)) return fresh;
  const known = (k) => typeof k === 'string' && (typeof VILLAGE_RELIC_KEYS === 'undefined' || VILLAGE_RELIC_KEYS.includes(k));
  const sites = isPlainObject(raw.sites) ? raw.sites : {}, stage = isPlainObject(raw.stage) ? raw.stage : {};
  const owned = {};
  if(isPlainObject(raw.owned)) Object.keys(raw.owned).forEach(k => { if(known(k) && isNonNegativeInt(raw.owned[k]) && raw.owned[k] > 0) owned[k] = raw.owned[k]; });
  const keyList = (list) => Array.isArray(list) ? [...new Set(list.filter(known))] : [];
  const out = {
    sites: {}, stage: {},
    unidentified: isNonNegativeInt(raw.unidentified) ? raw.unidentified : 0,
    digProgress: isNonNegativeInt(raw.digProgress) ? raw.digProgress : 0,
    appraised: isNonNegativeInt(raw.appraised) ? raw.appraised : 0,
    owned, codex: keyList(raw.codex), donated: keyList(raw.donated),
    district: sanitizeVillageDistrict(raw.district),
    decor: sanitizeVillageDecor(raw.decor),
    specimens: sanitizeVillageSpecimens(raw.specimens),
  };
  VILLAGE_FACILITY_KEYS.forEach(k => {
    out.sites[k] = sanitizeVillageSite(sites[k]);
    out.stage[k] = isNonNegativeInt(stage[k]) && stage[k] <= 2 ? stage[k] : 0;
  });
  // what was donated or is owned has been appraised, so it is in the codex
  Object.keys(owned).concat(out.donated).forEach(k => { if(!out.codex.includes(k)) out.codex.push(k); });
  return out;
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

function isValidWorldCoord(v, axis){
  const b = BALANCE.world;
  const min = axis === 'y' ? b.BOUNDS_MIN_Y : b.BOUNDS_MIN_X;
  const max = axis === 'y' ? b.BOUNDS_MAX_Y : b.BOUNDS_MAX_X;
  return Number.isInteger(v) && v >= min && v <= max;
}
function isValidWorldX(v){ return isValidWorldCoord(v, 'x'); }
function isValidWorldY(v){ return isValidWorldCoord(v, 'y'); }
function sanitizeMine(m){
  if(!isPlainObject(m)) return null;
  const result = {
    x: isValidWorldX(m.x) ? m.x : 0,
    y: isValidWorldY(m.y) ? m.y : 0,
    resource: RESOURCES.some(r => r.key === m.resource) ? m.resource : RESOURCES[0].key,
    grade: isNonNegativeInt(m.grade) && m.grade >= 1 ? m.grade : 1,
    miningPower: isNonNegativeFinite(m.miningPower) && m.miningPower > 0 ? m.miningPower : 1,
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
    x: isValidWorldX(w.x) ? w.x : 0,
    y: isValidWorldY(w.y) ? w.y : 0,
    level: isNonNegativeInt(w.level) && w.level >= 1 ? w.level : 1,
    recipeKey: typeof w.recipeKey === 'string' && RECIPES.some(r => r.key === w.recipeKey) ? w.recipeKey : null,
    auto: typeof w.auto === 'boolean' ? w.auto : false,
    progress: isNonNegativeFinite(w.progress) && w.progress > 0 ? w.progress : null,
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

function clampPlayerAxis(v, min, max){
  if(!isFiniteNumber(v)) return min;
  if(v < min) return min;
  if(v > max) return max;
  return v;
}

// Task 62: a missing/invalid player falls back to standing on the base.
// Task 68: `tunnelOpen` is the tunnel state of the save being loaded (the
// global `state` is still the old game at that point), so a player saved
// beyond the mountain stays there when the saved tunnel is open.
function sanitizePlayer(raw, base, tunnelOpen){
  const fresh = freshPlayerState(base);
  if(!isPlainObject(raw)) return fresh;
  let x = isFiniteNumber(raw.x) ? clampPlayerAxis(raw.x, BALANCE.world.BOUNDS_MIN_X, BALANCE.world.BOUNDS_MAX_X) : fresh.x;
  let y = isFiniteNumber(raw.y) ? clampPlayerAxis(raw.y, BALANCE.world.BOUNDS_MIN_Y, BALANCE.world.BOUNDS_MAX_Y) : fresh.y;
  // Task 66: a saved position inside the mountain / beyond it (only possible
  // in saves from before the mountain existed) is moved onto the base.
  if(!isWorldPointWalkable(x, y, tunnelOpen === true)){ x = fresh.x; y = fresh.y; }
  return {
    x,
    y,
    facing: PLAYER_FACINGS.includes(raw.facing) ? raw.facing : fresh.facing,
    pose: 'idle',
  };
}

function sanitizeWorldState(raw){
  if(!isPlainObject(raw)) return freshWorldState();
  const baseRaw = isPlainObject(raw.base) ? raw.base : {};
  // Task 62: saved world coordinates are kept exactly as saved (an older
  // save's base at 0,0 and its mines stay where they were — still valid in the
  // wider -10..10 world, same layout). Nothing is shifted or regenerated.
  // Only a missing/invalid base coordinate falls back to the new-game base.
  const baseFallback = freshBasePosition();
  const base = {
    x: isValidWorldX(baseRaw.x) ? baseRaw.x : baseFallback.x,
    y: isValidWorldY(baseRaw.y) ? baseRaw.y : baseFallback.y,
    level: isNonNegativeInt(baseRaw.level) && baseRaw.level >= 1 ? baseRaw.level : 1,
  };
  const mines = sanitizeMines(raw.mines);
  // Task 68: additive field (saveVersion unchanged). Missing or invalid (any
  // older save) = the tunnel is still closed.
  const tunnelUnlocked = raw.tunnelUnlocked === true;
  return {
    base,
    mines,
    workshops: sanitizeWorkshops(raw.workshops),
    player: sanitizePlayer(raw.player, base, tunnelUnlocked),
    tunnelUnlocked,
    tunnelContract: tunnelUnlocked ? null : sanitizeTunnelContract(raw.tunnelContract),
    hiddenMineIds: sanitizeHiddenMineIds(raw.hiddenMineIds, mines),
    torches: sanitizeTorches(raw.torches),
  };
}

// Task 112: additive field (saveVersion unchanged). Missing or invalid (any
// older save) = no torches. Keeps valid in-world points only, up to the cap;
// positions are kept exactly as saved.
function sanitizeTorches(raw){
  if(!Array.isArray(raw)) return [];
  return raw.filter(t => isPlainObject(t) && isFiniteNumber(t.x) && isFiniteNumber(t.y) && terrainInBounds(t.x, t.y))
    .slice(0, typeof TORCH !== 'undefined' ? TORCH.MAX : 12).map(t => ({ x: t.x, y: t.y }));
}

// Task 93: additive field. Anything that is not a valid job = no job.
function sanitizeTunnelContract(raw){
  if(!isPlainObject(raw)) return null;
  if(!isNonNegativeFinite(raw.startedAt) || !isNonNegativeFinite(raw.durationSec) || raw.durationSec <= 0) return null;
  return { startedAt: raw.startedAt, durationSec: raw.durationSec };
}

// Task 65: additive field (saveVersion unchanged). Missing (any older save) ->
// [] = every mine already discovered, so older saves look exactly as before.
// Keeps only unique ids of mines that exist.
function sanitizeHiddenMineIds(raw, mines){
  if(!Array.isArray(raw)) return [];
  const ids = new Set(mines.map(m => m.id));
  return [...new Set(raw.filter(id => typeof id === 'string' && ids.has(id)))];
}

// Rebuilds a fully-valid run state from (possibly malformed) saved data.
// Any single bad field falls back to its default; every other, valid field
// is kept — a corrupted `characters` array doesn't wipe out `resources`, etc.
function sanitizeRunState(raw){
  const fresh = freshRunState();
  if(!isPlainObject(raw)) return fresh;
  const resKeys = RESOURCES.map(r=>r.key);
  const recipeKeys = RECIPES.map(r=>r.key);
  const world = sanitizeWorldState(raw.world);
  const autoCraft = sanitizeBoolMap(raw.autoCraft, recipeKeys, false);
  return {
    resources: sanitizeNumberMap(raw.resources, resKeys, 0, isNonNegativeFinite),
    products: sanitizeNumberMap(raw.products, recipeKeys, 0, isNonNegativeFinite),
    gold: isNonNegativeFinite(raw.gold) ? raw.gold : 0,
    characters: sanitizeCharacters(raw.characters),
    lastPull: sanitizeCharacter(raw.lastPull), // cosmetic only; null is a safe fallback
    facility: sanitizeNumberMap(raw.facility, resKeys, 0, isNonNegativeFinite),
    workforce: sanitizeNumberMap(raw.workforce, resKeys, 0, isNonNegativeFinite),
    unlockedSites: sanitizeUnlockedSites(raw.unlockedSites),
    research: researchSyncFromState(sanitizeBoolMap(raw.research, RESEARCH.map(r=>r.key), false), world, autoCraft), // Task 70/71: additive field; missing -> all false (usage grandfathers old saves)
    autoCraft,
    craftTarget: sanitizeNumberMap(raw.craftTarget, recipeKeys, 0, isNonNegativeInt),
    autoSell: sanitizeBoolMap(raw.autoSell, recipeKeys, false),
    autoSellOn: sanitizeBoolMap(raw.autoSellOn, recipeKeys, true),
    craftQueue: sanitizeCraftQueueMap(raw.craftQueue, recipeKeys), // paused countdowns restored as-is
    hqLevel: isNonNegativeInt(raw.hqLevel) ? raw.hqLevel : 0, // hqLevel is always a whole level in normal play
    craftFacility: (isNonNegativeInt(raw.craftFacility) && raw.craftFacility >= 1) ? raw.craftFacility : 1, // Task 16: additive field, missing/invalid → default 1 (preserves current craft times)
    autoLineLogged: typeof raw.autoLineLogged === 'boolean' ? raw.autoLineLogged : false, // Task 6: additive field, no saveVersion bump needed
    world, // Task 27: additive field; missing (legacy save) -> fresh world state
    village: sanitizeVillageState(raw.village), // Task 113: additive field; missing -> ruined village, no relics
  };
}
// Task 72: per-company delivery progress. Lives in `permanent` because
// deliveries no longer reset with a run (Blueprint 15.1).
//   score       delivery score (regular trade starts at company.regularScore)
//   orderIndex  how many of the company's fixed orders were completed
//   open        open orders (Task 83: fixed or repeat, see delivery.js), orderTimer: seconds
//               since the company had room, repeatDone / lastRepeat: repeat order history
//   sent        units delivered per product (scoring decay for repeats)
//   tradeTimer  seconds since the last regular-trade purchase (Task 73)
function freshCompaniesState(){
  const out = {};
  COMPANIES.forEach(c => {
    const sent = {};
    RECIPES.forEach(r => { sent[r.key] = 0; });
    // Task 83: the first fixed order is open from the start.
    out[c.key] = { score: 0, orderIndex: 0, sent, tradeTimer: 0, open: [{ product: c.orders[0].product, qty: c.orders[0].qty, index: 0 }], orderTimer: 0, repeatDone: 0, lastRepeat: null };
  });
  return out;
}
// Task 83: open orders. A save from before Task 83 has none: it gets the
// fixed order it was on. A fixed entry must be the company's next fixed order
// (its product and quantity come from the company, not the save); a repeat
// entry needs a real product, a quantity within the cap, and a company that has
// paid at least one fixed order. That last rule is exactly when issueOrder
// (Task 88) opens a repeat order, so a repeat order may sit next to a fixed
// one (Task 94: it used to be accepted only after every fixed order was paid,
// which dropped a normally issued repeat order on load).
function sanitizeOpenOrders(raw, def, orderIndex){
  const fixedNow = () => def.orders[orderIndex] ? [{ product: def.orders[orderIndex].product, qty: def.orders[orderIndex].qty, index: orderIndex }] : [];
  if(!Array.isArray(raw)) return fixedNow();
  const out = [];
  raw.forEach(o => {
    if(!isPlainObject(o) || out.length >= 2) return;
    if(Number.isInteger(o.index) && o.index >= 0){
      const fixed = fixedNow()[0];
      if(fixed && o.index === orderIndex && !out.some(x => x.index >= 0)) out.push(fixed);
    } else if(typeof o.product === 'string' && RECIPES.some(r => r.key === o.product) &&
              Number.isInteger(o.qty) && o.qty >= 1 && o.qty <= BALANCE.orders.REPEAT_MAX_QTY && orderIndex >= 1){
      out.push({ product: o.product, qty: o.qty, index: -1 });
    }
  });
  return out;
}

function sanitizeCompaniesState(raw){
  const out = freshCompaniesState();
  if(!isPlainObject(raw)) return out;
  COMPANIES.forEach(c => {
    const r = raw[c.key];
    if(!isPlainObject(r)) return;
    out[c.key].score = isNonNegativeFinite(r.score) ? r.score : 0;
    out[c.key].orderIndex = (Number.isInteger(r.orderIndex) && r.orderIndex >= 0) ? Math.min(r.orderIndex, c.orders.length) : 0;
    out[c.key].tradeTimer = isNonNegativeFinite(r.tradeTimer) ? Math.min(r.tradeTimer, BALANCE.delivery.TRADE_INTERVAL_SEC) : 0;
    out[c.key].sent = sanitizeNumberMap(r.sent, RECIPES.map(x => x.key), 0, isNonNegativeFinite);
    out[c.key].open = sanitizeOpenOrders(r.open, c, out[c.key].orderIndex);
    out[c.key].orderTimer = isNonNegativeFinite(r.orderTimer) ? r.orderTimer : 0;
    out[c.key].repeatDone = (Number.isInteger(r.repeatDone) && r.repeatDone >= 0) ? r.repeatDone : 0;
    out[c.key].lastRepeat = (typeof r.lastRepeat === 'string' && RECIPES.some(x => x.key === r.lastRepeat)) ? r.lastRepeat : null;
  });
  return out;
}
function sanitizePermanent(raw){
  const fresh = { totalPrestige:0, runCount:1, tickets:0, firstGachaGranted:false, companies: freshCompaniesState() };
  if(!isPlainObject(raw)) return fresh;
  const totalPrestige = isNonNegativeFinite(raw.totalPrestige) ? raw.totalPrestige : 0;
  return {
    totalPrestige,
    companies: sanitizeCompaniesState(raw.companies),
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

// Tells the player once that saving does not work; saveGame() returns its result.
function reportSaveFailed(){
  if(!saveFailLogged){ log('저장할 수 없음'); saveFailLogged = true; }
  setSaveStatus('저장 안 됨');
  return false;
}

function saveGame(){
  if(saveBlocked) return false; // a future-version save exists on disk — never overwrite it
  try{
    if(!storageAvailable()){
      return reportSaveFailed();
    }
    const payload = {
      saveVersion: CURRENT_SAVE_VERSION,
      savedAt: Date.now(),
      permanent: { totalPrestige: permanent.totalPrestige, runCount: permanent.runCount, tickets: permanent.tickets, firstGachaGranted: permanent.firstGachaGranted, companies: permanent.companies },
      run: state,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    saveFailLogged = false;
    setSaveStatus('저장됨');
    return true;
  }catch(e){
    return reportSaveFailed();
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

