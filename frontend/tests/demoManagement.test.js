import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { advanceDemo, commandDemoBurn, createDemoPhysics, demoTelemetry, launchDemoRock, repairDemoPart, syncDemoSystems, triggerDemoSolarStorm } from '../src/simulation/demoPhysics.js';
import { armToolPoint, repairContactPlans } from '../src/simulation/demoArmKinematics.js';
import { ENERGY_PARTS, subsystemStates } from '../src/simulation/demoSystems.js';
import { buildDemoObservation, executeDemoDecision } from '../src/simulation/demoAI.js';
import { createVoyage, startVoyageSolarStorm, stepVoyage } from '../src/data/voyage.js';
import { navigationState } from '../src/simulation/missionGuidance.js';
const run=(s,t)=>{for(let n=0;n<t-1e-9;n+=1/120)advanceDemo(s,Math.min(1/120,t-n));};
const waitForContact=s=>{for(let i=0;i<1200 && s.repairs[0]?.status!=='holding';i++)advanceDemo(s,1/120);assert.equal(s.repairs[0]?.status,'holding');};

test('solar storm disables exactly one subsystem for 15 playing physical seconds and invalidates pending actions',()=>{
  const s=createDemoPhysics(), observation=buildDemoObservation(s);
  triggerDemoSolarStorm(s,'propelling');
  assert.equal(Object.values(subsystemStates(s)).filter(v=>v.mode==='offline').length,1);
  assert.equal(subsystemStates(s).main_judging.mode,'online');
  assert.throws(()=>commandDemoBurn(s,{linear:[1,0,0]}),/offline/);
  assert.equal(buildDemoObservation(s).options.some(o=>o.owner==='propelling'),false);
  assert.throws(()=>executeDemoDecision(s,observation,{id:'old',run_id:s.runId,approved_options:[]}),/changed/);
  run(s,14.9);assert.equal(subsystemStates(s).propelling.mode,'offline');
  const left=subsystemStates(s).propelling.remaining_s;advanceDemo(s,0);
  assert.equal(subsystemStates(s).propelling.remaining_s,left);
  run(s,.1);assert.equal(subsystemStates(s).propelling.mode,'online');
});

test('storm wave reaches the ship and outage timer runs without mounting a frontend scene',()=>{
  const v=createVoyage({physical:true});startVoyageSolarStorm(v,1);
  for(let i=0;i<600 && !v.solarStorm.progress.reached;i++)stepVoyage(v,1/60);
  assert.equal(v.solarStorm.progress.reached,true);
  assert.ok(Object.values(subsystemStates(v.physics)).some(s=>s.mode==='offline'));
  for(let i=0;i<16*60;i++)stepVoyage(v,1/60);
  assert.ok(Object.values(subsystemStates(v.physics)).every(s=>s.mode==='online'));
  assert.ok(Math.abs(v.displayElapsed-v.physics.elapsed)<1e-7,'UI timer and outage clock must share physical play time');
});

test('energy damage cuts subsystems at each 25 percent and repairs restore power',()=>{
  const s=createDemoPhysics();
  for(const [health,modes] of [[75,['offline','online','online']],[50,['offline','offline','online']],[25,['offline','offline','emergency']]]){
    for(const id of ENERGY_PARTS)s.bonds[id].health=health;syncDemoSystems(s);
    const states=subsystemStates(s);
    assert.deepEqual(['propelling','energy','robot_arms'].map(id=>states[id].mode),modes);
    assert.equal(states.main_judging.mode,'online');
  }
  for(const id of ENERGY_PARTS)s.bonds[id].health=76;syncDemoSystems(s);
  assert.ok(Object.values(subsystemStates(s)).every(s=>s.mode==='online'));
});

test('propulsion integrity scales measured cruise and journey progress while planets keep their clock',()=>{
  const full=createVoyage({physical:true}), half=createVoyage({physical:true});
  half.physics.bonds.engine.health=50;
  stepVoyage(full,.1);stepVoyage(half,.1);
  assert.ok(Math.abs(half.physics.ship.v.length()-3950)<1e-8);
  assert.equal(half.mapElapsed,full.mapElapsed);
  assert.ok(Math.abs(half.travelElapsed/full.travelElapsed-.5)<1e-10);
  assert.equal(demoTelemetry(half.physics).propulsionIntegrity,50);
  half.physics.bonds.engine.health=0;stepVoyage(half,.1);
  const stopped=half.travelElapsed;stepVoyage(half,.1);
  assert.equal(half.travelElapsed,stopped);
  assert.equal(navigationState(half).eta_s,null);
  assert.doesNotThrow(()=>JSON.stringify(buildDemoObservation(half.physics,half)));
});

