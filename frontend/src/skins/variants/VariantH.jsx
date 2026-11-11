// Variant H: Blueprint · 工程蓝图. The whole app is an engineering drawing sheet: Prussian-blue paper,
// white hidden-line ship drawing (EdgesGeometry + back-face outline) built from the real DEMO parts,
// projected balloon callouts and dimension lines, revision clouds on real damage, a title block, and
// red pencil only for hazards. A PHYSICS view swaps in the real DEMO flight scene, blueprint-tinted.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { materials } from '../../components/station/materials.js';
import { AiApiView, AiLogsView, DemoViewport, FEATURES, INNER, LEAD, OUTER, SpacecraftView, TABS, TAGLINE, TrajectoriesView, logo, useViewReset } from '../demoSkin.jsx';
import { LiveShip, PART_LABEL, TimeScale, partHealth, partOf, useConsole } from './variantFGH.jsx';
import './variantH.css';

const PAPER = '#123a6b';
const LINE = '#e8f4ff';
const RED = '#ff6b5a';

/* ───────────────────────── ship geometry knowledge ───────────────────────── */

// Anchor points in StationShip coordinates (nose +Z). Balloons go to the top or bottom row.
// `bonds` = the DEMO physics parts each balloon covers.
const PARTS = [
  { n: 1, id: 'command', label: 'Command module', p: [0, 1.7, 14], side: 'top', dx: 0, bonds: ['command'] },
  { n: 2, id: 'hab', label: 'Habitation module', p: [0, 1.7, 7.4], side: 'bot', dx: 10, bonds: ['hab'] },
  { n: 3, id: 'node', label: 'Junction node + arm', p: [0, 1.3, 3.6], side: 'top', dx: -6, bonds: ['node', 'spine'] },
  { n: 4, id: 'cargo', label: 'Cargo pod', p: [0, -5.2, 3.6], side: 'bot', dx: -14, bonds: ['cargo'] },
  { n: 5, id: 'ring', label: 'Rotating habitat ring', p: [0, 10.5, -2], side: 'top', dx: 0, bonds: ['ring'] },
  { n: 6, id: 'solar', label: 'Solar arrays & radiators', p: [9, 0, -6], side: 'bot', dx: 0, bonds: ['solar', 'solarLeft', 'solarRight'] },
  { n: 7, id: 'tanks', label: 'Propellant tanks', p: [0, 1.85, -14], side: 'top', dx: 0, bonds: ['engine'] },
  { n: 8, id: 'engine', label: 'Engine section / bell', p: [0, 0, -19.8], side: 'bot', dx: 0, bonds: ['engine'] },
];
const ANCHOR = Object.fromEntries(PARTS.map((p) => [p.id, p.p]));
ANCHOR.whole = [0, 0, -2];
// Real physics parts → drawing anchor.
const BOND_ANCHOR = {
  command: [0, 1.7, 14], hab: [0, 1.7, 7.4], node: [0, 1.3, 3.6], cargo: [0, -5.2, 3.6], spine: [0, 0, -5],
  ring: [0, 10.5, -2], solar: [0, 3, -11.6], solarRight: [9, 0, -6], solarLeft: [-9, 0, -6], engine: [0, 0, -17],
};
const ZONE = { command: 'C7', hab: 'C6', node: 'B5', cargo: 'D5', ring: 'B4', solar: 'C4', tanks: 'C3', engine: 'C2', whole: 'A1–D8' };

// Which part of the ship each hazard affects (anchor id, cloud radius in px).
const HAZ = {
  'Asteroid Collision': ['ring', 64],
  'Black Hole Encounter': ['whole', 150],
  'Solar Storm': ['solar', 70],
  'Alien Encounter': ['command', 56],
  'Oxygen Leak': ['hab', 52],
  'Spacecraft Fire': ['hab', 52],
  'AI System Malfunction': ['command', 52],
  'Robotic Arm Malfunction': ['cargo', 50],
  'Engine Failure': ['engine', 56],
  'Thruster Failure': ['engine', 56],
  'Solar Panel Power Crisis': ['solar', 70],
};

const VIEWS = {
  ELEVATION: { rx: 0, ry: Math.PI / 2, caption: 'SIDE ELEVATION  A–A', fit: (w, h) => Math.min((w - 70) / 41, (h - 140) / 23) },
  PLAN: { rx: Math.PI / 2, ry: Math.PI / 2, caption: 'PLAN VIEW  B–B', fit: (w, h) => Math.min((w - 70) / 41, (h - 140) / 25) },
  ISO: { rx: 0.5, ry: Math.PI / 2 - 0.62, caption: 'ISOMETRIC  — NOT TO SCALE', fit: (w, h) => Math.min((w - 60) / 37, (h - 100) / 31) },
};

/* ───────────────────────── hidden-line linework ───────────────────────── */

function useLineMaterials() {
  return useMemo(() => {
    const uW = { value: 0.05 };
    const outline = new THREE.MeshBasicMaterial({ color: LINE, side: THREE.BackSide });
    outline.onBeforeCompile = (s) => {
      s.uniforms.uW = uW;
      s.vertexShader = 'uniform float uW;\n' + s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += normalize(normal) * uW;',
      );
    };
    return {
      uW,
      outline,
      fill: new THREE.MeshBasicMaterial({ color: PAPER, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
      hidden: new THREE.MeshBasicMaterial({ visible: false }),
      solid: new THREE.MeshBasicMaterial({ color: LINE }),
      line: new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: 0.9 }),
      red: new THREE.LineBasicMaterial({ color: RED }),
    };
  }, []);
}

