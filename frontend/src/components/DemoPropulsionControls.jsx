import { useState } from 'react';

export default function DemoPropulsionControls({ demo }) {
  const [seconds, setSeconds] = useState(2);
  const [error, setError] = useState('');
  const fire = (linear, angular) => {
    try { demo.burn({ linear, angular, seconds }); setError(''); }
    catch (e) { setError(e.message); }
  };
  return <fieldset className="arm-controls impact-controls">
    <legend>DEMO propulsion test controls</legend>
    <p className="muted">Finite body-frame burns. +Z is the nose, +Y is up, +X is right. Turning changes attitude; thrust changes velocity. These manual tests do not call an AI model.</p>
    <label>Burn duration (s)<input type="number" min=".1" max="10" step=".1" value={seconds} onChange={e => setSeconds(Number(e.target.value))} /></label>
    <div className="choices">
      {[
        ['Main +Z', [0, 0, 1]], ['Reverse −Z', [0, 0, -1]],
        ['Right +X', [1, 0, 0]], ['Left −X', [-1, 0, 0]],
        ['Up +Y', [0, 1, 0]], ['Down −Y', [0, -1, 0]],
      ].map(([label, linear]) => <button key={label} disabled={!demo.playing || demo.physics.fuel <= 0 || demo.physics.faults.includes('Thruster Failure') || (label === 'Main +Z' && (demo.physics.bonds.engine.broken || demo.physics.faults.includes('Engine Failure')))} onClick={() => fire(linear, [0, 0, 0])}>{label}</button>)}
      {[
        ['Pitch +', [1, 0, 0]], ['Pitch −', [-1, 0, 0]],
        ['Yaw +', [0, 1, 0]], ['Yaw −', [0, -1, 0]],
        ['Roll +', [0, 0, 1]], ['Roll −', [0, 0, -1]],
      ].map(([label, angular]) => <button key={label} disabled={!demo.playing || demo.physics.fuel <= 0 || demo.physics.faults.includes('Thruster Failure')} onClick={() => fire([0, 0, 0], angular)}>{label}</button>)}
    </div>
    <button onClick={demo.coast}>Cut thrust · coast</button>
    {demo.courseCorrection && <button onClick={()=>demo.courseCorrection(!demo.physics.flightControl.enabled)}>{demo.physics.flightControl.enabled ? 'Disable automatic course correction' : 'Enable automatic course correction'}</button>}
    <p className="muted">Automatic course correction uses Propelling's standing authority and finite thrust, without Main Judging approval or model calls. It yields to deliberate maneuvers. Cut thrust also disables correction for free coasting; enable it again to recover the route. Burns and impacts run at 1x while map travel continues.</p>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
