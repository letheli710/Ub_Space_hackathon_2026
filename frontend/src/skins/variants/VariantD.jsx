// Variant D: Immersive HUD. The 3D scene is the whole page; UI is frameless text floating on
// vignettes, with corner brackets and thin cyan→violet hairlines taken from the logo. Controls live in
// collapsible edge drawers so the real DEMO flight scene stays dominant.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ShipCanvas } from '../shipCanvas.jsx';
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset,
} from '../demoSkin.jsx';
import {
  AIMABLE, Agents, AiControls, Damage, EventLog, FlightData, Objects, Propulsion, Repairs, RockForm, Transport, ViewOverlays, missionRows, toggleAim,
} from './variantDShared.jsx';
import './variantD.css';

function Top({ tab, onTab, sim }) {
  return (
    <header className="vd-top">
      <img src={logo} alt="Interstellar X⁴" />
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>{t}</button>
        ))}
      </nav>
      <span className="vd-met">{sim.event ? <b>HAZARD</b> : sim.status} · {sim.met}</span>
    </header>
  );
}

function Bracket({ className, children }) {
  return <div className={`vd-bracket ${className}`}>{children}</div>;
}

function Home({ sim, onTab }) {
  return (
    <>
      <div className="vd-scene"><ShipCanvas event={sim.event} lights="logo" scale={0.17} z={10} /></div>
      <div className="vd-vignette" />
      <Bracket className="tr">
        <small>Velocity</small><strong>{sim.velocity}<em>km/s</em></strong>
        <small>Mission</small><span>{sim.nav.origin} → {sim.nav.destination} · day {sim.day}</span>
      </Bracket>
      <section className="vd-hero">
        <p className="vd-eyebrow"><i />{sim.event ? sim.event.name : 'All systems nominal'}</p>
        <h1>{TAGLINE}</h1>
        <p className="vd-lead">{LEAD}</p>
        <div className="vd-actions">
          <button className="vd-primary" onClick={() => onTab('Generator')}>Launch Simulator</button>
          <button className="vd-ghost" onClick={() => onTab('Planetary Trajectories')}>Explore Features</button>
        </div>
      </section>
      <ul className="vd-feats">
        {FEATURES.map((f, i) => <li key={f}><span>0{i + 1}</span>{f}</li>)}
      </ul>
    </>
  );
}

/** Edge drawer: small section tabs, a scrolling body, and a hairline handle to collapse it. */
function Drawer({ side, sections, open, onToggle }) {
  const [current, setCurrent] = useState(sections[0][0]);
  const body = sections.find(([name]) => name === current)?.[1];
  const Icon = (side === 'left') === open ? ChevronLeft : ChevronRight;
  return (
    <aside className={`vd-drawer ${side} ${open ? 'open' : 'shut'}`}>
      <button className="vd-handle" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Hide panel' : 'Show panel'}>
        <Icon size={13} /><span>{open ? '' : sections.map(([n]) => n).join(' · ')}</span>
      </button>
      {open && (
        <>
          <div className="vd-dtabs" role="tablist">
            {sections.map(([name]) => (
              <button key={name} role="tab" aria-selected={name === current} className={name === current ? 'on' : ''} onClick={() => setCurrent(name)}>{name}</button>
            ))}
          </div>
          <div className="vd-dbody">{body}</div>
        </>
      )}
    </aside>
  );
}

function HazardRow({ sim, name }) {
  const active = sim.isActive(name);
  const aimable = AIMABLE.includes(name);
  const aiming = sim.demo.armed === name;
  return (
    <div className={`vd-hz ${active ? 'on' : ''} ${aiming ? 'aim' : ''}`}>
      <button onClick={() => sim.trigger(name)} aria-pressed={active}>{name}</button>
      {aimable && <button className="vd-aim" aria-pressed={aiming} onClick={() => toggleAim(sim, name)} title="Place with the pointer">{aiming ? 'aiming' : 'aim'}</button>}
    </div>
  );
}

