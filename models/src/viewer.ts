// One shared WebGL renderer. The game calls LBModels.show(box, spec) on every render; the model
// is rebuilt only when what it shows has changed, and frames are drawn only while it is on screen.

(() => {
  let renderer: TRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    return; // no WebGL: the game simply shows no 3D view
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab';

  const scene = new THREE.Scene();
  const camera: TCamera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
  const hemi = new THREE.HemisphereLight(0xfff5e0, 0x5a5a48, 0.62);
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
  sun.position.set(6, 11, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.002;
  scene.add(hemi, sun);
  const turntable = new THREE.Group();
  scene.add(turntable);

  const shared = new Set<TGeometry>([...Object.values(GEO), ...Object.values(GROUND)]);
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let key = '', root: TGroup | null = null, ticks: Tick[] = [];
  let running = false, last = 0, clock = 0, spin = 0, dragging = false, dragX = 0, w = 0, h = 0;

  function build(spec: PlaceSpec) {
    if (root) {
      turntable.remove(root);
      root.traverse(o => { const g = (o as TMesh).geometry; if (g && !shared.has(g) && g !== shipHull) g.dispose(); });
    }
    const dead = spec.state === 'fallen', ghost = spec.state === 'cleared' || (spec.pop < 1 && spec.queue < 0.5);
    const c: Ctx = {
      root: new THREE.Group(), spec, rnd: seeded(spec.id), lrnd: seeded(spec.id + '/lights'), ticks: [],
      burnt: dead, ghost, lit: spec.night && !dead && !ghost, yards: [],
    };
    BUILD[spec.type](c);
    c.rnd = seeded(`${spec.id}/${spec.state}`); // people and effects draw from their own stream
    populate(c);
    root = c.root; ticks = c.ticks;
    turntable.add(root);
    // light for the hour: warm sun by day, cold moonlight at night
    if (spec.night) { hemi.color.set(0x6f86b0); hemi.groundColor.set(0x1d2230); hemi.intensity = 0.7; sun.color.set(0xa9bde6); sun.intensity = 0.55; }
    else { hemi.color.set(0xfff5e0); hemi.groundColor.set(0x5a5a48); hemi.intensity = 0.62; sun.color.set(0xfff1d6); sun.intensity = 0.85; }
  }

  function size(box: HTMLElement) {
    const r = box.getBoundingClientRect(), nw = Math.round(r.width), nh = Math.round(r.height);
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    // pull back on narrow boxes so the whole diorama fits
    const dist = 15.5 + Math.max(0, 2 - camera.aspect) * 7;
    camera.position.set(0, dist * 0.62, dist * 0.78);
    camera.lookAt(0, 0.5, 0);
    camera.updateProjectionMatrix();
  }

  function draw() {
    for (const t of ticks) t(clock, 0);
    turntable.rotation.y = spin;
    renderer.render(scene, camera);
  }

  function frame(now: number) {
    if (!running) return;
    if (!canvas.isConnected || canvas.offsetParent === null || document.hidden) { running = false; return; }
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!still.matches) {
      clock += dt;
      if (!dragging) spin += dt * 0.12;
    }
    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    if (still.matches) { draw(); return; } // reduced motion: one still frame, redrawn on drag
    if (running) return;
    running = true; last = performance.now();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', e => { dragging = true; dragX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    spin += (e.clientX - dragX) * 0.01; dragX = e.clientX;
    if (still.matches) draw();
  });
  const drop = () => { dragging = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && canvas.isConnected) start(); });

  const api: LBModelsApi = {
    show(box, spec) {
      const k = [spec.id, spec.type, spec.state, spec.night, spec.evac, Math.round(spec.T), spec.F,
        clampN(Math.sqrt(spec.H) * 1.3, 0, 26), clampN(Math.sqrt(spec.pop) * 0.6, 0, 12), clampN(Math.sqrt(spec.queue) * 1.6, 0, 22)].join('|');
      if (k !== key) {
        if (spec.id !== key.split('|')[0]) spin = 0.5; // a new place starts from the same three-quarter view
        key = k;
        build(spec);
      }
      if (canvas.parentElement !== box) box.appendChild(canvas);
      size(box);
      start();
    },
    hide() { running = false; canvas.remove(); },
  };
  window.LBModels = api;
  document.documentElement.classList.add('has3d');
  document.dispatchEvent(new Event('lbmodels:ready'));
})();
