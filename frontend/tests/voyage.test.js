import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createVoyage, DWELL_SECONDS, LEG_SECONDS, parseTimeScale, predictShipPosition, shipPose, stepVoyage } from '../src/data/voyage.js';

test('demo time scale is applied once during an ordinary flight step', () => {
  const voyage = { ...createVoyage(), timeScale: 1e6 };
  stepVoyage(voyage, .1);
  assert.ok(Math.abs(voyage.progress - 100000 / LEG_SECONDS) < 1e-12);
});

test('accelerated demo carries time left after arrival into the orbit dwell', () => {
  const voyage = { ...createVoyage(), progress: 1 - 10 / LEG_SECONDS, timeScale: 1 };
  assert.equal(stepVoyage(voyage, 15), 'arrived');
  assert.ok(Math.abs(voyage.dwell - (DWELL_SECONDS - 5)) < 1e-6);
});

test('time left after orbit dwell advances the return leg', () => {
  const voyage = { ...createVoyage(), progress: 1, dwell: 5, timeScale: 1 };
  assert.equal(stepVoyage(voyage, 10), 'departed');
  assert.equal(voyage.direction, -1);
  assert.ok(Math.abs(voyage.progress - (1 - 5 / LEG_SECONDS)) < 1e-12);
});

test('hazard prediction agrees with elapsed demo time across arrival and departure', () => {
  const initial = { ...createVoyage(), progress: .99, timeScale: 1e6 };
  const predicted = predictShipPosition(initial, 2.5, new Vector3());
  const actual = { ...initial };
  for (let i = 0; i < 100; i++) stepVoyage(actual, .025);
  assert.ok(predicted.distanceTo(shipPose(actual, new Vector3())) < 1e-6);
  assert.equal(initial.progress, .99);
});

test('typed demo time scales accept shorthand and reject invalid input', () => {
  assert.equal(parseTimeScale('2.5Mx'), 2500000);
  assert.equal(parseTimeScale('100K'), 100000);
  assert.equal(parseTimeScale('100,000'), 100000);
  for (const value of ['0', '-1', 'Infinity', 'NaN', 'bad', '']) assert.equal(parseTimeScale(value), null);
});
