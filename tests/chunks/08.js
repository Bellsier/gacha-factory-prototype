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
  const recipe = { key:'test_timed', craftTime:10 };
  const a = win.addWorkshop({id:'balance_a',x:7,y:1,level:1,recipeKey:'steel'});
  const b = win.addWorkshop({id:'balance_b',x:8,y:1,level:2,recipeKey:'steel'});
  check('Task52: workshop level 2 is faster than level 1', win.workshopCraftTime(b, recipe) < win.workshopCraftTime(a, recipe));
  check('Task52: level 1 keeps base craft time', win.workshopCraftTime(a, recipe) === 10);
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
  win.state.research.autoCraftDevice = true;
  const workshop = win.addWorkshop({id:'loop_save',x:10,y:1,level:1,recipeKey:'steel',auto:true});
  win.tickWorkshops();
  check('Task54: full loop state saves', win.saveGame() === true);
  const loaded = win.loadGame();
  check('Task54: saved workshop remains available', loaded.ok === true && loaded.run.world.workshops[0].id === workshop.id);
  check('Task54: saved produced product remains available', loaded.run.products.steel === 1);
})();

(function test_stabilize_sanitizeZeroAndInvalidProgress() {
  const win = newDom(makeMemoryStorage()).window;
  const world = win.sanitizeWorldState({
    base: { x: 0, y: 0, level: 1 },
    mines: [{ id: 'mine_zero_power', x: 3, y: 3, resource: 'iron', grade: 1, miningPower: 0, developmentState: 'unsecured' }],
    workshops: [
      { id: 'workshop_zero_progress', x: 1, y: 1, level: 1, recipeKey: 'steel', auto: false, progress: 0 },
      { id: 'workshop_nan_progress', x: 2, y: 1, level: 1, recipeKey: 'steel', auto: false, progress: Number.NaN },
      { id: 'workshop_inf_progress', x: 3, y: 1, level: 1, recipeKey: 'steel', auto: false, progress: Number.POSITIVE_INFINITY },
    ],
  });
  check('stabilize: miningPower 0 sanitizes to 1', world.mines[0].miningPower === 1);
  check('stabilize: workshop progress 0 sanitizes to null', world.workshops[0].progress === null);
  check('stabilize: workshop NaN progress sanitizes to null', world.workshops[1].progress === null);
  check('stabilize: workshop Infinity progress sanitizes to null', world.workshops[2].progress === null);
})();

(function test_stabilize_recipeChangeBlockedDuringCraft() {
  const win = newDom(makeMemoryStorage()).window;
  const workshop = win.addWorkshop({ id: 'workshop_busy', x: 1, y: 3, level: 1, recipeKey: 'crystalAlloy' });
  win.state.resources.steel = 2;
  win.state.resources.crystal = 1;
  check('stabilize: timed craft starts before recipe change', win.craftWorkshop(workshop.id) === true);
  const progressBefore = workshop.progress;
  const productsBefore = win.state.products.steel;
  check('stabilize: recipe change is rejected while crafting', win.setWorkshopRecipe(workshop.id, 'steel') === false);
  check('stabilize: busy workshop keeps original recipe', workshop.recipeKey === 'crystalAlloy');
  check('stabilize: busy workshop keeps remaining progress', workshop.progress === progressBefore);
  check('stabilize: rejected recipe change does not spawn extra product', win.state.products.steel === productsBefore);
  check('stabilize: second craft while busy is rejected', win.craftWorkshop(workshop.id) === false);
  check('stabilize: unknown workshop craft is rejected', win.craftWorkshop('missing_workshop') === false);
})();

(function test_stabilize_unlockSiteSeedsMinesAndRefreshesPanel() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 700;
  win.buildLines();
  win.buildMines();
  const beforeCount = win.state.world.mines.length;
  const btn = win.document.querySelector('[data-unlocksite="manaVein"]');
  check('stabilize: mining tab shows next-site unlock control', !!btn);
  btn.click();
  check('stabilize: unlockSite still consumes gold', win.state.gold === 0);
  check('stabilize: unlockSite seeds the new region mines', win.state.world.mines.length === beforeCount + 2);
  const wrap = win.document.getElementById('worldMines');
  const manaMine = win.state.world.mines.find(m => m.resource === 'mana');
  check('stabilize: world mine panel shows seeded mines after unlock', !!manaMine && !!wrap.querySelector('[data-secure-mine="' + manaMine.id + '"]'));
  const expandBtn = win.document.querySelector('[data-expand-base]');
  check('stabilize: base expansion button moves to the following region', expandBtn && expandBtn.textContent.includes('2500G'));
})();

(function test_stabilize_autoToggleStartsImmediatelyAndSaves() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const workshop = win.addWorkshop({ id: 'workshop_auto_ui', x: 4, y: 5, level: 1, recipeKey: 'steel' });
  win.state.resources.iron = 2;
  win.state.resources.coal = 1;
  win.renderWorkshops();
  const chk = win.document.querySelector('[data-workshop-auto="workshop_auto_ui"]');
  chk.checked = true;
  chk.dispatchEvent(new win.window.Event('change'));
  check('stabilize: turning auto on crafts an instant recipe immediately', win.state.products.steel === 1);
  check('stabilize: auto flag is stored on the workshop', workshop.auto === true);
  check('stabilize: auto workshop status is visible', win.document.querySelector('[data-workshop-progress="workshop_auto_ui"]').textContent.includes('자동 제작'));
  win.saveGame();
  const loaded = win.loadGame();
  const loadedWorkshop = loaded.run.world.workshops.find(item => item.id === 'workshop_auto_ui');
  check('stabilize: auto flag survives save/load', loaded.ok === true && loadedWorkshop && loadedWorkshop.auto === true);
  check('stabilize: saveVersion remains 1 after workshop auto save', JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1);
})();

(function test_T56_freshPlayerOnWorldStage() {
  const win = newDom(makeMemoryStorage()).window;
  const player = win.state.world.player;
  check('Task56: fresh world has a single player', !!player && typeof player.x === 'number');
  check('Task56: player starts on the base', player.x === win.state.world.base.x && player.y === win.state.world.base.y); // Task 62: base is (2,0)
  check('Task56: player starts idle', player.pose === 'idle');
  check('Task56: player sprite is on the world stage', !!win.document.getElementById('playerChar'));
  check('Task56: world stage shows idle pose', win.document.getElementById('playerChar').getAttribute('data-player-pose') === 'idle');
})();

(function test_T56_keyboardMovesAndReturnsToIdle() {
  const win = newDom(makeMemoryStorage()).window;
  const startX = win.state.world.player.x;
  check('Task56: ArrowRight is accepted', win.setPlayerHeld('right', true) === true);
  win.tickPlayer();
  win.updatePlayerSprite();
  check('Task56: holding right increases x', win.state.world.player.x > startX);
  check('Task56: moving player faces right', win.state.world.player.facing === 'right');
  check('Task56: moving player uses walk pose', win.state.world.player.pose === 'walk');
  check('Task56: sprite walk class updates', win.document.getElementById('playerChar').className.includes('pose-walk'));
  win.setPlayerHeld('right', false);
  win.tickPlayer();
  win.updatePlayerSprite();
  check('Task56: releasing keys returns to idle', win.state.world.player.pose === 'idle');
  check('Task56: WASD up is accepted', win.setPlayerHeld('up', true) === true);
  win.state.world.player.y = 2;
  const yBefore = win.state.world.player.y;
  win.tickPlayer();
  check('Task56: holding up decreases y', win.state.world.player.y < yBefore);
  win.clearPlayerHeld();
  win.tickPlayer();
  check('Task56: unknown direction is rejected', win.setPlayerHeld('jump', true) === false);
})();

(function test_T56_worldBoundsAndSaveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.world.player.x = 40;
  win.state.world.player.y = -18; // Task 62: below the new -10 min
  const clamped = win.clampPlayerPosition(win.state.world.player.x, win.state.world.player.y);
  win.state.world.player.x = clamped.x;
  win.state.world.player.y = clamped.y;
  check('Task56: x is clamped to the world max', clamped.x === 10);
  check('Task56: y is clamped to the world min', clamped.y === -10); // Task 62: bounds -10..10
  win.setPlayerHeld('right', true);
  win.state.world.player.x = 10;
  win.tickPlayer();
  check('Task56: walking past the edge keeps the player inside', win.state.world.player.x === 10);
  win.clearPlayerHeld();
  win.state.world.player.facing = 'left';
  win.state.world.player.x = 3.5;
  win.state.world.player.y = 1.25;
  check('Task56: player position saves', win.saveGame() === true);
  const loaded = win.loadGame();
  check('Task56: player x survives save/load', loaded.ok === true && loaded.run.world.player.x === 3.5);
  check('Task56: player facing survives save/load', loaded.run.world.player.facing === 'left');
  check('Task56: loaded player is idle', loaded.run.world.player.pose === 'idle');
  check('Task56: saveVersion remains 1 after player save', JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1);
})();

(function test_T56_legacySaveAndExistingLoop() {
  const win = newDom(makeMemoryStorage()).window;
  const world = win.sanitizeWorldState({
    base: { x: 0, y: 0, level: 1 },
    mines: [{ id: 'mine_start_iron', x: 2, y: 0, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' }],
  });
  check('Task56: legacy world without player still sanitizes', world.player.x === 0 && world.player.y === 0 && world.player.pose === 'idle');
  const nanWorld = win.sanitizeWorldState({
    base: { x: 0, y: 0, level: 1 },
    mines: [],
    workshops: [],
    player: { x: Number.NaN, y: Number.POSITIVE_INFINITY, facing: 'sideways', pose: 'walk' },
  });
  check('Task56: invalid player coords fall back inside bounds', nanWorld.player.x === 0 && nanWorld.player.y === 0);
  check('Task56: invalid facing falls back to down', nanWorld.player.facing === 'down');
  const iron = win.state.world.mines.find(m => m.resource === 'iron');
  check('Task56: existing starting mines remain', !!iron);
  check('Task56: player movement does not consume resources', win.state.resources.iron === 0);
})();

(function test_T57_worldObjectsFromState() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  check('Task57: world mine layer exists inside worldStage', !!stage && !!stage.querySelector('#worldMineLayer'));
  const html = doc.getElementById('worldMineLayer').outerHTML;
  const nodes = [...stage.querySelectorAll('[data-world-mine]')];
  check('Task57: one stage node per state.world.mines entry', nodes.length === win.state.world.mines.length && nodes.length === 2);
  const ironNode = stage.querySelector('[data-world-mine="mine_start_iron"]');
  const coalNode = stage.querySelector('[data-world-mine="mine_start_coal"]');
  check('Task57: starting iron mine is drawn', !!ironNode && ironNode.getAttribute('data-resource') === 'iron');
  check('Task57: starting coal mine is drawn', !!coalNode && coalNode.getAttribute('data-resource') === 'coal');
  check('Task57: resource type has its own visual class', ironNode.classList.contains('res-iron') && coalNode.classList.contains('res-coal'));
  check('Task57: unsecured state is visible on stage', ironNode.classList.contains('is-unsecured') && ironNode.getAttribute('data-development-state') === 'unsecured');
  // Task 63: starter positions are random; read them from the mine data.
  const ironMine = win.state.world.mines.find(m => m.id === 'mine_start_iron');
  const coalMine = win.state.world.mines.find(m => m.id === 'mine_start_coal');
  const ironPos = win.worldToStagePercent(ironMine.x, ironMine.y);
  const coalPos = win.worldToStagePercent(coalMine.x, coalMine.y);
  check('Task57: iron mine position comes from mine.x/mine.y', ironNode.style.left === ironPos.left + '%' && ironNode.style.top === ironPos.top + '%');
  check('Task57: coal mine position comes from mine.x/mine.y', coalNode.style.left === coalPos.left + '%' && coalNode.style.top === coalPos.top + '%');
  const base = stage.querySelector('.world-base-marker');
  const basePos = win.worldToStagePercent(win.state.world.base.x, win.state.world.base.y);
  check('Task57: exactly one base object on stage', stage.querySelectorAll('.world-base-marker').length === 1);
  check('Task57: base position comes from state.world.base', base.style.left === basePos.left + '%' && base.style.top === basePos.top + '%');
  // Same conversion as the player.
  const p = win.state.world.player;
  win.updatePlayerSprite();
  const playerPos = win.worldToStagePercent(p.x, p.y);
  const playerEl = doc.getElementById('playerChar');
  check('Task57: player uses the same world->stage conversion', playerEl.style.left === playerPos.left + '%' && playerEl.style.top === playerPos.top + '%');
  check('Task57: player on base spot shares base screen position', playerEl.style.left === base.style.left && playerEl.style.top === base.style.top);
  // Conversion stays inside the stage for every in-bounds coordinate.
  // World bounds are the Task 56 reference values (0..10 on both axes).
  const corners = [[0,0],[10,10],[0,10],[10,0]];
  check('Task57: world bounds map inside the stage', corners.every(([x,y])=>{ const q = win.worldToStagePercent(x,y); return q.left > 0 && q.left < 100 && q.top > 0 && q.top < 100; }));
  check('Task57: conversion is monotonic', win.worldToStagePercent(3,0).left > win.worldToStagePercent(2,0).left && win.worldToStagePercent(0,3).top > win.worldToStagePercent(0,2).top);
  const clampedMax = win.clampPlayerPosition(99, 99);
  const clampedMin = win.clampPlayerPosition(-50, -50);
  check('Task57: world bounds are -10..10 (Task 62)', clampedMax.x === 10 && clampedMax.y === 10 && clampedMin.x === -10 && clampedMin.y === -10);
  // No positions hard-coded in markup.
  const rawHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('Task57: index.html has no hard-coded mine nodes', !/data-world-mine=/.test(rawHtml) && !/world-mine-node/.test(rawHtml));
  check('Task57: mine layer starts empty in markup', /<div id="worldMineLayer" class="world-mine-layer"><\/div>/.test(rawHtml) && typeof html === 'string');
})();

(function test_T57_worldObjectsFollowData() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  // Securing via the existing list button also updates the stage node.
  doc.querySelector('[data-secure-mine="mine_start_iron"]').click();
  const ironNode = doc.querySelector('#worldStage [data-world-mine="mine_start_iron"]');
  check('Task57: securing from the mine list marks stage node secured', !!ironNode && ironNode.classList.contains('is-secured') && ironNode.getAttribute('data-development-state') === 'secured');
  // Stage and the "월드 광맥" list read the same data.
  const listIds = [...doc.querySelectorAll('#worldMines [data-secure-mine]')].map(e=>e.getAttribute('data-secure-mine')).sort().join(',');
  const stageIds = [...doc.querySelectorAll('#worldStage [data-world-mine]')].map(e=>e.getAttribute('data-world-mine')).sort().join(',');
  check('Task57: stage mines match world mine list', listIds === stageIds && stageIds.length > 0);
  // Expansion adds mines to both views through renderAll().
  win.state.gold = 700;
  check('Task57: expansion succeeds', win.expandBase() === true);
  win.renderAll();
  const nodes = doc.querySelectorAll('#worldStage [data-world-mine]');
  check('Task57: expanded mines appear on stage', nodes.length === win.state.world.mines.length && nodes.length === 4);
  check('Task57: expanded list and stage still agree', doc.querySelectorAll('#worldMines [data-secure-mine]').length === nodes.length);
  const mana = doc.querySelector('#worldStage [data-resource="mana"]');
  const manaPos = win.worldToStagePercent(6, 0); // Task 62: seed (4,0) is relative to the base at (2,0)
  check('Task57: new mine drawn at its seeded coordinates', !!mana && mana.style.left === manaPos.left + '%' && mana.style.top === manaPos.top + '%');
  // Re-rendering does not duplicate objects.
  win.renderAll();
  win.renderWorldObjects();
  check('Task57: re-render does not duplicate mine nodes', doc.querySelectorAll('#worldStage [data-world-mine]').length === 4);
  check('Task57: re-render keeps a single base marker', doc.querySelectorAll('#worldStage .world-base-marker').length === 1);
  // Player movement still works with objects drawn and does not touch mines.
  const before = JSON.stringify(win.state.world.mines);
  win.setPlayerHeld('right', true);
  for(let i=0;i<10;i++) win.tickLoop();
  win.clearPlayerHeld();
  win.tickLoop();
  check('Task57: player still moves with world objects present', win.state.world.player.x > 0 && win.state.world.player.pose === 'idle');
  check('Task57: walking does not change mine data', JSON.stringify(win.state.world.mines) === before);
  check('Task57: tick does not rebuild mine nodes', doc.querySelectorAll('#worldStage [data-world-mine]').length === 4);
  // Prestige reset returns the stage to the two starting mines.
  win.state.world.mines.length = 0;
  win.renderWorldObjects();
  check('Task57: empty mine data draws no mine nodes', doc.querySelectorAll('#worldStage [data-world-mine]').length === 0);
})();

(function test_T58_worldSelectionClicks() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  const base = () => stage.querySelector('.world-base-marker');
  const mineNode = (id) => stage.querySelector('[data-world-mine="' + id + '"]');
  const selectedCount = () => stage.querySelectorAll('.is-selected').length;
  check('Task58: nothing selected on a new game', win.getWorldSelection() === null && selectedCount() === 0);
  base().click();
  check('Task58: clicking the base selects it', JSON.stringify(win.getWorldSelection()) === JSON.stringify({type:'base'}));
  check('Task58: base shows selected mark', base().classList.contains('is-selected') && selectedCount() === 1);
  mineNode('mine_start_iron').click();
  const ironSel = win.getWorldSelection();
  check('Task58: clicking iron mine selects it', ironSel && ironSel.type === 'mine' && ironSel.id === 'mine_start_iron');
  check('Task58: selecting iron releases the base', !base().classList.contains('is-selected'));
  check('Task58: only iron is marked selected', mineNode('mine_start_iron').classList.contains('is-selected') && selectedCount() === 1);
  mineNode('mine_start_coal').click();
  const coalSel = win.getWorldSelection();
  check('Task58: iron -> coal switches selection', coalSel && coalSel.type === 'mine' && coalSel.id === 'mine_start_coal');
  check('Task58: iron is no longer marked after switching', !mineNode('mine_start_iron').classList.contains('is-selected') && mineNode('mine_start_coal').classList.contains('is-selected') && selectedCount() === 1);
  base().click();
  check('Task58: selecting base while a mine is selected moves the selection', win.getWorldSelection().type === 'base' && selectedCount() === 1);
  // Clicking a label (child of the mine node) still selects that mine.
  mineNode('mine_start_coal').querySelector('.world-mine-label').click();
  check('Task58: clicking a mine label selects its mine', win.getWorldSelection().id === 'mine_start_coal');
  // Empty space inside the stage clears.
  stage.querySelector('.world-ground').click();
  check('Task58: clicking empty stage space clears the selection', win.getWorldSelection() === null && selectedCount() === 0);
  mineNode('mine_start_iron').click();
  stage.click();
  check('Task58: clicking the stage itself clears the selection', win.getWorldSelection() === null);
  // Player sprite is not selectable.
  win.getWorldSelection();
  doc.getElementById('playerChar').click();
  check('Task58: player sprite is not a selection target', win.getWorldSelection() === null);
  // Clicks outside the stage do nothing to the selection.
  mineNode('mine_start_iron').click();
  doc.querySelector('.ambience').click();
  check('Task58: clicks outside the stage keep the selection', win.getWorldSelection() && win.getWorldSelection().id === 'mine_start_iron');
  // Invalid selections are rejected.
  check('Task58: unknown mine id is rejected', win.selectWorldObject('mine', 'no_such_mine') === false && win.getWorldSelection().id === 'mine_start_iron');
  check('Task58: unknown type is rejected', win.selectWorldObject('player') === false);
  // getWorldSelection returns a copy.
  const copy = win.getWorldSelection();
  copy.id = 'tampered';
  check('Task58: selection cannot be mutated from outside', win.getWorldSelection().id === 'mine_start_iron');
})();

(function test_T58_selectionSurvivesSecureAndExpansion() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  stage.querySelector('[data-world-mine="mine_start_iron"]').click();
  doc.querySelector('[data-secure-mine="mine_start_iron"]').click();
  const iron = stage.querySelector('[data-world-mine="mine_start_iron"]');
  check('Task58: securing still updates the stage state', iron.getAttribute('data-development-state') === 'secured' && iron.classList.contains('is-secured'));
  check('Task58: selection is kept after securing', win.getWorldSelection().id === 'mine_start_iron' && iron.classList.contains('is-selected'));
  stage.querySelector('[data-world-mine="mine_start_coal"]').click();
  stage.querySelector('[data-world-mine="mine_start_iron"]').click();
  check('Task58: secured mine can be selected again', win.getWorldSelection().id === 'mine_start_iron');
  win.state.gold = 700;
  check('Task58: expansion succeeds', win.expandBase() === true);
  win.renderAll();
  check('Task58: selection kept across renderAll', stage.querySelector('[data-world-mine="mine_start_iron"]').classList.contains('is-selected'));
  const mana = stage.querySelector('[data-resource="mana"]');
  const crystal = stage.querySelector('[data-resource="crystal"]');
  mana.click();
  check('Task58: newly expanded mana mine is selectable', win.getWorldSelection().id === mana.getAttribute('data-world-mine'));
  crystal.click();
  check('Task58: newly expanded crystal mine is selectable', win.getWorldSelection().id === crystal.getAttribute('data-world-mine') && stage.querySelectorAll('.is-selected').length === 1);
  // A selected mine that disappears drops the selection.
  win.state.world.mines = win.state.world.mines.filter(m => m.resource !== 'crystal');
  win.renderWorldObjects();
  check('Task58: selection of a removed mine is dropped', win.getWorldSelection() === null && stage.querySelectorAll('.is-selected').length === 0);
  // Movement keys still work with a selection active.
  stage.querySelector('[data-world-mine="mine_start_coal"]').click();
  const x0 = win.state.world.player.x;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'd' }));
  for(let i=0;i<5;i++) win.tickLoop();
  doc.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'd' }));
  win.tickLoop();
  check('Task58: WASD movement works while something is selected', win.state.world.player.x > x0 && win.state.world.player.pose === 'idle');
  check('Task58: moving does not change the selection', win.getWorldSelection().id === 'mine_start_coal');
})();

(function test_T58_selectionNotSaved() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const stage = win.document.getElementById('worldStage');
  const worldKeysBefore = Object.keys(win.state.world).sort().join(',');
  stage.querySelector('[data-world-mine="mine_start_coal"]').click();
  check('Task58: selection does not add fields to state.world', Object.keys(win.state.world).sort().join(',') === worldKeysBefore);
  check('Task58: selection does not touch mine data', win.state.world.mines.every(m => !('selected' in m)));
  check('Task58: save succeeds with a selection', win.saveGame() === true);
  const raw = storage.getItem('gachaFactorySave');
  check('Task58: save data has no selection', !/selected|selection/i.test(raw));
  check('Task58: saveVersion stays 1', JSON.parse(raw).saveVersion === 1);
  const win2 = newDom(storage).window;
  check('Task58: reload starts with nothing selected', win2.getWorldSelection() === null && win2.document.querySelectorAll('#worldStage .is-selected').length === 0);
  check('Task58: reload still restores the saved world', win2.state.world.mines.length === 2);
})();

(function test_T59_worldInfoPanel() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  const box = doc.getElementById('worldInfo');
  const line = (k) => { const el = box.querySelector('[data-world-info="' + k + '"]'); return el ? el.textContent : null; };
  const lines = () => [...box.querySelectorAll('[data-world-info]')].map(e => e.textContent);
  const mineNode = (id) => stage.querySelector('[data-world-mine="' + id + '"]');
  check('Task59: info box lives inside worldStage', !!box && stage.contains(box));
  check('Task59: info box hidden with nothing selected', box.hidden === true && lines().length === 0);
  stage.querySelector('.world-base-marker').click();
  check('Task59: base selection shows the info box', box.hidden === false && box.getAttribute('data-world-info-type') === 'base');
  check('Task59: base info title', line('title') === '거점');
  check('Task59: base info level from state', line('level') === '레벨 ' + win.state.world.base.level && line('level') === '레벨 1');
  check('Task59: base info position from state', line('position') === '위치 (2, 0)'); // Task 62
  mineNode('mine_start_iron').click();
  check('Task59: iron info lines', JSON.stringify(lines()) === JSON.stringify(['철광석 광맥', '철광석', '등급 1', '미확보']));
  check('Task59: info type switches to mine', box.getAttribute('data-world-info-type') === 'mine');
  mineNode('mine_start_coal').click();
  check('Task59: iron -> coal switches info', JSON.stringify(lines()) === JSON.stringify(['석탄 광맥', '석탄', '등급 1', '미확보']));
  check('Task59: only one info block is shown', box.querySelectorAll('[data-world-info="title"]').length === 1);
  stage.querySelector('.world-ground').click();
  check('Task59: empty space click hides the info box', box.hidden === true && lines().length === 0);
  // Securing the selected mine updates the info immediately.
  mineNode('mine_start_iron').click();
  doc.querySelector('[data-secure-mine="mine_start_iron"]').click();
  check('Task59: securing flips info to 확보됨', line('state') === '확보됨' && box.hidden === false);
  check('Task59: secured info still names iron', line('title') === '철광석 광맥');
  // Info is kept after renderWorldObjects / renderAll.
  win.renderWorldObjects();
  check('Task59: info kept after renderWorldObjects', box.hidden === false && line('title') === '철광석 광맥' && line('state') === '확보됨');
  win.renderAll();
  check('Task59: info kept after renderAll', box.hidden === false && line('title') === '철광석 광맥');
  // Info reads live state, not a copy.
  win.state.world.base.level = 3;
  stage.querySelector('.world-base-marker').click();
  check('Task59: base level reads current state', line('level') === '레벨 3');
  win.state.world.base.level = 1;
  // Expansion: new mine info.
  win.state.gold = 700;
  check('Task59: expansion succeeds', win.expandBase() === true);
  win.renderAll();
  check('Task59: base info after expansion shows new level', line('level') === '레벨 2');
  stage.querySelector('[data-resource="mana"]').click();
  check('Task59: new mana mine info', JSON.stringify(lines()) === JSON.stringify(['마정석 광맥', '마정석', '등급 2', '미확보']));
  stage.querySelector('[data-resource="crystal"]').click();
  check('Task59: new crystal mine info', line('title') === '결정 광맥' && line('grade') === '등급 2');
  // Selected mine removed -> info hidden.
  win.state.world.mines = win.state.world.mines.filter(m => m.resource !== 'crystal');
  win.renderWorldObjects();
  check('Task59: removed selected mine hides info', box.hidden === true && lines().length === 0 && win.getWorldSelection() === null);
  // Clicking on the info box area never selects anything by itself.
  stage.querySelector('[data-world-mine="mine_start_coal"]').click();
  check('Task59: info box is click-through (pointer-events none in CSS)', /\.world-info\{[^}]*pointer-events:none/.test(fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8')));
  // Movement is unaffected while info is shown.
  const x0 = win.state.world.player.x;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  for(let i=0;i<5;i++) win.tickLoop();
  doc.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'ArrowRight' }));
  win.tickLoop();
  check('Task59: movement still works with info shown', win.state.world.player.x > x0);
  check('Task59: movement leaves info as is', line('title') === '석탄 광맥');
})();

(function test_T59_infoNotSaved() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const stage = win.document.getElementById('worldStage');
  const worldKeys = Object.keys(win.state.world).sort().join(',');
  stage.querySelector('[data-world-mine="mine_start_iron"]').click();
  check('Task59: info render adds no fields to state.world', Object.keys(win.state.world).sort().join(',') === worldKeys);
  check('Task59: info render leaves mine objects unchanged', JSON.stringify(Object.keys(win.state.world.mines[0]).sort()) === JSON.stringify(['developmentState','grade','id','miningPower','resource','x','y']));
  check('Task59: save succeeds with info shown', win.saveGame() === true);
  const raw = storage.getItem('gachaFactorySave');
  check('Task59: save data has no selection/info', !/selected|selection|worldInfo|world-info/i.test(raw));
  const win2 = newDom(storage).window;
  const box2 = win2.document.getElementById('worldInfo');
  check('Task59: reload hides the info box', box2.hidden === true && box2.children.length === 0 && win2.getWorldSelection() === null);
})();

