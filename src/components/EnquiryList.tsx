import React, { useState } from 'react';
import { Enquiry, Company, Salesperson, Contact, getInitials, Workspace, EnquiryStatusHistoryEntry, Project, ENQUIRY_STATUS_OPTIONS, normalizeEnquiryStatus, EnquiryStatus, resolveSalespersonIdentifier, resolveSalespersonName, normalizeEnquirySource, Quotation, PIPELINE_STATUS_GROUPS } from '../types';
import { BRAND_CONFIG } from '../config';
import EnquiryExportModal from './EnquiryExportModal';
import {
  FileText,
  FileSpreadsheet,
  AlertTriangle,
  Search,
  Plus,
  Download,
  Upload,
  Filter,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  X,
  Check,
  Trash,
  Pencil,
  ChevronDown,
  Clock,
  RotateCcw,
  CheckSquare,
  Hash,
  TrendingUp,
  CheckCircle2,
  Activity
} from 'lucide-react';
import { db, safeSetDoc, safeDeleteDoc, safeUpdateDoc } from '../firebase';
import { EnquiryRepository } from '../services/repositories/EnquiryRepository';
import { QuotationRepository } from '../services/repositories/QuotationRepository';
import { reserveEnquiryStock, releaseEnquiryStock, isLostOrCancelledStatus } from '../services/inventoryService';
import { collection, writeBatch, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { PageHeader, PageBody, KpiStatCard } from './layout/UiContainer';
import {
  canAccessEnquiry,
  canCreateEnquiry,
  canEditEnquiry,
  canDeleteEnquiry,
  canExportData,
  canManageWorkspace,
  isAdmin,
  getEffectiveWorkspaceRole,
  isCreatorOnlyViewer
} from '../utils/permissions';
import GoogleSearchButton from './common/GoogleSearchButton';
import { InitiateActivityOptions, useActivityLauncher } from '../context/ActivityLauncherContext';
import Company360Modal from './Company360Modal';
import { QuickClaimModal } from './QuickClaimModal';

// ==========================================
// PURE UTILITY HELPERS (Module Level)
// ==========================================

export const getEnquiryCurrencyParts = (e: Enquiry) => {
  const isUSD = e?.currency === 'USD';
  const numVal = typeof e?.value_aed === 'number' ? e.value_aed : parseFloat(String(e?.value_aed || 0)) || 0;
  const val = isUSD ? numVal / 3.6725 : numVal;
  const prefix = isUSD ? '$' : 'AED';
  const formattedAmount = Math.round(val).toLocaleString('en-US');
  return { prefix, formattedAmount };
};

export const formatEnquiryCurrency = (e: Enquiry) => {
  const { prefix, formattedAmount } = getEnquiryCurrencyParts(e);
  return `${prefix} ${formattedAmount}`;
};

export const formatEnquiryDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

export const formatRelativeTime = (isoString?: string): string => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(date.getTime()) || diffMs < 0) return 'just now';
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

export const formatEnquiryRelativeAge = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    let d: Date;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((todayStart.getTime() - targetStart.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1d ago';
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return '';
  }
};

export const getStatusBadgeClass = (status: string) => {
  const s = (status || '').trim().toLowerCase();
  if (s.includes('gap') || s.includes('reserved')) {
    return 'border-dashed border-amber-400/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-semibold';
  }
  if (s.includes('draft')) {
    return 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700';
  }
  if (s.includes('sent')) {
    return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 font-semibold';
  }
  if (s.includes('revision')) {
    return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 font-semibold';
  }
  if (s.includes('won') || s.includes('order received') || s.includes('approved')) {
    return 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60 font-semibold';
  }
  if (s.includes('lost') || s.includes('cancelled')) {
    return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60';
  }
  switch (s) {
    case 'active':
      return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-semibold';
    case 'pending':
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60';
    case 'dead':
      return 'bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60';
    case 'hold':
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60';
    case 'delayed':
      return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60';
    default:
      return 'bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60';
  }
};

// ==========================================
// GAP DETECTOR ROW COMPONENT (Memoized)
// ==========================================

export interface GapDetectorRowProps {
  prevSn: number | null;
  curSn: number | null;
  sortAsc: boolean;
  isMarkingMode: boolean;
  isEditable: boolean;
  isReservingGap: number | null;
  occupiedWorkspaceSns?: Set<number>;
  onFillGap: (sn: number) => void;
}

