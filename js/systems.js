function mult(){ return (1 + permanent.totalPrestige * BALANCE.prestige.MULTIPLIER_PER_POINT) * hqMult(); }
function hqMult(){ return 1 + state.hqLevel * BALANCE.hq.MULTIPLIER_PER_LEVEL; }
function hqCost(){ return expCost(BALANCE.hq.COST_BASE, BALANCE.hq.COST_GROWTH, state.hqLevel); }

function craftSpeed(){
  return 1 + Math.max(0, state.craftFacility - 1) * BALANCE.crafting.FACILITY_SPEED_PER_LEVEL;
}
function craftFacilityCost(){
  return expCost(BALANCE.crafting.FACILITY_COST_BASE, BALANCE.crafting.FACILITY_COST_GROWTH, Math.max(0, state.craftFacility - 1));
}

function isUnlocked(resKey){
  const r = RESOURCES.find(x=>x.key===resKey);
  return state.unlockedSites[r.site];
}

function workerEffective(worker){
  return worker.mining * worker.carry * worker.move / BALANCE.worker.EFFECTIVE_DIVISOR;
}
function workerUpgradeCost(worker, stat){
  return expCost(BALANCE.worker.STAT_COST_BASE[stat], BALANCE.worker.STAT_COST_GROWTH, worker[stat+'Lvl']);
}

function autoRate(resKey){
  const charBonus = state.characters.filter(c=>c.resource===resKey).reduce((s,c)=>s+workerEffective(c),0);
  const workforceBonus = state.workforce[resKey] * BALANCE.mining.WORKFORCE_BONUS_MULTIPLIER;
  return (charBonus + workforceBonus) * mult();
}

function manualAmount(resKey){
  const base = RESOURCES.find(r=>r.key===resKey).base;
  return (base + state.facility[resKey]) * mult();
}

function facilityCost(resKey){
  return expCost(BALANCE.mining.FACILITY_COST_BASE, BALANCE.mining.FACILITY_COST_GROWTH, state.facility[resKey]);
}

function workforceCost(resKey){
  return expCost(BALANCE.mining.WORKFORCE_COST_BASE, BALANCE.mining.WORKFORCE_COST_GROWTH, state.workforce[resKey]);
}

function log(msg){
  const el = document.getElementById('log');
  const line = document.createElement('div');
  line.textContent = msg;
  el.prepend(line);
  while(el.children.length > 40) el.removeChild(el.lastChild);
}

function fmt(n){
  if(n <= 0) return '0';
  if(n < 10 && n % 1 !== 0) return n.toFixed(1);
  return Math.floor(n).toLocaleString();
}

// Shared helpers to avoid repeating the same formula/lookup everywhere.
function resName(key){ return RESOURCES.find(r=>r.key===key).name; }
function expCost(base, growth, level){ return Math.round(base * Math.pow(growth, level)); }
function dis(condition){ return condition ? 'disabled' : ''; }
// Task 6: which existing recipes become reachable because of a site's
// resources — derived entirely from RECIPES/RESOURCES, no new data.
function siteRelatedRecipeNames(site){
  const siteResourceKeys = RESOURCES.filter(r=>r.site===site.key).map(r=>r.key);
  return RECIPES.filter(r=>Object.keys(r.need).some(k=>siteResourceKeys.includes(k))).map(r=>r.name);
}
// Stable worker identifier — timestamp+random string, no counter to persist,
// no crypto.randomUUID() dependency (this file may be opened directly as a
// local file, where secure-context APIs aren't guaranteed). `existingIds`
// (a Set) is checked and regenerated on collision, so callers are always
// guaranteed a fresh, unique id.
function makeWorkerId(existingIds){
  let id;
  do{
    id = 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  } while(existingIds instanceof Set && existingIds.has(id));
  return id;
}
function prestigeGain(){
  if(state.characters.length < BALANCE.worker.MIN_REQUIRED) return 0;
  return Math.floor(Math.sqrt(state.runGold/BALANCE.prestige.GOLD_DIVISOR));
}

// Task 6: the very first moment both iron AND coal have at least one worker
// assigned (the point at which steel can be produced with zero manual
// clicking) is a real, code-verifiable milestone worth calling out once.
// Not tied to characters.length alone — two workers on the SAME resource
// don't count, only one on each side does.
function hasWorkerOn(resKey){
  return state.characters.some(c=>c.resource===resKey);
}
function checkDualAutomation(){
  if(state.autoLineLogged) return;
  if(hasWorkerOn('iron') && hasWorkerOn('coal')){
    state.autoLineLogged = true;
    log('🏭 철광석/석탄 자동화 완료! 이제 강철 생산을 자동화할 수 있습니다.');
  }
}

