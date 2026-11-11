// PROTOTYPE — Variant E: Cryo Lens. The ship is huge and fills the viewport behind a graduated frost;
// only one circular "lens" window is optically sharp, like looking through a clinical ophthalmoscope.
import { FEATURES, INNER, LEAD, OUTER, ShipCanvas, TABS, TAGLINE, logo } from './mock.jsx';
import './variantE.css';

// Lens geometry per page: centre (vw / vh) and radius (vmin).
const LENS = {
  home: { x: 63, y: 48, r: 31, scale: 0.26 },
  console: { x: 50, y: 45, r: 25, scale: 0.22 },
};

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);

function Reticle({ alert, label }) {
  return (
    <svg className={`ve-reticle ${alert ? 'alert' : ''}`} viewBox="-110 -110 220 220" aria-hidden="true">
      <circle r="100" className="ve-ring" />
      <circle r="103.5" className="ve-ring faint" />
      <g className="ve-ticks">
        {TICKS.map((d) => (
          <line key={d} x1="0" y1={-100} x2="0" y2={d % 30 === 0 ? -94 : -97.5} transform={`rotate(${d})`} />
        ))}
      </g>
      <g className="ve-cross">
        <line x1="-6" y1="0" x2="6" y2="0" />
        <line x1="0" y1="-6" x2="0" y2="6" />
      </g>
      {[0, 90, 180, 270].map((d) => (
        <text key={d} className="ve-deg" transform={`rotate(${d}) translate(0 -106)`} textAnchor="middle">
          {String(d).padStart(3, '0')}
        </text>
      ))}
      <path id="ve-arc" d="M -88 0 A 88 88 0 0 1 88 0" fill="none" />
      <text className="ve-arc-label"><textPath href="#ve-arc" startOffset="50%" textAnchor="middle">{label}</textPath></text>
    </svg>
  );
}

/** Background stage: ship, pale grid, graduated frost with a sharp lens hole, reticle. */
function Stage({ lens, sim, label }) {
  const vars = { '--lx': `${lens.x}vw`, '--ly': `${lens.y}vh`, '--lr': `${lens.r}vmin` };
  return (
    <div className="ve-stage" style={vars} aria-hidden="true">
      <div className="ve-grid" />
      <div className="ve-ship" style={{ transform: `translate(${lens.x - 50}vw, ${lens.y - 50}vh)` }}>
        <ShipCanvas event={sim.event} lights="clinical" stars={false} scale={lens.scale} swing={0.28} />
      </div>
      <div className="ve-frost f1" />
      <div className="ve-frost f2" />
      <div className="ve-frost f3" />
      <div className="ve-bloom" />
      <div className="ve-lens">
        <Reticle alert={!!sim.event} label={label} />
      </div>
    </div>
  );
}

function Nav({ tab, onTab, sim }) {
  return (
    <header className="ve-nav">
      <div className="ve-brand">
        <img src={logo} alt="" />
        <span>Interstellar X<sup>4</sup></span>
      </div>
      <nav>
        {TABS.map((t, i) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>
            <small>{String(i).padStart(2, '0')}</small>{t}
          </button>
        ))}
      </nav>
      <div className={`ve-state ${sim.event ? 'alert' : ''}`}>
        <i />{sim.event ? 'HAZARD' : 'NOMINAL'}<span>MET {sim.met}</span>
      </div>
    </header>
  );
}

/** Annotation anchored on the lens rim at angle `a` (deg, 0 = east), with a leader line outward. */
function Callout({ lens, a, side = "right", hot, k, v, unit }) {
  const rad = (a * Math.PI) / 180;
  const style = {
    left: `calc(${lens.x}vw + ${(Math.cos(rad) * lens.r).toFixed(2)}vmin)`,
    top: `calc(${lens.y}vh + ${(Math.sin(rad) * lens.r).toFixed(2)}vmin)`,
  };
  return (
    <div className={`ve-callout ${side} ${hot ? "hot" : ""}`} style={style}>
      <i className="ve-dot" />
      <i className="ve-leader" />
      <div className="ve-callout-body">
        <small>{k}</small>
        <strong>{v}<em>{unit}</em></strong>
      </div>
    </div>
  );
}

