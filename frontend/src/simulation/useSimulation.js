import { useCallback, useEffect, useRef, useState } from 'react';
import { createSimulationClient, simulatorUrl } from './client.js';

const baseUrl = import.meta.env.VITE_SIMULATOR_URL ?? '';
export const assetUrl = path => simulatorUrl(path, baseUrl);

export default function useSimulation({ enabled = true } = {}) {
  const client = useRef();
  const [data, setData] = useState({ scene: null, state: null, connected: false, message: 'Connecting to simulator…' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    client.current = createSimulationClient({ onChange: setData, baseUrl });
    if (enabled) client.current.start();
    else setData(previous => ({ ...previous, connected: false, message: 'Optional Gazebo connection is idle.' }));
    return () => client.current.destroy();
  }, [enabled]);
  const command = useCallback(async (path, body) => {
    setPending(true); setError('');
    try { if (!enabled) throw new Error('Open the optional Gazebo view to connect.'); return await client.current.command(path, body); }
    catch (err) { setError(err.message); throw err; }
    finally { setPending(false); }
  }, [enabled]);
  return { ...data, pending, error, ready: data.connected && Boolean(data.state?.connection?.ready),
    reconnect: () => { setError(''); client.current?.reconnect(); },
    setPaused: paused => command('/api/v1/simulation/control', { paused }),
    setMapOrbitSpeed: orbit_speed => command('/api/v1/map/control', { orbit_speed }),
    setArmTargets: (arm, targets) => command(`/api/v1/arms/${encodeURIComponent(arm)}/target`, { targets }),
    injectDisaster: (kind, severity) => command('/api/v1/disasters', { kind, severity }),
    injectImpact: parameters => command('/api/v1/impacts', parameters) };
}
