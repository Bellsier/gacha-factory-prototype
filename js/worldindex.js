// ---------------------------------------------------------------------------
// WORLD_EXPANSION_2048.md step 2: a spatial index by chunk. The obstacle boxes
// (veins, the workshop, craft huts, the village's walls and garden pieces,
// solid scenery), the veins themselves and the scenery props are put in
// 8 x 8-unit buckets — the ground chunks' grid — so a question about one spot
// (can the player stand here? which vein is in reach? what is on screen?)
// looks at the few chunks round it instead of every list in the world.
// Answers are exactly what the full scans gave, in the same order (each entry
// keeps its rank in the old scan). The index is rebuilt when what it was built
// from changes (the vein and hut lists, the base, the village's boxes, the
// scenery, the tunnel); nothing here is saved.
// ---------------------------------------------------------------------------
const WORLD_INDEX = { UNITS: 8, built: null, builds: 0 };

function worldIndexInputs(){
  const w = state.world, open = terrainTunnelOpen();
  return [w.mines, w.mines.length, w.workshops, w.workshops.length, w.base ? w.base.x : null, w.base ? w.base.y : null,
    typeof villageObstacleBoxes === 'function' ? villageObstacleBoxes() : null, open ? worldScenery() : null, open];
}

function worldIndex(){
  const inputs = worldIndexInputs(), c = WORLD_INDEX.built;
  if(c && c.inputs.length === inputs.length && c.inputs.every((v, i) => v === inputs[i])) return c;
  const U = WORLD_INDEX.UNITS, obstacles = new Map(), mines = new Map(), props = new Map();
  const put = (map, x, y, e) => { const k = Math.floor(x / U) + ',' + Math.floor(y / U); let b = map.get(k); if(!b) map.set(k, b = []); b.push(e); };
  const w = state.world, box = (kind, id, px, py) => { const b = WORLD_OBSTACLE_BOXES[kind]; return Object.freeze({ kind, id, minX: px + b.minX, maxX: px + b.maxX, minY: py + b.minY, maxY: py + b.maxY }); };
  // ranks: the order the full scan (worldObstaclesScan) produces them in
  w.mines.forEach((m, i) => { if(!m) return; put(obstacles, m.x, m.y, { rank: i, x: m.x, y: m.y, obj: box('mine', m.id, m.x, m.y) }); put(mines, m.x, m.y, { rank: i, x: m.x, y: m.y, mine: m }); });
  if(w.base) put(obstacles, w.base.x, w.base.y, { rank: 1e10, x: w.base.x, y: w.base.y, obj: box('base', 'base', w.base.x, w.base.y) });
  w.workshops.forEach((ws, i) => { if(ws) put(obstacles, ws.x, ws.y, { rank: 2e10 + i, x: ws.x, y: ws.y, obj: box('workshop', ws.id, ws.x, ws.y) }); });
  (inputs[6] || []).forEach((o, i) => { const x = (o.minX + o.maxX) / 2, y = (o.minY + o.maxY) / 2; put(obstacles, x, y, { rank: 3e10 + i, x, y, obj: o }); });
  if(inputs[7]){
    // solid scenery: the scan walks its 1-unit grid row by row, each cell in its own order
    Object.entries(inputs[7].grid).forEach(([k, list]) => {
      const [gx, gy] = k.split(',').map(Number);
      list.forEach((pr, j) => put(obstacles, pr.x, pr.y, { rank: 4e10 + (gy + 100000) * 1e4 + (gx + 5000) + j / 1000, x: pr.x, y: pr.y,
        obj: Object.freeze({ kind: 'scenery', id: pr.kind + '@' + pr.x.toFixed(2) + ',' + pr.y.toFixed(2), prop: pr.kind, minX: pr.box.minX, maxX: pr.box.maxX, minY: pr.box.minY, maxY: pr.box.maxY }) }));
    });
    inputs[7].props.forEach((pr, i) => put(props, pr.x, pr.y, { rank: i, x: pr.x, y: pr.y, prop: pr }));
  }
  WORLD_INDEX.builds++;
  return (WORLD_INDEX.built = { inputs, obstacles, mines, props });
}

// Entries of one bucket map within `reach` of (x, y) (centre distance), in rank order.
function worldIndexNear(map, x, y, reach){
  const U = WORLD_INDEX.UNITS, out = [];
  for(let cy = Math.floor((y - reach) / U); cy <= Math.floor((y + reach) / U); cy++)
    for(let cx = Math.floor((x - reach) / U); cx <= Math.floor((x + reach) / U); cx++){
      const b = map.get(cx + ',' + cy);
      if(b) b.forEach(e => { if(Math.hypot(e.x - x, e.y - y) <= reach) out.push(e); });
    }
  return out.sort((a, b) => a.rank - b.rank);
}
// Entries of one bucket map inside a world rectangle (by their point), in rank order.
function worldIndexInRect(map, r){
  const U = WORLD_INDEX.UNITS, out = [];
  for(let cy = Math.floor(r.minY / U); cy <= Math.floor(r.maxY / U); cy++)
    for(let cx = Math.floor(r.minX / U); cx <= Math.floor(r.maxX / U); cx++){
      const b = map.get(cx + ',' + cy);
      if(b) b.forEach(e => { if(e.x >= r.minX && e.x <= r.maxX && e.y >= r.minY && e.y <= r.maxY) out.push(e); });
    }
  return out.sort((a, b) => a.rank - b.rank);
}

// The obstacle boxes near (x, y): the same boxes, in the same order, as the full scan with a radius.
function worldObstaclesNear(nearX, nearY, radius){
  return worldIndexNear(worldIndex().obstacles, nearX, nearY, radius + 1).map(e => e.obj);
}
// The veins within `reach` of (x, y), in list order.
function worldMinesNear(x, y, reach){ return worldIndexNear(worldIndex().mines, x, y, reach).map(e => e.mine); }
// The veins and the scenery props inside a world rectangle, in list order (the draw list's view).
function worldMinesInRect(r){ return worldIndexInRect(worldIndex().mines, r).map(e => e.mine); }
function worldSceneryInRect(r){ return worldIndexInRect(worldIndex().props, r).map(e => e.prop); }
