// ---------------------------------------------------------------------------
// Task 63/64: initial world generation — random mine layout for a new game.
//
// Called once per new run from freshWorldState() (state.js). Loading a save
// never calls this: sanitizeWorldState() keeps the saved mines as they are.
//
// Hard rules (all coordinates are integers inside the world bounds, checked
// with isValidWorldX/Y from state.js — no separate hard-coded limits):
//   - never on the base cell, never two mines on one cell;
//   - never on a cell a site expansion will seed later (WORLD_MINE_SEEDS
//     offsets from the base), so expanding still adds every seeded mine;
//   - one iron and one coal starter mine near the base, at a distance in
//     [STARTER_MIN_DIST, STARTER_MAX_DIST] (Task 63).
//
// Task 64 — distance rings (BALANCE.worldGen.RINGS). Distance is measured from
// the base. Each ring [minDist, maxDist) has a mine count and a weighted
// resource pool: near rings hold iron/coal, far rings fewer mines but rarer
// resources. The starters count toward the ring they fall in. A ring may cap
// resource groups with `limits` (Task 65: mid ring mana+crystal <= 1).
//
// Soft rule: mines prefer to be at least MIN_SPACING apart (and from the
// expansion seed cells) for readability; if a ring has no such cell left, any
// free cell in the ring is used.
//
// Positions/resources are picked with `random` (defaults to Math.random) from
// enumerated candidate lists, so generation never loops and tests can inject a
// random source.
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

function worldGenRandomUnit(random){
  const r = Number(random());
  return Number.isFinite(r) ? Math.min(Math.max(r, 0), 0.9999999999) : 0;
}

function worldGenPick(list, random){
  if(list.length === 0) return null;
  return list[Math.floor(worldGenRandomUnit(random) * list.length)];
}

// weights: { resourceKey: positive number }. Unknown keys / non-positive
// weights are ignored. Returns null if nothing is pickable.
function worldGenPickWeighted(weights, random){
  const entries = Object.keys(weights || {})
    .filter(k => RESOURCES.some(r => r.key === k) && Number.isFinite(weights[k]) && weights[k] > 0)
    .map(k => [k, weights[k]]);
  if(entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e[1], 0);
  let t = worldGenRandomUnit(random) * total;
  for(const [k, w] of entries){
    if(t < w) return k;
    t -= w;
  }
  return entries[entries.length - 1][0];
}

// Resources a brand-new run may place outside the rings (Task 63 extra mines):
// those of sites unlocked at the start (unlockCost 0 — iron, coal).
function worldGenStartResources(){
  const openSites = SITES.filter(s => s.unlockCost === 0).map(s => s.key);
  return RESOURCES.filter(r => openSites.includes(r.site)).map(r => r.key);
}

// Task 64: a mine's grade follows its resource's site tier (abandonedMine 1,
// manaVein 2, ruins 3, spaceStation 4) — the same grades WORLD_MINE_SEEDS use.
function worldGenResourceGrade(resource){
  const res = RESOURCES.find(r => r.key === resource);
  const tier = res ? SITES.findIndex(s => s.key === res.site) : -1;
  return tier >= 0 ? tier + 1 : 1;
}

// Cells that site expansion will seed (WORLD_MINE_SEEDS are offsets from the base).
function worldGenExpansionSeedCells(base){
  const cells = [];
  Object.keys(WORLD_MINE_SEEDS).forEach(site => {
    (WORLD_MINE_SEEDS[site] || []).forEach(seed => cells.push({ x: base.x + seed.x, y: base.y + seed.y }));
  });
  return cells;
}

// Task 65: a ring may cap groups of resources, e.g. { resources: ['mana',
// 'crystal'], max: 1 }. Returns the ring's weights with every resource whose
// group is already at its cap removed. `placed` = resource keys already in
// this ring.
function worldGenRingWeights(ring, placed){
  const weights = { ...(ring.resources || {}) };
  (Array.isArray(ring.limits) ? ring.limits : []).forEach(limit => {
    const group = Array.isArray(limit.resources) ? limit.resources : [];
    const max = Number.isInteger(limit.max) && limit.max >= 0 ? limit.max : Infinity;
    const used = placed.filter(r => group.includes(r)).length;
    if(used >= max) group.forEach(r => { delete weights[r]; });
  });
  return weights;
}

