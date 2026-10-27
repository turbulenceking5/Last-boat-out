// Everything that changes turn to turn: troops, sandbags, the infected, civilians,
// refugee columns, the crowd on the quay, smoke, fire and the wreckage of a fallen place.

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
  if (s.state === 'losing' || dead) wreckage(c, dead);
  if (s.T >= 0.05 && !dead) troops(c, clampN(s.T, 1, 6), infected);
  if (infected) zombies(c, clampN(2 + Math.sqrt(s.H) * 1.3, 2, 26), s.state === 'holding');
  if (!c.ghost && !dead && s.pop >= 1) {
    if (s.evac) refugees(c, clampN(4 + Math.sqrt(s.pop) * 0.5, 4, 12));
    else bystanders(c, clampN(Math.sqrt(s.pop) * 0.6, 1, 8), infected);
  }
  if (s.type === 'port' && s.queue >= 0.5 && !dead) quayCrowd(c, clampN(Math.sqrt(s.queue) * 1.6, 2, 22));
  if (s.state === 'holding') for (let i = 0; i < 2; i++) { const [x, z] = spot(c, 1, 3.5); puff(c, x, 0.4, z, 0x8d8a82, 0.8); }
  if (s.state === 'losing') for (let i = 0; i < 3; i++) { const [x, z] = spot(c, 0.5, 3.5); fire(c, x, z, 1, i === 0); puff(c, x, 0.6, z, 0x3d3a36, 1.1); }
  if (dead) {
    for (let i = 0; i < 4; i++) { const [x, z] = spot(c, 0, 3.8); if (i < 2) fire(c, x, z, 0.6, i === 0); puff(c, x, 0.3, z, 0x2e2c2a, 1.3); }
    crows(c);
  }
}

/** Sandbag walls across the approaches, one course per fortification level, with a machine-gun
 *  post on the road in from the threat once the place is well dug in. */
function sandbags(c: Ctx, level: number) {
  const tones = [mat(COL.sand), mat(0xb09a6a), mat(0xc9b688)], r = 3.15;
  let k = 0;
  for (const a0 of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    if (c.spec.type === 'port' && Math.sin(a0) > 0.1) continue; // no walls in the harbour
    for (let row = 0; row < level; row++) {
      for (let a = a0 - 0.42 + (row % 2) * 0.055; a <= a0 + 0.42; a += 0.11) {
        part(c.root, GEO.bag, tones[k++ % 3], 0.33, 0.13, 0.21, Math.cos(a) * r, row * 0.115, Math.sin(a) * r, -a + Math.PI / 2);
      }
    }
    if (level >= 2 && (a0 === 0 || a0 === Math.PI)) { // a gun on a tripod looking out over the wall
      const g = new THREE.Group(); g.position.set(Math.cos(a0) * (r - 0.25), level * 0.115 + 0.02, Math.sin(a0) * r); g.rotation.y = -a0 + Math.PI / 2; c.root.add(g);
      box(g, mat(COL.char2), 0.05, 0.05, 0.4, 0, 0.05, 0.1);
      box(g, mat(COL.char2), 0.08, 0.08, 0.14, 0, 0.02, -0.06);
      for (const sx of [-1, 1]) { const leg = box(g, mat(COL.char2), 0.02, 0.12, 0.02, sx * 0.06, -0.08, 0.05); leg.rotation.z = sx * 0.4; }
    }
  }
}

/** Striped road barriers where the danger will come from, and a sign. */
function barricade(c: Ctx) {
  const [, [x, z]] = EXIT[c.spec.type];
  const a = Math.atan2(z, x), bx = Math.cos(a) * 3.4, bz = Math.sin(a) * 3.4;
  const g = new THREE.Group(); g.position.set(bx, 0, bz); g.rotation.y = -a + Math.PI / 2; c.root.add(g);
  for (const ox of [-0.45, 0.45]) { box(g, mat(COL.char2), 0.05, 0.3, 0.05, ox, 0, 0); box(g, mat(COL.char2), 0.05, 0.03, 0.3, ox, 0, 0); }
  for (let i = 0; i < 5; i++) box(g, mat(i % 2 ? COL.white : COL.blood), 0.2, 0.1, 0.05, -0.4 + i * 0.2, 0.28, 0);
  const lampOn = mat(COL.amber, { glow: COL.amber });
  const blink = box(g, lampOn, 0.07, 0.07, 0.07, 0.45, 0.38, 0);
  c.ticks.push(t => { blink.visible = Math.sin(t * 5) > 0; });
}

