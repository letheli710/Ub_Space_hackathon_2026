// Floating pill to flip between the classic frontend and the themed skins (← → keys work too).
import { useEffect, useState } from 'react';
import { ORDER, SKIN_NAMES } from './skinNames.js';
import './skinSwitcher.css';

export default function SkinSwitcher({ current, onChange }) {
  const [open, setOpen] = useState(false);
  const index = ORDER.indexOf(current);
  const cycle = (dir) => onChange(ORDER[(index + dir + ORDER.length) % ORDER.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return; // Alt+← / Alt+→ so arrow keys stay free for the 3D view (WASD/arrows)
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); cycle(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={`skin-switch ${open ? 'open' : ''}`} role="toolbar" aria-label="Frontend theme">
      {open && (
        <div className="skin-switch-menu">
          {ORDER.map((key) => (
            <button key={key} className={key === current ? 'on' : ''} onClick={() => { setOpen(false); onChange(key); }}>
              <b>{key === 'classic' ? '·' : key}</b> {SKIN_NAMES[key]}
            </button>
          ))}
        </div>
      )}
      <button onClick={() => cycle(-1)} aria-label="Previous theme" title="Previous theme (Alt+←)">←</button>
      <button className="skin-switch-label" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>{current === 'classic' ? '·' : current}</b> {SKIN_NAMES[current]}
      </button>
      <button onClick={() => cycle(1)} aria-label="Next theme" title="Next theme (Alt+→)">→</button>
    </div>
  );
}
