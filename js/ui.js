function updateNextHint(){
  const el = document.getElementById('nextHint');
  if(!el) return;
  const ironHas = hasWorkerOn('iron');
  const coalHas = hasWorkerOn('coal');
  if(!permanent.firstGachaGranted){
    el.textContent = `채굴 탭에서 광석을 캔 뒤, 개발 탭에서 강철을 만들어 파세요. 골드 50이 되면 첫 가챠권을 받습니다. (현재 ${fmt(state.gold)}/${BALANCE.gacha.FIRST_TICKET_GOLD_THRESHOLD}G)`;
  } else if(state.characters.length < BALANCE.worker.MIN_REQUIRED){
    el.textContent = permanent.tickets >= 1
      ? '인부 탭에서 가챠권으로 일꾼을 뽑으세요. 일꾼이 있어야 프레스티지가 열립니다. 자동 제작은 연구 탭의 장치로 열어요.'
      : '인부 탭에서 일꾼을 뽑으세요. 일꾼 1명 이상이어야 초기화(명성)를 할 수 있습니다.';
  } else if(ironHas !== coalHas){
    const missing = ironHas ? 'coal' : 'iron';
    el.textContent = `${resName(missing)}은 아직 수동입니다. 일꾼을 한 명 더 뽑으면 강철도 완전 자동화할 수 있어요.`;
  } else if(ironHas && coalHas && !state.autoCraft.steel){
    el.textContent = (isAutoCraftUnlocked() ? '철광석/석탄 자동화 완료! 자동 제작을 켜면 강철도 자동으로 만들어져요.' : '철광석/석탄 자동화 완료! 연구 탭에서 자동 제작 장치를 연구하면 강철도 자동으로 만들 수 있어요.');
  } else if(prestigeGain() <= 0){
    el.textContent = '일꾼을 채굴장에 배치하고 공방을 굴리세요. 이번 회차 200G부터 명성 1점을 얻습니다.';
  } else {
    el.textContent = `이번 회차를 초기화하면 명성 +${prestigeGain()}점을 얻습니다. 일꾼·자원은 사라지고 영구 배율이 남습니다.`;
  }
}

function renderCurrencies(){
  document.getElementById('goldVal').textContent = fmt(state.gold);
  document.getElementById('ticketVal').textContent = fmt(permanent.tickets);
  document.getElementById('prestigeVal').textContent = fmt(permanent.totalPrestige);
  document.getElementById('multVal').textContent = '×' + mult().toFixed(2);
  document.getElementById('runGoldVal').textContent = fmt(state.runGold);
  document.getElementById('runNum').textContent = permanent.runCount;
}

// Task 35: Shared storage UI. The game's existing state.resources object is
// the single common resource pool used by world mines and crafting.
function renderSharedStorage(){
  const wrap = document.getElementById('sharedStorage');
  if(!wrap) return;
  wrap.innerHTML = RESOURCES.map(r =>
    '<div class="line shared-storage-item">' +
      '<div class="res-name">' + r.name + '</div>' +
      '<div class="res-amt" data-shared-amt="' + r.key + '">' + fmt(state.resources[r.key]) + '</div>' +
    '</div>'
  ).join('');
}

// Task 33: Minimal base information UI.
function renderBaseInfo(){
  const wrap = document.getElementById('baseInfo');
  if(!wrap) return;
  const nextKey = BALANCE.world.EXPANSION_SITE_ORDER.find(key => !state.unlockedSites[key]);
  const nextSite = nextKey ? SITES.find(site => site.key === nextKey) : null;
  wrap.innerHTML =
    '<div class="line base-info">' +
      '<div class="res-name">거점 Lv.' + state.world.base.level + '</div>' +
      '<div class="rate">위치 (' + state.world.base.x + ', ' + state.world.base.y + ')</div>' +
      (nextSite
        ? '<button class="ghost" data-expand-base>다음 지역 확장 (' + nextSite.unlockCost + 'G)</button>'
        : '<div class="rate">모든 지역을 개척했습니다.</div>') +
    '</div>';
  const btn = wrap.querySelector('[data-expand-base]');
  if(btn){
    btn.disabled = state.gold < nextSite.unlockCost;
    btn.onclick = ()=>{
      if(!expandBase()) return;
      renderAll();
    };
  }
}
// Task 32: Minimal world mine UI.
function buildMines(){
  const wrap = document.getElementById('worldMines');
  if(!wrap) return;
  wrap.innerHTML = '';
  // Task 65: the list shows discovered mines only, plus how many are still hidden.
  const discovered = state.world.mines.filter(isMineDiscovered);
  const hiddenCount = state.world.mines.length - discovered.length;
  if(discovered.length === 0 && hiddenCount === 0){ wrap.innerHTML = '<div class="rate">아직 발견된 광맥이 없습니다.</div>'; return; }
  discovered.forEach(mine=>{
    const resource = RESOURCES.find(r=>r.key===mine.resource);
    const secured = mine.developmentState === 'secured';
    // Task 64: a mine whose site is still locked can't be secured yet.
    const siteLocked = !secured && !isMineSiteUnlocked(mine);
    const site = resource ? SITES.find(s => s.key === resource.site) : null;
    const card = document.createElement('div');
    card.className = 'line world-mine';
    card.innerHTML = '<div class="res-name">' + (resource ? resource.name : mine.resource) + '</div>' +
      '<div class="rate">위치 (' + mine.x + ', ' + mine.y + ') · 등급 ' + mine.grade + ' · 채굴력 ' + mine.miningPower + '</div>' +
      '<div class="rate">' + (secured ? '확보 완료' : '미확보') + '</div>' +
      '<button data-secure-mine="' + mine.id + '" ' + (secured || siteLocked ? 'disabled' : '') + '>' + (secured ? '확보됨' : siteLocked ? '잠김 · ' + (site ? site.name : '지역') + ' 해금 필요' : '광맥 확보') + '</button>' +
      '<button data-mine-mine="' + mine.id + '" ' + (mine.developmentState !== 'secured' ? 'disabled' : '') + '>채굴하기 (+' + mine.miningPower + ')</button>';
    wrap.appendChild(card);
  });
  if(hiddenCount > 0){
    const note = document.createElement('div');
    note.className = 'rate world-mine-hidden-note';
    note.setAttribute('data-hidden-mines', String(hiddenCount));
    note.textContent = '미발견 광맥 ' + hiddenCount + '개 — 탐색 영역을 걸어 다니며 가까이 가면 발견됩니다.';
    wrap.appendChild(note);
  }
  wrap.querySelectorAll('[data-secure-mine]').forEach(btn=>{ btn.onclick=()=>{ if(!secureMine(btn.dataset.secureMine)) return; buildMines(); renderWorldObjects(); updateNumbers(); }; });
  wrap.querySelectorAll('[data-mine-mine]').forEach(btn=>{ btn.onclick=()=>{ if(!mineMine(btn.dataset.mineMine)) return; updateNumbers(); }; });
}
// tab switching
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  };
});

