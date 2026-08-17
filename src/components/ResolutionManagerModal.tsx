import React from 'react';
import { AlertTriangle, GitMerge, UserPlus, RefreshCw, X, Building, UserCheck, ArrowRight, ShieldAlert, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface RecordFieldComparison {
  label: string;
  existingValue?: string;
  newValue?: string;
}

export interface ResolutionManagerModalProps {
  isOpen: boolean;
  type: 'company' | 'contact';
  similarityScore: number; // 0.0 to 1.0
  matchReason: string;
  candidateName: string;
  existingRecordName: string;
  existingDetails?: {
    email?: string;
    phone?: string;
    country?: string;
    city?: string;
    address?: string;
    companyName?: string;
    website?: string;
  };
  newDetails?: {
    email?: string;
    phone?: string;
    country?: string;
    city?: string;
    address?: string;
    companyName?: string;
    website?: string;
  };
  onMerge: () => void;      // Link to existing record
  onKeepNew?: () => void;   // Overwrite existing record with new details
  onIgnore: () => void;     // Ignore warning & create brand new separate entry
  onCancel: () => void;     // Dismiss modal
}

export default function ResolutionManagerModal({
  isOpen,
  type,
  similarityScore,
  matchReason,
  candidateName,
  existingRecordName,
  existingDetails,
  newDetails,
  onMerge,
  onKeepNew,
  onIgnore,
  onCancel,
}: ResolutionManagerModalProps) {
  if (!isOpen) return null;

  const percentMatch = Math.round(similarityScore * 100);

  // Build field comparison list
  const comparisons: RecordFieldComparison[] = [
    {
      label: type === 'company' ? 'Company Name' : 'Contact Name',
      existingValue: existingRecordName,
      newValue: candidateName,
    },
    {
      label: 'Email Address',
      existingValue: existingDetails?.email || '—',
      newValue: newDetails?.email || '—',
    },
    {
      label: 'Phone Number',
      existingValue: existingDetails?.phone || '—',
      newValue: newDetails?.phone || '—',
    },
    {
      label: 'Location',
      existingValue: [existingDetails?.city, existingDetails?.country].filter(Boolean).join(', ') || '—',
      newValue: [newDetails?.city, newDetails?.country].filter(Boolean).join(', ') || '—',
    },
  ];

  if (type === 'contact' && (existingDetails?.companyName || newDetails?.companyName)) {
    comparisons.push({
      label: 'Associated Company',
      existingValue: existingDetails?.companyName || '—',
      newValue: newDetails?.companyName || '—',
    });
  }

  if (existingDetails?.website || newDetails?.website) {
    comparisons.push({
      label: 'Website',
      existingValue: existingDetails?.website || '—',
      newValue: newDetails?.website || '—',
    });
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white p-5 flex items-start justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white font-sans">
                    Resolution Manager
                  </h3>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Levenshtein Duplicate Protection
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Potential duplicate detected for <strong>{candidateName}</strong>. Compare side-by-side and choose a resolution strategy.
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg transition hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Match Metric Bar */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-amber-900 font-medium font-sans">
                  {matchReason}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-200 text-amber-900 border border-amber-300 shrink-0">
                {percentMatch}% Match Confidence
              </span>
            </div>

            {/* Side-by-Side Comparison Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-200 p-3 text-xs font-mono font-bold">
                <div className="flex items-center space-x-2 text-slate-700">
                  {type === 'company' ? <Building className="w-3.5 h-3.5 text-blue-600" /> : <UserCheck className="w-3.5 h-3.5 text-blue-600" />}
                  <span>Existing Catalog Record</span>
                </div>
                <div className="flex items-center space-x-2 text-slate-700 pl-3 border-l border-slate-200">
                  <UserPlus className="w-3.5 h-3.5 text-amber-600" />
                  <span>New Submission Input</span>
                </div>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {comparisons.map((row, idx) => {
                  const isMatch = row.existingValue?.toLowerCase() === row.newValue?.toLowerCase() && row.existingValue !== '—';
                  return (
                    <div key={idx} className="p-3 bg-white space-y-1">
                      <div className="text-[10px] font-mono uppercase text-slate-400 font-semibold flex items-center justify-between">
                        <span>{row.label}</span>
                        {isMatch && (
                          <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Identical
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-0.5">
                        <div className={`font-medium break-all ${isMatch ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
                          {row.existingValue}
                        </div>
                        <div className={`font-medium break-all pl-3 border-l border-slate-100 ${isMatch ? 'text-slate-900 font-bold' : 'text-amber-800 font-semibold'}`}>
                          {row.newValue}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              Select an explicit action below to resolve this duplicate match cleanly:
            </p>
          </div>

          {/* Action Resolution Controls */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
            <button
              onClick={onCancel}
              className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <button
                onClick={onIgnore}
                className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer"
                title="Force creation of a distinct new entry alongside the existing record"
              >
                <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                <span>Ignore & Add New</span>
              </button>

              {onKeepNew && (
                <button
                  onClick={onKeepNew}
                  className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer"
                  title="Overwrite existing record details with new submission values"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                  <span>Keep New (Update Existing)</span>
                </button>
              )}

              <button
                onClick={onMerge}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                title="Link enquiry or entity to the existing catalog record"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>Merge with Existing</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
