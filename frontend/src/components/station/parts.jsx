import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { materials } from './materials.js';

// Small building blocks shared by the station modules. Ship axis is +Z (front) / −Z (engines).

const UP = new THREE.Vector3(0, 1, 0);

/** Many thin rods drawn in one batch. rods: [{ a: [x,y,z], b: [x,y,z] }] */
export function Rods({ rods, radius = 0.05, material }) {
  const ref = useRef();
  const geometry = useMemo(() => new THREE.CylinderGeometry(radius, radius, 1, 6), [radius]);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    rods.forEach((rod, i) => {
      a.fromArray(rod.a);
      b.fromArray(rod.b);
      dir.subVectors(b, a);
      const length = dir.length();
      q.setFromUnitVectors(UP, dir.normalize());
      matrix.compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, length, 1));
      ref.current.setMatrixAt(i, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [rods]);

  return <instancedMesh ref={ref} args={[geometry, material ?? materials().truss, rods.length]} />;
}

/**
 * A square lattice truss along local +Z from 0 to length, `width` wide, with a cross
 * frame and one diagonal per face in every bay.
 */
export function trussRods(length, width) {
  const h = width / 2;
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const bays = Math.max(1, Math.round(length / width));
  const bay = length / bays;
  const rods = corners.map(([x, y]) => ({ a: [x, y, 0], b: [x, y, length] }));
  for (let i = 0; i <= bays; i++) {
    const z = i * bay;
    for (let c = 0; c < 4; c++) {
      const [x1, y1] = corners[c];
      const [x2, y2] = corners[(c + 1) % 4];
      rods.push({ a: [x1, y1, z], b: [x2, y2, z] });
      if (i < bays) {
        const flip = (i + c) % 2 === 0;
        rods.push({
          a: [flip ? x1 : x2, flip ? y1 : y2, z],
          b: [flip ? x2 : x1, flip ? y2 : y1, z + bay],
        });
      }
    }
  }
  return rods;
}

/** A lattice truss between two points. */
export function Truss({ from, to, width = 0.9, radius = 0.045 }) {
  const { position, quaternion, rods } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    return {
      position: a,
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()),
      rods: trussRods(dir.length(), width),
    };
  }, [from, to, width]);

  return (
    <group position={position} quaternion={quaternion}>
      <Rods rods={rods} radius={radius} />
    </group>
  );
}

/** A cylinder along Z centred at z. */
export function Tube({ radius, radiusBack, length, z = 0, segments = 32, material, ...props }) {
  return (
    <mesh position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]} material={material} {...props}>
      <cylinderGeometry args={[radius, radiusBack ?? radius, length, segments]} />
    </mesh>
  );
}

/** A thin band around the Z axis, e.g. a ring rib or a gold stripe. */
export function Band({ radius, z = 0, tube = 0.06, material }) {
  return (
    <mesh position={[0, 0, z]} material={material}>
      <torusGeometry args={[radius, tube, 8, 48]} />
    </mesh>
  );
}
