import test from 'node:test';
import assert from 'node:assert/strict';
import { healthReadings } from '../src/simulation/shipTelemetry.js';

test('live health uses the backend percentages including zero and never invents demo fallback values', () => {
  const readings = healthReadings({ metrics: { hull_integrity_pct: 0, battery_level_pct: 62.5 } });
  assert.equal(readings.length, 5);
  assert.equal(readings[0].value, 0);
  assert.equal(readings[2].value, 62.5);
  assert.equal(readings[1].value, null);
  assert.ok(healthReadings().every(item => item.value === null));
});
