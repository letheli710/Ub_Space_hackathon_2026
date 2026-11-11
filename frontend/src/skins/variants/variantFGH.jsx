// Shared, unstyled plumbing for skins F (CRT), G (Comic) and H (Blueprint): the stylised ship
// driven by real DEMO physics, and the Generator console logic (hazards, rock, burns, AI, time scale).
// Each skin draws its own markup around these.
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { ARMS, MODULES } from '../../components/station/StationShip.jsx';
import { SolarArrays, Wing } from '../../components/station/modules.jsx';
import { materials } from '../../components/station/materials.js';
import { MAX_TIME_SCALE, MIN_TIME_SCALE, formatTimeScale, parseTimeScale } from '../../data/voyage.js';
import { DEMO_PARTS } from '../../simulation/demoShip.js';
import { INNER, OUTER } from '../demoSkin.jsx';

export const HAZARDS = [...OUTER, ...INNER];
export const PART_LABEL = Object.fromEntries(DEMO_PARTS.map((p) => [p.id, p.label]));
export const POINTER_HAZARDS = ['Asteroid Collision', 'Alien Encounter'];

/* ───────────── live ship (stylised views) ───────────── */

/** Bond health by part id, from real telemetry. */
export function partHealth(sim) {
  return Object.fromEntries(sim.demo.physics.bonds.map((b) => [b.id, b]));
}

function LivePart({ id, bond, status, arm, spin }) {
  const ref = useRef();
  const Module = MODULES.find((m) => m.id === id)?.component;
  useFrame(() => {
    // Skins read these to draw damage in their own style (G tints, H red linework, F blinks).
    if (ref.current) Object.assign(ref.current.userData, { part: id, health: bond?.health ?? 100, stage: bond?.stage ?? 'intact' });
  });
  const m = materials();
  return (
    <group ref={ref}>
      {id === 'solar' ? <SolarArrays arm={arm} status={status} mainWings={false} />
        : id === 'solarRight' || id === 'solarLeft'
          ? <Wing z={-6} angle={id === 'solarLeft' ? Math.PI : 0} length={11} width={3} material={status.solarCrisis ? m.solarDead : m.solar} armId={id} arm={arm} />
          : Module ? <Module arm={arm} spin={spin} status={status} /> : null}
    </group>
  );
}

/**
 * The station ship built from the real DEMO parts: detached parts are gone, failing engines
 * stop firing, dark panels on a power crisis, arms follow real repair poses, a shake on impact.
 * Each part group carries userData { part, health, stage }.
 */
export function LiveShip({ sim, blinkDamaged = false }) {
  const body = useRef();
  const p = sim.demo.physics;
  const raw = sim.session.voyage.current.physics;
  const faults = sim.demo.activeFaults;
  const bonds = partHealth(sim);
  const status = {
    engineOut: faults.includes('Engine Failure') || faults.includes('Thruster Failure') || bonds.engine?.broken || p.fuelKg <= 0,
    solarCrisis: faults.includes('Solar Panel Power Crisis'),
  };
  const arm = (armId) => {
    const entry = ARMS.find((a) => a.id === armId);
    const index = ARMS.findIndex((a) => a.id === (entry?.phaseOf ?? armId));
    const pose = raw.armPoses?.[armId];
    return pose ? { animate: false, pose } : { animate: true, phase: index * 1.7 };
  };
  useFrame((state) => {
    const g = body.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const since = p.lastImpact ? p.elapsed - p.lastImpact.time : Infinity;
    const shake = since >= 0 && since < 1.6 ? 1 - since / 1.6 : 0;
    g.rotation.z = shake ? Math.sin(t * 9) * 0.05 * shake : g.rotation.z * 0.9;
    g.rotation.x = shake ? Math.sin(t * 7 + 1) * 0.03 * shake : g.rotation.x * 0.9;
    if (blinkDamaged) {
      g.children.forEach((c) => {
        const h = c.userData.health ?? 100;
        c.visible = h >= 80 || Math.sin(t * (h < 50 ? 14 : 7)) > -0.35;
      });
    }
  });
  return (
    <group ref={body}>
      {DEMO_PARTS.filter((part) => !bonds[part.id]?.broken).map((part) => (
        <LivePart key={part.id} id={part.id} bond={bonds[part.id]} status={status} arm={arm} spin={sim.demo.playing} />
      ))}
    </group>
  );
}

/** Walk up from a mesh to the LiveShip part group it belongs to. */
export function partOf(object) {
  for (let o = object; o; o = o.parent) if (o.userData?.part) return o.userData;
  return null;
}

/** Severity for a bond health value: 'ok' | 'warn' | 'bad'. */
export const tone = (h) => (h < 50 ? 'bad' : h < 99.95 ? 'warn' : 'ok');

/* ───────────── generator console logic ───────────── */

