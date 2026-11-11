import { Vector3 } from 'three';
import { commandDemoBurn, demoTelemetry, protectDemoSolar, repairDemoPart } from './demoPhysics.js';
import { destination, origin, voyagePhase } from '../data/voyage.js';
import { celestialDate, SOLAR_EPOCH } from './celestial.js';
import { navigationState } from './missionGuidance.js';
import { armMount, repairContactPlans } from './demoArmKinematics.js';
import { ENERGY_PARTS, mayRepair, subsystemStates } from './demoSystems.js';

// Conservative constant-attitude prediction, not a promise of collision avoidance.
// The 26 m envelope covers the current ship and its arms. Real contacts use boxes.
function closestApproach(s, rock, acceleration = new Vector3(), duration = 0) {
  const r = rock.p.clone().sub(s.ship.p), v = rock.v.clone().sub(s.ship.v);
  let best = Infinity, time = 0;
  const horizon = Math.min(120, Math.max(0, -r.dot(v) / Math.max(v.lengthSq(), 1e-9)) + 20);
  for (let t = 0; t <= horizon; t += .25) {
    const burn = Math.min(t, duration);
    const distance = r.clone().addScaledVector(v, t).addScaledVector(acceleration, -(.5 * burn * burn + burn * (t - burn))).length();
    if (distance < best) { best = distance; time = t; }
  }
  return { closest_in_s: time, clearance_m: best - 26 - rock.radius };
}
export function buildDemoObservation(s, voyage = null) {
  const telemetry = demoTelemetry(s), inv = s.ship.q.clone().invert();
  const systems=subsystemStates(s);
  const threats = s.rocks.map(r => ({ id: `rock-${r.id}`, radius_m: r.radius, mass_kg: r.mass,
    relative_position_body_m: r.p.clone().sub(s.ship.p).applyQuaternion(inv).toArray(),
    relative_velocity_body_m_s: r.v.clone().sub(s.ship.v).applyQuaternion(inv).toArray(), ...closestApproach(s, r) }));
  const options = [];
  if (systems.propelling.mode==='online' && s.fuel > 0 && !s.faults.includes('Thruster Failure') && !s.bonds.spine?.broken) {
    const rcs = .3 + .7 * (s.bonds.spine?.health ?? 100) / 100;
    for (const [axis, linear] of [['right', [1, 0, 0]], ['left', [-1, 0, 0]], ['up', [0, 1, 0]], ['down', [0, -1, 0]], ['forward', [0, 0, 1]], ['reverse', [0, 0, -1]]]) for (const seconds of [4, 8, 10]) {
      const main = axis === 'forward' && !s.bonds.engine?.broken && !s.faults.includes('Engine Failure');
      const force = main ? 40000 * (.25 + .75 * s.bonds.engine.health / 100) : 18000 * rcs;
      const acceleration = new Vector3(...linear).applyQuaternion(s.ship.q).multiplyScalar(force / s.ship.mass);
      const predictions = s.rocks.map(r => closestApproach(s, r, acceleration, seconds));
      options.push({ id: `burn_${axis}_${seconds}`, owner: 'propelling',
        action: { type: 'burn', linear, angular: [0, 0, 0], seconds },
        prediction: { minimum_clearance_m: predictions.length ? Math.min(...predictions.map(p => p.clearance_m)) : null,
          delta_v_m_s: force * seconds / s.ship.mass, fuel_kg: force * seconds / ((main ? 450 : 230) * 9.80665),
          caution: 'Assumes immediate start and constant attitude. Delayed execution or rotation reduces confidence.' } });
    }
  }
  for (const part of s.parts) {
    const bond=s.bonds[part.id];
    if ((!bond.broken && bond.health>=95) || !mayRepair(s,part.id) || s.repairs.some(j=>j.part_id===part.id)) continue;
    if ((s.battery<1.6 || systems.robot_arms.mode==='emergency') && !(ENERGY_PARTS.includes(part.id) && s.emergencyBattery>=1.6)) continue;
    const plan=repairContactPlans(s,part.id)[0];
    if (!plan) continue;
    options.push({id:`repair_${part.id}`,owner:'robot_arms',action:{type:'repair',arm_id:plan.arm_id,part_id:part.id,seconds:10},
      prediction:{rebuild:bond.broken,recoverable_points:bond.broken ? 100 : Math.min(8,95-bond.health),battery_cost:1.6,
        critical_energy_repair:ENERGY_PARTS.includes(part.id),target_position_body_m:plan.target,
        arm_mount_body_m:armMount(plan.arm_id,s.armPoses[plan.arm_id]).position.toArray(),contact_seconds:10,
        effect:bond.broken ? 'Surviving arm touches the missing mount for 10 continuous seconds, then recreates the component. Old debris remains.' : 'Move the arm tool to the repair socket, hold contact for 10 seconds, then restore integrity.'}});
  }
  if (systems.energy.mode==='online') {
  options.push({ id: 'solar_isolate', owner: 'energy', action: { type: 'solar_protection', enabled: true }, prediction: { effect: 'Isolate panel generation for maintenance; charging stops. Does not prevent kinetic impacts.' } });
  options.push({ id: 'solar_restore', owner: 'energy', action: { type: 'solar_protection', enabled: false }, prediction: { effect: 'Restore charging from surviving wings.' } });
  }
  return { run_id: s.runId, epoch: s.epoch, sim_time_s: s.elapsed,
    telemetry: { ...telemetry, bonds: telemetry.bonds.map(({ marks, ...b }) => b),
      ...(voyage ? { navigation: {
        ...navigationState(voyage),
        phase: voyagePhase(voyage), origin: origin(voyage), destination: destination(voyage),
        in_orbit: voyage.dwell > 0, mission_time_s: voyage.mapElapsed, map_time_scale: voyage.timeScale,
        map_position_units: voyage.mapPosition.toArray(), physics_to_map_quaternion: voyage.frame.toArray(),
        guidance: 'The Earth-Mars tangent loop is a reference for a free integrated navigation body. Impacts and burns visibly displace the rigid body. Routine bounded course/attitude corrections are directly authorized for Propelling, without a Main Judging proposal or model call; they stop during propulsion outages and yield to deliberate/evasive maneuvers. Catalog collision-avoidance burns still require Main Judging. Encounters use the physical clock, independently of map time.',
      }, solar_system: {
        model: 'Fixed Kepler ellipses initialized from JPL elements; guided spacecraft transfers are not ballistic gravity solutions.',
        epoch: SOLAR_EPOCH, date: celestialDate(voyage.mapElapsed),
        coordinate_frame: 'Heliocentric SI, right-handed Y-up: x=ecliptic x, y=ecliptic z, z=-ecliptic y. Separate from the local encounter frame.',
        planets: Object.values(voyage.solarSystem.planets).map(p => ({ name: p.name,
          position_m: p.position.toArray(), velocity_m_s: p.velocity.toArray() })),
      } } : {}) },
    coordinate_frame: 'ship body: +Z nose/forward, +Y up, +X right. Translation and attitude are independent.',
    active_faults: [...s.faults], threats, options };
}

