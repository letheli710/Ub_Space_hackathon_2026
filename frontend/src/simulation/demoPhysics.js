import { Vector3, Quaternion, Matrix3 } from 'three';
import { DEMO_PARTS, DEMO_ARM_MOUNTS } from './demoShip.js';

const V = a => new Vector3(...(a ?? [0, 0, 0]));
const Z = V([0, 0, 1]);
const H = 1 / 120;
const G0 = 9.80665;
export const DEMO_CRUISE_M_S = 7900;
export const DEMO_RENDER_SCALE = .15;

// Compound inertia about the center of mass, including rotated boxes and parallel-axis terms.
function massProperties(parts, fuel = 0) {
  const pieces = parts.flatMap(p => {
    const volume = p.boxes.reduce((s, b) => s + b.size.reduce((a, n) => a * n, 1), 0);
    return p.boxes.map(b => ({ ...b, mass: p.mass * b.size.reduce((a, n) => a * n, 1) / volume }));
  });
  if (fuel) pieces.push({ center: [0, 0, -5], size: [2, 2, 2], angle: 0, mass: fuel });
  // A small permanent central chassis remains if every replaceable part is lost.
  if (!parts.length && !fuel) pieces.push({ center: [0, 0, 0], size: [1, 1, 1], mass: 1, angle: 0 });
  const mass = pieces.reduce((s, p) => s + p.mass, 0);
  const com = pieces.reduce((s, p) => s.addScaledVector(V(p.center), p.mass / mass), V());
  const tensor = new Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (const p of pieces) {
    const [x, y, z] = p.size, m = p.mass;
    const a = m * (y*y + z*z) / 12, b = m * (x*x + z*z) / 12, c = m * (x*x + y*y) / 12;
    const cs = Math.cos(p.angle), sn = Math.sin(p.angle), r = V(p.center).sub(com);
    const t = new Matrix3().set(
      a*cs*cs+b*sn*sn + m*(r.y*r.y+r.z*r.z), (a-b)*cs*sn-m*r.x*r.y, -m*r.x*r.z,
      (a-b)*cs*sn-m*r.x*r.y, a*sn*sn+b*cs*cs+m*(r.x*r.x+r.z*r.z), -m*r.y*r.z,
      -m*r.x*r.z, -m*r.y*r.z, c+m*(r.x*r.x+r.y*r.y));
    tensor.elements = tensor.elements.map((n, i) => n + t.elements[i]);
  }
  return { mass, com, inertia: tensor, inverse: tensor.clone().invert() };
}
function tensorWorld(body, v, inverse = false) {
  return v.clone().applyQuaternion(body.q.clone().invert()).applyMatrix3(inverse ? body.inverse : body.inertia).applyQuaternion(body.q);
}
export const angularVelocity = body => tensorWorld(body, body.L, true);
export const modelOrigin = body => body.p.clone().sub(body.com.clone().applyQuaternion(body.q));
const pointWorld = (body, point) => V(point).sub(body.com).applyQuaternion(body.q).add(body.p);
const pointVelocity = (body, p) => angularVelocity(body).cross(p.clone().sub(body.p)).add(body.v);
function body(parts, p, q, v, fuel = 0) {
  return { parts, ...massProperties(parts, fuel), p: p.clone(), q: q.clone(), v: v.clone(), L: V() };
}
function refreshMass(b, fuel) {
  const origin = modelOrigin(b), omega = angularVelocity(b), oldP = b.p.clone();
  Object.assign(b, massProperties(b.parts, fuel));
  b.p.copy(origin).add(b.com.clone().applyQuaternion(b.q));
  b.v.add(omega.clone().cross(b.p.clone().sub(oldP)));
  b.L.copy(tensorWorld(b, omega));
}

