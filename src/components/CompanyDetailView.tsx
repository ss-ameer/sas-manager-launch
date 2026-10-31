import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Users2,
  Phone,
  Mail,
  MapPin,
  Plus,
  Trash2,
  X,
  Merge,
  Edit,
  ExternalLink,
  FileText,
  PhoneCall,
  Zap,
  Sparkles,
  Tag,
  Clock,
  MessageSquare
} from 'lucide-react';
import { CompanyActivityTimeline } from './common/CompanyActivityTimeline';
import LiveExecutionModal from './LiveExecutionModal';
import { CallLogRepository } from '../services/repositories/CallLogRepository';
import { QuotationRepository } from '../services/repositories/QuotationRepository';
import { ProcurementRepository } from '../services/repositories/ProcurementRepository';
import {
  Company,
  Contact,
  Enquiry,
  UserProfile,
  CallLogEntry,
  Salesperson,
  Workspace,
  QuotationDocumentRecord,
  SupplierBill,
  getContactPhones,
  getContactEmails,
  getCompanyPhones,
  getCompanyEmails
} from '../types';
import { getReferenceId } from '../utils/refId';
import { getLineRestriction } from './ContactModal';
import TemperatureBadge from './TemperatureBadge';
import GoogleSearchButton from './common/GoogleSearchButton';
import { IndustryBadge, formatSubTypeName } from '../utils/taxonomy';
import { canUserClickRecord, getSalespersonFullName } from '../utils/permissions';
import { isScheduledTask } from '../utils/activityLogic';
import { sanitizeWhatsAppNumber, getWhatsAppUrl } from '../utils/defaults';
import { useActivityLauncher } from '../context/ActivityLauncherContext';

export const DETAIL_HEADER_CLASSES = "text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono";
export const DETAIL_EMPTY_FALLBACK_CLASSES = "text-sm font-medium text-slate-600 dark:text-slate-300 not-italic font-sans";
export const DETAIL_EMPTY_CONTAINER_CLASSES = "bg-slate-50 dark:bg-slate-800/50 rounded-md p-2.5 border border-slate-200 dark:border-slate-700";

export interface EmptyDetailFieldProps {
  label: string;
  fallbackText: string;
  className?: string;
}

export const EmptyDetailField: React.FC<EmptyDetailFieldProps> = ({
  label,
  fallbackText,
  className = ''
}) => (
  <div className={`space-y-2 ${className}`}>
    <span className={DETAIL_HEADER_CLASSES}>{label}</span>
    <div className={DETAIL_EMPTY_CONTAINER_CLASSES}>
      <span className={DETAIL_EMPTY_FALLBACK_CLASSES}>{fallbackText}</span>
    </div>
  </div>
);

function formatHistoryDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ' - ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return dateStr;
  }
}

export interface CompanyDetailViewProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company | null;
  companies: Company[];
  contacts: Contact[];
  callLogs?: CallLogEntry[];
  enquiries?: Enquiry[];
  salespersons?: Salesperson[];
  user: UserProfile;
  isEditable?: boolean;
  isBasicTier?: boolean;
  activeWorkspace?: Workspace;
  onInitiateActivity?: (options: any) => void;
  onOpenCompany360?: (companyId: string) => void;
  onOpenEditCompany?: (company: Company) => void;
  onSelectEnquiry?: (id: string) => void;
  onSelectCallLog?: (log: CallLogEntry) => void;
  onEditCallLog?: (log: CallLogEntry) => void;
  onExecuteTask?: (task: CallLogEntry) => void;
  onAddContact?: (companyId: string) => void;
  onEditContact?: (contact: Contact, companyId: string) => void;
  onDeleteContact?: (contactId: string) => void;
  onOpenMerge?: (companyId: string) => void;
  onDeleteCompany?: (companyId: string) => void;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
}

