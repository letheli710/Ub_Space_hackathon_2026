import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import DisasterMaker from './components/DisasterMaker.jsx';
import Header from './components/Header.jsx';
import Introduction from './components/Introduction.jsx';
import Telemetry from './components/Telemetry.jsx';
import Timeline from './components/Timeline.jsx';
import Viewer from './components/Viewer.jsx';
import { DISASTER_PARAMETERS, demoAiResponse } from './data/disasters.js';

export default function App() {
  const [tab, setTab] = useState('Generator');
  const [choice, setChoice] = useState('Asteroid Collision');
  const [event, setEvent] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [logs, setLogs] = useState(['SYSTEM READY · Awaiting disaster injection']);
  const [seconds, setSeconds] = useState(0);
  const [placed, setPlaced] = useState(false);
  const [fullPage, setFullPage] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [playing]);

  function exitFullPage() {
    setFullPage(false);
    setLeftOpen(false);
    setRightOpen(false);
  }

  useEffect(() => {
    if (!fullPage) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') exitFullPage();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fullPage]);

  function inject() {
    const { severity } = DISASTER_PARAMETERS;
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

  const workspaceClass = [
    'workspace',
    fullPage && 'fullpage',
    leftOpen && 'left-open',
    rightOpen && 'right-open',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="app">
      <Header tab={tab} onTabChange={setTab} event={event} />

      {tab === 'Introduction' ? (
        <Introduction />
      ) : (
        <div className={workspaceClass}>
          <DisasterMaker
            choice={choice}
            onChoiceChange={setChoice}
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
              fullPage={fullPage}
              onTogglePlaying={() => setPlaying(!playing)}
              onReset={reset}
              onPlace={() => setPlaced(true)}
              onToggleFullPage={() => (fullPage ? exitFullPage() : setFullPage(true))}
            />
          </main>

          <aside className="right">
            <Telemetry event={event} />
            <Timeline logs={logs} seconds={seconds} />
          </aside>

          {fullPage && (
            <>
              <button
                className="drawer-toggle drawer-toggle-left"
                aria-expanded={leftOpen}
                onClick={() => setLeftOpen(!leftOpen)}
              >
                {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                <span>DISASTER MAKER</span>
              </button>
              <button
                className="drawer-toggle drawer-toggle-right"
                aria-expanded={rightOpen}
                onClick={() => setRightOpen(!rightOpen)}
              >
                {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                <span>TELEMETRY / AI LOG</span>
              </button>
            </>
          )}
        </div>
      )}

      <footer>
        ASTRACTRL / HACKATHON PROTOTYPE{' '}
        <span>3D UI DEMO — PHYSICS AND AI BACKEND INTEGRATION PENDING</span>
      </footer>
    </div>
  );
}
