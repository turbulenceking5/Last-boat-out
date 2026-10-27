/* Last Boat to Calder: City. Generated from city/src/*.ts by `npm run build:city`; edit the TypeScript, not this file. */
(function () {
"use strict";
if (typeof THREE === "undefined") { document.documentElement.classList.add("no3d"); return; }
// ---- core.ts ----
// Shared state and data types for the city game, plus the grid helpers everything else uses:
// cell indexing, walkability, distance fields (multi-source BFS) and a spatial hash.
// ---- the grid ----
// The city is a grid of 1-unit cells. Roads are 2 cells wide every 8 cells; the blocks between are 6x6.
// The harbour quay runs along the south, and the sea beyond it.
const W = 74, H = 70;
const QUAY_Z = 58, SEA_Z = 64;
/** Every person-shaped agent stands for this many people. */
const PER_AGENT = 10;
const MAX_ZOMBIES = 2400, MAX_CIVS = 1400;
const GAME_SECONDS = 12 * 60;
const INF = 1e9;
const UNITS = {
    militia: { name: 'Militia', cost: 100, members: 6, hp: 3, dmg: 1, range: 5, rof: 1.3, acc: 0.45, speed: 2.4, splash: 0, vehicle: false, spread: 0.45 },
    infantry: { name: 'Infantry squad', cost: 300, members: 8, hp: 6, dmg: 1.5, range: 7, rof: 0.8, acc: 0.7, speed: 2.6, splash: 0, vehicle: false, spread: 0.45 },
    apc: { name: 'APC', cost: 700, members: 1, hp: 70, dmg: 1.2, range: 8, rof: 0.14, acc: 0.65, speed: 4.2, splash: 0, vehicle: true, spread: 0 },
    tank: { name: 'Tank', cost: 1200, members: 1, hp: 160, dmg: 4, range: 10, rof: 1.8, acc: 0.9, speed: 3.0, splash: 1.8, vehicle: true, spread: 0 },
};
const ORDER_COST = { militia: 100, infantry: 300, apc: 700, tank: 1200, strike: 500, gunship: 1000, evac: 300 };
let G;
// ---- helpers ----
const idx = (i, j) => j * W + i;
const ci = (c) => c % W, cj = (c) => Math.floor(c / W);
const cellOf = (x, z) => idx(Math.max(0, Math.min(W - 1, Math.floor(x))), Math.max(0, Math.min(H - 1, Math.floor(z))));
const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
const walkable = (c) => { const g = G.grid[c]; return g === 0 /* Cell.Road */ || g === 2 /* Cell.Park */ || g === 3 /* Cell.Quay */ || g === 5 /* Cell.Base */; };
const walkableAt = (x, z) => x >= 0 && z >= 0 && x < W && z < H && walkable(cellOf(x, z));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
const fmtPeople = (n) => n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
function seeded(seed) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function say(text, kind = '') {
    G.log.unshift({ t: G.t, text, kind });
    if (G.log.length > 60)
        G.log.length = 60;
}
/** Nearest walkable cell to (x, z), searching outward. */
function nearestWalkable(x, z) {
    const i0 = Math.floor(x), j0 = Math.floor(z);
    for (let r = 0; r < 12; r++) {
        let best = -1, bd = INF;
        for (let j = j0 - r; j <= j0 + r; j++)
            for (let i = i0 - r; i <= i0 + r; i++) {
                if (!inside(i, j) || (Math.abs(i - i0) !== r && Math.abs(j - j0) !== r))
                    continue;
                const c = idx(i, j);
                if (!walkable(c))
                    continue;
                const d = dist2(i + 0.5, j + 0.5, x, z);
                if (d < bd) {
                    bd = d;
                    best = c;
                }
            }
        if (best >= 0)
            return best;
    }
    return -1;
}
const queue = new Int32Array(W * H);
/** Multi-source BFS over walkable cells (4-neighbour, unit steps). Unreached cells stay at INF. */
function distanceField(out, sources) {
    out.fill(INF);
    let head = 0, tail = 0;
    for (const s of sources)
        if (s >= 0 && out[s] !== 0) {
            out[s] = 0;
            queue[tail++] = s;
        }
    while (head < tail) {
        const c = queue[head++], i = ci(c), j = cj(c), d = out[c] + 1;
        if (i > 0 && out[c - 1] > d && walkable(c - 1)) {
            out[c - 1] = d;
            queue[tail++] = c - 1;
        }
        if (i < W - 1 && out[c + 1] > d && walkable(c + 1)) {
            out[c + 1] = d;
            queue[tail++] = c + 1;
        }
        if (j > 0 && out[c - W] > d && walkable(c - W)) {
            out[c - W] = d;
            queue[tail++] = c - W;
        }
        if (j < H - 1 && out[c + W] > d && walkable(c + W)) {
            out[c + W] = d;
            queue[tail++] = c + W;
        }
    }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The point to head for next: the centre of the neighbouring cell with the lowest field value. */
function downhill(field, x, z) {
    const i = Math.floor(x), j = Math.floor(z), here = field[idx(i, j)];
    let best = here, bi = -1, bj = -1;
    for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (!inside(ni, nj))
            continue;
        const c = idx(ni, nj);
        if (!walkable(c))
            continue;
        if (di && dj && (!walkable(idx(i + di, j)) || !walkable(idx(i, j + dj))))
            continue; // no cutting corners
        const v = field[c] + (di && dj ? 0.4 : 0);
        if (v < best) {
            best = v;
            bi = ni;
            bj = nj;
        }
    }
    return bi < 0 ? null : [bi + 0.5, bj + 0.5];
}
/** Move (x, z) toward (tx, tz) by up to step, sliding along walls rather than entering buildings. */
function stepToward(a, tx, tz, step) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 1e-4)
        return;
    const s = Math.min(step, d), nx = a.x + (dx / d) * s, nz = a.z + (dz / d) * s;
    a.hd = Math.atan2(dx, dz);
    if (walkableAt(nx, nz)) {
        a.x = nx;
        a.z = nz;
    }
    else if (walkableAt(nx, a.z))
        a.x = nx;
    else if (walkableAt(a.x, nz))
        a.z = nz;
}
// ---- spatial hash: buckets of 2x2 cells, rebuilt every tick ----
const HB = 2, HW = Math.ceil(W / HB), HH = Math.ceil(H / HB);
class Hash {
    constructor() {
        this.heads = new Int32Array(HW * HH);
        this.next = new Int32Array(4096);
        this.items = [];
    }
    build(items) {
        this.items = items;
        if (this.next.length < items.length)
            this.next = new Int32Array(items.length * 2);
        this.heads.fill(-1);
        for (let k = 0; k < items.length; k++) {
            const b = Math.floor(items[k].z / HB) * HW + Math.floor(items[k].x / HB);
            this.next[k] = this.heads[b];
            this.heads[b] = k;
        }
    }
    /** Calls fn for every item within r of (x, z), nearest not guaranteed; return true to stop. */
    near(x, z, r, fn) {
        const r2 = r * r;
        const b0 = Math.max(0, Math.floor((x - r) / HB)), b1 = Math.min(HW - 1, Math.floor((x + r) / HB));
        const c0 = Math.max(0, Math.floor((z - r) / HB)), c1 = Math.min(HH - 1, Math.floor((z + r) / HB));
        for (let bz = c0; bz <= c1; bz++)
            for (let bx = b0; bx <= b1; bx++) {
                for (let k = this.heads[bz * HW + bx]; k >= 0; k = this.next[k]) {
                    const it = this.items[k], d2 = dist2(it.x, it.z, x, z);
                    if (d2 <= r2 && fn(it, k, d2))
                        return;
                }
            }
    }
    nearest(x, z, r, ok = () => true) {
        let best = null, bd = INF;
        this.near(x, z, r, (it, _k, d2) => { if (d2 < bd && ok(it)) {
            bd = d2;
            best = it;
        } });
        return best;
    }
}
const zHash = new Hash();
const cHash = new Hash();