// Full rebuild: only called after structural changes (new character, facility
// level up, site unlock, prestige). Never called from the fast tick loop, so
// buttons keep their identity and don't flicker.
function buildLines(){
  const wrap = document.getElementById('lines');
  wrap.innerHTML = '';
  SITES.forEach(site=>{
    const group = document.createElement('div');
    group.className = 'site-group';
    const siteResources = RESOURCES.filter(r=>r.site===site.key);
    if(!state.unlockedSites[site.key]){
      const relatedRecipes = siteRelatedRecipeNames(site);
      group.innerHTML = `
        <h3><span class="site-name">🔒 ${site.name}</span></h3>
        <div class="lines">
          <div class="line locked">
            <div class="rate">이 채굴장은 아직 탐사하지 않았습니다.<br>탐사하면 이곳만의 고유 광물(${siteResources.map(r=>r.name).join(', ')})을 캘 수 있어요.${relatedRecipes.length ? '<br>관련 제작품: ' + relatedRecipes.join(', ') : ''}</div>
            <button data-unlocksite="${site.key}" ${dis(state.gold < site.unlockCost)}>채굴장 탐사 (${site.unlockCost}G)</button>
          </div>
        </div>
      `;
      wrap.appendChild(group);
      return;
    }
    let linesHtml = '';
    siteResources.forEach(r=>{
      const rate = autoRate(r.key);
      linesHtml += `
        <div class="line">
          <div class="res-name">${r.name}</div>
          <div class="res-amt" data-amt="${r.key}">${fmt(state.resources[r.key])}</div>
          <div class="rate" data-rate="${r.key}">${rate > 0 ? '자동 +' + rate.toFixed(1) + '/초' : '수동 채굴만 가능'}</div>
          <button data-mine="${r.key}">채굴하기 (+${manualAmount(r.key).toFixed(1)})</button>
          <div class="facility">
            <span>채굴 도구 Lv.${state.facility[r.key]}</span>
            <button data-fac="${r.key}" class="ghost" ${dis(state.resources[r.key] < facilityCost(r.key))}>강화 (${r.name} ${facilityCost(r.key)}개)</button>
          </div>
          <div class="facility">
            <span>인력 강화 Lv.${state.workforce[r.key]}</span>
            <button data-train="${r.key}" class="ghost" ${dis(state.resources[r.key] < workforceCost(r.key))}>훈련 (${r.name} ${workforceCost(r.key)}개)</button>
          </div>
        </div>
      `;
    });
    group.innerHTML = `<h3><span class="site-name">${site.name}</span></h3><div class="lines">${linesHtml}</div>`;
    wrap.appendChild(group);
  });
  wrap.querySelectorAll('[data-unlocksite]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!unlockSite(btn.dataset.unlocksite)) return;
      renderAll();
    };
  });
  wrap.querySelectorAll('[data-mine]').forEach(btn=>{
    btn.onclick = ()=>{
      mineResource(btn.dataset.mine);
      updateNumbers();
    };
  });
  wrap.querySelectorAll('[data-fac]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!upgradeFacility(btn.dataset.fac)) return;
      buildLines(); // rate/cost/level text changed → structural rebuild is fine here (rare event)
    };
  });
  wrap.querySelectorAll('[data-train]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!upgradeWorkforce(btn.dataset.train)) return;
      buildLines(); // rate/cost/level text changed → structural rebuild is fine here (rare event)
    };
  });
}

// Task 38/44: Workshop cards live in the 개발 tab. Recipe select, manual
// craft, and auto-craft controls call factory.js actions then re-render.
function recipeNeedsLockedResource(recipe){
  return Object.keys(recipe.need).some(k=>{
    const res = RESOURCES.find(x=>x.key===k);
    return res && !isUnlocked(k);
  });
}
function workshopProgressLabel(workshop, recipe){
  if(workshop.progress !== null && recipe) return '제작 중... ' + workshop.progress.toFixed(1) + '초';
  if(recipe) return workshop.auto ? '자동 제작 중' : '대기 중';
  return '레시피를 선택하세요';
}
function workshopBuildLabel(){
  return '제작소 짓기 (' + fmt(workshopBuildCost()) + 'G)';
}
function renderWorkshopBuild(){
  const wrap = document.getElementById('workshopBuild');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(!isWorkshopBuildUnlocked()){
    wrap.innerHTML = '<div class="rate">제작소를 지으려면 연구 탭에서 "제작소 건설"을 연구하세요.</div>';
    return;
  }
  if(state.world.workshops.length >= BALANCE.workshop.MAX_COUNT){
    wrap.innerHTML = '<div class="rate">제작소를 더 지을 수 없습니다. (최대 ' + BALANCE.workshop.MAX_COUNT + '곳)</div>';
    return;
  }
  const btn = document.createElement('button');
  btn.setAttribute('data-build-workshop', '');
  btn.textContent = workshopBuildLabel();
  btn.disabled = !canBuildWorkshop();
  btn.onclick = () => {
    if(!buildWorkshop()) return;
    renderAll();
  };
  wrap.appendChild(btn);
}

function renderWorkshops(){
  const wrap = document.getElementById('workshops');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(state.world.workshops.length === 0){
    wrap.innerHTML = '<div class="rate">아직 설치된 제작소가 없습니다.</div>';
    return;
  }
  state.world.workshops.forEach(workshop=>{
    const card = document.createElement('div');
    card.className = 'line';
    const options = '<option value="">레시피 없음</option>' +
      RECIPES.filter(recipe => recipe.key === workshop.recipeKey || !recipeNeedsLockedResource(recipe)).map(recipe =>
        '<option value="' + recipe.key + '"' + (recipe.key === workshop.recipeKey ? ' selected' : '') + '>' + recipe.name + '</option>'
      ).join('');
    const recipe = workshopRecipe(workshop.id);
    const progress = workshopProgressLabel(workshop, recipe);
    card.innerHTML =
      '<div class="res-name">제작소 Lv.' + workshop.level + '</div>' +
      '<div class="rate">위치 (' + workshop.x + ', ' + workshop.y + ') · <span data-workshop-progress="' + workshop.id + '">' + progress + '</span></div>' +
      '<div class="row">' +
        '<select data-workshop-recipe="' + workshop.id + '"' + dis(workshop.progress !== null) + '>' + options + '</select>' +
        '<button data-workshop-craft="' + workshop.id + '" ' + dis(!recipe || workshop.progress !== null || !canCraft(recipe)) + '>제작</button>' +
      '</div>' +
      '<label class="toggle-auto">' +
        '<input type="checkbox" data-workshop-auto="' + workshop.id + '"' + (workshop.auto ? ' checked' : '') + ' ' + dis(!recipe || !isAutoCraftUnlocked()) + '>' + (isAutoCraftUnlocked() ? '자동 제작' : '자동 제작 (연구: 자동 제작 장치)') +
      '</label>';
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('[data-workshop-recipe]').forEach(select=>{
    select.onchange = ()=>{
      setWorkshopRecipe(select.dataset.workshopRecipe, select.value || null);
      renderWorkshops();
    };
  });
  wrap.querySelectorAll('[data-workshop-craft]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!craftWorkshop(btn.dataset.workshopCraft)) return;
      updateNumbers();
      renderWorkshops();
    };
  });
  wrap.querySelectorAll('[data-workshop-auto]').forEach(chk=>{
    chk.onchange = ()=>{
      const workshop = state.world.workshops.find(item => item.id === chk.dataset.workshopAuto);
      if(!workshop) return;
      workshop.auto = chk.checked;
      if(workshop.auto) craftWorkshop(workshop.id);
      updateNumbers();
    };
  });
}

