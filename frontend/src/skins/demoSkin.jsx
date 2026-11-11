// Shared plumbing that lets every themed skin run on the REAL demo session (useDemoSession).
// A skin receives `sim` from useSkinSim(): the same fields the prototype mock had, computed from
// live DEMO physics, plus `sim.demo` (real controls) and `sim.session` (everything else).
import { useRef, useState } from 'react';
import AiApiSettings from '../components/AiApiSettings.jsx';
import AiLogs from '../components/AiLogs.jsx';
import DemoMap from '../components/DemoMap.jsx';
import DemoScene from '../components/DemoScene.jsx';
import SpacecraftViewer from '../components/SpacecraftViewer.jsx';
import { INNER_DISASTERS, OUTER_DISASTERS } from '../data/disasters.js';
import { subsystemStates } from '../simulation/demoSystems.js';

export { default as logo } from '../assets/interstellar-x4-logo.webp';
export const TABS = ['Home', 'Spacecraft', 'Generator', 'Planetary Trajectories', 'AI Logs', 'AI API'];
export const OUTER = OUTER_DISASTERS;
export const INNER = INNER_DISASTERS;
export const FEATURES = ['Realistic Disaster Simulation', 'AI-Driven Decision Support', '3D Interactive Spacecraft'];
export const TAGLINE = 'AI-Powered Spacecraft Disaster Simulator';
export const LEAD = 'An interactive 3D platform where users simulate spacecraft emergencies, analyze mission risks, and explore how AI guides real-time decisions and recovery in space.';

const pad = (n) => String(Math.floor(n)).padStart(2, '0');
export const clock = (s) => `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}`;
const ALERT = /DISASTER|IMPACT|HAZARD|ANOMALY|STORM HIT|FLARE|DETACH|BROKE|FAIL|INBOUND|ALIEN/i;
const titleCase = (id) => id.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Where Alien Encounter / launched hazards start, relative to the ship (scene units). */
const HAZARD_OFFSET = [46, 14, -32];

/**
 * Adapt the real demo session to the skin `sim` interface.
 * Fields match the prototype mock so existing skin markup keeps working.
 */
export function useSkinSim(session) {
  const s = session;
  const p = s.demoStatus.physics;
  const nav = s.demoStatus.navigation;
  const solarAttached = 100 - 50 * p.detached.filter((id) => ['solarLeft', 'solarRight'].includes(id)).length;
  const systems = [
    { key: 'Structure', label: 'Structural integrity', value: Math.round(p.integrity) },
    { key: 'Solar', label: 'Solar wings', value: solarAttached },
    { key: 'Fuel', label: 'Propellant', value: Math.round(p.fuelKg / 40) },
    { key: 'Power', label: 'Battery charge', value: Math.round(p.battery) },
    { key: 'Drive', label: 'Propulsion', value: Math.round(p.propulsionIntegrity) },
    { key: 'Energy', label: 'Energy', value: Math.round(p.energyIntegrity) },
  ];
  const subs = subsystemStates(s.voyage.current.physics);
  const ai = s.demoAI;
  const agentState = (id) => {
    const st = subs[id];
    if (st.mode !== 'online') return { state: st.mode === 'offline' ? 'Offline' : 'Emergency power', ok: false, reason: st.reason };
    return { state: ai.busy ? 'Evaluating' : ai.enabled ? 'Autopilot armed' : 'Standby', ok: true, reason: st.reason };
  };
  const agents = [
    { id: 'main_judging', name: 'Main Judging', ...agentState('main_judging') },
    { id: 'propelling', name: 'Propelling', ...agentState('propelling'), state: subs.propelling.mode === 'online' ? (p.courseControl?.mode ? titleCase(p.courseControl.mode) : 'Course correction') : agentState('propelling').state },
    { id: 'energy', name: 'Energy', ...agentState('energy') },
    { id: 'robot_arms', name: 'Robot Arms', ...agentState('robot_arms'), state: subs.robot_arms.mode === 'online' ? (p.repairs.length ? 'Repairing' : 'Idle') : agentState('robot_arms').state },
  ];
  const logs = s.logs.map((l) => ({ id: l.id, t: l.seconds, time: Number.isFinite(l.seconds) ? clock(l.seconds) : '--:--:--', text: l.text, alert: ALERT.test(l.text) }));

  /** One call per disaster name — the same things the classic Disaster Maker does. */
  function trigger(name) {
    if (name === 'Asteroid Collision') {
      try { s.demoControls.launch(s.rockSettings); } catch (error) { s.addLog(error.message); }
    } else if (name === 'Black Hole Encounter') {
      if (!s.blackHole) s.toggleBlackHole();
    } else if (name === 'Solar Storm') {
      if (!s.solarStorm) s.triggerSolarStorm();
    } else if (OUTER_DISASTERS.includes(name)) {
      s.launchHazard(name, HAZARD_OFFSET);
    } else {
      s.triggerFault(name);
    }
  }
  const isActive = (name) =>
    name === 'Black Hole Encounter' ? s.blackHole
      : name === 'Solar Storm' ? Boolean(s.solarStorm)
        : s.faults.includes(name) || s.hazards.some((h) => h.name === name) || s.event?.name === name;

  return {
    t: s.seconds,
    met: clock(s.seconds),
    day: Math.floor(s.demoStatus.day),
    event: s.event,
    trigger,
    isActive,
    clear: s.resetDemo,
    logs,
    systems,
    agents,
    nav: {
      origin: titleCase(nav.origin),
      destination: titleCase(nav.destination),
      phase: nav.phase,
      progress: Math.max(0, Math.min(1, nav.progress ?? 0)),
      etaDays: nav.eta_s == null ? null : nav.eta_s / 86400,
      inOrbit: s.demoStatus.inOrbit,
    },
    velocity: s.demoStatus.speedKmS.toFixed(2),
    propellantKg: p.fuelKg.toFixed(1),
    massKg: Math.round(p.massKg).toLocaleString('en-US'),
    attitude: Math.hypot(...p.angularVelocity) > 1e-4 ? 'ROTATING' : 'STEADY',
    angular: Math.hypot(...p.angularVelocity).toFixed(4),
    timeScale: s.demoStatus.timeScaleLabel,
    status: s.status,
    demo: {
      playing: s.playing,
      togglePlaying: () => s.setPlaying(!s.playing),
      timeScale: s.timeScale,
      stepTimeScale: s.stepTimeScale,
      setTimeScale: s.setTimeScale,
      activeFaults: s.faults,
      blackHole: s.blackHole,
      solarStorm: Boolean(s.solarStorm),
      hazards: s.hazards,
      armed: s.armed,
      setArmed: s.setArmed,
      rockSettings: s.rockSettings,
      setRockSettings: s.setRockSettings,
      launchRock: () => trigger('Asteroid Collision'),
      burn: s.demoControls.burn,
      coast: s.demoControls.coast,
      courseCorrection: s.demoControls.courseCorrection,
      physics: p,
      navigation: nav,
      celestialDate: s.demoStatus.celestialDate,
      ai,
      aiSettings: s.aiSettings,
      changeAiSettings: s.changeAiSettings,
      stormFlash: s.stormFlash,
    },
    session: s,
  };
}

