// =============================================================================
// Task 104-106: the top-down world (js/topdown/*). jsdom has no 2D canvas, so
// these check everything except the pixels: view math, the tile map against
// the walking rules, the draw list, the sprites as data, the world-first
// screen, proximity interaction, the phone joystick, and that nothing of it
// reaches the save. The pixels themselves are checked in Chromium.
// =============================================================================

// A page opened with a given URL (to test ?view=classic).
function tdDomAt(url, storage) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const win = dom.window;
  Object.defineProperty(win, 'localStorage', { value: storage || makeMemoryStorage(), configurable: true });
  win.eval(moduleSource + ';window.__td = { state: () => state, TD: () => TD };');
  Object.defineProperty(win, 'state', { get: () => win.__td.state(), configurable: true });
  allDoms.push(dom);
  return win;
}
function tdKey(win, target, key) {
  const e = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

// -----------------------------------------------------------------------------
// Task 104: view math, tile map, draw list
// -----------------------------------------------------------------------------
(function test_T104_viewMath() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task104: one world unit is 4 tiles of 16 px (64 px at zoom 1)', win.TOPDOWN.TILE === 16 && win.TOPDOWN.TILES_PER_UNIT === 4 && win.TD_UNIT_PX === 64);
  check('Task104: integer zoom — PC 1280x800 -> 3, phone 390x664 -> 2, 1920x1080 -> 4, tiny -> 1',
    win.topdownZoom(1280, 800) === 3 && win.topdownZoom(390, 664) === 2 && win.topdownZoom(1920, 1080) === 4 && win.topdownZoom(100, 100) === 1 && win.topdownZoom(5000, 5000) === win.TOPDOWN.MAX_ZOOM && win.topdownZoom(0, 0) === 1);
  const r = win.topdownWorldRect();
  check('Task104: the drawn world is the bounds plus a 2-unit forest edge', r.minX === -12 && r.maxX === 12 && r.minY === -12 && r.maxY === 12);
  const mid = win.topdownCamera({ x: 2, y: 0 }, 1280, 800, 3);
  check('Task104: the camera centres on the player away from the edges', mid.x === 2 && mid.y === 0);
  const s = win.topdownScale(3), halfW = 1280 / (2 * s), halfH = 800 / (2 * s);
  const corner = win.topdownCamera({ x: 10, y: 10 }, 1280, 800, 3);
  const corner2 = win.topdownCamera({ x: -10, y: -10 }, 1280, 800, 3);
  check('Task104: at a corner the camera stops so nothing past the drawn world shows',
    Math.abs(corner.x - (12 - halfW)) < 1e-9 && Math.abs(corner.y - (12 - halfH)) < 1e-9 && Math.abs(corner2.x - (-12 + halfW)) < 1e-9 && Math.abs(corner2.y - (-12 + halfH)) < 1e-9);
  const huge = win.topdownCamera({ x: 7, y: -3 }, 8000, 8000, 1);
  check('Task104: a view larger than the world is centred on it', huge.x === 0 && huge.y === 0);
  const sp = win.topdownToScreen(3.5, -1.25, mid, 1280, 800, 3), back = win.topdownToWorld(sp.x, sp.y, mid, 1280, 800, 3);
  check('Task104: world -> screen -> world round trip (whole pixels)', Math.abs(back.x - 3.5) < 1 / s && Math.abs(back.y + 1.25) < 1 / s && sp.x === Math.round(sp.x));
  const pc = win.topdownToScreen(2, 0, mid, 1280, 800, 3);
  check('Task104: the player is drawn at the screen centre', pc.x === 640 && pc.y === 400);
  // smoothing between ticks
  const t = {}, TICK = win.TICK_MS;
  win.topdownTrack(t, 0, 0, 1000);
  const a = win.topdownTrack(t, 0.3, 0, 1000), b = win.topdownTrack(t, 0.3, 0, 1000 + TICK / 2), c = win.topdownTrack(t, 0.3, 0, 1000 + TICK * 2);
  check('Task104: the drawn position glides from the last tick to the new one', a.x === 0 && Math.abs(b.x - 0.15) < 1e-9 && c.x === 0.3);
  check('Task104: walked distance follows the glide', Math.abs(b.walked - 0.15) < 1e-9 && Math.abs(c.walked - 0.3) < 1e-9);
  const j = win.topdownTrack(t, 9, 9, 1000 + TICK * 3);
  check('Task104: a big jump (load) snaps instead of sliding across the map', j.x === 9 && j.y === 9 && Math.abs(j.walked - 0.3) < 1e-9);
  check('Task104: walk frames cycle 0-3 while walking, 0 when standing',
    win.topdownWalkFrame(0, 'walk') === 0 && win.topdownWalkFrame(0.23, 'walk') === 1 && win.topdownWalkFrame(0.9, 'walk') === 0 && win.topdownWalkFrame(0.7, 'walk') === 3 && win.topdownWalkFrame(5, 'idle') === 0);
  check('Task104: nothing of the view is in the game state', !('camera' in win.state.world) && !('zoom' in win.state.world) && Object.keys(win.state.world.player).sort().join() === 'facing,pose,x,y');
})();

(function test_T104_tileMapMatchesWalking() {
  const win = newDom(makeMemoryStorage()).window;
  const T = win.TD_TILE, base = win.state.world.base;
  const walkTypes = [T.GRASS, T.BEYOND, T.TUNNEL, T.PATH];
  [false, true].forEach((open) => {
    const map = win.tdBuildTileMap(open, base);
    let bad = 0, rockWalk = 0, beyondShown = 0;
    for (let j = 0; j < map.rows; j++) for (let i = 0; i < map.cols; i++) {
      const x = map.originX + (i + 0.5) / 4, y = map.originY + (j + 0.5) / 4, type = map.types[j * map.cols + i];
      const walk = win.isWorldPointWalkable(x, y, open);
      if (walk && !walkTypes.includes(type)) bad++;          // walkable ground drawn as rock / forest
      if ((type === T.ROCK || type === T.EDGE) && walk) rockWalk++;
      if (type === T.BEYOND) beyondShown++;
    }
    const tag = open ? 'open' : 'closed';
    check('Task104: tunnel ' + tag + ' — 96 x 96 tiles over the drawn world', map.cols === 96 && map.rows === 96 && map.types.length === 96 * 96 && map.tunnelOpen === open);
    check('Task104: tunnel ' + tag + ' — every walkable spot is drawn as ground (never as rock or forest)', bad === 0);
    check('Task104: tunnel ' + tag + ' — nothing drawn as rock or forest edge can be walked on', rockWalk === 0);
    check('Task104: tunnel ' + tag + ' — the land beyond is drawn (fogged while closed)', beyondShown > 500);
  });
  const t = win.terrainTunnel();
  const closed = win.tdBuildTileMap(false, base), open = win.tdBuildTileMap(true, base);
  const at = (map, x, y) => map.types[Math.floor((y - map.originY) * 4) * map.cols + Math.floor((x - map.originX) * 4)];
  check('Task104: closed tunnel — the recess in front of the gate is floor, behind it is rock', at(closed, t.gateX + 0.2, t.y) === T.TUNNEL && at(closed, t.gateX - 0.5, t.y) === T.ROCK);
  check('Task104: open tunnel — the passage runs through the range', at(open, t.gateX - 0.5, t.y) === T.TUNNEL && at(open, win.terrainTunnelExit().x + 0.1, t.y) === T.TUNNEL);
  check('Task104: a dirt yard around the workshop and a road towards the tunnel', at(closed, base.x, base.y + 0.5) === T.PATH && at(closed, (base.x + t.mouthX) / 2, (base.y + t.y) / 2) === T.PATH);
  const img = win.tdPaintTileMap(closed), img2 = win.tdPaintTileMap(closed), imgOpen = win.tdPaintTileMap(open);
  let opaque = true; for (let k = 3; k < img.data.length; k += 4000) if (img.data[k] !== 255) opaque = false;
  check('Task104: the painted ground is 1536 x 1536 px, fully opaque', img.width === 1536 && img.height === 1536 && img.data.length === 1536 * 1536 * 4 && opaque);
  let same = true; for (let k = 0; k < img.data.length; k += 997) if (img.data[k] !== img2.data[k]) same = false;
  check('Task104: the ground looks the same every time (fixed pattern, nothing random)', same);
  const bright = (im, x, y) => { const o = (Math.round((y - closed.originY) * 64) * im.width + Math.round((x - closed.originX) * 64)) * 4; return im.data[o] + im.data[o + 1] + im.data[o + 2]; };
  let darker = 0; for (let k = 0; k < 20; k++) { const y = -8 + k * 0.8; if (bright(img, -9, y) < bright(imgOpen, -9, y)) darker++; }
  check('Task104: the land beyond is under fog until the tunnel opens', darker >= 18);
})();

(function test_T104_drawList() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const s = win.state;
  win.secureMine('mine_start_iron');
  win.addWorkshop({ x: s.world.base.x + 1, y: s.world.base.y + 1, level: 4 });
  const list = win.tdDrawList({ dir: 'left', frame: 2, x: 3, y: 1 });
  const kinds = (k) => list.filter((it) => it.kind === k);
  check('Task104: draw list — the workshop, its lamp, every mine once, the workshop huts and the player',
    kinds('base').length === 1 && list.some((it) => it.prop === 'lamp') && kinds('ore').length === s.world.mines.length && kinds('workshop').length === 1 && kinds('player').length === 1);
  check('Task104: draw list — mine looks follow discovery and securing', list.find((it) => it.id === 'mine_start_iron').look === 'secured' &&
    list.find((it) => it.id === 'mine_start_coal').look === 'unsecured' && kinds('ore').filter((it) => it.look === 'undiscovered').length === s.world.hiddenMineIds.length && s.world.hiddenMineIds.length > 0);
  check('Task104: draw list — the craft hut look follows its level tier', kinds('workshop')[0].tier === 2);
  check('Task104: draw list — sorted back to front by y', list.every((it, k) => k === 0 || list[k - 1].sortY <= it.sortY));
  check('Task104: draw list — the closed gate is drawn and no land-beyond scenery yet', kinds('gate').length === 1 && !list.some((it) => it.kind === 'prop' && it.prop !== 'lamp'));
  s.world.tunnelUnlocked = true;
  const open = win.tdDrawList(null);
  check('Task104: draw list — once open, the gate is gone and the scenery beyond appears', !open.some((it) => it.kind === 'gate') && open.filter((it) => it.kind === 'prop' && it.prop !== 'lamp').length > 20 && !open.some((it) => it.kind === 'player'));
  let ok = true;
  try { win.tdRender(1000); win.tdRenderMinimap({ x: 0, y: 0 }); } catch (e) { ok = false; }
  check('Task104: without a 2D canvas (jsdom) the renderer draws nothing and does not fail', ok && win.TD.ctx === null && win.TD.running === false);
})();

