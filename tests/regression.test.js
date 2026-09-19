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
  win.eval(scriptEl.textContent + expose);
  Object.defineProperties(win, {
    state: { get: () => win.__expose.state(), configurable: true },
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
  check('save/load: characters restored (order + all fields)', JSON.stringify(win.state.characters.map((c) => JSON.stringify(c, Object.keys(c).sort()))) === JSON.stringify(charsBefore));
})();

(function test_craftQueueSurvivesReload() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.state.craftQueue.specialAlloy = 2.7;
  win.saveGame();
  win = newDom(storage).window;
  check('craftQueue: exact remaining time restored', win.state.craftQueue.specialAlloy === 2.7, String(win.state.craftQueue.specialAlloy));
  const before = win.state.craftQueue.specialAlloy;
  advanceTicks(win, 5);
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
  advanceTicks(win, 50);
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
  for (const p of [0, 1, 3, 7]) {
    for (const h of [0, 2, 5]) {
      win.state.hqLevel = h;
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
      check(`BALANCE: workerUpgradeCost(${stat}) matches reference (L${lvl})`, win.workerUpgradeCost(worker, stat) === refExpCost(REF.statCostBase[stat], REF.statCostGrowth, lvl));
    }
  });
  [[1, 2, 1], [2, 3, 2], [3, 5, 3], [5, 8, 5], [10, 10, 10]].forEach(([m, c, mv]) => {
    const worker = { mining: m, carry: c, move: mv };
    check(`BALANCE: workerEffective() matches reference (${m},${c},${mv})`, Math.abs(win.workerEffective(worker) - (m * c * mv) / REF.workerEffectiveDivisor) < 1e-12);
  });
  [5, 20, 45, 80, 400, 420].forEach((sell) => {
    check(`BALANCE: autoSellCost() matches reference (sell=${sell})`, win.autoSellCost({ sell }) === sell * REF.autoSellMult);
  });
  win.permanent.tickets = 1;
  win.pullGacha();
  [[0, 0], [199, 0], [200, 1], [800, 2], [1800, 3], [3200, 4], [5000, 5]].forEach(([gold, expectedPts]) => {
    win.state.runGold = gold;
    check(`BALANCE: prestigeGain() matches reference at runGold=${gold}`, win.prestigeGain() === expectedPts);
  });
})();

(function test_tickTimingConstants() {
  const win = newDom(makeMemoryStorage()).window;
  check('tick: TICK_MS is 100 (unchanged engine constant)', win.TICK_MS === 100);
  check('tick: TICKS_PER_SECOND derives to exactly 10', win.TICKS_PER_SECOND === 10);
  const ticksPerSecond = win.TICKS_PER_SECOND;
  let allMatch = true;
  for (const rate of [0, 1, 3.7, 12.5, 0.125, 100000, 7, 2.3333333, Math.PI]) {
    if (rate / 10 !== rate / ticksPerSecond) allMatch = false;
  }
  check('tick: derived per-tick resource fraction is bit-identical to rate/10', allMatch);
  check('tick: derived per-tick craft-queue fraction is bit-identical to 0.1', 1 / ticksPerSecond === 0.1);
})();

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
  win.updateNumbers();
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
  win.state.characters.reverse();
  win.buildWorkers();
  win.state.gold = 100000;
  win.updateNumbers();
  const targetId = win.state.characters[0].id;
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
  check('save/load: every worker field identical (stats/levels/id/order)', restored.every((c, i) => JSON.stringify(c, Object.keys(c).sort()) === JSON.stringify(snapshot[i], Object.keys(snapshot[i]).sort())));
})();

