import { Curve, LineCurve3, Vector3 } from 'three';
import { CELESTIAL_BODIES, DAY, MAP_UNITS_PER_AU, METERS_PER_MAP_UNIT, planetMapPosition, planetState } from './celestial.js';

// A single current-epoch tangent loop is shared by the ship and the display.
// Planets move physically; the guided loop deforms with them, including its far-side caps.
const UP = new Vector3(0, 1, 0), TAU = Math.PI * 2;
export const GUIDANCE_SPEED_M_S = 7900;
export const GUIDANCE_SPEED = GUIDANCE_SPEED_M_S / METERS_PER_MAP_UNIT;
export const SUN_CLEARANCE = 110;
const BODIES = Object.fromEntries(CELESTIAL_BODIES.map(b => [b.name, b]));
export const parkingRadius = name => BODIES[name].radius + 14;

class DetourCurve extends Curve {
  constructor(start, end, bow) {
    super(); this.start = start; this.end = end; this.bow = bow; this.arcLengthDivisions = 160;
  }
  getPoint(t, out = new Vector3()) {
    return out.copy(this.start).lerp(this.end, t).addScaledVector(this.bow, 16*t*t*(1-t)**2);
  }
  getTangent(t, out = new Vector3()) {
    return out.copy(this.end).sub(this.start).addScaledVector(this.bow, 32*t*(1-t)*(1-2*t)).normalize();
  }
}

function transferCurve(start, finish, side) {
  const delta = finish.clone().sub(start), lengthSq = delta.lengthSq();
  const closest = start.clone().addScaledVector(delta, Math.max(0, Math.min(1, -start.dot(delta)/lengthSq)));
  if (closest.length() >= SUN_CLEARANCE) return new LineCurve3(start, finish);
  // Detour only when the direct leg meets the Sun, in the shared route plane.
  const away = side.clone().multiplyScalar(closest.dot(side) < 0 ? -1 : 1);
  let amount = Math.max(10, 2*(SUN_CLEARANCE-closest.length()));
  for (let attempt = 0; attempt < 20; attempt++) {
    const curve = new DetourCurve(start, finish, away.clone().multiplyScalar(amount));
    let nearest = Infinity;
    for (let i = 0; i <= 192; i++) nearest = Math.min(nearest, curve.getPoint(i/192).length());
    if (nearest >= SUN_CLEARANCE + .05) return curve;
    amount *= 1.4;
  }
  throw new Error('Unable to route around the Sun');
}

function cap(planet, center, first, last, normal) {
  let angle = Math.atan2(first.clone().cross(last).dot(normal), first.dot(last));
  if (angle <= 0) angle += TAU;
  const radius = parkingRadius(planet);
  return { type: 'arc', planet, center, radial: first, normal, angle, radius, length: radius*angle };
}

export function loopGeometry(time) {
  const earth = planetMapPosition('Earth', time), mars = planetMapPosition('Mars', time);
  const direction = mars.clone().sub(earth).normalize();
  // Parallel parking planes contain both centers, even with inclined planet orbits.
  const normal = UP.clone().addScaledVector(direction, -UP.dot(direction)).normalize();
  const side = direction.clone().cross(normal).normalize();
  const sine = (parkingRadius('Earth')-parkingRadius('Mars'))/earth.distanceTo(mars);
  const cosine = Math.sqrt(1-sine*sine);
  const outbound = side.clone().multiplyScalar(cosine).addScaledVector(direction, sine);
  const inbound = side.clone().multiplyScalar(-cosine).addScaledVector(direction, sine);
  const e0 = earth.clone().addScaledVector(outbound, parkingRadius('Earth'));
  const m0 = mars.clone().addScaledVector(outbound, parkingRadius('Mars'));
  const m1 = mars.clone().addScaledVector(inbound, parkingRadius('Mars'));
  const e1 = earth.clone().addScaledVector(inbound, parkingRadius('Earth'));
  const outwardCurve = transferCurve(e0, m0, side), inwardCurve = transferCurve(m1, e1, side.clone().negate());
  return { time, segments: [
    { type: 'leg', from: 'Earth', to: 'Mars', curve: outwardCurve, length: outwardCurve.getLength() },
    cap('Mars', mars, outbound, inbound, normal),
    { type: 'leg', from: 'Mars', to: 'Earth', curve: inwardCurve, length: inwardCurve.getLength() },
    cap('Earth', earth, inbound, outbound, normal),
  ] };
}

function geometryFor(mission, time) {
  if (mission.geometry?.time !== time) mission.geometry = loopGeometry(time);
  return mission.geometry;
}

function pointOnShape(shape, fraction, position = new Vector3(), tangent = new Vector3()) {
  if (shape.type === 'leg') {
    shape.curve.getPointAt(fraction, position); shape.curve.getTangentAt(fraction, tangent);
  } else {
    const radial = shape.radial.clone().applyAxisAngle(shape.normal, shape.angle*fraction);
    position.copy(shape.center).addScaledVector(radial, shape.radius);
    tangent.copy(shape.normal).cross(radial).normalize();
  }
  return { position, tangent };
}

