// usage: node sim.js <html> <N> <strat[:evId=idx,...]> ...
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [html, Nstr, ...names] = process.argv.slice(2);
  const N = +Nstr || 30;
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(html));
  await p.addScriptTag({ path: path.join(__dirname, 'strats.js') });
  const extra = process.env.EXTRA; if (extra) await p.addScriptTag({ content: extra });
  for (const spec of names) {
    const [name, evs] = spec.split(':'); const ev = {}; if (evs) for (const kv of evs.split(',')) { const [k, v] = kv.split('='); ev[k] = +v; }
    const rs = await p.evaluate(([name, N, ev]) => { const out = []; for (let s = 1; s <= N; s++) out.push(RUN(name, s, ev)); return out; }, [name, N, ev]);
    const sc = rs.map(r => r.pct); const m = sc.reduce((a, x) => a + x, 0) / N; const sd = Math.sqrt(sc.reduce((a, x) => a + (x - m) ** 2, 0) / N);
    const whys = {}; rs.forEach(r => whys[r.why] = (whys[r.why] || 0) + 1);
    const fall = {}; rs.forEach(r => { for (const id in r.fellAt) fall[id] = (fall[id] || []).concat(r.fellAt[id]); });
    const fallS = Object.entries(fall).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([id, a]) => `${id}${a.length}@${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0)}`).join(' ');
    const evc={};rs.forEach(r=>{for(const id in r.choices)evc[id]=(evc[id]||0)+1});const maxLeak = Math.max(...rs.map(r => Math.abs(r.leak))); const negs = rs.flatMap(r => r.negs).slice(0, 3);
    const grades = [62, 48, 32].map(g => sc.filter(x => x >= g).length);
    console.log(`${spec.padEnd(34)} mean ${m.toFixed(1)} sd ${sd.toFixed(1)} min ${Math.min(...sc).toFixed(1)} max ${Math.max(...sc).toFixed(1)} | >=62:${grades[0]} >=48:${grades[1]} >=32:${grades[2]} | ${JSON.stringify(whys)} evac ${(rs.reduce((a, r) => a + r.ev, 0) / N).toFixed(0)} shel ${(rs.reduce((a, r) => a + (r.sh || 0), 0) / N).toFixed(0)} | fell: ${fallS} | leak ${maxLeak.toFixed(2)} ${negs.join(';')} | ev ${Object.entries(evc).filter(([k])=>!['briefing','origin','fuel','navy','last','march','promise_port'].includes(k)).map(([k,v])=>k+v).join(',')}`);
    if (process.env.DUMP) rs.forEach((r,i)=>{ if(r.pct<+process.env.DUMP) console.log('  seed',i+1,r.pct.toFixed(1),r.why,r.turn,r.cliff.join(' ')); });
  }
  if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  await b.close();
})();
