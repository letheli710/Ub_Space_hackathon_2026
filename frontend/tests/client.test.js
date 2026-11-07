import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationClient, simulatorUrl } from '../src/simulation/client.js';

const scene = { schema_version: 1, ship_entity_id: 'different_ship', revision: 'first', entities: [] };
const snapshot = { schema_version: 1, scene_revision: 'first', sim_time_s: 42, connection: { ready: true } };
const response = body => ({ ok: true, text: async () => JSON.stringify(body) });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class Socket {
  static instances = [];
  readyState = 1;
  constructor(url) { this.url = url; Socket.instances.push(this); }
  sendState(state) { this.onmessage({ data: JSON.stringify({ type: 'state', schema_version: 1, data: state }) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}

test('HTTP, asset and WebSocket URLs preserve a deployment prefix and HTTPS', () => {
  assert.equal(simulatorUrl('/api/v1/scene', '/sim', { href: 'https://example.test/app/' }), 'https://example.test/sim/api/v1/scene');
  assert.equal(simulatorUrl('/api/v1/assets/ship.glb', 'https://sim.example.test'), 'https://sim.example.test/api/v1/assets/ship.glb');
});

test('commands use the actual backend state and stop after a disconnect', async () => {
  const calls = [], updates = [];
  const client = createSimulationClient({ onChange: update => updates.push(update), WebSocketImpl: Socket,
    location: { href: 'https://example.test/' }, fetchImpl: async (url, options) => {
      calls.push({ url, options }); return response(url.endsWith('/scene') ? scene : { status: 'accepted' });
    } });
  try {
    await client.start();
    const socket = Socket.instances.at(-1);
    assert.equal(socket.url, 'wss://example.test/api/v1/telemetry');
    socket.sendState(snapshot);
    await client.command('/api/v1/simulation/control', { paused: true });
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { paused: true });
    assert.equal(updates.at(-1).state.sim_time_s, 42);
    socket.close();
    assert.equal(updates.at(-1).connected, false);
    await assert.rejects(client.command('/api/v1/simulation/control', { paused: false }), /ready simulator/);
  } finally { client.destroy(); }
});

test('reconnect loads a replacement scene when the backend revision changes', async () => {
  let selected = scene;
  const updates = [];
  const client = createSimulationClient({ onChange: update => updates.push(update), WebSocketImpl: Socket, retryMs: 5,
    fetchImpl: async () => response(selected) });
  try {
    await client.start();
    const first = Socket.instances.at(-1);
    first.sendState(snapshot);
    selected = { ...scene, revision: 'replacement', ship_entity_id: 'another_ship' };
    first.sendState({ ...snapshot, scene_revision: 'replacement' });
    await delay(30);
    const second = Socket.instances.at(-1);
    assert.notEqual(first, second);
    second.sendState({ ...snapshot, scene_revision: 'replacement' });
    assert.equal(updates.at(-1).scene.ship_entity_id, 'another_ship');
    assert.equal(updates.at(-1).connected, true);
  } finally { client.destroy(); }
});

test('stale telemetry disables commands while retaining the last measurement', async () => {
  let time = 0;
  const updates = [];
  const client = createSimulationClient({ onChange: update => updates.push(update), WebSocketImpl: Socket,
    fetchImpl: async () => response(scene), now: () => time, staleMs: 10, watchdogMs: 5, retryMs: 5000 });
  try {
    await client.start(); Socket.instances.at(-1).sendState(snapshot);
    time = 100;
    await delay(20);
    assert.equal(updates.at(-1).connected, false);
    assert.equal(updates.at(-1).state.sim_time_s, 42);
    await assert.rejects(client.command('/api/v1/simulation/control', { paused: true }), /ready simulator/);
  } finally { client.destroy(); }
});
