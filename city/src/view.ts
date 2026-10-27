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
const GROUND_PX = 16;  // texels per cell for the city ground
const OUT_PX = 5;      // and for the outskirts

/** Scatter n small dots of the given colours over a rectangle: grain for asphalt, grass and gravel. */
function speckle(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, colors: string[], n: number, size: number) {
  for (let k = 0; k < n; k++) {
    g.fillStyle = colors[k % colors.length];
    const s = size * (0.5 + r());
    g.fillRect(x + r() * w, y + r() * h, s, s);
  }
}

function grass(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, base = '#6c8650') {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  speckle(g, r, x, y, w, h, ['rgba(140,170,90,.35)', 'rgba(40,60,30,.25)', 'rgba(170,190,110,.25)'], Math.floor(w * h / 18), 3);
}

/** A pair of rails on sleepers from (x1, z) to (x2, z), in pixels. */
function railTrack(g: CanvasRenderingContext2D, x1: number, x2: number, z: number, px: number) {
  g.fillStyle = '#5b5148';
  for (let x = x1; x < x2; x += px * 0.28) g.fillRect(x, z - px * 0.32, px * 0.12, px * 0.64);
  g.fillStyle = '#9aa0a3';
  g.fillRect(x1, z - px * 0.22, x2 - x1, Math.max(1, px * 0.07)); g.fillRect(x1, z + px * 0.16, x2 - x1, Math.max(1, px * 0.07));
}

/**
 * The city's ground, painted once onto a canvas: asphalt with wear, lane lines and zebra crossings; pavements
 * with kerbs; lots, lawns and yards per district; the landmarks' grounds; the quay. Water cells are left
 * transparent, so the sea plane below shows through as the river and the pond.
 */
