// PROTOTYPE — Variant K: Starry Night. The solar system as a post-impressionist oil painting:
// a flow-field brushstroke sky, haloed stars, dabbed planets, and the real 3D ship painted through a
// Kuwahara filter. Hazards repaint the sky (vortex, comets, solar surge) and the ship takes evasive action.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import StationShip from '../components/station/StationShip.jsx';
import { FEATURES, INNER, LEAD, OUTER, TABS, TAGLINE, logo } from './mock.jsx';
import { FRAG, VERT } from './variantKShader.js';
import './variantK.css';

const KIND = {
  'Black Hole Encounter': 'bh',
  'Asteroid Collision': 'comets',
  'Solar Storm': 'storm',
  'Alien Encounter': 'alien',
  'Spacecraft Fire': 'fire',
  'Engine Failure': 'engine',
  'Thruster Failure': 'engine',
};
const kindOf = (name) => KIND[name] || 'inner';

// Evasive offset (world units) and roll direction per hazard.
const DODGE = {
  bh: { x: -0.7, y: 1.3, roll: 0.75 },
  comets: { x: -0.2, y: -1.0, roll: -0.9 },
  storm: { x: -0.5, y: 0.3, roll: 0.4 },
  alien: { x: -0.6, y: 0.8, roll: 0.55 },
  fire: { x: 0, y: 0.15, roll: 0.25 },
  engine: { x: 0, y: -0.2, roll: -0.2 },
  inner: { x: 0, y: 0.15, roll: 0.3 },
};

const LAYOUT = {
  home: { pos: [0.9, -0.35, 0], scale: 0.13, sun: 0.2 },
  console: { pos: [0.1, -0.15, 0], scale: 0.115, sun: 0.45 },
};

const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ease = (cur, target, dt, k) => cur + (target - cur) * (1 - Math.exp(-dt * k));

function phaseOf(active, ph) {
  if (!active) return 'calm';
  if (ph < 1.5) return 'warning';
  if (ph < 5.5) return 'evasive';
  return 'recovered';
}