export const CompanyDetailView: React.FC<CompanyDetailViewProps> = ({
  isOpen,
  onClose,
  company,
  companies,
  contacts,
  callLogs = [],
  enquiries = [],
  salespersons = [],
  user,
  isEditable = true,
  isBasicTier = false,
  activeWorkspace,
  onInitiateActivity,
  onOpenCompany360,
  onOpenEditCompany,
  onSelectEnquiry,
  onSelectCallLog,
  onEditCallLog,
  onExecuteTask,
  onAddContact,
  onEditContact,
  onDeleteContact,
  onOpenMerge,
  onDeleteCompany,
  setCompanies,
  setContacts,
  setCallLogs
}) => {
  const activityLauncher = useActivityLauncher();

  const triggerActivity = (opts: any) => {
    if (onInitiateActivity) {
      onInitiateActivity(opts);
    } else if (activityLauncher?.initiateActivity) {
      activityLauncher.initiateActivity(opts);
    }
  };

  // Retractable activity history drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeExecutionTask, setActiveExecutionTask] = useState<CallLogEntry | null>(null);

  // ESC key listener to dismiss drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isHistoryOpen) {
          setIsHistoryOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isHistoryOpen]);

  useEffect(() => {
    setIsHistoryOpen(false);
  }, [company?.id, isOpen]);

  const isInternal = Boolean(company?.isInternalCompany || (company as any)?.isInternal);
  const isRelationshipOurCompany = (company?.relationship || '').toUpperCase().trim() === 'OUR COMPANY';

  // Derive client contact personnel for this company
  const companyContacts = useMemo(() => {
    if (!company) return [];
    const direct = contacts.filter((c) => c.company_id === company.id);
    if (!company.isInternalCompany || !salespersons || salespersons.length === 0) {
      return direct;
    }

    const existingEmails = new Set(direct.map((d) => (d.email || '').toLowerCase().trim()).filter(Boolean));
    const existingNames = new Set(direct.map((d) => (d.full_name || '').toLowerCase().trim()).filter(Boolean));

    const teamContacts: Contact[] = salespersons
      .filter((sp) => {
        const spEmail = (sp.email || '').toLowerCase().trim();
        const spName = (sp.full_name || '').toLowerCase().trim();
        return !existingEmails.has(spEmail) && !existingNames.has(spName);
      })
      .map((sp) => ({
        id: `ct_team_${company.id}_${sp.id}`,
        company_id: company.id,
        full_name: sp.full_name || sp.email || 'Team Member',
        email: sp.email || '',
        mobile: sp.phone || sp.mobile || '',
        designation: sp.title || sp.designation || 'Team Member / Staff',
        is_primary: false,
        workspace_id: activeWorkspace?.id || 'ws_default'
      }));

    return [...direct, ...teamContacts];
  }, [company?.id, company?.isInternalCompany, contacts, salespersons, activeWorkspace?.id]);

  // Linked call logs and enquiries
  const linkedCompanyLogs = useMemo(() => {
    if (!company?.id) return [];
    return callLogs
      .filter((l) => l.company_id === company.id)
      .sort((a, b) => new Date(b.date || (b as any).createdAt || 0).getTime() - new Date(a.date || (a as any).createdAt || 0).getTime());
  }, [company?.id, callLogs]);

  const linkedCompanyEnquiries = useMemo(() => {
    if (!company?.id) return [];
    return enquiries
      .filter((e) => e.company_id === company.id)
      .sort((a, b) => new Date(b.created_at || (b as any).createdAt || 0).getTime() - new Date(a.created_at || (a as any).createdAt || 0).getTime());
  }, [company?.id, enquiries]);

  // Completed / executed activity logs (strictly excluding pending/scheduled tasks)
  const completedCompanyLogs = useMemo(() => {
    return linkedCompanyLogs.filter((l) => !isScheduledTask(l));
  }, [linkedCompanyLogs]);

  // Combined count of executed/completed activity history touchpoints and linked proposals/quotes
  const combinedHistoryCount = completedCompanyLogs.length + linkedCompanyEnquiries.length;

  // Vendor Procurement & Payables Statement state
  const [workspaceQuotations, setWorkspaceQuotations] = useState<QuotationDocumentRecord[]>([]);
  const [workspaceBills, setWorkspaceBills] = useState<SupplierBill[]>([]);

  useEffect(() => {
    if (!isOpen || !activeWorkspace?.id) return;
    const unsubQ = QuotationRepository.subscribeByWorkspace(activeWorkspace.id, (docs) => {
      setWorkspaceQuotations(docs.filter((d) => !d.is_deleted));
    });
    const unsubB = ProcurementRepository.subscribeByWorkspace(activeWorkspace.id, (bills) => {
      setWorkspaceBills(bills.filter((b) => !b.is_deleted));
    });
    return () => {
      unsubQ();
      unsubB();
    };
  }, [isOpen, activeWorkspace?.id]);

  const vendorPayablesSummary = useMemo(() => {
    if (!company) return null;
    const cId = company.id;
    const cName = (company.display_name || company.name || company.canonical_name || '').trim().toLowerCase();

    const matchesVendor = (vId?: string, vName?: string) => {
      if (vId && cId && vId === cId) return true;
      if (vName && cName && vName.trim().toLowerCase() === cName) return true;
      return false;
    };

    const linkedPOs = workspaceQuotations.filter(
      (q) =>
        q.document_type === 'purchase_order' &&
        (q.purchase_order_metadata?.po_variant || 'supplier_po') === 'supplier_po' &&
        matchesVendor(q.purchase_order_metadata?.vendor_company_id, q.purchase_order_metadata?.supplier_name)
    );
    const linkedBills = workspaceBills.filter((b) => matchesVendor(b.vendor_company_id, b.vendor_name));
    const linkedPVs = workspaceQuotations.filter(
      (q) =>
        q.document_type === 'payment_voucher' &&
        matchesVendor(q.payment_voucher_metadata?.vendor_company_id, q.payment_voucher_metadata?.payee_name)
    );
    const linkedReturns = workspaceQuotations.filter(
      (q) =>
        (q.document_type === 'material_return_note' || q.document_type === 'debit_note') &&
        matchesVendor(q.vendor_return_metadata?.vendor_company_id, q.vendor_return_metadata?.supplier_name)
    );

    const totalPoOrdered = linkedPOs.reduce((s, p) => s + (Number(p.financial_totals?.grand_total) || 0), 0);
    const totalBilled = linkedBills.reduce((s, b) => s + (Number(b.grand_total) || 0), 0);
    const totalCredits = linkedBills.reduce((s, b) => s + (Number(b.credit_applied_amount) || 0), 0);
    const totalPaid = linkedPVs.reduce(
      (s, pv) => s + (Number(pv.payment_voucher_metadata?.amount_paid ?? pv.financial_totals?.grand_total) || 0),
      0
    );
    const netPayableBalance = linkedBills.reduce((s, b) => s + (Number(b.balance_due) || 0), 0);

    const isVendorOrHasProcurement =
      (company.relationship || '').toLowerCase().includes('vendor') ||
      Boolean(company.tax_registration_no) ||
      Boolean(company.vendor_bank_details?.iban || company.vendor_bank_details?.bank_name) ||
      linkedPOs.length > 0 ||
      linkedBills.length > 0 ||
      linkedPVs.length > 0 ||
      linkedReturns.length > 0;

    if (!isVendorOrHasProcurement) return null;

    return {
      linkedPOs,
      linkedBills,
      linkedPVs,
      linkedReturns,
      totalPoOrdered: QuotationRepository.roundCurrency(totalPoOrdered),
      totalBilled: QuotationRepository.roundCurrency(totalBilled),
      totalCredits: QuotationRepository.roundCurrency(totalCredits),
      totalPaid: QuotationRepository.roundCurrency(totalPaid),
      netPayableBalance: QuotationRepository.roundCurrency(netPayableBalance),
      currency:
        company.default_currency ||
        activeWorkspace?.document_profile?.default_currency ||
        'AED'
    };
  }, [company, workspaceQuotations, workspaceBills, activeWorkspace]);

  if (!isOpen || !company) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 w-screen h-screen min-h-[100dvh] z-40 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Company Details for ${company.display_name}`}
        className={`fixed inset-y-0 right-0 w-full ${
          isHistoryOpen ? 'max-w-5xl' : 'max-w-xl'
        } bg-white dark:bg-slate-900 shadow-2xl z-40 flex flex-col border-l border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out`}
      >
        {/* Fixed Header (shrink-0) */}
        <div className="shrink-0 p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-sans truncate">
                  {company.display_name}
                </h3>
                <GoogleSearchButton companyName={company.display_name} location={company.city} size="sm" />
                <span className="px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 flex items-center space-x-1 shrink-0">
                  <Tag className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  <span>REF: {getReferenceId('CMP', company, companies)}</span>
                </span>
                {isInternal && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-700 flex items-center gap-1 shadow-xs shrink-0">
                    <span>🏢</span>
                    <span>Our Company</span>
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-1.5 pt-0.5">
                {(() => {
                  const rawSub =
                    (company as any)?.subType?.trim() ||
                    company?.business_type_raw?.trim() ||
                    company?.industry?.trim() ||
                    company?.industry_type?.trim() ||
                    '';
                  const isPlaceholder =
                    !rawSub ||
                    /none/i.test(rawSub) ||
                    /to be added later/i.test(rawSub) ||
                    /unspecified/i.test(rawSub);

                  if (isPlaceholder) return null;

                  return (
                    <IndustryBadge
                      company={
                        company
                          ? {
                              ...company,
                              business_type_raw: formatSubTypeName((company as any).subType || company.business_type_raw)
                            }
                          : company
                      }
                      size="sm"
                    />
                  );
                })()}
                {(!isInternal || !isRelationshipOurCompany) && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                    {company.relationship || 'Prospect'}
                  </span>
                )}
                <TemperatureBadge
                  companyId={company.id}
                  temperature={company.temperature}
                  isDnc={company.is_dnc}
                  variant="pill"
                  companies={companies}
                  setCompanies={setCompanies}
                />
              </div>
            </div>

            {/* Top-Right Header Actions: Activity History Pill + Dedicated '✕' Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsHistoryOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 transition shadow-2xs cursor-pointer group shrink-0"
                title={isHistoryOpen ? "Close past activity history timeline" : "View past activity history timeline"}
              >
                <span>⏱️</span>
                <span>Activity History</span>
                <span className="font-bold">({combinedHistoryCount})</span>
                <span className="text-blue-400 dark:text-blue-600 font-light mx-0.5">|</span>
                <span className="text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform text-xs">
                  {isHistoryOpen ? '⇱' : '⇲'}
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close Inspector Drawer"
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              type="button"
              onClick={(e) => {
                triggerActivity({
                  companyId: company.id,
                  companyName: company.display_name,
                  company: company,
                  targetType: 'company_mainline',
                  channel: 'Call',
                  e
                });
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Log Activity"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Log Activity</span>
            </button>

            {onOpenCompany360 && company.id && (
              <button
                type="button"
                onClick={() => onOpenCompany360(company.id!)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1.5 cursor-pointer bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 transition shadow-2xs"
                title="Open Company 360° View"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                <span>Company 360°</span>
              </button>
            )}

            {isEditable && onOpenEditCompany && (
              <button
                type="button"
                onClick={() => onOpenEditCompany(company)}
                className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Edit Profile"
              >
                <Edit className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit Profile</span>
              </button>
            )}

            {user.role === 'Admin' && (
              <div className="flex items-center gap-1.5 ml-auto">
                {onOpenMerge && (
                  <button
                    type="button"
                    onClick={() => onOpenMerge(company.id!)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-xl transition cursor-pointer"
                    title="Merge and Deduplicate"
                  >
                    <Merge className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDeleteCompany && (
                  <button
                    type="button"
                    onClick={() => onDeleteCompany(company.id!)}
                    className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 border border-rose-200 dark:border-rose-800 rounded-xl transition cursor-pointer"
                    title="Delete Company"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Body: Side-by-Side Dual Pane when History is open */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative min-h-0">
          {/* Left Column: Canonical profile, locations, phone directory, emails, and client personnel */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
          {/* Location & Jurisdiction card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center space-x-3 text-xs">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <span className={`${DETAIL_HEADER_CLASSES} block`}>Location & Jurisdiction</span>
              <span className="text-slate-900 dark:text-white font-semibold text-sm">
                {company.city || 'Unknown City'}, {company.country || 'Unknown Country'}
              </span>
            </div>
          </div>

          {/* Company Phone Numbers & Email Addresses Card */}
          <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-4 rounded-xl">
            {/* Phone Numbers */}
            <div className="space-y-2">
              <span className={`${DETAIL_HEADER_CLASSES} block font-mono`}>Company Phone Numbers</span>
              {getCompanyPhones(company).length > 0 ? (
                <div className="space-y-1.5">
                  {getCompanyPhones(company).map((ph, idx) => {
                    const cleanNum = ph.number ? sanitizeWhatsAppNumber(ph.number) : '';
                    const phoneVal = ph.number || '';
                    const restriction = getLineRestriction(company.restricted_lines, phoneVal, company.is_dnc);
                    const isRestricted = Boolean(restriction);
                    const badgeText = restriction === 'DNC' ? 'DNC' : 'INVALID';

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <Phone
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isRestricted ? (restriction === 'Invalid' ? 'text-amber-500' : 'text-rose-500') : 'text-blue-500'
                            }`}
                          />
                          {isRestricted ? (
                            <span
                              className="font-mono font-semibold text-slate-400 line-through cursor-not-allowed truncate"
                              title={`Restricted line (${badgeText})`}
                            >
                              {ph.number}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                triggerActivity({
                                  companyId: company.id,
                                  companyName: company.display_name,
                                  company: company,
                                  targetType: 'company_mainline',
                                  contactPhone: ph.number,
                                  channel: 'Call',
                                  externalUrl: `tel:${ph.number}`,
                                  e
                                });
                              }}
                              className="font-mono text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer text-left truncate"
                            >
                              {ph.number}
                            </button>
                          )}
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium shrink-0">
                            {ph.label || 'Telephone'}
                          </span>
                          {isRestricted && (
                            <span
                              className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide border shrink-0 ${
                                restriction === 'Invalid'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                              }`}
                            >
                              {badgeText}
                            </span>
                          )}
                        </div>

                        {!isRestricted && (
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                triggerActivity({
                                  companyId: company.id,
                                  companyName: company.display_name,
                                  company: company,
                                  targetType: 'company_mainline',
                                  contactPhone: ph.number,
                                  channel: 'Call',
                                  externalUrl: `tel:${ph.number}`,
                                  e
                                });
                              }}
                              className="p-1.5 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition cursor-pointer"
                              title="1-Click Dial & Log Activity"
                            >
                              <Phone className="w-3 h-3" />
                            </button>
                            {cleanNum && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  triggerActivity({
                                    companyId: company.id,
                                    companyName: company.display_name,
                                    company: company,
                                    targetType: 'company_mainline',
                                    contactPhone: ph.number,
                                    channel: 'WhatsApp',
                                    messageType: 'whatsapp',
                                    externalUrl: getWhatsAppUrl(ph.number),
                                    e
                                  });
                                }}
                                className="p-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                                title="1-Click WhatsApp & Log Activity"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={DETAIL_EMPTY_CONTAINER_CLASSES}>
                  <span className={DETAIL_EMPTY_FALLBACK_CLASSES}>No phone numbers saved.</span>
                </div>
              )}
            </div>

            {/* Email Addresses */}
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <span className={`${DETAIL_HEADER_CLASSES} block font-mono`}>Company Email Addresses</span>
              {getCompanyEmails(company).length > 0 ? (
                <div className="space-y-1.5">
                  {getCompanyEmails(company).map((em, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                    >
                      <div className="flex items-center space-x-2 truncate min-w-0">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <button
                          type="button"
                          onClick={(e) => {
                            triggerActivity({
                              companyId: company.id,
                              companyName: company.display_name,
                              company: company,
                              targetType: 'company_mainline',
                              contactEmail: em.email,
                              channel: 'Email',
                              externalUrl: `mailto:${em.email}`,
                              e
                            });
                          }}
                          className="font-mono text-slate-800 dark:text-slate-200 hover:underline truncate text-left cursor-pointer"
                        >
                          {em.email}
                        </button>
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium shrink-0">
                          {em.label || 'General'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          triggerActivity({
                            companyId: company.id,
                            companyName: company.display_name,
                            company: company,
                            targetType: 'company_mainline',
                            contactEmail: em.email,
                            channel: 'Email',
                            externalUrl: `mailto:${em.email}`,
                            e
                          });
                        }}
                        className="p-1.5 rounded-md bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 transition shrink-0 ml-2 cursor-pointer"
                        title="1-Click Email & Log Activity"
                      >
                        <Mail className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={DETAIL_EMPTY_CONTAINER_CLASSES}>
                  <span className={DETAIL_EMPTY_FALLBACK_CLASSES}>No email addresses saved.</span>
                </div>
              )}
            </div>

            {/* Portals & Links Display */}
            {company.links && company.links.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <span className={`${DETAIL_HEADER_CLASSES} block font-mono`}>Portals & Links</span>
                <div className="flex flex-wrap gap-2">
                  {company.links.map((lnk, idx) => (
                    <a
                      key={idx}
                      href={lnk.url.startsWith('http') ? lnk.url : `https://${lnk.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                      <span>
                        {lnk.label}: {lnk.url.replace(/^https?:\/\//, '').split('/')[0]}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Duplicate Lookup Aliases */}
          <div className="space-y-2">
            <h4 className={`${DETAIL_HEADER_CLASSES} font-mono`}>Duplicate Lookup Aliases</h4>
            <div className="flex flex-wrap gap-1.5">
              {company.aliases && company.aliases.length > 0 ? (
                company.aliases.map((a) => (
                  <span
                    key={a}
                    className="text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-md"
                  >
                    {a}
                  </span>
                ))
              ) : (
                <div className={`${DETAIL_EMPTY_CONTAINER_CLASSES} w-full`}>
                  <span className={DETAIL_EMPTY_FALLBACK_CLASSES}>No alternate spellings declared.</span>
                </div>
              )}
            </div>
          </div>

          {/* Internal Client Notes */}
          {company.notes ? (
            <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-4 rounded-xl">
              <h4 className={`${DETAIL_HEADER_CLASSES} font-mono`}>Internal Client Notes</h4>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">{company.notes}</p>
            </div>
          ) : null}

          {/* Vendor Procurement & Payables Statement */}
          {vendorPayablesSummary && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Vendor Procurement &amp; Payables Statement</span>
                </h4>
                {company.tax_registration_no && (
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[10.5px] font-bold">
                    TRN: {company.tax_registration_no}
                  </span>
                )}
              </div>

              {/* Payables KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80">
                  <span className="block text-[10px] font-bold uppercase text-indigo-700">POs Ordered ({vendorPayablesSummary.linkedPOs.length})</span>
                  <span className="font-mono font-bold text-slate-900">
                    {vendorPayablesSummary.currency} {vendorPayablesSummary.totalPoOrdered.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/80">
                  <span className="block text-[10px] font-bold uppercase text-amber-800">Total Billed ({vendorPayablesSummary.linkedBills.length})</span>
                  <span className="font-mono font-bold text-slate-900">
                    {vendorPayablesSummary.currency} {vendorPayablesSummary.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
                  <span className="block text-[10px] font-bold uppercase text-emerald-800">Paid via PV ({vendorPayablesSummary.linkedPVs.length})</span>
                  <span className="font-mono font-bold text-emerald-900">
                    {vendorPayablesSummary.currency} {vendorPayablesSummary.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
                  <span className="block text-[10px] font-bold uppercase text-rose-800">Net Payable Balance</span>
                  <span className="font-mono font-black text-rose-900">
                    {vendorPayablesSummary.currency} {vendorPayablesSummary.netPayableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Beneficiary Bank Details */}
              {company.vendor_bank_details &&
                (company.vendor_bank_details.bank_name || company.vendor_bank_details.iban) && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-500">
                      Registered Beneficiary Bank Account
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div>
                        <span className="text-slate-500">Beneficiary: </span>
                        <span className="font-semibold text-slate-800">
                          {company.vendor_bank_details.beneficiary_name || company.display_name}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Bank: </span>
                        <span className="font-semibold text-slate-800">
                          {company.vendor_bank_details.bank_name || '—'}
                        </span>
                      </div>
                      {company.vendor_bank_details.iban && (
                        <div className="col-span-2 font-mono text-[10.5px] text-slate-700">
                          IBAN: {company.vendor_bank_details.iban}{' '}
                          {company.vendor_bank_details.swift_code
                            ? `• SWIFT: ${company.vendor_bank_details.swift_code}`
                            : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* Linked POs & Bills Mini Ledger */}
              {(vendorPayablesSummary.linkedPOs.length > 0 ||
                vendorPayablesSummary.linkedBills.length > 0 ||
                vendorPayablesSummary.linkedPVs.length > 0) && (
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 font-bold text-[10.5px] text-slate-600 uppercase">
                    Recent Procurement &amp; Settlement Ledger
                  </div>
                  <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                    {vendorPayablesSummary.linkedPOs.map((po) => (
                      <div key={po.id} className="px-3 py-2 flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-indigo-700">{po.formatted_quote_ref}</span>
                          <span className="ml-2 text-[10.5px] text-slate-500">
                            {po.purchase_order_metadata?.receiving_status || 'Pending Receipt'}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-slate-800">
                          {po.currency} {Number(po.financial_totals?.grand_total || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {vendorPayablesSummary.linkedBills.map((bill) => (
                      <div key={bill.id} className="px-3 py-2 flex items-center justify-between bg-amber-50/20">
                        <div>
                          <span className="font-mono font-bold text-amber-800">{bill.bill_number}</span>
                          <span className="ml-1.5 text-[10.5px] text-slate-500">
                            (Inv: {bill.vendor_invoice_no})
                          </span>
                        </div>
                        <span className="font-mono font-bold text-rose-700">
                          Bal: {bill.currency} {Number(bill.balance_due || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {vendorPayablesSummary.linkedPVs.map((pv) => (
                      <div key={pv.id} className="px-3 py-2 flex items-center justify-between bg-emerald-50/20">
                        <div>
                          <span className="font-mono font-bold text-emerald-800">{pv.formatted_quote_ref}</span>
                          <span className="ml-1.5 text-[10.5px] text-slate-500">Payment Voucher</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-700">
                          Paid: {pv.currency}{' '}
                          {Number(pv.payment_voucher_metadata?.amount_paid ?? pv.financial_totals?.grand_total ?? 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Client Contact Personnel Section (Expands naturally without scroll trap) */}
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2 font-sans">
                <Users2 className="w-4 h-4 text-slate-400" />
                <span>Client Contact Personnel ({companyContacts.length})</span>
              </h4>
              {isEditable && onAddContact && (
                <button
                  type="button"
                  onClick={() => onAddContact(company.id!)}
                  className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 rounded-md transition flex items-center space-x-1 cursor-pointer"
                  title="Add Personnel Contact"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Contact</span>
                </button>
              )}
            </div>

            {companyContacts.length > 0 ? (
              <div className="space-y-3">
                {companyContacts.map((c) => {
                  const cPhones = getContactPhones(c);
                  const cEmails = getContactEmails(c);
                  return (
                    <div
                      key={c.id}
                      className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-4 space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="overflow-hidden min-w-0">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white block font-sans truncate">
                              {c.full_name}
                            </span>
                            {c.is_primary && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                Primary
                              </span>
                            )}
                            {c.is_dnc && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                DNC
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 block font-sans mt-0.5 truncate">
                            {c.designation || 'No title declared'}
                          </span>
                        </div>

                        {isEditable && !c.id?.startsWith('ct_team_') && (
                          <div className="flex items-center space-x-1 shrink-0">
                            {onEditContact && (
                              <button
                                type="button"
                                onClick={() => onEditContact(c, company.id!)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-md transition cursor-pointer"
                                title="Edit Personnel"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onDeleteContact && (
                              <button
                                type="button"
                                onClick={() => onDeleteContact(c.id!)}
                                className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition cursor-pointer"
                                title="Delete Personnel"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 text-xs pt-2 border-t border-slate-200/60 dark:border-slate-700/60 w-full text-slate-600 dark:text-slate-300 font-sans">
                        {cPhones.map((ph, pIdx) => {
                          const cleanNum = ph.number ? sanitizeWhatsAppNumber(ph.number) : '';
                          const phoneVal = ph.number || '';
                          const restriction =
                            getLineRestriction(c.restricted_lines, phoneVal) ||
                            getLineRestriction(company.restricted_lines, phoneVal, c.is_dnc || company.is_dnc);
                          const isRestricted = Boolean(restriction);
                          const badgeText = restriction === 'DNC' ? 'DNC' : 'INVALID';

                          return (
                            <div key={pIdx} className="flex items-center justify-between text-xs py-0.5">
                              <div className="flex items-center space-x-2 min-w-0">
                                <Phone
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isRestricted ? (restriction === 'Invalid' ? 'text-amber-500' : 'text-rose-500') : 'text-blue-500'
                                  }`}
                                />
                                {isRestricted ? (
                                  <span
                                    className="font-mono font-semibold text-slate-400 line-through cursor-not-allowed truncate"
                                    title={`Restricted line (${badgeText})`}
                                  >
                                    {ph.number}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      const ctName = c.full_name || (c as any).name || '';
                                      const ctPhone = ph.number || c.mobile || c.landline || (c as any).phone || '';
                                      const ctEmail = c.email || '';
                                      triggerActivity({
                                        companyId: company.id,
                                        companyName: company.display_name,
                                        company: company,
                                        contactId: c.id,
                                        contactName: ctName,
                                        contactPhone: ctPhone,
                                        contactEmail: ctEmail,
                                        contact: {
                                          ...c,
                                          id: c.id,
                                          name: ctName,
                                          phone: ctPhone,
                                          email: ctEmail
                                        },
                                        targetType: 'contact',
                                        channel: 'Call',
                                        externalUrl: `tel:${ph.number}`,
                                        e
                                      });
                                    }}
                                    className="font-mono text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer text-left truncate"
                                  >
                                    {ph.number}
                                  </button>
                                )}
                                <span className="px-1.5 py-0.5 bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium shrink-0">
                                  {ph.label}
                                </span>
                                {isRestricted && (
                                  <span
                                    className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide border shrink-0 ${
                                      restriction === 'Invalid'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                    }`}
                                  >
                                    {badgeText}
                                  </span>
                                )}
                              </div>

                              {!isRestricted && (
                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      const ctName = c.full_name || (c as any).name || '';
                                      const ctPhone = ph.number || c.mobile || c.landline || (c as any).phone || '';
                                      const ctEmail = c.email || '';
                                      triggerActivity({
                                        companyId: company.id,
                                        companyName: company.display_name,
                                        company: company,
                                        contactId: c.id,
                                        contactName: ctName,
                                        contactPhone: ctPhone,
                                        contactEmail: ctEmail,
                                        contact: {
                                          ...c,
                                          id: c.id,
                                          name: ctName,
                                          phone: ctPhone,
                                          email: ctEmail
                                        },
                                        targetType: 'contact',
                                        channel: 'Call',
                                        externalUrl: `tel:${ph.number}`,
                                        e
                                      });
                                    }}
                                    className="p-1 rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition cursor-pointer"
                                    title="1-Click Dial & Log Activity"
                                  >
                                    <Phone className="w-3 h-3" />
                                  </button>
                                  {cleanNum && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        const ctName = c.full_name || (c as any).name || '';
                                        const ctPhone = ph.number || c.mobile || c.landline || (c as any).phone || '';
                                        const ctEmail = c.email || '';
                                        triggerActivity({
                                          companyId: company.id,
                                          companyName: company.display_name,
                                          company: company,
                                          contactId: c.id,
                                          contactName: ctName,
                                          contactPhone: ctPhone,
                                          contactEmail: ctEmail,
                                          contact: {
                                            ...c,
                                            id: c.id,
                                            name: ctName,
                                            phone: ctPhone,
                                            email: ctEmail
                                          },
                                          targetType: 'contact',
                                          channel: 'WhatsApp',
                                          messageType: 'whatsapp',
                                          externalUrl: getWhatsAppUrl(ph.number),
                                          e
                                        });
                                      }}
                                      className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                                      title="1-Click WhatsApp & Log Activity"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {cEmails.map((em, eIdx) => (
                          <div key={eIdx} className="flex items-center justify-between text-xs py-0.5">
                            <div className="flex items-center space-x-2 overflow-hidden truncate min-w-0">
                              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  const ctName = c.full_name || (c as any).name || '';
                                  const ctPhone = c.mobile || c.landline || (c as any).phone || '';
                                  const ctEmail = em.email || c.email || '';
                                  triggerActivity({
                                    companyId: company.id,
                                    companyName: company.display_name,
                                    company: company,
                                    contactId: c.id,
                                    contactName: ctName,
                                    contactPhone: ctPhone,
                                    contactEmail: ctEmail,
                                    contact: {
                                      ...c,
                                      id: c.id,
                                      name: ctName,
                                      phone: ctPhone,
                                      email: ctEmail
                                    },
                                    targetType: 'contact',
                                    channel: 'Email',
                                    externalUrl: `mailto:${em.email}`,
                                    e
                                  });
                                }}
                                className="truncate text-slate-800 dark:text-slate-200 hover:underline font-mono cursor-pointer text-left"
                              >
                                {em.email}
                              </button>
                              {em.label && (
                                <span className="px-1.5 py-0.5 bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium shrink-0">
                                  {em.label}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                const ctName = c.full_name || (c as any).name || '';
                                const ctPhone = c.mobile || c.landline || (c as any).phone || '';
                                const ctEmail = em.email || c.email || '';
                                triggerActivity({
                                  companyId: company.id,
                                  companyName: company.display_name,
                                  company: company,
                                  contactId: c.id,
                                  contactName: ctName,
                                  contactPhone: ctPhone,
                                  contactEmail: ctEmail,
                                  contact: {
                                    ...c,
                                    id: c.id,
                                    name: ctName,
                                    phone: ctPhone,
                                    email: ctEmail
                                  },
                                  targetType: 'contact',
                                  channel: 'Email',
                                  externalUrl: `mailto:${em.email}`,
                                  e
                                });
                              }}
                              className="p-1 rounded bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 transition cursor-pointer shrink-0 ml-2"
                              title="1-Click Email & Log Activity"
                            >
                              <Mail className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={DETAIL_EMPTY_CONTAINER_CLASSES}>
                <span className={DETAIL_EMPTY_FALLBACK_CLASSES}>No contact personnel registered for this company.</span>
              </div>
            )}
          </div>
        </div>

          {/* Right Column: CompanyActivityTimeline (search bar, filter dropdown, and rich history cards) */}
          {isHistoryOpen && (
            <div className="w-full lg:w-[480px] xl:w-[520px] border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col h-full bg-slate-50/50 dark:bg-slate-900 shrink-0 min-w-0">
              <CompanyActivityTimeline
                historyLogs={linkedCompanyLogs}
                enquiries={linkedCompanyEnquiries}
                companyName={company.display_name}
                companyId={company.id}
                contacts={companyContacts}
                companies={companies}
                salespersons={salespersons}
                onClose={() => setIsHistoryOpen(false)}
                onEditCallLog={(log) => {
                  if (onEditCallLog) {
                    onEditCallLog(log);
                  } else if (onSelectCallLog) {
                    onSelectCallLog(log);
                  } else {
                    triggerActivity({
                      companyId: company.id,
                      companyName: company.display_name,
                      logToEdit: log,
                      existingLog: log
                    });
                  }
                }}
                onSelectCallLog={(log) => {
                  if (onEditCallLog) {
                    onEditCallLog(log);
                  } else if (onSelectCallLog) {
                    onSelectCallLog(log);
                  } else {
                    triggerActivity({
                      companyId: company.id,
                      companyName: company.display_name,
                      logToEdit: log,
                      existingLog: log
                    });
                  }
                }}
                onExecuteTask={(task) => {
                  if (onExecuteTask) {
                    onExecuteTask(task);
                  } else {
                    setActiveExecutionTask(task);
                  }
                }}
                onSelectEnquiry={onSelectEnquiry}
                onOpenCompany360={onOpenCompany360 && company.id ? () => onOpenCompany360(company.id!) : undefined}
                user={user}
                activeWorkspace={activeWorkspace}
                isBasicTier={isBasicTier}
                showHeader={true}
                setCallLogs={setCallLogs}
                setCompanies={setCompanies}
                setContacts={setContacts}
              />
            </div>
          )}
        </div>
      </div>

      {/* Live Execution Command Center Modal */}
      {activeExecutionTask && (
        <LiveExecutionModal
          isOpen={Boolean(activeExecutionTask)}
          onClose={() => setActiveExecutionTask(null)}
          task={activeExecutionTask}
          targetTaskId={activeExecutionTask.id}
          targetCompanyId={activeExecutionTask.company_id}
          initialTaskId={activeExecutionTask.id}
          onSwitchTask={setActiveExecutionTask}
          user={user}
          callLogs={callLogs}
          contacts={contacts}
          companies={companies}
          enquiries={enquiries}
          setCompanies={setCompanies}
          setContacts={setContacts}
          setCallLogs={setCallLogs}
          onCompleteTask={async (completedTask) => {
            try {
              await CallLogRepository.save(completedTask);
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((l) => (l.id === completedTask.id ? { ...l, ...completedTask } : l)));
              }
            } catch (e) {
              console.warn('Error syncing completed task:', e);
            }
            setActiveExecutionTask(null);
          }}
          onRescheduleTask={async (rescheduledTask) => {
            try {
              await CallLogRepository.save(rescheduledTask);
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((l) => (l.id === rescheduledTask.id ? { ...l, ...rescheduledTask } : l)));
              }
            } catch (e) {
              console.warn('Error syncing rescheduled task:', e);
            }
            setActiveExecutionTask(null);
          }}
          onCancelTask={async (cancelledTask) => {
            try {
              await CallLogRepository.save(cancelledTask);
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((l) => (l.id === cancelledTask.id ? { ...l, ...cancelledTask } : l)));
              }
            } catch (e) {
              console.warn('Error syncing cancelled task:', e);
            }
            setActiveExecutionTask(null);
          }}
        />
      )}
    </>
  );
};

export const CompanyDetailDrawer = CompanyDetailView;
export default CompanyDetailView;