function paintGround(): TMesh {
  const px = GROUND_PX, cv = document.createElement('canvas'), r = seeded(99);
  cv.width = W * px; cv.height = SEA_Z * px;
  const g = cv.getContext('2d')!;
  const P = (v: number) => v * px;
  const isWater = (i: number, j: number) => inside(i, j) && G.grid[idx(i, j)] === Cell.Sea;

  // asphalt, with grain, repair patches, oil stains and cracks
  g.fillStyle = '#43474a'; g.fillRect(0, 0, cv.width, cv.height);
  speckle(g, r, 0, 0, cv.width, P(QUAY_Z), ['rgba(255,255,255,.05)', 'rgba(0,0,0,.10)'], 26000, 2);
  for (let k = 0; k < 220; k++) {
    const i = Math.floor(r() * W), j = Math.floor(r() * QUAY_Z);
    if (G.grid[idx(i, j)] !== Cell.Road || G.blockAt[idx(i, j)] >= 0) continue;
    g.fillStyle = r() < 0.5 ? 'rgba(20,22,24,.28)' : 'rgba(120,120,115,.16)';
    g.fillRect(P(i + r() * 0.5), P(j + r() * 0.5), P(0.3 + r() * 0.9), P(0.3 + r() * 0.9));
  }
  for (let k = 0; k < 260; k++) {
    const i = Math.floor(r() * W), j = Math.floor(r() * QUAY_Z);
    if (G.grid[idx(i, j)] !== Cell.Road) continue;
    g.fillStyle = 'rgba(15,15,15,.22)'; g.beginPath();
    g.ellipse(P(i + 0.5 + (r() - 0.5) * 0.6), P(j + 0.5 + (r() - 0.5) * 0.6), P(0.1 + r() * 0.15), P(0.08 + r() * 0.12), r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(18,18,18,.55)'; g.lineWidth = 1;
  for (let k = 0; k < 140; k++) {
    let x = r() * W, z = r() * QUAY_Z;
    if (G.grid[cellOf(x, z)] !== Cell.Road) continue;
    g.beginPath(); g.moveTo(P(x), P(z));
    for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 0.7; z += (r() - 0.5) * 0.7; g.lineTo(P(x), P(z)); }
    g.stroke();
  }

  // lane lines between the junctions, and zebra crossings on every approach
  g.strokeStyle = 'rgba(232,222,180,.6)'; g.lineWidth = 2; g.setLineDash([P(0.5), P(0.5)]);
  for (let k = 0; k <= W - 2; k += 8) for (let m = 0; m < 7; m++) { g.beginPath(); g.moveTo(P(k + 1), P(m * 8 + 2.4)); g.lineTo(P(k + 1), P(m * 8 + 7.6)); g.stroke(); }
  for (let m = 0; m <= QUAY_Z - 2; m += 8) for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(P(k * 8 + 2.4), P(m + 1)); g.lineTo(P(k * 8 + 7.6), P(m + 1)); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = 'rgba(228,224,210,.72)';
  for (let k = 0; k <= W - 2; k += 8) for (let m = 0; m <= QUAY_Z - 2; m += 8) {
    for (const [di, dj] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const i = di < 0 ? k - 1 : di > 0 ? k + 2 : k, j = dj < 0 ? m - 1 : dj > 0 ? m + 2 : m;
      if (!inside(i, j) || G.grid[idx(i, j)] !== Cell.Road || isWater(i, j)) continue;
      for (let s = 0; s < 6; s++) {
        const o = 0.36 + s * 0.23;
        if (dj) g.fillRect(P(k + o), P(dj < 0 ? m - 0.8 : m + 2.12), P(0.12), P(0.68));
        else g.fillRect(P(di < 0 ? k - 0.8 : k + 2.12), P(m + o), P(0.68), P(0.12));
      }
    }
  }

  // pavements with kerbs round every block, then the block's own ground
  for (const b of G.blocks) {
    const x = P(b.x0), z = P(b.z0), w = P(b.w), d = P(b.d), e = P(0.32);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - e - 1, z - e - 1, w + 2 * e + 2, d + 2 * e + 2);
    g.fillStyle = '#8f8b80'; g.fillRect(x - e, z - e, w + 2 * e, d + 2 * e);
    g.strokeStyle = 'rgba(60,55,45,.18)'; g.lineWidth = 1;
    for (let t = x - e; t < x + w + e; t += P(0.5)) { g.beginPath(); g.moveTo(t, z - e); g.lineTo(t, z); g.moveTo(t, z + d); g.lineTo(t, z + d + e); g.stroke(); }
    for (let t = z - e; t < z + d + e; t += P(0.5)) { g.beginPath(); g.moveTo(x - e, t); g.lineTo(x, t); g.moveTo(x + w, t); g.lineTo(x + w + e, t); g.stroke(); }
    g.strokeStyle = '#bdb7a6'; g.lineWidth = 2; g.strokeRect(x - e + 1, z - e + 1, w + 2 * e - 2, d + 2 * e - 2);
    paintLot(g, r, b, x, z, w, d);
  }

  // the quay: concrete slabs, crane rails, a yellow edge line
  for (let i = 0; i < W; i++) for (let j = QUAY_Z; j < SEA_Z; j++) {
    if (G.grid[idx(i, j)] !== Cell.Quay) continue;
    g.fillStyle = (i + j) % 2 ? '#8b867b' : '#858076'; g.fillRect(P(i), P(j), px, px);
  }
  speckle(g, r, 0, P(QUAY_Z), cv.width, P(SEA_Z - QUAY_Z), ['rgba(0,0,0,.08)', 'rgba(255,255,255,.07)'], 3000, 2);
  g.strokeStyle = 'rgba(50,45,40,.3)'; g.lineWidth = 1;
  for (let i = 0; i <= W; i += 2) { g.beginPath(); g.moveTo(P(i), P(QUAY_Z)); g.lineTo(P(i), P(SEA_Z)); g.stroke(); }
  for (const z of [60.35, 60.65, 63.15, 63.45]) { g.fillStyle = '#5d5f60'; g.fillRect(0, P(z) - 1, cv.width, 2); }
  g.fillStyle = '#c9b45a'; g.fillRect(0, P(SEA_Z - 0.2), cv.width, 3);
  for (let i = 3; i < W; i += 4) { g.fillStyle = 'rgba(30,30,30,.4)'; g.beginPath(); g.arc(P(i), P(SEA_Z - 0.35), 3, 0, Math.PI * 2); g.fill(); }

  // the bridges: a pavement along each side of the deck
  for (const [a, b] of BRIDGES) {
    g.fillStyle = '#8f8b80';
    g.fillRect(P(RIVER_X0), P(a), P(RIVER_X1 + 1 - RIVER_X0), P(0.3));
    g.fillRect(P(RIVER_X0), P(b + 0.7), P(RIVER_X1 + 1 - RIVER_X0), P(0.3));
  }

  // water: cut out, with a stone coping along its edge
  for (let j = 0; j < SEA_Z; j++) for (let i = 0; i < W; i++) {
    if (!isWater(i, j)) continue;
    g.clearRect(P(i), P(j), px, px);
  }
  g.fillStyle = '#b9b2a0';
  for (let j = 0; j < SEA_Z; j++) for (let i = 0; i < W; i++) {
    if (!isWater(i, j)) continue;
    if (inside(i - 1, j) && !isWater(i - 1, j)) g.fillRect(P(i) - 3, P(j), 3, px);
    if (inside(i + 1, j) && !isWater(i + 1, j)) g.fillRect(P(i + 1), P(j), 3, px);
    if (inside(i, j - 1) && !isWater(i, j - 1)) g.fillRect(P(i), P(j) - 3, px, 3);
    if (j + 1 < SEA_Z && !isWater(i, j + 1)) g.fillRect(P(i), P(j + 1), px, 3);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, SEA_Z), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, alphaTest: 0.5 }));
  m.rotation.x = -Math.PI / 2; m.position.set(W / 2, 0, SEA_Z / 2);
  m.receiveShadow = true;
  return m;
}

