import { useEffect, useState } from 'react';
import { assetUrl } from '../simulation/useSimulation.js';
import AIControlPanel from './AIControlPanel.jsx';
import DemoAIControls from './DemoAIControls.jsx';

// AI Logs tab: one "All" view plus one view per AI system. Left: that system's management
// details and event log. Right: that system's connection status (live backend and DEMO gateway).

export const AI_SYSTEMS = [
  { id: 'main_judging', label: 'Main Judging', about: 'Reviews every subsystem proposal, weighs the risk, then approves and combines actions.' },
  { id: 'propelling', label: 'Propelling', about: 'Thrust, burns and course corrections.' },
  { id: 'energy', label: 'Energy', about: 'Solar panels, battery charge and power.' },
  { id: 'robot_arms', label: 'Robot Arms', about: 'The ten robotic arms: repairs, servicing and maintenance.' },
];

// Which system a plain simulation/demo log line belongs to.
const KEYWORDS = {
  main_judging: /main judging|approved|DEMO AI ·|AI RESOLVED|judg/i,
  propelling: /burn|thrust|propuls|engine|course|coast|departure|arrived|orbit|velocity/i,
  energy: /solar|battery|power|charge|energy|storm/i,
  robot_arms: /\barm\b|arms|repair|maintenance|servic|structural|detached|integrity/i,
};

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

