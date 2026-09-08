import React, { useState, useEffect, useMemo } from 'react';
import { Company, Contact, Enquiry, CallLogEntry, UserProfile, Workspace, Salesperson, getContactPhones, getContactEmails, getCompanyPhones, getCompanyEmails, DropdownOption } from '../types';
import { getReferenceId } from '../utils/refId';
import ContactModal from './ContactModal';
import CompanyEditModal from './CompanyEditModal';
import {
  Building2,
  Users2,
  PhoneCall,
  FileText,
  X,
  Phone,
  Mail,
  MapPin,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Tag,
  MessageSquare,
  Calendar,
  Globe,
  DollarSign,
  TrendingUp,
  ArrowUpRight
} from 'lucide-react';
import { CompanyActivityTimeline, formatTimelineDate } from './common/CompanyActivityTimeline';
import { safeDeleteDoc, safeSetDoc, safeUpdateDoc } from '../firebase';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { IndustryBadge, formatSubTypeName } from '../utils/taxonomy';
import { recordAuditLog } from '../utils/auditLogger';
import { isSuccessStatus } from '../utils/activityLogic';
import TemperatureBadge from './TemperatureBadge';
import GoogleSearchButton from './common/GoogleSearchButton';
import { useActivityLauncher, InitiateActivityOptions } from '../context/ActivityLauncherContext';
import { sanitizeWhatsAppNumber, getWhatsAppUrl } from '../utils/defaults';

interface Company360ModalProps {
  isOpen?: boolean;
  companyId: string | null;
  companies: Company[];
  contacts: Contact[];
  salespersons?: Salesperson[];
  enquiries: Enquiry[];
  callLogs: CallLogEntry[];
  user: UserProfile;
  activeWorkspace?: Workspace;
  companyRelationships?: DropdownOption[];
  companyTemperatures?: DropdownOption[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  onClose: () => void;
  onOpenEnquiry?: (enquiryId: string) => void;
  onLogCallForCompany?: (company: Company) => void;
  onCreateEnquiryForCompany?: (company: Company) => void;
  onEditCompany?: (company: Company) => void;
  onOpenActivityDrawer?: (context: {
    companyId?: string;
    companyName?: string;
    contactId?: string;
    contactName?: string;
    contactPhone?: string;
    enquiryId?: string;
    channel?: any;
    initialStatus?: string;
    existingLog?: any;
    logToEdit?: any;
  }) => void;
  onInitiateActivity?: (options: InitiateActivityOptions) => void;
}

export default function Company360Modal({
  isOpen,
  companyId,
  companies,
  contacts,
  salespersons = [],
  enquiries,
  callLogs,
  user,
  activeWorkspace,
  companyRelationships,
  companyTemperatures,
  setCompanies,
  setContacts,
  setCallLogs,
  onClose,
  onOpenEnquiry,
  onLogCallForCompany,
  onCreateEnquiryForCompany,
  onEditCompany,
  onOpenActivityDrawer,
  onInitiateActivity
}: Company360ModalProps) {
  const launcher = useActivityLauncher();
  const handleInitiate = onInitiateActivity || launcher.initiateActivity;
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContactToEdit, setSelectedContactToEdit] = useState<Contact | null>(null);
  const [internalEditModalOpen, setInternalEditModalOpen] = useState(false);
  const [localCompanyOverride, setLocalCompanyOverride] = useState<Company | null>(null);

  // Reset local override if companyId changes
  useEffect(() => {
    setLocalCompanyOverride(null);
  }, [companyId]);

  const rawCompany = companies.find((c) => c.id === companyId);
  const company = localCompanyOverride || rawCompany;
  const [temperatureVal, setTemperatureVal] = useState<'Cold' | 'Warm' | 'Hot' | 'DNC'>('Cold');

  useEffect(() => {
    if (company) {
      setTemperatureVal((company.temperature as any) || (company.is_dnc ? 'DNC' : 'Cold'));
    }
  }, [company?.temperature, company?.is_dnc]);

  const handleDeleteContact = async (c: Contact) => {
    const targetId = c?.id || (c as any)?._id;
    if (!c || !targetId) {
      return;
    }
    try {
      if (setContacts) {
        setContacts((prev) => prev.map((item) => item.id === targetId ? {
          ...item,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : item));
      }
      await safeUpdateDoc('contacts', targetId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });
      try {
        await recordAuditLog({
          document_id: targetId,
          entity_type: 'contact',
          entity_title: c.full_name,
          action: 'delete',
          user,
          before: c,
          details: `Deleted contact person: "${c.full_name}"`
        });
      } catch (e) {}
    } catch (err: any) {
      alert('Failed to delete contact: ' + (err?.message || err));
    }
  };

