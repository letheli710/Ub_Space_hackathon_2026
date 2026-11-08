import { useEffect, useRef } from 'react';
import { Color, Quaternion, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { MODULES } from './station/StationShip.jsx';
import { SolarArrays, Wing } from './station/modules.jsx';
import { modelOrigin, DEMO_RENDER_SCALE } from '../simulation/demoPhysics.js';
import { demoRenderPosition, demoRenderQuaternion } from '../data/voyage.js';
import Asteroid from './space/Asteroid.jsx';
import RockTrail from './space/RockTrail.jsx';

// Floating origin: astronomical travel uses the map scale; nearby objects all use
// the same enlarged meter scale as the ship. Physics never uses rendered units.
function Part({ voyage, id }) {
  const ref = useRef();
  const tinted = useRef(new Map());
  const s = voyage.current.physics;
  const bond = s.bonds[id];
  const detached = s.fragments.find(f => f.id === id);
  const Module = MODULES.find(p => p.id === id)?.component;
  const arm = armId => ({ animate: false, ...(s.repairs.some(j => j.arm_id === armId) ? { pose: { yaw: 0, shoulder: 1, elbow: -1.9, wrist: .6, grip: .2, slide: 0 } } : {}) });
  useEffect(() => {
    const color = new Color(bond.health > 50 ? '#b76c27' : '#9c3023');
    ref.current?.traverse(object => {
      if (!object.isMesh || object.userData.damageMark || !object.material?.color) return;
      if (!tinted.current.has(object)) {
        const original = object.material;
        object.material = original.clone();
        tinted.current.set(object, { original, clone: object.material, color: original.color.clone() });
      }
      const material = tinted.current.get(object);
      material.clone.color.copy(material.color).lerp(color, bond.health >= 99.95 ? 0 : .12 + .65 * (100 - bond.health) / 100);
    });
  }, [bond.health]);
  useEffect(() => () => { for (const [object, m] of tinted.current) { if (object.material === m.clone) object.material = m.original; m.clone.dispose(); } tinted.current.clear(); }, []);
  const status = { engineOut: Boolean(detached) || s.force.length() < 1 || !s.burn || s.burn.linear.z <= 0 || s.faults.includes('Engine Failure'), solarCrisis: s.faults.includes('Solar Panel Power Crisis') };
  useFrame(() => {
    if (!ref.current) return;
    const state = voyage.current.physics;
    const current = state.fragments.find(f => f.id === id) ?? state.ship;
    ref.current.position.copy(demoRenderPosition(voyage.current, modelOrigin(current)));
    demoRenderQuaternion(voyage.current, current.q, ref.current.quaternion);
  });
  return <group ref={ref} scale={DEMO_RENDER_SCALE}>
    {id === 'solar' ? <SolarArrays arm={arm} status={status} mainWings={false} /> :
      id === 'solarRight' || id === 'solarLeft' ? <Wing z={-6} angle={id === 'solarLeft' ? Math.PI : 0} length={11} width={3} armId={id} arm={arm} /> :
        Module ? <Module arm={arm} spin={false} status={status} /> : null}
    {bond.marks.map((mark, i) => <mesh key={i} userData={{ damageMark: true }}
      position={new Vector3(...mark.point).addScaledVector(new Vector3(...mark.normal), .035)}
      quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...mark.normal))}>
      <circleGeometry args={[mark.radius, 12]} /><meshStandardMaterial color="#351b16" roughness={1} side={2} transparent opacity={Math.min(.95, .25 + (100 - bond.health) / 35)} />
    </mesh>)}
  </group>;
}
function Rock({ voyage, id, radius }) {
  const ref = useRef();
  const trail = useRef();
  useFrame(() => {
    const s = voyage.current.physics, rock = s.rocks.find(r => r.id === id);
    if (ref.current) {
      ref.current.visible = Boolean(rock);
      if (rock) {
        ref.current.position.copy(demoRenderPosition(voyage.current, rock.p));
        trail.current?.position.copy(ref.current.position);
        // Cosmetic tumble uses physical age, so pause/reset affect it too.
        ref.current.rotation.set(rock.age * 1.5, rock.age, 0);
      }
    }
  });
  // Tail follows the rock's motion as seen from the ship (relative velocity, in map axes).
  const getMotion = (out) => {
    const s = voyage.current.physics, rock = s.rocks.find(r => r.id === id);
    if (!rock) return false;
    out.copy(rock.v).sub(s.ship.v).applyQuaternion(voyage.current.frame);
  };
  return <>
    <group ref={ref}><Asteroid radius={radius * DEMO_RENDER_SCALE} /></group>
    <group ref={trail}><RockTrail radius={radius * DEMO_RENDER_SCALE} getMotion={getMotion} /></group>
  </>;
}
export default function DemoPhysicsObjects({ voyage }) {
  const s = voyage.current.physics;
  return <>
    {s.parts.map(p => <Part key={p.id} voyage={voyage} id={p.id} />)}
    {s.rocks.map(r => <Rock key={r.id} voyage={voyage} id={r.id} radius={r.radius} />)}
  </>;
}