test('a surviving arm touches a missing module for ten seconds before recreating it and leaves the old debris',()=>{
  const s=createDemoPhysics();launchDemoRock(s,{target_id:'command',mass_kg:5000,speed_m_s:150,warning_s:2});run(s,3);
  assert.equal(s.bonds.command.broken,true);
  const debris=s.fragments[0], plan=repairContactPlans(s,'command')[0];
  assert.notEqual(plan.arm_id,'command');
  repairDemoPart(s,{...plan,seconds:10});waitForContact(s);
  assert.ok(armToolPoint(plan.arm_id,s.armPoses[plan.arm_id]).distanceTo(new Vector3(...plan.target))<=.12);
  run(s,9.5);assert.equal(s.bonds.command.broken,true);
  run(s,.6);assert.equal(s.bonds.command.broken,false);assert.equal(s.bonds.command.health,100);
  assert.equal(s.ship.parts.filter(p=>p.id==='command').length,1);
  assert.ok(s.fragments.includes(debris));assert.equal(s.repairs.length,0);
  assert.ok(!demoTelemetry(s).detached.includes('command'));
  assert.ok(demoTelemetry(s).objects.some(o=>o.id===debris.instanceId));
});

test('outages suspend repair and reset the continuous contact timer',()=>{
  const s=createDemoPhysics();s.bonds.command.health=50;
  repairDemoPart(s,{arm_id:'command',part_id:'command'});waitForContact(s);run(s,5);
  assert.equal(s.bonds.command.health,50);
  triggerDemoSolarStorm(s,'robot_arms');run(s,14.9);
  assert.equal(s.repairs[0].contactSeconds,0);assert.equal(s.bonds.command.health,50);
  run(s,.2);run(s,9.5);assert.equal(s.bonds.command.health,50);
  run(s,1);assert.equal(s.bonds.command.health,58);
});

test('emergency power can rebuild energy after all solar components and wing-mounted arms are lost',()=>{
  const s=createDemoPhysics();
  for(const id of ENERGY_PARTS){s.bonds[id].broken=true;s.bonds[id].health=0;s.ship.parts=s.ship.parts.filter(p=>p.id!==id);}
  s.battery=0;syncDemoSystems(s);
  const options=buildDemoObservation(s).options;
  assert.ok(options.length>0);
  assert.ok(options.every(o=>o.owner==='robot_arms' && ENERGY_PARTS.includes(o.action.part_id)));
  const selected=options[0];assert.ok(!ENERGY_PARTS.includes(selected.action.arm_id));
  repairDemoPart(s,selected.action);run(s,25);
  assert.equal(s.bonds[selected.action.part_id].broken,false);
  assert.ok(s.emergencyBattery<20);
  assert.equal(subsystemStates(s).robot_arms.mode,'online');
  for(let i=0;i<2;i++){
    const next=buildDemoObservation(s).options.find(o=>o.owner==='robot_arms' && ENERGY_PARTS.includes(o.action.part_id));
    assert.ok(next,'emergency reserve must support the rest of energy recovery');
    repairDemoPart(s,next.action);run(s,25);
  }
  assert.ok(Object.values(subsystemStates(s)).every(v=>v.mode==='online'));
  assert.ok(ENERGY_PARTS.every(id=>!s.bonds[id].broken && s.bonds[id].health===100));
});

test('combined proposals cannot assign one arm to two repairs, and duration cannot bypass contact',()=>{
  const s=createDemoPhysics();s.bonds.solar.health=50;s.bonds.solarRight.health=50;
  const o=buildDemoObservation(s), solar=o.options.find(p=>p.id==='repair_solar'), wing=o.options.find(p=>p.id==='repair_solarRight');
  assert.equal(solar.action.arm_id,wing.action.arm_id);
  assert.throws(()=>executeDemoDecision(s,o,{id:'conflict',run_id:s.runId,approved_options:[solar.id,wing.id]}),/same arm/);
  assert.equal(s.repairs.length,0);
  assert.throws(()=>repairDemoPart(s,{...solar.action,seconds:1}),/10 seconds/);
});
