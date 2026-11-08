import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { EARTH, LOOP, LOOP_LENGTH, MARS, createVoyage, loopPoint, setVoyageTimeScale, shipPose, stepVoyage, voyagePhase } from '../src/data/voyage.js';

test('round trip is continuous: legs join the parking orbits without jumps or kinks', () => {
  const joins = [...LOOP.map((segment) => segment.start), LOOP_LENGTH];
  for (const at of joins.slice(1)) {
    const before = loopPoint(at - 1e-6), after = loopPoint(at + 1e-6);
    assert.ok(before.position.distanceTo(after.position) < 1e-4);
    assert.ok(before.tangent.dot(after.tangent) > 0.999999);
  }
});

test('orbits go about half a lap around the far side of each planet', () => {
  assert.deepEqual(LOOP.map((s) => s.type), ['leg', 'arc', 'leg', 'arc']);
  for (const [segment, planet, other] of [[LOOP[1], MARS, EARTH], [LOOP[3], EARTH, MARS]]) {
    assert.ok(Math.abs(segment.angle - Math.PI) < 0.1);
    const middle = loopPoint(segment.start + segment.length / 2).position;
    assert.ok(middle.distanceTo(other.position) > planet.position.distanceTo(other.position));
  }
});

test('physical demo ship follows the loop, enters Mars orbit and heads home', () => {
  const v = createVoyage({ physical: true });
  setVoyageTimeScale(v, 1e6);
  const events = [];
  const phases = new Set();
  for (let i = 0; i < 4000 && events.length < 3; i++) {
    const event = stepVoyage(v, 0.1);
    if (event) events.push(event);
    phases.add(voyagePhase(v));
  }
  assert.deepEqual(events, ['arrived', 'departed', 'arrived']);
  assert.ok(['EARTH → MARS', 'MARS ORBIT', 'MARS → EARTH', 'EARTH ORBIT'].every((p) => phases.has(p)));
  // Undisturbed cruise stays on the planned route, and the nose points along it.
  const direction = new Vector3();
  const position = shipPose(v, new Vector3(), direction);
  const planned = loopPoint(v.routeDistance);
  assert.ok(position.distanceTo(planned.position) < 1e-3);
  assert.ok(direction.dot(planned.tangent) > 0.9999);
});