/** A block's own ground: yards, gardens, plazas and the landmarks' grounds. x, z, w, d in pixels. */
function paintLot(g: CanvasRenderingContext2D, r: () => number, b: Block, x: number, z: number, w: number, d: number) {
  const px = GROUND_PX, P = (v: number) => v * px, cx = x + w / 2, cz = z + d / 2;
  const path = (color: string, width: number, pts: number[][]) => {
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.beginPath();
    pts.forEach(([a, c], k) => k ? g.lineTo(a, c) : g.moveTo(a, c)); g.stroke(); g.lineCap = 'butt';
  };
  switch (b.landmark) {
    case 'victory': case 'millbrook': {
      grass(g, r, x, z, w, d);
      path('#c2b593', 5, [[x, cz], [cx - P(0.6), z + P(1.2)], [cx + P(1), cz - P(0.4)], [x + w, cz]]);
      path('#c2b593', 5, [[cx, z + d], [cx + P(0.3), cz + P(0.8)], [cx + P(1), cz - P(0.4)], [cx + P(0.8), z]]);
      if (b.landmark === 'victory') { g.fillStyle = '#c2b593'; g.beginPath(); g.arc(x + P(4.6), cz, P(0.75), 0, Math.PI * 2); g.fill(); }
      else { g.fillStyle = '#c2b593'; g.beginPath(); g.arc(cx, cz, P(1.3), 0, Math.PI * 2); g.fill(); }
      return;
    }
    case 'base':
      g.fillStyle = '#8c8456'; g.fillRect(x, z, w, d);
      speckle(g, r, x, z, w, d, ['rgba(0,0,0,.08)', 'rgba(255,255,230,.08)'], 900, 3);
      g.strokeStyle = '#e4dfcf'; g.lineWidth = 3; g.beginPath(); g.arc(x + w * 0.5, z + d * 0.62, P(1.3), 0, Math.PI * 2); g.stroke();
      g.font = `bold ${P(1.4)}px sans-serif`; g.fillStyle = '#e4dfcf'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', x + w * 0.5, z + d * 0.62);
      return;
    case 'market': {
      // cobbles in rings round the fountain
      g.fillStyle = '#a3957b'; g.fillRect(x, z, w, d);
      for (let k = 0; k < 2600; k++) {
        g.fillStyle = ['#b3a487', '#978a72', '#a99b7f', '#8e826c'][k % 4];
        g.fillRect(x + r() * w, z + r() * d, 4, 3);
      }
      g.strokeStyle = 'rgba(70,60,45,.35)'; g.lineWidth = 2;
      for (const rr of [1.6, 2.3, 2.9]) { g.beginPath(); g.arc(cx, cz, P(rr), 0, Math.PI * 2); g.stroke(); }
      return;
    }
    case 'cathedral':
      grass(g, r, x, z, w, d, '#6f8a52');
      g.fillStyle = '#b3ab96'; g.fillRect(x + P(0.1), z + P(1.2), P(5.9), P(3.6));
      g.fillRect(x - P(0.3), cz - P(0.5), P(0.8), P(1.0));
      return;
    case 'station':
      g.fillStyle = '#6d6660'; g.fillRect(x, z, w, d);
      speckle(g, r, x, z, w, d, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.08)'], 1400, 2);
      g.fillStyle = '#a39e92';
      for (const pz of [1.2, 3.0, 4.8]) g.fillRect(x, z + P(pz - 0.45), P(4.3), P(0.9));
      for (const tz of [2.1, 3.9]) railTrack(g, 0, x + P(4.3), z + P(tz), px);
      g.fillStyle = '#a39e92'; g.fillRect(x + P(4.3), z, w - P(4.3), d);
      return;
    case 'stadium': {
      g.fillStyle = '#a39e92'; g.fillRect(x, z, w, d);
      g.save(); g.beginPath(); g.ellipse(cx, cz, P(1.75), P(1.45), 0, 0, Math.PI * 2); g.clip();
      for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#5f8f45' : '#6a9a4e'; g.fillRect(cx - P(1.75) + k * P(3.5) / 8, z, P(3.5) / 8 + 1, d); }
      g.restore();
      g.strokeStyle = 'rgba(240,240,230,.85)'; g.lineWidth = 1.5;
      g.strokeRect(cx - P(1.3), cz - P(0.85), P(2.6), P(1.7));
      g.beginPath(); g.moveTo(cx, cz - P(0.85)); g.lineTo(cx, cz + P(0.85)); g.stroke();
      g.beginPath(); g.arc(cx, cz, P(0.3), 0, Math.PI * 2); g.stroke();
      return;
    }
    case 'townhall':
      g.fillStyle = '#a19c90'; g.fillRect(x, z, w, d);
      grass(g, r, x + P(1.9), z + P(4.5), P(2.2), P(1.4), '#6f8a52');
      return;
    case 'hospital':
      g.fillStyle = '#b9b5aa'; g.fillRect(x, z, w, d);
      g.strokeStyle = '#c4433a'; g.lineWidth = 2;
      for (const zz of [z + P(0.15), z + d - P(1.0)]) g.strokeRect(cx - P(0.9), zz, P(1.8), P(0.85));
      return;
  }
  switch (b.district) {
    case 'downtown':
      g.fillStyle = '#a19c90'; g.fillRect(x, z, w, d);
      g.strokeStyle = 'rgba(60,55,45,.2)'; g.lineWidth = 1;
      for (let t = 0; t <= w; t += P(1)) { g.beginPath(); g.moveTo(x + t, z); g.lineTo(x + t, z + d); g.stroke(); }
      for (let t = 0; t <= d; t += P(1)) { g.beginPath(); g.moveTo(x, z + t); g.lineTo(x + w, z + t); g.stroke(); }
      break;
    case 'residential':
      grass(g, r, x, z, w, d, '#6a7a50');
      break;
    case 'suburb':
      grass(g, r, x, z, w, d, '#6c8650');
      path('#4f6a3a', 3, [[cx, z], [cx, z + d]]); path('#4f6a3a', 3, [[x, cz], [x + w, cz]]);
      break;
    case 'industrial':
      g.fillStyle = '#77746b'; g.fillRect(x, z, w, d);
      speckle(g, r, x, z, w, d, ['rgba(0,0,0,.18)', 'rgba(255,255,255,.06)'], 700, 4);
      g.fillStyle = 'rgba(210,180,70,.55)';
      for (let t = 0.3; t < 5.8; t += 0.7) g.fillRect(x + P(t), z + d - P(0.9), 2, P(0.7));
      break;
    case 'docks':
      g.fillStyle = '#7d7a72'; g.fillRect(x, z, w, d);
      speckle(g, r, x, z, w, d, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.06)'], 600, 4);
      g.strokeStyle = 'rgba(210,180,70,.6)'; g.lineWidth = 2;
      if (b.buildings.filter(bd => bd.kind === 'box').length > 6) for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) g.strokeRect(x + P(0.2 + col * 1.4), z + P(3.65 + row), P(1.4), P(0.7));
      break;
  }
}

