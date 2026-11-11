// PROTOTYPE — Variant H: Blueprint · 工程蓝图. The whole app is an engineering drawing sheet:
// Prussian-blue paper, white hidden-line ship drawing (EdgesGeometry + back-face outline),
// projected balloon callouts and dimension lines, a title block, and red pencil only for hazards.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import StationShip from '../components/station/StationShip.jsx';
import { materials } from '../components/station/materials.js';
import { FEATURES, INNER, LEAD, OUTER, TABS, TAGLINE, logo } from './mock.jsx';
import './variantH.css';

const PAPER = '#123a6b';
const LINE = '#e8f4ff';
const RED = '#ff6b5a';

/* ───────────────────────── ship geometry knowledge ───────────────────────── */

// Anchor points in StationShip coordinates (nose +Z). Balloons go to the top or bottom row.
const PARTS = [
  { n: 1, id: 'command', label: 'Command module', p: [0, 1.7, 14], side: 'top', dx: 0 },
  { n: 2, id: 'hab', label: 'Habitation module', p: [0, 1.7, 7.4], side: 'bot', dx: 10 },
  { n: 3, id: 'node', label: 'Junction node + arm', p: [0, 1.3, 3.6], side: 'top', dx: -6 },
  { n: 4, id: 'cargo', label: 'Cargo pod', p: [0, -5.2, 3.6], side: 'bot', dx: -14 },
  { n: 5, id: 'ring', label: 'Rotating habitat ring', p: [0, 10.5, -2], side: 'top', dx: 0 },
  { n: 6, id: 'solar', label: 'Solar arrays & radiators', p: [9, 0, -6], side: 'bot', dx: 0 },
  { n: 7, id: 'tanks', label: 'Propellant tanks', p: [0, 1.85, -14], side: 'top', dx: 0 },
  { n: 8, id: 'engine', label: 'Engine section / bell', p: [0, 0, -19.8], side: 'bot', dx: 0 },
];
const ANCHOR = Object.fromEntries(PARTS.map((p) => [p.id, p.p]));
ANCHOR.whole = [0, 0, -2];
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

/** Re-skins every mesh below it as white line art on blue paper; re-checks so swaps/new meshes are caught. */
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
      o.userData.vhKids[0].material = orig === dead ? mats.red : mats.line;
    }
  });

  return <group ref={ref}>{children}</group>;
}

/* ───────────────────────── projection of callouts / dims / cloud ───────────────────────── */

const v3 = new THREE.Vector3();

