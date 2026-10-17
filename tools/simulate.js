// Task 84: balance simulation. Runs the real game code (the same files the
// browser loads) in jsdom with a simple greedy "player" bot and prints when
// things happen: workers, sites, research, workshops, orders, reputation.
//
//   node tools/simulate.js [hours=10] [seed=1] [--quiet]
//
// The bot is deliberately plain: it always buys what it can afford in a fixed
// priority order and builds what open orders / research / upgrades are short
// of. It shows pacing and dead ends, not the best possible play.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const hours = Number(process.argv[2]) || 10;
const seed = Number(process.argv[3]) || 1;
const quiet = process.argv.includes('--quiet');
const root = path.join(__dirname, '..');
const MODULES = ['data.js', 'balance.js', 'terrain.js', 'worldgen.js', 'state.js', 'systems.js', 'factory.js', 'research.js', 'delivery.js', 'player.js', 'village.js', 'ui.js', 'main.js'];
const source = MODULES.map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const WORKER_CAP = Number(process.env.WORKER_CAP) || 1e9; // env WORKER_CAP: stop buying workers at this many
const OFF = (process.env.OFF || '').split(',');  // OFF=stats,hq,workforce,facility turns a growth lever off in the bot
const bot = `
;(function(){
  const OFF = ${JSON.stringify(OFF)};
  // seeded random so a run can be repeated
  let s = ${seed} >>> 0;
  Math.random = function(){ s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  clearInterval(tickTimer); clearInterval(ticketTimer); clearInterval(autoSaveTimer);
  const noop = () => {};
  ['updateNumbers','updatePlayerSprite','renderAll','buildLines','buildWorkers','renderLastPull','renderCurrencies','buildRecipes','renderDelivery','renderWorkshops','renderWorkshopBuild','buildMines','renderWorldObjects','renderResearch','saveGame'].forEach(n => { try { eval(n + ' = noop'); } catch(e){} });
  const events = [];
  let simT = 0;
  const income = { sold: 0 };
  log = function(msg){ events.push([simT, msg]); };
  gameNowMs = () => simT * 1000; // Task 93: the tunnel job follows the simulated clock
  const S = () => state;
  const fmtT = (t) => { const h = Math.floor(t/3600), m = Math.floor(t%3600/60); return h + 'h' + String(m).padStart(2,'0'); };

  // ---- what the player is short of -------------------------------------
  const prod = (k) => state.products[k] || 0;
  const stock = (k) => state.resources[k] !== undefined ? state.resources[k] : prod(k);
  function pendingGoals(){
    const goals = {}; // product -> qty wanted
    const want = (k, q) => { goals[k] = Math.max(goals[k] || 0, q); };
    // next research that is not done and whose prereqs are met
    RESEARCH.filter(d => researchStatus(d.key) === 'available').forEach(d => Object.keys(d.cost.products || {}).forEach(k => want(k, d.cost.products[k])));
    if(isResearchDone('tunnelWork') && tunnelWorkStatus() === 'none') Object.keys(tunnelWorkCost().products).forEach(k => want(k, tunnelWorkCost().products[k]));
    const site = nextExpansionSite();
    if(site) Object.keys(site.unlockProducts || {}).forEach(k => want(k, site.unlockProducts[k]));
    COMPANIES.forEach(c => { if(isCompanyOpen(c.key)) openOrders(c.key).forEach(o => want(o.product, o.qty)); });
    state.world.workshops.forEach(w => { const c = workshopUpgradeCost(w); if(c) Object.keys(c.products).forEach(k => want(k, c.products[k])); });
    if(isWorkshopBuildUnlocked() && state.world.workshops.length < maxWorkshops()){ const p = workshopBuildProducts(); Object.keys(p).forEach(k => want(k, p[k])); }
    return goals;
  }
  // what must be made (deepest ingredient first) so that 'qty' of key exists
  function shortfall(key, qty, out, depth){
    const r = recipeByKey(key); if(!r || depth > 6) return;
    const have = prod(key);
    if(have >= qty) return;
    const times = Math.ceil((qty - have) / r.out);
    Object.keys(r.need).forEach(k => { if(recipeByKey(k)) shortfall(k, r.need[k] * times, out, depth + 1); });
    out.push({ key, times });
  }
  function makeList(){
    const goals = pendingGoals(), out = [];
    Object.keys(goals).forEach(k => shortfall(k, goals[k], out, 0));
    const seen = {}; return out.filter(o => !seen[o.key] && (seen[o.key] = true));
  }
  const makeable = (r) => !recipeNeedsLockedResource(r);

  // ---- actions -----------------------------------------------------------
  let clicksOwed = 0;
  function act(){
    // free tickets and gold pulls (the bot buys workers whenever it can after the first purchases)
    while(permanent.tickets >= 1 && canPullWorker()){ permanent.tickets -= 1; pullAndAssign(); }
    // research in a fixed order
    ['autoCraftDevice','workshopBuild','deliveryContract','tunnelWork','workshopExpansion','tradeExpansion','explorationGear','geologicalSurvey','fastTrade'].forEach(k => { if(canResearch(k)) doResearch(k); });
    // sites
    if(canOrderTunnelWork() && state.gold >= tunnelWorkCost().gold * 1.2) orderTunnelWork(); // Task 93
    const site = nextExpansionSite();
    if(site && canUnlockSite(site) && state.gold >= site.unlockCost * 1.2) expandBase();
    // workshops
    if(canBuildWorkshop() && state.gold > workshopBuildCost() * 1.3) buildWorkshop();
    state.world.workshops.forEach(w => { if(canUpgradeWorkshop(w.id) && state.gold > workshopUpgradeCost(w).gold * 1.5) upgradeWorkshop(w.id); });
    // production plan
    const plan = makeList();
    const planKeys = plan.map(p => p.key);
    // non-workshop recipes: auto on for what the plan needs and basics
    RECIPES.forEach(r => {
      if(r.workshopOnly || !makeable(r)) return;
      const needed = planKeys.includes(r.key) || ['steel','coalBrick'].includes(r.key);
      if(isAutoCraftUnlocked()) state.autoCraft[r.key] = needed;
      else if(needed && state.craftQueue[r.key] === null && canCraft(r)) startCraft(r);
    });
    // workshops: take plan items that only workshops can make
    const wsItems = plan.filter(p => recipeByKey(p.key).workshopOnly && makeable(recipeByKey(p.key)));
    state.world.workshops.forEach(w => { if(w.recipeKey && !wsItems.some(p => p.key === w.recipeKey)) w.auto = false; }); // no target setting exists: the player has to switch it off
    state.world.workshops.forEach((w, i) => {
      if(w.progress !== null) return;
      const taken = state.world.workshops.filter((o, j) => j < i && o.recipeKey).map(o => o.recipeKey);
      const pick = wsItems.find(p => !taken.includes(p.key) || wsItems.length === 1) || wsItems[0];
      if(!pick){ w.auto = false; return; } // nothing short: stop making things nobody needs
      if(w.recipeKey !== pick.key) setWorkshopRecipe(w.id, pick.key);
      if(isAutoCraftUnlocked()) w.auto = true;
      else craftWorkshop(w.id);
    });
    // orders
    COMPANIES.forEach(c => { for(let i = 0; i < 2; i++) if(canCompleteOrder(c.key, 0)) completeOrder(c.key, 0); });
    // sell what the plan does not need, keep a reserve of basics for crafting
    RECIPES.forEach(r => {
      if(r.workshopOnly) return;
      const goalQty = (pendingGoals()[r.key] || 0);
      const keep = Math.max(goalQty + 12, ['steel','alloy','crystalLens','coalBrick'].includes(r.key) ? 60 : 12);
      if(prod(r.key) > keep){ const sell = prod(r.key) - keep; const earned = sell * r.sell * mult(); income.sold += earned; state.products[r.key] -= sell; state.gold += earned; checkFirstGachaMilestone(); }
    });
    // gold spending: gacha (workers) first, then facility upgrades with resources, then gold upgrades
    let guard = 0;
    while(state.gold >= BALANCE.gacha.PULL_COST_GOLD && permanent.firstGachaGranted && guard++ < 50 && workersWorthBuying()){ state.gold -= BALANCE.gacha.PULL_COST_GOLD; pullAndAssign(); }
    RESOURCES.filter(r => isUnlocked(r.key)).forEach(r => {
      if(!OFF.includes('facility') && state.resources[r.key] > facilityCost(r.key) * 1.5) upgradeFacility(r.key);
      if(!OFF.includes('workforce') && state.resources[r.key] > workforceCost(r.key) * 1.5) upgradeWorkforce(r.key);
    });
    if(state.gold > craftFacilityCost() * 4) upgradeCraftFacility();
    if(!OFF.includes('hq') && state.gold > hqCost() * 3) investHQ();
    if(!OFF.includes('stats')) state.characters.forEach(w => ['mining','carry','move'].forEach(st => { if(state.gold > workerUpgradeCost(w, st) * 6) upgradeWorkerStat(w.id, st); }));
    // exploration: the player walks to the nearest hidden mine now and then (discovery only; map mines add little)
    if(simT % 60 === 0 && Array.isArray(state.world.hiddenMineIds) && state.world.hiddenMineIds.length){
      const m = mineById(state.world.hiddenMineIds[0]); if(m){ state.world.player.x = m.x; state.world.player.y = m.y; tickExploration(); }
    }
  }
  const workerCount = () => state.characters.length;
  // a plain player stops buying workers when it has no use for more resources yet
  function workersWorthBuying(){ return canPullWorker() && workerCount() < ${WORKER_CAP}; }
  function pullAndAssign(){
    pullGacha();
    const w = state.characters[state.characters.length - 1];
    const open = RESOURCES.filter(r => isUnlocked(r.key));
    // assign to the resource with the lowest income relative to its share of use
    const share = { iron: 3, coal: 2, mana: 1.5, crystal: 1.5, rareMetal: 1, relic: 1, cosmicShard: 0.5, plasma: 0.5 };
    open.sort((a, b) => autoRate(a.key) / share[a.key] - autoRate(b.key) / share[b.key]);
    w.resource = open[0].key;
  }
  // manual clicks: active at first, idle later
  function clicks(){
    const perSec = simT < 1200 ? 1.5 : 0.3;
    clicksOwed += perSec;
    while(clicksOwed >= 1){
      clicksOwed -= 1;
      const open = RESOURCES.filter(r => isUnlocked(r.key));
      open.sort((a, b) => stock(a.key) / 3 - stock(b.key) / 3);
      mineResource(open[0].key);
    }
  }
  window.__income = () => {
    // amounts are logged like "... → +1,234G" / "... 완수했습니다. +1,234G"
    const sum = (marker) => events.reduce((acc, e) => {
      if(e[1].indexOf(marker) < 0) return acc;
      const i = e[1].lastIndexOf('+'), j = e[1].lastIndexOf('G');
      return acc + (i >= 0 && j > i ? Number(e[1].slice(i + 1, j).split(',').join('')) : 0);
    }, 0);
    return { botSales: Math.floor(income.sold), regularTrade: sum('정기 거래:'), repeatOrders: sum('추가 수주를') };
  };
  window.__dump = () => ({ workshops: state.world.workshops.map(w => [w.recipeKey, w.auto, w.level]), plan: makeList().map(p => p.key + 'x' + p.times), goals: pendingGoals(), research: Object.keys(state.research).filter(k => state.research[k]) });
  const marks = {};
  const mark = (k) => { if(!(k in marks)) marks[k] = simT; };
  function checkMarks(){
    [5, 12, 18, 24, 30, 36].forEach(n => { if(permanent.totalPrestige >= n) mark('rep' + n); });
    RESEARCH.forEach(d => { if(state.research[d.key]) mark('R:' + d.key); });
    SITES.forEach(x => { if(state.unlockedSites[x.key]) mark('S:' + x.key); });
    if(state.world.workshops.length >= 6) mark('ws6');
    if(state.world.workshops.length >= 8) mark('ws8');
    if(state.world.workshops.some(w => w.level >= 8)) mark('wsLv8');
    if(state.gold >= 1e5) mark('gold1e5'); if(state.gold >= 1e6) mark('gold1e6');
    COMPANIES.forEach(c => { if(isRegularTrade(c.key)) mark('trade:' + c.key); if(permanent.companies[c.key].orderIndex >= c.orders.length) mark('fixedDone:' + c.key); });
  }
  const timeline = [];
  window.__marks = () => marks;
  window.__run = function(hoursToRun){
    const total = Math.floor(hoursToRun * 3600);
    for(simT = 0; simT < total; simT++){
      clicks();
      if(simT % 2 === 0) act();
      if(simT % 10 === 0) checkMarks();
      for(let i = 0; i < TICKS_PER_SECOND; i++) tickLoop();
      if(simT % 45 === 0) ticketTrickle();
      if(simT % 1800 === 0){
        const rates = RESOURCES.filter(r => isUnlocked(r.key)).map(r => r.key + ' ' + autoRate(r.key).toFixed(1)).join(', ');
        timeline.push({ t: fmtT(simT), gold: Math.floor(state.gold), workers: workerCount(), rep: permanent.totalPrestige, mult: mult().toFixed(2), workshops: state.world.workshops.length, research: Object.keys(state.research).filter(k => state.research[k]).length, sites: SITES.filter(x => state.unlockedSites[x.key]).length, rates });
      }
    }
    return { events, timeline, end: { gold: Math.floor(state.gold), workers: workerCount(), rep: permanent.totalPrestige, products: state.products, orders: Object.fromEntries(COMPANIES.map(c => [c.key, permanent.companies[c.key].orderIndex + '/' + c.orders.length + ' +' + permanent.companies[c.key].repeatDone + 'rep'])), mines: state.world.mines.length } };
  };
})();
`;

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
const win = dom.window;
const storage = (() => { let st = {}; return { getItem: k => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; }, clear: () => { st = {}; } }; })();
Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
win.confirm = () => true; win.alert = () => {};
win.eval(source + bot);
const t0 = Date.now();
const res = win.__run(hours);
if(!quiet){
  console.log('--- timeline (every 30 min) ---');
  res.timeline.forEach(r => console.log(JSON.stringify(r)));
  console.log('--- milestones ---');
  const want = /연구 완료|채굴장 탐사|거점 확장|제작소를 지었습니다|수주를 완수|추가 수주|정기 거래를 시작|명성 효과|새 회사|제작소 업그레이드|터널이 열렸|새 광맥 발견/;
  res.events.filter(e => want.test(e[1])).forEach(e => { const t = e[0]; console.log((Math.floor(t/3600) + 'h' + String(Math.floor(t%3600/60)).padStart(2,'0') + 'm') + '  ' + e[1]); });
}
console.log('--- end ---');
console.log(JSON.stringify(res.end));
if(process.argv.includes('--marks') || !quiet){ const m = win.__marks(); console.log('marks: ' + Object.keys(m).map(k => k + '=' + (m[k]/60).toFixed(0) + 'm').join(' ')); }
console.log('income by source: ' + JSON.stringify(win.__income()));
if(process.argv.includes('--debug')) console.log(JSON.stringify(win.__dump()));
console.log('wall ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
dom.window.close();
