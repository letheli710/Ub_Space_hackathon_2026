import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TRAVEL_SECONDS } from '../components/Hazards.jsx';
import { STORM_SPEED } from '../components/space/SolarStorm.jsx';
import { DEFAULT_MAP_INFO } from '../components/MissionControl.jsx';
import { DISASTER_PARAMETERS } from '../data/disasters.js';
import {
  createVoyage,
  destination,
  demoLocalOffset,
  voyagePhase,
  stepTimeScaleValue,
  formatTimeScale,
  missionDay,
  origin,
  predictShipPosition,
  shipPose,
  shipSpeedKmS,
  stepVoyage,
  setVoyageTimeScale,
  startVoyageSolarStorm,
} from '../data/voyage.js';
import useSimulation from './useSimulation.js';
import { commandDemoBurn, coastDemo, demoTelemetry, launchDemoRock, launchDemoRockAtPointer, injectDemoFault, setDemoCourseCorrection } from './demoPhysics.js';
import useDemoAI from './useDemoAI.js';
import { loadAiSettings } from '../ai/settings.js';
import { celestialDate } from './celestial.js';
import { navigationState } from './missionGuidance.js';

// Two ways to run the 3D view:
//  - Live: the ROS/Gazebo simulator is connected; ship, map, telemetry and arms come from it.
//  - Demo (primary): browser rigid-body physics, physical impacts and finite burns.
// This hook owns all of that state so any skin (classic App or a themed frontend) can drive it.

