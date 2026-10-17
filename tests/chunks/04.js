// =============================================================================
// Task 103: safety net for the top-down transition (docs/TOPDOWN_TRANSITION.md).
// The renderer is going to be replaced; none of the game state, the save format
// (saveVersion 1) or the rules may change with it. These checks pin that down:
// a fixed mid-game save, the game running without the 2.5D stage, player
// position and collision invariants, the core loop numbers, mine states, the
// tunnel, and a save that holds no renderer/UI state.
// =============================================================================

const T103_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'save_v1_midgame.json');
const T103_FIXTURE_RAW = fs.readFileSync(T103_FIXTURE_PATH, 'utf8');
const T103_FIXTURE = JSON.parse(T103_FIXTURE_RAW);

// Key structure of a value, all levels ("number", "string", ..., arrays by their first entry).
function t103Shape(v) {
  if (Array.isArray(v)) return v.length ? ['array', t103Shape(v[0])] : ['array'];
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = t103Shape(v[k]); }); return o; }
  return v === null ? 'null' : typeof v;
}
// The fields added to the save since the fixture was made (all additive,
// saveVersion 1): Task 112 the world's torches ([] for a save without any) and
// Task 113 the village (a ruined village with no relics for a save without one).
function t103VillageNow() { return { sites: { appraiser: null, museum: null }, stage: { appraiser: 0, museum: 0 }, unidentified: 0, digProgress: 0, appraised: 0, owned: {}, codex: [], donated: [] }; }
function t103RunNow(run) { const r = JSON.parse(JSON.stringify(run)); r.world.torches = []; r.village = t103VillageNow(); return r; }
function t103ShapeNow() { const f = JSON.parse(JSON.stringify(T103_FIXTURE)); f.run = t103RunNow(f.run); return t103Shape(f); }
// JSON with object keys sorted, so two values compare by content, not key order
// (loading rebuilds objects field by field, e.g. a worker's id moves to the end).
function t103Canon(v) {
  if (Array.isArray(v)) return '[' + v.map(t103Canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + t103Canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function t103Storage(raw) {
  const storage = makeMemoryStorage();
  if (raw !== undefined) storage.setItem('gachaFactorySave', raw);
  return storage;
}
// A page without the 2.5D world stage (the part the top-down renderer replaces).
function t103DomWithoutStage(storage) {
  const page = html.replace(/<div id="worldStage"[\s\S]*?<\/div>\s*(<p class="rate")/, '$1');
  const dom = new JSDOM(page, { runScripts: 'outside-only', url: 'https://example.test/' });
  const win = dom.window;
  Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  win.eval(moduleSource + ';window.__t103 = { state: () => state, permanent: () => permanent };');
  Object.defineProperties(win, {
    state: { get: () => win.__t103.state(), configurable: true },
    permanent: { get: () => win.__t103.permanent(), configurable: true },
  });
  allDoms.push(dom);
  return win;
}
// Small fixed random source for repeatable walks.
function t103Random(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// -----------------------------------------------------------------------------
// 1. The fixed saveVersion 1 save (made with main a3c5136 through the game's
//    own functions) loads with every value and saves back unchanged.
// -----------------------------------------------------------------------------
(function test_T103_fixtureLoadsUnchanged() {
  const r = T103_FIXTURE.run, p = T103_FIXTURE.permanent;
  check('Task103: fixture — the file is a saveVersion 1 mid-game save',
    T103_FIXTURE.saveVersion === 1 && r.characters.length === 5 && r.world.workshops.length === 2 && r.world.tunnelUnlocked === true &&
    p.companies.forge.open.length === 2 && p.totalPrestige === 18);
  const storage = t103Storage(T103_FIXTURE_RAW);
  const win = newDom(storage).window;
  const s = win.state, q = win.permanent;
  check('Task103: fixture — gold, resources and products load exactly', s.gold === r.gold &&
    t103Canon(s.resources) === t103Canon(r.resources) && t103Canon(s.products) === t103Canon(r.products));
  check('Task103: fixture — the five workers keep ids, stats, levels and resource', t103Canon(s.characters) === t103Canon(r.characters));
  check('Task103: fixture — facility, workforce, HQ and craft facility levels', t103Canon(s.facility) === t103Canon(r.facility) &&
    t103Canon(s.workforce) === t103Canon(r.workforce) && s.hqLevel === r.hqLevel && s.craftFacility === r.craftFacility && s.hqLevel === 1);
  check('Task103: fixture — research, sites, auto-craft, stock target, auto-sell', t103Canon(s.research) === t103Canon(r.research) &&
    t103Canon(s.unlockedSites) === t103Canon(r.unlockedSites) && s.autoCraft.steel === true && s.craftTarget.steel === 40 &&
    s.autoSell.coalBrick === true && s.autoSellOn.coalBrick === false);
  check('Task103: fixture — both workshops keep recipe, level, auto and the craft in progress',
    t103Canon(s.world.workshops) === t103Canon(r.world.workshops) && s.world.workshops.some((w) => w.progress > 0));
  check('Task103: fixture — base, all 26 mines (positions, grades, states) and the undiscovered list',
    t103Canon(s.world.base) === t103Canon(r.world.base) && t103Canon(s.world.mines) === t103Canon(r.world.mines) &&
    s.world.mines.length === 26 && t103Canon(s.world.hiddenMineIds) === t103Canon(r.world.hiddenMineIds));
  check('Task103: fixture — the open tunnel and the player standing beyond the mountain',
    s.world.tunnelUnlocked === true && s.world.tunnelContract === null && s.world.player.x === r.world.player.x && s.world.player.y === r.world.player.y &&
    s.world.player.facing === 'left' && win.terrainRegionAt(s.world.player.x, s.world.player.y) === 'beyond');
  check('Task103: fixture — reputation, tickets and every company (a fixed and a repeat order open together)',
    q.totalPrestige === 18 && q.tickets === p.tickets && t103Canon(q.companies) === t103Canon(p.companies) &&
    q.companies.forge.open.map((o) => o.index).join() === '1,-1');
  // load -> save gives the same file (savedAt aside)
  win.saveGame();
  const again = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task103: fixture — load then save writes the same run and permanent data (plus the empty torch list and ruined village, Task 112/113)', again.saveVersion === 1 &&
    t103Canon(again.run) === t103Canon(t103RunNow(r)) && t103Canon(again.permanent) === t103Canon(p));
  check('Task103: fixture — the save structure is unchanged at every level (plus the empty torch list, Task 112)', t103Canon(t103Shape(again)) === t103Canon(t103ShapeNow()));
  // the game goes on from it
  const iron0 = s.resources.iron, gold0 = s.gold;
  for (let i = 0; i < 60; i++) win.tickLoop();
  check('Task103: fixture — the loaded game keeps running (income flows, the workshop finishes its craft)',
    s.resources.iron > iron0 && s.gold >= gold0 && s.world.workshops.every((w) => w.progress === null || w.progress < r.world.workshops.find((x) => x.id === w.id).progress));
})();

// -----------------------------------------------------------------------------
// 2. The game runs without the 2.5D world stage: the top-down renderer will
//    replace it, so no rule may depend on it.
// -----------------------------------------------------------------------------
(function test_T103_logicWithoutTheStage() {
  const storage = t103Storage();
  const win = t103DomWithoutStage(storage);
  const doc = win.document;
  const s = win.state;
  check('Task103: no stage — setup: the page has no world stage and the game booted', !doc.getElementById('worldStage') && !!s && !!s.world.player);
  const iron = s.world.mines.find((m) => m.id === 'mine_start_iron');
  check('Task103: no stage — securing and mining a world mine work', win.secureMine(iron.id) === true && win.mineMine(iron.id) === true && s.resources.iron > 0);
  const r0 = s.resources.iron;
  for (let i = 0; i < 20; i++) win.tickLoop();
  check('Task103: no stage — the tick runs and the secured mine pays', s.resources.iron > r0);
  const x0 = s.world.player.x;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'd', bubbles: true }));
  for (let i = 0; i < 5; i++) win.tickLoop();
  doc.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'd', bubbles: true }));
  win.tickLoop();
  check('Task103: no stage — keyboard movement works and stops', s.world.player.x > x0 && s.world.player.pose === 'idle');
  // discovery through walking
  const hidden = s.world.mines.find((m) => s.world.hiddenMineIds.includes(m.id));
  if (hidden) { s.world.player.x = hidden.x; s.world.player.y = hidden.y; }
  win.tickLoop();
  check('Task103: no stage — walking up to a hidden mine discovers it', !!hidden && !s.world.hiddenMineIds.includes(hidden.id));
  // crafting, research, tunnel, save
  s.resources.iron = 10; s.resources.coal = 10;
  win.startCraft(win.recipeByKey('steel'));
  s.gold = 9000; s.products.alloy = 5;
  const tunnel = win.doResearch('tunnelWork') && win.orderTunnelWork(1000) && win.tickTunnelWork(1000 + 600000);
  check('Task103: no stage — crafting, research and the tunnel job work', s.products.steel === 1 && tunnel === true && s.world.tunnelUnlocked === true);
  let renders = true;
  try { win.renderAll(); win.updateNumbers(); win.renderWorldObjects(); win.updatePlayerSprite(); } catch (e) { renders = false; }
  check('Task103: no stage — the remaining UI renders without errors', renders);
  check('Task103: no stage — saving works and the save loads in a normal page', win.saveGame() === true &&
    newDom(storage).window.state.world.tunnelUnlocked === true);
  // the fixture also loads into a page without the stage
  const w2 = t103DomWithoutStage(t103Storage(T103_FIXTURE_RAW));
  check('Task103: no stage — the fixture save loads the same', w2.state.gold === T103_FIXTURE.run.gold && w2.state.world.mines.length === 26 && w2.permanent.totalPrestige === 18);
})();

