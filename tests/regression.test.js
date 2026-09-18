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
  const scriptEl = win.document.querySelector('script');
  const expose = `
;window.__expose = {
  state: () => state,
  totalPrestige: () => totalPrestige,
  runCount: () => runCount,
  saveBlocked: () => saveBlocked,
  RESOURCES: () => RESOURCES,
  RECIPES: () => RECIPES,
  RARITY: () => RARITY,
  SITES: () => SITES,
  TICK_MS: () => TICK_MS,
  TICKS_PER_SECOND: () => TICKS_PER_SECOND,
};
`;
  win.eval(scriptEl.textContent + expose);
  Object.defineProperties(win, {
    state: { get: () => win.__expose.state(), configurable: true },
    totalPrestige: { get: () => win.__expose.totalPrestige(), configurable: true },
    runCount: { get: () => win.__expose.runCount(), configurable: true },
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
  check('save/load: fresh start — tickets=0', win.window.tickets === 0);
  check('save/load: fresh start — firstGachaGranted=false', win.window.firstGachaGranted === false);
  check('save/load: fresh start — characters=[]', Array.isArray(win.state.characters) && win.state.characters.length === 0);
})();

(function test_saveThenLoadRoundTrip() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;

  win.state.resources.iron = 100;
  win.state.resources.coal = 100;
  for (let i = 0; i < 10; i++) win.startCraft(win.RECIPES.find((r) => r.key === 'steel'));
  win.sellAll(win.RECIPES.find((r) => r.key === 'steel'));
  check('save/load: crossing 50G grants firstGachaGranted', win.window.firstGachaGranted === true);
  check('save/load: crossing 50G grants a ticket', win.window.tickets >= 1);

  win.window.tickets = 1;
  win.pullGacha();
  check('save/load: worker pulled', win.state.characters.length === 1);

  const goldBefore = win.state.gold;
  const ticketsBefore = win.window.tickets;
  const charsBefore = win.state.characters.map((c) => JSON.stringify(c, Object.keys(c).sort()));

  const saved = win.saveGame();
  check('save/load: saveGame() succeeds', saved === true);
  check('save/load: payload actually written', storage._raw()['gachaFactorySave'] !== undefined);

  win = newDom(storage).window;
  check('save/load: gold restored', win.state.gold === goldBefore, `${win.state.gold} vs ${goldBefore}`);
  check('save/load: tickets restored', win.window.tickets === ticketsBefore);
  check('save/load: firstGachaGranted restored', win.window.firstGachaGranted === true);
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

  win.window.tickets = 1;
  win.pullGacha();
  win.state.runGold = 5000;
  const expectedGain = win.prestigeGain();
  win.document.getElementById('prestigeBtn').onclick();
  check('prestige: totalPrestige increased by the expected amount', win.totalPrestige === expectedGain, `${win.totalPrestige} vs ${expectedGain}`);
  check('prestige: autosaves immediately on confirm', storage._raw()['gachaFactorySave'] !== undefined);

  const prestigeAfter = win.totalPrestige;
  const runCountAfter = win.runCount;
  win = newDom(storage).window;
  check('prestige: totalPrestige persists across reload', win.totalPrestige === prestigeAfter);
  check('prestige: runCount persists across reload', win.runCount === runCountAfter);
  check('prestige: characters reset to empty on the new run', win.state.characters.length === 0);
})();

(function test_corruptedJson() {
  const storage = makeMemoryStorage();
  storage._setRaw('gachaFactorySave', '{not valid json!!!');
  const win = newDom(storage).window;
  check('corrupted save: falls back to a clean default state', win.state.gold === 0 && win.window.tickets === 0);
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
  check('field validation: non-integer runCount falls back to 1', win.runCount === 1);
  check('field validation: valid permanent field (totalPrestige=5) is preserved', win.totalPrestige === 5);
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
  check('negative values: tickets=-1 rejected, falls back to 0', win.window.tickets === 0);
  check('negative values: totalPrestige=-1 rejected, falls back to 0', win.totalPrestige === 0);
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
  const src = html;
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
      const actual = (1 + win.totalPrestige * REF.prestigeMultPerPoint) * win.hqMult();
      // Only meaningful when totalPrestige actually equals p; use the live value instead.
      const liveExpected = (1 + win.totalPrestige * REF.prestigeMultPerPoint) * (1 + h * REF.hqMultPerLevel);
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
  win.window.tickets = 1;
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
  win.window.tickets = 5;
  for (let i = 0; i < 5; i++) win.pullGacha();
  const ids = win.state.characters.map((c) => c.id);
  check('worker id: every new worker has a non-empty string id', ids.every((id) => typeof id === 'string' && id.length > 0));
  check('worker id: ids are unique across pulls', new Set(ids).size === ids.length);
})();

(function test_upgradeAndReassignUseIdNotIndex() {
  const win = newDom(makeMemoryStorage()).window;
  win.window.tickets = 2;
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
  win.window.tickets = 3;
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
  win.window.tickets = 3;
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
  check('flow: starts with 0 gold, 0 tickets, no workers', win.state.gold === 0 && win.window.tickets === 0 && win.state.characters.length === 0);

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
  check('flow: crossing 50G granted the first ticket', win.window.firstGachaGranted === true && win.window.tickets >= 1);

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
  check('flow: prestige increased totalPrestige', win.totalPrestige === expectedGain);
  check('flow: prestige reset the run (0 workers, 0 gold)', win.state.characters.length === 0 && win.state.gold === 0);

  // 8. Permanent prestige value persists across a reload.
  const prestigeAfter = win.totalPrestige;
  win = newDom(storage).window; // no explicit save call — relies on the autosave-on-prestige from step 7
  check('flow: permanent prestige persists after prestige + reload', win.totalPrestige === prestigeAfter);
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
  win.window.firstGachaGranted = true;
  win.window.tickets = 1;
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-A: no-worker hint text is the original "뽑으세요" guidance', text.includes('일꾼') && text.includes('뽑'));
})();

(function test_B_ironOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.window.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-B: iron-only worker mentions coal as the missing side', text.includes('석탄'));
  check('Task6-B: iron-only worker does not claim full automation', !text.includes('자동화 완료'));
})();

(function test_C_coalOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.window.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'coal'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-C: coal-only worker mentions iron as the missing side', text.includes('철광석'));
  check('Task6-C: coal-only worker does not claim full automation', !text.includes('자동화 완료'));
})();

(function test_D_bothSidesShowsFullAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.window.firstGachaGranted = true;
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
  win.window.firstGachaGranted = true;
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
  win.window.firstGachaGranted = true;
  win.window.tickets = 2;
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
  win.window.firstGachaGranted = true;
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
  win.window.tickets = 1;
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
