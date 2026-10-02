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
//   - The tunnel is a recess cut into the east face around y = TUNNEL.Y. The
//     player can walk into the recess up to the gate; the gate is locked, so
//     nothing behind it is reachable. Unlocking is a later Task.
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
    LOCKED: true,       // gate closed — passing through is not possible yet
    KEEP_CLEAR: 2,      // new-game mines stay this far from the tunnel mouth
  },
  // Task 67: the land beyond the range. Environment zones, nearest the tunnel
  // exit first, by distance from the exit [previous maxDist, maxDist).
  // `features` name what the zone will be dressed with later (no objects are
  // created yet). No NPCs, combat, dungeons or quests — scenery for
  // exploring and mining only.
  BEYOND: {
    ZONES: [
      { key: 'deepForest',    name: '깊은 산림',            maxDist: 3.5,      features: ['bigTree', 'grass', 'rock', 'clearing'] },
      { key: 'rockyGround',   name: '암석 지대',            maxDist: 6.5,      features: ['rock', 'sparseTree', 'exposedVein'] },
      // key differs from SITES' 'abandonedMine' (the starting site) on purpose
      { key: 'halfDugMine',   name: '개발되다 만 광산',     maxDist: 9,        features: ['oldShaftEntrance', 'timberSupport', 'mineCart', 'diggingMarks', 'undevelopedVein'] },
      { key: 'rareDeep',      name: '먼 희귀 광맥 지역',    maxDist: Infinity, features: ['rareVein'] },
    ],
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
  return { mouthX: faceX, gateX: faceX - t.DEPTH, y: t.Y, halfWidth: t.HALF_WIDTH, locked: t.LOCKED };
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

// Task 67: "beyond" is open only once the tunnel is (a later Task).
function isBeyondAccessible(){
  return !WORLD_TERRAIN.TUNNEL.LOCKED;
}

function terrainInBounds(x, y){
  const b = BALANCE.world;
  return x >= b.BOUNDS_MIN_X && x <= b.BOUNDS_MAX_X && y >= b.BOUNDS_MIN_Y && y <= b.BOUNDS_MAX_Y;
}

// Can the player stand at (x, y)? Inside the world bounds and east of the
// face (with the player margin). West of the face = mountain / beyond / gate.
function isWorldPointWalkable(x, y){
  if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if(!terrainInBounds(x, y)) return false;
  return x >= terrainFaceX(y) + WORLD_TERRAIN.PLAYER_MARGIN;
}

// May a new-game mine be generated on this cell? Clear of the rock (by
// MINE_MARGIN) and of the tunnel mouth, so every generated mine is reachable.
function isCellOpenForMines(x, y){
  if(!terrainInBounds(x, y)) return false;
  if(x < terrainRockFaceX(y) + WORLD_TERRAIN.MINE_MARGIN) return false;
  const t = terrainTunnel();
  return Math.hypot(x - t.mouthX, y - t.y) >= WORLD_TERRAIN.TUNNEL.KEEP_CLEAR;
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
// tunnel mouth open.
function terrainPeaks(){
  const b = BALANCE.world;
  const peaks = [];
  for(let y = b.BOUNDS_MIN_Y; y <= b.BOUNDS_MAX_Y; y += 1){
    const face = terrainRockFaceX(y);
    const wobble = Math.sin(y * 1.7) * 0.5 + 0.5;            // 0..1, fixed per row
    if(!(Math.abs(y - WORLD_TERRAIN.TUNNEL.Y) < 1.6)){
      peaks.push({ x: face - 0.7, y, size: 0.75 + wobble * 0.35, row: 'front' });
    }
    peaks.push({ x: face - 1.9, y: y + 0.5, size: 1 + (1 - wobble) * 0.45, row: 'back' });
  }
  return peaks;
}
