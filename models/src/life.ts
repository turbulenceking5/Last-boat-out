// Everything that changes turn to turn: troops, sandbags, the infected, civilians,
// refugee columns, the crowd on the quay, smoke and fire.

/** Where refugees walk out of each place: from the first point to the second. */
const EXIT: Record<PlaceType, [[number, number], [number, number]]> = {
  town: [[0.6, 0.2], [4.8, 0.2]],
  city: [[0, 1.5], [4.8, 1.5]],
  capital: [[0, 2.9], [4.8, 2.9]],
  port: [[-3.4, -0.6], [-0.6, 1.0]],
  base: [[0.3, 1.2], [0.3, 4.8]],
  depot: [[-0.6, 0.6], [4.8, 0.6]],
  hospital: [[0, 1.9], [4.8, 1.9]],
  farm: [[0.4, 0.8], [4.8, 0.8]],
  junction: [[-2.2, 0.45], [1.6, 0.45]],
};

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

function populate(c: Ctx) {
  const s = c.spec, infected = s.H >= 0.5, dead = s.state === 'fallen';
  if (s.F > 0) sandbags(c, s.F);
  else if (s.state === 'threat') barricade(c);
  if (s.T >= 0.05 && !dead) troops(c, clampN(s.T, 1, 6), infected);
  if (infected) zombies(c, clampN(2 + Math.sqrt(s.H) * 1.3, 2, 26), s.state === 'holding');
  if (!c.ghost && !dead && s.pop >= 1) {
    if (s.evac) refugees(c, clampN(4 + Math.sqrt(s.pop) * 0.5, 4, 12));
    else bystanders(c, clampN(Math.sqrt(s.pop) * 0.6, 1, 8), infected);
  }
  if (s.type === 'port' && s.queue >= 0.5 && !dead) quayCrowd(c, clampN(Math.sqrt(s.queue) * 1.6, 2, 22));
  if (s.state === 'holding') for (let i = 0; i < 2; i++) { const [x, z] = spot(c, 1, 3.5); puff(c, x, 0.4, z, 0x8d8a82, 0.8); }
  if (s.state === 'losing') for (let i = 0; i < 3; i++) { const [x, z] = spot(c, 0.5, 3.5); fire(c, x, z); puff(c, x, 0.5, z, 0x3d3a36, 1.1); }
  if (dead) for (let i = 0; i < 4; i++) { const [x, z] = spot(c, 0, 3.8); if (i < 2) fire(c, x, z, 0.6); puff(c, x, 0.3, z, 0x2e2c2a, 1.3); }
}

/** Sandbag walls across the approaches, one course per fortification level. */
function sandbags(c: Ctx, level: number) {
  const m = mat(COL.sand), r = 3.15;
  for (const a0 of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    if (c.spec.type === 'port' && Math.sin(a0) > 0.1) continue; // no walls in the harbour
    for (let k = 0; k < level; k++) {
      for (let a = a0 - 0.42 + (k % 2) * 0.05; a <= a0 + 0.42; a += 0.11) {
        box(c.root, m, 0.32, 0.13, 0.2, Math.cos(a) * r, k * 0.13, Math.sin(a) * r, -a + Math.PI / 2);
      }
    }
  }
}

/** Striped road barriers where the danger will come from. */
function barricade(c: Ctx) {
  const [, [x, z]] = EXIT[c.spec.type];
  const a = Math.atan2(z, x), bx = Math.cos(a) * 3.4, bz = Math.sin(a) * 3.4;
  const g = new THREE.Group(); g.position.set(bx, 0, bz); g.rotation.y = -a + Math.PI / 2; c.root.add(g);
  for (const ox of [-0.4, 0.4]) { box(g, mat(COL.char2), 0.05, 0.3, 0.05, ox, 0, 0); }
  for (let i = 0; i < 4; i++) box(g, mat(i % 2 ? COL.white : COL.blood), 0.25, 0.1, 0.05, -0.375 + i * 0.25, 0.28, 0);
}

