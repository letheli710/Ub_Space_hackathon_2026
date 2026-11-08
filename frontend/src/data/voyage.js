import * as THREE from 'three';

// Browser-only demo solar system. Orbit radii follow real distances from the Sun (in AU);
// planets are drawn much larger than real so they stay visible. The live map comes from the
// backend SDF and measured state, independently of this demo.
// The Sun is at the origin, orbits lie on the y = 0 plane, and planets stay at their
// starting angles so the Earth → Mars route keeps lining up.

/** World units per astronomical unit (Earth's orbit radius). */
export const AU = 392;
export const KM_PER_AU = 149597870.7;
const KM_PER_UNIT = KM_PER_AU / AU;
const SIZE_SCALE = 2.5; // world units per pixel of planet size on the original map

// [name, color, size on the map, real orbit radius in AU, starting angle]
const LAYOUT = [
  ['Mercury', '#aeb9c2', 3.6, 0.387, 2.5],
  ['Venus', '#e3b77e', 6.3, 0.723, 4.2],
  ['Earth', '#3ca9fa', 7.3, 1.0, 1.1],
  ['Mars', '#dc7150', 5.2, 1.524, 5.4],
  ['Jupiter', '#d2aa80', 15, 5.203, 2.8],
  ['Saturn', '#d8c395', 12, 9.537, 1.6],
  ['Uranus', '#8ce7ed', 9, 19.19, 3.7],
  ['Neptune', '#588bdb', 9, 30.07, 5.7],
];

export const PLANETS = LAYOUT.map(([name, color, size, orbitAu, angle]) => {
  const orbit = orbitAu * AU;
  return {
    name,
    color,
    radius: size * SIZE_SCALE,
    orbit,
    position: new THREE.Vector3(Math.cos(angle) * orbit, 0, Math.sin(angle) * orbit),
  };
});

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
export const DEFAULT_TIME_SCALE = 1e6;
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
  return voyage.dwell > 0 ? 0 : SHIP_SPEED_KMS;
}

/** Days since leaving the current leg's origin planet. */
export function missionDay(voyage) {
  return legProgress(voyage) * LEG_DAYS;
}

/** Mutable voyage state, advanced every animation frame. */
export function createVoyage() {
  return { progress: 0, direction: 1, dwell: 0, timeScale: DEFAULT_TIME_SCALE };
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

/**
 * Where the ship will be after `seconds` real seconds if it keeps to the planned route.
 * Outer disasters aim here, so an AI that changes course can make them miss.
 */
export function predictShipPosition(voyage, seconds, out) {
  const future = { ...voyage };
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) {
    stepVoyage(future, Math.min(step, seconds - t));
  }
  shipPose(future, out);
  return out;
}

/** Where the ship is along the route, 0 at Earth and 1 at Mars (constant speed). */
export function routeParameter(voyage) {
  return THREE.MathUtils.clamp(voyage.progress, 0, 1);
}

/** Ship position and heading on the route. */
export function shipPose(voyage, outPosition, outDirection) {
  const u = routeParameter(voyage);
  ROUTE.getPointAt(u, outPosition);
  if (outDirection) {
    ROUTE.getTangentAt(u, outDirection).multiplyScalar(voyage.direction).normalize();
  }
  return outPosition;
}
