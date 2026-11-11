// Variant F: Retro CRT. A beige early-80s terminal on a desk in a dark room; everything lives inside
// the phosphor glass. Home = boot sequence + block-pixel title; Generator = TUI dashboard on the real
// DEMO session with a command prompt. The ship is a phosphor wireframe "schematic" driven by real
// damage, with a PHYSICS view that swaps in the real DEMO flight scene.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset } from '../demoSkin.jsx';
import { HAZARDS, LiveShip, PART_LABEL, TimeScale, useConsole } from './variantFGH.jsx';
import './variantF.css';

const PH = { green: '#6dff8e', amber: '#ffb238' };
const W = 1056;
const H = 912;
const up = (s) => String(s).toUpperCase();

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

/* ---------- wireframe ship (real parts, damage blinks, detached parts gone) ---------- */
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
function WireShip({ sim, scale }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25;
  });
  return (
    <group rotation={[0.42, 0, 0]} scale={scale}>
      <group ref={ref} rotation={[0, Math.PI / 2 - 0.5, 0]}>
        <group position={[0, 0, 3.5]}>
          <LiveShip sim={sim} blinkDamaged />
        </group>
      </group>
    </group>
  );
}
/** Short damage / threat lines for the schematic overlay, from real state. */
function threatLines(sim) {
  const d = sim.demo;
  const out = [];
  if (d.blackHole) out.push('!! GRAVITY ANOMALY - BLACK HOLE');
  if (d.solarStorm) out.push('!! SOLAR STORM WAVE INBOUND');
  if (d.hazards.length) out.push(`!! ${d.hazards.length} HAZARD${d.hazards.length > 1 ? 'S' : ''} INBOUND`);
  const rocks = d.physics.objects.filter((o) => o.id.startsWith('rock')).length;
  if (rocks) out.push(`!! ${rocks} ROCK${rocks > 1 ? 'S' : ''} TRACKED`);
  d.physics.bonds.filter((b) => b.broken || b.health < 99.95).forEach((b) =>
    out.push(`${b.broken ? 'XX' : '--'} ${up(PART_LABEL[b.id] ?? b.id)} ${b.broken ? 'DETACHED' : `${b.health.toFixed(0)}%`}`));
  return out;
}
function Schematic({ sim, color, label = 'FIG.1  STATION SHIP / ISO', scale = 0.2, overlay = false }) {
  const lines = overlay ? threatLines(sim) : [];
  return (
    <div className="vf-schem">
      <div className="vf-schem-grid" />
      <Canvas camera={{ position: [0, 0, 10], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]} resize={{ offsetSize: true }}>
        <WireMaterial color={color} />
        <WireShip sim={sim} scale={scale} />
      </Canvas>
      <span className="vf-schem-l tl">{label}</span>
      <span className="vf-schem-l br">INTEGRITY {sim.systems[0].value}%</span>
      {lines.length > 0 && (
        <div className="vf-schem-dmg">
          {lines.slice(0, 6).map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      <span className="vf-schem-x" />
    </div>
  );
}

/** Real DEMO flight scene, phosphor-tinted, behind the CRT scanlines. */
function Physics({ sim, resetCount }) {
  const flash = sim.demo.stormFlash;
  return (
    <div className="vf-phys">
      <DemoViewport sim={sim} resetCount={resetCount}>
        <div className="vf-phys-scan" />
        {flash > 0 && <div key={flash} className="vf-phys-flash" />}
        {sim.demo.armed && <div className="vf-phys-hint">&gt; CLICK TO LAUNCH {up(sim.demo.armed)} · ESC CANCEL</div>}
      </DemoViewport>
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
  const on = Math.round((Math.max(0, Math.min(100, v)) / 100) * n);
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
function Tabs({ items, value, onChange }) {
  return (
    <div className="vf-sub">
      {items.map((k) => (
        <button key={k} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{k}</button>
      ))}
    </div>
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
            <Box title="FEATURES.TXT" right={`${HAZARDS.length} HAZARDS`}>
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
        <Box title="SCHEMATIC" right="LIVE" className="vf-home-r">
          <Schematic sim={sim} color={color} scale={0.19} />
        </Box>
      </div>
      <div className="vf-status">
        <span>
          A:\&gt; SELECT 1 OR 2<span className="vf-cur" />
        </span>
        <span>MET {sim.met} · DAY {sim.day} · {sim.status} · {up(sim.nav.origin)}-&gt;{up(sim.nav.destination)} · {sim.velocity} KM/S</span>
      </div>
    </div>
  );
}

/* ---------- shared console chrome ---------- */
function Header({ sim, tab }) {
  const ev = sim.event;
  return (
    <>
      <div className="vf-head">
        <span>
          MISSION CONSOLE // <b>{up(tab)}</b>
        </span>
        <span>
          MET {sim.met} · DAY {sim.day} · {sim.status}
        </span>
        <span className="vf-route">
          {up(sim.nav.origin)} -&gt; {up(sim.nav.destination)}
          <Bar v={sim.nav.progress * 100} n={8} />
        </span>
      </div>
      <div className={`vf-alarmline ${ev ? 'on' : ''}`}>
        {ev ? (
          <>
            <b>*** MASTER ALARM ***</b> {up(ev.name)} · SEVERITY {ev.severity}% · TYPE RESET TO CLEAR
          </>
        ) : (
          <>STATUS: {sim.nav.phase} · INTEGRITY {sim.systems[0].value}% · {sim.demo.physics.courseControl?.enabled ? 'COURSE CORRECTION ON' : 'FREE COAST'}</>
        )}
      </div>
    </>
  );
}

/* ---------- generator ---------- */
const HELP = [
  'COMMANDS:',
  '  INJECT <n|name>   e.g. INJECT 5 / INJECT ENGINE   LIST   list hazards',
  '  AIM ASTEROID|ALIEN|OFF   arm pointer launch      LAUNCH   preset rock',
  '  ROCK MASS|SPEED|RADIUS|WARN <v>   ROCK TARGET <part|cycle>',
  '  PLAY | PAUSE | RESET   SCALE <1M|200K..> | FASTER | SLOWER',
  '  BURN <+Z|-Z|+X|-X|+Y|-Y|PITCH+|YAW-..> [s]   COAST   COURSE ON|OFF',
  '  AI CHECK | AI RUN | AI ON | AI OFF     VIEW SCHEMATIC|PHYSICS',
  '  STATUS   GOTO <tab>   CLS   AMBER | GREEN',
];
const BURN_ALIAS = { '+z': 'Main +Z', z: 'Main +Z', main: 'Main +Z', '-z': 'Reverse −Z', '+x': 'Right +X', '-x': 'Left −X', '+y': 'Up +Y', '-y': 'Down −Y',
  'pitch+': 'Pitch +', 'pitch-': 'Pitch −', 'yaw+': 'Yaw +', 'yaw-': 'Yaw −', 'roll+': 'Roll +', 'roll-': 'Roll −' };

function Generator({ sim, tab, onTab, color, setPh }) {
  const c = useConsole(sim);
  const d = sim.demo;
  const p = d.physics;
  const ai = c.ai;
  const [view, setView] = useState('schematic');
  const [left, setLeft] = useState('SYS');
  const [right, setRight] = useState('HAZ');
  const [resetCount, resetView] = useViewReset();
  const [hist, setHist] = useState(['X4-DOS COMMAND INTERPRETER  -- TYPE HELP']);
  const [cmd, setCmd] = useState('');
  const input = useRef();
  const histRef = useRef();
  const out = (...lines) => setHist((h) => [...h, ...lines].slice(-60));
  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [hist]);
  // Pointer launches only work in the physics view.
  useEffect(() => {
    if (d.armed) setView('physics');
  }, [d.armed]);
  // Echo errors from controls into the terminal too.
  useEffect(() => {
    if (c.error) out(`ERROR: ${up(c.error)}`);
  }, [c.error]);

  const findHazard = (arg) => {
    const k = Number(arg);
    if (k >= 1 && k <= HAZARDS.length) return HAZARDS[k - 1];
    return arg && HAZARDS.find((h) => h.toLowerCase().includes(arg));
  };
  const hazard = (name) => {
    c.hazard(name);
    out(['Asteroid Collision', 'Alien Encounter'].includes(name)
      ? (d.armed === name ? `${up(name)} DISARMED` : `${up(name)} ARMED -- CLICK PHYSICS VIEW`)
      : `INJECTING ${up(name)} ... OK`);
  };
  const run = (raw) => {
    const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    out(`C:\\X4> ${raw}`);
    if (!s) return;
    const [verb, ...rest] = s.split(' ');
    const arg = rest.join(' ');
    if (s === 'help' || s === '?') return out(...HELP);
    if (s === 'cls') return setHist([]);
    if (['reset', 'clear', 'ack', 'reset all'].includes(s)) {
      sim.clear();
      return out('DEMO RESET. ALL SYSTEMS NOMINAL.');
    }
    if (s === 'list' || s === 'hazards' || s === 'dir')
      return out(...HAZARDS.map((h, i) => `  ${String(i + 1).padStart(2, '0')}  ${up(h)}${c.isOn(h) ? '  [ACTIVE]' : ''}`));
    if (s === 'amber' || s === 'green' || s.startsWith('phosphor')) {
      const k = s.includes('amber') ? 'amber' : 'green';
      setPh(k);
      return out(`PHOSPHOR SET TO ${up(k)}`);
    }
    if (s === 'pause' || s === 'stop') { if (d.playing) d.togglePlaying(); return out('SIMULATION PAUSED'); }
    if (s === 'play' || s === 'resume' || s === 'run') { if (!d.playing) d.togglePlaying(); return out('SIMULATION RUNNING'); }
    if (s === 'faster' || s === 'slower') { d.stepTimeScale(s === 'faster' ? 1 : -1); return out('TIME SCALE STEPPED'); }
    if (verb === 'scale') {
      const v = arg.match(/^(\d*\.?\d+)\s*([km]?)x?$/i);
      if (!v) return out(`TIME SCALE = ${sim.timeScale}  (USAGE: SCALE 1M)`);
      d.setTimeScale(Number(v[1]) * { '': 1, k: 1e3, m: 1e6 }[v[2]]);
      return out(`TIME SCALE SET TO ${up(arg)}`);
    }
    if (s === 'status' || s === 'stat') {
      return out(`MET ${sim.met} DAY ${sim.day} ${sim.nav.phase} VEL ${sim.velocity} KM/S PROP ${sim.propellantKg} KG`,
        ...sim.systems.map((x) => `  ${up(x.key).padEnd(10, '.')} ${x.value}%`));
    }
    if (verb === 'view') {
      const v = arg.startsWith('p') ? 'physics' : 'schematic';
      setView(v);
      return out(`VIEW: ${up(v)}`);
    }
    if (verb === 'aim' || verb === 'arm') {
      if (!arg || arg === 'off' || arg === 'none') { d.setArmed(null); return out('POINTER DISARMED'); }
      const name = arg.startsWith('al') ? 'Alien Encounter' : 'Asteroid Collision';
      d.setArmed(name);
      return out(`${up(name)} ARMED -- CLICK PHYSICS VIEW, ESC TO CANCEL`);
    }
    if (s === 'launch' || s === 'fire') { c.launchRock(); return out(`ROCK LAUNCHED · ${d.rockSettings.mass_kg} KG @ ${d.rockSettings.speed_m_s} M/S`); }
    if (verb === 'rock') {
      const [k, v] = rest;
      const key = { mass: 'mass_kg', speed: 'speed_m_s', radius: 'radius_m', warn: 'warning_s', warning: 'warning_s', target: 'target_id' }[k];
      if (!key || v === undefined) return out(`ROCK ${JSON.stringify(d.rockSettings).toUpperCase()}`);
      if (key === 'target_id') {
        const t = c.targets.find((x) => x.id.toLowerCase() === v || x.label.toLowerCase().includes(v));
        if (!t) return out('NO SUCH COMPONENT');
        c.setRock(key, t.id);
        return out(`ROCK TARGET = ${up(t.label)}`);
      }
      c.setRock(key, v);
      return out(`ROCK ${up(k)} = ${v}`);
    }
    if (s === 'coast' || s === 'cut') { d.coast(); return out('THRUST CUT · COASTING'); }
    if (verb === 'course') { const on = arg !== 'off'; d.courseCorrection(on); return out(`COURSE CORRECTION ${on ? 'ON' : 'OFF'}`); }
    if (verb === 'burn') {
      const [dir = '+z', secs] = rest;
      const label = BURN_ALIAS[dir];
      const b = c.burns.find((x) => x.label === label);
      if (!b) return out('USAGE: BURN +Z [SECONDS]');
      if (b.disabled) return out('BURN UNAVAILABLE (PAUSED, NO FUEL OR THRUSTER/ENGINE FAULT)');
      if (secs) c.setBurnSeconds(Number(secs));
      try { d.burn({ linear: b.linear, angular: b.angular, seconds: Number(secs) || c.burnSeconds }); } catch (e) { return out(`ERROR: ${up(e.message)}`); }
      return out(`BURN ${up(label)} ${Number(secs) || c.burnSeconds}S`);
    }
    if (verb === 'ai') {
      if (arg === 'check' || arg === 'connect') { ai.connect(); return out('CHECKING AI CONNECTION ...'); }
      if (arg === 'run' || arg === 'once') { if (ai.busy) return out('AI BUSY'); ai.run(); return out('DEMO AI CYCLE STARTED'); }
      if (arg === 'on' || arg === 'start' || arg === 'auto') { ai.start(); return out('DEMO AUTOPILOT ENABLED'); }
      if (arg === 'off' || arg === 'stop') { ai.stop(); return out('DEMO AI STOPPED'); }
      return out(`AI: ${up(c.aiState)} · ${up(c.aiConn)}`);
    }
    const go = s.match(/^(goto|cd|open) (.+)$/);
    if (go) {
      const t = TABS.find((x) => x.toLowerCase().includes(go[2]));
      if (t) return onTab(t);
      return out('PATH NOT FOUND');
    }
    const inj = s.match(/^(inject|trigger) ?(.*)$/);
    const h = findHazard(inj ? inj[2] : s);
    if (h) return hazard(h);
    return out('Bad command or file name');
  };

  const ev = sim.event;
  const bonds = [...p.bonds].sort((a, b) => a.health - b.health);
  return (
    <div className={`vf-con ${ev ? 'alarm' : ''}`}>
      <MenuBar tab={tab} onTab={onTab} />
      <Header sim={sim} tab={tab} />

      <div className="vf-grid">
        <Box title="TELEMETRY" right={left} className="vf-tbox">
          <Tabs items={['SYS', 'DMG', 'FLT', 'AGT']} value={left} onChange={setLeft} />
          <div className="vf-scroll">
            {left === 'SYS' && (
              <>
                {sim.systems.map((s) => (
                  <div key={s.key} className={`vf-sys ${s.value < 75 ? 'warn' : ''}`}>
                    <span>{up(s.key).padEnd(9, '.')}</span>
                    <Bar v={s.value} n={9} />
                  </div>
                ))}
                {Object.entries(p.systems).map(([id, st]) => (
                  <div key={id} className={`vf-kv ${st.mode !== 'online' ? 'warn' : ''}`}>
                    <span>{up(id.replaceAll('_', ' '))}</span>
                    <b>{up(st.mode)}</b>
                  </div>
                ))}
                <div className="vf-kv"><span>SOLAR GEN</span><b>{p.solarProtection ? 'ISOLATED' : 'ACTIVE'}</b></div>
              </>
            )}
            {left === 'DMG' && (
              <>
                {bonds.map((b) => (
                  <div key={b.id} className={`vf-dmg ${b.health < 99.95 ? 'warn' : ''}`}>
                    <span>{up(b.id).padEnd(10, '.')}</span>
                    <em>{b.broken ? 'DETACHED' : `${b.health.toFixed(0).padStart(3)}% ${up(b.stage).slice(0, 4)}`}</em>
                  </div>
                ))}
                {p.lastImpact && <div className="vf-note2">LAST HIT {up(p.lastImpact.part)} {p.lastImpact.impulseNs.toFixed(0)} N·S {(p.lastImpact.utilization * 100).toFixed(0)}%</div>}
                <h4>-- REPAIRS --</h4>
                {!p.repairs.length && <div className="vf-dim">NONE ACTIVE</div>}
                {p.repairs.map((j) => (
                  <div key={j.arm_id} className="vf-dim">{j.rebuild ? 'REBUILD' : 'REPAIR'} {up(j.arm_id)}-&gt;{up(j.part_id)} {j.contactSeconds.toFixed(1)}/10S</div>
                ))}
              </>
            )}
            {left === 'FLT' && (
              <div className="vf-tel">
                <span>VEL</span><b>{sim.velocity} KM/S</b>
                <span>PROP</span><b>{sim.propellantKg} KG</b>
                <span>MASS</span><b>{sim.massKg} KG</b>
                <span>ATT</span><b>{sim.attitude}</b>
                <span>OMEGA</span><b>{sim.angular} R/S</b>
                <span>THRUST</span><b>{p.forceN.toFixed(0)} N</b>
                <span>MODE</span><b>{up(p.mode)}</b>
                <span>DEV</span><b>{p.deviationM.toFixed(1)} M</b>
                <span>DELTA-V</span><b>{p.deltaV.toFixed(2)} M/S</b>
                <span>DATE</span><b>{d.celestialDate.slice(0, 10)}</b>
                <span>ETA</span><b>{sim.nav.etaDays == null ? 'REPAIR REQ' : `${sim.nav.etaDays.toFixed(1)} D`}</b>
                <span>OBJECTS</span><b>{p.objects.length}</b>
                {p.objects.slice(0, 5).map((o) => (
                  <span key={o.id} className="vf-obj">{up(o.id)} {o.distanceM.toFixed(0)}M {o.closingM_s > 0 ? '+' : ''}{o.closingM_s.toFixed(1)}M/S</span>
                ))}
              </div>
            )}
            {left === 'AGT' && (
              <>
                {sim.agents.map((a) => (
                  <div key={a.id} className={`vf-agent ${a.ok ? '' : 'warn'}`}>
                    <span>{a.ok ? '[+]' : '[!]'} {up(a.name)}</span>
                    <em>{up(a.state)}</em>
                  </div>
                ))}
                {ai.latest && <div className="vf-note2">LAST: {up(ai.latest.summary ?? '')}</div>}
              </>
            )}
          </div>
        </Box>

        <Box title={view === 'schematic' ? 'SCHEMATIC' : 'PHYSICS'} className="vf-view">
          <div className="vf-viewtog" role="group" aria-label="View">
            <button className={view === 'schematic' ? 'on' : ''} onClick={() => setView('schematic')}>SCHEMATIC</button>
            <span>/</span>
            <button className={view === 'physics' ? 'on' : ''} onClick={() => setView('physics')}>PHYSICS</button>
          </div>
          <div className="vf-viewbody">
            {view === 'schematic'
              ? <Schematic sim={sim} color={color} scale={0.15} label="FIG.2  X4 STATION / LIVE" overlay />
              : <Physics sim={sim} resetCount={resetCount} />}
          </div>
          <div className="vf-transport">
            <button onClick={d.togglePlaying}>[{d.playing ? 'PAUSE' : 'PLAY '}]</button>
            <button onClick={sim.clear}>[RESET]</button>
            <TimeScale sim={sim} className="vf-scale" minus="<" plus=">" />
            <button onClick={() => { resetView(); setView('physics'); }}>[VIEW]</button>
          </div>
        </Box>

        <Box title="CONTROL" right={right} className="vf-cbox">
          <Tabs items={['HAZ', 'ROCK', 'PROP', 'AI']} value={right} onChange={setRight} />
          <div className="vf-scroll">
            {right === 'HAZ' && (
              <div className="vf-haz">
                <h4>-- OUTER SPACE --</h4>
                {OUTER.map((h, i) => (
                  <button key={h} className={c.isOn(h) ? 'on' : ''} onClick={() => hazard(h)}>
                    <b>{String(i + 1).padStart(2, '0')}</b> {up(h)}
                  </button>
                ))}
                <h4>-- INNER SPACECRAFT --</h4>
                {INNER.map((h, i) => (
                  <button key={h} className={c.isOn(h) ? 'on' : ''} onClick={() => hazard(h)}>
                    <b>{String(i + 1 + OUTER.length).padStart(2, '0')}</b> {up(h)}
                  </button>
                ))}
                <p className="vf-dim">{up(c.armedHint)}</p>
              </div>
            )}
            {right === 'ROCK' && (
              <div className="vf-form">
                <label>TARGET
                  <select value={d.rockSettings.target_id} onChange={(e) => c.setRock('target_id', e.target.value)}>
                    {c.targets.map((t) => <option key={t.id} value={t.id}>{up(t.label)}{p.detached.includes(t.id) ? ' (WRECK)' : ''}</option>)}
                  </select>
                </label>
                {[['mass_kg', 'MASS KG', 1, 5000, 1], ['speed_m_s', 'SPEED M/S', 1, 150, 1], ['radius_m', 'RADIUS M', 0.15, 2, 0.05], ['warning_s', 'WARN S', 2, 120, 1]].map(([k, l, min, max, step]) => (
                  <label key={k}>{l}
                    <input type="number" min={min} max={max} step={step} value={d.rockSettings[k]} onChange={(e) => c.setRock(k, e.target.value)} />
                  </label>
                ))}
                <button className="vf-act" onClick={c.launchRock}>&gt; LAUNCH ROCK</button>
                <button className={`vf-act ${d.armed === 'Asteroid Collision' ? 'on' : ''}`} onClick={() => c.hazard('Asteroid Collision')}>
                  &gt; {d.armed === 'Asteroid Collision' ? 'CANCEL AIM' : 'AIM WITH POINTER'}
                </button>
                <p className="vf-dim">200 KG @ 40 M/S LEAVES REPAIRABLE DAMAGE. 5000 KG @ 150 M/S BREAKS ASSEMBLIES.</p>
              </div>
            )}
            {right === 'PROP' && (
              <div className="vf-form">
                <label>BURN S
                  <input type="number" min=".1" max="10" step=".1" value={c.burnSeconds} onChange={(e) => c.setBurnSeconds(Number(e.target.value))} />
                </label>
                <div className="vf-burns">
                  {c.burns.map((b) => (
                    <button key={b.label} disabled={b.disabled} onClick={() => c.burn(b)}>{up(b.label)}</button>
                  ))}
                </div>
                <button className="vf-act" onClick={d.coast}>&gt; CUT THRUST · COAST</button>
                <button className={`vf-act ${c.courseOn ? 'on' : ''}`} onClick={c.toggleCourse}>&gt; COURSE CORR {c.courseOn ? 'ON' : 'OFF'}</button>
                {p.courseControl && <p className="vf-dim">AUTO {up(p.courseControl.mode)}{p.courseControl.reason ? ` · ${up(p.courseControl.reason)}` : ''}</p>}
              </div>
            )}
            {right === 'AI' && (
              <div className="vf-form">
                <div className="vf-kv"><span>LINK</span><b>{up(c.aiConn)}</b></div>
                <button className="vf-act" disabled={ai.checking} onClick={ai.connect}>&gt; {ai.checking ? 'CHECKING ...' : 'CHECK CONNECTION'}</button>
                <button className="vf-act" disabled={ai.busy || !ai.running} onClick={ai.run}>&gt; RUN AI ONCE</button>
                <button className={`vf-act ${ai.enabled ? 'on' : ''}`} onClick={c.aiToggle}>&gt; {ai.enabled || ai.busy ? 'STOP DEMO AI' : 'ENABLE AUTOPILOT'}</button>
                <p className="vf-dim">{up(c.aiState)}</p>
                {ai.service && <p className="vf-dim">GATEWAY {ai.service.verified ? 'VERIFIED' : 'NOT VERIFIED'}</p>}
                {ai.error && <p className="vf-err">{up(ai.error)}</p>}
                {ai.latest && <p className="vf-dim">JUDGING: {ai.latest.executed} ACTIONS · {up(ai.latest.summary ?? '')}</p>}
              </div>
            )}
            {c.error && <p className="vf-err">{up(c.error)}</p>}
          </div>
        </Box>
      </div>

      <div className="vf-bottom">
        <Box title="EVENT LOG" right={`${sim.logs.length} ENTRIES`} className="vf-log">
          <div className="vf-scroll">
            {sim.logs.map((l) => (
              <div key={l.id} className={l.alert ? 'alert' : ''}>
                {l.time} {up(l.text)}
              </div>
            ))}
          </div>
        </Box>
        <Box title="TERMINAL" className="vf-term">
          <div className="vf-hist" ref={histRef} onClick={() => input.current?.focus()}>
            {hist.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <form
            className="vf-prompt"
            onClick={() => input.current?.focus()}
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

/* ---------- other tabs: real pages inside the glass ---------- */
function Page({ sim, tab, onTab, children, aside }) {
  return (
    <div className="vf-con">
      <MenuBar tab={tab} onTab={onTab} />
      <Header sim={sim} tab={tab} />
      <div className={`vf-page ${aside ? 'with-aside' : ''}`}>
        <Box title={up(tab)} className="vf-pagebox">
          <div className="vf-embed">{children}</div>
        </Box>
        {aside}
      </div>
    </div>
  );
}
function MissionInfo({ sim }) {
  const d = sim.demo;
  const n = d.navigation;
  return (
    <Box title="MISSION" right={sim.nav.inOrbit ? 'ORBIT' : 'CRUISE'} className="vf-mission">
      <div className="vf-scroll">
        <div className="vf-kv"><span>ORIGIN</span><b>{up(sim.nav.origin)}</b></div>
        <div className="vf-kv"><span>DEST</span><b>{up(sim.nav.destination)}</b></div>
        <div className="vf-kv"><span>PHASE</span><b>{sim.nav.phase}</b></div>
        <div className="vf-sys"><span>LEG</span><Bar v={sim.nav.progress * 100} n={9} /></div>
        <div className="vf-kv"><span>ETA</span><b>{sim.nav.etaDays == null ? 'REPAIR REQ' : `${sim.nav.etaDays.toFixed(1)} D`}</b></div>
        <div className="vf-kv"><span>DAY</span><b>{sim.day}</b></div>
        <div className="vf-kv"><span>DATE UTC</span><b>{d.celestialDate.slice(0, 10)}</b></div>
        <div className="vf-kv"><span>VEL</span><b>{sim.velocity} KM/S</b></div>
        <div className="vf-kv"><span>ROUTE ERR</span><b>{n.route_error_map_units.toFixed(3)}</b></div>
        <div className="vf-kv"><span>TGT ORBIT V</span><b>{n.target_orbital_speed_km_s.toFixed(2)}</b></div>
        <div className="vf-transport">
          <button onClick={d.togglePlaying}>[{d.playing ? 'PAUSE' : 'PLAY '}]</button>
          <TimeScale sim={sim} className="vf-scale" minus="<" plus=">" />
        </div>
        <p className="vf-dim">{up(sim.session.mapInfo)}</p>
      </div>
    </Box>
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
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === '1') onTab('Generator');
      if (e.key === '2') setView((v) => (v === 'readme' ? 'features' : 'readme'));
      if (e.key === 'Escape') setView('readme');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, booted, onTab]);

  const top = 14;
  const desk = top + (H - 26) * s;
  const alert = sim.event || sim.demo.blackHole || sim.demo.hazards.length > 0;

  let screen = null;
  if (power) {
    if (page === 'home') screen = booted ? <Home sim={sim} tab={tab} onTab={onTab} color={color} view={view} setView={setView} /> : <Boot onDone={() => setBooted(true)} />;
    else if (tab === 'Generator') screen = <Generator sim={sim} tab={tab} onTab={onTab} color={color} setPh={setPh} />;
    else if (tab === 'Planetary Trajectories') screen = <Page sim={sim} tab={tab} onTab={onTab} aside={<MissionInfo sim={sim} />}><div className="vf-tint"><TrajectoriesView sim={sim} /></div></Page>;
    else if (tab === 'AI Logs') screen = <Page sim={sim} tab={tab} onTab={onTab}><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Page>;
    else if (tab === 'AI API') screen = <Page sim={sim} tab={tab} onTab={onTab}><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></Page>;
    else if (tab === 'Spacecraft') screen = <Page sim={sim} tab={tab} onTab={onTab}><div className="vf-tint vf-craft"><SpacecraftView sim={sim} /></div></Page>;
  }

  return (
    <div className={`vf vf-${ph} ${alert ? 'vf-alert' : ''} ${power ? '' : 'vf-off'}`} style={{ '--desk': `${desk}px` }}>
      <div className="vf-wall" />
      <div className="vf-lamp" />
      <div className="vf-desk" />
      <div className="vf-stage" style={{ top, transform: `translateX(-50%) scale(${s})` }}>
        <div className="vf-monitor">
          <div className="vf-case">
            <div className="vf-seam" />
            <div className="vf-recess">
              <div className="vf-glass">
                <div className="vf-screen">{screen}</div>
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
                <i className={`vf-led act ${alert && power ? 'on' : ''}`} />
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
