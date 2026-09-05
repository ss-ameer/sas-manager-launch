import React, { useState, useEffect, useMemo } from 'react';
import { Company, Contact, Enquiry, CallLogEntry, UserProfile, Workspace, Salesperson, getContactPhones, getContactEmails, getCompanyPhones, getCompanyEmails, DropdownOption } from '../types';
import { getReferenceId } from '../utils/refId';
import ContactModal from './ContactModal';
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
  Globe
} from 'lucide-react';
import { safeDeleteDoc, safeSetDoc, safeUpdateDoc } from '../firebase';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { IndustryBadge } from '../utils/taxonomy';
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
  const [activeSubTab, setActiveSubTab] = useState<'contacts' | 'call_logs' | 'enquiries'>('contacts');
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContactToEdit, setSelectedContactToEdit] = useState<Contact | null>(null);

  const company = companies.find((c) => c.id === companyId);
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
    handleInitiate({
      companyId: company.id,
      companyName: company.display_name,
      company,
      contactId: contact?.id,
      contactName: contact?.full_name,
      contact: contact || undefined,
      targetType: contact ? 'contact' : 'company_mainline',
      channel,
      contactPhone,
      contactEmail,
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

  const getTempBadgeConfig = (temp: string) => {
    const t = temp.toLowerCase();
    if (t === 'dnc') return { label: 'DNC 🚫', className: 'bg-rose-950 text-rose-200 font-black border-rose-600 ring-1 ring-rose-500 shadow-sm shadow-rose-950' };
    if (t === 'hot') return { label: 'Hot 🔥', className: 'bg-rose-500 text-white font-black border-rose-400' };
    if (t === 'warm') return { label: 'Warm 🌤️', className: 'bg-amber-500 text-slate-950 font-black border-amber-400' };
    if (t === 'cold') return { label: 'Cold ❄️', className: 'bg-cyan-500 text-slate-950 font-black border-cyan-400' };
    return { label: temp, className: 'bg-slate-700 text-slate-200 border-slate-600' };
  };

  const compPhones = getCompanyPhones(company);
  const compEmails = getCompanyEmails(company);

  const badgeConfig = getTempBadgeConfig(temperatureVal);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-hidden animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md flex-shrink-0 mt-1">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">{company.display_name}</h2>
                <GoogleSearchButton
                  companyName={company.canonical_name || company.display_name}
                  location={company.city}
                  size="sm"
                />
                <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-slate-800 text-blue-300 border border-slate-700 flex items-center space-x-1">
                  <Tag className="w-3 h-3 text-blue-400" />
                  <span>REF: {getReferenceId('CMP', company, companies)}</span>
                </span>
                {company.isInternalCompany && (
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center space-x-1">
                    <span>🏢</span>
                    <span>Our Company</span>
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {company.legal_suffix}
                </span>

                {/* Relationship Badge */}
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-800 text-blue-200 border border-slate-700 flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                  <span>{relationshipVal}</span>
                </span>

                {/* Interactive Temperature / DNC Badge */}
                <TemperatureBadge
                  companyId={company.id}
                  temperature={company.temperature}
                  isDnc={company.is_dnc}
                  variant="pill"
                  companies={companies}
                  setCompanies={setCompanies}
                />

                {/* Two-Tier Industry Taxonomy Badge */}
                <IndustryBadge company={company} size="sm" showEmpty />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 mt-2">
                <span className="flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {company.city ? `${company.city}, ` : ''}
                    {company.country}
                  </span>
                </span>
              </div>

              {/* Labeled Phones & Emails Display */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 mt-2 pt-2 border-t border-slate-800">
                {compPhones.map((ph, idx) => {
                  const phoneVal = ph.value || ph.number || '';
                  const phoneTrim = phoneVal.trim();
                  const compWaUrl = getWhatsAppUrl(phoneVal);
                  const restriction = company.restricted_lines?.[phoneVal] || company.restricted_lines?.[phoneTrim] || (company.is_dnc ? 'DNC' : undefined);
                  const isRestricted = Boolean(restriction);
                  const badgeText = restriction === 'DNC' ? 'DNC' : 'INVALID';

                  return (
                    <span key={idx} className="flex items-center space-x-1.5 font-mono">
                      <Phone className={`w-3.5 h-3.5 ${isRestricted ? (restriction === 'Invalid' ? 'text-amber-400' : 'text-rose-400') : 'text-blue-400'}`} />
                      {isRestricted ? (
                        <span className="font-bold text-slate-400 line-through cursor-not-allowed" title={`Restricted line (${badgeText})`}>
                          {phoneVal}
                        </span>
                      ) : (
                        <a
                          href={`tel:${phoneVal}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => handleOutboundInteraction(e, 'Call', null)}
                          className="hover:underline font-bold text-blue-300 cursor-pointer"
                        >
                          {phoneVal}
                        </a>
                      )}
                      {!isRestricted && phoneTrim && (
                        <button
                          type="button"
                          onClick={(e) => handleOutboundInteraction(e, 'WhatsApp', null, compWaUrl)}
                          className="px-1.5 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-[10px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                          title="Send WhatsApp & Log Activity"
                        >
                          <MessageSquare className="w-2.5 h-2.5 text-emerald-400" />
                          <span>WA</span>
                        </button>
                      )}
                      <span className="text-[10px] bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded-md font-sans border border-slate-700">
                        {ph.label || 'Landline'}
                      </span>
                      {isRestricted && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold font-sans uppercase border ${
                          restriction === 'Invalid'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                        }`}>
                          {badgeText}
                        </span>
                      )}
                    </span>
                  );
                })}
                {compEmails.map((em, idx) => {
                  const emailVal = em.value || em.email || '';
                  return (
                    <span key={idx} className="flex items-center space-x-1.5 font-sans">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <a
                        href={`mailto:${emailVal}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => handleOutboundInteraction(e, 'Email', null)}
                        className="hover:underline text-slate-200 cursor-pointer"
                      >
                        {emailVal}
                      </a>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded-md font-sans border border-slate-700">
                        {em.label || 'Work'}
                      </span>
                    </span>
                  );
                })}
              </div>

              {company.aliases && company.aliases.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Known Aliases:</span>
                  {company.aliases.map((alias, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                      {alias}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
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
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>⚡ Log Activity</span>
            </button>
            {onEditCompany && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditCompany(company);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                title="Edit Company Profile in Registry"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Edit Company</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveSubTab('contacts')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeSubTab === 'contacts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'
              }`}
            >
              <Users2 className="w-3.5 h-3.5" />
              <span>Contacts ({companyContacts.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('call_logs')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeSubTab === 'call_logs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call Operations ({companyCallLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('enquiries')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeSubTab === 'enquiries'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Proposals & Enquiries ({companyEnquiries.length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={(e) => {
                onClose();
                handleInitiate({
                  companyId: company.id,
                  companyName: company.display_name,
                  company,
                  targetType: 'company_mainline',
                  channel: 'Call',
                  e
                });
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1 shadow-sm transition cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>+ Log Call</span>
            </button>

            {onCreateEnquiryForCompany && (
              <button
                onClick={() => {
                  onClose();
                  onCreateEnquiryForCompany(company);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Proposal</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* TAB 1: CONTACTS */}
          {activeSubTab === 'contacts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Personnel Contacts ({companyContacts.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContactToEdit(null);
                    setContactModalOpen(true);
                  }}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Contact Person</span>
                </button>
              </div>

              {companyContacts.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <Users2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">No contacts registered for this company yet.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Click "Add Contact Person" above to create and link personnel.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {companyContacts.map((contact) => {
                    const cPhones = getContactPhones(contact);
                    const cEmails = getContactEmails(contact);
                    const firstPhone = cPhones[0]?.value || cPhones[0]?.number || contact.mobile || contact.landline || '';
                    const firstCleanPhone = firstPhone.replace(/[^0-9]/g, '');
                    const firstEmail = cEmails[0]?.value || cEmails[0]?.email || contact.email || '';

                    return (
                      <div
                        key={contact.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-blue-300 dark:hover:border-blue-500 transition shadow-sm relative group space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center space-x-1.5 flex-wrap gap-1">
                              <span>{contact.full_name}</span>
                              {contact.is_primary && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                                  Primary
                                </span>
                              )}
                              {contact.is_dnc && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                                  DNC
                                </span>
                              )}
                            </div>
                            {contact.designation && (
                              <p className="text-xs text-slate-500 font-medium mt-0.5">{contact.designation}</p>
                            )}
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedContactToEdit(contact);
                                setContactModalOpen(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg transition flex items-center space-x-1 text-xs font-bold"
                              title="Edit Contact Person"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteContact(contact)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition flex items-center space-x-1 text-xs font-bold"
                              title="Delete Contact Person"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Phone numbers list */}
                        <div className="text-xs space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                          {cPhones.map((p, pIdx) => {
                            const phoneVal = p.value || p.number || '';
                            const phoneTrim = phoneVal.trim();
                            const cleanPhone = sanitizeWhatsAppNumber(phoneVal);
                            const waUrl = getWhatsAppUrl(phoneVal);

                            const restriction = contact.restricted_lines?.[phoneVal] ||
                                                contact.restricted_lines?.[phoneTrim] ||
                                                company.restricted_lines?.[phoneVal] ||
                                                company.restricted_lines?.[phoneTrim] ||
                                                (contact.is_dnc ? 'DNC' : undefined);
                            const isRestricted = Boolean(restriction);
                            const badgeText = restriction === 'DNC' ? 'DNC' : 'INVALID';

                            return (
                              <div key={pIdx} className="flex items-center justify-between text-blue-700 font-mono py-0.5">
                                <div className="flex items-center space-x-2">
                                  <Phone className={`w-3.5 h-3.5 shrink-0 ${isRestricted ? (restriction === 'Invalid' ? 'text-amber-500' : 'text-rose-500') : 'text-blue-500'}`} />
                                  {isRestricted ? (
                                    <span className="font-bold text-slate-400 line-through cursor-not-allowed" title={`Restricted line (${badgeText})`}>
                                      {phoneVal}
                                    </span>
                                  ) : (
                                    <a
                                      href={`tel:${phoneVal}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(ev) => handleOutboundInteraction(ev, 'Call', contact)}
                                      className="hover:underline font-bold cursor-pointer"
                                    >
                                      {phoneVal}
                                    </a>
                                  )}
                                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-sans font-semibold border border-blue-200">
                                    {p.label || 'Mobile'}
                                  </span>
                                  {isRestricted && (
                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold font-sans uppercase border ${
                                      restriction === 'Invalid'
                                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                                    }`}>
                                      {badgeText}
                                    </span>
                                  )}
                                </div>

                                {!isRestricted && (
                                  <div className="flex items-center gap-1">
                                    <a
                                      href={`tel:${phoneVal}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(ev) => handleOutboundInteraction(ev, 'Call', contact)}
                                      className="p-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                                      title="Call Phone"
                                    >
                                      <Phone className="w-3 h-3" />
                                    </a>
                                    {cleanPhone && (
                                      <button
                                        type="button"
                                        onClick={(ev) => handleOutboundInteraction(ev, 'WhatsApp', contact, waUrl)}
                                        className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer font-sans"
                                        title="Send WhatsApp & Log Activity"
                                      >
                                        <MessageSquare className="w-3 h-3 text-emerald-600" />
                                        <span>WhatsApp</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Emails list */}
                          {cEmails.map((e, eIdx) => {
                            const emailVal = e.value || e.email || '';
                            return (
                              <div key={eIdx} className="flex items-center justify-between text-slate-600 font-sans truncate py-0.5">
                                <div className="flex items-center space-x-2 truncate">
                                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <a
                                    href={`mailto:${emailVal}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(ev) => handleOutboundInteraction(ev, 'Email', contact)}
                                    className="hover:underline truncate text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                                  >
                                    {emailVal}
                                  </a>
                                  {e.label && (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold shrink-0 border border-slate-200">
                                      {e.label}
                                    </span>
                                  )}
                                </div>
                                <a
                                  href={`mailto:${emailVal}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(ev) => handleOutboundInteraction(ev, 'Email', contact)}
                                  className="p-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition shrink-0 ml-1"
                                  title="Send Email"
                                >
                                  <Mail className="w-3 h-3 text-purple-600" />
                                </a>
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
          )}

          {/* TAB 2: CALL LOGS */}
          {activeSubTab === 'call_logs' && (
            <div className="space-y-3">
              {companyCallLogs.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <PhoneCall className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">No call operations recorded for this company yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {companyCallLogs.map((log) => {
                    const type = (log.interaction_type || '').toLowerCase();
                    return (
                      <div key={log.id} className="p-4 hover:bg-slate-50 transition">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            {/* Dynamic Leading History Symbol */}
                            <div className={`p-1.5 rounded-lg border flex items-center justify-center shrink-0 ${
                              type.includes('email') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                              type.includes('message') || type.includes('whatsapp') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              type.includes('meeting') || type.includes('visit') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {type.includes('email') ? <Mail className="w-3.5 h-3.5" /> :
                               type.includes('message') || type.includes('whatsapp') ? <MessageSquare className="w-3.5 h-3.5" /> :
                               type.includes('meeting') || type.includes('visit') ? <Calendar className="w-3.5 h-3.5" /> :
                               <PhoneCall className="w-3.5 h-3.5" />}
                            </div>
                            <span className="text-xs font-bold text-slate-900">{log.date}</span>
                            {(() => {
                              const st = log.status || '';
                              const stLower = st.toLowerCase();
                              const isComp = isSuccessStatus(st);
                              const isInv = stLower === 'invalid number' || stLower === 'cancelled' || stLower.includes('invalid') || stLower.includes('wrong') || stLower.includes('dnc') || stLower.includes('blocked') || stLower.includes('failed') || stLower.includes('bounced') || stLower.includes('no show');
                              const isNoAns = stLower.includes('no answer') || stLower.includes('busy') || stLower.includes('voicemail') || stLower.includes('dropped') || stLower.includes('rescheduled');
                              const badgeStyle = isComp
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : isInv
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : isNoAns
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-blue-50 text-blue-800 border-blue-200';
                              return (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeStyle}`}>
                                  {log.status}
                                </span>
                              );
                            })()}
                            {(() => {
                              const normChan = (log.channel || log.interaction_type || '').toLowerCase();
                              const isAsync = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
                              if (isAsync && log.purpose) {
                                return (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {log.purpose}
                                  </span>
                                );
                              }
                              if (log.outcome) {
                                return (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    {log.outcome}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          <span className="text-xs text-slate-500 font-semibold">
                            Logged by: {log.logged_by}
                          </span>
                        </div>

                        {log.contact_name && (
                          <p className="text-xs text-slate-600 font-semibold mt-1">
                            Contact: {log.contact_name} {log.contact_phone ? `(${log.contact_phone})` : ''}
                          </p>
                        )}

                        {log.requirement_notes && (
                          <p className="text-xs text-slate-700 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            {log.requirement_notes}
                          </p>
                        )}

                        {log.next_followup_date && (
                          <div className="mt-2 text-[11px] font-bold text-amber-700 flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Follow-up scheduled for: {log.next_followup_date}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ENQUIRIES */}
          {activeSubTab === 'enquiries' && (
            <div className="space-y-3">
              {companyEnquiries.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">No proposals or enquiries created for this company yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {companyEnquiries.map((enq) => (
                    <div
                      key={enq.id}
                      onClick={() => {
                        if (enq.id && onOpenEnquiry) {
                          onClose();
                          onOpenEnquiry(enq.id);
                        }
                      }}
                      className="p-4 hover:bg-slate-50 transition cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-blue-600 text-sm">{enq.quote_ref_no}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              enq.status === 'Order Received'
                                ? 'bg-emerald-100 text-emerald-800'
                                : enq.status === 'Lost' || enq.status === 'Dead'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {enq.status}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-1">{enq.subject || 'Technical Enquiry'}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Date: {enq.enquiry_date} | Agent: {enq.sales_person}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black text-slate-900 block font-mono">
                          {enq.currency || 'AED'} {(enq.value_aed || 0).toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-blue-600 hover:underline flex items-center justify-end space-x-1 mt-1">
                          <span>View Detail</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
    </div>
  );
}
