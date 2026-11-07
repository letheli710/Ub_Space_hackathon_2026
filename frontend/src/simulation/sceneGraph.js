export function poseProps(pose) {
  const p = pose?.position ?? {}, q = pose?.orientation ?? {};
  return { position: [p.x ?? 0, p.y ?? 0, p.z ?? 0], quaternion: [q.x ?? 0, q.y ?? 0, q.z ?? 0, q.w ?? 1] };
}

// Render by scoped frame identity, never by array order or a particular ship's name.
export function resolveScene(scene, state) {
  if (scene.schema_version !== 1 || scene.up_axis !== 'Z' || scene.units !== 'meters') {
    throw new Error('Unsupported scene coordinates or schema');
  }
  // Accept native tf2 separators as well as the canonical SDF scoped IDs.
  const frameKey = name => name.replaceAll('::', '/').replace(/^\//, '');
  const transforms = new Map((state?.transforms ?? []).map(value => [frameKey(value.child_frame_id), value]));
  return scene.entities.map(entity => ({ ...entity,
    pose: transforms.get(frameKey(entity.id)) ?? entity.pose_in_world,
    links: entity.links.map(link => ({ ...link, pose: transforms.get(frameKey(link.id)) ?? link.pose_in_model })) }));
}
