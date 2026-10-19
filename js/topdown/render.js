// ---------------------------------------------------------------------------
// Task 104/105: the top-down renderer. It only READS the game state (state,
// permanent, terrain) and draws it; every change goes through the game's own
// functions. Drawing runs on requestAnimationFrame, separate from the 100 ms
// game tick, and smooths the player between ticks. Renderer state (camera,
// caches, animation) lives in TD and is never saved.
// ---------------------------------------------------------------------------
const TD = {
  canvas: null, ctx: null, sheet: null,
  ground: null, groundKey: '', mini: null, miniBase: null,
  tracker: {}, floats: [], target: null,
  view: { w: 0, h: 0, zoom: 1, dpr: 1 }, cam: { x: 0, y: 0 },
  running: false,
  quality: 0, // Task 108: 0 full, 1 reduced, 2 low (see tdQualityFor)
};

// Everything that stands in the world this frame, sorted back to front (by y).
// Plain data, so it can be checked without a canvas.
function tdDrawList(player){
  const list = [];
  const base = state.world.base;
  // Task 107: buildings sort by the front edge of their footprint, so the player
  // standing against a wall (just above the door point) is drawn in front of it.
  const front = (kind) => (typeof WORLD_OBSTACLE_BOXES !== 'undefined' ? WORLD_OBSTACLE_BOXES[kind].maxY : 0);
  list.push({ kind: 'base', x: base.x, y: base.y, sortY: base.y + front('base') });
  list.push({ kind: 'prop', prop: 'lamp', x: base.x + 0.62, y: base.y + 0.02, sortY: base.y + 0.02, light: true });
  state.world.workshops.forEach(w => { if(w) list.push({ kind: 'workshop', id: w.id, tier: workshopTier(w.level), x: w.x, y: w.y, sortY: w.y + front('workshop') }); });
  // Task 114: the village facilities (sorted by the front of their walls, like the huts)
  if(typeof VILLAGE !== 'undefined' && state.village && state.village.sites){
    VILLAGE.ORDER.forEach(k => {
      const site = state.village.sites[k];
      if(!site) return;
      list.push({ kind: 'village', id: k, stage: Math.min(2, state.village.stage[k] || 0), exhibits: Math.ceil((state.village.donated || []).length / 2),
        specimens: k === 'museum' ? (state.village.specimens || []).map(sp => sp.key) : [], // Task 121
        hall: k === 'museum' && typeof villageHallLevel === 'function' ? villageHallLevel() : 0, // Task 122
        x: site.x, y: site.y, sortY: site.y + VILLAGE.FACILITIES[k].box.maxY });
    });
  }
  // Task 118: the plaza's notice board and its two lamp posts (thin: they block nothing)
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(vd){
    const pz = vd.plaza;
    list.push({ kind: 'plazaProp', prop: 'villageBoard', x: pz.x, y: pz.y - 0.15, sortY: pz.y - 0.15 });
    [-1, 1].forEach(sx => list.push({ kind: 'plazaProp', prop: 'lamp', x: pz.x + sx * 0.72, y: pz.y + 0.5, sortY: pz.y + 0.5 }));
    // Task 119: the player's house (sorted by the front of its walls)
    list.push({ kind: 'house', x: vd.house.x, y: vd.house.y, sortY: vd.house.y + VILLAGE.DISTRICT.HOUSE_BOX.maxY });
    // Task 120: the garden's decorations; the one being carried is held over the player's head
    const cells = villageGardenCells(), carry = VILLAGE_GARDEN_UI.carry;
    villageDecorList().forEach(d => {
      const c = cells[d.cell];
      if(!c) return;
      if(d.cell === carry && player) list.push({ kind: 'gardenDecor', key: d.kind, carried: true, x: player.x, y: player.y, sortY: player.y + 0.002 });
      else if(d.cell !== carry) list.push({ kind: 'gardenDecor', key: d.kind, x: c.x, y: c.y, sortY: c.y });
    });
  }
  state.world.mines.forEach(m => {
    if(!m) return;
    const look = !isMineDiscovered(m) ? 'undiscovered' : m.developmentState === 'secured' ? 'secured' : 'unsecured';
    list.push({ kind: 'ore', id: m.id, resource: m.resource, look, x: m.x, y: m.y, sortY: m.y });
  });
  tdOpenLandTufts().forEach(t => list.push({ kind: 'decor', prop: 'grass', x: t.x, y: t.y, sortY: t.y - 0.2 }));
  if(terrainTunnelOpen()){
    // Task 111: the same pieces that block (worldScenery leaves out those on a mine or walling something in)
    worldScenery().props.forEach(pr => {
      list.push({ kind: 'prop', prop: pr.kind, x: pr.x, y: pr.y, sortY: pr.kind === 'clearing' ? pr.y - 5 : pr.y });
    });
  } else {
    const t = terrainTunnel();
    list.push({ kind: 'gate', x: t.gateX, y: t.y + t.halfWidth, sortY: t.y + t.halfWidth - 0.01 });
  }
  // Task 112: torches the player has set down
  (state.world.torches || []).forEach((t, i) => list.push({ kind: 'torch', x: t.x, y: t.y, sortY: t.y, seed: i * 1.7 + t.x * 3.1 }));
  if(typeof tdWorkerStates === 'function') tdWorkerStates().forEach(wk => { if(!wk.hidden) list.push(Object.assign({ kind: 'worker', sortY: wk.y }, wk)); });
  if(player) list.push({ kind: 'player', dir: player.dir, frame: player.frame, x: player.x, y: player.y, sortY: player.y + 0.001 });
  return list.sort((a, b) => a.sortY - b.sortY);
}

