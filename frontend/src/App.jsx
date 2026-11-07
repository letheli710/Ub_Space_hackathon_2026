import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import DisasterMaker from './components/DisasterMaker.jsx';
import Header from './components/Header.jsx';
import Introduction from './components/Introduction.jsx';
import Telemetry from './components/Telemetry.jsx';
import Timeline from './components/Timeline.jsx';
import Viewer from './components/Viewer.jsx';
import useSimulation from './simulation/useSimulation.js';

export default function App() {
  const simulation = useSimulation();
  const [tab, setTab] = useState('Generator');
  const [logs, setLogs] = useState([]);
  const [fullPage, setFullPage] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const stateRef = useRef();
  stateRef.current = simulation.state;
  const sequence = useRef(0);
  const previousTime = useRef(null);
  const addLog = useCallback(text => setLogs(items => [{ id: ++sequence.current,
    seconds: stateRef.current?.sim_time_s ?? null, text }, ...items].slice(0, 40)), []);
  const simulationTime = simulation.state?.sim_time_s;
  useEffect(() => {
    if (Number.isFinite(simulationTime)) {
      if (previousTime.current !== null && simulationTime < previousTime.current - 0.5) {
        setLogs([]);
        addLog('Simulator restarted · new voyage');
      }
      previousTime.current = simulationTime;
    }
  }, [simulationTime, addLog]);
  useEffect(() => {
    addLog(simulation.ready ? 'Simulator connected · live measurements received' : 'Waiting for live simulator connection');
  }, [simulation.ready, addLog]);
  const paused = simulation.state?.paused;
  useEffect(() => {
    if (paused !== null && paused !== undefined) addLog(paused ? 'Simulation paused' : 'Simulation running');
  }, [paused, addLog]);
  const arrived = simulation.state?.navigation?.arrived;
  useEffect(() => { if (arrived) addLog('Destination approach complete · ship holding position'); }, [arrived, addLog]);

  function exitFullPage() { setFullPage(false); setLeftOpen(false); setRightOpen(false); }
  useEffect(() => {
    if (!fullPage) return;
    const onKeyDown = event => { if (event.key === 'Escape') exitFullPage(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKeyDown); };
  }, [fullPage]);
  const workspaceClass = ['workspace', fullPage && 'fullpage', leftOpen && 'left-open', rightOpen && 'right-open'].filter(Boolean).join(' ');
  const status = !simulation.connected ? 'OFFLINE' : !simulation.ready ? 'CONNECTING' : paused ? 'PAUSED' : 'LIVE';
  return (
    <div className="app">
      <Header tab={tab} onTabChange={setTab} status={status} />
      {tab === 'Introduction' ? <Introduction /> : (
        <div className={workspaceClass}>
          <DisasterMaker simulation={simulation} onLog={addLog} />
          <main><Viewer tab={tab} simulation={simulation} logs={logs} fullPage={fullPage}
            onToggleFullPage={() => fullPage ? exitFullPage() : setFullPage(true)} /></main>
          <aside className="right"><Telemetry simulation={simulation} /><Timeline logs={logs} /></aside>
          {fullPage && <>
            <button className="drawer-toggle drawer-toggle-left" aria-expanded={leftOpen} onClick={() => setLeftOpen(!leftOpen)}>
              {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}<span>SHIP CONTROLS</span>
            </button>
            <button className="drawer-toggle drawer-toggle-right" aria-expanded={rightOpen} onClick={() => setRightOpen(!rightOpen)}>
              {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}<span>TELEMETRY / EVENT LOG</span>
            </button>
          </>}
        </div>
      )}
      <footer>INTERSTELLAR X⁴ / HACKATHON PROTOTYPE<span>{simulation.ready ? 'LIVE SPACE ROS / GAZEBO ENVIRONMENT' : 'WAITING FOR SIMULATOR'}</span></footer>
    </div>
  );
}
