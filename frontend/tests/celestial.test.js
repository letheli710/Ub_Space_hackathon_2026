import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CELESTIAL_BODIES, createSolarSystem, DAY, moonState, MOON_PERIOD, planetState, solveKepler, SUN_GM, updateSolarSystem } from '../src/simulation/celestial.js';
import { createVoyage, setVoyageTimeScale, stepVoyage } from '../src/data/voyage.js';
import { launchDemoRock } from '../src/simulation/demoPhysics.js';
import { buildDemoObservation } from '../src/simulation/demoAI.js';

test('Kepler solution satisfies the elliptic equation, including large and negative times', () => {
  for (const m of [-1e6, -2, 0, 1, 3, 1e6]) for (const e of [0, .0167, .206, .9]) {
    const anomaly = solveKepler(m, e), wrapped = ((m + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
    assert.ok(Math.abs(anomaly - e * Math.sin(anomaly) - wrapped) < 1e-11);
  }
});

test('all eight planets conserve two-body orbital energy and angular momentum and return after a period', () => {
  for (const b of CELESTIAL_BODIES) {
    const initial = planetState(b.name, 0), h0 = initial.position.clone().cross(initial.velocity);
    const energy = -(SUN_GM+b.gm) / (2*b.a);
    for (const f of [0, .1, .25, .5, .9, 1]) {
      const { position, velocity } = planetState(b.name, f * b.period);
      assert.ok(Math.abs((velocity.lengthSq()/2 - (SUN_GM+b.gm)/position.length())/energy - 1) < 1e-11);
      assert.ok(position.clone().cross(velocity).distanceTo(h0)/h0.length() < 1e-11);
      assert.ok(position.length() >= b.a*(1-b.e)-1 && position.length() <= b.a*(1+b.e)+1);
    }
    assert.ok(planetState(b.name, b.period).position.distanceTo(initial.position) < 1);
    const at = b.period * .123, before = planetState(b.name, at-1).position, after = planetState(b.name, at+1);
    assert.ok(after.position.clone().sub(before).divideScalar(2).distanceTo(after.velocity) / after.velocity.length() < 2e-6);
  }
  const earth = CELESTIAL_BODIES.find(b => b.name === 'Earth'), mars = CELESTIAL_BODIES.find(b => b.name === 'Mars');
  assert.ok(Math.abs(earth.period/DAY - 365.256) < .01);
  assert.ok(Math.abs(mars.period/DAY - 687) < .1);
});

test('eccentric orbits move faster at perihelion and have real inclination', () => {
  const b = CELESTIAL_BODIES[0];
  const peri = planetState(b.name, -b.meanAnomaly/b.meanMotion);
  const apo = planetState(b.name, (Math.PI-b.meanAnomaly)/b.meanMotion);
  assert.ok(Math.abs(peri.velocity.length()/apo.velocity.length() - (1+b.e)/(1-b.e)) < 1e-11);
  assert.ok(Math.abs(planetState('Mars', 10*DAY).position.y) > 1e8);
});

test('Moon orbits its moving Earth, and voyages do not share mutable celestial state', () => {
  const a = moonState(0), b = moonState(MOON_PERIOD);
  assert.ok(a.relative.distanceTo(b.relative) < 1e-5);
  assert.ok(a.position.distanceTo(b.position) > 1e9);
  const system = createSolarSystem(), other = createSolarSystem();
  const original = other.planets.Earth.position.clone();
  updateSolarSystem(system, DAY);
  assert.deepEqual(other.planets.Earth.position, original);
  assert.ok(system.planets.Earth.position.distanceTo(original) > 1e9);
});

test('celestial clock pauses and follows map playback while a rock remains at the safe encounter rate', () => {
  const v = createVoyage({ physical: true }); setVoyageTimeScale(v, 1e6);
  launchDemoRock(v.physics, { warning_s: 60 });
  const earth = v.solarSystem.planets.Earth.position.clone();
  stepVoyage(v, 0);
  assert.deepEqual(v.solarSystem.planets.Earth.position, earth);
  stepVoyage(v, .1);
  assert.ok(Math.abs(v.solarSystem.elapsed - 100000) < 1e-6);
  assert.ok(Math.abs(v.physics.rocks[0].age - .1) < 1e-6);
  const observation = buildDemoObservation(v.physics, v);
  assert.equal(observation.telemetry.solar_system.planets.length, 8);
  assert.deepEqual(observation.telemetry.solar_system.planets.find(p => p.name === 'Earth').position_m, v.solarSystem.planets.Earth.position.toArray());
  assert.ok(observation.telemetry.navigation.eta_s > 0);
  assert.ok(new Vector3(...observation.telemetry.navigation.planned_arrival_map_units).distanceTo(new Vector3(...observation.telemetry.navigation.target_position_map_units)) > 100);
  const reset = createVoyage({ physical: true });
  assert.deepEqual(reset.solarSystem.planets.Earth.position, earth);
});