const LINEAR = [['Main +Z', [0, 0, 1]], ['Reverse −Z', [0, 0, -1]], ['Right +X', [1, 0, 0]], ['Left −X', [-1, 0, 0]], ['Up +Y', [0, 1, 0]], ['Down −Y', [0, -1, 0]]];
const ANGULAR = [['Pitch +', [1, 0, 0]], ['Pitch −', [-1, 0, 0]], ['Yaw +', [0, 1, 0]], ['Yaw −', [0, -1, 0]], ['Roll +', [0, 0, 1]], ['Roll −', [0, 0, -1]]];

/** Everything the classic Disaster Maker + propulsion + AI panels do, without markup. */
export function useConsole(sim) {
  const s = sim.session;
  const d = sim.demo;
  const raw = s.demoControls.physics;
  const [burnSeconds, setBurnSeconds] = useState(2);
  const [error, setError] = useState('');

  const isOn = (name) =>
    name === 'Black Hole Encounter' ? d.blackHole
      : name === 'Solar Storm' ? d.solarStorm
        : POINTER_HAZARDS.includes(name) ? d.armed === name || d.hazards.some((h) => h.name === name)
          : d.activeFaults.includes(name);

  /** Same behaviour as the classic buttons: arm pointer hazards, toggle black hole, start storm, inject faults. */
  function hazard(name) {
    if (name === 'Black Hole Encounter') s.toggleBlackHole();
    else if (name === 'Solar Storm') s.triggerSolarStorm();
    else if (POINTER_HAZARDS.includes(name)) d.setArmed(d.armed === name ? null : name);
    else sim.trigger(name);
  }

  const targets = [{ id: 'cycle', label: 'Cycle through components' }, ...DEMO_PARTS.map((p) => ({ id: p.id, label: p.label }))];
  const setRock = (key, value) => d.setRockSettings((r) => ({ ...r, [key]: key === 'target_id' ? value : Number(value) }));
  function launchRock() {
    try { s.demoControls.launch(d.rockSettings); setError(''); } catch (e) { setError(e.message); }
  }

  const thrusterOut = !d.playing || raw.fuel <= 0 || raw.faults.includes('Thruster Failure');
  const burns = [
    ...LINEAR.map(([label, v]) => ({
      label, linear: v, angular: [0, 0, 0],
      disabled: thrusterOut || (label === 'Main +Z' && (raw.bonds.engine.broken || raw.faults.includes('Engine Failure'))),
    })),
    ...ANGULAR.map(([label, v]) => ({ label, linear: [0, 0, 0], angular: v, disabled: thrusterOut })),
  ];
  function burn(b) {
    try { d.burn({ linear: b.linear, angular: b.angular, seconds: burnSeconds }); setError(''); } catch (e) { setError(e.message); }
  }
  const courseOn = Boolean(raw.flightControl?.enabled);
  const toggleCourse = () => d.courseCorrection(!courseOn);

  const armedHint = d.armed
    ? `Click the physics view to launch ${d.armed}. Click again or Esc to cancel.`
    : 'Asteroid / Alien: select, then click the physics view. Black Hole and Solar Storm start at once. Inner failures can be injected repeatedly.';

  const ai = d.ai;
  const aiState = ai.busy ? 'Models analyzing · physics continues' : ai.enabled ? 'Autopilot watching for threats and damage' : 'Manual AI cycles only';
  const aiToggle = ai.enabled || ai.busy ? ai.stop : ai.start;
  const aiConn = ai.settings ? `${ai.settings.provider} · ${ai.settings.model || 'model required'}` : 'backend .env';

  return {
    isOn, hazard, targets, setRock, launchRock, burns, burn, burnSeconds, setBurnSeconds, courseOn, toggleCourse,
    error, setError, armedHint, aiState, aiToggle, aiConn, ai,
  };
}

/** − [typed value] + control for the map time scale. Accepts 100000, 100K, 2.5M, 1Mx. */
export function TimeScale({ sim, className = '', minus = '−', plus = '+' }) {
  const d = sim.demo;
  const [draft, setDraft] = useState(null);
  const [bad, setBad] = useState(false);
  const cancelled = useRef(false);
  function commit() {
    if (cancelled.current) { cancelled.current = false; setDraft(null); return; }
    if (draft === null) return;
    const v = parseTimeScale(draft);
    setDraft(null);
    if (v === null) { setBad(true); setTimeout(() => setBad(false), 1200); } else if (v !== d.timeScale) d.setTimeScale(v);
  }
  return (
    <span className={`${className} ${bad ? 'invalid' : ''}`} role="group" aria-label="Map travel time scale" title="Map travel playback speed. Type 100K or 2.5M.">
      <button type="button" aria-label="Slower" disabled={d.timeScale <= MIN_TIME_SCALE} onClick={() => d.stepTimeScale(-1)}>{minus}</button>
      <input aria-label="Time scale" value={draft ?? formatTimeScale(d.timeScale)} spellCheck={false} autoComplete="off"
        onFocus={(e) => { setDraft(formatTimeScale(d.timeScale)); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); } }} />
      <button type="button" aria-label="Faster" disabled={d.timeScale >= MAX_TIME_SCALE} onClick={() => d.stepTimeScale(1)}>{plus}</button>
    </span>
  );
}
