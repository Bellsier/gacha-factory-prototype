// ---------------------------------------------------------------------------
// Task 113~117: the starting village on the green meadow (blueprint 24.8).
// The workshop (공방, `state.world.base`) is the village's production centre;
// around it stand facilities the player restores step by step:
//   감정소 (appraiser) — appraises unidentified relics and registers them in the codex
//   박물관 (museum)    — takes appraised relics as donations and puts them on display
// Unidentified relics are a collectible of their own, picked up now and then
// while mining. The crafting resource 고대 유물 (`relic`) is not touched.
// Progress lives in state.village (js/state.js, additive field, saveVersion 1).
// Game logic only: drawing is in js/topdown/, the panel in js/ui.js.
// ---------------------------------------------------------------------------
const VILLAGE = {
  FACILITIES: {
    appraiser: {
      name: '감정소',
      // walls on the ground, relative to the site point (the door step stays free, like a craft hut)
      box: { minX: -0.3, maxX: 0.3, minY: -0.38, maxY: -0.1 },
      requires: null,
      stages: [
        { name: '잔해 치우기', cost: { gold: 100 } },
        { name: '건물 복구', cost: { gold: 400, products: { steel: 8, coalBrick: 4 } } },
      ],
    },
    museum: {
      name: '박물관',
      box: { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: -0.1 },
      requires: 'appraiser', // the appraiser must be open first
      stages: [
        { name: '잔해 치우기', cost: { gold: 1200 } },
        { name: '건물 복구', cost: { gold: 3000, products: { steel: 20, ironTool: 5 } } },
      ],
    },
  },
  ORDER: ['appraiser', 'museum'], // site choice and restoration order
  STAGE_NAMES: ['폐허', '정리됨', '운영 중'],
};

// The relic codex. Descriptions are plain finds; they do not settle the story
// (blueprint 23.4 leaves the lore open). weight: how often appraisal turns one up.
const VILLAGE_RELICS = [
  { key: 'potsherd',   name: '금 간 토기 조각', rarity: 'common',   weight: 6, desc: '흙빛 유약이 남은 그릇 조각.' },
  { key: 'oldCoin',    name: '닳은 동전',       rarity: 'common',   weight: 6, desc: '글자가 닳아 읽을 수 없는 작은 동전.' },
  { key: 'rustKey',    name: '녹슨 열쇠',       rarity: 'common',   weight: 6, desc: '어느 문을 열던 것인지 알 수 없는 열쇠.' },
  { key: 'lampStand',  name: '등잔 받침',       rarity: 'common',   weight: 6, desc: '그을음이 밴 작은 받침.' },
  { key: 'tile',       name: '문양 타일',       rarity: 'common',   weight: 6, desc: '되풀이되는 무늬가 새겨진 타일.' },
  { key: 'gear',       name: '얼어붙은 톱니',   rarity: 'common',   weight: 6, desc: '서리가 낀 채 굳은 작은 톱니바퀴.' },
  { key: 'bell',       name: '작은 청동 종',     rarity: 'uncommon', weight: 3, desc: '흔들면 아직 맑은 소리가 난다.' },
  { key: 'tablet',     name: '빛바랜 석판',     rarity: 'uncommon', weight: 3, desc: '절반쯤 지워진 기록이 남은 석판.' },
  { key: 'seal',       name: '장인의 인장',     rarity: 'uncommon', weight: 3, desc: '공방 장인이 쓰던 것으로 보이는 도장.' },
  { key: 'mapPiece',   name: '지도 조각',       rarity: 'uncommon', weight: 3, desc: '낯선 지형이 그려진 낡은 지도의 일부.' },
  { key: 'crystalRule', name: '수정 눈금자',    rarity: 'rare',     weight: 1, desc: '수정을 깎아 만든 정밀한 자.' },
  { key: 'feather',    name: '결정 깃털',       rarity: 'rare',     weight: 1, desc: '결정처럼 단단하게 굳은 깃털.' },
];
const VILLAGE_RELIC_KEYS = VILLAGE_RELICS.map(r => r.key);
const VILLAGE_RARITY_NAMES = { common: '흔함', uncommon: '드묾', rare: '희귀' };

function villageRelicByKey(key){ return VILLAGE_RELICS.find(r => r.key === key) || null; }

// state.village, made whole if an older state has none (tests replace state wholesale)
function villageState(){
  if(!state.village || typeof state.village !== 'object') state.village = freshVillageState();
  return state.village;
}

function villageFacilityName(key){ return (VILLAGE.FACILITIES[key] || {}).name || key; }
function villageStage(key){ return villageState().stage[key] || 0; }
function villageIsOpen(key){ return villageStage(key) >= VILLAGE.FACILITIES[key].stages.length; }

// ---------------------------------------------------------------------------
// Task 114: facility sites. Each facility gets a site once, on free open
// ground near the workshop, and keeps it (saved in state.village.sites).
// Existing mines and craft huts are never moved: a site keeps clear of them,
// of the cells a site expansion will seed later (WORLD_MINE_SEEDS), of the
// workshop yard and of the road to the tunnel. A site is only taken if its
// door can be walked to from the workshop door and the building cuts no
// walkable ground off (checked on a 0.1 grid of foot positions).
// ---------------------------------------------------------------------------
VILLAGE.SITE = {
  STEP: 0.5,              // candidate grid (world units)
  RMIN: 1.9,              // nearest to the workshop door (the yard and the lamp stay clear)
  RMAX: [5, 7],           // search rings: first the near one, then a little wider
  MINE_CLEAR: 1.4,        // from every mine (and every later expansion mine cell)
  WORKSHOP_CLEAR: 1.6,    // from every craft hut (and later huts keep this far from a site)
  ROAD_CLEAR: 0.8,        // from the dirt road to the tunnel mouth
  GAP: 2.2,               // between two facilities
  ROOM: 0.35,             // walking room kept round the walls (on open, walkable ground)
  REACH: 7,               // reach check area: the workshop door +- this
  GRID: 0.1,
};

function villageSegDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function villageBox(key, x, y){
  const b = VILLAGE.FACILITIES[key].box;
  return { kind: 'village', id: key, minX: x + b.minX, maxX: x + b.maxX, minY: y + b.minY, maxY: y + b.maxY };
}

// Walls of the facilities that have a site (they block like craft huts, in every stage).
// Cached (it is asked for on every step and by every reach check) until any of what it is made of changes.
let villageObstacleCache = null, villageDecorVersion = 0;
function villageObstacleBoxes(){
  const v = state && state.village;
  if(!v || !v.sites) return [];
  const carry = typeof VILLAGE_GARDEN_UI !== 'undefined' ? VILLAGE_GARDEN_UI.carry : -1;
  const parts = [v, v.district, VILLAGE.ORDER.map(k => v.sites[k]), v.decor, v.decor && v.decor.length, villageDecorVersion, carry];
  const c = villageObstacleCache;
  if(c && c.parts.length === parts.length && c.parts.every((x, i) => i === 2 ? x.every((y, j) => y === parts[2][j]) : x === parts[i])) return c.boxes;
  const boxes = villageObstacleBoxesNow();
  villageObstacleCache = { parts, boxes };
  return boxes;
}
function villageObstacleBoxesNow(){
  const v = state.village;
  const out = VILLAGE.ORDER.filter(k => v.sites[k]).map(k => villageBox(k, v.sites[k].x, v.sites[k].y));
  if(v.district && VILLAGE.DISTRICT) out.push(villageHouseBox(villageDistrictParts(v.district).house)); // Task 119: the player's house
  if(VILLAGE.GARDEN) villageDecorObstacles().forEach(o => out.push(o)); // Task 120: the garden's decorations
  return out;
}

// Is (x, y) too close to a facility site for a new craft hut? (workshopBuildSpot)
function villageSiteNear(x, y, dist){
  const v = state && state.village;
  if(!v || !v.sites) return false;
  return VILLAGE.ORDER.some(k => v.sites[k] && Math.hypot(v.sites[k].x - x, v.sites[k].y - y) < dist);
}