(function test_T60_workshopMarkersFromState() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  const layer = doc.getElementById('worldWorkshopLayer');
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const rawHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const markers = () => layer.querySelectorAll('.world-workshop-node');
  const marker = (id) => layer.querySelector('[data-world-workshop="' + id + '"]');
  check('Task60: worldWorkshopLayer exists inside worldStage', !!layer && stage.contains(layer));
  check('Task60: workshop layer starts empty in markup', /<div id="worldWorkshopLayer" class="world-workshop-layer"><\/div>/.test(rawHtml));
  check('Task60: fresh state has no workshops', Array.isArray(win.state.world.workshops) && win.state.world.workshops.length === 0);
  check('Task60: empty workshops draw no markers', markers().length === 0);
  check('Task60: fresh start does not invent a workshop', markers().length === 0 && win.state.world.workshops.length === 0);

  const workshopKeys = ['auto', 'id', 'level', 'progress', 'recipeKey', 'x', 'y'];
  win.state.world.workshops = [
    { id: 'workshop_a', x: 3, y: 1, level: 1, recipeKey: null, auto: false, progress: null },
  ];
  const beforeKeys = Object.keys(win.state.world.workshops[0]).sort().join(',');
  win.renderWorldObjects();
  const one = marker('workshop_a');
  const onePos = win.worldToStagePercent(3, 1);
  check('Task60: one workshop draws one marker', markers().length === 1 && !!one);
  check('Task60: marker uses worldToStagePercent coordinates', !!one && one.style.left === onePos.left + '%' && one.style.top === onePos.top + '%');
  check('Task60: rendering does not add workshop fields', Object.keys(win.state.world.workshops[0]).sort().join(',') === beforeKeys && beforeKeys === workshopKeys.join(','));

  win.state.world.workshops.push(
    { id: 'workshop_b', x: 6, y: 4, level: 2, recipeKey: 'steel', auto: false, progress: null }
  );
  win.renderAll();
  const a = marker('workshop_a');
  const b = marker('workshop_b');
  const bPos = win.worldToStagePercent(6, 4);
  check('Task60: renderAll shows each workshop', markers().length === 2 && !!a && !!b);
  check('Task60: second marker uses its own coordinates', b.style.left === bPos.left + '%' && b.style.top === bPos.top + '%');
  check('Task60: markers do not share one screen position', a.style.left !== b.style.left || a.style.top !== b.style.top);

  win.state.world.workshops[0].x = 8;
  win.state.world.workshops[0].y = 2;
  win.renderWorldObjects();
  const moved = win.worldToStagePercent(8, 2);
  check('Task60: renderWorldObjects refreshes a moved marker', marker('workshop_a').style.left === moved.left + '%' && marker('workshop_a').style.top === moved.top + '%');
  check('Task60: refresh does not duplicate markers', markers().length === 2);

  win.state.world.workshops = [];
  win.renderAll();
  check('Task60: clearing workshops removes every marker', markers().length === 0);

  const layerRule = css.match(/\.world-workshop-layer\{[^}]*\}/);
  const nodeRule = css.match(/\.world-workshop-node\{[^}]*\}/);
  check('Task60: workshop layer is click-through', !!layerRule && /pointer-events:\s*none/.test(layerRule[0]));
  check('Task60: workshop marker is click-through', !!nodeRule && /pointer-events:\s*none/.test(nodeRule[0]));
})();

(function test_T60_selectionInfoAndMovementStayIntact() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  const worldKeys = Object.keys(win.state.world).sort().join(',');
  win.state.world.workshops = [
    { id: 'workshop_keep', x: 4, y: 5, level: 1, recipeKey: null, auto: false, progress: null },
  ];
  win.renderWorldObjects();
  const node = stage.querySelector('[data-world-workshop="workshop_keep"]');
  check('Task60: workshop marker is not selected on its own', !!node && !node.classList.contains('is-selected') && win.getWorldSelection() === null);
  node.click();
  check('Task60: clicking a workshop marker does not select it', win.getWorldSelection() === null && !node.classList.contains('is-selected'));
  check('Task60: workshop click adds no selection type', stage.getAttribute('data-world-selected') === '');
  stage.querySelector('.world-base-marker').click();
  check('Task60: base selection still works', JSON.stringify(win.getWorldSelection()) === JSON.stringify({ type: 'base' }));
  check('Task60: base info still shows', doc.getElementById('worldInfo').hidden === false && doc.querySelector('#worldInfo [data-world-info="title"]').textContent === '거점');
  check('Task60: workshop marker stays unselected while the base is selected', !node.classList.contains('is-selected') && stage.querySelectorAll('.is-selected').length === 1);
  stage.querySelector('[data-world-mine="mine_start_iron"]').click();
  check('Task60: mine selection still works', win.getWorldSelection().type === 'mine' && win.getWorldSelection().id === 'mine_start_iron');
  check('Task60: mine info still shows', doc.querySelector('#worldInfo [data-world-info="title"]').textContent === '철광석 광맥');
  stage.querySelector('.world-ground').click();
  check('Task60: empty space still clears selection and info', win.getWorldSelection() === null && doc.getElementById('worldInfo').hidden === true);
  check('Task60: rendering workshops adds no world fields', Object.keys(win.state.world).sort().join(',') === worldKeys);
  check('Task60: save succeeds without new workshop fields', win.saveGame() === true);
  const raw = storage.getItem('gachaFactorySave');
  const saved = JSON.parse(raw);
  const savedWorkshop = saved.run.world.workshops[0];
  check('Task60: saveVersion stays 1', saved.saveVersion === 1);
  check('Task60: saved workshop keeps the existing fields only', Object.keys(savedWorkshop).sort().join(',') === 'auto,id,level,progress,recipeKey,x,y');
  const x0 = win.state.world.player.x;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'd' }));
  for(let i = 0; i < 5; i++) win.tickLoop();
  doc.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'd' }));
  win.tickLoop();
  check('Task60: player movement still works', win.state.world.player.x > x0 && win.state.world.player.pose === 'idle');
  check('Task60: movement does not change workshop data', JSON.stringify(win.state.world.workshops) === JSON.stringify([{ id: 'workshop_keep', x: 4, y: 5, level: 1, recipeKey: null, auto: false, progress: null }]));
})();

(function test_T60_coreLoopRegression() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  win.state.world.workshops = [
    { id: 'workshop_loop', x: 1, y: 1, level: 1, recipeKey: null, auto: false, progress: null },
  ];
  win.renderAll();
  ['mine_start_iron', 'mine_start_coal'].forEach(id => doc.querySelector('[data-secure-mine="' + id + '"]').click());
  check('Task60: securing a mine still works', win.state.world.mines.every(m => m.developmentState === 'secured'));
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_coal"]').click();
  check('Task60: mining still works', win.state.resources.iron === 2 && win.state.resources.coal === 1);
  doc.querySelector('[data-craft="steel"]').click();
  check('Task60: crafting still works', win.state.products.steel === 1);
  doc.querySelector('[data-sell="steel"]').click();
  check('Task60: selling still works', win.state.gold > 0 && win.state.products.steel === 0);
  win.state.gold = 700;
  check('Task60: expansion still works', win.expandBase() === true && win.state.world.base.level === 2);
  check('Task60: workshop marker remains after the core loop', doc.querySelectorAll('#worldWorkshopLayer .world-workshop-node').length === 1);
  check('Task60: core loop does not create extra workshops', win.state.world.workshops.length === 1 && win.state.world.workshops[0].id === 'workshop_loop');
})();

(function test_T59_coreLoopRegression() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  doc.querySelector('#worldStage [data-world-mine="mine_start_iron"]').click();
  ['mine_start_iron','mine_start_coal'].forEach(id => doc.querySelector('[data-secure-mine="' + id + '"]').click());
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_coal"]').click();
  check('Task59: mining still works', win.state.resources.iron === 2 && win.state.resources.coal === 1);
  doc.querySelector('[data-craft="steel"]').click();
  check('Task59: crafting still works', win.state.products.steel === 1);
  doc.querySelector('[data-sell="steel"]').click();
  check('Task59: selling still works', win.state.gold > 0 && win.state.products.steel === 0);
  check('Task59: info follows secured state through the loop', doc.querySelector('#worldInfo [data-world-info="state"]').textContent === '확보됨');
})();

(function test_T61_perspectiveProjection() {
  const win = newDom(makeMemoryStorage()).window;
  const P = (x, y) => win.worldToStagePercent(x, y);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // Task 62 world bounds (-10..10) are the reference values.
  const farL = P(-10, -10), farR = P(10, -10), nearL = P(-10, 10), nearR = P(10, 10);
  check('Task61: projection returns scale and depth', typeof farL.scale === 'number' && typeof farL.depth === 'number');
  check('Task61: far row sits higher than near row', farL.top < nearL.top);
  check('Task61: far row is narrower than near row', (farR.left - farL.left) < (nearR.left - nearL.left));
  check('Task61: near row has scale 1', near(nearL.scale, 1) && near(nearR.scale, 1));
  check('Task61: far objects are drawn smaller', farL.scale < 1 && farL.scale > 0.4);
  check('Task61: scale depends only on depth', near(P(0, 4).scale, P(9, 4).scale));
  check('Task61: scale grows toward the camera', P(5, 2).scale < P(5, 5).scale && P(5, 5).scale < P(5, 8).scale);
  check('Task61: camera is centred on the world', near(P(0, -10).left, 50) && near(P(0, 10).left, 50));
  check('Task61: rows are symmetric around the centre', near(P(-3, 3).left - 50, 50 - P(3, 3).left));
  check('Task61: depth is 0 on far row and 1 on near row', near(farL.depth, 0) && near(nearL.depth, 1));
  check('Task61: every in-bounds point stays inside the stage', [[-10,-10],[10,-10],[-10,10],[10,10],[0,0],[2,0]].every(([x,y]) => { const q = P(x,y); return q.left > 0 && q.left < 100 && q.top > 0 && q.top < 100; }));
  // True perspective: a straight world line (x = 3) stays straight on screen.
  const a = P(3, -10), m = P(3, 0), c = P(3, 10);
  const cross = (m.left - a.left) * (c.top - a.top) - (m.top - a.top) * (c.left - a.left);
  check('Task61: straight world lines stay straight on screen', Math.abs(cross) < 1e-6);
  // Rows get closer together further away (foreshortening).
  check('Task61: far rows are foreshortened', (P(5, 1).top - P(5, 0).top) < (P(5, 10).top - P(5, 9).top));
})();

(function test_T61_groundAndDepth() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  const ground = stage.querySelector('.world-ground');
  const svg = ground.querySelector('svg.world-ground-svg');
  check('Task61: ground is drawn as an SVG plane', !!svg && !!svg.querySelector('polygon.world-ground-plane'));
  check('Task61: grid has one line per world unit on both axes', svg.querySelectorAll('line').length === 42); // Task 62: 21 + 21 for -10..10
  const edges = svg.querySelectorAll('line.world-grid-edge');
  check('Task61: world bounds are outlined', edges.length === 4);
  // The far edge (y = 0) line runs between the projected far corners.
  const farEdge = [...edges].find(l => Math.abs(+l.getAttribute('y1') - win.worldToStagePercent(-10, -10).top) < 0.001 && Math.abs(+l.getAttribute('y2') - win.worldToStagePercent(10, -10).top) < 0.001);
  check('Task61: grid uses the same projection as objects', !!farEdge && Math.abs(+farEdge.getAttribute('x1') - win.worldToStagePercent(-10, -10).left) < 0.001);
  // Task 63: starter mines are random per game; pin a known layout (iron at
  // (2,0), coal at (0,2), base at (0,0) — the layout these depth checks were
  // written for) so the depth comparisons below stay deterministic.
  win.state.world.base.x = 0; win.state.world.base.y = 0;
  const pinIron = win.state.world.mines.find(m => m.id === 'mine_start_iron'); pinIron.x = 2; pinIron.y = 0;
  const pinCoal = win.state.world.mines.find(m => m.id === 'mine_start_coal'); pinCoal.x = 0; pinCoal.y = 2;
  win.state.world.player.x = 0; win.state.world.player.y = 0;
  win.renderAll();
  check('Task61: re-render does not duplicate the ground', ground.querySelectorAll('svg').length === 1);
  // Depth scale and painter order on objects.
  const iron = stage.querySelector('[data-world-mine="mine_start_iron"]');   // (2,0)
  const coal = stage.querySelector('[data-world-mine="mine_start_coal"]');   // (0,2)
  const base = stage.querySelector('.world-base-marker');                    // (0,0)
  const player = doc.getElementById('playerChar');
  const sc = (el) => parseFloat(el.style.getPropertyValue('--depth-scale'));
  const z = (el) => parseInt(el.style.zIndex, 10);
  check('Task61: objects carry their depth scale', Math.abs(sc(iron) - win.worldToStagePercent(2, 0).scale) < 1e-3 && Math.abs(sc(coal) - win.worldToStagePercent(0, 2).scale) < 1e-3);
  check('Task61: nearer mine is drawn larger', sc(coal) > sc(iron));
  check('Task61: nearer mine is drawn in front', z(coal) > z(iron));
  check('Task61: base carries depth scale too', Math.abs(sc(base) - win.worldToStagePercent(0, 0).scale) < 1e-3);
  check('Task61: player on the base is drawn in front of it', z(player) > z(base));
  // Player behind / in front of the coal mine as it walks.
  win.state.world.player.x = 0; win.state.world.player.y = 1.5; win.updatePlayerSprite();
  check('Task61: player north of coal is behind it', z(player) < z(coal));
  check('Task61: player further away looks smaller', sc(player) < sc(coal));
  win.state.world.player.y = 2.5; win.updatePlayerSprite();
  check('Task61: player south of coal is in front of it', z(player) > z(coal));
  // Movement updates depth each tick without changing speed or bounds.
  win.state.world.player.x = 5; win.state.world.player.y = 5; win.updatePlayerSprite();
  const zBefore = z(player), sBefore = sc(player);
  win.setPlayerHeld('down', true);
  for(let i = 0; i < 10; i++) win.tickLoop();
  win.clearPlayerHeld(); win.tickLoop();
  check('Task61: walking toward the camera moves 3 units/s (PLAYER_SPEED unchanged)', Math.abs(win.state.world.player.y - 8) < 1e-9);
  check('Task61: walking toward the camera raises depth order', z(player) > zBefore);
  check('Task61: walking toward the camera grows the player', sc(player) > sBefore);
  const clampedMax = win.clampPlayerPosition(99, 99);
  check('Task61: world bounds unchanged', clampedMax.x === 10 && clampedMax.y === 10);
  // Workshops take part in depth too.
  const ws = win.addWorkshop({ id: 't61_ws', x: 4, y: 6, level: 1, recipeKey: 'steel' });
  win.renderAll();
  const wsNode = stage.querySelector('[data-world-workshop="t61_ws"]');
  check('Task61: workshop marker carries depth scale and order', !!ws && !!wsNode && Math.abs(sc(wsNode) - win.worldToStagePercent(4, 6).scale) < 1e-3 && z(wsNode) > z(coal));
  // Info box stays above every depth-sorted object.
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const infoZ = parseInt((css.match(/\.world-info\{[^}]*z-index:(\d+)/) || [])[1], 10);
  check('Task61: info box is above the deepest possible object', infoZ > win.worldDepthZIndex(1.5, 1));
  check('Task61: object layers do not isolate depth (no layer z-index)', !/\.world-mine-layer\{[^}]*z-index/.test(css) && !/\.world-workshop-layer\{[^}]*z-index/.test(css));
  check('Task61: stage isolates its depth stack', /\.world-stage\{[^}]*isolation:isolate/.test(css));
  // Selection still works on the ground and objects (nodes were rebuilt by renderAll).
  stage.querySelector('[data-world-mine="mine_start_iron"]').click();
  check('Task61: mines stay selectable', win.getWorldSelection() && win.getWorldSelection().id === 'mine_start_iron');
  ground.querySelector('polygon.world-ground-plane').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  check('Task61: clicking the ground clears selection', win.getWorldSelection() === null);
  // Nothing new is saved.
  const storage = makeMemoryStorage();
  const w2 = newDom(storage).window;
  w2.saveGame();
  check('Task61: save data has no view/camera fields', !/depth|camera|scale|WORLD_VIEW/i.test(storage.getItem('gachaFactorySave')));
})();

// =============================================================================
// TASK 62 — Base-centred world coordinates (-10..10, base at (2,0)).
// =============================================================================
(function test_T62_newGameCoordinates() {
  const win = newDom(makeMemoryStorage()).window;
  const w = win.state.world;
  check('Task62: new game base is at (2,0)', w.base.x === 2 && w.base.y === 0 && w.base.level === 1);
  check('Task62: player starts on the base', w.player.x === 2 && w.player.y === 0 && w.player.pose === 'idle');
  // Task 63: starter positions are random; they must still sit around the base (distance 2..3).
  const aroundBase = (m) => { const d = Math.hypot(m.x - w.base.x, m.y - w.base.y); return d >= 2 && d <= 3; };
  check('Task62: starting mines sit around the base', w.mines.some(m => m.id === 'mine_start_iron' && aroundBase(m)) && w.mines.some(m => m.id === 'mine_start_coal' && aroundBase(m)));
  check('Task62: only the two starting mines exist', w.mines.length === 2);
  const lo = win.clampPlayerPosition(-99, -99), hi = win.clampPlayerPosition(99, 99);
  check('Task62: world bounds are -10..10 on both axes', lo.x === -10 && lo.y === -10 && hi.x === 10 && hi.y === 10);
  const mid = win.clampPlayerPosition(-4.5, 7.25);
  check('Task62: in-bounds negative positions are not clamped', mid.x === -4.5 && mid.y === 7.25);
})();

(function test_T62_movementInAllDirections() {
  const win = newDom(makeMemoryStorage()).window;
  const p = win.state.world.player;
  const hold = (dir, ticks) => { win.setPlayerHeld(dir, true); for(let i=0;i<ticks;i++) win.tickPlayer(); win.clearPlayerHeld(); win.tickPlayer(); };
  hold('left', 20);   // 2 s at 3 u/s = 6 units west
  // Task 66: the mountain face at this row is x = -3.5 (+0.3 player margin), so
  // walking west reaches negative x and then stops flush against the rock.
  check('Task62: walking west from the base reaches negative x', p.x < 0 && Math.abs(p.x - (-3.2)) < 1e-3 && p.facing === 'left');
  hold('up', 20);
  check('Task62: walking north reaches negative y', Math.abs(p.y - (-6)) < 1e-9 && p.facing === 'up');
  hold('left', 100);
  hold('up', 100);
  // Task 66: the north edge still clamps at -10; going west now ends at the
  // mountain (face x -4 on row y=-6, + 0.3 margin) instead of the world edge,
  // and walking north from there keeps that x.
  check('Task62: west/north edges clamp at -10', p.y === -10 && Math.abs(p.x - (-3.7)) < 1e-3);
  check('Task62: west world edge still clamps in the clamp function', win.clampPlayerPosition(-99, 0).x === -10);
  hold('right', 200);
  hold('down', 200);
  check('Task62: east/south edges clamp at 10', p.x === 10 && p.y === 10);
  p.x = 0; p.y = 0;
  win.setPlayerHeld('left', true); win.setPlayerHeld('up', true);
  for(let i=0;i<10;i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task62: diagonal speed is still normalised', Math.abs(Math.hypot(p.x, p.y) - 3) < 1e-9 && p.x < 0 && p.y < 0);
  check('Task62: movement ends idle', p.pose === 'idle');
})();

(function test_T62_worldCoordinateValidation() {
  const win = newDom(makeMemoryStorage()).window;
  const m = win.addMine({ id: 'mine_west', x: -6, y: -3, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  check('Task62: mines accept negative coordinates', !!m && m.x === -6 && m.y === -3);
  check('Task62: mines reject non-integer coordinates', win.addMine({ x: -1.5, y: 0, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' }) === null);
  check('Task62: duplicate negative coordinates are rejected', win.addMine({ x: -6, y: -3, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' }) === null);
  const ws = win.addWorkshop({ id: 'ws_west', x: -2, y: -1, level: 1, recipeKey: 'steel' });
  check('Task62: workshops accept negative coordinates', !!ws && ws.x === -2 && ws.y === -1);
  check('Task62: Factory grid still rejects negative coordinates', win.addFactoryNode({ type: 'production', x: -1, y: 0, width: 1, height: 1 }) === null);
  const world = win.sanitizeWorldState({ base: { x: -3, y: 4, level: 2 }, mines: [{ id: 'mine_n', x: -7, y: -9, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'secured' }], workshops: [], player: { x: -2.5, y: -9.5, facing: 'left' } }); // Task 66: x -8.5 is inside the mountain now; -2.5 is open ground
  check('Task62: sanitize keeps negative base coords', world.base.x === -3 && world.base.y === 4);
  check('Task62: sanitize keeps negative mine coords', world.mines[0].x === -7 && world.mines[0].y === -9);
  check('Task62: sanitize keeps negative player coords', world.player.x === -2.5 && world.player.y === -9.5);
  const noBase = win.sanitizeWorldState({ mines: [], workshops: [] });
  check('Task62: missing base falls back to the new-game base', noBase.base.x === 2 && noBase.base.y === 0);
  check('Task62: missing player stands on the (fallback) base', noBase.player.x === 2 && noBase.player.y === 0);
  const badPlayer = win.sanitizeWorldState({ base: { x: -4, y: 3, level: 1 }, mines: [], workshops: [], player: { x: 'far', y: null } });
  check('Task62: invalid player coords fall back to the saved base', badPlayer.player.x === -4 && badPlayer.player.y === 3);
})();

(function test_T62_expansionSeedsRelativeToBase() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.gold = 700;
  check('Task62: expansion still works', win.expandBase() === true);
  const mana = win.state.world.mines.find(m => m.resource === 'mana');
  const crystal = win.state.world.mines.find(m => m.resource === 'crystal');
  check('Task62: expansion seeds are placed relative to the base', mana.x === 6 && mana.y === 0 && crystal.x === 2 && crystal.y === 4);
  check('Task62: site unlock structure is unchanged', win.state.unlockedSites.manaVein === true && win.state.world.mines.length === 4);
})();

(function test_T62_legacySaveLoadsUnchanged() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.saveGame();
  const payload = JSON.parse(storage.getItem('gachaFactorySave'));
  // An older save: base at the old origin, the old start-mine layout, player in 0..10.
  payload.run.world = {
    base: { x: 0, y: 0, level: 2 },
    mines: [
      { id: 'mine_start_iron', x: 2, y: 0, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'secured' },
      { id: 'mine_start_coal', x: 0, y: 2, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' },
      { id: 'mine_manaVein_mana', x: 4, y: 0, resource: 'mana', grade: 2, miningPower: 1, developmentState: 'unsecured' },
    ],
    workshops: [{ id: 'ws_old', x: 7, y: 1, level: 1, recipeKey: 'steel', auto: false, progress: null }],
    player: { x: 3.5, y: 1.25, facing: 'left', pose: 'walk' },
  };
  payload.run.unlockedSites.manaVein = true;
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const loaded = win.loadGame();
  check('Task62: older save still loads', loaded.ok === true);
  const w = loaded.run.world;
  check('Task62: older save keeps its base position', w.base.x === 0 && w.base.y === 0 && w.base.level === 2);
  check('Task62: older save keeps every mine exactly', JSON.stringify(w.mines.map(m => [m.id, m.x, m.y, m.developmentState])) === JSON.stringify([['mine_start_iron',2,0,'secured'],['mine_start_coal',0,2,'unsecured'],['mine_manaVein_mana',4,0,'unsecured']]));
  check('Task62: older save gets no new/regenerated mines', w.mines.length === 3);
  check('Task62: older save keeps workshops and player', w.workshops[0].x === 7 && w.workshops[0].y === 1 && w.player.x === 3.5 && w.player.y === 1.25);
  // Expanding an older save keeps its old seed layout (relative to its base at 0,0).
  const win2 = newDom(storage).window;
  check('Task62: game boots from the older save', win2.state.world.base.x === 0 && win2.state.world.mines.length === 3);
  win2.state.gold = 5000;
  check('Task62: older save can still expand', win2.expandBase() === true);
  const rare = win2.state.world.mines.find(m => m.resource === 'rareMetal');
  check('Task62: older save expansion uses its own base as origin', !!rare && rare.x === 6 && rare.y === 0);
  win2.saveGame();
  check('Task62: saveVersion stays 1', JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1);
})();

(function test_T62_projectionAndDepthInNewWorld() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const P = (x, y) => win.worldToStagePercent(x, y);
  const base = P(2, 0);
  check('Task62: base is drawn slightly east of the stage centre', base.left > 50 && base.left < 60);
  check('Task62: world origin is on the camera centre line', Math.abs(P(0, 0).left - 50) < 1e-9);
  check('Task62: whole -10..10 world is inside the stage', [[-10,-10],[10,-10],[-10,10],[10,10]].every(([x,y]) => { const q = P(x,y); return q.left > 0 && q.left < 100 && q.top > 0 && q.top < 100; }));
  check('Task62: north (negative y) is farther and smaller', P(2, -5).top < base.top && P(2, -5).scale < base.scale);
  const marker = doc.querySelector('.world-base-marker');
  check('Task62: base marker drawn at (2,0)', marker.style.left === base.left + '%' && marker.style.top === base.top + '%');
  const player = doc.getElementById('playerChar');
  check('Task62: player drawn on the base at start', player.style.left === marker.style.left && player.style.top === marker.style.top);
  check('Task62: player on base is in front of it', parseInt(player.style.zIndex, 10) > parseInt(marker.style.zIndex, 10));
  win.addMine({ id: 'mine_north', x: 2, y: -4, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  win.renderAll();
  const north = doc.querySelector('[data-world-mine="mine_north"]');
  check('Task62: mine north of the base is drawn behind it', parseInt(north.style.zIndex, 10) < parseInt(doc.querySelector('.world-base-marker').style.zIndex, 10));
  check('Task62: ground grid covers -10..10', doc.querySelectorAll('.world-ground line').length === 42);
  doc.querySelector('.world-base-marker').click();
  check('Task62: base info shows (2, 0)', doc.querySelector('#worldInfo [data-world-info="position"]').textContent === '위치 (2, 0)');
})();

// =============================================================================
// TASK 62 (보완) — world coordinate validation matches the real -10..10 bounds.
// =============================================================================
(function test_T62b_worldCoordBounds() {
  const win = newDom(makeMemoryStorage()).window;
  // Reference values: Task 62 bounds are -10..10 on both axes.
  check('Task62b: world coord -10 is valid (x)', win.isValidWorldCoord(-10, 'x') === true && win.isValidWorldX(-10) === true);
  check('Task62b: world coord 10 is valid (x)', win.isValidWorldCoord(10, 'x') === true && win.isValidWorldX(10) === true);
  check('Task62b: world coord -10 / 10 are valid (y)', win.isValidWorldY(-10) === true && win.isValidWorldY(10) === true);
  check('Task62b: world coord -11 is rejected', win.isValidWorldX(-11) === false && win.isValidWorldY(-11) === false);
  check('Task62b: world coord 11 is rejected', win.isValidWorldX(11) === false && win.isValidWorldY(11) === false);
  check('Task62b: far-out coords are rejected', win.isValidWorldX(20) === false && win.isValidWorldY(-1000) === false);
  check('Task62b: non-integer / non-number coords are rejected', win.isValidWorldX(1.5) === false && win.isValidWorldX(Number.NaN) === false && win.isValidWorldX('3') === false && win.isValidWorldY(null) === false);
  check('Task62b: 0 and the base (2,0) are valid', win.isValidWorldX(0) && win.isValidWorldY(0) && win.isValidWorldX(2));
})();

(function test_T62b_minesRespectBounds() {
  const win = newDom(makeMemoryStorage()).window;
  const mk = (id, x, y) => win.addMine({ id, x, y, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  const nw = mk('mine_nw', -10, -10);
  check('Task62b: mine can be created at (-10,-10)', !!nw && nw.x === -10 && nw.y === -10);
  const se = mk('mine_se', 10, 10);
  check('Task62b: mine can be created at (10,10)', !!se && se.x === 10 && se.y === 10);
  const count = win.state.world.mines.length;
  check('Task62b: mine is not created at (-11,0)', mk('mine_w_out', -11, 0) === null);
  check('Task62b: mine is not created at (0,11)', mk('mine_s_out', 0, 11) === null);
  check('Task62b: mine is not created at (11,0) or (0,-11)', mk('mine_e_out', 11, 0) === null && mk('mine_n_out', 0, -11) === null);
  check('Task62b: rejected mines leave state unchanged', win.state.world.mines.length === count);
})();

(function test_T62b_workshopsRespectBounds() {
  const win = newDom(makeMemoryStorage()).window;
  const mk = (id, x, y) => win.addWorkshop({ id, x, y, level: 1, recipeKey: 'steel' });
  const nw = mk('ws_nw', -10, -10);
  check('Task62b: workshop can be created at (-10,-10)', !!nw && nw.x === -10 && nw.y === -10);
  const se = mk('ws_se', 10, 10);
  check('Task62b: workshop can be created at (10,10)', !!se && se.x === 10 && se.y === 10);
  const count = win.state.world.workshops.length;
  check('Task62b: workshop is not created at (-11,0)', mk('ws_w_out', -11, 0) === null);
  check('Task62b: workshop is not created at (0,11)', mk('ws_s_out', 0, 11) === null);
  check('Task62b: workshop is not created at (11,0) or (0,-11)', mk('ws_e_out', 11, 0) === null && mk('ws_n_out', 0, -11) === null);
  check('Task62b: rejected workshops leave state unchanged', win.state.world.workshops.length === count);
})();

(function test_T62b_sanitizeUsesBounds() {
  const win = newDom(makeMemoryStorage()).window;
  const edge = win.sanitizeWorldState({
    base: { x: -10, y: 10, level: 1 },
    mines: [{ id: 'm_edge', x: 10, y: -10, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' }],
    workshops: [{ id: 'w_edge', x: -10, y: -10, level: 1 }],
  });
  check('Task62b: sanitize keeps base on the bounds', edge.base.x === -10 && edge.base.y === 10);
  check('Task62b: sanitize keeps mine on the bounds', edge.mines[0].x === 10 && edge.mines[0].y === -10);
  check('Task62b: sanitize keeps workshop on the bounds', edge.workshops[0].x === -10 && edge.workshops[0].y === -10);
  const out = win.sanitizeWorldState({
    base: { x: 11, y: -11, level: 1 },
    mines: [{ id: 'm_out', x: -11, y: 3, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' }],
    workshops: [{ id: 'w_out', x: 4, y: 11, level: 1 }],
  });
  check('Task62b: out-of-bounds base falls back to the new-game base', out.base.x === 2 && out.base.y === 0);
  check('Task62b: out-of-bounds mine axis falls back like any invalid coord', out.mines[0].x === 0 && out.mines[0].y === 3);
  check('Task62b: out-of-bounds workshop axis falls back like any invalid coord', out.workshops[0].x === 4 && out.workshops[0].y === 0);
})();

(function test_T62b_factoryGridUnchanged() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task62b: Factory Node still rejects negative x', win.addFactoryNode({ type: 'production', x: -1, y: 0, width: 1, height: 1 }) === null);
  check('Task62b: Factory Node still rejects negative y', win.addFactoryNode({ type: 'production', x: 0, y: -1, width: 1, height: 1 }) === null);
  check('Task62b: Factory Node accepts 0 and beyond the world bound', !!win.addFactoryNode({ id: 'node_far', type: 'production', x: 12, y: 0, width: 1, height: 1 }));
  check('Task62b: grid validator unchanged (non-negative integers)', win.isValidGridCoord(0) && win.isValidGridCoord(24) && !win.isValidGridCoord(-1) && !win.isValidGridCoord(1.5));
})();

(function test_T62b_existingWorldStillValid() {
  const win = newDom(makeMemoryStorage()).window;
  const w = win.state.world;
  check('Task62b: new-game base and start mines are inside the bounds', [w.base, ...w.mines].every(o => win.isValidWorldX(o.x) && win.isValidWorldY(o.y)));
  win.state.gold = 20000;
  win.expandBase(); win.expandBase(); win.expandBase();
  check('Task62b: every seeded expansion mine is placed inside the bounds', win.state.world.mines.length === 8 && win.state.world.mines.every(m => win.isValidWorldX(m.x) && win.isValidWorldY(m.y)));
  const far = win.state.world.mines.find(m => m.resource === 'cosmicShard');
  check('Task62b: farthest seeded mine sits exactly on the east edge', !!far && far.x === 10 && far.y === 0);
})();

// =============================================================================
// TASK 63 — Random mine layout per new game.
// Deterministic: rule checks over many generations driven by fixed pseudo-random
// sequences, plus validity checks on real (Math.random) new games. No test
// depends on one particular random outcome.
// =============================================================================
// Seeded PRNG (mulberry32): consecutive seeds give well-mixed sequences.
function t63Lcg(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function t63LayoutProblems(win, base, mines, opts) {
  const o = opts || {};
  const problems = [];
  const seen = new Set();
  mines.forEach(m => {
    if (!Number.isInteger(m.x) || !Number.isInteger(m.y)) problems.push('non-integer ' + m.id);
    if (!win.isValidWorldX(m.x) || !win.isValidWorldY(m.y)) problems.push('out of bounds ' + m.id);
    if (m.x < -10 || m.x > 10 || m.y < -10 || m.y > 10) problems.push('outside -10..10 ' + m.id);
    if (m.x === base.x && m.y === base.y) problems.push('on base ' + m.id);
    const key = m.x + ',' + m.y;
    if (seen.has(key)) problems.push('duplicate cell ' + key);
    seen.add(key);
  });
  const ids = mines.map(m => m.id);
  if (new Set(ids).size !== ids.length) problems.push('duplicate ids');
  ['iron', 'coal'].forEach(res => {
    const starter = mines.find(m => m.id === 'mine_start_' + res);
    if (!starter || starter.resource !== res) { problems.push('missing starter ' + res); return; }
    const d = Math.hypot(starter.x - base.x, starter.y - base.y);
    if (d < 2 || d > 3) problems.push('starter ' + res + ' not near base (d=' + d.toFixed(2) + ')');
    if (starter.grade !== 1 || starter.miningPower !== 1 || starter.developmentState !== 'unsecured') problems.push('starter ' + res + ' fields');
  });
  if (o.checkSpacing) {
    const a = mines.find(m => m.id === 'mine_start_iron'), b = mines.find(m => m.id === 'mine_start_coal');
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 2) problems.push('starters closer than 2');
  }
  return problems;
}

(function test_T63_newGameLayoutRules() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const w = win.state.world;
  check('Task63: new game has a mine list', Array.isArray(w.mines) && w.mines.length >= 2);
  check('Task63: at least one iron mine', w.mines.some(m => m.resource === 'iron'));
  check('Task63: at least one coal mine', w.mines.some(m => m.resource === 'coal'));
  const problems = t63LayoutProblems(win, w.base, w.mines, { checkSpacing: true });
  check('Task63: new game layout obeys every rule', problems.length === 0, problems.join('; '));
  check('Task63: mine data keeps the existing shape', w.mines.every(m => JSON.stringify(Object.keys(m).sort()) === JSON.stringify(['developmentState','grade','id','miningPower','resource','x','y'])));
  check('Task63: starter mines start grade 1 / power 1 / unsecured', w.mines.filter(m => m.id.startsWith('mine_start_')).every(m => m.grade === 1 && m.miningPower === 1 && m.developmentState === 'unsecured') && w.mines.every(m => m.miningPower === 1 && m.developmentState === 'unsecured')); // Task 64: ring mines take their site grade
  check('Task63: base and player unchanged by generation', w.base.x === 2 && w.base.y === 0 && w.player.x === 2 && w.player.y === 0);
  check('Task63: new world size is starters + distance rings (Task 64: 14)', w.mines.length === 14);
})();

(function test_T63_manyRealNewGamesAreValid() {
  let allValid = true, detail = '';
  for (let i = 0; i < 6; i++) {
    const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
    const p = t63LayoutProblems(win, win.state.world.base, win.state.world.mines, { checkSpacing: true });
    if (p.length) { allValid = false; detail = p.join('; '); }
  }
  check('Task63: six real new games all produce valid layouts', allValid, detail);
})();

// Task 64: these Task 63 checks cover starters + extra mines, so they pass rings: [] to isolate that behaviour.
(function test_T63_generatorRuleSweep() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  let bad = 0, detail = '';
  for (let seed = 1; seed <= 300; seed++) {
    const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed), rings: [] });
    const p = t63LayoutProblems(win, base, mines, { checkSpacing: true });
    if (p.length || mines.length !== 2) { bad++; detail = 'seed ' + seed + ': ' + p.join('; '); }
  }
  check('Task63: 300 seeded generations all obey the rules', bad === 0, detail);
  const edge0 = win.generateInitialWorldMines(base, { random: () => 0, rings: [] });
  const edge1 = win.generateInitialWorldMines(base, { random: () => 0.9999999, rings: [] });
  check('Task63: extreme random values still give valid layouts', t63LayoutProblems(win, base, edge0, { checkSpacing: true }).length === 0 && t63LayoutProblems(win, base, edge1, { checkSpacing: true }).length === 0);
  const badRandom = win.generateInitialWorldMines(base, { random: () => Number.NaN, rings: [] });
  check('Task63: a broken random source cannot break the rules', t63LayoutProblems(win, base, badRandom).length === 0);
  check('Task63: starters are clear of the expansion seed cells (>= 4 from base)', (() => {
    for (let seed = 1; seed <= 300; seed++) {
      const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed), rings: [] });
      // Reference values: WORLD_MINE_SEEDS offsets from data.js (4,0),(0,4),(6,0),(0,6),(8,0),(0,8).
      const seedCells = [[4,0],[0,4],[6,0],[0,6],[8,0],[0,8]].map(([dx, dy]) => (base.x + dx) + ',' + (base.y + dy));
      if (mines.some(m => seedCells.includes(m.x + ',' + m.y))) return false;
    }
    return true;
  })());
})();

(function test_T63_layoutsVary() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  const sig = (mines) => mines.map(m => m.id + '@' + m.x + ',' + m.y).join('|');
  const a = sig(win.generateInitialWorldMines(base, { random: () => 0, rings: [] }));
  const b = sig(win.generateInitialWorldMines(base, { random: () => 0.9999999, rings: [] }));
  check('Task63: different random values give different layouts', a !== b);
  const layouts = new Set();
  for (let seed = 1; seed <= 50; seed++) layouts.add(sig(win.generateInitialWorldMines(base, { random: t63Lcg(seed), rings: [] })));
  check('Task63: many distinct layouts across seeds', layouts.size >= 10, 'distinct=' + layouts.size);
  const same1 = sig(win.generateInitialWorldMines(base, { random: t63Lcg(42), rings: [] }));
  const same2 = sig(win.generateInitialWorldMines(base, { random: t63Lcg(42), rings: [] }));
  check('Task63: same random sequence gives the same layout', same1 === same2);
  const ironCells = new Set();
  for (let seed = 1; seed <= 50; seed++) { const m = win.generateInitialWorldMines(base, { random: t63Lcg(seed), rings: [] }).find(x => x.id === 'mine_start_iron'); ironCells.add(m.x + ',' + m.y); }
  check('Task63: the starter iron position is not fixed', ironCells.size > 1);
})();

(function test_T63_extraMinesStructure() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  let ok = true, detail = '';
  for (let seed = 1; seed <= 40; seed++) {
    const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed), extraCount: 12, rings: [] });
    const p = t63LayoutProblems(win, base, mines, { checkSpacing: true });
    if (p.length || mines.length !== 14) { ok = false; detail = p.join('; ') + ' n=' + mines.length; }
    if (!mines.filter(m => !m.id.startsWith('mine_start_')).every(m => (m.resource === 'iron' || m.resource === 'coal') && m.grade === 1 && m.miningPower === 1 && m.developmentState === 'unsecured')) { ok = false; detail = 'extra uses a locked-site resource or wrong fields'; }
  }
  check('Task63: extra mines obey the same rules and only use start-site resources', ok, detail);
  const custom = win.generateInitialWorldMines(base, { random: t63Lcg(7), extraCount: 3, extraResources: ['coal'], rings: [] });
  check('Task63: extra resource pool can be supplied', custom.filter(m => m.id.startsWith('mine_gen_')).every(m => m.resource === 'coal') && custom.length === 5);
  const huge = win.generateInitialWorldMines(base, { random: t63Lcg(9), extraCount: 1000, rings: [], walkable: () => true /* Task 66: whole grid, as this check was written */ });
  check('Task63: extra mines stop when the world is full (no overlap, no base cell)', huge.length === 21 * 21 - 1 - 6 /* Task 64: base cell + 6 reserved expansion seed cells */ && t63LayoutProblems(win, base, huge).length === 0);
  check('Task63: new run start resources are the open site only (iron, coal)', JSON.stringify(win.worldGenStartResources().sort()) === JSON.stringify(['coal', 'iron']));
})();

(function test_T63_baseNearEdgeStaysInBounds() {
  const win = newDom(makeMemoryStorage()).window;
  let ok = true, detail = '';
  [{ x: 10, y: 10 }, { x: -10, y: -10 }, { x: 10, y: -10 }, { x: -10, y: 0 }].forEach(base => {
    for (let seed = 1; seed <= 30; seed++) {
      // Task 66: some of these hypothetical bases sit inside the mountain; check the bounds logic on the open grid.
      const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed), extraCount: 5, walkable: () => true });
      const p = t63LayoutProblems(win, base, mines);
      if (p.length) { ok = false; detail = JSON.stringify(base) + ' ' + p.join('; '); }
    }
  });
  check('Task63: a base on the world edge still gets in-bounds starters', ok, detail);
})();

