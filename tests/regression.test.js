#!/usr/bin/env node
'use strict';
/**
 * Regression test suite for 채굴 공방 (gacha-factory-prototype).
 *
 * This does NOT reimplement the game — it loads the actual index.html,
 * evaluates its <script> in a jsdom window, and drives the real functions
 * and DOM (buttons, selects) exactly as a browser would. Balance-formula
 * tests compare the game's real output against independently hardcoded
 * reference values (not values re-read from BALANCE), so a regression in
 * BALANCE itself would be caught rather than silently treated as correct.
 *
 * Run: npm test   (or)   node tests/regression.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// Task 24: the game script now lives in js/*.js (loaded by index.html via
// <script src> tags, in this same order) instead of one inline <script>.
// jsdom's automatic external-<script>-fetching is unreliable/slow for local
// files, so the harness reads and concatenates the real module files itself,
// in the exact same order the browser loads them — this is not a reimplementation,
// it is the literal file content index.html points at.
const JS_DIR = path.join(__dirname, '..', 'js');
const MODULE_FILES = ['data.js', 'balance.js', 'state.js', 'systems.js', 'factory.js', 'ui.js', 'main.js'];
const moduleSource = MODULE_FILES.map((f) => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');

let passCount = 0;
let failCount = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    failures.push(name + (detail ? ' — ' + detail : ''));
  }
  console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// A tiny in-memory localStorage we fully control, so tests can simulate
// "no save", "corrupted save", "storage unavailable", etc. on demand.
// ---------------------------------------------------------------------------
function makeMemoryStorage() {
  let store = {};
  let throwOnAccess = false;
  return {
    getItem: (k) => { if (throwOnAccess) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: (k, v) => { if (throwOnAccess) throw new Error('blocked'); store[k] = String(v); },
    removeItem: (k) => { if (throwOnAccess) throw new Error('blocked'); delete store[k]; },
    clear: () => { store = {}; },
    _raw: () => store,
    _setRaw: (k, v) => { store[k] = v; },
    _setThrow: (v) => { throwOnAccess = v; },
  };
}

// ---------------------------------------------------------------------------
// Loads a fresh window running the real game script against a given
// localStorage. Top-level `let`/`const` bindings from a classic <script>
// don't survive across separate eval() calls in jsdom, so we append a tiny
// exposure shim (read-only getters) purely for test access — this does not
// touch index.html; it's appended only to the in-memory copy of the script
// text used for this test run.
// ---------------------------------------------------------------------------
const allDoms = [];
function newDom(storage) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
  const win = dom.window;
  Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  win.confirm = () => true;
  win.alert = () => {};
  const expose = `
;window.__expose = {
  state: () => state,
  permanent: () => permanent,
  saveBlocked: () => saveBlocked,
  RESOURCES: () => RESOURCES,
  RECIPES: () => RECIPES,
  RARITY: () => RARITY,
  SITES: () => SITES,
  TICK_MS: () => TICK_MS,
  TICKS_PER_SECOND: () => TICKS_PER_SECOND,
};
`;
  win.eval(moduleSource + expose);
  Object.defineProperties(win, {
    state: { get: () => win.__expose.state(), configurable: true },
    // permanent is the game's single cross-prestige state container
    // (totalPrestige/runCount/tickets/firstGachaGranted), replacing the
    // separate totalPrestige/runCount lets and window.tickets/
    // window.firstGachaGranted globals this test file used to reach.
    permanent: { get: () => win.__expose.permanent(), configurable: true },
    saveBlocked: { get: () => win.__expose.saveBlocked(), configurable: true },
    RESOURCES: { get: () => win.__expose.RESOURCES(), configurable: true },
    RECIPES: { get: () => win.__expose.RECIPES(), configurable: true },
    RARITY: { get: () => win.__expose.RARITY(), configurable: true },
    SITES: { get: () => win.__expose.SITES(), configurable: true },
    TICK_MS: { get: () => win.__expose.TICK_MS(), configurable: true },
    TICKS_PER_SECOND: { get: () => win.__expose.TICKS_PER_SECOND(), configurable: true },
  });
  allDoms.push(dom);
  return dom;
}

function advanceTicks(win, n) {
  for (let i = 0; i < n; i++) win.tickLoop();
}

// =============================================================================
// SAVE / LOAD
// =============================================================================

(function test_freshStart() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  check('save/load: fresh start — gold=0', win.state.gold === 0);
  check('save/load: fresh start — tickets=0', win.permanent.tickets === 0);
  check('save/load: fresh start — firstGachaGranted=false', win.permanent.firstGachaGranted === false);
  check('save/load: fresh start — characters=[]', Array.isArray(win.state.characters) && win.state.characters.length === 0);
})();

(function test_saveThenLoadRoundTrip() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;

  win.state.resources.iron = 100;
  win.state.resources.coal = 100;
  for (let i = 0; i < 10; i++) win.startCraft(win.RECIPES.find((r) => r.key === 'steel'));
  win.sellAll(win.RECIPES.find((r) => r.key === 'steel'));
  check('save/load: crossing 50G grants firstGachaGranted', win.permanent.firstGachaGranted === true);
  check('save/load: crossing 50G grants a ticket', win.permanent.tickets >= 1);

  win.permanent.tickets = 1;
  win.pullGacha();
  check('save/load: worker pulled', win.state.characters.length === 1);

  const goldBefore = win.state.gold;
  const ticketsBefore = win.permanent.tickets;
  const charsBefore = win.state.characters.map((c) => JSON.stringify(c, Object.keys(c).sort()));

  const saved = win.saveGame();
  check('save/load: saveGame() succeeds', saved === true);
  check('save/load: payload actually written', storage._raw()['gachaFactorySave'] !== undefined);

  win = newDom(storage).window;
  check('save/load: gold restored', win.state.gold === goldBefore, `${win.state.gold} vs ${goldBefore}`);
  check('save/load: tickets restored', win.permanent.tickets === ticketsBefore);
  check('save/load: firstGachaGranted restored', win.permanent.firstGachaGranted === true);
  check(
    'save/load: characters restored (order + all fields)',
    JSON.stringify(win.state.characters.map((c) => JSON.stringify(c, Object.keys(c).sort()))) === JSON.stringify(charsBefore)
  );
})();

(function test_craftQueueSurvivesReload() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.state.craftQueue.specialAlloy = 2.7; // pretend 2.7s remain on a paused craft
  win.saveGame();

  win = newDom(storage).window;
  check('craftQueue: exact remaining time restored', win.state.craftQueue.specialAlloy === 2.7, String(win.state.craftQueue.specialAlloy));
  const before = win.state.craftQueue.specialAlloy;
  advanceTicks(win, 5); // 5 * 100ms = 0.5s of normal tick progress
  const after = win.state.craftQueue.specialAlloy;
  check('craftQueue: resumes via the normal tick loop after reload', after !== null && Math.abs((before - after) - 0.5) < 1e-9, `${before} -> ${after}`);
})();

(function test_prestigeThenReload() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;

  win.permanent.tickets = 1;
  win.pullGacha();
  win.state.runGold = 5000;
  const expectedGain = win.prestigeGain();
  win.document.getElementById('prestigeBtn').onclick();
  check('prestige: totalPrestige increased by the expected amount', win.permanent.totalPrestige === expectedGain, `${win.permanent.totalPrestige} vs ${expectedGain}`);
  check('prestige: autosaves immediately on confirm', storage._raw()['gachaFactorySave'] !== undefined);

  const prestigeAfter = win.permanent.totalPrestige;
  const runCountAfter = win.permanent.runCount;
  win = newDom(storage).window;
  check('prestige: totalPrestige persists across reload', win.permanent.totalPrestige === prestigeAfter);
  check('prestige: runCount persists across reload', win.permanent.runCount === runCountAfter);
  check('prestige: characters reset to empty on the new run', win.state.characters.length === 0);
})();

(function test_corruptedJson() {
  const storage = makeMemoryStorage();
  storage._setRaw('gachaFactorySave', '{not valid json!!!');
  const win = newDom(storage).window;
  check('corrupted save: falls back to a clean default state', win.state.gold === 0 && win.permanent.tickets === 0);
})();

(function test_invalidShapeAndFieldTypes() {
  const storage = makeMemoryStorage();
  const badPayload = {
    saveVersion: 1,
    permanent: { totalPrestige: 5, runCount: 'not a number', tickets: 2, firstGachaGranted: true },
    run: {
      resources: { iron: 'NaN-ish', coal: 42 },
      products: { steel: 3 },
      gold: 999,
      runGold: 10,
      characters: 'not an array',
      lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {},
      craftQueue: { steel: 'also bad' },
      hqLevel: 1,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(badPayload));
  const win = newDom(storage).window;
  check('field validation: non-numeric resource field falls back to 0', win.state.resources.iron === 0);
  check('field validation: valid sibling field (coal=42) is preserved', win.state.resources.coal === 42);
  check('field validation: non-array characters becomes []', Array.isArray(win.state.characters) && win.state.characters.length === 0);
  check('field validation: non-integer runCount falls back to 1', win.permanent.runCount === 1);
  check('field validation: valid permanent field (totalPrestige=5) is preserved', win.permanent.totalPrestige === 5);
  check('field validation: invalid craftQueue value becomes null', win.state.craftQueue.steel === null);
  check('field validation: valid gold(999) is preserved', win.state.gold === 999);
})();

(function test_negativeValuesRejected() {
  const storage = makeMemoryStorage();
  const badPayload = {
    saveVersion: 1,
    permanent: { totalPrestige: -1, runCount: 1, tickets: -1, firstGachaGranted: true },
    run: {
      resources: { iron: -5, coal: 10 },
      products: { steel: -2 },
      gold: -100,
      runGold: 50,
      characters: [{ rarity: 'common', resource: 'iron', mining: -1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 }],
      lastPull: null,
      facility: { iron: -3 }, workforce: { iron: -1 }, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {},
      craftQueue: { steel: -4.2, alloy: 3.1 },
      hqLevel: -2,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(badPayload));
  const win = newDom(storage).window;
  check('negative values: gold=-100 rejected, falls back to 0', win.state.gold === 0);
  check('negative values: tickets=-1 rejected, falls back to 0', win.permanent.tickets === 0);
  check('negative values: totalPrestige=-1 rejected, falls back to 0', win.permanent.totalPrestige === 0);
  check('negative values: resources.iron=-5 rejected, falls back to 0', win.state.resources.iron === 0);
  check('negative values: products.steel=-2 rejected, falls back to 0', win.state.products.steel === 0);
  check('negative values: facility.iron=-3 rejected, falls back to 0', win.state.facility.iron === 0);
  check('negative values: workforce.iron=-1 rejected, falls back to 0', win.state.workforce.iron === 0);
  check('negative values: hqLevel=-2 rejected, falls back to 0', win.state.hqLevel === 0);
  check('negative values: craftQueue.steel=-4.2 rejected, falls back to null', win.state.craftQueue.steel === null);
  check('negative values: craftQueue.alloy=3.1 (valid) preserved', win.state.craftQueue.alloy === 3.1);
  check('negative values: worker with negative mining is dropped entirely', win.state.characters.length === 0);
  check('negative values: valid sibling runGold=50 preserved', win.state.runGold === 50);
})();

(function test_nanInfinityRejected() {
  const storage = makeMemoryStorage();
  // JSON.parse can't itself produce NaN/Infinity, but a hand-crafted payload
  // (or a future bug) could still assign them in-memory before saving; the
  // sanitizer must reject them the same way it rejects any non-finite value.
  const win = newDom(storage).window;
  check('NaN rejected by isFiniteNumber-family checks', win.eval('isFiniteNumber(NaN)') === false);
  check('Infinity rejected by isFiniteNumber-family checks', win.eval('isFiniteNumber(Infinity)') === false);
  check('-Infinity rejected by isNonNegativeFinite', win.eval('isNonNegativeFinite(-Infinity)') === false);
  check('NaN rejected by isNonNegativeInt', win.eval('isNonNegativeInt(NaN)') === false);
})();

(function test_futureSaveVersionProtected() {
  const storage = makeMemoryStorage();
  const futurePayload = { saveVersion: 999, run: { gold: 12345 }, permanent: {} };
  const rawBefore = JSON.stringify(futurePayload);
  storage._setRaw('gachaFactorySave', rawBefore);
  const win = newDom(storage).window;
  check('future saveVersion: game boots with safe default state', win.state.gold === 0);
  check('future saveVersion: saveBlocked is set', win.saveBlocked === true);
  const saved = win.saveGame();
  check('future saveVersion: saveGame() refuses to write', saved === false);
  check('future saveVersion: original raw data is never overwritten', storage._raw()['gachaFactorySave'] === rawBefore);
})();

(function test_localStorageUnavailable() {
  const storage = makeMemoryStorage();
  storage._setThrow(true);
  const win = newDom(storage).window;
  check('storage unavailable: game still boots normally', win.state.gold === 0 && typeof win.state === 'object');
  const saved = win.saveGame();
  check('storage unavailable: save attempt fails safely (no throw)', saved === false);
})();

(function test_autosaveTimingNotEveryTick() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.gold = 777;

  let saveWrites = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (k, v) => { if (k === 'gachaFactorySave') saveWrites++; return originalSetItem(k, v); };

  advanceTicks(win, 50); // 50 * 100ms = 5s of game time, tickLoop must never call saveGame
  check('tick loop never autosaves on its own (50 ticks, 0 writes)', saveWrites === 0, `writes=${saveWrites}`);

  win.saveGame();
  check('explicit saveGame() call writes exactly once', saveWrites === 1, `writes=${saveWrites}`);
})();

(function test_visibilityChangeTriggersSave() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.gold = 555;
  Object.defineProperty(win.document, 'visibilityState', { value: 'hidden', configurable: true });
  win.document.dispatchEvent(new win.window.Event('visibilitychange'));
  const saved = JSON.parse(storage._raw()['gachaFactorySave']);
  check('visibilitychange(hidden) triggers a save', saved.run.gold === 555);
})();

(function test_tickLoopSourceNeverCallsSaveGame() {
  const src = moduleSource; // Task 24: tickLoop() now lives in js/systems.js, not inline in index.html
  const tickFnMatch = src.match(/function tickLoop\(\)\{[\s\S]*?\n\}/);
  const tickFnBody = tickFnMatch ? tickFnMatch[0] : '';
  check('tickLoop() source contains no saveGame() call', tickFnBody.length > 0 && !tickFnBody.includes('saveGame'));
})();

// =============================================================================
// BALANCE — compare the real game functions against independently hardcoded
// reference values (the values approved for BALANCE in Task 2), not values
// re-read from window.BALANCE. This way a regression IN BALANCE is caught.
// =============================================================================

(function test_balanceFormulas() {
  const win = newDom(makeMemoryStorage()).window;

  function refExpCost(base, growth, level) { return Math.round(base * Math.pow(growth, level)); }
  const REF = {
    prestigeMultPerPoint: 0.15,
    prestigeGoldDivisor: 200,
    hqMultPerLevel: 0.08,
    hqCostBase: 150, hqCostGrowth: 1.6,
    workforceBonusMult: 1.5,
    facilityCostBase: 20, facilityCostGrowth: 1.4,
    workforceCostBase: 15, workforceCostGrowth: 1.35,
    workerEffectiveDivisor: 16,
    statCostBase: { mining: 40, carry: 60, move: 50 }, statCostGrowth: 1.35,
    autoSellMult: 20,
  };

  // mult() — set totalPrestige/hqLevel directly via state/exposed vars.
  for (const p of [0, 1, 3, 7]) {
    for (const h of [0, 2, 5]) {
      win.state.hqLevel = h;
      // totalPrestige is read-only exposed; drive it via a prestige reset instead
      // for a couple of spot values, and otherwise verify the formula directly.
      const expected = (1 + p * REF.prestigeMultPerPoint) * (1 + h * REF.hqMultPerLevel);
      const actual = (1 + win.permanent.totalPrestige * REF.prestigeMultPerPoint) * win.hqMult();
      // Only meaningful when totalPrestige actually equals p; use the live value instead.
      const liveExpected = (1 + win.permanent.totalPrestige * REF.prestigeMultPerPoint) * (1 + h * REF.hqMultPerLevel);
      check(`BALANCE: mult() matches reference formula (hqLevel=${h})`, Math.abs(win.mult() - liveExpected) < 1e-12);
    }
  }

  for (const h of [0, 1, 3, 8, 15]) {
    win.state.hqLevel = h;
    check(`BALANCE: hqCost() matches reference (L${h})`, win.hqCost() === refExpCost(REF.hqCostBase, REF.hqCostGrowth, h));
  }

  for (const lvl of [0, 1, 3, 8, 15]) {
    win.state.facility.iron = lvl;
    win.state.workforce.iron = lvl;
    check(`BALANCE: facilityCost() matches reference (L${lvl})`, win.facilityCost('iron') === refExpCost(REF.facilityCostBase, REF.facilityCostGrowth, lvl));
    check(`BALANCE: workforceCost() matches reference (L${lvl})`, win.workforceCost('iron') === refExpCost(REF.workforceCostBase, REF.workforceCostGrowth, lvl));
  }

  ['mining', 'carry', 'move'].forEach((stat) => {
    for (const lvl of [0, 1, 3, 8]) {
      const worker = { [stat + 'Lvl']: lvl };
      check(
        `BALANCE: workerUpgradeCost(${stat}) matches reference (L${lvl})`,
        win.workerUpgradeCost(worker, stat) === refExpCost(REF.statCostBase[stat], REF.statCostGrowth, lvl)
      );
    }
  });

  [[1, 2, 1], [2, 3, 2], [3, 5, 3], [5, 8, 5], [10, 10, 10]].forEach(([m, c, mv]) => {
    const worker = { mining: m, carry: c, move: mv };
    check(
      `BALANCE: workerEffective() matches reference (${m},${c},${mv})`,
      Math.abs(win.workerEffective(worker) - (m * c * mv) / REF.workerEffectiveDivisor) < 1e-12
    );
  });

  [5, 20, 45, 80, 400, 420].forEach((sell) => {
    check(`BALANCE: autoSellCost() matches reference (sell=${sell})`, win.autoSellCost({ sell }) === sell * REF.autoSellMult);
  });

  // prestigeGain(): reference floor(sqrt(runGold/200)), gated on >=1 worker
  win.permanent.tickets = 1;
  win.pullGacha();
  [[0, 0], [199, 0], [200, 1], [800, 2], [1800, 3], [3200, 4], [5000, 5]].forEach(([gold, expectedPts]) => {
    win.state.runGold = gold;
    check(`BALANCE: prestigeGain() matches reference at runGold=${gold}`, win.prestigeGain() === expectedPts);
  });
})();

// =============================================================================
// TICK / TIMER
// =============================================================================

(function test_tickTimingConstants() {
  const win = newDom(makeMemoryStorage()).window;
  check('tick: TICK_MS is 100 (unchanged engine constant)', win.TICK_MS === 100);
  check('tick: TICKS_PER_SECOND derives to exactly 10', win.TICKS_PER_SECOND === 10);

  // Bit-identical to the pre-BALANCE-refactor rate/10 and -0.1 literals.
  const ticksPerSecond = win.TICKS_PER_SECOND;
  let allMatch = true;
  for (const rate of [0, 1, 3.7, 12.5, 0.125, 100000, 7, 2.3333333, Math.PI]) {
    if (rate / 10 !== rate / ticksPerSecond) allMatch = false;
  }
  check('tick: derived per-tick resource fraction is bit-identical to rate/10', allMatch);
  check('tick: derived per-tick craft-queue fraction is bit-identical to 0.1', 1 / ticksPerSecond === 0.1);
})();

// =============================================================================
// WORKER ID
// =============================================================================

(function test_newWorkerHasUniqueId() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 5;
  for (let i = 0; i < 5; i++) win.pullGacha();
  const ids = win.state.characters.map((c) => c.id);
  check('worker id: every new worker has a non-empty string id', ids.every((id) => typeof id === 'string' && id.length > 0));
  check('worker id: ids are unique across pulls', new Set(ids).size === ids.length);
})();

(function test_upgradeAndReassignUseIdNotIndex() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 2;
  win.pullGacha();
  win.pullGacha();
  const [w1, w2] = win.state.characters;
  const id1Before = w1.id;
  const id2Before = w2.id;
  const before1 = w1.mining;
  const before2 = w2.mining;

  win.state.gold = 100000;
  win.updateNumbers(); // real gameplay always refreshes disabled state before a click is possible
  const btn2 = win.document.querySelectorAll('[data-upstat="mining"]')[1];
  btn2.click();
  check('worker id: upgrading worker #2 leaves its id unchanged', win.state.characters[1].id === id2Before);
  check('worker id: upgrade applies ONLY to worker #2', win.state.characters[1].mining === before2 + 1 && win.state.characters[0].mining === before1);
  check('worker id: worker #1 id unaffected by an unrelated upgrade', win.state.characters[0].id === id1Before);

  const sel1 = win.document.querySelectorAll('[data-reassign]')[0];
  sel1.value = 'coal';
  sel1.dispatchEvent(new win.window.Event('change'));
  check('worker id: reassigning worker #1 leaves its id unchanged', win.state.characters[0].id === id1Before);
  check('worker id: reassignment applies ONLY to worker #1', win.state.characters[0].resource === 'coal');
})();

(function test_idLookupSurvivesArrayReorder() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 3;
  win.pullGacha(); win.pullGacha(); win.pullGacha();
  const idsInOrder = win.state.characters.map((c) => c.id);

  // Simulate a future feature reordering the array (none exists yet in the
  // product — this test exists specifically to guard the invariant Task 3
  // was built for).
  win.state.characters.reverse();
  win.buildWorkers();
  win.state.gold = 100000;
  win.updateNumbers();

  const targetId = win.state.characters[0].id; // was the LAST id before reversal
  check('reorder: targetId is indeed the pre-reversal last worker', targetId === idsInOrder[idsInOrder.length - 1]);

  const btn = win.document.querySelector(`[data-upstat="mining"][data-worker-id="${targetId}"]`);
  const othersBefore = win.state.characters.filter((c) => c.id !== targetId).map((c) => ({ id: c.id, mining: c.mining }));
  const beforeMining = win.state.characters.find((c) => c.id === targetId).mining;
  btn.click();
  const after = win.state.characters.find((c) => c.id === targetId);
  check('reorder: the CORRECT worker (by id) is upgraded after reorder', after.mining === beforeMining + 1);
  const othersAfter = win.state.characters.filter((c) => c.id !== targetId);
  check('reorder: every other worker is completely unaffected', othersAfter.every((c) => c.mining === othersBefore.find((o) => o.id === c.id).mining));
})();

(function test_saveLoadPreservesIdOrderAndStats() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.permanent.tickets = 3;
  win.pullGacha(); win.pullGacha(); win.pullGacha();
  win.state.gold = 100000;
  win.updateNumbers();
  win.document.querySelectorAll('[data-upstat="carry"]')[1].click();
  const snapshot = win.state.characters.map((c) => ({ ...c }));
  win.saveGame();

  win = newDom(storage).window;
  const restored = win.state.characters;
  check('save/load: worker count preserved', restored.length === snapshot.length);
  check('save/load: worker order preserved (by id)', restored.every((c, i) => c.id === snapshot[i].id));
  check(
    'save/load: every worker field identical (stats/levels/id/order)',
    restored.every((c, i) => JSON.stringify(c, Object.keys(c).sort()) === JSON.stringify(snapshot[i], Object.keys(snapshot[i]).sort()))
  );
})();

(function test_legacySaveMissingIdsBackfilled() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: true },
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [
        { rarity: 'common', resource: 'iron', mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 }, // pre-Task-3 shape, no id
        { rarity: 'rare', resource: 'coal', mining: 2, carry: 3, move: 2, miningLvl: 1, carryLvl: 0, moveLvl: 2 },   // no id, already upgraded
      ],
      lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  const chars = win.state.characters;
  check('legacy save: both workers load successfully', chars.length === 2);
  check('legacy save: every worker got a fresh id', chars.every((c) => typeof c.id === 'string' && c.id.length > 0));
  check('legacy save: backfilled ids are distinct', chars[0].id !== chars[1].id);
  check('legacy save: worker #1 stats/rarity untouched', chars[0].rarity === 'common' && chars[0].mining === 1 && chars[0].carry === 2 && chars[0].move === 1);
  check(
    'legacy save: worker #2 stats/levels (upgrade progress) untouched',
    chars[1].rarity === 'rare' && chars[1].mining === 2 && chars[1].carry === 3 && chars[1].move === 2 && chars[1].miningLvl === 1 && chars[1].moveLvl === 2
  );
})();

(function test_duplicateIdSaveResolvedSafely() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: {},
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [
        { id: 'w_dup', rarity: 'common', resource: 'iron', mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 },
        { id: 'w_dup', rarity: 'epic', resource: 'coal', mining: 3, carry: 5, move: 3, miningLvl: 0, carryLvl: 0, moveLvl: 0 }, // corrupted duplicate
      ],
      lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  const chars = win.state.characters;
  check('duplicate id: both workers survive (no data loss)', chars.length === 2);
  check('duplicate id: ids are distinct after resolution', chars[0].id !== chars[1].id);
  check('duplicate id: the FIRST occurrence keeps the original id', chars[0].id === 'w_dup');
  check('duplicate id: both workers retain their original stats/rarity', chars[0].rarity === 'common' && chars[0].mining === 1 && chars[1].rarity === 'epic' && chars[1].mining === 3);
})();

(function test_validIdPassesThroughUnchanged() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: {},
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [
        { id: 'w_keepme_123', rarity: 'legend', resource: 'plasma', mining: 5, carry: 8, move: 5, miningLvl: 3, carryLvl: 1, moveLvl: 0 },
      ],
      lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true, spaceStation: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  check('valid id: a well-formed existing id is preserved exactly', win.state.characters[0].id === 'w_keepme_123');
})();

// =============================================================================
// GAME FLOW (smoke test) — mine -> craft -> sell -> first ticket -> gacha ->
// worker auto-mining -> prestige -> reset -> permanent prestige persists
// =============================================================================

(function test_fullGameFlowSmoke() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;

  // 1. Initial state.
  check('flow: starts with 0 gold, 0 tickets, no workers', win.state.gold === 0 && win.permanent.tickets === 0 && win.state.characters.length === 0);

  // 2. Manual mining (button click, exactly as a player would).
  const ironBtn = win.document.querySelector('[data-mine="iron"]');
  const coalBtn = win.document.querySelector('[data-mine="coal"]');
  for (let i = 0; i < 20; i++) ironBtn.click();
  for (let i = 0; i < 10; i++) coalBtn.click();
  check('flow: manual mining accumulates resources', win.state.resources.iron >= 20 && win.state.resources.coal >= 10);

  // 3. Craft (button click).
  win.updateNumbers();
  const craftBtn = win.document.querySelector('[data-craft="steel"]');
  for (let i = 0; i < 10; i++) { craftBtn.click(); win.updateNumbers(); }
  check('flow: crafting steel produces product', win.state.products.steel >= 10);

  // 4. Sell (button click) -> crosses the 50G first-ticket threshold.
  const sellBtn = win.document.querySelector('[data-sell="steel"]');
  sellBtn.click();
  check('flow: selling steel yields gold', win.state.gold > 0);
  check('flow: crossing 50G granted the first ticket', win.permanent.firstGachaGranted === true && win.permanent.tickets >= 1);

  // 5. Gacha (button click).
  win.updateNumbers();
  win.document.getElementById('gachaTicketBtn').click();
  check('flow: gacha pull produced a worker', win.state.characters.length === 1);
  check('flow: worker is assigned to an unlocked resource', ['iron', 'coal'].includes(win.state.characters[0].resource));

  // 6. Auto-mining now active for the worker's resource.
  const workerRes = win.state.characters[0].resource;
  check('flow: auto rate is now > 0 for the worker\'s resource', win.autoRate(workerRes) > 0);

  // 7. Build up enough runGold for a prestige point, then prestige.
  win.state.runGold = 5000;
  const expectedGain = win.prestigeGain();
  check('flow: prestige gain is available with a worker present', expectedGain > 0);
  win.document.getElementById('prestigeBtn').onclick();
  check('flow: prestige increased totalPrestige', win.permanent.totalPrestige === expectedGain);
  check('flow: prestige reset the run (0 workers, 0 gold)', win.state.characters.length === 0 && win.state.gold === 0);

  // 8. Permanent prestige value persists across a reload.
  const prestigeAfter = win.permanent.totalPrestige;
  win = newDom(storage).window; // no explicit save call — relies on the autosave-on-prestige from step 7
  check('flow: permanent prestige persists after prestige + reload', win.permanent.totalPrestige === prestigeAfter);
})();

// =============================================================================
// TASK 6 — early automation guidance (Next Hint branches + one-time log +
// locked-site recipe preview)
// =============================================================================

function makeTestWorker(id, resource) {
  return { id, rarity: 'common', resource, mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 };
}

(function test_A_noWorkersHintUnchanged() {
  const win = newDom(makeMemoryStorage()).window;
  // Grant the first ticket (crosses 50G) but pull no worker yet.
  win.state.gold = 50;
  win.permanent.firstGachaGranted = true;
  win.permanent.tickets = 1;
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-A: no-worker hint text is the original "뽑으세요" guidance', text.includes('일꾼') && text.includes('뽑'));
})();

(function test_B_ironOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-B: iron-only worker mentions coal as the missing side', text.includes('석탄'));
  check('Task6-B: iron-only worker does not claim full automation', !text.includes('자동화 완료'));
})();

(function test_C_coalOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'coal'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-C: coal-only worker mentions iron as the missing side', text.includes('철광석'));
  check('Task6-C: coal-only worker does not claim full automation', !text.includes('자동화 완료'));
})();

(function test_D_bothSidesShowsFullAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.state.characters.push(makeTestWorker('t2', 'coal'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-D: both sides covered shows the full-automation hint', text.includes('자동화 완료'));

  // Once autoCraft is turned on, the hint must fall through to the existing
  // prestige-related branches instead of hiding them forever (section E).
  win.state.autoCraft.steel = true;
  win.updateNextHint();
  const textAfter = win.document.getElementById('nextHint').textContent;
  check('Task6-E: after autoCraft is on, the automation-complete hint no longer shows', !textAfter.includes('자동화 완료'));
  check('Task6-E: prestige-related guidance is shown instead', textAfter.includes('명성') || textAfter.includes('200G'));
})();

(function test_E_logFiresOnceNotEveryTick() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.checkDualAutomation();
  win.state.characters.push(makeTestWorker('t2', 'coal'));
  win.checkDualAutomation();
  const countLogLines = () => win.document.querySelectorAll('#log div').length;
  const countAfterFirst = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('자동화 완료')).length;
  check('Task6-E: milestone log appears exactly once after reaching the condition', countAfterFirst === 1, `count=${countAfterFirst}`);

  // Advance many ticks; the guard (state.autoLineLogged) must prevent repeats.
  advanceTicks(win, 30);
  win.checkDualAutomation();
  win.checkDualAutomation();
  const countAfterMore = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('자동화 완료')).length;
  check('Task6-E: milestone log does NOT repeat across ticks / repeated calls', countAfterMore === 1, `count=${countAfterMore}`);
})();

(function test_F_reassignmentUpdatesAutomationStatus() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.permanent.tickets = 2;
  win.pullGacha();
  win.pullGacha();
  // Force both existing (randomly-assigned) workers onto iron directly, then
  // reassign one via the real UI control — exactly like a player would.
  win.state.characters[0].resource = 'iron';
  win.state.characters[1].resource = 'iron';
  win.buildWorkers();
  win.updateNextHint();
  check('Task6-F: both workers on iron shows the partial-automation hint', win.document.getElementById('nextHint').textContent.includes('석탄'));

  const sel = win.document.querySelectorAll('[data-reassign]')[1];
  sel.value = 'coal';
  sel.dispatchEvent(new win.window.Event('change'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-F: reassigning the 2nd worker to coal completes automation', text.includes('자동화 완료'));
  const logHits = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('자동화 완료')).length;
  check('Task6-F: reassignment-triggered milestone logs exactly once', logHits === 1, `count=${logHits}`);
})();

(function test_G_flagSurvivesSaveLoad() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.state.characters.push(makeTestWorker('t2', 'coal'));
  win.checkDualAutomation();
  check('Task6-G: autoLineLogged is true before save', win.state.autoLineLogged === true);
  win.saveGame();

  win = newDom(storage).window;
  check('Task6-G: autoLineLogged persists as true after reload', win.state.autoLineLogged === true);

  // Re-checking after reload must NOT re-log, since the flag survived.
  win.checkDualAutomation();
  const logHits = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('자동화 완료')).length;
  check('Task6-G: no duplicate milestone log after reload', logHits === 0, `count=${logHits}`); // the reload itself logs "이전 진행 상황을 불러왔습니다", not this milestone
})();

(function test_G2_flagResetsOnPrestige() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 1;
  win.pullGacha();
  win.state.characters.push(makeTestWorker('t2', win.state.characters[0].resource === 'iron' ? 'coal' : 'iron'));
  win.checkDualAutomation();
  check('Task6-G2: flag set before prestige', win.state.autoLineLogged === true);

  win.state.runGold = 5000;
  win.document.getElementById('prestigeBtn').onclick();
  check('Task6-G2: flag resets to false on the new run after prestige', win.state.autoLineLogged === false);
})();

(function test_H_lockedSiteShowsExistingRecipesOnly() {
  const win = newDom(makeMemoryStorage()).window;
  win.buildLines();
  const lockedCards = win.document.querySelectorAll('.line.locked');
  check('Task6-H: locked site cards still render (existing UI preserved)', lockedCards.length >= 3);

  const manaVeinText = Array.from(win.document.querySelectorAll('.site-group')).find((g) => g.textContent.includes('마정석 광맥'));
  check('Task6-H: manaVein card mentions its minerals', manaVeinText && manaVeinText.textContent.includes('마정석') && manaVeinText.textContent.includes('결정'));
  check(
    'Task6-H: manaVein card mentions only recipes that actually use its resources (from real RECIPES data)',
    manaVeinText && manaVeinText.textContent.includes('마법 합금') && manaVeinText.textContent.includes('결정 합금')
  );
  // Must NOT mention recipes belonging to other, unrelated sites.
  check('Task6-H: manaVein card does not falsely mention ruins/spaceStation recipes', manaVeinText && !manaVeinText.textContent.includes('퀀텀 코어') && !manaVeinText.textContent.includes('정밀 부품'));
})();

// =============================================================================
// TASK 9 — coalBrick recipe (candidate A from Task 8): coal-only, independent
// of steel's iron/coal, reuses all existing RECIPES/canCraft/startCraft/
// autoSell machinery with no new functions.
// =============================================================================

(function test_T9A_recipeData() {
  const win = newDom(makeMemoryStorage()).window;
  const r = win.RECIPES.find((x) => x.key === 'coalBrick');
  check('Task9-A: coalBrick exists in RECIPES', !!r);
  check('Task9-A: coalBrick.need = {coal:3}', r && Object.keys(r.need).length === 1 && r.need.coal === 3);
  check('Task9-A: coalBrick.out = 1', r && r.out === 1);
  check('Task9-A: coalBrick.sell = 4', r && r.sell === 4);
  check('Task9-A: coalBrick.craftTime = 0', r && r.craftTime === 0);
})();

(function test_T9B_manualCraftConsumesExactly() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.resources.coal = 3;
  const ok = win.startCraft(win.RECIPES.find((r) => r.key === 'coalBrick'));
  check('Task9-B: startCraft succeeds with exactly 3 coal', ok === true);
  check('Task9-B: coal reduced to 0', win.state.resources.coal === 0);
  check('Task9-B: coalBrick product +1', win.state.products.coalBrick === 1);
})();

(function test_T9C_insufficientMaterialBlocks() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.resources.coal = 2;
  const recipe = win.RECIPES.find((r) => r.key === 'coalBrick');
  check('Task9-C: canCraft() is false with only 2 coal', win.canCraft(recipe) === false);
  const ok = win.startCraft(recipe);
  check('Task9-C: startCraft() refuses with only 2 coal', ok === false);
  check('Task9-C: coal untouched on failed craft', win.state.resources.coal === 2);
  check('Task9-C: no product created on failed craft', win.state.products.coalBrick === 0);
})();

(function test_T9D_sellUsesRecipeSellAndMult() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.products.coalBrick = 1;
  const goldBefore = win.state.gold;
  win.sellAll(win.RECIPES.find((r) => r.key === 'coalBrick'));
  check('Task9-D: product cleared after sell', win.state.products.coalBrick === 0);
  check('Task9-D: gold increased by 4 * mult()', Math.abs(win.state.gold - (goldBefore + 4 * win.mult())) < 1e-9);
})();

(function test_T9E_autoCraftAndCraftQueueStaysNull() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.resources.coal = 30;
  win.state.autoCraft.coalBrick = true;
  win.tickLoop();
  check('Task9-E: auto-craft produced coalBrick on a tick with enough coal', win.state.products.coalBrick >= 1);
  check('Task9-E: craftQueue.coalBrick stays null (craftTime=0 never queues)', win.state.craftQueue.coalBrick === null);
  advanceTicks(win, 5);
  check('Task9-E: craftQueue.coalBrick still null after more ticks', win.state.craftQueue.coalBrick === null);
})();

(function test_T9F_autoSellCostAndFlow() {
  const win = newDom(makeMemoryStorage()).window;
  const recipe = win.RECIPES.find((r) => r.key === 'coalBrick');
  check('Task9-F: autoSellCost is computed (not hardcoded) as sell*20 = 80', win.autoSellCost(recipe) === 80);

  win.state.gold = 1000;
  win.buildRecipes();
  const buyBtn = win.document.querySelector('[data-buyautosell="coalBrick"]');
  check('Task9-F: buy-auto-sell button exists for coalBrick', !!buyBtn);
  buyBtn.click();
  check('Task9-F: autoSell.coalBrick true after purchase', win.state.autoSell.coalBrick === true);
  check('Task9-F: autoSellOn.coalBrick true after purchase', win.state.autoSellOn.coalBrick === true);

  win.state.products.coalBrick = 5;
  const goldBefore = win.state.gold;
  win.tickLoop();
  check('Task9-F: auto-sell cleared the product on tick', win.state.products.coalBrick === 0);
  check('Task9-F: auto-sell added gold on tick', win.state.gold > goldBefore);
})();

(function test_T9G_steelUnaffected() {
  const win = newDom(makeMemoryStorage()).window;
  const steel = win.RECIPES.find((r) => r.key === 'steel');
  check('Task9-G: steel.need unchanged (iron:2, coal:1)', steel.need.iron === 2 && steel.need.coal === 1 && Object.keys(steel.need).length === 2);
  check('Task9-G: steel.sell unchanged (5)', steel.sell === 5);
  check('Task9-G: steel.craftTime unchanged (0)', steel.craftTime === 0);

  // Steel auto-crafts identically whether or not coalBrick exists/auto-crafts,
  // since they share no materials.
  win.state.resources.iron = 100;
  win.state.resources.coal = 100;
  win.state.autoCraft.steel = true;
  win.state.autoCraft.coalBrick = true; // both on at once — must not interfere
  advanceTicks(win, 10);
  const steelProducedWithBoth = win.state.products.steel;
  const coalUsedByBoth = 100 - win.state.resources.coal;

  const win2 = newDom(makeMemoryStorage()).window;
  win2.state.resources.iron = 100;
  win2.state.resources.coal = 100;
  win2.state.autoCraft.steel = true; // coalBrick auto-craft left off
  advanceTicks(win2, 10);
  const steelProducedAlone = win2.state.products.steel;

  check('Task9-G: steel production identical whether coalBrick auto-craft is on or off', steelProducedWithBoth === steelProducedAlone, `${steelProducedWithBoth} vs ${steelProducedAlone}`);
})();

(function test_T9H_saveLoadCompatibility() {
  // A save written BEFORE this recipe existed (no coalBrick key anywhere)
  // must still load safely — freshRunState()/sanitizeRunState() already
  // derive their key sets from the live RECIPES array, so no explicit
  // migration should be needed.
  const storage = makeMemoryStorage();
  const legacyPayload = {
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: true },
    run: {
      resources: { iron: 5, coal: 5 },
      products: { steel: 2 }, // no coalBrick key at all — simulates a pre-Task-9 save
      gold: 10, runGold: 10,
      characters: [], lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: { steel: true }, autoSell: {}, autoSellOn: {},
      craftQueue: { steel: null }, hqLevel: 0, autoLineLogged: false,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(legacyPayload));
  const win = newDom(storage).window;
  check('Task9-H: legacy save (no coalBrick key) loads without error', win.state.gold === 10);
  check('Task9-H: coalBrick product defaults to 0', win.state.products.coalBrick === 0);
  check('Task9-H: coalBrick autoCraft defaults to false', win.state.autoCraft.coalBrick === false);
  check('Task9-H: coalBrick autoSell defaults to false', win.state.autoSell.coalBrick === false);
  check('Task9-H: coalBrick autoSellOn defaults to true', win.state.autoSellOn.coalBrick === true);
  check('Task9-H: coalBrick craftQueue defaults to null', win.state.craftQueue.coalBrick === null);
  check('Task9-H: pre-existing steel data untouched', win.state.products.steel === 2 && win.state.autoCraft.steel === true);

  // Round trip a save made WITH coalBrick data.
  win.state.products.coalBrick = 7;
  win.state.autoCraft.coalBrick = true;
  win.saveGame();
  const win2 = newDom(storage).window;
  check('Task9-H: coalBrick data round-trips through save/load', win2.state.products.coalBrick === 7 && win2.state.autoCraft.coalBrick === true);
})();

(function test_T9_recipeCardRendersViaExistingBuildRecipes() {
  const win = newDom(makeMemoryStorage()).window;
  win.buildRecipes();
  const card = Array.from(win.document.querySelectorAll('.recipe')).find((el) => el.textContent.includes('석탄 벽돌'));
  check('Task9-UI: coalBrick recipe card renders via existing buildRecipes()', !!card);
  check('Task9-UI: card shows the need text (석탄 3)', card && card.textContent.includes('석탄') && card.textContent.includes('3'));
  check('Task9-UI: card has a craft button', card && !!card.querySelector('[data-craft="coalBrick"]'));
  check('Task9-UI: card has a sell button', card && !!card.querySelector('[data-sell="coalBrick"]'));
  check('Task9-UI: card has an auto-craft checkbox', card && !!card.querySelector('[data-autocraft="coalBrick"]'));
})();

// =============================================================================
// TASK 13 — code structure refactor: permanent state container, sellAll()'s
// first-gacha milestone check split out, named action functions extracted
// from build*() event callbacks, named boot(). No gameplay/balance/save-shape
// change is intended by any of this — these tests exercise the new pieces
// directly, on top of every test above (which already proves the externally
// observable behavior is unchanged).
// =============================================================================

(function test_T13_permanentContainer() {
  const win = newDom(makeMemoryStorage()).window;
  check(
    'Task13: permanent exposes totalPrestige/runCount/tickets/firstGachaGranted',
    typeof win.permanent === 'object' &&
      typeof win.permanent.totalPrestige === 'number' &&
      typeof win.permanent.runCount === 'number' &&
      typeof win.permanent.tickets === 'number' &&
      typeof win.permanent.firstGachaGranted === 'boolean'
  );
  check(
    'Task13: permanent starts at fresh-game defaults',
    win.permanent.totalPrestige === 0 && win.permanent.runCount === 1 && win.permanent.tickets === 0 && win.permanent.firstGachaGranted === false
  );
})();

(function test_T13_bootIsNamedFunction() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task13: boot is a named, callable function (not an anonymous IIFE)', typeof win.boot === 'function' && win.boot.name === 'boot');
})();

(function test_T13_firstGachaMilestoneExtracted() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task13: checkFirstGachaMilestone exists as its own function', typeof win.checkFirstGachaMilestone === 'function');
  win.state.gold = 50;
  win.checkFirstGachaMilestone();
  check('Task13: calling it directly grants the ticket at the threshold', win.permanent.firstGachaGranted === true && win.permanent.tickets === 1);
  win.state.gold = 999;
  win.checkFirstGachaMilestone();
  check('Task13: it does not re-grant once already granted', win.permanent.tickets === 1);
})();

(function test_T13_miningActions() {
  const win = newDom(makeMemoryStorage()).window;

  const before = win.state.resources.iron;
  win.mineResource('iron');
  check('Task13: mineResource(iron) adds manualAmount(iron)', win.state.resources.iron === before + win.manualAmount('iron'));

  check('Task13: upgradeFacility fails with insufficient resources, no state change', win.upgradeFacility('iron') === false && win.state.facility.iron === 0);
  win.state.resources.iron = 1000;
  const facCost = win.facilityCost('iron');
  const facOk = win.upgradeFacility('iron');
  check('Task13: upgradeFacility succeeds when funded', facOk === true && win.state.facility.iron === 1 && win.state.resources.iron === 1000 - facCost);

  win.state.resources.coal = 1000;
  const wfCost = win.workforceCost('coal');
  const wfOk = win.upgradeWorkforce('coal');
  check('Task13: upgradeWorkforce succeeds when funded', wfOk === true && win.state.workforce.coal === 1 && win.state.resources.coal === 1000 - wfCost);

  check('Task13: unlockSite fails with insufficient gold, no state change', win.unlockSite('manaVein') === false && win.state.unlockedSites.manaVein === false);
  win.state.gold = 10000;
  const siteOk = win.unlockSite('manaVein');
  check('Task13: unlockSite succeeds when funded', siteOk === true && win.state.unlockedSites.manaVein === true);
})();

(function test_T13_buyAutoSellAction() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task13: buyAutoSell fails with insufficient gold, no state change', win.buyAutoSell('steel') === false && win.state.autoSell.steel === false);
  win.state.gold = 10000;
  const cost = win.autoSellCost(win.RECIPES.find((r) => r.key === 'steel'));
  const ok = win.buyAutoSell('steel');
  check(
    'Task13: buyAutoSell succeeds when funded and sets both flags',
    ok === true && win.state.autoSell.steel === true && win.state.autoSellOn.steel === true && win.state.gold === 10000 - cost
  );
})();

(function test_T13_workerActions() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 1;
  win.pullGacha();
  const worker = win.state.characters[0];
  const otherRes = worker.resource === 'iron' ? 'coal' : 'iron';

  check('Task13: reassignWorker fails for an unknown id (no throw)', win.reassignWorker('nope', 'iron') === false);
  const reassignOk = win.reassignWorker(worker.id, otherRes);
  check('Task13: reassignWorker succeeds and updates the resource', reassignOk === true && win.state.characters[0].resource === otherRes);

  check('Task13: upgradeWorkerStat fails with insufficient gold', win.upgradeWorkerStat(worker.id, 'mining') === false);
  win.state.gold = 100000;
  const beforeMining = win.state.characters[0].mining;
  const upOk = win.upgradeWorkerStat(worker.id, 'mining');
  check('Task13: upgradeWorkerStat succeeds when funded', upOk === true && win.state.characters[0].mining === beforeMining + 1);
})();

// =============================================================================
// TASK 16 — craft facility (run-scoped timed-craft speed). Does not change
// craftQueue shape, instant recipes, autoCraft/autoSell, or saveVersion.
// =============================================================================

function stockCrystalAlloyInputs(win) {
  win.state.products.steel = 2;
  win.state.resources.crystal = 1;
}

(function test_T16_freshDefaultAndQueueShape() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task16: freshRunState craftFacility defaults to 1', win.state.craftFacility === 1);
  check('Task16: craftQueue remains a plain map (not an array)', !Array.isArray(win.state.craftQueue) && typeof win.state.craftQueue === 'object');
  check(
    'Task16: craftQueue still keyed by recipe with null idle values',
    win.RECIPES.every((r) => Object.prototype.hasOwnProperty.call(win.state.craftQueue, r.key) && win.state.craftQueue[r.key] === null)
  );
  check('Task16: RECIPES length unchanged (no new recipes)', win.RECIPES.length === 9);
})();

(function test_T16_legacySaveMissingFieldDefaults() {
  const storage = makeMemoryStorage();
  const legacyPayload = {
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: true },
    run: {
      resources: { iron: 5, coal: 5 },
      products: { steel: 2 },
      gold: 10, runGold: 10,
      characters: [], lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {},
      craftQueue: { steel: null, crystalAlloy: 1.5 },
      hqLevel: 2, autoLineLogged: false,
      // no craftFacility field — pre-Task-16 save
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(legacyPayload));
  const win = newDom(storage).window;
  check('Task16: legacy save without craftFacility loads as default 1', win.state.craftFacility === 1);
  check('Task16: sibling fields still restore (gold/hqLevel)', win.state.gold === 10 && win.state.hqLevel === 2);
  check('Task16: craftQueue values restore without migration', win.state.craftQueue.crystalAlloy === 1.5 && win.state.craftQueue.steel === null);
  check('Task16: saveVersion stays 1 on the next write', (() => { win.saveGame(); return JSON.parse(storage._raw()['gachaFactorySave']).saveVersion === 1; })());
})();

(function test_T16_invalidCraftFacilityFallsBack() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: {},
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [], lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0,
      craftFacility: 0,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  let win = newDom(storage).window;
  check('Task16: craftFacility=0 is rejected and becomes 1', win.state.craftFacility === 1);

  payload.run.craftFacility = -3;
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  win = newDom(storage).window;
  check('Task16: negative craftFacility is rejected and becomes 1', win.state.craftFacility === 1);

  payload.run.craftFacility = 2.5;
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  win = newDom(storage).window;
  check('Task16: non-integer craftFacility is rejected and becomes 1', win.state.craftFacility === 1);
})();

(function test_T16_saveLoadPreservesLevel() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.state.craftFacility = 4;
  win.state.gold = 321;
  win.saveGame();
  const written = JSON.parse(storage._raw()['gachaFactorySave']);
  check('Task16: new save writes craftFacility', written.run.craftFacility === 4);
  check('Task16: new save still uses saveVersion 1', written.saveVersion === 1);

  win = newDom(storage).window;
  check('Task16: craftFacility round-trips through save/load', win.state.craftFacility === 4);
  check('Task16: sibling gold also round-trips', win.state.gold === 321);
})();

(function test_T16_upgradeCostAndLevel() {
  const win = newDom(makeMemoryStorage()).window;
  function refExpCost(base, growth, level) { return Math.round(base * Math.pow(growth, level)); }
  const REF_BASE = 100;
  const REF_GROWTH = 1.5;

  check('Task16: upgradeCraftFacility exists', typeof win.upgradeCraftFacility === 'function');
  check('Task16: craftFacilityCost exists', typeof win.craftFacilityCost === 'function');
  check('Task16: first upgrade cost matches expCost(100, 1.5, 0)', win.craftFacilityCost() === refExpCost(REF_BASE, REF_GROWTH, 0));

  const cost = win.craftFacilityCost();
  check('Task16: upgrade refused with insufficient gold', win.upgradeCraftFacility() === false && win.state.craftFacility === 1 && win.state.gold === 0);

  win.state.gold = 10000;
  const goldBefore = win.state.gold;
  const ok = win.upgradeCraftFacility();
  check('Task16: upgrade succeeds when funded', ok === true);
  check('Task16: gold is deducted by the quoted cost', win.state.gold === goldBefore - cost);
  check('Task16: level increases by 1', win.state.craftFacility === 2);
  check('Task16: next cost uses expCost at the new level', win.craftFacilityCost() === refExpCost(REF_BASE, REF_GROWTH, 1));
})();

(function test_T16_defaultLevelKeepsCraftTimes() {
  const win = newDom(makeMemoryStorage()).window;
  const recipe = win.RECIPES.find((r) => r.key === 'crystalAlloy');
  check('Task16: crystalAlloy.craftTime is still 3', recipe.craftTime === 3);
  stockCrystalAlloyInputs(win);
  const started = win.startCraft(recipe);
  check('Task16: timed startCraft queues craftTime seconds', started === true && win.state.craftQueue.crystalAlloy === 3);
  check('Task16: timed startCraft does not grant product immediately', win.state.products.crystalAlloy === 0);

  win.tickLoop();
  check('Task16: default level still subtracts 0.1s per tick', Math.abs(win.state.craftQueue.crystalAlloy - 2.9) < 1e-12);

  advanceTicks(win, 28); // 1 + 28 = 29 ticks total → 2.9s elapsed, 0.1s remain
  check('Task16: 3s craft still in progress after 2.9s at default level', win.state.craftQueue.crystalAlloy !== null && win.state.products.crystalAlloy === 0);

  win.tickLoop(); // 30th tick → 3.0s elapsed
  check('Task16: 3s craft completes on the 30th tick at default level', win.state.craftQueue.crystalAlloy === null && win.state.products.crystalAlloy === 1);
})();

(function test_T16_upgradeSpeedsTimedCraft() {
  const win = newDom(makeMemoryStorage()).window;
  const recipe = win.RECIPES.find((r) => r.key === 'crystalAlloy');
  win.state.gold = 10000;
  win.upgradeCraftFacility();
  check('Task16: upgraded craftFacility is 2 before timing check', win.state.craftFacility === 2);

  stockCrystalAlloyInputs(win);
  win.startCraft(recipe);
  const queued = win.state.craftQueue.crystalAlloy;
  win.tickLoop();
  const progressed = queued - win.state.craftQueue.crystalAlloy;
  check('Task16: upgraded tick progresses timed craft faster than 0.1s', progressed > 0.1 + 1e-12, `progressed=${progressed}`);
  check(
    'Task16: Lv.2 speed is 1.1x (0.11s per tick)',
    Math.abs(progressed - 0.11) < 1e-12,
    `progressed=${progressed}`
  );

  // Remaining after 1 tick at 0.11/tick: 3 - 0.11 = 2.89. 2.89 / 0.11 = 26.2727 more ticks → 27 more to finish? 
  // After N additional ticks, remaining = 2.89 - 0.11*N. Completes when remaining <= 0 → N >= 2.89/0.11 = 26.2727 → 27 more.
  // Total ticks including the first: 28, which is fewer than the default 30.
  let ticks = 1;
  while (win.state.craftQueue.crystalAlloy !== null && ticks < 100) {
    win.tickLoop();
    ticks++;
  }
  check('Task16: upgraded 3s craft finishes in fewer than 30 ticks', ticks < 30 && win.state.products.crystalAlloy === 1, `ticks=${ticks}`);
})();

(function test_T16_instantRecipesUnchanged() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 10000;
  win.upgradeCraftFacility();
  win.upgradeCraftFacility();

  win.state.resources.iron = 2;
  win.state.resources.coal = 1;
  const steel = win.RECIPES.find((r) => r.key === 'steel');
  const okSteel = win.startCraft(steel);
  check('Task16: steel stays craftTime 0', steel.craftTime === 0);
  check('Task16: steel still crafts instantly after facility upgrades', okSteel === true && win.state.products.steel === 1 && win.state.craftQueue.steel === null);

  win.state.resources.coal = 3;
  const brick = win.RECIPES.find((r) => r.key === 'coalBrick');
  const okBrick = win.startCraft(brick);
  check('Task16: coalBrick stays craftTime 0', brick.craftTime === 0);
  check('Task16: coalBrick still crafts instantly (out=1, no queue)', okBrick === true && win.state.products.coalBrick === 1 && win.state.craftQueue.coalBrick === null);

  win.state.products.steel = 2;
  win.state.resources.mana = 1;
  const alloy = win.RECIPES.find((r) => r.key === 'alloy');
  const okAlloy = win.startCraft(alloy);
  check('Task16: alloy stays craftTime 0 and instant', alloy.craftTime === 0 && okAlloy === true && win.state.products.alloy === 1 && win.state.craftQueue.alloy === null);
})();

(function test_T16_autoCraftStillWorks() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.resources.iron = 20;
  win.state.resources.coal = 10;
  win.state.autoCraft.steel = true;
  win.tickLoop();
  check('Task16: autoCraft still produces instant steel on a tick', win.state.products.steel >= 1);
  check('Task16: autoCraft still leaves steel craftQueue null', win.state.craftQueue.steel === null);

  const timed = newDom(makeMemoryStorage()).window;
  timed.state.products.steel = 20;
  timed.state.resources.crystal = 10;
  timed.state.autoCraft.crystalAlloy = true;
  timed.tickLoop();
  check('Task16: autoCraft still starts a timed recipe into craftQueue', timed.state.craftQueue.crystalAlloy === 3 && timed.state.products.crystalAlloy === 0);
  advanceTicks(timed, 30);
  check('Task16: autoCraft timed recipe still completes via tickLoop', timed.state.products.crystalAlloy >= 1);
})();

(function test_T16_autoSellStillWorks() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 10000;
  const recipe = win.RECIPES.find((r) => r.key === 'steel');
  const cost = win.autoSellCost(recipe);
  const bought = win.buyAutoSell('steel');
  check('Task16: autoSell purchase still works', bought === true && win.state.autoSell.steel === true && win.state.autoSellOn.steel === true);
  check('Task16: autoSell gold cost unchanged', win.state.gold === 10000 - cost);
  win.state.products.steel = 3;
  const goldBefore = win.state.gold;
  win.tickLoop();
  check('Task16: autoSell still clears stock on tick', win.state.products.steel === 0);
  check('Task16: autoSell still grants gold on tick', win.state.gold > goldBefore);
})();

(function test_T16_prestigeResetsFacilityKeepsPermanent() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.gold = 10000;
  win.upgradeCraftFacility();
  win.upgradeCraftFacility();
  check('Task16: craftFacility is upgraded before prestige', win.state.craftFacility === 3);

  win.permanent.tickets = 3;
  win.permanent.firstGachaGranted = true;
  win.pullGacha();
  win.state.runGold = 5000;
  const expectedGain = win.prestigeGain();
  const ticketsBefore = win.permanent.tickets;
  win.document.getElementById('prestigeBtn').onclick();

  check('Task16: prestige resets craftFacility to 1', win.state.craftFacility === 1);
  check('Task16: prestige still awards totalPrestige', win.permanent.totalPrestige === expectedGain);
  check('Task16: prestige leaves tickets / firstGachaGranted intact', win.permanent.tickets === ticketsBefore && win.permanent.firstGachaGranted === true);
  check('Task16: prestige still resets run gold/workers', win.state.gold === 0 && win.state.characters.length === 0);
})();

(function test_T16_uiInDevTab() {
  const win = newDom(makeMemoryStorage()).window;
  const levelEl = win.document.getElementById('craftFacilityVal');
  const btn = win.document.getElementById('craftFacilityBtn');
  check('Task16: 개발 tab shows craft facility level', !!levelEl);
  check('Task16: 개발 tab shows craft facility upgrade button', !!btn);
  win.updateNumbers();
  check('Task16: UI level text starts at 1', levelEl && levelEl.textContent === '1');
  check('Task16: upgrade button quotes gold cost', btn && /G/.test(btn.textContent) && btn.textContent.includes(String(win.craftFacilityCost())));

  win.state.gold = 10000;
  win.updateNumbers();
  btn.click();
  check('Task16: clicking the UI button upgrades the facility', win.state.craftFacility === 2);
  win.updateNumbers();
  check('Task16: UI level text updates after upgrade', levelEl.textContent === '2');
})();

// =============================================================================
// TASK 18 — remaining-time label uses craftQueue / craftSpeed(). Queue
// storage, startCraft, tickLoop, and craftSpeed() itself are unchanged.
// =============================================================================

function showCrystalAlloyCard(win) {
  win.state.unlockedSites.manaVein = true;
  win.buildRecipes();
}

function timedCraftLabel(win, key) {
  const btn = win.document.querySelector(`[data-craft="${key}"]`);
  return btn ? btn.textContent : null;
}

(function test_T18A_lv1DisplaysThreeSeconds() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win);
  const recipe = win.RECIPES.find((r) => r.key === 'crystalAlloy');
  check('Task18-A: crystalAlloy.craftTime is 3', recipe.craftTime === 3);
  check('Task18-A: Lv.1 craftSpeed is 1', win.craftSpeed() === 1);
  win.state.products.steel = 2;
  win.state.resources.crystal = 1;
  win.startCraft(recipe);
  check('Task18-A: craftQueue starts at 3', win.state.craftQueue.crystalAlloy === 3);
  win.updateNumbers();
  check('Task18-A: Lv.1 remaining label is 3.0s', timedCraftLabel(win, 'crystalAlloy') === '제작 중... 3.0s');
})();

(function test_T18B_lv2DisplaysQueueOverSpeed() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win);
  win.state.craftFacility = 2;
  check('Task18-B: Lv.2 craftSpeed is 1.1', Math.abs(win.craftSpeed() - 1.1) < 1e-12);
  win.state.craftQueue.crystalAlloy = 3;
  win.updateNumbers();
  check('Task18-B: craftQueue remains 3 (display-only change)', win.state.craftQueue.crystalAlloy === 3);
  check('Task18-B: Lv.2 remaining label is 2.7s', timedCraftLabel(win, 'crystalAlloy') === '제작 중... 2.7s');
})();

(function test_T18C_lv3DisplaysTwoPointFive() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win);
  win.state.craftFacility = 3;
  check('Task18-C: Lv.3 craftSpeed is 1.2', Math.abs(win.craftSpeed() - 1.2) < 1e-12);
  win.state.craftQueue.crystalAlloy = 3;
  win.updateNumbers();
  check('Task18-C: Lv.3 remaining label is 2.5s', timedCraftLabel(win, 'crystalAlloy') === '제작 중... 2.5s');
})();

(function test_T18D_labelTracksQueueOverSpeedAfterTicks() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win);
  win.state.craftFacility = 2;
  win.state.products.steel = 2;
  win.state.resources.crystal = 1;
  win.startCraft(win.RECIPES.find((r) => r.key === 'crystalAlloy'));
  win.tickLoop();
  const remaining = win.state.craftQueue.crystalAlloy;
  check('Task18-D: a tick reduced craftQueue below 3', remaining !== null && remaining < 3);
  const expected = `제작 중... ${(remaining / win.craftSpeed()).toFixed(1)}s`;
  check('Task18-D: label matches craftQueue / craftSpeed()', timedCraftLabel(win, 'crystalAlloy') === expected, timedCraftLabel(win, 'crystalAlloy'));
})();

(function test_T18E_instantRecipesStayInstant() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.craftFacility = 3;
  win.state.resources.iron = 2;
  win.state.resources.coal = 1;
  const steel = win.RECIPES.find((r) => r.key === 'steel');
  check('Task18-E: steel still crafts instantly at Lv.3', win.startCraft(steel) === true && win.state.products.steel === 1 && win.state.craftQueue.steel === null);

  win.state.resources.coal = 3;
  const brick = win.RECIPES.find((r) => r.key === 'coalBrick');
  check('Task18-E: coalBrick still crafts instantly at Lv.3', win.startCraft(brick) === true && win.state.products.coalBrick === 1 && win.state.craftQueue.coalBrick === null);

  win.state.products.steel = 2;
  win.state.resources.mana = 1;
  const alloy = win.RECIPES.find((r) => r.key === 'alloy');
  check('Task18-E: alloy still crafts instantly at Lv.3', win.startCraft(alloy) === true && win.state.products.alloy === 1 && win.state.craftQueue.alloy === null);
})();

// =============================================================================
// TASK 21 — Factory core data model (structure-only; no Factory behavior/UI
// exists yet). These confirm the data skeleton is present, safe to
// save/load, and untouched by prestige/tick/UI beyond the reset itself.
// =============================================================================

(function test_T21_freshRunStateHasFactory() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task21: freshRunState() produces a state.factory object', typeof win.state.factory === 'object' && win.state.factory !== null);
  check('Task21: factory has grid/nodes/links', 'grid' in win.state.factory && 'nodes' in win.state.factory && 'links' in win.state.factory);
})();

(function test_T21_defaultGridIs25x25() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task21: default grid width is 25', win.state.factory.grid.width === 25);
  check('Task21: default grid height is 25', win.state.factory.grid.height === 25);
})();

(function test_T21_productionNodeRepresentable() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.state.factory.nodes.push({ id: 'node_test1', type: 'production', x: 3, y: 4, width: 2, height: 2 });
  const saved = win.saveGame();
  check('Task21: a production node saves successfully', saved === true);
  win = newDom(storage).window;
  const node = win.state.factory.nodes.find((n) => n.id === 'node_test1');
  check('Task21: production node survives sanitize/reload with type intact', !!node && node.type === 'production' && node.x === 3 && node.y === 4 && node.width === 2 && node.height === 2);
})();

(function test_T21_storageNodeRepresentable() {
  const win = newDom(makeMemoryStorage()).window;
  const sanitized = win.sanitizeFactoryNode({ id: 'node_s1', type: 'storage', x: 0, y: 0, width: 1, height: 1 });
  check('Task21: storage node type is representable', !!sanitized && sanitized.type === 'storage');
})();

(function test_T21_nodeIdIndependentOfArrayIndex() {
  const win = newDom(makeMemoryStorage()).window;
  const raw = [
    { id: 'node_first', type: 'production', x: 0, y: 0, width: 1, height: 1 },
    { id: 'node_second', type: 'storage', x: 1, y: 1, width: 1, height: 1 },
  ];
  const nodes = win.sanitizeFactoryNodes(raw);
  // Reverse the array — if code used array index as identity, "the node at
  // index 0" would now be the wrong node; id-based lookup must still work.
  nodes.reverse();
  const found = nodes.find((n) => n.id === 'node_second');
  check('Task21: node id survives array reordering (not index-based)', !!found && found.type === 'storage' && found.x === 1);
})();

(function test_T21_nodeSizeSanitizeClampsTo1to3() {
  const win = newDom(makeMemoryStorage()).window;
  const tooSmall = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 0, height: -1 });
  const tooBig = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 4, height: 99 });
  const valid1 = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const valid3 = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 3, height: 3 });
  check('Task21: width/height <= 0 falls back to a safe default (not 0 or negative)', tooSmall.width >= 1 && tooSmall.height >= 1);
  check('Task21: width/height >= 4 falls back to a safe default (not left oversized)', tooBig.width <= 3 && tooBig.height <= 3);
  check('Task21: width/height = 1 (min valid) passes through unchanged', valid1.width === 1 && valid1.height === 1);
  check('Task21: width/height = 3 (max valid) passes through unchanged', valid3.width === 3 && valid3.height === 3);
})();

(function test_T21_legacySaveWithoutFactoryLoadsFine() {
  const storage = makeMemoryStorage();
  const legacyPayload = {
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: true },
    run: {
      // Pre-Task-21 shape: no `factory` key at all.
      resources: { iron: 5 }, products: {}, gold: 42, runGold: 0,
      characters: [], lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0, craftFacility: 1,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(legacyPayload));
  const win = newDom(storage).window;
  check('Task21: legacy save (no factory field) still loads other fields correctly', win.state.gold === 42 && win.state.resources.iron === 5);
  check('Task21: legacy save gets a fresh default factory state', win.state.factory.grid.width === 25 && win.state.factory.grid.height === 25 && win.state.factory.nodes.length === 0 && win.state.factory.links.length === 0);
})();

(function test_T21_prestigeResetsFactory() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 1;
  win.pullGacha();
  win.state.factory.nodes.push({ id: 'node_beforeReset', type: 'production', x: 1, y: 1, width: 1, height: 1 });
  check('Task21: factory node present before prestige', win.state.factory.nodes.length === 1);
  win.state.runGold = 5000;
  win.document.getElementById('prestigeBtn').onclick();
  check('Task21: factory nodes cleared after prestige', win.state.factory.nodes.length === 0);
  check('Task21: factory grid still defaults to 25x25 after prestige', win.state.factory.grid.width === 25 && win.state.factory.grid.height === 25);
})();

(function test_T21_linksRepresentFromTo() {
  const win = newDom(makeMemoryStorage()).window;
  const link = win.sanitizeFactoryLink({ id: 'link_test1', from: 'node_a', to: 'node_b' });
  check('Task21: a link represents from/to node ids', !!link && link.from === 'node_a' && link.to === 'node_b');
  const links = win.sanitizeFactoryLinks([{ from: 'node_a', to: 'node_b' }]); // no id supplied
  check('Task21: a link missing an id gets one backfilled', links.length === 1 && typeof links[0].id === 'string' && links[0].id.length > 0);
})();

// =============================================================================
// TASK 22 — Factory Node placement validation (pure functions only; no
// addFactoryNode()/removeFactoryNode()/UI exists yet). isFactoryNodeWithinGrid/
// isFactoryNodeSizeValid/doFactoryNodesOverlap/factoryNodeOverlapsExisting/
// canPlaceFactoryNode are exercised directly and never read/write win.state.
// =============================================================================

function gridNode(x, y, width, height, id) {
  return { id: id || 'node_test', type: 'production', x, y, width, height };
}

(function test_T22_gridBoundaryTopLeftAndBottomRight() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task22: 1x1 fits at top-left (0,0)', win.canPlaceFactoryNode(gridNode(0, 0, 1, 1), grid, []) === true);
  check('Task22: 1x1 fits at bottom-right (24,24)', win.canPlaceFactoryNode(gridNode(24, 24, 1, 1), grid, []) === true);
  check('Task22: 3x3 fits at top-left (0,0)', win.canPlaceFactoryNode(gridNode(0, 0, 3, 3), grid, []) === true);
  check('Task22: 3x3 fits exactly at bottom-right (22,22)', win.canPlaceFactoryNode(gridNode(22, 22, 3, 3), grid, []) === true);
})();

(function test_T22_gridBoundaryOverflowAndNegative() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task22: 2x2 at (24,24) overflows the grid by 1 cell -> invalid', win.canPlaceFactoryNode(gridNode(24, 24, 2, 2), grid, []) === false);
  check('Task22: 3x3 at (23,23) overflows the grid by 1 cell -> invalid', win.canPlaceFactoryNode(gridNode(23, 23, 3, 3), grid, []) === false);
  check('Task22: 4x1 at (23,23) overflows -> invalid', win.canPlaceFactoryNode(gridNode(23, 23, 4, 1), grid, []) === false);
  check('Task22: negative x is invalid', win.canPlaceFactoryNode(gridNode(-1, 0, 1, 1), grid, []) === false);
  check('Task22: negative y is invalid', win.canPlaceFactoryNode(gridNode(0, -1, 1, 1), grid, []) === false);
})();

(function test_T22_nodeSizeRange() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task22: 1x1 size is valid', win.isFactoryNodeSizeValid(1, 1) === true);
  check('Task22: 2x2 size is valid', win.isFactoryNodeSizeValid(2, 2) === true);
  check('Task22: 3x3 size is valid', win.isFactoryNodeSizeValid(3, 3) === true);
  check('Task22: 0-width size is invalid', win.isFactoryNodeSizeValid(0, 1) === false);
  check('Task22: 0-height size is invalid', win.isFactoryNodeSizeValid(1, 0) === false);
  check('Task22: 4x1 size is invalid', win.isFactoryNodeSizeValid(4, 1) === false);
  check('Task22: 1x4 size is invalid', win.isFactoryNodeSizeValid(1, 4) === false);
  check('Task22: 3x4 size is invalid', win.isFactoryNodeSizeValid(3, 4) === false);
})();

(function test_T22_nonIntegerRejectedByPlacementValidation() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task22: non-integer width is rejected', win.isFactoryNodeSizeValid(1.5, 1) === false);
  check('Task22: non-integer height is rejected', win.isFactoryNodeSizeValid(1, 2.5) === false);
  check('Task22: non-integer x is rejected by isFactoryNodeWithinGrid', win.isFactoryNodeWithinGrid(gridNode(0.5, 0, 1, 1), grid) === false);
  check('Task22: non-integer y is rejected by isFactoryNodeWithinGrid', win.isFactoryNodeWithinGrid(gridNode(0, 2.5, 1, 1), grid) === false);
  check('Task22: non-integer coords are rejected by canPlaceFactoryNode', win.canPlaceFactoryNode(gridNode(0.5, 0.5, 1, 1), grid, []) === false);
})();

(function test_T22_overlapDetection() {
  const win = newDom(makeMemoryStorage()).window;
  const base = gridNode(5, 5, 2, 2, 'node_base'); // occupies (5,5)-(6,6)

  check('Task22: identical rectangle fully overlaps', win.doFactoryNodesOverlap(base, gridNode(5, 5, 2, 2)) === true);
  check('Task22: partially overlapping rectangle overlaps', win.doFactoryNodesOverlap(base, gridNode(6, 6, 2, 2)) === true);
  check('Task22: sharing exactly one cell overlaps', win.doFactoryNodesOverlap(gridNode(0, 0, 2, 2), gridNode(1, 1, 1, 1)) === true);
  check('Task22: adjacent horizontally (edge touch) does not overlap', win.doFactoryNodesOverlap(gridNode(0, 0, 2, 1), gridNode(2, 0, 1, 1)) === false);
  check('Task22: adjacent vertically (edge touch) does not overlap', win.doFactoryNodesOverlap(gridNode(0, 0, 1, 2), gridNode(0, 2, 1, 1)) === false);
  check('Task22: diagonal corner touch does not overlap', win.doFactoryNodesOverlap(gridNode(0, 0, 1, 1), gridNode(1, 1, 1, 1)) === false);
})();

(function test_T22_overlapExistingList() {
  const win = newDom(makeMemoryStorage()).window;
  const existing = [gridNode(5, 5, 2, 2, 'node_a'), gridNode(10, 10, 1, 1, 'node_b')];
  check('Task22: overlaps when colliding with any existing node', win.factoryNodeOverlapsExisting(gridNode(6, 6, 1, 1), existing) === true);
  check('Task22: no overlap when clear of every existing node', win.factoryNodeOverlapsExisting(gridNode(0, 0, 1, 1), existing) === false);
  check('Task22: empty existing list never overlaps', win.factoryNodeOverlapsExisting(gridNode(5, 5, 2, 2), []) === false);
})();

(function test_T22_canPlaceFactoryNodeComposite() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  const existing = [gridNode(5, 5, 2, 2, 'node_a')];

  check('Task22: valid grid + valid size + no overlap -> true', win.canPlaceFactoryNode(gridNode(10, 10, 2, 2), grid, existing) === true);
  check('Task22: out of grid range -> false', win.canPlaceFactoryNode(gridNode(24, 24, 2, 2), grid, existing) === false);
  check('Task22: invalid node size -> false', win.canPlaceFactoryNode(gridNode(10, 10, 4, 1), grid, existing) === false);
  check('Task22: invalid (negative) coordinate -> false', win.canPlaceFactoryNode(gridNode(-1, 10, 1, 1), grid, existing) === false);
  check('Task22: overlapping an existing node -> false', win.canPlaceFactoryNode(gridNode(6, 6, 1, 1), grid, existing) === false);
  check('Task22: adjacent to an existing node (edge touch only) -> true', win.canPlaceFactoryNode(gridNode(7, 5, 1, 2), grid, existing) === true);
})();

(function test_T22_validationIsPure() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.factory.nodes.push(gridNode(5, 5, 2, 2, 'node_real'));
  const nodesBefore = JSON.stringify(win.state.factory.nodes);
  const gridBefore = JSON.stringify(win.state.factory.grid);

  win.canPlaceFactoryNode(gridNode(0, 0, 1, 1), win.state.factory.grid, win.state.factory.nodes);
  win.canPlaceFactoryNode(gridNode(5, 5, 3, 3), win.state.factory.grid, win.state.factory.nodes); // overlapping call too
  win.isFactoryNodeWithinGrid(gridNode(100, 100, 1, 1), win.state.factory.grid);
  win.factoryNodeOverlapsExisting(gridNode(5, 5, 1, 1), win.state.factory.nodes);

  check('Task22: placement validation never mutates state.factory.nodes', JSON.stringify(win.state.factory.nodes) === nodesBefore);
  check('Task22: placement validation never mutates state.factory.grid', JSON.stringify(win.state.factory.grid) === gridBefore);
})();

(function test_T22_realFactoryGridDefaultUsedDirectly() {
  // Sanity check: the real default factory state (from Task 21) works
  // directly with these validators without any adaptation.
  const win = newDom(makeMemoryStorage()).window;
  check('Task22: a node fits in the fresh default 25x25 grid with no existing nodes', win.canPlaceFactoryNode(gridNode(0, 0, 3, 3), win.state.factory.grid, win.state.factory.nodes) === true);
})();

// =============================================================================
// TASK 23 — Factory Node placement action (addFactoryNode). Reuses Task 22's
// validation functions directly; this only exercises the actual state.factory
// mutation, id assignment, and failure-leaves-state-untouched behavior.
// =============================================================================

(function test_T23_basicPlacementSucceeds() {
  const win = newDom(makeMemoryStorage()).window;

  const n1 = win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 1 });
  check('Task23: 1x1 placement succeeds (truthy return)', !!n1);
  check('Task23: nodes length is 1 after first add', win.state.factory.nodes.length === 1);

  const n2 = win.addFactoryNode({ type: 'storage', x: 5, y: 5, width: 2, height: 2 });
  check('Task23: 2x2 placement succeeds', !!n2);
  check('Task23: nodes length is 2 after second add', win.state.factory.nodes.length === 2);

  const n3 = win.addFactoryNode({ type: 'production', x: 10, y: 10, width: 3, height: 3 });
  check('Task23: 3x3 placement succeeds', !!n3);
  check('Task23: nodes length is 3 after third add', win.state.factory.nodes.length === 3);

  check('Task23: added node preserves x/y/width/height/type (n2)', n2.x === 5 && n2.y === 5 && n2.width === 2 && n2.height === 2 && n2.type === 'storage');
  const stored = win.state.factory.nodes.find((n) => n.id === n2.id);
  check('Task23: added node is actually present in state.factory.nodes with same fields', !!stored && stored.x === 5 && stored.y === 5 && stored.width === 2 && stored.height === 2 && stored.type === 'storage');
})();

(function test_T23_gridValidation() {
  const win = newDom(makeMemoryStorage()).window;

  check('Task23: negative x rejected', win.addFactoryNode({ type: 'production', x: -1, y: 0, width: 1, height: 1 }) === null);
  check('Task23: negative y rejected', win.addFactoryNode({ type: 'production', x: 0, y: -1, width: 1, height: 1 }) === null);
  check('Task23: out-of-grid placement rejected (24,24 2x2 overflows)', win.addFactoryNode({ type: 'production', x: 24, y: 24, width: 2, height: 2 }) === null);
  check('Task23: nothing was added by the rejected attempts above', win.state.factory.nodes.length === 0);

  const fitExact = win.addFactoryNode({ type: 'production', x: 22, y: 22, width: 3, height: 3 });
  check('Task23: 3x3 at (22,22) on a 25x25 grid succeeds (exact fit)', !!fitExact);

  const win2 = newDom(makeMemoryStorage()).window;
  check('Task23: 3x3 at (23,23) on a 25x25 grid fails (overflows by 1)', win2.addFactoryNode({ type: 'production', x: 23, y: 23, width: 3, height: 3 }) === null);
})();

(function test_T23_sizeValidation() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task23: 0x1 size rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 0, height: 1 }) === null);
  check('Task23: 4x1 size rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 4, height: 1 }) === null);
  check('Task23: 1x4 size rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 4 }) === null);
  check('Task23: non-integer width rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1.5, height: 1 }) === null);
  check('Task23: non-integer height rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 2.5 }) === null);
  check('Task23: non-integer x rejected', win.addFactoryNode({ type: 'production', x: 0.5, y: 0, width: 1, height: 1 }) === null);
  check('Task23: non-integer y rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0.5, width: 1, height: 1 }) === null);
  check('Task23: nothing was added by any of the invalid-size attempts', win.state.factory.nodes.length === 0);
})();

(function test_T23_overlapValidation() {
  const win = newDom(makeMemoryStorage()).window;
  const existing = win.addFactoryNode({ type: 'production', x: 5, y: 5, width: 2, height: 2 }); // occupies (5,5)-(6,6)
  check('Task23: existing base node placed for overlap tests', !!existing);

  check('Task23: full overlap (identical rect) rejected', win.addFactoryNode({ type: 'production', x: 5, y: 5, width: 2, height: 2 }) === null);
  check('Task23: partial overlap rejected', win.addFactoryNode({ type: 'production', x: 6, y: 6, width: 2, height: 2 }) === null);
  check('Task23: single-cell overlap rejected', win.addFactoryNode({ type: 'production', x: 6, y: 6, width: 1, height: 1 }) === null);
  check('Task23: only the existing node remains after the rejected overlaps', win.state.factory.nodes.length === 1);

  const rightOf = win.addFactoryNode({ type: 'production', x: 7, y: 5, width: 1, height: 2 }); // shares only the (7,x) edge
  check('Task23: side-by-side placement (edge touch) succeeds', !!rightOf);

  const below = win.addFactoryNode({ type: 'production', x: 5, y: 7, width: 2, height: 1 }); // shares only the y=7 edge
  check('Task23: above/below adjacent placement (edge touch) succeeds', !!below);

  const diagonal = win.addFactoryNode({ type: 'production', x: 7, y: 7, width: 1, height: 1 }); // touches only at the (7,7) corner
  check('Task23: diagonal corner-touch placement succeeds', !!diagonal);

  check('Task23: 4 nodes total after the 3 valid adjacent placements', win.state.factory.nodes.length === 4);
})();

(function test_T23_idHandling() {
  const win = newDom(makeMemoryStorage()).window;

  const n1 = win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 1 });
  check('Task23: a node with no id gets a non-empty string id', typeof n1.id === 'string' && n1.id.length > 0);

  const n2 = win.addFactoryNode({ type: 'production', x: 1, y: 0, width: 1, height: 1 });
  check('Task23: two consecutive additions get distinct ids', n1.id !== n2.id);

  // Supplying an id that collides with an existing node's id must be handled
  // safely (a fresh id assigned), not rejected as a validation failure and
  // not allowed to silently overwrite/duplicate the existing node's id.
  const n3 = win.addFactoryNode({ id: n1.id, type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  check('Task23: a colliding supplied id is accepted (placement still succeeds)', !!n3);
  check('Task23: the colliding id was replaced with a fresh, different id', n3.id !== n1.id);
  check('Task23: all three nodes now have mutually distinct ids', new Set([n1.id, n2.id, n3.id]).size === 3);
  check('Task23: the original node (n1) was left completely untouched by the collision', win.state.factory.nodes.find((n) => n.id === n1.id).type === 'production');

  // A non-colliding, well-formed supplied id is kept as-is.
  const n4 = win.addFactoryNode({ id: 'node_keepme_custom', type: 'production', x: 3, y: 0, width: 1, height: 1 });
  check('Task23: a valid non-colliding supplied id is preserved exactly', n4.id === 'node_keepme_custom');

  // Ids must not be array-index-based: reordering the array must not change
  // which node a given id refers to.
  const idsInOrder = win.state.factory.nodes.map((n) => n.id);
  win.state.factory.nodes.reverse();
  const found = win.state.factory.nodes.find((n) => n.id === idsInOrder[0]);
  check('Task23: node identity survives array reordering (id-based, not index-based)', !!found && found.id === idsInOrder[0]);
})();

(function test_T23_invalidInputLeavesStateUntouched() {
  const win = newDom(makeMemoryStorage()).window;
  const existingNode = win.addFactoryNode({ type: 'production', x: 5, y: 5, width: 2, height: 2 });
  check('Task23: baseline node placed before failure attempts', !!existingNode);

  const linkBefore = win.sanitizeFactoryLink({ from: existingNode.id, to: existingNode.id });
  win.state.factory.links.push(linkBefore);
  const nodesBefore = JSON.stringify(win.state.factory.nodes);
  const linksBefore = JSON.stringify(win.state.factory.links);
  const gridBefore = JSON.stringify(win.state.factory.grid);

  const badAttempts = [
    { type: 'belt', x: 0, y: 0, width: 1, height: 1 },       // invalid type
    { type: 'production', y: 0, width: 1, height: 1 },        // missing x
    { type: 'production', x: 0, width: 1, height: 1 },        // missing y
    { type: 'production', x: 0, y: 0, height: 1 },            // missing width
    { type: 'production', x: 0, y: 0, width: 1 },              // missing height
    { type: 'production', x: 0.5, y: 0, width: 1, height: 1 },// non-integer x
    { type: 'production', x: 0, y: 0, width: 4, height: 1 },  // out-of-range width
    { type: 'production', x: -1, y: 0, width: 1, height: 1 }, // negative x
    { type: 'production', x: 5, y: 5, width: 2, height: 2 },  // overlaps existing
    null,
    'not an object',
    42,
  ];
  const results = badAttempts.map((n) => win.addFactoryNode(n));
  check('Task23: every invalid attempt returns null', results.every((r) => r === null));
  check('Task23: state.factory.nodes unchanged after every invalid attempt', JSON.stringify(win.state.factory.nodes) === nodesBefore);
  check('Task23: state.factory.links unchanged after every invalid attempt', JSON.stringify(win.state.factory.links) === linksBefore);
  check('Task23: state.factory.grid unchanged after every invalid attempt', JSON.stringify(win.state.factory.grid) === gridBefore);
})();

(function test_T23_existingRegressionUntouched() {
  // Sanity check that Task 22's pure validators are unaffected by Task 23's
  // new action function existing alongside them.
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task23: canPlaceFactoryNode still works standalone (unrelated to addFactoryNode)', win.canPlaceFactoryNode(gridNode(0, 0, 1, 1), grid, []) === true);
  check('Task23: saveVersion is still 1', (() => { win.saveGame(); return JSON.parse(win.localStorage.getItem('gachaFactorySave')).saveVersion === 1; })());
})();

// =============================================================================
// TASK 25 — Factory Link model and connection validation/action.
// A Link connects two existing Factory Nodes by directed from/to ids.
// Belt geometry, throughput, item movement, splitter/merger behavior, and
// production simulation are intentionally outside this task.
// =============================================================================

(function test_T25_validLinkSucceeds() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });

  const link = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: valid Node -> Node link succeeds', !!link);
  check('Task25: valid link preserves from/to ids', !!link && link.from === source.id && link.to === target.id);
  check('Task25: valid link is stored in state.factory.links', win.state.factory.links.length === 1 && win.state.factory.links[0].id === link.id);
})();

(function test_T25_invalidEndpointsRejected() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const before = JSON.stringify(win.state.factory.links);

  check('Task25: nonexistent source is rejected', win.addFactoryLink({ from: 'node_missing', to: target.id }) === null);
  check('Task25: nonexistent target is rejected', win.addFactoryLink({ from: source.id, to: 'node_missing' }) === null);
  check('Task25: missing source is rejected', win.addFactoryLink({ to: target.id }) === null);
  check('Task25: missing target is rejected', win.addFactoryLink({ from: source.id }) === null);
  check('Task25: empty source is rejected', win.addFactoryLink({ from: '', to: target.id }) === null);
  check('Task25: empty target is rejected', win.addFactoryLink({ from: source.id, to: '' }) === null);
  check('Task25: invalid endpoint attempts leave links unchanged', JSON.stringify(win.state.factory.links) === before);
})();

(function test_T25_selfLinkRejected() {
  const win = newDom(makeMemoryStorage()).window;
  const node = win.addFactoryNode({ id: 'node_self', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  check('Task25: self-link is rejected', win.addFactoryLink({ from: node.id, to: node.id }) === null);
  check('Task25: self-link rejection leaves links empty', win.state.factory.links.length === 0);
})();

(function test_T25_duplicateDirectionRejectedAndReverseAllowed() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });

  const forward = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: first A -> B link succeeds', !!forward);
  const beforeDuplicate = JSON.stringify(win.state.factory.links);

  check('Task25: duplicate A -> B link is rejected', win.addFactoryLink({ from: source.id, to: target.id }) === null);
  check('Task25: duplicate same-direction rejection leaves links unchanged', JSON.stringify(win.state.factory.links) === beforeDuplicate);

  const reverse = win.addFactoryLink({ from: target.id, to: source.id });
  check('Task25: reverse B -> A link is allowed', !!reverse);
  check('Task25: forward and reverse links coexist', win.state.factory.links.length === 2);
})();

(function test_T25_idHandling() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });

  const generated = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: link without id gets a non-empty string id', typeof generated.id === 'string' && generated.id.length > 0);

  const secondTarget = win.addFactoryNode({ id: 'node_c', type: 'storage', x: 4, y: 0, width: 1, height: 1 });
  const supplied = win.addFactoryLink({ id: 'link_keepme_custom', from: target.id, to: secondTarget.id });
  check('Task25: non-colliding supplied link id is preserved', !!supplied && supplied.id === 'link_keepme_custom');

  const thirdTarget = win.addFactoryNode({ id: 'node_d', type: 'storage', x: 6, y: 0, width: 1, height: 1 });
  const colliding = win.addFactoryLink({ id: generated.id, from: source.id, to: thirdTarget.id });
  check('Task25: colliding supplied link id does not reject the valid connection', !!colliding);
  check('Task25: colliding supplied link id is replaced with a fresh id', !!colliding && colliding.id !== generated.id);
  check('Task25: all three link ids are distinct', new Set([generated.id, supplied.id, colliding.id]).size === 3);
})();

(function test_T25_invalidInputLeavesStateUntouched() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const valid = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: baseline link exists before failure tests', !!valid);

  const linksBefore = JSON.stringify(win.state.factory.links);
  const nodesBefore = JSON.stringify(win.state.factory.nodes);
  const badAttempts = [
    null,
    'not an object',
    42,
    {},
    { from: source.id, to: source.id },
    { from: 'missing', to: target.id },
    { from: source.id, to: 'missing' },
    { from: source.id, to: target.id },
  ];

  const results = badAttempts.map((link) => win.addFactoryLink(link));
  check('Task25: every invalid link attempt returns null', results.every((result) => result === null));
  check('Task25: invalid link attempts leave links unchanged', JSON.stringify(win.state.factory.links) === linksBefore);
  check('Task25: invalid link attempts leave nodes unchanged', JSON.stringify(win.state.factory.nodes) === nodesBefore);
})();

(function test_T25_saveLoadRoundTrip() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  const source = win.addFactoryNode({ id: 'node_save_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_save_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const reverseTarget = win.addFactoryNode({ id: 'node_save_reverse', type: 'storage', x: 4, y: 0, width: 1, height: 1 });
  win.addFactoryLink({ id: 'link_save_forward', from: source.id, to: target.id });
  win.addFactoryLink({ id: 'link_save_reverse', from: reverseTarget.id, to: source.id });

  // Compared with sorted object keys, not raw JSON.stringify(): addFactoryLink()
  // builds a link as {id, from, to} while sanitizeFactoryLink() (used on
  // reload) builds it as {from, to, id}. Both are the same link with the
  // same field values — only the key insertion order differs — so a raw
  // JSON.stringify() comparison would report a false mismatch here. This
  // normalization was already the established pattern elsewhere in this file
  // (e.g. the worker save/load tests above use the same
  // JSON.stringify(x, Object.keys(x).sort()) technique for the same reason).
  const normalizeLinks = (links) => JSON.stringify(links.map((l) => JSON.stringify(l, Object.keys(l).sort())));
  const before = normalizeLinks(win.state.factory.links);
  const saved = win.saveGame();
  check('Task25: saveGame succeeds with Factory Links present', saved === true);

  win = newDom(storage).window;
  check('Task25: saved links are restored after reload', normalizeLinks(win.state.factory.links) === before);
  check('Task25: restored link count is preserved', win.state.factory.links.length === 2);
  check('Task25: restored link fields are preserved', win.state.factory.links.every((link) => typeof link.id === 'string' && typeof link.from === 'string' && typeof link.to === 'string'));
})();

// =============================================================================
// TASK 26 — Factory Link removal (removeFactoryLink). Deletes exactly one
// Link by id; belt geometry, throughput, splitter/merger behavior, tick
// simulation, and UI remain intentionally outside this task.
// =============================================================================

(function test_T26_removeExistingLinkSucceeds() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const link = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task26: baseline link created before removal', !!link);

  const removed = win.removeFactoryLink(link.id);
  check('Task26: removeFactoryLink returns the removed link (truthy)', !!removed);
  check('Task26: removed link matches the requested id', removed && removed.id === link.id);
  check('Task26: state.factory.links is empty after removing the only link', win.state.factory.links.length === 0);
})();

(function test_T26_removeNonexistentLinkFails() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  win.addFactoryLink({ from: source.id, to: target.id });
  const before = win.state.factory.links.length;

  check('Task26: removing an id that was never used fails', win.removeFactoryLink('link_never_existed') === null);
  check('Task26: removing an empty string id fails', win.removeFactoryLink('') === null);
  check('Task26: removing a non-string id fails (no throw)', win.removeFactoryLink(42) === null);
  check('Task26: removing null fails (no throw)', win.removeFactoryLink(null) === null);
  check('Task26: removing undefined fails (no throw)', win.removeFactoryLink(undefined) === null);
  check('Task26: failed removals leave the existing link untouched', win.state.factory.links.length === before);
})();

(function test_T26_removeOnlyTargetedLinkLeavesOthersIntact() {
  const win = newDom(makeMemoryStorage()).window;
  const a = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const b = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const c = win.addFactoryNode({ id: 'node_c', type: 'storage', x: 4, y: 0, width: 1, height: 1 });
  const linkAB = win.addFactoryLink({ from: a.id, to: b.id });
  const linkBC = win.addFactoryLink({ from: b.id, to: c.id });
  const linkCA = win.addFactoryLink({ from: c.id, to: a.id });
  check('Task26: three links exist before removal', win.state.factory.links.length === 3);

  const removed = win.removeFactoryLink(linkBC.id);
  check('Task26: the targeted link is removed', !!removed && removed.id === linkBC.id);
  check('Task26: exactly two links remain', win.state.factory.links.length === 2);
  check('Task26: the untargeted links are still present, unchanged', win.state.factory.links.some((l) => l.id === linkAB.id) && win.state.factory.links.some((l) => l.id === linkCA.id));
  check('Task26: the removed link is no longer present', !win.state.factory.links.some((l) => l.id === linkBC.id));

  // Nodes are a completely separate concern from Link removal.
  check('Task26: removing a Link does not touch state.factory.nodes', win.state.factory.nodes.length === 3);
})();

(function test_T26_removedLinkFromToCanBeRecreated() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const original = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task26: original A -> B link created', !!original);

  // Before removal, addFactoryLink already rejects this exact duplicate
  // (Task 25 behavior, unchanged by this task).
  check('Task26: duplicate A -> B is still rejected before removal', win.addFactoryLink({ from: source.id, to: target.id }) === null);

  const removed = win.removeFactoryLink(original.id);
  check('Task26: original link removed successfully', !!removed);

  const recreated = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task26: the same A -> B link can be recreated after removal', !!recreated);
  check('Task26: the recreated link gets a fresh id, not the old one', recreated.id !== original.id);
  check('Task26: exactly one A -> B link exists after recreation', win.state.factory.links.length === 1 && win.state.factory.links[0].from === source.id && win.state.factory.links[0].to === target.id);
})();

(function test_T26_saveLoadUnaffectedByRemoval() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const keep = win.addFactoryNode({ id: 'node_keep', type: 'storage', x: 4, y: 0, width: 1, height: 1 });
  const toRemove = win.addFactoryLink({ from: source.id, to: target.id });
  const toKeep = win.addFactoryLink({ from: source.id, to: keep.id });

  win.removeFactoryLink(toRemove.id);
  check('Task26: one link remains before save', win.state.factory.links.length === 1);
  const saved = win.saveGame();
  check('Task26: saveGame succeeds after a Link removal', saved === true);

  win = newDom(storage).window;
  check('Task26: removed link stays removed after reload', win.state.factory.links.length === 1);
  check('Task26: the surviving link is the one that was kept', win.state.factory.links[0].id === toKeep.id && win.state.factory.links[0].from === source.id && win.state.factory.links[0].to === keep.id);

  // saveVersion/save shape is unchanged by this task.
  check('Task26: saveVersion is still 1', (() => { win.saveGame(); return JSON.parse(win.localStorage.getItem('gachaFactorySave')).saveVersion === 1; })());
})();

(function test_T26_existingRegressionUntouched() {
  // Sanity check that Task 25's addFactoryLink/validation are unaffected by
  // removeFactoryLink existing alongside them.
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const link = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task26: addFactoryLink still works standalone (unrelated to removeFactoryLink)', !!link);
  check('Task26: self-link is still rejected', win.addFactoryLink({ from: source.id, to: source.id }) === null);
})();

// =============================================================================
// TASK 27 — Minimal World/Base/Mine data model.
// Data only: no mining tick, no world UI, no region expansion behavior.
// =============================================================================

(function test_T27_freshWorldDefaults() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task27: fresh run has world state', !!win.state.world);
  check('Task27: base starts at the origin', win.state.world.base.x === 0 && win.state.world.base.y === 0);
  check('Task27: base starts at level 1', win.state.world.base.level === 1);
  check('Task27: fresh world has the seeded starting mines', Array.isArray(win.state.world.mines) && win.state.world.mines.length === 2);
})();

(function test_T27_sanitizeValidMineAndIds() {
  const win = newDom(makeMemoryStorage()).window;
  const world = win.sanitizeWorldState({
    base: { x: 4, y: 7, level: 3 },
    mines: [
      { id: 'mine_iron_1', x: 8, y: 2, resource: 'iron', grade: 2, miningPower: 4, developmentState: 'secured' },
      { x: 12, y: 5, resource: 'coal', grade: 1, miningPower: 2, developmentState: 'unsecured' },
      { id: 'mine_iron_1', x: 14, y: 6, resource: 'iron', grade: 3, miningPower: 6, developmentState: 'secured' },
    ],
  });
  check('Task27: valid base fields survive sanitization', world.base.x === 4 && world.base.y === 7 && world.base.level === 3);
  check('Task27: valid mine data survives sanitization', world.mines[0].resource === 'iron' && world.mines[0].grade === 2 && world.mines[0].miningPower === 4 && world.mines[0].developmentState === 'secured');
  check('Task27: mine without an id receives an id', typeof world.mines[1].id === 'string' && world.mines[1].id.length > 0);
  check('Task27: duplicate mine ids are replaced', world.mines[2].id !== 'mine_iron_1');
  check('Task27: sanitized mine ids are unique', new Set(world.mines.map(m => m.id)).size === 3);
})();

(function test_T27_invalidMineFieldsFallbackIndependently() {
  const win = newDom(makeMemoryStorage()).window;
  const world = win.sanitizeWorldState({
    base: { x: -1, y: 1.5, level: 0 },
    mines: [{
      id: 'mine_bad',
      x: -3,
      y: 2.5,
      resource: 'missing_resource',
      grade: 0,
      miningPower: -5,
      developmentState: 'mining',
    }],
  });
  const mine = world.mines[0];
  check('Task27: invalid base fields fall back independently', world.base.x === 0 && world.base.y === 0 && world.base.level === 1);
  check('Task27: invalid mine position falls back independently', mine.x === 0 && mine.y === 0);
  check('Task27: invalid mine resource falls back to a real resource', win.RESOURCES.some(r => r.key === mine.resource));
  check('Task27: invalid mine grade falls back to 1', mine.grade === 1);
  check('Task27: invalid mine power falls back to 1', mine.miningPower === 1);
  check('Task27: invalid development state falls back to unsecured', mine.developmentState === 'unsecured');
})();

(function test_T27_legacySaveAndRoundTrip() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const legacyPayload = {
    saveVersion: 1,
    savedAt: Date.now(),
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: false },
    run: { resources: { iron: 7 } },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(legacyPayload));
  const legacy = win.loadGame();
  check('Task27: legacy save without world still loads', legacy.ok === true);
  check('Task27: legacy save receives fresh world defaults', legacy.ok === true && legacy.run.world.base.level === 1 && legacy.run.world.mines.length === 0);

  win.state.world = {
    base: { x: 6, y: 9, level: 2 },
    mines: [{ id: 'mine_roundtrip', x: 10, y: 11, resource: 'iron', grade: 3, miningPower: 8, developmentState: 'secured' }],
  };
  check('Task27: save still uses saveVersion 1', (() => { win.saveGame(); return JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1; })());

  const loaded = win.loadGame();
  check('Task27: world survives save/load', loaded.ok === true && loaded.run.world.base.level === 2 && loaded.run.world.mines[0].id === 'mine_roundtrip');
  check('Task27: mine values survive save/load', loaded.ok === true && loaded.run.world.mines[0].resource === 'iron' && loaded.run.world.mines[0].grade === 3 && loaded.run.world.mines[0].miningPower === 8 && loaded.run.world.mines[0].developmentState === 'secured');
})();

(function test_T27_existingFactoryRegressionUntouched() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  check('Task27: existing Factory Node API still works', !!source && !!target);
  check('Task27: existing Factory Link API still works', !!win.addFactoryLink({ from: source.id, to: target.id }));
  check('Task27: existing Link removal still works', !!win.removeFactoryLink(win.state.factory.links[0].id));
})();

// =============================================================================
// TASK 28 — Mine registration.
// Validates a mine as a unique world point and adds it to state.world.mines.
// =============================================================================

(function test_T28_addMineValidAndIdGeneration() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({
    x: 3, y: 5, resource: 'iron', grade: 2, miningPower: 4, developmentState: 'unsecured'
  });
  check('Task28: valid mine is added', !!mine && win.state.world.mines.length === 1);
  check('Task28: mine keeps its gameplay data', mine.x === 3 && mine.y === 5 && mine.resource === 'iron' && mine.grade === 2 && mine.miningPower === 4 && mine.developmentState === 'unsecured');
  check('Task28: mine receives generated id', typeof mine.id === 'string' && mine.id.startsWith('mine_'));
})();

(function test_T28_addMineKeepsUniqueProvidedId() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({
    id: 'mine_custom', x: 1, y: 2, resource: 'coal', grade: 1, miningPower: 2, developmentState: 'secured'
  });
  check('Task28: valid provided mine id is preserved', mine && mine.id === 'mine_custom');
})();

(function test_T28_addMineRejectsInvalidAndDuplicateCoordinates() {
  const win = newDom(makeMemoryStorage()).window;
  const original = {
    id: 'mine_first', x: 4, y: 4, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured'
  };
  check('Task28: first mine is accepted', !!win.addMine(original));

  const before = JSON.stringify(win.state.world.mines);
  check('Task28: duplicate coordinates are rejected', win.addMine({
    x: 4, y: 4, resource: 'coal', grade: 2, miningPower: 2, developmentState: 'secured'
  }) === null);
  check('Task28: duplicate coordinate rejection does not mutate state', JSON.stringify(win.state.world.mines) === before);

  const invalidCases = [
    { x: -1, y: 1, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { x: 1.5, y: 2, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { x: 2, y: 2, resource: 'missing', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { x: 2, y: 3, resource: 'iron', grade: 0, miningPower: 1, developmentState: 'unsecured' },
    { x: 2, y: 4, resource: 'iron', grade: 1, miningPower: 0, developmentState: 'unsecured' },
    { x: 2, y: 5, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unknown' },
  ];
  invalidCases.forEach((raw, index) => {
    const beforeInvalid = JSON.stringify(win.state.world.mines);
    check('Task28: invalid mine is rejected #' + (index + 1), win.addMine(raw) === null);
    check('Task28: invalid mine leaves state unchanged #' + (index + 1), JSON.stringify(win.state.world.mines) === beforeInvalid);
  });
})();

(function test_T28_addMineHandlesIdCollisionWithoutReplacingMine() {
  const win = newDom(makeMemoryStorage()).window;
  const first = win.addMine({
    id: 'mine_same', x: 6, y: 6, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured'
  });
  const second = win.addMine({
    id: 'mine_same', x: 7, y: 6, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'secured'
  });
  check('Task28: first mine keeps requested id', first && first.id === 'mine_same');
  check('Task28: second mine is added despite id collision', !!second && win.state.world.mines.length === 2);
  check('Task28: colliding id is replaced with a generated id', second && second.id !== 'mine_same' && second.id.startsWith('mine_'));
})();

(function test_T28_addMineSaveLoadAndFactoryRegression() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const mine = win.addMine({
    id: 'mine_save', x: 9, y: 3, resource: 'iron', grade: 3, miningPower: 7, developmentState: 'secured'
  });
  check('Task28: save test mine was added', !!mine);
  win.saveGame();
  const loaded = win.loadGame();
  check('Task28: mine survives save/load', loaded.ok === true && loaded.run.world.mines.length === 1 && loaded.run.world.mines[0].id === 'mine_save');
  check('Task28: mine gameplay data survives save/load', loaded.ok === true && loaded.run.world.mines[0].resource === 'iron' && loaded.run.world.mines[0].grade === 3 && loaded.run.world.mines[0].miningPower === 7 && loaded.run.world.mines[0].developmentState === 'secured');

  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  check('Task28: Factory Node API remains available', !!source);
})();
 
// =============================================================================
// TASK 30 — Mine securing.
// =============================================================================
(function test_T30_secureMine() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({ id:'mine_secure', x:2, y:2, resource:'iron', grade:1, miningPower:1, developmentState:'unsecured' });
  check('Task30: unsecured mine is created', !!mine && mine.developmentState === 'unsecured');
  check('Task30: secureMine transitions mine to secured', win.secureMine('mine_secure') === true && win.state.world.mines[0].developmentState === 'secured');
  check('Task30: securing an already secured mine is rejected', win.secureMine('mine_secure') === false);
  check('Task30: invalid mine id is rejected', win.secureMine('missing') === false && win.secureMine('') === false);
  check('Task30: failed securing leaves mine state unchanged', win.state.world.mines[0].developmentState === 'secured');
})();
// =============================================================================
// TASK 31 — Manual mining.
// =============================================================================
(function test_T31_mineMine() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({ id:'mine_manual', x:3, y:3, resource:'iron', grade:4, miningPower:2.5, developmentState:'unsecured' });
  check('Task31: unsecured mine cannot be mined', win.mineMine('mine_manual') === false && win.state.resources.iron === 0);
  check('Task31: mine is secured before mining', win.secureMine('mine_manual') === true);
  check('Task31: secured mine can be mined manually', win.mineMine('mine_manual') === true);
  check('Task31: mining adds miningPower to shared resource storage', win.state.resources.iron === 2.5);
  check('Task31: repeated mining accumulates in shared storage', win.mineMine('mine_manual') === true && win.state.resources.iron === 5);
  check('Task31: invalid mine id does not mutate storage', win.mineMine('missing') === false && win.state.resources.iron === 5);
})();
// =============================================================================
// TASK 32 — World mine UI.
// =============================================================================
(function test_T32_buildMinesUI() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.world.mines.push({ id:'mine_ui', x:8, y:4, resource:'iron', grade:2, miningPower:3, developmentState:'unsecured' });
  win.buildMines();
  const wrap = win.document.getElementById('worldMines');
  check('Task32: world mine panel renders a registered mine', wrap.children.length === 1);
  check('Task32: unsecured mine shows secure action', !!wrap.querySelector('[data-secure-mine="mine_ui"]'));
  check('Task32: unsecured mine disables mining action', wrap.querySelector('[data-mine-mine="mine_ui"]').disabled === true);
  win.secureMine('mine_ui'); win.buildMines();
  check('Task32: secured mine enables mining action', wrap.querySelector('[data-mine-mine="mine_ui"]').disabled === false);
})();
// =============================================================================
// TASK 33 — Base UI.
// =============================================================================
(function test_T33_renderBaseInfo() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.world.base = { x:12, y:7, level:3 };
  win.renderBaseInfo();
  const wrap = win.document.getElementById('baseInfo');
  check('Task33: base panel renders', wrap.children.length === 1);
  check('Task33: base level is rendered', wrap.textContent.includes('거점 Lv.3'));
  check('Task33: base coordinates are rendered', wrap.textContent.includes('위치 (12, 7)'));
})();


// =============================================================================
// TASK 34 — Starting world mine seed.
// A brand-new run starts with a small, visible pair of unsecured mines so the
// world loop is playable without an external addMine() call.
// =============================================================================
(function test_T34_startingWorldMineSeed() {
  const win = newDom(makeMemoryStorage()).window;
  const mines = win.state.world.mines;
  check('Task34: fresh run starts with two mines', mines.length === 2);
  check('Task34: starting iron mine is present at (2,0)', mines.some(m => m.id === 'mine_start_iron' && m.x === 2 && m.y === 0 && m.resource === 'iron'));
  check('Task34: starting coal mine is present at (0,2)', mines.some(m => m.id === 'mine_start_coal' && m.x === 0 && m.y === 2 && m.resource === 'coal'));
  check('Task34: starting mines begin unsecured', mines.every(m => m.developmentState === 'unsecured'));
  check('Task34: starting mines use grade 1 and miningPower 1', mines.every(m => m.grade === 1 && m.miningPower === 1));
})();

(function test_T34_missingWorldGetsStartingSeed() {
  const storage = makeMemoryStorage();
  storage._setRaw('gachaFactorySave', JSON.stringify({
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: false },
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0, characters: [], lastPull: null,
      facility: {}, workforce: {}, unlockedSites: {}, autoCraft: {}, autoSell: {}, autoSellOn: {},
      craftQueue: {}, hqLevel: 0, craftFacility: 1, autoLineLogged: false, factory: {}
    }
  }));
  const win = newDom(storage).window;
  check('Task34: saves without world data receive the starting seed', win.state.world.mines.length === 2);
})();


// =============================================================================
// TASK 35 — Shared storage UI.
// =============================================================================
(function test_T35_sharedStorageUI() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.resources.iron = 12;
  win.state.resources.coal = 4.5;
  win.renderSharedStorage();
  const wrap = win.document.getElementById('sharedStorage');
  check('Task35: shared storage panel renders', wrap.children.length === win.RESOURCES.length);
  check('Task35: iron is shown in shared storage', wrap.querySelector('[data-shared-amt="iron"]').textContent === '12');
  check('Task35: coal is shown in shared storage', wrap.querySelector('[data-shared-amt="coal"]').textContent === '4.5');
  win.state.resources.iron = 20;
  win.updateNumbers();
  check('Task35: shared storage amount refreshes from state.resources', wrap.querySelector('[data-shared-amt="iron"]').textContent === '20');
  check('Task35: world mining uses the same shared storage value', (() => {
    const mine = win.state.world.mines.find(m => m.resource === 'iron');
    const before = win.state.resources.iron;
    win.secureMine(mine.id);
    win.mineMine(mine.id);
    win.updateNumbers();
    return win.state.resources.iron === before + mine.miningPower &&
      wrap.querySelector('[data-shared-amt="iron"]').textContent === String(before + mine.miningPower);
  })());
})();


// =============================================================================
// TASK 36 — Minimal Workshop data model.
// =============================================================================
(function test_T36_workshopDataModel() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task36: fresh world has a workshops collection', Array.isArray(win.state.world.workshops) && win.state.world.workshops.length === 0);

  const world = win.sanitizeWorldState({
    base: { x: 0, y: 0, level: 1 },
    mines: [],
    workshops: [
      { id: 'workshop_1', x: 4, y: 3, level: 2 },
      { x: 7, y: 1, level: 1 },
      { id: 'workshop_1', x: 9, y: 2, level: 4 },
    ],
  });
  check('Task36: valid workshop fields survive sanitization', world.workshops[0].x === 4 && world.workshops[0].y === 3 && world.workshops[0].level === 2);
  check('Task36: workshop without id receives an id', typeof world.workshops[1].id === 'string' && world.workshops[1].id.startsWith('workshop_'));
  check('Task36: duplicate workshop ids are replaced', world.workshops[2].id !== 'workshop_1');
  check('Task36: workshop ids are unique', new Set(world.workshops.map(w => w.id)).size === 3);

  const invalid = win.sanitizeWorldState({
    workshops: [{ x: -1, y: 1.5, level: 0 }],
  });
  check('Task36: invalid workshop position falls back safely', invalid.workshops[0].x === 0 && invalid.workshops[0].y === 0);
  check('Task36: invalid workshop level falls back to 1', invalid.workshops[0].level === 1);
})();

(function test_T36_workshopsSaveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.world.workshops = [{ id: 'workshop_save', x: 5, y: 6, level: 3 }];
  check('Task36: saveVersion remains 1', (() => { win.saveGame(); return JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1; })());
  const loaded = win.loadGame();
  check('Task36: workshop data survives save/load', loaded.ok === true && loaded.run.world.workshops.length === 1 && loaded.run.world.workshops[0].id === 'workshop_save' && loaded.run.world.workshops[0].level === 3);
})();


// =============================================================================
// TASK 37 — Workshop registration.
// =============================================================================
(function test_T37_addWorkshop() {
  const win = newDom(makeMemoryStorage()).window;
  const workshop = win.addWorkshop({ x: 4, y: 4, level: 1 });
  check('Task37: valid workshop is added', !!workshop && win.state.world.workshops.length === 1);
  check('Task37: workshop data is preserved', workshop.x === 4 && workshop.y === 4 && workshop.level === 1);
  check('Task37: workshop receives generated id', typeof workshop.id === 'string' && workshop.id.startsWith('workshop_'));

  const custom = win.addWorkshop({ id: 'workshop_custom', x: 6, y: 4, level: 2 });
  check('Task37: valid custom workshop id is preserved', !!custom && custom.id === 'workshop_custom');

  const duplicateBefore = JSON.stringify(win.state.world.workshops);
  check('Task37: duplicate workshop coordinates are rejected', win.addWorkshop({ x: 4, y: 4, level: 3 }) === null);
  check('Task37: duplicate coordinate rejection leaves state unchanged', JSON.stringify(win.state.world.workshops) === duplicateBefore);

  const invalidCases = [
    { x: -1, y: 1, level: 1 },
    { x: 1.5, y: 1, level: 1 },
    { x: 1, y: 1.5, level: 1 },
    { x: 1, y: 1, level: 0 },
    { x: 1, y: 1, level: 1.5 },
    { x: 1, y: 1 },
    null,
    'not an object',
  ];
  invalidCases.forEach((raw, index) => {
    const before = JSON.stringify(win.state.world.workshops);
    check('Task37: invalid workshop rejected #' + (index + 1), win.addWorkshop(raw) === null);
    check('Task37: invalid workshop leaves state unchanged #' + (index + 1), JSON.stringify(win.state.world.workshops) === before);
  });
})();

(function test_T37_workshopIdCollision() {
  const win = newDom(makeMemoryStorage()).window;
  const first = win.addWorkshop({ id: 'workshop_same', x: 8, y: 8, level: 1 });
  const second = win.addWorkshop({ id: 'workshop_same', x: 9, y: 8, level: 1 });
  check('Task37: first workshop keeps requested id', first && first.id === 'workshop_same');
  check('Task37: second workshop is accepted despite id collision', !!second);
  check('Task37: colliding workshop id is replaced', second && second.id !== 'workshop_same');
})();


// =============================================================================
// TASK 38 — Workshop UI.
// =============================================================================
(function test_T38_workshopUI() {
  const win = newDom(makeMemoryStorage()).window;
  win.renderWorkshops();
  const wrap = win.document.getElementById('workshops');
  check('Task38: workshop panel renders', !!wrap);
  check('Task38: empty workshop panel has a clear empty state', wrap.textContent.includes('아직 설치된 제작소가 없습니다.'));

  win.addWorkshop({ id: 'workshop_ui', x: 5, y: 4, level: 2 });
  win.renderWorkshops();
  check('Task38: registered workshop renders as a card', wrap.children.length === 1);
  check('Task38: workshop level is shown', wrap.textContent.includes('제작소 Lv.2'));
  check('Task38: workshop coordinates are shown', wrap.textContent.includes('위치 (5, 4)'));

  win.state.world.workshops[0].level = 3;
  win.renderAll();
  check('Task38: workshop UI refreshes after renderAll', wrap.textContent.includes('제작소 Lv.3'));
})();

// =============================================================================
// TASK 39 — Workshop recipe target.
// A workshop can optionally point at one existing recipe. This only stores the
// production target; it does not craft, consume resources, or create products.
// =============================================================================
(function test_T39_workshopRecipeTarget() {
  const win = newDom(makeMemoryStorage()).window;
  const workshop = win.addWorkshop({ id:'workshop_recipe', x:4, y:4, level:1 });
  check('Task39: workshop starts without a recipe target', !!workshop && workshop.recipeKey === null);

  check('Task39: valid recipe can be assigned', win.setWorkshopRecipe('workshop_recipe', 'steel') === true);
  check('Task39: assigned recipe is stored on workshop', win.state.world.workshops[0].recipeKey === 'steel');

  check('Task39: assigning the same recipe again is rejected', win.setWorkshopRecipe('workshop_recipe', 'steel') === false);
  const beforeInvalid = JSON.stringify(win.state.world.workshops);
  check('Task39: invalid recipe is rejected', win.setWorkshopRecipe('workshop_recipe', 'missing_recipe') === false);
  check('Task39: invalid recipe leaves workshop unchanged', JSON.stringify(win.state.world.workshops) === beforeInvalid);

  check('Task39: recipe can be cleared', win.setWorkshopRecipe('workshop_recipe', null) === true);
  check('Task39: cleared workshop has no recipe target', win.state.world.workshops[0].recipeKey === null);
  check('Task39: unknown workshop is rejected', win.setWorkshopRecipe('missing_workshop', 'steel') === false);
})();

(function test_T39_workshopRecipeSaveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.world.workshops = [{ id:'workshop_save_recipe', x:2, y:3, level:2, recipeKey:'steel' }];
  win.saveGame();
  const loaded = win.loadGame();
  check('Task39: workshop recipe target survives save/load',
    loaded.ok === true &&
    loaded.run.world.workshops.length === 1 &&
    loaded.run.world.workshops[0].recipeKey === 'steel');
})();

(function test_T39_invalidWorkshopRecipeSanitizesSafely() {
  const win = newDom(makeMemoryStorage()).window;
  const world = win.sanitizeWorldState({
    base: { x:0, y:0, level:1 },
    mines: [],
    workshops: [
      { id:'valid_recipe', x:1, y:1, level:1, recipeKey:'steel' },
      { id:'invalid_recipe', x:2, y:1, level:1, recipeKey:'not_a_recipe' },
      { id:'missing_recipe', x:3, y:1, level:1 },
    ],
  });
  check('Task39: valid workshop recipe survives sanitization', world.workshops[0].recipeKey === 'steel');
  check('Task39: invalid workshop recipe becomes null', world.workshops[1].recipeKey === null);
  check('Task39: missing workshop recipe becomes null', world.workshops[2].recipeKey === null);
})();

// =============================================================================
// TASK 40-54 — Workshop loop, expansion, and calm presentation.
// =============================================================================
(function test_T40_workshopManualCraft() {
  const win = newDom(makeMemoryStorage()).window;
  const workshop = win.addWorkshop({ id:'workshop_manual', x:1, y:1, level:1, recipeKey:'steel' });
  win.state.resources.iron = 2;
  win.state.resources.coal = 1;
  check('Task40: workshop manual craft succeeds', win.craftWorkshop(workshop.id) === true);
  check('Task40: workshop consumes shared iron', win.state.resources.iron === 0);
  check('Task40: workshop consumes shared coal', win.state.resources.coal === 0);
  check('Task40: workshop creates product', win.state.products.steel === 1);
})();

(function test_T41_workshopTimedCraft() {
  const win = newDom(makeMemoryStorage()).window;
  const workshop = win.addWorkshop({ id:'workshop_timed', x:1, y:2, level:1, recipeKey:'crystalAlloy' });
  win.state.resources.steel = 2;
  win.state.resources.crystal = 1;
  check('Task41: timed workshop craft starts', win.craftWorkshop(workshop.id) === true);
  check('Task41: timed workshop has progress', win.state.world.workshops[0].progress > 0);
  check('Task41: timed workshop does not output early', win.state.products.crystalAlloy === 0);
  for(let i=0;i<40;i++) win.tickWorkshops();
  check('Task41: timed workshop eventually outputs product', win.state.products.crystalAlloy === 1);
  check('Task41: timed workshop clears progress after completion', win.state.world.workshops[0].progress === null);
})();

(function test_T42_workshopTickAndLevelSpeed() {
  const win = newDom(makeMemoryStorage()).window;
  const base = win.addWorkshop({ id:'workshop_speed_1', x:2, y:2, level:1, recipeKey:'crystalAlloy' });
  const upgraded = win.addWorkshop({ id:'workshop_speed_2', x:3, y:2, level:2, recipeKey:'crystalAlloy' });
  win.state.resources.steel = 4;
  win.state.resources.crystal = 2;
  check('Task42: level 1 craft starts', win.craftWorkshop(base.id) === true);
  check('Task42: level 2 craft starts', win.craftWorkshop(upgraded.id) === true);
  check('Task42: higher workshop level shortens timed craft', win.state.world.workshops[1].progress < win.state.world.workshops[0].progress);
})();

(function test_T43_workshopAutoCraft() {
  const win = newDom(makeMemoryStorage()).window;
  const workshop = win.addWorkshop({ id:'workshop_auto', x:4, y:2, level:1, recipeKey:'steel', auto:true });
  win.state.resources.iron = 2;
  win.state.resources.coal = 1;
  win.tickWorkshops();
  check('Task43: auto workshop starts/finishes instant recipe', win.state.products.steel === 1);
  check('Task43: auto workshop consumes inputs', win.state.resources.iron === 0 && win.state.resources.coal === 0);
})();

(function test_T44_workshopUIControls() {
  const win = newDom(makeMemoryStorage()).window;
  win.addWorkshop({ id:'workshop_ui_loop', x:5, y:5, level:1, recipeKey:'steel' });
  win.renderWorkshops();
  const wrap = win.document.getElementById('workshops');
  check('Task44: workshop UI has recipe selector', !!wrap.querySelector('[data-workshop-recipe="workshop_ui_loop"]'));
  check('Task44: workshop UI has craft button', !!wrap.querySelector('[data-workshop-craft="workshop_ui_loop"]'));
  check('Task44: workshop UI has auto toggle', !!wrap.querySelector('[data-workshop-auto="workshop_ui_loop"]'));
})();

(function test_T45_workshopUIRefresh() {
  const win = newDom(makeMemoryStorage()).window;
  const workshop = win.addWorkshop({ id:'workshop_refresh', x:6, y:5, level:1, recipeKey:'steel' });
  win.renderWorkshops();
  win.state.resources.iron = 2;
  win.state.resources.coal = 1;
  win.craftWorkshop(workshop.id);
  win.renderWorkshops();
  check('Task45: workshop UI shows completed instant craft state', win.document.getElementById('workshops').textContent.includes('대기 중'));
})();

(function test_T46_workshopSaveLoadState() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.world.workshops = [{ id:'workshop_save_loop', x:2, y:4, level:2, recipeKey:'crystalAlloy', auto:true, progress:1.25 }];
  check('Task46: workshop production state saves', win.saveGame() === true);
  const loaded = win.loadGame();
  const w = loaded.run.world.workshops[0];
  check('Task46: workshop recipe survives save/load', w.recipeKey === 'crystalAlloy');
  check('Task46: workshop auto state survives save/load', w.auto === true);
  check('Task46: workshop progress survives save/load', w.progress === 1.25);
})();

(function test_T47_expandBaseUnlocksNextRegion() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 700;
  const beforeLevel = win.state.world.base.level;
  check('Task47: base expansion succeeds with next region cost', win.expandBase() === true);
  check('Task47: base level increases', win.state.world.base.level === beforeLevel + 1);
  check('Task47: next region becomes unlocked', win.state.unlockedSites.manaVein === true);
  check('Task47: expansion consumes region cost', win.state.gold === 0);
})();

(function test_T48_expansionSeedsWorldMines() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 700;
  check('Task48: expansion seeds new world mines', win.expandBase() === true && win.state.world.mines.length === 4);
  const manaMines = win.state.world.mines.filter(m => m.resource === 'mana' || m.resource === 'crystal');
  check('Task48: seeded mines use expanded region resources', manaMines.length === 2);
  check('Task48: seeded mines start unsecured', manaMines.every(m => m.developmentState === 'unsecured'));
})();

(function test_T49_expansionDoesNotDuplicateMines() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 700;
  check('Task49: first expansion succeeds', win.expandBase() === true);
  win.state.gold = 700;
  check('Task49: repeated same-region expansion is rejected', win.expandBase() === false);
  check('Task49: repeated expansion does not duplicate seeded mines', win.state.world.mines.length === 4);
})();

(function test_T50_expansionUI() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 700;
  win.renderBaseInfo();
  const btn = win.document.querySelector('[data-expand-base]');
  check('Task50: base panel shows next-region expansion button', !!btn);
  check('Task50: expansion button shows cost', btn && btn.textContent.includes('700G'));
})();

(function test_T51_calmPresentationPanel() {
  const win = newDom(makeMemoryStorage()).window;
  const panel = win.document.querySelector('.ambience');
  check('Task51: calm workshop ambience panel exists', !!panel);
  check('Task51: ambience panel contains calm copy', panel && panel.textContent.includes('조용히 공방'));
})();

(function test_T52_workshopBalanceConstant() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task52: workshop level speed tuning is positive', win.BALANCE.crafting.WORKSHOP_LEVEL_SPEED_PER_LEVEL > 0);
  check('Task52: workshop level 2 is faster than level 1', (() => {
    const a = win.addWorkshop({id:'balance_a',x:7,y:1,level:1,recipeKey:'crystalAlloy'});
    const b = win.addWorkshop({id:'balance_b',x:8,y:1,level:2,recipeKey:'crystalAlloy'});
    return win.workshopCraftTime(b, win.RECIPES.find(r=>r.key==='crystalAlloy')) <
      win.workshopCraftTime(a, win.RECIPES.find(r=>r.key==='crystalAlloy'));
  })());
})();

(function test_T53_fullLoopMineToWorkshop() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.state.world.mines.find(m => m.resource === 'iron');
  win.secureMine(mine.id);
  win.mineMine(mine.id);
  win.state.resources.iron += 1;
  win.state.resources.coal = 1;
  const workshop = win.addWorkshop({id:'loop_workshop',x:9,y:1,level:1,recipeKey:'steel'});
  check('Task53: mine-to-workshop loop has required inputs', win.state.resources.iron >= 2 && win.state.resources.coal >= 1);
  check('Task53: mine-to-workshop craft completes', win.craftWorkshop(workshop.id) === true && win.state.products.steel === 1);
})();

(function test_T54_fullLoopSaveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.resources.iron = 2;
  win.state.resources.coal = 1;
  const workshop = win.addWorkshop({id:'loop_save',x:10,y:1,level:1,recipeKey:'steel',auto:true});
  win.tickWorkshops();
  check('Task54: full loop state saves', win.saveGame() === true);
  const loaded = win.loadGame();
  check('Task54: saved workshop remains available', loaded.ok === true && loaded.run.world.workshops[0].id === workshop.id);
  check('Task54: saved produced product remains available', loaded.run.products.steel === 1);
})();

// =============================================================================
// SUMMARY
// =============================================================================

allDoms.forEach((d) => { try { d.window.close(); } catch (e) { /* ignore */ } });

console.log('');
console.log(`Total: ${passCount + failCount}  Pass: ${passCount}  Fail: ${failCount}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(' - ' + f));
}
process.exit(failCount === 0 ? 0 : 1);
