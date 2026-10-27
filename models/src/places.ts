// One low-poly diorama per place type, on an octagonal slab about 10 units across.
// Builders lay out buildings and roads, and record open "yards" where people can stand.

const GROUND = {
  full: new THREE.CylinderGeometry(5, 5.3, 0.5, 8).translate(0, -0.25, 0),
  // ports: land on the -z half, harbour water on the +z half (the quay runs along z = 0)
  land: new THREE.CylinderGeometry(5, 5.3, 0.5, 8, 1, false, Math.PI / 2, Math.PI).translate(0, -0.25, 0),
  seabed: new THREE.CylinderGeometry(5, 5.3, 0.2, 8, 1, false, -Math.PI / 2, Math.PI).translate(0, -0.6, 0),
  sea: new THREE.CylinderGeometry(4.98, 4.98, 0.02, 8, 1, false, -Math.PI / 2, Math.PI).translate(0, -0.32, 0),
};

function ground(c: Ctx, color: number) {
  const m = new THREE.Mesh(c.spec.type === 'port' ? GROUND.land : GROUND.full, mat(c.burnt ? 0x8d8574 : color));
  m.receiveShadow = true;
  c.root.add(m);
  if (c.spec.type === 'port') {
    c.root.add(new THREE.Mesh(GROUND.seabed, mat(0x46585c)));
    const sea = new THREE.Mesh(GROUND.sea, mat(COL.water, { opacity: 0.85 }));
    sea.receiveShadow = true;
    c.root.add(sea);
  }
}

/** Railway: ballast, sleepers and two rails from (x1,z1) to (x2,z2). */
function track(c: Ctx, x1: number, z1: number, x2: number, z2: number) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
  const g = new THREE.Group();
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = ry;
  c.root.add(g);
  box(g, mat(0x8a8478), len, 0.03, 0.62).castShadow = false;
  for (let s = -len / 2 + 0.15; s < len / 2; s += 0.3) box(g, mat(c.burnt ? COL.char : COL.sleeper), 0.09, 0.04, 0.56, s, 0.03, 0);
  for (const side of [-0.18, 0.18]) box(g, mat(COL.rail), len, 0.05, 0.05, 0, 0.07, side);
}

function road(c: Ctx, x1: number, z1: number, x2: number, z2: number, w = 0.6) {
  const dx = x2 - x1, dz = z2 - z1;
  strip(c, c.burnt ? 0x5e5546 : COL.road, Math.hypot(dx, dz), w, (x1 + x2) / 2, (z1 + z2) / 2, Math.atan2(-dz, dx));
}

/** Trees scattered round the rim, clear of the given keep-out test. */
function treeRing(c: Ctx, n: number, r0 = 3.6, r1 = 4.6, clear: (x: number, z: number) => boolean = () => true) {
  for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
    const a = c.rnd() * Math.PI * 2, r = r0 + c.rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clear(x, z)) continue;
    tree(c, x, z, 0.8 + c.rnd() * 0.5);
    i++;
  }
}

function church(c: Ctx, x: number, z: number, ry: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = ry; c.root.add(g);
  box(g, wallMat(c, COL.stone), 1.5, 0.75, 0.8);
  part(g, GEO.gable, roofMat(c, COL.roof2), 0.92, 0.5, 1.6, 0, 0.75, 0, Math.PI / 2);
  box(g, wallMat(c, COL.stone), 0.5, 1.5, 0.5, -0.95, 0, 0);
  if (!c.burnt) part(g, GEO.cone4, roofMat(c, COL.roof2), 0.5, 0.9, 0.5, -0.95, 1.5, 0);
  if (c.lit) box(g, mat(COL.glow, { glow: COL.glow }), 0.2, 0.32, 0.02, -0.95, 1.05, 0.26);
}

