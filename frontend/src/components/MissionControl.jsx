import { Radar } from 'lucide-react';

export const DEFAULT_MAP_INFO =
  'Scroll or W/S to zoom, drag or A/D to pan. Click an object or use Inspect to select it. Positions and the mission route come from the backend.';

/** Left column on the Planetary Trajectories tab, in place of the Disaster Maker. */
export default function MissionControl({ origin, destination, voyageLabel, mapInfo, map, ready }) {
  const landmarks = map?.objects.filter(item => item.kind === 'hazard') ?? [];
  return (
    <aside className="panel left mission-control">
      <div className="panelhead">
        <Radar size={18} /> MISSION CONTROL
      </div>

      <dl className="mission-route">
        <div>
          <dt>Origin</dt>
          <dd>{origin}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{destination}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{voyageLabel}</dd>
        </div>
      </dl>

      <h4>SELECTED</h4>
      <p className="muted">{mapInfo}</p>

      <h4>BACKEND MAP</h4>
      <p className="muted">{map?.description ?? 'Waiting for the selected backend map.'}</p>
      <p className="muted">{ready ? 'Live measured positions. Pause freezes the Gazebo world. Orbit speed changes planetary motion in the backend.' : 'Waiting for fresh backend measurements. Map commands are disabled.'}</p>
      <h4>LANDMARKS</h4>
      <p className="muted">{landmarks.length ? landmarks.map(item => item.label).join(' · ') : 'No hazard landmarks in this map.'}</p>
      <p className="muted">Landmarks are map objects. Radiation, black-hole gravity and disaster damage are not implemented.</p>
    </aside>
  );
}
