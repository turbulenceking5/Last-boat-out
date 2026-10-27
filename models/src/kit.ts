// Shared building blocks: the place description the game passes in, a seeded random source,
// the palette, cached geometry and the small pieces (houses, trees, people) every model is made of.

type PlaceType = 'port' | 'capital' | 'town' | 'farm' | 'junction' | 'base' | 'depot' | 'hospital' | 'city';
type PlaceState = 'secure' | 'threat' | 'holding' | 'losing' | 'fallen' | 'cleared';

/** What the game tells the viewer about the selected place. Counts are in thousands, like the game. */
interface PlaceSpec {
  id: string;
  name: string;
  type: PlaceType;
  state: PlaceState;
  pop: number;      // civilians still there
  popMax: number;   // civilians at the start, for scaling
  H: number;        // infected
  T: number;        // battalions
  F: number;        // fortification level 0-3
  evac: boolean;    // evacuation ordered
  queue: number;    // people waiting on the quay (ports)
  night: boolean;
}

interface LBModelsApi {
  /** Show the model for a place inside a container element. Cheap to call on every game render. */
  show(box: HTMLElement, spec: PlaceSpec): void;
  /** Stop drawing (nothing selected, or the panel is hidden). */
  hide(): void;
}

/** Called every frame with elapsed seconds; animated pieces register one. */
type Tick = (t: number, dt: number) => void;

/** Everything a builder needs: where to add things, randomness, the place and its look. */
interface Ctx {
  root: TGroup;
  spec: PlaceSpec;
  rnd: () => number;
  lrnd: () => number;  // a separate stream for lit windows, so day and night share one layout
  ticks: Tick[];
  burnt: boolean;    // fallen: charred walls and roofs
  ghost: boolean;    // emptied: no lights, no people
  lit: boolean;      // windows glow (night, and someone still home)
  /** Spots where people can stand: open ground the builder left clear. */
  yards: Array<[number, number]>;
}

