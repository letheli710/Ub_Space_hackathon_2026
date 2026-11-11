import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createVoyage, stepVoyage } from '../src/data/voyage.js';
import { coastDemo, commandDemoBurn, demoTelemetry, launchDemoRock, setDemoCourseCorrection, triggerDemoSolarStorm } from '../src/simulation/demoPhysics.js';
import { buildDemoObservation } from '../src/simulation/demoAI.js';
import { navigationState } from '../src/simulation/missionGuidance.js';
import { localCourseError } from '../src/simulation/demoFlightControl.js';
import { readDemoThrusterEffect } from '../src/simulation/demoVisualEffects.js';

const run = (v, seconds) => { for (let t=0;t<seconds-1e-9;t+=1/60) stepVoyage(v,Math.min(1/60,seconds-t)); };
const impact = v => launchDemoRock(v.physics,{target_id:'command',mass_kg:1000,speed_m_s:60,warning_s:2});
const disturbanceVelocity = s => s.ship.v.clone().sub(s.cruiseVelocity);

test('a real impact displaces the free body visibly; cut thrust preserves inertial drift and spin', () => {
  const v=createVoyage({physical:true}); coastDemo(v.physics); impact(v);
  const navVelocity=v.navigationBody.velocity.clone(), frame=v.frame.clone();
  run(v,10); const s=v.physics; // let the reflected rock's secondary engine contact pass
  assert.ok(s.lastImpact);
  const p=s.ship.p.clone(), dv=disturbanceVelocity(s), angular=s.ship.L.clone(), q=s.ship.q.clone();
  const initialError=demoTelemetry(s).deviationM;
  run(v,8);
  assert.ok(demoTelemetry(s).deviationM>initialError+5);
  assert.ok(v.mapPosition.distanceTo(v.navigationBody.position)>1,'meter-scale physical drift must be visible beside the enlarged ship');
  assert.ok(disturbanceVelocity(s).distanceTo(dv)<1e-8);
  assert.ok(s.ship.L.distanceTo(angular)<1e-8);
  assert.ok(q.angleTo(s.ship.q)>.001,'spin remains free without powered stabilization');
  assert.ok(s.ship.p.distanceTo(p)>60000);
  assert.ok(v.navigationBody.velocity.distanceTo(navVelocity)<1e-8);
  assert.ok(v.frame.angleTo(frame)<1e-12,'rendering must not rotate bodies back onto the route');
  assert.equal(s.force.length(),0); assert.equal(s.torque.length(),0); assert.equal(s.fuel,4000);
  assert.ok(navigationState(v).route_error_map_units>10);
});

test('standing Propelling authority recovers an impact gradually with bounded forces, torque and fuel use', () => {
  const v=createVoyage({physical:true}); impact(v);
  run(v,3); const s=v.physics, hitPosition=s.ship.p.clone();
  assert.ok(s.lastImpact); assert.ok(demoTelemetry(s).deviationM>1);
  assert.ok(navigationState(v).route_error_map_units>.15);
  stepVoyage(v,1/120);
  assert.ok(demoTelemetry(s).deviationM>1,'one controller tick must not snap the ship onto its route');
  assert.ok(s.ship.p.distanceTo(hitPosition)<70);
  assert.ok(s.force.length()>0 && s.force.length()<=18000.001);
  assert.ok(s.torque.length()<=80000.001);
  assert.match(demoTelemetry(s).courseControl.authority,/no Main Judging proposal/);
  assert.ok(s.events.some(e=>e.type==='guidance' && /no Main Judging approval/.test(e.text)));
  const fuel=s.fuel; run(v,57);
  assert.ok(s.fuel<fuel);
  assert.ok(demoTelemetry(s).deviationM<.06);
  assert.ok(navigationState(v).route_error_map_units<.03);
  assert.ok(v.flightTrail.length>2);
  assert.deepEqual(buildDemoObservation(s,v).telemetry.navigation.map_position_au,navigationState(v).map_position_au);
});

