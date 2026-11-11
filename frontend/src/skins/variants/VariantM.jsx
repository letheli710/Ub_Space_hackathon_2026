// Variant M: Meteor Storm. A chase-cam action scene: the ship threads an asteroid storm near the main
// belt with Jupiter looming. On the Generator it is driven by the REAL demo session: the threat board
// and target brackets track the real nearby rocks/debris (distance, closing speed, time to contact),
// inbound hazards, the black hole and solar storm; real burns light the engine and real impacts trigger
// the strike effect. "Action / Physics" swaps in the real DemoViewport inside the same frame.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Stars } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import StationShip from '../../components/station/StationShip.jsx';
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset,
} from '../demoSkin.jsx';
import {
  AiControls, ArmedHint, EventLog, HazardControls, MissionInfo, PropulsionControls, RockControls, SceneBoundary, Telemetry, Transport,
  realThreats, useArmedSwitch, useOnImpact, useShaderGuard,
} from './variantMNOKit.jsx';
import './variantMNOKit.css';
import './variantM.css';

const V = 30; // world closing speed (units / sim-second)
const SUN = [280, 110, 520];
const JUP = [-210, 34, 390];

// ---------- tiny deterministic noise / rng ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const sm = (t) => t * t * (3 - 2 * t);
  const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (a, b, d) => hash(xi + a, yi + b, zi + d);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z, o = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) {
    v += a * noise(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return v / (1 - Math.pow(0.5, o));
}

function rockGeometry(seed, kind = 'ico', detail = 1) {
  let g = kind === 'ico' ? new THREE.IcosahedronGeometry(1, detail) : new THREE.DodecahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 1.2 + seed, v.y * 1.2, v.z * 1.2 - seed, 4);
    const n2 = noise(v.x * 3.3, v.y * 3.3 + seed, v.z * 3.3);
    v.multiplyScalar(0.55 + n * 0.75 + n2 * 0.14);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

let dotTexture;
function dot() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.22, 'rgba(255,255,255,0.65)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

function makeState() {
  return {
    phase: 'cruise', timer: 1.4, cycle: 0, outcome: 'nearmiss', missDist: 0, lastD: 0,
    ts: 1, tsTarget: 1, sdt: 0, time: 0, frame: 0, shake: 0,
    ship: { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, tx: 0, ty: 0, roll: 0, kick: 0 },
    threat: { active: false, id: null, pos: new THREE.Vector3(0, 0, 300), side: 1, speed: 36, rot: 0 },
    impact: { seq: 0, p: new THREE.Vector3() },
    proxies: Array.from({ length: 3 }, () => ({ on: false, id: null, o: null, pos: new THREE.Vector3(0, 0, 200) })),
    real: { main: null, others: [], thrusting: false, burn: false, correcting: false, bh: false, storm: false, alien: false, alienLabel: '', damaged: false },
    rocks: [], brEls: [], alienP: null, page: 'home', flash: null,
  };
}


const ZS = 0.22; // metres of real distance → scene units along the approach axis
const idHash = (id) => {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
};

// ---------- director ----------
// Home: the scripted-but-reactive emergency reel. Generator: follows the real physics objects in S.real.
function Director({ S, page, onPhase }) {
  S.page = page;
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    S.ts += (S.tsTarget - S.ts) * Math.min(1, dt * 5);
    const sdt = dt * S.ts;
    S.sdt = sdt;
    S.time += sdt;
    S.frame++;
    S.shake *= Math.exp(-dt * 2.4);
    const sh = S.ship;
    const go = (p, timer) => {
      S.phase = p;
      if (timer != null) S.timer = timer;
      onPhase(p);
    };
    if (page === 'home') scripted(S, sdt, dt, go);
    else realStep(S, sdt, dt, go);
    // ship: damped spring toward the lateral target
    const k = 7, c = 4.6;
    sh.ax = k * (sh.tx - sh.x) - c * sh.vx;
    sh.ay = k * (sh.ty - sh.y) - c * sh.vy;
    sh.vx += sh.ax * sdt;
    sh.vy += sh.ay * sdt;
    sh.x += sh.vx * sdt;
    sh.y += sh.vy * sdt;
    sh.kick *= Math.exp(-sdt * 2.5);
    sh.roll += (-sh.vx * 0.14 + sh.kick - sh.roll) * Math.min(1, sdt * 4);
  });
  return null;
}

/** Home reel: a threat every few seconds, alternating near misses and glancing strikes. */
function scripted(S, sdt, dt, go) {
  const sh = S.ship, T = S.threat;
  if (T.active) {
    T.pos.z -= T.speed * sdt;
    T.rot += sdt * 0.8;
  }
  switch (S.phase) {
    case 'cruise': {
      S.timer -= sdt;
      sh.tx = Math.sin(S.time * 0.45) * 0.7;
      sh.ty = Math.sin(S.time * 0.31) * 0.35;
      if (S.timer <= 0) {
        S.outcome = S.cycle % 3 === 2 ? 'impact' : 'nearmiss';
        S.cycle++;
        T.active = true;
        T.id = 'TH-01';
        T.side = Math.random() < 0.5 ? -1 : 1;
        T.pos.set(sh.x + T.side * 0.5, sh.y + (Math.random() - 0.5) * 0.6, 112);
        T.speed = 36;
        go('threat');
      }
      break;
    }
    case 'threat':
      if (T.pos.z / T.speed < 1.95) {
        const imp = S.outcome === 'impact';
        sh.tx = sh.x - T.side * (imp ? 1.7 : 4.6);
        sh.ty = sh.y + (imp ? 0.2 : -0.9);
        go('evade');
      }
      break;
    case 'evade':
      if (S.outcome === 'impact') {
        if (T.pos.z < 34) {
          const k = Math.min(1, sdt * 3.2);
          T.pos.x += (sh.x + T.side * 1.15 - T.pos.x) * k;
          T.pos.y += (sh.y + 0.15 - T.pos.y) * k;
        }
        if (T.pos.z < 1.6) {
          T.active = false;
          strike(S, T.side);
          go('impact', 1.7);
        }
      } else if (T.pos.z < 8) {
        S.missDist = Math.max(4, Math.round((Math.hypot(T.pos.x - sh.x, T.pos.y - sh.y) - 2.6) * 10));
        S.tsTarget = 0.16;
        go('nearmiss');
      }
      break;
    case 'nearmiss':
      if (T.pos.z < -6) {
        S.tsTarget = 1;
        sh.tx = 0;
        sh.ty = 0;
        go('recover', 1.9);
      }
      break;
    case 'impact':
      S.timer -= dt;
      if (S.timer <= 0) {
        sh.tx = 0;
        sh.ty = 0;
        go('recover', 1.9);
      }
      break;
    case 'recover':
      S.timer -= sdt;
      if (S.timer <= 0) go('cruise', 2.0);
      break;
    default:
  }
  if (T.active && T.pos.z < -40) T.active = false;
}

