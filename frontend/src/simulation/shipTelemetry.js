export const SHIP_METRICS = [
  ['Hull Integrity', 'hull_integrity_pct'], ['Solar Panel Health', 'solar_panel_health_pct'],
  ['Battery Level', 'battery_level_pct'], ['Oxygen', 'oxygen_pct'], ['Thruster Efficiency', 'thruster_efficiency_pct'],
];

export function healthReadings(status) {
  return SHIP_METRICS.map(([label, key]) => ({ label, key,
    value: Number.isFinite(status?.metrics?.[key]) ? status.metrics[key] : null }));
}
