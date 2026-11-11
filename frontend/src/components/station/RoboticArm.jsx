import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { materials } from './materials.js';
import { DEFAULT_POSE, JOINT_LIMITS } from '../../simulation/demoArmKinematics.js';
import { RepairSparks } from './ShipEffects.jsx';
export { DEFAULT_POSE, JOINT_LIMITS };

// A movable robotic arm: base yaw → shoulder → elbow → wrist → two-finger gripper.
// The arm stands along its local +Y axis; mount it by placing and rotating its group.


/** Gentle idle motion so each arm looks alive; phase keeps arms out of sync. */
export function idlePose(t, phase = 0) {
  const s = t + phase;
  return {
    yaw: Math.sin(s * 0.27) * 1.1,
    shoulder: 0.55 + Math.sin(s * 0.41) * 0.5,
    elbow: -1.1 + Math.sin(s * 0.53 + 1) * 0.55,
    wrist: Math.sin(s * 0.71 + 2) * 0.7,
    grip: (Math.sin(s * 1.1) + 1) / 2,
    slide: Math.sin(s * 0.12) * 0.9,
  };
}

export default function RoboticArm({ pose, animate = true, phase = 0, upper = 1.5, lower = 1.3, getRepairEffect, ...groupProps }) {
  const m = materials();
  const yaw = useRef();
  const shoulder = useRef();
  const elbow = useRef();
  const wrist = useRef();
  const fingerA = useRef();
  const fingerB = useRef();
  const upperLink=useRef(), upperStrip=useRef(), lowerLink=useRef();

  useFrame((state) => {
    const p = animate ? idlePose(state.clock.elapsedTime, phase) : { ...DEFAULT_POSE, ...pose };
    if (!yaw.current) return;
    yaw.current.rotation.y = p.yaw;
    shoulder.current.rotation.z = p.shoulder;
    elbow.current.rotation.z = p.elbow;
    wrist.current.rotation.z = p.wrist;
    const a=p.upper ?? upper, b=p.lower ?? lower;
    upperLink.current.position.y=a/2; upperLink.current.scale.y=a;
    upperStrip.current.position.y=a/2; upperStrip.current.scale.y=a*.7;
    elbow.current.position.y=a;
    lowerLink.current.position.y=b/2; lowerLink.current.scale.y=b;
    wrist.current.position.y=b;
    const open = 0.05 + p.grip * 0.13;
    fingerA.current.position.x = open;
    fingerB.current.position.x = -open;
  });

  return (
    <group {...groupProps}>
      {/* Base plate and turret */}
      <mesh material={m.dark} position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.32, 0.36, 0.12, 20]} />
      </mesh>
      <mesh material={m.glow} position={[0, 0.13, 0]}>
        <torusGeometry args={[0.3, 0.025, 8, 24]} />
      </mesh>
      <group ref={yaw} position={[0, 0.12, 0]}>
        <mesh material={m.hull} position={[0, 0.16, 0]}>
          <boxGeometry args={[0.36, 0.3, 0.36]} />
        </mesh>

        {/* Shoulder */}
        <group ref={shoulder} position={[0, 0.36, 0]}>
          <mesh material={m.dark} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.34, 16]} />
          </mesh>
          <mesh ref={upperLink} material={m.hull} position={[0, upper / 2, 0]} scale={[1,upper,1]}>
            <boxGeometry args={[0.16, 1, 0.16]} />
          </mesh>
          <mesh ref={upperStrip} material={m.gold} position={[0.085, upper / 2, 0]} scale={[1,upper*.7,1]}>
            <boxGeometry args={[0.01, 1, 0.07]} />
          </mesh>

          {/* Elbow */}
          <group ref={elbow} position={[0, upper, 0]}>
            <mesh material={m.dark} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.3, 16]} />
            </mesh>
            <mesh ref={lowerLink} material={m.hull} position={[0, lower / 2, 0]} scale={[1,lower,1]}>
              <boxGeometry args={[0.13, 1, 0.13]} />
            </mesh>

            {/* Wrist and gripper */}
            <group ref={wrist} position={[0, lower, 0]}>
              <mesh material={m.dark}>
                <sphereGeometry args={[0.11, 14, 10]} />
              </mesh>
              <mesh material={m.hull} position={[0, 0.13, 0]}>
                <boxGeometry args={[0.24, 0.12, 0.14]} />
              </mesh>
              <mesh material={m.glow} position={[0, 0.13, 0.072]}>
                <boxGeometry args={[0.12, 0.03, 0.01]} />
              </mesh>
              <mesh ref={fingerA} material={m.dark} position={[0.1, 0.3, 0]}>
                <boxGeometry args={[0.04, 0.24, 0.08]} />
              </mesh>
              <mesh ref={fingerB} material={m.dark} position={[-0.1, 0.3, 0]}>
                <boxGeometry args={[0.04, 0.24, 0.08]} />
              </mesh>
              {getRepairEffect && <RepairSparks position={[0, .42, 0]} getEffect={getRepairEffect} />}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
