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

// --- the player: the blue-haired northern miner (the approved character sheet,
// 2026-10-18). Cobalt hair, a soft gender-neutral face, a brown winter parka
// with a cream fur collar and hem, teal pattern trim, a small backpack with a
// bedroll, grey trousers and ochre fur-cuffed boots; a little lantern hangs at
// the hip (the light the game's headlamp glow comes from). 16 x 22 like the
// sprite it replaces, feet at the bottom centre, so the size against the tiles
// and every collision and light offset stay the same. Left is the mirror of right.
const TD_PLAYER_COLORS = {
  hair: '#3d5c9e', hairDark: '#2a4176', hairLight: '#6487cc',
  skin: '#f3d2b4', skinShade: '#dfb293', eye: '#4a3326', eyeLight: '#8a5c40', blush: '#eaa598', mouth: '#d99a86',
  parka: '#a8774a', parkaDark: '#7c5333', parkaLight: '#c4935e', fur: '#f2e4ca', furShade: '#d6c1a0',
  trim: '#4d8ca3', leather: '#6b4128', buckle: '#d8a84a', glove: '#5a3a26',
  pants: '#6c7076', pantsDark: '#55595e', boot: '#bf8a4c', bootDark: '#8c5f30',
  pack: '#8a5a36', packDark: '#6b4128', roll: '#8d9096', rollDark: '#6f7277',
  lamp: '#fff3b0', lampFrame: '#4a3626',
};
function tdPlayerSprite(dir, frame){
  const C = TD_PLAYER_COLORS;
  const P = tdPainter(16, 22);
  const b = (frame === 1 || frame === 3) ? 1 : 0;       // the body sinks a pixel on each step
  const s = frame === 1 ? 1 : frame === 3 ? -1 : 0;     // which leg swings forward
  const side = dir === 'left' || dir === 'right';
  P(3, 20, 10, 2, 'rgba(0,0,0,0.25)'); // shadow
  // a boot with its fur cuff: x, top row, and how many rows of leg show above it
  const boot = (x, y, w) => { P(x, y, w, 1, C.furShade); P(x, y + 1, w, 2, C.boot); P(x, y + 2, w, 1, C.bootDark); };
  if(side){
    // legs scissor: the near leg forward on one step, back on the other (drawn facing right)
    // the back foot lifts a pixel as it swings; both stand on the same ground line as the front view
    const back = s === 0 ? 0 : 1;
    P(6 - s, 16, 2, 2 - back, C.pantsDark); boot(5 - s, 18 - back, 3);
    P(8 + s, 16, 2, 2, C.pants); boot(8 + s, 18, 3);
  } else {
    // front and back: the stepping foot lifts a pixel
    const l = Math.max(0, s), r = Math.max(0, -s);
    P(5, 16, 2, 1, C.pants); boot(4, 18 - l, 3);
    P(9, 16, 2, 1, C.pants); boot(9, 18 - r, 3);
    P(5, 17 - l, 2, 1, C.pantsDark); P(9, 17 - r, 2, 1, C.pantsDark);
  }
  if(dir === 'down'){
    // parka body with a diagonal strap, a belt and the teal pattern above the fur hem
    P(4, 10 + b, 8, 5, C.parka); P(4, 10 + b, 1, 5, C.parkaDark); P(11, 10 + b, 1, 5, C.parkaDark);
    for(let k = 0; k < 3; k++) P(5 + k, 11 + b + k, 1, 1, C.leather);
    P(4, 13 + b, 8, 1, C.leather); P(7, 13 + b, 2, 1, C.buckle);
    P(5, 14 + b, 1, 1, C.trim); P(7, 14 + b, 2, 1, C.trim); P(10, 14 + b, 1, 1, C.trim);
    P(3, 15 + b, 10, 1, C.fur); P(4, 15 + b, 1, 1, C.furShade); P(8, 15 + b, 1, 1, C.furShade); P(11, 15 + b, 1, 1, C.furShade);
    // sleeves swing opposite to the legs; gloves; the lantern in the right hand (viewer's left)
    const la = Math.max(0, -s), ra = Math.max(0, s);
    P(2, 10 + b + la, 2, 4, C.parkaLight); P(2, 10 + b + la, 1, 4, C.parkaDark); P(2, 14 + b + la, 2, 1, C.glove);
    P(12, 10 + b + ra, 2, 4, C.parkaLight); P(13, 10 + b + ra, 1, 4, C.parkaDark); P(12, 14 + b + ra, 2, 1, C.glove);
    P(2, 15 + b + la, 2, 1, C.lampFrame); P(2, 16 + b + la, 2, 2, C.lamp); P(2, 18 + b + la, 2, 1, C.lampFrame);
    // the big fur collar round the chin
    P(3, 9 + b, 10, 2, C.fur); P(2, 10 + b, 1, 1, C.fur); P(13, 10 + b, 1, 1, C.fur); P(4, 10 + b, 8, 1, C.furShade);
    // face: soft round cheeks, brown eyes with a light, a little blush
    P(4, 4 + b, 8, 5, C.skin); P(5, 8 + b, 6, 1, C.skinShade);
    P(5, 6 + b, 1, 2, C.eye); P(10, 6 + b, 1, 2, C.eye); P(5, 6 + b, 1, 1, C.eyeLight); P(10, 6 + b, 1, 1, C.eyeLight);
    P(4, 8 + b, 1, 1, C.blush); P(11, 8 + b, 1, 1, C.blush); P(7, 8 + b, 2, 1, C.mouth);
    // cobalt hair: a messy crown, spiky bangs and side locks to the collar
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 2, C.hair); P(5, 0 + b, 1, 1, C.hair); P(8, 0 + b, 2, 1, C.hair); P(11, 1 + b, 1, 1, C.hairDark);
    P(4, 4 + b, 8, 1, C.hair); P(4, 5 + b, 1, 1, C.hair); P(6, 5 + b, 2, 1, C.hair); P(9, 5 + b, 1, 1, C.hair); P(11, 5 + b, 1, 1, C.hair);
    P(3, 4 + b, 1, 5, C.hair); P(12, 4 + b, 1, 5, C.hair); P(3, 7 + b, 1, 2, C.hairDark); P(12, 7 + b, 1, 2, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(9, 1 + b, 1, 1, C.hairLight); P(4, 3 + b, 1, 1, C.hairDark); P(10, 3 + b, 2, 1, C.hairDark);
  } else if(dir === 'up'){
    // from behind: the backpack with its bedroll fills the back of the parka
    P(4, 10 + b, 8, 5, C.parka); P(3, 15 + b, 10, 1, C.fur); P(5, 15 + b, 1, 1, C.furShade); P(10, 15 + b, 1, 1, C.furShade);
    const la = Math.max(0, s), ra = Math.max(0, -s);
    P(2, 10 + b + la, 2, 4, C.parkaLight); P(2, 10 + b + la, 1, 4, C.parkaDark); P(2, 14 + b + la, 2, 1, C.glove);
    P(12, 10 + b + ra, 2, 4, C.parkaLight); P(13, 10 + b + ra, 1, 4, C.parkaDark); P(12, 14 + b + ra, 2, 1, C.glove);
    P(4, 11 + b, 8, 5, C.pack); P(4, 15 + b, 8, 1, C.packDark); P(5, 12 + b, 2, 2, C.packDark); P(9, 12 + b, 2, 2, C.packDark); P(7, 11 + b, 2, 4, C.leather);
    P(3, 9 + b, 10, 2, C.fur); P(4, 10 + b, 8, 1, C.furShade);
    P(4, 10 + b, 8, 2, C.roll); P(4, 11 + b, 8, 1, C.rollDark); P(6, 10 + b, 1, 2, C.leather); P(9, 10 + b, 1, 2, C.leather);
    // the back of the head: all hair, a few spikes and a darker nape
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 7, C.hair); P(5, 0 + b, 1, 1, C.hair); P(8, 0 + b, 2, 1, C.hair);
    P(4, 8 + b, 8, 1, C.hairDark); P(3, 6 + b, 1, 3, C.hairDark); P(12, 6 + b, 1, 3, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(9, 3 + b, 2, 1, C.hairLight); P(6, 5 + b, 1, 2, C.hairDark); P(9, 6 + b, 1, 2, C.hairDark);
  } else {
    // facing right: the backpack and bedroll behind, the parka, one arm swinging with the lantern
    P(2, 10 + b, 4, 6, C.pack); P(2, 10 + b, 1, 6, C.packDark); P(2, 15 + b, 4, 1, C.packDark); P(3, 12 + b, 2, 2, C.packDark);
    P(2, 8 + b, 4, 2, C.roll); P(2, 9 + b, 4, 1, C.rollDark);
    P(5, 10 + b, 7, 5, C.parka); P(11, 10 + b, 1, 5, C.parkaDark); P(5, 13 + b, 7, 1, C.leather); P(10, 13 + b, 1, 1, C.buckle);
    P(7, 14 + b, 1, 1, C.trim); P(9, 14 + b, 1, 1, C.trim);
    P(4, 15 + b, 9, 1, C.fur); P(6, 15 + b, 1, 1, C.furShade); P(10, 15 + b, 1, 1, C.furShade);
    P(5, 10 + b, 1, 4, C.leather); // the pack strap over the shoulder
    // the lantern hangs from the belt at the front of the hip, above the legs
    P(11, 12 + b, 2, 1, C.lampFrame); P(11, 13 + b, 2, 2, C.lamp); P(11, 15 + b, 2, 1, C.lampFrame);
    // the near arm swings forward and back
    const ax = 8 + s;
    P(ax, 10 + b, 2, 4, C.parkaLight); P(ax, 13 + b, 2, 1, C.parkaDark); P(ax, 14 + b, 2, 1, C.glove);
    // the fur collar
    P(4, 9 + b, 8, 2, C.fur); P(5, 10 + b, 6, 1, C.furShade);
    // face in profile: cheek, one eye, a hint of nose
    P(7, 4 + b, 5, 5, C.skin); P(8, 8 + b, 4, 1, C.skinShade); P(12, 6 + b, 1, 2, C.skin);
    P(10, 6 + b, 1, 2, C.eye); P(10, 6 + b, 1, 1, C.eyeLight); P(10, 8 + b, 1, 1, C.blush);
    // hair: crown, bangs over the brow, the back of the head and a lock by the ear
    P(4, 1 + b, 8, 1, C.hair); P(3, 2 + b, 10, 2, C.hair); P(6, 0 + b, 1, 1, C.hair); P(9, 0 + b, 2, 1, C.hair);
    P(3, 4 + b, 5, 5, C.hair); P(8, 4 + b, 5, 1, C.hair); P(9, 5 + b, 1, 1, C.hair); P(11, 5 + b, 2, 1, C.hair);
    P(3, 7 + b, 2, 2, C.hairDark); P(7, 5 + b, 1, 3, C.hairDark); P(12, 2 + b, 1, 2, C.hairDark);
    P(5, 2 + b, 3, 1, C.hairLight); P(4, 4 + b, 2, 1, C.hairLight);
  }
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
    case 'villageBoard': // Task 118: the plaza's notice board
      P = tdPainter(20, 24); P(3, 22, 14, 2, 'rgba(0,0,0,0.22)'); P(4, 10, 2, 13, '#5a3b28'); P(14, 10, 2, 13, '#5a3b28');
      P(1, 2, 18, 11, '#7a5236'); P(2, 3, 16, 9, '#c9a26a'); P(1, 1, 18, 2, '#5a3b28');
      P(4, 5, 5, 3, '#f0e6cc'); P(11, 4, 5, 4, '#e8dcc0'); P(5, 6, 3, 1, '#7a6a52'); P(12, 5, 3, 1, '#7a6a52'); P(12, 7, 2, 1, '#7a6a52'); P(6, 9, 8, 1, '#a07a50'); break;
    case 'lamp': P = tdPainter(8, 22); P(3, 6, 2, 16, '#4a3626'); P(1, 2, 6, 5, '#3a2a1e'); P(2, 3, 4, 3, '#ffd27a'); P(1, 20, 6, 2, 'rgba(0,0,0,0.25)'); break;
    default: P = tdPainter(8, 8); P(2, 2, 4, 4, '#888'); // unknown kind: a pebble
  }
  return P.done(false);
}