// ---- citygen.ts ----
// Builds the city: a 9 x 7 grid of blocks between 2-cell roads, split into districts,
// with a harbour quay and the sea along the south and an army base in the north-west corner.
const BLOCKS_X = 9, BLOCKS_Z = 7;
const POP = { downtown: 1400, residential: 900, suburb: 380, industrial: 140, docks: 220, hospital: 650, park: 0, base: 0 };
const NAMES = [
    'Ashford Row', 'Cedar Gap', 'Millbrook', 'Harlow Court', 'Marrow Lane', 'Dunmore Terrace', 'Greyfield', 'Saltmarsh', 'Northgate',
    'Larch Hill', 'Brindle Street', 'Kessler Square', 'Torrin Yards', 'Alder Close', 'Westhaven Rise', 'Calder Mews', 'Southport Road',
    'Hollis Gardens', 'Brannock Place', 'Greystone', 'Fenwick', 'Rookery', 'Tanner\'s Row', 'Copper Lane', 'Ferry Street', 'Lantern Walk',
    'Mill Lane', 'Old Market', 'Chapel Hill', 'Riverside', 'Sexton Row', 'Union Street', 'Foundry Lane', 'Canal Side', 'Weaver\'s Court',
    'Bell Yard', 'Station Road', 'Orchard Way', 'High Street', 'Kings Parade', 'Queens Walk', 'Abbey Green', 'Gasworks', 'Ropewalk',
    'Salt Quay', 'Pilot Street', 'Anchor Lane', 'Harbour Row', 'Customs House', 'Coal Wharf', 'Fish Market', 'Dock Gate', 'Signal Hill',
    'Beacon Street', 'Hope Street', 'Prospect Row', 'Tower Hill', 'Exchange', 'Guildhall', 'Merchant Row', 'Bank Street', 'Crown Court', 'Victory Row',
];
const trees = []; // x, z, scale
function districtOf(bx, bz) {
    if (bx === 0 && bz === 0)
        return 'base';
    if (bx === 7 && bz === 2)
        return 'hospital';
    if ((bx === 4 && bz === 3) || (bx === 1 && bz === 4))
        return 'park';
    if (bz === BLOCKS_Z - 1)
        return 'docks';
    if (bx >= 3 && bx <= 5 && bz >= 2 && bz <= 4)
        return 'downtown';
    if (bx >= 7)
        return 'industrial';
    if (bz === 0 || bx === 0)
        return 'suburb';
    return 'residential';
}
function generateCity(rnd) {
    G.grid.fill(0 /* Cell.Road */);
    G.blockAt.fill(-1);
    G.doorOf.fill(-1);
    trees.length = 0;
    for (let j = QUAY_Z; j < H; j++)
        for (let i = 0; i < W; i++)
            G.grid[idx(i, j)] = j >= SEA_Z ? 4 /* Cell.Sea */ : 3 /* Cell.Quay */;
    const names = NAMES.slice();
    for (let i = names.length - 1; i > 0; i--) {
        const k = Math.floor(rnd() * (i + 1));
        [names[i], names[k]] = [names[k], names[i]];
    }
    for (let bz = 0; bz < BLOCKS_Z; bz++)
        for (let bx = 0; bx < BLOCKS_X; bx++) {
            const district = districtOf(bx, bz), x0 = bx * 8 + 2, z0 = bz * 8 + 2, id = G.blocks.length;
            const popMax = Math.round(POP[district] * (0.8 + rnd() * 0.4) / PER_AGENT) * PER_AGENT;
            const name = district === 'base' ? 'Fort Aldermoor' : district === 'hospital' ? "St Brennan's Hospital" : district === 'park' ? (bx === 4 ? 'Victory Park' : 'Millbrook Park') : names[id % names.length];
            const b = { id, bx, bz, x0, z0, name, district, pop: popMax, popMax, evacuating: false, fallen: false, emitT: 0, doors: [], buildings: [], lastPanicCheck: 0, breach: 0, convertT: 0 };
            const open = district === 'park' || district === 'base';
            for (let j = z0; j < z0 + 6; j++)
                for (let i = x0; i < x0 + 6; i++) {
                    G.grid[idx(i, j)] = district === 'park' ? 2 /* Cell.Park */ : district === 'base' ? 5 /* Cell.Base */ : 1 /* Cell.Building */;
                    G.blockAt[idx(i, j)] = id;
                }
            if (!open) {
                for (const k of [2, 3])
                    for (const [i, j] of [[x0 - 1, z0 + k], [x0 + 6, z0 + k], [x0 + k, z0 - 1], [x0 + k, z0 + 6]]) {
                        if (!inside(i, j))
                            continue;
                        const c = idx(i, j);
                        if (G.grid[c] === 0 /* Cell.Road */ || G.grid[c] === 3 /* Cell.Quay */) {
                            b.doors.push(c);
                            G.doorOf[c] = id;
                        }
                    }
            }
            furnish(b, rnd);
            G.blocks.push(b);
        }
    G.hq = idx(5, 5);
}
const PAL = {
    stone: 0xc9c1ab, sand: 0xd8cbb0, cream: 0xe4dfcf, brick: 0xa0644a, brick2: 0x8a5a44, slate: 0x7d8790, glass: 0x8fa3ad,
    concrete: 0xa9a59a, rust: 0x9a6b4a, white: 0xeeeae0, roofRed: 0x8a4b3a, roofGrey: 0x5d6b72, roofBrown: 0x6e5a48, tar: 0x4a4a46,
};
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
/** Lay out the buildings inside a block's 6x6 footprint. */
function furnish(b, rnd) {
    const { x0, z0 } = b, add = (x, z, w, d, h, color, roof, kind) => b.buildings.push({ x: x0 + x, z: z0 + z, w, d, h, color, roof, kind });
    switch (b.district) {
        case 'downtown':
            if (rnd() < 0.5)
                add(3, 3, 4.8, 4.8, 9 + rnd() * 7, pick(rnd, [PAL.glass, PAL.stone, PAL.slate]), PAL.tar, 'tower');
            else {
                const h = 6 + rnd() * 6;
                add(3, 1.6, 4.8, 2.4, h, pick(rnd, [PAL.glass, PAL.stone]), PAL.tar, 'tower');
                add(3, 4.5, 4.8, 2.2, h * (0.6 + rnd() * 0.5), pick(rnd, [PAL.slate, PAL.sand]), PAL.tar, 'tower');
            }
            break;
        case 'residential':
            for (const [x, z] of [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]])
                add(x, z, 2.5, 2.5, 2.4 + rnd() * 2.2, pick(rnd, [PAL.brick, PAL.cream, PAL.sand, PAL.brick2]), PAL.tar, 'flat');
            break;
        case 'suburb':
            for (const [x, z] of [[1.4, 1.3], [4.6, 1.3], [1.4, 4.7], [4.6, 4.7], [3, 3]]) {
                if (x === 3 && rnd() < 0.5) {
                    trees.push([x0 + x, z0 + z, 0.9 + rnd() * 0.4]);
                    continue;
                }
                add(x, z, 2.0, 1.7, 1.1, pick(rnd, [PAL.cream, PAL.sand, PAL.white, PAL.brick]), pick(rnd, [PAL.roofRed, PAL.roofGrey, PAL.roofBrown]), 'house');
            }
            break;
        case 'industrial':
            add(2.4, 2.2, 4.2, 3.6, 2.2 + rnd() * 0.8, pick(rnd, [PAL.concrete, PAL.rust]), PAL.roofGrey, 'shed');
            add(4.9, 4.9, 1.6, 1.6, 1.8, PAL.white, PAL.concrete, 'tank');
            if (rnd() < 0.6)
                add(1.6, 5.0, 1.4, 1.4, 1.5, PAL.white, PAL.concrete, 'tank');
            break;
        case 'docks':
            add(3, 1.6, 5.4, 2.4, 2.0, pick(rnd, [PAL.rust, PAL.concrete, PAL.brick2]), PAL.roofGrey, 'shed');
            add(3, 4.5, 5.4, 2.2, 1.8, pick(rnd, [PAL.concrete, PAL.slate]), PAL.roofGrey, 'shed');
            break;
        case 'hospital':
            add(3, 2.4, 5.4, 3.0, 4.2, PAL.white, PAL.concrete, 'flat');
            add(1.4, 4.8, 2.4, 2.0, 2.6, PAL.white, PAL.concrete, 'flat');
            add(4.6, 4.8, 2.4, 2.0, 2.6, PAL.white, PAL.concrete, 'flat');
            break;
        case 'park':
            for (let k = 0; k < 14; k++)
                trees.push([x0 + 0.5 + rnd() * 5, z0 + 0.5 + rnd() * 5, 0.8 + rnd() * 0.6]);
            break;
        case 'base':
            add(1.2, 1.0, 2.2, 1.2, 1.0, 0x8c8456, 0x55633a, 'house');
            add(4.6, 1.0, 2.2, 1.2, 1.0, 0x8c8456, 0x55633a, 'house');
            break;
    }
}

