// Procedural sound with Web Audio: every effect is synthesised, so there are no files to load.
// The simulation records events in G.sfx; playSfx() drains them each frame, quieter with distance
// from where the camera is looking, and rate-limited per kind so a firefight doesn't turn to noise.

const AUD = {
  ctx: null as AudioContext | null,
  master: null as GainNode | null,
  noise: null as AudioBuffer | null,
  muted: false,
  last: {} as Partial<Record<Sfx, number>>,
  groanT: 0,
};
try { AUD.muted = localStorage.getItem('lbc-city-muted') === '1'; } catch (e) { /* storage blocked */ }

/** Audio may only start after a user gesture; called from the first click. */
function startAudio() {
  if (AUD.ctx) { if (AUD.ctx.state === 'suspended') AUD.ctx.resume(); return; }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  AUD.ctx = ctx;
  AUD.master = ctx.createGain();
  AUD.master.gain.value = AUD.muted ? 0 : 0.55;
  AUD.master.connect(ctx.destination);
  const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate), d = buf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  AUD.noise = buf;
}

function setMuted(m: boolean) {
  AUD.muted = m;
  try { localStorage.setItem('lbc-city-muted', m ? '1' : '0'); } catch (e) { /* storage blocked */ }
  if (AUD.master && AUD.ctx) AUD.master.gain.setTargetAtTime(m ? 0 : 0.55, AUD.ctx.currentTime, 0.05);
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseBurst(vol: number, freq: number, q: number, attack: number, decay: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
  const ctx = AUD.ctx!, t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = AUD.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  env(g, t, vol, attack, decay);
  src.connect(f); f.connect(g); g.connect(AUD.master!);
  src.start(t, Math.random() * 0.5); src.stop(t + attack + decay + 0.05);
}

function tone(vol: number, type: OscillatorType, f0: number, f1: number, attack: number, decay: number, lowpass = 4000, delay = 0) {
  const ctx = AUD.ctx!, t = ctx.currentTime + delay, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  f.type = 'lowpass'; f.frequency.value = lowpass;
  env(g, t, vol, attack, decay);
  o.connect(f); f.connect(g); g.connect(AUD.master!);
  o.start(t); o.stop(t + attack + decay + 0.05);
}

const GAP: Record<Sfx, number> = { shot: 0.045, mg: 0.06, cannon: 0.25, boom: 0.08, horn: 2, alarm: 3, chime: 0.3, crunch: 0.2 };
const SOUND: Record<Sfx, (v: number) => void> = {
  shot: v => noiseBurst(0.35 * v, 1700 + Math.random() * 600, 1.2, 0.002, 0.07),
  mg: v => noiseBurst(0.25 * v, 1100, 1.5, 0.002, 0.05),
  cannon: v => { noiseBurst(0.7 * v, 400, 0.7, 0.004, 0.45, 'lowpass', 90); tone(0.5 * v, 'sine', 110, 38, 0.005, 0.4); },
  boom: v => { noiseBurst(1.0 * v, 900, 0.6, 0.006, 1.3, 'lowpass', 70); tone(0.7 * v, 'sine', 80, 28, 0.01, 1.0); },
  horn: v => { for (const f of [98, 147]) tone(0.28 * Math.max(v, 0.35), 'sawtooth', f, f * 0.98, 0.15, 1.6, 600); },
  alarm: () => { for (let k = 0; k < 3; k++) { tone(0.12, 'square', 520, 860, 0.02, 0.5, 1800, k * 0.9); tone(0.12, 'square', 860, 520, 0.02, 0.38, 1800, k * 0.9 + 0.5); } },
  chime: () => { tone(0.18, 'sine', 660, 660, 0.01, 0.35); tone(0.15, 'sine', 990, 990, 0.01, 0.5, 4000, 0.12); },
  crunch: v => noiseBurst(0.45 * v, 300, 2, 0.003, 0.18, 'bandpass', 120),
};

/** Play whatever the simulation recorded since the last frame. */
function playSfx(dt: number) {
  const events = G.sfx;
  G.sfx = [];
  if (!AUD.ctx || AUD.muted || AUD.ctx.state !== 'running') return;
  const now = AUD.ctx.currentTime, cam = V.cam, reach = cam.dist * 0.9 + 12;
  // keep only the nearest event of each kind this frame
  const best: Partial<Record<Sfx, number>> = {};
  for (const e of events) {
    const d = Math.hypot(e.x - cam.x, e.z - cam.z), v = e.k === 'alarm' || e.k === 'horn' || e.k === 'chime' ? 1 : clamp(1 - d / reach, 0, 1) * clamp(40 / cam.dist, 0.35, 1);
    if (v > (best[e.k] ?? 0)) best[e.k] = v;
  }
  for (const k of Object.keys(best) as Sfx[]) {
    if (now - (AUD.last[k] ?? -9) < GAP[k] || best[k]! < 0.04) continue;
    AUD.last[k] = now;
    SOUND[k](best[k]!);
  }
  // now and then, a groan from the infected in view
  AUD.groanT -= dt;
  if (AUD.groanT <= 0) {
    AUD.groanT = 1.5 + Math.random() * 2.5;
    let near = 0;
    for (const z of G.zeds) if (dist2(z.x, z.z, cam.x, cam.z) < reach * reach * 0.3 && ++near > 5) break;
    if (near > 5) { const f = 70 + Math.random() * 40; tone(0.09, 'sawtooth', f, f * 0.7, 0.25, 0.9, 380); }
  }
}
