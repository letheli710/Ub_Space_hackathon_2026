import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { StarField } from './space/Bodies.jsx';
import { DEFAULT_POSE, JOINT_LIMITS } from './station/RoboticArm.jsx';
import StationShip, { ARMS, MODULES } from './station/StationShip.jsx';
import LiveScene from './LiveScene.jsx';
import ArmControls from './ArmControls.jsx';

// Shift the rendered view right so the ship sits in the open space beside the control panel.
const VIEW_SHIFT = 0.12; // fraction of the canvas width

function ShiftView() {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.setViewOffset(size.width, size.height, -size.width * VIEW_SHIFT, 0, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
    };
  }, [camera, size.width, size.height]);
  return null;
}

const JOINTS = [
  ['yaw', 'Base yaw'],
  ['shoulder', 'Shoulder'],
  ['elbow', 'Elbow'],
  ['wrist', 'Wrist'],
  ['grip', 'Gripper'],
  ['slide', 'Rail position', true],
];

/** Spacecraft tab: inspect the modular ship, pull it apart and drive each robotic arm. */
function Preview() {
  const [exploded, setExploded] = useState(false);
  const [ringSpin, setRingSpin] = useState(true);
  const [animateArms, setAnimateArms] = useState(true);
  const [armId, setArmId] = useState(ARMS[0].id);
  const [armPoses, setArmPoses] = useState({});
  const pose = armPoses[armId];
  const onRail = ARMS.find((item) => item.id === armId)?.rail;

  const setJoint = (joint, value) =>
    setArmPoses((poses) => ({ ...poses, [armId]: { ...DEFAULT_POSE, ...poses[armId], [joint]: value } }));
  const release = () =>
    setArmPoses((poses) => {
      const next = { ...poses };
      delete next[armId];
      return next;
    });

  return (
    <section className="spacecraft-page">
      <Canvas camera={{ position: [30, 14, 32], fov: 45, near: 0.05, far: 200000 }}>
        <color attach="background" args={['#020611']} />
        <StarField />
        <hemisphereLight args={['#dfe8ff', '#1a2233', 0.8]} />
        <directionalLight position={[40, 30, 20]} intensity={2.6} />
        <directionalLight position={[-30, -10, -20]} intensity={0.6} color="#7fb2ff" />
        <StationShip exploded={exploded} ringSpin={ringSpin} animateArms={animateArms} armPoses={armPoses} />
        <OrbitControls makeDefault target={[0, 0, -2]} />
        <ShiftView />
      </Canvas>

      <aside className="panel spacecraft-panel">
        <h2 className="spacecraft-title">Modular Spacecraft</h2>
        <p className="muted">Drag to orbit · scroll to zoom</p>
        <p className="muted">Frontend model preview. Generator → LIVE SIM follows the backend ship and its measured joints.</p>

        <label>
          <input type="checkbox" checked={exploded} onChange={(e) => setExploded(e.target.checked)} /> Exploded view
        </label>
        <label>
          <input type="checkbox" checked={ringSpin} onChange={(e) => setRingSpin(e.target.checked)} /> Spin ring
        </label>
        <label>
          <input type="checkbox" checked={animateArms} onChange={(e) => setAnimateArms(e.target.checked)} /> Animate
          arms
        </label>

        <h4>MODULES ({MODULES.length})</h4>
        <ul>
          {MODULES.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>

        <h4>ROBOTIC ARMS ({ARMS.length})</h4>
        <select aria-label="Robotic arm" value={armId} onChange={(e) => setArmId(e.target.value)}>
          {ARMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {armPoses[item.id] ? ' · manual' : ''}
            </option>
          ))}
        </select>
        {JOINTS.filter(([, , railOnly]) => !railOnly || onRail).map(([joint, label]) => {
          const [min, max] = JOINT_LIMITS[joint];
          const value = (pose ?? DEFAULT_POSE)[joint];
          return (
            <div className="spacecraft-joint" key={joint}>
              <span>
                {label} <b>{value.toFixed(2)}</b>
              </span>
              <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step="0.01"
                value={value}
                onChange={(e) => setJoint(joint, Number(e.target.value))}
              />
            </div>
          );
        })}
        <button onClick={release} disabled={!pose}>
          Return arm to idle motion
        </button>
      </aside>
    </section>
  );
}

export default function SpacecraftViewer({ simulation, onLog }) {
  const [preview, setPreview] = useState(true);
  const [selectedArm, setSelectedArm] = useState('command');
  const [modelError, setModelError] = useState('');
  return <>
    <div className="spacecraft-mode" style={{ position: 'absolute', top: 88, right: 24, zIndex: 5 }}>
      <button onClick={() => setPreview(value => !value)}>{preview ? 'Show live Gazebo ship' : 'Open design preview'}</button>
    </div>
    {preview ? <Preview /> : <section className="spacecraft-page">
      {simulation.scene && <LiveScene scene={simulation.scene} state={simulation.state} shipOnly selectedArm={selectedArm} onError={setModelError} />}
      <aside className="panel spacecraft-panel">
        <h2 className="spacecraft-title">Live Gazebo Spacecraft</h2>
        <p className="muted">Drag to orbit · scroll to zoom. {simulation.ready ? 'Live measured joints' : 'Waiting for fresh backend telemetry'}.</p>
        <p className="muted">{simulation.scene?.ship_layout?.modules.length ?? 0} modules · {simulation.scene?.arms.length ?? 0} arms · Main Judging approves Robot Arms proposals.</p>
        {modelError && <p role="alert">{modelError}</p>}
        <ArmControls simulation={simulation} onLog={onLog} onSelect={setSelectedArm} />
      </aside>
    </section>}
  </>;
}
