// Shared state and data types for the city game, plus the grid helpers everything else uses:
// cell indexing, walkability, distance fields (multi-source BFS) and a spatial hash.

// ---- the grid ----
// The city is a grid of 1-unit cells. Roads are 2 cells wide every 8 cells; the blocks between are 6x6.
// The harbour quay runs along the south, and the sea beyond it.
const W = 74, H = 70;
const QUAY_Z = 58, SEA_Z = 64;
const enum Cell { Road, Building, Park, Quay, Sea, Base }

/** Every person-shaped agent stands for this many people. */
const PER_AGENT = 10;
const MAX_ZOMBIES = 2400, MAX_CIVS = 1400;
const GAME_SECONDS = 12 * 60;
const INF = 1e9;

type District = 'downtown' | 'residential' | 'suburb' | 'industrial' | 'docks' | 'park' | 'base' | 'hospital';

interface Building { x: number; z: number; w: number; d: number; h: number; color: number; roof: number; kind: 'tower' | 'flat' | 'house' | 'shed' | 'tank' }

interface Block {
  id: number;
  bx: number; bz: number;           // block coordinates
  x0: number; z0: number;           // first cell
  name: string;
  district: District;
  pop: number; popMax: number;      // people living here
  evacuating: boolean;
  fallen: boolean;                  // overrun: everyone gone and the infected got in
  emitT: number;
  doors: number[];                  // road cells people leave by and the infected break in at
  buildings: Building[];
  lastPanicCheck: number;
  breach: number;                   // how long the infected have been battering the doors
  convertT: number;                 // once breached, the next person inside is caught after this
}

/** rise: seconds until a newly bitten victim gets back up; they lie still until then. march: part of the great horde, heading into the city. */
interface Zed { x: number; z: number; hp: number; cd: number; sp: number; ph: number; hd: number; shirt: number; wx: number; wz: number; rise: number; kind: ZedKind; march: boolean }
/** Walkers shamble; runners sprint at crowds but fall fast; brutes soak up fire and smash doors in. */
const enum ZedKind { Walker, Runner, Brute }
/** Civilians are removed by setting gone, then compacted at the end of the tick, so hash indices stay valid. */
interface Civ { x: number; z: number; sp: number; ph: number; hd: number; color: number; gone: boolean }

type UnitKind = 'militia' | 'infantry' | 'apc' | 'tank';
interface Member { hp: number; maxHp: number; ox: number; oz: number; cd: number; x: number; z: number; hd: number }
interface Unit {
  id: number; kind: UnitKind; name: string;
  x: number; z: number; hd: number;
  members: Member[];
  goal: number;            // target cell, or -1 to hold
  field: Float32Array | null;
  aim: { x: number; z: number } | null; // what the main gun is pointed at (tanks)
  kills: number;
  people: number;          // militia are residents: survivors leave on the last ship
  cargo: number;           // APCs: civilians aboard
  loadT: number;
}

interface UnitSpec { name: string; cost: number; members: number; hp: number; dmg: number; range: number; rof: number; acc: number; speed: number; splash: number; vehicle: boolean; spread: number }
const UNITS: Record<UnitKind, UnitSpec> = {
  militia:  { name: 'Militia',        cost: 100,  members: 6, hp: 3,   dmg: 1,   range: 5,  rof: 1.3,  acc: 0.45, speed: 2.4, splash: 0,   vehicle: false, spread: 0.45 },
  infantry: { name: 'Infantry squad', cost: 300,  members: 8, hp: 6,   dmg: 1.5, range: 7,  rof: 0.8,  acc: 0.7,  speed: 2.6, splash: 0,   vehicle: false, spread: 0.45 },
  apc:      { name: 'APC',            cost: 700,  members: 1, hp: 70,  dmg: 1.2, range: 8,  rof: 0.14, acc: 0.65, speed: 4.2, splash: 0,   vehicle: true,  spread: 0 },
  tank:     { name: 'Tank',           cost: 1200, members: 1, hp: 160, dmg: 4,   range: 10, rof: 1.8,  acc: 0.9,  speed: 3.0, splash: 1.8, vehicle: true,  spread: 0 },
};

