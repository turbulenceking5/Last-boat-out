// The 3D view: a painted ground texture, instanced buildings, trees and people, a few meshes for
// vehicles, ships and aircraft, and pooled effects (tracers, explosions, smoke). Reads G every frame.

const V = {
  renderer: null as unknown as TRenderer,
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(42, 1, 0.5, 400),
  sun: new THREE.DirectionalLight(0xfff1d6, 0.95),
  cam: { x: 46, z: 34, dist: 72, yaw: 0, pitch: 0.95 },
  dummy: new THREE.Object3D(),
  color: new THREE.Color(),
  mats: new Map<string, TMaterial>(),
};

function vmat(color: number, o: { glow?: number; opacity?: number; vertex?: boolean } = {}): TMaterial {
  const key = `${color}|${o.glow ?? 0}|${o.opacity ?? 1}|${o.vertex ? 1 : 0}`;
  let m = V.mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, vertexColors: false });
    if (o.glow) { m.emissive = new THREE.Color(o.glow); m.emissiveIntensity = 1; }
    if (o.opacity !== undefined && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    V.mats.set(key, m);
  }
  return m;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const GABLE = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
})();

function inst(geo: TGeometry, m: TMaterial, n: number, shadow = true): TInstanced {
  const im = new THREE.InstancedMesh(geo, m, Math.max(1, n));
  im.castShadow = shadow; im.receiveShadow = true;
  im.count = 0;
  im.frustumCulled = false;
  V.scene.add(im);
  return im;
}

function setInst(im: TInstanced, k: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, color?: number) {
  const d = V.dummy;
  d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.rotation.set(rx, ry, 0);
  d.updateMatrix();
  im.setMatrixAt(k, d.matrix);
  if (color !== undefined) im.setColorAt(k, V.color.setHex(color));
}

// ---- static city ----
const blockInst = new Map<number, Array<{ im: TInstanced; k: number; color: number }>>();