/**
 * The land beyond the map: suburban lawns near the city fading into a patchwork of fields, the city's streets
 * carried on out of town, the railway west, the river north, and a strip of shore along the sea.
 */
function paintOutskirts(): TMesh {
  const px = OUT_PX, r = seeded(7), cv = document.createElement('canvas');
  const WW = W + 2 * OUT, HH = SEA_Z + OUT;
  cv.width = WW * px; cv.height = HH * px;
  const g = cv.getContext('2d')!;
  const X = (x: number) => (x + OUT) * px, Z = (z: number) => (z + OUT) * px;
  const fields = ['#6f7d4f', '#7d8752', '#8a8a5a', '#6a7548', '#93875a', '#5f6f45', '#77804c'];
  for (let z = -OUT; z < SEA_Z; z += 7 + Math.floor(r() * 5)) {
    for (let x = -OUT; x < W + OUT;) {
      const w = 6 + Math.floor(r() * 10), h = 12;
      g.fillStyle = fields[Math.floor(r() * fields.length)]; g.fillRect(X(x), Z(z), w * px, h * px);
      g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
      const vert = r() < 0.5;
      for (let t = 0; t < (vert ? w : h); t += 0.6) { g.beginPath(); if (vert) { g.moveTo(X(x + t), Z(z)); g.lineTo(X(x + t), Z(z + h)); } else { g.moveTo(X(x), Z(z + t)); g.lineTo(X(x + w), Z(z + t)); } g.stroke(); }
      g.strokeStyle = '#4c5e37'; g.lineWidth = 2; g.strokeRect(X(x), Z(z), w * px, h * px);
      x += w;
    }
  }
  // suburban lawns close to town
  for (let z = -OUT; z < SEA_Z; z++) for (let x = -OUT; x < W + OUT; x++) {
    const d = Math.max(-x, x - W, -z, 0);
    if (d > 22 || r() > 1.1 - d / 22) continue;
    g.fillStyle = r() < 0.5 ? '#6c8650' : '#67804b'; g.fillRect(X(x), Z(z), px, px);
  }
  speckle(g, r, 0, 0, cv.width, cv.height, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.07)'], 20000, 2);
  // roads leading out of town
  g.fillStyle = '#4a4d4e';
  const len = (main: boolean) => (main ? OUT : 26);
  for (let j = 0; j < QUAY_Z; j += 8) {
    g.fillRect(X(-len(OUT_ROADS.west.includes(j))), Z(j), len(OUT_ROADS.west.includes(j)) * px, 2 * px);
    g.fillRect(X(W), Z(j), len(OUT_ROADS.east.includes(j)) * px, 2 * px);
  }
  for (let i = 0; i < W; i += 8) {
    if (isRiverCol(i)) continue;
    g.fillRect(X(i), Z(-len(OUT_ROADS.north.includes(i))), 2 * px, len(OUT_ROADS.north.includes(i)) * px);
  }
  // the railway
  g.fillStyle = '#6d6660'; g.fillRect(X(-OUT), Z(27.3), OUT * px, 3.4 * px);
  for (const tz of [28.1, 29.9]) railTrack(g, X(-OUT), X(0), Z(tz), px);
  // the shore
  g.fillStyle = '#c9bb92'; g.fillRect(0, Z(SEA_Z - 1.4), cv.width, 1.4 * px);
  g.fillStyle = '#8a8676'; g.fillRect(0, Z(SEA_Z - 0.4), cv.width, 0.4 * px);
  // holes for the city itself and for the river
  g.clearRect(X(0), Z(0), W * px, SEA_Z * px);
  g.clearRect(X(RIVER_X0), Z(-OUT), (RIVER_X1 + 1 - RIVER_X0) * px, OUT * px);
  g.fillStyle = '#b9b2a0';
  g.fillRect(X(RIVER_X0) - 2, Z(-OUT), 2, OUT * px); g.fillRect(X(RIVER_X1 + 1), Z(-OUT), 2, OUT * px);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(WW, HH), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, alphaTest: 0.5 }));
  m.rotation.x = -Math.PI / 2; m.position.set(W / 2, 0, (SEA_Z - OUT) / 2);
  m.receiveShadow = true;
  return m;
}

