// Variant L: Event Horizon · 黑洞边缘.
// A ray-marched Schwarzschild black hole (half-res target + few-tap bloom) fills the screen; the real
// StationShip hangs in the foreground, lit by the accretion disk. A "director" timeline drives an
// emergency sequence (shear → escape burn → safe orbit): on a loop at home, and from REAL DEMO state in
// the console (black hole activation, storm, inbound rocks/aliens, faults, impacts). The plume is the
// real burn. "Cinematic / Physics" swaps in the real DEMO flight scene inside the same frame.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import StationShip from '../../components/station/StationShip.jsx';
import { AiApiView, AiLogsView, DemoViewport, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset } from '../demoSkin.jsx';
import {
  AiControls, Damage, FlightData, GlBoundary, Nearby, Propulsion, RockForm, Transport,
  hookShaderErrors, initialGlMode, missionRows, pickTargetType, probeBrightness, realThreat, targetComplete, useHazards,
} from './variantIKLKit.jsx';
import './variantL.css';

/* ------------------------------------------------------------------ director */

const LOOP = 27;
const CALM = 9;
const PROFILES = {
  bh: { pull: 1, burn: 1, shake: 1, fx: 'tidal', red: 0.55, flash: 0, flicker: 0.15,
    labels: ['GRAVITATIONAL SHEAR', 'ESCAPE BURN', 'SAFE ORBIT'],
    subs: ['Tidal gradient exceeds hull tolerance · attitude lost', 'AI Propelling agent · main engine 100% · prograde', 'Periapsis raised · stable orbit at 9.6 Rs'] },
  impact: { pull: 0.25, burn: 0.75, shake: 1.8, fx: 'spark', red: 0.6, flash: 0.12, flicker: 0.35,
    labels: ['DEBRIS IMPACT', 'EVASIVE BURN', 'TRAJECTORY CLEAR'],
    subs: ['Tidal debris stream crossing hull · micro-impacts', 'AI Main Judging · lateral burn approved', 'Clear of stream · hull scan running'] },
  storm: { pull: 0.15, burn: 0.4, shake: 0.6, fx: 'storm', red: 0.3, flash: 0.7, flicker: 0.6,
    labels: ['SOLAR PARTICLE STORM', 'SHIELD ATTITUDE', 'FLUX NOMINAL'],
    subs: ['Proton flux 10⁴ pfu · electronics at risk', 'AI rotating hull to shadow the habitat', 'Storm front passed · systems re-arming'] },
  contact: { pull: 0.2, burn: 0.6, shake: 0.4, fx: 'storm', red: 0.3, flash: 0.25, flicker: 0.25,
    labels: ['UNIDENTIFIED CONTACT', 'STANDOFF BURN', 'CONTACT LOST'],
    subs: ['Unknown object matching velocity at 40 km', 'AI holding distance · sensors locked', 'Contact faded into the disk glare'] },
  inner: { pull: 0.08, burn: 0.15, shake: 0.4, fx: 'spark', red: 1, flash: 0, flicker: 1,
    labels: ['ONBOARD FAULT', 'AI ISOLATING SUBSYSTEM', 'FAULT CONTAINED'],
    subs: ['Fault detected inside the hull', 'Energy agent shedding load · crew alerted', 'Subsystem isolated · drifting on safe orbit'] },
  engine: { pull: 0.55, burn: 0.0, shake: 0.7, fx: null, red: 0.8, flicker: 0.45, flash: 0, sputter: true,
    labels: ['ENGINE FAILURE', 'RCS ATTITUDE HOLD', 'DRIFT STABILISED'],
    subs: ['Main engine offline at 8.6 Rs · orbit decaying', 'AI firing RCS · ignition retries', 'Decay arrested · RCS holding orbit'] },
};
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const now = () => performance.now() / 1000;

function envAt(d, t) {
  let e;
  let kind;
  if (d.mode === 'loop') {
    e = ((t - d.t0) % LOOP) - CALM;
    kind = 'bh';
  } else if (d.start < 0) {
    e = -1;
    kind = null;
  } else {
    e = t - d.start;
    kind = d.kind;
  }
  const p = PROFILES[kind] || PROFILES.bh;
  if (e < 0) return { e, kind: null, p, pull: 0, burn: 0, alert: 0, idx: -1, s: 0, flash: 0, orbit: 0 };
  const pull = ss(0, 3.6, e) * (1 - ss(4.2, 10.5, e)) * p.pull;
  const burn = ss(3.6, 4.3, e) * (1 - ss(9.5, 11.5, e)) * p.burn;
  const hold = d.mode === 'event' ? 0.16 : 0;
  const alert = Math.max(ss(0, 0.4, e) * (1 - ss(10, 13, e)), e > 10 ? hold : 0);
  const idx = e < 3.8 ? 0 : e < 10 ? 1 : e < 15 ? 2 : 3;
  const s = e < 3.8 ? (0.45 * e) / 3.8 : e < 10 ? 0.45 + (0.55 * (e - 3.8)) / 6.2 : 1;
  const flash = p.flash * (e < 5 ? Math.pow(Math.max(Math.sin(e * 7.3) * Math.sin(e * 2.1 + 0.5), 0), 4) : 0);
  const orbit = ss(9, 14, e) * (d.mode === 'loop' ? 1 - ss(15, 17.5, e) : 1);
  return { e, kind, p, pull, burn, alert, idx, s, flash, orbit };
}

/** distance to horizon in Schwarzschild radii */
const horizonRs = (env, t) => 8.6 + 0.22 * Math.sin(t / 7) - env.pull * 3.7 + env.burn * 0.35 + env.orbit * 1.0;