// ---------------------------------------------------------------------------
// Mining-tab player actions. Each does exactly one state change (plus its
// log line, where the original click handler had one) and returns whether
// it succeeded, so its caller (the click handler) can decide whether a UI
// rebuild is needed. Extracted out of buildLines()'s inline onclick
// callbacks so the state-change logic itself can be read/tested apart from
// the DOM-building code around it. Behavior and log text are unchanged.
// ---------------------------------------------------------------------------
function unlockSite(key){
  const site = SITES.find(s=>s.key===key);
  if(state.gold < site.unlockCost) return false;
  state.gold -= site.unlockCost;
  state.unlockedSites[key] = true;
  log(`채굴장 탐사: ${site.name}`);
  return true;
}

function mineResource(key){
  state.resources[key] += manualAmount(key);
  return true;
}

function upgradeFacility(key){
  const cost = facilityCost(key);
  if(state.resources[key] < cost) return false;
  state.resources[key] -= cost;
  state.facility[key] += BALANCE.mining.FACILITY_BONUS_PER_LEVEL;
  log(`채굴 도구 강화: ${resName(key)} 라인 Lv.${state.facility[key]} (${resName(key)} ${cost}개 소모)`);
  return true;
}

function upgradeWorkforce(key){
  const cost = workforceCost(key);
  if(state.resources[key] < cost) return false;
  state.resources[key] -= cost;
  state.workforce[key] += BALANCE.mining.WORKFORCE_BONUS_PER_LEVEL;
  log(`인력 강화: ${resName(key)} 라인 Lv.${state.workforce[key]} (${resName(key)} ${cost}개 소모)`);
  return true;
}

function upgradeCraftFacility(){
  const cost = craftFacilityCost();
  if(state.gold < cost) return false;
  state.gold -= cost;
  state.craftFacility += 1;
  log(`제작 시설 강화: Lv.${state.craftFacility}`);
  return true;
}

// ---------------------------------------------------------------------------
// Task 20 (structure-only, Recipe/Production boundary): the two helpers
// below pull the generic "does recipe.need fit in some stock?" / "subtract
// recipe.need from some stock" operations out of canCraft()/startCraft(),
// as plain functions of a stock accessor rather than of the global `state`
// object directly. canCraft()/startCraft() keep their exact names and
// behavior (existing callers/tests are unaffected) and simply close over
// state.resources/state.products as before. A future Factory Production
// Node needs this same check/consume shape against its own local
// input buffers, not the global state — it can call recipeInputsAvailable()/
// consumeRecipeInputs() directly with its own getStock/setStock instead of
// re-deriving this logic. No crafting behavior, cost, or output changes.
// ---------------------------------------------------------------------------
function recipeInputsAvailable(recipe, getStock){
  return Object.entries(recipe.need).every(([k,v]) => getStock(k) >= v);
}
function consumeRecipeInputs(recipe, getStock, setStock){
  Object.entries(recipe.need).forEach(([k,v]) => setStock(k, getStock(k) - v));
}

function canCraft(recipe){
  return recipeInputsAvailable(recipe, k => state.resources[k] ?? state.products[k] ?? 0);
}
function startCraft(recipe){
  if(state.craftQueue[recipe.key] !== null) return false; // already crafting
  if(!canCraft(recipe)) return false;
  consumeRecipeInputs(
    recipe,
    k => state.resources[k] !== undefined ? state.resources[k] : state.products[k],
    (k, val) => { if(state.resources[k] !== undefined) state.resources[k] = val; else state.products[k] = val; }
  );
  if(recipe.craftTime > 0){
    state.craftQueue[recipe.key] = recipe.craftTime;
  } else {
    state.products[recipe.key] += recipe.out;
  }
  return true;
}
function autoSellCost(recipe){ return recipe.sell * BALANCE.selling.AUTO_SELL_COST_MULTIPLIER; }

// The first-gacha-ticket milestone (Task "early gacha ticket" redesign) is
// its own concern, separate from selling itself — it just happens to be
// checked right after a sale, since selling is currently the only way gold
// increases. Kept as its own function (mirrors checkDualAutomation()'s
// pattern) so a future gold-earning path doesn't have to duplicate this
// check inside sellAll(). Condition and behavior are unchanged from before.
function checkFirstGachaMilestone(){
  if(permanent.firstGachaGranted) return;
  if(state.gold < BALANCE.gacha.FIRST_TICKET_GOLD_THRESHOLD) return;
  permanent.firstGachaGranted = true;
  permanent.tickets += 1;
  log('🎟️ 첫 가챠권 획득! 이제 인부를 뽑을 수 있습니다.');
}

function sellAll(recipe, silent){
  const qty = state.products[recipe.key];
  if(qty<=0) return;
  const earned = qty * recipe.sell * mult();
  state.gold += earned;
  state.runGold += earned;
  state.products[recipe.key] = 0;
  if(!silent) log(`${recipe.name} ${fmt(qty)}개 판매 → +${fmt(earned)}G`);
  checkFirstGachaMilestone();
}

