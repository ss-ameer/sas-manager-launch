import React from 'react';
import { Z_NESTED_MODAL } from '../constants/zIndex';

const CHUNK_RELOAD_STORAGE_KEY = 'omni_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

/**
 * Wraps React.lazy with a single-shot reload guard for stale chunk hashes
 * after a new deployment. If a dynamic import fails and the page has not
 * already reloaded within the last 15 seconds, it triggers a hard reload once;
 * otherwise it rethrows the error so ErrorBoundary/caller can handle it.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
        try {
          const now = Date.now();
          const lastReloadRaw = sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY);
          const lastReloadAt = lastReloadRaw ? Number(lastReloadRaw) : 0;

          if (!lastReloadAt || Number.isNaN(lastReloadAt) || now - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS) {
            sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
            window.location.reload();
            // Keep Suspense pending while browser navigates/reloads
            return await new Promise<{ default: T }>(() => {});
          }
        } catch {
          // Ignore sessionStorage restrictions (e.g. private browsing) and rethrow original error
        }
      }
      throw error;
    }
  });
}

export const TabLoadingFallback: React.FC<{ label?: string }> = ({ label = 'Loading module...' }) => (
  <div className="flex flex-col items-center justify-center min-h-[320px] w-full p-8 text-center">
    <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
      <div
        className="w-7 h-7 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin"
        aria-hidden="true"
      />
      <span className="text-xs font-medium text-slate-600 tracking-wide">{label}</span>
    </div>
  </div>
);

export const ModalLoadingFallback: React.FC = () => (
  <div
    className={`fixed inset-0 ${Z_NESTED_MODAL} bg-slate-950/35 backdrop-blur-xs flex items-center justify-center p-4`}
    role="status"
    aria-label="Loading modal"
  >
    <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-white border border-slate-200 shadow-lg">
      <div
        className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin shrink-0"
        aria-hidden="true"
      />
      <span className="text-xs font-semibold text-slate-700">Loading...</span>
    </div>
  </div>
);
