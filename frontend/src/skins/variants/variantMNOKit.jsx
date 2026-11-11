// Shared DEMO console parts for skins M (Meteor Storm), N (Ink Cosmos) and O (Woodblock).
// Functional copies of the classic Disaster Maker, propulsion/AI controls, Viewer transport and
// DEMO telemetry, rendered with neutral `mk-*` class names that each skin styles in its own CSS.
// Everything here reads and drives the REAL demo session (`sim` from useSkinSim).
import { Component, useEffect, useRef, useState } from 'react';
import { MAX_TIME_SCALE, MIN_TIME_SCALE, formatTimeScale, parseTimeScale } from '../../data/voyage.js';
import { INNER, OUTER } from '../demoSkin.jsx';

const ARMABLE = ['Asteroid Collision', 'Alien Encounter'];
const fix = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const words = (id) => String(id).replaceAll('_', ' ');
const DefaultH = ({ title }) => <h4 className="mk-h">{title}</h4>;

/* ------------------------------------------------------------------ hooks */

/** A key that changes on every real physical contact (sim.demo.physics.lastImpact). */
export function impactKey(sim) {
  const i = sim.demo.physics.lastImpact;
  return i ? `${i.time}-${i.part}-${i.impulseNs}` : '';
}

/** Calls `fn(lastImpact)` once per real impact (not for the one already present at mount). */
export function useOnImpact(sim, fn) {
  const key = impactKey(sim);
  const seen = useRef(key);
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (key && key !== seen.current) cb.current(sim.demo.physics.lastImpact);
    seen.current = key;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Arming a pointer launch needs the real 3D view: switch to it automatically. */
export function useArmedSwitch(sim, setView, physics = 'physics') {
  const armed = sim.demo.armed;
  useEffect(() => {
    if (armed) setView(physics);
  }, [armed]); // eslint-disable-line react-hooks/exhaustive-deps
}

let shaderWarned = false;
/**
 * Shader-failure guard for custom-shader canvases. Pass `onCreated` to <Canvas>; `failed` turns true
 * if any program fails to compile or link, so the skin can show a CSS fallback.
 */
export function useShaderGuard(tag) {
  const [failed, setFailed] = useState(false);
  const onCreated = ({ gl }) => {
    gl.debug.checkShaderErrors = true;
    gl.debug.onShaderError = (ctx, program, vs, fs) => {
      if (!shaderWarned) {
        shaderWarned = true;
        const info = ctx.getProgramInfoLog(program) || ctx.getShaderInfoLog(fs) || ctx.getShaderInfoLog(vs);
        console.warn(`[${tag}] shader failed; using fallback background.`, ctx.getParameter(ctx.RENDERER), info);
      }
      setFailed(true);
    };
  };
  return [failed, onCreated];
}

/** Catches WebGL/Canvas creation errors so a skin falls back to its CSS background instead of a blank page. */
export class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.warn('[skin] 3D scene unavailable; using fallback.', error?.message);
    this.props.onError?.(error);
  }
  render() {
    return this.state.error ? (this.props.fallback ?? null) : this.props.children;
  }
}

/* -------------------------------------------------------------- threats */

const seenAt = new Map();
/**
 * Real threats for threat boards: nearby physics rocks/debris (distance, closing speed, time to
 * contact), inbound launched hazards, the black hole and an incoming solar storm.
 */
export function realThreats(sim) {
  const out = [];
  for (const o of sim.demo.physics.objects) {
    const closing = o.closingM_s;
    const tti = closing > 0.05 ? o.distanceM / closing : null;
    out.push({ id: String(o.id).replace('rock-', 'R-'), kind: String(o.id).startsWith('rock') ? 'rock' : 'debris', d: o.distanceM, closing, tti });
  }
  const now = performance.now();
  for (const h of sim.demo.hazards) {
    if (!seenAt.has(h.id)) seenAt.set(h.id, now);
    const tti = Math.max(0, h.eta - (now - seenAt.get(h.id)) / 1000);
    out.push({ id: h.name === 'Alien Encounter' ? `UNK-${h.id}` : `HZ-${h.id}`, kind: 'alien', name: h.name, d: null, closing: null, tti });
  }
  out.sort((a, b) => (a.tti ?? 1e9) - (b.tti ?? 1e9) || (a.d ?? 1e9) - (b.d ?? 1e9));
  if (sim.demo.solarStorm) out.push({ id: 'FLARE', kind: 'storm', name: 'Solar storm front', d: null, tti: null });
  if (sim.demo.blackHole) out.push({ id: 'BH-1', kind: 'bh', name: 'Black hole', d: null, tti: null });
  return out;
}

