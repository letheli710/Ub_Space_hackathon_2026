// Variant K: Starry Night. The solar system as a post-impressionist oil painting — a flow-field
// brushstroke sky, haloed stars, dabbed planets and the real 3D ship painted through a Kuwahara filter.
// The painting is driven by the REAL DEMO session: black hole → vortex, solar storm → surge, inbound
// rocks → comets, alien hazard → emerald light, real burns → plume, real damage → agitated strokes.
// "Painting / Physics" swaps in the real DEMO flight scene inside the same frame.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import StationShip from '../../components/station/StationShip.jsx';
import { AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset } from '../demoSkin.jsx';
import {
  AiControls, Damage, FlightData, Nearby, Propulsion, RockForm, Transport,
  GlBoundary, hookShaderErrors, initialGlMode, missionRows, pickTargetType, probeBrightness, realThreat, targetComplete, useHazards,
} from './variantIKLKit.jsx';
import { FRAG, VERT } from './variantKShader.js';
import './variantK.css';

const HOME_KIND = {
  'Black Hole Encounter': 'bh',
  'Asteroid Collision': 'comets',
  'Solar Storm': 'storm',
  'Alien Encounter': 'alien',
};
/** realThreat() kinds → painting kinds */
const PAINT_KIND = { bh: 'bh', rocks: 'comets', storm: 'storm', alien: 'alien', fire: 'fire', engine: 'engine', inner: 'inner' };

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
const NO_DRIVE = { kind: null, name: null, burn: 0, damage: 0, engineOut: false };

/**
 * The whole painting: 3D ship rendered off-screen, then painted with the sky in one full-screen pass.
 * `drive` is a ref to { kind, name, burn, damage, engineOut } read every frame.
 * Falls back (onFail) to a CSS painting + plain ship when the GPU cannot run the pass.
 */
