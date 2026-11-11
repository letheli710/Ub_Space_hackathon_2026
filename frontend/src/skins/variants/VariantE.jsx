// Variant E: Cryo Lens. The real scene fills the viewport behind a graduated frost; only one circular
// "lens" window is optically sharp, like looking through a clinical ophthalmoscope. Frost, reticle and
// callouts never take pointer events, so clicks inside the lens reach the 3D view (armed launches).
import { useState } from 'react';
import { ShipCanvas } from '../shipCanvas.jsx';
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset,
} from '../demoSkin.jsx';
import {
  AIMABLE, Agents, AiControls, Damage, EventLog, FlightData, Objects, Propulsion, Repairs, RockForm, Transport, ViewOverlays, toggleAim,
} from './variantDShared.jsx';
import './variantE.css';

// Lens geometry per page: centre (vw / vh) and radius (vmin).
const LENS = {
  home: { x: 63, y: 48, r: 31, scale: 0.26 },
  console: { x: 50, y: 45, r: 25 },
  map: { x: 50, y: 53, r: 33 },
  craft: { x: 62, y: 50, r: 30 },
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

/**
 * Stage: specimen (any content) → graduated frost with a sharp lens hole → reticle.
 * `live` lets the specimen take pointer events (3D view, map); everything above it never does.
 */
function Stage({ lens, sim, label, live = false, dark = false, children }) {
  const vars = { '--lx': `${lens.x}vw`, '--ly': `${lens.y}vh`, '--lr': `${lens.r}vmin` };
  return (
    <div className={`ve-stage ${dark ? 'dark' : ''}`} style={vars}>
      <div className="ve-grid" />
      <div className={`ve-ship ${live ? 'live' : ''}`}>{children}</div>
      <div className="ve-frost f1" />
      <div className="ve-frost f2" />
      <div className="ve-frost f3" />
      <div className="ve-bloom" />
      <div className="ve-lens" aria-hidden="true">
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
        <i />{sim.event ? 'HAZARD' : sim.status === 'PAUSED' ? 'PAUSED' : 'NOMINAL'}<span>MET {sim.met}</span>
      </div>
    </header>
  );
}

/** Annotation anchored on the lens rim at angle `a` (deg, 0 = east), with a leader line outward. */
function Callout({ lens, a, side = 'right', hot, k, v, unit }) {
  const rad = (a * Math.PI) / 180;
  const style = {
    left: `calc(${lens.x}vw + ${(Math.cos(rad) * lens.r).toFixed(2)}vmin)`,
    top: `calc(${lens.y}vh + ${(Math.sin(rad) * lens.r).toFixed(2)}vmin)`,
  };
  return (
    <div className={`ve-callout ${side} ${hot ? 'hot' : ''}`} style={style}>
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
      <Stage lens={lens} sim={sim} label="SPECIMEN · ISV-04 MODULAR STATION · MAG 4.0×">
        <div className="ve-shift" style={{ transform: `translate(${lens.x - 50}vw, ${lens.y - 50}vh)` }}>
          <ShipCanvas event={sim.event} lights="clinical" stars={false} scale={lens.scale} swing={0.28} />
        </div>
      </Stage>
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
      <Callout lens={lens} a={38} k="Mission day" v={sim.day} unit={sim.nav.etaDays == null ? '' : `ETA ${Math.round(sim.nav.etaDays)} d`} />
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
        {items.map((d) => {
          const on = sim.isActive(d);
          const aiming = sim.demo.armed === d;
          return (
            <li key={d} className={AIMABLE.includes(d) ? 'aimable' : ''}>
              <button className={on ? 'on' : ''} aria-pressed={on} onClick={() => sim.trigger(d)}>
                {d}<span>{on ? 'active' : 'inject'}</span>
              </button>
              {AIMABLE.includes(d) && (
                <button className={`ve-aim ${aiming ? 'on' : ''}`} aria-pressed={aiming} title="Place with the pointer" onClick={() => toggleAim(sim, d)}>{aiming ? 'aiming' : 'aim'}</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Collapsible section in a side column. */
function Fold({ title, open: initial = false, children }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className={`ve-fold ${open ? 'open' : ''}`}>
      <h3><button onClick={() => setOpen(!open)} aria-expanded={open}>{title}<span>{open ? '−' : '+'}</span></button></h3>
      {open && <div className="ve-fold-body">{children}</div>}
    </div>
  );
}

function Console({ sim }) {
  const lens = LENS.console;
  const ev = sim.event;
  const [resetCount, resetView] = useViewReset();
  return (
    <>
      <Stage lens={lens} sim={sim} live dark label={ev ? `HAZARD · ${ev.name.toUpperCase()}` : `LIVE VIEW · DEMO VOYAGE · ${sim.nav.origin} → ${sim.nav.destination}`.toUpperCase()}>
        <div className="ve-shift" style={{ top: `${2 * (lens.y - 50)}vh` }}>
          <DemoViewport sim={sim} resetCount={resetCount} />
        </div>
      </Stage>
      <div className="ve-overlays"><ViewOverlays sim={sim} /></div>
      <section className="ve-console">
        <aside className="ve-col left">
          <h2>Scenario</h2>
          <p className="ve-muted">Inject a hazard into the DEMO voyage. “aim” arms pointer placement — click inside the lens to launch.</p>
          <HazardList title="Outer hazards" items={OUTER} sim={sim} />
          <HazardList title="Inner faults" items={INNER} sim={sim} />
          <Fold title="Space rock"><RockForm sim={sim} /></Fold>
          <Fold title="Propulsion"><Propulsion sim={sim} /></Fold>
          <Fold title="AI management"><AiControls sim={sim} /></Fold>
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
          <Agents sim={sim} />
          <Fold title="Flight data" open><FlightData sim={sim} /></Fold>
          <Fold title="Component damage"><Damage sim={sim} /></Fold>
          <Fold title="Repairs · objects">
            <Repairs sim={sim} />
            <h4>Nearby rocks &amp; debris</h4>
            <Objects sim={sim} />
          </Fold>
          <Fold title="Event log"><EventLog sim={sim} /></Fold>
        </aside>
      </section>

      <div className="ve-transport"><Transport sim={sim} onResetView={resetView} /></div>

      <div className="ve-lens-foot console" style={{ left: `${lens.x}vw`, top: `calc(${lens.y}vh + ${lens.r}vmin + 30px)` }}>
        {ev ? (
          <div className="ve-alert">
            <b>● {ev.name}</b> severity {ev.severity}% · {sim.demo.ai.busy ? 'Main Judging evaluating' : 'awaiting AI'}
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
        {sim.logs.slice(0, 4).map((l) => (
          <li key={l.id} className={l.alert ? 'alert' : ''}>{l.text}</li>
        ))}
      </ol>
    </>
  );
}

function Trajectories({ sim }) {
  const lens = LENS.map;
  return (
    <>
      <Stage lens={lens} sim={sim} live dark label={`ORRERY · ${sim.nav.phase} · ${sim.demo.celestialDate.slice(0, 10)}`.toUpperCase()}>
        <div className="ve-mapwrap dx-page"><TrajectoriesView sim={sim} /></div>
      </Stage>
      <Callout lens={lens} a={-40} k="Origin" v={sim.nav.origin} unit="" />
      <Callout lens={lens} a={-12} k="Destination" v={sim.nav.destination} unit="" />
      <Callout lens={lens} a={16} hot k="Mission day" v={sim.day} unit={sim.nav.inOrbit ? 'in orbit' : 'en route'} />
      <Callout lens={lens} a={44} k="ETA" v={sim.nav.etaDays == null ? '—' : sim.nav.etaDays.toFixed(1)} unit={sim.nav.etaDays == null ? 'repair propulsion' : 'days'} />
      <aside className="ve-mapinfo">
        <h2>Trajectory</h2>
        <p className="ve-muted">{sim.session.mapInfo}</p>
        <div className="ve-lens-foot inline">
          {sim.nav.origin} <i style={{ '--p': `${sim.nav.progress * 100}%` }} /> {sim.nav.destination}
          <span>{Math.round(sim.nav.progress * 100)}%</span>
        </div>
      </aside>
    </>
  );
}

function Spacecraft({ sim }) {
  const lens = LENS.craft;
  return (
    <Stage lens={lens} sim={sim} live dark label="SPECIMEN · MODULAR STATION · DESIGN PREVIEW">
      <div className="ve-craft dx-page"><SpacecraftView sim={sim} /></div>
    </Stage>
  );
}

function Sheet({ className, children }) {
  return (
    <div className="ve-sheet-wrap">
      <div className="ve-grid" />
      <section className={`ve-sheet dx-page ${className}`}>{children}</section>
    </div>
  );
}

export default function VariantE({ page, tab, onTab, sim }) {
  let body;
  if (page === 'home') body = <Home sim={sim} onTab={onTab} />;
  else if (tab === 'Generator') body = <Console sim={sim} />;
  else if (tab === 'Planetary Trajectories') body = <Trajectories sim={sim} />;
  else if (tab === 'AI Logs') body = <Sheet className="logs"><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Sheet>;
  else if (tab === 'AI API') body = <Sheet className="api"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></Sheet>;
  else body = <Spacecraft sim={sim} />;
  return (
    <div className={`ve dx-root ${sim.event ? 've-alerting' : ''}`}>
      <Nav tab={tab} onTab={onTab} sim={sim} />
      {body}
    </div>
  );
}
