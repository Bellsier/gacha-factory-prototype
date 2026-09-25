function updateNextHint(){
  const el = document.getElementById('nextHint');
  if(!el) return;
  const ironHas = hasWorkerOn('iron');
  const coalHas = hasWorkerOn('coal');
  if(!permanent.firstGachaGranted){
    el.textContent = `캄굴 탭에서 광석을 캔 뒤, 개발 탭에서 강철을 만들어 파세요. 골드 50이 되면 첫 가챠권을 받습니다. (현재 ${fmt(state.gold)}/${BALANCE.gacha.FIRST_TICKET_GOLD_THRESHOLD}G)`;
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
