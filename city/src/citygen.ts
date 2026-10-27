// Builds the city: a 9 x 7 grid of blocks between 2-cell roads, split into districts, with the River Calder
// running north to south through the east of the city (four bridges), a harbour quay and the sea along the
// south, an army base in the north-west corner, and a handful of landmarks. Also lays out the purely visual
// dressing the view draws: street trees, abandoned cars, and the outskirts beyond the map edge.

const BLOCKS_X = 9, BLOCKS_Z = 7;
/** The river: water in these columns, from the north edge to the sea, except where a bridge crosses. */
const RIVER_X0 = 55, RIVER_X1 = 58;
/** Rows bridged over the river: three road bridges, and a wide one carrying the last street and the quay. */
const BRIDGES: Array<[number, number]> = [[8, 9], [24, 25], [40, 41], [56, 59]];
const isRiverCol = (i: number) => i >= RIVER_X0 && i <= RIVER_X1;
const isBridgeRow = (j: number) => BRIDGES.some(([a, b]) => j >= a && j <= b);
/** How far the visual outskirts reach beyond the map edge (they are never walked on). */
const OUT = 60;
/** Gantry cranes along the quay (x of each), clear of the harbour berth and the river mouth. */
const CRANES = [13, 23, 49, 67];
/** Roads that run on out of town for good (others peter out): rows to the west and east, columns to the north. */
const OUT_ROADS = { west: [8, 32], east: [8, 24, 32], north: [16, 40] };
const MARKET_FOUNTAIN = [idx(20, 28), idx(21, 28), idx(20, 29), idx(21, 29)];
const MARKET_STALLS = [idx(19, 27), idx(22, 27), idx(19, 30), idx(22, 30)];
const POND = [idx(35, 28), idx(36, 28), idx(35, 29), idx(36, 29)];

const POP: Record<District, number> = { downtown: 1400, residential: 900, suburb: 380, industrial: 140, docks: 220, hospital: 650, park: 0, base: 0 };
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
const trees: Array<[number, number, number, number]> = [];
/** Abandoned cars: x, z, heading, colour. */
const cars: Array<[number, number, number, number]> = [];
/** Houses, farms and sheds beyond the map edge. */
const outskirts: Building[] = [];

function districtOf(bx: number, bz: number): District {
  if (bx === 0 && bz === 0) return 'base';
  if (bx === 7 && bz === 2) return 'hospital';
  if ((bx === 4 && bz === 3) || (bx === 1 && bz === 4) || (bx === 2 && bz === 3)) return 'park';
  if (bz === BLOCKS_Z - 1) return 'docks';
  if (bx >= 3 && bx <= 5 && bz >= 2 && bz <= 4) return 'downtown';
  if (bx >= 7) return 'industrial';
  if (bz === 0 || bx === 0) return 'suburb';
  return 'residential';
}

const LANDMARKS: Record<string, [Landmark, string]> = {
  '0,0': ['base', 'Fort Aldermoor'], '7,2': ['hospital', "St Brennan's Hospital"], '4,3': ['victory', 'Victory Park'],
  '1,4': ['millbrook', 'Millbrook Park'], '2,3': ['market', 'Market Square'], '3,3': ['cathedral', 'Calder Cathedral'],
  '0,3': ['station', 'Central Station'], '3,4': ['townhall', 'City Hall'], '5,0': ['stadium', 'Calder Park Stadium'],
};

