// ---------------------------------------------------------------------------
// Task 66: fixed world terrain — a mountain range west of the base with a
// locked tunnel. The terrain is part of the world itself (same in every game),
// so it is NOT saved.
//
// Shape (world units, same coordinate system as everything else):
//   - The range runs north–south across the whole world height, so there is
//     no way around it. Its east face is at x = terrainFaceX(y) (a few
//     irregular segments, roughly x -4.5 .. -3.5, i.e. ~6 units west of the
//     new-game base at (2,0)).
//   - Everything west of the face (the range itself and the land beyond it)
//     is not walkable for now: "산 너머" is reserved for later exploration.
//   - The tunnel is a recess cut into the east face around y = TUNNEL.Y. While
//     the tunnel is closed the player can walk into the recess up to the gate;
//     nothing behind it is reachable.
//   - Task 68: once the tunnel is open (state.world.tunnelUnlocked) the gate is
//     gone: the tunnel rows become a passage through the range to the land
//     beyond, and all of "beyond" can be walked. The range itself stays solid.
//     How the tunnel gets opened is a later Task (research); unlockTunnel() in
//     factory.js is the single state change.
//
// Task 67: the world is split into regions (terrainRegionAt):
//   open     — east of the face: the current exploration area
//   tunnel   — the recess plus the passage through the range on the tunnel
//              rows (only the part in front of the gate is walkable for now)
//   mountain — the range itself (face .. face - RANGE_WIDTH)
//   beyond   — the land west of the range ("산 너머"), inside the existing
//              -10..10 bounds. Reached only through the tunnel; closed while
//              the tunnel is locked.
// "Beyond" is divided into environment zones by distance from the tunnel's
// far exit (terrainBeyondZoneAt): deep forest -> rocky ground -> half-dug
// mine -> far rare-vein area. Zones are data only: nothing is placed in them
// yet and walkability is unchanged.
//
// Loaded after balance.js and before worldgen.js / state.js / player.js.
// ---------------------------------------------------------------------------
const WORLD_TERRAIN = {
  // East face of the range, by y band [y0, y1). Covers the whole world height.
  FACE: [
    { y0: -Infinity, y1: -6, x: -4.5 },
    { y0: -6,        y1: -2, x: -4 },
    { y0: -2,        y1: 3,  x: -3.5 },
    { y0: 3,         y1: 7,  x: -4 },
    { y0: 7,         y1: Infinity, x: -4.5 },
  ],
  RANGE_WIDTH: 2.6,     // drawn thickness of the range west of its face
  PLAYER_MARGIN: 0.3,   // the player keeps this far from rock (sprite half-width)
  MINE_MARGIN: 1,       // new-game mines stay at least this far east of the face
  TUNNEL: {
    Y: 1,               // centre of the tunnel mouth
    HALF_WIDTH: 0.8,    // recess spans Y ± HALF_WIDTH
    DEPTH: 1,           // how far the recess cuts into the face
    KEEP_CLEAR: 2,      // new-game mines stay this far from the tunnel mouth
  },
  // Task 67: the land beyond the range. Environment zones, nearest the tunnel
  // exit first, by distance from the exit [previous maxDist, maxDist).
  // `features` name what the zone is dressed with (Task 89: PROPS below places them). No NPCs, combat, dungeons or quests — scenery for
  // exploring and mining only.
  BEYOND: {
    ZONES: [
      { key: 'deepForest',    name: '깊은 산림',            maxDist: 3.5,      features: ['bigTree', 'grass', 'rock', 'clearing'] },
      { key: 'rockyGround',   name: '암석 지대',            maxDist: 6.5,      features: ['rock', 'sparseTree', 'exposedVein'] },
      // key differs from SITES' 'abandonedMine' (the starting site) on purpose
      { key: 'halfDugMine',   name: '개발되다 만 광산',     maxDist: 9,        features: ['oldShaftEntrance', 'timberSupport', 'mineCart', 'diggingMarks', 'undevelopedVein', 'rock'] },
      { key: 'rareDeep',      name: '먼 희귀 광맥 지역',    maxDist: Infinity, features: ['rareVein', 'crystal', 'rock'] },
    ],
    // Task 89: scenery on the land beyond, per zone. Each candidate cell (STEP
    // apart) rolls once against the cumulative `p` of its zone's kinds; MAX caps
    // single-piece landmarks. Purely visual — nothing here blocks walking.
    PROPS: {
      STEP: 0.5,
      CLEAR_EXIT: 1.1,       // nothing stands this close to the tunnel exit
      deepForest:  [{ kind: 'bigTree', p: 0.30 }, { kind: 'grass', p: 0.22 }, { kind: 'rock', p: 0.06 }, { kind: 'clearing', p: 0.03 }],
      rockyGround: [{ kind: 'rock', p: 0.26 }, { kind: 'sparseTree', p: 0.07 }, { kind: 'exposedVein', p: 0.05 }],
      halfDugMine: [{ kind: 'timberSupport', p: 0.08 }, { kind: 'diggingMarks', p: 0.10 }, { kind: 'mineCart', p: 0.03 }, { kind: 'oldShaftEntrance', p: 0.03 }, { kind: 'rock', p: 0.05 }],
      rareDeep:    [{ kind: 'crystal', p: 0.28 }, { kind: 'rock', p: 0.08 }],
      MAX: { mineCart: 2, oldShaftEntrance: 2, clearing: 3 },
      NAMES: { oldShaftEntrance: '버려진 갱도 입구', mineCart: '낡은 광산 수레', timberSupport: '목재 지지대', diggingMarks: '채굴 흔적', exposedVein: '드러난 광맥', crystal: '결정 군락', clearing: '작은 빈터' },
    },
  },
};

