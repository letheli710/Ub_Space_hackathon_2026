import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Box3, Sphere, Vector3 } from 'three';
import CameraControls from './CameraControls.jsx';
import EnvironmentModel from './EnvironmentModel.jsx';

// Keep the camera configuration stable across 10 Hz telemetry renders.
const CAMERA = { position: [22, 18, 26], fov: 45, near: 0.05, far: 20000 };

function FollowCamera({ rootRef, shipId, mapView, resetCount, revision }) {
  const { camera, controls, size } = useThree();
  const previous = useRef(null);
  const fitted = useRef('');
  const box = useRef(new Box3()), sphere = useRef(new Sphere());
  const position = useRef(new Vector3()), delta = useRef(new Vector3());
  const fitKey = `${revision}:${mapView}:${resetCount}:${size.width}:${size.height}:${camera.uuid}`;
  useFrame(() => {
    if (!rootRef.current || !controls) return;
    rootRef.current.updateWorldMatrix(true, true);
    const subject = mapView ? rootRef.current : rootRef.current.getObjectByName(shipId);
    if (!subject) return;
    subject.getWorldPosition(position.current);
    if (fitted.current !== fitKey) {
      box.current.setFromObject(subject);
      if (box.current.isEmpty()) return;
      box.current.getBoundingSphere(sphere.current);
      const { center, radius } = sphere.current;
      const distance = Math.max(6, radius * 1.3 / Math.sin(Math.min(camera.fov * Math.PI / 180, 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect)) / 2));
      camera.position.copy(center).add(new Vector3(0.8, mapView ? 0.65 : 1.8, 1).normalize().multiplyScalar(distance));
      controls.target.copy(center);
      controls.minDistance = Math.max(0.2, radius * 0.1);
      controls.maxDistance = Math.max(100, distance * 8);
      camera.far = Math.max(10000, distance * 30);
      camera.updateProjectionMatrix();
      fitted.current = fitKey;
      previous.current = position.current.clone();
    } else if (!mapView && previous.current) {
      delta.current.subVectors(position.current, previous.current);
      camera.position.add(delta.current); controls.target.add(delta.current);
      previous.current.copy(position.current);
    }
    controls.update();
  });
  return null;
}

export default function Scene({ scene, state, planet = false, fullPage = false, viewResetCount = 0, onError }) {
  const rootRef = useRef();
  return (
    <Canvas camera={CAMERA}>
      <color attach="background" args={['#030a19']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[30, 50, 20]} intensity={2.5} />
      <Stars radius={3000} depth={1000} count={2000} factor={5} fade />
      <EnvironmentModel scene={scene} state={state} rootRef={rootRef} onError={onError} />
      <OrbitControls makeDefault enablePan enableZoom={false} />
      <FollowCamera rootRef={rootRef} shipId={scene.ship_entity_id} mapView={planet} resetCount={viewResetCount} revision={scene.revision} />
      <CameraControls active={fullPage} />
    </Canvas>
  );
}
