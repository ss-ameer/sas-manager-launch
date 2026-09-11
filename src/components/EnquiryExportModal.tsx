import React, { useState, useMemo } from 'react';
import { Enquiry, Company, Contact, Salesperson } from '../types';
import { exportEnquiriesToCSV, EnquiryExportResult } from '../services/exportService';
import { BRAND_CONFIG } from '../config';
import {
  Download,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Filter,
  Layers,
  ShieldCheck,
  Calendar,
  DollarSign,
  FileText,
  AlertCircle
} from 'lucide-react';

interface EnquiryExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredEnquiries: Enquiry[];
  allEnquiries: Enquiry[];
  companies: Company[];
  contacts?: Contact[];
  salespersons?: Salesperson[];
  activeFilterLabels?: string[];
  searchQuery?: string;
  onSuccess?: (result: EnquiryExportResult) => void;
}

export default function EnquiryExportModal({
  isOpen,
  onClose,
  filteredEnquiries,
  allEnquiries,
  companies,
  contacts = [],
  salespersons = [],
  activeFilterLabels = [],
  searchQuery,
  onSuccess
}: EnquiryExportModalProps) {
  // Determine if active filters are applied
  const isFiltered = useMemo(() => {
    return (
      (Boolean(searchQuery) && searchQuery.trim().length > 0) ||
      activeFilterLabels.length > 0 ||
      filteredEnquiries.length !== allEnquiries.length
    );
  }, [searchQuery, activeFilterLabels, filteredEnquiries.length, allEnquiries.length]);

  const [scope, setScope] = useState<'filtered' | 'all'>(isFiltered ? 'filtered' : 'all');
  const [mode, setMode] = useState<'flattened' | 'summary'>('flattened');
  const [isExporting, setIsExporting] = useState(false);

  // Sync default scope when opening or when filters change
  React.useEffect(() => {
    if (isOpen) {
      setScope(isFiltered ? 'filtered' : 'all');
      setIsExporting(false);
    }
  }, [isOpen, isFiltered]);

  // Handle escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const activeEnquiriesToExport = scope === 'filtered' ? filteredEnquiries : allEnquiries;

  const totalValueAED = useMemo(() => {
    return activeEnquiriesToExport.reduce((sum, e) => sum + (Number(e.value_aed) || 0), 0);
  }, [activeEnquiriesToExport]);

  const totalLineItems = useMemo(() => {
    return activeEnquiriesToExport.reduce((sum, e) => sum + (e.line_items?.length || 1), 0);
  }, [activeEnquiriesToExport]);

  const previewFilename = useMemo(() => {
    const brand = BRAND_CONFIG.shortName.replace(/[^a-zA-Z0-9]/g, '');
    const scopeSuffix = scope === 'filtered' ? 'Filtered' : 'All';
    const modeSuffix = mode === 'flattened' ? 'LineItems' : 'Summary';
    const today = new Date().toISOString().split('T')[0];
    return `${brand}_Enquiries_${scopeSuffix}_${modeSuffix}_${today}.csv`;
  }, [scope, mode]);

  if (!isOpen) return null;

  const handleExecuteExport = () => {
    if (activeEnquiriesToExport.length === 0) return;
    setIsExporting(true);

    try {
      const result = exportEnquiriesToCSV({
        enquiries: activeEnquiriesToExport,
        totalAvailableCount: allEnquiries.length,
        companies,
        contacts,
        salespersons,
        scope,
        mode,
        filterLabels: activeFilterLabels,
        searchQuery,
        customFilename: previewFilename
      });

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err: any) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/60">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 id="export-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Export Enquiries & Proposals
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generate clean, sanitized CSV spreadsheets for Excel, Sheets, or ERP.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            title="Close modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Export Scope Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-mono">
              1. Select Export Scope
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Filtered */}
              <div
                onClick={() => setScope('filtered')}
                className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  scope === 'filtered'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm text-slate-800 dark:text-slate-100">
                    <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Filtered Results</span>
                  </div>
                  <input
                    type="radio"
                    name="exportScope"
                    checked={scope === 'filtered'}
                    onChange={() => setScope('filtered')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {filteredEnquiries.length}
                  </span>{' '}
                  enquiries matching current criteria.
                </div>
                {isFiltered && activeFilterLabels.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activeFilterLabels.slice(0, 3).map((lbl, idx) => (
                      <span key={idx} className="text-[10px] bg-blue-100/80 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded font-mono">
                        {lbl}
                      </span>
                    ))}
                    {activeFilterLabels.length > 3 && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        +{activeFilterLabels.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Option 2: All Records */}
              <div
                onClick={() => setScope('all')}
                className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  scope === 'all'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm text-slate-800 dark:text-slate-100">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>All Records</span>
                  </div>
                  <input
                    type="radio"
                    name="exportScope"
                    checked={scope === 'all'}
                    onChange={() => setScope('all')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {allEnquiries.length}
                  </span>{' '}
                  total active enquiry records in workspace.
                </div>
                <div className="mt-2 text-[10px] text-slate-400 font-mono">
                  Full catalogue historical dump
                </div>
              </div>
            </div>
          </div>

          {/* Export Mode / Layout Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-mono">
              2. Spreadsheet Structure
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Flattened with line items */}
              <div
                onClick={() => setMode('flattened')}
                className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  mode === 'flattened'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    Flattened Line Items
                  </div>
                  <input
                    type="radio"
                    name="exportMode"
                    checked={mode === 'flattened'}
                    onChange={() => setMode('flattened')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Detailed breakdown with one row per product line item (Qty, Unit Price, Description, Lead Times).
                </p>
                <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                  <CheckCircle2 className="w-3 h-3" /> Recommended for ERP & Quotation Audit
                </div>
              </div>

              {/* Compact Summary Register */}
              <div
                onClick={() => setMode('summary')}
                className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  mode === 'summary'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    Enquiry Summary Register
                  </div>
                  <input
                    type="radio"
                    name="exportMode"
                    checked={mode === 'summary'}
                    onChange={() => setMode('summary')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  One row per enquiry proposal with contact info, status, salesperson, and total quoted package value.
                </p>
                <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                  Ideal for Executive Summaries & Pipelines
                </div>
              </div>
            </div>
          </div>

          {/* Export Specifications & Metrics Summary */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span className="font-mono text-slate-400 uppercase text-[10px]">Total Selected Enquiries:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{activeEnquiriesToExport.length}</span>
            </div>
            {mode === 'flattened' && (
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span className="font-mono text-slate-400 uppercase text-[10px]">Estimated Output Rows:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{totalLineItems} item rows</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span className="font-mono text-slate-400 uppercase text-[10px]">Combined Quoted Value:</span>
              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                AED {totalValueAED.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-mono">Filename:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[280px]" title={previewFilename}>
                {previewFilename}
              </span>
            </div>
          </div>

          {/* Security & Sanitization Badge */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              RFC 4180 compliant escaping with UTF-8 BOM encoding for direct opening in Excel, Sheets, and Numbers without encoding glitches.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white rounded-xl hover:bg-slate-150 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecuteExport}
            disabled={isExporting || activeEnquiriesToExport.length === 0}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Generating CSV...' : `Export ${activeEnquiriesToExport.length} Enquiries`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
