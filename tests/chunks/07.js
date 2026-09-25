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

(function test_T34_explicitEmptyMinesPreserved() {
  const storage = makeMemoryStorage();
  storage._setRaw('gachaFactorySave', JSON.stringify({
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: false },
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0, characters: [], lastPull: null,
      facility: {}, workforce: {}, unlockedSites: {}, autoCraft: {}, autoSell: {}, autoSellOn: {},
      craftQueue: {}, hqLevel: 0, craftFacility: 1, autoLineLogged: false, factory: {},
      world: { base: { x: 0, y: 0, level: 1 }, mines: [] },
    },
  }));
  const win = newDom(storage).window;
  check('Task34: explicitly saved empty world.mines is preserved', win.state.world.mines.length === 0);
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

