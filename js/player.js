// Task 56: one player avatar in the existing world coordinate space.
// No wandering AI, no collision with mines, no pathfinding.
// Task 66: the mountain range (js/terrain.js) blocks movement — see tickPlayer.
const playerHeld = { up: false, down: false, left: false, right: false };

function playerDirFromKey(key){
  if(key === 'w' || key === 'W' || key === 'ArrowUp') return 'up';
  if(key === 's' || key === 'S' || key === 'ArrowDown') return 'down';
  if(key === 'a' || key === 'A' || key === 'ArrowLeft') return 'left';
  if(key === 'd' || key === 'D' || key === 'ArrowRight') return 'right';
  return null;
}

function setPlayerHeld(dir, down){
  if(!Object.prototype.hasOwnProperty.call(playerHeld, dir)) return false;
  playerHeld[dir] = !!down;
  return true;
}

function clearPlayerHeld(){
  playerHeld.up = false;
  playerHeld.down = false;
  playerHeld.left = false;
  playerHeld.right = false;
}

function clampPlayerPosition(x, y){
  return {
    x: clampPlayerAxis(x, BALANCE.world.BOUNDS_MIN_X, BALANCE.world.BOUNDS_MAX_X),
    y: clampPlayerAxis(y, BALANCE.world.BOUNDS_MIN_Y, BALANCE.world.BOUNDS_MAX_Y),
  };
}

// ---------------------------------------------------------------------------
// Task 107: things standing in the world block the player's feet: mines, the
// workshop (공방) and the craft huts (제작소). Each has a small box on the
// ground (its base, not the whole picture) and the player has a small box at
// the feet, so walking feels tight around them without snagging on roofs or
// tree tops. Boxes are in world units relative to the object's point; y grows
// southwards. Nothing here is saved.
// ---------------------------------------------------------------------------
const PLAYER_FOOT = { HALF_W: 0.09, HALF_H: 0.06 };
const WORLD_OBSTACLE_BOXES = {
  mine:     { minX: -0.14, maxX: 0.14, minY: -0.10, maxY: 0.07 },  // the boulder's base
  base:     { minX: -0.39, maxX: 0.39, minY: -0.44, maxY: -0.10 }, // cabin walls; the door step (the base point) stays free
  workshop: { minX: -0.25, maxX: 0.25, minY: -0.30, maxY: -0.10 }, // hut walls; its point (the door) stays free
};
const CORNER_SLIP = 0.18; // a corner this close is slipped around instead of stopping dead (enough to glide round a vein head-on, not round the cabin)

// ---------------------------------------------------------------------------
// Task 111: the scenery of the land beyond that looks solid blocks too —
// tree trunks, boulders, crystal clusters, the mine cart, timber supports and
// the old shaft entrance — by a small box at its foot. Grass, the clearing,
// digging marks and the low exposed veins stay walkable. The same boxes stop
// the player and the walking workers (worldObstacles).
//
// So that no scenery can wall anything in, the land beyond is flood-filled
// once (a 0.05 grid of foot positions, from the tunnel exit): while some open
// ground cannot be reached, the solid piece that walls it off (touching both
// the cut-off ground and the reached ground) is left out of the world
// altogether — not drawn either, so what is drawn is what blocks. Mines only
// ever remove scenery near them, so they cannot cut anything off.
// Fixed data (the same in every game); nothing is saved.
// ---------------------------------------------------------------------------
const SCENERY_BLOCK_BOXES = {
  bigTree:          { minX: -0.07, maxX: 0.07, minY: -0.10, maxY: 0.02 }, // trunk and its shadow
  sparseTree:       { minX: -0.06, maxX: 0.06, minY: -0.09, maxY: 0.02 },
  rock:             { minX: -0.08, maxX: 0.08, minY: -0.09, maxY: 0.02 },
  crystal:          { minX: -0.08, maxX: 0.08, minY: -0.09, maxY: 0.02 },
  mineCart:         { minX: -0.13, maxX: 0.13, minY: -0.10, maxY: 0.02 },
  timberSupport:    { minX: -0.09, maxX: 0.09, minY: -0.06, maxY: 0.02 },
  oldShaftEntrance: { minX: -0.20, maxX: 0.20, minY: -0.16, maxY: 0.03 },
};
const SCENERY_FILL_STEP = 0.05; // grid of the reachability fill
const SCENERY_MINE_CLEAR = 0.9; // pieces this close to a mine are left out (as drawn since Task 89)