// Task 115: an open facility's windows glow warm (the museum's display niches too).
function tdVillageLights(now){
  const out = [], v = state.village;
  if(typeof VILLAGE === 'undefined' || !v || !v.sites) return out;
  VILLAGE.ORDER.forEach((k, i) => {
    const site = v.sites[k];
    if(!site || (v.stage[k] || 0) < 2) return;
    if(k === 'appraiser') out.push({ kind: 'village', x: site.x - 0.2, y: site.y - 0.2, r: 0.6, rgb: [255, 210, 130], strength: 0.5 * tdFlicker(now, 20 + i) });
    else out.push({ kind: 'village', x: site.x, y: site.y - 0.25, r: 0.9, rgb: [255, 220, 150], strength: 0.4 + 0.04 * Math.min(6, Math.ceil((v.donated || []).length / 2)) });
  });
  return out;
}

// Task 118: the plaza lamps glow like the workshop lamp.
function tdPlazaLights(now){
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(!vd) return [];
  return [-1, 1].map((sx, i) => ({ kind: 'plaza', x: vd.plaza.x + sx * 0.72, y: vd.plaza.y + 0.5 - 0.3, r: 0.85, rgb: [255, 214, 140], strength: 0.62 * tdFlicker(now, 40 + i) }));
}

// Task 119: the house's windows and door lantern glow warm.
function tdHouseLights(now){
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(!vd) return [];
  return [{ kind: 'house', x: vd.house.x + 0.23, y: vd.house.y - 0.31, r: 0.85, rgb: [255, 206, 128], strength: 0.5 * tdFlicker(now, 61) }];
}

// Task 120: stone lanterns in the garden glow at dusk.
function tdGardenLights(now){
  if(typeof villageGardenCells !== 'function') return [];
  const cells = villageGardenCells(), carry = VILLAGE_GARDEN_UI.carry;
  return villageDecorList().filter(d => d.cell !== carry && cells[d.cell] && (villageDecorDef(d.kind) || {}).light)
    .map((d, i) => ({ kind: 'garden', x: cells[d.cell].x, y: cells[d.cell].y - 0.2, r: 0.6, rgb: [255, 214, 140], strength: 0.45 * tdFlicker(now, 80 + d.cell + i) }));
}

function tdDecorImage(key){
  TD.decorImages = TD.decorImages || {};
  if(!(key in TD.decorImages)) TD.decorImages[key] = tdSpriteImage(tdDecorSprite(key));
  return TD.decorImages[key];
}

