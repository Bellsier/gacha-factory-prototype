// ---------------------------------------------------------------------------
// Task 104: top-down view math (docs/TOPDOWN_TRANSITION.md 3.3-3.4).
// Pure functions only — no DOM, no canvas — so the tests can check them in
// jsdom. Saved world coordinates stay in world units; one world unit is drawn
// as TILES_PER_UNIT tiles of TILE pixels, scaled by an integer zoom so the
// pixel art stays sharp. Nothing here is saved.
// ---------------------------------------------------------------------------
const TOPDOWN = {
  TILE: 16,            // pixels per tile at zoom 1
  TILES_PER_UNIT: 4,   // tiles per world unit
  EDGE_UNITS: 2,       // forest drawn around the world bounds (not walkable)
  ZOOM_SHORT_SIDE_UNITS: 4, // the shorter screen side shows about this many world units
  MAX_ZOOM: 4,
  SNAP_UNITS: 1.5,     // a jump larger than this (load, teleport) is not interpolated
  INTERACT_RANGE: 1.15, // world units from the player to a mine / building to act on it
};
const TD_UNIT_PX = TOPDOWN.TILE * TOPDOWN.TILES_PER_UNIT; // 64 px per world unit at zoom 1

// Largest integer zoom that still shows about ZOOM_SHORT_SIDE_UNITS on the shorter side.
function topdownZoom(viewW, viewH){
  const short = Math.min(viewW, viewH);
  if(!(short > 0)) return 1;
  const z = Math.round(short / (TOPDOWN.ZOOM_SHORT_SIDE_UNITS * TD_UNIT_PX));
  return Math.max(1, Math.min(TOPDOWN.MAX_ZOOM, z));
}

// Screen pixels per world unit at this zoom.
function topdownScale(zoom){ return TD_UNIT_PX * zoom; }

// The world area that can be shown: the bounds plus the forest edge.
function topdownWorldRect(){
  const b = BALANCE.world, e = TOPDOWN.EDGE_UNITS;
  return { minX: b.BOUNDS_MIN_X - e, maxX: b.BOUNDS_MAX_X + e, minY: b.BOUNDS_MIN_Y - e, maxY: b.BOUNDS_MAX_Y + e };
}

// Camera centre (world units) following `target`, stopped so the view never
// shows past the drawn world. A view wider than the world is centred on it.
function topdownCamera(target, viewW, viewH, zoom){
  const r = topdownWorldRect(), s = topdownScale(zoom);
  const halfW = viewW / (2 * s), halfH = viewH / (2 * s);
  const axis = (v, min, max, half) => (max - min <= half * 2) ? (min + max) / 2 : Math.min(max - half, Math.max(min + half, v));
  return { x: axis(target.x, r.minX, r.maxX, halfW), y: axis(target.y, r.minY, r.maxY, halfH) };
}

// World point -> screen pixel (rounded, so sprites land on whole pixels).
function topdownToScreen(wx, wy, cam, viewW, viewH, zoom){
  const s = topdownScale(zoom);
  return { x: Math.round((wx - cam.x) * s + viewW / 2), y: Math.round((wy - cam.y) * s + viewH / 2) };
}
// Screen pixel -> world point.
function topdownToWorld(sx, sy, cam, viewW, viewH, zoom){
  const s = topdownScale(zoom);
  return { x: (sx - viewW / 2) / s + cam.x, y: (sy - viewH / 2) / s + cam.y };
}

// Visible world rectangle for a camera.
function topdownVisibleRect(cam, viewW, viewH, zoom){
  const s = topdownScale(zoom);
  return { minX: cam.x - viewW / (2 * s), maxX: cam.x + viewW / (2 * s), minY: cam.y - viewH / (2 * s), maxY: cam.y + viewH / (2 * s) };
}

// Smooth player position between game ticks (the tick moves the player 10
// times a second; drawing runs at the screen rate). `tracker` is renderer
// state ({}), never saved. Returns the position to draw and how far the
// player has walked (for the walk animation).
function topdownTrack(tracker, x, y, nowMs){
  const t = tracker;
  if(t.cx === undefined){ t.px = t.cx = x; t.py = t.cy = y; t.t0 = nowMs; t.walked = 0; }
  if(x !== t.cx || y !== t.cy){
    const jump = Math.hypot(x - t.cx, y - t.cy);
    if(jump > TOPDOWN.SNAP_UNITS){ t.px = x; t.py = y; }
    else { t.px = t.cx; t.py = t.cy; t.walked += jump; }
    t.cx = x; t.cy = y; t.t0 = nowMs;
  }
  const a = Math.max(0, Math.min(1, (nowMs - t.t0) / TICK_MS));
  const seg = Math.hypot(t.cx - t.px, t.cy - t.py);
  return { x: t.px + (t.cx - t.px) * a, y: t.py + (t.cy - t.py) * a, walked: t.walked - (1 - a) * seg };
}

// Walk cycle frame (0-3) from the distance walked; 0 when standing.
function topdownWalkFrame(walked, pose){
  if(pose !== 'walk') return 0;
  return Math.floor(walked / 0.22) % 4;
}
