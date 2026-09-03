import React, { useState, useMemo } from 'react';
import { CallLogEntry, Company, Contact, Enquiry, Workspace, UserProfile, LegalSuffix, Salesperson, getCompanyPhones, getContactPhones, getCompanyEmails, isSamePhoneNumber, CallStatus } from '../types';
import { useActivityLauncher, InitiateActivityOptions } from '../context/ActivityLauncherContext';
import { safeAddDoc, safeUpdateDoc, safeDeleteDoc } from '../firebase';
import { recordAuditLog } from '../utils/auditLogger';
import { getReferenceId } from '../utils/refId';
import { isRecordOwner, canEditOrDeleteRecord, canUserClickRecord, getSalespersonFullName, getUserWorkspaceRole, getWorkspaceInitials } from '../utils/permissions';
import {
  Phone,
  PhoneCall,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  ArrowUpDown,
  Search,
  Filter,
  Building,
  User,
  Globe,
  FileText,
  ChevronRight,
  PhoneOff,
  Edit3,
  Trash2,
  Check,
  ShieldAlert,
  Zap,
  BarChart2,
  ListFilter,
  Printer,
  Eye,
  ExternalLink,
  Tag,
  MapPin,
  Mail,
  MessageSquare,
  Send,
  Users2,
  Users,
  Briefcase,
  LayoutGrid,
  List,
  Flame,
  Sun,
  Cloud,
  Snowflake,
  Table,
  Loader2,
  History
} from 'lucide-react';
import PhoneDataDiagnosticModal from './PhoneDataDiagnosticModal';
import CallLogDetailModal from './CallLogDetailModal';
import Company360Modal from './Company360Modal';
import CallLogReportModal from './CallLogReportModal';
import QuickActivityDrawer from './QuickActivityDrawer';
import LiveExecutionModal from './LiveExecutionModal';
import TemperatureBadge from './TemperatureBadge';
import { PARENT_INDUSTRIES, IndustryBadge } from '../utils/taxonomy';
import { findDuplicateCompany } from '../utils/fuzzyMatch';
import { isSuccessStatus } from '../utils/activityLogic';

export function getOffsetDateString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

export function formatActivityDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    const hasTime = dateStr.includes('T') || dateStr.includes(':');
    if (hasTime) {
      return `${month} ${day}, ${year} - ${hours}:${minutes} ${ampm}`;
    } else {
      return `${month} ${day}, ${year}`;
    }
  } catch {
    return dateStr;
  }
}

export function formatOverdueDisplayDate(dateStr?: string): string {
  if (!dateStr) return 'Date Unknown';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    const hasTime = dateStr.includes('T') || dateStr.includes(':');
    if (hasTime) {
      return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
    } else {
      return `${month} ${day}`;
    }
  } catch {
    return dateStr;
  }
}

export function parseTaskScheduledDate(dateStr?: any): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  if (typeof dateStr === 'object' && typeof dateStr.toDate === 'function') {
    const d = dateStr.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateStr === 'object' && typeof dateStr.seconds === 'number') {
    return new Date(dateStr.seconds * 1000);
  }
  if (typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  let d = new Date(clean);
  if (!isNaN(d.getTime())) return d;

  // Handle strings with dashes or bullets like "Aug 20, 2026 - 10:00 AM" or "Aug 20, 2026 • 10:00 AM"
  const sanitized = clean.replace(/\s*[-•]\s*/g, ' ');
  d = new Date(sanitized);
  if (!isNaN(d.getTime())) return d;

  return null;
}

export function isTaskOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  const parsed = parseTaskScheduledDate(dateStr);
  if (!parsed) return false;
  
  const str = typeof dateStr === 'string' ? dateStr : '';
  const hasTime = str.includes('T') || str.includes(':');
  if (!hasTime) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return parsed.getTime() < startOfToday.getTime();
  }
  
  return parsed.getTime() < Date.now();
}

export function isTaskDueTodayOrOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  const parsed = parseTaskScheduledDate(dateStr);
  if (!parsed) return false;
  
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return parsed.getTime() <= endOfToday.getTime();
}

export function isTaskDueToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  const parsed = parseTaskScheduledDate(dateStr);
  if (!parsed) return false;
  
  const now = new Date();
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}

export function isTaskUpcoming(dateStr?: string): boolean {
  if (!dateStr) return false;
  const parsed = parseTaskScheduledDate(dateStr);
  if (!parsed) return false;
  
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return parsed.getTime() > endOfToday.getTime();
}

import { DropdownOption } from '../types';
import { PageHeader, PageBody } from './layout/UiContainer';

interface CallLogManagerProps {
  activeWorkspace: Workspace;
  callLogs: CallLogEntry[];
  companies: Company[];
  contacts: Contact[];
  enquiries: Enquiry[];
  salespersons?: Salesperson[];
  user: UserProfile;
  triggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialSubTab?: 'queue' | 'log';
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  callStatuses?: DropdownOption[];
  callOutcomes?: DropdownOption[];
  callPurposes?: DropdownOption[];
  setCallStatuses?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCallOutcomes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCallPurposes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  companyRelationships?: DropdownOption[];
  industryTypes?: DropdownOption[];
  companyTemperatures?: DropdownOption[];
  onSelectEnquiry?: (enquiryId: string) => void;
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
    drawerMode?: 'create' | 'edit' | 'execute';
  }) => void;
  onInitiateActivity?: (options: InitiateActivityOptions) => void;
  onEditCompany?: (company: Company) => void;
  onOpenMobileMenu?: () => void;
}

