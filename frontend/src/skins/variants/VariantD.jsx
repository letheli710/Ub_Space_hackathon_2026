// PROTOTYPE — Variant D: Immersive HUD. The 3D scene is the whole page; UI is frameless text floating on
// vignettes, with corner brackets and thin cyan→violet hairlines taken from the logo. No panels, no cards.
import { Pause, RotateCcw } from 'lucide-react';
import { FEATURES, INNER, LEAD, OUTER, ShipCanvas, TABS, TAGLINE, logo } from '../shipCanvas.jsx';
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
      <span className="vd-met">{sim.event ? <b>HAZARD</b> : 'DEMO'} · {sim.met}</span>
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

function Console({ sim }) {
  return (
    <>
      <div className="vd-scene"><ShipCanvas event={sim.event} lights="logo" scale={0.13} /></div>
      <div className="vd-vignette console" />
      <aside className="vd-left">
        <small>Outer hazards</small>
        {OUTER.map((d) => <button key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}>{d}</button>)}
        <small>Inner faults</small>
        {INNER.map((d) => <button key={d} className={sim.event?.name === d ? 'on' : ''} onClick={() => sim.trigger(d)}>{d}</button>)}
      </aside>
      <aside className="vd-right">
        {sim.systems.map((s) => (
          <div key={s.key} className={`vd-read ${s.value < 85 ? 'low' : ''}`}>
            <span>{s.label}</span><b>{s.value}</b>
            <i><u style={{ width: `${s.value}%` }} /></i>
          </div>
        ))}
        <div className="vd-sep" />
        {sim.agents.map((a) => (
          <div key={a.name} className="vd-agent"><span>{a.name}</span><em className={a.ok ? '' : 'warn'}>{a.state}</em></div>
        ))}
      </aside>
      <Bracket className="tl console">
        <small>Leg</small><span>{sim.nav.origin} → {sim.nav.destination}</span>
        <small>Velocity</small><strong>{sim.velocity}<em>km/s</em></strong>
      </Bracket>
      {sim.event && (
        <div className="vd-alert">
          <span>{sim.event.name}</span> severity {sim.event.severity}% · AI evaluating <button onClick={sim.clear}>Reset</button>
        </div>
      )}
      <footer className="vd-bottom">
        <button><Pause size={14} /></button>
        <button onClick={sim.clear}><RotateCcw size={14} /></button>
        <span className="vd-mono">T+ {sim.met} · ×{sim.timeScale}</span>
        <p className={sim.logs[0].alert ? 'alert' : ''}>{sim.logs[0].text}</p>
      </footer>
    </>
  );
}

export default function VariantD({ page, tab, onTab, sim }) {
  return (
    <div className={`vd ${page}`}>
      <Top tab={tab} onTab={onTab} sim={sim} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} />}
    </div>
  );
}
