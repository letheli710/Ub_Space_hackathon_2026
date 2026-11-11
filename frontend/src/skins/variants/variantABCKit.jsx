// Functional building blocks shared by skins A (Cryo Glass), B (Flight Deck) and C (Editorial).
// They replicate the classic DisasterMaker / DemoPropulsionControls / DemoAIControls / DemoTelemetry
// behaviour on the real DEMO session and render neutral `kx-*` classes; each skin styles them
// inside its own scope (.va / .vb / .vc).
import { useEffect, useRef, useState } from 'react';
import { MAX_TIME_SCALE, MIN_TIME_SCALE, formatTimeScale, parseTimeScale } from '../../data/voyage.js';

export const POINTER_HAZARDS = ['Asteroid Collision', 'Alien Encounter'];
const words = (id) => String(id).replaceAll('_', ' ');

/** Raw physics state (parts, faults, fuel, flight control) — the classic `demo.physics`. */
const raw = (sim) => sim.session.demoControls.physics;

/** Impact targets exactly as the classic Disaster Maker builds them. */
export function useRockTargets(sim) {
  const parts = raw(sim).parts ?? [];
  const targets = [{ id: 'cycle', label: 'Cycle through components' }, ...parts.map((p) => ({ id: p.id, label: p.label }))];
  const detached = sim.demo.physics.detached;
  const { rockSettings, setRockSettings } = sim.demo;
  useEffect(() => {
    if (targets.length && !targets.some((t) => t.id === rockSettings.target_id)) {
      setRockSettings((p) => ({ ...p, target_id: targets[0].id }));
    }
  }, [targets.length, rockSettings.target_id]);
  return { targets, detached };
}

/** Disaster button state: armed (pointer placement), active (running / unresolved). */
export function hazardState(sim, name) {
  return { armed: sim.demo.armed === name, active: sim.isActive(name), pointer: POINTER_HAZARDS.includes(name) };
}
export const toggleArm = (sim, name) => sim.demo.setArmed(sim.demo.armed === name ? null : name);

/** Space-rock parameters + preset launch. */
export function RockSettings({ sim, compact = false }) {
  const { targets, detached } = useRockTargets(sim);
  const { rockSettings: r, setRockSettings: set } = sim.demo;
  const [error, setError] = useState('');
  const fields = [
    ['mass_kg', 'Mass', 'kg', 1, 5000, 1],
    ['speed_m_s', 'Speed', 'm/s', 1, 150, 1],
    ['radius_m', 'Radius', 'm', 0.15, 2, 0.05],
    ['warning_s', 'Warning', 's', 2, 120, 1],
  ];
  const launch = () => {
    try { sim.session.demoControls.launch(r); setError(''); } catch (e) { setError(e.message); }
  };
  return (
    <div className="kx-rock">
      <label className="kx-field kx-wide">
        <span>Aim at component</span>
        <select value={r.target_id} onChange={(e) => set((p) => ({ ...p, target_id: e.target.value }))}>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.label}{detached.includes(t.id) ? ' (wreckage)' : ''}</option>)}
        </select>
      </label>
      <div className="kx-fields">
        {fields.map(([key, label, unit, min, max, step]) => (
          <label key={key} className="kx-field">
            <span>{label} <em>{unit}</em></span>
            <input type="number" min={min} max={max} step={step} value={r[key]} onChange={(e) => set((p) => ({ ...p, [key]: Number(e.target.value) }))} />
          </label>
        ))}
      </div>
      <button className="kx-btn kx-primary" onClick={launch}>Launch space rock</button>
      {!compact && <p className="kx-note">Preset shot using the warning time. Aimed launches (pointer) use their actual distance. 200 kg at 40 m/s normally leaves repairable damage; 5000 kg at 150 m/s can break assemblies.</p>}
      {error && <p className="kx-error" role="alert">{error}</p>}
    </div>
  );
}

const LINEAR = [['Main +Z', [0, 0, 1]], ['Rev −Z', [0, 0, -1]], ['Right +X', [1, 0, 0]], ['Left −X', [-1, 0, 0]], ['Up +Y', [0, 1, 0]], ['Down −Y', [0, -1, 0]]];
const ANGULAR = [['Pitch +', [1, 0, 0]], ['Pitch −', [-1, 0, 0]], ['Yaw +', [0, 1, 0]], ['Yaw −', [0, -1, 0]], ['Roll +', [0, 0, 1]], ['Roll −', [0, 0, -1]]];

