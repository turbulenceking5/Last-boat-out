// Plays seeded games of Last Boat to Calder: City headlessly with scripted strategies and prints the
// share of the city saved, plus any script errors. usage: node tests/city.js [games per strategy] [strategy ...]
// Tuned so doing nothing is a catastrophe (~20-25%), evacuating everything at once is capped by the
// harbour (~32%), and a steady player who opens bus points, evacuates in waves and screens the east
// with infantry reaches an orderly withdrawal (~50%).
const { chromium } = require('playwright');
const path = require('path');

const STRATS = {
  nothing: () => {},
  evacAll: (C, t) => { if (t < 1) for (const b of C.G.blocks) C.evacuateBlock(b); },
  steady: (C, t, s) => {
    const G = C.G;
    if (!s.init) { s.init = 1; for (const [x, z] of [[17, 33], [41, 9], [9, 49], [33, 49], [57, 41]]) C.order('evac', x, z, null); }
    if (t > 5 && !s.e1) { s.e1 = 1; for (const b of G.blocks) if (b.bx >= 5) C.evacuateBlock(b); }
    if (t > 90 && !s.e2) { s.e2 = 1; for (const b of G.blocks) C.evacuateBlock(b); }
    if (G.funds >= 1200 && !s.tank) { s.tank = 1; C.order('tank', 49, 25, null); }
    if (G.funds >= 300 && G.units.length < 8) C.order('infantry', [49, 41, 57, 33][G.units.length % 4], [17, 33, 41, 25][G.units.length % 4], null);
    if (G.funds >= 1000 && G.zeds.length > 300) {
      let x = 0, z = 0; for (const zd of G.zeds) { x += zd.x; z += zd.z; }
      C.order('gunship', x / G.zeds.length, z / G.zeds.length, null);
    }
  },
  // steady, plus the new verbs: chase every mission with the nearest free unit, and run APC rescues
  active: (C, t, s, steady) => {
    const G = C.G;
    if (!s.init) { s.init = 1; s.steady = {}; s.apcs = 0; s.tick = 0; }
    steady(C, t, s.steady);
    if (G.funds >= 700 && s.apcs < 2 && t > 20) { C.order('apc', 33, 49, null); s.apcs++; }
    if ((s.tick = (s.tick || 0) + 1) % 40) return;
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
    for (const m of G.missions) {
      if (G.units.some(u => u.goal >= 0 && u._mission === m.id)) continue;
      const u = G.units.filter(u => u.kind !== 'apc' && u._mission === undefined).sort((a, b) => d2(a, m) - d2(b, m))[0];
      if (u) { u._mission = m.id; C.moveUnits([u], m.x, m.z); }
    }
    for (const u of G.units) if (u._mission !== undefined && !G.missions.some(m => m.id === u._mission) && u.goal < 0) delete u._mission;
    for (const u of G.units.filter(u => u.kind === 'apc' && u.goal < 0)) {
      if (u.cargo >= 50) { const e = G.evacs.slice().sort((a, b) => d2(a, u) - d2(b, u))[0]; C.moveUnits([u], e.x, e.z); continue; }
      const b = G.blocks.filter(b => b.pop > 0 && !b.fallen).sort((a, b2) => d2({ x: a.x0 + 3, z: a.z0 + 3 }, u) - d2({ x: b2.x0 + 3, z: b2.z0 + 3 }, u))[0];
      if (b) C.sendToBlock([u], b);
    }
  },
};
module.exports = { STRATS };
if (require.main === module) (async () => {
  const n = Number(process.argv[2]) || 4, names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(STRATS);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'city', 'index.html'));
  await page.waitForFunction(() => window.City);
  for (const name of names) {
    const pcts = [];
    for (let seed = 1; seed <= n; seed++) {
      pcts.push(await page.evaluate(([seed, src, steadySrc]) => {
        const C = window.City; C.reset(seed);
        const strat = eval(src), steady = eval(steadySrc), s = {};
        for (let i = 0; i < 12 * 60 * 20 + 20 && !C.G.over; i++) { strat(C, C.G.t, s, steady); C.tick(1 / 20); }
        return C.G.over.pct;
      }, [seed, STRATS[name].toString(), STRATS.steady.toString()]));
    }
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    console.log(`${name.padEnd(8)} mean ${mean.toFixed(1)}%  [${pcts.map(p => p.toFixed(1)).join(', ')}]`);
  }
  console.log(JSON.stringify({ errs }));
  await browser.close();
})();
