import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { advanceDemo, angularVelocity, coastDemo, commandDemoBurn, createDemoPhysics, demoTelemetry, launchDemoRock as launch, modelOrigin, setDemoTimeScale } from '../src/simulation/demoPhysics.js';
import { createVoyage, shipPose, shipSpeedKmS, stepVoyage } from '../src/data/voyage.js';

const run = (s, seconds, frame = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += frame) advanceDemo(s, Math.min(frame, seconds - t)); };
const launchDemoRock = (s, options) => launch(s, { warning_s: 2, ...options });
const momentum = s => [s.ship, ...s.fragments, ...s.rocks].reduce((p, b) => p.addScaledVector(b.v, b.mass), new Vector3());
const angularMomentum = s => [s.ship, ...s.fragments, ...s.rocks].reduce((p, b) => p.add(b.p.clone().cross(b.v.clone().multiplyScalar(b.mass))).add(b.L ?? new Vector3()), new Vector3());
const energy = s => [s.ship, ...s.fragments, ...s.rocks].reduce((e, b) => e + .5 * b.mass * b.v.lengthSq() + (b.L ? .5 * b.L.dot(angularVelocity(b)) : 0), 0);

test('DEMO starts at 7.9 km/s and accelerated coast preserves its velocity', () => {
  const s = createDemoPhysics(), before = s.ship.p.clone();
  advanceDemo(s, 2);
  assert.equal(s.elapsed, 2e6);
  assert.equal(s.ship.v.length(), 7900);
  assert.ok(Math.abs(s.ship.p.distanceTo(before) - 7900 * 2e6) < 1e-3);
});
test('finite thrust accelerates continuously, consumes fuel, expires and coasts', () => {
  const s = createDemoPhysics();
  commandDemoBurn(s, { linear: [0, 0, 1], seconds: 2 });
  assert.equal(s.timeScale, 1);
  run(s, .5);
  assert.ok(s.ship.v.z > 7900 && s.ship.v.z < 7902);
  run(s, 2);
  const velocity = s.ship.v.clone();
  assert.equal(s.burn, null);
  assert.ok(s.fuel < 4000);
  run(s, 1);
  assert.ok(s.ship.v.distanceTo(velocity) < 1e-9);
});
test('rotation changes attitude without redirecting velocity; later thrust follows rotated body', () => {
  const s = createDemoPhysics(), initial = s.ship.v.clone();
  commandDemoBurn(s, { angular: [0, 1, 0], seconds: 2 });
  run(s, 3);
  // Off-center fuel expenditure shifts the COM by micrometers; it must not turn
  // the 7.9 km/s flight vector along with the model's nose.
  assert.ok(s.ship.v.distanceTo(initial) < .001);
  assert.ok(angularVelocity(s.ship).length() > .01);
  const q = s.ship.q.clone();
  coastDemo(s); run(s, 1);
  assert.ok(q.angleTo(s.ship.q) > .01);
  commandDemoBurn(s, { linear: [0, 0, 1], seconds: 1 }); run(s, 1);
  assert.ok(Math.abs(s.ship.v.x) > .01);
});
test('light contact survives, heavy contact breaks corresponding component and conserves momentum', () => {
  const weak = createDemoPhysics();
  launchDemoRock(weak, { mass_kg: 1, speed_m_s: 5 }); run(weak, 3);
  assert.ok(weak.lastImpact);
  assert.equal(weak.fragments.length, 0);
  const s = createDemoPhysics();
  launchDemoRock(s, { mass_kg: 1000, speed_m_s: 80 });
  const p = momentum(s), l = angularMomentum(s), e = energy(s);
  run(s, 2.5);
  assert.ok(s.bonds.command.broken);
  assert.ok(momentum(s).distanceTo(p) / p.length() < 1e-10);
  // Finite contact stepping permits a small angular integration error.
  assert.ok(angularMomentum(s).distanceTo(l) / Math.max(1, l.length()) < .002);
  assert.ok(energy(s) <= e * 1.000001);
  assert.ok(angularVelocity(s.ship).length() > .001);
  assert.ok(s.ship.v.distanceTo(s.initialVelocity) > .01);
  const fragment = s.fragments.find(f => f.id === 'command');
  const localBefore = modelOrigin(fragment).sub(modelOrigin(s.ship));
  run(s, 1);
  assert.ok(localBefore.distanceTo(modelOrigin(fragment).sub(modelOrigin(s.ship))) > .01);
  assert.equal(demoTelemetry(s).arms.find(a => a.id === 'command').available, false);
});
test('continuous collision catches thin solar wing at 150 m/s; engine loss removes main thrust', () => {
  const s = createDemoPhysics();
  launchDemoRock(s, { target_id: 'solarRight', mass_kg: 5000, speed_m_s: 150, radius_m: .15 }); run(s, 2.2);
  assert.ok(s.bonds.solarRight.broken);
  const engine = createDemoPhysics();
  launchDemoRock(engine, { target_id: 'engine', mass_kg: 5000, speed_m_s: 150 }); run(engine, 2.3);
  assert.ok(engine.bonds.engine.broken);
  assert.doesNotThrow(() => launchDemoRock(engine, { target_id: 'engine' }));
  commandDemoBurn(engine, { linear: [0, 0, 1], seconds: 1 }); run(engine, .1);
  assert.ok(engine.force.length() <= 18000.001); // only RCS remains
});
test('a near miss causes no damage; the habitat ring has an actual hole', () => {
  const s = createDemoPhysics();
  const r = launchDemoRock(s, { target_id: 'ring', speed_m_s: 150, radius_m: .15, start_body: [5, 2, 20] });
  r.v.copy(s.ship.v).add(new Vector3(0, 0, -150));
  run(s, .5);
  assert.equal(s.lastImpact, null);
  assert.equal(s.fragments.length, 0);
});
test('frame-rate independent stepping, warp guard, validation, fuel exhaustion and reset', () => {
  const a = createDemoPhysics(), b = createDemoPhysics();
  for (const s of [a, b]) commandDemoBurn(s, { linear: [1, 0, 0], seconds: 3 });
  run(a, 3, 1 / 30); run(b, 3, 1 / 144);
  assert.ok(a.ship.p.distanceTo(b.ship.p) < 1e-6);
  assert.ok(a.ship.v.distanceTo(b.ship.v) < 1e-9);
  launchDemoRock(a);
  assert.throws(() => setDemoTimeScale(a, 100), /1x/);
  assert.throws(() => commandDemoBurn(a, { linear: [Infinity, 0, 0] }), /finite/);
  assert.throws(() => launchDemoRock(a, { mass_kg: NaN }), /range/);
  b.fuel = 0; commandDemoBurn(b, { linear: [1, 0, 0] }); const v = b.ship.v.clone(); run(b, 1);
  assert.ok(v.distanceTo(b.ship.v) < 1e-9);
  const reset = createDemoPhysics();
  assert.equal(reset.fragments.length, 0); assert.equal(reset.fuel, 4000); assert.equal(reset.ship.v.length(), 7900);
});
test('DEMO voyage pose and telemetry use physical state, without snapping back to the route', () => {
  const voyage = createVoyage({ physical: true });
  commandDemoBurn(voyage.physics, { linear: [0, 1, 0], seconds: 2 });
  const before = shipPose(voyage, new Vector3());
  for (let i = 0; i < 180; i++) stepVoyage(voyage, 1 / 60);
  assert.ok(before.distanceTo(shipPose(voyage, new Vector3())) > 0);
  assert.equal(shipSpeedKmS(voyage), voyage.physics.ship.v.length() / 1000);
  assert.ok(demoTelemetry(voyage.physics).deviationM > .1);
});
