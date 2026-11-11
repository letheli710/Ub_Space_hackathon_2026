import * as THREE from 'three';
import { advanceDemo, cloneDemoPhysics, createDemoPhysics, demoNormalTime, modelOrigin, setDemoTimeScale, spendDemoNavigationFuel, triggerDemoSolarStorm, DEMO_RENDER_SCALE } from '../simulation/demoPhysics.js';
import { STORM_MAX_RADIUS, STORM_WAVE_SPEED } from '../simulation/demoSystems.js';
import { CELESTIAL_BODIES, createSolarSystem, MAP_UNITS_PER_AU, planetMapPosition, updateSolarSystem } from '../simulation/celestial.js';
import { createMission, missionPoint, navigationState } from '../simulation/missionGuidance.js';
import { createFlightControl, localCourseError, navigationAuthority } from '../simulation/demoFlightControl.js';
import { advanceNavigationBody, createNavigationBody } from '../simulation/demoNavigation.js';

// Browser-only demo solar system. Orbit radii follow real distances from the Sun (in AU);
// planets are drawn much larger than real so they stay visible. The live map comes from the
// backend SDF and measured state, independently of this demo.
// Planet positions follow inclined Kepler ellipses; the Earth–Mars loop is a
// moving controller reference. Independent bodies integrate the actual flight.

/** World units per astronomical unit (Earth's orbit radius). */
export const AU = MAP_UNITS_PER_AU;
export const KM_PER_AU = 149597870.7;
const KM_PER_UNIT = KM_PER_AU / AU;
export const METERS_PER_MAP_UNIT = KM_PER_UNIT * 1000;
// Immutable catalog / epoch positions. Active positions are per voyage, never globals.
export const PLANETS = CELESTIAL_BODIES.map(body => ({ ...body, position: planetMapPosition(body.name, 0) }));

export const SUN = { position: new THREE.Vector3(0, 0, 0), radius: 70 };
export const EARTH = PLANETS[2];
export const MARS = PLANETS[3];
export const MOON = {
  name: 'Moon',
  position: EARTH.position.clone().add(new THREE.Vector3(34, 8, 40)),
  radius: 4.5,
};

// Far outside Neptune's orbit, in the lower-left corner of the system (about 40 AU out).
export const BLACK_HOLE_POSITION = new THREE.Vector3(-0.74, 0, 0.68).normalize().multiplyScalar(40 * AU);

const PARKING_ALTITUDE = 14; // how far above the surface the ship starts and stops

// Nearly straight Earth → Mars route, arched slightly upward and away from the Sun.
const middle = EARTH.position.clone().lerp(MARS.position, 0.5);
const bend = middle.clone().add(middle.clone().setY(0).normalize().multiplyScalar(60)).setY(90);
const start = EARTH.position
  .clone()
  .add(bend.clone().sub(EARTH.position).setLength(EARTH.radius + PARKING_ALTITUDE));
const end = MARS.position
  .clone()
  .add(bend.clone().sub(MARS.position).setLength(MARS.radius + PARKING_ALTITUDE));

export const ROUTE = new THREE.QuadraticBezierCurve3(start, bend, end);

// ---------- timing ----------
// The ship cruises at a constant 7.9 km/s along the route; the route length uses the real
// Earth–Mars distance in kilometres. The time scale speeds the mission up so it can be watched.

export const SHIP_SPEED_KMS = 7.9;
export const ROUTE_KM = ROUTE.getLength() * KM_PER_UNIT;
/** One Earth → Mars leg at cruise speed. */
export const LEG_SECONDS = ROUTE_KM / SHIP_SPEED_KMS;
export const LEG_DAYS = LEG_SECONDS / 86400;
/** Time spent in orbit before heading back (mission time). */
export const DWELL_SECONDS = 15 * 86400;

/** Time scale steps (mission seconds per real second) for the − / + buttons. */
export const TIME_SCALE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7];
export const DEFAULT_TIME_SCALE = 2e5;
export const MIN_TIME_SCALE = TIME_SCALE_STEPS[0];
export const MAX_TIME_SCALE = TIME_SCALE_STEPS[TIME_SCALE_STEPS.length - 1];

const trim = (n) => String(+n.toFixed(2));

