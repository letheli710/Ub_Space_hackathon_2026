const ORBIT_RADII = [3.6, 5.8, 8.2];
const PLANET_COLORS = ['#458dc6', '#c16c44', '#8297bc'];
const FLAT = [-Math.PI / 2, 0, 0];

export default function PlanetarySystem() {
  return (
    <>
      <mesh>
        <sphereGeometry args={[1.3, 32, 32]} />
        <meshStandardMaterial color="#e6a64e" emissive="#d87918" emissiveIntensity={0.8} />
      </mesh>

      {ORBIT_RADII.map((radius, i) => (
        <group key={radius}>
          <mesh rotation={FLAT}>
            <torusGeometry args={[radius, 0.012, 8, 180]} />
            <meshBasicMaterial color="#27648e" />
          </mesh>
          <mesh position={[Math.cos(i * 2) * radius, 0, Math.sin(i * 2) * radius]}>
            <sphereGeometry args={[0.35 + i * 0.1, 24, 24]} />
            <meshStandardMaterial color={PLANET_COLORS[i]} />
          </mesh>
        </group>
      ))}

      <mesh rotation={FLAT}>
        <torusGeometry args={[6.8, 0.045, 8, 150]} />
        <meshBasicMaterial color="#00e0f8" />
      </mesh>
    </>
  );
}