// Task 70: research cards (연구 tab). Rebuilt with renderAll() and after a
// research is done; the per-tick refresh (updateNumbers) only toggles the
// button and rewrites the cost line, so buttons keep their identity.
function researchCostText(def){
  const cost = def.cost || {};
  const parts = [];
  if(cost.gold) parts.push(fmt(cost.gold) + 'G (보유 ' + fmt(state.gold) + 'G)');
  Object.keys(cost.products || {}).forEach(k => {
    const recipe = RECIPES.find(r => r.key === k);
    parts.push((recipe ? recipe.name : k) + ' ' + cost.products[k] + '개 (보유 ' + fmt(state.products[k] || 0) + '개)');
  });
  return '비용: ' + (parts.length ? parts.join(' + ') : '없음');
}

function researchButtonLabel(status){
  return status === 'done' ? '연구 완료' : status === 'locked' ? '선행 연구 필요' : '연구하기';
}

function renderResearch(){
  const wrap = document.getElementById('researchList');
  if(!wrap) return;
  wrap.innerHTML = '';
  RESEARCH_BRANCHES.forEach(branch => {
   const defs = RESEARCH.filter(def => def.branch === branch.key);
   if(defs.length === 0) return;
   const title = document.createElement('div');
   title.className = 'research-branch-title';
   title.textContent = branch.name;
   wrap.appendChild(title);
   defs.forEach(def => {
    const status = researchStatus(def.key);
    const card = document.createElement('div');
    card.className = 'line research-card is-' + status;
    card.setAttribute('data-research-card', def.key);
    card.setAttribute('data-research-status', status);
    const needs = (def.requires || []).filter(k => !isResearchDone(k)).map(k => (researchDef(k) || { name: k }).name);
    card.innerHTML =
      '<div class="res-name">' + def.name + '</div>' +
      '<div class="rate">' + def.desc + '</div>' +
      (status === 'done' ? '' : '<div class="rate research-cost" data-research-cost="' + def.key + '">' + researchCostText(def) + '</div>') +
      (needs.length && status === 'locked' ? '<div class="rate">먼저 필요한 연구: ' + needs.join(', ') + '</div>' : '') +
      '<button data-research="' + def.key + '" ' + dis(!canResearch(def.key)) + '>' + researchButtonLabel(status) + '</button>';
    wrap.appendChild(card);
   });
  });
  wrap.querySelectorAll('[data-research]').forEach(btn => {
    btn.onclick = () => {
      if(!doResearch(btn.dataset.research)) return;
      renderAll();
    };
  });
}