// Task 114: baked village facility images, cached by facility, stage and lit niches.
function tdVillageImage(key, stage, exhibits, specimens, hall){
  TD.villageImages = TD.villageImages || {};
  const open = key === 'museum' && stage >= 2;
  const id = key + '|' + stage + '|' + (open ? exhibits : 0) + '|' + (open ? (specimens || []).join(',') + '|' + (hall || 0) : ''); // Task 121/122: specimens, hall
  if(!(id in TD.villageImages)) TD.villageImages[id] = tdSpriteImage(tdVillageSprite(key, stage, exhibits, specimens, hall));
  return TD.villageImages[id];
}

// Task 108: a sprinkle of grass tufts on the open land that sway in the wind
// (fixed pattern; kept clear of veins, huts and the workshop yard). Cached.
function tdOpenLandTufts(){
  const w = state.world, vs = (state.village && state.village.sites) || {};
  const sites = ['appraiser', 'museum'].map(k => vs[k]).filter(Boolean); // Task 114: none on a village site
  const vg = typeof villageGroundLayout === 'function' ? villageGroundLayout() : null; // Task 118: nor on the plaza, roads or lots
  const vparts = vg ? villageDistrict() : null;
  const key = w.base.x + ',' + w.base.y + '|' + w.mines.length + '|' + w.workshops.length + '|' + sites.map(p => p.x + ',' + p.y).join(';') + '|' + (vg ? vg.key : '');
  if(TD.tuftKey === key && TD.tufts) return TD.tufts;
  const out = [], b = BALANCE.world;
  for(let y = b.BOUNDS_MIN_Y + 0.25; y <= b.BOUNDS_MAX_Y; y += 0.5){
    for(let x = b.BOUNDS_MIN_X + 0.25; x <= b.BOUNDS_MAX_X; x += 0.5){
      const h = tdHash(Math.round(x * 2), Math.round(y * 2), 21);
      if(h > 0.07) continue;
      const jx = x + (tdHash(Math.round(x * 2), Math.round(y * 2), 22) - 0.5) * 0.4, jy = y + (tdHash(Math.round(x * 2), Math.round(y * 2), 23) - 0.5) * 0.4;
      if(tdTileAt(jx, jy, false, w.base, vg) !== TD_TILE.GRASS) continue;
      if(vparts && vparts.rects.some(r => villageRectDist(r, jx, jy) < 0.2)) continue;
      if(Math.hypot(jx - w.base.x, jy - w.base.y) < 1.5) continue;
      if(w.mines.some(m => m && Math.hypot(m.x - jx, m.y - jy) < 0.6)) continue;
      if(w.workshops.some(ws => ws && Math.hypot(ws.x - jx, ws.y - jy) < 0.8)) continue;
      if(sites.some(p => Math.hypot(p.x - jx, p.y - jy) < 1.0)) continue;
      out.push({ x: jx, y: jy });
    }
  }
  TD.tuftKey = key; TD.tufts = out;
  return out;
}

