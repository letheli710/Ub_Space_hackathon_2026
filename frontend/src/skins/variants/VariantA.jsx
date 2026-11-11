// Variant A: Cryo Glass. Light frosted glass, cold white light, graphite type, clinical restraint.
// Runs on the real DEMO session (see ../demoSkin.jsx).
import { Crosshair, LocateFixed, Pause, Play, RotateCcw } from 'lucide-react';
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE,
  TrajectoriesView, logo, useViewReset,
} from '../demoSkin.jsx';
import { ShipCanvas } from '../shipCanvas.jsx';
import {
  AiControls, DamageList, PhysicsNotes, Propulsion, RockSettings, TimeScale, ViewOverlays,
  flightRows, hazardState, missionRows, toggleArm,
} from './variantABCKit.jsx';
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
        <i className={sim.event ? 'alert' : ''} /> {sim.status} <span>MET {sim.met}</span>
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
          <div><small>Mission day</small><strong>{sim.day}</strong></div>
        </div>
      </div>
    </section>
  );
}

function Section({ title, open = false, children }) {
  return (
    <details className="va-sec" open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function HazardList({ sim, names }) {
  return (
    <ul className="va-list">
      {names.map((d) => {
        const h = hazardState(sim, d);
        return (
          <li key={d} className={`${h.active ? 'on' : ''} ${h.armed ? 'armed' : ''}`}>
            <button className="va-li-main" onClick={() => sim.trigger(d)} aria-pressed={h.active}>
              {d}<span>{h.active ? 'Active' : 'Inject'}</span>
            </button>
            {h.pointer && (
              <button className="va-aim" title="Aim with pointer" aria-pressed={h.armed} onClick={() => toggleArm(sim, d)}>
                <Crosshair size={13} />
              </button>
            )}
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
    <section className="va-console">
      <aside className="va-glass va-col">
        <h2>Scenario</h2>
        <p className="va-muted">Inject a hazard into the DEMO voyage. Use <Crosshair size={11} /> to aim a rock or alien with the pointer.</p>
        <Section title="Outer hazards" open><HazardList sim={sim} names={OUTER} /></Section>
        <Section title="Inner faults" open><HazardList sim={sim} names={INNER} /></Section>
        <Section title="Space rock"><RockSettings sim={sim} /></Section>
        <Section title="Propulsion"><Propulsion sim={sim} /></Section>
        <Section title="DEMO AI"><AiControls sim={sim} /></Section>
      </aside>

      <main className="va-screen">
        <div className="va-screen-inner">
          <DemoViewport sim={sim} resetCount={resetCount} />
          <ViewOverlays sim={sim} />
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
            <button title={playing ? 'Pause' : 'Resume'} onClick={sim.demo.togglePlaying}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
            <button title="Reset demo" onClick={sim.clear}><RotateCcw size={15} /></button>
            <span className="va-mono">SIM {sim.met}</span>
            <TimeScale sim={sim} />
            <button title="Reset view" onClick={resetView}><LocateFixed size={15} /></button>
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
              <div className="va-bar"><i style={{ width: `${Math.max(0, Math.min(100, s.value))}%` }} /></div>
            </div>
          ))}
        </div>
        <h3>AI agents</h3>
        <ul className="va-agents">
          {sim.agents.map((a) => (
            <li key={a.id} title={a.reason}><i className={a.ok ? '' : 'warn'} />{a.name}<span>{a.state}</span></li>
          ))}
        </ul>
        <h3>Event log</h3>
        <ol className="va-log">
          {sim.logs.slice(0, 12).map((l) => <li key={l.id} className={l.alert ? 'alert' : ''}><time>{l.time}</time>{l.text}</li>)}
        </ol>
        <Section title="Flight data">
          <dl className="va-dl">
            {flightRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Section>
        <Section title="Component damage"><DamageList sim={sim} /></Section>
        <Section title="Repairs · objects · subsystems"><PhysicsNotes sim={sim} /></Section>
      </aside>
    </section>
  );
}

function Trajectories({ sim }) {
  return (
    <section className="va-split">
      <aside className="va-glass va-col">
        <h2>Mission</h2>
        <p className="va-muted">Same voyage as the Generator DEMO. Positions from JPL orbital elements on the DEMO clock.</p>
        <div className="va-progress">
          <span>{sim.nav.origin}</span><span>{sim.nav.destination}</span>
          <div className="va-range"><i style={{ width: `${sim.nav.progress * 100}%` }} /></div>
        </div>
        <dl className="va-dl">
          {missionRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <h3>Inspector</h3>
        <p className="va-muted">{sim.session.mapInfo}</p>
        <h3>Playback</h3>
        <div className="va-mini-dock">
          <button className="va-btn" onClick={sim.demo.togglePlaying}>{sim.demo.playing ? 'Pause' : 'Resume'}</button>
          <TimeScale sim={sim} />
        </div>
      </aside>
      <main className="va-screen">
        <div className="va-screen-inner va-map"><TrajectoriesView sim={sim} /></div>
      </main>
    </section>
  );
}

function Page({ tab, sim, onTab }) {
  if (tab === 'Generator') return <Console sim={sim} />;
  if (tab === 'Planetary Trajectories') return <Trajectories sim={sim} />;
  if (tab === 'AI Logs') return <section className="va-page va-glass va-ailogs"><AiLogsView sim={sim} /></section>;
  if (tab === 'AI API') return <section className="va-page va-apipage"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></section>;
  if (tab === 'Spacecraft') return <section className="va-page va-screen va-craft"><div className="va-screen-inner"><SpacecraftView sim={sim} /></div></section>;
  return null;
}

export default function VariantA({ page, tab, onTab, sim }) {
  return (
    <div className="va">
      <div className="va-bg" aria-hidden="true"><i /><i /><i /></div>
      <Header tab={tab} onTab={onTab} sim={sim} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Page tab={tab} sim={sim} onTab={onTab} />}
    </div>
  );
}