// The simple rules for a site (everything but the reach check).
function villageSiteFits(key, x, y, placed){
  const S = VILLAGE.SITE, w = state.world, base = w.base, b = VILLAGE.FACILITIES[key].box;
  if(terrainRegionAt(x, y) !== 'open') return false;
  const x0 = x + b.minX - S.ROOM, x1 = x + b.maxX + S.ROOM, y0 = y + b.minY - S.ROOM, y1 = y + 0.5;
  const ground = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [x, y0], [x, y1], [x0, y], [x1, y]];
  if(!ground.every(([gx, gy]) => terrainRegionAt(gx, gy) === 'open' && isWorldPointWalkable(gx, gy))) return false;
  if(Math.hypot(x - base.x, y - base.y) < S.RMIN) return false;
  if(w.mines.some(m => m && Math.hypot(m.x - x, m.y - y) < S.MINE_CLEAR)) return false;
  if(worldGenExpansionSeedCells(base).some(c => Math.hypot(c.x - x, c.y - y) < S.MINE_CLEAR)) return false;
  if(w.workshops.some(ws => ws && Math.hypot(ws.x - x, ws.y - y) < S.WORKSHOP_CLEAR)) return false;
  const t = terrainTunnel();
  if(villageSegDist(x, y, base.x, base.y, t.mouthX, t.y) < S.ROAD_CLEAR) return false;
  if(placed.some(p => Math.hypot(p.x - x, p.y - y) < S.GAP)) return false;
  return true;
}

// The reach check: a grid of standable foot positions round the workshop, flood-filled
// from its door, with and without the new walls. Returns a function (key, x, y) -> ok.
function villageReachChecker(){
  const check = villageReachGrid(VILLAGE.SITE.REACH);
  return (key, x, y, extraBoxes) => check([villageBox(key, x, y)].concat(extraBoxes || []), [{ x, y: y + 0.1 }]);
}

// The grid behind it, `reach` units round the workshop door. Returns a function
// (boxes, doors) -> ok: with the new walls `boxes`, every point of `doors` can
// still be walked to from the workshop door, and no ground that could be
// reached before is cut off (Task 118 checks the plaza and the house this way).
function villageReachGrid(reach){
  const base = state.world.base;
  return villageReachArea(base.x - reach, base.y - reach, base.x + reach, base.y + reach, { x: base.x, y: base.y + 0.05 });
}

