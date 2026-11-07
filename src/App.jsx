import { useEffect, useState } from 'react';
import AiResponse from './components/AiResponse.jsx';
import DisasterMaker from './components/DisasterMaker.jsx';
import Header from './components/Header.jsx';
import MissionStatus from './components/MissionStatus.jsx';
import Telemetry from './components/Telemetry.jsx';
import Timeline from './components/Timeline.jsx';
import Viewer from './components/Viewer.jsx';
import { demoAiResponse } from './data/disasters.js';

export default function App() {
  const [tab, setTab] = useState('Generator');
  const [choice, setChoice] = useState('Asteroid Collision');
  const [severity, setSeverity] = useState(65);
  const [speed, setSpeed] = useState(12);
  const [angle, setAngle] = useState(30);
  const [event, setEvent] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [logs, setLogs] = useState(['SYSTEM READY · Awaiting disaster injection']);
  const [seconds, setSeconds] = useState(0);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [playing]);

  function inject() {
    setEvent({ name: choice, severity });
    setLogs(
      [
        `DISASTER INJECTED · ${choice} · Severity ${severity}%`,
        'AI DETECTED · Evaluating spacecraft state',
        `AI RESPONSE · ${demoAiResponse(choice)}`,
        ...logs,
      ].slice(0, 12),
    );
    setPlaced(false);
  }

  function reset() {
    setEvent(null);
    setLogs(['SYSTEM RESET · All systems nominal']);
    setSeconds(0);
  }

  return (
    <div className="app">
      <Header tab={tab} onTabChange={setTab} event={event} />

      <div className="workspace">
        <DisasterMaker
          choice={choice}
          onChoiceChange={setChoice}
          severity={severity}
          onSeverityChange={setSeverity}
          speed={speed}
          onSpeedChange={setSpeed}
          angle={angle}
          onAngleChange={setAngle}
          placed={placed}
          onInject={inject}
          onReset={reset}
        />

        <main>
          <Viewer
            tab={tab}
            event={event}
            playing={playing}
            logs={logs}
            seconds={seconds}
            onTogglePlaying={() => setPlaying(!playing)}
            onReset={reset}
            onPlace={() => setPlaced(true)}
          />
          <Timeline logs={logs} seconds={seconds} />
        </main>

        <aside className="right">
          <Telemetry event={event} />
          <AiResponse event={event} />
          <MissionStatus event={event} />
        </aside>
      </div>

      <footer>
        ASTRACTRL / HACKATHON PROTOTYPE{' '}
        <span>3D UI DEMO — PHYSICS AND AI BACKEND INTEGRATION PENDING</span>
      </footer>
    </div>
  );
}