// Recipe-tab player action, extracted for the same reason as the mining
// actions above — its state change (purchase + flags) can be read apart
// from the DOM-building/rebuild code in buildRecipes(). Unchanged behavior.
function buyAutoSell(key){
  const recipe = RECIPES.find(r=>r.key===key);
  const cost = autoSellCost(recipe);
  if(state.gold < cost) return false;
  state.gold -= cost;
  state.autoSell[key] = true;
  state.autoSellOn[key] = true;
  log(`자동 판매 구매: ${recipe.name}`);
  return true;
}

// Worker-tab player actions, extracted for the same reason as the mining/
// recipe actions above. Unchanged behavior — same lookups, same log text,
// same checkDualAutomation() call at the same point.
function reassignWorker(workerId, newResource){
  const worker = state.characters.find(w=>w.id===workerId);
  if(!worker) return false;
  const idx = state.characters.indexOf(worker);
  const oldRes = worker.resource;
  worker.resource = newResource;
  checkDualAutomation();
  log(`일꾼 이동: #${idx+1} ${resName(oldRes)} → ${resName(newResource)}`);
  return true;
}

function upgradeWorkerStat(workerId, stat){
  const worker = state.characters.find(w=>w.id===workerId);
  if(!worker) return false;
  const idx = state.characters.indexOf(worker);
  const cost = workerUpgradeCost(worker, stat);
  if(state.gold < cost) return false;
  state.gold -= cost;
  worker[stat] += BALANCE.worker.STAT_INCREMENT_PER_UPGRADE;
  worker[stat+'Lvl']++;
  log(`일꾼 강화: #${idx+1} ${STAT_LABEL[stat]} 상승 (Lv.${worker[stat+'Lvl']})`);
  return true;
}

function pullGacha(){
  const wasEmpty = state.characters.length === 0;
  const roll = Math.random()*100;
  let acc = 0, picked = RARITY[0];
  for(const r of RARITY){ acc += r.chance; if(roll <= acc){ picked = r; break; } }
  const unlockedResources = RESOURCES.filter(r=>isUnlocked(r.key));
  const resource = unlockedResources[Math.floor(Math.random()*unlockedResources.length)];
  const char = {
    id: makeWorkerId(new Set(state.characters.map(c=>c.id))),
    rarity:picked.key, resource:resource.key,
    mining:picked.mining, carry:picked.carry, move:picked.move,
    miningLvl:0, carryLvl:0, moveLvl:0,
  };
  state.characters.push(char);
  state.lastPull = char;
  checkDualAutomation();
  buildLines(); // rate text changed
  buildWorkers();
  renderLastPull();
  renderCurrencies();
  if(wasEmpty) buildRecipes(); // auto-craft just unlocked, checkbox needs enabling
  updateNumbers();
}

// ---------------------------------------------------------------------------
// Task 20 (structure-only, Tick boundary): tickLoop()'s single mixed pass is
// split into the per-system sections that actually exist today — mining
// (auto-rate resource income) and crafting (craft-queue progress + autoCraft
// restart), plus auto-sell as its own pass. This is a straight extraction:
// each per-recipe operation still runs in the same relative order for that
// recipe (craft-progress/completion before that recipe's auto-sell), and
// splitting the single RECIPES.forEach into two separate forEach passes
// (crafting, then auto-sell) cannot change the result, since every operation
// here only ever reads/writes state keyed by that same recipe — nothing
// about one recipe's tick depends on another recipe's tick within the same
// pass. No new "Worker"/"Automation"/"Factory" sections are introduced:
// worker output already flows through tickMining() via autoRate(), and
// there is no standalone automation system beyond autoCraft/autoSell, both
// already covered below. A future tickFactory() would be added as one more
// named call in tickLoop(), in the same place a factory tick belongs —
// nothing here reserves space for it yet.
// ---------------------------------------------------------------------------
function tickMining(){
  RESOURCES.forEach(r=>{
    const rate = autoRate(r.key);
    if(rate>0) state.resources[r.key] += rate / TICKS_PER_SECOND;
  });
}

function tickCrafting(){
  RECIPES.forEach(r=>{
    if(state.craftQueue[r.key] !== null){
      state.craftQueue[r.key] -= craftSpeed() / TICKS_PER_SECOND;
      if(state.craftQueue[r.key] <= 0){
        state.craftQueue[r.key] = null;
        state.products[r.key] += r.out;
      }
    } else if(state.autoCraft[r.key]){
      startCraft(r);
    }
  });
}

function tickAutoSell(){
  RECIPES.forEach(r=>{
    if(state.autoSell[r.key] && state.autoSellOn[r.key]) sellAll(r, true);
  });
}

function tickLoop(){
  tickMining();
  tickCrafting();
  tickAutoSell();
  updateNumbers();
}

// passive ticket trickle — only once the first (50G-earned) ticket has been
// granted, so this can't bypass the early progression gate by just idling
function ticketTrickle(){
  if(!permanent.firstGachaGranted) return;
  permanent.tickets += 1;
  log('가챠권 +1 (자동 지급)');
  renderCurrencies();
}

// Task 20 (structure-only, UI/logic note): every state change already runs