function Painting({ drive, event, layout, onPhase, fallback, onFail, onAlive }) {
  const { gl, size, camera, setDpr } = useThree();
  const outer = useRef();
  const yawG = useRef();
  const rollG = useRef();
  const tailRef = useRef();
  const noseRef = useRef();
  const [rtType, setRtType] = useState(() => pickTargetType(gl));

  const target = useMemo(
    () => new THREE.WebGLRenderTarget(4, 4, { type: rtType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true }),
    [rtType],
  );
  const post = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: null },
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
        uComet0: { value: new THREE.Vector4() },
        uComet1: { value: new THREE.Vector4() },
        uComet2: { value: new THREE.Vector4() },
        uCometA: { value: new THREE.Vector3() },
      },
    });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
    return { mat, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, []);

  useEffect(() => hookShaderErrors(gl, 'Starry Night', onFail), [gl, onFail]);
  useEffect(() => () => target.dispose(), [target]);
  useEffect(() => () => post.mat.dispose(), [post]);

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.max(4, Math.round(size.width * dpr * 0.6));
    const h = Math.max(4, Math.round(size.height * dpr * 0.6));
    target.setSize(w, h);
    post.mat.uniforms.uSceneRes.value.set(w, h);
    post.mat.uniforms.uScene.value = target.texture;
    // An 8-bit target always works; half-float may be incomplete on some WebKit GPUs.
    if (!targetComplete(gl, target)) {
      if (rtType !== THREE.UnsignedByteType) {
        console.warn('[Starry Night] half-float target unsupported — using 8-bit');
        setRtType(THREE.UnsignedByteType);
      } else onFail('framebuffer');
    }
  }, [size, gl, target, post, rtType, onFail]);

  // Animation state kept outside React.
  const st = useRef({ kind: null, name: null, start: 0, end: -99, last: 'calm', alert: 0, haz: 0, burn: 0.15, shield: 0, ox: 0, oy: 0, roll: 0, yaw: 0, fire: 0, frame: 0, dark: 0, slow: 0, slowN: 0 });
  const v3 = useMemo(() => new THREE.Vector3(), []);
  const buf = useMemo(() => new THREE.Vector2(), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    const s = st.current;
    if (!s.alive) { s.alive = true; onAlive?.(); }
    const u = post.mat.uniforms;
    const dr = drive.current ?? NO_DRIVE;
    const kindNow = dr.kind;
    if (kindNow !== s.kind) {
      if (kindNow) { s.start = t; s.name = dr.name; } else if (s.kind) s.end = t;
      s.kind = kindNow;
    }
    const active = !!s.kind;
    const ph = t - s.start;
    const k = s.kind ?? 'inner';
    const outerHaz = ['bh', 'comets', 'storm', 'alien'].includes(k);
    const phase = active ? (ph < 2.2 ? 'warning' : 'response') : t - s.end < 5 ? 'recovered' : 'calm';
    if (phase !== s.last) { s.last = phase; onPhase?.(phase, active ? k : null, s.name); }

    // Envelopes (artistic timing), plume and agitation from real state.
    const evade = active ? ss(1.4, 4.2, ph) : 0;
    const idle = dr.engineOut ? 0.02 + 0.06 * Math.abs(Math.sin(t * 9)) : 0.12;
    s.haz = ease(s.haz, active && outerHaz ? 1 : 0, dt, active ? 1.6 : 1.0);
    s.alert = ease(s.alert, Math.max(active ? (ph < 6 ? 1 : 0.5) : 0, dr.damage * 1.6), dt, 2.5);
    s.burn = ease(s.burn, Math.max(idle, dr.burn), dt, 6);
    s.shield = ease(s.shield, active && outerHaz && k !== 'bh' ? ss(1.0, 1.6, ph) : 0, dt, 4);
    s.fire = ease(s.fire, active && k === 'fire' ? 1 : 0, dt, 3);

    const d = DODGE[k];
    const pull = active && k === 'bh' ? ss(0, 1.5, ph) * (1 - ss(1.5, 3, ph)) * 0.35 : 0;
    const hold = active ? (ph < 6 ? evade : 0.7) : 0;
    s.ox = ease(s.ox, d.x * hold + pull, dt, 3);
    s.oy = ease(s.oy, d.y * hold - pull * 0.3, dt, 3);
    s.roll = ease(s.roll, d.roll * s.burn * 0.6 + (active ? Math.sin(t * 2.3) * 0.04 * s.alert : 0), dt, 4);
    s.yaw = ease(s.yaw, -0.2 * s.burn * Math.sign(d.y || 1), dt, 3);

    // Ship pose.
    const base = layout.pos;
    outer.current.position.set(base[0], base[1] + Math.sin(t * 0.6) * 0.06, base[2]);
    yawG.current.position.set(s.ox, s.oy, 0);
    yawG.current.rotation.set(0.28 + Math.sin(t * 0.4) * 0.03, Math.PI / 2 - 0.35 + s.yaw, 0);
    rollG.current.rotation.z = s.roll + Math.sin(t * 0.5) * 0.05;

    if (fallback) {
      // CSS painting behind a transparent canvas: just draw the ship.
      gl.setRenderTarget(null);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, true);
      gl.render(state.scene, camera);
      return;
    }

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
    const comets = [u.uComet0.value, u.uComet1.value, u.uComet2.value];
    const ca = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const c0 = 0.3 + i * 0.85;
      const live = k === 'comets' && ph > c0 ? s.haz : 0;
      const prog = ((ph - c0) / 2.6) % 1;
      const sx = rest.x + 0.95, sy = rest.y + 0.62 - i * 0.08;
      const ex = rest.x - 0.75, ey = rest.y - 0.32 + i * 0.1;
      const dx = ex - sx, dy = ey - sy, dl = Math.hypot(dx, dy);
      comets[i].set(sx + dx * prog, sy + dy * prog, dx / dl, dy / dl);
      ca[i] = live * ss(0, 0.08, prog) * (1 - ss(0.9, 1, prog));
    }
    u.uCometA.value.set(ca[0], ca[1], ca[2]);

    // Render: ship → FBO, then the painting to screen.
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
    gl.render(state.scene, camera);
    gl.setRenderTarget(null);
    gl.render(post.scene, post.cam);

    // Self-check: the painted sky is never black. If it is (shader/driver failure), fall back.
    s.frame += 1;
    if (s.frame === 20 || s.frame === 60 || s.frame === 120) {
      const lum = probeBrightness(gl, [[0.08, 0.9], [0.5, 0.95], [0.3, 0.7], [0.9, 0.8]]);
      if (lum < 8) s.dark += 1;
      if (s.dark >= 2) { console.warn('[Starry Night] painting pass produced a black frame — using CSS fallback'); onFail('black'); }
    }
    // Weak GPU: lower the resolution once rather than stutter.
    if (s.frame > 30 && s.slowN < 60) { s.slow += dtRaw; s.slowN += 1; if (s.slowN === 60 && s.slow / 60 > 0.07) setDpr(0.6); }
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

