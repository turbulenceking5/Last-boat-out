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
};

(async () => {
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
      pcts.push(await page.evaluate(([seed, src]) => {
        const C = window.City; C.reset(seed);
        const strat = eval(src), s = {};
        for (let i = 0; i < 12 * 60 * 20 + 20 && !C.G.over; i++) { strat(C, C.G.t, s); C.tick(1 / 20); }
        return C.G.over.pct;
      }, [seed, STRATS[name].toString()]));
    }
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    console.log(`${name.padEnd(8)} mean ${mean.toFixed(1)}%  [${pcts.map(p => p.toFixed(1)).join(', ')}]`);
  }
  console.log(JSON.stringify({ errs }));
  await browser.close();
})();
