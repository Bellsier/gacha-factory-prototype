// ---------------------------------------------------------------------------
// Task 105: the game's own pixel art. Every sprite is a list of pixel
// rectangles [x, y, w, h, colour] painted by the functions below (no image
// files, no borrowed art), so it is testable without a canvas and travels in
// the single-HTML build. tdSpriteImage() bakes a sprite into a small canvas
// once; the renderer scales it by an integer zoom with smoothing off.
// ---------------------------------------------------------------------------
const TD_RES_COLORS = {
  iron: ['#b8704f', '#e09a72'], coal: ['#2c3034', '#4d545a'], mana: ['#8a5cd6', '#c4a2ff'], crystal: ['#4fc4dc', '#bff3ff'],
  rareMetal: ['#b9c3cc', '#f1f5f8'], relic: ['#c9a24a', '#f2d68c'], cosmicShard: ['#e06fa8', '#ffc0df'], plasma: ['#ff4fcf', '#ffd0f4'],
};

// Collects rectangles; mirrored horizontally when asked.
function tdPainter(w, h){
  const rects = [];
  const P = (x, y, rw, rh, c) => { if(rw > 0 && rh > 0) rects.push([x, y, rw, rh, c]); };
  P.disc = (cx, cy, r, c) => { for(let y = -r; y <= r; y++){ const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); P(cx - hw, cy + y, hw * 2 + 1, 1, c); } };
  P.done = (mirror) => ({ w, h, rects: mirror ? rects.map(([x, y, rw, rh, c]) => [w - x - rw, y, rw, rh, c]) : rects });
  return P;
}

// --- the player: a small miner with a helmet lamp. 16 x 22, feet at the bottom centre.
const TD_PLAYER_COLORS = { helmet: '#e2b23c', helmetDark: '#b58a26', lamp: '#fff3b0', hair: '#5a3b28', skin: '#f0c8a0', skinShade: '#d9a982',
  eye: '#2a2a2a', shirt: '#3fa58f', shirtDark: '#2f8270', overall: '#4a5d7a', overallDark: '#3a4a62', boot: '#5a3b28', pack: '#8a6440' };
function tdPlayerSprite(dir, frame){
  const C = TD_PLAYER_COLORS;
  const P = tdPainter(16, 22);
  const bob = (frame === 1 || frame === 3) ? 1 : 0; // the body sinks a pixel on each step
  const stepA = frame === 1 ? 1 : frame === 3 ? -1 : 0; // leg swing
  const side = dir === 'left' || dir === 'right';
  // shadow
  P(4, 20, 8, 2, 'rgba(0,0,0,0.25)');
  // legs and boots
  if(side){
    P(6 + stepA, 16 + bob, 3, 4, C.overallDark); P(6 + stepA, 19, 4, 2, C.boot);
    P(8 - stepA, 16 + bob, 3, 4, C.overall); P(8 - stepA, 19, 4, 2, C.boot);
  } else {
    P(5, 16 + bob, 3, 4 - Math.max(0, stepA), C.overallDark); P(5, 19 - Math.max(0, stepA), 3, 2, C.boot);
    P(8, 16 + bob, 3, 4 - Math.max(0, -stepA), C.overallDark); P(8, 19 - Math.max(0, -stepA), 3, 2, C.boot);
  }
  // body
  P(4, 9 + bob, 8, 5, C.shirt); P(4, 13 + bob, 8, 4, C.overall); P(5, 9 + bob, 1, 5, C.shirtDark);
  if(dir === 'down'){ P(6, 12 + bob, 1, 2, C.overallDark); P(9, 12 + bob, 1, 2, C.overallDark); P(7, 14 + bob, 2, 1, C.helmet); }
  if(dir === 'up') P(5, 9 + bob, 6, 5, C.pack);
  // arms swing opposite to the legs
  if(side){ P(7 - stepA, 10 + bob, 2, 4, C.shirtDark); P(7 - stepA, 14 + bob, 2, 1, C.skin); }
  else { P(3, 10 + bob + Math.max(0, -stepA), 1, 4, C.shirtDark); P(3, 14 + bob + Math.max(0, -stepA), 1, 1, C.skin);
         P(12, 10 + bob + Math.max(0, stepA), 1, 4, C.shirtDark); P(12, 14 + bob + Math.max(0, stepA), 1, 1, C.skin); }
  // head
  P(4, 3 + bob, 8, 6, C.skin); P(4, 8 + bob, 8, 1, C.skinShade);
  if(dir === 'down'){ P(4, 3 + bob, 1, 3, C.hair); P(11, 3 + bob, 1, 3, C.hair); P(6, 6 + bob, 1, 1, C.eye); P(9, 6 + bob, 1, 1, C.eye); P(7, 8 + bob, 2, 1, '#c98a72'); }
  else if(dir === 'up'){ P(4, 3 + bob, 8, 6, C.hair); P(4, 8 + bob, 8, 1, '#4a2f20'); }
  else { P(4, 3 + bob, 4, 5, C.hair); P(10, 6 + bob, 1, 1, C.eye); P(12, 6 + bob, 1, 2, C.skin); }
  // helmet with a lamp
  P(3, 1 + bob, 10, 3, C.helmet); P(4, 0 + bob, 8, 1, C.helmet); P(3, 3 + bob, 10, 1, C.helmetDark);
  if(dir === 'down') P(7, 1 + bob, 2, 2, C.lamp);
  else if(side) P(12, 1 + bob, 2, 2, C.lamp);
  return P.done(dir === 'left');
}

