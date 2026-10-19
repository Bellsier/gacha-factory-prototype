// ---------------------------------------------------------------------------
// Resolution experiment (opt-in: ?style=v2&res=1.5 or ?style=v2&res=2).
// The player and the house are drawn on a finer grid — R sprite pixels per art
// pixel — and shown at zoom / R screen pixels each, so their size on screen,
// their anchors, collision and every system stay exactly as at R = 1.
// The finer grid buys thinner outlines, smoother curves and small details
// (hair strands, eye highlights, shingle edges, wood grain, door rivets).
// Everything else (tiles, other buildings) stays at R = 1. Nothing is saved.
// ---------------------------------------------------------------------------
const TD_RES_CACHE = { r: null };
function tdResFactor(){
  if(TD_RES_CACHE.r !== null) return TD_RES_CACHE.r;
  let r = 1;
  try { const p = new URLSearchParams(window.location.search).get('res'); r = typeof tdStyleV2 === 'function' && tdStyleV2() ? (p === '2' ? 2 : p === '1.5' ? 1.5 : 1) : 1; } catch(e){ r = 1; }
  TD_RES_CACHE.r = r;
  return r;
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
