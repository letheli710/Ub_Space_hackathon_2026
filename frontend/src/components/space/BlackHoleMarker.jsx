import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AU, BLACK_HOLE_POSITION } from '../../data/voyage.js';

const EDGE_X = 0.9; // keep the marker inside the view, in normalized screen units
const EDGE_Y = 0.82;
const ndc = new THREE.Vector3();

/**
 * Moves a DOM marker (owned by the Viewer) to the black hole's place on screen.
 * When the black hole is off screen or behind the camera, the marker sticks to the
 * nearest edge and its arrow points the way. The label shows the distance from the ship.
 */
export default function BlackHoleMarker({ element, shipFrame }) {
  const { camera, size } = useThree();

  useFrame(() => {
    const el = element.current;
    const ship = shipFrame.current;
    if (!el || !ship) return;

    ndc.copy(BLACK_HOLE_POSITION).project(camera);
    const behind = ndc.z > 1;
    let x = behind ? -ndc.x : ndc.x;
    let y = behind ? -ndc.y : ndc.y;
    const onScreen = !behind && Math.abs(x) <= EDGE_X && Math.abs(y) <= EDGE_Y;
    if (!onScreen) {
      if (x === 0 && y === 0) y = -1;
      const scale = Math.max(Math.abs(x) / EDGE_X, Math.abs(y) / EDGE_Y);
      x /= scale;
      y /= scale;
    }

    const px = ((x + 1) / 2) * size.width;
    const py = ((1 - y) / 2) * size.height;
    el.style.transform = `translate(${px}px, ${py}px)`;
    el.dataset.edge = onScreen ? 'false' : 'true';

    const arrow = el.firstChild;
    arrow.style.transform = `rotate(${Math.atan2(-y, x)}rad)`;

    const label = el.lastChild;
    const text = `BLACK HOLE · ${(ship.position.distanceTo(BLACK_HOLE_POSITION) / AU).toFixed(1)} AU`;
    if (label.textContent !== text) label.textContent = text;
  });

  return null;
}
