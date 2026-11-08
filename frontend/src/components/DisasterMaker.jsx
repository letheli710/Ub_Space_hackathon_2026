import { AlertTriangle, Bot, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DISASTER_PARAMETERS, INNER_DISASTERS, OUTER_DISASTERS } from '../data/disasters.js';
import ArmControls from './ArmControls.jsx';
import DemoPropulsionControls from './DemoPropulsionControls.jsx';
import DemoAIControls from './DemoAIControls.jsx';

const PRESS_FLASH_MS = 450;

const BLACK_HOLE = 'Black Hole Encounter';
const SOLAR_STORM = 'Solar Storm';

// Demo projectiles and live backend scenario faults share this human control panel.
export default function DisasterMaker({
  live,
  simulation,
  demo,
  demoAI,
  impact,
  onImpactChange: setImpact,
  onLog,
  armed,
  onArm,
  onTrigger,
  activeFaults = [],
  blackHole,
  solarStorm,
  onSolarStorm,
  onToggleBlackHole,
}) {
  const { severity, speed, angle } = DISASTER_PARAMETERS;
  // Inner buttons flash when pressed, then stay lit until the failure is resolved.
  const [pressed, setPressed] = useState(null);
  const [liveSeverity, setLiveSeverity] = useState(severity);
  const physical = live ? simulation.scene?.physics : { impact_targets: [{ id: 'cycle', label: 'Cycle through components', link_name: '' }, ...demo.physics.parts.map(p => ({ id: p.id, label: p.label, link_name: p.id }))] };
  const detached = live ? (simulation.state?.physics?.detached_links ?? []) : Object.entries(demo.physics.bonds).filter(([,bond])=>bond.broken).map(([id])=>id);
  const [demoError, setDemoError] = useState('');
  const timer = useRef();

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (physical?.impact_targets?.length && !physical.impact_targets.some(t => t.id === impact.target_id)) {
      setImpact(previous => ({ ...previous, target_id: physical.impact_targets[0].id }));
    }
  }, [physical, impact.target_id]);

  async function fire(name) {
    if (live) {
      try {
        if (name === 'Asteroid Collision' && physical) {
          const { warning_s, ...nativeImpact } = impact;
          await simulation.injectImpact(nativeImpact);
          onLog(`PHYSICAL ROCK · ${impact.target_id} · ${impact.mass_kg} kg at ${impact.speed_m_s} m/s · awaiting contact`);
        } else {
          await simulation.injectDisaster(name, liveSeverity);
          onLog(`LIVE SCENARIO · ${name} · severity ${liveSeverity}% · backend status updated`);
        }
      } catch { return; }
    } else {
      if (name === 'Asteroid Collision') {
        try { demo.launch(impact); setDemoError(''); } catch (error) { setDemoError(error.message); }
        return;
      }
      onTrigger(name);
    }
    clearTimeout(timer.current);
    setPressed((p) => ({ name, count: (p?.count ?? 0) + 1 }));
    timer.current = setTimeout(() => setPressed(null), PRESS_FLASH_MS);
  }

  const active = (name) =>
    live ? pressed?.name === name : name === BLACK_HOLE ? blackHole : name === SOLAR_STORM ? solarStorm : armed === name;

  return (
    <aside className="panel left">
      <div className="panelhead">
        <AlertTriangle size={18} /> DISASTER MAKER
      </div>
      <p className="muted">
        {live
          ? 'Launch a physical space rock or apply a system fault. The AI sees measured motion and damage on its next cycle.'
          : 'Launch physical rocks at the DEMO spacecraft. Collision loads can detach components and change its motion.'}
      </p>

      <h4>OUTER DISASTERS</h4>
      <div className="choices">
        {OUTER_DISASTERS.map((name) => (
          <button
            key={name}
            className={active(name) ? 'selected' : ''}
            aria-pressed={Boolean(active(name))}
            onClick={() => {
              if (live) fire(name);
              else if (name === BLACK_HOLE) onToggleBlackHole();
              else if (name === SOLAR_STORM) onSolarStorm();
              else onArm(armed === name ? null : name);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <h4>INNER DISASTERS</h4>
      <div className="choices">
        {INNER_DISASTERS.map((name) => {
          const isPressed = pressed?.name === name;
          const unresolved = !live && activeFaults.includes(name);
          return (
            <button
              key={isPressed ? `${name}-${pressed.count}` : name}
              className={['momentary', isPressed && 'fired', unresolved && 'unresolved'].filter(Boolean).join(' ')}
              aria-pressed={live ? isPressed : unresolved}
              title={unresolved ? 'Active failure · click to inject again' : undefined}
              onClick={() => fire(name)}
            >
              {name}
            </button>
          );
        })}
      </div>

      <h4>DISASTER PARAMETERS</h4>
      <dl className="params">
        <div>
          <dt>Severity</dt>
          <dd>{live ? liveSeverity : severity}%</dd>
        </div>
        <div>
          <dt>Relative Speed</dt>
          <dd>{physical ? `${impact.speed_m_s} m/s` : live ? '—' : `${speed} km/s`}</dd>
        </div>
        <div>
          <dt>Approach Angle</dt>
          <dd>{physical ? (live ? 'Exposed component face' : 'From pointer to target') : live ? '—' : `${angle}°`}</dd>
        </div>
      </dl>
      {live && <>
        <label className="muted" htmlFor="live-severity">Scenario severity</label>
        <input id="live-severity" type="range" min="1" max="100" step="1" value={liveSeverity} onChange={event => setLiveSeverity(Number(event.target.value))} />
        <p className="muted">Severity applies to system faults. Asteroid Collision uses the rock settings below; damage requires actual contact. Resume first if paused.</p>
      </>}
      {physical && <fieldset className="arm-controls impact-controls">
        <legend>Physical space rock</legend>
        <label htmlFor="impact-target">Aim at component</label>
        <select id="impact-target" value={impact.target_id} onChange={e => setImpact(p => ({ ...p, target_id: e.target.value }))}>
          {physical.impact_targets.map(t => <option key={t.id} value={t.id}>{t.label}{detached.includes(t.link_name) ? ' (wreckage)' : ''}</option>)}
        </select>
        {[['mass_kg', 'Mass (kg)', 1, 5000, 1], ['speed_m_s', 'Relative speed (m/s)', 1, 150, 1], ['radius_m', 'Radius (m)', .15, 2, .05]].map(([key, label, min, max, step]) => <label key={key}>
          {label}<input type="number" min={min} max={max} step={step} value={impact[key]} onChange={e => setImpact(p => ({ ...p, [key]: Number(e.target.value) }))} />
        </label>)}
        {!live && <label>Preset warning time (s)<input type="number" min="2" max="120" step="1" value={impact.warning_s} onChange={e => setImpact(p => ({ ...p, warning_s: Number(e.target.value) }))} /></label>}
        <button className="primary" onClick={() => fire('Asteroid Collision')}>Launch space rock</button>
        <p className="muted">{live ? 'Ballistic launch toward an exposed face.' : 'Asteroid Collision arms pointer placement: click the 3D view to spawn a rock there, aimed at the selected component. Each click places another; click Asteroid Collision again or Esc to cancel. Launch space rock is a separate preset shot using the warning time. Pointer shots use their actual distance and speed.'} Cycle through components changes the target on every launch. Moving targets can evade it. Failed assemblies remain valid wreckage targets. {live ? 'Restart the backend' : 'Use Reset demo'} to restore the ship.</p>
        {!live && <p className="muted">200 kg at 40 m/s normally leaves repairable damage. Repeated strikes or 5000 kg at 150 m/s can break assemblies. Launches remain available when paused or destroyed; paused rocks move after Resume.</p>}
        {(live ? simulation.state?.physics?.impact_error : demoError) && <p role="alert">{live ? simulation.state.physics.impact_error : demoError}</p>}
      </fieldset>}

      {!live && (
        <div className="tip">
          <Target size={16} />{' '}
          {armed
            ? `Click anywhere in the 3D view to launch ${armed}. Click the button again or press Esc to cancel.`
            : 'Asteroid Collision or Alien Encounter: select then click the view. Placement stays armed until cancelled. Black Hole and Solar Storm start immediately. Inner failures can be injected repeatedly.'}
        </div>
      )}

      {!live && <DemoPropulsionControls demo={demo} />}
      {!live && <DemoAIControls ai={demoAI} />}
      {live && <><div className="panelhead arm-head">
        <Bot size={18} /> ROBOTIC ARM CONTROL
      </div>
      <ArmControls simulation={simulation} onLog={onLog} /></>}
    </aside>
  );
}
