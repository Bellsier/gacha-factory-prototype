// ---------------------------------------------------------------------------
// Task 109: the hired workers, shown in the top-down world (blueprint 14,
// 24.4 #2). Each worker stands by a vein of the resource it is assigned to and
// swings a pickaxe. This is drawing only: where a worker stands and how it
// moves is worked out from the game state every time and never saved, and the
// workers' output (autoRate) is exactly as before.
//
// Task 110: the workers walk. tdWorkerPlacements() is where each one works;
// the walk there (tdWorkerSimStep) is a small renderer-only simulation: out of
// the workshop door, along a route of a few waypoints (through the tunnel when
// the vein is beyond the mountain), with the same collision as the player
// (worldStepFoot). A worker that cannot get on first steps aside (a detour),
// then for a moment ignores the obstacles (never the rock) — so nobody is ever
// stuck for good. No A*: the world is small and open enough for this. None of
// it is saved, and output is unchanged whether a worker is walking or working.
// ---------------------------------------------------------------------------
const TD_WORKER = {
  SHIRT: { common: '#7d8a5c', rare: '#4d7fd0', epic: '#9a62d8', legend: '#e0a83c' },
  HELMET: ['#e2b23c', '#d0703a', '#c9ccd0', '#6aa0c8'],
  HAIR: ['#5a3b28', '#2b2b2b', '#8a5a2b', '#c9a26a'],
  SKIN: ['#f0c8a0', '#d9a982', '#b98a62'],
  // spots around a vein (world units from its point), tried in order
  SLOTS: [[0.42, 0.08], [-0.42, 0.08], [0.5, 0.48], [-0.5, 0.48], [0.5, -0.32], [-0.5, -0.32], [0, 0.5],
          [0.85, 0.2], [-0.85, 0.2], [0.85, -0.25], [-0.85, -0.25], [0.35, 0.85], [-0.35, 0.85]],
  // where workers without a vein of their resource wait: the workshop yard
  YARD: [[-0.6, 0.55], [0.6, 0.55], [-1.0, 0.3], [1.0, 0.3], [-0.25, 0.9], [0.25, 0.9], [-0.95, 0.85], [0.95, 0.85], [-1.35, 0.6], [1.35, 0.6], [0, 1.3], [-0.6, 1.3], [0.6, 1.3]],
  MIN_GAP: 0.34, // workers stand at least this far apart (a worker is about 0.31 wide)
  // Task 110: walking
  WALK_SPEED: 1.6,   // units a second (the player walks 3)
  SUB_STEP: 0.08,    // longest single collision step
  START_GAP_MS: 450, // workers leave the door one after another
  STUCK_MS: 900,     // no progress for this long = stuck
  PROGRESS: 0.04,    // getting this much closer counts as progress
  DETOUR: 0.45,      // side step taken round something in the way
  GHOST_MS: 1400,    // after two detours: this long ignoring obstacles (not rock)
  MAX_GHOSTS: 3,     // still stuck after that many: set down on the waypoint (never expected)
  LANE: 0.28,        // workers keep to their own lane (+-) through the tunnel
};