function Projector({ shipRef, viewName, svg, hazard }) {
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
    // Revision cloud
    if (s.cloud && hazard) {
      const [cx, cy] = P(ANCHOR[hazard[0]]);
      s.cloud.setAttribute('transform', `translate(${cx} ${cy})`);
    }
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

/* ───────────────────────── the drawing ───────────────────────── */

function Drawing({ event, initialView = 'ELEVATION', legend = true, revLetter = 'A' }) {
  const [view, setView] = useState(initialView);
  const shipRef = useRef();
  const svg = useRef({});
  const hazard = event ? HAZ[event.name] ?? ['whole', 120] : null;
  const ball = (n, key) => (el) => {
    svg.current[`b${n}`] = svg.current[`b${n}`] || {};
    svg.current[`b${n}`][key] = el;
  };
  const dim = (key) => (el) => {
    if (!svg.current.dims) svg.current.dims = {};
    svg.current.dims[key] = el;
  };
  const showDims = view !== 'ISO';

  return (
    <div className={`vh-drawing${event ? ' alert' : ''}`}>
      <div className="vh-canvas">
        <Canvas orthographic camera={{ position: [0, 0, 100], zoom: 14, near: 0.1, far: 1000 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
          <Rig viewName={view}>
            <Linework>
              <group ref={shipRef} position={[0, 0, 2.5]}>
                <StationShip event={event} />
              </group>
            </Linework>
          </Rig>
          <Projector shipRef={shipRef} viewName={view} svg={svg} hazard={hazard} />
        </Canvas>
      </div>
      <svg className="vh-overlay" width="100%" height="100%">
        <defs>
          <marker id="vh-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M0 2 L10 5 L0 8 Z" fill={LINE} />
          </marker>
        </defs>
        {PARTS.map((p) => (
          <g key={p.n} className="vh-balloon">
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
        {hazard && (
          <g ref={(el) => (svg.current.cloud = el)} className="vh-cloud">
            <path d={cloudPath(hazard[1])} />
            <g transform={`translate(${hazard[1] * 0.78} ${-hazard[1] * 0.78})`}>
              <path d="M0 -15 L14 10 L-14 10 Z" />
              <text dy="7">{revLetter}</text>
            </g>
          </g>
        )}
      </svg>
      <div className="vh-views">
        <span>VIEW</span>
        {Object.keys(VIEWS).map((k) => (
          <button key={k} className={k === view ? 'on' : ''} onClick={() => setView(k)}>{k}</button>
        ))}
      </div>
      <div className="vh-caption">
        <b>{VIEWS[view].caption}</b>
        <span>{view === 'ISO' ? 'SCALE — NTS' : 'SCALE 1 : 200'}</span>
      </div>
      {legend && (
        <ol className="vh-parts">
          <li className="hd">PARTS LIST</li>
          {PARTS.map((p) => (
            <li key={p.n} className={hazard && (hazard[0] === p.id || hazard[0] === 'whole') ? 'hit' : ''}>
              <i>{p.n}</i>
              {p.label}
            </li>
          ))}
        </ol>
      )}
      {event && (
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
        <span>{sim.nav.origin} → {sim.nav.destination}</span>
        <span className={sim.event ? 'red' : ''}>{sim.event ? '● HAZARD ACTIVE' : '○ NOMINAL · DEMO'}</span>
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
      <div className="vh-tb-cell"><small>DATE</small>2026-11-10</div>
      <div className="vh-tb-cell"><small>DRN BY</small>AI</div>
      <div className="vh-tb-cell"><small>CHK BY</small>MAIN JUDGING</div>
      <div className="vh-tb-cell"><small>MET</small>{sim.met}</div>
      <div className="vh-tb-cell"><small>UNITS</small>m · kg · s</div>
    </div>
  );
}

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
        <Drawing event={sim.event} initialView="ELEVATION" />
        <p className="vh-hand">ring spins for artificial gravity — failure modes on SHT 03 ↘</p>
      </section>
      <TitleBlock title="GENERAL ARRANGEMENT" dwg="IX4-GA-001" sheet="01 OF 06" rev="A" sim={sim} />
    </div>
  );
}

function Gauge({ value, warn }) {
  return (
    <svg className={`vh-gauge${warn ? ' red' : ''}`} viewBox="0 0 120 14" preserveAspectRatio="none">
      {[0, 25, 50, 75, 100].map((t) => (
        <line key={t} x1={t * 1.18 + 1} x2={t * 1.18 + 1} y1={t % 50 ? 9 : 6} y2="14" className="tick" />
      ))}
      <line x1="1" x2="119" y1="12" y2="12" className="base" />
      <line x1="1" x2={1 + value * 1.18} y1="4" y2="4" className="bar" />
      <path d={`M${1 + value * 1.18} 0 l-3 -0 l3 6 l3 -6 Z`} className="ptr" />
    </svg>
  );
}

function fmtTime(t) {
  if (!t) return 'T+0';
  return new Date(t).toLocaleTimeString('en-GB');
}

function Console({ sim, onTab, tab }) {
  const all = [...OUTER.map((n) => [n, 'EXT']), ...INNER.map((n) => [n, 'INT'])];
  const rev = String.fromCharCode(65 + (sim.logs.length % 26));
  return (
    <div className="vh-console">
      <section className="vh-box vh-fmea">
        <h4>FAILURE-MODE TABLE <small>CLICK ROW TO INJECT</small></h4>
        <table>
          <thead>
            <tr><th>ITEM</th><th>FAILURE MODE</th><th>CL</th><th>ZONE</th><th /></tr>
          </thead>
          <tbody>
            {all.map(([name, cl], i) => {
              const on = sim.event?.name === name;
              return (
                <tr key={name} className={on ? 'on' : ''} onClick={() => sim.trigger(name)} tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && sim.trigger(name)}>
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
        <button className="vh-btn reset" onClick={sim.clear} disabled={!sim.event}>↺ RESET · CLEAR REVISION</button>
      </section>

      <section className="vh-console-draw">
        <Drawing event={sim.event} initialView="ISO" revLetter={rev} />
      </section>

      <section className="vh-side">
        <div className="vh-box">
          <h4>SYSTEMS SCHEDULE</h4>
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
        </div>
        <div className="vh-box">
          <h4>AI AGENTS · APPROVALS</h4>
          <ul className="vh-agents">
            {sim.agents.map((a) => (
              <li key={a.name} className={a.ok ? '' : 'red'}>
                <i>{a.ok ? '○' : '●'}</i>
                <b>{a.name}</b>
                <span>{a.state}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="vh-box vh-log">
        <h4>REVISION HISTORY <small>AI EVENT LOG · ×{sim.timeScale}</small></h4>
        <table>
          <thead>
            <tr><th>REV</th><th>TIME</th><th>DESCRIPTION</th><th>BY</th></tr>
          </thead>
          <tbody>
            {sim.logs.map((l, i) => (
              <tr key={`${l.t}-${i}`} className={l.alert ? 'red' : ''}>
                <td>{String.fromCharCode(65 + ((sim.logs.length - 1 - i) % 26))}</td>
                <td>{fmtTime(l.t)}</td>
                <td>{l.text}</td>
                <td>AI</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <TitleBlock title={tab === 'Generator' ? 'FAILURE-MODE ANALYSIS' : `${tab.toUpperCase()} · FMA`} dwg="IX4-FMA-003"
        sheet={`${String(TABS.indexOf(tab) + 1).padStart(2, '0')} OF 06`} rev={rev} sim={sim} />    </div>
  );
}

export default function VariantH({ page, tab, onTab, sim }) {
  return (
    <div className={`vh${sim.event ? ' vh-alert' : ''}`}>
      <Frame alert={!!sim.event} />
      <main className="vh-sheet">
        <SheetTabs tab={tab} onTab={onTab} sim={sim} />
        {page === 'home' ? <Home sim={sim} onTab={onTab} /> : <Console sim={sim} onTab={onTab} tab={tab} />}
      </main>
    </div>
  );
}
