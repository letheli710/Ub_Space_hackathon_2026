import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BLACK_HOLE_POSITION, MOON, PLANETS, ROUTE, SUN, routeParameter, shipPose } from '../../data/voyage.js';
import { ImpactFlash, IncomingHazard } from '../Hazards.jsx';
import StationShip from '../station/StationShip.jsx';
import DemoPhysicsObjects from '../DemoPhysicsObjects.jsx';
import BlackHoleMarker from './BlackHoleMarker.jsx';
import SolarStorm from './SolarStorm.jsx';
import BlackHole from './BlackHole.jsx';
import { OrbitLine, Planet, Sun } from './Bodies.jsx';
import { getTextures } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const headingMatrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const direction = new THREE.Vector3();
const delta = new THREE.Vector3();
const side = new THREE.Vector3();
const heading = new THREE.Quaternion();

/** Camera start point for the flight view: behind and above the ship, looking at it. */
export function flightHome(voyage) {
  shipPose(voyage, position, direction);
  side.crossVectors(direction, UP).normalize();
  return {
    position: position
      .clone()
      .addScaledVector(direction, -12)
      .addScaledVector(UP, 4.5)
      .addScaledVector(side, 5),
    target: position.clone(),
  };
}

const ATMOSPHERES = { Earth: '#5fb6ff', Mars: '#ff9a6a', Venus: '#ffd9a0', Neptune: '#7aa2ff', Uranus: '#a6f2f5' };

const ROUTE_SEGMENTS = 400;
const ROUTE_POINTS = ROUTE.getSpacedPoints(ROUTE_SEGMENTS); // evenly spaced by distance
const ROUTE_POINTS_REVERSED = [...ROUTE_POINTS].reverse();
const ROUTE_COLOR = '#29eaff';

/**
 * The Earth ⇄ Mars route: dashed ahead of the ship, solid for the part of the
 * current leg already flown (from Earth on the way out, from Mars on the way back).
 */
function RouteLine({ voyage }) {
  const outbound = useRef();
  const inbound = useRef();

  useFrame(() => {
    const v = voyage.current;
    const travelled = Math.round(routeParameter(v) * ROUTE_SEGMENTS);
    const flown = v.direction === 1 ? travelled : ROUTE_SEGMENTS - travelled;
    // Draw only the first `flown` segments of the line that starts at this leg's origin.
    if (outbound.current) {
      outbound.current.visible = v.direction === 1;
      outbound.current.geometry.instanceCount = flown;
    }
    if (inbound.current) {
      inbound.current.visible = v.direction === -1;
      inbound.current.geometry.instanceCount = flown;
    }
  });

  if (voyage.current.physics) return <Line points={[ROUTE.getPointAt(0), ROUTE.getPointAt(1)]} color={ROUTE_COLOR} lineWidth={1.5} dashed dashSize={4} gapSize={3} transparent opacity={.5} />;
  return (
    <>
      <Line
        points={ROUTE_POINTS}
        color={ROUTE_COLOR}
        lineWidth={2.2}
        dashed
        dashSize={4}
        gapSize={3}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
      <Line ref={outbound} points={ROUTE_POINTS} color={ROUTE_COLOR} lineWidth={2.6} depthWrite={false} />
      <Line ref={inbound} points={ROUTE_POINTS_REVERSED} color={ROUTE_COLOR} lineWidth={2.6} depthWrite={false} />
    </>
  );
}

// Heading line: points straight out of the ship's nose (+Z in the model), so any angle
// between it and the route shows that the ship is not flying along the route.
// The modular ship is modelled about 41 units long (nose at z = 17.2); the flight view shows it
// scaled down so it fits the camera, hazard and route scale used here.
const SHIP_SCALE = 0.15;
const NOSE = [0, 0, 17.2 * SHIP_SCALE];
const SHIP_LENGTH = 41 * SHIP_SCALE;
const HEADING_POINTS = [NOSE, [0, 0, NOSE[2] + SHIP_LENGTH * 2]]; // about two ship lengths

function HeadingLine() {
  return (
    <Line points={HEADING_POINTS} color="#ff3b3b" lineWidth={3.5} transparent opacity={0.95} depthWrite={false} />
  );
}

