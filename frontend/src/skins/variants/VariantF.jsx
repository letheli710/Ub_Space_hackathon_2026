// PROTOTYPE — Variant F: Retro CRT. A beige early-80s terminal on a desk in a dark room; everything lives
// inside the phosphor glass. Home = boot sequence + block-pixel title; Console = TUI dashboard with a
// command prompt. The ship is drawn as a phosphor wireframe "schematic" (scene.overrideMaterial).
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import StationShip from '../../components/station/StationShip.jsx';
import { FEATURES, INNER, LEAD, OUTER, TABS, TAGLINE, logo } from '../shipCanvas.jsx';
import './variantF.css';

const HAZARDS = [...OUTER, ...INNER];
const PH = { green: '#6dff8e', amber: '#ffb238' };
const W = 1056;
const H = 912;

/* ---------- block-pixel title font (5 rows) ---------- */
const GLYPHS = {
  I: ['###', '.#.', '.#.', '.#.', '###'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  E: ['####', '#...', '###.', '#...', '####'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '###.'],
  L: ['#...', '#...', '#...', '#...', '####'],
  A: ['.##.', '#..#', '####', '#..#', '#..#'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '^': ['#.#', '###', '..#', '...', '...'],
  ' ': ['..', '..', '..', '..', '..'],
};
function BlockTitle({ text = 'INTERSTELLAR X^' }) {
  const rows = [0, 1, 2, 3, 4].map((r) => text.split('').map((c) => GLYPHS[c][r]).join('.'));
  const cols = rows[0].length;
  return (
    <div className="vf-block" style={{ gridTemplateColumns: `repeat(${cols}, var(--px))` }} aria-label="Interstellar X4">
      {rows.flatMap((row, r) => row.split('').map((c, i) => <i key={`${r}-${i}`} className={c === '#' ? 'on' : ''} />))}
    </div>
  );
}

/* ---------- wireframe ship ---------- */
function WireMaterial({ color }) {
  const { scene } = useThree();
  useEffect(() => {
    const m = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.42 });
    const prev = scene.overrideMaterial;
    scene.overrideMaterial = m;
    return () => {
      scene.overrideMaterial = prev;
      m.dispose();
    };
  }, [scene, color]);
  return null;
}
function WireShip({ event, scale }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25;
  });
  return (
    <group rotation={[0.42, 0, 0]} scale={scale}>
      <group ref={ref} rotation={[0, Math.PI / 2 - 0.5, 0]}>
        <group position={[0, 0, 3.5]}>
          <StationShip event={event} />
        </group>
      </group>
    </group>
  );
}
function Schematic({ event, color, label = 'FIG.1  STATION SHIP / ISO', scale = 0.2 }) {
  return (
    <div className="vf-schem">
      <div className="vf-schem-grid" />
      <Canvas camera={{ position: [0, 0, 10], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]} resize={{ offsetSize: true }}>
        <WireMaterial color={color} />
        <WireShip event={event} scale={scale} />
      </Canvas>
      <span className="vf-schem-l tl">{label}</span>
      <span className="vf-schem-l br">L=38.0u  RING=21.0u</span>
      <span className="vf-schem-x" />
    </div>
  );
}

/* ---------- TUI pieces ---------- */
function Box({ title, className = '', children, right }) {
  return (
    <section className={`vf-box ${className}`}>
      <h3>
        <span>{title}</span>
        {right && <em>{right}</em>}
      </h3>
      {children}
    </section>
  );
}
function Bar({ v, n = 16 }) {
  const on = Math.round((v / 100) * n);
  return (
    <span className="vf-bar">
      [{Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}]
      <b>{String(Math.round(v)).padStart(3, '0')}%</b>
    </span>
  );
}
function MenuBar({ tab, onTab }) {
  return (
    <nav className="vf-menu">
      {TABS.map((t, i) => (
        <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>
          <b>F{i + 1}</b>
          {t === 'Planetary Trajectories' ? 'Trajectories' : t}
        </button>
      ))}
      <span className="vf-menu-r">X4-DOS 1.0</span>
    </nav>
  );
}