/** Advances DEMO physics independently of which React view is mounted. */
function useVoyage(playing, onLegEvent) {
  const voyage = useRef(null);
  if (!voyage.current) voyage.current = createVoyage({ physical: true });
  // Dev only: lets you inspect or nudge the voyage from the browser console while testing.
  if (import.meta.env.DEV) window.__voyage = voyage.current;
  const callback = useRef(onLegEvent);
  callback.current = onLegEvent;

  useEffect(() => {
    if (!playing) return undefined;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      // rAF timestamps can be slightly earlier than performance.now(), so never go negative.
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      const legEvent = stepVoyage(voyage.current, dt);
      if (legEvent) callback.current(legEvent, voyage.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return voyage;
}

/**
 * The whole demo/live session: simulator connection, DEMO voyage + physics, disasters,
 * event log and DEMO AI. `tab` and `viewMode` decide whether the live backend is used.
 */
export default function useDemoSession({ tab, viewMode }) {
  const [aiSettings, setAiSettings] = useState(loadAiSettings);
  const simulation = useSimulation({ enabled: viewMode === 'live' || ['Spacecraft', 'Planetary Trajectories'].includes(tab) });
  const live = (viewMode === 'live' || tab === 'Planetary Trajectories') && Boolean(simulation.scene);

  const [logs, setLogs] = useState([]);

  // Demo-only state
  const [event, setEvent] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [armed, setArmed] = useState(null);
  const [rockSettings, setRockSettings] = useState({ target_id: 'cycle', mass_kg: 200, radius_m: .6, speed_m_s: 40, warning_s: 12 });
  const [blackHole, setBlackHole] = useState(false);
  const [solarStorm, setSolarStorm] = useState(null);
  const [faults, setFaults] = useState([]); // inner failures the AI has not fixed yet
  const [stormFlash, setStormFlash] = useState(0);
  const [hazards, setHazards] = useState([]);
  const [impacts, setImpacts] = useState([]);
  const [mapInfo, setMapInfo] = useState(DEFAULT_MAP_INFO);
  const nextId = useRef(1);

  // Event log: each entry carries the simulation time (live) or demo clock when it happened.
  const timeRef = useRef(null);
  timeRef.current = live ? (simulation.state?.sim_time_s ?? null) : seconds;
  const sequence = useRef(0);
  const addLogs = useCallback((lines) => {
    const at = timeRef.current;
    setLogs((items) =>
      [...lines.map((text) => ({ id: ++sequence.current, seconds: at, text })), ...items].slice(0, 40),
    );
  }, []);
  const addLog = useCallback((text) => addLogs([text]), [addLogs]);

  // ---------- live simulator events ----------
  const previousTime = useRef(null);
  const arrivalLogged = useRef(false);
  useEffect(() => { arrivalLogged.current = false; }, [simulation.scene?.revision]);
  const simulationTime = simulation.state?.sim_time_s;
  useEffect(() => {
    if (Number.isFinite(simulationTime)) {
      if (previousTime.current !== null && simulationTime < previousTime.current - 0.5) {
        arrivalLogged.current = false;
        addLog('Simulator restarted · new voyage');
      }
      previousTime.current = simulationTime;
    }
  }, [simulationTime, addLog]);
  useEffect(() => {
    addLog(
      simulation.ready
        ? 'Simulator connected · live measurements received'
        : 'DEMO browser physics ready · optional Gazebo backend disconnected',
    );
  }, [simulation.ready, addLog]);
  const paused = simulation.state?.paused;
  useEffect(() => {
    if (paused !== null && paused !== undefined) addLog(paused ? 'Simulation paused' : 'Simulation running');
  }, [paused, addLog]);
  const arrived = simulation.state?.navigation?.arrived;
  useEffect(() => {
    // Arrival is one voyage milestone, even if proximity briefly fluctuates
    // as independently published planet and ship poses reach the browser.
    if (arrived && !arrivalLogged.current) {
      arrivalLogged.current = true;
      addLog('Destination approach complete · maintaining stand-off distance');
    }
  }, [arrived, addLog]);

  // ---------- demo voyage ----------
  const voyage = useVoyage(playing && !live, (legEvent, v) => {
    if (legEvent === 'arrived') addLogs([`ARRIVED · ${destination(v)} orbit reached · Half a lap before heading back`]);
    else addLogs([`DEPARTURE · ${origin(v)} → ${destination(v)}`]);
  });
  const demoAI = useDemoAI(voyage, playing && !live, addLog, aiSettings, seconds);
  function changeAiSettings(settings) {
    demoAI.stop();
    setAiSettings(settings);
    addLog('DEMO AI connection changed · autopilot stopped; run a cycle or enable it again when ready');
  }
  const voyageLabel = `${voyagePhase(voyage.current)} · MAP DAY ${Math.floor(missionDay(voyage.current))}`;
  // Map playback stays continuous while local collision/AI time runs safely at 1x.
  const timeScale = voyage.current.timeScale;
  function setTimeScale(value) {
    try { setVoyageTimeScale(voyage.current, value); }
    catch (error) { addLog(error.message); }
  }
  function stepTimeScale(direction) {
    // Read the live value so several quick clicks each move one step.
    const current = voyage.current.timeScale;
    const next = stepTimeScaleValue(current, direction);
    if (next !== current) setTimeScale(next);
  }
  const demoNavigation = navigationState(voyage.current);
  const demoStatus = {
    physics: demoTelemetry(voyage.current.physics),
    speedKmS: shipSpeedKmS(voyage.current),
    day: missionDay(voyage.current),
    legDays: demoNavigation.transfer_days,
    navigation: demoNavigation,
    celestialDate: celestialDate(voyage.current.mapElapsed),
    inOrbit: voyage.current.dwell > 0,
    timeScaleLabel: formatTimeScale(timeScale),
  };

  useEffect(() => {
    if (live) return undefined;
    const id = setInterval(() => {
      setSeconds(voyage.current.displayElapsed ?? 0);
      const events = voyage.current.physics.events.splice(0);
      if (events.some(e=>e.type==='storm_hit')) { setStormFlash(n=>n+1); setEvent({name:'Solar Storm',severity:DISASTER_PARAMETERS.severity}); }
      if (events.some(e=>e.type==='storm_passed')) setSolarStorm(null);
      if (events.length) addLogs(events.map(e => e.text));
    }, 100);
    return () => clearInterval(id);
  }, [playing, live, addLogs, voyage]);

  useEffect(() => setMapInfo(DEFAULT_MAP_INFO), [simulation.scene?.revision]);

  // Disasters only run in the demo view; leaving it disarms any pending launch.
  useEffect(() => {
    if (live) setArmed(null);
  }, [live]);

  useEffect(() => {
    if (!armed) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setArmed(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [armed]);

  function startDisaster(name, firstLine) {
    const { severity } = DISASTER_PARAMETERS;
    setEvent({ name, severity });
    addLogs([
      `${firstLine} · ${name} · Severity ${severity}%`,
      'DEMO scenario active · no automatic AI mitigation has been executed',
    ]);
  }

  // Outer disasters: aimed at where the ship will be when they arrive, then fly straight.
  // If the AI changes the ship's course in the meantime, they miss.
  function launchHazard(name, offsetFromShip) {
    if (name === 'Asteroid Collision') {
      try { launchDemoRockAtPointer(voyage.current.physics, demoLocalOffset(voyage.current, offsetFromShip), rockSettings); }
      catch (error) { addLog(error.message); }
      return;
    }
    const id = nextId.current++;
    const ship = shipPose(voyage.current, new THREE.Vector3());
    const start = ship.clone().add(new THREE.Vector3(...offsetFromShip));
    const target = predictShipPosition(voyage.current, TRAVEL_SECONDS, new THREE.Vector3());
    const velocity = target.sub(start).divideScalar(TRAVEL_SECONDS);
    setHazards((current) => [
      ...current,
      { id, name, start: start.toArray(), velocity: velocity.toArray(), eta: TRAVEL_SECONDS },
    ]);
    addLogs([`HAZARD INBOUND · ${name} · Impact predicted in ${TRAVEL_SECONDS}s`]);
  }
  const launch = (offsetFromShip) => launchHazard(armed, offsetFromShip);

  // Black hole: appears by itself far out in a corner of the solar system, same spot as on the map.
  function toggleBlackHole() {
    if (blackHole) {
      setBlackHole(false);
      addLogs(['BLACK HOLE COLLAPSED · Gravity anomaly gone']);
    } else {
      setBlackHole(true);
      setArmed(null);
      startDisaster('Black Hole Encounter', 'ANOMALY DETECTED');
    }
  }

  // Inner failures stay active (button lit, effects on) until they are resolved.
  // Nothing resolves them on a timer: the backend AI will report the fix and call resolveFault.
  function triggerFault(name) {
    setFaults((current) => current.includes(name) ? current : [...current, name]);
    injectDemoFault(voyage.current.physics, name);
    startDisaster(name, 'DISASTER INJECTED');
  }

  /** Mark an inner failure as fixed, e.g. when the backend reports how it was resolved. */
  const faultsRef = useRef(faults);
  faultsRef.current = faults;
  const resolveFault = useCallback(
    (name, how = 'Failure resolved') => {
      if (!faultsRef.current.includes(name)) return;
      const remaining = faultsRef.current.filter((fault) => fault !== name);
      setFaults(remaining);
      voyage.current.physics.faults = remaining;
      // The failure's effects end; show the most recent failure still open, if any.
      setEvent((event) => {
        if (event?.name !== name) return event;
        const latest = remaining[remaining.length - 1];
        return latest ? { name: latest, severity: DISASTER_PARAMETERS.severity } : null;
      });
      addLogs([`AI RESOLVED · ${name} · ${how}`]);
    },
    [addLogs],
  );
  // Dev only: try it from the browser console, e.g. __resolveFault('Oxygen Leak', 'Breach sealed').
  if (import.meta.env.DEV) window.__resolveFault = resolveFault;

  // Solar storm: a particle wave leaves the Sun and sweeps outward; it hits when it reaches the ship.
  function triggerSolarStorm() {
    setArmed(null);
    setSolarStorm(startVoyageSolarStorm(voyage.current,nextId.current++));
    const distance = shipPose(voyage.current, new THREE.Vector3()).length();
    addLogs([`SOLAR FLARE DETECTED · Particle wave leaving the Sun · ETA ${(distance / STORM_SPEED).toFixed(1)}s`]);
  }

  function solarStormReached() {
    setStormFlash((n) => n + 1);
    startDisaster('Solar Storm', 'SOLAR STORM HIT');
  }

  function solarStormPassed() {
    setSolarStorm(null);
    addLogs(['SOLAR STORM PASSED · Particle levels returning to normal']);
  }

  function miss(hazard) {
    setHazards((current) => current.filter((h) => h.id !== hazard.id));
    addLogs([`MISSED · ${hazard.name} passed the ship`]);
  }

  function impact(hazard, pos) {
    setHazards((current) => current.filter((h) => h.id !== hazard.id));
    setImpacts((current) => [...current, { id: hazard.id, pos }]);
    startDisaster(hazard.name, 'IMPACT');
  }

  function resetDemo() {
    demoAI.reset();
    setEvent(null);
    setBlackHole(false);
    setSolarStorm(null);
    setFaults([]);
    setHazards([]);
    setImpacts([]);
    Object.assign(voyage.current, createVoyage({ physical: true }));
    setSeconds(0);
    timeRef.current = 0;
    addLogs(['DEMO RESET · All systems nominal']);
  }

  const status = !live ? (playing ? 'DEMO' : 'PAUSED') : !simulation.connected
    ? 'OFFLINE'
    : !simulation.ready
      ? 'CONNECTING'
      : paused
        ? 'PAUSED'
        : 'LIVE';

  /** Props for DisasterMaker's `demo` control object. */
  const demoControls = {
    physics: voyage.current.physics,
    playing,
    launch: options => launchDemoRock(voyage.current.physics, options),
    burn: options => commandDemoBurn(voyage.current.physics, options),
    coast: () => coastDemo(voyage.current.physics),
    courseCorrection: enabled => setDemoCourseCorrection(voyage.current.physics, enabled),
  };

  return {
    simulation, live, status, paused,
    aiSettings, changeAiSettings, demoAI,
    logs, addLog, addLogs,
    voyage, voyageLabel, demoStatus, demoControls,
    event, playing, setPlaying, seconds,
    timeScale, setTimeScale, stepTimeScale,
    armed, setArmed, rockSettings, setRockSettings,
    blackHole, toggleBlackHole, solarStorm, triggerSolarStorm, solarStormReached, solarStormPassed, stormFlash,
    faults, triggerFault, resolveFault,
    hazards, impacts, setImpacts, launch, launchHazard, miss, impact,
    mapInfo, setMapInfo,
    resetDemo,
  };
}