/** Collects static boxes and cylinders (walls, bridges, cranes, bollards) into two instanced meshes. */
class Props {
  boxes: number[][] = []; cyls: number[][] = [];
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, ry = 0) { this.boxes.push([x, y, z, sx, sy, sz, ry, color]); }
  cyl(x: number, y: number, z: number, r: number, h: number, color: number) { this.cyls.push([x, y, z, r * 2, h, r * 2, 0, color]); }
  build() {
    const b = inst(UNIT_BOX, vmat(0xffffff), this.boxes.length), c = inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), vmat(0xffffff), this.cyls.length);
    for (const [im, list] of [[b, this.boxes], [c, this.cyls]] as Array<[TInstanced, number[][]]>) {
      for (const [x, y, z, sx, sy, sz, ry, color] of list) setInst(im, im.count++, x, y, z, sx, sy, sz, ry, 0, color);
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

/** Embankment walls wherever water meets land, and stone arches on the bridges' faces. */
function buildWaterEdges(p: Props) {
  const WALL = 0x6e6a60, DEPTH = 0.42, water = (i: number, j: number) => !inside(i, j) || G.grid[idx(i, j)] === Cell.Sea;
  const bridgeFace = (i: number, j: number) => isRiverCol(i) && isBridgeRow(j);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (water(i, j)) continue;
    const g = G.grid[idx(i, j)], open = g === Cell.Road || g === Cell.Park;
    // a low parapet where a street or path ends at the water; the quay edge is left open for the ships
    const top = open ? 0.16 : 0.02;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!inside(ni, nj) || !water(ni, nj)) continue;
      if (dj && bridgeFace(i, j)) continue;
      if (dj) p.box(i + 0.5, -DEPTH, j + (dj > 0 ? 1 : 0), 1.04, DEPTH + top, 0.14, WALL);
      else p.box(i + (di > 0 ? 1 : 0), -DEPTH, j + 0.5, 0.14, DEPTH + top, 1.04, WALL);
    }
  }
  // the river carries on north out of the map between straight embankments
  for (const x of [RIVER_X0, RIVER_X1 + 1]) p.box(x, -DEPTH, -OUT / 2, 0.14, DEPTH + 0.02, OUT, WALL);
  // and the shore beyond the quay
  p.box(-OUT / 2, -DEPTH, SEA_Z, OUT, DEPTH + 0.02, 0.14, WALL);
  p.box(W + OUT / 2, -DEPTH, SEA_Z, OUT, DEPTH + 0.02, 0.14, WALL);
  // bridge faces: a stone arch, the parapet above the deck
  const span = RIVER_X1 + 1 - RIVER_X0, s = new THREE.Shape();
  s.moveTo(0, -DEPTH); s.lineTo(0, 0.3); s.lineTo(span, 0.3); s.lineTo(span, -DEPTH);
  s.lineTo(span - 0.35, -DEPTH);
  s.absellipse(span / 2, -DEPTH, span / 2 - 0.35, DEPTH - 0.1, 0, Math.PI, false, 0);
  s.lineTo(0, -DEPTH);
  const arch = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
  const faces = new THREE.InstancedMesh(arch, vmat(0x8a8475), BRIDGES.length * 2);
  faces.castShadow = true; faces.receiveShadow = true;
  let n = 0;
  for (const [a, b] of BRIDGES) for (const z of [a - 0.02, b + 1 - 0.14]) {
    setInst(faces, n++, RIVER_X0, 0, z, 1, 1, 1);
  }
  faces.instanceMatrix.needsUpdate = true;
  V.scene.add(faces);
}

