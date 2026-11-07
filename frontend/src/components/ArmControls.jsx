import { useEffect, useState } from 'react';

export default function ArmControls({ simulation, onLog }) {
  const { scene, state, ready, pending } = simulation;
  const [selected, setSelected] = useState('');
  const [targets, setTargets] = useState({});
  const arm = scene?.arms.find(item => item.id === selected) ?? scene?.arms[0];
  useEffect(() => {
    setTargets(Object.fromEntries(Object.entries(arm?.joints ?? {}).map(([name, bounds]) => [name, Math.max(bounds.lower_rad, Math.min(0, bounds.upper_rad))])));
  }, [arm]);
  const measured = state?.arms.find(item => item.id === arm?.id);
  if (!arm) return <p className="muted">Arm controls will load with the ship model.</p>;
  async function submit(event) {
    event.preventDefault();
    try {
      await simulation.setArmTargets(arm.id, targets);
      onLog(`${arm.system.replaceAll('_', ' ')} arm · joint target accepted`);
    } catch { /* The shared command status displays the server error. */ }
  }
  return (
    <form onSubmit={submit} className="arm-controls">
      <label htmlFor="arm-selection">Ship system</label>
      <select id="arm-selection" value={arm.id} onChange={event => setSelected(event.target.value)}>
        {scene.arms.map(item => <option key={item.id} value={item.id}>{item.system.replaceAll('_', ' ')}</option>)}
      </select>
      {Object.entries(arm.joints).map(([name, bounds]) => <div className="joint-control" key={name}>
        <label htmlFor={`joint-${name}`}>{name}<output>{Number(targets[name] ?? 0).toFixed(2)} rad</output></label>
        <input id={`joint-${name}`} aria-label={`${name} target`} type="range" min={bounds.lower_rad} max={bounds.upper_rad} step="0.01"
          value={targets[name] ?? 0} disabled={!ready || pending} onChange={event => setTargets(previous => ({ ...previous, [name]: Number(event.target.value) }))} />
        <small>Measured: {Number.isFinite(measured?.measured_rad[name]) ? measured.measured_rad[name].toFixed(3) : '—'} rad</small>
      </div>)}
      <button className="primary arm-submit" disabled={!ready || pending || Object.keys(targets).length === 0} type="submit">{pending ? 'Sending…' : 'Send arm target'}</button>
      <p className="muted">Targets are requested positions. Follow the measured readings to see the arm move.{state?.paused ? ' Resume the simulation to apply movement.' : ''}</p>
    </form>
  );
}
