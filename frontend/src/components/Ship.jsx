import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// Interstellar X⁴ spacecraft built from simple shapes.
// Model space: nose points to +Z, up is +Y, right wing is +X. About 4.6 units long.

const COLORS = {
  hull: '#c9ced6',
  dark: '#2b3039',
  orange: '#e39a2d',
  glow: '#3fb6ff',
  panel: '#1d3f9a',
  panelCrisis: '#482d42',
};

// ---------- shared materials and textures ----------

let shared = null;

function solarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  g.fillStyle = '#1b3c96';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#5f8fe8';
  g.lineWidth = 1;
  for (let x = 0; x <= 256; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 160);
    g.stroke();
  }
  for (let y = 0; y <= 160; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  g.strokeStyle = '#c9d6ea';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 252, 156);
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 160);
  g.moveTo(0, 80);
  g.lineTo(256, 80);
  g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function decalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#16181d';
  g.font = 'italic 900 96px Arial, sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillText('///X', 40, 104);
  const width = g.measureText('///X').width;
  g.font = 'italic 900 54px Arial, sans-serif';
  g.fillText('4', 40 + width + 4, 58);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getShared() {
  if (!shared) {
    shared = {
      hull: new THREE.MeshStandardMaterial({ color: COLORS.hull, metalness: 0.55, roughness: 0.4, flatShading: true }),
      dark: new THREE.MeshStandardMaterial({ color: COLORS.dark, metalness: 0.7, roughness: 0.5 }),
      orange: new THREE.MeshStandardMaterial({ color: COLORS.orange, emissive: '#7a4300', emissiveIntensity: 0.6 }),
      glow: new THREE.MeshBasicMaterial({ color: COLORS.glow }),
      glass: new THREE.MeshStandardMaterial({
        color: '#0b1d33',
        emissive: '#0a3a6a',
        emissiveIntensity: 0.6,
        metalness: 0.9,
        roughness: 0.08,
      }),
      solar: solarTexture(),
      decal: new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false }),
    };
  }
  return shared;
}

// ---------- geometry ----------

const FUSELAGE_PROFILE = [
  [0, 2.6],
  [0.22, 2.25],
  [0.45, 1.6],
  [0.6, 0.7],
  [0.65, -0.5],
  [0.62, -1.3],
  [0.52, -1.85],
  [0, -1.85],
].map(([r, y]) => new THREE.Vector2(r, y));

function wingGeometry() {
  // Right wing seen from above: (x, z) points, swept back. Shape y = -z.
  const points = [
    [0.45, 0.7],
    [2.7, -1.45],
    [2.75, -1.85],
    [0.45, -1.8],
  ];
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function finGeometry() {
  // Side view: (z, y) points. Shape u = -z so the fin sweeps back after rotation.
  const points = [
    [-0.95, 0],
    [-1.75, 0],
    [-2.0, 0.95],
    [-1.68, 1.0],
  ];
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A rod between two points. */
function Strut({ from, to, radius = 0.05, material }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      length: dir.length(),
    };
  }, [from, to]);

  return (
    <mesh position={position} quaternion={quaternion} material={material}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
    </mesh>
  );
}

function Joint({ position, size = 0.11 }) {
  const m = getShared();
  return (
    <group position={position}>
      <mesh material={m.dark}>
        <sphereGeometry args={[size, 12, 10]} />
      </mesh>
      <mesh material={m.glow} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[size * 0.95, size * 0.22, 8, 20]} />
      </mesh>
    </group>
  );
}