/* ------------------------------------------------------------- controls */

/** Outer/inner disasters with the classic behaviour: arm pointer launches, toggle the black hole, fire faults. */
export function HazardControls({ sim, H = DefaultH, label = (n) => n }) {
  const { armed, setArmed } = sim.demo;
  const outer = (n) => {
    if (ARMABLE.includes(n)) setArmed(armed === n ? null : n);
    else if (n === 'Black Hole Encounter') sim.session.toggleBlackHole();
    else sim.trigger(n);
  };
  const on = (n) => (ARMABLE.includes(n) ? armed === n : sim.isActive(n));
  return (
    <div className="mk mk-hazards">
      <H title="Outer disasters" k="outer" />
      <div className="mk-choices">
        {OUTER.map((n) => (
          <button key={n} className={on(n) ? 'on' : ''} aria-pressed={on(n)} onClick={() => outer(n)}>{label(n)}</button>
        ))}
      </div>
      <H title="Inner disasters" k="inner" />
      <div className="mk-choices">
        {INNER.map((n) => (
          <button key={n} className={sim.demo.activeFaults.includes(n) ? 'on' : ''} aria-pressed={sim.demo.activeFaults.includes(n)} onClick={() => sim.trigger(n)}>{label(n)}</button>
        ))}
      </div>
      <p className="mk-note">
        {armed ? `${armed} armed · Click the view to launch · Esc to cancel` : 'Asteroid / Alien: arm, then click the view. Black Hole toggles · Solar Storm launches from the Sun.'}
      </p>
    </div>
  );
}

/** Physical space-rock settings + the preset "Launch rock" shot. */
export function RockControls({ sim, H = DefaultH }) {
  const r = sim.demo.rockSettings;
  const set = (k, v) => sim.demo.setRockSettings((p) => ({ ...p, [k]: v }));
  const parts = sim.session.demoControls.physics.parts ?? [];
  const broken = sim.demo.physics.detached;
  return (
    <div className="mk mk-rock">
      <H title="Space rock" k="rock" />
      <label className="mk-field wide">
        <span>Aim at</span>
        <select value={r.target_id} onChange={(e) => set('target_id', e.target.value)}>
          <option value="cycle">Cycle through components</option>
          {parts.map((p) => <option key={p.id} value={p.id}>{p.label}{broken.includes(p.id) ? ' (wreckage)' : ''}</option>)}
        </select>
      </label>
      <div className="mk-fields">
        {[['mass_kg', 'Mass kg', 1, 5000, 1], ['speed_m_s', 'Speed m/s', 1, 150, 1], ['radius_m', 'Radius m', 0.15, 2, 0.05], ['warning_s', 'Warning s', 2, 120, 1]].map(([k, l, min, max, step]) => (
          <label key={k} className="mk-field">
            <span>{l}</span>
            <input type="number" min={min} max={max} step={step} value={r[k]} onChange={(e) => set(k, Number(e.target.value))} />
          </label>
        ))}
      </div>
      <button className="mk-primary" onClick={sim.demo.launchRock}>Launch rock</button>
    </div>
  );
}

/** − [typed value] + map travel scale (accepts 100000, 100K, 2.5M…). */
export function TimeScale({ sim }) {
  const value = sim.demo.timeScale;
  const [draft, setDraft] = useState(null);
  const [bad, setBad] = useState(false);
  const cancel = useRef(false);
  const commit = () => {
    if (cancel.current || draft === null) {
      cancel.current = false;
      setDraft(null);
      return;
    }
    const parsed = parseTimeScale(draft);
    setDraft(null);
    if (parsed === null) {
      setBad(true);
      setTimeout(() => setBad(false), 1200);
    } else if (parsed !== value) sim.demo.setTimeScale(parsed);
  };
  return (
    <div className={`mk-scale ${bad ? 'bad' : ''}`} role="group" aria-label="Map travel scale" title="Map travel playback speed. Local rocks, burns and repairs run at 1x.">
      <button aria-label="Slower" disabled={value <= MIN_TIME_SCALE} onClick={() => sim.demo.stepTimeScale(-1)}>−</button>
      <input
        aria-label="Time scale"
        value={draft ?? formatTimeScale(value)}
        onFocus={(e) => {
          setDraft(formatTimeScale(value));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancel.current = true;
            e.currentTarget.blur();
          }
        }}
        spellCheck={false}
        autoComplete="off"
      />
      <button aria-label="Faster" disabled={value >= MAX_TIME_SCALE} onClick={() => sim.demo.stepTimeScale(1)}>+</button>
    </div>
  );
}

