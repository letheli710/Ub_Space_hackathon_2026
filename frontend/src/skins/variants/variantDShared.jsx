// Shared DEMO console parts for skins D (Immersive HUD), E (Cryo Lens) and J (Cockpit).
// Markup only: each skin styles the `dx-*` classes (and the embedded real pages) in its own CSS,
// scoped under its root, which also carries the `dx-root` class.
import { LocateFixed, Pause, Play, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_TIME_SCALE, MIN_TIME_SCALE, formatTimeScale, parseTimeScale } from '../../data/voyage.js';
import { clock } from '../demoSkin.jsx';
import './variantDShared.css';

/** Hazards that can also be placed with the pointer (click the 3D view). */
export const AIMABLE = ['Asteroid Collision', 'Alien Encounter'];

/** Raw DEMO physics (the classic DemoPropulsionControls reads this, not the telemetry copy). */
const raw = (sim) => sim.session.demoControls.physics;

/** Rock targets, as the classic Disaster Maker builds them. */
export function rockTargets(sim) {
  const detached = sim.demo.physics.detached;
  return [
    { id: 'cycle', label: 'Cycle through components' },
    ...raw(sim).parts.map((p) => ({ id: p.id, label: `${p.label}${detached.includes(p.id) ? ' (wreckage)' : ''}` })),
  ];
}

/** Toggle pointer placement for an aimable hazard. */
export const toggleAim = (sim, name) => sim.demo.setArmed(sim.demo.armed === name ? null : name);

const ROCK_FIELDS = [
  ['mass_kg', 'Mass', 'kg', 1, 5000, 1],
  ['speed_m_s', 'Speed', 'm/s', 1, 150, 1],
  ['radius_m', 'Radius', 'm', 0.15, 2, 0.05],
  ['warning_s', 'Warning', 's', 2, 120, 1],
];

export function RockForm({ sim, launchLabel = 'Launch rock' }) {
  const r = sim.demo.rockSettings;
  const set = (key, value) => sim.demo.setRockSettings((p) => ({ ...p, [key]: value }));
  const targets = rockTargets(sim);
  return (
    <div className="dx-rock">
      <label className="dx-field dx-wide">
        <span>Target</span>
        <select value={targets.some((t) => t.id === r.target_id) ? r.target_id : 'cycle'} onChange={(e) => set('target_id', e.target.value)}>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      {ROCK_FIELDS.map(([key, label, unit, min, max, step]) => (
        <label key={key} className="dx-field">
          <span>{label} <em>{unit}</em></span>
          <input type="number" min={min} max={max} step={step} value={r[key]} onChange={(e) => set(key, Number(e.target.value))} />
        </label>
      ))}
      <button className="dx-btn dx-primary dx-wide" onClick={sim.demo.launchRock}>{launchLabel}</button>
    </div>
  );
}

/** − [typed value] + map travel scale, like the classic Viewer control. Accepts 100K, 2.5M… */
export function TimeScale({ sim }) {
  const value = sim.demo.timeScale;
  const [draft, setDraft] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const cancelled = useRef(false);
  function commit() {
    if (cancelled.current) { cancelled.current = false; setDraft(null); return; }
    if (draft === null) return;
    const parsed = parseTimeScale(draft);
    setDraft(null);
    if (parsed === null) { setInvalid(true); setTimeout(() => setInvalid(false), 1200); }
    else if (parsed !== value) sim.demo.setTimeScale(parsed);
  }
  return (
    <span className={`dx-ts ${invalid ? 'invalid' : ''}`} role="group" aria-label="Map travel scale" title="Map travel playback speed. Local rocks, burns and repairs run at 1x. Type 100K or 2.5M.">
      <button className="dx-btn" aria-label="Slower" disabled={value <= MIN_TIME_SCALE} onClick={() => sim.demo.stepTimeScale(-1)}>−</button>
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
      />
      <button className="dx-btn" aria-label="Faster" disabled={value >= MAX_TIME_SCALE} onClick={() => sim.demo.stepTimeScale(1)}>+</button>
    </span>
  );
}

