import { useLoader } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo } from 'react';
import { Color, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { disposeMeshMaterials, instantiateMesh } from '../simulation/meshAssets.js';
import { assetUrl } from '../simulation/useSimulation.js';
import { poseProps, resolveScene } from '../simulation/sceneGraph.js';

function Surface({ color }) {
  return <meshStandardMaterial color={new Color(...color.slice(0, 3))} opacity={color[3]} transparent={color[3] < 1} roughness={0.65} />;
}

function ImportedMesh({ visual }) {
  const { geometry, color } = visual;
  const loader = { glb: GLTFLoader, gltf: GLTFLoader, stl: STLLoader, obj: OBJLoader, dae: ColladaLoader }[geometry.format];
  if (!loader) throw new Error(`Unsupported mesh format: ${geometry.format}`);
  const loaded = useLoader(loader, assetUrl(geometry.uri));
  const model = useMemo(() => {
    if (geometry.format === 'stl') return null;
    return instantiateMesh(loaded, visual);
  }, [loaded, geometry.format, color, visual.material_override]);
  useEffect(() => () => disposeMeshMaterials(model), [model]);
  if (geometry.format === 'stl') return <mesh geometry={loaded} scale={geometry.scale} dispose={null}><Surface color={color} /></mesh>;
  return <primitive object={model} scale={geometry.scale} dispose={null} />;
}

function Visual({ visual }) {
  const { geometry: g, color } = visual;
  let shape, rotation;
  switch (g.type) {
    case 'mesh': return <group {...poseProps(visual.pose)}><ImportedMesh visual={visual} /></group>;
    case 'box': shape = <boxGeometry args={g.size} />; break;
    case 'sphere': shape = <sphereGeometry args={[g.radius[0], 32, 20]} />; break;
    case 'cylinder':
      shape = <cylinderGeometry args={[g.radius[0], g.radius[0], g.length[0], 24]} />;
      rotation = [Math.PI / 2, 0, 0]; break;
    case 'capsule':
      shape = <capsuleGeometry args={[g.radius[0], g.length[0], 8, 16]} />;
      rotation = [Math.PI / 2, 0, 0]; break;
    case 'plane': {
      const normal = new Vector3(...g.normal).normalize();
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
      return <group {...poseProps(visual.pose)}><mesh quaternion={q}><planeGeometry args={g.size} /><Surface color={color} /></mesh></group>;
    }
    default: throw new Error(`Unsupported model geometry: ${g.type}`);
  }
  return <group {...poseProps(visual.pose)}><mesh rotation={rotation}>{shape}<Surface color={color} /></mesh></group>;
}

class ModelError extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { this.props.onError(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function EnvironmentModel({ scene, state, rootRef, onError }) {
  const entities = useMemo(() => resolveScene(scene, state), [scene, state]);
  return (
    <group ref={rootRef} rotation={[-Math.PI / 2, 0, 0]}>
      {entities.map(entity => (
        <group key={`${scene.revision}:${entity.id}`} name={entity.id} {...poseProps(entity.pose)}>
          {entity.links.map(link => (
            <group key={link.id} name={link.id} {...poseProps(link.pose)}>
              {link.visuals.map(visual => (
                <ModelError key={`${scene.revision}:${visual.id}`} onError={onError}>
                  <Suspense fallback={null}><Visual visual={visual} /></Suspense>
                </ModelError>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