// -----------------------------------------------------------------------------
// 3. Player position and collision invariants (the top-down camera and
//    collision must keep them).
// -----------------------------------------------------------------------------
(function test_T103_playerInvariants() {
  const win = newDom(t103Storage()).window;
  const s = win.state, p = s.world.player, b = win.BALANCE.world;
  const hold = (dirs) => { ['up', 'down', 'left', 'right'].forEach((d) => win.setPlayerHeld(d, dirs.includes(d))); };
  const step = b.PLAYER_SPEED / win.TICKS_PER_SECOND;
  check('Task103: player — a new game starts on the base, idle, facing down', p.x === s.world.base.x && p.y === s.world.base.y && p.pose === 'idle' && p.facing === 'down');
  hold(['right']); win.tickPlayer();
  check('Task103: player — one tick moves PLAYER_SPEED / TICKS_PER_SECOND (3 / 10)', Math.abs(p.x - (s.world.base.x + step)) < 1e-12 && step === 0.3 && p.facing === 'right' && p.pose === 'walk');
  const x1 = p.x, y1 = p.y;
  hold(['right', 'down']); win.tickPlayer();
  check('Task103: player — diagonal movement has the same speed', Math.abs(Math.hypot(p.x - x1, p.y - y1) - step) < 1e-12);
  hold([]); win.tickPlayer();
  check('Task103: player — no key, no movement, idle pose', p.pose === 'idle' && Math.hypot(p.x - x1, p.y - y1) > 0);
  // a long random walk with the tunnel closed never leaves walkable ground
  const rnd = t103Random(103);
  const dirsets = [['up'], ['down'], ['left'], ['right'], ['up', 'left'], ['up', 'right'], ['down', 'left'], ['down', 'right']];
  let bad = 0, regions = new Set(), minX = Infinity;
  for (let i = 0; i < 4000; i++) {
    if (i % 12 === 0) hold(rnd() < 0.35 ? ['left'] : dirsets[Math.floor(rnd() * dirsets.length)]);
    win.tickPlayer();
    if (!win.isWorldPointWalkable(p.x, p.y) || !win.terrainInBounds(p.x, p.y)) bad++;
    regions.add(win.terrainRegionAt(p.x, p.y));
    minX = Math.min(minX, p.x);
  }
  hold([]);
  check('Task103: player — 4000 random steps with the tunnel closed stay on walkable ground', bad === 0);
  check('Task103: player — the closed mountain is never crossed (no mountain, no land beyond)', !regions.has('mountain') && !regions.has('beyond') && regions.has('open'));
  check('Task103: player — the walk did reach the mountain face (the test pushed against it)', minX < win.terrainRockFaceX(0) + 1);
  // pushing straight into the face stops flush against it and slides along it
  p.x = 0; p.y = -5; hold(['left']);
  for (let i = 0; i < 40; i++) win.tickPlayer();
  const flushX = p.x;
  check('Task103: player — walking into the face stops flush against the rock', Math.abs(flushX - (win.terrainFaceX(-5) + win.WORLD_TERRAIN.PLAYER_MARGIN)) < 1e-3);
  hold(['left', 'down']); win.tickPlayer();
  check('Task103: player — pushing diagonally along the face slides along it', p.y > -5 && Math.abs(p.x - flushX) < 1e-3);
  hold([]);
  // with the tunnel open the land beyond can be reached, the range itself still cannot
  s.world.tunnelUnlocked = true;
  const t = win.terrainTunnel();
  p.x = t.mouthX + 1; p.y = t.y; hold(['left']);
  for (let i = 0; i < 80; i++) win.tickPlayer();
  check('Task103: player — with the tunnel open the player walks through to the land beyond', win.terrainRegionAt(p.x, p.y) === 'beyond');
  bad = 0; regions = new Set();
  for (let i = 0; i < 3000; i++) {
    if (i % 12 === 0) hold(dirsets[Math.floor(rnd() * dirsets.length)]);
    win.tickPlayer();
    if (!win.isWorldPointWalkable(p.x, p.y)) bad++;
    regions.add(win.terrainRegionAt(p.x, p.y));
  }
  hold([]);
  check('Task103: player — walking around beyond the mountain never enters the rock', bad === 0 && !regions.has('mountain'));
  // a saved position is kept exactly; one inside the rock is moved onto the base
  const storage = t103Storage();
  const w2 = newDom(storage).window;
  w2.state.world.player.x = 4.37; w2.state.world.player.y = -2.25; w2.state.world.player.facing = 'up';
  w2.saveGame();
  const back = newDom(storage).window.state.world.player;
  check('Task103: player — a saved position and facing come back exactly', back.x === 4.37 && back.y === -2.25 && back.facing === 'up' && back.pose === 'idle');
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  sv.run.world.player = { x: -6, y: 5, facing: 'left', pose: 'walk' };
  storage.setItem('gachaFactorySave', JSON.stringify(sv));
  const moved = newDom(storage).window.state;
  check('Task103: player — a position inside the closed mountain is moved onto the base on load', moved.world.player.x === moved.world.base.x && moved.world.player.y === moved.world.base.y);
})();

