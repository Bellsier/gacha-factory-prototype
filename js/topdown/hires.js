// ---------------------------------------------------------------------------
// Resolution experiment (opt-in: ?style=v2&res=1.5 or ?style=v2&res=2).
// The player and the house are drawn on a finer grid — R sprite pixels per art
// pixel — and shown at zoom / R screen pixels each, so their size on screen,
// their anchors, collision and every system stay exactly as at R = 1.
// The finer grid buys thinner outlines, smoother curves and small details
// (hair strands, eye highlights, shingle edges, wood grain, door rivets).
// Everything else (tiles, other buildings) stays at R = 1. Nothing is saved.
// ---------------------------------------------------------------------------
const TD_RES_CACHE = { r: null, auto: null };
function tdResParam(){
  try { return typeof tdStyleV2 === 'function' && tdStyleV2() ? new URLSearchParams(window.location.search).get('res') : null; } catch(e){ return null; }
}
// ?res=auto: the finer grid only where it stays crisp — a sprite pixel must be a whole number of
// device pixels, so 1.5x needs zoom x device ratio (as the v2 style snaps it) to be a multiple of 3;
// anywhere else the 1x sprites (always whole) are used.
function tdResAutoPick(zoom, dpr){
  const dev = Math.max(1, Math.round(zoom * dpr));
  return dev % 3 === 0 ? 1.5 : 1;
}
function tdResFactor(){
  if(TD_RES_CACHE.r !== null) return TD_RES_CACHE.r;
  const p = tdResParam();
  let r = p === '2' ? 2 : p === '1.5' ? 1.5 : 1;
  if(p === 'auto'){
    TD_RES_CACHE.auto = true;
    try { r = tdResAutoPick(topdownZoom(window.innerWidth, window.innerHeight), Math.max(1, Math.min(3, window.devicePixelRatio || 1))); } catch(e){ r = 1; }
  }
  TD_RES_CACHE.r = r;
  return r;
}
// Called on every resize: with ?res=auto, a new zoom or device ratio may call for the other sprite set.
function tdResOnResize(zoom, dpr){
  if(TD_RES_CACHE.auto !== true) return false;
  const r = tdResAutoPick(zoom, dpr);
  if(r === TD_RES_CACHE.r) return false;
  TD_RES_CACHE.r = r;
  return true;
}

// A painter sprite's rects on an R-times finer grid (edges rounded to it), as pixels; see-through rects dropped.
function tdRasterAt(sp, R, keepAlpha){
  const W = Math.round(sp.w * R), H = Math.round(sp.h * R);
  const rects = sp.rects.filter(r => keepAlpha || !/^rgba/.test(r[4])).map(([x, y, w, h, c]) => {
    const x0 = Math.round(x * R), y0 = Math.round(y * R);
    return [x0, y0, Math.round((x + w) * R) - x0, Math.round((y + h) * R) - y0, c];
  });
  return tdRaster({ w: W, h: H, rects });
}

// Cuts convex corners (open on two touching sides) in rows y0..y1 — run twice for a two-step curve.
function tdCutCorners(r, y0, y1){
  const W = r.w, px = r.px, solid = (x, y) => x >= 0 && y >= 0 && x < W && y < r.h && !!px[y * W + x] && px[y * W + x][3] >= 1, cut = [];
  for(let y = y0; y <= y1; y++) for(let x = 0; x < W; x++){
    if(!solid(x, y)) continue;
    const up = !solid(x, y - 1), dn = !solid(x, y + 1), lf = !solid(x - 1, y), rt = !solid(x + 1, y);
    if((up && lf && !dn && !rt) || (up && rt && !dn && !lf)) cut.push(y * W + x);
  }
  cut.forEach(k => { px[k] = null; });
}

const tdSameRGB = (p, c) => !!p && p[0] === c[0] && p[1] === c[1] && p[2] === c[2];

