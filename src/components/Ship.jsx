import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

function SolarPanel({ side, event }) {
  const color = event?.name === 'Solar Panel Power Crisis' ? '#482d42' : '#0a4d8c';

  return (
    <group position={[side * 2.2, 0, 0]}>
      <mesh>
        <boxGeometry args={[3.1, 0.055, 1.45]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[(i - 2.5) * 0.49, 0.04, 0]}>
          <boxGeometry args={[0.025, 0.01, 1.45]} />
          <meshBasicMaterial color="#79caff" />
        </mesh>
      ))}
    </group>
  );
}

function RoboticArm() {
  return (
    <group position={[0.55, -0.3, 0.45]} rotation={[0, 0, -0.65]}>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[0.9, 0.13, 0.13]} />
        <meshStandardMaterial color="#c9a85e" />
      </mesh>
      <mesh position={[0.9, 0.25, 0]} rotation={[0, 0, 0.7]}>
        <boxGeometry args={[0.75, 0.12, 0.12]} />
        <meshStandardMaterial color="#c9a85e" />
      </mesh>
    </group>
  );
}

export default function Ship({ event, playing }) {
  const group = useRef();

  useFrame((_, delta) => {
    if (group.current && playing) {
      group.current.rotation.y += delta * 0.07;
      group.current.rotation.z += (event?.name === 'Asteroid Collision' ? 0.12 : 0.005) * delta;
    }
  });

  return (
    <group ref={group}>
      <mesh>
        <cylinderGeometry args={[0.53, 0.65, 3, 20]} />
        <meshStandardMaterial color="#c2d5e7" metalness={0.8} roughness={0.27} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[0.53, 0.8, 20]} />
        <meshStandardMaterial color="#a4c3dc" metalness={0.8} />
      </mesh>

      {[-1, 1].map((side) => (
        <SolarPanel key={side} side={side} event={event} />
      ))}

      <mesh position={[0, -1.65, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.35, 16]} />
        <meshStandardMaterial color="#00cfff" emissive="#009bff" emissiveIntensity={2} />
      </mesh>

      <RoboticArm />
    </group>
  );
}