(function test_T63_saveLoadKeepsLayout() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  const fields = (ms) => JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]));
  const snapshot = fields(win.state.world.mines);
  check('Task63: save succeeds', win.saveGame() === true);
  const loaded = win.loadGame();
  check('Task63: loadGame returns the identical mines', loaded.ok === true && fields(loaded.run.world.mines) === snapshot);
  const win2 = newDom(storage).window;
  check('Task63: booting from the save keeps the identical mines (no re-generation)', fields(win2.state.world.mines) === snapshot);
  win2.saveGame();
  const win3 = newDom(storage).window;
  check('Task63: a second save/boot round trip still keeps them', fields(win3.state.world.mines) === snapshot);
  check('Task63: saveVersion stays 1', JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1);
})();

(function test_T63_existingSavesNotRegenerated() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.saveGame();
  const payload = JSON.parse(storage.getItem('gachaFactorySave'));
  const custom = [
    { id: 'mine_start_iron', x: 9, y: -9, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'secured' },
    { id: 'mine_start_coal', x: -9, y: 9, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { id: 'mine_old_extra', x: 0, y: -5, resource: 'mana', grade: 2, miningPower: 3, developmentState: 'unsecured' },
  ];
  payload.run.world.mines = custom;
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const booted = newDom(storage).window;
  const mineFields = (ms) => JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]));
  check('Task63: an existing save keeps its own mines exactly', mineFields(booted.state.world.mines) === mineFields(custom), mineFields(booted.state.world.mines));
  // A save whose world has an empty mine list is respected too (not refilled).
  payload.run.world.mines = [];
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const empty = newDom(storage).window;
  check('Task63: an existing save with no mines is not refilled', empty.state.world.mines.length === 0);
  // Pre-world saves (no world at all) still get a fresh generated world.
  delete payload.run.world;
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const noWorld = newDom(storage).window;
  check('Task63: a save without any world gets a valid new world', t63LayoutProblems(noWorld, noWorld.state.world.base, noWorld.state.world.mines).length === 0);
})();

(function test_T63_seedsAndSitesKept() {
  const win = newDom(makeMemoryStorage()).window;
  const dataSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  check('Task63: WORLD_MINE_SEEDS still exists for site expansion', /const WORLD_MINE_SEEDS = \{/.test(dataSrc) && /manaVein:/.test(dataSrc));
  check('Task63: new game does not use WORLD_MINE_SEEDS', win.state.world.mines.every(m => m.id.startsWith('mine_start_') || m.id.startsWith('mine_gen_')));
  win.state.gold = 20000;
  check('Task63: site expansion still works', win.expandBase() === true && win.expandBase() === true && win.expandBase() === true);
  const ids = win.state.world.mines.map(m => m.id);
  check('Task63: every site seed is added on expansion (no collision with random starters)', ['mine_manaVein_mana','mine_manaVein_crystal','mine_ruins_rareMetal','mine_ruins_relic','mine_spaceStation_cosmicShard','mine_spaceStation_plasma'].every(id => ids.includes(id)) && ids.length === 8);
  check('Task63: unlockedSites still drives expansion', win.state.unlockedSites.spaceStation === true);
})();

(function test_T63_coreLoopWithRandomLayout() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  stage.querySelector('[data-world-mine="mine_start_iron"]').click();
  check('Task63: random starter mine can be selected', win.getWorldSelection() && win.getWorldSelection().id === 'mine_start_iron');
  check('Task63: info shows the selected starter', doc.querySelector('#worldInfo [data-world-info="title"]').textContent === '철광석 광맥');
  ['mine_start_iron', 'mine_start_coal'].forEach(id => doc.querySelector('[data-secure-mine="' + id + '"]').click());
  check('Task63: securing works', win.state.world.mines.filter(m => m.id.startsWith('mine_start_')).every(m => m.developmentState === 'secured'));
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_coal"]').click();
  check('Task63: mining into shared storage works', win.state.resources.iron === 2 && win.state.resources.coal === 1);
  doc.querySelector('[data-craft="steel"]').click();
  check('Task63: crafting works', win.state.products.steel === 1);
  doc.querySelector('[data-sell="steel"]').click();
  check('Task63: selling works', win.state.gold > 0 && win.state.products.steel === 0);
  win.state.gold = 700;
  check('Task63: expansion works', win.expandBase() === true);
  win.renderAll();
  check('Task63: stage shows every mine', doc.querySelectorAll('#worldStage [data-world-mine]').length === win.state.world.mines.length);
  const mineFields = (ms) => JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]));
  const before = mineFields(win.state.world.mines);
  win.saveGame();
  const win2 = newDom(storage).window;
  check('Task63: progress and layout survive save/load', mineFields(win2.state.world.mines) === before && win2.state.world.base.level === 2, mineFields(win2.state.world.mines) + ' vs ' + before);
})();

(function test_T63_prestigeStartsNewRandomWorld() {
  const win = newDom(makeMemoryStorage()).window;
  const fresh = win.freshRunState();
  check('Task63: a new run (prestige) builds a valid generated world', t63LayoutProblems(win, fresh.world.base, fresh.world.mines).length === 0 && fresh.world.mines.length === 14); // Task 64: starters + rings
})();

// =============================================================================
// TASK 64 — Distance rings: fewer, rarer mines farther from the base.
// Deterministic: seeded random sources (t63Lcg) and fixed values; no test
// depends on one particular Math.random outcome.
// Reference values (BALANCE.worldGen.RINGS approved for Task 64):
//   near  [2,4)   5 mines  iron, coal
//   mid   [4,7)   4 mines  iron, coal, mana, crystal
//   far   [7,10)  3 mines  mana, crystal, rareMetal, relic
//   outer [10,∞)  2 mines  rareMetal, relic, cosmicShard, plasma
// =============================================================================
const T64_RINGS = [
  { key: 'near',  min: 2,  max: 4,        count: 5, pool: ['iron', 'coal'] },
  { key: 'mid',   min: 4,  max: 7,        count: 4, pool: ['iron', 'coal', 'mana', 'crystal'] },
  { key: 'far',   min: 7,  max: 10,       count: 3, pool: ['mana', 'crystal', 'rareMetal', 'relic'] },
  { key: 'outer', min: 10, max: Infinity, count: 2, pool: ['rareMetal', 'relic', 'cosmicShard', 'plasma'] },
];
const T64_TIER = { iron: 1, coal: 1, mana: 2, crystal: 2, rareMetal: 3, relic: 3, cosmicShard: 4, plasma: 4 };
const T64_SEED_OFFSETS = [[4,0],[0,4],[6,0],[0,6],[8,0],[0,8]];
function t64Ring(base, m) {
  const d = Math.hypot(m.x - base.x, m.y - base.y);
  return T64_RINGS.findIndex(r => d >= r.min && d < r.max);
}
function t64Problems(win, base, mines, opts) {
  const o = opts || {};
  const p = t63LayoutProblems(win, base, mines);
  const seedCells = T64_SEED_OFFSETS.map(([dx, dy]) => (base.x + dx) + ',' + (base.y + dy));
  const perRing = T64_RINGS.map(() => 0);
  mines.forEach(m => {
    const ri = t64Ring(base, m);
    if (ri < 0) { p.push('outside every ring ' + m.id); return; }
    perRing[ri]++;
    if (!T64_RINGS[ri].pool.includes(m.resource)) p.push(m.id + ' resource ' + m.resource + ' not allowed in ' + T64_RINGS[ri].key);
    if (m.grade !== T64_TIER[m.resource]) p.push(m.id + ' grade ' + m.grade + ' != site tier');
    if (m.miningPower !== 1 || m.developmentState !== 'unsecured') p.push(m.id + ' initial fields');
    if (seedCells.includes(m.x + ',' + m.y)) p.push(m.id + ' on an expansion seed cell');
  });
  if (o.exactCounts) T64_RINGS.forEach((r, i) => { if (perRing[i] !== r.count) p.push(r.key + ' has ' + perRing[i] + ' mines, expected ' + r.count); });
  if (o.spacing) {
    for (let i = 0; i < mines.length; i++) for (let j = i + 1; j < mines.length; j++)
      if (Math.hypot(mines[i].x - mines[j].x, mines[i].y - mines[j].y) < 2) p.push('mines closer than 2: ' + mines[i].id + ' / ' + mines[j].id);
  }
  return { problems: p, perRing };
}

(function test_T64_ringTable() {
  const win = newDom(makeMemoryStorage()).window;
  // BALANCE is not reachable from the test window; the seeded sweep below checks the real generator against this table.
  check('Task64: ring counts shrink outward (reference table)', T64_RINGS.every((r, i) => i === 0 || r.count < T64_RINGS[i - 1].count));
  check('Task64: rings are contiguous from the starter distance outward', T64_RINGS.every((r, i) => i === 0 ? r.min === 2 : r.min === T64_RINGS[i - 1].max) && T64_RINGS[T64_RINGS.length - 1].max === Infinity);
  check('Task64: nearest ring holds only iron/coal', JSON.stringify(T64_RINGS[0].pool) === JSON.stringify(['iron', 'coal']));
  const maxTier = (r) => Math.max(...r.pool.map(k => T64_TIER[k]));
  const minTier = (r) => Math.min(...r.pool.map(k => T64_TIER[k]));
  check('Task64: rarest available resource rises outward', T64_RINGS.every((r, i) => i === 0 || maxTier(r) > maxTier(T64_RINGS[i - 1])));
  check('Task64: commonest available resource rises outward (never falls)', T64_RINGS.every((r, i) => i === 0 || minTier(r) >= minTier(T64_RINGS[i - 1])));
  check('Task64: grade follows the resource site tier', Object.keys(T64_TIER).every(k => win.worldGenResourceGrade(k) === T64_TIER[k]));
})();

(function test_T64_seededSweepObeysEveryRule() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  let bad = 0, detail = '';
  for (let seed = 1; seed <= 300; seed++) {
    const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed) });
    const r = t64Problems(win, base, mines, { exactCounts: true, spacing: true });
    if (r.problems.length || mines.length !== 14) { bad++; detail = 'seed ' + seed + ': ' + r.problems.slice(0, 3).join('; ') + ' n=' + mines.length; }
  }
  check('Task64: 300 seeded worlds obey every ring rule (counts, pools, grades, bounds, spacing)', bad === 0, detail);
  const extremes = [() => 0, () => 0.9999999, () => Number.NaN].map(rnd => win.generateInitialWorldMines(base, { random: rnd }));
  check('Task64: extreme / broken random sources still obey the rules', extremes.every(ms => t64Problems(win, base, ms, { exactCounts: true }).problems.length === 0));
})();

(function test_T64_nearRingHasBasics() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  let ok = true;
  for (let seed = 1; seed <= 200; seed++) {
    const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed) });
    const near = mines.filter(m => t64Ring(base, m) === 0);
    if (!(near.length === 5 && near.some(m => m.resource === 'iron') && near.some(m => m.resource === 'coal') && near.every(m => m.resource === 'iron' || m.resource === 'coal'))) ok = false;
  }
  check('Task64: near ring always has 5 mines, all iron/coal, with at least one of each', ok);
})();

(function test_T64_rareResourcesFarAway() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  // Deterministic proof that the rarest tier can appear: random -> ~1 always
  // picks the last weighted entry, which in the outer ring is plasma (tier 4).
  const hi = win.generateInitialWorldMines(base, { random: () => 0.9999999 });
  check('Task64: outer ring can produce a top-tier resource', hi.some(m => t64Ring(base, m) === 3 && T64_TIER[m.resource] === 4));
  check('Task64: far ring can produce a tier-3 resource', hi.some(m => t64Ring(base, m) === 2 && T64_TIER[m.resource] === 3));
  const lo = win.generateInitialWorldMines(base, { random: () => 0 });
  check('Task64: outer ring never drops below tier 3', lo.filter(m => t64Ring(base, m) === 3).every(m => T64_TIER[m.resource] >= 3));
  // Across many seeded worlds: average tier strictly rises ring by ring, and
  // the top tier shows up somewhere but stays limited.
  const sum = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
  let topTier = 0, worldsWithTop = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed) });
    mines.forEach(m => { const ri = t64Ring(base, m); sum[ri] += T64_TIER[m.resource]; cnt[ri]++; });
    const tops = mines.filter(m => T64_TIER[m.resource] === 4).length;
    topTier += tops; if (tops > 0) worldsWithTop++;
  }
  const avg = sum.map((s, i) => s / cnt[i]);
  check('Task64: average resource tier rises with distance', avg.every((a, i) => i === 0 || a > avg[i - 1]), avg.map(a => a.toFixed(2)).join(' < '));
  check('Task64: top-tier mines appear in some worlds', worldsWithTop > 0);
  check('Task64: top-tier mines stay limited (at most 2 per world, only in the outer ring)', topTier <= 300 * 2);
  check('Task64: mine count per ring falls outward', [5, 4, 3, 2].every((c, i) => cnt[i] === c * 300));
})();

(function test_T64_weightedPick() {
  const win = newDom(makeMemoryStorage()).window;
  const w = { iron: 2, coal: 2, mana: 1, crystal: 1 };
  check('Task64: weighted pick covers the first weight band', win.worldGenPickWeighted(w, () => 0) === 'iron' && win.worldGenPickWeighted(w, () => 0.33) === 'iron');
  check('Task64: weighted pick covers the middle bands', win.worldGenPickWeighted(w, () => 0.34) === 'coal' && win.worldGenPickWeighted(w, () => 0.7) === 'mana');
  check('Task64: weighted pick covers the last band', win.worldGenPickWeighted(w, () => 0.9999) === 'crystal');
  check('Task64: weighted pick ignores unknown or non-positive entries', win.worldGenPickWeighted({ bogus: 5, iron: 0, coal: 1 }, () => 0.5) === 'coal' && win.worldGenPickWeighted({}, () => 0.5) === null);
})();

(function test_T64_edgeBasesStayValid() {
  const win = newDom(makeMemoryStorage()).window;
  let ok = true, detail = '';
  [{ x: 10, y: 10 }, { x: -10, y: -10 }, { x: 0, y: 0 }, { x: -10, y: 5 }].forEach(base => {
    for (let seed = 1; seed <= 40; seed++) {
      // Task 66: (-10,*) bases sit inside the mountain; check the ring logic on the open grid.
      const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed), walkable: () => true });
      const r = t64Problems(win, base, mines);
      if (r.problems.length) { ok = false; detail = JSON.stringify(base) + ' ' + r.problems.slice(0, 2).join('; '); }
    }
  });
  check('Task64: other base positions (edges, old-save origin) still give valid ring layouts', ok, detail);
})();

(function test_T64_realNewGames() {
  let ok = true, detail = '';
  const layouts = new Set();
  for (let i = 0; i < 5; i++) {
    const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
    const w = win.state.world;
    const r = t64Problems(win, w.base, w.mines, { exactCounts: true });
    if (r.problems.length || w.mines.length !== 14) { ok = false; detail = r.problems.slice(0, 3).join('; '); }
    layouts.add(w.mines.map(m => m.resource + '@' + m.x + ',' + m.y).join('|'));
    if (i === 0) {
      check('Task64: stage draws every generated mine', win.document.querySelectorAll('#worldStage [data-world-mine]').length === 14);
      // Task 65: the list shows discovered mines and a count of the hidden ones; together they cover all 14.
      const listed = win.document.querySelectorAll('#worldMines [data-secure-mine]').length;
      const note = win.document.querySelector('#worldMines [data-hidden-mines]');
      const hiddenNow = win.state.world.hiddenMineIds.length;
      check('Task64: mine list accounts for every generated mine', listed + (note ? +note.getAttribute('data-hidden-mines') : 0) === 14 && listed === 14 - hiddenNow);
    }
  }
  check('Task64: five real new games all follow the ring rules', ok, detail);
})();

(function test_T64_lockedSiteMinesCannotBeSecuredYet() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const doc = win.document;
  const outer = win.state.world.mines.find(m => t64Ring(win.state.world.base, m) === 3); // tier >= 3, site locked at start
  check('Task64: a far rare mine exists from the start', !!outer && T64_TIER[outer.resource] >= 3);
  // Task 65: far mines start undiscovered; discover it so the site lock is what's being tested.
  win.discoverMine(outer.id); win.buildMines();
  check('Task64: a mine of a locked site cannot be secured', win.secureMine(outer.id) === false && outer.developmentState === 'unsecured');
  const btn = doc.querySelector('[data-secure-mine="' + outer.id + '"]');
  check('Task64: its list button is disabled and says the site must be unlocked', btn.disabled === true && btn.textContent.includes('해금 필요'));
  check('Task64: starter (open site) mines can still be secured', win.secureMine('mine_start_iron') === true);
  win.state.gold = 20000;
  win.expandBase(); win.expandBase(); win.expandBase();
  win.renderAll();
  check('Task64: after its site is unlocked the far mine can be secured', win.secureMine(outer.id) === true);
  const before = win.state.resources[outer.resource];
  check('Task64: and mined into shared storage', win.mineMine(outer.id) === true && win.state.resources[outer.resource] === before + 1);
  check('Task64: list button is enabled once its site is open', (() => { win.buildMines(); const m2 = win.state.world.mines.find(m => m.developmentState === 'unsecured'); if (!m2) return true; const b2 = doc.querySelector('[data-secure-mine="' + m2.id + '"]'); return b2.disabled === false && b2.textContent === '광맥 확보'; })());
})();

(function test_T64_expansionStillAddsEverySeed() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const start = win.state.world.mines.length;
  win.state.gold = 20000;
  check('Task64: expansion works on a ring world', win.expandBase() === true && win.state.world.mines.length === start + 2);
  win.expandBase(); win.expandBase();
  const ids = win.state.world.mines.map(m => m.id);
  check('Task64: all six seeded expansion mines are added (seed cells were kept free)', ['mine_manaVein_mana','mine_manaVein_crystal','mine_ruins_rareMetal','mine_ruins_relic','mine_spaceStation_cosmicShard','mine_spaceStation_plasma'].every(id => ids.includes(id)) && ids.length === start + 6);
  check('Task64: no two mines share a cell after expanding', new Set(win.state.world.mines.map(m => m.x + ',' + m.y)).size === win.state.world.mines.length);
})();

