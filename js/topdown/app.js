// ---------------------------------------------------------------------------
// Task 106: the world-first screen. The top-down world fills the screen; the
// existing tabs (채굴/개발/인부/연구/납품) and the log become panels opened
// from a dock, with their content and functions unchanged. PC: WASD/arrows
// to walk, E or Space to act, T for a torch (Task 112). Phone: a virtual
// joystick, an action button and a torch button.
//
// The old 2.5D page stays available with ?view=classic (remembered in its
// own localStorage key, never in the game save).
// ---------------------------------------------------------------------------
const TD_VIEW_KEY = 'gachaFactoryView';

function tdViewMode(){
  let mode = null;
  try {
    const q = new URLSearchParams(window.location.search).get('view');
    if(q === 'classic' || q === 'topdown'){ mode = q; localStorage.setItem(TD_VIEW_KEY, q); }
    else mode = localStorage.getItem(TD_VIEW_KEY);
  } catch(e){ /* storage blocked: default */ }
  return mode === 'classic' ? 'classic' : 'topdown';
}

function tdIsTouch(){
  try { return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); }
  catch(e){ return false; }
}

// --- panels -----------------------------------------------------------------
function tdPanelOpen(){ return document.body.classList.contains('td-panel-open'); }
function tdOpenTab(tab){
  const btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if(btn && !btn.classList.contains('active')) btn.onclick && btn.onclick();
  document.body.classList.remove('td-log-open');
  document.body.classList.add('td-panel-open');
}
function tdClosePanels(){
  document.body.classList.remove('td-panel-open', 'td-log-open');
  if(document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
}

// --- acting on the nearest thing ---------------------------------------------
function tdInteractNow(){
  const p = state.world.player;
  const target = tdInteractTarget(p.x, p.y);
  if(!target) return false;
  const r = tdInteract(target);
  if(r.open){ tdOpenTab(r.open); return true; }
  if(r.text) tdAddFloat(r.text, target.x, target.y, r.ok ? '#fff3b0' : '#b8c0c6', tdBubbleLift(target));
  return r.ok;
}

// Task 112: set a torch down in front, or pick up the one at hand (T / the torch button).
function tdTorchNow(){
  const r = torchAct();
  tdAddFloat(r.text, r.x, r.y, r.ok ? '#ffd27a' : '#b8c0c6');
  tdUpdateActionButton();
  return r.ok;
}

function tdUpdateActionButton(){
  const torch = document.getElementById('tdTorch');
  if(torch){
    const take = torchAtHand() >= 0;
    const label = (TD.touch ? '' : '[T] ') + (take ? '횃불 거두기' : '횃불 놓기') + ' ' + worldTorches().length + '/' + TORCH.MAX;
    if(torch.textContent !== label) torch.textContent = label;
    torch.classList.toggle('is-full', !take && worldTorches().length >= TORCH.MAX);
  }
  tdUpdateGardenButton();
  const btn = document.getElementById('tdAction');
  if(!btn) return;
  const t = TD.target;
  const label = !t ? '·' : t.action === 'mine' ? '캐기' : t.action === 'secure' ? '확보' : t.action === 'open' ? '열기'
    : t.action === 'restore' ? '복구' : t.action === 'appraise' ? '감정' : t.action === 'donate' ? '기증'
    : t.action === 'enter' ? '들어가기' : t.action === 'exit' ? '나가기'
    : t.action === 'decorPlace' ? '놓기' : t.action === 'decorPick' ? '들기' : t.action === 'decorDrop' ? '내려놓기' : '잠김'; // Task 115~120: village actions
  if(btn.textContent !== label) btn.textContent = label;
  btn.classList.toggle('is-long', label.length >= 4);
  btn.classList.toggle('is-idle', !t || t.action === 'locked');
}

// Task 120: the garden button (phone) / R and Q (keyboard). Shown at the garden:
// takes back the carried decoration or the one in front, else picks the next kind to set down.
function tdGardenButtonMode(){
  const t = TD.target;
  if(typeof VILLAGE_GARDEN_UI === 'undefined' || !t || t.type !== 'garden') return VILLAGE_GARDEN_UI && VILLAGE_GARDEN_UI.carry >= 0 ? 'take' : null;
  return VILLAGE_GARDEN_UI.carry >= 0 || t.action === 'decorPick' ? 'take' : 'cycle';
}
function tdUpdateGardenButton(){
  const b = document.getElementById('tdDecor');
  if(!b) return;
  const mode = tdGardenButtonMode();
  b.classList.toggle('is-on', !!mode);
  const label = mode === 'take' ? (TD.touch ? '' : '[R] ') + '장식 회수' : mode === 'cycle' ? (TD.touch ? '' : '[Q] ') + '다음 장식: ' + villageDecorDef(villageDecorNext()).name : '';
  if(b.textContent !== label) b.textContent = label;
}
function tdGardenButtonNow(mode){
  const m = mode || tdGardenButtonMode();
  if(m === 'take'){
    const r = tdGardenTakeBack();
    if(r.text) tdAddFloat(r.text, r.x, r.y, r.ok ? '#ffd27a' : '#b8c0c6');
    return r.ok;
  }
  if(m === 'cycle'){
    const k = villageDecorCycle(), t = TD.target;
    if(t) tdAddFloat('놓을 장식: ' + villageDecorDef(k).name, t.x, t.y, '#fff3b0');
    return true;
  }
  return false;
}

// --- virtual joystick (phone) -------------------------------------------------
// Direction from a stick offset: 8 directions, nothing inside the dead zone.
function tdStickDirs(dx, dy, radius){
  const len = Math.hypot(dx, dy);
  if(len < radius * 0.28) return [];
  const nx = dx / len, ny = dy / len, out = [];
  if(nx > 0.38) out.push('right'); else if(nx < -0.38) out.push('left');
  if(ny > 0.38) out.push('down'); else if(ny < -0.38) out.push('up');
  return out;
}
function tdSetStickDirs(dirs){
  ['up', 'down', 'left', 'right'].forEach(d => setPlayerHeld(d, dirs.includes(d)));
}
function tdBindStick(stick, knob){
  let id = null, cx = 0, cy = 0;
  const radius = () => stick.clientWidth / 2 || 56;
  const move = (e) => {
    const r = radius();
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if(len > r){ dx = dx / len * r; dy = dy / len * r; }
    knob.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
    tdSetStickDirs(tdStickDirs(dx, dy, r));
  };
  const end = () => { id = null; knob.style.transform = ''; tdSetStickDirs([]); stick.classList.remove('is-active'); };
  stick.addEventListener('pointerdown', (e) => {
    const rect = stick.getBoundingClientRect();
    cx = rect.left + rect.width / 2; cy = rect.top + rect.height / 2; id = e.pointerId;
    if(stick.setPointerCapture) try { stick.setPointerCapture(id); } catch(err){ /* not supported */ }
    stick.classList.add('is-active'); move(e); e.preventDefault();
  });
  stick.addEventListener('pointermove', (e) => { if(e.pointerId === id) move(e); });
  stick.addEventListener('pointerup', (e) => { if(e.pointerId === id) end(); });
  stick.addEventListener('pointercancel', end);
}

// --- set-up -------------------------------------------------------------------
function tdInit(){
  if(tdViewMode() !== 'topdown') return false;
  const body = document.body;
  body.classList.add('view-topdown');
  TD.touch = tdIsTouch();
  if(TD.touch) body.classList.add('td-touch');
  TD.quality = TD.touch ? 1 : 0; // Task 108: phones start with the lighter effects
  // the world canvas fills the screen behind the HUD
  const canvas = document.createElement('canvas');
  canvas.id = 'tdCanvas'; canvas.setAttribute('aria-label', '게임 월드');
  body.insertBefore(canvas, body.firstChild);
  TD.canvas = canvas;
  // jsdom (the test runner) has no 2D canvas; asking for one there only prints a
  // "not implemented" error, so the layout is set up and nothing is drawn.
  const noCanvas = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
  TD.ctx = !noCanvas && canvas.getContext ? canvas.getContext('2d') : null;
  // HUD: minimap, dock extras, phone controls
  const hud = document.createElement('div');
  hud.id = 'tdHud';
  hud.innerHTML =
    '<canvas id="tdMinimap" width="96" height="96" aria-label="탐험 지도"></canvas>' +
    '<button id="tdClose" class="td-close" type="button" aria-label="패널 닫기">닫기 ✕</button>' +
    '<div id="tdStick" class="td-stick" aria-label="이동"><div class="td-knob"></div></div>' +
    '<button id="tdAction" class="td-action is-idle" type="button" aria-label="행동">·</button>' +
    '<button id="tdTorch" class="td-torch" type="button" aria-label="횃불 놓기 또는 거두기">횃불 놓기</button>' +
    '<button id="tdDecor" class="td-decor" type="button" aria-label="정원 장식 회수 또는 바꾸기"></button>';
  body.appendChild(hud);
  TD.mini = document.getElementById('tdMinimap');
  const tabbar = document.querySelector('.tabbar');
  if(tabbar && !tabbar.querySelector('.td-log-btn')){
    const logBtn = document.createElement('button');
    logBtn.className = 'td-log-btn'; logBtn.type = 'button'; logBtn.textContent = '기록';
    logBtn.onclick = () => { const open = body.classList.contains('td-log-open'); tdClosePanels(); if(!open) body.classList.add('td-log-open'); };
    tabbar.appendChild(logBtn);
  }
  // a tab button opens its panel; pressing the open tab again closes it
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.tab-btn') : null;
    if(!btn || !body.classList.contains('view-topdown')) return;
    if(tdPanelOpen() && btn.classList.contains('active')){ tdClosePanels(); e.stopPropagation(); e.preventDefault(); return; }
    body.classList.remove('td-log-open');
    body.classList.add('td-panel-open');
  }, true);
  document.getElementById('tdClose').onclick = tdClosePanels;
  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };
  document.getElementById('tdTorch').onclick = () => { tdTorchNow(); };
  document.getElementById('tdDecor').onclick = () => { tdGardenButtonNow(); }; // Task 120
  tdBindStick(document.getElementById('tdStick'), document.querySelector('#tdStick .td-knob'));
  // E / Space acts, Escape closes panels (never while typing in a field)
  document.addEventListener('keydown', (e) => {
    if(e.repeat || playerTypingTarget(e.target)) return;
    if(e.key === 'Escape' && (tdPanelOpen() || body.classList.contains('td-log-open'))){ tdClosePanels(); return; }
    const onButton = e.target && e.target.tagName === 'BUTTON';
    if(e.key === 'e' || e.key === 'E' || (e.key === ' ' && !onButton)){
      if(e.key === ' ') e.preventDefault();
      tdInteractNow();
    }
    if(e.key === 't' || e.key === 'T') tdTorchNow(); // Task 112
    if(e.key === 'r' || e.key === 'R') tdGardenButtonNow('take'); // Task 120: take a decoration back
    if((e.key === 'q' || e.key === 'Q') && tdGardenButtonMode() === 'cycle') tdGardenButtonNow('cycle'); // ...or choose the next kind
  });
  // clicking the world puts the keyboard back on the world (out of any panel field)
  canvas.addEventListener('pointerdown', () => { if(document.activeElement && document.activeElement !== body && document.activeElement.blur) document.activeElement.blur(); });
  if(!TD.ctx) return true; // no 2D canvas (tests): the layout is set up, nothing is drawn
  TD.sheet = tdBuildSpriteSheet();
  TD.running = true;
  if(typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(tdFrame);
  return true;
}

tdInit();