function scheduledSegment(phase, startTime, geometryTime = startTime) {
  const shape = loopGeometry(geometryTime).segments[phase];
  const from = phase < 2 ? 'Earth' : 'Mars', to = phase < 2 ? 'Mars' : 'Earth';
  const duration = shape.length/GUIDANCE_SPEED;
  return { ...shape, phase, from, to, startTime, endTime: startTime+duration, duration };
}

export function planTransfer(from, to, startTime) {
  if (!((from === 'Earth' && to === 'Mars') || (from === 'Mars' && to === 'Earth'))) throw new Error('Unsupported mission leg');
  return scheduledSegment(from === 'Earth' ? 0 : 2, startTime);
}

export function guidancePoint(segment, time, position = new Vector3(), tangent = new Vector3(), geometry = null, travelTime = time) {
  const fraction = Math.max(0, Math.min(1, (travelTime-segment.startTime)/segment.duration));
  const shape = (geometry ?? loopGeometry(time)).segments[segment.phase];
  return { ...pointOnShape(shape, fraction, position, tangent), segment, fraction };
}

export function createMission() {
  return { segments: [planTransfer('Earth', 'Mars', 0)], geometry: null };
}

export function missionPoint(mission, time, position = new Vector3(), tangent = new Vector3(), travelTime = time) {
  if (!Number.isFinite(time) || time < 0) throw new Error('Invalid mission time');
  while (travelTime >= mission.segments.at(-1).endTime) {
    const previous = mission.segments.at(-1);
    mission.segments.push(scheduledSegment((previous.phase+1)%4, previous.endTime, time-Math.max(0,travelTime-previous.endTime)));
  }
  const index = mission.segments.findIndex(s => travelTime < s.endTime);
  return { ...guidancePoint(mission.segments[index], time, position, tangent, geometryFor(mission, time), travelTime), index };
}

/** Closed current-epoch Earth/Mars loop. Solid progress ends at the live guidance point. */
export function missionPath(mission, time, travelTime = time) {
  const point = missionPoint(mission, time, undefined, undefined, travelTime), geometry = geometryFor(mission, time);
  const planned = [], flown = [], phase = point.segment.phase;
  for (let j = 0; j < 4; j++) for (let i = 0; i <= 96; i++) {
    planned.push(pointOnShape(geometry.segments[j], i/96).position.toArray());
    if (j < phase) flown.push(pointOnShape(geometry.segments[j], i/96).position.toArray());
    else if (j === phase) flown.push(pointOnShape(geometry.segments[j], point.fraction*i/96).position.toArray());
    else flown.push(point.position.toArray());
  }
  return { planned, flown, index: point.index };
}

export function navigationState(voyage) {
  const travelTime=voyage.travelElapsed ?? voyage.mapElapsed;
  const point = missionPoint(voyage.mission, voyage.mapElapsed, undefined, undefined, travelTime), segment = point.segment;
  const target = segment.to;
  const fraction=voyage.physics.cruiseVelocity.length()/GUIDANCE_SPEED_M_S;
  const eta=fraction>0 ? Math.max(0,segment.endTime-travelTime)/fraction : null;
  const error=voyage.mapPosition.distanceTo(point.position), inOrbit=segment.type==='arc' && error<1;
  return { phase: segment.type === 'arc' ? `${target.toUpperCase()} ${inOrbit ? 'ORBIT' : 'PASS · OFF COURSE'}` : `${segment.from.toUpperCase()} → ${target.toUpperCase()}`,
    origin: segment.from, destination: target, in_orbit: inOrbit,
    arrival_time_s: eta===null ? null : voyage.mapElapsed+eta, eta_s: eta,
    target_position_map_units: planetMapPosition(target, voyage.mapElapsed).toArray(),
    map_position_au: voyage.mapPosition.clone().divideScalar(MAP_UNITS_PER_AU).toArray(),
    reference_position_map_units:point.position.toArray(),
    route_error_map_units:error, eta_is_reference:true,
    map_velocity_m_s: voyage.navigationBody?.velocity.toArray(),
    navigation_force_world_n: voyage.navigationBody?.force.toArray(),
    course_correction: voyage.physics.flightControl?.enabled ?? false,
    tracking_model:'Free integrated navigation body plus SI rigid-body disturbances. The route is a controller reference, not a pose constraint.',
    target_orbital_speed_km_s: planetState(target, voyage.mapElapsed).velocity.length()/1000,
    planned_arrival_map_units: guidancePoint(segment, eta===null ? voyage.mapElapsed : voyage.mapElapsed+eta, undefined, undefined, null, segment.endTime).position.toArray(),
    cruise_speed_km_s: voyage.physics.cruiseVelocity.length()/1000,
    transfer_days: segment.duration/DAY, progress: point.fraction };
}
