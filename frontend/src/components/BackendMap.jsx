import { useEffect, useMemo, useRef, useState } from 'react';
import { mapBounds, mapObjects, mapScale, mapSelectionText, projectMap } from '../simulation/map.js';

const HOME = { zoom: 1, x: 0, y: 0 };
const cssColor = color => `rgb(${color.slice(0, 3).map(channel => Math.round(channel * 255)).join(' ')})`;

export default function BackendMap({ simulation, onInspect }) {
  const { scene, state, ready, pending } = simulation;
  const canvas = useRef();
  const hits = useRef([]);
  const drag = useRef();
  const [size, setSize] = useState({ width: 300, height: 300 });
  const [view, setView] = useState(HOME);
  const [route, setRoute] = useState(true);
  const [hazards, setHazards] = useState(true);
  const [selected, setSelected] = useState('');
  const [speed, setSpeed] = useState(1);
  const objects = useMemo(() => mapObjects(scene, state), [scene, state]);
  const bounds = useMemo(() => mapBounds(mapObjects(scene, null)), [scene]);
  const selectedObject = objects.find(item => item.entity_id === selected);
  const hasOrbits = objects.some(item => item.orbit);

  useEffect(() => { setView(HOME); setSelected(''); }, [scene.revision]);
  useEffect(() => { setSpeed(state?.map?.orbit_speed ?? 1); }, [state?.map?.orbit_speed]);
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

  function zoomAt(factor, x = size.width / 2, y = size.height / 2) {
    setView(previous => {
      const zoom = Math.min(12, Math.max(.15, previous.zoom * factor)), ratio = zoom / previous.zoom;
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

  useEffect(() => {
    const node = canvas.current, ctx = node.getContext('2d');
    const { width, height } = size;
    if (!width || !height) return;
    ctx.setTransform(node.width / width, 0, 0, node.height / height, 0, 0);
    ctx.fillStyle = '#020713'; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = `rgba(170,210,255,${.2 + (i % 5) * .1})`;
      ctx.fillRect(((i * 127.7) % 997) / 997 * width, ((i * 317.3) % 991) / 991 * height, 1.2, 1.2);
    }
    const scale = mapScale(bounds, width, height) * view.zoom;
    const project = position => projectMap(position, bounds, width, height, view);
    const visible = objects.filter(item => hazards || item.kind !== 'hazard');
    for (const item of objects.filter(item => item.orbit)) {
      const center = project(item.orbit.center);
      ctx.beginPath(); ctx.ellipse(center.x, center.y, item.orbit.radius_m * scale, item.orbit.radius_m * scale * .64, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#24547788'; ctx.lineWidth = 1; ctx.stroke();
    }
    const ship = objects.find(item => item.kind === 'ship');
    const destination = objects.find(item => item.entity_id === scene.destination.entity_id);
    if (route && ship && destination) {
      const start = project(ship.position), end = project(destination.position);
      ctx.beginPath(); ctx.setLineDash([8, 6]); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = '#29eaff'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    }
    hits.current = [];
    for (const item of visible) {
      const p = project(item.position);
      const radius = item.kind === 'ship' ? 6 : Math.max(4, Math.min(40, item.radius_m * scale));
      const color = cssColor(item.color);
      if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        if (item.kind !== 'hazard') continue;
        const dx = p.x - width / 2, dy = p.y - height / 2;
        const factor = Math.min((width / 2 - 28) / Math.max(1, Math.abs(dx)), (height / 2 - 30) / Math.max(1, Math.abs(dy)));
        p.x = width / 2 + dx * factor; p.y = height / 2 + dy * factor;
        ctx.fillStyle = '#bd90ff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        const arrow = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][(Math.round(Math.atan2(dy, dx) / Math.PI * 4) + 8) % 8];
        ctx.fillText(`${arrow} ${item.label}`, p.x, p.y);
      } else {
        if (item.kind === 'star') { ctx.shadowColor = color; ctx.shadowBlur = 25; }
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = item.kind === 'ship' ? '#5ffff0' : color; ctx.fill(); ctx.shadowBlur = 0;
        if (item.kind === 'hazard' || item.entity_id === selected) {
          ctx.beginPath(); ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = item.kind === 'hazard' ? '#ff8690' : '#86fff0'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#d1eefa';
        ctx.fillText(item.kind === 'ship' ? 'Spacecraft' : item.label, p.x, p.y - radius - 8);
      }
      hits.current.push({ ...p, radius: Math.max(radius + 6, 16), item });
    }
  }, [objects, scene, size, view, route, hazards, selected, bounds]);

  function inspect(item, center = false) {
    setSelected(item.entity_id); onInspect(mapSelectionText(item));
    if (item.kind === 'hazard') setHazards(true);
    if (center) {
      const scale = mapScale(bounds, size.width, size.height) * view.zoom;
      setView({ ...view, x: -(item.position.x - bounds.x) * scale, y: -(item.position.y - bounds.y) * scale * .64 });
    }
  }

  function finishPointer(event) {
    const start = drag.current; drag.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const rect = canvas.current.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const nearest = [...hits.current].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (nearest && Math.hypot(nearest.x - x, nearest.y - y) <= nearest.radius) inspect(nearest.item);
  }

  return <div className="backend-map">
    <div className="map-toolbar">
      <button aria-label="Zoom in on map" onClick={() => zoomAt(1.4)}>＋</button>
      <button aria-label="Zoom out on map" onClick={() => zoomAt(1 / 1.4)}>−</button>
      <button onClick={() => setView(HOME)}>Fit map</button>
      <button aria-pressed={route} onClick={() => setRoute(!route)}>Mission route</button>
      <button aria-pressed={hazards} onClick={() => setHazards(!hazards)}>Landmarks</button>
      <label>Orbit speed <select aria-label="Orbit speed" disabled={!ready || pending || !hasOrbits} value={speed}
        onChange={event => { const value = Number(event.target.value); setSpeed(value); simulation.setMapOrbitSpeed(value).catch(() => setSpeed(state?.map?.orbit_speed ?? 1)); }}>
        {[0, .5, 1, 2, 5].map(value => <option key={value} value={value}>{value}×</option>)}
      </select></label>
      <label>Inspect <select aria-label="Map object" value={selected} onChange={event => inspect(objects.find(item => item.entity_id === event.target.value), true)}>
        <option value="" disabled>Select object</option>
        {objects.map(item => <option key={item.entity_id} value={item.entity_id}>{item.kind === 'ship' ? 'Spacecraft' : item.label}</option>)}
      </select></label>
    </div>
    <canvas ref={canvas} tabIndex={0} role="img" aria-label="Live backend planetary map. Scroll to zoom, drag to pan, and select an object to inspect."
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
      <strong>{scene.map?.title ?? scene.world} · {ready ? 'LIVE BACKEND' : 'STALE / LAST RECEIVED POSITIONS'}</strong>
      {selectedObject && <span>{selectedObject.label}: X {selectedObject.position.x.toFixed(1)}, Y {selectedObject.position.y.toFixed(1)}, Z {selectedObject.position.z.toFixed(1)} m · {selectedObject.measured ? 'measured' : 'initial SDF pose'}</span>}
      <small>Scroll / W/S: zoom · Drag / A/D: pan · Compressed simulator scale</small>
    </div>
  </div>;
}