function paintGround(): TMesh {
  const px = 12, cv = document.createElement('canvas');
  cv.width = W * px; cv.height = SEA_Z * px;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#45494b'; g.fillRect(0, 0, cv.width, cv.height);
  for (const b of G.blocks) {
    const x = b.x0 * px, z = b.z0 * px, s = 6 * px;
    g.fillStyle = '#8d8a80'; g.fillRect(x - 4, z - 4, s + 8, s + 8); // pavement
    g.fillStyle = b.district === 'park' ? '#6f8a55' : b.district === 'base' ? '#8c8456' : b.district === 'industrial' || b.district === 'docks' ? '#6f6c64' : '#7b776c';
    g.fillRect(x, z, s, s);
    if (b.district === 'park') { g.strokeStyle = '#b9ae8c'; g.lineWidth = 5; g.beginPath(); g.moveTo(x, z + s / 2); g.quadraticCurveTo(x + s / 2, z, x + s, z + s / 2); g.moveTo(x + s / 2, z + s); g.lineTo(x + s / 2, z + s * 0.3); g.stroke(); }
    if (b.district === 'base') {
      g.strokeStyle = '#e4dfcf'; g.lineWidth = 3; g.beginPath(); g.arc(x + s * 0.5, z + s * 0.62, px * 1.3, 0, Math.PI * 2); g.stroke();
      g.font = `bold ${px * 1.4}px sans-serif`; g.fillStyle = '#e4dfcf'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', x + s * 0.5, z + s * 0.62);
    }
  }
  // lane markings down the middle of each road
  g.strokeStyle = 'rgba(230,220,180,.55)'; g.lineWidth = 1.5; g.setLineDash([px * 0.6, px * 0.6]);
  for (let k = 0; k <= W; k += 8) { g.beginPath(); g.moveTo((k + 1) * px, 0); g.lineTo((k + 1) * px, QUAY_Z * px); g.stroke(); }
  for (let k = 0; k <= QUAY_Z; k += 8) { g.beginPath(); g.moveTo(0, (k + 1) * px); g.lineTo(W * px, (k + 1) * px); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = '#9a958a'; g.fillRect(0, QUAY_Z * px, cv.width, (SEA_Z - QUAY_Z) * px); // the quay
  g.fillStyle = '#c9b45a'; g.fillRect(0, (SEA_Z - 0.25) * px, cv.width, 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, SEA_Z), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.rotation.x = -Math.PI / 2; m.position.set(W / 2, 0, SEA_Z / 2);
  m.receiveShadow = true;
  return m;
}

function buildCity() {
  V.scene.add(paintGround());
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), vmat(0x4f6f78));
  sea.rotation.x = -Math.PI / 2; sea.position.set(W / 2, -0.35, H / 2); sea.receiveShadow = true;
  V.scene.add(sea);
  const quayWall = new THREE.Mesh(UNIT_BOX, vmat(0x7e796f)); quayWall.scale.set(W, 0.35, 0.3); quayWall.position.set(W / 2, -0.35, SEA_Z + 0.15); V.scene.add(quayWall);
  const all = G.blocks.flatMap(b => b.buildings.map(bd => ({ b, bd })));
  const flats = all.filter(a => a.bd.kind !== 'house' && a.bd.kind !== 'tank');
  const bodies = inst(UNIT_BOX, vmat(0xffffff), flats.length + all.filter(a => a.bd.kind === 'house').length);
  const roofs = inst(UNIT_BOX, vmat(0xffffff), flats.length);
  const gables = inst(GABLE, vmat(0xffffff), all.length);
  const tanks = inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0), vmat(0xffffff), all.length);
  let bandN = 0;
  for (const a of flats) if (a.bd.h >= 2) bandN += Math.floor(a.bd.h / 1.1);
  const bands = inst(UNIT_BOX, vmat(0x2b3438), bandN, false);
  const note = (b: Block, im: TInstanced, k: number, color: number) => { if (!blockInst.has(b.id)) blockInst.set(b.id, []); blockInst.get(b.id)!.push({ im, k, color }); };
  for (const { b, bd } of all) {
    if (bd.kind === 'tank') {
      const k = tanks.count++; setInst(tanks, k, bd.x, 0, bd.z, bd.w, bd.h, bd.d, 0, 0, bd.color); note(b, tanks, k, bd.color);
      continue;
    }
    const k = bodies.count++; setInst(bodies, k, bd.x, 0, bd.z, bd.w, bd.h, bd.d, 0, 0, bd.color); note(b, bodies, k, bd.color);
    if (bd.kind === 'house') {
      const g = gables.count++; setInst(gables, g, bd.x, bd.h, bd.z, bd.d * 1.1, 0.8, bd.w * 1.08, Math.PI / 2, 0, bd.roof); note(b, gables, g, bd.roof);
    } else {
      const r = roofs.count++; setInst(roofs, r, bd.x, bd.h, bd.z, bd.w + 0.12, 0.14, bd.d + 0.12, 0, 0, bd.roof); note(b, roofs, r, bd.roof);
      if (bd.h >= 2) for (let f = 0; f < Math.floor(bd.h / 1.1); f++) setInst(bands, bands.count++, bd.x, 0.5 + f * 1.1, bd.z, bd.w + 0.04, 0.32, bd.d + 0.04);
    }
  }
  for (const im of [bodies, roofs, gables, tanks, bands]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  const trunks = inst(new THREE.CylinderGeometry(0.08, 0.1, 1, 5).translate(0, 0.5, 0), vmat(0x6b5236), trees.length);
  const crowns = inst(new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0), vmat(0x5f7a48), trees.length);
  for (const [x, z, s] of trees) {
    setInst(trunks, trunks.count++, x, 0, z, s, s * 0.5, s);
    setInst(crowns, crowns.count++, x, s * 0.35, z, s * 1.1, s * 1.5, s * 1.1, x * 7);
  }
  // Fort Aldermoor: sandbags round the helipad and a flag
  const base = G.blocks.find(b => b.district === 'base')!;
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    const m = new THREE.Mesh(UNIT_BOX, vmat(0xbfa978)); m.scale.set(0.5, 0.3, 0.25);
    m.position.set(base.x0 + 3 + Math.cos(a) * 2.3, 0, base.z0 + 3.7 + Math.sin(a) * 2.3); m.rotation.y = -a; m.castShadow = true; V.scene.add(m);
  }
}