test('a propulsion outage leaves the displaced ship coasting and recovery waits for power restoration', () => {
  const v=createVoyage({physical:true}); impact(v); run(v,12);
  triggerDemoSolarStorm(v.physics,'propelling');
  run(v,.1);
  const s=v.physics, dv=disturbanceVelocity(s), navVelocity=v.navigationBody.velocity.clone(), fuel=s.fuel;
  const error=localCourseError(s).clone();
  run(v,14);
  assert.equal(s.flightControl.mode,'offline'); assert.equal(s.force.length(),0); assert.equal(s.torque.length(),0);
  assert.equal(s.fuel,fuel);
  assert.ok(disturbanceVelocity(s).distanceTo(dv)<1e-8);
  assert.ok(v.navigationBody.velocity.distanceTo(navVelocity)<1e-8);
  assert.ok(localCourseError(s).sub(error).distanceTo(dv.clone().multiplyScalar(14))<.01);
  run(v,65);
  assert.ok(['tracking','correcting'].includes(s.flightControl.mode));
  assert.ok(demoTelemetry(s).deviationM<.1);
});

test('fuel exhaustion, failed hardware and energy shutdown cannot secretly keep the ship on its route', () => {
  for(const failure of ['fuel','engine','thrusters','energy']) {
    const v=createVoyage({physical:true}), s=v.physics;
    if(failure==='fuel')s.fuel=0;
    if(failure==='engine')s.faults.push('Engine Failure');
    if(failure==='thrusters')s.faults.push('Thruster Failure');
    if(failure==='energy')for(const id of ['solar','solarLeft','solarRight'])s.bonds[id].health=75;
    s.ship.v.add(new Vector3(2,1,0));
    const velocity=v.navigationBody.velocity.clone(), fuel=s.fuel;
    run(v,5);
    assert.equal(s.flightControl.mode,'offline',failure);
    assert.equal(s.force.length(),0); assert.equal(s.torque.length(),0); assert.equal(s.fuel,fuel);
    assert.ok(v.navigationBody.velocity.distanceTo(velocity)<1e-8);
    assert.ok(demoTelemetry(s).deviationM>10);
    assert.ok(navigationState(v).route_error_map_units>1);
  }
});

test('automatic recovery yields to deliberate burns, and cut thrust requires explicit re-enabling', () => {
  const v=createVoyage({physical:true}), s=v.physics;
  commandDemoBurn(s,{linear:[1,0,0],seconds:2}); run(v,3);
  assert.equal(s.flightControl.mode,'yielding'); assert.equal(s.force.length(),0);
  const dv=disturbanceVelocity(s).length(); run(v,1);
  assert.ok(Math.abs(disturbanceVelocity(s).length()-dv)<.001);
  coastDemo(s); run(v,10);
  assert.equal(s.flightControl.mode,'coasting'); assert.equal(s.force.length(),0);
  assert.equal(readDemoThrusterEffect(s).active,false,'free coasting has no cruise flame');
  setDemoCourseCorrection(s,true); run(v,.1);
  assert.equal(s.flightControl.mode,'correcting'); assert.ok(s.force.length()>0);
  assert.equal(readDemoThrusterEffect(s).active,true);
});

test('pause freezes both navigation and local control without changing fuel or the actual trail', () => {
  const v=createVoyage({physical:true}); impact(v); run(v,3);
  const before=JSON.stringify({p:v.mapPosition,n:v.navigationBody,physics:demoTelemetry(v.physics),trail:v.flightTrail,time:v.mapElapsed});
  stepVoyage(v,0);
  assert.equal(JSON.stringify({p:v.mapPosition,n:v.navigationBody,physics:demoTelemetry(v.physics),trail:v.flightTrail,time:v.mapElapsed}),before);
});

test('long-range navigation uses bounded acceleration rather than copying the moving route pose', () => {
  const v=createVoyage({physical:true});
  v.navigationBody.position.x+=100;
  const velocity=v.navigationBody.velocity.clone(), fuel=v.physics.fuel, dt=1/120;
  stepVoyage(v,dt);
  assert.ok(navigationState(v).route_error_map_units>99,'an extreme displacement cannot be removed in one tick');
  assert.ok(v.navigationBody.velocity.distanceTo(velocity)<=18000/v.physics.ship.mass*dt*v.timeScale+.001);
  assert.ok(v.navigationBody.force.length()<=18000.001);
  assert.ok(v.physics.fuel<fuel);
  assert.ok(v.physics.ship.q.angleTo(v.physics.flightControl.targetAttitude)>0,'a target attitude must not overwrite the body quaternion');
});
