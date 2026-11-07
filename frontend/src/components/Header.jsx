import { Orbit, Settings } from 'lucide-react';

const TABS = ['Introduction', 'Generator', 'Planetary Trajectories', 'AI Logs'];

export default function Header({ tab, onTabChange, status }) {
  return (
    <header>
      <div className="brand">
        <div className="brandicon">
          <Orbit size={26} />
        </div>
        <div>
          <b>
            INTERSTELLAR <span>X⁴</span>
          </b>
          <small>SPACE DISASTER SIMULATION LAB</small>
        </div>
      </div>

      <nav>
        {TABS.map((name) => (
          <button
            key={name}
            className={tab === name ? 'active' : ''}
            onClick={() => onTabChange(name)}
          >
            {name}
          </button>
        ))}
      </nav>

      <div className={`status ${status === 'OFFLINE' || status === 'CONNECTING' ? 'disconnected' : ''}`} role="status" aria-label="Simulator connection">
        <i /> {status} <Settings size={16} />
      </div>
    </header>
  );
}
