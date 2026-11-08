import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoAIClient } from '../src/ai/demoClient.js';
import { clearAiSettings, loadAiSettings, modelConnection, saveAiSettings } from '../src/ai/settings.js';

const selected = { provider: 'deepseek', apiKey: 'fixture-only-key', baseUrl: 'https://proxy.example/v1', model: 'fixture-flight', remember: false };

test('DEMO check and cycle carry saved connection to the gateway, outside telemetry', async () => {
  const requests = [], observation = { run_id: 'sample', telemetry: { fuelKg: 4000 } };
  const client = createDemoAIClient({ baseUrl: 'https://gateway.example/', fetchImpl: async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ approved_options: [] }) };
  } });
  await client.check(selected);
  await client.cycle(observation, selected);
  assert.equal(requests[0].url, 'https://gateway.example/api/v1/demo-ai/check');
  assert.equal(requests[1].url, 'https://gateway.example/api/v1/demo-ai/cycle');
  assert.deepEqual(requests[1].body.connection, { provider: 'deepseek', api_key: selected.apiKey, base_url: selected.baseUrl, model: selected.model });
  assert.deepEqual(requests[1].body.observation, observation);
  assert.ok(!JSON.stringify(requests[1].body.observation).includes(selected.apiKey));
  await client.cycle(observation, null);
  assert.equal(requests[2].body.connection, null);
});

test('invalid connection cannot initiate a provider request, and old DeepSeek settings migrate', async () => {
  const client = createDemoAIClient({ fetchImpl: () => { throw new Error('must not fetch'); } });
  await assert.rejects(client.check({ ...selected, model: '' }), /model ID/);
  for (const baseUrl of ['http://remote.example', 'https://user:pass@example.com', 'https://example.com?key=x', 'https://example.com/chat/completions']) {
    assert.throws(() => modelConnection({ ...selected, baseUrl }));
  }
  assert.equal(modelConnection({ provider: 'deepseek', apiKey: 'fixture' }).model, 'deepseek-flash');
  assert.equal(modelConnection({ ...selected, baseUrl: 'http://localhost:9123/v1' }).base_url, 'http://localhost:9123/v1');
});

test('status polls select the active connection, and failed cycles keep per-role diagnostics', async () => {
  const requests = [], failed = { id: 'failed', approved_options: [], errors: { energy: 'Unavailable' } };
  const client = createDemoAIClient({ fetchImpl: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return url.endsWith('/status') ? { ok: true, json: async () => ({ enabled: true }) } :
      { ok: false, status: 503, json: async () => ({ detail: 'Main Judging failed', cycle: failed, connection: { source: 'browser' } }) };
  } });
  await client.status(selected);
  assert.equal(requests[0].url, '/api/v1/demo-ai/status');
  assert.equal(requests[0].body.connection.model, 'fixture-flight');
  await assert.rejects(client.cycle({}, selected), error => {
    assert.equal(error.gatewayReachable, true);
    assert.deepEqual(error.cycle, failed);
    assert.equal(error.connection.source, 'browser');
    return true;
  });
});

test('save, remember toggle, reload and removal preserve the complete active configuration', () => {
  const store = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; };
  const originalLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), originalSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: store() });
  try {
    assert.equal(saveAiSettings(selected), true);
    assert.deepEqual(loadAiSettings(), selected);
    assert.equal(saveAiSettings({ ...selected, remember: true }), true);
    assert.deepEqual(loadAiSettings(), { ...selected, remember: true });
    assert.equal(globalThis.sessionStorage.getItem('interstellar-x4.ai-settings'), undefined);
    globalThis.sessionStorage.setItem = () => { throw new Error('blocked'); };
    assert.equal(saveAiSettings({ ...selected, model: 'replacement' }), false);
    assert.equal(loadAiSettings().model, 'fixture-flight', 'failed save must preserve working connection');
    assert.equal(clearAiSettings(), true);
    assert.equal(loadAiSettings(), null);
  } finally {
    if (originalLocal) Object.defineProperty(globalThis, 'localStorage', originalLocal); else delete globalThis.localStorage;
    if (originalSession) Object.defineProperty(globalThis, 'sessionStorage', originalSession); else delete globalThis.sessionStorage;
  }
});
