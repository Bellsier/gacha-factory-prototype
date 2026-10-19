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
  if(typeof villageHomeInside === 'function' && villageHomeInside()) return villageHomeTarget(); // Task 119: inside the house only its door
  const range = TOPDOWN.INTERACT_RANGE;
  let best = null, bestD = Infinity;
  const consider = (t, d) => { if(d <= range && d < bestD){ best = t; bestD = d; } };
  (typeof worldMinesNear === 'function' ? worldMinesNear(px, py, range) : state.world.mines).forEach(m => { // the veins in reach (chunk index)
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
  // Task 118: the plaza's notice board opens the 마을 panel
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(vd) consider({ type: 'house', id: 'house', x: vd.house.x, y: vd.house.y, action: 'enter', label: '내 집 · 들어가기' }, Math.hypot(vd.house.x - px, vd.house.y - py)); // Task 119
  const gt = typeof villageGardenTarget === 'function' ? villageGardenTarget() : null; // Task 120: the garden cell in front
  if(gt) consider(gt, Math.hypot(gt.x - px, gt.y - py));
  if(vd) consider({ type: 'plaza', id: 'plaza', x: vd.plaza.x, y: vd.plaza.y - 0.15, action: 'open', label: '마을 광장 · 안내판' }, Math.hypot(vd.plaza.x - px, vd.plaza.y - 0.15 - py));
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
      const amount = mine.miningPower * mult(), relicsBefore = state.village ? state.village.unidentified : 0;
      if(!mineMine(mine.id)) return { ok: false, text: '' };
      if(typeof updateNumbers === 'function') updateNumbers();
      const relic = state.village && state.village.unidentified > relicsBefore; // Task 116
      if(relic && typeof renderVillage === 'function') renderVillage();
      return { ok: true, text: '+' + fmt(amount) + ' ' + (res ? res.name : '') + (relic ? ' · 미감정 유물!' : '') };
    }
    return { ok: false, text: target.label };
  }
  if(target.type === 'village') return tdVillageInteract(target);
  if(target.type === 'plaza') return { ok: true, text: '', open: 'village' };
  // Task 119: in and out of the house
  if(target.type === 'house'){ const why = villageHomeEnterBlocker(); return why ? { ok: false, text: why } : { ok: villageHomeEnter(), text: '' }; }
  if(target.type === 'homeDoor') return { ok: villageHomeExit(), text: '' };
  if(target.type === 'garden') return tdGardenInteract(target);
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
    const rewards = villageRewardsEarned().length, n = villageDonateAll();
    if(!n) return { ok: false, text: '' };
    tdRefreshAfterVillageChange();
    return { ok: true, text: '유물 ' + n + '점 기증 · 전시' + (villageRewardsEarned().length > rewards ? ' · 박물관 보상!' : '') }; // Task 122
  }
  return { ok: true, text: '', open: 'village' };
}

// Task 120: set a decoration down, pick one up, or put the carried one down (same rules as the panel).
function tdGardenInteract(target){
  const UI = VILLAGE_GARDEN_UI, cell = target.id;
  if(target.action === 'decorPlace'){
    const kind = villageDecorSelected(), why = villageDecorPlaceProblem(kind, cell);
    if(why) return { ok: false, text: why };
    villageDecorPlace(kind, cell);
    tdRefreshAfterVillageChange();
    return { ok: true, text: villageDecorDef(kind).name + ' 놓기!' };
  }
  if(target.action === 'decorPick'){ UI.carry = cell; tdRefreshAfterVillageChange(); return { ok: true, text: '들었어요 · 옮길 칸에서 E' }; }
  if(target.action === 'decorDrop'){
    const from = UI.carry;
    if(from !== cell){
      const i = villageDecorAt(from), why = i < 0 ? '들고 있는 장식이 없어요' : villageDecorPlaceProblem(villageDecorList()[i].kind, cell, from);
      if(why || !villageDecorMove(from, cell)) return { ok: false, text: why || '' };
    }
    UI.carry = -1;
    tdRefreshAfterVillageChange();
    return { ok: true, text: from === cell ? '제자리에 두었어요' : '옮겼어요' };
  }
  return { ok: false, text: target.label };
}

// Task 120: takes back the carried decoration, or the one in front (R, or the phone's garden button).
function tdGardenTakeBack(){
  const UI = VILLAGE_GARDEN_UI, t = typeof villageGardenTarget === 'function' ? villageGardenTarget() : null;
  const cell = UI.carry >= 0 ? UI.carry : t && t.action === 'decorPick' ? t.id : -1;
  if(cell < 0) return { ok: false, text: '' };
  const at = villageGardenCells()[cell], kind = villageDecorRemove(cell);
  if(!kind) return { ok: false, text: '' };
  tdRefreshAfterVillageChange();
  return { ok: true, text: villageDecorDef(kind).name + ' 회수', x: at.x, y: at.y };
}

function tdRefreshAfterVillageChange(){
  if(typeof renderVillage === 'function') renderVillage();
  if(typeof renderCurrencies === 'function') renderCurrencies();
  if(typeof updateNumbers === 'function') updateNumbers();
}