// Task 108: draws a plant leaning by `k` (a skew around its base), so the top moves and the roots stay.
function tdDrawSway(g, img, sx, sy, zoom, anchorY, k){
  if(!img) return;
  const dpr = TD.view.dpr, baseY = sy + (anchorY || 0) * zoom;
  g.setTransform(dpr, 0, dpr * k, dpr, -dpr * k * baseY, 0);
  tdDrawSprite(g, img, sx, sy, zoom, anchorY);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// The ground image for the current terrain state (rebuilt only when the tunnel opens or the base moves).
function tdEnsureGround(){
  const base = state.world.base;
  const village = typeof villageGroundLayout === 'function' ? villageGroundLayout() : null; // Task 118: the plaza and roads are ground too
  const key = (terrainTunnelOpen() ? 'open' : 'closed') + '|' + base.x + ',' + base.y + '|' + (village ? village.key + '|' + JSON.stringify(village.garden) : '');
  if(TD.groundKey === key && TD.ground) return;
  const map = tdBuildTileMap(terrainTunnelOpen(), base, village);
  const img = tdPaintTileMap(map);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  if(!g) return;
  const id = g.createImageData(img.width, img.height);
  id.data.set(img.data);
  g.putImageData(id, 0, 0);
  TD.ground = c; TD.groundKey = key; TD.groundMap = map;
  // minimap base: one pixel per tile, mountain / ground / beyond colours
  const mc = document.createElement('canvas');
  mc.width = map.cols; mc.height = map.rows;
  const mg = mc.getContext('2d');
  const mid = mg.createImageData(map.cols, map.rows);
  const col = { [TD_TILE.GRASS]: [86, 128, 76], [TD_TILE.BEYOND]: [60, 98, 64], [TD_TILE.ROCK]: [120, 114, 106], [TD_TILE.TUNNEL]: [150, 120, 80], [TD_TILE.EDGE]: [34, 58, 40], [TD_TILE.PATH]: [160, 132, 92],
    [TD_TILE.ROAD]: [176, 162, 138], [TD_TILE.PLAZA]: [206, 194, 170], [TD_TILE.GARDEN]: [112, 168, 92] };
  for(let k = 0; k < map.types.length; k++){ const c3 = col[map.types[k]]; mid.data.set([c3[0], c3[1], c3[2], 255], k * 4); }
  mg.putImageData(mid, 0, 0);
  TD.miniBase = mc;
}

function tdResize(){
  const c = TD.canvas;
  const w = Math.max(1, c.clientWidth || window.innerWidth), h = Math.max(1, c.clientHeight || window.innerHeight);
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  if(c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)){ c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const zoom = topdownZoom(w, h), k = typeof tdStyleRenderScale === 'function' ? tdStyleRenderScale(zoom, dpr) : dpr;
  // the style experiment snaps the drawing scale so an art pixel is whole device pixels; the view is then measured in those units
  TD.view = k === dpr ? { w, h, zoom, dpr } : { w: c.width / k, h: c.height / k, zoom, dpr: k };
}

function tdDrawSprite(g, img, sx, sy, zoom, anchorY){
  if(!img) return;
  const w = img.width * zoom, h = img.height * zoom;
  g.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h + (anchorY || 0) * zoom), w, h);
}

function tdAddFloat(text, wx, wy, color, lift){
  // Task 117: floats still rising from the same point stack above each other
  const now = performance.now(), stack = TD.floats.filter(f => f.x === wx && f.y === wy && now - f.t0 < 1200).length;
  const scene = typeof villageHomeInside === 'function' && villageHomeInside() ? 'home' : 'world'; // Task 119: drawn in the room or the world
  TD.floats.push({ text, x: wx, y: wy, t0: now, color: color || '#fff3b0', lift: lift || 34, stack, scene });
}

// How high (sprite pixels) the interaction bubble sits above a target's point: above its picture.
function tdBubbleLift(target){
  if(!target) return 34;
  if(target.type === 'base') return 64;
  if(target.type === 'village') return target.id === 'museum' ? 54 : 46;
  if(target.type === 'plaza') return 40;
  if(target.type === 'house') return 76;
  if(target.type === 'homeDoor') return 30;
  if(target.type === 'garden') return 32;
  return 34;
}

function tdFrame(now){
  if(!TD.running) return;
  // Task 108: average frame time decides the effect quality (phones start one step lower)
  TD.frames = (TD.frames || 0) + 1;
  if(TD.lastFrame && TD.frames > 20){ // the first frames (loading) do not count
    const dt = Math.min(100, now - TD.lastFrame);
    TD.frameAvg = TD.frameAvg === undefined ? dt : TD.frameAvg * 0.95 + dt * 0.05;
  }
  TD.lastFrame = now;
  if(TD.frameAvg !== undefined && (TD.qualityCheck = (TD.qualityCheck || 0) + 1) % 30 === 0) TD.quality = tdQualityFor(TD.frameAvg, TD.quality);
  try { tdRender(now); } catch(e){ /* keep the loop alive; the game itself runs on its own tick */ }
  window.requestAnimationFrame(tdFrame);
}