function Home({ sim, onTab }) {
  const lens = LENS.home;
  return (
    <>
      <Stage lens={lens} sim={sim} label="SPECIMEN · ISV-04 MODULAR STATION · MAG 4.0×" />
      <section className="ve-home">
        <div className="ve-copy">
          <p className="ve-eyebrow">Ref. IX4 / Spacecraft emergency simulation</p>
          <img src={logo} alt="Interstellar X⁴" className="ve-logo" />
          <h1>{TAGLINE}</h1>
          <p className="ve-lead">{LEAD}</p>
          <div className="ve-actions">
            <button className="ve-btn primary" onClick={() => onTab('Generator')}>Launch simulator <span>→</span></button>
            <button className="ve-btn" onClick={() => onTab('Planetary Trajectories')}>View trajectories</button>
          </div>
          <ol className="ve-features">
            {FEATURES.map((f, i) => (
              <li key={f}><span>0{i + 1}</span>{f}</li>
            ))}
          </ol>
        </div>
      </section>
      <Callout lens={lens} a={-38} k="Velocity" v={sim.velocity} unit="km/s" />
      <Callout lens={lens} a={0} hot k="Structure" v={sim.systems[0].value} unit="%" />
      <Callout lens={lens} a={38} k="Mission day" v={sim.day} unit="/ 210" />
      <div className="ve-lens-foot" style={{ left: `${lens.x}vw`, top: `calc(${lens.y}vh + ${lens.r}vmin + 34px)` }}>
        {sim.nav.origin} <i style={{ '--p': `${sim.nav.progress * 100}%` }} /> {sim.nav.destination}
        <span>{sim.nav.phase} · {Math.round(sim.nav.progress * 100)}%</span>
      </div>
    </>
  );
}

function HazardList({ title, items, sim }) {
  return (
    <div className="ve-block">
      <h3>{title}<span>{items.length}</span></h3>
      <ul className="ve-hazards">
        {items.map((d) => (
          <li key={d}>
            <button className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}>
              {d}<span>{sim.event?.name === d ? 'active' : 'inject'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Console({ sim }) {
  const lens = LENS.console;
  const ev = sim.event;
  return (
    <>
      <Stage lens={lens} sim={sim} label={ev ? `HAZARD · ${ev.name.toUpperCase()}` : 'LIVE VIEW · DEMO VOYAGE · EARTH → MARS'} />
      <section className="ve-console">
        <aside className="ve-col left">
          <h2>Scenario</h2>
          <p className="ve-muted">Inject a hazard into the DEMO voyage. The AI crew evaluates and responds in real time.</p>
          <HazardList title="Outer hazards" items={OUTER} sim={sim} />
          <HazardList title="Inner faults" items={INNER} sim={sim} />
          <button className="ve-btn reset" onClick={sim.clear} disabled={!ev}>Reset to nominal</button>
        </aside>

        <aside className="ve-col right">
          <h2>Vitals</h2>
          <ul className="ve-systems">
            {sim.systems.map((s) => (
              <li key={s.key} className={s.value < 85 ? 'low' : ''}>
                <span>{s.label}</span>
                <b>{s.value}<em>%</em></b>
                <i><u style={{ width: `${s.value}%` }} /></i>
              </li>
            ))}
          </ul>
          <h3>AI agents</h3>
          <ul className="ve-agents">
            {sim.agents.map((a) => (
              <li key={a.name} className={a.ok ? '' : 'warn'}><i />{a.name}<span>{a.state}</span></li>
            ))}
          </ul>
          <dl className="ve-flight">
            <div><dt>Velocity</dt><dd>{sim.velocity} km/s</dd></div>
            <div><dt>Attitude</dt><dd>{sim.attitude}</dd></div>
            <div><dt>Propellant</dt><dd>{sim.propellantKg} kg</dd></div>
            <div><dt>Time scale</dt><dd>{sim.timeScale}</dd></div>
          </dl>
        </aside>
      </section>

      <div className="ve-lens-foot console" style={{ left: `${lens.x}vw`, top: `calc(${lens.y}vh + ${lens.r}vmin + 30px)` }}>
        {ev ? (
          <div className="ve-alert">
            <b>● {ev.name}</b> severity {ev.severity}% · Main Judging evaluating
            <button onClick={sim.clear}>Reset</button>
          </div>
        ) : (
          <>
            {sim.nav.origin} <i style={{ '--p': `${sim.nav.progress * 100}%` }} /> {sim.nav.destination}
            <span>DAY {sim.day} · {sim.nav.phase}</span>
          </>
        )}
      </div>

      <ol className="ve-log">
        {sim.logs.slice(0, 4).map((l, i) => (
          <li key={l.t + l.text + i} className={l.alert ? 'alert' : ''}>{l.text}</li>
        ))}
      </ol>
    </>
  );
}

export default function VariantE({ page, tab, onTab, sim }) {
  return (
    <div className={`ve ${sim.event ? 've-alerting' : ''}`}>
      <Nav tab={tab} onTab={onTab} sim={sim} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} />}
    </div>
  );
}
