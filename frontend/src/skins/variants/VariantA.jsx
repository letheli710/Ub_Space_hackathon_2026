// PROTOTYPE — Variant A: Cryo Glass. Light frosted glass, cold white light, graphite type, clinical restraint.
import { Pause, RotateCcw, Maximize2, Minus, Plus } from 'lucide-react';
import { FEATURES, INNER, LEAD, OUTER, ShipCanvas, TABS, TAGLINE, logo } from '../shipCanvas.jsx';
import './variantA.css';

function Header({ tab, onTab, sim }) {
  return (
    <header className="va-header va-glass">
      <img src={logo} alt="Interstellar X⁴" className="va-logo-sm" />
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>{t}</button>
        ))}
      </nav>
      <div className="va-status">
        <i className={sim.event ? 'alert' : ''} /> DEMO <span>MET {sim.met}</span>
      </div>
    </header>
  );
}

function Home({ sim, onTab }) {
  return (
    <section className="va-home">
      <div className="va-copy">
        <p className="va-eyebrow">Spacecraft emergency simulation · Hackathon build</p>
        <img src={logo} alt="Interstellar X⁴" className="va-logo-lg" />
        <h1>{TAGLINE}</h1>
        <p className="va-lead">{LEAD}</p>
        <div className="va-actions">
          <button className="va-btn primary" onClick={() => onTab('Generator')}>Launch Simulator</button>
          <button className="va-btn" onClick={() => onTab('Planetary Trajectories')}>Explore Features</button>
        </div>
        <ol className="va-features">
          {FEATURES.map((f, i) => (
            <li key={f}><span>0{i + 1}</span>{f}</li>
          ))}
        </ol>
      </div>

      <div className="va-chamber va-glass">
        <div className="va-chamber-light" />
        <ShipCanvas event={sim.event} lights="clinical" stars={false} scale={0.145} />
        <span className="va-tag tl">SPECIMEN · ISV-04 MODULAR STATION</span>
        <span className="va-tag tr">{sim.event ? <b className="va-red">● HAZARD</b> : '● NOMINAL'}</span>
        <i className="va-cross c1" /><i className="va-cross c2" /><i className="va-cross c3" /><i className="va-cross c4" />
        <div className="va-vitals va-glass">
          <div><small>Velocity</small><strong>{sim.velocity}<em>km/s</em></strong></div>
          <div><small>Structure</small><strong>{sim.systems[0].value}<em>%</em></strong></div>
          <div><small>Propellant</small><strong>{sim.systems[2].value}<em>%</em></strong></div>
          <div><small>Mission day</small><strong>{sim.day}<em>/ 210</em></strong></div>
        </div>
      </div>
    </section>
  );
}

function Console({ sim }) {
  return (
    <section className="va-console">
      <aside className="va-glass va-col">
        <h2>Scenario</h2>
        <p className="va-muted">Inject a hazard into the DEMO voyage. Impacts can detach modules and change the ship’s motion.</p>
        <h3>Outer hazards</h3>
        <ul className="va-list">
          {OUTER.map((d) => (
            <li key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}>
              {d}<span>Inject</span>
            </li>
          ))}
        </ul>
        <h3>Inner faults</h3>
        <ul className="va-list">
          {INNER.map((d) => (
            <li key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}>
              {d}<span>Inject</span>
            </li>
          ))}
        </ul>
        <h3>Parameters</h3>
        <div className="va-param"><span>Severity</span><b>65%</b></div>
        <div className="va-range"><i style={{ width: '65%' }} /></div>
        <div className="va-param"><span>Relative speed</span><b>40 m/s</b></div>
        <div className="va-range"><i style={{ width: '40%' }} /></div>
      </aside>

      <main className="va-screen">
        <div className="va-screen-inner">
          <ShipCanvas event={sim.event} lights="cool" scale={0.11} />
          <div className="va-route va-glass-dark">
            <span>{sim.nav.origin}</span>
            <div className="va-route-line"><i style={{ width: `${sim.nav.progress * 100}%` }} /></div>
            <span>{sim.nav.destination}</span>
            <small>DAY {sim.day} · {sim.nav.phase}</small>
          </div>
          {sim.event && (
            <div className="va-alert va-glass-dark">
              <b>{sim.event.name}</b> severity {sim.event.severity}% · AI evaluating
              <button onClick={sim.clear}>Reset</button>
            </div>
          )}
          <div className="va-dock va-glass-dark">
            <button><Pause size={15} /></button>
            <button onClick={sim.clear}><RotateCcw size={15} /></button>
            <span className="va-mono">SIM {sim.met}</span>
            <div className="va-scale"><button><Minus size={13} /></button><span>{sim.timeScale}</span><button><Plus size={13} /></button></div>
            <button><Maximize2 size={15} /></button>
          </div>
        </div>
      </main>

      <aside className="va-glass va-col">
        <h2>Vitals</h2>
        <div className="va-grid">
          {sim.systems.map((s) => (
            <div key={s.key} className={s.value < 85 ? 'low' : ''}>
              <small>{s.label}</small>
              <strong>{s.value}<em>%</em></strong>
              <div className="va-bar"><i style={{ width: `${s.value}%` }} /></div>
            </div>
          ))}
        </div>
        <h3>Flight</h3>
        <dl className="va-dl">
          <div><dt>Velocity</dt><dd>{sim.velocity} km/s</dd></div>
          <div><dt>Attitude</dt><dd>{sim.attitude}</dd></div>
          <div><dt>Angular speed</dt><dd>{sim.angular} rad/s</dd></div>
          <div><dt>Propellant</dt><dd>{sim.propellantKg} kg</dd></div>
        </dl>
        <h3>AI agents</h3>
        <ul className="va-agents">
          {sim.agents.map((a) => (
            <li key={a.name}><i className={a.ok ? '' : 'warn'} />{a.name}<span>{a.state}</span></li>
          ))}
        </ul>
        <h3>Event log</h3>
        <ol className="va-log">
          {sim.logs.slice(0, 5).map((l, i) => <li key={i} className={l.alert ? 'alert' : ''}>{l.text}</li>)}
        </ol>
      </aside>
    </section>
  );
}

export default function VariantA({ page, tab, onTab, sim }) {
  return (
    <div className="va">
      <div className="va-bg" aria-hidden="true"><i /><i /><i /></div>
      <Header tab={tab} onTab={onTab} sim={sim} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} />}
    </div>
  );
}