// Full rebuild: only called after structural changes (auto-craft unlock
// toggling, site unlock, prestige reset). Buttons keep their identity between ticks.
function buildRecipes(){
  const wrap = document.getElementById('recipes');
  wrap.innerHTML = '';
  const autoUnlocked = isAutoCraftUnlocked();
  RECIPES.forEach(r=>{
    // Hide recipes whose raw resource inputs aren't unlocked yet, to avoid clutter.
    const needsLockedResource = recipeNeedsLockedResource(r);
    if(needsLockedResource) return;
    const needText = Object.entries(r.need).map(([k,v])=>{
      const name = RESOURCES.find(x=>x.key===k)?.name || RECIPES.find(x=>x.key===k)?.name || k;
      return `${name} ${v}`;
    }).join(' + ');
    const div = document.createElement('div');
    div.className = 'recipe';
    div.innerHTML = `
      <div class="name">${r.name}</div>
      <div class="need">${needText} →</div>
      <div class="stock" data-stock="${r.key}">${fmt(state.products[r.key])}개 보유</div>
      <div class="row">
        <button data-craft="${r.key}" ${dis(!canCraft(r))}>제작</button>
        <button data-sell="${r.key}" class="ghost" ${dis(state.products[r.key]<=0)}>전량 판매 (${fmt(r.sell * mult())}G/개)</button>
      </div>
      <label class="toggle-auto">
        <input type="checkbox" data-autocraft="${r.key}" ${state.autoCraft[r.key]?'checked':''} ${dis(!autoUnlocked)}>
        ${autoUnlocked ? '자동 제작' : '자동 제작 (연구: 자동 제작 장치)'}
      </label>
      ${state.autoSell[r.key] ? `
      <label class="toggle-auto">
        <input type="checkbox" data-autoselltoggle="${r.key}" ${state.autoSellOn[r.key]?'checked':''}>
        자동 판매 (켜짐/꺼짐)
      </label>
      ` : `
      <div class="facility">
        <span>자동 판매 미구매</span>
        <button data-buyautosell="${r.key}" class="ghost" ${dis(state.gold < autoSellCost(r))}>구매 (${autoSellCost(r)}G)</button>
      </div>
      `}
    `;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('[data-craft]').forEach(btn=>{
    btn.onclick=()=>{ startCraft(RECIPES.find(r=>r.key===btn.dataset.craft)); updateNumbers(); };
  });
  wrap.querySelectorAll('[data-sell]').forEach(btn=>{
    btn.onclick=()=>{ sellAll(RECIPES.find(r=>r.key===btn.dataset.sell)); updateNumbers(); renderCurrencies(); };
  });
  wrap.querySelectorAll('[data-autocraft]').forEach(chk=>{
    chk.onchange=()=>{ state.autoCraft[chk.dataset.autocraft] = chk.checked; };
  });
  wrap.querySelectorAll('[data-autoselltoggle]').forEach(chk=>{
    chk.onchange=()=>{ state.autoSellOn[chk.dataset.autoselltoggle] = chk.checked; };
  });
  wrap.querySelectorAll('[data-buyautosell]').forEach(btn=>{
    btn.onclick=()=>{
      if(!buyAutoSell(btn.dataset.buyautosell)) return;
      buildRecipes(); // row layout changed (button → toggle) → rare event, fine to rebuild
      renderCurrencies();
    };
  });
}

function renderLastPull(){
  const wrap = document.getElementById('lastPull');
  wrap.innerHTML = '';
  if(!state.lastPull) return;
  const c = state.lastPull;
  const rarity = RARITY.find(r=>r.key===c.rarity);
  const resName = RESOURCES.find(r=>r.key===c.resource).name;
  const chip = document.createElement('span');
  chip.className = 'chip ' + rarity.cls;
  chip.textContent = `방금 뽑음: [${rarity.label}] ${resName} 담당 (종합 +${workerEffective(c).toFixed(2)}/초)`;
  wrap.appendChild(chip);
}

// Full rebuild: only called after structural changes (gacha pull, reassignment,
// stat upgrade purchase, site unlock, prestige).
function buildWorkers(){
  const wrap = document.getElementById('workers');
  wrap.innerHTML = '';
  if(state.characters.length===0){
    wrap.innerHTML = '<div class="rate">아직 뽑은 일꾼이 없습니다. 위에서 뽑기를 진행해보세요.</div>';
    return;
  }
  const unlockedList = RESOURCES.filter(r=>isUnlocked(r.key));
  state.characters.forEach((c, idx)=>{
    const rarity = RARITY.find(r=>r.key===c.rarity);
    const div = document.createElement('div');
    div.className = 'worker-card';
    const options = unlockedList.map(r=>`<option value="${r.key}" ${r.key===c.resource?'selected':''}>${r.name}</option>`).join('');
    div.innerHTML = `
      <div class="wtitle">
        <span class="chip ${rarity.cls}">${rarity.label} #${idx+1}</span>
        <select data-reassign data-worker-id="${c.id}">${options}</select>
      </div>
      <div class="worker-stats">
        <span>채굴속도 ${c.mining.toFixed(1)}</span>
        <span>물자 이동량 ${c.carry.toFixed(1)}</span>
        <span>이동속도 ${c.move.toFixed(1)}</span>
        <span class="sum">종합 +${workerEffective(c).toFixed(2)}/초</span>
      </div>
      <div class="worker-upgrades">
        <button class="ghost" data-upstat="mining" data-worker-id="${c.id}" ${dis(state.gold<workerUpgradeCost(c,'mining'))}>채굴속도 강화 (${workerUpgradeCost(c,'mining')}G)</button>
        <button class="ghost" data-upstat="carry" data-worker-id="${c.id}" ${dis(state.gold<workerUpgradeCost(c,'carry'))}>이동량 강화 (${workerUpgradeCost(c,'carry')}G)</button>
        <button class="ghost" data-upstat="move" data-worker-id="${c.id}" ${dis(state.gold<workerUpgradeCost(c,'move'))}>이동속도 강화 (${workerUpgradeCost(c,'move')}G)</button>
      </div>
    `;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('[data-reassign]').forEach(sel=>{
    sel.onchange = ()=>{
      if(!reassignWorker(sel.dataset.workerId, sel.value)) return;
      buildLines(); // both lines' rates changed
    };
  });
  wrap.querySelectorAll('[data-upstat]').forEach(btn=>{
    btn.onclick = ()=>{
      if(!upgradeWorkerStat(btn.dataset.workerId, btn.dataset.upstat)) return;
      buildWorkers();
      buildLines(); // this worker's line rate changed
      renderCurrencies();
    };
  });
}

document.getElementById('gachaTicketBtn').onclick = ()=>{
  if(permanent.tickets < BALANCE.gacha.PULL_COST_TICKET) return;
  permanent.tickets -= BALANCE.gacha.PULL_COST_TICKET;
  document.getElementById('gachaTicketBtn').disabled = permanent.tickets < BALANCE.gacha.PULL_COST_TICKET;
  pullGacha();
};
document.getElementById('gachaGoldBtn').onclick = ()=>{
  if(state.gold < BALANCE.gacha.PULL_COST_GOLD) return;
  state.gold -= BALANCE.gacha.PULL_COST_GOLD;
  pullGacha();
};

document.getElementById('hqBtn').onclick = ()=>{
  const cost = hqCost();
  if(state.gold < cost) return;
  state.gold -= cost;
  state.hqLevel++;
  log(`본사 투자 Lv.${state.hqLevel} (배율 ×${hqMult().toFixed(2)})`);
  buildLines(); // mine-button labels and rates depend on mult(), which just changed
  updateNumbers();
};

document.getElementById('craftFacilityBtn').onclick = ()=>{
  if(!upgradeCraftFacility()) return;
  updateNumbers();
};

document.getElementById('prestigeInfoBtn').onclick = ()=>{
  const box = document.getElementById('prestigeInfoBox');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
};

document.getElementById('prestigeBtn').onclick = ()=>{
  if(state.characters.length < BALANCE.worker.MIN_REQUIRED){
    log('일꾼을 한 명 이상 뽑은 뒤에 초기화할 수 있습니다.');
    return;
  }
  const gain = prestigeGain();
  if(gain <= 0){
    log('명성 포인트를 얻으려면 이번 회차에서 더 골드를 벌어야 합니다.');
    return;
  }
  if(!confirm(`초기화하면 모든 자원/제품/일꾼이 사라집니다. 명성 포인트 +${gain}을 얻고 다음 회차를 시작할까요?`)) return;
  permanent.totalPrestige += gain;
  state = freshRunState();
  log(`── 회차 ${permanent.runCount} 종료. 명성 포인트 +${gain} (누적 ${permanent.totalPrestige}, 배율 ×${mult().toFixed(2)}) ──`);
  permanent.runCount++;
  renderAll();
  saveGame();
};

// Runs 10x/second: only touches numbers and disabled flags on EXISTING
// elements — never rebuilds the DOM, so nothing flickers and clicks never
// get dropped mid-render.
function updateNumbers(){
  updateNextHint();
  const hint = document.getElementById('firstGachaHint');
  hint.textContent = permanent.firstGachaGranted
    ? '일반 60% · 희귀 25% · 영웅 12% · 전설 3%'
    : `첫 골드 ${BALANCE.gacha.FIRST_TICKET_GOLD_THRESHOLD}G를 모으면 첫 가챠권을 드려요 (현재 ${fmt(state.gold)}/${BALANCE.gacha.FIRST_TICKET_GOLD_THRESHOLD}G)`;
  document.getElementById('gachaTicketBtn').disabled = permanent.tickets < BALANCE.gacha.PULL_COST_TICKET;
  RESOURCES.forEach(r=>{
    const sharedEl = document.querySelector(`[data-shared-amt="${r.key}"]`);
    if(sharedEl) sharedEl.textContent = fmt(state.resources[r.key]);
    const el = document.querySelector(`[data-amt="${r.key}"]`);
    if(el) el.textContent = fmt(state.resources[r.key]);
    const trainBtn = document.querySelector(`[data-train="${r.key}"]`);
    if(trainBtn) trainBtn.disabled = state.resources[r.key] < workforceCost(r.key);
    const facBtn = document.querySelector(`[data-fac="${r.key}"]`);
    if(facBtn) facBtn.disabled = state.resources[r.key] < facilityCost(r.key);
  });
  SITES.forEach(s=>{
    const unlockBtn = document.querySelector(`[data-unlocksite="${s.key}"]`);
    if(unlockBtn) unlockBtn.disabled = state.gold < s.unlockCost;
  });
  RECIPES.forEach(r=>{
    const stockEl = document.querySelector(`[data-stock="${r.key}"]`);
    if(stockEl) stockEl.textContent = fmt(state.products[r.key]) + '개 보유';
    const craftBtn = document.querySelector(`[data-craft="${r.key}"]`);
    if(craftBtn){
      if(state.craftQueue[r.key] !== null){
        craftBtn.disabled = true;
        craftBtn.textContent = `제작 중... ${(state.craftQueue[r.key] / craftSpeed()).toFixed(1)}s`;
      } else {
        craftBtn.disabled = !canCraft(r);
        craftBtn.textContent = '제작';
      }
    }
    const sellBtn = document.querySelector(`[data-sell="${r.key}"]`);
    if(sellBtn){
      sellBtn.disabled = state.products[r.key] <= 0 || (state.autoSell[r.key] && state.autoSellOn[r.key]);
      sellBtn.textContent = `전량 판매 (${fmt(r.sell * mult())}G/개)`;
    }
    const buyAutoSellBtn = document.querySelector(`[data-buyautosell="${r.key}"]`);
    if(buyAutoSellBtn) buyAutoSellBtn.disabled = state.gold < autoSellCost(r);
  });
  state.world.workshops.forEach(workshop=>{
    const recipe = workshopRecipe(workshop.id);
    const btn = document.querySelector('[data-workshop-craft="' + workshop.id + '"]');
    if(btn){
      btn.disabled = !recipe || workshop.progress !== null || !canCraft(recipe);
      btn.textContent = workshop.progress !== null ? '제작 중...' : '제작';
    }
    const chk = document.querySelector('[data-workshop-auto="' + workshop.id + '"]');
    if(chk) chk.disabled = !workshop.recipeKey || !isAutoCraftUnlocked();
    const select = document.querySelector('[data-workshop-recipe="' + workshop.id + '"]');
    if(select) select.disabled = workshop.progress !== null;
    const progressEl = document.querySelector('[data-workshop-progress="' + workshop.id + '"]');
    if(progressEl) progressEl.textContent = workshopProgressLabel(workshop, recipe);
  });
  const buildBtn = document.querySelector('[data-build-workshop]');
  if(buildBtn){ buildBtn.disabled = !canBuildWorkshop(); buildBtn.textContent = workshopBuildLabel(); }
  RESEARCH.forEach(def=>{
    const btn = document.querySelector('[data-research="' + def.key + '"]');
    if(btn) btn.disabled = !canResearch(def.key);
    const costEl = document.querySelector('[data-research-cost="' + def.key + '"]');
    if(costEl) costEl.textContent = researchCostText(def);
  });
  const expandBtn = document.querySelector('[data-expand-base]');
  if(expandBtn){
    const nextKey = BALANCE.world.EXPANSION_SITE_ORDER.find(key => !state.unlockedSites[key]);
    const nextSite = nextKey ? SITES.find(site => site.key === nextKey) : null;
    expandBtn.disabled = !nextSite || state.gold < nextSite.unlockCost;
  }
  document.querySelectorAll('[data-upstat]').forEach(btn=>{
    const workerId = btn.dataset.workerId;
    const stat = btn.dataset.upstat;
    const worker = state.characters.find(w=>w.id===workerId);
    if(worker) btn.disabled = state.gold < workerUpgradeCost(worker, stat);
  });
  const hqBtn = document.getElementById('hqBtn');
  hqBtn.textContent = `투자하기 (${hqCost()}G)`;
  hqBtn.disabled = state.gold < hqCost();
  document.getElementById('hqMultVal').textContent = '×' + hqMult().toFixed(2);
  document.getElementById('craftFacilityVal').textContent = String(state.craftFacility);
  const craftFacilityBtn = document.getElementById('craftFacilityBtn');
  craftFacilityBtn.textContent = `제작 시설 강화 — ${craftFacilityCost()}G`;
  craftFacilityBtn.disabled = state.gold < craftFacilityCost();
  document.getElementById('prestigeGainPreview').textContent = '+' + prestigeGain();
  renderCurrencies();
}

// Structural rebuild after state changes. Render helpers only read `state`.
function renderAll(){
  renderCurrencies();
  renderBaseInfo();
  renderSharedStorage();
  buildMines();
  renderWorkshops();
  buildLines();
  buildRecipes();
  buildWorkers();
  renderResearch();
  renderWorkshopBuild();
  renderLastPull();
  updateNumbers();
  renderWorldGround();
  renderWorldObjects();
  updatePlayerSprite();
}

function playerTypingTarget(el){
  if(!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function onPlayerKey(e, down){
  if(playerTypingTarget(e.target)) return;
  const dir = playerDirFromKey(e.key);
  if(!dir) return;
  if(e.key.startsWith('Arrow')) e.preventDefault();
  setPlayerHeld(dir, down);
}

document.addEventListener('keydown', (e)=> onPlayerKey(e, true));
document.addEventListener('keyup', (e)=> onPlayerKey(e, false));
window.addEventListener('blur', ()=> clearPlayerHeld());

// ---------------------------------------------------------------------------
// Task 57 → Task 61: the one world -> screen conversion shared by the ground,
// the player, the base, the mines and the workshops.
//
// Task 61 turns it into a fixed 2.5D camera: the world is a ground plane seen
// from the south (world y = BOUNDS_MAX_Y is nearest the camera, y =
// BOUNDS_MIN_Y is farthest). It is a true perspective projection of that
// plane, so
//   - far rows sit higher and are narrower, near rows lower and wider;
//   - `scale` (1 on the nearest row, smaller further away) is how big an
//     object standing at that spot looks;
//   - straight world lines stay straight on screen (the ground grid is drawn
//     with this same function, so objects always stand on it).
// World bounds and PLAYER_SPEED are unchanged. The camera does not move yet —
// no follow, no scrolling, no rotation.
// ---------------------------------------------------------------------------
const WORLD_VIEW = {
  FAR_TOP: 24,     // % from stage top: screen row of the farthest world row
  NEAR_TOP: 91,    // % from stage top: screen row of the nearest world row
  NEAR_WIDTH: 72,  // % of stage width covered by the nearest world row
  CENTER_X: 50,    // % — the camera looks straight down the middle of the world
  FAR_DEPTH: 1.5,  // camera distance to the far row, relative to the near row (> 1)
};

function worldToStagePercent(x, y){
  const b = BALANCE.world;
  const v = WORLD_VIEW;
  const spanX = b.BOUNDS_MAX_X - b.BOUNDS_MIN_X;
  const spanY = b.BOUNDS_MAX_Y - b.BOUNDS_MIN_Y;
  const fx = spanX === 0 ? 0 : (x - b.BOUNDS_MIN_X) / spanX;
  const fy = spanY === 0 ? 0 : (y - b.BOUNDS_MIN_Y) / spanY; // 0 = far row, 1 = near row
  const distance = 1 + (1 - fy) * (v.FAR_DEPTH - 1);       // 1 on the near row
  const scale = 1 / distance;
  const farScale = 1 / v.FAR_DEPTH;
  const t = (scale - farScale) / (1 - farScale);           // 0 far → 1 near, linear in 1/distance
  return {
    left: v.CENTER_X + (fx - 0.5) * v.NEAR_WIDTH * scale,
    top: v.FAR_TOP + (v.NEAR_TOP - v.FAR_TOP) * t,
    scale,
    depth: fy,
  };
}

// Task 61: painter's order. Anything nearer the camera (larger world y) is
// drawn in front. `bias` breaks ties on the same row (the player stands in
// front of the base/mine it is standing on).
function worldDepthZIndex(depth, bias){
  const d = Number.isFinite(depth) ? depth : 0;
  return Math.max(1, 100 + Math.round(d * 1000) * 2 + (bias || 0));
}

function placeOnStage(el, x, y, bias){
  const pos = worldToStagePercent(x, y);
  el.style.left = pos.left + '%';
  el.style.top = pos.top + '%';
  el.style.setProperty('--depth-scale', pos.scale.toFixed(4));
  el.style.zIndex = String(worldDepthZIndex(pos.depth, bias));
}

// Task 61: the ground plane and its world-unit grid, drawn once per
// renderAll() from worldToStagePercent() so the grid and the objects share
// one projection. SVG in stage-percent units (viewBox 0..100, stretched).
const SVG_NS = 'http://www.w3.org/2000/svg';
const WORLD_GROUND_PAD = 0.6; // world units of ground drawn past the bounds

function renderWorldGround(){
  const ground = document.querySelector('#worldStage .world-ground');
  if(!ground || !ground.ownerDocument.createElementNS) return;
  const b = BALANCE.world;
  const pad = WORLD_GROUND_PAD;
  const pt = (x, y) => { const p = worldToStagePercent(x, y); return p.left.toFixed(3) + ',' + p.top.toFixed(3); };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'world-ground-svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const plane = document.createElementNS(SVG_NS, 'polygon');
  plane.setAttribute('class', 'world-ground-plane');
  plane.setAttribute('points', [
    pt(b.BOUNDS_MIN_X - pad, b.BOUNDS_MIN_Y - pad),
    pt(b.BOUNDS_MAX_X + pad, b.BOUNDS_MIN_Y - pad),
    pt(b.BOUNDS_MAX_X + pad, b.BOUNDS_MAX_Y + pad),
    pt(b.BOUNDS_MIN_X - pad, b.BOUNDS_MAX_Y + pad),
  ].join(' '));
  svg.appendChild(plane);
  const line = (x1, y1, x2, y2, cls) => {
    const a = worldToStagePercent(x1, y1), c = worldToStagePercent(x2, y2);
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('class', cls);
    el.setAttribute('x1', a.left.toFixed(3)); el.setAttribute('y1', a.top.toFixed(3));
    el.setAttribute('x2', c.left.toFixed(3)); el.setAttribute('y2', c.top.toFixed(3));
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(el);
  };
  for(let x = b.BOUNDS_MIN_X; x <= b.BOUNDS_MAX_X; x++){
    const edge = x === b.BOUNDS_MIN_X || x === b.BOUNDS_MAX_X;
    line(x, b.BOUNDS_MIN_Y, x, b.BOUNDS_MAX_Y, edge ? 'world-grid-edge' : 'world-grid-line');
  }
  for(let y = b.BOUNDS_MIN_Y; y <= b.BOUNDS_MAX_Y; y++){
    const edge = y === b.BOUNDS_MIN_Y || y === b.BOUNDS_MAX_Y;
    line(b.BOUNDS_MIN_X, y, b.BOUNDS_MAX_X, y, edge ? 'world-grid-edge' : 'world-grid-line');
  }
  // Task 66: the mountain's footprint and the land beyond it, drawn over the
  // grid from the same terrain data the movement code uses.
  const top = b.BOUNDS_MIN_Y - pad, bottom = b.BOUNDS_MAX_Y + pad, west = b.BOUNDS_MIN_X - pad;
  const faceLine = terrainFaceOutline(top, bottom);
  const poly = (cls, pts) => { const el = document.createElementNS(SVG_NS, 'polygon'); el.setAttribute('class', cls); el.setAttribute('points', pts.map(p => pt(p.x, p.y)).join(' ')); svg.appendChild(el); return el; };
  poly('world-range-rock', [{ x: west, y: top }, ...faceLine, { x: west, y: bottom }]);
  const backLine = faceLine.map(p => ({ x: Math.max(west, terrainRangeBackX(p.y)), y: p.y }));
  poly('world-beyond', [{ x: west, y: top }, ...backLine, { x: west, y: bottom }]).setAttribute('data-terrain', 'beyond');
  // Task 68: once the tunnel is open, the passage through the range (mouth to
  // the far exit) is drawn over the rock, joining the open ground to the land beyond.
  if(terrainTunnelOpen()){
    const tn = terrainTunnel();
    const exit = terrainTunnelExit();
    poly('world-tunnel-passage', [
      { x: tn.mouthX, y: tn.y - tn.halfWidth }, { x: exit.x, y: tn.y - tn.halfWidth },
      { x: exit.x, y: tn.y + tn.halfWidth }, { x: tn.mouthX, y: tn.y + tn.halfWidth },
    ]).setAttribute('data-terrain', 'tunnel-passage');
  }
  ground.innerHTML = '';
  ground.appendChild(svg);
  renderWorldTerrain();
}

// Task 66: points along the walk-stopping face from y=top to y=bottom
// (rock face with the tunnel recess cut in), as straight segments.
function terrainFaceOutline(top, bottom){
  const ys = new Set([top, bottom]);
  WORLD_TERRAIN.FACE.forEach(s => { [s.y0, s.y1].forEach(v => { if(v > top && v < bottom) ys.add(v); }); });
  const t = WORLD_TERRAIN.TUNNEL;
  [t.Y - t.HALF_WIDTH, t.Y + t.HALF_WIDTH].forEach(v => { if(v > top && v < bottom) ys.add(v); });
  const sorted = [...ys].sort((a, c) => a - c);
  const pts = [];
  for(let i = 0; i < sorted.length - 1; i++){
    const mid = (sorted[i] + sorted[i + 1]) / 2;
    const x = terrainFaceX(mid);
    pts.push({ x, y: sorted[i] }, { x, y: sorted[i + 1] });
  }
  return pts;
}

// Task 66: mountain peaks and the locked tunnel as depth-sorted stage objects
// (placeOnStage), so they scale with distance and overlap correctly with the
// player. Fixed terrain: rebuilt with the ground, never per tick. Click-through.
function renderWorldTerrain(){
  const layer = document.getElementById('worldTerrainLayer');
  if(!layer) return;
  layer.innerHTML = '';
  terrainPeaks().forEach((pk, i) => {
    const el = document.createElement('div');
    el.className = 'world-mountain-peak peak-' + pk.row;
    el.setAttribute('data-terrain', 'peak');
    // Sized relative to the stage width (52px on the 820px desktop stage) so the
    // range keeps its proportions on narrow screens.
    el.style.width = (6.4 * pk.size).toFixed(2) + '%';
    el.style.aspectRatio = pk.row === 'back' ? '52 / 50' : '52 / 38';
    placeOnStage(el, pk.x, pk.y);
    layer.appendChild(el);
  });
  const t = terrainTunnel();
  const tunnel = document.createElement('div');
  tunnel.className = 'world-tunnel ' + (t.locked ? 'is-locked' : 'is-open');
  tunnel.setAttribute('data-tunnel', '');
  tunnel.setAttribute('data-tunnel-locked', t.locked ? 'true' : 'false');
  tunnel.title = t.locked ? '터널 (잠김) — 연구 탭의 "터널 굴착"으로 열 수 있습니다' : '터널 — 산 너머로 이어집니다';
  // Closed: the arch stands at the gate at the back of the recess. Open: the
  // gate is gone, so the arch marks the mouth on the rock face.
  placeOnStage(tunnel, t.locked ? t.gateX + 0.15 : t.mouthX - 0.1, t.y + t.halfWidth);
  layer.appendChild(tunnel);
  // The label is its own element above the terrain so nearer peaks never hide it.
  const label = document.createElement('div');
  label.className = 'world-tunnel-label';
  label.setAttribute('data-tunnel-label', '');
  label.textContent = t.locked ? '🔒 잠긴 터널' : '터널';
  placeOnStage(label, t.mouthX + 0.2, t.y + t.halfWidth);
  label.style.zIndex = '4500';
  layer.appendChild(label);
}

// Task 57: draws the base and every mine in state.world.mines onto the
// stage. Structural — called from renderAll() (and after securing a mine),
// never from the tick loop. The mine list (#worldMines) and this layer both
// read the same state.world.mines array; no positions live in the HTML.
function renderWorldObjects(){
  const marker = document.querySelector('.world-base-marker');
  if(marker){
    placeOnStage(marker, state.world.base.x, state.world.base.y);
    marker.title = '거점 Lv.' + state.world.base.level + ' (' + state.world.base.x + ', ' + state.world.base.y + ')';
  }
  const layer = document.getElementById('worldMineLayer');
  if(!layer) return;
  layer.innerHTML = '';
  state.world.mines.forEach(mine=>{
    if(!mine) return;
    const resource = RESOURCES.find(r=>r.key===mine.resource);
    const name = resource ? resource.name : mine.resource;
    const secured = mine.developmentState === 'secured';
    const node = document.createElement('div');
    node.setAttribute('data-world-mine', mine.id);
    node.setAttribute('data-development-state', mine.developmentState);
    const label = document.createElement('span');
    label.className = 'world-mine-label';
    if(isMineDiscovered(mine)){
      node.className = 'world-mine-node res-' + mine.resource + (secured ? ' is-secured' : ' is-unsecured');
      node.setAttribute('data-resource', mine.resource);
      node.title = name + ' 광맥 · ' + (secured ? '확보 완료' : '미확보') + ' (' + mine.x + ', ' + mine.y + ')';
      label.textContent = name;
    } else {
      // Task 65: an undiscovered mine is an unknown rock — its resource stays hidden.
      node.className = 'world-mine-node is-undiscovered is-unsecured';
      node.setAttribute('data-discovered', 'false');
      node.title = '미발견 광맥 (' + mine.x + ', ' + mine.y + ')';
      label.textContent = '?';
    }
    node.appendChild(label);
    placeOnStage(node, mine.x, mine.y);
    layer.appendChild(node);
  });
  renderWorldWorkshopMarkers();
  renderExplorationMap();
  applyWorldSelection();
}

// ---------------------------------------------------------------------------
// Task 65: exploration map — a small top-down map in the stage's top-left
// corner. Shows the base, the player and DISCOVERED mines only (never hidden
// ones). World units are used directly as SVG units (north up), so it reads
// the same data as the stage. Rebuilt with renderWorldObjects(); only the
// player dot moves per tick (updateExplorationMapPlayer).
// ---------------------------------------------------------------------------
function renderExplorationMap(){
  const box = document.getElementById('worldMap');
  if(!box || !box.ownerDocument.createElementNS) return;
  const b = BALANCE.world;
  const pad = 0.8;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'world-map-svg');
  svg.setAttribute('viewBox', [b.BOUNDS_MIN_X - pad, b.BOUNDS_MIN_Y - pad, (b.BOUNDS_MAX_X - b.BOUNDS_MIN_X) + pad * 2, (b.BOUNDS_MAX_Y - b.BOUNDS_MIN_Y) + pad * 2].join(' '));
  svg.setAttribute('aria-hidden', 'true');
  const el = (tag, attrs) => { const n = document.createElementNS(SVG_NS, tag); Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k])); svg.appendChild(n); return n; };
  el('rect', { class: 'world-map-frame', x: b.BOUNDS_MIN_X, y: b.BOUNDS_MIN_Y, width: b.BOUNDS_MAX_X - b.BOUNDS_MIN_X, height: b.BOUNDS_MAX_Y - b.BOUNDS_MIN_Y });
  // Task 66: mountain (and the closed land beyond it) + the locked tunnel.
  const faceLine = terrainFaceOutline(b.BOUNDS_MIN_Y, b.BOUNDS_MAX_Y);
  el('polygon', { class: 'world-map-mountain', 'data-map-mountain': '', points: [{ x: b.BOUNDS_MIN_X, y: b.BOUNDS_MIN_Y }, ...faceLine, { x: b.BOUNDS_MIN_X, y: b.BOUNDS_MAX_Y }].map(p => p.x + ',' + p.y).join(' ') });
  const tn = terrainTunnel();
  // Task 68: closed = the recess up to the gate; open = the whole passage to the far exit.
  const tnWestX = tn.locked ? tn.gateX : terrainTunnelExit().x;
  el('rect', { class: 'world-map-tunnel' + (tn.locked ? '' : ' is-open'), 'data-map-tunnel': '', x: tnWestX, y: tn.y - tn.halfWidth, width: tn.mouthX - tnWestX, height: tn.halfWidth * 2 });
  const base = state.world.base;
  el('rect', { class: 'world-map-base', 'data-map-base': '', x: base.x - 0.6, y: base.y - 0.6, width: 1.2, height: 1.2 });
  state.world.mines.forEach(mine => {
    if(!mine || !isMineDiscovered(mine)) return;
    el('circle', { class: 'world-map-mine res-' + mine.resource + (mine.developmentState === 'secured' ? ' is-secured' : ''), 'data-map-mine': mine.id, cx: mine.x, cy: mine.y, r: 0.5 });
  });
  const p = state.world.player;
  el('circle', { class: 'world-map-player', id: 'worldMapPlayer', cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: 0.65 });
  box.innerHTML = '';
  box.appendChild(svg);
}

function updateExplorationMapPlayer(){
  const dot = document.getElementById('worldMapPlayer');
  if(!dot || !state.world.player) return;
  dot.setAttribute('cx', state.world.player.x.toFixed(2));
  dot.setAttribute('cy', state.world.player.y.toFixed(2));
}

// Task 60: draws one marker per existing state.world.workshops entry.
// Presentation only — never creates a workshop, never selects one, and never
// handles clicks. The layer and nodes stay click-through via CSS
// (pointer-events:none). Positions use the same worldToStagePercent()
// conversion as the base, mines, and player. Called from renderWorldObjects(),
// so renderAll() refreshes the markers with the rest of the stage.
function renderWorldWorkshopMarkers(){
  const layer = document.getElementById('worldWorkshopLayer');
  if(!layer) return;
  layer.innerHTML = '';
  const workshops = state.world && Array.isArray(state.world.workshops) ? state.world.workshops : [];
  workshops.forEach(workshop=>{
    if(!workshop) return;
    const node = document.createElement('div');
    node.className = 'world-workshop-node';
    if(typeof workshop.id === 'string' && workshop.id.length > 0){
      node.setAttribute('data-world-workshop', workshop.id);
    }
    node.title = '제작소 Lv.' + workshop.level + ' (' + workshop.x + ', ' + workshop.y + ')';
    const label = document.createElement('span');
    label.className = 'world-workshop-label';
    label.textContent = '제작소';
    node.appendChild(label);
    placeOnStage(node, workshop.x, workshop.y);
    layer.appendChild(node);
  });
}

// ---------------------------------------------------------------------------
// Task 58: world object selection (base or one mine), foundation only — no
// info panel, no actions. The selection is UI-only session state: it lives
// in this module variable, never in `state`, so it is never saved and a
// reload / new game always starts with nothing selected.
//   null                      -> nothing selected
//   { type: 'base' }          -> the base
//   { type: 'mine', id }      -> the mine with that id in state.world.mines
// ---------------------------------------------------------------------------
let worldSelection = null;

function getWorldSelection(){
  return worldSelection ? { ...worldSelection } : null;
}

function isWorldSelectionValid(sel){
  if(!sel) return true;
  if(sel.type === 'base') return true;
  if(sel.type === 'mine') return state.world.mines.some(m => m && m.id === sel.id);
  return false;
}

function selectWorldObject(type, id){
  let next = null;
  if(type === 'base') next = { type: 'base' };
  else if(type === 'mine' && typeof id === 'string') next = { type: 'mine', id };
  if(!next || !isWorldSelectionValid(next)) return false;
  worldSelection = next;
  applyWorldSelection();
  return true;
}

function clearWorldSelection(){
  worldSelection = null;
  applyWorldSelection();
}

// Reflects worldSelection onto the stage DOM (one .is-selected at most).
// Drops a selection whose mine no longer exists (e.g. after prestige).
function applyWorldSelection(){
  if(!isWorldSelectionValid(worldSelection)) worldSelection = null;
  const stage = document.getElementById('worldStage');
  if(!stage) return;
  const sel = worldSelection;
  stage.setAttribute('data-world-selected', sel ? (sel.type === 'mine' ? 'mine:' + sel.id : 'base') : '');
  const marker = stage.querySelector('.world-base-marker');
  if(marker) marker.classList.toggle('is-selected', !!sel && sel.type === 'base');
  stage.querySelectorAll('[data-world-mine]').forEach(node=>{
    node.classList.toggle('is-selected', !!sel && sel.type === 'mine' && node.getAttribute('data-world-mine') === sel.id);
  });
  renderWorldInfo();
}

// ---------------------------------------------------------------------------
// Task 59: small read-only info box for the selected world object.
// Every line is read from state.world at render time (no copied state), and
// it re-renders whenever the selection is re-applied — i.e. on select/clear
// and at the end of renderWorldObjects(), which already runs after securing
// a mine, expanding, loading, etc. Hidden when nothing is selected.
// ---------------------------------------------------------------------------
function worldInfoLines(sel){
  if(!sel) return null;
  if(sel.type === 'base'){
    const base = state.world.base;
    return [
      { key: 'title', text: '거점' },
      { key: 'level', text: '레벨 ' + base.level },
      { key: 'position', text: '위치 (' + base.x + ', ' + base.y + ')' },
    ];
  }
  if(sel.type === 'mine'){
    const mine = state.world.mines.find(m => m && m.id === sel.id);
    if(!mine) return null;
    if(!isMineDiscovered(mine)){
      // Task 65: identity stays hidden until the player walks up to it.
      return [
        { key: 'title', text: '미발견 광맥' },
        { key: 'resource', text: '정체 불명' },
        { key: 'grade', text: '등급 ?' },
        { key: 'state', text: '가까이 가면 발견' },
      ];
    }
    const resource = RESOURCES.find(r => r.key === mine.resource);
    const name = resource ? resource.name : mine.resource;
    return [
      { key: 'title', text: name + ' 광맥' },
      { key: 'resource', text: name },
      { key: 'grade', text: '등급 ' + mine.grade },
      { key: 'state', text: mine.developmentState === 'secured' ? '확보됨' : '미확보' },
    ];
  }
  return null;
}

function renderWorldInfo(){
  const box = document.getElementById('worldInfo');
  if(!box) return;
  const lines = worldInfoLines(worldSelection);
  box.innerHTML = '';
  if(!lines){
    box.hidden = true;
    box.removeAttribute('data-world-info-type');
    return;
  }
  lines.forEach(line=>{
    const row = document.createElement('div');
    row.className = 'world-info-' + line.key;
    row.setAttribute('data-world-info', line.key);
    row.textContent = line.text;
    box.appendChild(row);
  });
  box.setAttribute('data-world-info-type', worldSelection.type);
  box.hidden = false;
}

// One delegated click handler on the stage: an object click selects it,
// anything else inside the stage (ground, player) clears the selection.
// Because both cases are decided here from the same event, the "empty
// space clears" branch can never overwrite an object selection.
function onWorldStageClick(e){
  const stage = e.currentTarget;
  const target = e.target && e.target.closest ? e.target : null;
  const mineNode = target ? target.closest('[data-world-mine]') : null;
  if(mineNode && stage.contains(mineNode)){
    selectWorldObject('mine', mineNode.getAttribute('data-world-mine'));
    return;
  }
  const baseNode = target ? target.closest('.world-base-marker') : null;
  if(baseNode && stage.contains(baseNode)){
    selectWorldObject('base');
    return;
  }
  clearWorldSelection();
}

(function bindWorldStageClick(){
  const stage = document.getElementById('worldStage');
  if(stage) stage.addEventListener('click', onWorldStageClick);
})();

function updatePlayerSprite(){
  const el = document.getElementById('playerChar');
  if(!el || !state.world.player) return;
  const p = state.world.player;
  placeOnStage(el, p.x, p.y, 1); // Task 61: in front of whatever shares its row
  el.className = 'player-char pose-' + p.pose + ' facing-' + p.facing;
  el.setAttribute('data-player-pose', p.pose);
  el.setAttribute('data-player-facing', p.facing);
  updateExplorationMapPlayer(); // Task 65
}

