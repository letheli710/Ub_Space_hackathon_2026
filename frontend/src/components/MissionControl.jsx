import { Radar } from 'lucide-react';

export const DEFAULT_MAP_INFO =
  'Scroll or W/S to zoom, drag or A/D to pan. Click an object or use Inspect to select it. Positions come from the backend, or from the DEMO voyage when no backend is connected.';

/** Left column on the Planetary Trajectories tab, in place of the Disaster Maker. */
export default function MissionControl({ origin, destination, voyageLabel, mapInfo, map, ready, demo = false }) {
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

      {demo ? (
        <>
          <h4>DEMO MAP</h4>
          <p className="muted">No simulator backend is connected, so this map shows the in-browser DEMO voyage: real planet orbits from JPL elements and the Earth → Mars → Earth loop flown on the Generator tab.</p>
          <p className="muted">Pause, reset and speed are shared with the Generator DEMO. Start the backend to switch to the live Gazebo map.</p>
        </>
      ) : (
        <>
      <h4>BACKEND MAP</h4>
      <p className="muted">{map?.description ?? 'Waiting for the selected backend map.'}</p>
      <p className="muted">{ready ? 'Live measured positions. Pause freezes the Gazebo world. Orbit speed changes planetary motion in the backend.' : 'Waiting for fresh backend measurements. Map commands are disabled.'}</p>
      <h4>LANDMARKS</h4>
      <p className="muted">{landmarks.length ? landmarks.map(item => item.label).join(' · ') : 'No hazard landmarks in this map.'}</p>
      <p className="muted">Landmarks are map objects. Radiation, black-hole gravity and disaster damage are not implemented.</p>
        </>
      )}
    </aside>
  );
}