function tdRender(now){
  const g = TD.ctx;
  if(!g) return;
  tdResize();
  // Task 119: inside the house the room is drawn instead of the world (the workers walk on)
  const inside = typeof villageHomeInside === 'function' && villageHomeInside();
  document.body.classList.toggle('td-inside', inside);
  if(inside){
    if(typeof tdWorkerSimStep === 'function'){ const ws = TD.workerSim; tdWorkerSimStep(ws && ws.last !== null ? now - ws.last : 0, now); }
    const cam = tdRenderHome(now);
    tdDrawOverlay(g, cam, TD.view.w, TD.view.h, TD.view.zoom, now, 'home');
    if(typeof tdUpdateActionButton === 'function') tdUpdateActionButton();
    return;
  }
  TD.homeTracker = null;
  tdEnsureGround();
  const { w, h, zoom, dpr } = TD.view;
  const p = state.world.player;
  const pos = topdownTrack(TD.tracker, p.x, p.y, now);
  const cam = TD.cam = topdownCamera(pos, w, h, zoom);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#1d2f22'; g.fillRect(0, 0, w, h);
  // ground: only the visible part of the cached image
  const map = TD.groundMap, s = topdownScale(zoom), tilePx = TOPDOWN.TILE, unitPx = TD_UNIT_PX;
  if(TD.ground && map){
    const vis = topdownVisibleRect(cam, w, h, zoom);
    const sx0 = Math.max(0, Math.floor((vis.minX - map.originX) * unitPx) - tilePx), sy0 = Math.max(0, Math.floor((vis.minY - map.originY) * unitPx) - tilePx);
    const sx1 = Math.min(TD.ground.width, Math.ceil((vis.maxX - map.originX) * unitPx) + tilePx), sy1 = Math.min(TD.ground.height, Math.ceil((vis.maxY - map.originY) * unitPx) + tilePx);
    const o = topdownToScreen(map.originX + sx0 / unitPx, map.originY + sy0 / unitPx, cam, w, h, zoom);
    if(sx1 > sx0 && sy1 > sy0) g.drawImage(TD.ground, sx0, sy0, sx1 - sx0, sy1 - sy0, o.x, o.y, (sx1 - sx0) * zoom, (sy1 - sy0) * zoom);
  }
  // Task 110: the workers walk on (renderer state only)
  if(typeof tdWorkerSimStep === 'function'){ const ws = TD.workerSim; tdWorkerSimStep(ws && ws.last !== null ? now - ws.last : 0, now); }
  // objects, back to front
  const frame = topdownWalkFrame(pos.walked, p.pose);
  const items = tdDrawList({ dir: p.facing, frame, x: pos.x, y: pos.y });
  const sheet = TD.sheet;
  items.forEach(it => {
    const sp = topdownToScreen(it.x, it.y, cam, w, h, zoom);
    if(sp.x < -200 || sp.y < -200 || sp.x > w + 200 || sp.y > h + 260) return;
    if(it.kind === 'base') tdDrawSprite(g, sheet.base, sp.x, sp.y, zoom, 4);
    else if(it.kind === 'workshop') tdDrawSprite(g, sheet.workshop[it.tier], sp.x, sp.y, zoom, 3);
    else if(it.kind === 'ore') tdDrawSprite(g, it.look === 'undiscovered' ? sheet.ore.undiscovered : (sheet.ore[it.resource] || {})[it.look], sp.x, sp.y, zoom, 6);
    else if(it.kind === 'prop' || it.kind === 'decor'){
      const swaying = it.kind === 'decor' || it.prop === 'bigTree' || it.prop === 'sparseTree' || it.prop === 'grass';
      if(swaying && TD.quality < 2) tdDrawSway(g, sheet.prop[it.prop], sp.x, sp.y, zoom, 2, tdSway(now, it.x, it.y, it.kind === 'decor' ? 'tuft' : it.prop));
      else tdDrawSprite(g, sheet.prop[it.prop], sp.x, sp.y, zoom, 2);
    }
    else if(it.kind === 'village') tdDrawSprite(g, tdVillageImage(it.id, it.stage, it.exhibits, it.specimens, it.hall), sp.x, sp.y, zoom, 3);
    else if(it.kind === 'plazaProp') tdDrawSprite(g, sheet.prop[it.prop], sp.x, sp.y, zoom, 2);
    else if(it.kind === 'house') tdDrawSprite(g, sheet.house, sp.x, sp.y, zoom, 3);
    else if(it.kind === 'gardenDecor') tdDrawSprite(g, tdDecorImage(it.key), sp.x, it.carried ? sp.y - 20 * zoom : sp.y, zoom, 2);
    else if(it.kind === 'torch') tdDrawSprite(g, sheet.torch && sheet.torch[Math.floor(now / 130 + it.seed) % 3], sp.x, sp.y, zoom, 2);
    else if(it.kind === 'gate'){
      const t = terrainTunnel(), top = topdownToScreen(it.x, t.y - t.halfWidth, cam, w, h, zoom);
      const x0 = top.x - 3 * zoom;
      g.fillStyle = '#5a3b28'; g.fillRect(x0, top.y, 6 * zoom, sp.y - top.y);
      g.fillStyle = '#8a6440'; for(let yy = top.y + 4 * zoom; yy < sp.y; yy += 10 * zoom) g.fillRect(x0 - 2 * zoom, yy, 10 * zoom, 3 * zoom);
      g.fillStyle = '#e2b23c'; g.fillRect(x0 + zoom, (top.y + sp.y) / 2 - 2 * zoom, 4 * zoom, 4 * zoom);
    } else if(it.kind === 'player') tdDrawSprite(g, sheet.player[it.dir] && sheet.player[it.dir][it.frame], sp.x, sp.y, zoom, 1);
    else if(it.kind === 'worker'){
      // Task 109: a worker swinging at its vein; ore chips fly on the strike. Task 110: or walking there.
      const wf = it.mode === 'walk' ? 'w' + it.walkFrame : tdWorkerFrame(it, now);
      tdDrawSprite(g, tdWorkerImage(it.look, it.dir, wf), sp.x, sp.y, zoom, 1);
      if(wf === 2 && it.mineId && it.mode === 'work'){
        const side = it.dir === 'right' ? 1 : -1, c = (TD_RES_COLORS[it.resource] || ['#ccc'])[1];
        const t = (now / it.cycleMs + it.phase) % 0.25 * 4;
        g.fillStyle = c;
        [[7, -6], [10, -11], [4, -13]].forEach(([dx, dy], i) => g.fillRect(Math.round(sp.x + side * (dx + t * 3 * (i + 1)) * zoom), Math.round(sp.y + (dy - t * 4) * zoom), zoom, zoom));
      }
    }
  });
  // Task 108: cloud shadows, then the dusk tint with its lights, then a light vignette (mood only)
  if(TD.quality < 2) tdRenderClouds(g, cam, w, h, zoom, now);
  const darkness = typeof TD.forceDarkness === 'number' ? TD.forceDarkness : tdAmbientDarkness(Date.now());
  TD.darkness = darkness;
  const extraLights = (typeof tdWorkerLights === 'function' ? tdWorkerLights(now) : []).concat(tdVillageLights(now), tdPlazaLights(now), tdHouseLights(now), tdGardenLights(now));
  tdRenderLighting(g, tdLightList({ x: pos.x, y: pos.y, dir: p.facing }, now, extraLights), darkness, cam, w, h, zoom, TD.quality, now);
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(10,14,12,0)'); vg.addColorStop(1, 'rgba(10,14,12,0.32)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  tdDrawOverlay(g, cam, w, h, zoom, now, 'world');
  tdRenderMinimap(cam);
  if(typeof tdUpdateActionButton === 'function') tdUpdateActionButton();
}

