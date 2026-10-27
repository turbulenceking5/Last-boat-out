/* Last Boat to Calder: City. Generated from city/src/*.ts by `npm run build:city`; edit the TypeScript, not this file. */
(function () {
"use strict";
if (typeof THREE === "undefined") { document.documentElement.classList.add("no3d"); return; }
// ---- core.ts ----
// Shared state and data types for the city game, plus the grid helpers everything else uses:
// cell indexing, walkability, distance fields (multi-source BFS) and a spatial hash.
// ---- the grid ----
// The city is a grid of 1-unit cells. Roads are 2 cells wide every 8 cells; the blocks between are 6x6.
// The harbour quay runs along the south, and the sea beyond it. The river (columns 55-58, see citygen.ts)
// is Sea cells, so nothing walks in it; its bridges are ordinary Road and Quay cells.
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
/** One special ability per kind of unit, used with F or the button in the unit panel. */
const ABILITY = {
    militia: { name: 'Molotovs', cd: 30, range: 6, r: 1.6, dmg: 3, desc: 'Two petrol bombs on the thickest knot of infected within 6 cells.' },
    infantry: { name: 'Grenades', cd: 20, range: 8, r: 1.9, dmg: 4, desc: 'Two grenades on the thickest knot of infected within 8 cells. Civilians are never hurt.' },
    apc: { name: 'Flare and siren', cd: 45, range: 0, r: 0, dmg: 0, desc: 'For 12 seconds the infected within about 26 cells come for the APC instead of anyone else. Drive, and they follow.' },
    tank: { name: 'HE barrage', cd: 40, range: 14, r: 2.4, dmg: 8, desc: 'Four high-explosive shells on the thickest knot of infected within 14 cells.' },
};
/** Kills needed for each rank. Each rank is more accurate, fires faster and recharges its ability sooner. */
const RANKS = [{ name: 'Rookie', kills: 0 }, { name: 'Veteran', kills: 50 }, { name: 'Elite', kills: 150 }];
const LURE_SECONDS = 12, LURE_PULL = 8;

// ---- citygen.ts ----
// Builds the city: a 9 x 7 grid of blocks between 2-cell roads, split into districts, with the River Calder
// running north to south through the east of the city (four bridges), a harbour quay and the sea along the
// south, an army base in the north-west corner, and a handful of landmarks. Also lays out the purely visual
// dressing the view draws: street trees, abandoned cars, and the outskirts beyond the map edge.
const BLOCKS_X = 9, BLOCKS_Z = 7;
/** The river: water in these columns, from the north edge to the sea, except where a bridge crosses. */
const RIVER_X0 = 55, RIVER_X1 = 58;
/** Rows bridged over the river: three road bridges, and a wide one carrying the last street and the quay. */
const BRIDGES = [[8, 9], [24, 25], [40, 41], [56, 59]];
const isRiverCol = (i) => i >= RIVER_X0 && i <= RIVER_X1;
const isBridgeRow = (j) => BRIDGES.some(([a, b]) => j >= a && j <= b);
/** How far the visual outskirts reach beyond the map edge (they are never walked on). */
const OUT = 60;
/** Gantry cranes along the quay (x of each), clear of the harbour berth and the river mouth. */
const CRANES = [13, 23, 49, 67];
/** Roads that run on out of town for good (others peter out): rows to the west and east, columns to the north. */
const OUT_ROADS = { west: [8, 32], east: [8, 24, 32], north: [16, 40] };
const MARKET_FOUNTAIN = [idx(20, 28), idx(21, 28), idx(20, 29), idx(21, 29)];
const MARKET_STALLS = [idx(19, 27), idx(22, 27), idx(19, 30), idx(22, 30)];
const POND = [idx(35, 28), idx(36, 28), idx(35, 29), idx(36, 29)];
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
/** x, z, scale, kind (0 conifer, 1 broadleaf). */
const trees = [];
/** Abandoned cars: x, z, heading, colour. */
const cars = [];
/** Houses, farms and sheds beyond the map edge. */
const outskirts = [];
function districtOf(bx, bz) {
    if (bx === 0 && bz === 0)
        return 'base';
    if (bx === 7 && bz === 2)
        return 'hospital';
    if ((bx === 4 && bz === 3) || (bx === 1 && bz === 4) || (bx === 2 && bz === 3))
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
const LANDMARKS = {
    '0,0': ['base', 'Fort Aldermoor'], '7,2': ['hospital', "St Brennan's Hospital"], '4,3': ['victory', 'Victory Park'],
    '1,4': ['millbrook', 'Millbrook Park'], '2,3': ['market', 'Market Square'], '3,3': ['cathedral', 'Calder Cathedral'],
    '0,3': ['station', 'Central Station'], '3,4': ['townhall', 'City Hall'], '5,0': ['stadium', 'Calder Park Stadium'],
};
/** People sheltering in the landmarks that hold more than their district would. */
const LANDMARK_POP = { stadium: 1400, station: 800, cathedral: 1200 };
function generateCity(rnd) {
    var _a;
    G.grid.fill(0 /* Cell.Road */);
    G.blockAt.fill(-1);
    G.doorOf.fill(-1);
    trees.length = 0;
    cars.length = 0;
    outskirts.length = 0;
    for (let j = QUAY_Z; j < H; j++)
        for (let i = 0; i < W; i++)
            G.grid[idx(i, j)] = j >= SEA_Z ? 4 /* Cell.Sea */ : 3 /* Cell.Quay */;
    // the river: open water except where the bridges cross
    for (let j = 0; j < SEA_Z; j++)
        for (let i = RIVER_X0; i <= RIVER_X1; i++)
            if (!isBridgeRow(j))
                G.grid[idx(i, j)] = 4 /* Cell.Sea */;
    const names = NAMES.slice();
    for (let i = names.length - 1; i > 0; i--) {
        const k = Math.floor(rnd() * (i + 1));
        [names[i], names[k]] = [names[k], names[i]];
    }
    for (let bz = 0; bz < BLOCKS_Z; bz++)
        for (let bx = 0; bx < BLOCKS_X; bx++) {
            const district = districtOf(bx, bz), id = G.blocks.length, z0 = bz * 8 + 2, d = 6;
            // blocks beside the river lose the column it runs through
            let x0 = bx * 8 + 2, x1 = x0 + 6;
            if (x0 < RIVER_X0 && x1 > RIVER_X0)
                x1 = RIVER_X0;
            if (x0 <= RIVER_X1 && x1 > RIVER_X1 + 1)
                x0 = RIVER_X1 + 1;
            const w = x1 - x0;
            const lm = LANDMARKS[`${bx},${bz}`];
            const popMax = Math.round(((_a = (lm && LANDMARK_POP[lm[0]])) !== null && _a !== void 0 ? _a : POP[district]) * (0.8 + rnd() * 0.4) / PER_AGENT) * PER_AGENT;
            const b = {
                id, bx, bz, x0, z0, w, d, name: lm ? lm[1] : names[id % names.length], landmark: lm ? lm[0] : undefined, district,
                pop: popMax, popMax, evacuating: false, fallen: false, emitT: 0, doors: [], buildings: [], lastPanicCheck: 0, breach: 0, convertT: 0,
            };
            const open = district === 'park' || district === 'base';
            for (let j = z0; j < z0 + d; j++)
                for (let i = x0; i < x0 + w; i++) {
                    // the market square is paved street; parks are grass; the fort is open ground
                    G.grid[idx(i, j)] = b.landmark === 'market' ? 0 /* Cell.Road */ : district === 'park' ? 2 /* Cell.Park */ : district === 'base' ? 5 /* Cell.Base */ : 1 /* Cell.Building */;
                    G.blockAt[idx(i, j)] = id;
                }
            if (b.landmark === 'market')
                for (const c of MARKET_FOUNTAIN.concat(MARKET_STALLS))
                    G.grid[c] = 1 /* Cell.Building */;
            if (b.landmark === 'victory')
                for (const c of POND)
                    G.grid[c] = 4 /* Cell.Sea */;
            if (!open) {
                for (const k of [2, 3])
                    for (const [i, j] of [[x0 - 1, z0 + k], [x0 + w, z0 + k], [x0 + k, z0 - 1], [x0 + k, z0 + d]]) {
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
    dressStreets(seeded(1027));
    buildOutskirts(seeded(2026));
}
const PAL = {
    stone: 0xc9c1ab, sand: 0xd8cbb0, cream: 0xe4dfcf, brick: 0xa0644a, brick2: 0x8a5a44, slate: 0x7d8790, glass: 0x8fa3ad,
    concrete: 0xa9a59a, tankPaint: 0xb3ad9c, rust: 0x9a6b4a, white: 0xeeeae0, roofRed: 0x8a4b3a, roofGrey: 0x5d6b72, roofBrown: 0x6e5a48, tar: 0x4a4a46,
    ochre: 0xc49a5a, teal: 0x6f8f8a, glass2: 0x6d8796, sandstone: 0xcdb48c, verdigris: 0x6f9a86, lead: 0x5a6266,
};
const CONTAINERS = [0xa4473a, 0x3f6f8f, 0xc28a3a, 0x5d7a4a, 0x8a8f94, 0x7a4a6a];
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
/** Lay out the buildings inside a block's footprint. Layouts are drawn for 6 x 6 and squeezed to fit narrower blocks. */
function furnish(b, rnd) {
    const { x0, z0 } = b, sx = b.w / 6;
    const add = (x, z, w, d, h, color, roof, kind, o = {}) => b.buildings.push({ x: x0 + x * sx, z: z0 + z, w: w * sx, d, h, color, roof, kind, ...o });
    const tree = (x, z, s, kind = 1) => trees.push([x0 + x * sx, z0 + z, s, kind]);
    /** Rooftop plant on a flat roof: air handlers and a water tank or two. */
    const plant = (x, z, w, d, h) => {
        const n = Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++)
            add(x + (rnd() - 0.5) * w * 0.5, z + (rnd() - 0.5) * d * 0.5, 0.5, 0.4, 0.28, 0x8d9290, 0, 'box', { y: h });
        if (rnd() < 0.35)
            add(x + w * 0.25, z - d * 0.2, 0.45, 0.45, 0.5, 0x6b5a48, 0, 'chimney', { y: h });
    };
    const flat = (x, z, w, d, h, color, kind = 'flat') => {
        add(x, z, w, d, h, color, PAL.tar, kind);
        plant(x, z, w, d, h);
    };
    const resColor = () => pick(rnd, [PAL.brick, PAL.cream, PAL.sand, PAL.brick2, PAL.ochre]);
    switch (b.landmark) {
        case 'hospital': {
            // an H of white wards round a taller core, a green first-aid cross on the roof (not the protected red cross), ambulances at the door
            add(1.0, 3, 1.8, 5.6, 3.4, PAL.white, PAL.concrete, 'flat');
            add(5.0, 3, 1.8, 5.6, 3.4, PAL.white, PAL.concrete, 'flat');
            add(3, 3, 2.4, 2.4, 4.6, 0xdfe6e4, PAL.concrete, 'flat');
            add(3, 3, 1.8, 0.55, 0.06, 0x3f8f5a, 0, 'box', { y: 4.74 });
            add(3, 3, 0.55, 1.8, 0.06, 0x3f8f5a, 0, 'box', { y: 4.74 });
            add(3, 0.55, 0.55, 1.0, 0.5, 0xf2f0ea, 0, 'box', { ry: Math.PI / 2 });
            add(3, 5.45, 0.55, 1.0, 0.5, 0xf2f0ea, 0, 'box', { ry: Math.PI / 2 });
            return;
        }
        case 'cathedral': {
            // west front with twin towers, a nave with aisles, a transept, an apse, and a spire over the crossing
            const stone = PAL.sandstone, roof = PAL.lead;
            add(3.1, 3, 4.4, 1.7, 2.5, stone, roof, 'house', { roofH: 1.3 });
            add(3.2, 1.75, 3.8, 0.8, 1.5, stone, roof, 'shed', { roofH: 0.35 });
            add(3.2, 4.25, 3.8, 0.8, 1.5, stone, roof, 'shed', { roofH: 0.35 });
            add(3.9, 3, 1.5, 4.8, 2.5, stone, roof, 'house', { roofH: 1.3 });
            add(5.35, 3, 1.3, 1.3, 2.3, stone, roof, 'tank');
            add(5.35, 3, 1.35, 1.35, 1.0, roof, roof, 'spire', { y: 2.3 });
            for (const z of [2.2, 3.8]) {
                add(0.75, z, 1.0, 1.0, 4.4, stone, roof, 'flat');
                add(0.75, z, 0.95, 0.95, 1.9, PAL.verdigris, 0, 'spire', { y: 4.45 });
            }
            add(3.9, 3, 1.0, 1.0, 1.3, stone, roof, 'box', { y: 2.5 });
            add(3.9, 3, 0.85, 0.85, 4.2, PAL.verdigris, 0, 'spire', { y: 3.8 });
            for (const [x, z] of [[0.6, 0.6], [0.6, 5.4], [5.6, 0.6], [5.6, 5.4]])
                tree(x, z, 0.75);
            return;
        }
        case 'station': {
            // platforms under long canopies, the tracks running out west, a booking hall and clock tower facing the city
            add(5.1, 3, 1.6, 5.6, 2.2, PAL.brick, PAL.roofGrey, 'house', { roofH: 0.9 });
            add(5.1, 3, 0.9, 0.9, 4.0, PAL.brick2, PAL.lead, 'flat');
            add(5.1, 3, 0.9, 0.9, 0.9, PAL.lead, 0, 'spire', { y: 4.0 });
            for (const z of [1.2, 3.0, 4.8]) {
                add(2.1, z, 4.2, 0.9, 0.12, 0x5d6b72, 0, 'box', { y: 1.15 });
                for (const x of [0.6, 2.1, 3.6])
                    add(x, z, 0.1, 0.1, 1.15, 0x3a3f42, 0, 'box');
            }
            add(1.9, 2.1, 3.4, 0.55, 0.6, 0x8a3a30, 0, 'box');
            add(1.9, 2.1, 3.4, 0.5, 0.12, 0x2b3438, 0, 'box', { y: 0.6 });
            add(1.0, 3.9, 1.8, 0.55, 0.6, 0x3f5a6a, 0, 'box');
            return;
        }
        case 'townhall': {
            // a low civic hall with wings, a portico and a dome, so the cathedral behind it can be seen from the south
            const stone = PAL.cream;
            add(3, 2.6, 5.4, 2.6, 2.2, stone, PAL.lead, 'flat');
            add(0.9, 4.5, 1.6, 2.4, 1.8, stone, PAL.lead, 'flat');
            add(5.1, 4.5, 1.6, 2.4, 1.8, stone, PAL.lead, 'flat');
            add(3, 2.6, 1.9, 1.9, 0.7, stone, 0, 'tank', { y: 2.2 });
            add(3, 2.6, 1.9, 1.9, 1.0, PAL.verdigris, 0, 'dome', { y: 2.9 });
            add(3, 2.6, 0.18, 0.18, 0.5, PAL.verdigris, 0, 'chimney', { y: 3.8 });
            for (let k = 0; k < 6; k++)
                add(1.9 + k * 0.44, 4.15, 0.16, 0.16, 1.7, 0xeeeae0, 0, 'chimney');
            add(3, 4.15, 2.6, 0.5, 0.2, stone, 0, 'box', { y: 1.7 });
            add(3, 4.15, 2.6, 0.6, 0.35, stone, PAL.lead, 'house', { y: 1.9, roofH: 0.35 });
            for (const x of [2.2, 3.8])
                tree(x, 5.4, 0.55);
            return;
        }
        case 'stadium': {
            // an oval bowl of stands round the pitch, a lower tier inside, and floodlights at the corners
            const cx = 3, cz = 3, n = 26;
            for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                add(cx + ca * 2.75, cz + sa * 2.45, 0.9, 0.8, 1.5, PAL.concrete, 0, 'box', { ry: -a + Math.PI / 2 });
                add(cx + ca * 2.05, cz + sa * 1.8, 0.75, 0.6, 0.75, 0x9a3a34, 0, 'box', { ry: -a + Math.PI / 2 });
                add(cx + ca * 2.6, cz + sa * 2.3, 0.86, 0.9, 0.08, 0xd8d6cf, 0, 'box', { y: 1.65, ry: -a + Math.PI / 2 });
            }
            for (const [x, z] of [[0.3, 0.4], [5.7, 0.4], [0.3, 5.6], [5.7, 5.6]]) {
                add(x, z, 0.14, 0.14, 3.2, 0x5d666a, 0, 'chimney');
                add(x, z, 0.6, 0.5, 0.25, 0xe8e4d4, 0, 'box', { y: 3.2, ry: Math.atan2(cz - z, cx - x) });
            }
            return;
        }
        case 'market': {
            // the fountain and four stalls stand on the cells citygen keeps unwalkable
            add(3, 3, 1.8, 1.8, 0.28, 0xb8b09a, 0, 'tank');
            add(3, 3, 1.5, 1.5, 0.04, 0x5f8a96, 0, 'tank', { y: 0.28 });
            add(3, 3, 0.3, 0.3, 1.1, 0xb8b09a, 0, 'chimney');
            add(3, 3, 0.7, 0.7, 0.15, 0xb8b09a, 0, 'tank', { y: 0.75 });
            const awn = [0xc4432f, 0x3d6a8a, 0xd2a65a, 0x6f8f6a];
            [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]].forEach(([x, z], k) => {
                add(x, z, 0.8, 0.7, 0.55, 0x8a6b44, 0, 'box');
                add(x, z, 1.0, 0.9, 0.05, awn[k], awn[k], 'house', { y: 0.6, roofH: 0.3 });
            });
            for (const [x, z] of [[0.4, 0.4], [5.6, 0.4], [0.4, 5.6], [5.6, 5.6]])
                tree(x, z, 0.8);
            return;
        }
        case 'victory':
            for (let k = 0; k < 16; k++) {
                const x = 0.5 + rnd() * 5, z = 0.5 + rnd() * 5;
                if (Math.abs(x - 1.9) < 1.6 && Math.abs(z - 3) < 1.4)
                    continue; // the pond
                tree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.5 ? 1 : 0);
            }
            add(4.6, 3, 0.5, 0.5, 0.35, 0xb8b09a, 0, 'box');
            add(4.6, 3, 0.22, 0.22, 2.2, 0xd8d2bf, 0, 'box', { y: 0.35 });
            return;
        case 'millbrook':
            for (let k = 0; k < 16; k++)
                tree(0.5 + rnd() * 5, 0.5 + rnd() * 5, 0.8 + rnd() * 0.6, rnd() < 0.6 ? 0 : 1);
            add(3, 3, 1.6, 1.6, 0.6, 0xd8d2bf, PAL.roofRed, 'tank');
            add(3, 3, 1.9, 1.9, 0.7, PAL.roofRed, 0, 'spire', { y: 0.6 });
            return;
        case 'base':
            add(1.2, 1.0, 2.2, 1.2, 1.0, 0x8c8456, 0x55633a, 'house');
            add(4.6, 1.0, 2.2, 1.2, 1.0, 0x8c8456, 0x55633a, 'house');
            add(0.6, 4.6, 1.0, 2.2, 1.0, 0x8c8456, 0x55633a, 'house');
            add(5.6, 0.5, 0.3, 0.3, 2.6, 0x6b6b5a, 0, 'box');
            return;
    }
    switch (b.district) {
        case 'downtown': {
            const r = rnd();
            if (r < 0.3) {
                // a tower with a setback crown
                const h = 8 + rnd() * 6, c = pick(rnd, [PAL.glass, PAL.stone, PAL.slate, PAL.glass2]);
                add(3, 3, 4.8, 4.8, h, c, PAL.tar, 'tower');
                const h2 = 2 + rnd() * 4;
                add(3, 3, 3.2, 3.2, h2, c, PAL.tar, 'tower', { y: h });
                plant(3, 3, 3.2, 3.2, h + h2);
            }
            else if (r < 0.55) {
                const h = 6 + rnd() * 6;
                flat(3, 1.6, 4.8, 2.4, h, pick(rnd, [PAL.glass, PAL.stone]), 'tower');
                flat(3, 4.5, 4.8, 2.2, h * (0.6 + rnd() * 0.5), pick(rnd, [PAL.slate, PAL.sand]), 'tower');
            }
            else if (r < 0.8) {
                // a podium with a slim tower on it
                const c = pick(rnd, [PAL.stone, PAL.sand, PAL.cream]);
                add(3, 3, 5.6, 5.6, 2.2, c, PAL.tar, 'flat');
                const h = 7 + rnd() * 8;
                add(3.4, 2.6, 3.0, 3.0, h, pick(rnd, [PAL.glass, PAL.glass2, PAL.slate]), PAL.tar, 'tower', { y: 2.2 });
                plant(3.4, 2.6, 3.0, 3.0, 2.2 + h);
                tree(1.0, 5.0, 0.6);
                tree(5.0, 5.0, 0.6);
            }
            else {
                // an L of offices round a corner plaza
                const h = 5 + rnd() * 5, c = pick(rnd, [PAL.stone, PAL.slate, PAL.sand]);
                flat(1.5, 3, 2.6, 5.6, h, c, 'tower');
                flat(4.4, 1.5, 3.0, 2.6, h * 0.75, c, 'tower');
                tree(4.0, 4.4, 0.7);
                tree(5.1, 5.1, 0.7);
            }
            break;
        }
        case 'residential': {
            const r = rnd();
            if (r < 0.3) {
                // a perimeter block round a courtyard
                const c = resColor(), h = 2.2 + rnd() * 1.8;
                flat(3, 0.85, 5.8, 1.6, h, c);
                flat(3, 5.15, 5.8, 1.6, h * (0.85 + rnd() * 0.3), c);
                flat(0.85, 3, 1.6, 2.6, h, c);
                flat(5.15, 3, 1.6, 2.6, h * (0.8 + rnd() * 0.3), c);
                tree(3, 3, 0.75);
            }
            else if (r < 0.5) {
                // two terraces of townhouses with back gardens between
                const c = resColor(), roof = pick(rnd, [PAL.roofRed, PAL.roofGrey, PAL.roofBrown]);
                for (const x of [1, 3, 5]) {
                    add(x, 1.0, 1.9, 1.9, 1.4 + rnd() * 0.5, c, roof, 'house', { roofH: 0.6 });
                    add(x, 5.0, 1.9, 1.9, 1.4 + rnd() * 0.5, c, roof, 'house', { roofH: 0.6 });
                }
                tree(1.5, 3, 0.65);
                tree(4.5, 3, 0.7);
            }
            else if (r < 0.7) {
                // an L-shaped block with a lower wing
                const c = resColor(), h = 2.8 + rnd() * 2;
                flat(1.4, 3, 2.6, 5.6, h, c);
                flat(4.4, 1.4, 3.0, 2.6, h * 0.8, c);
                flat(4.5, 4.6, 2.4, 2.4, 1.6 + rnd(), resColor());
                tree(3.6, 3.4, 0.55);
            }
            else {
                for (const [x, z] of [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]])
                    flat(x, z, 2.5, 2.5, 2.4 + rnd() * 2.2, resColor());
            }
            break;
        }
        case 'suburb':
            for (const [x, z] of [[1.4, 1.3], [4.6, 1.3], [1.4, 4.7], [4.6, 4.7], [3, 3]]) {
                if (x === 3 && rnd() < 0.5) {
                    tree(x, z, 0.9 + rnd() * 0.4, rnd() < 0.5 ? 0 : 1);
                    continue;
                }
                const turn = rnd() < 0.3;
                add(x, z, turn ? 1.7 : 2.0, turn ? 2.0 : 1.7, 1.0 + rnd() * 0.3, pick(rnd, [PAL.cream, PAL.sand, PAL.white, PAL.brick]), pick(rnd, [PAL.roofRed, PAL.roofGrey, PAL.roofBrown]), 'house');
            }
            tree(0.3, 3, 0.6);
            tree(5.7, 3, 0.6);
            break;
        case 'industrial': {
            const r = rnd();
            if (r < 0.35) {
                // a gasholder in its guide frame, and a pump house
                const h = 2.4 + rnd();
                add(2.6, 2.8, 4.0, 4.0, h, 0x6f7a72, 0, 'tank');
                add(2.6, 2.8, 4.1, 4.1, 0.12, 0x4f5852, 0, 'tank', { y: h });
                for (let k = 0; k < 8; k++) {
                    const a = k * Math.PI / 4, a2 = a + Math.PI / 8;
                    add(2.6 + Math.cos(a) * 2.15, 2.8 + Math.sin(a) * 2.15, 0.12, 0.12, h + 0.7, 0x7a4f3c, 0, 'chimney');
                    add(2.6 + Math.cos(a2) * 2.0, 2.8 + Math.sin(a2) * 2.0, 1.7, 0.08, 0.1, 0x7a4f3c, 0, 'box', { y: h + 0.6, ry: -a2 - Math.PI / 2 });
                }
                add(5.0, 5.0, 1.6, 1.4, 1.3, PAL.brick2, PAL.roofGrey, 'shed');
            }
            else if (r < 0.7) {
                // a works shed with a sawtooth roof and a tall chimney
                const c = pick(rnd, [PAL.concrete, PAL.rust, PAL.brick2]), h = 1.8 + rnd() * 0.6;
                for (const x of [1.2, 2.6, 4.0])
                    add(x, 2.6, 1.4, 4.4, h, c, PAL.roofGrey, 'shed', { roofH: 0.6 });
                add(5.3, 1.0, 0.55, 0.55, 5.5 + rnd() * 2, PAL.brick2, 0, 'chimney');
                add(5.0, 5.0, 1.4, 1.4, 1.5, PAL.tankPaint, PAL.concrete, 'tank');
            }
            else {
                add(2.4, 2.2, 4.2, 3.6, 2.2 + rnd() * 0.8, pick(rnd, [PAL.concrete, PAL.rust]), PAL.roofGrey, 'shed', { roofH: 0.5 });
                add(4.9, 4.9, 1.6, 1.6, 1.8, PAL.tankPaint, PAL.concrete, 'tank');
                if (rnd() < 0.6)
                    add(1.6, 5.0, 1.4, 1.4, 1.5, PAL.tankPaint, PAL.concrete, 'tank');
            }
            break;
        }
        case 'docks': {
            // a warehouse on the street side, and a yard of stacked containers or a second shed toward the quay
            const r = rnd();
            if (r < 0.3) {
                // one long transit shed, its loading bays facing the quay, and an office
                add(3, 2.6, 5.6, 3.8, 2.4, pick(rnd, [PAL.concrete, PAL.brick2]), 0x5a6a62, 'shed', { roofH: 0.7 });
                add(1.2, 5.3, 2.0, 1.0, 1.4, PAL.cream, PAL.tar, 'flat');
                for (const x of [3.2, 4.0, 4.8])
                    add(x, 4.75, 0.5, 0.5, 0.5, pick(rnd, CONTAINERS), 0, 'box');
                break;
            }
            add(3, 1.6, 5.4, 2.4, 2.0, pick(rnd, [PAL.rust, PAL.concrete, PAL.brick2]), PAL.roofGrey, 'shed', { roofH: 0.55 });
            if (r < 0.7) {
                for (let row = 0; row < 2; row++)
                    for (let col = 0; col < 4; col++) {
                        const n = 1 + Math.floor(rnd() * 3);
                        for (let k = 0; k < n; k++)
                            add(0.9 + col * 1.4, 4.0 + row * 1.0, 1.25, 0.6, 0.5, pick(rnd, CONTAINERS), 0, 'box', { y: k * 0.5 });
                    }
            }
            else
                add(3, 4.5, 5.4, 2.2, 1.8, pick(rnd, [PAL.concrete, PAL.slate]), PAL.roofGrey, 'shed', { roofH: 0.45 });
            break;
        }
    }
}
/** Street trees along the boulevards, and abandoned cars on the roads: purely visual. */
function dressStreets(rnd) {
    const road = (i, j) => inside(i, j) && j < QUAY_Z && G.grid[idx(i, j)] === 0 /* Cell.Road */ && G.blockAt[idx(i, j)] < 0;
    // plane trees on the pavements of the High Street (rows 32-33) and Kings Parade (columns 32-33)
    for (let t = 1; t < W - 1; t += 1.6) {
        for (const z of [32.22, 33.78]) {
            if (t % 8 < 2.4 || t % 8 > 7.6 || isRiverCol(Math.floor(t)) || isRiverCol(Math.floor(t + 0.6)))
                continue;
            trees.push([t, z, 0.55 + rnd() * 0.15, 1]);
        }
    }
    for (let t = 1; t < QUAY_Z - 1; t += 1.6) {
        for (const x of [32.22, 33.78]) {
            if (t % 8 < 2.4 || t % 8 > 7.6)
                continue;
            trees.push([x, t, 0.55 + rnd() * 0.15, 1]);
        }
    }
    const COLORS = [0x8a8f94, 0x3d5a78, 0x7a2f2a, 0xc9c4b4, 0x2f3a33, 0x5b4a3a, 0x9a8a5a, 0x4a5258];
    for (let j = 0; j < QUAY_Z; j++)
        for (let i = 0; i < W; i++) {
            if (!road(i, j) || rnd() > 0.05)
                continue;
            const vert = i % 8 < 2, horiz = j % 8 < 2;
            if (vert === horiz)
                continue; // keep the junctions clear
            if (i < 10 && j < 10)
                continue; // the fort's gate
            const burnt = rnd() < 0.25, color = burnt ? 0x2b2725 : pick(rnd, COLORS);
            const crash = rnd() < 0.3, side = (vert ? i % 8 : j % 8) === 0 ? 0.68 : 1.32;
            const along = (vert ? j : i) + 0.2 + rnd() * 0.6;
            let x = vert ? i - (i % 8) + side : along, z = vert ? along : j - (j % 8) + side;
            let hd = (vert ? 0 : Math.PI / 2) + (rnd() < 0.5 ? 0 : Math.PI);
            if (crash) {
                hd += (rnd() - 0.5) * 1.6;
                x += vert ? (rnd() - 0.5) * 0.4 : 0;
                z += vert ? 0 : (rnd() - 0.5) * 0.4;
            }
            cars.push([x, z, hd, color]);
        }
}
/**
 * The outskirts beyond the map: suburbs thinning into farmland to the north, west and east, along the city's
 * own streets carried on out of town. Nothing here is ever walked on; it is scenery.
 */
function buildOutskirts(rnd) {
    const roofs = [PAL.roofRed, PAL.roofGrey, PAL.roofBrown], walls = [PAL.cream, PAL.sand, PAL.white, PAL.brick, PAL.ochre];
    for (let z = -OUT + 2; z < SEA_Z - 2; z += 3)
        for (let x = -OUT + 2; x < W + OUT - 2; x += 3) {
            const cx = x + 1.5, cz = z + 1.5;
            // distance from the city edge
            const d = Math.max(-cx, cx - W, -cz, 0);
            if (d < 3)
                continue;
            if (cz < 0 && cx > RIVER_X0 - 3 && cx < RIVER_X1 + 4)
                continue; // the river
            if (cx < 0 && cz > 26 && cz < 32)
                continue; // the railway
            // the main roads out of town
            if (cx < 0 && OUT_ROADS.west.some(j => Math.abs(cz - j - 1) < 2.6))
                continue;
            if (cx > W && OUT_ROADS.east.some(j => Math.abs(cz - j - 1) < 2.6))
                continue;
            if (cz < 0 && OUT_ROADS.north.some(i => Math.abs(cx - i - 1) < 2.6))
                continue;
            // the city's streets carry on outwards
            const onRoad = (cx < 0 || cx > W) ? ((cz % 8) + 8) % 8 < 2.6 && cz > 0 : ((cx % 8) + 8) % 8 < 2.6;
            if (onRoad && d < 26)
                continue;
            const p = 0.8 * Math.exp(-d / 13);
            const r = rnd();
            if (r < p) {
                const turn = rnd() < 0.5, w = 1.5 + rnd() * 0.5, dd = 1.3 + rnd() * 0.4;
                outskirts.push({ x: cx + (rnd() - 0.5) * 0.6, z: cz + (rnd() - 0.5) * 0.6, w: turn ? dd : w, d: turn ? w : dd, h: 0.9 + rnd() * 0.4, color: pick(rnd, walls), roof: pick(rnd, roofs), kind: 'house' });
                if (rnd() < 0.5)
                    trees.push([cx + (rnd() < 0.5 ? -1.2 : 1.2), cz + (rnd() - 0.5) * 2, 0.6 + rnd() * 0.4, rnd() < 0.5 ? 0 : 1]);
            }
            else if (r < p + 0.12 + d * 0.004) {
                // woods and hedgerow trees, more of them further out
                const n = 1 + Math.floor(rnd() * 3);
                for (let k = 0; k < n; k++)
                    trees.push([cx + (rnd() - 0.5) * 2.6, cz + (rnd() - 0.5) * 2.6, 0.8 + rnd() * 0.7, rnd() < 0.6 ? 0 : 1]);
            }
            else if (d > 20 && rnd() < 0.025) {
                // a farm: a barn and a silo
                outskirts.push({ x: cx, z: cz, w: 2.2, d: 1.4, h: 1.2, color: 0x8a3a30, roof: PAL.roofGrey, kind: 'shed', roofH: 0.7 });
                outskirts.push({ x: cx + 1.6, z: cz, w: 0.8, d: 0.8, h: 2.4, color: 0xb3ad9c, roof: 0, kind: 'tank' });
            }
        }
    // the jam on the road east, where the horde comes from
    const COLORS = [0x8a8f94, 0x3d5a78, 0x7a2f2a, 0xc9c4b4, 0x2f3a33, 0x5b4a3a];
    for (let x = W + 1; x < W + 40; x += 0.9 + rnd() * 1.4) {
        if (rnd() < 0.25)
            continue;
        cars.push([x, 32.5 + (rnd() < 0.5 ? 0 : 1) + (rnd() - 0.5) * 0.3, Math.PI / 2 + (rnd() - 0.5) * 0.5, rnd() < 0.3 ? 0x2b2725 : pick(rnd, COLORS)]);
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
const WAVE_AT = 8 * 60; // the great horde reaches the eastern edge
const WAVE_SIZE = 220;
const APC_CAP = 60;
const LATE_AT = 6 * 60; // from here, hidden survivors signal from the rooftops more often
const fieldCache = new Map();
const doorField = new Float32Array(W * H);
let panicSaid = 0, busSaid = 0, crowdSaid = 0, apcSaid = 0, dropSaid = 0; // routine messages are rationed so the log stays readable
let zFieldT = 0, unitCount = { militia: 0, infantry: 0, apc: 0, tank: 0 };
function newGame(seed) {
    const rnd = seeded(seed);
    G = {
        seed, rnd,
        grid: new Uint8Array(W * H), blockAt: new Int16Array(W * H), doorOf: new Int16Array(W * H),
        blocks: [], zeds: [], civs: [], units: [], evacs: [], strikes: [], gunships: [], tracers: [], booms: [],
        zField: new Float32Array(W * H), eField: new Float32Array(W * H), eFieldDirty: true,
        t: 0, speed: 1, funds: 1500, hq: 0,
        stats: { evacuated: 0, dead: 0, killed: 0, unitsLost: 0, spent: 0, total: 0, missions: 0, ferried: 0 },
        over: null, log: [], nextId: 1, sparks: [150, 320, 500], zedSpeed: 1, changed: true,
        missions: [], nextMission: 55, waveAt: WAVE_AT, sfx: [], shake: 0, alert: null,
        shells: [], pops: [], decision: null, decisions: DECISION_TIMES.map(d => ({ ...d })), hqOrders: HQ_ORDERS.map(o => ({ ...o, done: false })),
        sealed: false, calmUntil: 0, waveSize: WAVE_SIZE, troopsHome: 0, ordered: false, usedAbility: false, lastCall: 0, hordeTarget: -1, ace: null, deaths: { streets: 0, queues: 0, homes: 0, fire: 0 }, lateSaid: false, vips: 0,
    };
    fieldCache.clear();
    zFieldT = 0;
    panicSaid = 0;
    busSaid = 0;
    crowdSaid = 0;
    apcSaid = 0;
    dropSaid = 0;
    barkSaid = 0;
    waveWarned = false;
    unitCount = { militia: 0, infantry: 0, apc: 0, tank: 0 };
    generateCity(seeded(20261027)); // the same streets every game; the outbreak and its timing vary
    G.stats.total = G.blocks.reduce((a, b) => a + b.popMax, 0);
    const hc = idx(37, 60);
    G.evacs.push({ id: G.nextId++, kind: 'harbor', x: 37.5, z: 60.5, cell: hc, queue: 0, timer: 40, interval: 40, cap: 700, departed: 0, maxQueue: 4000, full: false, biteT: 0, extra: 0 });
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
    G.deaths.homes += lost;
    b.evacuating = true;
}
const SHIRTS = [0x6a4f45, 0x5b6470, 0x7a6a50, 0x4d5a4a, 0x8a3a30, 0x6b6b6b, 0x3f4f66];
/** A new infected. The bitten lie still for a while before they rise (rise = true). Runners and brutes get commoner as the night goes on. */
function spawnZed(x, z, rise = true, kind) {
    if (G.zeds.length >= MAX_ZOMBIES)
        return null;
    const r = G.rnd, late = G.t / GAME_SECONDS;
    if (kind === undefined) {
        const k = r();
        kind = k < 0.02 + late * 0.03 ? 2 /* ZedKind.Brute */ : k < 0.08 + late * 0.1 ? 1 /* ZedKind.Runner */ : 0 /* ZedKind.Walker */;
    }
    const hp = kind === 2 /* ZedKind.Brute */ ? 16 : kind === 1 /* ZedKind.Runner */ ? 1.5 : 3;
    const sp = kind === 2 /* ZedKind.Brute */ ? 0.45 + r() * 0.15 : kind === 1 /* ZedKind.Runner */ ? 1.6 + r() * 0.4 : 0.55 + r() * 0.45;
    const zd = { x, z, hp, cd: 0.5 + r(), sp, ph: r() * 100, hd: r() * 6, shirt: kind === 1 /* ZedKind.Runner */ ? 0x9a3328 : SHIRTS[Math.floor(r() * SHIRTS.length)], wx: x, wz: z, rise: rise ? 10 + r() * 8 : 0, kind, march: false };
    G.zeds.push(zd);
    return zd;
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
        members, goal: -1, field: null, aim: null, kills: 0, people: kind === 'militia' ? s.members * PER_AGENT : 0, cargo: 0, loadT: 0,
        ab: 0, lureT: 0, rank: 0, quietT: 99, barkT: 0, vip: 0,
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
        G.evacs.push({ id: G.nextId++, kind: 'bus', x: ci(c) + 0.5, z: cj(c) + 0.5, cell: c, queue: 0, timer: 10, interval: 10, cap: 70, departed: 0, maxQueue: 350, full: false, biteT: 0, extra: 0 });
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
    G.ordered = true;
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
    updateWave();
    updateMissions(dt);
    updateDecisions();
    updateHqOrders();
    updateLastCall();
    G.shake = Math.max(0, G.shake - dt * 2);
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
    updateShells(dt);
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
        if (before > u.members.length && u.members.length) {
            const half = UNITS[u.kind].members / 2;
            if (u.members.length <= half && before > half)
                bark(u, "We're being overrun! Need support!", 'bad', true);
            else
                bark(u, 'Man down!', 'bad');
        }
        if (before && !u.members.length) {
            G.stats.unitsLost++;
            say(`${u.name}${u.rank ? `, ${RANKS[u.rank].name.toLowerCase()}s with ${u.kills} kills,` : ''} has been wiped out.`, 'bad');
            G.pops.push({ x: u.x, z: u.z, text: `${u.name} lost`, kind: 'bad' });
            const vm = G.missions.find(m => m.kind === 'vip' && m.carrier === u.id);
            if (vm) {
                vm.t = -1;
                say(`The VIP was with ${u.name}, and is lost.`, 'bad');
            }
            if (u.cargo) {
                G.stats.dead += u.cargo;
                say(`${u.cargo} civilians aboard ${u.name} were lost with it.`, 'bad');
                u.cargo = 0;
            }
            if (UNITS[u.kind].vehicle)
                G.sfx.push({ k: 'boom', x: u.x, z: u.z });
        }
    }
    G.units = G.units.filter(u => u.members.length);
    for (const t of G.tracers)
        t.t -= dt;
    G.tracers = G.tracers.filter(t => t.t > 0);
    for (const b of G.booms)
        b.t -= dt;
    G.booms = G.booms.filter(b => b.t > 0);
    if (G.sfx.length > 300)
        G.sfx.splice(0, G.sfx.length - 300); // nobody is listening (tests)
    if (G.pops.length > 60)
        G.pops.splice(0, G.pops.length - 60);
    if (G.t >= GAME_SECONDS)
        finish('time');
    else if (G.t > 5 && G.blocks.every(b => b.pop <= 0) && !G.civs.length && G.evacs.every(e => e.queue <= 0) && !G.missions.some(m => m.people > 0) && !G.units.some(u => u.cargo > 0))
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
    for (const m of G.missions)
        if (m.kind === 'survivors' || (m.kind === 'vip' && !m.carrier))
            src.push(cellOf(m.x, m.z));
    for (const b of G.blocks)
        if (b.pop > 0)
            for (const d of b.doors)
                doors.push(d);
    distanceField(G.zField, src);
    distanceField(doorField, doors);
    for (let k = 0; k < W * H; k++)
        G.zField[k] = Math.min(G.zField[k], doorField[k] + DOOR_SCENT);
    // an APC's flare and siren outshout everything else in a wide radius
    const lures = G.units.filter(u => u.lureT > 0).map(u => cellOf(u.x, u.z));
    if (lures.length) {
        distanceField(doorField, lures);
        for (let k = 0; k < W * H; k++)
            G.zField[k] = Math.min(G.zField[k], doorField[k] - LURE_PULL);
    }
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
    if (!b.evacuating && G.t - b.lastPanicCheck > 1 && G.t >= G.calmUntil) {
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
    if (!b.evacuating || G.civs.length >= MAX_CIVS || (G.sealed && b.bx >= 7))
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
            G.deaths.streets += PER_AGENT;
            spawnZed(v.x, v.z);
            z.cd = 0.9;
            return;
        }
        for (const ms of G.missions) {
            if ((ms.kind !== 'survivors' && (ms.kind !== 'vip' || ms.carrier > 0)) || ms.people <= 0 || dist2(ms.x, ms.z, z.x, z.z) > 1.4)
                continue;
            z.cd = 0.9;
            if (G.t < ms.biteT)
                return;
            ms.biteT = G.t + 1;
            ms.people -= PER_AGENT;
            G.stats.dead += PER_AGENT;
            spawnZed(z.x, z.z);
            return;
        }
        for (const u of G.units) {
            if (dist2(u.x, u.z, z.x, z.z) > 9)
                continue;
            const m = u.members.find(m => m.hp > 0 && dist2(m.x, m.z, z.x, z.z) < (UNITS[u.kind].vehicle ? 1.1 : 0.6));
            if (m) {
                m.hp -= z.kind === 2 /* ZedKind.Brute */ ? (UNITS[u.kind].vehicle ? 5 : 2) : 1;
                z.cd = 1.0;
                if (z.kind === 2 /* ZedKind.Brute */ && UNITS[u.kind].vehicle)
                    G.sfx.push({ k: 'crunch', x: z.x, z: z.z });
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
                blk.breach += z.kind === 2 /* ZedKind.Brute */ ? 6 : 1;
                z.cd = 1;
                if (z.kind === 2 /* ZedKind.Brute */)
                    G.sfx.push({ k: 'crunch', x: z.x, z: z.z });
                return;
            }
            z.cd = 1;
            if (G.t < blk.convertT)
                return;
            blk.convertT = G.t + CONVERT_EVERY;
            blk.pop -= PER_AGENT;
            G.stats.dead += PER_AGENT;
            G.deaths.homes += PER_AGENT;
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
                G.deaths.queues += PER_AGENT;
                spawnZed(z.x, z.z);
                if (G.t > crowdSaid) {
                    crowdSaid = G.t + 20;
                    say(`The infected are among the crowd at ${e.kind === 'harbor' ? 'the harbour' : 'a bus stop'}.`, 'bad');
                }
                return;
            }
        }
    }
    if (z.cd > 0.5)
        return; // still busy with the last bite
    const f = G.zField[cellOf(z.x, z.z)], sp = z.sp * G.zedSpeed * dt;
    if (f < AGGRO + (z.kind === 1 /* ZedKind.Runner */ ? 8 : 0)) {
        z.march = false;
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
    else if (z.march) {
        // the great horde pours along the streets toward the heart of the city
        const next = downhill(fieldTo(G.hordeTarget >= 0 ? G.hordeTarget : CITY_HEART), z.x, z.z);
        if (next)
            stepToward(z, next[0] + Math.sin(z.ph) * 0.4, next[1] + Math.cos(z.ph) * 0.4, sp * 0.9);
        else
            z.march = false;
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
        if (u) {
            u.kills++;
            if (u.rank < RANKS.length - 1 && u.kills >= RANKS[u.rank + 1].kills)
                promote(u);
            if (!G.ace || u.kills > G.ace.kills)
                G.ace = { name: u.name, kills: u.kills, rank: u.rank };
        }
    }
}
function promote(u) {
    u.rank++;
    const r = RANKS[u.rank].name;
    say(`${u.name} ${'★'.repeat(u.rank)} ${r.toLowerCase()} after ${u.kills} kills: sharper shooting, faster ${ABILITY[u.kind].name.toLowerCase()}.`, 'good');
    G.pops.push({ x: u.x, z: u.z, text: `${'★'.repeat(u.rank)} ${r}`, kind: 'key' });
    G.sfx.push({ k: 'rank', x: u.x, z: u.z });
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
    if (u.kind === 'apc' && u.goal < 0)
        apcCargo(u, dt);
    u.ab = Math.max(0, u.ab - dt);
    if (u.lureT > 0) {
        u.lureT -= dt;
        if (u.lureT <= 0)
            zFieldT = 0;
        else if (Math.floor(u.lureT / 1.5) !== Math.floor((u.lureT + dt) / 1.5))
            G.sfx.push({ k: 'siren', x: u.x, z: u.z });
    }
    const quiet = u.quietT;
    u.quietT += dt;
    const acc = Math.min(0.97, s.acc + u.rank * 0.08), rof = s.rof * (1 - u.rank * 0.15);
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
        m.cd = rof * (0.85 + G.rnd() * 0.3);
        m.hd = Math.atan2(target.x - m.x, target.z - m.z);
        if (s.vehicle) {
            u.aim = { x: target.x, z: target.z };
            if (u.goal < 0)
                u.hd = m.hd;
        }
        if (quiet > 15 && u.quietT > 0)
            bark(u, contactLine(u, target), 'say');
        u.quietT = 0;
        const hit = G.rnd() < acc;
        const tx2 = hit ? target.x : target.x + (G.rnd() - 0.5) * 1.5, tz2 = hit ? target.z : target.z + (G.rnd() - 0.5) * 1.5;
        G.sfx.push({ k: u.kind === 'tank' ? 'cannon' : u.kind === 'apc' ? 'mg' : 'shot', x: m.x, z: m.z });
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
        G.sfx.push({ k: 'boom', x, z });
        zHash.near(x, z, 2.4, zd => { hitZed(zd, 99, null); });
        cHash.near(x, z, 2.4, c => { if (!c.gone) {
            c.gone = true;
            G.stats.dead += PER_AGENT;
            G.deaths.fire += PER_AGENT;
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
            G.deaths.fire += lost;
            say(`The air strike killed ${lost} people in ${b.name}.`, 'bad');
        }
    }
    s.bombs = 0;
    G.shake = 1;
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
    G.sfx.push({ k: 'mg', x: g.hx, z: g.hz });
    G.tracers.push({ x1: g.hx, z1: g.hz, y1: 6, x2: target.x, z2: target.z, t: 0.07, color: 0xffe08a });
    if (hit)
        hitZed(target, 2, null);
}
function updateEvac(e, dt) {
    e.timer -= dt;
    if (e.timer > 0)
        return;
    e.timer = e.interval;
    const take = Math.min(e.queue, e.cap + e.extra);
    if (take <= 0)
        return;
    const ferry = Math.max(0, take - e.cap);
    e.extra -= ferry;
    e.queue -= take;
    e.departed++;
    G.stats.evacuated += take;
    G.funds += take * 0.6;
    G.pops.push({ x: e.x, z: e.z, text: `+${take} saved`, kind: 'good' });
    if (e.kind === 'harbor') {
        say(`A ship sails from the harbour with ${take} people aboard${ferry ? `, ${ferry} of them on the Marguerite` : ''}.`, 'good');
        G.sfx.push({ k: 'horn', x: e.x, z: e.z });
    }
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
        const take = Math.min(e.queue, e.cap + e.extra);
        G.stats.evacuated += take;
        e.queue -= take;
    }
    for (const u of G.units)
        if (u.people > 0)
            G.stats.evacuated += u.people;
    // troops who made it back to the quay sail with the last ship, and so do people aboard APCs there
    const harbour = G.evacs[0];
    for (const u of G.units) {
        if (dist2(u.x, u.z, harbour.x, harbour.z) > 12 * 12)
            continue;
        if (u.kind !== 'militia')
            G.troopsHome += UNITS[u.kind].vehicle ? 1 : u.members.length;
        if (u.cargo) {
            G.stats.evacuated += u.cargo;
            G.stats.ferried += u.cargo;
            u.cargo = 0;
        }
    }
    for (const m of G.missions)
        if (m.kind === 'survivors')
            G.stats.dead += m.people; // nobody reached them
    G.missions = [];
    const pct = (G.stats.evacuated / G.stats.total) * 100;
    const grade = pct >= 60 ? 'Saviour of the city' : pct >= 45 ? 'An orderly withdrawal' : pct >= 30 ? 'A bitter retreat' : 'Catastrophe';
    G.over = { why, pct, grade };
    say(why === 'time' ? 'The last ship has sailed.' : 'There is nobody left in the city to save.', 'key');
}
// ---- APC rescues ----
/** A parked APC beside a populated block takes people aboard; beside an evacuation point it lets them off. */
function apcCargo(u, dt) {
    u.loadT -= dt;
    if (u.loadT > 0)
        return;
    u.loadT = 0.5;
    // beside an evacuation point, let people off; don't load there, since anyone close by can walk to it
    const e = G.evacs.find(e => dist2(e.x, e.z, u.x, u.z) < 12);
    if (e) {
        if (u.cargo > 0) {
            e.queue += u.cargo;
            G.stats.ferried += u.cargo;
            if (G.t > dropSaid) {
                dropSaid = G.t + 15;
                say(`${u.name} drops ${u.cargo} people at ${e.kind === 'harbor' ? 'the harbour' : 'the evacuation point'}.`, 'good');
            }
            G.pops.push({ x: u.x, z: u.z, text: `${u.cargo} dropped off`, kind: 'good' });
            G.sfx.push({ k: 'chime', x: u.x, z: u.z });
            u.cargo = 0;
        }
        return;
    }
    if (u.cargo >= APC_CAP)
        return;
    const i0 = Math.floor(u.x), j0 = Math.floor(u.z);
    for (let j = j0 - 2; j <= j0 + 2; j++)
        for (let i = i0 - 2; i <= i0 + 2; i++) {
            if (!inside(i, j))
                continue;
            const b = G.doorOf[idx(i, j)];
            if (b < 0 || G.blocks[b].pop <= 0)
                continue;
            const blk = G.blocks[b], take = Math.min(PER_AGENT, blk.pop, APC_CAP - u.cargo);
            blk.pop -= take;
            u.cargo += take;
            if (u.cargo >= APC_CAP) {
                G.pops.push({ x: u.x, z: u.z, text: 'Full: 60 aboard', kind: 'key' });
                if (G.t > apcSaid) {
                    apcSaid = G.t + 20;
                    say(`${u.name} is full: ${u.cargo} people aboard. Drive them to an evacuation point.`, 'key');
                }
            }
            return;
        }
}
/** Send APCs to the door of a block nearest to them, to load people. */
function sendToBlock(units, b) {
    for (const u of units) {
        let best = -1, bd = INF;
        for (const d of b.doors) {
            const dd = dist2(ci(d) + 0.5, cj(d) + 0.5, u.x, u.z);
            if (dd < bd) {
                bd = dd;
                best = d;
            }
        }
        if (best >= 0)
            sendUnit(u, best);
    }
}
// ---- missions ----
const VIPS = ["Dr Ilse Varga, St Brennan's chief epidemiologist", 'Harbourmaster Tom Reddin', 'Councillor Ada Moreland, who holds the ferry contracts', 'Professor Joel Hask, with samples of the infection'];
function updateMissions(dt) {
    G.nextMission -= dt;
    // late in the night, people who hid come out and signal from the rooftops: missions come thicker and faster
    const late = G.t >= LATE_AT;
    if (late && !G.lateSaid) {
        G.lateSaid = true;
        say('As the streets empty, people who hid are signalling from rooftops all over the city. Get them out before the last ship.', 'key');
    }
    if (G.nextMission <= 0 && G.missions.length < (late ? 3 : 2) && G.t < GAME_SECONDS - 75) {
        G.nextMission = late ? 26 + G.rnd() * 14 : 55 + G.rnd() * 25;
        spawnMission();
    }
    for (const m of G.missions) {
        m.t -= dt;
        if (m.kind === 'hold') {
            updateHold(m, dt);
            continue;
        }
        if (m.kind === 'vip' && m.carrier) {
            updateVip(m);
            continue;
        }
        const u = G.units.find(u => u.members.some(mb => dist2(mb.x, mb.z, m.x, m.z) < 2.6));
        if (u && (m.kind === 'crate' || m.people > 0)) {
            if (m.kind === 'crate') {
                G.funds += m.reward;
                say(`${u.name} recovers the supply drop: $${m.reward}.`, 'good');
                G.pops.push({ x: m.x, z: m.z, text: `+$${m.reward}`, kind: 'money' });
            }
            else if (m.kind === 'vip') {
                // the VIP rides with the unit; the mission moves to the harbour, where they must be taken
                const h = G.evacs[0];
                m.carrier = u.id;
                u.vip = m.id;
                m.people = 0;
                m.id = G.nextId++;
                m.x = h.x;
                m.z = h.z - 2.5;
                m.t = 9999;
                say(`${u.name} has ${m.who}. Bring them to the harbour or Fort Aldermoor.`, 'key');
                bark(u, 'We have the VIP. Moving!', 'say', true);
                G.sfx.push({ k: 'chime', x: u.x, z: u.z });
                continue;
            }
            else {
                let walk = m.people;
                if (u.kind === 'apc') {
                    const take = Math.min(walk, APC_CAP - u.cargo);
                    u.cargo += take;
                    walk -= take;
                }
                for (let k = 0; k < walk / PER_AGENT; k++)
                    spawnCiv(m.x + (G.rnd() - 0.5) * 1.2, m.z + (G.rnd() - 0.5) * 1.2);
                G.funds += m.reward;
                say(`${u.name} reaches the survivors: ${m.people} people${walk < m.people ? ' climb aboard' : ' head for the evacuation points'}. $${m.reward}.`, 'good');
                G.pops.push({ x: m.x, z: m.z, text: `${m.people} rescued · +$${m.reward}`, kind: 'good' });
                m.people = 0;
            }
            G.sfx.push({ k: 'chime', x: m.x, z: m.z });
            G.stats.missions++;
            m.t = -1;
            m.kind = 'crate'; // done
            continue;
        }
        if ((m.kind === 'survivors' || m.kind === 'vip') && m.people <= 0 && m.t > 0) {
            say(m.kind === 'vip' ? `The infected reached ${m.who} first.` : 'The survivors were overrun before help arrived.', 'bad');
            m.t = -1;
            m.kind = 'crate';
        }
    }
    for (const m of G.missions)
        if (m.t <= 0 && m.t > -1) {
            if (m.kind === 'survivors') {
                G.stats.dead += m.people;
                say(`No one reached the survivors in time. ${m.people} people are lost.`, 'bad');
            }
            else if (m.kind === 'vip')
                say(`No one reached ${m.who} in time.`, 'bad');
            else if (m.kind === 'hold')
                say(`No one held ${G.blocks[m.block].name}. Its residents are on their own.`, 'bad');
            else
                say('The supply drop was lost to looters.');
        }
    G.missions = G.missions.filter(m => m.t > 0);
}
/** Hold: keep any unit beside the block until the clock fills; the residents arm themselves in thanks. */
function updateHold(m, dt) {
    const b = G.blocks[m.block];
    if (b.pop <= 0) {
        say(`${b.name} fell before it could be held.`, 'bad');
        m.t = -1;
        return;
    }
    m.people = b.pop;
    if (!G.units.some(u => dist2(u.x, u.z, m.x, m.z) < 6.5 * 6.5))
        return;
    m.prog += dt;
    if (m.prog < m.need)
        return;
    G.funds += m.reward;
    G.stats.missions++;
    b.breach = -BREACH; // barricaded: the doors hold twice as long
    let extra = '';
    if (b.pop >= 6 * PER_AGENT) {
        const door = b.doors.reduce((a, d) => (G.zField[d] > G.zField[a] ? d : a), b.doors[0]);
        b.pop -= 6 * PER_AGENT;
        spawnUnit('militia', door, -1, `Militia, ${b.name}`);
        extra = ' Sixty residents take up arms and join you.';
    }
    say(`${b.name} is held and barricaded. $${m.reward}.${extra}`, 'good');
    G.pops.push({ x: m.x, z: m.z, text: `Held · +$${m.reward}`, kind: 'good' });
    G.sfx.push({ k: 'chime', x: m.x, z: m.z });
    m.t = -1;
}
/** VIP: once picked up, they ride with the unit until it reaches the harbour or the fort. */
function updateVip(m) {
    const u = G.units.find(x => x.id === m.carrier);
    if (!u) {
        m.t = -1;
        return;
    }
    const h = G.evacs[0];
    if (dist2(u.x, u.z, h.x, h.z) > 7 * 7 && dist2(u.x, u.z, ci(G.hq) + 0.5, cj(G.hq) + 0.5) > 8 * 8)
        return;
    h.extra += 400;
    G.funds += m.reward;
    G.stats.missions++;
    u.vip = 0;
    say(`${m.who} is safe. In return the navy adds 400 places to the coming sailings from the harbour. $${m.reward}.`, 'good');
    G.pops.push({ x: u.x, z: u.z, text: `VIP safe · +$${m.reward}`, kind: 'good' });
    G.sfx.push({ k: 'chime', x: u.x, z: u.z });
    m.t = -1;
}
function spawnMission() {
    const r = G.rnd(), late = G.t >= LATE_AT;
    if (r < 0.15 && !late && spawnHold())
        return;
    const kind = r < 0.3 ? 'vip' : r < (late ? 0.8 : 0.68) ? 'survivors' : 'crate';
    // somewhere on the streets, away from the fort and the evacuation points
    for (let tries = 0; tries < 60; tries++) {
        const i = 3 + Math.floor(G.rnd() * (W - 6)), j = 3 + Math.floor(G.rnd() * (QUAY_Z - 6)), c = idx(i, j);
        if (G.grid[c] !== 0 /* Cell.Road */)
            continue;
        const x = i + 0.5, z = j + 0.5;
        if (dist2(x, z, ci(G.hq), cj(G.hq)) < 200 || G.evacs.some(e => dist2(e.x, e.z, x, z) < 64))
            continue;
        const near = G.blocks.reduce((a, b) => dist2(b.x0 + 3, b.z0 + 3, x, z) < dist2(a.x0 + 3, a.z0 + 3, x, z) ? b : a);
        const m = {
            id: G.nextId++, kind, x, z, t: kind === 'crate' ? 60 : 75, people: kind === 'survivors' ? (late ? 80 : 60) + Math.floor(G.rnd() * (late ? 7 : 4)) * 10 : kind === 'vip' ? PER_AGENT : 0,
            reward: kind === 'survivors' ? 400 : kind === 'vip' ? 800 : 700, biteT: 0, prog: 0, need: 0, block: -1, carrier: 0, who: '',
        };
        if (kind === 'survivors')
            G.stats.total += m.people; // people nobody knew were there
        if (kind === 'vip')
            m.who = VIPS[(G.seed + G.vips++) % VIPS.length];
        G.missions.push(m);
        say(kind === 'survivors' ? `Survivors are signalling from a rooftop near ${near.name}: ${m.people} people. Get any unit to them in 75 seconds.`
            : kind === 'vip' ? `${m.who} is trapped near ${near.name}. Reach them in 75 seconds, then bring them to the harbour or the fort.`
                : `A supply drop has come down near ${near.name}. Get any unit to it in 60 seconds for $${m.reward}.`, 'key');
        G.sfx.push({ k: 'chime', x, z });
        return;
    }
}
/** A populated block with the infected closing in asks for troops to hold its streets. */
function spawnHold() {
    const cand = G.blocks.filter(b => b.pop >= 300 && !b.fallen && b.district !== 'hospital' && !(G.sealed && b.bx >= 7) &&
        dist2(b.x0 + 3, b.z0 + 3, ci(G.hq), cj(G.hq)) > 200 && !G.missions.some(m => m.block === b.id) &&
        zHash.nearest(b.x0 + 3, b.z0 + 3, 16, z => z.hp > 0 && z.rise <= 0));
    if (!cand.length)
        return false;
    const b = cand[Math.floor(G.rnd() * cand.length)];
    G.missions.push({ id: G.nextId++, kind: 'hold', x: b.x0 + 3, z: b.z0 + 3, t: 90, people: b.pop, reward: 400, biteT: 0, prog: 0, need: 30, block: b.id, carrier: 0, who: '' });
    say(`${b.name} is barricading its doors as the infected close in: ${b.pop} people inside. Keep a unit beside it for 30 seconds in the next 90.`, 'key');
    G.sfx.push({ k: 'chime', x: b.x0 + 3, z: b.z0 + 3 });
    return true;
}
// ---- abilities ----
/**
 * The thickest knot of infected within range of (x, z) and at least minD away, with 3 or more inside radius r.
 * Thrown weapons and shells never hurt civilians: the crews pick their moment.
 */
function clusterTarget(x, z, range, r, minD) {
    const cands = [];
    zHash.near(x, z, range, zd => { if (zd.hp > 0 && zd.rise <= 0 && dist2(zd.x, zd.z, x, z) >= minD * minD)
        cands.push(zd); });
    let best = null;
    const stride = Math.max(1, Math.floor(cands.length / 40));
    for (let k = 0; k < cands.length; k += stride) {
        const c = cands[k];
        let n = 0;
        zHash.near(c.x, c.z, r, zd => { if (zd.hp > 0)
            n++; });
        if (n < 3 || (best && n <= best.n))
            continue;
        best = { x: c.x, z: c.z, n };
    }
    return best;
}
const THROW_LINES = {
    militia: ['Burn them!', 'Light it up!'],
    infantry: ['Frag out!', 'Grenades!', 'Fire in the hole!'],
    apc: ['Flare up! Come and get it!', 'Siren on! Over here!'],
    tank: ['Firing for effect!', 'HE, on the way!'],
};
/** Use a unit's special ability. Returns an error message, or null when it went off. */
function useAbility(u) {
    if (G.over)
        return 'The campaign is over.';
    const a = ABILITY[u.kind];
    if (u.ab > 0)
        return `${u.name}: ${a.name.toLowerCase()} ready in ${Math.ceil(u.ab)}s.`;
    zHash.build(G.zeds); // called between steps: the hash may be stale
    if (u.kind === 'apc') {
        u.lureT = LURE_SECONDS;
        zFieldT = 0;
        G.sfx.push({ k: 'siren', x: u.x, z: u.z });
    }
    else {
        const tank = u.kind === 'tank', tgt = clusterTarget(u.x, u.z, a.range, a.r, tank ? 3 : 2);
        if (!tgt)
            return `${u.name}: no target for ${a.name.toLowerCase()}: it needs 3 or more infected together within ${a.range} cells.`;
        const n = tank ? 4 : 2, dur = tank ? 0.5 : 0.8;
        for (let k = 0; k < n; k++) {
            const jx = k ? (G.rnd() - 0.5) * a.r * 1.2 : 0, jz = k ? (G.rnd() - 0.5) * a.r * 1.2 : 0;
            G.shells.push({ sx: u.x, sz: u.z, x: tgt.x + jx, z: tgt.z + jz, t: dur + k * (tank ? 0.45 : 0.3), dur, r: a.r, dmg: a.dmg, unit: u.id, big: tank });
        }
        G.sfx.push({ k: tank ? 'cannon' : 'throw', x: u.x, z: u.z });
    }
    const lines = THROW_LINES[u.kind];
    bark(u, lines[(u.id + u.kills) % lines.length], 'say', true);
    u.ab = a.cd * (1 - u.rank * 0.15);
    G.usedAbility = true;
    return null;
}
function updateShells(dt) {
    var _a;
    for (const s of G.shells) {
        s.t -= dt;
        if (s.t > 0)
            continue;
        const u = (_a = G.units.find(x => x.id === s.unit)) !== null && _a !== void 0 ? _a : null;
        G.booms.push({ x: s.x, z: s.z, t: s.big ? 0.9 : 0.5, size: s.big ? 2.6 : 1.6 });
        G.sfx.push({ k: 'boom', x: s.x, z: s.z });
        zHash.near(s.x, s.z, s.r, zd => { hitZed(zd, s.dmg, u); });
    }
    G.shells = G.shells.filter(s => s.t > 0);
}
/** What it costs to bring a unit back to full strength: 60% of the price of what was lost. */
function reinforceCost(u) {
    const s = UNITS[u.kind];
    if (u.kind === 'militia')
        return 0;
    const missing = s.members * s.hp - u.members.reduce((a, m) => a + Math.max(0, m.hp), 0);
    return missing <= 0 ? 0 : Math.max(10, Math.ceil(missing * s.cost / (s.members * s.hp) * 0.6 / 5) * 5);
}
/** Units refit at Fort Aldermoor or beside an evacuation point. */
function nearSupply(u) {
    return dist2(u.x, u.z, ci(G.hq) + 0.5, cj(G.hq) + 0.5) < 9 * 9 || G.evacs.some(e => dist2(e.x, e.z, u.x, u.z) < (e.kind === 'harbor' ? 8 : 6) ** 2);
}
/** Refill a squad's ranks and patch up its wounded or its vehicle, keeping its rank. */
function reinforce(u) {
    if (G.over)
        return 'The campaign is over.';
    if (u.kind === 'militia')
        return 'Militia are volunteers: there is no one to reinforce them with.';
    const cost = reinforceCost(u);
    if (!cost)
        return `${u.name} is at full strength.`;
    if (!nearSupply(u))
        return `Bring ${u.name} to Fort Aldermoor or an evacuation point to reinforce.`;
    zHash.build(G.zeds); // called between steps: the hashes may be from before the last clean-up, or another game
    if (zHash.nearest(u.x, u.z, 5, z => z.hp > 0 && z.rise <= 0))
        return `${u.name} is in contact. Pull back first.`;
    if (G.funds < cost)
        return `Needs $${cost}. You have $${Math.floor(G.funds)}.`;
    const s = UNITS[u.kind];
    for (const m of u.members)
        m.hp = m.maxHp;
    for (let k = u.members.length; k < s.members; k++) {
        const a = (k / s.members) * Math.PI * 2, r = s.members > 1 ? s.spread * (k % 2 ? 1 : 0.6) : 0;
        u.members.push({ hp: s.hp, maxHp: s.hp, ox: Math.cos(a) * r, oz: Math.sin(a) * r, cd: s.rof, x: u.x, z: u.z, hd: 0 });
    }
    G.funds -= cost;
    G.stats.spent += cost;
    say(`${u.name} ${s.vehicle ? 'repaired' : 'back to full strength'}: $${cost}.`);
    G.pops.push({ x: u.x, z: u.z, text: s.vehicle ? 'Repaired' : 'Reinforced', kind: 'good' });
    G.sfx.push({ k: 'chime', x: u.x, z: u.z });
    return null;
}
// ---- barks: short lines from the units, over their heads and now and then in the log ----
let barkSaid = 0;
function bark(u, text, kind, loud = false) {
    if (G.t < u.barkT && !loud)
        return;
    u.barkT = G.t + 12;
    G.pops.push({ x: u.x, z: u.z, text, kind: kind === 'bad' ? 'bad' : 'say' });
    if (loud && kind === 'say')
        return; // abilities and pick-ups are already plain to see
    if (G.t < barkSaid && kind !== 'bad')
        return;
    barkSaid = G.t + 10;
    say(`${u.name}: “${text}”`, kind === 'bad' ? 'bad' : '');
}
const COMPASS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
function contactLine(u, z) {
    const dir = COMPASS[(Math.round(Math.atan2(z.x - u.x, z.z - u.z) / (Math.PI / 4)) + 8) % 8];
    const lines = UNITS[u.kind].vehicle ? [`Targets ${dir}, engaging!`, `Contact ${dir}!`] : [`Contact ${dir}!`, `Movement to the ${dir}!`, `Infected, ${dir} side!`, 'Here they come!'];
    return lines[(u.id + u.kills) % lines.length];
}
// ---- first orders from HQ ----
const HQ_ORDERS = [
    { id: 'bus', text: 'Open a bus evacuation point near people (key 1)', reward: 150 },
    { id: 'evac', text: 'Order a block to evacuate: tap it, then Evacuate', reward: 100 },
    { id: 'east', text: "Send troops toward St Brennan's Hospital in the east", reward: 150 },
    { id: 'ability', text: 'Select a squad and use its special ability (F)', reward: 100 },
];
const HOSPITAL_X = 61, HOSPITAL_Z = 21;
function updateHqOrders() {
    if (!G.hqOrders.length)
        return;
    if (G.t > 240) {
        G.hqOrders = [];
        return;
    } // after four minutes you are on your own
    for (const o of G.hqOrders) {
        if (o.done)
            continue;
        const ok = o.id === 'bus' ? G.evacs.some(e => e.kind === 'bus') : o.id === 'evac' ? G.ordered : o.id === 'ability' ? G.usedAbility
            : G.units.some(u => u.kind !== 'militia' && dist2(u.x, u.z, HOSPITAL_X, HOSPITAL_Z) < 15 * 15);
        if (!ok)
            continue;
        o.done = true;
        G.funds += o.reward;
        say(`HQ: ${o.text.replace(/ \(.*\)$|:.*$/, '').toLowerCase()}: done. $${o.reward}.`, 'good');
        G.sfx.push({ k: 'chime', x: V_CENTRE_X, z: V_CENTRE_Z });
    }
    if (G.hqOrders.every(o => o.done)) {
        G.hqOrders = [];
        say("HQ: good start. From here on, it's your call.", 'key');
    }
}
const V_CENTRE_X = 37, V_CENTRE_Z = 30;
// ---- decisions ----
const DECISION_TIMES = [{ id: 'broadcast', at: 70 }, { id: 'volunteers', at: 200 }, { id: 'ferry', at: 290 }, { id: 'bridges', at: 400 }];
function updateDecisions() {
    if (G.decision) {
        // the page pauses while a decision is open; only an unattended game (the tests) gets here
        if (G.t >= G.decision.until) {
            say(`No answer from command: ${G.decision.title.toLowerCase()} goes by.`);
            G.decision = null;
        }
        return;
    }
    const next = G.decisions[0];
    if (!next || G.t < next.at || G.over)
        return;
    G.decisions.shift();
    G.decision = makeDecision(next.id);
    if (G.decision)
        G.sfx.push({ k: 'chime', x: V_CENTRE_X, z: V_CENTRE_Z });
}
/** The bridges over the River Calder go into the water: nothing crosses again. Anyone on them falls in. */
function blowBridges() {
    for (const [a, b] of BRIDGES)
        for (let j = a; j <= b; j++)
            for (let i = RIVER_X0; i <= RIVER_X1; i++)
                G.grid[idx(i, j)] = 4 /* Cell.Sea */;
    fieldCache.clear();
    G.eFieldDirty = true;
    zFieldT = 0;
    for (const z of G.zeds)
        if (!walkableAt(z.x, z.z))
            z.hp = 0;
    for (const c of G.civs)
        if (!walkableAt(c.x, c.z)) {
            c.gone = true;
            G.stats.dead += PER_AGENT;
        }
    for (const u of G.units)
        if (!walkableAt(u.x, u.z)) {
            const c = nearestWalkable(u.x, u.z);
            if (c >= 0) {
                u.x = ci(c) + 0.5;
                u.z = cj(c) + 0.5;
                for (const m of u.members) {
                    m.x = u.x;
                    m.z = u.z;
                }
            }
        }
    for (const u of G.units)
        if (u.goal >= 0) {
            const g = u.goal;
            u.goal = -1;
            u.field = null;
            sendUnit(u, g);
        } // fresh routes; anyone whose goal is across the river stops
    for (const [a, b] of BRIDGES)
        for (let k = 0; k < 3; k++)
            G.booms.push({ x: RIVER_X0 + 0.5 + k * 1.5, z: (a + b + 1) / 2, t: 0.9 + k * 0.1, size: 2.4 });
}
function eastPeople() { return G.blocks.filter(b => b.bx >= 7).reduce((a, b) => a + b.pop, 0); }
function makeDecision(id) {
    const until = G.t + 30;
    switch (id) {
        case 'broadcast': return {
            id, until, title: 'Radio Calder', text: 'The city radio station is still on the air. The announcer asks what to tell people.', opts: [
                { label: 'Stay indoors and bar the doors', note: 'For the next 2 minutes nobody panics: blocks only leave when you order them to. Quieter streets, but people sit tight even with the infected at the door.' },
                { label: 'Make for the evacuation points', note: 'Every block within 20 cells of an evacuation point starts leaving now. Busy streets and crowded stops.' },
            ]
        };
        case 'volunteers': return {
            id, until, title: "The dockers' union", text: 'Two hundred dock workers have gathered at the harbour gates and want to help.', opts: [
                { label: 'Arm them', note: 'Two militia companies form up on the quay, free. If they live, they sail on the last ship.' },
                { label: 'Put them on the ships', note: '120 more people join the queue at the harbour.' },
            ]
        };
        case 'ferry': {
            const inf = G.units.some(u => u.kind === 'infantry');
            return {
                id, until, title: 'The Marguerite', text: 'A coastal ferry has put in at the harbour and can make one run alongside the next ships. Her captain wants $1,500 up front.', opts: [
                    { label: 'Pay $1,500', note: '600 extra places on the coming sailings from the harbour.', off: G.funds < 1500 ? `You have $${Math.floor(G.funds)}.` : undefined },
                    { label: 'Commandeer her', note: 'Free, but an infantry squad must go aboard to keep order: the squad nearest the harbour leaves the city.', off: inf ? undefined : 'You have no infantry.' },
                    { label: 'Let her go', note: 'She sails empty.' },
                ]
            };
        }
        case 'bridges': return {
            id, until, title: 'The river bridges', text: `Engineers have charges on the eastern bridges, and aircraft have seen a great horde on the far bank. ${fmtPeople(eastPeople())} people are still in the eastern blocks.`, opts: [
                { label: 'Blow the bridges', note: 'The great horde arrives at half strength, but nobody still in the two eastern columns of blocks can get out.' },
                { label: 'Mine the roads · $800', note: 'The great horde loses a third of its number on the way in.', off: G.funds < 800 ? `You have $${Math.floor(G.funds)}.` : undefined },
                { label: 'Keep them open', note: 'The horde comes in full strength.' },
            ]
        };
    }
    return null;
}
/** Answer the open decision. Returns an error message, or null. */
function choose(i) {
    const d = G.decision;
    if (!d)
        return 'Nothing to decide.';
    const o = d.opts[i];
    if (!o)
        return 'No such option.';
    if (o.off)
        return o.off;
    G.decision = null;
    switch (d.id + ':' + i) {
        case 'broadcast:0':
            G.calmUntil = G.t + 120;
            say('Radio Calder: "Stay indoors. Bar your doors. Help is coming."', 'key');
            break;
        case 'broadcast:1': {
            let n = 0;
            for (const b of G.blocks)
                if (b.pop > 0 && !b.evacuating && G.evacs.some(e => dist2(e.x, e.z, b.x0 + 3, b.z0 + 3) < 400)) {
                    b.evacuating = true;
                    n++;
                }
            say(`Radio Calder: "Make for the evacuation points." ${n} blocks are on the move.`, 'key');
            break;
        }
        case 'volunteers:0': {
            const h = G.evacs[0];
            for (const dx of [-5, 5])
                spawnUnit('militia', nearestWalkable(h.x + dx, h.z - 3), -1, `Dockers' militia ${dx < 0 ? 'A' : 'B'}`);
            G.stats.total += 120;
            say("The dockers are armed: two militia companies on the quay.", 'key');
            break;
        }
        case 'volunteers:1':
            G.evacs[0].queue += 120;
            G.stats.total += 120;
            say('The dockers join the queue for the ships.', 'key');
            break;
        case 'ferry:0':
            G.funds -= 1500;
            G.stats.spent += 1500;
            G.evacs[0].extra += 600;
            say('The Marguerite is paid and waiting: 600 more places from the harbour.', 'key');
            break;
        case 'ferry:1': {
            const h = G.evacs[0], u = G.units.filter(u => u.kind === 'infantry').sort((a, b) => dist2(a.x, a.z, h.x, h.z) - dist2(b.x, b.z, h.x, h.z))[0];
            G.units = G.units.filter(x => x !== u);
            G.troopsHome += u.members.length;
            G.evacs[0].extra += 600;
            say(`${u.name} goes aboard the Marguerite: 600 more places from the harbour.`, 'key');
            break;
        }
        case 'bridges:0':
            G.sealed = true;
            blowBridges();
            G.waveSize = Math.round(WAVE_SIZE / 2);
            {
                const left = eastPeople();
                say(left > 0 ? `The bridges are down. The east is cut off: ${fmtPeople(left)} people can no longer get out.` : 'The bridges are down. The east was already empty.', left > 0 ? 'bad' : 'key');
            }
            G.shake = 1;
            G.sfx.push({ k: 'boom', x: 70, z: 25 });
            break;
        case 'bridges:1':
            G.funds -= 800;
            G.stats.spent += 800;
            G.waveSize = Math.round(WAVE_SIZE * 2 / 3);
            say('Engineers are mining the eastern roads.', 'key');
            break;
        default: say(`${d.title}: ${o.label.toLowerCase()}.`);
    }
    return null;
}
// ---- the last ship ----
function updateLastCall() {
    const left = GAME_SECONDS - G.t;
    if (left <= 90 && G.lastCall === 0) {
        G.lastCall = 90;
        G.alert = { text: 'The last ship sails in 90 seconds. Fall back to the harbour!', until: G.t + 6 };
        say('The last ship is in. Troops on the quay when she sails come home with her, and so do people aboard APCs there.', 'key');
        G.sfx.push({ k: 'horn', x: G.evacs[0].x, z: G.evacs[0].z });
    }
    else if (left <= 30 && G.lastCall === 90) {
        G.lastCall = 30;
        G.alert = { text: 'Last ship: 30 seconds', until: G.t + 3 };
        G.sfx.push({ k: 'horn', x: G.evacs[0].x, z: G.evacs[0].z });
    }
    else if (left <= 10 && left > 0 && Math.ceil(left) < G.lastCall) {
        G.lastCall = Math.ceil(left);
        G.alert = { text: `Last ship: ${G.lastCall}`, until: G.t + 1.05 };
        G.sfx.push({ k: 'tick', x: G.evacs[0].x, z: G.evacs[0].z });
    }
}
// ---- the great horde ----
const CITY_HEART = idx(37, 30);
let waveWarned = false;
function updateWave() {
    if (G.waveAt < 0)
        return;
    if (G.t >= G.waveAt - 30 && !waveWarned) {
        waveWarned = true;
        G.alert = { text: 'A great horde is coming in from the east. 30 seconds.', until: G.t + 8 };
        say(`Aircraft report a great horde on the eastern roads${G.sealed ? ', on the far side of the blown bridges' : ''}. It will reach the city in 30 seconds.`, 'bad');
        G.sfx.push({ k: 'alarm', x: 70, z: 30 });
    }
    if (G.t < G.waveAt)
        return;
    G.waveAt = -1;
    const roads = [];
    for (let j = 0; j < QUAY_Z; j++)
        for (const i of [W - 2, W - 1])
            if (walkable(idx(i, j)))
                roads.push(idx(i, j));
    for (let k = 0; k < G.waveSize; k++) {
        const c = roads[Math.floor(G.rnd() * roads.length)], r = G.rnd();
        const zd = spawnZed(ci(c) + G.rnd(), cj(c) + G.rnd(), false, r < 0.06 ? 2 /* ZedKind.Brute */ : r < 0.3 ? 1 /* ZedKind.Runner */ : 0 /* ZedKind.Walker */);
        if (zd)
            zd.march = true;
    }
    // it makes for the biggest crowd in the city, or failing that the heart of it
    const crowd = G.evacs.reduce((a, e) => (e.queue > a.queue ? e : a), G.evacs[0]);
    G.hordeTarget = crowd.queue >= 300 ? crowd.cell : CITY_HEART;
    const where = crowd.queue < 300 ? 'the heart of the city' : crowd.kind === 'harbor' ? `the ${fmtPeople(crowd.queue)} people waiting at the harbour` : `the ${fmtPeople(crowd.queue)} people at a bus stop`;
    G.alert = { text: `The horde is in the city, heading for ${crowd.queue < 300 ? 'the centre' : crowd.kind === 'harbor' ? 'the harbour' : 'a bus stop'}.`, until: G.t + 5 };
    say(`The great horde is in the city: about ${G.waveSize * PER_AGENT} infected pouring in from the east, making for ${where}.`, 'bad');
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
const GROUND_PX = 16; // texels per cell for the city ground
const OUT_PX = 5; // and for the outskirts
/** Scatter n small dots of the given colours over a rectangle: grain for asphalt, grass and gravel. */
function speckle(g, r, x, y, w, h, colors, n, size) {
    for (let k = 0; k < n; k++) {
        g.fillStyle = colors[k % colors.length];
        const s = size * (0.5 + r());
        g.fillRect(x + r() * w, y + r() * h, s, s);
    }
}
function grass(g, r, x, y, w, h, base = '#6c8650') {
    g.fillStyle = base;
    g.fillRect(x, y, w, h);
    speckle(g, r, x, y, w, h, ['rgba(140,170,90,.35)', 'rgba(40,60,30,.25)', 'rgba(170,190,110,.25)'], Math.floor(w * h / 18), 3);
}
/** A pair of rails on sleepers from (x1, z) to (x2, z), in pixels. */
function railTrack(g, x1, x2, z, px) {
    g.fillStyle = '#5b5148';
    for (let x = x1; x < x2; x += px * 0.28)
        g.fillRect(x, z - px * 0.32, px * 0.12, px * 0.64);
    g.fillStyle = '#9aa0a3';
    g.fillRect(x1, z - px * 0.22, x2 - x1, Math.max(1, px * 0.07));
    g.fillRect(x1, z + px * 0.16, x2 - x1, Math.max(1, px * 0.07));
}
/**
 * The city's ground, painted once onto a canvas: asphalt with wear, lane lines and zebra crossings; pavements
 * with kerbs; lots, lawns and yards per district; the landmarks' grounds; the quay. Water cells are left
 * transparent, so the sea plane below shows through as the river and the pond.
 */
function paintGround() {
    const px = GROUND_PX, cv = document.createElement('canvas'), r = seeded(99);
    cv.width = W * px;
    cv.height = SEA_Z * px;
    const g = cv.getContext('2d');
    const P = (v) => v * px;
    const isWater = (i, j) => inside(i, j) && G.grid[idx(i, j)] === 4 /* Cell.Sea */;
    // asphalt, with grain, repair patches, oil stains and cracks
    g.fillStyle = '#43474a';
    g.fillRect(0, 0, cv.width, cv.height);
    speckle(g, r, 0, 0, cv.width, P(QUAY_Z), ['rgba(255,255,255,.05)', 'rgba(0,0,0,.10)'], 26000, 2);
    for (let k = 0; k < 220; k++) {
        const i = Math.floor(r() * W), j = Math.floor(r() * QUAY_Z);
        if (G.grid[idx(i, j)] !== 0 /* Cell.Road */ || G.blockAt[idx(i, j)] >= 0)
            continue;
        g.fillStyle = r() < 0.5 ? 'rgba(20,22,24,.28)' : 'rgba(120,120,115,.16)';
        g.fillRect(P(i + r() * 0.5), P(j + r() * 0.5), P(0.3 + r() * 0.9), P(0.3 + r() * 0.9));
    }
    for (let k = 0; k < 260; k++) {
        const i = Math.floor(r() * W), j = Math.floor(r() * QUAY_Z);
        if (G.grid[idx(i, j)] !== 0 /* Cell.Road */)
            continue;
        g.fillStyle = 'rgba(15,15,15,.22)';
        g.beginPath();
        g.ellipse(P(i + 0.5 + (r() - 0.5) * 0.6), P(j + 0.5 + (r() - 0.5) * 0.6), P(0.1 + r() * 0.15), P(0.08 + r() * 0.12), r() * 3, 0, Math.PI * 2);
        g.fill();
    }
    g.strokeStyle = 'rgba(18,18,18,.55)';
    g.lineWidth = 1;
    for (let k = 0; k < 140; k++) {
        let x = r() * W, z = r() * QUAY_Z;
        if (G.grid[cellOf(x, z)] !== 0 /* Cell.Road */)
            continue;
        g.beginPath();
        g.moveTo(P(x), P(z));
        for (let s = 0; s < 5; s++) {
            x += (r() - 0.5) * 0.7;
            z += (r() - 0.5) * 0.7;
            g.lineTo(P(x), P(z));
        }
        g.stroke();
    }
    // lane lines between the junctions, and zebra crossings on every approach
    g.strokeStyle = 'rgba(232,222,180,.6)';
    g.lineWidth = 2;
    g.setLineDash([P(0.5), P(0.5)]);
    for (let k = 0; k <= W - 2; k += 8)
        for (let m = 0; m < 7; m++) {
            g.beginPath();
            g.moveTo(P(k + 1), P(m * 8 + 2.4));
            g.lineTo(P(k + 1), P(m * 8 + 7.6));
            g.stroke();
        }
    for (let m = 0; m <= QUAY_Z - 2; m += 8)
        for (let k = 0; k < 9; k++) {
            g.beginPath();
            g.moveTo(P(k * 8 + 2.4), P(m + 1));
            g.lineTo(P(k * 8 + 7.6), P(m + 1));
            g.stroke();
        }
    g.setLineDash([]);
    g.fillStyle = 'rgba(228,224,210,.72)';
    for (let k = 0; k <= W - 2; k += 8)
        for (let m = 0; m <= QUAY_Z - 2; m += 8) {
            for (const [di, dj] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const i = di < 0 ? k - 1 : di > 0 ? k + 2 : k, j = dj < 0 ? m - 1 : dj > 0 ? m + 2 : m;
                if (!inside(i, j) || G.grid[idx(i, j)] !== 0 /* Cell.Road */ || isWater(i, j))
                    continue;
                for (let s = 0; s < 6; s++) {
                    const o = 0.36 + s * 0.23;
                    if (dj)
                        g.fillRect(P(k + o), P(dj < 0 ? m - 0.8 : m + 2.12), P(0.12), P(0.68));
                    else
                        g.fillRect(P(di < 0 ? k - 0.8 : k + 2.12), P(m + o), P(0.68), P(0.12));
                }
            }
        }
    // pavements with kerbs round every block, then the block's own ground
    for (const b of G.blocks) {
        const x = P(b.x0), z = P(b.z0), w = P(b.w), d = P(b.d), e = P(0.32);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(x - e - 1, z - e - 1, w + 2 * e + 2, d + 2 * e + 2);
        g.fillStyle = '#8f8b80';
        g.fillRect(x - e, z - e, w + 2 * e, d + 2 * e);
        g.strokeStyle = 'rgba(60,55,45,.18)';
        g.lineWidth = 1;
        for (let t = x - e; t < x + w + e; t += P(0.5)) {
            g.beginPath();
            g.moveTo(t, z - e);
            g.lineTo(t, z);
            g.moveTo(t, z + d);
            g.lineTo(t, z + d + e);
            g.stroke();
        }
        for (let t = z - e; t < z + d + e; t += P(0.5)) {
            g.beginPath();
            g.moveTo(x - e, t);
            g.lineTo(x, t);
            g.moveTo(x + w, t);
            g.lineTo(x + w + e, t);
            g.stroke();
        }
        g.strokeStyle = '#bdb7a6';
        g.lineWidth = 2;
        g.strokeRect(x - e + 1, z - e + 1, w + 2 * e - 2, d + 2 * e - 2);
        paintLot(g, r, b, x, z, w, d);
    }
    // the quay: concrete slabs, crane rails, a yellow edge line
    for (let i = 0; i < W; i++)
        for (let j = QUAY_Z; j < SEA_Z; j++) {
            if (G.grid[idx(i, j)] !== 3 /* Cell.Quay */)
                continue;
            g.fillStyle = (i + j) % 2 ? '#8b867b' : '#858076';
            g.fillRect(P(i), P(j), px, px);
        }
    speckle(g, r, 0, P(QUAY_Z), cv.width, P(SEA_Z - QUAY_Z), ['rgba(0,0,0,.08)', 'rgba(255,255,255,.07)'], 3000, 2);
    g.strokeStyle = 'rgba(50,45,40,.3)';
    g.lineWidth = 1;
    for (let i = 0; i <= W; i += 2) {
        g.beginPath();
        g.moveTo(P(i), P(QUAY_Z));
        g.lineTo(P(i), P(SEA_Z));
        g.stroke();
    }
    for (const z of [60.35, 60.65, 63.15, 63.45]) {
        g.fillStyle = '#5d5f60';
        g.fillRect(0, P(z) - 1, cv.width, 2);
    }
    g.fillStyle = '#c9b45a';
    g.fillRect(0, P(SEA_Z - 0.2), cv.width, 3);
    for (let i = 3; i < W; i += 4) {
        g.fillStyle = 'rgba(30,30,30,.4)';
        g.beginPath();
        g.arc(P(i), P(SEA_Z - 0.35), 3, 0, Math.PI * 2);
        g.fill();
    }
    // the bridges: a pavement along each side of the deck
    for (const [a, b] of BRIDGES) {
        g.fillStyle = '#8f8b80';
        g.fillRect(P(RIVER_X0), P(a), P(RIVER_X1 + 1 - RIVER_X0), P(0.3));
        g.fillRect(P(RIVER_X0), P(b + 0.7), P(RIVER_X1 + 1 - RIVER_X0), P(0.3));
    }
    // water: cut out, with a stone coping along its edge
    for (let j = 0; j < SEA_Z; j++)
        for (let i = 0; i < W; i++) {
            if (!isWater(i, j))
                continue;
            g.clearRect(P(i), P(j), px, px);
        }
    g.fillStyle = '#b9b2a0';
    for (let j = 0; j < SEA_Z; j++)
        for (let i = 0; i < W; i++) {
            if (!isWater(i, j))
                continue;
            if (inside(i - 1, j) && !isWater(i - 1, j))
                g.fillRect(P(i) - 3, P(j), 3, px);
            if (inside(i + 1, j) && !isWater(i + 1, j))
                g.fillRect(P(i + 1), P(j), 3, px);
            if (inside(i, j - 1) && !isWater(i, j - 1))
                g.fillRect(P(i), P(j) - 3, px, 3);
            if (j + 1 < SEA_Z && !isWater(i, j + 1))
                g.fillRect(P(i), P(j + 1), px, 3);
        }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, SEA_Z), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, alphaTest: 0.5 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(W / 2, 0, SEA_Z / 2);
    m.receiveShadow = true;
    return m;
}
/** A block's own ground: yards, gardens, plazas and the landmarks' grounds. x, z, w, d in pixels. */
function paintLot(g, r, b, x, z, w, d) {
    const px = GROUND_PX, P = (v) => v * px, cx = x + w / 2, cz = z + d / 2;
    const path = (color, width, pts) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.lineCap = 'round';
        g.beginPath();
        pts.forEach(([a, c], k) => k ? g.lineTo(a, c) : g.moveTo(a, c));
        g.stroke();
        g.lineCap = 'butt';
    };
    switch (b.landmark) {
        case 'victory':
        case 'millbrook': {
            grass(g, r, x, z, w, d);
            path('#c2b593', 5, [[x, cz], [cx - P(0.6), z + P(1.2)], [cx + P(1), cz - P(0.4)], [x + w, cz]]);
            path('#c2b593', 5, [[cx, z + d], [cx + P(0.3), cz + P(0.8)], [cx + P(1), cz - P(0.4)], [cx + P(0.8), z]]);
            if (b.landmark === 'victory') {
                g.fillStyle = '#c2b593';
                g.beginPath();
                g.arc(x + P(4.6), cz, P(0.75), 0, Math.PI * 2);
                g.fill();
            }
            else {
                g.fillStyle = '#c2b593';
                g.beginPath();
                g.arc(cx, cz, P(1.3), 0, Math.PI * 2);
                g.fill();
            }
            return;
        }
        case 'base':
            g.fillStyle = '#8c8456';
            g.fillRect(x, z, w, d);
            speckle(g, r, x, z, w, d, ['rgba(0,0,0,.08)', 'rgba(255,255,230,.08)'], 900, 3);
            g.strokeStyle = '#e4dfcf';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(x + w * 0.5, z + d * 0.62, P(1.3), 0, Math.PI * 2);
            g.stroke();
            g.font = `bold ${P(1.4)}px sans-serif`;
            g.fillStyle = '#e4dfcf';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('H', x + w * 0.5, z + d * 0.62);
            return;
        case 'market': {
            // cobbles in rings round the fountain
            g.fillStyle = '#a3957b';
            g.fillRect(x, z, w, d);
            for (let k = 0; k < 2600; k++) {
                g.fillStyle = ['#b3a487', '#978a72', '#a99b7f', '#8e826c'][k % 4];
                g.fillRect(x + r() * w, z + r() * d, 4, 3);
            }
            g.strokeStyle = 'rgba(70,60,45,.35)';
            g.lineWidth = 2;
            for (const rr of [1.6, 2.3, 2.9]) {
                g.beginPath();
                g.arc(cx, cz, P(rr), 0, Math.PI * 2);
                g.stroke();
            }
            return;
        }
        case 'cathedral':
            grass(g, r, x, z, w, d, '#6f8a52');
            g.fillStyle = '#b3ab96';
            g.fillRect(x + P(0.1), z + P(1.2), P(5.9), P(3.6));
            g.fillRect(x - P(0.3), cz - P(0.5), P(0.8), P(1.0));
            return;
        case 'station':
            g.fillStyle = '#6d6660';
            g.fillRect(x, z, w, d);
            speckle(g, r, x, z, w, d, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.08)'], 1400, 2);
            g.fillStyle = '#a39e92';
            for (const pz of [1.2, 3.0, 4.8])
                g.fillRect(x, z + P(pz - 0.45), P(4.3), P(0.9));
            for (const tz of [2.1, 3.9])
                railTrack(g, 0, x + P(4.3), z + P(tz), px);
            g.fillStyle = '#a39e92';
            g.fillRect(x + P(4.3), z, w - P(4.3), d);
            return;
        case 'stadium': {
            g.fillStyle = '#a39e92';
            g.fillRect(x, z, w, d);
            g.save();
            g.beginPath();
            g.ellipse(cx, cz, P(1.75), P(1.45), 0, 0, Math.PI * 2);
            g.clip();
            for (let k = 0; k < 8; k++) {
                g.fillStyle = k % 2 ? '#5f8f45' : '#6a9a4e';
                g.fillRect(cx - P(1.75) + k * P(3.5) / 8, z, P(3.5) / 8 + 1, d);
            }
            g.restore();
            g.strokeStyle = 'rgba(240,240,230,.85)';
            g.lineWidth = 1.5;
            g.strokeRect(cx - P(1.3), cz - P(0.85), P(2.6), P(1.7));
            g.beginPath();
            g.moveTo(cx, cz - P(0.85));
            g.lineTo(cx, cz + P(0.85));
            g.stroke();
            g.beginPath();
            g.arc(cx, cz, P(0.3), 0, Math.PI * 2);
            g.stroke();
            return;
        }
        case 'townhall':
            g.fillStyle = '#a19c90';
            g.fillRect(x, z, w, d);
            grass(g, r, x + P(1.9), z + P(4.5), P(2.2), P(1.4), '#6f8a52');
            return;
        case 'hospital':
            g.fillStyle = '#b9b5aa';
            g.fillRect(x, z, w, d);
            g.strokeStyle = '#c4433a';
            g.lineWidth = 2;
            for (const zz of [z + P(0.15), z + d - P(1.0)])
                g.strokeRect(cx - P(0.9), zz, P(1.8), P(0.85));
            return;
    }
    switch (b.district) {
        case 'downtown':
            g.fillStyle = '#a19c90';
            g.fillRect(x, z, w, d);
            g.strokeStyle = 'rgba(60,55,45,.2)';
            g.lineWidth = 1;
            for (let t = 0; t <= w; t += P(1)) {
                g.beginPath();
                g.moveTo(x + t, z);
                g.lineTo(x + t, z + d);
                g.stroke();
            }
            for (let t = 0; t <= d; t += P(1)) {
                g.beginPath();
                g.moveTo(x, z + t);
                g.lineTo(x + w, z + t);
                g.stroke();
            }
            break;
        case 'residential':
            grass(g, r, x, z, w, d, '#6a7a50');
            break;
        case 'suburb':
            grass(g, r, x, z, w, d, '#6c8650');
            path('#4f6a3a', 3, [[cx, z], [cx, z + d]]);
            path('#4f6a3a', 3, [[x, cz], [x + w, cz]]);
            break;
        case 'industrial':
            g.fillStyle = '#77746b';
            g.fillRect(x, z, w, d);
            speckle(g, r, x, z, w, d, ['rgba(0,0,0,.18)', 'rgba(255,255,255,.06)'], 700, 4);
            g.fillStyle = 'rgba(210,180,70,.55)';
            for (let t = 0.3; t < 5.8; t += 0.7)
                g.fillRect(x + P(t), z + d - P(0.9), 2, P(0.7));
            break;
        case 'docks':
            g.fillStyle = '#7d7a72';
            g.fillRect(x, z, w, d);
            speckle(g, r, x, z, w, d, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.06)'], 600, 4);
            g.strokeStyle = 'rgba(210,180,70,.6)';
            g.lineWidth = 2;
            if (b.buildings.filter(bd => bd.kind === 'box').length > 6)
                for (let row = 0; row < 2; row++)
                    for (let col = 0; col < 4; col++)
                        g.strokeRect(x + P(0.2 + col * 1.4), z + P(3.65 + row), P(1.4), P(0.7));
            break;
    }
}
/**
 * The land beyond the map: suburban lawns near the city fading into a patchwork of fields, the city's streets
 * carried on out of town, the railway west, the river north, and a strip of shore along the sea.
 */
