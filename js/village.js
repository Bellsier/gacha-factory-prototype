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
        { name: '감정소 복구', cost: { gold: 400, products: { steel: 8, coalBrick: 4 } } },
      ],
    },
    museum: {
      name: '박물관',
      box: { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: -0.1 },
      requires: 'appraiser', // the appraiser must be open first
      stages: [
        { name: '잔해 치우기', cost: { gold: 1200 } },
        { name: '박물관 복구', cost: { gold: 3000, products: { steel: 20, ironTool: 5 } } },
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
function villageObstacleBoxes(){
  const v = state && state.village;
  if(!v || !v.sites) return [];
  return VILLAGE.ORDER.filter(k => v.sites[k]).map(k => villageBox(k, v.sites[k].x, v.sites[k].y));
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
  const S = VILLAGE.SITE, base = state.world.base, st = S.GRID;
  const x0 = base.x - S.REACH, y0 = base.y - S.REACH, n = Math.round(2 * S.REACH / st) + 1;
  const can = new Uint8Array(n * n);
  for(let j = 0; j < n; j++) for(let i = 0; i < n; i++) can[j * n + i] = playerCanStand(x0 + i * st, y0 + j * st) ? 1 : 0;
  const cell = (x, y) => { const i = Math.round((x - x0) / st), j = Math.round((y - y0) / st); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  const fill = (blocked) => {
    const seen = new Uint8Array(n * n), start = cell(base.x, base.y + 0.05);
    if(start < 0 || !can[start] || blocked(start)) return seen;
    const q = [start]; seen[start] = 1;
    while(q.length){
      const c = q.pop(), i = c % n;
      for(const d of [i > 0 ? c - 1 : -1, i < n - 1 ? c + 1 : -1, c - n, c + n]){
        if(d < 0 || d >= n * n || seen[d] || !can[d] || blocked(d)) continue;
        seen[d] = 1; q.push(d);
      }
    }
    return seen;
  };
  const before = fill(() => false);
  return (key, x, y, extraBoxes) => {
    const boxes = [villageBox(key, x, y)].concat(extraBoxes || []);
    const hit = (c) => { const px = x0 + (c % n) * st, py = y0 + Math.floor(c / n) * st; return boxes.some(o => playerFootOverlaps(o, px, py)); };
    const after = fill(hit);
    const door = cell(x, y + 0.1);
    if(door < 0 || !after[door]) return false; // the door can be walked to
    for(let c = 0; c < n * n; c++) if(before[c] && !after[c] && !hit(c)) return false; // nothing else is cut off
    return true;
  };
}

// Gives every facility without a site one, once (the result is saved). Returns true if all have one.
let villageSiteFailKey = null; // a search that found no site is not repeated until the world changes

function villageEnsureSites(){
  const v = villageState();
  if(VILLAGE.ORDER.every(k => v.sites[k])) return true;
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
  return ok;
}

// What walking up to a facility's door offers (Task 114: look; later Tasks add the actions).
//   { action: 'open', label }
function villageTargetFor(key){
  const stage = villageStage(key), name = villageFacilityName(key);
  return { action: 'open', label: name + ' (' + VILLAGE.STAGE_NAMES[Math.min(stage, 2)] + ')' };
}
