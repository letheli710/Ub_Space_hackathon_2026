import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createVoyage, demoLocalOffset, demoRenderPosition, setVoyageTimeScale, stepVoyage } from '../src/data/voyage.js';
import { launchDemoRock, launchDemoRockAtPointer } from '../src/simulation/demoPhysics.js';
import { buildDemoObservation, executeDemoDecision } from '../src/simulation/demoAI.js';
import { pickLaunchOffset } from '../src/simulation/launchPlacement.js';

function inMarsOrbit() {
  const v = createVoyage({ physical: true });
  setVoyageTimeScale(v, 1e7);
  for (let i = 0; i < 2000 && v.segment !== 1; i++) stepVoyage(v, .1);
  assert.equal(v.segment, 1);
  setVoyageTimeScale(v, 2e5);
  for (let i = 0; i < 10; i++) stepVoyage(v, .1);
  return v;
}
const run = (v, seconds) => { for (let i = 0; i < seconds * 60; i++) stepVoyage(v, 1 / 60); };

test('rotating parking orbit preserves cursor placement and supplies map context to AI', () => {
  const v = inMarsOrbit(), anchor = v.mapPosition.clone();
  const camera = new PerspectiveCamera(45, 800 / 600, .1, 10000);
  camera.position.copy(anchor).add(new Vector3(5, 4, -12));
  camera.lookAt(anchor); camera.updateMatrixWorld();
  const rect = { left: 0, top: 0, width: 800, height: 600 }, x = 200, y = 150;
  const offset = pickLaunchOffset(x, y, rect, camera, anchor);
  const rock = launchDemoRockAtPointer(v.physics, demoLocalOffset(v, offset), { speed_m_s: 10 });
  const projected = demoRenderPosition(v, rock.p).project(camera);
  assert.ok(Math.abs((projected.x + 1) * 400 - x) < .002);
  assert.ok(Math.abs((1 - projected.y) * 300 - y) < .002);
  const o = buildDemoObservation(v.physics, v);
  assert.equal(o.telemetry.navigation.phase, 'MARS ORBIT');
  assert.equal(o.telemetry.navigation.destination, 'Mars');
  assert.deepEqual(o.telemetry.navigation.physics_to_map_quaternion, v.frame.toArray());
  assert.equal(o.threats.length, 1);
});

test('judged avoidance still clears a moving rock while the new map turns through orbit', () => {
  const v = inMarsOrbit(), baseline = inMarsOrbit();
  for (const voyage of [v, baseline]) launchDemoRock(voyage.physics, { warning_s: 60 });
  const o = buildDemoObservation(v.physics, v);
  run(v, 20);
  executeDemoDecision(v.physics, o, { id: 'orbit-evasion', run_id: o.run_id, approved_options: ['burn_right_8'], summary: 'Test-approved evasion' });
  run(v, 50); run(baseline, 70);
  assert.equal(v.physics.lastImpact, null);
  assert.ok(baseline.physics.lastImpact);
  assert.ok(v.deviation.length() > 0, 'approved burn must affect the map position');
});