(function test_legacySaveMissingIdsBackfilled() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: true },
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [
        { rarity: 'common', resource: 'iron', mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 },
        { rarity: 'rare', resource: 'coal', mining: 2, carry: 3, move: 2, miningLvl: 1, carryLvl: 0, moveLvl: 2 },
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
  check('legacy save: worker #2 stats/levels (upgrade progress) untouched', chars[1].rarity === 'rare' && chars[1].mining === 2 && chars[1].carry === 3 && chars[1].move === 2 && chars[1].miningLvl === 1 && chars[1].moveLvl === 2);
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
        { id: 'w_dup', rarity: 'epic', resource: 'coal', mining: 3, carry: 5, move: 3, miningLvl: 0, carryLvl: 0, moveLvl: 0 },
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

(function test_fullGameFlowSmoke() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  check('flow: starts with 0 gold, 0 tickets, no workers', win.state.gold === 0 && win.permanent.tickets === 0 && win.state.characters.length === 0);
  const ironBtn = win.document.querySelector('[data-mine="iron"]');
  const coalBtn = win.document.querySelector('[data-mine="coal"]');
  for (let i = 0; i < 20; i++) ironBtn.click();
  for (let i = 0; i < 10; i++) coalBtn.click();
  check('flow: manual mining accumulates resources', win.state.resources.iron >= 20 && win.state.resources.coal >= 10);
  win.updateNumbers();
  const craftBtn = win.document.querySelector('[data-craft="steel"]');
  for (let i = 0; i < 10; i++) { craftBtn.click(); win.updateNumbers(); }
  check('flow: crafting steel produces product', win.state.products.steel >= 10);
  const sellBtn = win.document.querySelector('[data-sell="steel"]');
  sellBtn.click();
  check('flow: selling steel yields gold', win.state.gold > 0);
  check('flow: crossing 50G granted the first ticket', win.permanent.firstGachaGranted === true && win.permanent.tickets >= 1);
  win.updateNumbers();
  win.document.getElementById('gachaTicketBtn').click();
  check('flow: gacha pull produced a worker', win.state.characters.length === 1);
  check('flow: worker is assigned to an unlocked resource', ['iron', 'coal'].includes(win.state.characters[0].resource));
  const workerRes = win.state.characters[0].resource;
  check('flow: auto rate is now > 0 for the worker\'s resource', win.autoRate(workerRes) > 0);
  win.state.runGold = 5000;
  const expectedGain = win.prestigeGain();
  check('flow: prestige gain is available with a worker present', expectedGain > 0);
  win.document.getElementById('prestigeBtn').onclick();
  check('flow: prestige increased totalPrestige', win.permanent.totalPrestige === expectedGain);
  check('flow: prestige reset the run (0 workers, 0 gold)', win.state.characters.length === 0 && win.state.gold === 0);
  const prestigeAfter = win.permanent.totalPrestige;
  win = newDom(storage).window;
  check('flow: permanent prestige persists after prestige + reload', win.permanent.totalPrestige === prestigeAfter);
})();

function makeTestWorker(id, resource) {
  return { id, rarity: 'common', resource, mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 };
}

(function test_A_noWorkersHintUnchanged() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 50;
  win.permanent.firstGachaGranted = true;
  win.permanent.tickets = 1;
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-A: no-worker hint text is the original "\ubf51\uc73c\uc138\uc694" guidance', text.includes('\uc77c\uafc8') && text.includes('\ubf51'));
})();

(function test_B_ironOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-B: iron-only worker mentions coal as the missing side', text.includes('\uc11d\ud0c4'));
  check('Task6-B: iron-only worker does not claim full automation', !text.includes('\uc790\ub3d9\ud654 \uc644\ub8cc'));
})();

(function test_C_coalOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'coal'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-C: coal-only worker mentions iron as the missing side', text.includes('\ucca0\uad11\uc11d'));
  check('Task6-C: coal-only worker does not claim full automation', !text.includes('\uc790\ub3d9\ud654 \uc644\ub8cc'));
})();

