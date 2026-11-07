import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { instantiateMesh, disposeMeshMaterials } from '../src/simulation/meshAssets.js';

test('imported single-material OBJ meshes stay renderable and do not mutate cached assets', () => {
  const source = new OBJLoader().parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  const originalMaterial = source.children[0].material;
  let originalDisposed = false;
  originalMaterial.addEventListener('dispose', () => { originalDisposed = true; });
  const instance = instantiateMesh(source, { color: [0.1, 0.2, 0.3, 0.5], material_override: true });
  const mesh = instance.children[0];
  assert.equal(mesh.geometry.attributes.position.count, 3);
  assert.equal(mesh.material.isMaterial, true);
  assert.notEqual(mesh.material, originalMaterial);
  assert.equal(mesh.material.opacity, 0.5);
  assert.equal(originalMaterial.opacity, 1);
  disposeMeshMaterials(instance);
  assert.equal(originalDisposed, false);
});
