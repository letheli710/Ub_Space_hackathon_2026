export function simulatorUrl(path, baseUrl = '', location = globalThis.location) {
  return new URL(`${baseUrl.replace(/\/$/, '')}${path}`, location?.href ?? 'http://localhost/').href;
}

export function createSimulationClient({ onChange, baseUrl = '', fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket, location = globalThis.location,
  retryMs = 1500, staleMs = 3500, watchdogMs = 500, now = Date.now }) {
  let scene = null, state = null, socket, retry, controller;
  let stopped = false, generation = 0, receivedAt = 0;
  const url = path => simulatorUrl(path, baseUrl, location);
  const emit = (connected, message = '') => onChange({ scene, state, connected, message });

  async function request(path, options = {}) {
    const response = await fetchImpl(url(path), { ...options, signal: options.signal ?? AbortSignal.timeout(8000) });
    const text = await response.text();
    if (response.status === 502 || response.status === 504) {
      throw new Error('Simulator unavailable. Start the backend and retry.');
    }
    let body;
    try { body = JSON.parse(text); } catch { body = { detail: text || response.statusText }; }
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Simulator request failed (${response.status})`);
    return body;
  }

  function schedule(message) {
    if (stopped || retry) return;
    emit(false, message);
    retry = setTimeout(() => { retry = null; connect(); }, retryMs);
  }

  async function connect() {
    const token = ++generation;
    controller?.abort();
    controller = new AbortController();
    emit(false, 'Connecting to simulator…');
    try {
      const next = await request('/api/v1/scene', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (stopped || token !== generation) return;
      if (next.schema_version !== 1 || !next.ship_entity_id || !next.revision || !Array.isArray(next.entities)) {
        throw new Error('The simulator scene needs the updated backend. Rebuild and restart it.');
      }
      if (scene?.revision !== next.revision) state = null;
      scene = next;
      emit(false, 'Waiting for live telemetry…');
      const address = new URL(url('/api/v1/telemetry'));
      address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
      const current = new WebSocketImpl(address.href);
      socket = current;
      receivedAt = now();
      current.onmessage = event => {
        if (stopped || token !== generation) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type !== 'state' || message.schema_version !== 1 || !message.data) return;
          if (message.data.scene_revision !== scene.revision) {
            current.close();
            return;
          }
          state = message.data;
          receivedAt = now();
          emit(true, state.connection?.ready ? '' : 'Waiting for Gazebo telemetry…');
        } catch { emit(false, 'Invalid simulator telemetry received'); }
      };
      current.onerror = () => current.close();
      current.onclose = () => {
        if (token === generation) schedule('Simulator disconnected. Reconnecting…');
      };
    } catch (error) {
      if (!stopped && token === generation) schedule(error.message);
    }
  }

  const watchdog = setInterval(() => {
    if (socket && now() - receivedAt > staleMs) {
      emit(false, 'Telemetry is stale. Reconnecting…');
      socket.close();
    }
  }, watchdogMs);

  return {
    start: connect,
    reconnect() {
      generation++;
      controller?.abort();
      clearTimeout(retry); retry = null;
      socket?.close(); socket = null;
      connect();
    },
    async command(path, body) {
      if (!state?.connection?.ready || !socket || now() - receivedAt > staleMs || socket.readyState !== 1) {
        throw new Error('Connect to a ready simulator before sending commands.');
      }
      return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    },
    destroy() {
      stopped = true; generation++;
      controller?.abort(); clearTimeout(retry); clearInterval(watchdog); socket?.close();
    },
  };
}