/** Legs swing as a figure walks; phase offsets keep a crowd out of step. */
function stride(f: Figure, t: number, speed: number) {
  const a = Math.sin(t * speed) * 0.5;
  f.legs[0].rotation.x = a; f.legs[1].rotation.x = -a;
}

function troops(c: Ctx, battalions: number, fighting: boolean) {
  for (let b = 0; b < battalions; b++) {
    const [cx, cz] = b < c.yards.length ? c.yards[b] : spot(c, 1.5, 3);
    const face = Math.atan2(cx, cz) + (c.rnd() - 0.5) * 0.6; // face outward, toward the threat
    for (let i = 0; i < 3; i++) {
      const f = person(COL.troop, { helmet: COL.olive, head: COL.skin });
      const ox = (i - 1) * 0.28, oz = i === 1 ? -0.15 : 0;
      f.g.position.set(cx + Math.cos(face) * ox + Math.sin(face) * oz, 0, cz - Math.sin(face) * ox + Math.cos(face) * oz);
      f.g.rotation.y = face;
      box(f.g, mat(COL.char2), 0.04, 0.04, 0.3, 0.08, 0.26, 0.12); // rifle
      c.root.add(f.g);
      if (fighting) { // muzzle flashes
        const flash = box(f.g, mat(COL.glow, { glow: COL.glow }), 0.08, 0.08, 0.08, 0.08, 0.24, 0.32);
        flash.castShadow = false;
        const ph = c.rnd() * 10;
        c.ticks.push(t => { flash.visible = Math.sin(t * 9 + ph) > 0.85; });
      }
    }
    if (b % 2 === 1) vehicle(c, cx + Math.sin(face) * -0.7, cz + Math.cos(face) * -0.7, face + Math.PI / 2, c.spec.type === 'base' || battalions >= 4 ? 'tank' : 'truck');
  }
}

function zombies(c: Ctx, n: number, heldOff: boolean) {
  const shirts = [COL.zedShirt, 0x5b6470, 0x7a6a50, 0x4d5a4a, COL.blood];
  for (let i = 0; i < n; i++) {
    const f = person(shirts[Math.floor(c.rnd() * shirts.length)], { head: COL.zed });
    for (const side of [-1, 1]) box(f.g, mat(COL.zed), 0.05, 0.05, 0.24, side * 0.09, 0.27, 0.1); // arms out in front
    c.root.add(f.g);
    const a0 = c.rnd() * Math.PI * 2, ph = c.rnd() * 20, sp = 0.05 + c.rnd() * 0.05, lean = 0.15 + c.rnd() * 0.2;
    f.g.rotation.z = (c.rnd() - 0.5) * 0.2;
    if (heldOff) {
      // a held place: they keep coming in from the rim and are cut down at the wire
      const r0 = 4.6, r1 = 3.4;
      c.ticks.push(t => {
        const u = ((t * sp + ph) % 1);
        const r = r0 - (r0 - r1) * u, a = a0 + Math.sin(t * 0.3 + ph) * 0.05;
        f.g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        f.g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
        f.g.rotation.x = lean;
        f.g.visible = u < 0.94;
        stride(f, t + ph, 3);
      });
    } else {
      // overrun: they wander the streets
      const [hx, hz] = spot(c, 0.3, 4.2);
      c.ticks.push(t => {
        const a = t * 0.25 * (i % 2 ? 1 : -1) + ph;
        const x = hx + Math.cos(a) * 0.35, z = hz + Math.sin(a * 1.3) * 0.35;
        f.g.rotation.y = Math.atan2(x - f.g.position.x, z - f.g.position.z) || f.g.rotation.y;
        f.g.position.set(x, 0, z);
        f.g.rotation.x = lean;
        stride(f, t + ph, 2.5);
      });
    }
  }
}

const civColor = (c: Ctx) => [COL.civ, COL.civ2, COL.civ3, COL.wall3][Math.floor(c.rnd() * 4)];

