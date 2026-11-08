import { modelConnection } from './settings.js';

/** Credentials are sent only to this gateway, which owns the provider protocols. */
export function createDemoAIClient({ baseUrl = '', fetchImpl = globalThis.fetch } = {}) {
  async function request(path, settings, observation, signal) {
    const connection = modelConnection(settings);
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/v1/demo-ai/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ connection, ...(observation ? { observation } : {}) }),
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('DEMO AI gateway unavailable. Start it on port 8001.'); }
    if (!response.ok) {
      const error = new Error(typeof data.detail === 'string' ? data.detail :
        `AI settings or telemetry were rejected (${response.status}). Check AI API.`);
      Object.assign(error, { gatewayReachable: true, cycle: data.cycle, connection: data.connection });
      throw error;
    }
    return data;
  }
  return {
    status: (settings, signal) => request('status', settings, null, signal),
    check: (settings, signal) => request('check', settings, null, signal),
    cycle: (observation, settings, signal) => request('cycle', settings, observation, signal),
  };
}