/** Finite body-frame burns, coast, automatic course correction (classic DemoPropulsionControls). */
export function Propulsion({ sim, compact = false }) {
  const [seconds, setSeconds] = useState(2);
  const [error, setError] = useState('');
  const ph = raw(sim);
  const blocked = !sim.demo.playing || ph.fuel <= 0 || ph.faults.includes('Thruster Failure');
  const engineOut = ph.bonds.engine?.broken || ph.faults.includes('Engine Failure');
  const correcting = Boolean(ph.flightControl?.enabled);
  const fire = (linear, angular) => {
    try { sim.demo.burn({ linear, angular, seconds }); setError(''); } catch (e) { setError(e.message); }
  };
  return (
    <div className="kx-prop">
      <label className="kx-field kx-inline">
        <span>Burn duration <em>s</em></span>
        <input type="number" min=".1" max="10" step=".1" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
      </label>
      <div className="kx-pad">
        {LINEAR.map(([label, v]) => <button key={label} className="kx-btn" disabled={blocked || (label === 'Main +Z' && engineOut)} onClick={() => fire(v, [0, 0, 0])}>{label}</button>)}
        {ANGULAR.map(([label, v]) => <button key={label} className="kx-btn" disabled={blocked} onClick={() => fire([0, 0, 0], v)}>{label}</button>)}
      </div>
      <div className="kx-row">
        <button className="kx-btn" onClick={sim.demo.coast}>Cut thrust · coast</button>
        <button className={`kx-btn ${correcting ? 'kx-on' : ''}`} aria-pressed={correcting} onClick={() => sim.demo.courseCorrection(!correcting)}>
          Auto course correction {correcting ? 'ON' : 'OFF'}
        </button>
      </div>
      {!compact && <p className="kx-note">+Z is the nose, +Y up, +X right. Manual burns do not call an AI model. Course correction uses Propelling's standing authority and yields to deliberate manoeuvres; cutting thrust disables it.</p>}
      {!sim.demo.playing && <p className="kx-note">Resume the simulation to fire burns.</p>}
      {error && <p className="kx-error" role="alert">{error}</p>}
    </div>
  );
}

/** DEMO AI management (classic DemoAIControls). */
export function AiControls({ sim, compact = false }) {
  const ai = sim.demo.ai;
  const offline = Object.entries(ai.subsystems ?? {}).filter(([, s]) => s.mode !== 'online');
  return (
    <div className="kx-ai">
      <p className="kx-note">Connection: {ai.settings ? `${ai.settings.provider} · ${ai.settings.model || 'model required'} · saved in AI API` : 'backend .env'}</p>
      <div className="kx-row">
        <button className="kx-btn" disabled={ai.checking} onClick={ai.connect}>{ai.checking ? 'Checking…' : 'Check connection'}</button>
        <button className="kx-btn" disabled={ai.busy || !ai.running} onClick={ai.run}>Run AI once</button>
        <button className={`kx-btn ${ai.enabled || ai.busy ? 'kx-on' : 'kx-primary'}`} onClick={ai.enabled || ai.busy ? ai.stop : ai.start}>
          {ai.enabled || ai.busy ? 'Stop DEMO AI' : 'Enable autopilot'}
        </button>
      </div>
      <p className="kx-state">{ai.busy ? 'Models are analysing · physics continues' : ai.enabled ? 'Autopilot watching for threats and repairable damage' : 'Manual AI cycles only'}</p>
      {offline.map(([id, s]) => <p key={id} className="kx-error" role="status">{words(id)} · {s.mode} · {s.reason}{s.remaining_s > 0 ? ` · ${s.remaining_s.toFixed(1)} s` : ''}</p>)}
      {ai.service && (
        <p className="kx-note">Gateway: {ai.service.verified ? 'MODEL ACCESS VERIFIED' : ai.service.enabled && ai.service.systems.every((s) => s.configured) ? 'CONFIGURED' : 'NOT CONFIGURED'}{!compact && ` · ${ai.service.systems.map((s) => `${s.id}: ${s.model}`).join(' · ')}`}</p>
      )}
      {ai.error && <p className="kx-error" role="alert">{ai.error}</p>}
      {ai.latest && (
        <details className="kx-latest">
          <summary>Main Judging · {ai.latest.executed} executed · {ai.latest.latency_s?.toFixed(1)} s</summary>
          <p>{ai.latest.summary}</p>
          <p className="kx-note">{ai.latest.combination_rationale}</p>
          {Object.entries(ai.latest.errors ?? {}).map(([role, e]) => <p className="kx-error" key={role}>{role}: {e}</p>)}
          {ai.latest.proposals.map((p) => <p className="kx-note" key={p.id}>{p.system} → {p.option_id} · {ai.latest.approved_options.includes(p.option_id) ? 'APPROVED' : 'REJECTED'}</p>)}
        </details>
      )}
    </div>
  );
}

/** − [typed value] + time-scale control (accepts 100000, 100K, 2.5M, 1Mx…). */
export function TimeScale({ sim }) {
  const value = sim.demo.timeScale;
  const [draft, setDraft] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; setDraft(null); return; }
    if (draft === null) return;
    const parsed = parseTimeScale(draft);
    setDraft(null);
    if (parsed === null) { setInvalid(true); setTimeout(() => setInvalid(false), 1200); } else if (parsed !== value) sim.demo.setTimeScale(parsed);
  };
  return (
    <div className={`kx-scale ${invalid ? 'invalid' : ''}`} role="group" aria-label="Map travel time scale" title="Map travel playback speed. Local rocks, burns and repairs run at 1x. Type 100K or 2.5M.">
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
        spellCheck={false}
        autoComplete="off"
      />
      <button aria-label="Faster" disabled={value >= MAX_TIME_SCALE} onClick={() => sim.demo.stepTimeScale(1)}>+</button>
    </div>
  );
}

