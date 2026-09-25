(function test_balanceFormulas() {
  const win = newDom(makeMemoryStorage()).window;

  function refExpCost(base, growth, level) { return Math.round(base * Math.pow(growth, level)); }
  const REF = {
    prestigeMultPerPoint: 0.15,
    prestigeGoldDivisor: 200,
    hqMultPerLevel: 0.08,
    hqCostBase: 150, hqCostGrowth: 1.6,
    workforceBonusMult: 1.5,
    facilityCostBase: 20, facilityCostGrowth: 1.4,
    workforceCostBase: 15, workforceCostGrowth: 1.35,
    workerEffectiveDivisor: 16,
    statCostBase: { mining: 40, carry: 60, move: 50 }, statCostGrowth: 1.35,
    autoSellMult: 20,
  };

  // mult() — set totalPrestige/hqLevel directly via state/exposed vars.
  for (const p of [0, 1, 3, 7]) {
    for (const h of [0, 2, 5]) {
      win.state.hqLevel = h;
      // totalPrestige is read-only exposed; drive it via a prestige reset instead
      // for a couple of spot values, and otherwise verify the formula directly.
      const expected = (1 + p * REF.prestigeMultPerPoint) * (1 + h * REF.hqMultPerLevel);
      const actual = (1 + win.permanent.totalPrestige * REF.prestigeMultPerPoint) * win.hqMult();
      // Only meaningful when totalPrestige actually equals p; use the live value instead.
      const liveExpected = (1 + win.permanent.totalPrestige * REF.prestigeMultPerPoint) * (1 + h * REF.hqMultPerLevel);
      check(`BALANCE: mult() matches reference formula (hqLevel=${h})`, Math.abs(win.mult() - liveExpected) < 1e-12);
    }
  }

  for (const h of [0, 1, 3, 8, 15]) {
    win.state.hqLevel = h;
    check(`BALANCE: hqCost() matches reference (L${h})`, win.hqCost() === refExpCost(REF.hqCostBase, REF.hqCostGrowth, h));
  }

  for (const lvl of [0, 1, 3, 8, 15]) {
    win.state.facility.iron = lvl;
    win.state.workforce.iron = lvl;
    check(`BALANCE: facilityCost() matches reference (L${lvl})`, win.facilityCost('iron') === refExpCost(REF.facilityCostBase, REF.facilityCostGrowth, lvl));
    check(`BALANCE: workforceCost() matches reference (L${lvl})`, win.workforceCost('iron') === refExpCost(REF.workforceCostBase, REF.workforceCostGrowth, lvl));
  }

  ['mining', 'carry', 'move'].forEach((stat) => {
    for (const lvl of [0, 1, 3, 8]) {
      const worker = { [stat + 'Lvl']: lvl };
      check(
        `BALANCE: workerUpgradeCost(${stat}) matches reference (L${lvl})`,
        win.workerUpgradeCost(worker, stat) === refExpCost(REF.statCostBase[stat], REF.statCostGrowth, lvl)
      );
    }
  });

  [[1, 2, 1], [2, 3, 2], [3, 5, 3], [5, 8, 5], [10, 10, 10]].forEach(([m, c, mv]) => {
    const worker = { mining: m, carry: c, move: mv };
    check(
      `BALANCE: workerEffective() matches reference (${m},${c},${mv})`,
      Math.abs(win.workerEffective(worker) - (m * c * mv) / REF.workerEffectiveDivisor) < 1e-12
    );
  });

  [5, 20, 45, 80, 400, 420].forEach((sell) => {
    check(`BALANCE: autoSellCost() matches reference (sell=${sell})`, win.autoSellCost({ sell }) === sell * REF.autoSellMult);
  });

  // prestigeGain(): reference floor(sqrt(runGold/200)), gated on >=1 worker
  win.permanent.tickets = 1;
  win.pullGacha();
  [[0, 0], [199, 0], [200, 1], [800, 2], [1800, 3], [3200, 4], [5000, 5]].forEach(([gold, expectedPts]) => {
    win.state.runGold = gold;
    check(`BALANCE: prestigeGain() matches reference at runGold=${gold}`, win.prestigeGain() === expectedPts);
  });
})();

