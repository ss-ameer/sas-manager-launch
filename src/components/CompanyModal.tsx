import React, { useState, useMemo, useEffect } from 'react';
import { CustomLabelSelect, PHONE_LABEL_DEFAULT_OPTIONS, EMAIL_LABEL_DEFAULT_OPTIONS } from './CustomLabelSelect';
import { Company, Contact, Enquiry, UserProfile, LegalSuffix, Workspace, getContactPhones, getContactEmails, getCompanyPhones, getCompanyEmails, LabeledPhone, LabeledEmail, PhoneCategory, DropdownOption, CallLogEntry, Salesperson, ContactMethod, isSamePhoneNumber } from '../types';
import { getReferenceId } from '../utils/refId';
import { recordAuditLog } from '../utils/auditLogger';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import ContactModal, { normalizePhoneKey, getLineRestriction } from './ContactModal';
import ContactDetailModal from './ContactDetailModal';
import CallLogDetailModal from './CallLogDetailModal';
import { db } from '../firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import {
  safeAddDoc,
  safeUpdateDoc,
  safeDeleteDoc,
  safeSetDoc
} from '../firebase';
import {
  Building2,
  Users2,
  Phone,
  Mail,
  MapPin,
  Search,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  Merge,
  Edit,
  Clipboard,
  Check,
  FileText,
  Loader2,
  Printer,
  Download,
  PhoneCall,
  ExternalLink,
  ShieldAlert,
  Tag,
  Filter,
  LayoutGrid,
  Table,
  ChevronDown,
  ChevronRight,
  History,
  ChevronUp,
  Zap,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { isRecordOwner, canUserClickRecord, getSalespersonFullName } from '../utils/permissions';
import { computeCanonicalName, generateCompanySearchTerms } from '../utils/defaults';
import DuplicateMatchModal from './DuplicateMatchModal';
import { findDuplicateCompany, findDuplicateContact } from '../utils/fuzzyMatch';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';

interface CompanyModalProps {
  companies: Company[];
  contacts: Contact[];
  enquiries: Enquiry[];
  callLogs?: CallLogEntry[];
  salespersons?: Salesperson[];
  onSelectEnquiry?: (id: string) => void;
  user: UserProfile;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  activeWorkspace?: Workspace;
  companyRelationships?: DropdownOption[];
  companyTemperatures?: DropdownOption[];
  onOpenCompany360?: (companyId: string) => void;
  initialSelectedCompanyId?: string | null;
  initialOpenEdit?: boolean;
  companyEditTrigger?: number;
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
  onOpenMobileMenu?: () => void;
}

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
  } catch (e) {
    return dateStr;
  }
}

export function sanitizeWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('05') && digits.length === 10) {
    return '971' + digits.substring(1);
  }
  return digits;
}

