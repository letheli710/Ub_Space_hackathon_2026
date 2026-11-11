// Variant J "Cockpit · 驾驶舱视角": first-person command deck. The real DEMO flight scene is what you see
// through the window; hazards are guarded switches and backlit keys, telemetry lives on soft-key MFDs.
import { useRef, useState } from 'react';
import { ShipCanvas } from '../shipCanvas.jsx';
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset,
} from '../demoSkin.jsx';
import {
  AIMABLE, Agents, AiControls, Damage, EventLog, FlightData, Objects, Propulsion, Repairs, RockForm, Transport, ViewOverlays, missionRows, toggleAim,
} from './variantDShared.jsx';
import './variantJ.css';

const FEATURE_TEXT = [
  'Inject outer-space and on-board hazards, then watch structure, power and propulsion respond in real time.',
  'Four cooperating AI agents evaluate damage, shed load and plan recovery — every decision is logged.',
  'A live three-dimensional model of the spacecraft reacts to each disaster as it unfolds.',
];

function Led({ on = true, tone = 'green' }) {
  return <i className={`vj-led vj-led-${tone} ${on ? 'on' : ''}`} />;
}

function Screw() {
  return <i className="vj-screw" />;
}

function Plate({ className = '', children, label }) {
  return (
    <div className={`vj-plate ${className}`}>
      <Screw /><Screw /><Screw /><Screw />
      {label && <div className="vj-plate-label">{label}</div>}
      {children}
    </div>
  );
}

function ModeSelector({ tab, onTab, children }) {
  return (
    <div className="vj-modes" role="tablist" aria-label="Mode select">
      <span className="vj-etch">MODE SELECT</span>
      {TABS.map((t) => (
        <button key={t} role="tab" aria-selected={tab === t} className={`vj-key ${tab === t ? 'on' : ''}`} onClick={() => onTab(t)}>
          <Led on={tab === t} />
          <span>{t}</span>
        </button>
      ))}
      {children && <div className="vj-modes-end">{children}</div>}
    </div>
  );
}

function GuardedSwitch({ label, active, onFlip }) {
  return (
    <button className={`vj-gsw ${active ? 'on' : ''}`} onClick={onFlip} aria-pressed={active}>
      <span className="vj-gsw-well">
        <span className="vj-gsw-guard" />
        <span className="vj-gsw-bat" />
      </span>
      <span className="vj-gsw-label">{label}</span>
    </button>
  );
}

function Gauge({ value }) {
  const a = -120 + (value / 100) * 240;
  return (
    <svg viewBox="0 0 100 70" className="vj-dial" aria-hidden>
      <path d="M14 62 A40 40 0 1 1 86 62" className="vj-dial-arc" />
      <path d="M72 30 A40 40 0 0 1 86 62" className="vj-dial-amber" />
      {Array.from({ length: 13 }, (_, i) => {
        const r = ((-120 + i * 20) * Math.PI) / 180;
        return <line key={i} x1={50 + Math.sin(r) * 34} y1={42 - Math.cos(r) * 34} x2={50 + Math.sin(r) * 39} y2={42 - Math.cos(r) * 39} className="vj-dial-tick" />;
      })}
      <g style={{ transform: `rotate(${a}deg)`, transformOrigin: '50px 42px', transition: 'transform .8s cubic-bezier(.3,1.4,.5,1)' }}>
        <line x1="50" y1="46" x2="50" y2="10" className="vj-dial-needle" />
      </g>
      <circle cx="50" cy="42" r="3.5" className="vj-dial-hub" />
    </svg>
  );
}

/** Multi-function display: soft keys along the top select the page. */
function Mfd({ label, pages, className = '' }) {
  const [current, setCurrent] = useState(pages[0][0]);
  const body = pages.find(([name]) => name === current)?.[1];
  return (
    <Plate className={`vj-cell ${className}`} label={label}>
      <div className="vj-oled vj-mfd">
        <div className="vj-pages">
          {pages.map(([name]) => (
            <button key={name} className={name === current ? 'on' : ''} onClick={() => setCurrent(name)}>{name}</button>
          ))}
        </div>
        <div className="vj-mfd-body">{body}</div>
      </div>
    </Plate>
  );
}

