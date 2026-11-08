import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDemo, createDemoPhysics, launchDemoRock, repairDemoPart, setDemoTimeScale, injectDemoFault } from '../src/simulation/demoPhysics.js';
import { buildDemoObservation, executeDemoDecision } from '../src/simulation/demoAI.js';
const run = (s, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) advanceDemo(s, Math.min(1 / 60, seconds - t)); };
const decide = (o, ids, id = 'fixture') => ({ id, run_id: o.run_id, approved_options: ids, summary: 'Explicit test fixture' });

test('observed burn catalog can avoid a rock after a realistic decision delay; baseline collides', () => {
  const s = createDemoPhysics(), baseline = createDemoPhysics();
  for (const state of [s, baseline]) launchDemoRock(state, { warning_s: 60 });
  const o = buildDemoObservation(s);
  assert.ok(o.threats[0].clearance_m < 0);
  assert.ok(o.options.find(p => p.id === 'burn_right_8').prediction.minimum_clearance_m > 10);
  run(s, 20); executeDemoDecision(s, o, decide(o, ['burn_right_8'])); run(s, 50); run(baseline, 70);
  assert.equal(s.lastImpact, null); assert.ok(baseline.lastImpact);
});
test('stale decisions, unsubmitted actions, conflicting burns and replays cannot execute', () => {
  const s = createDemoPhysics(), o = buildDemoObservation(s);
  assert.throws(() => executeDemoDecision(s, o, decide(o, ['invented'])), /Invalid/);
  assert.throws(() => executeDemoDecision(s, o, decide(o, ['burn_right_4', 'burn_left_4'])), /Conflicting/);
  assert.equal(s.burn, null);
  executeDemoDecision(s, o, decide(o, []));
  assert.throws(() => executeDemoDecision(s, o, decide(o, [])), /consumed/);
  launchDemoRock(s);
  assert.throws(() => executeDemoDecision(s, o, decide(o, ['burn_right_8'], 'new')), /changed/);
  const reset = createDemoPhysics();
  assert.throws(() => executeDemoDecision(reset, o, decide(o, ['burn_right_8'])), /changed/);
});
test('Main Judging can combine repair and energy; repairs move the arm then require timed contact', () => {
  const s = createDemoPhysics(); launchDemoRock(s, { warning_s: 2 }); run(s, 3);
  const o = buildDemoObservation(s), health = s.bonds.command.health;
  executeDemoDecision(s, o, decide(o, ['repair_command', 'solar_isolate']));
  assert.equal(s.bonds.command.health, health); assert.equal(s.solarProtection, true);
  assert.throws(() => setDemoTimeScale(s, 100), /1x/);
  run(s, 20);
  assert.ok(s.bonds.command.health > health); assert.ok(s.bonds.command.health <= 95);
  assert.ok(s.battery < 100);
  const wreck = createDemoPhysics(); launchDemoRock(wreck, { mass_kg: 5000, speed_m_s: 150, warning_s: 2 }); run(wreck, 3);
  assert.throws(() => repairDemoPart(wreck, { arm_id: 'command', part_id: 'command' }), /attached/);
  const rebuild=buildDemoObservation(wreck).options.find(p=>p.id==='repair_command');
  assert.ok(rebuild.prediction.rebuild);assert.notEqual(rebuild.action.arm_id,'command');
});
test('repair authorization rejects wrong arm, repeated service and failed arms', () => {
  const s = createDemoPhysics(); launchDemoRock(s, { warning_s: 2 }); run(s, 3);
  assert.throws(() => repairDemoPart(s, { arm_id: 'unknown', part_id: 'command' }), /attached/);
  repairDemoPart(s, { arm_id: 'command', part_id: 'command' });
  assert.throws(() => repairDemoPart(s, { arm_id: 'command', part_id: 'command' }), /already/);
  injectDemoFault(s, 'Robotic Arm Malfunction'); const health = s.bonds.command.health; run(s, 1);
  assert.equal(s.bonds.command.health, health);
});
test('repeated moderate impacts accumulate damage and cycle mode reaches different assemblies', () => {
  const s = createDemoPhysics();
  for (let i = 0; i < 4; i++) {
    const r = launchDemoRock(s, { target_id: 'cycle', warning_s: 2 });
    assert.equal(r.id, i + 1);
  }
  run(s, 3);
  assert.ok(Object.values(s.bonds).filter(b => b.health < 100).length >= 3);
});