/* ---------- boot ---------- */
const BOOT = [
  'X4 BIOS v1.04   (C) 1983 DEEP SPACE INSTRUMENTS',
  'CPU ............ X4/86 @ 4.77 MHz',
  'MEMORY TEST .... 640K OK',
  'NAV-ROM ........ EARTH -> MARS EPHEMERIS LOADED',
  'PHYSICS KERNEL . FREE-FLIGHT + COURSE CORRECTION OK',
  'AI CORE ........ MAIN JUDGING / PROPELLING / ENERGY / ROBOT ARMS OK',
  'GAZEBO LINK .... NOT FOUND -- DEMO MODE',
  '',
  'BOOTING INTERSTELLAR X4 MISSION SYSTEM ...',
];
function Boot({ onDone }) {
  const [n, setN] = useState(0);
  const total = useMemo(() => BOOT.reduce((a, l) => a + l.length + 6, 0), []);
  useEffect(() => {
    if (n >= total) {
      const id = setTimeout(onDone, 700);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setN((v) => v + 3), 14);
    return () => clearTimeout(id);
  }, [n, total, onDone]);
  let left = n;
  const shown = [];
  for (const l of BOOT) {
    if (left <= 0) break;
    shown.push(l.slice(0, left));
    left -= l.length + 6;
  }
  return (
    <div className="vf-boot" onClick={onDone}>
      {shown.map((l, i) => (
        <div key={i}>
          {l}
          {i === shown.length - 1 && <span className="vf-cur" />}
        </div>
      ))}
      <div className="vf-boot-skip">PRESS ANY KEY TO SKIP</div>
    </div>
  );
}

/* ---------- home ---------- */
function Home({ sim, tab, onTab, color, view, setView }) {
  return (
    <div className="vf-home">
      <MenuBar tab={tab} onTab={onTab} />
      <div className="vf-title">
        <BlockTitle />
        <div className="vf-tag">
          <i />
          {TAGLINE.toUpperCase()}
          <i />
        </div>
      </div>
      <div className="vf-home-grid">
        <div className="vf-home-l">
          {view === 'readme' ? (
            <Box title="README.TXT" right="1 / 1">
              <p className="vf-lead">{LEAD}</p>
              <ul className="vf-feat">
                {FEATURES.map((f) => (
                  <li key={f}>* {f}</li>
                ))}
              </ul>
            </Box>
          ) : (
            <Box title="FEATURES.TXT" right="11 HAZARDS">
              <ul className="vf-feat">
                {FEATURES.map((f, i) => (
                  <li key={f}>
                    {i + 1}. {f}
                  </li>
                ))}
              </ul>
              <div className="vf-cat">
                <div>
                  <h4>OUTER SPACE</h4>
                  {OUTER.map((h) => (
                    <div key={h}>- {h}</div>
                  ))}
                </div>
                <div>
                  <h4>INNER SPACECRAFT</h4>
                  {INNER.map((h) => (
                    <div key={h}>- {h}</div>
                  ))}
                </div>
              </div>
            </Box>
          )}
          <div className="vf-choices">
            <button onClick={() => onTab('Generator')}>
              <b>[1]</b> LAUNCH SIMULATOR
            </button>
            <button onClick={() => setView(view === 'readme' ? 'features' : 'readme')}>
              <b>[2]</b> {view === 'readme' ? 'EXPLORE FEATURES' : 'BACK TO README'}
            </button>
          </div>
        </div>
        <Box title="SCHEMATIC" right="WIREFRAME" className="vf-home-r">
          <Schematic event={sim.event} color={color} scale={0.19} />
        </Box>
      </div>
      <div className="vf-status">
        <span>
          A:\&gt; SELECT 1 OR 2<span className="vf-cur" />
        </span>
        <span>MET {sim.met} · DAY {sim.day} · DEMO MODE · F1-F6 MENU</span>
      </div>
    </div>
  );
}

