import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { materials } from './materials.js';
import { Band, Rods, Truss, Tube } from './parts.jsx';
import RoboticArm, { DEFAULT_POSE, idlePose } from './RoboticArm.jsx';
import { ThrusterFlame } from './ShipEffects.jsx';

// The station ship's modules. Each one is self-contained and carries its own robotic arm(s).
// `arm(id)` returns the props for that arm (pose, animation, phase).
// Ship axis: +Z is the front (command module), −Z the engines.

const ring = (count, radius, fn) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return fn(a, Math.cos(a) * radius, Math.sin(a) * radius, i);
  });

/** Front crew module with windows, docking port, antenna and gold trim. */
export function CommandModule({ arm }) {
  const m = materials();
  return (
    <group position={[0, 0, 13]}>
      <Tube radius={1.7} length={5} material={m.plating} />
      <Tube radius={1.0} radiusBack={1.7} length={1.3} z={3.15} material={m.hull} />
      <Tube radius={0.72} length={0.45} z={4.0} material={m.dark} />
      <Band radius={0.95} z={3.85} tube={0.13} material={m.dark} />
      <Band radius={1.72} z={2.3} tube={0.05} material={m.gold} />
      <Band radius={1.72} z={-2.3} tube={0.05} material={m.gold} />
      <Tube radius={1.4} length={0.6} z={-2.8} material={m.dark} />
      {ring(10, 1.71, (a, x, y, i) => (
        <mesh key={i} material={m.window} position={[x, y, 1.4]} rotation={[0, 0, a]}>
          <boxGeometry args={[0.04, 0.3, 0.55]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.85, -0.3, -0.6]}>
          <mesh material={m.dark}>
            <boxGeometry args={[0.35, 1.1, 2.2]} />
          </mesh>
          <mesh material={m.gold} position={[s * 0.18, 0, 0]}>
            <boxGeometry args={[0.02, 0.9, 1.8]} />
          </mesh>
        </group>
      ))}
      <mesh material={m.truss} position={[0.6, 2.2, 1]}>
        <cylinderGeometry args={[0.03, 0.03, 1, 6]} />
      </mesh>
      <mesh material={m.hull} position={[0.6, 2.75, 1]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
      </mesh>
      <RoboticArm {...arm('command')} position={[0, 1.7, -1.2]} />
    </group>
  );
}

/** Habitation module with ribs and equipment racks. */
export function HabModule({ arm }) {
  const m = materials();
  return (
    <group position={[0, 0, 7.4]}>
      <Tube radius={1.45} length={4.4} material={m.plating} />
      {[-1.8, -0.9, 0, 0.9, 1.8].map((z) => (
        <Band key={z} radius={1.47} z={z} tube={0.06} material={m.dark} />
      ))}
      <mesh material={m.dark} position={[0, -1.5, 0]}>
        <boxGeometry args={[1.1, 0.3, 3.4]} />
      </mesh>
      <mesh material={m.gold} position={[-1.48, 0, 0]}>
        <boxGeometry args={[0.04, 0.8, 3.2]} />
      </mesh>
      <RoboticArm {...arm('hab')} position={[1.45, 0, 0.6]} rotation={[0, 0, -Math.PI / 2]} />
    </group>
  );
}

/** Spherical junction node with docking ports and an observation cupola. */
export function NodeModule({ arm }) {
  const m = materials();
  return (
    <group position={[0, 0, 3.6]}>
      <mesh material={m.plating}>
        <sphereGeometry args={[1.9, 40, 28]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`x${s}`} material={m.hull} position={[s * 2.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.8, 0.8, 0.6, 24]} />
        </mesh>
      ))}
      <mesh material={m.dark} position={[0, -2.05, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.6, 24]} />
      </mesh>
      {/* Cupola */}
      <mesh material={m.hull} position={[0, 2.05, 0]}>
        <cylinderGeometry args={[0.75, 0.85, 0.5, 8]} />
      </mesh>
      <mesh material={m.glass} position={[0, 2.3, 0]}>
        <sphereGeometry args={[0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <RoboticArm {...arm('node')} position={[-2.35, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
    </group>
  );
}

/** Octagonal cargo pod under the node. */
export function CargoPod({ arm }) {
  const m = materials();
  return (
    <group position={[0, -4.4, 3.6]}>
      <mesh material={m.dark} position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.9, 16]} />
      </mesh>
      <mesh material={m.hull}>
        <cylinderGeometry args={[1.8, 1.8, 2.6, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.dark} position={[0, s * 1.35, 0]}>
          <cylinderGeometry args={[1.6, 1.85, 0.12, 8]} />
        </mesh>
      ))}
      <RoboticArm {...arm('cargo')} position={[0, -1.4, 0]} rotation={[Math.PI, 0, 0]} />
    </group>
  );
}