/** Polls the live backend's AI status (port 8000 through the dev proxy). */
function useLiveAiStatus() {
  const [status, setStatus] = useState(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const response = await fetch(assetUrl('/api/v1/ai/status'), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error(String(response.status));
        const next = await response.json();
        if (!controller.signal.aborted) {
          setStatus(next);
          setOffline(false);
        }
      } catch {
        if (!controller.signal.aborted) setOffline(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return { status, offline };
}

/** Connection state of one system on the live backend: [tone, text, detail]. */
function liveConnection(live, id) {
  if (live.offline) return ['bad', 'Backend offline', 'Start the backend on port 8000.'];
  if (!live.status) return ['wait', 'Connecting…', ''];
  const role = live.status.systems?.find((item) => item.id === id);
  if (!role) return ['wait', 'Unknown', ''];
  if (!live.status.enabled) return ['warn', 'AI disabled', `${role.model} · set AI_ENABLED=true in the backend .env`];
  if (!role.configured) return ['warn', 'No API key', `${role.model} · add the key to the backend .env`];
  const call = role.last_call ?? {};
  if (call.status === 'error') return ['bad', 'Last call failed', call.error ?? role.model];
  if (call.status === 'calling') return ['ok', 'Calling model…', role.model];
  if (call.status === 'ok') return ['ok', 'Connected', `${role.model} · last call ${call.duration_s?.toFixed(1) ?? '?'} s`];
  return ['ok', 'Ready', `${role.model} · not called yet`];
}

/** Connection state of one system on the DEMO AI gateway: [tone, text, detail]. */
function demoConnection(ai, id) {
  if (ai.busy) return ['ok', 'Analyzing…', ''];
  if (!ai.service) return ai.error ? ['bad', 'Gateway offline', 'Start the DEMO AI gateway on port 8001.'] : ['wait', 'Not checked', ''];
  const role = ai.service.systems?.find((item) => item.id === id);
  if (!role) return ['wait', 'Unknown', ''];
  if (!ai.service.enabled) return ['warn', 'AI disabled', role.model];
  if (!role.configured) return ['warn', 'No API key', role.model];
  if (ai.latest?.errors?.[id]) return ['bad', 'Last call failed', ai.latest.errors[id]];
  return ['ok', 'Ready', role.model];
}

function StatusRow({ title, state }) {
  const [tone, text, detail] = state;
  return (
    <div className="ai-conn-row">
      <span className={`ai-dot ${tone}`} aria-hidden="true" />
      <div>
        <span className="ai-conn-title">{title}</span>
        <strong>{text}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}

function SystemStatus({ system, live, ai, compact }) {
  return (
    <div className="ai-conn-card">
      <h4>{system.label}</h4>
      {!compact && <p className="muted">{system.about}</p>}
      <StatusRow title="Live backend" state={liveConnection(live, system.id)} />
      <StatusRow title="DEMO gateway" state={demoConnection(ai, system.id)} />
    </div>
  );
}

/** Everything one system did: AI events, proposals, decisions and matching simulation logs. */
function systemEntries(id, { live, ai, logs }) {
  const entries = [];
  for (const item of live.status?.events ?? []) {
    const owner = item.system_id ?? (item.kind === 'judgement' ? 'main_judging' : null);
    if (owner === id) entries.push({ key: `live-${item.id}`, time: new Date(item.at).toLocaleTimeString(), source: 'LIVE AI', text: item.text });
  }
  for (const item of logs) {
    if (KEYWORDS[id].test(item.text)) entries.push({ key: `log-${item.id}`, time: formatClock(item.seconds), source: 'EVENT', text: item.text });
  }
  return entries;
}

function SystemDetail({ system, live, ai, logs }) {
  const cycle = live.status?.latest_cycle;
  const liveProposals = (cycle?.proposals ?? []).filter((p) => p.system_id === system.id);
  const demoProposals = (ai.latest?.proposals ?? []).filter((p) => p.system === system.id);
  const approvedLive = new Set(cycle?.judgement?.approved_action_ids ?? []);
  const entries = systemEntries(system.id, { live, ai, logs });
  const judging = system.id === 'main_judging';

  return (
    <div className="ai-management">
      <div className="ai-heading">
        <strong>{system.label.toUpperCase()} · AI MANAGEMENT</strong>
      </div>
      <p>{system.about}</p>

      <section className="ai-live-state">
        <h3>LIVE BACKEND · LATEST CYCLE</h3>
        {!cycle ? (
          <p className="muted">No live AI cycle yet.</p>
        ) : judging ? (
          cycle.judgement ? (
            <>
              <p><strong>Summary: </strong>{cycle.judgement.summary}</p>
              <p><strong>Combination: </strong>{cycle.judgement.combination_rationale}</p>
              {cycle.judgement.risk_analysis?.map((review) => (
                <p key={review.proposal_id} className="muted">{review.proposal_id} · {review.decision} · {review.risks}</p>
              ))}
            </>
          ) : (
            <p className="muted">Awaiting judgement · {cycle.status.replaceAll('_', ' ')}</p>
          )
        ) : liveProposals.length ? (
          liveProposals.map((proposal) => (
            <details key={proposal.id} className="ai-proposal" open>
              <summary>{proposal.title}</summary>
              <p>{proposal.rationale}</p>
              <ul>
                {proposal.actions.map((item) => (
                  <li key={item.id}>{approvedLive.has(item.id) ? 'Approved' : cycle.judgement ? 'Not approved' : 'Proposed'} · {item.action.type.replaceAll('_', ' ')}</li>
                ))}
              </ul>
            </details>
          ))
        ) : (
          <p className="muted">No proposals from {system.label} in the latest cycle.</p>
        )}
        {cycle?.errors?.[system.id] && <p className="ai-notice">{cycle.errors[system.id]}</p>}
      </section>

      <section className="ai-live-state">
        <h3>DEMO · LATEST CYCLE</h3>
        {!ai.latest ? (
          <p className="muted">No DEMO AI cycle yet.</p>
        ) : judging ? (
          <>
            <p><strong>Summary: </strong>{ai.latest.summary}</p>
            <p className="muted">{ai.latest.combination_rationale}</p>
            <p className="muted">{ai.latest.executed} action(s) executed · {ai.latest.latency_s?.toFixed(1)} s</p>
          </>
        ) : (
          <>
            {ai.latest.assessments?.[system.id] && <p><strong>Assessment: </strong>{ai.latest.assessments[system.id]}</p>}
            {demoProposals.length ? (
              demoProposals.map((p) => (
                <p key={p.id}>{p.option_id} · {ai.latest.approved_options.includes(p.option_id) ? 'APPROVED' : 'REJECTED'} · <span className="muted">{p.rationale}</span></p>
              ))
            ) : (
              <p className="muted">No proposals from {system.label} in the latest cycle.</p>
            )}
          </>
        )}
        {ai.latest?.errors?.[system.id] && <p className="ai-notice">{ai.latest.errors[system.id]}</p>}
      </section>

      <section className="ai-system-log">
        <h3>EVENT LOG · {entries.length}</h3>
        {entries.length ? (
          entries.map((entry) => (
            <div key={entry.key}>
              <time>{entry.time}</time>
              <span className="ai-log-source">{entry.source}</span>
              <span>{entry.text}</span>
            </div>
          ))
        ) : (
          <p className="muted">No {system.label} events yet.</p>
        )}
      </section>
    </div>
  );
}

export default function AiLogs({ viewMode, demoAI, simulation, logs, onShowLiveShip }) {
  const [selected, setSelected] = useState('all');
  const live = useLiveAiStatus();
  const system = AI_SYSTEMS.find((item) => item.id === selected);

  // Check the DEMO gateway once when the page opens, then every 10 s.
  const { connect } = demoAI;
  useEffect(() => {
    connect();
    const timer = setInterval(connect, 10000);
    return () => clearInterval(timer);
  }, [connect]);

  return (
    <div className="ai-logs-page">
      <div className="ai-system-tabs" role="tablist" aria-label="AI system">
        {[{ id: 'all', label: 'All' }, ...AI_SYSTEMS].map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={selected === item.id}
            className={selected === item.id ? 'active' : ''}
            onClick={() => setSelected(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="ai-logs-body">
        <section className="ai-logs-main">
          {system ? (
            <SystemDetail system={system} live={live} ai={demoAI} logs={logs} />
          ) : (
            <>
              {viewMode === 'demo' ? <DemoAIControls ai={demoAI} /> : <AIControlPanel simulation={simulation} onShowLiveShip={onShowLiveShip} />}
              <section className="ai-system-log">
                <h3>SIMULATION AND DEMO EVENTS · {logs.length}</h3>
                {logs.map((item) => (
                  <div key={item.id}>
                    <time>{formatClock(item.seconds)}</time>
                    <span>{item.text}</span>
                  </div>
                ))}
              </section>
            </>
          )}
        </section>

        <aside className="ai-logs-status">
          <h3>CONNECT STATUS</h3>
          <div className="ai-conn-service">
            <StatusRow
              title="Live backend AI · port 8000"
              state={live.offline ? ['bad', 'Offline', ''] : !live.status ? ['wait', 'Connecting…', ''] : live.status.enabled ? ['ok', 'Online', live.status.loop_running ? 'Loop running' : live.status.active ? 'Analyzing' : 'Idle'] : ['warn', 'Online · AI disabled', '']}
            />
            <StatusRow
              title="DEMO AI gateway · port 8001"
              state={demoAI.service ? (demoAI.service.enabled ? ['ok', 'Online', demoAI.service.busy ? 'Analyzing' : 'Idle'] : ['warn', 'Online · AI disabled', '']) : demoAI.error ? ['bad', 'Offline', ''] : ['wait', 'Checking…', '']}
            />
            <button onClick={connect}>Check again</button>
          </div>
          {(system ? [system] : AI_SYSTEMS).map((item) => (
            <SystemStatus key={item.id} system={item} live={live} ai={demoAI} compact={!system} />
          ))}
        </aside>
      </div>
    </div>
  );
}
