import { clone } from 'three/addons/utils/SkeletonUtils.js';

export function instantiateMesh(loaded, visual) {
  const model = clone(loaded.scene ?? loaded);
  function copyMaterial(material) {
    const copy = material.clone();
    if (visual.material_override && copy.color) copy.color.setRGB(...visual.color.slice(0, 3));
    copy.opacity *= visual.color[3];
    copy.transparent ||= visual.color[3] < 1;
    return copy;
  }
  model.traverse(child => {
    if (!child.isMesh) return;
    // Three renders material arrays by geometry groups; a single-material mesh
    // without groups must retain a single material to remain visible.
    child.material = Array.isArray(child.material) ? child.material.map(copyMaterial) : copyMaterial(child.material);
  });
  return model;
}

export function disposeMeshMaterials(model) {
  model?.traverse(child => {
    if (!child.isMesh) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
  });
}
