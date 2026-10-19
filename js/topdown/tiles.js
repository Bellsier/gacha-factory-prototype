// ---------------------------------------------------------------------------
// Task 104: the ground as a tile map, built from the same terrain data the
// movement code uses (js/terrain.js), so what is drawn as rock is exactly
// what blocks the player. Painted once per terrain state into a pixel buffer
// (no canvas needed, so it is testable) and then drawn as one image.
// Nothing here is saved.
// ---------------------------------------------------------------------------
const TD_TILE = { GRASS: 0, BEYOND: 1, ROCK: 2, TUNNEL: 3, EDGE: 4, PATH: 5, ROAD: 6, PLAZA: 7, GARDEN: 8 }; // Task 118/120: village ground

// Integer hash of a cell and a salt -> [0, 1). Fixed, so the ground looks the same every time.
function tdHash(a, b, salt){
  let h = (a * 374761393 + b * 668265263 + (salt || 0) * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Distance from point p to segment a-b.
function tdSegDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Tile type at a world point (the tile's centre).
// Task 118: `village` (villageGroundLayout(), optional) adds the plaza, the garden and the roads on open ground.
function tdTileAt(x, y, tunnelOpen, base, village){
  if(!terrainInBounds(x, y)) return TD_TILE.EDGE;
  const region = terrainRegionAt(x, y);
  if(region === 'mountain') return TD_TILE.ROCK;
  if(region === 'tunnel'){
    if(tunnelOpen) return TD_TILE.TUNNEL;
    return x >= terrainTunnel().gateX ? TD_TILE.TUNNEL : TD_TILE.ROCK; // closed: only the recess in front of the gate
  }
  if(region === 'beyond') return TD_TILE.BEYOND;
  // open ground: a small yard around the workshop and a dirt road to the tunnel mouth
  if(base){
    const t = terrainTunnel();
    if(village){
      if(Math.hypot(x - village.plaza.x, y - village.plaza.y) <= village.plaza.r) return TD_TILE.PLAZA;
      const gd = village.garden;
      if(gd && Math.abs(x - gd.x) < gd.hw && Math.abs(y - gd.y) < gd.hh) return TD_TILE.GARDEN;
    }
    if(Math.hypot(x - base.x, y - base.y) <= 1.05) return TD_TILE.PATH;
    if(village && village.roads.some(pts => tdPolyDist(pts, x, y) <= village.roadHalf)) return TD_TILE.ROAD;
    if(x >= t.mouthX && tdSegDist(x, y, base.x, base.y, t.mouthX, t.y) <= 0.3) return TD_TILE.PATH;
  }
  return TD_TILE.GRASS;
}

function tdPolyDist(points, x, y){
  let d = Infinity;
  for(let i = 0; i < points.length - 1; i++) d = Math.min(d, tdSegDist(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y));
  return d;
}

// The whole map: one entry per tile over the drawn world (bounds + forest edge).
// The tile map: its size and corner, and the tile types — worked out chunk by
// chunk when first asked for (typeAt), from tdTileAt alone. Nothing walks the
// whole world any more; a 2048-tile world swaps tdTileAt for a per-chunk
// generator (seed, chunk) without touching the painter. `types` (the whole
// map as one array) is still there for the minimap, built on first use.
const TD_TILE_CHUNK = 32; // tiles a side, the ground chunk (8 world units)
function tdBuildTileMap(tunnelOpen, base, village){
  const r = topdownWorldRect(), n = TOPDOWN.TILES_PER_UNIT;
  const cols = Math.round((r.maxX - r.minX) * n), rows = Math.round((r.maxY - r.minY) * n);
  const gi0 = Math.round(r.minX * n), gj0 = Math.round(r.minY * n); // the map's first tile on the world tile grid
  const chunks = new Map(), C = TD_TILE_CHUNK;
  const map = { cols, rows, originX: r.minX, originY: r.minY, tunnelOpen: tunnelOpen === true, village: village || null, chunkTypes: chunks };
  // the types of world chunk (cx, cy) — one tdTileAt call per tile, once
  map.chunk = (cx, cy) => {
    const key = cx * 65536 + cy;
    let t = chunks.get(key);
    if(t) return t;
    t = new Uint8Array(C * C);
    for(let y = 0; y < C; y++) for(let x = 0; x < C; x++){
      const gi = cx * C + x, gj = cy * C + y;
      t[y * C + x] = tdTileAt((gi + 0.5) / n, (gj + 0.5) / n, tunnelOpen, base, village);
    }
    chunks.set(key, t);
    return t;
  };
  map.typeAt = (i, j) => { const gi = i + gi0, gj = j + gj0, cx = Math.floor(gi / C), cy = Math.floor(gj / C); return map.chunk(cx, cy)[(gj - cy * C) * C + (gi - cx * C)]; };
  let all = null;
  Object.defineProperty(map, 'types', { enumerable: true, get(){
    if(all) return all;
    all = new Uint8Array(cols * rows);
    for(let j = 0; j < rows; j++) for(let i = 0; i < cols; i++) all[j * cols + i] = map.typeAt(i, j);
    return all;
  } });
  return map;
}

function tdTileType(map, i, j){
  if(i < 0 || j < 0 || i >= map.cols || j >= map.rows) return TD_TILE.EDGE;
  return map.typeAt ? map.typeAt(i, j) : map.types[j * map.cols + i];
}

// Palette (r, g, b). Soft, slightly muted colours for a calm mood.
const TD_COLORS = {
  grass: [[78, 122, 70], [84, 130, 74], [72, 114, 66], [92, 140, 80]],
  tuft: [107, 155, 85], flower: [[232, 211, 138], [217, 138, 160], [168, 196, 232], [240, 240, 228]],
  beyond: [[58, 96, 62], [63, 103, 66], [53, 89, 58], [70, 110, 70]], leaf: [[150, 110, 60], [120, 140, 70]],
  rock: [[110, 105, 98], [102, 97, 91], [118, 113, 106], [95, 90, 85]], crack: [80, 76, 72], rim: [140, 134, 126], face: [66, 62, 58],
  tunnel: [[86, 72, 58], [80, 67, 54], [92, 78, 62]], plank: [120, 92, 60], beam: [96, 70, 44],
  path: [[150, 122, 86], [143, 116, 81], [158, 129, 92]], pebble: [176, 152, 116],
  edge: [[38, 66, 44], [44, 74, 48], [33, 58, 39]], canopy: [56, 92, 58], trunk: [60, 44, 32],
  // Task 118/120: the village's cobbled roads, the paved plaza and the garden lawn
  road: [[164, 150, 128], [156, 142, 120], [172, 158, 136]], joint: [126, 114, 98],
  plaza: [[190, 178, 156], [182, 170, 148], [196, 186, 166]], slab: [150, 138, 118], plazaRim: [128, 116, 98],
  garden: [[96, 146, 80], [102, 152, 84], [90, 138, 76]], soil: [112, 88, 62],
};

const TD_WALKABLE_TYPES = [TD_TILE.GRASS, TD_TILE.BEYOND, TD_TILE.TUNNEL, TD_TILE.PATH, TD_TILE.ROAD, TD_TILE.PLAZA, TD_TILE.GARDEN];

// Paints the map into an RGBA buffer (TILE x TILE pixels per tile). Returns
// { width, height, data } — the renderer puts it on a canvas once.
// `area` ({ i0, j0, i1, j1 }, tiles; default the whole map) paints only that
// part — one chunk of the ground (chunk rendering). Pixels are addressed in
// whole-map coordinates and every texture is hashed from them, so painting a
// chunk gives exactly the pixels the whole-map painting has there: tiles one
// tile round the area are painted too (in the same order), because a tile's
// tufts, flowers and boulders reach a few pixels into its neighbours.
function tdPaintTileMap(map, area){
  const T = TOPDOWN.TILE, A = area || { i0: 0, j0: 0, i1: map.cols, j1: map.rows };
  const W = (A.i1 - A.i0) * T, H = (A.j1 - A.j0) * T, ox = A.i0 * T, oy = A.j0 * T, MW = map.cols * T, MH = map.rows * T;
  const data = new Uint8ClampedArray(W * H * 4);
  const put = (gx, gy, c, a) => {
    const x = gx - ox, y = gy - oy;
    if(x < 0 || y < 0 || x >= W || y >= H || gx >= MW || gy >= MH) return;
    const o = (y * W + x) * 4, al = a === undefined ? 1 : a;
    data[o] = data[o] * (1 - al) + c[0] * al; data[o + 1] = data[o + 1] * (1 - al) + c[1] * al; data[o + 2] = data[o + 2] * (1 - al) + c[2] * al; data[o + 3] = 255;
  };
  const pick = (list, h) => list[Math.floor(h * list.length) % list.length];
  const v2 = typeof tdStyleV2 === 'function' && tdStyleV2();
  const ti0 = Math.max(0, A.i0 - 1), tj0 = Math.max(0, A.j0 - 1), ti1 = Math.min(map.cols, A.i1 + 1), tj1 = Math.min(map.rows, A.j1 + 1);
  for(let j = tj0; j < tj1; j++){
    for(let i = ti0; i < ti1; i++){
      const type = tdTileType(map, i, j);
      const x0 = i * T, y0 = j * T;
      // base texture: small noise on 2x2 pixel blocks, so it reads as pixel art when zoomed
      // Task 118: road and plaza tiles are grass underneath; their exact shapes are painted over them below
      const pal = type === TD_TILE.GRASS || type === TD_TILE.ROAD || type === TD_TILE.PLAZA ? TD_COLORS.grass : type === TD_TILE.BEYOND ? TD_COLORS.beyond : type === TD_TILE.ROCK ? TD_COLORS.rock :
        type === TD_TILE.TUNNEL ? TD_COLORS.tunnel : type === TD_TILE.PATH ? TD_COLORS.path : type === TD_TILE.ROAD ? TD_COLORS.road :
        type === TD_TILE.PLAZA ? TD_COLORS.plaza : type === TD_TILE.GARDEN ? TD_COLORS.garden : TD_COLORS.edge;
      for(let y = 0; y < T; y += 2){
        for(let x = 0; x < T; x += 2){
          const h = tdHash(x0 + x, y0 + y, 7);
          const c = h < 0.8 ? pal[0] : pick(pal, (h - 0.8) * 5);
          put(x0 + x, y0 + y, c); put(x0 + x + 1, y0 + y, c); put(x0 + x, y0 + y + 1, c); put(x0 + x + 1, y0 + y + 1, c);
        }
      }
      const h1 = tdHash(i, j, 1), h2 = tdHash(i, j, 2), h3 = tdHash(i, j, 3);
      if(v2 && (type === TD_TILE.GRASS || type === TD_TILE.ROAD || type === TD_TILE.PLAZA)){
        tdPaintGrassV2(put, x0, y0, i, j); // the style experiment's grass (roads and the plaza are grass underneath)
      } else if(type === TD_TILE.GRASS){
        if(h1 < 0.22){ const tx = x0 + 3 + Math.floor(h2 * 9), ty = y0 + 4 + Math.floor(h3 * 8); put(tx, ty, TD_COLORS.tuft); put(tx + 2, ty, TD_COLORS.tuft); put(tx + 1, ty - 1, TD_COLORS.tuft); put(tx + 1, ty, TD_COLORS.tuft); }
        if(h1 > 0.955){ const fx = x0 + 4 + Math.floor(h2 * 8), fy = y0 + 4 + Math.floor(h3 * 8), fc = pick(TD_COLORS.flower, h3); put(fx, fy, fc); put(fx + 1, fy, fc); put(fx, fy + 1, fc); put(fx + 1, fy + 1, [244, 226, 120]); }
      } else if(type === TD_TILE.BEYOND){
        if(h1 < 0.18){ const lx = x0 + 2 + Math.floor(h2 * 11), ly = y0 + 2 + Math.floor(h3 * 11), lc = pick(TD_COLORS.leaf, h2); put(lx, ly, lc); put(lx + 1, ly, lc); }
        if(h1 > 0.8){ const tx = x0 + 5 + Math.floor(h2 * 6), ty = y0 + 6 + Math.floor(h3 * 6); put(tx, ty, TD_COLORS.tuft); put(tx + 1, ty - 1, TD_COLORS.tuft); put(tx + 2, ty, TD_COLORS.tuft); }
      } else if(type === TD_TILE.ROCK){
        // boulders give the range some relief: lit top-left, shadowed bottom-right
        if(h3 < 0.42){
          const bx = x0 + 4 + Math.floor(h1 * 8), by = y0 + 4 + Math.floor(h2 * 8), br = 3 + Math.floor(h3 * 8);
          for(let y = -br; y <= br; y++) for(let x = -br; x <= br; x++){
            const d = x * x + y * y; if(d > br * br) continue;
            put(bx + x, by + y, (x + y) < -br * 0.5 ? TD_COLORS.rim : (x + y) > br * 0.7 ? TD_COLORS.face : TD_COLORS.rock[2], 0.85);
          }
        }
        if(h1 < 0.35){ const cx = x0 + 2 + Math.floor(h2 * 10), cy = y0 + 2 + Math.floor(h3 * 10); for(let k = 0; k < 4; k++) put(cx + k, cy + (k > 1 ? 1 : 0), TD_COLORS.crack); }
        if(h1 > 0.7){ const rx = x0 + 3 + Math.floor(h3 * 8), ry = y0 + 3 + Math.floor(h2 * 8); put(rx, ry, TD_COLORS.rim); put(rx + 1, ry, TD_COLORS.rim); }
      } else if(type === TD_TILE.TUNNEL){
        if(j % 2 === 0) for(let x = 0; x < T; x++) put(x0 + x, y0 + 8, TD_COLORS.plank, 0.35);
      } else if(type === TD_TILE.PATH){
        if(h1 < 0.4){ const px = x0 + 2 + Math.floor(h2 * 12), py = y0 + 2 + Math.floor(h3 * 12); put(px, py, TD_COLORS.pebble); }
        // ragged edge where the dirt meets grass, so the yard and the road are not hard squares
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
          if(tdTileType(map, i + di, j + dj) !== TD_TILE.GRASS) return;
          for(let k = 0; k < T; k += 2){
            const depth = 1 + Math.floor(tdHash(x0 + k, y0 + k, 11 + di * 3 + dj) * 5);
            for(let d = 0; d < depth; d += 2){
              const ex = di === 1 ? x0 + T - 2 - d : di === -1 ? x0 + d : x0 + k, ey = dj === 1 ? y0 + T - 2 - d : dj === -1 ? y0 + d : y0 + k;
              const g = TD_COLORS.grass[0]; put(ex, ey, g); put(ex + 1, ey, g); put(ex, ey + 1, g); put(ex + 1, ey + 1, g);
            }
          }
        });
      } else if(type === TD_TILE.GARDEN){
        // Task 120: a tended lawn with small flowers, edged with a row of stones
        if(h1 < 0.35){ const fx = x0 + 3 + Math.floor(h2 * 10), fy = y0 + 3 + Math.floor(h3 * 10), fc = pick(TD_COLORS.flower, h3); put(fx, fy, fc); put(fx + 1, fy, fc); }
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
          if(tdTileType(map, i + di, j + dj) === TD_TILE.GARDEN) return;
          for(let k = 0; k < T; k += 3){
            const ex = di === 1 ? x0 + T - 2 : di === -1 ? x0 : x0 + k, ey = dj === 1 ? y0 + T - 2 : dj === -1 ? y0 : y0 + k;
            put(ex, ey, TD_COLORS.rim); put(ex + 1, ey, TD_COLORS.rim); put(ex, ey + 1, TD_COLORS.crack); put(ex + 1, ey + 1, TD_COLORS.crack);
          }
        });
      } else if(type === TD_TILE.EDGE){
        // dense forest canopy around the world
        if(h1 < 0.7){ const cx = x0 + 8 + Math.floor((h2 - 0.5) * 8), cy = y0 + 8 + Math.floor((h3 - 0.5) * 8), rr = 5 + Math.floor(h1 * 5);
          for(let y = -rr; y <= rr; y++) for(let x = -rr; x <= rr; x++) if(x * x + y * y <= rr * rr) put(cx + x, cy + y, (x + y < -rr / 2) ? [70, 108, 70] : TD_COLORS.canopy, 0.9); }
      }
      // edges between rock and walkable ground: a lit rim on the rock and a shadow on the ground
      if(type === TD_TILE.ROCK){
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        nb.forEach(([di, dj]) => {
          const n = tdTileType(map, i + di, j + dj);
          if(!TD_WALKABLE_TYPES.includes(n)) return;
          for(let k = 0; k < T; k++){
            const ex = di === 1 ? x0 + T - 1 : di === -1 ? x0 : x0 + k, ey = dj === 1 ? y0 + T - 1 : dj === -1 ? y0 : y0 + k;
            if(dj === 1){ put(ex, ey, TD_COLORS.face); put(ex, ey - 1, TD_COLORS.face); put(ex, ey - 2, TD_COLORS.face, 0.6); }
            else if(di !== 0){ put(ex, ey, TD_COLORS.face); put(ex - di, ey, TD_COLORS.rim, 0.6); }
            else put(ex, ey, TD_COLORS.rim);
          }
        });
      } else if(TD_WALKABLE_TYPES.includes(type)){
        if(tdTileType(map, i - 1, j) === TD_TILE.ROCK) for(let y = 0; y < T; y++) for(let x = 0; x < 4; x++) put(x0 + x, y0 + y, [0, 0, 0], 0.22 - x * 0.05);
        if(tdTileType(map, i + 1, j) === TD_TILE.ROCK) for(let y = 0; y < T; y++) for(let x = 0; x < 3; x++) put(x0 + T - 1 - x, y0 + y, [0, 0, 0], 0.16 - x * 0.05);
        if(tdTileType(map, i, j - 1) === TD_TILE.ROCK) for(let x = 0; x < T; x++) for(let y = 0; y < 4; y++) put(x0 + x, y0 + y, [0, 0, 0], 0.24 - y * 0.06);
        if(type === TD_TILE.TUNNEL && (tdTileType(map, i, j - 1) === TD_TILE.ROCK || tdTileType(map, i, j + 1) === TD_TILE.ROCK) && i % 3 === 0){
          for(let y = 0; y < T; y++){ put(x0 + 6, y0 + y, TD_COLORS.beam); put(x0 + 7, y0 + y, TD_COLORS.beam); }
        }
      }
    }
  }
  if(map.village) tdPaintVillageGround(map, put, MW, MH, { x0: ox, y0: oy, x1: Math.min(MW, ox + W) - 1, y1: Math.min(MH, oy + H) - 1 });
  if(!map.tunnelOpen){
    for(let j = A.j0; j < A.j1; j++) for(let i = A.i0; i < A.i1; i++){
      if(tdTileType(map, i, j) !== TD_TILE.BEYOND) continue;
      for(let y = 0; y < T; y++) for(let x = 0; x < T; x++) put(i * T + x, j * T + y, [14, 20, 18], 0.62);
    }
  }
  return { width: W, height: H, data };
}