// The interaction bubble and the floating texts, over the world or the room (Task 119: `scene`).
function tdDrawOverlay(g, cam, w, h, zoom, now, scene){
  const p = state.world.player;
  // interaction bubble over the target (Task 115: kept on screen; a label too wide splits after its name)
  TD.target = typeof tdInteractTarget === 'function' ? tdInteractTarget(p.x, p.y) : null; // inside the house: its door (Task 119)
  if(TD.target){
    const sp = topdownToScreen(TD.target.x, TD.target.y, cam, w, h, zoom);
    const label = (TD.touch ? '' : '[E] ') + TD.target.label;
    g.font = 'bold ' + (12 + zoom) + 'px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
    let lines = [label];
    if(g.measureText(label).width + 14 > w - 12 && label.includes(' · ')){ const cut = label.indexOf(' · '); lines = [label.slice(0, cut), label.slice(cut + 3)]; }
    const tw = Math.min(w - 12, Math.max(...lines.map(l => g.measureText(l).width)) + 14), bh = 22 * lines.length;
    const bx = Math.round(Math.max(6, Math.min(w - tw - 6, sp.x - tw / 2))), by = Math.round(sp.y - tdBubbleLift(TD.target) * zoom) - (lines.length - 1) * 22;
    g.fillStyle = TD.target.action === 'locked' ? 'rgba(40,36,34,0.88)' : 'rgba(22,28,32,0.9)';
    g.fillRect(bx, by, tw, bh); g.fillStyle = TD.target.action === 'locked' ? '#8b98a1' : '#ffd27a';
    g.fillRect(bx, by + bh - 1, tw, 2);
    g.fillStyle = TD.target.action === 'locked' ? '#b8c0c6' : '#fff6dc'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, bx + 7, by + 11 + i * 22, tw - 14));
  }
  // floating texts (+1 철광석 ...)
  TD.floats = TD.floats.filter(f => now - f.t0 < 1200);
  TD.floats.filter(f => (f.scene || 'world') === scene).forEach(f => {
    const k = (now - f.t0) / 1200, sp = topdownToScreen(f.x, f.y, cam, w, h, zoom);
    const fy = sp.y - (f.lift || 34) * zoom - 26 - (f.stack || 0) * 22 - k * 34; // starts above the interaction bubble and rises
    g.globalAlpha = 1 - k * k; g.font = 'bold ' + (13 + zoom) + 'px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000'; g.fillText(f.text, sp.x + 1, fy + 1);
    g.fillStyle = f.color; g.fillText(f.text, sp.x, fy);
    g.globalAlpha = 1; g.textAlign = 'left';
  });
}

