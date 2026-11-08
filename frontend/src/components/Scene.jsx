import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import CameraControls from './CameraControls.jsx';
import LaunchPicker from './LaunchPicker.jsx';
import { StarField } from './space/Bodies.jsx';
import FlightScene, { flightHome } from './space/FlightScene.jsx';

export default function Scene({
  voyage,
  event,
  playing,
  fullPage = false,
  viewResetCount = 0,
  armed = null,
  hazards = [],
  impacts = [],
  onLaunch,
  onImpact,
  onMiss,
  onImpactDone,
  blackHole = false,
  blackHoleMarker,
}) {
  const shipFrame = useRef();

  return (
    <Canvas camera={{ fov: 45, near: 0.1, far: 12000, position: [0, 30, 60] }}>
      <color attach="background" args={['#020611']} />
      <StarField />

      <FlightScene
        voyage={voyage}
        event={event}
        playing={playing}
        hazards={hazards}
        impacts={impacts}
        onImpact={onImpact}
        onMiss={onMiss}
        onImpactDone={onImpactDone}
        shipFrame={shipFrame}
        blackHole={blackHole}
        blackHoleMarker={blackHoleMarker}
      />
      <LaunchPicker enabled={Boolean(armed)} onLaunch={onLaunch} shipFrame={shipFrame} />

      <OrbitControls
        makeDefault
        enablePan
        enableZoom={false}
        minDistance={3}
        maxDistance={60}
      />
      <CameraControls
        active={fullPage}
        view="flight"
        getHome={() => flightHome(voyage.current)}
        resetCount={viewResetCount}
      />
    </Canvas>
  );
}
