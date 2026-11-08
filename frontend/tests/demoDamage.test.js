import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPhysics, launchDemoRock, advanceDemo } from '../src/simulation/demoPhysics.js';
import { DEMO_PARTS } from '../src/simulation/demoShip.js';
const run = (s, seconds) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) advanceDemo(s, 1 / 120); };

test('ordinary impact produces repairable damage instead of immediate breakup', () => {
  const s = createDemoPhysics(); launchDemoRock(s, { mass_kg: 200, speed_m_s: 40, warning_s: 2 }); run(s, 3);
  assert.equal(s.fragments.length, 0);
  assert.ok(s.bonds.command.health < 100 && s.bonds.command.health > 60);
});
test('every selectable part can actually be hit, including cargo and auxiliary arrays', () => {
  for (const part of DEMO_PARTS) {
    const s = createDemoPhysics(); launchDemoRock(s, { target_id: part.id, mass_kg: 200, speed_m_s: 40, warning_s: 2 }); run(s, 3);
    assert.ok(s.events.find(e => e.type === 'contact')?.text.includes(part.label), part.id);
    assert.ok(s.bonds[part.id].health < 100, part.id);
  }
});
test('disasters can launch repeatedly at wreckage and cannot lock at the projectile limit', () => {
  const s = createDemoPhysics(); launchDemoRock(s, { mass_kg: 5000, speed_m_s: 150, warning_s: 2 }); run(s, 3);
  assert.ok(s.bonds.command.broken);
  for (let i = 0; i < 60; i++) assert.doesNotThrow(() => launchDemoRock(s, { target_id: 'command' }));
  assert.ok(s.rocks.length <= 48);
});