function bystanders(c: Ctx, n: number, scared: boolean) {
  for (let i = 0; i < n; i++) {
    const f = person(civColor(c));
    const [x, z] = spot(c, 0.5, 2.5);
    f.g.position.set(x, 0, z);
    f.g.rotation.y = c.rnd() * 6;
    c.root.add(f.g);
    const ph = c.rnd() * 10;
    if (scared) c.ticks.push(t => { f.g.rotation.y = Math.sin(t * 2 + ph) * 1.5; });
  }
}

/** A column of refugees walking out along the exit road, with a bus at its head. */
function refugees(c: Ctx, n: number) {
  const [[x1, z1], [x2, z2]] = EXIT[c.spec.type];
  const dir = Math.atan2(x2 - x1, z2 - z1);
  vehicle(c, x1 + (x2 - x1) * 0.82, z1 + (z2 - z1) * 0.82, dir - Math.PI / 2, 'bus');
  for (let i = 0; i < n; i++) {
    const f = person(civColor(c), { scale: c.rnd() < 0.25 ? 0.7 : 1 }); // some children
    if (c.rnd() < 0.5) box(f.g, mat(COL.trunk), 0.16, 0.14, 0.1, 0.12, 0.12, 0); // a suitcase
    f.g.rotation.y = dir;
    c.root.add(f.g);
    const off = (c.rnd() - 0.5) * 0.35, ph = i / n;
    c.ticks.push(t => {
      const u = (t * 0.04 + ph) % 1;
      f.g.position.set(x1 + (x2 - x1) * u * 0.75 + Math.cos(dir) * off, 0, z1 + (z2 - z1) * u * 0.75 - Math.sin(dir) * off);
      stride(f, t + ph * 7, 6);
    });
  }
}

/** People waiting on the quay for the next ship, facing the water. */
function quayCrowd(c: Ctx, n: number) {
  for (let i = 0; i < n; i++) {
    const f = person(civColor(c), { scale: c.rnd() < 0.2 ? 0.7 : 1 });
    f.g.position.set(-3.3 + c.rnd() * 5.4, 0, 0.25 + c.rnd() * 0.8);
    f.g.rotation.y = (c.rnd() - 0.5) * 0.8;
    c.root.add(f.g);
    const ph = c.rnd() * 10;
    c.ticks.push(t => { f.g.position.y = Math.max(0, Math.sin(t * 1.5 + ph)) * 0.02; });
  }
}

/** A rising column of smoke: a few puffs that drift up, grow and fade, then start again. */
function puff(c: Ctx, x: number, y: number, z: number, color: number, size: number) {
  const balls: TMesh[] = [];
  const m = mat(color, { opacity: 0.55 });
  for (let i = 0; i < 5; i++) {
    const b = part(c.root, GEO.ball, m, 1, 1, 1, x, y, z);
    b.castShadow = false; b.receiveShadow = false;
    balls.push(b);
  }
  const ph = c.rnd() * 5;
  c.ticks.push(t => {
    balls.forEach((b, i) => {
      const u = ((t * 0.12 + ph + i / balls.length) % 1);
      const s = size * (0.25 + u * 0.9);
      b.scale.set(s, s, s);
      b.position.set(x + Math.sin(u * 3 + ph) * 0.3 + u * 0.6, y + u * 2.6, z + u * 0.2);
    });
  });
}

function fire(c: Ctx, x: number, z: number, size = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); c.root.add(g);
  const outer = part(g, GEO.cone6, mat(0xe2642a, { glow: 0xc4432f }), 0.45 * size, 0.6 * size, 0.45 * size);
  const inner = part(g, GEO.cone6, mat(COL.glow, { glow: COL.amber }), 0.25 * size, 0.4 * size, 0.25 * size);
  outer.castShadow = inner.castShadow = false;
  const ph = c.rnd() * 10;
  c.ticks.push(t => {
    const f = 1 + Math.sin(t * 13 + ph) * 0.15 + Math.sin(t * 7.3 + ph) * 0.1;
    outer.scale.y = 0.6 * size * f; inner.scale.y = 0.4 * size * (2 - f);
    g.rotation.y = t * 0.8;
  });
}