// Minimap (blueprint 3.5): ground, the workshop, DISCOVERED mines only, the player and the view.
function tdRenderMinimap(cam){
  const c = TD.mini;
  if(!c || !TD.miniBase) return;
  const g = c.getContext('2d');
  if(!g) return;
  const map = TD.groundMap, n = TOPDOWN.TILES_PER_UNIT;
  const sx = c.width / map.cols, sy = c.height / map.rows;
  const at = (x, y) => [(x - map.originX) * n * sx, (y - map.originY) * n * sy];
  g.imageSmoothingEnabled = false;
  g.drawImage(TD.miniBase, 0, 0, c.width, c.height);
  state.world.mines.forEach(m => {
    if(!m || !isMineDiscovered(m)) return;
    const [x, y] = at(m.x, m.y);
    g.fillStyle = (TD_RES_COLORS[m.resource] || ['#ccc'])[0]; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    if(m.developmentState === 'secured'){ g.fillStyle = '#3fc9b0'; g.fillRect(Math.round(x) - 2, Math.round(y) + 2, 4, 1); }
  });
  (state.world.torches || []).forEach(t => { const [x, y] = at(t.x, t.y); g.fillStyle = '#ffb04a'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); });
  // Task 114: village facilities: grey while ruined, coloured once open
  if(typeof VILLAGE !== 'undefined' && state.village && state.village.sites) VILLAGE.ORDER.forEach(k => {
    const site = state.village.sites[k];
    if(!site) return;
    const [x, y] = at(site.x, site.y), open = (state.village.stage[k] || 0) >= 2;
    g.fillStyle = open ? (k === 'museum' ? '#e6e1d8' : '#5fa0d8') : '#7a746c'; g.fillRect(Math.round(x) - 2, Math.round(y) - 3, 5, 4);
  });
  const hd = typeof villageHouseDoor === 'function' ? villageHouseDoor() : null; // Task 119: the house
  if(hd){ const [hx, hy] = at(hd.x, hd.y); g.fillStyle = '#4f8246'; g.fillRect(Math.round(hx) - 2, Math.round(hy) - 3, 5, 4); }
  const [bx, by] = at(state.world.base.x, state.world.base.y);
  g.fillStyle = '#d68b3d'; g.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);
  const p = state.world.player, [px, py] = at(p.x, p.y);
  g.fillStyle = '#fff'; g.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4);
  const v = topdownVisibleRect(cam, TD.view.w, TD.view.h, TD.view.zoom), [vx0, vy0] = at(v.minX, v.minY), [vx1, vy1] = at(v.maxX, v.maxY);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.strokeRect(Math.round(vx0) + 0.5, Math.round(vy0) + 0.5, Math.round(vx1 - vx0), Math.round(vy1 - vy0));
}