const BUILD: Record<PlaceType, (c: Ctx) => void> = {
  town(c) {
    ground(c, COL.grass);
    road(c, -5, 0.2, 5, 0.2); road(c, 0.6, -5, 0.6, 5, 0.5);
    church(c, -1.6, -1.5, 0);
    const lots: Array<[number, number, number]> = [
      [-3.2, 1.4, 0], [-2.0, 1.4, 0], [-0.8, 1.5, 0.1], [1.9, 1.3, 0], [3.1, 1.2, -0.1],
      [2.0, -1.0, 0], [3.2, -1.1, 0.1], [-0.6, -2.9, Math.PI / 2], [2.0, -2.5, 0], [-3.2, -0.9, 0.2],
      [1.8, 2.8, 0.1], [-1.9, 2.9, -0.1],
    ];
    const walls = [COL.wall1, COL.wall2, COL.wall3, COL.brick], roofs = [COL.roof1, COL.roof3, COL.roof2];
    for (const [x, z, r] of lots) house(c, x, z, r, 0.8 + c.rnd() * 0.3, 0.65, 0.5 + c.rnd() * 0.25, walls[Math.floor(c.rnd() * 4)], roofs[Math.floor(c.rnd() * 3)]);
    c.yards.push([0.6, 0.2], [-1.2, 0.2], [2.5, 0.2], [0.6, -1.5], [0.6, 1.8], [-0.3, -0.6]);
    treeRing(c, 9, 3.7, 4.6, (x, z) => Math.abs(z - 0.2) > 0.7 && Math.abs(x - 0.6) > 0.6);
  },

  city(c) {
    ground(c, 0xa9a28c);
    for (const v of [-1.5, 1.5]) { road(c, -5, v, 5, v, 0.7); road(c, v, -5, v, 5, 0.7); }
    const cells = [-3.1, 0, 3.1];
    for (const gx of cells) for (const gz of cells) {
      if (Math.hypot(gx, gz) > 4.3) continue;
      const tall = gx === 0 && gz === 0;
      const n = tall ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const w = tall ? 1.4 : 0.9 + c.rnd() * 0.4, d = tall ? 1.4 : 0.9 + c.rnd() * 0.3;
        const h = tall ? 3.6 : 1 + c.rnd() * 2.2;
        const ox = n === 1 ? 0 : (i ? 0.55 : -0.55), oz = n === 1 ? 0 : (c.rnd() - 0.5) * 0.6;
        block(c, gx + ox, gz + oz, 0, n === 1 ? w : 0.95, d, h, [COL.wall2, COL.wall3, COL.stone, COL.brick][Math.floor(c.rnd() * 4)]);
      }
    }
    if (!c.burnt) { // a radio mast on the tallest tower
      box(c.root, mat(COL.steel), 0.06, 0.9, 0.06, 0, 3.6, 0);
      box(c.root, mat(COL.blood, { glow: c.spec.night ? COL.blood : undefined }), 0.12, 0.12, 0.12, 0, 4.5, 0);
    }
    c.yards.push([-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5], [0, 1.5], [0, -1.5], [-1.5, 0], [1.5, 0]);
  },

  capital(c) {
    ground(c, 0xb9b39b);
    strip(c, 0xd6d0bc, 3.4, 2.0, 0, 1.6); // the square in front of parliament
    road(c, -5, 2.9, 5, 2.9, 0.7); road(c, -2.6, -5, -2.6, 5, 0.6); road(c, 2.6, -5, 2.6, 5, 0.6);
    // parliament: a long hall, a columned portico and a green dome
    const g = new THREE.Group(); c.root.add(g); g.position.set(0, 0, -0.9);
    box(g, wallMat(c, COL.stone), 3.2, 0.9, 1.5);
    box(g, wallMat(c, COL.wall1), 3.35, 0.12, 1.65, 0, 0.9, 0);
    for (let i = 0; i < 6; i++) part(g, GEO.cyl, wallMat(c, COL.white), 0.14, 0.75, 0.14, -0.9 + i * 0.36, 0, 0.92);
    box(g, wallMat(c, COL.wall1), 2.2, 0.14, 0.42, 0, 0.75, 0.92);
    part(g, GEO.gable, roofMat(c, COL.wall1), 0.42, 0.3, 2.2, 0, 0.89, 0.92, Math.PI / 2);
    part(g, GEO.cyl, wallMat(c, COL.stone), 1.1, 0.45, 1.1, 0, 1.02, 0);
    if (!c.burnt) {
      part(g, GEO.dome, mat(COL.dome), 1.2, 1.1, 1.2, 0, 1.47, 0);
      box(g, mat(COL.steel), 0.04, 0.9, 0.04, 0, 2.0, 0);
      const flag = box(g, mat(COL.troop), 0.42, 0.24, 0.02, 0.23, 2.62, 0);
      c.ticks.push(t => { flag.rotation.y = Math.sin(t * 2.2) * 0.25; });
    }
    windows(c, g, 3.2, 0.9, 1.5, 2);
    for (const [x, z, w, d, h] of [[-3.7, -0.8, 1, 1.4, 1.6], [3.7, -0.8, 1, 1.4, 1.9], [-3.6, 1.3, 1.1, 1, 1.2], [3.6, 1.3, 1.1, 1, 1.4],
                                   [-1.2, -3.3, 1.3, 0.9, 1.3], [1.3, -3.3, 1.3, 0.9, 1.1], [-1.3, 3.9, 1.2, 0.7, 0.9], [1.3, 3.9, 1.2, 0.7, 1.0]] as const)
      block(c, x, z, 0, w, d, h, c.rnd() < 0.5 ? COL.wall2 : COL.wall3);
    c.yards.push([-1, 1.4], [1, 1.4], [0, 2.2], [-2.6, 0.3], [2.6, 0.3], [0, 2.9]);
    treeRing(c, 5, 3.9, 4.5, (x, z) => Math.abs(x) < 2.2 && z < 0);
  },

  port(c) {
    ground(c, COL.grass);
    box(c.root, mat(c.burnt ? 0x5e5a52 : COL.quay), 8.4, 0.6, 1.3, 0, -0.6, 0.65); // the quay wall
    for (let x = -3.6; x <= 3.7; x += 1.2) part(c.root, GEO.cyl6, mat(COL.char2), 0.12, 0.12, 0.12, x, 0, 1.2); // bollards
    road(c, -5, -0.6, 5, -0.6, 0.5);
    // a cargo crane on the quay
    const cr = new THREE.Group(); cr.position.set(2.6, 0, 0.35); c.root.add(cr);
    for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) box(cr, mat(c.burnt ? COL.char : COL.amber), 0.08, 1.4, 0.08, x, 0, z);
    box(cr, mat(c.burnt ? COL.char : COL.amber), 0.8, 0.4, 0.7, 0, 1.4, 0);
    box(cr, mat(c.burnt ? COL.char : COL.amber), 0.14, 0.14, 2.6, 0, 1.75, 1.0); // jib over the water
    if (!c.burnt) c.ticks.push(t => { cr.rotation.y = Math.sin(t * 0.3) * 0.4; });
    // sheds and the harbour town behind
    for (const x of [-3.2, -1.6]) {
      const g = new THREE.Group(); g.position.set(x, 0, -1.6); c.root.add(g);
      box(g, wallMat(c, COL.wall3), 1.4, 0.55, 1.0);
      part(g, GEO.vault, roofMat(c, COL.roof2), 1.0, 0.5, 1.4, 0, 0.55, 0, Math.PI / 2);
    }
    for (const [x, z] of [[0.6, -1.6], [1.7, -1.7], [3.0, -1.7], [-0.5, -3.0], [0.8, -3.1], [2.1, -3.0], [-2.4, -3.2]])
      house(c, x, z, c.rnd() * 0.2 - 0.1, 0.85, 0.65, 0.55 + c.rnd() * 0.3, c.rnd() < 0.5 ? COL.wall1 : COL.wall2, c.rnd() < 0.5 ? COL.roof1 : COL.roof2);
    // a lighthouse at the harbour mouth
    const lh = new THREE.Group(); lh.position.set(-4.0, 0, 0.6); c.root.add(lh);
    part(lh, GEO.cyl, wallMat(c, COL.white), 0.4, 1.6, 0.4);
    part(lh, GEO.cyl, mat(COL.blood), 0.42, 0.25, 0.42, 0, 0.7);
    part(lh, GEO.cyl, mat(c.spec.night && !c.burnt ? COL.glow : COL.window, { glow: c.spec.night && !c.burnt ? COL.glow : undefined }), 0.3, 0.25, 0.3, 0, 1.6);
    part(lh, GEO.cone6, roofMat(c, COL.roof2), 0.45, 0.3, 0.45, 0, 1.85);
    ship(c);
    c.yards.push([-2.2, 0.55], [-1, 0.55], [0.2, 0.55], [1.4, 0.55], [-0.4, -0.6], [1.2, -0.6]);
    treeRing(c, 5, 3.9, 4.6, (x, z) => z < -2.2 && Math.abs(x) > 2.8);
  },

  base(c) {
    ground(c, 0x9a9a72);
    strip(c, 0xb3ab8e, 3.2, 2.2, 0.3, 0.7); // parade ground
    road(c, -5, 2.4, 0.3, 2.4, 0.6); road(c, 0.3, 2.4, 0.3, 5, 0.6);
    // perimeter fence with a gate on the south side
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * 4.3, z = Math.sin(a) * 4.3;
      if (Math.abs(x - 0.3) < 0.6 && z > 0) continue;
      box(c.root, mat(COL.steel), 0.05, 0.45, 0.05, x, 0, z);
      if (i % 2 === 0) box(c.root, mat(COL.steel), 0.68, 0.03, 0.02, x, 0.38, z, -a + Math.PI / 2);
    }
    for (const z of [-2.6, -1.4]) {
      const g = new THREE.Group(); g.position.set(-0.4, 0, z); c.root.add(g);
      box(g, wallMat(c, COL.khaki), 3.4, 0.5, 0.8);
      part(g, GEO.gable, roofMat(c, COL.olive), 0.9, 0.3, 3.5, 0, 0.5, 0, Math.PI / 2);
      windows(c, g, 3.4, 0.5, 0.8, 1);
    }
    block(c, 2.8, -1.5, 0, 1.2, 1.0, 0.9, COL.wall2); // headquarters
    // watchtower by the gate
    const t = new THREE.Group(); t.position.set(-1.0, 0, 3.4); c.root.add(t);
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) box(t, mat(COL.trunk), 0.07, 1.4, 0.07, x, 0, z);
    box(t, wallMat(c, COL.trunk), 0.7, 0.35, 0.7, 0, 1.4, 0);
    part(t, GEO.cone4, roofMat(c, COL.olive), 0.9, 0.3, 0.9, 0, 1.75, 0);
    if (c.spec.night && !c.burnt) { // searchlight sweeping the wire
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3, 12, 1, true).translate(0, -1.5, 0).rotateX(-Math.PI / 2), mat(0xfff3c8, { glow: 0xfff3c8, opacity: 0.18 }));
      beam.position.set(0, 1.6, 0); t.add(beam);
      c.ticks.push(tt => { beam.rotation.y = Math.sin(tt * 0.6) * 1.2; beam.rotation.x = 0.35; });
    }
    box(c.root, mat(COL.steel), 0.04, 1.6, 0.04, 1.9, 0, 0.7);
    const flag = box(c.root, mat(COL.troop), 0.42, 0.26, 0.02, 2.12, 1.32, 0.7);
    c.ticks.push(tt => { flag.rotation.y = Math.sin(tt * 2) * 0.3; });
    for (const x of [2.6, 3.3]) vehicle(c, x, 1.6, Math.PI / 2, 'truck');
    c.yards.push([0.3, 0.7], [-0.6, 0.4], [1.0, 1.2], [-0.4, 1.3], [0.9, 0.2]);
    treeRing(c, 6, 4.5, 4.9);
  },

  depot(c) {
    ground(c, 0xa59f86);
    track(c, -5, 2.6, 5, 2.6);
    road(c, -5, 0.6, 5, 0.6, 0.6);
    for (const [x, z] of [[-1.9, -1.2], [0.7, -1.2]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); c.root.add(g);
      box(g, wallMat(c, COL.wall3), 2.2, 0.6, 1.4);
      part(g, GEO.vault, roofMat(c, COL.roof2), 1.4, 0.8, 2.2, 0, 0.6, 0, Math.PI / 2);
      box(g, mat(COL.window), 0.7, 0.5, 0.02, 0, 0, 0.71);
    }
    for (const [x, z] of [[2.9, -1.9], [3.6, -0.7], [2.6, -3.0]]) { // fuel tanks
      part(c.root, GEO.cyl, wallMat(c, COL.white), 1.0, 0.9, 1.0, x, 0, z);
      part(c.root, GEO.dome, roofMat(c, COL.steel), 1.0, 0.25, 1.0, x, 0.9, z);
    }
    for (let i = 0; i < 7; i++) { // stacks of crates
      const x = -3.4 + (i % 4) * 0.45, z = 1.5 + Math.floor(i / 4) * 0.45;
      box(c.root, wallMat(c, COL.trunk), 0.4, 0.35, 0.4, x, 0, z);
      if (c.rnd() < 0.5) box(c.root, wallMat(c, COL.khaki), 0.38, 0.33, 0.38, x, 0.35, z);
    }
    vehicle(c, 1.4, 1.5, 0, 'truck');
    if (!c.burnt) wagons(c, -1.5, 2.6, 3);
    c.yards.push([-0.6, 0.6], [1.4, 0.6], [-2.6, 0.6], [0.4, 1.6], [-0.6, -2.6]);
    treeRing(c, 5, 3.9, 4.6, (x, z) => z < -2.2 && x < 1.6);
  },

  hospital(c) {
    ground(c, COL.grass);
    road(c, -5, 1.9, 5, 1.9, 0.6);
    strip(c, 0xc8c2ae, 1.2, 1.2, 0, 1.0);
    // an H-shaped hospital: a central wing and two side wings
    block(c, 0, -1.0, 0, 2.6, 1.0, 1.3, COL.wall1);
    block(c, -1.7, -1.0, 0, 0.9, 2.4, 1.6, COL.wall1);
    block(c, 1.7, -1.0, 0, 0.9, 2.4, 1.6, COL.wall1);
    box(c.root, mat(COL.white), 1.0, 0.08, 0.6, 0, 0.55, -0.25); // entrance canopy
    // a green first-aid cross on the front
    if (!c.burnt) {
      const sm = mat(0x3f8f5a, { glow: c.spec.night ? 0x2f7f4a : undefined });
      box(c.root, sm, 0.42, 0.13, 0.03, 0, 1.0, -0.48); box(c.root, sm, 0.13, 0.42, 0.03, 0, 0.855, -0.48);
    }
    // helipad
    part(c.root, GEO.cyl, mat(0x4b4f50), 1.7, 0.03, 1.7, 2.9, 0, 2.9).castShadow = false;
    const hm = mat(COL.white);
    box(c.root, hm, 0.1, 0.04, 0.7, 2.65, 0.02, 2.9); box(c.root, hm, 0.1, 0.04, 0.7, 3.15, 0.02, 2.9); box(c.root, hm, 0.5, 0.04, 0.1, 2.9, 0.02, 2.9);
    // field tents for the overflow
    for (const [x, z] of [[-3.0, 2.9], [-1.8, 3.2], [-3.4, 1.0]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = 0.2; c.root.add(g);
      part(g, GEO.gable, roofMat(c, COL.khaki), 1.0, 0.6, 1.2);
      box(g, mat(COL.char2), 0.3, 0.3, 0.02, 0, 0, 0.6); // the open flap
    }
    vehicle(c, 0.9, 1.3, Math.PI / 2, 'ambulance');
    vehicle(c, -0.9, 1.3, Math.PI / 2, 'ambulance');
    c.yards.push([0, 1.0], [-2.3, 2.0], [0.5, 2.6], [-1.2, 1.0], [1.4, 0.5]);
    treeRing(c, 7, 3.8, 4.6, (x, z) => z < 1.3 || x > 4);
  },

  farm(c) {
    ground(c, COL.grass);
    // strip fields on the north half
    for (let i = 0; i < 7; i++) strip(c, i % 2 ? COL.field1 : COL.field2, 0.95, 3.4 - Math.abs(i - 3) * 0.35, -3.0 + i * 1.0, -1.6 + Math.abs(i - 3) * 0.17, 0, 0.01);
    road(c, -5, 0.8, 5, 0.8, 0.5);
    const barn = new THREE.Group(); barn.position.set(-1.6, 0, 2.3); c.root.add(barn);
    box(barn, wallMat(c, COL.brick), 2.0, 0.9, 1.3);
    part(barn, GEO.gable, roofMat(c, COL.roof2), 1.45, 0.7, 2.1, 0, 0.9, 0, Math.PI / 2);
    box(barn, mat(COL.char2), 0.6, 0.65, 0.02, 0, 0, 0.66);
    part(c.root, GEO.cyl, wallMat(c, COL.stone), 0.8, 1.8, 0.8, 0.2, 0, 2.8);
    if (!c.burnt) part(c.root, GEO.dome, mat(COL.steel), 0.8, 0.5, 0.8, 0.2, 1.8, 2.8);
    house(c, 2.0, 2.4, 0, 1.3, 0.9, 0.75, COL.wall1, COL.roof1);
    for (const [x, z] of [[1.0, 1.4], [1.4, 1.5], [3.4, 1.3]]) { // hay bales
      const b = part(c.root, GEO.cyl, mat(c.burnt ? COL.char : 0xc9b46a), 0.38, 0.4, 0.38, x, 0.19, z);
      b.rotation.z = Math.PI / 2; b.position.y = 0.19; b.position.x += 0.2;
    }
    for (let i = 0; i < 18; i++) box(c.root, mat(COL.trunk), 0.05, 0.3, 0.05, -4 + i * 0.45, 0, 0.35); // fence
    box(c.root, mat(COL.trunk), 8, 0.04, 0.03, -0.2, 0.22, 0.35);
    vehicle(c, -3.2, 1.8, 0.4, 'tractor');
    c.yards.push([0.4, 1.6], [-0.4, 1.4], [2.6, 1.5], [-2.8, 0.8], [0.6, 0.8]);
    treeRing(c, 6, 3.9, 4.6, (x, z) => z > 1.6);
  },

  junction(c) {
    ground(c, 0xa7a17f);
    track(c, -5, -0.4, 5, -0.4);
    track(c, -3.6, 3.6, 3.6, -3.6);
    // station building and a covered platform beside the main line
    strip(c, 0xc4bca4, 4.0, 0.7, -0.4, 0.45, 0, 0.04);
    box(c.root, mat(COL.stone), 4.0, 0.12, 0.7, -0.4, 0, 0.45);
    for (let i = 0; i < 5; i++) box(c.root, mat(COL.char2), 0.06, 0.65, 0.06, -2.2 + i * 0.9, 0.12, 0.6);
    box(c.root, roofMat(c, COL.roof2), 4.0, 0.06, 0.8, -0.4, 0.78, 0.45);
    const st = new THREE.Group(); st.position.set(-0.6, 0, 1.6); c.root.add(st);
    box(st, wallMat(c, COL.brick), 2.0, 0.8, 1.0);
    part(st, GEO.gable, roofMat(c, COL.roof1), 1.15, 0.45, 2.1, 0, 0.8, 0, Math.PI / 2);
    windows(c, st, 2.0, 0.8, 1.0, 1);
    // water tower and a signal
    const wt = new THREE.Group(); wt.position.set(2.8, 0, 1.4); c.root.add(wt);
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) box(wt, mat(COL.trunk), 0.07, 1.1, 0.07, x, 0, z);
    part(wt, GEO.cyl, wallMat(c, COL.trunk), 0.8, 0.6, 0.8, 0, 1.1);
    part(wt, GEO.cone6, roofMat(c, COL.roof2), 0.9, 0.3, 0.9, 0, 1.7);
    box(c.root, mat(COL.char2), 0.06, 1.2, 0.06, 2.1, 0, -1.0);
    box(c.root, mat(COL.blood, { glow: c.spec.night ? COL.blood : undefined }), 0.16, 0.1, 0.05, 2.1, 1.12, -0.97);
    if (!c.burnt) loco(c, 1.4, -0.4);
    for (const [x, z] of [[-3.0, -2.2], [-1.8, -2.6], [2.4, 2.9], [-3.4, 1.9]]) house(c, x, z, c.rnd() * 0.3, 0.8, 0.65, 0.55, COL.wall2, COL.roof3);
    c.yards.push([-1.6, 0.45], [-0.4, 0.45], [0.8, 0.45], [0.6, 2.4], [-2.0, 1.0]);
    treeRing(c, 6, 3.9, 4.6, (x, z) => Math.abs(z + 0.4) > 0.8 && Math.abs(x + z) > 1);
  },
};