/** Gantry cranes on the quay, bollards along its edge, and a lighthouse on the harbour mole. */
function buildHarbour(p: Props) {
  CRANES.forEach((x, k) => {
    const c = k % 2 ? 0xc4532f : 0xd8952e, steel = 0x3a3f42;
    for (const dx of [-1.15, 1.15]) for (const z of [60.5, 63.3]) p.box(x + dx, 0, z, 0.2, 4.1, 0.2, c);
    for (const z of [60.5, 63.3]) p.box(x, 3.9, z, 2.5, 0.25, 0.22, c);
    for (const dx of [-1.15, 1.15]) p.box(x + dx, 1.4, 61.9, 0.12, 0.14, 2.8, c);
    p.box(x, 4.15, 64.8, 0.5, 0.35, 12.5, c);           // the boom, out over the water
    p.box(x, 3.4, 61.2, 0.8, 0.6, 0.9, 0xe8e4d4);       // the driver's cab
    p.box(x, 4.5, 59.5, 0.9, 0.6, 1.0, steel);          // counterweight
    p.box(x, 4.5, 62.2, 0.12, 1.4, 0.12, c);            // the A-frame and its stays
    p.box(x, 2.6, 66, 0.06, 1.55, 0.06, steel);         // the hoist and spreader
    p.box(x, 2.45, 66, 0.9, 0.15, 0.45, 0xd8952e);
  });
  for (let i = 1; i < W; i += 2.5) {
    if (isRiverCol(Math.floor(i))) continue;
    p.cyl(i, 0, SEA_Z - 0.3, 0.09, 0.18, 0x2b2b2b);
  }
  // the mole and the lighthouse at its end
  p.box(W + 6 - 9, -0.42, 70.2, 18, 0.62, 1.6, 0x7e796f);
  p.cyl(63.6, 0.2, 70.2, 0.55, 1.2, 0xeeeae0);
  p.cyl(63.6, 1.4, 70.2, 0.48, 1.0, 0xc4432f);
  p.cyl(63.6, 2.4, 70.2, 0.42, 1.0, 0xeeeae0);
  p.cyl(63.6, 3.4, 70.2, 0.32, 0.45, 0x2b3438);
  p.cyl(63.6, 3.85, 70.2, 0.38, 0.12, 0xc4432f);
}