function paintBlocks() {
  for (const b of G.blocks) {
    const list = blockInst.get(b.id);
    if (!list) continue;
    for (const { im, k, color } of list) {
      V.color.setHex(color);
      if (b.fallen) V.color.multiplyScalar(0.32);
      im.setColorAt(k, V.color);
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

// ---- people ----
const BODY = new THREE.CylinderGeometry(0.13, 0.17, 0.5, 6).translate(0, 0.25, 0);
const HEAD = new THREE.SphereGeometry(0.12, 6, 4).translate(0, 0.63, 0);
const HELMET = new THREE.SphereGeometry(0.15, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.66, 0);
let zBody: TInstanced, zHead: TInstanced, cBody: TInstanced, cHead: TInstanced, sBody: TInstanced, sHelm: TInstanced;
const MAX_SOLDIERS = 400;

function buildPeople() {
  zBody = inst(BODY, vmat(0xffffff), MAX_ZOMBIES, false); zHead = inst(HEAD, vmat(0x8d9a6a), MAX_ZOMBIES, false);
  cBody = inst(BODY, vmat(0xffffff), MAX_CIVS, false); cHead = inst(HEAD, vmat(0xd9b08c), MAX_CIVS, false);
  sBody = inst(BODY, vmat(0xffffff), MAX_SOLDIERS, false); sHelm = inst(HELMET, vmat(0xffffff), MAX_SOLDIERS, false);
}

const PS = 1.5; // people are drawn larger than life so they read from the air
function drawPeople(time: number) {
  let n = 0;
  for (const z of G.zeds) {
    if (n >= MAX_ZOMBIES) break;
    // the newly bitten lie on the ground until they rise; then a shambling lean and bob
    // brutes are hulking; runners lean hard into a sprint
    const down = z.rise > 0, runner = z.kind === ZedKind.Runner, s = z.kind === ZedKind.Brute ? PS * 1.6 : PS;
    const bob = down ? 0.12 : Math.abs(Math.sin(time * (runner ? 11 : 4) + z.ph)) * (runner ? 0.09 : 0.05);
    const lean = down ? Math.PI / 2 : runner ? 0.6 : 0.25 + Math.sin(z.ph) * 0.1;
    setInst(zBody, n, z.x, bob, z.z, s * (z.kind === ZedKind.Brute ? 1.25 : 1), s, s, z.hd, lean, z.kind === ZedKind.Brute ? 0x4a3a33 : z.shirt);
    setInst(zHead, n, z.x, bob, z.z, s, s, s, z.hd, lean);
    n++;
  }
  zBody.count = zHead.count = n;
  n = 0;
  for (const c of G.civs) {
    if (n >= MAX_CIVS) break;
    const bob = Math.abs(Math.sin(time * 9 + c.ph)) * 0.07;
    setInst(cBody, n, c.x, bob, c.z, PS, PS, PS, c.hd, 0.12, c.color);
    setInst(cHead, n, c.x, bob, c.z, PS, PS, PS, c.hd, 0.12);
    n++;
  }
  // survivors waiting on a rooftop mission, huddled round their flare
  for (const m of G.missions) {
    if (m.kind !== 'survivors') continue;
    for (let q = 0; q < m.people / PER_AGENT && n < MAX_CIVS; q++, n++) {
      const a = q * 2.4, r = 0.6 + Math.floor(Math.sqrt(q)) * 0.35, wave = Math.sin(time * 6 + q) * 0.15;
      setInst(cBody, n, m.x + Math.cos(a) * r, Math.max(0, wave) * 0.3, m.z + Math.sin(a) * r, PS, PS, PS, a + Math.PI, 0, CIV_COLORS[q % CIV_COLORS.length]);
      setInst(cHead, n, m.x + Math.cos(a) * r, Math.max(0, wave) * 0.3, m.z + Math.sin(a) * r, PS, PS, PS, a + Math.PI);
    }
  }
  // the crowds waiting at evacuation points, packed in rings round the marker
  for (const e of G.evacs) {
    const k = Math.min(e.kind === 'harbor' ? 160 : 40, Math.ceil(e.queue / PER_AGENT));
    for (let q = 0; q < k && n < MAX_CIVS; q++, n++) {
      const ring = Math.floor(Math.sqrt(q)), a = q * 2.4, r = 0.9 + ring * 0.42;
      const x = e.x + Math.cos(a) * r * (e.kind === 'harbor' ? 1.6 : 1), z = e.z + Math.sin(a) * r * (e.kind === 'harbor' ? 0.5 : 1);
      const color = CIV_COLORS[q % CIV_COLORS.length], bob = Math.max(0, Math.sin(time * 2 + q)) * 0.03;
      setInst(cBody, n, x, bob, z, PS, PS, PS, a, 0, color);
      setInst(cHead, n, x, bob, z, PS, PS, PS, a);
    }
  }
  cBody.count = cHead.count = n;
  n = 0;
  for (const u of G.units) {
    if (UNITS[u.kind].vehicle) continue;
    const body = u.kind === 'militia' ? 0x6f6a58 : 0x3d5a78, helm = u.kind === 'militia' ? 0x4a3f33 : 0x55633a;
    for (const m of u.members) {
      if (n >= MAX_SOLDIERS) break;
      setInst(sBody, n, m.x, 0, m.z, PS, PS, PS, m.hd, 0, body);
      setInst(sHelm, n, m.x, 0, m.z, PS, PS, PS, m.hd, 0, helm);
      n++;
    }
  }
  sBody.count = sHelm.count = n;
  for (const im of [zBody, zHead, cBody, cHead, sBody, sHelm]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
}

// ---- vehicles, ships, aircraft ----
function part(g: TObject3D, color: number, w: number, h: number, d: number, x = 0, y = 0, z = 0): TMesh {
  const m = new THREE.Mesh(UNIT_BOX, vmat(color)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}

function makeVehicle(kind: UnitKind): TGroup {
  const g = new THREE.Group();
  if (kind === 'tank') {
    part(g, 0x2f3329, 1.3, 0.3, 2.1);
    part(g, 0x55633a, 1.2, 0.3, 1.9, 0, 0.25);
    const turret = new THREE.Group(); turret.name = 'turret'; turret.position.y = 0.55; g.add(turret);
    part(turret, 0x55633a, 0.8, 0.3, 0.9);
    part(turret, 0x3f4a2c, 0.12, 0.12, 1.3, 0, 0.1, 0.9);
  } else {
    part(g, 0x2f3329, 1.1, 0.25, 1.9, 0, 0.05);
    part(g, 0x5d6b45, 1.05, 0.55, 1.8, 0, 0.25);
    part(g, 0x2b3438, 1.0, 0.12, 0.4, 0, 0.6, 0.55);
    const turret = new THREE.Group(); turret.name = 'turret'; turret.position.y = 0.8; g.add(turret);
    part(turret, 0x4a5638, 0.35, 0.18, 0.35);
    part(turret, 0x222, 0.06, 0.06, 0.5, 0, 0.06, 0.3);
  }
  g.scale.setScalar(1.1);
  V.scene.add(g);
  return g;
}

function makeShip(): TGroup {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.4, -6); s.lineTo(1.4, -6); s.lineTo(1.4, 4.5); s.lineTo(0, 6.5); s.lineTo(-1.4, 4.5); s.lineTo(-1.4, -6);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.6, 0), vmat(0x2f3a40));
  hull.castShadow = true; g.add(hull);
  part(g, 0xc4432f, 2.9, 0.15, 12.2, 0, -0.4, 0.2);
  part(g, 0xeeeae0, 2.4, 1.6, 2.6, 0, 1.0, -4.0);
  part(g, 0xeeeae0, 1.8, 0.8, 1.8, 0, 2.6, -4.0);
  part(g, 0x2b2b2b, 0.7, 1.4, 0.7, 0, 1.0, -1.8);
  part(g, 0xe2a23a, 0.72, 0.3, 0.72, 0, 2.1, -1.8);
  for (const z of [0.6, 2.4]) part(g, 0x3d5a78, 2.2, 0.9, 1.5, 0, 1.0, z);
  g.rotation.y = Math.PI / 2;
  V.scene.add(g);
  return g;
}

function makeBus(): TGroup {
  const g = new THREE.Group();
  part(g, 0xe2a23a, 0.9, 0.8, 2.4, 0, 0.12);
  part(g, 0x2b3438, 0.92, 0.22, 2.2, 0, 0.6);
  V.scene.add(g); return g;
}

function makeEvacMarker(kind: Evac['kind']): TGroup {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(kind === 'harbor' ? 2.4 : 1.5, 0.08, 6, 32).rotateX(Math.PI / 2), vmat(0x8fb27a, { glow: 0x5f8f4a }));
  ring.position.y = 0.05; g.add(ring);
  const pole = part(g, 0xd8d2bf, 0.08, 2.4, 0.08);
  void pole;
  const flag = part(g, 0x8fb27a, 0.7, 0.4, 0.04, 0.35, 2.0);
  flag.name = 'flag';
  V.scene.add(g); return g;
}

function makeHeli(): TGroup {
  const g = new THREE.Group();
  part(g, 0x3f4a3a, 0.8, 0.7, 2.0, 0, -0.35);
  part(g, 0x3f4a3a, 0.2, 0.2, 2.0, 0, 0, -1.8);
  part(g, 0x2b3438, 0.7, 0.35, 0.6, 0, -0.1, 0.75);
  const rotor = part(g, 0x222222, 4.2, 0.04, 0.2, 0, 0.45); rotor.name = 'rotor';
  V.scene.add(g); return g;
}

function makeJet(): TGroup {
  const g = new THREE.Group();
  part(g, 0x6d767a, 0.45, 0.35, 2.6, 0, 0, -0.2);
  part(g, 0x5d666a, 2.6, 0.08, 0.9, 0, 0.1, -0.3);
  part(g, 0x5d666a, 0.08, 0.6, 0.5, 0, 0.3, -1.3);
  V.scene.add(g); return g;
}

function makeBeacon(kind: Mission['kind']): TGroup {
  const g = new THREE.Group();
  const color = kind === 'crate' ? 0xe2a23a : 0xff6a3a;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 22, 12, 1, true).translate(0, 11, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.name = 'beam'; g.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.07, 4, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
  ring.name = 'ring'; ring.position.y = 0.06; g.add(ring);
  if (kind === 'crate') {
    part(g, 0x8a6b44, 0.9, 0.7, 0.9);
    part(g, 0x55633a, 0.95, 0.12, 0.95, 0, 0.35);
  } else {
    const flare = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb08a }));
    flare.name = 'flare'; flare.position.y = 1.8; g.add(flare);
  }
  V.scene.add(g);
  return g;
}
const beacons = new Map<number, TGroup>();
function drawBeacons(time: number) {
  const live = new Set<number>();
  for (const m of G.missions) {
    live.add(m.id);
    let g = beacons.get(m.id);
    if (!g) { g = makeBeacon(m.kind); beacons.set(m.id, g); g.position.set(m.x, 0, m.z); }
    const urgent = m.t < 15, pulse = 1 + Math.sin(time * (urgent ? 10 : 4)) * 0.15;
    const ring = g.getObjectByName('ring'); if (ring) ring.scale.setScalar(pulse);
    const beam = g.getObjectByName('beam') as TMesh | undefined;
    if (beam) (beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.max(0, Math.sin(time * 3)) * 0.12;
    const flare = g.getObjectByName('flare'); if (flare) flare.position.y = 1.8 + Math.sin(time * 2) * 0.3;
  }
  for (const [id, g] of beacons) if (!live.has(id)) { V.scene.remove(g); beacons.delete(id); }
}

const vehicles = new Map<number, TGroup>();
const evacMarks = new Map<number, { mark: TGroup; vehicle: TGroup }>();
const helis = new Map<Gunship, TGroup>();
const jets = new Map<Strike, TGroup>();

function drawVehicles(time: number) {
  const live = new Set<number>();
  for (const u of G.units) {
    if (!UNITS[u.kind].vehicle) continue;
    live.add(u.id);
    let g = vehicles.get(u.id);
    if (!g) { g = makeVehicle(u.kind); vehicles.set(u.id, g); }
    g.position.set(u.x, 0, u.z);
    g.rotation.y += (((u.hd - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.15;
    const tur = g.getObjectByName('turret');
    if (tur && u.aim) tur.rotation.y = Math.atan2(u.aim.x - u.x, u.aim.z - u.z) - g.rotation.y;
  }
  for (const [id, g] of vehicles) if (!live.has(id)) { V.scene.remove(g); vehicles.delete(id); boomAt(g.position.x, g.position.z, 2.5); }

  for (const e of G.evacs) {
    let m = evacMarks.get(e.id);
    if (!m) { m = { mark: makeEvacMarker(e.kind), vehicle: e.kind === 'harbor' ? makeShip() : makeBus() }; evacMarks.set(e.id, m); m.mark.position.set(e.x, 0, e.z); }
    const flag = m.mark.getObjectByName('flag'); if (flag) flag.rotation.y = Math.sin(time * 2 + e.id) * 0.4;
    // the ship or bus pulls away when it departs and comes back before the next run
    const T = Math.min(6, e.interval * 0.3), since = e.interval - e.timer;
    const away = !e.departed ? 0 : since < T ? since / T : since < 2 * T ? 1 - (since - T) / T : 0;
    if (e.kind === 'harbor') m.vehicle.position.set(e.x + 2, -0.25 + Math.sin(time * 0.9) * 0.05, SEA_Z + 2.4 + away * 30);
    else { m.vehicle.position.set(e.x + 1.4 + away * 20, 0, e.z); m.vehicle.visible = away < 0.95; }
  }

  const liveH = new Set<Gunship>();
  for (const s of G.gunships) {
    liveH.add(s);
    let h = helis.get(s); if (!h) { h = makeHeli(); helis.set(s, h); }
    h.position.set(s.hx, 6, s.hz); h.rotation.y = -s.ang; h.rotation.z = 0.15;
    const r = h.getObjectByName('rotor'); if (r) r.rotation.y = time * 25;
  }
  for (const [s, h] of helis) if (!liveH.has(s)) { V.scene.remove(h); helis.delete(s); }

  const liveJ = new Set<Strike>();
  for (const s of G.strikes) {
    if (s.t > 1.5) continue;
    liveJ.add(s);
    let j = jets.get(s); if (!j) { j = makeJet(); jets.set(s, j); }
    const along = (1.5 - s.t) * 22 - 22, dx = Math.cos(s.dir + Math.PI / 2), dz = Math.sin(s.dir + Math.PI / 2);
    j.position.set(s.x + dx * along, 9, s.z + dz * along);
    j.rotation.y = Math.atan2(dx, dz);
  }
  for (const [s, j] of jets) if (!liveJ.has(s)) { V.scene.remove(j); jets.delete(s); }
}

// ---- effects ----
const MAX_TRACERS = 800;
const tracerGeo = new THREE.BufferGeometry();
const tracerPos = new Float32Array(MAX_TRACERS * 6), tracerCol = new Float32Array(MAX_TRACERS * 6);
tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
tracers.frustumCulled = false;

function drawTracers() {
  let n = 0;
  for (const t of G.tracers) {
    if (n >= MAX_TRACERS) break;
    V.color.setHex(t.color);
    const o = n * 6;
    tracerPos[o] = t.x1; tracerPos[o + 1] = t.y1; tracerPos[o + 2] = t.z1;
    tracerPos[o + 3] = t.x2; tracerPos[o + 4] = 0.4; tracerPos[o + 5] = t.z2;
    for (let k = 0; k < 2; k++) { tracerCol[o + k * 3] = V.color.r; tracerCol[o + k * 3 + 1] = V.color.g; tracerCol[o + k * 3 + 2] = V.color.b * 0.7; }
    n++;
  }
  tracerGeo.setDrawRange(0, n * 2);
  tracerGeo.attributes.position.needsUpdate = true;
  tracerGeo.attributes.color.needsUpdate = true;
}

const boomPool: TMesh[] = [];
const extraBooms: Boom[] = [];
function boomAt(x: number, z: number, size: number) { extraBooms.push({ x, z, t: 0.9, size }); }
function drawBooms(dt: number) {
  for (const b of extraBooms) b.t -= dt;
  for (let k = extraBooms.length - 1; k >= 0; k--) if (extraBooms[k].t <= 0) extraBooms.splice(k, 1);
  const all = G.booms.concat(extraBooms);
  while (boomPool.length < all.length) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    V.scene.add(m); boomPool.push(m);
  }
  boomPool.forEach((m, k) => {
    const b = all[k];
    m.visible = !!b;
    if (!b) return;
    const life = 1 - b.t / (b.size > 2 ? 0.9 : 0.5);
    m.position.set(b.x, 0.3 + life * 0.8, b.z);
    m.scale.setScalar(b.size * (0.3 + life * 0.9));
    (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - life) * 0.85;
  });
}

// smoke over overrun blocks
let smoke: TInstanced;
const SMOKE_PER = 6;
function drawSmoke(time: number) {
  let n = 0;
  for (const b of G.blocks) {
    if (!b.fallen) continue;
    for (let k = 0; k < SMOKE_PER && n < smoke.instanceMatrix.count; k++) {
      const u = ((time * 0.08 + k / SMOKE_PER + b.id * 0.37) % 1), s = 0.8 + u * 2.4;
      setInst(smoke, n++, b.x0 + 3 + Math.sin(b.id + k) * 1.2 + u * 2, 2 + u * 9, b.z0 + 3 + Math.cos(b.id * 3 + k) * 1.2, s, s, s);
    }
  }
  smoke.count = n;
  smoke.instanceMatrix.needsUpdate = true;
}

// ---- selection and placement markers ----
const selRings: TMesh[] = [];
const ringGeo = new THREE.TorusGeometry(1, 0.06, 4, 28).rotateX(Math.PI / 2);
const ghost = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 4, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fb27a, transparent: true, opacity: 0.9, depthWrite: false }));
const goalMark = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 4, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe2a23a }));
const blockMark = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: 0xe2a23a }));

