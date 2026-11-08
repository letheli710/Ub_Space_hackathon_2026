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
      {state?.physics && <>
        <div className="metric"><div><span>Propellant remaining</span><b>{reading(state.physics.fuel_kg, ' kg', 1)}</b></div></div>
        <div className="metric"><div><span>Applied thrust</span><b>{reading(Math.hypot(...state.physics.force_world_n), ' N', 0)}</b></div></div>
        <div className="metric"><div><span>Angular speed</span><b>{reading(Math.hypot(...state.physics.angular_velocity_world_rad_s), ' rad/s', 3)}</b></div></div>
        <p className="muted">Physics: {state.physics.mode} · {state.physics.bonds.filter(b => b.broken).length} failed attachments</p>
        {state.physics.bonds.filter(b => b.broken || b.peak_utilization > .01).map(b => <p className="telemetry-fault" key={b.id}>
          {b.id.replaceAll('_', ' ')} · {b.broken ? 'DETACHED' : 'attached'} · peak load {(100*b.peak_utilization).toFixed(0)}% of capacity
        </p>)}
      </>}
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
              <strong>{arm.id} · {arm.label ?? arm.system.replaceAll('_', ' ')}</strong>
              {measurement?.available === false && <strong className="telemetry-fault">DETACHED · control unavailable</strong>}
              {arm.location && <small>{arm.location.module_id} · {arm.location.description}</small>}
              {Object.keys(arm.joints).map((name) => (
                <div key={name}>
                  <span>{name}</span>
                  <output>{reading((measurement?.measured ?? measurement?.measured_rad)?.[name], ` ${arm.joints[name].unit ?? 'rad'}`, 3)}</output>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted telemetry-note">
        Sensor warnings use approximate geometry. Attachment loads come from Gazebo contacts; health, charge rates and maintenance remain modeled indicators, not electrical measurements.
      </p>
    </div>
  );
}

/** Illustrative readings for the in-browser demo. */
function DemoTelemetry({ event, demoStatus }) {
  const p = demoStatus.physics;
  const motion = p ? [
    ['Velocity vector (m/s)', p.velocity.map(n => n.toFixed(2)).join(', ')],
    ['Δv from launch', `${p.deltaV.toFixed(3)} m/s`],
    ['Course deviation', `${p.deviationM.toFixed(2)} m`],
    ['Position X/Y/Z (km)', p.position.map(n => (n / 1000).toFixed(2)).join(', ')],
    ['Angular speed', `${Math.hypot(...p.angularVelocity).toFixed(4)} rad/s`],
    ['Propellant', `${p.fuelKg.toFixed(2)} kg`],
    ['Attached mass', `${p.massKg.toFixed(1)} kg`],
    ['Applied thrust', `${p.forceN.toFixed(0)} N`],
    ['Propulsion', p.mode.toUpperCase()],
    ['Physics time scale', `${p.timeScale}x`],
    ['Detached components', String(p.detached.length)],
    ...(demoStatus.navigation ? [
      ['Celestial date (UTC)', demoStatus.celestialDate.slice(0, 10)],
      ['Mission phase', demoStatus.navigation.phase],
      ['Next phase in', demoStatus.navigation.eta_s===null ? 'Propulsion repair required' : `${(demoStatus.navigation.eta_s / 86400).toFixed(1)} mission days`],
      ['Guided map X/Y/Z (AU)', demoStatus.navigation.map_position_au.map(n => n.toFixed(3)).join(', ')],
      ['Target orbital speed', `${demoStatus.navigation.target_orbital_speed_km_s.toFixed(2)} km/s`],
    ] : []),
  ] : [];
  const metrics = p ? [
    ['Structural integrity', Number(p.integrity.toFixed(1))],
    ['Main solar wings attached', 100 - 50 * p.detached.filter(id => ['solarLeft', 'solarRight'].includes(id)).length],
    ['Propellant remaining', Math.round(p.fuelKg / 40)],
    ['Battery charge', Math.round(p.battery)],
    ['Propulsion integrity', Number(p.propulsionIntegrity.toFixed(1))],
    ['Energy integrity', Number(p.energyIntegrity.toFixed(1))],
  ] : getMetrics(event);
  return (
    <div className="panel">
      <div className="panelhead">
        <Activity size={18} /> DEMO TELEMETRY <span className="live">● DEMO</span>
      </div>

      {metrics.map(([label, value]) => (
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
          <b>{demoStatus.speedKmS.toFixed(5)} km/s</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Map travel day</span>
          <b>
            {Math.floor(demoStatus.day)}
          </b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Map travel scale</span>
          <b>{demoStatus.timeScaleLabel}</b>
        </div>
      </div>
      <div className="metric">
        <div>
          <span>Attitude</span>
          <b>{p && Math.hypot(...p.angularVelocity) > .0001 ? 'ROTATING' : 'STEADY'}</b>
        </div>
      </div>
      {motion.map(([label, value]) => <div className="metric" key={label}><div><span>{label}</span><b>{value}</b></div></div>)}
      {p && <>
        <p className="muted">Integrity cruise: {(p.cruiseSpeedM_s/1000).toFixed(3)} km/s · emergency repair reserve: {p.emergencyBattery.toFixed(1)}</p>
        {Object.entries(p.systems).map(([id,status])=><p key={id} className={status.mode==='offline' ? 'telemetry-fault' : 'muted'}>{id.replaceAll('_',' ')} · {status.mode.toUpperCase()}{status.reason ? ` · ${status.reason}` : ''}{status.remaining_s>0 ? ` · ${status.remaining_s.toFixed(1)} s remaining` : ''}</p>)}
      </>}
      {p && <>
        <p className="muted">Measured browser physics · SI units. Map travel keeps its playback speed during encounters. Local impacts, burns and repairs use 1x time; map position and travel day are illustrative.</p>
        {p.lastImpact && <p className="telemetry-fault">Last contact: {p.lastImpact.part} · {p.lastImpact.impulseNs.toFixed(0)} N·s · {(p.lastImpact.utilization * 100).toFixed(0)}% attachment capacity</p>}
        <h4>COMPONENT DAMAGE</h4>
        {p.bonds.map(b => <div className="metric" key={b.id}><div><span>{b.id} · {b.stage.toUpperCase()}</span><b>{b.health.toFixed(1)}%</b></div><div className="track"><div style={{ width: `${b.health}%`, background: b.health < 50 ? '#e65a48' : b.health < 99.95 ? '#f6a15c' : '#00d9e9' }} /></div></div>)}
        {p.repairs.map(j => <p className="muted" key={j.arm_id}>{j.rebuild ? 'REBUILD' : 'REPAIR'} · {j.arm_id} → {j.part_id} · {j.status} · tool contact {j.contactSeconds.toFixed(1)}/10 s{Number.isFinite(j.contactDistance) ? ` · socket distance ${j.contactDistance.toFixed(2)} m` : ''}</p>)}
        <p className="muted">Solar generation: {p.solarProtection ? 'ISOLATED' : 'ACTIVE'}. Repairs require 10 continuous seconds of arm contact. Missing components are recreated at full integrity; ordinary attached repairs recover up to 95%.</p>
        <h4>NEARBY ROCKS & DEBRIS</h4>
        {!p.objects.length && <p className="muted">No local objects detected.</p>}
        {p.objects.map(o => <p className="muted" key={o.id}>{o.id} · {o.distanceM.toFixed(1)} m · closing {o.closingM_s.toFixed(1)} m/s</p>)}
        <h4>ARM MOUNTS</h4>
        {p.arms.map(a => <p className="muted" key={a.id}>{a.id} · {a.module} · {a.available ? 'ATTACHED' : 'UNAVAILABLE — DETACHED'}</p>)}
      </>}
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
