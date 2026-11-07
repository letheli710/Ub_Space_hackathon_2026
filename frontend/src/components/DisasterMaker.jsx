import { AlertTriangle, Bot } from 'lucide-react';
import { INNER_DISASTERS, OUTER_DISASTERS } from '../data/disasters.js';
import ArmControls from './ArmControls.jsx';

export default function DisasterMaker({ simulation, onLog }) {
  return (
    <aside className="panel left">
      <div className="panelhead"><Bot size={18} />ROBOTIC ARM CONTROL</div>
      <ArmControls simulation={simulation} onLog={onLog} />
      <details className="future-disasters">
        <summary><AlertTriangle size={15} />Disaster maker · coming later</summary>
        <p className="muted">Disaster injection and autonomous AI responses are planned. They are unavailable in the current simulation.</p>
        <div className="choices">{[...OUTER_DISASTERS, ...INNER_DISASTERS].map(name => <button key={name} disabled>{name}</button>)}</div>
      </details>
    </aside>
  );
}
