import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import AiApiSettings from './components/AiApiSettings.jsx';
import DisasterMaker from './components/DisasterMaker.jsx';
import { TRAVEL_SECONDS } from './components/Hazards.jsx';
import { STORM_SPEED } from './components/space/SolarStorm.jsx';
import Header from './components/Header.jsx';
import Home from './components/Home.jsx';
import SpacecraftViewer from './components/SpacecraftViewer.jsx';
import MissionControl, { DEFAULT_MAP_INFO } from './components/MissionControl.jsx';
import Telemetry from './components/Telemetry.jsx';
import Timeline from './components/Timeline.jsx';
import Viewer from './components/Viewer.jsx';
import { DISASTER_PARAMETERS } from './data/disasters.js';
import {
  createVoyage,
  destination,
  TRANSFER_DAYS,
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
} from './data/voyage.js';
import useSimulation from './simulation/useSimulation.js';
import { commandDemoBurn, coastDemo, demoTelemetry, launchDemoRock, launchDemoRockAtPointer, injectDemoFault } from './simulation/demoPhysics.js';
import useDemoAI from './simulation/useDemoAI.js';
import { loadAiSettings } from './ai/settings.js';

// Two ways to run the 3D view:
//  - Live: the ROS/Gazebo simulator is connected; ship, map, telemetry and arms come from it.
//  - Demo (primary): browser rigid-body physics, physical impacts and finite burns.

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