/** The whole painting: 3D ship rendered off-screen, then painted with the sky in one full-screen pass. */
function Painting({ event, layout, onPhase }) {
  const { gl, size, camera } = useThree();
  const outer = useRef();
  const yawG = useRef();
  const rollG = useRef();
  const tailRef = useRef();
  const noseRef = useRef();

  const target = useMemo(
    () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true }),
    [],
  );
  const post = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: target.texture },
        uSceneRes: { value: new THREE.Vector2(4, 4) },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uAlert: { value: 0 },
        uBurn: { value: 0 },
        uShield: { value: 0 },
        uStorm: { value: 0 },
        uStormR: { value: 0 },
        uBH: { value: 0 },
        uAlien: { value: 0 },
        uFire: { value: 0 },
        uShip: { value: new THREE.Vector2() },
        uTail: { value: new THREE.Vector2() },
        uSun: { value: new THREE.Vector2() },
        uBHPos: { value: new THREE.Vector2() },
        uAlienPos: { value: new THREE.Vector2() },
        uShipR: { value: 0.2 },
        uComet: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uCometA: { value: [0, 0, 0] },
      },
    });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
    return { mat, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, [target]);

  useEffect(() => () => { target.dispose(); post.mat.dispose(); }, [target, post]);

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.max(4, Math.round(size.width * dpr * 0.6));
    const h = Math.max(4, Math.round(size.height * dpr * 0.6));
    target.setSize(w, h);
    post.mat.uniforms.uSceneRes.value.set(w, h);
  }, [size, gl, target, post]);

  // Animation state kept outside React.
  const st = useRef({ name: null, kind: 'inner', start: 0, last: 'calm', alert: 0, haz: 0, burn: 0.15, shield: 0, ox: 0, oy: 0, roll: 0, yaw: 0, fire: 0 });
  const v3 = useMemo(() => new THREE.Vector3(), []);
  const buf = useMemo(() => new THREE.Vector2(), []);

  useFrame((state, dtRaw) => {
    // window.__vkDebug = { ph } freezes the emergency timeline at `ph` seconds (headless screenshots).
    const dbg = typeof window !== 'undefined' ? window.__vkDebug : null;
    const dt = dbg ? 1 : Math.min(dtRaw, 0.05);
    const t = dbg ? 100 + dbg.ph : state.clock.elapsedTime;
    if (dbg) st.current.start = 100;
    const s = st.current;
    const u = post.mat.uniforms;
    const name = event?.name ?? null;
    if (name !== s.name) {
      s.name = name;
      if (name) { s.kind = kindOf(name); s.start = t; }
    }
    const active = !!name;
    const ph = t - s.start;
    const k = s.kind;
    const outerHaz = ['bh', 'comets', 'storm', 'alien'].includes(k);
    const phase = phaseOf(active, ph);
    if (phase !== s.last) { s.last = phase; onPhase?.(phase, k); }

    // Envelopes.
    const evade = active ? ss(1.4, 4.2, ph) : 0;
    const burnPulse = active && k !== 'engine' ? ss(1.3, 1.8, ph) * (1 - ss(4.2, 5.6, ph)) : 0;
    const idle = active && k === 'engine' ? 0.02 + 0.06 * Math.abs(Math.sin(t * 9)) : 0.15;
    s.haz = ease(s.haz, active && outerHaz ? 1 : 0, dt, active ? 1.6 : 1.0);
    s.alert = ease(s.alert, active ? (ph < 6 ? 1 : 0.45) : 0, dt, 2.5);
    s.burn = ease(s.burn, Math.max(idle, burnPulse), dt, 6);
    s.shield = ease(s.shield, active && outerHaz && k !== 'bh' ? ss(1.0, 1.6, ph) * (1 - ss(6.5, 8.5, ph) * 0.6) : 0, dt, 4);
    s.fire = ease(s.fire, active && k === 'fire' ? 1 : 0, dt, 3);

    const d = DODGE[k];
    const pull = active && k === 'bh' ? ss(0, 1.5, ph) * (1 - ss(1.5, 3, ph)) * 0.35 : 0;
    const hold = active ? (ph < 6 ? evade : 0.55 + 0.45 * (1 - ss(6, 10, ph))) : 0;
    s.ox = ease(s.ox, d.x * hold + pull, dt, 3);
    s.oy = ease(s.oy, d.y * hold - pull * 0.3, dt, 3);
    s.roll = ease(s.roll, d.roll * burnPulse * 1.0 + (active ? Math.sin(t * 2.3) * 0.04 * s.alert : 0), dt, 4);
    s.yaw = ease(s.yaw, -0.25 * burnPulse * Math.sign(d.y || 1), dt, 3);

    // Ship pose.
    const base = layout.pos;
    outer.current.position.set(base[0], base[1] + Math.sin(t * 0.6) * 0.06, base[2]);
    yawG.current.position.set(s.ox, s.oy, 0);
    yawG.current.rotation.set(0.28 + Math.sin(t * 0.4) * 0.03, Math.PI / 2 - 0.35 + s.yaw, 0);
    rollG.current.rotation.z = s.roll + Math.sin(t * 0.5) * 0.05;

    // Screen-space anchors for the painting pass (p-space: x ∈ ±aspect/2, y ∈ ±0.5).
    const aspect = size.width / size.height;
    const toP = (vec, out) => { vec.project(camera); out.set(vec.x * 0.5 * aspect, vec.y * 0.5); return out; };
    outer.current.updateMatrixWorld();
    const rest = toP(v3.setFromMatrixPosition(outer.current.matrixWorld), new THREE.Vector2());
    toP(v3.setFromMatrixPosition(yawG.current.matrixWorld), u.uShip.value);
    toP(v3.setFromMatrixPosition(tailRef.current.matrixWorld), u.uTail.value);
    const nose = toP(v3.setFromMatrixPosition(noseRef.current.matrixWorld), new THREE.Vector2());
    u.uShipR.value = nose.distanceTo(u.uTail.value) * 0.55;
    u.uSun.value.set(0.5 * aspect - layout.sun, 0.3);
    const lim = 0.5 * aspect - 0.06;
    u.uBHPos.value.set(Math.min(lim, rest.x + 0.44), rest.y + 0.08);
    u.uAlienPos.value.set(Math.min(lim, rest.x + 0.38), rest.y - 0.14);

    u.uTime.value = t;
    u.uAspect.value = aspect;
    gl.getDrawingBufferSize(buf);
    u.uRes.value.copy(buf);
    u.uAlert.value = s.alert;
    u.uBurn.value = s.burn;
    u.uShield.value = s.shield;
    u.uFire.value = s.fire;
    u.uBH.value = k === 'bh' ? s.haz : 0;
    u.uAlien.value = k === 'alien' ? s.haz : 0;
    u.uStorm.value = k === 'storm' ? s.haz : 0;
    u.uStormR.value = ((ph * 0.42) % 1.5) + 0.05;
    for (let i = 0; i < 3; i++) {
      const c0 = 0.3 + i * 0.85;
      const live = k === 'comets' && ph > c0 ? s.haz : 0;
      const prog = ((ph - c0) / 2.6) % 1;
      const sx = rest.x + 0.95, sy = rest.y + 0.62 - i * 0.08;
      const ex = rest.x - 0.75, ey = rest.y - 0.32 + i * 0.1;
      const dx = ex - sx, dy = ey - sy, dl = Math.hypot(dx, dy);
      u.uComet.value[i].set(sx + dx * prog, sy + dy * prog, dx / dl, dy / dl);
      u.uCometA.value[i] = live * ss(0, 0.08, prog) * (1 - ss(0.9, 1, prog));
    }

    // Render: ship → FBO, then the painting to screen.
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
    gl.render(state.scene, camera);
    gl.setRenderTarget(null);
    gl.render(post.scene, post.cam);
  }, 1);

  return (
    <>
      <ambientLight intensity={0.9} color="#c9d4ff" />
      <pointLight position={[8, 6, 6]} intensity={160} color="#ffd889" />
      <pointLight position={[-8, -3, 4]} intensity={45} color="#5f86ff" />
      <group ref={outer}>
        <group ref={yawG}>
          <group ref={rollG} scale={layout.scale}>
            <group position={[0, 0, 3.5]}>
              <StationShip event={event} />
              <group ref={tailRef} position={[0, 0, -19]} />
              <group ref={noseRef} position={[0, 0, 15]} />
            </group>
          </group>
        </group>
      </group>
    </>
  );
}

