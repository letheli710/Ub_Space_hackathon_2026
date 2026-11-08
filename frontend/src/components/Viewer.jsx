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
import DemoScene from './DemoScene.jsx';
import LiveScene from './LiveScene.jsx';

const TITLES = {
  'Planetary Trajectories': 'PLANETARY TRAJECTORIES',
  'AI Logs': 'SIMULATION EVENT LOG',
};

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
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
}) {
  const [viewResetCount, setViewResetCount] = useState(0);
  const [modelError, setModelError] = useState('');
  const mapFrame = useRef();
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

  // Keep the Planetary Trajectories map in step with the Black Hole Encounter button.
  const syncMap = () =>
    mapFrame.current?.contentWindow?.postMessage({ type: 'blackhole', active: blackHole }, window.location.origin);
  useEffect(syncMap);

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

      {live && generator && (message || error || modelError) && (
        <div className="connection-banner" role="status">
          {modelError ? `Model asset error: ${modelError}` : error || message}
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
          <iframe
            ref={mapFrame}
            onLoad={syncMap}
            className="trajectories-frame"
            src="/planetary-trajectories.html"
            title="Planetary Trajectories"
          />
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
          />
          <div className="scenehint">DEMO · UNMANNED AI SPACECRAFT · {voyageLabel}</div>
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
        {live ? (
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