/** Independent of React, the backend, and render scale. State is in meters/seconds/kg. */
export function createDemoPhysics({ position = [0, 0, 0], direction = [0, 0, 1], parts = DEMO_PARTS } = {}) {
  const forward = V(direction).normalize(), q = new Quaternion().setFromUnitVectors(Z, forward);
  const fuel = 4000, ship = body(parts.slice(), V(position), q, forward.multiplyScalar(DEMO_CRUISE_M_S), fuel);
  ship.p.add(ship.com.clone().applyQuaternion(q));
  return { ship, fuel, parts, fragments: [], rocks: [], elapsed: 0, accumulator: 0,
    nextId: 1, revision: 0, timeScale: 1e6, burn: null, force: V(), torque: V(),
    bonds: Object.fromEntries(parts.map(p => [p.id, { broken: false, health: 100, peak: 0, shearPa: 0, normalPa: 0, marks: [] }])),
    runId: globalThis.crypto?.randomUUID() ?? `${Date.now()}-${Math.random()}`, epoch: 0,
    repairs: [], battery: 100, solarProtection: false,
    events: [], faults: [], lastImpact: null, initialVelocity: ship.v.clone(), initialPosition: ship.p.clone(),
  };
}
const emit = (s, e) => { s.events.push({ ...e, time: s.elapsed }); if (s.events.length > 100) s.events.shift(); };
export function demoNormalTime(s) { s.timeScale = 1; s.accumulator = 0; }
export function setDemoTimeScale(s, scale) {
  if (!Number.isFinite(scale) || scale < 1 || scale > 1e7) throw new Error('Time scale must be between 1 and 10M.');
  if (scale > 1 && (s.burn || s.repairs.length || s.rocks.length || s.fragments.length || angularVelocity(s.ship).length() > 1e-8)) {
    throw new Error('Use 1x during burns, rotation or debris encounters. Reset DEMO to fast-forward again.');
  }
  s.timeScale = scale;
}
export function commandDemoBurn(s, { linear = [0, 0, 0], angular = [0, 0, 0], seconds = 2 } = {}) {
  for (const vector of [linear, angular]) {
    if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite) || V(vector).length() > 1.000001) throw new Error('Throttle must be a finite three-vector of magnitude at most 1.');
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 10) throw new Error('Burn duration must be 0–10 seconds.');
  demoNormalTime(s);
  s.burn = { linear: V(linear), angular: V(angular), remaining: seconds };
  s.epoch++;
  emit(s, { type: 'burn', text: `DEMO · body-frame burn for ${seconds}s` });
}
export function coastDemo(s) { s.burn = null; s.force.set(0, 0, 0); s.torque.set(0, 0, 0); s.epoch++; }

/** Ballistic rock aimed once; it never follows a moving/turning target. */
export function launchDemoRock(s, { target_id = 'command', mass_kg = 200, radius_m = .6, speed_m_s = 40, direction_body, start_body, start_world, warning_s = 12 } = {}) {
  const target = target_id === 'cycle' ? s.parts[(s.nextId - 1) % s.parts.length] : s.parts.find(p => p.id === target_id) ?? s.parts[0];
  const targetBody = s.fragments.find(f => f.id === target.id) ?? s.ship;
  direction_body ??= target.approach ?? [0, -1, 0];
  for (const [value, min, max] of [[mass_kg, 1, 5000], [radius_m, .15, 2], [speed_m_s, 1, 150]]) {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error('Rock settings are outside their allowed range.');
  }
  if (!Number.isFinite(warning_s) || warning_s < 2 || warning_s > 120) throw new Error('Warning time must be 2–120 seconds.');
  if (!Array.isArray(direction_body) || direction_body.length !== 3 || !direction_body.every(Number.isFinite) || V(direction_body).length() < .001) throw new Error('Invalid approach direction.');
  if (start_body && (!Array.isArray(start_body) || start_body.length !== 3 || !start_body.every(Number.isFinite))) throw new Error('Invalid launch position.');
  if (start_world && (!Array.isArray(start_world) || start_world.length !== 3 || !start_world.every(Number.isFinite))) throw new Error('Invalid launch position.');
  if (start_world && start_body) throw new Error('Choose one launch coordinate frame.');
  // Bound memory without disabling the human disaster maker, even on wreckage.
  if (s.rocks.length >= 48) s.rocks.shift();
  demoNormalTime(s);
  const center = V(target.aimPoint ?? target.center), start = start_body ? V(start_body) : center.clone().addScaledVector(V(direction_body).normalize(), -(Math.max(12, speed_m_s * warning_s) + radius_m));
  const p = start_world ? V(start_world) : pointWorld(targetBody, start.toArray());
  const approach = pointWorld(targetBody, center.toArray()).sub(p);
  const travelTime = approach.length() / speed_m_s;
  approach.normalize();
  const rock = { id: s.nextId++, mass: mass_kg, radius: radius_m, p, v: targetBody.v.clone().addScaledVector(approach, speed_m_s), age: 0,
    ttl: Math.max(warning_s, travelTime) + 120, maxDistance: Math.max(25000, p.distanceTo(s.ship.p) * 2 + 100), contacts: new Map() };
  s.rocks.push(rock); s.revision++; s.epoch++;
  emit(s, { type: 'launch', text: `ROCK INBOUND · ${target.label} · ${mass_kg} kg · ${speed_m_s} m/s relative` });
  return rock;
}