function generateCity(rnd: () => number) {
  G.grid.fill(Cell.Road);
  G.blockAt.fill(-1);
  G.doorOf.fill(-1);
  trees.length = 0; cars.length = 0; outskirts.length = 0;
  for (let j = QUAY_Z; j < H; j++) for (let i = 0; i < W; i++) G.grid[idx(i, j)] = j >= SEA_Z ? Cell.Sea : Cell.Quay;
  // the river: open water except where the bridges cross
  for (let j = 0; j < SEA_Z; j++) for (let i = RIVER_X0; i <= RIVER_X1; i++) if (!isBridgeRow(j)) G.grid[idx(i, j)] = Cell.Sea;

  const names = NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [names[i], names[k]] = [names[k], names[i]]; }

  for (let bz = 0; bz < BLOCKS_Z; bz++) for (let bx = 0; bx < BLOCKS_X; bx++) {
    const district = districtOf(bx, bz), id = G.blocks.length, z0 = bz * 8 + 2, d = 6;
    // blocks beside the river lose the column it runs through
    let x0 = bx * 8 + 2, x1 = x0 + 6;
    if (x0 < RIVER_X0 && x1 > RIVER_X0) x1 = RIVER_X0;
    if (x0 <= RIVER_X1 && x1 > RIVER_X1 + 1) x0 = RIVER_X1 + 1;
    const w = x1 - x0;
    const popMax = Math.round(POP[district] * (0.8 + rnd() * 0.4) / PER_AGENT) * PER_AGENT;
    const lm = LANDMARKS[`${bx},${bz}`];
    const b: Block = {
      id, bx, bz, x0, z0, w, d, name: lm ? lm[1] : names[id % names.length], landmark: lm ? lm[0] : undefined, district,
      pop: popMax, popMax, evacuating: false, fallen: false, emitT: 0, doors: [], buildings: [], lastPanicCheck: 0, breach: 0, convertT: 0,
    };
    const open = district === 'park' || district === 'base';
    for (let j = z0; j < z0 + d; j++) for (let i = x0; i < x0 + w; i++) {
      // the market square is paved street; parks are grass; the fort is open ground
      G.grid[idx(i, j)] = b.landmark === 'market' ? Cell.Road : district === 'park' ? Cell.Park : district === 'base' ? Cell.Base : Cell.Building;
      G.blockAt[idx(i, j)] = id;
    }
    if (b.landmark === 'market') for (const c of MARKET_FOUNTAIN.concat(MARKET_STALLS)) G.grid[c] = Cell.Building;
    if (b.landmark === 'victory') for (const c of POND) G.grid[c] = Cell.Sea;
    if (!open) {
      for (const k of [2, 3]) for (const [i, j] of [[x0 - 1, z0 + k], [x0 + w, z0 + k], [x0 + k, z0 - 1], [x0 + k, z0 + d]]) {
        if (!inside(i, j)) continue;
        const c = idx(i, j);
        if (G.grid[c] === Cell.Road || G.grid[c] === Cell.Quay) { b.doors.push(c); G.doorOf[c] = id; }
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
const pick = <T>(rnd: () => number, a: T[]) => a[Math.floor(rnd() * a.length)];

/** Lay out the buildings inside a block's footprint. Layouts are drawn for 6 x 6 and squeezed to fit narrower blocks. */
function furnish(b: Block, rnd: () => number) {
  const { x0, z0 } = b, sx = b.w / 6;
  type Opt = { y?: number; ry?: number; roofH?: number };
  const add = (x: number, z: number, w: number, d: number, h: number, color: number, roof: number, kind: Building['kind'], o: Opt = {}) =>
    b.buildings.push({ x: x0 + x * sx, z: z0 + z, w: w * sx, d, h, color, roof, kind, ...o });
  const tree = (x: number, z: number, s: number, kind = 1) => trees.push([x0 + x * sx, z0 + z, s, kind]);
  /** Rooftop plant on a flat roof: air handlers and a water tank or two. */
  const plant = (x: number, z: number, w: number, d: number, h: number) => {
    const n = Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) add(x + (rnd() - 0.5) * w * 0.5, z + (rnd() - 0.5) * d * 0.5, 0.5, 0.4, 0.28, 0x8d9290, 0, 'box', { y: h });
    if (rnd() < 0.35) add(x + w * 0.25, z - d * 0.2, 0.45, 0.45, 0.5, 0x6b5a48, 0, 'chimney', { y: h });
  };
  const flat = (x: number, z: number, w: number, d: number, h: number, color: number, kind: 'flat' | 'tower' = 'flat') => {
    add(x, z, w, d, h, color, PAL.tar, kind); plant(x, z, w, d, h);
  };
  const resColor = () => pick(rnd, [PAL.brick, PAL.cream, PAL.sand, PAL.brick2, PAL.ochre]);

  switch (b.landmark) {
    case 'hospital': {
      // an H of white wards round a taller core, a red cross on the roof, ambulances at the door
      add(1.0, 3, 1.8, 5.6, 3.4, PAL.white, PAL.concrete, 'flat');
      add(5.0, 3, 1.8, 5.6, 3.4, PAL.white, PAL.concrete, 'flat');
      add(3, 3, 2.4, 2.4, 4.6, 0xdfe6e4, PAL.concrete, 'flat');
      add(3, 3, 1.8, 0.55, 0.06, 0xc4332f, 0, 'box', { y: 4.74 });
      add(3, 3, 0.55, 1.8, 0.06, 0xc4332f, 0, 'box', { y: 4.74 });
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
      for (const [x, z] of [[0.6, 0.6], [0.6, 5.4], [5.6, 0.6], [5.6, 5.4]]) tree(x, z, 0.75);
      return;
    }
    case 'station': {
      // platforms under long canopies, the tracks running out west, a booking hall and clock tower facing the city
      add(5.1, 3, 1.6, 5.6, 2.2, PAL.brick, PAL.roofGrey, 'house', { roofH: 0.9 });
      add(5.1, 3, 0.9, 0.9, 4.0, PAL.brick2, PAL.lead, 'flat');
      add(5.1, 3, 0.9, 0.9, 0.9, PAL.lead, 0, 'spire', { y: 4.0 });
      for (const z of [1.2, 3.0, 4.8]) {
        add(2.1, z, 4.2, 0.9, 0.12, 0x5d6b72, 0, 'box', { y: 1.15 });
        for (const x of [0.6, 2.1, 3.6]) add(x, z, 0.1, 0.1, 1.15, 0x3a3f42, 0, 'box');
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
      for (let k = 0; k < 6; k++) add(1.9 + k * 0.44, 4.15, 0.16, 0.16, 1.7, 0xeeeae0, 0, 'chimney');
      add(3, 4.15, 2.6, 0.5, 0.2, stone, 0, 'box', { y: 1.7 });
      add(3, 4.15, 2.6, 0.6, 0.35, stone, PAL.lead, 'house', { y: 1.9, roofH: 0.35 });
      for (const x of [2.2, 3.8]) tree(x, 5.4, 0.55);
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
      for (const [x, z] of [[0.4, 0.4], [5.6, 0.4], [0.4, 5.6], [5.6, 5.6]]) tree(x, z, 0.8);
      return;
    }
    case 'victory':
      for (let k = 0; k < 16; k++) {
        const x = 0.5 + rnd() * 5, z = 0.5 + rnd() * 5;
        if (Math.abs(x - 1.9) < 1.6 && Math.abs(z - 3) < 1.4) continue; // the pond
        tree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.5 ? 1 : 0);
      }
      add(4.6, 3, 0.5, 0.5, 0.35, 0xb8b09a, 0, 'box');
      add(4.6, 3, 0.22, 0.22, 2.2, 0xd8d2bf, 0, 'box', { y: 0.35 });
      return;
    case 'millbrook':
      for (let k = 0; k < 16; k++) tree(0.5 + rnd() * 5, 0.5 + rnd() * 5, 0.8 + rnd() * 0.6, rnd() < 0.6 ? 0 : 1);
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
      } else if (r < 0.55) {
        const h = 6 + rnd() * 6;
        flat(3, 1.6, 4.8, 2.4, h, pick(rnd, [PAL.glass, PAL.stone]), 'tower');
        flat(3, 4.5, 4.8, 2.2, h * (0.6 + rnd() * 0.5), pick(rnd, [PAL.slate, PAL.sand]), 'tower');
      } else if (r < 0.8) {
        // a podium with a slim tower on it
        const c = pick(rnd, [PAL.stone, PAL.sand, PAL.cream]);
        add(3, 3, 5.6, 5.6, 2.2, c, PAL.tar, 'flat');
        const h = 7 + rnd() * 8;
        add(3.4, 2.6, 3.0, 3.0, h, pick(rnd, [PAL.glass, PAL.glass2, PAL.slate]), PAL.tar, 'tower', { y: 2.2 });
        plant(3.4, 2.6, 3.0, 3.0, 2.2 + h);
        tree(1.0, 5.0, 0.6); tree(5.0, 5.0, 0.6);
      } else {
        // an L of offices round a corner plaza
        const h = 5 + rnd() * 5, c = pick(rnd, [PAL.stone, PAL.slate, PAL.sand]);
        flat(1.5, 3, 2.6, 5.6, h, c, 'tower');
        flat(4.4, 1.5, 3.0, 2.6, h * 0.75, c, 'tower');
        tree(4.0, 4.4, 0.7); tree(5.1, 5.1, 0.7);
      }
      break;
    }
    case 'residential': {
      const r = rnd();
      if (r < 0.3) {
        // a perimeter block round a courtyard
        const c = resColor(), h = 2.2 + rnd() * 1.8;
        flat(3, 0.85, 5.8, 1.6, h, c); flat(3, 5.15, 5.8, 1.6, h * (0.85 + rnd() * 0.3), c);
        flat(0.85, 3, 1.6, 2.6, h, c); flat(5.15, 3, 1.6, 2.6, h * (0.8 + rnd() * 0.3), c);
        tree(3, 3, 0.75);
      } else if (r < 0.5) {
        // two terraces of townhouses with back gardens between
        const c = resColor(), roof = pick(rnd, [PAL.roofRed, PAL.roofGrey, PAL.roofBrown]);
        for (const x of [1, 3, 5]) {
          add(x, 1.0, 1.9, 1.9, 1.4 + rnd() * 0.5, c, roof, 'house', { roofH: 0.6 });
          add(x, 5.0, 1.9, 1.9, 1.4 + rnd() * 0.5, c, roof, 'house', { roofH: 0.6 });
        }
        tree(1.5, 3, 0.65); tree(4.5, 3, 0.7);
      } else if (r < 0.7) {
        // an L-shaped block with a lower wing
        const c = resColor(), h = 2.8 + rnd() * 2;
        flat(1.4, 3, 2.6, 5.6, h, c); flat(4.4, 1.4, 3.0, 2.6, h * 0.8, c);
        flat(4.5, 4.6, 2.4, 2.4, 1.6 + rnd(), resColor());
        tree(3.6, 3.4, 0.55);
      } else {
        for (const [x, z] of [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]]) flat(x, z, 2.5, 2.5, 2.4 + rnd() * 2.2, resColor());
      }
      break;
    }
    case 'suburb':
      for (const [x, z] of [[1.4, 1.3], [4.6, 1.3], [1.4, 4.7], [4.6, 4.7], [3, 3]]) {
        if (x === 3 && rnd() < 0.5) { tree(x, z, 0.9 + rnd() * 0.4, rnd() < 0.5 ? 0 : 1); continue; }
        const turn = rnd() < 0.3;
        add(x, z, turn ? 1.7 : 2.0, turn ? 2.0 : 1.7, 1.0 + rnd() * 0.3, pick(rnd, [PAL.cream, PAL.sand, PAL.white, PAL.brick]), pick(rnd, [PAL.roofRed, PAL.roofGrey, PAL.roofBrown]), 'house');
      }
      tree(0.3, 3, 0.6); tree(5.7, 3, 0.6);
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
      } else if (r < 0.7) {
        // a works shed with a sawtooth roof and a tall chimney
        const c = pick(rnd, [PAL.concrete, PAL.rust, PAL.brick2]), h = 1.8 + rnd() * 0.6;
        for (const x of [1.2, 2.6, 4.0]) add(x, 2.6, 1.4, 4.4, h, c, PAL.roofGrey, 'shed', { roofH: 0.6 });
        add(5.3, 1.0, 0.55, 0.55, 5.5 + rnd() * 2, PAL.brick2, 0, 'chimney');
        add(5.0, 5.0, 1.4, 1.4, 1.5, PAL.tankPaint, PAL.concrete, 'tank');
      } else {
        add(2.4, 2.2, 4.2, 3.6, 2.2 + rnd() * 0.8, pick(rnd, [PAL.concrete, PAL.rust]), PAL.roofGrey, 'shed', { roofH: 0.5 });
        add(4.9, 4.9, 1.6, 1.6, 1.8, PAL.tankPaint, PAL.concrete, 'tank');
        if (rnd() < 0.6) add(1.6, 5.0, 1.4, 1.4, 1.5, PAL.tankPaint, PAL.concrete, 'tank');
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
        for (const x of [3.2, 4.0, 4.8]) add(x, 4.75, 0.5, 0.5, 0.5, pick(rnd, CONTAINERS), 0, 'box');
        break;
      }
      add(3, 1.6, 5.4, 2.4, 2.0, pick(rnd, [PAL.rust, PAL.concrete, PAL.brick2]), PAL.roofGrey, 'shed', { roofH: 0.55 });
      if (r < 0.7) {
        for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
          const n = 1 + Math.floor(rnd() * 3);
          for (let k = 0; k < n; k++) add(0.9 + col * 1.4, 4.0 + row * 1.0, 1.25, 0.6, 0.5, pick(rnd, CONTAINERS), 0, 'box', { y: k * 0.5 });
        }
      } else add(3, 4.5, 5.4, 2.2, 1.8, pick(rnd, [PAL.concrete, PAL.slate]), PAL.roofGrey, 'shed', { roofH: 0.45 });
      break;
    }
  }
}

