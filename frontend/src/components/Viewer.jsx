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
import BackendMap from './BackendMap.jsx';
import AIControlPanel from './AIControlPanel.jsx';

const TITLES = {
  'Planetary Trajectories': 'PLANETARY TRAJECTORIES',
  'AI Logs': 'AI MANAGEMENT & EVENT LOG',
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
  onShowLiveShip,
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
        <div className="ai-log-view">
          <AIControlPanel simulation={simulation} onShowLiveShip={onShowLiveShip} />
          <details className="biglogs"><summary>Simulation and demo events</summary>
            {logs.map((item) => <div key={item.id}>{item.text}</div>)}
          </details>
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
