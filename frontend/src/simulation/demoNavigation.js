import { Vector3 } from 'three';
import { METERS_PER_MAP_UNIT } from './celestial.js';
import { missionPoint } from './missionGuidance.js';

const SAMPLE = 600, MAX_STEP = 10800, RESPONSE = 86400;
const KP = 4 / RESPONSE ** 2, KD = 4 / RESPONSE;
const sample = (mission, time, travel) => missionPoint(mission, Math.max(0, time), undefined, undefined, Math.max(0, travel)).position;

/** Derivatives of the moving reference, not an assignment to the ship's pose. */
function reference(mission, time, travel, rate) {
  const p = sample(mission, time, travel);
  const b = sample(mission, time + SAMPLE, travel + SAMPLE * rate);
  let velocity, acceleration;
  if (time >= SAMPLE && travel >= SAMPLE * rate) {
    const a = sample(mission, time - SAMPLE, travel - SAMPLE * rate);
    velocity = b.clone().sub(a).multiplyScalar(METERS_PER_MAP_UNIT / (2 * SAMPLE));
    acceleration = b.clone().add(a).addScaledVector(p, -2).multiplyScalar(METERS_PER_MAP_UNIT / SAMPLE ** 2);
  } else {
    const b2 = sample(mission, time + 2 * SAMPLE, travel + 2 * SAMPLE * rate);
    velocity = p.clone().multiplyScalar(-3).addScaledVector(b, 4).sub(b2).multiplyScalar(METERS_PER_MAP_UNIT / (2 * SAMPLE));
    acceleration = b2.sub(b.clone().multiplyScalar(2)).add(p).multiplyScalar(METERS_PER_MAP_UNIT / SAMPLE ** 2);
  }
  return { position: p, velocity, acceleration };
}

export function createNavigationBody(mission) {
  const r = reference(mission, 0, 0, 1);
  return { position: r.position.clone(), velocity: r.velocity, force: new Vector3(), fuelUsed: 0, errorMapUnits: 0 };
}

/** Free integration in the accelerated map clock. With no authority, a=0 and
 * velocity is preserved. The dotted loop is only the controller's reference.
 * Fuel uses the existing physical/encounter clock, not accelerated mission days. */
export function advanceNavigationBody(body, mission, { time, travel, duration, travelDuration, physicalDuration, mass, forceLimit, fuel, powered }) {
  if (!(duration > 0)) return;
  body.force.set(0, 0, 0); body.fuelUsed = 0;
  const rate = travelDuration / duration;
  const acceleration = (p, v, t, u) => {
    if (!powered || body.fuelUsed >= fuel) return new Vector3();
    const r = reference(mission, t, u, rate);
    return r.acceleration.addScaledVector(r.position.sub(p), METERS_PER_MAP_UNIT * KP)
      .addScaledVector(r.velocity.sub(v), KD).clampLength(0, forceLimit / mass);
  };
  // Velocity Verlet gives bounded, continuous position/velocity through turns;
  // no projection, interpolation-to-path, or direct attitude assignment.
  for (let passed = 0; passed < duration - 1e-9;) {
    const h = Math.min(MAX_STEP, duration - passed), t = time + passed, u = travel + passed * rate;
    const a = acceleration(body.position, body.velocity, t, u);
    const localTime = h / duration * physicalDuration;
    const estimatedCost = a.length() * mass * localTime / (230 * 9.80665);
    if (estimatedCost > fuel - body.fuelUsed) a.multiplyScalar(Math.max(0, fuel - body.fuelUsed) / estimatedCost);
    body.position.addScaledVector(body.velocity, h / METERS_PER_MAP_UNIT).addScaledVector(a, .5 * h * h / METERS_PER_MAP_UNIT);
    const nextVelocity = body.velocity.clone().addScaledVector(a, h);
    const next = acceleration(body.position, nextVelocity, t + h, u + h * rate);
    // At fuel exhaustion use the same capped acceleration on both half steps.
    if (estimatedCost >= fuel - body.fuelUsed) next.copy(a);
    body.velocity.addScaledVector(a.add(next).multiplyScalar(.5), h);
    body.force.copy(a).multiplyScalar(mass);
    body.fuelUsed = Math.min(fuel, body.fuelUsed + a.length() * mass * localTime / (230 * 9.80665));
    passed += h;
  }
  const target = sample(mission, time + duration, travel + travelDuration);
  body.errorMapUnits = body.position.distanceTo(target);
}
