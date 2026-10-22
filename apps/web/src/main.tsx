import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const preloadReloadKey = 'studio-vite-preload-error';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const entryScript = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  const reloadKey = `${preloadReloadKey}:${entryScript?.src ?? window.location.pathname}`;

  try {
    if (window.sessionStorage.getItem(reloadKey) === '1') return;
    window.sessionStorage.setItem(reloadKey, '1');
  } catch {
    // Do not risk a reload loop when the browser blocks session storage.
    return;
  }

  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