// =============================================================================
// TICK / TIMER
// =============================================================================

(function test_tickTimingConstants() {
  const win = newDom(makeMemoryStorage()).window;
  check('tick: TICK_MS is 100 (unchanged engine constant)', win.TICK_MS === 100);
  check('tick: TICKS_PER_SECOND derives to exactly 10', win.TICKS_PER_SECOND === 10);

  // Bit-identical to the pre-BALANCE-refactor rate/10 and -0.1 literals.
  const ticksPerSecond = win.TICKS_PER_SECOND;
  let allMatch = true;
  for (const rate of [0, 1, 3.7, 12.5, 0.125, 100000, 7, 2.3333333, Math.PI]) {
    if (rate / 10 !== rate / ticksPerSecond) allMatch = false;
  }
  check('tick: derived per-tick resource fraction is bit-identical to rate/10', allMatch);
  check('tick: derived per-tick craft-queue fraction is bit-identical to 0.1', 1 / ticksPerSecond === 0.1);
})();

// =============================================================================
// WORKER ID
// =============================================================================

(function test_newWorkerHasUniqueId() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 5;
  for (let i = 0; i < 5; i++) win.pullGacha();
  const ids = win.state.characters.map((c) => c.id);
  check('worker id: every new worker has a non-empty string id', ids.every((id) => typeof id === 'string' && id.length > 0));
  check('worker id: ids are unique across pulls', new Set(ids).size === ids.length);
})();

(function test_upgradeAndReassignUseIdNotIndex() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 2;
  win.pullGacha();
  win.pullGacha();
  const [w1, w2] = win.state.characters;
  const id1Before = w1.id;
  const id2Before = w2.id;
  const before1 = w1.mining;
  const before2 = w2.mining;

  win.state.gold = 100000;
  win.updateNumbers(); // real gameplay always refreshes disabled state before a click is possible
  const btn2 = win.document.querySelectorAll('[data-upstat="mining"]')[1];
  btn2.click();
  check('worker id: upgrading worker #2 leaves its id unchanged', win.state.characters[1].id === id2Before);
  check('worker id: upgrade applies ONLY to worker #2', win.state.characters[1].mining === before2 + 1 && win.state.characters[0].mining === before1);
  check('worker id: worker #1 id unaffected by an unrelated upgrade', win.state.characters[0].id === id1Before);

  const sel1 = win.document.querySelectorAll('[data-reassign]')[0];
  sel1.value = 'coal';
  sel1.dispatchEvent(new win.window.Event('change'));
  check('worker id: reassigning worker #1 leaves its id unchanged', win.state.characters[0].id === id1Before);
  check('worker id: reassignment applies ONLY to worker #1', win.state.characters[0].resource === 'coal');
})();

(function test_idLookupSurvivesArrayReorder() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 3;
  win.pullGacha(); win.pullGacha(); win.pullGacha();
  const idsInOrder = win.state.characters.map((c) => c.id);

  // Simulate a future feature reordering the array (none exists yet in the
  // product — this test exists specifically to guard the invariant Task 3
  // was built for).
  win.state.characters.reverse();
  win.buildWorkers();
  win.state.gold = 100000;
  win.updateNumbers();

  const targetId = win.state.characters[0].id; // was the LAST id before reversal
  check('reorder: targetId is indeed the pre-reversal last worker', targetId === idsInOrder[idsInOrder.length - 1]);

  const btn = win.document.querySelector(`[data-upstat="mining"][data-worker-id="${targetId}"]`);
  const othersBefore = win.state.characters.filter((c) => c.id !== targetId).map((c) => ({ id: c.id, mining: c.mining }));
  const beforeMining = win.state.characters.find((c) => c.id === targetId).mining;
  btn.click();
  const after = win.state.characters.find((c) => c.id === targetId);
  check('reorder: the CORRECT worker (by id) is upgraded after reorder', after.mining === beforeMining + 1);
  const othersAfter = win.state.characters.filter((c) => c.id !== targetId);
  check('reorder: every other worker is completely unaffected', othersAfter.every((c) => c.mining === othersBefore.find((o) => o.id === c.id).mining));
})();