// -----------------------------------------------------------------------------
// 4. Core loop numbers: mining, crafting, selling, the first ticket, workers.
// -----------------------------------------------------------------------------
(function test_T103_coreLoopNumbers() {
  const win = newDom(t103Storage()).window;
  const s = win.state, q = win.permanent;
  check('Task103: core — the multiplier starts at exactly 1', win.mult() === 1);
  for (let i = 0; i < 4; i++) win.mineResource('iron');
  for (let i = 0; i < 2; i++) win.mineResource('coal');
  check('Task103: core — a manual mining click adds 1 ore at the start', s.resources.iron === 4 && s.resources.coal === 2);
  const steel = win.recipeByKey('steel');
  check('Task103: core — steel takes 2 iron + 1 coal and is made at once', win.startCraft(steel) && win.startCraft(steel) && s.products.steel === 2 && s.resources.iron === 0 && s.resources.coal === 0);
  check('Task103: core — with no ore left steel cannot be made', win.startCraft(steel) === false && s.products.steel === 2);
  win.sellAll(steel);
  check('Task103: core — selling pays sell price x multiplier (2 x 5G)', s.gold === 10 && s.products.steel === 0);
  s.products.steel = 8; win.sellAll(steel);
  check('Task103: core — reaching 50G grants the first gacha ticket once', s.gold === 50 && q.tickets === 1 && q.firstGachaGranted === true);
  s.products.steel = 10; win.sellAll(steel);
  check('Task103: core — the first ticket is not granted twice', q.tickets === 1);
  const cap = win.workerCap();
  win.pullGacha();
  const w = s.characters[0];
  check('Task103: core — a pulled worker has an id, a rarity and an unlocked resource', s.characters.length === 1 && typeof w.id === 'string' && !!win.RARITY.find((r) => r.key === w.rarity) && win.isUnlocked(w.resource) && cap === 8);
  const rate = win.autoRate(w.resource);
  const before = s.resources[w.resource];
  for (let i = 0; i < 10; i++) win.tickMining();
  check('Task103: core — a worker mines its rate per second through the tick', Math.abs(s.resources[w.resource] - before - rate) < 1e-9 && rate === win.workerEffective(w));
  // timed craft through the tick
  s.resources.iron = 10; s.resources.coal = 10; s.products.steel = 4; s.resources.crystal = 2; s.unlockedSites.manaVein = true;
  const ca = win.recipeByKey('crystalAlloy');
  check('Task103: core — a timed craft takes its time, then adds the product', win.startCraft(ca) && s.products.crystalAlloy === 0 && s.craftQueue.crystalAlloy === ca.craftTime);
  for (let i = 0; i < ca.craftTime * win.TICKS_PER_SECOND; i++) win.tickCrafting();
  check('Task103: core — after craftTime seconds of ticks the product is there', s.products.crystalAlloy === 1 && s.craftQueue.crystalAlloy === null);
  // HQ investment and the multiplier
  s.gold = 1e6;
  const hqCost = win.hqCost();
  check('Task103: core — HQ investment costs its price and raises the multiplier', win.investHQ() && s.gold === 1e6 - hqCost && win.mult() > 1);
})();