/**
 * The real DEMO 3D flight scene (physics, rocks, black hole, solar storm, pointer launches).
 * Fills its parent (parent needs position: relative and a size).
 */
export function DemoViewport({ sim, resetCount = 0, fullPage = false, className = '', children }) {
  const s = sim.session;
  const marker = useRef();
  return (
    <div className={`skin-viewport ${s.armed ? 'armed' : ''} ${className}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: s.armed ? 'crosshair' : undefined }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <DemoScene
          voyage={s.voyage}
          event={s.event}
          playing={s.playing}
          fullPage={fullPage}
          viewResetCount={resetCount}
          armed={s.armed}
          hazards={s.hazards}
          impacts={s.impacts}
          onLaunch={s.launch}
          onImpact={s.impact}
          onMiss={s.miss}
          onImpactDone={(id) => s.setImpacts((current) => current.filter((i) => i.id !== id))}
          blackHole={s.blackHole}
          blackHoleMarker={marker}
          solarStorm={s.solarStorm}
          onStormReach={s.solarStormReached}
          onStormDone={s.solarStormPassed}
        />
      </div>
      {s.blackHole && (
        <div ref={marker} aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', willChange: 'transform' }} className="skin-bh-marker">
          <span className="bh-arrow" />
          <span className="bh-label" />
        </div>
      )}
      {children}
    </div>
  );
}

/** Pointer-armed launches (Asteroid / Alien placed by clicking the 3D view). */
export function useArmedLaunch(sim) {
  return {
    armed: sim.session.armed,
    arm: (name) => sim.session.setArmed(sim.session.armed === name ? null : name),
  };
}

/** Real page bodies for the other tabs. Skins wrap them in their own chrome and restyle their classes. */
export function TrajectoriesView({ sim }) {
  const s = sim.session;
  return <DemoMap voyage={s.voyage} playing={s.playing} onInspect={s.setMapInfo} />;
}
export function AiLogsView({ sim, onShowLiveShip }) {
  const s = sim.session;
  return <AiLogs viewMode="demo" demoAI={s.demoAI} simulation={s.simulation} logs={s.logs} onShowLiveShip={onShowLiveShip ?? (() => {})} />;
}
export function AiApiView({ sim, onOpenControls }) {
  const s = sim.session;
  return <AiApiSettings ai={s.demoAI} onSettingsChange={s.changeAiSettings} onOpenControls={onOpenControls ?? (() => {})} />;
}
export function SpacecraftView({ sim }) {
  const s = sim.session;
  return <SpacecraftViewer simulation={s.simulation} onLog={s.addLog} />;
}

/** Small helper for skins: a reset-view counter for DemoViewport. */
export function useViewReset() {
  const [count, setCount] = useState(0);
  return [count, () => setCount((n) => n + 1)];
}
