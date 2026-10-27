// The simulation: one fixed step at a time (1/20 s of game time).
// Order each step: rebuild fields and hashes, blocks emit refugees, civilians walk, units and aircraft
// fire (marking kills), the infected move and bite, ships and buses sail, then dead are cleared away.

const STEP = 1 / 20;
const BREACH = 25;        // zombie-seconds of battering before a block's doors give way
const CONVERT_EVERY = 5;  // once inside, one figure's worth of people is caught this often
const EMIT_EVERY = 2;     // an evacuating block lets one figure's worth of people out this often
const fieldCache = new Map<number, Float32Array>();
const doorField = new Float32Array(W * H);
let panicSaid = 0, busSaid = 0; // routine messages are rationed so the log stays readable
let zFieldT = 0, unitCount: Record<UnitKind, number> = { militia: 0, infantry: 0, apc: 0, tank: 0 };

function newGame(seed: number) {
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
  zFieldT = 0; panicSaid = 0; busSaid = 0;
  unitCount = { militia: 0, infantry: 0, apc: 0, tank: 0 };
  generateCity(seeded(20261027)); // the same streets every game; the outbreak and its timing vary
  G.stats.total = G.blocks.reduce((a, b) => a + b.popMax, 0);
  const hc = idx(37, 60);
  G.evacs.push({ id: G.nextId++, kind: 'harbor', x: 37.5, z: 60.5, cell: hc, queue: 0, timer: 40, interval: 40, cap: 700, departed: 0, maxQueue: 4000, full: false, biteT: 0 });
  spawnUnit('infantry', G.hq, idx(13, 9));
  spawnUnit('infantry', G.hq, idx(9, 17));
  const hosp = G.blocks.find(b => b.district === 'hospital')!;
  outbreak(hosp, 20);
  say('You have command of the city. The last ship leaves the harbour in 12 minutes.', 'key');
  say(`Outbreak at ${hosp.name}. The infected are breaking out.`, 'bad');
}

/** Infected appear at a block's doors and the people they came from are lost. */
function outbreak(b: Block, n: number) {
  for (let k = 0; k < n; k++) {
    const d = b.doors[k % b.doors.length];
    spawnZed(ci(d) + 0.2 + G.rnd() * 0.6, cj(d) + 0.2 + G.rnd() * 0.6, false);
  }
  const lost = Math.min(b.pop, n * PER_AGENT);
  b.pop -= lost; G.stats.dead += lost;
  b.evacuating = true;
}

const SHIRTS = [0x6a4f45, 0x5b6470, 0x7a6a50, 0x4d5a4a, 0x8a3a30, 0x6b6b6b, 0x3f4f66];
/** A new infected. The bitten lie still for a while before they rise (rise = true). */
function spawnZed(x: number, z: number, rise = true) {
  if (G.zeds.length >= MAX_ZOMBIES) return;
  const r = G.rnd;
  G.zeds.push({ x, z, hp: 3, cd: 0.5 + r(), sp: 0.55 + r() * 0.45, ph: r() * 100, hd: r() * 6, shirt: SHIRTS[Math.floor(r() * SHIRTS.length)], wx: x, wz: z, rise: rise ? 10 + r() * 8 : 0 });
}

const CIV_COLORS = [0xe9e3cf, 0x7f93a6, 0xb8865b, 0xc9b99a, 0x9a6b8a, 0x6f8f6a, 0xd2a65a];
function spawnCiv(x: number, z: number) {
  const r = G.rnd;
  G.civs.push({ x, z, sp: 1.7 + r() * 0.7, ph: r() * 100, hd: 0, color: CIV_COLORS[Math.floor(r() * CIV_COLORS.length)], gone: false });
}

