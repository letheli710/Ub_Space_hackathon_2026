import { Activity } from 'lucide-react';

/** Demo readings derived from the active disaster (used by the demo view and the Home page). */
export function getMetrics(event) {
  const damage = event ? Math.round(event.severity * 0.48) : 0;

  return [
    ['Hull Integrity', 100 - damage],
    ['Solar Panel Health', 100 - (event?.name.includes('Solar') ? damage : Math.round(damage / 2))],
    ['Battery Level', 100 - Math.round(damage / 3)],
    ['Oxygen', 100 - (event?.name === 'Oxygen Leak' ? damage : 0)],
    ['Thruster Efficiency', 100 - (event?.name === 'Thruster Failure' ? damage : 0)],
  ];
}

const reading = (value, suffix = '', digits = 2) =>
  Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—';

/** Measured values from the ROS/Gazebo simulator. */
function LiveTelemetry({ simulation }) {
  const { scene, state, ready } = simulation;
  const navigation = state?.navigation;
  return (
    <div className="panel">
      <div className="panelhead">
        <Activity size={18} />
        SHIP TELEMETRY<span className={`live ${ready ? '' : 'stale'}`}>{ready ? '● LIVE' : '● STALE'}</span>
      </div>
      <div className="metric">
        <div>
          <span>Destination</span>
          <b>{navigation?.destination?.replaceAll('_', ' ') ?? '—'}</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Distance to center</span>
          <b>{reading(navigation?.distance_m, ' m', 1)}</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Nominal cruise speed</span>
          <b>{reading(navigation?.cruise_speed_m_s, ' m/s')}</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Mission</span>
          <b>{!state ? '—' : navigation?.arrived ? 'ARRIVED' : state.paused ? 'PAUSED' : 'EN ROUTE'}</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Map objects</span>
          <b>{scene?.entities.length ?? '—'}</b>
        </div>
      </div>
      <div className="joint-readings">
        <h4>MEASURED ARM POSITIONS</h4>
        {(scene?.arms ?? []).map((arm) => {
          const measurement = state?.arms.find((item) => item.id === arm.id);
          return (
            <div className="arm-reading" key={arm.id}>
              <strong>{arm.system.replaceAll('_', ' ')}</strong>
              {Object.keys(arm.joints).map((name) => (
                <div key={name}>
                  <span>{name}</span>
                  <output>{reading(measurement?.measured_rad[name], ' rad', 3)}</output>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted telemetry-note">
        System health and AI action readings will appear when those systems are available.
      </p>
    </div>
  );
}

/** Illustrative readings for the in-browser demo. */
function DemoTelemetry({ event, demoStatus }) {
  return (
    <div className="panel">
      <div className="panelhead">
        <Activity size={18} /> DEMO TELEMETRY <span className="live">● DEMO</span>
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
          <b>{demoStatus.inOrbit ? 'IN ORBIT' : `${demoStatus.speedKmS.toFixed(2)} km/s`}</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Mission day</span>
          <b>
            {Math.floor(demoStatus.day)} / {Math.round(demoStatus.legDays)}
          </b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Time scale</span>
          <b>{demoStatus.timeScaleLabel}</b>
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

export default function Telemetry({ live, simulation, event, demoStatus }) {
  return live ? (
    <LiveTelemetry simulation={simulation} />
  ) : (
    <DemoTelemetry event={event} demoStatus={demoStatus} />
  );
}
