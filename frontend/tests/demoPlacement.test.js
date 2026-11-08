import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_TIME_SCALE, createVoyage, demoLocalOffset, demoRenderPosition, setVoyageTimeScale, shipPose, stepVoyage } from '../src/data/voyage.js';
import { launchDemoRock, launchDemoRockAtPointer, modelOrigin, DEMO_RENDER_SCALE } from '../src/simulation/demoPhysics.js';
import { pickLaunchOffset } from '../src/simulation/launchPlacement.js';

test('placing a rock preserves visible cruise speed while physical motion continues at encounter time', () => {
  const v = createVoyage({ physical: true });
  const before = shipPose(v, new Vector3());
  stepVoyage(v, .1);
  const coastDistance = before.distanceTo(shipPose(v, new Vector3()));
  launchDemoRock(v.physics, { warning_s: 12 });
  const start = shipPose(v, new Vector3()), physicalStart = v.physics.ship.p.clone();
  const time = v.physics.elapsed;
  stepVoyage(v, .1);
  assert.ok(Math.abs(start.distanceTo(shipPose(v, new Vector3())) / coastDistance - 1) < .001,
    'map travel must not drop a millionfold when a rock is placed');
  assert.equal(v.timeScale, DEFAULT_TIME_SCALE);
  assert.ok(Math.abs(v.physics.elapsed - time - .1) < 1e-6);
  assert.ok(Math.abs(v.physics.ship.p.distanceTo(physicalStart) - 790) < .01);
  assert.ok(v.physics.rocks[0].age < .11, 'do not fast-forward through the impact');
});

test('screen clicks round-trip through rotated ship physics to the exact cursor, including close clicks', () => {
  const v = createVoyage({ physical: true }), s = v.physics;
  stepVoyage(v, .5);
  const anchor = shipPose(v, new Vector3());
  const camera = new PerspectiveCamera(45, 800 / 600, .1, 10000);
  camera.position.copy(anchor).add(new Vector3(5, 4, -12));
  camera.lookAt(anchor); camera.updateMatrixWorld();
  const rect = { left: 125, top: 80, width: 800, height: 600 };
  for (const [x, y, target_id] of [[225, 175, 'engine'], [800, 530, 'solarRight'], [526, 381, 'command']]) {
    const offset = pickLaunchOffset(x, y, rect, camera, anchor);
    const rock = launchDemoRockAtPointer(s, demoLocalOffset(v, offset), { target_id, mass_kg: 345, speed_m_s: 17, radius_m: .8 });
    const rendered = demoRenderPosition(v, rock.p), ndc = rendered.clone().project(camera);
    assert.ok(Math.abs(rect.left + (ndc.x + 1) * rect.width / 2 - x) < .002);
    assert.ok(Math.abs(rect.top + (1 - ndc.y) * rect.height / 2 - y) < .002);
    const target = s.parts.find(p => p.id === target_id);
    const aim = new Vector3(...target.aimPoint).sub(s.ship.com).applyQuaternion(s.ship.q).add(s.ship.p);
    const relative = rock.v.clone().sub(s.ship.v);
    assert.ok(relative.clone().normalize().dot(aim.sub(rock.p).normalize()) > .999999);
    assert.ok(Math.abs(relative.length() - 17) < 1e-9);
    assert.equal(rock.mass, 345); assert.equal(rock.radius, .8);
  }
  assert.equal(s.rocks.length, 3);
});

test('a pointer shot intercepts a translating ship without freezing it, and the map/rocks share an anchor', () => {
  const v = createVoyage({ physical: true }), s = v.physics;
  setVoyageTimeScale(v, 1e6);
  stepVoyage(v, .1);
  const start = new Vector3(0, 90, 15.5).applyQuaternion(s.ship.q).multiplyScalar(DEMO_RENDER_SCALE);
  const rock = launchDemoRockAtPointer(s, start.toArray(), { target_id: 'command', speed_m_s: 40 });
  const position = s.ship.p.clone(), map = shipPose(v, new Vector3());
  for (let i = 0; i < 150; i++) stepVoyage(v, 1 / 60);
  assert.ok(s.lastImpact, 'moving ship must receive a physical contact');
  assert.ok(s.ship.p.distanceTo(position) > 19000);
  assert.ok(shipPose(v, new Vector3()).distanceTo(map) > 45);
  const renderedSeparation = demoRenderPosition(v, rock.p).sub(shipPose(v, new Vector3()));
  assert.ok(renderedSeparation.distanceTo(rock.p.clone().sub(modelOrigin(s.ship)).multiplyScalar(DEMO_RENDER_SCALE).applyQuaternion(v.frame)) < 1e-9);
});

test('wreckage targeting does not shift the clicked spawn location, and map speed changes leave physics safe', () => {
  const v = createVoyage({ physical: true }), s = v.physics;
  launchDemoRock(s, { target_id: 'command', mass_kg: 5000, speed_m_s: 150, warning_s: 2 });
  for (let i = 0; i < 180; i++) stepVoyage(v, 1 / 60);
  assert.ok(s.fragments.find(f => f.id === 'command'));
  const offset = [3, 2, -5];
  const rock = launchDemoRockAtPointer(s, demoLocalOffset(v, offset), { target_id: 'command' });
  assert.ok(demoRenderPosition(v, rock.p).sub(shipPose(v, new Vector3())).distanceTo(new Vector3(...offset)) < .00001);
  setVoyageTimeScale(v, 2e6);
  assert.equal(s.timeScale, 1); assert.equal(v.timeScale, 2e6);
  const age = rock.age; stepVoyage(v, .1);
  assert.ok(Math.abs(rock.age - age - .1) < 1e-6);
  assert.throws(() => setVoyageTimeScale(v, Infinity));
});

test('distant pointer shots remain inbound and a paused step changes neither clock nor placement', () => {
  const v = createVoyage({ physical: true }), s = v.physics;
  const rock = launchDemoRockAtPointer(s, [0, 5000, 0], { speed_m_s: 1 });
  const p = rock.p.clone(), ship = s.ship.p.clone(), map = v.mapPosition.clone();
  stepVoyage(v, 0);
  assert.deepEqual(rock.p, p); assert.deepEqual(s.ship.p, ship); assert.deepEqual(v.mapPosition, map);
  assert.equal(rock.age, 0); assert.equal(s.elapsed, 0); assert.equal(v.mapElapsed, 0);
  stepVoyage(v, .1);
  assert.equal(s.rocks.length, 1, 'a far-away pointer launch must not be retired immediately');
  assert.ok(rock.ttl > 33000);
});