function spawnUnit(kind: UnitKind, from: number, goal: number, name?: string): Unit {
  const s = UNITS[kind], members: Member[] = [];
  for (let k = 0; k < s.members; k++) {
    const a = (k / s.members) * Math.PI * 2, r = s.members > 1 ? s.spread * (k % 2 ? 1 : 0.6) : 0;
    members.push({ hp: s.hp, maxHp: s.hp, ox: Math.cos(a) * r, oz: Math.sin(a) * r, cd: G.rnd() * s.rof, x: ci(from) + 0.5, z: cj(from) + 0.5, hd: 0 });
  }
  unitCount[kind]++;
  const u: Unit = {
    id: G.nextId++, kind, name: name ?? `${s.name} ${unitCount[kind]}`, x: ci(from) + 0.5, z: cj(from) + 0.5, hd: 0,
    members, goal: -1, field: null, aim: null, kills: 0, people: kind === 'militia' ? s.members * PER_AGENT : 0,
  };
  G.units.push(u);
  if (goal >= 0) sendUnit(u, goal);
  return u;
}

function fieldTo(c: number): Float32Array {
  let f = fieldCache.get(c);
  if (!f) {
    if (fieldCache.size > 40) fieldCache.clear();
    f = new Float32Array(W * H);
    distanceField(f, [c]);
    fieldCache.set(c, f);
  }
  return f;
}

function sendUnit(u: Unit, c: number) {
  const f = fieldTo(c);
  if (f[cellOf(u.x, u.z)] >= INF) return; // unreachable
  u.goal = c; u.field = f;
}

// ---- orders from the player ----

/** Spend money; returns an error message, or null when the order went through. */
function order(kind: Order, x: number, z: number, block: Block | null): string | null {
  if (G.over) return 'The campaign is over.';
  const cost = ORDER_COST[kind];
  if (G.funds < cost) return `Needs $${cost}. You have $${Math.floor(G.funds)}.`;
  if (kind === 'militia') {
    if (!block || block.district === 'park' || block.district === 'base') return 'Pick a block with residents to raise militia from.';
    if (block.pop < 6 * PER_AGENT) return `${block.name} has too few people left to raise militia.`;
    const door = block.doors.reduce((a, d) => (G.zField[d] > G.zField[a] ? d : a), block.doors[0]);
    block.pop -= 6 * PER_AGENT;
    spawnUnit('militia', door, -1, `Militia, ${block.name}`);
    say(`${block.name} raises a militia company from 60 volunteers.`);
  } else if (kind === 'infantry' || kind === 'apc' || kind === 'tank') {
    const c = nearestWalkable(x, z);
    if (c < 0) return 'Pick a street, park or quay.';
    const u = spawnUnit(kind, G.hq, c);
    say(`${u.name} rolls out of Fort Aldermoor.`);
  } else if (kind === 'strike') {
    G.strikes.push({ x, z, t: 2.5, dir: G.rnd() * Math.PI, bombs: 5 });
    say('Air strike inbound. Keep your people clear.', 'key');
  } else if (kind === 'gunship') {
    G.gunships.push({ x, z, t: 45, ang: 0, cd: 0, hx: x + 5, hz: z });
    say('Gunship on station for 45 seconds.', 'key');
  } else if (kind === 'evac') {
    const c = nearestWalkable(x, z);
    if (c < 0 || G.grid[c] === Cell.Park || G.grid[c] === Cell.Base) return 'Evacuation points go on a street or the quay.';
    if (G.evacs.some(e => dist2(e.x, e.z, ci(c) + 0.5, cj(c) + 0.5) < 36)) return 'Too close to another evacuation point.';
    G.evacs.push({ id: G.nextId++, kind: 'bus', x: ci(c) + 0.5, z: cj(c) + 0.5, cell: c, queue: 0, timer: 10, interval: 10, cap: 70, departed: 0, maxQueue: 350, full: false, biteT: 0 });
    G.eFieldDirty = true;
    say('Buses will run from the new evacuation point.', 'key');
  }
  G.funds -= cost; G.stats.spent += cost;
  return null;
}

function moveUnits(units: Unit[], x: number, z: number) {
  const c = nearestWalkable(x, z);
  if (c < 0) return;
  for (const u of units) sendUnit(u, c);
}