/** A small freighter moored along the quay, bobbing on the swell. */
function ship(c: Ctx) {
  const g = new THREE.Group(); g.position.set(0.2, -0.32, 2.3); c.root.add(g);
  const s = new THREE.Shape();
  s.moveTo(-2.3, -0.55); s.lineTo(1.5, -0.55); s.lineTo(2.4, 0); s.lineTo(1.5, 0.55); s.lineTo(-2.3, 0.55); s.lineTo(-2.3, -0.55);
  const hullGeo = shipHull ?? (shipHull = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.15, 0));
  const hull = new THREE.Mesh(hullGeo, mat(COL.hull)); hull.castShadow = true; g.add(hull);
  box(g, mat(COL.blood), 4.6, 0.08, 1.12, -0.4, -0.04, 0); // waterline
  box(g, mat(0x8f8a7c), 3.6, 0.04, 1.0, -0.3, 0.55, 0); // deck
  const bridge = new THREE.Group(); bridge.position.set(-1.6, 0.59, 0); g.add(bridge);
  box(bridge, mat(COL.white), 1.0, 0.6, 0.85);
  box(bridge, mat(COL.white), 0.7, 0.3, 0.7, 0, 0.6, 0);
  windows(c, bridge, 1.0, 0.6, 0.85, 1);
  part(g, GEO.cyl, mat(COL.char2), 0.3, 0.6, 0.3, -0.8, 0.59, 0);
  part(g, GEO.cyl, mat(COL.amber), 0.31, 0.12, 0.31, -0.8, 1.04, 0);
  box(g, mat(COL.steel), 0.05, 1.2, 0.05, 1.3, 0.59, 0);
  for (const x of [0.1, 0.8]) box(g, mat(COL.troop), 0.55, 0.35, 0.8, x, 0.59, 0); // containers
  // gangway down to the quay
  const gw = box(c.root, mat(COL.steel), 0.25, 0.04, 1.2, -0.6, 0.1, 1.45); gw.rotation.x = -0.25;
  c.ticks.push(t => { g.position.y = -0.32 + Math.sin(t * 1.1) * 0.04; g.rotation.x = Math.sin(t * 0.9) * 0.02; });
}
let shipHull: TGeometry | null = null;