// --- Task 114/115/117: the village facilities, by restoration stage.
//   stage 0 ruin (broken walls, rubble, weeds), 1 cleared (foundation and scaffolding), 2 open.
//   The appraiser (감정소) is 44 x 40, the museum (박물관) 60 x 48; the door is at the bottom centre.
//   `exhibits` (museum only) lights that many of its six display niches (one per two relics on show).
//   Task 121: `specimens` (museum only, raw resource keys) stand as small crystals along its front.
//   Task 122: `hall` (museum only) 1 hangs banners and sets flower pots by the door, 2 adds gold trim and lamps.
function tdVillageSprite(key, stage, exhibits, specimens, hall){
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
  // Task 122: the decorated hall
  if((hall || 0) >= 1){
    [fx + 2, fx + fw - 4].forEach(x => { P(x - 1, groundY - 21, 4, 9, '#b0524a'); P(x - 1, groundY - 21, 4, 1, '#e2b23c'); P(x, groundY - 13, 2, 2, '#b0524a'); });
    [Math.round(cx) - 8, Math.round(cx) + 6].forEach(x => { P(x, groundY - 4, 3, 3, '#b8704f'); P(x, groundY - 6, 3, 2, '#4f8246'); P(x + 1, groundY - 7, 1, 1, '#e06f8a'); });
  }
  if((hall || 0) >= 2){
    for(let k = 0; k < 10; k++){ const o = Math.floor(k * 25 / 9); P(Math.round(cx) - o, groundY - 34 + k, 1, 1, '#e2b23c'); P(Math.round(cx) + o - 1, groundY - 34 + k, 1, 1, '#e2b23c'); }
    P(fx - 1, groundY - 24, fw + 2, 1, '#f2d68c');
    [fx + 6, fx + fw - 8].forEach(x => { P(x, groundY - 27, 3, 3, '#3a2a1e'); P(x + 1, groundY - 26, 1, 1, '#ffd27a'); });
  }
  // Task 121: donated mineral and gem samples on little stands between the columns
  (specimens || []).slice(0, 6).forEach((k, i) => {
    const sx = [fx + 5, fx + 8, fx + 14, fx + fw - 17, fx + fw - 9, fx + fw - 6][i], c = TD_RES_COLORS[k] || ['#ccc', '#fff'];
    P(sx - 1, groundY - 4, 4, 1, stoneDark); P(sx, groundY - 7, 2, 3, c[0]); P(sx, groundY - 7, 1, 1, c[1]);
  });
  return P.done(false);
}

