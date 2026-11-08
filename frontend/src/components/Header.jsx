import { Settings } from 'lucide-react';
import logo from '../assets/interstellar-x4-logo.webp';

const TABS = ['Home', 'Generator', 'Planetary Trajectories', 'AI Logs'];

export default function Header({ tab, onTabChange, event }) {
  return (
    <header>
      <div className="brand">
        <img src={logo} alt="Interstellar X⁴" />
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
