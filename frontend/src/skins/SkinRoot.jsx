// Themed frontends. Every skin runs on the same real DEMO session, so switching skins keeps the
// voyage, damage and log. Open /?skin=A … /?skin=O; the classic frontend is plain /.
import { useEffect, useState } from 'react';
import useDemoSession from '../simulation/useDemoSession.js';
import { useSkinSim } from './demoSkin.jsx';
import SkinSwitcher from './SkinSwitcher.jsx';
import { SKINS } from './registry.js';
import { skinFromUrl } from './skinNames.js';
import './skinBase.css';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&family=IBM+Plex+Mono:wght@300;400;500&family=JetBrains+Mono:wght@400;500;700&family=Barlow+Condensed:wght@500;600;700&family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@300;400;500;600&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap';

function readTab() {
  const t = new URLSearchParams(location.search).get('tab');
  return t ?? 'Home';
}

export default function SkinRoot() {
  const [skin, setSkin] = useState(skinFromUrl);
  const [tab, setTab] = useState(readTab);
  const session = useDemoSession({ tab, viewMode: 'demo' });
  const sim = useSkinSim(session);

  useEffect(() => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS });
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  const writeUrl = (next) => {
    const p = new URLSearchParams(location.search);
    p.set('skin', next.skin ?? skin);
    p.set('tab', next.tab ?? tab);
    p.delete('variant');
    p.delete('page');
    history.replaceState(null, '', `?${p}`);
  };
  const onTab = (name) => {
    setTab(name);
    writeUrl({ tab: name });
  };
  const onSkin = (key) => {
    if (key === 'classic') {
      location.href = location.pathname;
      return;
    }
    setSkin(key);
    writeUrl({ skin: key });
  };

  const C = SKINS[skin];
  const page = tab === 'Home' ? 'home' : 'console';
  return (
    <>
      <C key={skin} page={page} tab={tab} onTab={onTab} sim={sim} />
      <SkinSwitcher current={skin} onChange={onSkin} />
    </>
  );
}
