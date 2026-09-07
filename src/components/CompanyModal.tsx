import React, { useState, useMemo, useEffect } from 'react';
import { sanitizeAuditPayload } from '../utils/sanitizeAuditLog';
import { useActivityLauncher, InitiateActivityOptions } from '../context/ActivityLauncherContext';
import { CustomLabelSelect, PHONE_LABEL_DEFAULT_OPTIONS, EMAIL_LABEL_DEFAULT_OPTIONS } from './CustomLabelSelect';
import { Company, Contact, Enquiry, UserProfile, LegalSuffix, Workspace, getContactPhones, getContactEmails, getCompanyPhones, getCompanyEmails, LabeledPhone, LabeledEmail, PhoneCategory, DropdownOption, CallLogEntry, Salesperson, ContactMethod, isSamePhoneNumber } from '../types';
import { getReferenceId } from '../utils/refId';
import { recordAuditLog } from '../utils/auditLogger';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import ContactModal, { normalizePhoneKey, getLineRestriction } from './ContactModal';
import ContactDetailModal from './ContactDetailModal';
import CallLogDetailModal from './CallLogDetailModal';
import CompanyDetailView from './CompanyDetailView';
import TemperatureBadge from './TemperatureBadge';
import GoogleSearchButton from './common/GoogleSearchButton';
import { PARENT_INDUSTRIES, getDistinctRawBusinessTypes, IndustryBadge, formatSubTypeName } from '../utils/taxonomy';
import { useIndustryTaxonomy } from '../hooks/useIndustryTaxonomy';
import IndustryTaxonomySelector from './common/IndustryTaxonomySelector';
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
  List,
  Table,
  ChevronDown,
  ChevronRight,
  History,
  ChevronUp,
  Zap,
  Sparkles,
  MessageSquare,
  Link2,
  Eye
} from 'lucide-react';
import { isRecordOwner, canUserClickRecord, getSalespersonFullName } from '../utils/permissions';
import { computeCanonicalName, generateCompanySearchTerms, sanitizeWhatsAppNumber, getWhatsAppUrl } from '../utils/defaults';
import { findDuplicateCompany, findDuplicateContact } from '../utils/fuzzyMatch';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';
import CompanyExportModal from './CompanyExportModal';


