export const OUTER_DISASTERS = [
  'Asteroid Collision',
  'Black Hole Encounter',
  'Solar Storm',
  'Alien Encounter',
  'Thruster Failure',
  'Solar Panel Power Crisis',
];

export const INNER_DISASTERS = [
  'Oxygen Leak',
  'Spacecraft Fire',
  'AI System Malfunction',
  'Robotic Arm Malfunction',
  'Engine Failure',
];

/** Fixed values for now. Users can see them but not change them. */
export const DISASTER_PARAMETERS = { severity: 65, speed: 12, angle: 30 };

/** Demo response text shown in the log until the AI backend is connected. */
export function demoAiResponse(disaster) {
  if (disaster.includes('Solar')) return 'Reconfiguring power distribution';
  if (disaster.includes('Arm')) return 'Isolating affected joint';
  if (disaster.includes('Thruster')) return 'Compensating with available thrusters';
  return 'Initiating autonomous mitigation';
}
