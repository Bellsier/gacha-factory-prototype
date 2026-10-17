// ---------------------------------------------------------------------------
// Task 106: proximity interaction. Walk up to a mine, the workshop (공방) or
// a craft workshop and press E / Space (PC) or the action button (phone).
// Every action goes through the existing game functions (secureMine,
// mineMine), so the rules are the same as the panel buttons, which stay
// (blueprint 24.4 #1). Nothing here is saved.
// ---------------------------------------------------------------------------

// What the player could act on right now: the nearest target within reach, or null.
//   { type: 'mine', id, x, y, action: 'secure' | 'mine' | 'locked', label }
//   { type: 'base' | 'workshop', id, x, y, action: 'open', label }
function tdInteractTarget(px, py){
  const range = TOPDOWN.INTERACT_RANGE;
  let best = null, bestD = Infinity;
  const consider = (t, d) => { if(d <= range && d < bestD){ best = t; bestD = d; } };
  state.world.mines.forEach(m => {
    if(!m || !isMineDiscovered(m)) return; // hidden mines are found by walking near them, not used
    const d = Math.hypot(m.x - px, m.y - py);
    if(d > range) return;
    const res = resourceByKey(m.resource);
    const name = res ? res.name : m.resource;
    if(m.developmentState === 'secured'){
      consider({ type: 'mine', id: m.id, x: m.x, y: m.y, action: 'mine', label: name + ' 캐기 +' + fmt(m.miningPower * mult()) }, d);
    } else if(isMineSiteUnlocked(m)){
      consider({ type: 'mine', id: m.id, x: m.x, y: m.y, action: 'secure', label: name + ' 광맥 확보' }, d);
    } else {
      const site = res ? SITES.find(s => s.key === res.site) : null;
      consider({ type: 'mine', id: m.id, x: m.x, y: m.y, action: 'locked', label: (site ? site.name : '지역') + ' 해금 필요' }, d);
    }
  });
  const base = state.world.base;
  consider({ type: 'base', id: 'base', x: base.x, y: base.y, action: 'open', label: '공방 들어가기' }, Math.hypot(base.x - px, base.y - py));
  state.world.workshops.forEach(w => {
    if(!w) return;
    consider({ type: 'workshop', id: w.id, x: w.x, y: w.y, action: 'open', label: '제작소 Lv.' + w.level }, Math.hypot(w.x - px, w.y - py));
  });
  // Task 114: the village facilities (their door step is the site point)
  if(typeof villageTargetFor === 'function' && state.village && state.village.sites){
    VILLAGE.ORDER.forEach(k => {
      const site = state.village.sites[k];
      if(!site) return;
      const t = villageTargetFor(k);
      consider({ type: 'village', id: k, x: site.x, y: site.y, action: t.action, label: t.label }, Math.hypot(site.x - px, site.y - py));
    });
  }
  return best;
}

// Does the target's action. Returns { ok, text, open } — `open` names the
// panel to show ('dev' for the workshop and craft workshops).
function tdInteract(target){
  if(!target) return { ok: false, text: '' };
  if(target.type === 'mine'){
    const mine = mineById(target.id);
    if(!mine) return { ok: false, text: '' };
    const res = resourceByKey(mine.resource);
    if(target.action === 'secure'){
      if(!secureMine(mine.id)) return { ok: false, text: '확보할 수 없어요' };
      tdRefreshAfterMineChange();
      log('광맥 확보: ' + (res ? res.name : mine.resource) + ' (' + mine.x + ', ' + mine.y + ')');
      return { ok: true, text: '확보!' };
    }
    if(target.action === 'mine'){
      const amount = mine.miningPower * mult();
      if(!mineMine(mine.id)) return { ok: false, text: '' };
      if(typeof updateNumbers === 'function') updateNumbers();
      return { ok: true, text: '+' + fmt(amount) + ' ' + (res ? res.name : '') };
    }
    return { ok: false, text: target.label };
  }
  if(target.type === 'village') return tdVillageInteract(target);
  return { ok: true, text: '', open: 'dev' };
}

function tdRefreshAfterMineChange(){
  if(typeof buildMines === 'function') buildMines();
  if(typeof renderWorldObjects === 'function') renderWorldObjects();
  if(typeof updateNumbers === 'function') updateNumbers();
}

// Task 115~117: a village facility. Restoring, appraising and donating go
// through the same game functions as the 마을 panel buttons (js/village.js).
function tdVillageInteract(target){
  const k = target.id;
  if(target.action === 'restore'){
    const why = villageRestoreBlocker(k);
    if(why || !villageRestore(k)) return { ok: false, text: why || '' };
    tdRefreshAfterVillageChange();
    return { ok: true, text: villageIsOpen(k) ? villageFacilityName(k) + ' 운영 시작!' : '잔해를 치웠어요' };
  }
  if(target.action === 'locked') return { ok: false, text: target.label };
  if(target.action === 'appraise' && typeof villageAppraise === 'function'){
    const r = villageAppraise();
    if(!r) return { ok: false, text: '' };
    tdRefreshAfterVillageChange();
    return { ok: true, text: (r.isNew ? '도감 등록! ' : '') + r.relic.name };
  }
  if(target.action === 'donate' && typeof villageDonateAll === 'function'){
    const n = villageDonateAll();
    if(!n) return { ok: false, text: '' };
    tdRefreshAfterVillageChange();
    return { ok: true, text: '유물 ' + n + '점 기증 · 전시' };
  }
  return { ok: true, text: '', open: 'village' };
}

function tdRefreshAfterVillageChange(){
  if(typeof renderVillage === 'function') renderVillage();
  if(typeof renderCurrencies === 'function') renderCurrencies();
  if(typeof updateNumbers === 'function') updateNumbers();
}