  if ((isOpen !== undefined && !isOpen) || !companyId || !company) return null;

  const companyContacts = useMemo(() => {
    const direct = contacts.filter((c) => !c.is_deleted && c.company_id === company.id);
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
        workspace_id: activeWorkspace?.id || 'ws_default',
        search_terms: [(sp.full_name || '').toLowerCase(), (sp.email || '').toLowerCase()],
        createdAt: sp.createdAt || new Date().toISOString(),
        updatedAt: sp.updatedAt || new Date().toISOString()
      } as Contact));

    return [...direct, ...teamContacts];
  }, [contacts, company.id, company.isInternalCompany, salespersons, activeWorkspace?.id]);

  const companyCallLogs = callLogs.filter(
    (l) => !l.is_deleted && (l.company_id === company.id || (l.company_name && l.company_name.toLowerCase() === company.display_name.toLowerCase()))
  );
  const companyEnquiries = enquiries.filter((e) => !e.is_deleted && e.company_id === company.id);

  const handleOutboundInteraction = (
    e: React.MouseEvent,
    channel: 'Call' | 'WhatsApp' | 'Email',
    contact: Contact | null,
    externalUrl?: string,
    contactPhone?: string,
    contactEmail?: string
  ) => {
    const p = contactPhone || (contact ? (getContactPhones(contact)[0]?.value || contact.mobile || contact.phone || '') : '');
    const em = contactEmail || (contact ? (getContactEmails(contact)[0]?.value || contact.email || '') : '');
    const ctName = contact ? (contact.full_name || (contact as any).name || '') : undefined;
    const contactEntity = contact
      ? {
          ...contact,
          id: contact.id,
          name: ctName || '',
          phone: p || '',
          email: em || ''
        }
      : undefined;

    handleInitiate({
      companyId: company.id,
      companyName: company.display_name,
      company,
      contactId: contact?.id,
      contactName: ctName,
      contact: contactEntity,
      targetType: contact ? 'contact' : 'company_mainline',
      channel,
      contactPhone: p || undefined,
      contactEmail: em || undefined,
      externalUrl,
      e
    });
  };

  const relationshipVal = company.relationship || 'Prospect';

  const handleCycleTemperature = async () => {
    const nextTemp: 'Cold' | 'Warm' | 'Hot' | 'DNC' =
      temperatureVal === 'Cold' ? 'Warm' :
      temperatureVal === 'Warm' ? 'Hot' :
      temperatureVal === 'Hot' ? 'DNC' : 'Cold';
    setTemperatureVal(nextTemp);
    const updated = {
      ...company,
      temperature: nextTemp,
      is_dnc: nextTemp === 'DNC',
      updatedAt: new Date().toISOString()
    };
    await safeSetDoc('companies', company.id, updated);
    await CompanyRepository.saveCompany(updated);
    if (setCompanies) {
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? updated : c)));
    }
  };

  const compPhones = getCompanyPhones(company);
  const compEmails = getCompanyEmails(company);

  // Executive Commercial KPIs
  // 1. Total Pipeline Value
  const totalPipelineValue = useMemo(() => {
    return companyEnquiries.reduce((sum, e) => sum + (Number(e.value_aed) || 0), 0);
  }, [companyEnquiries]);

  // 2. Won Business & Win Rate
  const { wonValue, wonCount, winRate } = useMemo(() => {
    const wonList = companyEnquiries.filter((e) => {
      const st = (e.status || '').toLowerCase();
      return st === 'order received' || st === 'won' || st.includes('closed won') || st.includes('closed-won');
    });
    const wonSum = wonList.reduce((sum, e) => sum + (Number(e.value_aed) || 0), 0);
    const rate = companyEnquiries.length > 0 ? Math.round((wonList.length / companyEnquiries.length) * 100) : 0;
    return {
      wonValue: wonSum,
      wonCount: wonList.length,
      winRate: rate
    };
  }, [companyEnquiries]);

  // 3. Active Enquiries / Proposals Count & Active Pipeline
  const { activeEnquiriesCount, activePipelineValue } = useMemo(() => {
    const activeList = companyEnquiries.filter((e) => {
      const st = (e.status || '').toLowerCase();
      return !['order received', 'won', 'closed won', 'closed-won', 'lost', 'dead', 'cancelled'].includes(st);
    });
    const activeSum = activeList.reduce((sum, e) => sum + (Number(e.value_aed) || 0), 0);
    return {
      activeEnquiriesCount: activeList.length,
      activePipelineValue: activeSum
    };
  }, [companyEnquiries]);

  // 4. Last Contacted relative timestamp & channel
  const lastContactInfo = useMemo(() => {
    if (!companyCallLogs || companyCallLogs.length === 0) {
      return {
        relative: 'No outreach yet',
        formatted: 'No logs recorded',
        channel: 'Never',
        agent: null,
        icon: <Clock className="w-3.5 h-3.5 text-slate-400" />
      };
    }
    const sorted = [...companyCallLogs].sort((a, b) => {
      const dateA = new Date(a.date || (a as any).createdAt || 0).getTime();
      const dateB = new Date(b.date || (b as any).createdAt || 0).getTime();
      return dateB - dateA;
    });
    const latest = sorted[0];
    const timeInfo = formatTimelineDate(latest.date || (latest as any).createdAt);
    const rawChan = (latest.channel || latest.interaction_type || 'Call').toLowerCase();
    let chanLabel = 'Call';
    let icon = <Phone className="w-3.5 h-3.5 text-blue-500" />;
    if (rawChan.includes('whatsapp') || rawChan.includes('message')) {
      chanLabel = 'WhatsApp';
      icon = <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />;
    } else if (rawChan.includes('email') || rawChan.includes('mail')) {
      chanLabel = 'Email';
      icon = <Mail className="w-3.5 h-3.5 text-indigo-500" />;
    } else if (rawChan.includes('meeting') || rawChan.includes('site') || rawChan.includes('visit') || rawChan.includes('task')) {
      chanLabel = 'Meeting / Task';
      icon = <Calendar className="w-3.5 h-3.5 text-amber-500" />;
    }
    const agent = (latest as any).handled_by_team_member_name || latest.sales_person || latest.logged_by || 'Staff';

    return {
      relative: timeInfo.relative,
      formatted: timeInfo.formatted,
      channel: chanLabel,
      agent,
      icon,
      latest
    };
  }, [companyCallLogs]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 lg:p-6 overflow-hidden animate-fade-in">
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        {/* Sticky Executive Dossier Header */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div className="flex items-start space-x-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shrink-0 mt-0.5">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-slate-100 truncate">
                  {company.display_name}
                </h2>

                {/* Canonical Ref Badge CMP-XXXX */}
                <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 flex items-center space-x-1 shrink-0">
                  <Tag className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                  <span>REF: {getReferenceId('CMP', company, companies)}</span>
                </span>

                {/* Google Search shortcut */}
                <GoogleSearchButton
                  companyName={company.canonical_name || company.display_name}
                  location={company.city}
                  size="sm"
                />

                {/* Interactive Temperature / DNC Badge */}
                <TemperatureBadge
                  companyId={company.id}
                  temperature={company.temperature}
                  isDnc={company.is_dnc}
                  variant="pill"
                  companies={companies}
                  setCompanies={setCompanies}
                />

                {/* Relationship Badge */}
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center space-x-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                  <span>{relationshipVal}</span>
                </span>

                {/* Two-Tier Industry Taxonomy Badge */}
                <IndustryBadge
                  company={
                    company
                      ? {
                          ...company,
                          business_type_raw: formatSubTypeName(
                            (company as any).subType || company.business_type_raw
                          )
                        }
                      : company
                  }
                  size="sm"
                  showEmpty
                />

                {/* Internal / Subsidiary Badge */}
                {company.isInternalCompany && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 flex items-center space-x-1 shrink-0">
                    <span>🏢</span>
                    <span>Our Company</span>
                  </span>
                )}

                {company.legal_suffix && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 shrink-0">
                    {company.legal_suffix}
                  </span>
                )}
              </div>

              {/* City & Country Jurisdiction */}
              <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">
                  {company.city ? `${company.city}, ` : ''}{company.country || 'Global Account'}
                </span>
                {company.aliases && company.aliases.length > 0 && (
                  <span className="hidden sm:inline text-slate-400 dark:text-slate-500 text-[11px]">
                    • Aliases: {company.aliases.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
            <button
              type="button"
              onClick={(e) => {
                handleInitiate({
                  companyId: company.id,
                  companyName: company.display_name,
                  company,
                  targetType: 'company_mainline',
                  channel: 'Call',
                  e
                });
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>⚡ Log Activity</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onEditCompany && company) {
                  onClose();
                  onEditCompany(company);
                } else {
                  setInternalEditModalOpen(true);
                }
              }}
              className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
              title="Edit Company Profile in Registry"
            >
              <Edit2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span className="hidden sm:inline">Edit Profile</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition cursor-pointer"
              aria-label="Close dossier"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Executive Commercial KPI Ribbon (4-Card Metric Strip) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* Card 1: Total Pipeline Value */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider font-mono">
              <span>Pipeline Value</span>
              <DollarSign className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-white mt-1 tabular-nums truncate">
              AED {totalPipelineValue.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
              {companyEnquiries.length} {companyEnquiries.length === 1 ? 'quote linked' : 'quotes linked'}
            </div>
          </div>

          {/* Card 2: Won Business & Win Rate */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider font-mono">
              <span>Won Business</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono">
                {winRate}% Won
              </span>
            </div>
            <div className="text-sm sm:text-base font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums truncate">
              AED {wonValue.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
              {wonCount} converted {wonCount === 1 ? 'order' : 'orders'}
            </div>
          </div>

          {/* Card 3: Active Proposals */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider font-mono">
              <span>Active Proposals</span>
              <FileText className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
              {activeEnquiriesCount} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-sans">Active</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
              AED {activePipelineValue.toLocaleString()} in flight
            </div>
          </div>

          {/* Card 4: Last Contacted */}
          <div className="p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider font-mono">
              <span>Last Contacted</span>
              {lastContactInfo.icon}
            </div>
            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-1 truncate" title={lastContactInfo.formatted}>
              {lastContactInfo.relative}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate">
              {lastContactInfo.channel !== 'Never' ? `${lastContactInfo.channel} via ${lastContactInfo.agent}` : 'No outreach recorded'}
            </div>
          </div>
        </div>

        {/* Two-Column Command Grid: Left 45% (Commercial Health & Personnel), Right 55% (Omnichannel Activity Timeline) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* LEFT COLUMN: 45% Commercial Health & Personnel */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-y-auto bg-slate-50/40 dark:bg-slate-900/40 p-3.5 sm:p-4 space-y-3.5">

            {/* Card A: Key Decision Makers & Personnel */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Users2 className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                    Key Decision Makers ({companyContacts.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContactToEdit(null);
                    setContactModalOpen(true);
                  }}
                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/80 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Contact</span>
                </button>
              </div>

              {companyContacts.length === 0 ? (
                <div className="py-6 px-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500 dark:text-slate-400">No personnel saved for this account yet.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedContactToEdit(null);
                      setContactModalOpen(true);
                    }}
                    className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    + Add Primary Contact
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {companyContacts.map((contact) => {
                    const cPhones = getContactPhones(contact);
                    const cEmails = getContactEmails(contact);
                    const firstPhone = cPhones[0]?.value || cPhones[0]?.number || '';
                    const firstEmail = cEmails[0]?.value || cEmails[0]?.email || '';
                    const cleanPhone = firstPhone.trim();
                    const waUrl = getWhatsAppUrl(firstPhone);
                    const isDnc = contact.is_dnc || company.is_dnc;

                    return (
                      <div
                        key={contact.id}
                        className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 hover:bg-slate-100/70 dark:hover:bg-slate-800/80 transition space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                {contact.full_name}
                              </span>
                              {contact.is_primary && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  Primary
                                </span>
                              )}
                              {isDnc && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  DNC
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {contact.designation || 'Decision Maker'}
                            </p>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            {/* Direct Dial Call Trigger */}
                            {cleanPhone && !isDnc && (
                              <button
                                type="button"
                                onClick={(ev) => handleOutboundInteraction(ev, 'Call', contact, undefined, cleanPhone)}
                                className="p-1 rounded bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition cursor-pointer"
                                title={`Call ${cleanPhone} & log interaction`}
                              >
                                <Phone className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                              </button>
                            )}

                            {/* Direct WhatsApp Trigger */}
                            {cleanPhone && !isDnc && (
                              <button
                                type="button"
                                onClick={(ev) => handleOutboundInteraction(ev, 'WhatsApp', contact, waUrl, cleanPhone)}
                                className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                                title={`WhatsApp ${cleanPhone} & log interaction`}
                              >
                                <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              </button>
                            )}

                            {/* Direct Email Trigger */}
                            {firstEmail && (
                              <button
                                type="button"
                                onClick={(ev) => handleOutboundInteraction(ev, 'Email', contact, undefined, undefined, firstEmail)}
                                className="p-1 rounded bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition cursor-pointer"
                                title={`Email ${firstEmail} & log interaction`}
                              >
                                <Mail className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                              </button>
                            )}

                            {/* Edit Contact */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedContactToEdit(contact);
                                setContactModalOpen(true);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition cursor-pointer"
                              title="Edit Contact"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>

                            {/* Delete Contact */}
                            <button
                              type="button"
                              onClick={() => handleDeleteContact(contact)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition cursor-pointer"
                              title="Delete Contact"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Phone & Email labels */}
                        <div className="text-[11px] space-y-0.5 text-slate-600 dark:text-slate-300 font-mono">
                          {cPhones.map((ph, pIdx) => {
                            const pVal = ph.value || ph.number || '';
                            const pRest = company.restricted_lines?.[pVal] || (isDnc ? 'DNC' : undefined);
                            return (
                              <div key={pIdx} className="flex items-center justify-between text-[11px]">
                                <span className={pRest ? 'line-through text-slate-400' : ''}>
                                  {pVal} {ph.label ? `(${ph.label})` : ''}
                                </span>
                                {pRest && (
                                  <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase">
                                    {pRest}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {cEmails.map((em, eIdx) => {
                            const eVal = em.value || em.email || '';
                            return (
                              <div key={eIdx} className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {eVal} {em.label ? `(${em.label})` : ''}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card B: Company Identity & Location */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-3">
              <div className="flex items-center space-x-2">
                <div className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                  Identity & Location
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                {/* Mainline Phones */}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block mb-1">
                    Mainline Phone Lines
                  </span>
                  {compPhones.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No mainline phone recorded</p>
                  ) : (
                    <div className="space-y-1">
                      {compPhones.map((ph, idx) => {
                        const phoneVal = ph.value || ph.number || '';
                        const phoneTrim = phoneVal.trim();
                        const compWaUrl = getWhatsAppUrl(phoneVal);
                        const restriction = company.restricted_lines?.[phoneVal] || company.restricted_lines?.[phoneTrim] || (company.is_dnc ? 'DNC' : undefined);
                        const isRestricted = Boolean(restriction);
                        const badgeText = restriction === 'DNC' ? 'DNC' : 'INVALID';

                        return (
                          <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 font-mono text-[11px]">
                            <div className="flex items-center space-x-1.5 truncate">
                              <Phone className={`w-3 h-3 ${isRestricted ? 'text-rose-500' : 'text-blue-500'} shrink-0`} />
                              <span className={isRestricted ? 'line-through text-slate-400' : 'font-semibold text-slate-800 dark:text-slate-200'}>
                                {phoneVal}
                              </span>
                              {ph.label && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-sans">
                                  {ph.label}
                                </span>
                              )}
                              {isRestricted && (
                                <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-sans">
                                  {badgeText}
                                </span>
                              )}
                            </div>

                            {!isRestricted && (
                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => handleOutboundInteraction(e, 'Call', null, undefined, phoneVal)}
                                  className="p-1 rounded bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition cursor-pointer"
                                  title="Call Mainline"
                                >
                                  <Phone className="w-2.5 h-2.5 text-blue-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleOutboundInteraction(e, 'WhatsApp', null, compWaUrl, phoneVal)}
                                  className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition cursor-pointer"
                                  title="WhatsApp Mainline"
                                >
                                  <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Mainline Emails */}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block mb-1">
                    Primary Email
                  </span>
                  {compEmails.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No corporate email saved</p>
                  ) : (
                    <div className="space-y-1">
                      {compEmails.map((em, idx) => {
                        const emailVal = em.value || em.email || '';
                        return (
                          <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-[11px]">
                            <div className="flex items-center space-x-1.5 truncate">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate font-medium text-slate-700 dark:text-slate-300">{emailVal}</span>
                              {em.label && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-sans">
                                  {em.label}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleOutboundInteraction(e, 'Email', null, undefined, undefined, emailVal)}
                              className="p-1 rounded bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 hover:bg-purple-100 transition cursor-pointer shrink-0"
                              title="Send Email"
                            >
                              <Mail className="w-2.5 h-2.5 text-purple-600" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Website & Jurisdiction */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 flex-wrap gap-2">
                  <div className="flex items-center space-x-1">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Jurisdiction: <strong>{company.city || 'UAE'}, {company.country || 'Global'}</strong></span>
                  </div>

                  {((company as any).website || (company as any).domain) && (
                    <a
                      href={`https://${((company as any).website || (company as any).domain).replace(/^https?:\/\//, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      <Globe className="w-3 h-3" />
                      <span>Visit Site</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Card C: Active Linked Proposals */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1 rounded-md bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                    Active Proposals ({companyEnquiries.length})
                  </h3>
                </div>

                {onCreateEnquiryForCompany && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onCreateEnquiryForCompany(company);
                    }}
                    className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/80 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Quote</span>
                  </button>
                )}
              </div>

              {companyEnquiries.length === 0 ? (
                <div className="py-6 px-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500 dark:text-slate-400">No proposals or quotations registered.</p>
                  {onCreateEnquiryForCompany && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onCreateEnquiryForCompany(company);
                      }}
                      className="mt-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                    >
                      + Generate Proposal
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {companyEnquiries.map((enq) => {
                    const isWon = (enq.status || '').toLowerCase() === 'order received' || (enq.status || '').toLowerCase() === 'won';
                    const isLost = (enq.status || '').toLowerCase() === 'lost' || (enq.status || '').toLowerCase() === 'dead';

                    return (
                      <div
                        key={enq.id}
                        onClick={() => {
                          if (enq.id && onOpenEnquiry) {
                            onClose();
                            onOpenEnquiry(enq.id);
                          }
                        }}
                        className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/90 transition cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                              {enq.quote_ref_no || `QTE-${enq.sn || '001'}`}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                isWon
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : isLost
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                  : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                              }`}
                            >
                              {enq.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                            {enq.subject || 'Commercial Proposal'}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            {enq.enquiry_date || 'Recent'} • {enq.sales_person || 'Assigned Agent'}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white block font-mono">
                            {enq.currency || 'AED'} {(enq.value_aed || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 mt-0.5">
                            <span>View</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: 55% Omnichannel Activity Timeline */}
          <div className="lg:col-span-7 flex flex-col h-full min-h-0 overflow-hidden bg-white dark:bg-slate-900">
            <CompanyActivityTimeline
              historyLogs={companyCallLogs}
              enquiries={companyEnquiries}
              companyName={company.display_name}
              companyId={company.id}
              contacts={companyContacts}
              companies={companies}
              salespersons={salespersons}
              user={user}
              showHeader={true}
              setCallLogs={setCallLogs}
              setCompanies={setCompanies}
              setContacts={setContacts}
              onSelectCallLog={(log) => {
                if (onOpenActivityDrawer) {
                  onOpenActivityDrawer({
                    companyId: company.id,
                    companyName: company.display_name,
                    logToEdit: log
                  });
                }
              }}
              onSelectEnquiry={(id) => {
                if (onOpenEnquiry) {
                  onClose();
                  onOpenEnquiry(id);
                }
              }}
            />
          </div>
        </div>
      </div>

      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => {
          setContactModalOpen(false);
          setSelectedContactToEdit(null);
        }}
        contact={selectedContactToEdit}
        companyId={company.id}
        companies={companies}
        activeWorkspaceId={activeWorkspace?.id || ''}
        user={user}
        setContacts={setContacts}
        setCallLogs={setCallLogs}
      />

      {internalEditModalOpen && company && (
        <CompanyEditModal
          isOpen={internalEditModalOpen}
          onClose={() => setInternalEditModalOpen(false)}
          company={company}
          companyId={company.id}
          companies={companies}
          activeWorkspace={activeWorkspace}
          user={user}
          companyRelationships={companyRelationships}
          setCompanies={setCompanies}
          setCallLogs={setCallLogs}
          onSaved={(savedCompany) => {
            setLocalCompanyOverride(savedCompany);
            if (setCompanies) {
              setCompanies((prev) =>
                prev.map((c) => (c.id === savedCompany.id ? savedCompany : c))
              );
            }
            setInternalEditModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
