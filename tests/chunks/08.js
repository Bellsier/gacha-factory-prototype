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
  const ironPos = win.worldToStagePercent(4, 0); // Task 62: start mines at base+(2,0) / base+(0,2)
  const coalPos = win.worldToStagePercent(2, 2);
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
  check('Task62: starting mines keep their layout around the base', w.mines.some(m => m.id === 'mine_start_iron' && m.x === 4 && m.y === 0) && w.mines.some(m => m.id === 'mine_start_coal' && m.x === 2 && m.y === 2));
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
  check('Task62: walking west from the base reaches negative x', Math.abs(p.x - (-4)) < 1e-9 && p.facing === 'left');
  hold('up', 20);
  check('Task62: walking north reaches negative y', Math.abs(p.y - (-6)) < 1e-9 && p.facing === 'up');
  hold('left', 100);
  hold('up', 100);
  check('Task62: west/north edges clamp at -10', p.x === -10 && p.y === -10);
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
  const world = win.sanitizeWorldState({ base: { x: -3, y: 4, level: 2 }, mines: [{ id: 'mine_n', x: -7, y: -9, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'secured' }], workshops: [], player: { x: -8.5, y: -9.5, facing: 'left' } });
  check('Task62: sanitize keeps negative base coords', world.base.x === -3 && world.base.y === 4);
  check('Task62: sanitize keeps negative mine coords', world.mines[0].x === -7 && world.mines[0].y === -9);
  check('Task62: sanitize keeps negative player coords', world.player.x === -8.5 && world.player.y === -9.5);
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