export const GapDetectorRow = React.memo(function GapDetectorRow({
  prevSn,
  curSn,
  sortAsc,
  isMarkingMode,
  isEditable,
  isReservingGap,
  occupiedWorkspaceSns,
  onFillGap
}: GapDetectorRowProps) {
  if (prevSn === null || curSn === null) return null;

  let gapMin: number | null = null;
  let gapMax: number | null = null;

  if (!sortAsc && prevSn - curSn > 1) {
    gapMin = curSn + 1;
    gapMax = prevSn - 1;
  } else if (sortAsc && curSn - prevSn > 1) {
    gapMin = prevSn + 1;
    gapMax = curSn - 1;
  }

  if (gapMin === null || gapMax === null || gapMin > gapMax) return null;

  // Filter out sequence numbers that are already occupied anywhere in the workspace (e.g. owned by other reps)
  const missingSns: number[] = [];
  // Cap scan at 500 to avoid pathological loops on legacy imported SN jumps
  const scanLimit = Math.min(gapMax, gapMin + 500);
  for (let sn = gapMin; sn <= scanLimit; sn++) {
    if (!occupiedWorkspaceSns || !occupiedWorkspaceSns.has(sn)) {
      missingSns.push(sn);
    }
  }

  if (missingSns.length === 0) return null;

  const firstMissing = missingSns[0];
  const lastMissing = missingSns[missingSns.length - 1];
  const isContiguous = lastMissing - firstMissing + 1 === missingSns.length;
  const gapLabel =
    missingSns.length === 1
      ? `#${firstMissing}`
      : isContiguous
      ? `#${firstMissing} – #${lastMissing}`
      : `#${firstMissing} – #${lastMissing} (${missingSns.length} open)`;
  const fillSn = sortAsc ? firstMissing : lastMissing;

  return (
    <tr key={`gap-${prevSn}-${curSn}`} className="bg-amber-500/5 border-y border-dashed border-amber-500/20">
      <td colSpan={isMarkingMode ? 9 : 8} className="py-1.5 px-3">
        <div className="flex items-center justify-between gap-2 text-xs text-amber-600/90 dark:text-amber-400 font-mono">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 inline-block animate-pulse" />
            <span className="font-semibold truncate">Missing Sequence: {gapLabel}</span>
          </div>
          {isEditable && (
            <button
              type="button"
              disabled={isReservingGap === fillSn}
              onClick={() => onFillGap(fillSn)}
              className={`shrink-0 px-2.5 py-0.5 text-[11px] font-semibold rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition-colors inline-flex items-center gap-1 font-sans whitespace-nowrap ${
                isReservingGap === fillSn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
              title={`Reserve unoccupied sequence gap #${fillSn}`}
            >
              <Plus className="w-3 h-3 shrink-0" />
              <span>{isReservingGap === fillSn ? 'Reserving...' : `Fill Gap #${fillSn}`}</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

// ==========================================
// ENQUIRY TABLE ROW COMPONENT (Memoized)
// ==========================================

export interface EnquiryTableRowProps {
  enquiry: Enquiry;
  isChecked: boolean;
  isMarkingMode: boolean;
  isEditable: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewConfidentialMargins?: boolean;
  isCreatorOnly?: boolean;
  companyName: string;
  resolvedCompany?: Company;
  salesperson?: Salesperson;
  companies: Company[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  onToggleSelect: (id: string, checked: boolean) => void;
  onSelectEnquiry: (id: string) => void;
  onEditEnquiry: (enquiry: Enquiry) => void;
  onDeleteEnquiry: (enquiry: Enquiry) => void;
  onStatusChange: (enquiry: Enquiry, newStatus: string) => void;
  onCompanyClick: (enquiry: Enquiry) => void;
  activeQuotation?: Quotation | null;
}

export function areRowPropsEqual(
  prevProps: EnquiryTableRowProps,
  nextProps: EnquiryTableRowProps
): boolean {
  if (prevProps.isChecked !== nextProps.isChecked) return false;
  if (prevProps.isMarkingMode !== nextProps.isMarkingMode) return false;
  if (prevProps.isEditable !== nextProps.isEditable) return false;
  if (prevProps.canEdit !== nextProps.canEdit) return false;
  if (prevProps.canDelete !== nextProps.canDelete) return false;
  if (prevProps.canViewConfidentialMargins !== nextProps.canViewConfidentialMargins) return false;
  if (prevProps.isCreatorOnly !== nextProps.isCreatorOnly) return false;
  if (prevProps.companyName !== nextProps.companyName) return false;

  // Active quotation status and value changes check
  if (prevProps.activeQuotation !== nextProps.activeQuotation) {
    if (
      prevProps.activeQuotation?.id !== nextProps.activeQuotation?.id ||
      prevProps.activeQuotation?.status !== nextProps.activeQuotation?.status ||
      prevProps.activeQuotation?.grand_total !== nextProps.activeQuotation?.grand_total ||
      prevProps.activeQuotation?.formatted_quote_ref !== nextProps.activeQuotation?.formatted_quote_ref ||
      prevProps.activeQuotation?.revision_number !== nextProps.activeQuotation?.revision_number ||
      prevProps.activeQuotation?.currency !== nextProps.activeQuotation?.currency ||
      prevProps.activeQuotation?.updatedAt !== nextProps.activeQuotation?.updatedAt
    ) {
      return false;
    }
  }

  if (prevProps.resolvedCompany !== nextProps.resolvedCompany) {
    if (
      prevProps.resolvedCompany?.id !== nextProps.resolvedCompany?.id ||
      prevProps.resolvedCompany?.temperature !== nextProps.resolvedCompany?.temperature ||
      prevProps.resolvedCompany?.is_dnc !== nextProps.resolvedCompany?.is_dnc ||
      prevProps.resolvedCompany?.display_name !== nextProps.resolvedCompany?.display_name ||
      prevProps.resolvedCompany?.industry !== nextProps.resolvedCompany?.industry ||
      prevProps.resolvedCompany?.city !== nextProps.resolvedCompany?.city
    ) {
      return false;
    }
  }

  if (prevProps.salesperson !== nextProps.salesperson) {
    if (
      prevProps.salesperson?.id !== nextProps.salesperson?.id ||
      prevProps.salesperson?.initials !== nextProps.salesperson?.initials ||
      prevProps.salesperson?.full_name !== nextProps.salesperson?.full_name ||
      (prevProps.salesperson as any)?.name !== (nextProps.salesperson as any)?.name
    ) {
      return false;
    }
  }

  // Check enquiry record
  const prevE = prevProps.enquiry;
  const nextE = nextProps.enquiry;
  if (prevE !== nextE) {
    if (
      prevE.id !== nextE.id ||
      prevE.sn !== nextE.sn ||
      prevE.status !== nextE.status ||
      prevE.value_aed !== nextE.value_aed ||
      prevE.currency !== nextE.currency ||
      prevE.quote_ref_no !== nextE.quote_ref_no ||
      prevE.company_id !== nextE.company_id ||
      prevE.company_name !== nextE.company_name ||
      prevE.client_company !== nextE.client_company ||
      prevE.sales_person !== nextE.sales_person ||
      prevE.sales_person_id !== nextE.sales_person_id ||
      prevE.salesperson !== nextE.salesperson ||
      prevE.salesperson_id !== nextE.salesperson_id ||
      prevE.assignedSalesperson !== nextE.assignedSalesperson ||
      prevE.enquiry_date !== nextE.enquiry_date ||
      prevE.enquiry_source !== nextE.enquiry_source ||
      prevE.statusUpdatedAt !== nextE.statusUpdatedAt ||
      prevE.statusUpdatedBy !== nextE.statusUpdatedBy ||
      prevE.sentAt !== nextE.sentAt ||
      prevE.wonAt !== nextE.wonAt ||
      prevE.lostAt !== nextE.lostAt ||
      prevE.updatedAt !== nextE.updatedAt ||
      prevE.is_gap_placeholder !== nextE.is_gap_placeholder ||
      prevE.is_deleted !== nextE.is_deleted ||
      prevE.creator_access_released !== nextE.creator_access_released ||
      prevE.attachments?.length !== nextE.attachments?.length ||
      prevE.line_items?.length !== nextE.line_items?.length
    ) {
      return false;
    }
  }

  // Stabilized callbacks
  if (prevProps.onToggleSelect !== nextProps.onToggleSelect) return false;
  if (prevProps.onSelectEnquiry !== nextProps.onSelectEnquiry) return false;
  if (prevProps.onEditEnquiry !== nextProps.onEditEnquiry) return false;
  if (prevProps.onDeleteEnquiry !== nextProps.onDeleteEnquiry) return false;
  if (prevProps.onStatusChange !== nextProps.onStatusChange) return false;
  if (prevProps.onCompanyClick !== nextProps.onCompanyClick) return false;

  return true;
}

export const EnquiryTableRow = React.memo(function EnquiryTableRow({
  enquiry: e,
  isChecked,
  isMarkingMode,
  isEditable,
  canEdit,
  canDelete,
  canViewConfidentialMargins,
  isCreatorOnly,
  companyName,
  resolvedCompany,
  salesperson,
  companies,
  setCompanies,
  onToggleSelect,
  onSelectEnquiry,
  onEditEnquiry,
  onDeleteEnquiry,
  onStatusChange,
  onCompanyClick,
  activeQuotation
}: EnquiryTableRowProps) {
  const isGapReserved = Boolean(
    e.is_gap_placeholder ||
    (e.status && (e.status === 'Gap / Reserved' || e.status.toUpperCase() === 'GAP / RESERVED')) ||
    (e.company_name && e.company_name.includes('[Reserved Sequence'))
  );

  const isClickable = !isGapReserved && Boolean(resolvedCompany?.id || e.company_id || resolvedCompany);

  const spId = resolveSalespersonIdentifier(e);
  const spName = resolveSalespersonName(e);
  const rawInitials = salesperson
    ? (salesperson.initials || getInitials(salesperson.full_name || (salesperson as any).name || ''))
    : (spName ? getInitials(spName) : spId || '—');
  const cleanInitials =
    rawInitials.toUpperCase() === 'SYSTEM'
      ? 'SYS'
      : rawInitials.length > 3
      ? getInitials(rawInitials).slice(0, 3).toUpperCase()
      : rawInitials.toUpperCase();
  const baseRepTitle = salesperson?.full_name || (salesperson as any)?.name || spName || spId || 'Unassigned';
  const repTooltip = isCreatorOnly
    ? `${baseRepTitle} • Logged by you on behalf of the assigned salesperson`
    : `Assigned Rep: ${baseRepTitle}`;

  const relTime = formatRelativeTime(e.statusUpdatedAt || e.sentAt || e.wonAt || e.lostAt || e.updatedAt);
  const lastUpdater = e.statusUpdatedBy || (e.statusHistory && e.statusHistory.length > 0 ? e.statusHistory[e.statusHistory.length - 1].updatedBy : undefined);
  const shortUpdater = lastUpdater ? (lastUpdater.includes('@') ? lastUpdater.split('@')[0] : lastUpdater) : '';
  const statusSubline = [relTime, shortUpdater].filter(Boolean).join(' · ');
  const tooltipTitle = e.statusUpdatedAt
    ? `Status: ${e.status} • Updated on ${new Date(e.statusUpdatedAt).toLocaleString()}${lastUpdater ? ` by ${lastUpdater}` : ''}`
    : `Status: ${e.status} • Click to update`;

  const { prefix, formattedAmount } = getEnquiryCurrencyParts(e);
  const dateRelativeAge = formatEnquiryRelativeAge(e.enquiry_date);

  const handleRowClick = (evt: React.MouseEvent<HTMLTableRowElement>) => {
    const selection = window.getSelection()?.toString();
    if (selection && selection.trim().length > 0) {
      return;
    }
    if (e.id) {
      onSelectEnquiry(e.id);
    }
  };

  const handleRowKeyDown = (evt: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      const targetTag = (evt.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'select' || targetTag === 'button') {
        return;
      }
      evt.preventDefault();
      if (e.id) {
        onSelectEnquiry(e.id);
      }
    }
  };

  const cleanGapMemo = isGapReserved
    ? (companyName || '')
        .replace(/\[Reserved Sequence\s*\/?\s*#?\d*\]/gi, '')
        .trim()
    : '';

  return (
    <tr
      key={e.id}
      tabIndex={0}
      role="button"
      aria-label={`View details for enquiry #${e.sn || ''}`}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      className={`cursor-pointer border-b border-slate-200/80 dark:border-slate-800/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:bg-slate-50/90 dark:focus-visible:bg-slate-800/70 group ${
        isGapReserved ? 'opacity-80 bg-amber-50/20 dark:bg-amber-950/15 border-dashed' : ''
      } ${
        isChecked && isMarkingMode
          ? 'bg-blue-50/50 dark:bg-blue-950/30 font-medium'
          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
      }`}
    >
      {isMarkingMode && (
        <td className="py-3 px-2.5 text-center overflow-hidden align-middle" onClick={(evt) => evt.stopPropagation()}>
          <input
            type="checkbox"
            checked={isChecked}
            onClick={(evt) => evt.stopPropagation()}
            onChange={(chk) => onToggleSelect(e.id!, chk.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </td>
      )}

      {/* 1. S/N */}
      <td className="py-3 px-2 font-mono text-xs text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap text-center overflow-hidden align-middle tabular-nums">
        #{e.sn}
      </td>

      {/* 2. COMPANY ACCOUNT (Strict 2-Line Hierarchy) */}
      <td className="py-3 px-3 overflow-hidden align-middle" title={companyName}>
        {isGapReserved ? (
          <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 font-mono truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="truncate">Reserved Sequence #{e.sn}</span>
            </span>
            <span
              className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate"
              title={cleanGapMemo || 'Unassigned sequence placeholder'}
            >
              {cleanGapMemo || 'Unassigned sequence placeholder'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span
                onClick={(evt) => {
                  if (isClickable) {
                    evt.stopPropagation();
                    onCompanyClick(e);
                  }
                }}
                title={companyName}
                className={`text-sm font-semibold truncate ${
                  isClickable
                    ? 'text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {companyName}
              </span>
              {companyName && companyName !== 'Unknown Client' && (
                <div
                  className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                  onClick={(evt) => evt.stopPropagation()}
                >
                  <GoogleSearchButton
                    companyName={companyName}
                    location={resolvedCompany?.city || (companies || []).find((c) => c && c.id === e.company_id)?.city}
                    size="xs"
                  />
                </div>
              )}
            </div>
            {(() => {
              const isDnc = Boolean(resolvedCompany?.is_dnc);
              const rawTemp = resolvedCompany?.temperature || 'Warm';
              const tempLabel = isDnc ? 'DNC' : rawTemp;
              const tempColorClass = isDnc
                ? 'text-rose-600 dark:text-rose-400'
                : rawTemp === 'Hot'
                ? 'text-orange-600 dark:text-orange-400'
                : rawTemp === 'Cold'
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-amber-600 dark:text-amber-400';

              const rawIndustry = (resolvedCompany?.industry || (resolvedCompany as any)?.category || '').trim();
              const cleanIndustry =
                rawIndustry && rawIndustry.toLowerCase() !== 'unknown' && rawIndustry.toLowerCase() !== 'general'
                  ? rawIndustry
                  : '';
              const cleanSource = e.enquiry_source ? normalizeEnquirySource(e.enquiry_source) : '';
              const secondaryParts = [cleanIndustry, cleanSource].filter(Boolean);

              return (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate min-w-0">
                  {resolvedCompany && (
                    <span className={`inline-flex items-center gap-1 font-medium shrink-0 ${tempColorClass}`}>
                      <span className="text-[9px] leading-none">●</span>
                      <span>{tempLabel}</span>
                    </span>
                  )}
                  {resolvedCompany && secondaryParts.length > 0 && (
                    <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">·</span>
                  )}
                  {secondaryParts.length > 0 && (
                    <span className="truncate" title={secondaryParts.join(' · ')}>
                      {secondaryParts.join(' · ')}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </td>

      {/* 3. QUOTE REF NO (Single Clean Monospace Badge) */}
      <td className="py-3 px-2.5 whitespace-nowrap overflow-hidden align-middle">
        {(() => {
          const quoteDoc = e.attachments?.find((att) =>
            att.name?.startsWith('QT-') && att.name?.endsWith('.pdf')
          );
          const docRefName = quoteDoc ? quoteDoc.name.replace('.pdf', '') : null;

          const canonicalEnquiryRef = QuotationRepository.sanitizeCanonicalQuoteRef(e.quote_ref_no);
          const formalRef = QuotationRepository.sanitizeCanonicalQuoteRef(
            activeQuotation?.formatted_quote_ref ||
              docRefName ||
              (canonicalEnquiryRef && /^QT-\d+/i.test(canonicalEnquiryRef) ? canonicalEnquiryRef : null)
          );

          const hasFormalQuote = Boolean(
            (activeQuotation && activeQuotation.status !== 'Draft') ||
            docRefName ||
            (canonicalEnquiryRef && /^QT-\d+/i.test(canonicalEnquiryRef))
          );

          const displayRef = (hasFormalQuote && formalRef) ? formalRef : (canonicalEnquiryRef || '—');

          if (hasFormalQuote && formalRef) {
            const quoteStatus =
              activeQuotation?.status ||
              (e.status === 'Won / Order Confirmed' || e.status === 'Won / Approved'
                ? 'Approved'
                : e.status === 'Lost / Cancelled' || e.status === 'Lost'
                ? 'Declined'
                : 'Sent');
            const isApproved = quoteStatus === 'Approved';
            const isDeclined = quoteStatus === 'Declined';
            const badgeColorClass = isApproved
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
              : isDeclined
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60'
              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60';

            return (
              <span
                className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium px-2 py-0.5 rounded-md border max-w-full truncate ${badgeColorClass}`}
                title={`Formal Quotation (${quoteStatus}): ${formalRef}${canonicalEnquiryRef && canonicalEnquiryRef !== formalRef ? ` • Enquiry Ref: ${canonicalEnquiryRef}` : ''}`}
              >
                <span className="truncate">{formalRef}</span>
              </span>
            );
          }

          return (
            <span
              className="font-mono text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60 inline-block max-w-full truncate"
              title={displayRef}
            >
              {displayRef}
            </span>
          );
        })()}
      </td>

      {/* 4. REP (Centered 2-3 Char Initials Badge Only) */}
      <td className="py-3 px-1.5 whitespace-nowrap text-center overflow-hidden align-middle">
        <span
          className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-md font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700"
          title={repTooltip}
        >
          {cleanInitials}
        </span>
      </td>

      {/* 5. DATE (Line 1: Formatted Date, Line 2: Relative Age) */}
      <td className="py-3 px-2 whitespace-nowrap overflow-hidden align-middle">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap truncate">
            {formatEnquiryDate(e.enquiry_date)}
          </span>
          {dateRelativeAge && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap truncate">
              {dateRelativeAge}
            </span>
          )}
        </div>
      </td>

      {/* 6. STATUS (Line 1: Status Pill, Line 2: Clean Timestamp · Author) */}
      <td className="py-3 px-2 whitespace-nowrap overflow-hidden align-middle" onClick={(evt) => evt.stopPropagation()}>
        <div className="flex flex-col items-start gap-0.5 max-w-full overflow-hidden">
          <div className="relative inline-flex items-center max-w-full">
            <select
              value={normalizeEnquiryStatus(e.status)}
              onClick={(evt) => evt.stopPropagation()}
              onChange={(evt) => {
                evt.stopPropagation();
                onStatusChange(e, evt.target.value);
              }}
              title={tooltipTitle}
              className={`appearance-none cursor-pointer pr-5 pl-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 hover:brightness-95 max-w-full truncate ${getStatusBadgeClass(e.status)}`}
            >
              {PIPELINE_STATUS_GROUPS.map((group) => (
                <optgroup
                  key={group.label}
                  label={group.label}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]"
                >
                  {group.options.map((st) => (
                    <option
                      key={st}
                      value={st}
                      className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 normal-case font-sans text-xs font-normal"
                    >
                      {st}
                    </option>
                  ))}
                </optgroup>
              ))}
              {e.status && !PIPELINE_STATUS_GROUPS.some((g) => (g.options as readonly string[]).includes(normalizeEnquiryStatus(e.status))) && (
                <optgroup label="Other / Legacy" className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                  <option value={e.status} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 normal-case font-sans text-xs">
                    {e.status}
                  </option>
                </optgroup>
              )}
            </select>
            <ChevronDown className="w-3 h-3 pointer-events-none absolute right-1.5 text-current opacity-60" />
          </div>

          {statusSubline && (
            <span
              className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-full pl-0.5"
              title={tooltipTitle}
            >
              {statusSubline}
            </span>
          )}
        </div>
      </td>

      {/* 7. VALUE (Generous pr-5 Right Gutter, Line 1: Currency + Amount, Line 2: Item/File Summary) */}
      <td className="py-3 pl-2 pr-5 text-right whitespace-nowrap overflow-hidden align-middle">
        <div className="flex flex-col items-end gap-0.5 min-w-0 max-w-full overflow-hidden">
          <div className="inline-flex items-baseline justify-end max-w-full truncate font-mono tabular-nums">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">{prefix}</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums truncate">{formattedAmount}</span>
          </div>
          {(() => {
            const items = e.line_items || [];
            const itemCount = items.length;
            const fileCount = (e.attachments || []).length;
            let marginText: string | null = null;
            if (canViewConfidentialMargins && itemCount > 0) {
              const baselineItems = items.filter(
                (li) => !li.option || li.option === 'Baseline / All' || li.option === 'Option A'
              );
              const calcItems = baselineItems.length > 0 ? baselineItems : items;
              const hasCost = calcItems.some((li) => (Number(li.cost_price) || 0) > 0);
              if (hasCost) {
                const sellSum = calcItems.reduce((s, li) => s + (Number(li.total_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0)), 0);
                const costSum = calcItems.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.cost_price) || 0), 0);
                if (sellSum > 0) {
                  marginText = `${(((sellSum - costSum) / sellSum) * 100).toFixed(0)}% margin`;
                }
              }
            }
            const parts = [
              itemCount > 0 ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : null,
              fileCount > 0 ? `${fileCount} ${fileCount === 1 ? 'file' : 'files'}` : null,
              marginText
            ].filter(Boolean);
            if (parts.length === 0) return null;
            return (
              <span
                className="text-[11px] font-sans tabular-nums text-slate-400 dark:text-slate-500 truncate max-w-full block"
                title={parts.join(' · ')}
              >
                {parts.join(' · ')}
              </span>
            );
          })()}
        </div>
      </td>

      {/* 8. ACTIONS (Crisp Primary [Open] + Compact w-7 h-7 Icon Buttons) */}
      <td className="py-3 pl-2 pr-3 text-right whitespace-nowrap overflow-hidden align-middle" onClick={(evt) => evt.stopPropagation()}>
        <div className="inline-flex items-center justify-end gap-1" onClick={(evt) => evt.stopPropagation()}>
          <button
            type="button"
            onClick={(evt) => {
              evt.stopPropagation();
              if (e.id) onSelectEnquiry(e.id);
            }}
            className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs transition inline-flex items-center justify-center cursor-pointer shrink-0"
            title="Open enquiry details"
          >
            Open
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={(evt) => {
                evt.stopPropagation();
                onEditEnquiry(e);
              }}
              className={`w-7 h-7 rounded-lg inline-flex items-center justify-center border transition cursor-pointer shrink-0 ${
                isGapReserved
                  ? 'bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/60'
                  : 'text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border-transparent hover:border-blue-200/80 dark:hover:border-blue-800/60'
              }`}
              title={isGapReserved ? 'Claim reserved gap sequence' : 'Edit enquiry'}
              aria-label={isGapReserved ? 'Claim reserved gap sequence' : 'Edit enquiry'}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={(evt) => {
                evt.stopPropagation();
                onDeleteEnquiry(e);
              }}
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/60 transition cursor-pointer shrink-0"
              title={isGapReserved ? 'Delete reserved gap' : 'Delete enquiry'}
              aria-label={isGapReserved ? 'Delete reserved gap' : 'Delete enquiry'}
            >
              <Trash className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}, areRowPropsEqual);

export const EnquiryRowMemo = EnquiryTableRow;

export type QuoteLifecycleFilter = 'all' | 'pending' | 'won' | 'lost' | 'unquoted';

interface EnquiryListProps {
  key?: any;
  enquiries: Enquiry[];
  occupiedWorkspaceSns?: Set<number>;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  companies: Company[];
  salespersons: Salesperson[];
  contacts?: Contact[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  projects?: Project[];
  setProjects?: React.Dispatch<React.SetStateAction<Project[]>>;
  onSelectEnquiry: (id: string) => void;
  onAddEnquiry: () => void;
  onEditEnquiry: (enquiry: Enquiry) => void;
  onDeleteEnquiry: (id: string) => void;
  onBulkDeleteEnquiries: (ids: string[]) => void;
  user: any;
  activeWorkspace?: Workspace | any;
  onOpenMobileMenu?: () => void;
  onOpenCompany360?: (companyId: string) => void;
  onViewCompany360?: (company: Company) => void;
  setSelectedCompanyForDetail?: (company: Company | null) => void;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOpenActivityDrawer?: (context: {
    companyId?: string;
    companyName?: string;
    contactId?: string;
    contactName?: string;
    contactPhone?: string;
    enquiryId?: string;
    channel?: 'Call' | 'WhatsApp' | 'Email' | 'Meeting' | 'Site Visit' | string;
    initialStatus?: string;
    existingLog?: any;
    logToEdit?: any;
  }) => void;
  onInitiateActivity?: (options: InitiateActivityOptions) => void;
  onStockUpdated?: () => void;
}

export default function EnquiryList({
  enquiries,
  occupiedWorkspaceSns,
  setEnquiries,
  companies,
  salespersons,
  setCompanies,
  projects = [],
  setProjects,
  onSelectEnquiry,
  onAddEnquiry,
  onEditEnquiry,
  onDeleteEnquiry,
  onBulkDeleteEnquiries,
  user,
  activeWorkspace,
  contacts = [],
  triggerToast,
  onOpenMobileMenu,
  onOpenCompany360,
  onViewCompany360,
  setSelectedCompanyForDetail,
  onOpenActivityDrawer,
  onInitiateActivity,
  onStockUpdated
}: EnquiryListProps) {
  const launcher = useActivityLauncher();
  const [selected360CompanyId, setSelected360CompanyId] = useState<string | null>(null);
  const handleInitiate = onInitiateActivity || launcher.initiateActivity;
  const [showExportModal, setShowExportModal] = useState(false);
  const [showQuickClaimModal, setShowQuickClaimModal] = useState(false);
  const [showReserveGapModal, setShowReserveGapModal] = useState(false);
  const [reserveGapSn, setReserveGapSn] = useState('');
  const [reserveGapMemo, setReserveGapMemo] = useState('');
  const [reserveGapDate, setReserveGapDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSubmittingGap, setIsSubmittingGap] = useState(false);
  const [isReservingGap, setIsReservingGap] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<'All' | 'Overdue'>('All');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [quoteLifecycleFilter, setQuoteLifecycleFilter] = useState<QuoteLifecycleFilter>('all');
  const [quotations, setQuotations] = useState<Quotation[]>([]);

  // Load and refresh workspace quotations for real-time badge and lifecycle syncing
  React.useEffect(() => {
    let isMounted = true;
    const wsId = activeWorkspace?.id || activeWorkspace?.workspace_id || 'ws_default';
    QuotationRepository.getQuotationsForWorkspace(wsId)
      .then((data) => {
        if (isMounted) setQuotations(data);
      })
      .catch((err) => {
        console.warn('[EnquiryList] Failed loading workspace quotations:', err);
      });

    const onFocus = () => {
      QuotationRepository.getQuotationsForWorkspace(wsId)
        .then((data) => {
          if (isMounted) setQuotations(data);
        })
        .catch(() => {});
    };

    window.addEventListener('focus', onFocus);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [activeWorkspace?.id, activeWorkspace?.workspace_id, enquiries]);

  // Debounce search input updates to eliminate typing lag
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Bulk deletion multi-select state (Marking is optional)
  const [isMarkingMode, setIsMarkingMode] = useState(false);
  const [selectedEnquiryIds, setSelectedEnquiryIds] = useState<string[]>([]);

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    variant?: 'destructive' | 'warning' | 'default';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'All'>(25);

  // Reset page to 1 when filters change to prevent empty states
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, salesPersonFilter, urgencyFilter, sourceFilter, quoteLifecycleFilter]);

  // Excel/CSV Advanced Column-Mapping Preview Importer state
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStep, setImportStep] = useState<'input' | 'preview'>('input');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [columnMappings, setColumnMappings] = useState<{
    sn: number;
    quote_ref: number;
    date: number;
    sales_person: number;
    client: number;
    value: number;
    status: number;
  }>({ sn: 0, quote_ref: 1, date: 2, sales_person: 3, client: 4, value: -1, status: -1 });

  // Cycle lists and helpers
  const statuses = [
    'All',
    'Active',
    'Draft',
    'Sent / Pending Client',
    'Revision Requested',
    'Won / Approved',
    'Lost / Cancelled',
    'Hold',
    'Delayed',
    'Dead',
    'Order Received',
    'Gap / Reserved'
  ];
  const salespersonOptions = React.useMemo(() => {
    return ['All', ...(salespersons || []).map((s) => s?.initials).filter(Boolean) as string[]];
  }, [salespersons]);

  const cycleStatus = () => {
    const currentIndex = statuses.indexOf(statusFilter);
    const nextIndex = (currentIndex + 1) % statuses.length;
    setStatusFilter(statuses[nextIndex]);
  };

  const cycleSalesPerson = () => {
    const currentIndex = salespersonOptions.indexOf(salesPersonFilter);
    const nextIndex = (currentIndex + 1) % salespersonOptions.length;
    setSalesPersonFilter(salespersonOptions[nextIndex]);
  };
  
  // Sort State
  const [sortField, setSortField] = useState<'sn' | 'enquiry_date' | 'value_aed'>('sn');
  const [sortAsc, setSortAsc] = useState(false);

  const isEditable = canCreateEnquiry(user, activeWorkspace);

  // Memoized Lookup Maps
  const companyMap = React.useMemo(() => {
    return new Map((companies || []).filter(Boolean).map((c) => [c.id, c.display_name || (c as any)?.name || '']));
  }, [companies]);

  const companyByIdMap = React.useMemo(() => {
    return new Map((companies || []).filter(Boolean).map((c) => [c.id, c]));
  }, [companies]);

  const primaryContactMap = React.useMemo(() => {
    return new Map((contacts || []).filter(Boolean).map((c) => [c.id, c]));
  }, [contacts]);

  const salespersonMap = React.useMemo(() => {
    const map = new Map<string, Salesperson>();
    (salespersons || []).forEach((s) => {
      if (!s) return;
      if (s.id) map.set(s.id.toLowerCase().trim(), s);
      if (s.initials) map.set(s.initials.toLowerCase().trim(), s);
      if (s.full_name) map.set(s.full_name.toLowerCase().trim(), s);
      if ((s as any).name) map.set((s as any).name.toLowerCase().trim(), s);
    });
    return map;
  }, [salespersons]);

  const resolveCompanyForEnquiry = React.useCallback((enquiry: Enquiry): Company | undefined => {
    if (!enquiry) return undefined;
    if (enquiry.company_id) {
      const found = companyByIdMap.get(enquiry.company_id);
      if (found) return found;
    }
    const nameToMatch = (
      (enquiry.company_id ? companyMap.get(enquiry.company_id) : '') ||
      (enquiry as any)?.company_name ||
      (enquiry as any)?.client_company ||
      ''
    ).trim().toLowerCase();

    if (nameToMatch && nameToMatch !== 'unknown client' && nameToMatch !== 'unknown') {
      return (companies || []).find((c) =>
        c && (
          (c.display_name || '').trim().toLowerCase() === nameToMatch ||
          (c.canonical_name || '').trim().toLowerCase() === nameToMatch ||
          (c.aliases || []).some((a) => (a || '').trim().toLowerCase() === nameToMatch)
        )
      );
    }
    return undefined;
  }, [companies, companyMap, companyByIdMap]);

  const resolveSalespersonForEnquiry = React.useCallback((e: Enquiry): Salesperson | undefined => {
    const spId = resolveSalespersonIdentifier(e);
    const spName = resolveSalespersonName(e);
    if (spId) {
      const found = salespersonMap.get(spId.toLowerCase().trim());
      if (found) return found;
    }
    if (spName) {
      const found = salespersonMap.get(spName.toLowerCase().trim());
      if (found) return found;
    }
    return (salespersons || []).find(
      (s) =>
        s &&
        ((spId && (s.id === spId || s.initials === spId)) ||
         (spName &&
           (s.id === spName ||
            s.initials === spName ||
            (s.full_name && s.full_name.toLowerCase() === spName.toLowerCase()) ||
            (s.name && s.name.toLowerCase() === spName.toLowerCase()))))
    );
  }, [salespersonMap, salespersons]);

  const handleCompanyClick = React.useCallback((enquiry: Enquiry) => {
    const targetComp = resolveCompanyForEnquiry(enquiry);
    const targetCompanyId = targetComp?.id || enquiry.company_id;
    if (targetCompanyId) {
      if (onOpenCompany360) {
        onOpenCompany360(targetCompanyId);
      } else if (onViewCompany360 && targetComp) {
        onViewCompany360(targetComp);
      } else if (setSelectedCompanyForDetail && targetComp) {
        setSelectedCompanyForDetail(targetComp);
      } else {
        setSelected360CompanyId(targetCompanyId);
      }
    } else if (targetComp) {
      if (onViewCompany360) {
        onViewCompany360(targetComp);
      } else if (setSelectedCompanyForDetail) {
        setSelectedCompanyForDetail(targetComp);
      }
    }
  }, [resolveCompanyForEnquiry, onOpenCompany360, onViewCompany360, setSelectedCompanyForDetail]);

  const handleSort = React.useCallback((field: 'sn' | 'enquiry_date' | 'value_aed') => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortAsc((prevAsc) => !prevAsc);
        return prevField;
      } else {
        setSortAsc(false);
        return field;
      }
    });
  }, []);

  // Determine administrative read rights: Workspace Admin or Superadmin sees all workspace enquiries
  const currentUser = user;
  const effectiveRole = getEffectiveWorkspaceRole(currentUser, activeWorkspace);
  const isWsAdmin = effectiveRole === 'admin';
  const canViewConfidentialMargins =
    canManageWorkspace(currentUser, activeWorkspace) ||
    isAdmin(currentUser, activeWorkspace?.id, activeWorkspace);
  const currentUserId = (currentUser?.uid || currentUser?.id || '').trim();

  // Scoped Enquiry Access Control: Base set of authorized records visible to the current user
  const authorizedEnquiries = React.useMemo(() => {
    if (isWsAdmin) {
      // If effective role is 'admin':
      // Display all workspace enquiries without filtering by rep or creator.
      return (enquiries || []).filter((e) => e && !e.is_deleted);
    }
    // If effective role is 'member' (or 'viewer'):
    // Enforce member restriction: only display enquiries where assignedSalesperson === currentUser.initials (or shared with them), or mask data according to workspace non-admin settings.
    return (enquiries || []).filter((e) => e && !e.is_deleted && canAccessEnquiry(user, e, activeWorkspace));
  }, [enquiries, user, activeWorkspace, isWsAdmin]);

  // Restrict salesperson dropdown options for standard reps to prevent metadata leaks
  const availableSalespersons = React.useMemo(() => {
    if (isWsAdmin) return salespersons || [];

    const activeReps = new Set<string>();
    (authorizedEnquiries || []).forEach((e) => {
      if (!e) return;
      const spId = resolveSalespersonIdentifier(e);
      const spName = resolveSalespersonName(e);
      if (spId) activeReps.add(spId.toLowerCase().trim());
      if (spName) activeReps.add(spName.toLowerCase().trim());
      if (e.sales_person_id) activeReps.add(e.sales_person_id.toLowerCase().trim());
      if (e.salesperson_id) activeReps.add(e.salesperson_id.toLowerCase().trim());
      if (e.sales_rep_id) activeReps.add(e.sales_rep_id.toLowerCase().trim());
      if ((e as any).salesRepresentativeId) activeReps.add(String((e as any).salesRepresentativeId).toLowerCase().trim());
      if (e.sales_person) activeReps.add(e.sales_person.toLowerCase().trim());
      if (e.salesperson) activeReps.add(e.salesperson.toLowerCase().trim());
      if (e.sales_representative) activeReps.add(e.sales_representative.toLowerCase().trim());
      if ((e as any).salesRep) activeReps.add(String((e as any).salesRep).toLowerCase().trim());
    });

    const filtered = (salespersons || []).filter((s) => {
      if (!s) return false;
      const idMatch = s.id && activeReps.has(s.id.toLowerCase().trim());
      const initMatch = s.initials && activeReps.has(s.initials.toLowerCase().trim());
      const nameMatch = s.full_name && activeReps.has(s.full_name.toLowerCase().trim());
      return idMatch || initMatch || nameMatch;
    });

    return filtered.length > 0 ? filtered : (salespersons || []);
  }, [salespersons, authorizedEnquiries, isWsAdmin]);

  // Dynamic set of enquiry sources with case normalization
  const availableSources = React.useMemo(() => {
    const set = new Set<string>();
    (authorizedEnquiries || []).forEach((e) => {
      if (e?.enquiry_source) {
        set.add(normalizeEnquirySource(e.enquiry_source));
      }
    });
    return Array.from(set).sort();
  }, [authorizedEnquiries]);

  // Memoized map: enquiry_id -> active Quotation
  const activeQuotationByEnquiryId = React.useMemo(() => {
    const map = new Map<string, Quotation>();

    // Group strictly commercial quotations ('quotation') by enquiry_id — never auxiliary DO/PO/REC/PV/MRN/DN
    const grouped = new Map<string, Quotation[]>();
    for (const q of quotations) {
      if (!q.enquiry_id || q.is_deleted) continue;
      if ((q.document_type || 'quotation') !== 'quotation') continue;
      if (/^(?:DO|PO|REC|PV|MRN|DN)-/i.test(q.formatted_quote_ref || q.quote_number || '')) continue;
      const list = grouped.get(q.enquiry_id) || [];
      list.push(q);
      grouped.set(q.enquiry_id, list);
    }

    // For each enquiry_id, resolve the active quotation
    grouped.forEach((quotes, enquiryId) => {
      // 1. Check if there's an Approved quotation (the winning quote)
      const approved = quotes.find((q) => q.status === 'Approved');
      if (approved) {
        map.set(enquiryId, approved);
        return;
      }
      // 2. Check if there's an active Sent quotation (latest revision)
      const sentQuotes = quotes.filter((q) => q.status === 'Sent');
      if (sentQuotes.length > 0) {
        sentQuotes.sort((a, b) => (b.revision_number ?? 0) - (a.revision_number ?? 0));
        map.set(enquiryId, sentQuotes[0]);
        return;
      }
      // 3. Check if all quotes are Declined
      const declinedQuotes = quotes.filter((q) => q.status === 'Declined');
      const draftQuotes = quotes.filter((q) => q.status === 'Draft');
      if (declinedQuotes.length > 0 && draftQuotes.length === 0) {
        declinedQuotes.sort((a, b) => (b.revision_number ?? 0) - (a.revision_number ?? 0));
        map.set(enquiryId, declinedQuotes[0]);
        return;
      }
      // 4. Otherwise, pick highest revision non-superseded or first quote
      const nonSuperseded = quotes.filter((q) => q.status !== 'Superseded');
      if (nonSuperseded.length > 0) {
        nonSuperseded.sort((a, b) => (b.revision_number ?? 0) - (a.revision_number ?? 0));
        map.set(enquiryId, nonSuperseded[0]);
      } else if (quotes.length > 0) {
        quotes.sort((a, b) => (b.revision_number ?? 0) - (a.revision_number ?? 0));
        map.set(enquiryId, quotes[0]);
      }
    });

    return map;
  }, [quotations]);

  // Aggregate lifecycle counts and KPI pipeline metrics across authorized enquiries
  const lifecycleCounts = React.useMemo(() => {
    let pending = 0;
    let won = 0;
    let lost = 0;
    let unquoted = 0;
    let activePipelineValueAed = 0;
    let pendingQuotesValueAed = 0;
    let wonValueAed = 0;
    let overdueFollowups = 0;
    const today = new Date().toISOString().split('T')[0];

    (authorizedEnquiries || []).forEach((e) => {
      if (!e || e.is_gap_placeholder) return;
      const quote = e.id ? activeQuotationByEnquiryId.get(e.id) : null;
      const normStatus = normalizeEnquiryStatus(e.status);
      const quoteGrandTotal = Number(quote?.grand_total || 0);
      const quoteValAed =
        quoteGrandTotal > 0 ? (quote?.currency === 'USD' ? quoteGrandTotal * 3.6725 : quoteGrandTotal) : 0;
      const valAed = quoteValAed > 0 ? quoteValAed : Number(e.value_aed || 0);

      const isWon =
        quote?.status === 'Approved' ||
        normStatus === 'Won / Order Confirmed' ||
        normStatus === 'Won / Approved' ||
        e.status === 'Won / Order Confirmed' ||
        e.status === 'Won / Approved';

      const isLost =
        quote?.status === 'Declined' ||
        normStatus === 'Lost / Cancelled' ||
        e.status === 'Lost / Cancelled' ||
        e.status === 'Lost';

      const isPending =
        !isWon &&
        !isLost &&
        (quote?.status === 'Sent' ||
          (normStatus === 'Sent / Pending Client' &&
            (quote ||
              e.attachments?.some((a) => a.name?.startsWith('QT-')) ||
              (e.quote_ref_no && e.quote_ref_no.startsWith('QT-')))));

      const hasFormal =
        (quote && quote.status !== 'Draft') ||
        e.attachments?.some((a) => a.name?.startsWith('QT-') && a.name?.endsWith('.pdf')) ||
        Boolean(e.quote_ref_no && /^QT-\d+/i.test(e.quote_ref_no));

      if (isWon) {
        won++;
        wonValueAed += valAed;
      } else if (isLost) {
        lost++;
      } else {
        activePipelineValueAed += valAed;
        if (isPending) {
          pending++;
          pendingQuotesValueAed += valAed;
        }
      }

      if (!hasFormal) unquoted++;
      if (!isWon && !isLost && e.next_followup_date && e.next_followup_date < today) {
        overdueFollowups++;
      }
    });

    const winRatePct = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    return {
      all: authorizedEnquiries.length,
      pending,
      won,
      lost,
      unquoted,
      activePipelineValueAed,
      pendingQuotesValueAed,
      wonValueAed,
      winRatePct,
      overdueFollowups
    };
  }, [authorizedEnquiries, activeQuotationByEnquiryId]);

  // Filter Logic (Memoized)
  const filteredEnquiries = React.useMemo(() => {
    const q = (searchInput || searchQuery || '').toLowerCase().trim();
    const today = new Date().toISOString().split('T')[0];

    return (authorizedEnquiries || []).filter((e) => {
      if (!e) return false;
      // 1. Search Query
      const compName = (e.company_id ? companyMap.get(e.company_id) : '') || (e as any)?.company_name || '';
      const compNameLower = String(compName).toLowerCase();
      const ref = (e.quote_ref_no || '').toLowerCase();
      const snStr = e.sn != null ? String(e.sn) : '';
      const matchText = !q || compNameLower.includes(q) || ref.includes(q) || snStr.includes(q);

      // 2. Status
      const matchStatus =
        statusFilter === 'All' ||
        e.status === statusFilter ||
        (statusFilter === 'Gap / Reserved' && (e.status === 'GAP / RESERVED' || e.is_gap_placeholder)) ||
        normalizeEnquiryStatus(e.status) === statusFilter;

      // 3. Salesperson
      const matchRep = salesPersonFilter === 'All' || (() => {
        const filterKey = salesPersonFilter.toLowerCase().trim();
        const sp = salespersonMap.get(filterKey);
        const spId = resolveSalespersonIdentifier(e);
        const spName = resolveSalespersonName(e);
        if (!sp) {
          return (
            spId === salesPersonFilter ||
            spName === salesPersonFilter ||
            e.sales_person === salesPersonFilter ||
            e.salesperson === salesPersonFilter
          );
        }
        return (
          spId === sp.id ||
          spId === sp.initials ||
          spName === sp.id ||
          spName === sp.initials ||
          (sp.full_name && spName.toLowerCase() === sp.full_name.toLowerCase()) ||
          e.sales_person === sp.id ||
          e.sales_person === sp.initials ||
          e.salesperson === sp.id ||
          e.salesperson === sp.initials ||
          (sp.full_name && (e.salesperson === sp.full_name || e.sales_person === sp.full_name))
        );
      })();

      // 4. Urgency (Overdue followups)
      const matchUrgency =
        urgencyFilter === 'All' ||
        (e.status === 'Active' && e.next_followup_date && e.next_followup_date < today);

      // 5. Enquiry Source
      const matchSource =
        sourceFilter === 'All' ||
        normalizeEnquirySource(e.enquiry_source) === sourceFilter;

      // 6. Quotation Lifecycle Filter
      let matchQuoteLifecycle = true;
      if (quoteLifecycleFilter === 'pending') {
        const quote = e.id ? activeQuotationByEnquiryId.get(e.id) : null;
        const normStatus = normalizeEnquiryStatus(e.status);
        const isWon =
          quote?.status === 'Approved' ||
          normStatus === 'Won / Order Confirmed' ||
          normStatus === 'Won / Approved' ||
          e.status === 'Won / Order Confirmed' ||
          e.status === 'Won / Approved';
        const isLost =
          quote?.status === 'Declined' ||
          normStatus === 'Lost / Cancelled' ||
          e.status === 'Lost / Cancelled' ||
          e.status === 'Lost';
        matchQuoteLifecycle =
          !isWon &&
          !isLost &&
          (quote?.status === 'Sent' ||
            (normStatus === 'Sent / Pending Client' &&
              (quote ||
                e.attachments?.some((a) => a.name?.startsWith('QT-')) ||
                (e.quote_ref_no && e.quote_ref_no.startsWith('QT-')))));
      } else if (quoteLifecycleFilter === 'won') {
        const quote = e.id ? activeQuotationByEnquiryId.get(e.id) : null;
        const normStatus = normalizeEnquiryStatus(e.status);
        matchQuoteLifecycle =
          quote?.status === 'Approved' ||
          normStatus === 'Won / Order Confirmed' ||
          normStatus === 'Won / Approved' ||
          e.status === 'Won / Order Confirmed' ||
          e.status === 'Won / Approved';
      } else if (quoteLifecycleFilter === 'lost') {
        const quote = e.id ? activeQuotationByEnquiryId.get(e.id) : null;
        const normStatus = normalizeEnquiryStatus(e.status);
        matchQuoteLifecycle =
          quote?.status === 'Declined' ||
          normStatus === 'Lost / Cancelled' ||
          e.status === 'Lost / Cancelled' ||
          e.status === 'Lost';
      } else if (quoteLifecycleFilter === 'unquoted') {
        const quote = e.id ? activeQuotationByEnquiryId.get(e.id) : null;
        const hasFormal =
          (quote && quote.status !== 'Draft') ||
          e.attachments?.some((a) => a.name?.startsWith('QT-') && a.name?.endsWith('.pdf')) ||
          Boolean(e.quote_ref_no && /^QT-\d+/i.test(e.quote_ref_no));
        matchQuoteLifecycle = !hasFormal;
      }

      return matchText && matchStatus && matchRep && matchUrgency && matchSource && matchQuoteLifecycle;
    });
  }, [authorizedEnquiries, searchInput, searchQuery, statusFilter, salesPersonFilter, urgencyFilter, sourceFilter, quoteLifecycleFilter, activeQuotationByEnquiryId, companyMap, salespersonMap, salespersons]);

  // Sort Pipeline (Memoized independently from filtering)
  const sortedEnquiries = React.useMemo(() => {
    return [...filteredEnquiries].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'sn') {
        comparison = (Number(a?.sn) || 0) - (Number(b?.sn) || 0);
      } else if (sortField === 'enquiry_date') {
        const dateA = a?.enquiry_date || '';
        const dateB = b?.enquiry_date || '';
        comparison = dateA.localeCompare(dateB);
      } else if (sortField === 'value_aed') {
        comparison = (Number(a?.value_aed) || 0) - (Number(b?.value_aed) || 0);
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [filteredEnquiries, sortField, sortAsc]);

  // Detect missing S/N gaps across the workspace regardless of current sort column (DEF-21)
  const detectedWorkspaceSnGaps = React.useMemo(() => {
    const sns: number[] = [];
    const seen = new Set<number>();
    (authorizedEnquiries || []).forEach((e) => {
      const snNum = Number(e?.sn);
      if (!isNaN(snNum) && snNum > 0 && !seen.has(snNum)) {
        seen.add(snNum);
        sns.push(snNum);
      }
    });
    if (sns.length < 2) return [];
    sns.sort((a, b) => a - b);
    const missing: number[] = [];
    for (let i = 1; i < sns.length; i++) {
      const prev = sns[i - 1];
      const cur = sns[i];
      if (cur - prev > 1 && cur - prev <= 50) {
        for (let m = prev + 1; m < cur; m++) {
          if (!occupiedWorkspaceSns?.has(m) && !seen.has(m)) {
            missing.push(m);
          }
        }
      }
    }
    return missing;
  }, [authorizedEnquiries, occupiedWorkspaceSns]);

  const activeEnquiryFilterLabels = React.useMemo(() => {
    const labels: string[] = [];
    if (quoteLifecycleFilter !== 'all') {
      const pillMap: Record<QuoteLifecycleFilter, string> = {
        all: '',
        pending: 'Quotes: Pending',
        won: 'Quotes: Won / Accepted',
        lost: 'Quotes: Lost / Declined',
        unquoted: 'Quotes: Unquoted'
      };
      if (pillMap[quoteLifecycleFilter]) labels.push(pillMap[quoteLifecycleFilter]);
    }
    if (statusFilter !== 'All') labels.push(`Status: ${statusFilter}`);
    if (salesPersonFilter !== 'All') {
      const sp = (salespersons || []).find(s => s && ((s.id || s.initials) === salesPersonFilter));
      labels.push(`Rep: ${sp ? sp.full_name : salesPersonFilter}`);
    }
    if (sourceFilter !== 'All') labels.push(`Source: ${sourceFilter}`);
    if (urgencyFilter === 'Overdue') labels.push('Overdue Only');
    return labels;
  }, [quoteLifecycleFilter, statusFilter, salesPersonFilter, urgencyFilter, sourceFilter, salespersons]);

  const handleClearEnquiryFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('All');
    setSalesPersonFilter('All');
    setUrgencyFilter('All');
    setSourceFilter('All');
    setQuoteLifecycleFilter('all');
  };

  // Calculate pagination details
  const totalItems = sortedEnquiries.length;
  const pageSize = itemsPerPage === 'All' ? Math.max(totalItems, 1) : Number(itemsPerPage) || 25;
  const totalPages = itemsPerPage === 'All' ? 1 : Math.ceil(totalItems / pageSize) || 1;

  const paginatedEnquiries = React.useMemo(() => {
    if (itemsPerPage === 'All') return sortedEnquiries || [];
    const startIndex = (currentPage - 1) * pageSize;
    return (sortedEnquiries || []).slice(startIndex, startIndex + pageSize);
  }, [sortedEnquiries, currentPage, itemsPerPage, pageSize]);

  const [isSnGapBannerDismissed, setIsSnGapBannerDismissed] = useState(false);

  // Check whether inline sequence gap rows are already actively rendered in the current filtered/paginated table view
  const hasInlineGapRowsInCurrentView = React.useMemo(() => {
    if (sortField !== 'sn' || paginatedEnquiries.length < 2) return false;
    for (let i = 1; i < paginatedEnquiries.length; i++) {
      const prevSn = typeof paginatedEnquiries[i - 1]?.sn === 'number' ? paginatedEnquiries[i - 1].sn : null;
      const curSn = typeof paginatedEnquiries[i]?.sn === 'number' ? paginatedEnquiries[i].sn : null;
      if (prevSn !== null && curSn !== null) {
        const diff = sortAsc ? curSn - prevSn : prevSn - curSn;
        if (diff > 1 && diff <= 50) {
          const minSn = Math.min(prevSn, curSn);
          const maxSn = Math.max(prevSn, curSn);
          for (let m = minSn + 1; m < maxSn; m++) {
            if (!occupiedWorkspaceSns?.has(m)) return true;
          }
        }
      }
    }
    return false;
  }, [sortField, sortAsc, paginatedEnquiries, occupiedWorkspaceSns]);

  // Export Enquiries (Audited Section with Scope Selection, RFC 4180 Sanitization & Feedback)
  const handleExportCSV = () => {
    if (!canExportData(user, activeWorkspace)) {
      alert('Access Denied: Only Admins can export workspace data.');
      return;
    }
    setShowExportModal(true);
  };

  // Parsing pasted clipboard raw tab/comma CSV text
  const handleParseImportText = () => {
    if (!importText.trim()) return;
    const lines = importText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const separator = importText.includes('\t') ? '\t' : ',';
    const parsed: string[][] = [];

    lines.forEach((line) => {
      let parts: string[] = [];
      if (separator === '\t') {
        parts = line.split('\t').map((p) => p.replace(/^"|"$/g, '').trim());
      } else {
        parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^"|"$/g, '').trim());
      }
      parsed.push(parts);
    });

    if (parsed.length > 0) {
      setParsedRows(parsed);
      // Try to intelligently detect mapping indices if first row looks like a header
      const headers = parsed[0];
      const map = { sn: 0, quote_ref: 1, date: 2, sales_person: 3, client: 4, value: -1, status: -1 };
      
      headers.forEach((h, idx) => {
        const low = h.toLowerCase().trim();
        if (low.includes('s/n') || low.includes('sn') || low.includes('serial')) map.sn = idx;
        else if (low.includes('quote') || low.includes('ref') || low.includes('reference')) map.quote_ref = idx;
        else if (low.includes('date') || low.includes('listed') || low.includes('received') || low.includes('log')) map.date = idx;
        else if (low.includes('sales') || low.includes('person') || low.includes('rep') || low.includes('initials')) map.sales_person = idx;
        else if (low.includes('client') || low.includes('company') || low.includes('customer') || low.includes('account')) map.client = idx;
        else if (low.includes('value') || low.includes('aed') || low.includes('price') || low.includes('amount')) map.value = idx;
        else if (low.includes('status') || low.includes('stage')) map.status = idx;
      });
      setColumnMappings(map);
      setImportStep('preview');
    }
  };

  // Advanced Excel/CSV Confirmed Multi-Record Importer
  const handleBulkImport = async () => {
    const startIndex = hasHeader ? 1 : 0;
    if (parsedRows.length <= startIndex) {
      alert('No data rows to import!');
      return;
    }

    try {
      const batch = writeBatch(db);
      const rowsToProcess = parsedRows.slice(startIndex);

      for (let i = 0; i < rowsToProcess.length; i++) {
        const parts = rowsToProcess[i];
        if (parts.length === 0) continue;

        // Map SN
        const snVal = Number(parts[columnMappings.sn]);
        const snNum = isNaN(snVal) ? 3000 + i : snVal;

        // Map Quote Ref
        const quoteRef = parts[columnMappings.quote_ref] || `${snNum}-2026`;

        // Map Date
        const dateStr = parts[columnMappings.date] || new Date().toISOString().split('T')[0];

        // Map Rep initials
        const spInitials = parts[columnMappings.sales_person] || 'NS';

        // Map Client name
        const clientText = parts[columnMappings.client] || `${BRAND_CONFIG.shortName} ${BRAND_CONFIG.defaultClientName}`;

        // Map Value (AED)
        let valNum = 0;
        if (columnMappings.value !== -1 && parts[columnMappings.value]) {
          const rawVal = parts[columnMappings.value].replace(/[^0-9.]/g, '');
          const parsedValue = Number(rawVal);
          valNum = isNaN(parsedValue) ? 0 : parsedValue;
        }

        // Check if company is known
        const comp = companies.find(
          (c) =>
            c.canonical_name?.toLowerCase() === clientText.toLowerCase() ||
            c.display_name?.toLowerCase() === clientText.toLowerCase() ||
            c.aliases?.some((a) => a.toLowerCase() === clientText.toLowerCase())
        );
        const cId = comp?.id || 'comp_ionex'; // fall back to preloaded general client account
        const activeWorkspaceId = activeWorkspace?.id ?? 'ws_default';
        const now = new Date().toISOString();

        // Map Status
        let rowStatus: EnquiryStatus = 'Active';
        if (columnMappings.status !== undefined && columnMappings.status !== -1 && parts[columnMappings.status]) {
          const rawSt = parts[columnMappings.status].trim();
          rowStatus = normalizeEnquiryStatus(rawSt) as EnquiryStatus;
        }

        const record: Enquiry = {
          sn: snNum,
          workspace_id: activeWorkspaceId,
          workspaceId: activeWorkspaceId,
          enquiry_date: dateStr,
          sales_person: spInitials,
          company_id: cId,
          company_name: comp?.display_name || clientText,
          client_company: clientText,
          country: 'UAE',
          project_location: 'Sharjah',
          enquiry_source: 'Email',
          status: rowStatus,
          quote_ref_no: quoteRef,
          value_aed: valNum,
          line_items: [],
          created_by: user?.uid || 'system',
          createdBy: user?.displayName || user?.name || user?.email || 'User',
          created_by_uid: user?.uid || 'system',
          createdAt: now,
          created_at: now
        };

        const docRef = doc(collection(db, 'enquiries'));
        batch.set(docRef, record);
      }

      await batch.commit();
      alert(`Import complete! Successfully parsed and imported ${rowsToProcess.length} rows.`);
      setShowImport(false);
      setImportStep('input');
      setImportText('');
      window.location.reload();
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    }
  };

  const handleFillGap = React.useCallback(async (targetSn: number) => {
    if (isReservingGap === targetSn) return;
    setIsReservingGap(targetSn);
    try {
      const workspaceId = activeWorkspace?.id || 'default';
      const alreadyExists =
        Boolean(occupiedWorkspaceSns?.has(targetSn)) ||
        (enquiries || []).some(
          (e) =>
            !e.is_deleted &&
            (e.workspace_id === workspaceId || (!e.workspace_id && activeWorkspace?.is_default)) &&
            Number(e.sn) === targetSn
        );
      if (alreadyExists) {
        if (triggerToast) {
          triggerToast(`Sequence #${targetSn} is already occupied in this workspace.`, 'error');
        }
        return;
      }

      const gapDocId = `${workspaceId || 'default'}_gap_${targetSn}`;
      const gapRef = doc(db, 'enquiries', gapDocId);
      const now = new Date().toISOString();
      const today = now.split('T')[0];

      const gapDocData: any = {
        id: gapDocId,
        sn: targetSn,
        company_name: `[Reserved Sequence / #${targetSn}]`,
        company_id: '',
        country: 'United Arab Emirates',
        project_location: 'Dubai',
        enquiry_source: 'Direct',
        status: 'Gap / Reserved',
        workspace_id: workspaceId,
        workspaceId: workspaceId,
        created_at: now,
        createdAt: now,
        received_date: today,
        enquiry_date: today,
        logged_date: today,
        is_deleted: false,
        package_total: 0,
        value_aed: 0,
        currency: 'AED',
        is_gap_placeholder: true,
        line_items: [],
        sales_person: 'SYSTEM',
        createdBy: user?.displayName || user?.name || user?.email || 'User',
        created_by_uid: user?.uid || user?.id || 'system',
        remarks: 'Reserved sequence gap / missing record',
        updatedAt: now
      };

      await setDoc(gapRef, gapDocData, { merge: true });

      if (setEnquiries) {
        setEnquiries((prev) => {
          if (prev.some((e) => e.id === gapDocId || (Number(e.sn) === targetSn && !e.is_deleted))) {
            return prev.map((e) => (e.id === gapDocId || Number(e.sn) === targetSn ? (gapDocData as Enquiry) : e));
          }
          return [gapDocData as Enquiry, ...prev];
        });
      }

      if (triggerToast) {
        triggerToast(`Reserved sequence gap #${targetSn} created.`, 'success');
      }
    } catch (err: any) {
      console.error('Failed to reserve gap:', err);
      if (triggerToast) {
        triggerToast('Failed to reserve gap: ' + (err?.message || 'Unknown error'), 'error');
      }
    } finally {
      setIsReservingGap(null);
    }
  }, [isReservingGap, activeWorkspace, enquiries, occupiedWorkspaceSns, triggerToast, user, setEnquiries]);

  const handleReserveGapSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (isSubmittingGap) return;

    const snNum = Number(reserveGapSn);
    if (isNaN(snNum) || snNum <= 0) {
      alert('Please enter a valid numeric S/N greater than 0.');
      return;
    }

    const currentWorkspaceId = activeWorkspace?.id;
    const isOccupied =
      Boolean(occupiedWorkspaceSns?.has(snNum)) ||
      (enquiries || []).some(
        (e) =>
          !e.is_deleted &&
          (e.workspace_id === currentWorkspaceId || (!e.workspace_id && activeWorkspace?.is_default)) &&
          Number(e.sn) === snNum
      );

    if (isOccupied) {
      if (triggerToast) {
        triggerToast(`S/N #${snNum} is already occupied or reserved in this workspace.`, 'error');
      } else {
        alert(`S/N #${snNum} is already occupied or reserved in this workspace.`);
      }
      return;
    }

    try {
      setIsSubmittingGap(true);
      const activeWorkspaceId = activeWorkspace?.id || 'default';
      const now = new Date().toISOString();
      const recordDate = reserveGapDate || now.split('T')[0];
      const gapDocId = `${activeWorkspaceId}_gap_${snNum}`;

      const newGapDoc: any = {
        id: gapDocId,
        sn: snNum,
        status: 'Gap / Reserved',
        company_name: (reserveGapMemo || '').trim() ? `[Reserved Sequence / #${snNum}] ${(reserveGapMemo || '').trim()}` : `[Reserved Sequence / #${snNum}]`,
        quote_ref: (reserveGapMemo || '').trim(),
        quote_ref_no: (reserveGapMemo || '').trim(),
        value_aed: 0,
        currency: 'AED',
        workspace_id: activeWorkspaceId,
        workspaceId: activeWorkspaceId,
        created_at: now,
        createdAt: now,
        received_date: recordDate,
        enquiry_date: recordDate,
        logged_date: recordDate,
        is_deleted: false,
        is_gap_placeholder: true,
        package_total: 0,
        company_id: '',
        country: 'United Arab Emirates',
        project_location: 'Dubai',
        enquiry_source: 'Direct',
        remarks: (reserveGapMemo || '').trim() ? `[Reserved Gap] ${reserveGapMemo.trim()}` : 'Reserved sequence gap / missing record',
        line_items: [],
        sales_person: 'SYSTEM',
        createdBy: user?.displayName || user?.name || user?.email || 'User',
        created_by_uid: user?.uid || user?.id || 'system',
        updatedAt: now
      };

      const gapRef = doc(db, 'enquiries', gapDocId);
      await setDoc(gapRef, newGapDoc, { merge: true });

      if (setEnquiries) {
        setEnquiries((prev) => {
          if (prev.some((e) => e.id === gapDocId || (Number(e.sn) === snNum && !e.is_deleted))) {
            return prev.map((e) => (e.id === gapDocId || Number(e.sn) === snNum ? (newGapDoc as Enquiry) : e));
          }
          return [newGapDoc as Enquiry, ...prev];
        });
      }

      if (triggerToast) {
        triggerToast(`Reserved sequence gap #${snNum} created.`, 'success');
      }

      setShowReserveGapModal(false);
      setReserveGapSn('');
      setReserveGapMemo('');
    } catch (err: any) {
      console.error('Failed to reserve gap:', err);
      alert('Failed to reserve gap: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSubmittingGap(false);
    }
  };

  const PROPOSAL_STATUS_OPTIONS = ENQUIRY_STATUS_OPTIONS.map((opt) => ({
    value: opt,
    label: opt
  }));

  const handleStatusChange = React.useCallback(async (enquiry: Enquiry, newStatus: string) => {
    if (!enquiry.id || enquiry.status === newStatus) return;
    const prevStatus = enquiry.status || 'Active';
    const now = new Date().toISOString();
    const userName = user?.displayName || user?.name || user?.email || user?.id || 'User';

    const newHistoryEntry: EnquiryStatusHistoryEntry = {
      from: prevStatus,
      to: newStatus,
      timestamp: now,
      updatedBy: userName
    };

    const updatedHistory: EnquiryStatusHistoryEntry[] = [
      ...(enquiry.statusHistory || []),
      newHistoryEntry
    ];

    const sLower = newStatus.toLowerCase();
    const isSent = sLower.includes('sent');
    const isWon = sLower.includes('won') || sLower.includes('order received') || sLower.includes('approved');
    const isLost = isLostOrCancelledStatus(newStatus) || sLower.includes('lost') || sLower.includes('cancelled') || sLower.includes('dead');

    let linkedProjectCancelled = false;
    let releasedStockCount = 0;
    let reservedStockCount = 0;
    let nextStockReserved = enquiry.stock_reserved;
    let nextStockReservedAt = enquiry.stock_reserved_at;

    if (
      isWon &&
      !enquiry.stock_reserved &&
      enquiry.line_items?.some(
        (it) =>
          Boolean(it.product_id) ||
          (Array.isArray(it.sub_components) && it.sub_components.some((s) => Boolean(s.product_id)))
      )
    ) {
      try {
        const resResult = await reserveEnquiryStock(enquiry, user);
        if (resResult.reservedCount > 0) {
          reservedStockCount = resResult.reservedCount;
          nextStockReserved = true;
          nextStockReservedAt = now;
          if (onStockUpdated) {
            onStockUpdated();
          }
        }
      } catch (resErr) {
        console.warn('Failed reserving stock on status change to Won:', resErr);
      }
    }

    if (isLost) {
      // 1. Linked Project Status Cascade on Proposal Cancellation
      const linkedProjId = enquiry.project_id;
      if (linkedProjId) {
        try {
          await safeUpdateDoc('projects', linkedProjId, {
            status: 'Cancelled',
            cancellation_reason: `Cancelled via Proposal #${enquiry.sn || ''} table update`,
            updated_at: now
          });
          linkedProjectCancelled = true;
          if (setProjects) {
            setProjects((prev) =>
              prev.map((p) =>
                p.id === linkedProjId
                  ? {
                      ...p,
                      status: 'Cancelled',
                      cancellation_reason: `Cancelled via Proposal #${enquiry.sn || ''} table update`,
                      updated_at: now
                    }
                  : p
              )
            );
          }
        } catch (projErr) {
          console.error('Failed to update linked project on status cascade:', projErr);
        }
      }

      // 2. Stock Release
      const hasInventoriedItems = Boolean(
        enquiry.stock_reserved ||
        (enquiry.line_items &&
          enquiry.line_items.some(
            (it) =>
              Boolean(it.product_id) ||
              (Array.isArray(it.sub_components) && it.sub_components.some((s) => Boolean(s.product_id)))
          ))
      );

      if (hasInventoriedItems) {
        try {
          const relResult = await releaseEnquiryStock(enquiry, user);
          releasedStockCount = relResult.releasedCount;
          nextStockReserved = false;
          nextStockReservedAt = undefined;
          if (onStockUpdated) {
            onStockUpdated();
          }
        } catch (stockErr) {
          console.warn('Failed releasing stock on status change to Lost/Cancelled:', stockErr);
        }
      }
    }

    const updatedEnquiry: Enquiry = {
      ...enquiry,
      status: newStatus,
      stock_reserved: isLost ? false : nextStockReserved,
      stock_reserved_at: isLost ? undefined : nextStockReservedAt,
      statusUpdatedAt: now,
      statusUpdatedBy: userName,
      sentAt: (isSent && !enquiry.sentAt) ? now : enquiry.sentAt,
      wonAt: (isWon && !enquiry.wonAt) ? now : enquiry.wonAt,
      lostAt: (isLost && !enquiry.lostAt) ? now : enquiry.lostAt,
      statusHistory: updatedHistory,
      updatedAt: now
    };

    // Optimistic local state update
    if (setEnquiries) {
      setEnquiries((prev) => prev.map((e) => (e.id === enquiry.id ? updatedEnquiry : e)));
    }

    // Persist to repository and cloud
    try {
      await EnquiryRepository.save(updatedEnquiry);
      await safeSetDoc('enquiries', enquiry.id, updatedEnquiry);
      if (triggerToast) {
        if (linkedProjectCancelled) {
          triggerToast(`Status updated to "${newStatus}". Linked project cancelled and stock released.`, 'info');
        } else if (releasedStockCount > 0) {
          triggerToast(`Status updated to "${newStatus}". Released reserved stock for ${releasedStockCount} item(s).`, 'info');
        } else if (reservedStockCount > 0) {
          triggerToast(`Status updated to "${newStatus}". Reserved stock for ${reservedStockCount} catalog item(s).`, 'success');
        } else {
          triggerToast(`Status updated to "${newStatus}"`, 'success');
        }
      }
    } catch (err: any) {
      console.error('Failed to update enquiry status:', err);
      if (triggerToast) {
        triggerToast('Failed to save status change to cloud', 'error');
      }
    }
  }, [user, setProjects, onStockUpdated, setEnquiries, triggerToast]);

  const handleSelectEnquiry = React.useCallback((id: string) => {
    if (onSelectEnquiry) {
      onSelectEnquiry(id);
    }
  }, [onSelectEnquiry]);

  const handleEditEnquiryRow = React.useCallback((e: Enquiry) => {
    if (onEditEnquiry) {
      onEditEnquiry(e);
    }
  }, [onEditEnquiry]);

  const handleToggleSelectRow = React.useCallback((id: string, checked: boolean) => {
    if (checked) {
      setSelectedEnquiryIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedEnquiryIds((prev) => prev.filter((item) => item !== id));
    }
  }, []);

  const handleDeleteRow = React.useCallback((e: Enquiry) => {
    const targetId = e.id || (e as any)._id;
    if (!targetId) {
      alert('Error: Enquiry ID is missing. Cannot delete.');
      return;
    }

    // Active project guard: block deletion if linked to an active project
    if (e.project_id) {
      const linkedProj = projects?.find((p) => p.id === e.project_id || p.enquiry_id === targetId);
      const isCancelled = linkedProj ? linkedProj.status === 'Cancelled' : false;
      if (!isCancelled) {
        const errorMsg = `Cannot delete Proposal #${e.sn}: An active project is linked. Please cancel the project first.`;
        if (triggerToast) {
          triggerToast(errorMsg, 'error');
        } else {
          alert(errorMsg);
        }
        return;
      }
    }

    const isPlaceholder = Boolean(
      e.is_gap_placeholder === true ||
      (e.status && (e.status === 'Gap / Reserved' || e.status.toUpperCase() === 'GAP / RESERVED')) ||
      (e.company_name && e.company_name.includes('[Reserved Sequence'))
    );
    setConfirmDialog({
      isOpen: true,
      title: isPlaceholder ? 'Delete Reserved Gap' : 'Move to Recycle Bin',
      message: isPlaceholder
        ? `Are you sure you want to delete reserved gap #${e.sn}? This sequence slot will immediately revert back to an open missing sequence gap.`
        : `Are you sure you want to move Enquiry #${e.sn} to the Recycle Bin? You can restore it anytime from the sidebar.`,
      confirmText: isPlaceholder ? 'Delete' : 'Move to Bin',
      cancelText: 'Cancel',
      variant: isPlaceholder ? 'destructive' : 'warning',
      isDestructive: isPlaceholder,
      onConfirm: async () => {
        if (isPlaceholder) {
          try {
            await deleteDoc(doc(db, 'enquiries', targetId));
          } catch (delErr) {
            console.warn('Direct deleteDoc failed, trying safeDeleteDoc:', delErr);
            await safeDeleteDoc('enquiries', targetId);
          }
          if (setEnquiries) {
            setEnquiries((prev) => prev.filter((item) => item.id !== targetId));
          }
          if (triggerToast) {
            triggerToast(`Reserved sequence gap #${e.sn} deleted. Sequence slot reopened.`, 'info');
          }
        } else {
          onDeleteEnquiry(targetId);
        }
      }
    });
  }, [projects, triggerToast, setConfirmDialog, setEnquiries, onDeleteEnquiry]);

  return (
    <>
      <PageHeader
        title="Enquiries Registry"
        subtitle={`Maintain ${BRAND_CONFIG.shortName} sales proposals, track delivery lead times, and update customer status.`}
        icon={FileText}
        badge={{ text: `${authorizedEnquiries.length} Proposals`, variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={
          isEditable
            ? {
                label: 'Add Enquiry',
                icon: Plus,
                onClick: onAddEnquiry
              }
            : undefined
        }
        secondaryActions={[
          {
            label: isMarkingMode ? 'Exit Marking Mode' : 'Mark / Select',
            icon: CheckSquare,
            onClick: () => {
              const next = !isMarkingMode;
              setIsMarkingMode(next);
              if (!next) setSelectedEnquiryIds([]);
            }
          },
          ...(isEditable
            ? [
                {
                  label: 'Reserve Gap',
                  icon: Plus,
                  onClick: () => {
                    setReserveGapSn('');
                    setReserveGapMemo('');
                    setReserveGapDate(new Date().toISOString().split('T')[0]);
                    setShowReserveGapModal(true);
                  }
                },
                {
                  label: 'Claim Ref',
                  icon: Hash,
                  onClick: () => setShowQuickClaimModal(true)
                }
              ]
            : []),
          ...(isAdmin(user, activeWorkspace)
            ? [
                {
                  label: 'Import',
                  icon: Upload,
                  onClick: () => setShowImport(true)
                }
              ]
            : []),
          ...(canExportData(user, activeWorkspace)
            ? [
                {
                  label: 'Export CSV',
                  icon: Download,
                  onClick: handleExportCSV
                }
              ]
            : [])
        ]}
      />

      <PageBody>

      {/* Top 4-Card KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiStatCard
          label="Active Pipeline"
          value={`AED ${lifecycleCounts.activePipelineValueAed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          subtext={`${lifecycleCounts.all - lifecycleCounts.won - lifecycleCounts.lost} open enquiries · ${lifecycleCounts.unquoted} unquoted`}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="blue"
          onClick={() => setQuoteLifecycleFilter('all')}
          active={quoteLifecycleFilter === 'all'}
        />

        <KpiStatCard
          label="Actionable Proposals"
          value={`AED ${lifecycleCounts.pendingQuotesValueAed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          subtext={`${lifecycleCounts.pending} formal ${lifecycleCounts.pending === 1 ? 'offer' : 'offers'} awaiting client decision`}
          icon={<FileText className="w-5 h-5" />}
          tone="indigo"
          onClick={() => setQuoteLifecycleFilter('pending')}
          active={quoteLifecycleFilter === 'pending'}
        />

        <KpiStatCard
          label="Won Orders"
          value={`AED ${lifecycleCounts.wonValueAed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          subtext={`${lifecycleCounts.won} won · ${lifecycleCounts.winRatePct}% conversion rate`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          tone="emerald"
          onClick={() => setQuoteLifecycleFilter('won')}
          active={quoteLifecycleFilter === 'won'}
        />

        <KpiStatCard
          label="Conversion & Health"
          value={`${lifecycleCounts.overdueFollowups} Overdue`}
          subtext={urgencyFilter === 'Overdue' ? 'Showing overdue follow-ups (click to reset)' : 'Click to filter overdue follow-ups'}
          icon={<Activity className="w-5 h-5" />}
          tone={lifecycleCounts.overdueFollowups > 0 ? 'amber' : 'slate'}
          onClick={() => setUrgencyFilter(urgencyFilter === 'Overdue' ? 'All' : 'Overdue')}
          active={urgencyFilter === 'Overdue'}
        />
      </div>

      {/* Structured Filtering Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
            <Filter className="w-4 h-4" />
            <span>Faceted Search & Filters</span>
          </div>
          {(activeEnquiryFilterLabels.length > 0 || searchInput.trim() !== '') && (
            <button
              type="button"
              onClick={handleClearEnquiryFilters}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Quotation Lifecycle Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Enquiries', count: lifecycleCounts.all },
            { id: 'pending', label: 'Pending Quotes', count: lifecycleCounts.pending },
            { id: 'won', label: 'Won / Accepted', count: lifecycleCounts.won },
            { id: 'lost', label: 'Lost / Declined', count: lifecycleCounts.lost },
            { id: 'unquoted', label: 'Unquoted', count: lifecycleCounts.unquoted }
          ].map((pill) => {
            const isActive = quoteLifecycleFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setQuoteLifecycleFilter(pill.id as QuoteLifecycleFilter)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-xs ring-2 ring-slate-900/10 dark:ring-white/10'
                    : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? 'bg-white/20 text-current'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full">
          {/* Text search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by SN, quote reference, account name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition"
            />
          </div>

          {/* Status selector */}
          <div className="flex-1 min-w-[140px]">
            <div className="relative flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl shadow-xs h-11 w-full transition">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="appearance-none w-full bg-transparent pl-4 pr-10 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value="All" className="font-semibold text-slate-900 dark:text-slate-100">All Statuses</option>
                {PIPELINE_STATUS_GROUPS.map((group) => (
                  <optgroup
                    key={group.label}
                    label={group.label}
                    className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]"
                  >
                    {group.options.map((st) => (
                      <option
                        key={st}
                        value={st}
                        className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 normal-case font-sans text-xs font-normal"
                      >
                        {st}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Salesperson selector */}
          <div className="flex-1 min-w-[140px]">
            <div className="relative flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl shadow-xs h-11 w-full transition">
              <select
                value={salesPersonFilter}
                onChange={(e) => setSalesPersonFilter(e.target.value)}
                className="appearance-none w-full bg-transparent pl-4 pr-10 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value="All">All Reps</option>
                {(availableSalespersons || []).filter(Boolean).map((s, idx) => (
                  <option key={s.id || `${s.initials || ''}-${s.full_name || ''}-${idx}`} value={s.id || s.initials || ''}>
                    {(s.initials || getInitials(s.full_name || ''))} - {s.full_name || 'Unnamed Rep'}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Source selector */}
          <div className="flex-1 min-w-[140px]">
            <div className="relative flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl shadow-xs h-11 w-full transition">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="appearance-none w-full bg-transparent pl-4 pr-10 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value="All">All Sources</option>
                {availableSources.map((src) => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Urgency follow-up toggle (Interactive Pill Toggle) */}
          <div className="flex-1 min-w-[140px]">
            <button
              type="button"
              onClick={() => setUrgencyFilter(urgencyFilter === 'All' ? 'Overdue' : 'All')}
              className={`w-full flex items-center justify-center space-x-1.5 h-11 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shadow-xs cursor-pointer ${
                urgencyFilter === 'Overdue'
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-bold ring-2 ring-rose-500/20'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
              title="Click to toggle overdue followups filter"
            >
              <Clock className={`w-3.5 h-3.5 ${urgencyFilter === 'Overdue' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`} />
              <span>{urgencyFilter === 'Overdue' ? 'Overdue Only' : 'Overdue Filter'}</span>
              {urgencyFilter === 'Overdue' && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Redundant SearchResultCounter removed per clean B2B table overhaul */}

        {/* Compact, Dismissible Missing S/N Sequence Gap Indicator (hidden when inline gap rows are already rendered in current table view) */}
        {detectedWorkspaceSnGaps.length > 0 && !hasInlineGapRowsInCurrentView && !isSnGapBannerDismissed && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60 text-[11px]">
            <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-medium min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="truncate">
                <strong className="font-bold">Missing S/N Gaps ({detectedWorkspaceSnGaps.length}):</strong>{' '}
                {detectedWorkspaceSnGaps
                  .slice(0, 6)
                  .map((sn) => `#${sn}`)
                  .join(', ')}
                {detectedWorkspaceSnGaps.length > 6 ? ` +${detectedWorkspaceSnGaps.length - 6} more` : ''}
              </span>
              {sortField !== 'sn' && (
                <span className="text-[10.5px] text-amber-700 dark:text-amber-300/80 hidden md:inline shrink-0">
                  (Sorted by {sortField === 'enquiry_date' ? 'Date' : 'Value'})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {sortField !== 'sn' && (
                <button
                  type="button"
                  onClick={() => {
                    setSortField('sn');
                    setSortAsc(false);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-semibold hover:bg-amber-100/60 transition text-[10.5px] cursor-pointer"
                >
                  Sort by S/N
                </button>
              )}
              {isEditable && (
                <button
                  type="button"
                  disabled={isReservingGap === detectedWorkspaceSnGaps[0]}
                  onClick={() => handleFillGap(detectedWorkspaceSnGaps[0])}
                  className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition text-[10.5px] disabled:opacity-50 cursor-pointer"
                >
                  {isReservingGap === detectedWorkspaceSnGaps[0]
                    ? 'Reserving...'
                    : `Reserve #${detectedWorkspaceSnGaps[0]}`}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSnGapBannerDismissed(true)}
                className="p-0.5 rounded-md text-amber-700/70 hover:text-amber-950 hover:bg-amber-200/60 transition cursor-pointer"
                title="Dismiss S/N Gap Notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table Layout */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        {filteredEnquiries.length > 0 ? (
          <>
            <div className="w-full overflow-x-hidden max-h-[calc(100vh-250px)] overflow-y-auto relative border-b border-slate-200 dark:border-slate-800">
            <table className="w-full table-fixed text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 sticky top-0 z-20 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] select-none">
                <tr>
                  {isMarkingMode && (
                    <th className="py-2.5 px-2 w-9 text-center bg-slate-50 dark:bg-slate-900">
                      <input
                        type="checkbox"
                        checked={paginatedEnquiries.length > 0 && paginatedEnquiries.every((e) => selectedEnquiryIds.includes(e.id!))}
                        onChange={(e) => {
                          const pageIds = paginatedEnquiries.map((eq) => eq.id!).filter(Boolean);
                          if (e.target.checked) {
                            setSelectedEnquiryIds((prev) => {
                              const union = [...prev];
                              pageIds.forEach((id) => {
                                if (!union.includes(id)) union.push(id);
                              });
                              return union;
                            });
                          } else {
                            setSelectedEnquiryIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                          }
                        }}
                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Select all on current page"
                      />
                    </th>
                  )}
                  <th onClick={() => handleSort('sn')} className="py-2.5 px-2 w-[6%] text-center cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition bg-slate-50 dark:bg-slate-900 whitespace-nowrap">
                    <div className="flex items-center space-x-1 justify-center">
                      <span>S/N</span>
                      <ArrowUpDown className="w-3 h-3 shrink-0 opacity-70" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 w-[23%] truncate bg-slate-50 dark:bg-slate-900">Company Account</th>
                  <th className="py-2.5 px-2.5 w-[19%] truncate bg-slate-50 dark:bg-slate-900">Quote Ref No</th>
                  <th className="py-2.5 px-1.5 w-[6%] text-center truncate bg-slate-50 dark:bg-slate-900">Rep</th>
                  <th onClick={() => handleSort('enquiry_date')} className="py-2.5 px-2 w-[10%] cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition whitespace-nowrap bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center space-x-1">
                      <span>Date</span>
                      <ArrowUpDown className="w-3 h-3 shrink-0 opacity-70" />
                    </div>
                  </th>
                  <th className="py-2.5 px-2 w-[13%] truncate bg-slate-50 dark:bg-slate-900">Status</th>
                  <th onClick={() => handleSort('value_aed')} className="py-2.5 pl-2 pr-5 w-[11%] cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center space-x-1 justify-end">
                      <span>Value</span>
                      <ArrowUpDown className="w-3 h-3 shrink-0 opacity-70" />
                    </div>
                  </th>
                  <th className="py-2.5 pl-2 pr-3 w-[136px] text-right truncate bg-slate-50 dark:bg-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-sans">
                {paginatedEnquiries.map((e, index) => {
                  if (!e) return null;
                  const companyName = (e.company_id ? companyMap.get(e.company_id) : '') || (e as any)?.company_name || (e as any)?.client_company || 'Unknown Client';
                  const isChecked = Boolean(e.id && selectedEnquiryIds.includes(e.id));
                  const resolvedComp = resolveCompanyForEnquiry(e);
                  const salesperson = resolveSalespersonForEnquiry(e);
                  const canEdit = canEditEnquiry(user, activeWorkspace, e);
                  const canDelete = canDeleteEnquiry(user, activeWorkspace, e);
                  const isCreatorOnly = isCreatorOnlyViewer(user, e, activeWorkspace, salespersons);

                  // In-Table Gap Detector: Compare S/N of current row with previous row
                  let prevSn: number | null = null;
                  let curSn: number | null = null;
                  if (sortField === 'sn' && index > 0) {
                    const prevRow = paginatedEnquiries[index - 1];
                    prevSn = typeof prevRow?.sn === 'number' ? prevRow.sn : null;
                    curSn = typeof e.sn === 'number' ? e.sn : null;
                  }

                  return (
                    <React.Fragment key={e.id || index}>
                      <GapDetectorRow
                        prevSn={prevSn}
                        curSn={curSn}
                        sortAsc={sortAsc}
                        isMarkingMode={isMarkingMode}
                        isEditable={isEditable}
                        isReservingGap={isReservingGap}
                        occupiedWorkspaceSns={occupiedWorkspaceSns}
                        onFillGap={handleFillGap}
                      />
                      <EnquiryTableRow
                        enquiry={e}
                        isChecked={isChecked}
                        isMarkingMode={isMarkingMode}
                        isEditable={isEditable}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        canViewConfidentialMargins={canViewConfidentialMargins}
                        isCreatorOnly={isCreatorOnly}
                        companyName={companyName}
                        resolvedCompany={resolvedComp}
                        salesperson={salesperson}
                        companies={companies || []}
                        setCompanies={setCompanies}
                        onToggleSelect={handleToggleSelectRow}
                        onSelectEnquiry={handleSelectEnquiry}
                        onEditEnquiry={handleEditEnquiryRow}
                        onDeleteEnquiry={handleDeleteRow}
                        onStatusChange={handleStatusChange}
                        onCompanyClick={handleCompanyClick}
                        activeQuotation={e.id ? activeQuotationByEnquiryId.get(e.id) : null}
                      />
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {totalItems > 0 && (
            <div className="px-5 py-3.5 bg-slate-50/60 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="text-xs font-mono text-slate-600">
                Showing <span className="font-bold text-slate-900">{Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}</span> to{' '}
                <span className="font-bold text-slate-900">{Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}</span> of{' '}
                <span className="font-bold text-slate-900">{totalItems}</span> enquiries
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500 font-sans">Rows per page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      const val = e.target.value;
                      setItemsPerPage(val === 'All' ? 'All' : Number(val));
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value="All">All</option>
                  </select>
                </div>

                {totalPages > 1 && itemsPerPage !== 'All' && (
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>

                    <span className="text-xs font-mono px-2.5 text-slate-600">
                      Page <span className="font-bold text-slate-900">{currentPage}</span> of{' '}
                      <span className="font-bold text-slate-900">{totalPages}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                      title="Next Page"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="py-16 px-4 text-center font-sans">
            {searchInput || statusFilter !== 'All' || salesPersonFilter !== 'All' || urgencyFilter !== 'All' || sourceFilter !== 'All' || quoteLifecycleFilter !== 'all' ? (
              <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
                  <Search className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  No Enquiries Match Your Filter
                </h4>
                <p className="text-xs text-slate-500">
                  {searchInput.trim() ? (
                    <>
                      No enquiries match <span className="font-semibold text-slate-800">&ldquo;{searchInput.trim()}&rdquo;</span>.
                    </>
                  ) : (
                    <>No enquiries match the active status, urgency, source, or salesperson filters.</>
                  )}{' '}
                  Reset your filters to restore the full enquiries log.
                </p>
                <button
                  type="button"
                  onClick={handleClearEnquiryFilters}
                  className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Search / Reset Filters</span>
                </button>
              </div>
            ) : (
              <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  No Enquiries Logged in This Workspace Yet
                </h4>
                <p className="text-xs text-slate-500">
                  Create your first commercial enquiry or RFQ to track quotations, technical submittals, supplier POs, and project fulfillment.
                </p>
                {isEditable && (
                  <button
                    type="button"
                    onClick={onAddEnquiry}
                    className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create First Enquiry</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: EXCEL IMPORT CONSOLE (PREVIEW AND MAPPING SUPPORT) */}
      {showImport && (
        <div id="import-form-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-8 shadow-2xl relative space-y-6 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowImport(false);
                setImportStep('input');
                setImportText('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 pb-3 border-b border-slate-200">
              <Upload className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-bold text-slate-900 font-sans">Advanced Excel Columns Importer</h3>
            </div>

            {importStep === 'input' ? (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-normal font-sans space-y-2">
                  <span className="font-bold text-slate-800 block">How to Import:</span>
                  <p>
                    Paste columns copied directly from your Excel sheet or a standard CSV log. You can separate columns using **tabs** or **commas**.
                  </p>
                  <label className="flex items-center space-x-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(e) => setHasHeader(e.target.checked)}
                      className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-slate-700">First row represents the headers of columns</span>
                  </label>
                </div>

                <div className="space-y-4">
                  <textarea
                    rows={8}
                    placeholder={`S/N	Quote Ref No	Received Date	Sales Person	Client Company	AED Value
1990	1963-020124	2024-01-02	PV	Apex Industrial Trading	145000
1991	1964-020124	2024-01-03	NS	Global Logistics Corp	72000`}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-3 px-4 text-xs font-mono text-slate-800 placeholder:text-slate-300 focus:outline-none"
                  />

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowImport(false)}
                      className="w-1/2 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 font-medium rounded-xl text-xs transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleParseImportText}
                      disabled={!importText.trim()}
                      className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition disabled:opacity-50 shadow-sm"
                    >
                      Next: Map & Preview Columns
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-normal space-y-3">
                  <span className="font-bold text-slate-800 block uppercase font-mono text-[10px]">Map Columns to Fields:</span>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">S/N</label>
                      <select
                        value={columnMappings.sn}
                        onChange={(e) => setColumnMappings({ ...columnMappings, sn: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Quote Ref</label>
                      <select
                        value={columnMappings.quote_ref}
                        onChange={(e) => setColumnMappings({ ...columnMappings, quote_ref: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Received Date</label>
                      <select
                        value={columnMappings.date}
                        onChange={(e) => setColumnMappings({ ...columnMappings, date: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Sales Person</label>
                      <select
                        value={columnMappings.sales_person}
                        onChange={(e) => setColumnMappings({ ...columnMappings, sales_person: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Client Company</label>
                      <select
                        value={columnMappings.client}
                        onChange={(e) => setColumnMappings({ ...columnMappings, client: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Package Value</label>
                      <select
                        value={columnMappings.value}
                        onChange={(e) => setColumnMappings({ ...columnMappings, value: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        <option value={-1}>-- No Value (AED 0) --</option>
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Status</label>
                      <select
                        value={columnMappings.status ?? -1}
                        onChange={(e) => setColumnMappings({ ...columnMappings, status: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        <option value={-1}>-- Default (Active) --</option>
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">Live Confirmation Preview (First 5 Rows):</span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-[11px] font-sans">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono text-slate-400 uppercase">
                          <th className="p-2">S/N</th>
                          <th className="p-2">Quote Ref</th>
                          <th className="p-2">Date</th>
                          <th className="p-2">Rep</th>
                          <th className="p-2">Company Name Match</th>
                          <th className="p-2 text-right">Value (AED)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {parsedRows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 5).map((parts, rowIdx) => {
                          const snVal = parts[columnMappings.sn];
                          const quoteRef = parts[columnMappings.quote_ref];
                          const dateVal = parts[columnMappings.date];
                          const repVal = parts[columnMappings.sales_person];
                          const clientText = parts[columnMappings.client];
                          
                          let rawVal = 0;
                          if (columnMappings.value !== -1 && parts[columnMappings.value]) {
                            rawVal = Number(parts[columnMappings.value].replace(/[^0-9.]/g, ''));
                          }

                          const matchedComp = companies.find(
                            (c) => c.canonical_name.toLowerCase() === (clientText || '').toLowerCase() || c.aliases.some((a) => a.toLowerCase() === (clientText || '').toLowerCase())
                          );

                          return (
                            <tr key={rowIdx} className="hover:bg-slate-50/50">
                              <td className="p-2 font-mono font-semibold">#{snVal || 'Auto'}</td>
                              <td className="p-2 font-mono">{quoteRef || '—'}</td>
                              <td className="p-2 font-mono">{dateVal || '—'}</td>
                              <td className="p-2 font-mono">{repVal || '—'}</td>
                              <td className="p-2">
                                {matchedComp ? (
                                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                    ✓ {matchedComp.display_name}
                                  </span>
                                ) : clientText ? (
                                  <span className="text-blue-700 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                    {clientText}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">
                                    Default {BRAND_CONFIG.shortName} Client
                                  </span>
                                )}
                              </td>
                              <td className="p-2 font-mono text-right font-semibold">
                                {rawVal.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => setImportStep('input')}
                    className="w-1/3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium rounded-xl text-xs transition"
                  >
                    Back to text
                  </button>
                  <button
                    onClick={handleBulkImport}
                    className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center justify-center space-x-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm & Import {parsedRows.length - (hasHeader ? 1 : 0)} Records</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FLOATING CONTEXTUAL BULK ACTION BAR (Shown only when Marking Mode is active) */}
      {isMarkingMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-950 text-white rounded-2xl shadow-2xl py-3 px-5 border border-slate-800 flex items-center space-x-6 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center space-x-2">
            {selectedEnquiryIds.length > 0 ? (
              <span className="text-xs font-semibold text-slate-300">
                Selected <span className="text-white font-bold bg-slate-800 px-2 py-0.5 rounded font-mono tabular-nums">{selectedEnquiryIds.length}</span> enquiries
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-300">
                Marking Mode active — Select rows using checkboxes
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2.5">
            {selectedEnquiryIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedEnquiryIds([])}
                className="py-1 px-3 bg-transparent border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold font-sans transition cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedEnquiryIds([]);
                setIsMarkingMode(false);
              }}
              className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold font-sans transition cursor-pointer"
            >
              Done Marking
            </button>
            {selectedEnquiryIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: 'Move Selected to Recycle Bin',
                    message: `Are you sure you want to move all ${selectedEnquiryIds.length} selected enquiries to the Recycle Bin? You can restore them anytime from the sidebar.`,
                    confirmText: 'Move to Bin',
                    cancelText: 'Cancel',
                    variant: 'warning',
                    isDestructive: false,
                    onConfirm: () => {
                      onBulkDeleteEnquiries(selectedEnquiryIds);
                      setSelectedEnquiryIds([]);
                    }
                  });
                }}
                className="py-1 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold font-sans transition flex items-center space-x-1 shadow-sm cursor-pointer"
              >
                <Trash className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-6">{confirmDialog.message}</p>
            <div className="flex items-center justify-end space-x-3 font-sans">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer ${
                  confirmDialog.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : confirmDialog.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback 360 Modal if not intercepted by parent handler */}
      {selected360CompanyId && !onOpenCompany360 && (
        <Company360Modal
          companyId={selected360CompanyId}
          companies={companies}
          setCompanies={setCompanies}
          contacts={contacts}
          salespersons={salespersons}
          enquiries={enquiries}
          callLogs={[]}
          user={user}
          onClose={() => setSelected360CompanyId(null)}
          onOpenActivityDrawer={onOpenActivityDrawer}
          onInitiateActivity={onInitiateActivity}
        />
      )}

      {/* Audited Enquiry Export Modal with Scope & Format Configuration */}
      <EnquiryExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        filteredEnquiries={filteredEnquiries}
        allEnquiries={authorizedEnquiries}
        companies={companies}
        contacts={contacts}
        salespersons={salespersons}
        activeFilterLabels={activeEnquiryFilterLabels}
        searchQuery={searchInput || searchQuery}
        onSuccess={(result) => {
          if (triggerToast) {
            triggerToast(
              `Successfully exported ${result.enquiriesCount} enquiries (${result.lineItemsCount} items) to CSV`,
              'success'
            );
          }
        }}
      />

      {/* Quick Claim Sequential Quote Reference Modal */}
      <QuickClaimModal
        isOpen={showQuickClaimModal}
        onClose={() => setShowQuickClaimModal(false)}
        activeWorkspace={activeWorkspace}
        user={user}
        salespersons={salespersons}
        companies={companies}
        enquiries={enquiries}
        triggerToast={triggerToast}
        onSuccess={(claimedEnquiry) => {
          if (onSelectEnquiry && claimedEnquiry.id) {
            onSelectEnquiry(claimedEnquiry.id);
          }
        }}
      />

      {/* Reserve Gap Modal */}
      {showReserveGapModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  #
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-sans">
                    Reserve Sequence Gap
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hold an unused sequential S/N or mark missing file folders
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReserveGapModal(false);
                  setReserveGapSn('');
                  setReserveGapMemo('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReserveGapSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  S/N Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={reserveGapSn}
                  onChange={(e) => setReserveGapSn(e.target.value)}
                  placeholder="e.g. 25"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Quote Ref / Memo <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={reserveGapMemo}
                  onChange={(e) => setReserveGapMemo(e.target.value)}
                  placeholder="e.g. 2798 or Missing physical folder"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-sans text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={reserveGapDate}
                  onChange={(e) => setReserveGapDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <span className="text-base leading-none">ℹ️</span>
                <span className="leading-relaxed">
                  This will register S/N #{reserveGapSn || '—'} with status <strong>Gap / Reserved</strong>. No automatic S/N counter jumps will be triggered. You can claim or update this record anytime.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingGap}
                  onClick={() => {
                    setShowReserveGapModal(false);
                    setReserveGapSn('');
                    setReserveGapMemo('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGap || !reserveGapSn}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingGap ? (
                    <span>Reserving...</span>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Reserve Gap</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageBody>
  </>
);
}
