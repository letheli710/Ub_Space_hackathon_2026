// Variant B: Flight Deck. Neutral near-black, warm white type, a single amber signal,
// mono instrument readouts, square corners, left icon rail, dense instrument-tile layout.
// Runs on the real DEMO session (see ../demoSkin.jsx).
import { Bot, Crosshair, House, KeyRound, LocateFixed, Orbit, Pause, Play, RotateCcw, Rocket, ScrollText, Zap } from 'lucide-react';
import { useState } from 'react';
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE,
  TrajectoriesView, logo, useViewReset,
} from '../demoSkin.jsx';
import { ShipCanvas } from '../shipCanvas.jsx';
import {
  AiControls, DamageList, PhysicsNotes, Propulsion, RockSettings, TimeScale, ViewOverlays,
  flightRows, hazardState, missionRows, toggleArm,
} from './variantABCKit.jsx';
import './variantB.css';

const ICONS = [House, Rocket, Zap, Orbit, ScrollText, KeyRound];
const SHORT = ['HOME', 'CRAFT', 'GEN', 'TRAJ', 'LOGS', 'API'];
const TITLES = { Spacecraft: 'SPACECRAFT', Generator: 'GENERATOR', 'Planetary Trajectories': 'TRAJECTORIES', 'AI Logs': 'AI LOGS', 'AI API': 'AI API' };

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
      <span className={`vb-mode ${sim.event ? 'alert' : ''}`}>{sim.event ? '▲ MASTER CAUTION' : `● ${sim.status} / NOMINAL`}</span>
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

/** Multi-function display pages for the right-hand instrument column. */
const MFD = ['SYS', 'DMG', 'ROCK', 'PROP', 'AI'];

function Instruments({ sim }) {
  const [page, setPage] = useState('SYS');
  return (
    <div className="vb-mfd">
      <div className="vb-softkeys" role="tablist">
        {MFD.map((m) => (
          <button key={m} role="tab" aria-selected={page === m} className={page === m ? 'on' : ''} onClick={() => setPage(m)}>{m}</button>
        ))}
      </div>
      <div className="vb-instruments">
        {page === 'SYS' && <>
          {sim.systems.map((s) => (
            <div key={s.key} className={`vb-tile ${s.value < 85 ? 'warn' : ''}`}>
              <small>{s.label.toUpperCase()}</small>
              <strong>{s.value}<em>%</em></strong>
              <div className="vb-ticks">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < s.value / 5 ? 'on' : ''} />)}</div>
            </div>
          ))}
          <div className="vb-tile wide">
            <small>FLIGHT</small>
            <dl>{flightRows(sim).map(([k, v]) => <div key={k}><dt>{k.toUpperCase()}</dt><dd>{v}</dd></div>)}</dl>
          </div>
          <div className="vb-tile wide">
            <small>AI AGENTS</small>
            {sim.agents.map((a) => (
              <div key={a.id} className="vb-agent" title={a.reason}><Bot size={13} /><span>{a.name}</span><em className={a.ok ? '' : 'warn'}>{a.state.toUpperCase()}</em></div>
            ))}
          </div>
        </>}
        {page === 'DMG' && <>
          <div className="vb-tile wide"><small>COMPONENT DAMAGE</small><DamageList sim={sim} /></div>
          <div className="vb-tile wide"><small>REPAIRS · OBJECTS · SUBSYSTEMS</small><PhysicsNotes sim={sim} /></div>
        </>}
        {page === 'ROCK' && <div className="vb-tile wide"><small>PHYSICAL SPACE ROCK</small><RockSettings sim={sim} /></div>}
        {page === 'PROP' && <div className="vb-tile wide"><small>PROPULSION TEST · BODY FRAME</small><Propulsion sim={sim} /></div>}
        {page === 'AI' && <div className="vb-tile wide"><small>DEMO AI MANAGEMENT</small><AiControls sim={sim} /></div>}
      </div>
    </div>
  );
}

function HazardKey({ sim, name, fkey }) {
  const h = hazardState(sim, name);
  return (
    <span className={`vb-key ${h.active ? 'on' : ''} ${h.armed ? 'armed' : ''}`}>
      <button onClick={() => sim.trigger(name)} aria-pressed={h.active}><kbd>{fkey}</kbd>{name}</button>
      {h.pointer && <button className="vb-aim" title="Aim with pointer" aria-pressed={h.armed} onClick={() => toggleArm(sim, name)}><Crosshair size={13} /></button>}
    </span>
  );
}