(function test_D_bothSidesShowsFullAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.state.characters.push(makeTestWorker('t2', 'coal'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-D: both sides covered shows the full-automation hint', text.includes('\uc790\ub3d9\ud654 \uc644\ub8cc'));
  win.state.autoCraft.steel = true;
  win.updateNextHint();
  const textAfter = win.document.getElementById('nextHint').textContent;
  check('Task6-E: after autoCraft is on, the automation-complete hint no longer shows', !textAfter.includes('\uc790\ub3d9\ud654 \uc644\ub8cc'));
  check('Task6-E: prestige-related guidance is shown instead', textAfter.includes('\uba85\uc131') || textAfter.includes('200G'));
})();

(function test_E_logFiresOnceNotEveryTick() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.checkDualAutomation();
  win.state.characters.push(makeTestWorker('t2', 'coal'));
  win.checkDualAutomation();
  const countAfterFirst = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('\uc790\ub3d9\ud654 \uc644\ub8cc')).length;
  check('Task6-E: milestone log appears exactly once after reaching the condition', countAfterFirst === 1, `count=${countAfterFirst}`);
  advanceTicks(win, 30);
  win.checkDualAutomation();
  win.checkDualAutomation();
  const countAfterMore = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('\uc790\ub3d9\ud654 \uc644\ub8cc')).length;
  check('Task6-E: milestone log does NOT repeat across ticks / repeated calls', countAfterMore === 1, `count=${countAfterMore}`);
})();

(function test_F_reassignmentUpdatesAutomationStatus() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.permanent.tickets = 2;
  win.pullGacha();
  win.pullGacha();
  win.state.characters[0].resource = 'iron';
  win.state.characters[1].resource = 'iron';
  win.buildWorkers();
  win.updateNextHint();
  check('Task6-F: both workers on iron shows the partial-automation hint', win.document.getElementById('nextHint').textContent.includes('\uc11d\ud0c4'));
  const sel = win.document.querySelectorAll('[data-reassign]')[1];
  sel.value = 'coal';
  sel.dispatchEvent(new win.window.Event('change'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-F: reassigning the 2nd worker to coal completes automation', text.includes('\uc790\ub3d9\ud654 \uc644\ub8cc'));
  const logHits = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('\uc790\ub3d9\ud654 \uc644\ub8cc')).length;
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
  win.checkDualAutomation();
  const logHits = Array.from(win.document.querySelectorAll('#log div')).filter((d) => d.textContent.includes('\uc790\ub3d9\ud654 \uc644\ub8cc')).length;
  check('Task6-G: no duplicate milestone log after reload', logHits === 0, `count=${logHits}`);
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
  const manaVeinText = Array.from(win.document.querySelectorAll('.site-group')).find((g) => g.textContent.includes('\ub9c8\uc815\uc11d \uad11\ub9e5'));
  check('Task6-H: manaVein card mentions its minerals', manaVeinText && manaVeinText.textContent.includes('\ub9c8\uc815\uc11d') && manaVeinText.textContent.includes('\uacb0\uc815'));
  check('Task6-H: manaVein card mentions only recipes that actually use its resources (from real RECIPES data)', manaVeinText && manaVeinText.textContent.includes('\ub9c8\ubc95 \ud569\uae08') && manaVeinText.textContent.includes('\uacb0\uc815 \ud569\uae08'));
  check('Task6-H: manaVein card does not falsely mention ruins/spaceStation recipes', manaVeinText && !manaVeinText.textContent.includes('\ud80c\ud140 \ucf54\uc5b4') && !manaVeinText.textContent.includes('\uc815\ubc00 \ubd80\ud488'));
})();

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
  win.state.resources.iron = 100;
  win.state.resources.coal = 100;
  win.state.autoCraft.steel = true;
  win.state.autoCraft.coalBrick = true;
  advanceTicks(win, 10);
  const steelProducedWithBoth = win.state.products.steel;
  const win2 = newDom(makeMemoryStorage()).window;
  win2.state.resources.iron = 100;
  win2.state.resources.coal = 100;
  win2.state.autoCraft.steel = true;
  advanceTicks(win2, 10);
  const steelProducedAlone = win2.state.products.steel;
  check('Task9-G: steel production identical whether coalBrick auto-craft is on or off', steelProducedWithBoth === steelProducedAlone, `${steelProducedWithBoth} vs ${steelProducedAlone}`);
})();