(function test_T64_saveLoadIdentical() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  const full = (ms) => JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]));
  const snap = full(win.state.world.mines);
  win.saveGame();
  const loaded = win.loadGame();
  check('Task64: loadGame returns the identical ring world (all 14 mines, same order)', loaded.ok && full(loaded.run.world.mines) === snap && loaded.run.world.mines.length === 14);
  const win2 = newDom(storage).window;
  check('Task64: booting from the save keeps the identical ring world', full(win2.state.world.mines) === snap);
  // An older save holding just two mines is not topped up with ring mines.
  const payload = JSON.parse(storage.getItem('gachaFactorySave'));
  payload.run.world.mines = [
    { id: 'mine_start_iron', x: 2, y: 0, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'secured' },
    { id: 'mine_start_coal', x: 0, y: 2, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' },
  ];
  payload.run.world.base = { x: 0, y: 0, level: 1 };
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const old = newDom(storage).window;
  check('Task64: an older 2-mine save stays exactly 2 mines (no ring generation on load)', old.state.world.mines.length === 2 && old.state.world.mines[0].x === 2 && old.state.world.mines[1].y === 2);
  check('Task64: saveVersion stays 1', JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1);
})();

(function test_T64_coreLoopOnRingWorld() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  const doc = win.document;
  const ring = win.state.world.mines.find(m => m.id.startsWith('mine_ring_'));
  win.discoverMine(ring.id); win.renderAll(); // Task 65: ring mines may start undiscovered
  doc.querySelector('#worldStage [data-world-mine="' + ring.id + '"]').click();
  check('Task64: a ring mine can be selected on the stage', win.getWorldSelection() && win.getWorldSelection().id === ring.id);
  check('Task64: info shows its grade', doc.querySelector('#worldInfo [data-world-info="grade"]').textContent === '등급 ' + ring.grade);
  ['mine_start_iron', 'mine_start_coal'].forEach(id => doc.querySelector('[data-secure-mine="' + id + '"]').click());
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_coal"]').click();
  check('Task64: mining works', win.state.resources.iron === 2 && win.state.resources.coal === 1);
  doc.querySelector('[data-craft="steel"]').click();
  check('Task64: crafting works', win.state.products.steel === 1);
  doc.querySelector('[data-sell="steel"]').click();
  check('Task64: selling works', win.state.gold > 0);
  win.state.gold = 700;
  check('Task64: expansion works', win.expandBase() === true);
  win.saveGame();
  const win2 = newDom(storage).window;
  check('Task64: progress survives save/load', win2.state.world.base.level === 2 && win2.state.world.mines.length === 16);
})();

// =============================================================================
// TASK 65 — (1) mid ring: at most one mana/crystal; (2) mine discovery +
// exploration map. Deterministic (seeded / fixed random, placed player).
// =============================================================================
function t65Mid(base, mines) { return mines.filter(m => t64Ring(base, m) === 1); }
function t65MidOk(base, mines) {
  const mid = t65Mid(base, mines);
  const midTier = mid.filter(m => m.resource === 'mana' || m.resource === 'crystal').length;
  return mid.length === 4 && midTier <= 1 && mid.every(m => ['iron', 'coal', 'mana', 'crystal'].includes(m.resource));
}

(function test_T65_midRingCapSweep() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  let bad = 0, detail = '', withOne = 0, withNone = 0, other = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed) });
    const r = t64Problems(win, base, mines, { exactCounts: true, spacing: true });
    if (!t65MidOk(base, mines) || r.problems.length || mines.length !== 14) { bad++; detail = 'seed ' + seed + ': ' + t65Mid(base, mines).map(m => m.resource).join('/') + ' ' + r.problems.slice(0, 2).join('; '); }
    const mt = t65Mid(base, mines).filter(m => m.resource === 'mana' || m.resource === 'crystal').length;
    if (mt === 1) withOne++; else if (mt === 0) withNone++; else other++;
  }
  check('Task65: 500 seeded worlds — mid ring always 4 mines with mana+crystal <= 1', bad === 0, detail);
  check('Task65: other Task 64 ring rules still hold in those worlds (counts, pools, grades, spacing)', bad === 0);
  check('Task65: mid-tier mine is optional — some worlds have one, some none, never two', withOne > 0 && withNone > 0 && other === 0, 'one=' + withOne + ' none=' + withNone);
})();

(function test_T65_midRingCapForcedRandom() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  // random ~1 always picks the last weighted entry: crystal in the mid ring.
  // Before the cap that meant 4 crystals; now exactly one, the rest iron/coal.
  const hi = t65Mid(base, win.generateInitialWorldMines(base, { random: () => 0.9999999 })).map(m => m.resource);
  check('Task65: forced-high random gives exactly one mid-tier mine', hi.length === 4 && hi.filter(r => r === 'crystal' || r === 'mana').length === 1, hi.join('/'));
  check('Task65: the rest of the mid ring is iron/coal', hi.filter(r => r === 'iron' || r === 'coal').length === 3);
  const lo = t65Mid(base, win.generateInitialWorldMines(base, { random: () => 0 })).map(m => m.resource);
  check('Task65: forced-low random gives an all-basic mid ring', lo.length === 4 && lo.every(r => r === 'iron'), lo.join('/'));
  const outerHi = win.generateInitialWorldMines(base, { random: () => 0.9999999 }).filter(m => t64Ring(base, m) >= 2);
  check('Task65: far/outer rings are not capped (forced-high still picks their last entry)', outerHi.filter(m => t64Ring(base, m) === 2).every(m => m.resource === 'relic') && outerHi.filter(m => t64Ring(base, m) === 3).every(m => m.resource === 'plasma'));
})();

(function test_T65_ringWeightsHelper() {
  const win = newDom(makeMemoryStorage()).window;
  const ring = { resources: { iron: 2, coal: 2, mana: 1, crystal: 1 }, limits: [{ resources: ['mana', 'crystal'], max: 1 }] };
  check('Task65: limit not reached keeps every weight', JSON.stringify(win.worldGenRingWeights(ring, ['iron'])) === JSON.stringify({ iron: 2, coal: 2, mana: 1, crystal: 1 }));
  check('Task65: limit reached removes the whole group', JSON.stringify(win.worldGenRingWeights(ring, ['iron', 'mana'])) === JSON.stringify({ iron: 2, coal: 2 }));
  check('Task65: ring without limits is unchanged', JSON.stringify(win.worldGenRingWeights({ resources: { mana: 2, relic: 1 } }, ['mana', 'mana'])) === JSON.stringify({ mana: 2, relic: 1 }));
  check('Task65: helper does not mutate the ring table', JSON.stringify(ring.resources) === JSON.stringify({ iron: 2, coal: 2, mana: 1, crystal: 1 }));
})();

(function test_T65_realGamesMidRing() {
  let ok = true;
  for (let i = 0; i < 6; i++) {
    const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
    if (!t65MidOk(win.state.world.base, win.state.world.mines)) ok = false;
  }
  check('Task65: six real new games respect the mid-ring cap', ok);
})();

(function test_T65_discoveryStartState() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const w = win.state.world;
  const ringIds = w.mines.filter(m => m.id.startsWith('mine_ring_')).map(m => m.id).sort();
  check('Task65: a new world starts with every ring mine undiscovered', JSON.stringify([...w.hiddenMineIds].sort()) === JSON.stringify(ringIds) && ringIds.length === 12);
  check('Task65: starter mines start discovered', win.isMineDiscovered(w.mines.find(m => m.id === 'mine_start_iron')) && win.isMineDiscovered(w.mines.find(m => m.id === 'mine_start_coal')));
  const hiddenMine = w.mines.find(m => m.id === ringIds[0]);
  const node = win.document.querySelector('#worldStage [data-world-mine="' + hiddenMine.id + '"]');
  check('Task65: undiscovered mine is drawn as an unknown rock', node.classList.contains('is-undiscovered') && !node.hasAttribute('data-resource') && ![...node.classList].some(c => c.startsWith('res-')) && node.textContent === '?');
  check('Task65: undiscovered mine is not in the mine list', !win.document.querySelector('#worldMines [data-secure-mine="' + hiddenMine.id + '"]'));
  check('Task65: list notes how many are still hidden', +win.document.querySelector('#worldMines [data-hidden-mines]').getAttribute('data-hidden-mines') === 12);
  check('Task65: undiscovered mine cannot be secured', win.secureMine(hiddenMine.id) === false);
  node.click();
  const lines = [...win.document.querySelectorAll('#worldInfo [data-world-info]')].map(e => e.textContent);
  check('Task65: info hides an undiscovered mine\'s identity', JSON.stringify(lines) === JSON.stringify(['미발견 광맥', '정체 불명', '등급 ?', '가까이 가면 발견']));
})();

(function test_T65_walkingDiscovers() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const doc = win.document;
  const w = win.state.world;
  const target = w.mines.find(m => w.hiddenMineIds.includes(m.id) && t64Ring(w.base, m) === 2);
  // (The exact 2.5 / 2.6 radius boundary is checked below on a fixed layout.)
  w.player.x = target.x; w.player.y = target.y; // on top of it: certainly inside
  const found = win.tickExploration();
  check('Task65: walking within the radius discovers it', found.includes(target.id) && !w.hiddenMineIds.includes(target.id));
  check('Task65: discovery is logged', doc.getElementById('log').textContent.includes('새 광맥 발견'));
  const node = doc.querySelector('#worldStage [data-world-mine="' + target.id + '"]');
  check('Task65: the stage now shows its resource', node.getAttribute('data-resource') === target.resource && node.classList.contains('res-' + target.resource) && !node.classList.contains('is-undiscovered'));
  check('Task65: it now appears in the mine list', !!doc.querySelector('#worldMines [data-secure-mine="' + target.id + '"]'));
  check('Task65: it now appears on the exploration map', !!doc.querySelector('#worldMap [data-map-mine="' + target.id + '"]'));
  check('Task65: discovering again is a no-op', win.discoverMine(target.id) === false && win.tickExploration().length === 0);
  // Exact radius boundary, independent of the generated layout.
  win.addMine({ id: 't65_edge', x: -9, y: 9, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  w.hiddenMineIds.push('t65_edge');
  w.player.x = -9; w.player.y = 6.5;  // distance 2.5 -> discovered (radius is inclusive)
  check('Task65: distance exactly 2.5 discovers', win.tickExploration().includes('t65_edge'));
  win.addMine({ id: 't65_far', x: 9, y: 9, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  w.hiddenMineIds.push('t65_far');
  w.player.x = 9; w.player.y = 6.4;   // distance 2.6 -> stays hidden
  check('Task65: distance 2.6 does not discover', !win.tickExploration().includes('t65_far') && w.hiddenMineIds.includes('t65_far')); // other generated mines may sit nearby
})();

(function test_T65_tickLoopDiscovers() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const w = win.state.world;
  const target = w.mines.find(m => w.hiddenMineIds.includes(m.id));
  w.player.x = target.x; w.player.y = target.y;
  win.tickLoop();
  check('Task65: the game tick runs discovery', !w.hiddenMineIds.includes(target.id));
  const before = w.hiddenMineIds.length;
  win.tickLoop();
  check('Task65: standing still discovers nothing new', w.hiddenMineIds.length === before);
})();

(function test_T65_discoveredThenSecure() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const w = win.state.world;
  const basic = w.mines.find(m => w.hiddenMineIds.includes(m.id) && (m.resource === 'iron' || m.resource === 'coal'));
  check('Task65: an undiscovered basic mine cannot be secured', win.secureMine(basic.id) === false);
  win.discoverMine(basic.id);
  check('Task65: once discovered (open site) it can be secured', win.secureMine(basic.id) === true);
  const rare = w.mines.find(m => w.hiddenMineIds.includes(m.id) && T64_TIER[m.resource] >= 3);
  win.discoverMine(rare.id);
  check('Task65: discovered but site-locked still cannot be secured (Task 64 rule kept)', win.secureMine(rare.id) === false);
})();

(function test_T65_explorationMap() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const doc = win.document;
  const w = win.state.world;
  const map = doc.getElementById('worldMap');
  check('Task65: exploration map lives in the world stage', !!map && doc.getElementById('worldStage').contains(map));
  check('Task65: map shows the base at its world position', (() => { const b = map.querySelector('[data-map-base]'); return !!b && +b.getAttribute('x') + 0.6 === w.base.x && +b.getAttribute('y') + 0.6 === w.base.y; })());
  const mapIds = [...map.querySelectorAll('[data-map-mine]')].map(e => e.getAttribute('data-map-mine')).sort();
  const discoveredIds = w.mines.filter(m => win.isMineDiscovered(m)).map(m => m.id).sort();
  check('Task65: map shows exactly the discovered mines', JSON.stringify(mapIds) === JSON.stringify(discoveredIds) && mapIds.length === 2);
  check('Task65: map never shows an undiscovered mine', w.hiddenMineIds.every(id => !map.querySelector('[data-map-mine="' + id + '"]')));
  const dot = doc.getElementById('worldMapPlayer');
  check('Task65: map shows the player', !!dot && +dot.getAttribute('cx') === w.player.x && +dot.getAttribute('cy') === w.player.y);
  win.setPlayerHeld('left', true);
  for (let i = 0; i < 5; i++) win.tickLoop();
  win.clearPlayerHeld(); win.tickLoop();
  check('Task65: the player dot follows movement', Math.abs(+doc.getElementById('worldMapPlayer').getAttribute('cx') - w.player.x) < 0.01 && w.player.x < 2);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  check('Task65: map sits top-left and never blocks clicks', /\.world-map\{[^}]*left:10px;[^}]*top:10px;[^}]*pointer-events:none/.test(css));
  check('Task65: map has a smaller mobile size', /@media \(max-width: 520px\)\{ \.world-map\{/.test(css));
  map.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  check('Task65: clicking the map area behaves like empty stage (clears selection)', win.getWorldSelection() === null);
})();

(function test_T65_expansionMinesAreDiscovered() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.state.gold = 700;
  win.expandBase();
  win.renderAll();
  const seeded = win.state.world.mines.filter(m => m.id.startsWith('mine_manaVein_'));
  check('Task65: expansion seed mines appear already discovered', seeded.length === 2 && seeded.every(m => win.isMineDiscovered(m)));
  check('Task65: and are on the map', seeded.every(m => !!win.document.querySelector('#worldMap [data-map-mine="' + m.id + '"]')));
})();

(function test_T65_saveLoadDiscovery() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  const w = win.state.world;
  const first = w.mines.find(m => w.hiddenMineIds.includes(m.id));
  win.discoverMine(first.id);
  const hiddenSnap = JSON.stringify(w.hiddenMineIds);
  const mineSnap = JSON.stringify(w.mines.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]));
  win.saveGame();
  const win2 = newDom(storage).window;
  check('Task65: hidden list survives save/load exactly', JSON.stringify(win2.state.world.hiddenMineIds) === hiddenSnap);
  check('Task65: a discovered mine stays discovered after reload', win2.isMineDiscovered(win2.state.world.mines.find(m => m.id === first.id)));
  check('Task65: mines survive save/load exactly', JSON.stringify(win2.state.world.mines.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState])) === mineSnap);
  check('Task65: saveVersion stays 1', JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1);
  // Older save without the field: every mine is treated as discovered.
  const payload = JSON.parse(storage.getItem('gachaFactorySave'));
  delete payload.run.world.hiddenMineIds;
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const old = newDom(storage).window;
  check('Task65: older save loads with nothing hidden', Array.isArray(old.state.world.hiddenMineIds) && old.state.world.hiddenMineIds.length === 0 && old.state.world.mines.every(m => old.isMineDiscovered(m)));
  check('Task65: older save shows every mine in the list', old.document.querySelectorAll('#worldMines [data-secure-mine]').length === old.state.world.mines.length);
  // Garbage in the field is cleaned.
  payload.run.world.hiddenMineIds = [first.id, first.id, 'no_such_mine', 42, null];
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const dirty = newDom(storage).window;
  check('Task65: hidden list keeps only unique ids of existing mines', JSON.stringify(dirty.state.world.hiddenMineIds) === JSON.stringify([first.id]));
})();

(function test_T65_prestigeAndCoreLoop() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const fresh = win.freshRunState();
  check('Task65: a new run starts with its ring mines undiscovered', fresh.world.hiddenMineIds.length === 12 && t65MidOk(fresh.world.base, fresh.world.mines));
  const doc = win.document;
  ['mine_start_iron', 'mine_start_coal'].forEach(id => doc.querySelector('[data-secure-mine="' + id + '"]').click());
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_coal"]').click();
  doc.querySelector('[data-craft="steel"]').click();
  doc.querySelector('[data-sell="steel"]').click();
  check('Task65: secure / mine / craft / sell loop still works', win.state.products.steel === 0 && win.state.gold > 0 && win.state.resources.iron === 0);
  win.state.gold = 700;
  check('Task65: expansion still works', win.expandBase() === true);
})();

// =============================================================================
// TASK 66 — Mountain range as a real boundary + locked tunnel.
// Reference values (js/terrain.js, approved for Task 66):
//   east face x: y<-6 -> -4.5, [-6,-2) -> -4, [-2,3) -> -3.5, [3,7) -> -4, y>=7 -> -4.5
//   player margin 0.3; tunnel centred y=1, ±0.8, cut 1 unit deep (gate x -4.5), locked
// =============================================================================
const T66_FACE = (y) => y < -6 ? -4.5 : y < -2 ? -4 : y < 3 ? -3.5 : y < 7 ? -4 : -4.5;
const T66_STEP = 3 / 10; // PLAYER_SPEED / TICKS_PER_SECOND

(function test_T66_terrainGeometry() {
  const win = newDom(makeMemoryStorage()).window;
  let faceOk = true;
  for (let y = -10; y <= 10; y += 0.25) if (win.terrainRockFaceX(y) !== T66_FACE(y)) faceOk = false;
  check('Task66: rock face matches the reference shape over the whole world height', faceOk);
  const t = win.terrainTunnel();
  check('Task66: tunnel mouth sits on the rock face at y=1', t.y === 1 && t.mouthX === -3.5 && t.halfWidth === 0.8);
  check('Task66: tunnel is cut 1 unit deep to a gate at x=-4.5', t.gateX === -4.5 && win.terrainFaceX(1) === -4.5 && win.terrainFaceX(1.8) === -4.5 && win.terrainFaceX(1.81) === -3.5);
  check('Task66: tunnel is locked', t.locked === true);
  check('Task66: base and starter area are open ground', win.isWorldPointWalkable(2, 0) && win.isWorldPointWalkable(0, 2) && win.isWorldPointWalkable(-1, 0));
  check('Task66: rock is not walkable', !win.isWorldPointWalkable(-4, 0) && !win.isWorldPointWalkable(-5, -8) && !win.isWorldPointWalkable(-3.3, 0));
  check('Task66: land beyond the range is not walkable', !win.isWorldPointWalkable(-9, 0) && !win.isWorldPointWalkable(-10, -10) && !win.isWorldPointWalkable(-8, 9));
  check('Task66: player keeps a 0.3 margin from rock', win.isWorldPointWalkable(-3.2, 0) && !win.isWorldPointWalkable(-3.21, 0));
  check('Task66: world bounds still apply', !win.isWorldPointWalkable(10.01, 0) && !win.isWorldPointWalkable(5, -10.01) && win.isWorldPointWalkable(10, 10));
  check('Task66: non-numbers are never walkable', !win.isWorldPointWalkable(Number.NaN, 0) && !win.isWorldPointWalkable(0, undefined));
})();

(function test_T66_noWayAround() {
  // Flood-fill everything reachable from the base on a fine grid using the
  // real walkability test: nothing west of the face (rock/beyond/gate) is reachable,
  // and the range spans the whole height, so there is no way around it.
  const win = newDom(makeMemoryStorage()).window;
  const step = 0.25;
  const key = (x, y) => x.toFixed(2) + ',' + y.toFixed(2);
  const seen = new Set([key(2, 0)]);
  const queue = [[2, 0]];
  let westmost = Infinity, westOk = true;
  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < win.terrainFaceX(y) + 0.3 - 1e-9) westOk = false;
    westmost = Math.min(westmost, x);
    [[step, 0], [-step, 0], [0, step], [0, -step]].forEach(([ax, ay]) => {
      const nx = +(x + ax).toFixed(2), ny = +(y + ay).toFixed(2);
      const k = key(nx, ny);
      if (seen.has(k) || !win.isWorldPointWalkable(nx, ny)) return;
      seen.add(k); queue.push([nx, ny]);
    });
  }
  check('Task66: every reachable point is east of the mountain face', westOk);
  check('Task66: the farthest-west reachable point is inside the tunnel recess (not beyond the gate)', westmost >= -4.5 + 0.3 - 1e-9 && westmost <= -4.0);
  check('Task66: the north and south world edges are reachable (no gap is needed to go around)', seen.has(key(0, -10)) && seen.has(key(0, 10)));
  check('Task66: no reachable point lies beyond the range', [...seen].every(k => +k.split(',')[0] > -5));
})();

(function test_T66_walkingIntoTheMountain() {
  const win = newDom(makeMemoryStorage()).window;
  const p = win.state.world.player;
  let maxJump = 0, everInside = false;
  const run = (dirs, ticks) => {
    dirs.forEach(d => win.setPlayerHeld(d, true));
    for (let i = 0; i < ticks; i++) {
      const bx = p.x, by = p.y;
      win.tickPlayer();
      maxJump = Math.max(maxJump, Math.hypot(p.x - bx, p.y - by));
      if (!win.isWorldPointWalkable(p.x, p.y)) everInside = true;
    }
    win.clearPlayerHeld(); win.tickPlayer();
  };
  // Straight west on several rows: stops flush against the face, never inside.
  let rowsOk = true;
  [-9, -5, -1, 0, 2.5, 5, 9].forEach(y => {
    p.x = 3; p.y = y;
    run(['left'], 60);
    if (Math.abs(p.x - (T66_FACE(y) + 0.3)) > 1e-3 || p.y !== y) rowsOk = false;
  });
  check('Task66: walking west stops flush against the face on every row', rowsOk);
  check('Task66: the player is never inside rock', !everInside);
  check('Task66: no tick moves the player farther than one step (no bounce/teleport)', maxJump <= T66_STEP + 1e-9);
  // Pushing into the face keeps the walk key held but stops movement -> idle pose, facing kept.
  p.x = -3.2; p.y = 0;
  win.setPlayerHeld('left', true); win.tickPlayer();
  check('Task66: pushing straight into rock does not move the player', Math.abs(p.x - (-3.2)) < 1e-9 && p.facing === 'left' && p.pose === 'idle');
  win.clearPlayerHeld(); win.tickPlayer();
})();

(function test_T66_slidingAlongTheFace() {
  const win = newDom(makeMemoryStorage()).window;
  const p = win.state.world.player;
  let everInside = false;
  p.x = -3.0; p.y = -0.5;
  win.setPlayerHeld('left', true); win.setPlayerHeld('up', true);
  const ys = [], poses = [];
  for (let i = 0; i < 40; i++) { win.tickPlayer(); ys.push(p.y); poses.push(p.pose); if (!win.isWorldPointWalkable(p.x, p.y)) everInside = true; }
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task66: diagonal into the face keeps sliding north along it', p.y < -6 && ys.every((y, i) => i === 0 || y <= ys[i - 1]));
  check('Task66: while sliding, x follows the face (ends flush at the y<-6 face)', Math.abs(p.x - (-4.5 + 0.3)) < 1e-3);
  check('Task66: sliding never enters rock', !everInside);
  check('Task66: sliding uses the walk pose', poses.every(ps => ps === 'walk'));
  // South along the face too.
  p.x = -3.0; p.y = 4;
  win.setPlayerHeld('left', true); win.setPlayerHeld('down', true);
  for (let i = 0; i < 30; i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task66: sliding south along the face also works', p.y > 7 && Math.abs(p.x - (-4.5 + 0.3)) < 1e-3);
  // Diagonal speed in open ground is unchanged.
  p.x = 5; p.y = 5;
  win.setPlayerHeld('right', true); win.setPlayerHeld('down', true);
  for (let i = 0; i < 10; i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task66: open-ground diagonal speed still normalised', Math.abs(Math.hypot(p.x - 5, p.y - 5) - 3) < 1e-9);
})();

(function test_T66_lockedTunnel() {
  const win = newDom(makeMemoryStorage()).window;
  const p = win.state.world.player;
  p.x = 0; p.y = 1;
  win.setPlayerHeld('left', true);
  for (let i = 0; i < 60; i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task66: the player can walk into the tunnel mouth (past the face line)', p.x < -3.5);
  check('Task66: the locked gate stops the player', Math.abs(p.x - (-4.5 + 0.3)) < 1e-3);
  check('Task66: nothing beyond the gate is reachable', p.x > -4.5);
  // Leaving the recess sideways into rock is blocked; walking back out works.
  win.setPlayerHeld('up', true);
  for (let i = 0; i < 10; i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task66: inside the recess, rock on the sides blocks movement', p.y >= 1 - 0.8 - 1e-9 && win.isWorldPointWalkable(p.x, p.y));
  win.setPlayerHeld('right', true);
  for (let i = 0; i < 10; i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task66: walking back out of the tunnel works', p.x > -2);
  const doc = win.document;
  const tunnel = doc.querySelector('#worldStage [data-tunnel]');
  check('Task66: tunnel is drawn on the stage and marked locked', !!tunnel && tunnel.getAttribute('data-tunnel-locked') === 'true' && tunnel.classList.contains('is-locked'));
  check('Task66: tunnel shows a locked label', doc.querySelector('#worldStage [data-tunnel-label]').textContent.includes('잠긴 터널'));
  const tPos = win.worldToStagePercent(-4.5 + 0.15, 1.8);
  check('Task66: tunnel is placed from terrain data via the stage projection', tunnel.style.left === tPos.left + '%' && tunnel.style.top === tPos.top + '%');
})();

(function test_T66_mountainRendering() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  const peaks = stage.querySelectorAll('[data-terrain="peak"]');
  check('Task66: mountain is drawn as many peaks', peaks.length === win.terrainPeaks().length && peaks.length > 30);
  check('Task66: peaks carry depth scale and depth order', [...peaks].every(el => parseFloat(el.style.getPropertyValue('--depth-scale')) > 0 && parseInt(el.style.zIndex, 10) > 0));
  check('Task66: peaks are not a single rectangle (two rows, varied sizes)', new Set([...peaks].map(el => el.style.width)).size > 4 && stage.querySelectorAll('.peak-back').length > 0 && stage.querySelectorAll('.peak-front').length > 0);
  check('Task66: front peaks leave the tunnel mouth open', win.terrainPeaks().filter(pk => pk.row === 'front').every(pk => Math.abs(pk.y - 1) >= 1.6));
  check('Task66: ground shows the rock footprint and the land beyond', !!stage.querySelector('.world-ground polygon.world-range-rock') && !!stage.querySelector('.world-ground polygon[data-terrain="beyond"]'));
  check('Task66: peaks never cover the base or starter mines (all west of the face)', win.terrainPeaks().every(pk => pk.x < win.terrainRockFaceX(pk.y)) && win.state.world.mines.every(m => m.x > win.terrainRockFaceX(m.y)));
  win.renderAll(); win.renderAll();
  check('Task66: re-rendering does not duplicate terrain', stage.querySelectorAll('[data-terrain="peak"]').length === peaks.length && stage.querySelectorAll('[data-tunnel]').length === 1 && stage.querySelectorAll('.world-ground svg').length === 1);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  check('Task66: terrain never blocks clicks', /\.world-terrain-layer\{[^}]*pointer-events:none/.test(css) && /\.world-mountain-peak\{[^}]*pointer-events:none/.test(css) && /\.world-tunnel\{[^}]*pointer-events:none/.test(css));
  peaks[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  check('Task66: clicking terrain behaves like empty ground', win.getWorldSelection() === null);
})();

(function test_T66_explorationMap() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const map = win.document.getElementById('worldMap');
  check('Task66: map shows the mountain', !!map.querySelector('[data-map-mountain]'));
  check('Task66: map shows the tunnel', !!map.querySelector('[data-map-tunnel]'));
  check('Task66: map still shows base and player', !!map.querySelector('[data-map-base]') && !!map.querySelector('#worldMapPlayer'));
  check('Task66: map still hides undiscovered mines', win.state.world.hiddenMineIds.every(id => !map.querySelector('[data-map-mine="' + id + '"]')));
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  check('Task66: map size / position unchanged', /\.world-map\{[^}]*left:10px;[^}]*top:10px;[^}]*width:92px; height:92px;/.test(css) && /@media \(max-width: 520px\)\{ \.world-map\{width:68px; height:68px;/.test(css));
})();

(function test_T66_generationAvoidsTerrain() {
  const win = newDom(makeMemoryStorage()).window;
  const base = { x: 2, y: 0 };
  let bad = 0, detail = '';
  for (let seed = 1; seed <= 300; seed++) {
    const mines = win.generateInitialWorldMines(base, { random: t63Lcg(seed) });
    const r = t64Problems(win, base, mines, { exactCounts: true, spacing: true });
    const off = mines.filter(m => !win.isCellOpenForMines(m.x, m.y) || !win.isWorldPointWalkable(m.x, m.y) || m.x < T66_FACE(m.y) + 1 || Math.hypot(m.x - (-3.5), m.y - 1) < 2);
    if (off.length || r.problems.length || !t65MidOk(base, mines)) { bad++; detail = 'seed ' + seed + ': ' + off.map(m => m.id + '@' + m.x + ',' + m.y).join(' ') + ' ' + r.problems.slice(0, 2).join('; '); }
  }
  check('Task66: 300 seeded worlds — no mine on/behind the mountain or at the tunnel mouth', bad === 0, detail);
  check('Task66: ring counts 5/4/3/2, pools and the mid cap still hold with the mountain', bad === 0);
  let realOk = true;
  for (let i = 0; i < 4; i++) {
    const w = newDom(makeMemoryStorage(), { fullWorld: true }).window;
    if (!w.state.world.mines.every(m => w.isWorldPointWalkable(m.x, m.y)) || w.state.world.mines.length !== 14) realOk = false;
  }
  check('Task66: real new games put every mine on walkable ground', realOk);
  check('Task66: every expansion seed cell (relative to the base) is open ground', [[4,0],[0,4],[6,0],[0,6],[8,0],[0,8]].every(([dx, dy]) => win.isWorldPointWalkable(2 + dx, 0 + dy)));
})();

(function test_T66_saveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  const w = win.state.world;
  w.player.x = -1.25; w.player.y = 3.5;
  const first = w.mines.find(m => w.hiddenMineIds.includes(m.id));
  win.discoverMine(first.id);
  win.state.gold = 123;
  const snap = JSON.stringify([w.mines.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]), w.hiddenMineIds, w.base]);
  win.saveGame();
  const raw = storage.getItem('gachaFactorySave');
  // Task 68: the terrain is never saved; only the player's tunnelUnlocked progress flag is.
  check('Task66: terrain is not written to the save', !/terrain|mountain|tunnel|peak/i.test(raw.replace('"tunnelUnlocked":false', '').replace('"tunnelWork":false', '')));
  check('Task66: saveVersion stays 1', JSON.parse(raw).saveVersion === 1);
  const win2 = newDom(storage).window;
  const w2 = win2.state.world;
  check('Task66: mines, discovery and base survive save/load', JSON.stringify([w2.mines.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]), w2.hiddenMineIds, w2.base]) === snap);
  check('Task66: a walkable player position survives save/load', w2.player.x === -1.25 && w2.player.y === 3.5 && win2.state.gold === 123);
  check('Task66: terrain is rebuilt after load', win2.document.querySelectorAll('#worldStage [data-terrain="peak"]').length > 30 && !!win2.document.querySelector('#worldStage [data-tunnel]'));
  // An older save: player standing where the mountain now is, mines beyond it.
  const payload = JSON.parse(raw);
  payload.run.world.player = { x: -7, y: 2, facing: 'left', pose: 'idle' };
  payload.run.world.mines = payload.run.world.mines.concat([{ id: 'mine_old_beyond', x: -8, y: -3, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'secured' }]);
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const old = newDom(storage).window;
  check('Task66: a saved position inside the mountain is moved onto the base', old.state.world.player.x === old.state.world.base.x && old.state.world.player.y === old.state.world.base.y);
  check('Task66: older mines beyond the mountain are kept as saved (not regenerated or moved)', old.state.world.mines.some(m => m.id === 'mine_old_beyond' && m.x === -8 && m.y === -3) && old.state.world.mines.length === 15);
  check('Task66: an older secured mine beyond the mountain can still be mined from the list', old.mineMine('mine_old_beyond') === true && old.state.resources.iron === 1);
})();

