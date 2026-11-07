import { AlertTriangle, RotateCcw, Send, Target } from 'lucide-react';
import { INNER_DISASTERS, OUTER_DISASTERS } from '../data/disasters.js';

function DisasterChoices({ disasters, choice, onChoiceChange }) {
  return (
    <div className="choices">
      {disasters.map((name) => (
        <button
          key={name}
          className={choice === name ? 'selected' : ''}
          onClick={() => onChoiceChange(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export default function DisasterMaker({
  choice,
  onChoiceChange,
  severity,
  onSeverityChange,
  speed,
  onSpeedChange,
  angle,
  onAngleChange,
  placed,
  onInject,
  onReset,
}) {
  return (
    <aside className="panel left">
      <div className="panelhead">
        <AlertTriangle size={18} /> DISASTER MAKER
      </div>
      <p className="muted">
        Configure and inject simulated hazards into your autonomous spacecraft.
      </p>

      <h4>OUTER DISASTERS</h4>
      <DisasterChoices
        disasters={OUTER_DISASTERS}
        choice={choice}
        onChoiceChange={onChoiceChange}
      />

      <h4>INNER DISASTERS</h4>
      <DisasterChoices
        disasters={INNER_DISASTERS}
        choice={choice}
        onChoiceChange={onChoiceChange}
      />

      <h4>DISASTER PARAMETERS</h4>
      <label>
        Severity <strong>{severity}%</strong>
      </label>
      <input
        type="range"
        min="1"
        max="100"
        value={severity}
        onChange={(e) => onSeverityChange(+e.target.value)}
      />

      <label>
        Relative Speed <strong>{speed} km/s</strong>
      </label>
      <input
        type="range"
        min="1"
        max="40"
        value={speed}
        onChange={(e) => onSpeedChange(+e.target.value)}
      />

      <label>
        Approach Angle <strong>{angle}°</strong>
      </label>
      <input
        type="range"
        min="0"
        max="360"
        value={angle}
        onChange={(e) => onAngleChange(+e.target.value)}
      />

      <div className="tip">
        <Target size={16} />{' '}
        {placed ? 'Placement target set' : 'Click the 3D scene to mark a disaster location (demo)'}
      </div>

      <div className="actions">
        <button className="primary" onClick={onInject}>
          <Send size={16} /> INJECT DISASTER
        </button>
        <button onClick={onReset}>
          <RotateCcw size={16} />
        </button>
      </div>
    </aside>
  );
}
