// Effects for abilities, ranks and feedback, kept apart from view.ts: floating text over the map
// (money, people saved, unit barks), rank stars over veteran units, grenades and shells in flight,
// the flare over an APC using its siren, and a ring round a block being held. drawFx() runs once a
// frame, after the camera is placed. The simulation records what to show (G.pops, G.shells,
// Unit.lureT, G.missions); this file only draws it.

const FX = {
  game: null as Game | null,           // a new game clears everything
  layer: null as HTMLElement | null,
  pops: [] as Array<{ el: HTMLElement; x: number; z: number; born: number; life: number }>,
  tags: new Map<number, HTMLElement>(),
  shells: [] as TMesh[],
  flares: [] as TMesh[],
  lureRings: [] as TMesh[],
  holdRings: [] as TMesh[],
  v: new THREE.Vector3(),
};
const POP_LIFE: Record<Pop['kind'], number> = { good: 2.4, bad: 2.6, key: 2.8, say: 2.6, money: 2.2 };

/** Screen position of a world point, or null when it is behind the camera or off screen. */
function fxProject(x: number, y: number, z: number): [number, number] | null {
  const el = V.renderer.domElement, w = el.clientWidth, h = el.clientHeight;
  FX.v.set(x, y, z).project(V.camera);
  if (FX.v.z > 1 || FX.v.x < -1.1 || FX.v.x > 1.1 || FX.v.y < -1.1 || FX.v.y > 1.1) return null;
  return [(FX.v.x + 1) / 2 * w, (1 - FX.v.y) / 2 * h];
}

function fxPlace(el: HTMLElement, p: [number, number] | null) {
  if (!p) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = '';
  el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px) translate(-50%, -100%)`;
}

function fxRing(color: number): TMesh {
  const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 4, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
  V.scene.add(r);
  return r;
}

function drawFx(time: number) {
  if (!FX.layer) {
    FX.layer = document.getElementById('fx');
    if (!FX.layer) return;
  }
  if (FX.game !== G) {
    FX.game = G;
    for (const p of FX.pops) p.el.remove();
    FX.pops.length = 0;
    for (const el of FX.tags.values()) el.remove();
    FX.tags.clear();
  }
  const now = performance.now() / 1000;

  // floating text: a handful at once, rising and fading
  for (const p of G.pops) {
    const el = document.createElement('div');
    el.className = `pop ${p.kind}`;
    el.textContent = p.kind === 'say' ? `“${p.text}”` : p.text;
    FX.layer.appendChild(el);
    FX.pops.push({ el, x: p.x, z: p.z, born: now, life: POP_LIFE[p.kind] });
  }
  G.pops.length = 0;
  while (FX.pops.length > 18) FX.pops.shift()!.el.remove();
  for (let k = FX.pops.length - 1; k >= 0; k--) {
    const p = FX.pops[k], age = now - p.born;
    if (age > p.life) { p.el.remove(); FX.pops.splice(k, 1); continue; }
    fxPlace(p.el, fxProject(p.x, 2.2 + age * 0.9, p.z));
    p.el.style.opacity = String(Math.min(1, (1 - age / p.life) * 2.2));
  }

  // rank stars over veteran units
  const live = new Set<number>();
  for (const u of G.units) {
    if (!u.rank) continue;
    live.add(u.id);
    let el = FX.tags.get(u.id);
    if (!el) { el = document.createElement('div'); el.className = 'tag-rank'; FX.layer.appendChild(el); FX.tags.set(u.id, el); }
    const t = '★'.repeat(u.rank);
    if (el.textContent !== t) { el.textContent = t; el.classList.toggle('elite', u.rank > 1); }
    fxPlace(el, fxProject(u.x, UNITS[u.kind].vehicle ? 1.9 : 1.5, u.z));
  }
  for (const [id, el] of FX.tags) if (!live.has(id)) { el.remove(); FX.tags.delete(id); }

  // grenades, molotovs and shells in flight, on an arc
  while (FX.shells.length < G.shells.length) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: 0x2c3326 }));
    V.scene.add(m); FX.shells.push(m);
  }
  FX.shells.forEach((m, k) => {
    const s = G.shells[k], p = s ? 1 - s.t / s.dur : -1;
    m.visible = p >= 0 && p <= 1;
    if (!m.visible) return;
    m.position.set(s.sx + (s.x - s.sx) * p, 0.7 + Math.sin(p * Math.PI) * (s.big ? 1.6 : 2.6), s.sz + (s.z - s.sz) * p);
    m.scale.setScalar(s.big ? 1.3 : 1);
    (m.material as THREE.MeshBasicMaterial).color.setHex(s.big ? 0xffd27a : s.dmg < 4 ? 0xff8a3a : 0x2c3326);
  });

  // an APC's flare: a red light pulsing over it and a ring spreading out along the streets
  const lures = G.units.filter(u => u.lureT > 0);
  while (FX.flares.length < lures.length) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    V.scene.add(f); FX.flares.push(f); FX.lureRings.push(fxRing(0xff5a3a));
  }
  FX.flares.forEach((f, k) => {
    const u = lures[k], r = FX.lureRings[k];
    f.visible = r.visible = !!u;
    if (!u) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 14), spread = (time * 0.8) % 1;
    f.position.set(u.x, 2.6 + Math.sin(time * 3) * 0.2, u.z);
    f.scale.setScalar(1 + pulse * 0.8);
    (f.material as THREE.MeshBasicMaterial).opacity = 0.6 + pulse * 0.4;
    r.position.set(u.x, 0.08, u.z); r.scale.setScalar(2 + spread * 14);
    (r.material as THREE.MeshBasicMaterial).opacity = (1 - spread) * 0.7;
  });

  // a block being held: a ring round it, green while a unit is there
  const holds = G.missions.filter(m => m.kind === 'hold');
  while (FX.holdRings.length < holds.length) FX.holdRings.push(fxRing(0x8fb27a));
  FX.holdRings.forEach((r, k) => {
    const m = holds[k];
    r.visible = !!m;
    if (!m) return;
    const held = G.units.some(u => dist2(u.x, u.z, m.x, m.z) < 6.5 * 6.5), mat = r.material as THREE.MeshBasicMaterial;
    r.position.set(m.x, 0.08, m.z); r.scale.setScalar(6.5);
    mat.color.setHex(held ? 0x8fb27a : 0xe2a23a);
    mat.opacity = held ? 0.85 : 0.35 + 0.3 * Math.abs(Math.sin(time * 3));
  });
}
