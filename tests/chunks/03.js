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

