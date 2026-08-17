import React, { useState, useEffect } from 'react';
import { KeyRound, ExternalLink, Check, Trash2, Eye, EyeOff, ShieldCheck, Info, X } from 'lucide-react';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: (savedKey: string) => void;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function GeminiKeyModal({
  isOpen,
  onClose,
  onKeySaved,
  triggerToast
}: GeminiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const existingKey = localStorage.getItem('omni_user_gemini_api_key') || '';
      setApiKey(existingKey);
      setIsSaved(!!existingKey.trim());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      localStorage.removeItem('omni_user_gemini_api_key');
      setIsSaved(false);
      if (triggerToast) triggerToast('Personal Gemini API key removed.', 'info');
      if (onKeySaved) onKeySaved('');
      onClose();
      return;
    }

    localStorage.setItem('omni_user_gemini_api_key', trimmed);
    setIsSaved(true);
    if (triggerToast) triggerToast('Personal Gemini API key saved successfully!', 'success');
    if (onKeySaved) onKeySaved(trimmed);
    onClose();
  };

  const handleClear = () => {
    localStorage.removeItem('omni_user_gemini_api_key');
    setApiKey('');
    setIsSaved(false);
    if (triggerToast) triggerToast('Personal Gemini API key cleared.', 'info');
    if (onKeySaved) onKeySaved('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden font-sans">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-400/30 rounded-xl text-blue-300">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Personal Gemini API Key</h3>
              <p className="text-xs text-blue-200/80">Configure your personal Google AI Studio key for document autofill</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="bg-blue-50/80 border border-blue-150 rounded-xl p-3.5 space-y-2">
            <div className="flex items-start space-x-2 text-xs text-blue-900 font-medium leading-relaxed">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                By providing your own API key, all document extractions and AI autofill features run directly using your Google AI Studio quota.
              </span>
            </div>
            <div className="pl-6 text-[11px] text-blue-700/90 font-mono">
              • Saved locally in your browser (never stored on external servers)
            </div>
          </div>

          {/* Key acquisition link */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 block">Need a Gemini API Key?</span>
              <span className="text-[11px] text-slate-500 block">Get a free API key from Google AI Studio in seconds.</span>
            </div>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition shrink-0"
            >
              <span>Get API Key</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Key Input Field */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 font-sans uppercase tracking-wider block">
              Your Gemini API Key (AIzaSy...)
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your Gemini API key here..."
                className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl text-xs font-mono text-slate-800 transition outline-none"
              />
              <div className="absolute right-2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {apiKey && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    title="Clear key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-slate-500 font-medium">Current API Key Status:</span>
            {isSaved ? (
              <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-semibold text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Personal Key Configured</span>
              </span>
            ) : (
              <span className="text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 font-medium text-[11px]">
                No Personal Key (Using Default Environment)
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center space-x-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition"
          >
            <Check className="w-4 h-4" />
            <span>Save Key & Continue</span>
          </button>
        </div>
      </div>
    </div>
  );
}