// -----------------------------------------------------------------------------
// Task 105: the pixel art (as data)
// -----------------------------------------------------------------------------
(function test_T105_sprites() {
  const win = newDom(makeMemoryStorage()).window;
  const inside = (sp) => sp.rects.length > 0 && sp.rects.every(([x, y, w, h]) => x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= sp.w && y + h <= sp.h);
  const key = (sp) => JSON.stringify(sp.rects);
  const dirs = ['down', 'up', 'left', 'right'];
  const all = dirs.map((d) => [0, 1, 2, 3].map((f) => win.tdPlayerSprite(d, f)));
  check('Task105: the player has 4 directions x 4 walk frames, 16 x 22, all inside', all.every((row) => row.every((sp) => sp.w === 16 && sp.h === 22 && inside(sp))));
  check('Task105: walking frames differ from standing (legs and arms move)', dirs.every((d, k) => key(all[k][1]) !== key(all[k][0]) && key(all[k][3]) !== key(all[k][0]) && key(all[k][1]) !== key(all[k][3])));
  check('Task105: the four directions look different', new Set(all.map((row) => key(row[0]))).size === 4);
  const r0 = win.tdPlayerSprite('right', 0), l0 = win.tdPlayerSprite('left', 0);
  check('Task105: facing left is the mirror of facing right', l0.rects.every(([x, y, w, h, c], k) => x === 16 - r0.rects[k][0] - r0.rects[k][2] && y === r0.rects[k][1] && c === r0.rects[k][4]));
  check('Task105: the miner wears a helmet with a lamp facing down and to the side, not from behind',
    key(win.tdPlayerSprite('down', 0)).includes(win.TD_PLAYER_COLORS.lamp) && key(r0).includes(win.TD_PLAYER_COLORS.lamp) && !key(win.tdPlayerSprite('up', 0)).includes(win.TD_PLAYER_COLORS.lamp));
  const resKeys = win.RESOURCES.map((r) => r.key);
  check('Task105: every resource has its own ore colour', resKeys.every((k) => win.TD_RES_COLORS[k]) && new Set(resKeys.map((k) => win.TD_RES_COLORS[k][0])).size === resKeys.length);
  check('Task105: an ore boulder shows its resource colour; an undiscovered one shows none', resKeys.every((k) => key(win.tdOreSprite(k, 'unsecured')).includes(win.TD_RES_COLORS[k][0]) && inside(win.tdOreSprite(k, 'secured'))) &&
    resKeys.every((k) => !key(win.tdOreSprite(null, 'undiscovered')).includes(win.TD_RES_COLORS[k][0])));
  check('Task105: a secured vein carries the teal flag, an unsecured one does not', key(win.tdOreSprite('iron', 'secured')).includes('#3fc9b0') && !key(win.tdOreSprite('iron', 'unsecured')).includes('#3fc9b0'));
  check('Task105: the workshop cabin and the three craft hut tiers', inside(win.tdBaseSprite()) && win.tdBaseSprite().w === 64 && [1, 2, 3].every((t) => inside(win.tdWorkshopSprite(t))) &&
    new Set([1, 2, 3].map((t) => key(win.tdWorkshopSprite(t)))).size === 3);
  const propKinds = new Set();
  ['deepForest', 'rockyGround', 'halfDugMine', 'rareDeep'].forEach((z) => win.WORLD_TERRAIN.BEYOND.PROPS[z].forEach((row) => propKinds.add(row.kind)));
  win.terrainBeyondProps().forEach((pr) => propKinds.add(pr.kind));
  const pebble = key(win.tdPropSprite('no-such-kind'));
  check('Task105: every kind of scenery beyond the mountain has its own sprite', [...propKinds].every((k) => inside(win.tdPropSprite(k)) && key(win.tdPropSprite(k)) !== pebble) && propKinds.size >= 9);
  const tdSrc = fs.readdirSync(path.join(__dirname, '..', 'js', 'topdown')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', 'topdown', f), 'utf8')).join('\n');
  check('Task105: the art is drawn in code — no image files or image URLs in the top-down code', !/\.(png|jpe?g|gif|webp)\b|url\(|new Image\(|https?:\/\//i.test(tdSrc));
  check('Task105: without a canvas, baking a sprite returns nothing and does not fail', win.tdSpriteImage(win.tdPlayerSprite('down', 0)) === null);
})();

// -----------------------------------------------------------------------------
// Task 106: the world-first screen, proximity interaction, phone controls
// -----------------------------------------------------------------------------
(function test_T106_screen() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const doc = win.document, body = doc.body;
  check('Task106: the top-down view is the default — world canvas, HUD, minimap, dock', body.classList.contains('view-topdown') &&
    !!doc.getElementById('tdCanvas') && body.firstElementChild.id === 'tdCanvas' && !!doc.getElementById('tdMinimap') && !!doc.querySelector('.tabbar .td-log-btn'));
  check('Task106: the five tabs stay in the dock with their content (Task 114 adds 마을 as a sixth)', ['mining', 'dev', 'workers', 'research', 'delivery'].every((t) => !!doc.querySelector('.tabbar .tab-btn[data-tab="' + t + '"]')) && doc.querySelectorAll('.tabbar .tab-btn').length === 6 && !!doc.querySelector('.tabbar .tab-btn[data-tab="village"]') && !!doc.querySelector('#tab-research #researchList'));
  check('Task106: no panel is open at the start (the world is the screen)', !body.classList.contains('td-panel-open') && !body.classList.contains('td-log-open'));
  const devBtn = doc.querySelector('.tab-btn[data-tab="dev"]');
  devBtn.click();
  check('Task106: a dock button opens its panel', body.classList.contains('td-panel-open') && devBtn.classList.contains('active') && doc.getElementById('tab-dev').classList.contains('active'));
  devBtn.click();
  check('Task106: pressing the open tab again closes it', !body.classList.contains('td-panel-open'));
  doc.querySelector('.tab-btn[data-tab="research"]').click();
  tdKey(win, doc.body, 'Escape');
  check('Task106: Escape closes a panel', !body.classList.contains('td-panel-open'));
  doc.querySelector('.td-log-btn').click();
  check('Task106: the log opens as its own panel', body.classList.contains('td-log-open') && !body.classList.contains('td-panel-open'));
  doc.getElementById('tdClose').click();
  check('Task106: the close button closes it', !body.classList.contains('td-log-open'));
  doc.querySelector('.tab-btn[data-tab="workers"]').click();
  doc.querySelector('.td-log-btn').click();
  check('Task106: only one panel at a time', body.classList.contains('td-log-open') && !body.classList.contains('td-panel-open'));
  // the classic page is still there with ?view=classic, remembered apart from the save
  const store2 = makeMemoryStorage();
  const classic = tdDomAt('https://example.test/?view=classic', store2);
  check('Task106: ?view=classic keeps the old page (no world canvas, 2.5D stage in place)', !classic.document.body.classList.contains('view-topdown') &&
    !classic.document.getElementById('tdCanvas') && !!classic.document.getElementById('worldStage'));
  check('Task106: the view choice is kept in its own key, not in the game save', store2.getItem('gachaFactoryView') === 'classic' &&
    (classic.saveGame(), !/classic|topdown|view/.test(store2.getItem('gachaFactorySave'))));
  const again = tdDomAt('https://example.test/', store2);
  check('Task106: the remembered choice applies on the next visit; ?view=topdown switches back', !again.document.body.classList.contains('view-topdown') &&
    tdDomAt('https://example.test/?view=topdown', store2).document.body.classList.contains('view-topdown') && store2.getItem('gachaFactoryView') === 'topdown');
})();

(function test_T106_interaction() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document, s = win.state, p = s.world.player;
  const iron = win.mineById('mine_start_iron');
  const stand = (x, y) => { p.x = x; p.y = y; };
  // a spot at least 2 units from every vein and building (the starter veins are random, so search for one)
  let farSpot = null;
  for (let y = -9; y <= 9 && !farSpot; y += 0.5) for (let x = -3; x <= 9 && !farSpot; x += 0.5) {
    const doors = ['appraiser', 'museum'].map((k) => s.village && s.village.sites[k]).filter(Boolean); // Task 114: village doors are targets too
    const clear = s.world.mines.every((m) => Math.hypot(m.x - x, m.y - y) > 2) && Math.hypot(s.world.base.x - x, s.world.base.y - y) > 2 && doors.every((d) => Math.hypot(d.x - x, d.y - y) > 2);
    if (clear && win.playerCanStand(x, y)) farSpot = [x, y];
  }
  stand(farSpot[0], farSpot[1]);
  check('Task106: far from everything there is nothing to act on', win.tdInteractTarget(p.x, p.y) === null);
  // 1.1 from the vein on a side where nothing else to act on is near: the workshop door, another vein or
  // (Task 114) a village door would be the nearer target (the starter veins are random)
  const others = [s.world.base].concat(s.world.mines.filter((m) => m.id !== iron.id), ['appraiser', 'museum'].map((k) => s.village.sites[k]).filter(Boolean));
  const side = [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]].find(([dx, dy]) => win.playerCanStand(iron.x + dx, iron.y + dy) &&
    others.every((o) => Math.hypot(o.x - iron.x - dx, o.y - iron.y - dy) > 1.2));
  stand(iron.x + side[0], iron.y + side[1]);
  check('Task106: within reach (1.1) of an unsecured vein the action is "secure"', win.tdInteractTarget(p.x, p.y).action === 'secure' && win.tdInteractTarget(p.x, p.y).id === iron.id);
  stand(iron.x + 1.3, iron.y);
  const t13 = win.tdInteractTarget(p.x, p.y);
  check('Task106: just out of reach (1.3) it is not offered', !t13 || t13.id !== iron.id);
  stand(iron.x + 0.4, iron.y);
  tdKey(win, doc.body, 'e');
  check('Task106: E secures the vein through the game\'s own secureMine', iron.developmentState === 'secured' && doc.querySelector('[data-secure-mine="' + iron.id + '"]').disabled === true);
  check('Task106: next the action is "mine" with the amount', win.tdInteractTarget(p.x, p.y).action === 'mine' && /\+1/.test(win.tdInteractTarget(p.x, p.y).label));
  const i0 = s.resources.iron;
  tdKey(win, doc.body, 'e'); tdKey(win, doc.body, ' ');
  check('Task106: E and Space mine it (miningPower x multiplier each)', Math.abs(s.resources.iron - i0 - 2 * iron.miningPower * win.mult()) < 1e-9);
  const field = doc.querySelector('[data-craft-target="steel"]');
  const i1 = s.resources.iron;
  tdKey(win, field, 'e');
  const btn = doc.querySelector('.tab-btn');
  tdKey(win, btn, ' ');
  check('Task106: E typed in a field and Space on a button do not act', s.resources.iron === i1);
  doc.querySelector('[data-mine-mine="' + iron.id + '"]').click();
  check('Task106: the remote panel buttons still work (kept by decision)', s.resources.iron > i1);
  // a vein whose site is still locked
  const mana = win.addMine({ id: 'mine_t106_mana', x: s.world.base.x + 4, y: s.world.base.y - 4, resource: 'mana', grade: 2, miningPower: 1, developmentState: 'unsecured' });
  stand(mana.x - 0.5, mana.y);
  const lk = win.tdInteractTarget(p.x, p.y);
  tdKey(win, doc.body, 'e');
  check('Task106: a vein of a locked site says what is needed and stays unsecured', lk.action === 'locked' && /해금 필요/.test(lk.label) && mana.developmentState === 'unsecured');
  // hidden veins are never a target
  const hid = win.addMine({ id: 'mine_t106_hidden', x: s.world.base.x - 2, y: s.world.base.y + 4, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  s.world.hiddenMineIds.push(hid.id);
  check('Task106: an undiscovered vein is not offered (walking near discovers it instead)', win.tdInteractTarget(hid.x + 0.3, hid.y) === null || win.tdInteractTarget(hid.x + 0.3, hid.y).id !== hid.id);
  // the workshop and a craft hut open the craft panel
  stand(s.world.base.x, s.world.base.y + 0.3);
  tdKey(win, doc.body, 'e');
  check('Task106: E at the workshop door opens the craft (개발) panel', doc.body.classList.contains('td-panel-open') && doc.querySelector('.tab-btn.active').dataset.tab === 'dev');
  tdKey(win, doc.body, 'Escape');
  const hut = win.addWorkshop({ x: s.world.base.x + 3, y: s.world.base.y + 3, level: 1 });
  stand(hut.x + 0.3, hut.y);
  check('Task106: a craft hut is a target too', win.tdInteractTarget(p.x, p.y).type === 'workshop' && win.tdInteract(win.tdInteractTarget(p.x, p.y)).open === 'dev');
  // the action button (phone) does the same
  stand(iron.x + 0.4, iron.y);
  win.TD.target = win.tdInteractTarget(p.x, p.y);
  win.tdUpdateActionButton();
  const action = doc.getElementById('tdAction');
  const i2 = s.resources.iron;
  action.click();
  check('Task106: the action button shows the action and does it', action.textContent === '캐기' && !action.classList.contains('is-idle') && s.resources.iron > i2);
  win.TD.target = null; win.tdUpdateActionButton();
  check('Task106: with nothing in reach the button is idle', action.classList.contains('is-idle'));
})();

(function test_T106_joystickAndSave() {
  const storage = makeMemoryStorage(T103_FIXTURE_RAW);
  storage.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const win = newDom(storage).window;
  const s = win.state, p = s.world.player;
  const D = (dx, dy) => win.tdStickDirs(dx, dy, 60).sort().join();
  check('Task106: joystick — inside the dead zone nothing is held', D(5, 5) === '' && D(0, 0) === '');
  check('Task106: joystick — 8 directions', D(50, 0) === 'right' && D(-50, 0) === 'left' && D(0, -50) === 'up' && D(0, 50) === 'down' &&
    D(40, 40) === 'down,right' && D(-40, -40) === 'left,up' && D(40, -40) === 'right,up' && D(-40, 40) === 'down,left');
  check('Task106: joystick — a mostly-sideways push is one direction', D(55, 15) === 'right');
  const x0 = p.x;
  win.tdSetStickDirs(['right']);
  for (let i = 0; i < 4; i++) win.tickPlayer();
  win.tdSetStickDirs([]);
  win.tickPlayer();
  check('Task106: joystick directions walk the player and letting go stops', p.x > x0 && p.pose === 'idle' && win.isWorldPointWalkable(p.x, p.y));
  check('Task106: the stick and the action button exist for touch screens', !!win.document.querySelector('#tdStick .td-knob') && !!win.document.getElementById('tdAction'));
  // nothing of the new screen reaches the save
  win.document.querySelector('.tab-btn[data-tab="delivery"]').click();
  win.tdInteractNow();
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task106: after using the new screen the save has exactly the fixture\'s structure (saveVersion 1)', sv.saveVersion === 1 && JSON.stringify(t103Shape(sv)) === JSON.stringify(t103ShapeNow()));
  check('Task106: no camera, zoom, panel or joystick state in the save', !/camera|zoom|panel|stick|tdView|topdown/i.test(JSON.stringify(sv)));
})();

// -----------------------------------------------------------------------------
// Task 107: veins, the workshop and the craft huts block the player's feet
// -----------------------------------------------------------------------------
function t107Hold(win, dirs, ticks) {
  ['up', 'down', 'left', 'right'].forEach((d) => win.setPlayerHeld(d, dirs.includes(d)));
  for (let i = 0; i < ticks; i++) win.tickPlayer();
  ['up', 'down', 'left', 'right'].forEach((d) => win.setPlayerHeld(d, false));
  win.tickPlayer();
}
function t107Overlapping(win, x, y) {
  return win.worldObstacles(x, y, 1).filter((o) => win.playerFootOverlaps(o, x, y));
}

(function test_T107_obstacles() {
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, p = s.world.player, b = s.world.base;
  const hut = win.addWorkshop({ x: b.x + 3, y: b.y + 2, level: 1 });
  const obs = win.worldObstacles();
  check('Task107: every vein, the workshop and every craft hut is an obstacle', obs.filter((o) => o.kind === 'mine').length === s.world.mines.length &&
    obs.filter((o) => o.kind === 'base').length === 1 && obs.filter((o) => o.kind === 'workshop').length === 1);
  const B = win.WORLD_OBSTACLE_BOXES, F = win.PLAYER_FOOT;
  check('Task107: boxes are the small base of each picture (vein under 0.3 wide, cabin walls 0.78, hut 0.5) and the feet 0.18 x 0.12',
    B.mine.maxX - B.mine.minX <= 0.3 && Math.abs(B.base.maxX - B.base.minX - 0.78) < 1e-9 && Math.abs(B.workshop.maxX - B.workshop.minX - 0.5) < 1e-9 && F.HALF_W === 0.09 && F.HALF_H === 0.06);
  check('Task107: the door steps (workshop and hut points) stay free; a vein centre does not', win.playerCanStand(b.x, b.y) && win.playerCanStand(hut.x, hut.y) &&
    !win.playerCanStand(s.world.mines[0].x, s.world.mines[0].y));
  // walking north from the door into the cabin stops at the wall
  s.world.mines = s.world.mines.filter((m) => Math.hypot(m.x - b.x, m.y - b.y) > 1.6);
  p.x = b.x; p.y = b.y; t107Hold(win, ['up'], 10);
  check('Task107: walking into the cabin from the door stops at its wall', Math.abs(p.y - (b.y + B.base.maxY + F.HALF_H)) < 1e-3 && p.x === b.x);
  const order = win.tdDrawList({ dir: 'up', frame: 0, x: p.x, y: p.y }).map((it) => it.kind);
  check('Task107: standing against the cabin wall the player is drawn in front of the cabin (sorted by the footprint front)', order.indexOf('player') > order.indexOf('base'));
  // from the east side: flush against the wall, then sliding along it
  p.x = b.x + 1.2; p.y = b.y - 0.25; t107Hold(win, ['left'], 10);
  const flush = b.x + B.base.maxX + F.HALF_W;
  check('Task107: walking into the cabin wall from the east stops flush against it', Math.abs(p.x - flush) < 1e-3);
  const y0 = p.y; t107Hold(win, ['left', 'up'], 2);
  check('Task107: pushing diagonally along the wall slides along it', Math.abs(p.x - flush) < 1e-3 && p.y < y0);
  // the craft hut stops the player at its wall too
  p.x = hut.x; p.y = hut.y; t107Hold(win, ['up'], 10);
  check('Task107: a craft hut stops the player at its wall', Math.abs(p.y - (hut.y + B.workshop.maxY + F.HALF_H)) < 1e-3);
  // veins: head-on the player glides round a small boulder; slightly off-centre it slips past
  const vein = win.addMine({ id: 'mine_t107', x: b.x + 4, y: b.y - 4, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  p.x = vein.x + 1.5; p.y = vein.y; let touched = false;
  win.setPlayerHeld('left', true);
  for (let i = 0; i < 12; i++) { win.tickPlayer(); if (t107Overlapping(win, p.x, p.y).length) touched = true; }
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task107: walking straight at a vein, the player glides round it (side step under 0.2) and never walks through it', p.x < vein.x - 0.5 && Math.abs(p.y - vein.y) <= 0.2 && !touched);
  p.x = vein.x + 1.5; p.y = vein.y + 0.1; t107Hold(win, ['left'], 12);
  check('Task107: brushing a vein\'s corner slips past it', p.x < vein.x - 0.5 && Math.abs(p.y - vein.y) <= 0.25);
  // but the cabin is too wide to slip round
  p.x = b.x + 1.2; p.y = b.y - 0.27; t107Hold(win, ['left'], 10);
  check('Task107: the cabin is too wide to glide round — the player stops', Math.abs(p.x - flush) < 1e-3);
  // the mountain still stops the player (Task 66)
  p.x = 0; p.y = -5; t107Hold(win, ['left'], 40);
  check('Task107: the mountain face still stops the player flush', Math.abs(p.x - (win.terrainFaceX(-5) + win.WORLD_TERRAIN.PLAYER_MARGIN)) < 1e-3);
  check('Task107: walking speed is unchanged (3 units a second)', win.BALANCE.world.PLAYER_SPEED === 3);
})();

(function test_T107_neverInsideAndEscape() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const s = win.state, p = s.world.player;
  s.research.workshopBuild = true; s.research.workshopExpansion = true; s.gold = 1e9;
  Object.keys(s.products).forEach((k) => { s.products[k] = 1e5; });
  for (let i = 0; i < 8; i++) win.buildWorkshop();
  const rnd = t103Random(107);
  const dirsets = [['up'], ['down'], ['left'], ['right'], ['up', 'left'], ['up', 'right'], ['down', 'left'], ['down', 'right']];
  let inside = 0, rock = 0;
  for (let i = 0; i < 6000; i++) {
    if (i % 10 === 0) ['up', 'down', 'left', 'right'].forEach((d) => win.setPlayerHeld(d, false)), dirsets[Math.floor(rnd() * 8)].forEach((d) => win.setPlayerHeld(d, true));
    win.tickPlayer();
    if (t107Overlapping(win, p.x, p.y).length) inside++;
    if (!win.isWorldPointWalkable(p.x, p.y)) rock++;
  }
  win.clearPlayerHeld();
  check('Task107: 6000 random steps among 8 huts and the veins never end inside an obstacle or the rock', s.world.workshops.length === 8 && inside === 0 && rock === 0);
  // an older save can put the player inside a vein or a hut: the player walks out
  const m = s.world.mines.find((x) => x.id === 'mine_start_iron');
  ['left', 'right', 'up', 'down'].forEach((d) => {
    p.x = m.x; p.y = m.y;
    t107Hold(win, [d], 4);
    check('Task107: standing inside a vein (older save) the player can walk out ' + d, t107Overlapping(win, p.x, p.y).length === 0 && Math.hypot(p.x - m.x, p.y - m.y) > 0.3);
  });
  p.x = m.x + 1; p.y = m.y; t107Hold(win, ['left'], 10);
  check('Task107: once out, walking back does not enter it again', t107Overlapping(win, p.x, p.y).length === 0);
  // the fixture save: the saved position is kept as it is on load, and play goes on
  const storage = makeMemoryStorage();
  const sv = JSON.parse(T103_FIXTURE_RAW);
  const fm = sv.run.world.mines.find((x) => x.developmentState === 'secured');
  sv.run.world.player = { x: fm.x, y: fm.y, facing: 'up', pose: 'idle' };
  storage.setItem('gachaFactorySave', JSON.stringify(sv));
  const w2 = newDom(storage).window;
  const p2 = w2.state.world.player;
  check('Task107: a saved position on top of a vein is kept exactly on load (nothing is moved or rewritten)', p2.x === fm.x && p2.y === fm.y);
  t107Hold(w2, ['down'], 5);
  check('Task107: ...and the player simply walks off it', !w2.worldObstacles(p2.x, p2.y, 1).some((o) => w2.playerFootOverlaps(o, p2.x, p2.y)));
  w2.saveGame();
  check('Task107: the save keeps its structure (saveVersion 1, no obstacle data)', JSON.stringify(t103Shape(JSON.parse(storage.getItem('gachaFactorySave')))) === JSON.stringify(t103ShapeNow()));
})();

(function test_T107_everythingReachable() {
  // Flood fill from the workshop door over every spot the player can stand on.
  // Every standable spot must be connected and every vein reachable to within
  // acting distance — in many generated worlds with 8 huts, the land beyond
  // opened and the geological survey done, and in the fixture world.
  const check1 = (win) => {
    const b = win.BALANCE.world, st = 0.1, n = Math.round((b.BOUNDS_MAX_X - b.BOUNDS_MIN_X) / st) + 1;
    const P = (i) => b.BOUNDS_MIN_X + i * st, idx = (i, j) => j * n + i;
    const can = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) can[idx(i, j)] = win.playerCanStand(P(i), P(j)) ? 1 : 0;
    const base = win.state.world.base, seen = new Uint8Array(n * n);
    const si = Math.round((base.x - b.BOUNDS_MIN_X) / st), sj = Math.round((base.y - b.BOUNDS_MIN_Y) / st), q = [[si, sj]];
    seen[idx(si, sj)] = 1;
    while (q.length) { const [i, j] = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= n || c >= n) return; const k = idx(a, c); if (seen[k] || !can[k]) return; seen[k] = 1; q.push([a, c]); }); }
    let pockets = 0; for (let k = 0; k < n * n; k++) if (can[k] && !seen[k]) pockets++;
    const unreachable = win.state.world.mines.filter((m) => {
      for (let j = Math.max(0, Math.round((m.y - 1 - b.BOUNDS_MIN_Y) / st)); j <= Math.min(n - 1, Math.round((m.y + 1 - b.BOUNDS_MIN_Y) / st)); j++)
        for (let i = Math.max(0, Math.round((m.x - 1 - b.BOUNDS_MIN_X) / st)); i <= Math.min(n - 1, Math.round((m.x + 1 - b.BOUNDS_MIN_X) / st)); i++)
          if (seen[idx(i, j)] && Math.hypot(P(i) - m.x, P(j) - m.y) <= win.TOPDOWN.INTERACT_RANGE - 0.15) return false;
      return true;
    });
    return { pockets, unreachable: unreachable.length, mines: win.state.world.mines.length };
  };
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  let bad = 0, worlds = 0, mines = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const rnd = t103Random(seed * 7919);
    const fresh = win.freshRunState(), s = win.state;
    Object.keys(fresh).forEach((k) => { s[k] = fresh[k]; }); // a new game in the same window
    s.world.hiddenMineIds = [];
    s.world.mines = win.generateInitialWorldMines(s.world.base, { random: rnd });
    ['manaVein', 'ruins', 'spaceStation'].forEach((k) => { s.unlockedSites[k] = true; win.seedWorldMinesForSite(k); });
    s.research.workshopBuild = true; s.research.workshopExpansion = true; s.gold = 1e12;
    Object.keys(s.products).forEach((k) => { s.products[k] = 1e6; });
    for (let i = 0; i < 8; i++) win.buildWorkshop();
    win.unlockTunnel({ random: rnd }); win.surveyMines({ random: rnd });
    const r = check1(win);
    worlds++; mines += r.mines;
    if (r.pockets || r.unreachable) bad++;
  }
  check('Task107: in 25 generated worlds (8 huts, tunnel open, survey) every standable spot is connected and every vein can be reached', bad === 0 && worlds === 25 && mines > 25 * 25);
  const fx = newDom((() => { const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW); return st; })()).window;
  const rf = check1(fx);
  check('Task107: the fixture save\'s world is fully reachable too', rf.pockets === 0 && rf.unreachable === 0 && rf.mines === 26);
})();