// ---- sim.ts ----
// The simulation: one fixed step at a time (1/20 s of game time).
// Order each step: rebuild fields and hashes, blocks emit refugees, civilians walk, units and aircraft
// fire (marking kills), the infected move and bite, ships and buses sail, then dead are cleared away.
const STEP = 1 / 20;
const BREACH = 25; // zombie-seconds of battering before a block's doors give way
const CONVERT_EVERY = 5; // once inside, one figure's worth of people is caught this often
const EMIT_EVERY = 2; // an evacuating block lets one figure's worth of people out this often
const fieldCache = new Map();
const doorField = new Float32Array(W * H);
let panicSaid = 0, busSaid = 0; // routine messages are rationed so the log stays readable
let zFieldT = 0, unitCount = { militia: 0, infantry: 0, apc: 0, tank: 0 };
function newGame(seed) {
    const rnd = seeded(seed);
    G = {
        seed, rnd,
        grid: new Uint8Array(W * H), blockAt: new Int16Array(W * H), doorOf: new Int16Array(W * H),
        blocks: [], zeds: [], civs: [], units: [], evacs: [], strikes: [], gunships: [], tracers: [], booms: [],
        zField: new Float32Array(W * H), eField: new Float32Array(W * H), eFieldDirty: true,
        t: 0, speed: 1, funds: 1500, hq: 0,
        stats: { evacuated: 0, dead: 0, killed: 0, unitsLost: 0, spent: 0, total: 0 },
        over: null, log: [], nextId: 1, sparks: [150, 320, 500], zedSpeed: 1, changed: true,
    };
    fieldCache.clear();
    zFieldT = 0;
    panicSaid = 0;
    busSaid = 0;
    unitCount = { militia: 0, infantry: 0, apc: 0, tank: 0 };
    generateCity(seeded(20261027)); // the same streets every game; the outbreak and its timing vary
    G.stats.total = G.blocks.reduce((a, b) => a + b.popMax, 0);
    const hc = idx(37, 60);
    G.evacs.push({ id: G.nextId++, kind: 'harbor', x: 37.5, z: 60.5, cell: hc, queue: 0, timer: 40, interval: 40, cap: 700, departed: 0, maxQueue: 4000, full: false, biteT: 0 });
    spawnUnit('infantry', G.hq, idx(13, 9));
    spawnUnit('infantry', G.hq, idx(9, 17));
    const hosp = G.blocks.find(b => b.district === 'hospital');
    outbreak(hosp, 20);
    say('You have command of the city. The last ship leaves the harbour in 12 minutes.', 'key');
    say(`Outbreak at ${hosp.name}. The infected are breaking out.`, 'bad');
}
/** Infected appear at a block's doors and the people they came from are lost. */
function outbreak(b, n) {
    for (let k = 0; k < n; k++) {
        const d = b.doors[k % b.doors.length];
        spawnZed(ci(d) + 0.2 + G.rnd() * 0.6, cj(d) + 0.2 + G.rnd() * 0.6, false);
    }
    const lost = Math.min(b.pop, n * PER_AGENT);
    b.pop -= lost;
    G.stats.dead += lost;
    b.evacuating = true;
}
const SHIRTS = [0x6a4f45, 0x5b6470, 0x7a6a50, 0x4d5a4a, 0x8a3a30, 0x6b6b6b, 0x3f4f66];
/** A new infected. The bitten lie still for a while before they rise (rise = true). */
function spawnZed(x, z, rise = true) {
    if (G.zeds.length >= MAX_ZOMBIES)
        return;
    const r = G.rnd;
    G.zeds.push({ x, z, hp: 3, cd: 0.5 + r(), sp: 0.55 + r() * 0.45, ph: r() * 100, hd: r() * 6, shirt: SHIRTS[Math.floor(r() * SHIRTS.length)], wx: x, wz: z, rise: rise ? 10 + r() * 8 : 0 });
}
const CIV_COLORS = [0xe9e3cf, 0x7f93a6, 0xb8865b, 0xc9b99a, 0x9a6b8a, 0x6f8f6a, 0xd2a65a];
function spawnCiv(x, z) {
    const r = G.rnd;
    G.civs.push({ x, z, sp: 1.7 + r() * 0.7, ph: r() * 100, hd: 0, color: CIV_COLORS[Math.floor(r() * CIV_COLORS.length)], gone: false });
}
function spawnUnit(kind, from, goal, name) {
    const s = UNITS[kind], members = [];
    for (let k = 0; k < s.members; k++) {
        const a = (k / s.members) * Math.PI * 2, r = s.members > 1 ? s.spread * (k % 2 ? 1 : 0.6) : 0;
        members.push({ hp: s.hp, maxHp: s.hp, ox: Math.cos(a) * r, oz: Math.sin(a) * r, cd: G.rnd() * s.rof, x: ci(from) + 0.5, z: cj(from) + 0.5, hd: 0 });
    }
    unitCount[kind]++;
    const u = {
        id: G.nextId++, kind, name: name !== null && name !== void 0 ? name : `${s.name} ${unitCount[kind]}`, x: ci(from) + 0.5, z: cj(from) + 0.5, hd: 0,
        members, goal: -1, field: null, aim: null, kills: 0, people: kind === 'militia' ? s.members * PER_AGENT : 0,
    };
    G.units.push(u);
    if (goal >= 0)
        sendUnit(u, goal);
    return u;
}
function fieldTo(c) {
    let f = fieldCache.get(c);
    if (!f) {
        if (fieldCache.size > 40)
            fieldCache.clear();
        f = new Float32Array(W * H);
        distanceField(f, [c]);
        fieldCache.set(c, f);
    }
    return f;
}
function sendUnit(u, c) {
    const f = fieldTo(c);
    if (f[cellOf(u.x, u.z)] >= INF)
        return; // unreachable
    u.goal = c;
    u.field = f;
}
// ---- orders from the player ----
/** Spend money; returns an error message, or null when the order went through. */
function order(kind, x, z, block) {
    if (G.over)
        return 'The campaign is over.';
    const cost = ORDER_COST[kind];
    if (G.funds < cost)
        return `Needs $${cost}. You have $${Math.floor(G.funds)}.`;
    if (kind === 'militia') {
        if (!block || block.district === 'park' || block.district === 'base')
            return 'Pick a block with residents to raise militia from.';
        if (block.pop < 6 * PER_AGENT)
            return `${block.name} has too few people left to raise militia.`;
        const door = block.doors.reduce((a, d) => (G.zField[d] > G.zField[a] ? d : a), block.doors[0]);
        block.pop -= 6 * PER_AGENT;
        spawnUnit('militia', door, -1, `Militia, ${block.name}`);
        say(`${block.name} raises a militia company from 60 volunteers.`);
    }
    else if (kind === 'infantry' || kind === 'apc' || kind === 'tank') {
        const c = nearestWalkable(x, z);
        if (c < 0)
            return 'Pick a street, park or quay.';
        const u = spawnUnit(kind, G.hq, c);
        say(`${u.name} rolls out of Fort Aldermoor.`);
    }
    else if (kind === 'strike') {
        G.strikes.push({ x, z, t: 2.5, dir: G.rnd() * Math.PI, bombs: 5 });
        say('Air strike inbound. Keep your people clear.', 'key');
    }
    else if (kind === 'gunship') {
        G.gunships.push({ x, z, t: 45, ang: 0, cd: 0, hx: x + 5, hz: z });
        say('Gunship on station for 45 seconds.', 'key');
    }
    else if (kind === 'evac') {
        const c = nearestWalkable(x, z);
        if (c < 0 || G.grid[c] === 2 /* Cell.Park */ || G.grid[c] === 5 /* Cell.Base */)
            return 'Evacuation points go on a street or the quay.';
        if (G.evacs.some(e => dist2(e.x, e.z, ci(c) + 0.5, cj(c) + 0.5) < 36))
            return 'Too close to another evacuation point.';
        G.evacs.push({ id: G.nextId++, kind: 'bus', x: ci(c) + 0.5, z: cj(c) + 0.5, cell: c, queue: 0, timer: 10, interval: 10, cap: 70, departed: 0, maxQueue: 350, full: false, biteT: 0 });
        G.eFieldDirty = true;
        say('Buses will run from the new evacuation point.', 'key');
    }
    G.funds -= cost;
    G.stats.spent += cost;
    return null;
}
function moveUnits(units, x, z) {
    const c = nearestWalkable(x, z);
    if (c < 0)
        return;
    for (const u of units)
        sendUnit(u, c);
}
function evacuateBlock(b) {
    if (b.pop <= 0 || b.evacuating)
        return;
    b.evacuating = true;
    say(`${b.name} is evacuating.`);
}
// ---- the step ----
function tick(dt) {
    G.t += dt;
    G.zedSpeed = 1 + (G.t / GAME_SECONDS) * 0.35;
    G.funds += dt * 10;
    for (const e of G.evacs) {
        const full = e.queue >= e.maxQueue;
        if (full !== e.full) {
            e.full = full;
            G.eFieldDirty = true;
        }
    }
    if (G.eFieldDirty) {
        // civilians head for the nearest evacuation point with room; if every one is full, the nearest of any
        const open = G.evacs.filter(e => !e.full);
        distanceField(G.eField, (open.length ? open : G.evacs).map(e => e.cell));
        G.eFieldDirty = false;
    }
    zFieldT -= dt;
    if (zFieldT <= 0) {
        zFieldT = 0.4;
        rebuildZField();
    }
    zHash.build(G.zeds);
    cHash.build(G.civs);
    while (G.sparks.length && G.t >= G.sparks[0]) {
        G.sparks.shift();
        spark();
    }
    for (const b of G.blocks)
        updateBlock(b, dt);
    for (const c of G.civs)
        if (!c.gone)
            updateCiv(c, dt);
    for (const u of G.units)
        updateUnit(u, dt);
    for (const s of G.strikes)
        updateStrike(s, dt);
    for (const g of G.gunships)
        updateGunship(g, dt);
    const n = G.zeds.length;
    for (let k = 0; k < n; k++) {
        const z = G.zeds[k];
        if (z.hp > 0)
            updateZed(z, dt);
    }
    for (const e of G.evacs)
        updateEvac(e, dt);
    // clear away the dead
    G.zeds = G.zeds.filter(z => z.hp > 0);
    G.civs = G.civs.filter(c => !c.gone);
    G.strikes = G.strikes.filter(s => s.t > -1.5);
    G.gunships = G.gunships.filter(g => { if (g.t <= 0)
        say('The gunship returns to base.'); return g.t > 0; });
    for (const u of G.units) {
        const before = u.members.length;
        u.members = u.members.filter(m => m.hp > 0);
        if (u.people > 0) {
            const lost = Math.min(u.people, (before - u.members.length) * PER_AGENT);
            u.people -= lost;
            G.stats.dead += lost;
        }
        if (before && !u.members.length) {
            G.stats.unitsLost++;
            say(`${u.name} has been wiped out.`, 'bad');
        }
    }
    G.units = G.units.filter(u => u.members.length);
    for (const t of G.tracers)
        t.t -= dt;
    G.tracers = G.tracers.filter(t => t.t > 0);
    for (const b of G.booms)
        b.t -= dt;
    G.booms = G.booms.filter(b => b.t > 0);
    if (G.t >= GAME_SECONDS)
        finish('time');
    else if (G.t > 5 && G.blocks.every(b => b.pop <= 0) && !G.civs.length && G.evacs.every(e => e.queue <= 0))
        finish('empty');
}
/** Beyond this the infected wander instead of hunting. */
const AGGRO = 18, DOOR_SCENT = 10;
/**
 * The infected head for the nearest people: anyone on the streets, troops and crowds draw them from
 * AGGRO cells away; shut doors only from AGGRO - DOOR_SCENT, so a quiet street isn't a beacon.
 */
