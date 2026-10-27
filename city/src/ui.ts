// The HTML around the 3D view: the top bar, the selection panel and dispatch log, the build bar,
// the start, help and end screens, and pointer, touch and keyboard input.

const UI = {
  sel: [] as Unit[],
  block: null as Block | null,
  evac: null as Evac | null,
  mode: null as Order | null,
  hover: null as { x: number; z: number } | null,
  overlay: 'start' as '' | 'start' | 'help' | 'end' | 'decide',
  lastHud: 0,
  lastPanelKey: '',
  toastT: 0,
  pressT: 0,   // a panel button acted on pointerdown; ignore the click that follows
};
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const BUILD: Array<{ o: Order; label: string; key: string; hint: string }> = [
  { o: 'evac', label: 'Evac point', key: '1', hint: 'Tap a street to open a bus evacuation point.' },
  { o: 'militia', label: 'Militia', key: '2', hint: 'Tap a block with residents to raise militia there.' },
  { o: 'infantry', label: 'Infantry', key: '3', hint: 'Tap where to send an infantry squad from Fort Aldermoor.' },
  { o: 'apc', label: 'APC', key: '4', hint: 'Tap where to send an armoured personnel carrier.' },
  { o: 'tank', label: 'Tank', key: '5', hint: 'Tap where to send a tank.' },
  { o: 'strike', label: 'Air strike', key: '6', hint: 'Tap a target. Bombs fall in a line about 8 cells long: anyone under them dies.' },
  { o: 'gunship', label: 'Gunship', key: '7', hint: 'Tap a point for the gunship to circle for 45 seconds.' },
];
const PLACE_R: Record<Order, number> = { evac: 1.5, militia: 3.5, infantry: 1, apc: 1.2, tank: 1.2, strike: 4.2, gunship: 5 };

function toast(text: string) {
  const t = $('#toast'); t.textContent = text; t.hidden = false; UI.toastT = performance.now() + 2600;
}

function buildBar() {
  $('#bar').innerHTML = BUILD.map(b => `<button class="bb" data-order="${b.o}" title="${esc(b.hint)} (key ${b.key})"><b>${b.label}</b><small>$${ORDER_COST[b.o]}<kbd>${b.key}</kbd></small></button>`).join('');
}

function setMode(o: Order | null) {
  if (o === 'militia' && UI.block) { const err = order('militia', 0, 0, UI.block); if (err) toast(err); UI.mode = null; refreshPanel(true); return; }
  if (o && UI.mode !== o && G.funds < ORDER_COST[o]) { toast(`Needs $${ORDER_COST[o]}. You have $${Math.floor(G.funds)}.`); return; }
  UI.mode = UI.mode === o ? null : o;
  const hint = $('#hint');
  const b = BUILD.find(x => x.o === UI.mode);
  hint.hidden = !b;
  if (b) hint.innerHTML = `${esc(b.hint)} <button data-act="cancel">Cancel</button>`;
  document.querySelectorAll<HTMLButtonElement>('#bar .bb').forEach(el => el.classList.toggle('on', el.dataset.order === UI.mode));
}

function updateHud(now: number) {
  if (now - UI.lastHud < 200) return;
  UI.lastHud = now;
  const s = G.stats, atRisk = G.blocks.reduce((a, b) => a + b.pop, 0) + G.civs.length * PER_AGENT + G.evacs.reduce((a, e) => a + e.queue, 0);
  const set = (id: string, v: string) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
  set('h-time', fmtTime(GAME_SECONDS - G.t));
  set('h-funds', `$${Math.floor(G.funds)}`);
  set('h-evac', fmtPeople(s.evacuated));
  set('h-dead', fmtPeople(s.dead));
  set('h-inf', fmtPeople(G.zeds.length * PER_AGENT));
  set('h-risk', fmtPeople(atRisk));
  set('h-pct', `${((s.evacuated / s.total) * 100).toFixed(0)}% saved`);
  document.querySelectorAll<HTMLButtonElement>('#speed button').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === G.speed));
  document.querySelectorAll<HTMLButtonElement>('#bar .bb').forEach(b => b.classList.toggle('poor', G.funds < ORDER_COST[b.dataset.order as Order]));
  refreshPanel(false);
  if (UI.toastT && now > UI.toastT) { $('#toast').hidden = true; UI.toastT = 0; }
}