// -----------------------------------------------------------------------------
// Task 108: light and atmosphere (drawing only)
// -----------------------------------------------------------------------------
(function test_T108_light() {
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, L = win.TD_LIGHT;
  // the slow day-to-dusk cycle stays gentle and smooth
  let lo = 1, hi = 0, maxStep = 0, prev = win.tdAmbientDarkness(0);
  for (let t = 0; t <= 2 * L.CYCLE_MS; t += 1000) { const d = win.tdAmbientDarkness(t); lo = Math.min(lo, d); hi = Math.max(hi, d); maxStep = Math.max(maxStep, Math.abs(d - prev)); prev = d; }
  check('Task108: the dusk tint stays between 0.10 and 0.34 (never too dark)', lo >= 0.1 - 1e-9 && hi <= 0.34 + 1e-9 && L.MAX_DARK <= 0.35);
  check('Task108: it changes slowly and smoothly over an 8-minute cycle', hi - lo > 0.2 && maxStep < 0.002 && L.CYCLE_MS === 480000);
  // the light list
  const hid = s.world.mines.find((m) => s.world.hiddenMineIds.includes(m.id)) || win.addMine({ id: 'mine_t108_hidden', x: 6, y: 6, resource: 'mana', grade: 2, miningPower: 1, developmentState: 'unsecured' });
  if (!s.world.hiddenMineIds.includes(hid.id)) s.world.hiddenMineIds.push(hid.id);
  win.secureMine('mine_start_iron');
  win.addWorkshop({ x: s.world.base.x + 2, y: s.world.base.y + 2, level: 1 });
  const lights = win.tdLightList({ x: 1, y: 1, dir: 'left' }, 5000, [{ kind: 'extra', x: 0, y: 0, r: 0.5, rgb: [1, 2, 3], strength: 0.3 }]);
  const of = (k) => lights.filter((l) => l.kind === k);
  check('Task108: the helmet lamp is a cone pointing where the player faces, plus a soft aura', of('headlamp').length === 1 && Math.abs(of('headlamp')[0].cone.angle - Math.PI) < 1e-9 && of('aura').length === 1);
  check('Task108: the lamp turns with the player', ['right', 'down', 'up'].every((d, i) => Math.abs(win.tdLightList({ x: 0, y: 0, dir: d }, 0)[0].cone.angle - [0, Math.PI / 2, -Math.PI / 2][i]) < 1e-9));
  check('Task108: the workshop lamp, its two windows and each hut\'s forge give light', of('lamp').length === 1 && of('window').length === 2 && of('forge').length === s.world.workshops.length);
  const discovered = s.world.mines.filter((m) => win.isMineDiscovered(m));
  check('Task108: every discovered vein glows softly in its ore colour, a secured one more', of('vein').length === discovered.length &&
    of('vein').every((l) => l.strength <= 0.5) && lights.find((l) => l.kind === 'vein' && Math.abs(l.x - win.mineById('mine_start_iron').x) < 1e-9).strength === 0.5);
  check('Task108: a hidden vein never glows (light must not give it away)', !of('vein').some((l) => Math.abs(l.x - hid.x) < 1e-9 && Math.abs(l.y - (hid.y - 0.05)) < 1e-9));
  check('Task108: extra lights (the workers\') are added', of('extra').length === 1);
  check('Task108: lights flicker gently but stay within 12%', [0, 100, 777, 5000].every((t) => { const f = win.tdFlicker(t, 1); return f >= 0.76 && f <= 1; }));
  // quality steps by frame time
  check('Task108: at 60 fps the effects stay full; slower frames step down; fast frames step back up',
    win.tdQualityFor(16.7, 0) === 0 && win.tdQualityFor(26, 0) === 1 && win.tdQualityFor(40, 0) === 2 && win.tdQualityFor(20, 1) === 1 &&
    win.tdQualityFor(17, 2) === 1 && win.tdQualityFor(17, 1) === 0);
  check('Task108: touch screens (phones) start one step lower, others at full', win.TD.quality === (win.TD.touch ? 1 : 0));
  // clouds, fireflies, sway
  const c0 = win.tdCloudShadows(0), c1 = win.tdCloudShadows(10000);
  check('Task108: three cloud shadows drift slowly east', c0.length === 3 && c1.every((c, i) => c.x !== c0[i].x) && c1.every((c, i) => Math.abs(c.x - c0[i].x) < 3 || c.x < c0[i].x));
  check('Task108: no fireflies in the brighter part of the cycle, some at dusk', win.tdFireflies(0, 0.12).length === 0 && win.tdFireflies(0, 0.3).length === 6);
  s.world.tunnelUnlocked = true;
  check('Task108: more fireflies over the land beyond once the tunnel is open', win.tdFireflies(0, 0.3).length === 12);
  s.world.tunnelUnlocked = false;
  const sw = [0, 400, 1300, 2600].map((t) => win.tdSway(t, -7, 2, 'bigTree')), sg = [0, 400, 1300].map((t) => win.tdSway(t, 3, 3, 'tuft'));
  check('Task108: trees and grass sway a little (tree lean under 0.03, grass under 0.1) and keep moving', sw.every((k) => Math.abs(k) < 0.03) && sg.every((k) => Math.abs(k) < 0.1) && new Set(sw.map((k) => k.toFixed(5))).size === 4);
  // swaying tufts on the open land
  const tufts = win.tdOpenLandTufts();
  check('Task108: grass tufts dot the open land, always the same, clear of veins, huts and the workshop yard', tufts.length > 30 &&
    JSON.stringify(win.tdOpenLandTufts()) === JSON.stringify(tufts) && tufts.every((t) => win.tdTileAt(t.x, t.y, false, s.world.base) === win.TD_TILE.GRASS &&
      !s.world.mines.some((m) => Math.hypot(m.x - t.x, m.y - t.y) < 0.6) && Math.hypot(t.x - s.world.base.x, t.y - s.world.base.y) >= 1.5));
  check('Task108: the tufts are drawn (as decoration, not scenery of the land beyond)', win.tdDrawList(null).filter((it) => it.kind === 'decor').length === tufts.length);
  // drawing only: the game is untouched
  const before = JSON.stringify(win.state), rate = win.autoRate('iron');
  win.tdLightList({ x: 0, y: 0, dir: 'down' }, 123); win.tdFireflies(123, 0.3); win.tdCloudShadows(123);
  let ok = true; try { win.tdRender(1000); } catch (e) { ok = false; }
  check('Task108: light and atmosphere change nothing in the game and draw nothing without a canvas', JSON.stringify(win.state) === before && win.autoRate('iron') === rate && ok);
  win.saveGame();
  check('Task108: nothing about light reaches the save', !/darkness|light|cloud|firefl|sway|quality/i.test(win.localStorage.getItem('gachaFactorySave')));
})();

// -----------------------------------------------------------------------------
// Task 109: the workers shown in the world (drawing only)
// -----------------------------------------------------------------------------
function t109AddWorker(win, rarity, resource) {
  const r = win.RARITY.find((x) => x.key === rarity);
  const c = { id: win.makeWorkerId(new Set(win.state.characters.map((x) => x.id))), rarity, resource, mining: r.mining, carry: r.carry, move: r.move, miningLvl: 0, carryLvl: 0, moveLvl: 0 };
  win.state.characters.push(c);
  return c;
}