/** Legs swing as a figure walks, and arms against them; phase offsets keep a crowd out of step. */
function stride(f: Figure, t: number, speed: number) {
  const a = Math.sin(t * speed) * 0.5;
  f.legs[0].rotation.x = a; f.legs[1].rotation.x = -a;
  if (f.armSwing) { f.arms[0].rotation.x = -a * 0.8; f.arms[1].rotation.x = a * 0.8; }
}

function troops(c: Ctx, battalions: number, fighting: boolean) {
  for (let b = 0; b < battalions; b++) {
    const [cx, cz] = b < c.yards.length ? c.yards[b] : spot(c, 1.5, 3);
    const face = Math.atan2(cx, cz) + (c.rnd() - 0.5) * 0.6; // face outward, toward the threat
    for (let i = 0; i < 3; i++) {
      const f = person(COL.troop, { helmet: COL.olive, legs: 0x2f3329, pose: 'rifle' });
      box(f.g, mat(0x4a5636), 0.17, 0.2, 0.09, 0, 0.24, -0.13); // pack
      const ox = (i - 1) * 0.3, oz = i === 1 ? -0.17 : 0;
      f.g.position.set(cx + Math.cos(face) * ox + Math.sin(face) * oz, 0, cz - Math.sin(face) * ox + Math.cos(face) * oz);
      f.g.rotation.y = face;
      if (i === 1 && fighting) { f.g.scale.y = 0.75; } // the middle one kneels to fire
      c.root.add(f.g);
      if (fighting) { // muzzle flashes
        const flash = part(f.g, GEO.ball, mat(COL.glow, { glow: COL.glow }), 0.12, 0.12, 0.12, 0.04, 0.3, 0.5);
        flash.castShadow = false;
        const ph = c.rnd() * 10;
        c.ticks.push(t => { const on = Math.sin(t * 9 + ph) > 0.8; flash.visible = on; if (on) flash.scale.setScalar(0.08 + Math.random() * 0.08); });
      }
    }
    if (b % 2 === 1) vehicle(c, cx + Math.sin(face) * -0.75, cz + Math.cos(face) * -0.75, face + Math.PI / 2, c.spec.type === 'base' || battalions >= 4 ? 'tank' : 'truck');
  }
}

/** The infected: mostly shamblers reaching forward, a few lean runners, and in a big horde a brute. */
function zombies(c: Ctx, n: number, heldOff: boolean) {
  const shirts = [COL.zedShirt, 0x5b6470, 0x7a6a50, 0x4d5a4a, COL.blood, 0x8a8478];
  for (let i = 0; i < n; i++) {
    const kind = i > 0 && i % 9 === 0 ? 'brute' : i % 4 === 3 ? 'runner' : 'walker';
    const f = kind === 'brute'
      ? person(0x5d6a49, { head: COL.zed, arms: COL.zed, legs: 0x3a342c, pose: 'walk', scale: 1.15, broad: 1.45 })
      : person(shirts[Math.floor(c.rnd() * shirts.length)], { head: COL.zed, arms: COL.zed, legs: 0x4a4438, pose: kind === 'runner' ? 'walk' : 'reach', scale: kind === 'runner' ? 0.95 : 1 });
    if (kind === 'brute') f.arms.forEach(a => { a.rotation.x = -0.2; });
    c.root.add(f.g);
    const a0 = c.rnd() * Math.PI * 2, ph = c.rnd() * 20, lean = kind === 'runner' ? 0.5 : 0.15 + c.rnd() * 0.2;
    const sp = (0.05 + c.rnd() * 0.05) * (kind === 'runner' ? 1.8 : kind === 'brute' ? 0.7 : 1), gait = kind === 'runner' ? 7 : kind === 'brute' ? 2 : 3;
    f.g.rotation.z = (c.rnd() - 0.5) * 0.2;
    if (heldOff) {
      // a held place: they keep coming in from the rim and are cut down at the wire
      const r0 = 4.6, r1 = 3.4;
      c.ticks.push(t => {
        const u = ((t * sp + ph) % 1);
        const r = r0 - (r0 - r1) * u, a = a0 + Math.sin(t * 0.3 + ph) * 0.05;
        f.g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        f.g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
        f.g.rotation.x = u > 0.9 ? lean + (u - 0.9) * 14 : lean; // falls as it is hit
        f.g.visible = u < 0.97;
        stride(f, t + ph, gait * 1.3);
      });
    } else {
      // overrun: they wander the streets
      const [hx, hz] = spot(c, 0.3, 4.2), rr = kind === 'runner' ? 0.6 : 0.35;
      c.ticks.push(t => {
        const a = t * 0.25 * (i % 2 ? 1 : -1) * (kind === 'runner' ? 2 : 1) + ph;
        const x = hx + Math.cos(a) * rr, z = hz + Math.sin(a * 1.3) * rr;
        f.g.rotation.y = Math.atan2(x - f.g.position.x, z - f.g.position.z) || f.g.rotation.y;
        f.g.position.set(x, 0, z);
        f.g.rotation.x = lean;
        stride(f, t + ph, gait);
      });
    }
  }
}