/** Re-skins every mesh below it as white line art on blue paper; damaged parts are drawn in red pencil. */
function Linework({ children }) {
  const ref = useRef();
  const mats = useLineMaterials();
  const edgeCache = useMemo(() => new Map(), []);
  const frame = useRef(0);
  const mine = useMemo(() => new Set([mats.fill, mats.hidden, mats.solid]), [mats]);

  useEffect(() => () => edgeCache.forEach((g) => g.dispose()), [edgeCache]);

  useFrame(({ camera }) => {
    mats.uW.value = 1.15 / camera.zoom;
    if (frame.current++ % 8 || !ref.current) return;
    const dead = materials().solarDead;
    const meshes = [];
    ref.current.traverse((o) => {
      if (o.isMesh && !o.userData.vhAux) meshes.push(o);
    });
    for (const o of meshes) {
      if (!mine.has(o.material)) o.userData.vhOrig = o.material;
      const orig = o.userData.vhOrig;
      if (o.isInstancedMesh) {
        o.material = mats.solid;
        continue;
      }
      const skip = !orig || orig.transparent || orig.isShaderMaterial;
      o.material = skip ? mats.hidden : mats.fill;
      const aux = o.userData.vhKids;
      if (skip || (aux && o.userData.vhGeo !== o.geometry)) {
        aux?.forEach((k) => o.remove(k));
        o.userData.vhKids = null;
        o.userData.vhGeo = null;
      }
      if (skip) continue;
      if (!o.userData.vhKids) {
        let eg = edgeCache.get(o.geometry.uuid);
        if (!eg) {
          eg = new THREE.EdgesGeometry(o.geometry, 25);
          edgeCache.set(o.geometry.uuid, eg);
        }
        const edges = new THREE.LineSegments(eg, mats.line);
        const shell = new THREE.Mesh(o.geometry, mats.outline);
        edges.userData.vhAux = shell.userData.vhAux = true;
        edges.raycast = shell.raycast = () => {};
        o.add(edges, shell);
        o.userData.vhKids = [edges, shell];
        o.userData.vhGeo = o.geometry;
      }
      if (o.userData.vhPart === undefined) o.userData.vhPart = partOf(o);
      const hurt = (o.userData.vhPart?.health ?? 100) < 80;
      o.userData.vhKids[0].material = orig === dead || hurt ? mats.red : mats.line;
    }
  });

  return <group ref={ref}>{children}</group>;
}

/* ───────────────────────── projection of callouts / dims / clouds ───────────────────────── */

const v3 = new THREE.Vector3();

function Projector({ shipRef, viewName, svg, clouds }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const ship = shipRef.current;
    if (!ship) return;
    const W = size.width;
    const H = size.height;
    const P = (p) => {
      v3.set(p[0], p[1], p[2]).applyMatrix4(ship.matrixWorld).project(camera);
      return [((v3.x + 1) / 2) * W, ((1 - v3.y) / 2) * H];
    };
    const s = svg.current;
    // Balloons
    PARTS.forEach((part) => {
      const g = s[`b${part.n}`];
      if (!g?.line || !g.dot || !g.ball) return;
      const [ax, ay] = P(part.p);
      const bx = Math.max(18, Math.min(W - 18, ax + part.dx));
      const by = part.side === 'top' ? 22 : H - 22;
      g.line.setAttribute('x1', ax);
      g.line.setAttribute('y1', ay);
      g.line.setAttribute('x2', bx);
      g.line.setAttribute('y2', by + (part.side === 'top' ? 12 : -12));
      g.dot.setAttribute('cx', ax);
      g.dot.setAttribute('cy', ay);
      g.ball.setAttribute('transform', `translate(${bx} ${by})`);
    });
    // Dimensions (orthographic views only)
    const d = s.dims;
    if (d && ['len', 'lenA', 'lenB', 'lenT', 'dia', 'diaA', 'diaB', 'diaT'].every((k) => d[k])) {
      const samples = [[0, 0, -22], [0, 0, 17], [0, 10.5, -2], [0, -10.5, -2], [10.5, 0, -2], [-10.5, 0, -2], [12.6, 0, -6], [-12.6, 0, -6]].map(P);
      const maxY = Math.max(...samples.map((q) => q[1]));
      const minX = Math.min(...samples.map((q) => q[0]));
      const [x1, y1] = samples[0];
      const [x2, y2] = samples[1];
      const ly = Math.min(H - 52, maxY + 26);
      setLine(d.len, x1, ly, x2, ly);
      setLine(d.lenA, x1, y1 + 6, x1, ly + 6);
      setLine(d.lenB, x2, y2 + 6, x2, ly + 6);
      d.lenT.setAttribute('x', (x1 + x2) / 2);
      d.lenT.setAttribute('y', ly - 5);
      const ring = viewName === 'PLAN' ? [samples[4], samples[5]] : [samples[2], samples[3]];
      const top = ring[0][1] < ring[1][1] ? ring[0] : ring[1];
      const bot = ring[0][1] < ring[1][1] ? ring[1] : ring[0];
      const lx = Math.max(34, minX - 28);
      setLine(d.dia, lx, top[1], lx, bot[1]);
      setLine(d.diaA, top[0] - 8, top[1], lx - 6, top[1]);
      setLine(d.diaB, bot[0] - 8, bot[1], lx - 6, bot[1]);
      const my = (top[1] + bot[1]) / 2;
      d.diaT.setAttribute('transform', `translate(${lx - 7} ${my}) rotate(-90)`);
    }
    // Revision clouds
    clouds.forEach((c, i) => {
      const el = s.clouds?.[i];
      if (!el) return;
      const [cx, cy] = P(c.anchor);
      el.setAttribute('transform', `translate(${cx} ${cy})`);
    });
  });
  return null;
}