/** 1000000 → "1Mx", 250000 → "250Kx", 5 → "5x". */
export function formatTimeScale(value) {
  if (value >= 1e6) return `${trim(value / 1e6)}Mx`;
  if (value >= 1e3) return `${trim(value / 1e3)}Kx`;
  return `${trim(value)}x`;
}

/**
 * Read a typed time scale such as "100000", "100K", "2.5M" or "1Mx".
 * Returns a number clamped to the allowed range, or null if it cannot be read.
 */
export function parseTimeScale(text) {
  const match = String(text)
    .trim()
    .replace(/[,\s_]/g, '')
    .replace(/[x×]$/i, '')
    .match(/^(\d*\.?\d+)([km]?)$/i);
  if (!match) return null;
  const value = Number(match[1]) * { '': 1, k: 1e3, m: 1e6 }[match[2].toLowerCase()];
  if (!Number.isFinite(value) || value <= 0) return null;
  return THREE.MathUtils.clamp(value, MIN_TIME_SCALE, MAX_TIME_SCALE);
}

/** Next step up (direction 1) or down (-1) from any value, even one between steps. */
export function stepTimeScaleValue(value, direction) {
  if (direction > 0) return TIME_SCALE_STEPS.find((step) => step > value) ?? MAX_TIME_SCALE;
  return [...TIME_SCALE_STEPS].reverse().find((step) => step < value) ?? MIN_TIME_SCALE;
}

/** Speed in km/s (0 while holding in orbit around a planet). */
export function shipSpeedKmS(voyage) {
  if (voyage.physics) return voyage.physics.ship.v.length() / 1000;
  return voyage.dwell > 0 ? 0 : SHIP_SPEED_KMS;
}

/** Days since leaving the current leg's origin planet. */
export function missionDay(voyage) {
  if (voyage.physics) return voyage.mapElapsed / 86400;
  return legProgress(voyage) * LEG_DAYS;
}

/** Mutable voyage state, advanced every animation frame. */
export function createVoyage({ physical = false } = {}) {
  const v = { progress: 0, direction: 1, dwell: 0, timeScale: DEFAULT_TIME_SCALE, solarStorm: null, displayElapsed: 0 };
  if (physical) {
    v.mission = createMission();
    v.solarSystem = createSolarSystem();
    v.navigationBody = createNavigationBody(v.mission);
    const direction = v.navigationBody.velocity.clone().normalize();
    v.physics = createDemoPhysics({ position: v.navigationBody.position.clone().multiplyScalar(METERS_PER_MAP_UNIT).toArray(), direction: direction.toArray() });
    // One safe physical clock from launch; only the astronomical navigation layer
    // is accelerated. Contacts and control responses never inherit map time warp.
    v.physics.timeScale = 1;
    v.physics.flightControl = createFlightControl(direction);
    v.mapPosition = modelOrigin(v.physics.ship).divideScalar(METERS_PER_MAP_UNIT);
    v.mapElapsed = 0;
    v.travelElapsed = 0;
    v.segment = 0;
    v.deviation = new THREE.Vector3();
    v.frame = new THREE.Quaternion(); // fixed inertial axes, never rotated to fit the route
    v.flightTrail = [v.mapPosition.toArray()]; v.trailTime = 0;
  }
  return v;
}

/** Map playback is independent of the safe 1x clock used for local encounters. */
export function setVoyageTimeScale(voyage, scale) {
  if (!Number.isFinite(scale) || scale < MIN_TIME_SCALE || scale > MAX_TIME_SCALE) throw new Error('Time scale must be between 1 and 10M.');
  // Once local physics has entered real time, it stays there until reset. Changing
  // the map display must never fast-forward a rock, burn, repair or AI reaction.
  if (voyage.physics?.timeScale > 1) setDemoTimeScale(voyage.physics, scale);
  voyage.timeScale = scale;
}

/** All nearby objects share the ship's map anchor and enlarged local meter scale. */
export function demoRenderPosition(voyage, physicalPoint) {
  return physicalPoint.clone().sub(voyage.physics.ship.p)
    .multiplyScalar(DEMO_RENDER_SCALE).applyQuaternion(voyage.frame).add(voyage.mapPosition);
}

/** Map orientation of a body whose physics orientation is `q`. */
export function demoRenderQuaternion(voyage, q, out = new THREE.Quaternion()) {
  return out.multiplyQuaternions(voyage.frame, q);
}

