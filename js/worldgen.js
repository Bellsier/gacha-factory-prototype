// ---------------------------------------------------------------------------
// Task 63: initial world generation — random mine layout for a new game.
//
// Called once per new run from freshWorldState() (state.js). Loading a save
// never calls this: sanitizeWorldState() keeps the saved mines as they are.
//
// Rules (all coordinates are integers inside the world bounds, checked with
// isValidWorldX/Y from state.js — no separate hard-coded limits):
//   - never on the base cell, never two mines on one cell;
//   - one iron and one coal starter mine near the base, at a distance in
//     [STARTER_MIN_DIST, STARTER_MAX_DIST], at least STARTER_MIN_SPACING apart;
//   - optional extra mines (EXTRA_MINES, default 0) anywhere in bounds, using
//     only resources of sites that are open at the start of a run, so locked
//     sites' resources are never handed out early.
// No distance rings, rarity or density rules here — those are a later Task.
//
// Positions are picked from an enumerated candidate list with `random`
// (defaults to Math.random), so generation never loops/retries and tests can
// pass their own random source.
// ---------------------------------------------------------------------------

const STARTER_MINE_IDS = { iron: 'mine_start_iron', coal: 'mine_start_coal' };

function worldGenDistance(ax, ay, bx, by){
  return Math.hypot(ax - bx, ay - by);
}

// Every in-bounds integer cell, in a fixed order.
function worldGenAllCells(){
  const b = BALANCE.world;
  const cells = [];
  for(let y = b.BOUNDS_MIN_Y; y <= b.BOUNDS_MAX_Y; y++){
    for(let x = b.BOUNDS_MIN_X; x <= b.BOUNDS_MAX_X; x++){
      if(isValidWorldX(x) && isValidWorldY(y)) cells.push({ x, y });
    }
  }
  return cells;
}

function worldGenPick(list, random){
  if(list.length === 0) return null;
  const r = Number(random());
  const i = Math.min(list.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * list.length)));
  return list[i];
}

// Resources a brand-new run may place: those of sites unlocked at the start
// (unlockCost 0 — currently the abandoned mine: iron, coal).
function worldGenStartResources(){
  const openSites = SITES.filter(s => s.unlockCost === 0).map(s => s.key);
  return RESOURCES.filter(r => openSites.includes(r.site)).map(r => r.key);
}

function makeGeneratedMine(id, cell, resource){
  return { id, x: cell.x, y: cell.y, resource, grade: 1, miningPower: 1, developmentState: 'unsecured' };
}

// base: {x, y}. options (all optional, for tests/tuning):
//   random        — () => [0,1), default Math.random
//   extraCount    — number of extra mines, default BALANCE.worldGen.EXTRA_MINES
//   extraResources— resource keys for extra mines, default worldGenStartResources()
function generateInitialWorldMines(base, options){
  const opts = options || {};
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const g = BALANCE.worldGen;
  const cells = worldGenAllCells();
  const used = new Set([base.x + ',' + base.y]);
  const mines = [];
  const free = (c) => !used.has(c.x + ',' + c.y);
  const take = (c) => { used.add(c.x + ',' + c.y); };

  // Starter ring around the base.
  const near = cells.filter(c => {
    const d = worldGenDistance(c.x, c.y, base.x, base.y);
    return d >= g.STARTER_MIN_DIST && d <= g.STARTER_MAX_DIST;
  });
  ['iron', 'coal'].forEach(resource => {
    const spaced = near.filter(c => free(c) && mines.every(m => worldGenDistance(c.x, c.y, m.x, m.y) >= g.STARTER_MIN_SPACING));
    // Spacing is a readability preference; a free near cell is the hard rule.
    const cell = worldGenPick(spaced.length ? spaced : near.filter(free), random);
    if(!cell) return;
    take(cell);
    mines.push(makeGeneratedMine(STARTER_MINE_IDS[resource], cell, resource));
  });

  // Optional extra mines (structure only; count/placement balance is a later Task).
  const extraCount = Number.isInteger(opts.extraCount) && opts.extraCount >= 0 ? opts.extraCount : g.EXTRA_MINES;
  const pool = Array.isArray(opts.extraResources) && opts.extraResources.length ? opts.extraResources : worldGenStartResources();
  for(let i = 0; i < extraCount; i++){
    const cell = worldGenPick(cells.filter(free), random);
    if(!cell) break;
    take(cell);
    mines.push(makeGeneratedMine('mine_gen_' + (i + 1), cell, worldGenPick(pool, random)));
  }
  return mines;
}
