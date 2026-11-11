// Variant G "Comic · 漫画分镜": the product as a retro-futurist graphic-novel page, running on the real
// DEMO session. The toon/ink ship is drawn from real parts (damage tints, detached parts vanish); the
// "Live feed" panel swaps in the real DEMO flight scene under a halftone screen.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset } from '../demoSkin.jsx';
import { LiveShip, PART_LABEL, TimeScale, partOf, useConsole } from './variantFGH.jsx';
import './variantG.css';

/* ---------- comic helpers ---------- */

/** Deterministic starburst polygon for clip-path. */
function burst(points = 18, inner = 0.68, seed = 1) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const j = Math.sin(seed * 12.9898 + i * 78.233) * 0.5 + 0.5; // 0..1 pseudo-random
    const r = i % 2 === 0 ? 0.9 + j * 0.1 : inner - j * 0.08;
    out.push(`${(50 + Math.cos(a) * r * 50).toFixed(2)}% ${(50 + Math.sin(a) * r * 50).toFixed(2)}%`);
  }
  return `polygon(${out.join(',')})`;
}

const SFX = {
  'Asteroid Collision': 'KRAK!',
  'Black Hole Encounter': 'VWOOOM',
  'Solar Storm': 'FZZZT!',
  'Alien Encounter': 'BLEEP?!',
  'Oxygen Leak': 'HSSSSS',
  'Spacecraft Fire': 'FWOOSH!',
  'AI System Malfunction': 'BZZT-ERR',
  'Robotic Arm Malfunction': 'KLANK!',
  'Engine Failure': 'PUTT..PUTT',
  'Thruster Failure': 'SPUTTER!',
  'Solar Panel Power Crisis': 'FLIKKER',
};

const AI_LINES = [
  'I can stage meteor strikes, fires and failing engines — physics included!',
  'Something breaks? My judging agent weighs every option before we act.',
  'Grab the hull and spin me around — every module is up close and interactive.',
];

const AGENT_COLORS = { 'Main Judging': '#e8342b', Propelling: '#1f6fd1', Energy: '#f5c400', 'Robot Arms': '#1a1a1a' };