function drawMarkers(sel: Unit[], selBlock: Block | null, place: { x: number; z: number; r: number; ok: boolean } | null, time: number) {
  while (selRings.length < sel.length) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe2a23a })); V.scene.add(m); selRings.push(m); }
  selRings.forEach((m, k) => {
    const u = sel[k]; m.visible = !!u; if (!u) return;
    m.position.set(u.x, 0.06, u.z); m.scale.setScalar(UNITS[u.kind].vehicle ? 1.6 : 1.3);
  });
  const g = sel.find(u => u.goal >= 0);
  goalMark.visible = !!g;
  if (g) { goalMark.position.set(ci(g.goal) + 0.5, 0.06, cj(g.goal) + 0.5); goalMark.scale.setScalar(1 + Math.sin(time * 6) * 0.15); }
  blockMark.visible = !!selBlock;
  if (selBlock) {
    const h = Math.max(1.5, ...selBlock.buildings.map(b => b.h)) + 0.3;
    blockMark.position.set(selBlock.x0 + 3, 0, selBlock.z0 + 3); blockMark.scale.set(6.4, h, 6.4);
  }
  ghost.visible = !!place;
  if (place) {
    ghost.position.set(place.x, 0.1, place.z); ghost.scale.setScalar(place.r);
    (ghost.material as THREE.MeshBasicMaterial).color.setHex(place.ok ? 0x8fb27a : 0xc4432f);
  }
}