/** A civilian, dressed one of a few ways: shirt, coat, or hat; a quarter of them children. */
function civilian(c: Ctx, child = c.rnd() < 0.2): Figure {
  const color = [COL.civ, COL.civ2, COL.civ3, COL.wall3, 0x9a6b8a, 0x6f8f6a][Math.floor(c.rnd() * 6)];
  const v = c.rnd(), hair = [0x4a3326, 0x2b2622, 0xb89a5e, 0x8a5a3a][Math.floor(c.rnd() * 4)];
  return person(color, {
    scale: child ? 0.68 : 1,
    legs: v < 0.33 ? 0x46526a : COL.char2,
    hair: v < 0.66 ? hair : undefined,
    hat: v >= 0.66 ? COL.char2 : undefined,
  });
}

function bystanders(c: Ctx, n: number, scared: boolean) {
  for (let i = 0; i < n; i++) {
    const f = civilian(c);
    const [x, z] = spot(c, 0.5, 2.5);
    f.g.position.set(x, 0, z);
    f.g.rotation.y = c.rnd() * 6;
    c.root.add(f.g);
    const ph = c.rnd() * 10;
    if (scared) c.ticks.push(t => { f.g.rotation.y = Math.sin(t * 2 + ph) * 1.5; f.arms[0].rotation.x = -0.4 - Math.max(0, Math.sin(t * 3 + ph)) * 1.6; });
  }
}

/** A column of refugees walking out along the exit road, with a bus at its head. */
function refugees(c: Ctx, n: number) {
  const [[x1, z1], [x2, z2]] = EXIT[c.spec.type];
  const dir = Math.atan2(x2 - x1, z2 - z1);
  vehicle(c, x1 + (x2 - x1) * 0.82, z1 + (z2 - z1) * 0.82, dir - Math.PI / 2, 'bus');
  for (let i = 0; i < n; i++) {
    const f = civilian(c, c.rnd() < 0.25);
    if (c.rnd() < 0.5) box(f.g, mat(c.rnd() < 0.5 ? COL.trunk : COL.troop), 0.18, 0.16, 0.1, 0.17, 0.05, 0); // a suitcase
    else box(f.g, mat(0x6b5236), 0.2, 0.22, 0.1, 0, 0.26, -0.15); // a rucksack
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

/** People waiting on the quay for the next ship, facing the water, some waving. */
function quayCrowd(c: Ctx, n: number) {
  for (let i = 0; i < n; i++) {
    const f = civilian(c);
    f.g.position.set(-3.3 + c.rnd() * 5.4, 0, 0.25 + c.rnd() * 0.8);
    f.g.rotation.y = (c.rnd() - 0.5) * 0.8;
    c.root.add(f.g);
    const ph = c.rnd() * 10, waves = c.rnd() < 0.3;
    c.ticks.push(t => {
      f.g.position.y = Math.max(0, Math.sin(t * 1.5 + ph)) * 0.02;
      if (waves) f.arms[1].rotation.x = -2.6 + Math.sin(t * 6 + ph) * 0.4;
    });
  }
}

/** A rising column of smoke: puffs that drift up and downwind, grow and fade, then start again. */
function puff(c: Ctx, x: number, y: number, z: number, color: number, size: number) {
  const balls: TMesh[] = [];
  const ms = [mat(color, { opacity: 0.6 }), mat(new THREE.Color(color).multiplyScalar(1.25).getHex(), { opacity: 0.45 })];
  for (let i = 0; i < 7; i++) {
    const b = part(c.root, GEO.ball, ms[i % 2], 1, 1, 1, x, y, z);
    b.castShadow = false; b.receiveShadow = false;
    balls.push(b);
  }
  const ph = c.rnd() * 5;
  c.ticks.push(t => {
    balls.forEach((b, i) => {
      const u = ((t * 0.11 + ph + i / balls.length) % 1);
      const s = size * (0.25 + u * 1.05);
      b.scale.set(s, s * 0.85, s);
      b.position.set(x + Math.sin(u * 3 + ph + i) * 0.25 + u * u * 1.1, y + u * 3.0, z + u * 0.3);
    });
  });
}

/** A fire: a glowing bed of embers and three flickering tongues of flame; the first fire of a
 *  scene also throws a flickering light, which shows best at night. */
function fire(c: Ctx, x: number, z: number, size = 1, light = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z); c.root.add(g);
  const bed = part(g, GEO.disc, mat(0x7a2a1a, { glow: 0xc4432f }), 0.7 * size, 0.03, 0.7 * size);
  bed.castShadow = false;
  const flames: Array<[TMesh, number, number]> = []; // each tongue, its height and its phase
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1, r = i ? 0.14 * size : 0, k = i ? 0.72 : 1;
    const outer = part(g, GEO.cone6, mat(0xe2642a, { glow: 0xc4432f }), 0.36 * size, 0.6 * size, 0.36 * size, Math.cos(a) * r, 0, Math.sin(a) * r);
    const inner = part(g, GEO.cone6, mat(COL.glow, { glow: COL.amber }), 0.2 * size, 0.38 * size, 0.2 * size, Math.cos(a) * r, 0, Math.sin(a) * r);
    outer.castShadow = inner.castShadow = false;
    flames.push([outer, 0.6 * size * k, c.rnd() * 10], [inner, 0.38 * size * k, c.rnd() * 10]);
  }
  let lamp: THREE.PointLight | null = null;
  if (light) { lamp = new THREE.PointLight(0xff9a4a, c.spec.night ? 1.6 : 0.6, 4.5, 2); lamp.position.set(0, 0.6, 0); g.add(lamp); }
  c.ticks.push(t => {
    for (const [m, h, ph] of flames) m.scale.y = h * (1 + Math.sin(t * 13 + ph) * 0.18 + Math.sin(t * 7.3 + ph) * 0.12);
    g.rotation.y = t * 0.8;
    if (lamp) lamp.intensity = (c.spec.night ? 1.6 : 0.6) * (0.8 + Math.sin(t * 17) * 0.1 + Math.sin(t * 5.3) * 0.1);
  });
}