function tdWorkerHash(id, salt){
  let h = 2166136261 ^ (salt || 0);
  const s = String(id);
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// The look of one worker: shirt by rarity, the rest varied by its id.
function tdWorkerLook(worker){
  const pick = (list, salt) => list[Math.floor(tdWorkerHash(worker.id, salt) * list.length) % list.length];
  return {
    shirt: TD_WORKER.SHIRT[worker.rarity] || TD_WORKER.SHIRT.common,
    helmet: pick(TD_WORKER.HELMET, 1), hair: pick(TD_WORKER.HAIR, 2), skin: pick(TD_WORKER.SKIN, 3),
    gold: worker.rarity === 'legend',
  };
}

// Where every worker stands right now (same input, same answer).
//   [{ id, x, y, dir: 'left' | 'right', mineId | null, resource, look, phase, cycleMs }]
function tdWorkerPlacements(){
  // cached: the answer only changes when the workers, veins, huts, base or tunnel change
  const w = state.world;
  const key = state.characters.map(c => c && c.id + ':' + c.resource + ':' + c.rarity).join(',') + '|' +
    w.mines.map(m => m && m.id + ':' + m.x + ':' + m.y + ':' + m.developmentState + ':' + (isMineDiscovered(m) ? 1 : 0)).join(',') + '|' +
    w.workshops.map(ws => ws && ws.x + ':' + ws.y).join(',') + '|' + w.base.x + ',' + w.base.y + '|' + (w.tunnelUnlocked ? 1 : 0);
  if(TD.workerKey === key && TD.workerPlacements) return TD.workerPlacements;
  const out = tdComputeWorkerPlacements();
  TD.workerKey = key; TD.workerPlacements = out;
  return out;
}

function tdComputeWorkerPlacements(){
  const out = [], taken = [];
  const base = state.world.base;
  const free = (x, y) => playerCanStand(x, y) && taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) >= TD_WORKER.MIN_GAP);
  const rarityRank = { common: 0, rare: 1, epic: 2, legend: 3 };
  const groups = {};
  state.characters.forEach(c => { if(c) (groups[c.resource] = groups[c.resource] || []).push(c); });
  Object.keys(groups).sort().forEach(res => {
    const discovered = state.world.mines.filter(m => m && m.resource === res && isMineDiscovered(m));
    const secured = discovered.filter(m => m.developmentState === 'secured');
    const byDistance = (a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y) || (a.id < b.id ? -1 : 1);
    const cands = (secured.length ? secured : discovered).slice().sort(byDistance);
    groups[res].forEach((c, k) => {
      let spot = null;
      if(cands.length){
        const mine = cands[k % cands.length], first = Math.floor(k / cands.length);
        for(let i = 0; i < TD_WORKER.SLOTS.length && !spot; i++){
          const [dx, dy] = TD_WORKER.SLOTS[(first + i) % TD_WORKER.SLOTS.length];
          if(free(mine.x + dx, mine.y + dy)) spot = { x: mine.x + dx, y: mine.y + dy, mine };
        }
      }
      if(!spot){
        for(let i = 0; i < TD_WORKER.YARD.length && !spot; i++){
          const [dx, dy] = TD_WORKER.YARD[i];
          if(free(base.x + dx, base.y + dy)) spot = { x: base.x + dx, y: base.y + dy, mine: null };
        }
      }
      if(!spot) spot = { x: base.x, y: base.y + 1.1 + out.length * 0.05, mine: null }; // never happens with the yard sizes above
      taken.push([spot.x, spot.y]);
      out.push({
        id: c.id, x: spot.x, y: spot.y, mineId: spot.mine ? spot.mine.id : null, resource: res,
        dir: spot.mine ? (spot.x > spot.mine.x ? 'left' : 'right') : (tdWorkerHash(c.id, 4) < 0.5 ? 'left' : 'right'),
        look: tdWorkerLook(c), phase: tdWorkerHash(c.id, 5), cycleMs: 1100 - 90 * (rarityRank[c.rarity] || 0),
      });
    });
  });
  return out;
}

// Swing frame (0 raise, 1 overhead, 2 strike, 3 recover); a waiting worker rests on its pickaxe (frame 2, still).
function tdWorkerFrame(placement, nowMs){
  if(!placement.mineId) return 2;
  return Math.floor(((nowMs / placement.cycleMs) + placement.phase) * 4) % 4;
}