/** Inverse of the local display scale; offset is in world axes, not target axes. */
export function launchDemoRockAtPointer(s, offsetFromShip, options = {}) {
  if (!Array.isArray(offsetFromShip) || offsetFromShip.length !== 3 || !offsetFromShip.every(Number.isFinite)) throw new Error('Invalid pointer position.');
  const start = modelOrigin(s.ship).add(V(offsetFromShip).divideScalar(DEMO_RENDER_SCALE));
  return launchDemoRock(s, { ...options, start_body: undefined, start_world: start.toArray() });
}

// Continuous sphere versus oriented box: conservative advancement of exact distance
// to the box. This avoids high-speed tunnelling and false corner hits of inflated AABBs.
function sweepBox(start, displacement, radius, half) {
  let t = 0;
  for (let i = 0; i < 40; i++) {
    const p = start.clone().addScaledVector(displacement, t);
    const closest = p.clone().clamp(half.clone().negate(), half);
    const normal = p.clone().sub(closest), distance = normal.length();
    if (distance <= radius + 1e-6) {
      if (distance < 1e-8) {
        const gaps = [half.x - Math.abs(p.x), half.y - Math.abs(p.y), half.z - Math.abs(p.z)];
        const axis = gaps.indexOf(Math.min(...gaps)); normal.set(0, 0, 0).setComponent(axis, Math.sign(p.getComponent(axis)) || 1);
      } else normal.divideScalar(distance);
      return { t, normal };
    }
    const closing = -normal.divideScalar(distance).dot(displacement);
    if (closing <= 1e-12) return null;
    t += (distance - radius) / closing;
    if (t > 1) return null;
  }
  return null;
}
function firstContact(s, rock, dt) {
  let best = null;
  for (const b of [s.ship, ...s.fragments]) {
    if ((rock.contacts.get(b) ?? -1) > s.elapsed) continue;
    const inv = b.q.clone().invert(), origin = modelOrigin(b);
    const start = rock.p.clone().sub(origin).applyQuaternion(inv);
    // Include target point's rotational velocity over this small physics step.
    const rel = rock.v.clone().sub(pointVelocity(b, rock.p)).multiplyScalar(dt).applyQuaternion(inv);
    for (const part of b.parts) for (const box of part.boxes) {
      const qb = new Quaternion().setFromAxisAngle(Z, box.angle);
      const qi = qb.clone().invert();
      const hit = sweepBox(start.clone().sub(V(box.center)).applyQuaternion(qi), rel.clone().applyQuaternion(qi), rock.radius, V(box.size).multiplyScalar(.5));
      if (hit && (!best || hit.t < best.t)) best = { ...hit, b, part, normal: hit.normal.applyQuaternion(qb).applyQuaternion(b.q) };
    }
  }
  return best;
}
function impulse(b, j, contact) {
  b.v.addScaledVector(j, 1 / b.mass);
  b.L.add(contact.clone().sub(b.p).cross(j));
}
function effectiveMass(b, rock, r, n) {
  return 1 / rock.mass + 1 / b.mass + tensorWorld(b, r.clone().cross(n), true).cross(r).dot(n);
}
function detach(s, part) {
  const b = s.ship, origin = modelOrigin(b), omega = angularVelocity(b);
  const fragment = body([part], origin, b.q, b.v);
  fragment.p.add(fragment.com.clone().applyQuaternion(b.q));
  fragment.v.copy(pointVelocity(b, fragment.p));
  fragment.L.copy(tensorWorld(fragment, omega));
  fragment.id = part.id;
  b.parts = b.parts.filter(p => p !== part);
  refreshMass(b, s.fuel);
  s.fragments.push(fragment); s.bonds[part.id].broken = true; s.bonds[part.id].health = 0; s.revision++;
  emit(s, { type: 'break', text: `STRUCTURAL FAILURE · ${part.label} detached · load exceeded attachment strength` });
}
function resolveContact(s, rock, hit) {
  const { b, part, normal: n } = hit;
  const point = rock.p.clone().addScaledVector(n, -rock.radius), r = point.clone().sub(b.p);
  const relative = rock.v.clone().sub(pointVelocity(b, point)), vn = relative.dot(n);
  if (vn >= 0) return;
  const inverseEffectiveMass = effectiveMass(b, rock, r, n);
  const absorbedJ = .5 * (1 - .15 ** 2) * vn ** 2 / inverseEffectiveMass;
  const j = n.clone().multiplyScalar(-(1 + .15) * vn / inverseEffectiveMass);
  const tangent = relative.clone().addScaledVector(n, -vn);
  if (tangent.lengthSq() > 1e-10) {
    const speed = tangent.length(); tangent.normalize();
    j.addScaledVector(tangent, -Math.min(.25 * j.length(), speed / effectiveMass(b, rock, r, tangent)));
  }
  rock.v.addScaledVector(j, 1 / rock.mass);
  impulse(b, j.clone().negate(), point);
  rock.contacts.set(b, s.elapsed + .03);
  rock.p.addScaledVector(n, .001);
  const force = j.clone().negate().divideScalar(part.contactSeconds).applyQuaternion(b.q.clone().invert());
  const contactLocal = point.clone().sub(modelOrigin(b)).applyQuaternion(b.q.clone().invert());
  const moment = contactLocal.clone().sub(V(part.center)).cross(force).length();
  const axial = force.dot(V(part.attachmentAxis ?? [0, 0, 1]).normalize());
  const shearPa = Math.sqrt(Math.max(0, force.lengthSq() - axial * axial)) / part.area;
  const normalPa = Math.abs(axial) / part.area + moment / part.section;
  const bond = s.bonds[part.id];
  const remainingStrength = .5 + .5 * bond.health / 100;
  const utilization = Math.hypot(shearPa / part.shearStrength, normalPa / part.tensileStrength) / remainingStrength;
  bond.peak = Math.max(bond.peak, utilization); bond.shearPa = shearPa; bond.normalPa = normalPa;
  const damage = 100 * (.07 * Math.max(0, utilization - .08) + .4 * absorbedJ / part.damageEnergyJ);
  bond.health = Math.max(0, bond.health - damage);
  if (damage > .05) {
    bond.marks.push({ point: contactLocal.toArray(), normal: n.clone().applyQuaternion(b.q.clone().invert()).toArray(), radius: Math.min(.9, .15 + Math.sqrt(damage) * .08) });
    if (bond.marks.length > 8) bond.marks.shift();
  }
  s.epoch++;
  s.lastImpact = { part: part.id, impulseNs: j.length(), utilization, relativeSpeed: relative.length(), time: s.elapsed, damage, absorbedJ };
  emit(s, { type: 'contact', text: `CONTACT · ${part.label} · ${j.length().toFixed(0)} N·s · ${(100 * utilization).toFixed(0)}% attachment capacity` });
  emit(s, { type: 'damage', text: `DAMAGE · ${part.label} · ${bond.health.toFixed(1)}% integrity · ${damageStage(bond)}` });
  // Yield causes repairable damage. Repeated damage or extreme overload separates a module.
  if (b === s.ship && (bond.health <= 0 || utilization >= 12)) detach(s, part);
}