(function test_T109_workers() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state;
  win.secureMine('mine_start_iron'); win.secureMine('mine_start_coal');
  ['common', 'rare', 'epic', 'legend', 'common', 'rare'].forEach((r, i) => t109AddWorker(win, r, i % 2 ? 'coal' : 'iron'));
  s.unlockedSites.manaVein = true; t109AddWorker(win, 'epic', 'mana'); // no mana vein found yet
  const rates = win.RESOURCES.map((r) => win.autoRate(r.key)), stateBefore = JSON.stringify(s);
  const pl = win.tdWorkerPlacements();
  check('Task109: one figure per hired worker, same ids', pl.length === s.characters.length && pl.every((p, i) => s.characters.some((c) => c.id === p.id)) && new Set(pl.map((p) => p.id)).size === pl.length);
  check('Task109: every worker stands on free ground (not in rock, a vein or a building)', pl.every((p) => win.playerCanStand(p.x, p.y)));
  check('Task109: workers stand apart (at least 0.34)', pl.every((a, i) => pl.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) >= 0.34 - 1e-9)));
  const atVein = pl.filter((p) => p.mineId);
  check('Task109: a worker works at a vein of its own resource, close by, facing it', atVein.length === 6 && atVein.every((p) => {
    const m = win.mineById(p.mineId); return m.resource === p.resource && Math.hypot(m.x - p.x, m.y - p.y) <= 1 && (p.dir === (p.x > m.x ? 'left' : 'right'));
  }));
  check('Task109: secured veins are used first', atVein.every((p) => win.mineById(p.mineId).developmentState === 'secured'));
  const waiting = pl.find((p) => p.resource === 'mana');
  check('Task109: a worker with no vein of its resource waits in the workshop yard', waiting && waiting.mineId === null && Math.hypot(waiting.x - s.world.base.x, waiting.y - s.world.base.y) <= 1.6);
  check('Task109: the same state gives the same places (no randomness, cached)', JSON.stringify(win.tdWorkerPlacements()) === JSON.stringify(pl) && win.tdComputeWorkerPlacements().length === pl.length &&
    JSON.stringify(win.tdComputeWorkerPlacements().map((p) => [p.id, p.x, p.y])) === JSON.stringify(pl.map((p) => [p.id, p.x, p.y])));
  // looks
  const looks = s.characters.map((c) => win.tdWorkerLook(c));
  check('Task109: the shirt shows the rarity; helmet, hair and skin vary by worker; legendary has a gold pickaxe',
    s.characters.every((c, i) => looks[i].shirt === win.TD_WORKER.SHIRT[c.rarity]) && new Set(looks.map((l) => l.shirt)).size === 4 &&
    looks.every((l, i) => l.gold === (s.characters[i].rarity === 'legend')) && new Set(looks.map((l) => l.helmet + l.hair + l.skin)).size >= 3);
  // sprites and animation
  const look = looks[0];
  const frames = [0, 1, 2, 3].map((f) => win.tdWorkerSprite('right', f, look));
  const inside = (sp) => sp.rects.length > 0 && sp.rects.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= sp.w && y + h <= sp.h);
  check('Task109: the pickaxe swing has 4 different frames inside a 20 x 24 sprite', frames.every((f) => f.w === 20 && f.h === 24 && inside(f)) && new Set(frames.map((f) => JSON.stringify(f.rects))).size === 4);
  const left = win.tdWorkerSprite('left', 1, look), right = frames[1];
  check('Task109: facing left is the mirror of facing right', left.rects.every(([x, y, w, h, c], k) => x === 20 - right.rects[k][0] - right.rects[k][2] && y === right.rects[k][1] && c === right.rects[k][4]));
  check('Task109: a gold pickaxe for legendary workers', JSON.stringify(win.tdWorkerSprite('right', 1, looks[3]).rects).includes('#e8c050') && !JSON.stringify(frames[1].rects).includes('#e8c050'));
  const p0 = atVein[0], seq = [];
  for (let t = 0; t < p0.cycleMs * 2; t += p0.cycleMs / 8) seq.push(win.tdWorkerFrame(p0, t));
  check('Task109: a working worker cycles raise, overhead, strike, recover', [0, 1, 2, 3].every((f) => seq.includes(f)) && seq.every((f, i) => i === 0 || f === seq[i - 1] || f === (seq[i - 1] + 1) % 4));
  check('Task109: workers swing at their own pace (rarer is a little faster, phases differ)', new Set(atVein.map((p) => p.phase)).size === atVein.length &&
    pl.find((p) => s.characters.find((c) => c.id === p.id).rarity === 'legend').cycleMs < pl.find((p) => s.characters.find((c) => c.id === p.id).rarity === 'common').cycleMs);
  check('Task109: a waiting worker stands still, resting on its pickaxe', [0, 300, 900].every((t) => win.tdWorkerFrame(waiting, t) === 2));
  check('Task109: each worker has a small helmet lamp', win.tdWorkerLights().length === pl.length && win.tdWorkerLights().every((l) => l.kind === 'worker' && l.strength < 0.5));
  check('Task109: workers are in the draw list, sorted with everything else', win.tdDrawList(null).filter((it) => it.kind === 'worker').length === pl.length);
  // the game is untouched
  check('Task109: worker output (autoRate) and the game state are exactly as before', JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key))) === JSON.stringify(rates) && JSON.stringify(s) === stateBefore);
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task109: nothing about where workers stand or how they move is saved', sv.saveVersion === 1 &&
    sv.run.characters.every((c) => Object.keys(c).sort().join() === 'carry,carryLvl,id,mining,miningLvl,move,moveLvl,rarity,resource'));
  // walking around the workers: they never block the player (and the player's checks still hold)
  check('Task109: workers do not block the player (only veins and buildings do)', !win.worldObstacles().some((o) => o.kind === 'worker'));
})();

(function test_T109_manyWorkers() {
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state;
  s.world.base.level = 4; // room for 20 workers
  win.secureMine('mine_start_iron'); win.secureMine('mine_start_coal');
  for (let i = 0; i < 20; i++) t109AddWorker(win, ['common', 'rare', 'epic', 'legend'][i % 4], i % 2 ? 'coal' : 'iron');
  const pl = win.tdWorkerPlacements();
  check('Task109: 20 workers on two veins all get a free spot apart from each other', pl.length === 20 && pl.every((p) => win.playerCanStand(p.x, p.y)) &&
    pl.every((a, i) => pl.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) >= 0.34 - 1e-9)));
  check('Task109: as many as fit stand by their vein, the rest wait in the yard', pl.filter((p) => p.mineId).length >= 16 && pl.filter((p) => !p.mineId).every((p) => Math.hypot(p.x - s.world.base.x, p.y - s.world.base.y) <= 1.6));
  // the fixture save: its five workers appear by their veins
  const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const fx = newDom(st).window, fpl = fx.tdWorkerPlacements();
  check('Task109: the fixture save shows its five workers, each on free ground', fpl.length === 5 && fpl.every((p) => fx.playerCanStand(p.x, p.y)));
})();

// -----------------------------------------------------------------------------
// Task 110: the workers walk (renderer-only simulation, nothing saved)
// -----------------------------------------------------------------------------
// Runs the walk for `ms` in 16 ms frames; returns what was seen on the way.
function t110Run(win, ms, each) {
  const seen = { inside: 0, inRock: 0, maxGhosts: 0 };
  for (let t = 0; t < ms; t += 16) {
    win.tdWorkerSimStep(16, t);
    Object.values(win.TD.workerSim.byId).forEach((s) => {
      if (s.hidden) return;
      if (s.ghostMs <= 0 && s.mode === 'walk' && t110Overlapping(win, s)) seen.inside++;
      if (!win.isWorldPointWalkable(s.x, s.y)) seen.inRock++;
      seen.maxGhosts = Math.max(seen.maxGhosts, s.ghosts);
    });
    if (each) each(t);
  }
  return seen;
}
function t110Overlapping(win, s) { return win.worldObstacles(s.x, s.y, 1).some((o) => win.playerFootOverlaps(o, s.x, s.y)); }
function t110Arrived(win) {
  const pl = win.tdWorkerPlacements(), sim = win.TD.workerSim.byId;
  return pl.every((p) => sim[p.id] && sim[p.id].mode === (p.mineId ? 'work' : 'wait') && sim[p.id].x === p.x && sim[p.id].y === p.y);
}

(function test_T110_routes() {
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, b = s.world.base, t = win.terrainTunnel(), e = win.terrainTunnelExit();
  const r1 = win.tdWorkerRoute(b.x, b.y, b.x + 3, b.y - 2, 0);
  check('Task110: on the same side of the mountain a worker walks straight to its spot', r1.length === 1 && r1[0].x === b.x + 3 && r1[0].y === b.y - 2);
  check('Task110: with the tunnel closed nothing is routed through it', win.tdWorkerRoute(b.x, b.y, -8, 3, 0).length === 1);
  s.world.tunnelUnlocked = true;
  const r2 = win.tdWorkerRoute(b.x, b.y, -8, 3, 0.2), r3 = win.tdWorkerRoute(-8, 3, b.x, b.y, -0.2);
  check('Task110: to a vein beyond the mountain: the tunnel mouth, its far exit, then the spot', r2.length === 3 && r2[0].x > t.mouthX && r2[1].x < e.x && Math.abs(r2[0].y - (t.y + 0.2)) < 1e-9 && r2[2].x === -8 && r2[2].y === 3);
  check('Task110: and back the other way (exit, mouth, spot), each worker on its own lane', r3.length === 3 && r3[0].x < e.x && r3[1].x > t.mouthX && Math.abs(r3[0].y - (t.y - 0.2)) < 1e-9);
  check('Task110: the tunnel waypoints are open ground', [r2[0], r2[1]].every((p) => win.playerCanStand(p.x, p.y)));
  check('Task110: a worker already inside the tunnel skips the mouth', win.tdWorkerRoute((t.mouthX + e.x) / 2, t.y, -8, 3, 0).length === 2);
  check('Task110: lanes stay well inside the tunnel', win.TD_WORKER.LANE < win.WORLD_TERRAIN.TUNNEL.HALF_WIDTH - 0.3);
})();

(function test_T110_walk() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, b = s.world.base;
  win.secureMine('mine_start_iron'); win.secureMine('mine_start_coal');
  ['common', 'rare', 'epic', 'legend', 'common'].forEach((r, i) => t109AddWorker(win, r, i % 2 ? 'coal' : 'iron'));
  s.unlockedSites.manaVein = true; t109AddWorker(win, 'rare', 'mana'); // no mana vein: waits in the yard
  const rates = JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key))), stateBefore = JSON.stringify(s);
  win.tdWorkerSimReset();
  win.tdWorkerSimStep(16, 0);
  const sims = Object.values(win.TD.workerSim.byId);
  check('Task110: the workers come out of the workshop door', sims.length === 6 && sims.every((x) => Math.abs(x.x - b.x) <= 0.1 + (x.hidden ? 0 : 0.03) && Math.abs(x.y - (b.y + 0.08)) <= (x.hidden ? 1e-9 : 0.03) && win.playerCanStand(x.x, x.y)));
  check('Task110: ...one after another (the rest are still inside)', sims.filter((x) => !x.hidden).length === 1 && win.tdDrawList(null).filter((it) => it.kind === 'worker').length === 1);
  let walkingSeen = false, rateSame = true;
  const seen = t110Run(win, 2000, () => {
    if (win.tdWorkerStates().some((p) => p.mode === 'walk' && !p.hidden)) walkingSeen = true;
    if (JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key))) !== rates) rateSame = false;
  });
  check('Task110: they walk (drawn walking, with a walk frame)', walkingSeen && win.tdDrawList(null).some((it) => it.kind === 'worker' && it.mode === 'walk' && it.walkFrame >= 0 && it.walkFrame < 4));
  const seen2 = t110Run(win, 14000);
  check('Task110: every worker reaches its spot and works there (or waits in the yard)', t110Arrived(win));
  check('Task110: on the way nobody walked through a vein or a building, or into rock', seen.inside + seen2.inside === 0 && seen.inRock + seen2.inRock === 0);
  check('Task110: nobody needed to be set down (no stuck worker)', Object.values(win.TD.workerSim.byId).every((x) => x.snaps === 0));
  const mana = win.tdWorkerStates().find((p) => p.resource === 'mana');
  check('Task110: the worker without a vein waits in the yard, resting', mana.mode === 'wait' && mana.mineId === null && Math.hypot(mana.x - b.x, mana.y - b.y) <= 1.6);
  check('Task110: output (autoRate) never changed while they walked', rateSame && JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key))) === rates);
  check('Task110: the walk changes nothing in the game state', JSON.stringify(s) === stateBefore);
  // a new job: the worker walks to the new vein
  const iron = s.characters.find((c) => c.resource === 'iron');
  iron.resource = 'coal';
  win.tdWorkerSimStep(16, 20000);
  const moving = win.TD.workerSim.byId[iron.id];
  check('Task110: given a new vein, a worker sets off for it', moving.mode === 'walk');
  t110Run(win, 12000);
  const newSpot = win.tdWorkerPlacements().find((p) => p.id === iron.id);
  check('Task110: ...and works there once arrived', t110Arrived(win) && win.mineById(newSpot.mineId).resource === 'coal');
  // the vein goes: back to the yard
  s.characters.filter((c) => c.resource === 'coal').forEach((c) => { c.resource = 'mana'; });
  t110Run(win, 14000);
  check('Task110: with no valid vein left, they walk back to the yard and wait', t110Arrived(win) && win.tdWorkerStates().every((p) => p.resource !== 'mana' || (p.mode === 'wait' && Math.hypot(p.x - b.x, p.y - b.y) <= 1.6)));
  // a worker let go disappears from the walk
  const gone = s.characters.pop();
  win.tdWorkerSimStep(16, 50000);
  check('Task110: a worker who leaves is gone from the world too', !win.TD.workerSim.byId[gone.id] && win.tdWorkerStates().length === s.characters.length);
  // facing: no flickering while walking up or down
  const st = { id: 'wk_t110', x: b.x + 3, y: b.y - 3, dir: 'left', route: [{ x: b.x + 3.05, y: b.y + 1 }], walked: 0, best: Infinity, stuckMs: 0, detours: 0, ghostMs: 0, ghosts: 0, snaps: 0 };
  win.tdWorkerWalk(st, 500);
  check('Task110: walking (almost) straight down a worker keeps facing the same way', st.dir === 'left');
  // the walk sprite
  const look = win.tdWorkerLook(s.characters[0]);
  const frames = [0, 1, 2, 3].map((f) => win.tdWorkerWalkSprite('right', f, look));
  const inside = (sp) => sp.rects.length > 0 && sp.rects.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= sp.w && y + h <= sp.h);
  check('Task110: the walk has 4 frames (legs and a little bob) inside the 20 x 24 sprite', frames.every((f) => f.w === 20 && f.h === 24 && inside(f)) && new Set(frames.map((f) => JSON.stringify(f.rects))).size === 4);
  const left = win.tdWorkerWalkSprite('left', 2, look);
  check('Task110: walking left is the mirror of walking right', left.rects.every(([x, y, w, h, c], k) => x === 20 - frames[2].rects[k][0] - frames[2].rects[k][2] && y === frames[2].rects[k][1] && c === frames[2].rects[k][4]));
  const lamps = win.tdWorkerLights(), shown = win.tdWorkerStates().filter((p) => !p.hidden);
  check('Task110: the helmet lamps follow the workers', lamps.length === shown.length && lamps.every((l, i) => Math.abs(l.x - shown[i].x) < 1e-9 && Math.abs(l.y + 0.3 - shown[i].y) < 1e-9));
  win.saveGame();
  const raw = storage.getItem('gachaFactorySave'), sv = JSON.parse(raw);
  check('Task110: nothing about the walk is saved (saveVersion 1, workers keep their 9 fields)', sv.saveVersion === 1 && !/workerSim|route|ghost|detour|walked/i.test(raw) &&
    sv.run.characters.every((c) => Object.keys(c).sort().join() === 'carry,carryLvl,id,mining,miningLvl,move,moveLvl,rarity,resource'));
})();

