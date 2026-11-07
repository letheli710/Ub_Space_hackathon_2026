import { Orbit, Settings } from 'lucide-react';

const TABS = ['Introduction', 'Generator', 'Planetary Trajectories', 'AI Logs'];

export default function Header({ tab, onTabChange, event }) {
  return (
    <header>
      <div className="brand">
        <div className="brandicon">
          <Orbit size={26} />
        </div>
        <div>
          <b>
            ASTRA<span>CTRL</span>
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

      <div className="status">
        <i /> {event ? 'EVENT ACTIVE' : 'SYSTEM ONLINE'} <Settings size={16} />
      </div>
    </header>
  );
}