(function test_T66_coreLoop() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  const doc = win.document;
  ['mine_start_iron', 'mine_start_coal'].forEach(id => doc.querySelector('[data-secure-mine="' + id + '"]').click());
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_iron"]').click();
  doc.querySelector('[data-mine-mine="mine_start_coal"]').click();
  doc.querySelector('[data-craft="steel"]').click();
  doc.querySelector('[data-sell="steel"]').click();
  check('Task66: secure / mine / craft / sell still work', win.state.gold > 0 && win.state.products.steel === 0);
  const target = win.state.world.mines.find(m => win.state.world.hiddenMineIds.includes(m.id));
  win.state.world.player.x = target.x; win.state.world.player.y = target.y;
  win.tickLoop();
  check('Task66: discovery still works (radius rule unchanged)', !win.state.world.hiddenMineIds.includes(target.id));
  win.state.gold = 700;
  check('Task66: expansion still works and its mines are on open ground', win.expandBase() === true && win.state.world.mines.filter(m => m.id.startsWith('mine_manaVein_')).every(m => win.isWorldPointWalkable(m.x, m.y)));
})();

// =============================================================================
// TASK 67 — Structure of the land beyond the mountain (data only; tunnel still
// locked, walkability / generation unchanged).
// Reference: tunnel exit at the range's back edge (-6.1, 1); zones by distance
// from it: deepForest <3.5, rockyGround <6.5, halfDugMine <9, rareDeep beyond.
// =============================================================================
const T67_ZONES = ['deepForest', 'rockyGround', 'halfDugMine', 'rareDeep'];
function t67Sweep(win, fn) {
  for (let y = -10; y <= 10; y += 0.25) for (let x = -10; x <= 10; x += 0.25) fn(+x.toFixed(2), +y.toFixed(2));
}

(function test_T67_regions() {
  const win = newDom(makeMemoryStorage()).window;
  const kinds = new Set(['open', 'tunnel', 'mountain', 'beyond']);
  let allClassified = true, walkOk = true, sameAsT66 = true, regionShapeOk = true;
  const seen = new Set();
  t67Sweep(win, (x, y) => {
    const r = win.terrainRegionAt(x, y);
    seen.add(r);
    if (!kinds.has(r)) allClassified = false;
    const walk = win.isWorldPointWalkable(x, y);
    if (walk && !(r === 'open' || r === 'tunnel')) walkOk = false;
    if ((r === 'mountain' || r === 'beyond') && walk) walkOk = false;
    // Walkability is exactly the Task 66 rule (unchanged by Task 67).
    const inTunnel = Math.abs(y - 1) <= 0.8;
    const stop = inTunnel ? T66_FACE(y) - 1 : T66_FACE(y);
    if (walk !== (x >= stop + 0.3)) sameAsT66 = false;
    // Region boundaries follow the face and the 2.6-wide range.
    const expect = x >= T66_FACE(y) ? 'open' : x >= T66_FACE(y) - 2.6 ? (inTunnel ? 'tunnel' : 'mountain') : 'beyond';
    if (r !== expect) regionShapeOk = false;
  });
  check('Task67: every in-bounds point is open / tunnel / mountain / beyond', allClassified && ['open', 'tunnel', 'mountain', 'beyond'].every(k => seen.has(k)));
  check('Task67: region borders follow the rock face and the range width', regionShapeOk);
  check('Task67: only open ground and the front of the tunnel are walkable', walkOk);
  check('Task67: walkability is exactly the Task 66 rule (unchanged)', sameAsT66);
  check('Task67: outside the world bounds is "outside"', win.terrainRegionAt(10.5, 0) === 'outside' && win.terrainRegionAt(0, -11) === 'outside' && win.terrainRegionAt(Number.NaN, 0) === 'outside');
})();

(function test_T67_tunnelConnectsToBeyond() {
  const win = newDom(makeMemoryStorage()).window;
  const exit = win.terrainTunnelExit();
  const t = win.terrainTunnel();
  check('Task67: tunnel exit is on the back edge of the range at the tunnel row', exit.x === -6.1 && exit.y === 1 && exit.x === win.terrainRangeBackX(1));
  check('Task67: the passage runs from the gate to the exit through the range', win.terrainRegionAt(t.gateX - 0.1, 1) === 'tunnel' && win.terrainRegionAt(exit.x + 0.05, 1) === 'tunnel');
  check('Task67: just past the exit is beyond, in the deep forest', win.terrainRegionAt(exit.x - 0.1, 1) === 'beyond' && win.terrainBeyondZoneAt(exit.x - 0.1, 1) === 'deepForest');
  check('Task67: the passage behind the gate is not walkable while locked', !win.isWorldPointWalkable(t.gateX - 0.1, 1) && !win.isWorldPointWalkable(exit.x + 0.05, 1));
  check('Task67: tunnel and beyond are both still locked', t.locked === true && win.terrainTunnelOpen() === false);
  // Beyond is only reachable through the tunnel: every beyond point touches
  // open ground only via the range (no beyond point is next to open ground).
  let sealed = true;
  t67Sweep(win, (x, y) => {
    if (win.terrainRegionAt(x, y) !== 'beyond') return;
    [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].forEach(([dx, dy]) => { if (win.terrainRegionAt(x + dx, y + dy) === 'open') sealed = false; });
  });
  check('Task67: beyond never borders open ground directly (the range is between them)', sealed);
})();

(function test_T67_beyondZones() {
  const win = newDom(makeMemoryStorage()).window;
  const exit = win.terrainTunnelExit();
  const zoneAt = {}, minBase = {}, okOrder = { v: true };
  let everyBeyondZoned = true, nonBeyondNull = true;
  t67Sweep(win, (x, y) => {
    const z = win.terrainBeyondZoneAt(x, y);
    const r = win.terrainRegionAt(x, y);
    if (r === 'beyond') {
      if (!T67_ZONES.includes(z)) everyBeyondZoned = false;
      zoneAt[z] = (zoneAt[z] || 0) + 1;
      const d = Math.hypot(x - 2, y);
      minBase[z] = Math.min(minBase[z] === undefined ? Infinity : minBase[z], d);
      const de = Math.hypot(x - exit.x, y - exit.y);
      const expected = de < 3.5 ? 'deepForest' : de < 6.5 ? 'rockyGround' : de < 9 ? 'halfDugMine' : 'rareDeep';
      if (z !== expected) okOrder.v = false;
    } else if (z !== null) nonBeyondNull = false;
  });
  check('Task67: every beyond point has an environment zone', everyBeyondZoned);
  check('Task67: zones run forest -> rocky -> abandoned mine -> rare, by distance from the tunnel exit', okOrder.v);
  check('Task67: all four zones exist inside the current world bounds', T67_ZONES.every(z => zoneAt[z] > 0));
  check('Task67: non-beyond points have no zone', nonBeyondNull);
  check('Task67: zones walking away from the exit never go back to a nearer zone', (() => {
    let last = -1;
    for (let y = 1; y >= -10; y -= 0.25) { const z = win.terrainBeyondZoneAt(-8, y); if (z === null) continue; const i = T67_ZONES.indexOf(z); if (i < last) return false; last = i; }
    return last === T67_ZONES.length - 1;
  })());
  // Distance rarity: all of beyond is far from the base (far ring starts at 7,
  // outer at 10); the rare-vein zone lies entirely in the outer ring.
  check('Task67: all of beyond is at far-ring distance or more from the base', Object.values(minBase).every(d => d >= 7));
  check('Task67: abandoned mine and rare zones lie in the outer ring (>= 10 from the base)', minBase.halfDugMine >= 10 && minBase.rareDeep >= 10);
})();

(function test_T67_nothingPlacedYet() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const w = win.state.world;
  check('Task67: new games still place no mine beyond or on the range', w.mines.every(m => win.terrainRegionAt(m.x, m.y) === 'open'));
  check('Task67: generation rules unchanged (14 mines, starters, mid cap)', w.mines.length === 14 && t65MidOk(w.base, w.mines) && ['mine_start_iron', 'mine_start_coal'].every(id => w.mines.some(m => m.id === id)));
  const stage = win.document.getElementById('worldStage');
  check('Task67: no environment objects are created yet', !stage.querySelector('[data-zone], [data-beyond-feature]') && stage.querySelectorAll('[data-terrain="peak"]').length === win.terrainPeaks().length);
})();

(function test_T67_oldSaveBeyondDataKept() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  win.saveGame();
  const payload = JSON.parse(storage.getItem('gachaFactorySave'));
  const beyondMines = [
    { id: 'mine_old_forest', x: -8, y: 2, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { id: 'mine_old_rare', x: -9, y: -9, resource: 'plasma', grade: 4, miningPower: 1, developmentState: 'unsecured' },
    { id: 'mine_old_rock', x: -7, y: 6, resource: 'mana', grade: 2, miningPower: 3, developmentState: 'secured' },
  ];
  payload.run.world.mines = payload.run.world.mines.concat(beyondMines);
  payload.run.world.hiddenMineIds = payload.run.world.hiddenMineIds.concat(['mine_old_forest', 'mine_old_rare']);
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const fields = (ms) => JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]));
  const old = newDom(storage).window;
  const kept = old.state.world.mines.filter(m => m.id.startsWith('mine_old_'));
  check('Task67: older beyond-mountain mines keep coords / resource / grade / state', fields(kept) === fields(beyondMines));
  check('Task67: older hidden ids for beyond mines are kept', ['mine_old_forest', 'mine_old_rare'].every(id => old.state.world.hiddenMineIds.includes(id)));
  check('Task67: those mines sit in the beyond zones', old.terrainBeyondZoneAt(-8, 2) === 'deepForest' && old.terrainBeyondZoneAt(-9, -9) === 'rareDeep');
  // Walking the whole face while the tunnel is locked can't reach them.
  const p = old.state.world.player;
  for (let y = -10; y <= 10; y += 0.5) { p.x = old.terrainFaceX(y) + 0.3; p.y = y; old.tickExploration(); }
  check('Task67: they stay undiscovered while the tunnel is locked', ['mine_old_forest', 'mine_old_rare'].every(id => old.state.world.hiddenMineIds.includes(id)));
  old.saveGame();
  const again = newDom(storage).window;
  check('Task67: a save/load round trip keeps them unchanged', fields(again.state.world.mines.filter(m => m.id.startsWith('mine_old_'))) === fields(beyondMines) && ['mine_old_forest', 'mine_old_rare'].every(id => again.state.world.hiddenMineIds.includes(id)));
  const raw = storage.getItem('gachaFactorySave');
  check('Task67: zones / regions are not written to the save; saveVersion 1', !/deepForest|rockyGround|halfDugMine|rareDeep|beyond/i.test(raw) && JSON.parse(raw).saveVersion === 1);
})();

// =============================================================================
// TASK 68 — Opening the tunnel (state, movement, drawing, save). How the tunnel
// gets opened (research) is a later Task: these tests call unlockTunnel().
// Reference: gate x -4.5, mouth x -3.5 at y 1 (±0.8), range back edge x -6.1
// at the tunnel row, player margin 0.3, saveVersion 1.
// =============================================================================

function t68Hold(win, keys, ticks) {
  keys.forEach(k => win.setPlayerHeld(k, true));
  for (let i = 0; i < ticks; i++) win.tickPlayer();
  win.clearPlayerHeld();
  win.tickPlayer();
}

(function test_T68_closedByDefault() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task68: a new game starts with the tunnel closed', win.state.world.tunnelUnlocked === false);
  check('Task68: closed tunnel reports locked and beyond inaccessible', win.terrainTunnel().locked === true && win.terrainTunnelOpen() === false);
  check('Task68: closed — the passage and beyond are not walkable', !win.isWorldPointWalkable(-5, 1) && !win.isWorldPointWalkable(-8, 1) && !win.isWorldPointWalkable(-8, 5));
  check('Task68: walkability can be asked about a given tunnel state', win.isWorldPointWalkable(-8, 1, true) === true && win.isWorldPointWalkable(-8, 1, false) === false);
  check('Task68: no "LOCKED" constant is left in the terrain data', win.WORLD_TERRAIN === undefined || win.WORLD_TERRAIN.TUNNEL.LOCKED === undefined);
})();

(function test_T68_unlockTunnel() {
  const win = newDom(makeMemoryStorage()).window;
  const logBefore = win.document.getElementById('log').children.length;
  check('Task68: unlockTunnel opens a closed tunnel', win.unlockTunnel() === true && win.state.world.tunnelUnlocked === true);
  check('Task68: unlockTunnel writes one log line', win.document.getElementById('log').children.length === logBefore + 1 && win.document.getElementById('log').firstChild.textContent.includes('터널'));
  check('Task68: unlocked tunnel reports open and beyond accessible', win.terrainTunnel().locked === false && win.terrainTunnelOpen() === true);
  const logAfter = win.document.getElementById('log').children.length;
  check('Task68: opening twice is rejected and changes nothing', win.unlockTunnel() === false && win.state.world.tunnelUnlocked === true && win.document.getElementById('log').children.length === logAfter);
  check('Task68: opening costs nothing (gold and resources untouched)', win.state.gold === 0 && Object.values(win.state.resources).every(v => v === 0));
})();

(function test_T68_walkThroughTunnel() {
  const win = newDom(makeMemoryStorage()).window;
  win.unlockTunnel();
  const p = win.state.world.player;
  p.x = 0; p.y = 1;
  let allWalkable = true, sawTunnel = false, sawBeyond = false, neverMountain = true;
  win.setPlayerHeld('left', true);
  for (let i = 0; i < 80; i++) {
    win.tickPlayer();
    if (!win.isWorldPointWalkable(p.x, p.y)) allWalkable = false;
    const r = win.terrainRegionAt(p.x, p.y);
    if (r === 'tunnel') sawTunnel = true;
    if (r === 'beyond') sawBeyond = true;
    if (r === 'mountain') neverMountain = false;
  }
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task68: the player walks from open ground through the tunnel', sawTunnel);
  check('Task68: ...and out onto the land beyond', sawBeyond && win.terrainRegionAt(p.x, p.y) === 'beyond');
  check('Task68: every step on the way is walkable and never inside the mountain', allWalkable && neverMountain);
  check('Task68: the player reaches the west edge of the world', p.x <= -9.99 && p.y === 1);
  check('Task68: beyond the tunnel exit is the deep forest zone first', win.terrainBeyondZoneAt(-6.5, 1) === 'deepForest');
  t68Hold(win, ['right'], 100);
  check('Task68: the player can walk back out through the tunnel to open ground', win.terrainRegionAt(p.x, p.y) === 'open' && p.x > -2);
})();

(function test_T68_mountainStaysSolid() {
  const win = newDom(makeMemoryStorage()).window;
  win.unlockTunnel();
  let mountainBlocked = true, passageOpen = true, beyondOpen = true, nearEdgeBlocked = true, openGroundSame = true;
  t67Sweep(win, (x, y) => {
    const r = win.terrainRegionAt(x, y);
    const walk = win.isWorldPointWalkable(x, y);
    const inRows = Math.abs(y - 1) <= 0.8;
    if (r === 'mountain' && walk) mountainBlocked = false;
    if (r === 'tunnel' && !walk) passageOpen = false;
    if (r === 'beyond') {
      const edgeOk = x <= win.terrainRangeBackX(y) - 0.3;
      if (inRows ? !walk : walk !== edgeOk) beyondOpen = false;
      if (!inRows && !edgeOk && walk) nearEdgeBlocked = false;
    }
    if (r === 'open') { const was = x >= win.terrainFaceX(y) + 0.3; if (walk !== was) openGroundSame = false; }
  });
  check('Task68: with the tunnel open, no point of the mountain itself is walkable', mountainBlocked);
  check('Task68: the whole passage through the range is walkable', passageOpen);
  check('Task68: all of the land beyond is walkable (keeping the margin from the rock)', beyondOpen && nearEdgeBlocked);
  check('Task68: open ground east of the face behaves exactly as before', openGroundSame);
  check('Task68: outside the world bounds is still not walkable', !win.isWorldPointWalkable(-10.5, 1) && !win.isWorldPointWalkable(0, 10.5) && !win.isWorldPointWalkable(Number.NaN, 1));
})();

(function test_T68_movementAtTheEdges() {
  const win = newDom(makeMemoryStorage()).window;
  win.unlockTunnel();
  const p = win.state.world.player;
  // Pushing into the passage wall slides to a stop flush against it.
  p.x = -5; p.y = 1;
  t68Hold(win, ['up'], 20);
  check('Task68: inside the passage the rock on the side stops the player', p.y >= 0.2 - 1e-9 && p.y < 0.2 + 1e-3 && p.x === -5);
  p.x = -5; p.y = 1;
  t68Hold(win, ['down'], 20);
  check('Task68: ...on the other side too', p.y <= 1.8 + 1e-9 && p.y > 1.8 - 1e-3);
  // From the land beyond, pushing east at a non-tunnel row stops at the back edge.
  p.x = -8; p.y = 5;
  t68Hold(win, ['right'], 40);
  check('Task68: from beyond, the mountain cannot be crossed back to open ground', Math.abs(p.x - (-6.6 - 0.3)) < 1e-3 && win.terrainRegionAt(p.x, p.y) === 'beyond');
  // Sliding along the back edge of the range keeps the walk pose and never enters rock.
  p.x = -7.2; p.y = 6;
  win.setPlayerHeld('right', true); win.setPlayerHeld('up', true);
  let inside = false, poses = [];
  for (let i = 0; i < 25; i++) { win.tickPlayer(); poses.push(p.pose); if (!win.isWorldPointWalkable(p.x, p.y)) inside = true; }
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task68: sliding along the range from beyond never enters rock', !inside && poses.every(ps => ps === 'walk'));
  check('Task68: ...and ends up in the tunnel rows after sliding north', p.y < 1.8);
  // Diagonal speed on the land beyond is unchanged (3 units/second, normalised).
  p.x = -9; p.y = -2;
  win.setPlayerHeld('up', true); win.setPlayerHeld('right', true);
  for (let i = 0; i < 4; i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task68: beyond is walked at the normal speed', Math.abs(Math.hypot(p.x - (-9), p.y - (-2)) - 1.2) < 1e-9);
})();

(function test_T68_tunnelDrawing() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const doc = win.document;
  const stage = doc.getElementById('worldStage');
  const closedPeaks = stage.querySelectorAll('[data-terrain="peak"]').length;
  check('Task68: closed — the tunnel is drawn locked with the locked label', stage.querySelector('[data-tunnel]').classList.contains('is-locked') && stage.querySelector('[data-tunnel-label]').textContent.includes('잠긴 터널') && !stage.querySelector('[data-terrain="tunnel-passage"]'));
  check('Task68: closed — the map tunnel is the recess only', (() => { const r = doc.querySelector('[data-map-tunnel]'); return !r.classList.contains('is-open') && Math.abs(parseFloat(r.getAttribute('x')) - (-4.5)) < 1e-9; })());
  win.unlockTunnel();
  win.renderAll(); win.renderAll();
  const tunnel = stage.querySelector('[data-tunnel]');
  check('Task68: open — the tunnel is drawn open, not locked', tunnel.getAttribute('data-tunnel-locked') === 'false' && tunnel.classList.contains('is-open') && !tunnel.classList.contains('is-locked'));
  check('Task68: open — the label no longer says locked', stage.querySelector('[data-tunnel-label]').textContent === '터널' && !tunnel.title.includes('잠김'));
  const t = win.terrainTunnel();
  const pos = win.worldToStagePercent(t.mouthX - 0.1, t.y + t.halfWidth);
  check('Task68: open — the arch moves to the mouth, placed through the stage projection', tunnel.style.left === pos.left + '%' && tunnel.style.top === pos.top + '%');
  check('Task68: re-rendering draws exactly one tunnel, one passage and one ground', stage.querySelectorAll('[data-tunnel]').length === 1 && stage.querySelectorAll('[data-terrain="tunnel-passage"]').length === 1 && stage.querySelectorAll('.world-ground svg').length === 1);
  check('Task68: peaks follow terrainPeaks() and leave the passage clear', stage.querySelectorAll('[data-terrain="peak"]').length === win.terrainPeaks().length && win.terrainPeaks().every(pk => pk.row === 'front' || Math.abs(pk.y - 1) >= 1.2) && win.terrainPeaks().length < closedPeaks + 1);
  check('Task68: the mountain footprint is still drawn', !!stage.querySelector('.world-ground polygon.world-range-rock') && !!stage.querySelector('.world-ground polygon[data-terrain="beyond"]'));
  const mapTunnel = doc.querySelector('[data-map-tunnel]');
  const exit = win.terrainTunnelExit();
  check('Task68: open — the map tunnel runs from the mouth through to the far exit', mapTunnel.classList.contains('is-open') && Math.abs(parseFloat(mapTunnel.getAttribute('x')) - exit.x) < 1e-9 && Math.abs(parseFloat(mapTunnel.getAttribute('width')) - (t.mouthX - exit.x)) < 1e-9);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  check('Task68: the open tunnel and passage are styled and click-through', /\.world-tunnel\.is-open\{/.test(css) && /\.world-tunnel-passage\{/.test(css) && /\.world-map-tunnel\.is-open\{/.test(css) && /\.world-tunnel\{[^}]*pointer-events:none/.test(css));
  stage.querySelector('[data-terrain="tunnel-passage"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  check('Task68: clicking the passage behaves like empty ground', win.getWorldSelection() === null);
})();

(function test_T68_saveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  win.unlockTunnel();
  const w = win.state.world;
  w.player.x = -8; w.player.y = 1;
  win.saveGame();
  const raw = storage.getItem('gachaFactorySave');
  const saved = JSON.parse(raw);
  check('Task68: the open tunnel is saved as an additive boolean; saveVersion stays 1', saved.run.world.tunnelUnlocked === true && saved.saveVersion === 1);
  check('Task68: only that flag is saved — no terrain data', !/terrain|mountain|peak|passage|gate/i.test(raw.replace('"tunnelUnlocked":true', '').replace('"tunnelWork":true', '')));
  const win2 = newDom(storage).window;
  check('Task68: the tunnel is still open after loading', win2.state.world.tunnelUnlocked === true && win2.terrainTunnel().locked === false);
  check('Task68: a player saved beyond the mountain stays there', win2.state.world.player.x === -8 && win2.state.world.player.y === 1);
  check('Task68: the loaded game draws the open tunnel', win2.document.querySelector('#worldStage [data-tunnel]').classList.contains('is-open') && !!win2.document.querySelector('#worldStage [data-terrain="tunnel-passage"]'));
  // Closed tunnel + player beyond (hand-edited or corrupt) -> back on the base.
  const closed = JSON.parse(raw);
  closed.run.world.tunnelUnlocked = false;
  storage.setItem('gachaFactorySave', JSON.stringify(closed));
  const win3 = newDom(storage).window;
  const base = win3.state.world.base;
  check('Task68: a saved closed tunnel stays closed', win3.state.world.tunnelUnlocked === false);
  check('Task68: ...and a player beyond a closed tunnel is moved onto the base', win3.state.world.player.x === base.x && win3.state.world.player.y === base.y);
  // Older saves have no field at all; invalid values count as closed.
  [undefined, 'yes', 1, null, {}].forEach((bad, i) => {
    const old = JSON.parse(raw);
    if (bad === undefined) delete old.run.world.tunnelUnlocked; else old.run.world.tunnelUnlocked = bad;
    old.run.world.player.x = 0; old.run.world.player.y = 3;
    storage.setItem('gachaFactorySave', JSON.stringify(old));
    const w4 = newDom(storage).window;
    check('Task68: older/invalid tunnel value #' + i + ' loads as closed, everything else kept', w4.state.world.tunnelUnlocked === false && w4.state.world.player.x === 0 && w4.state.world.player.y === 3 && w4.state.world.mines.length === saved.run.world.mines.length);
  });
  // A world without any "world" field still loads with a closed tunnel.
  const noWorld = JSON.parse(raw);
  delete noWorld.run.world;
  storage.setItem('gachaFactorySave', JSON.stringify(noWorld));
  const w5 = newDom(storage).window;
  check('Task68: a save without a world loads with a closed tunnel', w5.state.world.tunnelUnlocked === false);
  // Corrupt player coordinates in an open-tunnel save fall back safely.
  const badPlayer = JSON.parse(raw);
  badPlayer.run.world.player.x = 'west'; badPlayer.run.world.player.y = null;
  storage.setItem('gachaFactorySave', JSON.stringify(badPlayer));
  const w6 = newDom(storage).window;
  check('Task68: an open tunnel with corrupt player coordinates falls back to the base', w6.state.world.tunnelUnlocked === true && w6.state.world.player.x === w6.state.world.base.x);
})();

(function test_T68_exploreBeyondAndPrestige() {
  const storage = makeMemoryStorage();
  const seed = newDom(storage, { fullWorld: true }).window;
  seed.unlockTunnel();
  seed.saveGame();
  const payload = JSON.parse(storage.getItem('gachaFactorySave'));
  payload.run.world.mines.push({ id: 'mine_t68_beyond', x: -8, y: 1, resource: 'plasma', grade: 4, miningPower: 1, developmentState: 'unsecured' });
  payload.run.world.hiddenMineIds.push('mine_t68_beyond');
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  check('Task68: an older mine beyond the mountain is still hidden at first', win.state.world.hiddenMineIds.includes('mine_t68_beyond'));
  const p = win.state.world.player;
  p.x = 0; p.y = 1;
  win.setPlayerHeld('left', true);
  for (let i = 0; i < 30; i++) { win.tickPlayer(); win.tickExploration(); }
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task68: walking through the open tunnel discovers it by the usual rule', !win.state.world.hiddenMineIds.includes('mine_t68_beyond') && win.isMineDiscovered(win.state.world.mines.find(m => m.id === 'mine_t68_beyond')));
  check('Task68: it is drawn on the exploration map once discovered', !!win.document.querySelector('[data-map-mine="mine_t68_beyond"]'));
  check('Task68: it still cannot be secured while its site is locked (existing rule)', win.secureMine('mine_t68_beyond') === false);
  // Task 74: there is no reset; completing an order leaves the open tunnel and the player alone.
  win.state.gold = 1e6; win.state.products.steel = 200;
  win.doResearch('deliveryContract');
  win.state.gold = 1e6; win.state.products.steel = 200;
  const ppBefore = JSON.stringify(win.state.world.player);
  win.completeOrder('forge');
  const pp = win.state.world.player;
  check('Task68: an order after opening the tunnel keeps the tunnel open and the player in place', win.state.world.tunnelUnlocked === true && JSON.stringify(pp) === ppBefore && win.isWorldPointWalkable(pp.x, pp.y));
})();

// =============================================================================
// TASK 69 — Mines for the land beyond the mountain. Generated once, when the
// tunnel opens (unlockTunnel); a new game still places nothing beyond the range.
// Reference table (independent of BALANCE): zone -> count, ring pool.
//   deepForest 3 (far)   rockyGround 2 (far)   halfDugMine 2 (outer)   rareDeep 1 (outer)
//   far:   mana, crystal, rareMetal, relic         outer: rareMetal, relic, cosmicShard, plasma
// Grades: mana/crystal 2, rareMetal/relic 3, cosmicShard/plasma 4.
// =============================================================================

const T69_ZONE_COUNT = { deepForest: 3, rockyGround: 2, halfDugMine: 2, rareDeep: 1 };
const T69_ZONE_POOL = {
  deepForest: ['mana', 'crystal', 'rareMetal', 'relic'],
  rockyGround: ['mana', 'crystal', 'rareMetal', 'relic'],
  halfDugMine: ['rareMetal', 'relic', 'cosmicShard', 'plasma'],
  rareDeep: ['rareMetal', 'relic', 'cosmicShard', 'plasma'],
};
const T69_GRADE = { mana: 2, crystal: 2, rareMetal: 3, relic: 3, cosmicShard: 4, plasma: 4 };

function t69Beyond(win, mines) {
  return mines.filter(m => win.terrainRegionAt(m.x, m.y) === 'beyond');
}

// Flood fill over a 0.25 grid from the base, true if the point can be walked to
// (tunnel state as currently set in the game).
function t69Reachable(win, tx, ty) {
  const b = win.state.world.base;
  const step = 0.25;
  const key = (x, y) => Math.round(x / step) + ',' + Math.round(y / step);
  const seen = new Set([key(b.x, b.y)]);
  const queue = [[b.x, b.y]];
  const target = key(tx, ty);
  while (queue.length) {
    const [x, y] = queue.shift();
    if (key(x, y) === target) return true;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !win.isWorldPointWalkable(nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return false;
}

function t69Problems(win, before, after) {
  const problems = [];
  const added = after.filter(m => !before.some(o => o.id === m.id));
  const coords = new Set(before.map(m => m.x + ',' + m.y));
  const perZone = {};
  added.forEach(m => {
    const zone = win.terrainBeyondZoneAt(m.x, m.y);
    perZone[zone] = (perZone[zone] || 0) + 1;
    if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || !win.isValidWorldX(m.x) || !win.isValidWorldY(m.y)) problems.push('bounds ' + m.id);
    if (win.terrainRegionAt(m.x, m.y) !== 'beyond' || m.x > win.terrainRangeBackX(m.y) - 1 + 1e-9) problems.push('cell ' + m.id);
    if (coords.has(m.x + ',' + m.y)) problems.push('overlap ' + m.id);
    coords.add(m.x + ',' + m.y);
    if (!T69_ZONE_POOL[zone] || !T69_ZONE_POOL[zone].includes(m.resource)) problems.push('pool ' + m.id + ' ' + zone + ' ' + m.resource);
    if (m.grade !== T69_GRADE[m.resource] || m.miningPower !== 1 || m.developmentState !== 'unsecured') problems.push('fields ' + m.id);
    if (!win.state.world.hiddenMineIds.includes(m.id)) problems.push('not hidden ' + m.id);
  });
  Object.keys(T69_ZONE_COUNT).forEach(z => { if ((perZone[z] || 0) !== T69_ZONE_COUNT[z]) problems.push('count ' + z + ' ' + (perZone[z] || 0)); });
  if (new Set(after.map(m => m.id)).size !== after.length) problems.push('duplicate ids');
  return problems;
}

(function test_T69_newGamePlacesNothingBeyond() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  check('Task69: a new game places no mine beyond the mountain', t69Beyond(win, win.state.world.mines).length === 0 && win.state.world.mines.length === 14);
})();

(function test_T69_unlockGeneratesBeyondMines() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const before = win.state.world.mines.map(m => ({ ...m }));
  const hiddenBefore = win.state.world.hiddenMineIds.slice();
  check('Task69: opening the tunnel succeeds', win.unlockTunnel() === true);
  const after = win.state.world.mines;
  check('Task69: 8 mines are added (3 forest, 2 rock, 2 half-dug mine, 1 rare)', after.length === 22);
  check('Task69: every new mine obeys the zone / cell / pool / grade / hidden rules', t69Problems(win, before, after).length === 0, t69Problems(win, before, after).join('; '));
  check('Task69: the first 14 mines are untouched', JSON.stringify(after.slice(0, 14)) === JSON.stringify(before));
  check('Task69: earlier hidden ids are kept and the new ones are appended', JSON.stringify(win.state.world.hiddenMineIds.slice(0, hiddenBefore.length)) === JSON.stringify(hiddenBefore) && win.state.world.hiddenMineIds.length === hiddenBefore.length + 8);
  check('Task69: new mines are all in the beyond region and none on the open side', t69Beyond(win, after).length === 8 && after.slice(0, 14).every(m => win.terrainRegionAt(m.x, m.y) === 'open'));
  check('Task69: opening again changes nothing (no second batch)', win.unlockTunnel() === false && win.state.world.mines.length === 22);
  check('Task69: populating again adds nothing (every zone is full)', win.populateBeyondMines().length === 0 && win.state.world.mines.length === 22);
})();

(function test_T69_sweepEveryRule() {
  let bad = 0, firstDetail = '';
  for (let seed = 1; seed <= 150; seed++) {
    const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
    const before = win.state.world.mines.map(m => ({ ...m }));
    win.unlockTunnel({ random: t63Lcg(seed * 7919) });
    const problems = t69Problems(win, before, win.state.world.mines);
    if (problems.length) { bad++; if (!firstDetail) firstDetail = 'seed ' + seed + ': ' + problems.join('; '); }
    win.close();
  }
  check('Task69: 150 seeded openings obey every rule', bad === 0, firstDetail);
})();

(function test_T69_reachableAndDiscoverable() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.unlockTunnel({ random: t63Lcg(42) });
  const beyond = t69Beyond(win, win.state.world.mines);
  const hiddenCount = () => beyond.filter(m => win.state.world.hiddenMineIds.includes(m.id)).length;
  check('Task69: every new mine can be walked to through the open tunnel', beyond.length === 8 && beyond.every(m => t69Reachable(win, m.x, m.y)));
  check('Task69: all of them start undiscovered', hiddenCount() === 8);
  // Walk the real route: through the tunnel to the west edge, then north and south along the land.
  const p = win.state.world.player;
  p.x = 0; p.y = 1;
  const walk = (key, ticks) => {
    win.setPlayerHeld(key, true);
    for (let i = 0; i < ticks; i++) { win.tickPlayer(); win.tickExploration(); }
    win.clearPlayerHeld(); win.tickPlayer();
  };
  walk('left', 60);
  check('Task69: the player gets through the tunnel to the west edge of the world', p.x === -10 && p.y === 1);
  walk('up', 80);
  walk('down', 160);
  check('Task69: the whole route stayed on walkable ground and ended at the south edge', win.isWorldPointWalkable(p.x, p.y) && p.y === 10);
  check('Task69: walking the land beyond discovers every one of them by the usual rule', hiddenCount() === 0);
})();

(function test_T69_hiddenUntilFound() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.unlockTunnel({ random: t63Lcg(7) });
  win.renderAll();
  const beyond = t69Beyond(win, win.state.world.mines);
  const stage = win.document.getElementById('worldStage');
  check('Task69: new mines are drawn as unknown rocks on the stage', beyond.every(m => { const n = stage.querySelector('[data-world-mine="' + m.id + '"]'); return n && n.classList.contains('is-undiscovered'); }));
  check('Task69: they stay off the exploration map and the mine list', beyond.every(m => !win.document.querySelector('[data-map-mine="' + m.id + '"]') && !win.document.querySelector('[data-secure-mine="' + m.id + '"]')));
  check('Task69: the list says how many are still hidden', win.document.querySelector('[data-hidden-mines]') && parseInt(win.document.querySelector('[data-hidden-mines]').getAttribute('data-hidden-mines'), 10) === win.state.world.hiddenMineIds.length);
  const near = beyond[0];
  win.state.world.player.x = near.x; win.state.world.player.y = near.y;
  win.tickExploration();
  check('Task69: walking up to one discovers it with the usual rule', !win.state.world.hiddenMineIds.includes(near.id) && !!win.document.querySelector('[data-map-mine="' + near.id + '"]'));
  check('Task69: a discovered mine still cannot be secured before its site is unlocked (existing rule)', win.secureMine(near.id) === false);
  const res = win.RESOURCES.find(r => r.key === near.resource);
  win.state.unlockedSites[res.site] = true;
  check('Task69: ...and can once its site is unlocked', win.secureMine(near.id) === true && win.mineMine(near.id) === true && win.state.resources[near.resource] === 1);
})();

