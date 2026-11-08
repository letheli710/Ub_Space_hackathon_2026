import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { CELESTIAL_BODIES, MAP_UNITS_PER_AU, celestialDate, orbitalPath } from '../simulation/celestial.js';
import { missionPath } from '../simulation/missionGuidance.js';
import { shipPose, voyagePhase } from '../data/voyage.js';

// Top-down map of the in-browser DEMO voyage, shown on Planetary Trajectories when no backend
// map is available. Reads the same voyage the Generator tab flies (map units, Three.js Y-up:
// the map plane is X/Z).

const HOME = { zoom: 1, x: 0, y: 0 };
const INNER_AU = 1.9; // default view: out to just past Mars
const ORBITS = Object.fromEntries(CELESTIAL_BODIES.map(b => [b.name, orbitalPath(b.name, 180).map(p => p.toArray())]));
const shipPosition = new Vector3();

export default function DemoMap({ voyage, playing, onInspect }) {
  const canvas = useRef();
  const drag = useRef();
  const hits = useRef([]);
  const [size, setSize] = useState({ width: 300, height: 300 });
  const [view, setView] = useState(HOME);
  const [route, setRoute] = useState(true);
  const [outer, setOuter] = useState(false);
  const [selected, setSelected] = useState('');
  const [readout, setReadout] = useState('');
  const [phase, setPhase] = useState('');
  const state = useRef({});
  state.current = { size, view, route, outer, selected };

  const objects = useMemo(() => ['Spacecraft', 'Sun', ...CELESTIAL_BODIES.map(b => b.name), 'Moon'], []);

  useEffect(() => {
    const node = canvas.current;
    const resize = () => {
      const { width, height } = node.getBoundingClientRect();
      setSize({ width, height });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      node.width = Math.round(width * ratio); node.height = Math.round(height * ratio);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node); resize();
    return () => observer.disconnect();
  }, []);

  function baseScale({ width, height }, wide) {
    const reach = (wide ? 31 : INNER_AU) * MAP_UNITS_PER_AU;
    return Math.max(1e-4, (Math.min(width, height) / 2 - 30) / reach);
  }

  function zoomAt(factor, x = size.width / 2, y = size.height / 2) {
    setView(previous => {
      const zoom = Math.min(40, Math.max(.05, previous.zoom * factor)), ratio = zoom / previous.zoom;
      return { zoom, x: x - size.width / 2 - (x - size.width / 2 - previous.x) * ratio,
        y: y - size.height / 2 - (y - size.height / 2 - previous.y) * ratio };
    });
  }

  useEffect(() => {
    const node = canvas.current;
    const wheel = event => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0015)), event.clientX - rect.left, event.clientY - rect.top);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [size.width, size.height]);

  // Redraw every animation frame so planets and the ship move with the demo clock.
  useEffect(() => {
    let frame, lastReadout = 0;
    const draw = now => {
      frame = requestAnimationFrame(draw);
      const node = canvas.current, ctx = node?.getContext('2d');
      const { size: { width, height }, view: v, route: showRoute, outer: wide, selected: pick } = state.current;
      if (!ctx || !width || !height) return;
      const voyageState = voyage.current, system = voyageState.solarSystem;
      const scale = baseScale({ width, height }, wide) * v.zoom;
      const project = p => ({ x: width / 2 + v.x + p[0] * scale, y: height / 2 + v.y + p[2] * scale });

      ctx.setTransform(node.width / width, 0, 0, node.height / height, 0, 0);
      ctx.fillStyle = '#020713'; ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = `rgba(170,210,255,${.2 + (i % 5) * .1})`;
        ctx.fillRect(((i * 127.7) % 997) / 997 * width, ((i * 317.3) % 991) / 991 * height, 1.2, 1.2);
      }

      const polyline = (points, color, lineWidth, dash = []) => {
        if (points.length < 2) return;
        ctx.beginPath();
        points.forEach((p, i) => { const q = project(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
        ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke(); ctx.setLineDash([]);
      };
      for (const body of CELESTIAL_BODIES) polyline(ORBITS[body.name], '#2f6f9acc', 1);

      if (showRoute && voyageState.mission) {
        const path = missionPath(voyageState.mission, voyageState.mapElapsed, voyageState.travelElapsed);
        polyline(path.planned, '#29eaffaa', 1.5, [8, 6]);
        polyline(path.flown, '#29eaff', 2.4);
      }

      hits.current = [];
      const dot = (id, label, p, radius, color, glow = false) => {
        const q = project(p);
        if (q.x < -50 || q.x > width + 50 || q.y < -50 || q.y > height + 50) return;
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 25; }
        ctx.beginPath(); ctx.arc(q.x, q.y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0;
        if (id === pick) {
          ctx.beginPath(); ctx.arc(q.x, q.y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#86fff0'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        if (label) {
          ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#d1eefa';
          ctx.fillText(label, q.x, q.y - radius - 8);
        }
        hits.current.push({ ...q, radius: Math.max(radius + 6, 16), id });
      };

      dot('Sun', 'Sun', [0, 0, 0], Math.max(6, Math.min(30, 70 * scale)), '#ffd36b', true);
      for (const body of CELESTIAL_BODIES) {
        const p = system?.planets[body.name]?.mapPosition.toArray() ?? [0, 0, 0];
        dot(body.name, body.name, p, Math.max(3.5, Math.min(24, body.radius * scale)), body.color);
      }
      if (system?.moon && scale > .4) dot('Moon', 'Moon', system.moon.mapPosition.toArray(), 3, '#c8c8c8');
      shipPose(voyageState, shipPosition);
      dot('Spacecraft', 'Spacecraft', shipPosition.toArray(), 6, '#5ffff0');

      // The text readout updates a few times a second, not every frame.
      if (now - lastReadout > 250) {
        lastReadout = now;
        setPhase(`${voyagePhase(voyageState)} · ${celestialDate(voyageState.mapElapsed).slice(0, 10)}`);
        const position = pick === 'Spacecraft' ? shipPosition
          : pick === 'Moon' ? system?.moon.mapPosition
            : pick === 'Sun' ? new Vector3() : system?.planets[pick]?.mapPosition;
        const au = position ? position.clone().divideScalar(MAP_UNITS_PER_AU) : null;
        const sunDistance = au ? Math.hypot(au.x, au.y, au.z) : null;
        setReadout(au ? `${pick}: X ${au.x.toFixed(3)}, Z ${au.z.toFixed(3)} AU · ${sunDistance.toFixed(3)} AU from the Sun` : '');
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [voyage]);

  function inspect(id) {
    setSelected(id);
    onInspect?.(id === 'Spacecraft'
      ? 'Spacecraft · DEMO browser physics. Flies the Earth → Mars → Earth loop shown in cyan.'
      : id === 'Sun' ? 'Sun · star. Planet positions use JPL orbital elements.'
        : `${id} · ${id === 'Moon' ? 'moon' : 'planet'}. Position from JPL orbital elements on the DEMO clock.`);
  }

  function center(id) {
    const v = voyage.current, system = v.solarSystem;
    const p = id === 'Spacecraft' ? shipPose(v, new Vector3()) : id === 'Moon' ? system.moon.mapPosition
      : id === 'Sun' ? new Vector3() : system.planets[id].mapPosition;
    const scale = baseScale(size, outer) * view.zoom;
    setView({ ...view, x: -p.x * scale, y: -p.z * scale });
  }

  function finishPointer(event) {
    const start = drag.current; drag.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const rect = canvas.current.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const nearest = [...hits.current].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (nearest && Math.hypot(nearest.x - x, nearest.y - y) <= nearest.radius) inspect(nearest.id);
  }

  return <div className="backend-map">
    <div className="map-toolbar">
      <button aria-label="Zoom in on map" onClick={() => zoomAt(1.4)}>＋</button>
      <button aria-label="Zoom out on map" onClick={() => zoomAt(1 / 1.4)}>−</button>
      <button onClick={() => setView(HOME)}>Fit map</button>
      <button aria-pressed={route} onClick={() => setRoute(!route)}>Mission route</button>
      <button aria-pressed={outer} onClick={() => { setOuter(!outer); setView(HOME); }}>Outer planets</button>
      <label>Inspect <select aria-label="Map object" value={selected} onChange={event => { inspect(event.target.value); center(event.target.value); }}>
        <option value="" disabled>Select object</option>
        {objects.map(id => <option key={id} value={id}>{id}</option>)}
      </select></label>
    </div>
    <canvas ref={canvas} tabIndex={0} role="img" aria-label="DEMO planetary map. Scroll to zoom, drag to pan, and select an object to inspect."
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, view }; }}
      onPointerMove={event => { const start = drag.current; if (start) setView({ ...start.view, x: start.view.x + event.clientX - start.x, y: start.view.y + event.clientY - start.y }); }}
      onPointerUp={finishPointer} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const action = { w: 'in', ArrowUp: 'in', s: 'out', ArrowDown: 'out', a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right' }[event.key];
        if (!action) return; event.preventDefault();
        if (action === 'in' || action === 'out') zoomAt(action === 'in' ? 1.12 : 1 / 1.12);
        else setView(previous => ({ ...previous, x: previous.x + (action === 'left' ? 18 : -18) }));
      }} />
    <div className="map-readout" role="status">
      <strong>SOLAR SYSTEM · DEMO (NO BACKEND) · {playing ? phase : `PAUSED · ${phase}`}</strong>
      {readout && <span>{readout}</span>}
      <small>Scroll / W/S: zoom · Drag / A/D: pan · Same voyage as the Generator DEMO</small>
    </div>
  </div>;
}
