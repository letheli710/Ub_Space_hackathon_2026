import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Unreal Engine style viewport keys on top of OrbitControls.
//   W / ArrowUp      zoom in        S / ArrowDown   zoom out
//   A / ArrowLeft    move left      D / ArrowRight  move right
//   Two-finger swipe up / down (trackpad or touch screen): look up / down
//   Pinch (trackpad): zoom
// Keys only work while the 3D view has focus (click it first), like an Unreal viewport.

const KEY_ACTIONS = {
  KeyW: 'in',
  ArrowUp: 'in',
  KeyS: 'out',
  ArrowDown: 'out',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const MIN_DISTANCE = 3;
const MAX_DISTANCE = 35;
const ZOOM_RATE = 1.4; // share of the distance covered per second
const MOVE_RATE = 0.9; // share of the distance moved sideways per second
const LOOK_PER_PIXEL = 0.0025; // radians per scrolled pixel
const MAX_PITCH = 1.45; // radians, keeps the camera from flipping over

const UP = new THREE.Vector3(0, 1, 0);
const view = new THREE.Vector3();
const side = new THREE.Vector3();

function zoom(camera, controls, factor) {
  view.subVectors(camera.position, controls.target);
  const distance = THREE.MathUtils.clamp(view.length() * factor, MIN_DISTANCE, MAX_DISTANCE);
  camera.position.copy(controls.target).addScaledVector(view.normalize(), distance);
}

function look(camera, controls, angle) {
  view.subVectors(controls.target, camera.position);
  const distance = view.length();
  const yaw = Math.atan2(view.x, view.z);
  const pitch = THREE.MathUtils.clamp(Math.asin(view.y / distance) + angle, -MAX_PITCH, MAX_PITCH);
  view.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  controls.target.copy(camera.position).addScaledVector(view, distance);
}

export default function CameraControls({ active, home, resetCount }) {
  const { camera, controls, gl } = useThree();
  const held = useRef(new Set());

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '3D view. W A S D or arrow keys move the camera.');

    const onPointerDown = () => canvas.focus({ preventScroll: true });
    const onKeyDown = (e) => {
      const action = KEY_ACTIONS[e.code];
      if (!action || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      held.current.add(action);
    };
    const onKeyUp = (e) => held.current.delete(KEY_ACTIONS[e.code]);
    const onBlur = () => held.current.clear();

    const onWheel = (e) => {
      if (!controls) return;
      e.preventDefault();
      if (e.ctrlKey) {
        zoom(camera, controls, Math.exp(e.deltaY * 0.01)); // trackpad pinch
      } else {
        look(camera, controls, e.deltaY * LOOK_PER_PIXEL);
      }
      controls.update();
    };

    let lastTouchY = null;
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !controls) {
        lastTouchY = null;
        return;
      }
      e.preventDefault();
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (lastTouchY !== null) {
        look(camera, controls, (lastTouchY - y) * LOOK_PER_PIXEL);
        controls.update();
      }
      lastTouchY = y;
    };
    const onTouchEnd = () => {
      lastTouchY = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('blur', onBlur);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('blur', onBlur);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [camera, controls, gl]);

  useEffect(() => {
    if (active) gl.domElement.focus({ preventScroll: true });
  }, [active, gl]);

  // Reset View button: back to the starting camera position, looking at the origin.
  useEffect(() => {
    if (!resetCount || !controls) return;
    held.current.clear();
    camera.position.set(...home);
    controls.target.set(0, 0, 0);
    controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCount]);

  useFrame((_, delta) => {
    const keys = held.current;
    if (!controls || keys.size === 0) return;
    const dt = Math.min(delta, 0.05);

    if (keys.has('in')) zoom(camera, controls, Math.exp(-ZOOM_RATE * dt));
    if (keys.has('out')) zoom(camera, controls, Math.exp(ZOOM_RATE * dt));

    const sideways = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    if (sideways) {
      camera.getWorldDirection(view);
      side.crossVectors(view, UP).normalize();
      const step = camera.position.distanceTo(controls.target) * MOVE_RATE * dt * sideways;
      camera.position.addScaledVector(side, step);
      controls.target.addScaledVector(side, step);
    }
    controls.update();
  });

  return null;
}
