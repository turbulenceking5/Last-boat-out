// Boot and the main loop: fixed simulation steps scaled by game speed, one render per frame.

(() => {
  const seed = Number(new URLSearchParams(location.hash.slice(1)).get('seed')) || Math.floor(Math.random() * 1e9);
  newGame(seed);
  if (!initView($('#view'))) { document.documentElement.classList.add('no3d'); return; }
  const panKeys = bindInput(V.renderer.domElement);
  buildBar();
  syncMute();
  refreshPanel(true);
  showOverlay('start');
  addEventListener('resize', resizeView);

  let last = performance.now(), acc = 0;
  function frame(now: number) {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    let gameDt = 0;
    if (!UI.overlay && !G.over && G.speed > 0) {
      acc += real * G.speed;
      let n = 0;
      while (acc >= STEP && n < 16 && !G.decision) { tick(STEP); acc -= STEP; n++; gameDt += STEP; }
      if (n === 16) acc = 0; // the machine can't keep up: drop time rather than spiral
    }
    panKeys(real);
    if (G.over && UI.overlay !== 'end') showOverlay('end');
    else if (G.decision && !UI.overlay) { acc = 0; showOverlay('decide'); }
    const place = UI.mode && UI.hover ? { x: UI.hover.x, z: UI.hover.z, r: PLACE_R[UI.mode], ok: G.funds >= ORDER_COST[UI.mode] } : null;
    drawFrame(G.t, gameDt, UI.sel, UI.block, place);
    playSfx(real);
    updateAlert();
    updateHud(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // hooks for automated tests
  (window as unknown as { City: unknown }).City = {
    get G() { return G; }, tick, order, moveUnits, evacuateBlock, sendToBlock, UI, showOverlay, useAbility, reinforce, choose,
    reset(seed: number) { newGame(seed); resetView(); showOverlay(''); },
    look(x: number, z: number, dist: number) { Object.assign(V.cam, { x, z, dist }); },
  };
})();
