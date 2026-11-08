import { Radar } from 'lucide-react';

export const DEFAULT_MAP_INFO =
  'Scroll or W/S to zoom, drag or A/D to move. Click a planet to inspect it. The Sun stays at the center while planets orbit at different speeds. Cyan lines show a conceptual mission route.';

/** Left column on the Planetary Trajectories tab, in place of the Disaster Maker. */
export default function MissionControl({ origin, destination, voyageLabel, mapInfo, blackHole }) {
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

      <h4>HAZARDS</h4>
      <p className="muted">
        ⚠ Simulated hazards: asteroid field, black hole encounter, and solar storm. Illustrative, not
        to physical scale.
      </p>
      <p className={blackHole ? 'mission-alert' : 'muted'}>
        Black hole: {blackHole ? 'ACTIVE · about 8 AU from the Sun, far lower-left. Follow the arrow or drag the map to find it.' : 'not present'}
      </p>
    </aside>
  );
}