/** Convert an offset from the ship drawn on the map into the local physics axes. */
export function demoLocalOffset(voyage, offset) {
  return new THREE.Vector3(...offset).applyQuaternion(voyage.frame.clone().invert()).toArray();
}

/** Short label of the current phase, e.g. "EARTH → MARS" or "MARS ORBIT". */
export function voyagePhase(voyage) {
  if (voyage.mission) return navigationState(voyage).phase;
  return `${origin(voyage).toUpperCase()} → ${destination(voyage).toUpperCase()}`;
}

export function origin(voyage) {
  return voyage.direction === 1 ? EARTH.name : MARS.name;
}

export function destination(voyage) {
  return voyage.direction === 1 ? MARS.name : EARTH.name;
}

/** Share of the current leg completed, 0..1. */
export function legProgress(voyage) {
  return voyage.direction === 1 ? voyage.progress : 1 - voyage.progress;
}

/**
 * Advance the voyage by dtReal real seconds (scaled by the voyage's time scale).
 * Returns the last 'arrived' or 'departed' transition, otherwise null.
 * `progress` is the share of transfer time measured from Earth, so it moves at a steady rate.
 */
export function stepVoyage(voyage, dtReal) {
  if (voyage.physics) {
    const s = voyage.physics;
    const elapsed = s.elapsed, cruiseTime=s.cruiseElapsed;
    advanceDemo(s, dtReal);
    const dt = s.elapsed - elapsed;
    if (!(dt > 0)) return null; // paused: nothing moved
    const displayRatio = voyage.timeScale / s.timeScale;
    voyage.displayElapsed=(voyage.displayElapsed ?? 0)+dt/s.timeScale;
    const travelDuration=(s.cruiseElapsed-cruiseTime)*displayRatio;
    const powered=navigationAuthority(s).mode==='tracking';
    advanceNavigationBody(voyage.navigationBody,voyage.mission,{time:voyage.mapElapsed,travel:voyage.travelElapsed,
      duration:dt*displayRatio,travelDuration,physicalDuration:dt/s.timeScale,mass:s.ship.mass,
      forceLimit:18000*(.3+.7*(s.bonds.spine?.health ?? 100)/100),fuel:s.fuel,powered});
    spendDemoNavigationFuel(s,voyage.navigationBody.fuelUsed);
    // This is a change of the co-moving encounter reference, applied equally to
    // all nearby velocities by syncDemoSystems. It never erases impact delta-v.
    s.cruiseDirection.copy(voyage.navigationBody.velocity).normalize();
    s.flightControl.targetAttitude.setFromUnitVectors(new THREE.Vector3(0,0,1),s.cruiseDirection);
    // Enlarge disturbance displacement by the SAME meter scale as the ship and
    // rocks. A meter of impact drift must not disappear at astronomical scale.
    voyage.deviation.copy(localCourseError(s)).multiplyScalar(DEMO_RENDER_SCALE);
    voyage.mapPosition.copy(voyage.navigationBody.position).add(voyage.deviation);
    voyage.mapElapsed += dt * displayRatio;
    voyage.travelElapsed += travelDuration;
    updateSolarSystem(voyage.solarSystem, voyage.mapElapsed);
    const event=placeOnMission(voyage);
    voyage.trailTime+=dt/s.timeScale;
    if (voyage.trailTime>=.25 || voyage.mapPosition.distanceTo(new THREE.Vector3(...voyage.flightTrail.at(-1)))>1) {
      voyage.flightTrail.push(voyage.mapPosition.toArray()); voyage.trailTime=0;
      if (voyage.flightTrail.length>512) voyage.flightTrail.shift();
    }
    advanceSolarStorm(voyage,dt);
    return event;
  }
  let remaining = Math.max(dtReal, 0) * (voyage.timeScale ?? 1);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  let event = null;
  // Preserve elapsed mission time across transitions. At high acceleration,
  // discarding the remainder makes the route and hazard prediction frame-dependent.
  while (remaining > 0) {
    if (voyage.dwell > 0) {
      const elapsed = Math.min(remaining, voyage.dwell);
      voyage.dwell -= elapsed;
      remaining -= elapsed;
      if (voyage.dwell > 0) break;
      voyage.direction *= -1;
      event = 'departed';
    } else {
      const untilArrival = Math.max(0, (voyage.direction === 1 ? 1 - voyage.progress : voyage.progress) * LEG_SECONDS);
      const elapsed = Math.min(remaining, untilArrival);
      voyage.progress += voyage.direction * elapsed / LEG_SECONDS;
      remaining -= elapsed;
      if (elapsed < untilArrival) break;
      voyage.progress = voyage.direction === 1 ? 1 : 0;
      voyage.dwell = DWELL_SECONDS;
      event = 'arrived';
    }
  }
  return event;
}

