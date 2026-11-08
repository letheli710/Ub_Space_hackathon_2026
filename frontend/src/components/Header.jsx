import { Settings } from 'lucide-react';
import logo from '../assets/interstellar-x4-logo.webp';

const TABS = ['Home', 'Generator', 'Planetary Trajectories', 'AI Logs', 'AI API'];

export default function Header({ tab, onTabChange, status }) {
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

      <div className={`status ${status === 'OFFLINE' || status === 'CONNECTING' ? 'disconnected' : ''}`} role="status" aria-label="Simulator connection">
        <i /> {status} <Settings size={16} />
      </div>
    </header>
  );
}