/** Play/pause · reset · time scale · reset view. `text` renders labels instead of icons. */
export function Transport({ sim, onResetView, text = false }) {
  const playing = sim.demo.playing;
  return (
    <div className="dx-transport">
      <button className="dx-btn dx-icon" aria-label={playing ? 'Pause demo' : 'Resume demo'} title={playing ? 'Pause demo' : 'Resume demo'} onClick={sim.demo.togglePlaying}>
        {text ? (playing ? 'PAUSE' : 'RUN') : playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button className="dx-btn dx-icon" aria-label="Reset demo" title="Reset demo" onClick={sim.clear}>
        {text ? 'RESET' : <RotateCcw size={14} />}
      </button>
      <TimeScale sim={sim} />
      {onResetView && (
        <button className="dx-btn" onClick={onResetView} title="Reset view">
          {text ? 'VIEW' : <><LocateFixed size={14} /> Reset view</>}
        </button>
      )}
    </div>
  );
}

const LINEAR = [['Main +Z', [0, 0, 1]], ['Rev −Z', [0, 0, -1]], ['Right +X', [1, 0, 0]], ['Left −X', [-1, 0, 0]], ['Up +Y', [0, 1, 0]], ['Down −Y', [0, -1, 0]]];
const ANGULAR = [['Pitch +', [1, 0, 0]], ['Pitch −', [-1, 0, 0]], ['Yaw +', [0, 1, 0]], ['Yaw −', [0, -1, 0]], ['Roll +', [0, 0, 1]], ['Roll −', [0, 0, -1]]];

/** Same burns as the classic DemoPropulsionControls. */
export function Propulsion({ sim }) {
  const [seconds, setSeconds] = useState(2);
  const [error, setError] = useState('');
  const phys = raw(sim);
  const fire = (linear, angular) => {
    try { sim.demo.burn({ linear, angular, seconds }); setError(''); } catch (e) { setError(e.message); }
  };
  const blocked = !sim.demo.playing || phys.fuel <= 0 || phys.faults.includes('Thruster Failure');
  const mainBlocked = phys.bonds.engine?.broken || phys.faults.includes('Engine Failure');
  const correcting = Boolean(phys.flightControl?.enabled);
  return (
    <div className="dx-prop">
      <label className="dx-field dx-inline">
        <span>Burn <em>s</em></span>
        <input type="number" min=".1" max="10" step=".1" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
      </label>
      <div className="dx-keys">
        {LINEAR.map(([label, v]) => (
          <button key={label} className="dx-btn dx-key" disabled={blocked || (label === 'Main +Z' && mainBlocked)} onClick={() => fire(v, [0, 0, 0])}>{label}</button>
        ))}
        {ANGULAR.map(([label, v]) => (
          <button key={label} className="dx-btn dx-key" disabled={blocked} onClick={() => fire([0, 0, 0], v)}>{label}</button>
        ))}
      </div>
      <div className="dx-row">
        <button className="dx-btn" onClick={sim.demo.coast}>Cut thrust · coast</button>
        <button className={`dx-btn ${correcting ? 'on' : ''}`} aria-pressed={correcting} onClick={() => sim.demo.courseCorrection(!correcting)}>
          Auto course correction · {correcting ? 'on' : 'off'}
        </button>
      </div>
      {!sim.demo.playing && <p className="dx-note">Resume the demo to fire thrusters.</p>}
      {error && <p className="dx-err" role="alert">{error}</p>}
    </div>
  );
}

/** Same actions as the classic DemoAIControls. */
export function AiControls({ sim, detail = true }) {
  const ai = sim.demo.ai;
  return (
    <div className="dx-ai">
      <p className="dx-note">Connection: {ai.settings ? `${ai.settings.provider} · ${ai.settings.model || 'model required'}` : 'backend .env'}</p>
      <div className="dx-row">
        <button className="dx-btn" disabled={ai.checking} onClick={ai.connect}>{ai.checking ? 'Checking…' : 'Check connection'}</button>
        <button className="dx-btn" disabled={ai.busy || !ai.running} onClick={ai.run}>Run once</button>
        <button className={`dx-btn ${ai.enabled || ai.busy ? 'on' : 'dx-primary'}`} onClick={ai.enabled || ai.busy ? ai.stop : ai.start}>
          {ai.enabled || ai.busy ? 'Stop AI' : 'Enable autopilot'}
        </button>
      </div>
      <p className="dx-note">{ai.busy ? 'Models are analyzing · physics continues' : ai.enabled ? 'Autopilot watching for threats and repairable damage' : 'Manual AI cycles only'}</p>
      {Object.entries(ai.subsystems ?? {}).filter(([, s]) => s.mode !== 'online').map(([id, s]) => (
        <p key={id} className="dx-warn">{id.replaceAll('_', ' ')} · {s.mode} · {s.reason}{s.remaining_s > 0 ? ` · ${s.remaining_s.toFixed(1)} s` : ''}</p>
      ))}
      {ai.service && (
        <p className="dx-note">Gateway: {ai.service.verified ? 'model access verified' : ai.service.enabled && ai.service.systems.every((s) => s.configured) ? 'configured' : 'not configured'}</p>
      )}
      {ai.error && <p className="dx-err" role="alert">{ai.error}</p>}
      {detail && ai.latest && (
        <details className="dx-latest">
          <summary>Main Judging · {ai.latest.executed} executed · {ai.latest.latency_s?.toFixed(1)} s</summary>
          <p>{ai.latest.summary}</p>
          {(ai.latest.proposals ?? []).map((p) => (
            <p key={p.id} className="dx-note">{p.system} → {p.option_id} · {ai.latest.approved_options.includes(p.option_id) ? 'APPROVED' : 'REJECTED'}</p>
          ))}
        </details>
      )}
    </div>
  );
}

/** Flight data rows: [label, value]. */
export function flightRows(sim) {
  const p = sim.demo.physics;
  const nav = sim.demo.navigation;
  return [
    ['Velocity', `${sim.velocity} km/s`],
    ['Attitude', `${sim.attitude} · ${sim.angular} rad/s`],
    ['Propellant', `${sim.propellantKg} kg`],
    ['Mass', `${sim.massKg} kg`],
    ['Thrust', `${p.forceN.toFixed(0)} N · ${p.mode}`],
    ['Course Δv', `${p.deltaV.toFixed(3)} m/s`],
    ['Deviation', `${p.deviationM.toFixed(2)} m`],
    ['Auto course', p.courseControl ? `${p.courseControl.enabled ? p.courseControl.mode : 'off'}` : '—'],
    ['Phase', nav.phase],
    ['ETA', sim.nav.etaDays == null ? 'Propulsion repair required' : `${sim.nav.etaDays.toFixed(1)} days`],
    ['Date (UTC)', sim.demo.celestialDate.slice(0, 10)],
    ['Time scale', sim.timeScale],
  ];
}

export function FlightData({ sim, rows }) {
  return (
    <dl className="dx-dl">
      {(rows ?? flightRows(sim)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

const tone = (v) => (v < 50 ? 'low' : v < 99.95 ? 'mid' : '');

/** Component damage bars from the measured bonds. */
export function Damage({ sim }) {
  const p = sim.demo.physics;
  return (
    <>
      {p.lastImpact && <p className="dx-warn">Last contact · {p.lastImpact.part} · {p.lastImpact.impulseNs.toFixed(0)} N·s · {(p.lastImpact.utilization * 100).toFixed(0)}% capacity</p>}
      <ul className="dx-bars">
        {p.bonds.map((b) => (
          <li key={b.id} className={b.broken ? 'low broken' : tone(b.health)}>
            <span>{b.id}<em>{b.broken ? 'DETACHED' : b.stage}</em></span>
            <b>{b.health.toFixed(0)}</b>
            <i><u style={{ width: `${b.health}%` }} /></i>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Repairs({ sim }) {
  const jobs = sim.demo.physics.repairs;
  if (!jobs.length) return <p className="dx-note">No repairs in progress.</p>;
  return (
    <ul className="dx-list">
      {jobs.map((j) => (
        <li key={j.arm_id}>{j.rebuild ? 'Rebuild' : 'Repair'} · {j.arm_id} → {j.part_id}<em>{j.status} · {j.contactSeconds.toFixed(1)}/10 s</em></li>
      ))}
    </ul>
  );
}

export function Objects({ sim }) {
  const objects = sim.demo.physics.objects;
  if (!objects.length) return <p className="dx-note">No local objects detected.</p>;
  return (
    <ul className="dx-list">
      {objects.slice(0, 8).map((o) => (
        <li key={o.id}>{o.id}<em>{o.distanceM.toFixed(1)} m · closing {o.closingM_s.toFixed(1)} m/s</em></li>
      ))}
    </ul>
  );
}

export function Agents({ sim }) {
  return (
    <ul className="dx-agents">
      {sim.agents.map((a) => (
        <li key={a.id} className={a.ok ? '' : 'warn'} title={a.reason || undefined}><i />{a.name}<em>{a.state}</em></li>
      ))}
    </ul>
  );
}

export function EventLog({ sim, limit = 40 }) {
  return (
    <ol className="dx-log">
      {sim.logs.slice(0, limit).map((l) => (
        <li key={l.id} className={l.alert ? 'alert' : ''}><time>{l.time}</time><span>{l.text}</span></li>
      ))}
    </ol>
  );
}

/** Mission rows for the trajectories pages. */
export function missionRows(sim) {
  const nav = sim.demo.navigation;
  return [
    ['Origin', sim.nav.origin],
    ['Destination', sim.nav.destination],
    ['Phase', sim.nav.phase],
    ['Mission day', String(sim.day)],
    ['ETA', sim.nav.etaDays == null ? 'Propulsion repair required' : `${sim.nav.etaDays.toFixed(1)} days`],
    ['Status', sim.nav.inOrbit ? 'In orbit' : 'En route'],
    ['Date (UTC)', sim.demo.celestialDate.slice(0, 10)],
    ['Route error', `${(nav.route_error_map_units ?? 0).toFixed(3)} map units`],
  ];
}

/** Overlay bits for the 3D view: armed hint and solar-storm flash. Put inside the viewport frame. */
export function ViewOverlays({ sim }) {
  const flash = sim.demo.stormFlash;
  return (
    <>
      {flash > 0 && <div key={flash} className="dx-flash" aria-hidden="true" />}
      {sim.demo.armed && <div className="dx-armed" role="status">Click the view to launch {sim.demo.armed} · Esc to cancel</div>}
    </>
  );
}

export { clock };
