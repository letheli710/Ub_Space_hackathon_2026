import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { DAY, planetMapPosition } from '../src/simulation/celestial.js';
import { createMission, missionPath, missionPoint, parkingRadius } from '../src/simulation/missionGuidance.js';
import { createVoyage, shipPose, stepVoyage } from '../src/data/voyage.js';

test('the dotted loop circles the visible current planets on their far sides', () => {
  const mission = createMission();
  for (const day of [0, 33, 100, 400, 900]) {
    const time = day * DAY, path = missionPath(mission, time).planned.map(p => new Vector3(...p));
    const earth = planetMapPosition('Earth', time), mars = planetMapPosition('Mars', time);
    for (const [phase, center, other, name] of [[1, mars, earth, 'Mars'], [3, earth, mars, 'Earth']]) {
      const arc = path.slice(phase*97, (phase+1)*97);
      assert.ok(arc.every(p => Math.abs(p.distanceTo(center) - parkingRadius(name)) < 1e-7), `${name} cap must follow the current planet`);
      assert.ok(arc[48].clone().sub(center).dot(center.clone().sub(other)) > 0, `${name} cap must circle BEHIND the planet`);
    }
    assert.ok(path[0].distanceTo(path.at(-1)) < 1e-7, 'Earth-Mars loop must close at the current epoch');
    // No arbitrary excursions above the shared Earth-Mars orbital plane.
    const direction = mars.clone().sub(earth).normalize();
    const normal = new Vector3(0,1,0).addScaledVector(direction, -direction.y).normalize();
    assert.ok(path.every(p => Math.abs(p.clone().sub(earth).dot(normal)) < 1e-6));
  }
});

test('the actual spacecraft passes behind Mars then behind Earth as the planets move', () => {
  const voyage = createVoyage({ physical: true });
  for (const [phase, name, otherName] of [[1, 'Mars', 'Earth'], [3, 'Earth', 'Mars']]) {
    while (voyage.mission.segments.length <= phase) missionPoint(voyage.mission, voyage.mission.segments.at(-1).endTime + 1);
    const segment = voyage.mission.segments[phase], time = segment.startTime + segment.duration / 2;
    stepVoyage(voyage, (time - voyage.mapElapsed)/voyage.timeScale);
    const center = planetMapPosition(name, voyage.mapElapsed), other = planetMapPosition(otherName, voyage.mapElapsed);
    const ship = shipPose(voyage, new Vector3()), radial = ship.clone().sub(center);
    assert.ok(Math.abs(radial.length() - parkingRadius(name)) < .5,'finite guidance must track the far-side cap within its control tolerance');
    assert.ok(radial.dot(center.clone().sub(other)) > 0, `ship must physically pass behind ${name}`);
    const path = missionPath(voyage.mission, voyage.mapElapsed);
    assert.ok(new Vector3(...path.flown.at(-1)).distanceTo(ship) < .5);
    assert.ok(new Vector3(...voyage.flightTrail.at(-1)).distanceTo(ship)<.01,'the actual flight trail records the integrated ship, not the reference');
  }
});

test('the solid route ends at the ship guidance point at the same epoch', () => {
  const mission = createMission();
  for (const time of [DAY, 100*DAY, 400*DAY, 900*DAY]) {
    const ship = missionPoint(mission, time).position;
    const flown = missionPath(mission, time).flown;
    assert.ok(new Vector3(...flown.at(-1)).distanceTo(ship) < 1e-7);
  }
});