function rebuildZField() {
    const src = [], doors = [];
    for (const c of G.civs)
        if (!c.gone)
            src.push(cellOf(c.x, c.z));
    for (const u of G.units)
        for (const m of u.members)
            src.push(cellOf(m.x, m.z));
    for (const e of G.evacs)
        if (e.queue > 0)
            src.push(e.cell);
    for (const b of G.blocks)
        if (b.pop > 0)
            for (const d of b.doors)
                doors.push(d);
    distanceField(G.zField, src);
    distanceField(doorField, doors);
    for (let k = 0; k < W * H; k++)
        G.zField[k] = Math.min(G.zField[k], doorField[k] + DOOR_SCENT);
}
function spark() {
    const cand = G.blocks.filter(b => b.pop > 200 && !b.fallen && b.bx + b.bz > 2);
    if (!cand.length)
        return;
    const b = cand[Math.floor(G.rnd() * cand.length)];
    outbreak(b, 8);
    say(`New outbreak in ${b.name}. Someone brought it home.`, 'bad');
}
function updateBlock(b, dt) {
    if (b.pop <= 0)
        return;
    if (!b.evacuating && G.t - b.lastPanicCheck > 1) {
        b.lastPanicCheck = G.t;
        for (const d of b.doors) {
            if (zHash.nearest(ci(d) + 0.5, cj(d) + 0.5, 6, z => z.hp > 0)) {
                b.evacuating = true;
                if (b.pop >= 300 && G.t > panicSaid) {
                    panicSaid = G.t + 8;
                    say(`Panic in ${b.name}: residents are running for the evacuation points.`, 'bad');
                }
                break;
            }
        }
    }
    if (!b.evacuating || G.civs.length >= MAX_CIVS)
        return;
    b.emitT -= dt;
    if (b.emitT > 0)
        return;
    b.emitT = EMIT_EVERY;
    // leave by the door nearest an evacuation point that has no infected outside it
    let door = -1;
    for (const d of b.doors) {
        if (G.eField[d] >= INF || zHash.nearest(ci(d) + 0.5, cj(d) + 0.5, 3, z => z.hp > 0))
            continue;
        if (door < 0 || G.eField[d] < G.eField[door])
            door = d;
    }
    if (door < 0)
        return; // nowhere safe to run to: they stay behind their doors
    spawnCiv(ci(door) + 0.2 + G.rnd() * 0.6, cj(door) + 0.2 + G.rnd() * 0.6);
    b.pop -= PER_AGENT;
}
function updateCiv(c, dt) {
    const here = G.eField[cellOf(c.x, c.z)];
    if (here <= 1) {
        let best = null, bd = INF;
        for (const e of G.evacs) {
            const d = dist2(e.x, e.z, c.x, c.z);
            if (d < bd) {
                bd = d;
                best = e;
            }
        }
        if (best && bd < 9) {
            best.queue += PER_AGENT;
            c.gone = true;
            return;
        }
    }
    // shy away from infected close by, otherwise head for the nearest evacuation point
    const z = zHash.nearest(c.x, c.z, 2.2, z => z.hp > 0 && z.rise <= 0);
    if (z) {
        stepToward(c, c.x * 2 - z.x, c.z * 2 - z.z, c.sp * dt);
        return;
    }
    const next = downhill(G.eField, c.x, c.z);
    if (!next)
        return;
    const j = Math.sin(c.ph) * 0.3;
    stepToward(c, next[0] + j, next[1] - j, c.sp * dt);
}
function updateZed(z, dt) {
    if (z.rise > 0) {
        z.rise -= dt;
        return;
    }
    z.cd -= dt;
    // bite anyone within reach
    if (z.cd <= 0) {
        const v = cHash.nearest(z.x, z.z, 0.75, c => !c.gone);
        if (v) {
            v.gone = true;
            G.stats.dead += PER_AGENT;
            spawnZed(v.x, v.z);
            z.cd = 0.9;
            return;
        }
        for (const u of G.units) {
            if (dist2(u.x, u.z, z.x, z.z) > 9)
                continue;
            const m = u.members.find(m => m.hp > 0 && dist2(m.x, m.z, z.x, z.z) < (UNITS[u.kind].vehicle ? 1.1 : 0.6));
            if (m) {
                m.hp -= 1;
                z.cd = 1.0;
                if (m.hp <= 0 && !UNITS[u.kind].vehicle && G.rnd() < 0.5)
                    spawnZed(m.x, m.z); // the fallen get back up
                return;
            }
        }
        const b = G.doorOf[cellOf(z.x, z.z)];
        if (b >= 0 && G.blocks[b].pop > 0) {
            const blk = G.blocks[b];
            blk.evacuating = true;
            // the doors hold for a while; once they give, people inside are caught a few at a time
            if (blk.breach < BREACH) {
                blk.breach += 1;
                z.cd = 1;
                return;
            }
            z.cd = 1;
            if (G.t < blk.convertT)
                return;
            blk.convertT = G.t + CONVERT_EVERY;
            blk.pop -= PER_AGENT;
            G.stats.dead += PER_AGENT;
            spawnZed(z.x + (G.rnd() - 0.5), z.z + (G.rnd() - 0.5));
            if (blk.pop <= 0 && !blk.fallen) {
                blk.fallen = true;
                G.changed = true;
                say(`${blk.name} has been overrun.`, 'bad');
            }
            return;
        }
        for (const e of G.evacs) {
            if (e.queue > 0 && dist2(e.x, e.z, z.x, z.z) < 4) {
                z.cd = 0.9;
                if (G.t < e.biteT)
                    return;
                e.biteT = G.t + 0.8;
                e.queue -= PER_AGENT;
                G.stats.dead += PER_AGENT;
                spawnZed(z.x, z.z);
                if (G.rnd() < 0.08)
                    say(`The infected are among the crowd at ${e.kind === 'harbor' ? 'the harbour' : 'a bus stop'}.`, 'bad');
                return;
            }
        }
    }
    if (z.cd > 0.5)
        return; // still busy with the last bite
    const f = G.zField[cellOf(z.x, z.z)], sp = z.sp * G.zedSpeed * dt;
    if (f < AGGRO) {
        const next = downhill(G.zField, z.x, z.z);
        if (next) {
            const j = Math.sin(z.ph + G.t * 0.7) * 0.35;
            stepToward(z, next[0] + j, next[1] + Math.cos(z.ph) * 0.35, sp);
        }
        else {
            // standing on a target cell: close in on whatever is there
            const v = cHash.nearest(z.x, z.z, 2, c => !c.gone);
            if (v)
                stepToward(z, v.x, v.z, sp);
            else
                for (const u of G.units)
                    if (dist2(u.x, u.z, z.x, z.z) < 4) {
                        stepToward(z, u.x, u.z, sp);
                        break;
                    }
        }
    }
    else {
        // nothing in reach: shamble about
        if (dist2(z.x, z.z, z.wx, z.wz) < 0.3 || G.rnd() < dt * 0.1) {
            z.wx = z.x + (G.rnd() - 0.5) * 6;
            z.wz = z.z + (G.rnd() - 0.5) * 6;
        }
        stepToward(z, z.wx, z.wz, sp * 0.5);
    }
}
function hitZed(z, dmg, u) {
    if (z.hp <= 0)
        return;
    z.hp -= dmg;
    if (z.hp <= 0) {
        G.stats.killed++;
        G.funds += 3;
        if (u)
            u.kills++;
    }
}
function updateUnit(u, dt) {
    const s = UNITS[u.kind];
    if (u.goal >= 0 && u.field) {
        if (u.field[cellOf(u.x, u.z)] === 0) {
            u.goal = -1;
            u.field = null;
        }
        else {
            const next = downhill(u.field, u.x, u.z);
            if (next)
                stepToward(u, next[0], next[1], s.speed * dt);
            else {
                u.goal = -1;
                u.field = null;
            }
        }
    }
    for (const m of u.members) {
        const tx = u.x + m.ox, tz = u.z + m.oz;
        const gx = walkableAt(tx, tz) ? tx : u.x, gz = walkableAt(tx, tz) ? tz : u.z;
        m.x += (gx - m.x) * Math.min(1, dt * 8);
        m.z += (gz - m.z) * Math.min(1, dt * 8);
        m.cd -= dt;
        if (m.cd > 0)
            continue;
        const target = zHash.nearest(m.x, m.z, s.range, z => z.hp > 0);
        if (!target) {
            m.cd = 0.25;
            continue;
        }
        m.cd = s.rof * (0.85 + G.rnd() * 0.3);
        m.hd = Math.atan2(target.x - m.x, target.z - m.z);
        if (s.vehicle) {
            u.aim = { x: target.x, z: target.z };
            if (u.goal < 0)
                u.hd = m.hd;
        }
        const hit = G.rnd() < s.acc;
        const tx2 = hit ? target.x : target.x + (G.rnd() - 0.5) * 1.5, tz2 = hit ? target.z : target.z + (G.rnd() - 0.5) * 1.5;
        G.tracers.push({ x1: m.x, z1: m.z, y1: s.vehicle ? 0.9 : 0.55, x2: tx2, z2: tz2, t: u.kind === 'tank' ? 0.25 : 0.08, color: u.kind === 'militia' ? 0xffd27a : 0xfff0b0 });
        if (s.splash) {
            G.booms.push({ x: tx2, z: tz2, t: 0.5, size: 1.2 });
            zHash.near(tx2, tz2, s.splash, z => { hitZed(z, s.dmg, u); });
        }
        else if (hit)
            hitZed(target, s.dmg, u);
    }
}
function updateStrike(s, dt) {
    s.t -= dt;
    if (s.t > 0 || !s.bombs)
        return;
    for (let k = 0; k < s.bombs; k++) {
        const o = (k - (s.bombs - 1) / 2) * 1.7, x = s.x + Math.cos(s.dir) * o, z = s.z + Math.sin(s.dir) * o;
        G.booms.push({ x, z, t: 0.9 + k * 0.05, size: 2.6 });
        zHash.near(x, z, 2.4, zd => { hitZed(zd, 99, null); });
        cHash.near(x, z, 2.4, c => { if (!c.gone) {
            c.gone = true;
            G.stats.dead += PER_AGENT;
        } });
        for (const u of G.units)
            for (const m of u.members)
                if (dist2(m.x, m.z, x, z) < 2.4 * 2.4)
                    m.hp -= UNITS[u.kind].vehicle ? 20 : 4;
    }
    // buildings on the line take casualties too
    for (const b of G.blocks) {
        if (b.pop <= 0 || dist2(b.x0 + 3, b.z0 + 3, s.x, s.z) > 30)
            continue;
        const lost = Math.round(b.pop * 0.15 / PER_AGENT) * PER_AGENT;
        if (lost > 0) {
            b.pop -= lost;
            G.stats.dead += lost;
            say(`The air strike killed ${lost} people in ${b.name}.`, 'bad');
        }
    }
    s.bombs = 0;
}
function updateGunship(g, dt) {
    g.t -= dt;
    g.ang += dt * 0.55;
    g.hx = g.x + Math.cos(g.ang) * 5;
    g.hz = g.z + Math.sin(g.ang) * 5;
    g.cd -= dt;
    if (g.cd > 0)
        return;
    const target = zHash.nearest(g.hx, g.hz, 11, z => z.hp > 0);
    if (!target) {
        g.cd = 0.3;
        return;
    }
    g.cd = 0.1;
    const hit = G.rnd() < 0.8;
    G.tracers.push({ x1: g.hx, z1: g.hz, y1: 6, x2: target.x, z2: target.z, t: 0.07, color: 0xffe08a });
    if (hit)
        hitZed(target, 2, null);
}
function updateEvac(e, dt) {
    e.timer -= dt;
    if (e.timer > 0)
        return;
    e.timer = e.interval;
    const take = Math.min(e.queue, e.cap);
    if (take <= 0)
        return;
    e.queue -= take;
    e.departed++;
    G.stats.evacuated += take;
    G.funds += take * 0.6;
    if (e.kind === 'harbor')
        say(`A ship sails from the harbour with ${take} people aboard.`, 'good');
    else if (G.t > busSaid) {
        busSaid = G.t + 30;
        say(`Buses are running: ${take} more people on their way out.`, 'good');
    }
}
function finish(why) {
    if (G.over)
        return;
    // the last ship and the last buses take one more load each; militia leave with them
    for (const e of G.evacs) {
        const take = Math.min(e.queue, e.cap);
        G.stats.evacuated += take;
        e.queue -= take;
    }
    for (const u of G.units)
        if (u.people > 0)
            G.stats.evacuated += u.people;
    const pct = (G.stats.evacuated / G.stats.total) * 100;
    const grade = pct >= 60 ? 'Saviour of the city' : pct >= 45 ? 'An orderly withdrawal' : pct >= 30 ? 'A bitter retreat' : 'Catastrophe';
    G.over = { why, pct, grade };
    say(why === 'time' ? 'The last ship has sailed.' : 'There is nobody left in the city to save.', 'key');
}