function Stage({ event, layout, onPhase }) {
  return (
    <div className="vk-stage" aria-hidden="true">
      <Canvas dpr={[1, 1.25]} camera={{ position: [0, 0, 10], fov: 40 }} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}>
        <Painting event={event} layout={layout} onPhase={onPhase} />
      </Canvas>
    </div>
  );
}

const CAPTIONS = {
  warning: {
    bh: 'A black hole stirs off the bow — the sky begins to spiral inward.',
    comets: 'Meteors inbound, their tails dragged across the swirl.',
    storm: 'The Sun erupts — a surge of yellow strokes rolls outward.',
    alien: 'An unknown emerald light pulses in the dark.',
    fire: 'Fire aboard — the hull glows like a lantern.',
    engine: 'The engine sputters; the plume gutters out.',
    inner: 'Something is wrong aboard — Main Judging evaluating.',
  },
  evasive: {
    bh: 'AI Propelling · full burn against the pull, roll 40°.',
    comets: 'AI Propelling · evasive dive, roll 50° · shields up.',
    storm: 'AI Energy · shields raised, load shed, hull turned edge-on.',
    alien: 'AI Main Judging · distance opened, attitude hold.',
    fire: 'AI Main Judging · compartment sealed, suppression armed.',
    engine: 'AI Propelling · cold-gas thrusters take attitude hold.',
    inner: 'AI agents stabilise · load shedding · attitude hold.',
  },
  recovered: {
    bh: 'Clear of the well — course restored to Mars.',
    comets: 'Swarm passed — no impact. Course restored.',
    storm: 'Storm front passed — systems recovering.',
    alien: 'Contact logged — holding course.',
    fire: 'Contained — holding course.',
    engine: 'Holding attitude — repair underway.',
    inner: 'Contained — holding course.',
  },
};
const NUMERAL = { warning: 'I', evasive: 'II', recovered: 'III' };

function Caption({ phase, kind, name }) {
  if (phase === 'calm') return null;
  return (
    <div key={phase + kind} className={`vk-caption ${phase}`}>
      <small>{NUMERAL[phase]}. {name}</small>
      <p>{CAPTIONS[phase][kind]}</p>
    </div>
  );
}

function Nav({ tab, onTab, sim, alert }) {
  return (
    <header className="vk-nav">
      <button className="vk-brand" onClick={() => onTab('Home')}>
        <img src={logo} alt="" />
        <span>Interstellar X<sup>4</sup></span>
      </button>
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>{t}</button>
        ))}
      </nav>
      <div className={`vk-met ${alert ? 'alert' : ''}`}>MET {sim.met}</div>
    </header>
  );
}