/** Street trees along the boulevards, and abandoned cars on the roads: purely visual. */
function dressStreets(rnd: () => number) {
  const road = (i: number, j: number) => inside(i, j) && j < QUAY_Z && G.grid[idx(i, j)] === Cell.Road && G.blockAt[idx(i, j)] < 0;
  // plane trees on the pavements of the High Street (rows 32-33) and Kings Parade (columns 32-33)
  for (let t = 1; t < W - 1; t += 1.6) {
    for (const z of [32.22, 33.78]) {
      if (t % 8 < 2.4 || t % 8 > 7.6 || isRiverCol(Math.floor(t)) || isRiverCol(Math.floor(t + 0.6))) continue;
      trees.push([t, z, 0.55 + rnd() * 0.15, 1]);
    }
  }
  for (let t = 1; t < QUAY_Z - 1; t += 1.6) {
    for (const x of [32.22, 33.78]) {
      if (t % 8 < 2.4 || t % 8 > 7.6) continue;
      trees.push([x, t, 0.55 + rnd() * 0.15, 1]);
    }
  }
  const COLORS = [0x8a8f94, 0x3d5a78, 0x7a2f2a, 0xc9c4b4, 0x2f3a33, 0x5b4a3a, 0x9a8a5a, 0x4a5258];
  for (let j = 0; j < QUAY_Z; j++) for (let i = 0; i < W; i++) {
    if (!road(i, j) || rnd() > 0.05) continue;
    const vert = i % 8 < 2, horiz = j % 8 < 2;
    if (vert === horiz) continue; // keep the junctions clear
    if (i < 10 && j < 10) continue; // the fort's gate
    const burnt = rnd() < 0.25, color = burnt ? 0x2b2725 : pick(rnd, COLORS);
    const crash = rnd() < 0.3, side = (vert ? i % 8 : j % 8) === 0 ? 0.68 : 1.32;
    const along = (vert ? j : i) + 0.2 + rnd() * 0.6;
    let x = vert ? i - (i % 8) + side : along, z = vert ? along : j - (j % 8) + side;
    let hd = (vert ? 0 : Math.PI / 2) + (rnd() < 0.5 ? 0 : Math.PI);
    if (crash) { hd += (rnd() - 0.5) * 1.6; x += vert ? (rnd() - 0.5) * 0.4 : 0; z += vert ? 0 : (rnd() - 0.5) * 0.4; }
    cars.push([x, z, hd, color]);
  }
}

