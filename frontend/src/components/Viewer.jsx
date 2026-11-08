import {
  LocateFixed,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Satellite,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MAX_TIME_SCALE, MIN_TIME_SCALE, formatTimeScale, parseTimeScale } from '../data/voyage.js';
import DemoScene from './DemoScene.jsx';
import LiveScene from './LiveScene.jsx';
import BackendMap from './BackendMap.jsx';

const TITLES = {
  'Planetary Trajectories': 'PLANETARY TRAJECTORIES',
  'AI Logs': 'SIMULATION EVENT LOG',
};

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

/** − [typed value] + control for the demo time scale. Accepts 100000, 100K, 2.5M, 1Mx… */
function TimeScaleControl({ value, onStep, onChange }) {
  const [draft, setDraft] = useState(null); // text while editing, null otherwise
  const [invalid, setInvalid] = useState(false);
  const cancelled = useRef(false);

  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const parsed = parseTimeScale(draft);
    setDraft(null);
    if (parsed === null) {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 1200);
    } else if (parsed !== value) {
      onChange(parsed);
    }
  }

  return (
    <div
      className={`time-scale ${invalid ? 'invalid' : ''}`}
      role="group"
      aria-label="Demo time scale"
      title="Mission time per real second. Type a value such as 100K or 2.5M."
    >
      <button aria-label="Slower" disabled={value <= MIN_TIME_SCALE} onClick={() => onStep(-1)}>
        −
      </button>
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
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        spellCheck={false}
        autoComplete="off"
      />
      <button aria-label="Faster" disabled={value >= MAX_TIME_SCALE} onClick={() => onStep(1)}>
        +
      </button>
    </div>
  );
}