// --- the player at R --------------------------------------------------------------
function tdPlayerSpriteRes(dir, frame, R){
  const C = TD_PLAYER_COLORS, col = k => tdParseColor(C[k]);
  const r = tdRasterAt(tdPlayerSprite(dir, frame), R, false), W = r.w, H = r.h, px = r.px;
  const hair = col('hair'), hairDark = col('hairDark'), fur = col('fur'), furShade = col('furShade'), parka = col('parka'), eye = col('eye'), boot = col('boot');
  // hair strands: thin diagonal darker lines through the hair mass
  const step = R >= 2 ? 5 : 4;
  for(let y = 0; y < Math.round(9 * R); y++) for(let x = 0; x < W; x++){
    const p = px[y * W + x];
    if(tdSameRGB(p, hair) && (x + y + (dir === 'left' ? 1 : 0)) % step === 0) px[y * W + x] = tdMix(p, hairDark, 0.32);
  }
  // fur: a soft speckle; parka: a quilted line every few rows; boots: a lace highlight
  for(let k = 0; k < px.length; k++){
    const p = px[k], x = k % W, y = (k - x) / W;
    if(tdSameRGB(p, fur) && tdHash(x, y, 121) < 0.22) px[k] = furShade.slice();
    else if(tdSameRGB(p, parka) && y % Math.round(3 * R) === 0) px[k] = tdMix(p, col('parkaDark'), 0.35);
    else if(tdSameRGB(p, boot) && y % Math.round(2 * R) === 0 && x % 2 === 0) px[k] = tdMix(p, [255, 238, 205], 0.25);
  }
  // eyes: one bright catch-light at the top inner corner of each eye
  const eyes = [];
  for(let k = 0; k < px.length; k++) if(tdSameRGB(px[k], eye)) eyes.push(k);
  eyes.forEach(k => { const x = k % W, y = (k - x) / W; if(!tdSameRGB(px[(y - 1) * W + x], eye) && !tdSameRGB(px[y * W + x - 1], eye)) px[k] = [255, 250, 240, 1]; });
  // a two-step curve on the head and the shoulders, then the finishing pass (outline one fine pixel thick)
  tdCutCorners(r, 0, Math.round(11 * R)); if(R >= 2) tdCutCorners(r, 0, Math.round(6 * R));
  const clean = ['eye', 'eyeLight', 'lamp', 'blush', 'mouth'].map(k => col(k).slice(0, 3).join()).concat(['255,250,240']);
  tdStylize(r, { keep: p => clean.includes(p.slice(0, 3).join()), outline: 0.58, light: 0.18, shade: 0.14 });
  // hair sheen under the top outline, as at R = 1
  for(let x = 0; x < W; x++){
    let y = 0; while(y < 6 * R && !r.px[y * W + x]) y++;
    const k = (y + 1) * W + x, p = r.px[k];
    if(y < 6 * R && p && p[2] - p[0] > 60) r.px[k] = tdMix(p, [154, 184, 239], 0.32);
  }
  // a stepped oval shadow on the finer grid
  const cx = W / 2, cy = 20.7 * R, rx = 4.6 * R, ry = 0.95 * R;
  for(let y = Math.floor(19.5 * R); y < H; y++) for(let x = 0; x < W; x++){
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2, k = y * W + x;
    if(d <= 1 && (!r.px[k] || r.px[k][3] < 1)) r.px[k] = [30, 26, 34, d < 0.45 ? 0.3 : 0.2];
  }
  return tdUnraster(r);
}

