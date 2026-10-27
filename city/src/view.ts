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
// Each kind of figure is one merged low-poly geometry with its colours baked in per vertex, drawn
// as one instanced mesh: 3 kinds of infected, 3 of civilians and 2 of soldiers, so 8 draw calls
// however many people are on screen. The instance colour tints only the parts marked as clothing
// (shirt, coat, uniform). Arms and legs swing in the vertex shader from a per-instance phase,
// amplitude and frequency, so walking costs the CPU nothing beyond writing three numbers.

/** One piece of a figure: geometry already in place, its colour, whether the instance colour
 *  tints it, and how it swings: swing scales the stride angle (+ left leg, - right leg, arms
 *  opposite), about a hinge at height pivot. lod 1 keeps a part out of the distant version,
 *  lod 2 puts it only in the distant version. noTop drops faces pointing up (hidden in the body). */
interface FigPart { g: TGeometry; c: number; tint?: number; swing?: number; pivot?: number; lod?: 0 | 1 | 2; noTop?: boolean }

function figureGeo(parts: FigPart[], far: boolean): TGeometry {
  // Indexed, with shared corners merged: flat shading takes its normals from the screen, so a box
  // needs only 8 vertices. Faces that point straight down are never seen from the sky and are dropped.
  const pos: number[] = [], col: number[] = [], tint: number[] = [], limb: number[] = [], index: number[] = [];
  const seen = new Map<string, number>(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (const p of parts) {
    if ((p.lod === 1 && far) || (p.lod === 2 && !far)) continue;
    const g = p.g, a = g.getAttribute('position') as THREE.BufferAttribute;
    const ix = g.index ? Array.from(g.index.array) : [...Array(a.count).keys()];
    const r = ((p.c >> 16) & 255) / 255, gr = ((p.c >> 8) & 255) / 255, b = (p.c & 255) / 255;
    const swing = far ? 0 : p.swing ?? 0;
    const vert = (i: number) => {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i), key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)},${p.c},${p.tint ?? 0},${swing}`;
      let v = seen.get(key);
      if (v === undefined) {
        v = pos.length / 3; seen.set(key, v);
        pos.push(x, y, z); col.push(r, gr, b); tint.push(p.tint ?? 0); limb.push(swing, p.pivot ?? 0);
      }
      return v;
    };
    for (let t = 0; t < ix.length; t += 3) {
      va.fromBufferAttribute(a, ix[t]); vb.fromBufferAttribute(a, ix[t + 1]); vc.fromBufferAttribute(a, ix[t + 2]);
      vb.sub(va); vc.sub(va); vb.cross(vc);
      if (vb.lengthSq() < 1e-12) continue;
      const ny = vb.normalize().y;
      if (ny < -0.8 || (p.noTop && ny > 0.8)) continue;
      index.push(vert(ix[t]), vert(ix[t + 1]), vert(ix[t + 2]));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setIndex(index);
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  out.setAttribute('aLimb', new THREE.Float32BufferAttribute(limb, 2));
  out.computeVertexNormals();
  return out;
}

// Small geometry makers for figure parts. Limbs hang from (x, pivot, z) and can be posed with rx
// (negative raises them forward, toward +z, which is where every figure faces).
const fBox = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) =>
  new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
const fLimb = (w: number, len: number, d: number, x: number, pivot: number, z: number, rx = 0) =>
  new THREE.BoxGeometry(w, len, d).translate(0, -len / 2, 0).rotateX(rx).translate(x, pivot, z);
const fCyl = (rt: number, rb: number, h: number, y: number, seg = 5, sz = 1, z = 0) =>
  new THREE.CylinderGeometry(rt, rb, h, seg).scale(1, 1, sz).translate(0, y + h / 2, z);
/** A five-sided head: hair (or a helmet) on top down to angle cut, face below. */
const fHead = (r: number, y: number, z: number, skin: number, top: number, cut = 0.45, lod: 0 | 1 = 0): FigPart[] => [
  { g: new THREE.SphereGeometry(r, 5, 1, 0, Math.PI * 2, 0, Math.PI * cut).translate(0, y, z), c: top, lod },
  { g: new THREE.SphereGeometry(r, 5, 2, 0, Math.PI * 2, Math.PI * cut, Math.PI * (1 - cut)).translate(0, y, z), c: skin, lod },
];

const SKIN = 0xd9b08c, ZSKIN = 0x8d9a6a, BLOOD = 0x7a2a22, WHITE = 0xffffff;
/** Two legs from the hip; in the distant version, one block. */
const legs = (c: number, hip: number, len: number, w: number, gap: number, swing: number): FigPart[] => [
  { g: fLimb(w, len, w * 1.15, -gap, hip, 0), c, swing, pivot: hip, lod: 1, noTop: true },
  { g: fLimb(w, len, w * 1.15, gap, hip, 0), c, swing: -swing, pivot: hip, lod: 1, noTop: true },
  { g: fLimb(gap * 2 + w, len, w * 1.15, 0, hip, 0), c, lod: 2, noTop: true },
];
const arms = (c: number, sh: number, len: number, w: number, gap: number, swing: number, rx = 0, tint = 0, z = 0, lod: 0 | 1 = 1): FigPart[] => [
  { g: fLimb(w, len, w, -gap, sh, z, rx), c, tint, swing: -swing, pivot: sh, lod, noTop: rx === 0 },
  { g: fLimb(w, len, w, gap, sh, z, rx), c, tint, swing, pivot: sh, lod, noTop: rx === 0 },
];

/** The figures, built once, each near and far. Heights are before the 1.5x people scale: a grown-up is about 0.8. */
function buildFigures() {
  const kinds: Record<string, FigPart[]> = {
    // the infected: hunched shamblers reaching forward, lean runners with their arms flung back,
    // and brutes, broad and stooped with huge arms that hang to their knees
    walker: [
      ...legs(0x4a4438, 0.3, 0.3, 0.085, 0.06, 0.55),
      { g: fCyl(0.13, 0.11, 0.28, 0.28, 5, 0.75), c: WHITE, tint: 1 },
      ...arms(ZSKIN, 0.53, 0.27, 0.06, 0.15, 0.25, -1.35, 0, 0, 0),
      ...fHead(0.105, 0.64, 0.05, ZSKIN, 0x5f6a48, 0.2),
    ],
    runner: [
      ...legs(0x3f3a33, 0.32, 0.32, 0.075, 0.055, 1.0),
      { g: fCyl(0.105, 0.09, 0.27, 0.3, 5, 0.7), c: WHITE, tint: 1 },
      ...arms(ZSKIN, 0.54, 0.26, 0.05, 0.13, 0.9, 0.7, 0, 0, 0),
      ...fHead(0.098, 0.65, 0.02, 0x9aa877, 0x2b2622, 0.3),
    ],
    brute: [
      ...legs(0x3a342c, 0.26, 0.26, 0.12, 0.09, 0.4),
      { g: fCyl(0.17, 0.14, 0.24, 0.24, 5, 0.8), c: WHITE, tint: 1 },
      { g: fCyl(0.23, 0.2, 0.15, 0.44, 6, 0.85, 0.02), c: 0x6f7d58 },        // bare, heaving shoulders
      { g: fBox(0.12, 0.08, 0.03, 0.05, 0.38, 0.11), c: BLOOD, lod: 1 },
      ...arms(0x6f7d58, 0.56, 0.48, 0.11, 0.25, 0.3, -0.25, 0, 0, 0),
      { g: fBox(0.13, 0.11, 0.13, -0.25, 0.1, 0.14), c: 0x5d6a49, lod: 1 },  // fists
      { g: fBox(0.13, 0.11, 0.13, 0.25, 0.1, 0.14), c: 0x5d6a49, lod: 1 },
      ...fHead(0.08, 0.6, 0.1, 0x7d8a63, 0x5d6a49, 0.25),
    ],
    // civilians: shirt and trousers, a long coat, a hat and rucksack. Children are the first kind, smaller.
    civ: [
      ...legs(0x3b3631, 0.3, 0.3, 0.08, 0.055, 0.8),
      { g: fCyl(0.12, 0.1, 0.27, 0.29, 5, 0.75), c: WHITE, tint: 1 },
      ...arms(WHITE, 0.54, 0.25, 0.055, 0.14, 0.7, 0, 1),
      ...fHead(0.092, 0.65, 0, SKIN, 0x4a3326),
    ],
    coat: [
      ...legs(0x2f2b28, 0.22, 0.22, 0.075, 0.05, 0.6),
      { g: fCyl(0.12, 0.15, 0.4, 0.17, 5, 0.8), c: WHITE, tint: 1 },
      { g: fBox(0.2, 0.05, 0.12, 0, 0.555, 0.0), c: WHITE, tint: 0.8, lod: 1 },   // collar
      ...arms(WHITE, 0.54, 0.26, 0.06, 0.145, 0.6, 0, 1),
      ...fHead(0.092, 0.65, 0, SKIN, 0xb89a5e),
    ],
    hat: [
      ...legs(0x46526a, 0.3, 0.3, 0.08, 0.055, 0.8),
      { g: fCyl(0.12, 0.1, 0.27, 0.29, 5, 0.75), c: WHITE, tint: 1 },
      { g: fBox(0.17, 0.2, 0.09, 0, 0.45, -0.11), c: 0x6b5236 },                  // rucksack
      ...arms(WHITE, 0.54, 0.25, 0.055, 0.14, 0.7, 0, 1),
      ...fHead(0.092, 0.65, 0, SKIN, 0x3b3631),
      { g: new THREE.CircleGeometry(0.15, 6).rotateX(-Math.PI / 2).translate(0, 0.7, 0), c: 0x3b3631 }, // brim
      { g: fCyl(0.075, 0.09, 0.07, 0.7, 5), c: 0x3b3631, lod: 1 },
    ],
    // soldiers: infantry in helmets with packs, militia in caps; both carry rifles at the ready
    infantry: [
      ...legs(0x2f3329, 0.3, 0.3, 0.085, 0.06, 0.7),
      { g: fCyl(0.13, 0.11, 0.28, 0.28, 5, 0.8), c: WHITE, tint: 1 },
      { g: fBox(0.18, 0.2, 0.1, 0, 0.36, -0.12), c: 0x4a5636 },                  // pack
      ...arms(WHITE, 0.54, 0.24, 0.06, 0.15, 0, -0.9, 1),
      { g: fBox(0.035, 0.04, 0.36, 0.06, 0.43, 0.2), c: 0x1f1f1d, lod: 1 },      // rifle
      fHead(0.09, 0.65, 0, SKIN, 0x55633a, 0.45)[1],
      { g: new THREE.SphereGeometry(0.125, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.655, 0), c: 0x55633a }, // helmet
    ],
    militia: [
      ...legs(0x46526a, 0.3, 0.3, 0.08, 0.055, 0.75),
      { g: fCyl(0.12, 0.1, 0.27, 0.29, 5, 0.75), c: WHITE, tint: 1 },
      { g: fBox(0.06, 0.24, 0.02, 0.05, 0.36, 0.08, 0.6), c: 0x6b5236, lod: 1 },  // bandolier
      ...arms(WHITE, 0.54, 0.24, 0.055, 0.14, 0, -0.75, 1),
      { g: fBox(0.03, 0.035, 0.32, 0.05, 0.45, 0.18), c: 0x3b2a1e, lod: 1 },      // hunting rifle
      ...fHead(0.094, 0.655, 0, SKIN, 0x4a3f33, 0.4),                               // cap
      { g: fBox(0.13, 0.015, 0.08, 0, 0.69, 0.09), c: 0x4a3f33 },                 // peak
    ],
  };
  const out: Record<string, [TGeometry, TGeometry]> = {};
  for (const k in kinds) {
    out[k] = [figureGeo(kinds[k], false), figureGeo(kinds[k], true)];
    for (const p of kinds[k]) p.g.dispose();
  }
  return out;
}

const PEOPLE_T = { value: 0 };
let figMat: TMaterial | null = null;
/** The figure material: vertex colours, the instance colour only where aTint says, and the limb swing. */
function figureMat(): TMaterial {
  if (figMat) return figMat;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, flatShading: true, vertexColors: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = PEOPLE_T;
    sh.vertexShader = 'uniform float uTime;\nattribute float aTint;\nattribute vec2 aLimb;\nattribute vec3 aAnim;\n' + sh.vertexShader
      .replace('#include <color_vertex>', 'vColor = vec3(1.0);\nvColor *= color;\nvColor *= mix(vec3(1.0), instanceColor.xyz, aTint);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = uTime * aAnim.z + aAnim.x;
        float ang = sin(ph) * aAnim.y * aLimb.x;
        float cy = transformed.y - aLimb.y, ca = cos(ang), sa = sin(ang);
        transformed.y = aLimb.y + cy * ca - transformed.z * sa;
        transformed.z = cy * sa + transformed.z * ca;
        transformed.y += abs(cos(ph)) * 0.035 * aAnim.y;`);
  };
  m.customProgramCacheKey = () => 'lb-figure';
  return figMat = m;
}