// --- Task 119: the player's house (outside), door at the bottom centre.
// Sized to the player (H = 21 px, hair to boots): the door frame 25 px (~1.2H),
// the walls 66 px wide (~3.1H; 76 with the eaves), the ridge 63 px above the
// ground (3H; the chimney 67). Walls, roof and door are laid out on their own,
// not one picture scaled up.
function tdHouseSprite(){
  const P = tdPainter(84, 73), G = 70; // G: the ground row (the door step's foot)
  P(5, G, 74, 3, 'rgba(0,0,0,0.22)');
  // walls: warm boards over a stone footing, a timber frame
  P(9, 36, 66, G - 36, '#e8d6b0');
  for(let y = 40; y < G - 5; y += 4) P(9, y, 66, 1, '#dcc79e'); // board seams
  P(9, G - 5, 66, 5, '#9a9086'); P(9, G - 5, 66, 1, '#b4aaa0');
  for(let x = 13; x < 72; x += 9) P(x, G - 3, 1, 1, '#857b72'); // footing stones
  P(9, 36, 3, G - 41, '#8a6440'); P(72, 36, 3, G - 41, '#8a6440'); // corner posts
  P(9, 37, 66, 2, '#8a6440'); P(9, 39, 66, 1, '#6f5034');           // the beam under the eaves
  P(31, 39, 2, G - 44, '#8a6440'); P(51, 39, 2, G - 44, '#8a6440'); // posts either side of the door
  // roof: green shingle rows widening to the eaves, staggered tabs, a ridge cap
  for(let y = 8; y <= 34; y++){
    const o = Math.round((y - 8) * 16 / 26), x0 = 20 - o, w = 44 + 2 * o, band = Math.floor((y - 8) / 3);
    P(x0, y, w, 1, band % 2 ? '#4a7c43' : '#4f8246');
    if((y - 8) % 3 === 2){
      P(x0, y, w, 1, '#3f6b3a');
      for(let x = x0 + (band % 2 ? 3 : 6); x < x0 + w - 1; x += 6) P(x, y - 2, 1, 2, '#447540');
    }
  }
  P(20, 7, 44, 1, '#6a9e5f'); P(22, 6, 40, 1, '#3f6b3a'); P(20, 8, 44, 1, 'rgba(255,255,255,0.18)');
  P(3, 35, 78, 2, '#35592f'); P(4, 37, 76, 1, '#2c4a28');   // the eaves' edge
  P(12, 39, 60, 1, 'rgba(60,40,20,0.18)');                   // shade under the eaves
  P(58, 3, 8, 13, '#7a6a5e'); P(57, 2, 10, 2, '#958576'); P(60, 7, 3, 1, '#6a5b50'); P(59, 11, 4, 1, '#6a5b50'); // chimney
  // door: a frame, two planks, a little window, a handle, the step
  P(34, 43, 16, G - 45, '#5a3b28');
  P(36, 45, 12, G - 47, '#8a5a36'); P(41, 45, 1, G - 47, '#74492c'); P(36, 56, 12, 1, '#74492c');
  P(38, 48, 8, 4, '#3a2a1e'); P(39, 49, 6, 2, '#f3d27a');
  P(45, 58, 2, 2, '#e2b23c');
  P(31, G - 2, 22, 2, '#b4aaa0'); P(31, G - 2, 22, 1, '#cfc6bc');
  // a lantern beside the door
  P(55, 47, 4, 1, '#3a2a1e'); P(55, 48, 4, 4, '#3a2a1e'); P(56, 49, 2, 2, '#ffd27a');
  // windows with flower boxes, one each side
  [[15, 45], [59, 45]].forEach(([x, y]) => {
    P(x, y, 11, 11, '#5a3b28'); P(x + 1, y + 1, 9, 9, '#f3d27a'); P(x + 1, y + 1, 9, 2, '#f7e2a0');
    P(x + 5, y + 1, 1, 9, '#5a3b28'); P(x + 1, y + 5, 9, 1, '#5a3b28');
    P(x - 1, y + 12, 13, 3, '#8a6440'); P(x - 1, y + 12, 13, 1, '#a07a50');
    [[0, '#e06f8a'], [3, '#f0d060'], [6, '#e06f8a'], [9, '#f7c0cf']].forEach(([dx, c]) => { P(x + dx, y + 10, 2, 2, c); P(x + dx + 1, y + 11, 1, 1, '#4f8246'); });
  });
  return P.done(false);
}

