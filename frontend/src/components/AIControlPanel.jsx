import { useEffect, useState } from 'react';
import { assetUrl } from '../simulation/useSimulation.js';
import { healthReadings } from '../simulation/shipTelemetry.js';

async function request(path, body, signal) {
  const response = await fetch(assetUrl(`/api/v1/ai/${path}`), {
    signal: signal ?? AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `AI request failed (${response.status})`);
  return data;
}

function actionLabel(action, scene) {
  if (action.type === 'follow_navigation') return `Follow destination for ${action.duration_s}s`;
  if (action.type === 'thruster_velocity') return `Thrusters: (${Object.values(action.linear_m_s).join(', ')}) m/s in ship frame for ${action.duration_s}s`;
  if (action.type === 'thruster_burn') return `Thrust (${Object.values(action.linear_throttle).join(', ')}) · rotation (${Object.values(action.angular_throttle).join(', ')}) throttle for ${action.duration_s}s`;
  if (action.type === 'solar_panel_target') return `Solar panel ${action.panel_id}: ${action.target_rad} rad`;
  if (action.type === 'arm_service') return `Arm ${action.arm_id}: service ${action.component.replaceAll('_', ' ')} for ${action.duration_s}s at its measured service pose`;
  const arm = scene?.arms.find(item => item.id === action.arm_id);
  return `Arm ${action.arm_id}: ${Object.entries(action.targets).map(([name, value]) => `${name} ${value} ${arm?.joints[name]?.unit ?? 'rad'}`).join(', ')}`;
}

export default function AIControlPanel({ simulation, onShowLiveShip }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const next = await request('status', undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
        if (!controller.signal.aborted) { setStatus(next); setOffline(''); }
      } catch {
        if (!controller.signal.aborted) setOffline('AI service unavailable. Start or rebuild the backend, then reconnect.');
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  async function command(path, body) {
    setPending(true); setError('');
    try { await request(path, body); setStatus(await request('status')); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  const configured = status?.systems.every(role => role.configured);
  const canRun = !offline && status?.enabled && configured && simulation.ready && !pending && !status.active && !status.loop_running;
  const cycle = status?.latest_cycle;
  const canExecutePlan = !offline && status?.enabled && configured && simulation.ready && !pending && !status.active && !status.loop_running && !simulation.state?.paused && cycle?.status === 'planned' && cycle.expires_in_s > 0;
  const approved = new Set(cycle?.judgement?.approved_action_ids ?? []);
  return <div className="ai-management">
    <div className="ai-heading"><strong>LIVE SPACECRAFT AI</strong><span>{status?.loop_running ? 'LOOP RUNNING' : status?.active ? 'ANALYZING' : 'IDLE'}</span></div>
    <p>Subsystems propose. Main Judging reviews risk and combines compatible actions. Only its approved actions reach the live ship.</p>
    <p>Run one cycle executes the approved plan. Start loop controls the ship repeatedly. Analyze only creates a preview.</p>
    {offline ? <p role="status" className="ai-notice">{offline}</p> : !status ? <p>Connecting to AI service…</p> :
      !status.enabled ? <p className="ai-notice">AI mode is off. Configure the backend .env and restart to enable it.</p> :
        !configured ? <p className="ai-notice">DeepSeek API key is missing. Configure it in the backend .env and restart.</p> : null}
    <div className="ai-systems">{status?.systems.map(role => <div key={role.id}>
      <strong>{role.name}</strong><span>{role.model}</span><small>{!role.configured ? 'Key not configured' : role.last_call.status === 'not_called' ? 'Configured · not called yet' : role.last_call.status}</small>
      {role.last_call.error && <small className="ai-notice">{role.last_call.error}</small>}
    </div>)}</div>
    <div className="ai-buttons">
      <button disabled={!canRun} onClick={() => command('cycles', { execute: false })}>Analyze only</button>
      <button disabled={!canRun || simulation.state?.paused} onClick={() => command('cycles', { execute: true })}>Run one cycle</button>
      <button disabled={!canRun || simulation.state?.paused} onClick={() => command('control', { running: true })}>Start loop</button>
      {cycle?.status === 'planned' && <button disabled={!canExecutePlan} onClick={() => command(`cycles/${cycle.id}/execute`, {})}>Execute approved plan</button>}
      <button disabled={pending || !status || Boolean(offline)} onClick={() => command('control', { running: false })}>Stop AI</button>
      <button onClick={onShowLiveShip}>View live ship</button>
    </div>
    <p className="muted">Each cycle makes up to four model calls. AI controls LIVE SIM; the browser Demo is separate. Stop cancels analysis, maintenance and propulsion; published joint targets can continue moving.</p>
    <section className="ai-live-state">
      <h3>CURRENT STATUS SEEN BY AI</h3>
      <p>{simulation.ready ? 'Live' : 'Stale'} · Propulsion: {simulation.state?.propulsion?.control_mode?.replaceAll('_', ' ') ?? '—'} · Measured speed: {simulation.state?.ship_status?.speed_m_s?.toFixed(2) ?? '—'} m/s</p>
      <div className="ai-status-readings">{healthReadings(simulation.state?.ship_status).map(({ label, key, value }) => {
        const before = cycle?.observation.ship_status?.metrics?.[key];
        const change = value != null && Number.isFinite(before) ? value - before : null;
        return <div key={key}><span>{label}</span><strong>{value == null ? '—' : `${value.toFixed(1)}%`}</strong>{change !== null && <small>{change >= 0 ? '+' : ''}{change.toFixed(1)} since cycle observation</small>}</div>;
      })}</div>
      <p className="muted">These health readings use the backend game model. Motion comes from Gazebo.</p>
      <p>Detected nearby: {simulation.state?.sensors?.objects.map(item => `${item.label} (${item.distance_m.toFixed(0)} m${item.proximity_warning ? ', proximity warning' : ''})`).join(' · ') || 'No current detections'}</p>
      {(simulation.state?.ship_status?.maintenance ?? []).map(job => <p key={job.arm_id}>Arm {job.arm_id} → {job.component.replaceAll('_', ' ')}: {job.status.replaceAll('_', ' ')} · recovered {job.recovered_pct.toFixed(1)}%</p>)}
    </section>
    {status?.enabled && simulation.state?.paused && <p className="ai-notice">Resume the simulator to execute actions.</p>}
    {error && <p role="alert" className="ai-notice">{error}</p>}
    {cycle && <section className="ai-cycle">
      <h3>LATEST CYCLE · {cycle.status.replaceAll('_', ' ').toUpperCase()}</h3>
      <small>{cycle.created_at} · {cycle.execute_requested ? 'Execution requested' : 'Analysis only'} · Plan valid for {cycle.expires_in_s.toFixed(0)}s</small>
      {Object.entries(cycle.errors).map(([role, text]) => <p className="ai-notice" key={role}>{role.replaceAll('_', ' ')}: {text}</p>)}
      {cycle.judgement && <><p><strong>Main Judging: </strong>{cycle.judgement.summary}</p><p><strong>Combination: </strong>{cycle.judgement.combination_rationale}</p></>}
      {cycle.proposals.map(proposal => {
        const review = cycle.judgement?.risk_analysis.find(item => item.proposal_id === proposal.id);
        return <details key={proposal.id} className="ai-proposal" open>
          <summary>{proposal.system_id.replaceAll('_', ' ')} · {proposal.title} · {review?.decision ?? 'Awaiting judgement'}</summary>
          <p>{proposal.rationale}</p><p>Expected benefit: {proposal.expected_benefit}</p><p>Risk: {proposal.risks}</p>
          <ul>{proposal.actions.map(item => <li key={item.id}>{approved.has(item.id) ? 'Approved' : cycle.judgement ? 'Not approved' : 'Proposed'}: {actionLabel(item.action, simulation.scene)}</li>)}</ul>
          {review && <p>Judge: {review.damage_avoidance} Risk: {review.risks} {review.uncertainties.length > 0 && `Unknowns: ${review.uncertainties.join('; ')}`}</p>}
        </details>;
      })}
      {cycle.execution && <p>Execution: {cycle.execution.status}. {cycle.execution.error ?? cycle.execution.note ?? 'Inspect measured telemetry to confirm movement.'}</p>}
      {(cycle.execution?.actions ?? []).map((item, index) => <p key={index}>{actionLabel(item.action, simulation.scene)} · {item.result?.status ?? 'published'}</p>)}
    </section>}
    <details className="ai-audit"><summary>AI activity</summary>{[...(status?.events ?? [])].reverse().map(item => <p key={item.id}><time>{new Date(item.at).toLocaleTimeString()}</time> · {item.text}</p>)}</details>
  </div>;
}