/** Only the server's judged selection can pass this path. Revalidate local state
 * and match actions to the original catalog; never run arbitrary model JSON. */
export function executeDemoDecision(s, observation, decision) {
  if (!decision || decision.run_id !== observation.run_id || s.runId !== observation.run_id || s.epoch !== observation.epoch) throw new Error('DEMO changed during analysis; request a fresh judgement.');
  s.consumedDecisions ??= new Set();
  if (!decision.id || s.consumedDecisions.has(decision.id)) throw new Error('Decision was already consumed.');
  if (!Array.isArray(decision.approved_options)) throw new Error('Invalid Main Judging decision.');
  const age = s.elapsed - observation.sim_time_s;
  if (age < 0 || age > 90) throw new Error('Decision expired.');
  const current = buildDemoObservation(s), available = new Map(current.options.map(o => [o.id, o]));
  const seen = new Set(), resources = new Set(), arms = new Set();
  const actions = decision.approved_options.map(id => {
    const original = observation.options.find(o => o.id === id), now = available.get(id);
    if (seen.has(id) || !original || !now || JSON.stringify(original.action) !== JSON.stringify(now.action)) throw new Error('Invalid or unavailable approved action.');
    seen.add(id);
    const resource = now.action.type === 'repair' ? `repair:${now.action.part_id}` : now.owner;
    if (resources.has(resource)) throw new Error('Conflicting combined actions.');
    resources.add(resource);
    if (now.action.type==='repair') {
      if (arms.has(now.action.arm_id)) throw new Error('Conflicting repairs use the same arm.');
      arms.add(now.action.arm_id);
    }
    // Do not execute an old burn on an impact trajectory after its safe window.
    if (now.owner === 'propelling' && observation.threats.some(t => t.clearance_m < 0) && (!current.threats.some(t => t.clearance_m < 0 && t.closest_in_s > 0) || now.prediction.minimum_clearance_m < 2)) throw new Error('The approved maneuver no longer clears the threat; request a fresh judgement.');
    return now.action;
  });
  s.consumedDecisions.add(decision.id);
  if (s.consumedDecisions.size > 100) s.consumedDecisions.delete(s.consumedDecisions.values().next().value);
  for (const action of actions) {
    if (action.type === 'burn') commandDemoBurn(s, action);
    else if (action.type === 'repair') repairDemoPart(s, action);
    else protectDemoSolar(s, action.enabled);
  }
  s.events.push({ type: 'ai', time: s.elapsed, text: `MAIN JUDGING · executed ${actions.length} approved DEMO action(s) · ${decision.summary}` });
  return actions;
}