// The worker sprite: a miner seen from the side with a pickaxe, 20 x 24, facing right (left is mirrored).
function tdWorkerSprite(dir, frame, look){
  const P = tdPainter(20, 24);
  const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for(let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1, c); };
  const metal = look.gold ? '#e8c050' : '#9aa0a8', metalDark = look.gold ? '#b8902a' : '#6e747c', wood = '#8a6440';
  const bend = frame === 2 ? 1 : 0; // leans into the strike
  P(5, 22, 10, 2, 'rgba(0,0,0,0.25)');
  // legs (a steady stance) and boots
  P(6, 17, 3, 4, '#4a4e58'); P(9, 17, 3, 4, '#3d4049'); P(6, 20, 3, 2, '#5a3b28'); P(9, 20, 4, 2, '#5a3b28');
  // body and head
  P(5, 10 + bend, 7, 7, look.shirt); P(5, 10 + bend, 1, 7, 'rgba(0,0,0,0.18)');
  P(5, 4 + bend, 7, 6, look.skin); P(5, 4 + bend, 4, 5, look.hair); P(10, 7 + bend, 1, 1, '#2a2a2a'); P(12, 7 + bend, 1, 1, look.skin);
  P(4, 2 + bend, 9, 3, look.helmet); P(5, 1 + bend, 7, 1, look.helmet); P(12, 2 + bend, 2, 2, '#fff3b0');
  // arms and pickaxe by frame
  const swing = [
    { hand: [8, 11], tip: [3, 3], head: [[1, 2, 5, 2], [1, 2, 1, 3]] },     // raised behind
    { hand: [10, 9], tip: [11, 0], head: [[8, 0, 6, 2]] },                  // overhead
    { hand: [13, 13], tip: [18, 17], head: [[17, 14, 2, 6]] },              // strike, head down
    { hand: [12, 12], tip: [17, 8], head: [[15, 7, 5, 2]] },                // recover
  ][frame % 4];
  line(swing.hand[0], swing.hand[1], swing.tip[0], swing.tip[1], wood);
  swing.head.forEach(([x, y, w, h]) => { P(x, y, w, h, metal); P(x, y + h - 1, w, 1, metalDark); });
  P(swing.hand[0] - 1, swing.hand[1], 2, 2, look.skin);
  P(7, 11 + bend, 2, 4, 'rgba(0,0,0,0.15)'); // the near arm's shade
  return P.done(dir === 'left');
}

// Baked worker images, cached by look, direction and frame (built on first use;
// frames 'w0'..'w3' are the Task 110 walk).
function tdWorkerImage(look, dir, frame){
  TD.workerImages = TD.workerImages || {};
  const key = [look.shirt, look.helmet, look.hair, look.skin, look.gold ? 1 : 0, dir, frame].join('|');
  if(!(key in TD.workerImages)){
    const walking = typeof frame === 'string' && frame[0] === 'w';
    TD.workerImages[key] = tdSpriteImage(walking ? tdWorkerWalkSprite(dir, +frame.slice(1), look) : tdWorkerSprite(dir, frame, look));
  }
  return TD.workerImages[key];
}

// Each worker's helmet lamp: a small soft light (Task 108 light list), where the worker is now.
function tdWorkerLights(){
  return tdWorkerStates().filter(p => !p.hidden).map(p => ({ kind: 'worker', x: p.x, y: p.y - 0.3, r: 0.75, rgb: [255, 236, 190], strength: 0.45 }));
}

// ---------------------------------------------------------------------------
// Task 110: walking workers
// ---------------------------------------------------------------------------

// Which side of the mountain a point is on: 'east' (the open land) or 'west' (beyond).
function tdWorkerSide(x, y){
  const r = terrainRegionAt(x, y);
  if(r === 'beyond') return 'west';
  if(r === 'tunnel' || r === 'mountain') return x < (terrainTunnel().mouthX + terrainTunnelExit().x) / 2 ? 'west' : 'east';
  return 'east';
}

// The waypoints from (fx, fy) to (tx, ty): straight there on the same side of
// the mountain, or through the tunnel (mouth, far exit) on the worker's lane.
function tdWorkerRoute(fx, fy, tx, ty, lane){
  const goal = { x: tx, y: ty };
  const a = tdWorkerSide(fx, fy), b = tdWorkerSide(tx, ty);
  if(a === b || !terrainTunnelOpen()) return [goal];
  const t = terrainTunnel(), e = terrainTunnelExit(), ly = t.y + (lane || 0);
  const mouth = { x: t.mouthX + 0.6, y: ly }, exit = { x: e.x - 0.6, y: ly };
  const inTunnel = terrainRegionAt(fx, fy) === 'tunnel';
  if(a === 'east') return (inTunnel ? [] : [mouth]).concat([exit, goal]);
  return (inTunnel ? [] : [exit]).concat([mouth, goal]);
}

function tdWorkerSimReset(){ TD.workerSim = { byId: {}, last: null }; }

// The player's feet as a box a walking worker goes round.
function tdWorkerPlayerBox(){
  const p = state.world.player, F = PLAYER_FOOT;
  return { kind: 'player', id: 'player', minX: p.x - F.HALF_W, maxX: p.x + F.HALF_W, minY: p.y - F.HALF_H, maxY: p.y + F.HALF_H };
}