let worldSceneryFixed = null, worldSceneryCache = null;

// The fixed scenery with nothing walled in: [{...prop, box | null}].
function worldSceneryBase(){
  if(worldSceneryFixed) return worldSceneryFixed;
  const F = PLAYER_FOOT;
  const all = terrainBeyondProps().map(pr => {
    const b = SCENERY_BLOCK_BOXES[pr.kind];
    return Object.assign({}, pr, { box: b ? { minX: pr.x + b.minX, maxX: pr.x + b.maxX, minY: pr.y + b.minY, maxY: pr.y + b.maxY } : null });
  });
  // the grid over the land beyond (and the tunnel passage, where the fill starts)
  const B = BALANCE.world, st = SCENERY_FILL_STEP, x0 = B.BOUNDS_MIN_X, y0 = B.BOUNDS_MIN_Y;
  const exit = terrainTunnelExit(), x1 = exit.x + 0.5;
  const nx = Math.floor((x1 - x0) / st) + 1, ny = Math.floor((B.BOUNDS_MAX_Y - y0) / st) + 1;
  const walk = new Uint8Array(nx * ny);
  for(let j = 0; j < ny; j++) for(let i = 0; i < nx; i++) walk[j * nx + i] = isWorldPointWalkable(x0 + i * st, y0 + j * st, true) ? 1 : 0;
  const hits = (o, x, y) => x + F.HALF_W > o.minX && x - F.HALF_W < o.maxX && y + F.HALF_H > o.minY && y - F.HALF_H < o.maxY;
  let solid = all.filter(p => p.box), guard = 0;
  for(;;){
    const blocked = new Uint8Array(nx * ny); // cell -> 1 + index of a blocking piece
    solid.forEach((p, k) => {
      const i0 = Math.max(0, Math.floor((p.box.minX - F.HALF_W - x0) / st)), i1 = Math.min(nx - 1, Math.ceil((p.box.maxX + F.HALF_W - x0) / st));
      const j0 = Math.max(0, Math.floor((p.box.minY - F.HALF_H - y0) / st)), j1 = Math.min(ny - 1, Math.ceil((p.box.maxY + F.HALF_H - y0) / st));
      for(let j = j0; j <= j1; j++) for(let i = i0; i <= i1; i++) if(hits(p.box, x0 + i * st, y0 + j * st)) blocked[j * nx + i] = k + 1;
    });
    const open = (c) => walk[c] && !blocked[c];
    const seen = new Uint8Array(nx * ny), start = Math.round((exit.y - y0) / st) * nx + Math.round((exit.x - 0.3 - x0) / st);
    const q = [start]; seen[start] = 1;
    while(q.length){
      const c = q.pop(), i = c % nx;
      [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, c - nx, c + nx].forEach(d => { if(d >= 0 && d < nx * ny && !seen[d] && open(d)){ seen[d] = 1; q.push(d); } });
    }
    // a cut-off cell next to a piece that also touches the reached ground: leave that piece out
    const score = new Map();
    for(let c = 0; c < nx * ny; c++){
      if(!open(c) || seen[c]) continue;
      const i = c % nx;
      [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, c - nx, c + nx].forEach(d => { if(d >= 0 && d < nx * ny && blocked[d]) score.set(blocked[d] - 1, (score.get(blocked[d] - 1) || 0) + 1); });
    }
    if(!score.size || guard++ > 200) break;
    const touchesReached = (k) => { const p = solid[k].box; for(let x = p.minX - F.HALF_W - st; x <= p.maxX + F.HALF_W + st; x += st) for(let y = p.minY - F.HALF_H - st; y <= p.maxY + F.HALF_H + st; y += st){ const i = Math.round((x - x0) / st), j = Math.round((y - y0) / st); if(i >= 0 && j >= 0 && i < nx && j < ny && seen[j * nx + i]) return true; } return false; };
    const order = [...score.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const drop = order.find(touchesReached);
    solid = solid.filter((p, k) => k !== (drop === undefined ? order[0] : drop));
  }
  const keep = new Set(solid);
  worldSceneryFixed = all.filter(p => !p.box || keep.has(p));
  return worldSceneryFixed;
}

// The scenery of this game: the fixed pieces minus those on a mine, with a
// grid of the solid ones for quick lookups. Cached until the mines change.
function worldScenery(){
  const mines = state.world.mines;
  const c = worldSceneryCache, last = mines[mines.length - 1];
  const key = mines.length + '|' + (mines[0] ? mines[0].x + ',' + mines[0].y : '') + '|' + (last ? last.x + ',' + last.y : '');
  if(c && c.mines === mines && c.key === key) return c;
  const list = mines.filter(m => m);
  const props = worldSceneryBase().filter(pr => !list.some(m => Math.hypot(m.x - pr.x, m.y - pr.y) < SCENERY_MINE_CLEAR));
  const grid = {};
  props.forEach(pr => { if(!pr.box) return; const k = Math.floor(pr.x) + ',' + Math.floor(pr.y); (grid[k] = grid[k] || []).push(pr); });
  worldSceneryCache = { mines, key, props, solid: props.filter(pr => pr.box), grid };
  return worldSceneryCache;
}

// Obstacle boxes in world coordinates, optionally only those near (x, y).
function worldObstacles(nearX, nearY, radius){
  const out = [];
  const add = (kind, id, px, py) => {
    if(radius !== undefined && Math.hypot(px - nearX, py - nearY) > radius + 1) return; // boxes are under 1 unit across
    const b = WORLD_OBSTACLE_BOXES[kind];
    out.push({ kind, id, minX: px + b.minX, maxX: px + b.maxX, minY: py + b.minY, maxY: py + b.maxY });
  };
  const w = state.world;
  w.mines.forEach(m => { if(m) add('mine', m.id, m.x, m.y); });
  if(w.base) add('base', 'base', w.base.x, w.base.y);
  w.workshops.forEach(ws => { if(ws) add('workshop', ws.id, ws.x, ws.y); });
  // Task 114: the village facilities' walls (every stage: ruins block too; the door step stays free)
  if(typeof villageObstacleBoxes === 'function') villageObstacleBoxes().forEach(o => {
    if(radius !== undefined && Math.hypot((o.minX + o.maxX) / 2 - nearX, (o.minY + o.maxY) / 2 - nearY) > radius + 1) return;
    out.push(o);
  });
  // Task 111: solid scenery beyond the mountain (only reachable, and drawn, with the tunnel open)
  if(terrainTunnelOpen()){
    const sc = worldScenery();
    let cands = sc.solid;
    if(radius !== undefined){
      cands = [];
      const r = Math.ceil(radius + 1);
      for(let gy = Math.floor(nearY) - r; gy <= Math.floor(nearY) + r; gy++)
        for(let gx = Math.floor(nearX) - r; gx <= Math.floor(nearX) + r; gx++) (sc.grid[gx + ',' + gy] || []).forEach(pr => cands.push(pr));
    }
    cands.forEach(pr => {
      if(radius !== undefined && Math.hypot(pr.x - nearX, pr.y - nearY) > radius + 1) return;
      out.push({ kind: 'scenery', id: pr.kind + '@' + pr.x.toFixed(2) + ',' + pr.y.toFixed(2), prop: pr.kind, minX: pr.box.minX, maxX: pr.box.maxX, minY: pr.box.minY, maxY: pr.box.maxY });
    });
  }
  return out;
}

function playerFootOverlaps(o, x, y){
  return x + PLAYER_FOOT.HALF_W > o.minX && x - PLAYER_FOOT.HALF_W < o.maxX && y + PLAYER_FOOT.HALF_H > o.minY && y - PLAYER_FOOT.HALF_H < o.maxY;
}

// Could the player stand here? Terrain (Task 66/68) and the obstacles.
function playerCanStand(x, y){
  return isWorldPointWalkable(x, y) && !worldObstacles(x, y, 1).some(o => playerFootOverlaps(o, x, y));
}

function tickPlayer(){
  const player = state.world.player;
  let dx = (playerHeld.right ? 1 : 0) - (playerHeld.left ? 1 : 0);
  let dy = (playerHeld.down ? 1 : 0) - (playerHeld.up ? 1 : 0);
  if(dx === 0 && dy === 0){
    player.pose = 'idle';
    return;
  }
  const len = Math.hypot(dx, dy);
  dx /= len;
  dy /= len;
  const step = BALANCE.world.PLAYER_SPEED / TICKS_PER_SECOND;
  const startX = player.x, startY = player.y;
  const moved = worldStepFoot(startX, startY, dx, dy, step);
  player.x = moved.x;
  player.y = moved.y;
  if(Math.abs(dx) >= Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
  else player.facing = dy > 0 ? 'down' : 'up';
  player.pose = (player.x !== startX || player.y !== startY) ? 'walk' : 'idle';
}

// One step of a pair of feet (the player's, or a worker's in the top-down
// view — Task 110) from (startX, startY) in the unit direction (dx, dy), as far
// as the terrain and the obstacles allow. Returns the new { x, y }.
//   opts.extra           more boxes that block (e.g. the player, for a worker)
//   opts.ignoreObstacles only the terrain blocks (a worker getting unstuck)
function worldStepFoot(startX, startY, dx, dy, step, opts){
  const o2 = opts || {};
  const next = clampPlayerPosition(startX + dx * step, startY + dy * step);
  // Task 66: terrain collision. X and Y are resolved separately, each moving
  // as far toward its target as the rock allows: pushing into the face stops
  // that axis flush against it while the other axis keeps going, so the
  // player slides along the mountain instead of bouncing or teleporting.
  // (If a position is somehow already inside rock, movement is not blocked,
  // so the player can always walk back out.)
  // Task 107: the same for obstacles. An obstacle the player already stands
  // in (an older save, a mine found under the feet) does not block, so the
  // player can always walk out of it.
  const near = o2.ignoreObstacles ? [] : worldObstacles(startX, startY, step + 1).concat(o2.extra || []);
  const blocking = near.filter(o => !playerFootOverlaps(o, startX, startY));
  const free = (x, y) => !blocking.some(o => playerFootOverlaps(o, x, y));
  const terrainOk = isWorldPointWalkable(startX, startY);
  const ok = (x, y) => (!terrainOk || isWorldPointWalkable(x, y)) && free(x, y);
  let x = terrainAdvance(startX, next.x, (tx) => ok(tx, startY));
  let y = terrainAdvance(startY, next.y, (ty) => ok(x, ty));
  // Task 107: corner slip. Walking straight into the very edge of a box stops
  // dead; if a small side step would clear it, take that side step instead,
  // so the player glides around corners.
  const slip = (along, across, alongNext) => {
    for(let d = 0.02; d <= CORNER_SLIP + 1e-9; d += 0.02){
      for(const sgn of [1, -1]){
        const c = across + sgn * d;
        const pt = along === 'x' ? [alongNext, c] : [c, alongNext];
        if(ok(pt[0], pt[1]) && (along === 'x' ? ok(startX, c) : ok(c, startY))) return sgn * Math.min(d, step);
      }
    }
    return 0;
  };
  // Only obstacles are slipped around; the mountain behaves exactly as before (Task 66).
  const terrainAllows = (tx, ty) => !terrainOk || isWorldPointWalkable(tx, ty);
  if(dy === 0 && Math.abs(x - next.x) > 1e-9 && Math.abs(x - startX) < step * 0.5 && terrainAllows(next.x, startY)){
    const s2 = slip('x', startY, next.x);
    if(s2 && ok(x, startY + s2)) y = startY + s2;
  } else if(dx === 0 && Math.abs(y - next.y) > 1e-9 && Math.abs(y - startY) < step * 0.5 && terrainAllows(startX, next.y)){
    const s2 = slip('y', startX, next.y);
    if(s2 && ok(startX + s2, y)) x = startX + s2;
  }
  return { x, y };
}

// ---------------------------------------------------------------------------
// Task 112: torches. The player can set a simple torch down on open ground
// (T, or the torch button on a phone) and pick it up again. A torch is a real
// thing in the world — saved in state.world.torches (additive field,
// saveVersion 1; an older save simply has none) and drawn with its own soft
// light — but it is thin, so it never blocks anyone's way. Free to place,
// up to TORCH.MAX, never on rock, a building, a vein, solid scenery or a
// door step.
// ---------------------------------------------------------------------------
const TORCH = {
  MAX: 12,           // torches in the world at once (also keeps the lighting light on phones)
  AHEAD: 0.4,        // set down this far in front of the player
  PICK_AHEAD: 0.4,   // a torch this close to the spot in front is picked up instead...
  PICK_UNDER: 0.3,   // ...or one this close to the player's feet
  GAP: 0.5,          // torches stand at least this far apart
  MINE_CLEAR: 0.45,  // ...and this far from a vein
  DOOR_CLEAR: 0.35,  // ...and from the workshop's and the huts' doors
  ROOM: 0.06,        // ...and clear of any obstacle box by this much
};

function worldTorches(){ return Array.isArray(state.world.torches) ? state.world.torches : (state.world.torches = []); }

// Where a torch would go right now: just in front of the player.
function torchSpotAhead(){
  const p = state.world.player;
  const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing] || [0, 1];
  return { x: Math.round((p.x + v[0] * TORCH.AHEAD) * 100) / 100, y: Math.round((p.y + v[1] * TORCH.AHEAD) * 100) / 100 };
}

// Why a torch cannot go at (x, y), or null when it can.
function torchPlaceProblem(x, y){
  if(worldTorches().length >= TORCH.MAX) return '횃불은 ' + TORCH.MAX + '개까지 놓을 수 있어요';
  if(!isWorldPointWalkable(x, y)) return '여기에는 놓을 수 없어요';
  if(state.world.mines.some(m => m && Math.hypot(m.x - x, m.y - y) < TORCH.MINE_CLEAR)) return '광맥과 너무 가까워요';
  const w = state.world, doors = [w.base].concat(w.workshops.filter(Boolean));
  if(doors.some(d => Math.hypot(d.x - x, d.y - y) < TORCH.DOOR_CLEAR)) return '문 앞은 비워 둘게요';
  const r = TORCH.ROOM;
  if(worldObstacles(x, y, 1).some(o => x > o.minX - r && x < o.maxX + r && y > o.minY - r && y < o.maxY + r)) return '건물이나 바위에 너무 가까워요';
  if(worldTorches().some(t => Math.hypot(t.x - x, t.y - y) < TORCH.GAP)) return '횃불끼리 너무 가까워요';
  return null;
}

function placeTorch(x, y){
  if(!Number.isFinite(x) || !Number.isFinite(y) || torchPlaceProblem(x, y)) return false;
  worldTorches().push({ x, y });
  return true;
}

// Index of the torch nearest to (x, y) within `range`, or -1.
function nearestTorch(x, y, range){
  let best = -1, bestD = range;
  worldTorches().forEach((t, i) => { const d = Math.hypot(t.x - x, t.y - y); if(d <= bestD){ best = i; bestD = d; } });
  return best;
}

function removeTorch(index){
  const list = worldTorches();
  if(!Number.isInteger(index) || index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  return true;
}

// The torch the player would pick up: the one just in front, else one underfoot (-1 if none).
function torchAtHand(){
  const p = state.world.player, spot = torchSpotAhead();
  const ahead = nearestTorch(spot.x, spot.y, TORCH.PICK_AHEAD);
  return ahead >= 0 ? ahead : nearestTorch(p.x, p.y, TORCH.PICK_UNDER);
}

// The one torch action: pick up the torch at hand, or set one down in front.
//   { ok, action: 'place' | 'remove', text, x, y }
function torchAct(){
  const near = torchAtHand();
  if(near >= 0){
    const t = worldTorches()[near];
    removeTorch(near);
    return { ok: true, action: 'remove', text: '횃불을 거뒀어요', x: t.x, y: t.y };
  }
  const spot = torchSpotAhead();
  const problem = torchPlaceProblem(spot.x, spot.y);
  if(problem) return { ok: false, action: 'place', text: problem, x: spot.x, y: spot.y };
  placeTorch(spot.x, spot.y);
  return { ok: true, action: 'place', text: '횃불을 놓았어요', x: spot.x, y: spot.y };
}