// Index of the ring a distance falls in, or -1.
function worldGenRingIndex(distance, rings){
  return rings.findIndex(r => distance >= r.minDist && distance < r.maxDist);
}

function makeGeneratedMine(id, cell, resource){
  return { id, x: cell.x, y: cell.y, resource, grade: worldGenResourceGrade(resource), miningPower: 1, developmentState: 'unsecured' };
}

// base: {x, y}. options (all optional, for tests/tuning):
//   random         — () => [0,1), default Math.random
//   rings          — ring table, default BALANCE.worldGen.RINGS ([] = starters only)
//   extraCount     — Task 63 extra mines anywhere, default BALANCE.worldGen.EXTRA_MINES
//   extraResources — resource keys for extra mines, default worldGenStartResources()
//   walkable       — (x, y) => bool cell filter, default isCellOpenForMines (Task 66)
function generateInitialWorldMines(base, options){
  const opts = options || {};
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const g = BALANCE.worldGen;
  const rings = Array.isArray(opts.rings) ? opts.rings : g.RINGS;
  // Task 66: only cells clear of the mountain / beyond / tunnel mouth, so every
  // generated mine can be walked to. `walkable` overrides it (tests only).
  const openCell = typeof opts.walkable === 'function' ? opts.walkable : isCellOpenForMines;
  const cells = worldGenAllCells().filter(c => openCell(c.x, c.y));
  const key = (c) => c.x + ',' + c.y;
  const used = new Set([key(base)]);
  const reserved = worldGenExpansionSeedCells(base);
  reserved.forEach(c => used.add(key(c)));
  const mines = [];
  const free = (c) => !used.has(key(c));
  const take = (c) => { used.add(key(c)); };
  const spacedFrom = (c, minSpacing) => mines.concat(reserved).every(o => worldGenDistance(c.x, c.y, o.x, o.y) >= minSpacing);
  const pickCell = (candidates, minSpacing) => {
    const open = candidates.filter(free);
    const spaced = open.filter(c => spacedFrom(c, minSpacing));
    return worldGenPick(spaced.length ? spaced : open, random);
  };
  const distOf = (c) => worldGenDistance(c.x, c.y, base.x, base.y);

  // Starters: one iron and one coal close to the base (Task 63 rule).
  const starterCells = cells.filter(c => { const d = distOf(c); return d >= g.STARTER_MIN_DIST && d <= g.STARTER_MAX_DIST; });
  ['iron', 'coal'].forEach(resource => {
    const cell = pickCell(starterCells, g.STARTER_MIN_SPACING);
    if(!cell) return;
    take(cell);
    mines.push(makeGeneratedMine(STARTER_MINE_IDS[resource], cell, resource));
  });

  // Task 64: distance rings. Starters already placed count toward their ring.
  rings.forEach((ring, ringIndex) => {
    const inRing = cells.filter(c => worldGenRingIndex(distOf(c), rings) === ringIndex);
    const placed = mines.filter(m => worldGenRingIndex(distOf(m), rings) === ringIndex).map(m => m.resource);
    const want = Math.max(0, (Number.isInteger(ring.count) ? ring.count : 0) - placed.length);
    for(let i = 0; i < want; i++){
      const cell = pickCell(inRing, g.MIN_SPACING);
      if(!cell) break;
      const resource = worldGenPickWeighted(worldGenRingWeights(ring, placed), random);
      if(!resource) break;
      placed.push(resource);
      take(cell);
      mines.push(makeGeneratedMine('mine_ring_' + ring.key + '_' + (i + 1), cell, resource));
    }
  });

  // Task 63 extra mines (anywhere in bounds, start-site resources only). 0 by default.
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
