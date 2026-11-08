import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getTextures } from './textures.js';

// Procedural black hole: no image textures, everything is drawn by shaders.
//  - event horizon: a black sphere
//  - accretion disk: a tilted ring with swirling hot gas (white → orange → red → purple)
//  - lensed light: the far side of the disk bent over the top and under the bottom,
//    approximated with a camera-facing glow ring, plus a thin photon ring at the edge

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
  vec3 gasColor(float t) {
    vec3 white = vec3(1.0, 0.93, 0.78);
    vec3 gold = vec3(1.0, 0.6, 0.18);
    vec3 orange = vec3(0.95, 0.3, 0.04);
    vec3 red = vec3(0.55, 0.1, 0.05);
    vec3 purple = vec3(0.32, 0.12, 0.5);
    vec3 c = mix(white, gold, smoothstep(0.0, 0.18, t));
    c = mix(c, orange, smoothstep(0.15, 0.45, t));
    c = mix(c, red, smoothstep(0.45, 0.8, t));
    return mix(c, purple, smoothstep(0.82, 1.0, t));
  }
`;

const VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  varying vec2 vPos;
  ${NOISE}
  void main() {
    float r = length(vPos);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float angle = atan(vPos.y, vPos.x);
    // Inner gas orbits faster than outer gas.
    // Spiral arms plus faster orbits for inner gas.
    float swirl = angle + uTime * 0.9 / (0.25 + t * 1.6) + t * 3.5;
    // Warp the radius with noise so the gas forms flowing filaments instead of clean rings.
    vec3 base = vec3(cos(swirl) * 3.0, sin(swirl) * 3.0, t * 4.0);
    float warp = fbm(base * 0.8 + vec3(0.0, 0.0, uTime * 0.05));
    vec3 p = vec3(cos(swirl) * 3.5, sin(swirl) * 3.5, (t + warp * 0.35) * 9.0);
    float gas = fbm(p);
    float wisps = fbm(p * vec3(1.6, 1.6, 2.2) + 4.0);
    float density = smoothstep(0.4, 0.95, gas * 0.7 + wisps * 0.5);
    float edge = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.55, 1.0, t));
    float heat = pow(1.0 - t, 2.0);
    float doppler = 1.0 + 0.6 * cos(angle - 0.6); // the side moving toward us is brighter
    float intensity = edge * (0.06 + 1.5 * density) * (0.2 + 1.8 * heat) * doppler;
    gl_FragColor = vec4(gasColor(t) * intensity, intensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHorizon;
  varying vec2 vPos;
  ${NOISE}
  void main() {
    float r = length(vPos) / uHorizon;
    float angle = atan(vPos.y, vPos.x);
    // Lensed image of the far side of the disk, brighter over the top than under the bottom.
    // Wide and bright over the top, thin under the bottom.
    float top = smoothstep(-0.7, 0.9, sin(angle));
    float outer = mix(1.32, 2.3, top);
    float band = smoothstep(1.06, 1.22, r) * (1.0 - smoothstep(outer * 0.75, outer, r));
    float swirl = angle - uTime * 0.35;
    float streaks = fbm(vec3(cos(swirl) * 3.0, sin(swirl) * 3.0, r * 5.0));
    float lensed = band * (0.3 + 1.2 * top) * (0.35 + 1.6 * smoothstep(0.35, 0.8, streaks));
    // Thin, sharp photon ring right at the edge of the shadow.
    float photon = exp(-pow((r - 1.04) / 0.018, 2.0)) * 1.6;
    float t = clamp((r - 1.05) / 2.2, 0.0, 1.0);
    vec3 color = gasColor(t) * lensed + vec3(1.0, 0.93, 0.85) * photon;
    float alpha = clamp(lensed + photon, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GROW_SECONDS = 1.5;

export default function BlackHole({ position, radius = 60 }) {
  const { blackHoleGlow } = getTextures();
  const group = useRef();
  const age = useRef(0);

  const disk = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uInner: { value: radius * 1.45 }, uOuter: { value: radius * 5.5 } },
        vertexShader: VERTEX,
        fragmentShader: DISK_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [radius],
  );

  const halo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uHorizon: { value: radius } },
        vertexShader: VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [radius],
  );

  useFrame((_, delta) => {
    age.current += delta;
    disk.uniforms.uTime.value = age.current;
    halo.uniforms.uTime.value = age.current;
    const grow = Math.min(age.current / GROW_SECONDS, 1);
    group.current.scale.setScalar(Math.max(grow * grow * (3 - 2 * grow), 0.001));
  });

  return (
    <group ref={group} position={position.toArray()}>
      {/* Faint purple nebula light around it */}
      <sprite scale={[radius * 16, radius * 16, 1]}>
        <spriteMaterial
          map={blackHoleGlow}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={0.22}
        />
      </sprite>

      {/* Lensed light and photon ring, always facing the camera */}
      <Billboard>
        <mesh material={halo}>
          <planeGeometry args={[radius * 6, radius * 6]} />
        </mesh>
      </Billboard>

      {/* Accretion disk, tilted close to edge-on like in the reference */}
      <group rotation={[0, 0, -0.22]}>
        <mesh material={disk} rotation={[-Math.PI / 2 + 0.2, 0, 0]}>
          <ringGeometry args={[radius * 1.45, radius * 5.5, 256, 8]} />
        </mesh>
      </group>

      {/* Event horizon */}
      <mesh>
        <sphereGeometry args={[radius, 64, 48]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
    </group>
  );
}