// --- the house at R: the v2 house on the finer grid, with the roof, the door and the
// wall boards redrawn natively at R (finer shingle tabs, a round arch, grain and rivets).
function tdHouseSpriteRes(R){
  const base = tdRaster(tdHouseSpriteV2()), W = Math.round(base.w * R), H = Math.round(base.h * R), px = new Array(W * H).fill(null);
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){ const p = base.px[Math.min(base.h - 1, Math.floor(y / R)) * base.w + Math.min(base.w - 1, Math.floor(x / R))]; px[y * W + x] = p ? p.slice() : null; }
  const at = (ax, ay) => base.px[Math.floor(ay) * base.w + Math.floor(ax)];
  const hex = c => tdParseColor(c);
  const shingle = [['#80b96c', '#6aa35a', '#5a9150'], ['#629a55', '#4f8246', '#447a40'], ['#4e8146', '#3f6b3a', '#365f33']];
  // roof: inside the slope (one art pixel in from its edge), finer tabs with a rounded lower lip
  for(let y = Math.round(9 * R); y < Math.round(34 * R); y++){
    const ay = y / R, o = (ay - 8) * 16 / 26, x0 = (20 - o) * R, x1 = (64 + o) * R;
    for(let x = Math.ceil(x0 + R); x < Math.floor(x1 - R); x++){
      const ax = x / R, prev = at(ax, ay);
      if(!prev || TD_HOUSE_V2_GLOW.includes(tdColorKey(prev))) continue;
      if(ax > 56 && ax < 67 && ay < 17) continue; // the chimney stays
      const th = 2.2 * R, tw = 4.4 * R, band = Math.floor((y - 8 * R) / th), ly = (y - 8 * R) - band * th;
      const sx = x - 20 * R + 40 * R + (band % 2) * tw / 2, tab = Math.floor(sx / tw), lx = sx - tab * tw;
      const lit = 1 - (((tab * tw + tw / 2) / R - 40 - (x0 / R - 20)) / (x1 / R - x0 / R) * 0.62 + (ay - 8) / 27 * 0.48) + (tdHash(tab, band, 75) - 0.5) * 0.3;
      const t = shingle[lit > 0.58 ? 0 : lit > 0.24 ? 1 : 2];
      let c = hex(t[1]);
      if(ly < 1) c = hex(t[0]);
      else if(ly >= th - 1) c = (lx < 1 || lx >= tw - 1) ? tdMix(hex(t[2]), [34, 60, 34], 0.45) : hex(t[2]);
      else if(lx < 1) c = tdMix(hex(t[1]), hex(t[2]), 0.6);
      if(t === shingle[0] && ly >= 1 && ly < 2 && lx >= 1 && lx < 2) c = tdMix(c, [255, 238, 205], 0.18); // a glint on the lit tabs' corners
      if(tdHash(x, y, 131) < 0.006) c = hex('#8ec275');
      px[y * W + x] = c;
    }
  }
  // door: a round arch, planks with fine grain, iron straps with rivets, a ring handle
  const dcx = 42 * R, dTop = 43 * R, dBot = 68 * R, dHalf = 8 * R, inHalf = 6 * R, archR = 14 * R, inR = 12 * R; // gentle arches
  for(let y = Math.round(dTop); y < Math.round(dBot); y++) for(let x = Math.round(dcx - dHalf); x < Math.round(dcx + dHalf); x++){
    const dx = x + 0.5 - dcx, yy = y + 0.5, archY = dTop + archR - Math.sqrt(Math.max(0, archR * archR - dx * dx));
    const k = y * W + x;
    if(yy < archY){ const w0 = at(x / R, 41.5); if(w0) px[k] = w0.slice(); continue; } // the wall shows above the arch
    const inArch = dTop + R * 2 + inR - Math.sqrt(Math.max(0, inR * inR - dx * dx));
    if(Math.abs(dx) >= inHalf || yy < inArch){ px[k] = hex('#5a3b28'); if(Math.abs(dx) >= inHalf - 0.5 && Math.abs(dx) < inHalf + 0.5) px[k] = hex('#4a3020'); continue; }
    const plank = Math.floor((dx + inHalf) / (3 * R)), lx = (dx + inHalf) - plank * 3 * R;
    const b = hex(['#94603a', '#8a5a36', '#9a663e', '#8f5d38'][plank % 4]);
    let c = lx < 1 ? tdMix(b, [255, 238, 205], 0.18) : lx >= 3 * R - 1 ? hex('#6e4528') : b;
    if(tdHash(Math.floor(x / 2), y, 133 + plank) < 0.08) c = tdMix(b, hex('#6e4528'), 0.45); // grain
    px[k] = c;
  }
  [50, 62].forEach(ay => { for(let x = Math.round(dcx - inHalf); x < Math.round(dcx + inHalf); x++) for(let y = Math.round(ay * R); y < Math.round((ay + 1) * R); y++) px[y * W + x] = hex('#4b4440'); [-inHalf + R, inHalf - 2 * R, -1].forEach(o => { const xx = Math.round(dcx + o), yy = Math.round(ay * R); px[yy * W + xx] = hex('#a39a90'); }); });
  rect2(px, W, Math.round(39 * R), Math.round(48 * R), Math.round(6 * R), Math.round(4 * R), hex('#3a2a1e')); rect2(px, W, Math.round(40 * R), Math.round(49 * R), Math.round(4 * R), Math.round(2 * R), hex('#f6d27c')); px[Math.round(49 * R) * W + Math.round(40 * R)] = hex('#fff0b8');
  ringHandle(px, W, Math.round(45.5 * R), Math.round(57 * R), R);
  // wall boards: a fine grain line inside each board and a nail at each board end
  for(let y = Math.round(36 * R); y < Math.round(65 * R); y++) for(let x = Math.round(12 * R); x < Math.round(72 * R); x++){
    const p = at(x / R, y / R), k = y * W + x;
    if(!p || !['#ecd5a4', '#e6cc96', '#efdbae', '#e2c68e'].includes(tdColorKey(p))) continue;
    if((y % Math.round(4 * R)) === Math.round(2 * R) && tdHash(Math.floor(x / 3), y, 137) < 0.5) px[k] = tdMix(p, hex('#c09a62'), 0.4);
  }
  return tdUnraster({ w: W, h: H, px });
}
function rect2(px, W, x, y, w, h, c){ for(let yy = y; yy < y + h; yy++) for(let xx = x; xx < x + w; xx++) px[yy * W + xx] = c.slice(); }
function ringHandle(px, W, cx, cy, R){
  const rr = 1.2 * R;
  for(let y = Math.floor(cy - rr - 1); y <= cy + rr + 1; y++) for(let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++){
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if(Math.abs(d - rr) < 0.6) px[y * W + x] = d < rr && y < cy ? [247, 218, 122, 1] : [214, 168, 58, 1];
  }
}