const LANDMARK_LABEL: Record<Landmark, string> = { stadium: 'Stadium', cathedral: 'Cathedral', station: 'Railway station', market: 'Market square', hospital: 'Hospital', victory: 'Park and monument', millbrook: 'Park and bandstand', base: 'Army base', townhall: 'City Hall' };

function bar(v: number, max: number, cls = '') { return `<span class="hp ${cls}"><i style="width:${clamp((v / Math.max(1, max)) * 100, 0, 100).toFixed(0)}%"></i></span>`; }

function refreshPanel(force: boolean) {
  UI.sel = UI.sel.filter(u => G.units.includes(u));
  let html = '';
  if (UI.sel.length) {
    const one = UI.sel.length === 1;
    html = UI.sel.slice(0, 6).map(u => {
      const s = UNITS[u.kind], hp = u.members.reduce((a, m) => a + m.hp, 0), max = s.members * s.hp, a = ABILITY[u.kind];
      const next = RANKS[u.rank + 1], cost = reinforceCost(u), canR = cost > 0 && nearSupply(u) && G.funds >= cost;
      const rTitle = u.kind === 'militia' ? 'Militia cannot be reinforced' : !cost ? 'At full strength' : !nearSupply(u) ? 'Reinforce at Fort Aldermoor or an evacuation point' : G.funds < cost ? `Needs $${cost}` : 'Refill the ranks and patch the wounded; the unit keeps its rank';
      return `<div class="unit"><div class="row"><b>${esc(u.name)}</b><span>${u.rank ? `<i class="rank r${u.rank}" title="${RANKS[u.rank].name}">${'★'.repeat(u.rank)} ${RANKS[u.rank].name}</i> · ` : ''}${s.vehicle ? '' : `${u.members.length}/${s.members} men · `}${u.kills} kills</span></div>${bar(hp, max, hp < max * 0.35 ? 'low' : '')}
        <p class="note">${u.lureT > 0 ? '<b class="warn">Siren on: drawing the infected</b>' : u.goal >= 0 ? 'Moving' : 'Holding and firing at anything in range'} · range ${s.range}${u.vip ? ' · <b class="warn">VIP aboard</b>' : ''}</p>
        ${u.kind === 'apc' ? `<p class="note">Carrying <b>${u.cargo}</b> of 60 civilians. Tap a block to load people, then tap near an evacuation point to drop them off.</p>` : ''}
        <div class="btns abil"><button class="btn sm" data-act="ability" data-id="${u.id}" title="${esc(a.desc)}">${a.name}${one ? ' <kbd>F</kbd>' : ''}<span class="cd" data-cd="${u.id}"></span></button>${u.kind === 'militia' ? '' : `<button class="btn sm" data-act="reinforce" data-id="${u.id}" title="${esc(rTitle)}" ${canR ? '' : 'disabled'}>${UNITS[u.kind].vehicle ? 'Repair' : 'Reinforce'}${cost ? ` · $${cost}` : ''}${one ? ' <kbd>R</kbd>' : ''}</button>`}</div>
        ${one ? `<p class="note">${esc(a.desc)}${next ? ` ${next.kills - u.kills} more kills to ${next.name.toLowerCase()}.` : ''}</p>` : ''}</div>`;
    }).join('') + (UI.sel.length > 6 ? `<p class="note">and ${UI.sel.length - 6} more</p>` : '') +
      `<p class="note">Tap a street to move. Right-click also moves. F uses every selected unit's ability. Esc to deselect.</p><button data-act="desel" class="btn">Deselect</button>`;
  } else if (UI.block) {
    const b = UI.block, status = b.fallen ? 'Overrun' : b.pop <= 0 ? 'Empty' : b.evacuating ? 'Evacuating' : 'Sheltering';
    html = `<div class="row"><b class="big">${esc(b.name)}</b><span class="tag ${b.fallen ? 'bad' : b.evacuating ? 'warn' : ''}">${status}</span></div>
      <p class="note">${b.landmark ? LANDMARK_LABEL[b.landmark] : { downtown: 'Downtown', residential: 'Residential', suburb: 'Suburb', industrial: 'Industrial', docks: 'Docks', hospital: 'Hospital', park: 'Park', base: 'Army base' }[b.district]}</p>
      ${b.popMax ? `<div class="row"><span>${fmtPeople(b.pop)} of ${fmtPeople(b.popMax)} still inside</span></div>${bar(b.pop, b.popMax)}` : ''}
      ${b.popMax ? `<div class="btns"><button class="btn" data-act="evacb" ${b.pop <= 0 || b.evacuating ? 'disabled' : ''}>Evacuate</button><button class="btn" data-act="militia" ${b.pop < 60 || G.funds < 100 ? 'disabled' : ''}>Raise militia · $100</button></div>
      <p class="note">${b.evacuating ? 'Residents are heading for the nearest evacuation point.' : 'Residents stay behind closed doors until told to go, or until the infected come close.'}</p>` : ''}`;
  } else if (UI.evac) {
    const e = UI.evac;
    html = `<div class="row"><b class="big">${e.kind === 'harbor' ? 'The harbour' : 'Bus evacuation point'}</b></div>
      <p>${fmtPeople(e.queue)} waiting${e.full ? ' (full: newcomers go elsewhere)' : ''} · next ${e.kind === 'harbor' ? 'ship' : 'bus'} in ${Math.ceil(e.timer)}s · takes ${e.cap}</p>
      <p class="note">${e.departed} departures so far. Crowds waiting here draw the infected: guard them.</p>`;
  } else {
    html = `<p class="note">Tap a block to evacuate it or raise militia. Tap a unit to command it. Drag to pan, scroll or pinch to zoom.</p>`;
  }
  const ms = $('#missions');
  const hq = G.hqOrders;
  ms.hidden = !G.missions.length && !hq.length;
  const mHtml = (hq.length ? `<h2>Orders from HQ</h2><ul class="orders">` + hq.map(o => `<li class="${o.done ? 'done' : ''}"><span>${o.done ? '✓' : '○'}</span>${esc(o.text)} <b>$${o.reward}</b></li>`).join('') + '</ul>' : '') +
    (G.missions.length ? `<h2>Missions</h2>` + G.missions.map(m => `<div class="mission"><p>${missionText(m)}${m.t < 999 ? ` <b class="${m.t < 15 ? 'urgent' : ''}">${Math.ceil(m.t)}s</b>` : ''}</p><button data-act="goto" data-x="${m.x}" data-z="${m.z}">Show</button></div>`).join('') : '');
  if (ms.innerHTML !== mHtml) ms.innerHTML = mHtml;
  const logHtml = G.log.slice(0, 14).map(l => `<li class="${l.kind}"><time>${fmtTime(GAME_SECONDS - l.t)}</time>${esc(l.text)}</li>`).join('');
  const key = html + logHtml;
  if (force || key !== UI.lastPanelKey) {
    UI.lastPanelKey = key;
    $('#sel').innerHTML = html;
    $('#side').classList.toggle('empty', !UI.sel.length && !UI.block && !UI.evac);
    $('#side').classList.toggle('has-missions', G.missions.length > 0 || G.hqOrders.length > 0);
    $('#log').innerHTML = logHtml;
  }
  // ability cooldowns tick every second: update them in place rather than rebuilding the panel
  for (const u of UI.sel) {
    const el = document.querySelector<HTMLElement>(`[data-cd="${u.id}"]`);
    if (!el) continue;
    const v = u.lureT > 0 ? ` · ${Math.ceil(u.lureT)}s on` : u.ab > 0 ? ` · ${Math.ceil(u.ab)}s` : ' · ready';
    if (el.textContent !== v) el.textContent = v;
    (el.parentElement as HTMLButtonElement).classList.toggle('ready', u.ab <= 0);
  }
}