/**
 * The painted canvas (WebGL) with a CSS painting behind it as the fallback:
 * 'ship' = canvas draws only the ship over the CSS painting; 'css' = no WebGL at all.
 */
function Stage({ drive, event, layout, onPhase }) {
  const [mode, setMode] = useState(initialGlMode);
  const fail = useMemo(() => (reason) => setMode((m) => m ?? (reason === 'error' || reason === 'context' ? 'css' : 'ship')), []);
  const alive = useRef(false);
  useEffect(() => {
    // Canvas never produced a frame (context creation failed silently) → CSS painting.
    const id = setTimeout(() => { if (!alive.current) fail('error'); }, 6000);
    return () => clearTimeout(id);
  }, [fail]);
  return (
    <div className={`vk-stage ${mode ? 'vk-fallback vk-paintbg' : ''}`} aria-hidden="true">
      {mode !== 'css' && (
        <GlBoundary tag="Starry Night" onFail={fail}>
          <Canvas dpr={[1, 1.25]} camera={{ position: [0, 0, 10], fov: 40 }} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}>
            <Painting drive={drive} event={event} layout={layout} onPhase={onPhase} fallback={mode === 'ship'} onFail={fail} onAlive={() => { alive.current = true; }} />
          </Canvas>
        </GlBoundary>
      )}
    </div>
  );
}

const WARN = {
  bh: 'A black hole stirs off the bow — the sky begins to spiral inward.',
  comets: 'Rocks inbound, their tails dragged across the swirl.',
  storm: 'The Sun erupts — a surge of yellow strokes rolls outward.',
  alien: 'An unknown emerald light pulses in the dark.',
  fire: 'Fire aboard — the hull glows like a lantern.',
  engine: 'The engine sputters; the plume gutters out.',
  inner: 'Something is wrong aboard — Main Judging evaluating.',
};
const NUMERAL = { warning: 'I', response: 'II', recovered: 'III' };

/** Caption: painted line on warning, then the real newest log entry. */
function Caption({ ph, latest }) {
  if (ph.phase === 'calm') return null;
  const text = ph.phase === 'warning' ? WARN[ph.kind] ?? WARN.inner : ph.phase === 'recovered' ? 'The canvas settles — course held.' : latest;
  return (
    <div key={ph.phase + ph.kind} className={`vk-caption ${ph.phase === 'response' ? 'evasive' : ph.phase}`}>
      <small>{NUMERAL[ph.phase]}. {ph.name ?? 'Course restored'}</small>
      <p>{text}</p>
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
      <div className={`vk-met ${alert ? 'alert' : ''}`}>{sim.status} · MET {sim.met}</div>
    </header>
  );
}

const LOOP = ['Black Hole Encounter', 'Asteroid Collision', 'Solar Storm', 'Alien Encounter'];

/** Home: auto-playing emergency sequence every 15 s (a showcase; the console runs on real state). */
function useLoopDrive() {
  const drive = useRef(NO_DRIVE);
  const [ev, setEv] = useState(null);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      const cyc = Math.floor(s / 15), local = s % 15;
      const name = local > 2.5 && local < 12.5 ? LOOP[cyc % LOOP.length] : null;
      drive.current = name ? { ...NO_DRIVE, kind: HOME_KIND[name], name, burn: local > 4 && local < 7 ? 1 : 0 } : NO_DRIVE;
      setEv((cur) => ((cur?.name ?? null) === name ? cur : name ? { name, severity: 65 } : null));
    }, 200);
    return () => clearInterval(id);
  }, []);
  return [drive, ev];
}