// Task 118: the roads and the plaza, painted pixel by pixel from their real
// shapes (smooth diagonals, a round plaza) over the grass of their tiles.
// Roads first (cobbles in staggered rows, a ragged edge), then the plaza
// (slabs, a darker rim and a ring round its centre). The workshop yard keeps
// its dirt. Pure: pixels only, from the same plain data as the tile types.
// `clip` ({ x0, y0, x1, y1 }, whole-map pixels, optional): only those pixels are wanted (a chunk or a strip of one),
// so the loops stay inside it — what `put` keeps is the same, the work is only for the area.
function tdPaintVillageGround(map, put, W, H, clip){
  const C = clip || { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  const V = map.village, U = TOPDOWN.TILE * TOPDOWN.TILES_PER_UNIT;
  const toPx = (x, y) => [(x - map.originX) * U, (y - map.originY) * U];
  const base = state && state.world ? state.world.base : null, yardR = 1.0 * U, [bx, by] = base ? toPx(base.x, base.y) : [-1e9, -1e9];
  const hw = V.roadHalf * U;
  const v2 = typeof tdStyleV2 === 'function' && tdStyleV2();
  // v2: is (x, y) inside any road (so the shadow ring of one segment never darkens another)?
  const segs = []; V.roads.forEach(pts => { for(let k = 0; k < pts.length - 1; k++) segs.push([...toPx(pts[k].x, pts[k].y), ...toPx(pts[k + 1].x, pts[k + 1].y)]); });
  const onRoad = (x, y) => segs.some(([ax, ay, cx, cy]) => tdSegDist(x + 0.5, y + 0.5, ax, ay, cx, cy) <= hw);
  V.roads.forEach(pts => {
    for(let k = 0; k < pts.length - 1; k++){
      const [ax, ay] = toPx(pts[k].x, pts[k].y), [cx, cy] = toPx(pts[k + 1].x, pts[k + 1].y);
      const minX = Math.max(C.x0, Math.floor(Math.min(ax, cx) - hw - 2)), maxX = Math.min(C.x1, W - 1, Math.ceil(Math.max(ax, cx) + hw + 2));
      const minY = Math.max(C.y0, Math.floor(Math.min(ay, cy) - hw - 2)), maxY = Math.min(C.y1, H - 1, Math.ceil(Math.max(ay, cy) + hw + 2));
      for(let y = minY; y <= maxY; y++){
        for(let x = minX; x <= maxX; x++){
          const d = tdSegDist(x + 0.5, y + 0.5, ax, ay, cx, cy);
          if(v2){ // the style experiment's cobbles, and a one-pixel shadow sinking them into the grass
            if(Math.hypot(x + 0.5 - bx, y + 0.5 - by) < yardR || d > hw + 1) continue;
            if(d > hw){ if(!onRoad(x, y)) put(x, y, TD_SHADE_RGB, 0.18); continue; }
            const c = tdRoadPixelV2(x, y, d, hw); if(c) put(x, y, c); else if(!onRoad(x, y)) put(x, y, TD_SHADE_RGB, 0.18);
            continue;
          }
          if(d > hw || Math.hypot(x + 0.5 - bx, y + 0.5 - by) < yardR) continue;
          if(d > hw - 2 && tdHash(x, y, 41) < 0.45) continue; // a ragged edge into the grass
          const row = Math.floor(y / 5), col = Math.floor((x + (row % 2) * 3) / 7);
          const joint = y % 5 === 0 || (x + (row % 2) * 3) % 7 === 0;
          const c = joint ? TD_COLORS.joint : TD_COLORS.road[Math.floor(tdHash(col, row, 43) * TD_COLORS.road.length)];
          put(x, y, c, d > hw - 2 ? 0.75 : 1);
        }
      }
    }
  });
  const pz = V.plaza, [cx, cy] = toPx(pz.x, pz.y), r = pz.r * U;
  for(let y = Math.max(C.y0, Math.floor(cy - r - 1)); y <= Math.min(C.y1, H - 1, Math.ceil(cy + r + 1)); y++){
    for(let x = Math.max(C.x0, Math.floor(cx - r - 1)); x <= Math.min(C.x1, W - 1, Math.ceil(cx + r + 1)); x++){
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if(d > r) continue;
      const rx = x - Math.floor(cx), ry = y - Math.floor(cy);
      const row = Math.floor((ry + 1000) / 8), off = (row % 2) * 4;
      const joint = (ry + 1000) % 8 === 0 || (rx + 1000 + off) % 8 === 0;
      let c = joint ? TD_COLORS.slab : TD_COLORS.plaza[Math.floor(tdHash(Math.floor((rx + 1000 + off) / 8), row, 47) * TD_COLORS.plaza.length)];
      if(d > r - 3) c = TD_COLORS.plazaRim;
      else if(Math.abs(d - r * 0.3) < 1.5) c = TD_COLORS.plazaRim; // a ring round the centre
      else if(!joint && tdHash(x, y, 49) < 0.004) c = TD_COLORS.grass[3]; // moss
      put(x, y, c);
    }
  }
}
