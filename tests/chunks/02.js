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

