import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { pickLaunchOffset } from '../simulation/launchPlacement.js';

// While an outer disaster is armed, a click (not a drag) in the 3D view picks the launch point.
// The point sits on a plane through the ship that faces the camera, so the hazard starts
// right under the mouse cursor. It is returned relative to the ship, which keeps moving.

const CLICK_TOLERANCE = 6; // pixels; more movement than this counts as a camera drag

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

      const ship = shipFrame.current?.position;
      if (!ship) return;
      const offset = pickLaunchOffset(e.clientX, e.clientY, canvas.getBoundingClientRect(), camera, ship);
      if (offset) launch.current(offset);
    };
    const onPointerCancel = () => { down = null; };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [enabled, camera, gl, shipFrame]);

  return null;
}
