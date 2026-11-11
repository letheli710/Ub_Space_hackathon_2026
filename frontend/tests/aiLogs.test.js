import test from 'node:test';
import assert from 'node:assert/strict';
import { demoConnection, demoCycleEntries, demoGatewayConnection } from '../src/ai/logs.js';

const service = { enabled: true, systems: ['main_judging', 'propelling', 'energy', 'robot_arms'].map(id => ({ id, configured: true, model: 'fixture' })) };
test('connection cards distinguish gateway reachability, verification and individual role failures', () => {
  const ai = { service, gateway: { reachable: true }, latest: {
    errors: { energy: 'Provider returned HTTP 429' }, calls: { robot_arms: { status: 'ok', model: 'fixture', duration_s: 1.2 } },
  } };
  assert.equal(demoGatewayConnection(ai)[1], 'Online');
  assert.equal(demoConnection(ai, 'energy')[1], 'Last call failed');
  assert.equal(demoConnection(ai, 'robot_arms')[1], 'Connected');
  assert.equal(demoConnection(ai, 'propelling')[1], 'Configured · not verified');
  assert.equal(demoConnection({ ...ai, service: { ...service, verified: true } }, 'propelling')[1], 'Model access verified');
  assert.equal(demoConnection({ ...ai, connectionError: 'HTTP 401' }, 'robot_arms')[1], 'Connection check failed');
  assert.equal(demoConnection({ ...ai, gateway: { reachable: false, error: 'Unreachable' } }, 'robot_arms')[1], 'Gateway offline');
  assert.equal(demoGatewayConnection({ ...ai, busy: true })[2], 'Analyzing');
});

test('role logs use explicit ownership and distinguish approval from executed actions', () => {
  const cycle = { id: 'one', end_sim_time_s: 2400000, end_display_time_s: 12, executed: 0, summary: 'Combined',
    assessments: { energy: 'Power stable', robot_arms: 'Module damaged' },
    proposals: [{ id: 'arm0', system: 'robot_arms', option_id: 'repair_command', rationale: 'Restore module' }],
    reviews: [{ proposal_id: 'arm0', approve: true, reason: 'Reduce damage' }], execution_error: 'Ship changed' };
  const arms = demoCycleEntries(cycle, 'robot_arms');
  assert.equal(arms.length, 2);
  assert.ok(arms.some(e => e.text.includes('APPROVED') && e.text.includes('Reduce damage')));
  assert.ok(arms.every(e => e.system_id === 'robot_arms' && e.seconds === 12));
  const judging = demoCycleEntries(cycle, 'main_judging');
  assert.ok(judging.some(e => e.text.includes('0 action(s) executed')));
  assert.ok(judging.some(e => e.text.includes('No actions executed · Ship changed')));
  const entries = [cycle, { ...cycle, id: 'two' }].flatMap(c => demoCycleEntries(c));
  assert.equal(new Set(entries.map(e => e.key)).size, entries.length);
  assert.deepEqual(demoCycleEntries(cycle, 'propelling'), []);
});

test('role cards show physical shutdown and emergency restrictions over model connection activity', () => {
  const ai = { service, busy: true, gateway: { reachable: true }, latest: {
    calls: { propelling: { status: 'ok', model: 'fixture', duration_s: 1 } },
  }, subsystems: {
    propelling: { mode: 'offline', reason: 'Solar storm', remaining_s: 12.5 },
    robot_arms: { mode: 'emergency', reason: 'Energy repairs only' },
    main_judging: { mode: 'online' },
  } };
  assert.deepEqual(demoConnection(ai, 'propelling'), ['bad', 'Subsystem offline', 'Solar storm · 12.5 s remaining']);
  assert.deepEqual(demoConnection(ai, 'robot_arms'), ['warn', 'Emergency repairs only', 'Energy repairs only']);
  assert.equal(demoConnection(ai, 'main_judging')[1], 'Analyzing…');
  ai.busy = false;
  ai.subsystems.propelling = { mode: 'online' };
  assert.equal(demoConnection(ai, 'propelling')[1], 'Connected');
});
