import { Quaternion, Vector3 } from 'three';
import { propulsionIntegrity, subsystemStates } from './demoSystems.js';

const Z = new Vector3(0, 0, 1);
export function createFlightControl(direction) {
  return { enabled: true, mode: 'tracking', reason: '', holdUntil: 0, maneuver: false,
    targetAttitude: new Quaternion().setFromUnitVectors(Z, direction),
    force: new Vector3(), torque: new Vector3(), positionErrorM: 0, velocityErrorM_s: 0 };
}

/** Standing authority belongs only to this routine navigation controller. */
export function navigationAuthority(s) {
  const c = s.flightControl;
  if (!c?.enabled) return { mode: 'coasting', reason: 'Automatic course correction is off' };
  if (subsystemStates(s).propelling.mode !== 'online') return { mode: 'offline', reason: 'Propelling subsystem is offline' };
  if (s.fuel <= 0) return { mode: 'offline', reason: 'No propellant' };
  if (s.faults.includes('Thruster Failure') || s.faults.includes('Engine Failure') ||
      s.bonds.engine?.broken || s.bonds.spine?.broken || propulsionIntegrity(s) <= 0)
    return { mode: 'offline', reason: 'Propulsion hardware unavailable' };
  // Keep an approved evasion clear until approaching rocks have passed. A routine
  // path-restoring burn must never undo Main Judging's collision-avoidance burn.
  const approaching = c.maneuver && s.rocks.some(r => {
    const p = r.p.clone().sub(s.ship.p), v = r.v.clone().sub(s.ship.v);
    const t = -p.dot(v) / Math.max(1e-9, v.lengthSq());
    return t > 0 && t < 120;
  });
  if (s.burn || s.elapsed < c.holdUntil || approaching)
    return { mode: 'yielding', reason: 'Yielding to a deliberate maneuver / incoming rock' };
  return { mode: 'tracking', reason: '' };
}

export function localCourseError(s, out = new Vector3()) {
  return out.copy(s.ship.p).sub(s.initialPosition).sub(s.cruiseDisplacement);
}

/** A bounded PD stabilizer. Its wrench is applied by the ordinary rigid-body solver. */
export function courseCorrection(s, omega, worldTensor) {
  const c = s.flightControl, authority = navigationAuthority(s);
  if (!c) return null;
  c.force.set(0, 0, 0); c.torque.set(0, 0, 0);
  const error = localCourseError(s), velocity = s.ship.v.clone().sub(s.cruiseVelocity);
  c.positionErrorM = error.length(); c.velocityErrorM_s = velocity.length();
  c.mode = authority.mode; c.reason = authority.reason;
  if (authority.mode !== 'tracking') return null;
  c.maneuver = false;
  const rcs = .3 + .7 * (s.bonds.spine?.health ?? 100) / 100;
  if (error.length() > .025 || velocity.length() > .005) {
    c.force.copy(error).multiplyScalar(-.025).addScaledVector(velocity, -.32)
      .multiplyScalar(s.ship.mass).clampLength(0, 18000 * rcs);
  }
  const q = c.targetAttitude.clone().multiply(s.ship.q.clone().invert()).normalize();
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const sine = Math.hypot(q.x, q.y, q.z), angle = 2 * Math.atan2(sine, q.w);
  const alpha = sine > 1e-9 ? new Vector3(q.x, q.y, q.z).multiplyScalar(.18 * angle / sine) : new Vector3();
  alpha.addScaledVector(omega, -.85);
  c.torque.copy(worldTensor(s.ship, alpha)).add(omega.clone().cross(s.ship.L)).clampLength(0, 80000 * rcs);
  if (error.length() > .15 || velocity.length() > .03 || angle > .025 || omega.length() > .005) c.mode = 'correcting';
  return c;
}