// Task 119: inside the house — the room, its furniture and the player, sorted back to front. Plain data.
function tdHomeDrawList(player){
  const list = VILLAGE.HOME.FURNITURE.map((f, i) => ({ kind: 'furniture', key: f.key, i, x: f.x, y: f.y, sortY: f.y }));
  if(player) list.push({ kind: 'player', dir: player.dir, frame: player.frame, x: player.x, y: player.y, sortY: player.y + 0.001 });
  return list.sort((a, b) => a.sortY - b.sortY);
}

// The camera inside: the room centred when it fits, else following the player and kept on the room.
function tdHomeCamera(target, viewW, viewH, zoom){
  const H = VILLAGE.HOME, s = topdownScale(zoom), halfW = viewW / (2 * s), halfH = viewH / (2 * s);
  const axis = (v, min, max, half) => (max - min <= half * 2) ? (min + max) / 2 : Math.min(max - half, Math.max(min + half, v));
  return { x: axis(target.x, -0.4, H.ROOM.w + 0.4, halfW), y: axis(target.y, -1.1, H.ROOM.h + 0.5, halfH) };
}

function tdFurnitureImage(key){
  TD.furnitureImages = TD.furnitureImages || {};
  if(!(key in TD.furnitureImages)) TD.furnitureImages[key] = tdSpriteImage(tdFurnitureSprite(key));
  return TD.furnitureImages[key];
}

function tdRenderHome(now){
  const g = TD.ctx, { w, h, zoom, dpr } = TD.view, S = villageHomeScene(), H = VILLAGE.HOME;
  if(!TD.homeTracker) TD.homeTracker = {};
  const pos = topdownTrack(TD.homeTracker, S.x, S.y, now);
  const cam = tdHomeCamera(pos, w, h, zoom);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#17120e'; g.fillRect(0, 0, w, h);
  if(!TD.homeRoom) TD.homeRoom = tdSpriteImage(tdHomeRoomSprite());
  const o = topdownToScreen(-H.SIDE_PX / TD_UNIT_PX, -H.BACK_PX / TD_UNIT_PX, cam, w, h, zoom);
  if(TD.homeRoom) g.drawImage(TD.homeRoom, o.x, o.y, TD.homeRoom.width * zoom, TD.homeRoom.height * zoom);
  const items = tdHomeDrawList({ dir: S.facing, frame: topdownWalkFrame(pos.walked, S.pose), x: pos.x, y: pos.y });
  items.forEach(it => {
    const sp = topdownToScreen(it.x, it.y, cam, w, h, zoom);
    if(it.kind === 'player') tdDrawSprite(g, TD.sheet.player[it.dir] && TD.sheet.player[it.dir][it.frame], sp.x, sp.y, zoom, 1);
    else tdDrawSprite(g, tdFurnitureImage(it.key), sp.x, sp.y, zoom, 0);
  });
  // warm light: the stove's glow and a soft dark edge
  const stove = H.FURNITURE.find(f => f.key === 'stove');
  if(stove){
    const sp = topdownToScreen(stove.x, stove.y - 0.25, cam, w, h, zoom), r = 1.6 * topdownScale(zoom) * (0.95 + 0.05 * tdFlicker(now, 7));
    const gl = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r);
    gl.addColorStop(0, 'rgba(255,170,90,0.22)'); gl.addColorStop(1, 'rgba(255,170,90,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = gl; g.fillRect(sp.x - r, sp.y - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
  }
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(20,12,6,0)'); vg.addColorStop(1, 'rgba(20,12,6,0.4)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return cam;
}
