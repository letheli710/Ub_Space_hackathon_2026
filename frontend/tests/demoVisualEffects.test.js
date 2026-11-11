import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDemo, commandDemoBurn, createDemoPhysics, repairDemoPart, triggerDemoSolarStorm } from '../src/simulation/demoPhysics.js';
import { readDemoRepairEffect, readDemoThrusterEffect } from '../src/simulation/demoVisualEffects.js';

test('thruster visuals follow integrity, main burns, outages and engine loss without changing physics', () => {
  const s = createDemoPhysics(), out = {};
  const velocity = s.ship.v.clone(), fuel = s.fuel;
  assert.equal(readDemoThrusterEffect(s, out), out);
  assert.equal(out.active, true);
  assert.equal(out.strength, .42);
  assert.ok(s.ship.v.equals(velocity));
  assert.equal(s.fuel, fuel);
  commandDemoBurn(s, { linear: [0, 0, 1] });
  assert.equal(readDemoThrusterEffect(s).strength, 1);
  s.bonds.engine.health = 50;
  assert.equal(readDemoThrusterEffect(s).strength, .5);
  triggerDemoSolarStorm(s, 'propelling');
  assert.equal(readDemoThrusterEffect(s).active, false);
  advanceDemo(s, 15.1);
  assert.equal(readDemoThrusterEffect(s).active, true);
  s.bonds.engine.broken = true;
  assert.equal(readDemoThrusterEffect(s).active, false);
  s.bonds.engine.broken = false;
  s.fuel = 0;
  assert.equal(readDemoThrusterEffect(s).active, false);
});

test('repair sparks run only at the servicing arm during actual contact and freeze with the repair clock', () => {
  const s = createDemoPhysics();
  s.bonds.command.health = 50;
  repairDemoPart(s, { arm_id: 'command', part_id: 'command' });
  assert.equal(readDemoRepairEffect(s, 'command').active, false);
  for (let i = 0; i < 1200 && s.repairs[0].status !== 'holding'; i++) advanceDemo(s, 1 / 120);
  assert.equal(readDemoRepairEffect(s, 'command').active, true);
  assert.equal(readDemoRepairEffect(s, 'hab').active, false);
  const time = readDemoRepairEffect(s, 'command').time;
  advanceDemo(s, 0);
  assert.equal(readDemoRepairEffect(s, 'command').time, time);
  triggerDemoSolarStorm(s, 'robot_arms');
  assert.equal(readDemoRepairEffect(s, 'command').active, false);
  advanceDemo(s, 15.1);
  assert.equal(readDemoRepairEffect(s, 'command').active, true);
  advanceDemo(s, 10);
  assert.equal(readDemoRepairEffect(s, 'command').active, false);
  assert.equal(s.bonds.command.health, 58);
});