function missionText(m: Mission): string {
  if (m.kind === 'crate') return `Supply drop · $${m.reward}`;
  if (m.kind === 'survivors') return `${m.people} survivors · $${m.reward}`;
  if (m.kind === 'vip') return m.carrier ? `Bring the VIP to the harbour or the fort · $${m.reward}` : `VIP: ${esc(m.who.split(',')[0])} · $${m.reward}`;
  return `Hold ${esc(G.blocks[m.block].name)} · $${m.reward} + militia ${bar(m.prog, m.need)}<small>${Math.floor(m.prog)} of ${m.need}s held</small>`;
}

/** Use the special ability of every selected unit; reports the first refusal if none went off. */
function useSelAbility() {
  if (!UI.sel.length) { toast('Select a unit first, then press F.'); return; }
  let err: string | null = null, ok = 0;
  for (const u of UI.sel) { const e = useAbility(u); if (e) err = err ?? e; else ok++; }
  if (!ok && err) toast(err);
  refreshPanel(true);
}

function panelAct(t: HTMLElement) {
  const u = G.units.find(x => x.id === Number(t.dataset.id));
  if (!u) return;
  const err = t.dataset.act === 'ability' ? useAbility(u) : reinforce(u);
  if (err) toast(err);
  refreshPanel(true);
}

