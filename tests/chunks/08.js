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