function evacuateBlock(b: Block) {
  if (b.pop <= 0 || b.evacuating) return;
  b.evacuating = true;
  say(`${b.name} is evacuating.`);
}

// ---- the step ----

function tick(dt: number) {
  G.t += dt;
  G.zedSpeed = 1 + (G.t / GAME_SECONDS) * 0.35;
  G.funds += dt * 10;

  for (const e of G.evacs) { const full = e.queue >= e.maxQueue; if (full !== e.full) { e.full = full; G.eFieldDirty = true; } }
  if (G.eFieldDirty) {
    // civilians head for the nearest evacuation point with room; if every one is full, the nearest of any
    const open = G.evacs.filter(e => !e.full);
    distanceField(G.eField, (open.length ? open : G.evacs).map(e => e.cell));
    G.eFieldDirty = false;
  }
  zFieldT -= dt;
  if (zFieldT <= 0) { zFieldT = 0.4; rebuildZField(); }
  zHash.build(G.zeds);
  cHash.build(G.civs);

  while (G.sparks.length && G.t >= G.sparks[0]) { G.sparks.shift(); spark(); }
  for (const b of G.blocks) updateBlock(b, dt);
  for (const c of G.civs) if (!c.gone) updateCiv(c, dt);
  for (const u of G.units) updateUnit(u, dt);
  for (const s of G.strikes) updateStrike(s, dt);
  for (const g of G.gunships) updateGunship(g, dt);
  const n = G.zeds.length;
  for (let k = 0; k < n; k++) { const z = G.zeds[k]; if (z.hp > 0) updateZed(z, dt); }
  for (const e of G.evacs) updateEvac(e, dt);

  // clear away the dead
  G.zeds = G.zeds.filter(z => z.hp > 0);
  G.civs = G.civs.filter(c => !c.gone);
  G.strikes = G.strikes.filter(s => s.t > -1.5);
  G.gunships = G.gunships.filter(g => { if (g.t <= 0) say('The gunship returns to base.'); return g.t > 0; });
  for (const u of G.units) {
    const before = u.members.length;
    u.members = u.members.filter(m => m.hp > 0);
    if (u.people > 0) { const lost = Math.min(u.people, (before - u.members.length) * PER_AGENT); u.people -= lost; G.stats.dead += lost; }
    if (before && !u.members.length) { G.stats.unitsLost++; say(`${u.name} has been wiped out.`, 'bad'); }
  }
  G.units = G.units.filter(u => u.members.length);
  for (const t of G.tracers) t.t -= dt;
  G.tracers = G.tracers.filter(t => t.t > 0);
  for (const b of G.booms) b.t -= dt;
  G.booms = G.booms.filter(b => b.t > 0);

  if (G.t >= GAME_SECONDS) finish('time');
  else if (G.t > 5 && G.blocks.every(b => b.pop <= 0) && !G.civs.length && G.evacs.every(e => e.queue <= 0)) finish('empty');
}

/** Beyond this the infected wander instead of hunting. */
const AGGRO = 18, DOOR_SCENT = 10;
/**
 * The infected head for the nearest people: anyone on the streets, troops and crowds draw them from
 * AGGRO cells away; shut doors only from AGGRO - DOOR_SCENT, so a quiet street isn't a beacon.
 */
function rebuildZField() {
  const src: number[] = [], doors: number[] = [];
  for (const c of G.civs) if (!c.gone) src.push(cellOf(c.x, c.z));
  for (const u of G.units) for (const m of u.members) src.push(cellOf(m.x, m.z));
  for (const e of G.evacs) if (e.queue > 0) src.push(e.cell);
  for (const b of G.blocks) if (b.pop > 0) for (const d of b.doors) doors.push(d);
  distanceField(G.zField, src);
  distanceField(doorField, doors);
  for (let k = 0; k < W * H; k++) G.zField[k] = Math.min(G.zField[k], doorField[k] + DOOR_SCENT);
}

