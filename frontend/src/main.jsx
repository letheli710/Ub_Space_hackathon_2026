import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const root = createRoot(document.getElementById('root'));

// PROTOTYPE — dev-only visual-direction variants: open /?variant=A (A–D). Remove with src/prototype/.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('variant')) {
  import('./prototype/PrototypeRoot.jsx').then(({ default: PrototypeRoot }) => root.render(<PrototypeRoot />));
} else {
  import('./style.css').then(() => root.render(<App />));
}