// --- a vein in the ground: a boulder with ore. 24 x 20, base at the bottom centre.
function tdOreSprite(resource, kind){
  const P = tdPainter(24, 20);
  const undiscovered = kind === 'undiscovered';
  const rock = undiscovered ? ['#6a6660', '#55514c', '#827d76'] : ['#7b766f', '#5e5a55', '#9a948c'];
  P(3, 17, 18, 3, 'rgba(0,0,0,0.25)');
  P.disc(12, 11, 8, rock[0]);
  P(5, 14, 14, 4, rock[1]); P(7, 17, 10, 1, rock[1]);
  P(7, 5, 6, 2, rock[2]); P(6, 7, 3, 2, rock[2]);
  if(undiscovered){
    P(14, 8, 4, 2, '#5f7d4e'); P(15, 7, 2, 1, '#6f8f5c'); // moss
    P(9, 10, 3, 1, rock[1]); P(13, 13, 3, 1, rock[1]);
  } else {
    const [c, hi] = TD_RES_COLORS[resource] || ['#aaa', '#fff'];
    [[8, 9], [13, 7], [15, 11], [10, 13], [6, 11]].forEach(([x, y], k) => { P(x, y, 2, 2, c); if(k % 2 === 0) P(x, y, 1, 1, hi); });
    P(12, 10, 3, 2, c); P(12, 10, 1, 1, hi);
  }
  if(kind === 'secured'){
    P(19, 6, 1, 12, '#8a6440'); P(20, 6, 4, 3, '#3fc9b0'); P(20, 9, 2, 1, '#2f9c88'); // a staked flag
  }
  return P.done(false);
}

// --- the workshop (공방): a cosy cabin, 64 x 58; the door is at the bottom centre.
function tdBaseSprite(){
  const P = tdPainter(64, 58);
  P(4, 54, 56, 4, 'rgba(0,0,0,0.22)');
  // walls
  P(6, 26, 52, 28, '#b08a5a'); for(let y = 30; y < 54; y += 4) P(6, y, 52, 1, '#97734a');
  P(6, 26, 2, 28, '#8a6440'); P(56, 26, 2, 28, '#8a6440');
  // roof
  for(let k = 0; k < 20; k++){ const o = Math.floor(k * 8 / 19); P(10 - o, 6 + k, 44 + 2 * o, 1, k % 4 === 3 ? '#7a3a2e' : '#9a4a3a'); }
  P(10, 6, 44, 1, '#b05a46'); P(2, 24, 60, 3, '#6a3026');
  // chimney
  P(44, 0, 7, 10, '#6a625a'); P(44, 0, 7, 2, '#857c72');
  // windows (warm light) and door
  [[11, 34], [43, 34]].forEach(([x, y]) => { P(x, y, 10, 9, '#5a3b28'); P(x + 1, y + 1, 8, 7, '#f3d27a'); P(x + 5, y + 1, 1, 7, '#5a3b28'); P(x + 1, y + 4, 8, 1, '#5a3b28'); });
  P(26, 36, 12, 18, '#5a3b28'); P(27, 37, 10, 17, '#7a5236'); P(35, 45, 1, 2, '#e2b23c');
  // sign
  P(24, 28, 16, 6, '#7a5236'); P(25, 29, 14, 4, '#c9a26a'); P(27, 30, 10, 1, '#5a3b28'); P(29, 32, 6, 1, '#5a3b28');
  // crates by the wall
  P(51, 47, 7, 7, '#9a7446'); P(51, 47, 7, 1, '#b8915c'); P(54, 47, 1, 7, '#7a5a36');
  return P.done(false);
}

