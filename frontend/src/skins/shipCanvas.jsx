// PROTOTYPE — throwaway. Shared mock data + 3D ship for the visual-direction variants.
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { useCallback, useEffect, useRef, useState } from 'react';
import StationShip from '../components/station/StationShip.jsx';

export { default as logo } from '../assets/interstellar-x4-logo.webp';

export const TABS = ['Home', 'Spacecraft', 'Generator', 'Planetary Trajectories', 'AI Logs', 'AI API'];
export const OUTER = ['Asteroid Collision', 'Black Hole Encounter', 'Solar Storm', 'Alien Encounter'];
export const INNER = ['Oxygen Leak', 'Spacecraft Fire', 'AI System Malfunction', 'Robotic Arm Malfunction', 'Engine Failure', 'Thruster Failure', 'Solar Panel Power Crisis'];
export const FEATURES = ['Realistic Disaster Simulation', 'AI-Driven Decision Support', '3D Interactive Spacecraft'];
export const TAGLINE = 'AI-Powered Spacecraft Disaster Simulator';
export const LEAD = 'An interactive 3D platform where users simulate spacecraft emergencies, analyze mission risks, and explore how AI guides real-time decisions and recovery in space.';

const pad = (n) => String(Math.floor(n)).padStart(2, '0');
export const clock = (s) => `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}`;

/** Fake demo voyage: ticking clock, systems, AI agents, event log, triggerable disasters. */
export function useMockSim() {
  const [t, setT] = useState(0);
  const [event, setEvent] = useState(null);
  const [logs, setLogs] = useState([
    { t: 0, text: 'DEMO browser physics ready · optional Gazebo backend disconnected' },
    { t: 0, text: 'DEPARTURE · Earth → Mars' },
    { t: 0, text: 'PROPELLING · autonomous course correction · no Main Judging approval required' },
  ]);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const trigger = useCallback((name) => {
    setEvent({ name, severity: 65 });
    setLogs((l) => [{ t: Date.now(), text: `DISASTER INJECTED · ${name} · Severity 65%`, alert: true }, ...l].slice(0, 12));
  }, []);
  const clear = useCallback(() => {
    setEvent(null);
    setLogs((l) => [{ t: Date.now(), text: 'DEMO RESET · All systems nominal' }, ...l].slice(0, 12));
  }, []);
  const hit = event ? 1 : 0;
  const systems = [
    { key: 'Structure', label: 'Structural integrity', value: 100 - hit * 18 },
    { key: 'Solar', label: 'Solar wings', value: 100 - hit * 35 },
    { key: 'Fuel', label: 'Propellant', value: 87 },
    { key: 'Power', label: 'Battery charge', value: 92 - hit * 21 },
    { key: 'Drive', label: 'Propulsion', value: 100 - hit * 9 },
    { key: 'Energy', label: 'Energy', value: 96 - hit * 14 },
  ];
  const agents = [
    { name: 'Main Judging', state: event ? 'Evaluating' : 'Standby', ok: true },
    { name: 'Propelling', state: 'Course correction', ok: true },
    { name: 'Energy', state: event ? 'Load shedding' : 'Nominal', ok: !event },
    { name: 'Robot Arms', state: 'Idle', ok: true },
  ];
  return {
    t,
    met: clock(t + 7),
    day: 16 + Math.floor(t / 20),
    event,
    trigger,
    clear,
    logs,
    systems,
    agents,
    nav: { origin: 'Earth', destination: 'Mars', phase: 'TRANSFER', progress: 0.31 + t / 4000 },
    velocity: (7.9 + Math.sin(t / 6) * 0.03).toFixed(2),
    propellantKg: (3996.4 - t * 0.05).toFixed(1),
    massKg: '24 396',
    attitude: 'ROTATING',
    angular: '0.0331',
    timeScale: '200 kx',
  };
}

function Spinner({ event, yaw = Math.PI / 2 - 0.55, tilt = 0.38, scale = 0.2, swing = 0.4 }) {
  const ref = useRef();
  useFrame((s) => {
    ref.current.rotation.y = yaw + Math.sin(s.clock.elapsedTime * 0.3) * swing;
  });
  return (
    <group rotation={[tilt, 0, 0]} scale={scale}>
      <group ref={ref}>
        <group position={[0, 0, 3.5]}>
          <StationShip event={event} />
        </group>
      </group>
    </group>
  );
}

const LIGHTS = {
  cool: [['ambient', 1.6, '#eef4ff'], ['point', [6, 8, 8], 120, '#ffffff'], ['point', [-8, -2, 4], 40, '#bcd6ff']],
  clinical: [['ambient', 2.2, '#ffffff'], ['point', [4, 10, 8], 140, '#ffffff'], ['point', [-8, 2, 6], 60, '#dfeaff']],
  warm: [['ambient', 0.9, '#fff2e0'], ['point', [6, 6, 8], 110, '#ffd7a0'], ['point', [-8, -2, 4], 30, '#6f7c8f']],
  logo: [['ambient', 1.0, '#ffffff'], ['point', [5, 6, 8], 90, '#9fd8ff'], ['point', [-6, -2, 4], 50, '#a58bff']],
  mono: [['ambient', 1.4, '#ffffff'], ['point', [6, 8, 8], 100, '#ffffff'], ['point', [-8, -4, 2], 15, '#ffffff']],
};

/** Absolutely-positioned canvas with the real station ship. Parent must be position:relative. */
export function ShipCanvas({ event, lights = 'cool', stars = true, fov = 40, z = 10, ...ship }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas camera={{ position: [0, 0, z], fov }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        {LIGHTS[lights].map(([kind, a, b, c], i) =>
          kind === 'ambient' ? <ambientLight key={i} intensity={a} color={b} /> : <pointLight key={i} position={a} intensity={b} color={c} />,
        )}
        {stars && <Stars radius={60} depth={40} count={1800} factor={2.2} saturation={0} fade speed={0.3} />}
        <Spinner event={event} {...ship} />
      </Canvas>
    </div>
  );
}