// The same check over any rectangle, flood-filled from `start` (Task 120: the garden's
// own neighbourhood from the plaza — a decoration can only cut off ground near it).
function villageReachArea(x0, y0, x1, y1, start){
  const st = VILLAGE.SITE.GRID, nx = Math.round((x1 - x0) / st) + 1, ny = Math.round((y1 - y0) / st) + 1, N = nx * ny;
  const can = new Uint8Array(N);
  for(let j = 0; j < ny; j++) for(let i = 0; i < nx; i++) can[j * nx + i] = playerCanStand(x0 + i * st, y0 + j * st) ? 1 : 0;
  const cell = (x, y) => { const i = Math.round((x - x0) / st), j = Math.round((y - y0) / st); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
  const fill = (blocked) => {
    const seen = new Uint8Array(N), s0 = cell(start.x, start.y);
    if(s0 < 0 || !can[s0] || blocked(s0)) return seen;
    const q = [s0]; seen[s0] = 1;
    while(q.length){
      const c = q.pop(), i = c % nx;
      for(const d of [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, c - nx, c + nx]){
        if(d < 0 || d >= N || seen[d] || !can[d] || blocked(d)) continue;
        seen[d] = 1; q.push(d);
      }
    }
    return seen;
  };
  const before = fill(() => false);
  return (boxes, doors) => {
    const hit = (c) => { const px = x0 + (c % nx) * st, py = y0 + Math.floor(c / nx) * st; return boxes.some(o => playerFootOverlaps(o, px, py)); };
    const after = fill(hit);
    for(const d of doors){ const c = cell(d.x, d.y); if(c < 0 || !after[c]) return false; } // the doors can be walked to
    for(let c = 0; c < N; c++) if(before[c] && !after[c] && !hit(c)) return false; // nothing else is cut off
    return true;
  };
}

// Gives every facility without a site one, once (the result is saved). Returns true if all have one.
let villageSiteFailKey = null; // a search that found no site is not repeated until the world changes

function villageEnsureSites(){
  const v = villageState();
  if(VILLAGE.ORDER.every(k => v.sites[k])){ villageEnsureDistrict(); return true; } // Task 118: then the plaza
  const w = state.world, tryKey = w.base.x + ',' + w.base.y + '|' + w.mines.length + '|' + w.workshops.length + '|' + (w.tunnelUnlocked ? 1 : 0);
  if(villageSiteFailKey === tryKey) return false;
  const S = VILLAGE.SITE, base = state.world.base, placed = VILLAGE.ORDER.filter(k => v.sites[k]).map(k => v.sites[k]);
  let reach = null;
  VILLAGE.ORDER.forEach(key => {
    if(v.sites[key]) return;
    for(const rmax of S.RMAX){
      const cands = [];
      for(let dy = -rmax; dy <= rmax + 1e-9; dy += S.STEP){
        for(let dx = -rmax; dx <= rmax + 1e-9; dx += S.STEP){
          const d = Math.hypot(dx, dy);
          if(d < S.RMIN || d > rmax) continue;
          cands.push({ x: Math.round((base.x + dx) * 2) / 2, y: Math.round((base.y + dy) * 2) / 2, d, a: Math.atan2(dx, dy) });
        }
      }
      // nearest first; at equal distance, from the south (in front of the workshop) round to the north
      cands.sort((p, q) => p.d - q.d || Math.abs(p.a) - Math.abs(q.a) || p.a - q.a);
      for(const c of cands){
        if(!villageSiteFits(key, c.x, c.y, placed)) continue;
        if(!reach) reach = villageReachChecker();
        // walls already placed in this pass are not in the checker's grid yet: add them
        const placedWalls = VILLAGE.ORDER.filter(k => v.sites[k]).map(k => villageBox(k, v.sites[k].x, v.sites[k].y));
        if(!reach(key, c.x, c.y, placedWalls)) continue;
        v.sites[key] = { x: c.x, y: c.y };
        placed.push(v.sites[key]);
        break;
      }
      if(v.sites[key]) break;
    }
  });
  const ok = VILLAGE.ORDER.every(k => v.sites[k]);
  villageSiteFailKey = ok ? null : tryKey;
  if(ok) villageEnsureDistrict();
  return ok;
}

// ---------------------------------------------------------------------------
// Task 115: staged restoration. Each facility is cleared, then rebuilt; the
// museum needs the appraiser open first. The cost (gold and products from the
// shared store) is paid once per step, when the step is done.
// ---------------------------------------------------------------------------
function villageNextStep(key){
  const f = VILLAGE.FACILITIES[key];
  return f ? (f.stages[villageStage(key)] || null) : null;
}

function villageCostText(cost){
  const parts = [];
  if(cost.gold) parts.push(fmt(cost.gold) + 'G');
  Object.keys(cost.products || {}).forEach(p => { const r = RECIPES.find(x => x.key === p); parts.push((r ? r.name : p) + ' ' + cost.products[p]); });
  return parts.join(' · ');
}

// Why the next step cannot be done now, or null when it can.
function villageRestoreBlocker(key){
  const f = VILLAGE.FACILITIES[key];
  if(!f) return '알 수 없는 시설';
  const v = villageState();
  if(!v.sites[key]) return '자리를 찾는 중';
  const step = villageNextStep(key);
  if(!step) return '이미 운영 중';
  if(f.requires && !villageIsOpen(f.requires)) return villageFacilityName(f.requires) + '를 먼저 복구해야 해요';
  if(state.gold < (step.cost.gold || 0)) return '골드가 모자라요';
  const short = Object.keys(step.cost.products || {}).find(p => (state.products[p] || 0) < step.cost.products[p]);
  if(short){ const r = RECIPES.find(x => x.key === short); return (r ? r.name : short) + '이(가) 모자라요'; }
  return null;
}

// Does the next restoration step. Returns true when it was done (and paid).
function villageRestore(key){
  if(villageRestoreBlocker(key)) return false;
  const step = villageNextStep(key), v = villageState();
  state.gold -= step.cost.gold || 0;
  Object.keys(step.cost.products || {}).forEach(p => { state.products[p] -= step.cost.products[p]; });
  v.stage[key] += 1;
  log(villageFacilityName(key) + ': ' + step.name + (villageIsOpen(key) ? ' — 운영을 시작합니다' : ' 완료'));
  return true;
}

// ---------------------------------------------------------------------------
// Task 116: unidentified relics and the appraiser. Mining by hand (the panel
// button or E at a vein: mineMine) adds dig progress; every RELIC.EVERY points
// turn up one unidentified relic (a collectible of its own, not the crafting
// resource). No randomness: veins beyond the mountain and 고대 유물 veins give
// more progress. Production and resources are not changed. At the open
// appraiser a relic is appraised: it becomes one relic of the codex, chosen
// by a fixed sequence (the appraisal count), weighted by rarity and three
// times likelier while not yet registered.
// ---------------------------------------------------------------------------
VILLAGE.RELIC = {
  EVERY: 8,                 // dig progress per unidentified relic
  STEP: 1,                  // per manual mining
  BEYOND_STEP: 2,           // per manual mining beyond the mountain
  RELIC_VEIN_STEP: 3,       // per manual mining of a 고대 유물 vein
  MAX_UNIDENTIFIED: 20,     // held at once; mining past this finds none
  NEW_BOOST: 3,             // weight factor for a relic not yet in the codex
};

// After a successful manual mining of `mine`: returns how many relics turned up (0 or 1).
function villageOnManualMine(mine){
  const v = villageState(), R = VILLAGE.RELIC;
  if(v.unidentified >= R.MAX_UNIDENTIFIED) return 0; // full: no progress either
  const step = mine && mine.resource === 'relic' ? R.RELIC_VEIN_STEP : mine && terrainRegionAt(mine.x, mine.y) === 'beyond' ? R.BEYOND_STEP : R.STEP;
  v.digProgress += step;
  if(v.digProgress < R.EVERY) return 0;
  v.digProgress -= R.EVERY;
  v.unidentified += 1;
  log('미감정 유물을 찾았어요 (보유 ' + v.unidentified + ')');
  return 1;
}

function villageHash01(n){
  let h = Math.imul((n + 1) ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Which relic the next appraisal turns up (no state change).
function villageNextRelic(){
  const v = villageState(), weights = VILLAGE_RELICS.map(r => r.weight * (v.codex.includes(r.key) ? 1 : VILLAGE.RELIC.NEW_BOOST));
  let roll = villageHash01(v.appraised) * weights.reduce((a, b) => a + b, 0);
  for(let i = 0; i < VILLAGE_RELICS.length; i++){ roll -= weights[i]; if(roll < 0) return VILLAGE_RELICS[i]; }
  return VILLAGE_RELICS[VILLAGE_RELICS.length - 1];
}

function villageAppraiseBlocker(){
  if(!villageIsOpen('appraiser')) return '감정소가 아직 복구되지 않았어요';
  if(villageState().unidentified <= 0) return '감정할 유물이 없어요';
  return null;
}

// Appraises one unidentified relic. Returns { relic, isNew } or null.
function villageAppraise(){
  if(villageAppraiseBlocker()) return null;
  const v = villageState(), relic = villageNextRelic(), isNew = !v.codex.includes(relic.key);
  v.unidentified -= 1;
  v.appraised += 1;
  v.owned[relic.key] = (v.owned[relic.key] || 0) + 1;
  if(isNew) v.codex.push(relic.key);
  log('감정 결과: ' + relic.name + (isNew ? ' (도감 등록 ' + v.codex.length + '/' + VILLAGE_RELICS.length + ')' : ''));
  return { relic, isNew };
}

// ---------------------------------------------------------------------------
// Task 117: the museum. An appraised relic can be donated once per kind: it
// leaves the owned relics and goes on display (state.village.donated). The
// building's display niches light up as the collection grows. No rewards yet
// (further upgrades are on hold, blueprint 24.8); no gold.
// ---------------------------------------------------------------------------
// Relic keys owned and not yet on display, in codex order.
function villageDonatable(){
  const v = villageState();
  return VILLAGE_RELIC_KEYS.filter(k => (v.owned[k] || 0) > 0 && !v.donated.includes(k));
}

function villageDonateBlocker(key){
  if(!villageIsOpen('museum')) return '박물관이 아직 복구되지 않았어요';
  const v = villageState();
  if(key === undefined) return villageDonatable().length ? null : '기증할 새 유물이 없어요';
  if(!VILLAGE_RELIC_KEYS.includes(key)) return '알 수 없는 유물';
  if(v.donated.includes(key)) return '이미 전시 중이에요';
  if(!((v.owned[key] || 0) > 0)) return '가진 유물이 아니에요';
  return null;
}

// Donates one relic of `key`. Returns true when it went on display.
function villageDonate(key){
  if(villageDonateBlocker(key)) return false;
  const v = villageState(), before = villageMuseumCollected();
  v.owned[key] -= 1;
  if(v.owned[key] <= 0) delete v.owned[key];
  v.donated.push(key);
  log('박물관 기증: ' + villageRelicByKey(key).name + ' (전시 ' + v.donated.length + '/' + VILLAGE_RELICS.length + ')');
  villageAnnounceRewards(before); // Task 122
  return true;
}

// Donates every relic that can go on display. Returns how many.
function villageDonateAll(){
  if(villageDonateBlocker()) return 0;
  return villageDonatable().filter(k => villageDonate(k)).length;
}

// ---------------------------------------------------------------------------
// Task 118: the village district — the plaza and the roads (blueprint 24.9).
// The plaza is the village's anchor: one point chosen once on free open ground
// a little away from the workshop and saved (state.village.district =
// { x, y, layout }). The lots of the player's house (Task 119) and the garden
// (Task 120) are fixed offsets from it — one of a few layouts, whichever fits
// — so moving the village to a space of its own later (blueprint 24.5/24.9)
// moves one saved point. The appraiser's and the museum's saved sites stay as
// they are, and nothing already in the world is moved.
// Roads are not saved: they are worked out from the saved points and the
// world (a grid search round whatever stands there, cached), from the plaza to
// the workshop and to every facility door. The plaza and the roads are open
// ground: they block nothing, and nothing is built or set down on them.
// ---------------------------------------------------------------------------
VILLAGE.DISTRICT = {
  PLAZA_R: 0.95,             // the paved circle
  // offsets from the plaza centre: the house door and the garden centre
  LAYOUTS: [
    { house: { x: 0, y: -1.5 }, garden: { x: 2.3, y: 0 } },
    { house: { x: 0, y: -1.5 }, garden: { x: -2.3, y: 0 } },
    { house: { x: 0, y: -1.5 }, garden: { x: 0, y: 2.05 } },
    { house: { x: -1.25, y: -1.5 }, garden: { x: 1.45, y: -1.9 } },
    { house: { x: 1.25, y: -1.5 }, garden: { x: -1.45, y: -1.9 } },
  ],
  HOUSE_BOX: { minX: -0.34, maxX: 0.34, minY: -0.44, maxY: -0.1 }, // the house walls, relative to its door
  HOUSE_ROOM: 0.3,           // ground kept round the house walls
  GARDEN_HALF: { x: 1.25, y: 0.85 }, // the garden round its centre
  DIST: [3.5, 7.5],          // plaza centre from the workshop door (then wider, up to DIST_WIDE)
  DIST_WIDE: 9.5,
  IDEAL: 4.5,                // candidates nearest this distance are tried first
  STEP: 0.5,
  EDGE: 0.6,                 // the district keeps this far inside the world edge
  BASE_CLEAR: 1.6,           // ...from the workshop door
  MINE_CLEAR: 0.9,           // ...from every vein and every later expansion vein cell
  HUT_CLEAR: 1.0,            // ...from a craft hut's door
  FACILITY_CLEAR: 0.6,       // ...from the appraiser's and museum's walls and doors
  TUNNEL_ROAD_CLEAR: 0.6,    // ...from the dirt road to the tunnel
  TORCH_CLEAR: 0.3,          // ...from a torch already set down
  REACH: 11,                 // reach check area: the workshop door +- this
  ROAD_GRID: 0.2,            // road search grid
  ROAD_ROOM: 0.18,           // a road keeps this far from walls and veins (a comfortable lane)
  ROAD_HALF: 0.22,           // drawn half width of a road
  BUILD_CLEAR: 0.7,          // a new craft hut keeps this far from the district and the roads
};

// The district's parts for a plaza point and layout: plaza, house door, garden and the footprint rectangles.
function villageDistrictParts(d){
  const D = VILLAGE.DISTRICT, L = D.LAYOUTS[d.layout] || D.LAYOUTS[0], R = D.PLAZA_R, hb = D.HOUSE_BOX, hr = D.HOUSE_ROOM, gh = D.GARDEN_HALF;
  const house = { x: d.x + L.house.x, y: d.y + L.house.y }, garden = { x: d.x + L.garden.x, y: d.y + L.garden.y, hw: gh.x, hh: gh.y };
  return {
    plaza: { x: d.x, y: d.y, r: R }, house, garden,
    rects: [
      { minX: d.x - R, maxX: d.x + R, minY: d.y - R, maxY: d.y + R },
      { minX: house.x + hb.minX - hr, maxX: house.x + hb.maxX + hr, minY: house.y + hb.minY - hr, maxY: house.y + 0.4 },
      { minX: garden.x - gh.x, maxX: garden.x + gh.x, minY: garden.y - gh.y, maxY: garden.y + gh.y },
    ],
  };
}

function villageRectDist(r, x, y){
  return Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minY - y, 0, y - r.maxY));
}
function villageRectsApart(a, b, gap){
  return a.maxX + gap <= b.minX || b.maxX + gap <= a.minX || a.maxY + gap <= b.minY || b.maxY + gap <= a.minY;
}

// The simple rules for a district (everything but the reach check).
function villageDistrictFits(x, y, layout){
  const D = VILLAGE.DISTRICT, B = BALANCE.world, w = state.world, base = w.base, v = villageState();
  const rects = villageDistrictParts({ x, y, layout }).rects;
  const veins = w.mines.filter(Boolean).concat(worldGenExpansionSeedCells(base));
  const t = terrainTunnel(), tunnelRoad = [];
  for(let k = 0; k <= 40; k++) tunnelRoad.push({ x: base.x + (t.mouthX - base.x) * k / 40, y: base.y + (t.y - base.y) * k / 40 });
  for(let i = 0; i < rects.length; i++){
    const r = rects[i];
    if(r.minX < B.BOUNDS_MIN_X + D.EDGE || r.maxX > B.BOUNDS_MAX_X - D.EDGE || r.minY < B.BOUNDS_MIN_Y + D.EDGE || r.maxY > B.BOUNDS_MAX_Y - D.EDGE) return false;
    for(let px = r.minX; px <= r.maxX + 1e-9; px += 0.25) for(let py = r.minY; py <= r.maxY + 1e-9; py += 0.25){
      if(terrainRegionAt(px, py) !== 'open' || !isWorldPointWalkable(px, py)) return false;
    }
    if(villageRectDist(r, base.x, base.y) < D.BASE_CLEAR) return false;
    if(veins.some(m => villageRectDist(r, m.x, m.y) < D.MINE_CLEAR)) return false;
    if(w.workshops.some(ws => ws && villageRectDist(r, ws.x, ws.y) < D.HUT_CLEAR)) return false;
    if(VILLAGE.ORDER.some(k => { const s = v.sites[k]; return s && (!villageRectsApart(r, villageBox(k, s.x, s.y), D.FACILITY_CLEAR) || villageRectDist(r, s.x, s.y + 0.1) < D.FACILITY_CLEAR); })) return false;
    if(tunnelRoad.some(p => villageRectDist(r, p.x, p.y) < D.TUNNEL_ROAD_CLEAR)) return false;
    if((w.torches || []).some(tc => villageRectDist(r, tc.x, tc.y) < D.TORCH_CLEAR)) return false;
  }
  return true;
}

// Gives the village its plaza once (the result is saved). Needs the facility
// sites first, so the district keeps clear of them. Returns true if it has one.
let villageDistrictFailKey = null; // a search that found no place is not repeated until the world changes

function villageEnsureDistrict(){
  const v = villageState(), D = VILLAGE.DISTRICT;
  if(v.district) return true;
  if(!VILLAGE.ORDER.every(k => v.sites[k])) return false;
  const w = state.world, base = w.base;
  const tryKey = base.x + ',' + base.y + '|' + w.mines.length + '|' + w.workshops.length + '|' + (w.tunnelUnlocked ? 1 : 0) + '|' + (w.torches || []).length;
  if(villageDistrictFailKey === tryKey) return false;
  let reach = null;
  const rings = [D.DIST[1], D.DIST_WIDE];
  for(let ri = 0; ri < rings.length && !v.district; ri++){
    const rmin = ri === 0 ? D.DIST[0] : D.DIST[1], rmax = rings[ri], cands = [];
    for(let dy = -rmax; dy <= rmax + 1e-9; dy += D.STEP){
      for(let dx = -rmax; dx <= rmax + 1e-9; dx += D.STEP){
        const d = Math.hypot(dx, dy);
        if(d < rmin - 1e-9 || d > rmax + 1e-9 || (ri > 0 && d <= D.DIST[1] + 1e-9)) continue;
        cands.push({ x: Math.round((base.x + dx) * 2) / 2, y: Math.round((base.y + dy) * 2) / 2, d, a: Math.atan2(dx, dy) });
      }
    }
    // nearest the ideal distance first; then from the south (in front of the workshop) round to the north
    cands.sort((p, q) => Math.abs(p.d - D.IDEAL) - Math.abs(q.d - D.IDEAL) || Math.abs(p.a) - Math.abs(q.a) || p.a - q.a);
    for(const c of cands){
      for(let layout = 0; layout < D.LAYOUTS.length; layout++){
        if(!villageDistrictFits(c.x, c.y, layout)) continue;
        if(!reach) reach = villageReachGrid(D.REACH);
        const parts = villageDistrictParts({ x: c.x, y: c.y, layout });
        // the house walls cut nothing off; its door and the plaza can be walked to from the workshop
        if(!reach([villageHouseBox(parts.house)], [{ x: parts.house.x, y: parts.house.y + 0.1 }, { x: c.x, y: c.y }])) continue;
        v.district = { x: c.x, y: c.y, layout };
        break;
      }
      if(v.district) break;
    }
  }
  villageDistrictFailKey = v.district ? null : tryKey;
  if(v.district) villageRoadCache = null;
  return !!v.district;
}

function villageHouseBox(door){
  const b = VILLAGE.DISTRICT.HOUSE_BOX;
  return { kind: 'house', id: 'house', minX: door.x + b.minX, maxX: door.x + b.maxX, minY: door.y + b.minY, maxY: door.y + b.maxY };
}

// The district's parts now, or null before it has a place.
function villageDistrict(){
  const v = state && state.village;
  return v && v.district ? villageDistrictParts(v.district) : null;
}

// --- roads ------------------------------------------------------------------
let villageRoadCache = null;

function villageRoadKey(){
  const w = state.world, v = state.village, ws = w.workshops.filter(Boolean).map(h => h.x + ',' + h.y).join(';');
  const last = w.mines[w.mines.length - 1];
  return w.base.x + ',' + w.base.y + '|' + JSON.stringify(v.district) + '|' + VILLAGE.ORDER.map(k => v.sites[k] ? v.sites[k].x + ',' + v.sites[k].y : '-').join(';') +
    '|' + w.mines.length + (last ? '@' + last.x + ',' + last.y : '') + '|' + ws + '|' + (terrainTunnelOpen() ? 1 : 0);
}

// The roads: [{ to, points: [{x, y}, ...] }]. Each starts at a door step (or the
// workshop door) and ends where it meets the plaza or a road laid before it.
function villageRoads(){
  const v = state && state.village;
  if(!v || !v.district) return [];
  const key = villageRoadKey();
  if(villageRoadCache && villageRoadCache.key === key) return villageRoadCache.roads;
  const roads = villageRoadsCompute();
  villageRoadCache = { key, roads };
  return roads;
}

// Where a road leads to (door step points), the workshop first: its road is the main road.
function villageRoadEnds(){
  const v = villageState(), base = state.world.base, ends = [{ to: 'workshop', x: base.x, y: base.y + 0.2 }];
  VILLAGE.ORDER.forEach(k => { const s = v.sites[k]; if(s) ends.push({ to: k, x: s.x, y: s.y + 0.2 }); });
  if(v.district){ const h = villageDistrictParts(v.district).house; ends.push({ to: 'house', x: h.x, y: h.y + 0.2 }); } // Task 119
  return ends;
}

// A small road network: the main road from the workshop to the plaza first,
// then a branch from every other door to the nearest point of what is already
// laid (the plaza or a road). Each road is a breadth-first search on a grid of
// lanes round the walls, veins and the garden, pulled straight where the way
// is clear. A lane keeps ROAD_ROOM from walls; where there is no such lane the
// road only needs room to walk.
function villageRoadsCompute(){
  const D = VILLAGE.DISTRICT, B = BALANCE.world, parts = villageDistrict(), st = D.ROAD_GRID;
  const ends = villageRoadEnds(), plaza = parts.plaza, g = parts.garden;
  const xs = ends.map(e => e.x).concat(plaza.x), ys = ends.map(e => e.y).concat(plaza.y);
  const x0 = Math.max(B.BOUNDS_MIN_X, Math.min(...xs) - 2), y0 = Math.max(B.BOUNDS_MIN_Y, Math.min(...ys) - 2);
  const x1 = Math.min(B.BOUNDS_MAX_X, Math.max(...xs) + 2), y1 = Math.min(B.BOUNDS_MAX_Y, Math.max(...ys) + 2);
  const nx = Math.floor((x1 - x0) / st) + 1, ny = Math.floor((y1 - y0) / st) + 1;
  const obstacles = worldObstacles().filter(o => o.kind !== 'decor'); // garden pieces never change a road
  const F = PLAYER_FOOT, freeWith = (room) => (x, y) => terrainRegionAt(x, y) === 'open' && isWorldPointWalkable(x, y) &&
    !(Math.abs(x - g.x) < g.hw && Math.abs(y - g.y) < g.hh) &&
    !obstacles.some(o => x > o.minX - room - F.HALF_W && x < o.maxX + room + F.HALF_W && y > o.minY - room - F.HALF_H && y < o.maxY + room + F.HALF_H);
  const grids = [freeWith(D.ROAD_ROOM), freeWith(0)].map(free => {
    const ok = new Uint8Array(nx * ny);
    for(let j = 0; j < ny; j++) for(let i = 0; i < nx; i++) ok[j * nx + i] = free(x0 + i * st, y0 + j * st) ? 1 : 0;
    return { free, ok };
  });
  const px = (c) => Math.round((x0 + (c % nx) * st) * 100) / 100, py = (c) => Math.round((y0 + Math.floor(c / nx) * st) * 100) / 100;
  // the cells the network already covers: the plaza, then each road as it is laid
  const net = new Uint8Array(nx * ny);
  const markDisc = (x, y, r) => {
    for(let j = Math.max(0, Math.floor((y - r - y0) / st)); j <= Math.min(ny - 1, Math.ceil((y + r - y0) / st)); j++)
      for(let i = Math.max(0, Math.floor((x - r - x0) / st)); i <= Math.min(nx - 1, Math.ceil((x + r - x0) / st)); i++)
        if(Math.hypot(x0 + i * st - x, y0 + j * st - y) <= r) net[j * nx + i] = 1;
  };
  markDisc(plaza.x, plaza.y, plaza.r - 0.2);
  const clearOn = (free) => (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05)); for(let k = 0; k <= n; k++) if(!free(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n)) return false; return true; };
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const roads = [];
  ends.forEach(e => {
    for(const gr of grids){
      // the free lane cell nearest the door step
      let start = -1, bestD = 0.75;
      for(let j = Math.max(0, Math.floor((e.y - 0.8 - y0) / st)); j <= Math.min(ny - 1, Math.ceil((e.y + 0.8 - y0) / st)); j++){
        for(let i = Math.max(0, Math.floor((e.x - 0.8 - x0) / st)); i <= Math.min(nx - 1, Math.ceil((e.x + 0.8 - x0) / st)); i++){
          const c = j * nx + i, d = Math.hypot(x0 + i * st - e.x, y0 + j * st - e.y);
          if(gr.ok[c] && d < bestD){ start = c; bestD = d; }
        }
      }
      if(start < 0) continue;
      // search outwards from the door until the network is met
      const from = new Int32Array(nx * ny).fill(-1);
      from[start] = start;
      let hit = net[start] ? start : -1;
      for(let q = [start], h = 0; h < q.length && hit < 0; h++){
        const c = q[h], i = c % nx, j = (c - i) / nx;
        for(const [di, dj] of STEPS){
          const ii = i + di, jj = j + dj, d = jj * nx + ii;
          if(ii < 0 || jj < 0 || ii >= nx || jj >= ny || from[d] >= 0) continue;
          if(!net[d] && !gr.ok[d]) continue;
          if(di && dj && !((gr.ok[j * nx + ii] || net[j * nx + ii]) && (gr.ok[jj * nx + i] || net[jj * nx + i]))) continue; // no cutting a corner
          from[d] = c;
          if(net[d]){ hit = d; break; }
          q.push(d);
        }
      }
      if(hit < 0) continue;
      const cells = [];
      for(let c = hit; ; c = from[c]){ cells.unshift({ x: px(c), y: py(c) }); if(from[c] === c) break; }
      const clear = clearOn(gr.free), pts = [cells[0]];
      for(let i = 0; i < cells.length - 1;){
        let j = cells.length - 1;
        while(j > i + 1 && !clear(cells[i], cells[j])) j--;
        pts.push(cells[j]); i = j;
      }
      pts.unshift({ x: e.x, y: e.y });
      const points = pts.filter((q, i) => i === 0 || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y);
      for(let i = 1; i < points.length; i++){
        const a = points[i - 1], b = points[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
        for(let k = 0; k <= n; k++) markDisc(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, 0.12);
      }
      roads.push({ to: e.to, points });
      break;
    }
  });
  return roads;
}

