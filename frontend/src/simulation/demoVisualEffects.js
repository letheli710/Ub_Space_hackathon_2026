import { DEMO_ARM_MOUNTS } from './demoShip.js';
import { mayRepair, propulsionIntegrity, subsystemStates } from './demoSystems.js';
import { navigationAuthority } from './demoFlightControl.js';

// Rendering cues only: they do not apply forces, spend fuel, or advance a repair.
// Read current state each frame so a paused scene freezes and outages act immediately.
export function readDemoThrusterEffect(s, out = {}) {
  const integrity = propulsionIntegrity(s) / 100;
  const mainBurn = Math.max(0, s.burn?.linear.z ?? 0);
  const cruise = !s.flightControl || navigationAuthority(s).mode === 'tracking';
  const powered = (cruise || mainBurn>0) && integrity > 0 && s.fuel > 0 && s.ship.parts.some(p => p.id === 'engine') &&
    subsystemStates(s).propelling.mode === 'online' &&
    !s.faults.includes('Engine Failure') && !s.faults.includes('Thruster Failure');
  const boost = mainBurn;
  out.active = powered;
  // A restrained cruise plume makes the guided cruise visible; an actual main burn flares it.
  out.strength = powered ? integrity * (.42 + .58 * boost) : 0;
  out.time = s.elapsed;
  return out;
}

export function readDemoRepairEffect(s, armId, out = {}) {
  const job = s.repairs.find(j => j.arm_id === armId && j.status === 'holding');
  out.active = Boolean(job && !s.bonds[DEMO_ARM_MOUNTS[armId]?.part]?.broken && mayRepair(s, job.part_id));
  out.time = job?.contactSeconds ?? 0;
  return out;
}
