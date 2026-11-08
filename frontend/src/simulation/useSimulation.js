import { useCallback, useEffect, useRef, useState } from 'react';
import { createSimulationClient, simulatorUrl } from './client.js';

const baseUrl = import.meta.env.VITE_SIMULATOR_URL ?? '';
export const assetUrl = path => simulatorUrl(path, baseUrl);

export default function useSimulation() {
  const client = useRef();
  const [data, setData] = useState({ scene: null, state: null, connected: false, message: 'Connecting to simulator…' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    client.current = createSimulationClient({ onChange: setData, baseUrl });
    client.current.start();
    return () => client.current.destroy();
  }, []);
  const command = useCallback(async (path, body) => {
    setPending(true); setError('');
    try { return await client.current.command(path, body); }
    catch (err) { setError(err.message); throw err; }
    finally { setPending(false); }
  }, []);
  return { ...data, pending, error, ready: data.connected && Boolean(data.state?.connection?.ready),
    reconnect: () => { setError(''); client.current?.reconnect(); },
    setPaused: paused => command('/api/v1/simulation/control', { paused }),
    setMapOrbitSpeed: orbit_speed => command('/api/v1/map/control', { orbit_speed }),
    setArmTargets: (arm, targets) => command(`/api/v1/arms/${encodeURIComponent(arm)}/target`, { targets }),
    injectDisaster: (kind, severity) => command('/api/v1/disasters', { kind, severity }) };
}