export default function App() {
  const [tab, setTab] = useState('Home');
  const [viewMode, setViewMode] = useState('demo');
  const [aiSettings, setAiSettings] = useState(loadAiSettings);
  const simulation = useSimulation({ enabled: viewMode === 'live' || ['Spacecraft', 'Planetary Trajectories'].includes(tab) });
  const live = (viewMode === 'live' || tab === 'Planetary Trajectories') && Boolean(simulation.scene);

  const [logs, setLogs] = useState([]);
  const [fullPage, setFullPage] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

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
  const demoStatus = {
    physics: demoTelemetry(voyage.current.physics),
    speedKmS: shipSpeedKmS(voyage.current),
    day: missionDay(voyage.current),
    legDays: TRANSFER_DAYS,
    inOrbit: voyage.current.dwell > 0,
    timeScaleLabel: formatTimeScale(timeScale),
  };

  useEffect(() => {
    if (live) return undefined;
    const id = setInterval(() => {
      setSeconds((s) => playing ? s + .1 : s);
      const events = voyage.current.physics.events.splice(0);
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
  function launch(offsetFromShip) {
    if (armed === 'Asteroid Collision') {
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
      { id, name: armed, start: start.toArray(), velocity: velocity.toArray(), eta: TRAVEL_SECONDS },
    ]);
    addLogs([`HAZARD INBOUND · ${armed} · Impact predicted in ${TRAVEL_SECONDS}s`]);
  }

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
    setSolarStorm({ id: nextId.current++ });
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

  // ---------- layout ----------
  function exitFullPage() {
    setFullPage(false);
    setLeftOpen(false);
    setRightOpen(false);
  }
  useEffect(() => {
    if (!fullPage) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') exitFullPage();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fullPage]);

  const workspaceClass = ['workspace', fullPage && 'fullpage', leftOpen && 'left-open', rightOpen && 'right-open']
    .filter(Boolean)
    .join(' ');
  const status = !live ? (playing ? 'DEMO' : 'PAUSED') : !simulation.connected
    ? 'OFFLINE'
    : !simulation.ready
      ? 'CONNECTING'
      : paused
        ? 'PAUSED'
        : 'LIVE';
  const navigation = simulation.state?.navigation;
  const planetTab = tab === 'Planetary Trajectories';
  const mapLabel = id => simulation.scene?.map?.objects.find(item => item.entity_id === id)?.label ?? id?.replaceAll('_', ' ') ?? '—';

  return (
    <div className="app">
      <Header tab={tab} onTabChange={setTab} status={status} />

      {tab === 'Home' ? (
        <Home event={event} onNavigate={setTab} demoStatus={demoStatus} />
      ) : tab === 'Spacecraft' ? (
        <SpacecraftViewer simulation={simulation} onLog={addLog} />
      ) : tab === 'AI API' ? (
        <AiApiSettings ai={demoAI} onSettingsChange={changeAiSettings} onOpenControls={() => { setViewMode('demo'); setTab('AI Logs'); }} />
      ) : (
        <div className={workspaceClass}>
          {planetTab ? (
            <MissionControl
              origin={mapLabel(navigation?.origin ?? simulation.scene?.map?.origin_entity_id)}
              destination={mapLabel(navigation?.destination ?? simulation.scene?.destination.entity_id)}
              voyageLabel={
                simulation.scene
                  ? navigation?.arrived
                    ? 'ARRIVED'
                    : Number.isFinite(navigation?.distance_m)
                      ? `EN ROUTE · ${navigation.distance_m.toFixed(0)} m`
                      : '—'
                  : 'WAITING FOR BACKEND'
              }
              mapInfo={mapInfo}
              map={simulation.scene?.map}
              ready={simulation.ready}
            />
          ) : (
            <DisasterMaker
              impact={rockSettings}
              onImpactChange={setRockSettings}
              live={live}
              simulation={simulation}
              demo={{ physics: voyage.current.physics, playing, launch: options => launchDemoRock(voyage.current.physics, options), burn: options => commandDemoBurn(voyage.current.physics, options), coast: () => coastDemo(voyage.current.physics) }}
              demoAI={demoAI}
              onLog={addLog}
              armed={armed}
              onArm={setArmed}
              blackHole={blackHole}
              onToggleBlackHole={toggleBlackHole}
              solarStorm={Boolean(solarStorm)}
              onSolarStorm={triggerSolarStorm}
              onTrigger={triggerFault}
              activeFaults={faults}
            />
          )}

          <main>
            <Viewer
              demoAI={demoAI}
              tab={tab}
              live={live}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onShowLiveShip={() => { setViewMode('live'); setTab('Generator'); }}
              simulation={simulation}
              onMapInspect={setMapInfo}
              logs={logs}
              fullPage={fullPage}
              onToggleFullPage={() => (fullPage ? exitFullPage() : setFullPage(true))}
              event={event}
              playing={playing}
              seconds={seconds}
              onTogglePlaying={() => setPlaying(!playing)}
              onResetDemo={resetDemo}
              timeScale={timeScale}
              onTimeScaleStep={stepTimeScale}
              onTimeScaleChange={setTimeScale}
              voyage={voyage}
              voyageLabel={voyageLabel}
              armed={armed}
              hazards={hazards}
              impacts={impacts}
              onLaunch={launch}
              onImpact={impact}
              onMiss={miss}
              onImpactDone={(id) => setImpacts((current) => current.filter((i) => i.id !== id))}
              blackHole={blackHole}
              solarStorm={solarStorm}
              stormFlash={stormFlash}
              onStormReach={solarStormReached}
              onStormDone={solarStormPassed}
            />
          </main>

          <aside className="right">
            <Telemetry live={live} simulation={simulation} event={event} demoStatus={demoStatus} />
            <Timeline logs={logs} />
          </aside>

          {fullPage && (
            <>
              <button
                className="drawer-toggle drawer-toggle-left"
                aria-expanded={leftOpen}
                onClick={() => setLeftOpen(!leftOpen)}
              >
                {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                <span>{planetTab ? 'MISSION CONTROL' : 'SHIP CONTROLS'}</span>
              </button>
              <button
                className="drawer-toggle drawer-toggle-right"
                aria-expanded={rightOpen}
                onClick={() => setRightOpen(!rightOpen)}
              >
                {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                <span>TELEMETRY / EVENT LOG</span>
              </button>
            </>
          )}
        </div>
      )}

      <footer>
        INTERSTELLAR X⁴ / HACKATHON PROTOTYPE{' '}
        <span>
          {planetTab ? `BACKEND MAP · ${status}` : live
            ? 'LIVE SPACE ROS / GAZEBO ENVIRONMENT'
            : simulation.ready
              ? 'DEMO · BROWSER PHYSICS'
              : 'DEMO · BROWSER PHYSICS · NO BACKEND REQUIRED'}
        </span>
      </footer>
    </div>
  );
}