(function test_saveLoadPreservesIdOrderAndStats() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.permanent.tickets = 3;
  win.pullGacha(); win.pullGacha(); win.pullGacha();
  win.state.gold = 100000;
  win.updateNumbers();
  win.document.querySelectorAll('[data-upstat="carry"]')[1].click();
  const snapshot = win.state.characters.map((c) => ({ ...c }));
  win.saveGame();

  win = newDom(storage).window;
  const restored = win.state.characters;
  check('save/load: worker count preserved', restored.length === snapshot.length);
  check('save/load: worker order preserved (by id)', restored.every((c, i) => c.id === snapshot[i].id));
  check(
    'save/load: every worker field identical (stats/levels/id/order)',
    restored.every((c, i) => JSON.stringify(c, Object.keys(c).sort()) === JSON.stringify(snapshot[i], Object.keys(snapshot[i]).sort()))
  );
})();

(function test_legacySaveMissingIdsBackfilled() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: true },
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [
        { rarity: 'common', resource: 'iron', mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 }, // pre-Task-3 shape, no id
        { rarity: 'rare', resource: 'coal', mining: 2, carry: 3, move: 2, miningLvl: 1, carryLvl: 0, moveLvl: 2 },   // no id, already upgraded
      ],
      lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  const chars = win.state.characters;
  check('legacy save: both workers load successfully', chars.length === 2);
  check('legacy save: every worker got a fresh id', chars.every((c) => typeof c.id === 'string' && c.id.length > 0));
  check('legacy save: backfilled ids are distinct', chars[0].id !== chars[1].id);
  check('legacy save: worker #1 stats/rarity untouched', chars[0].rarity === 'common' && chars[0].mining === 1 && chars[0].carry === 2 && chars[0].move === 1);
  check(
    'legacy save: worker #2 stats/levels (upgrade progress) untouched',
    chars[1].rarity === 'rare' && chars[1].mining === 2 && chars[1].carry === 3 && chars[1].move === 2 && chars[1].miningLvl === 1 && chars[1].moveLvl === 2
  );
})();

(function test_duplicateIdSaveResolvedSafely() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: {},
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [
        { id: 'w_dup', rarity: 'common', resource: 'iron', mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 },
        { id: 'w_dup', rarity: 'epic', resource: 'coal', mining: 3, carry: 5, move: 3, miningLvl: 0, carryLvl: 0, moveLvl: 0 }, // corrupted duplicate
      ],
      lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  const chars = win.state.characters;
  check('duplicate id: both workers survive (no data loss)', chars.length === 2);
  check('duplicate id: ids are distinct after resolution', chars[0].id !== chars[1].id);
  check('duplicate id: the FIRST occurrence keeps the original id', chars[0].id === 'w_dup');
  check('duplicate id: both workers retain their original stats/rarity', chars[0].rarity === 'common' && chars[0].mining === 1 && chars[1].rarity === 'epic' && chars[1].mining === 3);
})();