// Face x of the solid rock at row y, ignoring the tunnel recess.
function terrainRockFaceX(y){
  const seg = WORLD_TERRAIN.FACE.find(s => y >= s.y0 && y < s.y1);
  return seg ? seg.x : WORLD_TERRAIN.FACE[WORLD_TERRAIN.FACE.length - 1].x;
}

function terrainInTunnelRows(y){
  const t = WORLD_TERRAIN.TUNNEL;
  return Math.abs(y - t.Y) <= t.HALF_WIDTH;
}

// Where walking stops at row y: the rock face, or (inside the tunnel rows)
// the locked gate at the back of the recess.
function terrainFaceX(y){
  const rock = terrainRockFaceX(y);
  return terrainInTunnelRows(y) ? rock - WORLD_TERRAIN.TUNNEL.DEPTH : rock;
}

// Tunnel mouth (on the rock face) and gate (back of the recess) positions.
function terrainTunnel(){
  const t = WORLD_TERRAIN.TUNNEL;
  const faceX = terrainRockFaceX(t.Y);
  return { mouthX: faceX, gateX: faceX - t.DEPTH, y: t.Y, halfWidth: t.HALF_WIDTH, locked: !terrainTunnelOpen() };
}

// Task 67: west (back) edge of the range at row y — where "beyond" starts.
function terrainRangeBackX(y){
  return terrainRockFaceX(y) - WORLD_TERRAIN.RANGE_WIDTH;
}

// Task 67: the tunnel's far exit, on the back edge of the range. The single
// point where "beyond" will connect to the open area once the tunnel opens.
function terrainTunnelExit(){
  const t = WORLD_TERRAIN.TUNNEL;
  return { x: terrainRangeBackX(t.Y), y: t.Y };
}

// Task 67: which part of the world (x, y) belongs to:
//   'outside' | 'open' | 'tunnel' | 'mountain' | 'beyond'.
// Describes the map only — walkability is still isWorldPointWalkable().
function terrainRegionAt(x, y){
  if(!Number.isFinite(x) || !Number.isFinite(y) || !terrainInBounds(x, y)) return 'outside';
  const face = terrainRockFaceX(y);
  if(x >= face) return 'open';
  const back = terrainRangeBackX(y);
  if(x >= back) return terrainInTunnelRows(y) ? 'tunnel' : 'mountain';
  return 'beyond';
}

// Task 67: environment zone of a point beyond the range (null elsewhere),
// by distance from the tunnel exit.
function terrainBeyondZoneAt(x, y){
  if(terrainRegionAt(x, y) !== 'beyond') return null;
  const exit = terrainTunnelExit();
  const d = Math.hypot(x - exit.x, y - exit.y);
  const zone = WORLD_TERRAIN.BEYOND.ZONES.find(z => d < z.maxDist);
  return zone ? zone.key : null;
}

