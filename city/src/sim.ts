// The simulation: one fixed step at a time (1/20 s of game time).
// Order each step: rebuild fields and hashes, blocks emit refugees, civilians walk, units and aircraft
// fire (marking kills), the infected move and bite, ships and buses sail, then dead are cleared away.

const STEP = 1 / 20;
const BREACH = 25;        // zombie-seconds of battering before a block's doors give way
const CONVERT_EVERY = 5;  // once inside, one figure's worth of people is caught this often
const EMIT_EVERY = 2;     // an evacuating block lets one figure's worth of people out this often
const WAVE_AT = 8 * 60;   // the great horde reaches the eastern edge
const WAVE_SIZE = 220;
const APC_CAP = 60;
const fieldCache = new Map<number, Float32Array>();
const doorField = new Float32Array(W * H);
let panicSaid = 0, busSaid = 0, crowdSaid = 0; // routine messages are rationed so the log stays readable
let zFieldT = 0, unitCount: Record<UnitKind, number> = { militia: 0, infantry: 0, apc: 0, tank: 0 };

function newGame(seed: number) {
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
    sealed: false, calmUntil: 0, waveSize: WAVE_SIZE, troopsHome: 0, ordered: false, usedAbility: false, lastCall: 0, hordeTarget: -1, ace: null,
  };
  fieldCache.clear();
  zFieldT = 0; panicSaid = 0; busSaid = 0; crowdSaid = 0; barkSaid = 0; waveWarned = false;
  unitCount = { militia: 0, infantry: 0, apc: 0, tank: 0 };
  generateCity(seeded(20261027)); // the same streets every game; the outbreak and its timing vary
  G.stats.total = G.blocks.reduce((a, b) => a + b.popMax, 0);
  const hc = idx(37, 60);
  G.evacs.push({ id: G.nextId++, kind: 'harbor', x: 37.5, z: 60.5, cell: hc, queue: 0, timer: 40, interval: 40, cap: 700, departed: 0, maxQueue: 4000, full: false, biteT: 0, extra: 0 });
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
/** A new infected. The bitten lie still for a while before they rise (rise = true). Runners and brutes get commoner as the night goes on. */
function spawnZed(x: number, z: number, rise = true, kind?: ZedKind): Zed | null {
  if (G.zeds.length >= MAX_ZOMBIES) return null;
  const r = G.rnd, late = G.t / GAME_SECONDS;
  if (kind === undefined) { const k = r(); kind = k < 0.02 + late * 0.03 ? ZedKind.Brute : k < 0.08 + late * 0.1 ? ZedKind.Runner : ZedKind.Walker; }
  const hp = kind === ZedKind.Brute ? 16 : kind === ZedKind.Runner ? 1.5 : 3;
  const sp = kind === ZedKind.Brute ? 0.45 + r() * 0.15 : kind === ZedKind.Runner ? 1.6 + r() * 0.4 : 0.55 + r() * 0.45;
  const zd: Zed = { x, z, hp, cd: 0.5 + r(), sp, ph: r() * 100, hd: r() * 6, shirt: kind === ZedKind.Runner ? 0x9a3328 : SHIRTS[Math.floor(r() * SHIRTS.length)], wx: x, wz: z, rise: rise ? 10 + r() * 8 : 0, kind, march: false };
  G.zeds.push(zd);
  return zd;
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
    members, goal: -1, field: null, aim: null, kills: 0, people: kind === 'militia' ? s.members * PER_AGENT : 0, cargo: 0, loadT: 0,
    ab: 0, lureT: 0, rank: 0, quietT: 99, barkT: 0, vip: 0,
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
    G.evacs.push({ id: G.nextId++, kind: 'bus', x: ci(c) + 0.5, z: cj(c) + 0.5, cell: c, queue: 0, timer: 10, interval: 10, cap: 70, departed: 0, maxQueue: 350, full: false, biteT: 0, extra: 0 });
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
  b.evacuating = true; G.ordered = true;
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
  updateWave();
  updateMissions(dt);
  updateDecisions();
  updateHqOrders();
  updateLastCall();
  G.shake = Math.max(0, G.shake - dt * 2);
  for (const b of G.blocks) updateBlock(b, dt);
  for (const c of G.civs) if (!c.gone) updateCiv(c, dt);
  for (const u of G.units) updateUnit(u, dt);
  for (const s of G.strikes) updateStrike(s, dt);
  for (const g of G.gunships) updateGunship(g, dt);
  updateShells(dt);
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
    if (before > u.members.length && u.members.length) {
      const half = UNITS[u.kind].members / 2;
      if (u.members.length <= half && before > half) bark(u, "We're being overrun! Need support!", 'bad', true);
      else bark(u, 'Man down!', 'bad');
    }
    if (before && !u.members.length) {
      G.stats.unitsLost++; say(`${u.name}${u.rank ? `, ${RANKS[u.rank].name.toLowerCase()}s with ${u.kills} kills,` : ''} has been wiped out.`, 'bad');
      G.pops.push({ x: u.x, z: u.z, text: `${u.name} lost`, kind: 'bad' });
      const vm = G.missions.find(m => m.kind === 'vip' && m.carrier === u.id);
      if (vm) { vm.t = -1; say(`The VIP was with ${u.name}, and is lost.`, 'bad'); }
      if (u.cargo) { G.stats.dead += u.cargo; say(`${u.cargo} civilians aboard ${u.name} were lost with it.`, 'bad'); u.cargo = 0; }
      if (UNITS[u.kind].vehicle) G.sfx.push({ k: 'boom', x: u.x, z: u.z });
    }
  }
  G.units = G.units.filter(u => u.members.length);
  for (const t of G.tracers) t.t -= dt;
  G.tracers = G.tracers.filter(t => t.t > 0);
  for (const b of G.booms) b.t -= dt;
  G.booms = G.booms.filter(b => b.t > 0);
  if (G.sfx.length > 300) G.sfx.splice(0, G.sfx.length - 300); // nobody is listening (tests)
  if (G.pops.length > 60) G.pops.splice(0, G.pops.length - 60);

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
  for (const m of G.missions) if (m.kind === 'survivors' || (m.kind === 'vip' && !m.carrier)) src.push(cellOf(m.x, m.z));
  for (const b of G.blocks) if (b.pop > 0) for (const d of b.doors) doors.push(d);
  distanceField(G.zField, src);
  distanceField(doorField, doors);
  for (let k = 0; k < W * H; k++) G.zField[k] = Math.min(G.zField[k], doorField[k] + DOOR_SCENT);
  // an APC's flare and siren outshout everything else in a wide radius
  const lures = G.units.filter(u => u.lureT > 0).map(u => cellOf(u.x, u.z));
  if (lures.length) {
    distanceField(doorField, lures);
    for (let k = 0; k < W * H; k++) G.zField[k] = Math.min(G.zField[k], doorField[k] - LURE_PULL);
  }
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
  if (!b.evacuating && G.t - b.lastPanicCheck > 1 && G.t >= G.calmUntil) {
    b.lastPanicCheck = G.t;
    for (const d of b.doors) {
      if (zHash.nearest(ci(d) + 0.5, cj(d) + 0.5, 6, z => z.hp > 0)) {
        b.evacuating = true;
        if (b.pop >= 300 && G.t > panicSaid) { panicSaid = G.t + 8; say(`Panic in ${b.name}: residents are running for the evacuation points.`, 'bad'); }
        break;
      }
    }
  }
  if (!b.evacuating || G.civs.length >= MAX_CIVS || (G.sealed && b.bx >= 7)) return;
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
    for (const ms of G.missions) {
      if ((ms.kind !== 'survivors' && (ms.kind !== 'vip' || ms.carrier > 0)) || ms.people <= 0 || dist2(ms.x, ms.z, z.x, z.z) > 1.4) continue;
      z.cd = 0.9;
      if (G.t < ms.biteT) return;
      ms.biteT = G.t + 1; ms.people -= PER_AGENT; G.stats.dead += PER_AGENT; spawnZed(z.x, z.z);
      return;
    }
    for (const u of G.units) {
      if (dist2(u.x, u.z, z.x, z.z) > 9) continue;
      const m = u.members.find(m => m.hp > 0 && dist2(m.x, m.z, z.x, z.z) < (UNITS[u.kind].vehicle ? 1.1 : 0.6));
      if (m) {
        m.hp -= z.kind === ZedKind.Brute ? (UNITS[u.kind].vehicle ? 5 : 2) : 1; z.cd = 1.0;
        if (z.kind === ZedKind.Brute && UNITS[u.kind].vehicle) G.sfx.push({ k: 'crunch', x: z.x, z: z.z });
        if (m.hp <= 0 && !UNITS[u.kind].vehicle && G.rnd() < 0.5) spawnZed(m.x, m.z); // the fallen get back up
        return;
      }
    }
    const b = G.doorOf[cellOf(z.x, z.z)];
    if (b >= 0 && G.blocks[b].pop > 0) {
      const blk = G.blocks[b];
      blk.evacuating = true;
      // the doors hold for a while; once they give, people inside are caught a few at a time
      if (blk.breach < BREACH) { blk.breach += z.kind === ZedKind.Brute ? 6 : 1; z.cd = 1; if (z.kind === ZedKind.Brute) G.sfx.push({ k: 'crunch', x: z.x, z: z.z }); return; }
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
        if (G.t > crowdSaid) { crowdSaid = G.t + 20; say(`The infected are among the crowd at ${e.kind === 'harbor' ? 'the harbour' : 'a bus stop'}.`, 'bad'); }
        return;
      }
    }
  }
  if (z.cd > 0.5) return; // still busy with the last bite
  const f = G.zField[cellOf(z.x, z.z)], sp = z.sp * G.zedSpeed * dt;
  if (f < AGGRO + (z.kind === ZedKind.Runner ? 8 : 0)) {
    z.march = false;
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
  } else if (z.march) {
    // the great horde pours along the streets toward the heart of the city
    const next = downhill(fieldTo(G.hordeTarget >= 0 ? G.hordeTarget : CITY_HEART), z.x, z.z);
    if (next) stepToward(z, next[0] + Math.sin(z.ph) * 0.4, next[1] + Math.cos(z.ph) * 0.4, sp * 0.9);
    else z.march = false;
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
  if (z.hp <= 0) {
    G.stats.killed++; G.funds += 3;
    if (u) {
      u.kills++;
      if (u.rank < RANKS.length - 1 && u.kills >= RANKS[u.rank + 1].kills) promote(u);
      if (!G.ace || u.kills > G.ace.kills) G.ace = { name: u.name, kills: u.kills, rank: u.rank };
    }
  }
}