/** An instanced mesh of one figure kind, with matrices, colours and animation written straight into its arrays. */
interface Fig { im: TInstanced; n: number; mat: Float32Array; col: Float32Array; anim: Float32Array; near: TGeometry; far: TGeometry }
function figMesh([near, far]: [TGeometry, TGeometry], cap: number): Fig {
  const im = new THREE.InstancedMesh(near, figureMat(), cap);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  anim.setUsage(THREE.DynamicDrawUsage);
  near.setAttribute('aAnim', anim); far.setAttribute('aAnim', anim);
  im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
  V.scene.add(im);
  return { im, n: 0, mat: im.instanceMatrix.array as Float32Array, col: im.instanceColor.array as Float32Array, anim: anim.array as Float32Array, near, far };
}

/** Place one figure: at (x, y, z), scale s, facing hd, leaning forward by lean, tinted color,
 *  with its limbs swinging at amplitude amp and frequency freq (radians per game second). */
function putFig(f: Fig, x: number, y: number, z: number, s: number, hd: number, lean: number, color: number, ph: number, amp: number, freq: number) {
  const k = f.n;
  if (k >= f.im.instanceMatrix.count) return;
  f.n++;
  const e = f.mat, o = k * 16, ch = Math.cos(hd) * s, sh = Math.sin(hd) * s, cl = Math.cos(lean), sl = Math.sin(lean);
  e[o] = ch; e[o + 1] = 0; e[o + 2] = -sh; e[o + 3] = 0;
  e[o + 4] = sh * sl; e[o + 5] = cl * s; e[o + 6] = ch * sl; e[o + 7] = 0;
  e[o + 8] = sh * cl; e[o + 9] = -sl * s; e[o + 10] = ch * cl; e[o + 11] = 0;
  e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
  const c = f.col, q = k * 3;
  c[q] = ((color >> 16) & 255) / 255; c[q + 1] = ((color >> 8) & 255) / 255; c[q + 2] = (color & 255) / 255;
  const a = f.anim; a[q] = ph; a[q + 1] = amp; a[q + 2] = freq;
}