/** Generator: the nearest real closing rock is the threat; real thrust drives the dodge. */
function realStep(S, sdt, dt, go) {
  const sh = S.ship, T = S.threat, R = S.real;
  const main = R.main;
  S.tsTarget = S.phase === 'nearmiss' ? 0.2 : 1;
  if (S.phase === 'impact') {
    S.timer -= dt;
    if (S.timer <= 0) go(main ? 'threat' : 'recover', 1.6);
  } else if (main) {
    if (!T.active || T.id !== main.id) {
      T.active = true;
      T.id = main.id;
      T.side = idHash(main.id) < 0.5 ? -1 : 1;
      T.pos.set(sh.x + T.side * 3.2, sh.y + 0.4, Math.min(112, main.d * ZS));
    }
    S.lastD = main.d;
    const zt = Math.min(112, Math.max(0.8, main.d * ZS));
    T.pos.z += (zt - T.pos.z) * Math.min(1, dt * 6);
    const far = Math.min(1, T.pos.z / 40);
    T.pos.x += (sh.x + T.side * (0.9 + 2.3 * far) - T.pos.x) * Math.min(1, dt * 2);
    T.pos.y += (sh.y + 0.2 - T.pos.y) * Math.min(1, dt * 2);
    T.rot += dt * 0.8;
    const soon = main.tti != null && main.tti < 4;
    if (soon && R.thrusting) {
      sh.tx = -T.side * 2.6;
      sh.ty = -0.5;
    } else {
      sh.tx = Math.sin(S.time * 0.45) * 0.4;
      sh.ty = Math.sin(S.time * 0.31) * 0.2;
    }
    const ph = main.tti != null && main.tti < 2.5 ? 'evade' : 'threat';
    if (S.phase !== ph) go(ph);
  } else {
    if (T.active) {
      T.active = false;
      T.id = null;
      if (S.phase === 'threat' || S.phase === 'evade') go('nearmiss', 1.1);
    }
    if (S.phase === 'nearmiss' || S.phase === 'recover') {
      S.timer -= dt;
      if (S.timer <= 0) go(S.phase === 'nearmiss' ? 'recover' : 'cruise', 1.6);
    } else if (S.phase !== 'cruise') go('cruise');
    sh.tx = Math.sin(S.time * 0.45) * 0.7;
    sh.ty = Math.sin(S.time * 0.31) * 0.35;
  }
  // Secondary real objects (other rocks, debris) are drawn as proxy rocks at their real distance.
  R.others.forEach((o, i) => {
    const P = S.proxies[i];
    if (!P) return;
    const h = idHash(o.id), z = Math.min(120, Math.max(2, o.d * ZS));
    if (P.id !== o.id) {
      P.id = o.id;
      P.pos.set(sh.x + (h - 0.5) * 16, (idHash(`${o.id}y`) - 0.5) * 7, z);
    }
    P.pos.z += (z - P.pos.z) * Math.min(1, dt * 5);
    P.on = true;
    P.o = o;
  });
  for (let i = R.others.length; i < S.proxies.length; i++) S.proxies[i].on = false;
}

/** Strike effect at the ship: sparks, debris, shake and the red flash. */
function strike(S, side = 1) {
  const sh = S.ship;
  S.impact.p.set(sh.x + side * 0.9, sh.y + 0.2, 0.9);
  S.impact.seq++;
  S.shake = 1.4;
  sh.kick += -side * 0.55;
  sh.vx += -side * 3.5;
  S.flash?.();
}

// ---------- rocks ----------
function placeRock(o, r, z) {
  o.s = 0.14 + Math.pow(r(), 3.2) * 3.4;
  const a = r() * Math.PI * 2;
  let d = 3.6 + Math.pow(r(), 1.5) * 46;
  if (o.s > 1.4) d += 9;
  o.p.set(Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.55, z);
}

let rockId = 100;
function RockField({ S, count = 440 }) {
  const geos = useMemo(() => [rockGeometry(3, 'ico', 1), rockGeometry(17, 'dode', 0)], []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0.04, flatShading: true }), []);
  const A = useRef();
  const B = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const rocks = useMemo(() => {
    const r = rng(99);
    const arr = [];
    for (let i = 0; i < count; i++) {
      const o = {
        id: rockId++, m: i % 2, i: i >> 1, p: new THREE.Vector3(),
        axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        ang: r() * 6.28, spin: (r() - 0.5) * 2.4, s: 1,
        st: new THREE.Vector3(0.8 + r() * 0.6, 0.65 + r() * 0.5, 0.8 + r() * 0.5),
      };
      placeRock(o, r, -22 + r() * 200);
      arr.push(o);
    }
    return arr;
  }, [count]);

  useLayoutEffect(() => {
    const r = rng(5);
    const dark = new THREE.Color('#4a3f36');
    const light = new THREE.Color('#a8998a');
    const col = new THREE.Color();
    for (const o of rocks) {
      col.copy(dark).lerp(light, r() * 0.9);
      (o.m ? B : A).current.setColorAt(o.i, col);
    }
    A.current.instanceColor.needsUpdate = true;
    B.current.instanceColor.needsUpdate = true;
    mat.needsUpdate = true;
    S.rocks = rocks;
  }, [rocks, mat, S]);

  useFrame(() => {
    const sdt = S.sdt;
    const bh = S.real.bh;
    for (const o of rocks) {
      o.p.z -= V * sdt;
      if (bh) o.p.x -= sdt * (3 + 6 / (1 + o.s));
      if (o.p.z < -22 || o.p.x < -75) {
        placeRock(o, Math.random, 172 + Math.random() * 8);
        o.id = rockId++;
      }
      o.ang += o.spin * sdt;
      dummy.position.copy(o.p);
      dummy.quaternion.setFromAxisAngle(o.axis, o.ang);
      dummy.scale.copy(o.st).multiplyScalar(o.s);
      dummy.updateMatrix();
      (o.m ? B : A).current.setMatrixAt(o.i, dummy.matrix);
    }
    A.current.instanceMatrix.needsUpdate = true;
    B.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={A} args={[geos[0], mat, Math.ceil(count / 2)]} frustumCulled={false} />
      <instancedMesh ref={B} args={[geos[1], mat, Math.floor(count / 2)]} frustumCulled={false} />
    </>
  );
}

