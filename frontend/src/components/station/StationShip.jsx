import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import {
  CargoPod,
  CommandModule,
  EngineSection,
  HabModule,
  NodeModule,
  RingModule,
  SolarArrays,
  SpineTruss,
} from './modules.jsx';

// Modular station ship, about 38 units long (nose +Z, engines −Z) with a 21-unit ring.
// Each module can be swapped independently; every arm is listed in ARMS.

export const ARMS = [
  { id: 'command', label: 'Command module' },
  { id: 'hab', label: 'Habitation module' },
  { id: 'node', label: 'Junction node' },
  { id: 'cargo', label: 'Cargo pod' },
  { id: 'ringHub', label: 'Ring hub' },
  { id: 'ringRailA', label: 'Ring rail arm A', rail: true },
  { id: 'ringRailB', label: 'Ring rail arm B', rail: true, phaseOf: 'ringRailA' },
  { id: 'solarLeft', label: 'Solar wing (left)' },
  { id: 'solarRight', label: 'Solar wing (right)' },
  { id: 'engine', label: 'Engine section' },
];

export const MODULES = [
  { id: 'command', label: 'Command module', component: CommandModule, explode: [0, 0, 8] },
  { id: 'hab', label: 'Habitation module', component: HabModule, explode: [0, 0, 4.5] },
  { id: 'node', label: 'Junction node', component: NodeModule, explode: [0, 0, 1.5] },
  { id: 'cargo', label: 'Cargo pod', component: CargoPod, explode: [0, -4, 0] },
  { id: 'spine', label: 'Spine truss', component: SpineTruss, explode: [0, 0, 0] },
  { id: 'ring', label: 'Rotating ring', component: RingModule, explode: [0, 0, -1.5] },
  { id: 'solar', label: 'Solar arrays & radiators', component: SolarArrays, explode: [0, 4, -2] },
  { id: 'engine', label: 'Engine section', component: EngineSection, explode: [0, 0, -8] },
];

const HOME = new THREE.Vector3();

/** Slides its module out to `offset` when exploded and back when assembled. */
function Explodable({ offset, exploded, children }) {
  const ref = useRef();
  const target = useRef(new THREE.Vector3(...offset));
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.position.lerp(exploded ? target.current : HOME, 1 - Math.exp(-delta * 4));
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * @param exploded    pull the modules apart to show how the ship is built
 * @param ringSpin    turn the habitat ring
 * @param animateArms idle motion for arms without a manual pose
 * @param armPoses    { [armId]: { yaw, shoulder, elbow, wrist, grip } } manual poses
 */
export default function StationShip({
  exploded = false,
  ringSpin = true,
  animateArms = true,
  armPoses = {},
  event = null,
}) {
  const body = useRef();
  // Disaster effects on the ship model.
  const status = {
    engineOut: event?.name === 'Engine Failure' || event?.name === 'Thruster Failure',
    solarCrisis: event?.name === 'Solar Panel Power Crisis',
  };
  const shaking = event?.name === 'Asteroid Collision';
  useFrame((state) => {
    if (!body.current) return;
    const t = state.clock.elapsedTime;
    body.current.rotation.z = shaking ? Math.sin(t * 9) * 0.035 : body.current.rotation.z * 0.9;
    body.current.rotation.x = shaking ? Math.sin(t * 7 + 1) * 0.02 : body.current.rotation.x * 0.9;
  });

  const arm = (id) => {
    const entry = ARMS.find((item) => item.id === id);
    const index = ARMS.findIndex((item) => item.id === (entry?.phaseOf ?? id));
    return { animate: animateArms && !armPoses[id], pose: armPoses[id], phase: index * 1.7 };
  };

  return (
    <group ref={body}>
      {MODULES.map(({ id, component: Module, explode }) => (
        <Explodable key={id} offset={explode} exploded={exploded}>
          <Module arm={arm} spin={ringSpin} status={status} />
        </Explodable>
      ))}
    </group>
  );
}
