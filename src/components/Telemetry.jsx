import { Activity } from 'lucide-react';

function getMetrics(event) {
  const damage = event ? Math.round(event.severity * 0.48) : 0;

  return [
    ['Hull Integrity', 100 - damage],
    ['Solar Panel Health', 100 - (event?.name.includes('Solar') ? damage : Math.round(damage / 2))],
    ['Battery Level', 100 - Math.round(damage / 3)],
    ['Oxygen', 100 - (event?.name === 'Oxygen Leak' ? damage : 0)],
    ['Thruster Efficiency', 100 - (event?.name === 'Thruster Failure' ? damage : 0)],
  ];
}

export default function Telemetry({ event }) {
  return (
    <div className="panel">
      <div className="panelhead">
        <Activity size={18} /> LIVE TELEMETRY <span className="live">● LIVE</span>
      </div>

      {getMetrics(event).map(([label, value]) => (
        <div className="metric" key={label}>
          <div>
            <span>{label}</span>
            <b>{value}%</b>
          </div>
          <div className="track">
            <div style={{ width: `${value}%`, background: value < 75 ? '#f6a15c' : '#00d9e9' }} />
          </div>
        </div>
      ))}

      <div className="metric">
        <div>
          <span>Velocity</span>
          <b>7.62 km/s</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Attitude</span>
          <b>{event ? 'STABILIZING' : 'STABLE'}</b>
        </div>
      </div>
    </div>
  );
}
