// PROTOTYPE — throwaway. Four visual directions for Interstellar X⁴, switchable via ?variant=A|B|C|D
// and ?page=home|console. Only mounted in dev when ?variant= is present (see main.jsx).
import { useEffect, useState } from 'react';
import { useMockSim } from './mock.jsx';
import VariantA from './VariantA.jsx';
import VariantB from './VariantB.jsx';
import VariantC from './VariantC.jsx';
import VariantD from './VariantD.jsx';
import VariantE from './VariantE.jsx';
import VariantF from './VariantF.jsx';
import VariantG from './VariantG.jsx';
import VariantH from './VariantH.jsx';
import VariantI from './VariantI.jsx';
import VariantJ from './VariantJ.jsx';
import VariantK from './VariantK.jsx';
import VariantL from './VariantL.jsx';
import VariantM from './VariantM.jsx';
import VariantN from './VariantN.jsx';
import VariantO from './VariantO.jsx';
import './prototype.css';

const VARIANTS = {
  A: { name: 'Cryo Glass · 冷霜磨砂玻璃', C: VariantA },
  B: { name: 'Flight Deck · 琥珀飞行控制台', C: VariantB },
  C: { name: 'Editorial · 黑白编辑排版', C: VariantC },
  D: { name: 'Immersive HUD · 无框沉浸舱', C: VariantD },
  E: { name: 'Cryo Lens · 冷霜透镜', C: VariantE },
  F: { name: 'Retro CRT · 老式电脑', C: VariantF },
  G: { name: 'Comic · 漫画分镜', C: VariantG },
  H: { name: 'Blueprint · 工程蓝图', C: VariantH },
  I: { name: 'Incident File · 事故档案', C: VariantI },
  J: { name: 'Cockpit · 驾驶舱视角', C: VariantJ },
  K: { name: 'Starry Night · 星夜油画', C: VariantK },
  L: { name: 'Event Horizon · 黑洞边缘', C: VariantL },
  M: { name: 'Meteor Storm · 陨石风暴应急', C: VariantM },
  N: { name: 'Ink Cosmos · 水墨太空', C: VariantN },
  O: { name: 'Woodblock · 浮世绘星海', C: VariantO },
};
const KEYS = Object.keys(VARIANTS);
const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@300;400;500&family=JetBrains+Mono:wght@400;500;700&family=Barlow+Condensed:wght@500;600;700&family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@300;400;500;600&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap';

function readParams() {
  const p = new URLSearchParams(location.search);
  const v = (p.get('variant') || 'A').toUpperCase();
  return { variant: KEYS.includes(v) ? v : 'A', page: p.get('page') === 'console' ? 'console' : 'home' };
}

export default function PrototypeRoot() {
  const [{ variant, page }, setState] = useState(readParams);
  const [tab, setTab] = useState(page === 'home' ? 'Home' : 'Generator');
  const sim = useMockSim();

  useEffect(() => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS });
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  const go = (next) => {
    const merged = { variant, page, ...next };
    const p = new URLSearchParams(location.search);
    p.set('variant', merged.variant);
    p.set('page', merged.page);
    history.replaceState(null, '', `?${p}`);
    setState(merged);
  };
  const onTab = (name) => {
    setTab(name);
    go({ page: name === 'Home' ? 'home' : 'console' });
  };
  const cycle = (dir) => go({ variant: KEYS[(KEYS.indexOf(variant) + dir + KEYS.length) % KEYS.length] });

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') cycle(-1);
      if (e.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const { C, name } = VARIANTS[variant];
  return (
    <>
      <C key={variant} page={page} tab={tab} onTab={onTab} sim={sim} />
      <div className="proto-switch" role="toolbar" aria-label="Prototype variant switcher">
        <button onClick={() => cycle(-1)} aria-label="Previous variant">←</button>
        <span>
          <b>{variant}</b> {name}
        </span>
        <button onClick={() => cycle(1)} aria-label="Next variant">→</button>
        <i />
        <button className={page === 'home' ? 'on' : ''} onClick={() => onTab('Home')}>Home</button>
        <button className={page === 'console' ? 'on' : ''} onClick={() => onTab('Generator')}>Generator</button>
      </div>
    </>
  );
}