// ---- camera ----
function placeCamera() {
  const c = V.cam, h = Math.sin(c.pitch) * c.dist, back = Math.cos(c.pitch) * c.dist;
  V.camera.position.set(c.x - Math.sin(c.yaw) * back, h, c.z + Math.cos(c.yaw) * back);
  V.camera.lookAt(c.x, 0, c.z);
  if (G.shake > 0) { const k = G.shake * G.shake * 0.5; V.camera.position.x += (Math.random() - 0.5) * k; V.camera.position.y += (Math.random() - 0.5) * k; }
  // keep the shadow map centred on what you are looking at
  V.sun.position.set(c.x + 18, 34, c.z + 10); V.sun.target.position.set(c.x, 0, c.z); V.sun.target.updateMatrixWorld();
  const s = Math.max(30, c.dist * 0.9);
  Object.assign(V.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  V.sun.shadow.camera.updateProjectionMatrix();
}

function panCamera(dxPx: number, dyPx: number) {
  const c = V.cam, k = c.dist / (V.renderer.domElement.clientHeight || 600) * 1.1;
  const dx = -dxPx * k, dz = -dyPx * k / Math.sin(c.pitch);
  c.x = clamp(c.x + dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), 0, W);
  c.z = clamp(c.z + dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw), 0, H);
}