(function test_T110_aroundThePlayer() {
  // the player standing right in a worker's way: the worker goes round (or, at worst, briefly through) and still arrives
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, b = s.world.base;
  win.secureMine('mine_start_iron');
  t109AddWorker(win, 'common', 'iron');
  const spot = win.tdWorkerPlacements()[0];
  win.tdWorkerSimReset(); win.tdWorkerSimStep(16, 0);
  const sim = Object.values(win.TD.workerSim.byId)[0];
  const p = s.world.player;
  p.x = (sim.x + spot.x) / 2; p.y = (sim.y + spot.y) / 2;
  let touchedPlayer = 0;
  t110Run(win, 15000, () => { if (sim.ghostMs <= 0 && sim.mode === 'walk' && win.playerFootOverlaps(win.tdWorkerPlayerBox(), sim.x, sim.y)) touchedPlayer++; });
  check('Task110: a worker walks round the player standing in its way and arrives', t110Arrived(win) && sim.snaps === 0 && touchedPlayer === 0);
  p.x = spot.x; p.y = spot.y; // the player stands on the worker's very spot
  s.characters[0].resource = 'coal'; win.secureMine('mine_start_coal'); t110Run(win, 100);
  s.characters[0].resource = 'iron';
  t110Run(win, 15000);
  check('Task110: even with the player on its spot, the worker gets there (never stuck for good)', t110Arrived(win) && sim.snaps === 0);
  check('Task110: workers still never block the player', !win.worldObstacles().some((o) => o.kind === 'worker' || o.kind === 'player'));
})();

(function test_T110_throughTheTunnel() {
  // the fixture save: the tunnel is open and veins lie beyond — the workers walk there through the tunnel
  const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const win = newDom(st).window;
  const pl = win.tdWorkerPlacements(), beyond = pl.filter((p) => win.tdWorkerSide(p.x, p.y) === 'west');
  win.tdWorkerSimReset();
  let throughTunnel = 0;
  const seen = t110Run(win, 40000, () => { Object.values(win.TD.workerSim.byId).forEach((x) => { if (win.terrainRegionAt(x.x, x.y) === 'tunnel') x.wasInTunnel = true; }); });
  throughTunnel = Object.values(win.TD.workerSim.byId).filter((x) => x.wasInTunnel).length;
  check('Task110: the fixture save\'s five workers all reach their veins', pl.length === 5 && t110Arrived(win));
  check('Task110: those working beyond the mountain went through the tunnel (never over the rock)', throughTunnel >= beyond.length && seen.inRock === 0 && seen.inside === 0);
  check('Task110: and nobody was stuck', Object.values(win.TD.workerSim.byId).every((x) => x.snaps === 0));
})();

(function test_T110_randomWorlds() {
  // generated worlds (tunnel open, 8 huts, all regions) with 16 workers on random resources, walking and then reassigned
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  let bad = 0, worlds = 0, walkers = 0, beyondWalkers = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const rnd = t103Random(seed * 104729);
    const fresh = win.freshRunState(), s = win.state;
    Object.keys(fresh).forEach((k) => { s[k] = fresh[k]; });
    s.world.hiddenMineIds = [];
    s.world.mines = win.generateInitialWorldMines(s.world.base, { random: rnd });
    ['manaVein', 'ruins', 'spaceStation'].forEach((k) => { s.unlockedSites[k] = true; win.seedWorldMinesForSite(k); });
    s.research.workshopBuild = true; s.research.workshopExpansion = true; s.gold = 1e12;
    Object.keys(s.products).forEach((k) => { s.products[k] = 1e6; });
    for (let i = 0; i < 8; i++) win.buildWorkshop();
    win.unlockTunnel({ random: rnd }); win.surveyMines({ random: rnd });
    s.world.hiddenMineIds = []; // every vein known, so some workers walk beyond the mountain (through the trees)
    s.world.mines.forEach((m) => { if (rnd() < 0.5) m.developmentState = 'secured'; });
    s.world.base.level = 4;
    const res = [...new Set(s.world.mines.map((m) => m.resource))];
    s.characters = [];
    for (let i = 0; i < 16; i++) t109AddWorker(win, ['common', 'rare', 'epic', 'legend'][i % 4], res[Math.floor(rnd() * res.length)]);
    win.tdWorkerSimReset();
    const a = t110Run(win, 30000), ok1 = t110Arrived(win);
    s.characters.forEach((c, i) => { if (i % 3 === 0) c.resource = res[(res.indexOf(c.resource) + 1) % res.length]; });
    const b2 = t110Run(win, 30000), ok2 = t110Arrived(win);
    worlds++; walkers += s.characters.length; beyondWalkers += win.tdWorkerPlacements().filter((p) => win.tdWorkerSide(p.x, p.y) === 'west').length;
    if (!ok1 || !ok2 || a.inside + b2.inside || a.inRock + b2.inRock || Object.values(win.TD.workerSim.byId).some((x) => x.snaps)) bad++;
  }
  check('Task110: in 6 generated worlds 16 workers each walk to their veins (and again after new jobs) without getting stuck, through anything or into rock', worlds === 6 && walkers === 96 && bad === 0);
  check('Task110: ...including workers walking to veins beyond the mountain, past its trees and rocks', beyondWalkers >= 3);
})();

// -----------------------------------------------------------------------------
// Task 111: solid scenery blocks the player and the workers
// -----------------------------------------------------------------------------
(function test_T111_scenery() {
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, p = s.world.player, F = win.PLAYER_FOOT, BOX = win.SCENERY_BLOCK_BOXES;
  check('Task111: with the tunnel closed the land beyond (and its scenery) is out of play', !win.worldObstacles().some((o) => o.kind === 'scenery'));
  s.research.tunnelWork = true; win.unlockTunnel();
  const sc = win.worldScenery(), obs = win.worldObstacles().filter((o) => o.kind === 'scenery');
  const solidKinds = ['bigTree', 'sparseTree', 'rock', 'crystal', 'mineCart', 'timberSupport', 'oldShaftEntrance'];
  check('Task111: trees, boulders, crystal clusters, the cart, timber supports and the shaft entrance are solid', Object.keys(BOX).sort().join() === solidKinds.slice().sort().join() &&
    obs.length === sc.solid.length && obs.length > 25 && solidKinds.every((k) => sc.props.some((pr) => pr.kind === k)));
  check('Task111: grass, the clearing, digging marks and the low exposed veins stay walkable', sc.props.filter((pr) => !pr.box).length > 10 &&
    sc.props.filter((pr) => !pr.box).every((pr) => ['grass', 'clearing', 'diggingMarks', 'exposedVein', 'undevelopedVein', 'rareVein'].includes(pr.kind)) &&
    !obs.some((o) => ['grass', 'clearing', 'diggingMarks', 'exposedVein'].includes(o.prop)));
  check('Task111: each block is the small foot of its picture (under 0.45 wide, 0.2 deep)', Object.values(BOX).every((b) => b.maxX - b.minX <= 0.45 && b.maxY - b.minY <= 0.2 && b.minX < 0 && b.maxX > 0 && b.minY < 0 && b.maxY > 0));
  // what is drawn is what blocks
  const drawn = win.tdDrawList(null).filter((it) => it.kind === 'prop' && it.prop !== 'lamp');
  check('Task111: the drawn scenery is exactly the world\'s scenery (nothing solid is invisible, nothing visible is missing)', drawn.length === sc.props.length &&
    sc.solid.every((pr) => drawn.some((it) => it.x === pr.x && it.y === pr.y && it.prop === pr.kind)));
  check('Task111: nothing that would wall ground in had to be left out of the current scenery (all pieces kept)', win.worldSceneryBase().length === win.terrainBeyondProps().length);
  check('Task111: pieces on a vein are still left out (0.9), so a vein is always readable and reachable', s.world.mines.every((m) => sc.props.every((pr) => Math.hypot(pr.x - m.x, pr.y - m.y) >= 0.9)));
  // the near lookup gives the same boxes as the full list
  const sample = [[-8, 2], [-7, -4], [-9, 6], [-6.8, 1]];
  check('Task111: the quick nearby lookup agrees with the full list', sample.every(([x, y]) => {
    const near = win.worldObstacles(x, y, 1).filter((o) => o.kind === 'scenery').map((o) => o.id).sort().join();
    const all = obs.filter((o) => Math.hypot((o.minX + o.maxX) / 2 - x, (o.minY + o.maxY) / 2 - y) <= 1.8).map((o) => o.id);
    return all.every((id) => near.includes(id));
  }));
  // walking into a tree stops at its trunk; walking past grass does not
  const tree = sc.solid.find((pr) => pr.kind === 'bigTree' && win.playerCanStand(pr.x, pr.box.maxY + F.HALF_H + 0.6) && win.playerCanStand(pr.x, pr.box.maxY + F.HALF_H + 0.01));
  p.x = tree.x; p.y = tree.box.maxY + F.HALF_H + 0.6; t107Hold(win, ['up'], 8);
  const stopped = Math.abs(p.y - (tree.box.maxY + F.HALF_H)) < 1e-3 || (Math.abs(p.x - tree.x) > 0 && Math.abs(p.x - tree.x) <= 0.2 + 1e-9);
  check('Task111: walking into a tree trunk stops (or glides round it), never through it', stopped && !win.worldObstacles(p.x, p.y, 1).some((o) => win.playerFootOverlaps(o, p.x, p.y)));
  const grass = sc.props.find((pr) => pr.kind === 'grass' && win.playerCanStand(pr.x + 0.5, pr.y) && win.playerCanStand(pr.x, pr.y) && win.playerCanStand(pr.x - 0.5, pr.y) &&
    !win.worldObstacles(pr.x, pr.y, 1).some((o) => o.minY < pr.y + 0.1 && o.maxY > pr.y - 0.1 && o.maxX > pr.x - 0.7 && o.minX < pr.x + 0.7));
  if (grass) { p.x = grass.x + 0.5; p.y = grass.y; t107Hold(win, ['left'], 4); }
  check('Task111: grass is walked straight through', !!grass && p.x < grass.x - 0.4 && p.y === grass.y);
  // an older save standing inside a tree simply walks out
  p.x = tree.x; p.y = tree.y - 0.04;
  check('Task111: (a position inside a tree, as an older save could have)', win.worldObstacles(p.x, p.y, 1).some((o) => o.kind === 'scenery' && win.playerFootOverlaps(o, p.x, p.y)));
  t107Hold(win, ['down'], 4);
  check('Task111: ...walks out of it and is not let back in', !win.worldObstacles(p.x, p.y, 1).some((o) => win.playerFootOverlaps(o, p.x, p.y)) && p.y > tree.y);
  // the terrain itself is unchanged
  check('Task111: scenery does not change the terrain (mountain, tunnel and walkability as before)', win.isWorldPointWalkable(-8, 4) === true && win.isWorldPointWalkable(-5, -5) === false && win.WORLD_TERRAIN.PLAYER_MARGIN === 0.3);
  win.saveGame();
  check('Task111: nothing about scenery or obstacles is saved', !/scenery|obstacle|SCENERY/i.test(win.localStorage.getItem('gachaFactorySave')));
})();

(function test_T111_reachBeyond() {
  // the land beyond, with all its solid scenery, is one connected walk from the tunnel exit (no pockets),
  // in the fixture save and with veins generated all over it
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state;
  s.research.tunnelWork = true; win.unlockTunnel();
  const B = win.BALANCE.world, st = 0.1, exit = win.terrainTunnelExit();
  const nx = Math.round((exit.x - B.BOUNDS_MIN_X) / st) + 1, ny = Math.round((B.BOUNDS_MAX_Y - B.BOUNDS_MIN_Y) / st) + 1;
  const P = (i, j) => [B.BOUNDS_MIN_X + i * st, B.BOUNDS_MIN_Y + j * st];
  const fill = () => {
    const can = new Uint8Array(nx * ny), seen = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [x, y] = P(i, j); can[j * nx + i] = win.playerCanStand(x, y) ? 1 : 0; }
    const si = Math.round((exit.x - 0.3 - B.BOUNDS_MIN_X) / st), sj = Math.round((exit.y - B.BOUNDS_MIN_Y) / st), q = [[si, sj]];
    seen[sj * nx + si] = 1;
    while (q.length) { const [i, j] = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const u = i + a, v = j + b; if (u < 0 || v < 0 || u >= nx || v >= ny) return; const k = v * nx + u; if (seen[k] || !can[k]) return; seen[k] = 1; q.push([u, v]); }); }
    let pockets = 0, open = 0; for (let k = 0; k < nx * ny; k++) if (can[k]) { open++; if (!seen[k]) pockets++; }
    return { pockets, open };
  };
  const r = fill();
  check('Task111: beyond the mountain every open spot is reachable from the tunnel exit despite the trees and rocks', r.pockets === 0 && r.open > 3000);
  const st2 = makeMemoryStorage(); st2.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const fx = newDom(st2).window;
  check('Task111: the fixture save\'s veins beyond can all be walked to (and its workers have free spots)', fx.state.world.mines.filter((m) => fx.terrainRegionAt(m.x, m.y) === 'beyond').every((m) => {
    for (let a = 0; a < 16; a++) { const x = m.x + Math.cos(a * Math.PI / 8) * 0.6, y = m.y + Math.sin(a * Math.PI / 8) * 0.6; if (fx.playerCanStand(x, y)) return true; } return false;
  }) && fx.tdWorkerPlacements().every((p) => fx.playerCanStand(p.x, p.y)));
})();

