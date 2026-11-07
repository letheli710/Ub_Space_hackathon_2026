export default function MissionStatus({ event }) {
  return (
    <div className="panel">
      <div className="panelhead">MISSION STATUS</div>
      <h2>{event ? 'HAZARD ACTIVE' : 'NOMINAL'}</h2>
      <p className="muted">Endless sandbox · No destination · Manual hazard placement</p>
    </div>
  );
}
