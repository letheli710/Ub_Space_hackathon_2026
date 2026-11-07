import { Activity } from 'lucide-react';

const reading = (value, suffix = '', digits = 2) => Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—';
export default function Telemetry({ simulation }) {
  const { scene, state, ready } = simulation;
  const navigation = state?.navigation;
  return (
    <div className="panel">
      <div className="panelhead"><Activity size={18} />SHIP TELEMETRY<span className={`live ${ready ? '' : 'stale'}`}>{ready ? '● LIVE' : '● STALE'}</span></div>
      <div className="metric"><div><span>Destination</span><b>{navigation?.destination?.replaceAll('_', ' ') ?? '—'}</b></div></div>
      <div className="metric"><div><span>Distance to center</span><b>{reading(navigation?.distance_m, ' m', 1)}</b></div></div>
      <div className="metric"><div><span>Nominal cruise speed</span><b>{reading(navigation?.cruise_speed_m_s, ' m/s')}</b></div></div>
      <div className="metric"><div><span>Mission</span><b>{!state ? '—' : navigation?.arrived ? 'ARRIVED' : state.paused ? 'PAUSED' : 'EN ROUTE'}</b></div></div>
      <div className="metric"><div><span>Map objects</span><b>{scene?.entities.length ?? '—'}</b></div></div>
      <div className="joint-readings">
        <h4>MEASURED ARM POSITIONS</h4>
        {(scene?.arms ?? []).map(arm => {
          const measurement = state?.arms.find(item => item.id === arm.id);
          return <div className="arm-reading" key={arm.id}><strong>{arm.system.replaceAll('_', ' ')}</strong>
            {Object.keys(arm.joints).map(name => <div key={name}><span>{name}</span><output>{reading(measurement?.measured_rad[name], ' rad', 3)}</output></div>)}
          </div>;
        })}
      </div>
      <p className="muted telemetry-note">System health and AI action readings will appear when those systems are available.</p>
    </div>
  );
}