function villageSegPolyDist(points, x, y){
  let d = Infinity;
  for(let i = 0; i < points.length - 1; i++) d = Math.min(d, villageSegDist(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y));
  return d;
}

// Is (x, y) on the village's ground — the district or a road — within `clear`? (new craft huts keep off it)
function villageGroundNear(x, y, clear){
  const parts = villageDistrict();
  if(!parts) return false;
  if(parts.rects.some(r => villageRectDist(r, x, y) < clear)) return true;
  return villageRoads().some(r => villageSegPolyDist(r.points, x, y) < clear);
}

// What the ground painter needs (plain data): plaza, roads and garden, with a key for caching.
function villageGroundLayout(){
  const parts = villageDistrict();
  if(!parts) return null;
  const roads = villageRoads();
  return { key: villageRoadKey(), plaza: parts.plaza, garden: parts.garden, roads: roads.map(r => r.points), roadHalf: VILLAGE.DISTRICT.ROAD_HALF }; // Task 120: the garden lawn too
}

// ---------------------------------------------------------------------------
// Task 119: the player's house. It stands on its lot north of the plaza
// (VILLAGE.DISTRICT layouts) from the start — the player owns it, nothing to
// restore. Its walls block like the other buildings; the door step stays free.
// Walking up to the door and pressing E (the phone's action button) goes in.
// Inside is a small room of its own (a separate scene in room units: x right,
// y down, the door gap in the bottom wall). Walking out through the door gap,
// or E at the door, comes back out onto the door step.
// Being inside is not saved: while inside, the player's world position is the
// house's door step, so a game saved inside loads with the player outside the
// door. The furniture is fixed for now; VILLAGE.HOME.FURNITURE is plain data,
// so a later task can make it placeable (and save it) without changing this.
// ---------------------------------------------------------------------------
VILLAGE.HOME = {
  ROOM: { w: 4.5, h: 3.25 },     // the floor, in room units (the same size as world units)
  DOOR: { x: 2.25, half: 0.3 },  // the gap in the bottom wall
  START: { x: 2.25, y: 2.9 },    // where the player stands after coming in
  EXIT_Y: 3.4,                   // walking out through the door gap past this leaves the house
  ENTER_RANGE: 1.3,              // how near the door the player has to be to go in
  SIDE_PX: 10, BACK_PX: 48, BOTTOM_PX: 10, // the drawn walls round the floor (pixels at zoom 1)
  RUG: { x: 2.25, y: 2.35, w: 1.5, h: 0.75 },
  // fixed furniture: key, name, foot point (bottom centre) and the box that blocks (null: walk past it)
  FURNITURE: [
    { key: 'bed', name: '침대', x: 0.6, y: 1.25, box: { minX: -0.38, maxX: 0.38, minY: -1.25, maxY: 0 } },
    { key: 'shelf', name: '책장', x: 3.55, y: 0.38, box: { minX: -0.48, maxX: 0.48, minY: -0.38, maxY: 0 } },
    { key: 'table', name: '탁자', x: 2.25, y: 1.6, box: { minX: -0.34, maxX: 0.34, minY: -0.3, maxY: 0 } },
    { key: 'stool', name: '의자', x: 1.7, y: 1.6, box: { minX: -0.1, maxX: 0.1, minY: -0.12, maxY: 0 } },
    { key: 'stool', name: '의자', x: 2.8, y: 1.6, box: { minX: -0.1, maxX: 0.1, minY: -0.12, maxY: 0 } },
    { key: 'stove', name: '난로', x: 4.05, y: 2.2, box: { minX: -0.24, maxX: 0.24, minY: -0.3, maxY: 0 } },
    { key: 'chest', name: '상자', x: 0.55, y: 3.0, box: { minX: -0.27, maxX: 0.27, minY: -0.25, maxY: 0 } },
    { key: 'plant', name: '화분', x: 3.15, y: 3.15, box: { minX: -0.1, maxX: 0.1, minY: -0.12, maxY: 0 } },
  ],
};

