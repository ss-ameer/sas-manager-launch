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
  customerReferenceCode?: string;
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
  customerReferenceCode,
  isExpanded,
  onToggleExpand,
  hasWarning,
  warningText,
}) => {
  const resolvedClientRef = (clientRef || customerReferenceCode || '').trim();
  const locationDisplay = [projectLocation, country].filter(Boolean).join(', ');

  return (
    <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 transition-all">
      <div className="flex items-start sm:items-center justify-between gap-2.5">
        {/* Left: Compact inline identity & metadata ribbon */}
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
          className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-tight cursor-pointer group"
          title="Click to edit S/N, Quote Ref, dates, salesperson, location, or currency"
        >
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-[11px] font-bold tabular-nums border border-slate-200/90 dark:border-slate-700 group-hover:border-blue-300 dark:group-hover:border-blue-700 transition">
            <Hash className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>{sn || 'Auto'}</span>
          </span>

          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50/90 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-mono text-[11px] font-semibold border border-blue-200/70 dark:border-blue-800/70 max-w-[215px] truncate">
            <span className="truncate">{quoteRefNo || 'Auto Quote Ref'}</span>
          </span>

          <span className="text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">·</span>

          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-mono tabular-nums whitespace-nowrap">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{enquiryDate || 'Today'}</span>
          </span>

          <span className="text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">·</span>

          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-sans font-medium max-w-[130px] truncate">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{salesPersonDisplay || 'Assigned Rep'}</span>
          </span>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">·</span>

          <span className="hidden sm:inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-sans whitespace-nowrap">
            <Tag className="w-2.5 h-2.5 text-slate-400 shrink-0" />
            <span>{enquirySource || 'Email'}</span>
          </span>

          {locationDisplay && (
            <>
              <span className="text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-sans max-w-[140px] truncate">
                <Globe className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                <span className="truncate">{locationDisplay}</span>
              </span>
            </>
          )}

          {resolvedClientRef && (
            <>
              <span className="hidden md:inline text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">·</span>
              <span className="hidden md:inline-flex items-center text-slate-500 dark:text-slate-400 font-mono max-w-[125px] truncate">
                Ref: {resolvedClientRef}
              </span>
            </>
          )}

          <span className="text-slate-300 dark:text-slate-600 select-none" aria-hidden="true">·</span>

          <span className="font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
            {formCurrency}
          </span>

          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-800/60 whitespace-nowrap">
            {status}
          </span>
        </div>

        {/* Right: Anchored compact Customize toggle (never wraps onto orphan row) */}
        <button
          type="button"
          onClick={onToggleExpand}
          title={isExpanded ? 'Collapse reference, date & location settings' : 'Edit S/N, Quote Ref, dates, salesperson, location & currency'}
          className={`shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
            isExpanded || hasWarning
              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
              : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
          }`}
        >
          <Sliders className="w-3 h-3 shrink-0" />
          <span>{isExpanded ? 'Hide Details' : 'Edit Ref & Dates'}</span>
          {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
        </button>
      </div>

      {hasWarning && warningText && !isExpanded && (
        <div
          onClick={onToggleExpand}
          className="mt-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 cursor-pointer"
        >
          <span className="truncate font-medium">{warningText}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider underline shrink-0">Resolve</span>
        </div>
      )}
    </div>
  );
};
