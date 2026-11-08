import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SUN } from '../../data/voyage.js';
import { getTextures } from './textures.js';

// Solar storm: a flash on the Sun, then a shell of charged particles expanding outward
// through the whole system. It reports when the wavefront reaches the ship.

export const STORM_SPEED = 160; // world units per second
const MAX_RADIUS = 1500;
const FLASH_SECONDS = 1.5;

const VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vDir;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    vDir = normalize(position);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vDir;
  float sHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float sNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(sHash(i), sHash(i + vec3(1, 0, 0)), f.x), mix(sHash(i + vec3(0, 1, 0)), sHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(sHash(i + vec3(0, 0, 1)), sHash(i + vec3(1, 0, 1)), f.x), mix(sHash(i + vec3(0, 1, 1)), sHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float sFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * sNoise(p);
      p = p * 2.07 + vec3(3.1, 1.7, 8.3);
      a *= 0.5;
    }
    return v;
  }
  void main() {
    // Bright where we look along the shell (its edge), plus drifting plasma filaments.
    float rim = pow(1.0 - abs(dot(vNormalView, vViewDir)), 2.0);
    float plasma = sFbm(vDir * 6.0 + vec3(0.0, 0.0, uTime * 0.4));
    float filaments = smoothstep(0.45, 0.8, plasma);
    vec3 color = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.45), filaments);
    float alpha = (0.08 + rim * 0.9) * (0.35 + 0.9 * filaments) * uOpacity;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

export default function SolarStorm({ storm, playing, shipFrame, onReach, onDone }) {
  const shell = useRef();
  const flash = useRef();
  const progress = useRef({ radius: SUN.radius, age: 0, reached: false, done: false });
  const { glow } = getTextures();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    progress.current = { radius: SUN.radius, age: 0, reached: false, done: false };
  }, [storm.id]);

  useFrame((_, delta) => {
    const p = progress.current;
    if (!playing || p.done || !shell.current) return;
    const dt = Math.min(delta, 0.05);
    p.age += dt;
    p.radius += STORM_SPEED * dt;

    shell.current.scale.setScalar(p.radius);
    material.uniforms.uTime.value = p.age;
    material.uniforms.uOpacity.value = 1 - THREE.MathUtils.smoothstep(p.radius, MAX_RADIUS * 0.55, MAX_RADIUS);

    // The eruption: the Sun flares up, then settles.
    const burst = Math.max(0, 1 - p.age / FLASH_SECONDS);
    flash.current.scale.setScalar(SUN.radius * (6 + 14 * burst));
    flash.current.material.opacity = burst;

    const ship = shipFrame.current?.position;
    if (!p.reached && ship && p.radius >= ship.distanceTo(SUN.position)) {
      p.reached = true;
      onReach();
    }
    if (p.radius >= MAX_RADIUS) {
      p.done = true;
      onDone();
    }
  });

  return (
    <group position={SUN.position.toArray()}>
      <mesh ref={shell} material={material} scale={SUN.radius}>
        <sphereGeometry args={[1, 96, 64]} />
      </mesh>
      <sprite ref={flash}>
        <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
      </sprite>
    </group>
  );
}
