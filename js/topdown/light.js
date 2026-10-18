// ---------------------------------------------------------------------------
// Task 108: light and atmosphere. A gentle dusk tint over the world that
// slowly comes and goes, with soft holes of light: the miner's helmet lamp
// (a cone in the facing direction), the workshop lamp and windows, the craft
// huts' forge windows, a faint glow on discovered veins and (Task 112) the
// torches the player sets down. Cloud shadows
// drift over the land and fireflies come out at dusk. All of it is drawing
// only: no game value depends on it and nothing is saved.
//
// Cheap on phones: the darkness is painted into a small "light map" canvas
// (a fraction of the screen size) and scaled up, and the quality steps down
// by itself when frames get slow.
// ---------------------------------------------------------------------------
const TD_LIGHT = {
  CYCLE_MS: 8 * 60 * 1000,   // one slow day-to-dusk cycle
  MIN_DARK: 0.10,            // brightest: a light tint only
  MAX_DARK: 0.34,            // darkest dusk: everything stays readable
  AMBIENT_RGB: [16, 22, 42], // cool evening blue
  FIREFLY_DARK: 0.2,         // fireflies come out above this darkness
  MAP_SCALE: [0.34, 0.25, 0.2], // light-map size per quality level (0 = full; Task 112: smaller, it is blurred anyway)
};

// Darkness (0..1 alpha of the tint) at a moment: a smooth cycle between MIN and MAX.
function tdAmbientDarkness(nowMs){
  const ph = ((nowMs % TD_LIGHT.CYCLE_MS) + TD_LIGHT.CYCLE_MS) % TD_LIGHT.CYCLE_MS / TD_LIGHT.CYCLE_MS;
  const k = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
  return TD_LIGHT.MIN_DARK + (TD_LIGHT.MAX_DARK - TD_LIGHT.MIN_DARK) * k;
}

function tdFlicker(nowMs, seed){
  return 0.88 + 0.12 * Math.sin(nowMs / 140 + seed) * Math.sin(nowMs / 53 + seed * 1.7);
}

const TD_FACING_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// Lights in world units: { x, y, r, rgb, strength, cone? { angle, spread } }.
// `player` is the drawn player { x, y, dir }; `extra` lights (workers) are appended.
function tdLightList(player, nowMs, extra){
  const lights = [];
  const warm = [255, 210, 130];
  if(player){
    lights.push({ kind: 'headlamp', x: player.x, y: player.y - 0.28, r: 1.9, rgb: [255, 240, 196], strength: 0.95,
      cone: { angle: TD_FACING_ANGLE[player.dir] !== undefined ? TD_FACING_ANGLE[player.dir] : Math.PI / 2, spread: 0.6 } });
    lights.push({ kind: 'aura', x: player.x, y: player.y - 0.15, r: 0.8, rgb: [255, 236, 190], strength: 0.6 });
  }
  const b = state.world.base;
  lights.push({ kind: 'lamp', x: b.x + 0.62, y: b.y - 0.3, r: 1.6 * tdFlicker(nowMs, 1), rgb: warm, strength: 0.9 });
  [-0.24, 0.26].forEach((dx, i) => lights.push({ kind: 'window', x: b.x + dx, y: b.y - 0.3, r: 0.55, rgb: warm, strength: 0.5 * tdFlicker(nowMs, 3 + i) }));
  state.world.workshops.forEach((w, i) => { if(w) lights.push({ kind: 'forge', x: w.x - 0.17, y: w.y - 0.2, r: 0.7 * tdFlicker(nowMs, 7 + i), rgb: [255, 150, 70], strength: 0.6 }); });
  state.world.mines.forEach(m => {
    if(!m || !isMineDiscovered(m)) return; // a hidden vein never glows: light must not give it away
    const rgb = tdHexRgb((TD_RES_COLORS[m.resource] || ['#cccccc'])[0]);
    const secured = m.developmentState === 'secured';
    lights.push({ kind: 'vein', x: m.x, y: m.y - 0.05, r: secured ? 0.8 : 0.55, rgb, strength: secured ? 0.5 : 0.32 });
  });
  // Task 112: torches — a warm, flickering light a little wider than a hut's forge
  (state.world.torches || []).forEach((t, i) => lights.push({ kind: 'torch', x: t.x, y: t.y - 0.25, r: 1.35 * tdFlicker(nowMs, 11 + i * 2.3), rgb: [255, 176, 92], strength: 0.95, glow: 2.4 }));
  (extra || []).forEach(l => lights.push(l));
  return lights;
}

