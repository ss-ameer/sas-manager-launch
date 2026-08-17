import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Database,
  Wifi,
  WifiOff,
  Zap,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Clock,
  Play,
  RotateCcw,
  Sliders,
  Sparkles
} from 'lucide-react';
import { UserProfile } from '../types';

interface SystemSimulatorProps {
  user: UserProfile;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SystemSimulator({ user, triggerToast }: SystemSimulatorProps) {
  // Simulation Toggles State (stored in localStorage)
  const [simGeminiError, setSimGeminiError] = useState<boolean>(() => {
    return localStorage.getItem('omni_sim_gemini_out_of_tokens') === 'true';
  });

  const [simFirebaseError, setSimFirebaseError] = useState<boolean>(() => {
    return localStorage.getItem('omni_sim_firebase_quota') === 'true';
  });

  const [simOfflineMode, setSimOfflineMode] = useState<boolean>(() => {
    return localStorage.getItem('omni_sim_offline_mode') === 'true';
  });

  const [simLatencyMs, setSimLatencyMs] = useState<number>(() => {
    return parseInt(localStorage.getItem('omni_sim_latency_ms') || '0', 10);
  });

  const [simTokenCount, setSimTokenCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('omni_sim_ai_token_usage') || '1452000', 10);
  });

  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error' | 'info'; message: string; durationMs: number } | null>(null);

  // Sync state changes to localStorage
  useEffect(() => {
    localStorage.setItem('omni_sim_gemini_out_of_tokens', String(simGeminiError));
  }, [simGeminiError]);

  useEffect(() => {
    localStorage.setItem('omni_sim_firebase_quota', String(simFirebaseError));
  }, [simFirebaseError]);

  useEffect(() => {
    localStorage.setItem('omni_sim_offline_mode', String(simOfflineMode));
  }, [simOfflineMode]);

  useEffect(() => {
    localStorage.setItem('omni_sim_latency_ms', String(simLatencyMs));
  }, [simLatencyMs]);

  useEffect(() => {
    localStorage.setItem('omni_sim_ai_token_usage', String(simTokenCount));
  }, [simTokenCount]);

  const toggleGeminiError = () => {
    const nextVal = !simGeminiError;
    setSimGeminiError(nextVal);
    if (triggerToast) {
      triggerToast(
        nextVal
          ? 'SIMULATION ENABLED: Gemini API token quota exhausted (429).'
          : 'Gemini API simulation reset to normal operation.',
        nextVal ? 'info' : 'success'
      );
    }
  };

  const toggleFirebaseError = () => {
    const nextVal = !simFirebaseError;
    setSimFirebaseError(nextVal);
    if (triggerToast) {
      triggerToast(
        nextVal
          ? 'SIMULATION ENABLED: Firestore quota & network error active.'
          : 'Firestore quota simulation reset to normal operation.',
        nextVal ? 'info' : 'success'
      );
    }
  };

  const toggleOfflineMode = () => {
    const nextVal = !simOfflineMode;
    setSimOfflineMode(nextVal);
    if (triggerToast) {
      triggerToast(
        nextVal
          ? 'SIMULATION ENABLED: System forced into Isolated Offline Mode.'
          : 'Offline mode simulation disabled.',
        nextVal ? 'info' : 'success'
      );
    }
  };

  const handleLatencyChange = (ms: number) => {
    setSimLatencyMs(ms);
    if (triggerToast) {
      triggerToast(`Network latency simulation set to ${ms}ms`, 'info');
    }
  };

  const resetAllSimulations = () => {
    setSimGeminiError(false);
    setSimFirebaseError(false);
    setSimOfflineMode(false);
    setSimLatencyMs(0);
    setSimTokenCount(0);
    localStorage.removeItem('omni_sim_gemini_out_of_tokens');
    localStorage.removeItem('omni_sim_firebase_quota');
    localStorage.removeItem('omni_sim_offline_mode');
    localStorage.removeItem('omni_sim_latency_ms');
    localStorage.setItem('omni_sim_ai_token_usage', '0');
    if (triggerToast) {
      triggerToast('All environment simulations have been reset to default.', 'success');
    }
  };

  // Sandbox simulation runner
  const runSandboxTest = async (testType: 'ai' | 'db') => {
    setIsTestRunning(true);
    setTestResult(null);
    const start = Date.now();

    try {
      if (testType === 'ai') {
        if (simLatencyMs > 0) {
          await new Promise((r) => setTimeout(r, simLatencyMs));
        }

        if (simGeminiError) {
          throw new Error('429: ResourceHasExhausted - Gemini API token limit reached. Please check quota.');
        }

        // Simulate successful extraction
        setSimTokenCount((prev) => prev + 1250);
        const duration = Date.now() - start;
        setTestResult({
          status: 'success',
          message: `AI Pipeline processed successfully in ${duration}ms. Tokens consumed: 1,250.`,
          durationMs: duration
        });
      } else {
        if (simLatencyMs > 0) {
          await new Promise((r) => setTimeout(r, simLatencyMs));
        }

        if (simOfflineMode || simFirebaseError) {
          // Fall back gracefully
          const duration = Date.now() - start;
          setTestResult({
            status: 'info',
            message: `Firestore unavailable (${simOfflineMode ? 'Forced Offline' : 'Quota Error'}). Seamlessly completed write in Local Storage in ${duration}ms.`,
            durationMs: duration
          });
        } else {
          const duration = Date.now() - start;
          setTestResult({
            status: 'success',
            message: `Cloud Database write completed successfully in ${duration}ms.`,
            durationMs: duration
          });
        }
      }
    } catch (err: any) {
      const duration = Date.now() - start;
      setTestResult({
        status: 'error',
        message: err.message || 'Simulation test failed',
        durationMs: duration
      });
    } finally {
      setIsTestRunning(false);
    }
  };

  if (user.role !== 'Admin') {
    return (
      <div className="p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Admin Permission Required</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          The Environment & System Simulator is restricted to Administrator profiles for stress-testing rate limits, quota outages, and offline resilience.
        </p>
      </div>
    );
  }

  const isAnySimActive = simGeminiError || simFirebaseError || simOfflineMode || simLatencyMs > 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 rounded-2xl text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Activity className="w-48 h-48 text-blue-400" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Sliders className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold tracking-tight text-white font-sans">
                Environment & Outage Simulator
              </h2>
              {isAnySimActive && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                  SIMULATION ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 font-sans max-w-xl">
              Stress-test the application’s resilience under network degradation, Gemini API quota limits, and Firestore database outages without affecting live production servers.
            </p>
          </div>

          <button
            onClick={resetAllSimulations}
            className="flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition border border-slate-700 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset All Simulations</span>
          </button>
        </div>
      </div>

      {/* Active Diagnostics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gemini API Status */}
        <div className={`p-4 rounded-xl border transition ${
          simGeminiError ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase text-slate-500 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-purple-600" />
              Gemini AI Status
            </span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              simGeminiError
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}>
              {simGeminiError ? '429 OUT OF TOKENS' : 'OPERATIONAL'}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-800">
            {simGeminiError ? 'Simulated Quota Error' : 'Normal AI Proxy'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {simGeminiError ? 'Extraction will return 429 Quota Exceeded error.' : 'Requests pass to server Gemini models.'}
          </div>
        </div>

        {/* Firestore Database Status */}
        <div className={`p-4 rounded-xl border transition ${
          simFirebaseError ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase text-slate-500 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-600" />
              Firestore Quota
            </span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              simFirebaseError
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}>
              {simFirebaseError ? 'QUOTA EXCEEDED' : 'ONLINE'}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-800">
            {simFirebaseError ? 'Resource Exhausted' : 'Cloud Database Connected'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {simFirebaseError ? 'Triggers high-speed Local Storage fallback.' : 'Realtime Firestore synced.'}
          </div>
        </div>

        {/* Network Connectivity */}
        <div className={`p-4 rounded-xl border transition ${
          simOfflineMode ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase text-slate-500 flex items-center gap-1.5">
              {simOfflineMode ? <WifiOff className="w-4 h-4 text-red-500" /> : <Wifi className="w-4 h-4 text-emerald-600" />}
              Network Link
            </span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              simOfflineMode
                ? 'bg-red-100 text-red-800 border-red-300'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}>
              {simOfflineMode ? 'FORCED OFFLINE' : 'ONLINE'}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-800">
            {simOfflineMode ? 'Isolated Local Workspace' : 'Full Connectivity'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {simOfflineMode ? 'All persistence routed through IndexedDB/localStorage.' : 'Online features enabled.'}
          </div>
        </div>

        {/* Simulated Latency */}
        <div className={`p-4 rounded-xl border transition ${
          simLatencyMs > 0 ? 'bg-blue-50/70 border-blue-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase text-slate-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-600" />
              Network Latency
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {simLatencyMs} ms
            </span>
          </div>
          <div className="text-sm font-bold text-slate-800">
            {simLatencyMs === 0 ? 'Zero Artificial Delay' : `+${simLatencyMs}ms Delay Injected`}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {simLatencyMs > 0 ? 'Tests double-click prevention and loading indicators.' : 'Direct execution speed.'}
          </div>
        </div>
      </div>

      {/* Control Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Simulation Toggles */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 font-sans">
              <Zap className="w-4 h-4 text-blue-600" />
              Environment Fault Injection Controls
            </h3>
            <span className="text-[10px] font-mono text-slate-400">Admin Only</span>
          </div>

          <div className="space-y-4">
            {/* Toggle 1: Gemini Quota Exceeded */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Simulate Gemini Out of Tokens (429)
                  {simGeminiError && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <div className="text-[11px] text-slate-500 font-sans">
                  Forces AI auto-detection & extraction endpoints to return an immediate 429 Quota Exceeded error.
                </div>
              </div>
              <button
                type="button"
                onClick={toggleGeminiError}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  simGeminiError ? 'bg-amber-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  simGeminiError ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Toggle 2: Firebase Quota Exceeded */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Simulate Firebase Firestore Quota Outage
                  {simFirebaseError && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <div className="text-[11px] text-slate-500 font-sans">
                  Forces cloud database writes to throw resource-exhausted errors, triggering Local Storage resilience.
                </div>
              </div>
              <button
                type="button"
                onClick={toggleFirebaseError}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  simFirebaseError ? 'bg-amber-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  simFirebaseError ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Toggle 3: Forced Offline Mode */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Force Isolated Offline Mode
                  {simOfflineMode && <WifiOff className="w-3.5 h-3.5 text-red-500" />}
                </div>
                <div className="text-[11px] text-slate-500 font-sans">
                  Simulates complete network loss. All data mutations persist locally with zero server calls.
                </div>
              </div>
              <button
                type="button"
                onClick={toggleOfflineMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  simOfflineMode ? 'bg-red-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  simOfflineMode ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Latency Presets */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Artificial Network Delay (Latency Injection)</span>
                <span className="font-mono text-blue-600 font-bold text-[11px]">{simLatencyMs} ms</span>
              </div>
              <div className="text-[11px] text-slate-500 font-sans">
                Injects delay before actions complete to test loading spinners & double-click submission locks.
              </div>
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[0, 500, 1500, 3000].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => handleLatencyChange(ms)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-mono font-semibold border transition ${
                      simLatencyMs === ms
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {ms === 0 ? '0ms (Fast)' : `${ms}ms`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Live Diagnostic Sandbox */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 font-sans">
                <Play className="w-4 h-4 text-emerald-600" />
                Live Simulation Diagnostic Sandbox
              </h3>
              <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                Interactive Test
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Run test calls against the active simulation rules above to inspect how error toasts, fallback mechanisms, and loading locks respond in real time.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => runSandboxTest('ai')}
                disabled={isTestRunning}
                className="flex items-center justify-center space-x-2 p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {isTestRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Test AI Extraction</span>
              </button>

              <button
                type="button"
                onClick={() => runSandboxTest('db')}
                disabled={isTestRunning}
                className="flex items-center justify-center space-x-2 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {isTestRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                <span>Test DB Write</span>
              </button>
            </div>

            {/* Sandbox Output Console */}
            {testResult && (
              <div className={`p-4 rounded-xl border text-xs font-mono space-y-1 ${
                testResult.status === 'error'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : testResult.status === 'info'
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    {testResult.status === 'error' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                    {testResult.status === 'error' ? 'SIMULATION INTERCEPT' : 'ACTION COMPLETED'}
                  </span>
                  <span className="text-[10px] opacity-75">{testResult.durationMs}ms</span>
                </div>
                <div className="text-[11px] leading-relaxed pt-1 font-sans">
                  {testResult.message}
                </div>
              </div>
            )}
          </div>

          {/* Token Consumption Tracker */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1.5 font-mono">
                <Gauge className="w-3.5 h-3.5 text-purple-600" />
                Simulated AI Token Consumption Meter
              </span>
              <span className="font-mono text-purple-700 font-bold">
                {simTokenCount.toLocaleString()} / 2,000,000
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  simTokenCount > 1800000 ? 'bg-amber-500' : 'bg-purple-600'
                }`}
                style={{ width: `${Math.min(100, (simTokenCount / 2000000) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-1">
              <span>Starter Tier Limit: 2.0M tokens</span>
              <button
                type="button"
                onClick={() => {
                  setSimTokenCount(0);
                  if (triggerToast) triggerToast('Simulated token consumption reset to 0.', 'info');
                }}
                className="text-blue-600 hover:underline font-semibold"
              >
                Reset Token Count
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