/** Lattice spine connecting the node to the engine section. */
export function SpineTruss() {
  return <Truss from={[0, 0, 2]} to={[0, 0, -13.6]} width={1.2} radius={0.05} />;
}

const RING_RADIUS = 10.5;
const RING_SEGMENTS = 36;
const RING_DEPTH = 1.9;
const RAIL_Z = RING_DEPTH / 2 + 0.05; // on the ring's side face that looks toward the bow
const RAIL_GAUGE = 0.32; // half the distance between the two rails

/** Twin rails running all the way round the ring's side face, with cross ties. */
function SideRail() {
  const m = materials();
  return (
    <group position={[0, 0, RAIL_Z]}>
      <mesh material={m.dark}>
        <torusGeometry args={[RING_RADIUS, 0.18, 6, 96]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.truss} position={[0, 0, 0.12]}>
          <torusGeometry args={[RING_RADIUS + s * RAIL_GAUGE, 0.05, 8, 128]} />
        </mesh>
      ))}
      {ring(72, RING_RADIUS, (a, x, y, i) => (
        <mesh key={i} material={m.dark} position={[x, y, 0.08]} rotation={[0, 0, a]}>
          <boxGeometry args={[RAIL_GAUGE * 2.4, 0.08, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** A carriage that slides along the side rail, carrying a robotic arm. */
function RailArm({ props, baseAngle }) {
  const m = materials();
  const carriage = useRef();
  useFrame((state) => {
    if (!carriage.current) return;
    const slide = props.animate
      ? idlePose(state.clock.elapsedTime, props.phase).slide
      : (props.pose?.slide ?? DEFAULT_POSE.slide);
    const a = baseAngle + slide;
    carriage.current.position.set(Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS, RAIL_Z + 0.18);
    carriage.current.rotation.set(0, 0, a);
  });
  return (
    <group ref={carriage}>
      <mesh material={m.dark}>
        <boxGeometry args={[RAIL_GAUGE * 2.6, 0.9, 0.16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.glow} position={[s * RAIL_GAUGE, 0, -0.06]}>
          <boxGeometry args={[0.12, 0.7, 0.05]} />
        </mesh>
      ))}
      {/* The arm stands out of the side face (+Z) */}
      <RoboticArm {...props} position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/** Rotating ring for artificial gravity: hub, three truss spokes and a segmented rim. */
export function RingModule({ arm, spin }) {
  const m = materials();
  const rotor = useRef();
  useFrame((_, delta) => {
    if (spin && rotor.current) rotor.current.rotation.z += delta * 0.08;
  });

  const segLength = ((Math.PI * 2 * RING_RADIUS) / RING_SEGMENTS) * 1.02;
  return (
    <group position={[0, 0, -2]}>
      <group ref={rotor}>
        <Tube radius={1.55} length={2.4} material={m.plating} />
        <Band radius={1.57} z={1.1} tube={0.08} material={m.dark} />
        <Band radius={1.57} z={-1.1} tube={0.08} material={m.dark} />
        {[90, 210, 330].map((deg) => {
          const a = (deg * Math.PI) / 180;
          const c = Math.cos(a);
          const s = Math.sin(a);
          return (
            <Truss
              key={deg}
              from={[c * 1.5, s * 1.5, 0]}
              to={[c * (RING_RADIUS - 0.7), s * (RING_RADIUS - 0.7), 0]}
              width={0.6}
              radius={0.035}
            />
          );
        })}
        {ring(RING_SEGMENTS, RING_RADIUS, (a, x, y, i) => (
          <group key={i} position={[x, y, 0]} rotation={[0, 0, a]}>
            <mesh material={i % 2 ? m.plating : m.hull}>
              <boxGeometry args={[1.3, segLength, RING_DEPTH]} />
            </mesh>
            <mesh material={m.dark} position={[0.66, 0, 0]}>
              <boxGeometry args={[0.04, segLength * 0.75, 1.4]} />
            </mesh>
            {i % 3 === 0 && (
              <mesh material={m.window} position={[-0.66, 0, 0]}>
                <boxGeometry args={[0.03, segLength * 0.4, 0.3]} />
              </mesh>
            )}
          </group>
        ))}
        <Band radius={RING_RADIUS - 0.75} z={0.8} tube={0.05} material={m.truss} />
        <Band radius={RING_RADIUS - 0.75} z={-0.8} tube={0.05} material={m.truss} />
        <RoboticArm {...arm('ringHub')} position={[0, 1.55, 0.6]} />
        <SideRail />
        {/* Two arms on opposite sides of the ring, symmetric about the ship axis */}
        <RailArm props={arm('ringRailA')} baseAngle={0.5} />
        <RailArm props={arm('ringRailB')} baseAngle={0.5 + Math.PI} />
      </group>
    </group>
  );
}

/**
 * A solar (or radiator) wing pointing out from the spine. Built along +X and turned by `angle`
 * around the ship axis.
 */
export function Wing({ z, angle, length, width, material, armId, arm, panels = 2 }) {
  const m = materials();
  const panelLength = (length - 2) / panels;
  return (
    <group position={[0, 0, z]} rotation={[0, 0, angle]}>
      <mesh material={m.truss} position={[length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, length, 8]} />
      </mesh>
      <mesh material={m.dark} position={[0.9, 0, 0]}>
        <boxGeometry args={[0.6, 0.45, 0.6]} />
      </mesh>
      {Array.from({ length: panels }, (_, i) => (
        <mesh key={i} material={material ?? m.solar} position={[1.6 + panelLength * (i + 0.5) + i * 0.15, 0, 0]}>
          <boxGeometry args={[panelLength, 0.05, width]} />
        </mesh>
      ))}
      {armId && <RoboticArm {...arm(armId)} position={[1.0, 0.22, 0]} upper={1.2} lower={1.0} />}
    </group>
  );
}

export function SolarArrays({ arm, status, mainWings = true }) {
  const m = materials();
  // Power crisis: the panels go dark.
  const solar = status?.solarCrisis ? m.solarDead : m.solar;
  return (
    <>
      {mainWings && <Wing z={-6} angle={0} length={11} width={3} material={solar} armId="solarRight" arm={arm} />}
      {mainWings && <Wing z={-6} angle={Math.PI} length={11} width={3} material={solar} armId="solarLeft" arm={arm} />}
      <Wing z={-11.6} angle={Math.PI / 2} length={5} width={1.6} panels={1} material={solar} arm={arm} />
      <Wing z={-11.6} angle={-Math.PI / 2} length={5} width={1.6} panels={1} material={solar} arm={arm} />
      <Wing z={-9} angle={Math.PI / 4} length={4.2} width={1.3} panels={1} material={m.radiator} arm={arm} />
      <Wing z={-9} angle={(Math.PI * 5) / 4} length={4.2} width={1.3} panels={1} material={m.radiator} arm={arm} />
    </>
  );
}

const CAGE_RINGS = [
  [-18.4, 2.1],
  [-19.6, 1.85],
  [-20.8, 1.55],
  [-22.0, 1.2],
];

/** Propellant tanks, engine bell and the lattice cage at the very back. */
export function EngineSection({ arm, status }) {
  const engineOn = !status?.engineOut;
  const m = materials();
  const cageRods = ring(8, 1, (a) => {
    const [z1, r1] = CAGE_RINGS[0];
    const [z2, r2] = CAGE_RINGS[CAGE_RINGS.length - 1];
    return {
      a: [Math.cos(a) * r1, Math.sin(a) * r1, z1],
      b: [Math.cos(a) * r2, Math.sin(a) * r2, z2],
    };
  });
  return (
    <group>
      {/* Spherical tanks */}
      {ring(8, 1.85, (a, x, y, i) => (
        <mesh key={`s${i}`} material={i % 2 ? m.hull : m.plating} position={[x, y, -14]}>
          <sphereGeometry args={[0.95, 24, 16]} />
        </mesh>
      ))}
      {/* Cylindrical tanks around a central core */}
      <Tube radius={1.1} length={5} z={-16.2} material={m.dark} />
      {ring(6, 1.7, (a, x, y, i) => (
        <group key={`c${i}`} position={[x, y, -16.3]}>
          <Tube radius={0.48} length={3.2} material={m.hull} />
          <Band radius={0.5} z={0.9} tube={0.04} material={m.gold} />
          <Band radius={0.5} z={-0.9} tube={0.04} material={m.gold} />
        </group>
      ))}
      {/* Thrust plate, engine bell and exhaust glow */}
      <Tube radius={2.15} length={0.3} z={-18.4} material={m.dark} />
      <Tube radius={0.55} radiusBack={1.4} length={1.8} z={-19.5} material={m.dark} segments={36} />
      <ThrusterFlame position={[0, 0, -20.45]} rotation={[-Math.PI / 2, 0, 0]}
        enabled={engineOn} getEffect={status?.getThrusterEffect} />
      {/* Lattice cage */}
      {CAGE_RINGS.map(([z, r]) => (
        <Band key={z} radius={r} z={z} tube={0.05} material={m.truss} />
      ))}
      <Rods rods={cageRods} radius={0.05} />
      <RoboticArm {...arm('engine')} position={[2.8, 0, -14]} rotation={[0, 0, -Math.PI / 2]} />
    </group>
  );
}
