import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getTextures } from './textures.js';

export function Planet({ position, radius, texture, atmosphere, ring, spin = 0.01 }) {
  const ref = useRef();
  useFrame((_, delta) => {
    ref.current.rotation.y += delta * spin;
  });

  return (
    <group position={position.toArray()}>
      <mesh ref={ref}>
        <sphereGeometry args={[radius, 64, 48]} />
        <meshStandardMaterial map={texture} roughness={1} metalness={0} />
      </mesh>
      {atmosphere && (
        <mesh scale={1.07}>
          <sphereGeometry args={[radius, 48, 32]} />
          <meshBasicMaterial
            color={atmosphere}
            transparent
            opacity={0.2}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      {ring && (
        <mesh rotation={[-Math.PI / 2 + 0.45, 0, 0.2]}>
          <ringGeometry args={[radius * 1.35, radius * 2.3, 96]} />
          <meshBasicMaterial color={ring} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Faint circle for a planet's orbit around the Sun. */
export function OrbitLine({ radius }) {
  const geometry = useMemo(() => {
    const points = [];
    for (let i = 0; i < 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [radius]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color="#1f6fa8" transparent opacity={0.35} depthWrite={false} />
    </lineLoop>
  );
}

export function Sun({ position, radius = 90 }) {
  const { glow } = getTextures();
  return (
    <group position={position.toArray()}>
      <mesh>
        <sphereGeometry args={[radius, 32, 24]} />
        <meshBasicMaterial color="#fff2c4" />
      </mesh>
      <sprite scale={[radius * 6, radius * 6, 1]}>
        <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
      </sprite>
    </group>
  );
}

const STAR_COUNT = 4000;
const STAR_RADIUS = 5000;

/** Distant stars that stay centered on the camera, so they never get closer as the ship flies. */
export function StarField() {
  const ref = useRef();
  const { camera } = useThree();

  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < STAR_COUNT; i++) {
      v.randomDirection().multiplyScalar(STAR_RADIUS);
      positions.set([v.x, v.y, v.z], i * 3);
      const tint = 0.6 + Math.random() * 0.4;
      colors.set([tint, tint, Math.min(1, tint + 0.15)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  useFrame(() => {
    ref.current.position.copy(camera.position);
  });

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors depthWrite={false} />
    </points>
  );
}