// --- a craft workshop (제작소) by tier 1-3 (Task 79 look tiers), 44 x 40.
function tdWorkshopSprite(tier){
  const P = tdPainter(44, 40);
  const wall = tier >= 3 ? '#8f8a84' : tier === 2 ? '#a07a50' : '#9a7446';
  const roof = tier >= 3 ? '#3f6e8a' : tier === 2 ? '#5a6e3a' : '#6e5a3a';
  const roofDark = tier >= 3 ? '#325a72' : tier === 2 ? '#48592e' : '#58482e';
  P(3, 37, 38, 3, 'rgba(0,0,0,0.22)');
  P(5, 18, 34, 19, wall); for(let y = 22; y < 37; y += 4) P(5, y, 34, 1, 'rgba(0,0,0,0.12)');
  if(tier >= 2) P(5, 33, 34, 4, '#77706a');
  for(let k = 0; k < 14; k++){ const o = Math.floor(k * 6 / 13); P(8 - o, 4 + k, 28 + 2 * o, 1, k % 4 === 3 ? roofDark : roof); }
  P(8, 4, 28, 1, 'rgba(255,255,255,0.18)'); P(2, 17, 40, 2, roofDark);
  P(30, 0, 5, 7, '#5e5850'); // chimney
  P(17, 25, 10, 12, '#4a3626'); P(18, 26, 8, 11, '#6a4a30');
  P(8, 24, 6, 5, '#3a2a1e'); P(9, 25, 4, 3, '#f0a050'); // forge glow window
  P(31, 30, 7, 3, '#4d4d52'); P(32, 28, 5, 2, '#5d5d63'); // anvil
  if(tier >= 3){ P(36, 6, 1, 12, '#5a3b28'); P(37, 6, 5, 4, '#e2b23c'); }
  return P.done(false);
}