/** Overlays for the 3D view: armed hint and solar-storm flash. */
export function ViewOverlays({ sim }) {
  const { armed, stormFlash } = sim.demo;
  return (
    <>
      {stormFlash > 0 && <div key={stormFlash} className="kx-storm" aria-hidden="true" />}
      {armed && (
        <div className="kx-armed" role="status">
          Click the view to launch <b>{armed}</b> · Esc to cancel
          <button onClick={() => sim.demo.setArmed(null)}>Cancel</button>
        </div>
      )}
    </>
  );
}

const tone = (h) => (h < 50 ? 'bad' : h < 99.95 ? 'warn' : 'ok');

/** Component damage from the physics bonds. */
export function DamageList({ sim }) {
  return (
    <ul className="kx-damage">
      {sim.demo.physics.bonds.map((b) => (
        <li key={b.id} className={b.broken ? 'bad' : tone(b.health)}>
          <span>{b.id}</span>
          <em>{b.broken ? 'DETACHED' : b.stage.toUpperCase()}</em>
          <b>{b.health.toFixed(1)}%</b>
          <i><s style={{ width: `${Math.max(0, Math.min(100, b.health))}%` }} /></i>
        </li>
      ))}
    </ul>
  );
}

/** Repairs, last impact, nearby objects, subsystem status — short text rows. */
export function PhysicsNotes({ sim, limit = 6 }) {
  const p = sim.demo.physics;
  return (
    <div className="kx-notes">
      {p.lastImpact && <p className="kx-error">Last contact: {p.lastImpact.part} · {p.lastImpact.impulseNs.toFixed(0)} N·s · {(p.lastImpact.utilization * 100).toFixed(0)}% capacity</p>}
      <h5>Repairs</h5>
      {p.repairs.length ? p.repairs.map((j) => (
        <p key={j.arm_id}>{j.rebuild ? 'REBUILD' : 'REPAIR'} · {j.arm_id} → {j.part_id} · {j.status} · contact {j.contactSeconds.toFixed(1)}/10 s</p>
      )) : <p className="kx-dim">No repairs in progress.</p>}
      <h5>Nearby rocks &amp; debris</h5>
      {p.objects.length ? p.objects.slice(0, limit).map((o) => (
        <p key={o.id}>{o.id} · {o.distanceM.toFixed(1)} m · closing {o.closingM_s.toFixed(1)} m/s</p>
      )) : <p className="kx-dim">No local objects detected.</p>}
      <h5>Subsystems</h5>
      {Object.entries(p.systems).map(([id, s]) => (
        <p key={id} className={s.mode === 'offline' ? 'kx-error' : ''}>{words(id)} · {s.mode.toUpperCase()}{s.reason ? ` · ${s.reason}` : ''}</p>
      ))}
      {p.courseControl && <p className="kx-dim">Course correction · {p.courseControl.mode.toUpperCase()}{p.courseControl.reason ? ` · ${p.courseControl.reason}` : ''}</p>}
      <p className="kx-dim">Solar generation {p.solarProtection ? 'ISOLATED' : 'ACTIVE'} · {p.arms.filter((a) => a.available).length}/{p.arms.length} arms attached</p>
    </div>
  );
}

/** Flight data rows: [label, value]. */
export function flightRows(sim) {
  const p = sim.demo.physics;
  const n = sim.demo.navigation;
  return [
    ['Velocity', `${sim.velocity} km/s`],
    ['Attitude', sim.attitude],
    ['Angular speed', `${sim.angular} rad/s`],
    ['Propellant', `${sim.propellantKg} kg`],
    ['Mass', `${sim.massKg} kg`],
    ['Thrust', `${p.forceN.toFixed(0)} N`],
    ['Propulsion', p.mode.toUpperCase()],
    ['Course deviation', `${p.deviationM.toFixed(2)} m`],
    ['Detached', String(p.detached.length)],
    ...(n ? [['Celestial date', sim.demo.celestialDate.slice(0, 10)]] : []),
  ];
}

/** Mission rows for the trajectories page. */
export function missionRows(sim) {
  const n = sim.demo.navigation;
  return [
    ['Origin', sim.nav.origin],
    ['Destination', sim.nav.destination],
    ['Phase', sim.nav.phase],
    ['Mission day', String(sim.day)],
    ['Phase ETA', sim.nav.etaDays == null ? 'Propulsion repair required' : `${sim.nav.etaDays.toFixed(1)} days`],
    ['Celestial date', sim.demo.celestialDate.slice(0, 10)],
    ['Velocity', `${sim.velocity} km/s`],
    ...(n ? [
      ['Map position', n.map_position_au.map((v) => v.toFixed(3)).join(', ') + ' AU'],
      ['Route error', `${n.route_error_map_units.toFixed(3)} map u`],
      ['Target orbital speed', `${n.target_orbital_speed_km_s.toFixed(2)} km/s`],
    ] : []),
    ['Time scale', sim.timeScale],
  ];
}
