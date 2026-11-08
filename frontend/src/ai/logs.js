/** Adapt gateway facts to the teammate's connection cards and per-system logs. */
export function demoConnection(ai, id) {
  const role = ai.service?.systems?.find(item => item.id === id);
  if (ai.busy) return ['ok', 'Analyzing…', role?.model ?? ''];
  if (ai.gateway?.reachable === false) return ['bad', 'Gateway offline', ai.gateway.error];
  if (ai.checking) return ['wait', 'Checking model access…', role?.model ?? ''];
  if (ai.connectionError) return ['bad', 'Connection check failed', ai.connectionError];
  if (ai.latest?.errors?.[id]) return ['bad', 'Last call failed', ai.latest.errors[id]];
  const call = ai.latest?.calls?.[id];
  if (call?.status === 'skipped') return ['warn', 'Not called', 'All subsystems failed; no actions authorized.'];
  if (!role) return ['wait', 'Not checked', ''];
  if (!ai.service.enabled) return ['warn', 'AI disabled', role.model];
  if (!role.configured) return ['warn', 'No API key', role.model];
  if (call?.status === 'ok') return ['ok', 'Connected', `${call.model} · last call ${call.duration_s.toFixed(1)} s`];
  return ai.service.verified ? ['ok', 'Model access verified', role.model] : ['warn', 'Configured · not verified', role.model];
}

export function demoGatewayConnection(ai) {
  if (ai.gateway?.reachable === false) return ['bad', 'Offline', ai.gateway.error];
  if (ai.gateway?.reachable === true) return ['ok', 'Online', ai.busy ? 'Analyzing' : 'Idle'];
  return ['wait', 'Checking…', ''];
}

/** Explicit role IDs from the gateway, rather than guessing ownership from prose. */
export function demoCycleEntries(cycle, onlyRole = null) {
  const entries = [];
  const add = (role, text) => {
    if (!onlyRole || onlyRole === role) entries.push({ key: `${cycle.id}-${role}-${entries.length}`,
      seconds: cycle.end_display_time_s ?? cycle.end_sim_time_s ?? cycle.sim_time_s, source: 'DEMO AI', system_id: role, text });
  };
  for (const [role, assessment] of Object.entries(cycle.assessments ?? {})) add(role, `Assessment · ${assessment}`);
  for (const proposal of cycle.proposals ?? []) {
    const review = cycle.reviews?.find(r => r.proposal_id === proposal.id);
    const state = review ? (review.approve ? 'APPROVED' : 'REJECTED') : 'NOT AUTHORIZED';
    add(proposal.system, `${proposal.option_id} · ${state} · ${proposal.rationale}${review ? ` · Main Judging: ${review.reason}` : ''}`);
  }
  for (const [role, error] of Object.entries(cycle.errors ?? {})) add(role, `Call failed · ${error}`);
  add('main_judging', `${cycle.summary} · ${cycle.executed ?? 0} action(s) executed`);
  if (cycle.combination_rationale) add('main_judging', `Combination · ${cycle.combination_rationale}`);
  for (const review of cycle.reviews ?? []) add('main_judging', `${review.proposal_id} · ${review.approve ? 'APPROVED' : 'REJECTED'} · ${review.reason}`);
  if (cycle.execution_error) add('main_judging', `No actions executed · ${cycle.execution_error}`);
  return entries;
}
