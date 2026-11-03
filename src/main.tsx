import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const CHUNK_RELOAD_GUARD_KEY = 'sas_stale_chunk_reload_ts';
const CHUNK_RELOAD_COOLDOWN_MS = 15000;

function triggerSafeAssetReload() {
  try {
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || 0);
    if (now - lastReload > CHUNK_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
}

// 1. Standard Vite preload error handler for stale JS/CSS chunks after a new deployment
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  triggerSafeAssetReload();
});

// 2. Capture-phase listener for <link rel="stylesheet"> or <script> 404s from hashed assets
window.addEventListener(
  'error',
  (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.tagName === 'LINK') {
      const href = (target as HTMLLinkElement).href || '';
      if (href.includes('/assets/') || /index-[a-zA-Z0-9_-]+\.css/.test(href)) {
        triggerSafeAssetReload();
      }
    } else if (target.tagName === 'SCRIPT') {
      const src = (target as HTMLScriptElement).src || '';
      if (src.includes('/assets/') || /index-[a-zA-Z0-9_-]+\.js/.test(src)) {
        triggerSafeAssetReload();
      }
    }
  },
  true
);

// 3. Unhandled dynamic import chunk errors
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '').toLowerCase();
  if (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('chunkloaderror')
  ) {
    event.preventDefault();
    triggerSafeAssetReload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