/** maxQueue: once this many are waiting, newcomers are sent elsewhere. biteT: the crowd is caught no faster than this. */
interface Evac { id: number; kind: 'harbor' | 'bus'; x: number; z: number; cell: number; queue: number; timer: number; interval: number; cap: number; departed: number; maxQueue: number; full: boolean; biteT: number }
interface Strike { x: number; z: number; t: number; dir: number; bombs: number }
interface Gunship { x: number; z: number; t: number; ang: number; cd: number; hx: number; hz: number }

type Order = 'militia' | 'infantry' | 'apc' | 'tank' | 'strike' | 'gunship' | 'evac';
const ORDER_COST: Record<Order, number> = { militia: 100, infantry: 300, apc: 700, tank: 1200, strike: 500, gunship: 1000, evac: 300 };

/** Pop-up objectives: a supply crate to grab, or survivors to reach before the infected do. */
interface Mission { id: number; kind: 'crate' | 'survivors' | 'vip' | 'hold'; x: number; z: number; t: number; people: number; reward: number; biteT: number }

/** Things the view and the sound play out: the simulation only records them. */
type Sfx = 'shot' | 'mg' | 'cannon' | 'boom' | 'horn' | 'alarm' | 'chime' | 'crunch' | 'siren' | 'rank' | 'tick' | 'throw';

interface Tracer { x1: number; z1: number; y1: number; x2: number; z2: number; t: number; color: number }
interface Boom { x: number; z: number; t: number; size: number }

interface Game {
  seed: number;
  rnd: () => number;
  grid: Uint8Array;            // Cell per cell
  blockAt: Int16Array;         // block id per cell, or -1
  doorOf: Int16Array;          // block id a door cell belongs to, or -1
  blocks: Block[];
  zeds: Zed[];
  civs: Civ[];
  units: Unit[];
  evacs: Evac[];
  strikes: Strike[];
  gunships: Gunship[];
  tracers: Tracer[];
  booms: Boom[];
  zField: Float32Array;        // how far the infected are from something to attack (see rebuildZField)
  eField: Float32Array;        // distance to the nearest evacuation point, for civilians
  eFieldDirty: boolean;
  t: number;                   // game seconds elapsed
  speed: number;               // 0 = paused
  funds: number;
  hq: number;                  // staging cell where bought units arrive
  stats: { evacuated: number; dead: number; killed: number; unitsLost: number; spent: number; total: number; missions: number; ferried: number };
  over: null | { why: 'time' | 'empty'; pct: number; grade: string };
  log: Array<{ t: number; text: string; kind: '' | 'good' | 'bad' | 'key' }>;
  nextId: number;
  sparks: number[];            // when new outbreaks start
  zedSpeed: number;            // grows as the night goes on
  changed: boolean;            // block colours need repainting
  missions: Mission[];
  nextMission: number;
  waveAt: number;              // when the great horde arrives from the east (-1 once it has)
  sfx: Array<{ k: Sfx; x: number; z: number }>;
  shake: number;
  alert: { text: string; until: number } | null;
}

let G: Game;

// ---- helpers ----
const idx = (i: number, j: number) => j * W + i;
const ci = (c: number) => c % W, cj = (c: number) => Math.floor(c / W);
const cellOf = (x: number, z: number) => idx(Math.max(0, Math.min(W - 1, Math.floor(x))), Math.max(0, Math.min(H - 1, Math.floor(z))));
const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H;
const walkable = (c: number) => { const g = G.grid[c]; return g === Cell.Road || g === Cell.Park || g === Cell.Quay || g === Cell.Base; };
const walkableAt = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H && walkable(cellOf(x, z));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) ** 2 + (az - bz) ** 2;
const fmtPeople = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
const fmtTime = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function say(text: string, kind: '' | 'good' | 'bad' | 'key' = '') {
  G.log.unshift({ t: G.t, text, kind });
  if (G.log.length > 60) G.log.length = 60;
}

