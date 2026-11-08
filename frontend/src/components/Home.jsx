import { Canvas, useFrame } from '@react-three/fiber';
import {
  Box,
  BrainCircuit,
  CircleCheck,
  Gamepad2,
  Layers,
  Play,
  Rocket,
  Settings,
} from 'lucide-react';
import { useRef } from 'react';
import logo from '../assets/interstellar-x4-logo.webp';
import { getMetrics } from './Telemetry.jsx';
import StationShip from './station/StationShip.jsx';

const FEATURES = [
  {
    icon: Gamepad2,
    title: 'Realistic Disaster Simulation',
  },
  {
    icon: BrainCircuit,
    title: 'AI-Driven Decision Support',
  },
  {
    icon: Layers,
    title: '3D Interactive Spacecraft',
  },
];

const SHOWCASE_YAW = Math.PI / 2 - 0.55; // nose to the right, turned slightly toward the viewer

/** Ship for the hero image, gently swinging around a three-quarter view. */
function ShowcaseShip({ event }) {
  const ref = useRef();
  const time = useRef(0);
  useFrame((_, delta) => {
    time.current += delta;
    ref.current.rotation.y = SHOWCASE_YAW + Math.sin(time.current * 0.35) * 0.4;
  });
  return (
    <group rotation={[0.38, 0, 0]} scale={0.2}>
      <group ref={ref}>
        {/* The ship's middle sits near z = -3.5 in model space; shift it to the centre. */}
        <group position={[0, 0, 3.5]}>
          <StationShip event={event} />
        </group>
      </group>
    </group>
  );
}

function Meter({ value }) {
  return (
    <span className="home-meter">
      <span style={{ width: `${value}%` }} />
    </span>
  );
}

export default function Home({ event, onNavigate, demoStatus }) {
  const metrics = Object.fromEntries(getMetrics(event));
  const systems = [
    ['Power', metrics['Battery Level']],
    ['Solar', metrics['Solar Panel Health']],
    ['Hull', metrics['Hull Integrity']],
  ];

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-earth" aria-hidden="true" />
        <div className="home-copy">
          <img className="home-logo" src={logo} alt="Interstellar X⁴" />
          <p className="home-tagline">AI-Powered Spacecraft Disaster Simulator</p>
          <p className="home-lead">
            An interactive 3D platform where users simulate spacecraft emergencies, analyze mission
            risks, and explore how AI guides real-time decisions and recovery in space.
          </p>

          <div className="home-actions">
            <button className="home-primary" onClick={() => onNavigate('Generator')}>
              <Play size={18} fill="currentColor" /> Launch Simulator
            </button>
            <button className="home-secondary" onClick={() => onNavigate('Planetary Trajectories')}>
              <Box size={18} /> Explore Features
            </button>
          </div>

          <ul className="home-highlights">
            {FEATURES.map(({ icon: Icon, title }) => (
              <li key={title}>
                <Icon size={26} strokeWidth={1.5} />
                <span>{title}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="home-visual">
          <div className="home-canvas">
            <Canvas camera={{ position: [0, 0, 10], fov: 40 }} gl={{ alpha: true }}>
              <ambientLight intensity={1.2} />
              <pointLight position={[5, 6, 8]} intensity={90} color="#7ecbff" />
              <pointLight position={[-6, -2, 4]} intensity={40} color="#9b7bff" />
              <ShowcaseShip event={event} />
            </Canvas>
          </div>

          <div className="home-card card-status">
            <span className="home-card-label">
              <CircleCheck size={15} /> MISSION STATUS
            </span>
            <strong className={event ? 'alert' : ''}>{event ? 'HAZARD ACTIVE' : 'NOMINAL'}</strong>
          </div>

          <div className="home-card card-velocity">
            <span className="home-card-label">
              <Rocket size={15} /> VELOCITY
            </span>
            <strong>{demoStatus?.inOrbit ? 'IN ORBIT' : `${(demoStatus?.speedKmS ?? 0).toFixed(1)} km/s`}</strong>
          </div>

          <div className="home-card card-ai">
            <span className="home-card-label">
              <BrainCircuit size={15} /> AI DECISION
            </span>
            <span className="home-ai-state">
              <i className={event ? 'alert' : ''} />
              {event ? `Responding · ${event.name}` : 'Monitoring · Stable'}
            </span>
          </div>

          <div className="home-card card-systems">
            <span className="home-card-label">
              <Settings size={15} /> SYSTEMS
            </span>
            {systems.map(([label, value]) => (
              <div className="home-system" key={label}>
                <span>✓ {label}</span>
                <b>{value}%</b>
                <Meter value={value} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
