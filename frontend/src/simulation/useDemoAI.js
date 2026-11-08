import { useCallback, useEffect, useRef, useState } from 'react';
import { buildDemoObservation, executeDemoDecision } from './demoAI.js';

const prefix = (import.meta.env.VITE_DEMO_AI_URL ?? '').replace(/\/$/, '');
async function request(path, body, signal) {
  const response = await fetch(`${prefix}/api/v1/demo-ai/${path}`, {
    signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `DEMO AI request failed (${response.status})`);
  return data;
}
export default function useDemoAI(voyage, running, onLog) {
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [service, setService] = useState(null), [error, setError] = useState(''), [latest, setLatest] = useState(null);
  const current = useRef(); current.current = { voyage, running, onLog };
  const inFlight = useRef(null), lastAttempt = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; inFlight.current?.abort(); }; }, []);
  const stop = useCallback(() => { setEnabled(false); inFlight.current?.abort(); }, []);
  useEffect(() => { if (!running) inFlight.current?.abort(); }, [running]);
  const connect = useCallback(async () => {
    try { setService(await request('status', null, AbortSignal.timeout(5000))); setError(''); }
    catch { setService(null); setError('Start the DEMO AI gateway on port 8001. See the frontend README.'); }
  }, []);
  const run = useCallback(async () => {
    if (inFlight.current || !current.current.running) return;
    const controller = new AbortController(); inFlight.current = controller;
    const state = current.current.voyage.current.physics, observation = buildDemoObservation(state);
    lastAttempt.current = performance.now(); setBusy(true); setError('');
    current.current.onLog('DEMO AI · requesting subsystem proposals and Main Judging approval; physics continues');
    try {
      const decision = await request('cycle', observation, AbortSignal.any([controller.signal, AbortSignal.timeout(150000)]));
      if (controller.signal.aborted || !mounted.current) return;
      if (!current.current.running || current.current.voyage.current.physics !== state) throw new Error('DEMO reset or paused during analysis; response discarded.');
      const actions = executeDemoDecision(state, observation, decision);
      setLatest({ ...decision, executed: actions.length });
      current.current.onLog(`DEMO AI · ${actions.length} approved action(s) applied after ${decision.latency_s.toFixed(1)}s · ${decision.summary}`);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) {
        const message = e instanceof SyntaxError ? 'DEMO AI gateway unavailable. Start it on port 8001.' : e.message;
        setError(message); current.current.onLog(`DEMO AI · no actions executed · ${message}`);
      }
    } finally { if (mounted.current) setBusy(false); inFlight.current = null; }
  }, []);
  useEffect(() => {
    if (!enabled || !running) return undefined;
    const timer = setInterval(() => {
      if (inFlight.current || performance.now() - lastAttempt.current < 8000) return;
      if (current.current.voyage.current.physics.burn) return;
      const o = buildDemoObservation(current.current.voyage.current.physics);
      if (o.threats.some(t => t.closest_in_s > .5 && t.clearance_m < 0) || o.options.some(p => p.owner === 'robot_arms')) run();
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, running, run]);
  return { enabled, busy, service, error, latest: latest?.run_id === voyage.current.physics.runId ? latest : null, connect, run, stop,
    reset: () => { stop(); setLatest(null); setError(''); },
    start: () => { setEnabled(true); lastAttempt.current = -Infinity; }, running };
}
