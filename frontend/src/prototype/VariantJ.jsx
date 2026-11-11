// PROTOTYPE — throwaway. Variant J "Cockpit · 驾驶舱视角": first-person command deck looking out a window.
import { useRef, useState } from 'react';
import { ShipCanvas, logo, TABS, OUTER, INNER, FEATURES, TAGLINE, LEAD } from './mock.jsx';
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

function ModeSelector({ tab, onTab }) {
  return (
    <div className="vj-modes" role="tablist" aria-label="Mode select">
      <span className="vj-etch">MODE SELECT</span>
      {TABS.map((t) => (
        <button key={t} role="tab" aria-selected={tab === t} className={`vj-key ${tab === t ? 'on' : ''}`} onClick={() => onTab(t)}>
          <Led on={tab === t} />
          <span>{t}</span>
        </button>
      ))}
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

function Window({ sim, page }) {
  const alert = !!sim.event;
  return (
    <div className="vj-window">
      <div className="vj-frame" />
      <div className="vj-glass">
        <div className="vj-view">
          <div className="vj-planet" />
          <div className="vj-ship">
            <ShipCanvas event={sim.event} lights="warm" scale={0.17} z={page === 'home' ? 9 : 10} fov={40} swing={0.35} />
          </div>
        </div>
        <div className="vj-refl" />
        {page === 'console' && (
          <div className={`vj-hud vj-hud-min ${alert ? 'warn' : ''}`}>
            <span>{alert ? `▲ ${sim.event.name.toUpperCase()} · SEV ${sim.event.severity}%` : 'ALL SYSTEMS NOMINAL'}</span>
            <span>V {sim.velocity} km/s · {sim.nav.phase}</span>
          </div>
        )}
      </div>
      <i className="vj-mullion m1" />
      <i className="vj-mullion m2" />
      {page === 'home' && (
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
              <span className="lit green">AI LINK</span>
              <span className="lit green">PHYS OK</span>
              <span>BACKEND</span>
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

function Console({ sim }) {
  const alert = !!sim.event;
  return (
    <div className="vj-dash-body vj-console-body">
      <Plate className="vj-cell" label="SYSTEMS">
        <div className="vj-oled vj-sys">
          <div className="vj-sys-dial">
            <Gauge value={sim.systems.find((s) => s.key === 'Power').value} />
            <span>BATT {sim.systems.find((s) => s.key === 'Power').value}%</span>
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
      </Plate>

      <Plate className="vj-cell" label="AI AGENTS · NAV">
        <div className="vj-oled">
          <ul className="vj-agents">
            {sim.agents.map((a) => (
              <li key={a.name}>
                <Led on tone={a.ok ? 'green' : 'amber'} />
                <span>{a.name}</span>
                <em>{a.state}</em>
              </li>
            ))}
          </ul>
          <div className="vj-nav">
            <div>
              <span>{sim.nav.origin}</span>
              <span>{sim.nav.phase}</span>
              <span>{sim.nav.destination}</span>
            </div>
            <b style={{ '--p': `${Math.min(sim.nav.progress, 1) * 100}%` }} />
            <dl>
              <dt>MET</dt><dd>{sim.met}</dd>
              <dt>VEL</dt><dd>{sim.velocity} km/s</dd>
              <dt>PROP</dt><dd>{sim.propellantKg} kg</dd>
              <dt>ATT</dt><dd>{sim.attitude}</dd>
            </dl>
          </div>
        </div>
      </Plate>

      <Plate className="vj-cell" label="EVENT LOG">
        <div className="vj-oled vj-log">
          {sim.logs.slice(0, 7).map((l, i) => (
            <div key={`${l.t}-${i}`} className={l.alert ? 'alert' : ''}>
              <span>{l.alert ? '▲' : '·'}</span>
              {l.text}
            </div>
          ))}
        </div>
      </Plate>

      <Plate className="vj-cell vj-master" label="MASTER">
        <button className={`vj-mc ${alert ? 'flash' : ''}`} aria-label="Master caution" onClick={sim.clear}>
          <span>MASTER</span>
          <span>CAUTION</span>
        </button>
        <button className="vj-reset" onClick={sim.clear}>
          <span>MASTER RESET</span>
        </button>
        <div className="vj-annun vj-annun-sm">
          <span className={alert ? 'lit red' : ''}>WARN</span>
          <span className={alert ? 'lit amber' : 'lit green'}>{alert ? 'CAUT' : 'NOM'}</span>
        </div>
      </Plate>
    </div>
  );
}

function LeftPanel({ page, sim }) {
  if (page === 'console') {
    return (
      <Plate className="vj-side vj-side-l" label="HAZARD · OUTER">
        <div className="vj-gsw-grid">
          {OUTER.map((h) => (
            <GuardedSwitch key={h} label={h} active={sim.event?.name === h} onFlip={() => sim.trigger(h)} />
          ))}
        </div>
        <div className="vj-etch vj-foot">EXTERNAL · GUARDED</div>
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

function RightPanel({ page, sim }) {
  if (page === 'console') {
    return (
      <Plate className="vj-side vj-side-r" label="HAZARD · INNER">
        <div className="vj-btn-grid">
          {INNER.map((h) => (
            <button key={h} className={`vj-bl ${sim.event?.name === h ? 'on' : ''}`} onClick={() => sim.trigger(h)}>
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
        {sim.systems.slice(0, 4).map((s) => (
          <li key={s.key}>
            <span>{s.key}</span>
            <b style={{ '--v': `${s.value}%` }} />
          </li>
        ))}
      </ul>
    </Plate>
  );
}

export default function VariantJ({ page, tab, onTab, sim }) {
  const root = useRef(null);
  const alert = !!sim.event;
  const onMove = (e) => {
    const el = root.current;
    if (!el) return;
    el.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3));
    el.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3));
  };
  return (
    <div ref={root} className={`vj vj-page-${page} ${alert ? 'vj-alert' : ''}`} onMouseMove={onMove}>
      <div className="vj-ceiling" />
      <div className="vj-top">
        <LeftPanel page={page} sim={sim} />
        <Window sim={sim} page={page} />
        <RightPanel page={page} sim={sim} />
      </div>
      <div className="vj-dash-wrap">
        <div className="vj-dash">
          <ModeSelector tab={tab} onTab={onTab} />
          {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} />}
        </div>
      </div>
      <div className="vj-wash" aria-hidden />
    </div>
  );
}