// --- Task 119: inside the player's house. The room picture (floor, walls,
// windows, rug, the door gap) is one sprite; furniture stands in it as its own
// sprites, sorted with the player. Sizes follow VILLAGE.HOME (64 px a unit).
function tdHomeRoomSprite(){
  const H = VILLAGE.HOME, U = TD_UNIT_PX, side = H.SIDE_PX, back = H.BACK_PX, bottom = H.BOTTOM_PX;
  const fw = Math.round(H.ROOM.w * U), fh = Math.round(H.ROOM.h * U), W = fw + side * 2, Ht = back + fh + bottom;
  const P = tdPainter(W, Ht);
  // floor: planks in rows, the ends staggered
  for(let y = 0; y < fh; y += 8){
    const row = y / 8;
    P(side, back + y, fw, 8, ['#a87a4e', '#a07248', '#ae8054'][row % 3]);
    P(side, back + y + 7, fw, 1, '#7e5636');
    for(let x = (row % 2) * 23 + 9; x < fw; x += 46) P(side + x, back + y, 1, 7, '#86603e');
  }
  // the back wall: plaster over wood panelling, two windows and a framed map
  P(side, 0, fw, back, '#e6d6b4'); P(side, back - 16, fw, 16, '#8a6440'); P(side, back - 16, fw, 2, '#a07a50'); P(side, back - 2, fw, 2, '#5a3b28');
  [[Math.round(fw * 0.22), 9], [Math.round(fw * 0.62), 9]].forEach(([x, y]) => {
    P(side + x, y, 26, 20, '#5a3b28'); P(side + x + 2, y + 2, 22, 16, '#bfe0ec'); P(side + x + 12, y + 2, 2, 16, '#5a3b28'); P(side + x + 2, y + 9, 22, 2, '#5a3b28');
    P(side + x + 3, y + 3, 4, 3, '#eef8fb'); P(side + x - 2, y + 20, 30, 3, '#7a5236');
  });
  P(side + Math.round(fw * 0.45), 12, 16, 12, '#7a5236'); P(side + Math.round(fw * 0.45) + 1, 13, 14, 10, '#e8dcc0'); P(side + Math.round(fw * 0.45) + 3, 16, 6, 1, '#a07a50'); P(side + Math.round(fw * 0.45) + 5, 19, 7, 1, '#4f8246');
  // side walls and the bottom wall with the door gap
  P(0, 0, side, Ht, '#5a3b28'); P(W - side, 0, side, Ht, '#5a3b28'); P(side - 2, 0, 2, Ht, '#3a2a1e'); P(W - side, 0, 2, Ht, '#3a2a1e');
  const doorX = side + Math.round(H.DOOR.x * U), gap = Math.round(H.DOOR.half * U);
  P(0, back + fh, W, bottom, '#5a3b28'); P(0, back + fh, W, 2, '#3a2a1e');
  P(doorX - gap, back + fh, gap * 2, bottom, '#a07248'); P(doorX - gap + 3, back + fh - 6, gap * 2 - 6, 8, '#7a5236'); // the door mat
  P(doorX - gap - 3, back + fh - 2, 3, bottom + 2, '#3a2a1e'); P(doorX + gap, back + fh - 2, 3, bottom + 2, '#3a2a1e');
  // the rug
  const rx = side + Math.round(H.RUG.x * U), ry = back + Math.round(H.RUG.y * U), rw = Math.round(H.RUG.w * U / 2), rh = Math.round(H.RUG.h * U / 2);
  for(let y = -rh; y <= rh; y++){ const hw = Math.floor(rw * Math.sqrt(1 - (y * y) / (rh * rh + 0.01))); P(rx - hw, ry + y, hw * 2, 1, Math.abs(y) > rh - 3 || hw < 4 ? '#e2b23c' : '#b0524a'); }
  for(let y = -rh + 5; y <= rh - 5; y += 4){ const hw = Math.floor((rw - 8) * Math.sqrt(1 - (y * y) / (rh * rh))); P(rx - hw, ry + y, hw * 2, 1, '#9a443e'); }
  return P.done(false);
}