function SolarArray({ base, mount, rotation, crisis }) {
  const m = getShared();
  const faces = useMemo(() => {
    const face = new THREE.MeshStandardMaterial({
      map: m.solar,
      metalness: 0.4,
      roughness: 0.35,
      emissive: '#0b2a7a',
      emissiveIntensity: 0.35,
    });
    return [m.dark, m.dark, face, face, m.dark, m.dark];
  }, [m]);

  faces[2].color.set(crisis ? '#8a6f86' : '#ffffff');
  faces[2].emissiveIntensity = crisis ? 0 : 0.35;

  return (
    <group>
      <Strut from={base} to={mount} radius={0.06} material={m.dark} />
      <Joint position={base} />
      <Joint position={mount} size={0.13} />
      <mesh position={mount} rotation={rotation} material={faces}>
        <boxGeometry args={[1.9, 0.04, 1.2]} />
      </mesh>
    </group>
  );
}

function Engine({ x, exhaust }) {
  const m = getShared();
  return (
    <group position={[x, -0.05, -1.55]}>
      <mesh material={m.dark} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.31, 0.36, 1.25, 16]} />
      </mesh>
      {[-0.25, 0.05, 0.35].map((z) => (
        <mesh key={z} material={m.glow} position={[0, 0, z]}>
          <torusGeometry args={[0.345, 0.025, 6, 24]} />
        </mesh>
      ))}
      <mesh material={m.glow} position={[0, 0, -0.63]}>
        <circleGeometry args={[0.26, 20]} />
      </mesh>
      <group ref={exhaust} position={[0, 0, -0.63]}>
        <mesh position={[0, 0, -0.7]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.27, 1.4, 16, 1, true]} />
          <meshBasicMaterial
            color="#4fc3ff"
            transparent
            opacity={0.65}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.13, 0.8, 12, 1, true]} />
          <meshBasicMaterial
            color="#e6f8ff"
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

function Wing({ side }) {
  const m = getShared();
  const geometry = useMemo(wingGeometry, []);
  const edge = useMemo(() => {
    const dx = 2.25;
    const dz = -2.15;
    return {
      length: Math.hypot(dx, dz),
      angle: Math.atan2(-dz, dx),
      position: [0.45 + dx / 2, -0.06, 0.7 + dz / 2 + 0.03],
    };
  }, []);

  return (
    <group scale={[side, 1, 1]}>
      <mesh geometry={geometry} position={[0, -0.16, 0]}>
        <meshStandardMaterial color={COLORS.hull} metalness={0.55} roughness={0.4} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh material={m.glow} position={edge.position} rotation={[0, edge.angle, 0]}>
        <boxGeometry args={[edge.length, 0.035, 0.05]} />
      </mesh>
      <mesh material={m.dark} position={[2.72, -0.12, -1.65]}>
        <boxGeometry args={[0.08, 0.1, 0.4]} />
      </mesh>
      <mesh material={m.orange} position={[1.2, -0.08, -1.2]}>
        <boxGeometry args={[0.32, 0.02, 0.14]} />
      </mesh>
    </group>
  );
}

function Fin({ side }) {
  const m = getShared();
  const geometry = useMemo(finGeometry, []);
  return (
    <group position={[side * 0.32, 0.3, 0]} rotation={[0, 0, -side * 0.38]}>
      <mesh geometry={geometry} material={m.hull} />
      <mesh material={m.orange} position={[0, 0.92, -1.84]}>
        <boxGeometry args={[0.07, 0.05, 0.3]} />
      </mesh>
    </group>
  );
}

