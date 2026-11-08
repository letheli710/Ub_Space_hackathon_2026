// Explicit live-model smoke test: up to four API calls per cycle. Never prints credentials.
// Start python -m starship_sim.demo_api in the backend before running this tool.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createDemoPhysics, launchDemoRock, advanceDemo, demoTelemetry } from '../src/simulation/demoPhysics.js';
import { buildDemoObservation, executeDemoDecision } from '../src/simulation/demoAI.js';

const api = process.env.DEMO_AI_URL ?? 'http://127.0.0.1:8001/api/v1/demo-ai';
const scenario = process.argv[2] ?? 'avoidance';
const step = (s, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) advanceDemo(s, Math.min(1 / 60, seconds - t)); };
const s = createDemoPhysics();
const warning = scenario === 'repair' ? 2 : 60;
launchDemoRock(s, { target_id: 'command', mass_kg: 200, speed_m_s: 40, warning_s: warning });
if (scenario === 'repair') step(s, 8);
const observation = buildDemoObservation(s), initialHealth = s.bonds.command.health;
const started = performance.now();
const response = await fetch(`${api}/cycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(observation), signal: AbortSignal.timeout(150000) });
const decision = await response.json();
if (!response.ok) throw new Error(typeof decision.detail === 'string' ? decision.detail : `AI HTTP ${response.status}`);
const latency = (performance.now() - started) / 1000;
// Simulate motion during the actual measured network/model delay. No planning pause.
step(s, latency);
let executionError = null, actions = [];
try { actions = executeDemoDecision(s, observation, decision); } catch (error) { executionError = error.message; }
// Include arm travel/extension before the mandatory ten-second contact hold.
step(s, scenario === 'repair' ? 30 : Math.max(12, 70 - latency));
const baseline = createDemoPhysics();
launchDemoRock(baseline, { target_id: 'command', mass_kg: 200, speed_m_s: 40, warning_s: warning });
step(baseline, scenario === 'repair' ? 38 + latency : 70);
const result = { scenario, warning_s: warning, measured_api_latency_s: latency, decision, actions, executionError,
  initial_integrity: initialHealth, ai: demoTelemetry(s), baseline: demoTelemetry(baseline),
  ai_contacts: s.events.filter(e => e.type === 'contact'), baseline_contacts: baseline.events.filter(e => e.type === 'contact') };
await mkdir('../UB_Spaceship_Travel_Sim_Backend/.runtime', { recursive: true });
await writeFile(`../UB_Spaceship_Travel_Sim_Backend/.runtime/demo-ai-${scenario}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ scenario, latency_s: latency.toFixed(2), approved: decision.approved_options, executionError,
  ai_contacts: result.ai_contacts.length, baseline_contacts: result.baseline_contacts.length,
  integrity_before: initialHealth, integrity_after: s.bonds.command.health, baseline_integrity: baseline.bonds.command.health }, null, 2));
assert.equal(executionError, null);
if (scenario === 'repair') assert.ok(s.bonds.command.health > initialHealth, 'Approved repair must recover measured integrity');
else { assert.ok(result.baseline_contacts.length > 0, 'Baseline must actually collide'); assert.equal(result.ai_contacts.length, 0, 'Approved AI burn must actually avoid contact'); }
