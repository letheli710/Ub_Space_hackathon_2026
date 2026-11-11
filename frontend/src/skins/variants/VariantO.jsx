// Variant O: Woodblock · 浮世绘星海. Space as an Edo-period woodblock print: Prussian-blue bokashi sky,
// flat moon disc, spiral clouds, and the solar wind as a towering wave with claw-like foam. The real
// StationShip is re-shaded as flat cel tones with black inverted-hull key lines. On the Generator the
// print follows the REAL demo session: the great wave rises on a real solar storm, inbound rocks and
// aliens rain as meteors, the black hole is a whirlpool, real burns light the flame tongues and real
// impacts shake the plate. "Print / Physics" swaps in the real DemoViewport under washi and indigo.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import StationShip from '../../components/station/StationShip.jsx';
import {
  AiApiView, AiLogsView, DemoViewport, FEATURES, LEAD, SpacecraftView, TABS, TAGLINE, TrajectoriesView, useViewReset,
} from '../demoSkin.jsx';
import {
  AiControls, ArmedHint, EventLog, HazardControls, MissionInfo, PropulsionControls, RockControls, SceneBoundary, Telemetry, Transport,
  impactKey, useArmedSwitch, useOnImpact, useShaderGuard,
} from './variantMNOKit.jsx';
import './variantMNOKit.css';
import './variantO.css';

/* ------------------------------------------------------------------ helpers */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const f1 = (v) => v.toFixed(1);

const COL = {
  ink: '#16130f', paper: '#efe6d0', cream: '#f3ead2', bero: '#1d3466', bero2: '#2f5c99', bero3: '#7fa3c8',
  verm: '#c4452d', ochre: '#c9963a', sage: '#6f8f7a', night: '#14234a',
};

const KIND = (name) => {
  if (!name) return null;
  if (name === 'Asteroid Collision') return 'meteor';
  if (name === 'Black Hole Encounter') return 'swirl';
  if (name === 'Solar Storm') return 'wave';
  if (name === 'Alien Encounter') return 'meteor';
  return 'inner';
};
const AUTO = ['wave', 'meteor', 'swirl'];
const PLATES = {
  wave: { no: 'I', jp: '太陽風の大浪', en: 'The Great Solar-Wind Wave' },
  meteor: { no: 'II', jp: '流星雨', en: 'Rain of Meteors' },
  swirl: { no: 'III', jp: '黒渦', en: 'The Black Whirlpool' },
  inner: { no: 'IV', jp: '船内異変', en: 'Trouble Aboard' },
};

function catmull(pts, seg) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const c = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const poly = (pts) => 'M' + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L');

/* ------------------------------------------------------- procedural textures */
function makeTextures() {
  // Washi: warm fibrous noise, tiled.
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 232 + (Math.random() - 0.5) * 26;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 4; img.data[i * 4 + 2] = v - 14; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * Math.PI, l = 6 + Math.random() * 26;
    g.strokeStyle = Math.random() < 0.6 ? 'rgba(120,100,70,0.22)' : 'rgba(255,252,240,0.5)';
    g.lineWidth = 0.4 + Math.random() * 0.8;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + Math.random() * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const washi = c.toDataURL();

  // Wood grain: long wavering rings, as left by the printing block in flat areas.
  const w = document.createElement('canvas');
  w.width = 512; w.height = 256;
  const h = w.getContext('2d');
  h.clearRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 3) {
    h.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const yy = y + Math.sin(x * 0.012 + y * 0.09) * 5 + Math.sin(x * 0.031 + y) * 1.6;
      x === 0 ? h.moveTo(x, yy) : h.lineTo(x, yy);
    }
    h.strokeStyle = `rgba(10,15,30,${0.08 + 0.18 * hash(y)})`;
    h.lineWidth = 0.6 + 1.6 * hash(y + 9);
    h.stroke();
  }
  return { washi, grain: w.toDataURL() };
}


/* ----------------------------------------------------------- the director */
/**
 * One mutable timeline shared by the SVG print layers and the 3D ship: which hazard, how strong, the
 * manoeuvre. Home: an autoplay reel. Generator: the real session (R) — storm → wave, black hole →
 * whirlpool, inbound rocks/aliens → meteors, active faults → trouble aboard; real thrust → manoeuvre.
 */