// The scene inside the house (renderer and game tick read it; never saved).
const VILLAGE_HOME_SCENE = { inside: false, x: 0, y: 0, facing: 'up', pose: 'idle' };
function villageHomeScene(){ return VILLAGE_HOME_SCENE; }
function villageHomeInside(){ return VILLAGE_HOME_SCENE.inside === true; }

// Could the player's feet stand at (x, y) in the room? The walls, the door gap and the furniture.
function villageHomeCanStand(x, y){
  const H = VILLAGE.HOME, F = PLAYER_FOOT;
  if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if(x - F.HALF_W < 0.04 || x + F.HALF_W > H.ROOM.w - 0.04 || y - F.HALF_H < 0.22) return false;
  if(y + F.HALF_H > H.ROOM.h - 0.02 && (Math.abs(x - H.DOOR.x) + F.HALF_W > H.DOOR.half || y > H.EXIT_Y + 0.3)) return false; // only through the door gap
  return !H.FURNITURE.some(f => f.box && x + F.HALF_W > f.x + f.box.minX && x - F.HALF_W < f.x + f.box.maxX && y + F.HALF_H > f.y + f.box.minY && y - F.HALF_H < f.y + f.box.maxY);
}

// The house's door step in the world, or null before the village has a place.
function villageHouseDoor(){
  const parts = villageDistrict();
  return parts ? parts.house : null;
}