function Console({ sim }) {
  const [resetCount, resetView] = useViewReset();
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const leftSections = [
    ['Hazards', (
      <>
        <small>Outer hazards</small>
        {OUTER.map((d) => <HazardRow key={d} sim={sim} name={d} />)}
        <small>Inner faults</small>
        {INNER.map((d) => <HazardRow key={d} sim={sim} name={d} />)}
        <p className="dx-note">“aim” arms pointer placement: click the view to launch there. Black Hole and Solar Storm start immediately; inner faults stay active until resolved.</p>
      </>
    )],
    ['Rock', (
      <>
        <small>Physical space rock</small>
        <RockForm sim={sim} />
        <p className="dx-note">200 kg at 40 m/s leaves repairable damage. 5000 kg at 150 m/s can break assemblies. Use a 60 s warning to give the AI time to evade.</p>
      </>
    )],
    ['Thrust', (<><small>Body-frame burns</small><Propulsion sim={sim} /></>)],
    ['AI', (<><small>DEMO AI management</small><AiControls sim={sim} /><small>Agents</small><Agents sim={sim} /></>)],
  ];
  const rightSections = [
    ['Systems', (
      <>
        {sim.systems.map((s) => (
          <div key={s.key} className={`vd-read ${s.value < 85 ? 'low' : ''}`}>
            <span>{s.label}</span><b>{s.value}</b>
            <i><u style={{ width: `${s.value}%` }} /></i>
          </div>
        ))}
        <small>Agents</small>
        <Agents sim={sim} />
        <small>Flight</small>
        <FlightData sim={sim} />
      </>
    )],
    ['Damage', (
      <>
        <small>Component damage</small>
        <Damage sim={sim} />
        <small>Repairs</small>
        <Repairs sim={sim} />
        <small>Nearby rocks &amp; debris</small>
        <Objects sim={sim} />
      </>
    )],
    ['Log', (<><small>Event log</small><EventLog sim={sim} /></>)],
  ];
  return (
    <>
      <div className="vd-scene">
        <DemoViewport sim={sim} resetCount={resetCount}><ViewOverlays sim={sim} /></DemoViewport>
      </div>
      <div className={`vd-vignette console ${left ? 'l' : ''} ${right ? 'r' : ''}`} />
      <Drawer side="left" sections={leftSections} open={left} onToggle={() => setLeft(!left)} />
      <Drawer side="right" sections={rightSections} open={right} onToggle={() => setRight(!right)} />
      <Bracket className="tl console">
        <small>Leg · day {sim.day}</small><span>{sim.nav.origin} → {sim.nav.destination}</span>
        <small>Velocity</small><strong>{sim.velocity}<em>km/s</em></strong>
      </Bracket>
      {sim.event && (
        <div className="vd-alert">
          <span>{sim.event.name}</span> severity {sim.event.severity}% · {sim.demo.ai.busy ? 'AI evaluating' : sim.demo.ai.enabled ? 'autopilot armed' : 'no AI mitigation yet'} <button onClick={sim.clear}>Reset</button>
        </div>
      )}
      <footer className="vd-bottom">
        <Transport sim={sim} onResetView={resetView} />
        <span className="vd-mono">T+ {sim.met}</span>
        <p className={sim.logs[0]?.alert ? 'alert' : ''}>{sim.logs[0]?.text}</p>
      </footer>
    </>
  );
}

function Trajectories({ sim }) {
  return (
    <>
      <div className="vd-full dx-page vd-map"><TrajectoriesView sim={sim} /></div>
      <div className="vd-vignette map" />
      <Bracket className="tr map">
        {missionRows(sim).map(([k, v]) => (
          <div key={k}><small>{k}</small><span>{v}</span></div>
        ))}
        <i className="vd-progress"><u style={{ width: `${sim.nav.progress * 100}%` }} /></i>
        <p>{sim.session.mapInfo}</p>
      </Bracket>
    </>
  );
}

function Sheet({ children, className = '' }) {
  return <section className={`vd-sheet dx-page ${className}`}>{children}</section>;
}

export default function VariantD({ page, tab, onTab, sim }) {
  let body;
  if (page === 'home') body = <Home sim={sim} onTab={onTab} />;
  else if (tab === 'Generator') body = <Console sim={sim} />;
  else if (tab === 'Planetary Trajectories') body = <Trajectories sim={sim} />;
  else if (tab === 'AI Logs') body = <Sheet className="logs"><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Sheet>;
  else if (tab === 'AI API') body = <Sheet className="api"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></Sheet>;
  else body = <div className="vd-full vd-craft dx-page"><SpacecraftView sim={sim} /></div>;
  return (
    <div className={`vd dx-root ${page} ${sim.event ? 'alerting' : ''}`}>
      <Top tab={tab} onTab={onTab} sim={sim} />
      {body}
    </div>
  );
}