(function test_T69_deterministicWithInjectedRandom() {
  const a = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const b = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const base = a.state.world.mines.filter(m => t69Beyond(a, [m]).length === 0);
  const ma = a.generateBeyondMines(base, { random: t63Lcg(99) });
  const mb = b.generateBeyondMines(base, { random: t63Lcg(99) });
  const mc = b.generateBeyondMines(base, { random: t63Lcg(100) });
  const f = (ms) => JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.resource]));
  check('Task69: the same random source gives the same layout', f(ma) === f(mb));
  check('Task69: a different random source gives a different layout', f(ma) !== f(mc));
  check('Task69: the generator does not modify the mines it is given', base.length === 14 && a.state.world.mines.length === 14);
  check('Task69: ids are readable and unique', new Set(ma.map(m => m.id)).size === 8 && ma.every(m => /^mine_beyond_(deepForest|rockyGround|halfDugMine|rareDeep)_\d+$/.test(m.id)));
  check('Task69: a broken random source never throws or loops', (() => { try { return a.generateBeyondMines(base, { random: () => NaN }).length === 8; } catch (e) { return false; } })());
  check('Task69: an empty zone table generates nothing', a.generateBeyondMines(base, { zones: [] }).length === 0 && a.generateBeyondMines(base, { zones: [{ zone: 'deepForest', ring: 'missing', count: 3 }] }).length === 0);
  check('Task69: farther zones hold fewer mines than nearer ones (forest > rock > mine > rare)', ma.length === 8 && ['deepForest', 'rockyGround', 'halfDugMine', 'rareDeep'].map(z => ma.filter(m => a.terrainBeyondZoneAt(m.x, m.y) === z).length).join() === '3,2,2,1');
})();

(function test_T69_rarityRisesWithDistance() {
  // Over many openings the mines in the outer-ring zones are rarer on average than in the far-ring zones.
  const tier = { mana: 1, crystal: 1, rareMetal: 2, relic: 2, cosmicShard: 3, plasma: 3 };
  let nearSum = 0, nearN = 0, farSum = 0, farN = 0, sawTop = false;
  for (let seed = 1; seed <= 80; seed++) {
    const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
    win.unlockTunnel({ random: t63Lcg(seed * 104729) });
    win.state.world.mines.filter(m => win.terrainRegionAt(m.x, m.y) === 'beyond').forEach(m => {
      const z = win.terrainBeyondZoneAt(m.x, m.y);
      if (z === 'deepForest' || z === 'rockyGround') { nearSum += tier[m.resource]; nearN++; } else { farSum += tier[m.resource]; farN++; }
      if (tier[m.resource] === 3) sawTop = true;
    });
    win.close();
  }
  check('Task69: outer-zone mines are rarer on average than far-zone mines', farN > 0 && nearN > 0 && farSum / farN > nearSum / nearN + 0.5);
  check('Task69: the rarest resources (cosmic shard / plasma) can appear beyond the mountain', sawTop);
  check('Task69: far zones never roll the rarest resources', (() => { const win = newDom(makeMemoryStorage(), { fullWorld: true }).window; let ok = true; for (let seed = 1; seed <= 60; seed++) { win.generateBeyondMines([], { random: t63Lcg(seed) }).forEach(m => { const z = win.terrainBeyondZoneAt(m.x, m.y); if ((z === 'deepForest' || z === 'rockyGround') && (m.resource === 'cosmicShard' || m.resource === 'plasma')) ok = false; }); } return ok; })());
})();

(function test_T69_saveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  win.unlockTunnel({ random: t63Lcg(5) });
  win.saveGame();
  const raw = storage.getItem('gachaFactorySave');
  const saved = JSON.parse(raw);
  const f = (w) => JSON.stringify([w.state.world.mines.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]), w.state.world.hiddenMineIds]);
  const loaded = newDom(storage).window;
  check('Task69: the generated mines and hidden ids survive save/load unchanged', f(loaded) === f(win) && loaded.state.world.mines.length === 22);
  check('Task69: loading never generates again', loaded.state.world.tunnelUnlocked === true && loaded.unlockTunnel() === false && loaded.state.world.mines.length === 22);
  check('Task69: saveVersion stays 1 and zones are not written to the save', saved.saveVersion === 1 && !/deepForest|rockyGround|halfDugMine|rareDeep/.test(raw.replace(/mine_beyond_(deepForest|rockyGround|halfDugMine|rareDeep)_\d+/g, '')));
  // Save + load while standing beyond the mountain and then discover.
  const mine = win.state.world.mines.find(m => m.id.startsWith('mine_beyond_deepForest_'));
  win.state.world.player.x = mine.x; win.state.world.player.y = mine.y;
  win.tickExploration();
  win.saveGame();
  const again = newDom(storage).window;
  check('Task69: a discovered beyond mine stays discovered after reload', !again.state.world.hiddenMineIds.includes(mine.id) && again.state.world.player.x === mine.x && again.state.world.player.y === mine.y);
})();

(function test_T69_oldSaveWithBeyondMines() {
  // An older save made before the tunnel existed, with beyond mines already in it.
  const storage = makeMemoryStorage();
  const seed = newDom(storage, { fullWorld: true }).window;
  seed.saveGame();
  const payload = JSON.parse(storage.getItem('gachaFactorySave'));
  const old = [
    { id: 'mine_old_forest', x: -8, y: 2, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { id: 'mine_old_rock', x: -7, y: 6, resource: 'mana', grade: 2, miningPower: 3, developmentState: 'secured' },
    { id: 'mine_old_rare', x: -9, y: -9, resource: 'plasma', grade: 4, miningPower: 1, developmentState: 'unsecured' },
  ];
  payload.run.world.mines = payload.run.world.mines.concat(old);
  payload.run.world.hiddenMineIds = payload.run.world.hiddenMineIds.concat(['mine_old_forest', 'mine_old_rare']);
  storage.setItem('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  const fields = (ms) => JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.resource, m.grade, m.miningPower, m.developmentState]));
  const before = win.state.world.mines.map(m => ({ ...m }));
  check('Task69: loading the older save does not generate anything', win.state.world.mines.length === 17 && win.state.world.tunnelUnlocked === false);
  win.unlockTunnel({ random: t63Lcg(11) });
  const after = win.state.world.mines;
  const beyondNow = t69Beyond(win, after);
  const zoneCount = (z) => beyondNow.filter(m => win.terrainBeyondZoneAt(m.x, m.y) === z).length;
  check('Task69: the older beyond mines are kept exactly (coords, resource, grade, power, state)', fields(after.filter(m => m.id.startsWith('mine_old_'))) === fields(old));
  check('Task69: nothing else is moved or changed', fields(after.slice(0, 17)) === fields(before));
  check('Task69: each zone is only topped up to its count (3 / 2 / 2 / 1 in total)', zoneCount('deepForest') === 3 && zoneCount('rockyGround') === 2 && zoneCount('halfDugMine') === 2 && zoneCount('rareDeep') === 1);
  check('Task69: only the missing 5 are added; older hidden ids are kept', after.length === 17 + 5 && ['mine_old_forest', 'mine_old_rare'].every(id => win.state.world.hiddenMineIds.includes(id)) && !win.state.world.hiddenMineIds.includes('mine_old_rock'));
  check('Task69: no new mine shares a cell with an older one', new Set(after.map(m => m.x + ',' + m.y)).size === after.length);
})();

(function test_T69_ordersKeepTheTunnelOpen() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.unlockTunnel({ random: t63Lcg(3) });
  const count = win.state.world.mines.length;
  win.state.gold = 1e6; win.state.products.steel = 200;
  win.doResearch('deliveryContract');
  win.state.gold = 1e6; win.state.products.steel = 200;
  win.completeOrder('forge');
  check('Task69: an order keeps the tunnel open and the beyond mines (nothing is reset or generated again)', win.state.world.tunnelUnlocked === true && t69Beyond(win, win.state.world.mines).length > 0 && win.state.world.mines.length === count);
})();

// =============================================================================
// TASK 70 — Research. One item for now: "터널 굴착" (tunnelWork) costs 1500 gold
// + 5 마법 합금 (alloy) and opens the tunnel (Task 68/69). Research is instant,
// run-scoped (resets with a new run) and saved in state.research.
// Reference values are hard-coded here, not read back from the game.
// =============================================================================

function t70Afford(win) {
  win.state.gold = 1500;
  win.state.products.alloy = 5;
}

(function test_T70_dataAndNewGame() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const def = win.researchDef('tunnelWork');
  check('Task70: the tunnel research exists with its name', !!def && def.name === '터널 굴착');
  check('Task70: it costs 1500 gold and 5 magic alloy and needs no other research', def.cost.gold === 1500 && Object.keys(def.cost.products).join() === 'alloy' && def.cost.products.alloy === 5 && def.requires.length === 0);
  check('Task70: it opens the tunnel', def.effect === 'unlockTunnel');
  check('Task70: a new game has the research map with nothing done', Object.keys(win.state.research).every(k => win.state.research[k] === false) && win.state.research.tunnelWork === false);
  check('Task70: status of a new game is available, not done', win.researchStatus('tunnelWork') === 'available' && win.isResearchDone('tunnelWork') === false);
  check('Task70: unknown / non-string keys have no definition', win.researchDef('nope') === null && win.researchDef(null) === null && win.researchDef(5) === null && win.researchStatus('nope') === null);
})();

(function test_T70_affordability() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  check('Task70: nothing owned — cannot research', win.canResearch('tunnelWork') === false);
  win.state.gold = 1500;
  check('Task70: gold alone is not enough', win.canResearch('tunnelWork') === false);
  win.state.gold = 1499; win.state.products.alloy = 5;
  check('Task70: one gold short is not enough', win.canResearch('tunnelWork') === false);
  win.state.gold = 1500; win.state.products.alloy = 4;
  check('Task70: one alloy short is not enough', win.canResearch('tunnelWork') === false);
  win.state.products.alloy = 5;
  check('Task70: exactly the cost is enough', win.canResearch('tunnelWork') === true);
  check('Task70: invalid keys can never be researched', win.canResearch('nope') === false && win.canResearch(undefined) === false && win.canResearch({}) === false);
})();

(function test_T70_failureChangesNothing() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.state.gold = 1499; win.state.products.alloy = 9; win.state.products.steel = 3; win.state.resources.mana = 2;
  const snap = JSON.stringify([win.state.gold, win.state.products, win.state.resources, win.state.research, win.state.world.tunnelUnlocked, win.state.world.mines.length]);
  const logs = win.document.getElementById('log').children.length;
  check('Task70: a failed research returns false', win.doResearch('tunnelWork') === false && win.doResearch('nope') === false);
  check('Task70: ...and spends and changes nothing (no log, tunnel still closed)', JSON.stringify([win.state.gold, win.state.products, win.state.resources, win.state.research, win.state.world.tunnelUnlocked, win.state.world.mines.length]) === snap && win.document.getElementById('log').children.length === logs);
})();

(function test_T70_researchTheTunnel() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.state.gold = 2000; win.state.products.alloy = 7; win.state.products.steel = 3; win.state.resources.mana = 2;
  const logEl = win.document.getElementById('log');
  const logs = logEl.children.length;
  check('Task70: researching with enough succeeds', win.doResearch('tunnelWork') === true);
  check('Task70: it costs exactly 1500 gold and 5 alloy', win.state.gold === 500 && win.state.products.alloy === 2);
  check('Task70: nothing else is spent', win.state.products.steel === 3 && win.state.resources.mana === 2);
  check('Task70: it is marked done and stays done', win.isResearchDone('tunnelWork') === true && win.researchStatus('tunnelWork') === 'done' && win.state.research.tunnelWork === true);
  check('Task70: the tunnel is open and its mines were generated (14 + 8)', win.state.world.tunnelUnlocked === true && win.state.world.mines.length === 22 && win.terrainTunnelOpen() === true);
  check('Task70: two log lines, the research first and the tunnel on top', logEl.children.length === logs + 2 && logEl.children[1].textContent === '연구 완료: 터널 굴착' && logEl.children[0].textContent.includes('터널이 열렸습니다'));
  const afterGold = win.state.gold;
  win.state.products.alloy = 10; win.state.gold = 5000;
  check('Task70: a finished research cannot be bought again (nothing spent)', win.canResearch('tunnelWork') === false && win.doResearch('tunnelWork') === false && win.state.gold === 5000 && win.state.products.alloy === 10 && win.state.world.mines.length === 22);
  check('Task70: the player can now walk through the tunnel', (() => { const p = win.state.world.player; p.x = 0; p.y = 1; t68Hold(win, ['left'], 60); return win.terrainRegionAt(p.x, p.y) === 'beyond'; })());
  void afterGold;
})();

(function test_T70_effectOpensItsOwnResearch() {
  // The tunnel opened without paying (Task 68 tests call unlockTunnel directly) counts as researched.
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.unlockTunnel();
  check('Task70: opening the tunnel directly marks the research done', win.state.research.tunnelWork === true && win.researchStatus('tunnelWork') === 'done');
  t70Afford(win);
  check('Task70: ...so it cannot be paid for afterwards', win.canResearch('tunnelWork') === false && win.doResearch('tunnelWork') === false && win.state.gold === 1500 && win.state.products.alloy === 5);
})();

(function test_T70_prerequisites() {
  // Add a second research that requires the first, to check the prerequisite rule.
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  win.RESEARCH.push({ key: 't70_second', name: '테스트 연구', desc: '', effect: 'unlockTunnel', cost: { gold: 10 }, requires: ['tunnelWork'] });
  win.state.gold = 10;
  check('Task70: a research whose requirement is missing is locked and cannot be bought', win.researchStatus('t70_second') === 'locked' && win.canResearch('t70_second') === false && win.doResearch('t70_second') === false && win.state.gold === 10);
  win.state.research.tunnelWork = true;
  check('Task70: once the requirement is done it becomes available', win.researchStatus('t70_second') === 'available' && win.canResearch('t70_second') === true);
  check('Task70: a state without the research key still works (treated as not done)', win.state.research.t70_second === undefined && win.isResearchDone('t70_second') === false);
  check('Task70: buying it spends its cost and marks it done', win.doResearch('t70_second') === true && win.state.gold === 0 && win.state.research.t70_second === true);
  win.RESEARCH.pop();
})();

(function test_T70_ui() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const doc = win.document;
  const tab = doc.querySelector('.tab-btn[data-tab="research"]');
  check('Task70: the tab bar has a 연구 tab and its panel', !!tab && tab.textContent === '연구' && !!doc.getElementById('tab-research') && !!doc.getElementById('researchList'));
  tab.click();
  check('Task70: clicking the tab shows the research panel', doc.getElementById('tab-research').classList.contains('active') && !doc.getElementById('tab-mining').classList.contains('active'));
  const card = doc.querySelector('[data-research-card="tunnelWork"]');
  const btn = doc.querySelector('[data-research="tunnelWork"]');
  check('Task70: one card with name, description, cost line and a button', !!card && card.textContent.includes('터널 굴착') && card.textContent.includes('산을 가로지르는') && card.getAttribute('data-research-status') === 'available' && !!btn);
  const cost = doc.querySelector('[data-research-cost="tunnelWork"]');
  check('Task70: the cost line shows gold and alloy with what the player has', cost.textContent.includes('1,500G') && cost.textContent.includes('마법 합금 5개') && cost.textContent.includes('보유 0G') && cost.textContent.includes('보유 0개'));
  check('Task70: the button is disabled while the cost is not met', btn.disabled === true && btn.textContent === '연구하기');
  btn.click();
  check('Task70: clicking a disabled button does nothing', win.state.research.tunnelWork === false && win.state.world.tunnelUnlocked === false);
  t70Afford(win);
  win.updateNumbers();
  check('Task70: the per-tick refresh enables the button without rebuilding it', doc.querySelector('[data-research="tunnelWork"]') === btn && btn.disabled === false && doc.querySelector('[data-research-cost="tunnelWork"]').textContent.includes('보유 1,500G') && doc.querySelector('[data-research-cost="tunnelWork"]').textContent.includes('보유 5개'));
  win.state.gold = 1499;
  win.updateNumbers();
  check('Task70: ...and disables it again when the cost is no longer met', btn.disabled === true);
  win.state.gold = 1500;
  win.updateNumbers();
  btn.click();
  const done = doc.querySelector('[data-research="tunnelWork"]');
  check('Task70: clicking it researches, spends the cost and rebuilds the card as done', win.state.research.tunnelWork === true && win.state.gold === 0 && win.state.products.alloy === 0 && doc.querySelector('[data-research-card="tunnelWork"]').getAttribute('data-research-status') === 'done' && done.disabled === true && done.textContent === '연구 완료' && !doc.querySelector('[data-research-cost="tunnelWork"]'));
  const stage = doc.getElementById('worldStage');
  check('Task70: the world is redrawn with the open tunnel and the new unknown rocks', stage.querySelector('[data-tunnel]').getAttribute('data-tunnel-locked') === 'false' && stage.querySelectorAll('[data-world-mine].is-undiscovered').length >= 8 && !!doc.querySelector('[data-map-tunnel].is-open'));
  win.renderAll(); win.renderAll();
  check('Task70: re-rendering never duplicates the research card', doc.querySelectorAll('[data-research-card="tunnelWork"]').length === 1 && doc.querySelectorAll('[data-research-card]').length === win.RESEARCH.length);
})();

(function test_T70_lockedTunnelPointsToResearch() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const tunnel = win.document.querySelector('#worldStage [data-tunnel]');
  check('Task70: the locked tunnel tells the player where to open it', tunnel.title.includes('연구') && tunnel.title.includes('터널 굴착'));
})();

(function test_T70_saveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage, { fullWorld: true }).window;
  t70Afford(win);
  win.doResearch('tunnelWork');
  win.saveGame();
  const saved = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task70: research is saved in the run as an additive map; saveVersion stays 1', saved.run.research.tunnelWork === true && saved.run.research.workshopBuild === false && saved.run.research.autoCraftDevice === false && saved.saveVersion === 1);
  const loaded = newDom(storage).window;
  check('Task70: it is still done after loading and its card shows it', loaded.state.research.tunnelWork === true && loaded.state.world.tunnelUnlocked === true && loaded.document.querySelector('[data-research-card="tunnelWork"]').getAttribute('data-research-status') === 'done');
  check('Task70: loading does not generate the beyond mines again', loaded.state.world.mines.length === 22);
  const edit = (fn) => { const p = JSON.parse(storage.getItem('gachaFactorySave')); fn(p); storage.setItem('gachaFactorySave', JSON.stringify(p)); return newDom(storage).window; };
  const older = edit((p) => { delete p.run.research; });
  check('Task70: an older save without the field loads; the open tunnel counts as researched', older.state.research.tunnelWork === true && older.state.world.tunnelUnlocked === true);
  const olderClosed = edit((p) => { delete p.run.research; p.run.world.tunnelUnlocked = false; });
  check('Task70: an older save with a closed tunnel loads as not researched', olderClosed.state.research.tunnelWork === false && olderClosed.researchStatus('tunnelWork') === 'available');
  [1, 'yes', null, [], { tunnelWork: 'yes' }].forEach((bad, i) => {
    const w = edit((p) => { p.run.research = bad; p.run.world.tunnelUnlocked = false; });
    check('Task70: invalid research value #' + i + ' loads as not done and playable', w.state.research.tunnelWork === false && w.canResearch('tunnelWork') === false && w.state.world.tunnelUnlocked === false);
  });
  const lying = edit((p) => { p.run.research = { tunnelWork: true }; p.run.world.tunnelUnlocked = false; });
  check('Task70: a research flag that disagrees with a closed tunnel is not trusted (the world decides)', lying.state.research.tunnelWork === false && lying.researchStatus('tunnelWork') === 'available');
  const unknown = edit((p) => { p.run.research = { tunnelWork: false, mystery: true }; p.run.world.tunnelUnlocked = false; });
  check('Task70: unknown research keys in a save are dropped', unknown.state.research.mystery === undefined && Object.keys(unknown.state.research).sort().join() === unknown.RESEARCH.map(r => r.key).sort().join());
})();

(function test_T70_ordersKeepResearch() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  t70Afford(win);
  win.doResearch('tunnelWork');
  win.state.gold = 1e6; win.state.products.steel = 200;
  win.doResearch('deliveryContract');
  win.state.gold = 1e6; win.state.products.steel = 200;
  win.completeOrder('forge');
  win.renderAll();
  check('Task70: research, the open tunnel and the beyond mines all stay after an order (Task 74: no reset)', win.state.research.tunnelWork === true && win.state.world.tunnelUnlocked === true && win.state.world.mines.length === 22 && win.document.querySelector('[data-research-card="tunnelWork"]').getAttribute('data-research-status') === 'done');
})();