// -----------------------------------------------------------------------------
// Task 112: torches the player sets down (saved, additive field, saveVersion 1)
// -----------------------------------------------------------------------------
(function test_T112_torches() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, p = s.world.player, b = s.world.base, T = win.TORCH;
  check('Task112: a new game starts with no torches', Array.isArray(s.world.torches) && s.world.torches.length === 0);
  const rates = JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key)));
  // set down in front of the player
  p.x = b.x + 2.5; p.y = b.y + 2.5; p.facing = 'right';
  const spot = win.torchSpotAhead();
  check('Task112: the torch goes just in front of the player (by facing)', Math.abs(spot.x - (p.x + T.AHEAD)) < 0.006 && Math.abs(spot.y - p.y) < 0.006);
  const r1 = win.torchAct();
  check('Task112: on open ground it is set down', r1.ok && r1.action === 'place' && s.world.torches.length === 1 && s.world.torches[0].x === spot.x && s.world.torches[0].y === spot.y);
  const r2 = win.torchAct();
  check('Task112: standing by it, the same action picks it up again', r2.ok && r2.action === 'remove' && s.world.torches.length === 0);
  // where it may not go
  const mine = win.mineById('mine_start_iron');
  check('Task112: not on a vein', /광맥/.test(win.torchPlaceProblem(mine.x + 0.2, mine.y)));
  check('Task112: not on the workshop door step or inside its walls', /문/.test(win.torchPlaceProblem(b.x, b.y + 0.05)) && !!win.torchPlaceProblem(b.x, b.y - 0.25));
  const hut = win.addWorkshop({ x: b.x + 3, y: b.y - 2, level: 1 });
  check('Task112: not in front of a hut\'s door or in it', !!win.torchPlaceProblem(hut.x, hut.y) && !!win.torchPlaceProblem(hut.x, hut.y - 0.2));
  check('Task112: not on the mountain', /놓을 수 없/.test(win.torchPlaceProblem(-5, -5)));
  check('Task112: not outside the world', !!win.torchPlaceProblem(11, 0) && !win.placeTorch(NaN, 0));
  check('Task112: two torches keep a little apart', win.placeTorch(b.x + 2.5, b.y + 3) && /횃불끼리/.test(win.torchPlaceProblem(b.x + 2.7, b.y + 3)) && win.torchPlaceProblem(b.x + 3.1, b.y + 3) === null);
  // the cap
  let placed = s.world.torches.length;
  for (let i = 0; i < 20; i++) if (win.placeTorch(b.x + 4 + (i % 5) * 0.6, b.y + 3 + Math.floor(i / 5) * 0.6)) placed++;
  check('Task112: at most 12 torches stand at once (keeps the lighting light on phones)', T.MAX === 12 && s.world.torches.length === 12 && /12개까지/.test(win.torchPlaceProblem(b.x + 1, b.y + 4)));
  // beyond the mountain: not on solid scenery
  s.research.tunnelWork = true; win.unlockTunnel();
  const tree = win.worldScenery().solid.find((pr) => pr.kind === 'bigTree');
  s.world.torches.pop();
  check('Task112: not on a tree or rock beyond the mountain', /건물이나 바위/.test(win.torchPlaceProblem(tree.x, tree.y - 0.03)));
  // they never block the way
  const t0 = s.world.torches[0];
  p.x = t0.x - 0.6; p.y = t0.y; t107Hold(win, ['right'], 4);
  check('Task112: a torch never blocks the player (it is thin)', p.x > t0.x + 0.5 && !win.worldObstacles().some((o) => o.kind === 'torch'));
  // drawn and lit
  const items = win.tdDrawList(null).filter((it) => it.kind === 'torch');
  check('Task112: every torch stands in the world, sorted with everything else', items.length === s.world.torches.length && items.every((it, i) => it.x === s.world.torches[i].x && it.sortY === it.y));
  const lights = win.tdLightList({ x: 0, y: 0, dir: 'down' }, 1000).filter((l) => l.kind === 'torch');
  check('Task112: each torch gives a soft warm flickering light', lights.length === s.world.torches.length && lights.every((l) => l.r > 1 && l.r <= 1.35 && l.strength < 1 && l.glow > 1));
  check('Task112: the helmet lamp, workshop lamp and windows are still there', ['headlamp', 'aura', 'lamp', 'window'].every((k) => win.tdLightList({ x: 0, y: 0, dir: 'down' }, 1000).some((l) => l.kind === k)));
  const sp = [0, 1, 2].map((f) => win.tdTorchSprite(f));
  check('Task112: the torch has a 3-frame flame inside its 10 x 22 sprite', sp.every((x) => x.w === 10 && x.h === 22 && x.rects.every(([a, c, w, h]) => a >= 0 && c >= 0 && a + w <= 10 && c + h <= 22)) && new Set(sp.map((x) => JSON.stringify(x.rects))).size === 3);
  check('Task112: the game is otherwise untouched (output unchanged)', JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key))) === rates);
  // saved and loaded back exactly
  const kept = JSON.stringify(s.world.torches);
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task112: torches are saved as plain points (saveVersion 1)', sv.saveVersion === 1 && JSON.stringify(sv.run.world.torches) === kept && sv.run.world.torches.every((t) => Object.keys(t).sort().join() === 'x,y'));
  const w2 = newDom(storage).window;
  check('Task112: ...and come back in the same places', JSON.stringify(w2.state.world.torches) === kept);
})();

(function test_T112_controls() {
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, p = s.world.player, b = s.world.base, doc = win.document;
  p.x = b.x + 2.5; p.y = b.y + 2.5; p.facing = 'down';
  const btn = doc.getElementById('tdTorch');
  win.tdUpdateActionButton();
  check('Task112: a torch button is on the screen and says what it will do', !!btn && /횃불 놓기/.test(btn.textContent) && /0\/12/.test(btn.textContent));
  btn.click();
  check('Task112: the button sets a torch down (phone and PC)', s.world.torches.length === 1 && /횃불 거두기/.test(btn.textContent) && /1\/12/.test(btn.textContent));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 't', bubbles: true }));
  check('Task112: T picks it up again (PC)', s.world.torches.length === 0);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'T', bubbles: true }));
  check('Task112: and T sets one down', s.world.torches.length === 1);
  const input = doc.createElement('input'); input.type = 'text'; doc.body.appendChild(input);
  input.focus(); input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 't', bubbles: true }));
  check('Task112: typing a "t" in a field does nothing to torches', s.world.torches.length === 1);
  check('Task112: a refused spot says why (shown as a floating note)', (() => { p.x = win.terrainFaceX(-5) + win.WORLD_TERRAIN.PLAYER_MARGIN + 0.02; p.y = -5; p.facing = 'left'; const n = win.TD.floats.length; win.tdTorchNow(); return win.TD.floats.length === n + 1 && s.world.torches.length === 1; })());
})();

(function test_T112_oldSaves() {
  // an older save has no torch list: it loads with none, everything else exactly as saved
  const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const win = newDom(st).window;
  check('Task112: a save from before torches loads with none', Array.isArray(win.state.world.torches) && win.state.world.torches.length === 0 && !('torches' in T103_FIXTURE.run.world));
  check('Task112: ...and the rest of its world is as saved', t103Canon(win.state.world.mines) === t103Canon(T103_FIXTURE.run.world.mines) && win.state.world.player.x === T103_FIXTURE.run.world.player.x && win.state.gold >= T103_FIXTURE.run.gold);
  const bad = JSON.parse(T103_FIXTURE_RAW);
  bad.run.world.torches = [{ x: 1, y: 2 }, { x: 'a', y: 1 }, null, { x: 50, y: 0 }, { x: 3.25, y: -1.5, extra: 1 }].concat(Array.from({ length: 20 }, (_, i) => ({ x: i * 0.5 - 5, y: 5 })));
  const st2 = makeMemoryStorage(); st2.setItem('gachaFactorySave', JSON.stringify(bad));
  const w2 = newDom(st2).window, tl = w2.state.world.torches;
  check('Task112: broken torch entries are dropped, good ones kept exactly, at most 12', tl.length === 12 && tl[0].x === 1 && tl[0].y === 2 && tl[1].x === 3.25 && tl[1].y === -1.5 && tl.every((t) => Object.keys(t).sort().join() === 'x,y'));
  const st3 = makeMemoryStorage(); bad.run.world.torches = 'lots'; st3.setItem('gachaFactorySave', JSON.stringify(bad));
  check('Task112: a torch field that is not a list means no torches', newDom(st3).window.state.world.torches.length === 0);
})();

// -----------------------------------------------------------------------------
// Task 113: the village save skeleton (run.village, additive, saveVersion 1)
// -----------------------------------------------------------------------------
(function test_T113_villageState() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, V = win.VILLAGE;
  check('Task113: two facilities to restore beside the workshop: the appraiser (감정소) and the museum (박물관)',
    V.ORDER.join() === 'appraiser,museum' && V.FACILITIES.appraiser.name === '감정소' && V.FACILITIES.museum.name === '박물관' && V.FACILITIES.museum.requires === 'appraiser');
  check('Task113: each is restored in two steps (clearing, then rebuilding), paid in gold and early products only',
    V.ORDER.every((k) => V.FACILITIES[k].stages.length === 2 && V.FACILITIES[k].stages.every((st) => st.cost.gold > 0 &&
      Object.keys(st.cost.products || {}).every((p) => win.RECIPES.some((r) => r.key === p) && ['steel', 'coalBrick', 'ironTool'].includes(p)))));
  check('Task113: a relic codex of 12, each with a name, a rarity and a weight', win.VILLAGE_RELICS.length === 12 &&
    new Set(win.VILLAGE_RELIC_KEYS).size === 12 && win.VILLAGE_RELICS.every((r) => r.name && ['common', 'uncommon', 'rare'].includes(r.rarity) && r.weight > 0));
  check('Task113: unidentified relics are their own collectible: the crafting resource 고대 유물 stays as it was',
    win.RESOURCES.some((r) => r.key === 'relic' && r.name === '고대 유물') && !win.VILLAGE_RELIC_KEYS.includes('relic') &&
    win.RECIPES.filter((r) => r.need.relic).map((r) => r.key).join() === 'relicPart,relicOrnament');
  const v = s.village;
  check('Task113: a new game starts with a ruined village and no relics', v && v.stage.appraiser === 0 && v.stage.museum === 0 &&
    v.unidentified === 0 && v.digProgress === 0 && v.appraised === 0 && Object.keys(v.owned).length === 0 && v.codex.length === 0 && v.donated.length === 0);
  // a save from before the village loads with a ruined village, everything else unchanged
  const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const old = newDom(st).window;
  check('Task113: a save without a village (the fixture) loads with a ruined village', !('village' in T103_FIXTURE.run) &&
    old.state.village.stage.appraiser === 0 && old.state.village.unidentified === 0 && old.state.gold >= T103_FIXTURE.run.gold && old.state.world.mines.length === 26);
  // bad values are cleaned up, good ones kept exactly
  const bad = JSON.parse(T103_FIXTURE_RAW);
  bad.run.village = { sites: { appraiser: { x: 3.5, y: 2 }, museum: { x: 'a', y: 1 } }, stage: { appraiser: 2, museum: 7 },
    unidentified: 3, digProgress: -1, appraised: 4.5, owned: { bell: 2, nope: 1, tile: 0 }, codex: ['tile', 'tile', 'zzz'], donated: ['potsherd', 5] };
  const st2 = makeMemoryStorage(); st2.setItem('gachaFactorySave', JSON.stringify(bad));
  const w2 = newDom(st2).window, v2 = w2.state.village;
  check('Task113: broken village values are dropped or reset, good ones kept exactly',
    v2.sites.appraiser.x === 3.5 && v2.sites.appraiser.y === 2 && v2.stage.appraiser === 2 && v2.stage.museum === 0 && v2.unidentified === 3 &&
    v2.digProgress === 0 && v2.appraised === 0 && JSON.stringify(v2.owned) === '{"bell":2}' && JSON.stringify(v2.donated) === '["potsherd"]' &&
    v2.codex.slice().sort().join() === 'bell,potsherd,tile');
  check('Task113: a museum site that is not a point is not kept', v2.sites.museum === null || (typeof v2.sites.museum.x === 'number' && v2.sites.museum.x !== 'a'));
  const st3 = makeMemoryStorage(); bad.run.village = 'ruins'; st3.setItem('gachaFactorySave', JSON.stringify(bad));
  check('Task113: a village field that is not an object means a fresh ruined village', newDom(st3).window.state.village.stage.museum === 0);
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task113: the village is saved in run.village with saveVersion 1', sv.saveVersion === 1 && sv.run.village &&
    Object.keys(sv.run.village).sort().join() === 'appraised,codex,digProgress,donated,owned,sites,stage,unidentified');
  check('Task113: village.js loads after player.js and before ui.js (index.html, tests and the simulator agree)',
    win.document.querySelectorAll('script[src="js/village.js"]').length === 1 &&
    Array.from(win.document.querySelectorAll('script[src]')).map((e) => e.getAttribute('src')).join().includes('js/player.js,js/village.js,js/ui.js'));
})();

// -----------------------------------------------------------------------------
// Task 114: village sites, ruins, collision and door access
// -----------------------------------------------------------------------------
// The flood fill used for reachability (foot positions on a 0.1 grid, from the workshop door).
function t114Reach(win) {
  const b = win.BALANCE.world, st = 0.1, n = Math.round((b.BOUNDS_MAX_X - b.BOUNDS_MIN_X) / st) + 1;
  const P = (i) => b.BOUNDS_MIN_X + i * st, idx = (i, j) => j * n + i;
  const can = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) can[idx(i, j)] = win.playerCanStand(P(i), P(j)) ? 1 : 0;
  const base = win.state.world.base, seen = new Uint8Array(n * n);
  const at = (x, y) => idx(Math.round((x - b.BOUNDS_MIN_X) / st), Math.round((y - b.BOUNDS_MIN_Y) / st));
  const q = [at(base.x, base.y + 0.05)]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), i = c % n; [i > 0 ? c - 1 : -1, i < n - 1 ? c + 1 : -1, c - n, c + n].forEach((d) => { if (d < 0 || d >= n * n || seen[d] || !can[d]) return; seen[d] = 1; q.push(d); }); }
  let pockets = 0; for (let k = 0; k < n * n; k++) if (can[k] && !seen[k]) pockets++;
  const near = (x, y, r) => { for (let j = Math.round((y - r - b.BOUNDS_MIN_Y) / st); j <= Math.round((y + r - b.BOUNDS_MIN_Y) / st); j++) for (let i = Math.round((x - r - b.BOUNDS_MIN_X) / st); i <= Math.round((x + r - b.BOUNDS_MIN_X) / st); i++) { if (i < 0 || j < 0 || i >= n || j >= n) continue; if (seen[idx(i, j)] && Math.hypot(P(i) - x, P(j) - y) <= r) return true; } return false; };
  const v = win.state.village;
  return { pockets, minesOk: win.state.world.mines.every((m) => near(m.x, m.y, win.TOPDOWN.INTERACT_RANGE - 0.15)),
    doorsOk: win.VILLAGE.ORDER.every((k) => v.sites[k] && near(v.sites[k].x, v.sites[k].y + 0.1, 0.12)) };
}
function t114Rules(win) {
  const v = win.state.village, S = win.VILLAGE.SITE, w = win.state.world;
  return win.VILLAGE.ORDER.every((k) => { const p = v.sites[k]; return p &&
    w.mines.every((m) => Math.hypot(m.x - p.x, m.y - p.y) >= S.MINE_CLEAR) && w.workshops.every((h) => Math.hypot(h.x - p.x, h.y - p.y) >= S.WORKSHOP_CLEAR - 1e-9) &&
    win.worldGenExpansionSeedCells(w.base).every((c) => Math.hypot(c.x - p.x, c.y - p.y) >= S.MINE_CLEAR) && Math.hypot(p.x - w.base.x, p.y - w.base.y) >= S.RMIN &&
    win.terrainRegionAt(p.x, p.y) === 'open'; }) && Math.hypot(v.sites.appraiser.x - v.sites.museum.x, v.sites.appraiser.y - v.sites.museum.y) >= S.GAP;
}

