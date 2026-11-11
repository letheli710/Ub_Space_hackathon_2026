// Shared DEMO console pieces for skins I, K and L (local helper — not part of the shared skin API).
// Each component renders the real controls with neutral `ikl-*` classes; the skin themes them
// through CSS variables (see variantIKLKit.css).
import { Component, useRef, useState } from 'react';
import * as THREE from 'three';
import { MAX_TIME_SCALE, MIN_TIME_SCALE, formatTimeScale, parseTimeScale } from '../../data/voyage.js';
import './variantIKLKit.css';

export const POINTER = ['Asteroid Collision', 'Alien Encounter'];
const titleCase = (id) => id.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Classic Disaster Maker semantics: Asteroid/Alien arm pointer placement, Black Hole toggles. */
export function useHazards(sim) {
  const d = sim.demo;
  const press = (name) => {
    if (POINTER.includes(name)) d.setArmed(d.armed === name ? null : name);
    else if (name === 'Black Hole Encounter' && d.blackHole) sim.session.toggleBlackHole();
    else sim.trigger(name);
  };
  /** 'armed' | 'active' | null */
  const state = (name) => (d.armed === name ? 'armed' : sim.isActive(name) ? 'active' : null);
  const hint = d.armed
    ? `Click the 3D view to launch ${d.armed} · click again or Esc to cancel`
    : 'Asteroid / Alien: arm, then click the 3D view. Black Hole and Solar Storm start immediately; inner failures can be injected repeatedly.';
  return { press, state, hint, armed: d.armed };
}