// --- scenery on the land beyond (Task 89 kinds) and a few small pieces.
function tdPropSprite(kind){
  let P;
  const tree = (w, h, r, cx, cy, dark, mid, light) => { P = tdPainter(w, h); P(cx - 6, h - 3, 12, 3, 'rgba(0,0,0,0.25)'); P(cx - 2, cy + r - 2, 4, h - (cy + r - 2) - 1, '#5a4030');
    P.disc(cx, cy, r, dark); P.disc(cx - 1, cy - 1, r - 2, mid); P.disc(cx - 3, cy - 3, Math.max(2, r - 6), light); };
  switch(kind){
    case 'bigTree': tree(32, 42, 13, 16, 15, '#2f5634', '#3f6e44', '#5a8e57'); break;
    case 'sparseTree': tree(24, 34, 9, 12, 12, '#3a5d36', '#4f7a46', '#6a9655'); break;
    case 'grass': P = tdPainter(12, 8); P(1, 5, 2, 3, '#5b8a4a'); P(4, 3, 2, 5, '#6b9b55'); P(7, 4, 2, 4, '#5b8a4a'); P(9, 6, 2, 2, '#6b9b55'); break;
    case 'rock': P = tdPainter(16, 12); P(2, 10, 12, 2, 'rgba(0,0,0,0.22)'); P.disc(8, 6, 5, '#77726b'); P(4, 3, 4, 2, '#948e86'); P(5, 9, 7, 1, '#5e5a55'); break;
    case 'clearing': P = tdPainter(34, 16); for(let y = 0; y < 16; y++){ const hw = Math.floor(16 * Math.sqrt(1 - Math.pow((y - 7.5) / 8, 2))); P(17 - hw, y, hw * 2, 1, 'rgba(160,190,110,0.35)'); } P(10, 6, 1, 1, '#e8d38a'); P(22, 9, 1, 1, '#d98aa0'); break;
    case 'exposedVein': case 'undevelopedVein': case 'rareVein': {
      const c = kind === 'rareVein' ? ['#e06fa8', '#ffc0df'] : kind === 'undevelopedVein' ? ['#c3ccd4', '#f1f5f8'] : ['#b8704f', '#e09a72'];
      P = tdPainter(16, 12); P(2, 10, 12, 2, 'rgba(0,0,0,0.2)'); P.disc(8, 6, 5, '#6e6a64'); P(5, 5, 2, 2, c[0]); P(9, 4, 2, 2, c[0]); P(8, 7, 2, 1, c[1]); P(5, 5, 1, 1, c[1]); break; }
    case 'crystal': P = tdPainter(14, 18); P(2, 15, 10, 3, 'rgba(0,0,0,0.25)'); P(5, 3, 4, 13, '#7fd7ec'); P(6, 1, 2, 2, '#bff3ff'); P(2, 8, 3, 8, '#5fc0d8'); P(9, 6, 3, 10, '#6ccbe0'); P(6, 4, 1, 10, '#e8fbff'); break;
    case 'oldShaftEntrance': P = tdPainter(30, 26); P(2, 6, 26, 20, '#5e5a55'); P(6, 10, 18, 16, '#1e1a17'); P(4, 6, 3, 20, '#7a5a36'); P(23, 6, 3, 20, '#7a5a36'); P(3, 5, 24, 3, '#8a6440'); break;
    case 'timberSupport': P = tdPainter(16, 22); P(2, 20, 12, 2, 'rgba(0,0,0,0.2)'); P(2, 4, 3, 17, '#7a5a36'); P(11, 4, 3, 17, '#7a5a36'); P(1, 2, 14, 3, '#8a6440'); break;
    case 'mineCart': P = tdPainter(20, 16); P(2, 14, 16, 2, 'rgba(0,0,0,0.22)'); P(2, 4, 16, 8, '#6a625a'); P(3, 5, 14, 3, '#3a3632'); P(4, 4, 3, 2, '#b8704f'); P(9, 3, 3, 2, '#2c3034'); P(4, 11, 4, 4, '#2b2b2b'); P(12, 11, 4, 4, '#2b2b2b'); break;
    case 'diggingMarks': P = tdPainter(16, 10); P(2, 3, 5, 2, '#6e5a42'); P(8, 6, 6, 2, '#6e5a42'); P(5, 7, 2, 1, '#8a7356'); break;
    case 'lamp': P = tdPainter(8, 22); P(3, 6, 2, 16, '#4a3626'); P(1, 2, 6, 5, '#3a2a1e'); P(2, 3, 4, 3, '#ffd27a'); P(1, 20, 6, 2, 'rgba(0,0,0,0.25)'); break;
    default: P = tdPainter(8, 8); P(2, 2, 4, 4, '#888'); // unknown kind: a pebble
  }
  return P.done(false);
}