function seeded(str: string): () => number {
  let a = 0;
  for (let i = 0; i < str.length; i++) a = (Math.imul(a ^ str.charCodeAt(i), 2654435761) + i) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The game's own palette, so the models sit with the paper map and dark panels.
const COL = {
  paper: 0xcdc7af, grass: 0x8f9a6a, field1: 0xa7a46a, field2: 0x7f8f55, moss: 0x5f7a48, trunk: 0x6b5236,
  road: 0x8a7652, rail: 0x3a3c31, sleeper: 0x6b5a44, water: 0x5f7f86, quay: 0x9a948a,
  wall1: 0xe4dfcf, wall2: 0xd8cbb0, wall3: 0xc2b190, brick: 0xa0644a, stone: 0xb7b2a4,
  roof1: 0x8a4b3a, roof2: 0x5d6b72, roof3: 0x6e5a48, dome: 0x6f8f86,
  olive: 0x55633a, khaki: 0x8c8456, troop: 0x3d5a78, steel: 0x6d767a,
  zed: 0x7d8a63, zedShirt: 0x6a4f45, blood: 0xc4432f, civ: 0xe9e3cf, civ2: 0x7f93a6, civ3: 0xb8865b,
  skin: 0xd9b08c, amber: 0xe2a23a, char: 0x2c2925, char2: 0x3b3631, sand: 0xbfa978, hull: 0x2f3a40,
  window: 0x30383c, glow: 0xffc96b, white: 0xf1eee4,
};

const matCache = new Map<string, TMaterial>();
/** Shared flat-shaded materials, keyed by colour and glow. */
function mat(color: number, opts: { glow?: number; opacity?: number } = {}): TMaterial {
  const key = `${color}|${opts.glow ?? 0}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true });
    if (opts.glow) { m.emissive = new THREE.Color(opts.glow); m.emissiveIntensity = 1; }
    if (opts.opacity !== undefined && opts.opacity < 1) { m.transparent = true; m.opacity = opts.opacity; m.depthWrite = false; }
    matCache.set(key, m);
  }
  return m;
}

/** Walls and roofs scorch on a fallen place. */
const wallMat = (c: Ctx, color: number) => mat(c.burnt ? (color === COL.brick ? COL.char2 : COL.char) : color);
const roofMat = (c: Ctx, color: number) => mat(c.burnt ? COL.char : color);

// Unit-sized geometry, shared by every mesh and stretched with mesh.scale.
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0),
  cone4: new THREE.ConeGeometry(0.7071, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  cone6: new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0),
  dome: new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  ball: new THREE.SphereGeometry(0.5, 7, 5),
  gable: (() => {
    // a 1 x 1 x 1 pitched roof, ridge along z
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  })(),
  vault: new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2),
};

/** Add a mesh of a shared geometry, sized, placed and turned. */
function part(parent: TObject3D, geo: TGeometry, m: TMaterial, sx: number, sy: number, sz: number,
              x = 0, y = 0, z = 0, ry = 0): TMesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const box = (p: TObject3D, m: TMaterial, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0) =>
  part(p, GEO.box, m, w, h, d, x, y, z, ry);

/** A row of windows on the two long faces of a block, lit at night. */
function windows(c: Ctx, g: TObject3D, w: number, h: number, d: number, floors: number) {
  if (c.burnt) return;
  const m = c.lit ? mat(COL.glow, { glow: COL.glow }) : mat(COL.window);
  const cols = Math.max(1, Math.floor(w / 0.42));
  for (let f = 0; f < floors; f++) {
    const y = (h / floors) * (f + 0.45);
    for (let i = 0; i < cols; i++) {
      if (c.lit && c.lrnd() < 0.35) continue; // not every room is awake
      const x = -w / 2 + (w / cols) * (i + 0.5);
      for (const side of [-1, 1]) box(g, m, 0.16, 0.18, 0.02, x, y, side * (d / 2 + 0.005));
    }
  }
}

/** A gabled house. Returns its group so callers can place it. */
function house(c: Ctx, x: number, z: number, ry: number, w = 0.9, d = 0.7, h = 0.6,
               wall = COL.wall1, roof = COL.roof1): TGroup {
  const g = new THREE.Group();
  box(g, wallMat(c, wall), w, h, d);
  if (c.burnt && c.rnd() < 0.5) {
    // roof caved in: a few fallen beams
    for (let i = 0; i < 2; i++) box(g, mat(COL.char), w * 0.9, 0.05, 0.06, 0, h * 0.6, -d / 4 + i * d / 2, 0.3 - i * 0.5);
  } else {
    part(g, GEO.gable, roofMat(c, roof), d * 1.15, h * 0.65, w * 1.12, 0, h, 0, Math.PI / 2);
  }
  windows(c, g, w, h, d, 1);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  c.root.add(g);
  return g;
}

/** A flat-roofed block of flats or offices. */
function block(c: Ctx, x: number, z: number, ry: number, w: number, d: number, h: number, wall = COL.wall2): TGroup {
  const g = new THREE.Group();
  const top = c.burnt ? h * (0.45 + c.rnd() * 0.4) : h; // burnt-out shells are broken off
  box(g, wallMat(c, wall), w, top, d);
  if (!c.burnt) box(g, mat(COL.stone), w + 0.06, 0.06, d + 0.06, 0, top, 0);
  windows(c, g, w, top, d, Math.max(1, Math.round(top / 0.55)));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  c.root.add(g);
  return g;
}

function tree(c: Ctx, x: number, z: number, s = 1) {
  const g = new THREE.Group();
  part(g, GEO.cyl6, mat(c.burnt ? COL.char : COL.trunk), 0.09 * s, 0.35 * s, 0.09 * s);
  if (!c.burnt) {
    part(g, GEO.cone6, mat(COL.moss), 0.55 * s, 0.75 * s, 0.55 * s, 0, 0.25 * s, 0);
    part(g, GEO.cone6, mat(COL.moss), 0.42 * s, 0.55 * s, 0.42 * s, 0, 0.6 * s, 0);
  }
  g.position.set(x, 0, z);
  g.rotation.y = c.rnd() * 6;
  c.root.add(g);
}

/** A flat strip lying on the ground: roads, fields, platforms. */
function strip(c: Ctx, color: number, w: number, d: number, x: number, z: number, ry = 0, y = 0.005) {
  const m = box(c.root, mat(color), w, 0.02, d, x, y, z, ry);
  m.castShadow = false;
  return m;
}

interface Figure { g: TGroup; legs: TMesh[] }

/** A chunky little person: body, head, two legs, optional helmet. */
function person(body: number, opts: { head?: number; helmet?: number; scale?: number } = {}): Figure {
  const g = new THREE.Group();
  const s = (opts.scale ?? 1) * 1.3; // a touch larger than life so they read at panel size
  const legs: TMesh[] = [];
  for (const side of [-1, 1]) {
    const leg = part(g, GEO.box, mat(COL.char2), 0.07 * s, 0.16 * s, 0.08 * s, side * 0.05 * s, 0, 0);
    legs.push(leg);
  }
  part(g, GEO.cyl6, mat(body), 0.2 * s, 0.2 * s, 0.15 * s, 0, 0.15 * s, 0);
  part(g, GEO.ball, mat(opts.head ?? COL.skin), 0.14 * s, 0.14 * s, 0.14 * s, 0, 0.42 * s, 0);
  if (opts.helmet !== undefined) part(g, GEO.dome, mat(opts.helmet), 0.17 * s, 0.13 * s, 0.17 * s, 0, 0.44 * s, 0);
  return { g, legs };
}

/** Pick a free spot, preferring the yards a builder set aside, else a ring between r0 and r1. */
function spot(c: Ctx, r0: number, r1: number): [number, number] {
  if (c.yards.length && c.rnd() < 0.7) {
    const [x, z] = c.yards[Math.floor(c.rnd() * c.yards.length)];
    return [x + (c.rnd() - 0.5) * 0.5, z + (c.rnd() - 0.5) * 0.5];
  }
  const a = c.rnd() * Math.PI * 2, r = r0 + c.rnd() * (r1 - r0);
  return [Math.cos(a) * r, Math.sin(a) * r];
}
