import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide } from 'three';

const flameVertex = /* glsl */ `
  uniform float uTime;
  varying float vAlong;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vAlong = position.y + 0.5;
    vUv = uv;
    vec3 p = position;
    float ripple = sin(vAlong * 31.0 - uTime * 25.0 + uv.x * 18.0);
    p.xz *= 1.0 + 0.08 * ripple * vAlong;
    p.y += 0.5;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-view.xyz);
    gl_Position = projectionMatrix * view;
  }
`;

const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uCore;
  varying float vAlong;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fade = pow(max(0.0, 1.0 - vAlong), 0.8);
    float edge = 0.2 + 0.8 * pow(abs(dot(normalize(vNormal), normalize(vView))), 0.6);
    float streak = 0.76 + 0.24 * sin(vUv.x * 65.0 + vAlong * 36.0 - uTime * 32.0);
    float diamonds = 0.84 + 0.16 * cos(vAlong * 38.0 - uTime * 5.0);
    vec3 outer = mix(vec3(0.35, 0.72, 1.0), vec3(1.0, 0.28, 0.035), smoothstep(0.05, 0.9, vAlong));
    vec3 core = mix(vec3(0.86, 0.97, 1.0), vec3(0.25, 0.65, 1.0), vAlong);
    float alpha = fade * edge * streak * diamonds * mix(0.58, 0.9, uCore) * (0.7 + 0.3 * uStrength);
    gl_FragColor = vec4(mix(outer, core, uCore) * 1.7, alpha);
  }
`;

/** The emitter's local +Y points out of its nozzle. No external textures. */
export function ThrusterFlame({ getEffect, enabled = true, ...props }) {
  const group = useRef(), outer = useRef(), core = useRef(), nozzle = useRef(), light = useRef();
  const effect = useRef({ active: false, time: 0, strength: 0 });
  const uniforms = useMemo(() => [0, 1].map(value => ({
    uTime: { value: 0 }, uStrength: { value: 1 }, uCore: { value },
  })), []);
  useFrame(state => {
    const e = getEffect ? getEffect(effect.current) : { active: enabled, strength: .65, time: state.clock.elapsedTime };
    group.current.visible = e.active && e.strength > 0;
    if (!group.current.visible) return;
    const pulse = 1 + .045 * Math.sin(e.time * 27) + .025 * Math.sin(e.time * 43);
    const length = (4 + 7 * e.strength) * pulse;
    outer.current.scale.set(1.22, length, 1.22);
    core.current.scale.set(.65, length * .82, .65);
    for (const u of uniforms) { u.uTime.value = e.time; u.uStrength.value = e.strength; }
    nozzle.current.material.opacity = .65 + .25 * pulse;
    light.current.intensity = (1.5 + 3 * e.strength) * pulse;
  });
  return <group {...props} ref={group} visible={false}>
    <mesh ref={nozzle} rotation={[-Math.PI / 2, 0, 0]} userData={{ visualEffect: true }}>
      <circleGeometry args={[1.28, 32]} />
      <meshBasicMaterial color="#c0efff" transparent opacity={.9} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>
    {[outer, core].map((ref, i) => <mesh key={i} ref={ref} userData={{ visualEffect: true }}>
      <coneGeometry args={[1, 1, 32, 18, true]} />
      <shaderMaterial uniforms={uniforms[i]} vertexShader={flameVertex} fragmentShader={flameFragment}
        transparent blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>)}
    <pointLight ref={light} color="#7bd9ff" distance={7} decay={2} />
  </group>;
}

const SPARK_COUNT = 44;
// Repeatable emission, with staggered lifetimes so sparks flow throughout contact.
const random = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const sparkVertex = /* glsl */ `
  attribute float aSize;
  uniform float uViewport;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    float scale = length(modelViewMatrix[0].xyz);
    gl_PointSize = clamp(aSize * uViewport * projectionMatrix[1][1] * scale / max(0.01, -view.z), 1.5, 9.0);
    gl_Position = projectionMatrix * view;
  }
`;
const sparkFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = 1.0 - smoothstep(0.05, 1.0, r);
    gl_FragColor = vec4(vColor * 1.8, alpha);
  }
`;

/** Mounted at the actual gripper tip, so extension/rotation carry the sparks. */
export function RepairSparks({ getEffect, ...props }) {
  const group = useRef(), points = useRef(), lines = useRef(), glow = useRef(), light = useRef();
  const effect = useRef({ active: false, time: 0 });
  const particles = useMemo(() => Array.from({ length: SPARK_COUNT }, (_, i) => {
    const angle = random(i + 1) * Math.PI * 2, speed = 1.2 + random(i + 41) * 2.4;
    return { life: .28 + random(i + 81) * .38, phase: random(i + 121),
      // The tool points +Y into the socket; eject sparks back out above the hull.
      vx: Math.cos(angle) * speed, vy: -(.4 + random(i + 161) * 1.8), vz: Math.sin(angle) * speed };
  }), []);
  const buffers = useMemo(() => {
    const positions = new Float32Array(SPARK_COUNT * 3), tails = new Float32Array(SPARK_COUNT * 6);
    const colors = new Float32Array(SPARK_COUNT * 3), tailColors = new Float32Array(SPARK_COUNT * 6), sizes = new Float32Array(SPARK_COUNT);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const color = i % 3 === 0 ? [1, 1, .95] : [1, .72 + random(i + 201) * .25, .1];
      colors.set(color, i * 3); tailColors.set(color, i * 6); tailColors.set(color.map(c => c * .08), i * 6 + 3);
      sizes[i] = .035 + random(i + 241) * .045;
    }
    return { positions, tails, colors, tailColors, sizes };
  }, []);
  const uniforms = useMemo(() => ({ uViewport: { value: 500 } }), []);
  useFrame(state => {
    const e = getEffect(effect.current);
    group.current.visible = e.active;
    if (!e.active) return;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const p = particles[i], age = ((e.time / p.life + p.phase) % 1) * p.life;
      const tailAge = Math.max(0, age - .075), head = i * 3, tail = i * 6;
      buffers.positions[head] = buffers.tails[tail] = p.vx * age;
      buffers.positions[head + 1] = buffers.tails[tail + 1] = p.vy * age;
      buffers.positions[head + 2] = buffers.tails[tail + 2] = p.vz * age;
      buffers.tails[tail + 3] = p.vx * tailAge;
      buffers.tails[tail + 4] = p.vy * tailAge;
      buffers.tails[tail + 5] = p.vz * tailAge;
    }
    points.current.geometry.attributes.position.needsUpdate = true;
    lines.current.geometry.attributes.position.needsUpdate = true;
    uniforms.uViewport.value = state.size.height * state.viewport.dpr * .5;
    const pulse = .85 + .15 * Math.sin(e.time * 57) * Math.sin(e.time * 31);
    glow.current.scale.setScalar(pulse);
    light.current.intensity = pulse * .28;
  });
  return <group {...props} ref={group} visible={false}>
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[buffers.colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[buffers.sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial uniforms={uniforms} vertexShader={sparkVertex} fragmentShader={sparkFragment}
        vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
    <lineSegments ref={lines} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.tails, 3]} />
        <bufferAttribute attach="attributes-color" args={[buffers.tailColors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={.85} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
    <mesh ref={glow} userData={{ visualEffect: true }}>
      <sphereGeometry args={[.07, 10, 8]} />
      <meshBasicMaterial color="#fff7c9" toneMapped={false} />
    </mesh>
    <pointLight ref={light} color="#ffe5a2" distance={1.2} decay={2} />
  </group>;
}
