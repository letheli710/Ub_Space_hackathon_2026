// PROTOTYPE — throwaway. Variant I "Incident File · 事故档案": a mission-incident dossier on a desk.
import { useRef } from 'react';
import { ShipCanvas, logo, TABS, OUTER, INNER, FEATURES, TAGLINE, LEAD } from '../shipCanvas.jsx';
import './variantI.css';

const NOMINAL = { Structure: 100, Solar: 100, Fuel: 87, Power: 92, Drive: 100, Energy: 96 };
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
                <span>CASE NO. <b>X4-2026-0{sim.day}</b></span>
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
              <div className="vi-hand vi-note">reviewed — AI recovery looks promising ✓</div>
            </div>
          </section>

          <section className="vi-cover-right">
            <figure className="vi-polaroid">
              <div className="vi-tape vi-tape-a" />
              <div className="vi-photo">
                <ShipCanvas event={sim.event} lights="cool" scale={0.14} />
                <div className="vi-photo-stamp">EXHIBIT A · {sim.met}</div>
              </div>
              <figcaption className="vi-hand">Vessel X⁴ — last transmitted image, day {sim.day}</figcaption>
            </figure>
            <div className="vi-sticker">
              <div className="vi-tape vi-tape-b" />
              <img src={logo} alt="Interstellar X⁴ logo" />
            </div>
            <div className="vi-routing">
              <div><span>ROUTE</span>{sim.nav.origin} → {sim.nav.destination}</div>
              <div><span>PHASE</span>{sim.nav.phase}</div>
              <div><span>STATUS</span>{sim.event ? 'INCIDENT OPEN' : 'UNDER REVIEW'}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Console({ sim, tab, onTab }) {
  const ev = sim.event;
  // Remember the MET at which each log entry first appeared (initial entries = departure).
  const stamps = useRef(new WeakMap()).current;
  for (const l of sim.logs) if (!stamps.has(l)) stamps.set(l, l.t === 0 ? '00:00:00' : sim.met);
  const pct = Math.min(100, sim.nav.progress * 100);
  return (
    <div className={`vi-desk vi-desk-console ${ev ? 'alert' : ''}`}>
      <div className="vi-ring vi-ring-console" aria-hidden="true" />
      <div className="vi-folder vi-open">
        <Tabs tab={tab} onTab={onTab} />
        <div className="vi-open-grid">
          {/* LEFT — incident report form */}
          <section className="vi-page vi-form">
            <header className="vi-form-head">
              <small>{ISSUER}</small>
              <h2>INCIDENT REPORT FORM</h2>
              <div className="vi-fields">
                <span>CASE <b>X4-0{sim.day}</b></span>
                <span>DAY <b>{sim.day}</b></span>
                <span>FILED BY <b className="vi-hand-inline">Ops desk</b></span>
              </div>
            </header>
            <fieldset>
              <legend>A · EXTERNAL HAZARDS</legend>
              {OUTER.map((h) => (
                <button key={h} className={`vi-hz ${ev?.name === h ? 'on' : ''}`} onClick={() => sim.trigger(h)}>
                  <span className="vi-box">{ev?.name === h && <Check />}</span>
                  {h}
                </button>
              ))}
            </fieldset>
            <fieldset>
              <legend>B · INTERNAL HAZARDS</legend>
              {INNER.map((h) => (
                <button key={h} className={`vi-hz ${ev?.name === h ? 'on' : ''}`} onClick={() => sim.trigger(h)}>
                  <span className="vi-box">{ev?.name === h && <Check />}</span>
                  {h}
                </button>
              ))}
            </fieldset>
            <div className="vi-sev">
              <span>C · SEVERITY</span>
              <div className="vi-sev-line">
                {ev ? <b className="vi-hand-inline red">{ev.severity}%</b> : <i>— none —</i>}
              </div>
              <div className="vi-sev-bar"><i style={{ width: `${ev ? ev.severity : 0}%` }} /></div>
            </div>
            <button className={`vi-close ${ev ? 'live' : ''}`} onClick={sim.clear} title="Reset simulation (close the active incident)">
              CLOSE CASE
            </button>
          </section>

          {/* CENTER — surveillance print */}
          <section className="vi-center">
            <div className="vi-print">
              <div className="vi-clip vi-clip-print" aria-hidden="true" />
              <div className="vi-monitor">
                <ShipCanvas event={ev} lights="cool" scale={0.22} />
                <div className="vi-scan" aria-hidden="true" />
                <div className="vi-osd tl">CAM-03 · EXT · REC ●</div>
                <div className="vi-osd tr">MET {sim.met}</div>
                <div className="vi-osd bl">DAY {String(sim.day).padStart(3, '0')} · ×{sim.timeScale}</div>
                <div className="vi-osd br">{ev ? `EVENT: ${ev.name.toUpperCase()}` : 'NO ANOMALY'}</div>
                <div className="vi-crosshair" aria-hidden="true" />
              </div>
              <div className="vi-print-cap">
                <span>FIG. 1 — Surveillance still, {sim.nav.origin} → {sim.nav.destination} transfer</span>
                <span className="vi-hand-inline">{ev ? 'see damage — port wing?' : 'nominal attitude'}</span>
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
                  const hit = s.value < NOMINAL[s.key];
                  return (
                    <tr key={s.key} className={hit ? 'hit' : ''}>
                      <td>{s.label}</td>
                      <td><Circled on={hit}>{s.value}%</Circled></td>
                      <td>{NOMINAL[s.key]}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3>EXHIBIT C · WITNESS STATEMENTS</h3>
            <div className="vi-witness">
              {sim.agents.map((a) => (
                <div key={a.name} className={`vi-wit ${a.ok ? '' : 'bad'}`}>
                  <b>{a.name} agent:</b> “{a.state}.”
                  <span className="vi-hand-inline">{a.ok ? 'credible' : 'under strain!'}</span>
                </div>
              ))}
            </div>

            <h3>EXHIBIT D · TIMELINE</h3>
            <ol className="vi-log">
              {sim.logs.slice(0, 7).map((l, i) => (
                <li key={`${l.t}-${l.text}`} className={`${l.alert ? 'alert' : ''} ${i === 0 ? 'newest' : ''}`}>
                  <span>{stamps.get(l)}</span>
                  {l.text}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function VariantI({ page, tab, onTab, sim }) {
  return <div className="vi">{page === 'home' ? <Home sim={sim} tab={tab} onTab={onTab} /> : <Console sim={sim} tab={tab} onTab={onTab} />}</div>;
}
