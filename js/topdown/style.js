// ---------------------------------------------------------------------------
// Style experiment v2 (opt-in: ?style=v2). A crisper, textured pixel style for
// the player, the house, the grass and the cobbled roads only — everything else
// keeps the classic look. Same sprite sizes, anchors and ground lines as the
// classic sprites, so collision, lights and every system stay as they are.
//   - render scale snapped so one art pixel is a whole number of device pixels
//   - rounded silhouette corners and a selective inner outline (a dark warm
//     tone mixed into the edge pixels, never black)
//   - light from the top left: warm highlights, cooler shade bottom right
//   - shadows are stepped pixel shapes with flat alpha, no blur
// Nothing here is saved. Without the parameter nothing changes.
// ---------------------------------------------------------------------------
function tdStyleName(){
  if(TD_STYLE_CACHE.name) return TD_STYLE_CACHE.name;
  let s = 'classic';
  try { s = new URLSearchParams(window.location.search).get('style') === 'v2' ? 'v2' : 'classic'; } catch(e){ s = 'classic'; }
  TD_STYLE_CACHE.name = s;
  return s;
}
const TD_STYLE_CACHE = { name: null };
function tdStyleV2(){ return tdStyleName() === 'v2'; }

// Device pixels per CSS pixel for drawing: in v2, chosen so zoom x scale is a whole number
// (at a 1.25 / 1.5 / 2.625 device ratio the classic scale gives art pixels of uneven width).
function tdStyleRenderScale(zoom, dpr){
  if(!tdStyleV2()) return dpr;
  return Math.max(1, Math.round(zoom * dpr)) / zoom;
}

// --- pixels -----------------------------------------------------------------
const TD_OUTLINE_RGB = [42, 30, 40];   // the outline tone: a deep warm plum
const TD_LIGHT_RGB = [255, 238, 205];  // warm light from the top left
const TD_SHADE_RGB = [46, 44, 72];     // shade bottom right leans a little cool

function tdParseColor(c){
  if(c[0] === '#') return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  const m = c.match(/rgba?\(([^)]+)\)/), v = m ? m[1].split(',').map(Number) : [0, 0, 0, 1];
  return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
}
function tdMix(a, b, t){ return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), a[3]]; }
function tdColorKey(p){ return p[3] >= 1 ? '#' + p.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('') : 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + p[3] + ')'; }

// A painter sprite as a pixel grid ([r, g, b, a] or null); see-through rects blend over what is under them.
function tdRaster(sp){
  const px = new Array(sp.w * sp.h).fill(null);
  sp.rects.forEach(([x, y, w, h, c]) => {
    const col = tdParseColor(c);
    for(let yy = Math.max(0, y); yy < Math.min(sp.h, y + h); yy++) for(let xx = Math.max(0, x); xx < Math.min(sp.w, x + w); xx++){
      const k = yy * sp.w + xx, under = px[k];
      px[k] = col[3] >= 1 || !under ? col.slice() : [...tdMix(under, col, col[3]).slice(0, 3), Math.min(1, under[3] + col[3] * (1 - under[3]))];
    }
  });
  return { w: sp.w, h: sp.h, px };
}
// Back to a painter sprite (runs of one colour per row become one rect).
function tdUnraster(r){
  const rects = [];
  for(let y = 0; y < r.h; y++){
    let x = 0;
    while(x < r.w){
      const p = r.px[y * r.w + x];
      if(!p){ x++; continue; }
      const key = tdColorKey(p); let e = x + 1;
      while(e < r.w && r.px[y * r.w + e] && tdColorKey(r.px[y * r.w + e]) === key) e++;
      rects.push([x, y, e - x, 1, key]); x = e;
    }
  }
  return { w: r.w, h: r.h, rects };
}