/** Signs of a place being overrun: blood on the ground, the dead, an abandoned car and rubble. */
function wreckage(c: Ctx, fallen: boolean) {
  const blood = mat(0x6a221c);
  for (let i = 0; i < (fallen ? 7 : 4); i++) {
    const [x, z] = spot(c, 0.3, 3.6), s = 0.25 + c.rnd() * 0.35;
    const d = part(c.root, GEO.disc, blood, s, 0.012, s * (0.6 + c.rnd() * 0.5), x, 0.01, z, c.rnd() * 3);
    d.castShadow = false;
  }
  for (let i = 0; i < (fallen ? 4 : 2); i++) {
    const f = civilian(c, false), [x, z] = spot(c, 0.4, 3.6);
    f.g.position.set(x, 0.06, z); f.g.rotation.set(-Math.PI / 2, c.rnd() * 6, 0, 'YXZ');
    f.arms[0].rotation.x = -1.2;
    c.root.add(f.g);
  }
  const [cx, cz] = spot(c, 1, 3.4);
  const wreck = car(c, cx, cz, c.rnd() * 6, fallen ? COL.char : 0x7f93a6);
  wreck.rotation.z = fallen ? 0.25 : 0;
  if (fallen) for (let i = 0; i < 5; i++) {
    const [x, z] = spot(c, 0.5, 3.8), s = 0.15 + c.rnd() * 0.2;
    box(c.root, mat(i % 2 ? COL.char2 : 0x6e665a), s, s * 0.6, s, x, 0, z, c.rnd() * 3).rotation.x = c.rnd() * 0.4;
  }
}

/** Crows circling over a fallen place. */
function crows(c: Ctx) {
  const m = mat(0x1c1a18);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); c.root.add(g);
    const body = box(g, m, 0.06, 0.04, 0.16, 0, 0, 0);
    const wings = [box(g, m, 0.2, 0.01, 0.07, -0.1, 0.02, 0), box(g, m, 0.2, 0.01, 0.07, 0.1, 0.02, 0)];
    body.castShadow = false;
    const r = 1 + c.rnd() * 1.6, h = 3 + c.rnd() * 1.2, ph = c.rnd() * 6, cx = (c.rnd() - 0.5) * 2, cz = (c.rnd() - 0.5) * 2;
    c.ticks.push(t => {
      const a = t * 0.5 + ph;
      g.position.set(cx + Math.cos(a) * r, h + Math.sin(t * 1.3 + ph) * 0.15, cz + Math.sin(a) * r);
      g.rotation.y = -a;
      const flap = Math.sin(t * 9 + ph) * 0.5;
      wings[0].rotation.z = flap; wings[1].rotation.z = -flap;
    });
  }
}
