// The HTML around the 3D view: the top bar, the selection panel and dispatch log, the build bar,
// the start, help and end screens, and pointer, touch and keyboard input.

const UI = {
  sel: [] as Unit[],
  block: null as Block | null,
  evac: null as Evac | null,
  mode: null as Order | null,
  hover: null as { x: number; z: number } | null,
  overlay: 'start' as '' | 'start' | 'help' | 'end',
  lastHud: 0,
  lastPanelKey: '',
  toastT: 0,
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

function bar(v: number, max: number, cls = '') { return `<span class="hp ${cls}"><i style="width:${clamp((v / Math.max(1, max)) * 100, 0, 100).toFixed(0)}%"></i></span>`; }

function refreshPanel(force: boolean) {
  UI.sel = UI.sel.filter(u => G.units.includes(u));
  let html = '';
  if (UI.sel.length) {
    html = UI.sel.slice(0, 6).map(u => {
      const s = UNITS[u.kind], hp = u.members.reduce((a, m) => a + m.hp, 0), max = s.members * s.hp;
      return `<div class="unit"><div class="row"><b>${esc(u.name)}</b><span>${s.vehicle ? '' : `${u.members.length}/${s.members} men · `}${u.kills} kills</span></div>${bar(hp, max, hp < max * 0.35 ? 'low' : '')}<p class="note">${u.goal >= 0 ? 'Moving' : 'Holding and firing at anything in range'} · range ${s.range}</p></div>`;
    }).join('') + (UI.sel.length > 6 ? `<p class="note">and ${UI.sel.length - 6} more</p>` : '') +
      `<p class="note">Tap a street to move. Right-click also moves. Esc to deselect.</p><button data-act="desel" class="btn">Deselect</button>`;
  } else if (UI.block) {
    const b = UI.block, status = b.fallen ? 'Overrun' : b.pop <= 0 ? 'Empty' : b.evacuating ? 'Evacuating' : 'Sheltering';
    html = `<div class="row"><b class="big">${esc(b.name)}</b><span class="tag ${b.fallen ? 'bad' : b.evacuating ? 'warn' : ''}">${status}</span></div>
      <p class="note">${{ downtown: 'Downtown', residential: 'Residential', suburb: 'Suburb', industrial: 'Industrial', docks: 'Docks', hospital: 'Hospital', park: 'Park', base: 'Army base' }[b.district]}</p>
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
  const logHtml = G.log.slice(0, 14).map(l => `<li class="${l.kind}"><time>${fmtTime(GAME_SECONDS - l.t)}</time>${esc(l.text)}</li>`).join('');
  const key = html + logHtml;
  if (!force && key === UI.lastPanelKey) return;
  UI.lastPanelKey = key;
  $('#sel').innerHTML = html;
  $('#side').classList.toggle('empty', !UI.sel.length && !UI.block && !UI.evac);
  $('#log').innerHTML = logHtml;
}

function showOverlay(which: '' | 'start' | 'help' | 'end') {
  UI.overlay = which;
  const ov = $('#overlay');
  ov.hidden = !which;
  if (!which) return;
  const controls = `<dl class="keys"><dt>Select</dt><dd>Tap or click a unit, block or evacuation point. Shift-click adds units; Ctrl+A selects every unit.</dd>
    <dt>Move</dt><dd>With units selected, tap a street. Right-click also moves.</dd><dt>Camera</dt><dd>Drag to pan, scroll or pinch to zoom, Q and E to turn, WASD or arrows to pan.</dd>
    <dt>Buy</dt><dd>Buttons along the bottom, or keys 1 to 7, then tap the map.</dd><dt>Time</dt><dd>Space pauses. Speeds 1×, 2× and 4× at the top.</dd></dl>`;
  if (which === 'start' || which === 'help') {
    ov.innerHTML = `<div class="card"><span class="eyebrow">${which === 'start' ? 'Prototype · Real time' : 'Field manual'}</span><h1>Last Boat to Calder: City</h1>
      <p class="body">The outbreak started at St Brennan's Hospital on the east side. You hold Fort Aldermoor in the north-west and the harbour in the south. The last ship sails in 12 minutes. Get as many people out as you can.</p>
      <ul><li>People shelter at home until you order a block to evacuate, or the infected come close and they panic. Evacuees walk to the nearest evacuation point and wait for a ship or bus.</li>
      <li>The infected hunt the nearest people: anyone in the streets, crowds at the evacuation points, your troops, and blocks they can break into.</li>
      <li>Your troops fire at anything in range on their own. Money comes in steadily, plus a bounty for every kill and every person evacuated.</li>
      <li>Each figure stands for 10 people.</li></ul>${controls}
      <div class="btns"><button class="btn primary" data-act="${which === 'start' ? 'begin' : 'closehelp'}">${which === 'start' ? 'Take command' : 'Back to the city'}</button><a class="btn" href="../">The original game</a></div></div>`;
  } else {
    const o = G.over!, s = G.stats;
    ov.innerHTML = `<div class="card ${o.pct >= 30 ? '' : 'red'}"><span class="eyebrow">${o.why === 'time' ? 'The last ship has sailed' : 'The city is empty'}</span><h1>${esc(o.grade)}</h1>
      <p class="big">${o.pct.toFixed(0)}% of the city saved</p>
      <div class="stats"><div><b>${fmtPeople(s.evacuated)}</b><span>Evacuated</span></div><div><b>${fmtPeople(s.dead)}</b><span>Dead</span></div><div><b>${s.killed * PER_AGENT}</b><span>Infected destroyed</span></div><div><b>${s.unitsLost}</b><span>Units lost</span></div><div><b>$${s.spent}</b><span>Spent</span></div></div>
      <p class="note">Grades: 60% Saviour of the city, 45% An orderly withdrawal, 30% A bitter retreat.</p>
      <div class="btns"><button class="btn primary" data-act="again">Play again</button><a class="btn" href="../">The original game</a></div></div>`;
  }
  (ov.querySelector('.btn.primary') as HTMLElement | null)?.focus();
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
      case 'begin': case 'closehelp': showOverlay(''); break;
      case 'help': showOverlay('help'); break;
      case 'again': newGame(Math.floor(Math.random() * 1e9)); resetView(); showOverlay(''); break;
      case 'cancel': setMode(null); break;
      case 'desel': UI.sel = []; refreshPanel(true); break;
      case 'evacb': if (UI.block) evacuateBlock(UI.block); refreshPanel(true); break;
      case 'militia': if (UI.block) { const err = order('militia', 0, 0, UI.block); if (err) toast(err); refreshPanel(true); } break;
    }
  });

  const held = new Set<string>();
  document.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).matches?.('input,textarea')) return;
    if (UI.overlay) { if (e.key === 'Escape' && UI.overlay === 'help') showOverlay(''); return; }
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); G.speed = G.speed ? 0 : 1; return; }
    if (k === 'escape') { if (UI.mode) setMode(null); else { UI.sel = []; UI.block = null; UI.evac = null; refreshPanel(true); } return; }
    const b = BUILD.find(x => x.key === k); if (b) { setMode(b.o); return; }
    if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); UI.sel = G.units.slice(); UI.block = null; UI.evac = null; refreshPanel(true); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === '?') { showOverlay('help'); return; }
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
  G.changed = true;
  setMode(null);
  refreshPanel(true);
}
