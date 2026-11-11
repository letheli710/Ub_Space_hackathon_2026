// PROTOTYPE — Variant C: Editorial. Black & bone-white, serif display type, hairline rules instead of boxes,
// a single violet signal pulled from the logo. Reads like a mission dossier, not a dashboard.
import { FEATURES, INNER, LEAD, OUTER, ShipCanvas, TABS, logo } from '../shipCanvas.jsx';
import './variantC.css';

function Masthead({ tab, onTab, sim }) {
  return (
    <header className="vc-mast">
      <img src={logo} alt="Interstellar X⁴" />
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>{t}</button>
        ))}
      </nav>
      <span className="vc-issue">{sim.event ? <b>● Hazard active</b> : 'Demo · nominal'} — MET {sim.met}</span>
    </header>
  );
}

function Home({ sim, onTab }) {
  return (
    <>
      <section className="vc-cover">
        <div className="vc-ship"><ShipCanvas event={sim.event} lights="mono" scale={0.24} stars={false} /></div>
        <p className="vc-kicker">Interstellar X⁴ — a hackathon prototype</p>
        <h1>AI-Powered Spacecraft <i>Disaster</i> Simulator</h1>
      </section>
      <section className="vc-cols">
        <div>
          <h4>The platform</h4>
          <p className="vc-lead">{LEAD}</p>
          <div className="vc-actions">
            <button className="vc-cta" onClick={() => onTab('Generator')}>Launch Simulator →</button>
            <button className="vc-link" onClick={() => onTab('Planetary Trajectories')}>Explore features</button>
          </div>
        </div>
        <div>
          <h4>Capabilities</h4>
          <ol className="vc-num">
            {FEATURES.map((f) => <li key={f}>{f}</li>)}
          </ol>
        </div>
        <div>
          <h4>Right now</h4>
          <dl className="vc-figs">
            <div><dt>Velocity, km/s</dt><dd>{sim.velocity}</dd></div>
            <div><dt>Structure, %</dt><dd>{sim.systems[0].value}</dd></div>
            <div><dt>Mission day</dt><dd>{sim.day}</dd></div>
          </dl>
        </div>
      </section>
    </>
  );
}

function Console({ sim }) {
  return (
    <>
      <section className="vc-view">
        <ShipCanvas event={sim.event} lights="mono" scale={0.12} />
        <div className="vc-caption">
          <span>Fig. 1 — Spacecraft, live DEMO physics. {sim.nav.origin} to {sim.nav.destination}, day {sim.day}.</span>
          <span>Sim {sim.met} · ×{sim.timeScale} · <button>Pause</button> <button onClick={sim.clear}>Reset</button> <button>Full page</button></span>
        </div>
        {sim.event && <p className="vc-flash"><b>{sim.event.name}.</b> Severity {sim.event.severity}%. The AI is evaluating a response.</p>}
      </section>
      <section className="vc-cols console">
        <div>
          <h4>I. Scenario</h4>
          <p className="vc-small">Outer</p>
          <ul className="vc-hazards">
            {OUTER.map((d) => <li key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}>{d}</li>)}
          </ul>
          <p className="vc-small">Inner</p>
          <ul className="vc-hazards">
            {INNER.map((d) => <li key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}>{d}</li>)}
          </ul>
        </div>
        <div>
          <h4>II. Telemetry</h4>
          <dl className="vc-leaders">
            {sim.systems.map((s) => (
              <div key={s.key} className={s.value < 85 ? 'low' : ''}><dt>{s.label}</dt><i /><dd>{s.value}%</dd></div>
            ))}
            <div><dt>Velocity</dt><i /><dd>{sim.velocity} km/s</dd></div>
            <div><dt>Attitude</dt><i /><dd>{sim.attitude.toLowerCase()}</dd></div>
            <div><dt>Propellant</dt><i /><dd>{sim.propellantKg} kg</dd></div>
          </dl>
          <h4 className="vc-gap">AI agents</h4>
          <dl className="vc-leaders">
            {sim.agents.map((a) => <div key={a.name}><dt>{a.name}</dt><i /><dd>{a.state}</dd></div>)}
          </dl>
        </div>
        <div>
          <h4>III. Log</h4>
          <ol className="vc-log">
            {sim.logs.slice(0, 8).map((l, i) => (
              <li key={i} className={l.alert ? 'alert' : ''}><time>{sim.met}</time>{l.text}</li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

export default function VariantC({ page, tab, onTab, sim }) {
  return (
    <div className="vc">
      <Masthead tab={tab} onTab={onTab} sim={sim} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} />}
    </div>
  );
}