(function test_T114_sites() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, v = s.village, b = s.world.base;
  check('Task114: a new game gives both facilities a site near the workshop when it starts', !!v.sites.appraiser && !!v.sites.museum &&
    win.VILLAGE.ORDER.every((k) => Math.hypot(v.sites[k].x - b.x, v.sites[k].y - b.y) <= 7));
  check('Task114: the sites keep clear of mines, later expansion mines, craft huts, the workshop yard and each other', t114Rules(win));
  const r = t114Reach(win);
  check('Task114: both doors can be walked to from the workshop door, every vein is still reachable and nothing is cut off', r.doorsOk && r.minesOk && r.pockets === 0);
  // walls block, the door step stays free
  const obs = win.worldObstacles().filter((o) => o.kind === 'village');
  check('Task114: each facility\'s walls are an obstacle, ruined or not (ids appraiser, museum)', obs.length === 2 && obs.map((o) => o.id).sort().join() === 'appraiser,museum');
  check('Task114: the door step is free to stand on', win.VILLAGE.ORDER.every((k) => win.playerCanStand(v.sites[k].x, v.sites[k].y + 0.02)));
  const p = s.world.player, a = v.sites.appraiser, F = win.PLAYER_FOOT, box = win.VILLAGE.FACILITIES.appraiser.box;
  p.x = a.x; p.y = a.y + 0.6; t107Hold(win, ['up'], 10);
  check('Task114: walking up to the appraiser stops at its wall (at the door), never inside', Math.abs(p.y - (a.y + box.maxY + F.HALF_H)) < 1e-3 && !win.worldObstacles(p.x, p.y, 1).some((o) => win.playerFootOverlaps(o, p.x, p.y)));
  // proximity: the facility is a target at its door and opens the village panel
  const t = win.tdInteractTarget(a.x, a.y + 0.2);
  check('Task114: at the door the facility is the interaction target, named (Task 115: with its next step)', t && t.type === 'village' && t.id === 'appraiser' && /감정소/.test(t.label));
  const res = win.tdInteract(t);
  check('Task114: acting on it goes through the village rules (no gold yet: nothing happens, the reason is given)', res.ok === false && /골드/.test(res.text) && s.village.stage.appraiser === 0);
  win.tdOpenTab('village');
  check('Task114: the 마을 panel opens from the dock in the top-down screen', win.document.querySelector('.tab-btn.active').dataset.tab === 'village' && win.document.getElementById('tab-village').classList.contains('active'));
  check('Task114: the panel lists the workshop and both facilities with their state', win.document.querySelectorAll('#villagePanel .village-card').length === 3 &&
    win.document.querySelector('[data-village-stage="museum"]').textContent === '폐허');
  // drawn: in the draw list, behind/in front by their wall front
  const items = win.tdDrawList(null).filter((it) => it.kind === 'village');
  check('Task114: both facilities are in the draw list as ruins, sorted by the front of their walls', items.length === 2 && items.every((it) => it.stage === 0 && Math.abs(it.sortY - (it.y + win.VILLAGE.FACILITIES[it.id].box.maxY)) < 1e-9));
  const sp = [0, 1, 2].map((st) => [win.tdVillageSprite('appraiser', st, 0), win.tdVillageSprite('museum', st, 3)]);
  const inside = (x) => x.rects.length > 10 && x.rects.every(([rx, ry, rw, rh]) => rx >= 0 && ry >= 0 && rx + rw <= x.w && ry + rh <= x.h);
  check('Task114: each facility has its own picture for ruin, cleared and open (inside 44x40 / 60x48)', sp.every(([ap, mu]) => ap.w === 44 && ap.h === 40 && mu.w === 60 && mu.h === 48 && inside(ap) && inside(mu)) &&
    new Set(sp.map(([ap]) => JSON.stringify(ap.rects))).size === 3 && new Set(sp.map(([, mu]) => JSON.stringify(mu.rects))).size === 3);
  // new craft huts keep clear of the sites
  s.research.workshopBuild = true; s.research.workshopExpansion = true; s.gold = 1e12; Object.keys(s.products).forEach((k) => { s.products[k] = 1e6; });
  for (let i = 0; i < 8; i++) win.buildWorkshop();
  check('Task114: craft huts built afterwards keep clear of the sites (8 built)', s.world.workshops.length === 8 &&
    s.world.workshops.every((h) => win.VILLAGE.ORDER.every((k) => Math.hypot(h.x - v.sites[k].x, h.y - v.sites[k].y) >= win.VILLAGE.SITE.WORKSHOP_CLEAR)));
  // the sites are saved and come back exactly
  const kept = JSON.stringify(v.sites);
  win.saveGame();
  const w2 = newDom(storage).window;
  check('Task114: the sites are saved and come back exactly (never moved)', JSON.stringify(w2.state.village.sites) === kept && JSON.stringify(JSON.parse(storage.getItem('gachaFactorySave')).run.village.sites) === kept);
})();

(function test_T114_oldSaveAndManyWorlds() {
  // the fixture: sites are chosen round its 26 mines and 2 huts, which stay exactly where they were
  const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const fx = newDom(st).window;
  check('Task114: an older save gets sites when it loads; its mines and huts are not moved or removed',
    !!fx.state.village.sites.appraiser && !!fx.state.village.sites.museum && t103Canon(fx.state.world.mines) === t103Canon(T103_FIXTURE.run.world.mines) &&
    t103Canon(fx.state.world.workshops) === t103Canon(T103_FIXTURE.run.world.workshops));
  const rf = t114Reach(fx);
  check('Task114: in the fixture both doors and every vein can be reached, nothing is cut off', t114Rules(fx) && rf.doorsOk && rf.minesOk && rf.pockets === 0);
  // generated worlds, with 8 huts built first (old saves) or after (new games), the tunnel open and all sites unlocked
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  let bad = 0, worlds = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const rnd = t103Random(seed * 6151);
    const fresh = win.freshRunState(), s = win.state;
    Object.keys(fresh).forEach((k) => { s[k] = fresh[k]; });
    s.world.hiddenMineIds = [];
    s.world.mines = win.generateInitialWorldMines(s.world.base, { random: rnd });
    s.research.workshopBuild = true; s.research.workshopExpansion = true; s.gold = 1e12;
    Object.keys(s.products).forEach((k) => { s.products[k] = 1e6; });
    const hutsFirst = seed % 2 === 0;
    if (hutsFirst) for (let i = 0; i < 8; i++) win.buildWorkshop();
    const ok = win.villageEnsureSites();
    if (!hutsFirst) for (let i = 0; i < 8; i++) win.buildWorkshop();
    ['manaVein', 'ruins', 'spaceStation'].forEach((k) => { s.unlockedSites[k] = true; win.seedWorldMinesForSite(k); });
    win.unlockTunnel({ random: rnd }); win.surveyMines({ random: rnd });
    const r = t114Reach(win);
    worlds++;
    if (!ok || !t114Rules(win) || !r.doorsOk || !r.minesOk || r.pockets || s.world.workshops.length !== 8) bad++;
  }
  check('Task114: in 12 generated worlds (8 huts before or after, expansions, tunnel, survey) the sites follow the rules and everything stays reachable', worlds === 12 && bad === 0);
})();

(function test_T114_classic() {
  const win = tdDomAt('https://example.test/?view=classic', makeMemoryStorage());
  check('Task114: the classic screen keeps working and has the village panel too', !win.document.body.classList.contains('view-topdown') &&
    !!win.document.querySelector('.tab-btn[data-tab="village"]') && win.document.querySelectorAll('#villagePanel .village-card').length === 3);
})();

// -----------------------------------------------------------------------------
// Task 115: staged restoration (clear, then rebuild; the museum after the appraiser)
// -----------------------------------------------------------------------------
(function test_T115_restore() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, v = s.village, F = win.VILLAGE.FACILITIES, doc = win.document;
  const a = v.sites.appraiser, m = v.sites.museum, p = s.world.player;
  // nothing can be paid for yet
  check('Task115: with no gold the first step is blocked and says why', /골드/.test(win.villageRestoreBlocker('appraiser')) && !win.villageRestore('appraiser') && v.stage.appraiser === 0);
  check('Task115: the museum waits for the appraiser', /감정소를 먼저/.test(win.villageRestoreBlocker('museum')));
  p.x = m.x; p.y = m.y + 0.2;
  const tm = win.tdInteractTarget(p.x, p.y);
  check('Task115: at the museum door before that, the target is locked and says so', tm && tm.id === 'museum' && tm.action === 'locked' && /감정소 먼저 복구/.test(tm.label));
  // the first step by walking up and pressing E (the same as the action button)
  s.gold = 1000;
  p.x = a.x; p.y = a.y + 0.2;
  const ta = win.tdInteractTarget(p.x, p.y);
  check('Task115: at the appraiser door the target offers the next step with its cost', ta && ta.action === 'restore' && /잔해 치우기/.test(ta.label) && /100G/.test(ta.label));
  win.TD.target = ta; win.tdUpdateActionButton();
  check('Task115: the phone action button reads 복구', doc.getElementById('tdAction').textContent === '복구');
  win.tdInteractNow();
  check('Task115: E clears the rubble: stage 1, exactly 100G paid', v.stage.appraiser === 1 && s.gold === 900);
  // the second step needs products
  const t2 = win.tdInteractTarget(p.x, p.y);
  check('Task115: the next step is the rebuild, paid in gold and products', t2.action === 'restore' && /건물 복구/.test(t2.label) && /강철 8/.test(t2.label) && /석탄 벽돌 4/.test(t2.label));
  const floats = win.TD.floats.length;
  win.tdInteractNow();
  check('Task115: without the products nothing is paid and the reason floats up', v.stage.appraiser === 1 && s.gold === 900 && win.TD.floats.length === floats + 1 && /강철/.test(win.TD.floats[win.TD.floats.length - 1].text));
  s.products.steel = 10; s.products.coalBrick = 5;
  win.tdInteractNow();
  check('Task115: with them, the appraiser opens: 400G, 8 steel and 4 coal bricks paid once', v.stage.appraiser === 2 && win.villageIsOpen('appraiser') && s.gold === 500 && s.products.steel === 2 && s.products.coalBrick === 1);
  check('Task115: an open facility takes no more payments', !win.villageRestore('appraiser') && s.gold === 500 && /이미 운영/.test(win.villageRestoreBlocker('appraiser')));
  // the museum, through the 마을 panel buttons
  win.renderVillage();
  let btn = doc.querySelector('[data-village-restore="museum"]');
  win.updateNumbers();
  check('Task115: the panel shows the museum step with its cost, disabled while short, with the reason', !!btn && /1,200G/.test(btn.textContent) && btn.disabled &&
    /골드/.test(doc.querySelector('[data-village-why="museum"]').textContent));
  s.gold = 10000; s.products.steel = 25; s.products.ironTool = 6;
  win.updateNumbers();
  check('Task115: ...and enabled once affordable', !btn.disabled && doc.querySelector('[data-village-why="museum"]').textContent === '');
  btn.click();
  btn = doc.querySelector('[data-village-restore="museum"]');
  check('Task115: the panel button clears the museum rubble (1,200G)', v.stage.museum === 1 && s.gold === 8800 && !!btn && /건물 복구/.test(btn.textContent));
  btn.click();
  check('Task115: ...and rebuilds it (3,000G, 20 steel, 5 iron tools); the card then shows it open', v.stage.museum === 2 && s.gold === 5800 && s.products.steel === 5 && s.products.ironTool === 1 &&
    !doc.querySelector('[data-village-restore="museum"]') && doc.querySelector('[data-village-stage="museum"]').textContent === '운영 중');
  check('Task115: each step wrote a log line', Array.from(doc.querySelectorAll('#log > *')).filter((e) => /감정소|박물관/.test(e.textContent)).length >= 4);
  // drawn by stage, lit when open
  const items = win.tdDrawList(null).filter((it) => it.kind === 'village');
  check('Task115: both are drawn as open buildings now', items.every((it) => it.stage === 2));
  check('Task115: open facilities light their windows', win.tdVillageLights(0).length === 2);
  check('Task115: the walls still block and the door step stays free once rebuilt', win.worldObstacles().filter((o) => o.kind === 'village').length === 2 && win.playerCanStand(a.x, a.y + 0.02));
  // saved and loaded back
  win.saveGame();
  const w2 = newDom(storage).window;
  check('Task115: restoration is saved and comes back', w2.state.village.stage.appraiser === 2 && w2.state.village.stage.museum === 2 && JSON.stringify(w2.state.village.sites) === JSON.stringify(v.sites));
  check('Task115: the workshop is listed first as the village\'s production centre', doc.querySelector('#villagePanel .village-card').dataset.village === 'workshop');
})();

(function test_T115_classicRestore() {
  // the classic screen restores through the same panel buttons
  const win = tdDomAt('https://example.test/?view=classic', makeMemoryStorage());
  win.state.gold = 500;
  win.renderVillage(); win.updateNumbers();
  win.document.querySelector('[data-village-restore="appraiser"]').click();
  check('Task115: on the classic screen the panel button restores too', win.state.village.stage.appraiser === 1 && win.state.gold === 400);
})();

// -----------------------------------------------------------------------------
// Task 116: unidentified relics (found by hand mining) and the appraiser (appraisal, codex)
// -----------------------------------------------------------------------------
function t116OpenVillage(win, which) {
  const s = win.state; s.gold += 1e6; s.products.steel += 100; s.products.coalBrick += 100; s.products.ironTool += 100;
  (which || ['appraiser', 'museum']).forEach((k) => { while (!win.villageIsOpen(k)) if (!win.villageRestore(k)) break; });
}