export default function Viewer({
  tab,
  live,
  viewMode,
  onViewModeChange,
  simulation,
  logs,
  fullPage,
  onToggleFullPage,
  // demo view
  event,
  playing,
  seconds,
  onTogglePlaying,
  onResetDemo,
  timeScale,
  onTimeScaleStep,
  onTimeScaleChange,
  voyage,
  voyageLabel,
  armed,
  hazards,
  impacts,
  onLaunch,
  onImpact,
  onMiss,
  onImpactDone,
  blackHole,
  solarStorm,
  stormFlash,
  onStormReach,
  onStormDone,
  onMapInspect,
}) {
  const [viewResetCount, setViewResetCount] = useState(0);
  const [modelError, setModelError] = useState('');
  const blackHoleMarker = useRef();
  const { scene, state, ready, pending, message, error } = simulation;
  useEffect(() => setModelError(''), [scene?.revision]);

  const planet = tab === 'Planetary Trajectories';
  const generator = tab === 'Generator';
  const livePlaying = state?.paused === false;
  const liveLabel = !simulation.connected
    ? 'DISCONNECTED · LAST RECEIVED STATE'
    : !ready
      ? 'WAITING FOR PHYSICS'
      : livePlaying
        ? 'LIVE SIMULATION'
        : 'SIMULATION PAUSED';

  return (
    <div className="panel viewer">
      <div className="panelhead">
        <Satellite size={19} /> {TITLES[tab] ?? 'SPACECRAFT 3D VIEW'}
        {generator && (
          <div className="segmented view-mode" role="group" aria-label="3D view source">
            <button
              className={viewMode === 'live' && live ? 'active' : ''}
              aria-pressed={live}
              disabled={!scene}
              title={scene ? 'Show the live simulator' : 'Start the simulator backend to use the live view'}
              onClick={() => onViewModeChange('live')}
            >
              LIVE SIM
            </button>
            <button
              className={!live ? 'active' : ''}
              aria-pressed={!live}
              title="In-browser demo with the Disaster Maker"
              onClick={() => onViewModeChange('demo')}
            >
              DEMO
            </button>
          </div>
        )}
        {generator && <span className="tiny">WASD / ARROWS · SWIPE TO LOOK</span>}
      </div>

      {(live || planet) && (message || error || (generator && modelError)) && (
        <div className="connection-banner" role="status">
          {generator && modelError ? `Model asset error: ${modelError}` : error || message}
        </div>
      )}

      {tab === 'AI Logs' && (
        <div className="biglogs">
          {logs.map((item) => (
            <div key={item.id}>{item.text}</div>
          ))}
        </div>
      )}

      {planet && (
        <div className="scene">
          {scene ? <BackendMap simulation={simulation} onInspect={onMapInspect} /> :
            <div className="scene-empty"><strong>Waiting for the backend map</strong><p>Start the simulator to load its map, planet positions and navigation state.</p></div>}
        </div>
      )}

      {generator && live && (
        <div className="scene">
          <LiveScene
            scene={scene}
            state={state}
            fullPage={fullPage}
            viewResetCount={viewResetCount}
            onError={setModelError}
          />
          <div className="scenehint">
            {scene?.world?.replaceAll('_', ' ').toUpperCase()} · {liveLabel}
          </div>
        </div>
      )}

      {generator && !live && (
        <div className={armed ? 'scene armed' : 'scene'}>
          <DemoScene
            voyage={voyage}
            event={event}
            playing={playing}
            fullPage={fullPage}
            viewResetCount={viewResetCount}
            armed={armed}
            hazards={hazards}
            impacts={impacts}
            onLaunch={onLaunch}
            onImpact={onImpact}
            onMiss={onMiss}
            onImpactDone={onImpactDone}
            blackHole={blackHole}
            blackHoleMarker={blackHoleMarker}
            solarStorm={solarStorm}
            onStormReach={onStormReach}
            onStormDone={onStormDone}
          />
          <div className="scenehint">DEMO · UNMANNED AI SPACECRAFT · {voyageLabel}</div>
          {stormFlash > 0 && <div key={stormFlash} className="storm-flash" aria-hidden="true" />}
          {event && <div className="warning">⚠ {event.name.toUpperCase()} DETECTED</div>}
          {armed && <div className="armed-hint">Click to launch {armed} · Esc to cancel</div>}
          {blackHole && (
            <div className="bh-marker" ref={blackHoleMarker} aria-hidden="true">
              <span className="bh-arrow" />
              <span className="bh-label" />
            </div>
          )}
        </div>
      )}

      <div className="controls">
        {live || planet ? (
          <>
            <button
              disabled={!ready || pending}
              title={livePlaying ? 'Pause simulation' : 'Resume simulation'}
              aria-label={livePlaying ? 'Pause simulation' : 'Resume simulation'}
              onClick={() => simulation.setPaused(livePlaying).catch(() => {})}
            >
              {livePlaying ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button title="Reconnect to simulator" aria-label="Reconnect to simulator" onClick={simulation.reconnect}>
              <RefreshCw size={16} />
            </button>
            <span>
              SIM TIME:{' '}
              <time aria-label="Simulation time">
                {state?.sim_time_s == null ? '—' : `${state.sim_time_s.toFixed(1)}s`}
              </time>
            </span>
          </>
        ) : (
          <>
            <button
              title={playing ? 'Pause demo' : 'Resume demo'}
              aria-label={playing ? 'Pause demo' : 'Resume demo'}
              onClick={onTogglePlaying}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button title="Reset demo" aria-label="Reset demo" onClick={onResetDemo}>
              <RotateCcw size={16} />
            </button>
            <button title="Reconnect to simulator" aria-label="Reconnect to simulator" onClick={simulation.reconnect}>
              <RefreshCw size={16} />
            </button>
            <span>SIM TIME: {formatTime(seconds)}</span>
          </>
        )}
        <div className="view-buttons">
          {generator && !live && (
            <TimeScaleControl value={timeScale} onStep={onTimeScaleStep} onChange={onTimeScaleChange} />
          )}
          {generator && (
            <button onClick={() => setViewResetCount((n) => n + 1)}>
              <LocateFixed size={16} />
              Reset View
            </button>
          )}
          <button onClick={onToggleFullPage}>
            {fullPage ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {fullPage ? 'Exit Full Page' : 'Full Page'}
          </button>
        </div>
      </div>
    </div>
  );
}
