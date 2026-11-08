import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// Glowing comet-style tail behind a flying rock. Procedural shader, no textures.
// The cone's base sits at the rock and its tip points back along where the rock came from.

const UP = new THREE.Vector3(0, 1, 0);

function trailGeometry() {
  // Base at y = 0 (the rock), tip at y = 1 (end of the tail).
  const geometry = new THREE.ConeGeometry(1, 1, 24, 12, true);
  geometry.rotateX(Math.PI); // tip to −Y …
  geometry.translate(0, 0.5, 0); // … then base at 0, tip at +1
  return geometry;
}

const vertexShader = /* glsl */ `
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vAlong = position.y; // 0 at the rock, 1 at the end of the tail
    vec4 world = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-world.xyz);
    gl_Position = projectionMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Bright near the rock, fading to nothing at the tip; soft at the silhouette.
    float fade = pow(1.0 - vAlong, 1.15);
    float core = pow(abs(dot(normalize(vNormal), vView)), 0.8);
    float flicker = 0.85 + 0.15 * sin(uTime * 14.0 - vAlong * 20.0);
    vec3 head = vec3(0.75, 0.92, 1.0);
    vec3 blue = vec3(0.18, 0.72, 1.0);
    vec3 violet = vec3(0.65, 0.3, 1.0);
    vec3 color = mix(mix(head, blue, smoothstep(0.0, 0.25, vAlong)), violet, smoothstep(0.3, 1.0, vAlong));
    float alpha = clamp(fade * core * flicker * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(color * alpha * 1.6, alpha);
  }
`;

function trailMaterial(opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * @param radius    rendered rock radius
 * @param getMotion (out: Vector3) => writes the rock's rendered direction of travel (any length,
 *                  longer = faster); return false to hide the trail
 * @param maxLength longest tail, in rock radii
 */
export default function RockTrail({ radius, getMotion, maxLength = 26 }) {
  const group = useRef();
  const geometry = useMemo(trailGeometry, []);
  const halo = useMemo(() => trailMaterial(0.35), []);
  const outer = useMemo(() => trailMaterial(0.9), []);
  const inner = useMemo(() => trailMaterial(1.4), []);
  const motion = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    halo.uniforms.uTime.value = t + 0.8;
    outer.uniforms.uTime.value = t;
    inner.uniforms.uTime.value = t + 0.4;
    const visible = getMotion(motion) !== false && motion.lengthSq() > 1e-12;
    g.visible = visible;
    if (!visible) return;
    const speed = motion.length();
    // Tail points backwards, opposite to the direction of travel.
    g.quaternion.setFromUnitVectors(UP, motion.multiplyScalar(-1 / speed));
    const length = radius * THREE.MathUtils.clamp(8 + speed * 0.25, 10, maxLength);
    g.scale.set(radius * 1.25, length, radius * 1.25);
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={halo} scale={[2.2, 0.8, 2.2]} renderOrder={1} />
      <mesh geometry={geometry} material={outer} renderOrder={2} />
      <mesh geometry={geometry} material={inner} scale={[0.45, 0.85, 0.45]} renderOrder={3} />
    </group>
  );
}