const LOOP = ['Black Hole Encounter', 'Asteroid Collision', 'Solar Storm', 'Alien Encounter'];

/** Home: auto-playing emergency sequence every 15 s. */
function useLoopEvent(enabled) {
  const [ev, setEv] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const t0 = performance.now();
    const id = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      const cyc = Math.floor(s / 15), local = s % 15;
      const name = local > 2.5 && local < 12.5 ? LOOP[cyc % LOOP.length] : null;
      setEv((cur) => ((cur?.name ?? null) === name ? cur : name ? { name, severity: 65 } : null));
    }, 200);
    return () => clearInterval(id);
  }, [enabled]);
  return ev;
}

function Home({ sim, onTab }) {
  const ev = useLoopEvent(true);
  const [ph, setPh] = useState({ phase: 'calm', kind: 'bh' });
  return (
    <div className="vk vk-home">
      <Stage event={ev} layout={LAYOUT.home} onPhase={(phase, kind) => setPh({ phase, kind })} />
      <Nav tab="Home" onTab={onTab} sim={sim} alert={!!ev} />
      <div className="vk-title">
        <h1>Interstellar X<sup>4</sup></h1>
        <p>{TAGLINE}</p>
      </div>
      <Caption phase={ph.phase} kind={ph.kind} name={ev?.name ?? 'Course restored'} />
      <aside className="vk-placard">
        <div className="vk-placard-head">
          <strong>Interstellar X<sup>4</sup></strong>
          <span>The Voyage to Mars, 2026</span>
        </div>
        <em>Oil on canvas · Day {sim.day} · MET {sim.met}</em>
        <p>{LEAD}</p>
        <ul>{FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
        <button className="vk-cta" onClick={() => onTab('Generator')}>Launch the simulator <span>→</span></button>
      </aside>
    </div>
  );
}

function Console({ sim, tab, onTab }) {
  const [ph, setPh] = useState({ phase: 'calm', kind: 'inner' });
  const ev = sim.event;
  return (
    <div className="vk vk-console">
      <Stage event={ev} layout={LAYOUT.console} onPhase={(phase, kind) => setPh({ phase, kind })} />
      <Nav tab={tab} onTab={onTab} sim={sim} alert={!!ev} />
      <Caption phase={ph.phase} kind={ph.kind} name={ev?.name ?? ''} />

      <aside className="vk-panel vk-left">
        <h3>Outer hazards</h3>
        <div className="vk-chips">
          {OUTER.map((n) => (
            <button key={n} className={ev?.name === n ? 'on' : ''} onClick={() => sim.trigger(n)}>{n}</button>
          ))}
        </div>
        <h3>Inner hazards</h3>
        <div className="vk-chips">
          {INNER.map((n) => (
            <button key={n} className={ev?.name === n ? 'on' : ''} onClick={() => sim.trigger(n)}>{n}</button>
          ))}
        </div>
        <button className="vk-reset" onClick={sim.clear} disabled={!ev}>Restore the canvas</button>
      </aside>

      <aside className="vk-panel vk-right">
        <h3>Systems</h3>
        <ul className="vk-sys">
          {sim.systems.map((s) => (
            <li key={s.key} className={s.value < 75 ? 'low' : ''}>
              <span>{s.label}</span>
              <i><b style={{ width: `${s.value}%` }} /></i>
              <em>{s.value}</em>
            </li>
          ))}
        </ul>
        <h3>AI agents</h3>
        <ul className="vk-agents">
          {sim.agents.map((a) => (
            <li key={a.name} className={a.ok ? '' : 'warn'}><span>{a.name}</span><em>{a.state}</em></li>
          ))}
        </ul>
        <h3>Ship’s log</h3>
        <ol className="vk-log">
          {sim.logs.slice(0, 4).map((l, i) => (
            <li key={`${l.t}-${i}`} className={l.alert ? 'alert' : ''}>{l.text}</li>
          ))}
        </ol>
      </aside>

      <div className="vk-label">
        {sim.nav.origin} → {sim.nav.destination} · {sim.nav.phase} · {sim.velocity} km/s
        <em>Oil on canvas · Day {sim.day}</em>
      </div>
    </div>
  );
}

export default function VariantK({ page, tab, onTab, sim }) {
  return page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} tab={tab} onTab={onTab} />;
}
