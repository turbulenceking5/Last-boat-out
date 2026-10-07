// Page-side strategy library. Injected into test.html; uses game globals.
window.SEEDRNG = function (a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const IDS = () => Object.keys(P);

function danger(id) { const s = state(id); return (s === 'holding' || s === 'losing') ? 2 : s === 'threat' ? 1 : 0; }

// Generic configurable bot.
function bot(o = {}) {
  o = Object.assign({ evac: true, evacPorts: false, evacCapital: true, keepA: 3, keepB: 1, fortify: true, fortCap: 3, troops: true,
    militia: false, strike: false, airdrop: false, threatOnly: true, extra: null, pre: null, evacTurnMin: 0 }, o);
  return function (t) {
    if (o.pre) o.pre(t);
    // 1. evacuate the most endangered populated places
    if (o.evac && t >= o.evacTurnMin) {
      const c = IDS().filter(id => !N(id).evac && N(id).pop >= 1 && !fallen(id) && (o.evacPorts || P[id].type !== 'port') && (o.evacCapital || id !== 'aldermoor') && (!o.threatOnly || danger(id) > 0))
        .sort((a, b) => danger(b) - danger(a) || N(b).pop - N(a).pop);
      for (const id of c) { if (S.cp < 2) break; orderEvac(id); }
    }
    // 2. rail spare troops to the most populous threatened place
    if (o.troops) {
      const tgt = IDS().filter(id => danger(id) > 0 && (N(id).pop + N(id).queue) >= 3 && !fallen(id)).sort((a, b) => (N(b).pop + N(b).queue) - (N(a).pop + N(a).queue))[0];
      if (tgt) for (const [src, keep] of [['aldermoor', o.keepA], ['brannock', o.keepB]]) {
        if (src === tgt || S.cp < 1) continue; const spare = Math.floor(N(src).T - keep);
        if (spare >= 1 && moveTargets(src).has(tgt)) orderMove(src, tgt, spare);
      }
    }
    if (o.militia) for (const id of IDS().filter(id => danger(id) > 0 && N(id).pop >= 15)) { if (S.cp < 1) break; orderMilitia(id); }
    if (o.strike) { const tg = IDS().filter(id => N(id).H >= 8).sort((a, b) => (N(b).H - N(b).pop) - (N(a).H - N(a).pop))[0]; if (tg && S.cp >= 2) orderStrike(tg); }
    if (o.extra) o.extra(t);
    // 3. fortify
    if (o.fortify) {
      const c = IDS().filter(id => danger(id) > 0 && N(id).T >= 1 && N(id).F < o.fortCap && (N(id).pop + N(id).queue) >= 3).sort((a, b) => N(b).pop - N(a).pop);
      for (const id of c) { if (S.cp < 1 || S.supply < 8) break; orderFortify(id); }
    }
    if (o.airdrop) { const net = supplyNet(); const c = IDS().filter(id => !net.has(id) && N(id).T >= 1 && N(id).stock < N(id).T); for (const id of c) { if (S.cp < 1) break; orderAirdrop(id); } }
  };
}
window.STRATS = {
  nothing: { orders: () => { } },
  evacAll: { orders: t => { for (const id of IDS().sort((a, b) => N(b).pop - N(a).pop)) { if (S.cp < 1) break; if (!N(id).evac && N(id).pop >= 1 && !fallen(id)) orderEvac(id); } } },
  bot: { orders: bot() },
  bot_noFort: { orders: bot({ fortify: false }) },
  bot_noTroops: { orders: bot({ troops: false }) },
  bot_noEvac: { orders: bot({ evac: false }) },
  bot_noEvacCapital: { orders: bot({ evacCapital: false }) },
  bot_evacPorts: { orders: bot({ evacPorts: true }) },
  bot_militia: { orders: bot({ militia: true }) },
  bot_strike: { orders: bot({ strike: true }) },
  bot_airdrop: { orders: bot({ airdrop: true }) },
  // Turn-0 quarantine: blow every link out of Kessler (5 edges = 5 CP), then play the bot.
  cutKessler_bot: { orders: bot({ pre: t => { if (t === 0) for (const b of ['brennan', 'harlow', 'torrin', 'calder', 'dunmore']) orderCut('kessler', b); } }) },
  cutKessler_noCap: { orders: bot({ evacCapital: false, pre: t => { if (t === 0) for (const b of ['brennan', 'harlow', 'torrin', 'calder', 'dunmore']) orderCut('kessler', b); } }) },
  // Turn 0: evacuate Kessler straight onto Calder's quay by rail, rail Kessler's troops onto Calder.
  kesslerFirst: { orders: bot({ evacCapital: false, pre: t => { if (t === 0) { orderEvac('kessler'); orderMove('aldermoor', 'kessler', 5); } } }), ev: { origin: 1 } },
  // Capital-turtle: never evacuate Aldermoor, stack and fortify it, cut the east.
  turtle: {
    orders: t => {
      if (t === 0) { orderCut('aldermoor', 'cedar'); orderCut('aldermoor', 'ashford'); orderCut('millbrook', 'hollis'); orderCut('brindle', 'brannock'); orderCut('aldermoor', 'brannock'); }
      else { if (N('aldermoor').F < 3 && S.supply >= 8) orderFortify('aldermoor'); for (const id of ['westhaven', 'millbrook', 'brindle']) if (danger(id) && !N(id).evac && N(id).pop >= 1) orderEvac(id); }
    }
  },
  // Militia spam in the capital and Kessler.
  militiaSpam: { orders: t => { for (let i = 0; i < 5; i++) { const id = N('kessler').pop >= 15 && !fallen('kessler') ? 'kessler' : 'aldermoor'; orderMilitia(id); } } },
};
// Run one game; returns summary.
window.RUN = function (name, seed, evOverride) {
  newGame({seed: seed * 7919 + 13});
  const st = STRATS[name]; const ev = Object.assign({}, st.ev || {}, evOverride || {});
  const fellAt = {}; const choices = {};
  let negs = [];
  for (let g = 0; g < 60 && !S.over; g++) {
    while (S.events.length) { const id = S.events[0]; let i = ev[id] ?? 0; const ch = EVENTS.find(e => e.id === id).choices(); if (!ch[i] || ch[i].dis) i = ch.findIndex(c => !c.dis); choices[id] = i; decide(i); }
    if (S.over) break;
    st.orders(S.turn);
    UI.showReport = false; endTurn();
    for (const id in P) { if (fallen(id) && fellAt[id] === undefined) fellAt[id] = S.turn; const n = N(id); for (const f of ['pop', 'H', 'T', 'queue', 'stock']) if (n[f] < -1e-9) negs.push(id + '.' + f + '=' + n[f]); }
    if (S.supply < 0) negs.push('supply');
  }
  const cols = S.cols.reduce((a, c) => a + c.count, 0); let pop = 0, q = 0; for (const id in P) { pop += N(id).pop; q += N(id).queue; }
  const leak = TOTAL_POP - (S.evacuated + S.lost + S.mobilized + pop + q + cols);
  const cliff = Object.keys(P).filter(id => N(id).H >= .5 && N(id).pop + N(id).queue >= 5).map(id => id + ':' + Math.round(N(id).pop + N(id).queue) + '/H' + N(id).H.toFixed(1) + '/T' + N(id).T.toFixed(1));
  return { cliff, pct: S.over ? S.over.pct : null, why: S.over && S.over.why, turn: S.over && S.over.turn, ev: S.evacuated, sh: S.over && S.over.sheltered, lost: S.lost, fellAt, choices, leak, negs: negs.slice(0, 3) };
};
const CUTK = () => { for (const b of ['brennan', 'harlow', 'torrin', 'calder', 'dunmore']) orderCut('kessler', b); };
Object.assign(STRATS, {
  cutK_evacPorts: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) CUTK(); } }) },
  cutK_evacEverything: { orders: bot({ evacPorts: true, threatOnly: false, pre: t => { if (t === 0) CUTK(); } }) },
  cutK_evacPortsNoCap: { orders: bot({ evacPorts: true, evacCapital: false, pre: t => { if (t === 0) CUTK(); } }) },
  cutK_portsFirst: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) CUTK(); if (t === 1) for (const id of PORTS) orderEvac(id); } }) },
  // Kessler funnel: evacuate Kessler onto Calder's quay by rail, stack troops on Calder, cut every other Kessler link.
  funnel: { orders: bot({ evacPorts: true, pre: t => {
    if (t === 0) { orderEvac('kessler'); orderMove('aldermoor', 'calder', 6); orderMove('torrin', 'calder', 5); orderCut('kessler', 'brennan'); orderCut('kessler', 'harlow'); }
    if (t === 1) { orderCut('kessler', 'torrin'); orderCut('kessler', 'dunmore'); for (let i = 0; i < 3; i++) orderFortify('calder'); }
  } }) },
  // Pure quay pen: evacuate ports' own populations first, do nothing else
  quayOnly: { orders: t => { for (const id of PORTS) if (!N(id).evac && N(id).pop >= 1) orderEvac(id); } },
});
function funnelN(n, opts = {}) {
  return { ev: { origin: 1 }, orders: bot(Object.assign({ evacPorts: true, pre: t => {
    if (t === 0) { orderEvac('kessler'); for (const b of ['brennan', 'harlow', 'torrin', 'dunmore']) orderCut('kessler', b); }
    if (t === n) orderCut('kessler', 'calder');
  } }, opts)) };
}
for (const n of [1, 2, 3, 4, 6, 99]) STRATS['funnel' + n] = funnelN(n);
const CRUSH = (f = 2) => { orderMove('aldermoor', 'kessler', N('aldermoor').T); orderMove('torrin', 'kessler', N('torrin').T); orderMove('brannock', 'kessler', N('brannock').T); for (let i = 0; i < f; i++) orderFortify('kessler'); };
Object.assign(STRATS, {
  crush: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) CRUSH(); } }) },
  crush_noEvacK: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) CRUSH(); if (N('kessler').evac) orderEvac('kessler'); } }) },
  crush_only: { orders: t => { if (t === 0) CRUSH(); } },
  crush_noFort: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) CRUSH(0); } }) },
  crush_f1: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) CRUSH(1); } }) },
});
const cutPre = t => { if (t === 0) CUTK(); };
Object.assign(STRATS, {
  cK_noFort: { orders: bot({ evacPorts: true, fortify: false, pre: cutPre }) },
  cK_noTroops: { orders: bot({ evacPorts: true, troops: false, pre: cutPre }) },
  cK_militia: { orders: bot({ evacPorts: true, militia: true, pre: cutPre }) },
  cK_strike: { orders: bot({ evacPorts: true, strike: true, pre: cutPre }) },
  cK_airdrop: { orders: bot({ evacPorts: true, airdrop: true, pre: cutPre }) },
  cK_late3: { orders: bot({ evacPorts: true, evacTurnMin: 3, pre: cutPre }) },
  crush_A6: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) { orderMove('aldermoor', 'kessler', 6); orderFortify('kessler'); orderFortify('kessler'); } } }) },
  crush_AT: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) { orderMove('aldermoor', 'kessler', 6); orderMove('torrin', 'kessler', 5); orderFortify('kessler'); orderFortify('kessler'); } } }) },
  militiaK: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) for (let i = 0; i < 5; i++) orderMilitia('kessler'); } }) },
  strikeK: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) { orderStrike('kessler'); orderStrike('kessler'); } } }) },
});
Object.assign(STRATS, {
  cK_cure0: { orders: bot({ evacPorts: true, pre: t => { S.flags.cure = 1; if (t === 0) CUTK(); } }) },
  bEP_cure0: { orders: bot({ evacPorts: true, pre: t => { S.flags.cure = 1; } }), ev: { origin: 1 } },
  bEP: { orders: bot({ evacPorts: true }), ev: { origin: 1 } },
});
for (const d of [1, 2, 4, 8]) { const f = bot({ evacPorts: true }); STRATS['bEP_delay' + d] = { ev: { origin: 1 }, orders: t => { if (t >= d) f(t); } };
  const g = bot({ evacPorts: true, pre: t => { if (t === d) CUTK(); } }); STRATS['cutK_at' + d] = { orders: t => { if (t >= d) g(t); } }; }
