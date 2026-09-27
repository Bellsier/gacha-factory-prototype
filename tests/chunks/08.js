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
  check('Task56: player starts at the base origin', player.x === 0 && player.y === 0);
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
  win.state.world.player.y = -8;
  const clamped = win.clampPlayerPosition(win.state.world.player.x, win.state.world.player.y);
  win.state.world.player.x = clamped.x;
  win.state.world.player.y = clamped.y;
  check('Task56: x is clamped to the world max', clamped.x === 10);
  check('Task56: y is clamped to the world min', clamped.y === 0);
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
  const ironPos = win.worldToStagePercent(2, 0);
  const coalPos = win.worldToStagePercent(0, 2);
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
  const clampedMin = win.clampPlayerPosition(-5, -5);
  check('Task57: world bounds unchanged', clampedMax.x === 10 && clampedMax.y === 10 && clampedMin.x === 0 && clampedMin.y === 0);
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
  const manaPos = win.worldToStagePercent(4, 0);
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
