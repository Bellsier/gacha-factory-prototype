// ---------------------------------------------------------------------------
// Startup sequence: the save (if any) is loaded and applied to `state` BEFORE
// renderAll() and BEFORE the tick/ticket/autosave loops are created. This
// guarantees the very first tick ever operates on the restored state, never
// on freshRunState() defaults.
// ---------------------------------------------------------------------------
let tickTimer, ticketTimer, autoSaveTimer;

// Named (rather than an anonymous startup IIFE) purely so it reads like any
// other function in the file; the startup sequence itself is unchanged:
//   1. load save            5. tickTimer
//   2. apply loaded state   6. ticketTimer
//   3. renderAll()          7. autoSaveTimer
//   4. startup log          8. visibilitychange listener
//                           9. beforeunload listener
// Load must finish before the timers are created, so the very first tick
// ever operates on the restored state, never on freshRunState() defaults —
// that ordering guarantee is unchanged.
function boot(){
  const loaded = loadGame();
  if(loaded.ok){
    state = loaded.run;
    permanent = loaded.permanent;
  } else if(loaded.reason === 'corrupted'){
    log('저장 데이터를 불러오지 못해 새로 시작합니다');
  } else if(loaded.reason === 'future'){
    saveBlocked = true;
    log('더 최신 버전의 저장 데이터가 있어 이 게임에서는 불러올 수 없습니다. 이번 세션은 저장 없이 진행됩니다.');
  }
  // 'none' (no save yet) and 'unavailable' (storage inaccessible) are not
  // announced here — they aren't errors, and 'unavailable' will surface
  // naturally as '저장 안 됨' the moment an actual save attempt is made.

  renderAll();
  log(loaded.ok ? '이전 진행 상황을 불러왔습니다.' : '공방 가동을 시작합니다. 채굴장을 눌러 자원을 모으세요.');

  tickTimer = setInterval(tickLoop, TICK_MS);
  ticketTimer = setInterval(ticketTrickle, BALANCE.gacha.TICKET_TRICKLE_MS);
  autoSaveTimer = setInterval(saveGame, 10000);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden') saveGame();
  });
  window.addEventListener('beforeunload', ()=>{ saveGame(); });
}
boot();