// A side step past whatever is in the way between (s.x, s.y) and the waypoint.
function tdWorkerDetour(s, wp){
  const d = Math.hypot(wp.x - s.x, wp.y - s.y) || 1, ux = (wp.x - s.x) / d, uy = (wp.y - s.y) / d;
  // go round on the side away from the nearest obstacle's centre
  let sideFirst = tdWorkerHash(s.id, 6) < 0.5 ? 1 : -1, best = Infinity;
  worldObstacles(s.x, s.y, 1).concat([tdWorkerPlayerBox()]).forEach(o => {
    const cx = (o.minX + o.maxX) / 2, cy = (o.minY + o.maxY) / 2, dist = Math.hypot(cx - s.x, cy - s.y);
    if(dist < best){ best = dist; const cross = ux * (cy - s.y) - uy * (cx - s.x); sideFirst = cross > 0 ? -1 : 1; }
  });
  for(const k of [1, 1.6, 0.6]){
    for(const sgn of [sideFirst, -sideFirst]){
      const x = s.x - uy * sgn * TD_WORKER.DETOUR * k + ux * 0.15, y = s.y + ux * sgn * TD_WORKER.DETOUR * k + uy * 0.15;
      if(playerCanStand(x, y)) return { x, y, detour: true };
    }
  }
  return null;
}

// Moves the walking workers on by dtMs. Renderer state only (TD.workerSim).
function tdWorkerSimStep(dtMs, nowMs){
  if(!TD.workerSim) tdWorkerSimReset();
  const sim = TD.workerSim, W = TD_WORKER, dt = Math.max(0, Math.min(100, dtMs));
  const placements = tdWorkerPlacements(), base = state.world.base, ids = {};
  let newcomers = 0;
  placements.forEach(p => {
    ids[p.id] = true;
    let s = sim.byId[p.id];
    if(!s){ // a worker (just hired, or the game just opened) comes out of the workshop door
      s = sim.byId[p.id] = { id: p.id, x: base.x + (tdWorkerHash(p.id, 7) - 0.5) * 0.2, y: base.y + 0.08, mode: 'walk', dir: p.dir,
        delay: newcomers++ * W.START_GAP_MS, walked: 0, goalKey: '', route: [], lane: (tdWorkerHash(p.id, 8) * 2 - 1) * W.LANE,
        best: Infinity, stuckMs: 0, detours: 0, ghostMs: 0, ghosts: 0, snaps: 0, hidden: true };
    }
    const key = p.x + ',' + p.y;
    if(s.goalKey !== key){ // a new place to work (or wait): walk there from wherever it is
      s.goalKey = key; s.route = tdWorkerRoute(s.x, s.y, p.x, p.y, s.lane); s.mode = 'walk';
      s.best = Infinity; s.stuckMs = 0; s.detours = 0; s.ghosts = 0;
    }
    if(s.delay > 0){ s.delay -= dt; return; }
    s.hidden = false;
    if(s.mode !== 'walk') return;
    tdWorkerWalk(s, dt);
    if(!s.route.length){ s.mode = p.mineId ? 'work' : 'wait'; s.dir = p.dir; s.x = p.x; s.y = p.y; }
  });
  Object.keys(sim.byId).forEach(id => { if(!ids[id]) delete sim.byId[id]; }); // let go (or reassigned away)
  sim.last = nowMs;
}