/* ------------------------------------------------------------------ shaders */

const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BH_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uAspect, uTime, uDist, uIncl, uRoll, uZoom, uHeat;
uniform vec2 uCenter, uShake;

// Portable helpers: smoothstep with reversed edges and pow() of a negative base are undefined in GLSL
// (NaN on some WebKit/Metal drivers → black frame), so use explicit versions.
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float sq(float x) { return x * x; }
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }

vec3 stars(vec3 d){
  vec3 col = vec3(0.0);
  for (int L = 0; L < 2; L++){
    float sc = L == 0 ? 70.0 : 150.0;
    vec3 p = d * sc; vec3 c = floor(p); vec3 f = fract(p) - 0.5;
    float h = hash13(c);
    if (h > (L == 0 ? 0.982 : 0.965)){
      vec3 off = vec3(hash13(c + 1.3), hash13(c + 2.7), hash13(c + 5.1)) - 0.5;
      float r = length(f - off * 0.55);
      float b = pow(hash13(c + 9.1), 5.0) * (L == 0 ? 9.0 : 2.0) + 0.25;
      col += exp(-r * r * (L == 0 ? 70.0 : 55.0)) * b * mix(vec3(1.0, 0.82, 0.62), vec3(0.72, 0.82, 1.0), hash13(c + 4.4));
    }
  }
  float band = exp(-sq(dot(d, normalize(vec3(0.35, 1.0, 0.15))) * 3.0));
  float n = fbm(d * 4.0 + 3.0);
  col += band * (0.018 + 0.07 * n * n) * vec3(0.55, 0.62, 0.85);
  col += band * sstep(0.55, 0.85, fbm(d * 10.0)) * 0.05 * vec3(1.0, 0.75, 0.6);
  return col;
}

vec3 diskColor(float T){
  vec3 c = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.5, 0.16), sstep(0.0, 0.45, T));
  c = mix(c, vec3(1.0, 0.86, 0.66), sstep(0.4, 0.9, T));
  c = mix(c, vec3(0.86, 0.92, 1.0), sstep(1.0, 1.6, T));
  return c;
}

void main(){
  vec2 uv = vUv * 2.0 - 1.0; uv.x *= uAspect;
  uv = uv - uCenter + uShake;
  float cr = cos(uRoll), sr = sin(uRoll); uv = mat2(cr, -sr, sr, cr) * uv;

  vec3 ro = vec3(0.0, sin(uIncl), -cos(uIncl)) * uDist;
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 v = normalize(fw * uZoom + uv.x * rt + uv.y * up);
  vec3 p = ro;
  vec3 hv = cross(p, v); float h2 = dot(hv, hv);

  vec3 col = vec3(0.0); float alpha = 0.0; float minR = 1e3; bool captured = false;
  for (int i = 0; i < 120; i++){
    float r = length(p);
    minR = min(minR, r);
    float dt = clamp(0.08 * r, 0.025, 2.0);
    vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
    v += acc * dt;
    vec3 pn = p + v * dt;
    if (p.y * pn.y < 0.0){
      vec3 q = mix(p, pn, p.y / (p.y - pn.y));
      float rq = length(q.xz);
      if (rq > 2.5 && rq < 16.0){
        float T = pow(3.0 / rq, 0.75) * pow(max(1.0 - sqrt(2.5 / rq), 0.0), 0.25) * 1.9;
        vec3 tang = normalize(vec3(-q.z, 0.0, q.x));
        float beta = min(sqrt(0.5 / max(rq - 1.0, 0.3)), 0.7);
        float gam = inversesqrt(1.0 - beta * beta);
        float g = 1.0 / (gam * (1.0 - beta * dot(tang, -normalize(v))));
        float D = g * sqrt(max(1.0 - 1.0 / rq, 0.0));
        float ang = atan(q.z, q.x) + uTime * 2.2 * pow(rq, -1.5);
        float n = fbm(vec3(cos(ang) * 2.6, sin(ang) * 2.6, rq * 2.4));
        float fil = 0.55 + 0.45 * sin(rq * 9.0 + n * 7.0);
        float edge = sstep(2.5, 3.4, rq) * (1.0 - sstep(8.0, 16.0, rq));
        float I = pow(T, 3.0) * (0.25 + 1.4 * n * n) * (0.6 + 0.4 * fil) * pow(D, 3.6) * uHeat * 3.0;
        vec3 c = diskColor(T * D) * I * edge;
        float a = clamp(edge * (0.45 + 0.6 * n), 0.0, 0.96);
        col += (1.0 - alpha) * c;
        alpha += (1.0 - alpha) * a;
        if (alpha > 0.985) break;
      }
    }
    p = pn;
    float rn = length(p);
    if (rn < 1.0){ captured = true; break; }
    if (rn > uDist + 8.0 && dot(p, v) > 0.0) break;
  }
  vec3 bg = captured ? vec3(0.0) : stars(normalize(v));
  col += (1.0 - alpha) * bg;
  col += (1.0 - alpha * 0.5) * vec3(1.0, 0.72, 0.45) * exp(-sq((minR - 1.55) * 7.0)) * 0.9 * uHeat;
  gl_FragColor = vec4(col, 1.0);
}
`;

const COMP_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap;
uniform float uAspect, uTime, uRed, uFlash, uAlert;
// Portable helpers: smoothstep with reversed edges and pow() of a negative base are undefined in GLSL
// (NaN on some WebKit/Metal drivers → black frame), so use explicit versions.
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float sq(float x) { return x * x; }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 cuv = vUv - 0.5;
  float ca = 0.0018 + uAlert * 0.002;
  vec3 c;
  c.r = texture2D(tMap, vUv + cuv * ca).r;
  c.g = texture2D(tMap, vUv).g;
  c.b = texture2D(tMap, vUv - cuv * ca).b;
  // Few-tap ring blur as bloom (no mipmaps: half-float mip chains fail on some WebKit GPUs).
  vec3 b = vec3(0.0);
  vec2 asp = vec2(1.0 / uAspect, 1.0);
  for (int i = 0; i < 10; i++){
    float a = float(i) * 0.6283 + 0.3;
    vec2 o = vec2(cos(a), sin(a)) * asp;
    b += texture2D(tMap, vUv + o * 0.012).rgb * 0.5 + texture2D(tMap, vUv + o * 0.035).rgb * 0.7 + texture2D(tMap, vUv + o * 0.075).rgb * 0.6;
  }
  b *= 0.1;
  c += max(b - 0.06, 0.0) * 0.4;
  c = 1.0 - exp(-c * 1.15);
  c = pow(c, vec3(0.95, 0.97, 1.0));
  vec2 q = cuv * vec2(uAspect, 1.0) * 2.0;
  float r = length(q);
  c *= mix(1.0, sstep(1.9, 0.35, r), 0.55);
  float pulse = 0.65 + 0.35 * sin(uTime * 5.5);
  c += vec3(0.55, 0.02, 0.0) * uRed * sstep(0.55, 1.7, r) * pulse;
  c = mix(c, c * vec3(1.15, 0.7, 0.66), uRed * 0.35);
  c += uFlash * vec3(0.62, 0.78, 1.0);
  c += (h12(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * 0.035;
  gl_FragColor = vec4(c, 1.0);
}
`;

