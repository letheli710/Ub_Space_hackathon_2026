import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import AiApiSettings from './components/AiApiSettings.jsx';
import DisasterMaker from './components/DisasterMaker.jsx';
import Header from './components/Header.jsx';
import Home from './components/Home.jsx';
import SpacecraftViewer from './components/SpacecraftViewer.jsx';
import MissionControl from './components/MissionControl.jsx';
import Telemetry from './components/Telemetry.jsx';
import Timeline from './components/Timeline.jsx';
import Viewer from './components/Viewer.jsx';
import useDemoSession from './simulation/useDemoSession.js';
import { navigationState } from './simulation/missionGuidance.js';

/** Classic frontend. All simulation state lives in useDemoSession so themed skins can share it. */
export default function App() {
  const [tab, setTab] = useState('Home');
  const [viewMode, setViewMode] = useState('demo');
  const [fullPage, setFullPage] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const {
    simulation, live, status, demoAI, changeAiSettings, logs, addLog, voyage, voyageLabel, demoStatus, demoControls,
    event, playing, setPlaying, seconds, timeScale, setTimeScale, stepTimeScale, armed, setArmed,
    rockSettings, setRockSettings, blackHole, toggleBlackHole, solarStorm, triggerSolarStorm,
    solarStormReached, solarStormPassed, stormFlash, faults, triggerFault, hazards, impacts, setImpacts,
    launch, miss, impact, setMapInfo, mapInfo, resetDemo,
  } = useDemoSession({ tab, viewMode });

  // ---------- layout ----------
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

  const workspaceClass = ['workspace', fullPage && 'fullpage', leftOpen && 'left-open', rightOpen && 'right-open']
    .filter(Boolean)
    .join(' ');
  const navigation = simulation.state?.navigation;
  const planetTab = tab === 'Planetary Trajectories';
  const demoNav = !simulation.scene && voyage.current.mission ? navigationState(voyage.current) : null;
  const mapLabel = id => simulation.scene?.map?.objects.find(item => item.entity_id === id)?.label ?? id?.replaceAll('_', ' ') ?? '—';

  return (
    <div className="app">
      <Header tab={tab} onTabChange={setTab} status={status} />

      {tab === 'Home' ? (
        <Home event={event} onNavigate={setTab} demoStatus={demoStatus} />
      ) : tab === 'Spacecraft' ? (
        <SpacecraftViewer simulation={simulation} onLog={addLog} />
      ) : tab === 'AI API' ? (
        <AiApiSettings ai={demoAI} onSettingsChange={changeAiSettings} onOpenControls={() => { setViewMode('demo'); setTab('AI Logs'); }} />
      ) : (
        <div className={workspaceClass}>
          {planetTab ? (
            <MissionControl
              origin={demoNav ? demoNav.origin : mapLabel(navigation?.origin ?? simulation.scene?.map?.origin_entity_id)}
              destination={demoNav ? demoNav.destination : mapLabel(navigation?.destination ?? simulation.scene?.destination.entity_id)}
              voyageLabel={
                simulation.scene
                  ? navigation?.arrived
                    ? 'ARRIVED'
                    : Number.isFinite(navigation?.distance_m)
                      ? `EN ROUTE · ${navigation.distance_m.toFixed(0)} m`
                      : '—'
                  : `DEMO · ${voyageLabel}`
              }
              demo={!simulation.scene}
              mapInfo={mapInfo}
              map={simulation.scene?.map}
              ready={simulation.ready}
            />
          ) : (
            <DisasterMaker
              impact={rockSettings}
              onImpactChange={setRockSettings}
              live={live}
              simulation={simulation}
              demo={demoControls}
              demoAI={demoAI}
              onLog={addLog}
              armed={armed}
              onArm={setArmed}
              blackHole={blackHole}
              onToggleBlackHole={toggleBlackHole}
              solarStorm={Boolean(solarStorm)}
              onSolarStorm={triggerSolarStorm}
              onTrigger={triggerFault}
              activeFaults={faults}
            />
          )}

          <main>
            <Viewer
              demoAI={demoAI}
              tab={tab}
              live={live}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onShowLiveShip={() => { setViewMode('live'); setTab('Generator'); }}
              simulation={simulation}
              onMapInspect={setMapInfo}
              logs={logs}
              fullPage={fullPage}
              onToggleFullPage={() => (fullPage ? exitFullPage() : setFullPage(true))}
              event={event}
              playing={playing}
              seconds={seconds}
              onTogglePlaying={() => setPlaying(!playing)}
              onResetDemo={resetDemo}
              timeScale={timeScale}
              onTimeScaleStep={stepTimeScale}
              onTimeScaleChange={setTimeScale}
              voyage={voyage}
              voyageLabel={voyageLabel}
              armed={armed}
              hazards={hazards}
              impacts={impacts}
              onLaunch={launch}
              onImpact={impact}
              onMiss={miss}
              onImpactDone={(id) => setImpacts((current) => current.filter((i) => i.id !== id))}
              blackHole={blackHole}
              solarStorm={solarStorm}
              stormFlash={stormFlash}
              onStormReach={solarStormReached}
              onStormDone={solarStormPassed}
            />
          </main>

          <aside className="right">
            <Telemetry live={live} simulation={simulation} event={event} demoStatus={demoStatus} />
            <Timeline logs={logs} />
          </aside>

          {fullPage && (
            <>
              <button
                className="drawer-toggle drawer-toggle-left"
                aria-expanded={leftOpen}
                onClick={() => setLeftOpen(!leftOpen)}
              >
                {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                <span>{planetTab ? 'MISSION CONTROL' : 'SHIP CONTROLS'}</span>
              </button>
              <button
                className="drawer-toggle drawer-toggle-right"
                aria-expanded={rightOpen}
                onClick={() => setRightOpen(!rightOpen)}
              >
                {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                <span>TELEMETRY / EVENT LOG</span>
              </button>
            </>
          )}
        </div>
      )}

      <footer>
        INTERSTELLAR X⁴ / HACKATHON PROTOTYPE{' '}
        <span>
          {planetTab ? (simulation.scene ? `BACKEND MAP · ${status}` : 'DEMO MAP · BROWSER PHYSICS · NO BACKEND REQUIRED') : live
            ? 'LIVE SPACE ROS / GAZEBO ENVIRONMENT'
            : simulation.ready
              ? 'DEMO · BROWSER PHYSICS'
              : 'DEMO · BROWSER PHYSICS · NO BACKEND REQUIRED'}
        </span>
      </footer>
    </div>
  );
}