function decide(i: number) {
  const err = choose(i);
  if (err) { toast(err); return; }
  showOverlay('');
  refreshPanel(true);
}

function reinforceSel() {
  if (!UI.sel.length) { toast('Select a unit first, then press R.'); return; }
  let err: string | null = null, ok = 0;
  for (const u of UI.sel) { const e = reinforce(u); if (e) err = err ?? e; else ok++; }
  if (!ok && err) toast(err);
  refreshPanel(true);
}

function showOverlay(which: '' | 'start' | 'help' | 'end' | 'decide') {
  UI.overlay = which;
  const ov = $('#overlay');
  ov.hidden = !which;
  if (!which) return;
  if (which === 'decide') {
    const d = G.decision!;
    ov.innerHTML = `<div class="card decide" role="dialog" aria-labelledby="dtitle"><span class="eyebrow">A decision · the game is paused</span><h1 id="dtitle">${esc(d.title)}</h1>
      <p class="body">${esc(d.text)}</p><div class="opts">${d.opts.map((o, i) => `<button class="opt" data-act="choose" data-i="${i}" ${o.off ? 'disabled' : ''}><b><kbd>${i + 1}</kbd>${esc(o.label)}</b><span>${esc(o.note)}</span>${o.off ? `<em>${esc(o.off)}</em>` : ''}</button>`).join('')}</div></div>`;
    (ov.querySelector('.opt:not([disabled])') as HTMLElement | null)?.focus();
    return;
  }
  const controls = `<dl class="keys"><dt>Select</dt><dd>Tap or click a unit, block or evacuation point. Shift-click adds units; Ctrl+A selects every unit.</dd>
    <dt>Move</dt><dd>With units selected, tap a street. Right-click also moves.</dd><dt>Camera</dt><dd>Drag to pan, scroll or pinch to zoom, Q and E to turn, WASD or arrows to pan.</dd>
    <dt>Abilities</dt><dd>F uses the selected units' special abilities; R reinforces or repairs them at the fort or an evacuation point.</dd>
    <dt>Buy</dt><dd>Buttons along the bottom, or keys 1 to 7, then tap the map.</dd><dt>Time</dt><dd>Space pauses. Speeds 1×, 2× and 4× at the top.</dd></dl>`;
  if (which === 'start' || which === 'help') {
    ov.innerHTML = `<div class="card"><span class="eyebrow">${which === 'start' ? 'Prototype · Real time' : 'Field manual'}</span><h1>Last Boat to Calder: City</h1>
      <p class="body">The outbreak started at St Brennan's Hospital on the east side. You hold Fort Aldermoor in the north-west and the harbour in the south. The last ship sails in 12 minutes. Get as many people out as you can.</p>
      <ul><li>People shelter at home until you order a block to evacuate, or the infected come close and they panic. Evacuees walk to the nearest evacuation point and wait for a ship or bus.</li>
      <li>The infected hunt the nearest people: anyone in the streets, crowds at the evacuation points, your troops, and blocks they can break into.</li>
      <li>Troops fire on their own. <b>Each unit also has an ability</b> (F): grenades, molotovs, a tank barrage, or an APC's siren that pulls the infected after it. Units earn <b>ranks</b> with kills; reinforce them (R) at the fort or an evacuation point.</li>
      <li><b>APCs rescue people:</b> select one and tap a block to load up to 60, then tap near an evacuation point to drop them off.</li>
      <li><b>Missions</b> pop up: supply drops, rooftop survivors, VIPs to bring out, blocks to hold. Now and then command asks you to <b>decide</b> something; the game waits for you.</li>
      <li>Watch for <b>runners</b> (fast, red shirts, go down easily) and <b>brutes</b> (huge, soak up fire, smash doors in). At minute 8 a great horde arrives from the east.</li>
      <li>Each figure stands for 10 people.</li></ul>${controls}
      <div class="btns"><button class="btn primary" data-act="${which === 'start' ? 'begin' : 'closehelp'}">${which === 'start' ? 'Take command' : 'Back to the city'}</button><a class="btn" href="../">The original game</a></div></div>`;
  } else {
    const o = G.over!, s = G.stats, d = G.deaths, elsewhere = s.dead - d.streets - d.queues - d.homes - d.fire;
    ov.innerHTML = `<div class="card ${o.pct >= 30 ? '' : 'red'}"><span class="eyebrow">${o.why === 'time' ? 'The last ship has sailed' : 'The city is empty'}</span><h1>${esc(o.grade)}</h1>
      <p class="big">${o.pct.toFixed(0)}% of the city saved</p>
      <div class="stats"><div><b>${fmtPeople(s.evacuated)}</b><span>Evacuated</span></div><div><b>${fmtPeople(s.dead)}</b><span>Dead</span></div><div><b>${s.killed * PER_AGENT}</b><span>Infected destroyed</span></div><div><b>${s.unitsLost}</b><span>Units lost</span></div><div><b>${s.missions}</b><span>Missions done</span></div><div><b>${fmtPeople(s.ferried)}</b><span>Rescued by APC</span></div><div><b>${G.troopsHome}</b><span>Troops home</span></div><div><b>$${s.spent}</b><span>Spent</span></div></div>
      <p class="note">Where people died: ${fmtPeople(G.deaths.streets)} in the streets, ${fmtPeople(G.deaths.queues)} waiting at evacuation points, ${fmtPeople(G.deaths.homes)} in their homes${G.deaths.fire ? `, ${fmtPeople(G.deaths.fire)} under your own air strikes` : ''}${elsewhere > 0 ? `, ${fmtPeople(elsewhere)} on rooftops, in APCs and among the militia` : ''}.</p>
      ${G.ace ? `<p class="note">Unit of the night: <b>${esc(G.ace.name)}</b>${G.ace.rank ? ` ${'★'.repeat(G.ace.rank)}` : ''}, ${G.ace.kills} kills${G.units.some(u => u.name === G.ace!.name) ? '' : ', lost in the fighting'}.</p>` : ''}
      <p class="note">Grades: 60% Saviour of the city, 45% An orderly withdrawal, 30% A bitter retreat.</p>
      <div class="btns"><button class="btn primary" data-act="again">Play again</button><a class="btn" href="../">The original game</a></div></div>`;
  }
  (ov.querySelector('.btn.primary') as HTMLElement | null)?.focus();
}