function promote(u: Unit) {
  u.rank++;
  const r = RANKS[u.rank].name;
  say(`${u.name} ${'★'.repeat(u.rank)} ${r.toLowerCase()} after ${u.kills} kills: sharper shooting, faster ${ABILITY[u.kind].name.toLowerCase()}.`, 'good');
  G.pops.push({ x: u.x, z: u.z, text: `${'★'.repeat(u.rank)} ${r}`, kind: 'key' });
  G.sfx.push({ k: 'rank', x: u.x, z: u.z });
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
  if (u.kind === 'apc' && u.goal < 0) apcCargo(u, dt);
  u.ab = Math.max(0, u.ab - dt);
  if (u.lureT > 0) { u.lureT -= dt; if (u.lureT <= 0) zFieldT = 0; else if (Math.floor(u.lureT / 1.5) !== Math.floor((u.lureT + dt) / 1.5)) G.sfx.push({ k: 'siren', x: u.x, z: u.z }); }
  const quiet = u.quietT;
  u.quietT += dt;
  const acc = Math.min(0.97, s.acc + u.rank * 0.08), rof = s.rof * (1 - u.rank * 0.15);
  for (const m of u.members) {
    const tx = u.x + m.ox, tz = u.z + m.oz;
    const gx = walkableAt(tx, tz) ? tx : u.x, gz = walkableAt(tx, tz) ? tz : u.z;
    m.x += (gx - m.x) * Math.min(1, dt * 8); m.z += (gz - m.z) * Math.min(1, dt * 8);
    m.cd -= dt;
    if (m.cd > 0) continue;
    const target = zHash.nearest(m.x, m.z, s.range, z => z.hp > 0);
    if (!target) { m.cd = 0.25; continue; }
    m.cd = rof * (0.85 + G.rnd() * 0.3);
    m.hd = Math.atan2(target.x - m.x, target.z - m.z);
    if (s.vehicle) { u.aim = { x: target.x, z: target.z }; if (u.goal < 0) u.hd = m.hd; }
    if (quiet > 15 && u.quietT > 0) bark(u, contactLine(u, target), 'say');
    u.quietT = 0;
    const hit = G.rnd() < acc;
    const tx2 = hit ? target.x : target.x + (G.rnd() - 0.5) * 1.5, tz2 = hit ? target.z : target.z + (G.rnd() - 0.5) * 1.5;
    G.sfx.push({ k: u.kind === 'tank' ? 'cannon' : u.kind === 'apc' ? 'mg' : 'shot', x: m.x, z: m.z });
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
    G.sfx.push({ k: 'boom', x, z });
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
  G.shake = 1;
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
  G.sfx.push({ k: 'mg', x: g.hx, z: g.hz });
  G.tracers.push({ x1: g.hx, z1: g.hz, y1: 6, x2: target.x, z2: target.z, t: 0.07, color: 0xffe08a });
  if (hit) hitZed(target, 2, null);
}

function updateEvac(e: Evac, dt: number) {
  e.timer -= dt;
  if (e.timer > 0) return;
  e.timer = e.interval;
  const take = Math.min(e.queue, e.cap + e.extra);
  if (take <= 0) return;
  const ferry = Math.max(0, take - e.cap);
  e.extra -= ferry;
  e.queue -= take; e.departed++;
  G.stats.evacuated += take; G.funds += take * 0.6;
  G.pops.push({ x: e.x, z: e.z, text: `+${take} saved`, kind: 'good' });
  if (e.kind === 'harbor') { say(`A ship sails from the harbour with ${take} people aboard${ferry ? `, ${ferry} of them on the Marguerite` : ''}.`, 'good'); G.sfx.push({ k: 'horn', x: e.x, z: e.z }); }
  else if (G.t > busSaid) { busSaid = G.t + 30; say(`Buses are running: ${take} more people on their way out.`, 'good'); }
}

function finish(why: 'time' | 'empty') {
  if (G.over) return;
  // the last ship and the last buses take one more load each; militia leave with them
  for (const e of G.evacs) { const take = Math.min(e.queue, e.cap + e.extra); G.stats.evacuated += take; e.queue -= take; }
  for (const u of G.units) if (u.people > 0) G.stats.evacuated += u.people;
  // troops who made it back to the quay sail with the last ship, and so do people aboard APCs there
  const harbour = G.evacs[0];
  for (const u of G.units) {
    if (dist2(u.x, u.z, harbour.x, harbour.z) > 12 * 12) continue;
    if (u.kind !== 'militia') G.troopsHome += UNITS[u.kind].vehicle ? 1 : u.members.length;
    if (u.cargo) { G.stats.evacuated += u.cargo; G.stats.ferried += u.cargo; u.cargo = 0; }
  }
  for (const m of G.missions) if (m.kind === 'survivors') G.stats.dead += m.people; // nobody reached them
  G.missions = [];
  const pct = (G.stats.evacuated / G.stats.total) * 100;
  const grade = pct >= 60 ? 'Saviour of the city' : pct >= 45 ? 'An orderly withdrawal' : pct >= 30 ? 'A bitter retreat' : 'Catastrophe';
  G.over = { why, pct, grade };
  say(why === 'time' ? 'The last ship has sailed.' : 'There is nobody left in the city to save.', 'key');
}

// ---- APC rescues ----

/** A parked APC beside a populated block takes people aboard; beside an evacuation point it lets them off. */
function apcCargo(u: Unit, dt: number) {
  u.loadT -= dt;
  if (u.loadT > 0) return;
  u.loadT = 0.5;
  if (u.cargo > 0) {
    for (const e of G.evacs) if (dist2(e.x, e.z, u.x, u.z) < 12) {
      e.queue += u.cargo; G.stats.ferried += u.cargo;
      say(`${u.name} drops ${u.cargo} people at ${e.kind === 'harbor' ? 'the harbour' : 'the evacuation point'}.`, 'good');
      G.sfx.push({ k: 'chime', x: u.x, z: u.z });
      u.cargo = 0;
      return;
    }
  }
  if (u.cargo >= APC_CAP) return;
  const i0 = Math.floor(u.x), j0 = Math.floor(u.z);
  for (let j = j0 - 2; j <= j0 + 2; j++) for (let i = i0 - 2; i <= i0 + 2; i++) {
    if (!inside(i, j)) continue;
    const b = G.doorOf[idx(i, j)];
    if (b < 0 || G.blocks[b].pop <= 0) continue;
    const blk = G.blocks[b], take = Math.min(PER_AGENT, blk.pop, APC_CAP - u.cargo);
    blk.pop -= take; u.cargo += take;
    if (u.cargo >= APC_CAP) say(`${u.name} is full: ${u.cargo} people aboard. Drive them to an evacuation point.`, 'key');
    return;
  }
}

/** Send APCs to the door of a block nearest to them, to load people. */
function sendToBlock(units: Unit[], b: Block) {
  for (const u of units) {
    let best = -1, bd = INF;
    for (const d of b.doors) { const dd = dist2(ci(d) + 0.5, cj(d) + 0.5, u.x, u.z); if (dd < bd) { bd = dd; best = d; } }
    if (best >= 0) sendUnit(u, best);
  }
}

// ---- missions ----

const VIPS = ["Dr Ilse Varga, St Brennan's chief epidemiologist", 'Harbourmaster Tom Reddin', 'Councillor Ada Moreland, who holds the ferry contracts', 'Professor Joel Hask, with samples of the infection'];

function updateMissions(dt: number) {
  G.nextMission -= dt;
  if (G.nextMission <= 0 && G.missions.length < 2 && G.t < GAME_SECONDS - 75) {
    G.nextMission = 55 + G.rnd() * 25;
    spawnMission();
  }
  for (const m of G.missions) {
    m.t -= dt;
    if (m.kind === 'hold') { updateHold(m, dt); continue; }
    if (m.kind === 'vip' && m.carrier) { updateVip(m); continue; }
    const u = G.units.find(u => u.members.some(mb => dist2(mb.x, mb.z, m.x, m.z) < 2.6));
    if (u && (m.kind === 'crate' || m.people > 0)) {
      if (m.kind === 'crate') {
        G.funds += m.reward;
        say(`${u.name} recovers the supply drop: $${m.reward}.`, 'good');
        G.pops.push({ x: m.x, z: m.z, text: `+$${m.reward}`, kind: 'money' });
      } else if (m.kind === 'vip') {
        // the VIP rides with the unit; the mission moves to the harbour, where they must be taken
        const h = G.evacs[0];
        m.carrier = u.id; u.vip = m.id; m.people = 0;
        m.id = G.nextId++; m.x = h.x; m.z = h.z - 2.5; m.t = 9999;
        say(`${u.name} has ${m.who}. Bring them to the harbour or Fort Aldermoor.`, 'key');
        bark(u, 'We have the VIP. Moving!', 'say', true);
        G.sfx.push({ k: 'chime', x: u.x, z: u.z });
        continue;
      } else {
        let walk = m.people;
        if (u.kind === 'apc') { const take = Math.min(walk, APC_CAP - u.cargo); u.cargo += take; walk -= take; }
        for (let k = 0; k < walk / PER_AGENT; k++) spawnCiv(m.x + (G.rnd() - 0.5) * 1.2, m.z + (G.rnd() - 0.5) * 1.2);
        G.funds += m.reward;
        say(`${u.name} reaches the survivors: ${m.people} people${walk < m.people ? ' climb aboard' : ' head for the evacuation points'}. $${m.reward}.`, 'good');
        G.pops.push({ x: m.x, z: m.z, text: `${m.people} rescued · +$${m.reward}`, kind: 'good' });
        m.people = 0;
      }
      G.sfx.push({ k: 'chime', x: m.x, z: m.z });
      G.stats.missions++;
      m.t = -1; m.kind = 'crate'; // done
      continue;
    }
    if ((m.kind === 'survivors' || m.kind === 'vip') && m.people <= 0 && m.t > 0) {
      say(m.kind === 'vip' ? `The infected reached ${m.who} first.` : 'The survivors were overrun before help arrived.', 'bad');
      m.t = -1; m.kind = 'crate';
    }
  }
  for (const m of G.missions) if (m.t <= 0 && m.t > -1) {
    if (m.kind === 'survivors') { G.stats.dead += m.people; say(`No one reached the survivors in time. ${m.people} people are lost.`, 'bad'); }
    else if (m.kind === 'vip') say(`No one reached ${m.who} in time.`, 'bad');
    else if (m.kind === 'hold') say(`No one held ${G.blocks[m.block].name}. Its residents are on their own.`, 'bad');
    else say('The supply drop was lost to looters.');
  }
  G.missions = G.missions.filter(m => m.t > 0);
}

/** Hold: keep any unit beside the block until the clock fills; the residents arm themselves in thanks. */
function updateHold(m: Mission, dt: number) {
  const b = G.blocks[m.block];
  if (b.pop <= 0) { say(`${b.name} fell before it could be held.`, 'bad'); m.t = -1; return; }
  m.people = b.pop;
  if (!G.units.some(u => dist2(u.x, u.z, m.x, m.z) < 6.5 * 6.5)) return;
  m.prog += dt;
  if (m.prog < m.need) return;
  G.funds += m.reward; G.stats.missions++;
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
function updateVip(m: Mission) {
  const u = G.units.find(x => x.id === m.carrier);
  if (!u) { m.t = -1; return; }
  const h = G.evacs[0];
  if (dist2(u.x, u.z, h.x, h.z) > 7 * 7 && dist2(u.x, u.z, ci(G.hq) + 0.5, cj(G.hq) + 0.5) > 8 * 8) return;
  h.extra += 400; G.funds += m.reward; G.stats.missions++; u.vip = 0;
  say(`${m.who} is safe. In return the navy adds 400 places to the coming sailings from the harbour. $${m.reward}.`, 'good');
  G.pops.push({ x: u.x, z: u.z, text: `VIP safe · +$${m.reward}`, kind: 'good' });
  G.sfx.push({ k: 'chime', x: u.x, z: u.z });
  m.t = -1;
}

function spawnMission() {
  const r = G.rnd();
  if (r < 0.15 && spawnHold()) return;
  const kind: Mission['kind'] = r < 0.3 ? 'vip' : r < 0.68 ? 'survivors' : 'crate';
  // somewhere on the streets, away from the fort and the evacuation points
  for (let tries = 0; tries < 60; tries++) {
    const i = 3 + Math.floor(G.rnd() * (W - 6)), j = 3 + Math.floor(G.rnd() * (QUAY_Z - 6)), c = idx(i, j);
    if (G.grid[c] !== Cell.Road) continue;
    const x = i + 0.5, z = j + 0.5;
    if (dist2(x, z, ci(G.hq), cj(G.hq)) < 200 || G.evacs.some(e => dist2(e.x, e.z, x, z) < 64)) continue;
    const near = G.blocks.reduce((a, b) => dist2(b.x0 + 3, b.z0 + 3, x, z) < dist2(a.x0 + 3, a.z0 + 3, x, z) ? b : a);
    const m: Mission = {
      id: G.nextId++, kind, x, z, t: kind === 'crate' ? 60 : 75, people: kind === 'survivors' ? 60 + Math.floor(G.rnd() * 4) * 10 : kind === 'vip' ? PER_AGENT : 0,
      reward: kind === 'survivors' ? 400 : kind === 'vip' ? 800 : 700, biteT: 0, prog: 0, need: 0, block: -1, carrier: 0, who: '',
    };
    if (kind === 'survivors') G.stats.total += m.people; // people nobody knew were there
    if (kind === 'vip') m.who = VIPS[Math.floor(G.rnd() * VIPS.length)];
    G.missions.push(m);
    say(kind === 'survivors' ? `Survivors are signalling from a rooftop near ${near.name}: ${m.people} people. Get any unit to them in 75 seconds.`
      : kind === 'vip' ? `${m.who} is trapped near ${near.name}. Reach them in 75 seconds, then bring them to the harbour or the fort.`
      : `A supply drop has come down near ${near.name}. Get any unit to it in 60 seconds for $${m.reward}.`, 'key');
    G.sfx.push({ k: 'chime', x, z });
    return;
  }
}

/** A populated block with the infected closing in asks for troops to hold its streets. */
function spawnHold(): boolean {
  const cand = G.blocks.filter(b => b.pop >= 300 && !b.fallen && b.district !== 'hospital' && !(G.sealed && b.bx >= 7) &&
    dist2(b.x0 + 3, b.z0 + 3, ci(G.hq), cj(G.hq)) > 200 && !G.missions.some(m => m.block === b.id) &&
    zHash.nearest(b.x0 + 3, b.z0 + 3, 16, z => z.hp > 0 && z.rise <= 0));
  if (!cand.length) return false;
  const b = cand[Math.floor(G.rnd() * cand.length)];
  G.missions.push({ id: G.nextId++, kind: 'hold', x: b.x0 + 3, z: b.z0 + 3, t: 90, people: b.pop, reward: 400, biteT: 0, prog: 0, need: 30, block: b.id, carrier: 0, who: '' });
  say(`${b.name} is barricading its doors as the infected close in: ${b.pop} people inside. Keep a unit beside it for 30 seconds in the next 90.`, 'key');
  G.sfx.push({ k: 'chime', x: b.x0 + 3, z: b.z0 + 3 });
  return true;
}

// ---- abilities ----

/** The thickest knot of infected within range of (x, z), with at least 3 inside radius r, avoiding civilians if asked. */
function clusterTarget(x: number, z: number, range: number, r: number, minD: number): { x: number; z: number; n: number } | null {
  const cands: Zed[] = [];
  zHash.near(x, z, range, zd => { if (zd.hp > 0 && zd.rise <= 0 && dist2(zd.x, zd.z, x, z) >= minD * minD) cands.push(zd); });
  let best: { x: number; z: number; n: number } | null = null;
  const stride = Math.max(1, Math.floor(cands.length / 40));
  for (let k = 0; k < cands.length; k += stride) {
    const c = cands[k];
    let n = 0;
    zHash.near(c.x, c.z, r, zd => { if (zd.hp > 0) n++; });
    if (n < 3 || (best && n <= best.n)) continue;
    if (cHash.nearest(c.x, c.z, r + 0.6, cv => !cv.gone)) continue;
    if (G.evacs.some(e => e.queue > 0 && dist2(e.x, e.z, c.x, c.z) < (r + 2.5) ** 2)) continue;
    if (G.missions.some(m => (m.kind === 'survivors' || (m.kind === 'vip' && !m.carrier)) && m.people > 0 && dist2(m.x, m.z, c.x, c.z) < (r + 1.5) ** 2)) continue;
    best = { x: c.x, z: c.z, n };
  }
  return best;
}

const THROW_LINES: Record<UnitKind, string[]> = {
  militia: ['Burn them!', 'Light it up!'],
  infantry: ['Frag out!', 'Grenades!', 'Fire in the hole!'],
  apc: ['Flare up! Come and get it!', 'Siren on! Over here!'],
  tank: ['Firing for effect!', 'HE, on the way!'],
};

/** Use a unit's special ability. Returns an error message, or null when it went off. */
function useAbility(u: Unit): string | null {
  if (G.over) return 'The campaign is over.';
  const a = ABILITY[u.kind];
  if (u.ab > 0) return `${u.name}: ${a.name.toLowerCase()} ready in ${Math.ceil(u.ab)}s.`;
  if (u.kind === 'apc') {
    u.lureT = LURE_SECONDS; zFieldT = 0;
    G.sfx.push({ k: 'siren', x: u.x, z: u.z });
  } else {
    const tank = u.kind === 'tank', tgt = clusterTarget(u.x, u.z, a.range, a.r, tank ? 3 : 2);
    if (!tgt) return `${u.name}: no clear target. ${a.name} need at least 3 infected together within ${a.range} cells, away from civilians.`;
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

function updateShells(dt: number) {
  for (const s of G.shells) {
    s.t -= dt;
    if (s.t > 0) continue;
    const u = G.units.find(x => x.id === s.unit) ?? null;
    G.booms.push({ x: s.x, z: s.z, t: s.big ? 0.9 : 0.5, size: s.big ? 2.6 : 1.6 });
    G.sfx.push({ k: 'boom', x: s.x, z: s.z });
    zHash.near(s.x, s.z, s.r, zd => { hitZed(zd, s.dmg, u); });
    cHash.near(s.x, s.z, s.r * 0.7, c => { if (!c.gone) { c.gone = true; G.stats.dead += PER_AGENT; } });
  }
  G.shells = G.shells.filter(s => s.t > 0);
}

/** What it costs to bring a unit back to full strength: 60% of the price of what was lost. */
function reinforceCost(u: Unit): number {
  const s = UNITS[u.kind];
  if (u.kind === 'militia') return 0;
  const missing = s.members * s.hp - u.members.reduce((a, m) => a + Math.max(0, m.hp), 0);
  return missing <= 0 ? 0 : Math.max(10, Math.ceil(missing * s.cost / (s.members * s.hp) * 0.6 / 5) * 5);
}

/** Units refit at Fort Aldermoor or beside an evacuation point. */
function nearSupply(u: Unit): boolean {
  return dist2(u.x, u.z, ci(G.hq) + 0.5, cj(G.hq) + 0.5) < 9 * 9 || G.evacs.some(e => dist2(e.x, e.z, u.x, u.z) < (e.kind === 'harbor' ? 8 : 6) ** 2);
}

/** Refill a squad's ranks and patch up its wounded or its vehicle, keeping its rank. */
function reinforce(u: Unit): string | null {
  if (G.over) return 'The campaign is over.';
  if (u.kind === 'militia') return 'Militia are volunteers: there is no one to reinforce them with.';
  const cost = reinforceCost(u);
  if (!cost) return `${u.name} is at full strength.`;
  if (!nearSupply(u)) return `Bring ${u.name} to Fort Aldermoor or an evacuation point to reinforce.`;
  if (zHash.nearest(u.x, u.z, 5, z => z.hp > 0 && z.rise <= 0)) return `${u.name} is in contact. Pull back first.`;
  if (G.funds < cost) return `Needs $${cost}. You have $${Math.floor(G.funds)}.`;
  const s = UNITS[u.kind];
  for (const m of u.members) m.hp = m.maxHp;
  for (let k = u.members.length; k < s.members; k++) {
    const a = (k / s.members) * Math.PI * 2, r = s.members > 1 ? s.spread * (k % 2 ? 1 : 0.6) : 0;
    u.members.push({ hp: s.hp, maxHp: s.hp, ox: Math.cos(a) * r, oz: Math.sin(a) * r, cd: s.rof, x: u.x, z: u.z, hd: 0 });
  }
  G.funds -= cost; G.stats.spent += cost;
  say(`${u.name} ${s.vehicle ? 'repaired' : 'back to full strength'}: $${cost}.`);
  G.pops.push({ x: u.x, z: u.z, text: s.vehicle ? 'Repaired' : 'Reinforced', kind: 'good' });
  G.sfx.push({ k: 'chime', x: u.x, z: u.z });
  return null;
}

// ---- barks: short lines from the units, over their heads and now and then in the log ----

let barkSaid = 0;
function bark(u: Unit, text: string, kind: 'say' | 'bad', loud = false) {
  if (G.t < u.barkT && !loud) return;
  u.barkT = G.t + 12;
  G.pops.push({ x: u.x, z: u.z, text, kind: kind === 'bad' ? 'bad' : 'say' });
  if (loud && kind === 'say') return; // abilities and pick-ups are already plain to see
  if (G.t < barkSaid && kind !== 'bad') return;
  barkSaid = G.t + 10;
  say(`${u.name}: “${text}”`, kind === 'bad' ? 'bad' : '');
}

const COMPASS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
function contactLine(u: Unit, z: Zed): string {
  const dir = COMPASS[(Math.round(Math.atan2(z.x - u.x, z.z - u.z) / (Math.PI / 4)) + 8) % 8];
  const lines = UNITS[u.kind].vehicle ? [`Targets ${dir}, engaging!`, `Contact ${dir}!`] : [`Contact ${dir}!`, `Movement to the ${dir}!`, `Infected, ${dir} side!`, 'Here they come!'];
  return lines[(u.id + u.kills) % lines.length];
}

// ---- first orders from HQ ----

const HQ_ORDERS: Array<Omit<HqOrder, 'done'>> = [
  { id: 'bus', text: 'Open a bus evacuation point near people (key 1)', reward: 150 },
  { id: 'evac', text: 'Order a block to evacuate: tap it, then Evacuate', reward: 100 },
  { id: 'east', text: "Send troops toward St Brennan's Hospital in the east", reward: 150 },
  { id: 'ability', text: 'Select a squad and use its special ability (F)', reward: 100 },
];
const HOSPITAL_X = 61, HOSPITAL_Z = 21;

function updateHqOrders() {
  if (!G.hqOrders.length) return;
  if (G.t > 240) { G.hqOrders = []; return; } // after four minutes you are on your own
  for (const o of G.hqOrders) {
    if (o.done) continue;
    const ok = o.id === 'bus' ? G.evacs.some(e => e.kind === 'bus') : o.id === 'evac' ? G.ordered : o.id === 'ability' ? G.usedAbility
      : G.units.some(u => u.kind !== 'militia' && dist2(u.x, u.z, HOSPITAL_X, HOSPITAL_Z) < 15 * 15);
    if (!ok) continue;
    o.done = true; G.funds += o.reward;
    say(`HQ: ${o.text.replace(/ \(.*\)$|:.*$/, '').toLowerCase()}: done. $${o.reward}.`, 'good');
    G.sfx.push({ k: 'chime', x: V_CENTRE_X, z: V_CENTRE_Z });
  }
  if (G.hqOrders.every(o => o.done)) { G.hqOrders = []; say("HQ: good start. From here on, it's your call.", 'key'); }
}
const V_CENTRE_X = 37, V_CENTRE_Z = 30;

// ---- decisions ----

const DECISION_TIMES = [{ id: 'broadcast', at: 70 }, { id: 'volunteers', at: 200 }, { id: 'ferry', at: 290 }, { id: 'bridges', at: 400 }];

function updateDecisions() {
  if (G.decision) {
    // the page pauses while a decision is open; only an unattended game (the tests) gets here
    if (G.t >= G.decision.until) { say(`No answer from command: ${G.decision.title.toLowerCase()} goes by.`); G.decision = null; }
    return;
  }
  const next = G.decisions[0];
  if (!next || G.t < next.at || G.over) return;
  G.decisions.shift();
  G.decision = makeDecision(next.id);
  if (G.decision) G.sfx.push({ k: 'chime', x: V_CENTRE_X, z: V_CENTRE_Z });
}

function eastPeople() { return G.blocks.filter(b => b.bx >= 7).reduce((a, b) => a + b.pop, 0); }

function makeDecision(id: string): Decision | null {
  const until = G.t + 30;
  switch (id) {
    case 'broadcast': return {
      id, until, title: 'Radio Calder', text: 'The city radio station is still on the air. The announcer asks what to tell people.', opts: [
        { label: 'Stay indoors and bar the doors', note: 'For the next 2 minutes nobody panics: blocks only leave when you order them to. Quieter streets, but people sit tight even with the infected at the door.' },
        { label: 'Make for the evacuation points', note: 'Every block within 20 cells of an evacuation point starts leaving now. Busy streets and crowded stops.' },
      ] };
    case 'volunteers': return {
      id, until, title: "The dockers' union", text: 'Two hundred dock workers have gathered at the harbour gates and want to help.', opts: [
        { label: 'Arm them', note: 'Two militia companies form up on the quay, free. If they live, they sail on the last ship.' },
        { label: 'Put them on the ships', note: '120 more people join the queue at the harbour.' },
      ] };
    case 'ferry': {
      const inf = G.units.some(u => u.kind === 'infantry');
      return {
        id, until, title: 'The Marguerite', text: 'A coastal ferry has put in at the harbour and can make one run alongside the next ships. Her captain wants $1,500 up front.', opts: [
          { label: 'Pay $1,500', note: '600 extra places on the coming sailings from the harbour.', off: G.funds < 1500 ? `You have $${Math.floor(G.funds)}.` : undefined },
          { label: 'Commandeer her', note: 'Free, but an infantry squad must go aboard to keep order: the squad nearest the harbour leaves the city.', off: inf ? undefined : 'You have no infantry.' },
          { label: 'Let her go', note: 'She sails empty.' },
        ] };
    }
    case 'bridges': return {
      id, until, title: 'The river bridges', text: `Engineers have charges on the eastern bridges, and aircraft have seen a great horde on the far bank. ${fmtPeople(eastPeople())} people are still in the eastern blocks.`, opts: [
        { label: 'Blow the bridges', note: 'The great horde arrives at half strength, but nobody still in the two eastern columns of blocks can get out.' },
        { label: 'Mine the roads · $800', note: 'The great horde loses a third of its number on the way in.', off: G.funds < 800 ? `You have $${Math.floor(G.funds)}.` : undefined },
        { label: 'Keep them open', note: 'The horde comes in full strength.' },
      ] };
  }
  return null;
}

/** Answer the open decision. Returns an error message, or null. */
function choose(i: number): string | null {
  const d = G.decision;
  if (!d) return 'Nothing to decide.';
  const o = d.opts[i];
  if (!o) return 'No such option.';
  if (o.off) return o.off;
  G.decision = null;
  switch (d.id + ':' + i) {
    case 'broadcast:0': G.calmUntil = G.t + 120; say('Radio Calder: "Stay indoors. Bar your doors. Help is coming."', 'key'); break;
    case 'broadcast:1': {
      let n = 0;
      for (const b of G.blocks) if (b.pop > 0 && !b.evacuating && G.evacs.some(e => dist2(e.x, e.z, b.x0 + 3, b.z0 + 3) < 400)) { b.evacuating = true; n++; }
      say(`Radio Calder: "Make for the evacuation points." ${n} blocks are on the move.`, 'key');
      break;
    }
    case 'volunteers:0': {
      const h = G.evacs[0];
      for (const dx of [-5, 5]) spawnUnit('militia', nearestWalkable(h.x + dx, h.z - 3), -1, `Dockers' militia ${dx < 0 ? 'A' : 'B'}`);
      G.stats.total += 120;
      say("The dockers are armed: two militia companies on the quay.", 'key');
      break;
    }
    case 'volunteers:1': G.evacs[0].queue += 120; G.stats.total += 120; say('The dockers join the queue for the ships.', 'key'); break;
    case 'ferry:0': G.funds -= 1500; G.stats.spent += 1500; G.evacs[0].extra += 600; say('The Marguerite is paid and waiting: 600 more places from the harbour.', 'key'); break;
    case 'ferry:1': {
      const h = G.evacs[0], u = G.units.filter(u => u.kind === 'infantry').sort((a, b) => dist2(a.x, a.z, h.x, h.z) - dist2(b.x, b.z, h.x, h.z))[0];
      G.units = G.units.filter(x => x !== u); G.troopsHome += u.members.length;
      G.evacs[0].extra += 600;
      say(`${u.name} goes aboard the Marguerite: 600 more places from the harbour.`, 'key');
      break;
    }
    case 'bridges:0': G.sealed = true; G.waveSize = Math.round(WAVE_SIZE / 2); say(`The bridges are down. The east is cut off: ${fmtPeople(eastPeople())} people can no longer get out.`, 'bad'); G.shake = 1; G.sfx.push({ k: 'boom', x: 70, z: 25 }); break;
    case 'bridges:1': G.funds -= 800; G.stats.spent += 800; G.waveSize = Math.round(WAVE_SIZE * 2 / 3); say('Engineers are mining the eastern roads.', 'key'); break;
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
  } else if (left <= 30 && G.lastCall === 90) {
    G.lastCall = 30;
    G.alert = { text: 'Last ship: 30 seconds', until: G.t + 3 };
    G.sfx.push({ k: 'horn', x: G.evacs[0].x, z: G.evacs[0].z });
  } else if (left <= 10 && left > 0 && Math.ceil(left) < G.lastCall) {
    G.lastCall = Math.ceil(left);
    G.alert = { text: `Last ship: ${G.lastCall}`, until: G.t + 1.05 };
    G.sfx.push({ k: 'tick', x: G.evacs[0].x, z: G.evacs[0].z });
  }
}

// ---- the great horde ----

const CITY_HEART = idx(37, 30);
let waveWarned = false;
function updateWave() {
  if (G.waveAt < 0) return;
  if (G.t >= G.waveAt - 30 && !waveWarned) {
    waveWarned = true;
    G.alert = { text: 'A great horde is coming in from the east. 30 seconds.', until: G.t + 8 };
    say(`Aircraft report a great horde crossing the river to the east${G.sealed ? ', where the bridges are down' : ''}. It will reach the city in 30 seconds.`, 'bad');
    G.sfx.push({ k: 'alarm', x: 70, z: 30 });
  }
  if (G.t < G.waveAt) return;
  G.waveAt = -1;
  const roads: number[] = [];
  for (let j = 0; j < QUAY_Z; j++) for (const i of [W - 2, W - 1]) if (walkable(idx(i, j))) roads.push(idx(i, j));
  for (let k = 0; k < G.waveSize; k++) {
    const c = roads[Math.floor(G.rnd() * roads.length)], r = G.rnd();
    const zd = spawnZed(ci(c) + G.rnd(), cj(c) + G.rnd(), false, r < 0.06 ? ZedKind.Brute : r < 0.3 ? ZedKind.Runner : ZedKind.Walker);
    if (zd) zd.march = true;
  }
  // it makes for the biggest crowd in the city, or failing that the heart of it
  const crowd = G.evacs.reduce((a, e) => (e.queue > a.queue ? e : a), G.evacs[0]);
  G.hordeTarget = crowd.queue >= 300 ? crowd.cell : CITY_HEART;
  const where = crowd.queue < 300 ? 'the heart of the city' : crowd.kind === 'harbor' ? `the ${fmtPeople(crowd.queue)} people waiting at the harbour` : `the ${fmtPeople(crowd.queue)} people at a bus stop`;
  G.alert = { text: `The horde is in the city, heading for ${crowd.queue < 300 ? 'the centre' : crowd.kind === 'harbor' ? 'the harbour' : 'a bus stop'}.`, until: G.t + 5 };
  say(`The great horde is in the city: about ${G.waveSize * PER_AGENT} infected pouring in from the east, making for ${where}.`, 'bad');
}
