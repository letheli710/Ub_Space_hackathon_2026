import { useCallback, useEffect, useRef, useState } from 'react';
import { buildDemoObservation, executeDemoDecision } from './demoAI.js';
import { createDemoAIClient } from '../ai/demoClient.js';

const client = createDemoAIClient({ baseUrl: import.meta.env.VITE_DEMO_AI_URL ?? '' });
export default function useDemoAI(voyage, running, onLog, settings = null, displayTime = null) {
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [service, setService] = useState(null), [error, setError] = useState(''), [latest, setLatest] = useState(null);
  const [checking, setChecking] = useState(false);
  const [gateway, setGateway] = useState({ reachable: null, error: '' });
  const [connectionError, setConnectionError] = useState(''), [history, setHistory] = useState([]);
  const checkController = useRef(null), statusController = useRef(null);
  const current = useRef(); current.current = { voyage, running, onLog, settings, displayTime };
  const inFlight = useRef(null), lastAttempt = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; inFlight.current?.abort(); checkController.current?.abort(); statusController.current?.abort(); }; }, []);
  const stop = useCallback(() => { setEnabled(false); inFlight.current?.abort(); }, []);
  useEffect(() => { if (!running) inFlight.current?.abort(); }, [running]);
  useEffect(() => {
    stop(); checkController.current?.abort(); statusController.current?.abort();
    setService(null); setLatest(null); setHistory([]); setError(''); setConnectionError('');
    setGateway({ reachable: null, error: '' });
  }, [settings, stop]);
  const refreshStatus = useCallback(async () => {
    if (statusController.current) return;
    const controller = new AbortController(), selected = current.current.settings;
    statusController.current = controller;
    try {
      const result = await client.status(selected, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
      if (!controller.signal.aborted && mounted.current && current.current.settings === selected) {
        setGateway({ reachable: true, error: '' });
        setService(previous => ({ ...result, verified: previous?.verified ?? false }));
      }
    } catch (e) {
      if (!controller.signal.aborted && mounted.current && current.current.settings === selected)
        setGateway({ reachable: Boolean(e.gatewayReachable), error: e.message });
    } finally { if (statusController.current === controller) statusController.current = null; }
  }, []);
  const connect = useCallback(async () => {
    checkController.current?.abort();
    const controller = new AbortController(), selected = current.current.settings;
    checkController.current = controller; setChecking(true); setError(''); setConnectionError('');
    try {
      const result = await client.check(selected, AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]));
      if (!controller.signal.aborted && mounted.current && current.current.settings === selected) {
        setService(result); setGateway({ reachable: true, error: '' });
      }
    } catch (e) {
      if (!controller.signal.aborted && mounted.current && current.current.settings === selected) {
        const message = e instanceof TypeError ? 'Start the DEMO AI gateway on port 8001. See the frontend README.' : e.message;
        setError(message); setConnectionError(message);
        setService(previous => previous ? { ...previous, verified: false } : null);
        setGateway({ reachable: Boolean(e.gatewayReachable), error: message });
      }
    } finally { if (checkController.current === controller && mounted.current) setChecking(false); }
  }, []);
  const run = useCallback(async () => {
    if (inFlight.current || !current.current.running) return;
    const controller = new AbortController(); inFlight.current = controller;
    const state = current.current.voyage.current.physics, observation = buildDemoObservation(state, current.current.voyage.current), selected = current.current.settings;
    let decision;
    const record = result => {
      const cycle = { ...result, end_sim_time_s: state.elapsed, end_display_time_s: current.current.displayTime };
      setLatest(cycle); setHistory(items => [cycle, ...items].slice(0, 20));
    };
    lastAttempt.current = performance.now(); setBusy(true); setError('');
    current.current.onLog('DEMO AI · requesting subsystem proposals and Main Judging approval; physics continues');
    try {
      decision = await client.cycle(observation, selected, AbortSignal.any([controller.signal, AbortSignal.timeout(150000)]));
      if (controller.signal.aborted || !mounted.current) return;
      if (!current.current.running || current.current.voyage.current.physics !== state) throw new Error('DEMO reset or paused during analysis; response discarded.');
      if (current.current.settings !== selected) throw new Error('AI connection changed during analysis; response discarded.');
      setService(decision.connection);
      setGateway({ reachable: true, error: '' }); setConnectionError('');
      const actions = executeDemoDecision(state, observation, decision);
      record({ ...decision, executed: actions.length });
      current.current.onLog(`DEMO AI · ${actions.length} approved action(s) applied after ${decision.latency_s.toFixed(1)}s · ${decision.summary}`);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) {
        const message = e instanceof SyntaxError ? 'DEMO AI gateway unavailable. Start it on port 8001.' : e.message;
        if (current.current.settings === selected && current.current.voyage.current.physics === state) {
          const failed = e.cycle ?? decision;
          if (failed) record({ ...failed, executed: 0, execution_error: message });
          if (e.connection) setService(e.connection);
          if (!decision) setGateway({ reachable: Boolean(e.gatewayReachable), error: message });
        }
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
  return { enabled, busy, checking, settings, service, error, gateway, connectionError,
    history: history.filter(c => c.run_id === voyage.current.physics.runId),
    latest: latest?.run_id === voyage.current.physics.runId ? latest : null, connect, refreshStatus, run, stop,
    reset: () => { stop(); setLatest(null); setHistory([]); setError(''); },
    start: () => { setEnabled(true); lastAttempt.current = -Infinity; }, running };
}
