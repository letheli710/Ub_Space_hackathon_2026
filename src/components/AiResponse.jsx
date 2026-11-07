import { BrainCircuit } from 'lucide-react';

const REASONING_STEPS =
  '1. Identify affected subsystem.\n2. Estimate risk and resource cost.\n3. Execute recovery procedure.\n4. Monitor telemetry for stabilization.';

export default function AiResponse({ event }) {
  return (
    <div className="panel ai">
      <div className="panelhead">
        <BrainCircuit size={18} /> AUTONOMOUS AI RESPONSE
      </div>
      <div className="airesponse">
        {event
          ? `Detected ${event.name.toLowerCase()}. Prioritizing spacecraft stabilization and system protection.`
          : 'Standing by. All monitored systems are within nominal operating ranges.'}
      </div>
      <h4>DECISION REASONING</h4>
      <p>
        {event
          ? REASONING_STEPS
          : 'No active hazard. Select a disaster and inject it to observe AI response.'}
      </p>
      <div className="demo">DEMO MODE · illustrative rule-based responses</div>
    </div>
  );
}
