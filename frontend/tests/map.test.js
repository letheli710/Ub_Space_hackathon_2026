import test from 'node:test';
import assert from 'node:assert/strict';
import { mapObjects, mapBounds, projectMap, mapSelectionText } from '../src/simulation/map.js';

const pose = (x, y = 0) => ({ position: { x, y, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
const scene = { schema_version: 1, up_axis: 'Z', units: 'meters', ship_entity_id: 'new_ship',
  entities: [
    { id: 'new_planet', pose_in_world: pose(100), links: [] },
    { id: 'new_ship', pose_in_world: pose(20), links: [] },
    { id: 'distant_landmark', pose_in_world: pose(10000), links: [] },
  ], map: { objects: [
    { entity_id: 'new_planet', label: 'Imported planet', kind: 'planet', radius_m: 10,
      orbit: { center: { x: 0, y: 0, z: 0 }, radius_m: 100, period_s: 300 } },
    { entity_id: 'distant_landmark', kind: 'hazard', radius_m: 5 },
  ] } };

test('map and ship use measured frame identities, independently of frontend demo positions', () => {
  const objects = mapObjects(scene, { transforms: [
    { child_frame_id: '/new_planet', ...pose(65, 75) },
    { child_frame_id: 'new_ship', ...pose(40, 2) },
  ] });
  assert.deepEqual(objects[0].position, { x: 65, y: 75, z: 0 });
  assert.equal(objects[0].measured, true);
  assert.equal(objects[1].kind, 'ship');
  assert.equal(objects[1].position.x, 40);
  assert.match(mapSelectionText(objects[0]), /Imported planet.*300.0/);
});

test('fit covers complete orbits without a distant hazard shrinking the solar system', () => {
  const bounds = mapBounds(mapObjects(scene, null));
  assert.deepEqual(bounds, { x: 0, y: 0, width: 220, height: 220 });
  assert.deepEqual(projectMap({ x: 0, y: 0 }, bounds, 600, 400), { x: 300, y: 200 });
  const projected = projectMap({ x: 0, y: 0 }, bounds, 600, 400, { zoom: 2, x: 40, y: -20 });
  assert.deepEqual(projected, { x: 340, y: 180 });
});

test('an imported map without annotations still renders its own initial and measured positions', () => {
  const objects = mapObjects({ ...scene, map: undefined }, null);
  assert.equal(objects[0].position.x, 100);
  assert.equal(objects[0].measured, false);
  assert.ok(Number.isFinite(mapBounds(objects).width));
});