/* ---------- console ---------- */
const HELP = [
  'COMMANDS:',
  '  INJECT <n|name>  inject hazard, e.g. INJECT 3 / INJECT SOLAR STORM',
  '  LIST             list hazards      RESET   clear alarm',
  '  GOTO <tab>       e.g. GOTO HOME    CLS     clear screen',
  '  AMBER | GREEN    change phosphor',
];
function Console({ sim, tab, onTab, color, setPh }) {
  const [hist, setHist] = useState(['X4-DOS COMMAND INTERPRETER  -- TYPE HELP']);
  const [cmd, setCmd] = useState('');
  const input = useRef();
  const out = (...lines) => setHist((h) => [...h, ...lines].slice(-40));
  const histRef = useRef();
  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [hist]);

  const inject = (name) => {
    sim.trigger(name);
    out(`INJECTING ${name.toUpperCase()} ... OK`);
  };
  const findHazard = (arg) => {
    const k = Number(arg);
    if (k >= 1 && k <= HAZARDS.length) return HAZARDS[k - 1];
    return arg && HAZARDS.find((h) => h.toLowerCase().includes(arg));
  };
  const run = (raw) => {
    const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    out(`C:\\X4> ${raw}`);
    if (!s) return;
    if (s === 'help' || s === '?') return out(...HELP);
    if (s === 'cls') return setHist([]);
    if (['reset', 'clear', 'ack', 'reset all'].includes(s)) {
      sim.clear();
      return out('ALARM CLEARED. ALL SYSTEMS NOMINAL.');
    }
    if (s === 'list' || s === 'hazards' || s === 'dir')
      return out(...HAZARDS.map((h, i) => `  ${String(i + 1).padStart(2, '0')}  ${h.toUpperCase()}`));
    if (s === 'amber' || s === 'green' || s.startsWith('phosphor')) {
      const c = s.includes('amber') ? 'amber' : 'green';
      setPh(c);
      return out(`PHOSPHOR SET TO ${c.toUpperCase()}`);
    }
    const go = s.match(/^(goto|cd|open) (.+)$/);
    if (go) {
      const t = TABS.find((x) => x.toLowerCase().includes(go[2]));
      if (t) return onTab(t);
      return out('PATH NOT FOUND');
    }
    const inj = s.match(/^(inject|run|trigger) ?(.*)$/);
    const h = findHazard(inj ? inj[2] : s);
    if (h) return inject(h);
    return out('Bad command or file name');
  };

  const ev = sim.event;
  return (
    <div className={`vf-con ${ev ? 'alarm' : ''}`} onClick={() => input.current?.focus()}>
      <MenuBar tab={tab} onTab={onTab} />
      <div className="vf-head">
        <span>
          MISSION CONSOLE // <b>{tab.toUpperCase()}</b>
        </span>
        <span>
          MET {sim.met} · DAY {sim.day}
        </span>
        <span className="vf-route">
          {sim.nav.origin.toUpperCase()} -&gt; {sim.nav.destination.toUpperCase()} [{sim.nav.phase}]
          <Bar v={sim.nav.progress * 100} n={10} />
        </span>
      </div>
      <div className={`vf-alarmline ${ev ? 'on' : ''}`}>
        {ev ? (
          <>
            <b>*** MASTER ALARM ***</b> {ev.name.toUpperCase()} · SEVERITY {ev.severity}% · TYPE RESET TO CLEAR
          </>
        ) : (
          <>STATUS: ALL SYSTEMS NOMINAL · AUTONOMOUS COURSE CORRECTION ACTIVE</>
        )}
      </div>

      <div className="vf-grid">
        <div className="vf-col">
          <Box title="SYSTEMS" right={ev ? 'DEGRADED' : 'OK'}>
            {sim.systems.map((s) => (
              <div key={s.key} className={`vf-sys ${s.value < 75 ? 'warn' : ''}`}>
                <span>{s.key.toUpperCase().padEnd(9, '.')}</span>
                <Bar v={s.value} n={12} />
              </div>
            ))}
          </Box>
          <Box title="AI AGENTS" right="4 ONLINE">
            {sim.agents.map((a) => (
              <div key={a.name} className={`vf-agent ${a.ok ? '' : 'warn'}`}>
                <span>{a.ok ? '[+]' : '[!]'} {a.name.toUpperCase()}</span>
                <em>{a.state.toUpperCase()}</em>
              </div>
            ))}
          </Box>
        </div>

        <div className="vf-col">
          <Box title="SCHEMATIC" right={ev ? 'DAMAGE SCAN' : 'LIVE'} className="vf-schem-box">
            <Schematic event={ev} color={color} scale={0.17} label="FIG.2  X4 STATION / LIVE" />
          </Box>
          <Box title="TELEMETRY">
            <div className="vf-tel">
              <span>VEL</span>
              <b>{sim.velocity} KM/S</b>
              <span>PROP</span>
              <b>{sim.propellantKg} KG</b>
              <span>MASS</span>
              <b>{sim.massKg} KG</b>
              <span>ATT</span>
              <b>{sim.attitude}</b>
              <span>OMEGA</span>
              <b>{sim.angular} R/S</b>
              <span>TIME</span>
              <b>x{sim.timeScale}</b>
            </div>
          </Box>
        </div>

        <Box title="HAZARD INJECT" right="TYPE NO." className="vf-haz">
          <h4>-- OUTER SPACE --</h4>
          {OUTER.map((h, i) => (
            <button key={h} className={ev?.name === h ? 'on' : ''} onClick={() => inject(h)}>
              <b>{String(i + 1).padStart(2, '0')}</b> {h.toUpperCase()}
            </button>
          ))}
          <h4>-- INNER SPACECRAFT --</h4>
          {INNER.map((h, i) => (
            <button key={h} className={ev?.name === h ? 'on' : ''} onClick={() => inject(h)}>
              <b>{String(i + 1 + OUTER.length).padStart(2, '0')}</b> {h.toUpperCase()}
            </button>
          ))}
          <button className="vf-reset" onClick={() => run('reset')}>
            <b>R</b> RESET ALL SYSTEMS
          </button>
        </Box>
      </div>

      <div className="vf-bottom">
        <Box title="EVENT LOG" right={`${sim.logs.length} ENTRIES`} className="vf-log">
          {sim.logs.map((l, i) => (
            <div key={`${l.t}-${i}`} className={l.alert ? 'alert' : ''}>
              {l.alert ? '!!' : '..'} {l.text.toUpperCase()}
            </div>
          ))}
        </Box>
        <Box title="TERMINAL" className="vf-term">
          <div className="vf-hist" ref={histRef}>
            {hist.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <form
            className="vf-prompt"
            onSubmit={(e) => {
              e.preventDefault();
              run(cmd);
              setCmd('');
            }}
          >
            <span>C:\X4&gt;</span>
            <span className="vf-in">
              <span className="vf-mirror">{cmd}</span>
              <span className="vf-cur" />
              <input ref={input} value={cmd} onChange={(e) => setCmd(e.target.value)} autoFocus spellCheck={false} aria-label="Command" />
            </span>
          </form>
        </Box>
      </div>
    </div>
  );
}

