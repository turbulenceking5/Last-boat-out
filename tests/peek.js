// usage: node tests/peek.js <html> <strat> <seed> "<expression evaluated after every turn>"
// Plays one seeded campaign with a strategy from strats.js and prints the expression after each turn.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [html, strat, seed, expr] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(html)); await p.addScriptTag({ path: path.join(__dirname, 'strats.js') });
  const out = await p.evaluate(([strat, seed, expr]) => {
    newGame({ seed: seed * 7919 + 13 }); const st = STRATS[strat]; const ev = st.ev || {}; const lines = [];
    for (let g = 0; g < 60 && !S.over; g++) {
      while (S.events.length) { const id = S.events[0]; let i = ev[id] ?? 0; const ch = EVENTS.find(e => e.id === id).choices(); if (!ch[i] || ch[i].dis) i = ch.findIndex(c => !c.dis); lines.push('  event ' + id + ' -> ' + i); decide(i); }
      if (S.over) break; st.orders(S.turn); UI.showReport = false; endTurn(); lines.push(S.turn + ': ' + eval(expr));
    }
    return lines.join('\n') + '\nresult ' + (S.over && S.over.pct.toFixed(1)) + ' ' + (S.over && S.over.why);
  }, [strat, +seed, expr || '""']);
  console.log(out); await b.close();
})();