// --- Task 114/115/117: the village facilities, by restoration stage.
//   stage 0 ruin (broken walls, rubble, weeds), 1 cleared (foundation and scaffolding), 2 open.
//   The appraiser (감정소) is 44 x 40, the museum (박물관) 60 x 48; the door is at the bottom centre.
//   `exhibits` (museum only) lights that many of its six display niches (one per two relics on show).
function tdVillageSprite(key, stage, exhibits){
  const museum = key === 'museum';
  const W = museum ? 60 : 44, H = museum ? 48 : 40, P = tdPainter(W, H);
  const cx = W / 2, groundY = H - 3;
  const stone = museum ? '#a9a39a' : '#9a7446', stoneDark = museum ? '#7f7a72' : '#7a5a36', stoneLight = museum ? '#c6c0b6' : '#b8915c';
  P(2, H - 3, W - 4, 3, 'rgba(0,0,0,0.22)'); // shadow
  const fw = museum ? 50 : 36, fx = Math.round(cx - fw / 2);
  if(stage <= 0){
    // ruin: a broken wall stump, fallen stones and a beam, weeds
    P(fx, groundY - 8, fw, 8, '#6e6458'); P(fx, groundY - 8, fw, 1, '#8a8072');
    [[0, 14], [6, 9], [fw - 10, 12], [fw - 4, 7]].forEach(([dx, h]) => { P(fx + dx, groundY - 8 - h, 4, h, stoneDark); P(fx + dx, groundY - 8 - h, 4, 1, stoneLight); });
    P(fx + 10, groundY - 6, 12, 2, '#5a3b28'); P(fx + 11, groundY - 7, 10, 1, '#7a5a36'); // a fallen beam
    [[4, -3], [16, -2], [24, -4], [fw - 14, -2]].forEach(([dx, dy]) => { P(fx + dx, groundY + dy, 3, 2, stone); P(fx + dx, groundY + dy, 3, 1, stoneLight); });
    [[2, -1], [13, 0], [fw - 6, -1], [20, -9]].forEach(([dx, dy]) => { P(fx + dx, groundY + dy - 2, 1, 3, '#5b8a4a'); P(fx + dx + 1, groundY + dy - 3, 1, 3, '#6b9b55'); });
    return P.done(false);
  }
  if(stage === 1){
    // cleared: a clean foundation, a scaffold and a stack of materials
    P(fx, groundY - 6, fw, 6, '#8a8072'); P(fx, groundY - 6, fw, 1, '#a39a8c'); P(fx + 1, groundY - 3, fw - 2, 1, 'rgba(0,0,0,0.15)');
    [fx + 2, fx + fw - 4, Math.round(cx) - 1].forEach(x => P(x, groundY - 26, 2, 20, '#8a6440'));
    P(fx + 2, groundY - 20, fw - 4, 2, '#a07a50'); P(fx + 2, groundY - 12, fw - 4, 2, '#a07a50');
    P(fx + 4, groundY - 26, fw - 8, 2, '#a07a50');
    P(fx + fw - 12, groundY - 10, 8, 4, '#b8915c'); P(fx + fw - 12, groundY - 10, 8, 1, '#d0ab76'); // planks
    P(fx + 5, groundY - 9, 6, 3, '#77706a'); P(fx + 5, groundY - 9, 6, 1, '#958d85'); // cut stones
    P(Math.round(cx) - 5, groundY - 30, 10, 3, '#e2b23c'); P(Math.round(cx) - 4, groundY - 29, 8, 1, '#3a2a1e'); // a little sign
    return P.done(false);
  }
  if(!museum){
    // the appraiser: a cottage with a blue roof, a lens on its sign and a lit window
    P(fx, groundY - 18, fw, 18, stone); for(let y = groundY - 14; y < groundY; y += 4) P(fx, y, fw, 1, 'rgba(0,0,0,0.12)');
    for(let k = 0; k < 12; k++){ const o = Math.floor(k * 5 / 11); P(fx + 3 - o, groundY - 31 + k, fw - 6 + 2 * o, 1, k % 4 === 3 ? '#2f5f86' : '#3f7aa8'); }
    P(fx - 2, groundY - 20, fw + 4, 2, '#2f5f86'); P(fx + 3, groundY - 31, fw - 6, 1, 'rgba(255,255,255,0.2)');
    P(Math.round(cx) - 4, groundY - 11, 8, 11, '#4a3626'); P(Math.round(cx) - 3, groundY - 10, 6, 10, '#6a4a30'); // door
    P(fx + 3, groundY - 14, 7, 6, '#3a2a1e'); P(fx + 4, groundY - 13, 5, 4, '#ffd27a'); // window
    P(fx + fw - 10, groundY - 15, 8, 8, '#e8dcc0'); P(fx + fw - 10, groundY - 15, 8, 1, '#5a3b28'); // the sign
    P.disc(fx + fw - 7, groundY - 12, 2, '#3f7aa8'); P(fx + fw - 6, groundY - 12, 1, 1, '#bfe3ff'); P(fx + fw - 5, groundY - 10, 2, 2, '#5a3b28'); // a lens
    return P.done(false);
  }
  // the museum: a stone hall with a pediment, columns and six display niches
  P(fx, groundY - 22, fw, 22, stone); P(fx, groundY - 3, fw, 3, stoneDark);
  for(let k = 0; k < 10; k++){ const o = Math.floor(k * 25 / 9); P(Math.round(cx) - o, groundY - 34 + k, 2 * o, 1, k === 9 ? stoneDark : stoneLight); }
  P(fx - 1, groundY - 24, fw + 2, 2, stoneDark);
  [fx + 2, fx + 10, fx + fw - 12, fx + fw - 4].forEach(x => { P(x, groundY - 22, 2, 19, '#e6e1d8'); P(x + 2, groundY - 22, 1, 19, stoneDark); });
  P(Math.round(cx) - 4, groundY - 13, 8, 13, '#4a3626'); P(Math.round(cx) - 3, groundY - 12, 6, 12, '#6a4a30');
  const lit = Math.max(0, Math.min(6, exhibits || 0));
  for(let k = 0; k < 6; k++){
    const nx = k < 3 ? fx + 14 + (k % 3) * 4 + Math.floor(k % 3) : fx + fw - 26 + (k % 3) * 4 + Math.floor(k % 3), ny = groundY - 17;
    P(nx, ny, 3, 6, '#3a2a1e'); P(nx, ny + 1, 3, 4, k < lit ? '#ffd27a' : '#55504a');
    if(k < lit) P(nx + 1, ny + 2, 1, 2, ['#c98a4a', '#9ab8c8', '#d8c070', '#b07ac8', '#7fd7ec', '#e6e1d8'][k]);
  }
  P(Math.round(cx) - 7, groundY - 31, 14, 4, '#e2b23c'); P(Math.round(cx) - 6, groundY - 30, 12, 2, '#5a3b28'); // the name board
  return P.done(false);
}

