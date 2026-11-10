import React from 'react';
import { Calendar, ChevronDown, ChevronUp, Hash, Sliders, User, Globe, Tag } from 'lucide-react';
import { EnquiryStatus } from '../../types';

export interface EnquiryMetadataSummaryBarProps {
  sn: number;
  quoteRefNo: string;
  enquiryDate: string;
  salesPersonDisplay: string;
  enquirySource: string;
  formCurrency: 'AED' | 'USD';
  status: EnquiryStatus;
  country?: string;
  projectLocation?: string;
  clientRef?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  hasWarning?: boolean;
  warningText?: string;
  onAutoDetectClipboard?: () => void;
  onOpenAiAutofill?: () => void;
}

export const EnquiryMetadataSummaryBar: React.FC<EnquiryMetadataSummaryBarProps> = ({
  sn,
  quoteRefNo,
  enquiryDate,
  salesPersonDisplay,
  enquirySource,
  formCurrency,
  status,
  country,
  projectLocation,
  clientRef,
  isExpanded,
  onToggleExpand,
  hasWarning,
  warningText,
}) => {
  return (
    <div className="bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Quiet interactive metadata pills */}
        <div
          onClick={onToggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpand();
            }
          }}
          className="flex flex-wrap items-center gap-1.5 min-w-0 cursor-pointer group"
          title="Click to customize sequence S/N, Quote Ref, dates, salesperson, location, or currency"
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-xs font-bold border border-slate-200/80 dark:border-slate-700 group-hover:border-blue-300 dark:group-hover:border-blue-700 transition">
            <Hash className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>{sn || 'Auto'}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-mono text-xs font-semibold border border-blue-200/70 dark:border-blue-800/70 max-w-[240px] truncate">
            <span className="truncate">{quoteRefNo || 'Auto Quote Ref'}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-mono text-[11px] border border-slate-200/70 dark:border-slate-700/70">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{enquiryDate || 'Today'}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-sans text-[11px] font-medium border border-slate-200/70 dark:border-slate-700/70 max-w-[140px] truncate">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{salesPersonDisplay || 'Assigned Rep'}</span>
          </span>

          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-sans text-[11px] border border-slate-200/70 dark:border-slate-700/70">
            <Tag className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{enquirySource || 'Email'}</span>
          </span>

          {(country || projectLocation) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-sans text-[11px] border border-slate-200/70 dark:border-slate-700/70 max-w-[150px] truncate">
              <Globe className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">
                {[projectLocation, country].filter(Boolean).join(', ')}
              </span>
            </span>
          )}

          {clientRef && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-mono text-[11px] border border-slate-200/70 dark:border-slate-700/70 max-w-[130px] truncate">
              Ref: {clientRef}
            </span>
          )}

          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold border border-slate-200 dark:border-slate-700">
            {formCurrency}
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60">
            {status}
          </span>
        </div>

        {/* Right: Single clean Customize toggle */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={onToggleExpand}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer ${
              isExpanded || hasWarning
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
            }`}
          >
            <Sliders className="w-3 h-3 shrink-0" />
            <span>{isExpanded ? 'Hide Details' : 'Edit Ref, Dates & Location'}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
          </button>
        </div>
      </div>

      {hasWarning && warningText && !isExpanded && (
        <div
          onClick={onToggleExpand}
          className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 cursor-pointer"
        >
          <span className="truncate font-medium">{warningText}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider underline shrink-0">Resolve</span>
        </div>
      )}
    </div>
  );
};