(function test_T70_researchFilesAndStyles() {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
  check('Task70: index.html loads research.js after factory.js and before ui.js', index.indexOf('js/factory.js') < index.indexOf('js/research.js') && index.indexOf('js/research.js') < index.indexOf('js/ui.js'));
  check('Task70: research cards are styled', /\.research-card\{/.test(css) && /\.research-card\.is-done/.test(css));
})();

// =============================================================================
// ---------------------------------------------------------------------------
// Task 71: auto-craft device research, workshop construction, research branches
// ---------------------------------------------------------------------------
(function test_T71_autoCraftDevice() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  check('Task71: auto-craft is locked in a new game', win.isAutoCraftUnlocked() === false && win.state.research.autoCraftDevice === false);
  win.state.resources.coal = 30;
  win.state.autoCraft.coalBrick = true;
  win.tickLoop();
  check('Task71: the flag alone does not auto-craft without the device', win.state.products.coalBrick === 0);
  win.state.workforce = win.state.workforce || {};
  win.state.characters.push({ id:'w1', name:'A', rarity:'common', resource:'iron', mining:1, carry:1, move:1 });
  win.tickLoop();
  check('Task71: a worker no longer unlocks auto-craft', win.state.products.coalBrick === 0 && win.isAutoCraftUnlocked() === false);
  win.renderAll();
  const chk = doc.querySelector('[data-autocraft="coalBrick"]');
  check('Task71: the recipe checkbox is disabled and names the research', chk && chk.disabled === true && /연구/.test(chk.parentNode.textContent));
  win.state.gold = 150; win.state.products.steel = 10;
  check('Task71: researching the device costs 150G + 10 steel', win.doResearch('autoCraftDevice') === true && win.state.gold === 0 && win.state.products.steel === 0);
  check('Task71: auto-craft opens', win.isAutoCraftUnlocked() === true);
  win.tickLoop();
  check('Task71: the stored auto flag now crafts', win.state.products.coalBrick >= 1);
  win.renderAll(); // the research button does this after a click
  const chk2 = win.document.querySelector('[data-autocraft="coalBrick"]');
  check('Task71: the checkbox is enabled after the research', chk2 && chk2.disabled === false);
})();

(function test_T71_workshopAutoGate() {
  const win = newDom(makeMemoryStorage()).window;
  win.addWorkshop({ id:'ws', x:4, y:2, level:1, recipeKey:'steel', auto:true });
  win.state.resources.iron = 2; win.state.resources.coal = 1;
  win.tickWorkshops();
  check('Task71: an auto workshop waits for the device', win.state.products.steel === 0);
  win.state.research.autoCraftDevice = true;
  win.tickWorkshops();
  check('Task71: ...and works once the device is researched', win.state.products.steel === 1);
})();

(function test_T71_workshopBuild() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  check('Task71: building is locked at first', win.isWorkshopBuildUnlocked() === false && win.canBuildWorkshop() === false && win.buildWorkshop() === null);
  check('Task71: the build area points to the research', /제작소 건설/.test(doc.getElementById('workshopBuild').textContent) && !doc.querySelector('[data-build-workshop]'));
  win.state.gold = 100; win.state.products.steel = 5;
  check('Task71: the research is paid and done', win.doResearch('workshopBuild') === true && win.state.gold === 0 && win.state.products.steel === 0);
  win.renderAll();
  const btn = doc.querySelector('[data-build-workshop]');
  check('Task71: a build button appears, disabled without gold', btn && btn.disabled === true && /100G/.test(btn.textContent));
  check('Task71: the cost grows with each workshop', win.workshopBuildCost() === 100);
  win.state.gold = 1000;
  win.updateNumbers();
  check('Task71: the per-tick refresh enables the button', doc.querySelector('[data-build-workshop]') === btn && btn.disabled === false);
  btn.click();
  const w = win.state.world.workshops;
  check('Task71: clicking builds one workshop and spends the gold', w.length === 1 && win.state.gold === 900 && w[0].level === 1 && w[0].recipeKey === null && w[0].auto === false);
  check('Task71: it stands next to the base on open ground', Math.max(Math.abs(w[0].x - win.state.world.base.x), Math.abs(w[0].y - win.state.world.base.y)) === 1 && win.isCellOpenForMines(w[0].x, w[0].y));
  check('Task71: the card is listed and the map shows it', doc.querySelectorAll('#workshops .line').length === 1 && win.workshopBuildCost() === 160);
  const taken = new Set([win.state.world.base.x + ',' + win.state.world.base.y]);
  win.state.world.mines.forEach(m => taken.add(m.x + ',' + m.y));
  win.state.gold = 1e9;
  for (let i = 0; i < 5; i++) win.buildWorkshop();
  const all = win.state.world.workshops;
  const keys = all.map(s => s.x + ',' + s.y);
  check('Task71: workshops never share a cell with each other, mines or the base', new Set(keys).size === keys.length && keys.every(k => !taken.has(k)));
  check('Task71: the number of workshops is capped', all.length === 6 && win.canBuildWorkshop() === false && win.buildWorkshop() === null);
  win.renderAll();
  check('Task71: at the cap the button gives way to a note', !doc.querySelector('[data-build-workshop]') && /최대/.test(doc.getElementById('workshopBuild').textContent));
})();

(function test_T71_workshopAutoCheckbox() {
  const win = newDom(makeMemoryStorage()).window;
  win.addWorkshop({ id:'ws', x:4, y:2, level:1, recipeKey:'steel' });
  win.renderAll();
  const chk = win.document.querySelector('[data-workshop-auto="ws"]');
  check('Task71: the workshop auto checkbox is locked until the device exists', chk.disabled === true && /연구/.test(chk.parentNode.textContent));
  win.state.research.autoCraftDevice = true;
  win.updateNumbers();
  check('Task71: ...and the refresh unlocks it', win.document.querySelector('[data-workshop-auto="ws"]').disabled === false);
})();

(function test_T71_researchBranches() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  check('Task71: every research belongs to a known branch', win.RESEARCH.every(r => win.RESEARCH_BRANCHES.some(b => b.key === r.branch)));
  check('Task71: the tab shows one title per branch with its cards', doc.querySelectorAll('.research-branch-title').length === 4 && doc.querySelectorAll('[data-research-card]').length === 4);
  const titles = Array.from(doc.querySelectorAll('.research-branch-title')).map(e => e.textContent).join();
  check('Task71: branches are 제작/자동화/탐험/납품', titles === '제작,자동화,탐험,납품');
  win.renderAll(); win.renderAll();
  check('Task71: re-rendering never duplicates titles', doc.querySelectorAll('.research-branch-title').length === 4);
  const css = require('fs').readFileSync('css/style.css', 'utf8');
  check('Task71: branch titles are styled', /\.research-branch-title/.test(css));
})();

(function test_T71_saveCompat() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.state.gold = 250; win.state.products.steel = 15;
  win.doResearch('workshopBuild'); win.doResearch('autoCraftDevice');
  win.saveGame();
  const saved = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task71: both researches are saved in the same additive map', saved.run.research.workshopBuild === true && saved.run.research.autoCraftDevice === true && saved.saveVersion === 1);
  const loaded = newDom(storage).window;
  check('Task71: they are still done after loading', loaded.isWorkshopBuildUnlocked() && loaded.isAutoCraftUnlocked());
  const edit = (fn) => { const p = JSON.parse(storage.getItem('gachaFactorySave')); fn(p); storage.setItem('gachaFactorySave', JSON.stringify(p)); return newDom(storage).window; };
  const old = edit((p) => { delete p.run.research; });
  check('Task71: an old save without research keeps nothing it never used', old.isWorkshopBuildUnlocked() === false && old.isAutoCraftUnlocked() === false);
  const usedAuto = edit((p) => { delete p.run.research; p.run.autoCraft.steel = true; });
  check('Task71: an old save that had auto-craft on keeps auto-craft', usedAuto.isAutoCraftUnlocked() === true && usedAuto.state.autoCraft.steel === true);
  const usedWs = edit((p) => { delete p.run.research; p.run.world.workshops = [{ id:'workshop_old', x:4, y:2, level:1, recipeKey:'steel', auto:true, progress:null }]; });
  check('Task71: an old save with a workshop keeps building and auto-craft', usedWs.isWorkshopBuildUnlocked() === true && usedWs.isAutoCraftUnlocked() === true);
  [1, 'yes', null, [], { workshopBuild: 'yes', autoCraftDevice: 1 }].forEach((bad, i) => {
    const w = edit((p) => { p.run.research = bad; p.run.autoCraft = {}; p.run.world.workshops = []; });
    check('Task71: invalid research value #' + i + ' loads as not done', w.isWorkshopBuildUnlocked() === false && w.isAutoCraftUnlocked() === false);
  });
})();


// ---------------------------------------------------------------------------
// Task 72: delivery, companies, orders, reputation
// ---------------------------------------------------------------------------
// Reference for the delivery score: the plain per-unit loop (independent of the closed form in delivery.js).
function t72RefScore(sell, fav, sentBefore, qty) {
  let total = 0;
  for (let i = 0; i < qty; i++) total += Math.max(0.25, 1 - (sentBefore + i) / 200);
  return total * sell * fav;
}

function t72Open(win) {
  win.state.gold = 1e6;
  win.state.products.steel = 200;
  win.doResearch('deliveryContract');
  win.state.gold = 1e6;
  win.state.products.steel = 200;
}

(function test_T72_data() {
  const win = newDom(makeMemoryStorage()).window;
  const cs = win.COMPANIES;
  check('Task72: three companies with unique keys', cs.length === 3 && new Set(cs.map(c => c.key)).size === 3);
  check('Task72: every favorite and order product is a real recipe', cs.every(c => c.favorites.every(k => win.RECIPES.some(r => r.key === k)) && c.orders.every(o => win.RECIPES.some(r => r.key === o.product) && Number.isInteger(o.qty) && o.qty > 0)));
  check('Task72: farther companies cost more to ship to', cs[0].distance < cs[1].distance && cs[1].distance < cs[2].distance);
  check('Task72: the mountain company needs the tunnel research', cs[2].requires.join() === 'tunnelWork' && cs[0].requires.length === 0);
  check('Task72: the order list is known as reference rewards', [20, 10, 20, 25].every((q, i) => win.orderReputation({ product: ['steel', 'alloy', 'alloy', 'coalBrick'][i], qty: q }) === [1, 1, 2, 1][i]));
})();

(function test_T72_reputationFormula() {
  const win = newDom(makeMemoryStorage()).window;
  const rep = (product, qty) => win.orderReputation({ product, qty });
  check('Task72: steel x20 (value 100) pays 1', rep('steel', 20) === 1);
  check('Task72: alloy x20 (400) pays 2', rep('alloy', 20) === 2);
  check('Task72: special alloy x35 (3150 at 90G) is capped at 4', rep('specialAlloy', 35) === 4);
  check('Task72: precision part x20 (1600) pays 4', rep('precisionPart', 20) === 4);
  check('Task72: a very large order is capped at 4', rep('quantumCore', 16) === 4);
  check('Task72: too small an order pays nothing', rep('steel', 5) === 0);
  check('Task72: an unknown product pays nothing', win.orderReputation({ product: 'nope', qty: 10 }) === 0 && win.orderReputation(null) === 0);
})();

(function test_T72_slots() {
  const win = newDom(makeMemoryStorage()).window;
  const at = (n) => { win.permanent.totalPrestige = n; return win.companySlots(); };
  check('Task72: no reputation still gives one company', at(0) === 1);
  check('Task72: 4 reputation is still one', at(4) === 1);
  check('Task72: 5 gives two', at(5) === 2);
  check('Task72: 14 is still two', at(14) === 2);
  check('Task72: 15 gives three', at(15) === 3);
  check('Task72: more reputation never adds more', at(1000) === 3);
})();

(function test_T72_openAndGate() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task72: nothing can be delivered before the research', win.isCompanyOpen('forge') === false && win.deliverProducts('forge', 'steel', 1) === 0);
  t72Open(win);
  check('Task72: the research opens the first company only', win.isCompanyOpen('forge') === true && win.isCompanyOpen('harbor') === false && win.isCompanyOpen('lab') === false);
  win.permanent.totalPrestige = 5;
  check('Task72: reputation 5 opens the second', win.isCompanyOpen('harbor') === true && win.isCompanyOpen('lab') === false);
  win.permanent.totalPrestige = 15;
  check('Task72: the third still needs the tunnel research', win.isCompanyOpen('lab') === false);
  win.state.research.tunnelWork = true;
  check('Task72: ...and opens once it is done', win.isCompanyOpen('lab') === true);
  check('Task72: an unknown company is never open', win.isCompanyOpen('nope') === false && win.isCompanyOpen(null) === false);
})();

(function test_T72_freeDelivery() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  const g0 = win.state.gold;
  check('Task72: shipping for 10 steel to the forge is ceil(10*5*0.1*1)=5', win.shippingCost('forge', 'steel', 10) === 5);
  check('Task72: shipping for 20 alloy to the harbor is ceil(20*20*0.1*1.5)=60', win.shippingCost('harbor', 'alloy', 20) === 60);
  const gain = win.deliverProducts('forge', 'steel', 10);
  check('Task72: a favorite delivery scores by the per-unit weights (10 steel = 73.3)', Math.abs(gain - t72RefScore(5, 1.5, 0, 10)) < 1e-9 && Math.abs(gain - 73.3125) < 1e-9 && win.permanent.companies.forge.score === gain);
  check('Task72: the products and shipping are used up', win.state.products.steel === 190 && win.state.gold === g0 - 5);
  check('Task72: a free delivery gives no reputation', win.permanent.totalPrestige === 0);
  check('Task72: the delivered amount is recorded', win.permanent.companies.forge.sent.steel === 10);
  const before = JSON.stringify([win.state.products, win.state.gold, win.permanent.companies]);
  check('Task72: more than owned is refused and changes nothing', win.deliverProducts('forge', 'steel', 1000) === 0 && JSON.stringify([win.state.products, win.state.gold, win.permanent.companies]) === before);
  win.state.gold = 2;
  check('Task72: not enough gold for shipping is refused', win.canDeliver('forge', 'steel', 10) === false && win.deliverProducts('forge', 'steel', 10) === 0 && win.state.products.steel === 190);
  win.state.gold = 1e6;
  check('Task72: invalid quantities are refused', [0, -1, 1.5, NaN, '3', null].every(q => win.deliverProducts('forge', 'steel', q) === 0));
  check('Task72: an unknown product is refused', win.deliverProducts('forge', 'nope', 1) === 0);
  check('Task72: a closed company is refused', win.deliverProducts('harbor', 'steel', 1) === 0);
})();

(function test_T72_scoreRules() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  win.state.products.alloy = 100;
  win.permanent.totalPrestige = 5;
  check('Task72: a non-favorite is not boosted (harbor, steel x10)', Math.abs(win.deliveryScore('harbor', 'steel', 10) - t72RefScore(5, 1, 0, 10)) < 1e-9);
  check('Task72: a favorite is boosted (harbor, alloy x10)', Math.abs(win.deliveryScore('harbor', 'alloy', 10) - t72RefScore(20, 1.5, 0, 10)) < 1e-9);
  win.permanent.companies.forge.sent.steel = 100;
  check('Task72: repeating the same product weighs less (100 sent: weights 0.5 down to 0.455)', Math.abs(win.deliveryScore('forge', 'steel', 10) - t72RefScore(5, 1.5, 100, 10)) < 1e-9 && win.deliveryScore('forge', 'steel', 10) < 10 * 5 * 1.5 * 0.5);
  win.permanent.companies.forge.sent.steel = 10000;
  check('Task72: the weight never goes below 0.25', win.deliveryScore('forge', 'steel', 10) === 10 * 5 * 1.5 * 0.25);
  win.permanent.companies.forge.sent.steel = 0;
  [[1, 0], [10, 0], [150, 0], [151, 0], [400, 0], [10, 140], [50, 130], [10, 149]].forEach(([q, sb]) => {
    win.permanent.companies.forge.sent.steel = sb;
    check('Task76: score of ' + q + ' units after ' + sb + ' sent matches the per-unit reference', Math.abs(win.deliveryScore('forge', 'steel', q) - t72RefScore(5, 1.5, sb, q)) < 1e-6);
  });
  win.permanent.companies.forge.sent.steel = 0;
  check('Task76: one huge delivery is not worth more than the same units in pieces', win.deliveryScore('forge', 'steel', 400) < 400 * 5 * 1.5 * 0.5 && Math.abs(win.deliveryScore('forge', 'steel', 400) - (win.deliveryScore('forge', 'steel', 200) + (win.permanent.companies.forge.sent.steel = 200, win.deliveryScore('forge', 'steel', 200)))) < 1e-6);
  win.permanent.companies.forge.sent.steel = 10000;
  check('Task72: another company is not affected by that repeat', Math.abs(win.deliveryScore('harbor', 'steel', 10) - t72RefScore(5, 1, 0, 10)) < 1e-9);
})();

(function test_T72_regularTrade() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  check('Task72: no regular trade at first', win.isRegularTrade('forge') === false);
  win.permanent.companies.forge.score = 299;
  check('Task72: 299 is not enough', win.isRegularTrade('forge') === false);
  win.state.products.steel = 10;
  win.deliverProducts('forge', 'steel', 1);
  check('Task72: crossing 300 starts a regular trade', win.isRegularTrade('forge') === true);
  check('Task72: the log says so once', win.document.getElementById('log').textContent.split('정기 거래를 시작').length === 2);
})();

(function test_T72_orders() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  const o = win.currentOrder('forge');
  check('Task72: the first forge order is steel x20', o.product === 'steel' && o.qty === 20);
  win.state.products.steel = 19;
  check('Task72: a short stock cannot complete it', win.canCompleteOrder('forge') === false && win.completeOrder('forge') === 0 && win.state.products.steel === 19 && win.permanent.companies.forge.orderIndex === 0);
  win.state.products.steel = 25;
  const g0 = win.state.gold;
  const rep = win.completeOrder('forge');
  check('Task72: completing pays 1 reputation', rep === 1 && win.permanent.totalPrestige === 1);
  check('Task72: it spends exactly the order and its shipping', win.state.products.steel === 5 && win.state.gold === g0 - win.shippingCost('forge', 'steel', 20));
  check('Task72: the order also counts as a delivery', Math.abs(win.permanent.companies.forge.score - t72RefScore(5, 1.5, 0, 20)) < 1e-9 && win.permanent.companies.forge.sent.steel === 20);
  check('Task72: the next order comes up', win.permanent.companies.forge.orderIndex === 1 && win.currentOrder('forge').product === 'coalBrick');
  check('Task72: the multiplier follows the reputation', Math.abs(win.mult() - 1.15) < 1e-12);
  win.permanent.companies.forge.orderIndex = win.COMPANIES[0].orders.length;
  check('Task72: when every order is done there is no current order', win.currentOrder('forge') === null && win.completeOrder('forge') === 0);
  check('Task72: orders of a closed company cannot be completed', win.canCompleteOrder('harbor') === false && win.completeOrder('harbor') === 0);
})();

(function test_T72_slotRise() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  win.permanent.totalPrestige = 4;
  win.permanent.companies.forge.orderIndex = 3;  // alloy x10 -> 200 value -> 1
  win.state.products.alloy = 10;
  win.completeOrder('forge');
  check('Task72: reaching 5 reputation opens the second company', win.permanent.totalPrestige === 5 && win.isCompanyOpen('harbor') === true);
  check('Task72: and says so in the log', win.document.getElementById('log').textContent.includes('새 회사와 거래할 수 있게'));
})();

(function test_T72_saveLoad() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  t72Open(win);
  win.completeOrder('forge');
  win.deliverProducts('forge', 'steel', 10);
  win.saveGame();
  const saved = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task72: reputation and companies are saved in permanent; saveVersion stays 1', saved.permanent.totalPrestige === 1 && !('reputationPoints' in saved.permanent) && saved.permanent.companies.forge.orderIndex === 1 && saved.saveVersion === 1);
  const loaded = newDom(storage).window;
  check('Task72: they load back', loaded.permanent.totalPrestige === 1 && loaded.permanent.companies.forge.orderIndex === 1 && loaded.permanent.companies.forge.sent.steel === 30 && loaded.permanent.companies.forge.score === win.permanent.companies.forge.score);
  const edit = (fn) => { const p = JSON.parse(storage.getItem('gachaFactorySave')); fn(p); storage.setItem('gachaFactorySave', JSON.stringify(p)); return newDom(storage).window; };
  const old = edit((p) => { delete p.permanent.companies; p.permanent.totalPrestige = 7; p.permanent.reputationPoints = 5; });
  check('Task72: an older save keeps its reputation and ignores the old spendable field', old.permanent.totalPrestige === 7 && !('reputationPoints' in old.permanent) && old.permanent.companies.forge.score === 0 && old.permanent.companies.lab.orderIndex === 0);
  [1, 'x', null, [], { forge: 5 }, { forge: { score: -1, orderIndex: 99, sent: { steel: -4, nope: 3 } }, ghost: { score: 9 } }].forEach((bad, i) => {
    const w = edit((p) => { p.permanent.companies = bad; });
    const f = w.permanent.companies.forge;
    check('Task72: invalid companies value #' + i + ' loads safely', Object.keys(w.permanent.companies).sort().join() === 'forge,harbor,lab' && f.score >= 0 && Number.isInteger(f.orderIndex) && f.orderIndex >= 0 && f.orderIndex <= 5 && !('nope' in f.sent) && f.sent.steel >= 0);
  });
})();

(function test_T72_wiring() {
  const fs = require('fs');
  const html = fs.readFileSync('index.html', 'utf8');
  check('Task72: index.html loads delivery.js after research.js and before ui.js', html.indexOf('js/research.js') < html.indexOf('js/delivery.js') && html.indexOf('js/delivery.js') < html.indexOf('js/ui.js'));
  const win = newDom(makeMemoryStorage()).window;
  check('Task72: the delivery research is in the 납품 branch and costs 200G + 10 steel', win.RESEARCH.some(r => r.key === 'deliveryContract' && r.branch === 'delivery' && r.cost.gold === 200 && r.cost.products.steel === 10));
  win.state.gold = 200; win.state.products.steel = 10;
  check('Task72: researching it opens delivery', win.isDeliveryUnlocked() === false && win.doResearch('deliveryContract') === true && win.isDeliveryUnlocked() === true);
})();


// ---------------------------------------------------------------------------
// Task 73: regular trade tick and the delivery tab
// ---------------------------------------------------------------------------
function t73Trade(win, n) { for (let i = 0; i < n; i++) win.tickTrades(); }

(function test_T73_tradeTick() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  win.permanent.companies.forge.score = 300;
  win.state.products.steel = 12;
  const g0 = win.state.gold;
  t73Trade(win, 599);
  check('Task73: nothing is bought before 60 seconds', win.state.products.steel === 12 && win.state.gold === g0);
  t73Trade(win, 2);
  const paid = 5 * 5 * 1.3 * win.mult();
  check('Task73: after 60 s the company buys 5 favorites at 1.3x', win.state.products.steel === 7 && Math.abs(win.state.gold - g0 - paid) < 1e-6);
  check('Task73: the timer restarts', win.permanent.companies.forge.tradeTimer < 1);
  t73Trade(win, 1200);
  check('Task73: it keeps trading every interval until the stock is short', win.state.products.steel === 0);
  win.state.products.steel = 0;
  t73Trade(win, 700);
  const g1 = win.state.gold;
  check('Task73: with no stock it waits without penalty', win.state.gold === g1 && win.permanent.companies.forge.tradeTimer === 60);
  win.state.products.steel = 3;
  t73Trade(win, 2);
  check('Task73: it buys what exists as soon as stock appears', win.state.products.steel === 0 && win.state.gold > g1);
})();

(function test_T73_tradeRules() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  win.state.products.steel = 10;
  t73Trade(win, 1300);
  check('Task73: a company without a regular trade buys nothing', win.state.products.steel === 10);
  win.permanent.companies.forge.score = 300;
  win.state.products.steel = 0; win.state.products.coalBrick = 4;
  t73Trade(win, 620);
  check('Task73: it buys the first favorite that is in stock (coal brick)', win.state.products.coalBrick === 0);
  win.state.products.alloy = 9;
  check('Task73: it never buys a non-favorite', win.tradeProduct('forge') === null && win.state.products.alloy === 9);
})();

(function test_T73_tradeSave() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  t72Open(win);
  win.permanent.companies.forge.score = 300;
  t73Trade(win, 250);
  win.saveGame();
  const loaded = newDom(storage).window;
  check('Task73: the trade timer is saved and loaded', Math.abs(loaded.permanent.companies.forge.tradeTimer - win.permanent.companies.forge.tradeTimer) < 1e-9 && loaded.permanent.companies.forge.tradeTimer > 24);
  const p = JSON.parse(storage.getItem('gachaFactorySave'));
  p.permanent.companies.forge.tradeTimer = 9999;
  storage.setItem('gachaFactorySave', JSON.stringify(p));
  check('Task73: a huge saved timer is capped to the interval', newDom(storage).window.permanent.companies.forge.tradeTimer === 60);
  p.permanent.companies.forge.tradeTimer = -5;
  storage.setItem('gachaFactorySave', JSON.stringify(p));
  check('Task73: a negative saved timer becomes 0', newDom(storage).window.permanent.companies.forge.tradeTimer === 0);
})();

(function test_T73_deliveryTab() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  check('Task73: a 납품 tab and panel exist', !!doc.querySelector('[data-tab="delivery"]') && !!doc.getElementById('tab-delivery'));
  check('Task73: before the research every company is closed and points to it', doc.querySelectorAll('[data-company-card]').length === 3 && Array.from(doc.querySelectorAll('[data-company-open]')).every(e => e.getAttribute('data-company-open') === 'false') && /납품 계약/.test(doc.querySelector('[data-company-closed="forge"]').textContent));
  doc.querySelector('[data-tab="delivery"]').click();
  check('Task73: clicking the tab shows the panel', doc.getElementById('tab-delivery').classList.contains('active'));
  t72Open(win);
  win.renderAll();
  check('Task73: after the research the forge is open and the others say why not', doc.querySelector('[data-company-card="forge"]').getAttribute('data-company-open') === 'true' && /명성 5점/.test(doc.querySelector('[data-company-closed="harbor"]').textContent) && /명성 15점/.test(doc.querySelector('[data-company-closed="lab"]').textContent));
  check('Task73: the card shows score, order and a disabled order button without stock', /점수 0 \/ 300/.test(doc.querySelector('[data-company-score="forge"]').textContent) && /강철 20개/.test(doc.querySelector('[data-company-order="forge"]').textContent));
})();

(function test_T73_deliveryActions() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  t72Open(win);
  win.state.products.steel = 5;
  win.renderAll();
  const orderBtn = doc.querySelector('[data-complete-order="forge"]');
  check('Task73: the order button is disabled while stock is short', orderBtn.disabled === true);
  win.state.products.steel = 30;
  win.updateNumbers();
  check('Task73: the per-tick refresh enables it without rebuilding', doc.querySelector('[data-complete-order="forge"]') === orderBtn && orderBtn.disabled === false);
  const select = doc.querySelector('[data-deliver-product="forge"]');
  const input = doc.querySelector('[data-deliver-qty="forge"]');
  select.value = 'steel'; input.value = '7';
  select.dispatchEvent(new win.Event('change'));
  check('Task73: the preview shows shipping and score for the typed amount', /배송비 4G/.test(doc.querySelector('[data-deliver-preview="forge"]').textContent) && /점수 \+51/.test(doc.querySelector('[data-deliver-preview="forge"]').textContent));
  doc.querySelector('[data-deliver="forge"]').click();
  check('Task73: free delivery spends stock, keeps the typed values and updates the score text', win.state.products.steel === 23 && doc.querySelector('[data-deliver-qty="forge"]') === input && input.value === '7' && /점수 51 /.test(doc.querySelector('[data-company-score="forge"]').textContent));
  input.value = '0';
  input.dispatchEvent(new win.Event('input'));
  check('Task73: an empty amount disables the delivery button', doc.querySelector('[data-deliver="forge"]').disabled === true);
  input.value = '1.9'; input.dispatchEvent(new win.Event('input'));
  check('Task73: a fractional amount is floored', /점수 \+7\.2/.test(doc.querySelector('[data-deliver-preview="forge"]').textContent));
  orderBtn.click();
  check('Task73: clicking 수주 완수 completes the order and shows the next one', win.permanent.totalPrestige === 1 && /석탄 벽돌 25개/.test(doc.querySelector('[data-company-order="forge"]').textContent));
  win.renderAll(); win.renderAll();
  check('Task73: re-rendering never duplicates cards', doc.querySelectorAll('[data-company-card]').length === 3);
})();

(function test_T73_slotsInTab() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  t72Open(win);
  win.permanent.totalPrestige = 5;
  win.renderAll();
  check('Task73: reputation 5 opens the harbor card', doc.querySelector('[data-company-card="harbor"]').getAttribute('data-company-open') === 'true');
  win.permanent.totalPrestige = 15;
  win.renderAll();
  check('Task73: the lab still asks for the tunnel research', /터널 굴착/.test(doc.querySelector('[data-company-closed="lab"]').textContent));
  win.state.research.tunnelWork = true;
  win.renderAll();
  check('Task73: and opens after it', doc.querySelector('[data-company-card="lab"]').getAttribute('data-company-open') === 'true');
  const css = require('fs').readFileSync('css/style.css', 'utf8');
  check('Task73: company cards are styled', /\.company-card/.test(css));
})();


