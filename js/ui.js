function updateNextHint(){
  const el = document.getElementById('nextHint');
  if(!el) return;
  const ironHas = hasWorkerOn('iron');
  const coalHas = hasWorkerOn('coal');
  if(!permanent.firstGachaGranted){
    el.textContent = `채굴 탭에서 광석을 캔 뒤, 개발 탭에서 강철을 만들어 파세요. 골드 50이 되면 첫 가챠권을 받습니다. (현재 ${fmt(state.gold)}/${BALANCE.gacha.FIRST_TICKET_GOLD_THRESHOLD}G)`;
  } else if(state.characters.length < BALANCE.worker.MIN_REQUIRED){
    el.textContent = permanent.tickets >= 1
      ? '인부 탭에서 가챠권으로 일꾼을 뽑으세요. 일꾼이 있어야 자동 제작과 프레스티지가 열립니다.'
      : '인부 탭에서 일꾼을 뽑으세요. 일꾼 1명 이상이어야 초기화(명성)를 할 수 있습니다.';
  } else if(ironHas !== coalHas){
    const missing = ironHas ? 'coal' : 'iron';
    el.textContent = `${resName(missing)}은 아직 수동입니다. 일꾼을 한 명 더 뽑으면 강철도 완전 자동화할 수 있어요.`;
  } else if(ironHas && coalHas && !state.autoCraft.steel){
    el.textContent = '철광석/석탄 자동화 완료! 자동 제작을 켜면 강철도 자동으로 만들어져요.';
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
  if(state.world.mines.length === 0){ wrap.innerHTML = '<div class="rate">아직 발견된 광맥이 없습니다.</div>'; return; }
  state.world.mines.forEach(mine=>{
    const resource = RESOURCES.find(r=>r.key===mine.resource);
    const card = document.createElement('div');
    card.className = 'line world-mine';
    card.innerHTML = '<div class="res-name">' + (resource ? resource.name : mine.resource) + '</div>' +
      '<div class="rate">위치 (' + mine.x + ', ' + mine.y + ') · 등급 ' + mine.grade + ' · 채굴력 ' + mine.miningPower + '</div>' +
      '<div class="rate">' + (mine.developmentState === 'secured' ? '확보 완료' : '미확보') + '</div>' +
      '<button data-secure-mine="' + mine.id + '" ' + (mine.developmentState === 'secured' ? 'disabled' : '') + '>' + (mine.developmentState === 'secured' ? '확보됨' : '광맥 확보') + '</button>' +
      '<button data-mine-mine="' + mine.id + '" ' + (mine.developmentState !== 'secured' ? 'disabled' : '') + '>채굴하기 (+' + mine.miningPower + ')</button>';
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('[data-secure-mine]').forEach(btn=>{ btn.onclick=()=>{ if(!secureMine(btn.dataset.secureMine)) return; buildMines(); }; });
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
      buildLines();
      buildRecipes();
      buildWorkers();
      renderCurrencies();
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

// Task 38: Minimal workshop UI. Workshops are displayed as world/base
// facilities; recipe assignment and production behavior are intentionally
// deferred to later Tasks.
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
      RECIPES.map(recipe => '<option value="' + recipe.key + '"' + (recipe.key === workshop.recipeKey ? ' selected' : '') + '>' + recipe.name + '</option>').join('');
    const recipe = workshopRecipe(workshop.id);
    const progress = workshop.progress !== null && recipe
      ? '제작 중... ' + workshop.progress.toFixed(1) + '초'
      : (recipe ? '대기 중' : '레시피를 선택하세요');
    card.innerHTML =
      '<div class="res-name">제작소 Lv.' + workshop.level + '</div>' +
      '<div class="rate">위치 (' + workshop.x + ', ' + workshop.y + ') · ' + progress + '</div>' +
      '<div class="row">' +
        '<select data-workshop-recipe="' + workshop.id + '">' + options + '</select>' +
        '<button data-workshop-craft="' + workshop.id + '" ' + dis(!recipe || workshop.progress !== null || !canCraft(recipe)) + '>제작</button>' +
      '</div>' +
      '<label class="toggle-auto">' +
        '<input type="checkbox" data-workshop-auto="' + workshop.id + '"' + (workshop.auto ? ' checked' : '') + ' ' + dis(!recipe) + '>자동 제작' +
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
      if(workshop) workshop.auto = chk.checked;
    };
  });
}

// Full rebuild: only called after structural changes (auto-craft unlock
// toggling, site unlock, prestige reset). Buttons keep their identity between ticks.
function buildRecipes(){
  const wrap = document.getElementById('recipes');
  wrap.innerHTML = '';
  const autoUnlocked = state.characters.length >= BALANCE.worker.MIN_REQUIRED;
  RECIPES.forEach(r=>{
    // Hide recipes whose raw resource inputs aren't unlocked yet, to avoid clutter.
    const needsLockedResource = Object.keys(r.need).some(k=>{
      const res = RESOURCES.find(x=>x.key===k);
      return res && !isUnlocked(k);
    });
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
        ${autoUnlocked ? '자동 제작' : '자동 제작 (일꾼 1명 이상 필요)'}
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
    const btn = document.querySelector('[data-workshop-craft="' + workshop.id + '"]');
    if(btn){
      const recipe = workshopRecipe(workshop.id);
      btn.disabled = !recipe || workshop.progress !== null || !canCraft(recipe);
      btn.textContent = workshop.progress !== null ? '제작 중...' : '제작';
    }
    const chk = document.querySelector('[data-workshop-auto="' + workshop.id + '"]');
    if(chk) chk.disabled = !workshop.recipeKey;
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

// through a named action function (unlockSite/mineResource/upgradeFacility/
// startCraft/pullGacha/upgradeCraftFacility/etc., Task 13's pattern) that
// returns before any DOM call, while buildLines()/buildRecipes()/buildWorkers()/
// updateNumbers()/renderAll() only ever read `state` to rebuild or refresh
// the DOM — they never mutate it. A future Factory UI panel should follow
// the same shape (its own thin onclick -> action function -> re-render
// calls) rather than mixing state writes into a render function. Existing
// UI code/design is unchanged here.
function renderAll(){
  renderCurrencies();
  renderBaseInfo();
  renderSharedStorage();
  buildMines();
  renderWorkshops();
  buildLines();
  buildRecipes();
  buildWorkers();
  renderLastPull();
  updateNumbers();
}

