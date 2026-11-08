import { resolveScene } from './sceneGraph.js';

// One projection for imported maps as well as the default solar system. Positions
// are received from Gazebo; this module never advances a local orbital clock.
export function mapObjects(scene, state) {
  const entities = resolveScene(scene, state);
  const annotations = new Map((scene.map?.objects ?? []).map(item => [item.entity_id, item]));
  const measured = new Set((state?.transforms ?? []).map(frame => frame.child_frame_id.replaceAll('::', '/').replace(/^\//, '')));
  return entities.map(entity => ({
    entity_id: entity.id, label: entity.id.replaceAll('_', ' '), radius_m: 5, color: [.6, .7, .8, 1],
    ...annotations.get(entity.id),
    kind: entity.id === scene.ship_entity_id ? 'ship' : annotations.get(entity.id)?.kind ?? 'object',
    position: entity.pose.position, measured: measured.has(entity.id),
  }));
}

export function mapBounds(objects) {
  let candidates = objects.filter(item => item.kind !== 'hazard');
  if (!candidates.length) candidates = objects;
  if (!candidates.length) return { x: 0, y: 0, width: 100, height: 100 };
  const xs = [], ys = [];
  for (const item of candidates) {
    const center = item.orbit?.center ?? item.position;
    const radius = (item.orbit?.radius_m ?? 0) + item.radius_m;
    xs.push(center.x - radius, center.x + radius);
    ys.push(center.y - radius, center.y + radius);
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2,
    width: Math.max(50, maxX - minX), height: Math.max(50, maxY - minY) };
}

export function mapScale(bounds, width, height) {
  return Math.max(.001, Math.min(Math.max(10, width - 90) / bounds.width, Math.max(10, height - 90) / (bounds.height * .64)));
}

export function projectMap(position, bounds, width, height, view = { zoom: 1, x: 0, y: 0 }) {
  const scale = mapScale(bounds, width, height) * view.zoom;
  return { x: width / 2 + view.x + (position.x - bounds.x) * scale,
    y: height / 2 + view.y + (position.y - bounds.y) * scale * .64 };
}

export function mapSelectionText(item) {
  return `${item.label} · ${item.kind}. Radius: ${item.radius_m.toFixed(1)} simulator m.` +
    (item.orbit ? ` Orbital period at 1×: ${item.orbit.period_s.toFixed(1)} simulation seconds.` : '') +
    (item.description ? ` ${item.description}` : '');
}
