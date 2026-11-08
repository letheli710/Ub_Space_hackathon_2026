import { Vector3 } from 'three';

// Fixed two-body ellipses initialized from JPL's J2000 elements + rates at our epoch.
// https://ssd.jpl.nasa.gov/planets/approx_pos.html (Table 1)
// https://ssd.jpl.nasa.gov/astro_par.html (SI AU and DE440 gravitational parameters)
export const AU_METERS = 149597870700;
export const MAP_UNITS_PER_AU = 392;
export const METERS_PER_MAP_UNIT = AU_METERS / MAP_UNITS_PER_AU;
export const DAY = 86400;
export const SUN_GM = 1.32712440041279419e20;
export const SOLAR_EPOCH = '2026-11-08T12:00:00.000Z';
const centuries = (Date.parse(SOLAR_EPOCH) - Date.parse('2000-01-01T12:00:00.000Z')) / (36525 * DAY * 1000);
const RAD = Math.PI / 180, TAU = Math.PI * 2;
// name, color, drawn radius, GM in km³/s², rotation hours, axial tilt degrees;
// followed by a,e,I,L,longitude of perihelion,node and their per-century rates.
const DATA = [
  ['Mercury', '#aeb9c2', 9, 22031.868551, 1407.6, .034,
    [.38709927, .20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    [.00000037, .00001906, -.00594749, 149472.67411175, .16047689, -.12534081]],
  ['Venus', '#e3b77e', 15.75, 324858.592, -5832.5, 2.6,
    [.72333566, .00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    [.00000390, -.00004107, -.00078890, 58517.81538729, .00268329, -.27769418]],
  ['Earth', '#3ca9fa', 18.25, 398600.435507, 23.9345, 23.44,
    [1.00000261, .01671123, -.00001531, 100.46457166, 102.93768193, 0],
    [.00000562, -.00004392, -.01294668, 35999.37244981, .32327364, 0]],
  ['Mars', '#dc7150', 13, 42828.375816, 24.6229, 25.19,
    [1.52371034, .09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [.00001847, .00007882, -.00813131, 19140.30268499, .44441088, -.29257343]],
  ['Jupiter', '#d2aa80', 37.5, 126712764.1, 9.925, 3.13,
    [5.20288700, .04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-.00011607, -.00013253, -.00183714, 3034.74612775, .21252668, .20469106]],
  ['Saturn', '#d8c395', 30, 37940584.8418, 10.7, 26.73,
    [9.53667594, .05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-.00125060, -.00050991, .00193609, 1222.49362201, -.41897216, -.28867794]],
  ['Uranus', '#8ce7ed', 22.5, 5794556.4, -17.2, 82.2,
    [19.18916464, .04725744, .77263783, 313.23810451, 170.95427630, 74.01692503],
    [-.00196176, -.00004397, -.00242939, 428.48202785, .40805281, .04240589]],
  ['Neptune', '#588bdb', 22.5, 6836527.10058, 16.1, 28.32,
    [30.06992276, .00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [.00026291, .00005105, .00035372, 218.45945325, -.32241464, -.00508664]],
];

export function solveKepler(meanAnomaly, eccentricity) {
  if (!Number.isFinite(meanAnomaly) || !(eccentricity >= 0 && eccentricity < 1)) throw new Error('Invalid elliptic orbit');
  const m = ((meanAnomaly + Math.PI) % TAU + TAU) % TAU - Math.PI;
  let e = m;
  for (let i = 0; i < 20; i++) {
    const correction = (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e));
    e -= correction;
    if (Math.abs(correction) < 1e-13) break;
  }
  return e;
}

function orbitBasis(inclination, perihelion, node) {
  const i = inclination * RAD, w = (perihelion - node) * RAD, o = node * RAD;
  const c = Math.cos, s = Math.sin;
  // Ecliptic (x,y,z) → right-handed Three.js Y-up (x,z,-y).
  return [new Vector3(c(w)*c(o)-s(w)*s(o)*c(i), s(w)*s(i), -c(w)*s(o)-s(w)*c(o)*c(i)),
    new Vector3(-s(w)*c(o)-c(w)*s(o)*c(i), c(w)*s(i), s(w)*s(o)-c(w)*c(o)*c(i))];
}

export const CELESTIAL_BODIES = DATA.map(([name, color, radius, gm, rotationHours, tilt, base, rate]) => {
  const [a, e, i, l, peri, node] = base.map((v, k) => v + rate[k] * centuries);
  const meanMotion = Math.sqrt((SUN_GM + gm * 1e9) / (a * AU_METERS) ** 3);
  return { name, color, radius, gm: gm * 1e9, rotationHours, tilt: tilt * RAD,
    a: a * AU_METERS, e, meanAnomaly: (l - peri) * RAD, meanMotion,
    period: TAU / meanMotion, basis: orbitBasis(i, peri, node), orbit: a * MAP_UNITS_PER_AU };
});
const CATALOG = Object.fromEntries(CELESTIAL_BODIES.map(body => [body.name, body]));

export function planetState(name, elapsed, position = new Vector3(), velocity = new Vector3()) {
  if (!Number.isFinite(elapsed)) throw new Error('Invalid celestial time');
  const body = CATALOG[name];
  if (!body) throw new Error('Unknown celestial body');
  const anomaly = solveKepler(body.meanAnomaly + body.meanMotion * elapsed, body.e);
  const c = Math.cos(anomaly), s = Math.sin(anomaly), minor = Math.sqrt(1 - body.e ** 2);
  const rate = body.meanMotion / (1 - body.e * c), [p, q] = body.basis;
  position.copy(p).multiplyScalar(body.a * (c - body.e)).addScaledVector(q, body.a * minor * s);
  velocity.copy(p).multiplyScalar(-body.a * s * rate).addScaledVector(q, body.a * minor * c * rate);
  return { position, velocity, body };
}

export function planetMapPosition(name, elapsed, out = new Vector3()) {
  return planetState(name, elapsed, out).position.divideScalar(METERS_PER_MAP_UNIT);
}

export function orbitalPath(name, count = 256) {
  const body = CATALOG[name], [p, q] = body.basis;
  return Array.from({ length: count + 1 }, (_, i) => {
    const e = i / count * TAU;
    return p.clone().multiplyScalar(body.a * (Math.cos(e) - body.e))
      .addScaledVector(q, body.a * Math.sqrt(1 - body.e ** 2) * Math.sin(e)).divideScalar(METERS_PER_MAP_UNIT);
  });
}

// Simplified inclined lunar ellipse, with NASA's 27.3217-day sidereal period.
// Lunar distance is enlarged ONLY for drawing, so it clears the enlarged Earth.
export const MOON_PERIOD = 27.3217 * DAY;
const MOON_A = 384400000, MOON_E = .0549, MOON_BASIS = orbitBasis(5.145, 0, 0);
export function moonState(elapsed) {
  const earth = planetState('Earth', elapsed), e = solveKepler(elapsed * TAU / MOON_PERIOD, MOON_E);
  const relative = MOON_BASIS[0].clone().multiplyScalar(MOON_A * (Math.cos(e) - MOON_E))
    .addScaledVector(MOON_BASIS[1], MOON_A * Math.sqrt(1 - MOON_E ** 2) * Math.sin(e));
  return { position: earth.position.clone().add(relative), relative,
    mapPosition: earth.position.clone().divideScalar(METERS_PER_MAP_UNIT).addScaledVector(relative, 52 / MOON_A) };
}

export function createSolarSystem() {
  const system = { planets: Object.fromEntries(CELESTIAL_BODIES.map(b => [b.name,
    { ...b, position: new Vector3(), velocity: new Vector3(), mapPosition: new Vector3(), rotation: 0 }])),
    moon: { mapPosition: new Vector3(), position: new Vector3(), rotation: 0 }, elapsed: 0 };
  return updateSolarSystem(system, 0);
}

export function updateSolarSystem(system, elapsed) {
  for (const planet of Object.values(system.planets)) {
    planetState(planet.name, elapsed, planet.position, planet.velocity);
    planet.mapPosition.copy(planet.position).divideScalar(METERS_PER_MAP_UNIT);
    planet.rotation = (TAU * elapsed / (planet.rotationHours * 3600)) % TAU;
  }
  const moon = moonState(elapsed);
  system.moon.position.copy(moon.position); system.moon.mapPosition.copy(moon.mapPosition);
  system.moon.rotation = (TAU * elapsed / MOON_PERIOD) % TAU;
  system.elapsed = elapsed;
  return system;
}

export const celestialDate = elapsed => new Date(Date.parse(SOLAR_EPOCH) + elapsed * 1000).toISOString();
