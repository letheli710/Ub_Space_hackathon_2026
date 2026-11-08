import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TRAVEL_SECONDS } from './components/Hazards.jsx';
import DisasterMaker from './components/DisasterMaker.jsx';
import Header from './components/Header.jsx';
import Home from './components/Home.jsx';
import MissionControl, { DEFAULT_MAP_INFO } from './components/MissionControl.jsx';
import Telemetry from './components/Telemetry.jsx';
import Timeline from './components/Timeline.jsx';
import Viewer from './components/Viewer.jsx';
import { DISASTER_PARAMETERS, demoAiResponse } from './data/disasters.js';
import {
  createVoyage,
  destination,
  legProgress,
  origin,
  predictShipPosition,
  shipPose,
  stepVoyage,
} from './data/voyage.js';

/** Moves the ship along its Earth ⇄ Mars route while the simulation is playing. */
function useVoyage(playing, onLegEvent) {
  const voyage = useRef(createVoyage());
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
  const [event, setEvent] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [logs, setLogs] = useState(['SYSTEM READY · Awaiting disaster injection']);
  const [seconds, setSeconds] = useState(0);
  const [armed, setArmed] = useState(null);
  const [blackHole, setBlackHole] = useState(false);
  const [mapInfo, setMapInfo] = useState(DEFAULT_MAP_INFO);

  // The Planetary Trajectories map reports the planet the user clicked.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin === window.location.origin && e.data?.type === 'map-info')
        setMapInfo(e.data.text);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const [hazards, setHazards] = useState([]);
  const [impacts, setImpacts] = useState([]);
  const nextId = useRef(1);

  const voyage = useVoyage(playing, (legEvent, v) => {
    if (legEvent === 'arrived') {
      addLogs([`ARRIVED · ${destination(v)} orbit reached · Holding position`]);
    } else {
      addLogs([`DEPARTURE · ${origin(v)} → ${destination(v)}`]);
    }
  });
  const voyageLabel =
    voyage.current.dwell > 0
      ? `IN ${destination(voyage.current).toUpperCase()} ORBIT`
      : `${origin(voyage.current).toUpperCase()} → ${destination(voyage.current).toUpperCase()} · ${Math.round(legProgress(voyage.current) * 100)}%`;
  const [fullPage, setFullPage] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [playing]);

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

  useEffect(() => {
    if (!armed) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setArmed(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [armed]);

  function addLogs(lines) {
    setLogs((current) => [...lines, ...current].slice(0, 12));
  }

  function startDisaster(name, firstLine) {
    const { severity } = DISASTER_PARAMETERS;
    setEvent({ name, severity });
    addLogs([
      `${firstLine} · ${name} · Severity ${severity}%`,
      'AI DETECTED · Evaluating spacecraft state',
      `AI RESPONSE · ${demoAiResponse(name)}`,
    ]);
  }

  // Outer disasters: launched from a point in the 3D view, they start when they hit the ship.
  // Outer disasters: aimed at where the ship will be when they arrive, then fly straight.
  // If the AI changes the ship's course in the meantime, they miss.
  function launch(offsetFromShip) {
    const id = nextId.current++;
    const ship = shipPose(voyage.current, new THREE.Vector3());
    const start = ship.clone().add(new THREE.Vector3(...offsetFromShip));
    const target = predictShipPosition(voyage.current, TRAVEL_SECONDS, new THREE.Vector3());
    const velocity = target.sub(start).divideScalar(TRAVEL_SECONDS);
    setHazards((current) => [
      ...current,
      {
        id,
        name: armed,
        start: start.toArray(),
        velocity: velocity.toArray(),
        eta: TRAVEL_SECONDS,
      },
    ]);
    addLogs([`HAZARD INBOUND · ${armed} · Impact predicted in ${TRAVEL_SECONDS}s`]);
  }

  // Black hole: appears by itself in a corner of the solar system, same spot as on the map.
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

  function miss(hazard) {
    setHazards((current) => current.filter((h) => h.id !== hazard.id));
    addLogs([`MISSED · ${hazard.name} passed the ship`]);
  }

  function impact(hazard, pos) {
    setHazards((current) => current.filter((h) => h.id !== hazard.id));
    setImpacts((current) => [...current, { id: hazard.id, pos }]);
    startDisaster(hazard.name, 'IMPACT');
  }

  function reset() {
    setEvent(null);
    setBlackHole(false);
    setHazards([]);
    setImpacts([]);
    Object.assign(voyage.current, createVoyage());
    setLogs(['SYSTEM RESET · All systems nominal']);
    setSeconds(0);
  }

  const workspaceClass = [
    'workspace',
    fullPage && 'fullpage',
    leftOpen && 'left-open',
    rightOpen && 'right-open',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="app">
      <Header tab={tab} onTabChange={setTab} event={event} />

      {tab === 'Home' ? (
        <Home event={event} onNavigate={setTab} />
      ) : (
        <div className={workspaceClass}>
          {tab === 'Planetary Trajectories' ? (
            <MissionControl
              origin={origin(voyage.current)}
              destination={destination(voyage.current)}
              voyageLabel={voyageLabel}
              mapInfo={mapInfo}
              blackHole={blackHole}
            />
          ) : (
            <DisasterMaker
              armed={armed}
              onArm={setArmed}
              blackHole={blackHole}
              onToggleBlackHole={toggleBlackHole}
              onTrigger={(name) => startDisaster(name, 'DISASTER INJECTED')}
            />
          )}

          <main>
            <Viewer
              tab={tab}
              event={event}
              playing={playing}
              logs={logs}
              seconds={seconds}
              fullPage={fullPage}
              onTogglePlaying={() => setPlaying(!playing)}
              onReset={reset}
              voyage={voyage}
              voyageLabel={voyageLabel}
              armed={armed}
              hazards={hazards}
              impacts={impacts}
              onLaunch={launch}
              onImpact={impact}
              onMiss={miss}
              blackHole={blackHole}
              onImpactDone={(id) => setImpacts((current) => current.filter((i) => i.id !== id))}
              onToggleFullPage={() => (fullPage ? exitFullPage() : setFullPage(true))}
            />
          </main>

          <aside className="right">
            <Telemetry event={event} />
            <Timeline logs={logs} seconds={seconds} />
          </aside>

          {fullPage && (
            <>
              <button
                className="drawer-toggle drawer-toggle-left"
                aria-expanded={leftOpen}
                onClick={() => setLeftOpen(!leftOpen)}
              >
                {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                <span>{tab === 'Planetary Trajectories' ? 'MISSION CONTROL' : 'DISASTER MAKER'}</span>
              </button>
              <button
                className="drawer-toggle drawer-toggle-right"
                aria-expanded={rightOpen}
                onClick={() => setRightOpen(!rightOpen)}
              >
                {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                <span>TELEMETRY / AI LOG</span>
              </button>
            </>
          )}
        </div>
      )}

      <footer>
        INTERSTELLAR X⁴ / HACKATHON PROTOTYPE{' '}
        <span>3D UI DEMO — PHYSICS AND AI BACKEND INTEGRATION PENDING</span>
      </footer>
    </div>
  );
}
