import { LocateFixed, Maximize2, Minimize2, Pause, Play, RotateCcw, Satellite } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  onToggleFullPage,
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
  const planet = tab === 'Planetary Trajectories';
  const [viewResetCount, setViewResetCount] = useState(0);
  const mapFrame = useRef();
  const blackHoleMarker = useRef();

  // Keep the Planetary Trajectories map in step with the Black Hole Encounter button.
  const syncMap = () =>
    mapFrame.current?.contentWindow?.postMessage(
      { type: 'blackhole', active: blackHole },
      window.location.origin,
    );
  useEffect(syncMap);

  return (
    <div className="panel viewer">
      <div className="panelhead">
        <Satellite size={19} /> {TITLES[tab] ?? 'SPACECRAFT 3D VIEW'}
        {tab === 'Generator' && <span className="tiny">WASD / ARROWS · SWIPE TO LOOK</span>}
      </div>

      {tab === 'AI Logs' && (
        <div className="biglogs">
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
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

      {tab === 'Generator' && (
        <div className={armed ? 'scene armed' : 'scene'}>
          <Scene
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
          <div className="scenehint">UNMANNED AI SPACECRAFT · {voyageLabel}</div>
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
        <button onClick={onTogglePlaying}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button onClick={onReset}>
          <RotateCcw size={16} />
        </button>
        <span>SIM TIME: {formatTime(seconds)}</span>
        <div className="view-buttons">
          {tab === 'Generator' && (
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