export function damageStage(bond) {
  return bond.broken ? 'detached' : bond.health >= 99.95 ? 'intact' : bond.health >= 80 ? 'scuffed' : bond.health >= 50 ? 'damaged' : bond.health > 0 ? 'critical' : 'destroyed';
}
export function repairDemoPart(s, { arm_id, part_id, seconds = 10 }) {
  const mount = DEMO_ARM_MOUNTS[arm_id], bond = s.bonds[part_id];
  if (!mount || mount.part !== part_id || !bond || bond.broken || s.bonds[mount.part]?.broken || s.faults.includes('Robotic Arm Malfunction')) throw new Error('An attached arm can only repair its own attached module.');
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error('Repair duration must be 0–30 seconds.');
  if (s.repairs.some(r => r.arm_id === arm_id || r.part_id === part_id)) throw new Error('That arm or component already has a repair job.');
  if (bond.health >= 95 || s.battery <= 0) throw new Error('No repairable damage or battery power available.');
  demoNormalTime(s); s.epoch++;
  s.repairs.push({ arm_id, part_id, remaining: seconds, recovered: 0 });
  emit(s, { type: 'repair', text: `REPAIR STARTED · ${arm_id} servicing ${part_id}` });
}
export function protectDemoSolar(s, enabled) {
  s.solarProtection = Boolean(enabled); s.epoch++;
  emit(s, { type: 'energy', text: `SOLAR PROTECTION · ${enabled ? 'power isolated for maintenance' : 'charging restored'}` });
}
export function injectDemoFault(s, name) {
  if (!s.faults.includes(name)) s.faults.push(name);
  s.epoch++;
  emit(s, { type: 'fault', text: `DISASTER · ${name} injected` });
}