/** The main threat: the scripted rock on Home, the nearest real closing rock on the Generator. */
function ThreatRock({ S }) {
  const geo = useMemo(() => rockGeometry(23, 'ico', 3), []);
  const ref = useRef();
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ff4b3e', transparent: true, opacity: 0, fog: false, depthWrite: false }));
    l.frustumCulled = false;
    return l;
  }, []);
  useFrame(() => {
    const T = S.threat;
    ref.current.visible = T.active;
    ref.current.position.copy(T.pos);
    ref.current.rotation.set(T.rot * 0.7, T.rot, T.rot * 0.3);
    const a = line.geometry.attributes.position;
    a.setXYZ(0, T.pos.x, T.pos.y, T.pos.z);
    a.setXYZ(1, T.pos.x, T.pos.y, -12);
    a.needsUpdate = true;
    const on = T.active && (S.phase === 'threat' || S.phase === 'evade');
    line.material.opacity += ((on ? 0.7 : 0) - line.material.opacity) * 0.15;
  });
  return (
    <>
      <mesh ref={ref} geometry={geo} scale={[2.1, 1.6, 1.8]}>
        <meshStandardMaterial color="#8a7a69" roughness={0.92} metalness={0.05} flatShading />
      </mesh>
      <primitive object={line} />
    </>
  );
}