// --- Task 112: a torch the player sets down, 10 x 22, with a 3-frame flame.
function tdTorchSprite(frame){
  const P = tdPainter(10, 22);
  P(2, 20, 6, 2, 'rgba(0,0,0,0.25)');
  P(4, 8, 2, 13, '#6a4a30'); P(4, 8, 1, 13, '#7d5a3c'); // the stick
  P(3, 6, 4, 3, '#4a4e58'); P(3, 6, 4, 1, '#6e747c');   // the iron cup
  const flame = [
    [[4, 1, 2, 5, '#f07a30'], [3, 3, 4, 3, '#f0a040'], [4, 3, 2, 2, '#ffe08a']],
    [[4, 0, 2, 6, '#f07a30'], [3, 2, 4, 4, '#f0a040'], [4, 2, 2, 3, '#ffe08a']],
    [[5, 1, 2, 5, '#f07a30'], [3, 3, 4, 3, '#f0a040'], [5, 3, 1, 2, '#fff3b0']],
  ][frame % 3];
  flame.forEach(([x, y, w, h, c]) => P(x, y, w, h, c));
  return P.done(false);
}

// Bakes sprite rects into a canvas (null without a 2D canvas, e.g. in jsdom).
function tdSpriteImage(sprite){
  if(typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = sprite.w; c.height = sprite.h;
  const g = c.getContext && c.getContext('2d');
  if(!g) return null;
  sprite.rects.forEach(([x, y, w, h, col]) => { g.fillStyle = col; g.fillRect(x, y, w, h); });
  return c;
}

// All sprites the renderer needs, baked once.
function tdBuildSpriteSheet(){
  const sheet = { player: {}, ore: {}, workshop: {}, prop: {} };
  ['down', 'up', 'left', 'right'].forEach(d => { sheet.player[d] = [0, 1, 2, 3].map(f => tdSpriteImage(tdPlayerSprite(d, f))); });
  Object.keys(TD_RES_COLORS).forEach(r => { sheet.ore[r] = { unsecured: tdSpriteImage(tdOreSprite(r, 'unsecured')), secured: tdSpriteImage(tdOreSprite(r, 'secured')) }; });
  sheet.ore.undiscovered = tdSpriteImage(tdOreSprite(null, 'undiscovered'));
  sheet.base = tdSpriteImage(tdBaseSprite());
  sheet.torch = [0, 1, 2].map(f => tdSpriteImage(tdTorchSprite(f)));
  [1, 2, 3].forEach(t => { sheet.workshop[t] = tdSpriteImage(tdWorkshopSprite(t)); });
  ['bigTree', 'sparseTree', 'grass', 'rock', 'clearing', 'exposedVein', 'undevelopedVein', 'rareVein', 'crystal', 'oldShaftEntrance', 'timberSupport', 'mineCart', 'diggingMarks', 'lamp']
    .forEach(k => { sheet.prop[k] = tdSpriteImage(tdPropSprite(k)); });
  return sheet;
}