function villageHomeEnterBlocker(){
  const door = villageHouseDoor(), p = state.world.player;
  if(!door) return '집 자리가 아직 없어요';
  if(villageHomeInside()) return '이미 집 안이에요';
  if(Math.hypot(p.x - door.x, p.y - door.y) > VILLAGE.HOME.ENTER_RANGE) return '집 문 앞으로 가야 해요';
  return null;
}

// Goes in. The world position waits on the door step (that is what a save keeps).
function villageHomeEnter(){
  if(villageHomeEnterBlocker()) return false;
  const door = villageHouseDoor(), p = state.world.player, S = VILLAGE_HOME_SCENE, H = VILLAGE.HOME;
  p.x = door.x; p.y = door.y + 0.2; p.facing = 'down'; p.pose = 'idle';
  S.inside = true; S.x = H.START.x; S.y = H.START.y; S.facing = 'up'; S.pose = 'idle';
  return true;
}

// Comes back out onto the door step, facing away from the house.
function villageHomeExit(){
  const S = VILLAGE_HOME_SCENE;
  if(!S.inside) return false;
  S.inside = false; S.pose = 'idle';
  const door = villageHouseDoor(), p = state.world.player;
  if(door){ p.x = door.x; p.y = door.y + 0.25; }
  p.facing = 'down'; p.pose = 'idle';
  return true;
}

// One game tick inside (tickPlayer calls this instead of moving in the world):
// the same held keys and speed, the room's walls and furniture, sliding along them.
function villageHomeTick(){
  const S = VILLAGE_HOME_SCENE;
  let dx = (playerHeld.right ? 1 : 0) - (playerHeld.left ? 1 : 0);
  let dy = (playerHeld.down ? 1 : 0) - (playerHeld.up ? 1 : 0);
  if(dx === 0 && dy === 0){ S.pose = 'idle'; return; }
  const len = Math.hypot(dx, dy), step = BALANCE.world.PLAYER_SPEED / TICKS_PER_SECOND;
  dx /= len; dy /= len;
  const sx = S.x, sy = S.y, free = villageHomeCanStand(sx, sy);
  const ok = (x, y) => !free || villageHomeCanStand(x, y);
  S.x = terrainAdvance(sx, sx + dx * step, (tx) => ok(tx, sy));
  S.y = terrainAdvance(sy, sy + dy * step, (ty) => ok(S.x, ty));
  if(Math.abs(dx) >= Math.abs(dy)) S.facing = dx > 0 ? 'right' : 'left';
  else S.facing = dy > 0 ? 'down' : 'up';
  S.pose = (S.x !== sx || S.y !== sy) ? 'walk' : 'idle';
  if(S.y >= VILLAGE.HOME.EXIT_Y) villageHomeExit(); // walked out through the door
}

// What the player can act on inside: the door (E goes out).
function villageHomeTarget(){
  const S = VILLAGE_HOME_SCENE, H = VILLAGE.HOME;
  if(!S.inside) return null;
  const dx = S.x - H.DOOR.x, dy = S.y - H.ROOM.h;
  return Math.hypot(dx, dy) <= 0.8 ? { type: 'homeDoor', id: 'door', x: H.DOOR.x, y: H.ROOM.h - 0.05, action: 'exit', label: '밖으로 나가기' } : null;
}

// ---------------------------------------------------------------------------
// Task 120: the garden. Its lot (VILLAGE.DISTRICT, next to the plaza) is a
// lawn with a grid of cells; a decoration stands on one cell. The player sets
// decorations down (free: there is no new money or stock), picks one up to
// move it to another cell, or takes it back. Saved as kind + cell in
// state.village.decor (additive field, saveVersion 1), so the garden moves
// with the district. Cells are 0.6 x 0.55 apart and every decoration's foot is
// narrower than the gap the player's feet need, so even a full garden can be
// walked through; on top of that a placement is refused near a door or a
// road, under the player, and wherever it would cut any walkable ground off
// (the same reach check as the village sites).
// Carrying a decoration (moving it) is not saved: until it is set down again
// it stays saved on its old cell.
// ---------------------------------------------------------------------------
VILLAGE.GARDEN = {
  COLS: 4, ROWS: 3,      // cells round the garden centre
  DX: 0.6, DY: 0.55,     // cell spacing
  AHEAD: 0.4,            // the cell in front of the player is looked for this far ahead...
  CELL_REACH: 0.38,      // ...within this of a cell centre
  NEAR: 0.6,             // the garden can be worked from this close to its edge
  DOOR_CLEAR: 0.6,       // no decoration this near a door step
  ROAD_CLEAR: 0.15,      // ...or this near the edge of a road
};
// The decorations. box: the foot that blocks (relative to the cell centre), all narrower than 0.42.
VILLAGE.DECOR = [
  { key: 'flowerPot', name: '화분', desc: '계절 꽃을 심은 작은 화분.', box: { minX: -0.1, maxX: 0.1, minY: -0.08, maxY: 0.03 } },
  { key: 'bench', name: '나무 벤치', desc: '잠깐 앉아 쉬기 좋은 벤치.', box: { minX: -0.2, maxX: 0.2, minY: -0.08, maxY: 0.03 } },
  { key: 'lantern', name: '돌 등롱', desc: '밤이면 은은하게 빛나는 돌 등.', light: true, box: { minX: -0.09, maxX: 0.09, minY: -0.08, maxY: 0.03 } },
  { key: 'shrub', name: '둥근 덤불', desc: '둥글게 다듬은 작은 덤불.', box: { minX: -0.13, maxX: 0.13, minY: -0.09, maxY: 0.03 } },
  // Task 122: opened by the museum's rewards
  { key: 'oreStatue', name: '광석 조각상', desc: '광석을 깎아 만든 작은 광부 조각상.', reward: true, box: { minX: -0.13, maxX: 0.13, minY: -0.09, maxY: 0.03 } },
  { key: 'crystalFountain', name: '수정 분수', desc: '수정이 박힌 작은 분수. 밤에는 은은히 빛난다.', reward: true, light: true, box: { minX: -0.2, maxX: 0.2, minY: -0.1, maxY: 0.03 } },
  { key: 'goldenPick', name: '황금 곡괭이 기념비', desc: '수집을 마친 기념으로 세운 황금 곡괭이.', reward: true, light: true, box: { minX: -0.12, maxX: 0.12, minY: -0.09, maxY: 0.03 } },
];