function spark() {
  const cand = G.blocks.filter(b => b.pop > 200 && !b.fallen && b.bx + b.bz > 2);
  if (!cand.length) return;
  const b = cand[Math.floor(G.rnd() * cand.length)];
  outbreak(b, 8);
  say(`New outbreak in ${b.name}. Someone brought it home.`, 'bad');
}

function updateBlock(b: Block, dt: number) {
  if (b.pop <= 0) return;
  if (!b.evacuating && G.t - b.lastPanicCheck > 1) {
    b.lastPanicCheck = G.t;
    for (const d of b.doors) {
      if (zHash.nearest(ci(d) + 0.5, cj(d) + 0.5, 6, z => z.hp > 0)) {
        b.evacuating = true;
        if (b.pop >= 300 && G.t > panicSaid) { panicSaid = G.t + 8; say(`Panic in ${b.name}: residents are running for the evacuation points.`, 'bad'); }
        break;
      }
    }
  }
  if (!b.evacuating || G.civs.length >= MAX_CIVS) return;
  b.emitT -= dt;
  if (b.emitT > 0) return;
  b.emitT = EMIT_EVERY;
  // leave by the door nearest an evacuation point that has no infected outside it
  let door = -1;
  for (const d of b.doors) {
    if (G.eField[d] >= INF || zHash.nearest(ci(d) + 0.5, cj(d) + 0.5, 3, z => z.hp > 0)) continue;
    if (door < 0 || G.eField[d] < G.eField[door]) door = d;
  }
  if (door < 0) return; // nowhere safe to run to: they stay behind their doors
  spawnCiv(ci(door) + 0.2 + G.rnd() * 0.6, cj(door) + 0.2 + G.rnd() * 0.6);
  b.pop -= PER_AGENT;
}

function updateCiv(c: Civ, dt: number) {
  const here = G.eField[cellOf(c.x, c.z)];
  if (here <= 1) {
    let best: Evac | null = null, bd = INF;
    for (const e of G.evacs) { const d = dist2(e.x, e.z, c.x, c.z); if (d < bd) { bd = d; best = e; } }
    if (best && bd < 9) { best.queue += PER_AGENT; c.gone = true; return; }
  }
  // shy away from infected close by, otherwise head for the nearest evacuation point
  const z = zHash.nearest(c.x, c.z, 2.2, z => z.hp > 0 && z.rise <= 0);
  if (z) { stepToward(c, c.x * 2 - z.x, c.z * 2 - z.z, c.sp * dt); return; }
  const next = downhill(G.eField, c.x, c.z);
  if (!next) return;
  const j = Math.sin(c.ph) * 0.3;
  stepToward(c, next[0] + j, next[1] - j, c.sp * dt);
}

