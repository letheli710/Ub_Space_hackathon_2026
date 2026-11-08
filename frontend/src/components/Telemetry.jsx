import { Activity } from 'lucide-react';
import { healthReadings } from '../simulation/shipTelemetry.js';

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
  const status = state?.ship_status;
  return (
    <div className="panel">
      <div className="panelhead">
        <Activity size={18} />
        SHIP TELEMETRY<span className={`live ${ready ? '' : 'stale'}`}>{ready ? '● LIVE' : '● STALE'}</span>
      </div>
      <p className="muted telemetry-note">Modeled health · Gazebo motion · shared with AI</p>
      {healthReadings(status).map(({ label, key, value }) => <div className="metric" key={key}>
        <div><span>{label}</span><b>{reading(value, '%', 1)}</b></div>
        <div className="track"><div style={{ width: `${value ?? 0}%`, background: value < 75 ? '#f6a15c' : '#00d9e9' }} /></div>
      </div>)}
      <div className="metric"><div><span>Measured velocity</span><b>{reading(status?.speed_m_s, ' m/s')}</b></div></div>
      <div className="metric"><div><span>Attitude</span><b>{status?.attitude?.label ?? '—'}</b></div></div>
      <div className="metric"><div><span>Battery balance</span><b>{reading(status?.power?.balance_pct_s, '%/s', 3)}</b></div></div>
      {(status?.active_faults ?? []).map(fault => <p className="telemetry-fault" key={fault.kind}>{fault.kind} · severity {fault.severity.toFixed(0)}%</p>)}
      {(status?.maintenance ?? []).map(job => <p className="muted telemetry-note" key={job.arm_id}>{job.arm_id} → {job.component.replaceAll('_', ' ')} · {job.status.replaceAll('_', ' ')} · recovered {job.recovered_pct.toFixed(1)}%</p>)}
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
        <h4>NEARBY OBJECTS · {state?.sensors?.range_m ?? '—'} m RANGE</h4>
        {!ready ? <p className="muted">Detections are stale.</p> : !state?.sensors?.ready ? <p className="muted">Waiting for sensor samples.</p> :
          state.sensors.objects.length === 0 ? <p className="muted">No objects detected within range.</p> :
            state.sensors.objects.slice(0, 6).map(object => <div className="arm-reading" key={object.entity_id}>
              <strong>{object.label}{object.proximity_warning ? ' · PROXIMITY' : ''}</strong>
              <div><span>Distance</span><output>{reading(object.distance_m, ' m', 1)}</output></div>
              <div><span>Closing speed</span><output>{reading(object.closing_speed_m_s, ' m/s', 1)}</output></div>
            </div>)}
        <h4>PROPULSION & SOLAR PANELS</h4>
        <p>{state?.propulsion?.control_mode?.replaceAll('_', ' ') ?? '—'}</p>
        {(state?.solar_panels ?? []).map(panel => <div className="arm-reading" key={panel.id}><strong>{panel.id}</strong><output>{reading(panel.measured_rad, ' rad', 3)}</output></div>)}
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
        Sensor warnings use approximate geometry. Health, charge rates and maintenance are game mechanics; they do not measure material damage or electrical watts.
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