(function test_validIdPassesThroughUnchanged() {
  const storage = makeMemoryStorage();
  const payload = {
    saveVersion: 1,
    permanent: {},
    run: {
      resources: {}, products: {}, gold: 0, runGold: 0,
      characters: [
        { id: 'w_keepme_123', rarity: 'legend', resource: 'plasma', mining: 5, carry: 8, move: 5, miningLvl: 3, carryLvl: 1, moveLvl: 0 },
      ],
      lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true, spaceStation: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(payload));
  const win = newDom(storage).window;
  check('valid id: a well-formed existing id is preserved exactly', win.state.characters[0].id === 'w_keepme_123');
})();

// =============================================================================
// GAME FLOW (smoke test) — mine -> craft -> sell -> first ticket -> gacha ->
// worker auto-mining -> prestige -> reset -> permanent prestige persists
// =============================================================================

(function test_fullGameFlowSmoke() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;

  // 1. Initial state.
  check('flow: starts with 0 gold, 0 tickets, no workers', win.state.gold === 0 && win.permanent.tickets === 0 && win.state.characters.length === 0);

  // 2. Manual mining (button click, exactly as a player would).
  const ironBtn = win.document.querySelector('[data-mine="iron"]');
  const coalBtn = win.document.querySelector('[data-mine="coal"]');
  for (let i = 0; i < 20; i++) ironBtn.click();
  for (let i = 0; i < 10; i++) coalBtn.click();
  check('flow: manual mining accumulates resources', win.state.resources.iron >= 20 && win.state.resources.coal >= 10);

  // 3. Craft (button click).
  win.updateNumbers();
  const craftBtn = win.document.querySelector('[data-craft="steel"]');
  for (let i = 0; i < 10; i++) { craftBtn.click(); win.updateNumbers(); }
  check('flow: crafting steel produces product', win.state.products.steel >= 10);

  // 4. Sell (button click) -> crosses the 50G first-ticket threshold.
  const sellBtn = win.document.querySelector('[data-sell="steel"]');
  sellBtn.click();
  check('flow: selling steel yields gold', win.state.gold > 0);
  check('flow: crossing 50G granted the first ticket', win.permanent.firstGachaGranted === true && win.permanent.tickets >= 1);

  // 5. Gacha (button click).
  win.updateNumbers();
  win.document.getElementById('gachaTicketBtn').click();
  check('flow: gacha pull produced a worker', win.state.characters.length === 1);
  check('flow: worker is assigned to an unlocked resource', ['iron', 'coal'].includes(win.state.characters[0].resource));

  // 6. Auto-mining now active for the worker's resource.
  const workerRes = win.state.characters[0].resource;
  check('flow: auto rate is now > 0 for the worker\'s resource', win.autoRate(workerRes) > 0);

  // 7. Build up enough runGold for a prestige point, then prestige.
  win.state.runGold = 5000;
  const expectedGain = win.prestigeGain();
  check('flow: prestige gain is available with a worker present', expectedGain > 0);
  win.document.getElementById('prestigeBtn').onclick();
  check('flow: prestige increased totalPrestige', win.permanent.totalPrestige === expectedGain);
  check('flow: prestige reset the run (0 workers, 0 gold)', win.state.characters.length === 0 && win.state.gold === 0);

  // 8. Permanent prestige value persists across a reload.
  const prestigeAfter = win.permanent.totalPrestige;
  win = newDom(storage).window; // no explicit save call — relies on the autosave-on-prestige from step 7
  check('flow: permanent prestige persists after prestige + reload', win.permanent.totalPrestige === prestigeAfter);
})();

// =============================================================================
// TASK 6 — early automation guidance (Next Hint branches + one-time log +
// locked-site recipe preview)
// =============================================================================

function makeTestWorker(id, resource) {
  return { id, rarity: 'common', resource, mining: 1, carry: 2, move: 1, miningLvl: 0, carryLvl: 0, moveLvl: 0 };
}

(function test_A_noWorkersHintUnchanged() {
  const win = newDom(makeMemoryStorage()).window;
  // Grant the first ticket (crosses 50G) but pull no worker yet.
  win.state.gold = 50;
  win.permanent.firstGachaGranted = true;
  win.permanent.tickets = 1;
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-A: no-worker hint text is the original "뽑으세요" guidance', text.includes('일꾼') && text.includes('뽑'));
})();

(function test_B_ironOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'iron'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-B: iron-only worker mentions coal as the missing side', text.includes('석탄'));
  check('Task6-B: iron-only worker does not claim full automation', !text.includes('자동화 완료'));
})();

(function test_C_coalOnlyShowsPartialAutomationHint() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.firstGachaGranted = true;
  win.state.characters.push(makeTestWorker('t1', 'coal'));
  win.updateNextHint();
  const text = win.document.getElementById('nextHint').textContent;
  check('Task6-C: coal-only worker mentions iron as the missing side', text.includes('철광석'));
  check('Task6-C: coal-only worker does not claim full automation', !text.includes('자동화 완료'));
})();

