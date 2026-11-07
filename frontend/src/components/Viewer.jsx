import { LocateFixed, Maximize2, Minimize2, Pause, Play, RotateCcw, Satellite } from 'lucide-react';
import { useState } from 'react';
import Scene from './Scene.jsx';

const TITLES = {
  'Planetary Trajectories': 'PLANETARY TRAJECTORIES',
  'AI Logs': 'AI EVENT ANALYSIS',
};

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

export default function Viewer({
  tab,
  event,
  playing,
  logs,
  seconds,
  fullPage,
  onTogglePlaying,
  onReset,
  onPlace,
  onToggleFullPage,
}) {
  const planet = tab === 'Planetary Trajectories';
  const [viewResetCount, setViewResetCount] = useState(0);

  return (
    <div className="panel viewer">
      <div className="panelhead">
        <Satellite size={19} /> {TITLES[tab] ?? 'SPACECRAFT 3D VIEW'}
        <span className="tiny">WASD / ARROWS · SWIPE TO LOOK</span>
      </div>

      {tab === 'AI Logs' ? (
        <div className="biglogs">
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      ) : (
        <div className="scene">
          <Scene
            planet={planet}
            event={event}
            playing={playing}
            fullPage={fullPage}
            viewResetCount={viewResetCount}
            onPlace={onPlace}
          />
          <div className="scenehint">
            {planet ? 'ORBITAL SANDBOX · CONCEPTUAL PATHS' : 'UNMANNED AI SPACECRAFT · LIVE 3D PREVIEW'}
          </div>
          {event && <div className="warning">⚠ {event.name.toUpperCase()} DETECTED</div>}
        </div>
      )}

      <div className="controls">
        <button onClick={onTogglePlaying}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button onClick={onReset}>
          <RotateCcw size={16} />
        </button>
        <span>SIM TIME: {formatTime(seconds)}</span>
        <div className="view-buttons">
          {tab !== 'AI Logs' && (
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
