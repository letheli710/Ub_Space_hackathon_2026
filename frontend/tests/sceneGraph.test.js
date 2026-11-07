import test from 'node:test';
import assert from 'node:assert/strict';
import { poseProps, resolveScene } from '../src/simulation/sceneGraph.js';

const pose = x => ({ position: { x, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
const scene = { schema_version: 1, up_axis: 'Z', units: 'meters', ship_entity_id: 'replacement_ship', entities: [
  { id: 'planet_new', pose_in_world: pose(100), links: [] },
  { id: 'replacement_ship', pose_in_world: pose(0), links: [{ id: 'replacement_ship::new_arm', pose_in_model: pose(1), visuals: [] }] },
] };

test('replacement models bind by frame identity regardless of telemetry order', () => {
  const models = resolveScene(scene, { transforms: [
    { child_frame_id: 'replacement_ship/new_arm', ...pose(5) },
    { child_frame_id: 'unrelated_frame', ...pose(200) },
    { child_frame_id: 'replacement_ship', ...pose(9) },
  ] });
  assert.equal(models[1].pose.position.x, 9);
  assert.equal(models[1].links[0].pose.position.x, 5);
  assert.equal(models[0].pose.position.x, 100);
});

test('initial SDF transforms are used until their measured frames arrive', () => {
  const models = resolveScene(scene, null);
  assert.equal(models[1].pose.position.x, 0);
  assert.equal(models[1].links[0].pose.position.x, 1);
  assert.deepEqual(poseProps(models[1].pose), { position: [0, 2, 3], quaternion: [0, 0, 0, 1] });
});

test('unsupported coordinate contracts are rejected instead of silently rotating incorrectly', () => {
  assert.throws(() => resolveScene({ ...scene, up_axis: 'Y' }, null), /coordinates/);
});