/* ---------- monitor hardware ---------- */
function useFit() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const f = () => setS(Math.min((window.innerWidth - 40) / W, (window.innerHeight - 100) / H, 1.2));
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return s;
}

export default function VariantF({ page, tab, onTab, sim }) {
  const s = useFit();
  const [ph, setPh] = useState('green');
  const [booted, setBooted] = useState(false);
  const [view, setView] = useState('readme');
  const [power, setPower] = useState(true);
  const color = PH[ph];

  useEffect(() => {
    const onKey = (e) => {
      const m = /^F([1-6])$/.exec(e.key);
      if (m) {
        e.preventDefault();
        onTab(TABS[Number(m[1]) - 1]);
        return;
      }
      if (page !== 'home') return;
      if (!booted) return setBooted(true);
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === '1') onTab('Generator');
      if (e.key === '2') setView((v) => (v === 'readme' ? 'features' : 'readme'));
      if (e.key === 'Escape') setView('readme');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, booted, onTab]);

  const top = 14;
  const desk = top + (H - 26) * s;

  return (
    <div className={`vf vf-${ph} ${sim.event ? 'vf-alert' : ''} ${power ? '' : 'vf-off'}`} style={{ '--desk': `${desk}px` }}>
      <div className="vf-wall" />
      <div className="vf-lamp" />
      <div className="vf-desk" />
      <div className="vf-stage" style={{ top, transform: `translateX(-50%) scale(${s})` }}>
        <div className="vf-monitor">
          <div className="vf-case">
            <div className="vf-seam" />
            <div className="vf-recess">
              <div className="vf-glass">
                <div className="vf-screen">
                  {power &&
                    (page === 'home' ? (
                      booted ? (
                        <Home sim={sim} tab={tab} onTab={onTab} color={color} view={view} setView={setView} />
                      ) : (
                        <Boot onDone={() => setBooted(true)} />
                      )
                    ) : (
                      <Console sim={sim} tab={tab} onTab={onTab} color={color} setPh={setPh} />
                    ))}
                </div>
                <div className="vf-scan" />
                <div className="vf-roll" />
                <div className="vf-vig" />
                <div className="vf-glare" />
              </div>
            </div>
            <div className="vf-note">
              type HELP
              <br />
              in console!
            </div>
          </div>
          <div className="vf-chin">
            <div className="vf-badge">
              <img src={logo} alt="" />
              <span>
                INTERSTELLAR X<sup>4</sup>
              </span>
            </div>
            <div className="vf-grille">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <div className="vf-plate">
              <b>MODEL X4-1983</b>
              <span>MISSION TERMINAL · 12" P1/P3</span>
            </div>
            <div className="vf-controls">
              <div className="vf-knob" title="Brightness">
                <i />
                <small>BRIGHT</small>
              </div>
              <div className="vf-knob" title="Contrast">
                <i style={{ transform: 'rotate(40deg)' }} />
                <small>CONTR</small>
              </div>
              <button className="vf-switch" onClick={() => setPh(ph === 'green' ? 'amber' : 'green')} title="Phosphor">
                <i className={ph} />
                <small>G · PHOS · A</small>
              </button>
              <div className="vf-leds">
                <i className={`vf-led pwr ${power ? 'on' : ''}`} />
                <i className={`vf-led act ${sim.event && power ? 'on' : ''}`} />
              </div>
              <button className="vf-power" onClick={() => {
                  if (!power) setBooted(false);
                  setPower(!power);
                }} title="Power">
                <i />
                <small>POWER</small>
              </button>
            </div>
          </div>
        </div>
        <div className="vf-neck" />
        <div className="vf-base" />
      </div>
    </div>
  );
}