function villageDecorDef(key){ return VILLAGE.DECOR.find(d => d.key === key) || null; }
function villageDecorList(){ const v = villageState(); return Array.isArray(v.decor) ? v.decor : (v.decor = []); }
function villageGardenCellCount(){ return VILLAGE.GARDEN.COLS * VILLAGE.GARDEN.ROWS; }

// Can this kind be set down? The four basic kinds always; more come with the museum (Task 122).
function villageDecorUnlocked(key){
  const d = villageDecorDef(key);
  if(!d) return false;
  return !d.reward || (typeof villageRewardDecorUnlocked === 'function' && villageRewardDecorUnlocked(key));
}

// The garden's cells in the world: [{ cell, x, y }] (empty before the village has a place).
function villageGardenCells(){
  const parts = villageDistrict(), G = VILLAGE.GARDEN;
  if(!parts) return [];
  const out = [];
  for(let r = 0; r < G.ROWS; r++) for(let c = 0; c < G.COLS; c++){
    out.push({ cell: r * G.COLS + c, x: Math.round((parts.garden.x + (c - (G.COLS - 1) / 2) * G.DX) * 100) / 100, y: Math.round((parts.garden.y + (r - (G.ROWS - 1) / 2) * G.DY) * 100) / 100 });
  }
  return out;
}

function villageDecorAt(cell){ return villageDecorList().findIndex(d => d.cell === cell); }

function villageDecorBox(kind, cell){
  const d = villageDecorDef(kind), at = villageGardenCells()[cell];
  if(!d || !at) return null;
  return { kind: 'decor', id: 'decor' + cell, minX: at.x + d.box.minX, maxX: at.x + d.box.maxX, minY: at.y + d.box.minY, maxY: at.y + d.box.maxY };
}

// Runtime choices (never saved): the kind the next placement uses and the cell being carried (-1: none).
const VILLAGE_GARDEN_UI = { selected: 'flowerPot', carry: -1, panelMove: -1, msg: '' };
function villageGardenUi(){ return VILLAGE_GARDEN_UI; }
function villageDecorDefs(){ return VILLAGE.DECOR; }

function villageDecorSelect(kind){
  if(!villageDecorUnlocked(kind)) return false;
  VILLAGE_GARDEN_UI.selected = kind;
  return true;
}
// The kind after the selected one among those that can be set down; villageDecorCycle selects it
// (Q on a keyboard, the phone's garden button).
function villageDecorNext(){
  const keys = VILLAGE.DECOR.filter(d => villageDecorUnlocked(d.key)).map(d => d.key);
  return keys[(keys.indexOf(villageDecorSelected()) + 1) % keys.length];
}
function villageDecorCycle(){
  VILLAGE_GARDEN_UI.selected = villageDecorNext();
  return VILLAGE_GARDEN_UI.selected;
}
function villageDecorSelected(){
  if(!villageDecorUnlocked(VILLAGE_GARDEN_UI.selected)) VILLAGE_GARDEN_UI.selected = VILLAGE.DECOR[0].key;
  return VILLAGE_GARDEN_UI.selected;
}

// Why `kind` cannot stand on `cell` now (moving: `from` is the cell it leaves), or null when it can.
// `quick` leaves out the reach check (the interaction bubble asks every frame; the action checks fully).
function villageDecorPlaceProblem(kind, cell, from, quick){
  const G = VILLAGE.GARDEN, cells = villageGardenCells();
  if(!cells.length) return '정원 자리가 아직 없어요';
  if(!villageDecorDef(kind)) return '알 수 없는 장식';
  if(!villageDecorUnlocked(kind)) return '아직 해금되지 않은 장식이에요';
  if(!Number.isInteger(cell) || cell < 0 || cell >= cells.length) return '정원 칸이 아니에요';
  const at = villageDecorAt(cell);
  if(at >= 0 && cell !== from) return '이미 장식이 있어요';
  const box = villageDecorBox(kind, cell), here = cells[cell];
  const p = state.world.player, insideHome = typeof villageHomeInside === 'function' && villageHomeInside();
  if(!insideHome && playerFootOverlaps(box, p.x, p.y)) return '서 있는 자리에는 놓을 수 없어요';
  const parts = villageDistrict(), doors = [{ x: state.world.base.x, y: state.world.base.y }, parts.house].concat(VILLAGE.ORDER.map(k => villageState().sites[k]).filter(Boolean));
  if(doors.some(d => Math.hypot(d.x - here.x, d.y - here.y) < G.DOOR_CLEAR)) return '문 앞은 비워 둘게요';
  if(villageRoads().some(r => villageSegPolyDist(r.points, here.x, here.y) < VILLAGE.DISTRICT.ROAD_HALF + G.ROAD_CLEAR)) return '길은 비워 둘게요';
  if((state.world.torches || []).some(t => villageRectDist(box, t.x, t.y) < 0.12)) return '횃불이 있는 칸이에요';
  if(quick) return null;
  // nothing may be cut off round the garden: the house door and every bit of ground near it stay reachable from the plaza
  const g = parts.garden, pz = parts.plaza, h = parts.house, m = 1.2;
  const reach = villageReachArea(Math.min(g.x - g.hw, pz.x - pz.r, h.x - 0.5) - m, Math.min(g.y - g.hh, pz.y - pz.r, h.y - 0.5) - m,
    Math.max(g.x + g.hw, pz.x + pz.r, h.x + 0.5) + m, Math.max(g.y + g.hh, pz.y + pz.r, h.y + 0.5) + m, { x: pz.x, y: pz.y });
  if(!reach([box], [{ x: h.x, y: h.y + 0.1 }])) return '길이 막히는 자리예요';
  return null;
}

function villageDecorPlace(kind, cell){
  if(villageDecorPlaceProblem(kind, cell)) return false;
  villageDecorList().push({ kind, cell });
  villageDecorVersion++;
  return true;
}

// Moves the decoration on `from` to `to` (the same kind). Returns true when it moved.
function villageDecorMove(from, to){
  const list = villageDecorList(), i = villageDecorAt(from);
  if(i < 0) return false;
  if(from === to) return true;
  const kind = list[i].kind;
  // decide without the piece in the way of itself: take it off for the check
  list.splice(i, 1);
  villageDecorVersion++;
  const problem = villageDecorPlaceProblem(kind, to, from);
  list.splice(i, 0, { kind, cell: problem ? from : to });
  villageDecorVersion++;
  return !problem;
}

// Takes the decoration on `cell` back. Returns the kind taken, or null.
function villageDecorRemove(cell){
  const list = villageDecorList(), i = villageDecorAt(cell);
  if(i < 0) return null;
  const kind = list[i].kind;
  list.splice(i, 1);
  villageDecorVersion++;
  if(VILLAGE_GARDEN_UI.carry === cell) VILLAGE_GARDEN_UI.carry = -1;
  if(VILLAGE_GARDEN_UI.panelMove === cell) VILLAGE_GARDEN_UI.panelMove = -1;
  return kind;
}

// The obstacles of the garden (the carried piece does not block while it is held).
function villageDecorObstacles(){
  if(!state || !state.village || !state.village.district || !Array.isArray(state.village.decor)) return [];
  return state.village.decor.filter(d => d.cell !== VILLAGE_GARDEN_UI.carry).map(d => villageDecorBox(d.kind, d.cell)).filter(Boolean);
}

// The garden cell the player is facing, with what E would do there, or null.
//   { type: 'garden', id: cell, x, y, action: 'decorPlace' | 'decorPick' | 'decorDrop' | 'locked', label }
function villageGardenTarget(){
  const parts = villageDistrict(), G = VILLAGE.GARDEN, p = state.world.player;
  if(!parts) return null;
  const g = parts.garden;
  if(Math.abs(p.x - g.x) > g.hw + G.NEAR || Math.abs(p.y - g.y) > g.hh + G.NEAR) return null;
  const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing] || [0, 1];
  const fx = p.x + v[0] * G.AHEAD, fy = p.y + v[1] * G.AHEAD;
  let best = null, bestD = G.CELL_REACH;
  villageGardenCells().forEach(c => { const d = Math.hypot(c.x - fx, c.y - fy); if(d <= bestD){ best = c; bestD = d; } });
  if(!best) return null;
  const t = { type: 'garden', id: best.cell, x: best.x, y: best.y };
  const carry = VILLAGE_GARDEN_UI.carry, here = villageDecorAt(best.cell), list = villageDecorList();
  if(carry >= 0 && villageDecorAt(carry) >= 0){
    const kind = list[villageDecorAt(carry)].kind, name = villageDecorDef(kind).name;
    if(best.cell === carry) return Object.assign(t, { action: 'decorDrop', label: name + ' · 제자리에 두기' });
    const why = villageDecorPlaceProblem(kind, best.cell, carry, true);
    return Object.assign(t, why ? { action: 'locked', label: name + ' · ' + why } : { action: 'decorDrop', label: name + ' · 여기로 옮기기' });
  }
  if(here >= 0) return Object.assign(t, { action: 'decorPick', label: villageDecorDef(list[here].kind).name + ' · 들어 옮기기' });
  const kind = villageDecorSelected(), name = villageDecorDef(kind).name;
  return Object.assign(t, { action: 'decorPlace', label: '정원 · ' + name + ' 놓기' });
}