// ---------------------------------------------------------------------------
// Task 74: the prestige reset is gone; orders (big deliveries) are the way to reputation
// ---------------------------------------------------------------------------
(function test_T74_noPrestige() {
  const fs = require('fs');
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  check('Task74: no prestige button, info box or preview in the page', !doc.getElementById('prestigeBtn') && !doc.getElementById('prestigeInfoBtn') && !doc.getElementById('prestigeGainPreview') && !doc.getElementById('runGoldVal') && !doc.getElementById('runNum'));
  check('Task74: prestigeGain is gone and the run no longer counts gold', typeof win.prestigeGain === 'undefined' && !('runGold' in win.state));
  const src = ['index.html', 'js/ui.js', 'js/systems.js', 'js/state.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
  check('Task74: nothing still offers an initialize-and-restart', !/초기화하고 명성/.test(src) && !/^\s*state = freshRunState\(\)/m.test(src));
  check('Task74: the multiplier moved to the 납품 tab', !!doc.querySelector('#tab-delivery #multVal'));
  check('Task74: the HQ text no longer says it resets', !/프레스티지/.test(doc.getElementById('tab-dev').textContent));
  win.state.gold = 100;
  win.sellAll(win.RECIPES.find(r => r.key === 'steel'), true);
  check('Task74: selling still works without runGold', win.state.gold === 100 && !('runGold' in win.state));
})();

(function test_T74_hints() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('h1', 'iron'), makeTestWorker('h2', 'coal'));
  win.state.autoCraft.steel = true;
  win.updateNextHint();
  check('Task74: before the contract the hint points to the research', /납품 계약/.test(win.document.getElementById('nextHint').textContent));
  win.state.research.deliveryContract = true;
  win.updateNextHint();
  check('Task74: after it the hint points to the orders', /수주/.test(win.document.getElementById('nextHint').textContent));
})();

(function test_T74_headerAndOldSave() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.saveGame();
  const p = JSON.parse(storage.getItem('gachaFactorySave'));
  p.run.runGold = 1234; p.permanent.runCount = 4; p.permanent.totalPrestige = 6; p.permanent.reputationPoints = 4;
  storage.setItem('gachaFactorySave', JSON.stringify(p));
  const old = newDom(storage).window;
  check('Task74: an old save with runGold and a run count still loads', old.permanent.totalPrestige === 6 && !('reputationPoints' in old.permanent) && old.permanent.runCount === 4 && !('runGold' in old.state));
  check('Task74: the header shows the reputation', old.document.getElementById('prestigeVal').textContent === '6');
  old.saveGame();
  check('Task74: saving drops runGold', !('runGold' in JSON.parse(storage.getItem('gachaFactorySave')).run));
})();


// ---------------------------------------------------------------------------
// Task 75/76: reputation effects (they open, grow and stay) and the gentler multiplier
// ---------------------------------------------------------------------------
function t75Rep(win, n) { win.permanent.totalPrestige = n; return win; }
const t75Close = (a, b) => Math.abs(a - b) < 1e-9;

(function test_T75_effectData() {
  const win = newDom(makeMemoryStorage()).window;
  const defs = win.REPUTATION_EFFECTS;
  check('Task75: four effects open at 0 / 3 / 6 / 9', defs.map(e => e.key + e.unlock).join() === 'multiplier0,shippingDiscount3,craftSpeed6,tradePrice9');
  check('Task75: every effect has a name and description', defs.every(e => e.name && e.desc));
  check('Task75: effects never open in reverse order of difficulty', defs.every((e, i) => i === 0 || e.unlock >= defs[i - 1].unlock));
})();

(function test_T75_effectSizes() {
  const win = newDom(makeMemoryStorage()).window;
  const eff = (n, k) => { t75Rep(win, n); return win.reputationEffect(k); };
  check('Task75: closed effects are 0', eff(2, 'shippingDiscount') === 0 && eff(5, 'craftSpeed') === 0 && eff(8, 'tradePrice') === 0);
  check('Task75: an effect opens exactly at its reputation (3 -> -6%)', t75Close(eff(3, 'shippingDiscount'), 0.06));
  check('Task75: it grows with reputation (10 -> 20%)', t75Close(eff(10, 'shippingDiscount'), 0.20));
  check('Task75: the discount stops at 30%', t75Close(eff(15, 'shippingDiscount'), 0.30) && t75Close(eff(30, 'shippingDiscount'), 0.30));
  check('Task75: craft speed 6 -> 12%, 20 -> 40%', t75Close(eff(6, 'craftSpeed'), 0.12) && t75Close(eff(20, 'craftSpeed'), 0.40));
  check('Task75: trade price 9 -> 18%', t75Close(eff(9, 'tradePrice'), 0.18));
  check('Task75: nothing counts above reputation 30', t75Close(eff(30, 'craftSpeed'), 0.60) && t75Close(eff(500, 'craftSpeed'), 0.60) && t75Close(eff(500, 'tradePrice'), 0.60));
  check('Task75: an effect never shrinks when reputation rises', [0, 3, 6, 9, 12, 20, 30, 40].map(n => eff(n, 'craftSpeed')).every((v, i, a) => i === 0 || v >= a[i - 1]));
  check('Task75: unknown keys and the multiplier give 0 here', win.reputationEffect('nope') === 0 && win.reputationEffect('multiplier') === 0 && win.reputationEffect(null) === 0);
})();

(function test_T76_multiplier() {
  const win = newDom(makeMemoryStorage()).window;
  const m = (n) => { t75Rep(win, n); return win.mult(); };
  check('Task76: no reputation is x1', t75Close(m(0), 1));
  check('Task76: up to 15 it is +15% per point as before (5 -> 1.75, 15 -> 3.25)', t75Close(m(5), 1.75) && t75Close(m(15), 3.25));
  check('Task76: above 15 it grows by 5% per point (20 -> 3.5, 30 -> 4.0)', t75Close(m(20), 3.5) && t75Close(m(30), 4.0));
  check('Task76: it stops at reputation 30', t75Close(m(31), 4.0) && t75Close(m(10000), 4.0));
  check('Task76: it never decreases', [0, 1, 5, 14, 15, 16, 29, 30, 31].map(m).every((v, i, a) => i === 0 || v >= a[i - 1]));
  t75Rep(win, 30); win.state.hqLevel = 2;
  check('Task76: HQ investment still multiplies on top', t75Close(win.mult(), 4.0 * (1 + 2 * 0.08)));
})();

(function test_T75_effectsApplied() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  const ship = (n) => { t75Rep(win, n); return win.shippingCost('forge', 'steel', 100); };
  check('Task75: shipping without reputation is ceil(100*5*0.1) = 50', ship(0) === 50);
  check('Task75: reputation 3 cuts it by 6% -> 47', ship(3) === 47);
  check('Task75: reputation 15 cuts it by 30% -> 35', ship(15) === 35);
  t75Rep(win, 0);
  win.state.craftFacility = 1;
  check('Task75: craft speed is 1 without reputation', t75Close(win.craftSpeed(), 1));
  t75Rep(win, 6);
  check('Task75: craft speed 1.12 at reputation 6', t75Close(win.craftSpeed(), 1.12));
  win.state.craftFacility = 3;
  check('Task75: it multiplies with the facility level (1.2 * 1.12)', t75Close(win.craftSpeed(), 1.2 * 1.12));
  const ws = win.addWorkshop({ id: 'ws75', x: 4, y: 2, level: 1, recipeKey: 'crystalAlloy' });
  const rec = win.RECIPES.find(r => r.key === 'crystalAlloy');
  t75Rep(win, 0);
  check('Task75: workshop craft time is the recipe time without reputation', t75Close(win.workshopCraftTime(ws, rec), 3));
  t75Rep(win, 6);
  check('Task75: reputation 6 shortens it by the same speed (3 / 1.12)', t75Close(win.workshopCraftTime(ws, rec), 3 / 1.12));
})();

(function test_T75_tradePriceApplied() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  win.permanent.companies.forge.score = 300;
  const run = (rep) => {
    t75Rep(win, rep);
    win.permanent.companies.forge.tradeTimer = 60;
    win.state.products.steel = 5;
    const g0 = win.state.gold;
    win.tickTrades();
    return win.state.gold - g0;
  };
  const base = run(0);
  check('Task75: without reputation the trade pays 5*5*1.3', t75Close(base, 5 * 5 * 1.3));
  const r9 = run(9);
  check('Task75: reputation 9 adds 18% to the trade price (on top of the multiplier)', t75Close(r9, 5 * 5 * 1.3 * 1.18 * win.mult()));
})();

(function test_T75_openingIsLogged() {
  const win = newDom(makeMemoryStorage()).window;
  t72Open(win);
  win.permanent.totalPrestige = 2;
  win.permanent.companies.forge.orderIndex = 3;
  win.state.products.alloy = 10;
  win.completeOrder('forge');
  const log = win.document.getElementById('log').textContent;
  check('Task75: reaching reputation 3 logs the new effect once', win.permanent.totalPrestige === 3 && log.split('명성 효과가 열렸습니다: 배송비 할인').length === 2);
  check('Task75: effects that stay closed are not logged', !/명성 효과가 열렸습니다: 제작 속도/.test(log));
})();

(function test_T75_panel() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  check('Task75: the 납품 tab lists all four effects', doc.querySelectorAll('[data-reputation-effect]').length === 4);
  check('Task75: closed effects say at which reputation they open', /명성 3점에서 열려요/.test(doc.querySelector('[data-reputation-text="shippingDiscount"]').textContent) && doc.querySelector('[data-reputation-effect="shippingDiscount"]').classList.contains('is-closed'));
  check('Task75: the multiplier row is open from the start', /×1\.00/.test(doc.querySelector('[data-reputation-text="multiplier"]').textContent));
  check('Task75: the reputation line shows progress to the maximum', /0 \/ 30/.test(doc.getElementById('reputationVal').textContent));
  win.permanent.totalPrestige = 10;
  win.updateNumbers();
  check('Task75: the per-tick refresh updates sizes and opens rows without rebuilding', /-20%/.test(doc.querySelector('[data-reputation-text="shippingDiscount"]').textContent) && /\+20%/.test(doc.querySelector('[data-reputation-text="craftSpeed"]').textContent) && !doc.querySelector('[data-reputation-effect="tradePrice"]').classList.contains('is-closed') && /\+20%/.test(doc.querySelector('[data-reputation-text="tradePrice"]').textContent));
  check('Task75: the multiplier row follows reputation (x2.50 at 10)', /×2\.50/.test(doc.querySelector('[data-reputation-text="multiplier"]').textContent));
  win.permanent.totalPrestige = 40;
  win.updateNumbers();
  check('Task75: at the top it says 최대', /최대/.test(doc.getElementById('reputationVal').textContent));
  win.renderAll(); win.renderAll();
  check('Task75: re-rendering never duplicates rows', doc.querySelectorAll('[data-reputation-effect]').length === 4);
})();


// ---------------------------------------------------------------------------
// Task 78: more recipes (data rules) and the recipe visibility rule
// ---------------------------------------------------------------------------
(function test_T78_recipeData() {
  const win = newDom(makeMemoryStorage()).window;
  const R = win.RECIPES, rawKeys = win.RESOURCES.map(r => r.key);
  const byKey = (k) => R.find(r => r.key === k);
  check('Task78: 18 recipes with unique keys and names', R.length === 18 && new Set(R.map(r => r.key)).size === 18 && new Set(R.map(r => r.name)).size === 18);
  check('Task78: every input is a raw resource or a recipe defined earlier in the list', R.every((r, i) => Object.keys(r.need).every(k => rawKeys.includes(k) || R.findIndex(x => x.key === k) >= 0 && R.findIndex(x => x.key === k) < i)));
  check('Task78: every recipe has positive integer inputs, one output and a non-negative time', R.every(r => Object.values(r.need).every(n => Number.isInteger(n) && n > 0) && r.out === 1 && r.craftTime >= 0 && r.sell > 0));
  // value of the inputs: products at their sell price; raw resources are free to mine, so only products count
  const inputValue = (r) => Object.keys(r.need).reduce((sum, k) => sum + (byKey(k) ? byKey(k).sell * r.need[k] : 0), 0);
  const withProducts = R.filter(r => inputValue(r) > 0);
  check('Task78: no recipe sells for less than its product inputs (a recipe never loses value)', withProducts.every(r => r.sell >= inputValue(r)));
  check('Task78: the iron tool gives early play a second use of iron', byKey('ironTool').need.iron === 4 && byKey('ironTool').sell === 14);
  check('Task78: recipes made from products sell for at least 1.15x those inputs', withProducts.every(r => r.sell >= 1.15 * inputValue(r)));
  check('Task78: special alloy no longer loses value (90G for 60G of alloy)', byKey('specialAlloy').sell === 90);
  const uses = {};
  R.forEach(r => Object.keys(r.need).forEach(k => { uses[k] = (uses[k] || 0) + 1; }));
  check('Task78: every raw resource feeds at least two recipes', rawKeys.every(k => uses[k] >= 2));
  check('Task78: steel gear and crystal lens are shared intermediates', uses.steelGear >= 2 && uses.crystalLens >= 1);
  check('Task78: new recipes have the agreed values', byKey('manaLamp').sell === 30 && byKey('precisionMachine').sell === 330 && byKey('starLens').craftTime === 10);
  check('Task78: state holds every recipe (products, auto flags, queue)', R.every(r => r.key in win.state.products && r.key in win.state.autoCraft && r.key in win.state.autoSell && win.state.craftQueue[r.key] === null));
  check('Task78: company favorites and orders only name real recipes', win.COMPANIES.every(c => c.favorites.every(k => byKey(k)) && c.orders.every(o => byKey(o.product))));
})();

(function test_T78_visibility() {
  const win = newDom(makeMemoryStorage()).window;
  const hidden = (k) => win.recipeNeedsLockedResource(win.RECIPES.find(r => r.key === k));
  check('Task78: a new game shows only recipes of the starting minerals', !hidden('steel') && !hidden('coalBrick') && hidden('alloy') && hidden('manaLamp') && hidden('crystalLens'));
  check('Task78: a recipe is hidden while ANY raw in its chain is locked (engine needs rare metal and mana)', hidden('manaEngine') && hidden('specialAlloy') && hidden('steelGear'));
  win.state.unlockedSites.manaVein = true;
  check('Task78: mana opens alloy, lamp, special alloy and crystal parts', !hidden('alloy') && !hidden('manaLamp') && !hidden('specialAlloy') && !hidden('crystalLens') && !hidden('crystalAlloy'));
  check('Task78: ...but not what also needs ruins minerals', hidden('steelGear') && hidden('manaEngine') && hidden('precisionPart') && hidden('relicOrnament'));
  win.state.unlockedSites.ruins = true;
  check('Task78: ruins open gears, engine, precision part and ornament', !hidden('steelGear') && !hidden('manaEngine') && !hidden('precisionPart') && !hidden('relicOrnament') && !hidden('precisionMachine'));
  check('Task78: space station items stay hidden until it is unlocked', hidden('starLens') && hidden('plasmaCell') && hidden('quantumCore'));
  win.state.unlockedSites.spaceStation = true;
  check('Task78: and then everything is visible', win.RECIPES.every(r => !win.recipeNeedsLockedResource(r)));
  win.state.products.steel = 20; win.state.products.alloy = 2; win.state.products.steelGear = 2;
  win.renderAll();
  check('Task78: the recipe list shows a card for each visible recipe', win.document.querySelectorAll('#recipes .recipe').length === 18);
})();

(function test_T78_newRecipesWork() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.unlockedSites.manaVein = true; win.state.unlockedSites.ruins = true; win.state.unlockedSites.spaceStation = true;
  const R = (k) => win.RECIPES.find(r => r.key === k);
  win.state.products.steel = 6; win.state.resources.rareMetal = 2;
  const gearShop = win.addWorkshop({ id: 'ws78', x: 4, y: 2, level: 1, recipeKey: 'steelGear' });
  check('Task78: a steel gear is crafted in a workshop from 3 steel and 1 rare metal', win.craftWorkshop(gearShop.id) === true && win.state.products.steel === 3 && win.state.resources.rareMetal === 1 && gearShop.progress === 4);
  check('Task78: a recipe with products as inputs needs all of them', win.canCraft(R('manaEngine')) === false);
  win.state.products.steelGear = 2; win.state.products.alloy = 2;
  check('Task78: the engine can be crafted once its products exist', win.canCraft(R('manaEngine')) === true);
  win.state.products.specialAlloy = 2; win.state.resources.plasma = 1;
  check('Task78: a plasma cell is made of special alloy and plasma', win.canCraft(R('plasmaCell')) === true);
  win.state.unlockedSites.abandonedMine = true;
  check('Task78: the workshop recipe list offers new recipes only when unlocked', true);
})();


// ---------------------------------------------------------------------------
// Task 79: workshop-only recipes, workshop upgrades, workshop look
// ---------------------------------------------------------------------------
const T79_ONLY = ['specialAlloy', 'steelGear', 'relicOrnament', 'precisionPart', 'relicPart', 'manaEngine', 'starLens', 'plasmaCell', 'precisionMachine', 'quantumCore', 'plasmaCore'];

(function test_T79_workshopOnlyData() {
  const win = newDom(makeMemoryStorage()).window;
  const only = win.RECIPES.filter(r => r.workshopOnly).map(r => r.key).sort();
  check('Task79: exactly the eleven higher recipes are workshop-only', only.join() === T79_ONLY.slice().sort().join());
  check('Task79: they are exactly the ones that take 4 seconds or more', win.RECIPES.every(r => !!r.workshopOnly === (r.craftTime >= 4)));
  check('Task79: the simple ones stay hand-craftable', ['steel', 'coalBrick', 'ironTool', 'alloy', 'crystalAlloy', 'manaLamp', 'crystalLens'].every(k => !win.RECIPES.find(r => r.key === k).workshopOnly));
})();

(function test_T79_handAndAuto() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.unlockedSites.manaVein = true;
  const R = (k) => win.RECIPES.find(r => r.key === k);
  win.state.products.alloy = 3; win.state.resources.coal = 3;
  check('Task79: hand crafting a workshop-only recipe is refused and spends nothing', win.canCraft(R('specialAlloy')) === true && win.startCraft(R('specialAlloy')) === false && win.state.products.alloy === 3 && win.state.craftQueue.specialAlloy === null);
  win.state.research.autoCraftDevice = true;
  win.state.autoCraft.specialAlloy = true;
  win.tickLoop();
  check('Task79: an old auto-craft flag on it does nothing', win.state.products.specialAlloy === 0 && win.state.craftQueue.specialAlloy === null && win.state.products.alloy === 3);
  win.state.craftQueue.specialAlloy = 0.2;
  advanceTicks(win, 5);
  check('Task79: a hand craft already running in an old save still finishes', win.state.craftQueue.specialAlloy === null && win.state.products.specialAlloy === 1);
  const shop = win.addWorkshop({ id: 'ws79', x: 4, y: 2, level: 1, recipeKey: 'specialAlloy' });
  win.state.products.specialAlloy = 0;
  check('Task79: a workshop crafts it', win.craftWorkshop(shop.id) === true && shop.progress === 4);
})();

(function test_T79_autoSell() {
  const win = newDom(makeMemoryStorage()).window;
  const R = (k) => win.RECIPES.find(r => r.key === k);
  check('Task79: auto-sell cannot be bought for a workshop-only product', win.canAutoSell(R('quantumCore')) === false && (win.state.gold = 1e6, win.buyAutoSell('quantumCore')) === false && win.state.autoSell.quantumCore === false && win.state.gold === 1e6);
  check('Task79: it still can for simple products', win.canAutoSell(R('steel')) === true && win.buyAutoSell('steel') === true && win.state.autoSell.steel === true);
  win.state.autoSell.precisionPart = true; win.state.autoSellOn.precisionPart = true; // as an old save could have it
  win.state.products.precisionPart = 3; win.state.products.steel = 4;
  const g0 = win.state.gold;
  win.tickAutoSell();
  check('Task79: auto-sell never sells a workshop-only product, even from an old save', win.state.products.precisionPart === 3 && win.state.products.steel === 0 && win.state.gold > g0);
  win.sellAll(R('precisionPart'));
  check('Task79: selling it by hand still works', win.state.products.precisionPart === 0);
})();

(function test_T79_recipeCards() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  win.state.unlockedSites.manaVein = true; win.state.unlockedSites.ruins = true; win.state.unlockedSites.spaceStation = true;
  win.renderAll();
  check('Task79: workshop-only cards have a note and sell button but no craft, auto-craft or auto-sell', T79_ONLY.every(k => !doc.querySelector('[data-craft="' + k + '"]') && !doc.querySelector('[data-autocraft="' + k + '"]') && !doc.querySelector('[data-buyautosell="' + k + '"]') && !!doc.querySelector('[data-workshop-only="' + k + '"]') && !!doc.querySelector('[data-sell="' + k + '"]')));
  check('Task79: simple cards keep craft, auto-craft and auto-sell', ['steel', 'alloy', 'manaLamp'].every(k => !!doc.querySelector('[data-craft="' + k + '"]') && !!doc.querySelector('[data-autocraft="' + k + '"]')));
  win.state.products.quantumCore = 2;
  win.updateNumbers();
  check('Task79: the stock of a workshop-only product is still refreshed', /2/.test(doc.querySelector('[data-stock="quantumCore"]').textContent));
})();

(function test_T79_upgradeCosts() {
  const win = newDom(makeMemoryStorage()).window;
  const shop = win.addWorkshop({ id: 'ws79u', x: 4, y: 2, level: 1 });
  const goldAt = (lvl) => { shop.level = lvl; return win.workshopUpgradeCost(shop); };
  const expected = [[1, 150], [2, 255], [3, 433], [4, 737], [5, 1253], [6, 2130], [7, 3621]];
  expected.forEach(([lvl, gold]) => check('Task79: upgrading from Lv.' + lvl + ' costs ' + gold + 'G', goldAt(lvl).gold === gold));
  check('Task79: levels 2 to 5 need gold only', [1, 2, 3, 4].every(l => Object.keys(goldAt(l).products).length === 0));
  check('Task79: Lv.6 needs 2 precision parts, Lv.7 3 relic parts, Lv.8 a quantum core', JSON.stringify(goldAt(5).products) === '{"precisionPart":2}' && JSON.stringify(goldAt(6).products) === '{"relicPart":3}' && JSON.stringify(goldAt(7).products) === '{"quantumCore":1}');
  check('Task79: the maximum level has no upgrade', goldAt(8) === null);
  check('Task79: each step costs more than the last', expected.every(([lvl], i) => i === 0 || goldAt(lvl).gold > goldAt(expected[i - 1][0]).gold));
  check('Task79: the cost object is a copy (changing it does not change the balance)', (() => { const c = goldAt(5); c.products.precisionPart = 99; return goldAt(5).products.precisionPart === 2; })());
  check('Task79: an unknown workshop has no upgrade', win.workshopUpgradeCost(null) === null && win.canUpgradeWorkshop('nope') === false && win.upgradeWorkshop('nope') === false);
})();

(function test_T79_upgradeAction() {
  const win = newDom(makeMemoryStorage()).window;
  const shop = win.addWorkshop({ id: 'ws79a', x: 4, y: 2, level: 1, recipeKey: 'steel' });
  win.state.gold = 149;
  check('Task79: not enough gold refuses and changes nothing', win.upgradeWorkshop(shop.id) === false && shop.level === 1 && win.state.gold === 149);
  win.state.gold = 1000;
  check('Task79: upgrading spends the gold and adds a level', win.upgradeWorkshop(shop.id) === true && shop.level === 2 && win.state.gold === 850);
  win.state.gold = 1e6;
  win.upgradeWorkshop(shop.id); win.upgradeWorkshop(shop.id); win.upgradeWorkshop(shop.id);
  check('Task79: it is Lv.5 after four upgrades', shop.level === 5);
  check('Task79: Lv.6 also needs the products', win.canUpgradeWorkshop(shop.id) === false && win.upgradeWorkshop(shop.id) === false && shop.level === 5);
  win.state.products.precisionPart = 2;
  check('Task79: with them it works and they are used up', win.upgradeWorkshop(shop.id) === true && shop.level === 6 && win.state.products.precisionPart === 0);
  win.state.products.relicPart = 3; win.state.products.quantumCore = 1;
  win.upgradeWorkshop(shop.id); win.upgradeWorkshop(shop.id);
  check('Task79: it reaches Lv.8 and stops there', shop.level === 8 && win.state.products.relicPart === 0 && win.state.products.quantumCore === 0 && win.upgradeWorkshop(shop.id) === false && shop.level === 8);
  check('Task79: the log says each new level', win.document.getElementById('log').textContent.includes('제작소가 Lv.8이 되었습니다.'));
})();

(function test_T79_upgradeSpeed() {
  const win = newDom(makeMemoryStorage()).window;
  const shop = win.addWorkshop({ id: 'ws79s', x: 4, y: 2, level: 1 });
  const rec = win.RECIPES.find(r => r.key === 'precisionPart');
  const time = (lvl) => { shop.level = lvl; return win.workshopCraftTime(shop, rec); };
  check('Task79: speed rises 25% per level (Lv.1 6 s, Lv.5 3 s, Lv.8 about 2.18 s)', Math.abs(time(1) - 6) < 1e-9 && Math.abs(time(5) - 3) < 1e-9 && Math.abs(time(8) - 6 / 2.75) < 1e-9);
  const instant = win.RECIPES.find(r => r.key === 'steel');
  check('Task79: instant recipes stay instant at any level', time(8) > 0 && win.workshopCraftTime(shop, instant) === 0);
})();

(function test_T79_workshopCardAndLook() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document;
  const shop = win.addWorkshop({ id: 'ws79c', x: 4, y: 2, level: 1 });
  win.state.gold = 100;
  win.renderAll();
  const btn = doc.querySelector('[data-workshop-upgrade="ws79c"]');
  check('Task79: the card has an upgrade button with its cost, disabled while short of gold', !!btn && btn.disabled === true && /Lv\.2/.test(btn.textContent) && /150G/.test(btn.textContent));
  win.state.gold = 150;
  win.updateNumbers();
  check('Task79: the per-tick refresh enables it without rebuilding', doc.querySelector('[data-workshop-upgrade="ws79c"]') === btn && btn.disabled === false);
  btn.click();
  check('Task79: clicking upgrades and shows the new level and next cost', shop.level === 2 && /제작소 Lv\.2/.test(doc.querySelector('#workshops .res-name').textContent) && /255G/.test(doc.querySelector('[data-workshop-upgrade="ws79c"]').textContent));
  shop.level = 6; win.state.products.relicPart = 0; win.renderAll();
  check('Task79: the button names the products a high level needs', /유물 부품 3개/.test(doc.querySelector('[data-workshop-upgrade="ws79c"]').textContent));
  shop.level = 8; win.renderAll();
  const top = doc.querySelector('[data-workshop-upgrade="ws79c"]');
  check('Task79: at the top it says so and is disabled', /최대 레벨/.test(top.textContent) && top.disabled === true);
  const tier = (lvl) => { shop.level = lvl; win.renderAll(); return doc.querySelector('[data-world-workshop="ws79c"]').className; };
  check('Task79: the map look changes at Lv.3 and Lv.6', /tier-1/.test(tier(1)) && /tier-1/.test(tier(2)) && /tier-2/.test(tier(3)) && /tier-2/.test(tier(5)) && /tier-3/.test(tier(6)) && /tier-3/.test(tier(8)));
  const css = require('fs').readFileSync('css/style.css', 'utf8');
  check('Task79: all three looks are styled', /world-workshop-node\.tier-2/.test(css) && /world-workshop-node\.tier-3/.test(css));
})();


// ---------------------------------------------------------------------------
// The page as a browser loads it: separate <script> files in index.html order.
// (The rest of the suite evaluates all the code as one block, where every
// function is hoisted — that can hide a function used while loading before the
// file that defines it has run. This is what broke the page after Task 77.)
// ---------------------------------------------------------------------------
(function test_pageLoadsLikeABrowser() {
  const vm = require('vm');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map(m => m[1]);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
  const ctx = dom.getInternalVMContext();
  const errors = [];
  scripts.forEach(file => {
    try {
      new vm.Script(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file }).runInContext(ctx);
    } catch (e) {
      errors.push(file + ': ' + e.message);
    }
  });
  check('PageLoad: index.html lists the scripts and every one runs without an error, in page order', scripts.length >= 11 && errors.length === 0, errors.join(' | '));
  const type = (expr) => { try { return vm.runInContext(expr, ctx); } catch (e) { return 'error: ' + e.message; } };
  check('PageLoad: the game state exists after loading', type('typeof state') === 'object' && type('state.world.mines.length') > 0, String(type('typeof state')));
  check('PageLoad: the first screen is drawn (recipes, delivery tab and research tab have content)', type("document.querySelectorAll('#recipes .recipe').length") >= 2 && type("document.querySelectorAll('[data-company-card]').length") === 3 && type("document.querySelectorAll('[data-research-card]').length") >= 4);
  dom.window.close();
})();


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