function tdWorkerWalk(s, dt){
  const W = TD_WORKER;
  let budget = W.WALK_SPEED * dt / 1000, guard = 0;
  while(budget > 1e-6 && s.route.length && guard++ < 40){
    const wp = s.route[0], d = Math.hypot(wp.x - s.x, wp.y - s.y);
    if(d < 0.02){ s.route.shift(); s.best = Infinity; s.stuckMs = 0; if(!wp.detour){ s.detours = 0; s.ghosts = 0; } continue; }
    const len = Math.min(budget, W.SUB_STEP, d), ux = (wp.x - s.x) / d, uy = (wp.y - s.y) / d;
    const n = worldStepFoot(s.x, s.y, ux, uy, len, s.ghostMs > 0 ? { ignoreObstacles: true } : { extra: [tdWorkerPlayerBox()] });
    const moved = Math.hypot(n.x - s.x, n.y - s.y);
    s.x = n.x; s.y = n.y; s.walked += moved; budget -= len;
    if(Math.abs(ux) > 0.3) s.dir = ux > 0 ? 'right' : 'left'; // turning only on clear sideways moves (no flicker going up or down)
    if(moved < len * 0.3) break; // blocked for now
  }
  if(!s.route.length) return;
  // stuck? first a side step (twice), then a moment ignoring obstacles, finally set down on the waypoint
  const wp = s.route[0], dist = Math.hypot(wp.x - s.x, wp.y - s.y);
  if(dist < s.best - W.PROGRESS){ s.best = dist; s.stuckMs = 0; }
  else s.stuckMs += dt;
  if(s.ghostMs > 0){
    s.ghostMs -= dt;
    if(s.ghostMs <= 0 && worldObstacles(s.x, s.y, 1).some(o => playerFootOverlaps(o, s.x, s.y))) s.ghostMs = 200; // finish getting clear first
  }
  if(s.stuckMs < W.STUCK_MS) return;
  s.stuckMs = 0; s.best = Infinity;
  const det = s.detours < 2 && s.ghostMs <= 0 ? tdWorkerDetour(s, wp) : null;
  if(det){ s.detours++; s.route.unshift(det); return; }
  if(s.ghosts < W.MAX_GHOSTS){ s.ghosts++; s.ghostMs = W.GHOST_MS; return; }
  s.x = wp.x; s.y = wp.y; s.snaps++; // never expected (tests check it does not happen)
}

// What to draw for each worker: where it is now and what it is doing.
//   [{ ...placement, x, y, dir, mode: 'walk' | 'work' | 'wait', walkFrame, hidden }]
function tdWorkerStates(){
  const sim = TD.workerSim;
  return tdWorkerPlacements().map(p => {
    const s = sim && sim.byId[p.id];
    if(!s) return Object.assign({}, p, { mode: p.mineId ? 'work' : 'wait', walkFrame: 0, hidden: false });
    return Object.assign({}, p, { x: s.x, y: s.y, dir: s.dir, mode: s.mode, walkFrame: Math.floor(s.walked / 0.11) % 4, hidden: s.hidden });
  });
}

// A walking worker (pickaxe on the shoulder), 20 x 24 like the swing frames, facing right.
function tdWorkerWalkSprite(dir, frame, look){
  const P = tdPainter(20, 24);
  const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for(let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1, c); };
  const metal = look.gold ? '#e8c050' : '#9aa0a8', metalDark = look.gold ? '#b8902a' : '#6e747c';
  const bob = frame % 2 === 1 ? -1 : 0, f = frame % 4;
  P(5, 22, 10, 2, 'rgba(0,0,0,0.25)');
  // legs: apart, passing, apart the other way, passing
  const legs = [[[4, 17, 3, 4], [10, 17, 3, 4]], [[7, 17, 3, 4], [8, 17, 3, 4]], [[10, 17, 3, 4], [4, 17, 3, 4]], [[8, 17, 3, 4], [7, 17, 3, 4]]][f];
  P(legs[1][0], legs[1][1] + bob, legs[1][2], legs[1][3] - bob, '#3d4049'); P(legs[1][0], 20, 3, 2, '#5a3b28');
  P(legs[0][0], legs[0][1] + bob, legs[0][2], legs[0][3] - bob, '#4a4e58'); P(legs[0][0], 20, 3, 2, '#5a3b28');
  // body and head (as in the swing frames)
  P(5, 10 + bob, 7, 7, look.shirt); P(5, 10 + bob, 1, 7, 'rgba(0,0,0,0.18)');
  P(5, 4 + bob, 7, 6, look.skin); P(5, 4 + bob, 4, 5, look.hair); P(10, 7 + bob, 1, 1, '#2a2a2a'); P(12, 7 + bob, 1, 1, look.skin);
  P(4, 2 + bob, 9, 3, look.helmet); P(5, 1 + bob, 7, 1, look.helmet); P(12, 2 + bob, 2, 2, '#fff3b0');
  // the pickaxe over the shoulder, head behind
  line(9, 13 + bob, 2, 6 + bob, '#8a6440');
  P(0, 4 + bob, 2, 5, metal); P(1, 3 + bob, 3, 2, metal); P(0, 8 + bob, 2, 1, metalDark);
  P(8, 12 + bob, 2, 2, look.skin); // the hand on the handle
  P(7, 11 + bob, 2, 4, 'rgba(0,0,0,0.15)');
  return P.done(dir === 'left');
}