// Furniture by key, anchored at the bottom centre of its foot.
function tdFurnitureSprite(key){
  let P;
  switch(key){
    case 'bed':
      P = tdPainter(52, 72); P(2, 68, 48, 4, 'rgba(0,0,0,0.2)');
      P(2, 0, 48, 10, '#7a5236'); P(2, 0, 48, 2, '#9a6a40'); P(2, 8, 48, 62, '#6a4630'); // headboard, frame
      P(5, 10, 42, 56, '#f0ece0'); P(9, 13, 34, 11, '#ffffff'); P(9, 22, 34, 2, '#dcd6c8'); // mattress, pillow
      P(5, 28, 42, 38, '#4f7aa8'); P(5, 28, 42, 3, '#6a96c4'); for(let y = 34; y < 66; y += 6) P(5, y, 42, 1, '#43699a'); // blanket
      break;
    case 'shelf':
      P = tdPainter(64, 58); P(2, 55, 60, 3, 'rgba(0,0,0,0.2)');
      P(2, 0, 60, 56, '#7a5236'); P(5, 3, 54, 50, '#5a3b28');
      [6, 22, 38].forEach((y, r) => { P(5, y + 13, 54, 3, '#8a6440');
        for(let x = 7, k = 0; x < 56; x += 5 + (k % 3), k++) P(x, y + 2 + (k % 2), 4, 11 - (k % 2), ['#b0524a', '#4f7aa8', '#e2b23c', '#4f8246', '#c9a26a', '#8a5cd6'][(k + r * 2) % 6]); });
      break;
    case 'table':
      P = tdPainter(48, 38); P(4, 35, 40, 3, 'rgba(0,0,0,0.2)');
      P(6, 22, 3, 14, '#5a3b28'); P(39, 22, 3, 14, '#5a3b28');
      P(2, 8, 44, 16, '#9a6a40'); P(2, 8, 44, 2, '#b8885a'); P(2, 22, 44, 2, '#6a4630');
      P(10, 3, 6, 7, '#e8e4dc'); P(11, 4, 4, 2, '#7a5236'); // a cup
      P(28, 2, 9, 8, '#e8dcc0'); P(29, 4, 7, 1, '#a07a50'); P(29, 6, 5, 1, '#a07a50'); // a notebook
      break;
    case 'stool':
      P = tdPainter(16, 16); P(2, 14, 12, 2, 'rgba(0,0,0,0.2)'); P(3, 3, 10, 5, '#9a6a40'); P(3, 3, 10, 1, '#b8885a'); P(4, 8, 2, 7, '#5a3b28'); P(10, 8, 2, 7, '#5a3b28');
      break;
    case 'stove':
      P = tdPainter(36, 50); P(2, 47, 32, 3, 'rgba(0,0,0,0.25)');
      P(14, 0, 8, 18, '#4a4e58'); P(14, 0, 2, 18, '#5e636e'); // pipe
      P(3, 16, 30, 32, '#4a4e58'); P(3, 16, 30, 3, '#6e747c'); P(3, 45, 30, 3, '#3a3e46');
      P(9, 26, 18, 13, '#2a2c32'); P(11, 28, 14, 9, '#f07a30'); P(13, 31, 10, 6, '#f0a040'); P(16, 33, 4, 3, '#ffe08a'); // the fire
      P(6, 20, 3, 3, '#e2b23c'); P(27, 20, 3, 3, '#e2b23c');
      break;
    case 'chest':
      P = tdPainter(38, 30); P(2, 27, 34, 3, 'rgba(0,0,0,0.22)');
      P(3, 6, 32, 22, '#8a5a36'); P(3, 6, 32, 7, '#9a6a40'); P(3, 12, 32, 2, '#5a3b28');
      P(8, 6, 3, 22, '#77706a'); P(27, 6, 3, 22, '#77706a'); P(17, 12, 4, 5, '#e2b23c');
      break;
    case 'plant':
      P = tdPainter(16, 24); P(3, 21, 10, 3, 'rgba(0,0,0,0.2)'); P(4, 14, 8, 8, '#b8704f'); P(4, 14, 8, 2, '#d08a62');
      P.disc(8, 8, 5, '#3f6e44'); P(5, 4, 3, 3, '#5a8e57'); P(9, 6, 3, 3, '#5a8e57');
      break;
    default: P = tdPainter(8, 8); P(2, 2, 4, 4, '#888');
  }
  return P.done(false);
}