function setLine(el, x1, y1, x2, y2) {
  el.setAttribute('x1', x1);
  el.setAttribute('y1', y1);
  el.setAttribute('x2', x2);
  el.setAttribute('y2', y2);
}

/** Orients the ship for the chosen view (eased) and fits the orthographic zoom to the canvas. */
function Rig({ viewName, children }) {
  const outer = useRef();
  const inner = useRef();
  const { camera, size } = useThree();
  useFrame((_, dt) => {
    const v = VIEWS[viewName];
    const k = 1 - Math.exp(-dt * 5);
    outer.current.rotation.x += (v.rx - outer.current.rotation.x) * k;
    inner.current.rotation.y += (v.ry - inner.current.rotation.y) * k;
    const z = v.fit(size.width, size.height);
    camera.zoom += (z - camera.zoom) * k;
    camera.updateProjectionMatrix();
  });
  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

function cloudPath(r, n = 13) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.2;
    return [Math.cos(a) * r, Math.sin(a) * r * 0.78];
  });
  const bump = r * Math.sin(Math.PI / n) * 1.25;
  return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` +
    pts.map((_, i) => {
      const q = pts[(i + 1) % n];
      return ` A${bump.toFixed(1)} ${bump.toFixed(1)} 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    }).join('') + 'Z';
}

/** Revision clouds from real state: the active hazard, then each damaged or detached component. */
function cloudsFor(sim, revLetter) {
  const out = [];
  const ev = sim.event;
  if (sim.demo.blackHole && ev?.name !== 'Black Hole Encounter') out.push({ key: 'bh', anchor: ANCHOR.whole, r: 150, tag: 'BH' });
  if (ev) {
    const [id, r] = HAZ[ev.name] ?? ['whole', 120];
    out.push({ key: `ev-${ev.name}`, anchor: ANCHOR[id], r, tag: revLetter });
  }
  sim.demo.physics.bonds
    .filter((b) => b.broken || b.health < 99.95)
    .sort((a, b) => a.health - b.health)
    .slice(0, 4)
    .forEach((b) => out.push({ key: `b-${b.id}`, anchor: BOND_ANCHOR[b.id] ?? ANCHOR.whole, r: b.broken ? 46 : 34, tag: b.broken ? 'DET' : `${b.health.toFixed(0)}`, small: true }));
  return out;
}

/* ───────────────────────── the drawing ───────────────────────── */

