#!/usr/bin/env node
'use strict';
/**
 * Regression test suite for 채굴 공방 (gacha-factory-prototype).
 * TASK 18 Task18-A Task18-B Task18-C Task18-D Task18-E
 * Full local file is at /workspace/tests/regression.test.js (69065 chars).
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
  if (condition) { passCount++; } else { failCount++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
function makeMemoryStorage() {
  let store = {}; let throwOnAccess = false;
  return {
    getItem: (k) => { if (throwOnAccess) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: (k, v) => { if (throwOnAccess) throw new Error('blocked'); store[k] = String(v); },
    removeItem: (k) => { if (throwOnAccess) throw new Error('blocked'); delete store[k]; },
    clear: () => { store = {}; },
    _raw: () => store, _setRaw: (k, v) => { store[k] = v; }, _setThrow: (v) => { throwOnAccess = v; },
  };
}
const allDoms = [];
function newDom(storage) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
  const win = dom.window;
  Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  win.confirm = () => true; win.alert = () => {};
  const scriptEl = win.document.querySelector('script');
  const expose = `\n;window.__expose = { state: () => state, permanent: () => permanent, saveBlocked: () => saveBlocked, RESOURCES: () => RESOURCES, RECIPES: () => RECIPES, RARITY: () => RARITY, SITES: () => SITES, TICK_MS: () => TICK_MS, TICKS_PER_SECOND: () => TICKS_PER_SECOND };\n`;
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
  allDoms.push(dom); return dom;
}
function advanceTicks(win, n) { for (let i = 0; i < n; i++) win.tickLoop(); }
function showCrystalAlloyCard(win) { win.state.unlockedSites.manaVein = true; win.buildRecipes(); }
function timedCraftLabel(win, key) { const btn = win.document.querySelector(`[data-craft="${key}"]`); return btn ? btn.textContent : null; }
(function test_T18A_lv1DisplaysThreeSeconds() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win);
  const recipe = win.RECIPES.find((r) => r.key === 'crystalAlloy');
  check('Task18-A: crystalAlloy.craftTime is 3', recipe.craftTime === 3);
  check('Task18-A: Lv.1 craftSpeed is 1', win.craftSpeed() === 1);
  win.state.products.steel = 2; win.state.resources.crystal = 1; win.startCraft(recipe);
  check('Task18-A: craftQueue starts at 3', win.state.craftQueue.crystalAlloy === 3);
  win.updateNumbers();
  check('Task18-A: Lv.1 remaining label is 3.0s', timedCraftLabel(win, 'crystalAlloy') === '제작 중... 3.0s');
})();
(function test_T18B_lv2DisplaysQueueOverSpeed() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win); win.state.craftFacility = 2;
  check('Task18-B: Lv.2 craftSpeed is 1.1', Math.abs(win.craftSpeed() - 1.1) < 1e-12);
  win.state.craftQueue.crystalAlloy = 3; win.updateNumbers();
  check('Task18-B: craftQueue remains 3 (display-only change)', win.state.craftQueue.crystalAlloy === 3);
  check('Task18-B: Lv.2 remaining label is 2.7s', timedCraftLabel(win, 'crystalAlloy') === '제작 중... 2.7s');
})();
(function test_T18C_lv3DisplaysTwoPointFive() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win); win.state.craftFacility = 3;
  check('Task18-C: Lv.3 craftSpeed is 1.2', Math.abs(win.craftSpeed() - 1.2) < 1e-12);
  win.state.craftQueue.crystalAlloy = 3; win.updateNumbers();
  check('Task18-C: Lv.3 remaining label is 2.5s', timedCraftLabel(win, 'crystalAlloy') === '제작 중... 2.5s');
})();
(function test_T18D_labelTracksQueueOverSpeedAfterTicks() {
  const win = newDom(makeMemoryStorage()).window;
  showCrystalAlloyCard(win); win.state.craftFacility = 2;
  win.state.products.steel = 2; win.state.resources.crystal = 1;
  win.startCraft(win.RECIPES.find((r) => r.key === 'crystalAlloy'));
  win.tickLoop();
  const remaining = win.state.craftQueue.crystalAlloy;
  check('Task18-D: a tick reduced craftQueue below 3', remaining !== null && remaining < 3);
  const expected = `제작 중... ${(remaining / win.craftSpeed()).toFixed(1)}s`;
  check('Task18-D: label matches craftQueue / craftSpeed()', timedCraftLabel(win, 'crystalAlloy') === expected, timedCraftLabel(win, 'crystalAlloy'));
})();
(function test_T18E_instantRecipesStayInstant() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.craftFacility = 3; win.state.resources.iron = 2; win.state.resources.coal = 1;
  const steel = win.RECIPES.find((r) => r.key === 'steel');
  check('Task18-E: steel still crafts instantly at Lv.3', win.startCraft(steel) === true && win.state.products.steel === 1 && win.state.craftQueue.steel === null);
  win.state.resources.coal = 3;
  const brick = win.RECIPES.find((r) => r.key === 'coalBrick');
  check('Task18-E: coalBrick still crafts instantly at Lv.3', win.startCraft(brick) === true && win.state.products.coalBrick === 1 && win.state.craftQueue.coalBrick === null);
  win.state.products.steel = 2; win.state.resources.mana = 1;
  const alloy = win.RECIPES.find((r) => r.key === 'alloy');
  check('Task18-E: alloy still crafts instantly at Lv.3', win.startCraft(alloy) === true && win.state.products.alloy === 1 && win.state.craftQueue.alloy === null);
})();
allDoms.forEach((d) => { try { d.window.close(); } catch (e) { /* ignore */ } });
console.log('');
console.log(`Total: ${passCount + failCount}  Pass: ${passCount}  Fail: ${failCount}`);
if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log(' - ' + f)); }
process.exit(failCount === 0 ? 0 : 1);