function integrate(b, dt) {
  b.p.addScaledVector(b.v, dt);
  const omega = angularVelocity(b), speed = omega.length();
  if (speed > 1e-12) b.q.premultiply(new Quaternion().setFromAxisAngle(omega.divideScalar(speed), speed * dt)).normalize();
}
function physicsStep(s, dt) {
  const b = s.ship;
  s.force.set(0, 0, 0); s.torque.set(0, 0, 0);
  if (s.burn && s.fuel > 0 && !s.faults.includes('Thruster Failure')) {
    const active = Math.min(dt, s.burn.remaining);
    const linear = s.burn.linear, main = b.parts.some(p => p.id === 'engine') && !s.faults.includes('Engine Failure');
    const rcs = s.bonds.spine?.broken ? 0 : .3 + .7 * (s.bonds.spine?.health ?? 100) / 100;
    const engine = .25 + .75 * (s.bonds.engine?.health ?? 100) / 100;
    const force = V([linear.x * 18000 * rcs, linear.y * 18000 * rcs, linear.z * (linear.z > 0 && main ? 40000 * engine : 18000 * rcs)]);
    const torque = s.burn.angular.clone().multiplyScalar(80000 * rcs);
    const isp = linear.z > 0 && main ? 450 : 230;
    const flow = force.length() / (isp * G0) + torque.length() / (8 * 230 * G0);
    const fraction = flow ? Math.min(1, s.fuel / (flow * active)) : 1;
    force.multiplyScalar(fraction * active / dt); torque.multiplyScalar(fraction * active / dt);
    s.force.copy(force.applyQuaternion(b.q)); s.torque.copy(torque.applyQuaternion(b.q));
    b.v.addScaledVector(s.force, dt / b.mass); b.L.addScaledVector(s.torque, dt);
    s.fuel = Math.max(0, s.fuel - flow * fraction * active);
    refreshMass(b, s.fuel);
  }
  if (s.burn) { s.burn.remaining -= dt; if (s.burn.remaining <= 1e-9) s.burn = null; }
  for (const rock of s.rocks) {
    const hit = firstContact(s, rock, dt);
    if (hit) {
      rock.p.addScaledVector(rock.v, hit.t * dt);
      // Contact point expressed at the body's beginning-of-step pose.
      rock.p.addScaledVector(hit.b.v, -hit.t * dt);
      resolveContact(s, rock, hit);
      rock.p.addScaledVector(hit.b.v, hit.t * dt);
      rock.p.addScaledVector(rock.v, (1 - hit.t) * dt);
    } else rock.p.addScaledVector(rock.v, dt);
    rock.age += dt;
  }
  integrate(b, dt);
  for (const f of s.fragments) integrate(f, dt);
  const count = s.rocks.length;
  s.rocks = s.rocks.filter(r => r.age < r.ttl && r.p.distanceTo(b.p) < r.maxDistance);
  if (s.rocks.length !== count) s.revision++;
  s.elapsed += dt;
  const solarHealth = ['solarLeft', 'solarRight'].reduce((n, id) => n + (s.bonds[id]?.health ?? 0), 0) / 200;
  if (!s.solarProtection && !s.faults.includes('Solar Panel Power Crisis')) s.battery = Math.min(100, s.battery + solarHealth * .03 * dt);
  for (const job of s.repairs) {
    const bond = s.bonds[job.part_id];
    if (bond.broken || s.faults.includes('Robotic Arm Malfunction') || s.battery <= 0) { job.remaining = 0; continue; }
    const amount = Math.max(0, Math.min(.8 * dt, 95 - bond.health, s.battery / .2));
    bond.health += amount; job.recovered += amount; s.battery -= amount * .2; job.remaining -= dt;
    if (job.remaining <= 0 || bond.health >= 95) { job.remaining = 0; emit(s, { type: 'repair', text: `REPAIR COMPLETE · ${job.part_id} · recovered ${job.recovered.toFixed(1)} integrity points` }); }
  }
  s.repairs = s.repairs.filter(j => j.remaining > 0);
}
/** Fast-forward is exact inertial coasting only. Encounters/burns switch to 120 Hz, 1x. */
export function advanceDemo(s, realSeconds) {
  if (!Number.isFinite(realSeconds) || realSeconds <= 0) return;
  if (s.timeScale > 1) {
    if (s.burn || s.repairs.length || s.rocks.length || s.fragments.length || angularVelocity(s.ship).length() > 1e-8) demoNormalTime(s);
    else { const dt = realSeconds * s.timeScale; integrate(s.ship, dt); s.elapsed += dt; return; }
  }
  s.accumulator += realSeconds;
  while (s.accumulator + 1e-10 >= H) { physicsStep(s, H); s.accumulator -= H; }
}
export function demoTelemetry(s) {
  const b = s.ship, nominal = s.initialPosition.clone().addScaledVector(s.initialVelocity, s.elapsed);
  return { speedM_s: b.v.length(), velocity: b.v.toArray(), position: modelOrigin(b).toArray(),
    angularVelocity: angularVelocity(b).toArray(), quaternion: b.q.toArray(), fuelKg: s.fuel,
    forceN: s.force.length(), massKg: b.mass, elapsed: s.elapsed, timeScale: s.timeScale,
    deltaV: b.v.distanceTo(s.initialVelocity), deviationM: b.p.distanceTo(nominal),
    mode: s.burn ? 'burn' : 'coast', detached: s.fragments.map(f => f.id), lastImpact: s.lastImpact,
    bonds: Object.entries(s.bonds).map(([id, value]) => ({ id, ...value, stage: damageStage(value) })),
    integrity: Object.values(s.bonds).reduce((sum, b) => sum + b.health, 0) / s.parts.length,
    battery: s.battery, repairs: s.repairs.map(j => ({ ...j })), solarProtection: s.solarProtection,
    arms: Object.entries(DEMO_ARM_MOUNTS).map(([id, m]) => ({ id, module: m.part, available: !s.bonds[m.part]?.broken, positionBody: m.position })),
    objects: [...s.rocks.map(r => ({ id: `rock-${r.id}`, p: r.p, v: r.v })), ...s.fragments.map(f => ({ id: f.id, p: f.p, v: f.v }))].map(o => {
      const relative = o.p.clone().sub(b.p), distance = relative.length();
      return { id: o.id, distanceM: distance, closingM_s: -o.v.clone().sub(b.v).dot(relative.normalize()) };
    }),
  };
}