function paintOutskirts() {
    const px = OUT_PX, r = seeded(7), cv = document.createElement('canvas');
    const WW = W + 2 * OUT, HH = SEA_Z + OUT;
    cv.width = WW * px;
    cv.height = HH * px;
    const g = cv.getContext('2d');
    const X = (x) => (x + OUT) * px, Z = (z) => (z + OUT) * px;
    const fields = ['#6f7d4f', '#7d8752', '#8a8a5a', '#6a7548', '#93875a', '#5f6f45', '#77804c'];
    for (let z = -OUT; z < SEA_Z; z += 7 + Math.floor(r() * 5)) {
        for (let x = -OUT; x < W + OUT;) {
            const w = 6 + Math.floor(r() * 10), h = 12;
            g.fillStyle = fields[Math.floor(r() * fields.length)];
            g.fillRect(X(x), Z(z), w * px, h * px);
            g.strokeStyle = 'rgba(0,0,0,.08)';
            g.lineWidth = 1;
            const vert = r() < 0.5;
            for (let t = 0; t < (vert ? w : h); t += 0.6) {
                g.beginPath();
                if (vert) {
                    g.moveTo(X(x + t), Z(z));
                    g.lineTo(X(x + t), Z(z + h));
                }
                else {
                    g.moveTo(X(x), Z(z + t));
                    g.lineTo(X(x + w), Z(z + t));
                }
                g.stroke();
            }
            g.strokeStyle = '#4c5e37';
            g.lineWidth = 2;
            g.strokeRect(X(x), Z(z), w * px, h * px);
            x += w;
        }
    }
    // suburban lawns close to town
    for (let z = -OUT; z < SEA_Z; z++)
        for (let x = -OUT; x < W + OUT; x++) {
            const d = Math.max(-x, x - W, -z, 0);
            if (d > 22 || r() > 1.1 - d / 22)
                continue;
            g.fillStyle = r() < 0.5 ? '#6c8650' : '#67804b';
            g.fillRect(X(x), Z(z), px, px);
        }
    speckle(g, r, 0, 0, cv.width, cv.height, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.07)'], 20000, 2);
    // roads leading out of town
    g.fillStyle = '#4a4d4e';
    const len = (main) => (main ? OUT : 26);
    for (let j = 0; j < QUAY_Z; j += 8) {
        g.fillRect(X(-len(OUT_ROADS.west.includes(j))), Z(j), len(OUT_ROADS.west.includes(j)) * px, 2 * px);
        g.fillRect(X(W), Z(j), len(OUT_ROADS.east.includes(j)) * px, 2 * px);
    }
    for (let i = 0; i < W; i += 8) {
        if (isRiverCol(i))
            continue;
        g.fillRect(X(i), Z(-len(OUT_ROADS.north.includes(i))), 2 * px, len(OUT_ROADS.north.includes(i)) * px);
    }
    // the railway
    g.fillStyle = '#6d6660';
    g.fillRect(X(-OUT), Z(27.3), OUT * px, 3.4 * px);
    for (const tz of [28.1, 29.9])
        railTrack(g, X(-OUT), X(0), Z(tz), px);
    // the shore
    g.fillStyle = '#c9bb92';
    g.fillRect(0, Z(SEA_Z - 1.4), cv.width, 1.4 * px);
    g.fillStyle = '#8a8676';
    g.fillRect(0, Z(SEA_Z - 0.4), cv.width, 0.4 * px);
    // holes for the city itself and for the river
    g.clearRect(X(0), Z(0), W * px, SEA_Z * px);
    g.clearRect(X(RIVER_X0), Z(-OUT), (RIVER_X1 + 1 - RIVER_X0) * px, OUT * px);
    g.fillStyle = '#b9b2a0';
    g.fillRect(X(RIVER_X0) - 2, Z(-OUT), 2, OUT * px);
    g.fillRect(X(RIVER_X1 + 1), Z(-OUT), 2, OUT * px);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WW, HH), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, alphaTest: 0.5 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(W / 2, 0, (SEA_Z - OUT) / 2);
    m.receiveShadow = true;
    return m;
}
/** Collects static boxes and cylinders (walls, bridges, cranes, bollards) into two instanced meshes. */
class Props {
    constructor() {
        this.boxes = [];
        this.cyls = [];
    }
    box(x, y, z, sx, sy, sz, color, ry = 0) { this.boxes.push([x, y, z, sx, sy, sz, ry, color]); }
    cyl(x, y, z, r, h, color) { this.cyls.push([x, y, z, r * 2, h, r * 2, 0, color]); }
    build() {
        const b = inst(UNIT_BOX, vmat(0xffffff), this.boxes.length), c = inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), vmat(0xffffff), this.cyls.length);
        for (const [im, list] of [[b, this.boxes], [c, this.cyls]]) {
            for (const [x, y, z, sx, sy, sz, ry, color] of list)
                setInst(im, im.count++, x, y, z, sx, sy, sz, ry, 0, color);
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor)
                im.instanceColor.needsUpdate = true;
        }
    }
}
/** Embankment walls wherever water meets land, and stone arches on the bridges' faces. */
function buildWaterEdges(p) {
    const WALL = 0x6e6a60, DEPTH = 0.42, water = (i, j) => !inside(i, j) || G.grid[idx(i, j)] === 4 /* Cell.Sea */;
    const bridgeFace = (i, j) => isRiverCol(i) && isBridgeRow(j);
    for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
            if (water(i, j))
                continue;
            const g = G.grid[idx(i, j)], open = g === 0 /* Cell.Road */ || g === 2 /* Cell.Park */;
            // a low parapet where a street or path ends at the water; the quay edge is left open for the ships
            const top = open ? 0.16 : 0.02;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ni = i + di, nj = j + dj;
                if (!inside(ni, nj) || !water(ni, nj))
                    continue;
                if (dj && bridgeFace(i, j))
                    continue;
                if (dj)
                    p.box(i + 0.5, -DEPTH, j + (dj > 0 ? 1 : 0), 1.04, DEPTH + top, 0.14, WALL);
                else
                    p.box(i + (di > 0 ? 1 : 0), -DEPTH, j + 0.5, 0.14, DEPTH + top, 1.04, WALL);
            }
        }
    // the river carries on north out of the map between straight embankments
    for (const x of [RIVER_X0, RIVER_X1 + 1])
        p.box(x, -DEPTH, -OUT / 2, 0.14, DEPTH + 0.02, OUT, WALL);
    // and the shore beyond the quay
    p.box(-OUT / 2, -DEPTH, SEA_Z, OUT, DEPTH + 0.02, 0.14, WALL);
    p.box(W + OUT / 2, -DEPTH, SEA_Z, OUT, DEPTH + 0.02, 0.14, WALL);
    // bridge faces: a stone arch, the parapet above the deck
    const span = RIVER_X1 + 1 - RIVER_X0, s = new THREE.Shape();
    s.moveTo(0, -DEPTH);
    s.lineTo(0, 0.3);
    s.lineTo(span, 0.3);
    s.lineTo(span, -DEPTH);
    s.lineTo(span - 0.35, -DEPTH);
    s.absellipse(span / 2, -DEPTH, span / 2 - 0.35, DEPTH - 0.1, 0, Math.PI, false, 0);
    s.lineTo(0, -DEPTH);
    const arch = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
    const faces = new THREE.InstancedMesh(arch, vmat(0x8a8475), BRIDGES.length * 2);
    faces.castShadow = true;
    faces.receiveShadow = true;
    let n = 0;
    for (const [a, b] of BRIDGES)
        for (const z of [a - 0.02, b + 1 - 0.14]) {
            setInst(faces, n++, RIVER_X0, 0, z, 1, 1, 1);
        }
    faces.instanceMatrix.needsUpdate = true;
    V.scene.add(faces);
}
/** Gantry cranes on the quay, bollards along its edge, and a lighthouse on the harbour mole. */
function buildHarbour(p) {
    CRANES.forEach((x, k) => {
        const c = k % 2 ? 0xc4532f : 0xd8952e, steel = 0x3a3f42;
        for (const dx of [-1.15, 1.15])
            for (const z of [60.5, 63.3])
                p.box(x + dx, 0, z, 0.2, 4.1, 0.2, c);
        for (const z of [60.5, 63.3])
            p.box(x, 3.9, z, 2.5, 0.25, 0.22, c);
        for (const dx of [-1.15, 1.15])
            p.box(x + dx, 1.4, 61.9, 0.12, 0.14, 2.8, c);
        p.box(x, 4.15, 64.8, 0.5, 0.35, 12.5, c); // the boom, out over the water
        p.box(x, 3.4, 61.2, 0.8, 0.6, 0.9, 0xe8e4d4); // the driver's cab
        p.box(x, 4.5, 59.5, 0.9, 0.6, 1.0, steel); // counterweight
        p.box(x, 4.5, 62.2, 0.12, 1.4, 0.12, c); // the A-frame and its stays
        p.box(x, 2.6, 66, 0.06, 1.55, 0.06, steel); // the hoist and spreader
        p.box(x, 2.45, 66, 0.9, 0.15, 0.45, 0xd8952e);
    });
    for (let i = 1; i < W; i += 2.5) {
        if (isRiverCol(Math.floor(i)))
            continue;
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
    var _a, _b, _c;
    V.scene.add(paintGround());
    V.scene.add(paintOutskirts());
    const seaMat = new THREE.MeshStandardMaterial({ color: 0x46666f, roughness: 0.35, metalness: 0.2 });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(W / 2, -0.35, H / 2);
    sea.receiveShadow = true;
    V.scene.add(sea);
    const props = new Props();
    buildWaterEdges(props);
    buildHarbour(props);
    // buildings: every block's pieces, then the outskirts' houses (which are never recoloured)
    const all = G.blocks.flatMap(b => b.buildings.map(bd => ({ b: b, bd }))).concat(outskirts.map(bd => ({ b: null, bd })));
    const count = (f) => Math.max(1, all.filter(a => f(a.bd)).length);
    const bodies = inst(UNIT_BOX, vmat(0xffffff), count(bd => bd.kind !== 'tank' && bd.kind !== 'chimney' && bd.kind !== 'spire' && bd.kind !== 'dome'));
    const roofs = inst(UNIT_BOX, vmat(0xffffff), count(bd => bd.kind === 'flat' || bd.kind === 'tower'));
    const gables = inst(GABLE, vmat(0xffffff), count(bd => bd.kind === 'house' || bd.kind === 'shed'));
    const cyls = inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0), vmat(0xffffff), count(bd => bd.kind === 'tank' || bd.kind === 'chimney'));
    const cones = inst(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0), vmat(0xffffff), count(bd => bd.kind === 'spire'));
    const domes = inst(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1), vmat(0xffffff), count(bd => bd.kind === 'dome'));
    let bandN = 0;
    for (const { bd } of all)
        if ((bd.kind === 'flat' || bd.kind === 'tower') && bd.h >= 2)
            bandN += Math.floor(bd.h / 1.1);
    const bands = inst(UNIT_BOX, vmat(0x2b3438), bandN, false);
    const note = (b, im, k, color) => {
        if (!b)
            return;
        if (!blockInst.has(b.id))
            blockInst.set(b.id, []);
        blockInst.get(b.id).push({ im, k, color });
    };
    for (const { b, bd } of all) {
        const y = (_a = bd.y) !== null && _a !== void 0 ? _a : 0, ry = (_b = bd.ry) !== null && _b !== void 0 ? _b : 0;
        if (bd.kind === 'tank' || bd.kind === 'chimney') {
            const k = cyls.count++;
            setInst(cyls, k, bd.x, y, bd.z, bd.w, bd.h, bd.d, ry, 0, bd.color);
            note(b, cyls, k, bd.color);
            continue;
        }
        if (bd.kind === 'spire' || bd.kind === 'dome') {
            const im = bd.kind === 'spire' ? cones : domes, k = im.count++;
            setInst(im, k, bd.x, y, bd.z, bd.w, bd.h, bd.d, ry, 0, bd.color);
            note(b, im, k, bd.color);
            continue;
        }
        const k = bodies.count++;
        setInst(bodies, k, bd.x, y, bd.z, bd.w, bd.h, bd.d, ry, 0, bd.color);
        note(b, bodies, k, bd.color);
        if (bd.kind === 'house' || bd.kind === 'shed') {
            // a pitched roof, its ridge along the longer side
            const g = gables.count++, rh = (_c = bd.roofH) !== null && _c !== void 0 ? _c : (bd.kind === 'house' ? 0.75 : 0.5), alongX = bd.w >= bd.d;
            setInst(gables, g, bd.x, y + bd.h, bd.z, (alongX ? bd.d : bd.w) * 1.08, rh, (alongX ? bd.w : bd.d) * 1.04, ry + (alongX ? Math.PI / 2 : 0), 0, bd.roof);
            note(b, gables, g, bd.roof);
        }
        else if (bd.kind === 'flat' || bd.kind === 'tower') {
            const r = roofs.count++;
            setInst(roofs, r, bd.x, y + bd.h, bd.z, bd.w + 0.12, 0.14, bd.d + 0.12, ry, 0, bd.roof);
            note(b, roofs, r, bd.roof);
            if (bd.h >= 2)
                for (let f = 0; f < Math.floor(bd.h / 1.1); f++)
                    setInst(bands, bands.count++, bd.x, y + 0.5 + f * 1.1, bd.z, bd.w + 0.04, 0.32, bd.d + 0.04, ry);
        }
    }
    for (const im of [bodies, roofs, gables, cyls, cones, domes, bands]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor)
            im.instanceColor.needsUpdate = true;
    }
    // trees: conifers and broadleaves
    const trunks = inst(new THREE.CylinderGeometry(0.08, 0.1, 1, 5).translate(0, 0.5, 0), vmat(0x6b5236), trees.length);
    const firs = inst(new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0), vmat(0xffffff), trees.length);
    const leafy = inst(new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0), vmat(0xffffff), trees.length);
    for (const [x, z, s, kind] of trees) {
        const shade = (Math.sin(x * 12.9 + z * 78.2) * 0.5 + 0.5);
        setInst(trunks, trunks.count++, x, 0, z, s, s * 0.5, s);
        if (kind === 0)
            setInst(firs, firs.count++, x, s * 0.35, z, s * 1.1, s * 1.5, s * 1.1, x * 7, 0, shade < 0.5 ? 0x4f6b40 : 0x5f7a48);
        else
            setInst(leafy, leafy.count++, x, s * 0.4, z, s * 1.25, s * 1.1, s * 1.25, x * 7, 0, shade < 0.33 ? 0x6b8a4a : shade < 0.66 ? 0x5f7f45 : 0x7a8f50);
    }
    for (const im of [trunks, firs, leafy]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor)
            im.instanceColor.needsUpdate = true;
    }
    // abandoned cars
    const carBody = inst(UNIT_BOX, vmat(0xffffff), cars.length), carTop = inst(UNIT_BOX, vmat(0xffffff), cars.length);
    for (const [x, z, hd, color] of cars) {
        setInst(carBody, carBody.count++, x, 0.05, z, 0.68, 0.32, 1.45, hd, 0, color);
        setInst(carTop, carTop.count++, x - Math.sin(hd) * 0.08, 0.37, z - Math.cos(hd) * 0.08, 0.6, 0.24, 0.78, hd, 0, color === 0x2b2725 ? 0x1e1c1b : 0x2f3a40);
    }
    for (const im of [carBody, carTop]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor)
            im.instanceColor.needsUpdate = true;
    }
    // Fort Aldermoor: sandbags round the helipad
    const base = G.blocks.find(b => b.district === 'base');
    for (let a = 0; a < Math.PI * 2; a += 0.35)
        props.box(base.x0 + 3 + Math.cos(a) * 2.3, 0, base.z0 + 3.7 + Math.sin(a) * 2.3, 0.5, 0.3, 0.25, 0xbfa978, -a);
    props.build();
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
function figureGeo(parts, far) {
    var _a;
    // Indexed, with shared corners merged: flat shading takes its normals from the screen, so a box
    // needs only 8 vertices. Faces that point straight down are never seen from the sky and are dropped.
    const pos = [], col = [], tint = [], limb = [], index = [];
    const seen = new Map(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    for (const p of parts) {
        if ((p.lod === 1 && far) || (p.lod === 2 && !far))
            continue;
        const g = p.g, a = g.getAttribute('position');
        const ix = g.index ? Array.from(g.index.array) : [...Array(a.count).keys()];
        const r = ((p.c >> 16) & 255) / 255, gr = ((p.c >> 8) & 255) / 255, b = (p.c & 255) / 255;
        const swing = far ? 0 : (_a = p.swing) !== null && _a !== void 0 ? _a : 0;
        const vert = (i) => {
            var _a, _b, _c;
            const x = a.getX(i), y = a.getY(i), z = a.getZ(i), key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)},${p.c},${(_a = p.tint) !== null && _a !== void 0 ? _a : 0},${swing}`;
            let v = seen.get(key);
            if (v === undefined) {
                v = pos.length / 3;
                seen.set(key, v);
                pos.push(x, y, z);
                col.push(r, gr, b);
                tint.push((_b = p.tint) !== null && _b !== void 0 ? _b : 0);
                limb.push(swing, (_c = p.pivot) !== null && _c !== void 0 ? _c : 0);
            }
            return v;
        };
        for (let t = 0; t < ix.length; t += 3) {
            va.fromBufferAttribute(a, ix[t]);
            vb.fromBufferAttribute(a, ix[t + 1]);
            vc.fromBufferAttribute(a, ix[t + 2]);
            vb.sub(va);
            vc.sub(va);
            vb.cross(vc);
            if (vb.lengthSq() < 1e-12)
                continue;
            const ny = vb.normalize().y;
            if (ny < -0.8 || (p.noTop && ny > 0.8))
                continue;
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
const fBox = (w, h, d, x, y, z, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
const fLimb = (w, len, d, x, pivot, z, rx = 0) => new THREE.BoxGeometry(w, len, d).translate(0, -len / 2, 0).rotateX(rx).translate(x, pivot, z);
const fCyl = (rt, rb, h, y, seg = 5, sz = 1, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).scale(1, 1, sz).translate(0, y + h / 2, z);
/** A five-sided head: hair (or a helmet) on top down to angle cut, face below. */
const fHead = (r, y, z, skin, top, cut = 0.45, lod = 0) => [
    { g: new THREE.SphereGeometry(r, 5, 1, 0, Math.PI * 2, 0, Math.PI * cut).translate(0, y, z), c: top, lod },
    { g: new THREE.SphereGeometry(r, 5, 2, 0, Math.PI * 2, Math.PI * cut, Math.PI * (1 - cut)).translate(0, y, z), c: skin, lod },
];
const SKIN = 0xd9b08c, ZSKIN = 0x8d9a6a, BLOOD = 0x7a2a22, WHITE = 0xffffff;
/** Two legs from the hip; in the distant version, one block. */
const legs = (c, hip, len, w, gap, swing) => [
    { g: fLimb(w, len, w * 1.15, -gap, hip, 0), c, swing, pivot: hip, lod: 1, noTop: true },
    { g: fLimb(w, len, w * 1.15, gap, hip, 0), c, swing: -swing, pivot: hip, lod: 1, noTop: true },
    { g: fLimb(gap * 2 + w, len, w * 1.15, 0, hip, 0), c, lod: 2, noTop: true },
];
const arms = (c, sh, len, w, gap, swing, rx = 0, tint = 0, z = 0, lod = 1) => [
    { g: fLimb(w, len, w, -gap, sh, z, rx), c, tint, swing: -swing, pivot: sh, lod, noTop: rx === 0 },
    { g: fLimb(w, len, w, gap, sh, z, rx), c, tint, swing, pivot: sh, lod, noTop: rx === 0 },
];
/** The figures, built once, each near and far. Heights are before the 1.5x people scale: a grown-up is about 0.8. */
function buildFigures() {
    const kinds = {
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
            { g: fCyl(0.23, 0.2, 0.15, 0.44, 6, 0.85, 0.02), c: 0x6f7d58 }, // bare, heaving shoulders
            { g: fBox(0.12, 0.08, 0.03, 0.05, 0.38, 0.11), c: BLOOD, lod: 1 },
            ...arms(0x6f7d58, 0.56, 0.48, 0.11, 0.25, 0.3, -0.25, 0, 0, 0),
            { g: fBox(0.13, 0.11, 0.13, -0.25, 0.1, 0.14), c: 0x5d6a49, lod: 1 }, // fists
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
            { g: fBox(0.2, 0.05, 0.12, 0, 0.555, 0.0), c: WHITE, tint: 0.8, lod: 1 }, // collar
            ...arms(WHITE, 0.54, 0.26, 0.06, 0.145, 0.6, 0, 1),
            ...fHead(0.092, 0.65, 0, SKIN, 0xb89a5e),
        ],
        hat: [
            ...legs(0x46526a, 0.3, 0.3, 0.08, 0.055, 0.8),
            { g: fCyl(0.12, 0.1, 0.27, 0.29, 5, 0.75), c: WHITE, tint: 1 },
            { g: fBox(0.17, 0.2, 0.09, 0, 0.45, -0.11), c: 0x6b5236 }, // rucksack
            ...arms(WHITE, 0.54, 0.25, 0.055, 0.14, 0.7, 0, 1),
            ...fHead(0.092, 0.65, 0, SKIN, 0x3b3631),
            { g: new THREE.CircleGeometry(0.15, 6).rotateX(-Math.PI / 2).translate(0, 0.7, 0), c: 0x3b3631 }, // brim
            { g: fCyl(0.075, 0.09, 0.07, 0.7, 5), c: 0x3b3631, lod: 1 },
        ],
        // soldiers: infantry in helmets with packs, militia in caps; both carry rifles at the ready
        infantry: [
            ...legs(0x2f3329, 0.3, 0.3, 0.085, 0.06, 0.7),
            { g: fCyl(0.13, 0.11, 0.28, 0.28, 5, 0.8), c: WHITE, tint: 1 },
            { g: fBox(0.18, 0.2, 0.1, 0, 0.36, -0.12), c: 0x4a5636 }, // pack
            ...arms(WHITE, 0.54, 0.24, 0.06, 0.15, 0, -0.9, 1),
            { g: fBox(0.035, 0.04, 0.36, 0.06, 0.43, 0.2), c: 0x1f1f1d, lod: 1 }, // rifle
            fHead(0.09, 0.65, 0, SKIN, 0x55633a, 0.45)[1],
            { g: new THREE.SphereGeometry(0.125, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.655, 0), c: 0x55633a }, // helmet
        ],
        militia: [
            ...legs(0x46526a, 0.3, 0.3, 0.08, 0.055, 0.75),
            { g: fCyl(0.12, 0.1, 0.27, 0.29, 5, 0.75), c: WHITE, tint: 1 },
            { g: fBox(0.06, 0.24, 0.02, 0.05, 0.36, 0.08, 0.6), c: 0x6b5236, lod: 1 }, // bandolier
            ...arms(WHITE, 0.54, 0.24, 0.055, 0.14, 0, -0.75, 1),
            { g: fBox(0.03, 0.035, 0.32, 0.05, 0.45, 0.18), c: 0x3b2a1e, lod: 1 }, // hunting rifle
            ...fHead(0.094, 0.655, 0, SKIN, 0x4a3f33, 0.4), // cap
            { g: fBox(0.13, 0.015, 0.08, 0, 0.69, 0.09), c: 0x4a3f33 }, // peak
        ],
    };
    const out = {};
    for (const k in kinds) {
        out[k] = [figureGeo(kinds[k], false), figureGeo(kinds[k], true)];
        for (const p of kinds[k])
            p.g.dispose();
    }
    return out;
}
const PEOPLE_T = { value: 0 };
let figMat = null;
/** The figure material: vertex colours, the instance colour only where aTint says, and the limb swing. */
function figureMat() {
    if (figMat)
        return figMat;
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
function figMesh([near, far], cap) {
    const im = new THREE.InstancedMesh(near, figureMat(), cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    anim.setUsage(THREE.DynamicDrawUsage);
    near.setAttribute('aAnim', anim);
    far.setAttribute('aAnim', anim);
    im.castShadow = false;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    V.scene.add(im);
    return { im, n: 0, mat: im.instanceMatrix.array, col: im.instanceColor.array, anim: anim.array, near, far };
}
/** Place one figure: at (x, y, z), scale s, facing hd, leaning forward by lean, tinted color,
 *  with its limbs swinging at amplitude amp and frequency freq (radians per game second). */
function putFig(f, x, y, z, s, hd, lean, color, ph, amp, freq) {
    const k = f.n;
    if (k >= f.im.instanceMatrix.count)
        return;
    f.n++;
    const e = f.mat, o = k * 16, ch = Math.cos(hd) * s, sh = Math.sin(hd) * s, cl = Math.cos(lean), sl = Math.sin(lean);
    e[o] = ch;
    e[o + 1] = 0;
    e[o + 2] = -sh;
    e[o + 3] = 0;
    e[o + 4] = sh * sl;
    e[o + 5] = cl * s;
    e[o + 6] = ch * sl;
    e[o + 7] = 0;
    e[o + 8] = sh * cl;
    e[o + 9] = -sl * s;
    e[o + 10] = ch * cl;
    e[o + 11] = 0;
    e[o + 12] = x;
    e[o + 13] = y;
    e[o + 14] = z;
    e[o + 15] = 1;
    const c = f.col, q = k * 3;
    c[q] = ((color >> 16) & 255) / 255;
    c[q + 1] = ((color >> 8) & 255) / 255;
    c[q + 2] = (color & 255) / 255;
    const a = f.anim;
    a[q] = ph;
    a[q + 1] = amp;
    a[q + 2] = freq;
}
function flushFig(f, far) {
    f.im.count = f.n;
    f.im.geometry = far ? f.far : f.near; // from high up, a simpler figure without limbs
    f.im.instanceMatrix.needsUpdate = true;
    f.im.instanceColor.needsUpdate = true;
    f.im.geometry.getAttribute('aAnim').needsUpdate = true;
    f.n = 0;
}
let FIG;
const MAX_SOLDIERS = 400;
function buildPeople() {
    const g = buildFigures();
    FIG = {
        walker: figMesh(g.walker, MAX_ZOMBIES), runner: figMesh(g.runner, MAX_ZOMBIES), brute: figMesh(g.brute, MAX_ZOMBIES),
        civ: figMesh(g.civ, MAX_CIVS), coat: figMesh(g.coat, MAX_CIVS), hat: figMesh(g.hat, MAX_CIVS),
        infantry: figMesh(g.infantry, MAX_SOLDIERS), militia: figMesh(g.militia, MAX_SOLDIERS),
    };
}
/** Which figure to draw: the simulation tags every infected (0 walker, 1 runner, 2 brute). */
const zedKind = (z) => z.kind;
const PS = 1.5; // people are drawn larger than life so they read from the air
function drawPeople(time) {
    PEOPLE_T.value = time;
    const zf = [FIG.walker, FIG.runner, FIG.brute];
    let n = 0;
    for (const z of G.zeds) {
        if (n++ >= MAX_ZOMBIES)
            break;
        const kind = zedKind(z), f = zf[kind];
        if (z.rise > 0) {
            putFig(f, z.x, 0.1, z.z, PS, z.hd, Math.PI / 2, z.shirt, 0, 0, 0);
            continue;
        } // the bitten lie where they fell
        const wob = Math.sin(z.ph) * 0.1;
        if (kind === 1)
            putFig(f, z.x, 0, z.z, PS * 0.98, z.hd, 0.5 + wob * 0.5, z.shirt, z.ph, 1, 11);
        else if (kind === 2)
            putFig(f, z.x, 0, z.z, PS * 1.3, z.hd, 0.35 + wob * 0.5, z.shirt, z.ph, 1, 3.6);
        else
            putFig(f, z.x, 0, z.z, PS, z.hd + wob, 0.22 + wob, z.shirt, z.ph, 1, 4.5 + (z.ph % 1));
    }
    const cf = [FIG.civ, FIG.coat, FIG.hat];
    n = 0;
    for (const c of G.civs) {
        if (n++ >= MAX_CIVS)
            break;
        const v = Math.floor(c.ph * 7) % 6; // 0 and 1 are children
        putFig(cf[v % 3], c.x, 0, c.z, v < 1 ? PS * 0.68 : PS, c.hd, 0.12, c.color, c.ph, 1, 10);
    }
    // survivors waiting on a rooftop mission, huddled round their flare and waving
    for (const m of G.missions) {
        if (m.kind !== 'survivors')
            continue;
        for (let q = 0; q < m.people / PER_AGENT && n < MAX_CIVS; q++, n++) {
            const a = q * 2.4, r = 0.6 + Math.floor(Math.sqrt(q)) * 0.35, v = (q * 5) % 6;
            putFig(cf[v % 3], m.x + Math.cos(a) * r, 0, m.z + Math.sin(a) * r, v < 1 ? PS * 0.68 : PS, a + Math.PI, 0, CIV_COLORS[q % CIV_COLORS.length], q, 1, 6);
        }
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
        if (UNITS[u.kind].vehicle)
            continue;
        const f = u.kind === 'militia' ? FIG.militia : FIG.infantry, body = u.kind === 'militia' ? 0x6f6a58 : 0x3d5a78, moving = u.goal >= 0 ? 1 : 0;
        u.members.forEach((m, k) => putFig(f, m.x, 0, m.z, PS, m.hd, moving * 0.12, body, u.id + k * 1.7, moving, 9));
    }
    const far = V.cam.dist > 52;
    for (const k in FIG)
        flushFig(FIG[k], far);
}
// ---- vehicles, ships, aircraft ----
// Small hand-built models. Their geometry is made once and shared (vgeo), as are the materials
// (vmat). Moving parts are named, and drawVehicles turns wheels, tracks, rotors and radar.
function part(g, color, w, h, d, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(UNIT_BOX, vmat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
}
const vgeos = new Map();
function vgeo(key, make) {
    let g = vgeos.get(key);
    if (!g) {
        g = make();
        vgeos.set(key, g);
    }
    return g;
}
function mesh(g, geo, color, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geo, typeof color === 'number' ? vmat(color) : color);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    g.add(m);
    return m;
}
/** A side profile, [z, y] points running round it, extruded across the width and centred on x = 0. */
function profileGeo(pts, width) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (const [z, y] of pts.slice(1))
        s.lineTo(z, y);
    return new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(width / 2, 0, 0);
}
/** A plan outline, [x, z] points, extruded upward by h. */
function planGeo(pts, h) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], -pts[0][1]);
    for (const [x, z] of pts.slice(1))
        s.lineTo(x, -z);
    return new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
}
/** A cylinder lying along x (wheels, rollers), or along z with alongZ. */
const rollerGeo = (r, w, seg = 8, alongZ = false) => vgeo(`roll${r}|${w}|${seg}|${alongZ}`, () => {
    const g = new THREE.CylinderGeometry(r, r, w, seg);
    return alongZ ? g.rotateX(Math.PI / 2) : g.rotateZ(Math.PI / 2);
});
function makeVehicle(kind) {
    const g = new THREE.Group();
    const st = { px: NaN, pz: NaN, roll: 0, wheels: [], cleats: [], barrel: null, r: 0.2, cd: 0, kick: 0, t: 0 };
    const turret = new THREE.Group();
    turret.name = 'turret';
    g.add(turret);
    if (kind === 'tank') {
        const hull = 0x55633a, dark = 0x3f4a2c, track = 0x2a2b26;
        // tracks with road wheels on the outside and cleats that run along the top
        const trackGeo = vgeo('tankTrack', () => profileGeo([[-1.2, 0.02], [1.02, 0.02], [1.24, 0.2], [1.1, 0.4], [-1.24, 0.4], [-1.34, 0.2]], 0.32));
        for (const sx of [-1, 1]) {
            mesh(g, trackGeo, track, sx * 0.58, 0, 0);
            for (let k = 0; k < 5; k++)
                st.wheels.push(mesh(g, rollerGeo(0.14, 0.06, 8), 0x3a3d33, sx * 0.75, 0.17, -0.85 + k * 0.42));
            for (let k = 0; k < 7; k++)
                st.cleats.push(part(g, 0x1c1d1a, 0.33, 0.03, 0.08, sx * 0.58, 0.4, 0));
        }
        st.r = 0.14;
        mesh(g, vgeo('tankHull', () => profileGeo([[-1.15, 0.2], [1.0, 0.2], [1.25, 0.42], [0.95, 0.58], [-1.1, 0.58], [-1.2, 0.45]], 0.86)), hull);
        part(g, 0x2b2622, 0.6, 0.12, 0.35, 0, 0.58, -0.85); // engine deck grille
        part(g, 0x6b5236, 0.2, 0.14, 0.3, 0.32, 0.58, -0.55); // stowage
        turret.position.set(0, 0.58, -0.1);
        mesh(turret, vgeo('tankTurret', () => planGeo([[-0.44, -0.55], [0.44, -0.55], [0.5, 0.05], [0.28, 0.5], [-0.28, 0.5], [-0.5, 0.05]], 0.3)), hull);
        part(turret, dark, 0.7, 0.04, 0.3, 0, 0.3, -0.42); // bustle rack
        mesh(turret, vgeo('cupola', () => new THREE.CylinderGeometry(0.13, 0.15, 0.12, 8).translate(0, 0.06, 0)), dark, 0.22, 0.3, -0.12);
        part(turret, 0x1f1f1d, 0.03, 0.03, 0.3, 0.22, 0.42, 0.0); // machine gun
        part(turret, dark, 0.3, 0.22, 0.16, 0, 0.04, 0.52); // mantlet
        const barrel = new THREE.Group();
        barrel.position.set(0, 0.15, 0.55);
        turret.add(barrel);
        mesh(barrel, vgeo('tankGun', () => new THREE.CylinderGeometry(0.045, 0.055, 1.6, 6).rotateX(Math.PI / 2).translate(0, 0, 0.8)), dark);
        mesh(barrel, vgeo('tankBrake', () => new THREE.CylinderGeometry(0.075, 0.075, 0.18, 6).rotateX(Math.PI / 2)), 0x2f3329, 0, 0, 1.55);
        st.barrel = barrel;
    }
    else {
        // an eight-wheeled armoured personnel carrier with a remote gun, hatches and a rear door
        const hull = 0x5d6b45, dark = 0x3f4a2c;
        for (const sx of [-1, 1])
            for (const z of [-0.72, -0.28, 0.28, 0.72])
                st.wheels.push(mesh(g, rollerGeo(0.21, 0.16, 8), 0x22231f, sx * 0.47, 0.21, z));
        st.r = 0.21;
        mesh(g, vgeo('apcHull', () => profileGeo([[-1.0, 0.2], [0.85, 0.2], [1.08, 0.42], [0.62, 0.78], [-0.95, 0.78], [-1.02, 0.6]], 0.92)), hull);
        for (const sx of [-1, 1])
            part(g, dark, 0.06, 0.06, 1.8, sx * 0.47, 0.45, -0.05); // wheel arches
        part(g, 0x2b3438, 0.6, 0.08, 0.05, 0, 0.66, 0.75); // vision blocks
        for (const sx of [-1, 1])
            part(g, 0xeae2c0, 0.1, 0.06, 0.04, sx * 0.32, 0.5, 1.0); // headlights
        for (const [x, z] of [[-0.22, -0.55], [0.22, -0.55]])
            part(g, dark, 0.3, 0.04, 0.32, x, 0.78, z); // hatches
        part(g, dark, 0.5, 0.42, 0.04, 0, 0.28, -1.02); // rear door
        part(g, 0x1f1f1d, 0.015, 0.7, 0.015, -0.4, 0.78, -0.85).name = 'aerial';
        turret.position.set(0, 0.78, 0.15);
        mesh(turret, vgeo('apcRws', () => planGeo([[-0.2, -0.2], [0.2, -0.2], [0.22, 0.12], [0.1, 0.24], [-0.1, 0.24], [-0.22, 0.12]], 0.2)), 0x4a5638);
        part(turret, 0x2b3438, 0.12, 0.08, 0.04, 0.12, 0.08, 0.24); // sight
        const barrel = new THREE.Group();
        barrel.position.set(-0.05, 0.1, 0.22);
        turret.add(barrel);
        mesh(barrel, vgeo('apcGun', () => new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6).rotateX(Math.PI / 2).translate(0, 0, 0.37)), 0x222222);
        st.barrel = barrel;
    }
    g.userData = st;
    g.scale.setScalar(1.1);
    V.scene.add(g);
    return g;
}
const SHIP_CONTAINERS = [0x3d5a78, 0xc4432f, 0xe2a23a, 0x55633a, 0x7f93a6, 0x8a4b3a];
/** The last freighter out: bow at +z, holds stacked with containers between two deck cranes, the
 *  bridge and funnel aft, lifeboats, a turning radar, and a wake that shows while she is under way. */
function makeShip() {
    const g = new THREE.Group();
    const hullPlan = [[-1.4, -6.2], [1.4, -6.2], [1.5, -5.4], [1.5, 3.6], [1.0, 5.6], [0, 6.7], [-1.0, 5.6], [-1.5, 3.6], [-1.5, -5.4]];
    mesh(g, vgeo('shipHull', () => planGeo(hullPlan, 1.75).translate(0, -0.75, 0)), 0x2f3a40);
    mesh(g, vgeo('shipBoot', () => planGeo(hullPlan, 0.3).scale(1.01, 1, 1.004).translate(0, -0.25, 0)), 0xc4432f, 0, 0, 0, false); // boot-top
    mesh(g, vgeo('shipDeck', () => planGeo(hullPlan, 0.05).scale(0.94, 1, 0.97).translate(0, 0.98, 0)), 0x7a7468, 0, 0, 0, false);
    part(g, 0x2f3a40, 2.4, 0.35, 0.9, 0, 1.0, 5.3); // forecastle
    part(g, 0xeeeae0, 0.08, 1.4, 0.08, 0, 1.3, 5.6); // foremast
    // holds and containers, two tiers, in the harbour's colours
    let k = 0;
    for (const z of [-0.6, 1.3, 3.2])
        for (let tier = 0; tier < 2; tier++)
            for (const x of [-0.85, 0, 0.85]) {
                if (tier === 1 && (k * 7) % 5 === 0) {
                    k++;
                    continue;
                }
                part(g, SHIP_CONTAINERS[(k * 5 + tier) % SHIP_CONTAINERS.length], 0.8, 0.55, 1.75, x, 1.03 + tier * 0.57, z);
                k++;
            }
    // deck cranes between the holds
    for (const z of [0.35, 2.25]) {
        const c = new THREE.Group();
        c.position.set(z < 1 ? 1.05 : -1.05, 1.0, z);
        c.name = 'crane';
        g.add(c);
        mesh(c, vgeo('cranePost', () => new THREE.CylinderGeometry(0.12, 0.15, 1.9, 6).translate(0, 0.95, 0)), 0xe2a23a);
        part(c, 0xe2a23a, 0.3, 0.3, 0.35, 0, 1.75, 0);
        const jib = part(c, 0xe2a23a, 0.1, 0.1, 2.6, 0, 1.9, 1.1);
        jib.rotation.x = -0.35;
        c.rotation.y = z < 1 ? -0.5 : 2.6;
    }
    // the bridge aft: three decks, windows across the front, wings, a radar mast and the funnel
    const aft = -4.4;
    part(g, 0xeeeae0, 2.6, 1.0, 2.0, 0, 1.0, aft);
    part(g, 0xeeeae0, 2.2, 0.8, 1.7, 0, 2.0, aft - 0.1);
    part(g, 0xeeeae0, 3.0, 0.7, 1.3, 0, 2.8, aft + 0.1);
    part(g, 0x2b3438, 2.9, 0.22, 0.04, 0, 3.15, aft + 0.76);
    part(g, 0x2b3438, 2.1, 0.16, 0.04, 0, 2.45, aft + 0.76);
    part(g, 0x2b3438, 2.5, 0.16, 0.04, 0, 1.6, aft + 1.0);
    part(g, 0xd8d2bf, 3.1, 0.06, 1.4, 0, 3.5, aft + 0.1); // wheelhouse roof
    part(g, 0xd8d2bf, 0.08, 0.9, 0.08, 0, 3.5, aft - 0.2);
    const radar = part(g, 0x2b2b2b, 0.7, 0.06, 0.12, 0, 4.35, aft - 0.2);
    radar.name = 'radar';
    mesh(g, vgeo('funnel', () => new THREE.CylinderGeometry(0.42, 0.5, 2.6, 8).scale(1, 1, 1.3).translate(0, 1.3, 0)), 0x2b2b2b, 0, 1.0, aft - 1.05);
    mesh(g, vgeo('funnelBand', () => new THREE.CylinderGeometry(0.44, 0.46, 0.35, 8).scale(1, 1, 1.3).translate(0, 0.175, 0)), 0xe2a23a, 0, 2.95, aft - 1.05);
    for (const sx of [-1, 1]) {
        mesh(g, vgeo('lifeboat', () => new THREE.CapsuleGeometry(0.2, 0.7, 2, 6).rotateX(Math.PI / 2)), 0xe2642a, sx * 1.42, 2.25, aft - 0.2);
    }
    // her wake and bow wave: pale strips on the water, shown while she moves
    const wake = new THREE.Group();
    wake.name = 'wake';
    wake.visible = false;
    g.add(wake);
    for (let i = 0; i < 6; i++) { // churned water astern, fading as it spreads
        const w = mesh(wake, UNIT_BOX, vmat(0xe8efe9, { opacity: [0.5, 0.42, 0.34, 0.26, 0.2, 0.14][i] }), 0, -0.06 - i * 0.002, -6.4 - i * 1.5, false);
        w.scale.set(1.6 + i * 0.55, 0.02, 1.5);
        w.rotation.y = (i % 2 ? 0.08 : -0.08);
    }
    for (const sx of [-1, 1]) { // the V of the wake, and the bow wave
        const k = mesh(wake, UNIT_BOX, vmat(0xe8efe9, { opacity: 0.26 }), sx * 1.6, -0.07, -10.5, false);
        k.scale.set(0.22, 0.02, 9);
        k.rotation.y = -sx * 0.3;
        const b = mesh(wake, UNIT_BOX, vmat(0xe8efe9, { opacity: 0.5 }), sx * 1.15, -0.06, 4.6, false);
        b.scale.set(0.3, 0.02, 3.2);
        b.rotation.y = sx * 0.45;
    }
    // smoke from the funnel
    const smoke = new THREE.Group();
    smoke.name = 'smoke';
    g.add(smoke);
    for (let i = 0; i < 5; i++)
        mesh(smoke, vgeo('puff', () => new THREE.SphereGeometry(0.5, 6, 4)), vmat(0x8d8a82, { opacity: 0.35 }), 0, 0, 0, false);
    g.rotation.y = Math.PI / 2;
    V.scene.add(g);
    return g;
}
/** A city bus, long along x: amber body, a band of windows, a pale roof and four wheels. */
function makeBus() {
    const g = new THREE.Group();
    const st = { px: NaN, pz: NaN, roll: 0, wheels: [], cleats: [], barrel: null, r: 0.18, cd: 0, kick: 0, t: 0 };
    for (const x of [-0.85, 0.85])
        for (const sz of [-1, 1])
            st.wheels.push(mesh(g, rollerGeo(0.18, 0.14, 8, true), 0x22231f, x, 0.18, sz * 0.43));
    part(g, 0xe2a23a, 2.6, 0.55, 0.92, 0, 0.14);
    part(g, 0x2b3438, 2.5, 0.3, 0.94, -0.03, 0.69);
    part(g, 0x2b3438, 0.04, 0.42, 0.8, 1.3, 0.55); // windscreen
    part(g, 0xe4dfcf, 2.62, 0.14, 0.94, 0, 0.99);
    part(g, 0xd8d2bf, 0.8, 0.08, 0.6, -0.5, 1.13); // roof unit
    part(g, 0xffe6a0, 0.04, 0.1, 0.6, 1.31, 0.88).material = vmat(0xffe6a0, { glow: 0xb08a30 }); // destination board
    part(g, 0xc4432f, 2.62, 0.06, 0.95, 0, 0.36); // stripe
    g.userData = st;
    V.scene.add(g);
    return g;
}
function makeEvacMarker(kind) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(kind === 'harbor' ? 2.4 : 1.5, 0.08, 6, 32).rotateX(Math.PI / 2), vmat(0x8fb27a, { glow: 0x5f8f4a }));
    ring.position.y = 0.05;
    g.add(ring);
    part(g, 0x3b3631, 0.3, 0.12, 0.3); // base
    part(g, 0xd8d2bf, 0.08, 2.4, 0.08);
    for (let i = 0; i < 3; i++)
        part(g, 0xc4432f, 0.09, 0.15, 0.09, 0, 0.2 + i * 0.3); // striped foot of the pole
    const flag = new THREE.Group();
    flag.name = 'flag';
    flag.position.y = 2.0;
    g.add(flag);
    part(flag, 0x8fb27a, 0.7, 0.4, 0.04, 0.35);
    part(flag, 0xeeeae0, 0.3, 0.08, 0.05, 0.38, 0.16); // a white bar on the flag
    V.scene.add(g);
    return g;
}
/** The gunship: a slim fuselage with a glazed nose, stub wings and rocket pods, skids, a tail fin,
 *  a four-bladed main rotor over a faint blur disc, and a tail rotor. Nose at +z. */
function makeHeli() {
    const g = new THREE.Group();
    const olive = 0x3f4a3a, dark = 0x2f382c;
    mesh(g, vgeo('heliBody', () => profileGeo([[-0.9, -0.55], [0.7, -0.55], [1.15, -0.3], [1.1, -0.05], [0.6, 0.15], [-0.6, 0.2], [-0.95, -0.1]], 0.62)), olive);
    mesh(g, vgeo('heliGlass', () => profileGeo([[0.55, -0.12], [1.12, -0.12], [1.08, -0.04], [0.62, 0.14]], 0.5)), vmat(0x2b3438, { glow: 0x10161a }));
    part(g, olive, 0.18, 0.2, 2.2, 0, -0.05, -1.95); // tail boom
    part(g, dark, 0.06, 0.65, 0.4, 0, -0.05, -2.95); // fin
    part(g, dark, 0.9, 0.04, 0.25, 0, -0.02, -2.6); // stabiliser
    part(g, dark, 0.4, 0.2, 0.6, 0, 0.18, -0.2); // engine
    part(g, dark, 1.6, 0.05, 0.35, 0, -0.3, 0.0); // stub wings
    for (const sx of [-1, 1]) {
        mesh(g, rollerGeo(0.08, 0.5, 6, true), 0x22231f, sx * 0.72, -0.38, 0.05); // rocket pods
        part(g, 0x22231f, 0.04, 0.04, 1.6, sx * 0.38, -0.9, 0.1); // skids
        for (const z of [-0.3, 0.45])
            part(g, 0x22231f, 0.03, 0.35, 0.03, sx * 0.3, -0.9, z);
    }
    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    rotor.position.y = 0.45;
    g.add(rotor);
    part(rotor, 0x222222, 0.14, 0.1, 0.14);
    for (const a of [0, Math.PI / 2]) {
        const b = part(rotor, 0x222222, 4.4, 0.03, 0.16, 0, 0.08);
        b.rotation.y = a;
    }
    const disc = new THREE.Mesh(vgeo('rotorDisc', () => new THREE.CylinderGeometry(2.2, 2.2, 0.01, 24)), vmat(0x1c1d1a, { opacity: 0.18 }));
    disc.position.y = 0.53;
    g.add(disc);
    const tail = new THREE.Group();
    tail.name = 'tailRotor';
    tail.position.set(0.08, 0.05, -3.0);
    g.add(tail);
    for (const a of [0, Math.PI / 2]) {
        const b = mesh(tail, vgeo('cbox', () => new THREE.BoxGeometry(1, 1, 1)), 0x222222);
        b.scale.set(0.03, 0.7, 0.08);
        b.rotation.x = a;
    }
    g.rotation.order = 'YXZ';
    V.scene.add(g);
    return g;
}
/** A pair of strike jets, lead and wingman: swept wings, twin fins and a glowing exhaust. Nose at +z. */
function makeJet() {
    const g = new THREE.Group();
    const grey = 0x6d767a, dark = 0x4d5559;
    const wing = vgeo('jetWing', () => planGeo([[0.15, 0.55], [1.55, -0.55], [1.55, -0.85], [0.15, -0.95], [-0.15, -0.95], [-1.55, -0.85], [-1.55, -0.55], [-0.15, 0.55]], 0.06));
    const tailp = vgeo('jetTail', () => planGeo([[0.1, -1.0], [0.75, -1.45], [0.75, -1.6], [-0.75, -1.6], [-0.75, -1.45], [-0.1, -1.0]], 0.04));
    const body = vgeo('jetBody', () => new THREE.CylinderGeometry(0.2, 0.24, 2.6, 6).rotateX(Math.PI / 2).translate(0, 0, -0.3));
    const nose = vgeo('jetNose', () => new THREE.ConeGeometry(0.2, 0.8, 6).rotateX(Math.PI / 2).translate(0, 0, 1.4));
    const fin = vgeo('jetFin', () => profileGeo([[-1.6, 0], [-0.95, 0], [-1.4, 0.6], [-1.65, 0.6]], 0.04));
    for (const [ox, oz] of [[0, 0], [2.6, -2.8]]) {
        const p = new THREE.Group();
        p.position.set(ox, oz ? -0.4 : 0, oz);
        g.add(p);
        mesh(p, body, grey);
        mesh(p, nose, dark);
        mesh(p, wing, grey, 0, -0.05, 0);
        mesh(p, tailp, dark, 0, 0, 0);
        for (const sx of [-1, 1]) {
            const f = mesh(p, fin, dark, sx * 0.16, 0.1, 0);
            f.rotation.z = -sx * 0.25;
        }
        mesh(p, vgeo('jetCanopy', () => new THREE.SphereGeometry(0.16, 6, 4).scale(1, 0.8, 2.6).translate(0, 0.2, 0.55)), vmat(0x2b3438, { glow: 0x10161a }));
        const flame = mesh(p, vgeo('jetFlame', () => new THREE.ConeGeometry(0.17, 0.8, 6).rotateX(-Math.PI / 2).translate(0, 0, -2.0)), vmat(0xffb04a, { glow: 0xff8a2a, opacity: 0.8 }), 0, 0, 0, false);
        flame.name = 'flame';
    }
    g.rotation.order = 'YXZ';
    V.scene.add(g);
    return g;
}
function makeBeacon(kind) {
    const g = new THREE.Group();
    const color = kind === 'crate' ? 0xe2a23a : 0xff6a3a;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 22, 12, 1, true).translate(0, 11, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.name = 'beam';
    g.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.07, 4, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
    ring.name = 'ring';
    ring.position.y = 0.06;
    g.add(ring);
    if (kind === 'crate') {
        part(g, 0x8a6b44, 0.9, 0.7, 0.9);
        part(g, 0x55633a, 0.95, 0.12, 0.95, 0, 0.35);
    }
    else {
        const flare = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb08a }));
        flare.name = 'flare';
        flare.position.y = 1.8;
        g.add(flare);
    }
    V.scene.add(g);
    return g;
}
const beacons = new Map();
function drawBeacons(time) {
    const live = new Set();
    for (const m of G.missions) {
        live.add(m.id);
        let g = beacons.get(m.id);
        if (!g) {
            g = makeBeacon(m.kind);
            beacons.set(m.id, g);
            g.position.set(m.x, 0, m.z);
        }
        const urgent = m.t < 15, pulse = 1 + Math.sin(time * (urgent ? 10 : 4)) * 0.15;
        const ring = g.getObjectByName('ring');
        if (ring)
            ring.scale.setScalar(pulse);
        const beam = g.getObjectByName('beam');
        if (beam)
            beam.material.opacity = 0.16 + Math.max(0, Math.sin(time * 3)) * 0.12;
        const flare = g.getObjectByName('flare');
        if (flare)
            flare.position.y = 1.8 + Math.sin(time * 2) * 0.3;
    }
    for (const [id, g] of beacons)
        if (!live.has(id)) {
            V.scene.remove(g);
            beacons.delete(id);
        }
}
const vehicles = new Map();
const evacMarks = new Map();
const helis = new Map();
const jets = new Map();
/** Turn wheels and run tracks by how far a vehicle moved since the last frame. */
function roll(g) {
    const st = g.userData;
    const d = Number.isNaN(st.px) ? 0 : Math.hypot(g.position.x - st.px, g.position.z - st.pz) / g.scale.x;
    st.px = g.position.x;
    st.pz = g.position.z;
    if (d > 1)
        return d; // teleported (reset): not a roll
    st.roll += d;
    for (const w of st.wheels)
        w.rotation.x = st.roll / st.r;
    st.cleats.forEach((c, k) => { c.position.z = 1.1 - ((st.roll + (k % 7) * 0.33) % 2.3); });
    return d;
}
const ease = (u) => u * u * (3 - 2 * u);
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
        const moved = roll(g), st = g.userData;
        g.position.y = moved > 0.001 ? Math.abs(Math.sin(time * 18 + u.id)) * 0.02 : 0; // a little jolt on the move
        const tur = g.getObjectByName('turret');
        if (tur && u.aim)
            tur.rotation.y = Math.atan2(u.aim.x - u.x, u.aim.z - u.z) - g.rotation.y;
        // the main gun kicks back as it fires
        const m = u.members[0], dt = Math.max(0, time - st.t);
        st.t = time;
        if (m && m.cd > st.cd + 0.05 && m.cd > 0.3)
            st.kick = 1; // its cooldown jumped: it just fired
        if (m)
            st.cd = m.cd;
        st.kick = Math.max(0, st.kick - dt * 4);
        if (st.barrel)
            st.barrel.position.z = (u.kind === 'tank' ? 0.55 : 0.22) - st.kick * (u.kind === 'tank' ? 0.22 : 0.06);
        const aerial = g.getObjectByName('aerial');
        if (aerial)
            aerial.rotation.x = Math.sin(time * 9 + u.id) * (moved > 0.001 ? 0.15 : 0.03);
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
        const v = m.vehicle;
        if (e.kind === 'harbor') {
            // she swings her bow out to sea as she leaves, and comes back bow first
            const turn = ease(clamp((away - 0.05) * 3, 0, 1)), leaving = since < T;
            v.position.set(e.x + 2, -0.25 + Math.sin(time * 0.9) * 0.05, SEA_Z + 2.4 + away * 30);
            v.rotation.y = Math.PI / 2 + (leaving ? -1 : 1) * (Math.PI / 2) * turn;
            v.rotation.z = Math.sin(time * 0.7) * 0.015;
            const under = away > 0 && away < 1, wake = v.getObjectByName('wake');
            wake.visible = under;
            if (under)
                for (let i = 0; i < 6; i++)
                    wake.children[i].scale.x = (1.6 + i * 0.55) * (1 + Math.sin(time * 3 + i) * 0.1);
            const radar = v.getObjectByName('radar');
            if (radar)
                radar.rotation.y = time * 1.5;
            // a wisp from the funnel at the quay, a plume under way
            const smoke = v.getObjectByName('smoke'), plume = under ? 1 : 0.45;
            smoke.children.forEach((p, i) => {
                const u = (time * 0.2 + i / 5) % 1, s = (0.3 + u * 0.9) * plume;
                p.position.set(Math.sin(i * 2 + u * 3) * 0.2, 3.7 + u * 2.5 * plume, -5.45 - u * 2.2 * plume);
                p.scale.setScalar(s);
            });
        }
        else {
            v.position.set(e.x + 1.4 + away * 20, 0, e.z);
            v.visible = away < 0.95;
            roll(v);
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
        // circling: nose down a touch and banked into the turn
        h.position.set(s.hx, 6 + Math.sin(time * 1.3) * 0.08, s.hz);
        h.rotation.set(0.12, -s.ang, -0.22);
        const r = h.getObjectByName('rotor');
        if (r)
            r.rotation.y = time * 25;
        const t = h.getObjectByName('tailRotor');
        if (t)
            t.rotation.x = time * 40;
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
        j.rotation.set(0, Math.atan2(dx, dz), Math.sin(time * 1.7 + s.dir) * 0.12);
        j.traverse(o => { if (o.name === 'flame')
            o.scale.z = 0.8 + Math.random() * 0.5; });
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
        const h = Math.max(1.5, ...selBlock.buildings.map(b => { var _a; return ((_a = b.y) !== null && _a !== void 0 ? _a : 0) + b.h; })) + 0.3;
        blockMark.position.set(selBlock.x0 + selBlock.w / 2, 0, selBlock.z0 + selBlock.d / 2);
        blockMark.scale.set(selBlock.w + 0.4, h, selBlock.d + 0.4);
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
    if (G.shake > 0) {
        const k = G.shake * G.shake * 0.5;
        V.camera.position.x += (Math.random() - 0.5) * k;
        V.camera.position.y += (Math.random() - 0.5) * k;
    }
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
// the blown bridges: the deck's middle gone, broken ends sagging into the river, rubble in the water
let blown = null;
function drawBlownBridges() {
    if (G.sealed === !!blown)
        return;
    if (blown) {
        V.scene.remove(blown);
        blown = null;
        return;
    } // a new game
    blown = new THREE.Group();
    for (const [a, b] of BRIDGES) {
        const z = (a + b + 1) / 2, d = b - a + 1;
        const gap = new THREE.Mesh(UNIT_BOX, vmat(0x4f6f78));
        gap.scale.set(RIVER_X1 - RIVER_X0 - 0.6, 0.08, d + 0.4);
        gap.position.set((RIVER_X0 + RIVER_X1 + 1) / 2, -0.02, z);
        blown.add(gap);
        for (const side of [-1, 1]) {
            const end = new THREE.Mesh(UNIT_BOX, vmat(0x6f6a60));
            end.scale.set(0.9, 0.18, d * 0.9);
            end.castShadow = true;
            end.position.set((RIVER_X0 + RIVER_X1 + 1) / 2 + side * 1.65, -0.18, z);
            end.rotation.z = side * 0.35;
            blown.add(end);
        }
        for (let k = 0; k < 7; k++) {
            const r = new THREE.Mesh(UNIT_BOX, vmat(k % 2 ? 0x8a8475 : 0x5a564e));
            const s = 0.25 + ((k * 37) % 10) / 25;
            r.scale.set(s, s * 0.6, s);
            r.position.set(RIVER_X0 + 0.8 + ((k * 53) % 30) / 10, -0.3, a + ((k * 29) % (d * 10)) / 10 + 0.2);
            r.rotation.y = k;
            blown.add(r);
        }
    }
    V.scene.add(blown);
}
function drawFrame(time, dt, sel, selBlock, place) {
    if (G.changed) {
        paintBlocks();
        G.changed = false;
    }
    drawBlownBridges();
    drawPeople(time);
    drawVehicles(time);
    drawBeacons(time);
    drawTracers();
    drawBooms(dt);
    drawSmoke(time);
    drawMarkers(sel, selBlock, place, time);
    placeCamera();
    drawFx(time); // fx.ts: ability effects, floating text, rank stars
    V.renderer.render(V.scene, V.camera);
}

// ---- audio.ts ----
// Procedural sound with Web Audio: every effect is synthesised, so there are no files to load.
// The simulation records events in G.sfx; playSfx() drains them each frame, quieter with distance
// from where the camera is looking, and rate-limited per kind so a firefight doesn't turn to noise.
const AUD = {
    ctx: null,
    master: null,
    noise: null,
    muted: false,
    last: {},
    groanT: 0,
};
try {
    AUD.muted = localStorage.getItem('lbc-city-muted') === '1';
}
catch (e) { /* storage blocked */ }
/** Audio may only start after a user gesture; called from the first click. */
function startAudio() {
    if (AUD.ctx) {
        if (AUD.ctx.state === 'suspended')
            AUD.ctx.resume();
        return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC)
        return;
    const ctx = new AC();
    AUD.ctx = ctx;
    AUD.master = ctx.createGain();
    AUD.master.gain.value = AUD.muted ? 0 : 0.55;
    AUD.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < d.length; k++)
        d[k] = Math.random() * 2 - 1;
    AUD.noise = buf;
}
function setMuted(m) {
    AUD.muted = m;
    try {
        localStorage.setItem('lbc-city-muted', m ? '1' : '0');
    }
    catch (e) { /* storage blocked */ }
    if (AUD.master && AUD.ctx)
        AUD.master.gain.setTargetAtTime(m ? 0 : 0.55, AUD.ctx.currentTime, 0.05);
}
function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function noiseBurst(vol, freq, q, attack, decay, type = 'bandpass', sweepTo) {
    const ctx = AUD.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = AUD.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweepTo)
        f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    env(g, t, vol, attack, decay);
    src.connect(f);
    f.connect(g);
    g.connect(AUD.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.05);
}
function tone(vol, type, f0, f1, attack, decay, lowpass = 4000, delay = 0) {
    const ctx = AUD.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    env(g, t, vol, attack, decay);
    o.connect(f);
    f.connect(g);
    g.connect(AUD.master);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
}
const GAP = { shot: 0.045, mg: 0.06, cannon: 0.25, boom: 0.08, horn: 2, alarm: 3, chime: 0.3, crunch: 0.2, siren: 1.2, rank: 0.5, tick: 0.5, throw: 0.15 };
const SOUND = {
    shot: v => noiseBurst(0.35 * v, 1700 + Math.random() * 600, 1.2, 0.002, 0.07),
    mg: v => noiseBurst(0.25 * v, 1100, 1.5, 0.002, 0.05),
    cannon: v => { noiseBurst(0.7 * v, 400, 0.7, 0.004, 0.45, 'lowpass', 90); tone(0.5 * v, 'sine', 110, 38, 0.005, 0.4); },
    boom: v => { noiseBurst(1.0 * v, 900, 0.6, 0.006, 1.3, 'lowpass', 70); tone(0.7 * v, 'sine', 80, 28, 0.01, 1.0); },
    horn: v => { for (const f of [98, 147])
        tone(0.28 * Math.max(v, 0.35), 'sawtooth', f, f * 0.98, 0.15, 1.6, 600); },
    alarm: () => { for (let k = 0; k < 3; k++) {
        tone(0.12, 'square', 520, 860, 0.02, 0.5, 1800, k * 0.9);
        tone(0.12, 'square', 860, 520, 0.02, 0.38, 1800, k * 0.9 + 0.5);
    } },
    chime: () => { tone(0.18, 'sine', 660, 660, 0.01, 0.35); tone(0.15, 'sine', 990, 990, 0.01, 0.5, 4000, 0.12); },
    crunch: v => noiseBurst(0.45 * v, 300, 2, 0.003, 0.18, 'bandpass', 120),
    // an APC's siren: a rising and falling wail
    siren: v => { const a = 0.12 * Math.max(v, 0.3); tone(a, 'sawtooth', 600, 1150, 0.02, 0.6, 2200); tone(a, 'sawtooth', 1150, 600, 0.02, 0.55, 2200, 0.62); },
    // promotion: a short bugle-like rising triad
    rank: () => { tone(0.14, 'triangle', 523, 523, 0.01, 0.16); tone(0.14, 'triangle', 659, 659, 0.01, 0.16, 4000, 0.13); tone(0.16, 'triangle', 784, 784, 0.01, 0.4, 4000, 0.26); },
    // the last ship's countdown
    tick: () => tone(0.16, 'square', 1320, 1320, 0.003, 0.06, 3000),
    // a grenade or bottle leaving a hand: a short whoosh
    throw: v => noiseBurst(0.18 * v, 2500, 0.8, 0.02, 0.18, 'bandpass', 900),
};
/** Play whatever the simulation recorded since the last frame. */
function playSfx(dt) {
    var _a, _b;
    const events = G.sfx;
    G.sfx = [];
    if (!AUD.ctx || AUD.muted || AUD.ctx.state !== 'running')
        return;
    const now = AUD.ctx.currentTime, cam = V.cam, reach = cam.dist * 0.9 + 12;
    // keep only the nearest event of each kind this frame
    const best = {};
    for (const e of events) {
        const d = Math.hypot(e.x - cam.x, e.z - cam.z), v = e.k === 'alarm' || e.k === 'horn' || e.k === 'chime' || e.k === 'rank' || e.k === 'tick' ? 1 : clamp(1 - d / reach, 0, 1) * clamp(40 / cam.dist, 0.35, 1);
        if (v > ((_a = best[e.k]) !== null && _a !== void 0 ? _a : 0))
            best[e.k] = v;
    }
    for (const k of Object.keys(best)) {
        if (now - ((_b = AUD.last[k]) !== null && _b !== void 0 ? _b : -9) < GAP[k] || best[k] < 0.04)
            continue;
        AUD.last[k] = now;
        SOUND[k](best[k]);
    }
    // now and then, a groan from the infected in view
    AUD.groanT -= dt;
    if (AUD.groanT <= 0) {
        AUD.groanT = 1.5 + Math.random() * 2.5;
        let near = 0;
        for (const z of G.zeds)
            if (dist2(z.x, z.z, cam.x, cam.z) < reach * reach * 0.3 && ++near > 5)
                break;
        if (near > 5) {
            const f = 70 + Math.random() * 40;
            tone(0.09, 'sawtooth', f, f * 0.7, 0.25, 0.9, 380);
        }
    }
}

// ---- fx.ts ----
// Effects for abilities, ranks and feedback, kept apart from view.ts: floating text over the map
// (money, people saved, unit barks), rank stars over veteran units, grenades and shells in flight,
// the flare over an APC using its siren, and a ring round a block being held. drawFx() runs once a
// frame, after the camera is placed. The simulation records what to show (G.pops, G.shells,
// Unit.lureT, G.missions); this file only draws it.
const FX = {
    game: null, // a new game clears everything
    layer: null,
    pops: [],
    tags: new Map(),
    shells: [],
    flares: [],
    lureRings: [],
    holdRings: [],
    v: new THREE.Vector3(),
};
const POP_LIFE = { good: 2.4, bad: 2.6, key: 2.8, say: 2.6, money: 2.2 };
/** Screen position of a world point, or null when it is behind the camera or off screen. */
function fxProject(x, y, z) {
    const el = V.renderer.domElement, w = el.clientWidth, h = el.clientHeight;
    FX.v.set(x, y, z).project(V.camera);
    if (FX.v.z > 1 || FX.v.x < -1.1 || FX.v.x > 1.1 || FX.v.y < -1.1 || FX.v.y > 1.1)
        return null;
    return [(FX.v.x + 1) / 2 * w, (1 - FX.v.y) / 2 * h];
}
function fxPlace(el, p) {
    if (!p) {
        el.style.visibility = 'hidden';
        return;
    }
    el.style.visibility = '';
    el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px) translate(-50%, -100%)`;
}
function fxRing(color) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 4, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    V.scene.add(r);
    return r;
}
function drawFx(time) {
    if (!FX.layer) {
        FX.layer = document.getElementById('fx');
        if (!FX.layer)
            return;
    }
    if (FX.game !== G) {
        FX.game = G;
        for (const p of FX.pops)
            p.el.remove();
        FX.pops.length = 0;
        for (const el of FX.tags.values())
            el.remove();
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
    while (FX.pops.length > 18)
        FX.pops.shift().el.remove();
    for (let k = FX.pops.length - 1; k >= 0; k--) {
        const p = FX.pops[k], age = now - p.born;
        if (age > p.life) {
            p.el.remove();
            FX.pops.splice(k, 1);
            continue;
        }
        fxPlace(p.el, fxProject(p.x, 2.2 + age * 0.9, p.z));
        p.el.style.opacity = String(Math.min(1, (1 - age / p.life) * 2.2));
    }
    // rank stars over veteran units
    const live = new Set();
    for (const u of G.units) {
        if (!u.rank)
            continue;
        live.add(u.id);
        let el = FX.tags.get(u.id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'tag-rank';
            FX.layer.appendChild(el);
            FX.tags.set(u.id, el);
        }
        const t = '★'.repeat(u.rank);
        if (el.textContent !== t) {
            el.textContent = t;
            el.classList.toggle('elite', u.rank > 1);
        }
        fxPlace(el, fxProject(u.x, UNITS[u.kind].vehicle ? 1.9 : 1.5, u.z));
    }
    for (const [id, el] of FX.tags)
        if (!live.has(id)) {
            el.remove();
            FX.tags.delete(id);
        }
    // grenades, molotovs and shells in flight, on an arc
    while (FX.shells.length < G.shells.length) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: 0x2c3326 }));
        V.scene.add(m);
        FX.shells.push(m);
    }
    FX.shells.forEach((m, k) => {
        const s = G.shells[k], p = s ? 1 - s.t / s.dur : -1;
        m.visible = p >= 0 && p <= 1;
        if (!m.visible)
            return;
        m.position.set(s.sx + (s.x - s.sx) * p, 0.7 + Math.sin(p * Math.PI) * (s.big ? 1.6 : 2.6), s.sz + (s.z - s.sz) * p);
        m.scale.setScalar(s.big ? 1.3 : 1);
        m.material.color.setHex(s.big ? 0xffd27a : s.dmg < 4 ? 0xff8a3a : 0x2c3326);
    });
    // an APC's flare: a red light pulsing over it and a ring spreading out along the streets
    const lures = G.units.filter(u => u.lureT > 0);
    while (FX.flares.length < lures.length) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        V.scene.add(f);
        FX.flares.push(f);
        FX.lureRings.push(fxRing(0xff5a3a));
    }
    FX.flares.forEach((f, k) => {
        const u = lures[k], r = FX.lureRings[k];
        f.visible = r.visible = !!u;
        if (!u)
            return;
        const pulse = 0.5 + 0.5 * Math.sin(time * 14), spread = (time * 0.8) % 1;
        f.position.set(u.x, 2.6 + Math.sin(time * 3) * 0.2, u.z);
        f.scale.setScalar(1 + pulse * 0.8);
        f.material.opacity = 0.6 + pulse * 0.4;
        r.position.set(u.x, 0.08, u.z);
        r.scale.setScalar(2 + spread * 14);
        r.material.opacity = (1 - spread) * 0.7;
    });
    // a block being held: a ring round it, green while a unit is there
    const holds = G.missions.filter(m => m.kind === 'hold');
    while (FX.holdRings.length < holds.length)
        FX.holdRings.push(fxRing(0x8fb27a));
    FX.holdRings.forEach((r, k) => {
        const m = holds[k];
        r.visible = !!m;
        if (!m)
            return;
        const held = G.units.some(u => dist2(u.x, u.z, m.x, m.z) < 6.5 * 6.5), mat = r.material;
        r.position.set(m.x, 0.08, m.z);
        r.scale.setScalar(6.5);
        mat.color.setHex(held ? 0x8fb27a : 0xe2a23a);
        mat.opacity = held ? 0.85 : 0.35 + 0.3 * Math.abs(Math.sin(time * 3));
    });
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
    pressT: 0, // a panel button acted on pointerdown; ignore the click that follows
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
const LANDMARK_LABEL = { stadium: 'Stadium', cathedral: 'Cathedral', station: 'Railway station', market: 'Market square', hospital: 'Hospital', victory: 'Park and monument', millbrook: 'Park and bandstand', base: 'Army base', townhall: 'City Hall' };
function bar(v, max, cls = '') { return `<span class="hp ${cls}"><i style="width:${clamp((v / Math.max(1, max)) * 100, 0, 100).toFixed(0)}%"></i></span>`; }
function refreshPanel(force) {
    UI.sel = UI.sel.filter(u => G.units.includes(u));
    let html = '';
    if (UI.sel.length) {
        const one = UI.sel.length === 1;
        html = UI.sel.slice(0, 6).map(u => {
            const s = UNITS[u.kind], hp = u.members.reduce((a, m) => a + m.hp, 0), max = s.members * s.hp, a = ABILITY[u.kind];
            const next = RANKS[u.rank + 1], cost = reinforceCost(u), canR = cost > 0 && nearSupply(u) && G.funds >= cost;
            const rTitle = u.kind === 'militia' ? 'Militia cannot be reinforced' : !cost ? 'At full strength' : !nearSupply(u) ? 'Reinforce at Fort Aldermoor or an evacuation point' : G.funds < cost ? `Needs $${cost}` : 'Refill the ranks and patch the wounded; the unit keeps its rank';
            return `<div class="unit"><div class="row"><b>${esc(u.name)}</b><span>${u.rank ? `<i class="rank r${u.rank}" title="${RANKS[u.rank].name}">${'★'.repeat(u.rank)} ${RANKS[u.rank].name}</i> · ` : ''}${s.vehicle ? '' : `${u.members.length}/${s.members} men · `}${u.kills} kills</span></div>${bar(hp, max, hp < max * 0.35 ? 'low' : '')}
        <p class="note">${u.lureT > 0 ? '<b class="warn">Siren on: drawing the infected</b>' : u.goal >= 0 ? 'Moving' : 'Holding and firing at anything in range'} · range ${s.range}${u.vip ? ' · <b class="warn">VIP aboard</b>' : ''}</p>
        ${u.kind === 'apc' ? `<p class="note">Carrying <b>${u.cargo}</b> of 60 civilians. Tap a block to load people, then tap near an evacuation point to drop them off.</p>` : ''}
        <div class="btns abil"><button class="btn sm" data-act="ability" data-id="${u.id}" title="${esc(a.desc)}">${a.name}${one ? ' <kbd>F</kbd>' : ''}<span class="cd" data-cd="${u.id}"></span></button>${u.kind === 'militia' ? '' : `<button class="btn sm" data-act="reinforce" data-id="${u.id}" title="${esc(rTitle)}" ${canR ? '' : 'disabled'}>${UNITS[u.kind].vehicle ? 'Repair' : 'Reinforce'}${cost ? ` · $${cost}` : ''}${one ? ' <kbd>R</kbd>' : ''}</button>`}</div>
        ${one ? `<p class="note">${esc(a.desc)}${next ? ` ${next.kills - u.kills} more kills to ${next.name.toLowerCase()}.` : ''}</p>` : ''}</div>`;
        }).join('') + (UI.sel.length > 6 ? `<p class="note">and ${UI.sel.length - 6} more</p>` : '') +
            `<p class="note">Tap a street to move. Right-click also moves. F uses every selected unit's ability. Esc to deselect.</p><button data-act="desel" class="btn">Deselect</button>`;
    }
    else if (UI.block) {
        const b = UI.block, status = b.fallen ? 'Overrun' : b.pop <= 0 ? 'Empty' : b.evacuating ? 'Evacuating' : 'Sheltering';
        html = `<div class="row"><b class="big">${esc(b.name)}</b><span class="tag ${b.fallen ? 'bad' : b.evacuating ? 'warn' : ''}">${status}</span></div>
      <p class="note">${b.landmark ? LANDMARK_LABEL[b.landmark] : { downtown: 'Downtown', residential: 'Residential', suburb: 'Suburb', industrial: 'Industrial', docks: 'Docks', hospital: 'Hospital', park: 'Park', base: 'Army base' }[b.district]}</p>
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
    const ms = $('#missions');
    const hq = G.hqOrders;
    ms.hidden = !G.missions.length && !hq.length;
    const mHtml = (hq.length ? `<h2>Orders from HQ</h2><ul class="orders">` + hq.map(o => `<li class="${o.done ? 'done' : ''}"><span>${o.done ? '✓' : '○'}</span>${esc(o.text)} <b>$${o.reward}</b></li>`).join('') + '</ul>' : '') +
        (G.missions.length ? `<h2>Missions</h2>` + G.missions.map(m => `<div class="mission"><p>${missionText(m)}${m.t < 999 ? ` <b class="${m.t < 15 ? 'urgent' : ''}">${Math.ceil(m.t)}s</b>` : ''}</p><button data-act="goto" data-x="${m.x}" data-z="${m.z}">Show</button></div>`).join('') : '');
    if (ms.innerHTML !== mHtml)
        ms.innerHTML = mHtml;
    const logHtml = G.log.slice(0, 14).map(l => `<li class="${l.kind}"><time>${fmtTime(GAME_SECONDS - l.t)}</time>${esc(l.text)}</li>`).join('');
    const key = html + logHtml;
    if (force || key !== UI.lastPanelKey) {
        UI.lastPanelKey = key;
        $('#sel').innerHTML = html;
        $('#side').classList.toggle('empty', !UI.sel.length && !UI.block && !UI.evac);
        $('#side').classList.toggle('has-missions', G.missions.length > 0 || G.hqOrders.length > 0);
        $('#log').innerHTML = logHtml;
    }
    // ability cooldowns tick every second: update them in place rather than rebuilding the panel
    for (const u of UI.sel) {
        const el = document.querySelector(`[data-cd="${u.id}"]`);
        if (!el)
            continue;
        const v = u.lureT > 0 ? ` · ${Math.ceil(u.lureT)}s on` : u.ab > 0 ? ` · ${Math.ceil(u.ab)}s` : ' · ready';
        if (el.textContent !== v)
            el.textContent = v;
        el.parentElement.classList.toggle('ready', u.ab <= 0);
    }
}
function missionText(m) {
    if (m.kind === 'crate')
        return `Supply drop · $${m.reward}`;
    if (m.kind === 'survivors')
        return `${m.people} survivors · $${m.reward}`;
    if (m.kind === 'vip')
        return m.carrier ? `Bring the VIP to the harbour or the fort · $${m.reward}` : `VIP: ${esc(m.who.split(',')[0])} · $${m.reward}`;
    return `Hold ${esc(G.blocks[m.block].name)} · $${m.reward} + militia ${bar(m.prog, m.need)}<small>${Math.floor(m.prog)} of ${m.need}s held</small>`;
}
/** Use the special ability of every selected unit; reports the first refusal if none went off. */
function useSelAbility() {
    if (!UI.sel.length) {
        toast('Select a unit first, then press F.');
        return;
    }
    let err = null, ok = 0;
    for (const u of UI.sel) {
        const e = useAbility(u);
        if (e)
            err = err !== null && err !== void 0 ? err : e;
        else
            ok++;
    }
    if (!ok && err)
        toast(err);
    refreshPanel(true);
}
function panelAct(t) {
    const u = G.units.find(x => x.id === Number(t.dataset.id));
    if (!u)
        return;
    const err = t.dataset.act === 'ability' ? useAbility(u) : reinforce(u);
    if (err)
        toast(err);
    refreshPanel(true);
}
function decide(i) {
    const err = choose(i);
    if (err) {
        toast(err);
        return;
    }
    showOverlay('');
    refreshPanel(true);
}
function reinforceSel() {
    if (!UI.sel.length) {
        toast('Select a unit first, then press R.');
        return;
    }
    let err = null, ok = 0;
    for (const u of UI.sel) {
        const e = reinforce(u);
        if (e)
            err = err !== null && err !== void 0 ? err : e;
        else
            ok++;
    }
    if (!ok && err)
        toast(err);
    refreshPanel(true);
}
function showOverlay(which) {
    var _a, _b;
    UI.overlay = which;
    const ov = $('#overlay');
    ov.hidden = !which;
    if (!which)
        return;
    if (which === 'decide') {
        const d = G.decision;
        ov.innerHTML = `<div class="card decide" role="dialog" aria-labelledby="dtitle"><span class="eyebrow">A decision · the game is paused</span><h1 id="dtitle">${esc(d.title)}</h1>
      <p class="body">${esc(d.text)}</p><div class="opts">${d.opts.map((o, i) => `<button class="opt" data-act="choose" data-i="${i}" ${o.off ? 'disabled' : ''}><b><kbd>${i + 1}</kbd>${esc(o.label)}</b><span>${esc(o.note)}</span>${o.off ? `<em>${esc(o.off)}</em>` : ''}</button>`).join('')}</div></div>`;
        (_a = ov.querySelector('.opt:not([disabled])')) === null || _a === void 0 ? void 0 : _a.focus();
        return;
    }
    const controls = `<dl class="keys"><dt>Select</dt><dd>Tap or click a unit, block or evacuation point. Shift-click adds units; Ctrl+A selects every unit.</dd>
    <dt>Move</dt><dd>With units selected, tap a street. Right-click also moves.</dd><dt>Camera</dt><dd>Drag to pan, scroll or pinch to zoom, Q and E to turn, WASD or arrows to pan.</dd>
    <dt>Abilities</dt><dd>F uses the selected units' special abilities; R reinforces or repairs them at the fort or an evacuation point.</dd>
    <dt>Buy</dt><dd>Buttons along the bottom, or keys 1 to 7, then tap the map.</dd><dt>Time</dt><dd>Space pauses. Speeds 1×, 2× and 4× at the top.</dd></dl>`;
    if (which === 'start' || which === 'help') {
        ov.innerHTML = `<div class="card"><span class="eyebrow">${which === 'start' ? 'Prototype · Real time' : 'Field manual'}</span><h1>Last Boat to Calder: City</h1>
      <p class="body">The outbreak started at St Brennan's Hospital on the east side. You hold Fort Aldermoor in the north-west and the harbour in the south. The last ship sails in 12 minutes. Get as many people out as you can.</p>
      <ul><li>People shelter at home until you order a block to evacuate, or the infected come close and they panic. Evacuees walk to the nearest evacuation point and wait for a ship or bus.</li>
      <li>The infected hunt the nearest people: anyone in the streets, crowds at the evacuation points, your troops, and blocks they can break into.</li>
      <li>Troops fire on their own. <b>Each unit also has an ability</b> (F): grenades, molotovs, a tank barrage, or an APC's siren that pulls the infected after it. Units earn <b>ranks</b> with kills; reinforce them (R) at the fort or an evacuation point.</li>
      <li><b>APCs rescue people:</b> select one and tap a block to load up to 60, then tap near an evacuation point to drop them off.</li>
      <li><b>Missions</b> pop up: supply drops, rooftop survivors, VIPs to bring out, blocks to hold. Now and then command asks you to <b>decide</b> something; the game waits for you.</li>
      <li>Watch for <b>runners</b> (fast, red shirts, go down easily) and <b>brutes</b> (huge, soak up fire, smash doors in). At minute 8 a great horde arrives from the east.</li>
      <li>Each figure stands for 10 people.</li></ul>${controls}
      <div class="btns"><button class="btn primary" data-act="${which === 'start' ? 'begin' : 'closehelp'}">${which === 'start' ? 'Take command' : 'Back to the city'}</button><a class="btn" href="../">The original game</a></div></div>`;
    }
    else {
        const o = G.over, s = G.stats, d = G.deaths, elsewhere = s.dead - d.streets - d.queues - d.homes - d.fire;
        ov.innerHTML = `<div class="card ${o.pct >= 30 ? '' : 'red'}"><span class="eyebrow">${o.why === 'time' ? 'The last ship has sailed' : 'The city is empty'}</span><h1>${esc(o.grade)}</h1>
      <p class="big">${o.pct.toFixed(0)}% of the city saved</p>
      <div class="stats"><div><b>${fmtPeople(s.evacuated)}</b><span>Evacuated</span></div><div><b>${fmtPeople(s.dead)}</b><span>Dead</span></div><div><b>${s.killed * PER_AGENT}</b><span>Infected destroyed</span></div><div><b>${s.unitsLost}</b><span>Units lost</span></div><div><b>${s.missions}</b><span>Missions done</span></div><div><b>${fmtPeople(s.ferried)}</b><span>Rescued by APC</span></div><div><b>${G.troopsHome}</b><span>Troops home</span></div><div><b>$${s.spent}</b><span>Spent</span></div></div>
      <p class="note">Where people died: ${fmtPeople(G.deaths.streets)} in the streets, ${fmtPeople(G.deaths.queues)} waiting at evacuation points, ${fmtPeople(G.deaths.homes)} in their homes${G.deaths.fire ? `, ${fmtPeople(G.deaths.fire)} under your own air strikes` : ''}${elsewhere > 0 ? `, ${fmtPeople(elsewhere)} on rooftops, in APCs and among the militia` : ''}.</p>
      ${G.ace ? `<p class="note">Unit of the night: <b>${esc(G.ace.name)}</b>${G.ace.rank ? ` ${'★'.repeat(G.ace.rank)}` : ''}, ${G.ace.kills} kills${G.units.some(u => u.name === G.ace.name) ? '' : ', lost in the fighting'}.</p>` : ''}
      <p class="note">Grades: 60% Saviour of the city, 45% An orderly withdrawal, 30% A bitter retreat.</p>
      <div class="btns"><button class="btn primary" data-act="again">Play again</button><a class="btn" href="../">The original game</a></div></div>`;
    }
    (_b = ov.querySelector('.btn.primary')) === null || _b === void 0 ? void 0 : _b.focus();
}
function syncMute() {
    const b = document.getElementById('mute');
    if (b) {
        b.textContent = AUD.muted ? '🔇' : '🔊';
        b.setAttribute('aria-label', AUD.muted ? 'Sound off' : 'Sound on');
    }
}
function updateAlert() {
    const el = $('#alert'), on = !!G.alert && G.t < G.alert.until;
    if (on && el.textContent !== G.alert.text)
        el.textContent = G.alert.text;
    el.hidden = !on;
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
    const apcs = UI.sel.filter(u => u.kind === 'apc');
    if (apcs.length && bi >= 0 && G.blocks[bi].pop > 0) {
        sendToBlock(apcs, G.blocks[bi]);
        toast(`APC heading to ${G.blocks[bi].name} to take people aboard.`);
        return;
    }
    if (UI.sel.length && e) {
        moveUnits(UI.sel, e.x, e.z);
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
        startAudio();
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
                startAudio();
                showOverlay('');
                break;
            case 'closehelp':
                showOverlay('');
                break;
            case 'help':
                showOverlay('help');
                break;
            case 'mute':
                setMuted(!AUD.muted);
                syncMute();
                break;
            case 'goto':
                Object.assign(V.cam, { x: Number(t.dataset.x), z: Number(t.dataset.z), dist: Math.min(V.cam.dist, 40) });
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
            case 'choose':
                decide(Number(t.dataset.i));
                break;
            case 'ability':
            case 'reinforce':
                if (performance.now() - UI.pressT > 700)
                    panelAct(t);
                break;
        }
    });
    // the unit panel can be rebuilt between press and release while a fight is on, so its buttons act on press
    $('#sel').addEventListener('pointerdown', e => {
        const t = e.target.closest('[data-act="ability"],[data-act="reinforce"]');
        if (!t || t.disabled || e.button !== 0)
            return;
        UI.pressT = performance.now();
        panelAct(t);
    });
    const held = new Set();
    document.addEventListener('keydown', e => {
        var _a, _b;
        if ((_b = (_a = e.target).matches) === null || _b === void 0 ? void 0 : _b.call(_a, 'input,textarea'))
            return;
        if (UI.overlay) {
            if (e.key === 'Escape' && UI.overlay === 'help')
                showOverlay('');
            if (UI.overlay === 'decide' && /^[1-9]$/.test(e.key))
                decide(Number(e.key) - 1);
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
        if (k === 'm') {
            setMuted(!AUD.muted);
            syncMute();
            return;
        }
        if (k === 'f') {
            useSelAbility();
            return;
        }
        if (k === 'r') {
            reinforceSel();
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
    for (const b of beacons.values())
        V.scene.remove(b);
    beacons.clear();
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
    syncMute();
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
            while (acc >= STEP && n < 16 && !G.decision) {
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
        else if (G.decision && !UI.overlay) {
            acc = 0;
            showOverlay('decide');
        }
        const place = UI.mode && UI.hover ? { x: UI.hover.x, z: UI.hover.z, r: PLACE_R[UI.mode], ok: G.funds >= ORDER_COST[UI.mode] } : null;
        drawFrame(G.t, gameDt, UI.sel, UI.block, place);
        playSfx(real);
        updateAlert();
        updateHud(now);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // hooks for automated tests
    window.City = {
        get G() { return G; }, tick, order, moveUnits, evacuateBlock, sendToBlock, UI, showOverlay, useAbility, reinforce, choose,
        reset(seed) { newGame(seed); resetView(); showOverlay(''); },
        look(x, z, dist) { Object.assign(V.cam, { x, z, dist }); },
    };
})();

})();