function buildCity() {
  V.scene.add(paintGround());
  V.scene.add(paintOutskirts());
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x46666f, roughness: 0.35, metalness: 0.2 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(W / 2, -0.35, H / 2); sea.receiveShadow = true;
  V.scene.add(sea);
  const props = new Props();
  buildWaterEdges(props);
  buildHarbour(props);

  // buildings: every block's pieces, then the outskirts' houses (which are never recoloured)
  const all = G.blocks.flatMap(b => b.buildings.map(bd => ({ b: b as Block | null, bd }))).concat(outskirts.map(bd => ({ b: null, bd })));
  const count = (f: (bd: Building) => boolean) => Math.max(1, all.filter(a => f(a.bd)).length);
  const bodies = inst(UNIT_BOX, vmat(0xffffff), count(bd => bd.kind !== 'tank' && bd.kind !== 'chimney' && bd.kind !== 'spire' && bd.kind !== 'dome'));
  const roofs = inst(UNIT_BOX, vmat(0xffffff), count(bd => bd.kind === 'flat' || bd.kind === 'tower'));
  const gables = inst(GABLE, vmat(0xffffff), count(bd => bd.kind === 'house' || bd.kind === 'shed'));
  const cyls = inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0), vmat(0xffffff), count(bd => bd.kind === 'tank' || bd.kind === 'chimney'));
  const cones = inst(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0), vmat(0xffffff), count(bd => bd.kind === 'spire'));
  const domes = inst(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1), vmat(0xffffff), count(bd => bd.kind === 'dome'));
  let bandN = 0;
  for (const { bd } of all) if ((bd.kind === 'flat' || bd.kind === 'tower') && bd.h >= 2) bandN += Math.floor(bd.h / 1.1);
  const bands = inst(UNIT_BOX, vmat(0x2b3438), bandN, false);
  const note = (b: Block | null, im: TInstanced, k: number, color: number) => {
    if (!b) return;
    if (!blockInst.has(b.id)) blockInst.set(b.id, []);
    blockInst.get(b.id)!.push({ im, k, color });
  };
  for (const { b, bd } of all) {
    const y = bd.y ?? 0, ry = bd.ry ?? 0;
    if (bd.kind === 'tank' || bd.kind === 'chimney') {
      const k = cyls.count++; setInst(cyls, k, bd.x, y, bd.z, bd.w, bd.h, bd.d, ry, 0, bd.color); note(b, cyls, k, bd.color);
      continue;
    }
    if (bd.kind === 'spire' || bd.kind === 'dome') {
      const im = bd.kind === 'spire' ? cones : domes, k = im.count++;
      setInst(im, k, bd.x, y, bd.z, bd.w, bd.h, bd.d, ry, 0, bd.color); note(b, im, k, bd.color);
      continue;
    }
    const k = bodies.count++; setInst(bodies, k, bd.x, y, bd.z, bd.w, bd.h, bd.d, ry, 0, bd.color); note(b, bodies, k, bd.color);
    if (bd.kind === 'house' || bd.kind === 'shed') {
      // a pitched roof, its ridge along the longer side
      const g = gables.count++, rh = bd.roofH ?? (bd.kind === 'house' ? 0.75 : 0.5), alongX = bd.w >= bd.d;
      setInst(gables, g, bd.x, y + bd.h, bd.z, (alongX ? bd.d : bd.w) * 1.08, rh, (alongX ? bd.w : bd.d) * 1.04, ry + (alongX ? Math.PI / 2 : 0), 0, bd.roof);
      note(b, gables, g, bd.roof);
    } else if (bd.kind === 'flat' || bd.kind === 'tower') {
      const r = roofs.count++; setInst(roofs, r, bd.x, y + bd.h, bd.z, bd.w + 0.12, 0.14, bd.d + 0.12, ry, 0, bd.roof); note(b, roofs, r, bd.roof);
      if (bd.h >= 2) for (let f = 0; f < Math.floor(bd.h / 1.1); f++) setInst(bands, bands.count++, bd.x, y + 0.5 + f * 1.1, bd.z, bd.w + 0.04, 0.32, bd.d + 0.04, ry);
    }
  }
  for (const im of [bodies, roofs, gables, cyls, cones, domes, bands]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }

  // trees: conifers and broadleaves
  const trunks = inst(new THREE.CylinderGeometry(0.08, 0.1, 1, 5).translate(0, 0.5, 0), vmat(0x6b5236), trees.length);
  const firs = inst(new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0), vmat(0xffffff), trees.length);
  const leafy = inst(new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0), vmat(0xffffff), trees.length);
  for (const [x, z, s, kind] of trees) {
    const shade = (Math.sin(x * 12.9 + z * 78.2) * 0.5 + 0.5);
    setInst(trunks, trunks.count++, x, 0, z, s, s * 0.5, s);
    if (kind === 0) setInst(firs, firs.count++, x, s * 0.35, z, s * 1.1, s * 1.5, s * 1.1, x * 7, 0, shade < 0.5 ? 0x4f6b40 : 0x5f7a48);
    else setInst(leafy, leafy.count++, x, s * 0.4, z, s * 1.25, s * 1.1, s * 1.25, x * 7, 0, shade < 0.33 ? 0x6b8a4a : shade < 0.66 ? 0x5f7f45 : 0x7a8f50);
  }
  for (const im of [trunks, firs, leafy]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }

  // abandoned cars
  const carBody = inst(UNIT_BOX, vmat(0xffffff), cars.length), carTop = inst(UNIT_BOX, vmat(0xffffff), cars.length);
  for (const [x, z, hd, color] of cars) {
    setInst(carBody, carBody.count++, x, 0.05, z, 0.68, 0.32, 1.45, hd, 0, color);
    setInst(carTop, carTop.count++, x - Math.sin(hd) * 0.08, 0.37, z - Math.cos(hd) * 0.08, 0.6, 0.24, 0.78, hd, 0, color === 0x2b2725 ? 0x1e1c1b : 0x2f3a40);
  }
  for (const im of [carBody, carTop]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }

  // Fort Aldermoor: sandbags round the helipad
  const base = G.blocks.find(b => b.district === 'base')!;
  for (let a = 0; a < Math.PI * 2; a += 0.35) props.box(base.x0 + 3 + Math.cos(a) * 2.3, 0, base.z0 + 3.7 + Math.sin(a) * 2.3, 0.5, 0.3, 0.25, 0xbfa978, -a);
  props.build();
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
    const h = Math.max(1.5, ...selBlock.buildings.map(b => (b.y ?? 0) + b.h)) + 0.3;
    blockMark.position.set(selBlock.x0 + selBlock.w / 2, 0, selBlock.z0 + selBlock.d / 2); blockMark.scale.set(selBlock.w + 0.4, h, selBlock.d + 0.4);
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