function Console({ sim }) {
  const [resetCount, resetView] = useViewReset();
  const playing = sim.demo.playing;
  return (
    <div className="vb-console">
      <Strip sim={sim} title="GENERATOR" />
      <div className="vb-main">
        <div className="vb-view">
          <div className="vb-viewport"><DemoViewport sim={sim} resetCount={resetCount} /></div>
          <ViewOverlays sim={sim} />
          <div className="vb-reticle" />
          <span className="vb-label tl">3D VIEW · {sim.status} · BROWSER PHYSICS</span>
          <span className="vb-label tr">WASD / ARROWS · DRAG TO LOOK</span>
          {sim.event && (
            <div className="vb-caution">
              <b>MASTER CAUTION</b>
              <span>{sim.event.name.toUpperCase()} · SEV {sim.event.severity}%</span>
              <button onClick={sim.clear}>ACK / RESET</button>
            </div>
          )}
          <div className="vb-transport">
            <button title={playing ? 'Pause' : 'Resume'} onClick={sim.demo.togglePlaying}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <button title="Reset demo" onClick={sim.clear}><RotateCcw size={14} /></button>
            <span>T+ {sim.met}</span>
            <TimeScale sim={sim} />
            <button className="vb-wide-btn" title="Reset view" onClick={resetView}><LocateFixed size={14} /> VIEW</button>
          </div>
        </div>
        <Instruments sim={sim} />
      </div>

      <div className="vb-bottom">
        <div className="vb-keys">
          <small>OUTER</small>
          {OUTER.map((d, i) => <HazardKey key={d} sim={sim} name={d} fkey={`F${i + 1}`} />)}
          <small>INNER</small>
          {INNER.map((d, i) => <HazardKey key={d} sim={sim} name={d} fkey={`F${i + 5}`} />)}
        </div>
        <ol className="vb-log">
          {sim.logs.slice(0, 12).map((l) => (
            <li key={l.id} className={l.alert ? 'alert' : ''} title={l.text}><time>{l.time}</time>{l.text}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Trajectories({ sim }) {
  return (
    <div className="vb-main vb-traj">
      <div className="vb-view vb-map"><TrajectoriesView sim={sim} /></div>
      <div className="vb-instruments">
        <div className="vb-tile wide">
          <small>LEG PROGRESS</small>
          <strong>{Math.round(sim.nav.progress * 100)}<em>%</em></strong>
          <div className="vb-ticks">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < sim.nav.progress * 20 ? 'on' : ''} />)}</div>
        </div>
        <div className="vb-tile wide">
          <small>MISSION</small>
          <dl>{missionRows(sim).map(([k, v]) => <div key={k}><dt>{k.toUpperCase()}</dt><dd>{v}</dd></div>)}</dl>
        </div>
        <div className="vb-tile wide">
          <small>PLAYBACK</small>
          <div className="vb-play">
            <button onClick={sim.demo.togglePlaying}>{sim.demo.playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <TimeScale sim={sim} />
          </div>
        </div>
        <div className="vb-tile wide"><small>INSPECTOR</small><p className="kx-note">{sim.session.mapInfo}</p></div>
      </div>
    </div>
  );
}

function Page({ tab, sim, onTab }) {
  if (tab === 'Generator') return <Console sim={sim} />;
  return (
    <div className="vb-console">
      <Strip sim={sim} title={TITLES[tab]} />
      {tab === 'Planetary Trajectories' && <Trajectories sim={sim} />}
      {tab === 'AI Logs' && <div className="vb-body vb-ailogs"><AiLogsView sim={sim} /></div>}
      {tab === 'AI API' && <div className="vb-body vb-apipage"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></div>}
      {tab === 'Spacecraft' && <div className="vb-body vb-craft"><SpacecraftView sim={sim} /></div>}
    </div>
  );
}

export default function VariantB({ page, tab, onTab, sim }) {
  return (
    <div className="vb">
      <Rail tab={tab} onTab={onTab} />
      {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Page tab={tab} sim={sim} onTab={onTab} />}
    </div>
  );
}