/** Update the planned phase only. The body is never placed on that reference. */
function placeOnMission(voyage) {
  const point = missionPoint(voyage.mission, voyage.mapElapsed, undefined, undefined, voyage.travelElapsed);
  const previousDwell = voyage.dwell;
  voyage.segment = point.index % 4;
  const segment = point.segment;
  // Outbound leg and Mars orbit count as heading to Mars; the rest as heading home.
  voyage.direction = voyage.segment < 2 ? 1 : -1;
  voyage.dwell = segment.type === 'arc' && voyage.mapPosition.distanceTo(point.position)<1 ? Math.max(1,segment.endTime-voyage.travelElapsed) : 0;
  voyage.progress = segment.type === 'leg' ? (voyage.direction === 1 ? point.fraction : 1 - point.fraction) : voyage.direction === 1 ? 1 : 0;
  if (voyage.dwell>0 && previousDwell<=0) return 'arrived';
  return segment.type==='leg' && previousDwell>0 ? 'departed' : null;
}

/**
 * Forecast actual free flight/control after `seconds` playing physical seconds.
 * Outer disasters aim here, so an AI that changes course can make them miss.
 */
export function predictShipPosition(voyage, seconds, out) {
  if (voyage.physics) {
    const n=voyage.navigationBody;
    const future={...voyage,physics:cloneDemoPhysics(voyage.physics),mission:{segments: [...voyage.mission.segments],geometry:null},
      solarSystem:createSolarSystem(),solarStorm:voyage.solarStorm ? structuredClone(voyage.solarStorm) : null,
      navigationBody:{...n,position:n.position.clone(),velocity:n.velocity.clone(),force:n.force.clone()},
      deviation:voyage.deviation.clone(),frame:voyage.frame.clone(),mapPosition:voyage.mapPosition.clone(),
      flightTrail:voyage.flightTrail.map(p=>p.slice())};
    for (let t=0;t<seconds-1e-9;t+=1/60) stepVoyage(future,Math.min(1/60,seconds-t));
    return out.copy(future.mapPosition);
  }
  const future = { ...voyage };
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) {
    stepVoyage(future, Math.min(step, seconds - t));
  }
  shipPose(future, out);
  return out;
}

export function startVoyageSolarStorm(voyage, id) {
  demoNormalTime(voyage.physics);
  const storm={id,progress:{radius:SUN.radius,age:0,reached:false,done:false}};
  voyage.solarStorm=storm;
  return storm;
}
function advanceSolarStorm(voyage, dt) {
  const storm=voyage.solarStorm;
  if (!storm || storm.progress.done) return;
  const p=storm.progress;
  p.age+=dt; p.radius=SUN.radius+STORM_WAVE_SPEED*p.age;
  if (!p.reached && p.radius>=voyage.mapPosition.length()) { p.reached=true; triggerDemoSolarStorm(voyage.physics); }
  if (p.radius>=STORM_MAX_RADIUS) {
    p.done=true;
    voyage.physics.events.push({type:'storm_passed',time:voyage.physics.elapsed,text:'SOLAR STORM PASSED · subsystem outage timers continue independently'});
  }
}

/** Where the ship is along the route, 0 at Earth and 1 at Mars (constant speed). */
export function routeParameter(voyage) {
  return THREE.MathUtils.clamp(voyage.progress, 0, 1);
}

/** Ship position and heading on the route. */
export function shipPose(voyage, outPosition, outDirection) {
  if (voyage.physics) {
    outPosition.copy(voyage.mapPosition);
    if (outDirection) outDirection.set(0, 0, 1).applyQuaternion(voyage.physics.ship.q).applyQuaternion(voyage.frame);
    return outPosition;
  }
  const u = routeParameter(voyage);
  ROUTE.getPointAt(u, outPosition);
  if (outDirection) {
    ROUTE.getTangentAt(u, outDirection).multiplyScalar(voyage.direction).normalize();
  }
  return outPosition;
}