(function test_T9H_saveLoadCompatibility() {
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
  win.state.products.coalBrick = 7;
  win.state.autoCraft.coalBrick = true;
  win.saveGame();
  const win2 = newDom(storage).window;
  check('Task9-H: coalBrick data round-trips through save/load', win2.state.products.coalBrick === 7 && win2.state.autoCraft.coalBrick === true);
})();

(function test_T9_recipeCardRendersViaExistingBuildRecipes() {
  const win = newDom(makeMemoryStorage()).window;
  win.buildRecipes();
  const card = Array.from(win.document.querySelectorAll('.recipe')).find((el) => el.textContent.includes('\uc11d\ud0c4 \ubcbd\ub3cc'));
  check('Task9-UI: coalBrick recipe card renders via existing buildRecipes()', !!card);
  check('Task9-UI: card shows the need text (\uc11d\ud0c4 3)', card && card.textContent.includes('\uc11d\ud0c4') && card.textContent.includes('3'));
  check('Task9-UI: card has a craft button', card && !!card.querySelector('[data-craft="coalBrick"]'));
  check('Task9-UI: card has a sell button', card && !!card.querySelector('[data-sell="coalBrick"]'));
  check('Task9-UI: card has an auto-craft checkbox', card && !!card.querySelector('[data-autocraft="coalBrick"]'));
})();

(function test_T13_permanentContainer() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task13: permanent exposes totalPrestige/runCount/tickets/firstGachaGranted', typeof win.permanent === 'object' && typeof win.permanent.totalPrestige === 'number' && typeof win.permanent.runCount === 'number' && typeof win.permanent.tickets === 'number' && typeof win.permanent.firstGachaGranted === 'boolean');
  check('Task13: permanent starts at fresh-game defaults', win.permanent.totalPrestige === 0 && win.permanent.runCount === 1 && win.permanent.tickets === 0 && win.permanent.firstGachaGranted === false);
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
  check('Task13: buyAutoSell succeeds when funded and sets both flags', ok === true && win.state.autoSell.steel === true && win.state.autoSellOn.steel === true && win.state.gold === 10000 - cost);
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

// TASK 16 — craft facility (run-scoped timed-craft speed). Does not change
// craftQueue shape, instant recipes, autoCraft/autoSell, or saveVersion.

function stockCrystalAlloyInputs(win) {
  win.state.products.steel = 2;
  win.state.resources.crystal = 1;
}

(function test_T16_freshDefaultAndQueueShape() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task16: freshRunState craftFacility defaults to 1', win.state.craftFacility === 1);
  check('Task16: craftQueue remains a plain map (not an array)', !Array.isArray(win.state.craftQueue) && typeof win.state.craftQueue === 'object');
  check('Task16: craftQueue still keyed by recipe with null idle values', win.RECIPES.every((r) => Object.prototype.hasOwnProperty.call(win.state.craftQueue, r.key) && win.state.craftQueue[r.key] === null));
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
  advanceTicks(win, 28);
  check('Task16: 3s craft still in progress after 2.9s at default level', win.state.craftQueue.crystalAlloy !== null && win.state.products.crystalAlloy === 0);
  win.tickLoop();
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
  check('Task16: Lv.2 speed is 1.1x (0.11s per tick)', Math.abs(progressed - 0.11) < 1e-12, `progressed=${progressed}`);
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
  check('Task16: \uac1c\ubc1c tab shows craft facility level', !!levelEl);
  check('Task16: \uac1c\ubc1c tab shows craft facility upgrade button', !!btn);
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

allDoms.forEach((d) => { try { d.window.close(); } catch (e) { /* ignore */ } });
console.log('');
console.log(`Total: ${passCount + failCount}  Pass: ${passCount}  Fail: ${failCount}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(' - ' + f));
}
process.exit(failCount === 0 ? 0 : 1);
