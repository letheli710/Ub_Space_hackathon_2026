import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import PlanetarySystem from './PlanetarySystem.jsx';
import Ship from './Ship.jsx';

function HazardMarker({ event }) {
  return (
    <mesh position={[3, 1, -1]}>
      <dodecahedronGeometry args={[0.7, 1]} />
      <meshStandardMaterial
        color={event.name === 'Black Hole Encounter' ? '#552e8e' : '#8b7771'}
        wireframe={event.name !== 'Asteroid Collision'}
      />
    </mesh>
  );
}

export default function Scene({ event, playing, planet = false, onPlace }) {
  return (
    <Canvas
      camera={{ position: planet ? [0, 12, 18] : [8, 5, 10], fov: 45 }}
      onPointerMissed={onPlace}
    >
      <color attach="background" args={['#030a19']} />
      <ambientLight intensity={1.5} />
      <pointLight position={[5, 6, 8]} intensity={80} color="#7ecbff" />
      <Stars radius={100} depth={55} count={3500} factor={4} fade />

      {planet ? (
        <PlanetarySystem />
      ) : (
        <>
          <Ship event={event} playing={playing} />
          {event && <HazardMarker event={event} />}
          <gridHelper args={[25, 25, '#173c5c', '#10263c']} position={[0, -4, 0]} />
        </>
      )}

      <OrbitControls enablePan enableZoom minDistance={3} maxDistance={35} />
    </Canvas>
  );
}
