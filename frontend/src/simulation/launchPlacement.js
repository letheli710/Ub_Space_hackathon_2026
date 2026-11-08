import { Plane, Raycaster, Vector2, Vector3 } from 'three';

/** Project a screen click onto the camera-facing plane through the moving ship. */
export function pickLaunchOffset(clientX, clientY, rect, camera, shipPosition) {
  if (!rect.width || !rect.height) return null;
  const ndc = new Vector2((clientX - rect.left) / rect.width * 2 - 1,
    -(clientY - rect.top) / rect.height * 2 + 1);
  const ray = new Raycaster();
  ray.setFromCamera(ndc, camera);
  const plane = new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), shipPosition);
  const hit = ray.ray.intersectPlane(plane, new Vector3());
  // Do not move close clicks outward: placement must stay under the pointer.
  return hit ? hit.sub(shipPosition).toArray() : null;
}
