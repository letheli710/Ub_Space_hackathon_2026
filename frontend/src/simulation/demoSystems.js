export const SUBSYSTEM_IDS = ['propelling', 'energy', 'robot_arms'];
export const ENERGY_PARTS = ['solar', 'solarRight', 'solarLeft'];
export const STORM_OUTAGE_SECONDS = 15;
export const STORM_WAVE_SPEED = 160;
export const STORM_MAX_RADIUS = 1500;

export function propulsionIntegrity(s) {
  return s.bonds.engine?.broken ? 0 : Math.max(0, Math.min(100, s.bonds.engine?.health ?? 100));
}
export function energyIntegrity(s) {
  const parts = ENERGY_PARTS.filter(id => s.bonds[id]);
  return parts.length ? parts.reduce((sum, id) => sum + (s.bonds[id].broken ? 0 : Math.max(0, Math.min(100, s.bonds[id].health))), 0) / parts.length : 100;
}
export function subsystemStates(s) {
  const integrity = energyIntegrity(s), cuts = Math.min(3, Math.floor((100-integrity+1e-8)/25));
  const result = { main_judging: { mode: 'online', reason: 'Main Judging remains online', remaining_s: 0 } };
  for (const [index, id] of SUBSYSTEM_IDS.entries()) {
    const remaining = Math.max(0, (s.stormUntil?.[id] ?? 0)-s.elapsed);
    const fault = id === 'robot_arms' && s.faults.includes('Robotic Arm Malfunction');
    const powerLost = index < cuts;
    result[id] = remaining > 1e-8 ? { mode: 'offline', reason: 'Solar storm outage', remaining_s: remaining } :
      fault ? { mode: 'offline', reason: 'Robotic Arm Malfunction', remaining_s: 0 } :
      powerLost && id === 'robot_arms' ? { mode: 'emergency', reason: 'Emergency power for energy-component repairs only', remaining_s: 0 } :
      powerLost ? { mode: 'offline', reason: `Energy integrity ${integrity.toFixed(1)}% · repair energy components to restore power`, remaining_s: 0 } :
      { mode: 'online', reason: '', remaining_s: 0 };
  }
  return result;
}
export function mayRepair(s, partId) {
  const mode = subsystemStates(s).robot_arms.mode;
  return mode === 'online' || (mode === 'emergency' && ENERGY_PARTS.includes(partId));
}