function Drawing({ sim, initialView = 'ELEVATION', legend = true, revLetter = 'A', mode = 'drawing', onMode, resetCount = 0 }) {
  const [view, setView] = useState(initialView);
  const shipRef = useRef();
  const svg = useRef({});
  const event = sim.event;
  const bonds = partHealth(sim);
  const clouds = cloudsFor(sim, revLetter);
  const ball = (n, key) => (el) => {
    svg.current[`b${n}`] = svg.current[`b${n}`] || {};
    svg.current[`b${n}`][key] = el;
  };
  const dim = (key) => (el) => {
    if (!svg.current.dims) svg.current.dims = {};
    svg.current.dims[key] = el;
  };
  const cloudRef = (i) => (el) => {
    if (!svg.current.clouds) svg.current.clouds = [];
    svg.current.clouds[i] = el;
  };
  const showDims = view !== 'ISO';
  const hit = event ? HAZ[event.name] ?? ['whole'] : null;
  const partState = (p) => {
    const bs = p.bonds.map((id) => bonds[id]).filter(Boolean);
    const worst = bs.reduce((m, b) => (b.health < m.health ? b : m), { health: 100, broken: false });
    return { broken: bs.some((b) => b.broken), health: worst.health };
  };
  const drawing = mode === 'drawing';

  return (
    <div className={`vh-drawing${event ? ' alert' : ''}`}>
      {drawing ? (
        <>
          <div className="vh-canvas">
            <Canvas orthographic camera={{ position: [0, 0, 100], zoom: 14, near: 0.1, far: 1000 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
              <Rig viewName={view}>
                <Linework>
                  <group ref={shipRef} position={[0, 0, 2.5]}>
                    <LiveShip sim={sim} />
                  </group>
                </Linework>
              </Rig>
              <Projector shipRef={shipRef} viewName={view} svg={svg} clouds={clouds} />
            </Canvas>
          </div>
          <svg className="vh-overlay" width="100%" height="100%">
            <defs>
              <marker id="vh-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                <path d="M0 2 L10 5 L0 8 Z" fill={LINE} />
              </marker>
            </defs>
            {PARTS.map((p) => (
              <g key={p.n} className={`vh-balloon${partState(p).health < 99.95 ? ' red' : ''}`}>
                <line ref={ball(p.n, 'line')} />
                <circle ref={ball(p.n, 'dot')} r="2.2" className="dot" />
                <g ref={ball(p.n, 'ball')}>
                  <circle r="12" />
                  <text dy="4.5">{p.n}</text>
                </g>
              </g>
            ))}
            {showDims && (
              <g className="vh-dim" key={view}>
                <line ref={dim('lenA')} className="ext" />
                <line ref={dim('lenB')} className="ext" />
                <line ref={dim('len')} markerStart="url(#vh-arr)" markerEnd="url(#vh-arr)" />
                <text ref={dim('lenT')} textAnchor="middle">39.0 m  OVERALL</text>
                <line ref={dim('diaA')} className="ext" />
                <line ref={dim('diaB')} className="ext" />
                <line ref={dim('dia')} markerStart="url(#vh-arr)" markerEnd="url(#vh-arr)" />
                <text ref={dim('diaT')} textAnchor="middle">Ø 21.0 m RING</text>
              </g>
            )}
            {clouds.map((c, i) => (
              <g key={c.key} ref={cloudRef(i)} className={`vh-cloud${c.small ? ' small' : ''}`}>
                <path d={cloudPath(c.r)} />
                <g transform={`translate(${c.r * 0.78} ${-c.r * 0.78})`}>
                  <path d={c.tag.length > 1 ? 'M0 -15 L19 12 L-19 12 Z' : 'M0 -15 L14 10 L-14 10 Z'} />
                  <text dy="8">{c.tag}</text>
                </g>
              </g>
            ))}
          </svg>
        </>
      ) : (
        <div className="vh-phys">
          <DemoViewport sim={sim} resetCount={resetCount}>
            <div className="vh-phys-grid" />
            {sim.demo.stormFlash > 0 && <div key={sim.demo.stormFlash} className="vh-phys-flash" />}
            {sim.demo.armed && <div className="vh-phys-hint">PICK LAUNCH POINT · {sim.demo.armed.toUpperCase()} · ESC TO CANCEL</div>}
          </DemoViewport>
        </div>
      )}
      <div className="vh-views">
        {onMode && (
          <>
            <button className={drawing ? 'on' : ''} onClick={() => onMode('drawing')}>DRAWING</button>
            <button className={drawing ? '' : 'on'} onClick={() => onMode('physics')}>PHYSICS</button>
            {drawing && <span>VIEW</span>}
          </>
        )}
        {!onMode && <span>VIEW</span>}
        {drawing && Object.keys(VIEWS).map((k) => (
          <button key={k} className={k === view ? 'on' : ''} onClick={() => setView(k)}>{k}</button>
        ))}
      </div>
      <div className="vh-caption">
        <b>{drawing ? VIEWS[view].caption : 'FLIGHT SCENE  — LIVE PHYSICS'}</b>
        <span>{!drawing ? 'BROWSER RIGID-BODY · SI UNITS' : view === 'ISO' ? 'SCALE — NTS' : 'SCALE 1 : 200'}</span>
      </div>
      {legend && drawing && (
        <ol className="vh-parts">
          <li className="hd">PARTS LIST</li>
          {PARTS.map((p) => {
            const st = partState(p);
            const on = st.broken || st.health < 99.95 || (hit && (hit[0] === p.id || hit[0] === 'whole'));
            return (
              <li key={p.n} className={`${on ? 'hit' : ''}${st.broken ? ' gone' : ''}`}>
                <i>{p.n}</i>
                {p.label}
                {(st.broken || st.health < 99.95) && <em>{st.broken ? 'DET' : `${st.health.toFixed(0)}%`}</em>}
              </li>
            );
          })}
        </ol>
      )}
      {event && drawing && (
        <div className="vh-stamp" key={event.name}>
          <b>HAZARD</b>
          <span>{event.name.toUpperCase()} · SEV {event.severity}%</span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── sheet furniture ───────────────────────── */

const COLS = [1, 2, 3, 4, 5, 6, 7, 8];
const ROWS = ['A', 'B', 'C', 'D'];

function Frame({ alert }) {
  return (
    <div className={`vh-frame${alert ? ' alert' : ''}`} aria-hidden>
      <div className="vh-zones top">{COLS.map((c) => <span key={c}>{c}</span>)}</div>
      <div className="vh-zones bot">{COLS.map((c) => <span key={c}>{c}</span>)}</div>
      <div className="vh-zones left">{ROWS.map((r) => <span key={r}>{r}</span>)}</div>
      <div className="vh-zones right">{ROWS.map((r) => <span key={r}>{r}</span>)}</div>
    </div>
  );
}

function SheetTabs({ tab, onTab, sim }) {
  const hot = sim.event || sim.demo.blackHole || sim.demo.hazards.length;
  return (
    <header className="vh-head">
      <nav className="vh-tabs" aria-label="Drawing index">
        {TABS.map((t, i) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>
            <small>SHT {String(i + 1).padStart(2, '0')}</small>
            {t}
          </button>
        ))}
      </nav>
      <div className="vh-status">
        <span>MET <b>{sim.met}</b></span>
        <span>DAY <b>{sim.day}</b></span>
        <span>{sim.nav.phase}</span>
        <span className={hot ? 'red' : ''}>{hot ? '● HAZARD ACTIVE' : `○ NOMINAL · ${sim.status}`}</span>
      </div>
    </header>
  );
}

function TitleBlock({ title, dwg, sheet, rev, sim }) {
  return (
    <div className="vh-tb">
      <div className="vh-tb-logo">
        <img src={logo} alt="Interstellar X⁴" />
      </div>
      <div className="vh-tb-proj">
        <small>PROJECT</small>
        <b>INTERSTELLAR X⁴</b>
        <em>{TAGLINE}</em>
      </div>
      <div className="vh-tb-title">
        <small>DRAWING TITLE</small>
        <b>{title}</b>
      </div>
      <div className="vh-tb-cell"><small>DWG NO.</small>{dwg}</div>
      <div className="vh-tb-cell"><small>SHEET</small>{sheet}</div>
      <div className={`vh-tb-cell${sim.event ? ' red' : ''}`}><small>REV</small>{rev}</div>
      <div className="vh-tb-cell"><small>SCALE</small>1 : 200</div>
      <div className="vh-tb-cell"><small>DATE</small>{sim.demo.celestialDate.slice(0, 10)}</div>
      <div className="vh-tb-cell"><small>DRN BY</small>AI</div>
      <div className="vh-tb-cell"><small>CHK BY</small>MAIN JUDGING</div>
      <div className="vh-tb-cell"><small>MET</small>{sim.met}</div>
      <div className="vh-tb-cell"><small>UNITS</small>m · kg · s</div>
    </div>
  );
}
const sheetNo = (tab) => `${String(TABS.indexOf(tab) + 1).padStart(2, '0')} OF 06`;

/* ───────────────────────── pages ───────────────────────── */

const LEAD_NOTES = LEAD.replace(/\.$/, '').split(/, (?:and )?/).map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)));

function Home({ sim, onTab }) {
  return (
    <div className="vh-home">
      <section className="vh-home-left">
        <p className="vh-kicker">INTERSTELLAR X⁴ — GENERAL ARRANGEMENT</p>
        <h1>
          AI-POWERED<br />SPACECRAFT<br />DISASTER<br />SIMULATOR
        </h1>
        <div className="vh-notes">
          <h4>GENERAL NOTES</h4>
          <ol>
            {LEAD_NOTES.map((n) => <li key={n}>{n}.</li>)}
          </ol>
        </div>
        <div className="vh-notes">
          <h4>FEATURE NOTES</h4>
          <ul className="flags">
            {FEATURES.map((f, i) => (
              <li key={f}><i>{i + 1}</i>{f}</li>
            ))}
          </ul>
        </div>
        <div className="vh-notes loads">
          <h4>LOAD CASES · {OUTER.length + INNER.length} SCENARIOS</h4>
          <p><b>EXT</b> {OUTER.join(' · ')}</p>
          <p><b>INT</b> {INNER.join(' · ')}</p>
        </div>
        <div className="vh-ctas">
          <button className="vh-btn primary" onClick={() => onTab('Generator')}>▶ LAUNCH SIMULATOR</button>
          <button className="vh-btn" onClick={() => onTab('Spacecraft')}>◇ INSPECT SPACECRAFT</button>
        </div>
      </section>
      <section className="vh-home-draw">
        <Drawing sim={sim} initialView="ELEVATION" />
        <p className="vh-hand">integrity {sim.systems[0].value}% · {sim.velocity} km/s — failure modes on SHT 03 ↘</p>
      </section>
      <TitleBlock title="GENERAL ARRANGEMENT" dwg="IX4-GA-001" sheet="01 OF 06" rev="A" sim={sim} />
    </div>
  );
}

function Gauge({ value, warn }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg className={`vh-gauge${warn ? ' red' : ''}`} viewBox="0 0 120 14" preserveAspectRatio="none">
      {[0, 25, 50, 75, 100].map((t) => (
        <line key={t} x1={t * 1.18 + 1} x2={t * 1.18 + 1} y1={t % 50 ? 9 : 6} y2="14" className="tick" />
      ))}
      <line x1="1" x2="119" y1="12" y2="12" className="base" />
      <line x1="1" x2={1 + v * 1.18} y1="4" y2="4" className="bar" />
      <path d={`M${1 + v * 1.18} 0 l-3 -0 l3 6 l3 -6 Z`} className="ptr" />
    </svg>
  );
}

function Tabs({ items, value, onChange }) {
  return (
    <div className="vh-subtabs">
      {items.map(([k, l]) => <button key={k} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

function Generator({ sim, tab, onTab }) {
  const c = useConsole(sim);
  const d = sim.demo;
  const p = d.physics;
  const ai = c.ai;
  const [mode, setMode] = useState('drawing');
  const [spec, setSpec] = useState('rock');
  const [sched, setSched] = useState('sys');
  const [resetCount, resetView] = useViewReset();
  useEffect(() => {
    if (d.armed) setMode('physics');
  }, [d.armed]);
  const all = [...OUTER.map((n) => [n, 'EXT']), ...INNER.map((n) => [n, 'INT'])];
  const rev = String.fromCharCode(65 + (sim.logs.length % 26));
  return (
    <div className="vh-console">
      <section className="vh-left">
        <div className="vh-box vh-fmea">
          <h4>FAILURE-MODE TABLE <small>CLICK ROW TO INJECT · EXT 01/04 ARM POINTER</small></h4>
          <table>
            <thead>
              <tr><th>ITEM</th><th>FAILURE MODE</th><th>CL</th><th>ZONE</th><th /></tr>
            </thead>
            <tbody>
              {all.map(([name, cl], i) => {
                const on = c.isOn(name);
                return (
                  <tr key={name} className={on ? 'on' : ''} onClick={() => c.hazard(name)} tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && c.hazard(name)}>
                    <td>{String(i + 1).padStart(2, '0')}</td>
                    <td>{name}</td>
                    <td>{cl}</td>
                    <td>{ZONE[HAZ[name][0]]}</td>
                    <td>{on ? '◉' : '▸'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="vh-note">{c.armedHint}</p>
        </div>
        <div className="vh-box vh-spec">
          <h4>SPECIFICATIONS <small>MANUAL TEST CONTROLS</small></h4>
          <Tabs items={[['rock', 'ROCK'], ['prop', 'PROPULSION'], ['ai', 'DEMO AI']]} value={spec} onChange={setSpec} />
          <div className="vh-scroll">
            {spec === 'rock' && (
              <div className="vh-form">
                <label><span>TARGET</span>
                  <select value={d.rockSettings.target_id} onChange={(e) => c.setRock('target_id', e.target.value)}>
                    {c.targets.map((t) => <option key={t.id} value={t.id}>{t.label}{p.detached.includes(t.id) ? ' (wreckage)' : ''}</option>)}
                  </select>
                </label>
                {[['mass_kg', 'MASS', 'kg', 1, 5000, 1], ['speed_m_s', 'REL. SPEED', 'm/s', 1, 150, 1], ['radius_m', 'RADIUS', 'm', 0.15, 2, 0.05], ['warning_s', 'PRESET WARNING', 's', 2, 120, 1]].map(([k, l, u, min, max, step]) => (
                  <label key={k}><span>{l}</span>
                    <span className="vh-num"><input type="number" min={min} max={max} step={step} value={d.rockSettings[k]} onChange={(e) => c.setRock(k, e.target.value)} /><em>{u}</em></span>
                  </label>
                ))}
                <div className="vh-row">
                  <button className="vh-mini primary" onClick={c.launchRock}>LAUNCH ROCK</button>
                  <button className={`vh-mini ${d.armed === 'Asteroid Collision' ? 'on' : ''}`} onClick={() => c.hazard('Asteroid Collision')}>
                    {d.armed === 'Asteroid Collision' ? 'CANCEL AIM' : 'AIM WITH POINTER'}
                  </button>
                </div>
                <p className="vh-note">200 kg @ 40 m/s → repairable damage. 5000 kg @ 150 m/s → assemblies break.</p>
              </div>
            )}
            {spec === 'prop' && (
              <div className="vh-form">
                <label><span>BURN DURATION</span>
                  <span className="vh-num"><input type="number" min=".1" max="10" step=".1" value={c.burnSeconds} onChange={(e) => c.setBurnSeconds(Number(e.target.value))} /><em>s</em></span>
                </label>
                <div className="vh-burns">
                  {c.burns.map((b) => <button key={b.label} className="vh-mini" disabled={b.disabled} onClick={() => c.burn(b)}>{b.label}</button>)}
                </div>
                <div className="vh-row">
                  <button className="vh-mini" onClick={d.coast}>CUT THRUST · COAST</button>
                  <button className={`vh-mini ${c.courseOn ? 'on' : ''}`} onClick={c.toggleCourse}>COURSE CORR. {c.courseOn ? 'ON' : 'OFF'}</button>
                </div>
                {p.courseControl && <p className="vh-note">AUTO · {p.courseControl.mode.toUpperCase()}{p.courseControl.reason ? ` · ${p.courseControl.reason}` : ''}</p>}
              </div>
            )}
            {spec === 'ai' && (
              <div className="vh-form">
                <p className="vh-note">LINK · {c.aiConn}</p>
                <div className="vh-row">
                  <button className="vh-mini" disabled={ai.checking} onClick={ai.connect}>{ai.checking ? 'CHECKING…' : 'CHECK CONNECTION'}</button>
                  <button className="vh-mini" disabled={ai.busy || !ai.running} onClick={ai.run}>RUN ONCE</button>
                </div>
                <button className={`vh-mini ${ai.enabled ? 'on' : 'primary'}`} onClick={c.aiToggle}>{ai.enabled || ai.busy ? 'STOP DEMO AI' : 'ENABLE DEMO AUTOPILOT'}</button>
                <p className="vh-note">{c.aiState}</p>
                {ai.service && <p className="vh-note">GATEWAY · {ai.service.verified ? 'MODEL ACCESS VERIFIED' : 'NOT VERIFIED'}</p>}
                {ai.error && <p className="vh-note red">{ai.error}</p>}
                {ai.latest && <p className="vh-note">MAIN JUDGING · {ai.latest.executed} ACTIONS · {ai.latest.summary}</p>}
              </div>
            )}
            {c.error && <p className="vh-note red">{c.error}</p>}
          </div>
        </div>
      </section>

      <section className="vh-console-draw">
        <Drawing sim={sim} initialView="ISO" revLetter={rev} mode={mode} onMode={setMode} resetCount={resetCount} />
        <div className="vh-transport">
          <button onClick={d.togglePlaying}>{d.playing ? '❚❚ PAUSE' : '▶ PLAY'}</button>
          <button onClick={sim.clear}>↺ RESET · CLEAR REVISIONS</button>
          <span className="vh-tl">MAP TIME ×</span>
          <TimeScale sim={sim} className="vh-scale" />
          <button onClick={() => { resetView(); setMode('physics'); }}>⌖ RESET VIEW</button>
        </div>
      </section>

      <section className="vh-box vh-side">
        <h4>SCHEDULES</h4>
        <Tabs items={[['sys', 'SYSTEMS'], ['dmg', 'COMPONENTS'], ['flt', 'FLIGHT'], ['agt', 'AGENTS']]} value={sched} onChange={setSched} />
        <div className="vh-scroll">
          {sched === 'sys' && (
            <>
              <table className="vh-sys">
                <thead>
                  <tr><th>TAG</th><th>DESCRIPTION</th><th>%</th><th>0 · 50 · 100</th></tr>
                </thead>
                <tbody>
                  {sim.systems.map((s) => {
                    const warn = s.value < 80;
                    return (
                      <tr key={s.key} className={warn ? 'red' : ''}>
                        <td>{s.key.slice(0, 3).toUpperCase()}</td>
                        <td>{s.label}</td>
                        <td className="num">{s.value}</td>
                        <td><Gauge value={s.value} warn={warn} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <dl className="vh-nav">
                <div><dt>PHASE</dt><dd>{sim.nav.phase}</dd></div>
                <div><dt>PROGRESS</dt><dd>{(sim.nav.progress * 100).toFixed(1)}%</dd></div>
                <div><dt>VELOCITY</dt><dd>{sim.velocity} km/s</dd></div>
                <div><dt>PROPELLANT</dt><dd>{sim.propellantKg} kg</dd></div>
                <div><dt>MASS</dt><dd>{sim.massKg} kg</dd></div>
                <div><dt>ATTITUDE</dt><dd>{sim.attitude} · {sim.angular}</dd></div>
              </dl>
              <ul className="vh-agents">
                {Object.entries(p.systems).map(([id, st]) => (
                  <li key={id} className={st.mode !== 'online' ? 'red' : ''}><i>{st.mode === 'online' ? '○' : '●'}</i><b>{id.replaceAll('_', ' ').toUpperCase()}</b><span>{st.mode}</span></li>
                ))}
              </ul>
            </>
          )}
          {sched === 'dmg' && (
            <>
              <table className="vh-sys">
                <thead><tr><th>PART</th><th>STAGE</th><th>%</th><th>0 · 50 · 100</th></tr></thead>
                <tbody>
                  {[...p.bonds].sort((a, b) => a.health - b.health).map((b) => (
                    <tr key={b.id} className={b.health < 99.95 ? 'red' : ''}>
                      <td>{PART_LABEL[b.id] ?? b.id}</td>
                      <td>{b.stage.toUpperCase()}</td>
                      <td className="num">{b.broken ? '—' : b.health.toFixed(0)}</td>
                      <td><Gauge value={b.health} warn={b.health < 99.95} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.lastImpact && <p className="vh-note red">LAST CONTACT · {PART_LABEL[p.lastImpact.part] ?? p.lastImpact.part} · {p.lastImpact.impulseNs.toFixed(0)} N·s · {(p.lastImpact.utilization * 100).toFixed(0)}% CAPACITY</p>}
              <p className="vh-note">REPAIRS {p.repairs.length ? '' : '· NONE ACTIVE'}</p>
              {p.repairs.map((j) => <p key={j.arm_id} className="vh-note">{j.rebuild ? 'REBUILD' : 'REPAIR'} · {j.arm_id} → {PART_LABEL[j.part_id] ?? j.part_id} · {j.contactSeconds.toFixed(1)}/10 s</p>)}
              <p className="vh-note">SOLAR GENERATION · {p.solarProtection ? 'ISOLATED' : 'ACTIVE'}</p>
            </>
          )}
          {sched === 'flt' && (
            <>
              <dl className="vh-nav">
                <div><dt>THRUST</dt><dd>{p.forceN.toFixed(0)} N</dd></div>
                <div><dt>MODE</dt><dd>{p.mode.toUpperCase()}</dd></div>
                <div><dt>COURSE DEV.</dt><dd>{p.deviationM.toFixed(2)} m</dd></div>
                <div><dt>LOCAL Δv</dt><dd>{p.deltaV.toFixed(3)} m/s</dd></div>
                <div><dt>DATE (UTC)</dt><dd>{d.celestialDate.slice(0, 10)}</dd></div>
                <div><dt>ETA</dt><dd>{sim.nav.etaDays == null ? 'REPAIR REQ.' : `${sim.nav.etaDays.toFixed(1)} d`}</dd></div>
                <div><dt>ROUTE ERROR</dt><dd>{d.navigation.route_error_map_units.toFixed(3)}</dd></div>
                <div><dt>CRUISE</dt><dd>{(p.cruiseSpeedM_s / 1000).toFixed(3)} km/s</dd></div>
              </dl>
              <table className="vh-sys">
                <thead><tr><th>NEARBY OBJECT</th><th>DIST m</th><th>CLOSING m/s</th></tr></thead>
                <tbody>
                  {!p.objects.length && <tr><td colSpan={3}>NO LOCAL OBJECTS DETECTED</td></tr>}
                  {p.objects.map((o) => <tr key={o.id} className={o.closingM_s > 0 ? 'red' : ''}><td>{o.id}</td><td className="num">{o.distanceM.toFixed(1)}</td><td className="num">{o.closingM_s.toFixed(1)}</td></tr>)}
                </tbody>
              </table>
            </>
          )}
          {sched === 'agt' && (
            <>
              <ul className="vh-agents">
                {sim.agents.map((a) => (
                  <li key={a.id} className={a.ok ? '' : 'red'}>
                    <i>{a.ok ? '○' : '●'}</i>
                    <b>{a.name}</b>
                    <span>{a.state}</span>
                  </li>
                ))}
              </ul>
              {ai.latest && <p className="vh-note">LATEST CYCLE · {ai.latest.summary}</p>}
            </>
          )}
        </div>
      </section>

      <section className="vh-box vh-log">
        <h4>REVISION HISTORY <small>AI EVENT LOG · ×{sim.timeScale}</small></h4>
        <div className="vh-scroll">
          <table>
            <thead>
              <tr><th>REV</th><th>MET</th><th>DESCRIPTION</th><th>BY</th></tr>
            </thead>
            <tbody>
              {sim.logs.map((l, i) => (
                <tr key={l.id} className={l.alert ? 'red' : ''}>
                  <td>{String.fromCharCode(65 + ((sim.logs.length - 1 - i) % 26))}</td>
                  <td>{l.time}</td>
                  <td>{l.text}</td>
                  <td>{/^(PROPELLING|AI|MAIN|ENERGY|ROBOT)/.test(l.text) ? 'AI' : 'SIM'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TitleBlock title="FAILURE-MODE ANALYSIS" dwg="IX4-FMA-003" sheet={sheetNo(tab)} rev={rev} sim={sim} />
    </div>
  );
}

/** Other sheets: the real page drawn inside a sheet frame, with notes and a title block. */
function Sheet({ sim, tab, title, dwg, children, notes, className = '' }) {
  return (
    <div className={`vh-page${notes ? ' with-notes' : ''}`}>
      <section className={`vh-box vh-page-body ${className}`}>
        <h4>{title} <small>SHT {sheetNo(tab).slice(0, 2)} · {dwg}</small></h4>
        <div className="vh-embed">{children}</div>
      </section>
      {notes && <section className="vh-box vh-page-notes">{notes}</section>}
      {!notes && (
        <section className="vh-box vh-page-foot">
          <h4>SHEET NOTES</h4>
          <ol>
            <li>Same DEMO session as SHT 03 · MET {sim.met} · day {sim.day} · {sim.nav.phase}.</li>
            <li>Structural integrity {sim.systems[0].value}% · {sim.demo.physics.detached.length} detached component(s) · {sim.demo.physics.repairs.length} repair(s) in progress.</li>
            <li>AI autopilot {sim.demo.ai.enabled ? 'ENABLED' : 'not enabled'} · {sim.agents.filter((a) => !a.ok).length} subsystem(s) degraded.</li>
          </ol>
        </section>
      )}
      <TitleBlock title={title} dwg={dwg} sheet={sheetNo(tab)} rev="A" sim={sim} />
    </div>
  );
}

function MissionNotes({ sim }) {
  const d = sim.demo;
  return (
    <>
      <h4>MISSION DATA</h4>
      <div className="vh-scroll">
        <dl className="vh-nav">
          <div><dt>ORIGIN</dt><dd>{sim.nav.origin}</dd></div>
          <div><dt>DESTINATION</dt><dd>{sim.nav.destination}</dd></div>
          <div><dt>PHASE</dt><dd>{sim.nav.phase}</dd></div>
          <div><dt>PROGRESS</dt><dd>{(sim.nav.progress * 100).toFixed(1)}%</dd></div>
          <div><dt>ETA</dt><dd>{sim.nav.etaDays == null ? 'REPAIR REQ.' : `${sim.nav.etaDays.toFixed(1)} d`}</dd></div>
          <div><dt>MAP DAY</dt><dd>{sim.day}</dd></div>
          <div><dt>DATE (UTC)</dt><dd>{d.celestialDate.slice(0, 10)}</dd></div>
          <div><dt>VELOCITY</dt><dd>{sim.velocity} km/s</dd></div>
          <div><dt>ROUTE ERROR</dt><dd>{d.navigation.route_error_map_units.toFixed(3)}</dd></div>
          <div><dt>TARGET ORBIT V</dt><dd>{d.navigation.target_orbital_speed_km_s.toFixed(2)} km/s</dd></div>
        </dl>
        <div className="vh-gauge-row"><span>LEG</span><Gauge value={sim.nav.progress * 100} /></div>
        <div className="vh-transport vh-transport--notes">
          <button onClick={d.togglePlaying}>{d.playing ? '❚❚ PAUSE' : '▶ PLAY'}</button>
          <TimeScale sim={sim} className="vh-scale" />
        </div>
        <p className="vh-note vh-hand-note">{sim.session.mapInfo}</p>
      </div>
    </>
  );
}

export default function VariantH({ page, tab, onTab, sim }) {
  let body;
  if (page === 'home') body = <Home sim={sim} onTab={onTab} />;
  else if (tab === 'Generator') body = <Generator sim={sim} onTab={onTab} tab={tab} />;
  else if (tab === 'Planetary Trajectories')
    body = <Sheet sim={sim} tab={tab} title="PLANETARY TRAJECTORIES" dwg="IX4-TRJ-004" className="vh-dark" notes={<MissionNotes sim={sim} />}><TrajectoriesView sim={sim} /></Sheet>;
  else if (tab === 'AI Logs') body = <Sheet sim={sim} tab={tab} title="AI MANAGEMENT & EVENT LOG" dwg="IX4-AIL-005"><AiLogsView sim={sim} onShowLiveShip={() => onTab('Generator')} /></Sheet>;
  else if (tab === 'AI API') body = <Sheet sim={sim} tab={tab} title="AI API CONNECTION" dwg="IX4-API-006"><AiApiView sim={sim} onOpenControls={() => onTab('AI Logs')} /></Sheet>;
  else body = <Sheet sim={sim} tab={tab} title="SPACECRAFT · MODULE & ARM DETAIL" dwg="IX4-SC-002" className="vh-dark"><SpacecraftView sim={sim} /></Sheet>;
  const hot = Boolean(sim.event || sim.demo.blackHole || sim.demo.hazards.length);
  return (
    <div className={`vh${hot ? ' vh-alert' : ''}`}>
      <Frame alert={hot} />
      <main className="vh-sheet">
        <SheetTabs tab={tab} onTab={onTab} sim={sim} />
        {body}
      </main>
    </div>
  );
}