// stop playing after turn d (only the opening matters?)
for (const d of [4, 8, 12]) { const f = bot({ evacPorts: true, pre: cutPre }); STRATS['cutK_stop' + d] = { orders: t => { if (t < d) f(t); } }; }
Object.assign(STRATS, {
  cutK_staged: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) { orderCut('kessler', 'harlow'); orderCut('kessler', 'brennan'); } if (t === 1) { orderCut('kessler', 'calder'); orderCut('kessler', 'dunmore'); } if (t === 2) orderCut('kessler', 'torrin'); } }), ev: { origin: 1 } },
  roadCrush: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) { orderMove('torrin', 'kessler', 5); orderFortify('kessler'); orderFortify('kessler'); orderStrike('kessler'); } } }), ev: { origin: 1 } },
  roadCrushCut: { orders: bot({ evacPorts: true, pre: t => { if (t === 0) { orderMove('torrin', 'kessler', 5); orderFortify('kessler'); orderStrike('kessler'); orderCut('kessler','harlow'); } if (t === 1) { orderStrike('kessler'); orderMove('aldermoor','larch',N('aldermoor').T-2); orderFortify('kessler'); } } }), ev: { origin: 1 } },
});
for (const [k, o] of Object.entries({ noFort: { fortify: false }, noTroops: { troops: false }, militia: { militia: true }, strike: { strike: true }, airdrop: { airdrop: true }, noEvacCap: { evacCapital: false }, all: { threatOnly: false } }))
  STRATS['bEP_' + k] = { orders: bot(Object.assign({ evacPorts: true }, o)), ev: { origin: 1 } };