function flushFig(f: Fig, far: boolean) {
  f.im.count = f.n;
  f.im.geometry = far ? f.far : f.near; // from high up, a simpler figure without limbs
  f.im.instanceMatrix.needsUpdate = true;
  f.im.instanceColor!.needsUpdate = true;
  (f.im.geometry.getAttribute('aAnim') as THREE.InstancedBufferAttribute).needsUpdate = true;
  f.n = 0;
}

let FIG: Record<'walker' | 'runner' | 'brute' | 'civ' | 'coat' | 'hat' | 'infantry' | 'militia', Fig>;
const MAX_SOLDIERS = 400;

function buildPeople() {
  const g = buildFigures();
  FIG = {
    walker: figMesh(g.walker, MAX_ZOMBIES), runner: figMesh(g.runner, MAX_ZOMBIES), brute: figMesh(g.brute, MAX_ZOMBIES),
    civ: figMesh(g.civ, MAX_CIVS), coat: figMesh(g.coat, MAX_CIVS), hat: figMesh(g.hat, MAX_CIVS),
    infantry: figMesh(g.infantry, MAX_SOLDIERS), militia: figMesh(g.militia, MAX_SOLDIERS),
  };
}

/** What sort of infected this is. The simulation may tag a kind; otherwise unusually fast ones
 *  run and unusually tough ones are brutes. 0 walker, 1 runner, 2 brute. */