const PLUME_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const PLUME_FS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
uniform float uI, uT, uCore;
void main(){
  float along = vUv.y;
  float face = pow(abs(dot(normalize(vN), normalize(vV))), uCore);
  float fl = 0.8 + 0.2 * sin(uT * 47.0 + along * 23.0) * sin(uT * 13.0 - along * 9.0);
  float shock = 0.75 + 0.25 * sin(along * 60.0 - uT * 30.0);
  float I = pow(1.0 - along, 1.7) * face * fl * shock * uI;
  vec3 col = mix(vec3(0.45, 0.62, 1.0), vec3(1.0, 0.97, 0.92), pow(1.0 - along, 4.0));
  gl_FragColor = vec4(col * I * 2.2, 1.0);
}
`;

/* ------------------------------------------------------------------ scene */

const LAYOUT = {
  home: { center: [0.42, 0.2], ship: [-2.35, -1.05, 0], nose: [-0.72, -0.2, 0.66], scale: 0.088 },
  console: { center: [0.0, 0.3], ship: [0.15, -1.55, 0.6], nose: [-0.55, -0.32, 0.78], scale: 0.08 },
};
const DEBRIS = 170;
const NO_DRIVE = { burn: 0, damage: 0, engineOut: false };

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(190,215,255,0.75)');
  grd.addColorStop(0.5, 'rgba(90,130,255,0.18)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * `drive` (ref) carries REAL state: { burn 0..1, damage 0..1, engineOut }. `fallback` = draw only the ship
 * (transparent) over the CSS black hole when the ray-march pass is unavailable on this GPU.
 */
function Scene({ page, director, event, drive, fallback, onFail, onAlive }) {
  const { gl, size, camera, setDpr } = useThree();
  const [rtType, setRtType] = useState(() => pickTargetType(gl));
  const fbo = useMemo(
    () => new THREE.WebGLRenderTarget(2, 2, { type: rtType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }),
    [rtType],
  );
  useEffect(() => () => fbo.dispose(), [fbo]);
  useEffect(() => hookShaderErrors(gl, 'Event Horizon', onFail), [gl, onFail]);
  useEffect(() => {
    fbo.setSize(Math.max(2, Math.round(size.width * 0.55)), Math.max(2, Math.round(size.height * 0.55)));
    if (!targetComplete(gl, fbo)) {
      if (rtType !== THREE.UnsignedByteType) {
        console.warn('[Event Horizon] half-float target unsupported — using 8-bit');
        setRtType(THREE.UnsignedByteType);
      } else onFail('framebuffer');
    }
  }, [size, gl, fbo, rtType, onFail]);

  const bh = useMemo(() => {
    const uniforms = {
      uAspect: { value: 1 }, uTime: { value: 0 }, uDist: { value: 24 }, uIncl: { value: 0.16 }, uRoll: { value: -0.12 },
      uZoom: { value: 2.15 }, uHeat: { value: 1 }, uCenter: { value: new THREE.Vector2() }, uShake: { value: new THREE.Vector2() },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: BH_FS, uniforms, depthTest: false, depthWrite: false });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
    return { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), uniforms };
  }, []);

  // Materials are created here (not as JSX props): r3f/three clone `uniforms` passed as props,
  // which would leave per-frame updates writing to a detached copy.
  const mats = useMemo(() => {
    const plume = (core) => new THREE.ShaderMaterial({
      vertexShader: PLUME_VS, fragmentShader: PLUME_FS, uniforms: { uI: { value: 0 }, uT: { value: 0 }, uCore: { value: core } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    return {
      comp: new THREE.ShaderMaterial({
        vertexShader: QUAD_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { tMap: { value: null }, uAspect: { value: 1 }, uTime: { value: 0 }, uRed: { value: 0 }, uFlash: { value: 0 }, uAlert: { value: 0 } },
      }),
      plume: plume(1.2),
      core: plume(2.5),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const comp = mats.comp.uniforms;
  const plumeU = mats.plume.uniforms;
  const coreU = mats.core.uniforms;
  const glow = useMemo(glowTexture, []);

  const debris = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEBRIS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(DEBRIS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const seeds = Array.from({ length: DEBRIS }, () => ({
      a: Math.random(), sp: 0.25 + Math.random() * 0.5,
      o: new THREE.Vector3().randomDirection().multiplyScalar(0.4 + Math.random() * 2.2),
      d: new THREE.Vector3().randomDirection(), y: (Math.random() - 0.5) * 9, z: -6 + Math.random() * 10,
    }));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    return { geo, seeds, mat };
  }, []);

  const compQuad = useRef();
  const root = useRef();
  const stretch = useRef();
  const glowRef = useRef();
  const key = useRef();
  const rim = useRef();
  const red = useRef();
  const st = useRef({ center: new THREE.Vector2(...LAYOUT[page].center), pos: new THREE.Vector3(...LAYOUT[page].ship), dist: 24, init: false, frame: 0, dark: 0, slow: 0, slowN: 0, alive: false });
  const tmp = useMemo(() => ({ dummy: new THREE.Object3D(), H: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = now();
    const ct = state.clock.elapsedTime;
    const env = envAt(director.current, t);
    const dr = drive.current ?? NO_DRIVE;
    const L = LAYOUT[page];
    const s = st.current;
    if (!s.alive) { s.alive = true; onAlive?.(); }
    const k = 1 - Math.exp(-dt * 2.2);
    const aspect = size.width / size.height;

    // camera: slow push-in + handheld shake
    const shakeAmt = 1 + env.pull * 5 * env.p.shake + env.burn * 2.2 + env.alert * env.p.shake * 2;
    const push = 0.5 - 0.5 * Math.cos((ct / 70) * Math.PI * 2);
    camera.position.set(Math.sin(ct * 0.07) * 0.25, 0.15 + Math.sin(ct * 0.05) * 0.1, 10.8 - push * 1.3);
    const sx = (Math.sin(ct * 1.7) * 0.6 + Math.sin(ct * 3.9 + 1) * 0.3 + Math.sin(ct * 11.3) * 0.1 * shakeAmt) * 0.0016 * shakeAmt;
    const sy = (Math.sin(ct * 1.3 + 2) * 0.6 + Math.sin(ct * 4.3) * 0.3 + Math.sin(ct * 13.1 + 3) * 0.1 * shakeAmt) * 0.0016 * shakeAmt;
    camera.rotation.set(sx, sy, Math.sin(ct * 0.9) * 0.002 * shakeAmt);

    // black hole uniforms
    s.center.lerp(tmp.v.set(...L.center, 0), k * 0.6);
    const targetDist = 24.5 - push * 2.2 - env.pull * 5 + env.burn * 0.8 - env.orbit * 0.4;
    s.dist += (targetDist - s.dist) * k;
    const u = bh.uniforms;
    u.uAspect.value = aspect;
    u.uTime.value = ct;
    u.uDist.value = s.dist;
    u.uRoll.value = -0.13 + Math.sin(ct * 0.05) * 0.03 + env.pull * 0.05 * Math.sin(ct * 2.6);
    u.uHeat.value = 1 + env.pull * 0.4 + env.burn * 0.1;
    u.uCenter.value.copy(s.center);
    u.uShake.value.set(-sy * 2.75, sx * 2.75);

    const flick = env.alert * env.p.flicker * (Math.random() > 0.86 ? 0.75 : 0);
    comp.tMap.value = fbo.texture;
    comp.uAspect.value = aspect;
    comp.uTime.value = ct;
    comp.uAlert.value = Math.max(env.alert, dr.damage);
    comp.uRed.value = env.alert * env.p.red * 0.55 + dr.damage * 0.35;
    comp.uFlash.value = env.flash * 0.6;

    // hole position in world (for pull, debris, key light)
    tmp.H.set(s.center.x / aspect, s.center.y, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(40).add(camera.position);

    // ship: pulled toward hole, stretched, then escape
    const g = root.current;
    if (g) {
      const base = tmp.a.set(...L.ship);
      const toH = tmp.b.copy(tmp.H).sub(base).normalize();
      const target = base.clone().addScaledVector(toH, env.pull * 2.4);
      target.y += env.burn * 0.35 + env.orbit * 0.15 + Math.sin(ct * 0.4) * 0.08;
      target.x += Math.sin(ct * 0.23) * 0.12 + Math.sin(ct * 9) * 0.02 * env.pull;
      if (!s.init) { s.pos.copy(target); s.init = true; }
      s.pos.lerp(target, k);
      g.position.copy(s.pos);
      const d = tmp.dummy;
      d.position.copy(s.pos);
      d.lookAt(tmp.v.set(...L.nose).add(s.pos));
      d.rotateY(env.pull * (0.85 + 0.25 * Math.sin(ct * 3.1)) + Math.sin(ct * 0.3) * 0.08);
      d.rotateX(env.pull * 0.3 * Math.sin(ct * 2.3));
      d.rotateZ(0.35 + ct * 0.04);
      g.quaternion.slerp(d.quaternion, 1 - Math.exp(-dt * (1.2 + env.burn * 2)));
      const sp = env.pull;
      const sc = L.scale;
      stretch.current.scale.set(sc * (1 - 0.07 * sp), sc * (1 - 0.07 * sp), sc * (1 + 0.24 * sp * (1 + 0.3 * Math.sin(ct * 8.5))));
    }

    // plume: home showcases the scripted burn; the console shows the REAL burn
    let burn = page === 'home' ? env.burn : dr.burn;
    if ((page === 'home' ? env.p.sputter && env.e > 3.6 && env.e < 10 : dr.engineOut)) burn = Math.random() > 0.8 ? 0.35 : 0.02;
    const pI = 0.06 + burn * 1.1;
    plumeU.uI.value = pI;
    plumeU.uT.value = ct;
    coreU.uI.value = pI * 1.3;
    coreU.uT.value = ct;
    if (glowRef.current) {
      glowRef.current.material.opacity = Math.min(1, 0.25 + burn);
      const gs = 7 + burn * 9;
      glowRef.current.scale.set(gs, gs, 1);
    }

    // lights
    if (key.current) {
      key.current.position.copy(tmp.H).add(tmp.v.set(0, -8, 0));
      key.current.intensity = (3.4 + env.pull * 1.5) * (1 - flick);
    }
    if (rim.current) rim.current.intensity = 2.4 * (1 - flick * 0.6);
    if (red.current) {
      red.current.position.copy(s.pos).add(tmp.v.set(0.5, 1.2, 1.5));
      red.current.intensity = (env.alert * env.p.red + dr.damage * 0.5) * 22 * (0.55 + 0.45 * Math.sin(ct * 7));
    }

    // debris
    const fx = env.p.fx;
    const amt = fx === 'tidal' ? env.pull : env.alert * (fx === 'storm' ? 1 : 0.9) * (env.e < 11 ? 1 : 0.2);
    debris.mat.opacity = Math.min(1, amt * 1.4);
    debris.mat.visible = !!fx && amt > 0.01;
    if (debris.mat.visible) {
      const P = debris.geo.attributes.position.array;
      const C = debris.geo.attributes.color.array;
      const col = fx === 'storm' ? [0.55, 0.75, 1.0] : fx === 'spark' ? [1.0, 0.62, 0.25] : [1.0, 0.78, 0.5];
      debris.seeds.forEach((q, i) => {
        const ph = (q.a + ct * q.sp * (fx === 'storm' ? 2.2 : 1)) % 1;
        let hx, hy, hz, tx, ty, tz;
        if (fx === 'tidal') {
          const e1 = Math.pow(ph, 2.2);
          const e0 = Math.pow(Math.max(ph - 0.06, 0), 2.2);
          const sxp = s.pos.x + q.o.x, syp = s.pos.y + q.o.y, szp = s.pos.z + q.o.z;
          hx = sxp + (tmp.H.x - sxp) * e1; hy = syp + (tmp.H.y - syp) * e1; hz = szp + (tmp.H.z - szp) * e1;
          tx = sxp + (tmp.H.x - sxp) * e0; ty = syp + (tmp.H.y - syp) * e0; tz = szp + (tmp.H.z - szp) * e0;
        } else if (fx === 'spark') {
          const r1 = ph * 4.5, r0 = Math.max(ph - 0.07, 0) * 4.5;
          hx = s.pos.x + q.d.x * r1; hy = s.pos.y + q.d.y * r1 - ph * ph; hz = s.pos.z + q.d.z * r1;
          tx = s.pos.x + q.d.x * r0; ty = s.pos.y + q.d.y * r0 - r0 * r0 * 0.05; tz = s.pos.z + q.d.z * r0;
        } else {
          hx = -14 + ph * 28; hy = q.y + ph * 1.2; hz = q.z;
          tx = hx - 2.2; ty = hy - 0.1; tz = hz;
        }
        const f = fx === 'storm' ? Math.sin(ph * Math.PI) : 1 - ph * 0.85;
        P.set([tx, ty, tz, hx, hy, hz], i * 6);
        C.set([0, 0, 0, col[0] * f, col[1] * f, col[2] * f], i * 6);
      });
      debris.geo.attributes.position.needsUpdate = true;
      debris.geo.attributes.color.needsUpdate = true;
    }

    // render: hole → half-res target → composite quad + ship (manual, so the result can be checked)
    gl.setClearColor(0x000000, 0);
    if (compQuad.current) compQuad.current.visible = !fallback;
    if (!fallback) {
      gl.setRenderTarget(fbo);
      gl.render(bh.scene, bh.cam);
    }
    gl.setRenderTarget(null);
    gl.clear(true, true, true);
    gl.render(state.scene, camera);
    if (fallback) return;

    // Self-check: the accretion disk/photon ring around the hole centre is always bright.
    s.frame += 1;
    if (s.frame === 20 || s.frame === 60 || s.frame === 120) {
      const cx = (s.center.x / aspect + 1) / 2;
      const cy = (s.center.y + 1) / 2;
      const pts = [];
      for (let i = -6; i <= 6; i++) pts.push([cx + i * 0.03, cy], [cx + i * 0.03, cy - 0.04], [cx + i * 0.03, cy + 0.06]);
      const lum = probeBrightness(gl, pts.filter(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1));
      if (lum < 40) s.dark += 1;
      if (s.dark >= 2) { console.warn('[Event Horizon] ray-march pass produced no disk — using CSS fallback'); onFail('black'); }
    }
    if (s.frame > 30 && s.slowN < 60) { s.slow += dtRaw; s.slowN += 1; if (s.slowN === 60 && s.slow / 60 > 0.07) setDpr(0.75); }
  }, 1);

  return (
    <>
      <mesh ref={compQuad} frustumCulled={false} renderOrder={-10} material={mats.comp}>
        <planeGeometry args={[2, 2]} />
      </mesh>

      <ambientLight intensity={0.22} color="#8fa3c8" />
      <directionalLight ref={key} intensity={3.4} color="#ffb36b" />
      <directionalLight ref={rim} position={[-6, 3, -9]} intensity={2.4} color="#bcd4ff" />
      <directionalLight position={[-4, -6, 6]} intensity={0.25} color="#6b7a99" />
      <pointLight ref={red} intensity={0} distance={8} decay={2} color="#ff3b2a" />

      <group ref={root}>
        <group ref={stretch} scale={LAYOUT[page].scale}>
          <group position={[0, 0, 3.5]}>
            <StationShip event={event} />
            <group position={[0, 0, -20.6]}>
              <mesh position={[0, 0, -13]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5} material={mats.plume}>
                <coneGeometry args={[2.3, 26, 28, 1, true]} />
              </mesh>
              <mesh position={[0, 0, -7]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6} material={mats.core}>
                <coneGeometry args={[1.0, 14, 20, 1, true]} />
              </mesh>
              <sprite ref={glowRef} scale={[7, 7, 1]} renderOrder={7}>
                <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
              </sprite>
            </group>
          </group>
        </group>
      </group>

      <lineSegments geometry={debris.geo} material={debris.mat} frustumCulled={false} renderOrder={8} />
    </>
  );
}

/** WebGL black hole with a CSS black hole behind it ('ship' = only the ship is drawn; 'css' = no WebGL). */
function Cinema({ page, director, event, drive }) {
  const [mode, setMode] = useState(initialGlMode);
  const fail = useMemo(() => (reason) => setMode((m) => m ?? (reason === 'error' || reason === 'context' ? 'css' : 'ship')), []);
  const alive = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => { if (!alive.current) fail('error'); }, 6000);
    return () => clearTimeout(id);
  }, [fail]);
  return (
    <div className={`vl-canvas ${mode ? 'vl-cssbh' : ''} vl-cssbh-${page}`}>
      {mode !== 'css' && (
        <GlBoundary tag="Event Horizon" onFail={fail}>
          <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.15, 10.8], fov: 40, near: 0.1, far: 200 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
            <Scene page={page} director={director} event={event} drive={drive} fallback={mode === 'ship'} onFail={fail} onAlive={() => { alive.current = true; }} />
          </Canvas>
        </GlBoundary>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ HUD */

const fmtKm = (rs) => {
  const km = rs * 1.18e7;
  const ex = Math.floor(Math.log10(km));
  return `${(km / 10 ** ex).toFixed(2)} × 10${String(ex).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('')} km`;
};

function useEnv(director) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 100);
    return () => clearInterval(id);
  }, []);
  const t = now();
  return { env: envAt(director.current, t), t };
}

const ESC = Array.from({ length: 61 }, (_, i) => {
  const s = i / 60;
  const r = s < 0.45 ? 66 - 34 * ss(0, 1, s / 0.45) : 32 + 56 * ss(0, 1, (s - 0.45) / 0.55);
  const a = -2.4 + s * 3.6;
  return [52 + Math.cos(a) * r, 62 + Math.sin(a) * r * 0.62];
});

function EscapeDiagram({ env, rs }) {
  const active = env.idx >= 0;
  const n = Math.round(env.s * 60);
  const pts = ESC.slice(0, n + 1).map((p) => p.join(',')).join(' ');
  const [dx, dy] = ESC[n];
  const dvReq = (2.92 + env.pull * 1.7 - env.burn * 0.4).toFixed(2);
  return (
    <figure className={`vl-diag ${active ? 'on' : ''}`}>
      <figcaption>
        <span>ESCAPE TRAJECTORY</span>
        <span>Δv REQ <b>{dvReq}</b> km/s</span>
      </figcaption>
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <ellipse cx="52" cy="62" rx="66" ry="41" className="vl-orb" />
        <ellipse cx="52" cy="62" rx="24" ry="15" className="vl-orb isco" />
        <ellipse cx="52" cy="62" rx="11" ry="7" className="vl-ring" />
        <ellipse cx="52" cy="62" rx="8" ry="8" className="vl-hole" />
        <polyline points={ESC.map((p) => p.join(',')).join(' ')} className="vl-path ghost" />
        {active && <polyline points={pts} className="vl-path" />}
        <circle cx={active ? dx : ESC[0][0]} cy={active ? dy : ESC[0][1]} r="2.6" className="vl-ship" />
        <text x="122" y="20">SAFE ORBIT 9.6 Rs</text>
        <text x="80" y="88">ISCO 3 Rs</text>
      </svg>
      <dl>
        <div><dt>R / Rs</dt><dd>{rs.toFixed(2)}</dd></div>
        <div><dt>Burn</dt><dd>{env.idx === 1 ? `T+${(env.e - 3.8).toFixed(1)}s` : env.idx > 1 ? 'COMPLETE' : '—'}</dd></div>
      </dl>
    </figure>
  );
}

function Horizon({ env, t, big }) {
  const rs = horizonRs(env, t);
  const danger = rs < 6.2;
  return (
    <div className={`vl-horizon ${danger ? 'danger' : ''} ${big ? 'big' : ''}`}>
      <span className="vl-k">DISTANCE TO EVENT HORIZON</span>
      <span className="vl-big">{rs.toFixed(2)}<small> Rs</small></span>
      <span className="vl-k">{fmtKm(rs)}</span>
      <span className="vl-bar"><i style={{ width: `${Math.min(100, (rs / 11) * 100)}%` }} /></span>
    </div>
  );
}

/** Banner. In the console the "action" stage reports the real burn (or that none is happening). */
function Alert({ env, name, live }) {
  if (env.idx < 0 || env.idx > 2) return null;
  let label = env.p.labels[env.idx];
  let sub = env.p.subs[env.idx];
  if (live && env.idx === 1) {
    if (live.burning) sub = `Propulsion ${live.mode.toUpperCase()} · ${live.thrust} N · ${live.fuel} kg left`;
    else { label = 'AWAITING MANOEUVRE'; sub = live.ai ? 'DEMO AI evaluating · physics continues' : 'No burn yet · enable autopilot or fire Main +Z'; }
  }
  if (live && env.idx === 2) sub = live.latest;
  const sev = env.idx === 0 ? 'hot' : env.idx === 1 ? 'act' : 'ok';
  return (
    <div className={`vl-alert ${sev}`} role="status">
      <span className="vl-alert-k">{env.idx === 0 ? '▲ ALERT' : env.idx === 1 ? 'AI ACTION' : 'HOLDING'}{name ? ` · ${name}` : ''}</span>
      <strong>{label}</strong>
      <span className="vl-alert-sub">{sub}</span>
    </div>
  );
}

function Nav({ tab, onTab, sim }) {
  return (
    <header className="vl-nav">
      <button className="vl-brand" onClick={() => onTab('Home')}>
        <img src={logo} alt="" />
        <span>Interstellar X<sup>4</sup></span>
      </button>
      <nav>
        {TABS.map((n) => (
          <button key={n} className={tab === n ? 'on' : ''} onClick={() => onTab(n)}>{n}</button>
        ))}
      </nav>
      <span className="vl-met">{sim.status} · MET {sim.met} · DAY {sim.day}</span>
    </header>
  );
}

/* ------------------------------------------------------------------ pages */

/** realThreat() kinds → director profiles */
const L_KIND = { bh: 'bh', rocks: 'impact', storm: 'storm', alien: 'contact', engine: 'engine', fire: 'inner', inner: 'inner' };

function Home({ sim, onTab }) {
  const director = useRef({ mode: 'loop', t0: now() - 3 });
  const drive = useRef(NO_DRIVE);
  const { env, t } = useEnv(director);
  const rs = horizonRs(env, t);
  return (
    <div className={`vl vl-home ikl-scope ${env.alert > 0.3 ? 'vl-alerting' : ''}`}>
      <Cinema page="home" director={director} event={null} drive={drive} />
      <div className="vl-letter top" />
      <div className="vl-letter bot" />
      <Nav tab="Home" onTab={onTab} sim={sim} />
      <Alert env={env} />
      <section className="vl-hero">
        <span className="vl-kicker">SAGITTARIUS ARM · OUTER RIM · 4.1 × 10⁶ M☉</span>
        <h1>Interstellar X<sup>4</sup></h1>
        <p className="vl-tag">{TAGLINE}</p>
        <p className="vl-lead">{LEAD}</p>
        <div className="vl-cta">
          <button className="vl-launch" onClick={() => onTab('Generator')}>Launch simulation <span>→</span></button>
          <span className="vl-note">Auto-demo · shear → escape burn → safe orbit</span>
        </div>
      </section>
      <aside className="vl-side">
        <Horizon env={env} t={t} big />
        <dl className="vl-tele">
          <div><dt>Velocity</dt><dd>{sim.velocity} km/s</dd></div>
          <div><dt>Propellant</dt><dd>{sim.propellantKg} kg</dd></div>
          <div><dt>Integrity</dt><dd>{sim.systems[0].value}%</dd></div>
          <div><dt>Route</dt><dd>{sim.nav.origin} → {sim.nav.destination}</dd></div>
          <div><dt>Status</dt><dd>{sim.status}</dd></div>
        </dl>
      </aside>
      <div className="vl-corner"><EscapeDiagram env={env} rs={rs} /></div>
    </div>
  );
}

function Generator({ sim, tab, onTab }) {
  const d = sim.demo;
  const p = d.physics;
  const hz = useHazards(sim);
  const [view, setView] = useState('cinema');
  const [resetCount, resetView] = useViewReset();
  const threat = realThreat(sim);
  const drive = useRef(NO_DRIVE);
  drive.current = threat;

  // A new impact (real contact) replays the impact sequence when nothing bigger is going on.
  const [impactAt, setImpactAt] = useState(0);
  useEffect(() => { if (threat.impactKey) setImpactAt(now()); }, [threat.impactKey]);
  const recentImpact = impactAt && now() - impactAt < 13;
  const kind = L_KIND[threat.kind] ?? (recentImpact ? 'impact' : null);

  const director = useRef({ mode: 'event', start: -1, kind: null });
  const seqKey = kind === 'impact' ? `impact-${impactAt}` : kind;
  useEffect(() => {
    director.current = kind ? { mode: 'event', start: now(), kind } : { mode: 'event', start: -1, kind: null };
  }, [seqKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { env, t } = useEnv(director);
  const rs = horizonRs(env, t);

  useEffect(() => { if (d.armed) setView('physics'); }, [d.armed]);
  const physics = view === 'physics';
  const name = threat.name ?? (recentImpact ? `Impact · ${p.lastImpact?.part ?? ''}` : null);
  const live = {
    burning: threat.burn > 0, mode: p.mode, thrust: p.forceN.toFixed(0), fuel: sim.propellantKg,
    ai: d.ai.busy, latest: sim.logs[0]?.text ?? '',
  };

  return (
    <div className={`vl vl-console ikl-scope ${env.alert > 0.3 ? 'vl-alerting' : ''} ${physics ? 'vl-physics' : ''}`}>
      {physics ? (
        <div className="vl-canvas">
          <DemoViewport sim={sim} resetCount={resetCount}>
            <div className="vl-phys-grade" aria-hidden="true" />
            {d.stormFlash > 0 && <div key={d.stormFlash} className="ikl-flash" aria-hidden="true" />}
            {hz.armed && <div className="ikl-armed vl-armed">Click to launch {hz.armed} · Esc to cancel</div>}
          </DemoViewport>
        </div>
      ) : (
        <Cinema page="console" director={director} event={sim.event} drive={drive} />
      )}
      <div className="vl-letter top" />
      <div className="vl-letter bot" />
      <Nav tab={tab} onTab={onTab} sim={sim} />
      <div className="vl-toggle" role="group" aria-label="Generator view">
        <button className={!physics ? 'on' : ''} aria-pressed={!physics} onClick={() => { setView('cinema'); d.setArmed(null); }}>Cinematic</button>
        <button className={physics ? 'on' : ''} aria-pressed={physics} onClick={() => setView('physics')}>Physics</button>
      </div>
      {!physics && <Alert env={env} name={name} live={live} />}

      <aside className="vl-panel left">
        <h3>Inject hazard <span>OUTER</span></h3>
        <div className="vl-hz">
          {OUTER.map((n) => {
            const s = hz.state(n);
            return <button key={n} className={s === 'armed' ? 'armed' : s ? 'on' : ''} aria-pressed={Boolean(s)} onClick={() => hz.press(n)}>{n}{s === 'armed' && <em>ARMED</em>}</button>;
          })}
        </div>
        <h3>Onboard fault <span>INNER</span></h3>
        <div className="vl-hz">
          {INNER.map((n) => (
            <button key={n} className={hz.state(n) ? 'on' : ''} aria-pressed={Boolean(hz.state(n))} onClick={() => hz.press(n)}>{n}</button>
          ))}
        </div>
        <p className={`vl-hint ${hz.armed ? 'on' : ''}`}>{hz.hint}</p>
        <details className="vl-sec"><summary>Space rock</summary><RockForm sim={sim} /></details>
        <details className="vl-sec"><summary>Propulsion</summary><Propulsion sim={sim} /></details>
        <details className="vl-sec" open><summary>DEMO AI</summary><AiControls sim={sim} onOpenApi={() => onTab('AI API')} /></details>
        <button className="vl-reset" onClick={sim.clear}>Reset · all nominal</button>
        {!physics && <Horizon env={env} t={t} />}
      </aside>
      <aside className="vl-panel right">
        <h3>Systems <span>{sim.nav.origin} → {sim.nav.destination}</span></h3>
        <ul className="vl-sys">
          {sim.systems.map((s) => (
            <li key={s.key} className={s.value < 75 ? 'low' : ''}>
              <span>{s.label}</span>
              <b>{s.value}%</b>
              <i><em style={{ width: `${s.value}%` }} /></i>
            </li>
          ))}
        </ul>
        <h3>AI agents</h3>
        <ul className="vl-agents">
          {sim.agents.map((a) => (
            <li key={a.id} className={a.ok ? '' : 'warn'} title={a.reason || undefined}>
              <i />
              <span>{a.name}</span>
              <b>{a.state}</b>
            </li>
          ))}
        </ul>
        <details className="vl-sec"><summary>Flight data</summary><FlightData sim={sim} /></details>
        <details className="vl-sec" open={threat.damage > 0}><summary>Component damage</summary><Damage sim={sim} /></details>
        <details className="vl-sec" open><summary>Nearby objects</summary><Nearby sim={sim} /></details>
        <h3>Log</h3>
        <ol className="vl-log">
          {sim.logs.slice(0, 8).map((l) => (
            <li key={l.id} className={l.alert ? 'alert' : ''}><time>{l.time}</time> {l.text}</li>
          ))}
        </ol>
      </aside>
      {!physics && <div className="vl-corner console"><EscapeDiagram env={env} rs={rs} /></div>}
      <div className="vl-transport"><Transport sim={sim} onResetView={physics ? resetView : undefined} /></div>
    </div>
  );
}

/** Other tabs: the real page body in a glass frame over a CSS black hole (no second WebGL context). */
function Frame({ sim, tab, onTab, children, aside, narrow }) {
  return (
    <div className="vl vl-page ikl-scope">
      <div className="vl-canvas vl-cssbh vl-cssbh-page" aria-hidden="true" />
      <div className="vl-letter top" />
      <Nav tab={tab} onTab={onTab} sim={sim} />
      <div className={`vl-page-body ${aside ? 'with-aside' : ''}`}>
        <div className={`vl-glass ${narrow ? 'narrow' : ''}`}><div className="vl-glass-in ikl-embed">{children}</div></div>
        {aside}
      </div>
    </div>
  );
}

function Console({ sim, tab, onTab }) {
  if (tab === 'Generator') return <Generator sim={sim} tab={tab} onTab={onTab} />;
  if (tab === 'Planetary Trajectories') {
    return (
      <Frame sim={sim} tab={tab} onTab={onTab} aside={(
        <aside className="vl-panel vl-mission">
          <h3>Mission <span>{sim.demo.celestialDate.slice(0, 10)}</span></h3>
          <dl className="vl-tele">{missionRows(sim).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </aside>
      )}>
        <TrajectoriesView sim={sim} />
      </Frame>
    );
  }
  if (tab === 'AI Logs') return <Frame sim={sim} tab={tab} onTab={onTab}><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Frame>;
  if (tab === 'AI API') return <Frame sim={sim} tab={tab} onTab={onTab} narrow><div className="vl-scroll"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></div></Frame>;
  return <Frame sim={sim} tab={tab} onTab={onTab}><SpacecraftView sim={sim} /></Frame>;
}

export default function VariantL({ page, tab, onTab, sim }) {
  return page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} tab={tab} onTab={onTab} />;
}