// The shared finishing pass: rounded convex corners, a selective inner outline,
// and light/shade by distance to the silhouette's top-left / bottom-right edge.
//   keep(p): pixels left as they are (eyes, glass glow, a flame)
//   roundRows: [y0, y1] — rows whose convex corners are cut (the round parts)
function tdStylize(r, opts){
  const o = opts || {}, W = r.w, H = r.h, px = r.px;
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!px[y * W + x] && px[y * W + x][3] >= 1;
  const keep = o.keep || (() => false);
  // 1. round: a corner pixel open on two touching sides goes (top corners), or darkens (lower ones)
  const [r0, r1] = o.roundRows || [0, -1];
  const cut = [];
  for(let y = r0; y <= r1; y++) for(let x = 0; x < W; x++){
    if(!solid(x, y) || keep(px[y * W + x])) continue;
    const up = !solid(x, y - 1), dn = !solid(x, y + 1), lf = !solid(x - 1, y), rt = !solid(x + 1, y);
    if((up && lf && !dn && !rt) || (up && rt && !dn && !lf)) cut.push([x, y]);
  }
  cut.forEach(([x, y]) => { px[y * W + x] = null; });
  // 2. outline and light, read from the rounded shape
  const edge = [], out = px.map(p => p && p.slice());
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const p = px[y * W + x];
    if(!p || p[3] < 1 || keep(p)) continue;
    const open = !solid(x, y - 1) || !solid(x, y + 1) || !solid(x - 1, y) || !solid(x + 1, y);
    if(open){ out[y * W + x] = tdMix(p, TD_OUTLINE_RGB, o.outline === undefined ? 0.52 : o.outline); edge.push([x, y]); continue; }
    // one pixel in: lit near the top/left edge, shaded near the bottom/right edge
    const litTop = !solid(x, y - 2), litLeft = !solid(x - 2, y), shadeBottom = !solid(x, y + 2), shadeRight = !solid(x + 2, y);
    let q = p;
    if(litTop || litLeft) q = tdMix(q, TD_LIGHT_RGB, o.light === undefined ? 0.2 : o.light);
    if(shadeBottom || shadeRight) q = tdMix(q, TD_SHADE_RGB, o.shade === undefined ? 0.16 : o.shade);
    out[y * W + x] = q;
  }
  r.px = out;
  return r;
}

// --- the player -----------------------------------------------------------------
// The classic sprite through the finishing pass: the hair's corners rounded,
// edges outlined, eyes and the lantern glow kept clean, and a stepped pixel
// shadow in place of the flat rectangle. 16 x 22, feet where they were.
function tdPlayerSpriteV2(dir, frame){
  const C = TD_PLAYER_COLORS, r = tdRaster(tdPlayerSprite(dir, frame));
  const clean = [C.eye, C.eyeLight, C.lamp, C.blush, C.mouth].map(c => tdParseColor(c).slice(0, 3).join());
  for(let k = 0; k < r.px.length; k++) if(r.px[k] && r.px[k][3] < 1) r.px[k] = null; // the old shadow
  tdStylize(r, { keep: p => clean.includes(p.slice(0, 3).join()), roundRows: [0, 9], outline: 0.58, light: 0.22, shade: 0.14 });
  // hair sheen: in each column, the hair pixel just under the top outline catches the light
  for(let x = 0; x < r.w; x++){
    let y = 0; while(y < 6 && !r.px[y * r.w + x]) y++;
    const k = (y + 1) * r.w + x, p = r.px[k];
    if(y < 6 && p && p[2] - p[0] > 60) r.px[k] = tdMix(p, [154, 184, 239], 0.32);
  }
  // a stepped oval shadow under the feet (flat alpha steps, crisp edges)
  const shadow = [[20, 4, 11, 0.3], [21, 3, 12, 0.2], [21, 4, 11, 0.26]];
  shadow.forEach(([y, x0, x1, a]) => { for(let x = x0; x <= x1; x++){ const k = y * r.w + x; if(!r.px[k] || r.px[k][3] < 1) r.px[k] = [30, 26, 34, a]; } });
  return tdUnraster(r);
}