function useDirector(page, event, R) {
  const D = useRef({ kind: 'wave', active: false, age: 99, level: 0, man: 0, time: 0, evKind: null, evT0: 0, evName: null, hit: -99 }).current;
  const [plate, setPlate] = useState(null);
  useEffect(() => {
    D.evKind = KIND(event?.name);
    D.evName = event?.name ?? null;
    D.evT0 = performance.now() / 1000;
  }, [event, D]);
  useEffect(() => {
    let raf, last = performance.now() / 1000, shown, realKind = null, realT0 = 0;
    const start = last;
    const loop = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;
      D.time = now - start;
      let active = false, t0 = null, target = 0, man = null;
      if (page === 'home') {
        if (D.evKind) { D.kind = D.evKind; active = true; t0 = D.evT0; }
        else {
          const C = 13, T = now - start, c = Math.floor(T / C), l = T - c * C;
          D.kind = AUTO[c % AUTO.length];
          active = l > 2.5 && l < 10.5;
          t0 = start + c * C + 2.5;
        }
        const a = active ? now - t0 : 99;
        target = active ? (a < 5.5 ? 1 : 0.62) : 0;
      } else {
        const k = R.storm ? 'wave' : R.bh ? 'swirl' : R.meteor ? 'meteor' : R.inner ? 'inner' : null;
        if (k !== realKind) { realKind = k; realT0 = now; }
        if (k) { D.kind = k; active = true; t0 = realT0; }
        // An incoming storm front swells the wave; the hit itself raises it to full height.
        target = !k ? 0 : k === 'wave' ? (R.stormHit ? 1 : 0.72) : 1;
        man = R.burn ? 1 : R.correcting ? 0.3 : 0;
      }
      D.active = active;
      D.age = active ? now - t0 : D.age + dt;
      const a = D.age;
      D.level += (target - D.level) * (1 - Math.exp(-dt * (active && a < 2 ? 2.4 : 1.1)));
      if (man === null) D.man = active ? smooth(0.15, 0.9, a) * (1 - smooth(3.8, 6.2, a)) : D.man * Math.exp(-dt * 3);
      else D.man += (man - D.man) * (1 - Math.exp(-dt * 4));
      D.hitAge = now - D.hit;
      const p = active ? D.kind : null;
      if (p !== shown) { shown = p; setPlate(p); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [page, D, R]);
  return [D, plate];
}
const lv = (D, k) => (D.kind === k ? D.level : 0);

/* ----------------------------------------------------------- the wave */
const SPINE_LOW = [[650, 740], [640, 700], [612, 672], [575, 655], [530, 646], [485, 648], [448, 660], [430, 676], [444, 690], [468, 688], [472, 678]];
const SPINE_HIGH = [[660, 740], [650, 560], [610, 395], [545, 262], [452, 172], [338, 150], [246, 192], [212, 272], [246, 332], [302, 322], [306, 280]];

function buildWave(r, time, cfg) {
  const ctrl = SPINE_LOW.map((p, i) => {
    const q = SPINE_HIGH[i];
    const wob = Math.sin(time * 0.9 + i * 0.8 + cfg.seed) * (3 + 7 * r) * (i / 10);
    return [lerp(p[0], q[0], r) + wob, lerp(p[1], q[1], r) + wob * 0.6];
  });
  const S = catmull(ctrl, 14);
  const N = S.length;
  const T = [], Nn = [], W = [];
  const Wb = 70 + 150 * r;
  for (let i = 0; i < N; i++) {
    const a = S[Math.max(i - 1, 0)], b = S[Math.min(i + 1, N - 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    T.push([tx, ty]);
    Nn.push([-ty, tx]);
    const u = i / (N - 1);
    W.push(Wb * Math.pow(1 - u, 0.75) + 1.5);
  }
  const edge = (f, i0, i1) => {
    const out = [];
    for (let i = i0; i <= i1; i++) out.push([S[i][0] + Nn[i][0] * W[i] * f, S[i][1] + Nn[i][1] * W[i] * f]);
    return out;
  };
  const idx = (u) => Math.round(clamp01(u) * (N - 1));
  const strip = (fa, fb, ua, ub) => {
    const i0 = idx(ua), i1 = idx(ub);
    return poly([...edge(fb, i0, i1), ...edge(fa, i0, i1).reverse()]) + 'Z';
  };
  // Body: face (spine) up to the lip tip, back along the lip's outer edge, then the back slope down.
  const uc = 0.42, ic = idx(uc);
  const outer = edge(1, ic, N - 1).reverse();
  const O = outer[outer.length - 1];
  const back = [];
  for (let k = 1; k <= 12; k++) {
    const t = k / 12, mt = 1 - t;
    const c1 = [O[0] + 170, O[1] + 12], c2 = [1240, 470 + 160 * (1 - r)], B = [1420, 760];
    back.push([
      mt * mt * mt * O[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * B[0],
      mt * mt * mt * O[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * B[1],
    ]);
  }
  const body = poly([...S, ...outer, ...back, [S[0][0], 760]]) + 'Z';

  const bands = strip(0.14, 0.4, 0.0, 0.8) + strip(0.52, 0.72, 0.02, 0.74);
  const lines = [0.08, 0.27, 0.62, 1.35, 1.75, 2.2].map((f, k) => {
    const ua = f > 1 ? 0.03 + k * 0.03 : 0.06, ub = f > 1 ? uc - 0.06 * (k - 2) : 0.86 - k * 0.06;
    return poly(edge(f, idx(ua), idx(ub)));
  }).join('');
  const foam = strip(0.8, 1.0, 0.36, 1);

  // Claw-like foam fingers along the lip, hooking forward.
  let claws = '';
  if (r > 0.08) {
    for (let i = idx(0.4); i < N - 3; i += 3) {
      const u = i / (N - 1);
      const P = [S[i][0] + Nn[i][0] * W[i], S[i][1] + Nn[i][1] * W[i]];
      const L = r * cfg.claw * (0.35 + 0.65 * Math.sin(Math.PI * clamp01((u - 0.38) / 0.62))) * (0.82 + 0.18 * Math.sin(time * 2.6 + i * 1.7));
      for (const [sc, hk, off] of [[1, 0.95, 0], [0.55, 1.4, 0.35]]) {
        const len = L * sc;
        if (len < 4) continue;
        const n = Nn[i], tg = T[i];
        const base = [P[0] - tg[0] * len * off * 0.4, P[1] - tg[1] * len * off * 0.4];
        const left = [], right = [];
        let prev = null;
        for (let k = 0; k <= 7; k++) {
          const s = k / 7;
          const out = len * (s - 0.5 * s * s * s), fw = len * hk * s * s;
          const c = [base[0] + n[0] * out + tg[0] * fw, base[1] + n[1] * out + tg[1] * fw];
          let d = prev ? [c[0] - prev[0], c[1] - prev[1]] : n;
          const dl = Math.hypot(d[0], d[1]) || 1;
          d = [d[0] / dl, d[1] / dl];
          const hw = len * 0.2 * Math.pow(1 - s, 0.85) + 0.4;
          left.push([c[0] - d[1] * hw, c[1] + d[0] * hw]);
          right.push([c[0] + d[1] * hw, c[1] - d[0] * hw]);
          prev = c;
        }
        claws += poly([...left, ...right.reverse()]) + 'Z';
      }
    }
  }

  // Spray: flat white dots thrown off the lip, drifting outward and shrinking.
  let spray = '';
  const count = Math.round(cfg.spray * clamp01(r * 1.3 - 0.1));
  for (let j = 0; j < count; j++) {
    const h1 = hash(j + cfg.seed * 13), h2 = hash(j * 3.1 + 2), h3 = hash(j * 7.7 + 5);
    const i = idx(0.45 + 0.55 * h1);
    const ph = (h2 + time * (0.18 + 0.3 * h3)) % 1;
    const n = Nn[i], tg = T[i];
    const d = 10 + cfg.claw * 1.7 * ph;
    const x = S[i][0] + n[0] * (W[i] + d) + tg[0] * cfg.claw * 1.2 * ph * ph;
    const y = S[i][1] + n[1] * (W[i] + d) + tg[1] * cfg.claw * 1.2 * ph * ph + 30 * ph * ph;
    const rad = (1 - ph) * (1.5 + 4.5 * h3);
    spray += `M${f1(x - rad)} ${f1(y)}a${f1(rad)} ${f1(rad)} 0 1 0 ${f1(rad * 2)} 0a${f1(rad)} ${f1(rad)} 0 1 0 ${f1(-rad * 2)} 0`;
  }
  return { body, bands, lines, foam, claws, spray };
}

function Wave({ D, cfg, grain, className }) {
  const refs = useRef({});
  const set = (k) => (el) => { refs.current[k] = el; };
  const svg = useRef();
  useEffect(() => {
    let raf;
    const loop = () => {
      const r = cfg.rise(D);
      const g = buildWave(r, D.time, cfg);
      const R = refs.current;
      R.body?.setAttribute('d', g.body);
      R.grain?.setAttribute('d', g.body);
      R.key?.setAttribute('d', g.body);
      R.bands?.setAttribute('d', g.bands);
      R.lines?.setAttribute('d', g.lines);
      R.foam?.setAttribute('d', g.foam);
      R.claws?.setAttribute('d', g.claws);
      R.spray?.setAttribute('d', g.spray);
      if (svg.current && cfg.move) svg.current.style.transform = cfg.move(D);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [D, cfg]);
  const id = `vo-grain-${cfg.seed}`;
  return (
    <svg ref={svg} className={`vo-wave ${className}`} viewBox="0 0 1000 700" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width="512" height="256" patternTransform="rotate(-8)">
          <image href={grain} width="512" height="256" />
        </pattern>
      </defs>
      <g transform={cfg.mirror ? 'translate(1000 0) scale(-1 1)' : undefined}>
        <path ref={set('body')} fill={cfg.c[0]} />
        <path ref={set('bands')} fill={cfg.c[1]} />
        <path ref={set('grain')} fill={`url(#${id})`} opacity="0.55" />
        <path ref={set('lines')} fill="none" stroke={cfg.c[3]} strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
        <path ref={set('foam')} fill={cfg.c[2]} />
        <path ref={set('claws')} fill={cfg.c[2]} stroke={COL.ink} strokeWidth="1.6" strokeLinejoin="round" />
        <path ref={set('key')} fill="none" stroke={COL.ink} strokeWidth="3.2" strokeLinejoin="round" transform="translate(-3.5 -2.5)" />
        <path ref={set('spray')} fill={cfg.c[2]} stroke={COL.ink} strokeWidth="0.9" />
      </g>
    </svg>
  );
}

const WAVES = {
  far: {
    seed: 3, claw: 26, spray: 10, mirror: false, c: ['#5d82b2', '#88a9cc', '#e6ebe2', '#e6ebe2'],
    rise: (D) => 0.34 + 0.08 * Math.sin(D.time * 0.5) + 0.25 * lv(D, 'wave'),
  },
  back: {
    seed: 7, claw: 34, spray: 18, mirror: true, c: ['#172a58', '#2a4f88', '#ece3c9', '#9db6d4'],
    rise: (D) => 0.3 + 0.1 * Math.sin(D.time * 0.6 + 1) + 0.35 * lv(D, 'wave') + 0.15 * lv(D, 'inner'),
  },
  front: {
    seed: 1, claw: 48, spray: 46, mirror: false, c: [COL.bero, COL.bero2, COL.cream, '#cfdcea'],
    rise: (D) => Math.min(1, 0.14 + 0.05 * Math.sin(D.time * 0.7) + 0.86 * lv(D, 'wave') + 0.4 * lv(D, 'inner') + 0.12 * (lv(D, 'meteor') + lv(D, 'swirl'))),
    move: (D) => {
      const w = lv(D, 'wave');
      return `translate(${f1(-7 * w)}vw, ${f1(Math.sin(D.time * 0.8) * 0.6)}vh)`;
    },
  },
};

/* ----------------------------------------------------------- the sky print */
const STARS = Array.from({ length: 110 }, (_, i) => ({
  x: hash(i) * 1600, y: Math.pow(hash(i + 50), 1.6) * 470, r: 1 + hash(i + 99) * 2.4, o: hash(i + 7) < 0.18,
}));

function spiralPath(cx, cy, r0, turns, dir = 1) {
  const pts = [];
  for (let k = 0; k <= 48; k++) {
    const t = k / 48, a = dir * t * turns * Math.PI * 2, rr = r0 * (1 - t);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return poly(pts);
}
/** A stylised kumo: a flat band with a spiral curl at its end. */
function Cloud({ x, y, len, th, flip, cls }) {
  const cx = flip ? x : x + len;
  return (
    <g className={`vo-cloud ${cls || ''}`}>
      <rect x={x} y={y - th} width={len} height={th * 2} rx={th} fill="#d9dccf" />
      <rect x={x + 3} y={y - th + 2.5} width={len} height={th * 2} rx={th} fill="none" stroke={COL.ink} strokeWidth="2" />
      <circle cx={cx} cy={y} r={th * 1.25} fill="#d9dccf" stroke={COL.ink} strokeWidth="2" />
      <path d={spiralPath(cx, y, th * 1.05, 2.2, flip ? -1 : 1)} fill="none" stroke={COL.ink} strokeWidth="1.8" />
      <line x1={x + th} x2={x + len - th} y1={y} y2={y} stroke="#b8c2bf" strokeWidth={th * 0.45} strokeLinecap="round" />
    </g>
  );
}

const SWIRL_ARMS = [0, 1, 2].map((k) => {
  const pts = [], inner = [];
  for (let s = 0; s <= 40; s++) {
    const t = s / 40, a = k * (Math.PI * 2 / 3) + t * Math.PI * 2.6, rr = 50 + t * 250, w = 8 + t * 34;
    pts.push([Math.cos(a) * (rr + w), Math.sin(a) * (rr + w)]);
    inner.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return { band: poly([...pts, ...inner.reverse()]) + 'Z', line: poly(inner) };
});

const FLAME = 'M0 -17C45 -28 95 -20 160 -40C128 -16 178 -12 240 -22C168 4 128 10 162 34C96 20 44 27 0 17A17 17 0 0 1 0 -17Z';
const METEORS = Array.from({ length: 6 }, (_, j) => ({
  sp: 0.2 + hash(j + 1) * 0.16, off: j / 6 + hash(j + 20) * 0.1, sc: 0.8 + hash(j + 40) * 0.7,
  a: [1500 + hash(j + 3) * 400, -200 + hash(j + 11) * 380], b: [-150 + j * 170 + hash(j + 8) * 90, 980],
}));

function SkyPrint({ D }) {
  const swirl = useRef(), mets = useRef([]), moon = useRef();
  useEffect(() => {
    let raf;
    const loop = () => {
      const s = lv(D, 'swirl');
      if (swirl.current) {
        swirl.current.setAttribute('transform', `translate(1000 300) scale(${(0.2 + 0.7 * s).toFixed(3)}) rotate(${f1(-D.time * 40)})`);
        swirl.current.style.opacity = f1(Math.min(1, s * 1.4) * 100) / 100;
      }
      if (moon.current) moon.current.setAttribute('transform', `translate(${f1(-s * 30)} ${f1(s * 10)})`);
      const m = lv(D, 'meteor');
      METEORS.forEach((mt, j) => {
        const el = mets.current[j];
        if (!el) return;
        if (m < 0.02) { el.style.opacity = 0; return; }
        const p = (D.time * mt.sp + mt.off) % 1;
        const x = lerp(mt.a[0], mt.b[0], p), y = lerp(mt.a[1], mt.b[1], p);
        const ang = (Math.atan2(mt.a[1] - mt.b[1], mt.a[0] - mt.b[0]) * 180) / Math.PI;
        const flick = 1 + 0.08 * Math.sin(D.time * 30 + j);
        el.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)}) scale(${(mt.sc * flick).toFixed(3)})`);
        el.style.opacity = f1(m * Math.min(1, Math.sin(Math.PI * p) * 3) * 100) / 100;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [D]);
  return (
    <svg className="vo-skyprint" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="vo-moon" cx="45%" cy="42%" r="60%">
          <stop offset="0" stopColor="#f6eed6" />
          <stop offset="0.75" stopColor="#efe2bf" />
          <stop offset="1" stopColor="#dcc48c" />
        </radialGradient>
      </defs>
      <g>
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.o ? COL.ochre : '#efe6cc'} opacity={0.9} />
        ))}
      </g>
      {/* Moon: fill plate deliberately misregistered from the key line */}
      <g ref={moon}>
        <circle cx="1310" cy="205" r="168" fill="#e9d7a6" opacity="0.35" />
        <circle cx="1310" cy="205" r="148" fill="url(#vo-moon)" />
        <circle cx="1305" cy="201" r="148" fill="none" stroke={COL.ink} strokeWidth="3.2" />
        <circle cx="1310" cy="205" r="126" fill="none" stroke="#d8c290" strokeWidth="2" strokeDasharray="2 9" />
      </g>
      {/* Small ringed planet */}
      <g className="vo-planet">
        <ellipse cx="420" cy="350" rx="74" ry="15" fill="none" stroke={COL.verm} strokeWidth="7" transform="rotate(-14 420 350)" />
        <circle cx="420" cy="350" r="36" fill={COL.ochre} />
        <path d="M384 350a36 36 0 0 0 72 0" fill="#b07c2b" />
        <circle cx="417" cy="347" r="36" fill="none" stroke={COL.ink} strokeWidth="2.6" />
        <path d="M349 368 A74 15 -14 0 0 492 332" fill="none" stroke={COL.verm} strokeWidth="7" transform="rotate(0)" />
      </g>
      <Cloud x={980} y={300} len={330} th={15} cls="d1" />
      <Cloud x={1180} y={360} len={260} th={11} flip cls="d2" />
      <Cloud x={120} y={250} len={240} th={12} flip cls="d3" />
      <Cloud x={560} y={150} len={200} th={9} cls="d2" />
      {/* Black hole: a Prussian-blue whirlpool */}
      <g ref={swirl} style={{ opacity: 0 }}>
        {[290, 250, 210, 170, 130, 95].map((r, i) => (
          <circle key={r} r={r} fill={i % 2 ? COL.bero2 : COL.bero} opacity={0.92} />
        ))}
        {SWIRL_ARMS.map((a, i) => (
          <g key={i}>
            <path d={a.band} fill={i % 2 ? '#4f7fb5' : '#6f97c4'} />
            <path d={a.line} fill="none" stroke={COL.cream} strokeWidth="2.4" />
          </g>
        ))}
        <circle r="62" fill="none" stroke={COL.ochre} strokeWidth="3" strokeDasharray="3 7" />
        <circle r="54" fill="none" stroke={COL.verm} strokeWidth="6" />
        <circle r="46" fill={COL.ink} />
        <circle r="290" fill="none" stroke={COL.ink} strokeWidth="3" transform="translate(-3 -2)" />
      </g>
      {/* Meteors: flat flame tongues with key lines */}
      {METEORS.map((_, j) => (
        <g key={j} ref={(el) => { mets.current[j] = el; }} style={{ opacity: 0 }}>
          <path d={FLAME} fill={COL.verm} stroke={COL.ink} strokeWidth="2.4" strokeLinejoin="round" />
          <path d={FLAME} fill={COL.ochre} transform="translate(6 0) scale(0.62)" />
          <path d={FLAME} fill={COL.cream} transform="translate(8 0) scale(0.3)" />
          <path d="M-14 -6L-4 -15L10 -12L15 2L6 14L-10 12Z" fill="#3a3027" stroke={COL.ink} strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

/* ----------------------------------------------------------- woodblock ship */
const OUTLINE = new THREE.ShaderMaterial({
  uniforms: { thick: { value: 0.022 } },
  vertexShader: /* glsl */ `
    uniform float thick;
    void main() {
      vec3 n = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      mv.xyz += n * thick;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(0.086, 0.075, 0.06, 1.0); }`,
  side: THREE.BackSide,
});

function gradientMap() {
  const t = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function paletteFor(src) {
  const hsl = {};
  const c = src.color ? src.color.clone() : new THREE.Color('#888');
  c.convertLinearToSRGB?.();
  c.getHSL(hsl);
  const h = hsl.h * 360;
  if (src.emissive && src.emissiveIntensity > 0.4 && src.emissive.getHSL({}).l > 0.15) return { basic: true, col: COL.verm };
  if (hsl.l > 0.7) return { col: COL.cream };
  if (hsl.l < 0.14) return { col: '#26324f' };
  if (hsl.s > 0.3) {
    if (h < 22 || h > 330) return { col: COL.verm };
    if (h < 70) return { col: COL.ochre };
    if (h < 190) return { col: COL.sage };
    return { col: '#2f4f86' };
  }
  return hsl.l > 0.42 ? { col: '#b9c1bd' } : { col: '#4a6189' };
}

/** Re-shades whatever the station renders as flat woodblock tones with inverted-hull key lines. */
function useWoodblock(root) {
  const grad = useMemo(gradientMap, []);
  const cache = useMemo(() => new Map(), []);
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 30 !== 1 || !root.current) return;
    const todo = [];
    root.current.traverse((o) => {
      if (!o.isMesh || o.userData.voOutline || o.userData.voKeep) return;
      if (o.userData.visualEffect) { o.visible = false; return; }
      todo.push(o);
    });
    for (const m of todo) {
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      if (src && !src.userData?.voToon) {
        let mat = cache.get(src.uuid);
        if (!mat) {
          const p = paletteFor(src);
          mat = p.basic ? new THREE.MeshBasicMaterial({ color: p.col }) : new THREE.MeshToonMaterial({ color: p.col, gradientMap: grad });
          mat.transparent = src.transparent && src.opacity < 0.99;
          mat.opacity = src.opacity ?? 1;
          mat.side = src.side ?? THREE.FrontSide;
          mat.userData.voToon = true;
          cache.set(src.uuid, mat);
        }
        m.material = mat;
      }
      if (!m.userData.voOutlined && !m.isInstancedMesh && !m.isSkinnedMesh && m.geometry?.attributes?.normal) {
        const o = new THREE.Mesh(m.geometry, OUTLINE);
        o.userData.voOutline = true;
        o.raycast = () => {};
        m.add(o);
        m.userData.voOutlined = true;
      }
    }
  });
}

const FLAME_MATS = [COL.verm, COL.ochre, COL.cream].map((c) => new THREE.MeshBasicMaterial({ color: c }));
const CONE = new THREE.ConeGeometry(1, 1, 14, 1, false).translate(0, 0.5, 0);

/** Flat, outlined flame tongues behind the engine bell (ship-local −Z). */
function Flames({ D }) {
  const g = useRef();
  const tongues = useRef([]);
  useFrame((s) => {
    const T = s.clock.elapsedTime;
    const fail = D.evName === 'Engine Failure' || D.evName === 'Thruster Failure';
    let thrust = 0.55 + 0.35 * D.level + 2.2 * D.man;
    if (fail) thrust *= Math.sin(T * 13) > 0.55 ? 0.6 : 0.05;
    tongues.current.forEach((m, i) => {
      if (!m) return;
      const k = [1, 0.7, 0.42, 0.55, 0.55][i];
      const len = (3 + 6.5 * thrust) * k * (1 + 0.13 * Math.sin(T * 31 + i * 2) + 0.07 * Math.sin(T * 47 + i));
      const rad = [1.35, 0.9, 0.5, 0.6, 0.6][i] * (0.8 + 0.2 * thrust);
      m.scale.set(rad, len, rad);
    });
    if (g.current) g.current.visible = thrust > 0.08;
  });
  const tongue = (i, mat, pos = [0, 0, 0], rot = 0) => (
    <group key={i} position={pos} rotation={[0, 0, rot]}>
      <mesh ref={(el) => { tongues.current[i] = el; }} geometry={CONE} material={mat} userData={{ voKeep: true }}>
        {i === 0 || i > 2 ? <mesh geometry={CONE} material={OUTLINE} userData={{ voOutline: true }} /> : null}
      </mesh>
    </group>
  );
  return (
    <group ref={g} position={[0, 0, -20.3]} rotation={[-Math.PI / 2, 0, 0]}>
      {tongue(3, FLAME_MATS[0], [0.9, 0, 0], -0.28)}
      {tongue(4, FLAME_MATS[0], [-0.9, 0, 0], 0.28)}
      {tongue(0, FLAME_MATS[0])}
      {tongue(1, FLAME_MATS[1], [0, 0.05, 0])}
      {tongue(2, FLAME_MATS[2], [0, 0.1, 0])}
    </group>
  );
}

function ShipRig({ D, event, page }) {
  const pos = useRef(), att = useRef(), inner = useRef();
  const { viewport } = useThree();
  useWoodblock(inner);
  const cur = useRef({ x: 0, y: 0, p: 0, r: 0, init: false });
  useFrame((s, dt) => {
    const T = s.clock.elapsedTime, m = D.man, a = D.age, vw = viewport.width, vh = viewport.height;
    let x = -vw * (page === 'console' ? 0.04 : 0.1), y = -vh * 0.03 + Math.sin(T * 0.9) * 0.09;
    let pitch = Math.sin(T * 0.9 + 0.6) * 0.05, roll = Math.sin(T * 0.7) * 0.1;
    if (D.kind === 'wave') {
      x -= m * vw * 0.08; y += m * vh * 0.03 + Math.sin(a * 2.2) * 0.14 * m;
      pitch += -0.32 * m + 0.12 * lv(D, 'wave') * Math.sin(T * 1.3);
      roll += m * 0.55 * Math.sin(a * 2.4);
    } else if (D.kind === 'meteor') {
      y += m * vh * 0.09 * Math.sin(a * 2.6); x += m * 0.35 * Math.sin(a * 1.3);
      roll += m * 0.85 * Math.sin(a * 2.6); pitch += m * 0.18 * Math.cos(a * 2.6);
    } else if (D.kind === 'swirl') {
      const pull = D.active ? smooth(0, 1.4, a) * (1 - smooth(1.4, 2.8, a)) : 0;
      const run = D.active ? smooth(1.6, 3.4, a) * (1 - smooth(5, 7.5, a)) : 0;
      x += pull * vw * 0.06 - run * vw * 0.1; y += pull * vh * 0.08 - run * vh * 0.03;
      pitch += pull * 0.25 - run * 0.15;
      roll += Math.PI * 2 * smooth(1.5, 3.6, a);
    } else if (D.kind === 'inner') {
      x += Math.sin(T * 31) * 0.02 * D.level; y += Math.sin(T * 27) * 0.02 * D.level;
      roll += Math.sin(T * 3) * 0.25 * D.level;
    }
    // A real impact knocks the ship sideways and sets it rolling.
    const h = D.hitAge ?? 99;
    if (h < 2.5) {
      const k = Math.exp(-h * 2.2);
      x += Math.sin(h * 19) * 0.25 * k; y += Math.cos(h * 23) * 0.18 * k; roll += 0.6 * k;
    }
    const c = cur.current, k = c.init ? 1 - Math.exp(-dt * 5) : 1;
    c.init = true;
    c.x += (x - c.x) * k; c.y += (y - c.y) * k; c.p += (pitch - c.p) * k; c.r += (roll - c.r) * k;
    pos.current.position.set(c.x, c.y, 0);
    att.current.rotation.set(c.r, 0, c.p);
  });
  const scale = Math.min(0.1, (viewport.width / 38) * 0.5) * (page === 'console' ? 0.82 : 1);
  return (
    <group ref={pos}>
      <group ref={att}>
        <group rotation={[0.12, -Math.PI / 2 + 0.42, 0]} scale={scale}>
          <group position={[0, 0, 3.5]}>
            <group ref={inner}>
              <StationShip event={event} />
            </group>
            <Flames D={D} />
          </group>
        </group>
      </group>
    </group>
  );
}

/* ----------------------------------------------------------- stage + UI */
function Stage({ D, sim, page, tex, onCreated, onError, failed }) {
  return (
    <div className="vo-stage" aria-hidden="true">
      <div className="vo-sky" />
      <SkyPrint D={D} />
      <div className="vo-sea" />
      <Wave D={D} cfg={WAVES.far} grain={tex.grain} className="far" />
      <Wave D={D} cfg={WAVES.back} grain={tex.grain} className="back" />
      {!failed && (
        <div className="vo-ship">
          <SceneBoundary onError={onError}>
            <Canvas flat dpr={[1, 2]} camera={{ position: [0, 0, 10], fov: 40 }} gl={{ alpha: true, antialias: true }} onCreated={onCreated}>
              <ambientLight intensity={1.1} color="#fff6e6" />
              <directionalLight position={[-4, 6, 5]} intensity={2.4} color="#fffaf0" />
              <ShipRig D={D} event={sim.event} page={page} />
            </Canvas>
          </SceneBoundary>
        </div>
      )}
      <Wave D={D} cfg={WAVES.front} grain={tex.grain} className="front" />
      <div className="vo-paper" style={{ backgroundImage: `url(${tex.washi})` }} />
      <div className="vo-edge" />
    </div>
  );
}

/** The real 3D DEMO scene printed on washi: indigo tint, paper grain, the plate's key-line border. */
function PhysicsPlate({ sim, tex, resetCount }) {
  return (
    <div className="vo-stage vo-physplate">
      <DemoViewport sim={sim} resetCount={resetCount} className="vo-viewport" />
      <div className="vo-indigo" aria-hidden="true" />
      <div className="vo-paper" aria-hidden="true" style={{ backgroundImage: `url(${tex.washi})` }} />
      <div className="vo-edge" aria-hidden="true" />
    </div>
  );
}

function Seal({ children, small }) {
  return <span className={`vo-seal ${small ? 'sm' : ''}`}>{children}</span>;
}

function Nav({ tab, onTab, sim }) {
  return (
    <nav className="vo-nav">
      {TABS.map((t) => (
        <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>{t}</button>
      ))}
      <span className="vo-met">MET {sim.met} · Day {sim.day} · {sim.status}</span>
    </nav>
  );
}

function TitleCartouche({ compact }) {
  return (
    <header className={`vo-cart vo-title ${compact ? 'compact' : ''}`}>
      <div className="vo-title-main">
        <small>宇宙百景 · Views of the Void</small>
        <h1>Interstellar X<sup>4</sup></h1>
        {!compact && <p className="vo-tag">{TAGLINE}</p>}
      </div>
      <div className="vo-vert">星海浮世絵</div>
      <Seal>星<br />X⁴</Seal>
    </header>
  );
}

function PlateBanner({ plate, sim, page }) {
  if (!plate) return null;
  const p = PLATES[plate];
  const name = page === 'home' ? sim.event?.name ?? p.en : sim.event?.name && KIND(sim.event.name) === plate ? sim.event.name : p.en;
  return (
    <div className="vo-alarm" key={plate}>
      <span className="vo-alarm-jp">警報</span>
      <span className="vo-alarm-en">{name}</span>
      <span className="vo-alarm-sub">{p.jp}</span>
    </div>
  );
}

function Signature({ plate }) {
  const p = PLATES[plate || 'wave'];
  return (
    <div className="vo-sign">
      <div className="vo-sign-v">X⁴ 宇宙百景 · 画</div>
      <Seal small>印</Seal>
      <span className="vo-sign-cap">Plate {p.no} · {plate ? p.en : 'Calm Passage'}</span>
    </div>
  );
}

function Home({ onTab, plate, sim }) {
  return (
    <>
      <TitleCartouche />
      <section className="vo-cart vo-lead">
        <p>{LEAD}</p>
        <ul>{FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
        <button className="vo-cta" onClick={() => onTab('Generator')}>
          Launch Simulation <span>出航</span>
        </button>
        <span className="vo-nav-line">{sim.nav.phase} · day {sim.day} · {sim.velocity} km/s · hull {sim.systems[0].value}%</span>
      </section>
      <Signature plate={plate} />
    </>
  );
}

const H_JP = {
  outer: '天変', inner: '船内', rock: '流星', prop: '推進', ai: '指揮', systems: '船体', flight: '航路', damage: '損傷',
  repairs: '修理', objects: '近傍', agents: '頭脳', log: '航海日誌', mission: '航程', selected: '選択',
};
const H = ({ title, k }) => <h2>{title} <em>{H_JP[k] ?? ''}</em></h2>;

function Console({ sim, view, setView, onResetView }) {
  return (
    <>
      <aside className="vo-side vo-left">
        <section className="vo-cart"><HazardControls sim={sim} H={H} /></section>
        <section className="vo-cart"><RockControls sim={sim} H={H} /></section>
        <section className="vo-cart"><PropulsionControls sim={sim} H={H} /></section>
        <section className="vo-cart"><AiControls sim={sim} H={H} /></section>
      </aside>
      <aside className="vo-side vo-right">
        <section className="vo-cart"><Telemetry sim={sim} H={H} /></section>
        <section className="vo-cart vo-logcart"><EventLog sim={sim} H={H} limit={20} /></section>
      </aside>
      <div className="vo-cart vo-transport">
        <Transport sim={sim} view={view} setView={setView} onResetView={onResetView} names={['Print', 'Physics']} />
      </div>
      <ArmedHint sim={sim} className="vo-armed" />
    </>
  );
}

function Pages({ tab, sim, onTab }) {
  const traj = tab === 'Planetary Trajectories';
  return (
    <div className={`vo-page ${traj ? 'vo-page-traj' : ''}`}>
      <div className={`vo-plate mno-embed ${tab === 'Spacecraft' || traj ? 'vo-plate-dark' : ''}`}>
        <div className="vo-plate-in">
          {traj && <TrajectoriesView sim={sim} />}
          {tab === 'AI Logs' && <AiLogsView sim={sim} onShowLiveShip={() => onTab('Spacecraft')} />}
          {tab === 'AI API' && <AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} />}
          {tab === 'Spacecraft' && <SpacecraftView sim={sim} />}
        </div>
        <span className="vo-plate-title">{tab}</span>
      </div>
      {traj && <aside className="vo-side vo-trajinfo"><section className="vo-cart"><MissionInfo sim={sim} H={H} /></section></aside>}
    </div>
  );
}

export default function VariantO({ tab, onTab, sim }) {
  const tex = useMemo(makeTextures, []);
  const page = tab === 'Home' ? 'home' : 'console';
  const gen = tab === 'Generator';
  const [view, setView] = useState('scene');
  const [resetCount, resetView] = useViewReset();
  const [failed, onCreated] = useShaderGuard('Woodblock');
  const [noGL, setNoGL] = useState(false);
  const [hit, setHit] = useState(0);

  // Real state the print reads every frame.
  const R = useRef({}).current;
  const p = sim.demo.physics;
  const name = sim.event?.name;
  Object.assign(R, {
    storm: sim.demo.solarStorm || name === 'Solar Storm',
    stormHit: name === 'Solar Storm',
    bh: sim.demo.blackHole,
    meteor: p.objects.some((o) => o.closingM_s > 0.05) || sim.demo.hazards.length > 0,
    inner: sim.demo.activeFaults.length > 0,
    burn: p.mode === 'burn',
    correcting: p.mode === 'course correction',
    impact: impactKey(sim),
  });
  const [D, plate] = useDirector(page, sim.event, R);
  useArmedSwitch(sim, setView);
  useOnImpact(sim, () => {
    D.hit = performance.now() / 1000;
    setHit((n) => n + 1);
  });
  useEffect(() => {
    if (sim.demo.stormFlash) setHit((n) => n + 1);
  }, [sim.demo.stormFlash]);

  const physics = gen && view === 'physics';
  const scene = tab !== 'Spacecraft';
  return (
    <div className={`vo mk-root vo-${page} vo-tab-${tab.replace(/\s+/g, '-').toLowerCase()} ${plate && (gen || page === 'home') ? 'vo-danger' : ''} ${physics ? 'vo-physics' : ''}`}>
      {physics ? (
        <PhysicsPlate sim={sim} tex={tex} resetCount={resetCount} />
      ) : scene ? (
        <Stage D={D} sim={sim} page={page} tex={tex} onCreated={onCreated} onError={() => setNoGL(true)} failed={failed || noGL} />
      ) : (
        <div className="vo-stage vo-blank" style={{ backgroundImage: `url(${tex.washi})` }} />
      )}
      {hit > 0 && <div key={hit} className="vo-hit" aria-hidden="true" />}
      <Nav tab={tab} onTab={onTab} sim={sim} />
      {(page === 'home' || gen) && <PlateBanner plate={plate} sim={sim} page={page} />}
      {page === 'home' ? <Home onTab={onTab} plate={plate} sim={sim} /> : gen ? (
        <>
          <TitleCartouche compact />
          <Console sim={sim} view={view} setView={setView} onResetView={resetView} />
        </>
      ) : <Pages tab={tab} sim={sim} onTab={onTab} />}
    </div>
  );
}