type VehicleKind = 'truck' | 'ambulance' | 'tractor' | 'tank' | 'bus';

function vehicle(c: Ctx, x: number, z: number, ry: number, kind: VehicleKind): TGroup {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; c.root.add(g);
  const burnt = c.burnt && kind !== 'tank';
  const body = burnt ? COL.char : { truck: COL.olive, ambulance: COL.white, tractor: COL.blood, tank: COL.olive, bus: COL.amber }[kind];
  for (const sx of [-0.25, 0.25]) for (const sz of [-0.17, 0.17]) {
    const w = part(g, GEO.cyl, mat(COL.char2), 0.16, 0.08, 0.16, sx, 0.08, sz);
    w.rotation.x = Math.PI / 2; w.position.z = sz * 1.15;
  }
  if (kind === 'tank') {
    box(g, mat(COL.char2), 0.9, 0.16, 0.5);
    box(g, mat(body), 0.85, 0.16, 0.44, 0, 0.14, 0);
    part(g, GEO.cyl6, mat(body), 0.34, 0.14, 0.34, -0.05, 0.3, 0);
    box(g, mat(body), 0.5, 0.05, 0.05, 0.3, 0.37, 0);
  } else if (kind === 'tractor') {
    box(g, mat(body), 0.5, 0.2, 0.3, 0, 0.08, 0);
    box(g, mat(COL.window), 0.22, 0.24, 0.26, -0.1, 0.28, 0);
  } else {
    const len = kind === 'bus' ? 1.2 : 0.75;
    box(g, mat(body), len, 0.3, 0.38, 0, 0.08, 0);
    box(g, mat(kind === 'truck' ? COL.khaki : body), len * 0.62, 0.18, 0.4, -len * 0.18, 0.38, 0);
    if (kind === 'ambulance' && !burnt) box(g, mat(COL.blood), len * 0.6, 0.05, 0.39, -len * 0.18, 0.28, 0);
    if (kind === 'bus') box(g, mat(COL.window), len * 0.9, 0.1, 0.39, 0, 0.26, 0);
  }
  return g;
}

/** A row of goods wagons on the depot siding. */
function wagons(c: Ctx, x: number, z: number, n: number) {
  for (let i = 0; i < n; i++) {
    box(c.root, mat(i % 2 ? COL.roof3 : COL.brick), 1.0, 0.45, 0.42, x + i * 1.1, 0.1, z);
  }
}

/** A tank engine waiting at the junction. */
function loco(c: Ctx, x: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, 0.1, z); c.root.add(g);
  const boiler = part(g, GEO.cyl, mat(COL.char2), 0.42, 1.0, 0.42, 0.7, 0.25, 0);
  boiler.rotation.z = Math.PI / 2; // lies along the track, from x = 0.7 back to the cab
  box(g, mat(COL.char2), 0.45, 0.55, 0.44, -0.5, 0.0, 0);
  box(g, mat(COL.blood), 1.4, 0.1, 0.46, 0, 0, 0);
  part(g, GEO.cyl, mat(COL.char2), 0.12, 0.25, 0.12, 0.45, 0.45, 0);
  if (c.spec.state === 'secure' || c.spec.state === 'threat') puff(c, x + 0.45, 0.85, z, 0xe7e2d6, 0.7);
}