function syncMute() {
  const b = document.getElementById('mute');
  if (b) { b.textContent = AUD.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', AUD.muted ? 'Sound off' : 'Sound on'); }
}

function updateAlert() {
  const el = $('#alert'), on = !!G.alert && G.t < G.alert.until;
  if (on && el.textContent !== G.alert!.text) el.textContent = G.alert!.text;
  el.hidden = !on;
}

function pickUnit(x: number, z: number): Unit | null {
  let best: Unit | null = null, bd = 2.2;
  for (const u of G.units) { const d = dist2(u.x, u.z, x, z); if (d < bd) { bd = d; best = u; } }
  return best;
}

function tapAt(clientX: number, clientY: number, right: boolean, shift: boolean) {
  const p = screenToGround(clientX, clientY);
  if (!p || G.over) return;
  if (UI.mode) {
    const c = cellOf(p.x, p.z), b = G.blockAt[c] >= 0 ? G.blocks[G.blockAt[c]] : null;
    const err = order(UI.mode, p.x, p.z, b);
    if (err) toast(err); else setMode(null);
    refreshPanel(true);
    return;
  }
  if (right) { if (UI.sel.length) moveUnits(UI.sel, p.x, p.z); return; }
  const u = pickUnit(p.x, p.z);
  if (u) {
    if (shift) UI.sel = UI.sel.includes(u) ? UI.sel.filter(x => x !== u) : UI.sel.concat(u);
    else UI.sel = [u];
    UI.block = null; UI.evac = null; refreshPanel(true); return;
  }
  const c = cellOf(p.x, p.z), bi = G.blockAt[c];
  const e = G.evacs.find(e => dist2(e.x, e.z, p.x, p.z) < (e.kind === 'harbor' ? 9 : 4));
  if (UI.sel.length && walkable(c) && !e) { moveUnits(UI.sel, p.x, p.z); return; }
  const apcs = UI.sel.filter(u => u.kind === 'apc');
  if (apcs.length && bi >= 0 && G.blocks[bi].pop > 0) { sendToBlock(apcs, G.blocks[bi]); toast(`APC heading to ${G.blocks[bi].name} to take people aboard.`); return; }
  if (UI.sel.length && e) { moveUnits(UI.sel, e.x, e.z); return; }
  UI.sel = [];
  UI.block = bi >= 0 && G.blocks[bi].district !== 'park' ? G.blocks[bi] : null;
  UI.evac = UI.block ? null : e ?? null;
  refreshPanel(true);
}

function bindInput(canvas: HTMLCanvasElement) {
  const ptrs = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean }>();
  let pinch = 0;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    startAudio();
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', e => {
    UI.hover = screenToGround(e.clientX, e.clientY);
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY; p.moved = true;
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomCamera(pinch / d);
      pinch = d; return;
    }
    if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 7) p.moved = true;
    if (p.moved && e.button !== 2 && !(e.buttons & 2)) panCamera(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = 0;
    if (p && !p.moved && ptrs.size === 0 && !UI.overlay) tapAt(e.clientX, e.clientY, e.button === 2, e.shiftKey);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomCamera(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

  document.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest('[data-act],[data-order],[data-speed]') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.order) { setMode(t.dataset.order as Order); return; }
    if (t.dataset.speed) { G.speed = Number(t.dataset.speed); return; }
    switch (t.dataset.act) {
      case 'begin': startAudio(); showOverlay(''); break;
      case 'closehelp': showOverlay(''); break;
      case 'help': showOverlay('help'); break;
      case 'mute': setMuted(!AUD.muted); syncMute(); break;
      case 'goto': Object.assign(V.cam, { x: Number(t.dataset.x), z: Number(t.dataset.z), dist: Math.min(V.cam.dist, 40) }); break;
      case 'again': newGame(Math.floor(Math.random() * 1e9)); resetView(); showOverlay(''); break;
      case 'cancel': setMode(null); break;
      case 'desel': UI.sel = []; refreshPanel(true); break;
      case 'evacb': if (UI.block) evacuateBlock(UI.block); refreshPanel(true); break;
      case 'militia': if (UI.block) { const err = order('militia', 0, 0, UI.block); if (err) toast(err); refreshPanel(true); } break;
      case 'choose': decide(Number(t.dataset.i)); break;
      case 'ability': case 'reinforce': if (performance.now() - UI.pressT > 700) panelAct(t); break;
    }
  });
  // the unit panel can be rebuilt between press and release while a fight is on, so its buttons act on press
  $('#sel').addEventListener('pointerdown', e => {
    const t = (e.target as HTMLElement).closest('[data-act="ability"],[data-act="reinforce"]') as HTMLButtonElement | null;
    if (!t || t.disabled || e.button !== 0) return;
    UI.pressT = performance.now();
    panelAct(t);
  });

  const held = new Set<string>();
  document.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).matches?.('input,textarea')) return;
    if (UI.overlay) {
      if (e.key === 'Escape' && UI.overlay === 'help') showOverlay('');
      if (UI.overlay === 'decide' && /^[1-9]$/.test(e.key)) decide(Number(e.key) - 1);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); G.speed = G.speed ? 0 : 1; return; }
    if (k === 'escape') { if (UI.mode) setMode(null); else { UI.sel = []; UI.block = null; UI.evac = null; refreshPanel(true); } return; }
    const b = BUILD.find(x => x.key === k); if (b) { setMode(b.o); return; }
    if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); UI.sel = G.units.slice(); UI.block = null; UI.evac = null; refreshPanel(true); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === '?') { showOverlay('help'); return; }
    if (k === 'm') { setMuted(!AUD.muted); syncMute(); return; }
    if (k === 'f') { useSelAbility(); return; }
    if (k === 'r') { reinforceSel(); return; }
    if (k === '+' || k === '=') { G.speed = Math.min(4, Math.max(1, G.speed * 2)); return; }
    if (k === '-') { G.speed = G.speed <= 1 ? 1 : G.speed / 2; return; }
    if (k === 'q') V.cam.yaw -= Math.PI / 8;
    if (k === 'e') V.cam.yaw += Math.PI / 8;
    held.add(k);
  });
  document.addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
  return (dt: number) => {
    const s = 600 * dt;
    if (held.has('w') || held.has('arrowup')) panCamera(0, s);
    if (held.has('s') || held.has('arrowdown')) panCamera(0, -s);
    if (held.has('a') || held.has('arrowleft')) panCamera(s, 0);
    if (held.has('d') || held.has('arrowright')) panCamera(-s, 0);
  };
}

function resetView() {
  UI.sel = []; UI.block = null; UI.evac = null; UI.mode = null; UI.lastPanelKey = '';
  Object.assign(V.cam, { x: 46, z: 34, dist: 72, yaw: 0 });
  for (const g of vehicles.values()) V.scene.remove(g);
  vehicles.clear();
  for (const m of evacMarks.values()) { V.scene.remove(m.mark); V.scene.remove(m.vehicle); }
  evacMarks.clear();
  for (const h of helis.values()) V.scene.remove(h);
  helis.clear();
  for (const j of jets.values()) V.scene.remove(j);
  jets.clear();
  for (const b of beacons.values()) V.scene.remove(b);
  beacons.clear();
  G.changed = true;
  setMode(null);
  refreshPanel(true);
}
