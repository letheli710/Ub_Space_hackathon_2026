// Variant C: Editorial. Black & bone-white, serif display type, hairline rules instead of boxes,
// a single violet signal pulled from the logo. Reads like a mission dossier, not a dashboard.
// Runs on the real DEMO session (see ../demoSkin.jsx).
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS,
  TrajectoriesView, logo, useViewReset,
} from '../demoSkin.jsx';
import { ShipCanvas } from '../shipCanvas.jsx';
import {
  AiControls, DamageList, PhysicsNotes, Propulsion, RockSettings, TimeScale, ViewOverlays,
  flightRows, hazardState, missionRows, toggleArm,
} from './variantABCKit.jsx';
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
      <span className="vc-issue">{sim.event ? <b>● Hazard active</b> : `${sim.status === 'PAUSED' ? 'Paused' : 'Demo'} · nominal`} — MET {sim.met}</span>
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

function Hazards({ sim, names }) {
  return (
    <ul className="vc-hazards">
      {names.map((d) => {
        const h = hazardState(sim, d);
        return (
          <li key={d} className={`${h.active ? 'on' : ''} ${h.armed ? 'armed' : ''}`}>
            <button onClick={() => sim.trigger(d)} aria-pressed={h.active}>{d}</button>
            {h.pointer && <button className="vc-aim" aria-pressed={h.armed} onClick={() => toggleArm(sim, d)}>{h.armed ? 'aiming…' : 'aim'}</button>}
          </li>
        );
      })}
    </ul>
  );
}

function Console({ sim }) {
  const [resetCount, resetView] = useViewReset();
  const playing = sim.demo.playing;
  return (
    <div className="vc-console">
      <section className="vc-view">
        <div className="vc-stage">
          <DemoViewport sim={sim} resetCount={resetCount} />
          <ViewOverlays sim={sim} />
          {sim.event && <p className="vc-flash"><b>{sim.event.name}.</b> Severity {sim.event.severity}%. The AI is evaluating a response.</p>}
        </div>
        <div className="vc-caption">
          <span>Fig. 1 — Spacecraft, live DEMO physics. {sim.nav.origin} to {sim.nav.destination}, day {sim.day}, {sim.nav.phase.toLowerCase()}.</span>
          <span className="vc-transport">
            Sim {sim.met}
            <button onClick={sim.demo.togglePlaying}>{playing ? 'Pause' : 'Resume'}</button>
            <button onClick={sim.clear}>Reset</button>
            <button onClick={resetView}>Reset view</button>
            <TimeScale sim={sim} />
          </span>
        </div>
      </section>
      <section className="vc-cols console">
        <div>
          <h4>I. Scenario</h4>
          <p className="vc-small">Outer</p>
          <Hazards sim={sim} names={OUTER} />
          <p className="vc-small">Inner</p>
          <Hazards sim={sim} names={INNER} />
          <h4 className="vc-gap">The rock</h4>
          <RockSettings sim={sim} compact />
        </div>
        <div>
          <h4>II. Controls</h4>
          <p className="vc-small">Propulsion</p>
          <Propulsion sim={sim} compact />
          <p className="vc-small vc-gap-s">DEMO AI</p>
          <AiControls sim={sim} compact />
        </div>
        <div>
          <h4>III. Telemetry</h4>
          <dl className="vc-leaders">
            {sim.systems.map((s) => (
              <div key={s.key} className={s.value < 85 ? 'low' : ''}><dt>{s.label}</dt><i /><dd>{s.value}%</dd></div>
            ))}
            {flightRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><i /><dd>{v}</dd></div>)}
          </dl>
          <h4 className="vc-gap">AI agents</h4>
          <dl className="vc-leaders">
            {sim.agents.map((a) => <div key={a.id} className={a.ok ? '' : 'low'} title={a.reason}><dt>{a.name}</dt><i /><dd>{a.state}</dd></div>)}
          </dl>
          <h4 className="vc-gap">Components</h4>
          <DamageList sim={sim} />
          <PhysicsNotes sim={sim} />
        </div>
        <div>
          <h4>IV. Log</h4>
          <ol className="vc-log">
            {sim.logs.map((l) => (
              <li key={l.id} className={l.alert ? 'alert' : ''}><time>{l.time}</time>{l.text}</li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function Trajectories({ sim }) {
  return (
    <div className="vc-split">
      <section className="vc-mapwrap">
        <div className="vc-stage vc-map"><TrajectoriesView sim={sim} /></div>
        <div className="vc-caption">
          <span>Fig. 2 — The voyage, top-down. Cyan dashes: planned route; solid: the path flown.</span>
          <span className="vc-transport">
            <button onClick={sim.demo.togglePlaying}>{sim.demo.playing ? 'Pause' : 'Resume'}</button>
            <TimeScale sim={sim} />
          </span>
        </div>
      </section>
      <aside className="vc-side">
        <h4>The mission</h4>
        <p className="vc-route">{sim.nav.origin} <i>to</i> {sim.nav.destination}</p>
        <div className="vc-prog"><i style={{ width: `${sim.nav.progress * 100}%` }} /></div>
        <dl className="vc-leaders">
          {missionRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><i /><dd>{v}</dd></div>)}
        </dl>
        <h4 className="vc-gap">Inspector</h4>
        <p className="vc-note">{sim.session.mapInfo}</p>
      </aside>
    </div>
  );
}

function Page({ tab, sim, onTab }) {
  if (tab === 'Generator') return <Console sim={sim} />;
  if (tab === 'Planetary Trajectories') return <Trajectories sim={sim} />;
  if (tab === 'AI Logs') return <div className="vc-page vc-ailogs"><AiLogsView sim={sim} /></div>;
  if (tab === 'AI API') return <div className="vc-page vc-apipage"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></div>;
  if (tab === 'Spacecraft') return <div className="vc-page vc-craft"><SpacecraftView sim={sim} /></div>;
  return null;
}

export default function VariantC({ page, tab, onTab, sim }) {
  return (
    <div className={`vc ${page === 'home' ? 'vc-home' : 'vc-app'}`}>
      <Masthead tab={tab} onTab={onTab} sim={sim} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Page tab={tab} sim={sim} onTab={onTab} />}
    </div>
  );
}