// ---- view.ts ----
// The 3D view: a painted ground texture, instanced buildings, trees and people, a few meshes for
// vehicles, ships and aircraft, and pooled effects (tracers, explosions, smoke). Reads G every frame.
const V = {
    renderer: null,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(42, 1, 0.5, 400),
    sun: new THREE.DirectionalLight(0xfff1d6, 0.95),
    cam: { x: 46, z: 34, dist: 72, yaw: 0, pitch: 0.95 },
    dummy: new THREE.Object3D(),
    color: new THREE.Color(),
    mats: new Map(),
};
function vmat(color, o = {}) {
    var _a, _b;
    const key = `${color}|${(_a = o.glow) !== null && _a !== void 0 ? _a : 0}|${(_b = o.opacity) !== null && _b !== void 0 ? _b : 1}|${o.vertex ? 1 : 0}`;
    let m = V.mats.get(key);
    if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, vertexColors: false });
        if (o.glow) {
            m.emissive = new THREE.Color(o.glow);
            m.emissiveIntensity = 1;
        }
        if (o.opacity !== undefined && o.opacity < 1) {
            m.transparent = true;
            m.opacity = o.opacity;
            m.depthWrite = false;
        }
        V.mats.set(key, m);
    }
    return m;
}
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const GABLE = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0);
    s.lineTo(0.5, 0);
    s.lineTo(0, 1);
    s.lineTo(-0.5, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
})();
function inst(geo, m, n, shadow = true) {
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, n));
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.count = 0;
    im.frustumCulled = false;
    V.scene.add(im);
    return im;
}
function setInst(im, k, x, y, z, sx, sy, sz, ry = 0, rx = 0, color) {
    const d = V.dummy;
    d.position.set(x, y, z);
    d.scale.set(sx, sy, sz);
    d.rotation.set(rx, ry, 0);
    d.updateMatrix();
    im.setMatrixAt(k, d.matrix);
    if (color !== undefined)
        im.setColorAt(k, V.color.setHex(color));
}
// ---- static city ----
const blockInst = new Map();
function paintGround() {
    const px = 12, cv = document.createElement('canvas');
    cv.width = W * px;
    cv.height = SEA_Z * px;
    const g = cv.getContext('2d');
    g.fillStyle = '#45494b';
    g.fillRect(0, 0, cv.width, cv.height);
    for (const b of G.blocks) {
        const x = b.x0 * px, z = b.z0 * px, s = 6 * px;
        g.fillStyle = '#8d8a80';
        g.fillRect(x - 4, z - 4, s + 8, s + 8); // pavement
        g.fillStyle = b.district === 'park' ? '#6f8a55' : b.district === 'base' ? '#8c8456' : b.district === 'industrial' || b.district === 'docks' ? '#6f6c64' : '#7b776c';
        g.fillRect(x, z, s, s);
        if (b.district === 'park') {
            g.strokeStyle = '#b9ae8c';
            g.lineWidth = 5;
            g.beginPath();
            g.moveTo(x, z + s / 2);
            g.quadraticCurveTo(x + s / 2, z, x + s, z + s / 2);
            g.moveTo(x + s / 2, z + s);
            g.lineTo(x + s / 2, z + s * 0.3);
            g.stroke();
        }
        if (b.district === 'base') {
            g.strokeStyle = '#e4dfcf';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(x + s * 0.5, z + s * 0.62, px * 1.3, 0, Math.PI * 2);
            g.stroke();
            g.font = `bold ${px * 1.4}px sans-serif`;
            g.fillStyle = '#e4dfcf';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('H', x + s * 0.5, z + s * 0.62);
        }
    }
    // lane markings down the middle of each road
    g.strokeStyle = 'rgba(230,220,180,.55)';
    g.lineWidth = 1.5;
    g.setLineDash([px * 0.6, px * 0.6]);
    for (let k = 0; k <= W; k += 8) {
        g.beginPath();
        g.moveTo((k + 1) * px, 0);
        g.lineTo((k + 1) * px, QUAY_Z * px);
        g.stroke();
    }
    for (let k = 0; k <= QUAY_Z; k += 8) {
        g.beginPath();
        g.moveTo(0, (k + 1) * px);
        g.lineTo(W * px, (k + 1) * px);
        g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = '#9a958a';
    g.fillRect(0, QUAY_Z * px, cv.width, (SEA_Z - QUAY_Z) * px); // the quay
    g.fillStyle = '#c9b45a';
    g.fillRect(0, (SEA_Z - 0.25) * px, cv.width, 3);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, SEA_Z), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(W / 2, 0, SEA_Z / 2);
    m.receiveShadow = true;
    return m;
}
function buildCity() {
    V.scene.add(paintGround());
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), vmat(0x4f6f78));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(W / 2, -0.35, H / 2);
    sea.receiveShadow = true;
    V.scene.add(sea);
    const quayWall = new THREE.Mesh(UNIT_BOX, vmat(0x7e796f));
    quayWall.scale.set(W, 0.35, 0.3);
    quayWall.position.set(W / 2, -0.35, SEA_Z + 0.15);
    V.scene.add(quayWall);
    const all = G.blocks.flatMap(b => b.buildings.map(bd => ({ b, bd })));
    const flats = all.filter(a => a.bd.kind !== 'house' && a.bd.kind !== 'tank');
    const bodies = inst(UNIT_BOX, vmat(0xffffff), flats.length + all.filter(a => a.bd.kind === 'house').length);
    const roofs = inst(UNIT_BOX, vmat(0xffffff), flats.length);
    const gables = inst(GABLE, vmat(0xffffff), all.length);
    const tanks = inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0), vmat(0xffffff), all.length);
    let bandN = 0;
    for (const a of flats)
        if (a.bd.h >= 2)
            bandN += Math.floor(a.bd.h / 1.1);
    const bands = inst(UNIT_BOX, vmat(0x2b3438), bandN, false);
    const note = (b, im, k, color) => { if (!blockInst.has(b.id))
        blockInst.set(b.id, []); blockInst.get(b.id).push({ im, k, color }); };
    for (const { b, bd } of all) {
        if (bd.kind === 'tank') {
            const k = tanks.count++;
            setInst(tanks, k, bd.x, 0, bd.z, bd.w, bd.h, bd.d, 0, 0, bd.color);
            note(b, tanks, k, bd.color);
            continue;
        }
        const k = bodies.count++;
        setInst(bodies, k, bd.x, 0, bd.z, bd.w, bd.h, bd.d, 0, 0, bd.color);
        note(b, bodies, k, bd.color);
        if (bd.kind === 'house') {
            const g = gables.count++;
            setInst(gables, g, bd.x, bd.h, bd.z, bd.d * 1.1, 0.8, bd.w * 1.08, Math.PI / 2, 0, bd.roof);
            note(b, gables, g, bd.roof);
        }
        else {
            const r = roofs.count++;
            setInst(roofs, r, bd.x, bd.h, bd.z, bd.w + 0.12, 0.14, bd.d + 0.12, 0, 0, bd.roof);
            note(b, roofs, r, bd.roof);
            if (bd.h >= 2)
                for (let f = 0; f < Math.floor(bd.h / 1.1); f++)
                    setInst(bands, bands.count++, bd.x, 0.5 + f * 1.1, bd.z, bd.w + 0.04, 0.32, bd.d + 0.04);
        }
    }
    for (const im of [bodies, roofs, gables, tanks, bands]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor)
            im.instanceColor.needsUpdate = true;
    }
    const trunks = inst(new THREE.CylinderGeometry(0.08, 0.1, 1, 5).translate(0, 0.5, 0), vmat(0x6b5236), trees.length);
    const crowns = inst(new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0), vmat(0x5f7a48), trees.length);
    for (const [x, z, s] of trees) {
        setInst(trunks, trunks.count++, x, 0, z, s, s * 0.5, s);
        setInst(crowns, crowns.count++, x, s * 0.35, z, s * 1.1, s * 1.5, s * 1.1, x * 7);
    }
    // Fort Aldermoor: sandbags round the helipad and a flag
    const base = G.blocks.find(b => b.district === 'base');
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
        const m = new THREE.Mesh(UNIT_BOX, vmat(0xbfa978));
        m.scale.set(0.5, 0.3, 0.25);
        m.position.set(base.x0 + 3 + Math.cos(a) * 2.3, 0, base.z0 + 3.7 + Math.sin(a) * 2.3);
        m.rotation.y = -a;
        m.castShadow = true;
        V.scene.add(m);
    }
}
function paintBlocks() {
    for (const b of G.blocks) {
        const list = blockInst.get(b.id);
        if (!list)
            continue;
        for (const { im, k, color } of list) {
            V.color.setHex(color);
            if (b.fallen)
                V.color.multiplyScalar(0.32);
            im.setColorAt(k, V.color);
            if (im.instanceColor)
                im.instanceColor.needsUpdate = true;
        }
    }
}
// ---- people ----
const BODY = new THREE.CylinderGeometry(0.13, 0.17, 0.5, 6).translate(0, 0.25, 0);
const HEAD = new THREE.SphereGeometry(0.12, 6, 4).translate(0, 0.63, 0);
const HELMET = new THREE.SphereGeometry(0.15, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.66, 0);
let zBody, zHead, cBody, cHead, sBody, sHelm;
const MAX_SOLDIERS = 400;
function buildPeople() {
    zBody = inst(BODY, vmat(0xffffff), MAX_ZOMBIES, false);
    zHead = inst(HEAD, vmat(0x8d9a6a), MAX_ZOMBIES, false);
    cBody = inst(BODY, vmat(0xffffff), MAX_CIVS, false);
    cHead = inst(HEAD, vmat(0xd9b08c), MAX_CIVS, false);
    sBody = inst(BODY, vmat(0xffffff), MAX_SOLDIERS, false);
    sHelm = inst(HELMET, vmat(0xffffff), MAX_SOLDIERS, false);
}
const PS = 1.5; // people are drawn larger than life so they read from the air
function drawPeople(time) {
    let n = 0;
    for (const z of G.zeds) {
        if (n >= MAX_ZOMBIES)
            break;
        // the newly bitten lie on the ground until they rise; then a shambling lean and bob
        const down = z.rise > 0, bob = down ? 0.12 : Math.abs(Math.sin(time * 4 + z.ph)) * 0.05, lean = down ? Math.PI / 2 : 0.25 + Math.sin(z.ph) * 0.1;
        setInst(zBody, n, z.x, bob, z.z, PS, PS, PS, z.hd, lean, z.shirt);
        setInst(zHead, n, z.x, bob, z.z, PS, PS, PS, z.hd, lean);
        n++;
    }
    zBody.count = zHead.count = n;
    n = 0;
    for (const c of G.civs) {
        if (n >= MAX_CIVS)
            break;
        const bob = Math.abs(Math.sin(time * 9 + c.ph)) * 0.07;
        setInst(cBody, n, c.x, bob, c.z, PS, PS, PS, c.hd, 0.12, c.color);
        setInst(cHead, n, c.x, bob, c.z, PS, PS, PS, c.hd, 0.12);
        n++;
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
        if (UNITS[u.kind].vehicle)
            continue;
        const body = u.kind === 'militia' ? 0x6f6a58 : 0x3d5a78, helm = u.kind === 'militia' ? 0x4a3f33 : 0x55633a;
        for (const m of u.members) {
            if (n >= MAX_SOLDIERS)
                break;
            setInst(sBody, n, m.x, 0, m.z, PS, PS, PS, m.hd, 0, body);
            setInst(sHelm, n, m.x, 0, m.z, PS, PS, PS, m.hd, 0, helm);
            n++;
        }
    }
    sBody.count = sHelm.count = n;
    for (const im of [zBody, zHead, cBody, cHead, sBody, sHelm]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor)
            im.instanceColor.needsUpdate = true;
    }
}
// ---- vehicles, ships, aircraft ----
function part(g, color, w, h, d, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(UNIT_BOX, vmat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
}
function makeVehicle(kind) {
    const g = new THREE.Group();
    if (kind === 'tank') {
        part(g, 0x2f3329, 1.3, 0.3, 2.1);
        part(g, 0x55633a, 1.2, 0.3, 1.9, 0, 0.25);
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.y = 0.55;
        g.add(turret);
        part(turret, 0x55633a, 0.8, 0.3, 0.9);
        part(turret, 0x3f4a2c, 0.12, 0.12, 1.3, 0, 0.1, 0.9);
    }
    else {
        part(g, 0x2f3329, 1.1, 0.25, 1.9, 0, 0.05);
        part(g, 0x5d6b45, 1.05, 0.55, 1.8, 0, 0.25);
        part(g, 0x2b3438, 1.0, 0.12, 0.4, 0, 0.6, 0.55);
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.y = 0.8;
        g.add(turret);
        part(turret, 0x4a5638, 0.35, 0.18, 0.35);
        part(turret, 0x222, 0.06, 0.06, 0.5, 0, 0.06, 0.3);
    }
    g.scale.setScalar(1.1);
    V.scene.add(g);
    return g;
}
function makeShip() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-1.4, -6);
    s.lineTo(1.4, -6);
    s.lineTo(1.4, 4.5);
    s.lineTo(0, 6.5);
    s.lineTo(-1.4, 4.5);
    s.lineTo(-1.4, -6);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.6, 0), vmat(0x2f3a40));
    hull.castShadow = true;
    g.add(hull);
    part(g, 0xc4432f, 2.9, 0.15, 12.2, 0, -0.4, 0.2);
    part(g, 0xeeeae0, 2.4, 1.6, 2.6, 0, 1.0, -4.0);
    part(g, 0xeeeae0, 1.8, 0.8, 1.8, 0, 2.6, -4.0);
    part(g, 0x2b2b2b, 0.7, 1.4, 0.7, 0, 1.0, -1.8);
    part(g, 0xe2a23a, 0.72, 0.3, 0.72, 0, 2.1, -1.8);
    for (const z of [0.6, 2.4])
        part(g, 0x3d5a78, 2.2, 0.9, 1.5, 0, 1.0, z);
    g.rotation.y = Math.PI / 2;
    V.scene.add(g);
    return g;
}
function makeBus() {
    const g = new THREE.Group();
    part(g, 0xe2a23a, 0.9, 0.8, 2.4, 0, 0.12);
    part(g, 0x2b3438, 0.92, 0.22, 2.2, 0, 0.6);
    V.scene.add(g);
    return g;
}
function makeEvacMarker(kind) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(kind === 'harbor' ? 2.4 : 1.5, 0.08, 6, 32).rotateX(Math.PI / 2), vmat(0x8fb27a, { glow: 0x5f8f4a }));
    ring.position.y = 0.05;
    g.add(ring);
    const pole = part(g, 0xd8d2bf, 0.08, 2.4, 0.08);
    void pole;
    const flag = part(g, 0x8fb27a, 0.7, 0.4, 0.04, 0.35, 2.0);
    flag.name = 'flag';
    V.scene.add(g);
    return g;
}
function makeHeli() {
    const g = new THREE.Group();
    part(g, 0x3f4a3a, 0.8, 0.7, 2.0, 0, -0.35);
    part(g, 0x3f4a3a, 0.2, 0.2, 2.0, 0, 0, -1.8);
    part(g, 0x2b3438, 0.7, 0.35, 0.6, 0, -0.1, 0.75);
    const rotor = part(g, 0x222222, 4.2, 0.04, 0.2, 0, 0.45);
    rotor.name = 'rotor';
    V.scene.add(g);
    return g;
}
function makeJet() {
    const g = new THREE.Group();
    part(g, 0x6d767a, 0.45, 0.35, 2.6, 0, 0, -0.2);
    part(g, 0x5d666a, 2.6, 0.08, 0.9, 0, 0.1, -0.3);
    part(g, 0x5d666a, 0.08, 0.6, 0.5, 0, 0.3, -1.3);
    V.scene.add(g);
    return g;
}
const vehicles = new Map();
const evacMarks = new Map();
const helis = new Map();
const jets = new Map();
function drawVehicles(time) {
    const live = new Set();
    for (const u of G.units) {
        if (!UNITS[u.kind].vehicle)
            continue;
        live.add(u.id);
        let g = vehicles.get(u.id);
        if (!g) {
            g = makeVehicle(u.kind);
            vehicles.set(u.id, g);
        }
        g.position.set(u.x, 0, u.z);
        g.rotation.y += (((u.hd - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.15;
        const tur = g.getObjectByName('turret');
        if (tur && u.aim)
            tur.rotation.y = Math.atan2(u.aim.x - u.x, u.aim.z - u.z) - g.rotation.y;
    }
    for (const [id, g] of vehicles)
        if (!live.has(id)) {
            V.scene.remove(g);
            vehicles.delete(id);
            boomAt(g.position.x, g.position.z, 2.5);
        }
    for (const e of G.evacs) {
        let m = evacMarks.get(e.id);
        if (!m) {
            m = { mark: makeEvacMarker(e.kind), vehicle: e.kind === 'harbor' ? makeShip() : makeBus() };
            evacMarks.set(e.id, m);
            m.mark.position.set(e.x, 0, e.z);
        }
        const flag = m.mark.getObjectByName('flag');
        if (flag)
            flag.rotation.y = Math.sin(time * 2 + e.id) * 0.4;
        // the ship or bus pulls away when it departs and comes back before the next run
        const T = Math.min(6, e.interval * 0.3), since = e.interval - e.timer;
        const away = !e.departed ? 0 : since < T ? since / T : since < 2 * T ? 1 - (since - T) / T : 0;
        if (e.kind === 'harbor')
            m.vehicle.position.set(e.x + 2, -0.25 + Math.sin(time * 0.9) * 0.05, SEA_Z + 2.4 + away * 30);
        else {
            m.vehicle.position.set(e.x + 1.4 + away * 20, 0, e.z);
            m.vehicle.visible = away < 0.95;
        }
    }
    const liveH = new Set();
    for (const s of G.gunships) {
        liveH.add(s);
        let h = helis.get(s);
        if (!h) {
            h = makeHeli();
            helis.set(s, h);
        }
        h.position.set(s.hx, 6, s.hz);
        h.rotation.y = -s.ang;
        h.rotation.z = 0.15;
        const r = h.getObjectByName('rotor');
        if (r)
            r.rotation.y = time * 25;
    }
    for (const [s, h] of helis)
        if (!liveH.has(s)) {
            V.scene.remove(h);
            helis.delete(s);
        }
    const liveJ = new Set();
    for (const s of G.strikes) {
        if (s.t > 1.5)
            continue;
        liveJ.add(s);
        let j = jets.get(s);
        if (!j) {
            j = makeJet();
            jets.set(s, j);
        }
        const along = (1.5 - s.t) * 22 - 22, dx = Math.cos(s.dir + Math.PI / 2), dz = Math.sin(s.dir + Math.PI / 2);
        j.position.set(s.x + dx * along, 9, s.z + dz * along);
        j.rotation.y = Math.atan2(dx, dz);
    }
    for (const [s, j] of jets)
        if (!liveJ.has(s)) {
            V.scene.remove(j);
            jets.delete(s);
        }
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
        if (n >= MAX_TRACERS)
            break;
        V.color.setHex(t.color);
        const o = n * 6;
        tracerPos[o] = t.x1;
        tracerPos[o + 1] = t.y1;
        tracerPos[o + 2] = t.z1;
        tracerPos[o + 3] = t.x2;
        tracerPos[o + 4] = 0.4;
        tracerPos[o + 5] = t.z2;
        for (let k = 0; k < 2; k++) {
            tracerCol[o + k * 3] = V.color.r;
            tracerCol[o + k * 3 + 1] = V.color.g;
            tracerCol[o + k * 3 + 2] = V.color.b * 0.7;
        }
        n++;
    }
    tracerGeo.setDrawRange(0, n * 2);
    tracerGeo.attributes.position.needsUpdate = true;
    tracerGeo.attributes.color.needsUpdate = true;
}
const boomPool = [];
const extraBooms = [];
function boomAt(x, z, size) { extraBooms.push({ x, z, t: 0.9, size }); }
function drawBooms(dt) {
    for (const b of extraBooms)
        b.t -= dt;
    for (let k = extraBooms.length - 1; k >= 0; k--)
        if (extraBooms[k].t <= 0)
            extraBooms.splice(k, 1);
    const all = G.booms.concat(extraBooms);
    while (boomPool.length < all.length) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        V.scene.add(m);
        boomPool.push(m);
    }
    boomPool.forEach((m, k) => {
        const b = all[k];
        m.visible = !!b;
        if (!b)
            return;
        const life = 1 - b.t / (b.size > 2 ? 0.9 : 0.5);
        m.position.set(b.x, 0.3 + life * 0.8, b.z);
        m.scale.setScalar(b.size * (0.3 + life * 0.9));
        m.material.opacity = Math.max(0, 1 - life) * 0.85;
    });
}
// smoke over overrun blocks
let smoke;
const SMOKE_PER = 6;
function drawSmoke(time) {
    let n = 0;
    for (const b of G.blocks) {
        if (!b.fallen)
            continue;
        for (let k = 0; k < SMOKE_PER && n < smoke.instanceMatrix.count; k++) {
            const u = ((time * 0.08 + k / SMOKE_PER + b.id * 0.37) % 1), s = 0.8 + u * 2.4;
            setInst(smoke, n++, b.x0 + 3 + Math.sin(b.id + k) * 1.2 + u * 2, 2 + u * 9, b.z0 + 3 + Math.cos(b.id * 3 + k) * 1.2, s, s, s);
        }
    }
    smoke.count = n;
    smoke.instanceMatrix.needsUpdate = true;
}
// ---- selection and placement markers ----
const selRings = [];
const ringGeo = new THREE.TorusGeometry(1, 0.06, 4, 28).rotateX(Math.PI / 2);
const ghost = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 4, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fb27a, transparent: true, opacity: 0.9, depthWrite: false }));
const goalMark = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 4, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe2a23a }));
const blockMark = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: 0xe2a23a }));
function drawMarkers(sel, selBlock, place, time) {
    while (selRings.length < sel.length) {
        const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe2a23a }));
        V.scene.add(m);
        selRings.push(m);
    }
    selRings.forEach((m, k) => {
        const u = sel[k];
        m.visible = !!u;
        if (!u)
            return;
        m.position.set(u.x, 0.06, u.z);
        m.scale.setScalar(UNITS[u.kind].vehicle ? 1.6 : 1.3);
    });
    const g = sel.find(u => u.goal >= 0);
    goalMark.visible = !!g;
    if (g) {
        goalMark.position.set(ci(g.goal) + 0.5, 0.06, cj(g.goal) + 0.5);
        goalMark.scale.setScalar(1 + Math.sin(time * 6) * 0.15);
    }
    blockMark.visible = !!selBlock;
    if (selBlock) {
        const h = Math.max(1.5, ...selBlock.buildings.map(b => b.h)) + 0.3;
        blockMark.position.set(selBlock.x0 + 3, 0, selBlock.z0 + 3);
        blockMark.scale.set(6.4, h, 6.4);
    }
    ghost.visible = !!place;
    if (place) {
        ghost.position.set(place.x, 0.1, place.z);
        ghost.scale.setScalar(place.r);
        ghost.material.color.setHex(place.ok ? 0x8fb27a : 0xc4432f);
    }
}
// ---- camera ----
function placeCamera() {
    const c = V.cam, h = Math.sin(c.pitch) * c.dist, back = Math.cos(c.pitch) * c.dist;
    V.camera.position.set(c.x - Math.sin(c.yaw) * back, h, c.z + Math.cos(c.yaw) * back);
    V.camera.lookAt(c.x, 0, c.z);
    // keep the shadow map centred on what you are looking at
    V.sun.position.set(c.x + 18, 34, c.z + 10);
    V.sun.target.position.set(c.x, 0, c.z);
    V.sun.target.updateMatrixWorld();
    const s = Math.max(30, c.dist * 0.9);
    Object.assign(V.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    V.sun.shadow.camera.updateProjectionMatrix();
}
function panCamera(dxPx, dyPx) {
    const c = V.cam, k = c.dist / (V.renderer.domElement.clientHeight || 600) * 1.1;
    const dx = -dxPx * k, dz = -dyPx * k / Math.sin(c.pitch);
    c.x = clamp(c.x + dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), 0, W);
    c.z = clamp(c.z + dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw), 0, H);
}
function zoomCamera(f) { V.cam.dist = clamp(V.cam.dist * f, 14, 95); }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPt = new THREE.Vector3();
function screenToGround(clientX, clientY) {
    const r = V.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, V.camera);
    return ray.ray.intersectPlane(groundPlane, hitPt) ? { x: hitPt.x, z: hitPt.z } : null;
}
function initView(host) {
    try {
        V.renderer = new THREE.WebGLRenderer({ antialias: true });
    }
    catch (e) {
        return false;
    }
    const r = V.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(r.domElement);
    V.scene.background = new THREE.Color(0x1c2326);
    V.scene.fog = new THREE.Fog(0x1c2326, 90, 190);
    V.scene.add(new THREE.HemisphereLight(0xfff5e0, 0x4a4a40, 0.6));
    V.sun.castShadow = true;
    V.sun.shadow.mapSize.set(2048, 2048);
    V.sun.shadow.bias = -0.0015;
    V.scene.add(V.sun, V.sun.target, tracers, ghost, goalMark, blockMark);
    smoke = inst(new THREE.SphereGeometry(0.5, 7, 5), vmat(0x34312d, { opacity: 0.5 }), 63 * SMOKE_PER, false);
    buildCity();
    buildPeople();
    paintBlocks();
    resizeView();
    return true;
}
function resizeView() {
    const el = V.renderer.domElement.parentElement, w = el.clientWidth, h = el.clientHeight;
    V.renderer.setSize(w, h);
    V.camera.aspect = w / Math.max(1, h);
    V.camera.updateProjectionMatrix();
}
function drawFrame(time, dt, sel, selBlock, place) {
    if (G.changed) {
        paintBlocks();
        G.changed = false;
    }
    drawPeople(time);
    drawVehicles(time);
    drawTracers();
    drawBooms(dt);
    drawSmoke(time);
    drawMarkers(sel, selBlock, place, time);
    placeCamera();
    V.renderer.render(V.scene, V.camera);
}

