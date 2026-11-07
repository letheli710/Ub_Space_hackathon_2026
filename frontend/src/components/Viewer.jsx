import { LocateFixed, Maximize2, Minimize2, Pause, Play, RefreshCw, Satellite } from 'lucide-react';
import { useEffect, useState } from 'react';
import Scene from './Scene.jsx';

export default function Viewer({ tab, simulation, logs, fullPage, onToggleFullPage }) {
  const [viewResetCount, setViewResetCount] = useState(0);
  const [modelError, setModelError] = useState('');
  const { scene, state, ready, connected, pending, message, error } = simulation;
  useEffect(() => setModelError(''), [scene?.revision]);
  const planet = tab === 'Planetary Trajectories';
  const playing = state?.paused === false;
  const label = !connected ? 'DISCONNECTED · LAST RECEIVED STATE' : !ready ? 'WAITING FOR PHYSICS' : playing ? 'LIVE SIMULATION' : 'SIMULATION PAUSED';
  return (
    <div className="panel viewer">
      <div className="panelhead"><Satellite size={19} />{tab === 'AI Logs' ? 'SIMULATION EVENT LOG' : planet ? 'MISSION MAP' : 'SPACECRAFT 3D VIEW'}
        <span className="tiny">DRAG TO ORBIT · WASD / ARROWS TO MOVE</span></div>
      {(message || error || modelError) && <div className="connection-banner" role="status">{modelError ? `Model asset error: ${modelError}` : error || message}</div>}
      {tab === 'AI Logs' ? <div className="biglogs">{logs.map(item => <div key={item.id}>{item.text}</div>)}</div> : (
        <div className="scene">
          {scene ? <Scene scene={scene} state={state} planet={planet} fullPage={fullPage} viewResetCount={viewResetCount} onError={setModelError} />
            : <div className="scene-empty">Connecting to the ship and mission map…<button onClick={simulation.reconnect}>Retry connection</button></div>}
          <div className="scenehint">{scene?.world?.replaceAll('_', ' ').toUpperCase()} · {label}</div>
        </div>
      )}
      <div className="controls">
        <button disabled={!ready || pending} title={playing ? 'Pause simulation' : 'Resume simulation'} aria-label={playing ? 'Pause simulation' : 'Resume simulation'}
          onClick={() => simulation.setPaused(playing).catch(() => {})}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
        <button title="Reconnect to simulator" aria-label="Reconnect to simulator" onClick={simulation.reconnect}><RefreshCw size={16} /></button>
        <span>SIM TIME: <time aria-label="Simulation time">{state?.sim_time_s == null ? '—' : `${state.sim_time_s.toFixed(1)}s`}</time></span>
        <div className="view-buttons">
          {tab !== 'AI Logs' && <button disabled={!scene} onClick={() => setViewResetCount(value => value + 1)}><LocateFixed size={16} />Reset View</button>}
          <button onClick={onToggleFullPage}>{fullPage ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullPage ? 'Exit Full Page' : 'Full Page'}</button>
        </div>
      </div>
    </div>
  );
}