// ---------------------------------------------------------------------------
// Task 121: minerals and gems for the museum. Besides appraised relics, the
// open museum takes one sample of each mineral and gem the mines yield: a
// fixed amount of that raw resource from the shared store, paid once. The
// sample is the museum's for good — it never goes back to the store, and the
// same kind cannot be donated again. Each kind's first (and only) donation is
// recorded with when it happened (state.village.specimens, additive field,
// saveVersion 1). No gold, no resources back.
// 고대 유물 (the crafting resource) is left out: relics have their own way
// to the museum. 플라즈마 is not a mineral.
// ---------------------------------------------------------------------------
const VILLAGE_SPECIMENS = [
  { key: 'iron', group: 'mineral', qty: 30, desc: '붉은 녹빛이 도는 철광석 표본.' },
  { key: 'coal', group: 'mineral', qty: 30, desc: '결이 고운 석탄 덩어리.' },
  { key: 'mana', group: 'gem', qty: 15, desc: '안쪽에서 보랏빛이 일렁이는 마정석.' },
  { key: 'crystal', group: 'gem', qty: 15, desc: '빛을 받으면 푸르게 갈라지는 결정.' },
  { key: 'rareMetal', group: 'mineral', qty: 8, desc: '은빛으로 반짝이는 희귀 금속 덩이.' },
  { key: 'cosmicShard', group: 'gem', qty: 4, desc: '별빛을 머금은 듯한 우주 파편.' },
];
const VILLAGE_SPECIMEN_KEYS = VILLAGE_SPECIMENS.map(s => s.key);
const VILLAGE_SPECIMEN_GROUPS = { mineral: '광물', gem: '보석' };

function villageSpecimenDef(key){ return VILLAGE_SPECIMENS.find(s => s.key === key) || null; }
function villageSpecimenName(key){ const r = resourceByKey(key); return r ? r.name : key; }
function villageSpecimenList(){ const v = villageState(); return Array.isArray(v.specimens) ? v.specimens : (v.specimens = []); }
function villageSpecimenDonated(key){ return villageSpecimenList().some(s => s.key === key); }

// Why `key` cannot be donated now, or null when it can.
function villageSpecimenBlocker(key){
  if(!villageIsOpen('museum')) return '박물관이 아직 복구되지 않았어요';
  const d = villageSpecimenDef(key);
  if(!d) return '기증할 수 없는 자원이에요';
  if(villageSpecimenDonated(key)) return '이미 기증해 전시 중이에요';
  if(!((state.resources[key] || 0) >= d.qty)) return villageSpecimenName(key) + '이(가) ' + d.qty + '개 필요해요';
  return null;
}

// Donates one sample of `key`: takes exactly its amount from the store, once. Returns true when it went on display.
function villageDonateSpecimen(key){
  if(villageSpecimenBlocker(key)) return false;
  const d = villageSpecimenDef(key), before = villageMuseumCollected();
  state.resources[key] -= d.qty;
  villageSpecimenList().push({ key, at: Date.now() });
  log('박물관 기증: ' + villageSpecimenName(key) + ' 표본 ' + d.qty + '개 (' + VILLAGE_SPECIMEN_GROUPS[d.group] + ' 전시 ' + villageSpecimenList().length + '/' + VILLAGE_SPECIMENS.length + ')');
  villageAnnounceRewards(before); // Task 122
  return true;
}

// ---------------------------------------------------------------------------
// Task 122: the museum's rewards. As the collection grows (relics on display
// plus mineral and gem samples, 18 in all) small rewards open up: new garden
// decorations, a decorated exhibition hall and a small research bonus (a few
// percent off the gold of research; products are paid in full). No gold.
// Rewards are not saved: they follow from what is on display, which can only
// grow, so each comes exactly once and can never be taken twice. A log line
// marks the donation that reaches one.
// ---------------------------------------------------------------------------
const VILLAGE_MUSEUM_REWARDS = [
  { need: 3, type: 'decor', decor: 'oreStatue', name: '장식 해금: 광석 조각상' },
  { need: 6, type: 'research', percent: 3, name: '연구 보너스: 연구 골드 비용 3% 절감' },
  { need: 9, type: 'hall', level: 1, name: '전시실 꾸미기: 깃발과 꽃 화분' },
  { need: 12, type: 'decor', decor: 'crystalFountain', name: '장식 해금: 수정 분수' },
  { need: 15, type: 'research', percent: 5, name: '연구 보너스: 연구 골드 비용 5% 절감' },
  { need: 18, type: 'hall', level: 2, decor: 'goldenPick', name: '전시실 완성: 금빛 장식 · 황금 곡괭이 기념비 해금' },
];

function villageMuseumCollected(){
  const v = state && state.village;
  if(!v) return 0;
  return (Array.isArray(v.donated) ? v.donated.length : 0) + (Array.isArray(v.specimens) ? v.specimens.length : 0);
}
function villageMuseumTotal(){ return VILLAGE_RELICS.length + VILLAGE_SPECIMENS.length; }
function villageRewardsEarned(){ const n = villageMuseumCollected(); return VILLAGE_MUSEUM_REWARDS.filter(r => n >= r.need); }
function villageNextReward(){ const n = villageMuseumCollected(); return VILLAGE_MUSEUM_REWARDS.find(r => n < r.need) || null; }
function villageRewardDecorUnlocked(key){ return villageRewardsEarned().some(r => r.decor === key); }
function villageHallLevel(){ return villageRewardsEarned().reduce((m, r) => r.type === 'hall' ? Math.max(m, r.level) : m, 0); }
// The research bonus: percent off the gold of research (the largest earned, not added up).
function villageResearchDiscountPercent(){ return villageRewardsEarned().reduce((m, r) => r.type === 'research' ? Math.max(m, r.percent) : m, 0); }

// Logs the rewards a donation has just reached (`before`: the collection count before it).
function villageAnnounceRewards(before){
  const now = villageMuseumCollected();
  VILLAGE_MUSEUM_REWARDS.filter(r => r.need > before && r.need <= now).forEach(r => log('박물관 보상 (수집 ' + r.need + '점): ' + r.name));
}

// What walking up to a facility's door offers:
//   { action: 'restore' | 'locked' | 'open', label }
function villageTargetFor(key){
  const f = VILLAGE.FACILITIES[key], name = f.name;
  if(!villageIsOpen(key)){
    if(f.requires && !villageIsOpen(f.requires)) return { action: 'locked', label: name + ' · ' + villageFacilityName(f.requires) + ' 먼저 복구' };
    const step = villageNextStep(key);
    return { action: 'restore', label: name + ' ' + step.name + ' · ' + villageCostText(step.cost) };
  }
  if(key === 'appraiser'){
    const n = villageState().unidentified;
    return n > 0 ? { action: 'appraise', label: name + ' · 유물 감정 (미감정 ' + n + ')' } : { action: 'open', label: name + ' · 감정할 유물 없음' };
  }
  if(key === 'museum'){
    const n = villageDonatable().length, d = villageState().donated.length;
    // Task 121: minerals and gems are donated from the panel (they take resources from the store)
    return n > 0 ? { action: 'donate', label: name + ' · 유물 기증 (' + n + '점)' }
      : { action: 'open', label: name + ' · 전시 ' + d + '/' + VILLAGE_RELICS.length + ' · 광물·보석 ' + villageSpecimenList().length + '/' + VILLAGE_SPECIMENS.length };
  }
  return { action: 'open', label: name };
}
