// Builds the city: a 9 x 7 grid of blocks between 2-cell roads, split into districts,
// with a harbour quay and the sea along the south and an army base in the north-west corner.

const BLOCKS_X = 9, BLOCKS_Z = 7;
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
const trees: Array<[number, number, number]> = []; // x, z, scale

function districtOf(bx: number, bz: number): District {
  if (bx === 0 && bz === 0) return 'base';
  if (bx === 7 && bz === 2) return 'hospital';
  if ((bx === 4 && bz === 3) || (bx === 1 && bz === 4)) return 'park';
  if (bz === BLOCKS_Z - 1) return 'docks';
  if (bx >= 3 && bx <= 5 && bz >= 2 && bz <= 4) return 'downtown';
  if (bx >= 7) return 'industrial';
  if (bz === 0 || bx === 0) return 'suburb';
  return 'residential';
}

function generateCity(rnd: () => number) {
  G.grid.fill(Cell.Road);
  G.blockAt.fill(-1);
  G.doorOf.fill(-1);
  trees.length = 0;
  for (let j = QUAY_Z; j < H; j++) for (let i = 0; i < W; i++) G.grid[idx(i, j)] = j >= SEA_Z ? Cell.Sea : Cell.Quay;

  const names = NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [names[i], names[k]] = [names[k], names[i]]; }

  for (let bz = 0; bz < BLOCKS_Z; bz++) for (let bx = 0; bx < BLOCKS_X; bx++) {
    const district = districtOf(bx, bz), x0 = bx * 8 + 2, z0 = bz * 8 + 2, id = G.blocks.length;
    const popMax = Math.round(POP[district] * (0.8 + rnd() * 0.4) / PER_AGENT) * PER_AGENT;
    const name = district === 'base' ? 'Fort Aldermoor' : district === 'hospital' ? "St Brennan's Hospital" : district === 'park' ? (bx === 4 ? 'Victory Park' : 'Millbrook Park') : names[id % names.length];
    const b: Block = { id, bx, bz, x0, z0, name, district, pop: popMax, popMax, evacuating: false, fallen: false, emitT: 0, doors: [], buildings: [], lastPanicCheck: 0, breach: 0, convertT: 0 };
    const open = district === 'park' || district === 'base';
    for (let j = z0; j < z0 + 6; j++) for (let i = x0; i < x0 + 6; i++) {
      G.grid[idx(i, j)] = district === 'park' ? Cell.Park : district === 'base' ? Cell.Base : Cell.Building;
      G.blockAt[idx(i, j)] = id;
    }
    if (!open) {
      for (const k of [2, 3]) for (const [i, j] of [[x0 - 1, z0 + k], [x0 + 6, z0 + k], [x0 + k, z0 - 1], [x0 + k, z0 + 6]]) {
        if (!inside(i, j)) continue;
        const c = idx(i, j);
        if (G.grid[c] === Cell.Road || G.grid[c] === Cell.Quay) { b.doors.push(c); G.doorOf[c] = id; }
      }
    }
    furnish(b, rnd);
    G.blocks.push(b);
  }
  G.hq = idx(5, 5);
}

const PAL = {
  stone: 0xc9c1ab, sand: 0xd8cbb0, cream: 0xe4dfcf, brick: 0xa0644a, brick2: 0x8a5a44, slate: 0x7d8790, glass: 0x8fa3ad,
  concrete: 0xa9a59a, tankPaint: 0xb3ad9c, rust: 0x9a6b4a, white: 0xeeeae0, roofRed: 0x8a4b3a, roofGrey: 0x5d6b72, roofBrown: 0x6e5a48, tar: 0x4a4a46,
};
const pick = <T>(rnd: () => number, a: T[]) => a[Math.floor(rnd() * a.length)];

/** Lay out the buildings inside a block's 6x6 footprint. */
function furnish(b: Block, rnd: () => number) {
  const { x0, z0 } = b, add = (x: number, z: number, w: number, d: number, h: number, color: number, roof: number, kind: Building['kind']) =>
    b.buildings.push({ x: x0 + x, z: z0 + z, w, d, h, color, roof, kind });
  switch (b.district) {
    case 'downtown':
      if (rnd() < 0.5) add(3, 3, 4.8, 4.8, 9 + rnd() * 7, pick(rnd, [PAL.glass, PAL.stone, PAL.slate]), PAL.tar, 'tower');
      else { const h = 6 + rnd() * 6; add(3, 1.6, 4.8, 2.4, h, pick(rnd, [PAL.glass, PAL.stone]), PAL.tar, 'tower'); add(3, 4.5, 4.8, 2.2, h * (0.6 + rnd() * 0.5), pick(rnd, [PAL.slate, PAL.sand]), PAL.tar, 'tower'); }
      break;
    case 'residential':
      for (const [x, z] of [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]]) add(x, z, 2.5, 2.5, 2.4 + rnd() * 2.2, pick(rnd, [PAL.brick, PAL.cream, PAL.sand, PAL.brick2]), PAL.tar, 'flat');
      break;
    case 'suburb':
      for (const [x, z] of [[1.4, 1.3], [4.6, 1.3], [1.4, 4.7], [4.6, 4.7], [3, 3]]) {
        if (x === 3 && rnd() < 0.5) { trees.push([x0 + x, z0 + z, 0.9 + rnd() * 0.4]); continue; }
        add(x, z, 2.0, 1.7, 1.1, pick(rnd, [PAL.cream, PAL.sand, PAL.white, PAL.brick]), pick(rnd, [PAL.roofRed, PAL.roofGrey, PAL.roofBrown]), 'house');
      }
      break;
    case 'industrial':
      add(2.4, 2.2, 4.2, 3.6, 2.2 + rnd() * 0.8, pick(rnd, [PAL.concrete, PAL.rust]), PAL.roofGrey, 'shed');
      add(4.9, 4.9, 1.6, 1.6, 1.8, PAL.tankPaint, PAL.concrete, 'tank');
      if (rnd() < 0.6) add(1.6, 5.0, 1.4, 1.4, 1.5, PAL.tankPaint, PAL.concrete, 'tank');
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
      for (let k = 0; k < 14; k++) trees.push([x0 + 0.5 + rnd() * 5, z0 + 0.5 + rnd() * 5, 0.8 + rnd() * 0.6]);
      break;
    case 'base':
      add(1.2, 1.0, 2.2, 1.2, 1.0, 0x8c8456, 0x55633a, 'house');
      add(4.6, 1.0, 2.2, 1.2, 1.0, 0x8c8456, 0x55633a, 'house');
      break;
  }
}