const CreatableCombobox = ({ value, onChange, onCreateOption, options, placeholder, className }: any) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value || '');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt: string) => 
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );
  
  filteredOptions.sort((a: string, b: string) => {
    const aStarts = a.toLowerCase().startsWith(inputValue.toLowerCase());
    const bStarts = b.toLowerCase().startsWith(inputValue.toLowerCase());
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.localeCompare(b);
  });
  
  const showCreateOption = inputValue && !options.some((opt: string) => opt.toLowerCase() === inputValue.toLowerCase());

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={className}
        placeholder={placeholder}
      />
      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 && filteredOptions.map((opt: string) => (
            <div
              key={opt}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue(opt);
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
          {showCreateOption && (
            <div
              className="px-3 py-2 text-sm cursor-pointer bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border-t border-slate-200 dark:border-slate-800"
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue(inputValue);
                if (onCreateOption) onCreateOption(inputValue);
                else onChange(inputValue);
                setIsOpen(false);
              }}
            >
              Add "{inputValue}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
  setIndustryTypes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  activeWorkspace?: Workspace;
  industryTypes?: DropdownOption[];
  companyRelationships?: DropdownOption[];
  companyTemperatures?: DropdownOption[];
  onOpenCompany360?: (companyId: string) => void;
  initialSelectedCompanyId?: string | null;
  initialOpenEdit?: boolean;
  companyEditTrigger?: number;
  onClearCompanyEditContext?: () => void;
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
  onOpenMobileMenu?: () => void;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
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

export { sanitizeWhatsAppNumber, getWhatsAppUrl };

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
  setIndustryTypes,
  activeWorkspace,
  industryTypes = [],
  companyRelationships,
  companyTemperatures,
  onOpenCompany360,
  initialSelectedCompanyId,
  initialOpenEdit,
  companyEditTrigger,
  onClearCompanyEditContext,
  onOpenActivityDrawer,
  onInitiateActivity,
  onOpenMobileMenu,
  triggerToast
}: CompanyModalProps) {
  const launcher = useActivityLauncher();
  const handleInitiate = onInitiateActivity || launcher.initiateActivity;
  const { sectors: liveTaxonomySectors, findParentForSubtype } = useIndustryTaxonomy();
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
        className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
      };
    }
    if (val === 'hot') {
      return {
        label: 'Hot 🔥',
        className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
      };
    }
    if (val === 'warm') {
      return {
        label: 'Warm 🌤️',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
      };
    }
    return {
      label: 'Cold ❄️',
      className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800'
    };
  };
  const [viewMode, setViewMode] = useState<'companies' | 'contacts' | 'phones'>('companies');
  const [showExportModal, setShowExportModal] = useState(false);
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [relationshipFilter, setRelationshipFilter] = useState<string>('ALL');
  const [temperatureFilter, setTemperatureFilter] = useState<string>('ALL');
  const [companyViewStyle, setCompanyViewStyle] = useState<'cards' | 'table'>('table');
  const [contactViewStyle, setContactViewStyle] = useState<'table' | 'cards'>('table');

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
  const [legalSuffix, setLegalSuffix] = useState<LegalSuffix>('None / To Be Added Later');
  const [country, setCountry] = useState('UAE');
  const [city, setCity] = useState('');
  const [industryParent, setIndustryParent] = useState<string>('');
  const [businessTypeRaw, setBusinessTypeRaw] = useState<string>('');
  const [industryType, setIndustryType] = useState<string>('');
  const distinctRawBusinessTypes = useMemo(() => getDistinctRawBusinessTypes(companies), [companies]);
  const [website, setWebsite] = useState('');
  const [generalPhone, setGeneralPhone] = useState('');
  const [generalEmail, setGeneralEmail] = useState('');
  const [companyPhones, setCompanyPhones] = useState<ContactMethod[]>([{ id: 'init_p1', label: 'Landline', value: '' }]);
  const [companyEmails, setCompanyEmails] = useState<ContactMethod[]>([{ id: 'init_e1', label: 'Work', value: '' }]);
  const [companyLinks, setCompanyLinks] = useState<{ id: string; label: string; url: string }[]>([]);
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
  const [isInternalCompany, setIsInternalCompany] = useState<boolean>(false);

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

  // Inline Duplication warning states
  const [duplicateMatch, setDuplicateMatch] = useState<Company | null>(null);
  const [duplicateMatchInfo, setDuplicateMatchInfo] = useState<{ similarity: number; reason: string } | null>(null);
  const [ignoredDuplicateIds, setIgnoredDuplicateIds] = useState<string[]>([]);
  const [isAddingAlias, setIsAddingAlias] = useState(false);
  const [localToast, setLocalToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Merge states
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const isEditable = user.role !== 'Viewer';

  // Debounced inline duplicate checking as user types into Canonical Name (250ms debounce)
  useEffect(() => {
    if (!showAddCompany) {
      setDuplicateMatch(null);
      setDuplicateMatchInfo(null);
      return;
    }

    const trimmed = canonicalName.trim();
    if (trimmed.length < 2) {
      setDuplicateMatch(null);
      setDuplicateMatchInfo(null);
      return;
    }

    const timer = setTimeout(() => {
      const matchRes = findDuplicateCompany(
        trimmed,
        companies,
        editingCompany ? editingCompany.id : undefined
      );

      if (matchRes && matchRes.match) {
        if (!ignoredDuplicateIds.includes(matchRes.match.id)) {
          setDuplicateMatch(matchRes.match);
          setDuplicateMatchInfo({
            similarity: matchRes.similarity,
            reason: matchRes.reason
          });
        } else {
          setDuplicateMatch(null);
          setDuplicateMatchInfo(null);
        }
      } else {
        setDuplicateMatch(null);
        setDuplicateMatchInfo(null);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [canonicalName, companies, editingCompany, ignoredDuplicateIds, showAddCompany]);

  useEffect(() => {
    if (localToast) {
      const timer = setTimeout(() => setLocalToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [localToast]);

  const handleAddAsAlias = async () => {
    if (!duplicateMatch) return;
    const nameToAdd = canonicalName.trim();
    if (!nameToAdd) return;

    setIsAddingAlias(true);
    try {
      const currentAliases = Array.isArray(duplicateMatch.aliases) ? [...duplicateMatch.aliases] : [];
      if (!currentAliases.some((a) => a.toLowerCase() === nameToAdd.toLowerCase())) {
        currentAliases.push(nameToAdd);
      }

      const updatedData: Partial<Company> = {
        aliases: currentAliases,
        updatedAt: new Date().toISOString(),
        last_modified_by_uid: user?.uid || '',
        last_modified_by_name: user?.full_name || user?.username || user?.email || 'Unknown User'
      };

      await CompanyRepository.updateCompany(duplicateMatch.id, updatedData);
      try {
        await recordAuditLog({
          document_id: duplicateMatch.id,
          entity_type: 'company',
          entity_title: duplicateMatch.display_name || duplicateMatch.canonical_name,
          action: 'update',
          user,
          after: { aliases: currentAliases },
          details: `Added alias "${nameToAdd}" to company "${duplicateMatch.display_name || duplicateMatch.canonical_name}"`
        });
      } catch (aErr) {
        console.warn('Audit log error on adding alias:', aErr);
      }

      if (setCompanies) {
        setCompanies((prev) => prev.map((c) => (c.id === duplicateMatch.id ? { ...c, ...updatedData } : c)));
      }

      const targetName = duplicateMatch.display_name || duplicateMatch.canonical_name;
      const toastMsg = `Added '${nameToAdd}' as an alias to ${targetName}.`;

      if (triggerToast) {
        triggerToast(toastMsg, 'success');
      } else {
        setLocalToast({ text: toastMsg, type: 'success' });
      }

      closeCompanyModal();
    } catch (err: any) {
      console.error('Failed to add alias:', err);
      alert('Failed to add alias: ' + err.message);
    } finally {
      setIsAddingAlias(false);
    }
  };

  const handleViewExisting = () => {
    if (!duplicateMatch) return;
    const targetId = duplicateMatch.id;
    closeCompanyModal();
    setSelectedCompanyId(targetId);
  };

  const handleDismissDuplicate = () => {
    if (!duplicateMatch) return;
    setIgnoredDuplicateIds((prev) => [...prev, duplicateMatch.id]);
    setDuplicateMatch(null);
    setDuplicateMatchInfo(null);
  };

  const generateCmId = () => `cm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const closeCompanyModal = () => {
    if (onClearCompanyEditContext) onClearCompanyEditContext();
    setShowAddCompany(false);
    setEditingCompany(null);
    setCanonicalName('');
    setLegalSuffix('None / To Be Added Later');
    setCountry('UAE');
    setCity('');
    setIndustryParent('');
    setBusinessTypeRaw('');
    setIndustryType('');
    setGeneralPhone('');
    setGeneralEmail('');
    setCompanyPhones([{ id: generateCmId(), label: 'Landline', value: '' }]);
    setCompanyEmails([{ id: generateCmId(), label: 'Work', value: '' }]);
    setCompanyLinks([{ id: generateCmId(), label: 'Website', url: '' }]);
    setEditingRestrictedLines({});
    setRelationship('Prospect');
    setTemperature('Cold');
    setNotes('');
    setAliasesInput('');
    setIsInternalCompany(false);
    setDuplicateMatch(null);
    setDuplicateMatchInfo(null);
    setIgnoredDuplicateIds([]);
    setIsAddingAlias(false);
    setPendingBypass(false);
    setIsSavingCompany(false);
  };

  const handleOpenAddCompany = () => {
    setEditingCompany(null);
    setCanonicalName('');
    setLegalSuffix('None / To Be Added Later');
    setCountry('UAE');
    setCity('');
    setIndustryParent('');
    setBusinessTypeRaw('');
    setIndustryType('');
    setGeneralPhone('');
    setGeneralEmail('');
    setCompanyPhones([{ id: generateCmId(), label: 'Landline', value: '' }]);
    setCompanyEmails([{ id: generateCmId(), label: 'Work', value: '' }]);
    setCompanyLinks([{ id: generateCmId(), label: 'Website', url: '' }]);
    setEditingRestrictedLines({});
    setRelationship('Prospect');
    setTemperature('Cold');
    setNotes('');
    setAliasesInput('');
    setIsInternalCompany(false);
    setDuplicateMatch(null);
    setDuplicateMatchInfo(null);
    setIgnoredDuplicateIds([]);
    setIsAddingAlias(false);
    setPendingBypass(false);
    setShowAddCompany(true);
  };

  const handleOpenEditCompany = (comp: Company) => {
    setEditingCompany(comp);
    setIsInternalCompany(Boolean(comp.isInternalCompany));
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
    const rawVal = comp.business_type_raw || comp.industry || comp.industry_type || '';
    let resolvedParent = comp.industry_parent || '';
    if (!resolvedParent && rawVal) {
      const detected = findParentForSubtype(rawVal);
      if (detected) {
        resolvedParent = detected.id;
      }
    }
    setIndustryParent(resolvedParent);
    setBusinessTypeRaw(rawVal);
    setIndustryType(rawVal);
    setWebsite(comp.website || '');
    setGeneralPhone(comp.general_phone || comp.phone || '');
    setGeneralEmail(comp.general_email || comp.email || '');
    setCompanyLinks(comp.links?.length ? comp.links : [{ id: generateCmId(), label: 'Website', url: comp.website || '' }]);
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
    setDuplicateMatch(null);
    setDuplicateMatchInfo(null);
    setIgnoredDuplicateIds([]);
    setIsAddingAlias(false);
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

    // Check duplicate match if not editing and not ignored
    if (!editingCompany) {
      const matchRes = findDuplicateCompany(canonicalName, companies);
      if (matchRes && matchRes.match && !ignoredDuplicateIds.includes(matchRes.match.id)) {
        setDuplicateMatch(matchRes.match);
        setDuplicateMatchInfo({
          similarity: matchRes.similarity,
          reason: matchRes.reason
        });
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
    const validLinks = companyLinks.filter((l) => l.url.trim() !== '');

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
      industry_parent: industryParent || undefined,
      business_type_raw: businessTypeRaw.trim() || undefined,
      industry_type: businessTypeRaw.trim() || industryType.trim() || undefined,
      industry: businessTypeRaw.trim() || industryType.trim() || undefined,
      links: validLinks,
      website: validLinks.find((l) => l.label === 'Website')?.url || '',
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
      isInternalCompany: isInternalCompany,
      linkedWorkspaceId: isInternalCompany ? (editingCompany?.linkedWorkspaceId || activeWorkspace?.id) : undefined,
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
        setContacts((prev) => prev.map((c) => c.id === contactId ? {
          ...c,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : c));
      }
      setSelectedContactIds((prev) => prev.filter((id) => id !== contactId));

      await safeUpdateDoc('contacts', contactId, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });

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
        await safeUpdateDoc('contacts', id, {
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid || null,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        });
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
        setContacts((prev) => prev.map((c) => idsToDelete.includes(c.id!) ? {
          ...c,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : c));
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
        before: sanitizeAuditPayload(before || {}),
        after: sanitizeAuditPayload(after || {}),
        changes: sanitizeAuditPayload(changes || [])
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
            await safeUpdateDoc('contacts', ct.id, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid || null,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            });
          }
        }
        if (setContacts) {
          setContacts((prev) => prev.map((ct) => ct.company_id === id ? {
            ...ct,
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          } : ct));
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
        setCompanies((prev) => prev.map((c) => c.id === id ? {
          ...c,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_uid: user?.uid,
          deleted_by_name: user?.full_name || user?.username || 'Unknown'
        } : c));
      }

      // Soft delete company document
      await safeUpdateDoc('companies', id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by_uid: user?.uid || null,
        deleted_by_name: user?.full_name || user?.username || 'Unknown'
      });

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
    if (c.is_deleted) return false;
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
      (c.industry_parent && c.industry_parent.toLowerCase().includes(q)) ||
      (c.business_type_raw && c.business_type_raw.toLowerCase().includes(q)) ||
      (c.industry && c.industry.toLowerCase().includes(q)) ||
      (c.industry_type && c.industry_type.toLowerCase().includes(q)) ||
      (c.relationship && c.relationship.toLowerCase().includes(q)) ||
      (c.temperature && c.temperature.toLowerCase().includes(q)) ||
      c.aliases.some((a) => a.toLowerCase().includes(q));

    const matchesIndustry =
      industryFilter === 'ALL' ||
      c.industry_parent === industryFilter;

    const matchesRelationship =
      relationshipFilter === 'ALL' ||
      (c.relationship || 'Prospect') === relationshipFilter;

    const matchesTemperature =
      temperatureFilter === 'ALL' ||
      (c.temperature || 'Cold') === temperatureFilter;

    return matchesSearch && matchesIndustry && matchesRelationship && matchesTemperature;
  });

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const companyContacts = useMemo(() => {
    const direct = contacts.filter((c) => c.company_id === selectedCompanyId);
    if (!selectedCompany?.isInternalCompany || !salespersons || salespersons.length === 0) {
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
        id: `ct_team_${selectedCompanyId}_${sp.id}`,
        company_id: selectedCompanyId,
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
  }, [contacts, selectedCompanyId, selectedCompany?.isInternalCompany, salespersons, activeWorkspace?.id]);
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
            label: viewMode === 'companies' ? 'Export Directory' : 'Export CSV',
            icon: Download,
            onClick: () => {
              if (viewMode === 'companies') {
                setShowExportModal(true);
              } else {
                handleExportDirectoryCSV();
              }
            }
          },
          {
            label: 'Print PDF',
            icon: Printer,
            onClick: () => {
              if (viewMode === 'companies') {
                setShowExportModal(true);
              } else {
                handlePrintDirectoryPDF();
              }
            }
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
          {viewMode === 'companies' ? (
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-2 transition shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Directory (PDF / CSV)</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleExportDirectoryCSV}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={handlePrintDirectoryPDF}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* VIEW 1: COMPANIES REGISTRY */}
      {viewMode === 'companies' && (
        <div id="companies-tab" className="text-slate-200 flex flex-col gap-6 w-full">
          {/* Companies Registry Main Container */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-3">
                <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white font-sans">Companies Registry</h2>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                      {filteredCompanies.length} registered
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Canonical directory of account entities and relationships</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {isEditable && (
                  <button
                    onClick={handleOpenAddCompany}
                    className="py-2 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition duration-150 flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Company</span>
                  </button>
                )}
              </div>
            </div>

              {/* Faceted Search & Filters */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                  <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                    <Filter className="w-4 h-4" />
                    <span>Faceted Search & Filters</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setCompanyViewStyle('cards')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition ${
                        companyViewStyle === 'cards'
                          ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyViewStyle('table')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition ${
                        companyViewStyle === 'table'
                          ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Table</span>
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="relative md:col-span-5">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search companies by canonical name, city, aliases, numbers, emails..."
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <select
                      value={industryFilter}
                      onChange={(e) => setIndustryFilter(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-sans"
                    >
                      <option value="ALL">All Macro Industries</option>
                      {liveTaxonomySectors.map((pi) => (
                        <option key={pi.id} value={pi.id}>
                          {pi.icon} {pi.label || pi.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="md:col-span-2">
                    <select
                      value={relationshipFilter}
                      onChange={(e) => setRelationshipFilter(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-sans"
                    >
                      <option value="ALL">All Relationships</option>
                      {(companyRelationships || []).map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="md:col-span-2">
                    <select
                      value={temperatureFilter}
                      onChange={(e) => setTemperatureFilter(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-sans"
                    >
                      <option value="ALL">All Temperatures</option>
                      {(companyTemperatures || []).map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {filteredCompanies.length > 0 ? (
                companyViewStyle === 'table' ? (
                  <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        <tr>
                          <th className="py-3.5 px-4">Ref ID</th>
                          <th className="py-3.5 px-4">Company Name & City</th>
                          <th className="py-3.5 px-4">Industry / Type</th>
                          <th className="py-3.5 px-4">Relationship & Temp</th>
                          <th className="py-3.5 px-4">Phones & Emails</th>
                          <th className="py-3.5 px-4">Activity</th>
                          <th className="py-3.5 px-4 text-right">Action</th>
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
                              className={`cursor-pointer transition-colors group hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                                isSelected ? 'bg-blue-50/70 dark:bg-blue-950/30 border-l-4 border-l-blue-600' : ''
                              }`}
                            >
                              <td className="py-4 px-4 font-mono text-xs text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                                {getReferenceId('CMP', c, companies)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <div className="font-semibold text-slate-900 dark:text-white font-sans text-sm">{c.display_name}</div>
                                  <GoogleSearchButton companyName={c.display_name} location={c.city} size="xs" />
                                  {c.isInternalCompany && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                      <span>🏢</span>
                                      <span>Our Company</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-600 dark:text-slate-300 text-xs flex items-center space-x-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />
                                  <span>{c.city}, {c.country}</span>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <IndustryBadge company={c ? { ...c, business_type_raw: formatSubTypeName((c as any).subType || c.business_type_raw) } : c} />
                              </td>
                              <td className="py-4 px-4 whitespace-nowrap">
                                <div className="flex flex-col gap-1.5 items-start">
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    {relVal}
                                  </span>
                                  <TemperatureBadge
                                    companyId={c.id}
                                    temperature={c.temperature}
                                    isDnc={c.is_dnc}
                                    variant="pill"
                                    companies={companies}
                                    setCompanies={setCompanies}
                                  />
                                </div>
                              </td>
                              <td className="py-4 px-4 text-xs font-mono">
                                {phones.length > 0 ? (
                                  <div className="truncate max-w-[180px] text-slate-900 dark:text-slate-100 font-mono text-xs font-medium" title={phones[0].number}>
                                    {phones[0].number}
                                  </div>
                                ) : (
                                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300 not-italic">No phone saved</div>
                                )}
                                {emails.length > 0 ? (
                                  <div className="truncate max-w-[180px] text-slate-600 dark:text-slate-300 text-xs font-mono mt-0.5" title={emails[0].email}>
                                    {emails[0].email}
                                  </div>
                                ) : (
                                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300 not-italic mt-0.5">No email addresses saved</div>
                                )}
                              </td>
                              <td className="py-4 px-4 whitespace-nowrap">
                                {linkCount > 0 ? (
                                  <span className="text-slate-900 dark:text-white font-medium text-xs">{linkCount} Enquiries</span>
                                ) : (
                                  <span className="italic text-slate-600 dark:text-slate-300 text-xs">0 Enquiries</span>
                                )}
                              </td>
                              <td className="py-4 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCompanyId(c.id!);
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border shadow-xs ${
                                    isSelected
                                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-semibold'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {isSelected ? 'Inspecting' : 'Inspect'}
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
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedCompanyId(c.id!)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedCompanyId(c.id!);
                            }
                          }}
                          className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 group cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 text-slate-900 dark:text-white shadow-sm'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="space-y-2 w-full">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                                <span className="text-sm font-semibold text-slate-900 dark:text-white block truncate font-sans">{c.display_name}</span>
                                <GoogleSearchButton companyName={c.display_name} location={c.city} size="xs" />
                                {c.isInternalCompany && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                                    <span>🏢</span>
                                    <span>Our Company</span>
                                  </span>
                                )}
                              </div>
                              <TemperatureBadge
                                companyId={c.id}
                                temperature={c.temperature}
                                isDnc={c.is_dnc}
                                variant="pill"
                                companies={companies}
                                setCompanies={setCompanies}
                              />
                            </div>

                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center space-x-1 font-sans">
                                <MapPin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                                <span>{c.city}, {c.country}</span>
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                {relVal}
                              </span>
                              <IndustryBadge company={c ? { ...c, business_type_raw: formatSubTypeName((c as any).subType || c.business_type_raw) } : c} />
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 w-full text-xs font-mono text-slate-600 dark:text-slate-300">
                            <span>{c.aliases && c.aliases.length > 0 ? `${c.aliases.length} ALIASES` : <span className="italic text-slate-500 dark:text-slate-400">NO ALIASES</span>}</span>
                            <span className={linkCount > 0 ? "text-blue-600 dark:text-blue-400 font-semibold" : "italic text-slate-500 dark:text-slate-400"}>
                              {linkCount > 0 ? `${linkCount} ENQUIRIES` : '0 ENQUIRIES'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-sans text-sm italic">
                  No matching companies found in your database.
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
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer ${ct.id && selectedContactIds.includes(ct.id) ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-slate-800'}`}
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
                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm font-sans flex items-center space-x-2">
                          <span>{ct.full_name}</span>
                          {ct.is_primary && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              Primary
                            </span>
                          )}
                          {ct.is_dnc && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              DNC
                            </span>
                          )}
                        </h4>
                      </div>
                    </div>
                    {ct.designation && <p className="text-xs text-slate-500 dark:text-slate-400 pl-6.5">{ct.designation}</p>}
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center space-x-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{ct.companyName}</span>
                    </p>
                  </div>

                  <div className="space-y-1 text-xs font-mono text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {ct.mobile && (
                      <div className="flex items-center space-x-1.5">
                        <PhoneCall className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <button
                          type="button"
                          onClick={(e) => {
                            handleInitiate({
                              companyId: ct.company_id,
                              companyName: ct.companyName,
                              contactId: ct.id,
                              contactName: ct.full_name,
                              contact: ct,
                              targetType: 'contact',
                              contactPhone: ct.mobile,
                              channel: 'Call',
                              externalUrl: `tel:${ct.mobile}`,
                              e
                            });
                          }}
                          className="hover:underline font-bold text-blue-600 cursor-pointer text-left"
                        >{ct.mobile}</button>
                      </div>
                    )}
                    {ct.email && (
                      <div className="flex items-center space-x-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <button
                          type="button"
                          onClick={(e) => {
                            handleInitiate({
                              companyId: ct.company_id,
                              companyName: ct.companyName,
                              contactId: ct.id,
                              contactName: ct.full_name,
                              contact: ct,
                              targetType: 'contact',
                              contactEmail: ct.email,
                              channel: 'Email',
                              externalUrl: `mailto:${ct.email}`,
                              e
                            });
                          }}
                          className="hover:underline text-slate-700 dark:text-slate-300 truncate cursor-pointer text-left"
                        >{ct.email}</button>
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
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteContact(ct.id!)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-800 transition flex items-center space-x-1"
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
            <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs font-sans">
              <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-xs border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredContacts.length > 0 && filteredContacts.every((c) => c.id && selectedContactIds.includes(c.id))}
                      onChange={handleSelectAllContacts}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      title="Select/Deselect All Filtered Contacts"
                    />
                  </th>
                  <th className="py-3.5 px-4">Contact Name & Role</th>
                  <th className="py-3.5 px-4">Assigned Company</th>
                  <th className="py-3.5 px-4">Mobile Phone</th>
                  <th className="py-3.5 px-4">Landline Phone</th>
                  <th className="py-3.5 px-4">Email Address</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredContacts.map((ct) => (
                  <tr
                    key={ct.id}
                    onClick={() => setSelectedContactDetail(ct)}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer ${ct.id && selectedContactIds.includes(ct.id) ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''}`}
                  >
                    <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!(ct.id && selectedContactIds.includes(ct.id))}
                        onChange={() => ct.id && handleToggleSelectContact(ct.id)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                        <span>{ct.full_name}</span>
                        {ct.is_primary && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            Primary
                          </span>
                        )}
                        {ct.is_dnc && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            DNC
                          </span>
                        )}
                      </div>
                      {ct.designation && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ct.designation}</div>}
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{ct.companyName}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{ct.location}</div>
                    </td>
                    <td className="py-4 px-4">
                      {ct.mobile ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            handleInitiate({
                              companyId: ct.company_id,
                              companyName: ct.companyName,
                              contactId: ct.id,
                              contactName: ct.full_name,
                              contact: ct,
                              targetType: 'contact',
                              contactPhone: ct.mobile,
                              channel: 'Call',
                              externalUrl: `tel:${ct.mobile}`,
                              e
                            });
                          }}
                          className="font-mono text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center space-x-1 cursor-pointer"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>{ct.mobile}</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 italic text-xs">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {ct.landline ? (
                        <span className="font-mono text-slate-700 dark:text-slate-300 font-medium text-xs">{ct.landline}</span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {ct.email ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            handleInitiate({
                              companyId: ct.company_id,
                              companyName: ct.companyName,
                              contactId: ct.id,
                              contactName: ct.full_name,
                              contact: ct,
                              targetType: 'contact',
                              contactEmail: ct.email,
                              channel: 'Email',
                              externalUrl: `mailto:${ct.email}`,
                              e
                            });
                          }}
                          className="text-slate-700 dark:text-slate-300 hover:text-blue-600 hover:underline font-mono text-xs cursor-pointer text-left"
                        >
                          {ct.email}
                        </button>
                      ) : (
                        <span className="text-slate-400 italic text-xs">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {isEditable && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setContactToEdit(ct);
                                setContactModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-md transition flex items-center space-x-1"
                              title="Edit Contact"
                            >
                              <Edit className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteContact(ct.id!)}
                              className="px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 rounded-md transition flex items-center space-x-1"
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
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-md transition"
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
                    <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500 italic text-sm">
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <Phone className="w-6 h-6 text-blue-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white font-sans">Telecom & Phone Number Directory</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
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
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 pl-10 pr-4 text-xs text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-xs border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Phone Number</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Associated Person / Entity</th>
                  <th className="py-3.5 px-4">Role / Context</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4 text-right">Quick Dial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredPhones.map((p) => {
                  const isRestricted = Boolean(p.restriction);
                  const badgeText = p.restriction === 'DNC' ? 'DNC' : 'INVALID';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="py-4 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center space-x-1.5">
                          {isRestricted ? (
                            <span className="line-through text-slate-400 cursor-not-allowed" title={`Restricted line (${badgeText})`}>
                              {p.number}
                            </span>
                          ) : (
                            <span>{p.number}</span>
                          )}
                          {isRestricted && (
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide border ${
                              p.restriction === 'Invalid'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            }`}>
                              {badgeText}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide border ${
                            p.type === 'Mobile'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : p.type === 'Landline'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {p.type}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-900 dark:text-white">{p.entityName}</td>
                      <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{p.subText || <span className="italic text-slate-400">—</span>}</td>
                      <td className="py-4 px-4 text-slate-500 dark:text-slate-400">{p.location || <span className="italic text-slate-400">—</span>}</td>
                      <td className="py-4 px-4 text-right">
                        {!isRestricted ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              handleInitiate({
                                companyId: p.companyId,
                                companyName: p.subText,
                                contactId: p.contactId,
                                contactName: p.contactId ? p.entityName : undefined,
                                targetType: p.contactId ? 'contact' : 'company_mainline',
                                contactPhone: p.number,
                                channel: 'Call',
                                externalUrl: `tel:${p.number}`,
                                e
                              });
                            }}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition shadow-xs cursor-pointer"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-sans italic">Disabled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredPhones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500 italic text-sm">
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
        <div id="company-form-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="max-w-3xl w-full max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-white dark:bg-slate-900 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-sans">
                      {editingCompany ? 'Edit Company' : 'Add Company'}
                    </h2>
                    {canonicalName.trim() && (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(canonicalName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Search Company on Google"
                      >
                        <Search className="w-3 h-3" />
                        <span>Google Search</span>
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                    Canonical corporate entity profile, sector taxonomy, and contact channels.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCompanyModal}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Container */}
            <form onSubmit={submitCompany} className="flex-1 flex flex-col min-h-0 overflow-hidden font-sans">
              {/* Scroll Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 pb-8 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-8">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                      Canonical Name <span className="text-rose-500 font-bold ml-0.5">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Veolia Water Solutions"
                      value={canonicalName}
                      onChange={(e) => setCanonicalName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                      Legal Suffix
                    </label>
                    <select
                      value={legalSuffix}
                      onChange={(e) => setLegalSuffix(e.target.value as LegalSuffix)}
                      className="w-full px-3.5 py-2.5 pr-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans cursor-pointer truncate"
                    >
                      {['None / To Be Added Later', 'LLC', 'FZE', 'FZC', 'Co. LLC', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Inline Duplicate Warning Card */}
                {duplicateMatch && (
                  <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3.5 space-y-2.5 my-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                          Possible Duplicate Account Detected
                        </span>
                      </div>
                      {duplicateMatchInfo?.similarity && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60 font-mono">
                          {Math.round(duplicateMatchInfo.similarity * 100)}% match
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-amber-100/60 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-800/40">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {duplicateMatch.display_name || duplicateMatch.canonical_name}
                        </span>
                        <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700">
                          {getReferenceId('CMP', duplicateMatch, companies)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                        {duplicateMatch.city ? `${duplicateMatch.city}, ` : ''}{duplicateMatch.country || 'UAE'}
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAddAsAlias}
                        disabled={isAddingAlias}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        {isAddingAlias ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                        <span>Add as Alias</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleViewExisting}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        <span>View Existing</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDismissDuplicate}
                        className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-lg text-xs font-medium transition cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30"
                      >
                        Dismiss / Different Entity
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                    Fuzzy Search Aliases (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Veolia Water, Veolia Solutions, VWS"
                    value={aliasesInput}
                    onChange={(e) => setAliasesInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1.5 block leading-normal">
                    Helps the fuzzy matching index search variants to block subsequent duplicates.
                  </span>
                </div>

                {/* Mark as Internal / Sister Company Toggle */}
                <div className="p-3.5 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 rounded-xl flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-purple-900 dark:text-purple-200">🏢 Mark as Internal / Sister Company (Our Company)</span>
                      {isInternalCompany && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700/60">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Designates this organization as an in-house entity or branch. Internal entities are prioritized for internal tasks and excluded from client directory exports.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={isInternalCompany}
                      onChange={(e) => setIsInternalCompany(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                      City <span className="text-rose-500 font-bold ml-0.5">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharjah"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                      Country <span className="text-rose-500 font-bold ml-0.5">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. UAE"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Two-Tier Industry Taxonomy Section */}
                <IndustryTaxonomySelector
                  parentSectorId={industryParent}
                  onParentSectorChange={setIndustryParent}
                  subTypeValue={businessTypeRaw}
                  onSubTypeChange={(val) => {
                    setBusinessTypeRaw(val);
                    setIndustryType(val);
                  }}
                  userIdentifier={user?.email || user?.full_name || 'Operator'}
                  variant="auto"
                  size="md"
                  idPrefix="company-modal-ind"
                  className="mb-1"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                      Relationship <span className="text-rose-500 font-bold ml-0.5">*</span>
                    </label>
                    <select
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value)}
                      className="w-full h-11 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans font-semibold cursor-pointer"
                    >
                      {(companyRelationships || []).map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                      Temperature (Heat Level)
                    </label>
                    <select
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="w-full h-11 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans font-semibold cursor-pointer"
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

                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                      Company Phone Numbers
                    </label>
                    <button
                      type="button"
                      onClick={() => setCompanyPhones(prev => [...prev, { id: generateCmId(), label: 'Main', value: '' }])}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Phone</span>
                    </button>
                  </div>
                  <datalist id="company-phone-tags">
                  <option value="Landline" />
                  <option value="Direct Line" />
                  <option value="Mobile" />
                  <option value="WhatsApp" />
                  <option value="Fax" />
                </datalist>
                {companyPhones.map((ph, idx) => {
                  const currentRestriction = getLineRestriction(editingRestrictedLines, ph.value);

                  return (
                    <div key={ph.id || idx} className="flex items-center space-x-2">
                      <input
                        list="company-phone-tags"
                        value={ph.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                        }}
                        placeholder="Tag"
                        className="w-28 sm:w-32 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-sans bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shrink-0"
                      />
                      <input
                        type="text"
                        placeholder="Phone number..."
                        value={ph.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyPhones(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                        }}
                        className="flex-1 min-w-0 px-3.5 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />

                        <button
                          type="button"
                          onClick={() => togglePhoneRestriction(ph.value)}
                          disabled={!ph.value.trim()}
                          className={`px-2.5 py-2 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${
                            currentRestriction === 'DNC'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/40 hover:bg-rose-500/20'
                              : currentRestriction === 'Invalid'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/40 hover:bg-amber-500/20'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-300'
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
                              ? 'text-rose-500 dark:text-rose-400'
                              : currentRestriction === 'Invalid'
                              ? 'text-amber-500 dark:text-amber-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`} />
                          <span>{currentRestriction || 'Clear'}</span>
                        </button>

                        {companyPhones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setCompanyPhones(prev => prev.filter((_, i) => i !== idx))}
                            className="p-2 text-slate-400 hover:text-rose-500 transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer shrink-0"
                            title="Remove Phone"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                      Company Email Addresses
                    </label>
                    <button
                      type="button"
                      onClick={() => setCompanyEmails(prev => [...prev, { id: generateCmId(), label: 'Main', value: '' }])}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Email</span>
                    </button>
                  </div>
                  <datalist id="company-email-tags">
                  <option value="Work" />
                  <option value="Main" />
                  <option value="Inquiries" />
                  <option value="Sales" />
                  <option value="Support" />
                </datalist>
                {companyEmails.map((em, idx) => (
                  <div key={em.id || idx} className="flex items-center space-x-2">
                    <input
                      list="company-email-tags"
                      value={em.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                      }}
                      placeholder="Tag"
                      className="w-28 sm:w-32 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-sans bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shrink-0"
                    />
                    <input
                      type="email"
                      placeholder="Email address..."
                      value={em.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompanyEmails(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
                      }}
                      className="flex-1 min-w-0 px-3.5 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-sans bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                    {companyEmails.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCompanyEmails(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-400 hover:text-rose-500 transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer shrink-0"
                        title="Remove Email"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    </div>
                  ))}
                </div>

                {/* Link Tagging System */}
                <datalist id="company-link-tags">
                  <option value="Website" />
                  <option value="LinkedIn" />
                  <option value="Facebook" />
                  <option value="Instagram" />
                  <option value="Twitter" />
                  <option value="Portal" />
                </datalist>

                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                      Company Links & Portals
                    </label>
                    <button
                      type="button"
                      onClick={() => setCompanyLinks(prev => [...prev, { id: generateCmId(), label: 'Website', url: '' }])}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5"/>
                      <span>Add Link</span>
                    </button>
                  </div>
                  {companyLinks.map((link, idx) => (
                    <div key={link.id || idx} className="flex items-center space-x-2">
                      <input
                        list="company-link-tags"
                        value={link.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyLinks(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                        }}
                        placeholder="Tag (e.g. Website)"
                        className="w-28 sm:w-32 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-sans bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shrink-0"
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={link.url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyLinks(prev => prev.map((item, i) => i === idx ? { ...item, url: val } : item));
                        }}
                        className="flex-1 min-w-0 px-3.5 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      {companyLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCompanyLinks(prev => prev.filter((_, i) => i !== idx))}
                          className="p-2 text-slate-400 hover:text-rose-500 transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer shrink-0"
                          title="Remove Link"
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                    Internal Notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide any client profiles, special conditions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-sans"
                  />
                </div>

              </div>

              {/* Docked Footer */}
              <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-white dark:bg-slate-900 flex justify-end items-center gap-3">
                <button
                  type="button"
                  onClick={closeCompanyModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCompany || !activeWorkspace?.id}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingCompany ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>}
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
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setShowMerge(false);
                setMergeTargetId(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3 font-sans flex items-center space-x-2">
              <Merge className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Administrative Merge Consolidation</span>
            </h3>

            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-600 dark:text-slate-300 leading-normal font-sans space-y-1">
              <span className="font-bold text-slate-900 dark:text-slate-100 block">Merging Action:</span>
              <p>
                All contacts and enquiries currently pointing to the **Source** company will be updated in a single transaction batch to reference the **Target** company. The source company's canonical name will be appended as an alias of the target to maintain future fuzzy lookups, and the source document will be softly deleted.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Source Company (Will be merged and removed)
                </span>
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-xl text-sm font-semibold text-rose-700 dark:text-rose-300 font-sans">
                  {selectedCompany.display_name}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Company (Receives all records & aliases)
                </label>
                <select
                  value={mergeTargetId || ''}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm text-slate-900 dark:text-slate-100 focus:outline-none font-sans"
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
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 font-semibold text-white rounded-xl text-sm transition cursor-pointer shadow-md"
              >
                {merging ? 'Consolidating records...' : 'Execute Merge batch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Deletion Choice Modal */}
      {companyToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete Company</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{companyToDelete.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to delete this company?
              {companyToDelete.contactCount > 0 ? (
                <span> This company currently has <strong className="text-slate-900 dark:text-slate-100">{companyToDelete.contactCount} associated contact(s)</strong>. Please choose how to handle them:</span>
              ) : (
                <span> This action cannot be undone.</span>
              )}
            </p>

            {companyToDelete.contactCount > 0 && (
              <div className="space-y-2 mb-6 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <label className="flex items-start space-x-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition border border-transparent">
                  <input
                    type="radio"
                    name="deleteContactChoice"
                    value="unlink"
                    checked={deleteContactChoice === 'unlink'}
                    onChange={() => setDeleteContactChoice('unlink')}
                    className="mt-0.5 text-indigo-500 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">Keep contacts (unlink company)</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Contacts will remain in People Directory, but their company field will be cleared.</span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition border border-transparent">
                  <input
                    type="radio"
                    name="deleteContactChoice"
                    value="cascade"
                    checked={deleteContactChoice === 'cascade'}
                    onChange={() => setDeleteContactChoice('cascade')}
                    className="mt-0.5 text-rose-500 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-bold text-rose-600 dark:text-rose-400 block">Delete associated contacts too</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">All {companyToDelete.contactCount} associated contact persons will also be deleted.</span>
                  </div>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setCompanyToDelete(null)}
                disabled={isDeletingCompany}
                className="py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-sans mb-6">{confirmDialog.message}</p>
            <div className="flex items-center justify-end space-x-3 font-sans">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
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

      {/* Bulk Reassign Modal */}
      {showBulkReassignModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Bulk Reassign {selectedContactIds.length} Contact(s)
                </h3>
              </div>
              <button
                onClick={() => setShowBulkReassignModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Select the target company account to associate with all {selectedContactIds.length} selected contacts:
            </p>

            <select
              value={bulkReassignCompanyId}
              onChange={(e) => setBulkReassignCompanyId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl focus:border-indigo-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="">-- Choose Target Company --</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.display_name} ({comp.city || 'No City'}, {comp.country || 'No Country'})
                </option>
              ))}
            </select>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowBulkReassignModal(false)}
                className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-xl cursor-pointer"
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

      {/* Slide-Over Company Inspector Drawer */}
      <CompanyDetailView
        isOpen={!!selectedCompany}
        onClose={() => setSelectedCompanyId(null)}
        company={selectedCompany || null}
        companies={companies}
        contacts={contacts}
        callLogs={callLogs}
        enquiries={enquiries}
        salespersons={salespersons}
        user={user}
        isEditable={isEditable}
        isBasicTier={user.role !== 'Admin' && user.dataVisibilityTier === 'BASIC'}
        activeWorkspace={activeWorkspace}
        onInitiateActivity={handleInitiate}
        onOpenCompany360={onOpenCompany360}
        onOpenEditCompany={handleOpenEditCompany}
        onSelectEnquiry={onSelectEnquiry}
        onSelectCallLog={(log) => setSelectedCallLogDetail(log)}
        onAddContact={(companyId) => {
          setContactToEdit(null);
          setSelectedCompanyForContact(companyId);
          setContactModalOpen(true);
        }}
        onEditContact={(ct, companyId) => {
          setContactToEdit(ct);
          setSelectedCompanyForContact(companyId);
          setContactModalOpen(true);
        }}
        onDeleteContact={handleDeleteContact}
        onOpenMerge={(companyId) => {
          setMergeSourceId(companyId);
          setShowMerge(true);
        }}
        onDeleteCompany={deleteCompany}
        setCompanies={setCompanies}
      />

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
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-500 dark:text-rose-400">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete Personnel Contact</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete contact <strong className="text-slate-900 dark:text-slate-100">{contactToDeleteConfirm.contact.full_name}</strong>?
            </p>

            {contactToDeleteConfirm.linkedEnquiriesCount > 0 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center space-x-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Linked Records Impact ({contactToDeleteConfirm.linkedEnquiriesCount} enquiries)</span>
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  This contact person is referenced in {contactToDeleteConfirm.linkedEnquiriesCount} active or historical enquiries. Deleting them will safely unassign the contact ID and mark their name as "(Deleted)" in those enquiries so record integrity is preserved.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This contact has no linked active enquiries. This action cannot be undone.
              </p>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setContactToDeleteConfirm(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
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
              await safeUpdateDoc('call_logs', id, {
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by_uid: user?.uid || null,
                deleted_by_name: user?.full_name || user?.username || 'Unknown'
              });
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((cl) => cl.id === id ? {
                  ...cl,
                  is_deleted: true,
                  deleted_at: new Date().toISOString(),
                  deleted_by_uid: user?.uid,
                  deleted_by_name: user?.full_name || user?.username || 'Unknown'
                } : cl));
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

      {showExportModal && (
        <CompanyExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          companies={companies}
          contacts={contacts}
          activeWorkspace={activeWorkspace}
        />
      )}

      {localToast && (
        <div className="fixed bottom-6 right-6 z-[150] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 animate-in fade-in slide-in-from-bottom-4">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{localToast.text}</span>
        </div>
      )}
    </PageBody>
  </>
);
}