function Home({ sim, onTab }) {
  const [drive, ev] = useLoopDrive();
  const [ph, setPh] = useState({ phase: 'calm', kind: null, name: null });
  return (
    <div className="vk vk-home ikl-scope">
      <Stage drive={drive} event={ev} layout={LAYOUT.home} onPhase={(phase, kind, name) => setPh({ phase, kind, name })} />
      <Nav tab="Home" onTab={onTab} sim={sim} alert={!!ev} />
      <div className="vk-title">
        <h1>Interstellar X<sup>4</sup></h1>
        <p>{TAGLINE}</p>
      </div>
      <Caption ph={ph} latest="AI agents respond — evasive strokes across the canvas." />
      <aside className="vk-placard">
        <div className="vk-placard-head">
          <strong>Interstellar X<sup>4</sup></strong>
          <span>The Voyage, {sim.nav.origin} to {sim.nav.destination}</span>
        </div>
        <em>Oil on canvas · Day {sim.day} · MET {sim.met} · {sim.velocity} km/s · integrity {sim.systems[0].value}%</em>
        <p>{LEAD}</p>
        <ul>{FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
        <button className="vk-cta" onClick={() => onTab('Generator')}>Launch the simulator <span>→</span></button>
      </aside>
    </div>
  );
}

function Generator({ sim, tab, onTab }) {
  const d = sim.demo;
  const hz = useHazards(sim);
  const [view, setView] = useState('painting');
  const [resetCount, resetView] = useViewReset();
  const [ph, setPh] = useState({ phase: 'calm', kind: null, name: null });
  const drive = useRef(NO_DRIVE);
  const threat = realThreat(sim);
  drive.current = { ...threat, kind: PAINT_KIND[threat.kind] ?? null };

  // Pointer-armed launches need the real 3D view.
  useEffect(() => { if (d.armed) setView('physics'); }, [d.armed]);
  const physics = view === 'physics';
  const alert = Boolean(threat.kind);

  return (
    <div className={`vk vk-console ikl-scope ${physics ? 'vk-physics' : ''}`}>
      {physics ? (
        <div className="vk-stage vk-phys-stage">
          <DemoViewport sim={sim} resetCount={resetCount}>
            <div className="vk-phys-varnish" aria-hidden="true" />
            {d.stormFlash > 0 && <div key={d.stormFlash} className="ikl-flash" aria-hidden="true" />}
            {hz.armed && <div className="ikl-armed vk-armed">Click the canvas to launch {hz.armed} · Esc to cancel</div>}
          </DemoViewport>
        </div>
      ) : (
        <Stage drive={drive} event={sim.event} layout={LAYOUT.console} onPhase={(phase, kind, name) => setPh({ phase, kind, name })} />
      )}
      <Nav tab={tab} onTab={onTab} sim={sim} alert={alert} />
      <div className="vk-toggle" role="group" aria-label="Generator view">
        <button className={!physics ? 'on' : ''} aria-pressed={!physics} onClick={() => { setView('painting'); d.setArmed(null); }}>Painting</button>
        <button className={physics ? 'on' : ''} aria-pressed={physics} onClick={() => setView('physics')}>Physics</button>
      </div>
      {!physics && <Caption ph={ph} latest={sim.logs[0]?.text ?? ''} />}

      <aside className="vk-panel vk-left">
        <h3>Outer hazards</h3>
        <div className="vk-chips">
          {OUTER.map((n) => {
            const s = hz.state(n);
            return <button key={n} className={s === 'armed' ? 'armed' : s ? 'on' : ''} aria-pressed={Boolean(s)} onClick={() => hz.press(n)}>{n}</button>;
          })}
        </div>
        <h3>Inner hazards</h3>
        <div className="vk-chips">
          {INNER.map((n) => (
            <button key={n} className={hz.state(n) ? 'on' : ''} aria-pressed={Boolean(hz.state(n))} onClick={() => hz.press(n)}>{n}</button>
          ))}
        </div>
        <p className={`vk-hint ${hz.armed ? 'on' : ''}`}>{hz.hint}</p>
        <details className="vk-sec">
          <summary>Space rock</summary>
          <RockForm sim={sim} />
        </details>
        <details className="vk-sec">
          <summary>Propulsion</summary>
          <Propulsion sim={sim} />
        </details>
        <details className="vk-sec" open>
          <summary>AI management</summary>
          <AiControls sim={sim} onOpenApi={() => onTab('AI API')} />
        </details>
        <button className="vk-reset" onClick={sim.clear}>Restore the canvas · reset</button>
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
            <li key={a.id} className={a.ok ? '' : 'warn'} title={a.reason || undefined}><span>{a.name}</span><em>{a.state}</em></li>
          ))}
        </ul>
        <details className="vk-sec">
          <summary>Flight data</summary>
          <FlightData sim={sim} />
        </details>
        <details className="vk-sec" open={threat.damage > 0}>
          <summary>Component damage</summary>
          <Damage sim={sim} />
        </details>
        <details className="vk-sec" open>
          <summary>Nearby objects</summary>
          <Nearby sim={sim} />
        </details>
        <h3>Ship’s log</h3>
        <ol className="vk-log">
          {sim.logs.slice(0, 8).map((l) => (
            <li key={l.id} className={l.alert ? 'alert' : ''}><time>{l.time}</time> {l.text}</li>
          ))}
        </ol>
      </aside>

      <div className="vk-transport">
        <Transport sim={sim} onResetView={physics ? resetView : undefined} />
      </div>
      <div className="vk-label">
        {sim.nav.origin} → {sim.nav.destination} · {sim.nav.phase} · {sim.velocity} km/s · {d.physics.mode}
        <em>{physics ? 'Study from life · browser physics' : 'Oil on canvas'} · Day {sim.day}</em>
      </div>
    </div>
  );
}

