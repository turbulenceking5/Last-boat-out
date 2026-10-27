// Random taps, drags, wheel turns, keys and button presses on Last Boat to Calder: City at desktop and
// phone sizes, with the game running at 4x. Reports script errors and horizontal overflow.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const errs = new Set(), report = {};
  for (const [w, h, tag] of [[1280, 800, 'desktop'], [390, 844, 'phone']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errs.add(`${tag}: ${e.message}`));
    // stay on the page: the links back to the original game would end the run
    await page.addInitScript(() => document.addEventListener('click', e => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); }, true));
    await page.goto('file://' + path.join(__dirname, '..', 'city', 'index.html') + '#seed=11');
    await page.waitForFunction(() => window.City);
    await page.click('[data-act=begin]');
    await page.click('[data-speed="4"]');
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 160; i++) {
      const r = Math.random();
      if (r < 0.45) await page.mouse.click(rnd(0, w), rnd(0, h), { button: Math.random() < 0.15 ? 'right' : 'left' });
      else if (r < 0.55) { await page.mouse.move(rnd(0, w), rnd(0, h)); await page.mouse.down(); await page.mouse.move(rnd(0, w), rnd(0, h), { steps: 3 }); await page.mouse.up(); }
      else if (r < 0.62) await page.mouse.wheel(0, rnd(-400, 400));
      else if (r < 0.85) await page.keyboard.press(['1', '2', '3', '4', '5', '6', '7', 'Escape', ' ', 'q', 'e', '+', '-', 'Control+a', '?', 'w', 'd', 'f', 'r'][Math.floor(Math.random() * 19)]);
      else {
        const btns = await page.$$('#overlay:not([hidden]) [data-act]:not([disabled]), #bar [data-order], #sel [data-act]:not([disabled]), #hint [data-act]');
        if (btns.length) await btns[Math.floor(Math.random() * btns.length)].click().catch(() => {});
      }
      if (i % 40 === 0) await page.evaluate(() => { const G = window.City.G; G.funds += 800; for (let k = 0; k < 600; k++) window.City.tick(1 / 20); });
    }
    report[tag] = await page.evaluate(() => ({ t: Math.round(window.City.G.t), units: window.City.G.units.length, zeds: window.City.G.zeds.length, over: !!window.City.G.over, scrollWidth: document.documentElement.scrollWidth }));
    await page.close();
  }
  console.log(JSON.stringify({ report, errs: [...errs] }, null, 1));
  await browser.close();
})();
