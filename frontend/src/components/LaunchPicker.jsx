import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// While an outer disaster is armed, a click (not a drag) in the 3D view picks the launch point.
// The point sits on a plane through the ship that faces the camera, so the hazard starts
// right under the mouse cursor. It is returned relative to the ship, which keeps moving.

const CLICK_TOLERANCE = 6; // pixels; more movement than this counts as a camera drag
const MIN_START_DISTANCE = 4; // keep hazards from spawning inside the ship

const ndc = new THREE.Vector2();
const normal = new THREE.Vector3();
const hit = new THREE.Vector3();
const plane = new THREE.Plane();
const raycaster = new THREE.Raycaster();

export default function LaunchPicker({ enabled, onLaunch, shipFrame }) {
  const { camera, gl } = useThree();
  const launch = useRef(onLaunch);
  launch.current = onLaunch;

  useEffect(() => {
    if (!enabled) return undefined;
    const canvas = gl.domElement;
    let down = null;

    const onPointerDown = (e) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK_TOLERANCE) return;

      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const ship = shipFrame.current?.position;
      if (!ship) return;
      camera.getWorldDirection(normal);
      plane.setFromNormalAndCoplanarPoint(normal, ship);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      hit.sub(ship);

      if (hit.length() < MIN_START_DISTANCE) {
        if (hit.lengthSq() === 0) hit.copy(normal).negate();
        hit.setLength(MIN_START_DISTANCE);
      }
      launch.current(hit.toArray());
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [enabled, camera, gl, shipFrame]);

  return null;
}
