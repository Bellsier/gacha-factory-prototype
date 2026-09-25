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