/**
 * The outskirts beyond the map: suburbs thinning into farmland to the north, west and east, along the city's
 * own streets carried on out of town. Nothing here is ever walked on; it is scenery.
 */
function buildOutskirts(rnd: () => number) {
  const roofs = [PAL.roofRed, PAL.roofGrey, PAL.roofBrown], walls = [PAL.cream, PAL.sand, PAL.white, PAL.brick, PAL.ochre];
  for (let z = -OUT + 2; z < SEA_Z - 2; z += 3) for (let x = -OUT + 2; x < W + OUT - 2; x += 3) {
    const cx = x + 1.5, cz = z + 1.5;
    // distance from the city edge
    const d = Math.max(-cx, cx - W, -cz, 0);
    if (d < 3) continue;
    if (cz < 0 && cx > RIVER_X0 - 3 && cx < RIVER_X1 + 4) continue; // the river
    if (cx < 0 && cz > 26 && cz < 32) continue; // the railway
    // the main roads out of town
    if (cx < 0 && OUT_ROADS.west.some(j => Math.abs(cz - j - 1) < 2.6)) continue;
    if (cx > W && OUT_ROADS.east.some(j => Math.abs(cz - j - 1) < 2.6)) continue;
    if (cz < 0 && OUT_ROADS.north.some(i => Math.abs(cx - i - 1) < 2.6)) continue;
    // the city's streets carry on outwards
    const onRoad = (cx < 0 || cx > W) ? ((cz % 8) + 8) % 8 < 2.6 && cz > 0 : ((cx % 8) + 8) % 8 < 2.6;
    if (onRoad && d < 26) continue;
    const p = 0.8 * Math.exp(-d / 13);
    const r = rnd();
    if (r < p) {
      const turn = rnd() < 0.5, w = 1.5 + rnd() * 0.5, dd = 1.3 + rnd() * 0.4;
      outskirts.push({ x: cx + (rnd() - 0.5) * 0.6, z: cz + (rnd() - 0.5) * 0.6, w: turn ? dd : w, d: turn ? w : dd, h: 0.9 + rnd() * 0.4, color: pick(rnd, walls), roof: pick(rnd, roofs), kind: 'house' });
      if (rnd() < 0.5) trees.push([cx + (rnd() < 0.5 ? -1.2 : 1.2), cz + (rnd() - 0.5) * 2, 0.6 + rnd() * 0.4, rnd() < 0.5 ? 0 : 1]);
    } else if (r < p + 0.12 + d * 0.004) {
      // woods and hedgerow trees, more of them further out
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) trees.push([cx + (rnd() - 0.5) * 2.6, cz + (rnd() - 0.5) * 2.6, 0.8 + rnd() * 0.7, rnd() < 0.6 ? 0 : 1]);
    } else if (d > 20 && rnd() < 0.025) {
      // a farm: a barn and a silo
      outskirts.push({ x: cx, z: cz, w: 2.2, d: 1.4, h: 1.2, color: 0x8a3a30, roof: PAL.roofGrey, kind: 'shed', roofH: 0.7 });
      outskirts.push({ x: cx + 1.6, z: cz, w: 0.8, d: 0.8, h: 2.4, color: 0xb3ad9c, roof: 0, kind: 'tank' });
    }
  }
  // the jam on the road east, where the horde comes from
  const COLORS = [0x8a8f94, 0x3d5a78, 0x7a2f2a, 0xc9c4b4, 0x2f3a33, 0x5b4a3a];
  for (let x = W + 1; x < W + 40; x += 0.9 + rnd() * 1.4) {
    if (rnd() < 0.25) continue;
    cars.push([x, 32.5 + (rnd() < 0.5 ? 0 : 1) + (rnd() - 0.5) * 0.3, Math.PI / 2 + (rnd() - 0.5) * 0.5, rnd() < 0.3 ? 0x2b2725 : pick(rnd, COLORS)]);
  }
}