function RobotFace({ color = '#1f6fd1', alarm = false, size = 46 }) {
  return (
    <svg className="vg-face" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <line x1="24" y1="2" x2="24" y2="10" stroke="#111" strokeWidth="3" />
      <circle cx="24" cy="4" r="3.4" fill={alarm ? '#e8342b' : '#f5c400'} stroke="#111" strokeWidth="2" />
      <rect x="6" y="10" width="36" height="30" rx="7" fill={color} stroke="#111" strokeWidth="3.2" />
      <rect x="11" y="16" width="26" height="14" rx="4" fill="#fdf8ea" stroke="#111" strokeWidth="2.4" />
      {alarm ? (
        <>
          <path d="M14 19 l6 4 M20 19 l-6 4 M28 19 l6 4 M34 19 l-6 4" stroke="#111" strokeWidth="2.6" />
          <ellipse cx="24" cy="35" rx="4" ry="2.6" fill="#111" />
        </>
      ) : (
        <>
          <circle cx="18" cy="23" r="3" fill="#111" />
          <circle cx="30" cy="23" r="3" fill="#111" />
          <path d="M17 34 q7 4 14 0" stroke="#111" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/* ---------- ink-style ship: toon materials + inverted-hull outline pass ---------- */

function useToonGradient() {
  return useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function useOutlineMaterial(thick) {
  return useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#111111', side: THREE.BackSide });
    m.onBeforeCompile = (s) => {
      s.uniforms.uThick = { value: thick };
      s.vertexShader =
        'uniform float uThick;\n' +
        s.vertexShader.replace(
          '#include <project_vertex>',
          `vec4 mvPosition = vec4(transformed, 1.0);
           #ifdef USE_INSTANCING
             mvPosition = instanceMatrix * mvPosition;
           #endif
           mvPosition = modelViewMatrix * mvPosition;
           gl_Position = projectionMatrix * mvPosition;
           vec3 vn = normalize(normalMatrix * normal);
           vec2 cn = (projectionMatrix * vec4(vn, 0.0)).xy;
           float l = length(cn);
           if (l > 1e-5) gl_Position.xy += (cn / l) * uThick * gl_Position.w;`,
        );
    };
    m.customProgramCacheKey = () => `vg-outline-${thick}`;
    return m;
  }, [thick]);
}

const TOONABLE = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshPhongMaterial', 'MeshLambertMaterial']);
const HURT = new THREE.Color('#e8342b');

function InkPass({ thick = 0.006 }) {
  const { gl, scene, camera } = useThree();
  const gradient = useToonGradient();
  const outline = useOutlineMaterial(thick);
  const cache = useRef(new Map());
  useEffect(() => () => cache.current.forEach((m) => m.dispose()), []);
  useFrame(() => {
    // Swap lit materials for toon twins, one per (material, ship part), so damage tints per part.
    scene.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      if (o.userData.vgPart === undefined) o.userData.vgPart = partOf(o);
      const part = o.userData.vgPart;
      let m = o.material;
      if (!m.userData.vgToon) {
        if (!TOONABLE.has(m.type)) return;
        const key = `${m.uuid}:${part?.part ?? ''}`;
        let toon = cache.current.get(key);
        if (!toon) {
          toon = new THREE.MeshToonMaterial({ gradientMap: gradient });
          toon.userData.vgToon = true;
          toon.userData.orig = m;
          cache.current.set(key, toon);
        }
        o.material = toon;
        m = toon;
      }
      const src = m.userData.orig;
      m.color.copy(src.color);
      const h = part?.health ?? 100;
      if (h < 99.95) m.color.lerp(HURT, 0.3 + (0.6 * (100 - h)) / 100);
      if (src.emissive) m.emissive.copy(src.emissive);
      m.emissiveIntensity = src.emissiveIntensity ?? 1;
      m.map = src.map ?? null;
      m.transparent = src.transparent;
      m.opacity = src.opacity;
      m.side = src.side;
      m.visible = src.visible;
    });
    gl.autoClear = true;
    gl.render(scene, camera);
    gl.autoClear = false;
    scene.overrideMaterial = outline;
    gl.render(scene, camera);
    scene.overrideMaterial = null;
    gl.autoClear = true;
  }, 1);
  return null;
}

function Spinner({ sim, yaw = Math.PI / 2 - 0.55, tilt = 0.38, scale = 0.2, swing = 0.4 }) {
  const ref = useRef();
  useFrame((s) => {
    ref.current.rotation.y = yaw + Math.sin(s.clock.elapsedTime * 0.3) * swing;
  });
  return (
    <group rotation={[tilt, 0, 0]} scale={scale}>
      <group ref={ref}>
        <group position={[0, 0, 3.5]}>
          <LiveShip sim={sim} />
        </group>
      </group>
    </group>
  );
}

function InkShip({ sim, thick, ...ship }) {
  return (
    <div className="vg-canvas">
      <Canvas camera={{ position: [0, 0, 10], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <ambientLight intensity={1.1} color="#ffffff" />
        <directionalLight position={[5, 7, 6]} intensity={2.6} color="#fff6dc" />
        <directionalLight position={[-6, -3, 2]} intensity={0.6} color="#9cc4ff" />
        <Spinner sim={sim} {...ship} />
        <InkPass thick={thick} />
      </Canvas>
    </div>
  );
}

/* ---------- shared chrome ---------- */

function Masthead({ tab, onTab, sim, compact }) {
  return (
    <header className={`vg-mast ${compact ? 'vg-mast--sm' : ''}`}>
      <div className="vg-badge">
        <img src={logo} alt="Interstellar X⁴ logo" />
      </div>
      <div className="vg-mast-title">
        <div className="vg-kicker">Interstellar X⁴ presents</div>
        <h1>{TAGLINE}</h1>
      </div>
      <div className="vg-issue">
        <b>ISSUE #4</b>
        <span>DAY {sim.day}</span>
        <span>MET {sim.met}</span>
      </div>
      <nav className="vg-toc" aria-label="Chapters">
        {TABS.map((t, i) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>
            <i>CH.{i + 1}</i> {t}
          </button>
        ))}
      </nav>
    </header>
  );
}

/* ---------- home: the cover ---------- */

function Home({ tab, onTab, sim }) {
  const launch = useMemo(() => burst(16, 0.74, 3), []);
  const bang = useMemo(() => burst(12, 0.62, 7), []);
  const hurt = sim.systems[0].value < 100;
  return (
    <div className="vg vg-home">
      <Masthead tab={tab} onTab={onTab} sim={sim} />
      <main className="vg-cover">
        <section className="vg-panel vg-p-ship vg-space">
          <div className="vg-speed" />
          <InkShip sim={sim} scale={0.24} tilt={0.34} swing={0.5} thick={0.0055} />
          <div className="vg-caption vg-cap-tl">
            Meanwhile, somewhere between {sim.nav.origin} and {sim.nav.destination}… day {sim.day}, cruising at {sim.velocity} km/s.
          </div>
          <div className="vg-bubble vg-bubble--ship">
            {sim.event ? <>{sim.event.name}?! <b>Commander, we need you on deck!</b></>
              : hurt ? <>Hull at {sim.systems[0].value}%. <b>Shall we patch her up?</b></>
                : <>All systems nominal, Commander. <b>Shall we test our luck?</b></>}
          </div>
          <div className="vg-inkdrop vg-sfx-wrap">
            <div className="vg-sfx-small" style={{ clipPath: bang }}>
              <span>VRRMMM!</span>
            </div>
          </div>
        </section>

        <section className="vg-panel vg-p-lead vg-paper-yellow">
          <div className="vg-caption vg-cap-label">Chapter 1 · The Premise</div>
          <p className="vg-lead">{LEAD}</p>
          <div className="vg-sign">— the narrator</div>
        </section>

        <section className="vg-panel vg-p-launch vg-dots-red">
          <span className="vg-inkdrop vg-launch-wrap">
            <button className="vg-launch" style={{ clipPath: launch }} onClick={() => onTab('Generator')}>
              <span>LAUNCH<br />SIMULATOR!</span>
            </button>
          </span>
          <button className="vg-caption vg-explore" onClick={() => onTab('Spacecraft')}>
            Explore features →
          </button>
        </section>

        {FEATURES.map((f, i) => (
          <section key={f} className={`vg-panel vg-p-feat vg-feat-${i}`}>
            <div className="vg-feat-no">{i + 1}</div>
            <h3>{f}</h3>
            <div className="vg-feat-talk">
              <RobotFace color={['#1f6fd1', '#e8342b', '#f5c400'][i]} size={52} />
              <div className="vg-bubble vg-bubble--left">{AI_LINES[i]}</div>
            </div>
            <div className="vg-feat-who">ship's AI</div>
          </section>
        ))}
      </main>
    </div>
  );
}

/* ---------- generator: the live mission page ---------- */

function Meter({ label, value, i, small }) {
  const n = Math.max(0, Math.min(100, Number.parseFloat(value) || 0));
  const t = n >= 80 ? 'ok' : n >= 60 ? 'warn' : 'bad';
  return (
    <div className={`vg-meter ${small ? 'vg-meter--sm' : ''}`} style={{ '--r': `${((i % 3) - 1) * 0.5}deg` }}>
      <div className="vg-meter-head">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="vg-meter-track">
        <div className={`vg-meter-fill vg-${t}`} style={{ width: `${n}%` }} />
      </div>
    </div>
  );
}

function agentLine(a, event) {
  if (!a.ok) return `${a.state}! ${a.reason ?? ''}`;
  if (a.id === 'main_judging') return event ? `${event.name}?! ${a.state} — nobody touch anything!` : `${a.state}. Quiet out here… too quiet.`;
  if (a.id === 'energy') return event ? `${a.state} — watching every watt!` : `${a.state}. Batteries happy, panels happy.`;
  if (a.id === 'propelling') return `${a.state} — holding our line.`;
  return a.state === 'Repairing' ? 'Repairing! Hold still, ship!' : `${a.state}. Arms folded, waiting.`;
}

/** Threat captions from real state, shown over the comic panel. */
function threats(sim) {
  const d = sim.demo;
  const out = [];
  if (d.blackHole) out.push(['red', 'A gravity well tugs at the hull!']);
  if (d.solarStorm) out.push(['red', 'A solar storm wave is coming!']);
  if (d.hazards.length) out.push(['red', `${d.hazards.length} hazard${d.hazards.length > 1 ? 's' : ''} incoming!`]);
  const rocks = d.physics.objects.filter((o) => o.id.startsWith('rock')).length;
  if (rocks) out.push(['yel', `${rocks} space rock${rocks > 1 ? 's' : ''} on radar`]);
  d.physics.detached.forEach((id) => out.push(['red', `Where'd the ${PART_LABEL[id] ?? id} go?!`]));
  if (d.physics.repairs.length) out.push(['blue', `Robot arms patching ${d.physics.repairs.map((r) => PART_LABEL[r.part_id] ?? r.part_id).join(', ')}`]);
  return out;
}

function LiveFeed({ sim, resetCount }) {
  const d = sim.demo;
  return (
    <div className="vg-feed">
      <DemoViewport sim={sim} resetCount={resetCount}>
        <div className="vg-halftone" />
        {d.stormFlash > 0 && <div key={d.stormFlash} className="vg-flash" />}
        {d.armed && <div className="vg-caption vg-armed">Click anywhere to launch {d.armed}! (Esc cancels)</div>}
      </DemoViewport>
    </div>
  );
}

function Generator({ tab, onTab, sim }) {
  const c = useConsole(sim);
  const d = sim.demo;
  const p = d.physics;
  const ai = c.ai;
  const ev = sim.event;
  const boom = useMemo(() => burst(20, 0.66, 11), []);
  const [view, setView] = useState('comic');
  const [ctl, setCtl] = useState('rock');
  const [info, setInfo] = useState('crew');
  const [resetCount, resetView] = useViewReset();
  useEffect(() => {
    if (d.armed) setView('live');
  }, [d.armed]);
  const pct = Math.min(100, sim.nav.progress * 100);
  const lines = threats(sim);
  const hazard = (name, i) => (
    <button key={name} className={`vg-haz ${c.isOn(name) ? 'on' : ''}`} style={{ '--r': `${((i * 37) % 5) - 2}deg` }} onClick={() => c.hazard(name)}>
      <b>{SFX[name]}</b>
      <span>{name}</span>
    </button>
  );
  const alert = ev || d.blackHole || d.hazards.length > 0;

  return (
    <div className={`vg vg-console ${alert ? 'vg-alert' : ''}`}>
      <Masthead tab={tab} onTab={onTab} sim={sim} compact />
      <main className="vg-grid">
        <section className="vg-left">
          <div className="vg-panel vg-p-haz">
            <div className="vg-caption vg-cap-label">Choose your disaster!</div>
            <h4>Out there…</h4>
            <div className="vg-haz-grid">{OUTER.map(hazard)}</div>
            <h4>…and in here</h4>
            <div className="vg-haz-grid">{INNER.map((n, i) => hazard(n, i + 4))}</div>
            <p className="vg-hint">{c.armedHint}</p>
          </div>
          <div className="vg-panel vg-p-ctl vg-dots-blue">
            <div className="vg-tabs">
              {[['rock', 'Space rock'], ['prop', 'Thrusters'], ['ai', 'Robo-brain']].map(([k, l]) => (
                <button key={k} className={ctl === k ? 'on' : ''} onClick={() => setCtl(k)}>{l}</button>
              ))}
            </div>
            <div className="vg-scroll">
              {ctl === 'rock' && (
                <div className="vg-form">
                  <label>Aim at
                    <select value={d.rockSettings.target_id} onChange={(e) => c.setRock('target_id', e.target.value)}>
                      {c.targets.map((t) => <option key={t.id} value={t.id}>{t.label}{p.detached.includes(t.id) ? ' (wreckage)' : ''}</option>)}
                    </select>
                  </label>
                  <div className="vg-form-row">
                    {[['mass_kg', 'Mass kg', 1, 5000, 1], ['speed_m_s', 'Speed m/s', 1, 150, 1], ['radius_m', 'Radius m', 0.15, 2, 0.05], ['warning_s', 'Warning s', 2, 120, 1]].map(([k, l, min, max, step]) => (
                      <label key={k}>{l}
                        <input type="number" min={min} max={max} step={step} value={d.rockSettings[k]} onChange={(e) => c.setRock(k, e.target.value)} />
                      </label>
                    ))}
                  </div>
                  <div className="vg-btns">
                    <button className="vg-btn red" onClick={c.launchRock}>Launch rock!</button>
                    <button className={`vg-btn ${d.armed === 'Asteroid Collision' ? 'on' : ''}`} onClick={() => c.hazard('Asteroid Collision')}>
                      {d.armed === 'Asteroid Collision' ? 'Cancel aim' : 'Aim with pointer'}
                    </button>
                  </div>
                  <p className="vg-small">200 kg at 40 m/s leaves repairable damage. 5000 kg at 150 m/s can break assemblies.</p>
                </div>
              )}
              {ctl === 'prop' && (
                <div className="vg-form">
                  <label>Burn seconds
                    <input type="number" min=".1" max="10" step=".1" value={c.burnSeconds} onChange={(e) => c.setBurnSeconds(Number(e.target.value))} />
                  </label>
                  <div className="vg-burns">
                    {c.burns.map((b) => <button key={b.label} className="vg-btn sm" disabled={b.disabled} onClick={() => c.burn(b)}>{b.label}</button>)}
                  </div>
                  <div className="vg-btns">
                    <button className="vg-btn" onClick={d.coast}>Cut thrust · coast</button>
                    <button className={`vg-btn ${c.courseOn ? 'on' : ''}`} onClick={c.toggleCourse}>Course correction {c.courseOn ? 'ON' : 'OFF'}</button>
                  </div>
                  {p.courseControl && <p className="vg-small">Autopilot course: {p.courseControl.mode}{p.courseControl.reason ? ` · ${p.courseControl.reason}` : ''}</p>}
                </div>
              )}
              {ctl === 'ai' && (
                <div className="vg-form">
                  <p className="vg-small">Link: {c.aiConn}</p>
                  <div className="vg-btns">
                    <button className="vg-btn" disabled={ai.checking} onClick={ai.connect}>{ai.checking ? 'Checking…' : 'Check AI connection'}</button>
                    <button className="vg-btn" disabled={ai.busy || !ai.running} onClick={ai.run}>Run AI once</button>
                    <button className={`vg-btn ${ai.enabled ? 'on' : 'red'}`} onClick={c.aiToggle}>{ai.enabled || ai.busy ? 'Stop DEMO AI' : 'Enable autopilot!'}</button>
                  </div>
                  <p className="vg-small">{c.aiState}</p>
                  {ai.service && <p className="vg-small">Gateway: {ai.service.verified ? 'model access verified' : 'not verified'}</p>}
                  {ai.error && <p className="vg-err">{ai.error}</p>}
                  {ai.latest && <p className="vg-small"><b>Main Judging:</b> {ai.latest.summary} ({ai.latest.executed} actions)</p>}
                </div>
              )}
              {c.error && <p className="vg-err">{c.error}</p>}
            </div>
          </div>
        </section>

        <section className="vg-center">
          <div className={`vg-panel vg-p-live ${view === 'comic' ? 'vg-space' : 'vg-p-feed'}`}>
            {view === 'comic' ? (
              <>
                <div className="vg-speed" />
                <InkShip sim={sim} scale={0.2} thick={0.005} />
                <div className="vg-wash" />
              </>
            ) : (
              <LiveFeed sim={sim} resetCount={resetCount} />
            )}
            <div className="vg-caption vg-cap-tl">
              Day {sim.day} — {sim.nav.phase}
            </div>
            <div className="vg-view" role="group" aria-label="View">
              <button className={view === 'comic' ? 'on' : ''} onClick={() => setView('comic')}>Comic</button>
              <button className={view === 'live' ? 'on' : ''} onClick={() => setView('live')}>Live feed</button>
            </div>
            {lines.length > 0 && (
              <div className="vg-threats">
                {lines.slice(0, 4).map(([t, l]) => <div key={l} className={`vg-caption ${t}`}>{l}</div>)}
              </div>
            )}
            <div className="vg-stats">
              <div className="vg-caption"><i>Velocity</i>{sim.velocity} km/s</div>
              <div className="vg-caption"><i>Propellant</i>{sim.propellantKg} kg</div>
              <div className="vg-caption"><i>Mass</i>{sim.massKg} kg</div>
              <div className="vg-caption"><i>Attitude</i>{sim.attitude}</div>
            </div>
            <div className="vg-route">
              <span>{sim.nav.origin}</span>
              <div className="vg-route-track"><div style={{ width: `${pct}%` }} /><em style={{ left: `${pct}%` }}>▲</em></div>
              <span>{sim.nav.destination}</span>
            </div>
            {ev && view === 'comic' && (
              <div className="vg-boom" key={ev.name}>
                <div className="vg-boom-burst" style={{ clipPath: boom }} />
                <div className="vg-boom-text">
                  <b>{SFX[ev.name] === 'KRAK!' ? 'KRAKOOM!' : SFX[ev.name]}</b>
                  <span>WARNING! {ev.name} · severity {ev.severity}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="vg-transport">
            <button className="vg-btn" onClick={d.togglePlaying}>{d.playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="vg-btn" onClick={sim.clear}>↺ Reset the timeline</button>
            <span className="vg-tlabel">Time ×</span>
            <TimeScale sim={sim} className="vg-scale" />
            <button className="vg-btn" onClick={() => { resetView(); setView('live'); }}>⌖ Reset view</button>
          </div>

          <div className="vg-log" aria-label="Mission log">
            {sim.logs.map((l, i) => (
              <div key={l.id} className={`vg-caption vg-logcap ${l.alert ? 'alert' : ''}`} style={{ '--r': `${(i % 2 ? 0.6 : -0.6)}deg` }}>
                <i>{i === 0 ? 'Now' : 'Previously'} · {l.time}</i>
                {l.text}
              </div>
            ))}
          </div>
        </section>

        <section className="vg-right">
          <div className="vg-panel vg-p-sys">
            <div className="vg-caption vg-cap-label">Ship's vitals</div>
            {sim.systems.map((s, i) => (
              <Meter key={s.key} label={s.label} value={`${s.value}%`} i={i} />
            ))}
          </div>
          <div className="vg-panel vg-p-info vg-dots-blue">
            <div className="vg-tabs">
              {[['crew', 'The crew'], ['dmg', 'Damage'], ['flight', 'Flight']].map(([k, l]) => (
                <button key={k} className={info === k ? 'on' : ''} onClick={() => setInfo(k)}>{l}</button>
              ))}
            </div>
            <div className="vg-scroll">
              {info === 'crew' && sim.agents.map((a) => {
                const shout = !a.ok || (ev && a.id === 'main_judging');
                return (
                  <div key={a.id} className="vg-agent">
                    <div className="vg-agent-who">
                      <RobotFace color={AGENT_COLORS[a.name]} alarm={shout} size={40} />
                      <span>{a.name}</span>
                    </div>
                    <div className={`vg-bubble vg-bubble--left ${shout ? 'vg-bubble--shout' : ''}`}>{agentLine(a, ev)}</div>
                  </div>
                );
              })}
              {info === 'dmg' && (
                <>
                  {[...p.bonds].sort((a, b) => a.health - b.health).map((b, i) => (
                    <Meter key={b.id} small i={i} label={`${PART_LABEL[b.id] ?? b.id} · ${b.stage}`} value={b.broken ? 'GONE!' : `${b.health.toFixed(0)}%`} />
                  ))}
                  {p.lastImpact && <p className="vg-small"><b>Last hit:</b> {PART_LABEL[p.lastImpact.part] ?? p.lastImpact.part} · {p.lastImpact.impulseNs.toFixed(0)} N·s · {(p.lastImpact.utilization * 100).toFixed(0)}% capacity</p>}
                  {p.repairs.map((j) => <p key={j.arm_id} className="vg-small">{j.rebuild ? 'Rebuild' : 'Repair'} · {j.arm_id} → {PART_LABEL[j.part_id] ?? j.part_id} · {j.contactSeconds.toFixed(1)}/10 s</p>)}
                  {!p.repairs.length && <p className="vg-small">No repairs under way.</p>}
                </>
              )}
              {info === 'flight' && (
                <>
                  <dl className="vg-dl">
                    <div><dt>Speed</dt><dd>{sim.velocity} km/s</dd></div>
                    <div><dt>Spin</dt><dd>{sim.angular} rad/s</dd></div>
                    <div><dt>Thrust</dt><dd>{p.forceN.toFixed(0)} N</dd></div>
                    <div><dt>Mode</dt><dd>{p.mode}</dd></div>
                    <div><dt>Course off by</dt><dd>{p.deviationM.toFixed(1)} m</dd></div>
                    <div><dt>Δv</dt><dd>{p.deltaV.toFixed(2)} m/s</dd></div>
                    <div><dt>Date</dt><dd>{d.celestialDate.slice(0, 10)}</dd></div>
                    <div><dt>ETA</dt><dd>{sim.nav.etaDays == null ? 'repair first' : `${sim.nav.etaDays.toFixed(1)} d`}</dd></div>
                  </dl>
                  <h5>Nearby rocks & debris</h5>
                  {!p.objects.length && <p className="vg-small">Nothing out there. Yet.</p>}
                  {p.objects.map((o) => <p key={o.id} className="vg-small">{o.id} · {o.distanceM.toFixed(1)} m · closing {o.closingM_s.toFixed(1)} m/s</p>)}
                  <h5>Subsystems</h5>
                  {Object.entries(p.systems).map(([id, st]) => <p key={id} className={`vg-small ${st.mode !== 'online' ? 'bad' : ''}`}>{id.replaceAll('_', ' ')} · {st.mode}{st.reason ? ` · ${st.reason}` : ''}</p>)}
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------- other chapters: real pages in an inked panel ---------- */

function Chapter({ tab, onTab, sim, title, children, aside, className = '' }) {
  return (
    <div className="vg vg-console">
      <Masthead tab={tab} onTab={onTab} sim={sim} compact />
      <main className={`vg-chapter ${aside ? 'with-aside' : ''}`}>
        <section className={`vg-panel vg-p-page ${className}`}>
          <div className="vg-caption vg-cap-label vg-page-label">{title}</div>
          <div className="vg-embed">{children}</div>
        </section>
        {aside}
      </main>
    </div>
  );
}

function MissionAside({ sim }) {
  const d = sim.demo;
  const pct = Math.min(100, sim.nav.progress * 100);
  return (
    <aside className="vg-panel vg-p-mission vg-paper-yellow">
      <div className="vg-caption vg-cap-label">The voyage so far</div>
      <p className="vg-lead vg-lead--sm">Day {sim.day}: our heroes fly from <b>{sim.nav.origin}</b> to <b>{sim.nav.destination}</b>.</p>
      <Meter label="Leg progress" value={`${pct.toFixed(1)}%`} i={0} />
      <dl className="vg-dl">
        <div><dt>Phase</dt><dd>{sim.nav.phase}</dd></div>
        <div><dt>ETA</dt><dd>{sim.nav.etaDays == null ? 'repair first' : `${sim.nav.etaDays.toFixed(1)} d`}</dd></div>
        <div><dt>Date (UTC)</dt><dd>{d.celestialDate.slice(0, 10)}</dd></div>
        <div><dt>Speed</dt><dd>{sim.velocity} km/s</dd></div>
        <div><dt>Route error</dt><dd>{d.navigation.route_error_map_units.toFixed(3)}</dd></div>
        <div><dt>In orbit</dt><dd>{sim.nav.inOrbit ? 'yes' : 'no'}</dd></div>
      </dl>
      <div className="vg-transport vg-transport--col">
        <button className="vg-btn" onClick={d.togglePlaying}>{d.playing ? '❚❚ Pause' : '▶ Play'}</button>
        <TimeScale sim={sim} className="vg-scale" />
      </div>
      <div className="vg-bubble vg-bubble--note">{sim.session.mapInfo}</div>
    </aside>
  );
}

export default function VariantG({ page, tab, onTab, sim }) {
  if (page === 'home') return <Home tab={tab} onTab={onTab} sim={sim} />;
  if (tab === 'Generator') return <Generator tab={tab} onTab={onTab} sim={sim} />;
  if (tab === 'Planetary Trajectories')
    return <Chapter tab={tab} onTab={onTab} sim={sim} title="The map of the heavens" aside={<MissionAside sim={sim} />} className="vg-p-map"><TrajectoriesView sim={sim} /></Chapter>;
  if (tab === 'AI Logs') return <Chapter tab={tab} onTab={onTab} sim={sim} title="The robo-brain's diary"><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Chapter>;
  if (tab === 'AI API') return <Chapter tab={tab} onTab={onTab} sim={sim} title="Plug in a brain"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></Chapter>;
  return <Chapter tab={tab} onTab={onTab} sim={sim} title="Meet the ship" className="vg-p-craft"><SpacecraftView sim={sim} /></Chapter>;
}