// Task 89: the scenery of the land beyond the range — the same list in every
// game (fixed hash, no saved data). Returns [{kind, x, y, zone, size, name?}].
function terrainBeyondProps(){
  const b = BALANCE.world, cfg = WORLD_TERRAIN.BEYOND.PROPS;
  const exit = terrainTunnelExit();
  const hash = (a, c, s) => { // integer mix of the (half-unit) cell and a salt -> [0,1)
    let h = (Math.round(a * 2) * 374761393 + Math.round(c * 2) * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const props = [], counts = {};
  for(let y = b.BOUNDS_MIN_Y + 0.5; y <= b.BOUNDS_MAX_Y - 0.5; y += cfg.STEP){
    for(let x = b.BOUNDS_MIN_X + 0.4; x <= b.BOUNDS_MAX_X; x += cfg.STEP){
      if(terrainRegionAt(x, y) !== 'beyond') continue;
      const jx = x + (hash(x, y, 1) - 0.5) * 0.4, jy = y + (hash(x, y, 2) - 0.5) * 0.4;
      if(terrainRegionAt(jx, jy) !== 'beyond' || terrainRegionAt(jx - 0.3, jy) !== 'beyond' && jx - 0.3 < b.BOUNDS_MIN_X) continue;
      if(Math.hypot(jx - exit.x, jy - exit.y) < cfg.CLEAR_EXIT) continue;
      const zone = terrainBeyondZoneAt(jx, jy);
      const table = zone && cfg[zone];
      if(!table) continue;
      let roll = hash(x, y, 3), pick = null;
      for(const row of table){ if(roll < row.p){ pick = row.kind; break; } roll -= row.p; }
      if(!pick) continue;
      if(cfg.MAX[pick] !== undefined && (counts[pick] || 0) >= cfg.MAX[pick]) continue;
      counts[pick] = (counts[pick] || 0) + 1;
      props.push({ kind: pick, x: jx, y: jy, zone, size: 0.8 + hash(x, y, 4) * 0.5, name: cfg.NAMES[pick] || null });
    }
  }
  return props;
}

// Task 68: has the tunnel been opened in this game? The terrain itself is
// fixed and never saved, but whether the player has opened the tunnel is
// progress, so it lives in state.world.tunnelUnlocked (saved, additive field;
// missing = closed). Safe to call before `state` exists (script load order).
function terrainTunnelOpen(){
  try{
    return !!(state && state.world && state.world.tunnelUnlocked === true);
  }catch(e){
    return false;
  }
}

function terrainInBounds(x, y){
  const b = BALANCE.world;
  return x >= b.BOUNDS_MIN_X && x <= b.BOUNDS_MAX_X && y >= b.BOUNDS_MIN_Y && y <= b.BOUNDS_MAX_Y;
}

// Can the player stand at (x, y)? Inside the world bounds and either east of
// the face (with the player margin) or, once the tunnel is open, in the tunnel
// passage or on the land beyond the range. The mountain itself is never
// walkable. `tunnelOpen` may be passed explicitly (save loading checks a
// player position against the save's own tunnel state before `state` is
// replaced); when omitted the current game's state is used.
function isWorldPointWalkable(x, y, tunnelOpen){
  if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if(!terrainInBounds(x, y)) return false;
  if(x >= terrainFaceX(y) + WORLD_TERRAIN.PLAYER_MARGIN) return true;
  const open = tunnelOpen === undefined ? terrainTunnelOpen() : tunnelOpen === true;
  if(!open) return false;
  // Open tunnel: the passage rows are walkable all the way through the range
  // and out onto the land beyond; on every other row only the land west of
  // the range's back edge (with the margin) is.
  if(terrainInTunnelRows(y)) return true;
  return x <= terrainRangeBackX(y) - WORLD_TERRAIN.PLAYER_MARGIN;
}

// May a new-game mine be generated on this cell? Clear of the rock (by
// MINE_MARGIN) and of the tunnel mouth, so every generated mine is reachable.
function isCellOpenForMines(x, y){
  if(!terrainInBounds(x, y)) return false;
  if(x < terrainRockFaceX(y) + WORLD_TERRAIN.MINE_MARGIN) return false;
  const t = terrainTunnel();
  return Math.hypot(x - t.mouthX, y - t.y) >= WORLD_TERRAIN.TUNNEL.KEEP_CLEAR;
}

// Task 69: may a mine be generated on this cell of the land beyond? It must
// be beyond the range and clear of the range's back edge by MINE_MARGIN, so it
// can be walked to once the tunnel is open (terrainTunnelExit() is the only way in).
function isCellOpenForBeyondMines(x, y){
  if(!terrainInBounds(x, y)) return false;
  if(terrainRegionAt(x, y) !== 'beyond') return false;
  return x <= terrainRangeBackX(y) - WORLD_TERRAIN.MINE_MARGIN;
}

// Moves along one axis from `from` toward `to` as far as `ok` allows
// (bisection), so the player ends flush against the rock instead of stopping
// a whole step short. Never moves past `to` and never jumps anywhere else.
function terrainAdvance(from, to, ok){
  if(ok(to)) return to;
  if(!ok(from)) return from;
  let lo = 0, hi = 1;
  for(let i = 0; i < 12; i++){
    const mid = (lo + hi) / 2;
    if(ok(from + (to - from) * mid)) lo = mid; else hi = mid;
  }
  return from + (to - from) * lo;
}

// Decorative peaks along the range (fixed, deterministic). Two rows: a front
// row on the face and a taller back row behind it. The front row leaves the
// tunnel mouth open; once the tunnel is open (Task 68) the back row also
// leaves the passage clear so the way through the range can be seen.
function terrainPeaks(tunnelOpen){
  const b = BALANCE.world;
  const open = tunnelOpen === undefined ? terrainTunnelOpen() : tunnelOpen === true;
  const peaks = [];
  for(let y = b.BOUNDS_MIN_Y; y <= b.BOUNDS_MAX_Y; y += 1){
    const face = terrainRockFaceX(y);
    const wobble = Math.sin(y * 1.7) * 0.5 + 0.5;            // 0..1, fixed per row
    if(!(Math.abs(y - WORLD_TERRAIN.TUNNEL.Y) < 1.6)){
      peaks.push({ x: face - 0.7, y, size: 0.75 + wobble * 0.35, row: 'front' });
    }
    const backY = y + 0.5;
    if(open && Math.abs(backY - WORLD_TERRAIN.TUNNEL.Y) < 1.2) continue;
    peaks.push({ x: face - 1.9, y: backY, size: 1 + (1 - wobble) * 0.45, row: 'back' });
  }
  return peaks;
}