function RoboticArm() {
  const m = getShared();
  const shoulder = [0.42, -0.42, 0.95];
  const elbow = [0.98, -1.05, 1.05];
  const wrist = [1.62, -0.92, 1.48];
  return (
    <group>
      <Strut from={shoulder} to={elbow} radius={0.09} material={m.hull} />
      <Strut from={elbow} to={wrist} radius={0.08} material={m.hull} />
      <Joint position={shoulder} size={0.14} />
      <Joint position={elbow} size={0.13} />
      <Joint position={wrist} size={0.12} />
      <group position={wrist} rotation={[0, 0.6, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} material={m.dark} position={[s * 0.09, 0, 0.2]} rotation={[0, -s * 0.35, 0]}>
            <boxGeometry args={[0.05, 0.07, 0.3]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const SOLAR_ARRAYS = [
  { base: [0.3, 0.32, 0.7], mount: [1.7, 1.45, 0.45], rotation: [-0.25, 0.35, 0.18] },
  { base: [-0.55, -0.25, -0.35], mount: [-1.6, -1.15, -0.85], rotation: [0.2, 0.35, 0.12] },
];

export default function Ship({ event, playing }) {
  const m = getShared();
  const body = useRef();
  const exhaustLeft = useRef();
  const exhaustRight = useRef();
  const time = useRef(0);

  const fuselage = useMemo(() => new THREE.LatheGeometry(FUSELAGE_PROFILE, 8, Math.PI / 8), []);
  const engineOut = event?.name === 'Engine Failure' || event?.name === 'Thruster Failure';
  const hit = event?.name === 'Asteroid Collision';

  useFrame((_, delta) => {
    if (playing) time.current += delta;
    const t = time.current;
    if (body.current) {
      body.current.rotation.z = Math.sin(t * 0.6) * 0.05 + (hit ? Math.sin(t * 9) * 0.06 : 0);
      body.current.rotation.x = Math.sin(t * 0.45) * 0.03;
    }
    const flicker = engineOut ? 0.001 : 1 + Math.sin(t * 31) * 0.08;
    for (const exhaust of [exhaustLeft.current, exhaustRight.current]) {
      if (exhaust) exhaust.scale.set(1, 1, flicker);
    }
  });

  return (
    <group ref={body}>
      {/* Fuselage, flattened octagon from nose to tail */}
      <mesh geometry={fuselage} material={m.hull} rotation={[Math.PI / 2, 0, 0]} scale={[1.35, 1, 0.72]} />

      {/* Cockpit canopy */}
      <mesh material={m.glass} position={[0, 0.3, 1.25]} scale={[0.36, 0.24, 0.95]}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.orange} position={[s * 0.36, 0.3, 1.2]} rotation={[0, s * 0.12, 0]}>
          <boxGeometry args={[0.03, 0.03, 1.5]} />
        </mesh>
      ))}

      {/* Dorsal module and vents */}
      <mesh material={m.hull} position={[0, 0.48, -0.6]}>
        <boxGeometry args={[0.75, 0.24, 1.5]} />
      </mesh>
      {[-0.95, -0.7, -0.45, -0.2].map((z) => (
        <mesh key={z} material={m.dark} position={[0, 0.61, z]}>
          <boxGeometry args={[0.5, 0.02, 0.12]} />
        </mesh>
      ))}
      <mesh material={m.orange} position={[0.25, 0.61, 0.05]}>
        <boxGeometry args={[0.2, 0.02, 0.12]} />
      </mesh>

      {/* Side trims, running lights and the X⁴ marking */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={m.dark} position={[s * 0.82, -0.12, -0.2]}>
            <boxGeometry args={[0.05, 0.16, 2.4]} />
          </mesh>
          <mesh material={m.glow} position={[s * 0.8, 0.05, 0.85]}>
            <boxGeometry args={[0.04, 0.035, 0.3]} />
          </mesh>
          <mesh material={m.orange} position={[s * 0.78, 0.18, 0.5]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.03, 0.03, 1.1]} />
          </mesh>
          <mesh material={m.decal} position={[s * 0.85, 0.02, 0.05]} rotation={[0, (s * Math.PI) / 2, 0]}>
            <planeGeometry args={[1.0, 0.25]} />
          </mesh>
        </group>
      ))}

      <Wing side={1} />
      <Wing side={-1} />
      <Fin side={1} />
      <Fin side={-1} />
      <Engine x={0.62} exhaust={exhaustRight} />
      <Engine x={-0.62} exhaust={exhaustLeft} />

      {SOLAR_ARRAYS.map((array, i) => (
        <SolarArray key={i} {...array} crisis={event?.name === 'Solar Panel Power Crisis'} />
      ))}

      <RoboticArm />
    </group>
  );
}