// -----------------------------------------------------------------------------
// 5. Mine states: undiscovered -> discovered -> site unlocked -> secured -> mined.
// -----------------------------------------------------------------------------
(function test_T103_mineStates() {
  const win = newDom(t103Storage()).window;
  const s = win.state;
  const iron = win.addMine({ id: 'mine_t103_iron', x: 6, y: 6, resource: 'iron', grade: 2, miningPower: 3, developmentState: 'unsecured' });
  s.world.hiddenMineIds.push(iron.id);
  check('Task103: mines — an undiscovered mine cannot be secured or mined', win.isMineDiscovered(iron) === false && win.secureMine(iron.id) === false && win.mineMine(iron.id) === false);
  s.world.player.x = 6 - 2; s.world.player.y = 6;
  check('Task103: mines — walking within the discovery radius discovers it', win.tickExploration().includes(iron.id) && win.isMineDiscovered(iron));
  check('Task103: mines — a discovered mine of an open site can be secured once', win.secureMine(iron.id) === true && iron.developmentState === 'secured' && win.secureMine(iron.id) === false);
  const i0 = s.resources.iron;
  check('Task103: mines — mining a secured mine adds miningPower x multiplier', win.mineMine(iron.id) && s.resources.iron - i0 === 3 * win.mult());
  check('Task103: mines — a secured mine pays miningPower x grade x rate per second', Math.abs(win.mineRate('iron') - (3 * 2 + 0) * win.BALANCE.mining.MINE_RATE_PER_GRADE) < 1e-12);
  const mana = win.addMine({ id: 'mine_t103_mana', x: 7, y: -6, resource: 'mana', grade: 2, miningPower: 1, developmentState: 'unsecured' });
  check('Task103: mines — a mine whose site is locked cannot be secured', win.isMineSiteUnlocked(mana) === false && win.secureMine(mana.id) === false);
  s.gold = 5000;
  check('Task103: mines — after the site is unlocked it can be secured', win.unlockSite('manaVein') && win.secureMine(mana.id) === true);
  check('Task103: mines — two mines cannot share a cell', win.addMine({ x: 6, y: 6, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' }) === null);
})();

// -----------------------------------------------------------------------------
// 6. The tunnel: research -> job -> open, kept across save/load, mines once.
// -----------------------------------------------------------------------------
(function test_T103_tunnelFlow() {
  const storage = t103Storage();
  const win = newDom(storage, { fullWorld: true }).window;
  const s = win.state;
  const beyond = () => s.world.mines.filter((m) => win.terrainRegionAt(m.x, m.y) === 'beyond').length;
  check('Task103: tunnel — a new game has the tunnel closed and nothing beyond', s.world.tunnelUnlocked === false && beyond() === 0 && !win.isWorldPointWalkable(-8, 1));
  s.gold = 6000; s.products.alloy = 5;
  check('Task103: tunnel — the job needs the research first', win.orderTunnelWork(1000) === false && win.doResearch('tunnelWork') && win.orderTunnelWork(1000));
  check('Task103: tunnel — the job costs 1000 + 5000 gold and 5 magic alloy', s.gold === 0 && s.products.alloy === 0 && win.tunnelWorkStatus() === 'building');
  win.saveGame();
  const mid = newDom(storage).window;
  check('Task103: tunnel — a job in progress survives save/load', mid.tunnelWorkStatus() === 'building' && mid.state.world.tunnelContract.startedAt === 1000);
  check('Task103: tunnel — it opens after 600 s and adds the land-beyond mines once', mid.tickTunnelWork(1000 + 599000) === false &&
    mid.tickTunnelWork(1000 + 600000) === true && mid.state.world.mines.filter((m) => mid.terrainRegionAt(m.x, m.y) === 'beyond').length === 8 &&
    mid.unlockTunnel() === false);
  check('Task103: tunnel — the land beyond is walkable once open', mid.isWorldPointWalkable(-8, 1) === true && mid.isWorldPointWalkable(-4.5, 5) === false);
  mid.saveGame();
  const after = newDom(storage).window;
  check('Task103: tunnel — the open tunnel and its mines are kept, nothing is generated again',
    after.state.world.tunnelUnlocked === true && after.state.world.mines.length === mid.state.world.mines.length && after.tickTunnelWork(9e12) === false);
})();

// -----------------------------------------------------------------------------
// 7. The save holds game state only: selecting, moving, tabs, inputs and
//    rendering add nothing (the top-down renderer must keep it that way).
// -----------------------------------------------------------------------------
(function test_T103_saveHoldsNoViewState() {
  const storage = t103Storage(T103_FIXTURE_RAW);
  const win = newDom(storage).window;
  const doc = win.document;
  doc.querySelector('[data-tab="delivery"]').click();
  win.selectWorldObject('base');
  win.setPlayerHeld('down', true); win.tickLoop(); win.setPlayerHeld('down', false); win.tickLoop();
  const qty = doc.querySelector('[data-deliver-qty="forge"]'); if (qty) { qty.value = '9'; qty.focus(); }
  win.renderAll(); win.renderWorldGround(); win.renderExplorationMap();
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task103: view state — the save structure is the fixture structure (no new keys anywhere but the Task 112 torch list)', JSON.stringify(t103Shape(sv)) === JSON.stringify(t103ShapeNow()));
  check('Task103: view state — top level keys are exactly saveVersion, savedAt, permanent, run', Object.keys(sv).sort().join() === 'permanent,run,saveVersion,savedAt');
  check('Task103: view state — world keys are exactly the saved world fields',
    Object.keys(sv.run.world).sort().join() === 'base,hiddenMineIds,mines,player,torches,tunnelContract,tunnelUnlocked,workshops');
  check('Task103: view state — the player keeps x, y, facing, pose only', Object.keys(sv.run.world.player).sort().join() === 'facing,pose,x,y');
  check('Task103: view state — nothing about selection, camera, zoom or tabs is saved', !/selected|selection|camera|zoom|activeTab|"view"/i.test(JSON.stringify(sv)));
  check('Task103: view state — saveVersion is 1', sv.saveVersion === 1);
})();

// -----------------------------------------------------------------------------
// 8. The handoff files (tools/build-dist.js): the ZIP holds every game file
//    unchanged, and the single HTML inlines the page in order and runs.
// -----------------------------------------------------------------------------
(function test_T103_handoffBuild() {
  const dist = require(path.join(__dirname, '..', 'tools', 'build-dist.js'));
  const root = path.join(__dirname, '..');
  const files = dist.gameFiles(root);
  const pageScripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
  check('Task103: handoff — the ZIP file list is index.html, the stylesheet and every script the page loads',
    files[0] === 'index.html' && files.includes('css/style.css') && pageScripts.length === MODULE_FILES.length && pageScripts.every((s) => files.includes(s)));
  check('Task103: handoff — CRC-32 matches the standard check value', dist.crc32(Buffer.from('123456789')) === 0xcbf43926);
  const zip = dist.buildZip([{ name: 'a.txt', data: Buffer.from('채굴 공방') }, { name: 'js/b.js', data: Buffer.from('x'.repeat(5000)) }], 'pkg');
  // read the entries back through the central directory
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(endAt + 10);
  let p = zip.readUInt32LE(endAt + 16);
  const back = [];
  for (let i = 0; i < count; i++) {
    const nameLen = zip.readUInt16LE(p + 28), off = zip.readUInt32LE(p + 42), crc = zip.readUInt32LE(p + 16), csize = zip.readUInt32LE(p + 20);
    const name = zip.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const lnl = zip.readUInt16LE(off + 26);
    const data = require('zlib').inflateRawSync(zip.slice(off + 30 + lnl, off + 30 + lnl + csize));
    back.push({ name, text: data.toString('utf8'), ok: dist.crc32(data) === crc });
    p += 46 + nameLen;
  }
  check('Task103: handoff — ZIP entries read back with their names, contents and CRCs',
    back.length === 2 && back[0].name === 'pkg/a.txt' && back[0].text === '채굴 공방' && back[1].text === 'x'.repeat(5000) && back.every((e) => e.ok));
  const single = dist.buildSingleHtml(root);
  const inlined = [...single.matchAll(/<script>\/\* (js\/[^ ]+) \*\//g)].map((m) => m[1]);
  check('Task103: handoff — the single HTML inlines the stylesheet and every script in page order, with no local file left',
    JSON.stringify(inlined) === JSON.stringify(pageScripts) && /<style>/.test(single) && !/<script src="js\//.test(single) && !/href="css\//.test(single));
  // it boots as a page on its own
  const dom = new JSDOM(single, { runScripts: 'dangerously', url: 'https://single.test/' });
  allDoms.push(dom);
  const sw = dom.window;
  let ok = false, gold = null;
  try {
    sw.eval('mineResource("iron"); mineResource("iron"); mineResource("coal"); startCraft(recipeByKey("steel")); sellAll(recipeByKey("steel")); saveGame();');
    gold = sw.eval('state.gold');
    ok = JSON.parse(sw.localStorage.getItem('gachaFactorySave')).saveVersion === 1;
  } catch (e) { ok = false; }
  check('Task103: handoff — the single HTML boots the game, plays the core loop and saves (saveVersion 1)', ok && gold === 5 &&
    sw.document.getElementById('goldVal').textContent !== '' && !!sw.document.querySelector('[data-mine="iron"]'));
})();
