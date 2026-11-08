import * as THREE from 'three';

// Stylized solar system laid out like the Planetary Trajectories map
// (public/planetary-trajectories.html): same planet order, colors, relative sizes,
// orbit spacing and starting angles. The Sun is at the origin and orbits lie on the y = 0 plane.
// Planets stay at their starting angles here so the Earth → Mars route keeps lining up.

const SYSTEM_SCALE = 1000; // world units for an orbit ratio of 1 on the map
const SIZE_SCALE = 2.5; // world units per pixel of planet size on the map

// [name, color, size on the map, starting angle]
const LAYOUT = [
  ['Mercury', '#aeb9c2', 3.6, 2.5],
  ['Venus', '#e3b77e', 6.3, 4.2],
  ['Earth', '#3ca9fa', 7.3, 1.1],
  ['Mars', '#dc7150', 5.2, 5.4],
  ['Jupiter', '#d2aa80', 15, 2.8],
  ['Saturn', '#d8c395', 12, 1.6],
  ['Uranus', '#8ce7ed', 9, 3.7],
  ['Neptune', '#588bdb', 9, 5.7],
];

export const PLANETS = LAYOUT.map(([name, color, size, angle], i) => {
  const orbit = SYSTEM_SCALE * (0.16 + i * 0.116);
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

// Distances shown to the player use Earth's orbit as 1 AU (map scale, not real scale).
export const AU = EARTH.orbit;

// Far outside the planets in the lower-left corner, same place as on the Planetary Trajectories map.
export const BLACK_HOLE_POSITION = new THREE.Vector3(-2.4 * SYSTEM_SCALE, 0, 2.2 * SYSTEM_SCALE);

const PARKING_ALTITUDE = 14; // how far above the surface the ship starts and stops
export const LEG_SECONDS = 60; // one-way trip at 1× speed
export const DWELL_SECONDS = 3; // pause in orbit before heading back

// The route curves through the same control point as the map's mission route.
const bend = new THREE.Vector3(0, 160, -0.78 * SYSTEM_SCALE);
const start = EARTH.position
  .clone()
  .add(bend.clone().sub(EARTH.position).setLength(EARTH.radius + PARKING_ALTITUDE));
const end = MARS.position
  .clone()
  .add(bend.clone().sub(MARS.position).setLength(MARS.radius + PARKING_ALTITUDE));

export const ROUTE = new THREE.QuadraticBezierCurve3(start, bend, end);

/** Mutable voyage state, advanced every animation frame. */
export function createVoyage() {
  return { progress: 0, direction: 1, dwell: 0 };
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
 * Advance the voyage by dt seconds. Returns 'arrived' or 'departed' when a leg ends or a
 * new one starts, otherwise null.
 */
export function stepVoyage(voyage, dt) {
  if (voyage.dwell > 0) {
    voyage.dwell -= dt;
    if (voyage.dwell > 0) return null;
    voyage.dwell = 0;
    voyage.direction *= -1;
    return 'departed';
  }
  voyage.progress += (voyage.direction * Math.max(dt, 0)) / LEG_SECONDS;
  const arrived =
    voyage.direction === 1 ? voyage.progress >= 1 : voyage.progress <= 0;
  voyage.progress = THREE.MathUtils.clamp(voyage.progress, 0, 1);
  if (arrived) {
    voyage.dwell = DWELL_SECONDS;
    return 'arrived';
  }
  return null;
}

/**
 * Where the ship will be after `seconds` if it keeps to the planned route.
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

/** Ship position and heading on the route. Eases in and out near each planet. */
export function shipPose(voyage, outPosition, outDirection) {
  const p = voyage.progress;
  const u = p * p * (3 - 2 * p);
  ROUTE.getPointAt(u, outPosition);
  if (outDirection) {
    ROUTE.getTangentAt(u, outDirection).multiplyScalar(voyage.direction).normalize();
  }
  return outPosition;
}