function tdHexRgb(hex){
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Quality from the average frame time (ms), with a little hysteresis.
//   0 full (clouds, fireflies, larger light map)
//   1 reduced (no fireflies, smaller light map)
//   2 low (no clouds or swaying, smallest light map; Task 112: coloured glows stay, they are cheap now)
// (60 frames a second is 16.7 ms; 30 a second is 33 ms.)
function tdQualityFor(avgMs, current){
  const q = current === undefined ? 0 : current;
  if(avgMs > 34) return 2;
  if(avgMs > 24) return Math.max(q, 1);
  if(avgMs < 19 && q > 0) return q - 1;
  return q;
}

// Cloud shadows: a few large soft shapes drifting slowly west to east (world units).
function tdCloudShadows(nowMs){
  const r = topdownWorldRect(), span = r.maxX - r.minX + 12;
  return [0, 1, 2].map(i => {
    const speed = 0.12 + i * 0.03; // units per second
    const x = r.minX - 6 + ((nowMs / 1000 * speed + i * span / 3) % span);
    return { x, y: -7 + i * 7 + Math.sin(nowMs / 20000 + i) * 1.5, r: 3.2 + i * 0.6 };
  });
}

// Fireflies at dusk: a handful of drifting motes near the workshop and the trees beyond.
function tdFireflies(nowMs, darkness){
  if(darkness < TD_LIGHT.FIREFLY_DARK) return [];
  const b = state.world.base, out = [];
  const anchors = [[b.x + 1.2, b.y + 0.6], [b.x - 1.4, b.y + 0.9], [b.x + 0.4, b.y - 1.4]];
  if(terrainTunnelOpen()) anchors.push([-7, -2], [-8, 3], [-6.5, 6]);
  anchors.forEach(([ax, ay], i) => {
    for(let k = 0; k < 2; k++){
      const t = nowMs / 1000 + i * 3.1 + k * 7.7;
      out.push({ x: ax + Math.sin(t * 0.37 + k) * 0.9 + Math.sin(t * 1.3) * 0.15, y: ay + Math.cos(t * 0.29 + k * 2) * 0.6, glow: 0.5 + 0.5 * Math.sin(t * 2.3 + k) });
    }
  });
  return out;
}

// Paints the darkness with its light holes, then soft coloured glows.
function tdRenderLighting(g, lights, darkness, cam, w, h, zoom, quality, nowMs){
  const scale = TD_LIGHT.MAP_SCALE[quality] || TD_LIGHT.MAP_SCALE[0];
  const lw = Math.max(1, Math.ceil(w * scale)), lh = Math.max(1, Math.ceil(h * scale));
  if(!TD.lightCanvas){ TD.lightCanvas = document.createElement('canvas'); }
  const lc = TD.lightCanvas;
  if(lc.width !== lw || lc.height !== lh){ lc.width = lw; lc.height = lh; }
  const lg = lc.getContext('2d');
  if(!lg) return;
  const A = TD_LIGHT.AMBIENT_RGB, unit = topdownScale(zoom);
  lg.globalCompositeOperation = 'source-over';
  lg.clearRect(0, 0, lw, lh);
  lg.fillStyle = 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + darkness.toFixed(3) + ')';
  lg.fillRect(0, 0, lw, lh);
  lg.globalCompositeOperation = 'destination-out';
  const onScreen = [];
  lights.forEach(l => {
    const sp = topdownToScreen(l.x, l.y, cam, w, h, zoom), R = l.r * unit;
    if(sp.x + R < 0 || sp.y + R < 0 || sp.x - R > w || sp.y - R > h) return;
    onScreen.push({ l, sp, R });
    const cx = sp.x * scale, cy = sp.y * scale, r = R * scale;
    const gr = lg.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(0,0,0,' + l.strength.toFixed(3) + ')');
    gr.addColorStop(0.55, 'rgba(0,0,0,' + (l.strength * 0.45).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = gr;
    lg.beginPath();
    if(l.cone){ lg.moveTo(cx, cy); lg.arc(cx, cy, r, l.cone.angle - l.cone.spread, l.cone.angle + l.cone.spread); lg.closePath(); }
    else lg.arc(cx, cy, r, 0, Math.PI * 2);
    lg.fill();
  });
  // soft coloured glows (warm lamps, ore colours, torches).
  // Task 112: painted into the same small light map (a warm see-through colour where
  // the dark was cleared), so any number of lights costs no extra full-screen pass —
  // cheap enough for every quality level now.
  lg.globalCompositeOperation = 'source-over';
  const k = 0.35 + darkness * 1.4;
  onScreen.forEach(({ l, sp, R }) => {
    if(l.kind === 'headlamp') return; // the lamp only clears the dark; it does not tint
    const cx = sp.x * scale, cy = sp.y * scale, rr = R * 0.75 * scale, gr = lg.createRadialGradient(cx, cy, 0, cx, cy, rr);
    const a = Math.min(0.42, 0.16 * l.strength * k * (l.glow || 1));
    gr.addColorStop(0, 'rgba(' + l.rgb[0] + ',' + l.rgb[1] + ',' + l.rgb[2] + ',' + a.toFixed(3) + ')');
    gr.addColorStop(0.5, 'rgba(' + l.rgb[0] + ',' + l.rgb[1] + ',' + l.rgb[2] + ',' + (a * 0.4).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + l.rgb[0] + ',' + l.rgb[1] + ',' + l.rgb[2] + ',0)');
    lg.fillStyle = gr; lg.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  });
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(lc, 0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  {
    if(quality === 0){
      tdFireflies(nowMs, darkness).forEach(f => {
        const sp = topdownToScreen(f.x, f.y, cam, w, h, zoom);
        if(sp.x < -20 || sp.y < -20 || sp.x > w + 20 || sp.y > h + 20) return;
        const rr = 6 * zoom, gr = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, rr);
        gr.addColorStop(0, 'rgba(220,255,140,' + (0.35 * f.glow).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(220,255,140,0)');
        g.fillStyle = gr; g.fillRect(sp.x - rr, sp.y - rr, rr * 2, rr * 2);
        g.fillStyle = 'rgba(240,255,190,' + (0.5 + 0.5 * f.glow).toFixed(3) + ')'; g.fillRect(Math.round(sp.x), Math.round(sp.y), zoom, zoom);
      });
    }
  }
  g.restore();
}

// Cloud shadows over the ground (before the lighting).
function tdRenderClouds(g, cam, w, h, zoom, nowMs){
  const unit = topdownScale(zoom);
  tdCloudShadows(nowMs).forEach(c => {
    const sp = topdownToScreen(c.x, c.y, cam, w, h, zoom), R = c.r * unit;
    if(sp.x + R < 0 || sp.y + R < 0 || sp.x - R > w || sp.y - R > h) return;
    const gr = g.createRadialGradient(sp.x, sp.y, R * 0.2, sp.x, sp.y, R);
    gr.addColorStop(0, 'rgba(10,20,20,0.10)'); gr.addColorStop(1, 'rgba(10,20,20,0)');
    g.save(); g.fillStyle = gr; g.translate(sp.x, sp.y); g.scale(1.6, 0.8); g.translate(-sp.x, -sp.y);
    g.fillRect(sp.x - R, sp.y - R, R * 2, R * 2); g.restore();
  });
}

// How much a swaying plant leans right now (skew factor; the base stays put).
function tdSway(nowMs, x, y, kind){
  const amp = kind === 'grass' || kind === 'tuft' ? 0.07 : 0.022;
  return amp * Math.sin(nowMs / 1300 + x * 1.7 + y * 0.9) + amp * 0.35 * Math.sin(nowMs / 610 + x * 3.1);
}