export default function CallLogManager({
  activeWorkspace,
  callLogs,
  companies,
  contacts,
  enquiries,
  salespersons = [],
  user,
  triggerToast,
  initialSubTab = 'queue',
  setCallLogs,
  setCompanies,
  setContacts,
  callStatuses = [],
  callOutcomes = [],
  callPurposes = [],
  industryTypes = [],
  setCallStatuses,
  setCallOutcomes,
  setEnquiries,
  onSelectEnquiry,
  onOpenActivityDrawer,
  onInitiateActivity,
  onEditCompany,
  onOpenMobileMenu
}: CallLogManagerProps) {
  const launcher = useActivityLauncher();
  const handleInitiate = onInitiateActivity || launcher.initiateActivity;
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | 'execute'>('create');
  const [editingLog, setEditingLog] = useState<CallLogEntry | null>(null);
  const [executionModalTask, setExecutionModalTask] = useState<any | null>(null);
  const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);
  const [subTab, setSubTab] = useState<'queue' | 'log'>(initialSubTab);
  
  // Table vs Card View
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => (localStorage.getItem('callLogViewMode') as 'card' | 'table') || 'card');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'All'>(50);


  const handleLogSaved = (savedLog: CallLogEntry, spawnedLog?: CallLogEntry) => {
    if (setCallLogs) {
      setCallLogs((prev) => {
        let updatedList = prev.map((l) => (l.id === savedLog.id ? { ...l, ...savedLog } : l));
        if (!prev.some((l) => l.id === savedLog.id)) {
          updatedList = [savedLog, ...updatedList];
        }
        if (spawnedLog) {
          updatedList = [spawnedLog, ...updatedList.filter((l) => l.id !== spawnedLog.id)];
        }
        return updatedList;
      });
    }
  };
  const [queueTimeframe, setQueueTimeframe] = useState<'today' | 'upcoming' | 'all'>('today');
  const [queueSortOrder, setQueueSortOrder] = useState<'oldest' | 'newest'>('oldest');
  const [historySortOrder, setHistorySortOrder] = useState<'newest' | 'oldest'>('newest');

  const [confirmResolver, setConfirmResolver] = useState<((val: boolean) => void) | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const askConfirm = (title: string, message: string, isDestructive = false, confirmText = 'Confirm', cancelText = 'Cancel') => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      isDestructive
    });
    return new Promise<boolean>((resolve) => {
      setConfirmResolver(() => resolve);
    });
  };

  // Dynamic Statuses and Outcomes
  const activeStatuses = useMemo(() => {
    let raw: string[] = [];
    if (callStatuses && callStatuses.length > 0) {
      raw = callStatuses.map((s) => s.name);
    } else {
      raw = ['Scheduled / Planned', 'Completed', 'No Answer', 'Busy', 'Voicemail', 'Invalid Number', 'Connected'];
    }
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const item of raw) {
      const norm = item.trim().toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        unique.push(item);
      }
    }
    return unique;
  }, [callStatuses]);

  const activeOutcomes = useMemo(() => {
    let raw: string[] = [];
    if (callOutcomes && callOutcomes.length > 0) {
      raw = callOutcomes.map((o) => o.name);
    } else {
      raw = [
        'Reached – Decision Maker',
        'Reached – Wrong Person',
        'Interested – Follow-up Requested',
        'Forwarded',
        'Not Interested',
        'Already Has Provider / Solution',
        'Language Barrier',
        'Do Not Call (DNC)',
        'Closed – Deal Made'
      ];
    }
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const item of raw) {
      const norm = item.trim().toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        unique.push(item);
      }
    }
    return unique;
  }, [callOutcomes]);

  // Side Panel & Custom Inline State
  const [isHistorySidePanelExpanded, setIsHistorySidePanelExpanded] = useState(true);

  // Custom Inline Status & Outcome Creation State
  const [showAddCustomStatus, setShowAddCustomStatus] = useState(false);
  const [newCustomStatus, setNewCustomStatus] = useState('');
  const [showAddCustomOutcome, setShowAddCustomOutcome] = useState(false);
  const [newCustomOutcome, setNewCustomOutcome] = useState('');

  // Inline Contact Creation State
  const [showInlineContactCreate, setShowInlineContactCreate] = useState(false);
  const [inlineContactFullName, setInlineContactFullName] = useState('');
  const [inlineContactDesignation, setInlineContactDesignation] = useState('');
  const [inlineContactMobile, setInlineContactMobile] = useState('');
  const [inlineContactEmail, setInlineContactEmail] = useState('');
  const [inlineContactIsPrimary, setInlineContactIsPrimary] = useState(false);
  const [isSavingInlineContact, setIsSavingInlineContact] = useState(false);

  const handleInlineCreateContact = async () => {
    if (!inlineContactFullName.trim()) {
      triggerToast('Please enter full name for the new contact.', 'error');
      return;
    }
    setIsSavingInlineContact(true);
    try {
      const newContactObj: Omit<Contact, 'id'> = {
        workspace_id: activeWorkspace.id,
        company_id: logFormCompanyId || '',
        full_name: inlineContactFullName.trim(),
        designation: inlineContactDesignation.trim() || undefined,
        mobile: inlineContactMobile.trim() || undefined,
        email: inlineContactEmail.trim() || undefined,
        is_primary: inlineContactIsPrimary,
        is_dnc: false,
        createdAt: new Date().toISOString()
      };
      const res = await safeAddDoc('contacts', newContactObj);
      const createdId = res?.id || ('ct_' + Date.now());
      const fullCreatedContact: Contact = {
        ...newContactObj,
        id: createdId
      };

      if (setContacts) {
        setContacts((prev) => [...prev, fullCreatedContact]);
      }

      setLogFormContactId(createdId);
      setLogFormContactName(fullCreatedContact.full_name);
      if (fullCreatedContact.mobile) {
        setLogFormPhone(fullCreatedContact.mobile);
      }

      setShowInlineContactCreate(false);
      setInlineContactFullName('');
      setInlineContactDesignation('');
      setInlineContactMobile('');
      setInlineContactEmail('');
      setInlineContactIsPrimary(false);
      triggerToast(`New contact "${fullCreatedContact.full_name}" created and linked!`, 'success');
    } catch (err: any) {
      triggerToast('Failed to create contact: ' + (err?.message || err), 'error');
    } finally {
      setIsSavingInlineContact(false);
    }
  };

  const handleAddCustomStatus = async () => {
    if (!newCustomStatus.trim()) return;
    const trimmed = newCustomStatus.trim();
    if (activeStatuses.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setLogFormStatus(trimmed);
      setShowAddCustomStatus(false);
      setNewCustomStatus('');
      return;
    }
    try {
      const res = await safeAddDoc('dropdown_call_statuses', { name: trimmed });
      const newOpt = { id: res?.id || ('cs_' + Date.now()), name: trimmed };
      if (setCallStatuses) {
        setCallStatuses(prev => [...prev, newOpt]);
      }
      setLogFormStatus(trimmed);
      triggerToast(`Custom status "${trimmed}" added!`, 'success');
    } catch (err) {
      console.error(err);
    } finally {
      setShowAddCustomStatus(false);
      setNewCustomStatus('');
    }
  };

  const handleAddCustomOutcome = async (targetForm: 'log' | 'fast' = 'log') => {
    if (!newCustomOutcome.trim()) return;
    const trimmed = newCustomOutcome.trim();
    if (activeOutcomes.some(o => o.toLowerCase() === trimmed.toLowerCase())) {
      if (targetForm === 'log') setLogFormOutcome(trimmed);
      else setFastOutcome(trimmed);
      setShowAddCustomOutcome(false);
      setNewCustomOutcome('');
      return;
    }
    try {
      const res = await safeAddDoc('dropdown_call_outcomes', { name: trimmed });
      const newOpt = { id: res?.id || ('co_' + Date.now()), name: trimmed };
      if (setCallOutcomes) {
        setCallOutcomes(prev => [...prev, newOpt]);
      }
      if (targetForm === 'log') setLogFormOutcome(trimmed);
      else setFastOutcome(trimmed);
      triggerToast(`Custom outcome "${trimmed}" added!`, 'success');
    } catch (err) {
      console.error(err);
    } finally {
      setShowAddCustomOutcome(false);
      setNewCustomOutcome('');
    }
  };

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [geographyFilter, setGeographyFilter] = useState<string>('all');

  // Reset page to 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, industryFilter, statusFilter, outcomeFilter, geographyFilter]);

  // Modals & Drawers
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showFastQueueDrawer, setShowFastQueueDrawer] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CallLogEntry | null>(null);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);

  // New Modals State
  const [selectedDetailEntry, setSelectedDetailEntry] = useState<CallLogEntry | null>(null);
  const [selected360CompanyId, setSelected360CompanyId] = useState<string | null>(null);
  const [showReportExportModal, setShowReportExportModal] = useState(false);

  // Helper Badge Renderers
  const renderStatusBadge = (status: string) => {
    if (!status) return null;
    const s = status.toLowerCase();

    // Check if there is a custom color from database options
    const customOption = (callStatuses || []).find(
      (opt) => opt.name.toLowerCase() === s
    );
    if (customOption && customOption.color) {
      return (
        <span 
          style={{ backgroundColor: `${customOption.color}15`, color: customOption.color, borderColor: `${customOption.color}40` }}
          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
        >
          <Clock className="w-3 h-3" />
          <span>{status}</span>
        </span>
      );
    }

    if (isSuccessStatus(status)) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>{status}</span>
        </span>
      );
    } else if (s === 'scheduled' || s === 'scheduled / planned' || s.includes('scheduled') || s.includes('planned') || s.includes('in progress')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40">
          <Clock className="w-3 h-3 text-blue-500 dark:text-blue-400" />
          <span>{status}</span>
        </span>
      );
    } else if (
      s === 'cancelled' ||
      s === 'invalid number' ||
      s.includes('invalid') ||
      s.includes('wrong') ||
      s.includes('dnc') ||
      s.includes('blocked') ||
      s.includes('failed') ||
      s.includes('bounced') ||
      s.includes('dead') ||
      s.includes('no show')
    ) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
          <span>{status}</span>
        </span>
      );
    } else if (
      s === 'busy' ||
      s === 'no answer' ||
      s.includes('no answer') ||
      s.includes('voicemail') ||
      s.includes('busy') ||
      s.includes('unreachable') ||
      s.includes('disconnected') ||
      s.includes('dropped') ||
      s.includes('rescheduled')
    ) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <PhoneOff className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>{status}</span>
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>{status}</span>
        </span>
      );
    }
  };

  const renderOutcomeBadge = (outcome?: string) => {
    if (!outcome) return null;
    const oc = outcome.toLowerCase().trim();

    // Check if there is a custom color from database options
    const customOption = (callOutcomes || []).find(
      (opt) => opt.name.toLowerCase().trim() === oc
    );
    if (customOption && customOption.color) {
      return (
        <span 
          style={{ backgroundColor: `${customOption.color}15`, color: customOption.color, borderColor: `${customOption.color}40` }}
          className="inline-block px-2 py-0.5 rounded text-[10px] font-bold border max-w-[200px] truncate"
          title={outcome}
        >
          {outcome}
        </span>
      );
    }

    // Emerald (Positive): 'Meeting Booked', 'Quote / Proposal Requested', 'Interested / Send Info', 'Deal Closed / Won'
    const positiveOutcomes = [
      'meeting booked',
      'quote / proposal requested',
      'interested / send info',
      'deal closed / won'
    ];

    // Blue (Neutral/In-Progress): 'Quote / Info Sent', 'Collateral / Material Left', 'Information Gathered'
    const blueOutcomes = [
      'quote / info sent',
      'collateral / material left',
      'information gathered'
    ];

    // Amber (Neutral/In-Progress): 'Active Negotiation', 'Follow-up Scheduled', 'Requested Call Back'
    const amberOutcomes = [
      'active negotiation',
      'follow-up scheduled',
      'requested call back'
    ];

    // Rose (Negative/Loss): 'No Response / Ghosted', 'Under Contract / Bad Timing', 'Price / Budget Objection', 'Gatekeeper Blocked', 'Not Interested', 'Using Competitor', 'Wrong Person / Unqualified'
    const negativeOutcomes = [
      'no response / ghosted',
      'under contract / bad timing',
      'price / budget objection',
      'gatekeeper blocked',
      'not interested',
      'using competitor',
      'wrong person / unqualified'
    ];

    let color = 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

    if (positiveOutcomes.includes(oc) || oc.includes('meeting booked') || oc.includes('deal closed') || oc.includes('won')) {
      color = 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    } else if (blueOutcomes.includes(oc) || oc.includes('info sent') || oc.includes('information gathered')) {
      color = 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
    } else if (amberOutcomes.includes(oc) || oc.includes('negotiation') || oc.includes('follow-up') || oc.includes('call back')) {
      color = 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    } else if (
      negativeOutcomes.includes(oc) ||
      oc.includes('not interested') ||
      oc.includes('gatekeeper') ||
      oc.includes('competitor') ||
      oc.includes('wrong person') ||
      oc.includes('budget') ||
      oc.includes('ghosted') ||
      oc.includes('bad timing') ||
      oc.includes('dnc') ||
      oc.includes('invalid') ||
      oc.includes('dead')
    ) {
      color = 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
    }

    return (
      <span
        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border max-w-[200px] truncate ${color}`}
        title={outcome}
      >
        {outcome}
      </span>
    );
  };

  const renderPurposeBadge = (purpose?: string) => {
    if (!purpose) return null;
    return (
      <span
        className="inline-block px-2 py-0.5 rounded text-[10px] font-bold border max-w-[200px] truncate bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
        title={purpose}
      >
        {purpose}
      </span>
    );
  };

  const renderChannelBadge = (channel?: string) => {
    if (!channel) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <PhoneCall className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          <span>Phone Call</span>
        </span>
      );
    }
    const ch = channel.trim();
    const norm = ch.toLowerCase();

    // Phone Call / Call: blue badge WITH <PhoneCall> icon
    if (norm === 'phone call' || norm === 'call' || norm.includes('phone') || (norm.includes('call') && !norm.includes('callback') && !norm.includes('call back'))) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <PhoneCall className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          <span>{ch === 'Call' ? 'Phone Call' : ch}</span>
        </span>
      );
    }

    // Message (WhatsApp/SMS): emerald badge WITH <MessageSquare> icon
    if (norm.includes('message') || norm.includes('whatsapp') || norm.includes('sms')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Message (WhatsApp/SMS)</span>
        </span>
      );
    }

    // Email: purple badge WITH <Mail> icon
    if (norm.includes('email')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          <Mail className="w-3 h-3 text-purple-600 dark:text-purple-400" />
          <span>Email</span>
        </span>
      );
    }

    // Meeting (Virtual/In-Person): amber badge
    if (norm.includes('meeting')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <Users className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Meeting (Virtual/In-Person)</span>
        </span>
      );
    }

    // Site Visit: cyan/teal badge
    if (norm.includes('visit') || norm.includes('site')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
          <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400" />
          <span>Site Visit</span>
        </span>
      );
    }

    // Internal Task / Admin: slate/gray badge
    if (norm.includes('task') || norm.includes('admin')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <Briefcase className="w-3 h-3 text-slate-600 dark:text-slate-400" />
          <span>Internal Task / Admin</span>
        </span>
      );
    }

    // Fallback
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
        <PhoneCall className="w-3 h-3 text-blue-600 dark:text-blue-400" />
        <span>{ch}</span>
      </span>
    );
  };

  // Workspace-scoped lookup maps
  const workspaceCompanies = useMemo(() => {
    return (companies || []).filter(
      (c) => c.workspace_id === activeWorkspace.id || (!c.workspace_id && activeWorkspace.id === 'ws_default')
    );
  }, [companies, activeWorkspace.id]);

  const workspaceContacts = useMemo(() => {
    return (contacts || []).filter(
      (c) => c.workspace_id === activeWorkspace.id || (!c.workspace_id && activeWorkspace.id === 'ws_default')
    );
  }, [contacts, activeWorkspace.id]);

  const workspaceEnquiries = useMemo(() => {
    return (enquiries || []).filter(
      (e) => e.workspace_id === activeWorkspace.id || (!e.workspace_id && activeWorkspace.id === 'ws_default')
    );
  }, [enquiries, activeWorkspace.id]);

  const workspaceCallLogs = useMemo(() => {
    return (callLogs || [])
      .filter(
        (l) => !l.is_deleted && (l.workspace_id === activeWorkspace.id || (!l.workspace_id && activeWorkspace.id === 'ws_default'))
      )
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.date || 0).getTime();
        return timeB - timeA;
      });
  }, [callLogs, activeWorkspace.id]);

  // Company and Contact Maps for DNC check
  const companyMap = useMemo(() => {
    const map = new Map<string, Company>();
    workspaceCompanies.forEach((c) => {
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [workspaceCompanies]);

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    workspaceContacts.forEach((c) => {
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [workspaceContacts]);

  // DNC suppression helper
  const isEntrySuppressedByDNC = (entry: CallLogEntry): boolean => {
    const comp = entry.company_id ? companyMap.get(entry.company_id) : null;
    const cont = entry.contact_id ? contactMap.get(entry.contact_id) : null;
    return Boolean(comp?.is_dnc || cont?.is_dnc);
  };

  // Helper to resolve company name from master record if available
  const getResolvedCompanyName = (entry: Partial<CallLogEntry>): string => {
    if (entry.company_id) {
      const comp = companyMap.get(entry.company_id);
      if (comp) return comp.display_name || comp.canonical_name || entry.company_name || 'Direct Client';
    }
    return entry.company_name || entry.unlinked_name || 'Direct Client';
  };

  // Helper to render live Company Temperature / DNC pill for call log items
  const renderCompanyTempPill = (entry: Partial<CallLogEntry>) => {
    const liveCompany = entry.company_id
      ? companyMap.get(entry.company_id) || (companies || []).find((c) => c.id === entry.company_id)
      : null;
    const liveContact = entry.contact_id
      ? contactMap.get(entry.contact_id) || (contacts || []).find((c) => c.id === entry.contact_id)
      : null;

    const isDnc = liveCompany
      ? Boolean(liveCompany.is_dnc || liveCompany.temperature === 'DNC')
      : Boolean((entry as any).is_dnc || (entry as any).company_is_dnc || (entry as any).dnc);

    const isContactDnc = liveContact ? Boolean(liveContact.is_dnc) : false;

    const temperature = liveCompany
      ? (liveCompany.temperature || 'Cold')
      : ((entry as any).company_temperature || (entry as any).temperature || 'Cold');

    const targetCompId = liveCompany?.id || entry.company_id;

    return (
      <TemperatureBadge
        companyId={targetCompId}
        temperature={temperature}
        isDnc={isDnc || isContactDnc}
        variant="compact"
        companies={companies}
        setCompanies={setCompanies}
      />
    );
  };

  // Date helper
  const todayStr = new Date().toISOString().split('T')[0];

  // All Scheduled Queue Items (Scheduled status, NOT DNC suppressed)
  const allScheduledQueueItems = useMemo(() => {
    return workspaceCallLogs
      .filter((entry) => {
        if (!['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(entry.status)) return false;
        if (isEntrySuppressedByDNC(entry)) return false; // Hard DNC Suppression
        return true;
      })
      .sort((a, b) => {
        // Overdue first (isTaskOverdue)
        const dateA = a.next_followup_date || a.date;
        const dateB = b.next_followup_date || b.date;
        const isAOverdue = isTaskOverdue(dateA);
        const isBOverdue = isTaskOverdue(dateB);
        if (isAOverdue && !isBOverdue) return -1;
        if (!isAOverdue && isBOverdue) return 1;

        const timeA = parseTaskScheduledDate(dateA)?.getTime() || 0;
        const timeB = parseTaskScheduledDate(dateB)?.getTime() || 0;
        return timeA - timeB;
      });
  }, [workspaceCallLogs, companyMap, contactMap]);

  // Filtered Queue Items by timeframe toggle & date sort
  const queueItems = useMemo(() => {
    let base = allScheduledQueueItems;
    if (queueTimeframe === 'today') {
      base = allScheduledQueueItems.filter((i) => isTaskDueTodayOrOverdue(i.next_followup_date || i.date));
    } else if (queueTimeframe === 'upcoming') {
      base = allScheduledQueueItems.filter((i) => isTaskUpcoming(i.next_followup_date || i.date));
    }
    return [...base].sort((a, b) => {
      const timeA = parseTaskScheduledDate(a.next_followup_date || a.date)?.getTime() || 0;
      const timeB = parseTaskScheduledDate(b.next_followup_date || b.date)?.getTime() || 0;
      if (queueSortOrder === 'oldest') {
        return timeA - timeB;
      } else {
        return timeB - timeA;
      }
    });
  }, [allScheduledQueueItems, queueTimeframe, queueSortOrder]);

  // Stats Counters
  const stats = useMemo(() => {
    const scheduledToday = allScheduledQueueItems.filter((i) => isTaskDueToday(i.date)).length;
    const overdueCount = allScheduledQueueItems.filter((i) => isTaskOverdue(i.date)).length;

    const isNonScheduledOrCompleted = (status?: string) => {
      if (!status) return true;
      const s = status.toLowerCase().trim();
      return !(s === 'scheduled' || s === 'scheduled / planned' || s.includes('scheduled') || s === 'cancelled');
    };

    const getLogExecutionDate = (l: CallLogEntry): string | undefined => {
      return (l as any).completed_at || (l as any).completedAt || (l as any).executed_at || l.date || l.updatedAt || l.createdAt;
    };

    const completedToday = workspaceCallLogs.filter((l) => {
      if (!isNonScheduledOrCompleted(l.status)) return false;
      const execDate = getLogExecutionDate(l);
      return execDate ? isTaskDueToday(execDate) : false;
    }).length;

    // Start of week (7 days ago)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const completedThisWeek = workspaceCallLogs.filter((l) => {
      if (!isNonScheduledOrCompleted(l.status)) return false;
      const execDate = getLogExecutionDate(l);
      const t = execDate ? (parseTaskScheduledDate(execDate)?.getTime() || 0) : 0;
      return t >= sevenDaysAgo.getTime();
    }).length;

    return {
      scheduledToday,
      overdueCount,
      completedToday,
      completedThisWeek,
      totalQueue: queueItems.length
    };
  }, [allScheduledQueueItems, queueItems.length, workspaceCallLogs]);

  // Fast In-Queue Logging Form State
  const [fastOutcome, setFastOutcome] = useState<string>('Reached - Interested');
  const [fastNextFollowup, setFastNextFollowup] = useState<string>('');
  const [fastNotes, setFastNotes] = useState<string>('');
  const [fastSaving, setFastSaving] = useState(false);
  const [fastCompanyName, setFastCompanyName] = useState<string>('');
  const [fastContactName, setFastContactName] = useState<string>('');
  const [fastContactPhone, setFastContactPhone] = useState<string>('');

  const openFastQueueLogger = (entry: CallLogEntry) => {
    setExecutionModalTask(entry);
  };

  const handleEditActivityLog = (entry: CallLogEntry) => {
    setDrawerMode('edit');
    setEditingLog(entry);
    if (onOpenActivityDrawer) {
      onOpenActivityDrawer({
        existingLog: entry,
        logToEdit: entry,
        drawerMode: 'edit',
        companyId: entry.company_id,
        companyName: entry.company_name || entry.unlinked_name,
        contactId: entry.contact_id,
        contactName: entry.contact_name,
        contactPhone: entry.contact_phone,
        enquiryId: entry.enquiry_id,
        channel: entry.channel || 'Call'
      });
    } else {
      setIsActivityDrawerOpen(true);
    }
  };

  const handleSaveFastQueueLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry || !selectedEntry.id) return;

    // Inline Missing Lead Guard Enforcement
    const trimmedComp = fastCompanyName.trim();
    const trimmedContact = fastContactName.trim();
    const hasExistingLead = Boolean(selectedEntry?.company_name || selectedEntry?.unlinked_name || selectedEntry?.contact_name);

    if (!trimmedComp && !trimmedContact && !hasExistingLead) {
      triggerToast('Lead required: Please tag a Company Name or Contact Person before marking completed.', 'info');
      return;
    }

    setFastSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const finalCompanyName = trimmedComp || selectedEntry?.company_name || selectedEntry?.unlinked_name || 'Direct Client';
      const finalContactName = trimmedContact || selectedEntry?.contact_name || '';
      const finalContactPhone = fastContactPhone.trim() || selectedEntry?.contact_phone || selectedEntry?.unlinked_contact_info || '';

      const updatedNotes = fastNotes ? `${selectedEntry?.requirement_notes || ''}\n[Completed Note]: ${fastNotes}`.trim() : (selectedEntry?.requirement_notes || '');
      
      const updatedPayload = {
        date: nowIso,
        status: 'Completed' as const,
        outcome: fastOutcome,
        requirement_notes: updatedNotes,
        company_name: finalCompanyName,
        contact_name: finalContactName,
        contact_phone: finalContactPhone,
        completed_at: nowIso,
        completedAt: nowIso,
        executed_at: nowIso,
        updatedAt: nowIso
      };

      if (setCallLogs) {
        setCallLogs((prev) =>
          prev.map((l) =>
            l.id === selectedEntry.id
              ? {
                  ...l,
                  ...updatedPayload
                }
              : l
          )
        );
      }

      // 1. Update selected entry to Completed
      await safeUpdateDoc('call_logs', selectedEntry.id, updatedPayload);
      await safeUpdateDoc('activity_logs', selectedEntry.id, updatedPayload);

      // 2. If next follow up date is set, automatically create a new Scheduled Call Log entry
      if (fastNextFollowup) {
        const nextCallObj = {
          workspace_id: activeWorkspace.id,
          date: fastNextFollowup,
          status: 'Scheduled / Planned' as const,
          company_id: selectedEntry.company_id || '',
          company_name: finalCompanyName,
          contact_id: selectedEntry.contact_id || '',
          contact_name: finalContactName,
          contact_phone: finalContactPhone,
          enquiry_id: selectedEntry.enquiry_id || '',
          enquiry_quote_ref: selectedEntry.enquiry_quote_ref || '',
          logged_by: user.username,
          geography: selectedEntry.geography || activeWorkspace.geography_options?.[0] || 'Dubai, UAE',
          requirement_notes: `Follow-up from call on ${selectedEntry.date}. Note: ${fastNotes || 'Routine check-in'}`,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        const resDoc = await safeAddDoc('call_logs', nextCallObj);
        await safeAddDoc('activity_logs', nextCallObj);

        if (setCallLogs) {
          const newScheduledEntry: CallLogEntry = {
            id: resDoc?.id || ('local_' + Date.now()),
            ...nextCallObj
          };
          setCallLogs((prev) => [newScheduledEntry, ...prev]);
        }

        // Also update linked enquiry next_followup_date if linked
        if (selectedEntry.enquiry_id) {
          await safeUpdateDoc('enquiries', selectedEntry.enquiry_id, {
            next_followup_date: fastNextFollowup || undefined
          });
          if (setEnquiries) {
            setEnquiries((prev) =>
              prev.map((e) =>
                e.id === selectedEntry.enquiry_id
                  ? { ...e, next_followup_date: fastNextFollowup || undefined }
                  : e
              )
            );
          }
        }
      }

      triggerToast('Call logged successfully!', 'success');
      setShowFastQueueDrawer(false);
      setSelectedEntry(null);
    } catch (err) {
      console.error('Fast queue logging error:', err);
      triggerToast('Failed to log call outcome', 'error');
    } finally {
      setFastSaving(false);
    }
  };

  // Full Call Log Form Modal State (Create / Edit)
  const [logFormInteractionType, setLogFormInteractionType] = useState<'call' | 'email' | 'message'>('call');

  // Contextual Statuses and Outcomes tailored to Interaction Type (Call vs Email vs Message)
  const contextualStatuses = useMemo(() => {
    if (logFormInteractionType === 'email') {
      return ['Sent', 'Received', 'Replied', 'Pending Reply', 'Bounced', 'Scheduled Email'];
    }
    if (logFormInteractionType === 'message') {
      return ['Sent', 'Delivered', 'Read / Seen', 'Replied', 'Pending / Draft'];
    }
    return activeStatuses;
  }, [logFormInteractionType, activeStatuses]);

  const contextualOutcomes = useMemo(() => {
    if (logFormInteractionType === 'email') {
      return [
        'Interested – Follow-up Requested',
        'Information Sent / Received',
        'Quote / Proposal Sent',
        'Awaiting Response',
        'Not Interested',
        'Bounced / Bad Address'
      ];
    }
    if (logFormInteractionType === 'message') {
      return [
        'Interested – Follow-up Requested',
        'Information Sent / Received',
        'Forwarded',
        'Not Interested',
        'Closed – Deal Made'
      ];
    }
    return activeOutcomes;
  }, [logFormInteractionType, activeOutcomes]);
  const [logFormHandledBy, setLogFormHandledBy] = useState<string>('');
  const [logFormHandledByName, setLogFormHandledByName] = useState<string>('');
  const [logFormEmailSubject, setLogFormEmailSubject] = useState<string>('');
  const [logFormEmailAddress, setLogFormEmailAddress] = useState<string>('');
  const [logFormMessagePlatform, setLogFormMessagePlatform] = useState<string>('WhatsApp');
  const [logFormDate, setLogFormDate] = useState(todayStr);
  const [logFormStatus, setLogFormStatus] = useState<string>('Scheduled / Planned');
  const [logFormOutcome, setLogFormOutcome] = useState('');
  const [logFormPhone, setLogFormPhone] = useState('');
  const [logFormCompanyId, setLogFormCompanyId] = useState('');
  const [logFormCompanyName, setLogFormCompanyName] = useState('');
  const [logFormContactId, setLogFormContactId] = useState('');
  const [logFormContactName, setLogFormContactName] = useState('');
  const [logFormEnquiryId, setLogFormEnquiryId] = useState('');
  const [logFormGeography, setLogFormGeography] = useState(activeWorkspace.geography_options?.[0] || 'Dubai, UAE');
  const [logFormPurpose, setLogFormPurpose] = useState('Prospecting / Cold Outreach');
  const [logFormNotes, setLogFormNotes] = useState('');
  const [logFormFollowupDate, setLogFormFollowupDate] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Phone Resolution Engine State
  const [resolutionState, setResolutionState] = useState<{
    matchedType: 'exact_contact' | 'exact_company' | 'company_only' | 'conflict' | 'none';
    message: string;
    matchedCompany?: Company;
    matchedContact?: Contact;
    conflictCompanies?: Company[];
  }>({ matchedType: 'none', message: '' });

  // Quick Inline Creation State (1-Click Company/Contact creation right from resolution)
  const [showInlineCompanyCreate, setShowInlineCompanyCreate] = useState(false);
  const [inlineCompName, setInlineCompName] = useState('');
  const [inlineCompSuffix, setInlineCompSuffix] = useState<LegalSuffix>('None / To Be Added Later');
  const [inlineContactName, setInlineContactName] = useState('');
  const [inlineCompContactDesignation, setInlineCompContactDesignation] = useState('');
  const [inlineCity, setInlineCity] = useState('Dubai');
  const [inlineCountry, setInlineCountry] = useState('UAE');
  const [inlineTemperature, setInlineTemperature] = useState<'Hot' | 'Warm' | 'Cold'>('Cold');
  const [inlinePhoneLabel, setInlinePhoneLabel] = useState<'Mobile' | 'Telephone' | 'WhatsApp' | 'Direct'>('Telephone');
  const [inlineGeography, setInlineGeography] = useState<string>(activeWorkspace.geography_options?.[0] || 'Dubai, UAE');

  const resetInlineCompanyForm = () => {
    setInlineCompName('');
    setInlineContactName('');
    setInlineCompContactDesignation('');
    setInlineCity('Dubai');
    setInlineCountry('UAE');
    setInlineTemperature('Cold');
    setInlinePhoneLabel('Telephone');
    setInlineCompSuffix('None / To Be Added Later');
  };

  // Channel Mode Switcher handler (resets status and outcome to channel defaults)
  const handleChannelSwitch = (type: 'call' | 'email' | 'message') => {
    setLogFormInteractionType(type);
    if (type === 'email') {
      setLogFormStatus('Sent');
      setLogFormOutcome('Information Sent / Received');
    } else if (type === 'message') {
      setLogFormStatus('Sent');
      setLogFormOutcome('Information Sent / Received');
      setLogFormMessagePlatform('WhatsApp');
    } else {
      setLogFormStatus('Scheduled');
      setLogFormOutcome('Follow-Up Required');
    }
  };

  // Handle Phone Number Change & Live Resolution Lookup
  const handlePhoneInputChange = (phoneInput: string) => {
    setLogFormPhone(phoneInput);
    const cleaned = phoneInput.replace(/[^\d+]/g, '');

    if (cleaned.length < 4) {
      setResolutionState({ matchedType: 'none', message: '' });
      return;
    }

    // Search contacts by any phone in their saved numbers
    const matchingContacts = workspaceContacts.filter((ct) => {
      const phones = getContactPhones(ct);
      return phones.some((p) => {
        const pNum = p.number || p.value || '';
        return isSamePhoneNumber(pNum, phoneInput) || (cleaned.length >= 6 && pNum.replace(/\D/g, '').includes(cleaned.replace(/\D/g, '')));
      });
    });

    // Search companies by any phone in their general phone or phone list
    const matchingCompanies = workspaceCompanies.filter((comp) => {
      const phones = getCompanyPhones(comp);
      return phones.some((p) => {
        const pNum = p.number || p.value || '';
        return isSamePhoneNumber(pNum, phoneInput) || (cleaned.length >= 6 && pNum.replace(/\D/g, '').includes(cleaned.replace(/\D/g, '')));
      });
    });

    if (matchingContacts.length === 1) {
      const matchedContact = matchingContacts[0];
      const parentComp = companyMap.get(matchedContact.company_id);
      setLogFormContactId(matchedContact.id || '');
      setLogFormContactName(matchedContact.full_name);
      if (parentComp) {
        setLogFormCompanyId(parentComp.id || '');
        setLogFormCompanyName(parentComp.display_name || parentComp.canonical_name);
      }
      setResolutionState({
        matchedType: 'exact_contact',
        message: `Exact Match: Contact "${matchedContact.full_name}" (${parentComp?.display_name || 'Company'})`,
        matchedContact,
        matchedCompany: parentComp
      });
    } else if (matchingContacts.length > 1) {
      setResolutionState({
        matchedType: 'conflict',
        message: `Multiple contacts (${matchingContacts.length}) found for this phone number across workspace!`,
        conflictCompanies: matchingContacts.map((c) => companyMap.get(c.company_id)).filter(Boolean) as Company[]
      });
    } else if (matchingCompanies.length === 1) {
      const comp = matchingCompanies[0];
      setLogFormCompanyId(comp.id || '');
      setLogFormCompanyName(comp.display_name || comp.canonical_name);
      setResolutionState({
        matchedType: 'company_only',
        message: `Company "${comp.display_name}" matches this number, but no contact person is listed. Save as a new contact under this company?`,
        matchedCompany: comp
      });
    } else if (matchingCompanies.length > 1) {
      setResolutionState({
        matchedType: 'conflict',
        message: `Conflict: ${matchingCompanies.length} companies matched this number. Please select one below.`,
        conflictCompanies: matchingCompanies
      });
    } else {
      setResolutionState({
        matchedType: 'none',
        message: 'No existing company or contact matches this phone number in active workspace.'
      });
    }
  };

  const handle1ClickCreateCompany = async () => {
    if (!inlineCompName.trim()) {
      triggerToast('Company name is required', 'error');
      return;
    }
    try {
      // Check for fuzzy-matched duplicates first!
      const duplicateResult = findDuplicateCompany(inlineCompName.trim(), companies);
      if (duplicateResult) {
        const confirmUseExisting = await askConfirm(
          'Fuzzy Duplicate Match',
          `Fuzzy duplicate check matched an existing company:\n\n` +
          `• "${duplicateResult.match.display_name}" (${duplicateResult.reason})\n\n` +
          `Would you like to LINK this call to the existing company instead of creating a duplicate?`,
          false,
          'Link Existing Company',
          'Create Duplicate anyway'
        );
        if (confirmUseExisting) {
          // Instead of creating, select the existing company!
          const existingComp = duplicateResult.match;
          setLogFormCompanyId(existingComp.id || '');
          setLogFormCompanyName(existingComp.display_name || existingComp.canonical_name);
          
          const compGeo = existingComp.city ? `${existingComp.city}, ${existingComp.country || ''}` : existingComp.country || '';
          if (compGeo) {
            setLogFormGeography(compGeo);
          }
          
          // Also check if they want to create a contact under this existing company if one was specified
          let existingContactId = '';
          if (inlineContactName.trim()) {
            const hasExistingContact = workspaceContacts.some(
              (c) => c.company_id === existingComp.id && c.full_name.toLowerCase() === inlineContactName.trim().toLowerCase()
            );
            if (!hasExistingContact) {
              const rawContact: Omit<Contact, 'id'> = {
                workspace_id: activeWorkspace.id,
                company_id: existingComp.id!,
                full_name: inlineContactName.trim(),
                mobile: logFormPhone,
                is_primary: true,
                createdAt: new Date().toISOString()
              };
              const newCont = await safeAddDoc('contacts', rawContact);
              existingContactId = newCont?.id || ('cont_' + Date.now());
              const newContObj: Contact = { id: existingContactId, ...rawContact };
              if (setContacts) {
                setContacts((prev) => [newContObj, ...prev.filter((c) => c.id !== existingContactId)]);
              }
              setLogFormContactId(existingContactId);
              setLogFormContactName(inlineContactName.trim());
            } else {
              const foundC = workspaceContacts.find(
                (c) => c.company_id === existingComp.id && c.full_name.toLowerCase() === inlineContactName.trim().toLowerCase()
              );
              if (foundC) {
                existingContactId = foundC.id || '';
                setLogFormContactId(existingContactId);
                setLogFormContactName(foundC.full_name);
              }
            }
          }
          
          setResolutionState({
            matchedType: 'exact_contact',
            message: `Linked: "${existingComp.display_name}" ${inlineContactName ? `(${inlineContactName.trim()})` : ''}`
          });
          
          triggerToast(`Successfully linked to existing company "${existingComp.display_name}"!`, 'success');
          // Clear form fields
          resetInlineCompanyForm();
          setShowInlineCompanyCreate(false);
          return;
        }
      }

      const rawSuffix = inlineCompSuffix || 'None / To Be Added Later';
      const compDisplayName = (rawSuffix === 'None / To Be Added Later' || rawSuffix === 'None / Other')
        ? inlineCompName.trim()
        : `${inlineCompName.trim()} ${rawSuffix}`;

      const selectedCity = inlineCity.trim() || 'Dubai';
      const selectedCountry = inlineCountry.trim() || 'UAE';

      const rawCompany: Omit<Company, 'id'> = {
        workspace_id: activeWorkspace.id,
        canonical_name: inlineCompName.trim(),
        display_name: compDisplayName,
        legal_suffix: rawSuffix,
        aliases: [],
        country: selectedCountry,
        city: selectedCity,
        general_phone: logFormPhone,
        phones: logFormPhone ? [{ number: logFormPhone, label: inlinePhoneLabel }] : [],
        relationship: 'Prospect',
        temperature: inlineTemperature,
        createdAt: new Date().toISOString()
      };

      // Create Company in Firestore
      const newComp = await safeAddDoc('companies', rawCompany);
      const newCompId = newComp?.id || ('comp_' + Date.now());
      const newCompObj: Company = { id: newCompId, ...rawCompany };

      // Instantly update parent state so Companies tab and dropdowns show it immediately
      if (setCompanies) {
        setCompanies((prev) => [newCompObj, ...prev.filter((c) => c.id !== newCompId)]);
      }

      let newContactId = '';
      if (inlineContactName.trim()) {
        const rawContact: Omit<Contact, 'id'> = {
          workspace_id: activeWorkspace.id,
          company_id: newCompId,
          full_name: inlineContactName.trim(),
          designation: inlineCompContactDesignation.trim() || undefined,
          mobile: logFormPhone,
          phones: logFormPhone ? [{ number: logFormPhone, label: inlinePhoneLabel === 'Telephone' ? 'Mobile' : inlinePhoneLabel }] : [],
          is_primary: true,
          createdAt: new Date().toISOString()
        };
        const newCont = await safeAddDoc('contacts', rawContact);
        newContactId = newCont?.id || ('cont_' + Date.now());
        const newContObj: Contact = { id: newContactId, ...rawContact };

        if (setContacts) {
          setContacts((prev) => [newContObj, ...prev.filter((c) => c.id !== newContactId)]);
        }
      }

      setLogFormCompanyId(newCompId);
      setLogFormCompanyName(compDisplayName);
      const computedGeo = `${selectedCity}, ${selectedCountry}`;
      setLogFormGeography(computedGeo);
      if (newContactId) {
        setLogFormContactId(newContactId);
        setLogFormContactName(inlineContactName.trim());
      }

      setResolutionState({
        matchedType: 'exact_contact',
        message: `Created & Linked: "${compDisplayName}" ${inlineContactName ? `(${inlineContactName.trim()})` : ''}`
      });

      triggerToast(`Company '${compDisplayName}' created & registered!`, 'success');
      setShowInlineCompanyCreate(false);
      resetInlineCompanyForm();
    } catch (err) {
      console.error('1-Click create error:', err);
      triggerToast('Failed to create company/contact', 'error');
    }
  };



  const handleSaveFullLogModal = async (e: React.FormEvent) => {
    e.preventDefault();

    // DNC warning confirmation
    const isCompDNC = logFormCompanyId ? companyMap.get(logFormCompanyId)?.is_dnc : false;
    const isContDNC = logFormContactId ? contactMap.get(logFormContactId)?.is_dnc : false;

    if (isCompDNC || isContDNC) {
      const confirmDNC = await askConfirm(
        'DNC (Do Not Call) Alert',
        'WARNING: This record is marked as DO NOT CALL (DNC). Are you sure you want to log a call entry for it?',
        true,
        'Log Call anyway',
        'Cancel'
      );
      if (!confirmDNC) return;
    }

    setFormSaving(true);
    try {
      const selectedEnquiry = workspaceEnquiries.find((enq) => enq.id === logFormEnquiryId);

      const logData: Partial<CallLogEntry> = {
        workspace_id: activeWorkspace.id,
        date: logFormDate,
        status: logFormStatus,
        outcome: (logFormInteractionType === 'email' || logFormInteractionType === 'message') ? 'Message Sent / Awaiting Reply' : (logFormOutcome || undefined),
        requirement_notes: logFormNotes.trim(),
        next_followup_date: logFormFollowupDate || undefined,
        company_id: logFormCompanyId,
        company_name: logFormCompanyName,
        contact_id: logFormContactId || undefined,
        contact_name: logFormContactName || undefined,
        contact_phone: logFormPhone || undefined,
        enquiry_id: logFormEnquiryId || undefined,
        enquiry_quote_ref: selectedEnquiry?.quote_ref_no || undefined,
        logged_by: user.username,
        handled_by_salesperson_id: logFormHandledBy || undefined,
        handled_by_team_member_name: logFormHandledByName || user.full_name || user.username,
        interaction_type: logFormInteractionType,
        email_subject: logFormInteractionType === 'email' ? logFormEmailSubject.trim() : undefined,
        email_address: logFormInteractionType === 'email' ? logFormEmailAddress.trim() : undefined,
        message_platform: logFormInteractionType === 'message' ? logFormMessagePlatform : undefined,
        geography: logFormGeography,
        purpose: logFormPurpose,
        updatedAt: new Date().toISOString()
      };

      if (selectedEntry && selectedEntry.id) {
        await safeUpdateDoc('call_logs', selectedEntry.id, logData);
        if (setCallLogs) {
          setCallLogs((prev) =>
            prev.map((l) => (l.id === selectedEntry.id ? { ...l, ...logData } as CallLogEntry : l))
          );
        }
        triggerToast('Call log updated', 'success');
      } else {
        const createdIso = new Date().toISOString();
        const resDoc = await safeAddDoc('call_logs', {
          ...logData,
          createdAt: createdIso
        });

        const newEntry: CallLogEntry = {
          id: resDoc?.id || ('log_' + Date.now()),
          ...logData,
          createdAt: createdIso
        } as CallLogEntry;

        if (setCallLogs) {
          setCallLogs((prev) => [newEntry, ...prev.filter((l) => l.id !== newEntry.id)]);
        }
        triggerToast('Call log entry created!', 'success');
      }

      // Sync next_followup_date to linked enquiry
      if (logFormEnquiryId && logFormFollowupDate) {
        await safeUpdateDoc('enquiries', logFormEnquiryId, {
          next_followup_date: logFormFollowupDate
        });
        if (setEnquiries) {
          setEnquiries((prev) =>
            prev.map((e) =>
              e.id === logFormEnquiryId
                ? { ...e, next_followup_date: logFormFollowupDate }
                : e
            )
          );
        }
      }

      setShowLogModal(false);
    } catch (err) {
      console.error('Error saving call log:', err);
      triggerToast('Failed to save call log entry', 'error');
    } finally {
      setFormSaving(false);
    }
  };

  // Filtered History List
  const filteredHistoryLogs = useMemo(() => {
    const list = workspaceCallLogs.filter((l) => {
      // Exclude Scheduled / Planned calls from Full Call History tab
      const normLogStatus = (l.status || '').toLowerCase().trim();
      if (normLogStatus === 'scheduled' || normLogStatus === 'scheduled / planned' || normLogStatus.includes('scheduled')) {
        return false;
      }

      if (statusFilter !== 'all') {
        const normFilter = statusFilter.toLowerCase().trim();
        if (normLogStatus !== normFilter) return false;
      }
      if (outcomeFilter !== 'all' && l.outcome !== outcomeFilter) return false;
      if (geographyFilter !== 'all' && l.geography !== geographyFilter) return false;

      const comp = l.company_id ? companies.find((c) => c.id === l.company_id) : null;

      if (industryFilter !== 'all') {
        if (!comp || comp.industry_parent !== industryFilter) {
          return false;
        }
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const callRefId = getReferenceId('CL', l, callLogs).toLowerCase();
        const compRefId = l.company_id ? getReferenceId('CMP', { id: l.company_id }, companies).toLowerCase() : '';
        const contRefId = l.contact_id ? getReferenceId('CT', { id: l.contact_id }, contacts).toLowerCase() : '';
        const enqRefId = l.enquiry_id ? getReferenceId('EQ', { id: l.enquiry_id }, enquiries).toLowerCase() : '';
        const indRaw = (comp?.business_type_raw || comp?.industry_type || comp?.industry || '').toLowerCase();
        const indParent = (comp?.industry_parent || '').toLowerCase();

        return (
          callRefId.includes(q) ||
          compRefId.includes(q) ||
          contRefId.includes(q) ||
          enqRefId.includes(q) ||
          (l.id || '').toLowerCase().includes(q) ||
          getResolvedCompanyName(l).toLowerCase().includes(q) ||
          indRaw.includes(q) ||
          indParent.includes(q) ||
          (l.contact_name || '').toLowerCase().includes(q) ||
          (l.contact_phone || '').includes(q) ||
          (l.requirement_notes || '').toLowerCase().includes(q) ||
          (l.enquiry_quote_ref || '').toLowerCase().includes(q) ||
          (l.logged_by || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const dateA = a.created_at || a.date || '';
      const dateB = b.created_at || b.date || '';
      if (historySortOrder === 'newest') {
        return dateB.localeCompare(dateA);
      } else {
        return dateA.localeCompare(dateB);
      }
    });
  }, [workspaceCallLogs, statusFilter, outcomeFilter, geographyFilter, industryFilter, searchTerm, historySortOrder, companies, callLogs, contacts, enquiries]);

  // Pagination Logic
  const totalItems = filteredHistoryLogs.length;
  const paginatedLogs = useMemo(() => {
    if (itemsPerPage === 'All') return filteredHistoryLogs;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredHistoryLogs.slice(start, start + itemsPerPage);
  }, [filteredHistoryLogs, currentPage, itemsPerPage]);

  return (
    <>
      <PageHeader
        title="Call Operations & Queue Engine"
        subtitle="Operator queue, phone-number resolution flow, DNC suppression, and history tracking."
        icon={PhoneCall}
        badge={{ text: activeWorkspace.name, variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={{
          label: '+ Log / Schedule New Call',
          icon: Plus,
          onClick: () => {
            setDrawerMode('create');
            setEditingLog(null);
            if (onOpenActivityDrawer) {
              onOpenActivityDrawer({ channel: 'Call', drawerMode: 'create' });
            } else {
              setIsActivityDrawerOpen(true);
            }
          }
        }}
        secondaryActions={[
          {
            label: 'Export Call Report',
            icon: Printer,
            onClick: () => setShowReportExportModal(true)
          },
          {
            label: 'Readiness Audit',
            icon: BarChart2,
            onClick: () => setShowDiagnosticModal(true)
          }
        ]}
      />

      <PageBody maxWidth="max-w-[96%]">

      {/* Metrics Counter Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Scheduled Queue (Today)
            </span>
            <span className="text-2xl font-black text-blue-600 mt-1 block">{stats.scheduledToday}</span>
            <span className="text-xs text-slate-500 block mt-0.5">Due for immediate follow-up</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Overdue Calls</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">{stats.overdueCount}</span>
            <span className="text-xs text-rose-500 block mt-0.5">Requires priority attention</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Calls Today</span>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats.completedToday}</span>
            <span className="text-xs text-emerald-600 block mt-0.5">Logged & completed today</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Completed This Week</span>
            <span className="text-2xl font-black text-purple-600 mt-1 block">{stats.completedThisWeek}</span>
            <span className="text-xs text-slate-500 block mt-0.5">Total operator call activity</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setSubTab('queue')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            subTab === 'queue'
              ? 'bg-slate-900 text-white shadow'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>Activity Queue ({queueItems.length})</span>
        </button>

        <button
          onClick={() => setSubTab('log')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            subTab === 'log'
              ? 'bg-slate-900 text-white shadow'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <ListFilter className="w-4 h-4" />
          <span>Activity History ({filteredHistoryLogs.length})</span>
        </button>
      </div>

      {/* VIEW 1: ACTIVITY QUEUE */}
      {subTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 flex-wrap">
                <span>Activity Queue</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-bold font-mono">
                  {queueItems.length} {queueTimeframe === 'today' ? 'Due Today / Overdue' : queueTimeframe === 'upcoming' ? 'Upcoming' : 'Total Scheduled'}
                </span>
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {queueTimeframe === 'today' && "Showing tasks due today or overdue. Overdue tasks listed first."}
                {queueTimeframe === 'upcoming' && "Showing future scheduled follow-ups across your pipeline."}
                {queueTimeframe === 'all' && "Showing all scheduled follow-ups across all dates."}
              </div>
            </div>

            {/* Timeframe Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setQueueTimeframe('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  queueTimeframe === 'today'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>Today ({allScheduledQueueItems.filter(i => isTaskDueTodayOrOverdue(i.next_followup_date || i.date)).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueTimeframe('upcoming')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  queueTimeframe === 'upcoming'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                <span>Upcoming ({allScheduledQueueItems.filter(i => isTaskUpcoming(i.next_followup_date || i.date)).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setQueueTimeframe('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  queueTimeframe === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5 text-indigo-500" />
                <span>All ({allScheduledQueueItems.length})</span>
              </button>
            </div>

            {/* Sort Toggle for Queue */}
            <button
              type="button"
              onClick={() => setQueueSortOrder((prev) => (prev === 'oldest' ? 'newest' : 'oldest'))}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Toggle Queue Date Sorting"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Sort: {queueSortOrder === 'oldest' ? 'Oldest First' : 'Newest First'}</span>
            </button>
          </div>

          <div className="space-y-3">
            {queueItems.map((item) => {
              const isOverdue = isTaskOverdue(item.date);
              const isToday = isTaskDueToday(item.date);
              const type = (item.interaction_type || '').toLowerCase();

              return (
                <div
                  key={item.id}
                  className={`group p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isOverdue
                      ? 'bg-rose-50/40 border-rose-300 shadow-sm ring-1 ring-rose-200'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700">
                        {getReferenceId('CL', item, callLogs)}
                      </span>
                      {renderChannelBadge(item.channel || item.interaction_type)}
                      <span className="font-black text-slate-900 dark:text-slate-100 text-base">{getResolvedCompanyName(item)}</span>
                      {renderCompanyTempPill(item)}
                      {item.company_id && (
                        <IndustryBadge company={companies.find((c) => c.id === item.company_id)} size="sm" />
                      )}
                      {item.contact_name && (
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                          Attn: {item.contact_name}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {formatOverdueDisplayDate(item.date)}
                      </span>
                      {isOverdue && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white tracking-wider">
                          OVERDUE ({formatOverdueDisplayDate(item.date)})
                        </span>
                      )}
                      {isToday && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600 text-white tracking-wider">
                          DUE TODAY
                        </span>
                      )}
                    </div>

                    {/* Phone Tap-to-Call & Metadata */}
                      <div className="flex items-center space-x-3 pt-0.5 text-xs flex-wrap gap-y-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {formatActivityDate(item.date)} &bull; By <span className="font-bold text-slate-900 dark:text-slate-100">{getWorkspaceInitials(item.handled_by_team_member_name || item.logged_by || item.sales_person, salespersons, user, activeWorkspace)}</span>
                        </span>

                        {item.channel === 'Email' || item.interaction_type === 'email' ? (
                          item.email_address ? (
                            <a
                              href={`mailto:${item.email_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-purple-700 hover:underline bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200"
                            >
                              <Mail className="w-3.5 h-3.5 text-purple-600" />
                              <span>{item.email_address}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                               <Mail className="w-3 h-3 text-slate-400" />
                               <span>No email logged</span>
                            </span>
                          )
                        ) : item.channel === 'Message (WhatsApp/SMS)' || item.channel === 'WhatsApp' ? (
                          item.contact_phone ? (
                             <button
                              type="button"
                              onClick={(e) => {
                                handleInitiate({
                                  companyId: item.company_id,
                                  companyName: item.company_name,
                                  contactId: item.contact_id,
                                  contactName: item.contact_name,
                                  contactPhone: item.contact_phone,
                                  enquiryId: item.enquiry_id,
                                  channel: 'WhatsApp',
                                  externalUrl: `https://wa.me/${item.contact_phone.replace(/\D/g, '')}`,
                                  e
                                });
                              }}
                              className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-emerald-700 hover:underline bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 cursor-pointer"
                             >
                               <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                               <span>{item.contact_phone}</span>
                             </button>
                          ) : (
                             <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                               <MessageSquare className="w-3 h-3 text-slate-400" />
                               <span>No phone logged</span>
                             </span>
                          )
                        ) : item.contact_phone ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              handleInitiate({
                                companyId: item.company_id,
                                companyName: item.company_name,
                                contactId: item.contact_id,
                                contactName: item.contact_name,
                                contactPhone: item.contact_phone,
                                enquiryId: item.enquiry_id,
                                channel: 'Call',
                                externalUrl: `tel:${item.contact_phone}`,
                                e
                              });
                            }}
                            className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-blue-700 hover:underline bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 cursor-pointer"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                            <span>{item.contact_phone}</span>
                          </button>
                        ) : item.email_address ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              handleInitiate({
                                companyId: item.company_id,
                                companyName: item.company_name,
                                contactId: item.contact_id,
                                contactName: item.contact_name,
                                contactEmail: item.email_address,
                                enquiryId: item.enquiry_id,
                                channel: 'Email',
                                externalUrl: `mailto:${item.email_address}`,
                                e
                              });
                            }}
                            className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-purple-700 hover:underline bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 cursor-pointer"
                          >
                            <Mail className="w-3.5 h-3.5 text-purple-600" />
                            <span>{item.email_address}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-amber-600 italic font-medium">
                            No contact info
                          </span>
                        )}

                        {item.geography && (
                          <span className="text-[11px] text-slate-500 font-medium flex items-center space-x-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{item.geography}</span>
                          </span>
                        )}

                        {item.enquiry_quote_ref && (
                          <span className="text-[11px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            Quote: {item.enquiry_quote_ref}
                          </span>
                        )}
                      </div>

                      {item.requirement_notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate pt-1 font-sans">
                          {item.requirement_notes}
                        </p>
                      )}
                  </div>

                  {/* Fast Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200 opacity-40 group-hover:opacity-100 transition-opacity">
                    {canUserClickRecord(user, item, salespersons) ? (
                      <>
                        {item.contact_phone && (
                          <button
                            type="button"
                            onClick={(e) => {
                              handleInitiate({
                                companyId: item.company_id,
                                companyName: item.company_name,
                                contactId: item.contact_id,
                                contactName: item.contact_name,
                                contactPhone: item.contact_phone,
                                enquiryId: item.enquiry_id,
                                channel: item.channel === 'Message (WhatsApp/SMS)' || item.channel === 'WhatsApp' ? 'WhatsApp' : 'Call',
                                externalUrl: item.channel === 'Message (WhatsApp/SMS)' || item.channel === 'WhatsApp'
                                  ? `https://wa.me/${item.contact_phone.replace(/\D/g, '')}`
                                  : `tel:${item.contact_phone}`,
                                e
                              });
                            }}
                            className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition flex items-center justify-center cursor-pointer"
                            title="Execute Activity (Tap to Open Activity Drawer)"
                          >
                            <PhoneCall className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setSelectedDetailEntry(item);
                          }}
                          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition flex items-center justify-center bg-white cursor-pointer"
                          title="View Call Log"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canEditOrDeleteRecord(user, item) && (
                          <button
                            onClick={() => handleEditActivityLog(item)}
                            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition flex items-center justify-center bg-white cursor-pointer"
                            title="Edit Activity Log"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}

                        {canEditOrDeleteRecord(user, item) && (
                          <button
                            onClick={async () => {
                              if (item.id) {
                                const confirmDelete = await askConfirm(
                                  'Delete Scheduled Call',
                                  'Are you sure you want to delete this scheduled call? This action cannot be undone.',
                                  true,
                                  'Delete Call'
                                );
                                if (confirmDelete) {
                                  await safeUpdateDoc('call_logs', item.id, {
                                    is_deleted: true,
                                    deleted_at: new Date().toISOString(),
                                    deleted_by_uid: user?.uid || null,
                                    deleted_by_name: user?.full_name || user?.username || 'Unknown'
                                  });
                                  if (setCallLogs) {
                                    setCallLogs((prev) => prev.filter((x) => x.id !== item.id));
                                  }
                                  triggerToast('Scheduled call deleted', 'info');
                                }
                              }
                            }}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg border border-slate-200 transition flex items-center justify-center bg-white cursor-pointer"
                            title="Delete Scheduled Call"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => openFastQueueLogger(item)}
                          className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center space-x-2 cursor-pointer"
                        >
                          <Zap className="w-4 h-4 text-amber-400" />
                          <span>Execute Task</span>
                        </button>
                      </>
                    ) : (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold border border-slate-200">
                        🔒 Restricted View
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {queueItems.length === 0 && (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Queue is Clear!</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No scheduled calls are due today or overdue for this workspace. Use '+ Log / Schedule Call' to add new follow-ups.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: FULL CALL LOG HISTORY & SEARCH */}
      {subTab === 'log' && (
        <div className="space-y-4">
          {/* Faceted Search & Filters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                <Filter className="w-4 h-4" />
                <span>Faceted Search & Filters</span>
              </div>
              <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => { setViewMode('card'); localStorage.setItem('callLogViewMode', 'card'); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition ${
                    viewMode === 'card' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setViewMode('table'); localStorage.setItem('callLogViewMode', 'table'); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center space-x-1.5 transition ${
                    viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search logs..."
                  className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <select
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="all">All Industries</option>
                  {PARENT_INDUSTRIES.map((pi) => (
                    <option key={pi.id} value={pi.id}>
                      {pi.icon} {pi.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  {activeStatuses.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <select
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="all">All Outcomes</option>
                  {activeOutcomes.map((oc) => (
                    <option key={oc} value={oc}>{oc}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={geographyFilter}
                  onChange={(e) => setGeographyFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="all">All Locations</option>
                  {(activeWorkspace.geography_options || []).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={historySortOrder}
                  onChange={(e) => setHistorySortOrder(e.target.value as 'newest' | 'oldest')}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-medium cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Select All & Batch Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-500">
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      filteredHistoryLogs.length > 0 &&
                      filteredHistoryLogs.every((l) => l.id && selectedLogIds.includes(l.id))
                    }
                    onChange={(e) => {
                      const allIds = filteredHistoryLogs.map((l) => l.id!).filter(Boolean);
                      if (e.target.checked) {
                        setSelectedLogIds((prev) => Array.from(new Set([...prev, ...allIds])));
                      } else {
                        setSelectedLogIds((prev) => prev.filter((id) => !allIds.includes(id)));
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Select All ({filteredHistoryLogs.length})</span>
                </label>
                {selectedLogIds.length > 0 && (
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 rounded-full font-mono">
                    {selectedLogIds.length} Selected
                  </span>
                )}
              </div>
              {selectedLogIds.length > 0 ? (
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 mr-1">Batch Actions:</span>
                  
                  <button
                    type="button"
                    onClick={() => {
                      console.log('Batch Reassign clicked for logs:', selectedLogIds);
                      triggerToast(`Batch Reassign queued for ${selectedLogIds.length} logs`, 'info');
                    }}
                    className="px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Users2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Reassign ({selectedLogIds.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (getUserWorkspaceRole(user, activeWorkspace?.id, activeWorkspace) === 'Viewer') {
                        triggerToast('Read-only viewers cannot delete records.', 'error');
                        return;
                      }
                      const confirmDelete = await askConfirm(
                        'Batch Delete Logs',
                        `Are you sure you want to permanently delete ${selectedLogIds.length} log(s)? This action cannot be undone.`,
                        true,
                        'Delete Logs',
                        'Cancel'
                      );
                      if (!confirmDelete) return;

                      try {
                        for (const id of selectedLogIds) {
                          await safeUpdateDoc('call_logs', id, {
                            is_deleted: true,
                            deleted_at: new Date().toISOString(),
                            deleted_by_uid: user?.uid || null,
                            deleted_by_name: user?.full_name || user?.username || 'Unknown'
                          });
                        }
                        if (setCallLogs) {
                          setCallLogs((prev) => prev.filter((l) => !selectedLogIds.includes(l.id!)));
                        }
                        triggerToast(`Successfully deleted ${selectedLogIds.length} interaction log(s)`, 'success');
                        setSelectedLogIds([]);
                      } catch (err: any) {
                        console.error('Error in batch delete:', err);
                        triggerToast('Failed to delete selected logs: ' + (err?.message || err), 'error');
                      }
                    }}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete ({selectedLogIds.length})</span>
                  </button>
                </div>
              ) : (
                <span>Showing {filteredHistoryLogs.length} interaction logs</span>
              )}
            </div>
            
            {viewMode === 'card' ? (
              paginatedLogs.map((log) => {
                const isSuppressed = isEntrySuppressedByDNC(log);
                const handledBy = getWorkspaceInitials(
                  log.handled_by_team_member_name || log.logged_by || log.sales_person,
                  salespersons,
                  user,
                  activeWorkspace
                );
                const type = (log.channel || log.interaction_type || 'call').toLowerCase();
                const isSelected = !!(log.id && selectedLogIds.includes(log.id));

                const company = companies?.find(c => c.id === log.company_id);
                const temp = company?.temperature || 'Cold';
                let TempIcon = Snowflake;
                let tempColorClass = 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400';
                if (temp === 'Hot') {
                  TempIcon = Flame;
                  tempColorClass = 'text-orange-500 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400';
                } else if (temp === 'Warm') {
                  TempIcon = Sun;
                  tempColorClass = 'text-amber-500 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400';
                }

                let ChannelIcon = Phone;
                let channelColorClass = 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400';
                if (type === 'email') {
                  ChannelIcon = Mail;
                  channelColorClass = 'text-purple-500 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400';
                }
                else if (type === 'message' || type === 'whatsapp' || type === 'sms') {
                  ChannelIcon = MessageSquare;
                  channelColorClass = 'text-green-500 bg-green-50 dark:bg-green-900/30 dark:text-green-400';
                }
                else if (type === 'meeting' || type.includes('meet')) {
                  ChannelIcon = Users;
                  channelColorClass = 'text-orange-500 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400';
                }
                else if (type === 'site visit' || type.includes('site')) {
                  ChannelIcon = MapPin;
                  channelColorClass = 'text-teal-500 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400';
                }
                else if (type === 'internal task' || type === 'admin' || type.includes('task')) {
                  ChannelIcon = FileText;
                  channelColorClass = 'text-gray-500 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-400';
                }

                return (
                  <div
                    key={log.id}
                    className={`group p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50/50 border-blue-300 dark:bg-blue-950/20 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(chk) => {
                          if (!log.id) return;
                          if (chk.target.checked) {
                            setSelectedLogIds((prev) => [...prev, log.id!]);
                          } else {
                            setSelectedLogIds((prev) => prev.filter((id) => id !== log.id));
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span 
                            className={`text-sm font-semibold truncate hover:text-blue-600 transition cursor-pointer ${log.company_name ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500'}`}
                            onClick={() => {
                              if (log.company_id) {
                                setSelected360CompanyId(log.company_id);
                              }
                            }}
                          >
                            {getResolvedCompanyName(log) || 'Unlinked Account'}
                          </span>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {formatActivityDate(log.date || log.createdAt)}
                          </span>
                          {isSuppressed && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              <ShieldAlert className="w-2.5 h-2.5 mr-1" />
                              DNC
                            </span>
                          )}
                          {log.company_id && (
                            <IndustryBadge company={companies.find((c) => c.id === log.company_id)} size="sm" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center space-x-1.5 mt-1">
                          <span className={`truncate ${log.status === 'Invalid Number' ? 'line-through text-red-400' : ''}`}>
                            {log.contact_name || log.contact_phone || 'No Contact Info'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isSuccessStatus(log.status)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            {log.status}
                          </span>
                          {log.outcome && (
                            <span className="text-[10px] text-slate-500 font-medium">→ {log.outcome}</span>
                          )}
                        </div>
                      </div>
                    </div>
                      
                    <div className="flex items-center justify-end space-x-2 w-full md:w-auto">
                      {/* Visual Metadata Cluster */}
                      <div className="flex items-center space-x-1 mr-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold" title={`Handled by ${handledBy}`}>
                          {handledBy}
                        </div>
                        <TemperatureBadge
                          companyId={log.company_id}
                          temperature={temp}
                          isDnc={company?.is_dnc}
                          variant="icon"
                          size="md"
                          companies={companies}
                          setCompanies={setCompanies}
                        />
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${channelColorClass}`} title={`Channel: ${type}`}>
                          <ChannelIcon className="w-4 h-4" />
                        </div>
                      </div>

                      {canUserClickRecord(user, log, salespersons, activeWorkspace?.id) ? (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => {
                              setSelectedDetailEntry(log);
                            }}
                            title="View Details"
                            className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingLog(log);
                              setDrawerMode('edit');
                              if (onOpenActivityDrawer) {
                                onOpenActivityDrawer({ 
                                  channel: log.channel || 'Call', 
                                  drawerMode: 'edit',
                                  existingLog: log,
                                  logToEdit: log,
                                  companyId: log.company_id
                                });
                              } else {
                                setIsActivityDrawerOpen(true);
                              }
                            }}
                            title="Edit"
                            className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {canEditOrDeleteRecord(user, log, activeWorkspace?.id) && (
                            <button
                              onClick={async () => {
                                const confirmDelete = await askConfirm('Delete Interaction Log', 'Are you sure you want to delete this interaction log? It will be moved to the Trash Bin.', true, 'Delete', 'Cancel');
                                if (confirmDelete) {
                                  try {
                                    await safeUpdateDoc('call_logs', log.id!, {
                                      is_deleted: true,
                                      deleted_at: new Date().toISOString(),
                                      deleted_by_uid: user?.uid || null,
                                      deleted_by_name: user?.full_name || user?.username || 'Unknown'
                                    });
                                    if (setCallLogs) {
                                      setCallLogs(prev => prev.filter(l => l.id !== log.id));
                                    }
                                    triggerToast('Log entry deleted successfully', 'success');
                                  } catch (err) {
                                    triggerToast('Failed to delete log entry', 'error');
                                  }
                                }

                              }}
                              title="Delete"
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition bg-slate-50 hover:bg-rose-50 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                          Restricted View
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                  <thead className="bg-slate-50 dark:bg-slate-950/50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3 text-center">Temp</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Status / Outcome</th>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {paginatedLogs.map((log) => {
                      const isSelected = !!(log.id && selectedLogIds.includes(log.id));
                      const handledBy = getWorkspaceInitials(log.handled_by_team_member_name || log.logged_by || log.sales_person, salespersons, user, activeWorkspace);
                      const company = companies?.find(c => c.id === log.company_id);
                      
                      return (
                        <tr key={log.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(chk) => {
                                if (!log.id) return;
                                if (chk.target.checked) setSelectedLogIds(prev => [...prev, log.id!]);
                                else setSelectedLogIds(prev => prev.filter(id => id !== log.id));
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                            {formatActivityDate(log.date || log.createdAt)}
                          </td>
                          <td 
                            className={`px-4 py-3 font-semibold hover:text-blue-600 transition cursor-pointer ${log.company_name ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500'}`}
                            onClick={() => {
                              if (log.company_id) {
                                setSelected360CompanyId(log.company_id);
                              }
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <span>{getResolvedCompanyName(log) || 'Unlinked'}</span>
                              <IndustryBadge company={company} size="sm" />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {log.company_id ? (
                              <div className="flex items-center justify-center">
                                <TemperatureBadge
                                  companyId={log.company_id}
                                  temperature={company?.temperature}
                                  isDnc={company?.is_dnc}
                                  variant="icon"
                                  size="sm"
                                  companies={companies}
                                  setCompanies={setCompanies}
                                />
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-xs font-mono">-</span>
                            )}
                          </td>
                          <td className={`px-4 py-3 ${log.status === 'Invalid Number' ? 'line-through text-red-400' : ''}`}>
                            {log.contact_name || log.contact_phone || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{log.status}</span>
                              <span className="text-[10px] text-slate-500">{log.outcome || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {handledBy}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                          {canUserClickRecord(user, log, salespersons, activeWorkspace?.id) ? (
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  onClick={() => {
                                    setSelectedDetailEntry(log);
                                  }}
                                  title="View Details"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingLog(log);
                                    setDrawerMode('edit');
                                    if (onOpenActivityDrawer) {
                                      onOpenActivityDrawer({ 
                                        channel: log.channel || 'Call', 
                                        drawerMode: 'edit',
                                        existingLog: log,
                                        logToEdit: log,
                                        companyId: log.company_id
                                      });
                                    } else {
                                      setIsActivityDrawerOpen(true);
                                    }
                                  }}
                                  title="Edit"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {canEditOrDeleteRecord(user, log, activeWorkspace?.id) && (
                                  <button
                              onClick={async () => {
                                const confirmDelete = await askConfirm('Delete Interaction Log', 'Are you sure you want to delete this interaction log? It will be moved to the Trash Bin.', true, 'Delete', 'Cancel');
                                if (confirmDelete) {
                                  try {
                                    await safeUpdateDoc('call_logs', log.id!, {
                                      is_deleted: true,
                                      deleted_at: new Date().toISOString(),
                                      deleted_by_uid: user?.uid || null,
                                      deleted_by_name: user?.full_name || user?.username || 'Unknown'
                                    });
                                    if (setCallLogs) {
                                      setCallLogs(prev => prev.filter(l => l.id !== log.id));
                                    }
                                    triggerToast('Log entry deleted successfully', 'success');
                                  } catch (err) {
                                    triggerToast('Failed to delete log entry', 'error');
                                  }
                                }

                                    }}
                                    title="Delete"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 transition bg-slate-50 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold">Restricted</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            {paginatedLogs.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800">
                No call log entries match the search or filters.
              </div>
            )}
            
            {paginatedLogs.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl mt-4 gap-4">
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Showing <span className="font-bold text-slate-950 dark:text-slate-100">{Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}</span> to{' '}
                  <span className="font-bold text-slate-950 dark:text-slate-100">{Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}</span> of{' '}
                  <span className="font-bold text-slate-950 dark:text-slate-100">{totalItems}</span> logs
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Show:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItemsPerPage(val === 'All' ? 'All' : Number(val));
                        setCurrentPage(1);
                      }}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                      <option value="All">All</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" />
                    </button>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-w-[3rem] text-center">
                      {currentPage} / {itemsPerPage === 'All' ? 1 : Math.ceil(totalItems / itemsPerPage) || 1}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={itemsPerPage === 'All' || currentPage >= Math.ceil(totalItems / itemsPerPage)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLOATING BULK DELETION ACTION BAR FOR CALL LOGS */}
      {selectedLogIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-950 text-white rounded-2xl shadow-2xl py-3 px-5 border border-slate-800 flex items-center space-x-6 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-300 font-sans">
              Selected <span className="text-white font-bold bg-slate-800 px-2 py-0.5 rounded font-mono">{selectedLogIds.length}</span> log records
            </span>
          </div>
          <div className="flex items-center space-x-2.5 font-sans">
            <button
              onClick={() => setSelectedLogIds([])}
              className="py-1 px-3 bg-transparent border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (getUserWorkspaceRole(user, activeWorkspace?.id, activeWorkspace) === 'Viewer') {
                  triggerToast('Read-only viewers cannot delete records.', 'error');
                  return;
                }
                const confirmDelete = await askConfirm(
                  'Bulk Delete Interaction Records',
                  `Are you sure you want to delete ALL ${selectedLogIds.length} selected interaction records? This is permanent.`,
                  true,
                  'Delete All',
                  'Cancel'
                );
                if (!confirmDelete) return;

                try {
                  for (const id of selectedLogIds) {
                    await safeUpdateDoc('call_logs', id, {
                      is_deleted: true,
                      deleted_at: new Date().toISOString(),
                      deleted_by_uid: user?.uid || null,
                      deleted_by_name: user?.full_name || user?.username || 'Unknown'
                    });
                  }
                  if (setCallLogs) {
                    setCallLogs((prev) => prev.filter((l) => !selectedLogIds.includes(l.id!)));
                  }
                  triggerToast(`Successfully deleted ${selectedLogIds.length} records`, 'success');
                  setSelectedLogIds([]);
                } catch (err: any) {
                  triggerToast(`Bulk delete failed: ${err.message}`, 'error');
                }
              }}
              className="py-1 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-sm cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* FAST IN-QUEUE LOGGING DRAWER / MODAL - DEPRECATED IN FAVOR OF QUICKACTIVITYDRAWER */}

      {/* FULL LOG / SCHEDULE CALL MODAL DEPRECATED IN FAVOR OF QUICK ACTIVITY DRAWER */}
      {false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full transition-all duration-200 overflow-hidden flex flex-col max-h-[92vh] ${isHistorySidePanelExpanded ? 'max-w-6xl' : 'max-w-3xl'}`}>
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {selectedEntry ? 'Edit Call Log Entry' : 'Log or Schedule New Call'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Workspace: {activeWorkspace.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsHistorySidePanelExpanded(!isHistorySidePanelExpanded)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 transition flex items-center space-x-1.5"
                  title={isHistorySidePanelExpanded ? "Hide History Panel" : "Show History Panel"}
                >
                  <History className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isHistorySidePanelExpanded ? 'Hide History' : 'View History'}</span>
                </button>
                <button
                  onClick={() => setShowLogModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              <form onSubmit={handleSaveFullLogModal} className="flex-1 p-6 overflow-y-auto space-y-4 font-sans">
              {/* Interaction Type Mode Switcher */}
              <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleChannelSwitch('call')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                    logFormInteractionType === 'call'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Phone Call</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChannelSwitch('email')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                    logFormInteractionType === 'email'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span>Email Log</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChannelSwitch('message')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                    logFormInteractionType === 'message'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Message (SMS/WhatsApp)</span>
                </button>
              </div>

              {/* Mode-Specific Header Fields */}
              {logFormInteractionType === 'email' && (
                <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200 space-y-3">
                  <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <Mail className="w-4 h-4 text-purple-600" />
                    <span>Email Communication Details</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 uppercase mb-1">
                        Email Subject Line *
                      </label>
                      <input
                        type="text"
                        required={logFormInteractionType === 'email'}
                        value={logFormEmailSubject}
                        onChange={(e) => setLogFormEmailSubject(e.target.value)}
                        placeholder="e.g. Quotation Request / Price Inquiry..."
                        className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 uppercase mb-1">
                        Recipient / Sender Email Address
                      </label>
                      <input
                        type="email"
                        value={logFormEmailAddress}
                        onChange={(e) => setLogFormEmailAddress(e.target.value)}
                        placeholder="e.g. contact@clientcompany.com"
                        className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {logFormInteractionType === 'message' && (
                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>Message Channel & Platform</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-900 uppercase mb-1">
                        Platform / App *
                      </label>
                      <select
                        value={logFormMessagePlatform}
                        onChange={(e) => setLogFormMessagePlatform(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-emerald-200 rounded-lg bg-white font-semibold"
                      >
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="SMS">SMS / Mobile Message</option>
                        <option value="Direct Message">Direct Message (LinkedIn / Web)</option>
                        <option value="WeChat">WeChat</option>
                        <option value="Other">Other Messaging App</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-900 uppercase mb-1">
                        Target Mobile / Handle
                      </label>
                      <input
                        type="text"
                        value={logFormPhone}
                        onChange={(e) => setLogFormPhone(e.target.value)}
                        placeholder="e.g. +971 50 123 4567"
                        className="w-full px-3 py-2 text-xs border border-emerald-200 rounded-lg bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Phone Resolution Engine Input (When Mode is Call or Phone) */}
              {logFormInteractionType === 'call' && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-blue-600" />
                    <span>Phone Number Resolution Engine</span>
                  </label>
                  <input
                    type="tel"
                    value={logFormPhone}
                    onChange={(e) => handlePhoneInputChange(e.target.value)}
                    placeholder="Enter phone number (e.g. +971 50 123 4567)..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Company Lines Selector */}
                  {(() => {
                    const comp = logFormCompanyId ? companyMap.get(logFormCompanyId) : null;
                    const compPhones = comp ? getCompanyPhones(comp) : [];
                    if (compPhones.length === 0) return null;
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Company Lines:</span>
                        {compPhones.map((p, idx) => (
                          <button
                            key={`cl_cp_${idx}`}
                            type="button"
                            onClick={() => handlePhoneInputChange(p.number)}
                            className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-mono border border-blue-200 transition cursor-pointer flex items-center gap-1 font-bold"
                            title={`Set phone number to ${p.label || 'Company Line'}: ${p.number}`}
                          >
                            <span className="opacity-70 font-normal">{p.label || 'Main'}:</span>
                            <span>{p.number}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                {/* Resolution Engine Banner */}
                {resolutionState.matchedType === 'exact_contact' && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{resolutionState.message}</span>
                  </div>
                )}

                {resolutionState.matchedType === 'company_only' && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold space-y-2">
                    <div className="flex items-center space-x-2">
                      <Building className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{resolutionState.message}</span>
                    </div>
                  </div>
                )}

                {resolutionState.matchedType === 'conflict' && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold space-y-2">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{resolutionState.message}</span>
                    </div>
                  </div>
                )}

                {resolutionState.matchedType === 'none' && logFormPhone.length >= 4 && (
                  <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs flex items-center justify-between">
                    <span>{resolutionState.message}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setInlineCompName('');
                        setInlineContactName('');
                        setShowInlineCompanyCreate(true);
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition"
                    >
                      + 1-Click Create Company
                    </button>
                  </div>
                )}

                {/* Inline 1-Click Company Creator */}
                {showInlineCompanyCreate && (
                  <div className="p-4 rounded-xl bg-white border border-blue-300 space-y-3 shadow-md animate-fade-in font-sans">
                    <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center space-x-1.5">
                      <Building className="w-3.5 h-3.5 text-blue-600" />
                      <span>Quick Create New Company & Contact</span>
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Company Name *
                        </label>
                        <input
                          type="text"
                          value={inlineCompName}
                          onChange={(e) => setInlineCompName(e.target.value)}
                          placeholder="e.g. Acme Industrial"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Legal Suffix
                        </label>
                        <select
                          value={inlineCompSuffix}
                          onChange={(e) => setInlineCompSuffix(e.target.value as LegalSuffix)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          {['None / To Be Added Later', 'LLC', 'FZE', 'FZC', 'Co. LLC', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Heat Temperature
                        </label>
                        <select
                          value={inlineTemperature}
                          onChange={(e) => setInlineTemperature(e.target.value as any)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
                        >
                          <option value="Hot">🔥 Hot</option>
                          <option value="Warm">☀️ Warm</option>
                          <option value="Cold">❄️ Cold</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          City / Area
                        </label>
                        <input
                          type="text"
                          value={inlineCity}
                          onChange={(e) => setInlineCity(e.target.value)}
                          placeholder="Dubai"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Country
                        </label>
                        <input
                          type="text"
                          value={inlineCountry}
                          onChange={(e) => setInlineCountry(e.target.value)}
                          placeholder="UAE"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Phone Label / Type
                        </label>
                        <select
                          value={inlinePhoneLabel}
                          onChange={(e) => setInlinePhoneLabel(e.target.value as any)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="Telephone">Telephone</option>
                          <option value="Mobile">Mobile</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Direct">Direct</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Contact Person (Optional)
                        </label>
                        <input
                          type="text"
                          value={inlineContactName}
                          onChange={(e) => setInlineContactName(e.target.value)}
                          placeholder="e.g. John Doe"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Designation / Job Title
                        </label>
                        <input
                          type="text"
                          value={inlineCompContactDesignation}
                          onChange={(e) => setInlineCompContactDesignation(e.target.value)}
                          placeholder="e.g. Procurement Manager"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowInlineCompanyCreate(false);
                          resetInlineCompanyForm();
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handle1ClickCreateCompany}
                        className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm transition"
                      >
                        Save & Link
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Performed / Handled By Team Member Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Users2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Performed / Handled By (Team Member) *</span>
                </label>
                <select
                  value={logFormHandledBy}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLogFormHandledBy(val);
                    if (val === user.username) {
                      setLogFormHandledByName(user.full_name || user.username);
                    } else {
                      const sp = (salespersons || []).find((s) => s.id === val || s.initials === val);
                      if (sp) setLogFormHandledByName(sp.full_name);
                    }
                  }}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-semibold bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value={user.username}>[Current Logged-in User] {user.full_name || user.username}</option>
                  {(salespersons || []).map((sp) => (
                    <option key={sp.id || sp.initials} value={sp.id || sp.initials}>
                      Team Member: {sp.full_name} ({sp.initials}) - {sp.role}
                    </option>
                  ))}
                </select>
              </div>

              {/* Company & Contact Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Target Company
                  </label>
                  <select
                    value={logFormCompanyId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setLogFormCompanyId(cid);
                      const comp = companyMap.get(cid);
                      setLogFormCompanyName(comp?.display_name || comp?.canonical_name || '');
                      setLogFormContactId('');
                      setLogFormContactName('Company Direct / General Line');
                      if (comp) {
                        const phones = getCompanyPhones(comp);
                        if (phones.length > 0) {
                          setLogFormPhone(phones[0].number);
                        } else if (comp.general_phone) {
                          setLogFormPhone(comp.general_phone);
                        }

                        const options = activeWorkspace.geography_options || [];
                        const match = options.find((g) => {
                          const lowerG = g.toLowerCase();
                          return (
                            (comp.city && lowerG.includes(comp.city.toLowerCase())) ||
                            (comp.country && lowerG.includes(comp.country.toLowerCase()))
                          );
                        });
                        if (match) {
                          setLogFormGeography(match);
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-semibold bg-white"
                  >
                    <option value="">(Unassigned / Link Later)</option>
                    {workspaceCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name || c.canonical_name} {c.is_dnc ? '(DNC)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Contact Person
                  </label>
                  <select
                    value={showInlineContactCreate ? 'ADD_NEW_CONTACT' : (logFormContactId || 'COMPANY_DIRECT')}
                    onChange={(e) => {
                      const ctid = e.target.value;
                      if (ctid === 'ADD_NEW_CONTACT') {
                        setShowInlineContactCreate(true);
                        setInlineContactFullName('');
                        setInlineContactMobile(logFormPhone || '');
                        return;
                      }
                      setShowInlineContactCreate(false);
                      if (!ctid || ctid === 'COMPANY_DIRECT') {
                        setLogFormContactId('');
                        setLogFormContactName('Company Direct / General Line');
                        const comp = companyMap.get(logFormCompanyId);
                        if (comp) {
                          const phones = getCompanyPhones(comp);
                          if (phones.length > 0) setLogFormPhone(phones[0].number);
                          else if (comp.general_phone) setLogFormPhone(comp.general_phone);
                        }
                      } else {
                        setLogFormContactId(ctid);
                        const ct = contactMap.get(ctid);
                        setLogFormContactName(ct?.full_name || '');
                        if (ct?.mobile) setLogFormPhone(ct.mobile);
                        else if (ct?.landline) setLogFormPhone(ct.landline);
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-semibold bg-white"
                  >
                    <option value="COMPANY_DIRECT">-- Direct Company Line --</option>
                    <option value="ADD_NEW_CONTACT" className="font-bold text-blue-600 bg-blue-50">+ Add New Contact Person...</option>
                    {workspaceContacts
                      .filter((c) => !logFormCompanyId || c.company_id === logFormCompanyId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} {c.designation ? `(${c.designation})` : ''} {c.mobile ? `- ${c.mobile}` : ''} {c.is_dnc ? '(DNC)' : ''}
                        </option>
                      ))}
                  </select>

                  {/* Inline Contact Creator Panel */}
                  {showInlineContactCreate && (
                    <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3 mt-2 font-sans animate-fade-in">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center space-x-1">
                          <Users2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Quick Add New Contact Person</span>
                        </h5>
                        <button
                          type="button"
                          onClick={() => setShowInlineContactCreate(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                            Full Name *
                          </label>
                          <input
                            type="text"
                            value={inlineContactFullName}
                            onChange={(e) => setInlineContactFullName(e.target.value)}
                            placeholder="e.g. John Smith"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                            Designation / Job Title
                          </label>
                          <input
                            type="text"
                            value={inlineContactDesignation}
                            onChange={(e) => setInlineContactDesignation(e.target.value)}
                            placeholder="e.g. Procurement Manager"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                            Mobile / Direct Phone
                          </label>
                          <input
                            type="text"
                            value={inlineContactMobile}
                            onChange={(e) => setInlineContactMobile(e.target.value)}
                            placeholder="e.g. +971 50 123 4567"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={inlineContactEmail}
                            onChange={(e) => setInlineContactEmail(e.target.value)}
                            placeholder="e.g. john@company.com"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={inlineContactIsPrimary}
                            onChange={(e) => setInlineContactIsPrimary(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>Mark as Primary Contact</span>
                        </label>

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setShowInlineContactCreate(false)}
                            className="px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleInlineCreateContact}
                            disabled={isSavingInlineContact}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center space-x-1"
                          >
                            {isSavingInlineContact && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>Save & Link Contact</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DNC Alert Banner if selected record is DNC */}
              {(companyMap.get(logFormCompanyId)?.is_dnc || contactMap.get(logFormContactId)?.is_dnc) && (
                <div className="p-3.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center space-x-2 animate-pulse">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>
                    WARNING: THIS RECORD IS MARKED AS DO NOT CALL (DNC). Queue entries for this contact are suppressed.
                  </span>
                </div>
              )}

              {/* Status, Date, Geography */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {logFormInteractionType === 'email' ? 'Email Date *' : logFormInteractionType === 'message' ? 'Message Date *' : 'Call Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={logFormDate}
                    onChange={(e) => setLogFormDate(e.target.value)}
                    max={todayStr}
                    style={{ colorScheme: 'dark' }}
                    className="[color-scheme:dark] w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 rounded-xl font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {logFormInteractionType === 'email' ? 'Email Status *' : logFormInteractionType === 'message' ? 'Delivery Status *' : 'Call Status *'}
                  </label>
                  <select
                    value={logFormStatus}
                    onChange={(e: any) => {
                      if (e.target.value === '___ADD_NEW___') {
                        setShowAddCustomStatus(true);
                      } else {
                        setLogFormStatus(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-semibold"
                  >
                    {contextualStatuses.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                    <option value="___ADD_NEW___">+ Add Custom Status...</option>
                  </select>

                  {showAddCustomStatus && (
                    <div className="mt-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center space-x-2 animate-fade-in">
                      <input
                        type="text"
                        value={newCustomStatus}
                        onChange={(e) => setNewCustomStatus(e.target.value)}
                        placeholder="New status name..."
                        className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomStatus}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddCustomStatus(false)}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 truncate" title="Location (Company Registered)">
                    Location
                  </label>
                  <input
                    type="text"
                    value={logFormGeography}
                    onChange={(e) => setLogFormGeography(e.target.value)}
                    placeholder="e.g., Dubai, UAE or Singapore"
                    className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl font-semibold bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Call Purpose / Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Call Purpose / Category
                </label>
                <select
                  value={logFormPurpose}
                  onChange={(e) => setLogFormPurpose(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-semibold bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Validation">Validation</option>
                  <option value="Prospecting / Cold Outreach">Prospecting / Cold Outreach</option>
                  <option value="Quote / Proposal Follow-Up">Quote / Proposal Follow-Up</option>
                  <option value="Order / PO Confirmation">Order / PO Confirmation</option>
                  <option value="Technical Support / Product Enquiry">Technical Support / Product Enquiry</option>
                  <option value="Payment / Invoice Collection">Payment / Invoice Collection</option>
                  <option value="Relationship Maintenance / Courtesy Call">Relationship Maintenance / Courtesy Call</option>
                  <option value="Complaint / Issue Resolution">Complaint / Issue Resolution</option>
                  <option value="General Inquiry">General Inquiry</option>
                </select>
              </div>

              {/* Outcome (Preset & Custom) */}
              {!(logFormInteractionType === 'email' || logFormInteractionType === 'message') && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Call Outcome (1-Click Preset)
                </label>
                
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {contextualOutcomes.map((oc) => {
                    const isRed = oc.toLowerCase().includes('dnc') || oc.toLowerCase().includes('bounced');
                    const isGreen = oc.toLowerCase().includes('interested') || oc.toLowerCase().includes('deal');
                    const isBlue = oc.toLowerCase().includes('quote') || oc.toLowerCase().includes('proposal') || oc.toLowerCase().includes('sent');
                    const isAmber = oc.toLowerCase().includes('follow') || oc.toLowerCase().includes('awaiting');
                    const color = isRed
                      ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                      : isGreen
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : isBlue
                      ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                      : isAmber
                      ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                      : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200';
                    return (
                      <button
                        key={oc}
                        type="button"
                        onClick={() => setLogFormOutcome(oc)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${color} ${
                          logFormOutcome === oc ? 'ring-2 ring-blue-600 scale-105 shadow-sm' : 'opacity-80'
                        }`}
                      >
                        {oc}
                      </button>
                    );
                  })}
                </div>

                <select
                  value={logFormOutcome}
                  onChange={(e) => {
                    if (e.target.value === '___ADD_NEW___') {
                      setShowAddCustomOutcome(true);
                    } else {
                      setLogFormOutcome(e.target.value);
                    }
                  }}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="">(None / Select Outcome)</option>
                  {contextualOutcomes.map((oc) => (
                    <option key={oc} value={oc}>
                      {oc}
                    </option>
                  ))}
                  <option value="___ADD_NEW___">+ Add Custom Outcome...</option>
                </select>

                {showAddCustomOutcome && (
                  <div className="mt-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center space-x-2 animate-fade-in">
                    <input
                      type="text"
                      value={newCustomOutcome}
                      onChange={(e) => setNewCustomOutcome(e.target.value)}
                      placeholder="New outcome name..."
                      className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCustomOutcome('log')}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCustomOutcome(false)}
                      className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* Optional Link to Enquiry (if Enquiries Enabled) */}
              {activeWorkspace.modules?.enquiriesEnabled !== false && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Link to Enquiry Proposal (Optional)
                  </label>
                  <select
                    value={logFormEnquiryId}
                    onChange={(e) => setLogFormEnquiryId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="">None / Independent Call</option>
                    {workspaceEnquiries.map((enq) => (
                      <option key={enq.id} value={enq.id}>
                        Ref: {enq.quote_ref_no || `SN#${enq.sn}`} - {enq.subject || 'Enquiry'} ({enq.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Requirement / Notes
                </label>
                <textarea
                  rows={3}
                  value={logFormNotes}
                  onChange={(e) => setLogFormNotes(e.target.value)}
                  placeholder="Details of customer request or call transcript..."
                  className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(logFormStatus) 
                    ? 'Scheduled Target Date *' 
                    : 'Schedule Next Follow-Up Date (Optional)'}
                </label>
                <input
                  type="date"
                  required={['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(logFormStatus)}
                  value={logFormFollowupDate}
                  onChange={(e) => setLogFormFollowupDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="[color-scheme:dark] w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 rounded-xl font-semibold"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{formSaving ? 'Saving...' : 'Save Call Entry'}</span>
                </button>
              </div>
            </form>

            {/* SEPARATE SIDE PANEL: Contact History & Duplicate Outreach Check */}
            {isHistorySidePanelExpanded && (
              <div className="w-full md:w-80 xl:w-96 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 flex flex-col shrink-0 overflow-hidden font-sans">
                <div className="p-3.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                      Outreach & History Panel
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHistorySidePanelExpanded(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
                    title="Collapse Side Panel"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {(() => {
                    const isOwnDataOnly = user.role !== 'Admin' && user.dataVisibilityScope === 'OWN_DATA_ONLY';
                    const isBasicTier = user.role !== 'Admin' && user.dataVisibilityTier === 'BASIC';

                    const pastLogs = (workspaceCallLogs || []).filter((cl) => {
                      if (isOwnDataOnly && !isRecordOwner(user, cl)) return false;
                      return (
                        (logFormCompanyId && cl.company_id === logFormCompanyId) ||
                        (logFormContactId && cl.contact_id === logFormContactId) ||
                        (logFormPhone && cl.contact_phone && cl.contact_phone.includes(logFormPhone))
                      );
                    });

                    const pastEnqs = (workspaceEnquiries || []).filter((enq) => {
                      if (isOwnDataOnly && !isRecordOwner(user, enq)) return false;
                      return (
                        (logFormCompanyId && enq.company_id === logFormCompanyId) ||
                        (logFormContactId && enq.contact_id === logFormContactId)
                      );
                    });

                    if (pastLogs.length === 0 && pastEnqs.length === 0) {
                      return (
                        <div className="py-12 text-center text-slate-400 text-xs font-medium space-y-2">
                          <History className="w-8 h-8 text-slate-300 mx-auto" />
                          <p className="font-bold text-slate-600">No Existing History</p>
                          <p className="text-[11px] text-slate-400 leading-relaxed px-2">
                            Select a company, contact, or enter a phone number to view previous outreach and proposal history in real time.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                          <span>Linked Account History:</span>
                          <span className="font-bold text-blue-700">{pastLogs.length} Calls • {pastEnqs.length} Proposals</span>
                        </div>

                        {pastLogs.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                              Call Operations ({pastLogs.length})
                            </span>
                            <div className="space-y-2">
                              {pastLogs.map((pl) => {
                                const canClick = canUserClickRecord(user, pl, salespersons);
                                return (
                                  <div
                                    key={pl.id}
                                    onClick={() => {
                                      if (canClick) setSelectedDetailEntry(pl);
                                    }}
                                    className={`p-2.5 rounded-xl bg-white border border-slate-200 text-xs shadow-2xs space-y-1 transition ${
                                      canClick ? 'hover:border-blue-400 hover:shadow-md cursor-pointer group' : 'opacity-90'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-bold text-slate-900 font-mono">{pl.date}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                        {pl.status}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 font-medium">Logged by: {pl.logged_by || 'Staff'}</p>
                                    {pl.contact_name && <p className="text-[11px] text-slate-500">Contact: {pl.contact_name}</p>}
                                    {pl.notes && <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1 line-clamp-2">"{pl.notes}"</p>}
                                    {canClick ? (
                                      <div className="text-[10px] font-bold text-blue-600 group-hover:underline flex items-center justify-end space-x-1 pt-1">
                                        <span>View Details</span>
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

                        {pastEnqs.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-200/60">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                              Proposals & Quotes ({pastEnqs.length})
                            </span>
                            <div className="space-y-2">
                              {pastEnqs.map((pe) => {
                                const canClick = canUserClickRecord(user, pe, salespersons);
                                const spName = getSalespersonFullName(pe.sales_person, salespersons);
                                return (
                                  <div
                                    key={pe.id}
                                    onClick={() => {
                                      if (canClick && onSelectEnquiry && pe.id) {
                                        onSelectEnquiry(pe.id);
                                      }
                                    }}
                                    className={`p-2.5 rounded-xl bg-white border border-slate-200 text-xs shadow-2xs space-y-1 transition ${
                                      canClick ? 'hover:border-purple-400 hover:shadow-md cursor-pointer group' : 'opacity-90'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-bold text-slate-900 font-mono">{pe.quote_ref_no || `SN#${pe.sn}`}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                                        {pe.status || 'Active'}
                                      </span>
                                    </div>
                                    {pe.subject && <p className="text-[11px] text-slate-700 font-semibold">{pe.subject}</p>}
                                    <p className="text-[10px] text-slate-500">
                                      Logged by: <strong className="text-slate-800">{spName}</strong> {!isBasicTier && pe.value_aed ? `• AED ${pe.value_aed.toLocaleString()}` : ''}
                                    </p>
                                    {canClick ? (
                                      <div className="text-[10px] font-bold text-purple-600 group-hover:underline flex items-center justify-end space-x-1 pt-1">
                                        <span>Open Proposal</span>
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
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Historical Data Diagnostic Modal */}
      <PhoneDataDiagnosticModal
        isOpen={showDiagnosticModal}
        onClose={() => setShowDiagnosticModal(false)}
        enquiries={workspaceEnquiries}
        companies={workspaceCompanies}
        contacts={workspaceContacts}
      />

      {/* Call Log Detail Modal */}
      <CallLogDetailModal
        entry={selectedDetailEntry}
        onClose={() => {
          setSelectedDetailEntry(null);
          setShowLogModal(false);
        }}
        onScheduleFollowUp={() => {
          const viewingLog = selectedDetailEntry;
          setSelectedDetailEntry(null);
          setShowLogModal(false);
          setDrawerMode('create');
          setEditingLog(null);
          if (onOpenActivityDrawer) {
            onOpenActivityDrawer({
              companyId: viewingLog?.company_id || undefined,
              contactId: viewingLog?.contact_id || undefined,
              existingLog: null,
              logToEdit: null,
              drawerMode: 'create'
            });
          }
        }}
        callLogs={callLogs}
        activeWorkspace={activeWorkspace}
        triggerToast={triggerToast}
        onLeadConverted={(updatedEntry, newCompany, newContact) => {
          if (setCompanies) {
            setCompanies((prev) => [newCompany, ...prev.filter((c) => c.id !== newCompany.id)]);
          }
          if (setContacts) {
            setContacts((prev) => [newContact, ...prev.filter((c) => c.id !== newContact.id)]);
          }
          if (setCallLogs) {
            setCallLogs((prev) => prev.map((l) => (l.id === updatedEntry.id ? updatedEntry : l)));
          }
          setSelectedDetailEntry(updatedEntry);
          setShowLogModal(false);
        }}
        onEdit={(entry) => {
          setSelectedDetailEntry(null);
          setShowLogModal(false);
          setDrawerMode('edit');
          setEditingLog(entry);
          if (onOpenActivityDrawer) {
            onOpenActivityDrawer({ existingLog: entry, logToEdit: entry, drawerMode: 'edit' });
          }
        }}
        onDelete={async (id) => {
          const confirmDelete = await askConfirm(
            'Delete Call Log Entry',
            'Are you sure you want to delete this call log entry? This action cannot be undone.',
            true,
            'Delete Entry'
          );
          if (confirmDelete) {
            await safeUpdateDoc('call_logs', id, {
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid || null,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            });
            if (setCallLogs) {
              setCallLogs((prev) => prev.filter((x) => x.id !== id));
            }
            setSelectedDetailEntry(null);
            setShowLogModal(false);
            triggerToast('Call log entry deleted', 'info');
          }
        }}
        onOpenCompany360={(companyId) => {
          setSelectedDetailEntry(null);
          setShowLogModal(false);
          setSelected360CompanyId(companyId);
        }}
        onLogFollowup={(entry) => {
          setSelectedDetailEntry(null);
          setSelectedEntry(null);
          setLogFormDate(todayStr);
          setLogFormCompanyId(entry.company_id || '');
          setLogFormCompanyName(entry.company_name || '');
          setLogFormContactId(entry.contact_id || '');
          setLogFormContactName(entry.contact_name || '');
          setLogFormPhone(entry.contact_phone || '');
          setLogFormStatus('Scheduled / Planned');
          setLogFormOutcome('Follow-Up Required');
          setLogFormNotes(`Follow-up to previous call on ${entry.date}: ${entry.requirement_notes || ''}`);
          setLogFormGeography(entry.geography || activeWorkspace.geography_options?.[0] || 'Dubai, UAE');
          setLogFormFollowupDate('');
          setLogFormEnquiryId(entry.enquiry_id || '');
          setResolutionState({ matchedType: 'none', message: '' });
          setShowInlineCompanyCreate(false);
          setShowLogModal(true);
        }}
        companies={workspaceCompanies}
        setCompanies={setCompanies}
        contacts={workspaceContacts}
        enquiries={workspaceEnquiries}
        currentUser={user}
      />

      {/* 360° Company View Modal */}
      <Company360Modal
        companyId={selected360CompanyId}
        companies={workspaceCompanies}
        setCompanies={setCompanies}
        contacts={workspaceContacts}
        enquiries={workspaceEnquiries}
        callLogs={callLogs}
        user={user}
        activeWorkspace={activeWorkspace}
        onClose={() => setSelected360CompanyId(null)}
        onEditCompany={(company) => {
          setSelected360CompanyId(null);
          if (onEditCompany) {
            onEditCompany(company);
          }
        }}
        onOpenActivityDrawer={onOpenActivityDrawer}
        onLogCallForCompany={(company) => {
          setSelectedEntry(null);
          setLogFormDate(todayStr);
          setLogFormStatus('Scheduled');
          setLogFormOutcome('Follow-Up Required');
          setLogFormPhone(company.general_phone || '');
          setLogFormCompanyId(company.id || '');
          setLogFormCompanyName(company.display_name);
          setLogFormContactId('');
          setLogFormContactName('');
          setLogFormEnquiryId('');
          setLogFormNotes('');
          setLogFormFollowupDate('');
          
          const options = activeWorkspace.geography_options || [];
          const match = options.find((g) => {
            const lowerG = g.toLowerCase();
            return (
              (company.city && lowerG.includes(company.city.toLowerCase())) ||
              (company.country && lowerG.includes(company.country.toLowerCase()))
            );
          });
          setLogFormGeography(match || activeWorkspace.geography_options?.[0] || 'Dubai, UAE');
          setResolutionState({ matchedType: 'none', message: '' });
          setShowInlineCompanyCreate(false);
          setShowLogModal(true);
        }}
      />

      {/* Call Operations Report Modal */}
      <CallLogReportModal
        isOpen={showReportExportModal}
        onClose={() => setShowReportExportModal(false)}
        callLogs={workspaceCallLogs}
        activeWorkspace={activeWorkspace}
        callStatuses={callStatuses}
        callOutcomes={callOutcomes}
        salespersons={Array.from(
          new Set(
            workspaceCallLogs
              .map((l) => l.logged_by)
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          )
        ).map((s: string): Salesperson => ({
          full_name: s,
          role: 'Operator'
        }))}
      />

      {/* Embedded Quick Activity Drawer for in-component direct rendering & fallback */}
      <QuickActivityDrawer
        isOpen={isActivityDrawerOpen}
        onClose={() => {
          setIsActivityDrawerOpen(false);
          setEditingLog(null);
        }}
        drawerMode={drawerMode}
        existingLog={editingLog}
        logToEdit={editingLog}
        companyId={editingLog?.company_id}
        companyName={editingLog?.company_name || editingLog?.unlinked_name}
        contactId={editingLog?.contact_id}
        contactName={editingLog?.contact_name}
        contactPhone={editingLog?.contact_phone}
        enquiryId={editingLog?.enquiry_id}
        initialChannel={editingLog?.channel}
        initialStatus={editingLog?.status}
        activeWorkspaceId={activeWorkspace.id}
        currentSalespersonId={user?.uid || user?.username || ''}
        currentUserInitials={user?.username?.slice(0, 2).toUpperCase() || 'OP'}
        currentUserUid={user?.uid}
        currentUserName={user?.full_name || user?.username || user?.email}
        user={user}
        companies={workspaceCompanies}
        contacts={workspaceContacts}
        enquiries={workspaceEnquiries}
        setCompanies={setCompanies}
        setContacts={setContacts}
        setCallLogs={setCallLogs}
        callStatuses={callStatuses}
        callOutcomes={callOutcomes}
        callPurposes={callPurposes}
        industryTypes={industryTypes}
        onSave={handleLogSaved}
        onUpdate={handleLogSaved}
        onSaveSuccess={() => {
          setIsActivityDrawerOpen(false);
          setEditingLog(null);
          triggerToast(drawerMode === 'execute' ? 'Task executed successfully!' : 'Activity updated successfully!', 'success');
        }}
      />

      {/* Live Execution Command Center Modal */}
      <LiveExecutionModal
        isOpen={Boolean(executionModalTask)}
        onClose={() => setExecutionModalTask(null)}
        task={executionModalTask}
        onSuccess={handleLogSaved}
        user={user}
        callLogs={workspaceCallLogs}
        contacts={workspaceContacts}
        companies={workspaceCompanies}
        enquiries={enquiries}
        setCompanies={setCompanies}
        setContacts={setContacts}
        setCallLogs={setCallLogs}
        callStatuses={callStatuses}
        callOutcomes={callOutcomes}
        callPurposes={callPurposes}
      />

      {/* Reusable Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-6 whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex items-center justify-end space-x-3 font-sans">
              <button
                type="button"
                onClick={() => {
                  confirmResolver?.(false);
                  setConfirmResolver(null);
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmResolver?.(true);
                  setConfirmResolver(null);
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer ${
                  confirmDialog.isDestructive
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
    </PageBody>
  </>
);
}