function zedKind(z: Zed): number {
  const k = (z as Zed & { kind?: unknown }).kind;
  if (typeof k === 'string' && k) return k.includes('brute') || k.includes('tank') ? 2 : k.includes('run') || k.includes('fast') ? 1 : 0;
  return z.hp >= 8 ? 2 : z.sp >= 1.25 ? 1 : 0;
}

const PS = 1.5; // people are drawn larger than life so they read from the air
function drawPeople(time: number) {
  PEOPLE_T.value = time;
  const zf = [FIG.walker, FIG.runner, FIG.brute];
  let n = 0;
  for (const z of G.zeds) {
    if (n++ >= MAX_ZOMBIES) break;
    const kind = zedKind(z), f = zf[kind];
    if (z.rise > 0) { putFig(f, z.x, 0.1, z.z, PS, z.hd, Math.PI / 2, z.shirt, 0, 0, 0); continue; } // the bitten lie where they fell
    const wob = Math.sin(z.ph) * 0.1;
    if (kind === 1) putFig(f, z.x, 0, z.z, PS * 0.98, z.hd, 0.5 + wob * 0.5, z.shirt, z.ph, 1, 11);
    else if (kind === 2) putFig(f, z.x, 0, z.z, PS * 1.3, z.hd, 0.35 + wob * 0.5, z.shirt, z.ph, 1, 3.6);
    else putFig(f, z.x, 0, z.z, PS, z.hd + wob, 0.22 + wob, z.shirt, z.ph, 1, 4.5 + (z.ph % 1));
  }
  const cf = [FIG.civ, FIG.coat, FIG.hat];
  n = 0;
  for (const c of G.civs) {
    if (n++ >= MAX_CIVS) break;
    const v = Math.floor(c.ph * 7) % 6; // 0 and 1 are children
    putFig(cf[v % 3], c.x, 0, c.z, v < 1 ? PS * 0.68 : PS, c.hd, 0.12, c.color, c.ph, 1, 10);
  }
  // the crowds waiting at evacuation points, packed in rings round the marker, facing it (or the sea)
  for (const e of G.evacs) {
    const k = Math.min(e.kind === 'harbor' ? 160 : 40, Math.ceil(e.queue / PER_AGENT));
    for (let q = 0; q < k && n < MAX_CIVS; q++, n++) {
      const ring = Math.floor(Math.sqrt(q)), a = q * 2.4, r = 0.9 + ring * 0.42;
      const dx = Math.cos(a) * r * (e.kind === 'harbor' ? 1.6 : 1), dz = Math.sin(a) * r * (e.kind === 'harbor' ? 0.5 : 1);
      const color = CIV_COLORS[q % CIV_COLORS.length], bob = Math.max(0, Math.sin(time * 2 + q)) * 0.03, v = (q * 5) % 6;
      const hd = e.kind === 'harbor' ? Math.sin(q) * 0.5 : Math.atan2(-dx, -dz);
      putFig(cf[v % 3], e.x + dx, bob, e.z + dz, v < 1 ? PS * 0.68 : PS, hd, 0, color, q, 0, 0);
    }
  }
  for (const u of G.units) {
    if (UNITS[u.kind].vehicle) continue;
    const f = u.kind === 'militia' ? FIG.militia : FIG.infantry, body = u.kind === 'militia' ? 0x6f6a58 : 0x3d5a78, moving = u.goal >= 0 ? 1 : 0;
    u.members.forEach((m, k) => putFig(f, m.x, 0, m.z, PS, m.hd, moving * 0.12, body, u.id + k * 1.7, moving, 9));
  }
  const far = V.cam.dist > 52;
  for (const k in FIG) flushFig(FIG[k as keyof typeof FIG], far);
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
  drawTracers();
  drawBooms(dt);
  drawSmoke(time);
  drawMarkers(sel, selBlock, place, time);
  placeCamera();
  V.renderer.render(V.scene, V.camera);
}