export default function CompanyModal({
  companies,
  contacts,
  enquiries,
  callLogs = [],
  salespersons = [],
  onSelectEnquiry,
  user,
  setCompanies,
  setContacts,
  setEnquiries,
  setSalespersons,
  setCallLogs,
  activeWorkspace,
  companyRelationships,
  companyTemperatures,
  onOpenCompany360,
  initialSelectedCompanyId,
  initialOpenEdit,
  companyEditTrigger,
  onOpenActivityDrawer,
  onOpenMobileMenu
}: CompanyModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const handleCycleCompanyTemperature = async (comp: Company) => {
    const curTemp = comp.temperature || (comp.is_dnc ? 'DNC' : 'Cold');
    const nextTemp: 'Cold' | 'Warm' | 'Hot' | 'DNC' =
      curTemp === 'Cold' ? 'Warm' :
      curTemp === 'Warm' ? 'Hot' :
      curTemp === 'Hot' ? 'DNC' : 'Cold';
    const updatedComp = {
      ...comp,
      temperature: nextTemp,
      is_dnc: nextTemp === 'DNC',
      updatedAt: new Date().toISOString()
    };
    await safeSetDoc('companies', comp.id, updatedComp);
    await CompanyRepository.saveCompany(updatedComp);
    if (setCompanies) {
      setCompanies((prev) => prev.map((c) => (c.id === comp.id ? updatedComp : c)));
    }
  };

  const getCompanyTempBadge = (tempVal?: string, isDnc?: boolean) => {
    const val = (tempVal || (isDnc ? 'DNC' : 'Cold')).toLowerCase();
    if (val === 'dnc') {
      return {
        label: 'DNC 🚫',
        className: 'bg-rose-950 text-rose-200 border-rose-600 font-black ring-1 ring-rose-500 shadow-xs'
      };
    }
    if (val === 'hot') {
      return {
        label: 'Hot 🔥',
        className: 'bg-rose-500 text-white border-rose-600 font-black'
      };
    }
    if (val === 'warm') {
      return {
        label: 'Warm 🌤️',
        className: 'bg-amber-500 text-slate-950 border-amber-600 font-black'
      };
    }
    return {
      label: 'Cold ❄️',
      className: 'bg-cyan-500 text-slate-950 border-cyan-600 font-black'
    };
  };
  const [viewMode, setViewMode] = useState<'companies' | 'contacts' | 'phones'>('companies');
  const [relationshipFilter, setRelationshipFilter] = useState<string>('ALL');
  const [temperatureFilter, setTemperatureFilter] = useState<string>('ALL');
  const [companyViewStyle, setCompanyViewStyle] = useState<'cards' | 'table'>('table');
  const [contactViewStyle, setContactViewStyle] = useState<'table' | 'cards'>('table');
  const [isRegistryCollapsed, setIsRegistryCollapsed] = useState(false);

  // Multi-select Contact State & Bulk Reassign State
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [showBulkReassignModal, setShowBulkReassignModal] = useState(false);
  const [bulkReassignCompanyId, setBulkReassignCompanyId] = useState('');

  // Explicit Company Deletion Choice State
  const [companyToDelete, setCompanyToDelete] = useState<{ id: string; name: string; contactCount: number } | null>(null);
  const [deleteContactChoice, setDeleteContactChoice] = useState<'unlink' | 'cascade'>('unlink');
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  // Contact Detail Popup Modal State & Contact Deletion Confirmation State
  const [selectedContactDetail, setSelectedContactDetail] = useState<Contact | null>(null);
  const [contactToDeleteConfirm, setContactToDeleteConfirm] = useState<{ contact: Contact; linkedEnquiriesCount: number } | null>(null);

  // Outreach History Side Panel & Call Detail Modal State
  const [isHistorySidePanelExpanded, setIsHistorySidePanelExpanded] = useState(true);
  const [selectedCallLogDetail, setSelectedCallLogDetail] = useState<CallLogEntry | null>(null);

  // Computed Contacts with Company Name for People Directory
  const allContactsWithCompany = useMemo(() => {
    return (contacts || [])
      .filter((ct) => !ct.is_deleted)
      .map((ct) => {
        const comp = companies.find((c) => c.id === ct.company_id && !c.is_deleted);
        return {
          ...ct,
          companyName: comp ? comp.display_name : '(Unassigned / Independent)',
          location: comp ? `${comp.city}, ${comp.country}` : '—'
        };
      });
  }, [contacts, companies]);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return allContactsWithCompany;
    const q = searchQuery.toLowerCase();
    return allContactsWithCompany.filter(
      (ct) =>
        getReferenceId('CT', ct, contacts).toLowerCase().includes(q) ||
        (ct.id && ct.id.toLowerCase().includes(q)) ||
        ct.full_name.toLowerCase().includes(q) ||
        (ct.designation && ct.designation.toLowerCase().includes(q)) ||
        (ct.companyName && ct.companyName.toLowerCase().includes(q)) ||
        (ct.mobile && ct.mobile.toLowerCase().includes(q)) ||
        (ct.email && ct.email.toLowerCase().includes(q))
    );
  }, [allContactsWithCompany, searchQuery]);

  // Computed Phones List for Tel Directory
  const allPhoneEntries = useMemo(() => {
    const list: Array<{
      id: string;
      number: string;
      type: 'Mobile' | 'Landline' | 'Company Switchboard';
      entityName: string;
      subText?: string;
      companyId?: string;
      contactId?: string;
      location?: string;
      isDnc?: boolean;
      restriction?: 'DNC' | 'Invalid';
    }> = [];

    companies.forEach((c) => {
      if (c.general_phone) {
        const restriction = getLineRestriction(c.restricted_lines, c.general_phone, c.is_dnc || c.temperature === 'DNC');
        list.push({
          id: `comp_phone_${c.id}`,
          number: c.general_phone,
          type: 'Company Switchboard',
          entityName: c.display_name,
          companyId: c.id,
          location: `${c.city}, ${c.country}`,
          isDnc: c.is_dnc || c.temperature === 'DNC',
          restriction
        });
      }
    });

    contacts.forEach((ct) => {
      const comp = companies.find((c) => c.id === ct.company_id);
      const loc = comp ? `${comp.city}, ${comp.country}` : 'UAE';
      if (ct.mobile) {
        const restriction = getLineRestriction(ct.restricted_lines, ct.mobile) || getLineRestriction(comp?.restricted_lines, ct.mobile, ct.is_dnc || comp?.is_dnc);
        list.push({
          id: `ct_mob_${ct.id}`,
          number: ct.mobile,
          type: 'Mobile',
          entityName: ct.full_name,
          subText: `${ct.designation ? ct.designation + ' @ ' : ''}${comp ? comp.display_name : 'Unassigned'}`,
          companyId: ct.company_id,
          contactId: ct.id,
          location: loc,
          isDnc: ct.is_dnc || comp?.is_dnc,
          restriction
        });
      }
      if (ct.landline) {
        const restriction = getLineRestriction(ct.restricted_lines, ct.landline) || getLineRestriction(comp?.restricted_lines, ct.landline, ct.is_dnc || comp?.is_dnc);
        list.push({
          id: `ct_land_${ct.id}`,
          number: ct.landline,
          type: 'Landline',
          entityName: ct.full_name,
          subText: `${ct.designation ? ct.designation + ' @ ' : ''}${comp ? comp.display_name : 'Unassigned'}`,
          companyId: ct.company_id,
          contactId: ct.id,
          location: loc,
          isDnc: ct.is_dnc || comp?.is_dnc,
          restriction
        });
      }
    });

    return list;
  }, [companies, contacts]);

  const filteredPhones = useMemo(() => {
    if (!searchQuery.trim()) return allPhoneEntries;
    const q = searchQuery.toLowerCase();
    return allPhoneEntries.filter(
      (p) =>
        p.number.toLowerCase().includes(q) ||
        p.entityName.toLowerCase().includes(q) ||
        (p.subText && p.subText.toLowerCase().includes(q))
    );
  }, [allPhoneEntries, searchQuery]);

  // Export functions
  const handleExportDirectoryCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = 'Directory_Export.csv';

    if (viewMode === 'companies') {
      filename = 'Companies_Registry.csv';
      headers = ['Canonical Name', 'Legal Suffix', 'Display Name', 'City', 'Country', 'General Phone', 'General Email', 'Aliases'];
      rows = (companies || []).map((c) => [
        `"${c.canonical_name || ''}"`,
        `"${c.legal_suffix || ''}"`,
        `"${c.display_name || ''}"`,
        `"${c.city || ''}"`,
        `"${c.country || ''}"`,
        `"${c.general_phone || ''}"`,
        `"${c.general_email || ''}"`,
        `"${(c.aliases || []).join('; ')}"`
      ]);
    } else if (viewMode === 'contacts') {
      filename = 'People_Contacts_Directory.csv';
      headers = ['Contact Name', 'Primary', 'Designation', 'Company Name', 'Mobile', 'Landline', 'Email'];
      rows = filteredContacts.map((ct) => [
        `"${ct.full_name || ''}"`,
        `"${ct.is_primary ? 'Yes' : 'No'}"`,
        `"${ct.designation || ''}"`,
        `"${ct.companyName || ''}"`,
        `"${ct.mobile || ''}"`,
        `"${ct.landline || ''}"`,
        `"${ct.email || ''}"`
      ]);
    } else {
      filename = 'Telecom_Phone_Directory.csv';
      headers = ['Phone Number', 'Type', 'Entity Name', 'Details / Company', 'Location', 'DNC Status'];
      rows = filteredPhones.map((p) => [
        `"${p.number || ''}"`,
        `"${p.type || ''}"`,
        `"${p.entityName || ''}"`,
        `"${p.subText || ''}"`,
        `"${p.location || ''}"`,
        `"${p.isDnc ? 'DNC' : 'Active'}"`
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintDirectoryPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to open printable report.');
      return;
    }

    const titleText =
      viewMode === 'companies'
        ? 'Companies Registry Directory'
        : viewMode === 'contacts'
        ? 'People & Contacts Directory'
        : 'Telecom Phone & Number Directory';

    let tableHtml = '';

    if (viewMode === 'companies') {
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Company Display Name</th>
              <th>Canonical Name</th>
              <th>Location</th>
              <th>General Phone</th>
              <th>General Email</th>
            </tr>
          </thead>
          <tbody>
            ${(companies || [])
              .map(
                (c) => `
              <tr>
                <td><strong>${c.display_name}</strong></td>
                <td>${c.canonical_name} (${c.legal_suffix})</td>
                <td>${c.city}, ${c.country}</td>
                <td>${c.general_phone || '-'}</td>
                <td>${c.general_email || '-'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else if (viewMode === 'contacts') {
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Contact Name</th>
              <th>Designation</th>
              <th>Company Name</th>
              <th>Mobile</th>
              <th>Landline</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            ${filteredContacts
              .map(
                (ct) => `
              <tr>
                <td><strong>${ct.full_name} ${ct.is_primary ? '(Primary)' : ''}</strong></td>
                <td>${ct.designation || '-'}</td>
                <td>${ct.companyName}</td>
                <td>${ct.mobile || '-'}</td>
                <td>${ct.landline || '-'}</td>
                <td>${ct.email || '-'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } else {
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Phone Number</th>
              <th>Type</th>
              <th>Name / Person</th>
              <th>Company / Role</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPhones
              .map(
                (p) => `
              <tr>
                <td style="font-family:monospace; font-weight:bold;">${p.number}</td>
                <td>${p.type}</td>
                <td><strong>${p.entityName}</strong></td>
                <td>${p.subText || '-'}</td>
                <td>${p.location || '-'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${titleText}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; }
            h1 { font-size: 20px; font-weight: 800; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
            th { background: #0f172a; color: white; text-align: left; padding: 8px 10px; font-weight: 700; }
            td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
            tr:nth-child(even) { background: #f8fafc; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>${titleText} (${activeWorkspace?.name || 'Workspace'})</h1>
          <p style="font-size:11px; color:#64748b;">Generated on ${new Date().toLocaleString()}</p>
          ${tableHtml}
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Form states
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [canonicalName, setCanonicalName] = useState('');
  const [legalSuffix, setLegalSuffix] = useState<LegalSuffix>('LLC');
  const [country, setCountry] = useState('UAE');
  const [city, setCity] = useState('');
  const [generalPhone, setGeneralPhone] = useState('');
  const [generalEmail, setGeneralEmail] = useState('');
  const [companyPhones, setCompanyPhones] = useState<ContactMethod[]>([{ id: 'init_p1', label: 'Landline', value: '' }]);
  const [companyEmails, setCompanyEmails] = useState<ContactMethod[]>([{ id: 'init_e1', label: 'Work', value: '' }]);
  const [editingRestrictedLines, setEditingRestrictedLines] = useState<Record<string, 'DNC' | 'Invalid'>>({});

  const togglePhoneRestriction = (phoneVal: string) => {
    const normKey = normalizePhoneKey(phoneVal);
    if (!normKey) return;

    setEditingRestrictedLines((prev) => {
      const current = prev[normKey] || prev[phoneVal.trim()] || prev[phoneVal];
      const nextMap = { ...prev };

      if (!current) {
        nextMap[normKey] = 'Invalid';
      } else if (current === 'Invalid') {
        nextMap[normKey] = 'DNC';
      } else {
        delete nextMap[normKey];
        delete nextMap[phoneVal.trim()];
        delete nextMap[phoneVal];
      }
      return nextMap;
    });
  };
  const [relationship, setRelationship] = useState<string>('Prospect');
  const [temperature, setTemperature] = useState<string>('Cold');
  const [notes, setNotes] = useState('');
  const [aliasesInput, setAliasesInput] = useState('');

  // Contact Modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [selectedCompanyForContact, setSelectedCompanyForContact] = useState<string>('');

  // Contact Form states
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactDesignation, setContactDesignation] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [contactLandline, setContactLandline] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  // Duplication warning states
  const [duplicateWarning, setDuplicateWarning] = useState<Company | null>(null);
  const [pendingBypass, setPendingBypass] = useState(false);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Merge states
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const isEditable = user.role !== 'Viewer';

  // Helper state for fuzzy match duplicate dialog
  const [duplicateMatchResult, setDuplicateMatchResult] = useState<{
    match: Company;
    similarity: number;
    reason: string;
  } | null>(null);

  const generateCmId = () => `cm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const closeCompanyModal = () => {
    setShowAddCompany(false);
    setEditingCompany(null);
    setCanonicalName('');
    setLegalSuffix('None / To Be Added Later');
    setCountry('UAE');
    setCity('');
    setGeneralPhone('');
    setGeneralEmail('');
    setCompanyPhones([{ id: generateCmId(), label: 'Landline', value: '' }]);
    setCompanyEmails([{ id: generateCmId(), label: 'Work', value: '' }]);
    setEditingRestrictedLines({});
    setRelationship('Prospect');
    setTemperature('Cold');
    setNotes('');
    setAliasesInput('');
    setDuplicateMatchResult(null);
    setPendingBypass(false);
    setIsSavingCompany(false);
  };

  const handleOpenAddCompany = () => {
    setEditingCompany(null);
    setCanonicalName('');
    setLegalSuffix('None / To Be Added Later');
    setCountry('UAE');
    setCity('');
    setGeneralPhone('');
    setGeneralEmail('');
    setCompanyPhones([{ id: generateCmId(), label: 'Landline', value: '' }]);
    setCompanyEmails([{ id: generateCmId(), label: 'Work', value: '' }]);
    setEditingRestrictedLines({});
    setRelationship('Prospect');
    setTemperature('Cold');
    setNotes('');
    setAliasesInput('');
    setDuplicateMatchResult(null);
    setPendingBypass(false);
    setShowAddCompany(true);
  };

  const handleOpenEditCompany = (comp: Company) => {
    setEditingCompany(comp);
    let baseName = comp.display_name || comp.canonical_name || '';
    if (comp.legal_suffix && comp.legal_suffix !== 'None / Other' && comp.legal_suffix !== 'None / To Be Added Later') {
      const suffixWithSpace = ` ${comp.legal_suffix}`;
      if (baseName.endsWith(suffixWithSpace)) {
        baseName = baseName.slice(0, -suffixWithSpace.length);
      }
    }
    setCanonicalName(baseName);
    setLegalSuffix(comp.legal_suffix);
    setCountry(comp.country);
    setCity(comp.city);
    setGeneralPhone(comp.general_phone || comp.phone || '');
    setGeneralEmail(comp.general_email || comp.email || '');
    if (comp.restricted_lines) {
      const normMap: Record<string, 'DNC' | 'Invalid'> = {};
      Object.entries(comp.restricted_lines).forEach(([k, v]) => {
        const normK = normalizePhoneKey(k);
        if (normK) normMap[normK] = v;
        normMap[k.trim()] = v;
      });
      setEditingRestrictedLines(normMap);
    } else {
      setEditingRestrictedLines({});
    }

    const existingPhones = getCompanyPhones(comp);
    const mappedPhones: ContactMethod[] = existingPhones.map((p) => ({
      id: p.id || generateCmId(),
      label: p.label || 'Main',
      value: p.value || p.number || ''
    }));
    setCompanyPhones(
      mappedPhones.length > 0
        ? mappedPhones
        : [{ id: generateCmId(), label: 'Main', value: comp.general_phone || comp.phone || '' }]
    );

    const existingEmails = getCompanyEmails(comp);
    const mappedEmails: ContactMethod[] = existingEmails.map((e) => ({
      id: e.id || generateCmId(),
      label: e.label || 'Main',
      value: e.value || e.email || ''
    }));
    setCompanyEmails(
      mappedEmails.length > 0
        ? mappedEmails
        : [{ id: generateCmId(), label: 'Main', value: comp.general_email || comp.email || '' }]
    );

    setRelationship(comp.relationship || 'Prospect');
    setTemperature(comp.temperature || 'Cold');
    setNotes(comp.notes || '');
    setAliasesInput((comp.aliases || []).join(', '));
    setDuplicateMatchResult(null);
    setPendingBypass(false);
    setShowAddCompany(true);
  };

  useEffect(() => {
    if (initialSelectedCompanyId) {
      setSelectedCompanyId(initialSelectedCompanyId);
      if (initialOpenEdit) {
        const comp = companies.find((c) => c.id === initialSelectedCompanyId);
        if (comp) {
          handleOpenEditCompany(comp);
        } else {
          closeCompanyModal();
        }
      }
    } else {
      closeCompanyModal();
    }
  }, [initialSelectedCompanyId, initialOpenEdit, companyEditTrigger]);

  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canonicalName.trim()) return;

    // Check fuzzy duplicate match if not editing and not bypassed
    if (!editingCompany && !pendingBypass) {
      const matchRes = findDuplicateCompany(canonicalName, companies);
      if (matchRes) {
        setDuplicateMatchResult(matchRes);
        return;
      }
    }

    const aliasesArr = aliasesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const displayName =
      legalSuffix === 'None / Other' || legalSuffix === 'None / To Be Added Later'
        ? canonicalName.trim()
        : `${canonicalName.trim()} ${legalSuffix}`;

    if (isSavingCompany) return;
    setIsSavingCompany(true);

    if (!activeWorkspace?.id) {
      setIsSavingCompany(false);
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    const validPhones = companyPhones.filter((p) => p.value.trim() !== '');
    const validEmails = companyEmails.filter((e) => e.value.trim() !== '');

    const legacyPhones = validPhones.map((p) => ({ id: p.id, label: p.label, number: p.value, value: p.value }));
    const legacyEmails = validEmails.map((e) => ({ id: e.id, label: e.label, email: e.value, value: e.value }));

    const primaryPhoneVal = validPhones[0]?.value ? validPhones[0].value.trim() : '';
    const primaryEmailVal = validEmails[0]?.value ? validEmails[0].value.trim() : '';

    const computedCanonicalName = computeCanonicalName(displayName) || canonicalName.trim().toLowerCase();
    const searchTerms = generateCompanySearchTerms(displayName, city, legacyPhones.length > 0 ? legacyPhones : [{ number: primaryPhoneVal }]);

    const rawCompany: Omit<Company, 'id'> = {
      workspace_id: activeWorkspace.id,
      canonical_name: computedCanonicalName,
      legal_suffix: legalSuffix,
      display_name: displayName,
      aliases: aliasesArr,
      country: country.trim(),
      city: city.trim(),
      general_phone: primaryPhoneVal,
      general_email: primaryEmailVal,
      phone: primaryPhoneVal,
      email: primaryEmailVal,
      general_phones: validPhones,
      general_emails: validEmails,
      phones: legacyPhones as any,
      emails: legacyEmails as any,
      restricted_lines: editingRestrictedLines,
      relationship,
      temperature,
      is_dnc: temperature === 'DNC',
      notes: notes.trim(),
      search_terms: searchTerms,
      created_by_uid: editingCompany?.created_by_uid || user?.uid || '',
      created_by_name: editingCompany?.created_by_name || user?.full_name || user?.username || user?.email || 'Unknown User',
      last_modified_by_uid: user?.uid || '',
      last_modified_by_name: user?.full_name || user?.username || user?.email || 'Unknown User',
      createdAt: editingCompany?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingCompany && editingCompany.id) {
        const updatedComp: Company = { id: editingCompany.id, ...rawCompany };
        await safeUpdateDoc('companies', editingCompany.id, {
          ...rawCompany,
          restricted_lines: editingRestrictedLines
        });
        await CompanyRepository.updateCompany(editingCompany.id, updatedComp);
        await logAudit(editingCompany.id, 'company', 'update', editingCompany, rawCompany);

        if (setCompanies) {
          setCompanies((prev) => prev.map((c) => (c.id === editingCompany.id ? updatedComp : c)));
        }

        if (setCallLogs) {
          const newName = updatedComp.display_name || updatedComp.canonical_name;
          setCallLogs((prevLogs) =>
            prevLogs.map((log) =>
              log.company_id === editingCompany.id
                ? { ...log, company_name: newName, updatedAt: new Date().toISOString() }
                : log
            )
          );
        }
      } else {
        const res = await safeAddDoc('companies', rawCompany);
        const newId = res?.id || ('comp_' + Date.now());
        const newComp: Company = { id: newId, ...rawCompany };
        await CompanyRepository.saveCompany(newComp);
        await logAudit(newId, 'company', 'create', null, rawCompany);

        if (setCompanies) {
          setCompanies((prev) => [newComp, ...prev.filter((c) => c.id !== newId)]);
        }
        setSelectedCompanyId(newId);
      }
      // Reset State
      closeCompanyModal();
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleDeleteContact = (contactId: string) => {
    if (!contactId) return;
    const targetCt = contacts.find((c) => c.id === contactId);
    if (!targetCt) return;

    const linkedEnquiries = enquiries.filter(
      (e) => e.contact_id === contactId
    );

    setContactToDeleteConfirm({
      contact: targetCt,
      linkedEnquiriesCount: linkedEnquiries.length
    });
  };

  const executeDeleteContact = async () => {
    if (!contactToDeleteConfirm) return;
    const { contact: targetCt, linkedEnquiriesCount } = contactToDeleteConfirm;
    const contactId = targetCt.id!;

    try {
      if (linkedEnquiriesCount > 0) {
        const linked = enquiries.filter(
          (e) => e.contact_id === contactId
        );
        for (const enq of linked) {
          if (enq.id) {
            await safeUpdateDoc('enquiries', enq.id, {
              contact_id: ''
            });
          }
        }
        if (setEnquiries) {
          setEnquiries((prev) =>
            prev.map((e) =>
              e.contact_id === contactId
                ? { ...e, contact_id: '' }
                : e
            )
          );
        }
      }

      if (setContacts) {
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
      }
      setSelectedContactIds((prev) => prev.filter((id) => id !== contactId));

      await safeDeleteDoc('contacts', contactId);

      try {
        await recordAuditLog({
          document_id: contactId,
          entity_type: 'contact',
          entity_title: targetCt.full_name,
          action: 'delete',
          user,
          before: targetCt,
          details: `Deleted contact person: "${targetCt.full_name}" (unlinked ${linkedEnquiriesCount} enquiries)`
        });
      } catch (aErr) {
        console.warn('Audit log error on contact deletion:', aErr);
      }
    } catch (err: any) {
      alert('Failed to delete contact: ' + (err?.message || err));
    } finally {
      setContactToDeleteConfirm(null);
    }
  };

  const handleToggleSelectContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllContacts = () => {
    const allFilteredIds = filteredContacts.map((c) => c.id!).filter(Boolean);
    const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedContactIds.includes(id));
    if (isAllSelected) {
      setSelectedContactIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedContactIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleBulkDeleteContacts = async () => {
    if (selectedContactIds.length === 0) return;

    try {
      const idsToDelete = [...selectedContactIds];
      for (const id of idsToDelete) {
        await safeDeleteDoc('contacts', id);
        const targetCt = contacts.find((c) => c.id === id);
        if (targetCt) {
          try {
            await recordAuditLog({
              document_id: id,
              entity_type: 'contact',
              entity_title: targetCt.full_name,
              action: 'delete',
              user,
              before: targetCt,
              details: `Bulk deleted contact person: "${targetCt.full_name}"`
            });
          } catch (e) {}
        }
      }

      if (setContacts) {
        setContacts((prev) => prev.filter((c) => !idsToDelete.includes(c.id!)));
      }
      setSelectedContactIds([]);
    } catch (err: any) {
      alert('Failed to perform bulk delete: ' + (err?.message || err));
    }
  };

  const handleBulkMarkDnc = async (isDnc: boolean) => {
    if (selectedContactIds.length === 0) return;
    try {
      const idsToUpdate = [...selectedContactIds];
      for (const id of idsToUpdate) {
        await safeUpdateDoc('contacts', id, { is_dnc: isDnc });
      }
      if (setContacts) {
        setContacts((prev) =>
          prev.map((c) => (c.id && idsToUpdate.includes(c.id) ? { ...c, is_dnc: isDnc } : c))
        );
      }
      setSelectedContactIds([]);
    } catch (err: any) {
      alert('Failed to update DNC status: ' + (err?.message || err));
    }
  };

  const handleBulkExportContacts = () => {
    if (selectedContactIds.length === 0) return;
    const selectedList = filteredContacts.filter((c) => c.id && selectedContactIds.includes(c.id));
    const headers = ['Contact Name', 'Designation', 'Company Name', 'Mobile', 'Email', 'Is Primary', 'DNC Status'];
    const rows = selectedList.map((ct) => [
      ct.full_name || '',
      ct.designation || '',
      ct.companyName || '',
      ct.mobile || '',
      ct.email || '',
      ct.is_primary ? 'Yes' : 'No',
      ct.is_dnc ? 'Yes' : 'No'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.map(val => `"${(val || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `OmniContacts_Export_${selectedList.length}_Records.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExecuteBulkReassign = async () => {
    if (selectedContactIds.length === 0 || !bulkReassignCompanyId) return;
    try {
      const idsToUpdate = [...selectedContactIds];
      for (const id of idsToUpdate) {
        await safeUpdateDoc('contacts', id, { company_id: bulkReassignCompanyId });
      }
      if (setContacts) {
        setContacts((prev) =>
          prev.map((c) => (c.id && idsToUpdate.includes(c.id) ? { ...c, company_id: bulkReassignCompanyId } : c))
        );
      }
      setShowBulkReassignModal(false);
      setBulkReassignCompanyId('');
      setSelectedContactIds([]);
    } catch (err: any) {
      alert('Failed to reassign contacts: ' + (err?.message || err));
    }
  };

  const submitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !contactName.trim() || isSavingContact) return;
    setIsSavingContact(true);

    if (!activeWorkspace?.id) {
      setIsSavingContact(false);
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    const mobVal = contactMobile.trim();
    const landVal = contactLandline.trim();
    const emVal = contactEmail.trim();

    const contactPhonesList = [
      ...(mobVal ? [{ id: 'ct_m1', label: 'Mobile', value: mobVal, number: mobVal }] : []),
      ...(landVal ? [{ id: 'ct_l1', label: 'Landline', value: landVal, number: landVal }] : [])
    ];
    const contactEmailsList = emVal ? [{ id: 'ct_e1', label: 'Work', value: emVal, email: emVal }] : [];

    const rawContact: Omit<Contact, 'id'> = {
      workspace_id: activeWorkspace.id,
      company_id: selectedCompanyId,
      full_name: contactName.trim(),
      designation: contactDesignation.trim(),
      mobile: mobVal,
      landline: landVal,
      phone: mobVal || landVal,
      email: emVal,
      phones: contactPhonesList as any,
      emails: contactEmailsList as any,
      handles: [],
      is_primary: isPrimary,
      created_by_uid: user?.uid || '',
      created_by_name: user?.full_name || user?.username || user?.email || 'Unknown User',
      last_modified_by_uid: user?.uid || '',
      last_modified_by_name: user?.full_name || user?.username || user?.email || 'Unknown User',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      // PART 2 UNASSIGNED SYNC: Splice / remove bound phone/email from the company's unassigned pool
      const targetComp = companies.find((c) => c.id === selectedCompanyId);
      if (targetComp) {
        const compPhones = getCompanyPhones(targetComp);
        const compEmails = getCompanyEmails(targetComp);

        const assignedPhoneVals = [mobVal, landVal].filter(Boolean);
        const assignedEmailVal = emVal.toLowerCase();

        const remainingPhones = compPhones.filter(
          (p) => !assignedPhoneVals.some((ap) => isSamePhoneNumber(p.value || p.number, ap))
        );
        const remainingEmails = compEmails.filter(
          (e) => (e.value || e.email || '').trim().toLowerCase() !== assignedEmailVal
        );

        if (remainingPhones.length !== compPhones.length || remainingEmails.length !== compEmails.length) {
          const updatedCompany: Company = {
            ...targetComp,
            phones: remainingPhones as any,
            general_phones: remainingPhones as any,
            general_phone: remainingPhones[0]?.value || remainingPhones[0]?.number || '',
            emails: remainingEmails as any,
            general_emails: remainingEmails as any,
            general_email: remainingEmails[0]?.value || remainingEmails[0]?.email || '',
            updatedAt: new Date().toISOString()
          };

          await safeUpdateDoc('companies', targetComp.id!, {
            phones: remainingPhones,
            general_phones: remainingPhones,
            general_phone: remainingPhones[0]?.value || remainingPhones[0]?.number || '',
            emails: remainingEmails,
            general_emails: remainingEmails,
            general_email: remainingEmails[0]?.value || remainingEmails[0]?.email || '',
            updatedAt: new Date().toISOString()
          });
          await CompanyRepository.updateCompany(targetComp.id!, updatedCompany);
          if (setCompanies) {
            setCompanies((prev) => prev.map((c) => (c.id === targetComp.id ? updatedCompany : c)));
          }
        }
      }

      // If setting as primary, we must disable other primary flags for this company
      if (isPrimary) {
        const batch = writeBatch(db);
        const relatedContacts = contacts.filter((c) => c.company_id === selectedCompanyId && c.is_primary);
        relatedContacts.forEach((c) => {
          if (c.id) {
            batch.update(doc(db, 'contacts', c.id), { is_primary: false });
          }
        });
        await batch.commit();
      }

      const res = await safeAddDoc('contacts', rawContact);
      const newId = res?.id || ('cont_' + Date.now());
      const newContact: Contact = { id: newId, ...rawContact };
      await logAudit(newId, 'contact', 'create', null, rawContact);

      if (setContacts) {
        setContacts((prev) => {
          let list = isPrimary
            ? prev.map((c) => (c.company_id === selectedCompanyId ? { ...c, is_primary: false } : c))
            : prev;
          return [newContact, ...list.filter((c) => c.id !== newId)];
        });
      }

      // Reset Contact form
      setShowAddContact(false);
      setContactName('');
      setContactDesignation('');
      setContactMobile('');
      setContactLandline('');
      setContactEmail('');
      setIsPrimary(false);
    } catch (err: any) {
      alert('Failed to save contact: ' + err.message);
    } finally {
      setIsSavingContact(false);
    }
  };

  const logAudit = async (docId: string, type: 'company' | 'contact' | 'enquiry', action: 'create' | 'update' | 'delete', before: any, after: any) => {
    try {
      const changes = before && after ? getDiffs(before, after) : [];
      const log = {
        document_id: docId,
        entity_type: type,
        action,
        changed_by_uid: user.uid,
        changed_by_name: user.username,
        timestamp: new Date().toISOString(),
        before: before || {},
        after: after || {},
        changes
      };
      await safeAddDoc('audit_logs', log);
    } catch (err) {
      console.error('Audit logger failed:', err);
    }
  };

  const getDiffs = (b: any, a: any) => {
    const diffs: any[] = [];
    Object.keys({ ...b, ...a }).forEach((k) => {
      if (b[k] !== a[k] && k !== 'id') {
        diffs.push({
          field: k,
          old_value: b[k] === undefined ? null : b[k],
          new_value: a[k] === undefined ? null : a[k]
        });
      }
    });
    return diffs;
  };

  // Perform Canonical Company merge
  const executeMerge = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    setMerging(true);
    try {
      const sourceComp = companies.find((c) => c.id === mergeSourceId);
      const targetComp = companies.find((c) => c.id === mergeTargetId);
      if (!sourceComp || !targetComp) return;

      const batch = writeBatch(db);

      // 1. Move all contacts from source company to target company
      const sourceContacts = contacts.filter((c) => c.company_id === mergeSourceId);
      sourceContacts.forEach((c) => {
        if (c.id) {
          batch.update(doc(db, 'contacts', c.id), { company_id: mergeTargetId });
        }
      });

      // 2. Move all enquiries from source company to target company
      const sourceEnquiries = enquiries.filter((e) => e.company_id === mergeSourceId);
      sourceEnquiries.forEach((e) => {
        if (e.id) {
          batch.update(doc(db, 'enquiries', e.id), { company_id: mergeTargetId });
        }
      });

      // 3. Merge aliases of source company into target company's aliases
      const combinedAliases = Array.from(
        new Set([...targetComp.aliases, sourceComp.canonical_name, ...sourceComp.aliases])
      ).filter((a) => a.toLowerCase() !== targetComp.canonical_name.toLowerCase());

      batch.update(doc(db, 'companies', mergeTargetId), { aliases: combinedAliases });

      // 4. Soft delete / Remove source company
      batch.delete(doc(db, 'companies', mergeSourceId));

      await batch.commit();

      // Log the merge operation in audit trail
      await logAudit(mergeTargetId, 'company', 'update', targetComp, { ...targetComp, aliases: combinedAliases });

      // Instant local state update
      if (setCompanies) {
        setCompanies((prev) =>
          prev
            .filter((c) => c.id !== mergeSourceId)
            .map((c) => (c.id === mergeTargetId ? { ...c, aliases: combinedAliases } : c))
        );
      }
      if (setContacts) {
        setContacts((prev) =>
          prev.map((c) => (c.company_id === mergeSourceId ? { ...c, company_id: mergeTargetId } : c))
        );
      }
      if (setEnquiries) {
        setEnquiries((prev) =>
          prev.map((e) => (e.company_id === mergeSourceId ? { ...e, company_id: mergeTargetId } : e))
        );
      }

      setSelectedCompanyId(mergeTargetId);
      setShowMerge(false);
      setMergeSourceId(null);
      setMergeTargetId(null);
      alert('Canonical companies successfully merged!');
    } catch (err: any) {
      alert('Merge failed: ' + err.message);
    } finally {
      setMerging(false);
    }
  };

  const deleteCompany = (id: string) => {
    const targetComp = companies.find((c) => c.id === id);
    if (!targetComp) return;

    const linkedContacts = contacts.filter((ct) => ct.company_id === id);
    setCompanyToDelete({
      id,
      name: targetComp.display_name || targetComp.canonical_name,
      contactCount: linkedContacts.length
    });
    setDeleteContactChoice('unlink');
  };

  const handleExecuteCompanyDelete = async () => {
    if (!companyToDelete) return;
    const { id, name } = companyToDelete;
    setIsDeletingCompany(true);

    try {
      const targetComp = companies.find((c) => c.id === id);
      const linkedContacts = contacts.filter((ct) => ct.company_id === id);

      if (deleteContactChoice === 'cascade') {
        // Option A: Delete associated contacts too
        for (const ct of linkedContacts) {
          if (ct.id) {
            await safeDeleteDoc('contacts', ct.id);
          }
        }
        if (setContacts) {
          setContacts((prev) => prev.filter((ct) => ct.company_id !== id));
        }
      } else {
        // Option B: Keep contacts unlinked
        for (const ct of linkedContacts) {
          if (ct.id) {
            await safeUpdateDoc('contacts', ct.id, { company_id: '' });
          }
        }
        if (setContacts) {
          setContacts((prev) =>
            prev.map((ct) => (ct.company_id === id ? { ...ct, company_id: '' } : ct))
          );
        }
      }

      // Immediately purge company from state
      if (setCompanies) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
      }

      // Delete company document
      await safeDeleteDoc('companies', id);

      // Audit Log
      if (targetComp) {
        await recordAuditLog({
          document_id: id,
          entity_type: 'company',
          entity_title: name,
          action: 'delete',
          user,
          before: targetComp,
          details: `Deleted company "${name}" (${deleteContactChoice === 'cascade' ? 'deleted' : 'unlinked'} ${linkedContacts.length} contacts)`
        });
      }

      if (selectedCompanyId === id) {
        setSelectedCompanyId(null);
      }
      setCompanyToDelete(null);
    } catch (err: any) {
      alert('Deletion failed: ' + err.message);
    } finally {
      setIsDeletingCompany(false);
    }
  };

  // Computed views
  const filteredCompanies = companies.filter((c) => {
    const q = searchQuery.toLowerCase();
    const refId = getReferenceId('CMP', c, companies).toLowerCase();

    const phonesList = getCompanyPhones(c).map(p => p.number.toLowerCase());
    const emailsList = getCompanyEmails(c).map(e => e.email.toLowerCase());

    const matchesSearch =
      !q ||
      refId.includes(q) ||
      (c.id && c.id.toLowerCase().includes(q)) ||
      c.display_name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q) ||
      (c.general_phone && c.general_phone.toLowerCase().includes(q)) ||
      (c.general_email && c.general_email.toLowerCase().includes(q)) ||
      phonesList.some(p => p.includes(q)) ||
      emailsList.some(e => e.includes(q)) ||
      (c.relationship && c.relationship.toLowerCase().includes(q)) ||
      (c.temperature && c.temperature.toLowerCase().includes(q)) ||
      c.aliases.some((a) => a.toLowerCase().includes(q));

    const matchesRelationship =
      relationshipFilter === 'ALL' ||
      (c.relationship || 'Prospect') === relationshipFilter;

    const matchesTemperature =
      temperatureFilter === 'ALL' ||
      (c.temperature || 'Cold') === temperatureFilter;

    return matchesSearch && matchesRelationship && matchesTemperature;
  });

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const companyContacts = contacts.filter((c) => c.company_id === selectedCompanyId);
  const companyEnquiries = enquiries.filter((e) => e.company_id === selectedCompanyId);

  const recentCompanyLogs = useMemo(() => {
    if (!selectedCompany) return [];
    const compId = selectedCompany.id;
    const compName = (selectedCompany.display_name || '').toLowerCase();

    return (callLogs || [])
      .filter((cl) => {
        if (cl.is_deleted) return false;
        return (
          cl.company_id === compId ||
          (cl.company_name && cl.company_name.toLowerCase() === compName)
        );
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.date || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [callLogs, selectedCompany]);

  const formatted_aliases_on_save = (canonical: string, rawInput: string) => {
    return rawInput
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0 && a.toLowerCase() !== canonical.toLowerCase());
  };

  return (
    <>
      <PageHeader
        title="Companies & Contacts Directory"
        subtitle="Manage corporate accounts, key contact personnel, phone directories, and relationship histories."
        icon={Building2}
        badge={{ text: `${companies.length} Companies`, variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={{
          label: 'New Company Profile',
          icon: Plus,
          onClick: handleOpenAddCompany
        }}
        secondaryActions={[
          {
            label: 'Export CSV',
            icon: Download,
            onClick: handleExportDirectoryCSV
          },
          {
            label: 'Print PDF',
            icon: Printer,
            onClick: handlePrintDirectoryPDF
          }
        ]}
      />

      <PageBody maxWidth="max-w-7xl">
      {/* Top View Switcher & Export Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('companies')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              viewMode === 'companies'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Companies Registry ({companies.length})</span>
          </button>

          <button
            onClick={() => setViewMode('contacts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              viewMode === 'contacts'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users2 className="w-4 h-4" />
            <span>People & Contacts ({contacts.length})</span>
          </button>

          <button
            onClick={() => setViewMode('phones')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              viewMode === 'phones'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>Phone & Tel Directory ({allPhoneEntries.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportDirectoryCSV}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintDirectoryPDF}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: COMPANIES REGISTRY */}
      {viewMode === 'companies' && (
        <div id="companies-tab" className="text-slate-200 flex flex-col gap-6 w-full">
          {/* Company List Registry Card (Full Row, Extendable & Retractable) */}
          {isRegistryCollapsed ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white font-sans">Companies Registry</h2>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                      {filteredCompanies.length} registered
                    </span>
                  </div>
                  {selectedCompany && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                      Currently inspecting: <span className="font-bold text-blue-700 dark:text-blue-400">{selectedCompany.display_name}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-auto">
                {isEditable && (
                  <button
                    type="button"
                    onClick={handleOpenAddCompany}
                    className="py-1.5 px-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition flex items-center space-x-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Company</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsRegistryCollapsed(false)}
                  className="py-1.5 px-3.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-xs rounded-xl border border-blue-200 dark:border-blue-800 transition flex items-center space-x-1.5 shadow-2xs"
                >
                  <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Expand Registry Table</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm w-full">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-3">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white font-sans">Companies Registry</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Canonical directory of account entities and relationships</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {selectedCompany && (
                    <button
                      type="button"
                      onClick={() => setIsRegistryCollapsed(true)}
                      className="py-2 px-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition flex items-center space-x-1.5 shadow-2xs"
                      title="Retract registry table to give maximum focus to selected company inspector"
                    >
                      <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>Retract Registry</span>
                    </button>
                  )}
                  {isEditable && (
                    <button
                      onClick={handleOpenAddCompany}
                      className="py-2 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition duration-150 flex items-center space-x-1.5 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Canonical Company</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search & Filters */}
              <div className="flex flex-col md:flex-row items-center gap-3 mb-6">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search companies by canonical name, city, aliases, numbers, emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-850 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2 w-full md:w-auto shrink-0">
                  <div className="relative flex items-center">
                    <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none z-10" />
                    <select
                      value={relationshipFilter}
                      onChange={(e) => setRelationshipFilter(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-xl pl-8 pr-7 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer shadow-2xs"
                    >
                      <option value="ALL" className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">All Relationships</option>
                      {(companyRelationships || []).map((r) => (
                        <option key={r.id} value={r.name} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">{r.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none z-10" />
                  </div>

                  <div className="relative flex items-center">
                    <select
                      value={temperatureFilter}
                      onChange={(e) => setTemperatureFilter(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-xl pl-3 pr-7 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer shadow-2xs"
                    >
                      <option value="ALL" className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">All Temperatures</option>
                      {(companyTemperatures || []).map((t) => (
                        <option key={t.id} value={t.name} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900">{t.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none z-10" />
                  </div>

                  {/* Switchable View Toggle */}
                  <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCompanyViewStyle('table')}
                      title="Table View"
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                        companyViewStyle === 'table'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Table className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Table</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyViewStyle('cards')}
                      title="Card Grid View"
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                        companyViewStyle === 'cards'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Cards</span>
                    </button>
                  </div>
                </div>
              </div>

              {filteredCompanies.length > 0 ? (
                companyViewStyle === 'table' ? (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="p-3">Ref ID</th>
                          <th className="p-3">Company Name & City</th>
                          <th className="p-3">Relationship & Temp</th>
                          <th className="p-3">Phones & Emails</th>
                          <th className="p-3">Links</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {filteredCompanies.map((c) => {
                          const isSelected = selectedCompanyId === c.id;
                          const linkCount = enquiries.filter((e) => e.company_id === c.id).length;
                          const relVal = c.relationship || 'Prospect';
                          const tempBadge = getCompanyTempBadge(c.temperature, c.is_dnc);
                          const phones = getCompanyPhones(c);
                          const emails = getCompanyEmails(c);

                          return (
                            <tr
                              key={c.id}
                              onClick={() => setSelectedCompanyId(c.id!)}
                              className={`cursor-pointer transition hover:bg-slate-50 ${
                                isSelected ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : ''
                              }`}
                            >
                              <td className="p-3 font-mono text-[10px] text-blue-700 font-bold whitespace-nowrap">
                                {getReferenceId('CMP', c, companies)}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-slate-100 font-sans">{c.display_name}</div>
                                <div className="text-slate-500 dark:text-slate-400 text-xs flex items-center space-x-1">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  <span className="text-slate-600 dark:text-slate-400 text-xs">{c.city}, {c.country}</span>
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap space-y-1">
                                <div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                    {relVal}
                                  </span>
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCycleCompanyTemperature(c);
                                    }}
                                    className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border inline-block cursor-pointer transition hover:scale-105 ${tempBadge.className}`}
                                    title="Click to cycle Temperature (Cold ❄️ -> Warm 🌤️ -> Hot 🔥 -> DNC 🚫)"
                                  >
                                    {tempBadge.label}
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 text-xs font-mono text-slate-800 dark:text-slate-200">
                                {phones.length > 0 && (
                                  <div className="truncate max-w-[180px] text-slate-900 dark:text-slate-200 font-mono text-xs font-semibold" title={phones[0].number}>
                                    {phones[0].number}
                                  </div>
                                )}
                                {emails.length > 0 && (
                                  <div className="truncate max-w-[180px] text-slate-600 dark:text-slate-400 text-xs font-mono" title={emails[0].email}>
                                    {emails[0].email}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 whitespace-nowrap font-mono text-[10px]">
                                <span className="text-blue-600 font-bold">{linkCount} Enquiries</span>
                              </td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCompanyId(c.id!);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                    isSelected
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                >
                                  {isSelected ? 'Selected' : 'Inspect'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCompanies.map((c) => {
                      const isSelected = selectedCompanyId === c.id;
                      const linkCount = enquiries.filter((e) => e.company_id === c.id).length;
                      const relVal = c.relationship || 'Prospect';
                      const tempBadge = getCompanyTempBadge(c.temperature, c.is_dnc);

                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCompanyId(c.id!)}
                          className={`p-5 rounded-xl border text-left flex flex-col justify-between transition duration-150 ${
                            isSelected
                              ? 'bg-blue-50/50 border-blue-400 text-slate-900 shadow-sm'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold block truncate font-sans">{c.display_name}</span>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border shrink-0 ${tempBadge.className}`}>
                                {tempBadge.label}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-slate-500 flex items-center space-x-1 font-sans">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{c.city}, {c.country}</span>
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {relVal}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 w-full text-[10px] font-mono text-slate-500">
                            <span>{c.aliases.length > 0 ? `${c.aliases.length} ALIASES` : 'NO ALIASES'}</span>
                            <span className="text-blue-600 font-bold">{linkCount} ENQUIRIES</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans text-sm">
                  No matching companies found in your database.
                </div>
              )}
            </div>
          )}

          {/* Company Detail Inspector Panel (Full Row Width) */}
          <div className="w-full space-y-6 min-w-0">
            {selectedCompany ? (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col xl:flex-row w-full">
                <div className="flex-1 p-6 space-y-6 overflow-y-auto min-w-0">
                {/* Header / Info */}
                <div className="flex items-start justify-between pb-6 border-b border-slate-100 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <h3 className="text-xl font-bold text-slate-900 font-sans">{selectedCompany.display_name}</h3>
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 text-blue-700 border border-slate-200 flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-blue-600" />
                        <span>REF: {getReferenceId('CMP', selectedCompany, companies)}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {selectedCompany.relationship || 'Prospect'}
                      </span>
                      {(() => {
                        const selBadge = getCompanyTempBadge(selectedCompany.temperature, selectedCompany.is_dnc);
                        return (
                          <button
                            type="button"
                            onClick={() => handleCycleCompanyTemperature(selectedCompany)}
                            className={`px-2 py-0.5 rounded text-[11px] font-black uppercase border cursor-pointer transition hover:scale-105 ${selBadge.className}`}
                            title="Click to cycle Temperature (Cold ❄️ -> Warm 🌤️ -> Hot 🔥 -> DNC 🚫)"
                          >
                            {selBadge.label}
                          </button>
                        );
                      })()}
                    </div>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded border border-slate-200 w-fit">
                      Canonical Base: {selectedCompany.canonical_name}
                    </p>
                  </div>

              <div className="flex items-center space-x-2 shrink-0">
                {onOpenActivityDrawer && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenActivityDrawer({
                        companyId: selectedCompany.id,
                        companyName: selectedCompany.display_name
                      });
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span>⚡ Log Activity</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistorySidePanelExpanded(!isHistorySidePanelExpanded)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1.5 ${
                    isHistorySidePanelExpanded 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                  title="Toggle Outreach & Proposal History Side Panel"
                >
                  <History className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">History</span>
                </button>
                {isEditable && (
                  <button
                    onClick={() => handleOpenEditCompany(selectedCompany)}
                    className="p-2 hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200 rounded-lg transition"
                    title="Edit Company"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                {user.role === 'Admin' && (
                  <>
                    <button
                      onClick={() => {
                        setMergeSourceId(selectedCompany.id!);
                        setShowMerge(true);
                      }}
                      className="p-2 hover:bg-slate-50 text-blue-600 border border-transparent hover:border-slate-200 rounded-lg transition"
                      title="Merge and Deduplicate"
                    >
                      <Merge className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteCompany(selectedCompany.id!)}
                      className="p-2 hover:bg-slate-50 text-red-500 border border-transparent hover:border-slate-200 rounded-lg transition"
                      title="Delete Company"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* General Specs & All Phones / Emails */}
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center space-x-2.5 text-xs">
                <MapPin className="w-4 h-4 text-slate-400" />
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-mono">Location</span>
                  <span className="text-slate-800 font-semibold">{selectedCompany.city}, {selectedCompany.country}</span>
                </div>
              </div>

              {/* Labeled Phones & Emails list */}
              <div className="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 block uppercase font-mono font-bold">Company Phone Numbers</span>
                  {getCompanyPhones(selectedCompany).length > 0 ? (
                    getCompanyPhones(selectedCompany).map((ph, idx) => {
                      const cleanNum = ph.number ? sanitizeWhatsAppNumber(ph.number) : '';
                      const phoneVal = ph.number || '';
                      const phoneTrim = phoneVal.trim();
                      const restriction = getLineRestriction(selectedCompany.restricted_lines, phoneVal, selectedCompany.is_dnc);
                      const isRestricted = Boolean(restriction);
                      const badgeText = restriction === 'DNC' ? 'DNC' : 'INVALID';

                      return (
                        <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                          <div className="flex items-center space-x-2">
                            <Phone className={`w-3.5 h-3.5 shrink-0 ${isRestricted ? (restriction === 'Invalid' ? 'text-amber-500' : 'text-rose-500') : 'text-blue-500'}`} />
                            {isRestricted ? (
                              <span className="font-mono font-bold text-slate-400 line-through cursor-not-allowed" title={`Restricted line (${badgeText})`}>
                                {ph.number}
                              </span>
                            ) : (
                              <a
                                href={`tel:${ph.number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono text-blue-700 hover:underline font-bold"
                              >
                                {ph.number}
                              </a>
                            )}
                            <span className="px-1.5 py-0.2 bg-slate-200/80 text-slate-600 rounded text-[9px] font-semibold">
                              {ph.label || 'Telephone'}
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
                          </div>
                          {!isRestricted && (
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={`tel:${ph.number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                                title="1-Click Dial"
                              >
                                <Phone className="w-3 h-3 text-blue-600" />
                              </a>
                              {cleanNum && (
                                <a
                                  href={`https://wa.me/${cleanNum}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                                  title="1-Click WhatsApp"
                                >
                                  <MessageSquare className="w-3 h-3 text-emerald-600" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-slate-400 italic">No phone numbers saved.</span>
                  )}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <span className="text-[10px] text-slate-400 block uppercase font-mono font-bold">Company Email Addresses</span>
                  {getCompanyEmails(selectedCompany).length > 0 ? (
                    getCompanyEmails(selectedCompany).map((em, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                        <div className="flex items-center space-x-2 truncate">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a
                            href={`mailto:${em.email}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-slate-800 hover:underline truncate"
                          >
                            {em.email}
                          </a>
                          <span className="px-1.5 py-0.2 bg-slate-200/80 text-slate-600 rounded text-[9px] font-semibold shrink-0">
                            {em.label || 'General'}
                          </span>
                        </div>
                        <a
                          href={`mailto:${em.email}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition shrink-0 ml-1"
                          title="1-Click Email"
                        >
                          <Mail className="w-3 h-3 text-purple-600" />
                        </a>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">No email addresses saved.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Aliases List */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Duplicate Lookup Aliases</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedCompany.aliases.length > 0 ? (
                  selectedCompany.aliases.map((a) => (
                    <span key={a} className="text-[11px] font-mono bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic font-sans">No alternate spellings declared.</span>
                )}
              </div>
            </div>

            {/* Company Notes */}
            {selectedCompany.notes && (
              <div className="space-y-1 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                <h4 className="text-xs font-mono text-slate-500 uppercase tracking-wider">Internal Client Notes</h4>
                <p className="text-xs text-slate-700 leading-relaxed font-sans">{selectedCompany.notes}</p>
              </div>
            )}

            {/* Personnel Contacts Section */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2 font-sans">
                  <Users2 className="w-4 h-4 text-slate-400" />
                  <span>Client Contact Personnel ({companyContacts.length})</span>
                </h4>
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => {
                      setContactToEdit(null);
                      setSelectedCompanyForContact(selectedCompany.id!);
                      setContactModalOpen(true);
                    }}
                    className="p-1 hover:bg-slate-50 text-blue-600 border border-transparent hover:border-slate-200 rounded transition flex items-center space-x-1 text-xs font-bold"
                    title="Add Personnel Contact"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Contact</span>
                  </button>
                )}
              </div>

              {companyContacts.length > 0 ? (
                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {companyContacts.map((c) => {
                    const cPhones = getContactPhones(c);
                    const cEmails = getContactEmails(c);
                    return (
                      <div key={c.id} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2 relative">
                        <div className="flex items-start justify-between gap-4">
                          <div className="overflow-hidden">
                            <div className="flex items-center space-x-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800 block font-sans">{c.full_name}</span>
                              {c.is_primary && (
                                <span className="text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider shrink-0">
                                  Primary
                                </span>
                              )}
                              {c.is_dnc && (
                                <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                                  DNC
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 block font-sans">{c.designation || 'No title declared'}</span>
                          </div>

                          {isEditable && (
                            <div className="flex items-center space-x-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setContactToEdit(c);
                                  setSelectedCompanyForContact(selectedCompany.id!);
                                  setContactModalOpen(true);
                                }}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded border border-slate-200 transition"
                                title="Edit Personnel"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              {isEditable && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteContact(c.id!)}
                                  className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded border border-slate-200 transition"
                                  title="Delete Personnel"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 text-xs pt-2 border-t border-slate-200/60 w-full text-slate-600 font-sans">
                          {cPhones.map((ph, pIdx) => {
                            const cleanNum = ph.number ? sanitizeWhatsAppNumber(ph.number) : '';
                            const phoneVal = ph.number || '';
                            const phoneTrim = phoneVal.trim();
                            const restriction = getLineRestriction(c.restricted_lines, phoneVal) || getLineRestriction(selectedCompany.restricted_lines, phoneVal, c.is_dnc || selectedCompany.is_dnc);
                            const isRestricted = Boolean(restriction);
                            const badgeText = restriction === 'DNC' ? 'DNC' : 'INVALID';

                            return (
                              <div key={pIdx} className="flex items-center justify-between text-xs py-0.5">
                                <div className="flex items-center space-x-2">
                                  <Phone className={`w-3.5 h-3.5 shrink-0 ${isRestricted ? (restriction === 'Invalid' ? 'text-amber-500' : 'text-rose-500') : 'text-blue-500'}`} />
                                  {isRestricted ? (
                                    <span className="font-mono font-bold text-slate-400 line-through cursor-not-allowed" title={`Restricted line (${badgeText})`}>
                                      {ph.number}
                                    </span>
                                  ) : (
                                    <a
                                      href={`tel:${ph.number}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="font-mono text-blue-700 hover:underline font-semibold"
                                    >
                                      {ph.number}
                                    </a>
                                  )}
                                  <span className="px-1.5 py-0.2 bg-slate-200/80 text-slate-600 rounded text-[9px] font-semibold">
                                    {ph.label}
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
                                </div>
                                {!isRestricted && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <a
                                      href={`tel:${ph.number}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="p-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                                      title="1-Click Dial"
                                    >
                                      <Phone className="w-3 h-3 text-blue-600" />
                                    </a>
                                    {cleanNum && (
                                      <a
                                        href={`https://wa.me/${cleanNum}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                                        title="1-Click WhatsApp"
                                      >
                                        <MessageSquare className="w-3 h-3 text-emerald-600" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {cEmails.map((em, eIdx) => (
                            <div key={eIdx} className="flex items-center justify-between text-xs py-0.5">
                              <div className="flex items-center space-x-2 overflow-hidden">
                                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <a
                                  href={`mailto:${em.email}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate text-slate-800 hover:underline"
                                >
                                  {em.email}
                                </a>
                                {em.label && (
                                  <span className="px-1.5 py-0.2 bg-slate-200/80 text-slate-500 rounded text-[9px] font-semibold shrink-0">
                                    {em.label}
                                  </span>
                                )}
                              </div>
                              <a
                                href={`mailto:${em.email}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition shrink-0 ml-1"
                                title="1-Click Email"
                              >
                                <Mail className="w-3 h-3 text-purple-600" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 font-sans text-xs">
                  No linked personnel registered for this account yet.
                </div>
              )}
            </div>

            {/* Recent Interactions Section */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2 font-sans">
                  <History className="w-4 h-4 text-blue-500" />
                  <span>Recent Interactions ({recentCompanyLogs.length})</span>
                </h4>
                {onOpenActivityDrawer && selectedCompany && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenActivityDrawer({
                        companyId: selectedCompany.id,
                        companyName: selectedCompany.display_name
                      });
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log Interaction</span>
                  </button>
                )}
              </div>

              {recentCompanyLogs.length > 0 ? (
                <div className="space-y-2">
                  {recentCompanyLogs.map((log) => {
                    const operatorName = log.handled_by_team_member_name || log.logged_by || 'System';
                    return (
                      <div
                        key={log.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition hover:border-slate-300"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-bold font-mono">
                            <PhoneCall className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-900 font-mono">
                                {formatHistoryDate(log.date || log.createdAt)}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                by <strong className="text-slate-700">{operatorName}</strong>
                              </span>
                            </div>
                            {log.requirement_notes && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-sans">
                                {log.requirement_notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {log.status || 'Scheduled'}
                          </span>
                          {log.outcome && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                              {log.outcome}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-slate-400 font-sans text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200 p-4">
                  No recent interactions found.
                </div>
              )}
            </div>
          </div>

          {/* Retractable Outreach & Proposal History Side Panel */}
                {isHistorySidePanelExpanded && (
                  <div className="w-full xl:w-80 2xl:w-96 bg-slate-50 border-t xl:border-t-0 xl:border-l border-slate-200 flex flex-col shrink-0 overflow-hidden font-sans">
                    <div className="p-3.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between shrink-0">
                      <div className="flex items-center space-x-2">
                        <Zap className="w-4 h-4 text-blue-600" />
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                          Outreach & History Panel
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {onOpenCompany360 && selectedCompany?.id && (
                          <button
                            type="button"
                            onClick={() => onOpenCompany360(selectedCompany.id)}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 transition"
                            title="Open Company 360° View"
                          >
                            <Sparkles className="w-3 h-3 text-blue-500" />
                            <span>Company 360°</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsHistorySidePanelExpanded(false)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                          title="Collapse Side Panel"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 p-3.5 overflow-y-auto space-y-4 max-h-[620px]">
                      {(() => {
                        const isOwnDataOnly = user.role !== 'Admin' && user.dataVisibilityScope === 'OWN_DATA_ONLY';
                        const isBasicTier = user.role !== 'Admin' && user.dataVisibilityTier === 'BASIC';

                        const linkedCompanyLogs = (callLogs || []).filter((cl) => {
                          if (isOwnDataOnly && !isRecordOwner(user, cl)) return false;
                          return (
                            cl.company_id === selectedCompany.id ||
                            (cl.company_name && cl.company_name.toLowerCase() === selectedCompany.display_name.toLowerCase())
                          );
                        });

                        const linkedCompanyEnquiries = companyEnquiries.filter((e) => {
                          if (isOwnDataOnly && !isRecordOwner(user, e)) return false;
                          return true;
                        });

                        const totalHistoryCount = linkedCompanyLogs.length + linkedCompanyEnquiries.length;

                        return (
                          <>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs font-mono">
                              <span>Calls: <strong className="text-blue-700">{linkedCompanyLogs.length}</strong></span>
                              <span>Proposals: <strong className="text-purple-700">{linkedCompanyEnquiries.length}</strong></span>
                              <span>Total: <strong className="text-slate-900">{totalHistoryCount}</strong></span>
                            </div>

                            {/* Call Center Operations subsection */}
                            {linkedCompanyLogs.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                                  Call Center Operations ({linkedCompanyLogs.length})
                                </span>
                                <div className="space-y-2">
                                  {linkedCompanyLogs.map((log) => {
                                    const canClick = canUserClickRecord(user, log, salespersons);
                                    return (
                                      <div
                                        key={log.id}
                                        onClick={() => {
                                          if (canClick) setSelectedCallLogDetail(log);
                                        }}
                                        className={`p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5 transition ${
                                          canClick ? 'hover:border-blue-400 hover:shadow-md cursor-pointer group' : 'opacity-90'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center space-x-1.5">
                                            <PhoneCall className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                            <span className="font-bold text-slate-900 font-mono">{formatHistoryDate(log.date)}</span>
                                          </div>
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                            {log.status}
                                          </span>
                                        </div>

                                        <p className="text-[11px] text-slate-500 font-sans">
                                          Logged by: <span className="font-semibold text-slate-800">{log.logged_by || 'Staff'}</span>
                                        </p>

                                        {log.contact_name && (
                                          <p className="text-[11px] text-slate-600 font-medium">
                                            Contact: <span className="font-semibold">{log.contact_name}</span>
                                          </p>
                                        )}

                                        {log.requirement_notes && (
                                          <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2">
                                            "{log.requirement_notes}"
                                          </p>
                                        )}

                                        {canClick ? (
                                          <div className="text-[10px] font-bold text-blue-600 group-hover:underline flex items-center justify-end space-x-1 pt-1">
                                            <span>View Call Log</span>
                                            <ExternalLink className="w-3 h-3" />
                                          </div>
                                        ) : (
                                          <div className="text-[10px] font-medium text-slate-400 flex items-center justify-end space-x-1 pt-1">
                                            <span>Restricted View</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Proposals subsection */}
                            {linkedCompanyEnquiries.length > 0 && (
                              <div className="space-y-2 pt-2 border-t border-slate-200/60">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                                  Proposals & Quotes ({linkedCompanyEnquiries.length})
                                </span>
                                <div className="space-y-2">
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
                                        className={`p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5 transition ${
                                          canClick ? 'hover:border-purple-400 hover:shadow-md cursor-pointer group' : 'opacity-90'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center space-x-1.5 overflow-hidden">
                                            <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                            <span className="font-bold text-slate-900 font-mono truncate">{e.quote_ref_no || `SN#${e.sn}`}</span>
                                          </div>
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                                            {e.status || 'Active'}
                                          </span>
                                        </div>

                                        {e.subject && (
                                          <p className="text-[11px] font-semibold text-slate-800 line-clamp-1">{e.subject}</p>
                                        )}

                                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 border-t border-slate-100">
                                          <span>Logged by: <strong className="text-slate-800">{spName}</strong></span>
                                          {!isBasicTier && e.value_aed ? (
                                            <span className="font-mono font-bold text-emerald-700">AED {e.value_aed.toLocaleString()}</span>
                                          ) : null}
                                        </div>

                                        {canClick ? (
                                          <div className="text-[10px] font-bold text-purple-600 group-hover:underline flex items-center justify-end space-x-1 pt-0.5">
                                            <span>Open Proposal</span>
                                            <ExternalLink className="w-3 h-3" />
                                          </div>
                                        ) : (
                                          <div className="text-[10px] font-medium text-slate-400 flex items-center justify-end space-x-1 pt-0.5">
                                            <span>Restricted View</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {linkedCompanyLogs.length === 0 && linkedCompanyEnquiries.length === 0 && (
                              <div className="py-8 text-center text-slate-400 font-sans text-xs bg-white rounded-xl border border-dashed border-slate-200 p-4">
                                No outreach calls or proposals linked to this company yet.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-sans shadow-sm">
            Select a company card from the left panel to inspect details, link contact managers, or trigger administrative merge consolidations.
          </div>
        )}
      </div>
      </div>
      )}

      {/* VIEW 2: PEOPLE & CONTACTS DIRECTORY */}
      {viewMode === 'contacts' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <Users2 className="w-6 h-6 text-blue-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-sans">People & Key Contacts Directory</h2>
                <p className="text-xs text-slate-500">
                  Comprehensive listing of key contact decision-makers across all registered companies.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by person name, role, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 pl-10 pr-4 text-xs text-slate-800"
                />
              </div>
              {isEditable && (
                <button
                  type="button"
                  onClick={() => {
                    setContactToEdit(null);
                    setSelectedCompanyForContact(selectedCompanyId || '');
                    setContactModalOpen(true);
                  }}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center space-x-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Contact</span>
                </button>
              )}

              {/* View Switcher Toggle for Contacts */}
              <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setContactViewStyle('table')}
                  title="Table View"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                    contactViewStyle === 'table'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setContactViewStyle('cards')}
                  title="Card Grid View"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                    contactViewStyle === 'cards'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Actions Toolbar for Contacts */}
          {selectedContactIds.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold font-mono">
                  {selectedContactIds.length} Selected
                </span>
                <span className="text-xs font-semibold text-blue-900">
                  Marked personnel records
                </span>
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkReassignModal(true)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Reassign Company</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkMarkDnc(true)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-amber-700 border border-amber-300 text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  <span>Flag DNC</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkExportContacts}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>Export Selected CSV</span>
                </button>

                {isEditable && (
                  <button
                    type="button"
                    onClick={handleBulkDeleteContacts}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedContactIds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedContactIds([])}
                  className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {contactViewStyle === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts.map((ct) => (
                <div
                  key={ct.id}
                  onClick={() => setSelectedContactDetail(ct)}
                  className={`bg-white border rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-3 hover:border-slate-300 transition cursor-pointer ${ct.id && selectedContactIds.includes(ct.id) ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200'}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={!!(ct.id && selectedContactIds.includes(ct.id))}
                          onChange={(e) => {
                            e.stopPropagation();
                            ct.id && handleToggleSelectContact(ct.id);
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0 mt-0.5"
                        />
                        <h4 className="font-bold text-slate-900 text-sm font-sans flex items-center space-x-2">
                          <span>{ct.full_name}</span>
                          {ct.is_primary && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                              Primary
                            </span>
                          )}
                          {ct.is_dnc && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-600 text-white">
                              DNC
                            </span>
                          )}
                        </h4>
                      </div>
                    </div>
                    {ct.designation && <p className="text-xs text-slate-500 pl-6.5">{ct.designation}</p>}
                    <p className="text-xs font-semibold text-slate-700 pt-1 border-t border-slate-100 flex items-center space-x-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{ct.companyName}</span>
                    </p>
                  </div>

                  <div className="space-y-1 text-xs font-mono text-slate-600 pt-2 border-t border-slate-100">
                    {ct.mobile && (
                      <div className="flex items-center space-x-1.5">
                        <PhoneCall className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <a
                          href={`tel:${ct.mobile}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline font-bold text-blue-600"
                        >{ct.mobile}</a>
                      </div>
                    )}
                    {ct.email && (
                      <div className="flex items-center space-x-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a
                          href={`mailto:${ct.email}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline text-slate-700 truncate"
                        >{ct.email}</a>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-end space-x-2">
                    {isEditable && (
                      <>
                        <button
                          onClick={() => {
                            setContactToEdit(ct);
                            setSelectedCompanyForContact(ct.company_id);
                            setContactModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteContact(ct.id!)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-lg border border-rose-200 transition flex items-center space-x-1"
                          title="Delete Contact"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredContacts.length > 0 && filteredContacts.every((c) => c.id && selectedContactIds.includes(c.id))}
                      onChange={handleSelectAllContacts}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      title="Select/Deselect All Filtered Contacts"
                    />
                  </th>
                  <th className="p-3.5">Contact Name & Role</th>
                  <th className="p-3.5">Assigned Company</th>
                  <th className="p-3.5">Mobile Phone</th>
                  <th className="p-3.5">Landline Phone</th>
                  <th className="p-3.5">Email Address</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map((ct) => (
                  <tr
                    key={ct.id}
                    onClick={() => setSelectedContactDetail(ct)}
                    className={`hover:bg-slate-50 transition cursor-pointer ${ct.id && selectedContactIds.includes(ct.id) ? 'bg-blue-50/50' : ''}`}
                  >
                    <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!(ct.id && selectedContactIds.includes(ct.id))}
                        onChange={() => ct.id && handleToggleSelectContact(ct.id)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 flex items-center space-x-2">
                        <span>{ct.full_name}</span>
                        {ct.is_primary && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                            Primary
                          </span>
                        )}
                        {ct.is_dnc && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-600 text-white">
                            DNC
                          </span>
                        )}
                      </div>
                      {ct.designation && <div className="text-[11px] text-slate-500">{ct.designation}</div>}
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">{ct.companyName}</div>
                      <div className="text-[10px] text-slate-400">{ct.location}</div>
                    </td>
                    <td className="p-3.5">
                      {ct.mobile ? (
                        <a
                          href={`tel:${ct.mobile}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-blue-600 font-bold hover:underline flex items-center space-x-1"
                        >
                          <PhoneCall className="w-3 h-3 text-blue-500" />
                          <span>{ct.mobile}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {ct.landline ? (
                        <span className="font-mono text-slate-700 font-medium">{ct.landline}</span>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {ct.email ? (
                        <a
                          href={`mailto:${ct.email}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-700 hover:text-blue-600 hover:underline"
                        >
                          {ct.email}
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {isEditable && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setContactToEdit(ct);
                                setContactModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition flex items-center space-x-1"
                              title="Edit Contact"
                            >
                              <Edit className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteContact(ct.id!)}
                              className="px-2 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition flex items-center space-x-1"
                              title="Delete Contact"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                        {ct.company_id && (
                          <button
                            onClick={() => {
                              setSelectedCompanyId(ct.company_id!);
                              setViewMode('companies');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                          >
                            View Company
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredContacts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No contacts found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* VIEW 3: TELECOM & PHONE NUMBER DIRECTORY */}
      {viewMode === 'phones' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <Phone className="w-6 h-6 text-blue-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-sans">Telecom & Phone Number Directory</h2>
                <p className="text-xs text-slate-500">
                  Consolidated registry of switchboards, direct mobiles, and landline extensions.
                </p>
              </div>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search phone numbers, companies, people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 pl-10 pr-4 text-xs text-slate-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Phone Number</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Associated Person / Entity</th>
                  <th className="p-3.5">Role / Context</th>
                  <th className="p-3.5">Location</th>
                  <th className="p-3.5 text-right">Quick Dial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPhones.map((p) => {
                  const isRestricted = Boolean(p.restriction);
                  const badgeText = p.restriction === 'DNC' ? 'DNC' : 'INVALID';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-mono text-xs font-bold text-slate-900">
                        <div className="flex items-center space-x-1.5">
                          {isRestricted ? (
                            <span className="line-through text-slate-400 cursor-not-allowed" title={`Restricted line (${badgeText})`}>
                              {p.number}
                            </span>
                          ) : (
                            <span>{p.number}</span>
                          )}
                          {isRestricted && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-sans uppercase border ${
                              p.restriction === 'Invalid'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                            }`}>
                              {badgeText}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.type === 'Mobile'
                              ? 'bg-blue-100 text-blue-800'
                              : p.type === 'Landline'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {p.type}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">{p.entityName}</td>
                      <td className="p-3.5 text-slate-600">{p.subText || '—'}</td>
                      <td className="p-3.5 text-slate-500">{p.location || '—'}</td>
                      <td className="p-3.5 text-right">
                        {!isRestricted ? (
                          <a
                            href={`tel:${p.number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-sm"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-sans italic">Disabled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredPhones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No phone numbers found matching your query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD COMPANY WITH DUPLICATE FUZZY WARNING */}
      {showAddCompany && (
        <div id="company-form-modal" className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0 bg-slate-950/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-950/60 border border-indigo-800/60 rounded-xl text-indigo-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-100 font-sans">
                  {editingCompany ? 'Edit Canonical Company' : 'Add Canonical Company'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeCompanyModal}
                className="text-slate-400 hover:text-slate-200 transition p-1.5 rounded-lg hover:bg-slate-800/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={submitCompany} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                      Canonical Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Veolia Water Solutions"
                      value={canonicalName}
                      onChange={(e) => setCanonicalName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none placeholder-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                      Legal Suffix
                    </label>
                    <select
                      value={legalSuffix}
                      onChange={(e) => setLegalSuffix(e.target.value as LegalSuffix)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none font-sans"
                    >
                      {['None / To Be Added Later', 'LLC', 'FZE', 'FZC', 'Co. LLC', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                    Fuzzy Search Aliases (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Veolia Water, Veolia Solutions, VWS"
                    value={aliasesInput}
                    onChange={(e) => setAliasesInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none placeholder-slate-600"
                  />
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block leading-normal">
                    Helps the fuzzy matching index search variants to block subsequent duplicates.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharjah"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none placeholder-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. UAE"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none placeholder-slate-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                      Relationship (Required)
                    </label>
                    <select
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none font-sans font-semibold"
                    >
                      {(companyRelationships || []).map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                      Temperature (Heat Level)
                    </label>
                    <select
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none font-sans font-semibold cursor-pointer"
                    >
                      <option value="Cold">Cold ❄️</option>
                      <option value="Warm">Warm 🌤️</option>
                      <option value="Hot">Hot 🔥</option>
                      <option value="DNC">DNC 🚫</option>
                    </select>
                  </div>
                </div>

                <datalist id="company-phone-label-suggestions">
                  <option value="Main" />
                  <option value="Reception" />
                  <option value="Engineering Dept" />
                  <option value="Sales Desk" />
                  <option value="Direct Line" />
                  <option value="Mobile" />
                  <option value="Landline" />
                  <option value="Support" />
                  <option value="Billing" />
                  <option value="WhatsApp" />
                  <option value="Fax" />
                  <option value="HQ Switchboard" />
                  <option value="After Hours" />
                </datalist>

                <datalist id="company-email-label-suggestions">
                  <option value="Main" />
                  <option value="Inquiries" />
                  <option value="Sales" />
                  <option value="Support" />
                  <option value="Engineering" />
                  <option value="Billing" />
                  <option value="Finance" />
                  <option value="Work" />
                  <option value="Info" />
                </datalist>

                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                      Company Phone Numbers
                    </label>
                    <button
                      type="button"
                      onClick={() => setCompanyPhones(prev => [...prev, { id: generateCmId(), label: 'Main', value: '' }])}
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Phone</span>
                    </button>
                  </div>
                  {companyPhones.map((ph, idx) => {
                    const currentRestriction = getLineRestriction(editingRestrictedLines, ph.value);

                    return (
                      <div key={ph.id || idx} className="flex items-center space-x-2">
                        <CustomLabelSelect
                          value={ph.label}
                          onChange={(val) => {
                            setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                          }}
                          options={PHONE_LABEL_DEFAULT_OPTIONS}
                          className="w-36 shrink-0"
                        />
                        <input
                          type="text"
                          placeholder="Phone number..."
                          value={ph.value}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                          }}
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-800 rounded-xl font-mono bg-slate-950 text-slate-100 focus:border-indigo-500 focus:outline-none placeholder-slate-600 min-w-0"
                        />

                        <button
                          type="button"
                          onClick={() => togglePhoneRestriction(ph.value)}
                          disabled={!ph.value.trim()}
                          className={`px-2 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${
                            currentRestriction === 'DNC'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                              : currentRestriction === 'Invalid'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                          }`}
                          title={
                            currentRestriction === 'DNC'
                              ? 'Restriction: DNC (Click to Clear)'
                              : currentRestriction === 'Invalid'
                              ? 'Restriction: Invalid (Click for DNC)'
                              : 'Line Active (Click to flag Invalid)'
                          }
                        >
                          <ShieldAlert className={`w-3.5 h-3.5 ${
                            currentRestriction === 'DNC'
                              ? 'text-rose-400'
                              : currentRestriction === 'Invalid'
                              ? 'text-amber-400'
                              : 'text-slate-500'
                          }`} />
                          <span>{currentRestriction || 'Clear'}</span>
                        </button>

                        {companyPhones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setCompanyPhones(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/60 cursor-pointer shrink-0"
                            title="Remove Phone"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                      Company Email Addresses
                    </label>
                    <button
                      type="button"
                      onClick={() => setCompanyEmails(prev => [...prev, { id: generateCmId(), label: 'Main', value: '' }])}
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Email</span>
                    </button>
                  </div>
                  {companyEmails.map((em, idx) => (
                    <div key={em.id || idx} className="flex items-center space-x-2">
                      <CustomLabelSelect
                        value={em.label}
                        onChange={(val) => {
                          setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                        }}
                        options={EMAIL_LABEL_DEFAULT_OPTIONS}
                        className="w-36 shrink-0"
                      />
                      <input
                        type="email"
                        placeholder="Email address..."
                        value={em.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                        }}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-800 rounded-xl font-sans bg-slate-950 text-slate-100 focus:border-indigo-500 focus:outline-none placeholder-slate-600"
                      />
                      {companyEmails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCompanyEmails(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/60 cursor-pointer"
                          title="Remove Email"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                    Internal notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Provide any client profiles, special conditions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none font-sans placeholder-slate-600"
                  />
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={closeCompanyModal}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCompany || !activeWorkspace?.id}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center space-x-2 cursor-pointer shadow-md"
                  >
                    {isSavingCompany && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{isSavingCompany ? 'Saving Record...' : 'Save Canonical Record'}</span>
                  </button>
                </div>
              </form>
          </div>
        </div>
      )}

      {/* Contact Modal (Create & Edit Contact) */}
      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => {
          setContactModalOpen(false);
          setContactToEdit(null);
        }}
        contact={contactToEdit}
        companyId={selectedCompanyForContact || selectedCompanyId || undefined}
        companies={companies}
        activeWorkspaceId={activeWorkspace?.id || ''}
        user={user}
        setContacts={setContacts}
        setCompanies={setCompanies}
        setCallLogs={setCallLogs}
      />

      {/* MODAL: MERGE canonical companies */}
      {showMerge && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setShowMerge(false);
                setMergeTargetId(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-100 border-b border-slate-800 pb-3 font-sans flex items-center space-x-2">
              <Merge className="w-5 h-5 text-indigo-400" />
              <span>Administrative Merge Consolidation</span>
            </h3>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 leading-normal font-sans space-y-1">
              <span className="font-bold text-slate-100 block">Merging Action:</span>
              <p>
                All contacts and enquiries currently pointing to the **Source** company will be updated in a single transaction batch to reference the **Target** company. The source company's canonical name will be appended as an alias of the target to maintain future fuzzy lookups, and the source document will be softly deleted.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                  Source Company (Will be merged and removed)
                </span>
                <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-sm font-semibold text-rose-300 font-sans">
                  {selectedCompany.display_name}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                  Target Company (Receives all records & aliases)
                </label>
                <select
                  value={mergeTargetId || ''}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm text-slate-100 focus:outline-none font-sans"
                >
                  <option value="">-- Choose Canonical Target --</option>
                  {companies
                    .filter((c) => c.id !== mergeSourceId)
                    .map((c) => (
                      <option key={c.id} value={c.id!}>
                        {c.display_name}
                      </option>
                    ))}
                </select>
              </div>

              <button
                onClick={executeMerge}
                disabled={merging || !mergeTargetId}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 font-semibold text-white rounded-xl text-sm transition cursor-pointer shadow-md"
              >
                {merging ? 'Consolidating records...' : 'Execute Merge batch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Deletion Choice Modal */}
      {companyToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full border border-slate-800 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2.5 bg-rose-950/60 text-rose-400 border border-rose-800/50 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Delete Company</h3>
                <p className="text-xs text-slate-400 font-medium">{companyToDelete.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to delete this company?
              {companyToDelete.contactCount > 0 ? (
                <span> This company currently has <strong className="text-slate-100">{companyToDelete.contactCount} associated contact(s)</strong>. Please choose how to handle them:</span>
              ) : (
                <span> This action cannot be undone.</span>
              )}
            </p>

            {companyToDelete.contactCount > 0 && (
              <div className="space-y-2 mb-6 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/60 transition border border-transparent">
                  <input
                    type="radio"
                    name="deleteContactChoice"
                    value="unlink"
                    checked={deleteContactChoice === 'unlink'}
                    onChange={() => setDeleteContactChoice('unlink')}
                    className="mt-0.5 text-indigo-500 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-slate-100 block">Keep contacts (unlink company)</span>
                    <span className="text-[11px] text-slate-400 block">Contacts will remain in People Directory, but their company field will be cleared.</span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-800/60 transition border border-transparent">
                  <input
                    type="radio"
                    name="deleteContactChoice"
                    value="cascade"
                    checked={deleteContactChoice === 'cascade'}
                    onChange={() => setDeleteContactChoice('cascade')}
                    className="mt-0.5 text-rose-500 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-bold text-rose-400 block">Delete associated contacts too</span>
                    <span className="text-[11px] text-slate-400 block">All {companyToDelete.contactCount} associated contact persons will also be deleted.</span>
                  </div>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setCompanyToDelete(null)}
                disabled={isDeletingCompany}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCompanyDelete}
                disabled={isDeletingCompany}
                className="py-2 px-4 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-md flex items-center space-x-1.5"
              >
                {isDeletingCompany ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full border border-slate-800 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-100 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-400 font-sans mb-6">{confirmDialog.message}</p>
            <div className="flex items-center justify-end space-x-3 font-sans">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-md ${
                  confirmDialog.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Duplicate Fuzzy Match Warning Modal */}
      {duplicateMatchResult && (
        <DuplicateMatchModal
          isOpen={!!duplicateMatchResult}
          type="company"
          candidateName={canonicalName}
          existingRecordName={duplicateMatchResult.match.display_name}
          matchReason={duplicateMatchResult.reason}
          similarityScore={duplicateMatchResult.similarity}
          existingDetails={{
            city: duplicateMatchResult.match.city,
            country: duplicateMatchResult.match.country,
            phone: duplicateMatchResult.match.general_phone,
            email: duplicateMatchResult.match.general_email,
          }}
          newDetails={{
            city,
            country,
            phone: generalPhone,
            email: generalEmail,
          }}
          onMerge={() => {
            // Merge: Select existing company
            setSelectedCompanyId(duplicateMatchResult.match.id);
            setDuplicateMatchResult(null);
            closeCompanyModal();
          }}
          onKeepNew={async () => {
            // Keep New: Overwrite existing company record with new values
            const targetId = duplicateMatchResult.match.id;
            const displayName =
              legalSuffix === 'None / Other' || legalSuffix === 'None / To Be Added Later'
                ? canonicalName.trim()
                : `${canonicalName.trim()} ${legalSuffix}`;
            const computedCanonicalName = computeCanonicalName(displayName) || canonicalName.trim().toLowerCase();
            const validPhones = companyPhones.filter(p => (p.value || p.number || '').trim() !== '');
            const searchTerms = generateCompanySearchTerms(displayName, city, validPhones.length > 0 ? validPhones : [{ number: generalPhone }]);

            const updatedData: Partial<Company> = {
              canonical_name: computedCanonicalName,
              legal_suffix: legalSuffix,
              display_name: displayName,
              country,
              city,
              general_phone: generalPhone,
              general_email: generalEmail,
              notes,
              search_terms: searchTerms,
              last_modified_by_uid: user?.uid || '',
              last_modified_by_name: user?.full_name || user?.username || user?.email || 'Unknown User',
              updatedAt: new Date().toISOString()
            };
            await CompanyRepository.updateCompany(targetId, updatedData);
            if (setCompanies) {
              setCompanies((prev) =>
                prev.map((c) => (c.id === targetId ? { ...c, ...updatedData } : c))
              );
            }
            if (setCallLogs) {
              const newName = updatedData.display_name || updatedData.canonical_name;
              if (newName) {
                setCallLogs((prevLogs) =>
                  prevLogs.map((log) =>
                    log.company_id === targetId
                      ? { ...log, company_name: newName, updatedAt: new Date().toISOString() }
                      : log
                  )
                );
              }
            }
            setSelectedCompanyId(targetId);
            setDuplicateMatchResult(null);
            closeCompanyModal();
          }}
          onIgnore={() => {
            // Ignore & proceed creating new record
            setDuplicateMatchResult(null);
            setPendingBypass(true);
          }}
          onCancel={() => {
            setDuplicateMatchResult(null);
          }}
        />
      )}

      {/* Bulk Reassign Modal */}
      {showBulkReassignModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full border border-slate-800 shadow-2xl p-6 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Bulk Reassign {selectedContactIds.length} Contact(s)
                </h3>
              </div>
              <button
                onClick={() => setShowBulkReassignModal(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Select the target company account to associate with all {selectedContactIds.length} selected contacts:
            </p>

            <select
              value={bulkReassignCompanyId}
              onChange={(e) => setBulkReassignCompanyId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-800 rounded-xl focus:border-indigo-500 bg-slate-950 text-slate-100"
            >
              <option value="">-- Choose Target Company --</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.display_name} ({comp.city || 'No City'}, {comp.country || 'No Country'})
                </option>
              ))}
            </select>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowBulkReassignModal(false)}
                className="px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800/60 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!bulkReassignCompanyId}
                onClick={handleExecuteBulkReassign}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-xs cursor-pointer"
              >
                Apply Reassignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Detail Quick View Modal */}
      <ContactDetailModal
        isOpen={!!selectedContactDetail}
        contact={selectedContactDetail}
        companyName={companies.find((c) => c.id === selectedContactDetail?.company_id)?.display_name}
        callLogs={callLogs}
        enquiries={enquiries}
        salespersons={salespersons}
        currentUser={user}
        onClose={() => setSelectedContactDetail(null)}
        onEdit={(ct) => {
          setContactToEdit(ct);
          setSelectedCompanyForContact(ct.company_id);
          setContactModalOpen(true);
        }}
        onDelete={(ct) => {
          if (ct.id) handleDeleteContact(ct.id);
        }}
        onSelectEnquiry={onSelectEnquiry}
        onSelectCallLog={(log) => setSelectedCallLogDetail(log)}
      />

      {/* Delete Contact Confirmation Modal */}
      {contactToDeleteConfirm && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full border border-slate-800 shadow-2xl p-6 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-2 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Delete Personnel Contact</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete contact <strong className="text-slate-100">{contactToDeleteConfirm.contact.full_name}</strong>?
            </p>

            {contactToDeleteConfirm.linkedEnquiriesCount > 0 ? (
              <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl text-xs text-amber-200 space-y-1">
                <p className="font-bold flex items-center space-x-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Linked Records Impact ({contactToDeleteConfirm.linkedEnquiriesCount} enquiries)</span>
                </p>
                <p className="text-[11px] text-amber-300">
                  This contact person is referenced in {contactToDeleteConfirm.linkedEnquiriesCount} active or historical enquiries. Deleting them will safely unassign the contact ID and mark their name as "(Deleted)" in those enquiries so record integrity is preserved.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                This contact has no linked active enquiries. This action cannot be undone.
              </p>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setContactToDeleteConfirm(null)}
                className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteContact}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition shadow-xs flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Call Log Detail Inspection Modal */}
      {selectedCallLogDetail && (
        <CallLogDetailModal
          entry={selectedCallLogDetail}
          currentUser={user}
          onClose={() => setSelectedCallLogDetail(null)}
          onOpenCompany360={(companyId) => {
            setSelectedCallLogDetail(null);
            if (onOpenCompany360) {
              onOpenCompany360(companyId);
            } else {
              setSelectedCompanyId(companyId);
            }
          }}
          onEdit={(log) => {
            setSelectedCallLogDetail(null);
            if (onOpenActivityDrawer) {
              onOpenActivityDrawer({
                existingLog: log,
                companyId: log.company_id,
                companyName: log.company_name,
                contactId: log.contact_id,
                contactName: log.contact_name,
                contactPhone: log.contact_phone,
                enquiryId: log.enquiry_id,
                channel: (log.channel as any) || 'Call',
                initialStatus: log.status
              });
            }
          }}
          onDelete={async (id) => {
            try {
              await safeDeleteDoc('call_logs', id);
              if (setCallLogs) {
                setCallLogs((prev) => prev.filter((cl) => cl.id !== id));
              }
              setSelectedCallLogDetail(null);
            } catch (err: any) {
              console.error('Failed to delete call log from CompanyModal:', err);
              alert('Error deleting call log: ' + err.message);
            }
          }}
          onOpenEnquiry={onSelectEnquiry}
          companies={companies}
          contacts={contacts}
          enquiries={enquiries}
          callLogs={callLogs}
        />
      )}
    </PageBody>
  </>
);
}
