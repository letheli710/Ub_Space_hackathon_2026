// PROTOTYPE — throwaway. Variant G "Comic · 漫画分镜": the product as a retro-futurist graphic-novel page.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import StationShip from '../components/station/StationShip.jsx';
import { logo, TABS, OUTER, INNER, FEATURES, TAGLINE, LEAD } from './mock.jsx';
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

function InkPass({ thick = 0.006 }) {
  const { gl, scene, camera } = useThree();
  const gradient = useToonGradient();
  const outline = useOutlineMaterial(thick);
  const cache = useRef(new WeakMap());
  useFrame(() => {
    // Swap lit materials for toon twins (kept in sync with the originals the ship mutates).
    scene.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      let m = o.material;
      if (!m.userData.vgToon) {
        if (!TOONABLE.has(m.type)) return;
        let toon = cache.current.get(m);
        if (!toon) {
          toon = new THREE.MeshToonMaterial({ gradientMap: gradient });
          toon.userData.vgToon = true;
          toon.userData.orig = m;
          cache.current.set(m, toon);
        }
        o.material = toon;
        m = toon;
      }
      const src = m.userData.orig;
      m.color.copy(src.color);
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

function Spinner({ event, yaw = Math.PI / 2 - 0.55, tilt = 0.38, scale = 0.2, swing = 0.4 }) {
  const ref = useRef();
  useFrame((s) => {
    ref.current.rotation.y = yaw + Math.sin(s.clock.elapsedTime * 0.3) * swing;
  });
  return (
    <group rotation={[tilt, 0, 0]} scale={scale}>
      <group ref={ref}>
        <group position={[0, 0, 3.5]}>
          <StationShip event={event} />
        </group>
      </group>
    </group>
  );
}

function InkShip({ event, thick, ...ship }) {
  return (
    <div className="vg-canvas">
      <Canvas camera={{ position: [0, 0, 10], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <ambientLight intensity={1.1} color="#ffffff" />
        <directionalLight position={[5, 7, 6]} intensity={2.6} color="#fff6dc" />
        <directionalLight position={[-6, -3, 2]} intensity={0.6} color="#9cc4ff" />
        <Spinner event={event} {...ship} />
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
  return (
    <div className="vg vg-home">
      <Masthead tab={tab} onTab={onTab} sim={sim} />
      <main className="vg-cover">
        <section className="vg-panel vg-p-ship vg-space">
          <div className="vg-speed" />
          <InkShip event={sim.event} scale={0.24} tilt={0.34} swing={0.5} thick={0.0055} />
          <div className="vg-caption vg-cap-tl">Meanwhile, somewhere between Earth and Mars…</div>
          <div className="vg-bubble vg-bubble--ship">
            All systems nominal, Commander. <b>Shall we test our luck?</b>
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

/* ---------- console: the live mission page ---------- */

function Meter({ label, value, i }) {
  const tone = value >= 80 ? 'ok' : value >= 60 ? 'warn' : 'bad';
  return (
    <div className="vg-meter" style={{ '--r': `${((i % 3) - 1) * 0.5}deg` }}>
      <div className="vg-meter-head">
        <span>{label}</span>
        <b>{value}%</b>
      </div>
      <div className="vg-meter-track">
        <div className={`vg-meter-fill vg-${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function agentLine(a, event) {
  if (a.name === 'Main Judging')
    return event ? `${event.name}?! Evaluating — nobody touch anything!` : 'Standing by. Quiet out here… too quiet.';
  if (a.name === 'Energy') return event ? 'Shedding load! Lights going dim!' : 'Batteries happy, panels happy.';
  if (a.name === 'Propelling') return `${a.state} — holding our line to Mars.`;
  return `${a.state}. Arms folded, waiting.`;
}

function Console({ tab, onTab, sim }) {
  const ev = sim.event;
  const boom = useMemo(() => burst(20, 0.66, 11), []);
  const pct = Math.min(100, sim.nav.progress * 100);
  const hazard = (name, i) => (
    <button
      key={name}
      className={`vg-haz ${ev?.name === name ? 'on' : ''}`}
      style={{ '--r': `${((i * 37) % 5) - 2}deg` }}
      onClick={() => sim.trigger(name)}
    >
      <b>{SFX[name]}</b>
      <span>{name}</span>
    </button>
  );

  return (
    <div className={`vg vg-console ${ev ? 'vg-alert' : ''}`}>
      <Masthead tab={tab} onTab={onTab} sim={sim} compact />
      <main className="vg-grid">
        <section className="vg-panel vg-p-haz">
          <div className="vg-caption vg-cap-label">Choose your disaster!</div>
          <h4>Out there…</h4>
          <div className="vg-haz-grid">{OUTER.map(hazard)}</div>
          <h4>…and in here</h4>
          <div className="vg-haz-grid">{INNER.map((n, i) => hazard(n, i + 4))}</div>
          <button className="vg-caption vg-reset" onClick={sim.clear} disabled={!ev}>
            ↺ Reset the timeline
          </button>
        </section>

        <section className="vg-center">
          <div className="vg-panel vg-p-live vg-space">
            <div className="vg-speed" />
            <InkShip event={ev} scale={0.2} thick={0.005} />
            <div className="vg-wash" />
            <div className="vg-caption vg-cap-tl">
              Day {sim.day} — {sim.nav.origin} → {sim.nav.destination} · {sim.nav.phase}
            </div>
            <div className="vg-stats">
              <div className="vg-caption"><i>Velocity</i>{sim.velocity} km/s</div>
              <div className="vg-caption"><i>Propellant</i>{sim.propellantKg} kg</div>
              <div className="vg-caption"><i>Mass</i>{sim.massKg} kg</div>
              <div className="vg-caption"><i>Time ×</i>{sim.timeScale}</div>
            </div>
            <div className="vg-route">
              <span>{sim.nav.origin}</span>
              <div className="vg-route-track"><div style={{ width: `${pct}%` }} /><em style={{ left: `${pct}%` }}>▲</em></div>
              <span>{sim.nav.destination}</span>
            </div>
            {ev && (
              <div className="vg-boom" key={ev.name}>
                <div className="vg-boom-burst" style={{ clipPath: boom }} />
                <div className="vg-boom-text">
                  <b>{SFX[ev.name] === 'KRAK!' ? 'KRAKOOM!' : SFX[ev.name]}</b>
                  <span>WARNING! {ev.name} · severity {ev.severity}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="vg-log" aria-label="Mission log">
            {sim.logs.slice(0, 4).map((l, i) => (
              <div key={`${l.t}-${i}`} className={`vg-caption vg-logcap ${l.alert ? 'alert' : ''}`} style={{ '--r': `${(i % 2 ? 0.6 : -0.6)}deg` }}>
                <i>{i === 0 ? 'Now' : 'Previously'} · Day {sim.day}</i>
                {l.text}
              </div>
            ))}
          </div>
        </section>

        <section className="vg-right">
          <div className="vg-panel vg-p-sys">
            <div className="vg-caption vg-cap-label">Ship's vitals</div>
            {sim.systems.map((s, i) => (
              <Meter key={s.key} label={s.label} value={s.value} i={i} />
            ))}
          </div>
          <div className="vg-panel vg-p-agents vg-dots-blue">
            <div className="vg-caption vg-cap-label">The crew (AI agents)</div>
            {sim.agents.map((a) => {
              const shout = ev && (a.name === 'Main Judging' || !a.ok);
              return (
                <div key={a.name} className="vg-agent">
                  <div className="vg-agent-who">
                    <RobotFace color={AGENT_COLORS[a.name]} alarm={shout} size={40} />
                    <span>{a.name}</span>
                  </div>
                  <div className={`vg-bubble vg-bubble--left ${shout ? 'vg-bubble--shout' : ''}`}>{agentLine(a, ev)}</div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function VariantG({ page, tab, onTab, sim }) {
  return page === 'console' ? <Console tab={tab} onTab={onTab} sim={sim} /> : <Home tab={tab} onTab={onTab} sim={sim} />;
}
