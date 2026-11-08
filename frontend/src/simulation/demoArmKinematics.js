import { Euler, Quaternion, Vector3 } from 'three';
import { DEMO_ARM_MOUNTS, DEMO_REPAIR_SITES } from './demoShip.js';

export const JOINT_LIMITS = { yaw: [-Math.PI,Math.PI], shoulder: [-1.5,1.5], elbow: [-2.4,.6], wrist: [-1.6,1.6], grip: [0,1], slide: [-Math.PI,Math.PI] };
export const DEFAULT_POSE = { yaw: 0, shoulder: .6, elbow: -1.2, wrist: .4, grip: .5, slide: 0 };
export const ARM_CONTACT_TOLERANCE = .12;
const Y = new Vector3(0,1,0), Z = new Vector3(0,0,1);
const wrap = a => ((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;

export function armMount(id, pose = DEFAULT_POSE) {
  const m = DEMO_ARM_MOUNTS[id];
  if (m.railAngle !== undefined) {
    const a = m.railAngle + (pose.slide ?? 0);
    return { position: new Vector3(Math.cos(a)*10.5,Math.sin(a)*10.5,-.74),
      rotation: new Quaternion().setFromAxisAngle(Z,a).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2)) };
  }
  return { position: new Vector3(...m.position), rotation: new Quaternion().setFromEuler(new Euler(...(m.rotation ?? [0,0,0]))) };
}

export function armToolPoint(id, pose) {
  const m = DEMO_ARM_MOUNTS[id], p = { ...DEFAULT_POSE, ...pose }, mount = armMount(id,p);
  return new Vector3(0,.42,0).applyAxisAngle(Z,p.wrist)
    .add(new Vector3(0,p.lower ?? m.lower ?? 1.3,0)).applyAxisAngle(Z,p.elbow)
    .add(new Vector3(0,p.upper ?? m.upper ?? 1.5,0)).applyAxisAngle(Z,p.shoulder)
    .add(new Vector3(0,.48,0)).applyAxisAngle(Y,p.yaw).applyQuaternion(mount.rotation).add(mount.position);
}

export function solveArmContact(id, point) {
  const m = DEMO_ARM_MOUNTS[id];
  const slide = m.railAngle === undefined ? 0 : wrap(Math.atan2(point[1],point[0])-m.railAngle);
  const mount = armMount(id,{slide}), target = new Vector3(...point).sub(mount.position).applyQuaternion(mount.rotation.clone().invert());
  target.y -= .48;
  const radial = Math.hypot(target.x,target.z);
  for (const extension of [1,1.25,1.5,1.75,2,2.5,3]) {
    const upper = (m.upper ?? 1.5)*extension, lower = (m.lower ?? 1.3)*extension, forearm = lower+.42;
    const cosine = (target.lengthSq()-upper*upper-forearm*forearm)/(2*upper*forearm);
    if (Math.abs(cosine)>1) continue;
    for (const sign of [1,-1]) for (const elbow of [-Math.acos(cosine),Math.acos(cosine)]) {
      const yaw = wrap(Math.atan2(-target.z,target.x)+(sign<0 ? Math.PI : 0));
      const shoulder = wrap(-Math.atan2(sign*radial,target.y)-Math.atan2(forearm*Math.sin(elbow),upper+forearm*Math.cos(elbow)));
      const pose = { yaw, shoulder, elbow, wrist: 0, grip: 0, slide, upper, lower };
      if (Object.entries(JOINT_LIMITS).some(([k,[lo,hi]])=>pose[k]<lo-1e-8 || pose[k]>hi+1e-8)) continue;
      if (armToolPoint(id,pose).distanceTo(new Vector3(...point)) < .001) return pose;
    }
  }
  return null;
}

export function repairContactPlans(s, partId) {
  const plans = [];
  for (const [id,mount] of Object.entries(DEMO_ARM_MOUNTS)) {
    if (s.bonds[mount.part]?.broken || !s.ship.parts.some(p=>p.id===mount.part) || s.repairs.some(j=>j.arm_id===id)) continue;
    for (const point of DEMO_REPAIR_SITES[partId] ?? []) {
      const pose = solveArmContact(id,point);
      if (pose) plans.push({ arm_id: id, part_id: partId, target: point, pose,
        score: (mount.part===partId ? -10 : 0) + pose.upper+pose.lower });
    }
  }
  return plans.sort((a,b)=>a.score-b.score);
}

export function advanceArmPose(current, target, dt) {
  for (const key of Object.keys(target)) {
    const difference = target[key] - current[key], rate = ['upper','lower'].includes(key) ? 1.5 : 1.8;
    current[key] += Math.sign(difference)*Math.min(Math.abs(difference),rate*dt);
  }
}