/** Up to three more real objects (rocks / wreckage) at their real distance. */
function Proxies({ S }) {
  const geo = useMemo(() => rockGeometry(57, 'dode', 1), []);
  const refs = useRef([]);
  useFrame(() => {
    S.proxies.forEach((P, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.visible = P.on && S.page !== 'home';
      m.position.copy(P.pos);
      m.rotation.set(S.time * 0.5 + i, S.time * 0.7, 0);
    });
  });
  return S.proxies.map((_, i) => (
    <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={geo} scale={1.1} visible={false}>
      <meshStandardMaterial color={i ? '#7d6f62' : '#9a8877'} roughness={0.9} flatShading />
    </mesh>
  ));
}
// ---------- streaks, dust ----------
function Streaks({ S, count, color, dir, box, len, speed, opacity = 1, hole = true }) {
  const d = useMemo(() => new THREE.Vector3(...dir).normalize(), [dir]);
  const { geo, p } = useMemo(() => {
    const r = rng(count * 13 + 7);
    const pos = new Float32Array(count * 6);
    const col = new Float32Array(count * 6);
    const p = new Float32Array(count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      let x = box[0][0] + r() * (box[0][1] - box[0][0]);
      const y = box[1][0] + r() * (box[1][1] - box[1][0]);
      if (hole && Math.abs(x) < 2.4 && Math.abs(y) < 1.6) x += x < 0 ? -2.6 : 2.6;
      p.set([x, y, box[2][0] + r() * (box[2][1] - box[2][0])], i * 3);
      const b = 0.3 + r() * 0.7;
      col.set([c.r * b, c.g * b, c.b * b, 0, 0, 0], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { geo: g, p };
  }, [count, color, box, hole]);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), [opacity]);
  useFrame(() => {
    const step = speed * S.sdt;
    const L = len * Math.max(0.1, S.ts);
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      for (let a = 0; a < 3; a++) {
        let v = p[i * 3 + a] + d.getComponent(a) * step;
        const lo = box[a][0], hi = box[a][1];
        if (v < lo) v += hi - lo;
        else if (v > hi) v -= hi - lo;
        p[i * 3 + a] = v;
        pos[i * 6 + a] = v;
        pos[i * 6 + 3 + a] = v - d.getComponent(a) * L;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });
  return <lineSegments geometry={geo} material={mat} frustumCulled={false} />;
}

const SPEED_BOX = [[-22, 22], [-12, 12], [-18, 120]];
const STORM_BOX = [[-60, 60], [-30, 30], [-15, 120]];

function Dust({ S, count = 1400 }) {
  const geo = useMemo(() => {
    const r = rng(31);
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) a.set([(r() - 0.5) * 56, (r() - 0.5) * 28, -15 + r() * 125], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return g;
  }, [count]);
  useFrame(() => {
    const a = geo.attributes.position.array;
    const s = V * S.sdt;
    for (let i = 2; i < a.length; i += 3) {
      a[i] -= s;
      if (a[i] < -15) a[i] += 125;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.11} map={dot()} color="#c8b296" transparent opacity={0.5} depthWrite={false} sizeAttenuation />
    </points>
  );
}

// ---------- backdrop: Jupiter, Sun, black hole ----------
const jupVert = /* glsl */ `
  varying vec3 vN; varying vec3 vWN; varying vec3 vView;
  void main(){
    vN = normal;
    vWN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const jupFrag = /* glsl */ `
  uniform float uTime; uniform vec3 uSun;
  varying vec3 vN; varying vec3 vWN; varying vec3 vView;
  float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
  float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y),
               mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y), f.z); }
  float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n3(p); p*=2.03; a*=0.5; } return v; }
  void main(){
    vec3 n = normalize(vN);
    float lat = n.y;
    float lon = atan(n.z, n.x);
    vec3 q = n * 2.6; q.x += uTime * 0.01;
    float w = fbm(q * vec3(1.0, 5.0, 1.0) + fbm(q * 3.0) * 1.1);
    float b = lat * 7.5 + w * 1.5;
    float band = sin(b * 3.14159);
    vec3 cream = vec3(0.94, 0.88, 0.77), tan = vec3(0.80, 0.62, 0.44), brown = vec3(0.50, 0.35, 0.25), rust = vec3(0.76, 0.40, 0.25);
    vec3 col = mix(cream, tan, smoothstep(-0.35, 0.65, band));
    col = mix(col, brown, smoothstep(0.5, 0.95, sin(b * 1.7 + 1.3)) * 0.55);
    col *= 0.82 + 0.32 * fbm(q * vec3(5.0, 24.0, 5.0));
    vec2 d = vec2((lon - 0.9) * 1.1, (lat + 0.32) * 2.6);
    float spot = smoothstep(0.26, 0.04, length(d) + (fbm(n * 14.0) - 0.5) * 0.12);
    col = mix(col, rust, spot * 0.85);
    col *= mix(1.0, 0.62, smoothstep(0.62, 0.96, abs(lat)));
    vec3 wn = normalize(vWN);
    float diff = dot(wn, uSun);
    float light = smoothstep(-0.12, 0.65, diff);
    float rim = pow(1.0 - max(dot(wn, vView), 0.0), 3.0);
    vec3 c = col * light * 1.05 + vec3(1.0, 0.78, 0.52) * rim * 0.45 * smoothstep(-0.25, 0.35, diff);
    gl_FragColor = vec4(c, 1.0);
  }`;

function Jupiter({ lowfx }) {
  const ref = useRef();
  const flat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9a27c', roughness: 1 }), []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(SUN[0] - JUP[0], SUN[1] - JUP[1], SUN[2] - JUP[2]).normalize() } },
      vertexShader: jupVert, fragmentShader: jupFrag,
    }),
    [],
  );
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    ref.current.rotation.y = s.clock.elapsedTime * 0.006;
  });
  return (
    <group position={JUP} rotation={[0.18, 0, 0.06]}>
      <mesh ref={ref} material={lowfx ? flat : mat}>
        <sphereGeometry args={[150, 96, 64]} />
      </mesh>
    </group>
  );
}

function SunFlare() {
  const t = dot();
  const S2 = (scale, color, opacity) => (
    <sprite scale={scale}>
      <spriteMaterial map={t} color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
    </sprite>
  );
  return (
    <group position={SUN}>
      {S2([520, 520, 1], '#ffb46b', 0.22)}
      {S2([140, 140, 1], '#ffe2b8', 0.75)}
      {S2([46, 46, 1], '#ffffff', 1)}
      {S2([1500, 9, 1], '#ffd9a8', 0.55)}
      {S2([700, 3, 1], '#ffffff', 0.5)}
    </group>
  );
}

const bhFrag = /* glsl */ `
  uniform float uTime; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0; p.y *= 1.0;
    float r = length(p); float a = atan(p.y, p.x);
    float core = smoothstep(0.25, 0.22, r);
    float ring = exp(-pow((r - 0.27) / 0.02, 2.0));
    float swirl = 0.5 + 0.5 * sin(a * 3.0 - log(r + 0.001) * 9.0 + uTime * 2.2);
    float disk = smoothstep(1.0, 0.32, r) * smoothstep(0.24, 0.38, r) * (0.35 + 0.65 * swirl);
    vec3 col = vec3(1.0, 0.58, 0.26) * disk * 1.1 + vec3(1.0, 0.92, 0.82) * ring * 1.6;
    float alpha = clamp(core + disk * 0.85 + ring, 0.0, 1.0);
    col = mix(col, vec3(0.0), core);
    gl_FragColor = vec4(col, alpha);
  }`;
const uvVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

function BlackHoleFx() {
  const mat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: uvVert, fragmentShader: bhFrag, transparent: true, depthWrite: false }), []);
  useFrame((s) => (mat.uniforms.uTime.value = s.clock.elapsedTime));
  return (
    <Billboard position={[-92, -20, 150]}>
      <mesh material={mat} rotation={[0, 0, 0.5]}>
        <planeGeometry args={[78, 78]} />
      </mesh>
    </Billboard>
  );
}

function Alien({ S }) {
  const ref = useRef();
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    ref.current.position.set(S.ship.x + 7.5 + Math.sin(t * 0.7) * 2, 2.6 + Math.sin(t * 1.3) * 0.7, 17 + Math.sin(t * 0.4) * 4);
    ref.current.scale.setScalar(1.6 + Math.sin(t * 9) * 0.25);
    S.alienP = ref.current.position;
  });
  return (
    <sprite ref={ref}>
      <spriteMaterial map={dot()} color="#c9fbff" transparent blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
    </sprite>
  );
}
// ---------- the ship ----------
const plumeVert = /* glsl */ `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const plumeFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying float vY;
  void main(){ float a = pow(1.0 - vY, 1.6) * uOpacity * (0.82 + 0.18 * sin(uTime * 70.0 + vY * 24.0)); gl_FragColor = vec4(uColor, a); }`;
const plumeGeo = (() => {
  const g = new THREE.ConeGeometry(1, 1, 18, 1, true);
  g.translate(0, 0.5, 0);
  return g;
})();
function makePlume(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: plumeVert, fragmentShader: plumeFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

const RCS = [
  { p: [1.05, 0.1, 1.7], rz: -Math.PI / 2, sx: 1 },
  { p: [1.05, 0.1, -1.6], rz: -Math.PI / 2, sx: 1 },
  { p: [-1.05, 0.1, 1.7], rz: Math.PI / 2, sx: -1 },
  { p: [-1.05, 0.1, -1.6], rz: Math.PI / 2, sx: -1 },
];

const VENTS = {
  'Oxygen Leak': { o: [0.7, 0.45, 0.6], c: '#eaf4ff', add: false, spread: [2.4, 0.5], size: 0.32 },
  'Spacecraft Fire': { o: [-0.6, 0.3, -0.6], c: '#ff7a2a', add: true, spread: [1.0, 1.4], size: 0.4 },
  'Engine Failure': { o: [0, 0, -2.8], c: '#7a6f66', add: false, spread: [0.8, 0.8], size: 0.5 },
  'Thruster Failure': { o: [0, 0, -2.8], c: '#7a6f66', add: false, spread: [0.8, 0.8], size: 0.5 },
  'Robotic Arm Malfunction': { o: [0.5, -0.4, 1.2], c: '#ffd36b', add: true, spread: [1.6, 1.6], size: 0.12 },
  'Solar Panel Power Crisis': { o: [1.4, 0.2, 0], c: '#ffd36b', add: true, spread: [1.6, 1.6], size: 0.12 },
  'AI System Malfunction': { o: [0, 0.5, 0.4], c: '#ffffff', add: true, spread: [1.2, 1.2], size: 0.08 },
  damage: { o: [0.45, 0.25, 0.2], c: '#ffb066', add: true, spread: [1.3, 1.3], size: 0.1 },
};

function Vent({ S, cfg }) {
  const N = 150;
  const { geo, seeds } = useMemo(() => {
    const r = rng(77);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const seeds = Array.from({ length: N }, () => [r(), (r() - 0.2) * cfg.spread[0], (r() - 0.5) * cfg.spread[1]]);
    return { geo: g, seeds };
  }, [cfg]);
  useFrame(() => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const [s, vx, vy] = seeds[i];
      const age = (S.time * 0.9 + s) % 1;
      a[i * 3] = cfg.o[0] + vx * age * 2;
      a[i * 3 + 1] = cfg.o[1] + vy * age * 2 + age * 0.3;
      a[i * 3 + 2] = cfg.o[2] - age * 6;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={cfg.size} map={dot()} color={cfg.c} transparent opacity={0.6} depthWrite={false} blending={cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending} />
    </points>
  );
}

function Ship({ S, event }) {
  const rig = useRef();
  const glow = useRef();
  const plume = useRef();
  const main = useMemo(() => makePlume('#a9c8ff'), []);
  const core = useMemo(() => makePlume('#ffffff'), []);
  const jets = useMemo(() => RCS.map(() => makePlume('#ffffff')), []);
  const engineOut = event?.name === 'Engine Failure' || event?.name === 'Thruster Failure';
  const vent = VENTS[event?.name];
  const damaged = S.real.damaged;
  useFrame((s) => {
    const sh = S.ship;
    const t = s.clock.elapsedTime;
    rig.current.position.set(sh.x, sh.y, 0);
    rig.current.rotation.set(-sh.vy * 0.05 + Math.sin(t * 0.7) * 0.01, sh.vx * 0.045, sh.roll);
    const sputter = engineOut ? (Math.random() < 0.25 ? 0.5 : 0.05) : 1;
    // A real main-engine burn (physics mode 'burn') lights the full plume.
    const real = S.page !== 'home';
    const burn = real ? (S.real.burn ? 1.9 : S.real.correcting ? 1.15 : 0.8) : S.phase === 'evade' ? 1.25 : 1;
    plume.current.scale.set(1, 1, burn);
    main.uniforms.uOpacity.value = 0.55 * sputter * Math.min(1.4, burn);
    core.uniforms.uOpacity.value = 0.9 * sputter;
    main.uniforms.uTime.value = core.uniforms.uTime.value = t;
    glow.current.material.opacity = 0.9 * sputter;
    glow.current.scale.setScalar((1.6 + Math.sin(t * 50) * 0.1) * burn);
    jets.forEach((m, i) => {
      const rcs = S.real.correcting && S.page !== 'home' && Math.sin(t * 9 + i * 2.1) > 0.4 ? 0.7 : 0;
      const want = Math.max(rcs, Math.min(1, (-RCS[i].sx * sh.ax - 1.2) / 5));
      m.uniforms.uOpacity.value += (want - m.uniforms.uOpacity.value) * 0.4;
      m.uniforms.uTime.value = t;
    });
  });
  return (
    <group ref={rig}>
      <group scale={0.15}>
        <group position={[0, 0, 3.5]}>
          <StationShip event={event} />
        </group>
      </group>
      <group ref={plume} position={[0, 0, -2.9]}>
        <mesh geometry={plumeGeo} material={main} rotation={[-Math.PI / 2, 0, 0]} scale={[0.42, 3.4, 0.42]} />
        <mesh geometry={plumeGeo} material={core} rotation={[-Math.PI / 2, 0, 0]} scale={[0.16, 1.6, 0.16]} />
        <sprite ref={glow}>
          <spriteMaterial map={dot()} color="#bcd4ff" transparent blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
        </sprite>
      </group>
      {RCS.map((j, i) => (
        <mesh key={i} geometry={plumeGeo} material={jets[i]} position={j.p} rotation={[0, 0, j.rz]} scale={[0.09, 1.0, 0.09]} />
      ))}
      {vent && <Vent S={S} cfg={vent} />}
      {damaged && S.page !== 'home' && <Vent S={S} cfg={VENTS.damage} />}
    </group>
  );
}

function Lights({ S, inner }) {
  const fill = useRef();
  const alarm = useRef();
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const f = inner ? (Math.random() < 0.09 ? 0.08 : 0.8 + 0.2 * Math.sin(t * 31)) : 1;
    fill.current.intensity = 70 * f;
    fill.current.position.set(S.ship.x + 2, S.ship.y + 3, -6);
    alarm.current.intensity = inner ? 26 * Math.pow(0.5 + 0.5 * Math.sin(t * 6), 2) : 0;
    alarm.current.position.set(S.ship.x - 1.5, S.ship.y + 1.5, 1);
  });
  return (
    <>
      <ambientLight intensity={0.16} color="#9aa6c0" />
      <hemisphereLight args={['#d6b48c', '#07070c', 0.35]} />
      <directionalLight position={SUN} intensity={3.4} color="#fff0da" />
      <pointLight ref={fill} intensity={70} distance={40} color="#d5ddff" />
      <pointLight ref={alarm} intensity={0} distance={14} color="#ff3a2e" />
    </>
  );
}

// ---------- AI evasion ribbon ----------
const ribbonFrag = /* glsl */ `
  uniform float uTime; uniform float uOpacity; varying vec2 vUv;
  void main(){
    float u = vUv.x; float e = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float body = smoothstep(0.0, 0.3, e);
    float rail = smoothstep(0.82, 1.0, 1.0 - e) * 0.0 + smoothstep(0.0, 0.08, e) * (1.0 - smoothstep(0.08, 0.2, e));
    float chev = step(0.55, fract(u * 24.0 - uTime * 2.4 + abs(vUv.y - 0.5) * 1.4));
    float a = uOpacity * pow(1.0 - u, 0.75) * (0.18 * body + 0.7 * chev * body + 0.8 * rail);
    vec3 col = mix(vec3(1.0, 0.96, 0.88), vec3(1.0, 0.66, 0.22), smoothstep(0.0, 0.55, u));
    gl_FragColor = vec4(col, a);
  }`;

function Ribbon({ S }) {
  const N = 56;
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const uv = new Float32Array((N + 1) * 4);
    const idx = [];
    for (let i = 0; i <= N; i++) {
      uv.set([i / N, 0, i / N, 1], i * 4);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 6), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: uvVert, fragmentShader: ribbonFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    return { geo: g, mat: m };
  }, []);
  useFrame((s) => {
    const sh = S.ship, ph = S.phase;
    let tx = sh.tx, op = 0;
    if (ph === 'threat') {
      tx = sh.x + (Math.floor(s.clock.elapsedTime * 6) % 2 ? 1 : -1) * 3.6;
      op = 0.4;
    } else if (ph === 'evade' || ph === 'nearmiss') op = 1;
    else if (ph === 'impact') op = 0.25;
    else if (ph === 'recover') op = 0.55;
    mat.uniforms.uOpacity.value += (op - mat.uniforms.uOpacity.value) * 0.12;
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    const a = geo.attributes.position.array;
    let px = sh.x, pz = 3.2;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const z = 3.2 + u * 48;
      const k = Math.min(1, u / 0.5);
      const e = k * k * (3 - 2 * k);
      const x = sh.x + (tx - sh.x) * e;
      const y = sh.y - 0.5 + (sh.ty - sh.y) * e;
      const dx = i ? x - px : 0, dz = i ? z - pz : 1;
      const l = Math.hypot(dx, dz) || 1;
      const w = 0.24 * (1 + u * 0.8);
      const nx = (dz / l) * w, nz = (-dx / l) * w;
      a.set([x - nx, y, z - nz, x + nx, y, z + nz], i * 6);
      px = x;
      pz = z;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}
// ---------- impact: sparks + debris ----------
function ImpactFx({ S }) {
  const NS = 180, ND = 28;
  const seen = useRef(0);
  const age = useRef(9);
  const sp = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    return { g, v: new Float32Array(NS * 3) };
  }, []);
  const deb = useMemo(() => Array.from({ length: ND }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), ax: new THREE.Vector3(1, 0, 0), s: 0.1 })), []);
  const geo = useMemo(() => rockGeometry(41, 'dode', 0), []);
  const dm = useRef();
  const spm = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const I = S.impact;
    const pos = sp.g.attributes.position.array;
    if (I.seq !== seen.current) {
      seen.current = I.seq;
      age.current = 0;
      for (let i = 0; i < NS; i++) {
        const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.7).normalize().multiplyScalar(4 + Math.random() * 14);
        pos.set([I.p.x, I.p.y, I.p.z], i * 3);
        sp.v.set([d.x, d.y, d.z], i * 3);
      }
      for (const o of deb) {
        o.p.copy(I.p);
        o.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.8).normalize().multiplyScalar(2 + Math.random() * 7);
        o.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        o.s = 0.05 + Math.random() * 0.22;
      }
    }
    const dt = S.sdt;
    age.current += dt;
    const a = age.current;
    const drag = Math.exp(-dt * 1.6);
    for (let i = 0; i < NS * 3; i++) {
      sp.v[i] *= drag;
      pos[i] += sp.v[i] * dt - (i % 3 === 2 ? V * 0.2 * dt : 0);
    }
    sp.g.attributes.position.needsUpdate = true;
    spm.current.opacity = Math.max(0, 1 - a / 1.2);
    deb.forEach((o, i) => {
      o.p.addScaledVector(o.v, dt);
      o.p.z -= V * 0.35 * dt;
      dummy.position.copy(o.p);
      dummy.quaternion.setFromAxisAngle(o.ax, a * 6 + i);
      dummy.scale.setScalar(a < 3.5 ? o.s : 0);
      dummy.updateMatrix();
      dm.current.setMatrixAt(i, dummy.matrix);
    });
    dm.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <points geometry={sp.g} frustumCulled={false}>
        <pointsMaterial ref={spm} size={0.16} map={dot()} color="#ffb066" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </points>
      <instancedMesh ref={dm} args={[geo, undefined, ND]} frustumCulled={false}>
        <meshStandardMaterial color="#9a8877" roughness={0.9} flatShading />
      </instancedMesh>
    </>
  );
}

// ---------- camera + 3D->2D HUD ----------
// ---------- camera + 3D->2D HUD ----------
function ChaseCam({ S, page }) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(1.2, 1.6, -9.5));
  const look = useRef(new THREE.Vector3(2, 0.5, 10));
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((st, delta) => {
    const dt = Math.min(delta, 0.05);
    const sh = S.ship;
    const home = page === 'home';
    tmp.set(sh.x * 0.55 + (home ? 1.2 : 1.4), sh.y * 0.5 + (home ? 1.5 : 1.9), home ? -9 : -10.4);
    pos.current.lerp(tmp, 1 - Math.exp(-dt * 2.4));
    tmp.set(sh.x * 0.85 + (home ? 3.4 : 0.6), sh.y * 0.7 + (home ? 0.7 : 0.3), 10);
    look.current.lerp(tmp, 1 - Math.exp(-dt * 4));
    const t = st.clock.elapsedTime;
    const k = S.shake * 0.34 + 0.01 + (S.phase === 'evade' ? 0.025 : 0);
    camera.position.set(
      pos.current.x + (Math.sin(t * 37) + Math.sin(t * 23.3)) * k * 0.5,
      pos.current.y + (Math.sin(t * 41.7) + Math.sin(t * 19.1)) * k * 0.5,
      pos.current.z,
    );
    camera.lookAt(look.current);
    camera.rotateZ(sh.roll * 0.22);
    const fov = S.phase === 'nearmiss' ? 43 : S.phase === 'evade' ? 57 : 52;
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  });
  return null;
}

function Brackets({ S }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const ship = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const els = S.brEls;
    const sh = S.ship;
    ship.set(sh.x, sh.y, 0);
    const shown = [];
    const T = S.threat;
    const home = S.page === 'home';
    if (T.active && T.pos.z > -4) {
      const miss = S.phase === 'nearmiss';
      let label;
      if (home) {
        const tti = Math.max(0, T.pos.z / T.speed);
        label = miss ? `CLEARANCE ${S.missDist} M` : `IMPACT T−${tti.toFixed(2)}s · ${Math.round(T.pos.distanceTo(ship) * 10)} M`;
      } else {
        const m = S.real.main;
        label = m ? `${m.id} · ${Math.round(m.d)} M${m.tti != null ? ` · T−${m.tti.toFixed(1)}s` : ''}` : T.id;
      }
      shown.push({ p: T.pos, r: 2.1, cls: miss ? 'main miss' : 'main', label });
    }
    if (S.alienP && S.real.alien) shown.push({ p: S.alienP, r: 1.4, cls: 'alien', label: S.real.alienLabel });
    if (home) {
      const cands = [];
      for (const o of S.rocks) {
        if (o.p.z < 4 || o.p.z > 85) continue;
        if (Math.abs(o.p.x - sh.x) > 9 || Math.abs(o.p.y - sh.y) > 5) continue;
        cands.push(o);
      }
      cands.sort((a, b) => a.p.z - b.p.z);
      for (const o of cands.slice(0, 3)) shown.push({ p: o.p, r: o.s * 1.2, cls: 'rock', label: `R-${o.id} · ${Math.round(o.p.distanceTo(ship) * 10)} M` });
    } else {
      for (const P of S.proxies) {
        if (P.on) shown.push({ p: P.pos, r: 1.3, cls: P.o.kind === 'debris' ? 'rock debris' : 'rock', label: `${P.o.id} · ${Math.round(P.o.d)} M${P.o.closing > 0.05 ? ` · ${P.o.closing.toFixed(1)} M/S` : ''}` });
      }
    }
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    for (let k = 0; k < els.length; k++) {
      const el = els[k];
      if (!el) continue;
      const it = shown[k];
      if (!it) {
        el.style.opacity = '0';
        continue;
      }
      v.copy(it.p).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
        el.style.opacity = '0';
        continue;
      }
      const dist = it.p.distanceTo(camera.position);
      const px = Math.min(190, Math.max(22, (it.r / (dist * tanH)) * size.height * 0.62));
      const x = (v.x * 0.5 + 0.5) * size.width - px / 2;
      const y = (-v.y * 0.5 + 0.5) * size.height - px / 2;
      el.style.opacity = '1';
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      el.style.width = el.style.height = `${px.toFixed(0)}px`;
      const cls = `vm-br ${it.cls}`;
      if (el.className !== cls) el.className = cls;
      if ((S.frame & 3) === 0) el.lastChild.textContent = it.label;
    }
  });
  return null;
}

function Scene({ S, page, event, onPhase, lowfx }) {
  const name = event?.name;
  const inner = INNER.includes(name);
  const R = S.real;
  return (
    <>
      <color attach="background" args={['#040305']} />
      <fog attach="fog" args={['#0c0907', 40, 185]} />
      <Director S={S} page={page} onPhase={onPhase} />
      <Lights S={S} inner={inner} />
      <Stars radius={600} depth={80} count={2600} factor={7} saturation={0} fade speed={0.2} />
      <Jupiter lowfx={lowfx} />
      <SunFlare />
      {R.bh && !lowfx && <BlackHoleFx />}
      <RockField S={S} />
      <ThreatRock S={S} />
      <Proxies S={S} />
      <Streaks S={S} count={240} color="#fff6ea" dir={[0, 0, -1]} box={SPEED_BOX} len={3.2} speed={V * 1.15} opacity={0.75} />
      {R.storm && <Streaks S={S} count={700} color="#ffc94a" dir={[-0.55, -0.18, -0.8]} box={STORM_BOX} len={4} speed={70} opacity={0.9} hole={false} />}
      <Dust S={S} />
      <Ship S={S} event={page === 'console' ? event : null} />
      {!lowfx && <Ribbon S={S} />}
      <ImpactFx S={S} />
      {R.alien && <Alien S={S} />}
      <ChaseCam S={S} page={page} />
      <Brackets S={S} />
    </>
  );
}

// ---------- 2D overlay ----------
const EV_CAPS = {
  'Solar Storm': ['Solar storm · shielding', 'Proton flux rising · hull-to-sun attitude · non-essential loads shed'],
  'Black Hole Encounter': ['Gravitational shear', 'Tidal drift on the debris field · watch the trajectory'],
  'Alien Encounter': ['Unknown contact', 'Passive track · no transmission'],
};
const evClass = (name) =>
  ({ 'Solar Storm': 'storm', 'Black Hole Encounter': 'bh', 'Alien Encounter': 'alien', 'Asteroid Collision': 'ast' })[name] || (INNER.includes(name) ? 'inner' : '');
const words = (id) => String(id).replaceAll('_', ' ');

function caption(phase, S, sim, home) {
  const R = S.real;
  const m = R.main;
  const event = sim.event;
  const imp = sim.demo.physics.lastImpact;
  if (home) {
    return {
      threat: { k: 'red', big: 'Collision course', sub: 'Threat acquired · plotting avoidance', small: true },
      evade: { k: 'amber', big: 'Evasive manoeuvre', sub: 'RCS lateral burn' },
      nearmiss: { k: 'white', big: 'Near miss', sub: `Clearance ${S.missDist} m · time dilated ×0.16` },
      impact: { k: 'red', big: 'Impact', sub: 'Glancing strike · damage control dispatched' },
      recover: { k: 'white', big: 'Course restored', sub: `${sim.nav.origin} → ${sim.nav.destination}`, small: true },
    }[phase];
  }
  if (phase === 'impact' && imp) return { k: 'red', big: 'Impact', sub: `${words(imp.part)} · ${imp.impulseNs.toFixed(0)} N·s · ${(imp.utilization * 100).toFixed(0)}% attachment capacity` };
  if (phase === 'threat' && m) return { k: 'red', big: 'Collision course', sub: `${m.id} · ${Math.round(m.d)} m · closing ${m.closing.toFixed(1)} m/s${m.tti != null ? ` · T−${m.tti.toFixed(1)} s` : ''}`, small: true };
  if (phase === 'evade' && m) {
    return R.thrusting
      ? { k: 'amber', big: 'Evasive manoeuvre', sub: `${sim.demo.physics.mode} · ${m.id} T−${m.tti.toFixed(1)} s` }
      : { k: 'red', big: 'Brace for impact', sub: `${m.id} T−${m.tti.toFixed(1)} s · no thrust commanded` };
  }
  if (phase === 'nearmiss') return { k: 'white', big: 'Near miss', sub: `Closest approach ≈ ${Math.round(S.lastD ?? 0)} m · no contact` };
  if (phase === 'recover') return { k: 'white', big: 'Corridor clear', sub: `${sim.nav.origin} → ${sim.nav.destination} · ${sim.nav.phase}`, small: true };
  if (event && EV_CAPS[event.name]) return { k: 'amber', big: EV_CAPS[event.name][0], sub: EV_CAPS[event.name][1], small: true };
  if (sim.demo.solarStorm) return { k: 'amber', big: 'Solar flare inbound', sub: 'Particle wave leaving the Sun', small: true };
  if (sim.demo.blackHole) return { k: 'amber', big: EV_CAPS['Black Hole Encounter'][0], sub: EV_CAPS['Black Hole Encounter'][1], small: true };
  if (event && INNER.includes(event.name)) return { k: 'red', big: `Damage control · ${event.name}`, sub: 'Fault active until the AI resolves it', small: true };
  return null;
}

function Caption({ phase, S, sim, home }) {
  const c = caption(phase, S, sim, home);
  if (!c) return <div className="vm-cap" />;
  return (
    <div className={`vm-cap on ${c.k} ${c.small ? 'small' : ''}`} key={phase + (sim.event?.name || '')}>
      <h2>{c.big}</h2>
      {c.sub && <p>{c.sub}</p>}
    </div>
  );
}

function Threats({ list }) {
  return (
    <div className="vm-panel vm-threats">
      <h4>Threat board <span>{list.length} tracked · live</span></h4>
      <ul>
        {list.length === 0 && <li className="none">Corridor clear</li>}
        {list.slice(0, 6).map((t) => (
          <li key={t.id} className={t.tti != null && t.tti < 4 ? 'main' : t.kind}>
            <b>{t.id}</b>
            <i style={{ '--w': t.d != null ? `${Math.max(4, 100 - t.d / 6)}%` : '100%' }} />
            <span>{t.d != null ? `${Math.round(t.d)} m` : t.name}</span>
            <em>{t.tti != null ? `${t.tti.toFixed(1)}s` : '—'}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

const H = ({ title }) => <h4 className="mk-h vm-h">{title}</h4>;

function Top({ tab, onTab, sim, hot }) {
  return (
    <header className="vm-top">
      <div className="vm-brand">
        <img src={logo} alt="" />
        <span>Interstellar X<sup>4</sup></span>
      </div>
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>{t}</button>
        ))}
      </nav>
      <div className={`vm-status ${hot ? 'hot' : ''}`}>
        <i />
        {hot ? 'EMERGENCY' : sim.status}
        <span>MET {sim.met}</span>
      </div>
    </header>
  );
}

function Generator({ sim, threats, view, setView, onResetView }) {
  return (
    <>
      <aside className="vm-left vm-col">
        <div className="vm-panel"><HazardControls sim={sim} H={H} /></div>
        <div className="vm-panel"><RockControls sim={sim} H={H} /></div>
        <div className="vm-panel"><PropulsionControls sim={sim} H={H} /></div>
        <div className="vm-panel"><AiControls sim={sim} H={H} /></div>
      </aside>
      <aside className="vm-right vm-col">
        <Threats list={threats} />
        <div className="vm-panel vm-scroll"><Telemetry sim={sim} H={H} /></div>
        <div className="vm-panel vm-logp"><EventLog sim={sim} H={H} /></div>
      </aside>
      <div className="vm-transport vm-panel">
        <Transport sim={sim} view={view} setView={setView} onResetView={onResetView} names={['Action', 'Physics']} />
      </div>
    </>
  );
}

function Pages({ tab, sim, onTab }) {
  if (tab === 'Planetary Trajectories') {
    return (
      <div className="vm-page vm-page-traj">
        <div className="vm-frame mno-embed"><div className="vm-frame-in"><TrajectoriesView sim={sim} /></div><i className="vm-corner" /></div>
        <aside className="vm-panel vm-scroll"><MissionInfo sim={sim} H={H} /></aside>
      </div>
    );
  }
  return (
    <div className="vm-page">
      <div className={`vm-frame mno-embed ${tab === 'Spacecraft' ? 'vm-frame-ship' : 'vm-frame-doc'}`}>
        <div className="vm-frame-in">
          {tab === 'AI Logs' && <AiLogsView sim={sim} onShowLiveShip={() => onTab('Spacecraft')} />}
          {tab === 'AI API' && <AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} />}
          {tab === 'Spacecraft' && <SpacecraftView sim={sim} />}
        </div>
        <i className="vm-corner" />
      </div>
    </div>
  );
}

export default function VariantM({ tab, onTab, sim }) {
  const ref = useRef(null);
  if (!ref.current) ref.current = makeState();
  const S = ref.current;
  const flashEl = useRef();
  const [phase, setPhase] = useState('cruise');
  const [view, setView] = useState('scene');
  const [resetCount, resetView] = useViewReset();
  const [hits, setHits] = useState(0);
  const [failed, onCreated] = useShaderGuard('Meteor Storm');
  const [noGL, setNoGL] = useState(false);
  const home = tab === 'Home';
  const gen = tab === 'Generator';
  const page = home ? 'home' : 'console';

  // Real state the 3D director reads every frame.
  const threats = realThreats(sim);
  const closing = threats.filter((t) => t.tti != null && t.d != null);
  const main = closing[0] ?? null;
  const objects = threats.filter((t) => t.d != null && t !== main).slice(0, S.proxies.length);
  const alienHz = sim.demo.hazards.find((h) => h.name === 'Alien Encounter');
  const alienT = threats.find((t) => t.kind === 'alien');
  const mode = sim.demo.physics.mode;
  S.real = {
    main, others: objects,
    thrusting: mode !== 'coast',
    burn: mode === 'burn',
    correcting: mode === 'course correction',
    bh: sim.demo.blackHole,
    storm: sim.demo.solarStorm || sim.event?.name === 'Solar Storm',
    alien: Boolean(alienHz) || sim.event?.name === 'Alien Encounter',
    alienLabel: alienT ? `${alienT.id} · T−${alienT.tti.toFixed(1)}s` : 'UNKNOWN CONTACT',
    damaged: sim.demo.physics.detached.length > 0 || sim.demo.physics.integrity < 85,
  };

  useEffect(() => {
    S.flash = () => {
      const el = flashEl.current;
      if (!el) return;
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    };
  }, [S]);
  useArmedSwitch(sim, setView);
  // A real contact: sparks + shake in the action scene, the red flash in either view.
  useOnImpact(sim, () => {
    setHits((h) => h + 1);
    const side = S.threat.side || 1;
    S.threat.active = false;
    strike(S, side);
    S.phase = 'impact';
    S.timer = 1.7;
    setPhase('impact');
  });
  useEffect(() => {
    if (sim.demo.stormFlash) S.flash?.();
  }, [sim.demo.stormFlash, S]);

  const name = sim.event?.name;
  const physics = gen && view === 'physics';
  const showScene = tab !== 'Spacecraft' && !physics && !noGL;
  const action = !physics && (phase === 'evade' || phase === 'nearmiss' || phase === 'impact');
  const hot = Boolean(main && main.tti < 6) || phase === 'impact' || Boolean(name) || sim.demo.blackHole || sim.demo.solarStorm;
  const evc = name ? evClass(name) : sim.demo.solarStorm ? 'storm' : sim.demo.blackHole ? 'bh' : '';

  return (
    <div className={`vm mk-root vm-${page} vm-tab-${tab.replace(/\s+/g, '-').toLowerCase()} vm-ph-${physics ? 'phys' : phase} ${action ? 'vm-action' : ''} ${evc ? `vm-ev vm-ev-${evc}` : ''} ${physics ? 'vm-physics' : ''} ${failed || noGL ? 'vm-lowfx' : ''}`}>
      <div className="vm-stage">
        {physics ? (
          <DemoViewport sim={sim} resetCount={resetCount} className="vm-viewport" />
        ) : showScene ? (
          <SceneBoundary onError={() => setNoGL(true)}>
            <Canvas dpr={[1, 1.75]} camera={{ fov: 52, near: 0.1, far: 3000, position: [1.2, 1.6, -9.5] }} gl={{ antialias: true, powerPreference: 'high-performance' }} onCreated={onCreated}>
              <Scene S={S} page={page} event={sim.event} onPhase={setPhase} lowfx={failed} />
            </Canvas>
          </SceneBoundary>
        ) : null}
      </div>

      <div className="vm-fx" aria-hidden="true">
        {physics && <div className="vm-grade" />}
        <div className="vm-vignette" />
        <div className="vm-storm" />
        <div className="vm-lens" />
        <div className="vm-alarm" />
        <div className="vm-flash" ref={flashEl} />
        <div className="vm-bar t" />
        <div className="vm-bar b" />
      </div>

      <div className="vm-brk" aria-hidden="true" style={{ display: showScene && (home || gen) ? undefined : 'none' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="vm-br" ref={(el) => (S.brEls[i] = el)}>
            <i /><i /><i /><i /><b />
          </div>
        ))}
      </div>

      <Top tab={tab} onTab={onTab} sim={sim} hot={hot} />
      {(home || gen) && !physics && <Caption phase={phase} S={S} sim={sim} home={home} />}
      {gen && <ArmedHint sim={sim} className="vm-armed" />}

      {home ? (
        <>
          <section className="vm-hero">
            <p className="vm-eyebrow">{TAGLINE}</p>
            <h1>Interstellar X<sup>4</sup></h1>
            <p className="vm-lead">{LEAD}</p>
            <div className="vm-ctas">
              <button className="vm-cta" onClick={() => onTab('Generator')}>Launch simulator <span>→</span></button>
              <button className="vm-ghost" onClick={() => onTab('AI Logs')}>Watch the AI decide</button>
            </div>
            <ul className="vm-feats">
              {FEATURES.map((f, i) => (
                <li key={f}><b>0{i + 1}</b>{f}</li>
              ))}
            </ul>
          </section>
          <aside className="vm-side">
            <Threats list={threats} />
            <div className="vm-panel vm-tele">
              <div><small>Route</small>{sim.nav.origin} → {sim.nav.destination}</div>
              <div><small>Velocity</small>{sim.velocity} km/s</div>
              <div><small>Map scale</small>{sim.timeScale}</div>
              <div><small>Hits taken</small>{hits}</div>
              <div><small>Integrity</small>{sim.systems[0].value}%</div>
              <div><small>Day</small>{sim.day}</div>
            </div>
          </aside>
        </>
      ) : gen ? (
        <Generator sim={sim} threats={threats} view={view} setView={setView} onResetView={resetView} />
      ) : (
        <Pages tab={tab} sim={sim} onTab={onTab} />
      )}
    </div>
  );
}