// --- the player hand-tuned for 24 x 33 (R = 1.5) ------------------------------------
// The body (parka, arms, lantern, pack, collar) comes from the 1x drawing on the
// finer grid; the head and the legs are drawn for this size: a rounded crown
// with a few spikes, a jagged fringe, side locks, 2 x 3 eyes with a catch-light,
// blush and a small mouth; solid legs (outline on the outer side, shade on the
// inner side — no stripes) and boots with a fur cuff, a highlight and a sole.
// Hand-drawn pixels are marked (index 4) so the finishing pass leaves them.
const TD_P15 = {
  O: '#1c2a52', D: '#2a4176', H: '#3d5c9e', L: '#6487cc', S: '#a3c0f2',
  k: '#f3d2b4', s: '#e2b597', q: '#b07a62', e: '#4a3326', E: '#8a5c40', w: '#fffaf0', b: '#eaa598', m: '#c98472',
  p: '#6c7076', P: '#55595e', g: '#34363e', f: '#d6c1a0', F: '#f2e4ca', u: '#bf8a4c', U: '#8c5f30', y: '#d9a868', z: '#4e3320',
};
function tdP15Head(dir){
  const W = 24, H = 14, g = Array.from({ length: H }, () => new Array(W).fill('.'));
  const set = (x, y, c) => { if(x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  const side = dir === 'side', back = dir === 'up';
  const cx = side ? 10.4 : 11.5, cy = 7.1, rx = side ? 7.9 : 8.3, ry = 6.2;
  // the hair mass: an ellipse, darker low down, a lit arc at the top left
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if(d <= 1) set(x, y, y >= 9 ? 'D' : 'H');
  }
  // the messy crown: little tufts two pixels tall (the 1x sprite's spikes)
  const tuft = (x, tall) => { set(x, 1, 'H'); if(tall){ set(x, 0, 'H'); set(x - 1, 1, 'H'); set(x + 1, 1, 'H'); } };
  (side ? [[7, true], [11, true], [14, false]] : back ? [[8, true], [12, true], [15, false]] : [[8, true], [13, true], [11, false]]).forEach(([x, t]) => tuft(x, t));
  // face (front and side), or the back of the head
  if(dir === 'down'){
    for(let y = 6; y < H; y++) for(let x = 6; x <= 17; x++){
      if(y === 13 && (x < 8 || x > 15)) continue; if(y === 12 && (x < 7 || x > 16)) continue;
      set(x, y, 'k');
    }
    [8, 7, 8, 9, 8, 7, 7, 8, 9, 8, 7, 8].forEach((end, i) => { for(let y = 6; y <= end; y++) set(6 + i, y, y === end ? 'D' : 'H'); set(6 + i, end + 1, 's'); }); // the fringe and its shadow
    for(let y = 6; y <= 12; y++){ set(5, y, 'H'); set(18, y, 'H'); } for(let y = 6; y <= 10; y++){ set(4, y, 'D'); set(19, y, 'D'); } // side locks
    [[8, 9, 'e'], [9, 9, 'e'], [8, 10, 'w'], [9, 10, 'e'], [8, 11, 'E'], [9, 11, 'E'], [14, 9, 'e'], [15, 9, 'e'], [14, 10, 'w'], [15, 10, 'e'], [14, 11, 'E'], [15, 11, 'E']].forEach(([x, y, c]) => set(x, y, c));
    [[7, 12, 'b'], [8, 12, 'b'], [15, 12, 'b'], [16, 12, 'b'], [11, 12, 'm'], [12, 12, 'm'], [17, 9, 's'], [17, 10, 's'], [17, 11, 's'], [9, 13, 's'], [14, 13, 's']].forEach(([x, y, c]) => set(x, y, c));
  } else if(back){
    for(let y = 6; y < H; y++) for(let x = 5; x <= 18; x++){ if(y === 13 && (x < 7 || x > 16)) continue; if(y === 12 && (x < 6 || x > 17)) continue; set(x, y, y >= 11 ? 'D' : 'H'); }
    [[11, 4], [10, 5], [12, 5], [9, 7], [14, 7], [8, 9], [15, 9]].forEach(([x, y]) => set(x, y, 'D')); // a soft swirl from the crown, parting outward
    [7, 9, 12, 14, 16].forEach(x => set(x, 13, '.')); // pointed tips at the nape
  } else { // facing right; the left view is its mirror
    for(let y = 5; y < H; y++) for(let x = 10; x <= 18; x++){ if(y === 13 && (x < 11 || x > 17)) continue; if(y === 5 && x < 13) continue; set(x, y, 'k'); }
    set(19, 9, 'k'); set(19, 10, 'k'); set(19, 11, 's'); // the nose
    [6, 7, 6, 7, 6, 6].forEach((end, i) => { for(let y = 4; y <= end; y++) set(12 + i, y, y === end ? 'D' : 'H'); set(12 + i, end + 1, 's'); });
    for(let y = 6; y <= 12; y++) for(let x = 3; x <= 10; x++) set(x, y, y >= 10 || x < 5 ? 'D' : 'H');
    for(let y = 6; y <= 10; y++) set(11, y, 'H'); // the lock in front of the ear
    [[15, 9, 'e'], [16, 9, 'e'], [15, 10, 'w'], [16, 10, 'e'], [15, 11, 'E'], [16, 11, 'E'], [16, 12, 'b'], [17, 12, 'b'], [18, 12, 'm'], [13, 12, 's'], [13, 13, 's']].forEach(([x, y, c]) => set(x, y, c));
  }
  // light: an arc of lit hair top left with a sheen; strands in the crown
  [[6, 2], [7, 2], [8, 1], [9, 1], [10, 1], [5, 3], [6, 3]].forEach(([x, y]) => { if(g[y][x] === 'H') g[y][x] = 'L'; });
  [[8, 2], [9, 2]].forEach(([x, y]) => { if(g[y][x] === 'H' || g[y][x] === 'L') g[y][x] = 'S'; });
  [[13, 3], [14, 4], [10, 4], [16, 5]].forEach(([x, y]) => { if(g[y][x] === 'H') g[y][x] = 'D'; });
  // outline: hair edges navy, skin edges warm brown (only where they meet the outside)
  const out = g.map(r => r.slice()), empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || g[y][x] === '.';
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const c = g[y][x]; if(c === '.') continue;
    if(empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || (y < H - 1 && empty(x, y + 1))) out[y][x] = 'HDLS'.includes(c) ? 'O' : 'ks'.includes(c) ? 'q' : c;
  }
  return out;
}
// The legs for one frame: rows 24..31; front/back legs side by side, or scissoring in profile.
function tdP15Legs(px, W, dir, s){
  const put = (x, y, c) => { if(x >= 0 && x < W && y >= 0) px[y * W + x] = [...tdParseColor(TD_P15[c]).slice(0, 3), 1, 1]; };
  const boot = (x, y, flip) => { // 5 wide: cuff, two rows of leather, a darker row, the sole
    const rows = flip ? ['ffFff', 'Uuuyg', 'UUuug', 'UUUUg', 'zzzzz'] : ['ffFff', 'gyuuU', 'guuUU', 'gUUUU', 'zzzzz'];
    rows.forEach((r, k) => [...r].forEach((c, i) => put(x + i, y + k, c)));
  };
  const leg = (x, y0, y1, outerLeft) => { for(let y = y0; y <= y1; y++) [...(outerLeft ? 'gppP' : 'ppPg')].forEach((c, i) => put(x + i, y, c)); };
  if(dir === 'left' || dir === 'right'){
    const back = s === 0 ? 0 : 2, bx = Math.round((6 - s) * 1.5) - 1, fx = Math.round((8 + s) * 1.5);
    for(let y = 24; y <= 26 - back; y++) [...'gPPg'].forEach((c, i) => put(bx + i, y, c)); boot(bx - 1, 27 - back, false);
    leg(fx, 24, 26, true); boot(fx, 27, false);
  } else {
    const l = Math.max(0, s) * 2, r = Math.max(0, -s) * 2;
    leg(7, 24, 26 - l, true); boot(6, 27 - l, false);
    leg(13, 24, 26 - r, false); boot(13, 27 - r, true);
  }
}
function tdPlayerSprite15(dir, frame){
  const R = 1.5, W = 24, H = 33, C = TD_PLAYER_COLORS, b = (frame === 1 || frame === 3) ? 1 : 0, s = frame === 1 ? 1 : frame === 3 ? -1 : 0, bob = b * 2;
  const legCols = ['pants', 'pantsDark', 'boot', 'bootDark'].map(k => C[k]);
  // the body from the 1x drawing: no head (rows above the collar), no legs, no shadow; un-bobbed, then bobbed by `bob`
  const body = tdPlayerSprite(dir, frame).rects.filter(([x, y, w, h, c]) => !/^rgba/.test(c) && y - b + h > 9 && !legCols.includes(c) && !(c === C.furShade && y >= 17))
    .map(([x, y, w, h, c]) => [x, y - b, w, h, c]);
  const r = tdRasterAt({ w: 16, h: 22, rects: body }, R, false), px = new Array(W * H).fill(null);
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){ const q = r.px[y * W + x]; if(q && y + bob < H) px[(y + bob) * W + x] = q; }
  tdP15Legs(px, W, dir, s);
  // the finishing pass on the body only (the legs are drawn finished)
  const R2 = { w: W, h: H, px };
  tdStylize(R2, { keep: p => p[4] === 1 || [C.lamp].map(c => tdParseColor(c).slice(0, 3).join()).includes(p.slice(0, 3).join()), outline: 0.55, light: 0.16, shade: 0.12 });
  // the head over the collar's top, with the bob
  const head = tdP15Head(dir === 'left' || dir === 'right' ? 'side' : dir), flip = dir === 'left';
  head.forEach((row, y) => row.forEach((c, x) => { if(c !== '.' && y + bob < H) R2.px[(y + bob) * W + (flip ? W - 1 - x : x)] = [...tdParseColor(TD_P15[c]).slice(0, 3), 1, 1]; }));
  // the shadow: a stepped oval under the feet
  for(let y = 30; y < H; y++) for(let x = 0; x < W; x++){
    const d = ((x + 0.5 - W / 2) / 7) ** 2 + ((y + 0.5 - 31.6) / 1.5) ** 2, k = y * W + x;
    if(d <= 1 && !R2.px[k]) R2.px[k] = [30, 26, 34, d < 0.45 ? 0.3 : 0.2];
  }
  return tdUnraster(R2);
}