function updateZed(z: Zed, dt: number) {
  if (z.rise > 0) { z.rise -= dt; return; }
  z.cd -= dt;
  // bite anyone within reach
  if (z.cd <= 0) {
    const v = cHash.nearest(z.x, z.z, 0.75, c => !c.gone);
    if (v) {
      v.gone = true; G.stats.dead += PER_AGENT; spawnZed(v.x, v.z); z.cd = 0.9; return;
    }
    for (const u of G.units) {
      if (dist2(u.x, u.z, z.x, z.z) > 9) continue;
      const m = u.members.find(m => m.hp > 0 && dist2(m.x, m.z, z.x, z.z) < (UNITS[u.kind].vehicle ? 1.1 : 0.6));
      if (m) {
        m.hp -= 1; z.cd = 1.0;
        if (m.hp <= 0 && !UNITS[u.kind].vehicle && G.rnd() < 0.5) spawnZed(m.x, m.z); // the fallen get back up
        return;
      }
    }
    const b = G.doorOf[cellOf(z.x, z.z)];
    if (b >= 0 && G.blocks[b].pop > 0) {
      const blk = G.blocks[b];
      blk.evacuating = true;
      // the doors hold for a while; once they give, people inside are caught a few at a time
      if (blk.breach < BREACH) { blk.breach += 1; z.cd = 1; return; }
      z.cd = 1;
      if (G.t < blk.convertT) return;
      blk.convertT = G.t + CONVERT_EVERY;
      blk.pop -= PER_AGENT; G.stats.dead += PER_AGENT;
      spawnZed(z.x + (G.rnd() - 0.5), z.z + (G.rnd() - 0.5));
      if (blk.pop <= 0 && !blk.fallen) { blk.fallen = true; G.changed = true; say(`${blk.name} has been overrun.`, 'bad'); }
      return;
    }
    for (const e of G.evacs) {
      if (e.queue > 0 && dist2(e.x, e.z, z.x, z.z) < 4) {
        z.cd = 0.9;
        if (G.t < e.biteT) return;
        e.biteT = G.t + 0.8;
        e.queue -= PER_AGENT; G.stats.dead += PER_AGENT; spawnZed(z.x, z.z);
        if (G.rnd() < 0.08) say(`The infected are among the crowd at ${e.kind === 'harbor' ? 'the harbour' : 'a bus stop'}.`, 'bad');
        return;
      }
    }
  }
  if (z.cd > 0.5) return; // still busy with the last bite
  const f = G.zField[cellOf(z.x, z.z)], sp = z.sp * G.zedSpeed * dt;
  if (f < AGGRO) {
    const next = downhill(G.zField, z.x, z.z);
    if (next) {
      const j = Math.sin(z.ph + G.t * 0.7) * 0.35;
      stepToward(z, next[0] + j, next[1] + Math.cos(z.ph) * 0.35, sp);
    } else {
      // standing on a target cell: close in on whatever is there
      const v = cHash.nearest(z.x, z.z, 2, c => !c.gone);
      if (v) stepToward(z, v.x, v.z, sp);
      else for (const u of G.units) if (dist2(u.x, u.z, z.x, z.z) < 4) { stepToward(z, u.x, u.z, sp); break; }
    }
  } else {
    // nothing in reach: shamble about
    if (dist2(z.x, z.z, z.wx, z.wz) < 0.3 || G.rnd() < dt * 0.1) {
      z.wx = z.x + (G.rnd() - 0.5) * 6; z.wz = z.z + (G.rnd() - 0.5) * 6;
    }
    stepToward(z, z.wx, z.wz, sp * 0.5);
  }
}

function hitZed(z: Zed, dmg: number, u: Unit | null) {
  if (z.hp <= 0) return;
  z.hp -= dmg;
  if (z.hp <= 0) { G.stats.killed++; G.funds += 3; if (u) u.kills++; }
}

function updateUnit(u: Unit, dt: number) {
  const s = UNITS[u.kind];
  if (u.goal >= 0 && u.field) {
    if (u.field[cellOf(u.x, u.z)] === 0) { u.goal = -1; u.field = null; }
    else {
      const next = downhill(u.field, u.x, u.z);
      if (next) stepToward(u, next[0], next[1], s.speed * dt);
      else { u.goal = -1; u.field = null; }
    }
  }
  for (const m of u.members) {
    const tx = u.x + m.ox, tz = u.z + m.oz;
    const gx = walkableAt(tx, tz) ? tx : u.x, gz = walkableAt(tx, tz) ? tz : u.z;
    m.x += (gx - m.x) * Math.min(1, dt * 8); m.z += (gz - m.z) * Math.min(1, dt * 8);
    m.cd -= dt;
    if (m.cd > 0) continue;
    const target = zHash.nearest(m.x, m.z, s.range, z => z.hp > 0);
    if (!target) { m.cd = 0.25; continue; }
    m.cd = s.rof * (0.85 + G.rnd() * 0.3);
    m.hd = Math.atan2(target.x - m.x, target.z - m.z);
    if (s.vehicle) { u.aim = { x: target.x, z: target.z }; if (u.goal < 0) u.hd = m.hd; }
    const hit = G.rnd() < s.acc;
    const tx2 = hit ? target.x : target.x + (G.rnd() - 0.5) * 1.5, tz2 = hit ? target.z : target.z + (G.rnd() - 0.5) * 1.5;
    G.tracers.push({ x1: m.x, z1: m.z, y1: s.vehicle ? 0.9 : 0.55, x2: tx2, z2: tz2, t: u.kind === 'tank' ? 0.25 : 0.08, color: u.kind === 'militia' ? 0xffd27a : 0xfff0b0 });
    if (s.splash) {
      G.booms.push({ x: tx2, z: tz2, t: 0.5, size: 1.2 });
      zHash.near(tx2, tz2, s.splash, z => { hitZed(z, s.dmg, u); });
    } else if (hit) hitZed(target, s.dmg, u);
  }
}