/** Other tabs: the real page body in a gilded frame on a (cheap, CSS) painted wall. */
function Gallery({ sim, tab, onTab, children, aside, narrow }) {
  return (
    <div className="vk vk-gallery vk-paintbg ikl-scope">
      <Nav tab={tab} onTab={onTab} sim={sim} alert={Boolean(sim.event)} />
      <div className={`vk-gallery-body ${aside ? 'with-aside' : ''}`}>
        <div className={`vk-frame ${narrow ? 'narrow' : ''}`}>
          <div className="vk-frame-in ikl-embed">{children}</div>
        </div>
        {aside}
      </div>
    </div>
  );
}

function Console({ sim, tab, onTab }) {
  if (tab === 'Generator') return <Generator sim={sim} tab={tab} onTab={onTab} />;
  if (tab === 'Planetary Trajectories') {
    return (
      <Gallery sim={sim} tab={tab} onTab={onTab} aside={(
        <aside className="vk-placard vk-placard-side">
          <div className="vk-placard-head"><strong>The Voyage</strong><span>{sim.nav.origin} to {sim.nav.destination}</span></div>
          <em>Chart on canvas · {sim.demo.celestialDate.slice(0, 10)}</em>
          <dl className="vk-kv">{missionRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </aside>
      )}>
        <TrajectoriesView sim={sim} />
      </Gallery>
    );
  }
  if (tab === 'AI Logs') return <Gallery sim={sim} tab={tab} onTab={onTab}><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Gallery>;
  if (tab === 'AI API') return <Gallery sim={sim} tab={tab} onTab={onTab} narrow><div className="vk-scroll"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></div></Gallery>;
  return <Gallery sim={sim} tab={tab} onTab={onTab}><SpacecraftView sim={sim} /></Gallery>;
}

export default function VariantK({ page, tab, onTab, sim }) {
  return page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} tab={tab} onTab={onTab} />;
}
