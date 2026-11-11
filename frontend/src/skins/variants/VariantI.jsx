// Variant I "Incident File · 事故档案": a mission-incident dossier on a desk, running the REAL DEMO
// session. The surveillance print is the live 3D DEMO flight scene; the report form fires real hazards.
import { ShipCanvas } from '../shipCanvas.jsx';
import { AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset } from '../demoSkin.jsx';
import { AiControls, Damage, FlightData, Nearby, Propulsion, RockForm, Transport, missionRows, useHazards } from './variantIKLKit.jsx';
import './variantI.css';

/** Nominal reading per system; consumables (fuel, battery) are only circled when low. */
const NOMINAL = { Structure: 100, Solar: 100, Fuel: null, Power: null, Drive: 100, Energy: 100 };
const ISSUER = 'INTERSTELLAR X⁴ MISSION SAFETY BOARD';

/** Hand-drawn check mark (animated stroke). */
function Check() {
  return (
    <svg className="vi-check" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M3 13 C6 15, 8 18, 9.5 21 C12 14, 16 8, 22 2" fill="none" stroke="#d0231b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Red-pen circle around a value. */
function Circled({ on, children }) {
  return (
    <span className={`vi-circ ${on ? 'on' : ''}`}>
      {children}
      {on && (
        <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
          <path d="M8 26 C8 8, 88 4, 94 22 C98 40, 30 48, 12 38 C4 33, 10 14, 30 10" fill="none" stroke="#d0231b" strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </span>
  );
}

function Tabs({ tab, onTab }) {
  return (
    <nav className="vi-tabs" aria-label="File sections">
      {TABS.map((t, i) => (
        <button key={t} className={`vi-tab ${t === tab ? 'on' : ''}`} style={{ '--i': i }} onClick={() => onTab(t)}>
          <span className="vi-tab-n">{String(i).padStart(2, '0')}</span> {t}
        </button>
      ))}
    </nav>
  );
}

function Home({ sim, tab, onTab }) {
  const open = sim.demo.activeFaults.length || sim.demo.blackHole || sim.demo.solarStorm || sim.event;
  return (
    <div className="vi-desk vi-desk-home">
      <div className="vi-ring" aria-hidden="true" />
      <div className="vi-pencil" aria-hidden="true" />
      <div className="vi-folder vi-cover">
        <Tabs tab={tab} onTab={onTab} />
        <div className="vi-cover-grid">
          <section className="vi-cover-left">
            <div className="vi-issuer">
              {ISSUER}
              <span>FORM MSB-7 · CONFIDENTIAL · DO NOT REMOVE FROM ARCHIVE</span>
            </div>
            <div className="vi-label">
              <small>CASE FILE:</small>
              <h1>INTERSTELLAR X⁴</h1>
              <div className="vi-label-meta">
                <span>CASE NO. <b>X4-2026-{String(sim.day).padStart(3, '0')}</b></span>
                <span>MET <b>{sim.met}</b></span>
              </div>
            </div>
            <div className="vi-stamp vi-stamp-blue vi-stamp-tag">{TAGLINE}</div>

            <div className="vi-sheet vi-summary">
              <div className="vi-clip" aria-hidden="true" />
              <h3>CASE SUMMARY</h3>
              <p className="vi-typed">{LEAD}</p>
              <h3>FINDINGS</h3>
              <ul className="vi-checklist">
                {FEATURES.map((f) => (
                  <li key={f}>
                    <span className="vi-box"><Check /></span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="vi-cta">
                <button className="vi-btn-primary" onClick={() => onTab('Generator')}>OPEN FILE →</button>
                <button className="vi-btn-ghost" onClick={() => onTab('Spacecraft')}>Explore features</button>
              </div>
              <div className="vi-hand vi-note">integrity {sim.systems[0].value}% — {sim.systems[0].value < 100 ? 'damage noted!' : 'hull nominal ✓'}</div>
            </div>
          </section>

          <section className="vi-cover-right">
            <figure className="vi-polaroid">
              <div className="vi-tape vi-tape-a" />
              <div className="vi-photo">
                <ShipCanvas event={sim.event} lights="cool" scale={0.14} />
                <div className="vi-photo-stamp">EXHIBIT A · {sim.met}</div>
              </div>
              <figcaption className="vi-hand">Vessel X⁴ — {sim.velocity} km/s, day {sim.day}</figcaption>
            </figure>
            <div className="vi-sticker">
              <div className="vi-tape vi-tape-b" />
              <img src={logo} alt="Interstellar X⁴ logo" />
            </div>
            <div className="vi-routing">
              <div><span>ROUTE</span>{sim.nav.origin} → {sim.nav.destination}</div>
              <div><span>PHASE</span>{sim.nav.phase}</div>
              <div><span>STATUS</span>{open ? 'INCIDENT OPEN' : `UNDER REVIEW · ${sim.status}`}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function HazardLine({ name, hz }) {
  const st = hz.state(name);
  return (
    <button className={`vi-hz ${st ? 'on' : ''} ${st === 'armed' ? 'armed' : ''}`} aria-pressed={Boolean(st)} onClick={() => hz.press(name)}>
      <span className="vi-box">{st && <Check />}</span>
      {name}
      {st === 'armed' && <em className="vi-hand-inline red">armed — click print</em>}
    </button>
  );
}

function Generator({ sim }) {
  const ev = sim.event;
  const hz = useHazards(sim);
  const [resetCount, resetView] = useViewReset();
  const pct = Math.min(100, sim.nav.progress * 100);
  const p = sim.demo.physics;
  const alert = Boolean(ev) || sim.demo.blackHole || sim.demo.solarStorm || sim.demo.hazards.length > 0;
  return (
    <div className={`vi-open-grid ${alert ? 'alert' : ''}`}>
      {/* LEFT — incident report form + work orders */}
      <section className="vi-page vi-form">
        <header className="vi-form-head">
          <small>{ISSUER}</small>
          <h2>INCIDENT REPORT FORM</h2>
          <div className="vi-fields">
            <span>CASE <b>X4-{String(sim.day).padStart(3, '0')}</b></span>
            <span>MET <b>{sim.met}</b></span>
            <span>FILED BY <b className="vi-hand-inline">Ops desk</b></span>
          </div>
        </header>
        <fieldset>
          <legend>A · EXTERNAL HAZARDS</legend>
          {OUTER.map((h) => <HazardLine key={h} name={h} hz={hz} />)}
        </fieldset>
        <fieldset>
          <legend>B · INTERNAL HAZARDS</legend>
          {INNER.map((h) => <HazardLine key={h} name={h} hz={hz} />)}
        </fieldset>
        <p className={`vi-hint ${hz.armed ? 'on' : ''}`}>☞ {hz.hint}</p>
        <div className="vi-sev">
          <span>C · SEVERITY</span>
          <div className="vi-sev-line">
            {ev ? <b className="vi-hand-inline red">{ev.severity}% · {ev.name}</b> : <i>— none —</i>}
          </div>
          <div className="vi-sev-bar"><i style={{ width: `${ev ? ev.severity : 0}%` }} /></div>
        </div>
        <fieldset className="vi-sub">
          <legend>D · PHYSICAL SPACE ROCK</legend>
          <RockForm sim={sim} launchLabel="FILE ROCK LAUNCH" />
        </fieldset>
        <div className="vi-slip">
          <div className="vi-slip-head">WORK ORDER 7-P · PROPULSION</div>
          <Propulsion sim={sim} />
        </div>
        <div className="vi-slip">
          <div className="vi-slip-head">REQUEST 7-AI · DEMO AI MANAGEMENT</div>
          <AiControls sim={sim} />
        </div>
        <button className={`vi-close ${alert ? 'live' : ''}`} onClick={sim.clear} title="Reset the DEMO voyage, damage and hazards">
          CLOSE CASE
        </button>
      </section>

      {/* CENTER — surveillance print = the real DEMO flight scene */}
      <section className="vi-center">
        <div className="vi-print">
          <div className="vi-clip vi-clip-print" aria-hidden="true" />
          <div className="vi-monitor">
            <DemoViewport sim={sim} resetCount={resetCount}>
              <div className="vi-scan" aria-hidden="true" />
              {sim.demo.stormFlash > 0 && <div key={sim.demo.stormFlash} className="ikl-flash" aria-hidden="true" />}
              <div className="vi-osd tl">CAM-03 · EXT · {sim.demo.playing ? 'REC ●' : 'PAUSED ❚❚'}</div>
              <div className="vi-osd tr">MET {sim.met}</div>
              <div className="vi-osd bl">DAY {String(sim.day).padStart(3, '0')} · ×{sim.timeScale} · {p.mode.toUpperCase()}</div>
              <div className="vi-osd br">{ev ? `EVENT: ${ev.name.toUpperCase()}` : sim.demo.hazards.length ? 'CONTACT INBOUND' : 'NO ANOMALY'}</div>
              {hz.armed && <div className="ikl-armed vi-armed">Click to launch {hz.armed} · Esc to cancel</div>}
              <div className="vi-crosshair" aria-hidden="true" />
            </DemoViewport>
          </div>
          <div className="vi-print-cap">
            <span>FIG. 1 — Surveillance feed, {sim.nav.origin} → {sim.nav.destination} · WASD / drag to look</span>
            <Transport sim={sim} onResetView={resetView} labels={{ play: '▶ PLAY', pause: '❚❚ PAUSE', reset: '↺ RESET', view: '⌖ REFRAME' }} />
          </div>
        </div>
        <div className="vi-sheet vi-navslip">
          <div className="vi-nav-row">
            <div><span>PHASE</span><b>{sim.nav.phase}</b></div>
            <div><span>VELOCITY</span><b>{sim.velocity} km/s</b></div>
            <div><span>PROPELLANT</span><b>{sim.propellantKg} kg</b></div>
            <div><span>MASS</span><b>{sim.massKg} kg</b></div>
            <div><span>ATTITUDE</span><b>{sim.attitude}</b></div>
            <div><span>ω</span><b>{sim.angular} rad/s</b></div>
          </div>
          <div className="vi-route">
            <span>{sim.nav.origin}</span>
            <div className="vi-route-track"><i style={{ width: `${pct}%` }} /><em style={{ left: `${pct}%` }}>✕</em></div>
            <span>{sim.nav.destination}</span>
            <b>{pct.toFixed(1)}%</b>
          </div>
        </div>
        {ev ? (
          <div key={ev.name} className="vi-stamp vi-stamp-red vi-slam" aria-live="assertive">
            INCIDENT ACTIVE
            <small>{ev.name.toUpperCase()} · SEV {ev.severity}%</small>
          </div>
        ) : (
          <div className="vi-stamp vi-stamp-blue vi-filed">NO OPEN INCIDENT</div>
        )}
      </section>

      {/* RIGHT — evidence */}
      <section className="vi-page vi-evidence">
        <h3>EXHIBIT B · SYSTEMS TABLE</h3>
        <table className="vi-table">
          <thead>
            <tr><th>SYSTEM</th><th>READING</th><th>NOMINAL</th></tr>
          </thead>
          <tbody>
            {sim.systems.map((s) => {
              const nominal = NOMINAL[s.key];
              const hit = nominal == null ? s.value < 50 : s.value < nominal;
              return (
                <tr key={s.key} className={hit ? 'hit' : ''}>
                  <td>{s.label}</td>
                  <td><Circled on={hit}>{s.value}%</Circled></td>
                  <td>{nominal == null ? '—' : `${nominal}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3>EXHIBIT C · WITNESS STATEMENTS</h3>
        <div className="vi-witness">
          {sim.agents.map((a) => (
            <div key={a.id} className={`vi-wit ${a.ok ? '' : 'bad'}`} title={a.reason || undefined}>
              <b>{a.name} agent:</b> “{a.state}.”
              <span className="vi-hand-inline">{a.ok ? 'credible' : 'under strain!'}</span>
            </div>
          ))}
        </div>

        <h3>EXHIBIT D · COMPONENT DAMAGE</h3>
        <Damage sim={sim} />

        <h3>EXHIBIT E · FLIGHT RECORDER</h3>
        <FlightData sim={sim} />

        <h3>EXHIBIT F · NEARBY OBJECTS</h3>
        <Nearby sim={sim} />

        <h3>EXHIBIT G · TIMELINE</h3>
        <ol className="vi-log">
          {sim.logs.slice(0, 12).map((l, i) => (
            <li key={l.id} className={`${l.alert ? 'alert' : ''} ${i === 0 ? 'newest' : ''}`}>
              <span>{l.time}</span>
              {l.text}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Trajectories({ sim }) {
  return (
    <div className="vi-tab-grid vi-tab-grid-2">
      <div className="vi-print vi-print-big">
        <div className="vi-clip vi-clip-print" aria-hidden="true" />
        <div className="vi-monitor vi-monitor-map ikl-embed"><TrajectoriesView sim={sim} /></div>
        <div className="vi-print-cap"><span>FIG. 2 — Planetary trajectory chart, {sim.demo.celestialDate.slice(0, 10)}</span><span className="vi-hand-inline">same voyage as the case file</span></div>
      </div>
      <section className="vi-page vi-evidence">
        <h3>EXHIBIT H · MISSION ROUTING</h3>
        <table className="vi-table vi-table-kv">
          <tbody>{missionRows(sim).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
        </table>
        <h3>TIMELINE EXCERPT</h3>
        <ol className="vi-log">
          {sim.logs.slice(0, 6).map((l) => <li key={l.id} className={l.alert ? 'alert' : ''}><span>{l.time}</span>{l.text}</li>)}
        </ol>
      </section>
    </div>
  );
}

function Paper({ title, children, className = '' }) {
  return (
    <section className={`vi-page vi-paper ${className}`}>
      <header className="vi-form-head"><small>{ISSUER}</small><h2>{title}</h2></header>
      <div className="vi-paper-body ikl-embed">{children}</div>
    </section>
  );
}

function Console({ sim, tab, onTab }) {
  let body;
  if (tab === 'Generator') body = <Generator sim={sim} />;
  else if (tab === 'Planetary Trajectories') body = <Trajectories sim={sim} />;
  else if (tab === 'AI Logs') body = <div className="vi-tab-grid"><Paper title="AI MANAGEMENT TRANSCRIPT"><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Paper></div>;
  else if (tab === 'AI API') body = <div className="vi-tab-grid"><Paper title="AI CONNECTION AUTHORISATION" className="vi-paper-narrow"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></Paper></div>;
  else body = (
    <div className="vi-tab-grid">
      <div className="vi-print vi-print-big">
        <div className="vi-clip vi-clip-print" aria-hidden="true" />
        <div className="vi-monitor vi-monitor-craft ikl-embed"><SpacecraftView sim={sim} /></div>
        <div className="vi-print-cap"><span>FIG. 3 — Vessel construction record · drag to orbit, scroll to zoom</span><span className="vi-hand-inline">Exhibit A, enlarged</span></div>
      </div>
    </div>
  );
  return (
    <div className="vi-desk vi-desk-console">
      <div className="vi-ring vi-ring-console" aria-hidden="true" />
      <div className="vi-folder vi-open">
        <Tabs tab={tab} onTab={onTab} />
        {body}
      </div>
    </div>
  );
}

export default function VariantI({ page, tab, onTab, sim }) {
  return <div className="vi ikl-scope">{page === 'home' ? <Home sim={sim} tab={tab} onTab={onTab} /> : <Console sim={sim} tab={tab} onTab={onTab} />}</div>;
}