// ---- ui.ts ----
// The HTML around the 3D view: the top bar, the selection panel and dispatch log, the build bar,
// the start, help and end screens, and pointer, touch and keyboard input.
const UI = {
    sel: [],
    block: null,
    evac: null,
    mode: null,
    hover: null,
    overlay: 'start',
    lastHud: 0,
    lastPanelKey: '',
    toastT: 0,
};
const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BUILD = [
    { o: 'evac', label: 'Evac point', key: '1', hint: 'Tap a street to open a bus evacuation point.' },
    { o: 'militia', label: 'Militia', key: '2', hint: 'Tap a block with residents to raise militia there.' },
    { o: 'infantry', label: 'Infantry', key: '3', hint: 'Tap where to send an infantry squad from Fort Aldermoor.' },
    { o: 'apc', label: 'APC', key: '4', hint: 'Tap where to send an armoured personnel carrier.' },
    { o: 'tank', label: 'Tank', key: '5', hint: 'Tap where to send a tank.' },
    { o: 'strike', label: 'Air strike', key: '6', hint: 'Tap a target. Bombs fall in a line about 8 cells long: anyone under them dies.' },
    { o: 'gunship', label: 'Gunship', key: '7', hint: 'Tap a point for the gunship to circle for 45 seconds.' },
];
const PLACE_R = { evac: 1.5, militia: 3.5, infantry: 1, apc: 1.2, tank: 1.2, strike: 4.2, gunship: 5 };
function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    UI.toastT = performance.now() + 2600;
}
function buildBar() {
    $('#bar').innerHTML = BUILD.map(b => `<button class="bb" data-order="${b.o}" title="${esc(b.hint)} (key ${b.key})"><b>${b.label}</b><small>$${ORDER_COST[b.o]}<kbd>${b.key}</kbd></small></button>`).join('');
}
function setMode(o) {
    if (o === 'militia' && UI.block) {
        const err = order('militia', 0, 0, UI.block);
        if (err)
            toast(err);
        UI.mode = null;
        refreshPanel(true);
        return;
    }
    if (o && UI.mode !== o && G.funds < ORDER_COST[o]) {
        toast(`Needs $${ORDER_COST[o]}. You have $${Math.floor(G.funds)}.`);
        return;
    }
    UI.mode = UI.mode === o ? null : o;
    const hint = $('#hint');
    const b = BUILD.find(x => x.o === UI.mode);
    hint.hidden = !b;
    if (b)
        hint.innerHTML = `${esc(b.hint)} <button data-act="cancel">Cancel</button>`;
    document.querySelectorAll('#bar .bb').forEach(el => el.classList.toggle('on', el.dataset.order === UI.mode));
}
function updateHud(now) {
    if (now - UI.lastHud < 200)
        return;
    UI.lastHud = now;
    const s = G.stats, atRisk = G.blocks.reduce((a, b) => a + b.pop, 0) + G.civs.length * PER_AGENT + G.evacs.reduce((a, e) => a + e.queue, 0);
    const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v)
        el.textContent = v; };
    set('h-time', fmtTime(GAME_SECONDS - G.t));
    set('h-funds', `$${Math.floor(G.funds)}`);
    set('h-evac', fmtPeople(s.evacuated));
    set('h-dead', fmtPeople(s.dead));
    set('h-inf', fmtPeople(G.zeds.length * PER_AGENT));
    set('h-risk', fmtPeople(atRisk));
    set('h-pct', `${((s.evacuated / s.total) * 100).toFixed(0)}% saved`);
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === G.speed));
    document.querySelectorAll('#bar .bb').forEach(b => b.classList.toggle('poor', G.funds < ORDER_COST[b.dataset.order]));
    refreshPanel(false);
    if (UI.toastT && now > UI.toastT) {
        $('#toast').hidden = true;
        UI.toastT = 0;
    }
}
function bar(v, max, cls = '') { return `<span class="hp ${cls}"><i style="width:${clamp((v / Math.max(1, max)) * 100, 0, 100).toFixed(0)}%"></i></span>`; }
function refreshPanel(force) {
    UI.sel = UI.sel.filter(u => G.units.includes(u));
    let html = '';
    if (UI.sel.length) {
        html = UI.sel.slice(0, 6).map(u => {
            const s = UNITS[u.kind], hp = u.members.reduce((a, m) => a + m.hp, 0), max = s.members * s.hp;
            return `<div class="unit"><div class="row"><b>${esc(u.name)}</b><span>${s.vehicle ? '' : `${u.members.length}/${s.members} men · `}${u.kills} kills</span></div>${bar(hp, max, hp < max * 0.35 ? 'low' : '')}<p class="note">${u.goal >= 0 ? 'Moving' : 'Holding and firing at anything in range'} · range ${s.range}</p></div>`;
        }).join('') + (UI.sel.length > 6 ? `<p class="note">and ${UI.sel.length - 6} more</p>` : '') +
            `<p class="note">Tap a street to move. Right-click also moves. Esc to deselect.</p><button data-act="desel" class="btn">Deselect</button>`;
    }
    else if (UI.block) {
        const b = UI.block, status = b.fallen ? 'Overrun' : b.pop <= 0 ? 'Empty' : b.evacuating ? 'Evacuating' : 'Sheltering';
        html = `<div class="row"><b class="big">${esc(b.name)}</b><span class="tag ${b.fallen ? 'bad' : b.evacuating ? 'warn' : ''}">${status}</span></div>
      <p class="note">${{ downtown: 'Downtown', residential: 'Residential', suburb: 'Suburb', industrial: 'Industrial', docks: 'Docks', hospital: 'Hospital', park: 'Park', base: 'Army base' }[b.district]}</p>
      ${b.popMax ? `<div class="row"><span>${fmtPeople(b.pop)} of ${fmtPeople(b.popMax)} still inside</span></div>${bar(b.pop, b.popMax)}` : ''}
      ${b.popMax ? `<div class="btns"><button class="btn" data-act="evacb" ${b.pop <= 0 || b.evacuating ? 'disabled' : ''}>Evacuate</button><button class="btn" data-act="militia" ${b.pop < 60 || G.funds < 100 ? 'disabled' : ''}>Raise militia · $100</button></div>
      <p class="note">${b.evacuating ? 'Residents are heading for the nearest evacuation point.' : 'Residents stay behind closed doors until told to go, or until the infected come close.'}</p>` : ''}`;
    }
    else if (UI.evac) {
        const e = UI.evac;
        html = `<div class="row"><b class="big">${e.kind === 'harbor' ? 'The harbour' : 'Bus evacuation point'}</b></div>
      <p>${fmtPeople(e.queue)} waiting${e.full ? ' (full: newcomers go elsewhere)' : ''} · next ${e.kind === 'harbor' ? 'ship' : 'bus'} in ${Math.ceil(e.timer)}s · takes ${e.cap}</p>
      <p class="note">${e.departed} departures so far. Crowds waiting here draw the infected: guard them.</p>`;
    }
    else {
        html = `<p class="note">Tap a block to evacuate it or raise militia. Tap a unit to command it. Drag to pan, scroll or pinch to zoom.</p>`;
    }
    const logHtml = G.log.slice(0, 14).map(l => `<li class="${l.kind}"><time>${fmtTime(GAME_SECONDS - l.t)}</time>${esc(l.text)}</li>`).join('');
    const key = html + logHtml;
    if (!force && key === UI.lastPanelKey)
        return;
    UI.lastPanelKey = key;
    $('#sel').innerHTML = html;
    $('#side').classList.toggle('empty', !UI.sel.length && !UI.block && !UI.evac);
    $('#log').innerHTML = logHtml;
}
function showOverlay(which) {
    var _a;
    UI.overlay = which;
    const ov = $('#overlay');
    ov.hidden = !which;
    if (!which)
        return;
    const controls = `<dl class="keys"><dt>Select</dt><dd>Tap or click a unit, block or evacuation point. Shift-click adds units; Ctrl+A selects every unit.</dd>
    <dt>Move</dt><dd>With units selected, tap a street. Right-click also moves.</dd><dt>Camera</dt><dd>Drag to pan, scroll or pinch to zoom, Q and E to turn, WASD or arrows to pan.</dd>
    <dt>Buy</dt><dd>Buttons along the bottom, or keys 1 to 7, then tap the map.</dd><dt>Time</dt><dd>Space pauses. Speeds 1×, 2× and 4× at the top.</dd></dl>`;
    if (which === 'start' || which === 'help') {
        ov.innerHTML = `<div class="card"><span class="eyebrow">${which === 'start' ? 'Prototype · Real time' : 'Field manual'}</span><h1>Last Boat to Calder: City</h1>
      <p class="body">The outbreak started at St Brennan's Hospital on the east side. You hold Fort Aldermoor in the north-west and the harbour in the south. The last ship sails in 12 minutes. Get as many people out as you can.</p>
      <ul><li>People shelter at home until you order a block to evacuate, or the infected come close and they panic. Evacuees walk to the nearest evacuation point and wait for a ship or bus.</li>
      <li>The infected hunt the nearest people: anyone in the streets, crowds at the evacuation points, your troops, and blocks they can break into.</li>
      <li>Your troops fire at anything in range on their own. Money comes in steadily, plus a bounty for every kill and every person evacuated.</li>
      <li>Each figure stands for 10 people.</li></ul>${controls}
      <div class="btns"><button class="btn primary" data-act="${which === 'start' ? 'begin' : 'closehelp'}">${which === 'start' ? 'Take command' : 'Back to the city'}</button><a class="btn" href="../">The original game</a></div></div>`;
    }
    else {
        const o = G.over, s = G.stats;
        ov.innerHTML = `<div class="card ${o.pct >= 30 ? '' : 'red'}"><span class="eyebrow">${o.why === 'time' ? 'The last ship has sailed' : 'The city is empty'}</span><h1>${esc(o.grade)}</h1>
      <p class="big">${o.pct.toFixed(0)}% of the city saved</p>
      <div class="stats"><div><b>${fmtPeople(s.evacuated)}</b><span>Evacuated</span></div><div><b>${fmtPeople(s.dead)}</b><span>Dead</span></div><div><b>${s.killed * PER_AGENT}</b><span>Infected destroyed</span></div><div><b>${s.unitsLost}</b><span>Units lost</span></div><div><b>$${s.spent}</b><span>Spent</span></div></div>
      <p class="note">Grades: 60% Saviour of the city, 45% An orderly withdrawal, 30% A bitter retreat.</p>
      <div class="btns"><button class="btn primary" data-act="again">Play again</button><a class="btn" href="../">The original game</a></div></div>`;
    }
    (_a = ov.querySelector('.btn.primary')) === null || _a === void 0 ? void 0 : _a.focus();
}
function pickUnit(x, z) {
    let best = null, bd = 2.2;
    for (const u of G.units) {
        const d = dist2(u.x, u.z, x, z);
        if (d < bd) {
            bd = d;
            best = u;
        }
    }
    return best;
}
function tapAt(clientX, clientY, right, shift) {
    const p = screenToGround(clientX, clientY);
    if (!p || G.over)
        return;
    if (UI.mode) {
        const c = cellOf(p.x, p.z), b = G.blockAt[c] >= 0 ? G.blocks[G.blockAt[c]] : null;
        const err = order(UI.mode, p.x, p.z, b);
        if (err)
            toast(err);
        else
            setMode(null);
        refreshPanel(true);
        return;
    }
    if (right) {
        if (UI.sel.length)
            moveUnits(UI.sel, p.x, p.z);
        return;
    }
    const u = pickUnit(p.x, p.z);
    if (u) {
        if (shift)
            UI.sel = UI.sel.includes(u) ? UI.sel.filter(x => x !== u) : UI.sel.concat(u);
        else
            UI.sel = [u];
        UI.block = null;
        UI.evac = null;
        refreshPanel(true);
        return;
    }
    const c = cellOf(p.x, p.z), bi = G.blockAt[c];
    const e = G.evacs.find(e => dist2(e.x, e.z, p.x, p.z) < (e.kind === 'harbor' ? 9 : 4));
    if (UI.sel.length && walkable(c) && !e) {
        moveUnits(UI.sel, p.x, p.z);
        return;
    }
    UI.sel = [];
    UI.block = bi >= 0 && G.blocks[bi].district !== 'park' ? G.blocks[bi] : null;
    UI.evac = UI.block ? null : e !== null && e !== void 0 ? e : null;
    refreshPanel(true);
}
function bindInput(canvas) {
    const ptrs = new Map();
    let pinch = 0;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
        canvas.setPointerCapture(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
        if (ptrs.size === 2) {
            const [a, b] = [...ptrs.values()];
            pinch = Math.hypot(a.x - b.x, a.y - b.y);
        }
    });
    canvas.addEventListener('pointermove', e => {
        UI.hover = screenToGround(e.clientX, e.clientY);
        const p = ptrs.get(e.pointerId);
        if (!p)
            return;
        if (ptrs.size === 2) {
            p.x = e.clientX;
            p.y = e.clientY;
            p.moved = true;
            const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch)
                zoomCamera(pinch / d);
            pinch = d;
            return;
        }
        if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 7)
            p.moved = true;
        if (p.moved && e.button !== 2 && !(e.buttons & 2))
            panCamera(e.clientX - p.x, e.clientY - p.y);
        p.x = e.clientX;
        p.y = e.clientY;
    });
    const up = (e) => {
        const p = ptrs.get(e.pointerId);
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2)
            pinch = 0;
        if (p && !p.moved && ptrs.size === 0 && !UI.overlay)
            tapAt(e.clientX, e.clientY, e.button === 2, e.shiftKey);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = 0; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoomCamera(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-act],[data-order],[data-speed]');
        if (!t)
            return;
        if (t.dataset.order) {
            setMode(t.dataset.order);
            return;
        }
        if (t.dataset.speed) {
            G.speed = Number(t.dataset.speed);
            return;
        }
        switch (t.dataset.act) {
            case 'begin':
            case 'closehelp':
                showOverlay('');
                break;
            case 'help':
                showOverlay('help');
                break;
            case 'again':
                newGame(Math.floor(Math.random() * 1e9));
                resetView();
                showOverlay('');
                break;
            case 'cancel':
                setMode(null);
                break;
            case 'desel':
                UI.sel = [];
                refreshPanel(true);
                break;
            case 'evacb':
                if (UI.block)
                    evacuateBlock(UI.block);
                refreshPanel(true);
                break;
            case 'militia':
                if (UI.block) {
                    const err = order('militia', 0, 0, UI.block);
                    if (err)
                        toast(err);
                    refreshPanel(true);
                }
                break;
        }
    });
    const held = new Set();
    document.addEventListener('keydown', e => {
        var _a, _b;
        if ((_b = (_a = e.target).matches) === null || _b === void 0 ? void 0 : _b.call(_a, 'input,textarea'))
            return;
        if (UI.overlay) {
            if (e.key === 'Escape' && UI.overlay === 'help')
                showOverlay('');
            return;
        }
        const k = e.key.toLowerCase();
        if (k === ' ') {
            e.preventDefault();
            G.speed = G.speed ? 0 : 1;
            return;
        }
        if (k === 'escape') {
            if (UI.mode)
                setMode(null);
            else {
                UI.sel = [];
                UI.block = null;
                UI.evac = null;
                refreshPanel(true);
            }
            return;
        }
        const b = BUILD.find(x => x.key === k);
        if (b) {
            setMode(b.o);
            return;
        }
        if (k === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            UI.sel = G.units.slice();
            UI.block = null;
            UI.evac = null;
            refreshPanel(true);
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey)
            return;
        if (k === '?') {
            showOverlay('help');
            return;
        }
        if (k === '+' || k === '=') {
            G.speed = Math.min(4, Math.max(1, G.speed * 2));
            return;
        }
        if (k === '-') {
            G.speed = G.speed <= 1 ? 1 : G.speed / 2;
            return;
        }
        if (k === 'q')
            V.cam.yaw -= Math.PI / 8;
        if (k === 'e')
            V.cam.yaw += Math.PI / 8;
        held.add(k);
    });
    document.addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
    return (dt) => {
        const s = 600 * dt;
        if (held.has('w') || held.has('arrowup'))
            panCamera(0, s);
        if (held.has('s') || held.has('arrowdown'))
            panCamera(0, -s);
        if (held.has('a') || held.has('arrowleft'))
            panCamera(s, 0);
        if (held.has('d') || held.has('arrowright'))
            panCamera(-s, 0);
    };
}
function resetView() {
    UI.sel = [];
    UI.block = null;
    UI.evac = null;
    UI.mode = null;
    UI.lastPanelKey = '';
    Object.assign(V.cam, { x: 46, z: 34, dist: 72, yaw: 0 });
    for (const g of vehicles.values())
        V.scene.remove(g);
    vehicles.clear();
    for (const m of evacMarks.values()) {
        V.scene.remove(m.mark);
        V.scene.remove(m.vehicle);
    }
    evacMarks.clear();
    for (const h of helis.values())
        V.scene.remove(h);
    helis.clear();
    for (const j of jets.values())
        V.scene.remove(j);
    jets.clear();
    G.changed = true;
    setMode(null);
    refreshPanel(true);
}

