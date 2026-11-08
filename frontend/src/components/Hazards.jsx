import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export const TRAVEL_SECONDS = 2.5; // planned time from launch to impact
const IMPACT_RADIUS = 1.6; // roughly the ship hull
const MISS_AFTER_SECONDS = 2; // how long a hazard keeps flying after it missed
const FLASH_SECONDS = 0.7;

const previous = new THREE.Vector3();
const segment = new THREE.Vector3();
const toShip = new THREE.Vector3();

/** Closest distance between point p and the segment a→b. */
function distanceToSegment(p, a, b) {
  segment.subVectors(b, a);
  const lengthSq = segment.lengthSq();
  const t = lengthSq === 0 ? 0 : THREE.MathUtils.clamp(toShip.subVectors(p, a).dot(segment) / lengthSq, 0, 1);
  return toShip.copy(a).addScaledVector(segment, t).distanceTo(p);
}

/** Look of each outer disaster while it flies toward the ship. */
function HazardBody({ name }) {
  switch (name) {
    case 'Asteroid Collision':
      return (
        <mesh>
          <dodecahedronGeometry args={[0.7, 1]} />
          <meshStandardMaterial color="#8b7771" roughness={0.95} flatShading />
        </mesh>
      );
    case 'Solar Storm':
      return (
        <mesh>
          <sphereGeometry args={[0.7, 24, 24]} />
          <meshStandardMaterial color="#ffb347" emissive="#ff7a18" emissiveIntensity={2} />
        </mesh>
      );
    case 'Alien Encounter':
      return (
        <group>
          <mesh scale={[1, 0.3, 1]}>
            <sphereGeometry args={[0.8, 24, 16]} />
            <meshStandardMaterial color="#7a8c99" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#6dff9c" emissive="#2bd96a" emissiveIntensity={1.5} />
          </mesh>
        </group>
      );
    default:
      return (
        <mesh>
          <octahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color="#ff6b5a" emissive="#c2301f" emissiveIntensity={1.5} />
        </mesh>
      );
  }
}

/**
 * An outer disaster on a straight course toward where the ship was predicted to be.
 * It does not steer: if the ship changes course, it flies past and reports a miss.
 */
export function IncomingHazard({ hazard, playing, shipFrame, onImpact, onMiss }) {
  const ref = useRef();
  const done = useRef(false);
  const elapsed = useRef(0);
  const start = useMemo(() => new THREE.Vector3(...hazard.start), [hazard.start]);
  const velocity = useMemo(() => new THREE.Vector3(...hazard.velocity), [hazard.velocity]);

  // Set the start point once; after that only the animation moves the hazard,
  // so re-renders of the page (the sim clock ticks every second) cannot pull it back.
  useLayoutEffect(() => {
    ref.current.position.copy(start);
  }, [start]);

  useFrame((_, delta) => {
    const obj = ref.current;
    if (!obj || !playing || done.current) return;
    const dt = Math.min(delta, 0.05);
    previous.copy(obj.position);
    elapsed.current += dt;
    obj.position.copy(start).addScaledVector(velocity, elapsed.current);
    obj.rotation.x += dt * 1.5;
    obj.rotation.y += dt;

    const ship = shipFrame.current?.position;
    if (ship && distanceToSegment(ship, previous, obj.position) <= IMPACT_RADIUS) {
      done.current = true;
      onImpact(hazard, ship.toArray());
      return;
    }
    if (elapsed.current > hazard.eta + MISS_AFTER_SECONDS) {
      done.current = true;
      onMiss(hazard);
    }
  });

  return (
    <group ref={ref}>
      <HazardBody name={hazard.name} />
    </group>
  );
}

/** Short expanding flash where a hazard hits the ship. */
export function ImpactFlash({ impact, onDone }) {
  const ref = useRef();
  const material = useRef();
  const age = useRef(0);

  useFrame((_, delta) => {
    age.current += delta;
    const t = age.current / FLASH_SECONDS;
    if (t >= 1) {
      onDone(impact.id);
      return;
    }
    ref.current.scale.setScalar(0.5 + t * 2.5);
    material.current.opacity = 1 - t;
  });

  return (
    <mesh ref={ref} position={impact.pos}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshBasicMaterial ref={material} color="#ffb070" transparent depthWrite={false} />
    </mesh>
  );
}