// --- the house ------------------------------------------------------------------
// Hand-painted for v2 at the classic size (84 x 73, ground row 70): the same
// door, walls and roof measures as the classic house (door frame 25 px, walls
// 66 px, ridge 64 px up), with its own materials — grained honey boards, round
// footing stones, scalloped shingles in light and shade, an arched door, glowing
// windows — then the finishing pass.
const TD_HOUSE_V2_GLOW = ['#fff0b8', '#f8dc8a', '#f3cf74', '#e8bd62', '#ffffff', '#ffd27a', '#fff3c4', '#f6d27c'];
function tdHouseSpriteV2(){
  const W = 84, H = 73, G = 70, px = new Array(W * H).fill(null);
  const hex = c => tdParseColor(c);
  const set = (x, y, c) => { if(x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = typeof c === 'string' ? hex(c) : c.slice(); };
  const rect = (x, y, w, h, c) => { for(let yy = y; yy < y + h; yy++) for(let xx = x; xx < x + w; xx++) set(xx, yy, c); };
  const hsh = (a, b, s) => tdHash(a, b, s);
  // walls: horizontal boards, each its own tone, a grain line and the odd knot
  const boards = ['#ecd5a4', '#e6cc96', '#efdbae', '#e2c68e'];
  for(let y = 36; y < G - 5; y++){
    const row = Math.floor((y - 36) / 4), seam = (y - 36) % 4 === 3;
    for(let x = 9; x < 75; x++){
      const plank = Math.floor((x + (row % 2) * 11) / 22), base = hex(boards[Math.floor(hsh(plank, row, 61) * boards.length)]);
      let c = base;
      if(seam) c = hex('#b8935f');
      else if((x + (row % 2) * 11) % 22 === 0) c = hex('#c9a46c'); // board ends
      else if((y - 36) % 4 === 1 && hsh(x, row, 63) < 0.28) c = tdMix(base, hex('#c09a62'), 0.55); // grain
      set(x, y, c);
    }
    if(!seam && hsh(row, 1, 65) < 0.5){ const kx = 14 + Math.floor(hsh(row, 2, 67) * 54); if(kx < 30 || kx > 54){ set(kx, y, '#a8834f'); } }
  }
  // stone footing: round stones with a lit top-left and a shaded bottom-right
  rect(9, G - 5, 66, 5, '#6c645b');
  for(let x = 9, i = 0; x < 75; i++){
    const sw = 5 + Math.floor(hsh(i, 3, 71) * 4), tone = hex(['#a49b90', '#9a9186', '#aea598'][i % 3]);
    for(let yy = G - 5; yy < G; yy++) for(let xx = x; xx < Math.min(75, x + sw - 1); xx++){
      const lx = xx - x, ly = yy - (G - 5), last = sw - 2;
      if((lx === 0 || lx === last) && (ly === 0 || ly === 4)) continue; // round corners
      set(xx, yy, ly === 0 || lx === 0 ? tdMix(tone, TD_LIGHT_RGB, 0.3) : ly === 4 || lx === last ? tdMix(tone, TD_SHADE_RGB, 0.25) : tone);
    }
    x += sw;
  }
  // timber frame: lit on the left, shaded on the right
  const post = (x, y, h) => { rect(x, y, 3, h, '#8a6440'); rect(x, y, 1, h, '#a87e52'); rect(x + 2, y, 1, h, '#6c4c30'); };
  post(9, 36, G - 41); post(72, 36, G - 41); post(31, 39, G - 44); post(50, 39, G - 44);
  rect(9, 37, 66, 2, '#8a6440'); rect(9, 37, 66, 1, '#a87e52'); rect(9, 39, 66, 1, '#5c4029');
  // the door: an arched frame, vertical planks with grain, iron straps and studs, a little window, the step
  for(let y = 43; y < G - 2; y++){
    const inset = y === 43 ? 3 : y === 44 ? 1 : 0;
    for(let x = 34 + inset; x < 50 - inset; x++) set(x, y, '#5a3b28');
  }
  for(let y = 45; y < G - 2; y++){
    const inset = y === 45 ? 2 : y === 46 ? 1 : 0;
    for(let x = 36 + inset; x < 48 - inset; x++){
      const plank = Math.floor((x - 36) / 4), lx = (x - 36) % 4;
      const base = hex(['#94603a', '#8a5a36', '#9a663e'][plank]);
      set(x, y, lx === 3 ? hex('#6e4528') : lx === 0 ? tdMix(base, TD_LIGHT_RGB, 0.18) : hsh(x, y, 73) < 0.12 ? tdMix(base, hex('#6e4528'), 0.5) : base);
    }
  }
  [50, 62].forEach(y => { rect(36, y, 12, 1, '#4b4440'); set(37, y, '#8d857c'); set(46, y, '#8d857c'); });
  rect(39, 48, 6, 4, '#3a2a1e'); rect(40, 49, 4, 2, '#f6d27c'); set(40, 49, '#fff0b8');
  rect(45, 56, 2, 2, '#e2b23c'); set(45, 56, '#f7da7a');
  for(let x = 31; x < 53; x++){ set(x, G - 2, x === 31 || x === 52 ? '#9a9086' : '#cfc6bc'); set(x, G - 1, x === 31 || x === 52 ? '#7c736a' : '#aaa198'); }
  // windows: rounded frames, warm glass lit from the top, mullions, flower boxes with leaves
  [[15, 45], [59, 45]].forEach(([x, y]) => {
    for(let yy = 0; yy < 11; yy++) for(let xx = 0; xx < 11; xx++){
      if((xx === 0 || xx === 10) && (yy === 0 || yy === 10)) continue;
      const frame = xx === 0 || xx === 10 || yy === 0 || yy === 10 || xx === 5 || yy === 5;
      set(x + xx, y + yy, frame ? '#5a3b28' : yy < 3 ? '#fff0b8' : yy < 5 ? '#f8dc8a' : yy < 8 ? '#f3cf74' : '#e8bd62');
    }
    set(x + 2, y + 2, '#ffffff');
    for(let xx = -1; xx < 12; xx++){ set(x + xx, y + 12, '#a07a50'); set(x + xx, y + 13, '#8a6440'); set(x + xx, y + 14, '#6c4c30'); }
    for(let xx = 0; xx < 11; xx++) set(x + xx, y + 11, (xx % 3 === 1) ? '#4f8246' : '#3f6b3a');
    [[0, '#e06f8a'], [3, '#f0d060'], [6, '#e06f8a'], [9, '#f7c0cf']].forEach(([dx, c]) => { set(x + dx, y + 10, c); set(x + dx + 1, y + 10, c); set(x + dx, y + 9, tdMix(hex(c), TD_LIGHT_RGB, 0.35)); set(x + dx + 1, y + 11, '#6aa35a'); });
  });
  // a lantern beside the door, with a stepped glow
  rect(54, 46, 6, 1, '#3a2a1e'); rect(55, 47, 4, 5, '#3a2a1e'); rect(56, 48, 2, 3, '#ffd27a'); set(56, 48, '#fff3c4');
  // shade under the eaves: two flat rows on the boards (pixels, no gradient)
  for(let x = 12; x < 72; x++){ const a = px[39 * W + x], b = px[40 * W + x]; if(a) px[39 * W + x] = tdMix(a, [80, 54, 30], 0.35); if(b) px[40 * W + x] = tdMix(b, [80, 54, 30], 0.15); }
  // roof: rows of scalloped shingles widening to the eaves. Each tab is one unit:
  // its tone comes from where it sits (light upper left, shade lower right) plus a
  // little jitter, its top row catches light and its rounded lower edge is darker.
  const shingle = [['#80b96c', '#6aa35a', '#5a9150'], ['#629a55', '#4f8246', '#447a40'], ['#4e8146', '#3f6b3a', '#365f33']];
  for(let y = 8; y <= 34; y++){
    const o = Math.round((y - 8) * 16 / 26), x0 = 20 - o, w = 44 + 2 * o, band = Math.floor((y - 8) / 3), ly = (y - 8) % 3, v = (y - 8) / 27;
    for(let x = x0; x < x0 + w; x++){
      if((x === x0 || x === x0 + w - 1) && ly === 2) continue; // round the slope's stepped edge
      const tab = Math.floor((x - 20 + 40 + (band % 2) * 3) / 6), lx = (x - 20 + 40 + (band % 2) * 3) % 6;
      const cx = (tab * 6 - 40 + 3 - (x0 - 20)) / w, lit = 1 - (cx * 0.62 + v * 0.48) + (hsh(tab, band, 75) - 0.5) * 0.3;
      const t = shingle[lit > 0.58 ? 0 : lit > 0.24 ? 1 : 2];
      let c = hex(t[1]);
      if(ly === 0) c = lx === 0 ? hex(t[1]) : hex(t[0]);
      if(ly === 2) c = lx === 0 || lx === 5 ? tdMix(hex(t[2]), [34, 60, 34], 0.35) : hex(t[2]);
      if(ly === 1 && lx === 5) c = tdMix(hex(t[1]), hex(t[2]), 0.5);
      set(x, y, c);
    }
  }
  for(let x = 21; x < 63; x++){ set(x, 7, '#86bd6c'); set(x, 6, x === 21 || x === 62 ? '#3f6b3a' : '#4f8246'); }
  for(let x = 4; x < 80; x++){ set(x, 35, x === 4 || x === 79 ? '#2c4d2a' : '#35592f'); set(x, 36, '#2c4a28'); }
  set(3, 35, '#2c4d2a'); set(80, 35, '#2c4d2a');
  // chimney: little bricks, a lit side and a cap
  for(let y = 4; y < 16; y++) for(let x = 58; x < 66; x++){
    const brick = (y % 3 === 0) || ((x + (Math.floor(y / 3) % 2) * 2) % 4 === 0);
    set(x, y, brick ? '#5f544b' : x < 60 ? '#958576' : x > 63 ? '#6e6157' : '#7f7064');
  }
  rect(57, 2, 10, 2, '#a59585'); rect(57, 3, 10, 1, '#7a6a5e');
  const r = tdStylize({ w: W, h: H, px }, {
    keep: p => TD_HOUSE_V2_GLOW.includes(tdColorKey(p)), // window glass and the lantern stay bright
    roundRows: [0, 40], outline: 0.45, light: 0.1, shade: 0.12,
  });
  // the ground contact shadow: flat alpha steps with stepped ends
  [[G, 6, 77, 0.32], [G + 1, 5, 78, 0.22], [G + 2, 8, 75, 0.12]].forEach(([y, x0, x1, a]) => {
    for(let x = x0; x <= x1; x++){ const k = y * W + x; if(!r.px[k]) r.px[k] = [30, 26, 34, a]; }
  });
  return tdUnraster(r);
}

// --- ground ----------------------------------------------------------------------
// v2 grass for one 16 x 16 tile: low-frequency patches of three tones, single-pixel
// blades with a lit tip and a dark root, small tufts and flowers. `put` as in tdPaintTileMap.
const TD_GRASS_V2 = {
  tones: [[78, 124, 69], [84, 132, 74], [90, 140, 79]], deep: [71, 115, 65],
  blade: [100, 152, 84], tip: [128, 178, 100], root: [66, 106, 61], flower: [[244, 214, 120], [232, 140, 166], [176, 204, 240], [250, 246, 232]],
};
function tdPaintGrassV2(put, x0, y0, i, j){
  const T = TOPDOWN.TILE, G = TD_GRASS_V2;
  for(let y = 0; y < T; y++) for(let x = 0; x < T; x++){
    const wx = x0 + x, wy = y0 + y;
    // patches: two offset 12 px grids blended, the borders dithered pixel by pixel so
    // the clumps have ragged natural edges (stepped tones, so it stays pixel art)
    const fine = tdHash(wx, wy, 85);
    const n = (tdHash(Math.floor(wx / 12), Math.floor(wy / 12), 81) + tdHash(Math.floor((wx + 6) / 12), Math.floor((wy + 6) / 12), 83)) / 2 + (fine - 0.5) * 0.22;
    let c = n < 0.36 ? G.tones[0] : n < 0.68 ? G.tones[1] : G.tones[2];
    if(fine < 0.03) c = G.deep; else if(fine > 0.985) c = G.tones[2];
    put(wx, wy, c);
  }
  // blades: a 1 px stroke, root dark, tip lit
  for(let k = 0; k < 4; k++){
    const bx = x0 + Math.floor(tdHash(i * 7 + k, j, 87) * T), by = y0 + 2 + Math.floor(tdHash(i, j * 7 + k, 89) * (T - 3));
    put(bx, by + 1, G.root); put(bx, by, G.blade); if(tdHash(bx, by, 91) < 0.6) put(bx, by - 1, G.tip);
  }
  // a tuft now and then: three blades fanning out, a shadow under them
  if(tdHash(i, j, 93) < 0.22){
    const tx = x0 + 3 + Math.floor(tdHash(i, j, 95) * 9), ty = y0 + 5 + Math.floor(tdHash(i, j, 97) * 8);
    put(tx - 1, ty + 1, G.root); put(tx, ty + 1, G.root); put(tx + 1, ty + 1, G.root);
    put(tx - 1, ty, G.blade); put(tx, ty, G.blade); put(tx + 1, ty, G.blade);
    put(tx - 1, ty - 1, G.tip); put(tx, ty - 2, G.tip); put(tx, ty - 1, G.blade); put(tx + 1, ty - 1, G.tip);
  }
  if(tdHash(i, j, 99) > 0.955){
    const fx = x0 + 4 + Math.floor(tdHash(i, j, 101) * 8), fy = y0 + 4 + Math.floor(tdHash(i, j, 103) * 8), fc = G.flower[Math.floor(tdHash(i, j, 105) * G.flower.length)];
    put(fx, fy - 1, fc); put(fx - 1, fy, fc); put(fx + 1, fy, fc); put(fx, fy + 1, fc); put(fx, fy, [250, 222, 110]); put(fx, fy + 2, G.root);
  }
}

// v2 cobbles: rounded stones in staggered rows, each lit top-left and shaded
// bottom-right, dark mortar with a little moss, sunk into the grass by a
// one-pixel shadow round the road. Returns the colour for road pixel (x, y),
// `d` its distance from the road's middle and `hw` the half width; or null.
const TD_ROAD_V2 = {
  stones: [[178, 166, 146], [168, 157, 138], [186, 174, 152], [162, 154, 140]], mortar: [112, 102, 90], moss: [104, 138, 82],
};
function tdRoadPixelV2(x, y, d, hw){
  const R = TD_ROAD_V2;
  if(d > hw - 1.5 && tdHash(x, y, 107) < 0.4) return null; // a ragged edge
  const row = Math.floor(y / 5), sx = x + (row % 2) * 3, col = Math.floor(sx / 7), lx = sx % 7, ly = y % 5;
  if(lx === 0 || ly === 0 || ((lx === 1 || lx === 6) && (ly === 1 || ly === 4))) return tdHash(x, y, 109) < 0.08 ? R.moss : R.mortar;
  const base = R.stones[Math.floor(tdHash(col, row, 111) * R.stones.length)];
  let c = base;
  if(ly === 1 || lx === 1) c = tdMix(base, TD_LIGHT_RGB, 0.32);
  else if(ly === 4 || lx === 6) c = tdMix(base, TD_SHADE_RGB, 0.22);
  if(d > hw - 2.5) c = tdMix(c, TD_SHADE_RGB, 0.15); // the edge stones sit lower
  return c;
}