/** − [typed value] + for the map travel time scale (accepts 100K, 2.5M, 1Mx…). */
export function TimeScale({ sim }) {
  const value = sim.demo.timeScale;
  const [draft, setDraft] = useState(null);
  const [bad, setBad] = useState(false);
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; setDraft(null); return; }
    if (draft === null) return;
    const parsed = parseTimeScale(draft);
    setDraft(null);
    if (parsed === null) { setBad(true); setTimeout(() => setBad(false), 1200); }
    else if (parsed !== value) sim.demo.setTimeScale(parsed);
  };
  return (
    <span className={`ikl-ts ${bad ? 'bad' : ''}`} role="group" aria-label="Map travel time scale" title="Map travel playback speed. Local rocks, burns and repairs run at 1x.">
      <button aria-label="Slower" disabled={value <= MIN_TIME_SCALE} onClick={() => sim.demo.stepTimeScale(-1)}>−</button>
      <input
        aria-label="Time scale"
        value={draft ?? formatTimeScale(value)}
        onFocus={(e) => { setDraft(formatTimeScale(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { cancelled.current = true; setDraft(null); e.currentTarget.blur(); }
        }}
      />
      <button aria-label="Faster" disabled={value >= MAX_TIME_SCALE} onClick={() => sim.demo.stepTimeScale(1)}>+</button>
    </span>
  );
}

/** Play/pause · reset · time scale · reset view. */
export function Transport({ sim, onResetView, labels = {} }) {
  const d = sim.demo;
  return (
    <div className="ikl-transport">
      <button className="ikl-btn" onClick={d.togglePlaying} aria-label={d.playing ? 'Pause demo' : 'Resume demo'}>
        {d.playing ? (labels.pause ?? '❚❚ Pause') : (labels.play ?? '▶ Play')}
      </button>
      <button className="ikl-btn" onClick={sim.clear} title="Reset the DEMO voyage, damage and hazards">{labels.reset ?? '↺ Reset'}</button>
      <TimeScale sim={sim} />
      {onResetView && <button className="ikl-btn" onClick={onResetView}>{labels.view ?? '⌖ Reset view'}</button>}
    </div>
  );
}

/** Physical space-rock settings + preset launch (same fields as the classic Disaster Maker). */
export function RockForm({ sim, launchLabel = 'Launch space rock' }) {
  const d = sim.demo;
  const r = d.rockSettings;
  const parts = sim.session.demoControls.physics.parts ?? [];
  const broken = new Set(d.physics.detached);
  const set = (key, value) => d.setRockSettings((p) => ({ ...p, [key]: value }));
  const num = (key, label, min, max, step) => (
    <label key={key}>
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={r[key]} onChange={(e) => set(key, Number(e.target.value))} />
    </label>
  );
  return (
    <div className="ikl-rock">
      <label className="wide">
        <span>Aim at component</span>
        <select value={r.target_id} onChange={(e) => set('target_id', e.target.value)}>
          <option value="cycle">Cycle through components</option>
          {parts.map((p) => <option key={p.id} value={p.id}>{p.label}{broken.has(p.id) ? ' (wreckage)' : ''}</option>)}
        </select>
      </label>
      {num('mass_kg', 'Mass kg', 1, 5000, 1)}
      {num('speed_m_s', 'Speed m/s', 1, 150, 1)}
      {num('radius_m', 'Radius m', 0.15, 2, 0.05)}
      {num('warning_s', 'Warning s', 2, 120, 1)}
      <button className="ikl-btn ikl-primary wide" onClick={d.launchRock}>{launchLabel}</button>
    </div>
  );
}

const MOVES = [['Main +Z', [0, 0, 1]], ['Rev −Z', [0, 0, -1]], ['Right +X', [1, 0, 0]], ['Left −X', [-1, 0, 0]], ['Up +Y', [0, 1, 0]], ['Down −Y', [0, -1, 0]]];
const TURNS = [['Pitch +', [1, 0, 0]], ['Pitch −', [-1, 0, 0]], ['Yaw +', [0, 1, 0]], ['Yaw −', [0, -1, 0]], ['Roll +', [0, 0, 1]], ['Roll −', [0, 0, -1]]];

/** Finite body-frame burns, coast and automatic course correction (classic DemoPropulsionControls). */
export function Propulsion({ sim }) {
  const d = sim.demo;
  const raw = sim.session.demoControls.physics;
  const [seconds, setSeconds] = useState(2);
  const [error, setError] = useState('');
  const fire = (linear, angular) => {
    try { d.burn({ linear, angular, seconds }); setError(''); } catch (e) { setError(e.message); }
  };
  const noThrust = !d.playing || raw.fuel <= 0 || raw.faults.includes('Thruster Failure');
  const noMain = raw.bonds.engine?.broken || raw.faults.includes('Engine Failure');
  const cc = raw.flightControl?.enabled;
  return (
    <div className="ikl-prop">
      <label className="ikl-inline"><span>Burn s</span><input type="number" min=".1" max="10" step=".1" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /></label>
      <div className="ikl-grid3">
        {MOVES.map(([label, v]) => <button key={label} className="ikl-btn" disabled={noThrust || (label === 'Main +Z' && noMain)} onClick={() => fire(v, [0, 0, 0])}>{label}</button>)}
        {TURNS.map(([label, v]) => <button key={label} className="ikl-btn" disabled={noThrust} onClick={() => fire([0, 0, 0], v)}>{label}</button>)}
      </div>
      <div className="ikl-row">
        <button className="ikl-btn" onClick={d.coast}>Cut thrust · coast</button>
        <button className={`ikl-btn ${cc ? 'on' : ''}`} aria-pressed={Boolean(cc)} onClick={() => d.courseCorrection(!cc)}>Course correction {cc ? 'ON' : 'OFF'}</button>
      </div>
      <p className="ikl-note">Mode {d.physics.mode.toUpperCase()}{d.physics.courseControl ? ` · correction ${d.physics.courseControl.mode}` : ''} · {d.physics.fuelKg.toFixed(1)} kg propellant</p>
      {error && <p className="ikl-err" role="alert">{error}</p>}
    </div>
  );
}

/** DEMO AI: check connection, run once, autopilot (classic DemoAIControls, compact). */
export function AiControls({ sim, onOpenApi }) {
  const ai = sim.demo.ai;
  const on = ai.enabled || ai.busy;
  const offline = Object.entries(ai.subsystems ?? {}).filter(([, s]) => s.mode !== 'online');
  return (
    <div className="ikl-ai">
      <p className="ikl-note">
        Connection: {ai.settings ? `${ai.settings.provider} · ${ai.settings.model || 'model required'}` : 'backend .env'}
        {ai.service && ` · ${ai.service.verified ? 'verified' : ai.service.enabled ? 'configured' : 'not configured'}`}
        {onOpenApi && <> · <button className="ikl-link" onClick={onOpenApi}>AI API</button></>}
      </p>
      <div className="ikl-row">
        <button className="ikl-btn" disabled={ai.checking} onClick={ai.connect}>{ai.checking ? 'Checking…' : 'Check connection'}</button>
        <button className="ikl-btn" disabled={ai.busy || !ai.running} onClick={ai.run}>Run once</button>
        <button className={`ikl-btn ${on ? 'on' : ''}`} onClick={on ? ai.stop : ai.start}>{on ? 'Stop AI' : 'Enable autopilot'}</button>
      </div>
      <p className="ikl-note">{ai.busy ? 'Models analysing · physics continues' : ai.enabled ? 'Autopilot watching for threats and repairable damage' : 'Manual AI cycles only'}</p>
      {offline.map(([id, s]) => <p key={id} className="ikl-warn">{titleCase(id)} · {s.mode}{s.reason ? ` · ${s.reason}` : ''}</p>)}
      {ai.error && <p className="ikl-err" role="alert">{ai.error}</p>}
      {ai.latest && <p className="ikl-note">Main Judging · {ai.latest.executed} action(s) · {ai.latest.summary}</p>}
    </div>
  );
}

/** Measured flight data rows. */
export function flightRows(sim) {
  const p = sim.demo.physics;
  const n = sim.demo.navigation;
  return [
    ['Velocity', `${sim.velocity} km/s`],
    ['Local Δv', `${p.deltaV.toFixed(3)} m/s`],
    ['Course deviation', `${p.deviationM.toFixed(2)} m`],
    ['Angular speed', `${sim.angular} rad/s`],
    ['Attitude', sim.attitude],
    ['Propellant', `${sim.propellantKg} kg`],
    ['Mass', `${sim.massKg} kg`],
    ['Thrust', `${p.forceN.toFixed(0)} N`],
    ['Propulsion', p.mode.toUpperCase()],
    ['Phase', n.phase],
    ['ETA', n.eta_s == null ? 'Repair required' : `${(n.eta_s / 86400).toFixed(1)} d`],
    ['Date (UTC)', sim.demo.celestialDate.slice(0, 10)],
    ['Time scale', sim.timeScale],
    ['Detached', String(p.detached.length)],
  ];
}

export function FlightData({ sim }) {
  return (
    <dl className="ikl-dl">
      {flightRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/** Component damage from bonds + last contact + arm repairs. */
export function Damage({ sim }) {
  const p = sim.demo.physics;
  return (
    <div className="ikl-damage">
      {p.lastImpact && <p className="ikl-warn">Last contact: {p.lastImpact.part} · {p.lastImpact.impulseNs.toFixed(0)} N·s · {(p.lastImpact.utilization * 100).toFixed(0)}% capacity</p>}
      <ul className="ikl-bonds">
        {p.bonds.map((b) => (
          <li key={b.id} className={b.broken ? 'broken' : b.health < 99.95 ? 'hit' : ''}>
            <span>{b.id}</span>
            <i><b style={{ width: `${b.health}%` }} /></i>
            <em>{b.broken ? 'DETACHED' : `${b.health.toFixed(0)}%`}</em>
          </li>
        ))}
      </ul>
      {p.repairs.map((j) => <p className="ikl-note" key={j.arm_id}>{j.rebuild ? 'REBUILD' : 'REPAIR'} · {j.arm_id} → {j.part_id} · {j.status} · contact {j.contactSeconds.toFixed(1)}/10 s</p>)}
      {!p.repairs.length && <p className="ikl-note">No arm repairs in progress.</p>}
    </div>
  );
}

export function Nearby({ sim }) {
  const objs = sim.demo.physics.objects;
  const alien = sim.demo.hazards;
  if (!objs.length && !alien.length) return <p className="ikl-note">No local objects detected.</p>;
  return (
    <ul className="ikl-near">
      {alien.map((h) => <li key={`h${h.id}`} className="hot"><span>{h.name}</span><em>inbound</em></li>)}
      {objs.slice(0, 8).map((o) => (
        <li key={o.id} className={o.closingM_s > 0.5 && o.distanceM < 200 ? 'hot' : ''}>
          <span>{o.id}</span><em>{o.distanceM.toFixed(1)} m · {o.closingM_s.toFixed(1)} m/s</em>
        </li>
      ))}
    </ul>
  );
}

/** What the painted/cinematic scenes should currently show, derived from REAL demo state. */
export function realThreat(sim) {
  const d = sim.demo;
  const p = d.physics;
  const faults = d.activeFaults;
  const rocks = p.objects.filter((o) => o.id.startsWith('rock-') && o.closingM_s > 0.2);
  const alien = d.hazards.find((h) => h.name === 'Alien Encounter');
  const kind = d.blackHole ? 'bh'
    : d.solarStorm ? 'storm'
      : alien ? 'alien'
        : rocks.length ? 'rocks'
          : faults.includes('Spacecraft Fire') ? 'fire'
            : faults.some((f) => f === 'Engine Failure' || f === 'Thruster Failure') ? 'engine'
              : faults.length || sim.event ? 'inner' : null;
  const name = d.blackHole ? 'Black Hole Encounter' : d.solarStorm ? 'Solar Storm' : alien ? 'Alien Encounter'
    : rocks.length ? 'Asteroid Collision' : faults[faults.length - 1] ?? sim.event?.name ?? null;
  return {
    kind,
    name,
    burn: p.mode === 'burn' ? 1 : p.forceN > 1 ? 0.35 : 0,
    damage: Math.max(0, Math.min(1, 1 - p.integrity / 100)),
    impactKey: p.lastImpact ? `${p.lastImpact.part}-${p.lastImpact.impulseNs.toFixed(1)}` : '',
    engineOut: faults.includes('Engine Failure') || Boolean(p.bonds.find((b) => b.id === 'engine')?.broken),
  };
}

/** Mission information rows for the Planetary Trajectories tab. */
export function missionRows(sim) {
  const n = sim.demo.navigation;
  return [
    ['Route', `${sim.nav.origin} → ${sim.nav.destination}`],
    ['Phase', n.phase],
    ['Leg progress', `${(sim.nav.progress * 100).toFixed(1)}%`],
    ['Phase ETA', n.eta_s == null ? 'Propulsion repair required' : `${(n.eta_s / 86400).toFixed(1)} mission days`],
    ['Transfer length', n.transfer_days == null ? '—' : `${n.transfer_days.toFixed(0)} days`],
    ['Mission day', String(sim.day)],
    ['Celestial date', sim.demo.celestialDate.slice(0, 10)],
    ['Velocity', `${sim.velocity} km/s`],
    ['Target orbital speed', n.target_orbital_speed_km_s == null ? '—' : `${n.target_orbital_speed_km_s.toFixed(2)} km/s`],
    ['Map X/Y/Z (AU)', (n.map_position_au ?? []).map((v) => v.toFixed(3)).join(', ') || '—'],
    ['Off planned route', n.route_error_map_units == null ? '—' : `${n.route_error_map_units.toFixed(3)} map units`],
    ['Time scale', sim.timeScale],
    ['In orbit', sim.nav.inOrbit ? 'Yes' : 'No'],
  ];
}

/* ---------------------------------------------------------------- WebGL robustness (K, L) */
// Some WebKit WebViews cannot render to float/half-float targets (no EXT_color_buffer_float),
// silently produce incomplete framebuffers, or fail to compile heavy shaders. These helpers let a
// full-screen shader skin detect that and fall back to 8-bit targets or a CSS background.

/** Half-float when the GPU can render to it, otherwise plain 8-bit. */
export function pickTargetType(gl) {
  const ok = gl.capabilities.isWebGL2 && (gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float'));
  return ok ? THREE.HalfFloatType : THREE.UnsignedByteType;
}

/** True when the render target's framebuffer is complete on this GPU. */
export function targetComplete(gl, target) {
  const ctx = gl.getContext();
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(target);
  const ok = ctx.checkFramebufferStatus(ctx.FRAMEBUFFER) === ctx.FRAMEBUFFER_COMPLETE;
  gl.setRenderTarget(prev);
  return ok;
}

const px = new Uint8Array(4);
/** Brightest of a few sampled pixels (r+g+b) in the default framebuffer, right after drawing it. */
export function probeBrightness(gl, points) {
  const ctx = gl.getContext();
  const w = ctx.drawingBufferWidth;
  const h = ctx.drawingBufferHeight;
  let best = 0;
  for (const [x, y] of points) {
    ctx.readPixels(Math.floor(x * (w - 1)), Math.floor(y * (h - 1)), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    best = Math.max(best, px[0] + px[1] + px[2]);
  }
  return best;
}

/** Report shader compile/link failures once (instead of a silent black frame). */
export function hookShaderErrors(gl, tag, onFail) {
  gl.debug.checkShaderErrors = true;
  gl.debug.onShaderError = (ctx, program, vs, fs) => {
    console.warn(`[${tag}] shader failed — using fallback`, ctx.getProgramInfoLog(program), ctx.getShaderInfoLog(vs), ctx.getShaderInfoLog(fs));
    onFail('shader');
  };
  const canvas = gl.domElement;
  const lost = (e) => { e.preventDefault(); console.warn(`[${tag}] WebGL context lost — using fallback`); onFail('context'); };
  canvas.addEventListener('webglcontextlost', lost);
  return () => canvas.removeEventListener('webglcontextlost', lost);
}

/** WebGL2 present at all? (three.js r16x+ needs it.) `?gl=fallback` forces the CSS fallback for testing. */
export function initialGlMode() {
  try {
    if (new URLSearchParams(location.search).get('gl') === 'fallback') return 'css';
    const c = document.createElement('canvas');
    return c.getContext('webgl2') ? null : 'css';
  } catch {
    return 'css';
  }
}

/** Catches a failed <Canvas> (context creation, shader exceptions) and reports it instead of blanking the page. */
export class GlBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn(`[${this.props.tag}] WebGL view failed — using CSS fallback`, error?.message);
    this.props.onFail?.('error');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