function updateStrike(s: Strike, dt: number) {
  s.t -= dt;
  if (s.t > 0 || !s.bombs) return;
  for (let k = 0; k < s.bombs; k++) {
    const o = (k - (s.bombs - 1) / 2) * 1.7, x = s.x + Math.cos(s.dir) * o, z = s.z + Math.sin(s.dir) * o;
    G.booms.push({ x, z, t: 0.9 + k * 0.05, size: 2.6 });
    zHash.near(x, z, 2.4, zd => { hitZed(zd, 99, null); });
    cHash.near(x, z, 2.4, c => { if (!c.gone) { c.gone = true; G.stats.dead += PER_AGENT; } });
    for (const u of G.units) for (const m of u.members) if (dist2(m.x, m.z, x, z) < 2.4 * 2.4) m.hp -= UNITS[u.kind].vehicle ? 20 : 4;
  }
  // buildings on the line take casualties too
  for (const b of G.blocks) {
    if (b.pop <= 0 || dist2(b.x0 + 3, b.z0 + 3, s.x, s.z) > 30) continue;
    const lost = Math.round(b.pop * 0.15 / PER_AGENT) * PER_AGENT;
    if (lost > 0) { b.pop -= lost; G.stats.dead += lost; say(`The air strike killed ${lost} people in ${b.name}.`, 'bad'); }
  }
  s.bombs = 0;
}

function updateGunship(g: Gunship, dt: number) {
  g.t -= dt;
  g.ang += dt * 0.55;
  g.hx = g.x + Math.cos(g.ang) * 5; g.hz = g.z + Math.sin(g.ang) * 5;
  g.cd -= dt;
  if (g.cd > 0) return;
  const target = zHash.nearest(g.hx, g.hz, 11, z => z.hp > 0);
  if (!target) { g.cd = 0.3; return; }
  g.cd = 0.1;
  const hit = G.rnd() < 0.8;
  G.tracers.push({ x1: g.hx, z1: g.hz, y1: 6, x2: target.x, z2: target.z, t: 0.07, color: 0xffe08a });
  if (hit) hitZed(target, 2, null);
}

function updateEvac(e: Evac, dt: number) {
  e.timer -= dt;
  if (e.timer > 0) return;
  e.timer = e.interval;
  const take = Math.min(e.queue, e.cap);
  if (take <= 0) return;
  e.queue -= take; e.departed++;
  G.stats.evacuated += take; G.funds += take * 0.6;
  if (e.kind === 'harbor') say(`A ship sails from the harbour with ${take} people aboard.`, 'good');
  else if (G.t > busSaid) { busSaid = G.t + 30; say(`Buses are running: ${take} more people on their way out.`, 'good'); }
}

function finish(why: 'time' | 'empty') {
  if (G.over) return;
  // the last ship and the last buses take one more load each; militia leave with them
  for (const e of G.evacs) { const take = Math.min(e.queue, e.cap); G.stats.evacuated += take; e.queue -= take; }
  for (const u of G.units) if (u.people > 0) G.stats.evacuated += u.people;
  const pct = (G.stats.evacuated / G.stats.total) * 100;
  const grade = pct >= 60 ? 'Saviour of the city' : pct >= 45 ? 'An orderly withdrawal' : pct >= 30 ? 'A bitter retreat' : 'Catastrophe';
  G.over = { why, pct, grade };
  say(why === 'time' ? 'The last ship has sailed.' : 'There is nobody left in the city to save.', 'key');
}