// ---- main.ts ----
// Boot and the main loop: fixed simulation steps scaled by game speed, one render per frame.
(() => {
    const seed = Number(new URLSearchParams(location.hash.slice(1)).get('seed')) || Math.floor(Math.random() * 1e9);
    newGame(seed);
    if (!initView($('#view'))) {
        document.documentElement.classList.add('no3d');
        return;
    }
    const panKeys = bindInput(V.renderer.domElement);
    buildBar();
    refreshPanel(true);
    showOverlay('start');
    addEventListener('resize', resizeView);
    let last = performance.now(), acc = 0;
    function frame(now) {
        const real = Math.min(0.1, (now - last) / 1000);
        last = now;
        let gameDt = 0;
        if (!UI.overlay && !G.over && G.speed > 0) {
            acc += real * G.speed;
            let n = 0;
            while (acc >= STEP && n < 16) {
                tick(STEP);
                acc -= STEP;
                n++;
                gameDt += STEP;
            }
            if (n === 16)
                acc = 0; // the machine can't keep up: drop time rather than spiral
        }
        panKeys(real);
        if (G.over && UI.overlay !== 'end')
            showOverlay('end');
        const place = UI.mode && UI.hover ? { x: UI.hover.x, z: UI.hover.z, r: PLACE_R[UI.mode], ok: G.funds >= ORDER_COST[UI.mode] } : null;
        drawFrame(G.t, gameDt, UI.sel, UI.block, place);
        updateHud(now);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // hooks for automated tests
    window.City = {
        get G() { return G; }, tick, order, moveUnits, evacuateBlock, UI, showOverlay,
        reset(seed) { newGame(seed); resetView(); showOverlay(''); },
        look(x, z, dist) { Object.assign(V.cam, { x, z, dist }); },
    };
})();

})();