const DUST_COUNT = 700;
const DUST_SIZE = 160;

/** Faint particles around the ship that make its speed visible. */
function SpaceDust({ shipFrame }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() - 0.5) * DUST_SIZE;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame(() => {
    const frame = shipFrame.current;
    if (!frame) return;
    const ship = frame.position;
    const attribute = geometry.attributes.position;
    const p = attribute.array;
    const half = DUST_SIZE / 2;
    for (let i = 0; i < p.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const offset = p[i + axis] - ship.getComponent(axis);
        if (offset > half) p[i + axis] -= DUST_SIZE;
        else if (offset < -half) p[i + axis] += DUST_SIZE;
      }
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={0.25} color="#9fc9ff" transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

export default function FlightScene({
  voyage,
  event,
  playing,
  hazards,
  impacts,
  onImpact,
  onMiss,
  onImpactDone,
  shipFrame,
  blackHole,
  blackHoleMarker,
  solarStorm,
  onStormReach,
  onStormDone,
}) {
  const { camera, controls } = useThree();
  const headingRef = useRef();
  const lastShip = useRef(null);
  const textures = getTextures();

  useFrame(() => {
    const frame = shipFrame.current;
    if (!frame) return;
    shipPose(voyage.current, position, direction);

    // Follow the ship: move the camera and its target by however far the ship moved.
    if (lastShip.current && controls) {
      delta.subVectors(position, lastShip.current);
      camera.position.add(delta);
      controls.target.add(delta);
    } else {
      lastShip.current = new THREE.Vector3();
    }
    lastShip.current.copy(position);

    frame.position.copy(position);
    // The model's nose is +Z: point it along the route and keep its top facing up.
    headingMatrix.lookAt(direction, ORIGIN, UP);
    heading.setFromRotationMatrix(headingMatrix);
    if (voyage.current.physics) headingRef.current.quaternion.copy(voyage.current.physics.ship.q);
    else headingRef.current.quaternion.slerp(heading, 0.08);
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      {/* Sunlight from the center of the system; no falloff so outer planets stay lit. */}
      <pointLight position={SUN.position.toArray()} intensity={3.2} decay={0} color="#fff4dd" />

      <Sun position={SUN.position} radius={SUN.radius} />
      {PLANETS.map((planet) => (
        <group key={planet.name}>
          <OrbitLine radius={planet.orbit} />
          <Planet
            position={planet.position}
            radius={planet.radius}
            texture={textures[planet.name]}
            atmosphere={ATMOSPHERES[planet.name]}
            ring={planet.name === 'Saturn' ? '#d9c79f' : undefined}
          />
        </group>
      ))}
      <Planet position={MOON.position} radius={MOON.radius} texture={textures.Moon} spin={0.004} />
      {blackHole && <BlackHole position={BLACK_HOLE_POSITION} />}
      {blackHole && <BlackHoleMarker element={blackHoleMarker} shipFrame={shipFrame} />}
      {solarStorm && (
        <SolarStorm
          key={solarStorm.id}
          storm={solarStorm}
          playing={playing}
          shipFrame={shipFrame}
          onReach={onStormReach}
          onDone={onStormDone}
        />
      )}

      <group ref={shipFrame}>
        <group ref={headingRef}>
          <group scale={SHIP_SCALE}>
            {!voyage.current.physics && <StationShip event={event} ringSpin={playing} />}
          </group>
          <HeadingLine />
        </group>
        <pointLight position={[5, 6, 8]} intensity={80} color="#7ecbff" />
      </group>

      {voyage.current.physics && <DemoPhysicsObjects voyage={voyage} />}

      {/* Hazards fly in world space on fixed courses, so they do not follow the ship. */}
      {hazards.map((hazard) => (
        <IncomingHazard
          key={hazard.id}
          hazard={hazard}
          playing={playing}
          shipFrame={shipFrame}
          onImpact={onImpact}
          onMiss={onMiss}
        />
      ))}
      {impacts.map((impact) => (
        <ImpactFlash key={impact.id} impact={impact} onDone={onImpactDone} />
      ))}

      <RouteLine voyage={voyage} />
      <SpaceDust shipFrame={shipFrame} />
    </>
  );
}
