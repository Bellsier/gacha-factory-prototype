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