function zoomCamera(f: number) { V.cam.dist = clamp(V.cam.dist * f, 14, 95); }

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPt = new THREE.Vector3();
function screenToGround(clientX: number, clientY: number): { x: number; z: number } | null {
  const r = V.renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, V.camera);
  return ray.ray.intersectPlane(groundPlane, hitPt) ? { x: hitPt.x, z: hitPt.z } : null;
}

function initView(host: HTMLElement): boolean {
  try { V.renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return false; }
  const r = V.renderer;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(r.domElement);
  V.scene.background = new THREE.Color(0x1c2326);
  V.scene.fog = new THREE.Fog(0x1c2326, 90, 190);
  V.scene.add(new THREE.HemisphereLight(0xfff5e0, 0x4a4a40, 0.6));
  V.sun.castShadow = true; V.sun.shadow.mapSize.set(2048, 2048); V.sun.shadow.bias = -0.0015;
  V.scene.add(V.sun, V.sun.target, tracers, ghost, goalMark, blockMark);
  smoke = inst(new THREE.SphereGeometry(0.5, 7, 5), vmat(0x34312d, { opacity: 0.5 }), 63 * SMOKE_PER, false);
  buildCity();
  buildPeople();
  paintBlocks();
  resizeView();
  return true;
}

function resizeView() {
  const el = V.renderer.domElement.parentElement!, w = el.clientWidth, h = el.clientHeight;
  V.renderer.setSize(w, h);
  V.camera.aspect = w / Math.max(1, h);
  V.camera.updateProjectionMatrix();
}

function drawFrame(time: number, dt: number, sel: Unit[], selBlock: Block | null, place: { x: number; z: number; r: number; ok: boolean } | null) {
  if (G.changed) { paintBlocks(); G.changed = false; }
  drawPeople(time);
  drawVehicles(time);
  drawBeacons(time);
  drawTracers();
  drawBooms(dt);
  drawSmoke(time);
  drawMarkers(sel, selBlock, place, time);
  placeCamera();
  V.renderer.render(V.scene, V.camera);
}