// --- Task 120: garden decorations, anchored at the bottom centre of their foot.
function tdDecorSprite(key){
  let P;
  switch(key){
    case 'flowerPot':
      P = tdPainter(14, 18); P(2, 16, 10, 2, 'rgba(0,0,0,0.22)'); P(3, 10, 8, 7, '#b8704f'); P(3, 10, 8, 2, '#d08a62'); P(4, 16, 6, 1, '#8a5236');
      P(5, 5, 2, 6, '#4f8246'); P(8, 4, 2, 7, '#5a8e57'); P(3, 2, 4, 4, '#e06f8a'); P(4, 3, 2, 2, '#f7c0cf'); P(8, 1, 4, 4, '#f0d060'); P(9, 2, 2, 2, '#fff3b0');
      break;
    case 'bench':
      P = tdPainter(30, 20); P(2, 18, 26, 2, 'rgba(0,0,0,0.22)');
      P(3, 2, 24, 3, '#9a6a40'); P(3, 2, 24, 1, '#b8885a'); P(3, 6, 24, 2, '#8a5a36'); // the back
      P(2, 9, 26, 4, '#a87a4e'); P(2, 9, 26, 1, '#c49a6a'); P(2, 12, 26, 1, '#7a5236'); // the seat
      P(4, 13, 3, 6, '#5a3b28'); P(23, 13, 3, 6, '#5a3b28'); P(4, 4, 2, 9, '#6a4630'); P(24, 4, 2, 9, '#6a4630');
      break;
    case 'lantern':
      P = tdPainter(14, 26); P(2, 24, 10, 2, 'rgba(0,0,0,0.25)');
      P(4, 17, 6, 8, '#8f8a84'); P(3, 23, 8, 2, '#77706a'); // the post
      P(3, 9, 8, 8, '#9a958e'); P(5, 11, 4, 4, '#ffd27a'); P(6, 12, 2, 2, '#fff3b0'); // the light box
      P(1, 6, 12, 3, '#77706a'); P(2, 5, 10, 1, '#a9a39a'); P(5, 3, 4, 2, '#8f8a84'); // the cap
      break;
    case 'shrub':
      P = tdPainter(22, 20); P(3, 17, 16, 3, 'rgba(0,0,0,0.25)');
      P.disc(11, 10, 8, '#3f6e44'); P.disc(10, 9, 6, '#4f8246'); P.disc(8, 7, 3, '#6a9e5f'); P(14, 6, 2, 2, '#e06f8a'); P(6, 12, 2, 2, '#f0d060');
      break;
    // Task 122: the museum's reward decorations
    case 'oreStatue':
      P = tdPainter(18, 28); P(2, 26, 14, 2, 'rgba(0,0,0,0.25)'); P(2, 21, 14, 6, '#8f8a84'); P(2, 21, 14, 1, '#a9a39a');
      P(6, 9, 6, 12, '#b8704f'); P(5, 4, 8, 6, '#c98a62'); P(4, 3, 10, 3, '#e2b23c'); P(7, 4, 4, 1, '#fff3b0'); // a little miner in ore, a gold helmet
      P(12, 8, 2, 9, '#6a4630'); P(11, 7, 5, 2, '#9a958e'); P(7, 12, 1, 2, '#e09a72'); P(10, 15, 1, 2, '#e09a72');
      break;
    case 'crystalFountain':
      P = tdPainter(30, 26); P(2, 23, 26, 3, 'rgba(0,0,0,0.25)');
      P(2, 15, 26, 9, '#8f8a84'); P(2, 15, 26, 2, '#a9a39a'); P(4, 17, 22, 5, '#4f9ec4'); P(5, 18, 8, 1, '#bff3ff'); // the basin and its water
      P(12, 6, 6, 11, '#9a958e'); P(13, 2, 4, 6, '#7fd7ec'); P(14, 0, 2, 3, '#e8fbff'); P(10, 4, 2, 4, '#5fc0d8'); P(18, 5, 2, 3, '#5fc0d8'); // the crystal
      P(8, 12, 1, 4, '#bff3ff'); P(21, 11, 1, 5, '#bff3ff');
      break;
    case 'goldenPick':
      P = tdPainter(18, 30); P(2, 28, 14, 2, 'rgba(0,0,0,0.25)'); P(2, 22, 14, 7, '#77706a'); P(2, 22, 14, 1, '#958d85'); P(5, 24, 8, 2, '#e2b23c');
      P(8, 6, 2, 16, '#b58a26'); P(8, 6, 1, 16, '#f2d68c'); // the haft
      P(2, 3, 14, 3, '#e2b23c'); P(1, 4, 2, 3, '#b58a26'); P(15, 4, 2, 3, '#b58a26'); P(3, 3, 11, 1, '#fff3b0'); // the gold head
      break;
    default: P = tdPainter(8, 8); P(2, 2, 4, 4, '#888');
  }
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
  const v2 = typeof tdStyleV2 === 'function' && tdStyleV2(); // the style experiment (?style=v2)
  ['down', 'up', 'left', 'right'].forEach(d => { sheet.player[d] = [0, 1, 2, 3].map(f => tdSpriteImage(v2 ? tdPlayerSpriteV2(d, f) : tdPlayerSprite(d, f))); });
  Object.keys(TD_RES_COLORS).forEach(r => { sheet.ore[r] = { unsecured: tdSpriteImage(tdOreSprite(r, 'unsecured')), secured: tdSpriteImage(tdOreSprite(r, 'secured')) }; });
  sheet.ore.undiscovered = tdSpriteImage(tdOreSprite(null, 'undiscovered'));
  sheet.base = tdSpriteImage(tdBaseSprite());
  sheet.house = tdSpriteImage(v2 ? tdHouseSpriteV2() : tdHouseSprite()); // Task 119
  sheet.torch = [0, 1, 2].map(f => tdSpriteImage(tdTorchSprite(f)));
  [1, 2, 3].forEach(t => { sheet.workshop[t] = tdSpriteImage(tdWorkshopSprite(t)); });
  ['bigTree', 'sparseTree', 'grass', 'rock', 'clearing', 'exposedVein', 'undevelopedVein', 'rareVein', 'crystal', 'oldShaftEntrance', 'timberSupport', 'mineCart', 'diggingMarks', 'lamp', 'villageBoard']
    .forEach(k => { sheet.prop[k] = tdSpriteImage(tdPropSprite(k)); });
  return sheet;
}