(function test_T116_relics() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, v = s.village, R = win.VILLAGE.RELIC, doc = win.document;
  win.secureMine('mine_start_iron');
  const iron = win.mineById('mine_start_iron');
  const rates = JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key)));
  // mining by hand: the resource gain is exactly as before, relics come on top
  let ironGot = 0, found = 0;
  for (let i = 0; i < R.EVERY * 3; i++) { const before = s.resources.iron; win.mineMine(iron.id); ironGot += s.resources.iron - before; }
  check('Task116: hand mining still gives exactly its usual amount (no change to resources)', Math.abs(ironGot - R.EVERY * 3 * iron.miningPower * win.mult()) < 1e-9);
  check('Task116: every 8 hand minings of an ordinary vein turn up one unidentified relic', v.unidentified === 3 && v.digProgress === 0);
  check('Task116: the crafting resource 고대 유물 is not touched', s.resources.relic === 0);
  check('Task116: worker output (autoRate) is unchanged', JSON.stringify(win.RESOURCES.map((r) => win.autoRate(r.key))) === rates);
  check('Task116: finding one writes a log line', Array.from(doc.querySelectorAll('#log > *')).some((e) => /미감정 유물을 찾았어요/.test(e.textContent)));
  // automatic income never finds relics
  const before = v.unidentified;
  for (let i = 0; i < 50; i++) win.tickMining();
  check('Task116: automatic mining (the tick) finds none', v.unidentified === before);
  // more beyond the mountain and on relic veins
  const relicVein = win.addMine({ id: 'mine_t116_relic', x: s.world.base.x + 3, y: s.world.base.y + 3, resource: 'relic', grade: 3, miningPower: 1, developmentState: 'secured' });
  v.digProgress = 0; win.mineMine(relicVein.id);
  check('Task116: a 고대 유물 vein counts 3, and still gives its resource', v.digProgress === 3 && s.resources.relic === 1 * win.mult());
  s.world.tunnelUnlocked = true;
  const far = win.addMine({ id: 'mine_t116_far', x: -8, y: 4, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'secured' });
  v.digProgress = 0; win.mineMine(far.id);
  check('Task116: a vein beyond the mountain counts 2', v.digProgress === 2);
  // the cap
  v.unidentified = R.MAX_UNIDENTIFIED; v.digProgress = 5;
  for (let i = 0; i < 20; i++) win.mineMine(iron.id);
  check('Task116: at most 20 are held; while full, mining finds none and adds no progress', v.unidentified === R.MAX_UNIDENTIFIED && v.digProgress === 5);
  v.unidentified = 3; v.digProgress = 0;
  // E at a vein says so when one turns up
  s.world.player.x = iron.x + 0.4; s.world.player.y = iron.y;
  v.digProgress = R.EVERY - 1;
  const r = win.tdInteract(win.tdInteractTarget(s.world.player.x, s.world.player.y));
  check('Task116: mining with E shows "미감정 유물!" when one turns up', r.ok && /미감정 유물!/.test(r.text) && v.unidentified === 4);
  // appraisal needs the appraiser open
  check('Task116: no appraisal before the appraiser is open', /감정소/.test(win.villageAppraiseBlocker()) && win.villageAppraise() === null && v.unidentified === 4);
  t116OpenVillage(win, ['appraiser']);
  const a = v.sites.appraiser;
  const t = win.tdInteractTarget(a.x, a.y + 0.2);
  win.TD.target = t; win.tdUpdateActionButton();
  check('Task116: at the open appraiser the target offers appraisal with the count; the button reads 감정', t.action === 'appraise' && /미감정 4/.test(t.label) && doc.getElementById('tdAction').textContent === '감정');
  s.world.player.x = a.x; s.world.player.y = a.y + 0.2;
  const expected = win.villageNextRelic();
  win.tdInteractNow();
  check('Task116: E appraises one: it becomes a known relic, registered in the codex', v.unidentified === 3 && v.appraised === 1 && v.owned[expected.key] === 1 && v.codex.includes(expected.key) &&
    win.TD.floats.some((f) => f.text.includes(expected.name)));
  // the panel: codex and the appraisal button (the same function)
  win.renderVillage();
  const cards = doc.querySelectorAll('[data-village-relic]');
  check('Task116: the codex shows all 12, unknown ones as ???', cards.length === 12 && doc.querySelectorAll('.village-relic.is-unknown').length === 11 &&
    doc.querySelector('[data-village-relic="' + expected.key + '"]').textContent.includes(expected.name) && doc.querySelector('[data-village-codex-count]').textContent === '1');
  doc.querySelector('[data-village-appraise]').click();
  check('Task116: the panel button appraises too', v.appraised === 2 && v.unidentified === 2);
  // all relics turn up over time, deterministically
  v.unidentified = 60;
  const seq = [];
  for (let i = 0; i < 60; i++) seq.push(win.villageAppraise().relic.key);
  check('Task116: appraising 60 registers the whole codex (new ones are likelier), every relic owned at least once', v.codex.length === 12 &&
    win.VILLAGE_RELIC_KEYS.every((k) => (v.owned[k] || 0) >= 1) && Object.values(v.owned).reduce((x, y) => x + y, 0) === v.appraised);
  const counts = {}; seq.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
  check('Task116: rare relics stay rarer than common ones', win.VILLAGE_RELICS.filter((r) => r.rarity === 'rare').every((r) => (counts[r.key] || 0) <= Math.max(...win.VILLAGE_RELICS.filter((x) => x.rarity === 'common').map((x) => counts[x.key] || 0))));
  win.updateNumbers();
  check('Task116: with nothing left, the button is disabled and the door target just opens the panel', doc.querySelector('[data-village-appraise]').disabled && win.villageAppraise() === null &&
    win.tdInteractTarget(a.x, a.y + 0.2).action === 'open');
  // saved and loaded back
  const kept = JSON.stringify({ u: v.unidentified, d: v.digProgress, n: v.appraised, o: v.owned, c: v.codex });
  win.saveGame();
  const w2 = newDom(storage).window, v2 = w2.state.village;
  check('Task116: relics, the codex and progress are saved and come back exactly', JSON.stringify({ u: v2.unidentified, d: v2.digProgress, n: v2.appraised, o: v2.owned, c: v2.codex }) === kept);
  check('Task116: the same appraisal count gives the same next relic after loading (no randomness)', w2.villageNextRelic().key === win.villageNextRelic().key);
})();

(function test_T116_classic() {
  const win = tdDomAt('https://example.test/?view=classic', makeMemoryStorage());
  t116OpenVillage(win, ['appraiser']);
  win.state.village.unidentified = 2;
  win.renderVillage(); win.updateNumbers();
  win.document.querySelector('[data-village-appraise]').click();
  check('Task116: on the classic screen the panel appraises too', win.state.village.appraised === 1 && win.state.village.codex.length === 1);
  win.secureMine('mine_start_iron'); win.buildMines();
  for (let i = 0; i < 8; i++) win.document.querySelector('[data-mine-mine="mine_start_iron"]').click();
  check('Task116: the classic mine button finds relics too (the same mineMine)', win.state.village.unidentified === 2);
})();

// -----------------------------------------------------------------------------
// Task 117: the museum (donation and display)
// -----------------------------------------------------------------------------
(function test_T117_museum() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, v = s.village, doc = win.document;
  t116OpenVillage(win, ['appraiser']);
  v.unidentified = 8;
  for (let i = 0; i < 8; i++) win.villageAppraise();
  const owned0 = JSON.stringify(v.owned), kinds = Object.keys(v.owned).length;
  check('Task117: no donations before the museum is open', /박물관/.test(win.villageDonateBlocker()) && win.villageDonateAll() === 0 && v.donated.length === 0 && JSON.stringify(v.owned) === owned0);
  t116OpenVillage(win, ['museum']);
  const m = v.sites.museum, gold = s.gold;
  const t = win.tdInteractTarget(m.x, m.y + 0.2);
  win.TD.target = t; win.tdUpdateActionButton();
  check('Task117: at the open museum the target offers to donate the new relics; the button reads 기증', t.action === 'donate' && new RegExp('\\(' + kinds + '점\\)').test(t.label) && doc.getElementById('tdAction').textContent === '기증');
  s.world.player.x = m.x; s.world.player.y = m.y + 0.2;
  win.tdInteractNow();
  check('Task117: E donates one of each kind owned: they go on display and leave the owned relics (duplicates stay)', v.donated.length === kinds &&
    v.donated.every((k) => win.VILLAGE_RELIC_KEYS.includes(k)) && Object.keys(v.owned).every((k) => v.donated.includes(k)) &&
    Object.values(v.owned).reduce((a, b) => a + b, 0) === 8 - kinds);
  check('Task117: donating gives no gold (no rewards yet)', s.gold === gold);
  check('Task117: a kind already on display cannot be donated again', /이미 전시/.test(win.villageDonateBlocker(v.donated[0])) && !win.villageDonate(v.donated[0]));
  check('Task117: with nothing new the door shows the display count', win.tdInteractTarget(m.x, m.y + 0.2).action === 'open' && new RegExp('전시 ' + kinds + '/12').test(win.tdInteractTarget(m.x, m.y + 0.2).label));
  // the display: niches on the building, cases in the panel
  const item = win.tdDrawList(null).find((it) => it.kind === 'village' && it.id === 'museum');
  check('Task117: the museum lights one display niche per two relics on show', item.exhibits === Math.ceil(kinds / 2));
  const lit = (n) => JSON.stringify(win.tdVillageSprite('museum', 2, n).rects);
  check('Task117: its picture changes as niches light up', lit(0) !== lit(1) && lit(1) !== lit(6) && lit(6) === lit(9));
  win.renderVillage();
  check('Task117: the panel shows the display room: cases for what is on show, empty cases for the rest', doc.querySelectorAll('[data-village-exhibit]').length === 12 &&
    doc.querySelectorAll('[data-village-exhibit]:not(.is-unknown)').length === kinds && doc.querySelector('[data-village-exhibits]').textContent === String(kinds));
  // donate a new one through the panel button
  const fresh = win.VILLAGE_RELIC_KEYS.find((k) => !v.donated.includes(k));
  v.owned[fresh] = 1; if (!v.codex.includes(fresh)) v.codex.push(fresh);
  win.renderVillage();
  check('Task117: a new relic is listed for donation', !!doc.querySelector('[data-village-donatable="' + fresh + '"]') && !doc.querySelector('[data-village-donate-all]').disabled);
  doc.querySelector('[data-village-donate="' + fresh + '"]').click();
  check('Task117: its 기증 button donates it', v.donated.includes(fresh) && !v.owned[fresh] && doc.querySelector('[data-village-donate-all]').disabled);
  // the whole collection
  win.VILLAGE_RELIC_KEYS.forEach((k) => { if (!v.donated.includes(k)) v.owned[k] = 1; });
  check('Task117: the whole collection can be put on show (12/12)', win.villageDonateAll() === 12 - kinds - 1 && v.donated.length === 12 && win.tdDrawList(null).find((it) => it.id === 'museum').exhibits === 6);
  // saved and loaded back
  win.saveGame();
  const w2 = newDom(storage).window;
  check('Task117: the display is saved and comes back', w2.state.village.donated.length === 12 && JSON.stringify(w2.state.village.donated) === JSON.stringify(v.donated));
  check('Task117: the crafting resource 고대 유물 was never used', s.resources.relic === 0);
})();

(function test_T117_classicAndOldSave() {
  const win = tdDomAt('https://example.test/?view=classic', makeMemoryStorage());
  t116OpenVillage(win);
  win.state.village.owned = { bell: 1 }; win.state.village.codex = ['bell'];
  win.renderVillage();
  win.document.querySelector('[data-village-donate-all]').click();
  check('Task117: on the classic screen the panel donates too', win.state.village.donated.join() === 'bell');
  // an older save goes through the whole village from scratch, with its own world kept
  const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const fx = newDom(st).window, s = fx.state;
  const mines = t103Canon(s.world.mines), huts = t103Canon(s.world.workshops), res = t103Canon(s.resources);
  t116OpenVillage(fx);
  s.village.unidentified = 3;
  for (let i = 0; i < 3; i++) fx.villageAppraise();
  fx.villageDonateAll();
  fx.saveGame();
  const back = JSON.parse(st.getItem('gachaFactorySave'));
  check('Task117: an older save restores, appraises and donates; its mines, huts and resources are untouched (saveVersion 1)',
    back.saveVersion === 1 && back.run.village.stage.museum === 2 && back.run.village.donated.length >= 1 && t103Canon(back.run.world.mines) === mines &&
    t103Canon(back.run.world.workshops) === huts && t103Canon(back.run.resources) === res);
})();

// -----------------------------------------------------------------------------
// PR #35 verification: no double payments or double rewards, save/load at every step
// -----------------------------------------------------------------------------
(function test_T117_noDoubles() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  const reload = () => { win.saveGame(); win = newDom(storage).window; return win.state; };
  let s = win.state;
  s.gold = 100000; s.products.steel = 100; s.products.coalBrick = 100; s.products.ironTool = 100;
  const spent = () => ({ gold: s.gold, steel: s.products.steel, coalBrick: s.products.coalBrick, ironTool: s.products.ironTool });
  const steps = [];
  // every restoration step, saved and loaded in between: each step paid exactly once
  for (const k of ['appraiser', 'museum']) {
    for (let step = 0; step < 2; step++) {
      const before = spent(), cost = win.VILLAGE.FACILITIES[k].stages[step].cost;
      const ok = win.villageRestore(k);
      const after = spent();
      steps.push(ok && before.gold - after.gold === cost.gold && Object.keys(cost.products || {}).every((p) => before[p] - after[p] === cost.products[p]) &&
        Object.keys(before).filter((p) => p !== 'gold' && !(cost.products || {})[p]).every((p) => before[p] === after[p]));
      s = reload();
      steps.push(s.village.stage[k] === step + 1);
    }
  }
  check('PR35: every restoration step is paid exactly once, and the stage survives a save and load each time', steps.length === 8 && steps.every(Boolean));
  const frozen = spent();
  for (let i = 0; i < 5; i++) { win.villageRestore('appraiser'); win.villageRestore('museum'); }
  const a = s.village.sites.appraiser, m = s.village.sites.museum;
  for (let i = 0; i < 3; i++) { win.tdInteract(win.tdInteractTarget(a.x, a.y + 0.2)); win.tdInteract(win.tdInteractTarget(m.x, m.y + 0.2)); }
  check('PR35: once open, pressing again (panel or E, many times) takes nothing more', JSON.stringify(spent()) === JSON.stringify(frozen));
  // relic progress is not re-granted by saving and loading
  win.secureMine('mine_start_iron');
  for (let i = 0; i < 7; i++) win.mineMine('mine_start_iron');
  check('PR35: 7 hand minings leave progress 7 and no relic yet', s.village.digProgress === 7 && s.village.unidentified === 0);
  s = reload();
  check('PR35: after a save and load the progress is the same and nothing extra was found', s.village.digProgress === 7 && s.village.unidentified === 0);
  win.mineMine('mine_start_iron');
  check('PR35: the 8th mining after loading turns up exactly one', s.village.unidentified === 1 && s.village.digProgress === 0);
  // appraisal: one relic in, one result out; nothing to appraise gives nothing
  const r = win.villageAppraise();
  check('PR35: appraising one relic gives one result', !!r && s.village.unidentified === 0 && s.village.appraised === 1 && Object.values(s.village.owned).reduce((x, y) => x + y, 0) === 1);
  check('PR35: with none left, appraising again gives nothing (E at the door just opens the panel)', win.villageAppraise() === null && win.tdInteract(win.tdInteractTarget(a.x, a.y + 0.2)).open === 'village' &&
    s.village.appraised === 1);
  s = reload();
  check('PR35: the same codex and owned relic after loading (no second copy)', s.village.appraised === 1 && s.village.codex.length === 1 && Object.values(s.village.owned).reduce((x, y) => x + y, 0) === 1);
  // donation: once per kind, also across a save and load; donating gives no gold
  const key = s.village.codex[0], goldBefore = s.gold;
  check('PR35: the relic is donated once', win.villageDonate(key) && s.village.donated.length === 1 && !s.village.owned[key]);
  check('PR35: donating it again in the same session is refused', !win.villageDonate(key) && win.villageDonateAll() === 0 && s.village.donated.length === 1);
  s.village.owned[key] = 1; // a duplicate appraised later
  s = reload();
  check('PR35: after loading, a duplicate of a kind on display cannot be donated again (no second display)', !win.villageDonate(key) && win.villageDonateAll() === 0 &&
    s.village.donated.length === 1 && s.village.owned[key] === 1 && !win.tdInteract(win.tdInteractTarget(m.x, m.y + 0.2)).text.includes('기증'));
  check('PR35: no gold came from donating', s.gold === goldBefore);
  // a save that claims more than it has is cleaned up, not rewarded
  const raw = JSON.parse(storage.getItem('gachaFactorySave'));
  raw.run.village.donated = [key, key, key, 'notARelic'];
  raw.run.village.stage = { appraiser: 9, museum: -1 };
  storage.setItem('gachaFactorySave', JSON.stringify(raw));
  const w3 = newDom(storage).window, v3 = w3.state.village;
  check('PR35: a save listing a relic on display several times keeps it once; bad stages fall back to ruins', v3.donated.length === 1 && v3.donated[0] === key &&
    v3.stage.appraiser === 0 && v3.stage.museum === 0);
  check('PR35: saveVersion stays 1', JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1);
})();
