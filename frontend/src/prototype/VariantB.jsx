// PROTOTYPE — Variant B: Flight Deck. Neutral near-black, warm white type, a single amber signal,
// mono instrument readouts, square corners, left icon rail, dense instrument-tile layout.
import { Bot, House, KeyRound, Orbit, Pause, RotateCcw, Rocket, ScrollText, Zap } from 'lucide-react';
import { FEATURES, INNER, LEAD, OUTER, ShipCanvas, TABS, TAGLINE, logo } from './mock.jsx';
import './variantB.css';

const ICONS = [House, Rocket, Zap, Orbit, ScrollText, KeyRound];
const SHORT = ['HOME', 'CRAFT', 'GEN', 'TRAJ', 'LOGS', 'API'];

function Rail({ tab, onTab }) {
  return (
    <nav className="vb-rail">
      <img src={logo} alt="Interstellar X⁴" />
      {TABS.map((t, i) => {
        const Icon = ICONS[i];
        return (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)} title={t}>
            <Icon size={18} strokeWidth={1.6} />
            <span>{SHORT[i]}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Strip({ sim, title }) {
  return (
    <div className="vb-strip">
      <b>{title}</b>
      <span>MET <em>{sim.met}</em></span>
      <span>LEG <em>{sim.nav.origin.toUpperCase()} → {sim.nav.destination.toUpperCase()}</em></span>
      <span>DAY <em>{String(sim.day).padStart(3, '0')}</em></span>
      <span>SCALE <em>{sim.timeScale.toUpperCase()}</em></span>
      <span className={`vb-mode ${sim.event ? 'alert' : ''}`}>{sim.event ? '▲ MASTER CAUTION' : '● DEMO / NOMINAL'}</span>
    </div>
  );
}

function Home({ sim, onTab }) {
  return (
    <div className="vb-home">
      <Strip sim={sim} title="MISSION BRIEF" />
      <section className="vb-hero">
        <div className="vb-brief">
          <img className="vb-logo" src={logo} alt="Interstellar X⁴" />
          <h1>{TAGLINE}</h1>
          <p>{LEAD}</p>
          <div className="vb-actions">
            <button className="vb-btn primary" onClick={() => onTab('Generator')}>▶ Launch simulator</button>
            <button className="vb-btn" onClick={() => onTab('Planetary Trajectories')}>Explore features</button>
          </div>
        </div>
        <div className="vb-stage">
          <ShipCanvas event={sim.event} lights="warm" scale={0.19} />
          <span className="vb-label tl">FIG. 01 — ISV-04 MODULAR STATION</span>
          <span className="vb-label br">38.0 M · 8 MODULES · 10 ARMS</span>
        </div>
      </section>
      <section className="vb-spec">
        {FEATURES.map((f, i) => (
          <div key={f}><small>CAP-0{i + 1}</small>{f}</div>
        ))}
        <div><small>VELOCITY</small><strong>{sim.velocity}</strong><em>KM/S</em></div>
        <div><small>STRUCTURE</small><strong>{sim.systems[0].value}</strong><em>%</em></div>
      </section>
    </div>
  );
}

function Console({ sim }) {
  return (
    <div className="vb-console">
      <Strip sim={sim} title="GENERATOR" />
      <div className="vb-main">
        <div className="vb-view">
          <ShipCanvas event={sim.event} lights="warm" scale={0.11} />
          <div className="vb-reticle" />
          <span className="vb-label tl">3D VIEW · DEMO · BROWSER PHYSICS</span>
          <span className="vb-label tr">WASD / ARROWS · DRAG TO LOOK</span>
          {sim.event && (
            <div className="vb-caution">
              <b>MASTER CAUTION</b>
              <span>{sim.event.name.toUpperCase()} · SEV {sim.event.severity}%</span>
              <button onClick={sim.clear}>ACK / RESET</button>
            </div>
          )}
          <div className="vb-transport">
            <button><Pause size={14} /></button>
            <button onClick={sim.clear}><RotateCcw size={14} /></button>
            <span>T+ {sim.met}</span>
            <button>−</button><span>{sim.timeScale.toUpperCase()}</span><button>+</button>
          </div>
        </div>

        <div className="vb-instruments">
          {sim.systems.map((s) => (
            <div key={s.key} className={`vb-tile ${s.value < 85 ? 'warn' : ''}`}>
              <small>{s.label.toUpperCase()}</small>
              <strong>{s.value}<em>%</em></strong>
              <div className="vb-ticks">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < s.value / 5 ? 'on' : ''} />)}</div>
            </div>
          ))}
          <div className="vb-tile wide">
            <small>FLIGHT</small>
            <dl>
              <div><dt>VEL</dt><dd>{sim.velocity} km/s</dd></div>
              <div><dt>ATT</dt><dd>{sim.attitude}</dd></div>
              <div><dt>ω</dt><dd>{sim.angular} rad/s</dd></div>
              <div><dt>PROP</dt><dd>{sim.propellantKg} kg</dd></div>
              <div><dt>MASS</dt><dd>{sim.massKg} kg</dd></div>
            </dl>
          </div>
          <div className="vb-tile wide">
            <small>AI AGENTS</small>
            {sim.agents.map((a) => (
              <div key={a.name} className="vb-agent"><Bot size={13} /><span>{a.name}</span><em className={a.ok ? '' : 'warn'}>{a.state.toUpperCase()}</em></div>
            ))}
          </div>
        </div>
      </div>

      <div className="vb-bottom">
        <div className="vb-keys">
          <small>OUTER</small>
          {OUTER.map((d, i) => (
            <button key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}><kbd>F{i + 1}</kbd>{d}</button>
          ))}
          <small>INNER</small>
          {INNER.map((d, i) => (
            <button key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}><kbd>F{i + 5}</kbd>{d}</button>
          ))}
        </div>
        <ol className="vb-log">
          {sim.logs.slice(0, 4).map((l, i) => (
            <li key={i} className={l.alert ? 'alert' : ''}><time>{sim.met}</time>{l.text}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function VariantB({ page, tab, onTab, sim }) {
  return (
    <div className="vb">
      <Rail tab={tab} onTab={onTab} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} />}
    </div>
  );
}
