import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root'));
const params = new URLSearchParams(location.search);

// Themed frontends (?skin=A … O) all run on the real DEMO session; plain URL is the classic app.
if (params.has('skin') || params.has('variant')) {
  import('./skins/SkinRoot.jsx').then(({ default: SkinRoot }) => root.render(<SkinRoot />));
} else {
  Promise.all([import('./App.jsx'), import('./skins/SkinSwitcher.jsx'), import('./style.css')]).then(
    ([{ default: App }, { default: SkinSwitcher }]) =>
      root.render(
        <>
          <App />
          <SkinSwitcher current="classic" onChange={(key) => { if (key !== 'classic') location.search = `?skin=${key}`; }} />
        </>,
      ),
  );
}
