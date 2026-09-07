import React, { useEffect, useMemo } from 'react';
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
import {
  Company,
  Contact,
  Enquiry,
  UserProfile,
  CallLogEntry,
  Salesperson,
  Workspace,
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
import { sanitizeWhatsAppNumber, getWhatsAppUrl } from '../utils/defaults';

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
  onAddContact?: (companyId: string) => void;
  onEditContact?: (contact: Contact, companyId: string) => void;
  onDeleteContact?: (contactId: string) => void;
  onOpenMerge?: (companyId: string) => void;
  onDeleteCompany?: (companyId: string) => void;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
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
  onAddContact,
  onEditContact,
  onDeleteContact,
  onOpenMerge,
  onDeleteCompany,
  setCompanies
}) => {
  // ESC key listener to dismiss drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
  }, [company, contacts, salespersons, activeWorkspace]);

  // Linked call logs and enquiries
  const linkedCompanyLogs = useMemo(() => {
    if (!company) return [];
    return callLogs
      .filter((l) => l.company_id === company.id)
      .sort((a, b) => new Date(b.date || (b as any).createdAt || 0).getTime() - new Date(a.date || (a as any).createdAt || 0).getTime());
  }, [company, callLogs]);

  const linkedCompanyEnquiries = useMemo(() => {
    if (!company) return [];
    return enquiries
      .filter((e) => e.company_id === company.id)
      .sort((a, b) => new Date(b.created_at || (b as any).createdAt || 0).getTime() - new Date(a.created_at || (a as any).createdAt || 0).getTime());
  }, [company, enquiries]);

  if (!isOpen || !company) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Company Details for ${company.display_name}`}
        className="fixed inset-y-0 right-0 w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col border-l border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out"
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
                {company.isInternalCompany && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-700 flex items-center gap-1 shadow-xs shrink-0">
                    <span>🏢</span>
                    <span>Our Company</span>
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-1.5 pt-0.5">
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
                  showEmpty
                />
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                  {company.relationship || 'Prospect'}
                </span>
                <TemperatureBadge
                  companyId={company.id}
                  temperature={company.temperature}
                  isDnc={company.is_dnc}
                  variant="pill"
                  companies={companies}
                  setCompanies={setCompanies}
                />
              </div>

              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 w-fit">
                Canonical Base: {company.canonical_name}
              </p>
            </div>

            {/* Dedicated '✕' icon button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Inspector Drawer"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Actions Row */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              type="button"
              onClick={(e) => {
                if (onInitiateActivity) {
                  onInitiateActivity({
                    companyId: company.id,
                    companyName: company.display_name,
                    company: company,
                    targetType: 'company_mainline',
                    channel: 'Call',
                    e
                  });
                }
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

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                                if (onInitiateActivity) {
                                  onInitiateActivity({
                                    companyId: company.id,
                                    companyName: company.display_name,
                                    company: company,
                                    targetType: 'company_mainline',
                                    contactPhone: ph.number,
                                    channel: 'Call',
                                    externalUrl: `tel:${ph.number}`,
                                    e
                                  });
                                }
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
                                if (onInitiateActivity) {
                                  onInitiateActivity({
                                    companyId: company.id,
                                    companyName: company.display_name,
                                    company: company,
                                    targetType: 'company_mainline',
                                    contactPhone: ph.number,
                                    channel: 'Call',
                                    externalUrl: `tel:${ph.number}`,
                                    e
                                  });
                                }
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
                                  if (onInitiateActivity) {
                                    onInitiateActivity({
                                      companyId: company.id,
                                      companyName: company.display_name,
                                      company: company,
                                      targetType: 'company_mainline',
                                      contactPhone: ph.number,
                                      channel: 'WhatsApp',
                                      externalUrl: getWhatsAppUrl(ph.number),
                                      e
                                    });
                                  }
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
                        <a
                          href={`mailto:${em.email}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-slate-800 dark:text-slate-200 hover:underline truncate"
                        >
                          {em.email}
                        </a>
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium shrink-0">
                          {em.label || 'General'}
                        </span>
                      </div>
                      <a
                        href={`mailto:${em.email}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-md bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 transition shrink-0 ml-2"
                        title="1-Click Email"
                      >
                        <Mail className="w-3 h-3" />
                      </a>
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
                                      if (onInitiateActivity) {
                                        onInitiateActivity({
                                          companyId: company.id,
                                          companyName: company.display_name,
                                          company: company,
                                          contactId: c.id,
                                          contactName: c.full_name,
                                          contact: c,
                                          targetType: 'contact',
                                          contactPhone: ph.number,
                                          channel: 'Call',
                                          externalUrl: `tel:${ph.number}`,
                                          e
                                        });
                                      }
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
                                      if (onInitiateActivity) {
                                        onInitiateActivity({
                                          companyId: company.id,
                                          companyName: company.display_name,
                                          company: company,
                                          contactId: c.id,
                                          contactName: c.full_name,
                                          contact: c,
                                          targetType: 'contact',
                                          contactPhone: ph.number,
                                          channel: 'Call',
                                          externalUrl: `tel:${ph.number}`,
                                          e
                                        });
                                      }
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
                                        if (onInitiateActivity) {
                                          onInitiateActivity({
                                            companyId: company.id,
                                            companyName: company.display_name,
                                            company: company,
                                            contactId: c.id,
                                            contactName: c.full_name,
                                            contact: c,
                                            targetType: 'contact',
                                            contactPhone: ph.number,
                                            channel: 'WhatsApp',
                                            externalUrl: getWhatsAppUrl(ph.number),
                                            e
                                          });
                                        }
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
                                  if (onInitiateActivity) {
                                    onInitiateActivity({
                                      companyId: company.id,
                                      companyName: company.display_name,
                                      company: company,
                                      contactId: c.id,
                                      contactName: c.full_name,
                                      contact: c,
                                      targetType: 'contact',
                                      contactEmail: em.email,
                                      channel: 'Email',
                                      externalUrl: `mailto:${em.email}`,
                                      e
                                    });
                                  }
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
                                if (onInitiateActivity) {
                                  onInitiateActivity({
                                    companyId: company.id,
                                    companyName: company.display_name,
                                    company: company,
                                    contactId: c.id,
                                    contactName: c.full_name,
                                    contact: c,
                                    targetType: 'contact',
                                    contactEmail: em.email,
                                    channel: 'Email',
                                    externalUrl: `mailto:${em.email}`,
                                    e
                                  });
                                }
                              }}
                              className="p-1 rounded bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 transition cursor-pointer shrink-0 ml-2"
                              title="1-Click Email"
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

          {/* Outreach & History Summary */}
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2 font-sans">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Outreach & History</span>
              </h4>
              <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200 dark:border-slate-700">
                {linkedCompanyLogs.length + linkedCompanyEnquiries.length} records
              </span>
            </div>

            {/* Recent Call Logs Subsection */}
            {linkedCompanyLogs.length > 0 && (
              <div className="space-y-2.5">
                <span className={`${DETAIL_HEADER_CLASSES} block font-mono`}>
                  Call Center & Outreach ({linkedCompanyLogs.length})
                </span>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-b border-slate-100 dark:border-slate-800">
                  {linkedCompanyLogs.map((log) => {
                    const canClick = canUserClickRecord(user, log, salespersons);
                    return (
                      <div
                        key={log.id}
                        onClick={() => {
                          if (canClick && onSelectCallLog) {
                            onSelectCallLog(log);
                          }
                        }}
                        className={`py-3 px-1 transition ${
                          canClick ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group rounded-lg' : 'opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                              <PhoneCall className="w-3 h-3" />
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-white font-mono text-xs">
                              {formatHistoryDate(log.date || (log as any).createdAt)}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                            {log.status || 'Scheduled'}
                          </span>
                        </div>

                        <div className="mt-1.5 pl-8 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                          <p>
                            Logged by:{' '}
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {(log as any).handled_by_team_member_name || log.logged_by || 'Staff'}
                            </span>
                            {log.contact_name && (
                              <span className="ml-2">
                                · Contact:{' '}
                                <span className="font-medium text-slate-700 dark:text-slate-300">{log.contact_name}</span>
                              </span>
                            )}
                          </p>
                          {log.requirement_notes && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 italic line-clamp-2">
                              "{log.requirement_notes}"
                            </p>
                          )}
                          {canClick && onSelectCallLog && (
                            <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 group-hover:underline flex items-center space-x-1 pt-0.5">
                              <span>View Log</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Proposals & Quotes Subsection */}
            {linkedCompanyEnquiries.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <span className={`${DETAIL_HEADER_CLASSES} block font-mono`}>
                  Proposals & Quotes ({linkedCompanyEnquiries.length})
                </span>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-b border-slate-100 dark:border-slate-800">
                  {linkedCompanyEnquiries.map((e) => {
                    const canClick = canUserClickRecord(user, e, salespersons);
                    const spName = getSalespersonFullName(e.sales_person, salespersons);
                    return (
                      <div
                        key={e.id}
                        onClick={() => {
                          if (canClick && onSelectEnquiry && e.id) {
                            onSelectEnquiry(e.id);
                          }
                        }}
                        className={`py-3 px-1 transition ${
                          canClick ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group rounded-lg' : 'opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2 overflow-hidden">
                            <div className="w-6 h-6 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                              <FileText className="w-3 h-3" />
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-white font-mono text-xs truncate">
                              {e.quote_ref_no || `SN#${e.sn}`}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                            {e.status || 'Active'}
                          </span>
                        </div>

                        <div className="mt-1.5 pl-8 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                          {e.subject && (
                            <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1">{e.subject}</p>
                          )}
                          <div className="flex items-center justify-between text-xs">
                            <span>
                              Owner: <strong className="text-slate-700 dark:text-slate-300">{spName}</strong>
                            </span>
                            {!isBasicTier && e.value_aed ? (
                              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                AED {e.value_aed.toLocaleString()}
                              </span>
                            ) : null}
                          </div>
                          {canClick && onSelectEnquiry && (
                            <div className="text-[10px] font-medium text-purple-600 dark:text-purple-400 group-hover:underline flex items-center space-x-1 pt-0.5">
                              <span>Open Proposal</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {linkedCompanyLogs.length === 0 && linkedCompanyEnquiries.length === 0 && (
              <div className="py-6 text-center text-slate-600 dark:text-slate-300 font-sans text-xs bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 font-medium">
                No outreach calls or proposals linked to this company yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export const CompanyDetailDrawer = CompanyDetailView;
export default CompanyDetailView;