/** Nearest walkable cell to (x, z), searching outward. */
function nearestWalkable(x: number, z: number): number {
  const i0 = Math.floor(x), j0 = Math.floor(z);
  for (let r = 0; r < 12; r++) {
    let best = -1, bd = INF;
    for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (!inside(i, j) || (Math.abs(i - i0) !== r && Math.abs(j - j0) !== r)) continue;
      const c = idx(i, j);
      if (!walkable(c)) continue;
      const d = dist2(i + 0.5, j + 0.5, x, z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

const queue = new Int32Array(W * H);
/** Multi-source BFS over walkable cells (4-neighbour, unit steps). Unreached cells stay at INF. */
function distanceField(out: Float32Array, sources: number[]) {
  out.fill(INF);
  let head = 0, tail = 0;
  for (const s of sources) if (s >= 0 && out[s] !== 0) { out[s] = 0; queue[tail++] = s; }
  while (head < tail) {
    const c = queue[head++], i = ci(c), j = cj(c), d = out[c] + 1;
    if (i > 0 && out[c - 1] > d && walkable(c - 1)) { out[c - 1] = d; queue[tail++] = c - 1; }
    if (i < W - 1 && out[c + 1] > d && walkable(c + 1)) { out[c + 1] = d; queue[tail++] = c + 1; }
    if (j > 0 && out[c - W] > d && walkable(c - W)) { out[c - W] = d; queue[tail++] = c - W; }
    if (j < H - 1 && out[c + W] > d && walkable(c + W)) { out[c + W] = d; queue[tail++] = c + W; }
  }
}

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The point to head for next: the centre of the neighbouring cell with the lowest field value. */
function downhill(field: Float32Array, x: number, z: number): [number, number] | null {
  const i = Math.floor(x), j = Math.floor(z), here = field[idx(i, j)];
  let best = here, bi = -1, bj = -1;
  for (const [di, dj] of DIRS) {
    const ni = i + di, nj = j + dj;
    if (!inside(ni, nj)) continue;
    const c = idx(ni, nj);
    if (!walkable(c)) continue;
    if (di && dj && (!walkable(idx(i + di, j)) || !walkable(idx(i, j + dj)))) continue; // no cutting corners
    const v = field[c] + (di && dj ? 0.4 : 0);
    if (v < best) { best = v; bi = ni; bj = nj; }
  }
  return bi < 0 ? null : [bi + 0.5, bj + 0.5];
}

/** Move (x, z) toward (tx, tz) by up to step, sliding along walls rather than entering buildings. */
function stepToward(a: { x: number; z: number; hd: number }, tx: number, tz: number, step: number) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  const s = Math.min(step, d), nx = a.x + (dx / d) * s, nz = a.z + (dz / d) * s;
  a.hd = Math.atan2(dx, dz);
  if (walkableAt(nx, nz)) { a.x = nx; a.z = nz; }
  else if (walkableAt(nx, a.z)) a.x = nx;
  else if (walkableAt(a.x, nz)) a.z = nz;
}

// ---- spatial hash: buckets of 2x2 cells, rebuilt every tick ----
const HB = 2, HW = Math.ceil(W / HB), HH = Math.ceil(H / HB);
class Hash<T extends { x: number; z: number }> {
  heads = new Int32Array(HW * HH);
  next = new Int32Array(4096);
  items: T[] = [];
  build(items: T[]) {
    this.items = items;
    if (this.next.length < items.length) this.next = new Int32Array(items.length * 2);
    this.heads.fill(-1);
    for (let k = 0; k < items.length; k++) {
      const b = Math.floor(items[k].z / HB) * HW + Math.floor(items[k].x / HB);
      this.next[k] = this.heads[b]; this.heads[b] = k;
    }
  }
  /** Calls fn for every item within r of (x, z), nearest not guaranteed; return true to stop. */
  near(x: number, z: number, r: number, fn: (it: T, k: number, d2: number) => boolean | void) {
    const r2 = r * r;
    const b0 = Math.max(0, Math.floor((x - r) / HB)), b1 = Math.min(HW - 1, Math.floor((x + r) / HB));
    const c0 = Math.max(0, Math.floor((z - r) / HB)), c1 = Math.min(HH - 1, Math.floor((z + r) / HB));
    for (let bz = c0; bz <= c1; bz++) for (let bx = b0; bx <= b1; bx++) {
      for (let k = this.heads[bz * HW + bx]; k >= 0; k = this.next[k]) {
        const it = this.items[k], d2 = dist2(it.x, it.z, x, z);
        if (d2 <= r2 && fn(it, k, d2)) return;
      }
    }
  }
  nearest(x: number, z: number, r: number, ok: (it: T) => boolean = () => true): T | null {
    let best: T | null = null, bd = INF;
    this.near(x, z, r, (it, _k, d2) => { if (d2 < bd && ok(it)) { bd = d2; best = it; } });
    return best;
  }
}
const zHash = new Hash<Zed>();
const cHash = new Hash<Civ>();

// ---- abilities, veterancy, decisions and feedback ----
// Declared as interface merges so the original declarations above stay as they were.

interface Unit {
  ab: number;              // seconds until the special ability is ready again
  lureT: number;           // APCs: seconds left on the flare and siren that draw the infected
  rank: number;            // 0 rookie, 1 veteran, 2 elite: earned with kills
  quietT: number;          // seconds since this unit last fired, for "Contact!" barks
  barkT: number;           // no bark from this unit before this game time
  vip: number;             // id of the VIP mission whose VIP rides with this unit, or 0
}
interface Mission {
  prog: number;            // hold: seconds a unit has held the block so far
  need: number;            // hold: seconds needed
  block: number;           // hold: the block to defend, or -1
  carrier: number;         // vip: id of the unit the VIP rides with, or 0 while still waiting
  who: string;             // vip: who they are
}
interface Evac { extra: number }  // harbour: extra places on the coming sailings (the ferry decision)

/** A thrown grenade or molotov, or a tank shell, in flight: it lands after dur seconds. */
interface Shell { sx: number; sz: number; x: number; z: number; t: number; dur: number; r: number; dmg: number; unit: number; big: boolean }
/** Floating text over the map: money, people saved, unit barks. The view fades it out. */
interface Pop { x: number; z: number; text: string; kind: 'good' | 'bad' | 'key' | 'say' | 'money' }
/** off: why this option can't be taken right now. */
interface Choice { label: string; note: string; off?: string }
/** A decision the player must make; the page pauses the game while it is shown. */
interface Decision { id: string; title: string; text: string; opts: Choice[]; until: number }
/** First orders from HQ: a short tutorial with small rewards. */
interface HqOrder { id: 'bus' | 'evac' | 'east' | 'ability'; text: string; reward: number; done: boolean }

interface Game {
  shells: Shell[];
  pops: Pop[];
  decision: Decision | null;
  decisions: Array<{ id: string; at: number }>;   // still to come, in order
  hqOrders: HqOrder[];
  sealed: boolean;          // the eastern bridges were blown
  calmUntil: number;        // "stay indoors": blocks don't panic on their own before this
  waveSize: number;
  troopsHome: number;       // soldiers who boarded the last ship
  ordered: boolean;         // the player has ordered a block to evacuate
  usedAbility: boolean;
  lastCall: number;         // last-ship countdown: the last second announced
  hordeTarget: number;      // the cell the great horde marches on
  ace: { name: string; kills: number; rank: number } | null;  // the unit with the most kills, for the end screen
}

/** One special ability per kind of unit, used with F or the button in the unit panel. */
const ABILITY: Record<UnitKind, { name: string; cd: number; range: number; r: number; dmg: number; desc: string }> = {
  militia:  { name: 'Molotovs', cd: 30, range: 6, r: 1.6, dmg: 3, desc: 'Petrol bombs on the thickest knot of infected nearby.' },
  infantry: { name: 'Grenades', cd: 20, range: 8, r: 1.9, dmg: 4, desc: 'Grenades on the thickest knot of infected in range. Never thrown where civilians are.' },
  apc:      { name: 'Flare and siren', cd: 45, range: 0, r: 0, dmg: 0, desc: 'For 12 seconds the infected within about 26 cells come for the APC instead of anyone else. Drive, and they follow.' },
  tank:     { name: 'HE barrage', cd: 40, range: 14, r: 2.4, dmg: 8, desc: 'Four high-explosive shells on the thickest knot of infected within 14 cells.' },
};
/** Kills needed for each rank. Each rank is more accurate, fires faster and recharges its ability sooner. */
const RANKS = [{ name: 'Rookie', kills: 0 }, { name: 'Veteran', kills: 30 }, { name: 'Elite', kills: 90 }];
const LURE_SECONDS = 12, LURE_PULL = 8;
