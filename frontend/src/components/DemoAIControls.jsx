export default function DemoAIControls({ ai }) {
  return <section className="arm-controls impact-controls demo-ai-controls">
    <h4>DEMO AI MANAGEMENT</h4>
    <p className="muted">Propelling, Energy and Robot Arms propose actions. Main Judging can approve and combine them. Approved actions now control DEMO.</p>
    <p className="muted">Connection: {ai.settings ? `${ai.settings.provider} · ${ai.settings.model || 'model required'} · saved in AI API` : 'backend .env'}</p>
    <div className="choices">
      <button disabled={ai.checking} onClick={ai.connect}>{ai.checking ? 'Checking connection…' : 'Check AI connection'}</button>
      <button disabled={ai.busy || !ai.running} onClick={ai.run}>Run DEMO AI once</button>
      <button onClick={ai.enabled || ai.busy ? ai.stop : ai.start}>{ai.enabled || ai.busy ? 'Stop DEMO AI' : 'Enable DEMO autopilot'}</button>
    </div>
    <p className="muted">{ai.busy ? 'Models are analyzing · physics continues' : ai.enabled ? 'Autopilot watching for threats and repairable damage' : 'Manual AI cycles only'}</p>
    {Object.entries(ai.subsystems ?? {}).filter(([,s])=>s.mode!=='online').map(([id,s])=><p key={id} role="status">{id.replaceAll('_',' ')} · {s.mode} · {s.reason}{s.remaining_s>0 ? ` · ${s.remaining_s.toFixed(1)} s remaining` : ''}</p>)}
    <p className="muted">Each cycle calls available subsystems, then Main Judging. Offline roles are skipped. For avoidance tests, use Launch space rock with a 60 s preset warning, or place a slower rock farther away. Pointer distance determines its arrival time. Short-warning impacts may be unavoidable.</p>
    {ai.service && <p className="muted">Gateway: {ai.service.verified ? 'MODEL ACCESS VERIFIED' : ai.service.enabled && ai.service.systems.every(s => s.configured) ? 'CONFIGURED' : 'NOT CONFIGURED'} · {ai.service.systems.map(s => `${s.id}: ${s.model}`).join(' · ')}</p>}
    {ai.error && <p role="alert">{ai.error}</p>}
    {ai.latest && <details open>
      <summary>Main Judging · {ai.latest.executed} actions executed · {ai.latest.latency_s.toFixed(1)} s</summary>
      <p>{ai.latest.summary}</p><p className="muted">{ai.latest.combination_rationale}</p>
      {Object.entries(ai.latest.assessments ?? {}).map(([role, assessment]) => <p className="muted" key={role}>{role}: {assessment}</p>)}
      {Object.entries(ai.latest.errors ?? {}).map(([role, error]) => <p role="alert" key={role}>{role}: {error}</p>)}
      {ai.latest.proposals.map(p => <p className="muted" key={p.id}>{p.system} → {p.option_id} · {ai.latest.approved_options.includes(p.option_id) ? 'APPROVED' : 'REJECTED'} · {p.rationale}</p>)}
    </details>}
  </section>;
}
