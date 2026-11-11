import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createVoyage, predictShipPosition, setVoyageTimeScale, shipPose, stepVoyage, voyagePhase } from '../src/data/voyage.js';
import { DAY, planetMapPosition } from '../src/simulation/celestial.js';
import { createMission, guidancePoint, GUIDANCE_SPEED, missionPoint, parkingRadius, planTransfer, SUN_CLEARANCE } from '../src/simulation/missionGuidance.js';

test('moving-planet transfers and parking passes join without position or heading jumps', () => {
  const mission = createMission();
  for (let i = 0; i < 8; i++) missionPoint(mission, mission.segments.at(-1).endTime + 1);
  for (let i = 0; i < mission.segments.length - 1; i++) {
    const a = mission.segments[i], b = mission.segments[i+1];
    const before = guidancePoint(a, a.endTime), after = guidancePoint(b, b.startTime);
    assert.ok(before.position.distanceTo(after.position) < 1e-8);
    assert.ok(before.tangent.dot(after.tangent) > 0.999999);
  }
});

test('parking follows the moving planet around its far side from outbound to inbound tangent', () => {
  const mission = createMission();
  missionPoint(mission, mission.segments[0].endTime + 1);
  const arc = mission.segments[1];
  for (const f of [0, .25, .5, .75, 1]) {
    const time = arc.startTime + arc.duration * f;
    const relative = guidancePoint(arc, time).position.sub(planetMapPosition('Mars', time));
    assert.ok(Math.abs(relative.length() - parkingRadius('Mars')) < 1e-9);
    const away = planetMapPosition('Mars', time).sub(planetMapPosition('Earth', time)).normalize();
    const normal = new Vector3(0,1,0).addScaledVector(away,-away.y).normalize();
    const side = away.clone().cross(normal);
    if (f === 0) assert.ok(relative.dot(side) > 0);
    if (f === .5) assert.ok(relative.clone().normalize().dot(away) > .999999);
    if (f === 1) assert.ok(relative.dot(side) < 0);
  }
  assert.ok(planetMapPosition('Mars', arc.startTime).distanceTo(planetMapPosition('Mars', arc.endTime)) > 10);
});

test('physical demo ship follows the loop, enters Mars orbit and heads home', () => {
  const v = createVoyage({ physical: true });
  setVoyageTimeScale(v, 1e6);
  const events = [];
  const phases = new Set();
  for (let i = 0; i < 5000 && events.length < 3; i++) {
    const event = stepVoyage(v, 0.1);
    if (event) events.push(event);
    phases.add(voyagePhase(v));
  }
  assert.deepEqual(events, ['arrived', 'departed', 'arrived']);
  assert.ok(['EARTH → MARS', 'MARS ORBIT', 'MARS → EARTH', 'EARTH ORBIT'].every((p) => phases.has(p)));
  // Powered tracking stays near the reference, with finite steering lag. It must
  // never be tested as an exact pose constraint on a free body.
  const direction = new Vector3();
  const position = shipPose(v, new Vector3(), direction);
  const planned = missionPoint(v.mission, v.mapElapsed);
  assert.ok(position.distanceTo(planned.position) < .5);
  assert.ok(v.physics.flightControl.enabled);
  assert.ok(v.physics.fuel<4000,'powered steering must use propellant');
  assert.ok(Number.isFinite(direction.length()) && Math.abs(direction.length()-1)<1e-10);
  assert.ok(v.physics.torque.length()<=80000.001);
});

test('continuously guided transfers reach the moving destination and clear the Sun at different launch dates', () => {
  for (const days of [0, 100, 500, 2000]) for (const [from, to] of [['Earth', 'Mars'], ['Mars', 'Earth']]) {
    const leg = planTransfer(from, to, days * DAY);
    const arrival = guidancePoint(leg, leg.endTime).position;
    assert.ok(Math.abs(arrival.distanceTo(planetMapPosition(to, leg.endTime)) - parkingRadius(to)) < 1e-8);
    assert.ok(arrival.distanceTo(planetMapPosition(to, leg.startTime)) > parkingRadius(to) + 10);
    assert.ok(Math.abs(leg.length / GUIDANCE_SPEED - leg.duration) < 1);
    for (let i = 0; i <= 512; i++) assert.ok(leg.curve.getPoint(i / 512).length() > SUN_CLEARANCE - .05);
  }
});

test('prediction agrees with advancing through capture and departure without advancing the live clock', () => {
  for (const boundary of [0, 1]) {
    const v = createVoyage({ physical: true }); setVoyageTimeScale(v, 1e6);
    missionPoint(v.mission, v.mission.segments[0].endTime + 1);
    const at = v.mission.segments[boundary].endTime;
    stepVoyage(v, (at - 500000) / v.timeScale);
    const time = v.mapElapsed, planet = v.solarSystem.planets.Earth.position.clone();
    const forecast = predictShipPosition(v, 1, new Vector3());
    assert.equal(v.mapElapsed, time);
    assert.deepEqual(v.solarSystem.planets.Earth.position, planet);
    for (let i = 0; i < 10; i++) stepVoyage(v, .1);
    assert.ok(forecast.distanceTo(shipPose(v, new Vector3())) < 1e-4);
  }
});