/** Play/pause · reset · time scale · reset view · stylised/physics view switch. */
export function Transport({ sim, onResetView, view, setView, names = ['Scene', 'Physics'] }) {
  return (
    <div className="mk mk-transport">
      <button className="mk-play" onClick={sim.demo.togglePlaying} aria-label={sim.demo.playing ? 'Pause' : 'Play'}>
        {sim.demo.playing ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button onClick={sim.clear} title="Reset demo">↺ Reset</button>
      <TimeScale sim={sim} />
      <button onClick={onResetView} disabled={view !== 'physics'} title="Reset the 3D camera (Physics view)">⌖ View</button>
      <div className="mk-switch" role="group" aria-label="View">
        <button className={view !== 'physics' ? 'on' : ''} aria-pressed={view !== 'physics'} onClick={() => setView('scene')}>{names[0]}</button>
        <button className={view === 'physics' ? 'on' : ''} aria-pressed={view === 'physics'} onClick={() => setView('physics')}>{names[1]}</button>
      </div>
    </div>
  );
}

const LINEAR = [['Main +Z', [0, 0, 1]], ['Reverse −Z', [0, 0, -1]], ['Right +X', [1, 0, 0]], ['Left −X', [-1, 0, 0]], ['Up +Y', [0, 1, 0]], ['Down −Y', [0, -1, 0]]];
const ANGULAR = [['Pitch +', [1, 0, 0]], ['Pitch −', [-1, 0, 0]], ['Yaw +', [0, 1, 0]], ['Yaw −', [0, -1, 0]], ['Roll +', [0, 0, 1]], ['Roll −', [0, 0, -1]]];

/** Finite body-frame burns, coast and automatic course correction (classic DemoPropulsionControls). */
export function PropulsionControls({ sim, H = DefaultH }) {
  const [seconds, setSeconds] = useState(2);
  const [error, setError] = useState('');
  const raw = sim.session.demoControls.physics;
  const fire = (linear, angular) => {
    try {
      sim.demo.burn({ linear, angular, seconds });
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const off = !sim.demo.playing || raw.fuel <= 0 || raw.faults.includes('Thruster Failure');
  const mainOff = raw.bonds.engine?.broken || raw.faults.includes('Engine Failure');
  const cc = raw.flightControl?.enabled;
  return (
    <div className="mk mk-prop">
      <H title="Propulsion" k="prop" />
      <div className="mk-row">
        <label className="mk-field">
          <span>Burn s</span>
          <input type="number" min=".1" max="10" step=".1" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
        </label>
        <span className={`mk-mode ${sim.demo.physics.mode === 'burn' ? 'hot' : ''}`}>{sim.demo.physics.mode.toUpperCase()}</span>
      </div>
      <div className="mk-choices three">
        {LINEAR.map(([l, v]) => <button key={l} disabled={off || (l === 'Main +Z' && mainOff)} onClick={() => fire(v, [0, 0, 0])}>{l}</button>)}
        {ANGULAR.map(([l, v]) => <button key={l} disabled={off} onClick={() => fire([0, 0, 0], v)}>{l}</button>)}
      </div>
      <div className="mk-choices">
        <button onClick={sim.demo.coast}>Cut thrust · coast</button>
        <button className={cc ? 'on' : ''} aria-pressed={Boolean(cc)} onClick={() => sim.demo.courseCorrection(!cc)}>
          Course correction {cc ? 'on' : 'off'}
        </button>
      </div>
      {error && <p className="mk-alert" role="alert">{error}</p>}
    </div>
  );
}

/** DEMO AI: check connection, run once, autopilot (classic DemoAIControls). */
export function AiControls({ sim, H = DefaultH }) {
  const ai = sim.demo.ai;
  const latest = ai.latest;
  return (
    <div className="mk mk-ai">
      <H title="DEMO AI" k="ai" />
      <p className="mk-note">{ai.settings ? `${ai.settings.provider} · ${ai.settings.model || 'model required'}` : 'Connection: backend .env'}</p>
      <div className="mk-choices three">
        <button disabled={ai.checking} onClick={ai.connect}>{ai.checking ? 'Checking…' : 'Check connection'}</button>
        <button disabled={ai.busy || !ai.running} onClick={ai.run}>Run once</button>
        <button className={ai.enabled ? 'on' : ''} onClick={ai.enabled || ai.busy ? ai.stop : ai.start}>{ai.enabled || ai.busy ? 'Stop AI' : 'Autopilot'}</button>
      </div>
      <p className="mk-note">{ai.busy ? 'Models analysing · physics continues' : ai.enabled ? 'Autopilot watching for threats and damage' : 'Manual AI cycles only'}</p>
      {ai.service && <p className="mk-note">Gateway: {ai.service.verified ? 'MODEL ACCESS VERIFIED' : ai.service.enabled && ai.service.systems.every((s) => s.configured) ? 'CONFIGURED' : 'NOT CONFIGURED'}</p>}
      {ai.error && <p className="mk-alert" role="alert">{ai.error}</p>}
      {latest && <p className="mk-note">Main Judging · {latest.executed} actions · {fix(latest.latency_s)} s · {latest.summary}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ telemetry */

const tone = (v) => (v < 50 ? 'bad' : v < 75 ? 'low' : v < 99.95 ? 'warn' : '');

function Bar({ label, value, sub }) {
  return (
    <div className={`mk-bar ${tone(value)}`}>
      <span>{label}{sub && <small>{sub}</small>}</span>
      <i><b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i>
      <em>{Math.round(value)}</em>
    </div>
  );
}

/**
 * Real DEMO telemetry. `only` picks sections: systems, flight, damage, repairs, objects, agents.
 * `sysLabel(key, label)` lets a skin translate system names.
 */
export function Telemetry({ sim, H = DefaultH, only = ['systems', 'flight', 'damage', 'repairs', 'objects', 'agents'], sysLabel = (k, l) => l }) {
  const p = sim.demo.physics;
  const nav = sim.demo.navigation;
  const has = (k) => only.includes(k);
  return (
    <div className="mk mk-tele">
      {has('systems') && (
        <>
          <H title="Systems" k="systems" />
          {sim.systems.map((s) => <Bar key={s.key} label={sysLabel(s.key, s.label)} value={s.value} />)}
        </>
      )}
      {has('flight') && (
        <>
          <H title="Flight data" k="flight" />
          <dl className="mk-dl">
            <div><dt>Velocity</dt><dd>{sim.velocity} km/s</dd></div>
            <div><dt>Propellant</dt><dd>{sim.propellantKg} kg</dd></div>
            <div><dt>Mass</dt><dd>{sim.massKg} kg</dd></div>
            <div><dt>Attitude</dt><dd>{sim.attitude} · {sim.angular}</dd></div>
            <div><dt>Propulsion</dt><dd className={p.mode === 'burn' ? 'hot' : ''}>{p.mode.toUpperCase()}</dd></div>
            <div><dt>Course ctl</dt><dd>{p.courseControl ? `${p.courseControl.enabled ? 'ON' : 'OFF'} · ${words(p.courseControl.mode)}` : '—'}</dd></div>
            <div><dt>Map scale</dt><dd>{sim.timeScale}</dd></div>
            <div><dt>Day</dt><dd>{sim.day} · {sim.demo.celestialDate.slice(0, 10)}</dd></div>
            <div><dt>Phase</dt><dd>{nav.phase}</dd></div>
            <div><dt>ETA</dt><dd>{sim.nav.etaDays == null ? 'Repair propulsion' : `${sim.nav.etaDays.toFixed(1)} d`}</dd></div>
            <div><dt>Route</dt><dd>{sim.nav.origin} → {sim.nav.destination} · {Math.round(sim.nav.progress * 100)}%</dd></div>
            <div><dt>Deviation</dt><dd>{fix(p.deviationM, 2)} m · Δv {fix(p.deltaV, 3)}</dd></div>
          </dl>
        </>
      )}
      {has('damage') && (
        <>
          <H title="Component damage" k="damage" />
          {p.lastImpact && <p className="mk-alert">Last contact: {words(p.lastImpact.part)} · {fix(p.lastImpact.impulseNs, 0)} N·s · {fix(p.lastImpact.utilization * 100, 0)}% capacity</p>}
          {p.bonds.map((b) => <Bar key={b.id} label={words(b.id)} sub={b.broken ? 'DETACHED' : b.stage.toUpperCase()} value={b.health} />)}
        </>
      )}
      {has('repairs') && (
        <>
          <H title="Repairs" k="repairs" />
          {!p.repairs.length && <p className="mk-note">No repair jobs.</p>}
          {p.repairs.map((j) => (
            <p className="mk-note" key={j.arm_id}>{j.rebuild ? 'REBUILD' : 'REPAIR'} · {j.arm_id} → {words(j.part_id)} · {j.status} · {fix(j.contactSeconds)}/10 s</p>
          ))}
        </>
      )}
      {has('objects') && (
        <>
          <H title="Nearby objects" k="objects" />
          {!p.objects.length && <p className="mk-note">No local objects detected.</p>}
          {p.objects.slice(0, 8).map((o) => (
            <p className={`mk-note ${o.closingM_s > 0 ? 'closing' : ''}`} key={o.id}>{o.id} · {fix(o.distanceM)} m · closing {fix(o.closingM_s)} m/s</p>
          ))}
        </>
      )}
      {has('agents') && (
        <>
          <H title="AI agents" k="agents" />
          {sim.agents.map((a) => (
            <div key={a.id} className={`mk-agent ${a.ok ? '' : 'warn'}`} title={a.reason || ''}>
              <i />
              <b>{a.name}</b>
              <span>{a.state}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Event log, newest first. */
export function EventLog({ sim, H = DefaultH, limit = 40 }) {
  return (
    <div className="mk mk-log">
      <H title="Event log" k="log" />
      <ol>
        {sim.logs.slice(0, limit).map((l) => (
          <li key={l.id} className={l.alert ? 'alert' : ''}><time>{l.time}</time>{l.text}</li>
        ))}
      </ol>
    </div>
  );
}

/** "Click the view to launch · Esc to cancel" while a pointer launch is armed. */
export function ArmedHint({ sim, className = '' }) {
  if (!sim.demo.armed) return null;
  return (
    <div className={`mk-armed ${className}`} role="status">
      {sim.demo.armed} armed · Click the view to launch · Esc to cancel
      <button onClick={() => sim.demo.setArmed(null)}>Cancel</button>
    </div>
  );
}

/** Mission info for the Planetary Trajectories tab. */
export function MissionInfo({ sim, H = DefaultH }) {
  const nav = sim.demo.navigation;
  return (
    <div className="mk mk-mission">
      <H title="Mission" k="mission" />
      <dl className="mk-dl">
        <div><dt>Origin</dt><dd>{sim.nav.origin}</dd></div>
        <div><dt>Destination</dt><dd>{sim.nav.destination}</dd></div>
        <div><dt>Phase</dt><dd>{nav.phase}{sim.nav.inOrbit ? ' · in orbit' : ''}</dd></div>
        <div><dt>Progress</dt><dd>{Math.round(sim.nav.progress * 100)}%</dd></div>
        <div><dt>ETA</dt><dd>{sim.nav.etaDays == null ? 'Propulsion repair required' : `${sim.nav.etaDays.toFixed(1)} mission days`}</dd></div>
        <div><dt>Mission day</dt><dd>{sim.day}</dd></div>
        <div><dt>Date (UTC)</dt><dd>{sim.demo.celestialDate.slice(0, 10)}</dd></div>
        <div><dt>Velocity</dt><dd>{sim.velocity} km/s</dd></div>
        <div><dt>Map scale</dt><dd>{sim.timeScale}</dd></div>
        <div><dt>Status</dt><dd>{sim.status}</dd></div>
      </dl>
      <H title="Selected" k="selected" />
      <p className="mk-note">{sim.session.mapInfo}</p>
      <p className="mk-note">DEMO map: real planet orbits from JPL elements and the voyage flown on the Generator tab. Pause, reset and speed are shared with the Generator.</p>
    </div>
  );
}
