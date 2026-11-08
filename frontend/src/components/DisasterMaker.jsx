import { AlertTriangle, Bot, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DISASTER_PARAMETERS, INNER_DISASTERS, OUTER_DISASTERS } from '../data/disasters.js';
import ArmControls from './ArmControls.jsx';

const PRESS_FLASH_MS = 450;

const BLACK_HOLE = 'Black Hole Encounter';
const SOLAR_STORM = 'Solar Storm';

// Left column of the Generator tab: disasters (demo view) and robotic arm control (live simulator).
export default function DisasterMaker({
  live,
  simulation,
  onLog,
  armed,
  onArm,
  onTrigger,
  activeFaults = [],
  blackHole,
  solarStorm,
  onSolarStorm,
  onToggleBlackHole,
}) {
  const { severity, speed, angle } = DISASTER_PARAMETERS;
  // Inner buttons flash when pressed, then stay lit until the failure is resolved.
  const [pressed, setPressed] = useState(null);
  const timer = useRef();

  useEffect(() => () => clearTimeout(timer.current), []);

  function fire(name) {
    if (activeFaults.includes(name)) return;
    onTrigger(name);
    clearTimeout(timer.current);
    setPressed((p) => ({ name, count: (p?.count ?? 0) + 1 }));
    timer.current = setTimeout(() => setPressed(null), PRESS_FLASH_MS);
  }

  const active = (name) =>
    name === BLACK_HOLE ? blackHole : name === SOLAR_STORM ? solarStorm : armed === name;

  return (
    <aside className="panel left">
      <div className="panelhead">
        <AlertTriangle size={18} /> DISASTER MAKER
      </div>
      <p className="muted">
        {live
          ? 'The live simulator has no disaster support yet. Switch the 3D view to Demo to launch hazards.'
          : 'Launch hazards at your autonomous spacecraft or trigger failures inside it.'}
      </p>

      <h4>OUTER DISASTERS</h4>
      <div className="choices">
        {OUTER_DISASTERS.map((name) => (
          <button
            key={name}
            className={active(name) ? 'selected' : ''}
            aria-pressed={active(name)}
            disabled={live}
            onClick={() => {
              if (name === BLACK_HOLE) onToggleBlackHole();
              else if (name === SOLAR_STORM) onSolarStorm();
              else onArm(armed === name ? null : name);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <h4>INNER DISASTERS</h4>
      <div className="choices">
        {INNER_DISASTERS.map((name) => {
          const isPressed = pressed?.name === name;
          const unresolved = activeFaults.includes(name);
          return (
            <button
              key={isPressed ? `${name}-${pressed.count}` : name}
              className={['momentary', isPressed && 'fired', unresolved && 'unresolved'].filter(Boolean).join(' ')}
              aria-pressed={unresolved}
              title={unresolved ? 'Active failure · waiting for the AI to resolve it' : undefined}
              disabled={live}
              onClick={() => fire(name)}
            >
              {name}
            </button>
          );
        })}
      </div>

      <h4>DISASTER PARAMETERS</h4>
      <dl className="params">
        <div>
          <dt>Severity</dt>
          <dd>{severity}%</dd>
        </div>
        <div>
          <dt>Relative Speed</dt>
          <dd>{speed} km/s</dd>
        </div>
        <div>
          <dt>Approach Angle</dt>
          <dd>{angle}°</dd>
        </div>
      </dl>

      {!live && (
        <div className="tip">
          <Target size={16} />{' '}
          {armed
            ? `Click anywhere in the 3D view to launch ${armed}. Click the button again or press Esc to cancel.`
            : 'Outer: pick one, then click the 3D view to launch it. Black Hole and Solar Storm start on their own. Inner: click to trigger; it stays lit until it is resolved.'}
        </div>
      )}

      <div className="panelhead arm-head">
        <Bot size={18} /> ROBOTIC ARM CONTROL
      </div>
      <ArmControls simulation={simulation} onLog={onLog} />
    </aside>
  );
}