/** What's outside the window, per tab. */
function Window({ sim, kind, resetCount }) {
  const alert = !!sim.event;
  return (
    <div className="vj-window">
      <div className="vj-frame" />
      <div className="vj-glass">
        {kind === 'home' && (
          <div className="vj-view">
            <div className="vj-planet" />
            <div className="vj-ship">
              <ShipCanvas event={sim.event} lights="warm" scale={0.17} z={9} fov={40} swing={0.35} />
            </div>
          </div>
        )}
        {kind === 'console' && (
          <div className="vj-view live">
            <DemoViewport sim={sim} resetCount={resetCount}><ViewOverlays sim={sim} /></DemoViewport>
          </div>
        )}
        {kind === 'map' && <div className="vj-screen-in dx-page vj-mapview"><TrajectoriesView sim={sim} /></div>}
        {kind === 'craft' && <div className="vj-screen-in dx-page vj-craftview"><SpacecraftView sim={sim} /></div>}
        <div className="vj-refl" />
        {kind === 'console' && (
          <div className={`vj-hud vj-hud-min ${alert ? 'warn' : ''}`}>
            <span>{alert ? `▲ ${sim.event.name.toUpperCase()} · SEV ${sim.event.severity}%` : 'ALL SYSTEMS NOMINAL'}</span>
            <span>V {sim.velocity} km/s · {sim.nav.phase}</span>
            {!sim.demo.playing && <span>PAUSED</span>}
          </div>
        )}
      </div>
      {(kind === 'home' || kind === 'console') && <><i className="vj-mullion m1" /><i className="vj-mullion m2" /></>}
      {kind === 'home' && (
        <div className="vj-hud vj-hud-home" aria-label="Combiner display">
          <img src={logo} alt="" />
          <h1>
            INTERSTELLAR <span>X<sup>4</sup></span>
          </h1>
          <p>{TAGLINE}</p>
          <div className="vj-hud-line">
            <span>MET {sim.met}</span>
            <span>DAY {sim.day}</span>
            <span>{sim.nav.origin} → {sim.nav.destination}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Large central display for the AI Logs and AI API pages. */
function Screen({ label, className, children }) {
  return (
    <Plate className="vj-screen" label={label}>
      <div className={`vj-oled vj-screen-body dx-page ${className}`}>{children}</div>
    </Plate>
  );
}

function Home({ sim, onTab }) {
  const [armed, setArmed] = useState(false);
  const [feat, setFeat] = useState(0);
  return (
    <div className="vj-dash-body vj-home-body">
      <Plate className="vj-cell" label="FLIGHT BRIEF">
        <div className="vj-oled">
          <div className="vj-oled-head">
            <span>MISSION 01</span>
            <span>SIM READY</span>
          </div>
          <p className="vj-lead">{LEAD}</p>
        </div>
      </Plate>

      <Plate className="vj-cell vj-launch-cell" label="SIMULATION">
        <div className="vj-launch-row">
          <button
            className={`vj-launch ${armed ? 'armed' : ''}`}
            onClick={() => (armed ? onTab('Generator') : setArmed(true))}
            onMouseLeave={() => setTimeout(() => setArmed(false), 2400)}
          >
            <span className="vj-launch-cap">LAUNCH</span>
            <span className="vj-launch-cover">
              <em>LIFT GUARD</em>
            </span>
          </button>
          <div className="vj-launch-side">
            <div className="vj-annun">
              <span className={armed ? 'lit amber' : ''}>ARMED</span>
              <span className={sim.demo.ai.enabled ? 'lit green' : ''}>AI LINK</span>
              <span className={sim.systems[0].value > 50 ? 'lit green' : 'lit red'}>PHYS OK</span>
              <span className={sim.session.simulation.ready ? 'lit green' : ''}>BACKEND</span>
            </div>
            <button className="vj-push" onClick={() => setFeat((f) => (f + 1) % FEATURES.length)}>
              EXPLORE FEATURES ›
            </button>
            <div className="vj-hint">{armed ? 'Push to start the simulator' : 'Lift guard, then push'}</div>
          </div>
        </div>
      </Plate>

      <Plate className="vj-cell" label={`FEATURE ${feat + 1}/${FEATURES.length}`}>
        <div className="vj-oled">
          <div className="vj-pages">
            {FEATURES.map((f, i) => (
              <button key={f} className={i === feat ? 'on' : ''} onClick={() => setFeat(i)}>
                {String(i + 1).padStart(2, '0')}
              </button>
            ))}
          </div>
          <h3>{FEATURES[feat]}</h3>
          <p>{FEATURE_TEXT[feat]}</p>
        </div>
      </Plate>
    </div>
  );
}

function Systems({ sim }) {
  const power = sim.systems.find((s) => s.key === 'Power').value;
  return (
    <div className="vj-sys">
      <div className="vj-sys-dial">
        <Gauge value={power} />
        <span>BATT {power}%</span>
      </div>
      <ul>
        {sim.systems.map((s) => (
          <li key={s.key} className={s.value < 70 ? 'low' : s.value < 90 ? 'mid' : ''}>
            <span>{s.label}</span>
            <b style={{ '--v': `${s.value}%` }} />
            <em>{s.value}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Master({ sim }) {
  const alert = !!sim.event;
  return (
    <Plate className="vj-cell vj-master" label="MASTER">
      <button className={`vj-mc ${alert ? 'flash' : ''}`} aria-label="Master caution · reset demo" onClick={sim.clear}>
        <span>MASTER</span>
        <span>CAUTION</span>
      </button>
      <button className="vj-reset" onClick={sim.clear}>
        <span>MASTER RESET</span>
      </button>
      <div className="vj-annun vj-annun-sm">
        <span className={alert ? 'lit red' : ''}>WARN</span>
        <span className={alert ? 'lit amber' : 'lit green'}>{alert ? 'CAUT' : 'NOM'}</span>
        <span className={sim.demo.ai.enabled ? 'lit green' : sim.demo.ai.busy ? 'lit amber' : ''}>A/P</span>
        <span className={sim.demo.playing ? 'lit green' : 'lit amber'}>{sim.demo.playing ? 'RUN' : 'HOLD'}</span>
      </div>
    </Plate>
  );
}

function LogCell({ sim }) {
  return (
    <Plate className="vj-cell" label="EVENT LOG">
      <div className="vj-oled vj-log">
        {sim.logs.map((l) => (
          <div key={l.id} className={l.alert ? 'alert' : ''}>
            <span>{l.alert ? '▲' : '·'}</span>
            <span className="vj-log-t">{l.time}</span>
            {l.text}
          </div>
        ))}
      </div>
    </Plate>
  );
}

function Console({ sim }) {
  return (
    <div className="vj-dash-body vj-console-body">
      <Mfd label="MFD 1 · STATUS" pages={[
        ['SYS', <><Systems sim={sim} /><div className="vj-mfd-sub">AGENTS</div><Agents sim={sim} /></>],
        ['DMG', <Damage sim={sim} />],
        ['FLT', <FlightData sim={sim} />],
        ['ARM', <><div className="vj-mfd-sub">REPAIRS</div><Repairs sim={sim} /><div className="vj-mfd-sub">NEARBY OBJECTS</div><Objects sim={sim} /></>],
      ]} />
      <Mfd label="MFD 2 · CONTROL" pages={[
        ['ROCK', <RockForm sim={sim} launchLabel="LAUNCH ROCK" />],
        ['PROP', <Propulsion sim={sim} />],
        ['AI', <AiControls sim={sim} />],
      ]} />
      <LogCell sim={sim} />
      <Master sim={sim} />
    </div>
  );
}

function MapDash({ sim }) {
  return (
    <div className="vj-dash-body vj-console-body">
      <Plate className="vj-cell" label="MISSION">
        <div className="vj-oled vj-mission">
          <dl>{missionRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      </Plate>
      <Plate className="vj-cell" label="NAV">
        <div className="vj-oled">
          <div className="vj-nav">
            <div>
              <span>{sim.nav.origin}</span>
              <span>{Math.round(sim.nav.progress * 100)}%</span>
              <span>{sim.nav.destination}</span>
            </div>
            <b style={{ '--p': `${sim.nav.progress * 100}%` }} />
          </div>
          <p className="vj-mapinfo">{sim.session.mapInfo}</p>
        </div>
      </Plate>
      <LogCell sim={sim} />
      <Master sim={sim} />
    </div>
  );
}

function LeftPanel({ kind, sim }) {
  if (kind === 'console') {
    return (
      <Plate className="vj-side vj-side-l" label="HAZARD · OUTER">
        <div className="vj-gsw-grid">
          {OUTER.map((h) => (
            <div key={h} className="vj-gsw-cell">
              <GuardedSwitch label={h} active={sim.isActive(h)} onFlip={() => sim.trigger(h)} />
              {AIMABLE.includes(h) && (
                <button className={`vj-aim ${sim.demo.armed === h ? 'on' : ''}`} aria-pressed={sim.demo.armed === h} onClick={() => toggleAim(sim, h)}>
                  <Led on={sim.demo.armed === h} tone="amber" />AIM
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="vj-etch vj-foot">{sim.demo.armed ? 'AIM ARMED · CLICK VIEW · ESC CANCEL' : 'EXTERNAL · GUARDED'}</div>
      </Plate>
    );
  }
  return (
    <Plate className="vj-side vj-side-l" label="NAV">
      <div className="vj-lcd">
        <div><span>MET</span><b>{sim.met}</b></div>
        <div><span>DAY</span><b>{sim.day}</b></div>
        <div><span>VEL</span><b>{sim.velocity}</b><i>km/s</i></div>
        <div><span>MASS</span><b>{sim.massKg}</b><i>kg</i></div>
        <div><span>T×</span><b>{sim.timeScale}</b></div>
      </div>
      <div className="vj-etch vj-foot">{sim.nav.origin.toUpperCase()} → {sim.nav.destination.toUpperCase()}</div>
    </Plate>
  );
}

function RightPanel({ kind, sim }) {
  if (kind === 'console') {
    return (
      <Plate className="vj-side vj-side-r" label="HAZARD · INNER">
        <div className="vj-btn-grid">
          {INNER.map((h) => (
            <button key={h} className={`vj-bl ${sim.isActive(h) ? 'on' : ''}`} aria-pressed={sim.isActive(h)} onClick={() => sim.trigger(h)}>
              {h}
            </button>
          ))}
        </div>
        <div className="vj-etch vj-foot">ON-BOARD · PUSH TO INJECT</div>
      </Plate>
    );
  }
  return (
    <Plate className="vj-side vj-side-r" label="CAPABILITY">
      <ul className="vj-lamps">
        {FEATURES.map((f) => (
          <li key={f}>
            <Led on />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <ul className="vj-mini">
        {sim.systems.map((s) => (
          <li key={s.key}>
            <span>{s.key}</span>
            <b style={{ '--v': `${s.value}%` }} />
          </li>
        ))}
      </ul>
    </Plate>
  );
}

const KIND = { Home: 'home', Generator: 'console', 'Planetary Trajectories': 'map', Spacecraft: 'craft', 'AI Logs': 'screen', 'AI API': 'screen' };

export default function VariantJ({ tab, onTab, sim }) {
  const root = useRef(null);
  const [resetCount, resetView] = useViewReset();
  const kind = KIND[tab] ?? 'home';
  const alert = !!sim.event;
  const onMove = (e) => {
    const el = root.current;
    if (!el) return;
    el.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3));
    el.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3));
  };
  let centre;
  if (kind === 'screen') {
    centre = tab === 'AI Logs'
      ? <Screen label="MFD · AI MANAGEMENT & EVENT LOG" className="logs"><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Screen>
      : <Screen label="MFD · AI API LINK" className="api"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></Screen>;
  } else {
    centre = <Window sim={sim} kind={kind} resetCount={resetCount} />;
  }
  return (
    <div ref={root} className={`vj dx-root vj-page-${kind} ${alert ? 'vj-alert' : ''}`} onMouseMove={onMove}>
      <div className="vj-ceiling" />
      <div className="vj-top">
        <LeftPanel kind={kind} sim={sim} />
        {centre}
        <RightPanel kind={kind} sim={sim} />
      </div>
      <div className="vj-dash-wrap">
        <div className="vj-dash">
          <ModeSelector tab={tab} onTab={onTab}>
            {kind !== 'home' && <Transport sim={sim} onResetView={kind === 'console' ? resetView : undefined} text />}
          </ModeSelector>
          {kind === 'home' && <Home sim={sim} onTab={onTab} />}
          {kind === 'console' && <Console sim={sim} />}
          {kind === 'map' && <MapDash sim={sim} />}
        </div>
      </div>
      <div className="vj-wash" aria-hidden />
    </div>
  );
}
